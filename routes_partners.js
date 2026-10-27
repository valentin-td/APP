// routes_partners.js
const express = require('express');
const fs = require('fs');
const router = express.Router();
const { Pool } = require('pg'); 

// On recrée la connexion à la BDD spécifiquement pour ce module
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

router.get('/ping', (req, res) => {
    res.json({ message: "Le backend Stack Partners est en ligne et connecté !" });
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 1. Inscription d'un Agent Commercial (Brique 1)
router.post('/auth/register', async (req, res) => {
    try {
        const { nom, prenom, email, telephone, mot_de_passe, siret_agent, numero_rsac, iban } = req.body;
        if (!nom || !prenom || !email || !mot_de_passe || !siret_agent) {
            return res.status(400).json({ error: "Champs obligatoires manquants." });
        }

        // Génération d'un code d'affiliation unique
        const code_partenaire = `PARTNER-${nom.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const mot_de_passe_hash = await bcrypt.hash(mot_de_passe, 10);

        const result = await pool.query(
            `INSERT INTO partner_agents (nom, prenom, email, telephone, mot_de_passe_hash, siret_agent, numero_rsac, iban, code_partenaire, statut_compte) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'EN_ATTENTE_VALIDATION') RETURNING id_agent, code_partenaire`,
            [nom, prenom, email, telephone, mot_de_passe_hash, siret_agent, numero_rsac, iban, code_partenaire]
        );

        res.status(201).json({ message: "Compte agent créé.", agent: result.rows[0] });
    } catch (error) {
        console.error("Erreur Inscription Agent:", error);
        if (error.code === '23505') return res.status(409).json({ error: "Cet email est déjà utilisé." });
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// ============================================================================
// SÉCURITÉ : Limiteur de requêtes natif en mémoire (Rate Limiting)
// ============================================================================
const loginAttempts = new Map();
const rateLimiter = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
    if (now - record.firstAttempt > windowMs) {
        record.count = 0;
        record.firstAttempt = now;
    }
    
    record.count += 1;
    loginAttempts.set(ip, record);
    
    if (record.count > 10) {
        return res.status(429).json({ error: "Trop de tentatives de connexion. Par sécurité, réessayez dans 15 minutes." });
    }
    next();
};

// 2. Connexion d'un Agent Commercial (Protégée contre le Bruteforce)
router.post('/auth/login', rateLimiter, async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;
        const result = await pool.query(`SELECT * FROM partner_agents WHERE email = $1`, [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }

        const agent = result.rows[0];
        const match = await bcrypt.compare(mot_de_passe, agent.mot_de_passe_hash);
        
        if (!match) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }

        // Génération du JWT spécifique au portail partenaire (Indépendant de STACK)
        const partnerToken = jwt.sign(
            { id_agent: agent.id_agent, role: 'agent', statut: agent.statut_compte },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({ 
            message: "Connexion réussie", 
            token: partnerToken, 
            agent: { id: agent.id_agent, nom: agent.nom, statut: agent.statut_compte, code: agent.code_partenaire } 
        });
    } catch (error) {
        console.error("Erreur Connexion Agent:", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

const PDFDocument = require('pdfkit');

// Middleware de sécurité : Vérifie le JWT de l'agent
const verifierTokenPartner = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token manquant" });
    const token = authHeader.split(' ')[1];
    try {
        req.agent = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        next();
    } catch (err) {
        res.status(401).json({ error: "Token invalide ou expiré" });
    }
};

// 3. Obtenir la liste des factures de l'agent
router.get('/factures', verifierTokenPartner, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM partner_factures_installation WHERE id_agent = $1 ORDER BY date_emission DESC', 
            [req.agent.id_agent]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Fonction centrale de vérification de conformité et d'expiration des pièces
const evaluerConformiteAgent = async (idAgent) => {
    await pool.query('INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING', [idAgent]);
    const res = await pool.query(`
        SELECT a.*, d.*
        FROM partner_agents a
        JOIN partner_conformite_dossier d ON d.id_agent = a.id_agent
        WHERE a.id_agent = $1
    `, [idAgent]);
    if (res.rowCount === 0) return { autorise: false, motifs: ["Compte introuvable"], alertes: [] };
    const c = res.rows[0];
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const motifs = [];
    const alertes = [];

    // 1. Contrat signé (avant RSAC)
    if (!c.contrat_signe || c.statut_contrat !== 'VALIDE') motifs.push("Étape 1 : Contrat d'agent commercial non signé ou non validé.");

    // 2. Identité, SIRET, RSAC, Kbis
    if (c.statut_identite !== 'VALIDE') motifs.push("Étape 2 : Pièce d'identité non validée.");
    if (c.date_expiration_identite && new Date(c.date_expiration_identite) < now) motifs.push("Étape 2 : Pièce d'identité expirée.");
    if (c.statut_siret !== 'VALIDE') motifs.push("Étape 2 : Statut SIREN/SIRET (INSEE) non validé.");
    if (!c.numero_rsac || c.statut_rsac !== 'VALIDE') motifs.push("Étape 2 : Numéro et extrait RSAC (< 3 mois) obligatoires et doivent être validés.");
    if (c.forme_juridique === 'SOCIETE' && c.statut_kbis !== 'VALIDE') motifs.push("Étape 2 : Extrait Kbis (< 3 mois) requis pour une société.");

    // 3. Vigilance URSSAF
    if (c.statut_urssaf !== 'VALIDE') motifs.push("Étape 3 : Attestation de vigilance URSSAF non validée.");
    if (!c.date_expiration_urssaf || new Date(c.date_expiration_urssaf) < now) {
        motifs.push("Étape 3 : Attestation URSSAF expirée (renouvellement 6 mois obligatoire).");
    } else if (new Date(c.date_expiration_urssaf) <= in30Days) {
        alertes.push(`Votre attestation URSSAF expire le ${new Date(c.date_expiration_urssaf).toLocaleDateString('fr-FR')} (moins de 30 jours).`);
    }

    // 4. RC Pro, IBAN, TVA, Honneur, Charte
    if (c.statut_rc_pro !== 'VALIDE') motifs.push("Étape 4 : Attestation d'assurance RC Pro non validée.");
    if (!c.date_expiration_rc_pro || new Date(c.date_expiration_rc_pro) < now) {
        motifs.push("Étape 4 : Assurance RC Pro expirée.");
    } else if (new Date(c.date_expiration_rc_pro) <= in30Days) {
        alertes.push(`Votre assurance RC Pro expire le ${new Date(c.date_expiration_rc_pro).toLocaleDateString('fr-FR')} (moins de 30 jours).`);
    }
    if (!c.iban || !c.titulaire_iban || c.statut_iban !== 'VALIDE') motifs.push("Étape 4 : IBAN et titulaire non validés.");
    if (c.statut_tva !== 'VALIDE') motifs.push("Étape 4 : Régime de TVA non validé.");
    if (!c.honneur_aucune_interdiction || !c.honneur_pas_exclusivite_employeur || !c.honneur_pas_mandat_concurrent) {
        motifs.push("Étape 4 : Déclarations sur l'honneur incomplètes.");
    }
    if (!c.charte_acceptee) motifs.push("Étape 4 : Charte commerciale STACK non acceptée.");

    // 5. Formation NF525 & Contact
    if (!c.formation_validee || c.quiz_score < 100) motifs.push("Étape 5 : Formation et Quiz NF525 non validés.");
    if (!c.telephone_confirme) motifs.push("Étape 5 : Numéro de téléphone et contact non confirmés.");

    // 6. Validation finale Fondateur
    if (c.statut_compte !== 'ACTIF') motifs.push("Étape 6 : En attente de l'activation finale manuelle par STACK.");

    return { autorise: motifs.length === 0, motifs, alertes, dossier: c };
};

// 4. Créer une nouvelle facture d'installation (Bloquée si conformité ou RSAC incomplets)
router.post('/factures', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Facturation bloquée : ${verif.motifs[0]}` });
        }
        const { nom_salon, adresse_salon, siret_salon } = req.body;
        const numero_facture = `FAC-${req.agent.id_agent}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const result = await pool.query(
            `INSERT INTO partner_factures_installation (id_agent, numero_facture, nom_salon, adresse_salon, siret_salon)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.agent.id_agent, numero_facture, nom_salon, adresse_salon, siret_salon]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erreur création facture:", error);
        res.status(500).json({ error: "Erreur lors de la création" });
    }
});

// 5. Marquer une facture comme payée
router.patch('/factures/:id/payee', verifierTokenPartner, async (req, res) => {
    try {
        await pool.query(
            'UPDATE partner_factures_installation SET statut = $1, date_paiement = CURRENT_TIMESTAMP WHERE id_facture = $2 AND id_agent = $3', 
            ['PAYEE', req.params.id, req.agent.id_agent]
        );
        res.json({ message: "Facture marquée comme payée" });
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// 6. Générer et télécharger le PDF de la facture à la volée
router.get('/factures/:id/pdf', verifierTokenPartner, async (req, res) => {
    try {
        const factRes = await pool.query('SELECT * FROM partner_factures_installation WHERE id_facture = $1 AND id_agent = $2', [req.params.id, req.agent.id_agent]);
        if (factRes.rows.length === 0) return res.status(404).json({error: "Facture introuvable"});
        const facture = factRes.rows[0];

        const agentRes = await pool.query('SELECT * FROM partner_agents WHERE id_agent = $1', [req.agent.id_agent]);
        const agent = agentRes.rows[0];

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${facture.numero_facture}.pdf`);
        doc.pipe(res);

        // En-tête
        doc.fontSize(20).text('FACTURE', { align: 'right' });
        doc.fontSize(10).text(`Facture N° : ${facture.numero_facture}`, { align: 'right' });
        doc.text(`Date : ${new Date(facture.date_emission).toLocaleDateString('fr-FR')}`, { align: 'right' });
        
        const confRes = await pool.query('SELECT * FROM partner_conformite_dossier WHERE id_agent = $1', [req.agent.id_agent]);
        const conf = confRes.rows[0] || {};
        if (!agent.numero_rsac) {
            return res.status(403).json({ error: "Émission PDF refusée : Le numéro RSAC est obligatoire sur chaque facture." });
        }

        // Infos Agent (Mention RSAC obligatoire)
        doc.moveDown(2);
        doc.fontSize(14).text(`${agent.prenom} ${agent.nom}`, { align: 'left' });
        if (conf.adresse_pro) doc.fontSize(10).text(conf.adresse_pro);
        doc.fontSize(10).text(`SIRET : ${agent.siret_agent} (${conf.forme_juridique || 'EI'})`);
        doc.fontSize(10).text(`Immatriculation RSAC : ${agent.numero_rsac}${conf.greffe_rsac ? ' - Greffe de ' + conf.greffe_rsac : ''}`);
        if (conf.regime_tva === 'ASSUJETTI_TVA' && conf.numero_tva_intra) {
            doc.fontSize(10).text(`N° TVA Intracommunautaire : ${conf.numero_tva_intra}`);
        }

        // Infos Client
        doc.moveDown(2);
        doc.fontSize(12).text('Facturé à :', { underline: true });
        doc.fontSize(12).text(facture.nom_salon);
        doc.fontSize(10).text(facture.adresse_salon);
        doc.text(`SIRET : ${facture.siret_salon}`);

        // Tableau Lignes
        doc.moveDown(3);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        let startY = doc.y;
        doc.fontSize(12).text('Description', 50, startY, { width: 350 });
        doc.text('Montant HT', 400, startY, { width: 150, align: 'right' });
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        
        startY = doc.y;
        doc.text('Frais de configuration et de formation au logiciel STACK', 50, startY, { width: 350 });
        doc.text('99,00 €', 400, startY, { width: 150, align: 'right' });
        
        // Totaux
        doc.moveDown(2);
        doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        startY = doc.y;
        doc.fontSize(14).text('Total à payer :', 350, startY, { width: 100 });
        doc.text('99,00 €', 450, startY, { width: 100, align: 'right' });
        
        doc.moveDown(2);
        doc.fontSize(10).text('TVA non applicable, art. 293 B du CGI.', 50, doc.y);

        // Paiement IBAN
        doc.moveDown(3);
        doc.fontSize(12).text('Modalités de paiement :');
        doc.fontSize(10).text('Paiement par virement bancaire sur le compte ci-dessous :');
        doc.text(`Titulaire du compte : ${agent.prenom} ${agent.nom}`);
        doc.text(`IBAN : ${agent.iban || 'Non renseigné'}`);

        doc.end();
    } catch (error) {
        console.error("Erreur PDF:", error);
        if (!res.headersSent) res.status(500).json({ error: "Erreur génération PDF" });
    }
});

// 7. Déclarer et verrouiller un prospect (Lead Locking - 45 jours)
router.post('/prospects', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Vente verrouillée : ${verif.motifs[0]}` });
        }
        const { nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant } = req.body;

        // A. Vérifier si le salon est DÉJÀ client STACK
        const clientExist = await pool.query(`
            SELECT s.id_salon FROM configuration_salon s
            LEFT JOIN utilisateurs u ON u.id_salon = s.id_salon
            WHERE u.email = $1 OR s.siret = $2
        `, [email_gerant, siret_prospect]);

        if (clientExist.rows.length > 0) {
            return res.status(409).json({ error: "Ce salon utilise déjà STACK. Prospection impossible." });
        }

        // B. Vérifier si un autre agent protège DÉJÀ ce prospect (et que la protection n'est pas expirée)
        const leadExist = await pool.query(`
            SELECT id_agent FROM partner_prospects_reservations
            WHERE (email_gerant = $1 OR siret_prospect = $2)
            AND date_expiration_protection > CURRENT_TIMESTAMP
        `, [email_gerant, siret_prospect]);

        if (leadExist.rows.length > 0) {
            return res.status(409).json({ error: "Ce prospect est déjà verrouillé par un autre agent." });
        }

        // C. Insérer le lead avec une protection stricte de 45 jours
        const result = await pool.query(`
            INSERT INTO partner_prospects_reservations
            (id_agent, nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant, date_expiration_protection)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '45 days')
            RETURNING *
        `, [req.agent.id_agent, nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erreur protection lead:", error);
        res.status(500).json({ error: "Erreur serveur lors de la réservation." });
    }
});

// 8. Lister les prospects de l'agent connecté
router.get('/prospects', verifierTokenPartner, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *, 
                   (date_expiration_protection > CURRENT_TIMESTAMP) as est_protege,
                   EXTRACT(DAY FROM (date_expiration_protection - CURRENT_TIMESTAMP)) as jours_restants
            FROM partner_prospects_reservations 
            WHERE id_agent = $1 
            ORDER BY date_declaration DESC
        `, [req.agent.id_agent]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 9. Lancer l'Onboarding (Génération du lien unique après paiement)
router.post('/prospects/:id/onboarding', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Onboarding verrouillé : ${verif.motifs[0]}` });
        }
        // A. Vérifier le prospect
        const prospectRes = await pool.query(
            'SELECT * FROM partner_prospects_reservations WHERE id_prospect = $1 AND id_agent = $2',
            [req.params.id, req.agent.id_agent]
        );
        if (prospectRes.rows.length === 0) return res.status(404).json({ error: "Prospect introuvable." });
        const prospect = prospectRes.rows[0];

        // B. Verrou Métier : Vérifier que la facture de 99€ est payée pour ce SIRET
        const factureRes = await pool.query(
            'SELECT id_facture FROM partner_factures_installation WHERE id_agent = $1 AND siret_salon = $2 AND statut = $3',
            [req.agent.id_agent, prospect.siret_prospect, 'PAYEE']
        );
        
        if (factureRes.rows.length === 0) {
            return res.status(403).json({ error: "Onboarding bloqué : La facture d'installation n'est pas encore marquée comme payée pour ce SIRET." });
        }

        // C. Générer le lien avec le code d'affiliation
        const lienInscription = `https://app-salon-caiss.onrender.com/register?partner=${req.agent.code_partenaire}&siret=${prospect.siret_prospect}`;

        // D. Mettre à jour le statut du prospect
        await pool.query(
            "UPDATE partner_prospects_reservations SET statut_prospect = 'SIGNE' WHERE id_prospect = $1",
            [req.params.id]
        );

        res.json({ message: "Onboarding débloqué", lien: lienInscription });
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 10. Moteur de Commissions (Brique 5) & KPIs Dashboard (Brique 6)
const GRILLE_TARIFS_HT = {
    'ESSENTIEL': 39.00,
    'PRO': 69.00,
    'PREMIUM': 99.00
};
const SEUIL_SALONS_ACTIFS = 3;

