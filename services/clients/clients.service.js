const { pool: defaultPool } = require('../../config/db');
const { enregistrerJET: defaultEnregistrerJET } = require('../caisse/caisse.service');

let pool = defaultPool;

function initClientsService(deps = {}) {
    if (deps.pool) pool = deps.pool;
}

/**
 * Récupère la liste de tous les clients d'un salon
 */
async function recupererClients({ pool: p }, id_salon) {
    const dbPool = p || pool;
    const result = await dbPool.query('SELECT * FROM clients WHERE id_salon = $1 ORDER BY nom ASC', [id_salon]);
    return result.rows;
}

/**
 * Crée un nouveau client pour un salon
 */
async function creerClient({ pool: p }, { id_salon, body }) {
    const dbPool = p || pool;
    const { prenom, nom, telephone, email, date_naissance } = body;
    await dbPool.query(
        'INSERT INTO clients (prenom, nom, telephone, email, date_naissance, id_salon) VALUES ($1, $2, $3, $4, $5, $6)',
        [prenom || '', nom, telephone, email, date_naissance || null, id_salon]
    );
    return { message: "Client ajouté" };
}

/**
 * Supprime ou anonymise un client (conservation fiscale NF525 si lié à des tickets)
 */
async function supprimerClient({ pool: p, enregistrerJET: jetFn }, { id_salon, role, id_client }) {
    const dbPool = p || pool;
    const jet = jetFn || defaultEnregistrerJET;

    if (role === 'employe') {
        const err = new Error("Action non autorisée.");
        err.status = 403;
        throw err;
    }

    const lieTicket = await dbPool.query('SELECT 1 FROM tickets WHERE id_client = $1 AND id_salon = $2 LIMIT 1', [id_client, id_salon]);
    if (lieTicket.rowCount > 0) {
        await dbPool.query(
            "UPDATE clients SET nom = 'Client Anonymisé #' || id_client, prenom = '', telephone = NULL, email = NULL, notes = NULL, date_naissance = NULL, remise_winback = NULL WHERE id_client = $1 AND id_salon = $2",
            [id_client, id_salon]
        );
        if (jet) await jet(id_salon, 'ANONYMISATION_CLIENT_RGPD', { id_client: parseInt(id_client, 10) });
        return { message: "Client anonymisé (conservation fiscale NF525 des tickets liés)." };
    }
    await dbPool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
    return { message: "Client supprimé" };
}

/**
 * Récupère l'historique complet d'un client (achats, rendez-vous, remises de fidélité)
 */
async function recupererHistoriqueClient({ pool: p }, { id_salon, id_client }) {
    const dbPool = p || pool;
    const clientRes = await dbPool.query('SELECT notes, telephone FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
    if (clientRes.rowCount === 0) {
        const err = new Error("Client introuvable");
        err.status = 404;
        throw err;
    }
    
    const achatsRes = await dbPool.query(
        `SELECT t.id_ticket, (CASE WHEN t.est_compense THEN 'ANNULE' ELSE 'VALIDE' END) as statut, t.date_creation, COALESCE(lt.nom_article_snapshot, c.nom) as article, lt.quantite, lt.prix_unitaire_ttc 
         FROM tickets t 
         JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket 
         LEFT JOIN catalogue c ON lt.id_article = c.id_article 
         WHERE t.id_client = $1 AND t.id_salon = $2 AND t.type_ticket != 'ANNULATION' 
         ORDER BY t.date_creation DESC LIMIT 20`,
        [id_client, id_salon]
    );
    const rdvRes = await dbPool.query(
        `SELECT date_heure_debut, prestation, e.nom as nom_employe 
         FROM rendez_vous r 
         LEFT JOIN employes e ON r.id_employe = e.id_employe 
         WHERE r.telephone_client = $1 AND r.id_salon = $2 
         ORDER BY r.date_heure_debut DESC LIMIT 20`,
        [clientRes.rows[0].telephone, id_salon]
    );
    const gainsRes = await dbPool.query(
        `SELECT date_creation, total_ttc 
         FROM tickets 
         WHERE id_client = $1 AND id_salon = $2 AND recompense_utilisee = TRUE AND statut != 'ANNULE' AND est_compense = FALSE 
         ORDER BY date_creation DESC LIMIT 20`,
        [id_client, id_salon]
    );

    return {
        notes: clientRes.rows[0].notes || '',
        achats: achatsRes.rows,
        rdv: rdvRes.rows,
        gains: gainsRes.rows
    };
}

/**
 * Met à jour les notes d'un client
 */
async function mettreAJourNotesClient({ pool: p }, { id_salon, id_client, notes }) {
    const dbPool = p || pool;
    await dbPool.query('UPDATE clients SET notes = $1 WHERE id_client = $2 AND id_salon = $3', [notes, id_client, id_salon]);
    return { message: "Notes sauvegardées" };
}

module.exports = {
    initClientsService,
    recupererClients,
    creerClient,
    supprimerClient,
    recupererHistoriqueClient,
    mettreAJourNotesClient
};
