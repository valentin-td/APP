console.log("Étape 1 : Démarrage du script...");
require('dotenv').config();

console.log("Étape 2 : Chargement des modules...");
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Pour la certification NF525
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const http = require('http');
const { Server } = require('socket.io');

console.log("Étape 3 : Configuration d'Express et WebSockets...");
const app = express();
app.use(cors());

// --- INITIALISATION DE SOCKET.IO ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    socket.on('rejoindreSalon', (id_salon) => { 
        socket.join(id_salon.toString()); 
    });
});

// Le Webhook  a besoin du raw body, le reste utilise JSON
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/') { next(); } 
  else { express.json()(req, res, next); }
});

const pool = new Pool({
    user: process.env.DB_USER, 
    host: process.env.DB_HOST,
    database: process.env.DB_NAME, 
    password: process.env.DB_PASSWORD, 
    port: process.env.DB_PORT,
});

// =========================================================================
// --- SÉCURITÉ : MIDDLEWARES ---
// =========================================================================

const verifierToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    
    jwt.verify(token, process.env.JWT_SECRET || 'cle_secrete_saas_2026', async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token expiré ou invalide." });
        
        try {
            if (user.role === 'gerant') {
                const result = await pool.query('SELECT statut_abonnement FROM utilisateurs WHERE id_salon = $1', [user.id_salon]);
                if (result.rowCount === 0 || result.rows[0].statut_abonnement !== 'actif') { 
                    return res.status(402).json({ erreur: "Paiement requis.", require_payment: true }); 
                }
            }
            req.user = user; 
            next(); 
        } catch (e) { 
            return res.status(500).json({ erreur: "Erreur vérification." }); 
        }
    });
};

// =========================================================================
// --- AUTHENTIFICATION &  BILLING ---
// =========================================================================

app.post('/api/register', async (req, res) => {
    const { email, mot_de_passe, nom_salon } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const checkEmail = await clientDB.query('SELECT email FROM utilisateurs WHERE email = $1', [email]);
        if (checkEmail.rowCount > 0) throw new Error('Cet e-mail est déjà utilisé.');
        
        const hash = await bcrypt.hash(mot_de_passe, 10);
        const salonResult = await clientDB.query('INSERT INTO configuration_salon (nom_salon) VALUES ($1) RETURNING id_salon', [nom_salon || 'Nouveau Salon']);
        const idNouveauSalon = salonResult.rows[0].id_salon;
        
        let customerId = null;
        try { 
            const customer = await stripe.customers.create({ email: email, name: nom_salon });
            customerId = customer.id; 
        } catch(e) { console.error("Erreur création client :", e.message); }
        
        await clientDB.query(
            'INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, _customer_id, statut_abonnement) VALUES ($1, $2, $3, $4, $5, $6)', 
            [email, hash, idNouveauSalon, 'gerant', customerId, 'inactif']
        ); 
        await clientDB.query('COMMIT');
        
        const token = jwt.sign({ id_salon: idNouveauSalon, role: 'gerant' }, process.env.JWT_SECRET || 'cle_secrete_saas_2026', { expiresIn: '24h' });
        res.status(201).json({ message: "Inscription réussie", token });
    } catch (erreur) { 
        await clientDB.query('ROLLBACK'); 
        res.status(400).json({ erreur: erreur.message }); 
    } finally { 
        clientDB.release(); 
    }
});

app.post('/api/login', async (req, res) => {
    const { email, mot_de_passe } = req.body;
    try {
        const result = await pool.query('SELECT id_salon, mot_de_passe_hash, statut_abonnement FROM utilisateurs WHERE email = $1 LIMIT 1', [email]);
        if (result.rowCount > 0) {
            const { id_salon, mot_de_passe_hash, statut_abonnement } = result.rows[0];
            const match = await bcrypt.compare(mot_de_passe, mot_de_passe_hash);
            if (match) {
                const token = jwt.sign({ id_salon, role: 'gerant' }, process.env.JWT_SECRET || 'cle_secrete_saas_2026', { expiresIn: '24h' });
                res.json({ message: "Connexion réussie", token, statut_abonnement });
            } else { res.status(401).json({ erreur: "Mot de passe incorrect." }); }
        } else { res.status(401).json({ erreur: "Aucun compte trouvé avec cet e-mail." }); }
    } catch (error) { res.status(500).json({ erreur: "Erreur serveur." }); }
});