router.get('/dashboard-stats', verifierTokenPartner, async (req, res) => {
    const idAgent = req.agent.id_agent;
    const moisCourant = new Date().toISOString().slice(0, 7); // Ex: '2026-10'

    try {
        // A. Récupérer tous les salons apportés par cet agent avec leur statut Stripe en temps réel
        const salonsRes = await pool.query(`
            SELECT s.id_salon, s.nom_salon, s.plan_actuel, s.frequence_paiement, s.date_fin_essai, s.siret,
                   u.email as email_gerant, u.statut_abonnement,
                   a.statut_onboarding, a.date_debut_commissionnement, a.date_fin_commissionnement
            FROM configuration_salon s
            LEFT JOIN utilisateurs u ON u.id_salon = s.id_salon AND u.role = 'gerant'
            LEFT JOIN partner_attributions_salons a ON a.id_salon = s.id_salon
            WHERE s.id_agent_apporteur = $1
            ORDER BY s.id_salon DESC
        `, [idAgent]);

        const salons = salonsRes.rows;
        const salonsActifsPayants = salons.filter(s => s.statut_abonnement === 'actif');
        const nbSalonsActifs = salonsActifsPayants.length;
        const nbSalonsEssai = salons.filter(s => s.statut_abonnement !== 'actif').length;

        // B. Générer de façon idempotente les commissions de 20% du mois en cours pour chaque salon actif
        for (const salon of salonsActifsPayants) {
            // Initialiser la fenêtre de 24 mois dès le 1er paiement constaté
            if (!salon.date_debut_commissionnement) {
                const updateDates = await pool.query(`
                    INSERT INTO partner_attributions_salons (id_salon, id_agent, mode_attribution, statut_onboarding, date_debut_commissionnement, date_fin_commissionnement)
                    VALUES ($1, $2, 'LIEN_AFFILIATION', 'GO_LIVE_VALIDE', CURRENT_DATE, (CURRENT_DATE + INTERVAL '24 months')::DATE)
                    ON CONFLICT (id_salon) DO UPDATE
                    SET date_debut_commissionnement = CURRENT_DATE,
                        date_fin_commissionnement = (CURRENT_DATE + INTERVAL '24 months')::DATE,
                        statut_onboarding = 'GO_LIVE_VALIDE'
                    RETURNING date_debut_commissionnement, date_fin_commissionnement
                `, [salon.id_salon, idAgent]);
                salon.date_debut_commissionnement = updateDates.rows[0].date_debut_commissionnement;
                salon.date_fin_commissionnement = updateDates.rows[0].date_fin_commissionnement;
            }

            // Vérifier que la période de 24 mois n'est pas dépassée
            const dateFin = new Date(salon.date_fin_commissionnement);
            if (new Date() <= dateFin) {
                const baseHt = GRILLE_TARIFS_HT[salon.plan_actuel] || 39.00;
                const montantCom = Number((baseHt * 0.20).toFixed(2));
                const statutInitial = nbSalonsActifs >= SEUIL_SALONS_ACTIFS ? 'ACQUISE_A_PAYER' : 'EN_ATTENTE_SEUIL';

                await pool.query(`
                    INSERT INTO partner_commissions 
                    (id_agent, id_salon, type_commission, periode_mois, montant_base_ht, taux_applique, montant_commission, statut_commission)
                    VALUES ($1, $2, 'ABONNEMENT_RECURRENT_20_POURCENT', $3, $4, 20.00, $5, $6)
                    ON CONFLICT (id_salon, periode_mois, type_commission) DO NOTHING
                `, [idAgent, salon.id_salon, moisCourant, baseHt, montantCom, statutInitial]);
            }
        }

        // C. Règle de déblocage rétroactif : si l'agent a >= 3 salons actifs, toutes ses commissions en attente deviennent acquises
        if (nbSalonsActifs >= SEUIL_SALONS_ACTIFS) {
            await pool.query(`
                UPDATE partner_commissions
                SET statut_commission = 'ACQUISE_A_PAYER'
                WHERE id_agent = $1 AND statut_commission = 'EN_ATTENTE_SEUIL'
            `, [idAgent]);
        }

        // D. Récupérer l'historique des commissions et calculer les totaux
        const comRes = await pool.query(`
            SELECT c.*, s.nom_salon, s.plan_actuel
            FROM partner_commissions c
            JOIN configuration_salon s ON s.id_salon = c.id_salon
            WHERE c.id_agent = $1
            ORDER BY c.periode_mois DESC, c.date_creation DESC
        `, [idAgent]);

        const commissions = comRes.rows;
        const sumByStatus = (st) => commissions
            .filter(c => c.statut_commission === st)
            .reduce((acc, c) => acc + parseFloat(c.montant_commission || 0), 0)
            .toFixed(2);

        res.json({
            kpis: {
                nb_salons_actifs: nbSalonsActifs,
                nb_salons_essai: nbSalonsEssai,
                seuil_deblocage: SEUIL_SALONS_ACTIFS,
                commissions_en_attente: sumByStatus('EN_ATTENTE_SEUIL'),
                commissions_acquises: sumByStatus('ACQUISE_A_PAYER'),
                commissions_payees: sumByStatus('PAYEE')
            },
            salons,
            commissions
        });
    } catch (error) {
        console.error("Erreur Dashboard Stats:", error);
        res.status(500).json({ error: "Erreur lors du chargement des statistiques." });
    }
});

// 11. Récupérer le dossier complet de conformité, les alertes 30j et l'historique
router.get('/profil', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        const histRes = await pool.query(
            'SELECT * FROM partner_conformite_historique WHERE id_agent = $1 ORDER BY date_evenement DESC LIMIT 30',
            [req.agent.id_agent]
        );
        res.json({
            ...verif.dossier,
            autorise_a_vendre: verif.autorise,
            motifs_blocage: verif.motifs,
            alertes_expiration: verif.alertes,
            historique: histRes.rows
        });
    } catch (error) {
        console.error("Erreur GET /profil:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

const multer = require('multer');
const crypto = require('crypto');
const upload = multer({ storage: multer.memoryStorage() });

// ============================================================================
// MOTEUR CLOUDFLARE R2 / S3 NATIF (AWS Signature V4 sans dépendance externe)
// ============================================================================
function getR2Config() {
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const accountId = process.env.R2_ACCOUNT_ID;
    const rawEndpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
    if (!bucket || !accessKeyId || !secretAccessKey || !rawEndpoint) return null;
    const host = rawEndpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return { bucket, accessKeyId, secretAccessKey, host, publicUrl: process.env.R2_PUBLIC_URL };
}

function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

async function uploadBufferToR2(objectKey, buffer, contentType = 'application/pdf') {
    const cfg = getR2Config();
    if (!cfg) throw new Error("Variables R2 incomplètes sur Render (R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT ou R2_ACCOUNT_ID).");

    const method = 'PUT';
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(buffer);
    const canonicalUri = `/${cfg.bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;

    const canonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${cfg.host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`https://${cfg.host}${canonicalUri}`, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'Authorization': authorization
        },
        body: buffer
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Échec upload R2 (${res.status}) : ${errText}`);
    }
    return objectKey;
}

async function downloadFromR2(objectKey) {
    const cfg = getR2Config();
    if (!cfg) throw new Error("Configuration R2 manquante.");

    const method = 'GET';
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex('');
    const canonicalUri = `/${cfg.bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;

    const canonicalHeaders =
        `host:${cfg.host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(`https://${cfg.host}${canonicalUri}`, {
        method: 'GET',
        headers: {
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'Authorization': authorization
        }
    });
}

// Route de lecture sécurisée d'un document stocké sur Cloudflare R2
router.get('/documents/r2/:agentId/:fileName', async (req, res) => {
    try {
        const objectKey = `partners/agent_${req.params.agentId}/${req.params.fileName}`;
        const r2Res = await downloadFromR2(objectKey);
        if (!r2Res.ok) return res.status(404).send("Document introuvable sur Cloudflare R2.");

        const contentType = r2Res.headers.get('content-type') || 'application/pdf';
        const arrayBuf = await r2Res.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${req.params.fileName}"`);
        res.send(Buffer.from(arrayBuf));
    } catch (e) {
        console.error("Erreur lecture R2:", e.message);
        res.status(500).send("Erreur lors de la récupération du document.");
    }
});

// 12. Soumettre ou mettre à jour une étape du dossier de conformité (Ordre 1 à 5) avec Upload R2 automatique
router.put('/profil/etape', verifierTokenPartner, upload.any(), async (req, res) => {
    const idAgent = req.agent.id_agent;
    let etape = req.body.etape;
    if (!isNaN(etape)) etape = parseInt(etape);

    let payload = req.body.payload || {};
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
    }

    const baseBackendUrl = `${req.protocol}://${req.get('host')}/api/partners`;
    const champsFichiers = ['fichier_identite', 'fichier_rsac', 'fichier_kbis', 'fichier_urssaf', 'fichier_rc_pro'];

    try {
        // A. Si des fichiers multipart sont envoyés, on les envoie sur R2
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const ext = (file.originalname?.split('.').pop() || 'pdf').replace(/[^a-zA-Z0-9]/g, '');
                const fileName = `${file.fieldname}_${Date.now()}.${ext}`;
                const objectKey = `partners/agent_${idAgent}/${fileName}`;
                if (getR2Config()) {
                    await uploadBufferToR2(objectKey, file.buffer, file.mimetype || 'application/pdf');
                    payload[file.fieldname] = `${baseBackendUrl}/documents/r2/${idAgent}/${fileName}`;
                } else {
                    payload[file.fieldname] = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
                }
            }
        }

        // B. Si le Frontend envoie un fichier en Base64 ("data:...;base64,..."), on l'intercepte, on l'uploade sur R2 et on ne stocke que l'URL légère en BDD !
        if (getR2Config()) {
            for (const field of champsFichiers) {
                const val = payload[field];
                if (typeof val === 'string' && val.startsWith('data:')) {
                    const match = val.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const mimeType = match[1];
                        const buffer = Buffer.from(match[2], 'base64');
                        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'pdf';
                        const fileName = `${field}_${Date.now()}.${ext}`;
                        const objectKey = `partners/agent_${idAgent}/${fileName}`;
                        await uploadBufferToR2(objectKey, buffer, mimeType);
                        payload[field] = `${baseBackendUrl}/documents/r2/${idAgent}/${fileName}`;
                    }
                }
            }
        }
    } catch (uploadErr) {
        console.error("Erreur Upload Cloudflare R2:", uploadErr.message);
        return res.status(500).json({ error: `Échec du stockage Cloud R2 : ${uploadErr.message}` });
    }

    try {
        await pool.query('INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING', [idAgent]);
        const currentRes = await pool.query('SELECT * FROM partner_conformite_dossier WHERE id_agent = $1', [idAgent]);
        const d = currentRes.rows[0];

        if (etape === 1) {
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET contrat_signe = TRUE, date_signature_contrat = CURRENT_TIMESTAMP, statut_contrat = 'EN_ATTENTE', updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $1
            `, [idAgent]);
            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'CONTRAT_MANDAT', 'SIGNATURE_AGENT', 'EN_ATTENTE', 'Agent', 'Contrat signé avec prise d''effet conditionnelle')`, [idAgent]);
        }

        if (etape === 2) {
            if (!d.contrat_signe) return res.status(400).json({ error: "Ordre obligatoire : Vous devez d'abord signer le contrat d'agent commercial (Étape 1) avant de déposer votre immatriculation RSAC." });
            const { date_naissance, date_expiration_identite, fichier_identite, siret_agent, forme_juridique, date_debut_activite, adresse_pro, numero_rsac, greffe_rsac, date_emission_rsac, fichier_rsac, date_emission_kbis, fichier_kbis } = payload;

            await pool.query('UPDATE partner_agents SET siret_agent = COALESCE($1, siret_agent), numero_rsac = COALESCE($2, numero_rsac) WHERE id_agent = $3', [siret_agent, numero_rsac, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET date_naissance = COALESCE($1, date_naissance),
                    date_expiration_identite = COALESCE($2, date_expiration_identite),
                    fichier_identite = COALESCE($3, fichier_identite),
                    statut_identite = CASE WHEN $3 IS NOT NULL THEN 'EN_ATTENTE' ELSE statut_identite END,
                    forme_juridique = COALESCE($4, forme_juridique),
                    date_debut_activite = COALESCE($5, date_debut_activite),
                    adresse_pro = COALESCE($6, adresse_pro),
                    statut_siret = 'EN_ATTENTE',
                    greffe_rsac = COALESCE($7, greffe_rsac),
                    date_emission_rsac = COALESCE($8, date_emission_rsac),
                    fichier_rsac = COALESCE($9, fichier_rsac),
                    statut_rsac = CASE WHEN $9 IS NOT NULL THEN 'EN_ATTENTE' ELSE statut_rsac END,
                    date_emission_kbis = COALESCE($10, date_emission_kbis),
                    fichier_kbis = COALESCE($11, fichier_kbis),
                    statut_kbis = CASE WHEN $4 = 'SOCIETE' THEN (CASE WHEN $11 IS NOT NULL THEN 'EN_ATTENTE' ELSE 'MANQUANT' END) ELSE 'NON_REQUIS' END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $12
            `, [date_naissance || null, date_expiration_identite || null, fichier_identite || null, forme_juridique || 'EI', date_debut_activite || null, adresse_pro || null, greffe_rsac || null, date_emission_rsac || null, fichier_rsac || null, date_emission_kbis || null, fichier_kbis || null, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'IDENTITE_SIRET_RSAC', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, `RSAC: ${numero_rsac || 'N/A'} | Forme: ${forme_juridique || 'EI'}`]);
        }

        if (etape === 3) {
            const { code_verif_urssaf, date_emission_urssaf, date_expiration_urssaf, fichier_urssaf } = payload;
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET code_verif_urssaf = COALESCE($1, code_verif_urssaf),
                    date_emission_urssaf = COALESCE($2, date_emission_urssaf),
                    date_expiration_urssaf = COALESCE($3, date_expiration_urssaf),
                    fichier_urssaf = COALESCE($4, fichier_urssaf),
                    statut_urssaf = 'EN_ATTENTE',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $5
            `, [code_verif_urssaf || null, date_emission_urssaf || null, date_expiration_urssaf || null, fichier_urssaf || null, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'URSSAF', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, `Code vérif: ${code_verif_urssaf || ''}`]);
        }

        if (etape === 4) {
            const { assureur_nom, assureur_contrat, assureur_plafond, date_expiration_rc_pro, fichier_rc_pro, iban, titulaire_iban, regime_tva, numero_tva_intra, honneur_aucune_interdiction, honneur_pas_exclusivite_employeur, honneur_pas_mandat_concurrent, charte_acceptee } = payload;
            await pool.query('UPDATE partner_agents SET iban = COALESCE($1, iban) WHERE id_agent = $2', [iban, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET assureur_nom = COALESCE($1, assureur_nom),
                    assureur_contrat = COALESCE($2, assureur_contrat),
                    assureur_plafond = COALESCE($3, assureur_plafond),
                    date_expiration_rc_pro = COALESCE($4, date_expiration_rc_pro),
                    fichier_rc_pro = COALESCE($5, fichier_rc_pro),
                    statut_rc_pro = 'EN_ATTENTE',
                    titulaire_iban = COALESCE($6, titulaire_iban),
                    statut_iban = 'EN_ATTENTE',
                    regime_tva = COALESCE($7, regime_tva),
                    numero_tva_intra = COALESCE($8, numero_tva_intra),
                    statut_tva = 'EN_ATTENTE',
                    honneur_aucune_interdiction = $9,
                    honneur_pas_exclusivite_employeur = $10,
                    honneur_pas_mandat_concurrent = $11,
                    date_declarations_honneur = CASE WHEN ($9 AND $10 AND $11) THEN CURRENT_TIMESTAMP ELSE date_declarations_honneur END,
                    charte_acceptee = $12,
                    date_acceptation_charte = CASE WHEN $12 THEN CURRENT_TIMESTAMP ELSE date_acceptation_charte END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $13
            `, [assureur_nom || null, assureur_contrat || null, assureur_plafond || null, date_expiration_rc_pro || null, fichier_rc_pro || null, titulaire_iban || null, regime_tva || 'FRANCHISE_293B', numero_tva_intra || null, !!honneur_aucune_interdiction, !!honneur_pas_exclusivite_employeur, !!honneur_pas_mandat_concurrent, !!charte_acceptee, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'ASSURANCE_IBAN_TVA_HONNEUR', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', 'Dépôt RC Pro, IBAN, TVA, Déclarations sur l''honneur et Charte v1.0')`, [idAgent]);
        }

        if (etape === 5) {
            const { telephone, quiz_score, telephone_confirme } = payload;
            const reussi = Number(quiz_score) >= 100;
            if (telephone) await pool.query('UPDATE partner_agents SET telephone = $1 WHERE id_agent = $2', [telephone, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET quiz_score = $1,
                    formation_validee = $2,
                    date_validation_formation = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE date_validation_formation END,
                    telephone_confirme = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $4
            `, [Number(quiz_score) || 0, reussi, !!telephone_confirme, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'FORMATION_NF525_CONTACT', 'QUIZ_AGENT', $2, 'Système', $3)`, [idAgent, reussi ? 'VALIDE' : 'REFUSE', `Score Quiz NF525 : ${quiz_score}%`]);
        }

        if (etape === 'CHANGEMENT_SITUATION') {
            const { motif_changement } = payload;
            await pool.query("UPDATE partner_agents SET statut_compte = 'EN_ATTENTE_VALIDATION' WHERE id_agent = $1", [idAgent]);
            await pool.query("UPDATE partner_conformite_dossier SET statut_siret = 'EN_ATTENTE', statut_rsac = 'EN_ATTENTE' WHERE id_agent = $1", [idAgent]);
            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'CHANGEMENT_SITUATION', 'ALERTE_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, motif_changement || 'Changement de statut/adresse/forme juridique déclaré']);
        }

        res.json({ message: "Dossier mis à jour et enregistré dans l'historique." });
    } catch (error) {
        console.error("Erreur PUT /profil/etape:", error);
        res.status(500).json({ error: "Erreur lors de la sauvegarde." });
    }
});

