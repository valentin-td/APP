/**
 * services/marketing/marketing.service.js
 * Gestion des avis clients, e-réputation Google, STOP SMS et campagnes SMS / Winback Brevo
 */

/**
 * Récupère les informations d'une demande d'avis via son token sécurisé
 */
async function recupererInfoAvis({ pool }, token) {
    const r = await pool.query(
        `SELECT a.prenom, a.statut, a.note, a.id_salon, cs.nom_salon 
         FROM avis_demandes a 
         JOIN configuration_salon cs ON cs.id_salon = a.id_salon 
         WHERE a.token = $1 AND a.date_creation > NOW() - INTERVAL '30 days'`,
        [token]
    );

    if (r.rowCount === 0) {
        const err = new Error("Lien invalide ou expiré.");
        err.status = 404;
        throw err;
    }

    const d = r.rows[0];
    const etape = d.statut === 'REPONDU'
        ? 'termine'
        : (d.note && d.note <= 3 ? 'commentaire' : 'notation');

    return {
        prenom: d.prenom,
        nom_salon: d.nom_salon,
        etape
    };
}

/**
 * Récupère les statistiques globales d'avis pour le salon
 */
async function recupererStatsAvis({ pool }, id_salon) {
    const r = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE statut IN ('ENVOYE', 'REPONDU')) as nb_envoyes,
            COUNT(*) FILTER (WHERE statut = 'REPONDU') as nb_repondus,
            ROUND(AVG(note) FILTER (WHERE note IS NOT NULL)::numeric, 1) as note_moyenne,
            COUNT(*) FILTER (WHERE note >= 4) as nb_positifs,
            COUNT(*) FILTER (WHERE note IS NOT NULL AND note <= 3) as nb_negatifs
         FROM avis_demandes 
         WHERE id_salon = $1`,
        [id_salon]
    );
    return r.rows[0] || {};
}

/**
 * Enregistre le STOP SMS demandé par un client et annule ses demandes en attente
 */
async function arreterSmsClient({ pool, normaliserTelephone }, token) {
    const r = await pool.query(
        'SELECT id_salon, telephone FROM avis_demandes WHERE token = $1',
        [token]
    );

    if (r.rowCount === 0) {
        const err = new Error("Lien invalide.");
        err.status = 404;
        throw err;
    }

    const { id_salon, telephone } = r.rows[0];
    const telPropre = typeof normaliserTelephone === 'function' ? normaliserTelephone(telephone) : telephone;

    await pool.query(
        'INSERT INTO sms_opt_out (id_salon, telephone) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id_salon, telPropre]
    );
    await pool.query(
        `UPDATE avis_demandes SET statut = 'ANNULE' WHERE id_salon = $1 AND telephone = $2 AND statut = 'EN_ATTENTE'`,
        [id_salon, telephone]
    );

    return { message: "Vous ne recevrez plus ce type de message." };
}

/**
 * Enregistre la note (1 à 5 étoiles). Si note >= 4, renvoie le lien Google Maps
 */
async function enregistrerNoteAvis({ pool }, { token, note }) {
    const noteInt = parseInt(note, 10);
    if (!noteInt || noteInt < 1 || noteInt > 5) {
        const err = new Error("Note invalide.");
        err.status = 400;
        throw err;
    }

    const r = await pool.query(
        `UPDATE avis_demandes 
         SET note = $1, statut = CASE WHEN $1 >= 4 THEN 'REPONDU' ELSE statut END 
         WHERE token = $2 AND note IS NULL 
         RETURNING id_salon`,
        [noteInt, token]
    );

    if (r.rowCount === 0) {
        const err = new Error("Lien invalide ou déjà utilisé.");
        err.status = 404;
        throw err;
    }

    if (noteInt >= 4) {
        const salonInfo = await pool.query(
            'SELECT lien_google_maps FROM configuration_salon WHERE id_salon = $1',
            [r.rows[0].id_salon]
        );
        return {
            besoin_commentaire: false,
            lien_google_maps: salonInfo.rows[0]?.lien_google_maps || null
        };
    }

    return { besoin_commentaire: true };
}

/**
 * Enregistre le commentaire d'insatisfaction (<= 3 étoiles) et crée une tâche d'action pour le gérant
 */
async function enregistrerCommentaireAvis({ pool, envoyerNotificationPush }, { token, commentaire }) {
    const r = await pool.query(
        `UPDATE avis_demandes 
         SET commentaire = $1, statut = 'REPONDU' 
         WHERE token = $2 AND note <= 3 AND statut != 'REPONDU' 
         RETURNING id_salon, telephone, prenom, note`,
        [commentaire || '', token]
    );

    if (r.rowCount === 0) {
        const err = new Error("Lien invalide ou déjà traité.");
        err.status = 404;
        throw err;
    }

    const d = r.rows[0];

    await pool.query(
        `INSERT INTO taches_actions (id_salon, titre, description, source, donnees) 
         VALUES ($1, $2, $3, 'AVIS_CLIENT', $4)`,
        [
            d.id_salon,
            `Avis client insatisfait (${d.note}★) à recontacter`,
            `${d.prenom || 'Un client'} (${d.telephone}) a laissé une note de ${d.note}/5 : "${commentaire || '(aucun commentaire)'}"`,
            JSON.stringify({ telephone: d.telephone, prenom: d.prenom })
        ]
    );

    if (envoyerNotificationPush) {
        envoyerNotificationPush(d.id_salon, 'gerant', {
            title: "Avis client à traiter",
            body: `Note de ${d.note}/5 reçue, un commentaire vous attend dans Actions.`,
            url: '/?tab=actions'
        });
    }

    return { message: "Merci pour votre retour." };
}

/**
 * Envoi manuel d'un SMS transactionnel via Brevo
 */
async function envoyerSmsManuel({ pool }, { id_salon, role, telephone, message }) {
    if (role === 'employe') {
        const err = new Error("L'envoi de SMS est réservé au gérant et au poste Salon.");
        err.status = 403;
        throw err;
    }

    const salonConfig = await pool.query(
        'SELECT brevo_api_key, sms_sender_name FROM configuration_salon WHERE id_salon = $1',
        [id_salon]
    );
    const config = salonConfig.rows[0];

    if (!config || !config.brevo_api_key) {
        const err = new Error("SMS non configurés dans vos paramètres.");
        err.status = 400;
        throw err;
    }

    const resBrevo = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': config.brevo_api_key,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            type: 'transactional',
            unicodeEnabled: false,
            sender: (config.sms_sender_name || 'LeSalon').substring(0, 11),
            recipient: telephone,
            content: message
        })
    });

    if (!resBrevo.ok) {
        const errData = await resBrevo.json().catch(() => ({}));
        const err = new Error(errData.message || "Erreur d'envoi Brevo.");
        err.status = resBrevo.status || 500;
        throw err;
    }

    return { message: "SMS de sauvetage envoyé." };
}

/**
 * Envoi d'une offre Winback (relance client inactif) avec mise à jour de la fiche client
 */
async function envoyerSmsWinback({ pool, envoyerSMS_Intelligent }, { id_salon, role, body }) {
    if (role === 'employe') {
        const err = new Error("L'envoi d'offres Winback est réservé au gérant et au poste Salon.");
        err.status = 403;
        throw err;
    }

    const { id_client, telephone, message, remise_winback } = body;

    if (!telephone || !message) {
        const err = new Error("Le téléphone et le message sont requis.");
        err.status = 400;
        throw err;
    }

    const confRes = await pool.query(
        'SELECT brevo_api_key, sms_sender_name FROM configuration_salon WHERE id_salon = $1',
        [id_salon]
    );

    if (confRes.rowCount === 0 || !confRes.rows[0].brevo_api_key) {
        const err = new Error("SMS non configurés dans vos paramètres.");
        err.status = 400;
        throw err;
    }

    const { brevo_api_key, sms_sender_name } = confRes.rows[0];
    const ok = await envoyerSMS_Intelligent(id_salon, brevo_api_key, sms_sender_name || 'MonSalon', telephone, message);

    if (!ok) {
        const err = new Error("Échec de l'envoi du SMS via Brevo (vérifiez votre clé ou quota).");
        err.status = 500;
        throw err;
    }

    if (remise_winback && String(remise_winback).trim() !== '') {
        const remiseClean = String(remise_winback).trim();
        if (id_client) {
            await pool.query(
                'UPDATE clients SET remise_winback = $1 WHERE id_client = $2 AND id_salon = $3',
                [remiseClean, id_client, id_salon]
            );
        } else {
            const tel9 = String(telephone).replace(/\D/g, '').slice(-9);
            if (tel9.length >= 8) {
                await pool.query(
                    `UPDATE clients SET remise_winback = $1 WHERE id_salon = $2 AND RIGHT(regexp_replace(telephone, '\\D', '', 'g'), 9) = $3`,
                    [remiseClean, id_salon, tel9]
                );
            }
        }
    }

    return { message: "Offre de sauvetage envoyée et enregistrée sur la fiche client !" };
}

module.exports = {
    recupererInfoAvis,
    recupererStatsAvis,
    arreterSmsClient,
    enregistrerNoteAvis,
    enregistrerCommentaireAvis,
    envoyerSmsManuel,
    envoyerSmsWinback
};
