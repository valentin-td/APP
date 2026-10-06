console.log("Étape 1 : Démarrage du script...");
require('dotenv').config();

console.log("Étape 2 : Chargement des modules...");
const express = require('express');
const rateLimit = require('express-rate-limit');
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
const legal = require('./legal');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const webpush = require('web-push');
const Sentry = require('@sentry/node');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialisation du client Cloudflare R2
const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.net`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
    });
    console.log("Sentry (monitoring d'erreurs) activé.");
} else {
    console.log("SENTRY_DSN absent : monitoring d'erreurs désactivé.");
}

process.on('uncaughtException', (e) => { console.error('[CRASH] Exception non interceptée :', e); if (process.env.SENTRY_DSN) Sentry.captureException(e); });
process.on('unhandledRejection', (e) => { console.error('[CRASH] Promesse rejetée non interceptée :', e); if (process.env.SENTRY_DSN) Sentry.captureException(e); });

const signalerErreur = (e, contexte) => { console.error(`[${contexte}]`, e); if (process.env.SENTRY_DSN) Sentry.captureException(e, { tags: { contexte } }); };

let vapidPublicKey = "";
let vapidPrivateKey = "";

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const http = require('http');
const { Server } = require('socket.io');

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
    socket.on('rejoindreSalon', (id_salon, token) => {
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            if (String(user.id_salon) !== String(id_salon)) return; // salon non autorisé pour ce token
            socket.join(id_salon.toString());
        } catch (e) { /* token invalide ou absent : on ignore silencieusement la demande */ }
    });
});

const abonnesSSE = new Map();

function envoyerEvenementSSE(id_salon, nomEvenement, data = {}) {
    const room = id_salon.toString();
    const clients = abonnesSSE.get(room);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${nomEvenement}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
}

app.get('/api/events/:id_salon', (req, res) => {
    const { token } = req.query;
    let user;
    try { user = jwt.verify(token, process.env.JWT_SECRET); } catch (e) { return res.status(401).end(); }
    if (String(user.id_salon) !== req.params.id_salon) return res.status(403).end();
    
    const room = req.params.id_salon;
    req.setTimeout(0); res.socket.setTimeout(0); res.socket.setNoDelay(true);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();

    if (!abonnesSSE.has(room)) abonnesSSE.set(room, new Set());
    abonnesSSE.get(room).add(res);
    res.write(`event: connected\ndata: {}\n\n`);

    const heartbeat = setInterval(() => { res.write(`event: heartbeat\ndata: {}\n\n`); }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        abonnesSSE.get(room)?.delete(res);
    });
});

app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks' || req.originalUrl === '/api/webhooks/') { next(); } 
  else { express.json({ limit: '10mb' })(req, res, next); }
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

pool.query(`
    CREATE TABLE IF NOT EXISTS ia_taches_attente (id_tache SERIAL PRIMARY KEY, id_salon INT, type_tache VARCHAR(50), donnees JSONB, statut VARCHAR(20) DEFAULT 'ATTENTE', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS taches_actions (id_tache SERIAL PRIMARY KEY, id_salon INT, titre VARCHAR(255), description TEXT, date_echeance DATE, statut VARCHAR(20) DEFAULT 'A_FAIRE', source VARCHAR(20) DEFAULT 'MANUEL', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS avis_demandes (id_demande SERIAL PRIMARY KEY, id_salon INT, telephone VARCHAR(30), prenom VARCHAR(100), token VARCHAR(64) UNIQUE, id_rdv INT, statut VARCHAR(20) DEFAULT 'EN_ATTENTE', note INT, commentaire TEXT, date_prevue TIMESTAMP DEFAULT NOW(), date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE avis_demandes ADD COLUMN IF NOT EXISTS id_employe INT;
    ALTER TABLE taches_actions ADD COLUMN IF NOT EXISTS donnees JSONB;
    CREATE TABLE IF NOT EXISTS sms_opt_out (id_salon INT, telephone VARCHAR(20), date_creation TIMESTAMP DEFAULT NOW(), PRIMARY KEY (id_salon, telephone));
    CREATE TABLE IF NOT EXISTS protocoles (id_protocole SERIAL PRIMARY KEY, id_salon INT, nom_prestation VARCHAR(255), description TEXT, photo_url TEXT, delai_livraison_jours INT DEFAULT 3, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS etapes JSONB DEFAULT '[]';
    ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS medias JSONB DEFAULT '{}';
    ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
    ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS delai_livraison_jours INT DEFAULT 3;
    ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS duree_estimee_minutes INT DEFAULT 30;
    ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS temps_nettoyage_minutes INT DEFAULT 0;
    ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS duree_estimee_minutes INT DEFAULT 30;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS temps_nettoyage_minutes INT DEFAULT 0;
    CREATE TABLE IF NOT EXISTS recettes_articles (id_recette SERIAL PRIMARY KEY, id_protocole INT REFERENCES protocoles(id_protocole) ON DELETE CASCADE, id_article INT, quantite_necessaire NUMERIC(10,2) DEFAULT 1);
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
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS est_gerant BOOLEAN DEFAULT FALSE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS telephone_gerant VARCHAR(20);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS alertes_sms_actives BOOLEAN DEFAULT FALSE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS email_comptable VARCHAR(255);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS jour_envoi_bilan INT DEFAULT 1;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS derniere_verif_stock DATE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pin_salon VARCHAR(10);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_temp_offline VARCHAR(64);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS date_synchro_hors_ligne TIMESTAMP;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_id_temp_offline ON tickets (id_salon, id_temp_offline) WHERE id_temp_offline IS NOT NULL;

    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type_ticket VARCHAR(20) DEFAULT 'VENTE';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_ticket_origine INT REFERENCES tickets(id_ticket);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS motif_annulation TEXT;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS est_compense BOOLEAN DEFAULT FALSE;

    ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS nom_article_snapshot VARCHAR(255);
    ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS taux_tva_snapshot NUMERIC(5,2) DEFAULT 20.00;
    ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5,2) DEFAULT 20.00;

    CREATE TABLE IF NOT EXISTS jet_logs (id_jet SERIAL PRIMARY KEY, id_salon INT NOT NULL, action VARCHAR(50) NOT NULL, details JSONB, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, hash_precedent VARCHAR(64), hash_jet VARCHAR(64));
    CREATE INDEX IF NOT EXISTS idx_jet_logs_salon_date ON jet_logs (id_salon, date_creation);

    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS id_cloture SERIAL;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS date_cloture DATE;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS cumul_perpetuel_ttc NUMERIC(14,2);
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS ferme_par VARCHAR(100) DEFAULT 'Non spécifié';

    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS plan_actuel VARCHAR(20) DEFAULT 'PREMIUM_TRIAL';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS frequence_paiement VARCHAR(20) DEFAULT 'MENSUEL';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS sms_envoyes_mois INT DEFAULT 0;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS mois_en_cours VARCHAR(7);
    ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS _subscription_id VARCHAR(255);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_banque VARCHAR(20) DEFAULT '512000';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_caisse VARCHAR(20) DEFAULT '530000';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_prestations VARCHAR(20) DEFAULT '706000';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_produits VARCHAR(20) DEFAULT '707000';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_tva VARCHAR(20) DEFAULT '445710';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pennylane_api_key VARCHAR(255);

    CREATE TABLE IF NOT EXISTS factures_fournisseurs (id_facture SERIAL PRIMARY KEY, id_salon INT, nom_fournisseur VARCHAR(255), montant_ht NUMERIC(10,2), montant_tva NUMERIC(10,2), montant_ttc NUMERIC(10,2), date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS messages (id_message SERIAL PRIMARY KEY, id_salon INT, id_expediteur INT, id_destinataire INT, contenu TEXT, fichier_url TEXT, reactions JSONB DEFAULT '{}', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS messages (id_message SERIAL PRIMARY KEY, id_salon INT, id_expediteur INT, id_destinataire INT, contenu TEXT, fichier_url TEXT, reactions JSONB DEFAULT '{}', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS absences_employes (
        id_absence SERIAL PRIMARY KEY,
        id_salon INT NOT NULL,
        id_employe INT NOT NULL,
        type_demande VARCHAR(20) NOT NULL, 
        nature_absence VARCHAR(50) NOT NULL, 
        type_prolongation VARCHAR(20) DEFAULT 'INITIAL', 
        date_debut DATE NOT NULL,
        moment_debut VARCHAR(10) DEFAULT 'MATIN', 
        date_fin DATE NOT NULL,
        moment_fin VARCHAR(10) DEFAULT 'APRES_MIDI', 
        heures_sortie VARCHAR(100), 
        commentaire TEXT,
        fichier_cle_r2 TEXT, 
        statut VARCHAR(20) DEFAULT 'EN_ATTENTE', 
        motif_refus TEXT,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS vu_par JSONB DEFAULT '[]';
    
    CREATE TABLE IF NOT EXISTS push_subscriptions (id_sub SERIAL PRIMARY KEY, id_salon INT, role VARCHAR(20), id_employe INT, endpoint TEXT, keys JSONB, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
`).then(async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS vapid_keys (id INT PRIMARY KEY, public_key TEXT, private_key TEXT)`);
        const res = await pool.query('SELECT * FROM vapid_keys WHERE id = 1');
        if (res.rowCount === 0) {
            const keys = webpush.generateVAPIDKeys();
            await pool.query('INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, $1, $2)', [keys.publicKey, keys.privateKey]);
            vapidPublicKey = keys.publicKey;
            vapidPrivateKey = keys.privateKey;
            console.log("✅ Nouvelles clés VAPID générées et sauvegardées en BDD.");
        } else {
            vapidPublicKey = res.rows[0].public_key;
            vapidPrivateKey = res.rows[0].private_key;
            console.log("✅ Clés VAPID (Push) chargées depuis la BDD.");
        }
        webpush.setVapidDetails('mailto:contact@stack.fr', vapidPublicKey, vapidPrivateKey);
    } catch (e) { console.error("Erreur init VAPID:", e); }

    try {
        await pool.query(`UPDATE clotures_caisse SET date_cloture = DATE(date_creation) WHERE date_cloture IS NULL;`);
        await pool.query(`ALTER TABLE clotures_caisse ALTER COLUMN date_cloture SET DEFAULT CURRENT_DATE;`);
        await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cloture_salon_jour') THEN ALTER TABLE clotures_caisse ADD CONSTRAINT uq_cloture_salon_jour UNIQUE (id_salon, date_cloture); END IF; END $$;`);
    } catch (e) { }
}).catch((e) => console.error("Erreur Init DB:", e));

async function envoyerNotificationPush(id_salon, cible, payload) {
    try {
        let query = 'SELECT endpoint, keys FROM push_subscriptions WHERE id_salon = $1';
        let params = [id_salon];

        if (cible && cible.type === 'employe') {
            query += " AND role = 'employe' AND id_employe = $2";
            params.push(cible.id_employe);
        } else if (cible === 'gerant') {
            query += " AND role = 'gerant'";
        } else if (cible === 'employes') {
            query += " AND role = 'employe'";
        }
        // cible === 'salon' (message de groupe) : aucun filtre, tout le monde est notifié

        const subs = await pool.query(query, params);
        if (subs.rowCount === 0) return;

        for (let sub of subs.rows) {
            try {
                await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: sub.keys
                }, JSON.stringify(payload));
            } catch (err) {
                // Si l'abonnement n'est plus valide (ex: utilisateur a retiré la permission)
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                }
            }
        }
    } catch (e) {
        console.error("Erreur d'envoi Push :", e);
    }
}

const verifierToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token expiré ou invalide." });
        try {
            const conf = await pool.query('SELECT plan_actuel, date_fin_essai FROM configuration_salon WHERE id_salon = $1', [user.id_salon]);
            if (conf.rowCount > 0) {
                user.plan_actuel = conf.rows[0].plan_actuel;
                user.date_fin_essai = conf.rows[0].date_fin_essai;
            }

            if (user.role === 'gerant') {
                const isTrialing = user.plan_actuel === 'PREMIUM_TRIAL';
                const result = await pool.query('SELECT statut_abonnement FROM utilisateurs WHERE id_salon = $1', [user.id_salon]);
                const statutSub = result.rowCount > 0 ? result.rows[0].statut_abonnement : 'inactif';
                
                // On bloque l'accès UNIQUEMENT s'il n'a pas payé ET qu'il n'est plus en essai
                if (statutSub !== 'actif' && !isTrialing) { 
                    return res.status(402).json({ erreur: "Paiement requis.", require_payment: true }); 
                }
            }
            req.user = user; 
            next(); 
        } catch (e) { return res.status(500).json({ erreur: "Erreur vérification." }); }
    });
};

const verifierPlan = (plansAutorises) => {
    return (req, res, next) => {
        const plan = req.user.plan_actuel;
        if (plan === 'PREMIUM_TRIAL' || plansAutorises.includes(plan)) {
            return next();
        }
        return res.status(403).json({ erreur: "Accès refusé. Cette fonctionnalité nécessite un forfait supérieur.", require_upsell: true });
    };
};

async function envoyerSMS_Intelligent(id_salon, apiKey, senderName, telephone, contenu) {
    try {
        const conf = await pool.query("SELECT plan_actuel, sms_envoyes_mois, mois_en_cours FROM configuration_salon WHERE id_salon = $1", [id_salon]);
        if (conf.rowCount === 0) return false;
        
        const { plan_actuel, sms_envoyes_mois, mois_en_cours } = conf.rows[0];
        const moisActuel = new Date().toISOString().slice(0, 7);
        let compteur = mois_en_cours === moisActuel ? sms_envoyes_mois : 0;
        
        if (plan_actuel === 'ESSENTIEL' && compteur >= 100) {
            console.log(`[SMS] Limite atteinte (100) pour le salon ${id_salon}`);
            return false;
        }

        const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST', headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (senderName || 'LeSalon').substring(0, 11), recipient: telephone, content: contenu })
        });

        if (res.ok) {
            await pool.query("UPDATE configuration_salon SET sms_envoyes_mois = $1, mois_en_cours = $2 WHERE id_salon = $3", [compteur + 1, moisActuel, id_salon]);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Erreur Envoi SMS:", e);
        return false;
    }
}

async function enregistrerJET(id_salon, action, details = {}, dbClient = pool) {
    try {
        await dbClient.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);
        const dernier = await dbClient.query('SELECT hash_jet FROM jet_logs WHERE id_salon = $1 ORDER BY id_jet DESC LIMIT 1', [id_salon]);
        const hashPrecedent = dernier.rowCount > 0 ? dernier.rows[0].hash_jet : 'GENESIS_JET';
        const dateISO = new Date().toISOString();
        const detailsJSON = JSON.stringify(details || {});
        const hashJet = crypto.createHash('sha256').update(`${id_salon}-${action}-${detailsJSON}-${dateISO}-${hashPrecedent}`).digest('hex');
        await dbClient.query('INSERT INTO jet_logs (id_salon, action, details, date_creation, hash_precedent, hash_jet) VALUES ($1, $2, $3, $4, $5, $6)', [id_salon, action, detailsJSON, dateISO, hashPrecedent, hashJet]);
        return hashJet;
    } catch (e) { return null; }
}

const verifierClotureZ = async (req, res, next) => {
    const id_salon = req.user.id_salon;
    const idTemp = req.body && req.body._id_temp ? String(req.body._id_temp).slice(0, 64) : null;
    try {
        let dateTicket = null; // null = ticket encaissé en direct
        if (idTemp) {
            if (req.body.methode_paiement === 'CARTE') return res.status(400).json({ erreur: "Un paiement par carte ne peut pas être enregistré hors-ligne." });
            // Anti-doublon : ticket déjà synchronisé -> on répond OK sans rien recréer
            const doublon = await pool.query('SELECT id_ticket FROM tickets WHERE id_salon = $1 AND id_temp_offline = $2', [id_salon, idTemp]);
            if (doublon.rowCount > 0) return res.json({ message: "Ticket déjà synchronisé.", id_ticket: doublon.rows[0].id_ticket, deja_synchronise: true });
            // On conserve la vraie date d'encaissement (max 7 jours, pas dans le futur) si son jour n'est pas déjà clôturé
            const d = new Date(req.body.date_creation);
            const maintenant = Date.now();
            if (!isNaN(d) && d.getTime() <= maintenant + 5 * 60 * 1000 && d.getTime() >= maintenant - 7 * 24 * 3600 * 1000) {
                const ferme = await pool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = DATE($2::timestamp)', [id_salon, d.toISOString()]);
                if (ferme.rowCount === 0) dateTicket = d.toISOString();
            }
        }
        req.dateTicketEffective = dateTicket;
        req.idTempOffline = idTemp;
        const jourBloquant = await pool.query(
            `SELECT MIN(DATE(t.date_creation)) as jour FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) < DATE(COALESCE($2::timestamp, NOW())) AND NOT EXISTS (SELECT 1 FROM clotures_caisse c WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation))`, [id_salon, dateTicket]
        );
        if (jourBloquant.rowCount > 0 && jourBloquant.rows[0].jour) {
            return res.status(423).json({ erreur: `Clôture (Z) manquante pour le ${new Date(jourBloquant.rows[0].jour).toLocaleDateString()}. Effectuez la clôture avant d'encaisser.`, z_manquant: jourBloquant.rows[0].jour });
        }
        next();
    } catch (e) { res.status(500).json({ erreur: "Erreur vérification clôture." }); }
};