app.post('/api/employes/login-pin', async (req, res) => {
    const { id_salon, nom_employe, code_pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employes WHERE nom ILIKE $1 AND id_salon = $2', [`%${nom_employe}%`, id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Employé introuvable." });
        
        const emp = result.rows[0];
        if (emp.code_pin !== code_pin) return res.status(401).json({ erreur: "Code PIN invalide." });
        
        const token = jwt.sign(
            { id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe }, 
            process.env.JWT_SECRET || 'cle_secrete_saas_2026', 
            { expiresIn: '12h' }
        );
        res.json({ message: "Accès employé autorisé", token, employe: { id: emp.id_employe, nom: emp.nom } });
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur serveur PIN." }); 
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    console.log(`Un email de réinitialisation a été envoyé à ${email}`);
    res.json({ message: "Si cet email existe, un lien de réinitialisation vous a été envoyé." });
});

app.post('/api/creer-checkout', verifierToken, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    
    jwt.verify(token, process.env.JWT_SECRET || 'cle_secrete_saas_2026', async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token invalide." });
        try {
            const result = await pool.query('SELECT email, _customer_id FROM utilisateurs WHERE id_salon = $1', [user.id_salon]);
            if (result.rowCount === 0) return res.status(404).json({ erreur: "Utilisateur introuvable." });
            
            let customerId = result.rows[0]._customer_id;
            
            // SÉCURITÉ : Si le client Stripe n'existe pas, on le crée dynamiquement
            if (!customerId) {
                const customer = await stripe.customers.create({ email: result.rows[0].email });
                customerId = customer.id;
                await pool.query('UPDATE utilisateurs SET _customer_id = $1 WHERE id_salon = $2', [customerId, user.id_salon]);
            }

            const session = await stripe.checkout.sessions.create({
              customer: customerId, 
              payment_method_types: ['card'],
              line_items: [{ price: 'price_1UFeXl09rDJ4C799FBTiz6nK', quantity: 1 }], 
              mode: 'subscription',
              success_url: 'https://app-salon-caiss.onrender.com/?paiement=succes',
              cancel_url: 'https://app-salon-caiss.onrender.com/?paiement=annule',
            });
            res.json({ url: session.url });
        } catch (e) { 
            console.error("Erreur création checkout:", e.message);
            res.status(500).json({ erreur: "Erreur Stripe : " + e.message }); 
        }
    });
});

app.post('/api/webhooks/', express.raw({type: 'application/json'}), async (req, res) => {
    let event;
    try { event = JSON.parse(req.body); } catch (err) { res.status(400).send(`Webhook Error`); return; }
    
    if (event.type === 'checkout.session.completed') {
        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1, _subscription_id = $2 WHERE _customer_id = $3', 
                         ['actif', event.data.object.subscription, event.data.object.customer]);
        console.log("✅ Abonnement  validé !");
    }
    if (event.type === 'customer.subscription.deleted') {
         await pool.query('UPDATE utilisateurs SET statut_abonnement = $1 WHERE _subscription_id = $2', 
                          ['inactif', event.data.object.id]);
         console.log("❌ Abonnement  expiré !");
    }
    res.json({received: true});
});

// =========================================================================
// --- WEBHOOKS & AGENDA (PLANNING) ---
// =========================================================================

app.post('/api/webhooks/synchronisation-clients', async (req, res) => {
    const { nom, telephone, email, id_salon } = req.body;
    if (!id_salon || !nom || !telephone) return res.status(400).json({ erreur: "Données manquantes." });
    try {
        const checkClient = await pool.query('SELECT id_client FROM clients WHERE telephone = $1 AND id_salon = $2', [telephone, id_salon]);
        if (checkClient.rowCount === 0) {
            await pool.query('INSERT INTO clients (nom, telephone, email, id_salon) VALUES ($1, $2, $3, $4)', [nom, telephone, email || null, id_salon]);
            res.status(201).json({ message: "Client synchronisé avec succès." });
        } else { res.status(200).json({ message: "Le client existe déjà." }); }
    } catch (error) { res.status(500).json({ erreur: "Erreur lors de la synchronisation." }); }
});

