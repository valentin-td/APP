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

// =========================================================================
// --- MOTEUR DE CRYPTAGE RGPD (AES-256-CBC) ---
// =========================================================================
const ENCRYPTION_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'stack_secret_de_secours_absolu', 'salt', 32);
const ALGORITHM = 'aes-256-cbc';

function chiffrer(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (e) { return text; }
}

function dechiffrer(text) {
    if (!text || !text.includes(':')) return text; 
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) { return text; }
}

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

    CREATE TABLE IF NOT EXISTS taches_actions (
        id_tache SERIAL PRIMARY KEY,
        id_salon INT,
        titre VARCHAR(255),
        description TEXT,
        date_echeance DATE,
        statut VARCHAR(20) DEFAULT 'A_FAIRE',
        source VARCHAR(20) DEFAULT 'MANUEL',
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS protocoles (
        id_protocole SERIAL PRIMARY KEY,
        id_salon INT,
        nom_prestation VARCHAR(255),
        description TEXT,
        photo_url TEXT,
        delai_livraison_jours INT DEFAULT 3,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recettes_articles (
        id_recette SERIAL PRIMARY KEY,
        id_protocole INT REFERENCES protocoles(id_protocole) ON DELETE CASCADE,
        id_article INT,
        quantite_necessaire NUMERIC(10,2) DEFAULT 1
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
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_type VARCHAR(20) DEFAULT 'NONE';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_points_seuil INT DEFAULT 100;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_points_valeur VARCHAR(50) DEFAULT '10';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_tampons_seuil INT DEFAULT 10;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_recompense_type VARCHAR(20) DEFAULT 'MONTANT';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_recompense_valeur VARCHAR(50) DEFAULT '10';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_delai_sms INT DEFAULT 60;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS recompense_utilisee BOOLEAN DEFAULT FALSE;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS methode_paiement VARCHAR(50) DEFAULT 'CARTE';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'VALIDE';
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS telephone_gerant VARCHAR(20);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS alertes_sms_actives BOOLEAN DEFAULT FALSE;

    -- =====================================================================
    -- --- NF525 / ISCA : Inaltérabilité, Journal des Événements Techniques,
    -- --- Clôtures scellées et Grand Total perpétuel.
    -- =====================================================================

    -- 1. Écritures de compensation (le ticket d'origine n'est JAMAIS modifié
    --    dans ses montants ; on lui ajoute seulement un marqueur non-fiscal
    --    et on crée un ticket négatif lié).
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type_ticket VARCHAR(20) DEFAULT 'VENTE';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_ticket_origine INT REFERENCES tickets(id_ticket);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS motif_annulation TEXT;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS est_compense BOOLEAN DEFAULT FALSE;

    -- 2. Snapshot des lignes (nom, prix TTC, taux de TVA figés au moment de
    --    la vente : une modification ultérieure du catalogue ne doit jamais
    --    réécrire l'historique).
    ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS nom_article_snapshot VARCHAR(255);
    ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS taux_tva_snapshot NUMERIC(5,2) DEFAULT 20.00;
    ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5,2) DEFAULT 20.00;

    -- 3. Journal des Événements Techniques (JET), chaîné par hash comme les
    --    tickets (chaque ligne référence le hash de la précédente).
    CREATE TABLE IF NOT EXISTS jet_logs (
        id_jet SERIAL PRIMARY KEY,
        id_salon INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        details JSONB,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hash_precedent VARCHAR(64),
        hash_jet VARCHAR(64)
    );
    CREATE INDEX IF NOT EXISTS idx_jet_logs_salon_date ON jet_logs (id_salon, date_creation);

    -- 4. Clôtures : on fige un jour civil par salon (blocage Z), on scelle
    --    le cumul perpétuel, et on chaîne les Z entre eux.
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS id_cloture SERIAL;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS date_cloture DATE;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS cumul_perpetuel_ttc NUMERIC(14,2);
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
`).then(async () => {
    // Backfill de date_cloture à partir de date_creation pour les Z déjà existants,
    // AVANT de poser la contrainte d'unicité (sinon un DEFAULT CURRENT_DATE
    // matérialisé sur d'anciennes lignes provoquerait de faux doublons).
    try {
        await pool.query(`UPDATE clotures_caisse SET date_cloture = DATE(date_creation) WHERE date_cloture IS NULL;`);
        await pool.query(`ALTER TABLE clotures_caisse ALTER COLUMN date_cloture SET DEFAULT CURRENT_DATE;`);
        await pool.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cloture_salon_jour') THEN
                    ALTER TABLE clotures_caisse ADD CONSTRAINT uq_cloture_salon_jour UNIQUE (id_salon, date_cloture);
                END IF;
            END $$;
        `);
        console.log("✅ Base de données prête (Paiement, IA, CRM, NF525/ISCA, Protocoles)");
    } catch (e) {
        // Si votre table clotures_caisse ne possède pas de colonne "date_creation",
        // adaptez cette étape de backfill au nom réel de votre colonne de date.
        console.error("❌ Erreur backfill date_cloture (NF525):", e);
    }
}).catch((e) => console.error("❌ Erreur Auto-healing:", e));

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
// --- NF525 / ISCA : JOURNAL DES ÉVÉNEMENTS TECHNIQUES (JET) ---
// =========================================================================
async function enregistrerJET(id_salon, action, details = {}, dbClient = pool) {
    try {
        await dbClient.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);
        const dernier = await dbClient.query(
            'SELECT hash_jet FROM jet_logs WHERE id_salon = $1 ORDER BY id_jet DESC LIMIT 1',
            [id_salon]
        );
        const hashPrecedent = dernier.rowCount > 0 ? dernier.rows[0].hash_jet : 'GENESIS_JET';
        const dateISO = new Date().toISOString();
        const detailsJSON = JSON.stringify(details || {});
        const hashJet = crypto.createHash('sha256')
            .update(`${id_salon}-${action}-${detailsJSON}-${dateISO}-${hashPrecedent}`)
            .digest('hex');
        await dbClient.query(
            'INSERT INTO jet_logs (id_salon, action, details, date_creation, hash_precedent, hash_jet) VALUES ($1, $2, $3, $4, $5, $6)',
            [id_salon, action, detailsJSON, dateISO, hashPrecedent, hashJet]
        );
        return hashJet;
    } catch (e) {
        console.error(`❌ Erreur JET (${action}):`, e.message);
        return null;
    }
}