// --- MIDDLEWARE GOD MODE ---
const verifierSuperAdmin = async (req, res, next) => {
    try {
        const result = await pool.query('SELECT email FROM partner_agents WHERE id_agent = $1', [req.agent.id_agent]);
        if (result.rows[0]?.email === 'tardy.valentin04@gmail.com') next();
        else res.status(403).json({ error: "Accès refusé. Réservé au fondateur." });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
};

// 13. GOD MODE - Récupérer tous les agents avec leur dossier de conformité complet
router.get('/admin/agents', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, d.*, a.id_agent AS id_agent
      FROM partner_agents a
      LEFT JOIN partner_conformite_dossier d ON d.id_agent = a.id_agent
      ORDER BY a.id_agent DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/commissions', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pc.*, pa.nom, pa.prenom, pa.iban, cs.nom_salon
      FROM partner_commissions pc
      JOIN partner_agents pa ON pa.id_agent = pc.id_agent
      JOIN configuration_salon cs ON cs.id_salon = pc.id_salon
      WHERE pc.statut_commission = 'ACQUISE_A_PAYER'
        AND COALESCE(cs.est_bac_a_sable, FALSE) = FALSE
      ORDER BY pc.id_commission DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.json([]);
  }
});

router.patch('/admin/agents/:id/verifier-piece', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const idAgentCible = req.params.id;
    const { champ_statut, decision, commentaire, purge_identite_rgpd } = req.body;

    await pool.query(`INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING`, [idAgentCible]);

    if (champ_statut === 'STATUT_COMPTE_FINAL') {
      await pool.query(`UPDATE partner_agents SET statut_compte = $1 WHERE id_agent = $2`, [decision, idAgentCible]);
      const agRes = await pool.query(`SELECT prenom, email, code_partenaire FROM partner_agents WHERE id_agent = $1`, [idAgentCible]);
      if (agRes.rowCount > 0 && typeof envoyerEmailSMTP === 'function') {
        const ag = agRes.rows[0];
        envoyerEmailSMTP({
          to: ag.email,
          subject: decision === 'ACTIF' ? "Votre compte STACK Partners est officiellement ACTIF" : "Suspension temporaire de votre compte STACK Partners",
          html: decision === 'ACTIF'
            ? `<p>Bonjour ${ag.prenom},</p><p>Félicitations ! Votre dossier de conformité a été intégralement validé. Votre compte partenaire (Code : <strong>${ag.code_partenaire}</strong>) est désormais <strong>ACTIF</strong>. Vous pouvez dès maintenant verrouiller vos prospects et émettre vos factures d'installation de 99 € HT.</p>`
            : `<p>Bonjour ${ag.prenom},</p><p>Votre compte STACK Partners a été temporairement suspendu pour mise à jour réglementaire. Rendez-vous dans votre espace Conformité.</p>`
        }).catch(() => {});
      }
      return res.json({ message: `Statut du compte mis à jour (${decision}) et agent notifié par e-mail.` });
    }

    const allowedFields = ['statut_contrat', 'statut_identite', 'statut_siret', 'statut_rsac', 'statut_kbis', 'statut_urssaf', 'statut_rc_pro', 'statut_iban', 'statut_tva'];
    if (!allowedFields.includes(champ_statut)) {
      return res.status(400).json({ error: "Champ de statut non reconnu" });
    }

    if (purge_identite_rgpd && champ_statut === 'statut_identite' && decision === 'VALIDE') {
      await pool.query(`UPDATE partner_conformite_dossier SET statut_identite = 'VALIDE', fichier_identite = NULL, updated_at = NOW() WHERE id_agent = $1`, [idAgentCible]);
    } else {
      await pool.query(`UPDATE partner_conformite_dossier SET ${champ_statut} = $1, updated_at = NOW() WHERE id_agent = $2`, [decision, idAgentCible]);
    }

    if (decision === 'REFUSE') {
      await pool.query(`UPDATE partner_agents SET statut_compte = 'BLOQUE_CONFORMITE' WHERE id_agent = $1`, [idAgentCible]);
    }

    await pool.query(
      `INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, commentaire, verifie_par)
       VALUES ($1, $2, 'VERIFICATION_FONDATEUR', $3, $4, 'Fondateur (God Mode)')`,
      [idAgentCible, champ_statut.toUpperCase(), decision, commentaire || 'Vérifié']
    ).catch(() => {});

    res.json({ message: `Pièce ${champ_statut} marquée comme ${decision}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 15. GOD MODE - Récupérer les commissions "Acquises" (suspendues si une pièce de l'agent est expirée ou refusée)
router.get('/admin/commissions', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, a.nom, a.prenom, a.iban, a.email, a.statut_compte, s.nom_salon,
                   d.date_expiration_urssaf, d.date_expiration_rc_pro, d.statut_urssaf, d.statut_rc_pro
            FROM partner_commissions c
            JOIN partner_agents a ON a.id_agent = c.id_agent
            LEFT JOIN partner_conformite_dossier d ON d.id_agent = c.id_agent
            JOIN configuration_salon s ON s.id_salon = c.id_salon
            WHERE c.statut_commission = 'ACQUISE_A_PAYER'
            ORDER BY c.id_commission ASC
        `);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: "Erreur serveur" }); }
});

// 16. GOD MODE - Marquer une commission comme payée (bloqué si l'agent n'est plus conforme)
router.patch('/admin/commissions/:id/payer', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    try {
        const comRes = await pool.query('SELECT id_agent FROM partner_commissions WHERE id_commission = $1', [req.params.id]);
        if (comRes.rowCount > 0) {
            const verif = await evaluerConformiteAgent(comRes.rows[0].id_agent);
            if (!verif.autorise) {
                return res.status(403).json({ error: `Paiement suspendu : Dossier agent non conforme (${verif.motifs[0]})` });
            }
        }
        await pool.query("UPDATE partner_commissions SET statut_commission = 'PAYEE' WHERE id_commission = $1", [req.params.id]);
        res.json({ message: "Commission clôturée" });
    } catch (error) { res.status(500).json({ error: "Erreur serveur" }); }
});

// 17. CARTE DE PROSPECTION - Salons de coiffure dans un rayon de X km + Statut STACK en temps réel
const calculerDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

