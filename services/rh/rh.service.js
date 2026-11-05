/**
 * services/rh/rh.service.js
 * Gestion du pointage, des tableaux de bord RH, congés, arrêts maladie et objectifs d'équipe
 */

/**
 * Initialise la table des objectifs d'équipe si nécessaire
 */
async function initialiserTableObjectifs({ pool }) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS objectifs_equipe (
            id_objectif SERIAL PRIMARY KEY,
            id_salon INT NOT NULL,
            id_employe INT DEFAULT NULL,
            titre VARCHAR(160) NOT NULL,
            type_indicateur VARCHAR(50) NOT NULL,
            valeur_cible NUMERIC(10,2) NOT NULL,
            recompense VARCHAR(160) DEFAULT NULL,
            date_creation TIMESTAMP DEFAULT NOW()
        )
    `).catch(() => {});
}

/**
 * Calcule les indicateurs individuels d'un collaborateur pour le mois en cours
 */
async function calculerKpisIndividuelsEmploye({ pool }, id_salon, id_employe) {
    const ticketsRes = await pool.query(
        `SELECT 
            COUNT(DISTINCT CASE WHEN COALESCE(type_ticket, 'VENTE') = 'VENTE' AND total_ttc > 0 THEN id_ticket END) AS nb_tickets_mois,
            COALESCE(SUM(CASE WHEN COALESCE(type_ticket, 'VENTE') != 'ANNULATION' THEN total_ttc ELSE 0 END), 0) AS ca_ttc_mois,
            COALESCE(SUM(COALESCE(montant_pourboire, 0)), 0) AS pourboires_mois
         FROM tickets
         WHERE id_salon = $1
           AND id_employe = $2
           AND statut = 'VALIDE'
           AND DATE_TRUNC('month', date_creation) = DATE_TRUNC('month', CURRENT_DATE)`,
        [id_salon, id_employe]
    );

    const fidelesRes = await pool.query(
        `SELECT COUNT(DISTINCT t.id_client) AS nb_fideles
         FROM tickets t
         WHERE t.id_salon = $1
           AND t.id_employe = $2
           AND t.id_client IS NOT NULL
           AND DATE_TRUNC('month', t.date_creation) = DATE_TRUNC('month', CURRENT_DATE)
           AND (SELECT COUNT(*) FROM tickets t2 WHERE t2.id_salon = $1 AND t2.id_client = t.id_client AND COALESCE(t2.type_ticket, 'VENTE') = 'VENTE') >= 2`,
        [id_salon, id_employe]
    );

    const commRes = await pool.query(
        `SELECT
            COALESCE(SUM(CASE WHEN type_vente = 'PRESTATION' THEN montant_commission ELSE 0 END), 0) AS comm_prestation,
            COALESCE(SUM(CASE WHEN type_vente != 'PRESTATION' THEN montant_commission ELSE 0 END), 0) AS comm_produit,
            COUNT(DISTINCT CASE WHEN type_vente != 'PRESTATION' AND montant_vente > 0 THEN id_ticket END) AS nb_tickets_avec_produit,
            COUNT(CASE WHEN type_vente != 'PRESTATION' AND montant_vente > 0 THEN 1 END) AS nb_lignes_produits
         FROM commissions
         WHERE id_salon = $1
           AND id_employe = $2
           AND DATE_TRUNC('month', date_creation) = DATE_TRUNC('month', CURRENT_DATE)`,
        [id_salon, id_employe]
    );

    const tRow = ticketsRes.rows[0] || {};
    const fRow = fidelesRes.rows[0] || {};
    const cRow = commRes.rows[0] || {};

    const nbTickets = parseInt(tRow.nb_tickets_mois, 10) || 0;
    const caTtc = parseFloat(tRow.ca_ttc_mois) || 0;
    const pourboires = parseFloat(tRow.pourboires_mois) || 0;
    const commPresta = parseFloat(cRow.comm_prestation) || 0;
    const commProduit = parseFloat(cRow.comm_produit) || 0;
    const totalComm = Number((commPresta + commProduit).toFixed(2));
    const nbTicketsProduit = parseInt(cRow.nb_tickets_avec_produit, 10) || 0;
    const nbProduitsVendus = parseInt(cRow.nb_lignes_produits, 10) || 0;
    const nbFideles = parseInt(fRow.nb_fideles, 10) || 0;

    const panierMoyen = nbTickets > 0 ? Number((caTtc / nbTickets).toFixed(2)) : 0;
    const tauxRevente = nbTickets > 0 ? Math.min(100, Math.round((nbTicketsProduit / nbTickets) * 100)) : 0;
    const tauxFidelisation = nbTickets > 0 ? Math.min(100, Math.round((nbFideles / nbTickets) * 100)) : 0;

    return {
        nb_clients_mois: nbTickets,
        ca_ttc_mois: Number(caTtc.toFixed(2)),
        panier_moyen: panierMoyen,
        taux_revente: tauxRevente,
        taux_fidelisation: tauxFidelisation,
        nb_produits_vendus: nbProduitsVendus,
        nb_tickets_avec_produit: nbTicketsProduit,
        comm_prestation: Number(commPresta.toFixed(2)),
        comm_produit: Number(commProduit.toFixed(2)),
        commission_totale: totalComm,
        pourboires_mois: Number(pourboires.toFixed(2)),
        cagnotte_globale: Number((totalComm + pourboires).toFixed(2))
    };
}

/**
 * Évalue la valeur courante d'un objectif selon son indicateur
 */
function evaluerValeurObjectif(type_indicateur, kpis) {
    if (type_indicateur === 'CA_TTC') return kpis.ca_ttc_mois || 0;
    if (type_indicateur === 'TAUX_REVENTE') return kpis.taux_revente || 0;
    if (type_indicateur === 'PANIER_MOYEN') return kpis.panier_moyen || 0;
    if (type_indicateur === 'PRODUITS_VENDUS') return kpis.nb_produits_vendus || 0;
    if (type_indicateur === 'NB_CLIENTS') return kpis.nb_clients_mois || 0;
    if (type_indicateur === 'CAGNOTTE_PRIMES') return kpis.cagnotte_globale || 0;
    return 0;
}

/**
 * Récupère les KPIs de gamification et objectifs assignés à un employé
 */
async function recupererGamificationKpis({ pool }, { id_salon, role, id_employe_auth, query_id_employe }) {
    const id_employe = role === 'employe'
        ? parseInt(id_employe_auth, 10)
        : parseInt(query_id_employe, 10);

    if (!id_employe) {
        const err = new Error("Identifiant employé requis.");
        err.status = 400;
        throw err;
    }

    await initialiserTableObjectifs({ pool });
    const kpis = await calculerKpisIndividuelsEmploye({ pool }, id_salon, id_employe);

    const objRes = await pool.query(
        `SELECT * FROM objectifs_equipe
         WHERE id_salon = $1 AND (id_employe IS NULL OR id_employe = $2)
         ORDER BY date_creation DESC`,
        [id_salon, id_employe]
    );

    const objectifs_assignes = objRes.rows.map(o => {
        const cible = parseFloat(o.valeur_cible) || 1;
        const actuel = evaluerValeurObjectif(o.type_indicateur, kpis);
        const progression = Math.min(100, Math.round((actuel / cible) * 100));
        return {
            id_objectif: o.id_objectif,
            titre: o.titre,
            type_indicateur: o.type_indicateur,
            valeur_cible: cible,
            valeur_actuelle: actuel,
            progression,
            atteint: actuel >= cible,
            recompense: o.recompense || ''
        };
    });

    return { ...kpis, objectifs_assignes };
}

/**
 * Récupère la liste globale des objectifs d'équipe pour le gérant
 */
async function recupererObjectifsEquipe({ pool }, id_salon) {
    await initialiserTableObjectifs({ pool });

    const objRes = await pool.query(
        `SELECT o.*, e.nom AS nom_employe
         FROM objectifs_equipe o
         LEFT JOIN employes e ON o.id_employe = e.id_employe AND e.id_salon = o.id_salon
         WHERE o.id_salon = $1
         ORDER BY o.date_creation DESC`,
        [id_salon]
    );

    const empRes = await pool.query('SELECT id_employe, nom FROM employes WHERE id_salon = $1 ORDER BY nom ASC', [id_salon]);
    const kpisParEmp = {};
    for (const emp of empRes.rows) {
        kpisParEmp[emp.id_employe] = await calculerKpisIndividuelsEmploye({ pool }, id_salon, emp.id_employe);
    }

    const objectifsEnrichis = objRes.rows.map(o => {
        const cible = parseFloat(o.valeur_cible) || 1;
        let valeurActuelle = 0;
        if (o.id_employe && kpisParEmp[o.id_employe]) {
            valeurActuelle = evaluerValeurObjectif(o.type_indicateur, kpisParEmp[o.id_employe]);
        } else {
            const listeValeurs = Object.values(kpisParEmp).map(k => evaluerValeurObjectif(o.type_indicateur, k));
            if (o.type_indicateur === 'TAUX_REVENTE' || o.type_indicateur === 'PANIER_MOYEN') {
                valeurActuelle = listeValeurs.length > 0 ? Number((listeValeurs.reduce((a, b) => a + b, 0) / listeValeurs.length).toFixed(1)) : 0;
            } else {
                valeurActuelle = Number(listeValeurs.reduce((a, b) => a + b, 0).toFixed(2));
            }
        }
        const progression = Math.min(100, Math.round((valeurActuelle / cible) * 100));
        return {
            ...o,
            valeur_cible: cible,
            valeur_actuelle: valeurActuelle,
            progression,
            atteint: valeurActuelle >= cible
        };
    });

    return objectifsEnrichis;
}

/**
 * Crée un nouvel objectif d'équipe
 */
async function creerObjectifEquipe({ pool }, { id_salon, role, body }) {
    if (role !== 'gerant') {
        const err = new Error("Action réservée au gérant.");
        err.status = 403;
        throw err;
    }
    const { titre, type_indicateur, valeur_cible, id_employe, recompense } = body;
    const cibleNum = parseFloat(valeur_cible);

    if (!titre || !type_indicateur || isNaN(cibleNum) || cibleNum <= 0) {
        const err = new Error("Veuillez renseigner un titre, un indicateur et une valeur cible valide.");
        err.status = 400;
        throw err;
    }

    await initialiserTableObjectifs({ pool });
    const empIdFinal = (id_employe && id_employe !== 'TOUS') ? parseInt(id_employe, 10) : null;
    await pool.query(
        `INSERT INTO objectifs_equipe (id_salon, id_employe, titre, type_indicateur, valeur_cible, recompense)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id_salon, empIdFinal, String(titre).trim(), type_indicateur, cibleNum, recompense ? String(recompense).trim() : null]
    );
    return { status: 201, message: "Objectif créé avec succès." };
}

