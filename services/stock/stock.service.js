/**
 * Service de gestion des stocks, du catalogue et des approvisionnements fournisseurs
 */

/**
 * Calcul de la prévision d'épuisement des stocks et de la vitesse d'écoulement sur 30 jours
 * (Prend en compte la consommation directe au ticket + la consommation des recettes techniques de l'Académie)
 *
 * @param {Object} deps - { pool }
 * @param {number} id_salon
 * @returns {Promise<Array>}
 */
async function calculerPrevisionStocks({ pool }, id_salon) {
    const stockResult = await pool.query(`
        WITH ConsommationDirecte AS (
            SELECT lt.id_article, SUM(lt.quantite) as qte
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE lt.id_salon =  AND t.statut != 'ANNULE' AND t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE
              AND t.date_creation >= NOW() - INTERVAL '30 days'
            GROUP BY lt.id_article
        ),
        ConsommationRecettes AS (
            SELECT ra.id_article, SUM(ra.quantite_necessaire * lt.quantite) as qte
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            JOIN protocoles p ON p.id_salon =  AND TRIM(p.nom_prestation) ILIKE TRIM(lt.nom_article_snapshot)
            JOIN recettes_articles ra ON ra.id_protocole = p.id_protocole
            WHERE lt.id_salon =  AND t.statut != 'ANNULE' AND t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE
              AND t.date_creation >= NOW() - INTERVAL '30 days'
            GROUP BY ra.id_article
        ),
        ConsommationTotale AS (
            SELECT id_article, SUM(qte) as total_30j FROM (
                SELECT * FROM ConsommationDirecte UNION ALL SELECT * FROM ConsommationRecettes
            ) x GROUP BY id_article
        )
        SELECT c.id_article, c.nom, c.stock_actuel, c.seuil_alerte, c.type_article,
               COALESCE(ct.total_30j, 0) as consommation_30j
        FROM catalogue c
        LEFT JOIN ConsommationTotale ct ON ct.id_article = c.id_article
        WHERE c.id_salon =  AND c.type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE')
        ORDER BY c.nom ASC
    `, [id_salon]);

    return stockResult.rows.map(p => {
        const vitesseJour = parseFloat(p.consommation_30j) / 30;
        const stockActuel = parseFloat(p.stock_actuel);
        let joursRestants = null;
        let dateRuptureProjetee = null;
        if (vitesseJour > 0) {
            joursRestants = Math.floor(stockActuel / vitesseJour);
            const d = new Date();
            d.setDate(d.getDate() + joursRestants);
            dateRuptureProjetee = d.toISOString().slice(0, 10);
        }
        return {
            ...p,
            vitesse_jour: Math.round(vitesseJour * 100) / 100,
            jours_restants: joursRestants,
            date_rupture_prevue: dateRuptureProjetee
        };
    });
}

/**
 * Création ou réapprovisionnement automatique d'un article dans le catalogue
 */