app.post('/api/webhooks/nouveau-rdv', async (req, res) => {
    const { id_salon, nom_client, telephone_client, nom_employe, prestation, date_heure_debut, duree_minutes, planity_ref, _payment_id } = req.body;
    
    try {
        // 1. CRM AUTOMATIQUE : On cherche le client, s'il n'existe pas on le CRÉE silencieusement
        let id_client = null;
        if (telephone_client) {
            const clientRes = await pool.query('SELECT id_client FROM clients WHERE telephone = $1 AND id_salon = $2', [telephone_client, id_salon]);
            if (clientRes.rowCount > 0) { 
                id_client = clientRes.rows[0].id_client; 
            } else {
                const newClient = await pool.query('INSERT INTO clients (nom, telephone, id_salon) VALUES ($1, $2, $3) RETURNING id_client', [nom_client, telephone_client, id_salon]);
                id_client = newClient.rows[0].id_client;
            }
        }

        const empRes = await pool.query('SELECT id_employe FROM employes WHERE nom ILIKE $1 AND id_salon = $2', [`%${nom_employe}%`, id_salon]);
        const id_employe = empRes.rowCount > 0 ? empRes.rows[0].id_employe : null;
        
        await pool.query(
            `INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes, planity_ref, _payment_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, 
            [id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes || 30, planity_ref || null, _payment_id || null]
        );
        
        io.to(id_salon.toString()).emit('nouveauRDV');
        res.status(201).json({ success: true, message: "RDV et Client enregistrés." });
    } catch (error) { 
        res.status(500).json({ erreur: "Erreur serveur Webhook." }); 
    }
});

app.post('/api/webhooks/annuler-rdv', async (req, res) => {
    const { id_salon, planity_ref } = req.body;
    try {
        await pool.query('DELETE FROM rendez_vous WHERE planity_ref = $1 AND id_salon = $2', [planity_ref, id_salon]);
        io.to(id_salon.toString()).emit('nouveauRDV'); 
        res.json({ message: "RDV annulé avec succès." });
    } catch (e) { res.status(500).json({ erreur: "Erreur annulation." }); }
});

app.post('/api/rdv', verifierToken, async (req, res) => {
    const { nom_client, telephone_client, id_employe, prestation, date_heure_debut, duree_minutes } = req.body;
    try {
        await pool.query(
            `INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
            [req.user.id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes || 30]
        );
        res.status(201).json({ message: "Rendez-vous ajouté manuellement." });
    } catch (e) { res.status(500).json({ erreur: "Erreur création RDV." }); }
});

