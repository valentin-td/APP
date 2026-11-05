const crypto = require('crypto');

/**
 * Génération de l'archive fiscale scellée au format CSV (Norme NF525 / LPF)
 * @param {Object} deps - { pool, enregistrerJET }
 * @param {Object} params - { id_salon, date_debut, date_fin }
 * @returns {Promise<{ csv: string, nomFichier: string, signature: string, nbTickets: number, nbMouvements: number, nbJet: number }>}
 */
async function genererArchiveFiscale({ pool, enregistrerJET }, { id_salon, date_debut, date_fin }) {
        const ticketsRes = await pool.query(
            `SELECT t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.type_ticket, t.total_ttc, t.methode_paiement, t.statut, t.est_compense, t.id_ticket_origine, t.motif_annulation, t.hash_ticket,
                    lt.id_article, COALESCE(lt.nom_article_snapshot, 'N/A') as nom_article, lt.quantite, lt.prix_unitaire_ttc, lt.taux_tva_snapshot, lt.total_ligne_ttc
             FROM tickets t
             LEFT JOIN lignes_ticket lt ON lt.id_ticket = t.id_ticket
             WHERE t.id_salon = $1 AND DATE(t.date_creation) BETWEEN $2 AND $3
             ORDER BY t.id_ticket ASC`,
            [id_salon, date_debut, date_fin]
        );

        const jetRes = await pool.query(
            `SELECT id_jet, action, details, date_creation, hash_precedent, hash_jet
             FROM jet_logs WHERE id_salon = $1 AND DATE(date_creation) BETWEEN $2 AND $3
             ORDER BY id_jet ASC`,
            [id_salon, date_debut, date_fin]
        );

        const echapper = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const cloturesRes = await pool.query(
            `SELECT id_cloture, numero_z_salon, date_cloture, total_encaisse, cumul_perpetuel_ttc, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, ferme_par, hash_precedent, signature_hash
             FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3
             ORDER BY numero_z_salon ASC NULLS LAST, id_cloture ASC`,
            [id_salon, date_debut, date_fin]
        );

        let csv = 'TICKETS\r\n';
        csv += ['id_ticket','numero_ticket','date_creation','type_ticket','statut','est_compense','id_ticket_origine','motif_annulation','methode_paiement','total_ttc','id_article','nom_article','quantite','prix_unitaire_ttc','taux_tva','total_ligne_ttc','hash_ticket'].join(';') + '\r\n';
        for (const r of ticketsRes.rows) {
            csv += [r.id_ticket, r.numero_ticket_caisse, new Date(r.date_creation).toISOString(), r.type_ticket, r.statut, r.est_compense, r.id_ticket_origine || '', r.motif_annulation || '', r.methode_paiement, r.total_ttc, r.id_article || '', r.nom_article, r.quantite, r.prix_unitaire_ttc, r.taux_tva_snapshot, r.total_ligne_ttc, r.hash_ticket]
                .map(echapper).join(';') + '\r\n';
        }

        csv += '\r\nCLOTURES_Z\r\n';
        csv += ['id_cloture','numero_z_salon','date_cloture','total_encaisse','cumul_perpetuel_ttc','fond_caisse_matin','total_especes_theorique','total_especes_reel','ecart_caisse','justification_ecart','ferme_par','hash_precedent','signature_hash'].join(';') + '\r\n';
        for (const z of cloturesRes.rows) {
            csv += [z.id_cloture, z.numero_z_salon, new Date(z.date_cloture).toISOString().split('T')[0], z.total_encaisse, z.cumul_perpetuel_ttc, z.fond_caisse_matin, z.total_especes_theorique, z.total_especes_reel, z.ecart_caisse, z.justification_ecart || '', z.ferme_par, z.hash_precedent, z.signature_hash]
                .map(echapper).join(';') + '\r\n';
        }

        const mouvementsArchiveRes = await pool.query(
            `SELECT id_mouvement, id_employe, type_mouvement, categorie_comptable, montant, motif, date_creation, hash_precedent, hash_mouvement
             FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) BETWEEN $2 AND $3
             ORDER BY id_mouvement ASC`,
            [id_salon, date_debut, date_fin]
        );

        csv += '\r\nMOUVEMENTS_CAISSE\r\n';
        csv += ['id_mouvement','id_employe','type_mouvement','categorie_comptable','montant','motif','date_creation','hash_precedent','hash_mouvement'].join(';') + '\r\n';
        for (const m of mouvementsArchiveRes.rows) {
            csv += [m.id_mouvement, m.id_employe || '', m.type_mouvement, m.categorie_comptable || '', m.montant, m.motif, new Date(m.date_creation).toISOString(), m.hash_precedent || '', m.hash_mouvement || '']
                .map(echapper).join(';') + '\r\n';
        }

        csv += '\r\nJOURNAL_DES_EVENEMENTS_TECHNIQUES\r\n';
        csv += ['id_jet','action','details','date_creation','hash_precedent','hash_jet'].join(';') + '\r\n';
        for (const j of jetRes.rows) {
            csv += [j.id_jet, j.action, JSON.stringify(j.details), new Date(j.date_creation).toISOString(), j.hash_precedent, j.hash_jet]
                .map(echapper).join(';') + '\r\n';
        }

        const secret = process.env.ARCHIVE_SIGNING_SECRET || process.env.JWT_SECRET;
        const signatureArchive = crypto.createHmac('sha256', secret).update(csv).digest('hex');
        csv += `\r\nSIGNATURE_ARCHIVE;${signatureArchive}\r\n`;

        await enregistrerJET(id_salon, 'EXPORT_ARCHIVE_FISCALE', { date_debut, date_fin, nb_lignes_tickets: ticketsRes.rowCount, nb_lignes_mvt: mouvementsArchiveRes.rowCount, nb_lignes_jet: jetRes.rowCount, signature: signatureArchive });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="archive-fiscale-${id_salon}-${date_debut}_${date_fin}.csv"`);
        res.send('\uFEFF' + csv);

    await enregistrerJET(id_salon, 'EXPORT_ARCHIVE_FISCALE', {
        date_debut,
        date_fin,
        nb_lignes_tickets: ticketsRes.rowCount,
        nb_lignes_mvt: mouvementsArchiveRes.rowCount,
        nb_lignes_jet: jetRes.rowCount,
        signature: signatureArchive
    });

    const nomFichier = `archive-fiscale-${id_salon}-${date_debut}_${date_fin}.csv`;

    return {
        csv: '\uFEFF' + csv,
        nomFichier,
        signature: signatureArchive,
        nbTickets: ticketsRes.rowCount,
        nbMouvements: mouvementsArchiveRes.rowCount,
        nbJet: jetRes.rowCount
    };
}

module.exports = {
    genererArchiveFiscale
};
