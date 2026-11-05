/**
 * Service de gestion des clôtures comptables mensuelles et transmission Brevo
 */

/**
 * Envoie le bilan comptable mensuel (liasse PDF certifiée) par e-mail au comptable du salon
 * @param {Object} deps - { pool, genererBufferLiassePdf }
 * @param {Object} params - { id_salon, mois_annee }
 * @returns {Promise<{ sent: boolean, email?: string, reason?: string }>}
 */
async function envoyerBilanComptable({ pool, genererBufferLiassePdf }, { id_salon, mois_annee = null }) {
    try {
        let moisCible = mois_annee;
        if (!moisCible) {
            const now = new Date();
            let prevM = now.getMonth(); // 0 = Janvier -> mois précédent = 12 (Décembre N-1)
            let prevY = now.getFullYear();
            if (prevM === 0) {
                prevM = 12;
                prevY -= 1;
            }
            moisCible = `${prevY}-${String(prevM).padStart(2, '0')}`;
        }

        // 2. Lecture des paramètres du salon
        const confRes = await pool.query(
            `SELECT nom_salon, email_comptable, email_reception_factures, brevo_api_key
             FROM configuration_salon WHERE id_salon = `,
            [id_salon]
        );
        const conf = confRes.rows[0] || {};
        const emailComptable = (conf.email_comptable || '').trim();

        if (!emailComptable) {
            console.log(`ℹ️ [Compta Salon #${id_salon}] Aucun email_comptable renseigné, envoi ignoré.`);
            return { sent: false, reason: "Aucune adresse e-mail comptable configurée." };
        }

        // 3. Génération du Buffer PDF de la Liasse Mensuelle
        const { buffer, numeroArchive, nomDuSalon, firstDayOfMonth, estMoisCloture } = await genererBufferLiassePdf(id_salon, moisCible);
        const periodeLabel = firstDayOfMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const nomFichierPdf = `Liasse_Comptable_${(nomDuSalon || 'Salon').replace(/[^a-zA-Z0-9_-]/g, '_')}_${moisCible}.pdf`;
        const pdfBase64 = buffer.toString('base64');

        // 4. Clé API Brevo
        const brevoKey = (process.env.BREVO_API_KEY || conf.brevo_api_key || '').trim();
        const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_EXPEDITEUR || 'contact@stack-app.fr').trim();
        const replyToEmail = (conf.email_reception_factures || senderEmail).trim();

        const sujetMail = `${estMoisCloture ? '[CERTIFIÉE NF525]' : '[BROUILLON]'} Liasse Comptable Mensuelle — ${nomDuSalon} (${periodeLabel})`;
        const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 14px;">
                <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">Transmission de la Liasse Comptable Mensuelle</h2>
                <p style="margin: 0 0 16px 0; font-size: 13.5px; color: #4b5563;">
                    Bonjour,<br/><br/>
                    Veuillez trouver ci-joint la liasse comptable mensuelle de l'établissement <strong>${nomDuSalon}</strong> pour la période de <strong>${periodeLabel}</strong>.
                </p>
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; font-size: 12.5px; color: #374151; margin-bottom: 16px;">
                    <div><strong>Établissement :</strong> ${nomDuSalon}</div>
                    <div><strong>Période :</strong> ${periodeLabel} (${moisCible})</div>
                    <div><strong>Statut du document :</strong> ${estMoisCloture ? 'DÉFINITIF — Certifié, signé par le dirigeant et scellé SHA-256 (NF525)' : 'Brouillon provisoire'}</div>
                    <div><strong>Référence d'archive :</strong> ${numeroArchive}</div>
                </div>
                <p style="margin: 0; font-size: 12px; color: #6b7280;">
                    Ce document inclut la ventilation du chiffre d'affaires HT/TVA/TTC, le rapprochement bancaire et de caisse espèces, le journal des dépenses ventilé par compte PCG, les variables de paie RH et l'historique des clôtures Z scellées NF525.
                </p>
            </div>
        `;

        // 5. Envoi via HTTPS (Port 443 — Jamais bloqué par Render)
        if (brevoKey) {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': brevoKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: `${nomDuSalon} (via STACK Compta)`, email: senderEmail },
                    replyTo: { email: replyToEmail, name: nomDuSalon },
                    to: [{ email: emailComptable, name: 'Expert-Comptable' }],
                    subject: sujetMail,
                    htmlContent: htmlBody,
                    attachment: [
                        {
                            name: nomFichierPdf,
                            content: pdfBase64
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`❌ [Brevo HTTP API] Échec envoi liasse salon #${id_salon}:`, errText);
                return { sent: false, reason: `Erreur API Brevo (${response.status})` };
            }

            console.log(`✅ [Brevo HTTP API] Liasse ${moisCible} envoyée avec succès à ${emailComptable} (Salon #${id_salon})`);
            return { sent: true, email: emailComptable };
        }

        console.warn(`⚠️ [Compta Salon #${id_salon}] Aucune clé BREVO_API_KEY trouvée sur Render ou dans les paramètres du salon.`);
        return { sent: false, reason: "Clé API Brevo manquante." };
    } catch (err) {
        console.error(`❌ Erreur envoyerBilanComptable (Salon #${id_salon}):`, err.message);
        return { sent: false, reason: err.message };
    }
}