/**
 * Supprime un objectif d'équipe
 */
async function supprimerObjectifEquipe({ pool }, { id_salon, role, id_objectif }) {
    if (role !== 'gerant') {
        const err = new Error("Action réservée au gérant.");
        err.status = 403;
        throw err;
    }
    await pool.query('DELETE FROM objectifs_equipe WHERE id_objectif = $1 AND id_salon = $2', [id_objectif, id_salon]);
    return { message: "Objectif supprimé." };
}

/**
 * Ajustement manuel d'heures (Mode Pro)
 */
async function ajusterHeures({ pool }, { id_salon, role, body }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut ajuster les heures.");
        err.status = 403;
        throw err;
    }
    const { id_employe, mois_annee, heures_ajoutees, motif } = body;
    const empCheck = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
    if (empCheck.rowCount === 0) {
        const err = new Error("Employé introuvable dans ce salon.");
        err.status = 403;
        throw err;
    }

    await pool.query(
        `INSERT INTO heures_ajustements (id_employe, mois_annee, heures_ajoutees, motif) VALUES ($1, $2, $3, $4)`,
        [id_employe, mois_annee, heures_ajoutees, motif]
    );
    return { message: "Ajustement enregistré avec succès" };
}

/**
 * Récupère le statut actuel des pointages pour l'affichage chronomètre
 */
