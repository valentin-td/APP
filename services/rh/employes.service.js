/**
 * services/rh/employes.service.js
 * Gestion administrative, codes PIN et conformité NF525/RGPD des employés
 */

const bcrypt = require('bcrypt');

/**
 * Vérifie si un code PIN est trop prévisible
 * @param {string|number} pin 
 * @returns {boolean}
 */
function isPinWeak(pin) {
    if (!pin) return false;
    const strPin = String(pin).trim();
    const repeating = /^(\d)\1+$/.test(strPin);          // Ex: 0000, 1111, 22222...
    const sequentialUp = '0123456789'.includes(strPin);  // Ex: 1234, 4567, 0123...
    const sequentialDown = '9876543210'.includes(strPin);// Ex: 4321, 9876, 3210...
    return repeating || sequentialUp || sequentialDown;
}

/**
 * Récupère la liste des employés du salon
 */
async function recupererEmployes({ pool }, id_salon) {
    const result = await pool.query(
        `SELECT e.id_employe, e.nom, e.role, e.taux_commission_prestation, e.taux_commission_produit, 
                e.photo_url, e.est_gerant, e.type_contrat, e.heures_mensuelles_base, e.id_salon, 
                COALESCE(e.pin_tentatives_echouees, 0) as pin_tentatives_echouees, 
                e.pin_bloque_jusqua, COALESCE(e.pin_bloque_definitif, FALSE) as pin_bloque_definitif, 
                EXISTS(SELECT 1 FROM pointages p WHERE p.id_employe = e.id_employe AND p.date_jour = CURRENT_DATE) as a_pointe_aujourdhui 
         FROM employes e 
         WHERE e.id_salon = $1 
         ORDER BY e.nom ASC`,
        [id_salon]
    );
    return result.rows;
}

/**
 * Mise à jour de son propre code PIN par un employé
 */
async function mettreAJourMonPin({ pool }, { id_salon, role, id_employe, nouveau_pin }) {
    if (role !== 'employe') {
        const err = new Error("Réservé aux employés.");
        err.status = 403;
        throw err;
    }
    if (!nouveau_pin || isPinWeak(nouveau_pin)) {
        const err = new Error("Ce code PIN est trop simple ou invalide.");
        err.status = 400;
        throw err;
    }
    const hashPin = await bcrypt.hash(String(nouveau_pin).trim(), 10);
    await pool.query(
        'UPDATE employes SET code_pin = $1 WHERE id_employe = $2 AND id_salon = $3',
        [hashPin, id_employe, id_salon]
    );
    return { message: "Code PIN mis à jour avec succès." };
}

/**
 * Déblocage d'un code PIN par le gérant
 */
async function debloquerPinEmploye({ pool, enregistrerJET }, { id_salon, role, id_employe_cible }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut débloquer le code PIN d'un collaborateur.");
        err.status = 403;
        throw err;
    }
    const r = await pool.query(
        `UPDATE employes 
         SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE 
         WHERE id_employe = $1 AND id_salon = $2 
         RETURNING nom`,
        [id_employe_cible, id_salon]
    );
    if (r.rowCount === 0) {
        const err = new Error("Collaborateur introuvable.");
        err.status = 404;
        throw err;
    }
    if (enregistrerJET) {
        await enregistrerJET(id_salon, 'DEBLOCAGE_PIN_EMPLOYE', {
            id_employe: parseInt(id_employe_cible, 10),
            nom: r.rows[0].nom,
            debloque_par: 'gerant'
        });
    }
    return { message: `Accès PIN débloqué pour ${r.rows[0].nom}.` };
}

/**
 * Ajout d'un nouvel employé
 */
