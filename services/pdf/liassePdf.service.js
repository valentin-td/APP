const PDFDocument = require('pdfkit');
const crypto = require('crypto');

function deduireCategorieMouvement(type_mouvement, motif, categorieExplicite = null) {
    if (categorieExplicite && ['ACHAT_ESPECES', 'REMISE_BANQUE', 'APPORT_FONDS', 'PRELEVEMENT_GERANT', 'ECART_CAISSE'].includes(categorieExplicite)) {
        return categorieExplicite;
    }
    if (type_mouvement === 'REGULARISATION') return 'ECART_CAISSE';
    const m = String(motif || '').toLowerCase();
    if (type_mouvement === 'ENTREE') {
        return 'APPORT_FONDS';
    }
    if (m.includes('banque') || m.includes('dépôt') || m.includes('depot') || m.includes('remise') || m.includes('coffre')) {
        return 'REMISE_BANQUE';
    }
    if (m.includes('facture') || m.includes('achat') || m.includes('fournisseur') || m.includes('courses') || m.includes('timbre') || m.includes('poste')) {
        return 'ACHAT_ESPECES';
    }
    if (m.includes('gérant') || m.includes('gerant') || m.includes('patron') || m.includes('prélèvement') || m.includes('prelevement') || m.includes('acompte')) {
        return 'PRELEVEMENT_GERANT';
    }
    return 'ACHAT_ESPECES';
}

async function recupererBufferDepuisR2OuBase64(valeurStockee, options = {}) {
    if (!valeurStockee || typeof valeurStockee !== 'string') return null;
    const clientS3 = options.s3Client;
    const CmdClass = options.GetObjectCommand;
    if (valeurStockee.startsWith('r2://') && process.env.R2_BUCKET_NAME && clientS3 && CmdClass) {
        try {
            const cleR2 = valeurStockee.replace('r2://', '');
            const obj = await clientS3.send(new CmdClass({ Bucket: process.env.R2_BUCKET_NAME, Key: cleR2 }));
            if (obj.Body && typeof obj.Body.transformToByteArray === 'function') {
                const bytes = await obj.Body.transformToByteArray();
                return Buffer.from(bytes);
            }
            const chunks = [];
            for await (const chunk of obj.Body) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        } catch (errDl) {
            console.error("⚠️ [R2 Download Buffer] Erreur lecture image PDF :", errDl.message);
            return null;
        }
    }
    if (valeurStockee.includes('base64,')) {
        return Buffer.from(valeurStockee.split('base64,')[1], 'base64');
    }
    return null;
}

/**
 * Génération de la Liasse Comptable Mensuelle certifiée NF525 au format PDF
 * @param {Object|number|string} depsOrIdSalon - Dépendances { pool, s3Client, GetObjectCommand, getSignedUrl } ou id_salon direct
 * @param {number|string} [idSalonOrMoisAnnee] - id_salon si deps passé en premier, sinon mois_annee (YYYY-MM)
 * @param {string} [maybeMoisAnnee] - mois_annee (YYYY-MM) si deps passé en premier
 * @returns {Promise<{ buffer: Buffer, numeroArchive: string, nomDuSalon: string, firstDayOfMonth: Date, lastDayOfMonth: Date, salonConfig: Object, estMoisCloture: boolean }>}
 */