async function recupererStatutPointages({ pool }, id_salon) {
    const statuts = await pool.query(`
        SELECT DISTINCT ON (id_employe) id_employe, type_action, heure_action 
        FROM pointages 
        WHERE id_salon = $1 AND date_jour = CURRENT_DATE 
        ORDER BY id_employe, heure_action DESC
    `, [id_salon]);

    const mapStatuts = {};
    statuts.rows.forEach(r => { 
        mapStatuts[r.id_employe] = { action: r.type_action, heure: r.heure_action }; 
    });
    return mapStatuts;
}

/**
 * Enregistrement d'un événement de pointage
 */
async function enregistrerPointage({ pool, io }, { id_salon, role, id_employe_auth, body }) {
    const { id_employe, type_action } = body;
    const actionsValides = ['ENTREE', 'PAUSE_DEBUT', 'PAUSE_FIN', 'SORTIE'];
    if (!actionsValides.includes(type_action)) {
        const err = new Error("Action de pointage invalide.");
        err.status = 400;
        throw err;
    }
    if (role === 'employe' && Number(id_employe_auth) !== Number(id_employe)) {
        const err = new Error("Vous ne pouvez pointer que pour votre propre profil.");
        err.status = 403;
        throw err;
    }

    const empCheck = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
    if (empCheck.rowCount === 0) {
        const err = new Error("Employé introuvable dans ce salon.");
        err.status = 404;
        throw err;
    }

    await pool.query(
        `INSERT INTO pointages (id_employe, id_salon, date_jour, type_action) VALUES ($1, $2, CURRENT_DATE, $3)`,
        [id_employe, id_salon, type_action]
    );

    if (io) {
        io.to(id_salon.toString()).emit('statutPointageUpdate', { 
            id_employe, 
            type_action, 
            heure: new Date().toISOString() 
        });
    }

    return { message: "Pointage enregistré" };
}

