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
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');

// Le SDK "openai" est utilisé comme simple client HTTP compatible : on le
// pointe vers l'API de Groq (gratuite, très rapide) plutôt que vers OpenAI.
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const http = require('http');
const { Server } = require('socket.io');

console.log("Étape 3 : Configuration d'Express et WebSockets...");
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    socket.on('rejoindreSalon', (id_salon) => { 
        socket.join(id_salon.toString()); 
    });
});

// =========================================================================
// --- CANAL SSE POUR LES ÉVÉNEMENTS IA (remplace Socket.io pour ce flux) ---
// =========================================================================
const abonnesSSE = new Map(); // id_salon (string) -> Set<res>

function envoyerEvenementSSE(id_salon, nomEvenement, data = {}) {
    const room = id_salon.toString();
    const clients = abonnesSSE.get(room);
    if (!clients || clients.size === 0) {
        console.log(`📡 [SSE] Aucun client abonné pour le salon ${room}, événement '${nomEvenement}' perdu.`);
        return;
    }
    const payload = `event: ${nomEvenement}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
    console.log(`📡 [SSE] '${nomEvenement}' envoyé -> salon ${room} (${clients.size} client(s))`);
}

// Route d'abonnement au flux
app.get('/api/events/:id_salon', (req, res) => {
    const { token } = req.query;
    let user;
    try {
        user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return res.status(401).end();
    }
    if (String(user.id_salon) !== req.params.id_salon) return res.status(403).end();
    const room = req.params.id_salon;

    req.setTimeout(0);
    res.socket.setTimeout(0);
    res.socket.setNoDelay(true);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    if (!abonnesSSE.has(room)) abonnesSSE.set(room, new Set());
    abonnesSSE.get(room).add(res);
    console.log(`📡 [SSE] Connexion ouverte pour salon ${room} (${abonnesSSE.get(room).size} client(s))`);

    res.write(`event: connected\ndata: {}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(`event: heartbeat\ndata: {}\n\n`);
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        abonnesSSE.get(room)?.delete(res);
        console.log(`📡 [SSE] Connexion fermée pour salon ${room}`);
    });
});
// =========================================================================

app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks' || req.originalUrl === '/api/webhooks/') { 
      next(); 
  } else { 
      express.json({ limit: '10mb' })(req, res, next); 
  }
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

// =========================================================================
// --- CRM : AUTO-HEALING & CONFIGURATION FIDÉLITÉ & IA ---
// =========================================================================
pool.query(`
    CREATE TABLE IF NOT EXISTS ia_taches_attente (
        id_tache SERIAL PRIMARY KEY,
        id_salon INT,
        type_tache VARCHAR(50),
        donnees JSONB,
        statut VARCHAR(20) DEFAULT 'ATTENTE',
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS stripe_reader_id VARCHAR(255);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS prenom VARCHAR(100);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_naissance DATE;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS points_fidelite INT DEFAULT 0;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tampons_fidelite INT DEFAULT 0;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS derniere_visite DATE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS heure_ouverture INT DEFAULT 8;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS heure_fermeture INT DEFAULT 20;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS recompense_utilisee BOOLEAN DEFAULT FALSE;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS methode_paiement VARCHAR(50) DEFAULT 'CARTE';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'VALIDE';
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
`).then(() => console.log("✅ Base de données prête (Paiement, IA, CRM)")).catch((e) => console.error("❌ Erreur Auto-healing:", e));

const verifierToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
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
        } catch (e) { return res.status(500).json({ erreur: "Erreur vérification." }); }
    });
};

// =========================================================================
// --- AUTHENTIFICATION & BILLING ---
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
        } catch(e) {}
        
        await clientDB.query(
            'INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, _customer_id, statut_abonnement) VALUES ($1, $2, $3, $4, $5, $6)', 
            [email, hash, idNouveauSalon, 'gerant', customerId, 'inactif']
        ); 
        await clientDB.query('COMMIT');
        const token = jwt.sign({ id_salon: idNouveauSalon, role: 'gerant' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: "Inscription réussie", token });
    } catch (erreur) { 
        await clientDB.query('ROLLBACK'); 
        res.status(400).json({ erreur: erreur.message }); 
    } finally { clientDB.release(); }
});