// =========================================================================
// --- NF525 : BLOCAGE Z — interdit l'encaissement si un jour antérieur
// --- n'a pas fait l'objet d'une clôture (Z). ---
// =========================================================================
const verifierClotureZ = async (req, res, next) => {
    const id_salon = req.user.id_salon;
    try {
        const jourBloquant = await pool.query(
            `SELECT MIN(DATE(t.date_creation)) as jour
             FROM tickets t
             WHERE t.id_salon = $1
               AND DATE(t.date_creation) < CURRENT_DATE
               AND NOT EXISTS (
                   SELECT 1 FROM clotures_caisse c
                   WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
               )`,
            [id_salon]
        );
        if (jourBloquant.rowCount > 0 && jourBloquant.rows[0].jour) {
            return res.status(423).json({
                erreur: `Clôture (Z) manquante pour le ${new Date(jourBloquant.rows[0].jour).toLocaleDateString()}. Effectuez la clôture journalière avant de continuer à encaisser.`,
                z_manquant: jourBloquant.rows[0].jour
            });
        }
        next();
    } catch (e) {
        console.error("❌ Erreur vérification blocage Z:", e);
        res.status(500).json({ erreur: "Erreur vérification clôture." });
    }
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
                await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { email, role: 'gerant' });
                res.json({ message: "Connexion réussie", token, statut_abonnement });
            } else {
                await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { email, raison: 'mot_de_passe_incorrect' });
                res.status(401).json({ erreur: "Mot de passe incorrect." });
            }
        } else { res.status(401).json({ erreur: "Aucun compte trouvé avec cet e-mail." }); }
    } catch (error) { res.status(500).json({ erreur: "Erreur serveur." }); }
});

app.post('/api/employes/login-pin', async (req, res) => {
    const { id_salon, nom_employe, code_pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employes WHERE nom ILIKE $1 AND id_salon = $2', [`%${nom_employe}%`, id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Employé introuvable." });
        const emp = result.rows[0];
        if (emp.code_pin !== code_pin) {
            await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { nom_employe, raison: 'pin_incorrect' });
            return res.status(401).json({ erreur: "Code PIN invalide." });
        }
        const token = jwt.sign({ id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe }, process.env.JWT_SECRET, { expiresIn: '12h' });
        await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { nom_employe: emp.nom, role: 'employe', id_employe: emp.id_employe });
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
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture, telephone_gerant, alertes_sms_actives } = req.body; 
    try { 
        const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
        
        const updateQuery = `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13 WHERE id_salon = $14`; 
        await pool.query(updateQuery, [google_api_key, google_account_id, google_location_id, email_factures, passChiffre, brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, heure_ouverture || 8, heure_fermeture || 20, telephone_gerant, alertes_sms_actives || false, req.user.id_salon]); 
        
        await enregistrerJET(req.user.id_salon, 'MODIFICATION_PARAMETRES_SALON', { champs_modifies: Object.keys(req.body) });
        res.json({ message: "Paramètres enregistrés avec succès !" }); 
    } catch (erreur) { res.status(500).json({ erreur: "Erreur lors de la sauvegarde." }); }
});

app.get('/api/settings', verifierToken, async (req, res) => { 
    try { 
        const result = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]); 
        if (result.rowCount > 0) {
            let config = result.rows[0];
            config.mot_de_passe_app_email = dechiffrer(config.mot_de_passe_app_email); 
            res.json(config);
        } else {
            res.json({});
        }
    } catch (erreur) { res.status(500).json({ erreur: "Erreur lecture config." }); }
});

