const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool: defaultPool } = require('../../config/db');

let pool = defaultPool;

function initClientAuthService(deps = {}) {
    if (deps.pool) pool = deps.pool;
}

const JWT_CLIENT_SECRET = process.env.JWT_SECRET || 'stack_client_jwt_secret_key_2026';

function genererTokenClient(client) {
    return jwt.sign(
        {
            id_client: client.id_client,
            id_salon: client.id_salon,
            telephone: client.telephone,
            email: client.email,
            type: 'client_public'
        },
        JWT_CLIENT_SECRET,
        { expiresIn: '90d' }
    );
}

function verifierTokenClient(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ erreur: "Veuillez vous connecter à votre compte client.", session_expiree: true });
    }
    jwt.verify(token, JWT_CLIENT_SECRET, (err, decoded) => {
        if (err || !decoded.id_client) {
            return res.status(401).json({ erreur: "Session client expirée ou invalide.", session_expiree: true });
        }
        req.client = decoded;
        next();
    });
}

/**
 * Inscription / Création de compte client STACK
 */
async function inscrireClient({ pool: p }, { id_salon, nom, prenom, telephone, email, mot_de_passe }) {
    const dbPool = p || pool;
    if (!nom || !telephone || !mot_de_passe) {
        const err = new Error("Nom, téléphone et mot de passe sont obligatoires.");
        err.status = 400;
        throw err;
    }

    const telClean = String(telephone).replace(/[^\d+]/g, '');
    const emailClean = email ? String(email).trim().toLowerCase() : null;
    const hash = await bcrypt.hash(String(mot_de_passe).trim(), 10);

    // Vérifier si un client existe déjà avec ce téléphone (dans ce salon ou globalement sur STACK)
    const existRes = id_salon
        ? await dbPool.query(
            `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite, mot_de_passe_hash
             FROM clients
             WHERE id_salon = $1 AND (telephone = $2 OR REPLACE(REPLACE(telephone, ' ', ''), '.', '') = $3)
             LIMIT 1`,
            [id_salon, telephone.trim(), telClean]
        )
        : await dbPool.query(
            `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite, mot_de_passe_hash
             FROM clients
             WHERE telephone = $1 OR REPLACE(REPLACE(telephone, ' ', ''), '.', '') = $2
             ORDER BY id_client DESC
             LIMIT 1`,
            [telephone.trim(), telClean]
        );

    let client;
    if (existRes.rowCount > 0) {
        // Le client existait (ex: suite à un RDV passé), on met à jour son mot de passe et son email
        const updRes = await dbPool.query(
            `UPDATE clients 
             SET mot_de_passe_hash = $1, 
                 nom = COALESCE($2, nom), 
                 prenom = COALESCE($3, prenom),
                 email = COALESCE($4, email)
             WHERE id_client = $5
             RETURNING id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite`,
            [hash, nom.trim(), prenom ? prenom.trim() : null, emailClean, existRes.rows[0].id_client]
        );
        client = updRes.rows[0];
    } else {
        // Nouveau client complet
        const insRes = await dbPool.query(
            `INSERT INTO clients (id_salon, nom, prenom, telephone, email, mot_de_passe_hash)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite`,
            [id_salon, nom.trim(), prenom ? prenom.trim() : '', telephone.trim(), emailClean, hash]
        );
        client = insRes.rows[0];
    }

    const token = genererTokenClient(client);
    return {
        success: true,
        message: "Compte créé avec succès !",
        token,
        client: {
            id_client: client.id_client,
            id_salon: client.id_salon,
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
            email: client.email,
            solde_avoir: parseFloat(client.solde_avoir || 0),
            points_fidelite: parseInt(client.points_fidelite, 10) || 0,
            tampons_fidelite: parseInt(client.tampons_fidelite, 10) || 0
        }
    };
}

/**
 * Connexion client STACK (par email ou téléphone)
 */