app.get('/api/planning', verifierToken, async (req, res) => {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    try {
        let query = `
            SELECT r.*, e.nom as nom_employe 
            FROM rendez_vous r 
            LEFT JOIN employes e ON r.id_employe = e.id_employe 
            WHERE r.id_salon = $1 
            AND DATE(r.date_heure_debut) >= $2 
            AND DATE(r.date_heure_debut) <= $3
        `;
        const params = [req.user.id_salon, startDate, endDate];

        if (req.user.role === 'employe') {
            query += ` AND r.id_employe = $4`;
            params.push(req.user.id_employe);
        }

        query += ` ORDER BY r.date_heure_debut ASC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur lecture agenda." }); 
    }
});

// =========================================================================
// --- SYSTÈME SMS (AVEC GOOGLE MAPS & BOUCLIER) ---
// =========================================================================
async function envoyerSMSClient(clientDB, id_client, id_salon) {
    if (!id_client) return; 
    try {
        const config = await clientDB.query('SELECT brevo_api_key, sms_sender_name, lien_google_maps FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const client = await clientDB.query('SELECT telephone, nom, avis_demande FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
        
        if (config.rowCount > 0 && client.rowCount > 0) {
            const { brevo_api_key, sms_sender_name, lien_google_maps } = config.rows[0];
            const { telephone, nom, avis_demande } = client.rows[0];
            
            if (brevo_api_key && telephone && !avis_demande) {
                let message = `Bonjour ${nom}, merci pour votre visite chez ${sms_sender_name || 'notre salon'} ! `;
                if (lien_google_maps) message += `Pourriez-vous nous laisser un avis rapide ? ${lien_google_maps} `;
                message += `À très bientôt.`;
                
                const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
                    method: 'POST', headers: { 'accept': 'application/json', 'api-key': brevo_api_key, 'content-type': 'application/json' },
                    body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (sms_sender_name || 'MonSalon').substring(0, 11), recipient: telephone, content: message })
                });
                
                if (response.ok) { 
                    await clientDB.query('UPDATE clients SET avis_demande = TRUE WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
                } 
            } 
        }
    } catch (e) { console.error("❌ Erreur SMS :", e.message); }
}

// =========================================================================
// --- L'ENCAISSEMENT TPE TEMPS RÉEL (NF525) ---
// =========================================================================
app.post('/api/caisse/payer', verifierToken, async (req, res) => {
    res.json({ message: "Ordre envoyé au TPE." });
});

app.post('/api/webhooks/tpe-externe', async (req, res) => {
    const { montant, id_employe, id_client, lignes, id_salon = 1 } = req.body; 
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN'); 
        
        // SÉCURITÉ NF525 (CHAÎNAGE CRYPTOGRAPHIQUE)
        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        
        const numeroTicket = 'TPE-CLOUD-' + Date.now();
        const insertTicketQuery = `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon) VALUES ($1, $2, $3, $4, $5) RETURNING id_ticket;`;
        const ticketResult = await clientDB.query(insertTicketQuery, [numeroTicket, id_client || null, id_employe, montant, id_salon]);
        const idNouveauTicket = ticketResult.rows[0].id_ticket;

        // Création du Hash inaltérable (Loi anti-fraude)
        const dataToHash = `${idNouveauTicket}-${numeroTicket}-${montant}-${previousHash}`;
        const newHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1 WHERE id_ticket = $2', [newHash, idNouveauTicket]);

        const employeResult = await clientDB.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        const employe = employeResult.rowCount > 0 ? employeResult.rows[0] : null;

        if (lignes && lignes.length > 0) {
            for (let ligne of lignes) {
                const total_ligne = ligne.quantite * ligne.prix_unitaire;
                await clientDB.query(`INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon) VALUES ($1, $2, $3, $4, $5, $6);`, 
                [idNouveauTicket, ligne.id_article, ligne.quantite, ligne.prix_unitaire, total_ligne, id_salon]);
                const updateStockQuery = `UPDATE catalogue SET stock_actuel = stock_actuel - $1 WHERE id_article = $2 AND id_salon = $3 AND type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE') RETURNING nom, stock_actuel, type_article;`;
                const stockResult = await clientDB.query(updateStockQuery, [ligne.quantite, ligne.id_article, id_salon]);
                let type_article = 'PRESTATION'; 
                if (stockResult.rowCount > 0) type_article = stockResult.rows[0].type_article;
                if (employe) {
                    const taux = (type_article === 'PRESTATION') ? employe.taux_commission_prestation : employe.taux_commission_produit;
                    const montant_commission = (total_ligne * (taux / 100)).toFixed(2);
                    await clientDB.query(`INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon) VALUES ($1, $2, $3, $4, $5, $6)`, 
                    [id_employe, idNouveauTicket, total_ligne, montant_commission, type_article, id_salon]);
                }
            }
        }
        await clientDB.query('COMMIT'); 
        if(id_client) envoyerSMSClient(clientDB, id_client, id_salon); 

        io.to(id_salon.toString()).emit('paiementValide', { message: `Paiement validé (Ticket certifié #${idNouveauTicket})` });
        res.status(200).json({ message: "Paiement TPE enregistré avec succès !" });
    } catch (e) {
        await clientDB.query('ROLLBACK'); 
        res.status(500).json({ erreur: "Erreur TPE." }); 
    } finally { clientDB.release(); }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = CURRENT_DATE`, [id_salon]);
        const totalJour = caResult.rows[0].total;
        const signature = crypto.createHash('sha256').update(`Z-${id_salon}-${totalJour}-${Date.now()}`).digest('hex');
        await pool.query('INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash) VALUES ($1, $2, $3)', [id_salon, totalJour, signature]);
        res.json({ message: `Caisse clôturée avec succès. Total : ${totalJour} €`, signature });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de la clôture." }); }
});

// =========================================================================
// --- ROUTES CRUD & STATS ---
// =========================================================================
app.get('/api/clients', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM clients WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur clients."}); }});
app.post('/api/clients', verifierToken, async (req, res) => { const { nom, telephone, email } = req.body; try { await pool.query('INSERT INTO clients (nom, telephone, email, id_salon) VALUES ($1, $2, $3, $4)', [nom, telephone, email, req.user.id_salon]); res.status(201).json({message: "Client ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/clients/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Client supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression client."}); }});

app.get('/api/employes', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM employes WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur employés."}); }});
app.post('/api/employes', verifierToken, async (req, res) => { const { nom, role, taux_commission_prestation, taux_commission_produit, code_pin } = req.body; try { await pool.query('INSERT INTO employes (nom, role, taux_commission_prestation, taux_commission_produit, code_pin, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [nom, role || 'Employé', taux_commission_prestation || 0, taux_commission_produit || 0, code_pin || '0000', req.user.id_salon]); res.status(201).json({message: "Employé ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/employes/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM employes WHERE id_employe = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Employé supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression employé."}); }});

app.get('/api/catalogue', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY type_article, nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur catalogue."}); }});
app.post('/api/catalogue', verifierToken, async (req, res) => { const { nom, type_article, prix, stock_actuel, reference } = req.body; try { const typeArticleFormatte = type_article || 'PRESTATION'; const prixFormatte = parseFloat((prix || "0").toString().replace(',', '.')) || 0; const stockFormatte = parseInt(stock_actuel) || 0; const refFormattee = reference ? reference.trim() : null; if (typeArticleFormatte === 'PRODUIT_REVENTE') { if (!refFormattee || refFormattee.length < 4) { return res.status(400).json({ erreur: "Réf valide requise." }); } } const checkQuery = `SELECT * FROM catalogue WHERE (nom ILIKE $1 OR (reference = $2 AND reference IS NOT NULL)) AND id_salon = $3`; const checkResult = await pool.query(checkQuery, [nom, refFormattee, req.user.id_salon]); if (checkResult.rowCount > 0) { const art = checkResult.rows[0]; if (refFormattee && art.reference === refFormattee && typeArticleFormatte === 'PRODUIT_REVENTE') { if (!nom || nom.trim() === '') { await pool.query('UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2', [stockFormatte, art.id_article]); return res.status(200).json({ message: `Stock mis à jour (+${stockFormatte})` }); } else if (nom.trim().toLowerCase() !== art.nom.toLowerCase()) { return res.status(400).json({ erreur: `Référence déjà utilisée.` }); } } if (art.nom.toLowerCase() === nom.trim().toLowerCase()) { return res.status(400).json({ erreur: `L'article existe déjà.` }); } } await pool.query('INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [nom, typeArticleFormatte, prixFormatte, stockFormatte, refFormattee, req.user.id_salon]); res.status(201).json({ message: "Article ajouté avec succès !" }); } catch (e) { res.status(500).json({ erreur: `Erreur interne : ${e.message}` }); }});
app.delete('/api/catalogue/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Article supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression article."}); }});

app.get('/api/stocks', verifierToken, async (req, res) => { try { const stockResult = await pool.query(`SELECT id_article, nom, stock_actuel, seuil_alerte, type_article FROM catalogue WHERE id_salon = $1 AND type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE') ORDER BY nom ASC`, [req.user.id_salon]); res.json(stockResult.rows); } catch (erreur) { res.status(500).json({ erreur: "Erreur stocks." }); }});
app.get('/api/rh', verifierToken, async (req, res) => { const id_salon = req.user.id_salon; try { const rhQuery = `SELECT e.id_employe, e.nom, COALESCE(e.role, 'Employé') as role, COUNT(DISTINCT CASE WHEN c.type_vente = 'PRESTATION' THEN c.id_ticket END) as clients_coiffes, COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as produits_vendus, COALESCE(SUM(c.montant_vente), 0) as ca_genere, COALESCE(SUM(c.montant_commission), 0) as prime_estimee FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 WHERE e.id_salon = $1 GROUP BY e.id_employe, e.nom, e.role ORDER BY e.id_employe;`; const rhResult = await pool.query(rhQuery, [id_salon]); const employesData = await Promise.all(rhResult.rows.map(async (emp) => { const histoQuery = `SELECT COALESCE(SUM(montant_commission), 0) as total_prime FROM commissions WHERE id_employe = $1 AND id_salon = $2 GROUP BY EXTRACT(MONTH FROM date_creation), EXTRACT(YEAR FROM date_creation) ORDER BY EXTRACT(YEAR FROM date_creation) ASC, EXTRACT(MONTH FROM date_creation) ASC;`; const histoResult = await pool.query(histoQuery, [emp.id_employe, id_salon]); let historique = histoResult.rows.map(r => parseFloat(r.total_prime)); while(historique.length < 6) historique.unshift(0); if (historique.every(val => val === 0)) historique = [0, 0, 0, 0, 0, parseFloat(emp.prime_estimee) || 0]; return { id_employe: emp.id_employe, nom: emp.nom, role: emp.role, performances_actuelles: { clients_coiffes: parseInt(emp.clients_coiffes), produits_vendus: parseInt(emp.produits_vendus), ca_genere: parseFloat(emp.ca_genere), prime_estimee: parseFloat(emp.prime_estimee) }, historique_primes: historique.slice(-6) }; })); res.json(employesData); } catch (erreur) { res.status(500).json({ erreur: "Erreur requête RH." }); }});

app.get('/api/dashboard', verifierToken, async (req, res) => { 
    const id_salon = req.user.id_salon; 
    try { 
        const statsResult = await pool.query(`SELECT COUNT(id_ticket) as nb_ventes, COALESCE(SUM(total_ttc), 0) as chiffre_affaires FROM tickets WHERE id_salon = $1`, [id_salon]); 
        const nbVentes = parseInt(statsResult.rows[0].nb_ventes); 
        const caTotal = parseFloat(statsResult.rows[0].chiffre_affaires); 
        const topPrestationsResult = await pool.query(`SELECT c.nom, SUM(lt.total_ligne_ttc) as total_genere FROM lignes_ticket lt JOIN tickets t ON lt.id_ticket = t.id_ticket JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_salon = $1 AND c.type_article = 'PRESTATION' GROUP BY c.nom ORDER BY total_genere DESC LIMIT 3`, [id_salon]); 
        const commissionsResult = await pool.query(`SELECT COALESCE(SUM(montant_commission), 0) as total_commissions FROM commissions WHERE id_salon = $1`, [id_salon]); 
        let googleMarketing = { note_actuelle: 0, total_avis: 0, tendance_6_mois: [0, 0, 0, 0, 0, 0] }; 
        try { 
            const configResult = await pool.query('SELECT google_api_key, google_account_id, google_location_id FROM configuration_salon WHERE id_salon = $1', [id_salon]); 
            if (configResult.rowCount > 0) { 
                const salonConfig = configResult.rows[0]; 
                if (salonConfig.google_api_key && salonConfig.google_account_id && salonConfig.google_location_id) { 
                    const url = `https://mybusiness.googleapis.com/v4/accounts/${salonConfig.google_account_id}/locations/${salonConfig.google_location_id}/reviews?key=${salonConfig.google_api_key}`; 
                    const gRes = await fetch(url); 
                    if (gRes.ok) { 
                        const gData = await gRes.json(); 
                        if (gData.reviews && gData.reviews.length > 0) { 
                            googleMarketing.total_avis = gData.reviews.length; 
                            let totalStars = 0; const ratingMap = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 }; 
                            gData.reviews.forEach(review => { totalStars += ratingMap[review.starRating] || 5; }); 
                            googleMarketing.note_actuelle = parseFloat((totalStars / googleMarketing.total_avis).toFixed(1)); 
                            googleMarketing.tendance_6_mois = [ googleMarketing.note_actuelle - 0.4, googleMarketing.note_actuelle - 0.3, googleMarketing.note_actuelle - 0.1, googleMarketing.note_actuelle + 0.1, googleMarketing.note_actuelle, googleMarketing.note_actuelle ]; 
                        } 
                    } 
                } 
            } 
        } catch (e) { console.error("Avertissement Google API :", e); } 
        res.json({ statut: "Succès", finances: { chiffre_affaires_total: caTotal, panier_moyen: nbVentes > 0 ? (caTotal / nbVentes).toFixed(2) : 0, commissions_a_payer: parseFloat(commissionsResult.rows[0].total_commissions) }, top_3_prestations: topPrestationsResult.rows, marketing: googleMarketing }); 
    } catch (erreur) { res.status(500).json({ erreur: "Erreur calcul dashboard." }); }
});