app.get('/api/clients/:id/history', verifierToken, async (req, res) => {
    const id_client = req.params.id; const id_salon = req.user.id_salon;
    try {
        const clientRes = await pool.query('SELECT notes, telephone FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
        if (clientRes.rowCount === 0) return res.status(404).json({ erreur: "Client introuvable" });
        
        const achatsRes = await pool.query(`SELECT t.id_ticket, (CASE WHEN t.est_compense THEN 'ANNULE' ELSE 'VALIDE' END) as statut, t.date_creation, COALESCE(lt.nom_article_snapshot, c.nom) as article, lt.quantite, lt.prix_unitaire_ttc FROM tickets t JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_client = $1 AND t.id_salon = $2 AND t.type_ticket != 'ANNULATION' ORDER BY t.date_creation DESC LIMIT 20`, [id_client, id_salon]);
        const rdvRes = await pool.query(`SELECT date_heure_debut, prestation, e.nom as nom_employe FROM rendez_vous r LEFT JOIN employes e ON r.id_employe = e.id_employe WHERE r.telephone_client = $1 AND r.id_salon = $2 ORDER BY r.date_heure_debut DESC LIMIT 20`, [clientRes.rows[0].telephone, id_salon]);
        const gainsRes = await pool.query(`SELECT date_creation, total_ttc FROM tickets WHERE id_client = $1 AND id_salon = $2 AND recompense_utilisee = TRUE AND statut != 'ANNULE' AND est_compense = FALSE ORDER BY date_creation DESC LIMIT 20`, [id_client, id_salon]);

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
app.post('/api/caisse/payer', verifierToken, verifierClotureZ, async (req, res) => {
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

            if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

            const paymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(montant * 100), currency: 'eur', payment_method_types: ['card_present'], capture_method: 'manual', 
            });
            paymentIntentId = paymentIntent.id;
            reader = await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });

            if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.includes('test')) {
                try { await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId); } catch(e) {}
            }

            let intentStatus = paymentIntent.status;
            let attempts = 0;
            
            while (intentStatus === 'requires_payment_method' && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const checkIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                intentStatus = checkIntent.status;
                attempts++;
            }

            if (intentStatus === 'requires_capture') {
                await stripe.paymentIntents.capture(paymentIntentId);
            } else {
                try { await stripe.terminal.readers.cancelAction(readerId); } catch(e) {}
                throw new Error("Paiement refusé ou délai d'attente dépassé sur le TPE.");
            }
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

        const employeResult = await clientDB.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        const employe = employeResult.rowCount > 0 ? employeResult.rows[0] : null;

        if (lignes && lignes.length > 0) {
            for (let ligne of lignes) {
                const total_ligne = ligne.quantite * ligne.prix_unitaire;

                const articleSnapshot = await clientDB.query('SELECT nom, taux_tva FROM catalogue WHERE id_article = $1 AND id_salon = $2', [ligne.id_article, id_salon]);
                const nomSnapshot = articleSnapshot.rowCount > 0 ? articleSnapshot.rows[0].nom : (ligne.nom || 'Article supprimé');
                const tvaSnapshot = articleSnapshot.rowCount > 0 ? articleSnapshot.rows[0].taux_tva : 20.00;

                await clientDB.query(`INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon, nom_article_snapshot, taux_tva_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`, 
                [idNouveauTicket, ligne.id_article, ligne.quantite, ligne.prix_unitaire, total_ligne, id_salon, nomSnapshot, tvaSnapshot]);
                
                const updateStockQuery = `UPDATE catalogue SET stock_actuel = stock_actuel - $1 WHERE id_article = $2 AND id_salon = $3 AND type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE') RETURNING nom, stock_actuel, type_article;`;
                const stockResult = await clientDB.query(updateStockQuery, [ligne.quantite, ligne.id_article, id_salon]);
                let type_article = 'PRESTATION'; 
                if (stockResult.rowCount > 0) type_article = stockResult.rows[0].type_article;
                
                // === DÉSTOCKAGE AUTOMATIQUE DES INGRÉDIENTS (RECETTES) ===
                if (type_article === 'PRESTATION') {
                    const protocoleRes = await clientDB.query('SELECT id_protocole FROM protocoles WHERE nom_prestation ILIKE $1 AND id_salon = $2 LIMIT 1', [nomSnapshot, id_salon]);
                    if (protocoleRes.rowCount > 0) {
                        const idProto = protocoleRes.rows[0].id_protocole;
                        const ingredients = await clientDB.query('SELECT id_article, quantite_necessaire FROM recettes_articles WHERE id_protocole = $1', [idProto]);
                        for (let ing of ingredients.rows) {
                            const quantite_a_deduire = ing.quantite_necessaire * ligne.quantite;
                            await clientDB.query('UPDATE catalogue SET stock_actuel = stock_actuel - $1 WHERE id_article = $2 AND id_salon = $3', [quantite_a_deduire, ing.id_article, id_salon]);
                        }
                    }
                }

                if (employe) {
                    const taux = (type_article === 'PRESTATION') ? employe.taux_commission_prestation : employe.taux_commission_produit;
                    const montant_commission = (total_ligne * (taux / 100)).toFixed(2);
                    await clientDB.query(`INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon) VALUES ($1, $2, $3, $4, $5, $6)`, 
                    [id_employe, idNouveauTicket, total_ligne, montant_commission, type_article, id_salon]);
                }
            }
        }

        const newHash = crypto.createHash('sha256').update(`${idNouveauTicket}-${numeroTicket}-${montant}-${previousHash}`).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1 WHERE id_ticket = $2', [newHash, idNouveauTicket]);

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
    const { motif } = req.body;
    if (!motif || !motif.trim()) return res.status(400).json({ erreur: "Un motif d'annulation est obligatoire." });

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        const ticketRes = await clientDB.query(
            "SELECT * FROM tickets WHERE id_ticket = $1 AND id_salon = $2 AND type_ticket != 'ANNULATION' AND est_compense = FALSE",
            [id_ticket, id_salon]
        );
        if (ticketRes.rowCount === 0) throw new Error("Ticket introuvable ou déjà annulé.");
        const ticket = ticketRes.rows[0];

        const lignesOrigine = await clientDB.query(
            "SELECT id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, nom_article_snapshot, taux_tva_snapshot FROM lignes_ticket WHERE id_ticket = $1",
            [id_ticket]
        );

        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        const numeroCompensation = `TKT-AN-` + Date.now();
        const montantCompensation = -parseFloat(ticket.total_ttc);

        const compensationResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, type_ticket, id_ticket_origine, motif_annulation)
             VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'VALIDE', 'ANNULATION', $7, $8) RETURNING id_ticket;`,
            [numeroCompensation, ticket.id_client, ticket.id_employe, montantCompensation, id_salon, ticket.methode_paiement, id_ticket, motif.trim()]
        );
        const idTicketCompensation = compensationResult.rows[0].id_ticket;

        const newHash = crypto.createHash('sha256').update(`${idTicketCompensation}-${numeroCompensation}-${montantCompensation}-${previousHash}`).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1 WHERE id_ticket = $2', [newHash, idTicketCompensation]);

        await clientDB.query("UPDATE tickets SET est_compense = TRUE WHERE id_ticket = $1", [id_ticket]);

        for (const ligne of lignesOrigine.rows) {
            await clientDB.query(
                `INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon, nom_article_snapshot, taux_tva_snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                [idTicketCompensation, ligne.id_article, -ligne.quantite, ligne.prix_unitaire_ttc, -ligne.total_ligne_ttc, id_salon, ligne.nom_article_snapshot, ligne.taux_tva_snapshot]
            );
            await clientDB.query("UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2", [ligne.quantite, ligne.id_article]);
            
            // REMISE EN STOCK DES RECETTES SI PRÉSENTES
            const protocoleRes = await clientDB.query('SELECT id_protocole FROM protocoles WHERE nom_prestation ILIKE $1 AND id_salon = $2 LIMIT 1', [ligne.nom_article_snapshot, id_salon]);
            if (protocoleRes.rowCount > 0) {
                const idProto = protocoleRes.rows[0].id_protocole;
                const ingredients = await clientDB.query('SELECT id_article, quantite_necessaire FROM recettes_articles WHERE id_protocole = $1', [idProto]);
                for (let ing of ingredients.rows) {
                    const quantite_a_restaurer = ing.quantite_necessaire * ligne.quantite;
                    await clientDB.query('UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2 AND id_salon = $3', [quantite_a_restaurer, ing.id_article, id_salon]);
                }
            }
        }

        const commissionsOrigine = await clientDB.query("SELECT * FROM commissions WHERE id_ticket = $1", [id_ticket]);
        for (const c of commissionsOrigine.rows) {
            await clientDB.query(
                `INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [c.id_employe, idTicketCompensation, -c.montant_vente, -c.montant_commission, c.type_vente, id_salon]
            );
        }

        if (ticket.id_client && !ticket.recompense_utilisee) {
            await clientDB.query("UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1), tampons_fidelite = GREATEST(0, tampons_fidelite - 1) WHERE id_client = $2", [Math.floor(ticket.total_ttc), ticket.id_client]);
        }

        await enregistrerJET(id_salon, 'ANNULATION_TICKET', {
            id_ticket_origine: parseInt(id_ticket),
            id_ticket_compensation: idTicketCompensation,
            montant: montantCompensation,
            motif: motif.trim()
        }, clientDB);

        await clientDB.query('COMMIT');
        res.json({ message: "Annulation enregistrée sous forme d'écriture de compensation. Stock et fidélité restaurés." });
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
            let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.email_reception_factures, pass: dechiffrer(config.mot_de_passe_app_email) } });
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
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        await clientDB.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);

        const jourRes = await clientDB.query(
            `SELECT MIN(DATE(t.date_creation)) as jour_non_cloture
             FROM tickets t
             WHERE t.id_salon = $1
               AND NOT EXISTS (
                   SELECT 1 FROM clotures_caisse c
                   WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
               )`,
            [id_salon]
        );

        let dateACloturerStr;
        if (jourRes.rowCount > 0 && jourRes.rows[0].jour_non_cloture) {
             const d = new Date(jourRes.rows[0].jour_non_cloture);
             dateACloturerStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
             const d = new Date();
             dateACloturerStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        const dejaCloture = await clientDB.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2', [id_salon, dateACloturerStr]);
        if (dejaCloture.rowCount > 0) throw new Error(`La caisse pour la date du ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')} a déjà été clôturée.`);

        const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
        const totalJour = caResult.rows[0].total;

        const grandTotalResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE'`, [id_salon]);
        const grandTotalPerpetuel = grandTotalResult.rows[0].total;

        const dernierZ = await clientDB.query('SELECT signature_hash FROM clotures_caisse WHERE id_salon = $1 ORDER BY id_cloture DESC LIMIT 1', [id_salon]);
        const hashPrecedent = dernierZ.rowCount > 0 && dernierZ.rows[0].signature_hash ? dernierZ.rows[0].signature_hash : 'GENESIS_Z';
        const dateISO = new Date().toISOString();
        const signature = crypto.createHash('sha256')
            .update(`Z-${id_salon}-${totalJour}-${grandTotalPerpetuel}-${hashPrecedent}-${dateISO}`)
            .digest('hex');

        await clientDB.query(
            'INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent) VALUES ($1, $2, $3, $4, $5, $6)',
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent]
        );

        await enregistrerJET(id_salon, 'CLOTURE_Z', { date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, signature }, clientDB);

        await clientDB.query('COMMIT');
        res.json({ message: `Caisse clôturée avec succès pour le ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')}. Total : ${totalJour} €`, signature, cumul_perpetuel_ttc: grandTotalPerpetuel });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: e.message || "Erreur lors de la clôture." });
    } finally { clientDB.release(); }
});