router.get('/map-salons', verifierTokenPartner, async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat) || 48.5734;
        const lng = parseFloat(req.query.lng) || 7.7521;
        const radius = Math.min(Math.max(parseFloat(req.query.radius) || 5, 1), 50);

        // A. Récupérer les salons déjà clients STACK et les prospects verrouillés en base
        const [clientsRes, prospectsRes] = await Promise.all([
            pool.query('SELECT id_salon, nom_salon, siret FROM configuration_salon'),
            pool.query(`
                SELECT id_prospect, id_agent, nom_salon, siret_prospect, email_gerant, ville, code_postal,
                       GREATEST(0, EXTRACT(DAY FROM (date_expiration_protection - CURRENT_TIMESTAMP))::INT) as jours_restants
                FROM partner_prospects_reservations
                WHERE date_expiration_protection > CURRENT_TIMESTAMP
            `)
        ]);

        const clientsSiret = new Set(clientsRes.rows.map(c => (c.siret || '').replace(/\s/g, '')).filter(Boolean));
        const clientsNoms = new Set(clientsRes.rows.map(c => (c.nom_salon || '').trim().toLowerCase()).filter(Boolean));

        const prospectsBySiret = new Map();
        const prospectsByNom = new Map();
        for (const p of prospectsRes.rows) {
            const cleanSiret = (p.siret_prospect || '').replace(/\s/g, '');
            if (cleanSiret) prospectsBySiret.set(cleanSiret, p);
            if (p.nom_salon) prospectsByNom.set(p.nom_salon.trim().toLowerCase(), p);
        }

        // B. Interroger l'API officielle SIRENE / INSEE (Salons de coiffure : NAF 96.02A) autour du point GPS
        const pages = [1, 2];
        const apiResponses = await Promise.all(
            pages.map(page =>
                fetch(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat}&long=${lng}&radius=${radius}&activite_principale=96.02A&etat_administratif=A&per_page=25&page=${page}`)
                    .then(r => (r.ok ? r.json() : { results: [] }))
                    .catch(() => ({ results: [] }))
            )
        );

        const salonsMap = new Map();

        for (const data of apiResponses) {
            for (const entreprise of (data.results || [])) {
                for (const etab of (entreprise.matching_etablissements || [])) {
                    const eLat = parseFloat(etab.latitude);
                    const eLng = parseFloat(etab.longitude);
                    if (isNaN(eLat) || isNaN(eLng)) continue;

                    const distKm = calculerDistanceKm(lat, lng, eLat, eLng);
                    if (distKm > radius) continue;

                    const siret = (etab.siret || '').replace(/\s/g, '');
                    if (!siret || salonsMap.has(siret)) continue;

                    const enseigne = (etab.liste_enseignes && etab.liste_enseignes[0]) || entreprise.nom_complet || 'Salon de Coiffure';
                    const nomNorm = enseigne.trim().toLowerCase();

                    // C. Déterminer le statut évolutif du salon
                    let statut_carte = 'LIBRE';
                    let jours_restants = null;
                    let id_prospect = null;

                    if (clientsSiret.has(siret) || clientsNoms.has(nomNorm)) {
                        statut_carte = 'CLIENT_STACK';
                    } else if (prospectsBySiret.has(siret) || prospectsByNom.has(nomNorm)) {
                        const reservation = prospectsBySiret.get(siret) || prospectsByNom.get(nomNorm);
                        statut_carte = reservation.id_agent === req.agent.id_agent ? 'PROSPECTE_MOI' : 'PROSPECTE_AUTRE';
                        jours_restants = reservation.jours_restants;
                        id_prospect = reservation.id_prospect;
                    }

                    salonsMap.set(siret, {
                        siret,
                        nom_salon: enseigne,
                        adresse: etab.adresse || '',
                        code_postal: etab.code_postal || '',
                        ville: etab.libelle_commune || '',
                        lat: eLat,
                        lng: eLng,
                        distance_km: Number(distKm.toFixed(2)),
                        statut_carte,
                        jours_restants,
                        id_prospect
                    });
                }
            }
        }

        const salons = Array.from(salonsMap.values()).sort((a, b) => a.distance_km - b.distance_km);
        res.json({ center: { lat, lng }, radius, total: salons.length, salons });
    } catch (error) {
        console.error("Erreur GET /map-salons:", error);
        res.status(500).json({ error: "Erreur lors du chargement de la carte des salons." });
    }
});

// 18. API YOUSIGN - Génération du lien de signature du contrat de mandat (Sécurisée & Base de données corrigée)
router.post('/profil/yousign/initiate', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = req.agent?.id_agent || req.agent?.id || req.user?.id_agent || req.user?.id;

    const agentRes = await pool.query('SELECT nom, prenom, email FROM partner_agents WHERE id_agent = $1', [idAgent]);
    if (agentRes.rows.length === 0) throw new Error("Agent introuvable dans la base.");
    const agent = agentRes.rows[0];

    const YOUSIGN_API_KEY = process.env.YOUSIGN_API_KEY;
    if (!YOUSIGN_API_KEY) {
      throw new Error("La clé API Yousign n'est pas détectée par le serveur. Vérifiez Render.");
    }

    // ÉTAPE 1 : Créer la demande
    const srRes = await fetch('https://api-sandbox.yousign.app/v3/signature_requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Mandat Commercial STACK - ${agent.prenom} ${agent.nom}`,
        delivery_mode: 'none',
        timezone: 'Europe/Paris'
      })
    });
    
    if (!srRes.ok) {
       const errText = await srRes.text();
       throw new Error(`Étape 1 (Demande) refusée par Yousign : ${errText}`);
    }
    const signatureRequestId = (await srRes.json()).id;

    // Faux PDF vierge pour tester la Sandbox
    const pdfBase64 = "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bWFnZUIgL0ltYWdlQyAvSW1hZ2VJXQovRXh0R1N0YXRlIDw8L0czIDMgMCBSPj4KL0ZvbnQgPDwvRjQgNCAwIFIKL0Y1IDUgMCBSPj4+PgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNiAwIFIKL1N0cnVjdFBhcmVudHMgMAovVGFicyAvUwovUGFyZW50IDEzIDAgUj4+CmVuZG9iago3IDAgb2JqCjw8L1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PC9Qcm9jU2V0IFsvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJXQovRXh0R1N0YXRlIDw8L0czIDMgMCBSPj4KL0ZvbnQgPDwvRjQgNCAwIFIKL0Y1IDUgMCBSCi9GOCA4IDAgUgovRjkgOSAwIFI+Pj4+Ci9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCi9Db250ZW50cyAxMCAwIFIKL1N0cnVjdFBhcmVudHMgMQovVGFicyAvUwovUGFyZW50IDEzIDAgUj4+CmVuZG9iagoxMSAwIG9iago8PC9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwvUHJvY1NldCBbL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSV0KL0V4dEdTdGF0ZSA8PC9HMyAzIDAgUj4+Ci9Gb250IDw8L0Y1IDUgMCBSPj4+PgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgMTIgMCBSCi9TdHJ1Y3RQYXJlbnRzIDIKL1RhYnMgL1MKL1BhcmVudCAxMyAwIFI+PgplbmRvYmoKMTMgMCBvYmoKPDwvVHlwZSAvUGFnZXMKL0NvdW50IDMKL0tpZHMgWzIgMCBSIDcgMCBSIDExIDAgUl0+PgplbmRvYmoKMTYgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDA+PgplbmRvYmoKMTcgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDE+PgplbmRvYmoKMTggMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDI+PgplbmRvYmoKMTkgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDM+PgplbmRvYmoKMjAgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDQ+PgplbmRvYmoKMjEgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDU+PgplbmRvYmoKMjIgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDY+PgplbmRvYmoKMjMgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDc+PgplbmRvYmoKMjQgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDIgMCBSCi9LIDg+PgplbmRvYmoKMjYgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvTEkKL1AgMjUgMCBSCi9QZyAyIDAgUgovSyA5Pj4KZW5kb2JqCjI3IDAgb2JqCjw8L1R5cGUgL1N0cnVjdEVsZW0KL1MgL0xJCi9QIDI1IDAgUgovUGcgMiAwIFIKL0sgMTA+PgplbmRvYmoKMjggMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvTEkKL1AgMjUgMCBSCi9QZyAyIDAgUgovSyAxMT4+CmVuZG9iagoyOSAwIG9iago8PC9UeXBlIC9TdHJ1Y3RFbGVtCi9TIC9MSQovUCAyNSAwIFIKL1BnIDIgMCBSCi9LIDEyPj4KZW5kb2JqCjI1IDAgb2JqCjw8L1R5cGUgL1N0cnVjdEVsZW0KL1MgL0wKL1AgMTUgMCBSCi9LIFsyNiAwIFIgMjcgMCBSIDI4IDAgUiAyOSAwIFJdPj4KZW5kb2JqCjMwIDAgb2JqCjw8L1R5cGUgL1N0cnVjdEVsZW0KL1MgL1AKL1AgMTUgMCBSCi9QZyAyIDAgUgovSyAxMz4+CmVuZG9iagozMiAwIG9iago8PC9UeXBlIC9TdHJ1Y3RFbGVtCi9TIC9MSQovUCAzMSAwIFIKL1BnIDcgMCBSCi9LIDA+PgplbmRvYmoKMzMgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvTEkKL1AgMzEgMCBSCi9QZyA3IDAgUgovSyAxPj4KZW5kb2JqCjM0IDAgb2JqCjw8L1R5cGUgL1N0cnVjdEVsZW0KL1MgL0xJCi9QIDMxIDAgUgovUGcgNyAwIFIKL0sgMj4+CmVuZG9iagozNSAwIG9iago8PC9UeXBlIC9TdHJ1Y3RFbGVtCi9TIC9MSQovUCAzMSAwIFIKL1BnIDcgMCBSCi9LIDM+PgplbmRvYmoKMzEgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvTAovUCAxNSAwIFIKL0sgWzMyIDAgUiAzMyAwIFIgMzQgMCBSIDM1IDAgUl0+PgplbmRvYmoKMzYgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDQ+PgplbmRvYmoKMzcgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDU+PgplbmRvYmoKMzggMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDY+PgplbmRvYmoKMzkgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDc+PgplbmRvYmoKNDAgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDg+PgplbmRvYmoKNDEgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDk+PgplbmRvYmoKNDIgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvUAovUCAxNSAwIFIKL1BnIDcgMCBSCi9LIDEwPj4KZW5kb2JqCjQzIDAgb2JqCjw8L1R5cGUgL1N0cnVjdEVsZW0KL1MgL1AKL1AgMTUgMCBSCi9QZyA3IDAgUgovSyAxMT4+CmVuZG9iago0NCAwIG9iago8PC9UeXBlIC9TdHJ1Y3RFbGVtCi9TIC9QCi9QIDE1IDAgUgovUGcgMTEgMCBSCi9LIDA+PgplbmRvYmoKMTUgMCBvYmoKPDwvVHlwZSAvU3RydWN0RWxlbQovUyAvRG9jdW1lbnQKL1AgMTQgMCBSCi9LIFsxNiAwIFIgMTcgMCBSIDE4IDAgUiAxOSAwIFIgMjAgMCBSIDIxIDAgUiAyMiAwIFIgMjMgMCBSIDI0IDAgUiAyNSAwIFIgMzAgMCBSIDMxIDAgUiAzNiAwIFIgMzcgMCBSIDM4IDAgUiAzOSAwIFIgNDAgMCBSIDQxIDAgUiA0MiAwIFIgNDMgMCBSIDQ0IDAgUl0+PgplbmRvYmoKNDUgMCBvYmoKWzE2IDAgUiAxNyAwIFIgMTggMCBSIDE5IDAgUiAyMCAwIFIgMjEgMCBSIDIyIDAgUiAyMyAwIFIgMjQgMCBSIDI2IDAgUiAyNyAwIFIgMjggMCBSIDI5IDAgUiAzMCAwIFJdCmVuZG9iago0NiAwIG9iagpbMzIgMCBSIDMzIDAgUiAzNCAwIFIgMzUgMCBSIDM2IDAgUiAzNyAwIFIgMzggMCBSIDM5IDAgUiA0MCAwIFIgNDEgMCBSIDQyIDAgUiA0MyAwIFJdCmVuZG9iago0NyAwIG9iagpbNDQgMCBSXQplbmRvYmoKNDggMCBvYmoKPDwvVHlwZSAvUGFyZW50VHJlZQovTnVtcyBbMCA0NSAwIFIgMSA0NiAwIFIgMiA0NyAwIFJdPj4KZW5kb2JqCjE0IDAgb2JqCjw8L1R5cGUgL1N0cnVjdFRyZWVSb290Ci9LIDE1IDAgUgovUGFyZW50VHJlZU5leHRLZXkgMwovUGFyZW50VHJlZSA0OCAwIFI+PgplbmRvYmoKNDkgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZwovUGFnZXMgMTMgMCBSCi9NYXJrSW5mbyA8PC9UeXBlIC9NYXJrSW5mbwovTWFya2VkIHRydWU+PgovU3RydWN0VHJlZVJvb3QgMTQgMCBSCi9WaWV3ZXJQcmVmZXJlbmNlcyA8PC9UeXBlIC9WaWV3ZXJQcmVmZXJlbmNlcwovRGlzcGxheURvY1RpdGxlIHRydWU+PgovTGFuZyAoZW4pPj4KZW5kb2JqCjUwIDAgb2JqCjw8L0xlbmd0aDEgMzUz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3M3XcyfhJ8soIrakPkOgWoQtv+6dNaXS87tLpTXvcCd73+ndXSpRtvuGt3sJIf8fkC8gggplbmRzdHJlYW0KZW5kb2JqCjU1IDAgb2JqCjw8L1R5cGUgL0ZvbnREZXNjcmlwdG9yCi9Gb250TmFtZSAvQkFBQUFBK0FyaWFsTVQKL0ZsYWdzIDQKL0FzY2VudCA5MDUuMjczNDQKL0Rlc2NlbnQgLTIxMS45MTQwNgovU3RlbVYgNDUuODk4NDM4Ci9DYXBIZWlnaHQgNzE1LjgyMDMxCi9JdGFsaWNBbmdsZSAwCi9Gb250QkJveCBbLTY2NC41NTA3OCAtMzI0LjcwNzAzIDIwMDAgMTAwNS44NTkzOF0KL0ZvbnRGaWxlMiA1NCAwIFI+PgplbmRvYmoKNTYgMCBvYmoKPDwvVHlwZSAvRm9udAovRm9udERlc2NyaXB0b3IgNTUgMCBSCi9CYXNlRm9udCAvQkFBQUFBK0FyaWFsTVQKL1N1YnR5cGUgL0NJREZvbnRUeXBlMgovQ0lEVG9HSURNYXAgL0lkZW50aXR5Ci9DSURTeXN0ZW1JbmZvIDw8L1JlZ2lzdHJ5IChBZG9iZSkKL09yZGVyaW5nIChJZGVudGl0eSkKL1N1cHBsZW1lbnQgMD4+Ci9XIFswIFs3NTAgMCAwIDI3Ny44MzIwMyAwIDM1NC45ODA0N10gMTAgWzE5MC45MTc5NyAzMzMuMDA3ODEgMzMzLjAwNzgxIDAgMCAyNzcuODMyMDMgMzMzLjAwNzgxIDI3Ny44MzIwMyAyNzcuODMyMDNdIDE5IDI0IDU1Ni4xNTIzNCAyOSBbMjc3LjgzMjAzXSAzNiBbNjY2Ljk5MjE5IDAgNzIyLjE2Nzk3IDAgNjY2Ljk5MjE5IDYxMC44Mzk4NCA3NzcuODMyMDMgMCAyNzcuODMyMDMgMCA2NjYuOTkyMTkgNTU2LjE1MjM0IDgzMy4wMDc4MSA3MjIuMTY3OTcgMCA2NjYuOTkyMTkgMCA3MjIuMTY3OTcgNjY2Ljk5MjE5IDYxMC44Mzk4NCA3MjIuMTY3OTcgNjY2Ljk5MjE5XSA2MiA2NCAyNzcuODMyMDMgNjggNjkgNTU2LjE1MjM0IDcxIDcyIDU1Ni4xNTIzNCA3MyBbMjc3LjgzMjAzIDU1Ni4xNTIzNCA1NTYuMTUy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MCBuIAowMDAwMDIxMzEwIDAwMDAwIG4gCjAwMDAwMjIyMzkgMDAwMDAgbiAKMDAwMDAyNDg4OSAwMDAwMCBuIAowMDAwMDI0MzYwIDAwMDAwIG4gCjAwMDAwMjIzMDggMDAwMDAgbiAKMDAwMDAyMjM3NyAwMDAwMCBuIAowMDAwMDIyNDQ2IDAwMDAwIG4gCjAwMDAwMjI1MTUgMDAwMDAgbiAKMDAwMDAyMjU4NCAwMDAwMCBuIAowMDAwMDIyNjUzIDAwMDAwIG4gCjAwMDAwMjI3MjIgMDAwMDAgbiAKMDAwMDAyMjc5MSAwMDAwMCBuIAowMDAwMDIyODYwIDAwMDAwIG4gCjAwMDAwMjMyMTIgMDAwMDAgbiAKMDAwMDAyMjkyOSAwMDAwMCBuIAowMDAwMDIyOTk5IDAwMDAwIG4gCjAwMDAwMjMwNzAgMDAwMDAgbiAKMDAwMDAyMzE0MSAwMDAwMCBuIAowMDAwMDIzMjk5IDAwMDAwIG4gCjAwMDAwMjM2NDkgMDAwMDAgbiAKMDAwMDAyMzM2OSAwMDAwMCBuIAowMDAwMDIzNDM5IDAwMDAwIG4gCjAwMDAwMjM1MDkgMDAwMDAgbiAKMDAwMDAyMzU3OSAwMDAwMCBuIAowMDAwMDIzNzM2IDAwMDAwIG4gCjAwMDAwMjM4MDUgMDAwMDAgbiAKMDAwMDAyMzg3NCAwMDAwMCBuIAowMDAwMDIzOTQzIDAwMDAwIG4gCjAwMDAwMjQwMTIgMDAwMDAgbiAKMDAwMDAyNDA4MSAwMDAwMCBuIAowMDAwMDI0MTUwIDAwMDAwIG4gCjAwMDAwMjQyMjAgMDAwMDAgbiAKMDAwMDAyNDI5MCAwMDAwMCBuIAowMDAwMDI0NTczIDAwMDAwIG4gCjAwMDAwMjQ2ODkgMDAwMDAgbiAKMDAwMDAyNDc5MSAwMDAwMCBuIAowMDAwMDI0ODE2IDAwMDAwIG4gCjAwMDAwMjQ5ODEgMDAwMDAgbiAKMDAwMDAyNTE3NyAwMDAwMCBuIAowMDAwMDQ4MDc1IDAwMDAwIG4gCjAwMDAwNDgzMTYgMDAwMDAgbiAKMDAwMDA0OTA4MCAwMDAwMCBuIAowMDAwMDQ5NjM5IDAwMDAwIG4gCjAwMDAwNzQ3NzAgMDAwMDAgbiAKMDAwMDA3NTAwNiAwMDAwMCBuIAowMDAwMDc1Nzc1IDAwMDAwIG4gCjAwMDAwNzYzNjggMDAwMDAgbiAKMDAwMDA4ODY2NiAwMDAwMCBuIAowMDAwMDg4OTIzIDAwMDAwIG4gCjAwMDAwODkzMjEgMDAwMDAgbiAKMDAwMDA4OTgzMSAwMDAwMCBuIAowMDAwMTAxMTQyIDAwMDAwIG4gCjAwMDAxMDEzOTQgMDAwMDAgbiAKMDAwMDEwMTgyNCAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNjYKL1Jvb3QgNDkgMCBSCi9JbmZvIDEgMCBSPj4Kc3RhcnR4cmVmCjEwMjM1NQolJUVPRgo=";
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // ÉTAPE 2 : Upload Multipart Binaire
    const boundary = '----YousignBoundary' + Date.now().toString(16);
    let bodyData = [];
    bodyData.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="contrat.pdf"\r\nContent-Type: application/pdf\r\n\r\n`));
    bodyData.push(pdfBuffer);
    bodyData.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="nature"\r\n\r\nsignable_document\r\n--${boundary}--\r\n`));

    const docRes = await fetch(`https://api-sandbox.yousign.app/v3/signature_requests/${signatureRequestId}/documents`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${YOUSIGN_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: Buffer.concat(bodyData)
    });
    
    if (!docRes.ok) {
       const errText = await docRes.text();
       throw new Error(`Étape 2 (Fichier) refusée par Yousign : ${errText}`);
    }
    const documentId = (await docRes.json()).id;

    // ÉTAPE 3 : Ajouter le signataire 
    const emailPourSandbox = 'tardy.valentin04@gmail.com'; 

    const signerRes = await fetch(`https://api-sandbox.yousign.app/v3/signature_requests/${signatureRequestId}/signers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        info: { 
          first_name: (agent.prenom || 'Agent').trim(), 
          last_name: (agent.nom || 'STACK').trim(), 
          email: emailPourSandbox, 
          locale: 'fr' 
        },
        signature_level: 'electronic_signature',
        signature_authentication_mode: 'no_otp',
        fields: [{ 
          type: 'signature', 
          document_id: documentId, 
          page: 1, 
          width: 150, 
          height: 50, 
          x: 50, 
          y: 50 
        }]
      })
    });
    
    if (!signerRes.ok) {
       const errText = await signerRes.text();
       throw new Error(`Étape 3 (Signataire) refusée par Yousign : ${errText}`);
    }
    const createdSigner = await signerRes.json();

    // ÉTAPE 4 : Activer le contrat (C'est CETTE étape qui génère réellement le signature_link dans Yousign v3 !)
    const actRes = await fetch(`https://api-sandbox.yousign.app/v3/signature_requests/${signatureRequestId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    if (!actRes.ok) {
       const errText = await actRes.text();
       throw new Error(`Étape 4 (Activation) refusée par Yousign : ${errText}`);
    }
    const activatedData = await actRes.json();

    // ÉTAPE 5 : Extraire le lien généré après activation (ou relire le signataire si besoin)
    let signatureLink = activatedData?.signers?.[0]?.signature_link || null;
    if (!signatureLink && createdSigner?.id) {
      const getSignerRes = await fetch(`https://api-sandbox.yousign.app/v3/signature_requests/${signatureRequestId}/signers/${createdSigner.id}`, {
        headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}` }
      });
      if (getSignerRes.ok) {
        const signerDetail = await getSignerRes.json();
        signatureLink = signerDetail.signature_link || null;
      }
    }

    if (!signatureLink) {
      throw new Error(`Yousign a activé la demande (${signatureRequestId}) mais n'a renvoyé aucun signature_link. Réponse brute : ${JSON.stringify(activatedData)}`);
    }

    // 1. Sauvegarde de l'ID ET du lien Yousign directement sur l'Agent
    await pool.query(`
      ALTER TABLE partner_agents 
      ADD COLUMN IF NOT EXISTS id_yousign_request VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS url_yousign_contrat TEXT DEFAULT NULL;
    `).catch(() => {});
    await pool.query(`UPDATE partner_agents SET id_yousign_request = $1, url_yousign_contrat = $2 WHERE id_agent = $3`, [signatureRequestId, signatureLink, idAgent]);

    // 2. Passage en EN_ATTENTE_SIGNATURE dans partner_conformite_dossier
    await pool.query(`INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING`, [idAgent]);
    await pool.query(`
      UPDATE partner_conformite_dossier 
      SET contrat_signe = FALSE, statut_contrat = 'EN_ATTENTE_SIGNATURE', updated_at = NOW()
      WHERE id_agent = $1
    `, [idAgent]);

    res.json({
      require_redirect: true,
      redirect_url: signatureLink,
      message: "Redirection vers Yousign en cours..."
    });

  } catch (err) {
    console.error("CRASH YOUSIGN INTERNE:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// 19. API YOUSIGN - Vérifier si l'agent a RÉELLEMENT signé le contrat
router.get('/profil/yousign/check', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = req.agent?.id_agent || req.agent?.id || req.user?.id_agent || req.user?.id;

    await pool.query(`
      ALTER TABLE partner_agents 
      ADD COLUMN IF NOT EXISTS id_yousign_request VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS url_yousign_contrat TEXT DEFAULT NULL;
    `).catch(() => {});

    const agentRes = await pool.query('SELECT id_yousign_request, url_yousign_contrat FROM partner_agents WHERE id_agent = $1', [idAgent]);
    const reqId = agentRes.rows[0]?.id_yousign_request;
    const savedUrl = agentRes.rows[0]?.url_yousign_contrat || null;

    if (!reqId) return res.json({ status: 'manquant' });

    const checkRes = await fetch(`https://api-sandbox.yousign.app/v3/signature_requests/${reqId}`, {
      headers: { 'Authorization': `Bearer ${process.env.YOUSIGN_API_KEY}` }
    });

    if (!checkRes.ok) throw new Error("Erreur API Yousign lors de la vérification.");
    const data = await checkRes.json();

    if (data.status === 'done') {
       await pool.query(`INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING`, [idAgent]);
       await pool.query(`
         UPDATE partner_conformite_dossier 
         SET contrat_signe = TRUE, statut_contrat = 'VALIDE', date_signature_contrat = NOW(), updated_at = NOW()
         WHERE id_agent = $1
       `, [idAgent]);
       return res.json({ status: 'done', message: "Parfait, le contrat est officiellement signé !" });
    } else {
       return res.json({
         status: data.status,
         signature_link: savedUrl,
         message: "Le contrat n'est pas encore signé sur Yousign."
       });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ============================================================================
// PHASE 4 : GÉNÉRATEUR DES 3 SIMULATEURS BACS À SABLE (SANDBOX)
// ============================================================================

router.post('/sandbox/launch', verifierTokenPartner, async (req, res) => {
    const clientDB = await pool.connect();
    try {
        const idAgent = req.agent.id_agent;
        const { type } = req.body; // 'VIDE' | 'DEMO' | 'ONBOARDING'

        const agentRes = await clientDB.query('SELECT nom, prenom, code_partenaire FROM partner_agents WHERE id_agent = $1', [idAgent]);
        const agent = agentRes.rows[0];

        await clientDB.query('BEGIN');

        // Nettoyage automatique des bacs à sable expirés (> 24h)
        await clientDB.query(`DELETE FROM configuration_salon WHERE est_bac_a_sable = TRUE AND date_expiration_sandbox < NOW()`);

        const timestamp = Date.now().toString().slice(-5);
        const emailSandbox = `sandbox.${type.toLowerCase()}.${idAgent}.${timestamp}@stack-sim.fr`;
        const passwordHash = await bcrypt.hash('Sandbox123!', 10);
        const defaultPinHash = await bcrypt.hash('0000', 10);

        const nomSalon = type === 'DEMO' 
            ? `Maison Éclat — Démo (${agent.prenom})` 
            : type === 'VIDE' 
                ? `Salon Vierge d'Entraînement (${agent.prenom})` 
                : `Salon Test Onboarding (${agent.prenom})`;

        // Seul le salon DEMO a déjà sa checklist Go-Live validée à 100% pour encaisser tout de suite
        const isCompleted = type === 'DEMO';

        const salonInsert = await clientDB.query(
            `INSERT INTO configuration_salon (
                nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur,
                etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok,
                statut_onboarding, est_bac_a_sable, type_bac_a_sable, date_expiration_sandbox
            ) VALUES (
                $1, NOW() + INTERVAL '1 day', 'PREMIUM_TRIAL', $2,
                $3, $3, $3, $3, $3,
                $4, TRUE, $5, NOW() + INTERVAL '24 hours'
            ) RETURNING id_salon`,
            [nomSalon, idAgent, isCompleted, isCompleted ? 'TERMINE' : 'EN_COURS', type]
        );
        const idSalon = salonInsert.rows[0].id_salon;

        await clientDB.query(
            `INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, statut_abonnement) 
             VALUES ($1, $2, $3, 'gerant', 'actif')`,
            [emailSandbox, passwordHash, idSalon]
        );

        await clientDB.query(
            `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) 
             VALUES ($1, 'Gérant', $2, $3, TRUE)`,
            [`${agent.prenom} (Gérant Test)`, idSalon, defaultPinHash]
        );

        // Si mode DEMO : Pré-remplissage complet (Employés + Catalogue de prestations)
        if (type === 'DEMO') {
            await clientDB.query(
                `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES 
                 ('Camille (Coiffeuse Senior)', 'Employé', $1, $2, FALSE),
                 ('Lucas (Barbier / Coloriste)', 'Employé', $1, $2, FALSE)`,
                [idSalon, defaultPinHash]
            );

            // Insertion sécurisée dans le catalogue (ignore si le schéma d'articles diffère légèrement)
            await clientDB.query(`SAVEPOINT sp_catalogue`);
            try {
                await clientDB.query(
                    `INSERT INTO articles (nom, prix, categorie, id_salon, stock) VALUES 
                     ('Coupe + Brushing Signature', 58, 'Prestation', $1, 999),
                     ('Balayage Minéral & Patine', 135, 'Prestation', $1, 999),
                     ('Coupe Homme & Taille de Barbe', 42, 'Prestation', $1, 999),
                     ('Soin Profond Kératine', 45, 'Prestation', $1, 999),
                     ('Shampoing Pro Réparateur 250ml', 28, 'Produit', $1, 24)`,
                    [idSalon]
                );
            } catch (errCatalogue) {
                await clientDB.query(`ROLLBACK TO SAVEPOINT sp_catalogue`);
            }
        }

        await clientDB.query('COMMIT');

        // Génération du Token de connexion directe pour le salon
        const payload = { id_salon: idSalon, role: 'gerant', email: emailSandbox };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        const FRONTEND_CAISSE_URL = process.env.FRONTEND_CAISSE_URL || 'https://app-salon-caiss.onrender.com';

        res.json({
            type,
            nom_salon: nomSalon,
            email_test: emailSandbox,
            mot_de_passe_test: 'Sandbox123!',
            code_partenaire: agent.code_partenaire,
            url_directe: `${FRONTEND_CAISSE_URL}/?sandbox_token=${encodeURIComponent(token)}&partner=${encodeURIComponent(agent.code_partenaire)}`
        });
    } catch (error) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur création Sandbox:", error);
        res.status(500).json({ error: "Impossible de générer le salon de simulation." });
    } finally {
        clientDB.release();
    }
});

// ============================================================================
// CORRECTIFS GLOBAUX STACK PARTNERS :
// 1. Auto-purge 24h des salons vides + Stockage du modèle Démo personnalisé
// 2. Filtre SQL strict des Commissions (Exclut Bacs à sable & PREMIUM_TRIAL)
// 3. Signature Yousign + Fallback automatique
// 4. Simulateur Démo riche (Articles, Clients, Équipe, Sauvegarde & Reset)
// 5. Carte de Prospection Exhaustive (Multi-pages INSEE 96.02A/96.02B + Overpass OSM)
// ============================================================================

// ============================================================================
// CORRECTIFS ROBUSTES : DASHBOARD-STATS, SANDBOX DÉMO & CARTE GPS EXHAUSTIVE
// ============================================================================

// Helper universel pour récupérer l'ID de l'agent quel que soit le nom dans le middleware JWT
const getAgentIdFromReq = (req) => req.agent?.id_agent || req.agent?.id || req.user?.id_agent || req.user?.id;

// Nettoyage propre des routes précédentes pour éviter tout conflit Express
    const routesToOverride = ['/dashboard-stats', '/sandbox/launch', '/map-salons'];
    if (Array.isArray(router.stack)) {
      router.stack = router.stack.filter(layer => !layer.route || !routesToOverride.includes(layer.route.path));
    }


// 3. ROUTE SANDBOX LAUNCH (Sans blocage de transaction PostgreSQL)
const DEFAULT_DEMO_TEMPLATE = {
  employes: [
    { nom: 'Camille (Directrice Artistique)', role: 'Employé' },
    { nom: 'Lucas (Maître Barbier & Coloriste)', role: 'Employé' },
    { nom: 'Sarah (Spécialiste Balayage & Soins)', role: 'Employé' }
  ],
  articles: [
    { nom: 'Coupe Femme + Shampoing + Brushing Signature', prix: 58, categorie: 'Prestation', stock: 999 },
    { nom: 'Balayage Minéral + Patine Gloss + Soin', prix: 145, categorie: 'Prestation', stock: 999 },
    { nom: 'Coupe Homme Dégradé Américain & Barbe', prix: 42, categorie: 'Prestation', stock: 999 },
    { nom: 'Soin Profond Botox & Kératine Végétale', prix: 65, categorie: 'Prestation', stock: 999 },
    { nom: 'Coloration Racines Sans Ammoniaque', prix: 72, categorie: 'Prestation', stock: 999 },
    { nom: 'Shampoing Réparateur Pro Kératine 250ml', prix: 29, categorie: 'Produit', stock: 18 },
    { nom: 'Masque Nutritif Intense Argan 500ml', prix: 44, categorie: 'Produit', stock: 12 }
  ],
  clients: [
    { nom: 'Sophie Martin', telephone: '0612345678', email: 'sophie.martin@exemple.fr' },
    { nom: 'Thomas Bernard', telephone: '0698765432', email: 'thomas.b@exemple.fr' },
    { nom: 'Clara Dubois', telephone: '0645678910', email: 'clara.dubois@exemple.fr' }
  ]
};

// Fonction de peuplement hors transaction bloquante (chaque requête est isolée sur pool)
async function peuplerSalonDemoSafe(idSalon, template, defaultPinHash, prenomAgent) {
  await pool.query(`DELETE FROM employes WHERE id_salon = $1`, [idSalon]).catch(() => {});
  await pool.query(`DELETE FROM articles WHERE id_salon = $1`, [idSalon]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE id_salon = $1`, [idSalon]).catch(() => {});

  await pool.query(
    `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)`,
    [`${prenomAgent} (Gérant Démo)`, idSalon, defaultPinHash]
  ).catch(() => {});

  for (const emp of (template?.employes || DEFAULT_DEMO_TEMPLATE.employes)) {
    await pool.query(
      `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, $2, $3, $4, FALSE)`,
      [emp.nom, emp.role || 'Employé', idSalon, defaultPinHash]
    ).catch(() => {});
  }

  for (const art of (template?.articles || DEFAULT_DEMO_TEMPLATE.articles)) {
    try {
      await pool.query(
        `INSERT INTO articles (nom, prix, categorie, id_salon, stock) VALUES ($1, $2, $3, $4, $5)`,
        [art.nom, art.prix, art.categorie || 'Prestation', idSalon, art.stock ?? 99]
      );
    } catch (e1) {
      await pool.query(
        `INSERT INTO articles (nom, prix, id_salon) VALUES ($1, $2, $3)`,
        [art.nom, art.prix, idSalon]
      ).catch(() => {});
    }
  }

  for (const cli of (template?.clients || DEFAULT_DEMO_TEMPLATE.clients)) {
    try {
      await pool.query(
        `INSERT INTO clients (nom, telephone, email, id_salon) VALUES ($1, $2, $3, $4)`,
        [cli.nom, cli.telephone, cli.email, idSalon]
      );
    } catch (e1) {
      await pool.query(
        `INSERT INTO clients (nom, telephone, id_salon) VALUES ($1, $2, $3)`,
        [cli.nom, cli.telephone, idSalon]
      ).catch(() => {});
    }
  }
}

router.post('/sandbox/launch', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const { type = 'DEMO', action = 'LAUNCH' } = req.body;

    // Garantit que toutes les colonnes existent avant de commencer
    await pool.query(`
      ALTER TABLE partner_agents 
      ADD COLUMN IF NOT EXISTS demo_custom_snapshot JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS id_salon_demo_actif INTEGER DEFAULT NULL;
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE configuration_salon 
      ADD COLUMN IF NOT EXISTS etape_materiel_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_catalogue_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_equipe_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_stripe_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_formation_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS statut_onboarding VARCHAR(30) DEFAULT 'EN_COURS',
      ADD COLUMN IF NOT EXISTS est_bac_a_sable BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS type_bac_a_sable VARCHAR(30) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS date_expiration_sandbox TIMESTAMP DEFAULT NULL;
    `).catch(() => {});

    const agentRes = await pool.query(
      'SELECT nom, prenom, code_partenaire, demo_custom_snapshot, id_salon_demo_actif FROM partner_agents WHERE id_agent = $1',
      [idAgent]
    );
    if (agentRes.rowCount === 0) return res.status(404).json({ error: "Agent introuvable" });
    const agent = agentRes.rows[0];
    const prenomAgent = agent.prenom || agent.nom || 'Agent';
    const defaultPinHash = await bcrypt.hash('0000', 10);

    // Sauvegarde de la config personnalisée du salon Démo
    if (type === 'DEMO' && action === 'SAVE_CUSTOM') {
      const idDemo = agent.id_salon_demo_actif;
      if (!idDemo) {
        return res.status(400).json({ error: "Ouvrez d'abord votre salon de démo au moins une fois avant de le sauvegarder." });
      }
      const empRows = await pool.query(`SELECT nom, role FROM employes WHERE id_salon = $1 AND COALESCE(est_gerant, FALSE) = FALSE`, [idDemo]).catch(() => ({ rows: [] }));
      const artRows = await pool.query(`SELECT nom, prix, categorie, stock FROM articles WHERE id_salon = $1`, [idDemo]).catch(() => ({ rows: [] }));
      const cliRows = await pool.query(`SELECT nom, telephone, email FROM clients WHERE id_salon = $1`, [idDemo]).catch(() => ({ rows: [] }));

      const snapshot = {
        employes: empRows.rows,
        articles: artRows.rows,
        clients: cliRows.rows,
        saved_at: new Date().toISOString()
      };
      await pool.query(`UPDATE partner_agents SET demo_custom_snapshot = $1 WHERE id_agent = $2`, [JSON.stringify(snapshot), idAgent]);
      return res.json({ message: "Configuration personnalisée sauvegardée !" });
    }

    let idSalon = null;
    let emailSandbox = null;
    let nomSalon = type === 'DEMO'
      ? `Maison Éclat — Démo (${prenomAgent})`
      : type === 'VIDE'
        ? `Salon Vierge d'Entraînement (${prenomAgent})`
        : `Salon Test Onboarding (${prenomAgent})`;

    if (type === 'DEMO' && agent.id_salon_demo_actif) {
      const checkExist = await pool.query(
        `SELECT c.id_salon, u.email FROM configuration_salon c JOIN utilisateurs u ON u.id_salon = c.id_salon WHERE c.id_salon = $1`,
        [agent.id_salon_demo_actif]
      ).catch(() => ({ rowCount: 0 }));

      if (checkExist.rowCount > 0) {
        idSalon = checkExist.rows[0].id_salon;
        emailSandbox = checkExist.rows[0].email;
      }
    }

    if (!idSalon) {
      const timestamp = Date.now().toString().slice(-6);
      emailSandbox = `sandbox.${type.toLowerCase()}.${idAgent}.${timestamp}@stack-sim.fr`;
      const passwordHash = await bcrypt.hash('Sandbox123!', 10);
      const isDemo = type === 'DEMO';

      const salonInsert = await pool.query(
        `INSERT INTO configuration_salon (
            nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur,
            etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok,
            statut_onboarding, est_bac_a_sable, type_bac_a_sable, date_expiration_sandbox
        ) VALUES (
            $1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL', NULL,
            $2, $2, $2, $2, $2,
            $3, TRUE, $4, NOW() + INTERVAL '24 hours'
        ) RETURNING id_salon`,
        [nomSalon, isDemo, isDemo ? 'TERMINE' : 'EN_COURS', type]
      );
      idSalon = salonInsert.rows[0].id_salon;

      await pool.query(
        `INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, statut_abonnement) VALUES ($1, $2, $3, 'gerant', 'actif')`,
        [emailSandbox, passwordHash, idSalon]
      );

      if (isDemo) {
        await pool.query(`UPDATE partner_agents SET id_salon_demo_actif = $1 WHERE id_agent = $2`, [idSalon, idAgent]).catch(() => {});
        await peuplerSalonDemoSafe(idSalon, agent.demo_custom_snapshot || DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
      } else {
        await pool.query(
          `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)`,
          [`${prenomAgent} (Gérant Test)`, idSalon, defaultPinHash]
        ).catch(() => {});
      }
    } else if (type === 'DEMO' && action === 'RESET_CUSTOM') {
      await peuplerSalonDemoSafe(idSalon, agent.demo_custom_snapshot || DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
    } else if (type === 'DEMO' && action === 'RESET_DEFAULT') {
      await peuplerSalonDemoSafe(idSalon, DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
    }

    const payload = { id_salon: idSalon, role: 'gerant', email: emailSandbox };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    const FRONTEND_CAISSE_URL = process.env.FRONTEND_CAISSE_URL || 'https://app-salon-caiss.onrender.com';

    res.json({
      type,
      nom_salon: nomSalon,
      email_test: emailSandbox,
      mot_de_passe_test: 'Sandbox123!',
      code_partenaire: agent.code_partenaire,
      url_directe: `${FRONTEND_CAISSE_URL}/?sandbox_token=${encodeURIComponent(token)}&sandbox_mode=${encodeURIComponent(type)}&partner=${encodeURIComponent(agent.code_partenaire)}`
    });
  } catch (error) {
    console.error("Erreur Sandbox Launch:", error);
    res.status(500).json({ error: `Erreur lancement simulateur : ${error.message}` });
  }
});

// 4. CARTE DE PROSPECTION HAUTE DENSITÉ EN STREAMING (Progressive Chunking)
const MAP_SECTOR_CACHE = new Map();

function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function computeSalonRating(idStr, nomStr, tags = {}, hasPhone = false, hasWeb = false) {
  const raw = tags['rating'] || tags['stars'] || tags['google:rating'] || tags['review:score'];
  if (raw) {
    const num = parseFloat(String(raw).replace(',', '.'));
    if (!isNaN(num) && num >= 1 && num <= 5) return Number(num.toFixed(1));
  }
  const seed = `${idStr || ''}_${(nomStr || '').toLowerCase().trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  let baseScore = 3.6 + ((Math.abs(hash) % 130) / 100);
  if (hasPhone) baseScore += 0.05;
  if (hasWeb) baseScore += 0.05;
  return Number(Math.min(5.0, Math.max(3.5, baseScore)).toFixed(1));
}

router.get('/map-salons', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const lat = parseFloat(req.query.lat) || 48.5734;
    const lng = parseFloat(req.query.lng) || 7.7521;
    const requestedRadius = Math.min(50, Math.max(1, parseFloat(req.query.radius) || 5));
    const step = parseInt(req.query.step || '0', 10);

    const cacheKey = `v8_${lat.toFixed(3)}_${lng.toFixed(3)}_${requestedRadius}_${step}`;
    let baseSalons = null;
    let nextStepToReturn = null;

    const cached = MAP_SECTOR_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 20 * 60 * 1000)) {
      baseSalons = cached.data;
      nextStepToReturn = cached.nextStep;
    } else {
      const salonsMap = new Map();
      const apiRadius = Math.min(requestedRadius, 50);
      let fetchTasks = [];

      // Fonction Sirene 100% conforme (per_page=25 max obligatoire sur l'API Gouv)
      // Pagination linéaire PROFONDE sur le point central exact (jusqu'à 3000 résultats infaillibles)
      const fetchSireneDeep = async (pageList) => {
        const responses = await Promise.all(pageList.map(page =>
          fetchWithTimeout(
            `https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat.toFixed(4)}&long=${lng.toFixed(4)}&radius=${apiRadius}&activite_principale=96.02A,96.02B&per_page=25&page=${page}`,
            { headers: { 'Accept': 'application/json', 'User-Agent': 'StackPartners/9.0' } },
            4500
          ).then(r => r.ok ? r.json() : null).catch(() => null)
        ));

        for (const d of responses) {
          if (!d || !d.results) continue;
          for (const ent of d.results) {
            const etablissements = [
              ...(Array.isArray(ent.matching_etablissements) ? ent.matching_etablissements : []),
              ...(ent.siege ? [ent.siege] : [])
            ];
            for (const etab of etablissements) {
              const sLat = parseFloat(etab.latitude);
              const sLng = parseFloat(etab.longitude);
              if (isNaN(sLat) || isNaN(sLng)) continue;
              const dist = calcDistKm(lat, lng, sLat, sLng);
              if (dist > requestedRadius) continue;

              const siret = etab.siret || `${ent.siren}00010`;
              const nom = etab.nom_commercial || etab.liste_enseignes?.[0] || ent.nom_commercial || ent.nom_complet || 'Salon de Coiffure';
              if (!salonsMap.has(siret)) {
                salonsMap.set(siret, {
                  siret,
                  nom_salon: nom,
                  adresse: etab.adresse || `${etab.numero_voie || ''} ${etab.type_voie || ''} ${etab.libelle_voie || ''}`.trim(),
                  code_postal: etab.code_postal || '',
                  ville: etab.libelle_commune || '',
                  telephone: null,
                  site_web: null,
                  horaires: null,
                  etoiles: computeSalonRating(siret, nom, {}, false, false),
                  lat: sLat,
                  lng: sLng,
                  distance_km: Number(dist.toFixed(2))
                });
              }
            }
          }
        }
      };

      if (step === 0) {
        const effectiveRadiusKm = Math.min(requestedRadius, 18);
        const latDelta = effectiveRadiusKm / 111.32;
        const lngDelta = effectiveRadiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        const south = (lat - latDelta).toFixed(4);
        const north = (lat + latDelta).toFixed(4);
        const west = (lng - lngDelta).toFixed(4);
        const east = (lng + lngDelta).toFixed(4);

        const fetchOverpassBbox = async () => {
          const overpassQuery = `[out:json][timeout:6];(node["shop"~"hairdresser|barber|beauty"](${south},${west},${north},${east});way["shop"~"hairdresser|barber|beauty"](${south},${west},${north},${east}););out center qt 10000;`;
          const mirrors = [
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass-api.de/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.private.coffee/api/interpreter'
          ];
          try {
            const osmData = await Promise.any(mirrors.map(url =>
              fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'StackPartners/9.0' },
                body: `data=${encodeURIComponent(overpassQuery)}`
              }, 5500).then(r => { if (!r.ok) throw new Error(); return r.json(); })
            ));
            for (const el of (osmData.elements || [])) {
              const oLat = parseFloat(el.lat || el.center?.lat);
              const oLng = parseFloat(el.lon || el.center?.lon);
              const tags = el.tags || {};
              if (isNaN(oLat) || isNaN(oLng) || !tags.name) continue;
              const dist = calcDistKm(lat, lng, oLat, oLng);
              if (dist > requestedRadius) continue;

              const fakeSiret = tags['ref:FR:SIRET'] || `OSM-${el.id}`;
              const phone = tags['phone'] || tags['contact:phone'] || null;
              const web = tags['website'] || tags['contact:website'] || null;
              salonsMap.set(fakeSiret, {
                siret: fakeSiret,
                nom_salon: tags.name,
                adresse: `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || 'Enseigne vérifiée'}`.trim(),
                code_postal: tags['addr:postcode'] || '',
                ville: tags['addr:city'] || '',
                telephone: phone,
                site_web: web,
                horaires: tags['opening_hours'] || null,
                etoiles: computeSalonRating(fakeSiret, tags.name, tags, !!phone, !!web),
                lat: oLat,
                lng: oLng,
                distance_km: Number(dist.toFixed(2))
              });
            }
          } catch (e) {}
        };

        fetchTasks.push(fetchOverpassBbox());
        // Étape 0 : Pages 1 à 20 (Les 500 salons les plus proches)
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 1))); 
      } else if (step === 1) {
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 21))); // 500 suivants
      } else if (step === 2) {
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 41))); // 500 suivants
      } else if (step === 3) {
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 61))); // 500 suivants
      } else if (step === 4) {
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 81))); // 500 suivants
      } else if (step === 5) {
        fetchTasks.push(fetchSireneDeep(Array.from({ length: 20 }, (_, i) => i + 101))); // 500 suivants
      }

      await Promise.all(fetchTasks);

      nextStepToReturn = step < 5 ? step + 1 : null;
      baseSalons = Array.from(salonsMap.values());
      if (baseSalons.length > 0) {
        MAP_SECTOR_CACHE.set(cacheKey, { ts: Date.now(), data: baseSalons, nextStep: nextStepToReturn });
      }
    }

    // Décoration ultra-rapide avec statuts (Clients, Leads...)
    const [prospectsDB, clientsDB, visitesDB] = await Promise.all([
      pool.query(`SELECT id_prospect, id_agent, siret_prospect, LOWER(TRIM(nom_salon)) AS nom_norm, GREATEST(0, EXTRACT(DAY FROM (date_expiration_protection - CURRENT_TIMESTAMP))::INT) AS jours_restants, statut_prospect FROM partner_prospects_reservations WHERE date_expiration_protection > CURRENT_TIMESTAMP`).catch(() => ({ rows: [] })),
      pool.query(`SELECT siret_salon, LOWER(TRIM(nom_salon)) AS nom_norm FROM configuration_salon WHERE COALESCE(est_bac_a_sable, FALSE) = FALSE`).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT pv.*, pa.prenom AS agent_prenom, pa.nom AS agent_nom
        FROM partner_visites pv
        LEFT JOIN partner_agents pa ON pa.id_agent = pv.id_agent
        WHERE pv.date_expiration > NOW()
        ORDER BY pv.date_visite DESC
      `).catch(() => ({ rows: [] }))
    ]);

    const clientSirets = new Set();
    const clientNames = new Set();
    clientsDB.rows.forEach(c => { if(c.siret_salon) clientSirets.add(c.siret_salon); if(c.nom_norm) clientNames.add(c.nom_norm); });
    
    const prospectBySiret = new Map();
    const prospectByName = new Map();
    prospectsDB.rows.forEach(p => { if(p.siret_prospect) prospectBySiret.set(p.siret_prospect, p); if(p.nom_norm) prospectByName.set(p.nom_norm, p); });

    const visiteBySiret = new Map();
    visitesDB.rows.forEach(v => {
      if (v.siret_salon && !visiteBySiret.has(v.siret_salon)) {
        visiteBySiret.set(v.siret_salon, v);
      }
    });

    const finalSalons = baseSalons.map(s => {
      let statut_carte = 'LIBRE', jours_restants = 0, id_prospect = null;
      const normName = (s.nom_salon || '').toLowerCase().trim();
      const vMatch = visiteBySiret.get(s.siret) || null;
      
      if (clientSirets.has(s.siret) || clientNames.has(normName)) {
        statut_carte = 'CLIENT_STACK';
      } else {
        const pMatch = prospectBySiret.get(s.siret) || prospectByName.get(normName);
        if (pMatch) {
          if (pMatch.statut_prospect === 'SIGNE') statut_carte = 'CLIENT_STACK';
          else if (pMatch.jours_restants > 0) {
            statut_carte = Number(pMatch.id_agent) === Number(idAgent) ? 'PROSPECTE_MOI' : 'PROSPECTE_AUTRE';
            jours_restants = pMatch.jours_restants;
            id_prospect = pMatch.id_prospect;
          }
        } else if (vMatch && vMatch.est_visite_physique) {
          statut_carte = Number(vMatch.id_agent) === Number(idAgent) ? 'VISITE_MOI' : 'VISITE_AUTRE';
        }
      }

      return {
        ...s,
        statut_carte,
        jours_restants,
        id_prospect,
        visite_info: vMatch ? {
          id_visite: vMatch.id_visite,
          id_agent: vMatch.id_agent,
          est_moi: Number(vMatch.id_agent) === Number(idAgent),
          agent_nom_complet: `${vMatch.agent_prenom || ''} ${vMatch.agent_nom || 'Agent'}`.trim(),
          tag_concurrent: vMatch.tag_concurrent,
          statut_visite: vMatch.statut_visite,
          note_texte: vMatch.note_texte,
          est_visite_physique: vMatch.est_visite_physique,
          distance_validation_m: vMatch.distance_validation_m,
          date_visite: vMatch.date_visite,
          date_expiration: vMatch.date_expiration
        } : null
      };
    });

    res.json({ salons: finalSalons, nextStep: nextStepToReturn });
  } catch (err) {
    res.status(500).json({ salons: [], error: err.message, nextStep: null });
  }
});
// 5. SURCHARGE DES ROUTES GOD MODE (/admin/...) POUR SUPPRIMER LE 403 FORBIDDEN SUR TON COMPTE
const adminPathsToOverride = ['/admin/agents', '/admin/commissions', '/admin/agents/:id/verifier-piece', '/admin/commissions/:id/payer'];
if (Array.isArray(router.stack)) {
  router.stack = router.stack.filter(layer => !layer.route || !adminPathsToOverride.includes(layer.route.path));
}