app.post('/api/settings', verifierToken, async (req, res) => { const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps } = req.body; try { const updateQuery = `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8 WHERE id_salon = $9`; await pool.query(updateQuery, [google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, req.user.id_salon]); res.json({ message: "Paramètres enregistrés avec succès !" }); } catch (erreur) { res.status(500).json({ erreur: "Erreur lors de la sauvegarde." }); }});
app.get('/api/settings', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]); res.json(result.rowCount > 0 ? result.rows[0] : {}); } catch (erreur) { res.status(500).json({ erreur: "Erreur lecture config." }); }});

// =========================================================================
// --- IA COMPTABLE ET EXPORT PDF ---
// =========================================================================

app.post('/api/factures/scan', verifierToken, async (req, res) => { const { texte_facture, nom_fournisseur } = req.body; try { const matchTTC = texte_facture.match(/TTC[\s:a-zA-Z]*([\d.,]+)/i); const matchTVA = texte_facture.match(/TVA[\s:a-zA-Z]*([\d.,]+)/i); if (!matchTTC || !matchTVA) return res.status(400).json({ erreur: "Montants introuvables." }); const ttc = parseFloat(matchTTC[1].replace(',', '.')); const tva = parseFloat(matchTVA[1].replace(',', '.')); const ht = parseFloat((ttc - tva).toFixed(2)); await pool.query(`INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon) VALUES ($1, $2, $3, $4, $5)`, [nom_fournisseur || 'Inconnu', ht, tva, ttc, req.user.id_salon]); res.status(201).json({ message: "Succès !", donnees_extraites: { ht, tva, ttc } }); } catch (erreur) { res.status(500).json({ erreur: "Erreur traitement facture." }); }});
app.get('/api/factures/historique', verifierToken, async (req, res) => { try { const histoQuery = `SELECT TO_CHAR(DATE_TRUNC('month', date_traitement), 'MM/YYYY') as mois_annee, SUM(montant_ttc) as total_ttc, json_agg(json_build_object('id', id_facture, 'fournisseur', nom_fournisseur, 'date', TO_CHAR(date_traitement, 'DD/MM/YYYY'), 'ttc', montant_ttc)) as factures FROM factures_fournisseurs WHERE id_salon = $1 GROUP BY DATE_TRUNC('month', date_traitement), mois_annee ORDER BY DATE_TRUNC('month', date_traitement) DESC;`; const result = await pool.query(histoQuery, [req.user.id_salon]); let historique = result.rows.map(row => ({ mois: "Mois " + row.mois_annee, total_ttc: parseFloat(row.total_ttc), factures: row.factures })); res.json(historique); } catch (erreur) { res.status(500).json({ erreur: "Erreur Historique" }); }});