async function connecterClient({ pool: p }, { id_salon, identifiant, mot_de_passe }) {
    const dbPool = p || pool;
    if (!identifiant || !mot_de_passe) {
        const err = new Error("Identifiant et mot de passe requis.");
        err.status = 400;
        throw err;
    }

    const idClean = String(identifiant).trim();
    const telClean = idClean.replace(/[^\d+]/g, '');

    let resClient = { rowCount: 0, rows: [] };
    if (id_salon) {
        resClient = await dbPool.query(
            `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite, mot_de_passe_hash
             FROM clients
             WHERE id_salon = $1 
               AND (LOWER(TRIM(email)) = LOWER($2) OR telephone = $2 OR REPLACE(REPLACE(telephone, ' ', ''), '.', '') = $3)
             LIMIT 1`,
            [id_salon, idClean, telClean]
        );
    }
    if (resClient.rowCount === 0) {
        resClient = await dbPool.query(
            `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite, mot_de_passe_hash
             FROM clients
             WHERE LOWER(TRIM(email)) = LOWER($1) OR telephone = $1 OR REPLACE(REPLACE(telephone, ' ', ''), '.', '') = $2
             ORDER BY (mot_de_passe_hash IS NOT NULL) DESC, id_client DESC
             LIMIT 1`,
            [idClean, telClean]
        );
    }

    if (resClient.rowCount === 0) {
        const err = new Error("Identifiant ou mot de passe incorrect.");
        err.status = 401;
        throw err;
    }

    const client = resClient.rows[0];
    if (!client.mot_de_passe_hash) {
        const err = new Error("Vous n'avez pas encore défini de mot de passe. Veuillez cliquer sur 'Créer mon compte' pour l'activer.");
        err.status = 400;
        throw err;
    }

    const valid = await bcrypt.compare(String(mot_de_passe).trim(), client.mot_de_passe_hash);
    if (!valid) {
        const err = new Error("Identifiant ou mot de passe incorrect.");
        err.status = 401;
        throw err;
    }

    const token = genererTokenClient(client);
    return {
        success: true,
        message: "Connexion réussie !",
        token,
        client: {
            id_client: client.id_client,
            id_salon: client.id_salon,
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
            email: client.email,
            solde_avoir: parseFloat(client.solde_avoir || 0),
            points_fidelite: parseInt(client.points_fidelite, 10) || 0,
            tampons_fidelite: parseInt(client.tampons_fidelite, 10) || 0
        }
    };
}

/**
 * Récupère le profil complet de l'espace client : infos, RDV à venir, RDV passés, jauge fidélité
 */
async function recupererProfilClient({ pool: p }, { id_client, id_salon }) {
    const dbPool = p || pool;

    const cliRes = await dbPool.query(
        `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite, date_naissance
         FROM clients
         WHERE id_client = $1`,
        [id_client]
    );
    if (cliRes.rowCount === 0) {
        const err = new Error("Profil client introuvable.");
        err.status = 404;
        throw err;
    }
    const client = cliRes.rows[0];

    // Récupérer la configuration de fidélité du salon
    const cfgRes = await dbPool.query(
        `SELECT nom_salon, fidelite_type, fidelite_points_seuil, fidelite_points_valeur, 
                fidelite_tampons_seuil, fidelite_recompense_type, fidelite_recompense_valeur,
                delai_annulation_heures, anti_noshow_mode_annulation
         FROM configuration_salon
         WHERE id_salon = $1`,
        [id_salon]
    );
    const config = cfgRes.rows[0] || {};

    // Rendez-vous du client
    const rdvsRes = await dbPool.query(
        `SELECT r.id_rdv, r.date_heure_debut, r.prestation, r.prestations_details, r.duree_minutes, 
                CASE WHEN r.date_annulation IS NOT NULL THEN 'ANNULE' ELSE 'CONFIRME' END AS statut,
                r.acompte_paye, r.statut_acompte, r.date_annulation,
                e.nom AS employe_nom, e.photo_url AS employe_photo
         FROM rendez_vous r
         LEFT JOIN employes e ON r.id_employe = e.id_employe
         WHERE r.id_salon = $1 AND (r.id_client = $2 OR r.telephone_client = $3)
         ORDER BY r.date_heure_debut DESC`,
        [id_salon, id_client, client.telephone]
    );

    const now = new Date();
    const rdvs_a_venir = [];
    const rdvs_passes = [];

    rdvsRes.rows.forEach(r => {
        const dateRdv = new Date(String(r.date_heure_debut).replace('Z', ''));
        const rdvObj = {
            id_rdv: r.id_rdv,
            date_heure_debut: r.date_heure_debut,
            prestation: r.prestation,
            prestations_details: r.prestations_details,
            duree_minutes: r.duree_minutes,
            statut: r.statut || 'CONFIRME',
            acompte_paye: parseFloat(r.acompte_paye || 0),
            statut_acompte: r.statut_acompte || 'NON_APPLICABLE',
            employe_nom: r.employe_nom || 'Non assigné',
            employe_photo: r.employe_photo || null,
            peut_annuler_sans_frais: (dateRdv.getTime() - now.getTime()) >= (config.delai_annulation_heures || 24) * 3600 * 1000
        };

        if (dateRdv >= now && r.statut !== 'ANNULE') {
            rdvs_a_venir.push(rdvObj);
        } else {
            rdvs_passes.push(rdvObj);
        }
    });

    rdvs_a_venir.sort((a, b) => new Date(a.date_heure_debut) - new Date(b.date_heure_debut));

    // Calcul de la jauge fidélité STACK
    const fideliteType = config.fidelite_type || 'NONE';
    let jaugeFidelite = {
        type: fideliteType,
        actif: fideliteType !== 'NONE',
        points_actuels: parseInt(client.points_fidelite, 10) || 0,
        tampons_actuels: parseInt(client.tampons_fidelite, 10) || 0,
        message: ""
    };

    if (fideliteType === 'TAMPONS') {
        const seuil = config.fidelite_tampons_seuil || 10;
        const restants = Math.max(0, seuil - (jaugeFidelite.tampons_actuels % seuil));
        jaugeFidelite.seuil = seuil;
        jaugeFidelite.pourcentage = Math.min(100, Math.round(((jaugeFidelite.tampons_actuels % seuil) / seuil) * 100));
        jaugeFidelite.message = restants === 0 || restants === seuil
            ? "Félicitations ! Vous avez droit à votre récompense fidélité !"
            : `Plus que ${restants} tampon${restants > 1 ? 's' : ''} avant votre récompense !`;
    } else if (fideliteType === 'POINTS') {
        const seuil = config.fidelite_points_seuil || 100;
        const restants = Math.max(0, seuil - (jaugeFidelite.points_actuels % seuil));
        jaugeFidelite.seuil = seuil;
        jaugeFidelite.pourcentage = Math.min(100, Math.round(((jaugeFidelite.points_actuels % seuil) / seuil) * 100));
        jaugeFidelite.message = restants === 0 || restants === seuil
            ? "Félicitations ! Votre palier de points est atteint !"
            : `Encore ${restants} point${restants > 1 ? 's' : ''} pour débloquer ${config.fidelite_points_valeur || '10'}€ offerts !`;
    }

    return {
        client: {
            id_client: client.id_client,
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
            email: client.email,
            solde_avoir: parseFloat(client.solde_avoir || 0)
        },
        jauge_fidelite: jaugeFidelite,
        rdvs_a_venir,
        rdvs_passes
    };
}