async function verifierSuperAdminDB(req, res, next) {
  try {
    const idAgent = getAgentIdFromReq(req);
    const check = await pool.query(`SELECT id_agent, nom, email, code_partenaire FROM partner_agents WHERE id_agent = $1`, [idAgent]);
    if (check.rowCount === 0) return res.status(403).json({ error: "Accès refusé" });
    const a = check.rows[0];
    const isAllowed =
      Number(a.id_agent) === 1 ||
      (a.email || '').toLowerCase().trim() === 'tardy.valentin04@gmail.com';
    if (!isAllowed) return res.status(403).json({ error: "Réservé au Super-Admin STACK" });
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.get('/admin/agents', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.*,
        d.contrat_signe,
        COALESCE(d.statut_contrat, 'MANQUANT') AS statut_contrat,
        d.date_signature_contrat,
        d.date_naissance,
        d.date_expiration_identite,
        d.fichier_identite,
        COALESCE(d.statut_identite, 'MANQUANT') AS statut_identite,
        COALESCE(d.forme_juridique, 'EI') AS forme_juridique,
        d.date_debut_activite,
        d.adresse_pro,
        COALESCE(d.statut_siret, 'MANQUANT') AS statut_siret,
        d.greffe_rsac,
        d.date_emission_rsac,
        d.fichier_rsac,
        COALESCE(d.statut_rsac, 'MANQUANT') AS statut_rsac,
        d.date_emission_kbis,
        d.fichier_kbis,
        COALESCE(d.statut_kbis, 'NON_REQUIS') AS statut_kbis,
        d.code_verif_urssaf,
        d.date_emission_urssaf,
        d.date_expiration_urssaf,
        d.fichier_urssaf,
        COALESCE(d.statut_urssaf, 'MANQUANT') AS statut_urssaf,
        d.assureur_nom,
        d.assureur_contrat,
        d.assureur_plafond,
        d.date_expiration_rc_pro,
        d.fichier_rc_pro,
        COALESCE(d.statut_rc_pro, 'MANQUANT') AS statut_rc_pro,
        d.titulaire_iban,
        COALESCE(d.statut_iban, 'MANQUANT') AS statut_iban,
        COALESCE(d.regime_tva, 'FRANCHISE_293B') AS regime_tva,
        d.numero_tva_intra,
        COALESCE(d.statut_tva, 'MANQUANT') AS statut_tva,
        d.honneur_aucune_interdiction,
        d.honneur_pas_exclusivite_employeur,
        d.honneur_pas_mandat_concurrent,
        d.charte_acceptee,
        d.quiz_score,
        d.formation_validee,
        d.telephone_confirme
      FROM partner_agents a
      LEFT JOIN partner_conformite_dossier d ON d.id_agent = a.id_agent
      ORDER BY a.id_agent DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/commissions', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pc.*, pa.nom, pa.prenom, pa.iban, cs.nom_salon
      FROM partner_commissions pc
      JOIN partner_agents pa ON pa.id_agent = pc.id_agent
      JOIN configuration_salon cs ON cs.id_salon = pc.id_salon
      WHERE pc.statut_commission = 'ACQUISE_A_PAYER'
        AND COALESCE(cs.est_bac_a_sable, FALSE) = FALSE
      ORDER BY pc.id_commission DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.json([]);
  }
});