async function ajouterEmploye({ pool }, { id_salon, role, body }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut ajouter un employé.");
        err.status = 403;
        throw err;
    }
    const { nom, role: empRole, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, type_contrat, heures_mensuelles_base } = body;

    if (!code_pin) {
        const err = new Error("Le code PIN est obligatoire.");
        err.status = 400;
        throw err;
    }
    if (isPinWeak(code_pin)) {
        const err = new Error("Ce code PIN est trop simple (évitez 0000, 1234...).");
        err.status = 400;
        throw err;
    }

    const hashPin = await bcrypt.hash(String(code_pin).trim(), 10);

    await pool.query(`
        INSERT INTO employes (nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, type_contrat, heures_mensuelles_base, id_salon) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
        nom,
        empRole || 'Employé',
        taux_commission_prestation || 0,
        taux_commission_produit || 0,
        hashPin,
        photo_url || null,
        type_contrat || '35H',
        heures_mensuelles_base || 151.67,
        id_salon
    ]);

    return { status: 201, message: "Employé ajouté" };
}

/**
 * Modification d'un employé existant
 */
async function modifierEmploye({ pool }, { id_salon, role, id_employe_cible, body }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut modifier un employé.");
        err.status = 403;
        throw err;
    }
    const { nom, code_pin, taux_commission_prestation, taux_commission_produit } = body;

    if (code_pin && code_pin.trim() !== '') {
        if (isPinWeak(code_pin)) {
            const err = new Error("Ce code PIN est trop simple (évitez 0000, 1234...).");
            err.status = 400;
            throw err;
        }
        const hashPin = await bcrypt.hash(String(code_pin).trim(), 10);
        await pool.query(
            `UPDATE employes 
             SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3, 
                 code_pin = $4, pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE 
             WHERE id_employe = $5 AND id_salon = $6`,
            [nom, taux_commission_prestation || 0, taux_commission_produit || 0, hashPin, id_employe_cible, id_salon]
        );
    } else {
        await pool.query(
            `UPDATE employes 
             SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3 
             WHERE id_employe = $4 AND id_salon = $5`,
            [nom, taux_commission_prestation || 0, taux_commission_produit || 0, id_employe_cible, id_salon]
        );
    }
    return { message: "Employé modifié" };
}

/**
 * Suppression ou anonymisation RGPD / NF525 d'un employé
 */
async function supprimerOuAnonymiserEmploye({ pool, enregistrerJET }, { id_salon, role, id_employe_cible }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut supprimer un employé.");
        err.status = 403;
        throw err;
    }

    const liePiece = await pool.query(
        'SELECT 1 FROM tickets WHERE id_employe = $1 AND id_salon = $2 UNION SELECT 1 FROM commissions WHERE id_employe = $1 AND id_salon = $2 LIMIT 1',
        [id_employe_cible, id_salon]
    );

    if (liePiece.rowCount > 0) {
        await pool.query(
            "UPDATE employes SET nom = 'Collaborateur Anonymisé #' || id_employe, code_pin = NULL, photo_url = NULL WHERE id_employe = $1 AND id_salon = $2",
            [id_employe_cible, id_salon]
        );
        if (enregistrerJET) {
            await enregistrerJET(id_salon, 'ANONYMISATION_EMPLOYE_RGPD', { id_employe: parseInt(id_employe_cible, 10) });
        }
        return { message: "Collaborateur anonymisé (conservation fiscale NF525 des tickets liés)." };
    }

    await pool.query('DELETE FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe_cible, id_salon]);
    return { message: "Employé supprimé" };
}

/**
 * Mise à jour de la photo de profil par l'employé lui-même
 */
async function mettreAJourPhotoEmploye({ pool }, { id_salon, role, id_employe_auth, id_employe_cible, photo_url }) {
    if (role !== 'employe' || parseInt(id_employe_cible, 10) !== id_employe_auth) {
        const err = new Error("Action non autorisée.");
        err.status = 403;
        throw err;
    }

    const photo = photo_url || null;
    if (photo) {
        if (typeof photo !== 'string' || photo.length > 2000000) {
            const err = new Error("Photo trop volumineuse (max 1.5 Mo).");
            err.status = 400;
            throw err;
        }
        if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo)) {
            const err = new Error("Format de photo invalide (JPG, PNG ou WEBP requis).");
            err.status = 400;
            throw err;
        }
    }

    await pool.query('UPDATE employes SET photo_url = $1 WHERE id_employe = $2 AND id_salon = $3', [photo, id_employe_auth, id_salon]);
    return { message: "Photo mise à jour." };
}

module.exports = {
    isPinWeak,
    recupererEmployes,
    mettreAJourMonPin,
    debloquerPinEmploye,
    ajouterEmploye,
    modifierEmploye,
    supprimerOuAnonymiserEmploye,
    mettreAJourPhotoEmploye
};
