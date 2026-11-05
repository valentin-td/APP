// jobs/cronJobs.js
// Centralisation de toutes les tâches d'arrière-plan, crons et robots autonomes STACK

let pool, cron, crypto, dechiffrer, ImapFlow, simpleParser, pdfParse, s3Client,
    PutObjectCommand, GetObjectCommand, getSignedUrl, analyserEmailAvecIA,
    envoyerEvenementSSE, envoyerNotificationPush, envoyerSMS, envoyerSMS_Intelligent,
    normaliserTelephone, signalerErreur, nodemailer, enregistrerJET;

function initCronJobs(injected) {
    pool = injected.pool;
    cron = injected.cron;
    crypto = injected.crypto;
    dechiffrer = injected.dechiffrer;
    ImapFlow = injected.ImapFlow;
    simpleParser = injected.simpleParser;
    pdfParse = injected.pdfParse;
    s3Client = injected.s3Client;
    PutObjectCommand = injected.PutObjectCommand;
    GetObjectCommand = injected.GetObjectCommand;
    getSignedUrl = injected.getSignedUrl;
    analyserEmailAvecIA = injected.analyserEmailAvecIA;
    envoyerEvenementSSE = injected.envoyerEvenementSSE;
    envoyerNotificationPush = injected.envoyerNotificationPush;
    envoyerSMS = injected.envoyerSMS;
    envoyerSMS_Intelligent = injected.envoyerSMS_Intelligent;
    normaliserTelephone = injected.normaliserTelephone;
    signalerErreur = injected.signalerErreur;
    nodemailer = injected.nodemailer;
    enregistrerJET = injected.enregistrerJET;

    // Planifications automatiques
    cron.schedule("*/10 8-19 * * *", () => { executerRobotComptable(); });
    cron.schedule("0 2 * * *", () => { executerRobotComptable(); });
    cron.schedule("0 8 * * 1", () => { executerRapportHebdoGerant(); }); // Tous les lundis à 08h00
    cron.schedule("0 3 * * *", () => { executerClotureFantome(); });     // Le filet de sécurité à 3h00 du matin
    cron.schedule("0 8 * * *", () => { executerEnvoiComptable(); }); 
    cron.schedule("0 9 * * *", () => { executerRobotMarketingEtPredictif(); }); 
    cron.schedule("*/10 9-19 * * *", () => { executerRobotAvisSatisfaction(); }); 
    cron.schedule("0 4 * * *", () => { executerRobotAvisSatisfaction(); }); 
    setInterval(executerRobotsSmsAutomatiques, 10 * 60 * 1000);

    console.log("✅ [JOBS] Tous les crons et robots d'arrière-plan sont initialisés.");
}

let isRobotRunning = false;