app.post('/api/login', async (req, res) => {
    const { email, mot_de_passe } = req.body;
    try {
        const result = await pool.query('SELECT id_salon, mot_de_passe_hash, statut_abonnement FROM utilisateurs WHERE email = $1 LIMIT 1', [email]);
        if (result.rowCount > 0) {
            const { id_salon, mot_de_passe_hash, statut_abonnement } = result.rows[0];
            const match = await bcrypt.compare(mot_de_passe, mot_de_passe_hash);
            if (match) {
                const token = jwt.sign({ id_salon, role: 'gerant' }, process.env.JWT_SECRET, { expiresIn: '24h' });
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
        const token = jwt.sign({ id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe }, process.env.JWT_SECRET, { expiresIn: '12h' });
        res.json({ message: "Accès employé autorisé", token, employe: { id: emp.id_employe, nom: emp.nom } });
    } catch (e) { res.status(500).json({ erreur: "Erreur serveur PIN." }); }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return res.status(500).json({ erreur: "Serveur mail non configuré." });
        const result = await pool.query('SELECT id_user FROM utilisateurs WHERE email = $1', [email]);
        if (result.rowCount === 0) return res.json({ message: "Si cet email existe, un lien a été envoyé." });
        const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const resetLink = `https://app-salon-caiss.onrender.com/?resetToken=${resetToken}`;
        let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        await transporter.sendMail({ from: `"Support SaaS Caisse" <${process.env.SMTP_USER}>`, to: email, subject: '🔐 Réinitialisation de votre mot de passe', html: `<p>Bonjour,</p><p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 15 minutes) :</p><p><a href="${resetLink}">Réinitialiser mon accès</a></p>` });
        res.json({ message: "Si cet email existe, un lien a été envoyé." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de l'envoi." }); }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, nouveau_mot_de_passe } = req.body;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
        await pool.query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = $2', [hash, decoded.email]);
        res.json({ message: "Mot de passe mis à jour avec succès !" });
    } catch (e) { res.status(400).json({ erreur: "Lien expiré, corrompu ou falsifié." }); }
});

app.post('/api/creer-checkout', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token invalide." });
        try {
            const result = await pool.query('SELECT email, _customer_id FROM utilisateurs WHERE id_salon = $1', [user.id_salon]);
            if (result.rowCount === 0) return res.status(404).json({ erreur: "Utilisateur introuvable." });
            let customerId = result.rows[0]._customer_id;
            if (!customerId) {
                const customer = await stripe.customers.create({ email: result.rows[0].email });
                customerId = customer.id;
                await pool.query('UPDATE utilisateurs SET _customer_id = $1 WHERE id_salon = $2', [customerId, user.id_salon]);
            }
            const session = await stripe.checkout.sessions.create({
              customer: customerId, payment_method_types: ['card'],
              line_items: [{ price: 'price_1UG3bh10YWspHc2C8J2bmXL0', quantity: 1 }], mode: 'subscription',
              success_url: 'https://app-salon-caiss.onrender.com/?paiement=succes', cancel_url: 'https://app-salon-caiss.onrender.com/?paiement=annule',
            });
            res.json({ url: session.url });
        } catch (e) { res.status(500).json({ erreur: "Erreur Stripe : " + e.message }); }
    });
});

app.post('/api/webhooks/', express.raw({type: 'application/json'}), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send("Clé secrète manquante.");
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET); } 
    catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }
    
    if (event.type === 'checkout.session.completed') {
        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1, _subscription_id = $2 WHERE _customer_id = $3', ['actif', event.data.object.subscription, event.data.object.customer]);
    }
    if (event.type === 'customer.subscription.deleted') {
         await pool.query('UPDATE utilisateurs SET statut_abonnement = $1 WHERE _subscription_id = $2', ['inactif', event.data.object.id]);
    }
    res.json({received: true});
});

app.post('/api/settings', verifierToken, async (req, res) => { 
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture } = req.body; 
    try { 
        const updateQuery = `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11 WHERE id_salon = $12`; 
        await pool.query(updateQuery, [google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, heure_ouverture || 8, heure_fermeture || 20, req.user.id_salon]); 
        res.json({ message: "Paramètres enregistrés avec succès !" }); 
    } catch (erreur) { res.status(500).json({ erreur: "Erreur lors de la sauvegarde." }); }
});

app.get('/api/settings', verifierToken, async (req, res) => { 
    try { 
        const result = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]); 
        res.json(result.rowCount > 0 ? result.rows[0] : {}); 
    } catch (erreur) { res.status(500).json({ erreur: "Erreur lecture config." }); }
});

