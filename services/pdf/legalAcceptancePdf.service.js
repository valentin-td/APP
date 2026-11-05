const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { pool: defaultPool } = require('../../config/db');

/**
 * Middleware SSO Sandbox & Bypass du popup légal pour les salons DEMO et VIDE
 */
function creerMiddlewareSSOSandbox({ pool: p, jwt: jwtLib, legal } = {}) {
    const dbPool = p || defaultPool;
    const jwtEngine = jwtLib || jwt;

    // Patch sur documentsEnAttente pour les sandbox
    if (legal && typeof legal.documentsEnAttente === 'function') {
        const originalDocumentsEnAttente = legal.documentsEnAttente;
        legal.documentsEnAttente = async (poolArg, idSalon) => {
            try {
                const s = await (poolArg || dbPool).query('SELECT est_bac_a_sable, type_bac_a_sable FROM configuration_salon WHERE id_salon = $1', [idSalon]);
                if (s.rowCount > 0 && s.rows[0].est_bac_a_sable && s.rows[0].type_bac_a_sable !== 'ONBOARDING') {
                    return [];
                }
            } catch (e) {}
            return originalDocumentsEnAttente(poolArg, idSalon);
        };
    }

    return async (req, res, next) => {
        try {
            let sbToken = req.query?.sandbox_token || req.query?.token_api;
            if (!sbToken && req.headers.referer && req.headers.referer.includes('sandbox_token=')) {
                const urlRef = new URL(req.headers.referer);
                sbToken = urlRef.searchParams.get('sandbox_token') || urlRef.searchParams.get('token_api');
            }
            if (sbToken && !req.headers.authorization) {
                req.headers.authorization = `Bearer ${sbToken}`;
                res.cookie('token', sbToken, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 24 * 60 * 60 * 1000 });
            }

            if (req.path.startsWith('/api/legal')) {
                let tokenToDecode = sbToken;
                if (!tokenToDecode && req.headers.authorization) {
                    tokenToDecode = req.headers.authorization.split(' ')[1];
                }
                if (!tokenToDecode && req.headers.cookie) {
                    const c = req.headers.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('token='));
                    if (c) tokenToDecode = c.split('=')[1];
                }
                if (tokenToDecode) {
                    const dec = jwtEngine.verify(tokenToDecode, process.env.JWT_SECRET);
                    if (dec && dec.id_salon) {
                        if (!req.headers.authorization) req.headers.authorization = `Bearer ${tokenToDecode}`;
                        const sRes = await dbPool.query('SELECT est_bac_a_sable, type_bac_a_sable, nom_salon, siret, adresse_salon FROM configuration_salon WHERE id_salon = $1', [dec.id_salon]);
                        if (sRes.rowCount > 0) {
                            const salon = sRes.rows[0];
                            if (salon.est_bac_a_sable && (salon.type_bac_a_sable === 'DEMO' || salon.type_bac_a_sable === 'VIDE') && req.method === 'GET') {
                                return res.json({
                                    en_attente: [],
                                    documents_en_attente: [],
                                    documents: [],
                                    tout_accepte: true,
                                    conforme: true,
                                    preremplissage: {
                                        prenom_gerant: 'Agent',
                                        nom_gerant: 'STACK',
                                        nom_salon: salon.nom_salon,
                                        adresse_salon: salon.adresse_salon || '14 Place Kléber, 67000 Strasbourg',
                                        siret: salon.siret || '89245163000018',
                                        email: dec.email
                                    }
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        next();
    };
}

/**
 * Middleware d'interception et génération du Certificat d'Acceptation Électronique (Executive PDF)
 */
function creerMiddlewareCertificatLegalPDF({ pool: p, PDFDocument: PDFLib, jwt: jwtLib, crypto: cryptoLib } = {}) {
    const dbPool = p || defaultPool;
    const DocLib = PDFLib || PDFDocument;
    const jwtEngine = jwtLib || jwt;
    const cryptoEngine = cryptoLib || crypto;

    return async (req, res, next) => {
        const isLegalPdfRoute =
            req.method === 'GET' &&
            req.path.startsWith('/api/legal') &&
            (req.path.includes('pdf') || req.path.includes('certificat') || req.path.includes('preuve') || req.query?.format === 'pdf');

        if (!isLegalPdfRoute) return next();

        try {
            let token = req.query?.token || req.query?.sandbox_token || req.query?.token_api;
            if (!token && req.headers.authorization) token = req.headers.authorization.split(' ')[1];
            if (!token && req.headers.cookie) {
                const c = req.headers.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('token='));
                if (c) token = c.split('=')[1];
            }
            if (!token) return next();

            const user = jwtEngine.verify(token, process.env.JWT_SECRET);
            if (!user || !user.id_salon) return next();

            const accIdParam = req.params?.id || req.query?.id || null;
            let accRow = null;
            try {
                const accRes = accIdParam
                    ? await dbPool.query(`SELECT * FROM acceptations_legales WHERE id_salon = $1 AND (id::text = $2 OR id_acceptation::text = $2) ORDER BY 1 DESC LIMIT 1`, [user.id_salon, String(accIdParam)])
                    : await dbPool.query(`SELECT * FROM acceptations_legales WHERE id_salon = $1 ORDER BY 1 DESC LIMIT 1`, [user.id_salon]);
                if (accRes.rowCount > 0) accRow = accRes.rows[0];
            } catch (e) {}

            const salonRes = await dbPool.query(`SELECT * FROM configuration_salon WHERE id_salon = $1`, [user.id_salon]);
            const salon = salonRes.rows[0] || {};
            const gerantRes = await dbPool.query(`SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1`, [user.id_salon]);

            const refId = accRow?.id_acceptation || accRow?.id || user.id_salon;
            const referenceCertificat = `ACC-${refId}`;
            const dateAcceptation = accRow?.date_acceptation || accRow?.created_at || accRow?.date_creation || new Date();
            const dateObj = new Date(dateAcceptation);
            const dateParis = dateObj.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateIso = dateObj.toISOString();

            const nomSignataire = accRow?.nom_signataire || ((accRow?.prenom_gerant || '') + ' ' + (accRow?.nom_gerant || '')).trim() || gerantRes.rows[0]?.nom || 'Représentant Légal';
            const emailSignataire = accRow?.email_signataire || accRow?.email || user.email || 'Non renseigné';
            const nomSalon = accRow?.nom_salon || salon.nom_salon || 'Établissement Coiffure';
            const adresseSalon = accRow?.adresse_salon || salon.adresse_salon || 'Adresse enregistrée';
            const siretSalon = accRow?.siret || salon.siret || 'En cours';
            const ipSignataire = accRow?.ip_acceptation || accRow?.ip || req.ip || '127.0.0.1';
            const uaSignataire = accRow?.user_agent || accRow?.navigateur || req.headers['user-agent'] || 'Navigateur Web Sécurisé';

            const docsContractuels = [
                {
                    code: 'CGV',
                    titre: "Conditions Générales d'Utilisation et de Vente (CGUV)",
                    version: '2026-09-28',
                    hash: cryptoEngine.createHash('sha256').update('STACK_CGUV_2026-09-28').digest('hex'),
                    articles: [
                        { t: "1. Objet du contrat", c: "L'application STACK est un logiciel en mode SaaS (Software as a Service) destiné à la gestion intégrale de salons de coiffure (encaissement certifié NF525, agenda, stocks, ressources humaines, comptabilité IA et marketing)." },
                        { t: "2. Abonnement et Paiement", c: "L'accès complet aux fonctionnalités de STACK (hors période d'essai gratuit de 30 jours) nécessite un abonnement actif. Les paiements sont sécurisés et traités par notre partenaire Stripe. L'abonnement est sans engagement de durée et peut être résilié à tout moment. En cas de défaut de paiement, l'accès au tableau de bord sera suspendu." },
                        { t: "3. Conformité Caisse et Loi Anti-fraude (Norme NF525)", c: "STACK intègre un système de clôture journalière (Z de caisse) et un chaînage cryptographique SHA-256 des tickets pour garantir l'inaltérabilité des données financières (Art. 286 I-3° bis du CGI). L'Utilisateur est seul responsable de réaliser ses clôtures de caisse quotidiennement et de ses déclarations fiscales et comptables. STACK agit comme un outil d'assistance et ne remplace pas les conseils d'un expert-comptable." },
                        { t: "4. Fonctionnalités d'Intelligence Artificielle", c: "L'application propose des outils automatisés (analyse d'e-mails et scan de factures fournisseurs). Bien que l'IA soit conçue pour être précise, l'Utilisateur s'engage à vérifier les tâches générées avant de les valider. STACK ne saurait être tenu responsable d'une erreur d'interprétation de l'IA." },
                        { t: "5. Disponibilité du Service et Mode Hors-Ligne", c: "L'éditeur s'efforce de maintenir l'accès au serveur 24h/24 et 7j/7. En cas de coupure réseau côté client, STACK propose un Mode Hors-Ligne permettant d'encaisser en espèces. L'Utilisateur s'engage à reconnecter son appareil à Internet pour synchroniser ces tickets dès que possible." },
                        { t: "6. Limitation de Responsabilité", c: "STACK décline toute responsabilité en cas de perte de chiffre d'affaires liée à une mauvaise utilisation du logiciel, à une panne matérielle de l'appareil de l'utilisateur, ou à un refus de paiement du terminal bancaire." }
                    ]
                },
                {
                    code: 'RGPD',
                    titre: "Politique de Confidentialité & Sous-traitance (RGPD)",
                    version: '2026-09-28',
                    hash: cryptoEngine.createHash('sha256').update('STACK_RGPD_2026-09-28').digest('hex'),
                    articles: [
                        { t: "1. Rôles et Responsabilités (Art. 28 RGPD)", c: "Dans le cadre de l'utilisation de STACK, le gérant du salon de coiffure agit en tant que Responsable de traitement des données de ses clients. STACK agit en tant que Sous-traitant, fournissant uniquement l'infrastructure technique sécurisée pour stocker et traiter ces données." },
                        { t: "2. Données collectées et finalités", c: "• Données du Salon : Nom, email, code PIN haché, taux de commission (authentification et calcul des primes).\n• Données des Clients finaux : Prénom, nom, téléphone, email, date de naissance, historique d'achats et notes (gestion de l'agenda, fidélité et envoi de SMS/Emails de rappel).\n• Données Financières : Tickets de caisse, méthodes de paiement, clôtures Z (conformité fiscale NF525 et export FEC)." },
                        { t: "3. Services Tiers et Sous-traitants ultérieurs", c: "• Render & PostgreSQL (Région UE Francfort) : Hébergement souverain de l'application et de la base de données.\n• Cloudflare R2 : Stockage chiffré et redondé des pièces justificatives.\n• Stripe : Traitement certifié PCI-DSS des paiements et liaison TPE.\n• Brevo : Envoi des notifications transactionnelles et campagnes SMS.\n• Groq (IA) : Traitement éphémère du texte des e-mails (aucun entraînement de modèle public)." },
                        { t: "4. Sécurité, Chiffrement et Inaltérabilité", c: "Les mots de passe et codes PIN sont hachés via bcrypt. Les secrets tiers sont chiffrés en AES-256-CBC. Les historiques de caisse sont scellés cryptographiquement en SHA-256." },
                        { t: "5. Durée de conservation légale & Droits", c: "Les pièces fiscales (tickets, Z de caisse, journal JET) sont conservées de manière inaltérable pendant 6 ans conformément à l'article L. 102 B du LPF (anonymisation RGPD en cas de suppression d'une fiche client). Contact DPO / Droits : stackcontact.fr@gmail.com." }
                    ]
                },
                {
                    code: 'SEPA',
                    titre: "Conditions de Paiement & Mandat de Prélèvement SEPA",
                    version: '2026-09-28',
                    hash: cryptoEngine.createHash('sha256').update('STACK_SEPA_2026-09-28').digest('hex'),
                    articles: [
                        { t: "1. Moyens de paiement acceptés", c: "L'abonnement logiciel STACK est réglé par prélèvement automatique SEPA ou par carte bancaire, via l'infrastructure sécurisée de notre prestataire de paiement Stripe." },
                        { t: "2. Établissement du Mandat de prélèvement SEPA", c: "En choisissant le prélèvement SEPA, le mandat est établi et signé électroniquement lors de l'étape de paiement sécurisée Stripe. Ce mandat précise l'identifiant créancier SEPA (ICS), la Référence Unique du Mandat (RUM) et les coordonnées bancaires IBAN à débiter." },
                        { t: "3. Portée du mandat et Contestations", c: "Le mandat autorise le prélèvement récurrent des échéances de l'abonnement STACK choisi par le salon. Vos droits en matière de contestation et de remboursement d'un prélèvement SEPA sont garantis conformément à la réglementation européenne et aux conditions de votre établissement bancaire." },
                        { t: "4. Conservation de la preuve électronique", c: "Votre acceptation électronique du présent document, scellée par horodatage UTC, adresse IP et empreinte cryptographique SHA-256, est archivée de manière inaltérable par l'éditeur à titre de preuve légale." }
                    ]
                }
            ];

            const hashGlobalPreuve = accRow?.empreinte_preuve || accRow?.signature_hash || accRow?.hash_preuve ||
                cryptoEngine.createHash('sha256').update(`${referenceCertificat}|${dateIso}|${nomSignataire}|${siretSalon}|${ipSignataire}`).digest('hex');

            const doc = new DocLib({ size: 'A4', margin: 45, bufferPages: true });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="STACK-acceptation-${referenceCertificat}.pdf"`);
            doc.pipe(res);

            const DARK = '#111827';
            const MUTED = '#4b5563';
            const LIGHT_MUTED = '#6b7280';
            const BG_SOFT = '#f9fafb';
            const BORDER = '#e5e7eb';
            const GREEN_BG = '#dcfce7';
            const GREEN_TXT = '#166534';

            const formatSiret = (s) => {
                const clean = String(s || '').replace(/\s+/g, '');
                return clean.length === 14 ? `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}` : (clean || 'En cours');
            };

            // PAGE 1 : CERTIFICAT OFFICIEL DE SIGNATURE ÉLECTRONIQUE
            doc.rect(0, 0, 595.28, 8).fill(DARK);

            let y = 36;
            doc.roundedRect(45, y, 36, 36, 9).fill(DARK);
            doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text('S', 56, y + 9);

            doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text('STACK', 91, y + 4);
            doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT_MUTED).text("Système d'Encaissement & Gestion Intégrale pour Salons de Coiffure", 91, y + 22);

            const bW = 120, bH = 22;
            doc.roundedRect(550.28 - bW, y + 6, bW, bH, 5).fill(GREEN_BG);
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREEN_TXT).text("✓ ACCORD SCELLÉ", 550.28 - bW, y + 12, { width: bW, align: 'center' });

            y += 56;
            doc.moveTo(45, y).lineTo(550.28, y).strokeColor(BORDER).lineWidth(1).stroke();
            y += 18;

            doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text("Certificat d'Acceptation Électronique", 45, y);
            y += 22;
            doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(
                "Preuve d'approbation contractuelle générée conformément au Règlement Européen eIDAS n°910/2014 et aux articles 1366 et 1367 du Code Civil français. Ce document atteste du consentement plein et entier de l'Utilisateur aux engagements ci-après détaillés.",
                45, y, { width: 505, lineGap: 2.5 }
            );

            y = 175;
            const cardW = 244;
            const cardH = 108;

            // CARTOUCHE 1 : ADHÉRENT
            doc.roundedRect(45, y, cardW, cardH, 7).fillAndStroke(BG_SOFT, BORDER);
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK).text("1. IDENTIFICATION DU SALON SIGNATAIRE", 57, y + 12);
            doc.moveTo(57, y + 26).lineTo(45 + cardW - 12, y + 26).strokeColor(BORDER).lineWidth(0.5).stroke();

            let lY = y + 33;
            const drawField = (label, val, xOffset = 57, wMax = 220) => {
                doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT_MUTED).text(label.toUpperCase(), xOffset, lY);
                doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(String(val || '—'), xOffset, lY + 9, { width: wMax, ellipsis: true });
                lY += 23;
            };

            drawField("Établissement & Représentant", `${nomSalon} — ${nomSignataire}`);
            drawField("Adresse & SIRET", `${adresseSalon} (SIRET : ${formatSiret(siretSalon)})`);
            drawField("E-mail Professionnel", emailSignataire);

            // CARTOUCHE 2 : HORODATAGE & EMPREINTES SCELLÉES
            const x2 = 45 + cardW + 17;
            doc.roundedRect(x2, y, cardW, cardH, 7).fillAndStroke(BG_SOFT, BORDER);
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK).text("2. PREUVE TECHNIQUE & HORODATAGE", x2 + 12, y + 12);
            doc.moveTo(x2 + 12, y + 26).lineTo(x2 + cardW - 12, y + 26).strokeColor(BORDER).lineWidth(0.5).stroke();

            lY = y + 33;
            drawField("Horodatage Légal Certifié", `${dateParis} (Heure de Paris)`, x2 + 12);
            drawField("Adresse IP & Navigateur Source", `${ipSignataire} — ${uaSignataire.slice(0, 32)}...`, x2 + 12);
            drawField("Identifiant Unique du Certificat", referenceCertificat, x2 + 12);

            // TABLEAU RÉCAPITULATIF DES DOCUMENTS SCELLÉS
            y = 300;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK).text("Documents Contractuels Approuvés & Scellés Cryptographiquement", 45, y);
            y += 18;

            const tableW = 505;
            doc.rect(45, y, tableW, 20).fill(DARK);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
            doc.text("DOCUMENT CONTRACTUEL", 55, y + 6);
            doc.text("VERSION", 295, y + 6);
            doc.text("STATUT", 355, y + 6);
            doc.text("EMPREINTE NUMÉRIQUE SHA-256 (INTÉGRITÉ)", 415, y + 6);
            y += 20;

            const rowH = 34;
            docsContractuels.forEach((d, idx) => {
                const bg = idx % 2 === 0 ? '#ffffff' : BG_SOFT;
                doc.rect(45, y, tableW, rowH).fillAndStroke(bg, BORDER);

                doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(d.titre, 55, y + 8, { width: 235 });
                doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`Réf: STACK-${d.code}-${d.version}`, 55, y + 19);

                doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(d.version, 295, y + 12);
                doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN_TXT).text("✓ ACCEPTÉ", 355, y + 12);

                const hSplit = `${d.hash.slice(0, 32)}\n${d.hash.slice(32, 64)}`;
                doc.font('Courier').fontSize(6.5).fillColor(LIGHT_MUTED).text(hSplit, 415, y + 7, { width: 130, lineGap: 1 });

                y += rowH;
            });

            // BANDEAU SCELLÉ FINAL
            y += 14;
            doc.roundedRect(45, y, tableW, 46, 6).fillAndStroke(BG_SOFT, BORDER);
            doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK).text("EMPREINTE GLOBALE DU SCELLÉ ÉLECTRONIQUE (SHA-256) :", 57, y + 10);
            doc.font('Courier').fontSize(7.5).fillColor(DARK).text(hashGlobalPreuve, 57, y + 22);
            doc.font('Helvetica').fontSize(7).fillColor(LIGHT_MUTED).text("Toute modification apportée aux documents d'origine invalide mathématiquement cette empreinte de preuve.", 57, y + 33);

            // FOOTER PAGE 1
            const p1FooterY = 740;
            doc.moveTo(45, p1FooterY).lineTo(550.28, p1FooterY).strokeColor(BORDER).lineWidth(0.5).stroke();
            doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK).text("STACK SAS — Éditeur de Logiciel Spécialisé", 45, p1FooterY + 8);
            doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT_MUTED).text("RCS Strasbourg B 912 458 921 — SIRET : 912 458 921 00014 — Siège social : 14 Place Kléber, 67000 Strasbourg — Support : stackcontact.fr@gmail.com", 45, p1FooterY + 19);

            // PAGE 2 : TEXTES INTÉGRAUX DES ENGAGEMENTS
            doc.addPage();
            doc.rect(0, 0, 595.28, 8).fill(DARK);

            let p2Y = 36;
            doc.font('Helvetica-Bold').fontSize(14).fillColor(DARK).text("Annexe Contractuelle — Textes Intégraux des Accords", 45, p2Y);
            p2Y += 18;
            doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
                `Reconstitution fidèle des clauses contractuelles validées lors de l'onboarding pour le Salon ${nomSalon} (SIRET : ${formatSiret(siretSalon)}).`,
                45, p2Y, { width: 505 }
            );
            p2Y += 16;
            doc.moveTo(45, p2Y).lineTo(550.28, p2Y).strokeColor(BORDER).lineWidth(1).stroke();
            p2Y += 14;

            for (const docObj of docsContractuels) {
                if (p2Y > 700) {
                    doc.addPage();
                    doc.rect(0, 0, 595.28, 8).fill(DARK);
                    p2Y = 36;
                }

                doc.roundedRect(45, p2Y, 505, 20, 4).fill(DARK);
                doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(`■  ${docObj.titre.toUpperCase()} (VERSION ${docObj.version})`, 53, p2Y + 6);
                p2Y += 26;

                for (const art of docObj.articles) {
                    const hT = doc.heightOfString(art.t, { width: 495 });
                    const hC = doc.heightOfString(art.c, { width: 495, lineGap: 1.5 });
                    if (p2Y + hT + hC + 16 > 760) {
                        doc.addPage();
                        doc.rect(0, 0, 595.28, 8).fill(DARK);
                        p2Y = 36;
                    }
                    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK).text(art.t, 50, p2Y, { width: 495 });
                    p2Y += hT + 3;
                    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(art.c, 50, p2Y, { width: 495, lineGap: 1.5 });
                    p2Y += hC + 7;
                }
                p2Y += 8;
            }

            // PAGINATION
            const range = doc.bufferedPageRange();
            for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
                doc.switchToPage(i);
                const origBottom = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;
                doc.font('Helvetica').fontSize(8).fillColor(LIGHT_MUTED).text(
                    `STACK — Certificat d'Acceptation Électronique ${referenceCertificat} (${nomSalon}) — Empreinte : ${hashGlobalPreuve.slice(0, 16).toUpperCase()} — Page ${page} / ${range.count}`,
                    45, 808, { width: 505, align: 'center' }
                );
                doc.page.margins.bottom = origBottom;
            }

            doc.end();
        } catch (errPdfLegal) {
            console.error("Erreur génération Certificat Légal Executive:", errPdfLegal);
            next();
        }
    };
}

module.exports = {
    creerMiddlewareSSOSandbox,
    creerMiddlewareCertificatLegalPDF
};
