const { deduireCategorieMouvement: deduireCatHelper } = require('../pdf/liassePdf.service');

/**
 * Moteur unifié de construction du Fichier des Écritures Comptables (FEC)
 * Conforme à l'Article A.47 A-1 du Livre des Procédures Fiscales (DGFiP / NF525)
 *
 * @param {Object|number|string} depsOrIdSalon - { pool, deduireCategorieMouvement } ou id_salon direct
 * @param {Object|string} [idSalonOrDateDebut] - id_salon si deps passé en premier, sinon date_debut
 * @param {string} [maybeDateDebutOrDateFin] - date_debut si deps passé, sinon date_fin
 * @param {string} [maybeDateFin] - date_fin si deps passé
 * @returns {Promise<{ fecContent: string, nomFichier: string, nbLignes: number, totalEquilibre: number }>}
 */
async function construireContenuFEC(depsOrIdSalon, idSalonOrDateDebut, maybeDateDebutOrDateFin, maybeDateFin) {
    let pool, id_salon, date_debut, date_fin;
    let deduireCategorieMouvement = deduireCatHelper;

    if (depsOrIdSalon && typeof depsOrIdSalon === 'object' && depsOrIdSalon.pool) {
        pool = depsOrIdSalon.pool;
        if (depsOrIdSalon.deduireCategorieMouvement) deduireCategorieMouvement = depsOrIdSalon.deduireCategorieMouvement;
        id_salon = idSalonOrDateDebut;
        date_debut = maybeDateDebutOrDateFin;
        date_fin = maybeDateFin;
    } else {
        id_salon = depsOrIdSalon;
        date_debut = idSalonOrDateDebut;
        date_fin = maybeDateDebutOrDateFin;
    }

    // 1. Récupérer la configuration comptable et fiscale (Franchise TVA + SIREN) du salon
    const configRes = await pool.query(
        'SELECT siret, tva_intra, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva FROM configuration_salon WHERE id_salon = $1',
        [id_salon]
    );
    const config = configRes.rows[0] || {};
    const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';
    const siren = config.siret ? String(config.siret).replace(/\D/g, '').substring(0, 9) : '';

    const CPT_BANQUE = config.compte_banque || '512000';
    const CPT_CAISSE = config.compte_caisse || '530000';
    const CPT_PRESTA = config.compte_prestations || '706000';
    const CPT_PROD = config.compte_produits || '707000';
    const CPT_TVA_BASE = config.compte_tva || '445710';
    const CPT_POURBOIRES = '426000';

    const getCompteTvaCollectee = (taux) => {
        if (CPT_TVA_BASE !== '445710') return CPT_TVA_BASE;
        const t = Number(taux);
        if (t === 20) return '445711';
        if (t === 10) return '445712';
        if (t === 5.5) return '445713';
        return CPT_TVA_BASE;
    };

    // 2. Récupérer tous les tickets validés (ventes + avoirs d'annulation + pourboires) sur la période
    const ticketsRes = await pool.query(`
        SELECT 
            t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.methode_paiement, t.total_ttc, t.montant_pourboire, t.type_ticket,
            lt.id_ligne, lt.total_ligne_ttc, lt.taux_tva_snapshot, COALESCE(lt.nom_article_snapshot, c.nom, 'Prestation') as nom_article,
            COALESCE(c.type_article, 'PRESTATION') as type_article,
            cc.date_cloture
        FROM tickets t
        LEFT JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket
        LEFT JOIN catalogue c ON lt.id_article = c.id_article
        LEFT JOIN clotures_caisse cc ON cc.id_salon = t.id_salon AND cc.date_cloture = DATE(t.date_creation)
        WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
        ORDER BY t.date_creation ASC, t.id_ticket ASC, lt.id_ligne ASC
    `, [id_salon, date_debut, date_fin]);

    const formatDateFEC = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };
    const formatMontant = (cents) => (Math.abs(cents) / 100).toFixed(2).replace('.', ',');

    // Regroupement par ticket dans l'ordre chronologique strict
    const ticketsList = [];
    const ticketsMap = new Map();
    ticketsRes.rows.forEach(r => {
        if (!ticketsMap.has(r.id_ticket)) {
            const tObj = {
                id_ticket: r.id_ticket,
                numero: r.numero_ticket_caisse || `TKT-${r.id_ticket}`,
                date: r.date_creation,
                date_valid: r.date_cloture || r.date_creation,
                methode: r.methode_paiement || 'CARTE',
                type_ticket: r.type_ticket || 'VENTE',
                total_ttc: parseFloat(r.total_ttc) || 0,
                pourboire: parseFloat(r.montant_pourboire) || 0,
                lignes: []
            };
            ticketsMap.set(r.id_ticket, tObj);
            ticketsList.push(tObj);
        }
        if (r.total_ligne_ttc !== null && r.total_ligne_ttc !== undefined) {
            ticketsMap.get(r.id_ticket).lignes.push(r);
        }
    });

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const lignesFec = [];
    let sequenceEcriture = 1; // Numérotation continue globale sans trou (Exigence Art. A.47 A-1 LPF)

    for (const t of ticketsList) {
        const ticketCents = Math.round(t.total_ttc * 100);
        const pourboireCents = Math.max(0, Math.round((t.pourboire || 0) * 100));
        if (ticketCents === 0 && pourboireCents === 0) continue;

        const estAvoir = ticketCents < 0 || t.type_ticket === 'ANNULATION';
        const absTicketCents = Math.abs(ticketCents);
        const totalEncaisseCents = estAvoir ? absTicketCents : (absTicketCents + pourboireCents);

        const dateEcriture = formatDateFEC(t.date);
        const dateValid = formatDateFEC(t.date_valid);
        const pieceRef = String(t.numero).replace(/[\t\r\n]/g, ' ').trim();
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        const cptePaiement = (t.methode === 'ESPECES') ? CPT_CAISSE : CPT_BANQUE;
        const libellePaiement = (t.methode === 'ESPECES') ? 'Caisse' : 'Banque';
        const prefixeLib = estAvoir ? 'Avoir Annulation' : 'Encaissement';

        // 1. Ligne de règlement (Débit si Vente, Crédit si Avoir/Annulation)
        lignesFec.push({
            JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
            CompteNum: cptePaiement, CompteLib: libellePaiement, CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `${prefixeLib} ${pieceRef}`.substring(0, 40),
            Debit: estAvoir ? '0,00' : formatMontant(totalEncaisseCents),
            Credit: estAvoir ? formatMontant(totalEncaisseCents) : '0,00',
            EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
        });
        if (estAvoir) totalCreditCents += totalEncaisseCents;
        else totalDebitCents += totalEncaisseCents;

        // 1 Bis. Ligne de Pourboire éventuel (Compte 426000 - Hors TVA)
        if (!estAvoir && pourboireCents > 0) {
            lignesFec.push({
                JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                CompteNum: CPT_POURBOIRES, CompteLib: 'Pourboires salaries a reverser', CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `Pourboire ${pieceRef}`.substring(0, 40),
                Debit: '0,00',
                Credit: formatMontant(pourboireCents),
                EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
            });
            totalCreditCents += pourboireCents;
        }

        // 2. Préparation et proratisation au centime près des lignes de produits/prestations (pour les anciens tickets avec remise)
        const lignesBrutes = t.lignes.length > 0
            ? t.lignes
            : [{ total_ligne_ttc: t.total_ttc, taux_tva_snapshot: 20.00, nom_article: 'Prestation globale', type_article: 'PRESTATION' }];

        const rawLinesCents = lignesBrutes.map(l => ({
            ...l,
            rawCents: Math.abs(Math.round((parseFloat(l.total_ligne_ttc) || 0) * 100))
        }));
        const sumRawCents = rawLinesCents.reduce((s, l) => s + l.rawCents, 0);

        let cumulAlloue = 0;
        const lignesCalculees = rawLinesCents.map((l, idx) => {
            if (sumRawCents === 0) return { ...l, absCents: idx === 0 ? absTicketCents : 0 };
            if (sumRawCents === absTicketCents) return { ...l, absCents: l.rawCents };
            if (idx === rawLinesCents.length - 1) {
                return { ...l, absCents: Math.max(0, absTicketCents - cumulAlloue) };
            }
            const prorata = Math.round((l.rawCents * absTicketCents) / sumRawCents);
            cumulAlloue += prorata;
            return { ...l, absCents: prorata };
        });

        // 3. Génération des lignes de Produits (706/707) et de TVA par taux (44571x)
        for (const ligne of lignesCalculees) {
            if (ligne.absCents === 0) continue;

            const tauxTVA = franchiseTVA ? 0 : (parseFloat(ligne.taux_tva_snapshot) ?? 20.00);
            const ligneHTCents = franchiseTVA ? ligne.absCents : Math.round(ligne.absCents / (1 + tauxTVA / 100));
            const ligneTVACents = franchiseTVA ? 0 : (ligne.absCents - ligneHTCents);

            const cpteVente = (ligne.type_article === 'PRODUIT_REVENTE') ? CPT_PROD : CPT_PRESTA;
            const libelleVente = (ligne.type_article === 'PRODUIT_REVENTE') ? 'Vente Produit' : 'Vente Prestation';
            const nomNettoye = (ligne.nom_article || 'Article').substring(0, 30).replace(/[\t\r\n]/g, ' ').trim();

            if (ligneHTCents > 0) {
                lignesFec.push({
                    JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                    CompteNum: cpteVente, CompteLib: libelleVente, CompAuxNum: '', CompAuxLib: '',
                    PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: nomNettoye,
                    Debit: estAvoir ? formatMontant(ligneHTCents) : '0,00',
                    Credit: estAvoir ? '0,00' : formatMontant(ligneHTCents),
                    EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
                });
                if (estAvoir) totalDebitCents += ligneHTCents;
                else totalCreditCents += ligneHTCents;
            }

            if (ligneTVACents > 0) {
                const tauxAff = Number(tauxTVA).toString().replace('.', ',');
                const cpteTvaSpecifique = getCompteTvaCollectee(tauxTVA);
                lignesFec.push({
                    JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                    CompteNum: cpteTvaSpecifique, CompteLib: `TVA Collectee ${tauxAff}%`, CompAuxNum: '', CompAuxLib: '',
                    PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `TVA ${nomNettoye}`.substring(0, 30),
                    Debit: estAvoir ? formatMontant(ligneTVACents) : '0,00',
                    Credit: estAvoir ? '0,00' : formatMontant(ligneTVACents),
                    EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
                });
                if (estAvoir) totalDebitCents += ligneTVACents;
                else totalCreditCents += ligneTVACents;
            }
        }
    }

    // 4. JOURNAL DES ACHATS (AC) : Factures fournisseurs validées sur la période (avec dédoublonnage strict par fournisseur + n° facture)
    const achatsRes = await pool.query(`
        SELECT id_facture, nom_fournisseur, numero_facture, COALESCE(date_facture, DATE(date_traitement)) as date_piece,
               montant_ht, montant_tva, montant_ttc, compte_comptable
        FROM factures_fournisseurs
        WHERE id_salon = $1 AND statut_verification = 'VALIDE'
          AND COALESCE(date_facture, DATE(date_traitement)) BETWEEN $2 AND $3
        ORDER BY COALESCE(date_facture, DATE(date_traitement)) ASC, id_facture ASC
    `, [id_salon, date_debut, date_fin]);

    const facturesVuesFec = new Set();
    for (const f of achatsRes.rows) {
        if (f.numero_facture && String(f.numero_facture).trim() !== '') {
            const cleUniqueFac = `${String(f.nom_fournisseur || '').trim().toLowerCase()}_${String(f.numero_facture).trim().toLowerCase()}`;
            if (facturesVuesFec.has(cleUniqueFac)) continue;
            facturesVuesFec.add(cleUniqueFac);
        }
        const ttcCents = Math.round((parseFloat(f.montant_ttc) || 0) * 100);
        if (ttcCents <= 0) continue;

        let htCents = franchiseTVA ? ttcCents : Math.round((parseFloat(f.montant_ht) || 0) * 100);
        let tvaCents = franchiseTVA ? 0 : Math.round((parseFloat(f.montant_tva) || 0) * 100);
        if (htCents + tvaCents !== ttcCents) {
            htCents = ttcCents - tvaCents;
        }

        const datePiece = formatDateFEC(f.date_piece);
        const pieceRef = String(f.numero_facture || `FAC-${f.id_facture}`).replace(/[\t\r\n]/g, ' ').trim();
        const nomFourn = String(f.nom_fournisseur || 'Fournisseur').replace(/[\t\r\n]/g, ' ').trim();
        const codeAux = 'F' + nomFourn.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8).padEnd(4, '0');
        const cpteCharge = (f.compte_comptable ? String(f.compte_comptable).replace(/\D/g, '') : '604000').padEnd(6, '0').substring(0, 6);
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        // Débit Charge (6xx)
        if (htCents > 0) {
            lignesFec.push({
                JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
                CompteNum: cpteCharge, CompteLib: `Achats / Charges (${cpteCharge})`, CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `Facture ${nomFourn}`.substring(0, 40),
                Debit: formatMontant(htCents), Credit: '0,00',
                EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
            });
            totalDebitCents += htCents;
        }

        // Débit TVA déductible sur autres biens et services (445660)
        if (tvaCents > 0) {
            lignesFec.push({
                JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
                CompteNum: '445660', CompteLib: 'TVA deductible sur ABS', CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `TVA ${nomFourn}`.substring(0, 40),
                Debit: formatMontant(tvaCents), Credit: '0,00',
                EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
            });
            totalDebitCents += tvaCents;
        }

        // Crédit Fournisseur (401000)
        lignesFec.push({
            JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
            CompteNum: '401000', CompteLib: 'Fournisseurs', CompAuxNum: codeAux, CompAuxLib: nomFourn.substring(0, 30),
            PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `Facture ${nomFourn}`.substring(0, 40),
            Debit: '0,00', Credit: formatMontant(ttcCents),
            EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
        });
        totalCreditCents += ttcCents;
    }

    // 5. JOURNAL DE CAISSE (CA) : Mouvements d'espèces hors tickets (Remises en banque, Apports, Prélèvements, Régularisations)
    const mvtsRes = await pool.query(`
        SELECT id_mouvement, type_mouvement, categorie_comptable, montant, motif, date_creation
        FROM mouvements_caisse
        WHERE id_salon = $1 AND DATE(date_creation) BETWEEN $2 AND $3
        ORDER BY date_creation ASC, id_mouvement ASC
    `, [id_salon, date_debut, date_fin]);

    for (const m of mvtsRes.rows) {
        const mntCents = Math.round(Math.abs(parseFloat(m.montant) || 0) * 100);
        if (mntCents === 0) continue;

        const cat = deduireCategorieMouvement(m.type_mouvement, m.motif, m.categorie_comptable);
        const dateMvt = formatDateFEC(m.date_creation);
        const pieceRef = `MVT-${m.id_mouvement}`;
        const motifClean = String(m.motif || cat).replace(/[\t\r\n]/g, ' ').trim().substring(0, 40);
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        let estEntreeCaisse = m.type_mouvement === 'ENTREE' || (m.type_mouvement === 'REGULARISATION' && parseFloat(m.montant) > 0);
        let cpteContrepartie = '580000';
        let libContrepartie = 'Virements internes';

        if (cat === 'REMISE_BANQUE' || cat === 'APPORT_FONDS') {
            cpteContrepartie = '580000';
            libContrepartie = 'Virements internes (Banque/Caisse)';
        } else if (cat === 'PRELEVEMENT_GERANT') {
            cpteContrepartie = '108000';
            libContrepartie = 'Compte de l exploitant';
        } else if (cat === 'ACHAT_ESPECES') {
            cpteContrepartie = '401000';
            libContrepartie = 'Reglement especes fournisseur';
        } else if (cat === 'ECART_CAISSE') {
            cpteContrepartie = estEntreeCaisse ? '758000' : '658000';
            libContrepartie = estEntreeCaisse ? 'Produits divers gestion courante (Boni)' : 'Charges diverses gestion courante (Mali)';
        }

        // Ligne Caisse (530000)
        lignesFec.push({
            JournalCode: 'CA', JournalLib: 'Caisse', EcritureNum: ecritureNum, EcritureDate: dateMvt,
            CompteNum: CPT_CAISSE, CompteLib: 'Caisse', CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateMvt, EcritureLib: motifClean,
            Debit: estEntreeCaisse ? formatMontant(mntCents) : '0,00',
            Credit: estEntreeCaisse ? '0,00' : formatMontant(mntCents),
            EcritureLet: '', DateLet: '', ValidDate: dateMvt, Montantdevise: '', Idevise: ''
        });

        // Ligne Contrepartie
        lignesFec.push({
            JournalCode: 'CA', JournalLib: 'Caisse', EcritureNum: ecritureNum, EcritureDate: dateMvt,
            CompteNum: cpteContrepartie, CompteLib: libContrepartie, CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateMvt, EcritureLib: motifClean,
            Debit: estEntreeCaisse ? '0,00' : formatMontant(mntCents),
            Credit: estEntreeCaisse ? formatMontant(mntCents) : '0,00',
            EcritureLet: '', DateLet: '', ValidDate: dateMvt, Montantdevise: '', Idevise: ''
        });

        totalDebitCents += mntCents;
        totalCreditCents += mntCents;
    }

    if (totalDebitCents !== totalCreditCents) {
        throw new Error(`Déséquilibre comptable détecté (Débit: ${(totalDebitCents / 100).toFixed(2)}€ / Crédit: ${(totalCreditCents / 100).toFixed(2)}€).`);
    }

    // Tri chronologique strict (Art. A.47 A-1 LPF) et renumérotation séquentielle continue sans trou
    lignesFec.sort((a, b) => {
        if (a.EcritureDate !== b.EcritureDate) return a.EcritureDate.localeCompare(b.EcritureDate);
        return a.EcritureNum.localeCompare(b.EcritureNum);
    });
    const mapNouveauNum = new Map();
    let seqChrono = 1;
    for (const row of lignesFec) {
        if (!mapNouveauNum.has(row.EcritureNum)) {
            mapNouveauNum.set(row.EcritureNum, `EC-${String(seqChrono).padStart(6, '0')}`);
            seqChrono++;
        }
        row.EcritureNum = mapNouveauNum.get(row.EcritureNum);
    }

    const headers = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
    let fecContent = headers.join('\t') + '\r\n';
    for (const row of lignesFec) {
        fecContent += headers.map(h => String(row[h] ?? '').replace(/[\t\r\n|]/g, ' ')).join('\t') + '\r\n';
    }

    const dateFinCompact = date_fin.replace(/-/g, '');
    const nomFichier = siren.length === 9
        ? `${siren}FEC${dateFinCompact}.txt`
        : `FEC_${id_salon}_${date_debut.replace(/-/g, '')}_${dateFinCompact}.txt`;

    return { fecContent, nomFichier, nbLignes: lignesFec.length, totalEquilibre: totalDebitCents / 100 };
}

module.exports = {
    construireContenuFEC
};