app.get('/api/clients/:id/history', verifierToken, async (req, res) => {
    const id_client = req.params.id; const id_salon = req.user.id_salon;
    try {
        const clientRes = await pool.query('SELECT notes, telephone FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
        if (clientRes.rowCount === 0) return res.status(404).json({ erreur: "Client introuvable" });
        
        const achatsRes = await pool.query(`SELECT t.id_ticket, t.statut, t.date_creation, c.nom as article, lt.quantite, lt.prix_unitaire_ttc FROM tickets t JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_client = $1 AND t.id_salon = $2 ORDER BY t.date_creation DESC LIMIT 20`, [id_client, id_salon]);
        const rdvRes = await pool.query(`SELECT date_heure_debut, prestation, e.nom as nom_employe FROM rendez_vous r LEFT JOIN employes e ON r.id_employe = e.id_employe WHERE r.telephone_client = $1 AND r.id_salon = $2 ORDER BY r.date_heure_debut DESC LIMIT 20`, [clientRes.rows[0].telephone, id_salon]);
        const gainsRes = await pool.query(`SELECT date_creation, total_ttc FROM tickets WHERE id_client = $1 AND id_salon = $2 AND recompense_utilisee = TRUE AND statut != 'ANNULE' ORDER BY date_creation DESC LIMIT 20`, [id_client, id_salon]);

        res.json({ notes: clientRes.rows[0].notes || '', achats: achatsRes.rows, rdv: rdvRes.rows, gains: gainsRes.rows });
    } catch (e) { res.status(500).json({ erreur: "Erreur historique." }); }
});

app.put('/api/clients/:id/notes', verifierToken, async (req, res) => {
    try {
        await pool.query('UPDATE clients SET notes = $1 WHERE id_client = $2 AND id_salon = $3', [req.body.notes, req.params.id, req.user.id_salon]);
        res.json({ message: "Notes sauvegardées" });
    } catch (e) { res.status(500).json({ erreur: "Erreur sauvegarde." }); }
});

app.post('/api/rdv', verifierToken, async (req, res) => {
    const { nom_client, telephone_client, id_employe, prestation, date_heure_debut, duree_minutes } = req.body;
    try {
        await pool.query(`INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [req.user.id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes || 30]);
        io.to(req.user.id_salon.toString()).emit('nouveauRDV');
        res.status(201).json({ message: "RDV ajouté." });
    } catch (e) { res.status(500).json({ erreur: "Erreur création RDV." }); }
});

app.put('/api/rdv/:id', verifierToken, async (req, res) => {
    const { id_employe, prestation, date_heure_debut } = req.body;
    try {
        await pool.query(
            `UPDATE rendez_vous SET id_employe = $1, prestation = $2, date_heure_debut = $3 WHERE id_rdv = $4 AND id_salon = $5`, 
            [id_employe, prestation, date_heure_debut, req.params.id, req.user.id_salon]
        );
        io.to(req.user.id_salon.toString()).emit('nouveauRDV');
        res.json({ message: "Rendez-vous modifié." });
    } catch (e) { res.status(500).json({ erreur: "Erreur modification RDV." }); }
});

app.delete('/api/rdv/:id', verifierToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM rendez_vous WHERE id_rdv = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]);
        io.to(req.user.id_salon.toString()).emit('nouveauRDV');
        res.json({ message: "Rendez-vous supprimé." });
    } catch (e) { res.status(500).json({ erreur: "Erreur suppression RDV." }); }
});

app.get('/api/planning', verifierToken, async (req, res) => {
    const startDate = req.query.startDate; const endDate = req.query.endDate;
    try {
        let query = `SELECT r.*, e.nom as nom_employe FROM rendez_vous r LEFT JOIN employes e ON r.id_employe = e.id_employe WHERE r.id_salon = $1 AND DATE(r.date_heure_debut) >= $2 AND DATE(r.date_heure_debut) <= $3`;
        const params = [req.user.id_salon, startDate, endDate];
        if (req.user.role === 'employe') { query += ` AND r.id_employe = $4`; params.push(req.user.id_employe); }
        query += ` ORDER BY r.date_heure_debut ASC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture agenda." }); }
});

// =========================================================================
// --- L'ENCAISSEMENT & MÉTHODES DE PAIEMENT (SMART POS) ---
// =========================================================================
app.post('/api/caisse/payer', verifierToken, async (req, res) => {
    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const clientDB = await pool.connect();

    try {
        let reader = null;
        let paymentIntentId = null;

        if (methode === 'CARTE' && montant > 0) {
            const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;

            if (!readerId) return res.status(400).json({ erreur: "Aucun lecteur TPE configuré." });

            const paymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(montant * 100), currency: 'eur', payment_method_types: ['card_present'], capture_method: 'manual', 
            });
            paymentIntentId = paymentIntent.id;
            reader = await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });
        }

        await clientDB.query('BEGIN'); 
        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        const numeroTicket = `TKT-${methode.substring(0,2)}-` + Date.now();
        
        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut) VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE') RETURNING id_ticket;`, 
            [numeroTicket, id_client || null, id_employe, montant, id_salon, recompense_appliquee || false, methode]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;

        const newHash = crypto.createHash('sha256').update(`${idNouveauTicket}-${numeroTicket}-${montant}-${previousHash}`).digest('hex');
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

        if (id_client) {
            await clientDB.query(`UPDATE clients SET derniere_visite = CURRENT_DATE WHERE id_client = $1`, [id_client]);
            const configRes = await clientDB.query(`SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
            
            if (configRes.rowCount > 0) {
                const config = configRes.rows[0];
                if (recompense_appliquee) {
                    if (config.fidelite_type === 'POINTS') {
                        await clientDB.query(`UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1) WHERE id_client = $2`, [config.fidelite_points_seuil, id_client]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = GREATEST(0, tampons_fidelite - $1) WHERE id_client = $2`, [config.fidelite_tampons_seuil, id_client]);
                    }
                } else {
                    if (config.fidelite_type === 'POINTS') {
                        const pointsToAdd = Math.floor(montant);
                        await clientDB.query(`UPDATE clients SET points_fidelite = points_fidelite + $1 WHERE id_client = $2`, [pointsToAdd, id_client]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = tampons_fidelite + 1 WHERE id_client = $2`, [id_client]);
                    }
                }
            }
        }

        await clientDB.query('COMMIT');
        
        let messageFinal = (methode === 'CARTE' && montant > 0) ? `En attente du TPE... (Ticket #${idNouveauTicket})` : `Paiement en ${methode} validé (Ticket #${idNouveauTicket})`;
        io.to(id_salon.toString()).emit('paiementValide', { message: messageFinal });
        
        res.json({ message: messageFinal, reader, id_ticket: idNouveauTicket });
    } catch (error) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur Encaisser:", error); res.status(500).json({ erreur: "Erreur lors de l'encaissement. " + error.message });
    } finally { clientDB.release(); }
});