app.post('/api/register', async (req, res) => {
    const { email, mot_de_passe, nom_salon, nom_gerant } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const checkEmail = await clientDB.query('SELECT email FROM utilisateurs WHERE email = $1', [email]);
        if (checkEmail.rowCount > 0) throw new Error('Cet e-mail est déjà utilisé.');
        const hash = await bcrypt.hash(mot_de_passe, 10);
        const salonResult = await clientDB.query(
            "INSERT INTO configuration_salon (nom_salon, date_fin_essai, plan_actuel) VALUES ($1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL') RETURNING id_salon", 
            [nom_salon || 'Nouveau Salon']
        );
        const idNouveauSalon = salonResult.rows[0].id_salon;
        let customerId = null;
        try { const customer = await stripe.customers.create({ email: email, name: nom_salon }); customerId = customer.id; } catch(e) {}
        await clientDB.query('INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, _customer_id, statut_abonnement) VALUES ($1, $2, $3, $4, $5, $6)', [email, hash, idNouveauSalon, 'gerant', customerId, 'inactif']); 
        
        // Création automatique de la fiche employé pour le gérant avec un PIN chiffré par défaut
        const defaultPinHash = await bcrypt.hash('0000', 10);
        await clientDB.query("INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)", [nom_gerant || 'Patron', idNouveauSalon, defaultPinHash]);

        await clientDB.query('COMMIT');
        const token = jwt.sign({ id_salon: idNouveauSalon, role: 'gerant', email }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: "Inscription réussie", token });
    } catch (erreur) { await clientDB.query('ROLLBACK'); res.status(400).json({ erreur: erreur.message }); } finally { clientDB.release(); }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Bloque après 5 échecs par IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { erreur: "Trop de tentatives de connexion. Compte temporairement bloqué pendant 15 minutes." }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    const { email, mot_de_passe } = req.body;
    try {
        const result = await pool.query('SELECT id_salon, mot_de_passe_hash, statut_abonnement FROM utilisateurs WHERE email = $1 LIMIT 1', [email]);
        if (result.rowCount > 0) {
            const { id_salon, mot_de_passe_hash, statut_abonnement } = result.rows[0];
            const match = await bcrypt.compare(mot_de_passe, mot_de_passe_hash);
             if (match) {
                const token = jwt.sign({ id_salon, role: 'gerant', email }, process.env.JWT_SECRET, { expiresIn: '24h' });
                await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { email, role: 'gerant' });
                res.json({ message: "Connexion réussie", token, statut_abonnement });
            } else {
                await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { email, raison: 'mot_de_passe_incorrect' });
                res.status(401).json({ erreur: "Mot de passe incorrect." });
            }
        } else { res.status(401).json({ erreur: "Aucun compte trouvé avec cet e-mail." }); }
    } catch (error) { res.status(500).json({ erreur: "Erreur serveur." }); }
});

app.post('/api/employes/login-pin', loginLimiter, async (req, res) => {
    const { id_salon, nom_employe, code_pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employes WHERE nom ILIKE $1 AND id_salon = $2', [`%${nom_employe}%`, id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Employé introuvable." });
        const emp = result.rows[0];
        
        let pinMatch = false;
        if (emp.code_pin && emp.code_pin.startsWith('$2')) {
            pinMatch = await bcrypt.compare(code_pin, emp.code_pin);
        } else {
            pinMatch = (emp.code_pin === code_pin); // Fallback pour vos anciens PINs en clair
        }

        if (!pinMatch) {
            await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { nom_employe, raison: 'pin_incorrect' });
            return res.status(401).json({ erreur: "Code PIN invalide." });
        }
        const token = jwt.sign({ id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe }, process.env.JWT_SECRET, { expiresIn: '12h' });
        await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { nom_employe: emp.nom, role: 'employe', id_employe: emp.id_employe });
        res.json({ message: "Accès employé autorisé", token, employe: { id: emp.id_employe, nom: emp.nom } });
    } catch (e) { res.status(500).json({ erreur: "Erreur serveur PIN." }); }
});

app.post('/api/salon/login-pin', loginLimiter, async (req, res) => {
    const { id_salon, pin } = req.body;
    try {
        const result = await pool.query('SELECT id_salon, pin_salon FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Salon introuvable." });
        const salon = result.rows[0];
        
        let pinMatch = false;
        if (salon.pin_salon && salon.pin_salon.startsWith('$2')) {
            pinMatch = await bcrypt.compare(pin, salon.pin_salon);
        } else {
            pinMatch = (salon.pin_salon === pin); // Fallback pour les anciens PINs
        }

        if (!salon.pin_salon || !pinMatch) {
            await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { raison: 'pin_salon_incorrect' });
            return res.status(401).json({ erreur: "Code PIN invalide." });
        }
        const token = jwt.sign({ id_salon: salon.id_salon, role: 'salon' }, process.env.JWT_SECRET, { expiresIn: '18h' });
        await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { role: 'salon' });
        res.json({ message: "Accès salon autorisé", token });
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

// Module légal : acceptation électronique des documents contractuels (CGV, RGPD, SEPA, NF525, prêt du TPE)
legal.installerRoutesLegales({ app, pool, jwt, enregistrerJET, PDFDocument, nodemailer, crypto });

app.post('/api/creer-checkout', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    const { plan_choisi, cycle_choisi } = req.body || {};
    
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token invalide." });
        try {
            try { await pool.query('ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS _subscription_id VARCHAR(255)'); } catch(e) {}

            const result = await pool.query('SELECT email, _customer_id, _subscription_id, statut_abonnement FROM utilisateurs WHERE id_salon = $1', [user.id_salon]);
            if (result.rowCount === 0) return res.status(404).json({ erreur: "Utilisateur introuvable." });
            
            const docsEnAttente = await legal.documentsEnAttente(pool, user.id_salon);
            if (docsEnAttente.length > 0) return res.status(403).json({ erreur: "Vous devez d'abord accepter les conditions contractuelles.", require_legal: true });
            
            let customerId = result.rows[0]._customer_id;
            const subId = result.rows[0]._subscription_id;
            const statutSub = result.rows[0].statut_abonnement;

            if (!customerId) {
                // Sécurité : on vérifie que l'email est valide pour Stripe, sinon on met un email de secours
                let emailStripe = result.rows[0].email;
                if (!emailStripe || !emailStripe.includes('@')) {
                    emailStripe = `salon${user.id_salon}@stack-app.fr`;
                }
                const customer = await stripe.customers.create({ email: emailStripe });
                customerId = customer.id;
                await pool.query('UPDATE utilisateurs SET _customer_id = $1 WHERE id_salon = $2', [customerId, user.id_salon]);
            }

            // On s'assure du bon format (ex: 'ESSENTIEL', 'MOIS' ou 'AN')
            const planClean = (plan_choisi || 'PREMIUM').toUpperCase();
            const isAnnuel = cycle_choisi === 'year' || cycle_choisi === 'Annuel' || cycle_choisi === 'ANNUEL';
            const planKey = `${planClean}_${isAnnuel ? 'AN' : 'MOIS'}`;
            
            const stripePrices = {
                'ESSENTIEL_MOIS': process.env.PRICE_ESSENTIEL_MOIS,
                'ESSENTIEL_AN': process.env.PRICE_ESSENTIEL_AN,
                'PRO_MOIS': process.env.PRICE_PRO_MOIS,
                'PRO_AN': process.env.PRICE_PRO_AN,
                'PREMIUM_MOIS': process.env.PRICE_PREMIUM_MOIS,
                'PREMIUM_AN': process.env.PRICE_PREMIUM_AN
            };
            
            const priceId = stripePrices[planKey];
            
            // Si la clé manque sur Render, on envoie l'erreur au client pour qu'il la voie
            if (!priceId) {
                return res.status(400).json({ erreur: `Le tarif Stripe n'est pas trouvé. Vérifiez que la variable ${planKey} est bien sur Render.` });
            }

            // ÉVOLUTION D'UN ABONNEMENT EXISTANT (Sans payer aujourd'hui)
            if (statutSub === 'actif' && subId) {
                const subscription = await stripe.subscriptions.retrieve(subId);
                await stripe.subscriptions.update(subId, {
                    items: [{ id: subscription.items.data[0].id, price: priceId }],
                    proration_behavior: 'none',
                    metadata: { id_salon: user.id_salon.toString(), plan_choisi: planClean, frequence: isAnnuel ? 'ANNUEL' : 'MENSUEL' }
                });

                await pool.query('UPDATE configuration_salon SET plan_actuel = $1, frequence_paiement = $2 WHERE id_salon = $3', [planClean, isAnnuel ? 'ANNUEL' : 'MENSUEL', user.id_salon]);
                return res.json({ success: true, message: `Évolution validée vers le forfait ${planClean}.` });
            }

            // NOUVEL ABONNEMENT
            const session = await stripe.checkout.sessions.create({
              customer: customerId, 
              payment_method_types: process.env.STRIPE_SEPA === 'oui' ? ['card', 'sepa_debit'] : ['card'],
              line_items: [{ price: priceId, quantity: 1 }], 
              mode: 'subscription',
              metadata: { id_salon: user.id_salon.toString(), plan_choisi: planClean, frequence: isAnnuel ? 'ANNUEL' : 'MENSUEL' },
              success_url: 'https://app-salon-caiss.onrender.com/?paiement=succes', 
              cancel_url: 'https://app-salon-caiss.onrender.com/?paiement=annule',
            });
            res.json({ url: session.url });
        } catch (e) { 
            console.error("Erreur Checkout Stripe:", e);
            res.status(500).json({ erreur: "Erreur interne Stripe : " + e.message }); 
        }
    });
});

// --- ROUTES NOTIFICATIONS PUSH ---
app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', verifierToken, async (req, res) => {
    const { subscription } = req.body;
    const { endpoint, keys } = subscription;
    const id_salon = req.user.id_salon;
    const role = req.user.role;
    const id_employe = role === 'employe' ? req.user.id_employe : null;

    try {
        const exist = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
        if (exist.rowCount === 0) {
            await pool.query(
                'INSERT INTO push_subscriptions (id_salon, role, id_employe, endpoint, keys) VALUES ($1, $2, $3, $4, $5)',
                [id_salon, role, id_employe, endpoint, JSON.stringify(keys)]
            );
        }
        res.status(201).json({ message: "Abonnement Push enregistré." });
    } catch (e) { res.status(500).json({ erreur: "Erreur enregistrement Push." }); }
});

app.post('/api/webhooks/', express.raw({type: 'application/json'}), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send("Clé secrète manquante.");
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET); } 
    catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }
    
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const idSalon = session.metadata?.id_salon;
        const planChoisi = session.metadata?.plan_choisi || 'PREMIUM';
        const frequence = session.metadata?.frequence || 'MENSUEL';
        
        // 1. On active le statut de paiement
        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1, _subscription_id = $2 WHERE _customer_id = $3', ['actif', session.subscription, session.customer]);
        
        // 2. On met à jour les privilèges du salon (ESSENTIEL/PRO/PREMIUM)
        if (idSalon) {
            await pool.query('UPDATE configuration_salon SET plan_actuel = $1, frequence_paiement = $2 WHERE id_salon = $3', [planChoisi, frequence, idSalon]);
        }
    }
    if (event.type === 'customer.subscription.deleted') {
        const session = event.data.object;
        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1 WHERE _subscription_id = $2', ['inactif', session.id]);
        
        // On rétrograde le salon pour éviter qu'il garde l'accès Premium s'il ne paye plus
        const userQuery = await pool.query('SELECT id_salon FROM utilisateurs WHERE _subscription_id = $1', [session.id]);
        if (userQuery.rowCount > 0) {
            await pool.query("UPDATE configuration_salon SET plan_actuel = 'ESSENTIEL' WHERE id_salon = $1", [userQuery.rows[0].id_salon]);
        }
    }
    res.json({received: true});
});

