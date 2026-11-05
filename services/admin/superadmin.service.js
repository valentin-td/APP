// =========================================================================
// SERVICE SUPER-ADMINISTRATION & MAINTENANCE SYSTÈME (STACK SaaS)
// =========================================================================

/**
 * Middleware de vérification du rôle Super-Admin
 */
async function verifierSuperAdminMiddleware({ pool }, req, res, next) {
    try {
        const superAdminEmail = process.env.SUPERADMIN_EMAIL || '2@gmail.com';
        const userRes = await pool.query(
            "SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1",
            [req.user.id_salon]
        );
        if (userRes.rowCount === 0 || userRes.rows[0].email !== superAdminEmail) {
            return res.status(403).json({ erreur: "Accès refusé. God mode uniquement." });
        }
        next();
    } catch (e) {
        return res.status(500).json({ erreur: "Erreur de vérification des droits admin." });
    }
}

/**
 * Déclenchement manuel de l'ensemble des robots d'arrière-plan
 */
async function forcerExecutionRobots({
    executerRapportHebdoGerant,
    executerRobotComptable,
    executerClotureFantome,
    executerRobotMarketingEtPredictif,
    executerEnvoiComptable
}) {
    console.log("=========================================");
    console.log("=== DÉCLENCHEMENT MANUEL DES ROBOTS ===");
    console.log("=========================================");

    if (typeof executerRapportHebdoGerant === 'function') {
        await executerRapportHebdoGerant();
    }

    if (typeof executerRobotComptable === 'function') executerRobotComptable();
    if (typeof executerClotureFantome === 'function') executerClotureFantome();
    if (typeof executerRobotMarketingEtPredictif === 'function') executerRobotMarketingEtPredictif();
    if (typeof executerEnvoiComptable === 'function') executerEnvoiComptable();

    return { message: "Le cycle du robot hebdomadaire est terminé ! Les autres robots tournent en fond." };
}

/**
 * Simulation d'expiration de période d'essai (Environnement développement)
 */
async function timeTravelSalon({ pool }, { id_salon }) {
    if (process.env.NODE_ENV === 'production') {
        throw { status: 403, message: "Désactivé en production." };
    }
    await pool.query(
        "UPDATE configuration_salon SET date_fin_essai = NOW() - INTERVAL '5 days' WHERE id_salon = $1", 
        [id_salon]
    );
    return { message: `⏳ Voyage dans le temps réussi ! L'essai du salon #${id_salon} est maintenant expiré.` };
}

/**
 * Injection de données SIRET pour test PDF (Développement)
 */
async function fixSiret38({ pool }) {
    if (process.env.NODE_ENV === 'production') {
        throw { status: 403, message: "Désactivé en production." };
    }
    await pool.query(
        "UPDATE configuration_salon SET siret = '12345678901234', adresse_salon = '123 Rue de Test, 75000 Paris' WHERE id_salon = 38"
    );
    return { message: "✅ SIRET et Adresse injectés avec succès !" };
}

/**
 * Métriques globales de la plateforme (Total salons, Salons actifs, MRR)
 */
async function recupererStatsSuperAdmin({ pool }) {
    const totalSalons = await pool.query("SELECT COUNT(*) as count FROM configuration_salon");
    const activeSalons = await pool.query("SELECT COUNT(*) as count FROM utilisateurs WHERE statut_abonnement = 'actif' AND role = 'gerant'");
    const mrr = parseInt(activeSalons.rows[0].count, 10) * 49;

    return {
        total_salons: totalSalons.rows[0].count,
        salons_actifs: activeSalons.rows[0].count,
        mrr_estime: mrr
    };
}

/**
 * Liste complète de tous les salons pour le super-administrateur
 */
async function listerSalonsSuperAdmin({ pool }) {
    const query = `
        SELECT c.id_salon, c.nom_salon, u.email, u.statut_abonnement 
        FROM configuration_salon c
        JOIN utilisateurs u ON c.id_salon = u.id_salon
        WHERE u.role = 'gerant'
        ORDER BY c.id_salon DESC
    `;
    const result = await pool.query(query);
    return result.rows;
}