app.put('/api/caisse/annuler-ticket/:id', verifierToken, async (req, res) => {
    const id_ticket = req.params.id;
    const id_salon = req.user.id_salon;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const ticketRes = await clientDB.query("SELECT * FROM tickets WHERE id_ticket = $1 AND id_salon = $2 AND statut != 'ANNULE'", [id_ticket, id_salon]);
        if (ticketRes.rowCount === 0) throw new Error("Ticket introuvable ou déjà annulé.");
        const ticket = ticketRes.rows[0];

        await clientDB.query("UPDATE tickets SET statut = 'ANNULE' WHERE id_ticket = $1", [id_ticket]);
        await clientDB.query("UPDATE commissions SET montant_commission = 0 WHERE id_ticket = $1", [id_ticket]);

        const lignes = await clientDB.query("SELECT id_article, quantite FROM lignes_ticket WHERE id_ticket = $1", [id_ticket]);
        for (let ligne of lignes.rows) {
            await clientDB.query("UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2", [ligne.quantite, ligne.id_article]);
        }

        if (ticket.id_client && !ticket.recompense_utilisee) {
            await clientDB.query("UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1), tampons_fidelite = GREATEST(0, tampons_fidelite - 1) WHERE id_client = $2", [Math.floor(ticket.total_ttc), ticket.id_client]);
        }
        
        await clientDB.query('COMMIT');
        res.json({ message: "Paiement annulé, stock et fidélité restaurés." });
    } catch (err) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: err.message });
    } finally { clientDB.release(); }
});