app.post('/api/settings', verifierToken, async (req, res) => { 
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture, telephone_gerant, alertes_sms_actives, email_comptable, jour_envoi_bilan, pin_salon, temps_nettoyage_minutes, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva, pennylane_api_key } = req.body; 
    try { 
        const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
        if (pin_salon !== undefined && req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut modifier le code PIN du salon." });
        
        let finalPinSalon = pin_salon;
        if (pin_salon && !pin_salon.startsWith('$2')) {
            finalPinSalon = await bcrypt.hash(pin_salon, 10);
        }

        const updateQuery = pin_salon !== undefined
            ? `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $24, pin_salon = $23 WHERE id_salon = $16`
            : `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $23 WHERE id_salon = $16`; 
        const params = [google_api_key, google_account_id, google_location_id, email_factures, passChiffre, brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, heure_ouverture || 8, heure_fermeture || 20, telephone_gerant, alertes_sms_actives || false, email_comptable, jour_envoi_bilan || 1, req.user.id_salon, temps_nettoyage_minutes || 0, compte_banque || '512000', compte_caisse || '530000', compte_prestations || '706000', compte_produits || '707000', compte_tva || '445710'];
        if (pin_salon !== undefined) { params.push(finalPinSalon || null); params.push(pennylane_api_key || null); } else { params.push(pennylane_api_key || null); }
        await pool.query(updateQuery, params);
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
    const { nom_client, telephone_client, id_employe, prestation, date_heure_debut, duree_minutes, forcer_ajout } = req.body;
    try {
        if (id_employe) {
            const dateRDV = date_heure_debut.split('T')[0];
            const absence = await pool.query(`SELECT type_demande FROM absences_employes WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND $3 BETWEEN date_debut AND date_fin`, [req.user.id_salon, id_employe, dateRDV]);
            if (absence.rowCount > 0) return res.status(400).json({ erreur: "Impossible d'ajouter ce rdv car le collaborateur n'est pas disponible sur cette date." });
        }

        const dureeReelle = parseInt(duree_minutes) || 30;

        if (id_employe && !forcer_ajout) {
            const configRes = await pool.query('SELECT temps_nettoyage_minutes FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]);
            const tempsNettoyage = configRes.rowCount > 0 ? (configRes.rows[0].temps_nettoyage_minutes || 0) : 0;
            const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

            const rdvExistants = await pool.query(
                `SELECT id_rdv FROM rendez_vous 
                 WHERE id_salon = $1 AND id_employe = $2 
                 AND (
                    (date_heure_debut < ($3::timestamp + ($4 || ' minutes')::interval)) 
                    AND 
                    (date_heure_debut + ((COALESCE(duree_minutes, 30) + $5) || ' minutes')::interval > $3::timestamp)
                 )`,
                [req.user.id_salon, id_employe, date_heure_debut, dureeTotaleBloquee, tempsNettoyage]
            );

            if (rdvExistants.rowCount > 0) {
                return res.status(409).json({ erreur: "Un rendez-vous est déjà prévu sur cette plage horaire pour ce coiffeur. Êtes-vous sûr de vouloir forcer l'ajout ?" });
            }
        }

        await pool.query(`INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [req.user.id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, dureeReelle]);
        io.to(req.user.id_salon.toString()).emit('nouveauRDV');
        res.status(201).json({ message: "RDV ajouté." });
    } catch (e) { res.status(500).json({ erreur: "Erreur création RDV." }); }
});

app.put('/api/rdv/:id', verifierToken, async (req, res) => {
    const { id_employe, prestation, date_heure_debut, duree_minutes, forcer_ajout } = req.body;
    try {
        const dureeReelle = parseInt(duree_minutes) || 30;

        if (id_employe) {
            const dateRDV = date_heure_debut.split('T')[0];
            const absence = await pool.query(`SELECT type_demande FROM absences_employes WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND $3 BETWEEN date_debut AND date_fin`, [req.user.id_salon, id_employe, dateRDV]);
            if (absence.rowCount > 0) return res.status(400).json({ erreur: "Impossible de modifier ce rdv car le collaborateur n'est pas disponible sur cette date." });
        }

        if (id_employe && !forcer_ajout) {
            const configRes = await pool.query('SELECT temps_nettoyage_minutes FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]);
            const tempsNettoyage = configRes.rowCount > 0 ? (configRes.rows[0].temps_nettoyage_minutes || 0) : 0;
            const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

            const rdvExistants = await pool.query(
                `SELECT id_rdv FROM rendez_vous 
                 WHERE id_salon = $1 AND id_employe = $2 AND id_rdv != $6
                 AND (
                    (date_heure_debut < ($3::timestamp + ($4 || ' minutes')::interval)) 
                    AND 
                    (date_heure_debut + ((COALESCE(duree_minutes, 30) + $5) || ' minutes')::interval > $3::timestamp)
                 )`,
                [req.user.id_salon, id_employe, date_heure_debut, dureeTotaleBloquee, tempsNettoyage, req.params.id]
            );

            if (rdvExistants.rowCount > 0) {
                return res.status(409).json({ erreur: "Un rendez-vous est déjà prévu sur cette plage horaire pour ce coiffeur. Êtes-vous sûr de vouloir le modifier quand même ?" });
            }
        }

        await pool.query(
            `UPDATE rendez_vous SET id_employe = $1, prestation = $2, date_heure_debut = $3, duree_minutes = $4 WHERE id_rdv = $5 AND id_salon = $6`, 
            [id_employe, prestation, date_heure_debut, dureeReelle, req.params.id, req.user.id_salon]
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

// =========================================================================
// --- EXPORT ICAL (SYNCHRONISATION PLANITY / EXTERNE) ---
// =========================================================================
app.get('/api/ical/:id_salon/:id_employe.ics', async (req, res) => {
    const { id_salon, id_employe } = req.params;
    try {
        const empRes = await pool.query('SELECT nom FROM employes WHERE id_salon = $1 AND id_employe = $2', [id_salon, id_employe]);
        if (empRes.rowCount === 0) return res.status(404).send("Employé introuvable");

        const nomEmploye = empRes.rows[0].nom;

        // RDVs futurs et passés récents
        const rdvs = await pool.query(
            `SELECT id_rdv, date_heure_debut, duree_minutes 
             FROM rendez_vous 
             WHERE id_salon = $1 AND id_employe = $2 AND date_heure_debut >= NOW() - INTERVAL '30 days'`,
            [id_salon, id_employe]
        );

        // Absences (Congés, Maladie)
        const absences = await pool.query(
            `SELECT id_absence, date_debut, date_fin 
             FROM absences_employes 
             WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND date_fin >= CURRENT_DATE - INTERVAL '30 days'`,
            [id_salon, id_employe]
        );

        const configRes = await pool.query('SELECT temps_nettoyage_minutes FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const tempsNettoyage = configRes.rowCount > 0 ? (configRes.rows[0].temps_nettoyage_minutes || 0) : 0;

        // Fonction de formatage au format iCal (YYYYMMDDThhmmssZ)
        const formatICSDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        
        // Pour les absences (Jours entiers), le format est YYYYMMDD
        const formatICSAllDay = (dateStr, addDays = 0) => {
            const d = new Date(dateStr);
            d.setDate(d.getDate() + addDays);
            return d.toISOString().split('T')[0].replace(/-/g, '');
        };

        let icsContent = "BEGIN:VCALENDAR\r\n";
        icsContent += "VERSION:2.0\r\n";
        icsContent += `PRODID:-//STACK//Agenda ${nomEmploye}//FR\r\n`;
        icsContent += "CALSCALE:GREGORIAN\r\n";
        icsContent += "METHOD:PUBLISH\r\n";
        icsContent += `X-WR-CALNAME:STACK - ${nomEmploye}\r\n`;
        icsContent += "X-WR-TIMEZONE:Europe/Paris\r\n";

        // Ajout des Créneaux RDV
        for (let rdv of rdvs.rows) {
            const start = new Date(rdv.date_heure_debut);
            const end = new Date(start.getTime() + ((rdv.duree_minutes + tempsNettoyage) * 60000));
            
            icsContent += "BEGIN:VEVENT\r\n";
            icsContent += `UID:rdv-${rdv.id_rdv}@stack.fr\r\n`;
            icsContent += `DTSTAMP:${formatICSDate(new Date())}\r\n`;
            icsContent += `DTSTART:${formatICSDate(start)}\r\n`;
            icsContent += `DTEND:${formatICSDate(end)}\r\n`;
            icsContent += "SUMMARY:Indisponible (STACK)\r\n";
            icsContent += "STATUS:CONFIRMED\r\n";
            icsContent += "END:VEVENT\r\n";
        }

        // Ajout des Absences
        for (let abs of absences.rows) {
            icsContent += "BEGIN:VEVENT\r\n";
            icsContent += `UID:abs-${abs.id_absence}@stack.fr\r\n`;
            icsContent += `DTSTAMP:${formatICSDate(new Date())}\r\n`;
            icsContent += `DTSTART;VALUE=DATE:${formatICSAllDay(abs.date_debut, 0)}\r\n`;
            icsContent += `DTEND;VALUE=DATE:${formatICSAllDay(abs.date_fin, 1)}\r\n`; // Fin exclusive en iCal (+1 jour)
            icsContent += "SUMMARY:Absence (STACK)\r\n";
            icsContent += "TRANSP:OPAQUE\r\n";
            icsContent += "END:VEVENT\r\n";
        }

        icsContent += "END:VCALENDAR\r\n";

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="agenda-${id_employe}.ics"`);
        res.send(icsContent);

    } catch (err) {
        res.status(500).send("Erreur génération iCal");
    }
});

// --- ROUTE : ROBOT D'ANNULATION DE MASSE SÉLECTIVE ---
app.post('/api/rdv/mass-cancel', verifierToken, async (req, res) => {
    const { rdv_ids, id_employe, message_personnalise } = req.body;
    const id_salon = req.user.id_salon;
    if (!rdv_ids || rdv_ids.length === 0) return res.json({ message: "Aucun RDV à annuler." });

    try {
        const salonConfig = await pool.query('SELECT nom_salon, brevo_api_key, lien_google_maps FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = salonConfig.rows[0];

        let countEnvoyes = 0;

        for (let id_rdv of rdv_ids) {
            const rdvRes = await pool.query('SELECT nom_client, telephone_client, date_heure_debut FROM rendez_vous WHERE id_rdv = $1 AND id_salon = $2', [id_rdv, id_salon]);
            if (rdvRes.rowCount > 0) {
                const rdv = rdvRes.rows[0];
                await pool.query('DELETE FROM rendez_vous WHERE id_rdv = $1', [id_rdv]);
                
                if (config.brevo_api_key && rdv.telephone_client && rdv.telephone_client.trim().length >= 9) {
                    const dateRdv = new Date(rdv.date_heure_debut).toLocaleString('fr-FR', {weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'});
                    const prenom = rdv.nom_client ? rdv.nom_client.split(' ')[0] : 'Client';
                    const lien = config.lien_google_maps || 'notre site internet';
                    
                    // Remplacement des balises dynamiques
                    let texteSms = message_personnalise || `Bonjour [Prénom], votre RDV du [Date] est annulé. Reprogrammez ici : [Lien]`;
                    texteSms = texteSms.replace(/\[Prénom\]/gi, prenom).replace(/\[Date\]/gi, dateRdv).replace(/\[Lien\]/gi, lien);
                    
                    try {
                        fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
                            method: 'POST', headers: { 'accept': 'application/json', 'api-key': config.brevo_api_key, 'content-type': 'application/json' },
                            body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (config.nom_salon || 'LeSalon').substring(0, 11), recipient: rdv.telephone_client, content: texteSms })
                        }).catch(()=>{}); 
                        countEnvoyes++;
                    } catch (e) { console.error("Erreur SMS mass-cancel:", e); }
                }
            }
        }
        
        envoyerNotificationPush(id_salon, { type: 'employe', id_employe }, { title: "Mise à jour Agenda", body: `Tes ${rdv_ids.length} RDV ont été annulés depuis le planning.`, url: '/?tab=agenda' });
        io.to(id_salon.toString()).emit('nouveauRDV');
        res.json({ message: `${rdv_ids.length} rendez-vous annulés (${countEnvoyes} SMS envoyés).` });
    } catch (e) {
        res.status(500).json({ erreur: "Erreur lors de l'annulation." });
    }
});
app.get('/api/planning', verifierToken, async (req, res) => {
    const startDate = req.query.startDate; 
    const endDate = req.query.endDate;
    
    try {
        // 1. Récupérer les rendez-vous normaux
        let queryRdv = `SELECT r.*, e.nom as nom_employe FROM rendez_vous r LEFT JOIN employes e ON r.id_employe = e.id_employe WHERE r.id_salon = $1 AND DATE(r.date_heure_debut) >= $2 AND DATE(r.date_heure_debut) <= $3`;
        const paramsRdv = [req.user.id_salon, startDate, endDate];
        if (req.user.role === 'employe') { 
            queryRdv += ` AND r.id_employe = $4`; 
            paramsRdv.push(req.user.id_employe); 
        }
        queryRdv += ` ORDER BY r.date_heure_debut ASC`;
        const rdvResult = await pool.query(queryRdv, paramsRdv);

        // 2. Récupérer les absences (Congés validés / en attente & Arrêts maladie)
        let queryAbs = `SELECT a.*, e.nom as nom_employe FROM absences_employes a LEFT JOIN employes e ON a.id_employe = e.id_employe WHERE a.id_salon = $1 AND a.statut != 'REFUSE' AND a.date_fin >= $2 AND a.date_debut <= $3`;
        const paramsAbs = [req.user.id_salon, startDate, endDate];
        if (req.user.role === 'employe') { 
            queryAbs += ` AND a.id_employe = $4`; 
            paramsAbs.push(req.user.id_employe); 
        }
        const absResult = await pool.query(queryAbs, paramsAbs);

        // 3. Renvoyer les deux objets au frontend
        res.json({
            rendez_vous: rdvResult.rows,
            absences: absResult.rows
        });
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur lecture agenda." }); 
    }
});

// =========================================================================
// --- L'ENCAISSEMENT & MÉTHODES DE PAIEMENT (SMART POS) ---
// =========================================================================
const limiteurAvisPublic = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erreur: "Trop de tentatives, réessayez plus tard." }
});

app.get('/api/avis/info/:token', limiteurAvisPublic, async (req, res) => {
    try {
        const r = await pool.query(`SELECT a.prenom, a.statut, a.note, a.id_salon, cs.nom_salon FROM avis_demandes a JOIN configuration_salon cs ON cs.id_salon = a.id_salon WHERE a.token = $1 AND a.date_creation > NOW() - INTERVAL '30 days'`, [req.params.token]);
        if (r.rowCount === 0) return res.status(404).json({ erreur: "Lien invalide ou expiré." });
        const d = r.rows[0];
        res.json({ prenom: d.prenom, nom_salon: d.nom_salon, etape: d.statut === 'REPONDU' ? 'termine' : (d.note && d.note <= 3 ? 'commentaire' : 'notation') });
    } catch (e) { res.status(500).json({ erreur: "Erreur." }); }
});

app.get('/api/avis/stats', verifierToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE statut IN ('ENVOYE', 'REPONDU')) as nb_envoyes,
                COUNT(*) FILTER (WHERE statut = 'REPONDU') as nb_repondus,
                ROUND(AVG(note) FILTER (WHERE note IS NOT NULL)::numeric, 1) as note_moyenne,
                COUNT(*) FILTER (WHERE note >= 4) as nb_positifs,
                COUNT(*) FILTER (WHERE note IS NOT NULL AND note <= 3) as nb_negatifs
            FROM avis_demandes WHERE id_salon = $1
        `, [req.user.id_salon]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ erreur: "Erreur statistiques avis." }); }
});

app.post('/api/avis/:token/stop', async (req, res) => {
    try {
        const r = await pool.query('SELECT id_salon, telephone FROM avis_demandes WHERE token = $1', [req.params.token]);
        if (r.rowCount === 0) return res.status(404).json({ erreur: "Lien invalide." });
        const { id_salon, telephone } = r.rows[0];
        await pool.query('INSERT INTO sms_opt_out (id_salon, telephone) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id_salon, normaliserTelephone(telephone)]);
        await pool.query(`UPDATE avis_demandes SET statut = 'ANNULE' WHERE id_salon = $1 AND telephone = $2 AND statut = 'EN_ATTENTE'`, [id_salon, telephone]);
        res.json({ message: "Vous ne recevrez plus ce type de message." });
    } catch (e) { res.status(500).json({ erreur: "Erreur." }); }
});

app.post('/api/avis/:token/note', limiteurAvisPublic, async (req, res) => {
    const note = parseInt(req.body.note);
    if (!note || note < 1 || note > 5) return res.status(400).json({ erreur: "Note invalide." });
    try {
        const r = await pool.query(`UPDATE avis_demandes SET note = $1, statut = CASE WHEN $1 >= 4 THEN 'REPONDU' ELSE statut END WHERE token = $2 AND note IS NULL RETURNING id_salon`, [note, req.params.token]);
        if (r.rowCount === 0) return res.status(404).json({ erreur: "Lien invalide ou déjà utilisé." });
        if (note >= 4) {
            const salonInfo = await pool.query('SELECT lien_google_maps FROM configuration_salon WHERE id_salon = $1', [r.rows[0].id_salon]);
            return res.json({ besoin_commentaire: false, lien_google_maps: salonInfo.rows[0]?.lien_google_maps || null });
        }
        res.json({ besoin_commentaire: true });
    } catch (e) { res.status(500).json({ erreur: "Erreur." }); }
});

app.post('/api/avis/:token/commentaire', limiteurAvisPublic, async (req, res) => {
    try {
        const r = await pool.query(`UPDATE avis_demandes SET commentaire = $1, statut = 'REPONDU' WHERE token = $2 AND note <= 3 AND statut != 'REPONDU' RETURNING id_salon, telephone, prenom, note`, [req.body.commentaire || '', req.params.token]);
        if (r.rowCount === 0) return res.status(404).json({ erreur: "Lien invalide ou déjà traité." });
        const d = r.rows[0];
        
        await pool.query(
            `INSERT INTO taches_actions (id_salon, titre, description, source, donnees) VALUES ($1, $2, $3, 'AVIS_CLIENT', $4)`,
            [d.id_salon, `Avis client insatisfait (${d.note}★) à recontacter`, `${d.prenom || 'Un client'} (${d.telephone}) a laissé une note de ${d.note}/5 : "${req.body.commentaire || '(aucun commentaire)'}"`, JSON.stringify({ telephone: d.telephone, prenom: d.prenom })]
        );
        
        envoyerNotificationPush(d.id_salon, 'gerant', { title: "Avis client à traiter", body: `Note de ${d.note}/5 reçue, un commentaire vous attend dans Actions.`, url: '/?tab=actions' });
        res.json({ message: "Merci pour votre retour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur." }); }
});

app.post('/api/sms/send', verifierToken, async (req, res) => {
    const { telephone, message } = req.body;
    try {
        const salonConfig = await pool.query('SELECT brevo_api_key, sms_sender_name FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]);
        const config = salonConfig.rows[0];
        if (!config || !config.brevo_api_key) return res.status(400).json({ erreur: "SMS non configurés dans vos paramètres." });
        await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST', headers: { 'accept': 'application/json', 'api-key': config.brevo_api_key, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (config.sms_sender_name || 'LeSalon').substring(0, 11), recipient: telephone, content: message })
        });
        res.json({ message: "SMS de sauvetage envoyé." });
    } catch(e) { res.status(500).json({ erreur: "Erreur d'envoi." }); }
});
app.post('/api/caisse/payer', verifierToken, verifierClotureZ, async (req, res) => {
    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const clientDB = await pool.connect();

    try {
            let reader = null;
            let paymentIntentId = null;
            let intentStatus = null; // Remonté pour être accessible dans le bloc catch

            if (methode === 'CARTE' && montant > 0) {
                const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
                const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;

                if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

                const paymentIntent = await stripe.paymentIntents.create({
                  amount: Math.round(montant * 100), currency: 'eur', payment_method_types: ['card_present'], capture_method: 'manual', 
                });
                paymentIntentId = paymentIntent.id;
                intentStatus = paymentIntent.status;
                reader = await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });

                if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.includes('test')) {
                    try { await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId); } catch(e) {}
                }

                let attempts = 0;
                
                while (intentStatus === 'requires_payment_method' && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const checkIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                    intentStatus = checkIntent.status;
                    attempts++;
                }

                if (intentStatus !== 'requires_capture') {
                    try { await stripe.terminal.readers.cancelAction(readerId); } catch(e) {}
                    try { await stripe.paymentIntents.cancel(paymentIntentId); } catch(e) {}
                    throw new Error("Paiement refusé ou délai d'attente dépassé sur le TPE.");
                }
            }

            await clientDB.query('BEGIN');
        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        const numeroTicket = `TKT-${methode.substring(0,2)}-` + Date.now();
        
        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, date_creation, id_temp_offline, date_synchro_hors_ligne) VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE', COALESCE($8::timestamp, NOW()), $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL::timestamp ELSE NOW() END) RETURNING id_ticket;`, 
            [numeroTicket, id_client || null, id_employe, montant, id_salon, recompense_appliquee || false, methode, req.dateTicketEffective || null, req.idTempOffline || null]
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
                    await clientDB.query(`INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon, date_creation) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))`, 
                    [id_employe, idNouveauTicket, total_ligne, montant_commission, type_article, id_salon, req.dateTicketEffective || null]);
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

        // 🚨 SÉCURITÉ : On ne capture l'argent QUE si tout le reste en BDD s'est bien passé
            if (methode === 'CARTE' && montant > 0 && intentStatus === 'requires_capture') {
                await stripe.paymentIntents.capture(paymentIntentId);
            }

            await clientDB.query('COMMIT');
            
            let messageFinal = (methode === 'CARTE' && montant > 0) ? `En attente du TPE... (Ticket #${idNouveauTicket})` : `Paiement en ${methode} validé (Ticket #${idNouveauTicket})`;
            io.to(id_salon.toString()).emit('paiementValide', { message: messageFinal });
            
            res.json({ message: messageFinal, reader, id_ticket: idNouveauTicket });
        } catch (error) {
            await clientDB.query('ROLLBACK');
            
            // 🚨 SÉCURITÉ : Si la BDD a planté, on annule l'empreinte bancaire pour éviter un double débit
            if (paymentIntentId && intentStatus === 'requires_capture') {
                try { 
                    await stripe.paymentIntents.cancel(paymentIntentId); 
                    console.log(`[STRIPE] Paiement ${paymentIntentId} annulé suite à un crash BDD.`);
                } catch(e) { 
                    console.error("[STRIPE] Erreur annulation:", e); 
                }
            }

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
            let telephoneEnvoi;
            if (id_client) {
                const client = await pool.query('SELECT telephone FROM clients WHERE id_client = $1', [id_client]);
                if (client.rowCount === 0 || !client.rows[0].telephone) return res.status(400).json({ erreur: "Aucun numéro." });
                telephoneEnvoi = client.rows[0].telephone;
            } else {
                telephoneEnvoi = (req.body.telephone || '').trim();
                if (!telephoneEnvoi) return res.status(400).json({ erreur: "Numéro de téléphone requis." });
            }
            await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
                method: 'POST', headers: { 'accept': 'application/json', 'api-key': config.brevo_api_key, 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (config.sms_sender_name || 'LeSalon').substring(0, 11), recipient: telephoneEnvoi, content: textRecap })
            });

            // Client non identifié dans la base -> on programme l'enquête de satisfaction (1h30 après l'envoi du ticket)
            if (!id_client) {
                const telNormalise = normaliserTelephone(telephoneEnvoi);
                const dejaOptOut = await pool.query('SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = $2', [id_salon, telNormalise]);
                const clientConnu = await pool.query(`SELECT 1 FROM clients WHERE id_salon = $1 AND RIGHT(regexp_replace(telephone, '\\D', '', 'g'), 9) = $2`, [id_salon, telNormalise]);
                if (clientConnu.rowCount === 0 && dejaOptOut.rowCount === 0) {
                    const tokenAvis = crypto.randomBytes(24).toString('hex');
                    await pool.query(
                        `INSERT INTO avis_demandes (id_salon, telephone, token, statut, date_prevue) VALUES ($1, $2, $3, 'EN_ATTENTE', NOW() + INTERVAL '1.5 hours')`,
                        [id_salon, telephoneEnvoi, tokenAvis]
                    );
                }
            }
        }
        res.json({ message: "Ticket envoyé." });
    } catch (error) { res.status(500).json({ erreur: "Erreur envoi ticket." }); }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const { ferme_par } = req.body;
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
            'INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, ferme_par || 'Gérant']
        );

        await enregistrerJET(id_salon, 'CLOTURE_Z', { date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, signature }, clientDB);

        // --- PHASE 4 : WEBHOOK / POUSSÉE API TEMPS RÉEL (Ex: Pennylane) ---
        try {
            const configRes = await clientDB.query('SELECT pennylane_api_key FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const apiKey = configRes.rows[0]?.pennylane_api_key;
            
            if (apiKey && apiKey.trim() !== '') {
                // On récupère les écritures FEC de la journée qu'on vient de clôturer
                const dateCloture = dateACloturerStr;
                const ecrituresRes = await clientDB.query(`
                    SELECT t.numero_ticket_caisse, t.methode_paiement, t.total_ttc, lt.total_ligne_ttc, lt.taux_tva_snapshot, c.type_article 
                    FROM tickets t JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON lt.id_article = c.id_article 
                    WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut = 'VALIDE' AND t.est_compense = FALSE
                `, [id_salon, dateCloture]);

                if (ecrituresRes.rowCount > 0) {
                    // Construction du Payload d'Écritures Comptables (Format générique Pennylane / Comptabilité API)
                    const payloadPennylane = {
                        journal_code: "VT",
                        date: dateCloture,
                        label: `Z de Caisse du ${dateCloture}`,
                        entries: ecrituresRes.rows.map(row => ({
                            reference: row.numero_ticket_caisse,
                            montant_ttc: parseFloat(row.total_ttc),
                            methode: row.methode_paiement,
                            lignes: [{ type: row.type_article || 'PRESTATION', ht: Number((row.total_ligne_ttc / (1 + (row.taux_tva_snapshot || 20)/100)).toFixed(2)), tva: Number((row.total_ligne_ttc - (row.total_ligne_ttc / (1 + (row.taux_tva_snapshot || 20)/100))).toFixed(2)) }]
                        }))
                    };

                    // Poussée vers l'API externe en tâche de fond (on n'attend pas la réponse pour ne pas bloquer le frontend)
                    fetch('https://app.pennylane.com/api/v1/customer_invoices', { // Endpoint générique modulable
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(payloadPennylane)
                    }).then(r => {
                        if (r.ok) console.log(`[API COMPTA] Z du ${dateCloture} (Salon ${id_salon}) poussé avec succès.`);
                        else console.error(`[API COMPTA] Erreur API externe :`, r.status);
                    }).catch(err => console.error(`[API COMPTA] Échec réseau :`, err.message));
                }
            }
        } catch (apiErr) {
            console.error("Erreur préparation Webhook Compta:", apiErr);
        }
        // ------------------------------------------------------------------

        await clientDB.query('COMMIT');
        res.json({ message: `Caisse clôturée avec succès pour le ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')}. Total : ${totalJour} €`, signature, cumul_perpetuel_ttc: grandTotalPerpetuel });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: e.message || "Erreur lors de la clôture." });
    } finally { clientDB.release(); }
});