app.get('/api/export-archive-fiscale', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const { date_debut, date_fin } = req.query;
    if (!date_debut || !date_fin) return res.status(400).json({ erreur: "Les paramètres date_debut et date_fin (YYYY-MM-DD) sont requis." });

    try {
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

        let csv = 'TICKETS\r\n';
        csv += ['id_ticket','numero_ticket','date_creation','type_ticket','statut','est_compense','id_ticket_origine','motif_annulation','methode_paiement','total_ttc','id_article','nom_article','quantite','prix_unitaire_ttc','taux_tva','total_ligne_ttc','hash_ticket'].join(';') + '\r\n';
        for (const r of ticketsRes.rows) {
            csv += [r.id_ticket, r.numero_ticket_caisse, new Date(r.date_creation).toISOString(), r.type_ticket, r.statut, r.est_compense, r.id_ticket_origine || '', r.motif_annulation || '', r.methode_paiement, r.total_ttc, r.id_article || '', r.nom_article, r.quantite, r.prix_unitaire_ttc, r.taux_tva_snapshot, r.total_ligne_ttc, r.hash_ticket]
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

        await enregistrerJET(id_salon, 'EXPORT_ARCHIVE_FISCALE', { date_debut, date_fin, nb_lignes_tickets: ticketsRes.rowCount, nb_lignes_jet: jetRes.rowCount, signature: signatureArchive });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="archive-fiscale-${id_salon}-${date_debut}_${date_fin}.csv"`);
        res.send('\uFEFF' + csv);
    } catch (e) {
        console.error("❌ Erreur export archive fiscale:", e);
        res.status(500).json({ erreur: "Erreur lors de la génération de l'archive fiscale." });
    }
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
app.post('/api/catalogue', verifierToken, async (req, res) => { const { nom, type_article, prix, stock_actuel, reference, taux_tva } = req.body; try { const typeArticleFormatte = type_article || 'PRESTATION'; const prixFormatte = parseFloat((prix || "0").toString().replace(',', '.')) || 0; const stockFormatte = parseInt(stock_actuel) || 0; const refFormattee = reference ? reference.trim() : null; const tvaFormattee = (taux_tva !== undefined && taux_tva !== null && taux_tva !== '') ? parseFloat(taux_tva.toString().replace(',', '.')) : 20.00; if (typeArticleFormatte === 'PRODUIT_REVENTE') { if (!refFormattee || refFormattee.length < 4) { return res.status(400).json({ erreur: "Réf valide requise." }); } } const checkQuery = `SELECT * FROM catalogue WHERE (nom ILIKE $1 OR (reference = $2 AND reference IS NOT NULL)) AND id_salon = $3`; const checkResult = await pool.query(checkQuery, [nom, refFormattee, req.user.id_salon]); if (checkResult.rowCount > 0) { const art = checkResult.rows[0]; if (refFormattee && art.reference === refFormattee && typeArticleFormatte === 'PRODUIT_REVENTE') { if (!nom || nom.trim() === '') { await pool.query('UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2', [stockFormatte, art.id_article]); await enregistrerJET(req.user.id_salon, 'MODIFICATION_ARTICLE', { id_article: art.id_article, action: 'REAPPRO_STOCK', ajout: stockFormatte }); return res.status(200).json({ message: `Stock mis à jour (+${stockFormatte})` }); } else if (nom.trim().toLowerCase() !== art.nom.toLowerCase()) { return res.status(400).json({ erreur: `Référence déjà utilisée.` }); } } if (art.nom.toLowerCase() === nom.trim().toLowerCase()) { return res.status(400).json({ erreur: `L'article existe déjà.` }); } } const inserted = await pool.query('INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, taux_tva, id_salon) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_article', [nom, typeArticleFormatte, prixFormatte, stockFormatte, refFormattee, tvaFormattee, req.user.id_salon]); await enregistrerJET(req.user.id_salon, 'CREATION_ARTICLE', { id_article: inserted.rows[0].id_article, nom, type_article: typeArticleFormatte, prix: prixFormatte, taux_tva: tvaFormattee }); res.status(201).json({ message: "Article ajouté avec succès !" }); } catch (e) { res.status(500).json({ erreur: `Erreur interne : ${e.message}` }); }});
app.delete('/api/catalogue/:id', verifierToken, async (req, res) => { try { const articleRes = await pool.query('SELECT nom, type_article, prix FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); await pool.query('DELETE FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); if (articleRes.rowCount > 0) { await enregistrerJET(req.user.id_salon, 'SUPPRESSION_ARTICLE', { id_article: req.params.id, ...articleRes.rows[0] }); } res.json({message: "Article supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression article."}); }});

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
CAS 4 - URGENCES / FACTURES : Si le texte est une facture à payer, une relance, ou une action requise (impôts, URSSAF, EDF...). -> Renvoie {"type": "ACTION", "donnees": {"titre": "Payer EDF", "description": "Facture numéro XYZ...", "date_echeance": "YYYY-MM-DD"}}
CAS 3 - AUTRE : Pour tout le reste (pubs, spam, etc.) -> Renvoie {"type": "NONE"}`;

async function analyserEmailAvecIA(sujet, texte) {
    if (!process.env.GROQ_API_KEY) return [];

    const texteTronque = (texte || '').substring(0, 8000);

    try {
        const anneeEnCours = new Date().getFullYear();
        const dateDuJour = new Date().toLocaleDateString('fr-FR');
        
        const completion = await groq.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 250,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: `${PROMPT_SYSTEME_IA}\nINFO : La date du jour est le ${dateDuJour}. Si l'e-mail ne précise pas l'année, utilise obligatoirement ${anneeEnCours}.` },
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

        if (analyse.type === 'ACTION' && analyse.donnees && analyse.donnees.titre) {
            return [{
                type_tache: 'ACTION',
                donnees: {
                    titre: String(analyse.donnees.titre).trim().substring(0, 200),
                    description: analyse.donnees.description ? String(analyse.donnees.description).trim() : '',
                    date_echeance: analyse.donnees.date_echeance || ''
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
            let datetime = new Date().toISOString();
            if (donnees.date_heure_debut) {
                datetime = donnees.date_heure_debut;
                if (datetime.length === 16) datetime += ':00'; 
            }
            
            const rawEmployeId = parseInt(donnees.id_employe);
            const idEmploye = isNaN(rawEmployeId) ? null : rawEmployeId;
            
            await clientDB.query(
                `INSERT INTO rendez_vous (id_salon, nom_client, telephone_client, prestation, date_heure_debut, id_employe, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, 30)`, 
                [id_salon, donnees.nom_client, donnees.telephone, donnees.prestation, datetime, idEmploye]
            );
            
            if (donnees.telephone && donnees.telephone.trim() !== '') {
                await clientDB.query(
                    "INSERT INTO clients (nom, telephone, id_salon) SELECT $1::varchar, $2::varchar, $3::int WHERE NOT EXISTS (SELECT 1 FROM clients WHERE telephone = $2 AND id_salon = $3)", 
                    [donnees.nom_client, donnees.telephone, id_salon]
                );
            }

            io.to(id_salon.toString()).emit('nouveauRDV');
        } 
        else if (type_tache === 'ACTION') {
            let echeance = donnees.date_echeance && donnees.date_echeance !== '' ? donnees.date_echeance : null;
            await clientDB.query(
                "INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'IA')",
                [id_salon, donnees.titre, donnees.description, echeance]
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
                    let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: salonConfig.email_reception_factures, pass: dechiffrer(salonConfig.mot_de_passe_app_email) } });
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

let isRobotRunning = false;

async function executerRobotComptable() {
    if (isRobotRunning) return;
    isRobotRunning = true;

    const clientDB = await pool.connect();
    try {
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
            const imapClient = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: salon.email_reception_factures, pass: dechiffrer(salon.mot_de_passe_app_email) }, logger: false });
            try {
                await imapClient.connect();
                let lock = await imapClient.getMailboxLock('INBOX');
                try {
                    const dateLimite = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    
                    for await (let message of imapClient.fetch({ since: dateLimite }, { source: true, uid: true })) {
                        const mailParsi = await simpleParser(message.source);
                        const idUnique = mailParsi.messageId || message.uid.toString();
                        
                        const dejaTraite = await clientDB.query('SELECT message_id FROM robot_memoire_emails WHERE message_id = $1 AND id_salon = $2', [idUnique, salon.id_salon]);
                        if (dejaTraite.rows.length > 0) continue;

                        await clientDB.query('INSERT INTO robot_memoire_emails (message_id, id_salon) VALUES ($1, $2)', [idUnique, salon.id_salon]);

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
                            await clientDB.query(
                                `INSERT INTO ia_taches_attente (id_salon, type_tache, donnees) VALUES ($1, $2, $3)`,
                                [salon.id_salon, t.type_tache || t.type, t.donnees] 
                            );
                            envoyerEvenementSSE(salon.id_salon, 'nouvelleTacheIA');
                        }
                    }
                } finally { lock.release(); }
                await imapClient.logout();
            } catch (errConnect) {
                console.log(`Erreur IMAP Salon ${salon.id_salon} :`, errConnect.message);
            }
        }
    } catch (erreur) {
        console.log("Erreur globale robot :", erreur.message);
    } finally { 
        clientDB.release(); 
        isRobotRunning = false; 
    }
}
cron.schedule('*/10 8-19 * * *', () => { executerRobotComptable(); });
cron.schedule('0 2 * * *', () => { executerRobotComptable(); });
app.get('/api/admin/forcer-robot', async (req, res) => { executerRobotComptable(); res.json({ message: "Robot IA & Comptable lancé." }); });

// =========================================================================
// --- CENTRE D'ACTION (TÂCHES & URGENCES) ---
// =========================================================================
app.get('/api/taches', verifierToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM taches_actions WHERE id_salon = $1 ORDER BY statut ASC, date_echeance ASC NULLS LAST`, [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture tâches." }); }
});

app.post('/api/taches', verifierToken, async (req, res) => {
    const { titre, description, date_echeance } = req.body;
    try {
        await pool.query(
            "INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'MANUEL')", 
            [req.user.id_salon, titre, description, date_echeance || null]
        );
        res.status(201).json({ message: "Action ajoutée !" });
    } catch (e) { res.status(500).json({ erreur: "Erreur ajout tâche." }); }
});

app.put('/api/taches/:id/statut', verifierToken, async (req, res) => {
    try {
        await pool.query("UPDATE taches_actions SET statut = CASE WHEN statut = 'A_FAIRE' THEN 'FAIT' ELSE 'A_FAIRE' END WHERE id_tache = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
        res.json({ message: "Statut mis à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur modification." }); }
});

app.delete('/api/taches/:id', verifierToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM taches_actions WHERE id_tache = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
        res.json({ message: "Tâche supprimée." });
    } catch (e) { res.status(500).json({ erreur: "Erreur suppression." }); }
});