/**
 * Valide, scelle cryptographiquement (NF525) et transmet la liasse comptable mensuelle
 */
async function validerClotureMensuelle({ pool, bcrypt, crypto, enregistrerJET, stockerImageSurR2, genererBufferLiassePdf }, { id_salon, role, mois_annee, code_pin, signature_base64 }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut valider et signer la liasse comptable.");
        err.status = 403;
        throw err;
    }
    if (!mois_annee || !/^\d{4}-\d{2}$/.test(mois_annee)) {
        const err = new Error("Format de période invalide (YYYY-MM attendu).");
        err.status = 400;
        throw err;
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon =  FOR UPDATE', [id_salon]);

        const [yearStr, monthStr] = mois_annee.split('-');
        const firstDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
        const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0);
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDay);
        const dateFinStr = formatYMD(lastDay);

        // 1. BLOCAGE STRICT : Vérification des factures en attente
        const tachesEnAttente = await clientDB.query(`SELECT 1 FROM ia_taches_attente WHERE id_salon =  AND type_tache = 'FACTURE_ACHAT' AND statut = 'ATTENTE'`, [id_salon]);
        if (tachesEnAttente.rowCount > 0) {
            await clientDB.query('ROLLBACK');
            const err = new Error(`Signature bloquée : Il vous reste ${tachesEnAttente.rowCount} facture(s) "À valider" dans l'application. Veuillez les traiter avant de clôturer le mois.`);
            err.status = 400;
            throw err;
        }

        // 2. BLOCAGE STRICT NF525 : Toutes les journées ayant eu des tickets sur le mois doivent avoir leur Z clôturé
        const joursSansZ = await clientDB.query(`
            SELECT MIN(DATE(t.date_creation)) as jour_manquant
            FROM tickets t
            WHERE t.id_salon =  AND DATE(t.date_creation) BETWEEN  AND 
              AND NOT EXISTS (
                  SELECT 1 FROM clotures_caisse c
                  WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
              )
        `, [id_salon, dateDebutStr, dateFinStr]);
        if (joursSansZ.rowCount > 0 && joursSansZ.rows[0].jour_manquant) {
            await clientDB.query('ROLLBACK');
            const err = new Error(`Signature bloquée (NF525) : La journée du ${new Date(joursSansZ.rows[0].jour_manquant).toLocaleDateString('fr-FR')} n'a pas fait l'objet d'une clôture Z.`);
            err.status = 400;
            throw err;
        }

        // 3. BLOCAGE STRICT NF525 : Aucune clôture automatique en attente de régularisation sur la période
        const zAutoEnAttente = await clientDB.query(`
            SELECT TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_z
            FROM clotures_caisse
            WHERE id_salon =  AND DATE(date_cloture) BETWEEN  AND  AND est_cloture_automatique = TRUE
            LIMIT 1
        `, [id_salon, dateDebutStr, dateFinStr]);
        if (zAutoEnAttente.rowCount > 0) {
            await clientDB.query('ROLLBACK');
            const err = new Error(`Signature bloquée (NF525) : La clôture automatique du ${zAutoEnAttente.rows[0].date_z} doit d'abord être régularisée.`);
            err.status = 400;
            throw err;
        }

        const empRes = await clientDB.query("SELECT nom, code_pin FROM employes WHERE id_salon =  AND est_gerant = TRUE LIMIT 1", [id_salon]);
        if (empRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            const err = new Error("Gérant introuvable.");
            err.status = 404;
            throw err;
        }
        
        const gerant = empRes.rows[0];
        let pinMatch = false;
        if (gerant.code_pin && gerant.code_pin.startsWith('')) {
            pinMatch = await bcrypt.compare(code_pin, gerant.code_pin);
        } else {
            pinMatch = (gerant.code_pin === code_pin);
        }

        if (!pinMatch) {
            await clientDB.query('ROLLBACK');
            const err = new Error("Code PIN incorrect. Signature refusée.");
            err.status = 400;
            throw err;
        }

        // Calcul des totaux mensuels figés et chaînage cryptographique mensuel NF525
        const confRes = await clientDB.query('SELECT tva_intra FROM configuration_salon WHERE id_salon = ', [id_salon]);
        const franchiseTVA = !confRes.rows[0]?.tva_intra || confRes.rows[0].tva_intra.trim() === '';

        const caMoisRes = await clientDB.query(`
            SELECT COALESCE(lt.taux_tva_snapshot, 20) as taux_tva, COALESCE(SUM(lt.total_ligne_ttc), 0) as total_ttc
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon =  AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN  AND 
            GROUP BY COALESCE(lt.taux_tva_snapshot, 20)
        `, [id_salon, dateDebutStr, dateFinStr]);

        let moisHtCents = 0, moisTvaCents = 0, moisTtcCents = 0;
        caMoisRes.rows.forEach(r => {
            const ttcC = Math.round((parseFloat(r.total_ttc) || 0) * 100);
            const taux = franchiseTVA ? 0 : (parseFloat(r.taux_tva) || 0);
            const htC = franchiseTVA ? ttcC : Math.round(ttcC / (1 + taux / 100));
            moisHtCents += htC;
            moisTvaCents += (ttcC - htC);
            moisTtcCents += ttcC;
        });

        const totalHT = (moisHtCents / 100).toFixed(2);
        const totalTVA = (moisTvaCents / 100).toFixed(2);
        const totalTTC = (moisTtcCents / 100).toFixed(2);

        const dernierZMois = await clientDB.query(`
            SELECT COALESCE(cumul_perpetuel_ttc, 0) as cumul
            FROM clotures_caisse
            WHERE id_salon =  AND DATE(date_cloture) <= 
            ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon, dateFinStr]);
        const cumulPerpetuel = Number(dernierZMois.rows[0]?.cumul || 0).toFixed(2);

        await clientDB.query(`ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS signature_base64 TEXT`);

        const prevLiasse = await clientDB.query(`
            SELECT signature_hash FROM liasses_mensuelles_validees
            WHERE id_salon =  AND signature_hash IS NOT NULL
            ORDER BY id_validation DESC LIMIT 1 FOR UPDATE
        `, [id_salon]);
        const hashPrecedent = prevLiasse.rowCount > 0 ? prevLiasse.rows[0].signature_hash : 'GENESIS_LIASSE';
        const dateValISO = new Date().toISOString();
        const signatureHash = crypto.createHash('sha256')
            .update(`LIASSE-${id_salon}-${mois_annee}-${totalHT}-${totalTVA}-${totalTTC}-${cumulPerpetuel}-${gerant.nom}-${dateValISO}-${hashPrecedent}`)
            .digest('hex');

        const signaturePropre = (signature_base64 && typeof signature_base64 === 'string' && signature_base64.startsWith('data:image/'))
            ? signature_base64
            : null;
        const hashSignatureManuscrite = signaturePropre
            ? crypto.createHash('sha256').update(signaturePropre).digest('hex')
            : null;
        const signatureStockeeR2 = (signaturePropre && stockerImageSurR2)
            ? await stockerImageSurR2(signaturePropre, id_salon, 'signatures')
            : null;

        await clientDB.query(
            `INSERT INTO liasses_mensuelles_validees (id_salon, mois_annee, date_validation, valide_par, total_ht, total_tva, total_ttc, cumul_perpetuel_ttc, hash_precedent, signature_hash, signature_base64)
             VALUES (, , , , , , , , , , )
             ON CONFLICT (id_salon, mois_annee) DO UPDATE
             SET signature_base64 = COALESCE(liasses_mensuelles_validees.signature_base64, EXCLUDED.signature_base64)`,
            [id_salon, mois_annee, dateValISO, gerant.nom, totalHT, totalTVA, totalTTC, cumulPerpetuel, hashPrecedent, signatureHash, signatureStockeeR2]
        );

        await enregistrerJET(id_salon, 'CLOTURE_MENSUELLE_SCELLEE', {
            mois_annee,
            total_ht: totalHT,
            total_tva: totalTVA,
            total_ttc: totalTTC,
            cumul_perpetuel_ttc: cumulPerpetuel,
            valide_par: gerant.nom,
            signature_hash: signatureHash,
            empreinte_signature_manuscrite: hashSignatureManuscrite
        }, clientDB);

        await clientDB.query('COMMIT');

        // Déclenche l'envoi immédiat au comptable
        await envoyerBilanComptable({ pool, genererBufferLiassePdf }, { id_salon, mois_annee });

        return {
            message: "Liasse validée, signée et transmise à l'expert-comptable avec succès.",
            signature_hash: signatureHash
        };
    } finally {
        clientDB.release();
    }
}

/**
 * Récupère le statut de validation de la liasse comptable du mois
 */
async function obtenirStatutMois({ pool }, { id_salon, mois_annee }) {
    const result = await pool.query(
        'SELECT valide_par, date_validation FROM liasses_mensuelles_validees WHERE id_salon =  AND mois_annee = ',
        [id_salon, mois_annee]
    );
    return {
        valide: result.rowCount > 0,
        infos: result.rowCount > 0 ? result.rows[0] : null
    };
}

module.exports = {
    envoyerBilanComptable,
    validerClotureMensuelle,
    obtenirStatutMois
};