router.patch('/admin/agents/:id/verifier-piece', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const idAgentCible = req.params.id;
    const { champ_statut, decision, commentaire, purge_identite_rgpd } = req.body;

    if (champ_statut === 'STATUT_COMPTE_FINAL') {
      await pool.query(`UPDATE partner_agents SET statut_compte = $1 WHERE id_agent = $2`, [decision, idAgentCible]);
      return res.json({ message: `Statut du compte mis à jour : ${decision}` });
    }

    const allowedFields = ['statut_contrat', 'statut_identite', 'statut_siret', 'statut_rsac', 'statut_kbis', 'statut_urssaf', 'statut_rc_pro', 'statut_iban', 'statut_tva'];
    if (!allowedFields.includes(champ_statut)) {
      return res.status(400).json({ error: "Champ de statut non reconnu" });
    }

    if (purge_identite_rgpd && champ_statut === 'statut_identite' && decision === 'VALIDE') {
      await pool.query(`UPDATE partner_agents SET statut_identite = 'VALIDE', fichier_identite = NULL WHERE id_agent = $1`, [idAgentCible]);
    } else {
      await pool.query(`UPDATE partner_agents SET ${champ_statut} = $1 WHERE id_agent = $2`, [decision, idAgentCible]);
    }

    await pool.query(
      `INSERT INTO partner_conformite_historique (id_agent, type_piece, statut_resultat, commentaire, verifie_par)
       VALUES ($1, $2, $3, $4, 'Fondateur (God Mode)')`,
      [idAgentCible, champ_statut.toUpperCase(), decision, commentaire || 'Vérifié']
    ).catch(() => {});

    res.json({ message: `Pièce ${champ_statut} marquée comme ${decision}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/commissions/:id/payer', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    await pool.query(`UPDATE partner_commissions SET statut_commission = 'PAYEE', date_paiement = NOW() WHERE id_commission = $1`, [req.params.id]);
    res.json({ message: "Commission marquée comme payée." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 6. CRM DE TERRAIN : VISITES GÉO-VÉRIFIÉES (100M), TAGS, NOTES & TOURNÉE OSRM
// ============================================================================

pool.query(`
  CREATE TABLE IF NOT EXISTS partner_visites (
    id_visite SERIAL PRIMARY KEY,
    siret_salon VARCHAR(120) UNIQUE NOT NULL,
    nom_salon VARCHAR(255),
    ville VARCHAR(150),
    lat_salon DOUBLE PRECISION,
    lng_salon DOUBLE PRECISION,
    id_agent INTEGER NOT NULL,
    tag_concurrent VARCHAR(60) DEFAULT 'NON_RENSEIGNE',
    statut_visite VARCHAR(50) DEFAULT 'NOTE_SIMPLE',
    note_texte TEXT DEFAULT '',
    est_visite_physique BOOLEAN DEFAULT FALSE,
    lat_agent DOUBLE PRECISION,
    lng_agent terminal_agent DOUBLE PRECISION,
    distance_validation_m INTEGER DEFAULT NULL,
    date_visite TIMESTAMP DEFAULT NOW(),
    date_expiration TIMESTAMP NOT NULL
  );

  -- OPTIMISATIONS GÉOSPATIALES & RECHERCHES BDD (Exécutées silencieusement)
  CREATE INDEX IF NOT EXISTS idx_visites_lat_lng ON partner_visites (lat_salon, lng_salon);
  CREATE INDEX IF NOT EXISTS idx_visites_siret ON partner_visites (siret_salon);
  CREATE INDEX IF NOT EXISTS idx_prospects_siret ON partner_prospects_reservations (siret_prospect);
  CREATE INDEX IF NOT EXISTS idx_config_salon_siret ON configuration_salon (siret);
`).catch(err => console.error("Erreur init optimisations BDD:", err.message));

// Enregistrer une visite physique (Géo-fencing <= 100m) ou une note/tag
router.post('/visites', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const {
      siret_salon, nom_salon, ville, lat_salon, lng_salon,
      tag_concurrent = 'NON_RENSEIGNE',
      statut_visite = 'ABSENT_3MOIS',
      note_texte = '',
      valider_passage_physique = false,
      lat_agent = null,
      lng_agent = null,
      force_super_admin = false
    } = req.body;

    if (!siret_salon) return res.status(400).json({ error: "Identifiant salon manquant." });

    let distanceMeters = null;
    if (valider_passage_physique) {
      if (lat_agent === null || lng_agent === null || isNaN(parseFloat(lat_agent)) || isNaN(parseFloat(lng_agent))) {
        return res.status(400).json({ error: "Position GPS introuvable. Activez la localisation sur votre téléphone pour valider votre passage." });
      }
      const distKm = calcDistKm(parseFloat(lat_salon), parseFloat(lng_salon), parseFloat(lat_agent), parseFloat(lng_agent));
      distanceMeters = Math.round(distKm * 1000);

      if (distanceMeters > 100 && !force_super_admin) {
        return res.status(403).json({
          error: `Validation refusée (Sécurité Anti-Triche GPS) : Vous êtes à ${distanceMeters} mètres du salon. Vous devez être à moins de 100 mètres pour certifier votre visite.`,
          distance_m: distanceMeters
        });
      }
    }

    // Calcul du délai de carence : 1 an pour Refus catégorique, 3 mois pour Absent / À rappeler
    const intervalSql = statut_visite === 'REFUS_1AN' ? "INTERVAL '1 year'" : "INTERVAL '3 months'";

    const upsertQuery = `
      INSERT INTO partner_visites (
        siret_salon, nom_salon, ville, lat_salon, lng_salon, id_agent,
        tag_concurrent, statut_visite, note_texte, est_visite_physique,
        lat_agent, lng_agent, distance_validation_m, date_visite, date_expiration
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, NOW(), NOW() + ${intervalSql}
      )
      ON CONFLICT (siret_salon) DO UPDATE SET
        id_agent = EXCLUDED.id_agent,
        tag_concurrent = EXCLUDED.tag_concurrent,
        statut_visite = EXCLUDED.statut_visite,
        note_texte = EXCLUDED.note_texte,
        est_visite_physique = COALESCE(EXCLUDED.est_visite_physique, partner_visites.est_visite_physique),
        lat_agent = COALESCE(EXCLUDED.lat_agent, partner_visites.lat_agent),
        lng_agent = COALESCE(EXCLUDED.lng_agent, partner_visites.lng_agent),
        distance_validation_m = COALESCE(EXCLUDED.distance_validation_m, partner_visites.distance_validation_m),
        date_visite = NOW(),
        date_expiration = NOW() + ${intervalSql}
      RETURNING *;
    `;

    const saved = await pool.query(upsertQuery, [
      siret_salon, nom_salon || 'Salon', ville || '', parseFloat(lat_salon) || 0, parseFloat(lng_salon) || 0, idAgent,
      tag_concurrent, statut_visite, note_texte, !!valider_passage_physique,
      lat_agent ? parseFloat(lat_agent) : null, lng_agent ? parseFloat(lng_agent) : null, distanceMeters
    ]);

    const agentRes = await pool.query(`SELECT prenom, nom FROM partner_agents WHERE id_agent = $1`, [idAgent]);
    const ag = agentRes.rows[0] || {};

    res.json({
      message: valider_passage_physique
        ? `Visite certifiée GPS (${distanceMeters ?? 0}m) ! Verrouillé pour ${statut_visite === 'REFUS_1AN' ? '1 an' : '3 mois'}.`
        : "Note et qualification enregistrées.",
      visite_info: {
        ...saved.rows[0],
        est_moi: true,
        agent_nom_complet: `${ag.prenom || ''} ${ag.nom || 'Agent'}`.trim()
      }
    });
  } catch (e) {
    console.error("Erreur POST /visites:", e);
    res.status(500).json({ error: e.message });
  }
});

// Optimisation de tournée via OSRM + Algorithme du plus proche voisin (TSP) avec Départ et Arrivée verrouillés
router.post('/tournee/optimiser', verifierTokenPartner, async (req, res) => {
  try {
    const { startPoint, endPoint, salons = [] } = req.body;
    if (!startPoint || !Array.isArray(salons) || salons.length === 0) {
      return res.status(400).json({ error: "Sélectionnez au moins un salon et un point de départ." });
    }

    const start = { lat: parseFloat(startPoint.lat), lng: parseFloat(startPoint.lng), label: startPoint.label || 'Départ GPS' };
    const end = endPoint && endPoint.lat && endPoint.lng
      ? { lat: parseFloat(endPoint.lat), lng: parseFloat(endPoint.lng), label: endPoint.label || 'Arrivée' }
      : start;

    // 1. Ordonnancement intelligent tenant compte de la proximité ET du rapprochement vers la destination finale
    const remaining = salons.slice(0, 20).map(s => ({ ...s, lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));
    const orderedSalons = [];
    let curr = { lat: start.lat, lng: start.lng };

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const distFromCurrent = calcDistKm(curr.lat, curr.lng, candidate.lat, candidate.lng);
        const distToEnd = calcDistKm(candidate.lat, candidate.lng, end.lat, end.lng);
        // Pondération : minimise le trajet immédiat tout en orientant progressivement vers le point de retour
        const weightEnd = remaining.length === 1 ? 1.0 : 0.18;
        const score = distFromCurrent + (distToEnd * weightEnd);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      const chosen = remaining.splice(bestIdx, 1)[0];
      orderedSalons.push(chosen);
      curr = { lat: chosen.lat, lng: chosen.lng };
    }

    // 2. Amélioration locale 2-Opt (décroise les segments qui se chevauchent)
    const routePoints = [start, ...orderedSalons, end];
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 1; i < routePoints.length - 2; i++) {
        for (let j = i + 1; j < routePoints.length - 1; j++) {
          const d1 = calcDistKm(routePoints[i - 1].lat, routePoints[i - 1].lng, routePoints[i].lat, routePoints[i].lng) +
                     calcDistKm(routePoints[j].lat, routePoints[j].lng, routePoints[j + 1].lat, routePoints[j + 1].lng);
          const d2 = calcDistKm(routePoints[i - 1].lat, routePoints[i - 1].lng, routePoints[j].lat, routePoints[j].lng) +
                     calcDistKm(routePoints[i].lat, routePoints[i].lng, routePoints[j + 1].lat, routePoints[j + 1].lng);
          if (d2 + 0.01 < d1) {
            const reversed = routePoints.slice(i, j + 1).reverse();
            routePoints.splice(i, j - i + 1, ...reversed);
          }
        }
      }
    }

    const finalOrderedSalons = routePoints.slice(1, routePoints.length - 1);

    // 3. Interrogation du moteur routier open-source OSRM pour obtenir le tracé routier exact et la durée réelle
    let geometryCoords = routePoints.map(p => [p.lat, p.lng]);
    let totalDistanceKm = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      totalDistanceKm += calcDistKm(routePoints[i].lat, routePoints[i].lng, routePoints[i + 1].lat, routePoints[i + 1].lng);
    }
    let durationMinutes = Math.round((totalDistanceKm / 22) * 60 + finalOrderedSalons.length * 12);

    try {
      const coordsString = routePoints.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
      const osrmRes = await fetchWithTimeout(osrmUrl, { headers: { 'User-Agent': 'StackPartnersOSRM/1.0' } }, 3500);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes?.[0]) {
          totalDistanceKm = osrmData.routes[0].distance / 1000;
          durationMinutes = Math.round((osrmData.routes[0].duration / 60) + finalOrderedSalons.length * 12);
          if (osrmData.routes[0].geometry?.coordinates) {
            geometryCoords = osrmData.routes[0].geometry.coordinates.map(([lon, la]) => [la, lon]);
          }
        }
      }
    } catch (e) {}

    res.json({
      orderedSalons: finalOrderedSalons,
      start,
      end,
      total_distance_km: Number(totalDistanceKm.toFixed(1)),
      estimated_minutes: durationMinutes,
      polyline: geometryCoords
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytique Marché & Concurrents pour le God Mode Super-Admin
router.get('/admin/market-stats', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const tagsRes = await pool.query(`
      SELECT tag_concurrent, COUNT(*)::INT AS count
      FROM partner_visites
      WHERE tag_concurrent IS NOT NULL AND tag_concurrent != 'NON_RENSEIGNE'
      GROUP BY tag_concurrent
      ORDER BY count DESC
    `).catch(() => ({ rows: [] }));

    const recentVisitesRes = await pool.query(`
      SELECT pv.*, pa.prenom, pa.nom
      FROM partner_visites pv
      LEFT JOIN partner_agents pa ON pa.id_agent = pv.id_agent
      ORDER BY pv.date_visite DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    res.json({
      repartition_concurrents: tagsRes.rows,
      recentes_visites: recentVisitesRes.rows
    });
  } catch (e) {
    res.json({ repartition_concurrents: [], recentes_visites: [] });
  }
});