async function executerRobotComptable() {
    if (isRobotRunning) return;
    isRobotRunning = true;

    const clientDB = await pool.connect();
    try {
        await clientDB.query(`
            CREATE TABLE IF NOT EXISTS robot_memoire_emails (
                message_id VARCHAR(255),
                id_salon INT,
                date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, id_salon)
            )
        `);

        await clientDB.query(`DELETE FROM robot_memoire_emails WHERE date_traitement < NOW() - INTERVAL '7 days'`);

        const salonsResult = await clientDB.query("SELECT id_salon, email_reception_factures, mot_de_passe_app_email, comptes_emails FROM configuration_salon");
        for (let salon of salonsResult.rows) {
            // Construction de la liste des boîtes mail à scruter (jusqu'à 5 comptes maximum)
            let boitesAScruter = [];
            if (Array.isArray(salon.comptes_emails) && salon.comptes_emails.length > 0) {
                boitesAScruter = salon.comptes_emails
                    .filter(c => c && c.email && c.mot_de_passe)
                    .slice(0, 5)
                    .map(c => ({ email: String(c.email).trim(), pass: dechiffrer(c.mot_de_passe) }));
            } else if (salon.email_reception_factures && salon.mot_de_passe_app_email) {
                boitesAScruter = [{ email: String(salon.email_reception_factures).trim(), pass: dechiffrer(salon.mot_de_passe_app_email) }];
            }

            for (let boite of boitesAScruter) {
                if (!boite.email || !boite.pass) continue;
                const imapClient = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: boite.email, pass: boite.pass }, logger: false });
                try {
                    await imapClient.connect();
                    let lock = await imapClient.getMailboxLock('INBOX');
                    try {
                        const dateLimite = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        
                        for await (let message of imapClient.fetch({ since: dateLimite }, { source: true, uid: true })) {
                            const mailParsi = await simpleParser(message.source);
                            const idUnique = mailParsi.messageId || `${boite.email}_${message.uid.toString()}`;
                            
                            const dejaTraite = await clientDB.query('SELECT message_id FROM robot_memoire_emails WHERE message_id = $1 AND id_salon = $2', [idUnique, salon.id_salon]);
                            if (dejaTraite.rows.length > 0) continue;

                            await clientDB.query('INSERT INTO robot_memoire_emails (message_id, id_salon) VALUES ($1, $2)', [idUnique, salon.id_salon]);

                            let texteEmail = mailParsi.text || mailParsi.html || ""; 
                            const sujetEmail = mailParsi.subject || "Sans Sujet";
                            let urlPdfCloudflare = null;
                            let cleR2Email = null;
                            
                            if (mailParsi.attachments && mailParsi.attachments.length > 0) {
                                const pieceJointePdf = mailParsi.attachments.find(a => a.contentType === 'application/pdf');
                                if (pieceJointePdf && pieceJointePdf.content) {
                                    try {
                                        const dataPdf = await pdfParse(pieceJointePdf.content);
                                        texteEmail += `\n\n--- CONTENU DU PDF JOINT ---\n${dataPdf.text}`;
                                        
                                        const nomFichierUnique = `factures/${salon.id_salon}/${Date.now()}_facture.pdf`;
                                        await s3Client.send(new PutObjectCommand({
                                            Bucket: process.env.R2_BUCKET_NAME,
                                            Key: nomFichierUnique,
                                            Body: pieceJointePdf.content,
                                            ContentType: 'application/pdf'
                                        }));
                                        cleR2Email = nomFichierUnique;
                                        
                                        const commandGet = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: nomFichierUnique });
                                        urlPdfCloudflare = await getSignedUrl(s3Client, commandGet, { expiresIn: 604800 });
                                    } catch (e) {
                                        console.error("Erreur parsing/upload PDF :", e);
                                    }
                                }
                            }
                            
                            const tachesTrouvees = await analyserEmailAvecIA(sujetEmail, texteEmail, urlPdfCloudflare, cleR2Email);
                            
                            for (let t of tachesTrouvees) {
                                // AUTO-MATCH COLLABORATEUR PLANITY -> STACK
                                if (t.type_tache === 'RDV' && t.donnees && t.donnees.nom_employe_suggere) {
                                    const nomSuggere = t.donnees.nom_employe_suggere.trim().toLowerCase();
                                    if (nomSuggere) {
                                        // On cherche un employé dont le nom correspond (même partiellement) au prénom Planity
                                        const empMatch = await clientDB.query(
                                            `SELECT id_employe FROM employes WHERE id_salon = $1 AND LOWER(nom) ILIKE $2 LIMIT 1`,
                                            [salon.id_salon, `%${nomSuggere}%`]
                                        );
                                        if (empMatch.rowCount > 0) {
                                            t.donnees.id_employe = empMatch.rows[0].id_employe;
                                        }
                                    }
                                }

                                await clientDB.query(
                                    `INSERT INTO ia_taches_attente (id_salon, type_tache, donnees) VALUES ($1, $2, $3)`,
                                    [salon.id_salon, t.type_tache || t.type, t.donnees] 
                                );
                                envoyerEvenementSSE(salon.id_salon, 'nouvelleTacheIA');
                                
                                envoyerNotificationPush(salon.id_salon, 'gerant', {
                                    title: "STACK IA : Nouvelle action détectée",
                                    body: `L'IA a analysé un e-mail (${boite.email}) et préparé une action : ${t.type_tache || t.type}.`,
                                    url: '/?tab=agenda'
                                });
                            }
                        }
                    } finally { lock.release(); }
                    await imapClient.logout();
                } catch (errConnect) {
                    console.log(`Erreur IMAP Salon ${salon.id_salon} (${boite.email}) :`, errConnect.message);
                }
            }
        }
    } catch (erreur) {
        console.log("Erreur globale robot :", erreur.message);
    } finally { 
        clientDB.release(); 
        isRobotRunning = false; 
    }
}

// =========================================================================
// --- CENTRE D'ACTION (TÂCHES & URGENCES) ---
// =========================================================================
async function executerRobotAvisSatisfaction() {
    let salons;
    try {
        salons = (await pool.query("SELECT * FROM configuration_salon WHERE brevo_api_key IS NOT NULL AND brevo_api_key != ''")).rows;
    } catch (e) { console.error("[ROBOT-AVIS] Impossible de charger les salons :", e); return; }

    for (let salon of salons) {
        try {
            // --- Détection : RDV terminés depuis 1 à 2h, jamais venus auparavant (comparaison sur les 9 derniers chiffres du numéro) ---
            const rdvTermines = await pool.query(`
                SELECT r.id_rdv, r.nom_client, r.telephone_client, r.id_employe
                FROM rendez_vous r
                WHERE r.id_salon = $1
                  AND r.telephone_client IS NOT NULL AND r.telephone_client != ''
                  AND (r.date_heure_debut + (r.duree_minutes || ' minutes')::interval) BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour'
                  AND NOT EXISTS (SELECT 1 FROM avis_demandes a WHERE a.id_rdv = r.id_rdv)
                  AND NOT EXISTS (SELECT 1 FROM sms_opt_out o WHERE o.id_salon = $1 AND o.telephone = RIGHT(regexp_replace(r.telephone_client, '\\D', '', 'g'), 9))
                  AND NOT EXISTS (
                      SELECT 1 FROM tickets t JOIN clients c ON t.id_client = c.id_client
                      WHERE t.id_salon = $1 AND t.statut = 'VALIDE'
                        AND RIGHT(regexp_replace(c.telephone, '\\D', '', 'g'), 9) = RIGHT(regexp_replace(r.telephone_client, '\\D', '', 'g'), 9)
                  )
            `, [salon.id_salon]);

            for (let rdv of rdvTermines.rows) {
                try {
                    const tokenAvis = crypto.randomBytes(24).toString('hex');
                    await pool.query(
                        `INSERT INTO avis_demandes (id_salon, telephone, prenom, token, id_rdv, id_employe, statut, date_prevue) VALUES ($1, $2, $3, $4, $5, $6, 'EN_ATTENTE', NOW())`,
                        [salon.id_salon, rdv.telephone_client, (rdv.nom_client || '').split(' ')[0], tokenAvis, rdv.id_rdv, rdv.id_employe]
                    );
                } catch (e) { console.error(`[ROBOT-AVIS] Échec enregistrement RDV ${rdv.id_rdv} (salon ${salon.id_salon}) :`, e); }
            }

            // --- Envoi : demandes (RDV ou caisse) arrivées à échéance, et expirées au-delà de 30 jours ---
            const avisAEnvoyer = await pool.query(`SELECT * FROM avis_demandes WHERE id_salon = $1 AND statut = 'EN_ATTENTE' AND date_prevue <= NOW() AND date_creation > NOW() - INTERVAL '30 days'`, [salon.id_salon]);
            for (let demande of avisAEnvoyer.rows) {
                try {
                    const dejaOptOut = await pool.query('SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = $2', [salon.id_salon, normaliserTelephone(demande.telephone)]);
                    if (dejaOptOut.rowCount > 0) { await pool.query(`UPDATE avis_demandes SET statut = 'ANNULE' WHERE id_demande = $1`, [demande.id_demande]); continue; }

                    const lienAvis = `https://app-salon-caiss.onrender.com/avis/${demande.token}`;
                    const texteAvis = `Bonjour ${demande.prenom || ''}, merci pour votre première visite chez ${salon.nom_salon} ! Qu'avez-vous pensé de votre prestation ? Donnez votre avis ici : ${lienAvis}`;
                    await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, demande.telephone, texteAvis);
                    await pool.query(`UPDATE avis_demandes SET statut = 'ENVOYE' WHERE id_demande = $1`, [demande.id_demande]);
                } catch (e) { console.error(`[ROBOT-AVIS] Échec envoi demande ${demande.id_demande} (salon ${salon.id_salon}) :`, e); }
            }
        } catch (e) { console.error(`[ROBOT-AVIS] Échec traitement salon ${salon.id_salon} :`, e); }
    }
}

