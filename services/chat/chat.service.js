/**
 * services/chat/chat.service.js
 * Gestion de la messagerie interne d'équipe, échanges médias, réactions et accusés de lecture
 */

/**
 * Récupère l'historique des messages du salon selon le rôle de l'utilisateur
 */
async function recupererMessages({ pool }, { id_salon, role, id_employe }) {
    let query = `
        SELECT m.*, COALESCE(e.nom, CASE WHEN m.id_expediteur = -1 THEN 'Salon' ELSE 'Gérant' END) as nom_expediteur, e.photo_url as photo_expediteur 
        FROM messages m 
        LEFT JOIN employes e ON m.id_expediteur = e.id_employe AND e.id_salon = m.id_salon
        WHERE m.id_salon = $1
    `;
    const params = [id_salon];

    // SÉCURITÉ : Un employé récupère les messages généraux (0) et les messages privés le concernant
    if (role === 'employe') {
        query += ` AND (m.id_destinataire = 0 OR m.id_expediteur = $2 OR m.id_destinataire = $2)`;
        params.push(parseInt(id_employe, 10));
    }

    query += ` ORDER BY m.date_creation ASC`;
    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Envoie un nouveau message (texte, photo ou note vocale) avec diffusion WebSocket et notification push
 */
async function envoyerMessage({ pool, io, envoyerNotificationPush }, { id_salon, role, id_employe_auth, body }) {
    const { id_destinataire, contenu, fichier_url, reply_to } = body;
    const textePropre = typeof contenu === 'string' ? contenu.trim() : '';

    if (!textePropre && !fichier_url) {
        const err = new Error("Le message ne peut pas être vide.");
        err.status = 400;
        throw err;
    }
    if (textePropre.length > 5000) {
        const err = new Error("Le message dépasse la limite autorisée (5000 caractères).");
        err.status = 400;
        throw err;
    }

    if (fichier_url) {
        if (typeof fichier_url !== 'string' || fichier_url.length > 7500000) {
            const err = new Error("Fichier trop volumineux (max 5 Mo).");
            err.status = 400;
            throw err;
        }
        const mimeValide =
            /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(fichier_url) ||
            /^data:(audio|video)\/(webm|mp4|mpeg|ogg|wav|aac|x-m4a);/i.test(fichier_url) ||
            fichier_url.startsWith('https://');
        if (!mimeValide) {
            const err = new Error("Format de fichier non autorisé (Image ou Mémo vocal uniquement).");
            err.status = 400;
            throw err;
        }
    }

    const id_expediteur = role === 'employe' ? parseInt(id_employe_auth, 10) : (role === 'salon' ? -1 : null);

    // Ajoute automatiquement la colonne reply_to si nécessaire
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL`).catch(() => {});

    let nom_expediteur = 'Gérant';
    let photo_expediteur = null;
    if (role === 'employe') {
        const empRes = await pool.query('SELECT nom, photo_url FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_expediteur, id_salon]);
        if (empRes.rowCount === 0) {
            const err = new Error("Employé introuvable.");
            err.status = 403;
            throw err;
        }
        nom_expediteur = empRes.rows[0].nom;
        photo_expediteur = empRes.rows[0].photo_url;
    } else if (role === 'salon') {
        nom_expediteur = 'Salon';
    }

    let dest = null;
    if (id_destinataire === 'salon' || id_destinataire === 0 || id_destinataire === '0') {
        dest = 0;
    } else if (id_destinataire === 'gerant' || id_destinataire === null || id_destinataire === undefined || id_destinataire === '' || id_destinataire === -1) {
        dest = null;
    } else {
        const parsedDest = parseInt(id_destinataire, 10);
        if (isNaN(parsedDest)) {
            const err = new Error("Destinataire invalide.");
            err.status = 400;
            throw err;
        }
        const checkDest = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [parsedDest, id_salon]);
        if (checkDest.rowCount === 0) {
            const err = new Error("Destinataire introuvable dans ce salon.");
            err.status = 404;
            throw err;
        }
        dest = parsedDest;
    }

    const replyToPropre = (reply_to && typeof reply_to === 'object' && reply_to.id_message) ? {
        id_message: Number(reply_to.id_message),
        nom_expediteur: String(reply_to.nom_expediteur || 'Message').substring(0, 60),
        extrait: String(reply_to.extrait || '').substring(0, 140)
    } : null;

    const result = await pool.query(
        `INSERT INTO messages (id_salon, id_expediteur, id_destinataire, contenu, fichier_url, reply_to)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_message, date_creation`,
        [id_salon, id_expediteur, dest, textePropre, fichier_url || null, replyToPropre ? JSON.stringify(replyToPropre) : null]
    );

    const newMessage = {
        id_message: result.rows[0].id_message,
        id_salon,
        id_expediteur,
        id_destinataire: dest,
        contenu: textePropre,
        fichier_url: fichier_url || null,
        reply_to: replyToPropre,
        date_creation: result.rows[0].date_creation,
        nom_expediteur,
        photo_expediteur,
        reactions: {},
        vu_par: []
    };

    if (io) {
        const salonRoom = id_salon.toString();
        if (dest === 0) {
            io.to(salonRoom).to(`${salonRoom}_gerant`).to(`${salonRoom}_salon`).emit('nouveauMessage', newMessage);
        } else {
            let emitter = io.to(salonRoom).to(`${salonRoom}_gerant`).to(`${salonRoom}_salon`);
            if (id_expediteur && id_expediteur > 0) emitter = emitter.to(`${salonRoom}_emp_${id_expediteur}`);
            if (dest && dest > 0) emitter = emitter.to(`${salonRoom}_emp_${dest}`);
            emitter.emit('nouveauMessage', newMessage);
        }
    }

    if (envoyerNotificationPush) {
        let cibleNotif;
        if (dest === 0) cibleNotif = 'salon';
        else if (dest === null) cibleNotif = 'gerant';
        else cibleNotif = { type: 'employe', id_employe: dest };

        const estAudio = typeof fichier_url === 'string' && /^data:(audio|video)\//i.test(fichier_url);
        const apercuNotif = textePropre
            ? (textePropre.length > 40 ? textePropre.substring(0, 40) + '...' : textePropre)
            : (estAudio ? 'Vocal' : 'Photo envoyée');

        envoyerNotificationPush(id_salon, cibleNotif, {
            title: `Nouveau message de ${newMessage.nom_expediteur}`,
            body: apercuNotif,
            url: '/?tab=messagerie'
        });
    }

    return newMessage;
}

/**
 * Modifie le texte d'un message existant (auteur uniquement)
 */
async function modifierMessage({ pool, io }, { id_salon, role, id_employe_auth, id_message, body }) {
    const nouveauContenu = typeof body.contenu === 'string' ? body.contenu.trim() : '';
    if (!nouveauContenu) {
        const err = new Error("Le message ne peut pas être vide.");
        err.status = 400;
        throw err;
    }

    const id_expediteur = role === 'employe' ? parseInt(id_employe_auth, 10) : (role === 'salon' ? -1 : null);

    let updateRes;
    if (role === 'gerant') {
        updateRes = await pool.query(
            `UPDATE messages SET contenu = $1, modifie = TRUE WHERE id_message = $2 AND id_salon = $3 RETURNING id_message, contenu, modifie`,
            [nouveauContenu, id_message, id_salon]
        );
    } else {
        updateRes = await pool.query(
            `UPDATE messages SET contenu = $1, modifie = TRUE WHERE id_message = $2 AND id_salon = $3 AND id_expediteur IS NOT DISTINCT FROM $4 RETURNING id_message, contenu, modifie`,
            [nouveauContenu, id_message, id_salon, id_expediteur]
        );
    }

    if (updateRes.rowCount === 0) {
        const err = new Error("Action non autorisée ou message introuvable.");
        err.status = 403;
        throw err;
    }

    if (io) {
        io.to(id_salon.toString()).emit('messageModifie', {
            id_message: parseInt(id_message, 10),
            contenu: nouveauContenu,
            modifie: true
        });
    }

    return { message: "Message modifié", data: updateRes.rows[0] };
}

/**
 * Supprime un message
 */
async function supprimerMessage({ pool, io }, { id_salon, role, id_employe_auth, id_message }) {
    const id_expediteur = role === 'employe' ? parseInt(id_employe_auth, 10) : (role === 'salon' ? -1 : null);

    let deleteRes;
    if (role === 'gerant') {
        deleteRes = await pool.query(
            'DELETE FROM messages WHERE id_message = $1 AND id_salon = $2 RETURNING id_message',
            [id_message, id_salon]
        );
    } else {
        deleteRes = await pool.query(
            'DELETE FROM messages WHERE id_message = $1 AND id_salon = $2 AND id_expediteur IS NOT DISTINCT FROM $3 RETURNING id_message',
            [id_message, id_salon, id_expediteur]
        );
    }

    if (deleteRes.rowCount === 0) {
        const err = new Error("Action non autorisée ou message introuvable.");
        err.status = 403;
        throw err;
    }

    if (io) {
        io.to(id_salon.toString()).emit('messageSupprime', { id_message: parseInt(id_message, 10) });
    }

    return { message: "Message supprimé" };
}

/**
 * Marque un lot de messages comme lus
 */
async function marquerMessagesLus({ pool, io }, { id_salon, role, id_employe_auth, ids }) {
    const idsValides = Array.isArray(ids) ? ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n)) : [];
    if (idsValides.length === 0) return { message: "Rien à marquer." };

    const monId = role === 'employe' ? id_employe_auth : (role === 'salon' ? -1 : null);
    const monProfilId = role === 'employe' ? `emp_${id_employe_auth}` : (role === 'salon' ? 'salon' : 'gerant');

    const result = await pool.query(
        `UPDATE messages 
         SET vu_par = CASE 
             WHEN COALESCE(vu_par, '[]'::jsonb) @> to_jsonb($1::text) THEN COALESCE(vu_par, '[]'::jsonb) 
             ELSE COALESCE(vu_par, '[]'::jsonb) || to_jsonb($1::text) 
         END
         WHERE id_message = ANY($2::int[]) AND id_salon = $3 AND id_expediteur IS DISTINCT FROM $4
         RETURNING id_message, vu_par`,
        [monProfilId, idsValides, id_salon, monId]
    );

    if (io) {
        result.rows.forEach(row => {
            io.to(id_salon.toString()).emit('messageVu', { id_message: row.id_message, vu_par: row.vu_par });
        });
    }

    return { message: "Marqué comme vu." };
}

/**
 * Ajoute ou retire une réaction emoji sur un message
 */
async function reagirMessage({ pool, io }, { id_salon, role, id_employe_auth, id_message, emoji }) {
    const allowedEmojis = ['👍', '❤️', '😂', '🔥', '👏', '😢'];
    if (!emoji || !allowedEmojis.includes(emoji)) {
        const err = new Error("Émoji non valide.");
        err.status = 400;
        throw err;
    }

    const monProfilId = role === 'employe' ? `emp_${id_employe_auth}` : (role === 'salon' ? 'salon' : 'gerant');
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const msgRes = await clientDB.query(
            'SELECT reactions FROM messages WHERE id_message = $1 AND id_salon = $2 FOR UPDATE',
            [id_message, id_salon]
        );

        if (msgRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            const err = new Error("Message introuvable");
            err.status = 404;
            throw err;
        }

        let reactions = msgRes.rows[0].reactions || {};
        if (typeof reactions === 'string') reactions = JSON.parse(reactions);
        if (!Array.isArray(reactions[emoji])) reactions[emoji] = [];

        if (reactions[emoji].includes(monProfilId)) {
            reactions[emoji] = reactions[emoji].filter(id => id !== monProfilId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
            reactions[emoji].push(monProfilId);
        }

        await clientDB.query(
            'UPDATE messages SET reactions = $1 WHERE id_message = $2 AND id_salon = $3',
            [JSON.stringify(reactions), id_message, id_salon]
        );
        await clientDB.query('COMMIT');

        if (io) {
            io.to(id_salon.toString()).emit('messageReaction', { id_message: parseInt(id_message, 10), reactions });
        }

        return { message: "Réaction mise à jour" };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

module.exports = {
    recupererMessages,
    envoyerMessage,
    modifierMessage,
    supprimerMessage,
    marquerMessagesLus,
    reagirMessage
};
