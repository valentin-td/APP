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

module.exports = router;

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