/**
 * Calcule le tableau de bord RH complet (heures pointées, ajustements, commissions, avis)
 */
async function calculerTableauBordRH({ pool }, { id_salon, role }) {
    if (role !== 'gerant') {
        const err = new Error("Accès RH réservé au gérant.");
        err.status = 403;
        throw err;
    }

    const rhQuery = `SELECT e.id_employe, e.nom, e.photo_url, COALESCE(e.role, 'Employé') as role, 
                            e.type_contrat, e.heures_mensuelles_base, e.est_gerant, 
                            COUNT(DISTINCT CASE WHEN c.type_vente = 'PRESTATION' THEN c.id_ticket END) as clients_coiffes, 
                            COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as produits_vendus, 
                            COALESCE(SUM(c.montant_vente), 0) as ca_genere, 
                            COALESCE(SUM(c.montant_commission), 0) as prime_estimee 
                     FROM employes e 
                     LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 
                     WHERE e.id_salon = $1 
                     GROUP BY e.id_employe, e.nom, e.photo_url, e.role, e.type_contrat, e.heures_mensuelles_base, e.est_gerant 
                     ORDER BY e.id_employe;`;
    const rhResult = await pool.query(rhQuery, [id_salon]);

    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const jourSemaine = now.getDay();
    const diffLundi = now.getDate() - jourSemaine + (jourSemaine === 0 ? -6 : 1);
    const debutSemaine = new Date(now.getFullYear(), now.getMonth(), diffLundi);
    debutSemaine.setHours(0, 0, 0, 0);
    const debutRecherche = debutMois < debutSemaine ? debutMois : debutSemaine;
    const formatYMDLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const aujourdhuiYMD = formatYMDLocal(now);

    const pointagesRes = await pool.query(
        `SELECT id_employe, TO_CHAR(date_jour, 'YYYY-MM-DD') as date_ymd, type_action, heure_action
         FROM pointages
         WHERE id_salon = $1 AND date_jour >= $2
         ORDER BY id_employe ASC, date_jour ASC, heure_action ASC`,
        [id_salon, formatYMDLocal(debutRecherche)]
    );

    const moisCourantStr = aujourdhuiYMD.slice(0, 7);
    const ajustRes = await pool.query(
        `SELECT ha.id_employe, COALESCE(SUM(ha.heures_ajoutees), 0) as total_ajust
         FROM heures_ajustements ha
         JOIN employes e ON e.id_employe = ha.id_employe
         WHERE ha.mois_annee = $1 AND e.id_salon = $2
         GROUP BY ha.id_employe`,
        [moisCourantStr, id_salon]
    );
    const mapAjustMois = {};
    ajustRes.rows.forEach(r => { mapAjustMois[r.id_employe] = parseFloat(r.total_ajust) || 0; });

    const parEmpJour = {};
    pointagesRes.rows.forEach(pt => {
        const cle = `${pt.id_employe}_${pt.date_ymd}`;
        if (!parEmpJour[cle]) parEmpJour[cle] = { id_employe: pt.id_employe, date_ymd: pt.date_ymd, actions: [] };
        parEmpJour[cle].actions.push({ type: pt.type_action, ts: new Date(pt.heure_action).getTime() });
    });

    const heuresParEmploye = {};
    Object.values(parEmpJour).forEach(jour => {
        let debutTravail = null;
        let debutPause = null;
        let cumulMs = 0;

        jour.actions.forEach(act => {
            if (act.type === 'ENTREE') {
                if (debutTravail === null) debutTravail = act.ts;
            } else if (act.type === 'PAUSE_DEBUT') {
                if (debutTravail !== null && debutPause === null) debutPause = act.ts;
            } else if (act.type === 'PAUSE_FIN') {
                if (debutPause !== null) {
                    debutTravail += (act.ts - debutPause);
                    debutPause = null;
                }
            } else if (act.type === 'SORTIE') {
                if (debutTravail !== null) {
                    const finEff = debutPause !== null ? debutPause : act.ts;
                    if (finEff > debutTravail) cumulMs += (finEff - debutTravail);
                    debutTravail = null;
                    debutPause = null;
                }
            }
        });

        if (debutTravail !== null) {
            if (jour.date_ymd === aujourdhuiYMD) {
                const finDirect = debutPause !== null ? debutPause : Date.now();
                if (finDirect > debutTravail) cumulMs += (finDirect - debutTravail);
            } else if (debutPause !== null && debutPause > debutTravail) {
                cumulMs += (debutPause - debutTravail);
            }
        }

        const hJour = cumulMs / 3600000;
        if (!heuresParEmploye[jour.id_employe]) {
            heuresParEmploye[jour.id_employe] = { aujourdhui: 0, semaine: 0, mois: 0 };
        }
        const dObj = new Date(jour.date_ymd + 'T12:00:00');
        if (jour.date_ymd === aujourdhuiYMD) heuresParEmploye[jour.id_employe].aujourdhui += hJour;
        if (dObj >= debutSemaine) heuresParEmploye[jour.id_employe].semaine += hJour;
        if (dObj >= debutMois) heuresParEmploye[jour.id_employe].mois += hJour;
    });

    const employesData = await Promise.all(rhResult.rows.map(async (emp) => {
        const histoQuery = `SELECT COALESCE(SUM(montant_commission), 0) as total_prime 
                            FROM commissions 
                            WHERE id_employe = $1 AND id_salon = $2 
                            GROUP BY EXTRACT(MONTH FROM date_creation), EXTRACT(YEAR FROM date_creation) 
                            ORDER BY EXTRACT(YEAR FROM date_creation) ASC, EXTRACT(MONTH FROM date_creation) ASC;`;
        const histoResult = await pool.query(histoQuery, [emp.id_employe, id_salon]);
        let historique = histoResult.rows.map(r => parseFloat(r.total_prime));
        while (historique.length < 6) historique.unshift(0);
        if (historique.every(val => val === 0)) historique = [0, 0, 0, 0, 0, parseFloat(emp.prime_estimee) || 0];

        const avisEmp = await pool.query(
            `SELECT note, commentaire, prenom, date_creation 
             FROM avis_demandes 
             WHERE id_salon = $2 AND id_employe = $1 AND statut = 'REPONDU' AND note IS NOT NULL 
             ORDER BY date_creation DESC`,
            [emp.id_employe, id_salon]
        );
        const notes = avisEmp.rows.map(a => a.note);
        const moyenneNote = notes.length > 0 ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;
        const hEmp = heuresParEmploye[emp.id_employe] || { aujourdhui: 0, semaine: 0, mois: 0 };
        const ajustMois = mapAjustMois[emp.id_employe] || 0;

        return {
            id_employe: emp.id_employe,
            nom: emp.nom,
            role: emp.role,
            est_gerant: emp.est_gerant,
            type_contrat: emp.type_contrat || '35H',
            heures_mensuelles_base: parseFloat(emp.heures_mensuelles_base) || 151.67,
            photo_url: emp.photo_url,
            heures_effectuees: {
                aujourdhui: Number(hEmp.aujourdhui.toFixed(2)),
                semaine: Number(hEmp.semaine.toFixed(2)),
                mois: Number((hEmp.mois + ajustMois).toFixed(2)),
                ajustements_mois: Number(ajustMois.toFixed(2))
            },
            performances_actuelles: {
                clients_coiffes: parseInt(emp.clients_coiffes, 10),
                produits_vendus: parseInt(emp.produits_vendus, 10),
                ca_genere: parseFloat(emp.ca_genere),
                prime_estimee: parseFloat(emp.prime_estimee)
            },
            historique_primes: historique.slice(-6),
            note_moyenne: moyenneNote,
            nb_avis: notes.length,
            derniers_avis: avisEmp.rows.slice(0, 3)
        };
    }));

    return employesData;
}