app.post('/api/caisse/envoyer-ticket', verifierToken, async (req, res) => {
    const { id_ticket, email, id_client, methode } = req.body;
    const id_salon = req.user.id_salon;
    try {
        const salonConfig = await pool.query('SELECT nom_salon, email_reception_factures, mot_de_passe_app_email, brevo_api_key, sms_sender_name FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        if (salonConfig.rowCount === 0) return res.status(404).json({ erreur: "Salon introuvable." });
        const config = salonConfig.rows[0];

        const ticketData = await pool.query('SELECT numero_ticket_caisse, total_ttc, date_creation, methode_paiement FROM tickets WHERE id_ticket = $1 AND id_salon = $2', [id_ticket, id_salon]);
        if (ticketData.rowCount === 0) return res.status(404).json({ erreur: "Ticket introuvable." });
        const ticket = ticketData.rows[0];

        const textRecap = `Merci pour votre visite chez ${config.nom_salon} !\nTicket n°${ticket.numero_ticket_caisse} du ${new Date(ticket.date_creation).toLocaleDateString()}.\nMontant total : ${parseFloat(ticket.total_ttc).toFixed(2)} € (Réglé par ${ticket.methode_paiement}).\nÀ très bientôt !`;

        if (methode === 'email') {
            if (!config.email_reception_factures || !config.mot_de_passe_app_email) return res.status(400).json({ erreur: "Email non configuré." });
            let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.email_reception_factures, pass: config.mot_de_passe_app_email } });
            await transporter.sendMail({ from: `"${config.nom_salon}" <${config.email_reception_factures}>`, to: email, subject: `Votre reçu - ${config.nom_salon}`, text: textRecap });
            if (id_client && email) await pool.query('UPDATE clients SET email = $1 WHERE id_client = $2', [email, id_client]);
        } else if (methode === 'sms') {
            if (!config.brevo_api_key) return res.status(400).json({ erreur: "Clé Brevo non configurée." });
            const client = await pool.query('SELECT telephone FROM clients WHERE id_client = $1', [id_client]);
            if (client.rowCount === 0 || !client.rows[0].telephone) return res.status(400).json({ erreur: "Aucun numéro." });
            await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
                method: 'POST', headers: { 'accept': 'application/json', 'api-key': config.brevo_api_key, 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (config.sms_sender_name || 'LeSalon').substring(0, 11), recipient: client.rows[0].telephone, content: textRecap })
            });
        }
        res.json({ message: "Ticket envoyé." });
    } catch (error) { res.status(500).json({ erreur: "Erreur envoi ticket." }); }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = CURRENT_DATE AND statut != 'ANNULE'`, [id_salon]);
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
app.post('/api/clients', verifierToken, async (req, res) => { const { prenom, nom, telephone, email, date_naissance } = req.body; try { await pool.query('INSERT INTO clients (prenom, nom, telephone, email, date_naissance, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [prenom || '', nom, telephone, email, date_naissance || null, req.user.id_salon]); res.status(201).json({message: "Client ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/clients/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Client supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression client."}); }});

app.get('/api/employes', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM employes WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur employés."}); }});
app.post('/api/employes', verifierToken, async (req, res) => { 
    const { nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url } = req.body; 
    try { 
        await pool.query('INSERT INTO employes (nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, id_salon) VALUES ($1, $2, $3, $4, $5, $6, $7)', [nom, role || 'Employé', taux_commission_prestation || 0, taux_commission_produit || 0, code_pin || '0000', photo_url || null, req.user.id_salon]); 
        res.status(201).json({message: "Employé ajouté"}); 
    } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }
});
app.delete('/api/employes/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM employes WHERE id_employe = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Employé supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression employé."}); }});

app.get('/api/catalogue', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY type_article, nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur catalogue."}); }});
app.post('/api/catalogue', verifierToken, async (req, res) => { const { nom, type_article, prix, stock_actuel, reference } = req.body; try { const typeArticleFormatte = type_article || 'PRESTATION'; const prixFormatte = parseFloat((prix || "0").toString().replace(',', '.')) || 0; const stockFormatte = parseInt(stock_actuel) || 0; const refFormattee = reference ? reference.trim() : null; if (typeArticleFormatte === 'PRODUIT_REVENTE') { if (!refFormattee || refFormattee.length < 4) { return res.status(400).json({ erreur: "Réf valide requise." }); } } const checkQuery = `SELECT * FROM catalogue WHERE (nom ILIKE $1 OR (reference = $2 AND reference IS NOT NULL)) AND id_salon = $3`; const checkResult = await pool.query(checkQuery, [nom, refFormattee, req.user.id_salon]); if (checkResult.rowCount > 0) { const art = checkResult.rows[0]; if (refFormattee && art.reference === refFormattee && typeArticleFormatte === 'PRODUIT_REVENTE') { if (!nom || nom.trim() === '') { await pool.query('UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2', [stockFormatte, art.id_article]); return res.status(200).json({ message: `Stock mis à jour (+${stockFormatte})` }); } else if (nom.trim().toLowerCase() !== art.nom.toLowerCase()) { return res.status(400).json({ erreur: `Référence déjà utilisée.` }); } } if (art.nom.toLowerCase() === nom.trim().toLowerCase()) { return res.status(400).json({ erreur: `L'article existe déjà.` }); } } await pool.query('INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [nom, typeArticleFormatte, prixFormatte, stockFormatte, refFormattee, req.user.id_salon]); res.status(201).json({ message: "Article ajouté avec succès !" }); } catch (e) { res.status(500).json({ erreur: `Erreur interne : ${e.message}` }); }});
app.delete('/api/catalogue/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Article supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression article."}); }});

app.get('/api/stocks', verifierToken, async (req, res) => { try { const stockResult = await pool.query(`SELECT id_article, nom, stock_actuel, seuil_alerte, type_article FROM catalogue WHERE id_salon = $1 AND type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE') ORDER BY nom ASC`, [req.user.id_salon]); res.json(stockResult.rows); } catch (erreur) { res.status(500).json({ erreur: "Erreur stocks." }); }});
app.get('/api/rh', verifierToken, async (req, res) => { const id_salon = req.user.id_salon; try { const rhQuery = `SELECT e.id_employe, e.nom, e.photo_url, COALESCE(e.role, 'Employé') as role, COUNT(DISTINCT CASE WHEN c.type_vente = 'PRESTATION' THEN c.id_ticket END) as clients_coiffes, COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as produits_vendus, COALESCE(SUM(c.montant_vente), 0) as ca_genere, COALESCE(SUM(c.montant_commission), 0) as prime_estimee FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 WHERE e.id_salon = $1 GROUP BY e.id_employe, e.nom, e.photo_url, e.role ORDER BY e.id_employe;`; const rhResult = await pool.query(rhQuery, [id_salon]); const employesData = await Promise.all(rhResult.rows.map(async (emp) => { const histoQuery = `SELECT COALESCE(SUM(montant_commission), 0) as total_prime FROM commissions WHERE id_employe = $1 AND id_salon = $2 GROUP BY EXTRACT(MONTH FROM date_creation), EXTRACT(YEAR FROM date_creation) ORDER BY EXTRACT(YEAR FROM date_creation) ASC, EXTRACT(MONTH FROM date_creation) ASC;`; const histoResult = await pool.query(histoQuery, [emp.id_employe, id_salon]); let historique = histoResult.rows.map(r => parseFloat(r.total_prime)); while(historique.length < 6) historique.unshift(0); if (historique.every(val => val === 0)) historique = [0, 0, 0, 0, 0, parseFloat(emp.prime_estimee) || 0]; return { id_employe: emp.id_employe, nom: emp.nom, role: emp.role, photo_url: emp.photo_url, performances_actuelles: { clients_coiffes: parseInt(emp.clients_coiffes), produits_vendus: parseInt(emp.produits_vendus), ca_genere: parseFloat(emp.ca_genere), prime_estimee: parseFloat(emp.prime_estimee) }, historique_primes: historique.slice(-6) }; })); res.json(employesData); } catch (erreur) { res.status(500).json({ erreur: "Erreur requête RH." }); }});

app.get('/api/dashboard', verifierToken, async (req, res) => { 
    const id_salon = req.user.id_salon; 
    try { 
        const statsResult = await pool.query(`SELECT COUNT(id_ticket) as nb_ventes, COALESCE(SUM(total_ttc), 0) as chiffre_affaires FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE'`, [id_salon]); 
        const nbVentes = parseInt(statsResult.rows[0].nb_ventes); 
        const caTotal = parseFloat(statsResult.rows[0].chiffre_affaires); 
        const topPrestationsResult = await pool.query(`SELECT c.nom, SUM(lt.total_ligne_ttc) as total_genere FROM lignes_ticket lt JOIN tickets t ON lt.id_ticket = t.id_ticket JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_salon = $1 AND c.type_article = 'PRESTATION' AND t.statut != 'ANNULE' GROUP BY c.nom ORDER BY total_genere DESC LIMIT 3`, [id_salon]); 
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

// =========================================================================
// --- L'INTELLIGENCE ARTIFICIELLE (ANALYSE D'EMAILS) ---
// =========================================================================
const PROMPT_SYSTEME_IA = `Tu es un assistant IA pour un salon de coiffure. Analyse cet email et extrais les donnees en JSON strict.
CAS 1 - STOCK : Si le texte parle de livraison, commande, achat, facture ou réassort de produits. -> Renvoie {"type": "STOCK", "donnees": {"nom_produit": "nom du produit", "quantite": entier, "reference": ""}}
CAS 2 - RDV : Si le texte indique qu'un client veut prendre un rendez-vous. -> Renvoie {"type": "RDV", "donnees": {"nom_client": "nom", "telephone": "numero", "prestation": "coupe, couleur...", "date_heure": "YYYY-MM-DDTHH:MM"}}
CAS 3 - AUTRE : Pour tout le reste (pubs, spam, etc.) -> Renvoie {"type": "NONE"}`;

async function analyserEmailAvecIA(sujet, texte) {
    if (!process.env.GROQ_API_KEY) return [];

    const texteTronque = (texte || '').substring(0, 8000);

    try {
        const completion = await groq.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 250,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: PROMPT_SYSTEME_IA },
                { role: 'user', content: `Sujet : ${sujet}\n\nCorps de l'e-mail :\n${texteTronque}` }
            ]
        });

        const brut = completion.choices?.[0]?.message?.content;
        if (!brut) return [];

        let analyse;
        try {
            const jsonNettoye = brut.replace(/```json/gi, '').replace(/```/g, '').trim();
            analyse = JSON.parse(jsonNettoye);
            console.log("✅ L'IA a compris :", analyse);
        } catch (erreurParsing) { return []; }

        if (analyse.type === 'STOCK' && analyse.donnees && analyse.donnees.nom_produit) {
            const quantite = parseInt(analyse.donnees.quantite, 10);
            if (!quantite || quantite <= 0) return [];
            return [{
                type_tache: 'STOCK',
                donnees: {
                    nom_produit: String(analyse.donnees.nom_produit).trim().substring(0, 100),
                    quantite,
                    reference: analyse.donnees.reference ? String(analyse.donnees.reference).trim().substring(0, 100) : '',
                    prix: 0
                }
            }];
        }

        if (analyse.type === 'RDV' && analyse.donnees && analyse.donnees.nom_client) {
            return [{
                type_tache: 'RDV',
                donnees: {
                    nom_client: String(analyse.donnees.nom_client).trim().substring(0, 100),
                    telephone: analyse.donnees.telephone ? String(analyse.donnees.telephone).replace(/[^\d+]/g, '').substring(0, 20) : '',
                    prestation: analyse.donnees.prestation ? String(analyse.donnees.prestation).trim().substring(0, 100) : 'Prestation à définir',
                    date_heure_debut: analyse.donnees.date_heure || '',
                    id_employe: ''
                }
            }];
        }

        return [];
    } catch (erreurIA) { return []; }
}