async function creerOuReapproArticle({ pool, enregistrerJET }, { id_salon, role, body }) {
    if (role === 'employe') {
        const err = new Error("Modification du catalogue réservée au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    const { nom, type_article, prix, stock_actuel, reference, taux_tva, delai_livraison_jours, duree_estimee_minutes } = body;

    const typeArticleFormatte = type_article || 'PRESTATION'; 
    const prixFormatte = parseFloat((prix || "0").toString().replace(',', '.')) || 0; 
    const stockFormatte = parseInt(stock_actuel) || 0; 
    const refFormattee = reference ? reference.trim() : null; 
    const tvaFormattee = (taux_tva !== undefined && taux_tva !== null && taux_tva !== '') ? parseFloat(taux_tva.toString().replace(',', '.')) : 20.00; 
    const delaiFormatte = parseInt(delai_livraison_jours) || 3;

    if (typeArticleFormatte === 'PRODUIT_REVENTE') { 
        if (!refFormattee || refFormattee.length < 4) {
            const err = new Error("Réf valide requise.");
            err.status = 400;
            throw err;
        } 
    } 
    
    const checkQuery = `SELECT * FROM catalogue WHERE (nom ILIKE  OR (reference =  AND reference IS NOT NULL)) AND id_salon = `; 
    const checkResult = await pool.query(checkQuery, [nom, refFormattee, id_salon]); 
    
    if (checkResult.rowCount > 0) { 
        const art = checkResult.rows[0]; 
        if (refFormattee && art.reference === refFormattee && typeArticleFormatte === 'PRODUIT_REVENTE') { 
            if (!nom || nom.trim() === '') { 
                await pool.query('UPDATE catalogue SET stock_actuel = stock_actuel +  WHERE id_article = ', [stockFormatte, art.id_article]); 
                await enregistrerJET(id_salon, 'MODIFICATION_ARTICLE', { id_article: art.id_article, action: 'REAPPRO_STOCK', ajout: stockFormatte }); 
                return { status: 200, message: `Stock mis à jour (+${stockFormatte})` }; 
            } else if (nom.trim().toLowerCase() !== art.nom.toLowerCase()) { 
                const err = new Error("Référence déjà utilisée.");
                err.status = 400;
                throw err;
            } 
        } 
        if (art.nom.toLowerCase() === nom.trim().toLowerCase()) { 
            const err = new Error("L'article existe déjà.");
            err.status = 400;
            throw err;
        } 
    } 
    
    const dureeFormattee = parseInt(duree_estimee_minutes) || 30;
    const inserted = await pool.query(
        'INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, taux_tva, delai_livraison_jours, duree_estimee_minutes, id_salon) VALUES (, , , , , , , , ) RETURNING id_article',
        [nom, typeArticleFormatte, prixFormatte, stockFormatte, refFormattee, tvaFormattee, delaiFormatte, dureeFormattee, id_salon]
    );
    await enregistrerJET(id_salon, 'CREATION_ARTICLE', { id_article: inserted.rows[0].id_article, nom, type_article: typeArticleFormatte, prix: prixFormatte, taux_tva: tvaFormattee }); 
    return { status: 201, message: "Article ajouté avec succès !" };
}

/**
 * Suppression d'un article du catalogue avec journalisation JET
 */
async function supprimerArticle({ pool, enregistrerJET }, { id_salon, role, id_article }) {
    if (role === 'employe') {
        const err = new Error("Suppression réservée au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    const articleRes = await pool.query('SELECT nom, type_article, prix FROM catalogue WHERE id_article =  AND id_salon = ', [id_article, id_salon]);
    await pool.query('DELETE FROM catalogue WHERE id_article =  AND id_salon = ', [id_article, id_salon]);
    if (articleRes.rowCount > 0) {
        await enregistrerJET(id_salon, 'SUPPRESSION_ARTICLE', { id_article, ...articleRes.rows[0] });
    }
    return { message: "Article supprimé" };
}

/**
 * Renommage d'un article du catalogue avec détection de doublons et journalisation JET
 */
async function renommerArticle({ pool, enregistrerJET }, { id_salon, role, id_article, nouveauNom }) {
    if (role === 'employe') {
        const err = new Error("Modification réservée au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    const nomPropre = (nouveauNom || '').trim();
    if (!nomPropre) {
        const err = new Error("Le nom ne peut pas être vide.");
        err.status = 400;
        throw err;
    }
    const doublon = await pool.query('SELECT 1 FROM catalogue WHERE id_salon =  AND id_article !=  AND nom ILIKE ', [id_salon, id_article, nomPropre]);
    if (doublon.rowCount > 0) {
        const err = new Error("Une prestation porte déjà ce nom.");
        err.status = 400;
        throw err;
    }
    const result = await pool.query('UPDATE catalogue SET nom =  WHERE id_article =  AND id_salon =  RETURNING id_article', [nomPropre, id_article, id_salon]);
    if (result.rowCount === 0) {
        const err = new Error("Article introuvable.");
        err.status = 404;
        throw err;
    }
    await enregistrerJET(id_salon, 'MODIFICATION_ARTICLE', { id_article, action: 'RENOMMAGE', nouveau_nom: nomPropre });
    return { message: "Nom mis à jour." };
}

/**
 * Correction manuelle du niveau de stock d'un produit avec journalisation JET
 */
async function corrigerStock({ pool, enregistrerJET }, { id_salon, role, id_article, nouveauStock }) {
    if (role === 'employe') {
        const err = new Error("Correction du stock réservée au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    const qte = parseInt(nouveauStock, 10);
    if (isNaN(qte) || qte < 0) {
        const err = new Error("Quantité invalide.");
        err.status = 400;
        throw err;
    }
    const result = await pool.query('UPDATE catalogue SET stock_actuel =  WHERE id_article =  AND id_salon =  RETURNING id_article', [qte, id_article, id_salon]);
    if (result.rowCount === 0) {
        const err = new Error("Produit introuvable.");
        err.status = 404;
        throw err;
    }
    await enregistrerJET(id_salon, 'MODIFICATION_ARTICLE', { id_article, action: 'CORRECTION_STOCK', nouvelle_valeur: qte });
    return { message: "Stock mis à jour." };
}

/**
 * Fusion et dédoublonnage de produits de stock avec sécurisation par code PIN et report des recettes
 */
async function fusionnerStocks({ pool, enregistrerJET, verifierPinActionSensibleSalon }, { id_salon, role, req, body }) {
    if (role === 'employe') {
        const err = new Error("La fusion des stocks est réservée au gérant et au poste Salon.");
        err.status = 403;
        throw err;
    }
    const { ids_articles, nom, reference, prix, type_article, delai_livraison_jours, id_employe, code_pin } = body;

    if (!Array.isArray(ids_articles) || ids_articles.length < 2) {
        const err = new Error("Sélectionnez au moins 2 produits à unifier.");
        err.status = 400;
        throw err;
    }
    if (!nom || !String(nom).trim()) {
        const err = new Error("Le nom du produit unifié est requis.");
        err.status = 400;
        throw err;
    }

    let operateurValide;
    try {
        operateurValide = await verifierPinActionSensibleSalon(req, {
            id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
            nom_operateur: id_employe === 'gerant' ? 'Gérant' : null,
            code_pin,
            action_label: 'Fusion de stocks'
        });
    } catch (pinErr) {
        const err = new Error(pinErr.message);
        err.status = 400;
        err.details = {
            require_pin: true,
            tentatives: pinErr.tentatives,
            locked_until: pinErr.locked_until,
            locked_permanent: pinErr.locked_permanent
        };
        throw err;
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const idsClean = ids_articles.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
        const articlesRes = await clientDB.query(
            'SELECT id_article, nom, stock_actuel, prix, reference, type_article, delai_livraison_jours FROM catalogue WHERE id_salon =  AND id_article = ANY(::int[]) FOR UPDATE',
            [id_salon, idsClean]
        );
        if (articlesRes.rowCount < 2) throw new Error("Les produits sélectionnés sont introuvables.");

        const idMaitre = idsClean[0];
        const idsDoublons = idsClean.slice(1);
        const stockTotal = articlesRes.rows.reduce((sum, a) => sum + (parseInt(a.stock_actuel, 10) || 0), 0);
        const artMaitre = articlesRes.rows.find(a => a.id_article === idMaitre) || articlesRes.rows[0];

        const nomFinal = String(nom).trim();
        const refFinale = reference && String(reference).trim() !== '' ? String(reference).trim() : (artMaitre.reference || null);
        const prixFinal = (prix !== undefined && prix !== '' && !isNaN(parseFloat(prix))) ? parseFloat(String(prix).replace(',', '.')) : (parseFloat(artMaitre.prix) || 0);
        const typeFinal = type_article || artMaitre.type_article || 'PRODUIT_REVENTE';
        const delaiFinal = parseInt(delai_livraison_jours, 10) || artMaitre.delai_livraison_jours || 3;

        // Mise à jour des recettes de l'Académie pour pointer vers l'article maître
        await clientDB.query(
            'UPDATE recettes_articles SET id_article =  WHERE id_article = ANY(::int[])',
            [idMaitre, idsDoublons]
        );

        // Mise à jour de l'article maître avec la somme des stocks
        await clientDB.query(
            'UPDATE catalogue SET nom = , reference = , prix = , type_article = , stock_actuel = , delai_livraison_jours =  WHERE id_article =  AND id_salon = ',
            [nomFinal, refFinale, prixFinal, typeFinal, stockTotal, delaiFinal, idMaitre, id_salon]
        );

        // Suppression des doublons (ou archivage hors stock si liés à d'anciennes lignes_ticket scellées NF525)
        await clientDB.query(
            'DELETE FROM catalogue WHERE id_salon =  AND id_article = ANY(::int[]) AND id_article NOT IN (SELECT DISTINCT id_article FROM lignes_ticket WHERE id_salon =  AND id_article IS NOT NULL)',
            [id_salon, idsDoublons]
        );
        await clientDB.query(
            "UPDATE catalogue SET type_article = 'ARCHIVE_FUSION', stock_actuel = 0, reference = NULL WHERE id_salon =  AND id_article = ANY(::int[])",
            [id_salon, idsDoublons]
        );

        await enregistrerJET(id_salon, 'FUSION_ARTICLES_STOCK', {
            operateur: operateurValide.nom,
            id_employe: operateurValide.id_employe,
            id_article_maitre: idMaitre,
            ids_supprimes: idsDoublons,
            nom_unifie: nomFinal,
            stock_total_unifie: stockTotal
        }, clientDB);

        await clientDB.query('COMMIT');
        return {
            message: `${articlesRes.rowCount} produits unifiés avec succès (Stock total : ${stockTotal}).`,
            stock_total: stockTotal
        };
    } catch (dbErr) {
        await clientDB.query('ROLLBACK');
        throw dbErr;
    } finally {
        clientDB.release();
    }
}

/**
 * Envoi d'une commande de réassort fournisseur par e-mail avec pièce jointe PDF
 */
async function envoyerCommandeFournisseur({ pool, genererBufferBonCommandePDF, transporter }, { id_salon, role, body }) {
    if (role === 'employe') {
        const err = new Error("Réservé au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    const { email_fournisseur, fournisseur, lignes, commentaire } = body;
    if (!email_fournisseur || !String(email_fournisseur).includes('@')) {
        const err = new Error("Adresse e-mail du fournisseur invalide.");
        err.status = 400;
        throw err;
    }
    if (!Array.isArray(lignes) || lignes.length === 0) {
        const err = new Error("Aucun produit sélectionné.");
        err.status = 400;
        throw err;
    }

    const salonRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = ', [id_salon]);
    const salon = salonRes.rows[0] || {};
    const nomSalon = salon.nom_salon || 'Notre Salon';
    const adresseSalon = salon.adresse || salon.adresse_salon || '';
    const telSalon = salon.telephone || salon.telephone_salon || '';
    const siretSalon = salon.siret || salon.siret_salon || '';
    const dateJour = new Date().toLocaleDateString('fr-FR');

    const { buffer, numCommande } = await genererBufferBonCommandePDF(salon, fournisseur, lignes, commentaire);

    const lignesHtml = lignes.map(l =>
        `<tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-weight:bold;">${l.reference || 'SANS-REF'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${l.nom}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold;">${l.quantite_commande}</td>
        </tr>`
    ).join('');

    const sujetMail = `Bon de commande ${numCommande} — ${nomSalon} (${dateJour})`;
    const corpsHtml = `
        <div style="font-family:sans-serif;color:#111827;max-width:620px;">
            <h2 style="margin-bottom:4px;">Bon de commande — ${nomSalon}</h2>
            <p style="color:#4b5563;font-size:14px;">Bonjour ${fournisseur || ''},<br/>Veuillez trouver ci-joint et ci-dessous notre commande de réassort du ${dateJour} :</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13.5px;">
                <thead>
                    <tr style="background:#f3f4f6;text-align:left;">
                        <th style="padding:8px 10px;">Référence</th>
                        <th style="padding:8px 10px;">Produit</th>
                        <th style="padding:8px 10px;text-align:right;">Quantité</th>
                    </tr>
                </thead>
                <tbody>${lignesHtml}</tbody>
            </table>
            ${commentaire ? `<p style="font-size:13px;background:#f9fafb;padding:10px;border-radius:8px;"><strong>Note :</strong> ${commentaire}</p>` : ''}
            <p style="font-size:12.5px;color:#6b7280;margin-top:20px;">
                <strong>${nomSalon}</strong><br/>
                ${adresseSalon} ${telSalon ? `• Tél : ${telSalon}` : ''} ${siretSalon ? `• SIRET : ${siretSalon}` : ''}
            </p>
        </div>
    `;

    // 1. Envoi via l'API Brevo
    if (process.env.BREVO_API_KEY) {
        const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || process.env.EMAIL_EXPEDITEUR || process.env.EMAIL_USER || process.env.SMTP_USER || 'tardy.valentin04@gmail.com';
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: nomSalon, email: senderEmail },
                to: [{ email: email_fournisseur.trim() }],
                subject: sujetMail,
                htmlContent: corpsHtml,
                attachment: [
                    {
                        name: `${numCommande}.pdf`,
                        content: buffer.toString('base64')
                    }
                ]
            })
        });

        if (brevoRes.ok) {
            return { message: `Bon de commande PDF envoyé par mail à ${email_fournisseur} !` };
        } else {
            const errBrevo = await brevoRes.text();
            console.error("Erreur Brevo API :", errBrevo);
        }
    }

    // 2. Fallback Nodemailer
    if (typeof transporter !== 'undefined' && transporter?.sendMail) {
        await transporter.sendMail({
            from: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER,
            to: email_fournisseur.trim(),
            subject: sujetMail,
            html: corpsHtml,
            attachments: [{ filename: `${numCommande}.pdf`, content: buffer }]
        });
        return { message: `Bon de commande envoyé à ${email_fournisseur} !` };
    }

    // 3. Fallback client mailto
    return {
        fallback_mailto: true,
        sujet: sujetMail,
        message: "Ouverture de votre messagerie avec la commande pré-remplie."
    };
}

/**
 * Enregistre la vérification physique des stocks
 */
async function enregistrerVerificationStock({ pool }, { id_salon, role }) {
    if (!['gerant', 'salon'].includes(role)) {
        const err = new Error("Réservé au gérant et au salon.");
        err.status = 403;
        throw err;
    }
    await pool.query('UPDATE configuration_salon SET derniere_verif_stock = CURRENT_DATE WHERE id_salon = ', [id_salon]);
    return { message: "Vérification des stocks enregistrée." };
}

module.exports = {
    calculerPrevisionStocks,
    creerOuReapproArticle,
    supprimerArticle,
    renommerArticle,
    corrigerStock,
    fusionnerStocks,
    envoyerCommandeFournisseur,
    enregistrerVerificationStock
};