/**
 * Dépôt d'une absence (congé ou arrêt maladie) avec justificatif R2
 */
async function deposerAbsence({ pool, s3Client, PutObjectCommand, envoyerNotificationPush }, { id_salon, role, id_employe_auth, body }) {
    const { type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fichier_base64, nom_fichier, type_mime } = body;
    const id_employe = role === 'employe' ? id_employe_auth : body.id_employe;

    const emp = await pool.query('SELECT nom FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
    if (emp.rowCount === 0) {
        const err = new Error("Collaborateur introuvable dans ce salon.");
        err.status = 404;
        throw err;
    }
    const nomEmploye = emp.rows[0].nom;

    const conflit = await pool.query(
        `SELECT 1 FROM absences_employes 
         WHERE id_salon = $1 AND id_employe = $2 AND statut != 'REFUSE' 
         AND date_debut <= $4 AND date_fin >= $3`,
        [id_salon, id_employe, date_debut, date_fin]
    );

    if (conflit.rowCount > 0) {
        const err = new Error("Une absence ou demande est déjà enregistrée sur ces dates pour ce collaborateur.");
        err.status = 400;
        throw err;
    }

    let fileKey = null;

    if (fichier_base64 && nom_fichier) {
        if (typeof fichier_base64 !== 'string' || fichier_base64.length > 7000000) {
            const err = new Error("Justificatif trop volumineux (max 5 Mo).");
            err.status = 400;
            throw err;
        }

        const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        const extension = nom_fichier.split('.').pop().toLowerCase();
        const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];

        if (!type_mime || !allowedMimes.includes(type_mime) || !allowedExts.includes(extension)) {
            const err = new Error("Format de fichier non autorisé. Seuls les PDF, JPG et PNG sont acceptés.");
            err.status = 400;
            throw err;
        }

        fileKey = `salons/${id_salon}/employes/${id_employe}/absences/${Date.now()}.${extension}`;
        const buffer = Buffer.from(fichier_base64.replace(/^data:.*,/, ''), 'base64');
        if (s3Client && PutObjectCommand) {
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey,
                Body: buffer,
                ContentType: type_mime,
            }));
        }
    }

    const statutInitial = type_demande === 'ARRET_MALADIE' ? 'VALIDE' : 'EN_ATTENTE';

    await pool.query(
        `INSERT INTO absences_employes (id_salon, id_employe, type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fichier_cle_r2, statut)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id_absence`,
        [id_salon, id_employe, type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fileKey, statutInitial]
    );

    let conflits = [];
    if (statutInitial === 'VALIDE') {
        const rdvs = await pool.query(
            `SELECT id_rdv, nom_client, telephone_client, date_heure_debut, prestation 
             FROM rendez_vous WHERE id_salon = $1 AND id_employe = $2 
             AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') >= $3 
             AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') <= $4
             ORDER BY date_heure_debut ASC`,
            [id_salon, id_employe, date_debut, date_fin]
        );
        conflits = rdvs.rows;
    }

    if (type_demande === 'ARRET_MALADIE') {
        await pool.query(
            "INSERT INTO taches_actions (id_salon, titre, description, source) VALUES ($1, $2, $3, 'IA')",
            [id_salon, `URGENCE : Arrêt maladie de ${nomEmploye}`, `${nomEmploye} a déposé un arrêt maladie du ${date_debut} au ${date_fin}. Vérifiez l'agenda pour déplacer ses rendez-vous.`]
        );
        if (envoyerNotificationPush) {
            envoyerNotificationPush(id_salon, 'gerant', { title: "Arrêt Maladie", body: `${nomEmploye} est en arrêt maladie jusqu'au ${date_fin}.`, url: '/?tab=actions' });
        }
        return { message: "Arrêt maladie enregistré.", conflits };
    } else {
        if (envoyerNotificationPush) {
            envoyerNotificationPush(id_salon, 'gerant', { title: "Demande de congés", body: `${nomEmploye} a posé une demande du ${date_debut} au ${date_fin}.`, url: '/?tab=equipe' });
        }
        return { message: "Demande envoyée pour validation.", conflits };
    }
}