/**
 * Mise à jour du statut d'abonnement d'un salon par le super-administrateur
 */
async function mettreAJourStatutSalonSuperAdmin({ pool }, { id_salon, statut }) {
    await pool.query(
        "UPDATE utilisateurs SET statut_abonnement = $1 WHERE id_salon = $2 AND role = 'gerant'",
        [statut, id_salon]
    );
    return { message: `Le salon #${id_salon} est maintenant ${statut}.` };
}

/**
 * Purge complète des données opérationnelles d'un salon (Conformité RGPD et conservation stricte des archives fiscales NF525)
 */
async function purgerSalonSuperAdmin({ pool, enregistrerJET }, { id_salon, id_user_salon }) {
    const id = parseInt(id_salon, 10);
    if (id === parseInt(id_user_salon, 10)) {
        throw { status: 403, message: "Impossible de supprimer votre propre salon fondateur." };
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        // Conservation stricte NF525 (6 ans) : jet_logs, tickets, lignes_ticket, commissions, clotures_caisse
        // Seules les données opérationnelles et personnelles sont purgées/anonymisées
        await clientDB.query('DELETE FROM rendez_vous WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM absences_employes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM recettes_articles WHERE id_protocole IN (SELECT id_protocole FROM protocoles WHERE id_salon = $1)', [id]);
        await clientDB.query('DELETE FROM protocoles WHERE id_salon = $1', [id]);
        
        await clientDB.query('DELETE FROM catalogue WHERE id_salon = $1 AND id_article NOT IN (SELECT DISTINCT id_article FROM lignes_ticket WHERE id_salon = $1 AND id_article IS NOT NULL)', [id]);
        await clientDB.query("UPDATE employes SET nom = 'Collaborateur Anonymisé #' || id_employe, code_pin = NULL, photo_url = NULL WHERE id_salon = $1 AND id_employe IN (SELECT DISTINCT id_employe FROM tickets WHERE id_salon = $1 AND id_employe IS NOT NULL UNION SELECT DISTINCT id_employe FROM commissions WHERE id_salon = $1 AND id_employe IS NOT NULL)", [id]);
        await clientDB.query('DELETE FROM employes WHERE id_salon = $1 AND id_employe NOT IN (SELECT DISTINCT id_employe FROM tickets WHERE id_salon = $1 AND id_employe IS NOT NULL UNION SELECT DISTINCT id_employe FROM commissions WHERE id_salon = $1 AND id_employe IS NOT NULL)', [id]);
        await clientDB.query("UPDATE clients SET nom = 'Client Anonymisé #' || id_client, prenom = '', telephone = NULL, email = NULL, notes = NULL, date_naissance = NULL WHERE id_salon = $1 AND id_client IN (SELECT DISTINCT id_client FROM tickets WHERE id_salon = $1 AND id_client IS NOT NULL)", [id]);
        await clientDB.query('DELETE FROM clients WHERE id_salon = $1 AND id_client NOT IN (SELECT DISTINCT id_client FROM tickets WHERE id_salon = $1 AND id_client IS NOT NULL)', [id]);
        await clientDB.query('DELETE FROM avis_demandes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM taches_actions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM ia_taches_attente WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM push_subscriptions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM sms_opt_out WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM messages WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM pointages WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM utilisateurs WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM configuration_salon WHERE id_salon = $1', [id]);

        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(id, 'PURGE_RGPD_SALON', { purge_par: 'SUPERADMIN', archives_fiscales_conservees: true }, clientDB);
        }

        await clientDB.query('COMMIT');
        return { message: `Le salon #${id} a été purgé (archives fiscales et comptables NF525 conservées).` };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur purge salon superadmin :", e);
        if (e.status) throw e;
        throw { status: 500, message: "Erreur lors de la destruction du salon : " + e.message };
    } finally {
        clientDB.release();
    }
}

module.exports = {
    verifierSuperAdminMiddleware,
    forcerExecutionRobots,
    timeTravelSalon,
    fixSiret38,
    recupererStatsSuperAdmin,
    listerSalonsSuperAdmin,
    mettreAJourStatutSalonSuperAdmin,
    purgerSalonSuperAdmin
};