app.get('/api/caisse/cloture/statut', verifierToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = CURRENT_DATE', [req.user.id_salon]);
        const auto = await pool.query("SELECT TO_CHAR(date_cloture, 'YYYY-MM-DD') as date_auto FROM clotures_caisse WHERE id_salon = $1 AND ferme_par = 'Fermeture Automatique (Robot)' ORDER BY id_cloture DESC LIMIT 1", [req.user.id_salon]);
        res.json({ 
            cloture_faite: r.rowCount > 0,
            derniere_cloture_auto: auto.rowCount > 0 ? auto.rows[0].date_auto : null
        });
    } catch (e) { res.status(500).json({ erreur: "Erreur vérification du statut de clôture." }); }
});

app.post('/api/stocks/verification/fait', verifierToken, async (req, res) => {
    if (!['gerant', 'salon'].includes(req.user.role)) return res.status(403).json({ erreur: "Réservé au gérant et au salon." });
    try {
        await pool.query('UPDATE configuration_salon SET derniere_verif_stock = CURRENT_DATE WHERE id_salon = $1', [req.user.id_salon]);
        res.json({ message: "Vérification des stocks enregistrée." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de l'enregistrement." }); }
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
// --- EXPORT FEC (Fichier des Écritures Comptables) ---
// =========================================================================
app.get('/api/export-fec', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const { date_debut, date_fin } = req.query;
    if (!date_debut || !date_fin) return res.status(400).json({ erreur: "Les paramètres date_debut et date_fin (YYYY-MM-DD) sont requis." });

    try {
        // 1. Récupérer la configuration comptable du salon
        const configRes = await pool.query('SELECT compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = configRes.rows[0] || {};
        const CPT_BANQUE = config.compte_banque || '512000';
        const CPT_CAISSE = config.compte_caisse || '530000';
        const CPT_PRESTA = config.compte_prestations || '706000';
        const CPT_PROD = config.compte_produits || '707000';
        const CPT_TVA = config.compte_tva || '445710';

        // 2. Récupérer les tickets validés (avec leurs lignes) sur la période
        const ticketsRes = await pool.query(`
            SELECT 
                t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.methode_paiement, t.total_ttc,
                lt.total_ligne_ttc, lt.taux_tva_snapshot, COALESCE(lt.nom_article_snapshot, 'Article') as nom_article,
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                cc.date_cloture
            FROM tickets t
            JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON lt.id_article = c.id_article
            LEFT JOIN clotures_caisse cc ON cc.id_salon = t.id_salon AND cc.date_cloture = DATE(t.date_creation)
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND DATE(t.date_creation) BETWEEN $2 AND $3
            ORDER BY t.date_creation ASC, t.id_ticket ASC
        `, [id_salon, date_debut, date_fin]);

        let totalDebitCents = 0;
        let totalCreditCents = 0;
        const lignesFec = [];

        // L'administration exige ce format exact de date (sans tirets)
        const formatDateFEC = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        };
        // L'administration exige des virgules pour les décimales
        const formatMontant = (montant) => Number(montant).toFixed(2).replace('.', ',');

        // Grouper les lignes par ticket pour équilibrer chaque pièce comptable
        const ticketsMap = {};
        ticketsRes.rows.forEach(r => {
            if (!ticketsMap[r.id_ticket]) {
                ticketsMap[r.id_ticket] = {
                    id_ticket: r.id_ticket,
                    numero: r.numero_ticket_caisse,
                    date: r.date_creation,
                    date_valid: r.date_cloture || r.date_creation,
                    methode: r.methode_paiement,
                    total_ttc: parseFloat(r.total_ttc),
                    lignes: []
                };
            }
            ticketsMap[r.id_ticket].lignes.push(r);
        });

        // 3. Génération des écritures (La Partie Double)
        for (const t of Object.values(ticketsMap)) {
            const dateEcriture = formatDateFEC(t.date);
            const dateValid = formatDateFEC(t.date_valid);
            const pieceRef = t.numero;
            const ecritureNum = `VT-${t.id_ticket}`;
            
            // Ligne de DÉBIT (Paiement)
            const cptePaiement = (t.methode === 'ESPECES') ? CPT_CAISSE : CPT_BANQUE;
            const libellePaiement = (t.methode === 'ESPECES') ? 'Caisse' : 'Banque';
            
            lignesFec.push({
                JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                CompteNum: cptePaiement, CompteLib: libellePaiement, CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `Encaissement ${pieceRef}`,
                Debit: formatMontant(t.total_ttc), Credit: '', EcritureLet: '', DateLet: '',
                ValidDate: dateValid, Montantdevise: '', Idevise: ''
            });
            totalDebitCents += Math.round(t.total_ttc * 100);

            // Lignes de CRÉDIT (Produit/Presta + TVA)
            for (const ligne of t.lignes) {
                const ligneTTC = parseFloat(ligne.total_ligne_ttc);
                const tauxTVA = parseFloat(ligne.taux_tva_snapshot) || 20.00;
                
                // Calcul strict pour éviter les erreurs d'arrondis comptables
                const ligneHT = Number((ligneTTC / (1 + tauxTVA / 100)).toFixed(2));
                const ligneTVA = Number((ligneTTC - ligneHT).toFixed(2));

                const cpteVente = (ligne.type_article === 'PRODUIT_REVENTE') ? CPT_PROD : CPT_PRESTA;
                const libelleVente = (ligne.type_article === 'PRODUIT_REVENTE') ? 'Vente Produit' : 'Vente Prestation';
                const nomNettoye = (ligne.nom_article || 'Article').substring(0, 30).replace(/\t/g, ' ').replace(/\n/g, ' ');

                // Crédit CA (HT)
                if (ligneHT > 0) {
                    lignesFec.push({
                        JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                        CompteNum: cpteVente, CompteLib: libelleVente, CompAuxNum: '', CompAuxLib: '',
                        PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: nomNettoye,
                        Debit: '', Credit: formatMontant(ligneHT), EcritureLet: '', DateLet: '',
                        ValidDate: dateValid, Montantdevise: '', Idevise: ''
                    });
                    totalCreditCents += Math.round(ligneHT * 100);
                }

                // Crédit TVA
                if (ligneTVA > 0) {
                    lignesFec.push({
                        JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                        CompteNum: CPT_TVA, CompteLib: `TVA Collectee ${tauxTVA}%`, CompAuxNum: '', CompAuxLib: '',
                        PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `TVA ${nomNettoye}`.substring(0,30),
                        Debit: '', Credit: formatMontant(ligneTVA), EcritureLet: '', DateLet: '',
                        ValidDate: dateValid, Montantdevise: '', Idevise: ''
                    });
                    totalCreditCents += Math.round(ligneTVA * 100);
                }
            }
        }

        // 4. L'AUTO-DIAGNOSTIC (Contrôle d'équilibre comptable)
        if (totalDebitCents !== totalCreditCents) {
            console.error(`Déséquilibre FEC : Débit=${totalDebitCents/100} Crédit=${totalCreditCents/100}`);
            return res.status(500).json({ erreur: `Déséquilibre comptable détecté (Débit: ${(totalDebitCents/100).toFixed(2)}€ / Crédit: ${(totalCreditCents/100).toFixed(2)}€). Export bloqué pour protéger votre comptabilité.` });
        }

        // 5. Assemblage du fichier FEC au format TXT normé (séparateur TAB)
        const headers = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
        
        let fecContent = headers.join('\t') + '\r\n';
        for (const row of lignesFec) {
            fecContent += headers.map(h => row[h]).join('\t') + '\r\n';
        }

        // Traçabilité de l'action dans le journal technique NF525
        await enregistrerJET(id_salon, 'EXPORT_FEC_GENERE', { date_debut, date_fin, nb_lignes: lignesFec.length, total_equilibre: totalDebitCents / 100 });

        res.setHeader('Content-Type', 'text/plain; charset=windows-1252'); // L'ANSI/Windows-1252 est le standard attendu par les impôts français
        res.setHeader('Content-Disposition', `attachment; filename="FEC_${id_salon}_${date_debut.replace(/-/g, '')}_${date_fin.replace(/-/g, '')}.txt"`);
        res.send(fecContent);

    } catch (e) {
        console.error("❌ Erreur export FEC:", e);
        res.status(500).json({ erreur: "Erreur lors de la génération du fichier FEC." });
    }
});

// =========================================================================
// --- MESSAGERIE INTERNE ---
// =========================================================================
app.get('/api/messages', verifierToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT m.*, COALESCE(e.nom, CASE WHEN m.id_expediteur = -1 THEN 'Salon' END) as nom_expediteur, e.photo_url as photo_expediteur FROM messages m LEFT JOIN employes e ON m.id_expediteur = e.id_employe WHERE m.id_salon = $1 ORDER BY m.date_creation ASC`, [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur messages." }); }
});

app.post('/api/messages', verifierToken, async (req, res) => {
    const { id_destinataire, contenu, fichier_url } = req.body;
    const id_expediteur = req.user.role === 'employe' ? req.user.id_employe : (req.user.role === 'salon' ? -1 : null);
    try {
        let nom_expediteur = 'Gérant';
        let photo_expediteur = null;
        if (req.user.role === 'employe') {
            const empRes = await pool.query('SELECT nom, photo_url FROM employes WHERE id_employe = $1 AND id_salon = $2', [req.user.id_employe, req.user.id_salon]);
            if (empRes.rowCount === 0) return res.status(403).json({ erreur: "Employé introuvable." });
            nom_expediteur = empRes.rows[0].nom;
            photo_expediteur = empRes.rows[0].photo_url;
        } else if (req.user.role === 'salon') {
            nom_expediteur = 'Salon';
        }
        const dest = id_destinataire === 'gerant' ? null : (id_destinataire === 'salon' ? 0 : id_destinataire);
        const result = await pool.query(
            `INSERT INTO messages (id_salon, id_expediteur, id_destinataire, contenu, fichier_url) VALUES ($1, $2, $3, $4, $5) RETURNING id_message, date_creation`,
            [req.user.id_salon, id_expediteur, dest, contenu, fichier_url || null]
        );
        const newMessage = {
            id_message: result.rows[0].id_message,
            id_salon: req.user.id_salon,
            id_expediteur,
            id_destinataire: dest,
            contenu,
            fichier_url,
            date_creation: result.rows[0].date_creation,
            nom_expediteur,
            photo_expediteur,
            vu_par: []
        };
        io.to(req.user.id_salon.toString()).emit('nouveauMessage', newMessage);
        
        // Envoi de la notification Push : uniquement au(x) vrai(s) destinataire(s) du message
        let cibleNotif;
        if (dest === 0) {
            cibleNotif = 'salon'; // message de groupe : tout le monde
        } else if (dest === null) {
            cibleNotif = 'gerant'; // message adressé au gérant
        } else {
            cibleNotif = { type: 'employe', id_employe: dest }; // message privé à un employé précis
        }
        envoyerNotificationPush(req.user.id_salon, cibleNotif, {
            title: `Nouveau message de ${newMessage.nom_expediteur}`,
            body: contenu.length > 40 ? contenu.substring(0, 40) + '...' : contenu,
            url: '/?tab=messagerie'
        });

        res.status(201).json(newMessage);
    } catch (e) { res.status(500).json({ erreur: "Erreur envoi message." }); }
});

app.put('/api/messages/:id', verifierToken, async (req, res) => {
    const { contenu } = req.body;
    try {
        await pool.query('UPDATE messages SET contenu = $1 WHERE id_message = $2 AND id_salon = $3', [contenu, req.params.id, req.user.id_salon]);
        io.to(req.user.id_salon.toString()).emit('messageModifie', { id_message: parseInt(req.params.id), contenu });
        res.json({ message: "Message modifié" });
    } catch(e) { res.status(500).json({erreur: "Erreur lors de la modification"}); }
});

app.delete('/api/messages/:id', verifierToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE id_message = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]);
        io.to(req.user.id_salon.toString()).emit('messageSupprime', { id_message: parseInt(req.params.id) });
        res.json({ message: "Message supprimé" });
    } catch(e) { res.status(500).json({erreur: "Erreur lors de la suppression"}); }
});

app.post('/api/messages/vu', verifierToken, async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(id => parseInt(id)).filter(n => !isNaN(n)) : [];
    if (ids.length === 0) return res.json({ message: "Rien à marquer." });
    const monId = req.user.role === 'employe' ? req.user.id_employe : (req.user.role === 'salon' ? -1 : null);
    const monProfilId = req.user.role === 'employe' ? `emp_${req.user.id_employe}` : (req.user.role === 'salon' ? 'salon' : 'gerant');
    try {
        const result = await pool.query(
            `UPDATE messages SET vu_par = CASE WHEN COALESCE(vu_par, '[]'::jsonb) @> to_jsonb($1::text) THEN vu_par ELSE COALESCE(vu_par, '[]'::jsonb) || to_jsonb($1::text) END
             WHERE id_message = ANY($2::int[]) AND id_salon = $3 AND id_expediteur IS DISTINCT FROM $4
             RETURNING id_message, vu_par`,
            [monProfilId, ids, req.user.id_salon, monId]
        );
        result.rows.forEach(row => {
            io.to(req.user.id_salon.toString()).emit('messageVu', { id_message: row.id_message, vu_par: row.vu_par });
        });
        res.json({ message: "Marqué comme vu." });
    } catch (e) { res.status(500).json({ erreur: "Erreur marquage vu." }); }
});

app.post('/api/messages/:id/react', verifierToken, async (req, res) => {
    const { emoji } = req.body;
    const monProfilId = req.user.role === 'employe' ? `emp_${req.user.id_employe}` : 'gerant';
    try {
        const msgRes = await pool.query('SELECT reactions FROM messages WHERE id_message = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]);
        if(msgRes.rowCount === 0) return res.status(404).json({erreur: "Message introuvable"});
        
        let reactions = msgRes.rows[0].reactions || {};
        if (typeof reactions === 'string') reactions = JSON.parse(reactions); 
        
        if (!reactions[emoji]) reactions[emoji] = [];
        
        if (reactions[emoji].includes(monProfilId)) {
            reactions[emoji] = reactions[emoji].filter(id => id !== monProfilId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
            reactions[emoji].push(monProfilId);
        }
        
        await pool.query('UPDATE messages SET reactions = $1 WHERE id_message = $2', [JSON.stringify(reactions), req.params.id]);
        io.to(req.user.id_salon.toString()).emit('messageReaction', { id_message: parseInt(req.params.id), reactions });
        res.json({ message: "Réaction mise à jour" });
    } catch(e) { res.status(500).json({erreur: "Erreur de réaction"}); }
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
        const hashPin = await bcrypt.hash(code_pin || '0000', 10);
        await pool.query('INSERT INTO employes (nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, id_salon) VALUES ($1, $2, $3, $4, $5, $6, $7)', [nom, role || 'Employé', taux_commission_prestation || 0, taux_commission_produit || 0, hashPin, photo_url || null, req.user.id_salon]); 
        res.status(201).json({message: "Employé ajouté"}); 
    } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }
});
app.put('/api/employes/:id', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut modifier un employé." });
    const { nom, code_pin, taux_commission_prestation, taux_commission_produit } = req.body;
    try {
        if (code_pin && code_pin.trim() !== '') {
            const hashPin = await bcrypt.hash(code_pin, 10);
            await pool.query('UPDATE employes SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3, code_pin = $4 WHERE id_employe = $5 AND id_salon = $6', [nom, taux_commission_prestation || 0, taux_commission_produit || 0, hashPin, req.params.id, req.user.id_salon]);
        } else {
            await pool.query('UPDATE employes SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3 WHERE id_employe = $4 AND id_salon = $5', [nom, taux_commission_prestation || 0, taux_commission_produit || 0, req.params.id, req.user.id_salon]);
        }
        res.json({message: "Employé modifié"});
    } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }
});
app.delete('/api/employes/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM employes WHERE id_employe = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Employé supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression employé."}); }});

app.put('/api/employes/:id/photo', verifierToken, async (req, res) => {
    if (req.user.role !== 'employe' || parseInt(req.params.id) !== req.user.id_employe) return res.status(403).json({ erreur: "Action non autorisée." });
    try {
        await pool.query('UPDATE employes SET photo_url = $1 WHERE id_employe = $2 AND id_salon = $3', [req.body.photo_url || null, req.user.id_employe, req.user.id_salon]);
        res.json({ message: "Photo mise à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur mise à jour photo." }); }
});

app.get('/api/catalogue', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY type_article, nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur catalogue."}); }});

app.post('/api/catalogue', verifierToken, async (req, res) => { 
    const { nom, type_article, prix, stock_actuel, reference, taux_tva, delai_livraison_jours } = req.body; 
    try { 
        const typeArticleFormatte = type_article || 'PRESTATION'; 
        const prixFormatte = parseFloat((prix || "0").toString().replace(',', '.')) || 0; 
        const stockFormatte = parseInt(stock_actuel) || 0; 
        const refFormattee = reference ? reference.trim() : null; 
        const tvaFormattee = (taux_tva !== undefined && taux_tva !== null && taux_tva !== '') ? parseFloat(taux_tva.toString().replace(',', '.')) : 20.00; 
        const delaiFormatte = parseInt(delai_livraison_jours) || 3;

        if (typeArticleFormatte === 'PRODUIT_REVENTE') { 
            if (!refFormattee || refFormattee.length < 4) { return res.status(400).json({ erreur: "Réf valide requise." }); } 
        } 
        
        const checkQuery = `SELECT * FROM catalogue WHERE (nom ILIKE $1 OR (reference = $2 AND reference IS NOT NULL)) AND id_salon = $3`; 
        const checkResult = await pool.query(checkQuery, [nom, refFormattee, req.user.id_salon]); 
        
        if (checkResult.rowCount > 0) { 
            const art = checkResult.rows[0]; 
            if (refFormattee && art.reference === refFormattee && typeArticleFormatte === 'PRODUIT_REVENTE') { 
                if (!nom || nom.trim() === '') { 
                    await pool.query('UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2', [stockFormatte, art.id_article]); 
                    await enregistrerJET(req.user.id_salon, 'MODIFICATION_ARTICLE', { id_article: art.id_article, action: 'REAPPRO_STOCK', ajout: stockFormatte }); 
                    return res.status(200).json({ message: `Stock mis à jour (+${stockFormatte})` }); 
                } else if (nom.trim().toLowerCase() !== art.nom.toLowerCase()) { 
                    return res.status(400).json({ erreur: `Référence déjà utilisée.` }); 
                } 
            } 
            if (art.nom.toLowerCase() === nom.trim().toLowerCase()) { 
                return res.status(400).json({ erreur: `L'article existe déjà.` }); 
            } 
        } 
        
        const dureeFormattee = parseInt(req.body.duree_estimee_minutes) || 30;
        const inserted = await pool.query('INSERT INTO catalogue (nom, type_article, prix, stock_actuel, reference, taux_tva, delai_livraison_jours, duree_estimee_minutes, id_salon) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_article', [nom, typeArticleFormatte, prixFormatte, stockFormatte, refFormattee, tvaFormattee, delaiFormatte, dureeFormattee, req.user.id_salon]);
        await enregistrerJET(req.user.id_salon, 'CREATION_ARTICLE', { id_article: inserted.rows[0].id_article, nom, type_article: typeArticleFormatte, prix: prixFormatte, taux_tva: tvaFormattee }); 
        res.status(201).json({ message: "Article ajouté avec succès !" }); 
    } catch (e) { res.status(500).json({ erreur: `Erreur interne : ${e.message}` }); }
});