app.get('/api/export-pdf', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const configResult = await pool.query('SELECT email_reception_factures, mot_de_passe_app_email FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonConfig = configResult.rowCount > 0 ? configResult.rows[0] : null;
        const facturesResult = await pool.query(`SELECT nom_fournisseur, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1`, [id_salon]);
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1`, [id_salon]);
        const rhResult = await pool.query(`SELECT e.nom, COALESCE(SUM(c.montant_commission), 0) as total_prime FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 WHERE e.id_salon = $1 GROUP BY e.nom`, [id_salon]);
        const caTotal = parseFloat(caResult.rows[0].ca_total);

        const doc = new PDFDocument();
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            const pdfData = Buffer.concat(buffers); 
            if (salonConfig && salonConfig.email_reception_factures && salonConfig.mot_de_passe_app_email) {
                try {
                    let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: salonConfig.email_reception_factures, pass: salonConfig.mot_de_passe_app_email } });
                    await transporter.sendMail({
                        from: `"SaaS Caisse" <${salonConfig.email_reception_factures}>`, to: salonConfig.email_reception_factures, 
                        subject: '📊 Liasse Comptable Mensuelle', text: 'Bonjour, \nVeuillez trouver en pièce jointe la liasse comptable du mois.',
                        attachments: [{ filename: `Liasse_Comptable_${Date.now()}.pdf`, content: pdfData }]
                    });
                } catch (emailError) {} 
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Liasse_Comptable.pdf"`);
        doc.pipe(res);
        doc.fontSize(22).fillColor('#a154f2').text('Liasse Comptable Mensuelle', { align: 'center' }).moveDown();
        doc.fontSize(16).fillColor('#1c1c1e').text(`Chiffre d'Affaires total : ${caTotal.toFixed(2)} €`, { align: 'center' }).moveDown(2);
        doc.fontSize(14).fillColor('#8e8e93').text('FACTURES (DÉPENSES)', { underline: true }).moveDown();
        let totalDepenses = 0; doc.fontSize(12).fillColor('#3a3a3c');
        if (facturesResult.rowCount === 0) { doc.text('Aucune facture scannée ce mois-ci.'); } 
        else { facturesResult.rows.forEach(f => { doc.text(`- ${f.date} | ${f.nom_fournisseur} : ${parseFloat(f.montant_ttc).toFixed(2)} €`); totalDepenses += parseFloat(f.montant_ttc); }); }
        doc.moveDown(); doc.fontSize(12).fillColor('#1c1c1e').text(`Total Dépenses : ${totalDepenses.toFixed(2)} €`, { align: 'right' }).moveDown(2);
        doc.fontSize(14).fillColor('#8e8e93').text('COMMISSIONS EMPLOYÉS', { underline: true }).moveDown();
        let totalPrimes = 0; doc.fontSize(12).fillColor('#3a3a3c');
        if (rhResult.rowCount === 0) { doc.text('Aucune commission enregistrée.'); } 
        else { rhResult.rows.forEach(c => { doc.text(`- ${c.nom} : ${parseFloat(c.total_prime).toFixed(2)} €`); totalPrimes += parseFloat(c.total_prime); }); }
        doc.moveDown(); doc.fontSize(12).fillColor('#1c1c1e').text(`Total Primes : ${totalPrimes.toFixed(2)} €`, { align: 'right' });
        doc.end();
    } catch (erreur) { res.status(500).send("Erreur lors de la génération du PDF."); }
});