app.get('/api/ia/taches', verifierToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM ia_taches_attente WHERE id_salon = $1 AND statut = 'ATTENTE' ORDER BY date_creation DESC", [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur IA" }); }
});

app.post('/api/ia/taches/:id/valider', verifierToken, async (req, res) => {
    const { id } = req.params;
    const donnees = req.body;
    const id_salon = req.user.id_salon;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const tacheRes = await clientDB.query("SELECT type_tache FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2", [id, id_salon]);
        if (tacheRes.rowCount === 0) throw new Error("Tâche introuvable.");
        const type_tache = tacheRes.rows[0].type_tache;

        if (type_tache === 'STOCK') {
            const check = await clientDB.query("SELECT id_article FROM catalogue WHERE (nom ILIKE $1 OR reference = $2) AND id_salon = $3", [donnees.nom_produit, donnees.reference || null, id_salon]);
            if (check.rowCount > 0) {
                await clientDB.query("UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2", [donnees.quantite, check.rows[0].id_article]);
            } else {
                await clientDB.query("INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, id_salon) VALUES ($1, 'PRODUIT_REVENTE', $2, $3, $4, $5)", [donnees.nom_produit, donnees.prix || 0, donnees.quantite, donnees.reference || null, id_salon]);
            }
        } else if (type_tache === 'RDV') {
            const datetime = donnees.date_heure_debut ? donnees.date_heure_debut : new Date().toISOString();
            const idEmploye = donnees.id_employe ? parseInt(donnees.id_employe) : null;
            
            // Ajoute le RDV
            await clientDB.query(
                `INSERT INTO rendez_vous (id_salon, nom_client, telephone_client, prestation, date_heure_debut, id_employe, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, 30)`, 
                [id_salon, donnees.nom_client, donnees.telephone, donnees.prestation, datetime, idEmploye]
            );
            
            // Crée le profil client dans le CRM s'il n'existe pas
            await clientDB.query(
                "INSERT INTO clients (nom, telephone, id_salon) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM clients WHERE telephone = $2 AND id_salon = $3)", 
                [donnees.nom_client, donnees.telephone, id_salon]
            );
        }

        await clientDB.query("UPDATE ia_taches_attente SET statut = 'VALIDE' WHERE id_tache = $1", [id]);
        await clientDB.query('COMMIT');
        res.json({ message: "Action IA validée !" });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: e.message });
    } finally { 
        clientDB.release(); 
    }
});