/**
 * Validation ou refus d'une absence par le gérant
 */
async function deciderAbsence({ pool, envoyerNotificationPush }, { id_salon, role, id_absence, body }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut valider ou refuser une absence.");
        err.status = 403;
        throw err;
    }

    const { statut, motif_refus } = body;
    let conflits = [];

    if (statut === 'VALIDE') {
        const absenceResInfo = await pool.query(
            "SELECT id_employe, TO_CHAR(date_debut, 'YYYY-MM-DD') as date_debut_str, TO_CHAR(date_fin, 'YYYY-MM-DD') as date_fin_str FROM absences_employes WHERE id_absence = $1 AND id_salon = $2",
            [id_absence, id_salon]
        );
        if (absenceResInfo.rowCount > 0) {
            const absInfo = absenceResInfo.rows[0];
            const rdvs = await pool.query(
                `SELECT id_rdv, nom_client, telephone_client, date_heure_debut, prestation 
                 FROM rendez_vous WHERE id_salon=$1 AND id_employe=$2 
                 AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') >= $3 
                 AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') <= $4
                 ORDER BY date_heure_debut ASC`,
                [id_salon, absInfo.id_employe, absInfo.date_debut_str, absInfo.date_fin_str]
            );
            conflits = rdvs.rows;
        }
    }

    const absRes = await pool.query(
        `UPDATE absences_employes SET statut = $1, motif_refus = $2 WHERE id_absence = $3 AND id_salon = $4 RETURNING id_employe, date_debut, date_fin, type_demande`,
        [statut, motif_refus || null, id_absence, id_salon]
    );

    if (absRes.rowCount > 0) {
        const absence = absRes.rows[0];
        const dDebut = new Date(absence.date_debut).toLocaleDateString('fr-FR');
        const dFin = new Date(absence.date_fin).toLocaleDateString('fr-FR');
        const message = statut === 'VALIDE' 
            ? `Vos ${absence.type_demande === 'CONGES' ? 'congés' : 'absences'} du ${dDebut} au ${dFin} ont été validés.` 
            : (motif_refus ? `Votre demande a été refusée. Motif : ${motif_refus}` : `Votre demande de congés a été refusée.`);

        if (envoyerNotificationPush) {
            envoyerNotificationPush(id_salon, { type: 'employe', id_employe: absence.id_employe }, { title: "Décision RH", body: message, url: '/?tab=agenda' });
        }
    }

    return { message: `Demande passée au statut : ${statut}`, conflits };
}