// ============================================================================
// 7. WEBHOOK STRIPE AUTOMATIQUE : ACTIVATION SALONS & COMMISSIONS 20% (24 MOIS)
// ============================================================================

function verifierSignatureStripe(rawBody, sigHeader, secret) {
  if (!rawBody || !sigHeader || !secret) return false;
  const parts = String(sigHeader).split(',');
  const timestampPart = parts.find(p => p.trim().startsWith('t='));
  const v1Parts = parts.filter(p => p.trim().startsWith('v1='));
  if (!timestampPart || v1Parts.length === 0) return false;

  const timestamp = timestampPart.split('=')[1];
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  return v1Parts.some(p => {
    const sig = p.split('=')[1];
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch (e) {
      return false;
    }
  });
}

router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Compatible que app.js utilise express.json() ou express.raw()
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : (req.rawBody ? String(req.rawBody) : JSON.stringify(req.body));

    let event;
    if (webhookSecret && sig && Buffer.isBuffer(req.body)) {
      const isValid = verifierSignatureStripe(rawBody, sig, webhookSecret);
      if (!isValid) {
        return res.status(400).json({ error: "Signature Webhook Stripe invalide." });
      }
      event = JSON.parse(rawBody);
    } else {
      event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody);
    }

    const eventType = event?.type || '';
    const dataObj = event?.data?.object || {};

    // Événements déclencheurs d'un paiement d'abonnement réussi
    if (['checkout.session.completed', 'invoice.paid', 'invoice.payment_succeeded', 'customer.subscription.updated'].includes(eventType)) {
      const emailClient = (dataObj.customer_email || dataObj.customer_details?.email || dataObj.metadata?.email || '').toLowerCase().trim();
      const idSalonMeta = dataObj.metadata?.id_salon || dataObj.client_reference_id || null;
      const planMeta = (dataObj.metadata?.plan || dataObj.metadata?.forfait || 'PRO').toUpperCase();
      const planChoisi = ['ESSENTIEL', 'PRO', 'PREMIUM'].includes(planMeta) ? planMeta : 'PRO';

      // 1. Identifier le salon concerné (par id_salon en metadata ou par email du gérant)
      let salonRes = { rows: [] };
      if (idSalonMeta) {
        salonRes = await pool.query(`SELECT id_salon, id_agent_apporteur, plan_actuel FROM configuration_salon WHERE id_salon = $1`, [idSalonMeta]);
      }
      if (salonRes.rows.length === 0 && emailClient) {
        salonRes = await pool.query(`
          SELECT s.id_salon, s.id_agent_apporteur, s.plan_actuel
          FROM configuration_salon s
          JOIN utilisateurs u ON u.id_salon = s.id_salon
          WHERE LOWER(TRIM(u.email)) = $1
          LIMIT 1
        `, [emailClient]);
      }

      if (salonRes.rows.length > 0) {
        const salon = salonRes.rows[0];
        const idSalon = salon.id_salon;
        const idAgent = salon.id_agent_apporteur;

        // 2. Passer le salon en abonnement ACTIF PAYANT (sortie de PREMIUM_TRIAL)
        const nouveauPlan = salon.plan_actuel && salon.plan_actuel !== 'PREMIUM_TRIAL' ? salon.plan_actuel : planChoisi;
        await pool.query(`UPDATE configuration_salon SET plan_actuel = $1 WHERE id_salon = $2`, [nouveauPlan, idSalon]);
        await pool.query(`UPDATE utilisateurs SET statut_abonnement = 'actif' WHERE id_salon = $1`, [idSalon]);

        // 3. Si le salon a été apporté par un Agent Commercial STACK, calculer sa commission
        if (idAgent) {
          await pool.query(`
            INSERT INTO partner_attributions_salons (id_salon, id_agent, mode_attribution, statut_onboarding, date_debut_commissionnement, date_fin_commissionnement)
            VALUES ($1, $2, 'LIEN_AFFILIATION', 'GO_LIVE_VALIDE', CURRENT_DATE, (CURRENT_DATE + INTERVAL '24 months')::DATE)
            ON CONFLICT (id_salon) DO UPDATE
            SET date_debut_commissionnement = COALESCE(partner_attributions_salons.date_debut_commissionnement, CURRENT_DATE),
                date_fin_commissionnement = COALESCE(partner_attributions_salons.date_fin_commissionnement, (CURRENT_DATE + INTERVAL '24 months')::DATE),
                statut_onboarding = 'GO_LIVE_VALIDE'
          `, [idSalon, idAgent]);

          // Compter le nombre total de salons actifs payants de cet agent (hors Sandbox et hors essai)
          const countRes = await pool.query(`
            SELECT COUNT(*)::INT AS nb_actifs
            FROM configuration_salon s
            JOIN utilisateurs u ON u.id_salon = s.id_salon AND u.role = 'gerant'
            WHERE s.id_agent_apporteur = $1
              AND u.statut_abonnement = 'actif'
              AND s.plan_actuel != 'PREMIUM_TRIAL'
              AND COALESCE(s.est_bac_a_sable, FALSE) = FALSE
          `, [idAgent]);

          const nbSalonsActifs = countRes.rows[0]?.nb_actifs || 1;
          const baseHt = GRILLE_TARIFS_HT[nouveauPlan] || 69.00;
          const montantCom = Number((baseHt * 0.20).toFixed(2));
          const moisCourant = new Date().toISOString().slice(0, 7);
          const statutInitial = nbSalonsActifs >= SEUIL_SALONS_ACTIFS ? 'ACQUISE_A_PAYER' : 'EN_ATTENTE_SEUIL';

          await pool.query(`
            INSERT INTO partner_commissions
            (id_agent, id_salon, type_commission, periode_mois, montant_base_ht, taux_applique, montant_commission, statut_commission)
            VALUES ($1, $2, 'ABONNEMENT_RECURRENT_20_POURCENT', $3, $4, 20.00, $5, $6)
            ON CONFLICT (id_salon, periode_mois, type_commission) DO UPDATE
            SET montant_base_ht = EXCLUDED.montant_base_ht,
                montant_commission = EXCLUDED.montant_commission,
                statut_commission = CASE WHEN partner_commissions.statut_commission = 'PAYEE' THEN 'PAYEE' ELSE EXCLUDED.statut_commission END
          `, [idAgent, idSalon, moisCourant, baseHt, montantCom, statutInitial]);

          // Déblocage rétroactif automatique si le seuil de 3 salons actifs est atteint
          if (nbSalonsActifs >= SEUIL_SALONS_ACTIFS) {
            await pool.query(`
              UPDATE partner_commissions
              SET statut_commission = 'ACQUISE_A_PAYER'
              WHERE id_agent = $1 AND statut_commission = 'EN_ATTENTE_SEUIL'
            `, [idAgent]);
          }
        }
      }
    }

    // Si un salon résilie son abonnement ou est en impayé définitif
    if (['customer.subscription.deleted', 'invoice.payment_failed'].includes(eventType)) {
      const idSalonMeta = dataObj.metadata?.id_salon || null;
      if (idSalonMeta) {
        await pool.query(`UPDATE utilisateurs SET statut_abonnement = 'inactif' WHERE id_salon = $1`, [idSalonMeta]);
      }
    }

    res.json({ received: true, type: eventType });
  } catch (err) {
    console.error("Erreur Webhook Stripe Partners:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 8. MOTEUR TRANSACTIONNEL D'E-MAILS (SMTP_USER / SMTP_PASS) AVEC PIÈCES JOINTES
// ============================================================================
const tls = require('tls');

async function envoyerEmailSMTP({ to, subject, html, attachments = [] }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Variables SMTP_USER ou SMTP_PASS manquantes sur Render.");
  }

  const host = process.env.SMTP_HOST || (
    user.includes('@gmail.') ? 'smtp.gmail.com' :
    user.includes('@outlook.') || user.includes('@hotmail.') ? 'smtp.office365.com' :
    'smtp-relay.brevo.com'
  );
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const fromEmail = process.env.SMTP_FROM || user;

  // 1. Si nodemailer est présent dans node_modules, on l'utilise en priorité
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    await transporter.sendMail({
      from: `"STACK Partners" <${fromEmail}>`,
      to,
      subject,
      html,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/pdf'
      }))
    });
    return { ok: true, mode: 'nodemailer' };
  } catch (errModule) {
    if (errModule.code !== 'MODULE_NOT_FOUND') throw errModule;
  }

  // 2. Sinon : Client SMTP TLS natif Node.js (Zéro dépendance externe)
  return new Promise((resolve, reject) => {
    const boundary = `----StackMailBoundary${Date.now().toString(16)}`;
    const subjectB64 = Buffer.from(subject, 'utf8').toString('base64');

    let mimeParts = [
      `From: "STACK Partners" <${fromEmail}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${subjectB64}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(html, 'utf8').toString('base64')
    ];

    for (const att of attachments) {
      const b64 = Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64');
      const chunked = b64.match(/.{1,76}/g)?.join('\r\n') || b64;
      mimeParts.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType || 'application/pdf'}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        chunked
      );
    }
    mimeParts.push(`--${boundary}--`, `.`, ``);
    const mimeBody = mimeParts.join('\r\n');

    const socket = tls.connect({ host, port: 465, rejectUnauthorized: false });
    let step = 0;
    let buffer = '';

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error("Délai d'attente SMTP dépassé."));
    });

    const sendLine = (line) => socket.write(line + '\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.length >= 4 && line[3] === '-') continue; // Ligne multi-réponse SMTP
        const code = parseInt(line.slice(0, 3), 10);
        if (code >= 400) {
          socket.destroy();
          return reject(new Error(`Erreur SMTP (${code}) : ${line}`));
        }

        if (step === 0 && code === 220) { step = 1; sendLine(`EHLO stack-partners.fr`); }
        else if (step === 1 && code === 250) { step = 2; sendLine(`AUTH LOGIN`); }
        else if (step === 2 && code === 334) { step = 3; sendLine(Buffer.from(user).toString('base64')); }
        else if (step === 3 && code === 334) { step = 4; sendLine(Buffer.from(pass).toString('base64')); }
        else if (step === 4 && code === 235) { step = 5; sendLine(`MAIL FROM:<${fromEmail}>`); }
        else if (step === 5 && code === 250) { step = 6; sendLine(`RCPT TO:<${to}>`); }
        else if (step === 6 && code === 250) { step = 7; sendLine(`DATA`); }
        else if (step === 7 && code === 354) { step = 8; sendLine(mimeBody); }
        else if (step === 8 && code === 250) { step = 9; sendLine(`QUIT`); resolve({ ok: true, mode: 'native_tls' }); }
      }
    });

    socket.on('error', (err) => reject(err));
  });
}

// Générer le PDF d'une facture en mémoire (Buffer) pour l'attacher à l'e-mail
async function genererFacturePdfBuffer(facture, agent, conf) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('FACTURE', { align: 'right' });
    doc.fontSize(10).text(`Facture N° : ${facture.numero_facture}`, { align: 'right' });
    doc.text(`Date : ${new Date(facture.date_emission).toLocaleDateString('fr-FR')}`, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(14).text(`${agent.prenom} ${agent.nom}`, { align: 'left' });
    if (conf.adresse_pro) doc.fontSize(10).text(conf.adresse_pro);
    doc.fontSize(10).text(`SIRET : ${agent.siret_agent} (${conf.forme_juridique || 'EI'})`);
    doc.fontSize(10).text(`Immatriculation RSAC : ${agent.numero_rsac || 'En cours'}${conf.greffe_rsac ? ' - Greffe de ' + conf.greffe_rsac : ''}`);

    doc.moveDown(2);
    doc.fontSize(12).text('Facturé à :', { underline: true });
    doc.fontSize(12).text(facture.nom_salon);
    doc.fontSize(10).text(facture.adresse_salon);
    doc.text(`SIRET : ${facture.siret_salon}`);

    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);
    let startY = doc.y;
    doc.fontSize(12).text('Description', 50, startY, { width: 350 });
    doc.text('Montant HT', 400, startY, { width: 150, align: 'right' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    startY = doc.y;
    doc.text('Frais de configuration et de formation au logiciel STACK', 50, startY, { width: 350 });
    doc.text('99,00 €', 400, startY, { width: 150, align: 'right' });

    doc.moveDown(2);
    doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);
    startY = doc.y;
    doc.fontSize(14).text('Total à payer :', 350, startY, { width: 100 });
    doc.text('99,00 €', 450, startY, { width: 100, align: 'right' });

    doc.moveDown(2);
    doc.fontSize(10).text('TVA non applicable, art. 293 B du CGI.', 50, doc.y);

    doc.moveDown(3);
    doc.fontSize(12).text('Modalités de paiement :');
    doc.fontSize(10).text('Paiement par virement bancaire sur le compte ci-dessous :');
    doc.text(`Titulaire du compte : ${agent.prenom} ${agent.nom}`);
    doc.text(`IBAN : ${agent.iban || 'Non renseigné'}`);

    doc.end();
  });
}

// Route 8A : Envoyer la facture PDF (99 € HT) par e-mail directement au gérant du salon
router.post('/factures/:id/send-email', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const { email_destinataire } = req.body;

    const factRes = await pool.query('SELECT * FROM partner_factures_installation WHERE id_facture = $1 AND id_agent = $2', [req.params.id, idAgent]);
    if (factRes.rowCount === 0) return res.status(404).json({ error: "Facture introuvable." });
    const facture = factRes.rows[0];

    // Chercher l'e-mail du gérant dans les prospects si non fourni manuellement
    let targetEmail = (email_destinataire || '').trim();
    if (!targetEmail) {
      const prospRes = await pool.query('SELECT email_gerant FROM partner_prospects_reservations WHERE siret_prospect = $1 AND id_agent = $2 LIMIT 1', [facture.siret_salon, idAgent]);
      targetEmail = prospRes.rows[0]?.email_gerant || '';
    }
    if (!targetEmail) {
      return res.status(400).json({ error: "Veuillez saisir l'adresse e-mail du gérant." });
    }

    const agentRes = await pool.query('SELECT * FROM partner_agents WHERE id_agent = $1', [idAgent]);
    const agent = agentRes.rows[0];
    const confRes = await pool.query('SELECT * FROM partner_conformite_dossier WHERE id_agent = $1', [idAgent]);
    const conf = confRes.rows[0] || {};

    const pdfBuffer = await genererFacturePdfBuffer(facture, agent, conf);

    await envoyerEmailSMTP({
      to: targetEmail,
      subject: `Facture d'installation STACK (${facture.numero_facture}) - ${facture.nom_salon}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px;">
          <h2 style="margin: 0 0 12px 0;">Bonjour,</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #374151;">
            Veuillez trouver ci-joint votre facture <strong>${facture.numero_facture}</strong> d'un montant de <strong>99,00 € HT</strong> correspondant à la mise en service, au paramétrage complet et à la formation sur place au logiciel de caisse certifié NF525 <strong>STACK</strong> pour votre établissement <strong>${facture.nom_salon}</strong>.
          </p>
          <div style="background: #f9fafb; padding: 14px 16px; border-radius: 12px; margin: 18px 0; font-size: 13px;">
            <strong>Coordonnées de règlement (Virement) :</strong><br/>
            Bénéficiaire : ${agent.prenom} ${agent.nom} (Mandataire RSAC ${agent.numero_rsac || ''})<br/>
            IBAN : <span style="font-family: monospace;">${agent.iban || 'Voir PDF joint'}</span>
          </div>
          <p style="font-size: 13px; color: #6b7280;">
            Dès validation de votre règlement, votre lien d'activation privilégié (incluant vos 30 jours d'essai gratuit sur l'abonnement STACK) vous sera débloqué.
          </p>
        </div>
      `,
      attachments: [{ filename: `${facture.numero_facture}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
    });

    res.json({ message: `Facture ${facture.numero_facture} envoyée par e-mail à ${targetEmail} !` });
  } catch (e) {
    console.error("Erreur envoi facture SMTP:", e.message);
    res.status(500).json({ error: `Échec d'envoi e-mail : ${e.message}` });
  }
});

// Route 8B : Envoyer un e-mail d'alerte de conformité ou d'activation depuis le God Mode
router.post('/admin/agents/:id/notifier-email', verifierTokenPartner, verifierSuperAdminDB, async (req, res) => {
  try {
    const { sujet, message } = req.body;
    const agentRes = await pool.query('SELECT nom, prenom, email FROM partner_agents WHERE id_agent = $1', [req.params.id]);
    if (agentRes.rowCount === 0) return res.status(404).json({ error: "Agent introuvable." });
    const a = agentRes.rows[0];

    await envoyerEmailSMTP({
      to: a.email,
      subject: sujet || "Information importante concernant votre dossier STACK Partners",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px;">
          <h2 style="margin: 0 0 12px 0;">Bonjour ${a.prenom},</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #374151;">${message}</p>
          <p style="font-size: 12.5px; color: #6b7280; margin-top: 24px;">Direction STACK Partners</p>
        </div>
      `
    });

    res.json({ message: `E-mail envoyé avec succès à ${a.email}.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
