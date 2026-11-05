// services/caisse/dossierNf525Pdf.service.js
// Génération de l'attestation individuelle de conformité et du dossier technique NF525
// Conforme à l'Article 286, I-3° bis du Code Général des Impôts (BOI-TVA-DECLA-30-10-30 / BOI-LETTRE-000242)

/**
 * Génère le dossier technique descriptif et l'attestation officielle individuelle NF525
 * @param {Object} deps - { pool, PDFDocument, enregistrerJET }
 * @param {Object} params - { id_salon, role, res }
 */
async function genererDossierTechniqueNF525PDF({ pool, PDFDocument, enregistrerJET }, { id_salon, role, res }) {
    if (role !== 'gerant' && role !== 'salon') {
        const err = new Error("Accès réservé au gérant ou au poste de caisse lors d'un contrôle.");
        err.status = 403;
        throw err;
    }

    const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const salon = configRes.rows[0] || {};

    const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
    const nomGerantSalon = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Représentant Légal';

    const statsFiscalesRes = await pool.query(`
        SELECT 
            (SELECT COUNT(*) FROM tickets WHERE id_salon = $1 AND hash_ticket IS NOT NULL) as nb_tickets_scelles,
            (SELECT COUNT(*) FROM clotures_caisse WHERE id_salon = $1) as nb_z_scelles,
            (SELECT COUNT(*) FROM mouvements_caisse WHERE id_salon = $1 AND hash_mouvement IS NOT NULL) as nb_mvt_scelles,
            (SELECT COUNT(*) FROM jet_logs WHERE id_salon = $1) as nb_jet_scelles
    `, [id_salon]);
    const statsFiscales = statsFiscalesRes.rows[0] || {};

    const dernierZRes = await pool.query(`
        SELECT numero_z_salon, TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_z, cumul_perpetuel_ttc, signature_hash
        FROM clotures_caisse WHERE id_salon = $1
        ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1
    `, [id_salon]);
    const dernierZ = dernierZRes.rowCount > 0 ? dernierZRes.rows[0] : null;

    // Variables Éditeur (surchargeables via .env)
    const EDITEUR = {
        nom: process.env.EDITEUR_NOM || 'STACK',
        forme: process.env.EDITEUR_FORME_JURIDIQUE || '[Forme juridique & Capital social à venir]',
        siret: process.env.EDITEUR_SIRET || '[SIRET / SIREN en cours d\'immatriculation]',
        rcs: process.env.EDITEUR_RCS || '[RCS à venir]',
        adresse: process.env.EDITEUR_ADRESSE || '[Adresse du siège social à venir]',
        representant: process.env.EDITEUR_REPRESENTANT || 'Valentin TARDY',
        qualite: process.env.EDITEUR_QUALITE || 'Président / Gérant',
        logiciel: 'STACK',
        version: 'v1.0.0',
        date_version: 'Octobre 2026'
    };

    if (typeof enregistrerJET === 'function') {
        await enregistrerJET(id_salon, 'EDITION_DOSSIER_TECHNIQUE_NF525', { version: EDITEUR.version, demande_par: role });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Dossier_Technique_NF525_Attestation_STACK_${id_salon}.pdf"`);
    doc.pipe(res);

    const MAIN_COLOR = '#111827';
    const SEC_COLOR = '#4b5563';
    const ACCENT_COLOR = '#166534';
    const BORDER_COLOR = '#d1d5db';
    let currentY = 40;

    const drawSectionHeader = (title) => {
        if (currentY > 710) { doc.addPage(); currentY = 40; }
        currentY += 8;
        doc.rect(40, currentY, 515, 22).fill('#111827');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(title, 50, currentY + 6, { width: 495 });
        currentY += 30;
    };

    const drawSubTitle = (subtitle) => {
        if (currentY > 735) { doc.addPage(); currentY = 40; }
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT_COLOR).text(subtitle, 40, currentY);
        currentY += 14;
    };

    const drawParagraph = (text, options = {}) => {
        doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 8.5).fillColor(options.color || SEC_COLOR);
        const h = doc.heightOfString(text, { width: 515, lineGap: 2 });
        if (currentY + h > 775) { doc.addPage(); currentY = 40; }
        doc.text(text, 40, currentY, { width: 515, lineGap: 2, align: options.align || 'justify' });
        currentY += h + 6;
    };

    const drawRow = (cols, isHeader = false, isBold = false) => {
        const activeCols = cols.filter(c => c.w > 0);
        const defaultFont = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
        const defaultSize = isHeader ? 8 : 8.5;

        let maxH = 0;
        activeCols.forEach(col => {
            doc.font(col.font || defaultFont).fontSize(col.size || defaultSize);
            const h = doc.heightOfString(col.text != null ? String(col.text) : '', { width: col.w });
            if (h > maxH) maxH = h;
        });

        if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }

        let xPos = 40;
        activeCols.forEach(col => {
            doc.font(col.font || defaultFont).fontSize(col.size || defaultSize).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
            doc.text(col.text != null ? String(col.text) : '', xPos, currentY, { width: col.w, align: col.align || 'left' });
            xPos += col.w + 10;
        });

        currentY += Math.max(maxH, 10) + 4;
        doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
        currentY += 5;
    };

    // =========================================================================
    // PAGE 1 : EN-TÊTE OFFICIEL, IDENTIFICATION & ARCHITECTURE DE SÉCURITÉ
    // =========================================================================
    doc.rect(40, currentY, 515, 68).fillAndStroke('#f0fdf4', '#16a34a');
    doc.font('Helvetica-Bold').fontSize(14).fillColor(MAIN_COLOR).text('DOSSIER TECHNIQUE DESCRIPTIF & ATTESTATION NF525', 52, currentY + 10);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT_COLOR).text('Article 286, I-3° bis du Code Général des Impôts — BOI-TVA-DECLA-30-10-30 — Article L. 80 O du LPF', 52, currentY + 30);
    doc.font('Helvetica').fontSize(8.5).fillColor(SEC_COLOR).text(
        `Document officiel généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} pour présentation immédiate à l'administration fiscale.`,
        52, currentY + 46
    );
    currentY += 80;

    // 1. IDENTIFICATION DE L'ÉDITEUR ET DU LOGICIEL
    drawSectionHeader("1. IDENTIFICATION DE L'ÉDITEUR, DU LOGICIEL ET DE L'ÉTABLISSEMENT");
    drawRow([
        { text: 'Paramètre d\'identification', w: 195 },
        { text: 'Valeur déclarée et certifiée', w: 310 }
    ], true);
    drawRow([{ text: 'Raison sociale de l\'Éditeur', w: 195, isBold: true }, { text: `${EDITEUR.nom} — ${EDITEUR.forme}`, w: 310 }]);
    drawRow([{ text: 'Immatriculation Éditeur (SIRET / RCS)', w: 195 }, { text: `SIRET : ${EDITEUR.siret} | RCS : ${EDITEUR.rcs}`, w: 310 }]);
    drawRow([{ text: 'Siège social de l\'Éditeur', w: 195 }, { text: EDITEUR.adresse, w: 310 }]);
    drawRow([{ text: 'Représentant légal signataire', w: 195 }, { text: `${EDITEUR.representant}, agissant en qualité de ${EDITEUR.qualite}`, w: 310 }]);
    drawRow([{ text: 'Nom et Version du logiciel de caisse', w: 195 }, { text: `${EDITEUR.logiciel} — Version ${EDITEUR.version} (Mise en production : ${EDITEUR.date_version})`, w: 310 }], false, true);
    drawRow([{ text: 'Architecture et Technologie', w: 195 }, { text: 'Application Cloud SaaS Multi-Tenant — Node.js / PostgreSQL (ACID) / Cryptographie SHA-256', w: 310 }]);
    drawRow([{ text: 'Absence de mode école / démo / devis', w: 195 }, { text: 'Certifié : Le logiciel ne comporte aucun mode formation, école ou brouillon d\'encaissement.', w: 310, color: ACCENT_COLOR }]);
    drawRow([{ text: 'Établissement utilisateur (Assujetti)', w: 195 }, { text: `${salon.nom_salon || 'Salon'} ${salon.forme_juridique ? '(' + salon.forme_juridique + ')' : ''} — SIRET : ${salon.siret || 'Non renseigné'}`, w: 310 }]);
    drawRow([{ text: 'Adresse de l\'établissement utilisateur', w: 195 }, { text: `${salon.adresse_salon || 'Non renseignée'} (ID Interne Salon : #${id_salon})`, w: 310 }]);

    // 2. RESPECT DES 4 CONDITIONS LÉGALES (BOI-TVA-DECLA-30-10-30)
    drawSectionHeader("2. ARCHITECTURE TECHNIQUE : RESPECT DES 4 CONDITIONS LÉGALES");

    drawSubTitle("2.1. Condition d'Inaltérabilité (Triggers PostgreSQL & Interdiction des suppressions)");
    drawParagraph(
        "Les données d'origine relatives aux encaissements, lignes de vente, mouvements de caisse, clôtures journalières (Z), clôtures mensuelles et événements techniques (JET) sont enregistrées dans une base PostgreSQL sécurisée. " +
        "Au niveau du moteur de base de données, le trigger PL/pgSQL strict « nf525_prevent_alteration() » est attaché en BEFORE DELETE OR UPDATE sur les tables « tickets », « lignes_ticket », « clotures_caisse », « mouvements_caisse », « jet_logs » et « liasses_mensuelles_validees ». " +
        "Toute requête SQL visant à supprimer (DELETE) une ligne ou à modifier (UPDATE) un montant, un taux de TVA, une date, un mode de règlement ou un hash cryptographique déclenche une exception bloquante immédiate, sans aucune porte dérobée (y compris pour le Super-Administrateur)."
    );
    drawParagraph(
        "Procédure de correction et d'annulation : Lorsqu'un ticket doit être annulé (totalement ou partiellement), le ticket initial reste strictement intact en base. Le système exige un motif obligatoire et génère un nouveau ticket d'avoir compensatoire (« type_ticket = ANNULATION », numéroté séquentiellement « TKT-AN-YYYYMM-XXXXXX ») comportant des montants algébriques négatifs, rattaché à la pièce d'origine via la clé « id_ticket_origine » et scellé dans la chaîne SHA-256.",
        { bold: false }
    );

    drawSubTitle("2.2. Condition de Sécurisation (Chaînage Cryptographique SHA-256 & Verrous ACID)");
    drawParagraph(
        "Chaque opération fiscale fait l'objet d'un scellement numérique immédiat via l'algorithme standard SHA-256 (empreinte de 64 caractères hexadécimaux) intégrant l'empreinte de l'opération précédente du même établissement (Chaînage de type Blockchain locale par salon). " +
        "La concurrence d'accès est protégée par des transactions SQL strictes (BEGIN / COMMIT) couplées à des verrous exclusifs (SELECT ... FOR UPDATE et pg_advisory_xact_lock), garantissant une séquentialité continue sans trou ni doublon."
    );

    // Tableau des formules de hachage SHA-256
    drawRow([
        { text: 'Chaîne Fiscale', w: 95 },
        { text: 'Bloc Genesis', w: 75 },
        { text: 'Structure exacte de la chaîne concaténée soumise au condensat SHA-256', w: 325 }
    ], true);
    drawRow([
        { text: 'Tickets & Avoirs', w: 95, isBold: true },
        { text: 'GENESIS_BLOCK', w: 75, font: 'Courier', size: 7.5 },
        { text: '{id_ticket}|{numero_ticket}|{date_ISO}|{type_ticket}|{methode_paiement}|{total_ttc}|{total_tva}|{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
    ]);
    drawRow([
        { text: 'Clôtures Z', w: 95, isBold: true },
        { text: 'GENESIS_Z', w: 75, font: 'Courier', size: 7.5 },
        { text: 'Z-{id_salon}-{numero_z_salon}-{date_cloture_YYYY-MM-DD}-{total_encaisse}-{cumul_perpetuel_ttc}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
    ]);
    drawRow([
        { text: 'Mouvements Esp.', w: 95, isBold: true },
        { text: 'GENESIS_MVT', w: 75, font: 'Courier', size: 7.5 },
        { text: 'MVT-{id_salon}-{id_mouvement}-{type_mouvement}-{montant}-{motif}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
    ]);
    drawRow([
        { text: 'Journal JET', w: 95, isBold: true },
        { text: 'GENESIS_JET', w: 75, font: 'Courier', size: 7.5 },
        { text: '{id_salon}-{action}-{details_json}-{date_ISO}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
    ]);
    drawRow([
        { text: 'Liasses Mensuelles', w: 95, isBold: true },
        { text: 'GENESIS_LIASSE', w: 75, font: 'Courier', size: 7.5 },
        { text: 'LIASSE-{id_salon}-{mois_annee}-{ht}-{tva}-{ttc}-{cumul_perpetuel}-{signataire}-{date_ISO}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
    ]);

    // =========================================================================
    // PAGE 2 : CLÔTURES Z, CONSERVATION, ARCHIVAGE & SCHÉMA DES TABLES
    // =========================================================================
    doc.addPage();
    currentY = 40;

    drawSubTitle("2.3. Règle de Calcul du Cumul Perpétuel (Grand Total) et Continuité des Clôtures Z");
    drawParagraph(
        "Conformément aux exigences de la norme NF525, chaque établissement dispose d'une séquence de clôture journalière propre et continue (« numero_z_salon » de 1 à N). " +
        "Le Grand Total Perpétuel TTC (« cumul_perpetuel_ttc ») n'est jamais calculé par une somme globale a posteriori, mais exclusivement de manière incrémentale lors du scellement de chaque Z : " +
        "Nouveau Cumul Perpétuel TTC = Ancien Cumul Perpétuel TTC (issu du dernier Z scellé verrouillé en FOR UPDATE) + Chiffre d'Affaires TTC de la journée clôturée (somme algébrique des tickets de vente et des avoirs d'annulation du jour). " +
        "Il est strictement impossible d'enregistrer un nouvel encaissement ou un mouvement de caisse sur une journée dont le Z a été scellé (verrou HTTP 423)."
    );

    drawSubTitle("2.4. Condition de Conservation et Infrastructure d'Hébergement (6 ans LPF / 10 ans Compta)");
    drawParagraph(
        "• Hébergement souverain UE : Le serveur applicatif Node.js et la base de données PostgreSQL sont hébergés par Render Cloud dans la région Francfort (Allemagne — Union Européenne). Les pièces justificatives et documents PDF sont stockés de manière redondée sur Cloudflare R2.\n" +
        "• Politique de sauvegarde (Backups) : La base PostgreSQL fait l'objet de sauvegardes automatiques quotidiennes (Snapshots + Point-in-Time Recovery) garantissant l'absence de perte de données.\n" +
        "• Conciliation RGPD et Obligation Fiscale (Art. L. 102 B du LPF) : En cas de suppression d'un client, d'un collaborateur ou de résiliation complète d'un salon, aucune ligne des tables fiscales (« tickets », « lignes_ticket », « clotures_caisse », « mouvements_caisse », « jet_logs », « liasses_mensuelles_validees ») n'est supprimée pendant le délai légal de 6 ans (10 ans pour les pièces comptables). Les fiches personnes physiques liées sont uniquement anonymisées."
    );

    drawSubTitle("2.5. Condition d'Archivage, Export FEC et Vérification par l'Administration Fiscale");
    drawParagraph(
        "En cas de contrôle fiscal (article L. 80 O ou L. 47 A du LPF), l'interface met à disposition immédiate trois outils d'audit :\n" +
        "1. Export de l'Archive Fiscale Scellée (GET /api/export-archive-fiscale) : Génère un fichier CSV UTF-8 contenant tous les tickets, lignes détaillées, clôtures Z et journaux techniques (JET) sur la période choisie, signé cryptographiquement en fin de fichier par un condensat HMAC-SHA256.\n" +
        "2. Export du Fichier des Écritures Comptables — FEC (GET /api/export-fec) : Génère le fichier texte normé DGFiP (« SIRENFECYYYYMMDD.txt », encodage UTF-8, séparateur tabulation, 18 colonnes obligatoires Art. A.47 A-1 du LPF, numérotation continue EC-000001 à N, équilibre strict Débit = Crédit).\n" +
        "3. Audit Cryptographique Automatisé (GET /api/admin/verifier-nf525) : Recalcule en temps réel chaque hash SHA-256 depuis le bloc Genesis pour détecter toute altération ou rupture de séquence."
    );

    // 3. DICTIONNAIRE DES TABLES FISCALES
    drawSectionHeader("3. DICTIONNAIRE DES TABLES FISCALES ET DU JOURNAL TECHNIQUE (JET)");
    drawRow([
        { text: 'Table SQL', w: 110 },
        { text: 'Clé & Séquence', w: 85 },
        { text: 'Colonnes Fiscales Scellées et Rôle Réglementaire', w: 300 }
    ], true);
    drawRow([
        { text: 'tickets', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_ticket\nnumero_ticket_caisse', w: 85, size: 8 },
        { text: 'En-tête des ventes et avoirs (TKT-YYYYMM-XXXXXX / TKT-AN-...). Contient date_creation, total_ttc, methode_paiement, type_ticket, id_ticket_origine, motif_annulation, donnees_scellees, hash_ticket.', w: 300, size: 8 }
    ]);
    drawRow([
        { text: 'lignes_ticket', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_ligne\n(FK id_ticket)', w: 85, size: 8 },
        { text: 'Détail immuable des articles vendus avec snapshot figé au moment de la vente : nom_article_snapshot, quantite, prix_unitaire_ttc, total_ligne_ttc, taux_tva_snapshot.', w: 300, size: 8 }
    ]);
    drawRow([
        { text: 'clotures_caisse', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_cloture\nnumero_z_salon', w: 85, size: 8 },
        { text: 'Clôtures journalières Z. Contient date_cloture, total_encaisse, cumul_perpetuel_ttc, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, hash_precedent, signature_hash.', w: 300, size: 8 }
    ]);
    drawRow([
        { text: 'mouvements_caisse', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_mouvement', w: 85, size: 8 },
        { text: 'Traçabilité des flux d\'espèces hors ventes (ENTREE, SORTIE, REGULARISATION), categorie_comptable, montant, motif, date_creation, hash_precedent, hash_mouvement.', w: 300, size: 8 }
    ]);
    drawRow([
        { text: 'jet_logs', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_jet', w: 85, size: 8 },
        { text: 'Journal des Événements Techniques (JET) chaîné : CONNEXION, ENCAISSEMENT_TICKET, ANNULATION_TICKET, MOUVEMENT_CAISSE, CLOTURE_Z, IMPRESSION_DUPLICATA_Z, CLOTURE_MENSUELLE, AUDIT_NF525, EXPORT_FEC.', w: 300, size: 8 }
    ]);
    drawRow([
        { text: 'liasses_mensuelles\n_validees', w: 110, font: 'Courier-Bold', size: 8 },
        { text: 'id_validation\n(id_salon, mois)', w: 85, size: 8 },
        { text: 'Scellement mensuel signé par code PIN du gérant : total_ht, total_tva, total_ttc, cumul_perpetuel_ttc, valide_par, date_validation, hash_precedent, signature_hash.', w: 300, size: 8 }
    ]);

    // 4. ÉTAT CRYPTOGRAPHIQUE TEMPS RÉEL DU SALON
    drawSectionHeader("4. ÉTAT DE SANTÉ CRYPTOGRAPHIQUE EN TEMPS RÉEL DE L'ÉTABLISSEMENT");
    const splitHash32 = (h) => (h && h.length === 64) ? `${h.substring(0, 32)}\n${h.substring(32, 64)}` : (h || 'GENESIS_Z (Aucune clôture Z effectuée)');
    drawRow([
        { text: 'Compteur / Indicateur d\'intégrité NF525 (Salon #' + id_salon + ')', w: 250 },
        { text: 'Valeur constatée en Base de Données', w: 255, align: 'right' }
    ], true);
    drawRow([{ text: 'Tickets de caisse et Avoirs scellés (SHA-256)', w: 250 }, { text: `${statsFiscales.nb_tickets_scelles || 0} pièce(s)`, w: 255, align: 'right' }]);
    drawRow([{ text: 'Clôtures journalières (Z) scellées', w: 250 }, { text: `${statsFiscales.nb_z_scelles || 0} clôture(s)`, w: 255, align: 'right' }]);
    drawRow([{ text: 'Mouvements d\'espèces scellés', w: 250 }, { text: `${statsFiscales.nb_mvt_scelles || 0} mouvement(s)`, w: 255, align: 'right' }]);
    drawRow([{ text: 'Événements inscrits au Journal Technique (JET)', w: 250 }, { text: `${statsFiscales.nb_jet_scelles || 0} événement(s)`, w: 255, align: 'right' }]);
    drawRow([
        { text: 'Dernier Z scellé & Grand Total Perpétuel TTC', w: 250, isBold: true },
        { text: dernierZ ? `Z N° ${String(dernierZ.numero_z_salon).padStart(4, '0')} du ${dernierZ.date_z} — Cumul : ${Number(dernierZ.cumul_perpetuel_ttc || 0).toFixed(2).replace('.', ',')} €` : 'Aucun Z clôturé à ce jour', w: 255, align: 'right', isBold: true }
    ], false, true);
    drawRow([
        { text: 'Dernière empreinte SHA-256 de clôture Z', w: 250 },
        { text: splitHash32(dernierZ ? dernierZ.signature_hash : null), w: 255, align: 'right', font: 'Courier-Bold', size: 7.5, color: ACCENT_COLOR }
    ]);

    // =========================================================================
    // PAGE 3 : ATTESTATION INDIVIDUELLE OFFICIELLE (MODÈLE DGFiP)
    // =========================================================================
    doc.addPage();
    currentY = 40;

    doc.rect(40, currentY, 515, 52).fillAndStroke('#111827', '#111827');
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff').text('ATTESTATION INDIVIDUELLE DE CONFORMITÉ', 50, currentY + 10, { align: 'center', width: 495 });
    doc.font('Helvetica').fontSize(9).fillColor('#e5e7eb').text(
        'Modèle conforme aux dispositions du 3° bis du I de l\'article 286 du Code Général des Impôts (BOI-LETTRE-000242)',
        50, currentY + 30, { align: 'center', width: 495 }
    );
    currentY += 65;

    // VOLET 1 : ÉDITEUR
    doc.rect(40, currentY, 515, 235).strokeColor(MAIN_COLOR).lineWidth(1).stroke();
    doc.rect(40, currentY, 515, 22).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text('VOLET 1 : PARTIE RÉSERVÉE À L\'ÉDITEUR DU LOGICIEL OU SYSTÈME DE CAISSE', 50, currentY + 6);
    currentY += 30;

    doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(
        `Je soussigné(e), ${EDITEUR.representant}, agissant en qualité de ${EDITEUR.qualite} de la structure éditrice désignée ci-dessous :`,
        52, currentY, { width: 490 }
    );
    currentY += 20;

    const drawAttestLine = (label, val) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SEC_COLOR).text(label, 52, currentY, { width: 175 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(val, 230, currentY, { width: 310 });
        currentY += 14;
    };

    drawAttestLine('• Raison sociale / Nom de l\'éditeur :', `${EDITEUR.nom} (${EDITEUR.forme})`);
    drawAttestLine('• Numéro SIRET / SIREN :', `${EDITEUR.siret} — RCS : ${EDITEUR.rcs}`);
    drawAttestLine('• Adresse du siège social :', EDITEUR.adresse);
    drawAttestLine('• Nom et référence du logiciel :', `${EDITEUR.logiciel}`);
    drawAttestLine('• Numéro de version (Majeure.Mineure) :', `${EDITEUR.version} (Date de mise en service : ${EDITEUR.date_version})`);
    currentY += 6;

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT_COLOR).text(
        `ATTESTE que le logiciel ou système de caisse « ${EDITEUR.logiciel} » (version ${EDITEUR.version}) satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données en vue du contrôle de l'administration fiscale, prévues au 3° bis du I de l'article 286 du Code Général des Impôts (Norme NF525).`,
        52, currentY, { width: 490, lineGap: 2 }
    );
    currentY += 42;

    doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(`Fait le : ${new Date().toLocaleDateString('fr-FR')}`, 52, currentY);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(`Signataire : ${EDITEUR.representant} (${EDITEUR.qualite})`, 260, currentY);
    currentY += 14;
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(SEC_COLOR).text(
        'Rappel légal : L\'établissement ou l\'utilisation d\'une fausse attestation est passible d\'une amende fiscale de 45 000 € (Art. 1770 duodecies du CGI) et de sanctions pénales de 3 ans d\'emprisonnement (Art. 441-1 du Code pénal).',
        52, currentY, { width: 490 }
    );
    currentY += 35;

    // VOLET 2 : ENTREPRISE ASSUJETTIE (LE SALON)
    doc.rect(40, currentY, 515, 235).strokeColor(MAIN_COLOR).lineWidth(1).stroke();
    doc.rect(40, currentY, 515, 22).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text('VOLET 2 : PARTIE RÉSERVÉE À L\'ENTREPRISE UTILISATRICE ASSUJETTIE À LA TVA', 50, currentY + 6);
    currentY += 30;

    doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(
        `Je soussigné(e), ${nomGerantSalon}, représentant légal de l'établissement utilisateur désigné ci-dessous :`,
        52, currentY, { width: 490 }
    );
    currentY += 20;

    drawAttestLine('• Raison sociale / Enseigne du Salon :', `${salon.nom_salon || 'Non renseigné'} ${salon.forme_juridique ? '(' + salon.forme_juridique + ')' : ''}`);
    drawAttestLine('• Numéro SIRET :', `${salon.siret || 'À compléter dans Paramètres > Identité & Légal'}`);
    drawAttestLine('• Adresse d\'exploitation :', `${salon.adresse_salon || 'À compléter dans Paramètres > Identité & Légal'}`);
    drawAttestLine('• Régime de TVA / N° Intracom. :', salon.tva_intra && salon.tva_intra.trim() !== '' ? salon.tva_intra : 'Franchise en base de TVA (Art. 293 B du CGI)');
    drawAttestLine('• Logiciel utilisé pour l\'encaissement :', `${EDITEUR.logiciel} ${EDITEUR.version} (Identifiant Salon Cloud : #${id_salon})`);
    currentY += 6;

    doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(
        `Déclare utiliser le logiciel de caisse « ${EDITEUR.logiciel} » (${EDITEUR.version}) pour l'enregistrement des règlements de mes clients et reconnais avoir reçu la présente attestation individuelle de conformité délivrée par l'éditeur conformément à l'article 286, I-3° bis du CGI et à l'article L. 80 O du LPF.`,
        52, currentY, { width: 490, lineGap: 2 }
    );
    currentY += 42;

    doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(`Date de réception : ${new Date().toLocaleDateString('fr-FR')}`, 52, currentY);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(`Cachet et Signature de l'exploitant (${nomGerantSalon}) :`, 260, currentY);

    // --- PAGINATION DYNAMIQUE ---
    const range = doc.bufferedPageRange();
    for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
        doc.switchToPage(i);
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8.5).fillColor(SEC_COLOR).text(
            `STACK ${EDITEUR.version} — Dossier Technique & Attestation NF525 (Salon #${id_salon}) — Page ${page} / ${range.count}`,
            0, 815,
            { align: 'center', width: 595 }
        );
        doc.page.margins.bottom = originalBottomMargin;
    }
    doc.end();
}

module.exports = {
    genererDossierTechniqueNF525PDF
};