app.post('/api/ia/taches/:id/ignorer', verifierToken, async (req, res) => {
    try {
        await pool.query("UPDATE ia_taches_attente SET statut = 'IGNORE' WHERE id_tache = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
        res.json({ message: "Tâche ignorée." });
    } catch (e) { res.status(500).json({ erreur: "Erreur" }); }
});

// =========================================================================
// --- LECTURE DES MAILS & EXPORT PDF ---
// =========================================================================
app.get('/api/factures/historique', verifierToken, async (req, res) => { 
    try { 
        const histoQuery = `SELECT TO_CHAR(DATE_TRUNC('month', date_traitement), 'MM/YYYY') as mois_annee, SUM(montant_ttc) as total_ttc, json_agg(json_build_object('id', id_facture, 'fournisseur', nom_fournisseur, 'date', TO_CHAR(date_traitement, 'DD/MM/YYYY'), 'ttc', montant_ttc)) as factures FROM factures_fournisseurs WHERE id_salon = $1 GROUP BY DATE_TRUNC('month', date_traitement), mois_annee ORDER BY DATE_TRUNC('month', date_traitement) DESC;`; 
        const result = await pool.query(histoQuery, [req.user.id_salon]); 
        let historique = result.rows.map(row => ({ mois: "Mois " + row.mois_annee, total_ttc: parseFloat(row.total_ttc), factures: row.factures })); 
        res.json(historique); 
    } catch (erreur) { res.status(500).json({ erreur: "Erreur Historique" }); }
});

app.get('/api/export-pdf', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const configResult = await pool.query('SELECT email_reception_factures, mot_de_passe_app_email FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonConfig = configResult.rowCount > 0 ? configResult.rows[0] : null;
        
        const facturesResult = await pool.query(`SELECT nom_fournisseur, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1`, [id_salon]);
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE'`, [id_salon]);
        const caParMethodeResult = await pool.query(`SELECT methode_paiement, COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' GROUP BY methode_paiement`, [id_salon]);
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
                        subject: '📊 Liasse Comptable Mensuelle', text: 'Bonjour, \nVeuillez trouver en pièce jointe la liasse comptable du mois avec le détail des encaissements.',
                        attachments: [{ filename: `Liasse_Comptable_${Date.now()}.pdf`, content: pdfData }]
                    });
                } catch (emailError) {} 
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Liasse_Comptable.pdf"`);
        doc.pipe(res);
        doc.fontSize(22).fillColor('#a154f2').text('Liasse Comptable Mensuelle', { align: 'center' }).moveDown();
        doc.fontSize(16).fillColor('#1c1c1e').text(`Chiffre d'Affaires total : ${caTotal.toFixed(2)} €`, { align: 'center' }).moveDown();
        
        doc.fontSize(12).fillColor('#8e8e93').text('Détail des encaissements (Loi NF525) :', { align: 'center' });
        caParMethodeResult.rows.forEach(m => {
            doc.fillColor('#3a3a3c').text(`- ${m.methode_paiement} : ${parseFloat(m.total).toFixed(2)} €`, { align: 'center' });
        });
        doc.moveDown(2);

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
        // 1. MÉMOIRE MULTI-SALONS (Bloque les comptes fantômes)
        await clientDB.query(`
            CREATE TABLE IF NOT EXISTS robot_memoire_emails (
                message_id VARCHAR(255),
                id_salon INT,
                date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, id_salon)
            )
        `);

        await clientDB.query(`DELETE FROM robot_memoire_emails WHERE date_traitement < NOW() - INTERVAL '7 days'`);

        const salonsResult = await clientDB.query('SELECT id_salon, email_reception_factures, mot_de_passe_app_email FROM configuration_salon WHERE email_reception_factures IS NOT NULL');
        for (let salon of salonsResult.rows) {
            const imapClient = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: salon.email_reception_factures, pass: salon.mot_de_passe_app_email }, logger: false });
            try {
                await imapClient.connect();
                let lock = await imapClient.getMailboxLock('INBOX');
                try {
                    const dateLimite = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    
                    for await (let message of imapClient.fetch({ since: dateLimite }, { source: true, uid: true })) {
                        const mailParsi = await simpleParser(message.source);
                        const idUnique = mailParsi.messageId || message.uid.toString();
                        
                        // VÉRIFICATION ISOLÉE POUR CE SALON
                        const dejaTraite = await clientDB.query('SELECT message_id FROM robot_memoire_emails WHERE message_id = $1 AND id_salon = $2', [idUnique, salon.id_salon]);
                        
                        if (dejaTraite.rows.length > 0) continue;

                        const texteEmail = mailParsi.text || mailParsi.html || ""; 
                        const sujetEmail = mailParsi.subject || "Sans Sujet";
                        
                        console.log(`\n=========================================`);
                        console.log(`📧 EMAIL DÉTECTÉ (Salon ${salon.id_salon}) : "${sujetEmail}"`);
                        
                        const matchTTC = texteEmail.match(/TTC[\s:a-zA-Z]*([\d.,]+)/i);
                        if (matchTTC) {
                            const ttc = parseFloat(matchTTC[1].replace(',', '.'));
                            const matchTVA = texteEmail.match(/TVA[\s:a-zA-Z]*([\d.,]+)/i);
                            const tva = matchTVA ? parseFloat(matchTVA[1].replace(',', '.')) : parseFloat((ttc * 0.20).toFixed(2));
                            const ht = parseFloat((ttc - tva).toFixed(2));
                            await clientDB.query(`INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon) VALUES ($1, $2, $3, $4, $5)`, [sujetEmail, ht, tva, ttc, salon.id_salon]);
                        }

                        const tachesTrouvees = await analyserEmailAvecIA(sujetEmail, texteEmail);
                        for (let t of tachesTrouvees) {
                            // CORRECTION : On insère t.donnees directement pour garder le format objet
                            await clientDB.query(
                                `INSERT INTO ia_taches_attente (id_salon, type_tache, donnees) VALUES ($1, $2, $3)`,
                                [salon.id_salon, t.type_tache || t.type, t.donnees] 
                            );
                            
                            // NOUVEAU CANAL SSE
                            envoyerEvenementSSE(salon.id_salon, 'nouvelleTacheIA');
                        }

                        // SAUVEGARDE DANS LA BONNE TABLE MULTI-SALON
                        await clientDB.query('INSERT INTO robot_memoire_emails (message_id, id_salon) VALUES ($1, $2)', [idUnique, salon.id_salon]);
                    }
                } finally { lock.release(); }
                await imapClient.logout();
            } catch (errConnect) {
                console.log(`Erreur IMAP Salon ${salon.id_salon} :`, errConnect.message);
            }
        }
    } catch (erreur) {
        console.log("Erreur globale robot :", erreur.message);
    } finally { clientDB.release(); }
}
cron.schedule('0 */3 * * *', () => { executerRobotComptable(); });
app.get('/api/admin/forcer-robot', async (req, res) => { executerRobotComptable(); res.json({ message: "Robot IA & Comptable lancé." }); });