async function executerRobotMarketingEtPredictif() {
    try {
        // CORRECTION 1 : On récupère TOUS les salons (même ceux qui n'ont pas configuré les SMS)
        const salons = await pool.query("SELECT * FROM configuration_salon");
        
        for (let salon of salons.rows) {
            try {
                const hasBrevo = salon.brevo_api_key && salon.brevo_api_key.trim() !== '';
                const delaiFixe = salon.fidelite_delai_sms && salon.fidelite_delai_sms > 0 ? salon.fidelite_delai_sms : 60;

                // --- 1. GESTION DES SMS (S'exécute uniquement si Brevo est configuré) ---
                if (hasBrevo) {
                    const queryClients = `
                        WITH Visites AS (
                            SELECT id_client, DATE(date_creation) as date_visite
                            FROM tickets
                            WHERE id_salon = $1 AND statut != 'ANNULE' AND est_compense = FALSE
                            GROUP BY id_client, DATE(date_creation)
                        ),
                        Ecarts AS (
                            SELECT id_client,
                                   date_visite - LAG(date_visite) OVER (PARTITION BY id_client ORDER BY date_visite) as jours_ecart
                            FROM Visites
                        ),
                        Moyennes AS (
                            SELECT id_client, AVG(jours_ecart) as moyenne_jours, COUNT(jours_ecart) as nb_ecarts
                            FROM Ecarts
                            WHERE jours_ecart IS NOT NULL
                            GROUP BY id_client
                        )
                        SELECT c.*,
                               COALESCE(m.moyenne_jours, 0) as moyenne_jours,
                               COALESCE(m.nb_ecarts, 0) as nb_ecarts
                        FROM clients c
                        LEFT JOIN Moyennes m ON c.id_client = m.id_client
                        LEFT JOIN rendez_vous r ON r.telephone_client = c.telephone AND r.date_heure_debut >= NOW()
                        WHERE c.id_salon = $1
                          AND r.id_rdv IS NULL
                          AND c.telephone IS NOT NULL
                          AND c.derniere_visite IS NOT NULL
                    `;
                    const clientsResult = await pool.query(queryClients, [salon.id_salon]);
                    const now = new Date();

                    for (let client of clientsResult.rows) {
                        const derniereVisite = new Date(client.derniere_visite);
                        const joursDepuisVisite = (now - derniereVisite) / (1000 * 60 * 60 * 24);

                        let seuilRelance = (client.nb_ecarts > 0 && client.moyenne_jours > 0) ? parseFloat(client.moyenne_jours) * 1.2 : delaiFixe;

                        if (joursDepuisVisite >= seuilRelance && joursDepuisVisite < (seuilRelance + 1)) {
                            let message = "";
                            if (salon.fidelite_type === 'TAMPONS') {
                                const restants = salon.fidelite_tampons_seuil - (client.tampons_fidelite || 0);
                                message = `Hey ${client.prenom || client.nom} ! Cela fait un moment qu'on ne t'a pas vu chez ${salon.sms_sender_name}. Plus que ${restants} passage(s) avant ta récompense ! Prends vite rendez-vous : ${salon.lien_google_maps}`;
                            } else if (salon.fidelite_type === 'POINTS') {
                                message = `Bonjour ${client.prenom || client.nom}, votre fidélité paie ! Vous avez ${client.points_fidelite || 0} points. Venez en profiter chez ${salon.sms_sender_name}. RDV: ${salon.lien_google_maps}`;
                            } else {
                                message = `Bonjour ${client.prenom || client.nom}, ça fait longtemps ! Pensez à prendre soin de vous chez ${salon.sms_sender_name}. Prenez rendez-vous ici : ${salon.lien_google_maps}`;
                            }
                            if (message !== "") await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, client.telephone, message);
                        }
                    }

                                    const anniversaires = await pool.query(`
                        SELECT * FROM clients 
                        WHERE id_salon = $1 
                        AND EXTRACT(MONTH FROM date_naissance) = EXTRACT(MONTH FROM NOW()) 
                        AND EXTRACT(DAY FROM date_naissance) = EXTRACT(DAY FROM NOW())
                    `, [salon.id_salon]);

                    for (let client of anniversaires.rows) {
                        if (client.telephone) {
                            await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, client.telephone, `Joyeux anniversaire ${client.prenom || client.nom} ! 🎉 Venez fêter ça chez nous cette semaine. Prenez RDV : ${salon.lien_google_maps}`);
                        }
                    }
                }
                // =================================================================
                // --- 2. MOTEUR PRÉDICTIF D'INVENTAIRE GLOBAL (SMART AGGREGATION) ---
                // =================================================================
                
                // Cette requête SQL intelligente calcule la somme totale requise par produit 
                // pour TOUS les RDV des 14 prochains jours, et ne sort que les articles en déficit.
                const rupturesPredictives = await pool.query(`
                    SELECT 
                        c.id_article,
                        c.nom,
                        c.stock_actuel,
                        c.delai_livraison_jours,
                        SUM(ra.quantite_necessaire) as total_besoin,
                        MIN(r.date_heure_debut) as date_premier_besoin
                    FROM rendez_vous r
                    JOIN protocoles p ON p.id_salon = $1 AND TRIM(p.nom_prestation) ILIKE TRIM(r.prestation)
                    JOIN recettes_articles ra ON ra.id_protocole = p.id_protocole
                    JOIN catalogue c ON c.id_article = ra.id_article
                    WHERE r.id_salon = $1 
                      AND r.date_heure_debut BETWEEN NOW() AND NOW() + INTERVAL '14 days'
                    GROUP BY c.id_article, c.nom, c.stock_actuel, c.delai_livraison_jours
                    HAVING c.stock_actuel < SUM(ra.quantite_necessaire)
                `, [salon.id_salon]);

                console.log(`[ROBOT-STOCK] Salon #${salon.id_salon} : ${rupturesPredictives.rowCount} produit(s) en rupture prédictive globale.`);

                for (let rupture of rupturesPredictives.rows) {
                    const stockActuel = parseFloat(rupture.stock_actuel);
                    const besoinTotal = parseFloat(rupture.total_besoin);
                    const quantiteACommander = besoinTotal - stockActuel;
                    
                    // Calcul du délai : Date du PREMIER rdv impacté - Délai livraison - 1 jour marge
                    const dateAlerte = new Date(rupture.date_premier_besoin);
                    dateAlerte.setDate(dateAlerte.getDate() - (rupture.delai_livraison_jours || 3) - 1);

                    // Formatage exact demandé
                    const titreAlerte = `Commander ${quantiteACommander}x ${rupture.nom}`;
                    const descAlerte = `Rupture prédictive : Il faut un total de ${besoinTotal} unité(s) pour assurer l'ensemble des RDV des 14 prochains jours, mais vous n'avez que ${stockActuel} en stock. Échéance calculée avec le délai fournisseur (${rupture.delai_livraison_jours || 3}j) + 1j de marge.`;

                    // On évite d'inonder le gérant si la tâche existe déjà pour CE produit en mode A_FAIRE
                    const exist = await pool.query(`SELECT 1 FROM taches_actions WHERE id_salon = $1 AND titre = $2 AND statut = 'A_FAIRE'`, [salon.id_salon, titreAlerte]);
                    
                    if (exist.rowCount === 0) {
                        await pool.query(
                            `INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'IA')`, 
                            [salon.id_salon, titreAlerte, descAlerte, dateAlerte]
                        );
                        console.log(`[ROBOT-STOCK] ✅ Alerte insérée : "${titreAlerte}" (échéance ${dateAlerte.toISOString().slice(0,10)})`);
                    }
                }

                // --- 3. Alertes Tâches Urgentes (Centre d'Action) ---
                const tachesUrgentes = await pool.query(`SELECT titre, date_echeance FROM taches_actions WHERE id_salon = $1 AND statut = 'A_FAIRE' AND date_echeance <= NOW() + INTERVAL '2 days'`, [salon.id_salon]);
                if (tachesUrgentes.rowCount > 0) {
                    
                    envoyerNotificationPush(salon.id_salon, 'gerant', {
                        title: " Actions Urgentes",
                        body: `Vous avez ${tachesUrgentes.rowCount} tâche(s) arrivant à échéance (ex: ${tachesUrgentes.rows[0].titre}).`,
                        url: '/?tab=actions'
                    });
                    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                        const gerant = await pool.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [salon.id_salon]);
                        if (gerant.rowCount > 0) {
                            let texteEmail = `Bonjour,\n\nVous avez ${tachesUrgentes.rowCount} tâche(s) urgente(s) nécessitant votre attention :\n\n`;
                            tachesUrgentes.rows.forEach(t => texteEmail += `🔴 ${t.titre} (Échéance: ${new Date(t.date_echeance).toLocaleDateString()})\n`);
                            texteEmail += `\nConnectez-vous à STACK pour les traiter.`;
                            try {
                                let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
                                await transporter.sendMail({ from: `"Alertes STACK" <${process.env.SMTP_USER}>`, to: gerant.rows[0].email, subject: `⚠️ ${tachesUrgentes.rowCount} Action(s) Urgente(s) (URSSAF, Factures, Stocks...)`, text: texteEmail });
                            } catch(e) {}
                        }
                    }

                    if (salon.alertes_sms_actives && salon.telephone_gerant && salon.telephone_gerant.trim() !== '' && hasBrevo) {
                        const smsTexte = `⚠️ STACK : Vous avez ${tachesUrgentes.rowCount} action(s) urgente(s) en attente (ex: ${tachesUrgentes.rows[0].titre}). Connectez-vous pour les traiter !`;
                        await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name || 'STACK', salon.telephone_gerant, smsTexte);
                    }
                }
            } catch (salonErr) {
                console.error(`[ROBOT-MARKETING] Erreur isolée pour le salon ${salon.id_salon}:`, salonErr);
            }
        } 
    } catch (err) {
        console.error("Erreur globale Robot Marketing/Prédictif:", err);
    }
}