/**
 * Génère un lien de consultation temporaire (15 min) pour un justificatif Cloudflare R2
 */
async function genererLienJustificatifAbsence({ pool, s3Client, GetObjectCommand, getSignedUrl }, { id_salon, role, id_employe_auth, id_absence }) {
    const absenceRes = await pool.query(
        'SELECT id_employe, fichier_cle_r2 FROM absences_employes WHERE id_absence = $1 AND id_salon = $2',
        [id_absence, id_salon]
    );

    if (absenceRes.rowCount === 0 || !absenceRes.rows[0].fichier_cle_r2) {
        const err = new Error("Aucun justificatif trouvé.");
        err.status = 404;
        throw err;
    }

    if (role !== 'gerant' && (role !== 'employe' || Number(id_employe_auth) !== Number(absenceRes.rows[0].id_employe))) {
        const err = new Error("Accès refusé à ce justificatif médical.");
        err.status = 403;
        throw err;
    }

    const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: absenceRes.rows[0].fichier_cle_r2
    });
    const urlTemporaire = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return { url: urlTemporaire };
}

/**
 * Récupère l'historique complet des absences pour le salon
 */
async function recupererAbsences({ pool }, { id_salon, role }) {
    if (role !== 'gerant' && role !== 'salon') {
        const err = new Error("Accès refusé.");
        err.status = 403;
        throw err;
    }

    const result = await pool.query(`
        SELECT a.*, e.nom as nom_employe 
        FROM absences_employes a 
        JOIN employes e ON a.id_employe = e.id_employe 
        WHERE a.id_salon = $1 
        ORDER BY CASE WHEN a.statut = 'EN_ATTENTE' THEN 0 ELSE 1 END, a.date_creation DESC
    `, [id_salon]);

    return result.rows;
}

module.exports = {
    initialiserTableObjectifs,
    calculerKpisIndividuelsEmploye,
    evaluerValeurObjectif,
    recupererGamificationKpis,
    recupererObjectifsEquipe,
    creerObjectifEquipe,
    supprimerObjectifEquipe,
    ajusterHeures,
    recupererStatutPointages,
    enregistrerPointage,
    calculerTableauBordRH,
    deposerAbsence,
    deciderAbsence,
    genererLienJustificatifAbsence,
    recupererAbsences
};