// =========================================================================
// --- ROBOT MARKETING (CRON JOB) - FIDÉLITÉ & ANNIVERSAIRES ---
// =========================================================================
cron.schedule('0 9 * * *', async () => {
    try {
        const salons = await pool.query("SELECT * FROM configuration_salon WHERE brevo_api_key IS NOT NULL AND brevo_api_key != ''");
        for (let salon of salons.rows) {
            if (salon.fidelite_delai_sms && salon.fidelite_delai_sms > 0) {
                const clientsInactifs = await pool.query(`
                    SELECT c.* FROM clients c
                    LEFT JOIN rendez_vous r ON r.telephone_client = c.telephone AND r.date_heure_debut >= NOW()
                    WHERE c.id_salon = $1 
                    AND c.derniere_visite <= NOW() - INTERVAL '${salon.fidelite_delai_sms} days'
                    AND r.id_rdv IS NULL
                `, [salon.id_salon]);

                for (let client of clientsInactifs.rows) {
                    if (!client.telephone) continue;
                    let message = "";
                    if (salon.fidelite_type === 'TAMPONS') {
                        const restants = salon.fidelite_tampons_seuil - (client.tampons_fidelite || 0);
                        message = `Hey ${client.prenom || client.nom} ! Cela fait un moment qu'on ne t'a pas vu chez ${salon.sms_sender_name}. Plus que ${restants} passage(s) avant ta récompense ! Prends vite rendez-vous : ${salon.lien_google_maps}`;
                    } else if (salon.fidelite_type === 'POINTS') {
                        message = `Bonjour ${client.prenom || client.nom}, votre fidélité paie ! Vous avez ${client.points_fidelite || 0} points. Venez en profiter chez ${salon.sms_sender_name}. RDV: ${salon.lien_google_maps}`;
                    }
                    if (message !== "") await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, client.telephone, message);
                }
            }

            const anniversaires = await pool.query(`
                SELECT * FROM clients 
                WHERE id_salon = $1 
                AND EXTRACT(MONTH FROM date_naissance) = EXTRACT(MONTH FROM NOW()) 
                AND EXTRACT(DAY FROM date_naissance) = EXTRACT(DAY FROM NOW())
            `, [salon.id_salon]);

            for (let client of anniversaires.rows) {
                if (client.telephone) {
                    await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, client.telephone, `Joyeux anniversaire ${client.prenom || client.nom} ! 🎉 ${salon.sms_sender_name} a une surprise pour vous aujourd'hui. Prenez RDV : ${salon.lien_google_maps}`);
                }
            }
        }
    } catch (err) {}
});

async function envoyerSMS(apiKey, sender, phone, text) {
    try {
        await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST', headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: true, sender: sender.substring(0, 11), recipient: phone, content: text })
        });
    } catch(e) {}
}

app.get('/api/admin/nettoyer-fantomes', async (req, res) => {
    try {
        // On efface les identifiants e-mail de TOUS les salons, SAUF le tien (le 38)
        await pool.query('UPDATE configuration_salon SET email_reception_factures = NULL, mot_de_passe_app_email = NULL WHERE id_salon != 38');
        res.json({ message: "🧹 Fantômes nettoyés ! Seul le salon 38 a désormais accès au robot." });
    } catch (e) {
        res.status(500).json({ erreur: e.message });
    }
});

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`✅ API Multi-Tenant LÉGALE démarrée sur le port ${PORT}`));