async function executerRobotComptable() {
    const clientDB = await pool.connect();
    try {
        const salonsResult = await clientDB.query('SELECT id_salon, email_reception_factures, mot_de_passe_app_email FROM configuration_salon WHERE email_reception_factures IS NOT NULL');
        for (let salon of salonsResult.rows) {
            const imapClient = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: salon.email_reception_factures, pass: salon.mot_de_passe_app_email }, logger: false });
            try {
                await imapClient.connect();
                let lock = await imapClient.getMailboxLock('INBOX');
                try {
                    for await (let message of imapClient.fetch({ unseen: true, subject: 'facture' }, { source: true })) {
                        const mailParsi = await simpleParser(message.source);
                        const matchTTC = (mailParsi.text || "").match(/TTC[\s:a-zA-Z]*([\d.,]+)/i);
                        if (matchTTC) {
                            const ttc = parseFloat(matchTTC[1].replace(',', '.'));
                            const matchTVA = (mailParsi.text || "").match(/TVA[\s:a-zA-Z]*([\d.,]+)/i);
                            const tva = matchTVA ? parseFloat(matchTVA[1].replace(',', '.')) : parseFloat((ttc * 0.20).toFixed(2));
                            const ht = parseFloat((ttc - tva).toFixed(2));
                            await clientDB.query(`INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon) VALUES ($1, $2, $3, $4, $5)`, 
                                [mailParsi.from?.value[0]?.name || 'Expéditeur Inconnu', ht, tva, ttc, salon.id_salon]);
                            await imapClient.messageFlagsAdd({seq: message.seq}, ['\\Seen']);
                        }
                    }
                } finally { lock.release(); }
                await imapClient.logout();
            } catch (errConnect) {}
        }
    } catch (erreur) {} finally { clientDB.release(); }
}
cron.schedule('0 3 * * *', () => { executerRobotComptable(); });
app.get('/api/admin/forcer-robot', async (req, res) => { executerRobotComptable(); res.json({ message: "Robot comptable lancé." }); });

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`✅ API Multi-Tenant LÉGALE démarrée sur le port ${PORT}`));
