const PDFDocument = require('pdfkit');

/**
 * Génération de la facture client B2B / B2C (Ticket de caisse au format PDF A4)
 * @param {Object} options
 * @param {Object} options.ticket - Données du ticket (statut, total, numéro, etc.)
 * @param {Array} options.lignes - Lignes d'articles du ticket
 * @param {Object} options.config - Données de configuration du salon
 * @returns {Promise<Buffer>}
 */
async function genererBufferFactureTicketPDF({ ticket, lignes = [], config = {} }) {
    return new Promise((resolve, reject) => {
        try {
            const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';

            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));

            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            doc.on('error', reject);

            // --- En-tête Prestataire (Le Salon) ---
            doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(config.nom_salon || 'Salon', 50, 50);
            doc.font('Helvetica').fontSize(10).fillColor('#4b5563');
            doc.text(config.adresse_salon || 'Adresse non renseignée', 50, 75);
            doc.text(`SIRET : ${config.siret || 'Non renseigné'}`, 50, 90);
            
            let mentionsEmetteur = `NAF : 96.02A`;
            if (config.forme_juridique) mentionsEmetteur += ` | ${config.forme_juridique}`;
            if (config.capital_social) mentionsEmetteur += ` | Capital : ${config.capital_social}`;
            if (config.rcs_ville) mentionsEmetteur += ` | RCS ${config.rcs_ville}`;
            doc.text(mentionsEmetteur, 50, 105);

            if (!franchiseTVA) {
                doc.text(`N° TVA Intracom. : ${config.tva_intra}`, 50, 120);
            }

            // --- En-tête Client ---
            doc.rect(300, 50, 245, 85).stroke('#e5e7eb');
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('FACTURÉ À :', 315, 60);
            doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(ticket.nom_client || 'Client', 315, 80);
            if (ticket.telephone_client) doc.text(ticket.telephone_client, 315, 95);

            // --- Infos Facture ---
            const dTicket = new Date(ticket.date_creation);
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(ticket.type_ticket === 'ANNULATION' ? 'AVOIR / ANNULATION' : 'FACTURE', 50, 160);
            doc.font('Helvetica').fontSize(10).fillColor('#4b5563');
            doc.text(`Numéro de pièce : ${ticket.numero_ticket_caisse}`, 50, 180);
            doc.text(`Date d'émission : ${dTicket.toLocaleDateString('fr-FR')} à ${dTicket.toLocaleTimeString('fr-FR')}`, 50, 195);
            doc.text(`Moyen de règlement : ${ticket.methode_paiement}`, 50, 210);

            // --- Tableau des Lignes ---
            let currentY = 250;
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
            doc.text('Désignation', 50, currentY);
            doc.text('Qté', 300, currentY, { width: 40, align: 'center' });
            doc.text('PU HT', 340, currentY, { width: 60, align: 'right' });
            doc.text('TVA', 400, currentY, { width: 50, align: 'right' });
            doc.text('Total TTC', 460, currentY, { width: 85, align: 'right' });
            currentY += 15;
            doc.moveTo(50, currentY).lineTo(545, currentY).lineWidth(1).stroke('#111827');
            currentY += 10;

            let totalHT = 0;
            let totalTVA = 0;
            const totalTTC = parseFloat(ticket.total_ttc);

            doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
            lignes.forEach(l => {
                const lTTC = Math.abs(parseFloat(l.total_ligne_ttc));
                const lTVA_taux = franchiseTVA ? 0 : parseFloat(l.taux_tva_snapshot);
                const lHT = lTTC / (1 + lTVA_taux / 100);
                const lTVA_montant = lTTC - lHT;
                const puHT = lHT / Math.abs(l.quantite);

                totalHT += lHT;
                totalTVA += lTVA_montant;

                const txtHeight = doc.heightOfString(l.nom_article_snapshot, { width: 240 });
                if (currentY + txtHeight > 750) { doc.addPage(); currentY = 50; }

                doc.text(l.nom_article_snapshot, 50, currentY, { width: 240 });
                doc.text(Math.abs(l.quantite).toString(), 300, currentY, { width: 40, align: 'center' });
                doc.text(puHT.toFixed(2) + ' €', 340, currentY, { width: 60, align: 'right' });
                doc.text(franchiseTVA ? '0%' : lTVA_taux + '%', 400, currentY, { width: 50, align: 'right' });
                doc.text(lTTC.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
                currentY += txtHeight + 5;
            });

            currentY += 10;
            doc.moveTo(350, currentY).lineTo(545, currentY).lineWidth(0.5).stroke('#e5e7eb');
            currentY += 10;

            // --- Totaux ---
            doc.font('Helvetica').fontSize(10);
            doc.text('Total HT :', 350, currentY);
            doc.text(totalHT.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
            currentY += 15;

            if (!franchiseTVA) {
                doc.text('Total TVA :', 350, currentY);
                doc.text(totalTVA.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
                currentY += 15;
            }

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827');
            doc.text('NET À PAYER TTC :', 300, currentY);
            doc.text(Math.abs(totalTTC).toFixed(2) + ' €', 440, currentY, { width: 105, align: 'right' });
            
            // --- Mentions Légales B2B & Sécurisation ---
            currentY = 680;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text("CONDITIONS DE PAIEMENT ET MENTIONS LÉGALES OBLIGATOIRES", 50, currentY);
            currentY += 12;
            doc.font('Helvetica').fontSize(7).fillColor('#4b5563');
            
            let mentionsArray = [
                `Échéance : Paiement comptant à réception. Aucun escompte accordé pour paiement anticipé.`,
                `Pénalités de retard : En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal en vigueur sera exigible de plein droit.`,
                `Frais de recouvrement : Conformément à l'art. D. 441-5 du Code de commerce, une indemnité forfaitaire de 40 € pour frais de recouvrement sera due en cas de retard de paiement.`
            ];

            if (franchiseTVA) {
                mentionsArray.unshift(`TVA non applicable, article 293 B du Code Général des Impôts.`);
            }

            mentionsArray.forEach(m => {
                doc.text(`• ${m}`, 50, currentY, { width: 495 });
                currentY += 10;
            });

            currentY += 8;
            const hashFacture = ticket.hash_ticket && ticket.hash_ticket.length === 64
                ? `${ticket.hash_ticket.substring(0, 32)}
${ticket.hash_ticket.substring(32, 64)}`
                : (ticket.hash_ticket || 'Génération en cours');
            doc.font('Courier').fontSize(7).fillColor('#6b7280').text(`Trace NF525 (SHA-256) :
${hashFacture}`, 50, currentY, { width: 495 });
            currentY += 22;
            doc.font('Helvetica-Oblique').fontSize(7).fillColor('#6b7280').text(
                "Logiciel STACK v1.0 — Attestation individuelle de conformité fiscale (Art. 286 I-3° bis du CGI - Norme NF525).",
                50, currentY, { width: 495 }
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Génération du Bilan Journalier de Caisse (Ticket Z certifié ou Ticket X intermédiaire)
 * @param {Object} deps - { pool, enregistrerJET }
 * @param {Object} params - { id_salon, dateCible, user }
 * @returns {Promise<{ buffer: Buffer, nomFichier: string }>}
 */
async function genererBufferJournalierZ({ pool, enregistrerJET }, { id_salon, dateCible, user }) {
    const estEmploye = user.role === 'employe';
    const id_employe = user.id_employe;

            const configRes = await pool.query('SELECT nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville, heure_ouverture, heure_fermeture FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = configRes.rows[0] || {};
        
        const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${config.tva_intra}`;
        
        const filtreEmploye = estEmploye ? ' AND t.id_employe = $3' : '';
        const paramsVentes = estEmploye ? [id_salon, dateCible, id_employe] : [id_salon, dateCible];
        
        // 1. Ventes Détaillées (Inclut les ventes et les écritures d'annulation pour exactitude comptable NF525)
        const ventesResult = await pool.query(`
            SELECT 
                t.id_ticket, t.numero_ticket_caisse, TO_CHAR(t.date_creation, 'HH24:MI') as heure, t.total_ttc, t.methode_paiement, t.type_ticket,
                COALESCE(e.nom, 'Inconnu') as employe,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'nom', COALESCE(lt.nom_article_snapshot, c.nom, 'Article supprimé'),
                            'qte', COALESCE(lt.quantite, 0),
                            'ttc', COALESCE(lt.total_ligne_ttc, 0),
                            'tva', COALESCE(lt.taux_tva_snapshot, 20)
                        )
                    ) FILTER (WHERE lt.id_article IS NOT NULL), '[]'::json
                ) as lignes
            FROM tickets t
            LEFT JOIN lignes_ticket lt ON lt.id_ticket = t.id_ticket
            LEFT JOIN catalogue c ON lt.id_article = c.id_article
            LEFT JOIN employes e ON t.id_employe = e.id_employe
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.total_ttc, t.methode_paiement, t.type_ticket, e.nom
            ORDER BY t.date_creation ASC, t.id_ticket ASC
        `, paramsVentes);

        const caResult = await pool.query(`SELECT COALESCE(SUM(t.total_ttc), 0) as ca_total FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}`, paramsVentes);
        const caTotal = parseFloat(caResult.rows[0].ca_total) || 0;

        // 3. Clôture Info et Mouvements
        const clotureRes = await pool.query(`SELECT id_cloture, numero_z_salon, cumul_perpetuel_ttc, signature_hash, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2`, [id_salon, dateCible]);
        const clotureData = clotureRes.rowCount > 0 ? clotureRes.rows[0] : null;
        const cloturePar = clotureData ? clotureData.ferme_par : 'Non spécifié';

        const mouvementsResult = await pool.query(`SELECT COALESCE(SUM(montant), 0) as total_sorties FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2 AND type_mouvement = 'SORTIE'`, [id_salon, dateCible]);
        const totalSorties = parseFloat(mouvementsResult.rows[0].total_sorties) || 0;

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerant = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Gérant';

        let responsableCloture = cloturePar;
        if (cloturePar === 'Non spécifié' || cloturePar === 'Gérant') responsableCloture = nomGerant;
        else if (cloturePar.includes('Robot')) responsableCloture = 'Fermeture Automatique';

        // 4. Stats Commerciales (Annulations, Remises)
        const statsResult = await pool.query(`SELECT COUNT(DISTINCT id_ticket) as nb_tickets FROM tickets t WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE ${filtreEmploye}`, paramsVentes);
        const nbTickets = parseInt(statsResult.rows[0].nb_tickets) || 0;
        
        const annulsRes = await pool.query(`SELECT COUNT(*) as nb, COALESCE(SUM(ABS(total_ttc)), 0) as mnt FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND type_ticket = 'ANNULATION'`, [id_salon, dateCible]);
        const remisesRes = await pool.query(`SELECT COUNT(*) as nb FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND recompense_utilisee = TRUE AND statut = 'VALIDE' AND est_compense = FALSE`, [id_salon, dateCible]);

        // 5. CA par Catégorie
        const caCategories = await pool.query(`
            SELECT COALESCE(c.type_article, 'PRESTATION') as type_article, SUM(lt.total_ligne_ttc) as total
            FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY COALESCE(c.type_article, 'PRESTATION')
        `, paramsVentes);
        
        let totalPrestations = 0, totalRevente = 0;
        caCategories.rows.forEach(r => {
            if (r.type_article === 'PRESTATION') totalPrestations += parseFloat(r.total || 0);
            else totalRevente += parseFloat(r.total || 0);
        });

        // 6. Détail TVA
        const tvaDetails = await pool.query(`
            SELECT lt.taux_tva_snapshot as taux, SUM(lt.total_ligne_ttc) as total_ttc
            FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY lt.taux_tva_snapshot ORDER BY lt.taux_tva_snapshot DESC
        `, paramsVentes);

        // 7. Méthodes de Paiement
        const paiements = await pool.query(`
            SELECT methode_paiement, SUM(total_ttc) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' ${filtreEmploye}
            GROUP BY methode_paiement
        `, paramsVentes);
        
        let totalCB = 0, totalEspeces = 0, totalCheques = 0;
        paiements.rows.forEach(r => {
            if (r.methode_paiement === 'CARTE') totalCB += parseFloat(r.total || 0);
            if (r.methode_paiement === 'ESPECES') totalEspeces += parseFloat(r.total || 0);
            if (r.methode_paiement === 'CHEQUE') totalCheques += parseFloat(r.total || 0);
        });

        // 8. Stats par employé (Gérant uniquement - avec id_employe pour relier les pourboires)
        let employesStats = [];
        if (!estEmploye) {
            const empStatsRes = await pool.query(`
                SELECT e.id_employe, e.nom, e.est_gerant,
                       COALESCE(SUM(t.total_ttc), 0) as ca_genere,
                       (SELECT COALESCE(SUM(c.montant_commission), 0) FROM commissions c WHERE c.id_employe = e.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) = $2) as prime_due
                FROM employes e
                LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE'
                WHERE e.id_salon = $1
                GROUP BY e.id_employe, e.nom, e.est_gerant
                ORDER BY e.est_gerant DESC, e.nom ASC
            `, [id_salon, dateCible]);
            employesStats = empStatsRes.rows;
        }

        // ================== REQUÊTES ADDITIONNELLES POUR LE BILAN JOURNALIER ==================
        const salonExtra = config;
        const formeJuridique = config.forme_juridique ? ` - ${config.forme_juridique}` : '';

        // Ventilation CA par catégorie et par taux de TVA sur la journée
        const caDetailJourRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                COALESCE(lt.taux_tva_snapshot, 20) as taux_tva,
                SUM(lt.total_ligne_ttc) as total_ttc,
                SUM(lt.total_ligne_ttc / (1 + (COALESCE(lt.taux_tva_snapshot, 20) / 100))) as total_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2::date AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), COALESCE(lt.taux_tva_snapshot, 20)
            ORDER BY type_article ASC, taux_tva DESC
        `, paramsVentes);

        // Nombre et montant des encaissements par mode sur la journée
        const paiementsDetailJourRes = await pool.query(`
            SELECT methode_paiement, COUNT(id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb, COALESCE(SUM(total_ttc + COALESCE(montant_pourboire, 0)), 0) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date AND statut != 'ANNULE' ${filtreEmploye}
            GROUP BY methode_paiement
        `, paramsVentes);

        // Détail des mouvements d'espèces du jour (Entrées, Sorties, Régularisations)
        const mvtJourDetailRes = await pool.query(`
            SELECT TO_CHAR(date_creation, 'HH24:MI') as heure_mvt, type_mouvement, montant, motif
            FROM mouvements_caisse
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date
            ORDER BY date_creation ASC
        `, [id_salon, dateCible]);

        // Pourboires du jour par collaborateur
        const pourboiresJourRes = await pool.query(`
            SELECT id_employe, COALESCE(SUM(montant_pourboire), 0) as total_pourboire
            FROM tickets
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date AND statut != 'ANNULE' AND est_compense = FALSE
            GROUP BY id_employe
        `, [id_salon, dateCible]);
        const mapPourboiresJour = {};
        pourboiresJourRes.rows.forEach(r => { mapPourboiresJour[r.id_employe] = parseFloat(r.total_pourboire) || 0; });

        // Numéro de Z séquentiel propre au salon
        let numZSalon = 1;
        if (clotureData && clotureData.numero_z_salon) {
            numZSalon = parseInt(clotureData.numero_z_salon);
        } else {
            const zSeqRes = await pool.query(`SELECT COALESCE(MAX(numero_z_salon), 0) + 1 as next_z FROM clotures_caisse WHERE id_salon = $1`, [id_salon]);
            numZSalon = parseInt(zSeqRes.rows[0].next_z);
        }

        // Récupération stricte du Z précédent par ordre chronologique et séquentiel
        const prevZRes = await pool.query(`
            SELECT id_cloture, numero_z_salon, cumul_perpetuel_ttc, signature_hash
            FROM clotures_caisse
            WHERE id_salon = $1 AND date_cloture < $2::date
            ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon, dateCible]);
        const cumulAvantBdd = prevZRes.rowCount > 0 ? (parseFloat(prevZRes.rows[0].cumul_perpetuel_ttc) || 0) : 0;
        const hashPrecedentFallback = prevZRes.rowCount > 0 ? prevZRes.rows[0].signature_hash : 'GENESIS_Z';

        // Si le numéro Z stocké est incohérent (ex: Z#1 alors qu'il existe des Z antérieurs), on calcule son rang réel
        if (clotureData && prevZRes.rowCount > 0 && numZSalon <= 1) {
            const rangRes = await pool.query(
                `SELECT COUNT(*)::int as rang FROM clotures_caisse WHERE id_salon = $1 AND (date_cloture < $2::date OR (date_cloture = $2::date AND id_cloture <= $3))`,
                [id_salon, dateCible, clotureData.id_cloture]
            );
            if (rangRes.rows[0]?.rang > 0) numZSalon = rangRes.rows[0].rang;
        }

        // Horaires effectifs d'ouverture / clôture et compteurs d'événements JET
        const horairesTicketsRes = await pool.query(`
            SELECT TO_CHAR(MIN(date_creation), 'HH24:MI') as premiere_vente,
                   TO_CHAR(MAX(date_creation), 'HH24:MI') as derniere_vente
            FROM tickets
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date
        `, [id_salon, dateCible]);
        const heurePremiereVente = horairesTicketsRes.rows[0]?.premiere_vente || null;
        const heureDerniereVente = horairesTicketsRes.rows[0]?.derniere_vente || null;

        const pointageMinRes = await pool.query(`
            SELECT TO_CHAR(MIN(heure_action), 'HH24:MI') as premier_pointage
            FROM pointages
            WHERE id_salon = $1 AND date_jour = $2::date AND type_action = 'ENTREE'
        `, [id_salon, dateCible]);
        const heurePremierPointage = pointageMinRes.rows[0]?.premier_pointage || null;

        const jetJourRes = await pool.query(`
            SELECT action, TO_CHAR(date_creation, 'DD/MM/YYYY à HH24:MI:SS') as date_heure_jet, TO_CHAR(date_creation, 'HH24:MI') as heure_jet
            FROM jet_logs
            WHERE id_salon = $1 AND (
                (action IN ('CLOTURE_Z', 'CLOTURE_Z_AUTOMATIQUE') AND details->>'date_cloture' = $2)
                OR (action = 'IMPRESSION_DUPLICATA_Z' AND details->>'date_cloture' = $2)
                OR (DATE(date_creation) = $2::date AND action IN ('OUVERTURE_TIROIR', 'TIROIR_SANS_VENTE'))
            )
            ORDER BY id_jet ASC
        `, [id_salon, dateCible]);

        let heureClotureJet = null;
        let dateHeureClotureComplete = null;
        let nbDuplicatasPrecedents = 0;
        let nbOuverturesTiroir = 0;

        jetJourRes.rows.forEach(j => {
            if (j.action === 'CLOTURE_Z' || j.action === 'CLOTURE_Z_AUTOMATIQUE') {
                heureClotureJet = j.heure_jet;
                dateHeureClotureComplete = j.date_heure_jet;
            } else if (j.action === 'IMPRESSION_DUPLICATA_Z') {
                nbDuplicatasPrecedents++;
            } else if (j.action === 'OUVERTURE_TIROIR' || j.action === 'TIROIR_SANS_VENTE') {
                nbOuverturesTiroir++;
            }
        });

        let numeroDuplicata = 0;
        if (clotureData) {
            numeroDuplicata = nbDuplicatasPrecedents + 1;
            await enregistrerJET(id_salon, 'IMPRESSION_DUPLICATA_Z', {
                date_cloture: dateCible,
                id_cloture: clotureData.id_cloture,
                num_z_salon: numZSalon,
                numero_duplicata: numeroDuplicata
            });
        }

        const heureOuvertureAff = heurePremierPointage || heurePremiereVente || `${String(salonExtra.heure_ouverture || 8).padStart(2, '0')}:00`;
        const heureClotureAff = clotureData ? (dateHeureClotureComplete || heureClotureJet || heureDerniereVente || '23:59') : 'En cours (Non clôturé)';


    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const buffer = Buffer.concat(buffers);
                resolve({
                    buffer,
                    nomFichier: `Bilan_Journalier_${dateCible}.pdf`
                });
            });
            doc.on('error', reject);

                    let currentY = 40;
        const MAIN_COLOR = '#111827';
        const SEC_COLOR = '#4b5563';
        const BORDER_COLOR = '#e5e7eb';
        const nowImpression = new Date();
        const dateActiviteFr = new Date(dateCible).toLocaleDateString('fr-FR');

        const fMnt = (mnt) => {
            const parts = (parseFloat(mnt) || 0).toFixed(2).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return parts.join(',') + ' €';
        };

        // --- EN-TÊTE LÉGAL ET STATUT (TICKET Z vs TICKET X) ---
        const titrePrincipal = clotureData
            ? `BILAN JOURNALIER DE CLÔTURE — Z N° ${String(numZSalon).padStart(4, '0')}${estEmploye ? ' (EMPLOYÉ)' : ''}`
            : `LECTURE DE CAISSE EN COURS DE JOURNÉE (TICKET X)${estEmploye ? ' (EMPLOYÉ)' : ''}`;

        doc.font('Helvetica-Bold').fontSize(15).fillColor(MAIN_COLOR).text(titrePrincipal, 40, currentY);
        currentY += 20;

        const capSocialAff = config.capital_social && String(config.capital_social).trim() !== ''
            ? (String(config.capital_social).includes('€') ? config.capital_social.trim() : `${config.capital_social.trim()} €`)
            : 'Non renseigné';
        const rcsVilleAff = config.rcs_ville && String(config.rcs_ville).trim() !== '' ? config.rcs_ville.trim() : 'Non renseigné';

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${config.nom_salon || 'Salon'}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${config.adresse_salon || 'Non renseignée'}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${config.siret || 'Non renseigné'} | Capital social : ${capSocialAff} | RCS : ${rcsVilleAff}`, 40, currentY);
        currentY += 12;
        doc.text(`${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 14;

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(
            `Journée d'activité : ${dateActiviteFr} | Ouverture : ${heureOuvertureAff} | Scellement Z : ${heureClotureAff} | Opérateur : ${clotureData ? responsableCloture : 'Ticket X'}`,
            40, currentY, { width: 515 }
        );
        currentY += 14;

        if (clotureData) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#16a34a').text(
                `CLÔTURE DÉFINITIVE Z N° ${String(numZSalon).padStart(4, '0')} — DUPLICATA N° ${numeroDuplicata}`,
                40, currentY
            );
            doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
                `Réimpression du : ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                330, currentY, { width: 225, align: 'right' }
            );
            currentY += 18;
        } else {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(
                `TICKET X : Lecture intermédiaire non clôturante et non numérotée`,
                40, currentY
            );
            doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
                `Imprimé le : ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                330, currentY, { width: 225, align: 'right' }
            );
            currentY += 18;
        }

        // --- MOTEUR DE DESSIN UNIFIÉ (Anti-chevauchement avec support font/size par colonne) ---
        const drawTableTitle = (title) => {
            if (currentY > 730) { doc.addPage(); currentY = 40; }
            currentY += 6;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(title, 40, currentY);
            currentY += 16;
        };

        const drawRow = (cols, isHeader = false, isBold = false) => {
            const activeCols = cols.filter(c => c.w > 0);
            const defaultFont = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
            const defaultSize = isHeader ? 8 : 8.5;

            let maxH = 0;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s);
                const txt = col.text != null ? String(col.text) : '';
                const h = doc.heightOfString(txt, { width: col.w });
                if (h > maxH) maxH = h;
            });

            if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }

            let xPos = 40;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, {
                    width: col.w,
                    align: col.align || 'left'
                });
                xPos += col.w + 10;
            });

            currentY += Math.max(maxH, 10) + 4;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 5;
        };

        // --- 1. CHIFFRE D'AFFAIRES DU JOUR ---
        drawTableTitle("1. CHIFFRE D'AFFAIRES DU JOUR");
        drawRow([
            {text: 'Catégorie & Taux TVA', w: 180},
            {text: 'Base HT', w: 100, align: 'right'},
            {text: 'TVA Collectée', w: 100, align: 'right'},
            {text: 'Total TTC', w: 105, align: 'right'}
        ], true);

        let totalJourHT = 0, totalJourTVA = 0, totalJourTTC = 0;
        if (caDetailJourRes.rowCount === 0) {
            drawRow([
                {text: 'Aucune vente enregistrée sur la journée', w: 180},
                {text: '0,00 €', w: 100, align: 'right'},
                {text: '0,00 €', w: 100, align: 'right'},
                {text: '0,00 €', w: 105, align: 'right'}
            ]);
        } else {
            caDetailJourRes.rows.forEach(r => {
                const ttcCents = Math.round((parseFloat(r.total_ttc) || 0) * 100);
                const taux = franchiseTVA ? 0 : (parseFloat(r.taux_tva) || 0);
                const htCents = franchiseTVA ? ttcCents : Math.round(ttcCents / (1 + taux / 100));
                const tvaCents = ttcCents - htCents;

                const ht = htCents / 100;
                const tva = tvaCents / 100;
                const ttc = ttcCents / 100;

                const tauxTvaAff = franchiseTVA ? '0%' : `${taux.toString().replace('.', ',')}%`;
                const libelleCat = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaAff})`;

                totalJourHT = Number((totalJourHT + ht).toFixed(2));
                totalJourTVA = Number((totalJourTVA + tva).toFixed(2));
                totalJourTTC = Number((totalJourTTC + ttc).toFixed(2));

                drawRow([
                    {text: libelleCat, w: 180},
                    {text: fMnt(ht), w: 100, align: 'right'},
                    {text: fMnt(tva), w: 100, align: 'right'},
                    {text: fMnt(ttc), w: 105, align: 'right'}
                ]);
            });
        }

        drawRow([
            {text: "CHIFFRE D'AFFAIRES TOTAL DU JOUR", w: 180},
            {text: fMnt(totalJourHT), w: 100, align: 'right'},
            {text: fMnt(totalJourTVA), w: 100, align: 'right'},
            {text: fMnt(caTotal), w: 105, align: 'right'}
        ], false, true);

        if (franchiseTVA) {
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* TVA non applicable, art. 293 B du CGI.", 40, currentY);
            currentY += 12;
        }

        // --- 2. ENCAISSEMENTS PAR MODE & CONTRÔLE DE CAISSE DU JOUR ---
        drawTableTitle("2. ENCAISSEMENTS ET CONTRÔLE DE CAISSE DU JOUR");
        drawRow([
            {text: 'Mode de paiement', w: 210},
            {text: 'Nb Trans.', w: 85, align: 'center'},
            {text: 'Montant Encaissé TTC', w: 200, align: 'right'}
        ], true);

        const methodesJour = ['CARTE', 'ESPECES', 'CHEQUE', 'VIREMENT', 'BONS CADEAUX'];
        const mapPaiementsJour = {};
        paiementsDetailJourRes.rows.forEach(p => { mapPaiementsJour[p.methode_paiement] = p; });

        methodesJour.forEach(m => {
            const p = mapPaiementsJour[m] || { nb: 0, total: 0 };
            drawRow([
                {text: m, w: 210},
                {text: String(p.nb), w: 85, align: 'center'},
                {text: fMnt(p.total), w: 200, align: 'right'}
            ]);
        });

        const ticketMoyen = nbTickets > 0 ? (caTotal / nbTickets) : 0;
        drawRow([
            {text: `TOTAL ENCAISSÉ (${nbTickets} ticket(s), Panier Moyen : ${fMnt(ticketMoyen)})`, w: 305},
            {text: fMnt(caTotal), w: 200, align: 'right'}
        ], false, true);

        // Contrôle de caisse à l'échelle du jour (Gérant uniquement)
        if (!estEmploye) {
            currentY += 8;
            if (currentY > 650) { doc.addPage(); currentY = 40; }
            doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("CONTRÔLE DE LA CAISSE DU JOUR (Espèces)", 40, currentY);
            currentY += 14;

            let totalEntreesJour = 0;
            let totalSortiesJour = 0;
            let totalRegulJour = 0;
            mvtJourDetailRes.rows.forEach(m => {
                const mnt = parseFloat(m.montant) || 0;
                if (m.type_mouvement === 'ENTREE') totalEntreesJour += mnt;
                else if (m.type_mouvement === 'SORTIE') totalSortiesJour += mnt;
                else if (m.type_mouvement === 'REGULARISATION') totalRegulJour += mnt;
            });

            const fMatin = clotureData ? parseFloat(clotureData.fond_caisse_matin || 0) : 0;
            const tTheorique = clotureData
                ? parseFloat(clotureData.total_especes_theorique || 0)
                : (fMatin + totalEspeces + totalEntreesJour - totalSortiesJour + totalRegulJour);
            const tReel = clotureData ? parseFloat(clotureData.total_especes_reel || 0) : 0;
            const ecart = clotureData ? parseFloat(clotureData.ecart_caisse || 0) : 0;
            const isAutoClose = cloturePar.toLowerCase().includes('robot') || cloturePar.toLowerCase().includes('auto');

            drawRow([{text: 'Fond de caisse du matin (Ouverture)', w: 350}, {text: fMnt(fMatin), w: 155, align: 'right'}]);
            drawRow([{text: 'Espèces encaissées clients (+)', w: 350}, {text: fMnt(totalEspeces), w: 155, align: 'right'}]);
            drawRow([{text: 'Apports de caisse du jour (+)', w: 350}, {text: fMnt(totalEntreesJour), w: 155, align: 'right'}]);
            drawRow([{text: 'Retraits et dépenses en espèces du jour (-)', w: 350}, {text: totalSortiesJour > 0 ? `-${fMnt(totalSortiesJour)}` : '0,00 €', w: 155, align: 'right'}]);
            if (Math.abs(totalRegulJour) > 0.009) {
                drawRow([{text: 'Régularisations de caisse du jour (±)', w: 350}, {text: fMnt(totalRegulJour), w: 155, align: 'right'}]);
            }

            drawRow([{text: 'ESPÈCES THÉORIQUES (Attendues à la clôture)', w: 350}, {text: fMnt(tTheorique), w: 155, align: 'right'}], false, true);

            const texteReel = !clotureData
                ? 'En attente de clôture'
                : (isAutoClose ? 'Non compté (Clôture Auto.)' : fMnt(tReel));
            drawRow([{text: 'ESPÈCES COMPTÉES (Physique en caisse)', w: 350}, {text: texteReel, w: 155, align: 'right'}], false, true);

            const texteEcart = !clotureData
                ? 'Non applicable (Ticket X)'
                : (isAutoClose ? 'Non compté' : `${ecart > 0 ? '+' : ''}${fMnt(ecart)}`);
            drawRow([{text: 'ÉCART DE CAISSE CONSTATÉ', w: 350}, {text: texteEcart, w: 155, align: 'right'}], false, true);

            const texteFondConserve = !clotureData
                ? fMnt(tTheorique)
                : (isAutoClose ? fMnt(tTheorique) : fMnt(tReel));
            drawRow([{text: 'FOND DE CAISSE CONSERVÉ (Pour demain)', w: 350}, {text: texteFondConserve, w: 155, align: 'right'}], false, true);

            if (clotureData && clotureData.justification_ecart) {
                currentY += 3;
                doc.font('Helvetica-Oblique').fontSize(8).fillColor('#ea580c').text(`Justification de l'écart : "${clotureData.justification_ecart}"`, 40, currentY);
                currentY += 12;
            }

            if (mvtJourDetailRes.rowCount > 0) {
                currentY += 6;
                doc.font('Helvetica-Bold').fontSize(9).fillColor(SEC_COLOR).text("Détail des Apports, Sorties d'espèces et Régularisations du jour :", 40, currentY);
                currentY += 14;
                drawRow([
                    {text: 'Heure', w: 55, align: 'center'},
                    {text: 'Nature', w: 95},
                    {text: 'Motif / Dépense espèces', w: 235},
                    {text: 'Montant', w: 100, align: 'right'}
                ], true);

                mvtJourDetailRes.rows.forEach(mvt => {
                    const labelMvt = mvt.type_mouvement === 'ENTREE'
                        ? 'Apport (+)'
                        : (mvt.type_mouvement === 'SORTIE' ? 'Sortie espèces (-)' : 'Régularisation (±)');
                    drawRow([
                        {text: mvt.heure_mvt || '-', w: 55, align: 'center'},
                        {text: labelMvt, w: 95},
                        {text: mvt.motif || 'Non renseigné', w: 235},
                        {text: fMnt(mvt.montant), w: 100, align: 'right'}
                    ]);
                });
            }
        }

        // --- 3. COMPTEURS D'ÉVÉNEMENTS & INDICATEURS DU JOUR ---
        drawTableTitle("3. COMPTEURS D'ÉVÉNEMENTS ET INDICATEURS DU JOUR");
        drawRow([
            {text: 'Indicateur / Événement fiscal', w: 350},
            {text: 'Valeur / Cumul jour', w: 155, align: 'right'}
        ], true);

        const nbAnnuls = parseInt(annulsRes.rows[0].nb) || 0;
        const mntAnnuls = parseFloat(annulsRes.rows[0].mnt) || 0;

        drawRow([{text: 'Nombre de tickets validés sur la journée', w: 350}, {text: `${nbTickets}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Ticket moyen du jour', w: 350}, {text: fMnt(ticketMoyen), w: 155, align: 'right'}]);
        drawRow([{text: 'Annulations de tickets (Nombre et montant compensé)', w: 350}, {text: `${nbAnnuls} (${fMnt(mntAnnuls)})`, w: 155, align: 'right'}]);
        drawRow([{text: 'Avoirs / Retours hors annulation directe', w: 350}, {text: '0 (0,00 €)', w: 155, align: 'right'}]);
        drawRow([{text: 'Tickets avec remise ou avantage fidélité', w: 350}, {text: `${remisesRes.rows[0].nb}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Duplicatas de clôture émis', w: 350}, {text: `${numeroDuplicata}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Ouvertures de tiroir-caisse sans vente', w: 350}, {text: `${nbOuverturesTiroir}`, w: 155, align: 'right'}]);

        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le mode formation est strictement exclu du chiffre d'affaires et des cumuls perpétuels.", 40, currentY);
        currentY += 12;

        // --- 4. ACTIVITÉ ET PRIMES DU JOUR PAR COLLABORATEUR ---
        if (!estEmploye) {
            drawTableTitle("4. ACTIVITÉ, PRIMES ET POURBOIRES DU JOUR PAR COLLABORATEUR");
            drawRow([
                {text: 'Collaborateur', w: 115},
                {text: 'Statut', w: 70, align: 'center'},
                {text: 'CA Jour TTC', w: 90, align: 'right'},
                {text: 'Pourboires Jour', w: 80, align: 'right'},
                {text: 'Prime Due (Base HT)', w: 120, align: 'right'}
            ], true);

            let sumCaCollaborateurs = 0;
            let sumPrimesJour = 0;
            let sumPourboiresJour = 0;

            employesStats.forEach(emp => {
                const caEmp = parseFloat(emp.ca_genere || 0);
                const primeEmp = parseFloat(emp.prime_due || 0);
                const pourboireEmp = mapPourboiresJour[emp.id_employe] || 0;
                sumCaCollaborateurs += caEmp;
                if (!emp.est_gerant) sumPrimesJour += primeEmp;

                drawRow([
                    {text: emp.nom, w: 115},
                    {text: emp.est_gerant ? 'Gérant' : 'Salarié(e)', w: 70, align: 'center'},
                    {text: fMnt(caEmp), w: 90, align: 'right'},
                    {text: emp.est_gerant ? 'N/A' : fMnt(pourboireEmp), w: 80, align: 'right'},
                    {text: emp.est_gerant ? 'N/A (Gérant)' : fMnt(primeEmp), w: 120, align: 'right'}
                ]);
            });

            Object.values(mapPourboiresJour).forEach(p => { sumPourboiresJour += p; });

            const caNonAttribueJour = caTotal - sumCaCollaborateurs;
            if (Math.abs(caNonAttribueJour) > 0.01) {
                drawRow([
                    {text: 'CA non attribué', w: 115},
                    {text: 'N/A', w: 70, align: 'center'},
                    {text: fMnt(caNonAttribueJour), w: 90, align: 'right'},
                    {text: '-', w: 80, align: 'right'},
                    {text: '-', w: 120, align: 'right'}
                ]);
            }

            drawRow([
                {text: 'TOTAL ÉQUIPE DU JOUR', w: 195},
                {text: fMnt(caTotal), w: 90, align: 'right'},
                {text: fMnt(sumPourboiresJour), w: 80, align: 'right'},
                {text: fMnt(sumPrimesJour), w: 120, align: 'right'}
            ], false, true);
        }

        // --- 5. DÉTAIL DES VENTES DU JOUR ---
        drawTableTitle("5. DÉTAIL DES VENTES DU JOUR");
        // Grille calibrée sans retour à la ligne sur le symbole € : 28 + 82 + 95 + 38 + 46 + 52 + 48 + 56 = 445 + (7 * 10) = 515 pt
        const drawHeaderVentesJour = () => {
            drawRow([
                {text: 'Heure', w: 28},
                {text: 'N° Ticket', w: 82},
                {text: 'Lignes (Qté x Presta / Produit)', w: 95},
                {text: 'Paiem.', w: 38, align: 'center'},
                {text: 'Vendeur', w: 46, align: 'center'},
                {text: 'HT', w: 52, align: 'right'},
                {text: 'TVA', w: 48, align: 'right'},
                {text: 'TTC', w: 56, align: 'right'}
            ], true);
        };

        drawHeaderVentesJour();

        if (ventesResult.rowCount === 0) {
            drawRow([{text: 'Aucune transaction enregistrée sur cette journée.', w: 515}]);
        } else {
            ventesResult.rows.forEach(v => {
                let lignesTxt = [];
                let totalTicketHT = 0;
                let totalTicketTVA = 0;
                const totalTicketTTC = parseFloat(v.total_ttc || 0);

                (v.lignes || []).forEach(l => {
                    if (!l.nom) return;
                    const lTtc = parseFloat(l.ttc || 0);
                    let lHt = lTtc, lTva = 0, lTaux = 0;
                    if (!franchiseTVA) {
                        lTaux = parseFloat(l.tva || 20);
                        lHt = lTtc / (1 + lTaux / 100);
                        lTva = lTtc - lHt;
                    }
                    totalTicketHT += lHt;
                    totalTicketTVA += lTva;
                    lignesTxt.push(`${l.qte || 1}x ${l.nom}`);
                });

                if (lignesTxt.length === 0) {
                    totalTicketHT = franchiseTVA ? totalTicketTTC : (totalTicketTTC / 1.2);
                    totalTicketTVA = totalTicketTTC - totalTicketHT;
                    lignesTxt.push('Encaissement direct');
                }

                if (currentY > 735) {
                    doc.addPage();
                    currentY = 40;
                    drawHeaderVentesJour();
                }

                drawRow([
                    {text: v.heure || '-', w: 28, size: 8},
                    {text: v.numero_ticket_caisse || '-', w: 82, size: 7.5},
                    {text: lignesTxt.join('\n'), w: 95, size: 8},
                    {text: v.methode_paiement || 'N/A', w: 38, align: 'center', size: 7.5},
                    {text: v.employe || 'Inconnu', w: 46, align: 'center', size: 8},
                    {text: fMnt(totalTicketHT), w: 52, align: 'right', size: 8},
                    {text: fMnt(totalTicketTVA), w: 48, align: 'right', size: 8},
                    {text: fMnt(totalTicketTTC), w: 56, align: 'right', size: 8}
                ]);
            });

            // Ligne de totalisation du journal des ventes (Fusion Col 1..5 = 28+82+95+38+46 + 4*10 = 329 pt)
            drawRow([
                {text: `TOTAL DES VENTES DU JOUR (${ventesResult.rowCount} pièce(s))`, w: 329},
                {text: fMnt(totalJourHT), w: 52, align: 'right'},
                {text: fMnt(totalJourTVA), w: 48, align: 'right'},
                {text: fMnt(caTotal), w: 56, align: 'right'}
            ], false, true);
        }

        // --- 6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 & CUMUL PERPÉTUEL ---
        if (currentY > 540) { doc.addPage(); currentY = 40; }
        drawTableTitle("6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 ET CUMUL PERPÉTUEL");

        // Règle NF525 stricte : Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour
        const cumulAvant = numZSalon === 1 ? 0 : Number(cumulAvantBdd.toFixed(2));
        const cumulApres = Number((cumulAvant + caTotal).toFixed(2));
        const ecartCumulDetecte = clotureData && clotureData.cumul_perpetuel_ttc != null
            && Math.abs((parseFloat(clotureData.cumul_perpetuel_ttc) || 0) - cumulApres) > 0.02;

        const hashActuel = clotureData ? (clotureData.signature_hash || 'NON-SIGNE') : 'EN ATTENTE DE CLÔTURE (TICKET X)';
        const hashPrec = (numZSalon === 1) ? 'GENESIS_Z' : (clotureData ? (clotureData.hash_precedent || hashPrecedentFallback) : hashPrecedentFallback);
        const splitHash32 = (h) => (h && h.length === 64) ? `${h.substring(0, 32)}\n${h.substring(32, 64)}` : h;

        drawRow([
            {text: 'Numéro de Z séquentiel (Propre au salon)', w: 260},
            {text: clotureData ? `Z N° ${String(numZSalon).padStart(4, '0')}` : 'Non numéroté (Ticket X en cours)', w: 245, align: 'right'}
        ], false, true);
        drawRow([
            {text: 'Cumul perpétuel TTC avant clôture', w: 260},
            {text: fMnt(cumulAvant), w: 245, align: 'right'}
        ]);
        drawRow([
            {text: "Chiffre d'affaires TTC du jour (+)", w: 260},
            {text: fMnt(caTotal), w: 245, align: 'right'}
        ]);
        drawRow([
            {text: 'Cumul perpétuel TTC après clôture (=)', w: 260},
            {text: fMnt(cumulApres), w: 245, align: 'right'}
        ], false, true);
        drawRow([
            {text: 'Contrôle mathématique (Après = Avant + CA du jour)', w: 240},
            {text: ecartCumulDetecte ? `ANOMALIE CUMUL STOCKÉ (${fMnt(clotureData.cumul_perpetuel_ttc)})` : `Conforme : ${fMnt(cumulApres)} = ${fMnt(cumulAvant)} + ${fMnt(caTotal)}`, w: 265, align: 'right', size: 8, color: ecartCumulDetecte ? '#dc2626' : '#16a34a'}
        ], false, true);
        drawRow([
            {text: 'Algorithme et dispositif de signature', w: 260},
            {text: 'SHA-256 — Scellement et chaînage NF525', w: 245, align: 'right'}
        ]);
        drawRow([
            {text: 'Empreinte SHA-256 de ce Z (Scellement)', w: 260},
            {text: splitHash32(hashActuel), w: 245, align: 'right', font: 'Courier-Bold', size: 7.5, color: '#166534'}
        ]);
        drawRow([
            {text: 'Empreinte SHA-256 du Z précédent (Chaînage)', w: 260},
            {text: splitHash32(hashPrec), w: 245, align: 'right', font: 'Courier', size: 7.5, color: SEC_COLOR}
        ]);

        // --- MENTIONS LÉGALES & ATTESTATION DE L'ÉDITEUR ---
        currentY += 6;
        if (currentY > 665) { doc.addPage(); currentY = 40; }
        doc.rect(40, currentY, 515, 65).fillAndStroke('#f9fafb', BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MAIN_COLOR).text('MENTIONS LÉGALES, ATTESTATION ÉDITEUR ET CONSERVATION (Loi de Finances - NF525)', 50, currentY + 8);
        doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
            "• Attestation individuelle de conformité : L'éditeur du logiciel STACK v1.0 atteste que ce système satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données prévues au 3° bis du I de l'article 286 du CGI.\n" +
            "• Conservation légale : Les pièces et archives fiscales doivent être conservées pendant 6 ans (LPF, art. L. 102 B) et les pièces comptables pendant 10 ans (Code de commerce, art. L. 123-22).",
            50, currentY + 22, { width: 495, lineGap: 2 }
        );
        currentY += 75;

        if (clotureData) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text(
                `Clôturé par : ${responsableCloture} — Date et heure de clôture : ${dateHeureClotureComplete || (dateActiviteFr + ' à ' + heureClotureAff)}`,
                40, currentY
            );
        } else {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#ea580c').text(
                `Lecture en cours de journée (Ticket X non clôturant) — Édité le ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                40, currentY
            );
        }

        // --- PAGINATION DYNAMIQUE ---
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
            doc.switchToPage(i);
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(
                `Page ${page} / ${range.count}`,
                0, 815,
                { align: 'center', width: 595 }
            );
            doc.page.margins.bottom = originalBottomMargin;
        }

        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    genererBufferFactureTicketPDF,
    genererBufferJournalierZ
};