async function genererBufferLiassePdf(depsOrIdSalon, idSalonOrMoisAnnee, maybeMoisAnnee) {
    let pool, s3Client, GetObjectCommand, getSignedUrl, id_salon, mois_annee;

    if (depsOrIdSalon && typeof depsOrIdSalon === 'object' && depsOrIdSalon.pool) {
        pool = depsOrIdSalon.pool;
        s3Client = depsOrIdSalon.s3Client;
        GetObjectCommand = depsOrIdSalon.GetObjectCommand;
        getSignedUrl = depsOrIdSalon.getSignedUrl;
        id_salon = idSalonOrMoisAnnee;
        mois_annee = maybeMoisAnnee;
    } else {
        id_salon = depsOrIdSalon;
        mois_annee = idSalonOrMoisAnnee;
    }

        return new Promise(async (resolve, reject) => {
        try {
            const today = new Date();
        let referenceDate = new Date();
        if (mois_annee) {
            const [year, month] = mois_annee.split('-');
            referenceDate = new Date(year, parseInt(month) - 1, 15);
        }

        const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDayOfMonth);
        const dateFinStr = formatYMD(lastDayOfMonth);

        // --- STATUT ET LÉGALITÉ (Basé sur la validation scellée du gérant + signature manuscrite) ---
        await pool.query('ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS signature_base64 TEXT').catch(() => {});
        const moisCibleStr = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
        const validationRes = await pool.query('SELECT valide_par, date_validation, signature_hash, hash_precedent, signature_base64 FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [id_salon, moisCibleStr]);
        
        const estMoisCloture = validationRes.rowCount > 0;
        const statutDocument = estMoisCloture ? "DÉFINITIF (CLÔTURÉ ET SIGNÉ)" : "BROUILLON PROVISOIRE - NON SIGNÉ";
        
        let signatureArchive = '';
        let fullHashArchive = '';
        let numeroArchive = 'NON-APPLICABLE-MOIS-EN-COURS';
        if (estMoisCloture) {
            const dateValISO = validationRes.rows[0].date_validation ? new Date(validationRes.rows[0].date_validation).toISOString() : dateFinStr;
            fullHashArchive = validationRes.rows[0].signature_hash || crypto.createHash('sha256').update(`LIASSE-${id_salon}-${dateFinStr}-${validationRes.rows[0].valide_par}-${dateValISO}`).digest('hex');
            signatureArchive = fullHashArchive.substring(0, 16).toUpperCase();
            numeroArchive = `ARCH-${id_salon}-${referenceDate.getFullYear()}${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${signatureArchive}`;
        }

        // Utilisation de SELECT * pour éviter les crashs si la colonne forme_juridique n'est pas encore créée
        const configResult = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonConfig = configResult.rowCount > 0 ? configResult.rows[0] : {};
        const nomDuSalon = salonConfig.nom_salon || 'Salon Inconnu';
        
        // Déduction automatique du titre du dirigeant selon la forme juridique
        const getTitreDirigeant = (forme) => {
            if (!forme) return "Représentant Légal";
            const f = forme.toUpperCase().trim();
            if (['SARL', 'EURL', 'SNC'].includes(f)) return "Gérant(e)";
            if (['SAS', 'SASU', 'SA', 'ASSOCIATION'].includes(f)) return "Président(e)";
            if (['EI', 'EIRL', 'AUTO-ENTREPRENEUR', 'MICRO-ENTREPRISE'].includes(f)) return "Exploitant(e)";
            return "Représentant Légal";
        };
        const titreDirigeant = getTitreDirigeant(salonConfig.forme_juridique);
        
        // 🚨 BLOCAGE STRICT : SIRET ET ADRESSE OBLIGATOIRES (Rejection propre de la Promise)
        if (!salonConfig.siret || !salonConfig.adresse_salon || salonConfig.siret.trim() === '') {
            return reject(new Error("Édition bloquée : Le SIRET et l'Adresse du salon sont obligatoires pour générer une liasse légale. Veuillez les remplir dans vos paramètres."));
        }

        const franchiseTVA = !salonConfig.tva_intra || salonConfig.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${salonConfig.tva_intra}`;

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerant = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Gérant';

        // 1. REQUÊTE : Chiffre d'Affaires détaillé (Regroupé à 0% si franchise de TVA)
        const caDetailRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                (CASE WHEN $4::boolean THEN 0 ELSE COALESCE(lt.taux_tva_snapshot, 20) END) as taux_tva,
                SUM(lt.total_ligne_ttc) as total_ttc,
                SUM(lt.total_ligne_ttc / (1 + ((CASE WHEN $4::boolean THEN 0 ELSE COALESCE(lt.taux_tva_snapshot, 20) END) / 100))) as total_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), (CASE WHEN $4::boolean THEN 0 ELSE COALESCE(lt.taux_tva_snapshot, 20) END)
            ORDER BY type_article ASC, taux_tva DESC
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);

        // 2. REQUÊTE : Paiements et Mouvements
        const paiementsRes = await pool.query(`SELECT methode_paiement, COUNT(id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb, COALESCE(SUM(total_ttc + COALESCE(montant_pourboire, 0)), 0) as total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
        const statsRes = await pool.query(`SELECT COUNT(DISTINCT id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb_tickets, COUNT(DISTINCT id_client) as nb_clients, COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        
        const caisseRes = await pool.query(`
            SELECT 
                (SELECT COALESCE(fond_caisse_matin, 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3 ORDER BY date_cloture ASC LIMIT 1) as fond_debut_mois,
                (SELECT COALESCE(total_especes_reel, 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3 ORDER BY date_cloture DESC LIMIT 1) as fond_fin_mois,
                (SELECT COALESCE(SUM(ecart_caisse), 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3) 
                + 
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'REGULARISATION' AND DATE(date_creation) BETWEEN $2 AND $3) as ecarts,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'SORTIE' AND DATE(date_creation) BETWEEN $2 AND $3) as sorties,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'ENTREE' AND DATE(date_creation) BETWEEN $2 AND $3) as entrees
        `, [id_salon, dateDebutStr, dateFinStr]);

        const mouvementsRes = await pool.query(`
            SELECT type_mouvement, categorie_comptable, montant, motif, DATE(date_creation) as date_brute, TO_CHAR(date_creation, 'DD/MM/YYYY') as date_mvt 
            FROM mouvements_caisse 
            WHERE id_salon = $1 AND type_mouvement IN ('ENTREE', 'SORTIE') AND DATE(date_creation) BETWEEN $2 AND $3 
            ORDER BY date_creation ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        const pourboiresMoisRes = await pool.query(`
            SELECT COALESCE(SUM(montant_pourboire), 0) as total_pourboires
            FROM tickets
            WHERE id_salon = $1 AND statut = 'VALIDE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE AND DATE(date_creation) BETWEEN $2 AND $3
        `, [id_salon, dateDebutStr, dateFinStr]);
        const totalPourboiresMois = parseFloat(pourboiresMoisRes.rows[0]?.total_pourboires) || 0;

        // --- Cumul annuel pour la Franchise en Base (basé sur l'année de referenceDate) ---
        const firstDayOfYear = new Date(referenceDate.getFullYear(), 0, 1);
        const dateDebutAnneeStr = formatYMD(firstDayOfYear);
        
        const cumulAnnuelRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                SUM(lt.total_ligne_ttc) as total_ttc
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION')
        `, [id_salon, dateDebutAnneeStr, dateFinStr]);

        // REQUÊTE : Historique des Z du mois (CA exact via c.total_encaisse, booléen est_cloture_automatique et nombre de tickets du jour)
        const zMoisRes = await pool.query(`
            SELECT c.id_cloture, COALESCE(c.numero_z_salon, c.id_cloture) as num_z_final, TO_CHAR(c.date_cloture, 'DD/MM/YYYY') as date_z, 
                   c.total_especes_reel, c.ferme_par, c.est_cloture_automatique, c.signature_hash, c.cumul_perpetuel_ttc,
                   COUNT(t.id_ticket) FILTER (WHERE t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE) as nb_tickets,
                   COALESCE(c.total_encaisse, SUM(t.total_ttc), 0) as ca_ttc
            FROM clotures_caisse c
            LEFT JOIN tickets t ON t.id_salon = c.id_salon 
                                AND DATE(t.date_creation) = DATE(c.date_cloture)
                                AND t.statut = 'VALIDE'
            WHERE c.id_salon = $1 AND DATE(c.date_cloture) BETWEEN $2 AND $3 
            GROUP BY c.id_cloture, c.numero_z_salon, c.date_cloture, c.total_especes_reel, c.ferme_par, c.est_cloture_automatique, c.signature_hash, c.cumul_perpetuel_ttc, c.total_encaisse
            ORDER BY c.numero_z_salon ASC NULLS LAST, c.date_cloture ASC, c.id_cloture ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        // Sommes EXACTES arrêtées à la date du dernier Z
        const lastZRes = await pool.query(`SELECT MAX(DATE(date_cloture)) as date_max, TO_CHAR(MAX(date_cloture), 'DD/MM/YYYY') as date_max_str FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const lastZDate = lastZRes.rows[0].date_max || lastDayOfMonth;
        const lastZDateStr = lastZRes.rows[0].date_max_str || 'N/A';

        const controleRes = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(total_ttc + COALESCE(montant_pourboire, 0)), 0) FROM tickets WHERE id_salon = $1 AND methode_paiement = 'ESPECES' AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3) as especes_z,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'ENTREE' AND DATE(date_creation) BETWEEN $2 AND $3) as entrees_z,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'SORTIE' AND DATE(date_creation) BETWEEN $2 AND $3) as sorties_z,
                (SELECT COALESCE(SUM(ecart_caisse), 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3) + (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'REGULARISATION' AND DATE(date_creation) BETWEEN $2 AND $3) as ecarts_z
        `, [id_salon, dateDebutStr, lastZDate]);

        // 3. REQUÊTE : Dépenses
        const facturesRes = await pool.query(`SELECT nom_fournisseur, numero_facture, mode_paiement, statut_verification, justificatif_url, compte_comptable, TO_CHAR(COALESCE(date_facture, DATE(date_traitement)), 'DD/MM/YYYY') as date_facture, montant_ht, montant_tva, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND COALESCE(date_facture, DATE(date_traitement)) BETWEEN $2 AND $3 ORDER BY COALESCE(date_facture, DATE(date_traitement)) ASC`, [id_salon, dateDebutStr, dateFinStr]);

        // 4. REQUÊTE : Commissions Employés & Contrats (Recalcul exact + Heures + Pourboires)
        const rhRes = await pool.query(`
            SELECT e.id_employe, e.nom, e.est_gerant, e.type_contrat, e.heures_mensuelles_base,
                   MAX(e.taux_commission_prestation) as taux_presta,
                   MAX(e.taux_commission_produit) as taux_produit,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') = 'PRESTATION' THEN lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100) ELSE 0 END), 0) as base_presta_ht,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') != 'PRESTATION' THEN lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100) ELSE 0 END), 0) as base_produit_ht,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') = 'PRESTATION' THEN (lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) * (e.taux_commission_prestation / 100) ELSE (lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) * (e.taux_commission_produit / 100) END), 0) as total_prime,
                   (SELECT COALESCE(SUM(montant_pourboire), 0) FROM tickets t2 WHERE t2.id_employe = e.id_employe AND DATE(t2.date_creation) BETWEEN $2 AND $3 AND t2.statut = 'VALIDE' AND t2.type_ticket != 'ANNULATION' AND t2.est_compense = FALSE) as total_pourboire
            FROM employes e 
            LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) BETWEEN $2 AND $3 AND t.statut = 'VALIDE'
            LEFT JOIN lignes_ticket lt ON lt.id_ticket = t.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE e.id_salon = $1 
            GROUP BY e.id_employe, e.nom, e.est_gerant, e.type_contrat, e.heures_mensuelles_base
            ORDER BY e.est_gerant DESC, e.nom ASC
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);

        const anneeMoisAjustement = dateDebutStr.substring(0, 7); // Ex: "2026-10"
        const ajustementsRes = await pool.query(`SELECT ha.id_employe, SUM(ha.heures_ajoutees) as heures_supp FROM heures_ajustements ha JOIN employes e ON e.id_employe = ha.id_employe WHERE ha.mois_annee = $1 AND e.id_salon = $2 GROUP BY ha.id_employe`, [anneeMoisAjustement, id_salon]);
        const mapAjustements = {};
        ajustementsRes.rows.forEach(r => mapAjustements[r.id_employe] = parseFloat(r.heures_supp));

        // 4a. REQUÊTE : Calcul exact des heures pointées sur le mois (Mode POINTEUSE)
        const pointagesMoisRes = await pool.query(`
            SELECT id_employe, date_jour, type_action, heure_action
            FROM pointages
            WHERE id_salon = $1 AND date_jour BETWEEN $2 AND $3
            ORDER BY id_employe ASC, date_jour ASC, heure_action ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        const mapHeuresPointees = {};
        const pointagesParEmpJour = {};
        pointagesMoisRes.rows.forEach(pt => {
            const cle = `${pt.id_employe}_${new Date(pt.date_jour).toISOString().slice(0, 10)}`;
            if (!pointagesParEmpJour[cle]) pointagesParEmpJour[cle] = { id_employe: pt.id_employe, actions: [] };
            pointagesParEmpJour[cle].actions.push({ type: pt.type_action, ts: new Date(pt.heure_action).getTime() });
        });

        Object.values(pointagesParEmpJour).forEach(jour => {
            let debutTravail = null;
            let debutPause = null;
            let cumulMsJour = 0;

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
                        const finEffective = debutPause !== null ? debutPause : act.ts;
                        if (finEffective > debutTravail) cumulMsJour += (finEffective - debutTravail);
                        debutTravail = null;
                        debutPause = null;
                    }
                }
            });

            const heuresJour = cumulMsJour / (1000 * 60 * 60);
            mapHeuresPointees[jour.id_employe] = (mapHeuresPointees[jour.id_employe] || 0) + heuresJour;
        });

        // 4bis. REQUÊTE : CA Réalisé par employé en HT réel
        const caEmployesRes = await pool.query(`
            SELECT t.id_employe, SUM(lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) as ca_realise_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY t.id_employe
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);
        const mapCaEmployes = {};
        caEmployesRes.rows.forEach(r => { mapCaEmployes[r.id_employe] = parseFloat(r.ca_realise_ht) || 0; });

        // 5. REQUÊTE : Absences
        const absencesRes = await pool.query(`
            SELECT DISTINCT e.nom as nom_employe, a.type_demande, a.nature_absence, a.date_debut, a.date_fin
            FROM absences_employes a
            JOIN employes e ON a.id_employe = e.id_employe
            WHERE a.id_salon = $1 AND a.statut = 'VALIDE' AND a.date_debut <= $3 AND a.date_fin >= $2
            ORDER BY e.nom ASC, a.date_debut ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        // --- GÉNÉRATION DU PDF ---
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers); 
            // On renvoie le PDF brut en mémoire ainsi que les variables nécessaires pour la suite
            resolve({ 
                buffer: pdfData, 
                numeroArchive, 
                nomDuSalon, 
                firstDayOfMonth, 
                lastDayOfMonth, 
                salonConfig, 
                estMoisCloture 
            });
        });

        let currentY = 40;
        const MAIN_COLOR = '#111827'; const SEC_COLOR = '#4b5563'; const BORDER_COLOR = '#e5e7eb';

        // --- EN-TÊTE LÉGAL ---
        doc.font('Helvetica-Bold').fontSize(16).fillColor(MAIN_COLOR).text(`LIASSE COMPTABLE MENSUELLE`, 40, currentY);
        currentY += 20;
        
        const formeJuridique = salonConfig.forme_juridique ? ` - ${salonConfig.forme_juridique}` : '';
        const capSocialAff = salonConfig.capital_social && salonConfig.capital_social.trim() !== '' ? salonConfig.capital_social : 'Non renseigné';
        const rcsVilleAff = salonConfig.rcs_ville && salonConfig.rcs_ville.trim() !== '' ? salonConfig.rcs_ville : 'Non renseigné';

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${nomDuSalon}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${salonConfig.adresse_salon}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${salonConfig.siret} | Capital social : ${capSocialAff} | RCS : ${rcsVilleAff}`, 40, currentY);
        currentY += 12;
        doc.text(`${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 12;
        doc.text(`${titreDirigeant} : ${nomGerant}`, 40, currentY);
        currentY += 15;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(estMoisCloture ? '#16a34a' : '#ea580c').text(`ÉTAT : ${statutDocument}`, 40, currentY);
        doc.text(`Édité le : ${today.toLocaleDateString('fr-FR')} à ${today.toLocaleTimeString('fr-FR')}`, 355, currentY, { width: 200, align: 'right' });
        currentY += 15;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} au ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, currentY);
        currentY += 15;
        if (estMoisCloture) {
            // Encadré d'attestation individuelle (Conformité Loi de Finances)
            doc.rect(40, currentY - 5, 515, 78).fillAndStroke('#f0fdf4', '#16a34a');
            currentY += 4;
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#16a34a').text(`CLÔTURE MENSUELLE N° ${referenceDate.getFullYear()}${String(referenceDate.getMonth() + 1).padStart(2, '0')}`, 50, currentY);
            currentY += 15;
            doc.font('Courier').fontSize(7.5).fillColor('#111827').text(`Hash SHA-256 : ${fullHashArchive}`, 50, currentY, { width: 495 });
            currentY += 14;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text(`Réf. Archive : ${numeroArchive}`, 50, currentY);
            currentY += 13;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor('#4b5563').text(`Logiciel STACK v1.0 - Attestation individuelle de conformité (CGI, art. 286, I-3° bis)`, 50, currentY);
            currentY += 20;
        }
        currentY += 25;

        // Moteur drawRow anti-chevauchement avec calcul dynamique de hauteur et support de police par colonne
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
                    align: col.align || 'left',
                    link: col.link || null,
                    underline: !!col.link
                });
                xPos += col.w + 10;
            });

            currentY += Math.max(maxH, 10) + 4;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 5;
        };

        const drawTableTitle = (title) => {
            if (currentY > 750) { doc.addPage(); currentY = 40; }
            currentY += 10;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(title, 40, currentY);
            currentY += 16;
        };

        const fMnt = (mnt) => {
            const parts = (parseFloat(mnt) || 0).toFixed(2).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return parts.join(',') + ' €';
        };

        // --- 1. CHIFFRE D'AFFAIRES ---
        drawTableTitle("1. CHIFFRE D'AFFAIRES");
        drawRow([{text: 'Catégorie & Taux TVA', w: 180}, {text: 'Base HT', w: 100, align: 'right'}, {text: 'TVA Collectée', w: 100, align: 'right'}, {text: 'Total TTC', w: 105, align: 'right'}], true);
        let totalHT = 0, totalTVA = 0, globalTTC = 0;
        caDetailRes.rows.forEach(r => {
            const ttcCents = Math.round((parseFloat(r.total_ttc) || 0) * 100);
            const taux = franchiseTVA ? 0 : (parseFloat(r.taux_tva) || 0);
            const htCents = franchiseTVA ? ttcCents : Math.round(ttcCents / (1 + taux / 100));
            const tvaCents = ttcCents - htCents;

            const ht = htCents / 100;
            const tva = tvaCents / 100;
            const ttc = ttcCents / 100;

            const tauxTvaFormate = franchiseTVA ? '0%' : taux.toString().replace('.', ',') + '%';
            const label = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaFormate})`;
            
            totalHT = Number((totalHT + ht).toFixed(2));
            totalTVA = Number((totalTVA + tva).toFixed(2));
            globalTTC = Number((globalTTC + ttc).toFixed(2));
            drawRow([{text: label, w: 180}, {text: fMnt(ht), w: 100, align: 'right'}, {text: fMnt(tva), w: 100, align: 'right'}, {text: fMnt(ttc), w: 105, align: 'right'}]);
        });
        if (caDetailRes.rowCount === 0) drawRow([{text: 'Aucune transaction', w: 180}, {text: '-', w: 100, align: 'right'}, {text: '-', w: 100, align: 'right'}, {text: '-', w: 105, align: 'right'}]);
        drawRow([{text: 'TOTAL GÉNÉRAL', w: 180}, {text: fMnt(totalHT), w: 100, align: 'right'}, {text: fMnt(totalTVA), w: 100, align: 'right'}, {text: fMnt(globalTTC), w: 105, align: 'right'}], false, true);
        if (franchiseTVA) {
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* TVA non applicable, art. 293 B du CGI.", 40, currentY); currentY += 12;
            
            // Configuration des seuils légaux par année (Nouvelle réforme européenne applicable au 1er janvier 2025)
            const anneeEnCours = referenceDate.getFullYear();
            const seuilsFranchise = {
                2024: { presta_base: 36800, presta_majore: 39100, global_base: 91900, global_majore: 101000 },
                2025: { presta_base: 37500, presta_majore: 41250, global_base: 85000, global_majore: 93500 },
                2026: { presta_base: 37500, presta_majore: 41250, global_base: 85000, global_majore: 93500 }
            };
            // Si l'année n'est pas encore dans le tableau, on prend la dernière législation connue (2026)
            const s = seuilsFranchise[anneeEnCours] || seuilsFranchise[2026];

            // Affichage du cumul annuel pour surveillance des seuils de franchise
            let cumulServices = 0;
            let cumulTotal = 0;
            cumulAnnuelRes.rows.forEach(r => {
                const ttc = parseFloat(r.total_ttc) || 0;
                if (r.type_article === 'PRESTATION') cumulServices += ttc;
                cumulTotal += ttc;
            });

            currentY += 8;
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(`Suivi des seuils de Franchise en base (Cumul ${anneeEnCours}) :`, 40, currentY); currentY += 14;
            doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(`• Prestations de services : ${fMnt(cumulServices)} (Seuil de base : ${fMnt(s.presta_base)} / Seuil majoré : ${fMnt(s.presta_majore)})`, 40, currentY); currentY += 12;
            doc.text(`• Chiffre d'affaires global (Prestations + Ventes) : ${fMnt(cumulTotal)} (Seuil de base : ${fMnt(s.global_base)} / Seuil majoré : ${fMnt(s.global_majore)})`, 40, currentY); currentY += 14;
            
            // Note explicative sur l'impact des seuils
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le dépassement du seuil majoré rend la TVA immédiate. Celui du seuil de base ne la déclenche qu'au 1er janvier suivant.", 40, currentY); currentY += 12;
        }

        // =========================================================================
        // PRÉPARATION DES DONNÉES FACTURES (Nécessaire pour la Section 2 et 3)
        // =========================================================================
        const iaFacturesRes = await pool.query(`SELECT id_tache, donnees, date_creation FROM ia_taches_attente WHERE id_salon = $1 AND type_tache = 'FACTURE_ACHAT' AND statut = 'ATTENTE'`, [id_salon]);
        const facturesMoisEtendues = await pool.query(`SELECT nom_fournisseur, numero_facture, mode_paiement, statut_verification, justificatif_url, fichier_cle_r2, compte_comptable, COALESCE(date_facture, DATE(date_traitement)) as date_facture_brute, COALESCE(date_reglement, DATE(date_traitement)) as date_paiement_brute, montant_ht, montant_tva, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND (COALESCE(date_facture, DATE(date_traitement)) BETWEEN ($2::date - INTERVAL '6 months') AND ($3::date + INTERVAL '6 months'))`, [id_salon, dateDebutStr, dateFinStr]);

        let toutesFactures = [];
        
        // 1. Ajout des factures validées (avec régénération à la volée des URLs R2 pour éviter tout lien expiré)
        for (const f of facturesMoisEtendues.rows) {
            let freshUrl = f.justificatif_url;
            if (f.fichier_cle_r2 && process.env.R2_BUCKET_NAME) {
                try {
                    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: f.fichier_cle_r2 });
                    freshUrl = await getSignedUrl(s3Client, cmd, { expiresIn: 604800 });
                } catch (e) {}
            }
            toutesFactures.push({
                fournisseur: f.nom_fournisseur || 'Inconnu',
                numero: f.numero_facture || null,
                date_facture: new Date(f.date_facture_brute),
                date_paiement: new Date(f.date_paiement_brute),
                mode_paiement: f.mode_paiement || 'NON_SPECIFIE',
                statut: 'VALIDE',
                compte: f.compte_comptable,
                ht: parseFloat(f.montant_ht) || 0,
                tva: parseFloat(f.montant_tva) || 0,
                ttc: parseFloat(f.montant_ttc) || 0,
                url: freshUrl,
                source: (freshUrl || f.fichier_cle_r2) ? 'IA' : 'Saisie'
            });
        }

        // 2. Ajout des factures IA en attente
        iaFacturesRes.rows.forEach(t => {
            const d = t.donnees || {};
            let dateF = d.date_facture ? new Date(d.date_facture) : new Date(t.date_creation);
            toutesFactures.push({
                fournisseur: d.fournisseur || 'Inconnu',
                numero: d.numero_facture || null,
                date_facture: dateF,
                date_paiement: dateF,
                mode_paiement: d.mode_paiement || 'NON_SPECIFIE',
                statut: 'A_VALIDER',
                compte: d.compte_comptable,
                ht: parseFloat(d.montant_ht) || 0,
                tva: parseFloat(d.montant_tva) || 0,
                ttc: parseFloat(d.montant_ttc) || 0,
                url: d.pdf_url,
                source: 'IA'
            });
        });

        let facturesAffichees = [];
        let facturesHorsPeriode = [];
        let facturesAPayer = [];
        let facturesDoublons = [];
        let mapUnique = new Map();
        let nbAValider = 0;

        toutesFactures.forEach(f => {
            const numKey = f.numero ? f.numero.toString().trim().toLowerCase() : 'sans_num';
            const key = `${f.fournisseur.trim().toLowerCase()}_${numKey}`;
            
            // Dédoublonnage exact
            if (numKey !== 'sans_num' && mapUnique.has(key)) {
                facturesDoublons.push(f);
                return;
            }
            if (numKey !== 'sans_num') mapUnique.set(key, true);
            if (f.statut === 'A_VALIDER') nbAValider++;

            // Vérification si la facture appartient à ce mois
            const isFactureInMonth = !isNaN(f.date_facture) && f.date_facture >= firstDayOfMonth && f.date_facture <= lastDayOfMonth;
            const isPaiementInMonth = !isNaN(f.date_paiement) && f.date_paiement >= firstDayOfMonth && f.date_paiement <= lastDayOfMonth;
            
            if (isNaN(f.date_facture.getTime())) {
                facturesHorsPeriode.push({...f, raison: "Date invalide ou manquante"});
            } else if (isFactureInMonth || isPaiementInMonth) {
                facturesAffichees.push(f);
                if (f.mode_paiement === 'NON_SPECIFIE' || f.mode_paiement === 'N/A') facturesAPayer.push(f);
            } else {
                facturesHorsPeriode.push({...f, raison: "Hors période cible"});
            }
        });

        facturesAffichees.sort((a, b) => a.date_facture - b.date_facture);

        // --- 2. RAPPROCHEMENT BANCAIRE ---
        // Total largeur : 210 + 70 + 215 = 495 + 2*10 = 515 pt (Fusion Col 1+2 = 210 + 10 + 70 = 290 pt)
        drawTableTitle("2. RAPPROCHEMENT BANCAIRE ET CAISSE");
        drawRow([{text: 'Méthode de paiement', w: 210}, {text: 'Nb Trans.', w: 70, align: 'center'}, {text: 'Montant Encaissé TTC', w: 215, align: 'right'}], true);
        
        const methodes = ['CARTE', 'ESPECES', 'CHEQUE', 'VIREMENT', 'BONS CADEAUX'];
        let mapPaiements = {}; paiementsRes.rows.forEach(m => mapPaiements[m.methode_paiement] = m);
        let totalEncaissementsReel = 0;
        methodes.forEach(m => {
            const row = mapPaiements[m] || { nb: 0, total: 0 };
            const mntMode = Number((parseFloat(row.total) || 0).toFixed(2));
            totalEncaissementsReel = Number((totalEncaissementsReel + mntMode).toFixed(2));
            drawRow([{text: m, w: 210}, {text: row.nb, w: 70, align: 'center'}, {text: fMnt(mntMode), w: 215, align: 'right'}]);
        });
        
        const panierMoyen = statsRes.rows[0].nb_tickets > 0 ? (totalEncaissementsReel / statsRes.rows[0].nb_tickets) : 0;
        drawRow([{text: `Total Encaissements CA (${statsRes.rows[0].nb_tickets} tickets, Panier Moyen : ${fMnt(panierMoyen)})`, w: 290}, {text: fMnt(totalEncaissementsReel), w: 215, align: 'right'}], false, true);
        if (totalPourboiresMois > 0) {
            drawRow([{text: 'Pourboires encaissés pour le compte des salariés (Compte 426 - Hors TVA)', w: 290}, {text: fMnt(totalPourboiresMois), w: 215, align: 'right'}]);
            drawRow([{text: 'TOTAL TRÉSORERIE ENCAISSÉE (CA TTC + Pourboires)', w: 290}, {text: fMnt(totalEncaissementsReel + totalPourboiresMois), w: 215, align: 'right'}], false, true);
        }
        
        currentY += 10;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Ce tableau facilite le rapprochement avec votre relevé bancaire.", 40, currentY); currentY += 12;

        // Ventilation intelligente des mouvements d'espèces par catégorie comptable (PCG)
        const hasValidZ = Boolean(lastZRes.rows[0].date_max);
        const datePivotZ = hasValidZ ? new Date(lastZRes.rows[0].date_max) : null;
        if (datePivotZ) datePivotZ.setHours(23, 59, 59, 999);

        let sumRemisesBanqueZ = 0;
        let sumAchatsEspecesZ = 0;
        let sumPrelevementsGerantZ = 0;

        mouvementsRes.rows.forEach(mvt => {
            const dM = new Date(mvt.date_brute);
            const cat = deduireCategorieMouvement(mvt.type_mouvement, mvt.motif, mvt.categorie_comptable);
            const mnt = parseFloat(mvt.montant) || 0;
            if (!datePivotZ || dM <= datePivotZ) {
                if (mvt.type_mouvement === 'SORTIE') {
                    if (cat === 'REMISE_BANQUE') sumRemisesBanqueZ += mnt;
                    else if (cat === 'PRELEVEMENT_GERANT') sumPrelevementsGerantZ += mnt;
                    else sumAchatsEspecesZ += mnt;
                }
            }
        });

        const totalChequesMois = parseFloat(mapPaiements['CHEQUE']?.total || 0);
        const totalRemisesAPointer = sumRemisesBanqueZ + totalChequesMois;

        drawRow([{text: 'Remises en banque déclarées (Dépôts espèces 580 + Chèques) :', w: 290}, {text: totalRemisesAPointer > 0 ? fMnt(totalRemisesAPointer) : '0,00 €', w: 215, align: 'right'}]);
        drawRow([{text: 'Commissions bancaires (Frais CB, Stripe, etc.) :', w: 290}, {text: 'À pointer sur relevé', w: 215, align: 'right'}]);
        
        const fondDebut = parseFloat(caisseRes.rows[0].fond_debut_mois) || 0;
        const fondFin = parseFloat(caisseRes.rows[0].fond_fin_mois) || 0;
        const especesEncaisseesZ = parseFloat(controleRes.rows[0].especes_z) || 0;
        const apportsZ = parseFloat(controleRes.rows[0].entrees_z) || 0;
        const retraitsZ = parseFloat(controleRes.rows[0].sorties_z) || 0;
        const ecartsZ = parseFloat(controleRes.rows[0].ecarts_z) || 0;
        
        const caisseCalculee = fondDebut + especesEncaisseesZ + apportsZ - retraitsZ + ecartsZ;
        
        currentY += 5;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text(`CONTRÔLE DE CAISSE (Arrêté au dernier Z : ${lastZDateStr})`, 40, currentY); currentY += 14;
        
        drawRow([{text: 'Fond de caisse au 1er du mois (Ouverture)', w: 290}, {text: fMnt(fondDebut), w: 215, align: 'right'}]);
        drawRow([{text: `Espèces encaissées (Jusqu'au ${lastZDateStr}) (+)`, w: 290}, {text: fMnt(especesEncaisseesZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Apports de fonds en caisse (Compte 580/108) (+)', w: 290}, {text: fMnt(apportsZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Achats et dépenses payés en espèces (Compte 6xx/401) (-)', w: 290}, {text: fMnt(sumAchatsEspecesZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Remises d\'espèces en banque (Compte 580) (-)', w: 290}, {text: fMnt(sumRemisesBanqueZ), w: 215, align: 'right'}]);
        if (sumPrelevementsGerantZ > 0) {
            drawRow([{text: 'Prélèvements de l\'exploitant / Gérant (Compte 108) (-)', w: 290}, {text: fMnt(sumPrelevementsGerantZ), w: 215, align: 'right'}]);
        }
        drawRow([{text: 'Régularisations et Écarts constatés (Compte 658/758) (±)', w: 290}, {text: fMnt(ecartsZ), w: 215, align: 'right'}]);
        
        drawRow([{text: 'ESPÈCES THÉORIQUES (Calculées)', w: 290}, {text: fMnt(caisseCalculee), w: 215, align: 'right'}], false, true);
        
        let especesCompteesTexte = hasValidZ ? fMnt(fondFin) : 'Aucun Z clôturé';
        if (zMoisRes.rowCount > 0) {
            const dernierZMois = zMoisRes.rows[zMoisRes.rowCount - 1];
            const isAutoZ = Boolean(dernierZMois.est_cloture_automatique);
            if (isAutoZ) especesCompteesTexte = 'Non compté (Clôture Auto. à régulariser)';
        }
        
        drawRow([{text: `ESPÈCES COMPTÉES (Lors du Z du ${lastZDateStr})`, w: 290}, {text: especesCompteesTexte, w: 215, align: 'right'}], false, true);

        // --- VÉRIFICATION DE LA COHÉRENCE ESPÈCES (Factures espèces vs Sorties ACHAT_ESPECES uniquement) ---
        let totalFacturesEspecesMois = 0;
        facturesAffichees.forEach(f => {
            if (f.mode_paiement === 'ESPECES') totalFacturesEspecesMois += f.ttc;
        });

        const ecartDepensesCaisse = totalFacturesEspecesMois - sumAchatsEspecesZ;
        
        if (Math.abs(ecartDepensesCaisse) > 0.01) {
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#ea580c').text(
                `ALERTE COMPTABLE : Désynchronisation Caisse / Factures réglées en espèces.`, 40, currentY
            );
            currentY += 12;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text(
                `La section "3. Dépenses" totalise ${fMnt(totalFacturesEspecesMois)} de factures payées en espèces ce mois-ci, contre ${fMnt(sumAchatsEspecesZ)} de sorties d'achats en espèces enregistrées en caisse sur la période clôturée.`, 
                40, currentY, { width: 515, lineGap: 2 }
            );
            currentY += 20;
        }

        // Détail des mouvements de caisse (Apports/Retraits) sans bug lorsque aucun Z n'est présent
        if (mouvementsRes.rowCount > 0) {
            const mvtsAvantZ = [];
            const mvtsApresZ = [];

            mouvementsRes.rows.forEach(mvt => {
                const dM = new Date(mvt.date_brute);
                if (datePivotZ && dM <= datePivotZ) mvtsAvantZ.push(mvt);
                else mvtsApresZ.push(mvt);
            });

            const formatLabelCat = (mvt) => {
                const cat = deduireCategorieMouvement(mvt.type_mouvement, mvt.motif, mvt.categorie_comptable);
                if (mvt.type_mouvement === 'ENTREE') return 'Apport (580)';
                if (cat === 'REMISE_BANQUE') return 'Dépôt Banque (580)';
                if (cat === 'PRELEVEMENT_GERANT') return 'Prélèv. (108)';
                return 'Achat Esp. (6xx)';
            };

            if (mvtsAvantZ.length > 0) {
                currentY += 5;
                doc.font('Helvetica-Bold').fontSize(9).fillColor(SEC_COLOR).text(`Détail des Mouvements d'espèces (Inclus jusqu'au Z du ${lastZDateStr}) :`, 40, currentY); currentY += 14;
                mvtsAvantZ.forEach(mvt => {
                    drawRow([
                        {text: mvt.date_mvt, w: 65, align: 'center'}, 
                        {text: formatLabelCat(mvt), w: 90}, 
                        {text: mvt.motif || 'Non renseigné', w: 215}, 
                        {text: fMnt(mvt.montant), w: 115, align: 'right'}
                    ]);
                });
            }

            if (mvtsApresZ.length > 0) {
                currentY += 5;
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(`Mouvements en attente de clôture Z (Non inclus dans l'arrêté Z ci-dessus) :`, 40, currentY); currentY += 14;
                mvtsApresZ.forEach(mvt => {
                    drawRow([
                        {text: mvt.date_mvt, w: 65, align: 'center'}, 
                        {text: formatLabelCat(mvt), w: 90}, 
                        {text: mvt.motif || 'Non renseigné', w: 215}, 
                        {text: fMnt(mvt.montant), w: 115, align: 'right'}
                    ]);
                });
            }
        }

       // --- 3. DÉPENSES ---
        drawTableTitle("3. DÉPENSES ET ACHATS");

        doc.font('Helvetica-Oblique').fontSize(9).fillColor(SEC_COLOR)
           .text(`Factures dans l'app : ${toutesFactures.length} · Affichées : ${facturesAffichees.length} · Hors période ou sans date : ${facturesHorsPeriode.length} · Doublons : ${facturesDoublons.length}`, 40, currentY);
        currentY += 15;
        
        if (nbAValider > 0) {
            doc.font('Helvetica-Bold').fillColor('#ea580c').text(`BLOCAGE : ${nbAValider} dépense(s) "À valider". La version définitive nécessite leur traitement.`, 40, currentY);
            currentY += 15;
        }

        if (currentY > 680) { doc.addPage(); currentY = 40; }

        // Largeurs calibrées (10 colonnes) : 62 + 43 + 32 + 40 + 38 + 38 + 24 + 48 + 45 + 55 = 425 + 9*10 = 515 pt
        // Fusion Col 1+2 = 62 + 10 + 43 = 115 pt
        // Fusion Col 1..7 = 277 + 6*10 = 337 pt | Fusion Col 1..9 = 337 + 10 + 48 + 10 + 45 = 450 pt
        const drawHeaderDepenses = () => {
            drawRow([
                {text: 'Fournisseur', w: 62},
                {text: 'N° Fact.', w: 43},
                {text: 'Source', w: 32, align: 'center'},
                {text: 'Date F.', w: 40, align: 'center'},
                {text: 'Paiem.', w: 38, align: 'center'},
                {text: 'Statut', w: 38, align: 'center'},
                {text: 'Cpte', w: 24, align: 'center'},
                {text: 'HT', w: 48, align: 'right'},
                {text: 'TVA', w: 45, align: 'right'},
                {text: 'TTC', w: 55, align: 'right'}
            ], true);
        };
        
        drawHeaderDepenses();
        
        let sumDepensesBanque = 0, sumDepensesEspeces = 0, sumDepensesInconnu = 0;
        let totalDepensesHT = 0, totalDepensesTVA = 0, totalDepensesTTC = 0;
        const ventilationPCG = {};

        const libellesComptesPCG = {
            '6022': '6022 - Achats de fournitures et produits consommables (Bac / Technique)',
            '6028': '6028 - Achats d\'autres approvisionnements et consommables',
            '604': '6040 - Achats d\'études et prestations de services',
            '6061': '6061 - Fournitures non stockables (Eau, Énergie, Électricité)',
            '6063': '6063 - Fournitures d\'entretien et de petit équipement',
            '6064': '6064 - Fournitures administratives',
            '607': '6070 - Achats de marchandises (Produits destinés à la revente)',
            '613': '6130 - Locations immobilières et mobilières (Loyers)',
            '615': '6150 - Entretien et réparations',
            '616': '6160 - Primes d\'assurances',
            '6226': '6226 - Honoraires (Expert-comptable, Juridique)',
            '623': '6230 - Publicité, publications, relations publiques',
            '626': '6260 - Frais postaux et de télécommunications',
            '627': '6270 - Services bancaires et assimilés'
        };
        
        if (facturesAffichees.length === 0) {
            drawRow([{text: 'Aucune facture datée de cette période.', w: 515}]);
        } else {
            facturesAffichees.forEach(f => {
                const fTtcCents = Math.round((parseFloat(f.ttc) || 0) * 100);
                const fTvaCents = franchiseTVA ? 0 : Math.round((parseFloat(f.tva) || 0) * 100);
                let fHtCents = franchiseTVA ? fTtcCents : Math.round((parseFloat(f.ht) || 0) * 100);
                if (fHtCents + fTvaCents !== fTtcCents) fHtCents = fTtcCents - fTvaCents;

                const htPropre = fHtCents / 100;
                const tvaPropre = fTvaCents / 100;
                const ttcPropre = fTtcCents / 100;

                totalDepensesHT = Number((totalDepensesHT + htPropre).toFixed(2));
                totalDepensesTVA = Number((totalDepensesTVA + tvaPropre).toFixed(2));
                totalDepensesTTC = Number((totalDepensesTTC + ttcPropre).toFixed(2));
                
                if (f.mode_paiement === 'ESPECES') sumDepensesEspeces = Number((sumDepensesEspeces + ttcPropre).toFixed(2));
                else if (!f.mode_paiement || f.mode_paiement === 'NON_SPECIFIE' || f.mode_paiement === 'N/A') sumDepensesInconnu = Number((sumDepensesInconnu + ttcPropre).toFixed(2));
                else sumDepensesBanque = Number((sumDepensesBanque + ttcPropre).toFixed(2));
                
                let compte = f.compte ? String(f.compte).trim() : '';
                if (!compte) {
                    const nomLower = f.fournisseur.toLowerCase();
                    if (nomLower.includes('l\'oréal') || nomLower.includes('wella') || nomLower.includes('schwarzkopf') || nomLower.includes('revente') || nomLower.includes('produit') || nomLower.includes('grossiste')) compte = '607';
                    else if (nomLower.includes('edf') || nomLower.includes('engie') || nomLower.includes('eau')) compte = '6061';
                    else if (nomLower.includes('loyer') || nomLower.includes('sci') || nomLower.includes('immo')) compte = '613';
                    else if (nomLower.includes('assurance') || nomLower.includes('axa') || nomLower.includes('allianz')) compte = '616';
                    else compte = '604';
                }

                if (!ventilationPCG[compte]) ventilationPCG[compte] = { nb: 0, ht: 0, tva: 0, ttc: 0 };
                ventilationPCG[compte].nb++;
                ventilationPCG[compte].ht = Number((ventilationPCG[compte].ht + htPropre).toFixed(2));
                ventilationPCG[compte].tva = Number((ventilationPCG[compte].tva + tvaPropre).toFixed(2));
                ventilationPCG[compte].ttc = Number((ventilationPCG[compte].ttc + ttcPropre).toFixed(2));

                const statutColor = f.statut === 'VALIDE' ? '#16a34a' : '#ea580c';
                const statutText = f.statut === 'VALIDE' ? 'Validé' : 'À valider';

                let refFacture = f.numero ? String(f.numero) : 'n° inconnu';
                let sourceDoc = f.url ? { text: 'Doc IA', link: f.url, color: '#0ea5e9' } : { text: 'Saisie' };
                const modePaiementCourt = f.mode_paiement === 'NON_SPECIFIE' ? 'N/A' : f.mode_paiement;
                
                const dateFAff = !isNaN(f.date_facture) ? f.date_facture.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'2-digit'}) : 'N/A';

                if (currentY > 730) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }

                drawRow([
                    {text: f.fournisseur, w: 62, size: 7.5}, 
                    {text: refFacture, w: 43, size: 7.5}, 
                    {text: sourceDoc.text, link: sourceDoc.link, color: sourceDoc.color, w: 32, align: 'center', size: 8},
                    {text: dateFAff, w: 40, align: 'center', size: 8},
                    {text: modePaiementCourt, w: 38, align: 'center', size: 7.5}, 
                    {text: statutText, w: 38, align: 'center', color: statutColor, size: 8},
                    {text: compte, w: 24, align: 'center', size: 8}, 
                    {text: fMnt(htPropre), w: 48, align: 'right', size: 8},
                    {text: fMnt(tvaPropre), w: 45, align: 'right', size: 8}, 
                    {text: fMnt(ttcPropre), w: 55, align: 'right', size: 8}
                ]);
            });
        }
        
        if (currentY > 710) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }
        
        let hasChargesFixes = facturesAffichees.some(f => {
            const cpte = f.compte || '';
            const nomL = (f.fournisseur || '').toLowerCase();
            return cpte.startsWith('61') || cpte.startsWith('62') || cpte.startsWith('63') || cpte.startsWith('64') || nomL.includes('edf') || nomL.includes('urssaf') || nomL.includes('loyer') || nomL.includes('assurance');
        });

        // Fusion Col 1 + Col 2 = 62 + 10 + 43 = 115 pt pour alignement strict avec les colonnes 3 à 10
        if (!hasChargesFixes) {
            drawRow([
                {text: 'Aucune charge fixe saisie (Loyer, URSSAF...)', w: 115},
                {text: 'N/A', w: 32, align: 'center'},
                {text: '-', w: 40, align: 'center'},
                {text: '-', w: 38, align: 'center'},
                {text: '-', w: 38, align: 'center'},
                {text: '-', w: 24, align: 'center'},
                {text: '-', w: 48, align: 'right'},
                {text: '-', w: 45, align: 'right'},
                {text: '0,00 €', w: 55, align: 'right'}
            ]);
        }
        
        drawRow([
            {text: 'Variation de stock (Produits)', w: 115},
            {text: 'N/A', w: 32, align: 'center'},
            {text: '-', w: 40, align: 'center'},
            {text: '-', w: 38, align: 'center'},
            {text: 'Invent.', w: 38, align: 'center'},
            {text: '6037', w: 24, align: 'center'},
            {text: '-', w: 48, align: 'right'},
            {text: '-', w: 45, align: 'right'},
            {text: 'N/R', w: 55, align: 'right'}
        ]);
        
        if (currentY > 670) { doc.addPage(); currentY = 40; }
        
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES PAR BANQUE (CB, Prélèvement, Virement)', w: 450}, {text: fMnt(sumDepensesBanque), w: 55, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES EN ESPÈCES (Déduites de la caisse)', w: 450}, {text: fMnt(sumDepensesEspeces), w: 55, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES NON RÉGLÉES OU MODE INCONNU (Compte 401)', w: 450}, {text: fMnt(sumDepensesInconnu), w: 55, align: 'right'}], false, true);
        drawRow([
            {text: 'TOTAL GÉNÉRAL DES DÉPENSES', w: 337},
            {text: fMnt(totalDepensesHT), w: 48, align: 'right'},
            {text: fMnt(totalDepensesTVA), w: 45, align: 'right'},
            {text: fMnt(totalDepensesTTC), w: 55, align: 'right'}
        ], false, true);

        if (franchiseTVA) {
            currentY += 4;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* En franchise en base de TVA, la TVA sur achats n'est pas récupérable. La charge réelle retenue en comptabilité est le montant TTC.", 40, currentY); 
            currentY += 12;
        }

        // --- 3 BIS. VENTILATION DES ACHATS PAR COMPTE COMPTABLE (PCG CLASSE 6) ---
        const comptesTries = Object.keys(ventilationPCG).sort();
        if (comptesTries.length > 0) {
            if (currentY > 650) { doc.addPage(); currentY = 40; }
            drawTableTitle("3 BIS. VENTILATION COMPTABLE DES CHARGES PAR COMPTE (PCG)");
            // Largeurs : 240 + 45 + 60 + 60 + 70 = 475 + 4*10 = 515 pt
            drawRow([
                {text: 'Compte PCG & Intitulé', w: 240},
                {text: 'Pièces', w: 45, align: 'center'},
                {text: 'Base HT', w: 60, align: 'right'},
                {text: 'TVA (44566)', w: 60, align: 'right'},
                {text: 'Total TTC', w: 70, align: 'right'}
            ], true);

            comptesTries.forEach(cpte => {
                const v = ventilationPCG[cpte];
                const intitule = libellesComptesPCG[cpte] || `${cpte} - Autres achats et charges externes`;
                drawRow([
                    {text: intitule, w: 240},
                    {text: String(v.nb), w: 45, align: 'center'},
                    {text: fMnt(v.ht), w: 60, align: 'right'},
                    {text: fMnt(v.tva), w: 60, align: 'right'},
                    {text: fMnt(v.ttc), w: 70, align: 'right'}
                ]);
            });
            drawRow([
                {text: 'TOTAL VENTILATION CLASSE 6', w: 295},
                {text: fMnt(totalDepensesHT), w: 60, align: 'right'},
                {text: fMnt(totalDepensesTVA), w: 60, align: 'right'},
                {text: fMnt(totalDepensesTTC), w: 70, align: 'right'}
            ], false, true);
        }

        // --- 3 TER. SYNTHÈSE DE TVA (PRÉPARATION DÉCLARATION CA3 / CA12) ---
        if (!franchiseTVA) {
            if (currentY > 630) { doc.addPage(); currentY = 40; }
            drawTableTitle("3 TER. SYNTHÈSE DE TVA DU MOIS (Aide à la déclaration CA3)");
            // Largeurs : 265 + 115 + 115 = 495 + 2*10 = 515 pt
            drawRow([
                {text: 'Poste de TVA & Compte PCG', w: 265},
                {text: 'Base HT', w: 115, align: 'right'},
                {text: 'Montant TVA', w: 115, align: 'right'}
            ], true);

            drawRow([
                {text: 'TVA Collectée sur Chiffre d\'Affaires (Compte 44571x) (+)', w: 265},
                {text: fMnt(totalHT), w: 115, align: 'right'},
                {text: fMnt(totalTVA), w: 115, align: 'right'}
            ]);
            drawRow([
                {text: 'TVA Déductible sur Achats de biens et services (Compte 445660) (-)', w: 265},
                {text: fMnt(totalDepensesHT), w: 115, align: 'right'},
                {text: fMnt(totalDepensesTVA), w: 115, align: 'right'}
            ]);

            const tvaNette = Number((totalTVA - totalDepensesTVA).toFixed(2));
            const libelleTvaNette = tvaNette >= 0
                ? 'TVA NETTE À DÉCAISSER AU TRÉSOR PUBLIC (Compte 445510) (=)'
                : 'CRÉDIT DE TVA REPORTABLE SUR LE MOIS SUIVANT (Compte 445670) (=)';
            const couleurTvaNette = tvaNette >= 0 ? MAIN_COLOR : '#16a34a';

            drawRow([
                {text: libelleTvaNette, w: 390, color: couleurTvaNette},
                {text: fMnt(Math.abs(tvaNette)), w: 115, align: 'right', color: couleurTvaNette}
            ], false, true);
        }

        // --- ANNEXES : HORS PÉRIODE, DOUBLONS ET À PAYER ---
        if (facturesHorsPeriode.length > 0 || facturesDoublons.length > 0 || facturesAPayer.length > 0) {
            if (currentY > 650) { doc.addPage(); currentY = 40; } else { currentY += 15; }
            
            if (facturesHorsPeriode.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("Annexe : Factures hors période ou sans date (Exclues du total)", 40, currentY); currentY += 15;
                
                let sansDate = [];
                let parMois = {};
                facturesHorsPeriode.forEach(f => {
                    if (isNaN(f.date_facture.getTime())) {
                        sansDate.push(f);
                    } else {
                        const m = f.date_facture.toLocaleDateString('fr-FR', {month: 'long', year: 'numeric'});
                        if (!parMois[m]) parMois[m] = { count: 0, total: 0 };
                        parMois[m].count++;
                        parMois[m].total += f.ttc;
                    }
                });
                
                Object.keys(parMois).forEach(mois => {
                    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MAIN_COLOR).text(`• Synthèse : ${parMois[mois].count} facture(s) datée(s) de ${mois}, total ${fMnt(parMois[mois].total)}`, 50, currentY);
                    currentY += 12;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                
                sansDate.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - N° ${f.numero || 'Inconnu'} - Sans date - ${fMnt(f.ttc)} -> Exclue : Date invalide ou manquante`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                currentY += 10;
            }

            if (facturesDoublons.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#ea580c').text("Annexe : Doublons détectés et bloqués (Exclus du total)", 40, currentY); currentY += 15;
                facturesDoublons.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - ${fMnt(f.ttc)} -> doublon de la facture n° ${f.numero}`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                currentY += 10;
            }

            if (facturesAPayer.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("Factures à payer à fin de mois (Non réglées / Mode inconnu)", 40, currentY); currentY += 15;
                facturesAPayer.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - N° ${f.numero || 'Inconnu'} - Reste à régler : ${fMnt(f.ttc)}`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
            }
        }

        // On démarre systématiquement la section 4 (Variables de paie) sur une nouvelle page
        doc.addPage();
        currentY = 40;

        // 4. VARIABLES DE PAIE (Calcul fiable et exact Heures & H.S.)
        drawTableTitle("4. VARIABLES DE PAIE (À transmettre au comptable)");
        
        drawRow([
            {text: 'Employé(e)', w: 52}, 
            {text: 'Statut', w: 38, align: 'center'},
            {text: 'Heures', w: 30, align: 'center'},
            {text: 'HS/HC', w: 30, align: 'center'},
            {text: 'Pourb.', w: 38, align: 'right'},
            {text: 'CA HT', w: 56, align: 'right'}, 
            {text: 'Base HT (Prs/Prd)', w: 86, align: 'right'}, 
            {text: 'Taux (P/P)', w: 47, align: 'center'}, 
            {text: 'Prime Brute', w: 58, align: 'right'}
        ], true);

        let globalPrimes = 0;
        let totalCAEmployes = 0;
        rhRes.rows.forEach(e => {
            const nomComplet = e.nom || 'Inconnu';
            const caRealiseBaseHT = mapCaEmployes[e.id_employe] || 0;
            totalCAEmployes += caRealiseBaseHT;
            
            const basePrestaHT = parseFloat(e.base_presta_ht || 0);
            const baseProduitHT = parseFloat(e.base_produit_ht || 0);
            
            let heuresAffichees = '-';
            let hsAffichees = '-';
            let pourboireAffiche = parseFloat(e.total_pourboire) > 0 ? fMnt(e.total_pourboire) : '0,00 €';

            if (e.est_gerant) {
                heuresAffichees = 'N/A';
                hsAffichees = 'N/A';
                pourboireAffiche = 'N/A';
            } else {
                const baseContrat = parseFloat(e.heures_mensuelles_base || 151.67);
                const heuresPointeesCalc = mapHeuresPointees[e.id_employe] || 0;
                const heuresAjustManuel = mapAjustements[e.id_employe] || 0;
                
                // Si la pointeuse a été utilisée ce mois-ci, on prend le pointage réel, sinon on se base sur le contrat de base
                const totalHeuresTravaillees = heuresPointeesCalc > 0 ? heuresPointeesCalc : baseContrat;
                const totalAvecAjust = Number((totalHeuresTravaillees + heuresAjustManuel).toFixed(2));
                
                heuresAffichees = `${totalAvecAjust.toFixed(1)}h`;
                const diffHsHc = Number((totalAvecAjust - baseContrat).toFixed(1));
                hsAffichees = diffHsHc > 0 ? `+${diffHsHc}h` : (diffHsHc < 0 ? `${diffHsHc}h` : '0h');
            }

            if (e.est_gerant) {
                drawRow([
                    {text: nomComplet, w: 52, size: 8}, 
                    {text: 'Gérant', w: 38, align: 'center', size: 8},
                    {text: heuresAffichees, w: 30, align: 'center', size: 8},
                    {text: hsAffichees, w: 30, align: 'center', size: 8},
                    {text: pourboireAffiche, w: 38, align: 'right', size: 8},
                    {text: fMnt(caRealiseBaseHT), w: 56, align: 'right', size: 8}, 
                    {text: '-', w: 86, align: 'right', size: 8}, 
                    {text: '-', w: 47, align: 'center', size: 8}, 
                    {text: '-', w: 58, align: 'right', size: 8}
                ]);
            } else {
                globalPrimes = Number((globalPrimes + (parseFloat(e.total_prime) || 0)).toFixed(2));
                const fmtBase = (n) => {
                    const parts = (parseFloat(n) || 0).toFixed(2).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                    return parts.join(',');
                };
                const tauxPresta = parseFloat(e.taux_presta || 0);
                const tauxProduit = parseFloat(e.taux_produit || 0);
                const regleTaux = `${tauxPresta}% / ${tauxProduit}%`;
                const basesConcat = `${fmtBase(basePrestaHT)} / ${fmtBase(baseProduitHT)}`;
                
                drawRow([
                    {text: nomComplet, w: 52, size: 8}, 
                    {text: 'Salarié', w: 38, align: 'center', size: 8},
                    {text: heuresAffichees, w: 30, align: 'center', size: 8},
                    {text: hsAffichees, w: 30, align: 'center', size: 8},
                    {text: pourboireAffiche, w: 38, align: 'right', size: 8},
                    {text: fMnt(caRealiseBaseHT), w: 56, align: 'right', size: 8}, 
                    {text: basesConcat, w: 86, align: 'right', size: 8}, 
                    {text: regleTaux, w: 47, align: 'center', size: 8}, 
                    {text: fMnt(e.total_prime), w: 58, align: 'right', size: 8}
                ]);
            }
        });
        
        // Calcul et affichage du CA non attribué (Tickets sans employé ou employé supprimé)
        const caNonAttribue = totalHT - totalCAEmployes;
        if (Math.abs(caNonAttribue) > 0.01) {
            drawRow([
                {text: 'CA orphelin', w: 52}, 
                {text: 'N/A', w: 38, align: 'center'},
                {text: '-', w: 30, align: 'center'},
                {text: '-', w: 30, align: 'center'},
                {text: '-', w: 38, align: 'right'},
                {text: fMnt(caNonAttribue), w: 56, align: 'right'}, 
                {text: '-', w: 86, align: 'right'}, 
                {text: '-', w: 47, align: 'center'}, 
                {text: '-', w: 58, align: 'right'}
            ]);
        }

        if (rhRes.rowCount === 0) drawRow([{text: 'Aucune donnée.', w: 515}]);
        
        currentY += 4;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le CA HT inclut toutes les ventes attribuées. La Base HT exclut les articles non-commissionnés. HC = Heures Compl., HS = Heures Supp.", 40, currentY); currentY += 12;
        
        // Fusion Col 1..8 = 377pt + 7*10pt = 447pt (+ 10pt gap + 58pt = 515pt exacts)
        drawRow([
            {text: 'TOTAL PRIMES ÉQUIPE SALARIÉE', w: 447}, 
            {text: fMnt(globalPrimes), w: 58, align: 'right'}
        ], false, true);
        
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(20).fillColor(MAIN_COLOR).text('Variables de Paie & Absences (Suite)', 40, 40);
        doc.font('Helvetica').fontSize(10).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} - ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, 70);
        currentY = 100;

        // --- 5. ABSENCES ---
        // Largeurs calibrées : 95 + 130 + 135 + 40 + 75 = 475pt + (4 * 10pt) = 515pt exacts
        drawTableTitle("5. REGISTRE DES ABSENCES ET CONGÉS");
        drawRow([{text: 'Employé', w: 95}, {text: 'Motif (Masquage RGPD)', w: 130}, {text: 'Période', w: 135}, {text: 'Jours', w: 40, align: 'center'}, {text: 'Infos Compl.', w: 75}], true);
        if (absencesRes.rowCount === 0) {
            drawRow([{text: 'Aucune absence sur la période.', w: 95}, {text: '-', w: 130}, {text: '-', w: 135}, {text: '-', w: 40, align: 'center'}, {text: '-', w: 75}]);
        } else {
            absencesRes.rows.forEach(a => {
                const estMaladie = a.type_demande === 'ARRET_MALADIE' || ['MALADIE_ORDINAIRE', 'ACCIDENT_TRAVAIL'].includes(a.nature_absence);
                const motifAffiche = estMaladie ? 'Arrêt de travail (Maladie/AT)' : (a.type_demande === 'CONGES' ? `Congé payé (${a.nature_absence})` : a.type_demande);
                const dDeb = new Date(a.date_debut); const dFin = new Date(a.date_fin);
                
                let joursOuvres = 0;
                for (let d = new Date(dDeb); d <= dFin; d.setDate(d.getDate() + 1)) { if (d.getDay() !== 0) joursOuvres++; }
                
                drawRow([
                    {text: a.nom_employe, w: 95}, 
                    {text: motifAffiche, w: 130}, 
                    {text: `Du ${dDeb.toLocaleDateString('fr-FR')} au ${dFin.toLocaleDateString('fr-FR')}`, w: 135}, 
                    {text: `${joursOuvres} j.`, w: 40, align: 'center'},
                    {text: estMaladie ? 'Attente CPAM' : 'Solde CP: -', w: 75}
                ]);
            });
        }

        // --- 5 BIS. ARCHIVE DES CLÔTURES (Z) ---
        // Largeurs calibrées : 28 + 48 + 62 + 22 + 48 + 55 + 52 + 130 = 445pt + (7 * 10pt) = 515pt exacts
        drawTableTitle("5 BIS. HISTORIQUE DES CLÔTURES DE CAISSE (Z)");
        drawRow([
            {text: 'N° Z', w: 28}, 
            {text: 'Date', w: 48, align: 'center'}, 
            {text: 'Opérateur', w: 62}, 
            {text: 'Tkts', w: 22, align: 'center'},
            {text: 'CA TTC', w: 48, align: 'right'},
            {text: 'Cumul P.', w: 55, align: 'right'},
            {text: 'Espèces', w: 52, align: 'right'}, 
            {text: 'Hash NF525 (SHA-256)', w: 130, align: 'right'}
        ], true);
        
        if (zMoisRes.rowCount === 0) {
            drawRow([{text: 'Aucune clôture enregistrée ce mois-ci.', w: 515}]);
        } else {
            let sumCaZ = 0;
            let expectedId = null;

            zMoisRes.rows.forEach(z => {
                const currentId = parseInt(z.num_z_final);
                
                // Détection de rupture de séquence des Z (Exigence NF525)
                if (expectedId !== null && currentId > expectedId) {
                    for (let i = expectedId; i < currentId; i++) {
                        drawRow([
                            {text: `Z-${i}`, w: 28, color: '#dc2626'}, 
                            {text: 'ANOMALIE', w: 48, align: 'center', color: '#dc2626'}, 
                            {text: 'Saut de N°', w: 62, color: '#dc2626'}, 
                            {text: '-', w: 22, align: 'center'},
                            {text: '-', w: 48, align: 'right'},
                            {text: '-', w: 55, align: 'right'},
                            {text: '-', w: 52, align: 'right'}, 
                            {text: 'Clôture manquante ou altérée', w: 130, align: 'right', color: '#dc2626'}
                        ]);
                    }
                }
                expectedId = currentId + 1;

                sumCaZ += parseFloat(z.ca_ttc) || 0;
                let cumulActuel = parseFloat(z.cumul_perpetuel_ttc) || 0;
                
                let operator = z.ferme_par || 'Non spécifié';
                let isAuto = Boolean(z.est_cloture_automatique);
                operator = isAuto ? 'Clôture Auto.' : operator;
                let especesReel = isAuto ? 'À régul.' : fMnt(z.total_especes_reel);
                
                // Césure stricte sur 2 lignes de 32 caractères avec '\n' pour éviter tout chevauchement
                let hashAffiche = 'NON-SIGNE';
                if (z.signature_hash && z.signature_hash.length === 64) {
                    hashAffiche = z.signature_hash.substring(0, 32) + '\n' + z.signature_hash.substring(32, 64);
                } else if (z.signature_hash) {
                    hashAffiche = z.signature_hash;
                }
                
                drawRow([
                    {text: `Z-${currentId}`, w: 28},
                    {text: z.date_z, w: 48, align: 'center'},
                    {text: operator, w: 62},
                    {text: String(z.nb_tickets), w: 22, align: 'center'},
                    {text: fMnt(z.ca_ttc), w: 48, align: 'right'},
                    {text: fMnt(cumulActuel), w: 55, align: 'right'},
                    {text: especesReel, w: 52, align: 'right'},
                    // On passe la taille à 7.5 et on ajoute un interligne naturel
                    {text: hashAffiche, w: 130, align: 'right', font: 'Courier', size: 7.5, color: SEC_COLOR}
                ]);
            });
            
            // Calcul du CA orphelin basé sur totalEncaissementsReel (inclut les remises fidélité éventuelles)
            const caNonCloture = totalEncaissementsReel - sumCaZ;
            if (Math.abs(caNonCloture) > 0.01) {
                currentY += 4;
                drawRow([
                    {text: 'CA hors clôture (En attente de Z)', w: 190}, 
                    {text: fMnt(caNonCloture), w: 48, align: 'right'}, 
                    {text: 'Non clôturé sur la période', w: 257, align: 'right', color: '#ea580c'}
                ], false, true);
            }
        }

        // --- 6. MENTIONS LÉGALES & VALIDATION (AVEC ANTI-CHEVAUCHEMENT DE BAS DE PAGE) ---
        currentY += 18;
        if (currentY > 545) { doc.addPage(); currentY = 40; }
        
        doc.roundedRect(40, currentY, 515, 78, 5).fillAndStroke('#f9fafb', BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(
            'MENTIONS LÉGALES ET CONFORMITÉ (Loi de Finances - Norme NF525)',
            50, currentY + 8, { width: 495, lineBreak: false }
        );
        doc.font('Helvetica').fontSize(7.8).fillColor(SEC_COLOR).text(
            "• L'éditeur du logiciel STACK v1.0 atteste que ce système satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données en vue du contrôle de l'administration fiscale, prévues au 3° bis du I de l'article 286 du CGI.\n" +
            "• Conservation : Les pièces fiscales doivent être conservées 6 ans, et les documents comptables 10 ans.\n" +
            "• RGPD : Les motifs médicaux exacts des arrêts de travail ont été masqués sur ce document de transmission comptable.\n" +
            "• Dépenses : Je confirme l'exactitude des frais déclarés et m'engage à fournir les justificatifs non-scannés à mon comptable.",
            50, currentY + 21, { width: 495, lineGap: 1.5 }
        );

        currentY += 90;
        if (currentY + 130 > 790) { doc.addPage(); currentY = 40; }

        // --- BLOC "BON POUR TRANSMISSION COMPTABLE & SIGNATURE SCELLÉE NF525" ---
        if (estMoisCloture) {
            const dateValidationScellee = validationRes.rows[0].date_validation ? new Date(validationRes.rows[0].date_validation) : today;
            const signataireScelle = validationRes.rows[0].valide_par || nomGerant;
            const sigBase64 = validationRes.rows[0].signature_base64 || null;
            const hashL1 = (fullHashArchive || '').substring(0, 32);
            const hashL2 = (fullHashArchive || '').substring(32, 64);

            // Cadre principal vert certifié (515 x 122 pt)
            doc.roundedRect(40, currentY, 515, 122, 6).fillAndStroke('#f0fdf4', '#16a34a');

            // Bandeau de titre pleine largeur en haut du cadre (évite toute collision avec la boîte de droite)
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#166534').text(
                "BON POUR TRANSMISSION COMPTABLE — LIASSE CERTIFIÉE & SIGNÉE NF525",
                52, currentY + 9, { width: 490, lineBreak: false }
            );
            doc.moveTo(52, currentY + 24).lineTo(543, currentY + 24).lineWidth(0.6).strokeColor('#bbf7d0').stroke();

            // Colonne Gauche (x = 52, largeur stricte = 270 pt)
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(
                `Signataire (${titreDirigeant}) : ${signataireScelle}`,
                52, currentY + 32, { width: 270, lineBreak: false }
            );
            doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
                `Certifié le : ${dateValidationScellee.toLocaleDateString('fr-FR')} à ${dateValidationScellee.toLocaleTimeString('fr-FR')} (PIN vérifié)`,
                52, currentY + 45, { width: 270, lineBreak: false }
            );
            doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MAIN_COLOR).text(
                "« Bon pour accord — Certifié sincère et véritable »",
                52, currentY + 58, { width: 270, lineBreak: false }
            );
            doc.font('Helvetica-Bold').fontSize(7).fillColor('#166534').text(
                "SCEAU D'INTÉGRITÉ SHA-256 (NF525) :",
                52, currentY + 72, { width: 270, lineBreak: false }
            );
            doc.font('Courier-Bold').fontSize(7).fillColor(MAIN_COLOR).text(
                `${hashL1}\n${hashL2}`,
                52, currentY + 82, { width: 270, lineGap: 1 }
            );
            doc.font('Helvetica-Bold').fontSize(7.2).fillColor(SEC_COLOR).text(
                `Réf. Archive : ${numeroArchive}`,
                52, currentY + 105, { width: 270, lineBreak: false }
            );

            // Colonne Droite : Encadré blanc dédié à la signature manuscrite (x = 335, y = currentY + 30, w = 208, h = 84)
            doc.roundedRect(335, currentY + 30, 208, 84, 5).fillAndStroke('#ffffff', '#86efac');
            doc.font('Helvetica-Bold').fontSize(7).fillColor('#166534').text(
                "SIGNATURE MANUSCRITE DU DIRIGEANT",
                335, currentY + 35, { width: 208, align: 'center', lineBreak: false }
            );

            const sigBuffer = sigBase64 ? await recupererBufferDepuisR2OuBase64(sigBase64) : null;
            if (sigBuffer) {
                try {
                    doc.image(sigBuffer, 345, currentY + 45, {
                        fit: [188, 52],
                        align: 'center',
                        valign: 'center'
                    });
                } catch (errImg) {
                    doc.font('Helvetica-BoldOblique').fontSize(10.5).fillColor(MAIN_COLOR).text(
                        signataireScelle,
                        335, currentY + 64, { width: 208, align: 'center', lineBreak: false }
                    );
                }
            } else {
                doc.font('Helvetica-BoldOblique').fontSize(10.5).fillColor(MAIN_COLOR).text(
                    signataireScelle,
                    335, currentY + 64, { width: 208, align: 'center', lineBreak: false }
                );
            }

            doc.font('Helvetica-Oblique').fontSize(6.5).fillColor(SEC_COLOR).text(
                "Scellée électroniquement (Art. 1367 C. civ. & NF525)",
                335, currentY + 102, { width: 208, align: 'center', lineBreak: false }
            );
            currentY += 128;
        } else {
            doc.roundedRect(40, currentY, 515, 86, 6).fillAndStroke('#fff7ed', '#ea580c');
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor(MAIN_COLOR).text(
                "BON POUR TRANSMISSION COMPTABLE",
                52, currentY + 12, { width: 490, lineBreak: false }
            );
            doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#ea580c').text(
                "DOCUMENT PROVISOIRE (BROUILLON) — NON SIGNÉ",
                52, currentY + 36, { width: 490, align: 'center', lineBreak: false }
            );
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text(
                "Ce document doit être validé et signé par le gérant dans l'onglet Comptabilité pour acquérir sa valeur définitive NF525.",
                52, currentY + 58, { width: 490, align: 'center', lineBreak: false }
            );
            currentY += 94;
        }

        // --- PAGINATION DYNAMIQUE (Correction : ancrage absolu sans saut de page) ---
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
            doc.switchToPage(i);
            
            // On désactive temporairement la marge du bas pour forcer l'écriture sans créer de nouvelle page
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            
            doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(
                `Page ${page} / ${range.count}`, 
                0, 815, 
                { align: 'center', width: 595 }
            );
            
            // On restaure la marge
            doc.page.margins.bottom = originalBottomMargin;
        }

        doc.end();
    } catch (erreur) { 
        console.error("Erreur génération buffer PDF :", erreur);
        reject(erreur);
    }
    }); // Fin de la Promise;
}

module.exports = {
    genererBufferLiassePdf,
    recupererBufferDepuisR2OuBase64,
    deduireCategorieMouvement
};