app.delete('/api/catalogue/:id', verifierToken, async (req, res) => { try { const articleRes = await pool.query('SELECT nom, type_article, prix FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); await pool.query('DELETE FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); if (articleRes.rowCount > 0) { await enregistrerJET(req.user.id_salon, 'SUPPRESSION_ARTICLE', { id_article: req.params.id, ...articleRes.rows[0] }); } res.json({message: "Article supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression article."}); }});

app.put('/api/catalogue/:id/nom', verifierToken, async (req, res) => {
    const nouveauNom = (req.body.nom || '').trim();
    if (!nouveauNom) return res.status(400).json({ erreur: "Le nom ne peut pas être vide." });
    try {
        const doublon = await pool.query('SELECT 1 FROM catalogue WHERE id_salon = $1 AND id_article != $2 AND nom ILIKE $3', [req.user.id_salon, req.params.id, nouveauNom]);
        if (doublon.rowCount > 0) return res.status(400).json({ erreur: "Une prestation porte déjà ce nom." });
        const result = await pool.query('UPDATE catalogue SET nom = $1 WHERE id_article = $2 AND id_salon = $3 RETURNING id_article', [nouveauNom, req.params.id, req.user.id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Article introuvable." });
        await enregistrerJET(req.user.id_salon, 'MODIFICATION_ARTICLE', { id_article: req.params.id, action: 'RENOMMAGE', nouveau_nom: nouveauNom });
        res.json({ message: "Nom mis à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors du renommage." }); }
});

app.get('/api/stocks', verifierToken, async (req, res) => {
    try {
        const stockResult = await pool.query(`
            WITH ConsommationDirecte AS (
                SELECT lt.id_article, SUM(lt.quantite) as qte
                FROM lignes_ticket lt
                JOIN tickets t ON t.id_ticket = lt.id_ticket
                WHERE lt.id_salon = $1 AND t.statut != 'ANNULE' AND t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE
                  AND t.date_creation >= NOW() - INTERVAL '30 days'
                GROUP BY lt.id_article
            ),
            ConsommationRecettes AS (
                SELECT ra.id_article, SUM(ra.quantite_necessaire * lt.quantite) as qte
                FROM lignes_ticket lt
                JOIN tickets t ON t.id_ticket = lt.id_ticket
                JOIN protocoles p ON p.id_salon = $1 AND TRIM(p.nom_prestation) ILIKE TRIM(lt.nom_article_snapshot)
                JOIN recettes_articles ra ON ra.id_protocole = p.id_protocole
                WHERE lt.id_salon = $1 AND t.statut != 'ANNULE' AND t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE
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
            WHERE c.id_salon = $1 AND c.type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE')
            ORDER BY c.nom ASC
        `, [req.user.id_salon]);

        const stocksAvecTendance = stockResult.rows.map(p => {
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
            return { ...p, vitesse_jour: Math.round(vitesseJour * 100) / 100, jours_restants: joursRestants, date_rupture_prevue: dateRuptureProjetee };
        });

        res.json(stocksAvecTendance);
    } catch (erreur) { res.status(500).json({ erreur: "Erreur stocks." }); }
});

app.put('/api/stocks/:id', verifierToken, async (req, res) => {
    const nouveauStock = parseInt(req.body.nouveau_stock);
    if (isNaN(nouveauStock) || nouveauStock < 0) return res.status(400).json({ erreur: "Quantité invalide." });
    try {
        const result = await pool.query('UPDATE catalogue SET stock_actuel = $1 WHERE id_article = $2 AND id_salon = $3 RETURNING id_article', [nouveauStock, req.params.id, req.user.id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Produit introuvable." });
        await enregistrerJET(req.user.id_salon, 'MODIFICATION_ARTICLE', { id_article: req.params.id, action: 'CORRECTION_STOCK', nouvelle_valeur: nouveauStock });
        res.json({ message: "Stock mis à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur mise à jour du stock." }); }
});
app.get('/api/rh', verifierToken, async (req, res) => { const id_salon = req.user.id_salon; try { const rhQuery = `SELECT e.id_employe, e.nom, e.photo_url, COALESCE(e.role, 'Employé') as role, COUNT(DISTINCT CASE WHEN c.type_vente = 'PRESTATION' THEN c.id_ticket END) as clients_coiffes, COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as produits_vendus, COALESCE(SUM(c.montant_vente), 0) as ca_genere, COALESCE(SUM(c.montant_commission), 0) as prime_estimee FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 WHERE e.id_salon = $1 GROUP BY e.id_employe, e.nom, e.photo_url, e.role ORDER BY e.id_employe;`; const rhResult = await pool.query(rhQuery, [id_salon]); const employesData = await Promise.all(rhResult.rows.map(async (emp) => { const histoQuery = `SELECT COALESCE(SUM(montant_commission), 0) as total_prime FROM commissions WHERE id_employe = $1 AND id_salon = $2 GROUP BY EXTRACT(MONTH FROM date_creation), EXTRACT(YEAR FROM date_creation) ORDER BY EXTRACT(YEAR FROM date_creation) ASC, EXTRACT(MONTH FROM date_creation) ASC;`; const histoResult = await pool.query(histoQuery, [emp.id_employe, id_salon]); let historique = histoResult.rows.map(r => parseFloat(r.total_prime)); while(historique.length < 6) historique.unshift(0); if (historique.every(val => val === 0)) historique = [0, 0, 0, 0, 0, parseFloat(emp.prime_estimee) || 0]; const avisEmp = await pool.query(`SELECT note, commentaire, prenom, date_creation FROM avis_demandes WHERE id_salon = $2 AND id_employe = $1 AND statut = 'REPONDU' AND note IS NOT NULL ORDER BY date_creation DESC`, [emp.id_employe, id_salon]); const notes = avisEmp.rows.map(a => a.note); const moyenneNote = notes.length > 0 ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null; return { id_employe: emp.id_employe, nom: emp.nom, role: emp.role, photo_url: emp.photo_url, performances_actuelles: { clients_coiffes: parseInt(emp.clients_coiffes), produits_vendus: parseInt(emp.produits_vendus), ca_genere: parseFloat(emp.ca_genere), prime_estimee: parseFloat(emp.prime_estimee) }, historique_primes: historique.slice(-6), note_moyenne: moyenneNote, nb_avis: notes.length, derniers_avis: avisEmp.rows.slice(0, 3) }; })); res.json(employesData); } catch (erreur) { res.status(500).json({ erreur: "Erreur requête RH." }); }});
// =========================================================================
// --- MODULE RH : CONGÉS ET ARRÊTS MALADIE ---
// =========================================================================

// 1. L'employé dépose une absence (Congé ou Arrêt)
app.post('/api/rh/absences', verifierToken, verifierPlan(['PREMIUM']), async (req, res) => {
    const { type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fichier_base64, nom_fichier, type_mime } = req.body;
    const id_salon = req.user.id_salon;
    const id_employe = req.user.role === 'employe' ? req.user.id_employe : req.body.id_employe;

    try {
        const conflit = await pool.query(
            `SELECT 1 FROM absences_employes 
             WHERE id_salon = $1 AND id_employe = $2 AND statut != 'REFUSE' 
             AND date_debut <= $4 AND date_fin >= $3`,
            [id_salon, id_employe, date_debut, date_fin]
        );
        
        if (conflit.rowCount > 0) {
            return res.status(400).json({ erreur: "Une absence ou demande est déjà enregistrée sur ces dates pour ce collaborateur." });
        }

        let fileKey = null;

        if (fichier_base64 && nom_fichier) {
            const extension = nom_fichier.split('.').pop();
            fileKey = `salons/${id_salon}/employes/${id_employe}/absences/${Date.now()}.${extension}`;
            const buffer = Buffer.from(fichier_base64.replace(/^data:.*,/, ''), 'base64');
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME, Key: fileKey, Body: buffer, ContentType: type_mime,
            }));
        }

        const statutInitial = type_demande === 'ARRET_MALADIE' ? 'VALIDE' : 'EN_ATTENTE';

        const result = await pool.query(
            `INSERT INTO absences_employes (id_salon, id_employe, type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fichier_cle_r2, statut)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id_absence`,
            [id_salon, id_employe, type_demande, nature_absence, type_prolongation, date_debut, moment_debut, date_fin, moment_fin, heures_sortie, commentaire, fileKey, statutInitial]
        );

        const emp = await pool.query('SELECT nom FROM employes WHERE id_employe = $1', [id_employe]);
        const nomEmploye = emp.rows[0].nom;

        // --- DÉTECTION DÉTAILLÉE DES CONFLITS D'AGENDA ---
        let conflits = [];
        if (statutInitial === 'VALIDE') {
            const rdvs = await pool.query(
                `SELECT id_rdv, nom_client, telephone_client, date_heure_debut, prestation 
                 FROM rendez_vous WHERE id_salon=$1 AND id_employe=$2 
                 AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') >= $3 
                 AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') <= $4
                 ORDER BY date_heure_debut ASC`,
                [id_salon, id_employe, date_debut, date_fin]
            );
            conflits = rdvs.rows;
        }

        if (type_demande === 'ARRET_MALADIE') {
            await pool.query(
                "INSERT INTO taches_actions (id_salon, titre, description, source) VALUES ($1, $2, $3, 'IA')",
                [id_salon, `URGENCE : Arrêt maladie de ${nomEmploye}`, `${nomEmploye} a déposé un arrêt maladie du ${date_debut} au ${date_fin}. Vérifiez l'agenda pour déplacer ses rendez-vous.`]
            );
            envoyerNotificationPush(id_salon, 'gerant', { title: "Arrêt Maladie", body: `${nomEmploye} est en arrêt maladie jusqu'au ${date_fin}.`, url: '/?tab=actions' });
            res.json({ message: "Arrêt maladie enregistré.", conflits });
        } else {
            envoyerNotificationPush(id_salon, 'gerant', { title: "Demande de congés", body: `${nomEmploye} a posé une demande du ${date_debut} au ${date_fin}.`, url: '/?tab=equipe' });
            res.json({ message: "Demande envoyée pour validation.", conflits });
        }
    } catch (e) {
        res.status(500).json({ erreur: "Erreur lors de l'enregistrement de l'absence." });
    }
});


// 2. Le gérant Valide ou Refuse un congé
app.put('/api/rh/absences/:id/decision', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') return res.status(403).json({ erreur: "Accès refusé." });
    
    const { statut, motif_refus } = req.body;
    try {
        let conflits = [];
        if (statut === 'VALIDE') {
            const absenceResInfo = await pool.query("SELECT id_employe, TO_CHAR(date_debut, 'YYYY-MM-DD') as date_debut_str, TO_CHAR(date_fin, 'YYYY-MM-DD') as date_fin_str FROM absences_employes WHERE id_absence = $1", [req.params.id]);
            if (absenceResInfo.rowCount > 0) {
                const absInfo = absenceResInfo.rows[0];
                const rdvs = await pool.query(
                    `SELECT id_rdv, nom_client, telephone_client, date_heure_debut, prestation 
                     FROM rendez_vous WHERE id_salon=$1 AND id_employe=$2 
                     AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') >= $3 
                     AND TO_CHAR(date_heure_debut::timestamp, 'YYYY-MM-DD') <= $4
                     ORDER BY date_heure_debut ASC`,
                    [req.user.id_salon, absInfo.id_employe, absInfo.date_debut_str, absInfo.date_fin_str]
                );
                conflits = rdvs.rows;
            }
        }

        const absRes = await pool.query(
            `UPDATE absences_employes SET statut = $1, motif_refus = $2 WHERE id_absence = $3 AND id_salon = $4 RETURNING id_employe, date_debut, date_fin, type_demande`,
            [statut, motif_refus || null, req.params.id, req.user.id_salon]
        );
        
        if (absRes.rowCount > 0) {
            const absence = absRes.rows[0];
            const dDebut = new Date(absence.date_debut).toLocaleDateString('fr-FR');
            const dFin = new Date(absence.date_fin).toLocaleDateString('fr-FR');
            const message = statut === 'VALIDE' 
                ? `Vos ${absence.type_demande === 'CONGES' ? 'congés' : 'absences'} du ${dDebut} au ${dFin} ont été validés.` 
                : (motif_refus ? `Votre demande a été refusée. Motif : ${motif_refus}` : `Votre demande de congés a été refusée.`);
                
            envoyerNotificationPush(req.user.id_salon, { type: 'employe', id_employe: absence.id_employe }, { title: "Décision RH", body: message, url: '/?tab=agenda' });
        }
        res.json({ message: `Demande passée au statut : ${statut}`, conflits });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de la décision." }); }
});

// 3. Lire un justificatif sécurisé (Lien éphémère de 15 minutes)
app.get('/api/rh/absences/:id/justificatif', verifierToken, async (req, res) => {
    try {
        // Seul le gérant ou l'employé concerné peut voir le document
        const absenceRes = await pool.query(
            'SELECT fichier_cle_r2 FROM absences_employes WHERE id_absence = $1 AND id_salon = $2',
            [req.params.id, req.user.id_salon]
        );

        if (absenceRes.rowCount === 0 || !absenceRes.rows[0].fichier_cle_r2) {
            return res.status(404).json({ erreur: "Aucun justificatif trouvé." });
        }

        // Génération d'une URL temporaire
        const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: absenceRes.rows[0].fichier_cle_r2 });
        const urlTemporaire = await getSignedUrl(s3Client, command, { expiresIn: 900 });

        res.json({ url: urlTemporaire });
    } catch (e) { res.status(500).json({ erreur: "Erreur génération lien sécurisé." }); }
});

// 4. Récupérer toutes les absences (pour le tableau de bord RH du gérant)
app.get('/api/rh/absences', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') return res.status(403).json({ erreur: "Accès refusé." });
    try {
        const result = await pool.query(`
            SELECT a.*, e.nom as nom_employe 
            FROM absences_employes a 
            JOIN employes e ON a.id_employe = e.id_employe 
            WHERE a.id_salon = $1 
            ORDER BY CASE WHEN a.statut = 'EN_ATTENTE' THEN 0 ELSE 1 END, a.date_creation DESC
        `, [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture absences." }); }
});

app.get('/api/dashboard/salon', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const r = await pool.query(`
            SELECT
                COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_actuel,
                COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_precedent
            FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE
        `, [id_salon]);
        const nbActuel = parseInt(r.rows[0].nb_actuel) || 0;
        const nbPrecedent = parseInt(r.rows[0].nb_precedent) || 0;
        const evolution = nbPrecedent > 0 ? Math.round(((nbActuel - nbPrecedent) / nbPrecedent) * 100) : (nbActuel > 0 ? 100 : 0);
        res.json({ nb_clients_mois: nbActuel, evolution_pourcentage: evolution });
    } catch (e) { res.status(500).json({ erreur: "Erreur dashboard salon." }); }
});

app.get('/api/dashboard/employe', verifierToken, async (req, res) => {
    if (req.user.role !== 'employe') return res.status(403).json({ erreur: "Réservé aux employés." });
    const id_salon = req.user.id_salon;
    const id_employe = req.user.id_employe;
    try {
        const r = await pool.query(`
            SELECT
                COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_actuel,
                COUNT(CASE WHEN date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE) THEN 1 END) as nb_precedent
            FROM tickets WHERE id_salon = $1 AND id_employe = $2 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE
        `, [id_salon, id_employe]);
        const nbActuel = parseInt(r.rows[0].nb_actuel) || 0;
        const nbPrecedent = parseInt(r.rows[0].nb_precedent) || 0;
        const evolution = nbPrecedent > 0 ? Math.round(((nbActuel - nbPrecedent) / nbPrecedent) * 100) : (nbActuel > 0 ? 100 : 0);
        const cResult = await pool.query(`SELECT COALESCE(SUM(montant_commission), 0) as total FROM commissions WHERE id_employe = $1 AND id_salon = $2 AND date_creation >= date_trunc('month', CURRENT_DATE)`, [id_employe, id_salon]);
        const pResult = await pool.query(`SELECT COUNT(CASE WHEN type_vente != 'PRESTATION' THEN 1 END) as total FROM commissions WHERE id_employe = $1 AND id_salon = $2 AND date_creation >= date_trunc('month', CURRENT_DATE)`, [id_employe, id_salon]);
        res.json({ nb_clients_mois: nbActuel, evolution_pourcentage: evolution, commission_mois: parseFloat(cResult.rows[0].total), nb_produits_vendus: parseInt(pResult.rows[0].total) || 0 });
    } catch (e) { res.status(500).json({ erreur: "Erreur dashboard employé." }); }
});