// =========================================================================
// --- PROTOCOLES & RECETTES ---
// =========================================================================
app.get('/api/protocoles', verifierToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   COALESCE(json_agg(json_build_object('id_article', r.id_article, 'quantite_necessaire', r.quantite_necessaire, 'nom', c.nom)) FILTER (WHERE r.id_article IS NOT NULL), '[]') as ingredients
            FROM protocoles p
            LEFT JOIN recettes_articles r ON p.id_protocole = r.id_protocole
            LEFT JOIN catalogue c ON r.id_article = c.id_article
            WHERE p.id_salon = $1
            GROUP BY p.id_protocole
            ORDER BY p.nom_prestation ASC
        `, [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture protocoles." }); }
});

app.post('/api/protocoles', verifierToken, async (req, res) => {
    const { nom_prestation, description, photo_url, delai_livraison_jours, ingredients } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const protoRes = await clientDB.query(
            `INSERT INTO protocoles (id_salon, nom_prestation, description, photo_url, delai_livraison_jours) VALUES ($1, $2, $3, $4, $5) RETURNING id_protocole`,
            [req.user.id_salon, nom_prestation, description, photo_url, delai_livraison_jours || 3]
        );
        const idProto = protoRes.rows[0].id_protocole;

        if (ingredients && ingredients.length > 0) {
            for (let ing of ingredients) {
                await clientDB.query(
                    `INSERT INTO recettes_articles (id_protocole, id_article, quantite_necessaire) VALUES ($1, $2, $3)`,
                    [idProto, ing.id_article, ing.quantite_necessaire]
                );
            }
        }
        await clientDB.query('COMMIT');
        res.status(201).json({ message: "Protocole ajouté avec succès !" });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: "Erreur création protocole." });
    } finally { clientDB.release(); }
});

app.delete('/api/protocoles/:id', verifierToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM protocoles WHERE id_protocole = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
        res.json({ message: "Protocole supprimé." });
    } catch (e) { res.status(500).json({ erreur: "Erreur suppression protocole." }); }
});


// =========================================================================
// --- ROBOT MARKETING (CRON JOB) - FIDÉLITÉ & ANNIVERSAIRES & PRÉDICTIONS ---
// =========================================================================
cron.schedule('0 9 * * *', async () => {
    try {
        const salons = await pool.query("SELECT * FROM configuration_salon WHERE brevo_api_key IS NOT NULL AND brevo_api_key != ''");
        for (let salon of salons.rows) {
            const delaiFixe = salon.fidelite_delai_sms && salon.fidelite_delai_sms > 0 ? salon.fidelite_delai_sms : 60;

            const queryClients = `
                WITH Visites AS (
                    SELECT id_client, DATE(date_creation) as date_visite
                    FROM tickets
                    WHERE id_salon = $1 AND statut != 'ANNULE' AND est_compense = FALSE
                    GROUP BY id_client, DATE(date_creation)
                ),
                Ecarts AS (
                    SELECT id_client,
                           date_visite - LAG(date_visite) OVER (PARTITION BY id_client ORDER BY date_visite) as jours_ecart
                    FROM Visites
                ),
                Moyennes AS (
                    SELECT id_client, AVG(jours_ecart) as moyenne_jours, COUNT(jours_ecart) as nb_ecarts
                    FROM Ecarts
                    WHERE jours_ecart IS NOT NULL
                    GROUP BY id_client
                )
                SELECT c.*,
                       COALESCE(m.moyenne_jours, 0) as moyenne_jours,
                       COALESCE(m.nb_ecarts, 0) as nb_ecarts
                FROM clients c
                LEFT JOIN Moyennes m ON c.id_client = m.id_client
                LEFT JOIN rendez_vous r ON r.telephone_client = c.telephone AND r.date_heure_debut >= NOW()
                WHERE c.id_salon = $1
                  AND r.id_rdv IS NULL
                  AND c.telephone IS NOT NULL
                  AND c.derniere_visite IS NOT NULL
            `;
            const clientsResult = await pool.query(queryClients, [salon.id_salon]);
            const now = new Date();

            for (let client of clientsResult.rows) {
                const derniereVisite = new Date(client.derniere_visite);
                const joursDepuisVisite = (now - derniereVisite) / (1000 * 60 * 60 * 24);

                let seuilRelance;
                if (client.nb_ecarts > 0 && client.moyenne_jours > 0) {
                    seuilRelance = parseFloat(client.moyenne_jours) * 1.2;
                } else {
                    seuilRelance = delaiFixe;
                }

                if (joursDepuisVisite >= seuilRelance && joursDepuisVisite < (seuilRelance + 1)) {
                    let message = "";
                    if (salon.fidelite_type === 'TAMPONS') {
                        const restants = salon.fidelite_tampons_seuil - (client.tampons_fidelite || 0);
                        message = `Hey ${client.prenom || client.nom} ! Cela fait un moment qu'on ne t'a pas vu chez ${salon.sms_sender_name}. Plus que ${restants} passage(s) avant ta récompense ! Prends vite rendez-vous : ${salon.lien_google_maps}`;
                    } else if (salon.fidelite_type === 'POINTS') {
                        message = `Bonjour ${client.prenom || client.nom}, votre fidélité paie ! Vous avez ${client.points_fidelite || 0} points. Venez en profiter chez ${salon.sms_sender_name}. RDV: ${salon.lien_google_maps}`;
                    } else {
                        message = `Bonjour ${client.prenom || client.nom}, ça fait longtemps ! Pensez à prendre soin de vous chez ${salon.sms_sender_name}. Prenez rendez-vous ici : ${salon.lien_google_maps}`;
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
                    await envoyerSMS(
                        salon.brevo_api_key, 
                        salon.sms_sender_name, 
                        client.telephone, 
                        `Joyeux anniversaire ${client.prenom || client.nom} ! 🎉 Venez fêter ça chez nous cette semaine. Prenez RDV : ${salon.lien_google_maps}`
                    );
                }
            }

            // =================================================================
            // 4. MOTEUR PRÉDICTIF D'INVENTAIRE (Protocoles -> Centre d'Action)
            // =================================================================
            const rdvsFuturs = await pool.query(`
                SELECT r.prestation, MIN(r.date_heure_debut) as premier_rdv, COUNT(*) as nb_rdv
                FROM rendez_vous r
                WHERE r.id_salon = $1 AND r.date_heure_debut BETWEEN NOW() AND NOW() + INTERVAL '14 days'
                GROUP BY r.prestation
            `, [salon.id_salon]);

            for (let rdv of rdvsFuturs.rows) {
                const protocole = await pool.query(`
                    SELECT p.id_protocole, p.delai_livraison_jours 
                    FROM protocoles p 
                    WHERE p.id_salon = $1 AND p.nom_prestation ILIKE $2 LIMIT 1
                `, [salon.id_salon, rdv.prestation]);

                if (protocole.rowCount > 0) {
                    const ingredients = await pool.query(`
                        SELECT r.id_article, r.quantite_necessaire, c.nom, c.stock_actuel
                        FROM recettes_articles r
                        JOIN catalogue c ON r.id_article = c.id_article
                        WHERE r.id_protocole = $1
                    `, [protocole.rows[0].id_protocole]);

                    for (let ing of ingredients.rows) {
                        const besoinTotal = ing.quantite_necessaire * rdv.nb_rdv;
                        if (ing.stock_actuel < besoinTotal) {
                            const dateAlerte = new Date(rdv.premier_rdv);
                            dateAlerte.setDate(dateAlerte.getDate() - (protocole.rows[0].delai_livraison_jours || 3));
                            
                            const titreAlerte = `⚠️ Rupture prédictive : ${ing.nom}`;
                            const descAlerte = `Il vous manque ${besoinTotal - ing.stock_actuel} unité(s) de "${ing.nom}" pour assurer vos ${rdv.nb_rdv} rdv "${rdv.prestation}" prévus d'ici 14j. Commandez aujourd'hui !`;
                            
                            const exist = await pool.query(`SELECT 1 FROM taches_actions WHERE id_salon = $1 AND titre = $2 AND statut = 'A_FAIRE'`, [salon.id_salon, titreAlerte]);
                            if (exist.rowCount === 0) {
                                await pool.query(`INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'IA')`, [salon.id_salon, titreAlerte, descAlerte, dateAlerte]);
                            }
                        }
                    }
                }
            }

            // 3. Alertes Tâches Urgentes (Centre d'Action)
            const tachesUrgentes = await pool.query(`SELECT titre, date_echeance FROM taches_actions WHERE id_salon = $1 AND statut = 'A_FAIRE' AND date_echeance <= NOW() + INTERVAL '2 days'`, [salon.id_salon]);
            if (tachesUrgentes.rowCount > 0) {
                if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                    const gerant = await pool.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [salon.id_salon]);
                    if (gerant.rowCount > 0) {
                        let texteEmail = `Bonjour,\n\nVous avez ${tachesUrgentes.rowCount} tâche(s) urgente(s) nécessitant votre attention :\n\n`;
                        tachesUrgentes.rows.forEach(t => texteEmail += `🔴 ${t.titre} (Échéance: ${new Date(t.date_echeance).toLocaleDateString()})\n`);
                        texteEmail += `\nConnectez-vous à STACK pour les traiter.`;
                        try {
                            let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
                            await transporter.sendMail({ from: `"Alertes STACK" <${process.env.SMTP_USER}>`, to: gerant.rows[0].email, subject: `⚠️ ${tachesUrgentes.rowCount} Action(s) Urgente(s) (URSSAF, Factures, Stocks...)`, text: texteEmail });
                        } catch(e) {}
                    }
                }

                if (salon.alertes_sms_actives && salon.telephone_gerant && salon.telephone_gerant.trim() !== '' && salon.brevo_api_key) {
                    const smsTexte = `⚠️ STACK : Vous avez ${tachesUrgentes.rowCount} action(s) urgente(s) en attente (ex: ${tachesUrgentes.rows[0].titre}). Connectez-vous pour les traiter !`;
                    await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name || 'STACK', salon.telephone_gerant, smsTexte);
                }
            }
            
        } 
    } catch (err) {
        console.error("Erreur Cron SMS:", err);
    }
});

async function envoyerSMS(apiKey, sender, phone, text) {
    try {
        await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST', headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: true, sender: sender.substring(0, 11), recipient: phone, content: text })
        });
    } catch(e) {}
}

// =========================================================================
// --- GOD MODE (SUPER-ADMIN) ---
// =========================================================================
const verifierSuperAdmin = (req, res, next) => {
    if (req.user.id_salon !== 38) {
        return res.status(403).json({ erreur: "Accès refusé. God mode uniquement." });
    }
    next();
};

app.get('/api/superadmin/stats', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const totalSalons = await pool.query("SELECT COUNT(*) as count FROM configuration_salon");
        const activeSalons = await pool.query("SELECT COUNT(*) as count FROM utilisateurs WHERE statut_abonnement = 'actif' AND role = 'gerant'");
        const mrr = parseInt(activeSalons.rows[0].count) * 49;
        
        res.json({ 
            total_salons: totalSalons.rows[0].count, 
            salons_actifs: activeSalons.rows[0].count, 
            mrr_estime: mrr 
        });
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture stats admin." }); }
});

app.get('/api/superadmin/salons', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const query = `
            SELECT c.id_salon, c.nom_salon, u.email, u.statut_abonnement 
            FROM configuration_salon c
            JOIN utilisateurs u ON c.id_salon = u.id_salon
            WHERE u.role = 'gerant'
            ORDER BY c.id_salon DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture liste salons." }); }
});

app.put('/api/superadmin/salons/:id/status', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const { statut } = req.body;
        await pool.query("UPDATE utilisateurs SET statut_abonnement = $1 WHERE id_salon = $2 AND role = 'gerant'", [statut, req.params.id]);
        res.json({ message: `Le salon #${req.params.id} est maintenant ${statut}.` });
    } catch (e) { res.status(500).json({ erreur: "Erreur mise à jour statut." }); }
});

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`✅ API Multi-Tenant LÉGALE démarrée sur le port ${PORT}`));
