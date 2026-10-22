// routes_partners.js
const express = require('express');
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

// 2. Connexion d'un Agent Commercial (Brique 1)
router.post('/auth/login', async (req, res) => {
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

// 4. Créer une nouvelle facture d'installation
router.post('/factures', verifierTokenPartner, async (req, res) => {
    try {
        const { nom_salon, adresse_salon, siret_salon } = req.body;
        // Format du numéro : FAC-[ID_AGENT]-[ANNEE]-[ALEATOIRE]
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
        
        // Infos Agent
        doc.moveDown(2);
        doc.fontSize(14).text(`${agent.prenom} ${agent.nom}`, { align: 'left' });
        doc.fontSize(10).text(`SIRET : ${agent.siret_agent}`);
        if (agent.numero_rsac) doc.text(`RSAC : ${agent.numero_rsac}`);

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

module.exports = router;