app.get('/api/dashboard', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon; 
    try { 
        const statsResult = await pool.query(`SELECT COUNT(id_ticket) as nb_ventes, COALESCE(SUM(total_ttc), 0) as chiffre_affaires FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE'`, [id_salon]); 
        const nbVentes = parseInt(statsResult.rows[0].nb_ventes); 
        const caTotal = parseFloat(statsResult.rows[0].chiffre_affaires); 
        
        // LA CORRECTION EST ICI : on s'assure que c.nom est présent dans le GROUP BY si on l'utilise.
        const topPrestationsResult = await pool.query(`
            SELECT c.nom, SUM(lt.total_ligne_ttc) as total_genere 
            FROM lignes_ticket lt 
            JOIN tickets t ON lt.id_ticket = t.id_ticket 
            JOIN catalogue c ON lt.id_article = c.id_article 
            WHERE t.id_salon = $1 AND c.type_article = 'PRESTATION' AND t.statut != 'ANNULE' 
            GROUP BY c.nom 
            ORDER BY total_genere DESC 
            LIMIT 3
        `, [id_salon]); 
        
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
        
        // RECUPERATION DES VERBATIMS
        const avisResult = await pool.query(`
            SELECT a.id_demande, a.prenom, a.note, a.commentaire, a.telephone, a.date_creation, e.nom as nom_employe 
            FROM avis_demandes a LEFT JOIN employes e ON a.id_employe = e.id_employe
            WHERE a.id_salon = $1 AND a.statut = 'REPONDU' AND a.note IS NOT NULL
            ORDER BY a.date_creation DESC LIMIT 50
        `, [id_salon]);

        let nps_score = null;
        let nb_promoteurs = 0, nb_detracteurs = 0;
        if (avisResult.rowCount > 0) {
            avisResult.rows.forEach(a => { if (a.note === 5) nb_promoteurs++; else if (a.note <= 3) nb_detracteurs++; });
            nps_score = Math.round(((nb_promoteurs / avisResult.rowCount) * 100) - ((nb_detracteurs / avisResult.rowCount) * 100));
        }

        res.json({ 
            statut: "Succès", 
            finances: { 
                chiffre_affaires_total: caTotal, 
                panier_moyen: nbVentes > 0 ? (caTotal / nbVentes).toFixed(2) : 0, 
                commissions_a_payer: parseFloat(commissionsResult.rows[0].total_commissions) 
            }, 
            top_3_prestations: topPrestationsResult.rows || [], 
            marketing: { ...googleMarketing, verbatims: avisResult.rows, nps: nps_score } 
        }); 
    } catch (erreur) { 
        console.error("Erreur Dashboard:", erreur);
        res.status(500).json({ erreur: "Erreur calcul dashboard." }); 
    }
});

// =========================================================================
// --- L'INTELLIGENCE ARTIFICIELLE (ANALYSE D'EMAILS) ---
// =========================================================================
const PROMPT_SYSTEME_IA = `Tu es un assistant IA pour un salon de coiffure. Analyse cet email et extrais les donnees en JSON strict.
CAS 1 - STOCK : Si le texte parle de livraison, commande, achat, facture ou réassort de produits. -> Renvoie {"type": "STOCK", "donnees": {"nom_produit": "nom du produit", "quantite": entier, "reference": ""}}
CAS 2 - RDV : Si le texte indique qu'un client veut prendre un rendez-vous. -> Renvoie {"type": "RDV", "donnees": {"nom_client": "nom", "telephone": "numero", "prestation": "coupe, couleur...", "date_heure": "YYYY-MM-DDTHH:MM", "duree_minutes": 30}} (Cherche une durée en minutes ou déduis-la d'une heure de fin. Sinon mets null)
CAS 4 - URGENCES / FACTURES : Si le texte est une facture à payer, une relance, ou une action requise (impôts, URSSAF, EDF...). -> Renvoie {"type": "ACTION", "donnees": {"titre": "Payer EDF", "description": "Facture numéro XYZ...", "date_echeance": "YYYY-MM-DD"}}
CAS 5 - ABSENCES : Si un employé signale qu'il sera absent (arrêt maladie, demande de congé, RTT). -> Renvoie {"type": "ABSENCE", "donnees": {"nom_employe": "prénom ou nom", "type_demande": "ARRET_MALADIE ou CONGES", "date_debut": "YYYY-MM-DD", "date_fin": "YYYY-MM-DD", "commentaire": "raison courte de l'absence"}}
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
                    duree_minutes: analyse.donnees.duree_minutes ? parseInt(analyse.donnees.duree_minutes) : null,
                    id_employe: ''
                }
            }];
        }

        if (analyse.type === 'ABSENCE' && analyse.donnees && analyse.donnees.nom_employe) {
            return [{
                type_tache: 'ABSENCE',
                donnees: {
                    nom_employe: String(analyse.donnees.nom_employe).trim().substring(0, 100),
                    type_demande: analyse.donnees.type_demande === 'ARRET_MALADIE' ? 'ARRET_MALADIE' : 'CONGES',
                    date_debut: analyse.donnees.date_debut || '',
                    date_fin: analyse.donnees.date_fin || analyse.donnees.date_debut || '',
                    commentaire: analyse.donnees.commentaire ? String(analyse.donnees.commentaire).trim() : ''
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
            const dureeFinale = parseInt(donnees.duree_minutes) || 30;
            
            await clientDB.query(
                `INSERT INTO rendez_vous (id_salon, nom_client, telephone_client, prestation, date_heure_debut, id_employe, duree_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
                [id_salon, donnees.nom_client, donnees.telephone, donnees.prestation, datetime, idEmploye, dureeFinale]
            );
            
            if (donnees.telephone && donnees.telephone.trim() !== '') {
                await clientDB.query(
                    "INSERT INTO clients (nom, telephone, id_salon) SELECT $1::varchar, $2::varchar, $3::int WHERE NOT EXISTS (SELECT 1 FROM clients WHERE telephone = $2 AND id_salon = $3)", 
                    [donnees.nom_client, donnees.telephone, id_salon]
                );
            }

            io.to(id_salon.toString()).emit('nouveauRDV');
        } 
        else if (type_tache === 'ABSENCE') {
            const empRes = await clientDB.query("SELECT id_employe FROM employes WHERE nom ILIKE $1 AND id_salon = $2 LIMIT 1", [`%${donnees.nom_employe}%`, id_salon]);
            if (empRes.rowCount === 0) throw new Error(`Collaborateur introuvable : ${donnees.nom_employe}`);
            const idEmploye = empRes.rows[0].id_employe;

            // --- Vérification Anti-Doublon / Chevauchement pour l'IA ---
            const conflit = await clientDB.query(
                `SELECT 1 FROM absences_employes 
                 WHERE id_salon = $1 AND id_employe = $2 AND statut != 'REFUSE' 
                 AND date_debut <= $4 AND date_fin >= $3`,
                [id_salon, idEmploye, donnees.date_debut, donnees.date_fin]
            );
            if (conflit.rowCount > 0) throw new Error("Cet employé a déjà une absence enregistrée sur cette période.");
            // ------------------------------------------------------------

            const statutInitial = donnees.type_demande === 'ARRET_MALADIE' ? 'VALIDE' : 'EN_ATTENTE';
            const nature = donnees.type_demande === 'ARRET_MALADIE' ? 'MALADIE_ORDINAIRE' : 'CP';

            await clientDB.query(
                `INSERT INTO absences_employes (id_salon, id_employe, type_demande, nature_absence, date_debut, moment_debut, date_fin, moment_fin, commentaire, statut)
                 VALUES ($1, $2, $3, $4, $5, 'MATIN', $6, 'APRES_MIDI', $7, $8)`,
                [id_salon, idEmploye, donnees.type_demande, nature, donnees.date_debut, donnees.date_fin, donnees.commentaire, statutInitial]
            );

            if (donnees.type_demande === 'ARRET_MALADIE') {
                await clientDB.query(
                    "INSERT INTO taches_actions (id_salon, titre, description, source) VALUES ($1, $2, $3, 'IA')",
                    [id_salon, `URGENCE : Arrêt maladie de ${donnees.nom_employe}`, `${donnees.nom_employe} a déclaré un arrêt du ${donnees.date_debut} au ${donnees.date_fin} par email. L'agenda a été bloqué automatiquement.`]
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
        const filtreEmploye = req.user.role === 'employe';
        const query = `
            SELECT 
                TO_CHAR(t.date_creation, 'YYYY-MM-DD') as date_brute,
                TO_CHAR(t.date_creation, 'DD/MM/YYYY') as date_formattee,
                EXTRACT(YEAR FROM t.date_creation) as annee, 
                EXTRACT(MONTH FROM t.date_creation) as mois, 
                SUM(t.total_ttc) as total_jour
            FROM tickets t 
            WHERE t.id_salon = $1 AND t.statut != 'ANNULE' ${filtreEmploye ? 'AND t.id_employe = $2' : ''}
            GROUP BY date_brute, date_formattee, annee, mois
            ORDER BY date_brute DESC
        `;
        const params = filtreEmploye ? [req.user.id_salon, req.user.id_employe] : [req.user.id_salon];
        const result = await pool.query(query, params);

        const historique = {};
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

        result.rows.forEach(row => {
            const annee = row.annee.toString();
            const moisNom = moisNoms[parseInt(row.mois) - 1];

            if (!historique[annee]) historique[annee] = {};
            if (!historique[annee][moisNom]) historique[annee][moisNom] = { total_mensuel: 0, jours: [] };

            historique[annee][moisNom].total_mensuel += parseFloat(row.total_jour);
            historique[annee][moisNom].jours.push({
                date_brute: row.date_brute,
                date_formattee: row.date_formattee,
                total: parseFloat(row.total_jour)
            });
        });

        const formattedData = Object.keys(historique).sort((a, b) => b - a).map(annee => ({
            annee: annee,
            mois: Object.keys(historique[annee]).map(mois => ({
                nom: mois,
                total_mensuel: historique[annee][mois].total_mensuel,
                jours: historique[annee][mois].jours
            }))
        }));

        res.json(formattedData); 
    } catch (erreur) { 
        res.status(500).json({ erreur: "Erreur Historique Compta" }); 
    }
});


// =========================================================================
// --- EXPORT PDF : BILAN JOURNALIER ---
// =========================================================================
app.get('/api/export-pdf/:date', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const dateCible = req.params.date;
    const estEmploye = req.user.role === 'employe';
    const id_employe = req.user.id_employe;
    try {
        const filtreEmploye = estEmploye ? ' AND t.id_employe = $3' : '';
        const paramsVentes = estEmploye ? [id_salon, dateCible, id_employe] : [id_salon, dateCible];
        const ventesResult = await pool.query(`
            SELECT 
                t.id_ticket, TO_CHAR(t.date_creation, 'HH24:MI') as heure, t.total_ttc, t.methode_paiement,
                COALESCE(e.nom, 'Inconnu') as employe,
                (SELECT string_agg(COALESCE(lt.nom_article_snapshot, c.nom), ', ') FROM lignes_ticket lt LEFT JOIN catalogue c ON lt.id_article = c.id_article WHERE lt.id_ticket = t.id_ticket) as prestations
            FROM tickets t
            LEFT JOIN employes e ON t.id_employe = e.id_employe
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE'${filtreEmploye}
            ORDER BY t.date_creation ASC
        `, paramsVentes);

        const caResult = await pool.query(`SELECT COALESCE(SUM(t.total_ttc), 0) as ca_total FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE'${filtreEmploye}`, paramsVentes);
        const caTotal = parseFloat(caResult.rows[0].ca_total);

        const clotureRes = await pool.query(`SELECT ferme_par FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2`, [id_salon, dateCible]);
        const cloturePar = clotureRes.rowCount > 0 ? clotureRes.rows[0].ferme_par : 'Non spécifié';

        // Clients reçus, commission et produits vendus (bilan individuel employé, ou salon entier pour le gérant)
        const filtreEmployeCommissions = estEmploye ? ' AND c.id_employe = $3' : '';
        const paramsStats = estEmploye ? [id_salon, dateCible, id_employe] : [id_salon, dateCible];
        const statsResult = await pool.query(`
            SELECT
                COUNT(DISTINCT c.id_ticket) as nb_clients,
                COALESCE(SUM(c.montant_commission), 0) as commission_totale,
                COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as nb_produits_vendus
            FROM commissions c
            WHERE c.id_salon = $1 AND DATE(c.date_creation) = $2${filtreEmployeCommissions}
        `, paramsStats);
        const nbClients = parseInt(statsResult.rows[0].nb_clients) || 0;
        const commissionTotale = parseFloat(statsResult.rows[0].commission_totale) || 0;
        const nbProduitsVendus = parseInt(statsResult.rows[0].nb_produits_vendus) || 0;

        // Configuration PDFKit (A4, Gestion des pages)
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Bilan_${dateCible}.pdf"`);
        doc.pipe(res);

        // --- PALETTE DE COULEURS (Thème STACK) ---
        const THEME_COLOR = '#00B4D8'; // Cyan vif
        const TEXT_DARK = '#1f2937';
        const TEXT_LIGHT = '#6b7280';
        const LINE_COLOR = '#e5e7eb';

        // --- HEADER ---
        try {
            doc.image('./IMG_7089.PNG', doc.page.width - 150, 40, { width: 100 });
        } catch(e) {
            doc.font('Helvetica-Bold').fontSize(22).fillColor(TEXT_DARK).text('STACK', doc.page.width - 150, 50, { align: 'right' });
        }

        // Titre Principal
        doc.font('Helvetica-Bold').fontSize(36).fillColor(THEME_COLOR).text('Bilan Journalier', 50, 50);
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT).text(`Date de clôture : ${new Date(dateCible).toLocaleDateString('fr-FR')}`, 50, 95);
        doc.moveDown(4);

        // --- FONCTIONS UTILITAIRES DE DESSIN ---
        const drawTableRow = (col1, col2, col3, isHeader = false, isTotal = false) => {
            if (doc.y > 750) doc.addPage();
            const startY = doc.y;
            
            doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(col1, 50, startY, { width: 50 });
            doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(col2, 110, startY, { width: 330 });
            doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? THEME_COLOR : TEXT_DARK).text(col3, 450, startY, { width: 95, align: 'right' });
            
            const currentY = doc.y;
            if (!isHeader && !isTotal) {
                doc.moveTo(50, currentY + 5).lineTo(545, currentY + 5).lineWidth(0.5).strokeColor(LINE_COLOR).stroke();
            }
            doc.y = currentY + 12;
        };

        const drawSectionHeader = (title) => {
            if (doc.y > 700) doc.addPage();
            doc.moveDown(1.5);
            doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME_COLOR).text(title.toUpperCase(), 50, doc.y);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor(THEME_COLOR).stroke();
            doc.moveDown(0.5);
        };

   
        // --- SECTION : RÉCAPITULATIF FINANCIER ---
        drawSectionHeader(estEmploye ? 'Mon Récapitulatif' : 'Récapitulatif Global');
        drawTableRow('', 'Total Encaissé', `${caTotal.toFixed(2)} €`, false, true);
        if (!estEmploye) drawTableRow('', 'Clôturé par', cloturePar, false, true);
        drawTableRow('', estEmploye ? 'Clients servis' : 'Clients reçus', `${nbClients}`, false, true);
        drawTableRow('', 'Produits vendus', `${nbProduitsVendus}`, false, true);
        if (estEmploye) drawTableRow('', 'Ma commission du jour', `${commissionTotale.toFixed(2)} €`, false, true);

        // --- SECTION : DÉTAIL DES VENTES (LOI NF525) ---
        drawSectionHeader('Détail des Ventes (Loi NF525)');
        drawTableRow('HEURE', 'DÉTAIL (TICKET, PRESTATIONS, PAIEMENT)', 'MONTANT TTC', true);

        if (ventesResult.rowCount === 0) {
            doc.moveDown(0.5);
            doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune vente enregistrée ce jour-là.', 50, doc.y);
        } else {
            ventesResult.rows.forEach(v => {
                const description = `Ticket #${v.id_ticket} - ${v.prestations} (Paiement: ${v.methode_paiement}, par ${v.employe})`;
                drawTableRow(v.heure, description, `${parseFloat(v.total_ttc).toFixed(2)} €`);
            });
        }

        // --- FOOTER ---
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill(THEME_COLOR);
        }
        doc.end();
    } catch (erreur) { 
        console.error(erreur);
        res.status(500).send("Erreur lors de la génération du PDF journalier."); 
    }
});

