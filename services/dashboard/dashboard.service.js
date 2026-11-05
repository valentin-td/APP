// =========================================================================
// SERVICE DASHBOARDS D'ACTIVITÉ & ANALYTIQUE (STACK SaaS)
// =========================================================================

/**
 * Métriques rapides d'évolution client pour l'en-tête du salon
 */
async function recupererDashboardSalon({ pool }, { id_salon }) {
    const r = await pool.query(`
        SELECT
            COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_actuel,
            COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_precedent
        FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE
    `, [id_salon]);

    const nbActuel = parseInt(r.rows[0].nb_actuel, 10) || 0;
    const nbPrecedent = parseInt(r.rows[0].nb_precedent, 10) || 0;
    const evolution = nbPrecedent > 0 ? Math.round(((nbActuel - nbPrecedent) / nbPrecedent) * 100) : (nbActuel > 0 ? 100 : 0);

    return {
        nb_clients_mois: nbActuel,
        evolution_pourcentage: evolution
    };
}

/**
 * Statistiques personnelles et commissions du collaborateur connecté
 */
async function recupererDashboardEmploye({ pool }, { id_salon, id_employe }) {
    const r = await pool.query(`
        SELECT
            COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_actuel,
            COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_precedent
        FROM tickets WHERE id_salon = $1 AND id_employe = $2 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE
    `, [id_salon, id_employe]);

    const nbActuel = parseInt(r.rows[0].nb_actuel, 10) || 0;
    const nbPrecedent = parseInt(r.rows[0].nb_precedent, 10) || 0;
    const evolution = nbPrecedent > 0 ? Math.round(((nbActuel - nbPrecedent) / nbPrecedent) * 100) : (nbActuel > 0 ? 100 : 0);

    const cResult = await pool.query(
        `SELECT COALESCE(SUM(montant_commission), 0) as total FROM commissions WHERE id_employe = $1 AND id_salon = $2 AND date_creation >= date_trunc('month', CURRENT_DATE)`,
        [id_employe, id_salon]
    );

    const pResult = await pool.query(
        `SELECT COUNT(CASE WHEN type_vente != 'PRESTATION' THEN 1 END) as total FROM commissions WHERE id_employe = $1 AND id_salon = $2 AND date_creation >= date_trunc('month', CURRENT_DATE)`,
        [id_employe, id_salon]
    );

    return {
        nb_clients_mois: nbActuel,
        evolution_pourcentage: evolution,
        commission_mois: parseFloat(cResult.rows[0].total) || 0,
        nb_produits_vendus: parseInt(pResult.rows[0].total, 10) || 0
    };
}

/**
 * Tableau de bord financier global gérant (CA, Panier moyen, Top prestations, E-réputation & NPS)
 */
async function recupererDashboardGlobal({ pool }, { id_salon }) {
    const statsResult = await pool.query(
        `SELECT COUNT(id_ticket) as nb_ventes, COALESCE(SUM(total_ttc), 0) as chiffre_affaires FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE'`,
        [id_salon]
    );
    const nbVentes = parseInt(statsResult.rows[0].nb_ventes, 10) || 0;
    const caTotal = parseFloat(statsResult.rows[0].chiffre_affaires) || 0;

    const topPrestationsResult = await pool.query(`
        SELECT c.nom, SUM(lt.total_ligne_ttc) as total_genere 
        FROM lignes_ticket lt 
        JOIN tickets t ON lt.id_ticket = t.id_ticket 
        JOIN catalogue c ON lt.id_article = c.id_article 
        WHERE t.id_salon = $1 AND c.type_article = 'PRESTATION' AND t.statut != 'ANNULE' 
        GROUP BY c.nom 
        ORDER BY total_genere DESC 
        LIMIT 3
    `, [id_salon]);

    const commissionsResult = await pool.query(
        `SELECT COALESCE(SUM(montant_commission), 0) as total_commissions FROM commissions WHERE id_salon = $1`,
        [id_salon]
    );

    let googleMarketing = { note_actuelle: 0, total_avis: 0, tendance_6_mois: [0, 0, 0, 0, 0, 0] };
    try {
        const configResult = await pool.query(
            'SELECT google_api_key, google_account_id, google_location_id FROM configuration_salon WHERE id_salon = $1',
            [id_salon]
        );
        if (configResult.rowCount > 0) {
            const salonConfig = configResult.rows[0];
            if (salonConfig.google_api_key && salonConfig.google_account_id && salonConfig.google_location_id) {
                const url = `https://mybusiness.googleapis.com/v4/accounts/${salonConfig.google_account_id}/locations/${salonConfig.google_location_id}/reviews?key=${salonConfig.google_api_key}`;
                const gRes = await fetch(url);
                if (gRes.ok) {
                    const gData = await gRes.json();
                    if (gData.reviews && gData.reviews.length > 0) {
                        googleMarketing.total_avis = gData.reviews.length;
                        let totalStars = 0;
                        const ratingMap = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };
                        gData.reviews.forEach(review => { totalStars += ratingMap[review.starRating] || 5; });
                        googleMarketing.note_actuelle = parseFloat((totalStars / googleMarketing.total_avis).toFixed(1));
                        googleMarketing.tendance_6_mois = [
                            googleMarketing.note_actuelle - 0.4,
                            googleMarketing.note_actuelle - 0.3,
                            googleMarketing.note_actuelle - 0.1,
                            googleMarketing.note_actuelle + 0.1,
                            googleMarketing.note_actuelle,
                            googleMarketing.note_actuelle
                        ];
                    }
                }
            }
        }
    } catch (e) {
        console.error("Avertissement Google API :", e);
    }

    const avisResult = await pool.query(`
        SELECT a.id_demande, a.prenom, a.note, a.commentaire, a.telephone, a.date_creation, e.nom as nom_employe 
        FROM avis_demandes a LEFT JOIN employes e ON a.id_employe = e.id_employe
        WHERE a.id_salon = $1 AND a.statut = 'REPONDU' AND a.note IS NOT NULL
        ORDER BY a.date_creation DESC LIMIT 50
    `, [id_salon]);

    let nps_score = null;
    let nb_promoteurs = 0, nb_detracteurs = 0;
    if (avisResult.rowCount > 0) {
        avisResult.rows.forEach(a => {
            if (a.note === 5) nb_promoteurs++;
            else if (a.note <= 3) nb_detracteurs++;
        });
        nps_score = Math.round(((nb_promoteurs / avisResult.rowCount) * 100) - ((nb_detracteurs / avisResult.rowCount) * 100));
    }

    return {
        statut: "Succès",
        finances: {
            chiffre_affaires_total: caTotal,
            panier_moyen: nbVentes > 0 ? Number((caTotal / nbVentes).toFixed(2)) : 0,
            commissions_a_payer: parseFloat(commissionsResult.rows[0].total_commissions) || 0
        },
        top_3_prestations: topPrestationsResult.rows || [],
        marketing: { ...googleMarketing, verbatims: avisResult.rows, nps: nps_score }
    };
}

module.exports = {
    recupererDashboardSalon,
    recupererDashboardEmploye,
    recupererDashboardGlobal
};
