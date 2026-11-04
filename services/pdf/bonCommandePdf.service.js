const PDFDocument = require('pdfkit');

/**
 * Génération du bon de commande fournisseur au format PDF
 * @param {Object} salon - Configuration et coordonnées du salon
 * @param {string} fournisseur - Nom du fournisseur destinataire
 * @param {Array} lignes - Articles commandés
 * @param {string} commentaire - Note ou instructions de livraison
 * @returns {Promise<{ buffer: Buffer, numCommande: string }>}
 */
async function genererBufferBonCommandePDF(salon, fournisseur, lignes, commentaire) {
    return new Promise((resolve, reject) => {
        try {
            const nomSalon = salon.nom_salon || 'Salon de Coiffure';
            const adresseSalon = salon.adresse || salon.adresse_salon || '';
            const telSalon = salon.telephone || salon.telephone_salon || '';
            const siretSalon = salon.siret || salon.siret_salon || '';
            const numCommande = `BC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
            const dateJour = new Date().toLocaleDateString('fr-FR');

            const doc = new PDFDocument({ margin: 45, size: 'A4' });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve({ buffer: Buffer.concat(buffers), numCommande }));
            doc.on('error', reject);

            doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827').text('BON DE COMMANDE FOURNISSEUR', { align: 'left' });
            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica').fillColor('#4b5563')
               .text(`N° de commande : ${numCommande}   •   Date : ${dateJour}`)
               .text(`Fournisseur destinataire : ${fournisseur || 'Fournisseur habituel'}`);

            doc.moveDown(1);
            doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(`Émetteur : ${nomSalon}`);
            doc.font('Helvetica').fontSize(9.5).fillColor('#374151');
            if (adresseSalon) doc.text(`Adresse de livraison : ${adresseSalon}`);
            if (siretSalon) doc.text(`SIRET : ${siretSalon}`);
            if (telSalon) doc.text(`Téléphone : ${telSalon}`);

            doc.moveDown(1.2);

            const topTable = doc.y;
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827');
            doc.text('RÉFÉRENCE / EAN', 45, topTable, { width: 130 });
            doc.text('DÉSIGNATION DU PRODUIT', 180, topTable, { width: 250 });
            doc.text('STOCK ACTUEL', 435, topTable, { width: 65, align: 'center' });
            doc.text('QTÉ COMMANDÉE', 500, topTable, { width: 60, align: 'right' });

            doc.moveTo(45, topTable + 15).lineTo(555, topTable + 15).strokeColor('#d1d5db').stroke();

            let y = topTable + 24;
            let totalUnites = 0;

            lignes.forEach((item) => {
                if (y > 740) {
                    doc.addPage();
                    y = 50;
                }
                const qte = parseInt(item.quantite_commande, 10) || 1;
                totalUnites += qte;
                doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9.5).text(String(item.reference || 'SANS-REF').substring(0, 22), 45, y, { width: 130 });
                doc.font('Helvetica').text(String(item.nom || 'Produit').substring(0, 52), 180, y, { width: 250 });
                doc.fillColor('#6b7280').text(String(item.stock_actuel ?? 0), 435, y, { width: 65, align: 'center' });
                doc.fillColor('#111827').font('Helvetica-Bold').text(`${qte}`, 500, y, { width: 60, align: 'right' });
                y += 20;
            });

            doc.moveTo(45, y + 4).lineTo(555, y + 4).strokeColor('#111827').stroke();
            doc.font('Helvetica-Bold').fontSize(11).text(`Total : ${lignes.length} références (${totalUnites} unités commandées)`, 45, y + 12, { align: 'right', width: 510 });

            if (commentaire && String(commentaire).trim()) {
                doc.moveDown(2);
                doc.font('Helvetica-Bold').fontSize(10).text('Note / Instructions de livraison :', 45);
                doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(String(commentaire).trim(), 45);
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    genererBufferBonCommandePDF
};
