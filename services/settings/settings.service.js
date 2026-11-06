const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool: defaultPool } = require('../../config/db');
const { chiffrer: defaultChiffrer, dechiffrer: defaultDechiffrer, isPinWeak: defaultIsPinWeak } = require('../auth/auth.service');
const { enregistrerJET: defaultEnregistrerJET } = require('../caisse/caisse.service');

let pool = defaultPool;

function initSettingsService(deps = {}) {
    if (deps.pool) pool = deps.pool;
}

/**
 * Récupère l'état de la checklist d'onboarding du salon
 */
async function recupererChecklistOnboarding({ pool: p }, id_salon) {
    const dbPool = p || pool;
    const result = await dbPool.query(
        `SELECT etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok, statut_onboarding 
         FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    if (result.rowCount === 0) {
        const err = new Error("Salon introuvable");
        err.status = 404;
        throw err;
    }
    return result.rows[0];
}

/**
 * Met à jour une ou plusieurs étapes de la checklist d'onboarding
 */
async function mettreAJourChecklistOnboarding({ pool: p }, { id_salon, body }) {
    const dbPool = p || pool;
    const { etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok } = body;

    const toutEstValide = Boolean(etape_materiel_ok && etape_catalogue_ok && etape_equipe_ok && etape_stripe_ok && etape_formation_ok);
    const nouveauStatut = toutEstValide ? 'TERMINE' : 'EN_COURS';

    const result = await dbPool.query(
        `UPDATE configuration_salon 
         SET etape_materiel_ok = $1, etape_catalogue_ok = $2, etape_equipe_ok = $3, etape_stripe_ok = $4, etape_formation_ok = $5, statut_onboarding = $6
         WHERE id_salon = $7
         RETURNING etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok, statut_onboarding`,
        [!!etape_materiel_ok, !!etape_catalogue_ok, !!etape_equipe_ok, !!etape_stripe_ok, !!etape_formation_ok, nouveauStatut, id_salon]
    );
    return result.rows[0];
}

/**
 * Récupère la configuration globale du salon (masque les données sensibles si non gérant)
 */
async function recupererConfigurationSalon({ pool: p, dechiffrer: dechiffFn }, { id_salon, role }) {
    const dbPool = p || pool;
    const dechiffrer = dechiffFn || defaultDechiffrer;
    const result = await dbPool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]); 
    if (result.rowCount === 0) return {};
    
    let config = result.rows[0];
    
    if (role !== 'gerant') {
        delete config.mot_de_passe_app_email;
        delete config.comptes_emails;
        delete config.brevo_api_key;
        delete config.pennylane_api_key;
        delete config.google_api_key;
        delete config.pin_salon;
    } else {
        config.mot_de_passe_app_email = dechiffrer(config.mot_de_passe_app_email);
        let listeMails = Array.isArray(config.comptes_emails) ? config.comptes_emails : [];
        if (listeMails.length === 0 && config.email_reception_factures) {
            listeMails = [{ email: config.email_reception_factures, mot_de_passe: config.mot_de_passe_app_email || '' }];
        } else {
            listeMails = listeMails.map(c => ({ email: c.email, mot_de_passe: dechiffrer(c.mot_de_passe) }));
        }
        config.comptes_emails = listeMails;
    }
    
    return config;
}

/**
 * Sauvegarde les paramètres de configuration du salon
 */
async function mettreAJourConfigurationSalon(
    { pool: p, bcrypt: bcryptLib, chiffrer: chiffFn, isPinWeak: weakFn, enregistrerJET: jetFn },
    { user, body }
) {
    const dbPool = p || pool;
    const bCrypt = bcryptLib || bcrypt;
    const chiffrer = chiffFn || defaultChiffrer;
    const isPinWeak = weakFn || defaultIsPinWeak;
    const jet = jetFn || defaultEnregistrerJET;

    const {
        google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email,
        brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture,
        heure_fermeture, telephone_gerant, alertes_sms_actives, email_comptable, jour_envoi_bilan,
        pin_salon, securite_pin_salon_active, temps_nettoyage_minutes, compte_banque, compte_caisse,
        compte_prestations, compte_produits, compte_tva, pennylane_api_key, mode_suivi_heures,
        nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville,
        fidelite_type, fidelite_points_seuil, fidelite_points_valeur, fidelite_tampons_seuil,
        fidelite_recompense_type, fidelite_recompense_valeur, fidelite_delai_sms, rappel_rdv_2h_actif
    } = body;

    if (user.role === 'employe') {
        const err = new Error("Les employés ne peuvent pas modifier les paramètres du salon.");
        err.status = 403;
        throw err;
    }

    if (user.role === 'salon') {
        if (pin_salon && String(pin_salon).trim() !== '') {
            const err = new Error("Seul le gérant peut modifier le code PIN du salon.");
            err.status = 403;
            throw err;
        }
        await dbPool.query(
            `UPDATE configuration_salon SET 
                heure_ouverture = $1, heure_fermeture = $2, temps_nettoyage_minutes = $3,
                fidelite_type = COALESCE($4, fidelite_type),
                fidelite_points_seuil = COALESCE($5, fidelite_points_seuil),
                fidelite_points_valeur = COALESCE($6, fidelite_points_valeur),
                fidelite_tampons_seuil = COALESCE($7, fidelite_tampons_seuil),
                fidelite_recompense_type = COALESCE($8, fidelite_recompense_type),
                fidelite_recompense_valeur = COALESCE($9, fidelite_recompense_valeur),
                fidelite_delai_sms = COALESCE($10, fidelite_delai_sms)
             WHERE id_salon = $11`,
            [
                heure_ouverture !== undefined ? parseInt(heure_ouverture, 10) : 8,
                heure_fermeture !== undefined ? parseInt(heure_fermeture, 10) : 20,
                temps_nettoyage_minutes !== undefined ? parseInt(temps_nettoyage_minutes, 10) : 0,
                fidelite_type || null,
                fidelite_points_seuil !== undefined ? parseInt(fidelite_points_seuil, 10) : null,
                fidelite_points_valeur !== undefined ? String(fidelite_points_valeur) : null,
                fidelite_tampons_seuil !== undefined ? parseInt(fidelite_tampons_seuil, 10) : null,
                fidelite_recompense_type || null,
                fidelite_recompense_valeur !== undefined ? String(fidelite_recompense_valeur) : null,
                fidelite_delai_sms !== undefined ? parseInt(fidelite_delai_sms, 10) : null,
                user.id_salon
            ]
        );
        if (jet) await jet(user.id_salon, 'MODIFICATION_PARAMETRES_SALON', { role: 'salon', champs_modifies: ['horaires', 'fidelite'] });
        return { message: "Paramètres enregistrés avec succès !" };
    }

    const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
    const nouveauPinFourni = pin_salon !== undefined && String(pin_salon).trim() !== '';
    if (nouveauPinFourni && isPinWeak(String(pin_salon).trim())) {
        const err = new Error("Le code PIN du salon est trop simple (évitez 0000, 1234...).");
        err.status = 400;
        throw err;
    }
    
    let finalPinSalon = null;
    if (nouveauPinFourni) {
        finalPinSalon = String(pin_salon).trim().startsWith('$2')
            ? String(pin_salon).trim()
            : await bCrypt.hash(String(pin_salon).trim(), 10);
    }
    const secPinSalon = securite_pin_salon_active !== undefined ? Boolean(securite_pin_salon_active) : true;

    const updateQuery = `
        UPDATE configuration_salon SET 
            google_api_key = $1, google_account_id = $2, google_location_id = $3, 
            email_reception_factures = $4, mot_de_passe_app_email = COALESCE($5, mot_de_passe_app_email), 
            brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, 
            heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, 
            email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, 
            compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, 
            pennylane_api_key = $23, mode_suivi_heures = $24, nom_salon = $25, siret = $26, adresse_salon = $27, 
            tva_intra = $28, forme_juridique = $29, capital_social = $30, rcs_ville = $31, 
            securite_pin_salon_active = $32,
            pin_salon = CASE WHEN $33::varchar IS NOT NULL THEN $33::varchar ELSE pin_salon END,
            fidelite_type = COALESCE($34, fidelite_type),
            fidelite_points_seuil = COALESCE($35, fidelite_points_seuil),
            fidelite_points_valeur = COALESCE($36, fidelite_points_valeur),
            fidelite_tampons_seuil = COALESCE($37, fidelite_tampons_seuil),
            fidelite_recompense_type = COALESCE($38, fidelite_recompense_type),
            fidelite_recompense_valeur = COALESCE($39, fidelite_recompense_valeur),
            fidelite_delai_sms = COALESCE($40, fidelite_delai_sms),
            rappel_rdv_2h_actif = $41
        WHERE id_salon = $16
    `;

    const params = [
        google_api_key, google_account_id, google_location_id, email_factures, passChiffre, 
        brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, 
        heure_ouverture !== undefined ? parseInt(heure_ouverture, 10) : 8, 
        heure_fermeture !== undefined ? parseInt(heure_fermeture, 10) : 20, 
        telephone_gerant, Boolean(alertes_sms_actives), email_comptable, 
        jour_envoi_bilan || 1, user.id_salon, 
        temps_nettoyage_minutes !== undefined ? parseInt(temps_nettoyage_minutes, 10) : 0, 
        compte_banque || '512000', compte_caisse || '530000', compte_prestations || '706000', 
        compte_produits || '707000', compte_tva || '445710', pennylane_api_key || null, 
        mode_suivi_heures || 'MANUEL', nom_salon || null, siret || null, adresse_salon || null, 
        tva_intra || null, forme_juridique || null, capital_social || null, rcs_ville || null, 
        secPinSalon, finalPinSalon,
        fidelite_type || 'NONE',
        fidelite_points_seuil !== undefined ? parseInt(fidelite_points_seuil, 10) : 100,
        fidelite_points_valeur !== undefined ? String(fidelite_points_valeur) : '10',
        fidelite_tampons_seuil !== undefined ? parseInt(fidelite_tampons_seuil, 10) : 10,
        fidelite_recompense_type || 'MONTANT',
        fidelite_recompense_valeur !== undefined ? String(fidelite_recompense_valeur) : '10',
        fidelite_delai_sms !== undefined ? parseInt(fidelite_delai_sms, 10) : 60,
        Boolean(rappel_rdv_2h_actif)
    ];
    
    await dbPool.query(updateQuery, params);

    if (Array.isArray(body.comptes_emails)) {
        const comptesLimites = body.comptes_emails
            .filter(c => c && c.email && String(c.email).trim() !== '')
            .slice(0, 5)
            .map(c => ({
                email: String(c.email).trim(),
                mot_de_passe: c.mot_de_passe ? chiffrer(String(c.mot_de_passe).trim()) : ''
            }));
        const premierEmail = comptesLimites[0]?.email || email_factures || null;
        const premierPass = comptesLimites[0]?.mot_de_passe || passChiffre || null;
        await dbPool.query(
            'UPDATE configuration_salon SET comptes_emails = $1, email_reception_factures = $2, mot_de_passe_app_email = $3 WHERE id_salon = $4',
            [JSON.stringify(comptesLimites), premierEmail, premierPass, user.id_salon]
        );
    }

    if (jet) await jet(user.id_salon, 'MODIFICATION_PARAMETRES_SALON', { champs_modifies: Object.keys(body) });
    return { message: "Paramètres enregistrés avec succès !" };
}

/**
 * Upload d'un logo ou d'une photo de vitrine vers Cloudflare R2 et mise à jour en BDD
 */
async function uploaderGalerieSalon({ pool: p, s3Client, PutObjectCommand }, { id_salon, role, type, file }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut modifier les visuels de l'établissement.");
        err.status = 403;
        throw err;
    }

    if (!file || !file.buffer) {
        const err = new Error("Aucun fichier image valide fourni.");
        err.status = 400;
        throw err;
    }

    const typeVisuel = type === 'logo' ? 'logo' : 'photo';
    const dbPool = p || pool;

    const ext = file.mimetype.includes('png') ? 'png' : file.mimetype.includes('webp') ? 'webp' : 'jpg';
    const cleR2 = `salons/${id_salon}/vitrine/${typeVisuel}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

    let urlFinale = null;

    if (process.env.R2_BUCKET_NAME && s3Client && PutObjectCommand) {
        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: cleR2,
                Body: file.buffer,
                ContentType: file.mimetype
            }));

            if (process.env.R2_PUBLIC_URL) {
                urlFinale = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${cleR2}`;
            } else {
                urlFinale = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${cleR2}`;
            }
        } catch (r2Err) {
            console.error("⚠️ [R2 Upload Galerie] Échec envoi R2, repli local :", r2Err.message);
        }
    }

    if (!urlFinale) {
        urlFinale = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    let logo_url = null;
    let photos_salon = [];

    if (typeVisuel === 'logo') {
        const res = await dbPool.query(
            'UPDATE configuration_salon SET logo_url = $1 WHERE id_salon = $2 RETURNING logo_url, photos_salon',
            [urlFinale, id_salon]
        );
        logo_url = res.rows[0]?.logo_url || urlFinale;
        const rawPhotos = res.rows[0]?.photos_salon;
        photos_salon = Array.isArray(rawPhotos) ? rawPhotos : (typeof rawPhotos === 'string' ? JSON.parse(rawPhotos || '[]') : []);
    } else {
        const curRes = await dbPool.query('SELECT logo_url, photos_salon FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        logo_url = curRes.rows[0]?.logo_url || null;
        const rawPhotos = curRes.rows[0]?.photos_salon;
        const currentList = Array.isArray(rawPhotos) ? [...rawPhotos] : (typeof rawPhotos === 'string' ? JSON.parse(rawPhotos || '[]') : []);

        if (currentList.length >= 5) {
            const err = new Error("Limite atteinte : vous ne pouvez pas ajouter plus de 5 photos dans votre galerie.");
            err.status = 400;
            throw err;
        }

        currentList.push(urlFinale);
        const updRes = await dbPool.query(
            'UPDATE configuration_salon SET photos_salon = $1 WHERE id_salon = $2 RETURNING photos_salon',
            [JSON.stringify(currentList), id_salon]
        );
        const updatedRaw = updRes.rows[0]?.photos_salon;
        photos_salon = Array.isArray(updatedRaw) ? updatedRaw : (typeof updatedRaw === 'string' ? JSON.parse(updatedRaw || '[]') : currentList);
    }

    return {
        success: true,
        message: typeVisuel === 'logo' ? "Logo mis à jour avec succès !" : "Photo ajoutée à la galerie avec succès !",
        logo_url,
        photos_salon
    };
}

/**
 * Suppression d'un logo ou d'une photo de la galerie
 */
async function supprimerElementGalerie({ pool: p }, { id_salon, role, type, index, url }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut modifier les visuels de l'établissement.");
        err.status = 403;
        throw err;
    }

    const dbPool = p || pool;
    let logo_url = null;
    let photos_salon = [];

    if (type === 'logo') {
        const res = await dbPool.query(
            'UPDATE configuration_salon SET logo_url = NULL WHERE id_salon = $1 RETURNING logo_url, photos_salon',
            [id_salon]
        );
        logo_url = null;
        const rawPhotos = res.rows[0]?.photos_salon;
        photos_salon = Array.isArray(rawPhotos) ? rawPhotos : (typeof rawPhotos === 'string' ? JSON.parse(rawPhotos || '[]') : []);
    } else {
        const curRes = await dbPool.query('SELECT logo_url, photos_salon FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        logo_url = curRes.rows[0]?.logo_url || null;
        const rawPhotos = curRes.rows[0]?.photos_salon;
        let currentList = Array.isArray(rawPhotos) ? [...rawPhotos] : (typeof rawPhotos === 'string' ? JSON.parse(rawPhotos || '[]') : []);

        if (typeof index === 'number' && index >= 0 && index < currentList.length) {
            currentList.splice(index, 1);
        } else if (url) {
            currentList = currentList.filter(u => u !== url);
        }

        const updRes = await dbPool.query(
            'UPDATE configuration_salon SET photos_salon = $1 WHERE id_salon = $2 RETURNING photos_salon',
            [JSON.stringify(currentList), id_salon]
        );
        const updatedRaw = updRes.rows[0]?.photos_salon;
        photos_salon = Array.isArray(updatedRaw) ? updatedRaw : (typeof updatedRaw === 'string' ? JSON.parse(updatedRaw || '[]') : currentList);
    }

    return {
        success: true,
        message: type === 'logo' ? "Logo supprimé avec succès." : "Photo supprimée de la galerie.",
        logo_url,
        photos_salon
    };
}

module.exports = {
    initSettingsService,
    recupererChecklistOnboarding,
    mettreAJourChecklistOnboarding,
    recupererConfigurationSalon,
    mettreAJourConfigurationSalon,
    uploaderGalerieSalon,
    supprimerElementGalerie
};