// =========================================================================
// --- WORKFLOW COMPTABLE : ENVOI ET VALIDATION ---
// =========================================================================
async function executerEnvoiComptable() {
    try {
        const salons = await pool.query("SELECT id_salon, nom_salon, jour_envoi_bilan, telephone_gerant, alertes_sms_actives, brevo_api_key, sms_sender_name FROM configuration_salon WHERE email_comptable IS NOT NULL");
        const today = new Date();
        const currentDay = today.getDate();
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        
        let prevMonth = today.getMonth(); 
        let year = today.getFullYear();
        if (prevMonth === 0) { prevMonth = 12; year -= 1; }
        const moisAnneeCible = `${year}-${String(prevMonth).padStart(2, '0')}`;

        for (let salon of salons.rows) {
            try {
                const jourCible = salon.jour_envoi_bilan || 1;
                const shouldCheck = currentDay === jourCible || (jourCible > lastDayOfMonth && currentDay === lastDayOfMonth);
                
                if (shouldCheck) {
                    const id_salon = salon.id_salon;
                    const validationRes = await pool.query('SELECT 1 FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [id_salon, moisAnneeCible]);
                    
                    if (validationRes.rowCount === 0) {
                        // Relance automatique du gérant car ce n'est pas validé
                        envoyerNotificationPush(id_salon, 'gerant', {
                            title: "⚠️ Liasse Comptable en attente",
                            body: `N'oubliez pas de vérifier et signer votre bilan du mois pour envoi à l'expert-comptable.`,
                            url: '/?tab=admin'
                        });
                        
                        if (salon.alertes_sms_actives && salon.telephone_gerant && salon.brevo_api_key) {
                            const smsTexte = `⚠️ STACK : Votre liasse comptable mensuelle attend votre signature ! Connectez-vous sur l'app pour la valider et l'envoyer à votre expert.`;
                            await envoyerSMS_Intelligent(id_salon, salon.brevo_api_key, salon.sms_sender_name, salon.telephone_gerant, smsTexte);
                        }
                    }
                }
            } catch (salonErr) {
                console.error(`[ROBOT-COMPTABLE] Erreur isolée pour le salon ${salon.id_salon}:`, salonErr);
            }
        }
    } catch (err) { console.error("Erreur globale Robot Comptable Automatique:", err); }
}


let isFantomeRunning = false;

async function executerClotureFantome() {
    if (isFantomeRunning) return;
    isFantomeRunning = true;

    const clientDB = await pool.connect();
    try {
        const salons = await clientDB.query("SELECT id_salon FROM configuration_salon WHERE COALESCE(est_bac_a_sable, FALSE) = FALSE");
        for (let s of salons.rows) {
            const id_salon = s.id_salon;
            
            // On cherche tous les jours (avant aujourd'hui) ayant des tickets mais aucune clôture correspondante (format YYYY-MM-DD local SQL sans décalage UTC)
            const joursNonClotures = await clientDB.query(`
                SELECT DISTINCT TO_CHAR(DATE(t.date_creation), 'YYYY-MM-DD') as jour_str
                FROM tickets t
                WHERE t.id_salon = $1 
                  AND DATE(t.date_creation) < CURRENT_DATE
                  AND NOT EXISTS (
                      SELECT 1 FROM clotures_caisse c
                      WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
                  )
                ORDER BY jour_str ASC
            `, [id_salon]);

            for (let j of joursNonClotures.rows) {
                const dateACloturerStr = j.jour_str;
                
                try {
                    await clientDB.query('BEGIN');
                    await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
                    await clientDB.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);

                    const dejaFaitCheck = await clientDB.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2', [id_salon, dateACloturerStr]);
                    if (dejaFaitCheck.rowCount > 0) {
                        await clientDB.query('ROLLBACK');
                        continue;
                    }

                    const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalJour = Number(caResult.rows[0].total).toFixed(2);

                    // NF525: Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour.
                    const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1 FOR UPDATE', [id_salon]);
                    const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
                    const grandTotalPerpetuel = Number((ancienCumul + parseFloat(totalJour)).toFixed(2));
                    
                    const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
                    const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

                    // --- CALCUL DU THÉORIQUE POUR LE ROBOT (Somme algébrique exacte incluant ventes + et avoirs -) ---
                    const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc + COALESCE(montant_pourboire, 0)), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

                    const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE montant END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
                    const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

                    const lastCloseRes = await clientDB.query('SELECT total_especes_reel FROM clotures_caisse WHERE id_salon = $1 AND date_cloture < $2 ORDER BY date_cloture DESC LIMIT 1', [id_salon, dateACloturerStr]);
                    const fCaisseMatin = (lastCloseRes.rowCount > 0 && lastCloseRes.rows[0].total_especes_reel !== null) ? (parseFloat(lastCloseRes.rows[0].total_especes_reel) || 0) : 0;

                    const tEspecesTheorique = Number((fCaisseMatin + totalEspecesVentes + totalMouvements).toFixed(2));
                    // -----------------------------------------

                    const signature = crypto.createHash('sha256')
                        .update(`Z-${id_salon}-${nextZ}-${dateACloturerStr}-${totalJour}-${grandTotalPerpetuel.toFixed(2)}-${hashPrecedent}`)
                        .digest('hex');

                    await clientDB.query(
                        `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, est_cloture_automatique, numero_z_salon) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                        [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, 'Fermeture Automatique (En attente)', fCaisseMatin, tEspecesTheorique, tEspecesTheorique, 0, 'Clôture générée par le système', true, nextZ]
                    );

                    await enregistrerJET(id_salon, 'CLOTURE_Z_AUTOMATIQUE', { numero_z: nextZ, date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, ecart_caisse: 0, signature }, clientDB);
                    await clientDB.query('COMMIT');
                    console.log(`[ROBOT] Clôture fantôme réussie pour le salon ${id_salon} (Date: ${dateACloturerStr})`);
                } catch (e) {
                    await clientDB.query('ROLLBACK');
                    console.error(`[ROBOT] Erreur clôture fantôme salon ${id_salon}:`, e);
                }
            }
        }
    } catch (err) { console.error("Erreur Globale Robot Clôture:", err); } 
    finally { 
        clientDB.release(); 
        isFantomeRunning = false;
    }
}

// =========================================================================
// --- ROBOT ANALYTICS (CRON JOB) - RAPPORT HEBDO GÉRANT ---
// =========================================================================
async function executerRapportHebdoGerant() {
    console.log("\n🚀 [ROBOT-HEBDO] Démarrage du robot...");
    const clientDB = await pool.connect();
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.log("❌ [ROBOT-HEBDO] ARRÊT : Variables SMTP_USER ou SMTP_PASS introuvables.");
            return;
        }
        console.log(`📧 [ROBOT-HEBDO] Connexion SMTP configurée avec : ${process.env.SMTP_USER}`);
        
        // Utilisation du Port 587 (Standard Cloud) avec STARTTLS
        const transporter = nodemailer.createTransport({ 
            host: 'smtp.gmail.com', 
            port: 587, 
            secure: false, // Doit obligatoirement être "false" pour le port 587
            requireTLS: true, // Force le chiffrement moderne
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            logger: true,
            debug: true
        });

        const salons = await clientDB.query("SELECT id_salon, nom_salon FROM configuration_salon WHERE COALESCE(est_bac_a_sable, FALSE) = FALSE");
        console.log(`🔍 [ROBOT-HEBDO] ${salons.rowCount} salon(s) trouvé(s) en base.`);
        
        for (let s of salons.rows) {
            try {
                const id_salon = s.id_salon;
                console.log(`\n➡️ Analyse du salon #${id_salon} (${s.nom_salon})...`);

                // 1. Récupération de l'email du gérant
                const gerantRes = await clientDB.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [id_salon]);
                if (gerantRes.rowCount === 0 || !gerantRes.rows[0].email) {
                    console.log(`⚠️ [ROBOT-HEBDO] Ignoré : Aucun compte 'gerant' avec un email trouvé pour ce salon.`);
                    continue;
                }
                const emailGerant = gerantRes.rows[0].email;
                console.log(`👤 [ROBOT-HEBDO] Gérant ciblé : ${emailGerant}`);

                // 2. Requête d'agrégation intelligente
                const statsQuery = `
                    WITH Hebdo AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca, COUNT(id_ticket) as tickets FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= CURRENT_DATE - INTERVAL '7 days' AND date_creation < CURRENT_DATE
                    ),
                    HebdoPrec AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca, COUNT(id_ticket) as tickets FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= CURRENT_DATE - INTERVAL '14 days' AND date_creation < CURRENT_DATE - INTERVAL '7 days'
                    ),
                    Mensuel AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= date_trunc('month', CURRENT_DATE)
                    ),
                    MensuelPrec AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE)
                    )
                    SELECT 
                        (SELECT ca FROM Hebdo) as ca_hebdo, (SELECT tickets FROM Hebdo) as tickets_hebdo,
                        (SELECT ca FROM HebdoPrec) as ca_hebdo_prec,
                        (SELECT ca FROM Mensuel) as ca_mensuel,
                        (SELECT ca FROM MensuelPrec) as ca_mensuel_prec
                `;
                const stats = await clientDB.query(statsQuery, [id_salon]);
                if(stats.rowCount === 0) continue;
                const d = stats.rows[0];

                console.log(`💰 [ROBOT-HEBDO] CA 7j : ${d.ca_hebdo}€ | CA Prec : ${d.ca_hebdo_prec}€ | Tickets : ${d.tickets_hebdo}`);

                if (parseFloat(d.ca_hebdo) === 0 && parseFloat(d.ca_hebdo_prec) === 0) {
                    console.log(`🛑 [ROBOT-HEBDO] Annulation : Pas d'activité détectée sur les 14 derniers jours.`);
                    continue; 
                }

                // 3. Calculs des variations (Période sur Période)
                const caHebdo = parseFloat(d.ca_hebdo).toFixed(2);
                const caHebdoPrec = parseFloat(d.ca_hebdo_prec).toFixed(2);
                const evoHebdoRaw = caHebdoPrec > 0 ? ((caHebdo - caHebdoPrec) / caHebdoPrec * 100) : (caHebdo > 0 ? 100 : 0);
                const evoHebdo = Math.abs(evoHebdoRaw).toFixed(1);
                const signeHebdo = evoHebdoRaw >= 0 ? '+' : '-';
                const colorHebdo = evoHebdoRaw >= 0 ? '#166534' : '#99251b';
                const bgHebdo = evoHebdoRaw >= 0 ? '#e7f6ec' : '#fbeae8';

                const caMensuel = parseFloat(d.ca_mensuel).toFixed(2);
                const caMensuelPrec = parseFloat(d.ca_mensuel_prec).toFixed(2);
                const evoMensuelRaw = caMensuelPrec > 0 ? ((caMensuel - caMensuelPrec) / caMensuelPrec * 100) : (caMensuel > 0 ? 100 : 0);
                const evoMensuel = Math.abs(evoMensuelRaw).toFixed(1);
                const signeMensuel = evoMensuelRaw >= 0 ? '+' : '-';
                const colorMensuel = evoMensuelRaw >= 0 ? '#166534' : '#99251b';
                const bgMensuel = evoMensuelRaw >= 0 ? '#e7f6ec' : '#fbeae8';

                const panierMoyen = d.tickets_hebdo > 0 ? (caHebdo / d.tickets_hebdo).toFixed(2) : '0.00';

                // 4. Classement Hebdo (Top 3)
                const topPrestas = await clientDB.query(`
                    SELECT c.nom, SUM(lt.total_ligne_ttc) as total FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND t.date_creation >= CURRENT_DATE - INTERVAL '7 days' AND c.type_article = 'PRESTATION' GROUP BY c.nom ORDER BY total DESC LIMIT 3
                `, [id_salon]);

                let topPrestasHTML = '';
                if (topPrestas.rowCount > 0) {
                    topPrestasHTML = `<div style="background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #ececee; margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #14141a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">🏆 Top Prestations (7 Jours)</h3>
                        <ul style="padding-left: 20px; margin: 0; color: #14141a; font-size: 14px;">`;
                    topPrestas.rows.forEach(p => { topPrestasHTML += `<li style="margin-bottom: 6px;"><strong>${p.nom}</strong> : ${parseFloat(p.total).toFixed(2)} €</li>`; });
                    topPrestasHTML += `</ul></div>`;
                }

                // 5. Structure de l'e-mail
                const htmlBody = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #ffffff; border: 1px solid #ececee; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #14141a; margin: 0; font-size: 22px;">Bilan Hebdomadaire</h2>
                        <p style="color: #77777f; margin: 4px 0 0 0; font-size: 14px;">Performances de <strong>${s.nom_salon}</strong></p>
                    </div>
                    
                    <div style="background: #fbfbfc; padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #ececee;">
                        <h3 style="margin-top: 0; color: #77777f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">7 Derniers Jours</h3>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 32px; font-weight: 800; color: #14141a; letter-spacing: -0.02em;">${caHebdo} €</span>
                            <span style="font-size: 14px; font-weight: 700; color: ${colorHebdo}; background: ${bgHebdo}; padding: 4px 10px; border-radius: 12px;">${signeHebdo}${evoHebdo}%</span>
                        </div>
                        <p style="color: #77777f; font-size: 13px; margin: 8px 0 0 0;">vs ${caHebdoPrec} € la semaine précédente</p>
                    </div>

                    <div style="background: #fbfbfc; padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #ececee;">
                        <h3 style="margin-top: 0; color: #77777f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Mois en cours</h3>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 24px; font-weight: 700; color: #14141a; letter-spacing: -0.02em;">${caMensuel} €</span>
                            <span style="font-size: 13px; font-weight: 700; color: ${colorMensuel}; background: ${bgMensuel}; padding: 4px 8px; border-radius: 12px;">${signeMensuel}${evoMensuel}%</span>
                        </div>
                        <p style="color: #77777f; font-size: 13px; margin: 8px 0 0 0;">vs ${caMensuelPrec} € le mois dernier</p>
                    </div>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                            <td width="48%" style="background: #fbfbfc; padding: 16px; border-radius: 12px; border: 1px solid #ececee; text-align: center;">
                                <span style="font-size: 11px; color: #77777f; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Clients (7j)</span>
                                <p style="font-size: 22px; font-weight: 800; color: #14141a; margin: 8px 0 0 0;">${d.tickets_hebdo}</p>
                            </td>
                            <td width="4%"></td>
                            <td width="48%" style="background: #fbfbfc; padding: 16px; border-radius: 12px; border: 1px solid #ececee; text-align: center;">
                                <span style="font-size: 11px; color: #77777f; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Panier Moyen (7j)</span>
                                <p style="font-size: 22px; font-weight: 800; color: #14141a; margin: 8px 0 0 0;">${panierMoyen} €</p>
                            </td>
                        </tr>
                    </table>

                    ${topPrestasHTML}

                    <hr style="border: none; border-top: 1px dashed #ececee; margin: 24px 0;" />
                    <p style="font-size: 12px; color: #a9a9b0; text-align: center; margin: 0;">STACK Analytics<br/>Le tableau de bord vient à vous.</p>
                </div>`;

                console.log(`📨 [ROBOT-HEBDO] Envoi de l'email en cours vers : ${emailGerant}...`);
                await transporter.sendMail({
                    from: `"STACK Analytics" <${process.env.SMTP_USER}>`,
                    to: emailGerant,
                    subject: `📊 Bilan STACK : ${caHebdo}€ cette semaine (${signeHebdo}${evoHebdo}%)`,
                    html: htmlBody
                });
                console.log(`✅ [ROBOT-HEBDO] Email envoyé avec succès !`);

            } catch (eSalon) { console.error(`❌ [ROBOT-HEBDO] Erreur Salon ${s.id_salon}:`, eSalon); }
        }
        console.log("🏁 [ROBOT-HEBDO] Fin de l'exécution.\n");
    } catch (err) { console.error("❌ [ROBOT-HEBDO] Erreur globale:", err); }
    finally { clientDB.release(); }
}