// =========================================================================
// --- EXPORT PDF : LIASSE MENSUELLE ---
// =========================================================================
app.get('/api/export-pdf', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDayOfMonth);
        const dateFinStr = formatYMD(lastDayOfMonth);

        const configResult = await pool.query('SELECT email_reception_factures, mot_de_passe_app_email, nom_salon FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonConfig = configResult.rowCount > 0 ? configResult.rows[0] : null;
        
        const facturesResult = await pool.query(`SELECT nom_fournisseur, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND DATE(date_traitement) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const caParMethodeResult = await pool.query(`SELECT methode_paiement, COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
        const rhResult = await pool.query(`SELECT e.nom, COALESCE(SUM(c.montant_commission), 0) as total_prime FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) BETWEEN $2 AND $3 WHERE e.id_salon = $1 GROUP BY e.nom`, [id_salon, dateDebutStr, dateFinStr]);
        
        const absencesResult = await pool.query(`
            SELECT a.type_demande, a.nature_absence, a.date_debut, a.date_fin, a.fichier_cle_r2, e.nom as nom_employe
            FROM absences_employes a
            JOIN employes e ON a.id_employe = e.id_employe
            WHERE a.id_salon = $1 AND a.statut = 'VALIDE'
              AND a.date_debut <= $3 AND a.date_fin >= $2
            ORDER BY e.nom ASC, a.date_debut ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        const caTotal = parseFloat(caResult.rows[0].ca_total || 0);

        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            const pdfData = Buffer.concat(buffers); 
            if (salonConfig && salonConfig.email_reception_factures && salonConfig.mot_de_passe_app_email) {
                try {
                    let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: salonConfig.email_reception_factures, pass: dechiffrer(salonConfig.mot_de_passe_app_email) } });
                    await transporter.sendMail({
                        from: `"${salonConfig.nom_salon || 'SaaS Caisse'}" <${salonConfig.email_reception_factures}>`, 
                        to: salonConfig.email_reception_factures, 
                        subject: '📊 Liasse Comptable Mensuelle', 
                        text: 'Bonjour, \nVeuillez trouver en pièce jointe la liasse comptable du mois avec le détail des encaissements.',
                        attachments: [{ filename: `Liasse_Comptable_${Date.now()}.pdf`, content: pdfData }]
                    });
                } catch (emailError) { console.error("Erreur email: ", emailError); } 
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Liasse_Comptable.pdf"`);
        doc.pipe(res);

        const THEME_COLOR = '#00B4D8';
        const TEXT_DARK = '#1f2937';
        const TEXT_LIGHT = '#6b7280';
        const LINE_COLOR = '#e5e7eb';

        try {
            doc.image('./IMG_7089.PNG', doc.page.width - 150, 40, { width: 100 });
        } catch(e) {
            doc.font('Helvetica-Bold').fontSize(22).fillColor(TEXT_DARK).text('STACK', doc.page.width - 150, 50, { align: 'right' });
        }

        doc.font('Helvetica-Bold').fontSize(36).fillColor(THEME_COLOR).text('Liasse Mensuelle', 50, 50);
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} - ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 50, 95);
        doc.moveDown(4);

        const drawTableRow = (col1, col2, isHeader = false, isTotal = false) => {
            if (doc.y > 750) doc.addPage();
            const y = doc.y;
            const text1 = col1 != null ? String(col1) : '';
            const text2 = col2 != null ? String(col2) : '';
            
            doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(text1, 50, y);
            doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(text2, 450, y, { width: 95, align: 'right' });
            
            if (!isHeader && !isTotal) {
                doc.moveTo(50, y + 14).lineTo(545, y + 14).lineWidth(0.5).strokeColor(LINE_COLOR).stroke();
            }
            doc.y += 18;
        };

        const drawSectionHeader = (title) => {
            if (doc.y > 700) doc.addPage();
            doc.moveDown(1.5);
            doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME_COLOR).text(String(title || '').toUpperCase(), 50, doc.y);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor(THEME_COLOR).stroke();
            doc.moveDown(0.5);
        };

        drawSectionHeader('Chiffre d\'Affaires & Encaissements');
        drawTableRow('MÉTHODE DE PAIEMENT', 'MONTANT', true);
        caParMethodeResult.rows.forEach(m => {
            drawTableRow(m.methode_paiement || 'Autre', `${parseFloat(m.total || 0).toFixed(2)} €`);
        });
        doc.moveDown(0.5);
        drawTableRow('Total Chiffre d\'Affaires', `${caTotal.toFixed(2)} €`, false, true);

        drawSectionHeader('Dépenses (Factures Fournisseurs)');
        drawTableRow('FOURNISSEUR / DATE', 'MONTANT TTC', true);
        let totalDepenses = 0;
        if (facturesResult.rowCount === 0) { 
            doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune facture scannée ce mois-ci.', 50, doc.y);
            doc.moveDown(1);
        } else { 
            facturesResult.rows.forEach(f => { 
                drawTableRow(`${f.nom_fournisseur || 'Facture'} (${f.date || ''})`, `${parseFloat(f.montant_ttc || 0).toFixed(2)} €`);
                totalDepenses += parseFloat(f.montant_ttc || 0); 
            }); 
        }
        doc.moveDown(0.5);
        drawTableRow('Total Dépenses', `${totalDepenses.toFixed(2)} €`, false, true);

        drawSectionHeader('Commissions Employés');
        drawTableRow('COLLABORATEUR', 'PRIME DUE', true);
        let totalPrimes = 0;
        if (rhResult.rowCount === 0) { 
            doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune commission enregistrée.', 50, doc.y);
        } else { 
            rhResult.rows.forEach(c => { 
                drawTableRow(c.nom || 'Employé', `${parseFloat(c.total_prime || 0).toFixed(2)} €`);
                totalPrimes += parseFloat(c.total_prime || 0); 
            }); 
        }
        doc.moveDown(0.5);
        drawTableRow('Total Primes Équipe', `${totalPrimes.toFixed(2)} €`, false, true);

        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(24).fillColor(THEME_COLOR).text('Variables de Paie & Absences', 50, 50);
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} - ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 50, 80);
        doc.moveDown(3);

        drawSectionHeader('Registre des Absences Validées');
        if (absencesResult.rowCount === 0) {
            doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune absence enregistrée sur cette période.', 50, doc.y);
        } else {
            drawTableRow('EMPLOYÉ & NATURE', 'DATES', true);
            absencesResult.rows.forEach(abs => {
                const natureStr = abs.type_demande === 'ARRET_MALADIE' ? `Arrêt (${abs.nature_absence || ''})` : `Congé (${abs.nature_absence || ''})`;
                const docsFournis = abs.fichier_cle_r2 ? " (Justificatif fourni)" : "";
                let dateD = ''; let dateF = '';
                try { dateD = new Date(abs.date_debut).toLocaleDateString('fr-FR'); } catch(e){}
                try { dateF = new Date(abs.date_fin).toLocaleDateString('fr-FR'); } catch(e){}
                drawTableRow(`${abs.nom_employe || ''} - ${natureStr.replace('_', ' ')}${docsFournis}`, `Du ${dateD} au ${dateF}`);
            });
        }

        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill(THEME_COLOR);
        }

        doc.end();
    } catch (erreur) { 
        console.error(erreur);
        res.status(500).send("Erreur lors de la génération du PDF mensuel."); 
    }
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
                            
                            envoyerNotificationPush(salon.id_salon, 'gerant', {
                                title: "🤖 STACK IA a détecté une info !",
                                body: `L'IA a lu un e-mail et vous a préparé une action : ${t.type_tache || t.type}.`,
                                url: '/?tab=agenda'
                            });
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

app.post('/api/protocoles', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    const { nom_prestation, etapes, medias, tags, delai_livraison_jours, ingredients, temps_nettoyage_minutes } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const protoRes = await clientDB.query(
            `INSERT INTO protocoles (id_salon, nom_prestation, etapes, medias, tags, delai_livraison_jours, temps_nettoyage_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_protocole`,
            [req.user.id_salon, nom_prestation, JSON.stringify(etapes || []), JSON.stringify(medias || {}), JSON.stringify(tags || []), delai_livraison_jours || 3, temps_nettoyage_minutes || 0]
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

app.put('/api/protocoles/:id', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    const { nom_prestation, etapes, medias, tags, delai_livraison_jours, ingredients, temps_nettoyage_minutes } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        // 1. Mise à jour de la fiche (AVEC VÉRIFICATION DES DROITS)
        const updateRes = await clientDB.query(
            `UPDATE protocoles SET nom_prestation = $1, etapes = $2, medias = $3, tags = $4, delai_livraison_jours = $5, temps_nettoyage_minutes = $8 WHERE id_protocole = $6 AND id_salon = $7 RETURNING id_protocole`,
            [nom_prestation, JSON.stringify(etapes || []), JSON.stringify(medias || {}), JSON.stringify(tags || []), delai_livraison_jours || 3, req.params.id, req.user.id_salon, temps_nettoyage_minutes || 0]
        );

        // 🚨 SÉCURITÉ (IDOR) : Si l'update ne touche aucune ligne, le protocole n'existe pas ou appartient à un autre salon.
        if (updateRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            return res.status(404).json({ erreur: "Protocole introuvable ou accès refusé." });
        }

        // 2. Remplacement des ingrédients de la recette (Sécurisé car la propriété est confirmée au-dessus)
        await clientDB.query(`DELETE FROM recettes_articles WHERE id_protocole = $1`, [req.params.id]);
        if (ingredients && ingredients.length > 0) {
            for (let ing of ingredients) {
                await clientDB.query(
                    `INSERT INTO recettes_articles (id_protocole, id_article, quantite_necessaire) VALUES ($1, $2, $3)`,
                    [req.params.id, ing.id_article, ing.quantite_necessaire]
                );
            }
        }
        
        await clientDB.query('COMMIT');
        res.json({ message: "Protocole modifié avec succès !" });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: "Erreur modification protocole." });
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
// Compare deux numéros en ne gardant que les 9 derniers chiffres : 0612345678, +33612345678 et 0033612345678 deviennent identiques
const normaliserTelephone = (tel) => String(tel || '').replace(/\D/g, '').slice(-9);

async function executerRobotAvisSatisfaction() {
    let salons;
    try {
        salons = (await pool.query("SELECT * FROM configuration_salon WHERE brevo_api_key IS NOT NULL AND brevo_api_key != ''")).rows;
    } catch (e) { console.error("[ROBOT-AVIS] Impossible de charger les salons :", e); return; }

    for (let salon of salons) {
        try {
            // --- Détection : RDV terminés depuis 1 à 2h, jamais venus auparavant (comparaison sur les 9 derniers chiffres du numéro) ---
            const rdvTermines = await pool.query(`
                SELECT r.id_rdv, r.nom_client, r.telephone_client, r.id_employe
                FROM rendez_vous r
                WHERE r.id_salon = $1
                  AND r.telephone_client IS NOT NULL AND r.telephone_client != ''
                  AND (r.date_heure_debut + (r.duree_minutes || ' minutes')::interval) BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour'
                  AND NOT EXISTS (SELECT 1 FROM avis_demandes a WHERE a.id_rdv = r.id_rdv)
                  AND NOT EXISTS (SELECT 1 FROM sms_opt_out o WHERE o.id_salon = $1 AND o.telephone = RIGHT(regexp_replace(r.telephone_client, '\\D', '', 'g'), 9))
                  AND NOT EXISTS (
                      SELECT 1 FROM tickets t JOIN clients c ON t.id_client = c.id_client
                      WHERE t.id_salon = $1 AND t.statut = 'VALIDE'
                        AND RIGHT(regexp_replace(c.telephone, '\\D', '', 'g'), 9) = RIGHT(regexp_replace(r.telephone_client, '\\D', '', 'g'), 9)
                  )
            `, [salon.id_salon]);

            for (let rdv of rdvTermines.rows) {
                try {
                    const tokenAvis = crypto.randomBytes(24).toString('hex');
                    await pool.query(
                        `INSERT INTO avis_demandes (id_salon, telephone, prenom, token, id_rdv, id_employe, statut, date_prevue) VALUES ($1, $2, $3, $4, $5, $6, 'EN_ATTENTE', NOW())`,
                        [salon.id_salon, rdv.telephone_client, (rdv.nom_client || '').split(' ')[0], tokenAvis, rdv.id_rdv, rdv.id_employe]
                    );
                } catch (e) { console.error(`[ROBOT-AVIS] Échec enregistrement RDV ${rdv.id_rdv} (salon ${salon.id_salon}) :`, e); }
            }

            // --- Envoi : demandes (RDV ou caisse) arrivées à échéance, et expirées au-delà de 30 jours ---
            const avisAEnvoyer = await pool.query(`SELECT * FROM avis_demandes WHERE id_salon = $1 AND statut = 'EN_ATTENTE' AND date_prevue <= NOW() AND date_creation > NOW() - INTERVAL '30 days'`, [salon.id_salon]);
            for (let demande of avisAEnvoyer.rows) {
                try {
                    const dejaOptOut = await pool.query('SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = $2', [salon.id_salon, normaliserTelephone(demande.telephone)]);
                    if (dejaOptOut.rowCount > 0) { await pool.query(`UPDATE avis_demandes SET statut = 'ANNULE' WHERE id_demande = $1`, [demande.id_demande]); continue; }

                    const lienAvis = `https://app-salon-caiss.onrender.com/avis/${demande.token}`;
                    const texteAvis = `Bonjour ${demande.prenom || ''}, merci pour votre première visite chez ${salon.nom_salon} ! Qu'avez-vous pensé de votre prestation ? Donnez votre avis ici : ${lienAvis}`;
                    await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, demande.telephone, texteAvis);
                    await pool.query(`UPDATE avis_demandes SET statut = 'ENVOYE' WHERE id_demande = $1`, [demande.id_demande]);
                } catch (e) { console.error(`[ROBOT-AVIS] Échec envoi demande ${demande.id_demande} (salon ${salon.id_salon}) :`, e); }
            }
        } catch (e) { console.error(`[ROBOT-AVIS] Échec traitement salon ${salon.id_salon} :`, e); }
    }
}

async function executerRobotMarketingEtPredictif() {
    try {
        // CORRECTION 1 : On récupère TOUS les salons (même ceux qui n'ont pas configuré les SMS)
        const salons = await pool.query("SELECT * FROM configuration_salon");
        
        for (let salon of salons.rows) {
            const hasBrevo = salon.brevo_api_key && salon.brevo_api_key.trim() !== '';
            const delaiFixe = salon.fidelite_delai_sms && salon.fidelite_delai_sms > 0 ? salon.fidelite_delai_sms : 60;

            // --- 1. GESTION DES SMS (S'exécute uniquement si Brevo est configuré) ---
            if (hasBrevo) {
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

                    let seuilRelance = (client.nb_ecarts > 0 && client.moyenne_jours > 0) ? parseFloat(client.moyenne_jours) * 1.2 : delaiFixe;

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
                        await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name, client.telephone, `Joyeux anniversaire ${client.prenom || client.nom} ! 🎉 Venez fêter ça chez nous cette semaine. Prenez RDV : ${salon.lien_google_maps}`);
                    }
                }
            }
            // =================================================================
            // --- 2. MOTEUR PRÉDICTIF D'INVENTAIRE GLOBAL (SMART AGGREGATION) ---
            // =================================================================
            
            // Cette requête SQL intelligente calcule la somme totale requise par produit 
            // pour TOUS les RDV des 14 prochains jours, et ne sort que les articles en déficit.
            const rupturesPredictives = await pool.query(`
                SELECT 
                    c.id_article,
                    c.nom,
                    c.stock_actuel,
                    c.delai_livraison_jours,
                    SUM(ra.quantite_necessaire) as total_besoin,
                    MIN(r.date_heure_debut) as date_premier_besoin
                FROM rendez_vous r
                JOIN protocoles p ON p.id_salon = $1 AND TRIM(p.nom_prestation) ILIKE TRIM(r.prestation)
                JOIN recettes_articles ra ON ra.id_protocole = p.id_protocole
                JOIN catalogue c ON c.id_article = ra.id_article
                WHERE r.id_salon = $1 
                  AND r.date_heure_debut BETWEEN NOW() AND NOW() + INTERVAL '14 days'
                GROUP BY c.id_article, c.nom, c.stock_actuel, c.delai_livraison_jours
                HAVING c.stock_actuel < SUM(ra.quantite_necessaire)
            `, [salon.id_salon]);

            console.log(`[ROBOT-STOCK] Salon #${salon.id_salon} : ${rupturesPredictives.rowCount} produit(s) en rupture prédictive globale.`);

            for (let rupture of rupturesPredictives.rows) {
                const stockActuel = parseFloat(rupture.stock_actuel);
                const besoinTotal = parseFloat(rupture.total_besoin);
                const quantiteACommander = besoinTotal - stockActuel;
                
                // Calcul du délai : Date du PREMIER rdv impacté - Délai livraison - 1 jour marge
                const dateAlerte = new Date(rupture.date_premier_besoin);
                dateAlerte.setDate(dateAlerte.getDate() - (rupture.delai_livraison_jours || 3) - 1);

                // Formatage exact demandé
                const titreAlerte = `Commander ${quantiteACommander}x ${rupture.nom}`;
                const descAlerte = `Rupture prédictive : Il faut un total de ${besoinTotal} unité(s) pour assurer l'ensemble des RDV des 14 prochains jours, mais vous n'avez que ${stockActuel} en stock. Échéance calculée avec le délai fournisseur (${rupture.delai_livraison_jours || 3}j) + 1j de marge.`;

                // On évite d'inonder le gérant si la tâche existe déjà pour CE produit en mode A_FAIRE
                const exist = await pool.query(`SELECT 1 FROM taches_actions WHERE id_salon = $1 AND titre = $2 AND statut = 'A_FAIRE'`, [salon.id_salon, titreAlerte]);
                
                if (exist.rowCount === 0) {
                    await pool.query(
                        `INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'IA')`, 
                        [salon.id_salon, titreAlerte, descAlerte, dateAlerte]
                    );
                    console.log(`[ROBOT-STOCK] ✅ Alerte insérée : "${titreAlerte}" (échéance ${dateAlerte.toISOString().slice(0,10)})`);
                }
            }

            // --- 3. Alertes Tâches Urgentes (Centre d'Action) ---
            const tachesUrgentes = await pool.query(`SELECT titre, date_echeance FROM taches_actions WHERE id_salon = $1 AND statut = 'A_FAIRE' AND date_echeance <= NOW() + INTERVAL '2 days'`, [salon.id_salon]);
            if (tachesUrgentes.rowCount > 0) {
                
                envoyerNotificationPush(salon.id_salon, 'gerant', {
                    title: " Actions Urgentes",
                    body: `Vous avez ${tachesUrgentes.rowCount} tâche(s) arrivant à échéance (ex: ${tachesUrgentes.rows[0].titre}).`,
                    url: '/?tab=actions'
                });
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

                if (salon.alertes_sms_actives && salon.telephone_gerant && salon.telephone_gerant.trim() !== '' && hasBrevo) {
                    const smsTexte = `⚠️ STACK : Vous avez ${tachesUrgentes.rowCount} action(s) urgente(s) en attente (ex: ${tachesUrgentes.rows[0].titre}). Connectez-vous pour les traiter !`;
                    await envoyerSMS(salon.brevo_api_key, salon.sms_sender_name || 'STACK', salon.telephone_gerant, smsTexte);
                }
            }
            
        } 
    } catch (err) {
        console.error("Erreur Robot Marketing/Prédictif:", err);
    }
}