/**
 * Annulation d'un rendez-vous par le client en 1-clic
 * Règle : > 24h = avoir ou remboursement Stripe selon réglage du gérant.
 * < 24h = acompte conservé (No-Show).
 */
async function annulerRdvParClient({ pool: p, io, stripe }, { id_client, id_salon, id_rdv }) {
    const dbPool = p || pool;

    const rdvRes = await dbPool.query(
        `SELECT id_rdv, id_salon, id_client, telephone_client, date_heure_debut, prestation, acompte_paye, date_annulation, stripe_payment_intent_id
         FROM rendez_vous
         WHERE id_rdv = $1 AND id_salon = $2`,
        [id_rdv, id_salon]
    );

    if (rdvRes.rowCount === 0) {
        const err = new Error("Rendez-vous introuvable.");
        err.status = 404;
        throw err;
    }

    const rdv = rdvRes.rows[0];
    if (rdv.date_annulation) {
        return { message: "Ce rendez-vous est déjà annulé." };
    }

    // Récupérer la politique d'annulation du salon
    const cfgRes = await dbPool.query(
        `SELECT delai_annulation_heures, anti_noshow_mode_annulation FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    const config = cfgRes.rows[0] || {};
    const delaiHeures = config.delai_annulation_heures || 24;
    const modeAnnulation = config.anti_noshow_mode_annulation || 'AVOIR';

    const dateRdv = new Date(String(rdv.date_heure_debut).replace('Z', ''));
    const now = new Date();
    const diffHours = (dateRdv.getTime() - now.getTime()) / (3600 * 1000);

    const acompte = parseFloat(rdv.acompte_paye || 0);
    let statutAcompte = 'NON_APPLICABLE';
    let messageResultat = "Votre rendez-vous a bien été annulé.";

    if (acompte > 0) {
        if (diffHours >= delaiHeures) {
            // Annulation dans les délais (> 24h)
            if (modeAnnulation === 'AVOIR') {
                // Créditer l'avoir client
                await dbPool.query(
                    `UPDATE clients SET solde_avoir = COALESCE(solde_avoir, 0) + $1 WHERE id_client = $2`,
                    [acompte, id_client]
                );
                statutAcompte = 'CONVERTI_AVOIR';
                messageResultat = `Votre rendez-vous a bien été annulé. Votre acompte de ${acompte.toFixed(2)} € a été crédité en Avoir sur votre compte client pour votre prochaine visite.`;
            } else {
                // Remboursement direct Stripe
                if (stripe && rdv.stripe_payment_intent_id) {
                    try {
                        await stripe.refunds.create({
                            payment_intent: rdv.stripe_payment_intent_id
                        });
                        statutAcompte = 'REMBOURSE';
                        messageResultat = `Votre rendez-vous a bien été annulé. Votre acompte de ${acompte.toFixed(2)} € vous a été directement remboursé sur votre carte bancaire.`;
                    } catch (strErr) {
                        console.error("Erreur remboursement Stripe:", strErr.message);
                        // Fallback en avoir si erreur Stripe
                        await dbPool.query(
                            `UPDATE clients SET solde_avoir = COALESCE(solde_avoir, 0) + $1 WHERE id_client = $2`,
                            [acompte, id_client]
                        );
                        statutAcompte = 'CONVERTI_AVOIR';
                        messageResultat = `Votre rendez-vous a bien été annulé. Suite à une indisponibilité bancaire, votre acompte de ${acompte.toFixed(2)} € a été crédité en Avoir sur votre compte client.`;
                    }
                } else {
                    await dbPool.query(
                        `UPDATE clients SET solde_avoir = COALESCE(solde_avoir, 0) + $1 WHERE id_client = $2`,
                        [acompte, id_client]
                    );
                    statutAcompte = 'CONVERTI_AVOIR';
                    messageResultat = `Votre rendez-vous a bien été annulé. Votre acompte de ${acompte.toFixed(2)} € a été crédité en Avoir sur votre compte client.`;
                }
            }
        } else {
            // Annulation tardive (< 24h) : l'acompte est conservé par le salon
            statutAcompte = 'CONSERVE_NO_SHOW';
            messageResultat = `Votre rendez-vous a été annulé à moins de ${delaiHeures}h. Conformément aux conditions du salon, l'acompte de ${acompte.toFixed(2)} € n'est pas remboursé.`;
        }
    }

    await dbPool.query(
        `UPDATE rendez_vous 
         SET statut = 'ANNULE', 
             statut_acompte = $1,
             date_annulation = NOW(), 
             motif_annulation = 'Annulé par le client depuis Mon Compte'
         WHERE id_rdv = $2`,
        [statutAcompte, id_rdv]
    );

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');

    return {
        success: true,
        message: messageResultat,
        statut_acompte: statutAcompte
    };
}

/**
 * Récupère tous les rendez-vous (à venir et passés) du client dans TOUS les salons STACK
 * GET /api/public/client/rdvs-tous-salons
 */
async function recupererRdvsTousSalons({ pool: p }, { id_client }) {
    const dbPool = p || pool;
    const { normaliserUrlMedia } = require('../settings/settings.service');

    const cliRes = await dbPool.query(
        `SELECT id_client, id_salon, nom, prenom, telephone, email, solde_avoir, points_fidelite, tampons_fidelite
         FROM clients
         WHERE id_client = $1`,
        [id_client]
    );
    if (cliRes.rowCount === 0) {
        const err = new Error("Client introuvable.");
        err.status = 404;
        throw err;
    }
    const client = cliRes.rows[0];
    const telClean = String(client.telephone || '').replace(/[^\d+]/g, '');
    const emailClean = String(client.email || '').trim().toLowerCase();

    const rdvsRes = await dbPool.query(
        `SELECT 
            r.id_rdv,
            r.id_salon,
            r.date_heure_debut,
            r.prestation,
            r.prestations_details,
            COALESCE(r.duree_minutes, 30) AS duree_minutes,
            CASE WHEN r.date_annulation IS NOT NULL OR r.statut = 'ANNULE' THEN 'ANNULE' ELSE 'CONFIRME' END AS statut,
            r.acompte_paye,
            r.statut_acompte,
            e.nom AS employe_nom,
            s.nom_salon,
            COALESCE(s.adresse_salon, '') AS adresse_salon,
            s.logo_url,
            s.photos_salon,
            COALESCE(s.delai_annulation_heures, 24) AS delai_annulation_heures,
            (
                SELECT c.prix FROM catalogue c 
                WHERE c.id_salon = r.id_salon AND c.nom = SPLIT_PART(r.prestation, ' + ', 1)
                LIMIT 1
            ) AS prix_catalogue
         FROM rendez_vous r
         JOIN configuration_salon s ON s.id_salon = r.id_salon
         LEFT JOIN employes e ON e.id_employe = r.id_employe
         WHERE r.id_client = $1
            OR ($2 != '' AND REPLACE(REPLACE(r.telephone_client, ' ', ''), '.', '') = $2)
            OR ($3 != '' AND LOWER(TRIM(r.email_client)) = $3)
         ORDER BY r.date_heure_debut DESC`,
        [id_client, telClean, emailClean]
    );

    const now = new Date();
    const rdvs_a_venir = [];
    const rdvs_passes = [];

    rdvsRes.rows.forEach(r => {
        const dateRdv = new Date(String(r.date_heure_debut).replace('Z', ''));
        const rawPhotos = r.photos_salon;
        const listPhotos = Array.isArray(rawPhotos)
            ? rawPhotos
            : (typeof rawPhotos === 'string' ? (() => { try { return JSON.parse(rawPhotos); } catch (e) { return []; } })() : []);
        const photoSalon = listPhotos.map(normaliserUrlMedia).filter(Boolean)[0] || normaliserUrlMedia(r.logo_url) || null;

        let details = [];
        if (Array.isArray(r.prestations_details) && r.prestations_details.length > 0) {
            details = r.prestations_details;
        } else if (typeof r.prestations_details === 'string') {
            try { details = JSON.parse(r.prestations_details); } catch (e) { details = []; }
        }
        const prixTotal = details.length > 0
            ? details.reduce((acc, item) => acc + (parseFloat(item.prix) || 0), 0)
            : (parseFloat(r.prix_catalogue) || 0);

        const itemObj = {
            id_rdv: r.id_rdv,
            id_salon: r.id_salon,
            nom_salon: r.nom_salon || 'Salon STACK',
            adresse_salon: r.adresse_salon || '',
            photo_salon: photoSalon,
            date_heure_debut: r.date_heure_debut,
            prestation: r.prestation || 'Prestation coiffure',
            prestations_details: details,
            duree_minutes: parseInt(r.duree_minutes, 10) || 30,
            prix_total: prixTotal,
            employe_nom: r.employe_nom ? r.employe_nom.split(' ')[0] : 'Collaborateur',
            statut: r.statut,
            acompte_paye: parseFloat(r.acompte_paye || 0),
            peut_annuler_sans_frais: (dateRdv.getTime() - now.getTime()) >= (parseInt(r.delai_annulation_heures, 10) || 24) * 3600 * 1000
        };

        if (dateRdv >= now && r.statut !== 'ANNULE') {
            rdvs_a_venir.push(itemObj);
        } else {
            rdvs_passes.push(itemObj);
        }
    });

    rdvs_a_venir.sort((a, b) => new Date(a.date_heure_debut) - new Date(b.date_heure_debut));

    return {
        client: {
            id_client: client.id_client,
            id_salon: client.id_salon,
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
            email: client.email,
            solde_avoir: parseFloat(client.solde_avoir || 0)
        },
        rdvs_a_venir,
        rdvs_passes
    };
}

/**
 * Mise à jour des informations du client connecté
 * PUT /api/public/client/me
 */
async function mettreAJourProfilClient({ pool: p }, { id_client, body }) {
    const dbPool = p || pool;
    const { nom, prenom, telephone, email, nouveau_mot_de_passe } = body;

    if (nouveau_mot_de_passe && String(nouveau_mot_de_passe).trim().length >= 6) {
        const hash = await bcrypt.hash(String(nouveau_mot_de_passe).trim(), 10);
        await dbPool.query(`UPDATE clients SET mot_de_passe_hash = $1 WHERE id_client = $2`, [hash, id_client]);
    }

    const upd = await dbPool.query(
        `UPDATE clients
         SET nom = COALESCE($1, nom),
             prenom = COALESCE($2, prenom),
             telephone = COALESCE($3, telephone),
             email = COALESCE($4, email)
         WHERE id_client = $5
         RETURNING id_client, id_salon, nom, prenom, telephone, email, solde_avoir`,
        [
            nom ? nom.trim() : null,
            prenom !== undefined ? String(prenom).trim() : null,
            telephone ? telephone.trim() : null,
            email ? email.trim().toLowerCase() : null,
            id_client
        ]
    );

    return {
        success: true,
        message: "Vos informations ont bien été enregistrées.",
        client: upd.rows[0]
    };
}

module.exports = {
    initClientAuthService,
    genererTokenClient,
    verifierTokenClient,
    inscrireClient,
    connecterClient,
    recupererProfilClient,
    recupererRdvsTousSalons,
    mettreAJourProfilClient,
    annulerRdvParClient
};