// Planification automatique

async function executerRobotsSmsAutomatiques() {
    try {
        const salonsRes = await pool.query(
            `SELECT id_salon, nom_salon, brevo_api_key, sms_sender_name, rappel_rdv_2h_actif, fidelite_delai_sms 
             FROM configuration_salon 
             WHERE brevo_api_key IS NOT NULL AND TRIM(brevo_api_key) != ''`
        );

        for (const salon of salonsRes.rows) {
            const { id_salon, nom_salon, brevo_api_key, sms_sender_name, rappel_rdv_2h_actif, fidelite_delai_sms } = salon;
            const sender = sms_sender_name || nom_salon || 'MonSalon';

            // 1. RAPPEL AUTOMATIQUE 2H AVANT LE RDV (Entre +1h45 et +2h15)
            if (rappel_rdv_2h_actif) {
                const rdvsRes = await pool.query(
                    `SELECT r.id_rdv, r.nom_client, r.telephone_client, r.prestation, r.date_heure_debut, e.nom as nom_employe
                     FROM rendez_vous r
                     LEFT JOIN employes e ON r.id_employe = e.id_employe
                     WHERE r.id_salon = $1
                       AND COALESCE(r.sms_rappel_envoye, FALSE) = FALSE
                       AND r.telephone_client IS NOT NULL AND LENGTH(TRIM(r.telephone_client)) >= 9
                       AND r.date_heure_debut BETWEEN (NOW() + INTERVAL '105 minutes') AND (NOW() + INTERVAL '135 minutes')`,
                    [id_salon]
                );

                for (const rdv of rdvsRes.rows) {
                    const optOut = await pool.query(
                        `SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = RIGHT(regexp_replace($2, '\\D', '', 'g'), 9)`,
                        [id_salon, rdv.telephone_client]
                    );
                    if (optOut.rowCount > 0) {
                        await pool.query('UPDATE rendez_vous SET sms_rappel_envoye = TRUE WHERE id_rdv = $1', [rdv.id_rdv]);
                        continue;
                    }

                    const heureStr = new Date(rdv.date_heure_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    const prenomClient = rdv.nom_client ? rdv.nom_client.split(' ')[0] : '';
                    const coiffeurTxt = rdv.nom_employe ? ` avec ${rdv.nom_employe.split(' ')[0]}` : '';
                    const msgRappel = `Bonjour${prenomClient ? ' ' + prenomClient : ''}, nous vous rappelons votre RDV aujourd'hui à ${heureStr}${coiffeurTxt} chez ${nom_salon || 'votre salon'}. À tout à l'heure !`;

                    const ok = await envoyerSMS_Intelligent(id_salon, brevo_api_key, sender, rdv.telephone_client, msgRappel);
                    if (ok) {
                        await pool.query('UPDATE rendez_vous SET sms_rappel_envoye = TRUE WHERE id_rdv = $1', [rdv.id_rdv]);
                    }
                }
            }

            // 2. RELANCE AUTOMATIQUE DES CLIENTS INACTIFS (1 fois par jour à 10h)
            const heureCourante = new Date().getHours();
            const delaiJours = parseInt(fidelite_delai_sms, 10);
            if (heureCourante === 10 && !isNaN(delaiJours) && delaiJours > 0) {
                const inactifsRes = await pool.query(
                    `SELECT id_client, prenom, nom, telephone
                     FROM clients
                     WHERE id_salon = $1
                       AND telephone IS NOT NULL AND LENGTH(TRIM(telephone)) >= 9
                       AND derniere_visite IS NOT NULL
                       AND derniere_visite = (CURRENT_DATE - ($2 || ' days')::interval)::date
                       AND (dernier_sms_relance IS NULL OR dernier_sms_relance < CURRENT_DATE - INTERVAL '30 days')`,
                    [id_salon, delaiJours]
                );

                for (const cli of inactifsRes.rows) {
                    const optOut = await pool.query(
                        `SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = RIGHT(regexp_replace($2, '\\D', '', 'g'), 9)`,
                        [id_salon, cli.telephone]
                    );
                    if (optOut.rowCount > 0) continue;

                    const prenom = cli.prenom || (cli.nom ? cli.nom.split(' ')[0] : '');
                    const msgInactif = `Bonjour${prenom ? ' ' + prenom : ''}, cela fait quelque temps que nous ne vous avons pas vu(e) chez ${nom_salon || 'votre salon'} ! Toute l'équipe serait ravie de prendre soin de vous très bientôt.`;

                    const ok = await envoyerSMS_Intelligent(id_salon, brevo_api_key, sender, cli.telephone, msgInactif);
                    if (ok) {
                        await pool.query('UPDATE clients SET dernier_sms_relance = CURRENT_DATE WHERE id_client = $1', [cli.id_client]);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erreur Robot SMS Automatiques:", e);
    }
}



module.exports = {
    initCronJobs,
    executerRobotComptable,
    executerRobotAvisSatisfaction,
    executerRobotMarketingEtPredictif,
    executerEnvoiComptable,
    executerClotureFantome,
    executerRapportHebdoGerant,
    executerRobotsSmsAutomatiques
};