// =========================================================================
// --- ROBOT D'ENVOI AU COMPTABLE (CRON JOB) ---
// =========================================================================
async function executerEnvoiComptable() {
    try {
        const salons = await pool.query("SELECT id_salon, nom_salon, email_comptable, jour_envoi_bilan, email_reception_factures, mot_de_passe_app_email, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva FROM configuration_salon WHERE email_comptable IS NOT NULL AND email_comptable != ''");
        const today = new Date();
        const currentDay = today.getDate();
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        for (let salon of salons.rows) {
            const jourCible = salon.jour_envoi_bilan || 1;
            const shouldSend = currentDay === jourCible || (jourCible > lastDayOfMonth && currentDay === lastDayOfMonth);
            
            if (shouldSend && salon.email_reception_factures && salon.mot_de_passe_app_email) {
                const id_salon = salon.id_salon;
                
                const firstDayPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                
                const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const dateDebutStr = formatYMD(firstDayPrevMonth);
                const dateFinStr = formatYMD(lastDayPrevMonth);

                const facturesResult = await pool.query(`SELECT nom_fournisseur, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND DATE(date_traitement) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
                const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
                const caParMethodeResult = await pool.query(`SELECT methode_paiement, COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
                const rhResult = await pool.query(`SELECT e.nom, COALESCE(SUM(c.montant_commission), 0) as total_prime FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) BETWEEN $2 AND $3 WHERE e.id_salon = $1 GROUP BY e.nom`, [id_salon, dateDebutStr, dateFinStr]);
                const absencesResult = await pool.query(`SELECT a.type_demande, a.nature_absence, a.date_debut, a.date_fin, a.fichier_cle_r2, e.nom as nom_employe FROM absences_employes a JOIN employes e ON a.id_employe = e.id_employe WHERE a.id_salon = $1 AND a.statut = 'VALIDE' AND a.date_debut <= $3 AND a.date_fin >= $2 ORDER BY e.nom ASC, a.date_debut ASC`, [id_salon, dateDebutStr, dateFinStr]);

                const caTotal = parseFloat(caResult.rows[0].ca_total);

                // --- GÉNÉRATION DU FEC EN ARRIÈRE-PLAN ---
                let fecContent = null;
                try {
                    const ticketsFecRes = await pool.query(`
                        SELECT t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.methode_paiement, t.total_ttc, lt.total_ligne_ttc, lt.taux_tva_snapshot, COALESCE(lt.nom_article_snapshot, 'Article') as nom_article, COALESCE(c.type_article, 'PRESTATION') as type_article, cc.date_cloture
                        FROM tickets t
                        JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket
                        LEFT JOIN catalogue c ON lt.id_article = c.id_article
                        LEFT JOIN clotures_caisse cc ON cc.id_salon = t.id_salon AND cc.date_cloture = DATE(t.date_creation)
                        WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND DATE(t.date_creation) BETWEEN $2 AND $3
                        ORDER BY t.date_creation ASC, t.id_ticket ASC
                    `, [id_salon, dateDebutStr, dateFinStr]);

                    let totalDebit = 0, totalCredit = 0;
                    const lignesFec = [];
                    const ticketsMap = {};

                    ticketsFecRes.rows.forEach(r => {
                        if (!ticketsMap[r.id_ticket]) ticketsMap[r.id_ticket] = { id_ticket: r.id_ticket, numero: r.numero_ticket_caisse, date: r.date_creation, date_valid: r.date_cloture || r.date_creation, methode: r.methode_paiement, total_ttc: parseFloat(r.total_ttc), lignes: [] };
                        ticketsMap[r.id_ticket].lignes.push(r);
                    });

                    const formatDateFEC = (date) => { const d = new Date(date); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
                    const formatMnt = (mnt) => Number(mnt).toFixed(2).replace('.', ',');

                    for (const t of Object.values(ticketsMap)) {
                        const dEcr = formatDateFEC(t.date), dVal = formatDateFEC(t.date_valid), pRef = t.numero, eNum = `VT-${t.id_ticket}`;
                        const cPaiement = t.methode === 'ESPECES' ? (salon.compte_caisse || '530000') : (salon.compte_banque || '512000');
                        const lPaiement = t.methode === 'ESPECES' ? 'Caisse' : 'Banque';

                        lignesFec.push({ JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: eNum, EcritureDate: dEcr, CompteNum: cPaiement, CompteLib: lPaiement, CompAuxNum: '', CompAuxLib: '', PieceRef: pRef, PieceDate: dEcr, EcritureLib: `Encaissement ${pRef}`, Debit: formatMnt(t.total_ttc), Credit: '', EcritureLet: '', DateLet: '', ValidDate: dVal, Montantdevise: '', Idevise: '' });
                        totalDebit += Math.round(t.total_ttc * 100);

                        for (const l of t.lignes) {
                            const lTTC = parseFloat(l.total_ligne_ttc), tTVA = parseFloat(l.taux_tva_snapshot) || 20.00;
                            const lHT = Number((lTTC / (1 + tTVA / 100)).toFixed(2)), lTVA = Number((lTTC - lHT).toFixed(2));
                            const cVente = l.type_article === 'PRODUIT_REVENTE' ? (salon.compte_produits || '707000') : (salon.compte_prestations || '706000');
                            const lVente = l.type_article === 'PRODUIT_REVENTE' ? 'Vente Produit' : 'Vente Prestation';
                            const nNet = (l.nom_article || 'Article').substring(0, 30).replace(/\t/g, ' ').replace(/\n/g, ' ');

                            if (lHT > 0) { lignesFec.push({ JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: eNum, EcritureDate: dEcr, CompteNum: cVente, CompteLib: lVente, CompAuxNum: '', CompAuxLib: '', PieceRef: pRef, PieceDate: dEcr, EcritureLib: nNet, Debit: '', Credit: formatMnt(lHT), EcritureLet: '', DateLet: '', ValidDate: dVal, Montantdevise: '', Idevise: '' }); totalCredit += Math.round(lHT * 100); }
                            if (lTVA > 0) { lignesFec.push({ JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: eNum, EcritureDate: dEcr, CompteNum: (salon.compte_tva || '445710'), CompteLib: `TVA Collectee ${tTVA}%`, CompAuxNum: '', CompAuxLib: '', PieceRef: pRef, PieceDate: dEcr, EcritureLib: `TVA ${nNet}`.substring(0,30), Debit: '', Credit: formatMnt(lTVA), EcritureLet: '', DateLet: '', ValidDate: dVal, Montantdevise: '', Idevise: '' }); totalCredit += Math.round(lTVA * 100); }
                        }
                    }

                    if (totalDebit === totalCredit && lignesFec.length > 0) {
                        const h = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
                        fecContent = h.join('\t') + '\r\n' + lignesFec.map(row => h.map(col => row[col]).join('\t')).join('\r\n') + '\r\n';
                    }
                } catch(e) { console.error("Erreur génération FEC Robot:", e); }

                // --- GÉNÉRATION DU PDF ET ENVOI ---
                const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
                let buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                
                doc.on('end', async () => {
                    const pdfData = Buffer.concat(buffers); 
                    try {
                        let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: salon.email_reception_factures, pass: dechiffrer(salon.mot_de_passe_app_email) } });
                        const moisAnnee = firstDayPrevMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                        
                        const attachments = [
                            { filename: `Liasse_Comptable_${salon.nom_salon}_${moisAnnee.replace(' ', '_')}.pdf`, content: pdfData }
                        ];
                        
                        if (fecContent) {
                            attachments.push({
                                filename: `FEC_${salon.id_salon}_${dateDebutStr.replace(/-/g, '')}_${dateFinStr.replace(/-/g, '')}.txt`,
                                content: fecContent,
                                contentType: 'text/plain; charset=windows-1252'
                            });
                        }

                        let textBody = `Bonjour,\n\nVeuillez trouver en pièce jointe la liasse comptable de ${salon.nom_salon} pour la période du ${firstDayPrevMonth.toLocaleDateString('fr-FR')} au ${lastDayPrevMonth.toLocaleDateString('fr-FR')}.\n\n`;
                        if (fecContent) textBody += `Le fichier FEC (Fichier des Écritures Comptables) est également joint, prêt à être importé dans votre logiciel (format TXT, partie double équilibrée).\n\n`;
                        textBody += `Cordialement,`;

                        await transporter.sendMail({
                            from: `"${salon.nom_salon}" <${salon.email_reception_factures}>`, 
                            to: salon.email_comptable, 
                            subject: `📊 Liasse Comptable Mensuelle - ${salon.nom_salon} (${moisAnnee})`, 
                            text: textBody,
                            attachments: attachments
                        });
                        console.log(`[CRON] Bilan mensuel & FEC envoyés au comptable pour le salon ${id_salon}`);
                    } catch (emailError) { console.error("Erreur envoi email comptable:", emailError); } 
                });

                const THEME_COLOR = '#00B4D8'; const TEXT_DARK = '#1f2937'; const TEXT_LIGHT = '#6b7280'; const LINE_COLOR = '#e5e7eb';
                try { doc.image('./IMG_7089.PNG', doc.page.width - 150, 40, { width: 100 }); } catch(e) { doc.font('Helvetica-Bold').fontSize(22).fillColor(TEXT_DARK).text('STACK', doc.page.width - 150, 50, { align: 'right' }); }

                doc.font('Helvetica-Bold').fontSize(36).fillColor(THEME_COLOR).text('Liasse Mensuelle', 50, 50);
                doc.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT).text(`Période : ${firstDayPrevMonth.toLocaleDateString('fr-FR')} - ${lastDayPrevMonth.toLocaleDateString('fr-FR')}`, 50, 95);
                doc.moveDown(4);

                const drawTableRow = (col1, col2, isHeader = false, isTotal = false) => {
                    const y = doc.y;
                    doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(col1, 50, y);
                    doc.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(isHeader ? 9 : 10).fillColor(isTotal ? TEXT_DARK : TEXT_LIGHT).text(col2, 450, y, { width: 95, align: 'right' });
                    if (!isHeader && !isTotal) { doc.moveTo(50, y + 14).lineTo(545, y + 14).lineWidth(0.5).strokeColor(LINE_COLOR).stroke(); }
                    doc.y += 18;
                };

                const drawSectionHeader = (title) => {
                    doc.moveDown(1.5);
                    doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME_COLOR).text(title.toUpperCase(), 50, doc.y);
                    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor(THEME_COLOR).stroke();
                    doc.moveDown(0.5);
                };

                drawSectionHeader('Chiffre d\'Affaires & Encaissements');
                drawTableRow('MÉTHODE DE PAIEMENT', 'MONTANT', true);
                caParMethodeResult.rows.forEach(m => drawTableRow(m.methode_paiement, `${parseFloat(m.total).toFixed(2)} €`));
                doc.moveDown(0.5); drawTableRow('Total Chiffre d\'Affaires', `${caTotal.toFixed(2)} €`, false, true);

                drawSectionHeader('Dépenses (Factures Fournisseurs)');
                drawTableRow('FOURNISSEUR / DATE', 'MONTANT TTC', true);
                let totalDepenses = 0;
                if (facturesResult.rowCount === 0) { doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune facture scannée ce mois.', 50, doc.y); doc.moveDown(1); } 
                else { facturesResult.rows.forEach(f => { drawTableRow(`${f.nom_fournisseur} (${f.date})`, `${parseFloat(f.montant_ttc).toFixed(2)} €`); totalDepenses += parseFloat(f.montant_ttc); }); }
                doc.moveDown(0.5); drawTableRow('Total Dépenses', `${totalDepenses.toFixed(2)} €`, false, true);

                drawSectionHeader('Commissions Employés');
                drawTableRow('COLLABORATEUR', 'PRIME DUE', true);
                let totalPrimes = 0;
                if (rhResult.rowCount === 0) { doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune commission enregistrée.', 50, doc.y); } 
                else { rhResult.rows.forEach(c => { drawTableRow(c.nom, `${parseFloat(c.total_prime).toFixed(2)} €`); totalPrimes += parseFloat(c.total_prime); }); }
                doc.moveDown(0.5); drawTableRow('Total Primes Équipe', `${totalPrimes.toFixed(2)} €`, false, true);

                doc.addPage();
                doc.font('Helvetica-Bold').fontSize(24).fillColor(THEME_COLOR).text('Variables de Paie & Absences', 50, 50);
                doc.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT).text(`Période : ${firstDayPrevMonth.toLocaleDateString('fr-FR')} - ${lastDayPrevMonth.toLocaleDateString('fr-FR')}`, 50, 80);
                doc.moveDown(3);

                drawSectionHeader('Registre des Absences Validées');
                if (absencesResult.rowCount === 0) { doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT_LIGHT).text('Aucune absence enregistrée sur cette période.', 50, doc.y); } 
                else {
                    drawTableRow('EMPLOYÉ & NATURE', 'DATES', true);
                    absencesResult.rows.forEach(abs => {
                        const natureStr = abs.type_demande === 'ARRET_MALADIE' ? `Arrêt (${abs.nature_absence})` : `Congé (${abs.nature_absence})`;
                        drawTableRow(`${abs.nom_employe} - ${natureStr.replace('_', ' ')}${abs.fichier_cle_r2 ? " (Justificatif fourni)" : ""}`, `Du ${new Date(abs.date_debut).toLocaleDateString('fr-FR')} au ${new Date(abs.date_fin).toLocaleDateString('fr-FR')}`);
                    });
                }

                const pages = doc.bufferedPageRange();
                for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill(THEME_COLOR); }
                doc.end();
            }
        }
    } catch (err) { console.error("Erreur Robot Comptable Automatique:", err); }
}

async function executerClotureFantome() {
    const clientDB = await pool.connect();
    try {
        const salons = await clientDB.query("SELECT id_salon FROM configuration_salon");
        for (let s of salons.rows) {
            const id_salon = s.id_salon;
            
            // On cherche tous les jours (avant aujourd'hui) ayant des tickets mais aucune clôture correspondante
            const joursNonClotures = await clientDB.query(`
                SELECT DISTINCT DATE(t.date_creation) as jour
                FROM tickets t
                WHERE t.id_salon = $1 
                  AND DATE(t.date_creation) < CURRENT_DATE
                  AND NOT EXISTS (
                      SELECT 1 FROM clotures_caisse c
                      WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
                  )
                ORDER BY jour ASC
            `, [id_salon]);

            for (let j of joursNonClotures.rows) {
                const dateACloturerStr = new Date(j.jour).toISOString().split('T')[0];
                
                try {
                    await clientDB.query('BEGIN');
                    const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalJour = caResult.rows[0].total;

                    const grandTotalResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) <= $2`, [id_salon, dateACloturerStr]);
                    const grandTotalPerpetuel = grandTotalResult.rows[0].total;

                    const dernierZ = await clientDB.query('SELECT signature_hash FROM clotures_caisse WHERE id_salon = $1 AND date_cloture < $2 ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1', [id_salon, dateACloturerStr]);
                    const hashPrecedent = dernierZ.rowCount > 0 && dernierZ.rows[0].signature_hash ? dernierZ.rows[0].signature_hash : 'GENESIS_Z';
                    const dateISO = new Date(j.jour); 
                    dateISO.setHours(23, 59, 59); // On scelle le robot à 23:59:59 de la veille
                    
                    const signature = crypto.createHash('sha256').update(`Z-${id_salon}-${totalJour}-${grandTotalPerpetuel}-${hashPrecedent}-${dateISO.toISOString()}`).digest('hex');

                    await clientDB.query(
                        'INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, 'Fermeture Automatique (Robot)']
                    );

                    await enregistrerJET(id_salon, 'CLOTURE_Z_AUTOMATIQUE', { date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, signature }, clientDB);
                    await clientDB.query('COMMIT');
                    console.log(`[ROBOT] Clôture fantôme réussie pour le salon ${id_salon} (Date: ${dateACloturerStr})`);
                } catch (e) {
                    await clientDB.query('ROLLBACK');
                    console.error(`[ROBOT] Erreur clôture fantôme salon ${id_salon}:`, e);
                }
            }
        }
    } catch (err) { console.error("Erreur Globale Robot Clôture:", err); } 
    finally { clientDB.release(); }
}

// Planification automatique
cron.schedule('0 3 * * *', () => { executerClotureFantome(); }); // Le filet de sécurité à 3h00 du matin !
cron.schedule('0 8 * * *', () => { executerEnvoiComptable(); }); 
cron.schedule('0 9 * * *', () => { executerRobotMarketingEtPredictif(); }); 
cron.schedule('*/10 9-19 * * *', () => { executerRobotAvisSatisfaction(); }); 
cron.schedule('0 4 * * *', () => { executerRobotAvisSatisfaction(); }); 

app.get('/api/admin/forcer-robot', async (req, res) => { 
    executerRobotComptable(); 
    executerClotureFantome();
    executerRobotMarketingEtPredictif();
    executerEnvoiComptable();
    res.json({ message: "Tous les robots (Compta, Fantôme, Prédictif & Envoi Bilan) sont lancés avec succès." }); 
});

// --- CHEAT CODE : VOYAGE DANS LE TEMPS (TESTS UNIQUEMENT) ---
app.get('/api/admin/time-travel/:id_salon', async (req, res) => {
    try {
        // On recule la date de fin d'essai à il y a 5 jours
        await pool.query(
            "UPDATE configuration_salon SET date_fin_essai = NOW() - INTERVAL '5 days' WHERE id_salon = $1", 
            [req.params.id_salon]
        );
        res.json({ message: `⏳ Voyage dans le temps réussi ! L'essai du salon #${req.params.id_salon} est maintenant expiré.` });
    } catch (e) { 
        res.status(500).json({ erreur: e.message }); 
    }
});

// =========================================================================
// --- GOD MODE (SUPER-ADMIN) ---
// =========================================================================
const verifierSuperAdmin = async (req, res, next) => {
    try {
        const userRes = await pool.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [req.user.id_salon]);
        if (userRes.rowCount === 0 || userRes.rows[0].email !== '2@gmail.com') {
            return res.status(403).json({ erreur: "Accès refusé. God mode uniquement." });
        }
        next();
    } catch (e) {
        return res.status(500).json({ erreur: "Erreur de vérification des droits admin." });
    }
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

app.delete('/api/superadmin/salons/:id', verifierToken, verifierSuperAdmin, async (req, res) => {
    const id = req.params.id;
    if (parseInt(id) === req.user.id_salon) return res.status(403).json({ erreur: "Impossible de supprimer votre propre salon fondateur." });
    
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        // Ordre de suppression calculé pour éviter les conflits de clés étrangères
        await clientDB.query('DELETE FROM jet_logs WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM commissions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM lignes_ticket WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM tickets WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM clotures_caisse WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM rendez_vous WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM absences_employes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM recettes_articles WHERE id_protocole IN (SELECT id_protocole FROM protocoles WHERE id_salon = $1)', [id]);
        await clientDB.query('DELETE FROM protocoles WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM catalogue WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM employes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM clients WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM avis_demandes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM taches_actions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM ia_taches_attente WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM factures_fournisseurs WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM push_subscriptions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM sms_opt_out WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM messages WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM utilisateurs WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM configuration_salon WHERE id_salon = $1', [id]);

        await clientDB.query('COMMIT');
        res.json({ message: `Le salon #${id} et toutes ses données ont été supprimés.` });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: "Erreur lors de la destruction du salon : " + e.message });
    } finally {
        clientDB.release();
    }
});


// Sentry v10 : On utilise la nouvelle fonction dédiée
if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
}

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`✅ API Multi-Tenant LÉGALE démarrée sur le port ${PORT}`));
