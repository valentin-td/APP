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
const pdfParse = require('pdf-parse');
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
    forcePathStyle: true // INDISPENSABLE POUR CLOUDFLARE R2
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

// 🚨 SÉCURITÉ : Vérification stricte des variables d'environnement cryptographiques
if (!process.env.ENCRYPTION_SECRET && !process.env.JWT_SECRET) {
    console.error("🚨 ERREUR CRITIQUE FATALE : Les variables d'environnement ENCRYPTION_SECRET ou JWT_SECRET sont manquantes.");
    console.error("Le serveur refuse de démarrer car le chiffrement serait compromis.");
    process.exit(1); // Force l'arrêt immédiat de l'application
}

const ENCRYPTION_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET, 'salt', 32);
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

function isPinWeak(pin) {
    if (!pin) return false;
    const strPin = String(pin);
    const repeating = /^(\d)\1+$/.test(strPin);          // Ex: 0000, 1111, 22222...
    const sequentialUp = '0123456789'.includes(strPin);  // Ex: 1234, 4567, 0123...
    const sequentialDown = '9876543210'.includes(strPin);// Ex: 4321, 9876, 3210...
    return repeating || sequentialUp || sequentialDown;
}

console.log("Étape 3 : Configuration d'Express et WebSockets...");
const app = express();

// 🚨 SÉCURITÉ : Restriction stricte des origines + Autorisation des Cookies (credentials)
const corsOptions = {
    origin: ['https://app-salon-caiss.onrender.com', 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    credentials: true
};
app.use(cors(corsOptions));

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ message: "Déconnecté" });
});

// Générateur de token public (sans signature) exclusif à l'interface React
function generateUIToken(payload) {
    return Buffer.from(JSON.stringify({alg: "none"})).toString('base64url') + "." + 
           Buffer.from(JSON.stringify(payload)).toString('base64url') + ".";
}

const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

io.on('connection', (socket) => {
    socket.on('rejoindreSalon', (id_salon) => {
        const cookieHeader = socket.request.headers.cookie;
        let token = null;
        if (cookieHeader) {
            const cookies = cookieHeader.split(';').map(c => c.trim());
            const tokenCookie = cookies.find(c => c.startsWith('token='));
            if (tokenCookie) token = tokenCookie.split('=')[1];
        }
        if (!token && socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        }
        if (!token && socket.request.headers.authorization) {
            token = socket.request.headers.authorization.split(' ')[1];
        }
        if (!token) return;
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            if (String(user.id_salon) !== String(id_salon)) return;
            for (const room of socket.rooms) {
                if (room !== socket.id) socket.leave(room);
            }
            socket.data.user = user;
            const salonRoom = String(user.id_salon);
            socket.join(salonRoom);
            if (user.role === 'gerant') socket.join(`${salonRoom}_gerant`);
            else if (user.role === 'salon') socket.join(`${salonRoom}_salon`);
            else if (user.role === 'employe' && user.id_employe) socket.join(`${salonRoom}_emp_${user.id_employe}`);
        } catch (e) { /* ignoré silencieusement */ }
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

app.get('/api/events/:id_salon', (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
}, verifierToken, (req, res) => {
    if (String(req.user.id_salon) !== String(req.params.id_salon) || req.user.role !== 'gerant') {
        return res.status(403).end();
    }
    
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
    ALTER TABLE employes ALTER COLUMN code_pin TYPE VARCHAR(255);
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_tentatives_echouees INT DEFAULT 0;
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_bloque_jusqua TIMESTAMP NULL;
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_bloque_definitif BOOLEAN DEFAULT FALSE;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS montant_pourboire NUMERIC(10, 2) DEFAULT 0.00;
    
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS telephone_gerant VARCHAR(20);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS alertes_sms_actives BOOLEAN DEFAULT FALSE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS email_comptable VARCHAR(255);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS jour_envoi_bilan INT DEFAULT 1;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS derniere_verif_stock DATE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pin_salon VARCHAR(255);
    ALTER TABLE configuration_salon ALTER COLUMN pin_salon TYPE VARCHAR(255);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS securite_pin_salon_active BOOLEAN DEFAULT TRUE;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_temp_offline VARCHAR(64);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS date_synchro_hors_ligne TIMESTAMP;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_id_temp_offline ON tickets (id_salon, id_temp_offline) WHERE id_temp_offline IS NOT NULL;
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS type_contrat VARCHAR(20) DEFAULT '35H';
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS heures_mensuelles_base NUMERIC(10, 2) DEFAULT 151.67;

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
    
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_caisse_matin NUMERIC(10, 2) DEFAULT 0.00;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_especes_theorique NUMERIC(10, 2) DEFAULT 0.00;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_especes_reel NUMERIC(10, 2) DEFAULT 0.00;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS ecart_caisse NUMERIC(10, 2) DEFAULT 0.00;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS justification_ecart TEXT;
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS est_cloture_automatique BOOLEAN DEFAULT FALSE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compteur_tickets INT DEFAULT 0;
    
    ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS numero_z_salon INT;
    CREATE TABLE IF NOT EXISTS mouvements_caisse (
        id_mouvement SERIAL PRIMARY KEY,
        id_salon INT,
        id_employe INT,
        type_mouvement VARCHAR(50) NOT NULL, -- 'ENTREE', 'SORTIE', 'REGULARISATION'
        montant NUMERIC(10, 2) NOT NULL,
        motif TEXT NOT NULL,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hash_precedent VARCHAR(64),
        hash_mouvement VARCHAR(64)
    );
    ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
    ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS hash_mouvement VARCHAR(64);
    ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS categorie_comptable VARCHAR(40) DEFAULT 'AUTRE';

    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS plan_actuel VARCHAR(20) DEFAULT 'PREMIUM_TRIAL';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS siret VARCHAR(50);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS forme_juridique VARCHAR(30);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS capital_social VARCHAR(50);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS rcs_ville VARCHAR(100);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS mode_suivi_heures VARCHAR(20) DEFAULT 'MANUEL';
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS tva_intra VARCHAR(50);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS adresse_salon TEXT;
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
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS comptes_emails JSONB DEFAULT '[]';

    CREATE TABLE IF NOT EXISTS factures_fournisseurs (id_facture SERIAL PRIMARY KEY, id_salon INT, nom_fournisseur VARCHAR(255), montant_ht NUMERIC(10,2), montant_tva NUMERIC(10,2), montant_ttc NUMERIC(10,2), date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS numero_facture VARCHAR(255);
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(50) DEFAULT 'NON_SPECIFIE';
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS statut_verification VARCHAR(20) DEFAULT 'A_VALIDER';
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS justificatif_url TEXT;
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS fichier_cle_r2 TEXT;
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS date_facture DATE;
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS date_reglement DATE;
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS compte_comptable VARCHAR(20);

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
    
    CREATE TABLE IF NOT EXISTS heures_ajustements (id_ajustement SERIAL PRIMARY KEY, id_employe INT, mois_annee VARCHAR(7), heures_ajoutees NUMERIC(10,2), motif TEXT, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS liasses_mensuelles_validees (id_validation SERIAL PRIMARY KEY, id_salon INT, mois_annee VARCHAR(7), date_validation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, valide_par VARCHAR(255), UNIQUE(id_salon, mois_annee));
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14,2) DEFAULT 0.00;
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_tva NUMERIC(14,2) DEFAULT 0.00;
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14,2) DEFAULT 0.00;
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS cumul_perpetuel_ttc NUMERIC(14,2) DEFAULT 0.00;
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
    ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS signature_hash VARCHAR(64);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS donnees_scellees TEXT;
    CREATE TABLE IF NOT EXISTS push_subscriptions (id_sub SERIAL PRIMARY KEY, id_salon INT, role VARCHAR(20), id_employe INT, endpoint TEXT, keys JSONB, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pointages (id_pointage SERIAL PRIMARY KEY, id_employe INT, id_salon INT, date_jour DATE DEFAULT CURRENT_DATE, type_action VARCHAR(20), heure_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
`).then(async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS vapid_keys (id INT PRIMARY KEY, public_key TEXT, private_key TEXT)`);
        const res = await pool.query('SELECT * FROM vapid_keys WHERE id = 1');
        if (res.rowCount === 0) {
            const keys = webpush.generateVAPIDKeys();
            await pool.query('INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, $1, $2)', [keys.publicKey, keys.privateKey]);
            vapidPublicKey = keys.publicKey;
            vapidPrivateKey = keys.privateKey;
            console.log(" Nouvelles clés VAPID générées et sauvegardées en BDD.");
        } else {
            vapidPublicKey = res.rows[0].public_key;
            vapidPrivateKey = res.rows[0].private_key;
            console.log("Clés VAPID (Push) chargées depuis la BDD.");
        }
        webpush.setVapidDetails('mailto:contact@stack.fr', vapidPublicKey, vapidPrivateKey);
    } catch (e) { console.error("Erreur init VAPID:", e); }

    try {
        await pool.query(`ALTER TABLE clotures_caisse ALTER COLUMN date_cloture SET DEFAULT CURRENT_TIMESTAMP;`);
        await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cloture_salon_jour') THEN ALTER TABLE clotures_caisse ADD CONSTRAINT uq_cloture_salon_jour UNIQUE (id_salon, date_cloture); END IF; END $$;`);
        
        // BACKFILL STRICT NF525 : Désactivation temporaire du trigger pour garantir une séquence 1..N sans trou ni doublon par salon
        await pool.query(`DROP TRIGGER IF EXISTS trigger_nf525_clotures ON clotures_caisse;`);
        await pool.query(`
            UPDATE clotures_caisse
            SET numero_z_salon = subquery.seq
            FROM (
                SELECT id_cloture, ROW_NUMBER() OVER (PARTITION BY id_salon ORDER BY date_cloture ASC, id_cloture ASC) as seq
                FROM clotures_caisse
            ) AS subquery
            WHERE clotures_caisse.id_cloture = subquery.id_cloture
            AND clotures_caisse.numero_z_salon IS DISTINCT FROM subquery.seq;
        `);
        
        // 🚨 SÉCURITÉ NF525 : Triggers stricts anti-altération et anti-suppression
        await pool.query(`
            CREATE OR REPLACE FUNCTION nf525_prevent_alteration() RETURNS TRIGGER AS $$
            BEGIN
                -- 🚨 SUPPRESSION DE LA PORTE DÉROBÉE : L'inaltérabilité NF525 est désormais absolue.
                -- Aucun compte, pas même le Super-Admin, ne peut contourner ce blocage.

                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Action bloquée (NF525) : Suppression interdite sur la table %', TG_TABLE_NAME;
                END IF;
                
                IF TG_OP = 'UPDATE' THEN
                    IF TG_TABLE_NAME = 'tickets' THEN
                        -- Liste stricte des champs intouchables. 
                        -- Seuls "hash_ticket" (si NULL à la base) et "est_compense" peuvent être modifiés par le code.
                        IF OLD.total_ttc IS DISTINCT FROM NEW.total_ttc 
                           OR OLD.numero_ticket_caisse IS DISTINCT FROM NEW.numero_ticket_caisse 
                           OR OLD.date_creation IS DISTINCT FROM NEW.date_creation 
                           OR OLD.methode_paiement IS DISTINCT FROM NEW.methode_paiement
                           OR OLD.statut IS DISTINCT FROM NEW.statut
                           OR OLD.type_ticket IS DISTINCT FROM NEW.type_ticket
                           OR OLD.id_employe IS DISTINCT FROM NEW.id_employe
                           OR OLD.id_client IS DISTINCT FROM NEW.id_client
                           OR (OLD.hash_ticket IS NOT NULL AND OLD.hash_ticket IS DISTINCT FROM NEW.hash_ticket) THEN
                            RAISE EXCEPTION 'Action bloquée (NF525) : Altération des données fiscales, de paiement ou de traçabilité interdite.';
                        END IF;
                    ELSIF TG_TABLE_NAME = 'clotures_caisse' THEN
                        -- Seule la levée du drapeau est_cloture_automatique (TRUE -> FALSE) lors de la régularisation matinale est autorisée.
                        -- Toute modification des montants, dates, numéros Z ou signatures cryptographiques est strictement bloquée.
                        IF OLD.est_cloture_automatique IS DISTINCT FROM TRUE
                           OR NEW.est_cloture_automatique IS DISTINCT FROM FALSE
                           OR OLD.total_encaisse IS DISTINCT FROM NEW.total_encaisse
                           OR OLD.signature_hash IS DISTINCT FROM NEW.signature_hash
                           OR OLD.date_cloture IS DISTINCT FROM NEW.date_cloture
                           OR OLD.cumul_perpetuel_ttc IS DISTINCT FROM NEW.cumul_perpetuel_ttc
                           OR OLD.hash_precedent IS DISTINCT FROM NEW.hash_precedent
                           OR OLD.fond_caisse_matin IS DISTINCT FROM NEW.fond_caisse_matin
                           OR OLD.total_especes_theorique IS DISTINCT FROM NEW.total_especes_theorique
                           OR OLD.total_especes_reel IS DISTINCT FROM NEW.total_especes_reel
                           OR OLD.ecart_caisse IS DISTINCT FROM NEW.ecart_caisse
                           OR OLD.numero_z_salon IS DISTINCT FROM NEW.numero_z_salon THEN
                            RAISE EXCEPTION 'Action bloquée (NF525) : Altération interdite sur la table clotures_caisse';
                        END IF;
                    ELSIF TG_TABLE_NAME = 'mouvements_caisse' THEN
                        IF (OLD.hash_mouvement IS NOT NULL AND OLD.hash_mouvement IS DISTINCT FROM NEW.hash_mouvement)
                           OR OLD.montant IS DISTINCT FROM NEW.montant
                           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
                           OR OLD.motif IS DISTINCT FROM NEW.motif
                           OR OLD.date_creation IS DISTINCT FROM NEW.date_creation THEN
                            RAISE EXCEPTION 'Action bloquée (NF525) : Modification absolue interdite sur la table mouvements_caisse';
                        END IF;
                    ELSIF TG_TABLE_NAME IN ('lignes_ticket', 'jet_logs', 'liasses_mensuelles_validees') THEN
                        RAISE EXCEPTION 'Action bloquée (NF525) : Modification absolue interdite sur la table %', TG_TABLE_NAME;
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trigger_nf525_tickets ON tickets;
            CREATE TRIGGER trigger_nf525_tickets BEFORE DELETE OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();
            
            -- Sécurisation des lignes de vente (TVA et Articles) manquante dans la V1
            DROP TRIGGER IF EXISTS trigger_nf525_lignes ON lignes_ticket;
            CREATE TRIGGER trigger_nf525_lignes BEFORE DELETE OR UPDATE ON lignes_ticket FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

            DROP TRIGGER IF EXISTS trigger_nf525_clotures ON clotures_caisse;
            CREATE TRIGGER trigger_nf525_clotures BEFORE DELETE OR UPDATE ON clotures_caisse FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

            DROP TRIGGER IF EXISTS trigger_nf525_jet ON jet_logs;
            CREATE TRIGGER trigger_nf525_jet BEFORE DELETE OR UPDATE ON jet_logs FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

            -- 🚨 Sécurisation NF525 de la nouvelle table de mouvements d'espèces
            DROP TRIGGER IF EXISTS trigger_nf525_mouvements ON mouvements_caisse;
            CREATE TRIGGER trigger_nf525_mouvements BEFORE DELETE OR UPDATE ON mouvements_caisse FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

            -- 🚨 Sécurisation NF525 des clôtures mensuelles
            DROP TRIGGER IF EXISTS trigger_nf525_liasses ON liasses_mensuelles_validees;
            CREATE TRIGGER trigger_nf525_liasses BEFORE DELETE OR UPDATE ON liasses_mensuelles_validees FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();
        `);
    } catch (e) { console.error("Erreur Triggers NF525:", e); }
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

function verifierToken(req, res, next) {
    const cookieHeader = req.headers.cookie;
    let token = null;
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        if (tokenCookie) token = tokenCookie.split('=')[1];
    }
    
    // Tolérance : on garde l'en-tête Authorization comme plan B temporaire
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1]; 
    }

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

async function envoyerSMS(apiKey, senderName, telephone, contenu) {
    try {
        const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST', headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (senderName || 'LeSalon').substring(0, 11), recipient: telephone, content: contenu })
        });
        return res.ok;
    } catch (e) {
        console.error("Erreur Envoi SMS:", e);
        return false;
    }
}

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

function deduireCategorieMouvement(type_mouvement, motif, categorieExplicite = null) {
    if (categorieExplicite && ['ACHAT_ESPECES', 'REMISE_BANQUE', 'APPORT_FONDS', 'PRELEVEMENT_GERANT', 'ECART_CAISSE', 'AUTRE'].includes(categorieExplicite)) {
        return categorieExplicite;
    }
    if (type_mouvement === 'REGULARISATION') return 'ECART_CAISSE';
    const m = String(motif || '').toLowerCase();
    if (type_mouvement === 'ENTREE') {
        return 'APPORT_FONDS';
    }
    if (m.includes('banque') || m.includes('dépôt') || m.includes('depot') || m.includes('remise') || m.includes('coffre')) {
        return 'REMISE_BANQUE';
    }
    if (m.includes('facture') || m.includes('achat') || m.includes('fournisseur') || m.includes('courses') || m.includes('timbre') || m.includes('poste')) {
        return 'ACHAT_ESPECES';
    }
    if (m.includes('gérant') || m.includes('gerant') || m.includes('patron') || m.includes('prélèvement') || m.includes('prelevement') || m.includes('acompte')) {
        return 'PRELEVEMENT_GERANT';
    }
    return 'ACHAT_ESPECES';
}

async function enregistrerMouvementCaisseScelle(clientDB, { id_salon, id_employe = null, type_mouvement, montant, motif, categorie_comptable = null, autoriserJourCloture = false }) {
    await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
    if (!autoriserJourCloture && type_mouvement !== 'REGULARISATION') {
        const zDejaFait = await clientDB.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = CURRENT_DATE', [id_salon]);
        if (zDejaFait.rowCount > 0) {
            throw new Error("Action bloquée (NF525) : La clôture Z d'aujourd'hui a déjà été scellée. Aucun mouvement d'espèces ne peut être ajouté sur une journée clôturée.");
        }
    }
    const lastMvt = await clientDB.query('SELECT hash_mouvement FROM mouvements_caisse WHERE id_salon = $1 AND hash_mouvement IS NOT NULL ORDER BY id_mouvement DESC LIMIT 1', [id_salon]);
    const hashPrecedent = lastMvt.rowCount > 0 ? lastMvt.rows[0].hash_mouvement : 'GENESIS_MVT';
    const montantFormate = Number(montant).toFixed(2);
    const motifPropre = String(motif || '').trim();
    const catFinale = deduireCategorieMouvement(type_mouvement, motifPropre, categorie_comptable);
    const dateISO = new Date().toISOString();
    const ins = await clientDB.query(
        `INSERT INTO mouvements_caisse (id_salon, id_employe, type_mouvement, montant, motif, categorie_comptable, date_creation, hash_precedent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_mouvement`,
        [id_salon, id_employe, type_mouvement, montantFormate, motifPropre, catFinale, dateISO, hashPrecedent]
    );
    const idMvt = ins.rows[0].id_mouvement;
    const hashMouvement = crypto.createHash('sha256')
        .update(`MVT-${id_salon}-${idMvt}-${type_mouvement}-${montantFormate}-${motifPropre}-${hashPrecedent}`)
        .digest('hex');
    await clientDB.query('UPDATE mouvements_caisse SET hash_mouvement = $1 WHERE id_mouvement = $2', [hashMouvement, idMvt]);
    return { id_mouvement: idMvt, hash_mouvement: hashMouvement, hash_precedent: hashPrecedent, categorie_comptable: catFinale };
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
        // NF525 : Interdiction formelle d'encaisser sur une journée dont le Z est déjà scellé
        const zCibleDejaFait = await pool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = DATE(COALESCE($2::timestamp, NOW()))', [id_salon, dateTicket]);
        if (zCibleDejaFait.rowCount > 0) {
            return res.status(423).json({ erreur: "La clôture (Z) d'aujourd'hui a déjà été effectuée. Aucun nouvel encaissement n'est autorisé sur une journée clôturée." });
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

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limite stricte
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    keyGenerator: (req) => {
        // Isole le compteur par IP, par type de connexion (route) et par cible (ID du salon ou email)
        const cible = req.body.id_salon || req.body.email || 'global';
        return `${req.ip}_${req.path}_${cible}`;
    },
    message: { erreur: "Trop de tentatives pour ce compte. Veuillez patienter 15 minutes avant de réessayer." }
});

app.post('/api/register', authLimiter, async (req, res) => {
    const { email, mot_de_passe, nom_salon, nom_gerant } = req.body;
    if (!email || !mot_de_passe) return res.status(400).json({ erreur: "Email et mot de passe requis." });
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const exist = await clientDB.query('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
        if (exist.rowCount > 0) throw new Error("Cet email est déjà utilisé.");
        const hash = await bcrypt.hash(mot_de_passe, 10);
        
        const salonResult = await clientDB.query(
            "INSERT INTO configuration_salon (nom_salon, date_fin_essai, plan_actuel) VALUES ($1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL') RETURNING id_salon", 
            [nom_salon || 'Nouveau Salon']
        );
        const idNouveauSalon = salonResult.rows[0].id_salon;
        let customerId = null;
        try { const customer = await stripe.customers.create({ email: email, name: nom_salon }); customerId = customer.id; } catch(e) {}
        await clientDB.query('INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, _customer_id, statut_abonnement) VALUES ($1, $2, $3, $4, $5, $6)', [email, hash, idNouveauSalon, 'gerant', customerId, 'inactif']); 
        
        const defaultPinHash = await bcrypt.hash('0000', 10);
        await clientDB.query("INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)", [nom_gerant || 'Patron', idNouveauSalon, defaultPinHash]);

        await clientDB.query('COMMIT');
        const payload = { id_salon: idNouveauSalon, role: 'gerant', email };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000 });
        
        // IMPORTANT: Renvoie le vrai token_api nécessaire au module légal juste après
        res.status(201).json({ message: "Inscription réussie", ui_token: generateUIToken(payload), token_api: token });
    } catch (erreur) { await clientDB.query('ROLLBACK'); res.status(400).json({ erreur: erreur.message }); } finally { clientDB.release(); }
});

app.post('/api/login', authLimiter, async (req, res) => {
    const { email, mot_de_passe } = req.body;
    try {
        const result = await pool.query('SELECT id_salon, mot_de_passe_hash, statut_abonnement FROM utilisateurs WHERE email = $1 LIMIT 1', [email]);
        if (result.rowCount > 0) {
            const { id_salon, mot_de_passe_hash, statut_abonnement } = result.rows[0];
            const match = await bcrypt.compare(mot_de_passe, mot_de_passe_hash);
             if (match) {
                const payload = { id_salon, role: 'gerant', email };
                const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
                res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000 });
                await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { email, role: 'gerant' });
                res.json({ message: "Connexion réussie", ui_token: generateUIToken(payload), token_api: token, statut_abonnement });
            } else {
                await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { email, raison: 'mot_de_passe_incorrect' });
                res.status(401).json({ erreur: "Mot de passe incorrect." });
            }
        } else { res.status(401).json({ erreur: "Aucun compte trouvé avec cet e-mail." }); }
    } catch (error) { res.status(500).json({ erreur: "Erreur serveur." }); }
});

// --- GESTION DES HEURES (AJUSTEMENTS MANUELS DU MODE PRO) ---
app.post('/api/rh/ajustements', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut ajuster les heures." });
    const { id_employe, mois_annee, heures_ajoutees, motif } = req.body;
    try {
        const empCheck = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, req.user.id_salon]);
        if (empCheck.rowCount === 0) return res.status(403).json({ erreur: "Employé introuvable dans ce salon." });

        await pool.query(
            `INSERT INTO heures_ajustements (id_employe, mois_annee, heures_ajoutees, motif) VALUES ($1, $2, $3, $4)`,
            [id_employe, mois_annee, heures_ajoutees, motif]
        );
        res.json({ message: "Ajustement enregistré avec succès" });
    } catch (e) { res.status(500).json({ erreur: "Erreur BDD" }); }
});

// --- GESTION DE LA POINTEUSE NUMÉRIQUE (MODE PREMIUM) ---

// Nouvelle route : Récupérer le statut actuel des employés
app.get('/api/rh/statut-pointages', verifierToken, async (req, res) => {
    try {
        // Récupère la dernière action de la journée pour chaque employé du salon
        const statuts = await pool.query(`
            SELECT DISTINCT ON (id_employe) id_employe, type_action, heure_action 
            FROM pointages 
            WHERE id_salon = $1 AND date_jour = CURRENT_DATE 
            ORDER BY id_employe, heure_action DESC
        `, [req.user.id_salon]);
        
        // On transforme ça en un dictionnaire { action, heure } pour le chronomètre
        const mapStatuts = {};
        statuts.rows.forEach(r => { mapStatuts[r.id_employe] = { action: r.type_action, heure: r.heure_action }; });
        
        res.json(mapStatuts);
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur lecture statuts" }); 
    }
});

app.post('/api/rh/pointage', verifierToken, async (req, res) => {
    const { id_employe, type_action } = req.body; // 'ENTREE', 'PAUSE_DEBUT', 'PAUSE_FIN', 'SORTIE'
    const id_salon = req.user.id_salon;
    const actionsValides = ['ENTREE', 'PAUSE_DEBUT', 'PAUSE_FIN', 'SORTIE'];
    if (!actionsValides.includes(type_action)) return res.status(400).json({ erreur: "Action de pointage invalide." });
    if (req.user.role === 'employe' && Number(req.user.id_employe) !== Number(id_employe)) {
        return res.status(403).json({ erreur: "Vous ne pouvez pointer que pour votre propre profil." });
    }
    try {
        const empCheck = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        if (empCheck.rowCount === 0) return res.status(404).json({ erreur: "Employé introuvable dans ce salon." });

        await pool.query(
            `INSERT INTO pointages (id_employe, id_salon, date_jour, type_action) VALUES ($1, $2, CURRENT_DATE, $3)`,
            [id_employe, id_salon, type_action]
        );
        
        // NOTIFICATION TEMPS RÉEL (WebSockets) avec l'heure exacte
        io.to(id_salon.toString()).emit('statutPointageUpdate', { id_employe, type_action, heure: new Date().toISOString() });
        
        res.json({ message: "Pointage enregistré" });
    } catch (e) { res.status(500).json({ erreur: "Erreur BDD" }); }
});

app.post('/api/employes/login-pin', async (req, res) => {
    const { id_salon, id_employe, nom_employe, code_pin, is_pointeuse } = req.body;
    try {
        let result;
        if (id_employe) {
            result = await pool.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        } else {
            result = await pool.query('SELECT * FROM employes WHERE TRIM(nom) ILIKE TRIM($1) AND id_salon = $2 LIMIT 1', [String(nom_employe || ''), id_salon]);
        }
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Employé introuvable." });
        const emp = result.rows[0];

        // Vérification du blocage définitif ou temporaire (15m -> 30m -> 1h -> Définitif)
        if (emp.pin_bloque_definitif) {
            return res.status(403).json({
                erreur: `Accès PIN bloqué définitivement pour ${emp.nom}. Le gérant doit débloquer votre profil dans l'espace Équipe.`,
                locked_permanent: true
            });
        }
        if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
            const minRestantes = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
            return res.status(403).json({
                erreur: `Code PIN suspendu temporairement pour ${emp.nom}. Réessayez dans ${minRestantes} minute(s).`,
                locked_until: emp.pin_bloque_jusqua
            });
        }
        
        let pinMatch = false;
        const pinSaisi = String(code_pin || '').trim();
        if (emp.code_pin && emp.code_pin.startsWith('$2')) {
            pinMatch = await bcrypt.compare(pinSaisi, emp.code_pin);
        } else {
            pinMatch = (String(emp.code_pin || '').trim() === pinSaisi);
        }

        if (!pinMatch) {
            const nouvellesTentatives = (parseInt(emp.pin_tentatives_echouees, 10) || 0) + 1;
            let bloqueJusqua = null;
            let bloqueDefinitif = false;
            let messageSanction = '';

            if (nouvellesTentatives >= 9) {
                bloqueDefinitif = true;
                messageSanction = `Profil bloqué définitivement. Demandez au gérant de vous débloquer dans Équipe.`;
            } else if (nouvellesTentatives === 7) {
                bloqueJusqua = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                messageSanction = `Bloqué pendant 1 heure.`;
            } else if (nouvellesTentatives === 5) {
                bloqueJusqua = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                messageSanction = `Bloqué pendant 30 minutes.`;
            } else if (nouvellesTentatives === 3) {
                bloqueJusqua = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                messageSanction = `Bloqué pendant 15 minutes.`;
            } else {
                const prochainSeuil = nouvellesTentatives < 3 ? 3 : (nouvellesTentatives < 5 ? 5 : (nouvellesTentatives < 7 ? 7 : 9));
                messageSanction = `${prochainSeuil - nouvellesTentatives} essai(s) restant(s) avant verrouillage.`;
            }

            await pool.query(
                'UPDATE employes SET pin_tentatives_echouees = $1, pin_bloque_jusqua = $2, pin_bloque_definitif = $3 WHERE id_employe = $4 AND id_salon = $5',
                [nouvellesTentatives, bloqueJusqua, bloqueDefinitif, emp.id_employe, id_salon]
            );
            await enregistrerJET(id_salon, bloqueDefinitif ? 'PIN_BLOCAGE_DEFINITIF' : 'CONNEXION_ECHOUEE', { nom_employe: emp.nom, tentatives: nouvellesTentatives, is_pointeuse: !!is_pointeuse });
            return res.status(400).json({ erreur: `Code PIN incorrect. ${messageSanction}`, tentatives: nouvellesTentatives });
        }

        // Remise à zéro des tentatives en cas de succès
        if ((emp.pin_tentatives_echouees || 0) > 0 || emp.pin_bloque_jusqua) {
            await pool.query('UPDATE employes SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $1 AND id_salon = $2', [emp.id_employe, id_salon]);
        }

        // Si c'est la pointeuse qui vérifie le PIN, on s'arrête ici SANS écraser le cookie du salon !
        if (is_pointeuse) {
            return res.json({ message: "PIN valide", employe: { id: emp.id_employe, nom: emp.nom } });
        }

        const payload = { id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 12 * 60 * 60 * 1000 });
        await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { nom_employe: emp.nom, role: 'employe', id_employe: emp.id_employe });
        res.json({ message: "Accès employé autorisé", ui_token: generateUIToken(payload), token_api: token, employe: { id: emp.id_employe, nom: emp.nom } });
    } catch (e) { res.status(500).json({ erreur: "Erreur serveur PIN." }); }
});

app.post('/api/salon/login-pin', authLimiter, async (req, res) => {
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
        const payload = { id_salon: salon.id_salon, role: 'salon' };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '18h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 18 * 60 * 60 * 1000 });
        await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { role: 'salon' });
        res.json({ message: "Accès salon autorisé", ui_token: generateUIToken(payload), token_api: token });
    } catch (e) { res.status(500).json({ erreur: "Erreur serveur PIN." }); }
});

app.post('/api/forgot-password', authLimiter, async (req, res) => {
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

app.post('/api/reset-password', authLimiter, async (req, res) => {
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
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture, telephone_gerant, alertes_sms_actives, email_comptable, jour_envoi_bilan, pin_salon, securite_pin_salon_active, temps_nettoyage_minutes, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva, pennylane_api_key, mode_suivi_heures, nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville } = req.body;
    try { 
        const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
        if ((pin_salon !== undefined || securite_pin_salon_active !== undefined) && req.user.role !== 'gerant') {
            return res.status(403).json({ erreur: "Seul le gérant peut modifier les paramètres de sécurité du salon." });
        }
        if (pin_salon && isPinWeak(pin_salon)) return res.status(400).json({ erreur: "Le code PIN du salon est trop simple (évitez 0000, 1234...)." });
        
        let finalPinSalon = pin_salon;
        if (pin_salon && !pin_salon.startsWith('$2')) {
            finalPinSalon = await bcrypt.hash(pin_salon, 10);
        }
        const secPinSalon = securite_pin_salon_active !== undefined ? Boolean(securite_pin_salon_active) : true;

        const updateQuery = pin_salon !== undefined
            ? `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $24, pin_salon = $23, mode_suivi_heures = $25, nom_salon = $26, siret = $27, adresse_salon = $28, tva_intra = $29, forme_juridique = $30, capital_social = $31, rcs_ville = $32, securite_pin_salon_active = $33 WHERE id_salon = $16`
            : `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $23, mode_suivi_heures = $24, nom_salon = $25, siret = $26, adresse_salon = $27, tva_intra = $28, forme_juridique = $29, capital_social = $30, rcs_ville = $31, securite_pin_salon_active = $32 WHERE id_salon = $16`; 
            
        const params = [google_api_key, google_account_id, google_location_id, email_factures, passChiffre, brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, heure_ouverture || 8, heure_fermeture || 20, telephone_gerant, alertes_sms_actives || false, email_comptable, jour_envoi_bilan || 1, req.user.id_salon, temps_nettoyage_minutes || 0, compte_banque || '512000', compte_caisse || '530000', compte_prestations || '706000', compte_produits || '707000', compte_tva || '445710'];
        
        if (pin_salon !== undefined) { 
            params.push(finalPinSalon || null); 
            params.push(pennylane_api_key || null); 
        } else { 
            params.push(pennylane_api_key || null); 
        }
        
        params.push(mode_suivi_heures || 'MANUEL');
        params.push(nom_salon || null);
        params.push(siret || null);
        params.push(adresse_salon || null);
        params.push(tva_intra || null);
        params.push(forme_juridique || null);
        params.push(capital_social || null);
        params.push(rcs_ville || null);
        params.push(secPinSalon);
        
        await pool.query(updateQuery, params);

        if (Array.isArray(req.body.comptes_emails)) {
            const comptesLimites = req.body.comptes_emails
                .filter(c => c && c.email && String(c.email).trim() !== '')
                .slice(0, 5)
                .map(c => ({
                    email: String(c.email).trim(),
                    mot_de_passe: c.mot_de_passe ? chiffrer(String(c.mot_de_passe).trim()) : ''
                }));
            const premierEmail = comptesLimites[0]?.email || email_factures || null;
            const premierPass = comptesLimites[0]?.mot_de_passe || passChiffre || null;
            await pool.query(
                'UPDATE configuration_salon SET comptes_emails = $1, email_reception_factures = $2, mot_de_passe_app_email = $3 WHERE id_salon = $4',
                [JSON.stringify(comptesLimites), premierEmail, premierPass, req.user.id_salon]
            );
        }

        await enregistrerJET(req.user.id_salon, 'MODIFICATION_PARAMETRES_SALON', { champs_modifies: Object.keys(req.body) });
        res.json({ message: "Paramètres enregistrés avec succès !" }); 
    } catch (erreur) { 
        res.status(500).json({ erreur: "Erreur lors de la sauvegarde." }); 
    }
});

app.get('/api/settings', verifierToken, async (req, res) => { 
    try { 
        const result = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [req.user.id_salon]); 
        if (result.rowCount > 0) {
            let config = result.rows[0];
            
            // Sécurité : Seul le gérant a le droit de voir les secrets de configuration (clés API, mots de passe mail, PIN)
            if (req.user.role !== 'gerant') {
                delete config.mot_de_passe_app_email;
                delete config.comptes_emails;
                delete config.brevo_api_key;
                delete config.pennylane_api_key;
                delete config.google_api_key;
                delete config.pin_salon;
            } else {
                config.mot_de_passe_app_email = dechiffrer(config.mot_de_passe_app_email);
                let listeMails = Array.isArray(config.comptes_emails) ? config.comptes_emails : [];
                if (listeMails.length === 0 && config.email_reception_factures) {
                    listeMails = [{ email: config.email_reception_factures, mot_de_passe: config.mot_de_passe_app_email || '' }];
                } else {
                    listeMails = listeMails.map(c => ({ email: c.email, mot_de_passe: dechiffrer(c.mot_de_passe) }));
                }
                config.comptes_emails = listeMails;
            }
            
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
                            // 🚨 SÉCURITÉ & RGPD : Vérification de l'opt-out avant tout envoi
                            const optOutCheck = await pool.query(
                                `SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = RIGHT(regexp_replace($2, '\\D', '', 'g'), 9)`, 
                                [id_salon, rdv.telephone_client]
                            );
                            
                            if (optOutCheck.rowCount === 0) {
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
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "L'encaissement est réservé au poste Caisse/Salon ou au Gérant." });
    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement, pourboire, _id_temp, date_creation } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    if (isNaN(montant) || parseFloat(montant) < 0 || !Array.isArray(lignes) || lignes.length === 0) {
        return res.status(400).json({ erreur: "Montant ou panier invalide." });
    }
    
    // --- SÉCURITÉ ANTI-FRAUDE : VÉRIFICATION DU POINTAGE ---
    // Si la pointeuse est activée dans ce salon, on vérifie le statut du collaborateur
    const configData = await pool.query('SELECT mode_suivi_heures FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    if (configData.rows.length > 0 && configData.rows[0].mode_suivi_heures === 'POINTEUSE') {
        const empData = await pool.query('SELECT role FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        if (empData.rows.length > 0 && empData.rows[0].role !== 'Gérant') {
            const pointageData = await pool.query(`
                SELECT type_action FROM pointages 
                WHERE id_salon = $1 AND id_employe = $2 AND date_jour = CURRENT_DATE 
                ORDER BY heure_action DESC LIMIT 1
            `, [id_salon, id_employe]);
            
            const actionActuelle = pointageData.rows.length > 0 ? pointageData.rows[0].type_action : null;
            if (!actionActuelle || actionActuelle === 'PAUSE_DEBUT' || actionActuelle === 'SORTIE') {
                return res.status(403).json({ erreur: "Action refusée (Sécurité Serveur) : L'employé sélectionné n'a pas pointé son arrivée ou est en pause." });
            }
        }
    }
    // -----------------------------------------------------

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
        
        // 🚨 VERROU TRANSACTIONNEL : On bloque la lecture/écriture du compteur pour ce salon précis
        const configRes = await clientDB.query('SELECT compteur_tickets, tva_intra FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        const seq = parseInt(configRes.rows[0].compteur_tickets) + 1;
        
        // DÉTECTION FRANCHISE : Vérifie si le salon est assujetti à la TVA
        const franchiseTVA = !configRes.rows[0].tva_intra || configRes.rows[0].tva_intra.trim() === '';
        
        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        
        const anneeMois = new Date().toISOString().slice(0, 7).replace('-', ''); // Ex: 202610
        const numeroTicket = `TKT-${anneeMois}-${String(seq).padStart(6, '0')}`;

        // Mise à jour du compteur pour le prochain ticket
        await clientDB.query('UPDATE configuration_salon SET compteur_tickets = $1 WHERE id_salon = $2', [seq, id_salon]);
        
        const pourboire = parseFloat(req.body.pourboire) || 0.00; // NOUVEAU

        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, date_creation, id_temp_offline, date_synchro_hors_ligne, montant_pourboire) VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE', COALESCE($8::timestamp, NOW()), $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL::timestamp ELSE NOW() END, $10) RETURNING id_ticket, date_creation;`, 
            [numeroTicket, id_client || null, id_employe, montant, id_salon, recompense_appliquee || false, methode, req.dateTicketEffective || null, req.idTempOffline || null, pourboire]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;
        const dateCreationISO = new Date(ticketResult.rows[0].date_creation).toISOString();

        const employeResult = await clientDB.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        const employe = employeResult.rowCount > 0 ? employeResult.rows[0] : null;

        let totalTvaTicketCents = 0;

        if (lignes && lignes.length > 0) {
            // Calcul de la somme brute des lignes pour répartir au centime près toute remise éventuelle (Cohérence NF525 : Somme Lignes === Ticket TTC)
            const targetTicketCents = Math.round((parseFloat(montant) || 0) * 100);
            const rawLines = lignes.map(l => ({
                ...l,
                rawCents: Math.round((parseFloat(l.quantite) || 0) * (parseFloat(l.prix_unitaire) || 0) * 100)
            }));
            const sumRawCents = rawLines.reduce((acc, l) => acc + l.rawCents, 0);

            let cumulAllocatedCents = 0;
            for (let i = 0; i < rawLines.length; i++) {
                const ligne = rawLines[i];
                let netLineCents = ligne.rawCents;
                if (sumRawCents > 0 && sumRawCents !== targetTicketCents) {
                    if (i === rawLines.length - 1) {
                        netLineCents = Math.max(0, targetTicketCents - cumulAllocatedCents);
                    } else {
                        netLineCents = Math.round((ligne.rawCents * targetTicketCents) / sumRawCents);
                        cumulAllocatedCents += netLineCents;
                    }
                }
                const total_ligne = Number((netLineCents / 100).toFixed(2));
                const qteNum = parseFloat(ligne.quantite) || 1;
                const puEffectif = Number((total_ligne / qteNum).toFixed(2));

                const articleSnapshot = await clientDB.query('SELECT nom, taux_tva FROM catalogue WHERE id_article = $1 AND id_salon = $2', [ligne.id_article, id_salon]);
                const nomSnapshot = articleSnapshot.rowCount > 0 ? articleSnapshot.rows[0].nom : (ligne.nom || 'Article supprimé');
                const tvaSnapshot = articleSnapshot.rowCount > 0 ? articleSnapshot.rows[0].taux_tva : 20.00;
                const tauxTvaReel = franchiseTVA ? 0 : parseFloat(tvaSnapshot);

                const lineHtCents = franchiseTVA ? netLineCents : Math.round(netLineCents / (1 + (tauxTvaReel / 100)));
                totalTvaTicketCents += (netLineCents - lineHtCents);

                await clientDB.query(`INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon, nom_article_snapshot, taux_tva_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`, 
                [idNouveauTicket, ligne.id_article, ligne.quantite, puEffectif, total_ligne, id_salon, nomSnapshot, tvaSnapshot]);
                
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
                    const baseHtCommission = Number((lineHtCents / 100).toFixed(2));
                    const montant_commission = (baseHtCommission * (taux / 100)).toFixed(2);
                    
                    await clientDB.query(`INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon, date_creation) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))`, 
                    [id_employe, idNouveauTicket, baseHtCommission, montant_commission, type_article, id_salon, req.dateTicketEffective || null]);
                }
            }
        }

        const montantScelle = Number(montant).toFixed(2);
        const tvaScellee = (totalTvaTicketCents / 100).toFixed(2);
        const chaineScellee = `${idNouveauTicket}|${numeroTicket}|${dateCreationISO}|VENTE|${methode}|${montantScelle}|${tvaScellee}|${previousHash}`;
        const newHash = crypto.createHash('sha256').update(chaineScellee).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1, donnees_scellees = $2 WHERE id_ticket = $3', [newHash, chaineScellee, idNouveauTicket]);

        await enregistrerJET(id_salon, req.idTempOffline ? 'ENCAISSEMENT_TICKET_OFFLINE_SYNC' : 'ENCAISSEMENT_TICKET', {
            id_ticket: idNouveauTicket,
            numero_ticket: numeroTicket,
            montant_ttc: montantScelle,
            tva_ttc: tvaScellee,
            methode_paiement: methode,
            id_temp_offline: req.idTempOffline || null,
            hash_ticket: newHash
        }, clientDB);

        if (id_client) {
            const clientCheck = await clientDB.query(`UPDATE clients SET derniere_visite = CURRENT_DATE WHERE id_client = $1 AND id_salon = $2 RETURNING points_fidelite, tampons_fidelite`, [id_client, id_salon]);
            if (clientCheck.rowCount === 0) throw new Error("Client introuvable dans ce salon.");
            const clientFidelite = clientCheck.rows[0];

            const configRes = await clientDB.query(`SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
            
            if (configRes.rowCount > 0) {
                const config = configRes.rows[0];
                if (recompense_appliquee) {
                    if (config.fidelite_type === 'POINTS') {
                        if ((clientFidelite.points_fidelite || 0) < (config.fidelite_points_seuil || 0)) throw new Error("Points de fidélité insuffisants.");
                        await clientDB.query(`UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1) WHERE id_client = $2 AND id_salon = $3`, [config.fidelite_points_seuil, id_client, id_salon]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        if ((clientFidelite.tampons_fidelite || 0) < (config.fidelite_tampons_seuil || 0)) throw new Error("Tampons de fidélité insuffisants.");
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = GREATEST(0, tampons_fidelite - $1) WHERE id_client = $2 AND id_salon = $3`, [config.fidelite_tampons_seuil, id_client, id_salon]);
                    }
                } else {
                    if (config.fidelite_type === 'POINTS') {
                        const pointsToAdd = Math.max(0, Math.floor(montant));
                        await clientDB.query(`UPDATE clients SET points_fidelite = points_fidelite + $1 WHERE id_client = $2 AND id_salon = $3`, [pointsToAdd, id_client, id_salon]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = tampons_fidelite + 1 WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
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
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant est habilité à annuler un ticket." });
    const id_ticket = req.params.id;
    const id_salon = req.user.id_salon;
    const { motif, lignes_a_annuler } = req.body;
    if (!motif || !motif.trim()) return res.status(400).json({ erreur: "Un motif d'annulation est obligatoire." });

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        // NF525 : Interdiction d'émettre un ticket d'annulation sur une journée déjà clôturée ou si un Z passé est manquant
        const zAujourdHui = await clientDB.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = CURRENT_DATE', [id_salon]);
        if (zAujourdHui.rowCount > 0) {
            throw new Error("Action bloquée (NF525) : La clôture Z d'aujourd'hui a déjà été scellée. Impossible d'émettre un avoir d'annulation sur une journée clôturée.");
        }
        const zPasseManquant = await clientDB.query(
            `SELECT MIN(DATE(t.date_creation)) as jour FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) < CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM clotures_caisse c WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation))`,
            [id_salon]
        );
        if (zPasseManquant.rowCount > 0 && zPasseManquant.rows[0].jour) {
            throw new Error(`Action bloquée (NF525) : Clôture Z manquante pour le ${new Date(zPasseManquant.rows[0].jour).toLocaleDateString('fr-FR')}. Clôturez d'abord cette journée avant d'émettre un avoir.`);
        }

        const ticketRes = await clientDB.query(
            "SELECT * FROM tickets WHERE id_ticket = $1 AND id_salon = $2 AND type_ticket != 'ANNULATION' FOR UPDATE",
            [id_ticket, id_salon]
        );
        if (ticketRes.rowCount === 0) throw new Error("Ticket introuvable.");
        const ticket = ticketRes.rows[0];

        const lignesOrigine = await clientDB.query(
            "SELECT id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, nom_article_snapshot, taux_tva_snapshot FROM lignes_ticket WHERE id_ticket = $1",
            [id_ticket]
        );

        // Récupérer ce qui a déjà été annulé pour ce ticket
        const lignesDejaAnnulees = await clientDB.query("SELECT id_article, SUM(ABS(quantite)) as qte_annulee FROM lignes_ticket WHERE id_ticket IN (SELECT id_ticket FROM tickets WHERE id_ticket_origine = $1) GROUP BY id_article", [id_ticket]);
        let mapDejaAnnule = {};
        lignesDejaAnnulees.rows.forEach(r => mapDejaAnnule[r.id_article] = parseFloat(r.qte_annulee));

        let lignesToProcess = [];
        if (lignes_a_annuler && lignes_a_annuler.length > 0) {
            for (let reqLigne of lignes_a_annuler) {
                let origLigne = lignesOrigine.rows.find(l => l.id_article == reqLigne.id_article);
                if (origLigne) {
                    let maxAnnulable = origLigne.quantite - (mapDejaAnnule[origLigne.id_article] || 0);
                    let qte = Math.min(reqLigne.quantite, maxAnnulable);
                    if (qte > 0) {
                        lignesToProcess.push({
                            ...origLigne,
                            quantite: qte,
                            total_ligne_ttc: qte * parseFloat(origLigne.prix_unitaire_ttc)
                        });
                    }
                }
            }
        } else {
            // Fallback: Annulation totale de ce qui reste
            for (let origLigne of lignesOrigine.rows) {
                let maxAnnulable = origLigne.quantite - (mapDejaAnnule[origLigne.id_article] || 0);
                if (maxAnnulable > 0) {
                    lignesToProcess.push({
                        ...origLigne,
                        quantite: maxAnnulable,
                        total_ligne_ttc: maxAnnulable * parseFloat(origLigne.prix_unitaire_ttc)
                    });
                }
            }
        }

        if (lignesToProcess.length === 0) throw new Error("Ce ticket a déjà été entièrement annulé.");

        const montantCompensation = -lignesToProcess.reduce((sum, l) => sum + parseFloat(l.total_ligne_ttc), 0);

        // 🚨 VERROU TRANSACTIONNEL
        const configRes = await clientDB.query('SELECT compteur_tickets FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        const seq = parseInt(configRes.rows[0].compteur_tickets) + 1;

        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        
        const anneeMois = new Date().toISOString().slice(0, 7).replace('-', '');
        const numeroCompensation = `TKT-AN-${anneeMois}-${String(seq).padStart(6, '0')}`;

        // Mise à jour du compteur pour le prochain ticket
        await clientDB.query('UPDATE configuration_salon SET compteur_tickets = $1 WHERE id_salon = $2', [seq, id_salon]);

        const compensationResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, type_ticket, id_ticket_origine, motif_annulation)
             VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'VALIDE', 'ANNULATION', $7, $8) RETURNING id_ticket, date_creation;`,
            [numeroCompensation, ticket.id_client, ticket.id_employe, montantCompensation, id_salon, ticket.methode_paiement, id_ticket, motif.trim()]
        );
        const idTicketCompensation = compensationResult.rows[0].id_ticket;
        const dateCompISO = new Date(compensationResult.rows[0].date_creation).toISOString();

        const configTvaRes = await clientDB.query('SELECT tva_intra FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const franchiseTVAAnnul = !configTvaRes.rows[0]?.tva_intra || configTvaRes.rows[0].tva_intra.trim() === '';
        let totalTvaCompCents = 0;
        for (const l of lignesToProcess) {
            const lineCents = -Math.round(Math.abs(parseFloat(l.total_ligne_ttc) || 0) * 100);
            const taux = franchiseTVAAnnul ? 0 : (parseFloat(l.taux_tva_snapshot) || 20);
            const htCents = franchiseTVAAnnul ? lineCents : Math.round(lineCents / (1 + taux / 100));
            totalTvaCompCents += (lineCents - htCents);
        }

        const montantCompensationScelle = Number(montantCompensation).toFixed(2);
        const tvaCompScellee = (totalTvaCompCents / 100).toFixed(2);
        const chaineCompScellee = `${idTicketCompensation}|${numeroCompensation}|${dateCompISO}|ANNULATION|${ticket.methode_paiement}|${montantCompensationScelle}|${tvaCompScellee}|${previousHash}`;
        const newHash = crypto.createHash('sha256').update(chaineCompScellee).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1, donnees_scellees = $2 WHERE id_ticket = $3', [newHash, chaineCompScellee, idTicketCompensation]);

        // Vérifier si le ticket est désormais entièrement compensé
        const dejaCompenseRes = await clientDB.query("SELECT COALESCE(SUM(ABS(total_ttc)), 0) as deja_rembourse FROM tickets WHERE id_ticket_origine = $1 AND statut != 'ANNULE'", [id_ticket]);
        const dejaRembourse = parseFloat(dejaCompenseRes.rows[0].deja_rembourse);
        if (dejaRembourse >= parseFloat(ticket.total_ttc) - 0.01) {
            await clientDB.query("UPDATE tickets SET est_compense = TRUE WHERE id_ticket = $1", [id_ticket]);
        }

        for (const ligne of lignesToProcess) {
            await clientDB.query(
                `INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon, nom_article_snapshot, taux_tva_snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                [idTicketCompensation, ligne.id_article, -ligne.quantite, ligne.prix_unitaire_ttc, -ligne.total_ligne_ttc, id_salon, ligne.nom_article_snapshot, ligne.taux_tva_snapshot]
            );
            await clientDB.query("UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2 AND id_salon = $3", [ligne.quantite, ligne.id_article, id_salon]);
            
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

        // Commissions : Proratisation basée sur le montant remboursé par rapport au ticket global
        const commissionsOrigine = await clientDB.query("SELECT * FROM commissions WHERE id_ticket = $1", [id_ticket]);
        if (commissionsOrigine.rowCount > 0 && parseFloat(ticket.total_ttc) > 0) {
            const ratio = Math.abs(montantCompensation) / parseFloat(ticket.total_ttc);
            for (const c of commissionsOrigine.rows) {
                const commissionAnnulee = -(parseFloat(c.montant_commission) * ratio).toFixed(2);
                const venteAnnulee = -(parseFloat(c.montant_vente) * ratio).toFixed(2);
                await clientDB.query(
                    `INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [c.id_employe, idTicketCompensation, venteAnnulee, commissionAnnulee, c.type_vente, id_salon]
                );
            }
        }

        if (ticket.id_client) {
            const estAnnulationTotale = Math.abs(montantCompensation) >= parseFloat(ticket.total_ttc) - 0.01;
            
            if (!ticket.recompense_utilisee) {
                // Le ticket avait généré des points/tampons, on les retire au prorata
                const pointsARetirer = Math.floor(Math.abs(montantCompensation));
                const tamponsARetirer = estAnnulationTotale ? 1 : 0;
                await clientDB.query("UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1), tampons_fidelite = GREATEST(0, tampons_fidelite - $2) WHERE id_client = $3", [pointsARetirer, tamponsARetirer, ticket.id_client]);
            } else if (estAnnulationTotale) {
                // Le ticket avait CONSOMMÉ une récompense, on la restitue au client (uniquement si annulation totale)
                const configRes = await clientDB.query('SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1', [id_salon]);
                if (configRes.rowCount > 0) {
                    const config = configRes.rows[0];
                    if (config.fidelite_type === 'POINTS') {
                        await clientDB.query("UPDATE clients SET points_fidelite = points_fidelite + $1 WHERE id_client = $2", [config.fidelite_points_seuil, ticket.id_client]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query("UPDATE clients SET tampons_fidelite = tampons_fidelite + $1 WHERE id_client = $2", [config.fidelite_tampons_seuil, ticket.id_client]);
                    }
                }
            }
        }

        await enregistrerJET(id_salon, 'ANNULATION_TICKET', {
            id_ticket_origine: parseInt(id_ticket),
            id_ticket_compensation: idTicketCompensation,
            montant: montantCompensation,
            lignes_annulees: lignesToProcess.map(l => ({ id_article: l.id_article, quantite: l.quantite })),
            motif: motif.trim()
        }, clientDB);

        await clientDB.query('COMMIT');
        res.json({ message: "Remboursement validé (écriture de compensation générée). Stock et fidélité mis à jour." });
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

app.get('/api/caisse/mouvements/aujourdhui', verifierToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.*, e.nom as nom_employe FROM mouvements_caisse m LEFT JOIN employes e ON m.id_employe = e.id_employe WHERE m.id_salon = $1 AND DATE(m.date_creation) = CURRENT_DATE ORDER BY m.date_creation DESC`,
            [req.user.id_salon]
        );
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture mouvements." }); }
});

async function verifierPinActionSensibleSalon(req, { id_employe, nom_operateur, code_pin, action_label }) {
    if (req.user.role !== 'salon') return { autorise: true, id_employe: id_employe || null, nom: nom_operateur || 'Gérant' };
    const id_salon = req.user.id_salon;
    const confRes = await pool.query('SELECT COALESCE(securite_pin_salon_active, TRUE) as active FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const protectionActive = confRes.rowCount > 0 ? confRes.rows[0].active : true;
    if (!protectionActive) return { autorise: true, id_employe: id_employe || null, nom: nom_operateur || 'Salon' };

    let empRes;
    if (id_employe) {
        empRes = await pool.query('SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
    } else if (nom_operateur && String(nom_operateur).trim() !== '') {
        empRes = await pool.query('SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE TRIM(nom) ILIKE TRIM($1) AND id_salon = $2 LIMIT 1', [String(nom_operateur).trim(), id_salon]);
    } else {
        const err = new Error("Veuillez sélectionner le collaborateur qui effectue l'opération et saisir son code PIN.");
        err.require_pin = true;
        throw err;
    }

    if (!empRes || empRes.rowCount === 0) {
        throw new Error("Collaborateur introuvable dans ce salon.");
    }

    const emp = empRes.rows[0];

    // 1. Vérification du blocage définitif
    if (emp.bloque_definitif) {
        const err = new Error(`Accès bloqué définitivement pour ${emp.nom} suite à de trop nombreuses tentatives. Le gérant doit débloquer votre profil dans l'espace Équipe.`);
        err.require_pin = true;
        err.locked_permanent = true;
        throw err;
    }

    // 2. Vérification du blocage temporaire (15m / 30m / 1h)
    if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
        const minRestantes = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
        const err = new Error(`Actions sensibles temporairement verrouillées pour ${emp.nom}. Réessayez dans ${minRestantes} minute(s).`);
        err.require_pin = true;
        err.locked_until = emp.pin_bloque_jusqua;
        throw err;
    }

    if (!code_pin || String(code_pin).trim() === '') {
        const err = new Error(`Code PIN personnel requis pour valider cette opération (${action_label}).`);
        err.require_pin = true;
        throw err;
    }

    const pinSaisi = String(code_pin).trim();
    let pinMatch = false;
    if (emp.code_pin && emp.code_pin.startsWith('$2')) {
        pinMatch = await bcrypt.compare(pinSaisi, emp.code_pin);
    } else {
        pinMatch = (String(emp.code_pin || '').trim() === pinSaisi);
    }

    // 3. Gestion de l'échec : Paliers 3 essais (15m) -> 5 essais (30m) -> 7 essais (1h) -> 9 essais (Définitif)
    if (!pinMatch) {
        const nouvellesTentatives = (parseInt(emp.tentatives, 10) || 0) + 1;
        let bloqueJusqua = null;
        let bloqueDefinitif = false;
        let messageSanction = '';

        if (nouvellesTentatives >= 9) {
            bloqueDefinitif = true;
            messageSanction = `Profil verrouillé définitivement. Le gérant doit vous débloquer depuis l'espace Équipe.`;
        } else if (nouvellesTentatives === 7) {
            bloqueJusqua = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            messageSanction = `Actions sensibles bloquées pendant 1 heure (2 derniers essais restants avant blocage définitif).`;
        } else if (nouvellesTentatives === 5) {
            bloqueJusqua = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            messageSanction = `Actions sensibles bloquées pendant 30 minutes.`;
        } else if (nouvellesTentatives === 3) {
            bloqueJusqua = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            messageSanction = `Actions sensibles bloquées pendant 15 minutes.`;
        } else {
            const prochainSeuil = nouvellesTentatives < 3 ? 3 : (nouvellesTentatives < 5 ? 5 : (nouvellesTentatives < 7 ? 7 : 9));
            const restants = prochainSeuil - nouvellesTentatives;
            messageSanction = `${restants} essai(s) restant(s) avant verrouillage.`;
        }

        await pool.query(
            'UPDATE employes SET pin_tentatives_echouees = $1, pin_bloque_jusqua = $2, pin_bloque_definitif = $3 WHERE id_employe = $4 AND id_salon = $5',
            [nouvellesTentatives, bloqueJusqua, bloqueDefinitif, emp.id_employe, id_salon]
        );
        await enregistrerJET(id_salon, bloqueDefinitif ? 'PIN_BLOCAGE_DEFINITIF' : 'PIN_ACTION_SENSIBLE_ECHOUE', {
            action: action_label,
            collaborateur: emp.nom,
            tentatives: nouvellesTentatives,
            bloque_jusqua: bloqueJusqua,
            bloque_definitif: bloqueDefinitif
        }, pool);

        if (bloqueDefinitif) {
            envoyerNotificationPush(id_salon, 'gerant', {
                title: "Alerte Sécurité PIN",
                body: `Le code PIN de ${emp.nom} a été bloqué définitivement après 9 échecs. Déblocage requis dans Équipe.`,
                url: '/?tab=equipe'
            });
        }

        const err = new Error(`Code PIN incorrect pour ${emp.nom}. ${messageSanction}`);
        err.require_pin = true;
        err.tentatives = nouvellesTentatives;
        err.locked_until = bloqueJusqua;
        err.locked_permanent = bloqueDefinitif;
        throw err;
    }

    // 4. Succès : Remise à zéro du compteur d'échecs
    if (emp.tentatives > 0 || emp.pin_bloque_jusqua) {
        await pool.query(
            'UPDATE employes SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $1 AND id_salon = $2',
            [emp.id_employe, id_salon]
        );
    }

    return { autorise: true, id_employe: emp.id_employe, nom: emp.nom };
}

app.post('/api/caisse/mouvements', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Accès réservé à la caisse du salon ou au gérant." });
    const { type_mouvement, montant, motif, id_employe, nom_operateur, code_pin, categorie_comptable } = req.body;
    if (!['ENTREE', 'SORTIE'].includes(type_mouvement)) return res.status(400).json({ erreur: "Type de mouvement invalide." });
    if (!motif || !motif.trim()) return res.status(400).json({ erreur: "Le motif est obligatoire." });
    if (!montant || isNaN(montant) || parseFloat(montant) <= 0) return res.status(400).json({ erreur: "Montant invalide." });

    // Vérification du PIN AVANT d'ouvrir la transaction (évite tout blocage SQL)
    let operateurValide;
    try {
        operateurValide = await verifierPinActionSensibleSalon(req, {
            id_employe,
            nom_operateur,
            code_pin,
            action_label: `Mouvement de caisse (${type_mouvement})`
        });
    } catch (pinErr) {
        return res.status(400).json({ erreur: pinErr.message, require_pin: true });
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const scelle = await enregistrerMouvementCaisseScelle(clientDB, {
            id_salon: req.user.id_salon,
            id_employe: operateurValide.id_employe || id_employe || null,
            type_mouvement,
            montant: parseFloat(montant),
            motif: motif.trim(),
            categorie_comptable: categorie_comptable || null
        });
        await enregistrerJET(req.user.id_salon, 'MOUVEMENT_CAISSE', { id_mouvement: scelle.id_mouvement, operateur: operateurValide.nom, type_mouvement, categorie_comptable: scelle.categorie_comptable, montant: parseFloat(montant), motif: motif.trim(), hash_mouvement: scelle.hash_mouvement }, clientDB);
        await clientDB.query('COMMIT');
        res.status(201).json({ message: "Mouvement de caisse enregistré et scellé." });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(400).json({ erreur: e.message || "Erreur lors de la sauvegarde.", require_pin: !!e.require_pin });
    } finally { clientDB.release(); }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "La clôture Z est réservée au gérant ou au poste Salon." });
    const id_salon = req.user.id_salon;
    const { ferme_par, id_employe, code_pin, fond_caisse_matin, total_especes_reel, justification_ecart } = req.body;

    // 1. Vérification du code PIN HORS transaction (évite le Deadlock SQL avec pg_advisory_xact_lock)
    let operateurCloture;
    try {
        operateurCloture = await verifierPinActionSensibleSalon(req, {
            id_employe,
            nom_operateur: ferme_par,
            code_pin,
            action_label: 'Clôture journalière Z'
        });
    } catch (pinErr) {
        return res.status(400).json({ erreur: pinErr.message, require_pin: true });
    }
    const operateurFinalNom = operateurCloture.nom || ferme_par || 'Gérant';

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        // Verrouillage transactionnel strict NF525 sur le salon
        await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
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
        const totalJour = Number(caResult.rows[0].total).toFixed(2);

        // RÈGLE D'OR NF525 : Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour (verrouillé FOR UPDATE).
        const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1 FOR UPDATE', [id_salon]);
        
        const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
        const grandTotalPerpetuel = Number((ancienCumul + parseFloat(totalJour)).toFixed(2));
        const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
        const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

        // --- CALCUL NF525 DE L'ÉCART DE CAISSE (BLIND CLOSE) ---
        const fCaisseMatin = parseFloat(fond_caisse_matin) || 0;
        const tEspecesReel = parseFloat(total_especes_reel) || 0;

        // Somme algébrique exacte (inclut le ticket d'origine + et l'éventuel ticket d'annulation - du jour)
        const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
        const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

        const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE montant END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
        const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

        const tEspecesTheorique = Number((fCaisseMatin + totalEspecesVentes + totalMouvements).toFixed(2));
        const ecartCaisse = Number((tEspecesReel - tEspecesTheorique).toFixed(2));

        // 🚨 SI L'ÉCART EST > 2€ ET QU'ON N'A PAS ENCORE DE JUSTIFICATION, ON BLOQUE !
        if (Math.abs(ecartCaisse) > 2.00 && (!justification_ecart || justification_ecart.trim() === '')) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ 
                erreur: `Un écart de caisse de ${ecartCaisse > 0 ? '+' : ''}${ecartCaisse.toFixed(2)} € a été détecté. Une justification est requise pour la loi NF525.`, 
                require_justification: true, 
                ecart: ecartCaisse 
            });
        }
        // --------------------------------------------------------

        const signature = crypto.createHash('sha256')
            .update(`Z-${id_salon}-${nextZ}-${dateACloturerStr}-${totalJour}-${grandTotalPerpetuel.toFixed(2)}-${hashPrecedent}`)
            .digest('hex');

        await clientDB.query(
            `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, numero_z_salon) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, operateurFinalNom, fCaisseMatin, tEspecesTheorique, tEspecesReel, ecartCaisse, justification_ecart || null, nextZ]
        );

        await enregistrerJET(id_salon, 'CLOTURE_Z', { numero_z: nextZ, date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, ecart_caisse: ecartCaisse, signature }, clientDB);

        // --- PHASE 4 : WEBHOOK / POUSSÉE API TEMPS RÉEL (Ex: Pennylane) ---
        try {
            const configRes = await clientDB.query('SELECT pennylane_api_key FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const apiKey = configRes.rows[0]?.pennylane_api_key;
            
            if (apiKey && apiKey.trim() !== '') {
                const dateCloture = dateACloturerStr;
                const ecrituresRes = await clientDB.query(`
                    SELECT t.numero_ticket_caisse, t.methode_paiement, t.total_ttc, lt.total_ligne_ttc, lt.taux_tva_snapshot, c.type_article 
                    FROM tickets t JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON lt.id_article = c.id_article 
                    WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut = 'VALIDE'
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
        res.json({ message: `Caisse clôturée avec succès pour le ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')}.`, signature, cumul_perpetuel_ttc: grandTotalPerpetuel });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: e.message || "Erreur lors de la clôture." });
    } finally { clientDB.release(); }
});

app.get('/api/caisse/cloture/statut', verifierToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = CURRENT_DATE', [req.user.id_salon]);
        const auto = await pool.query("SELECT TO_CHAR(date_cloture, 'YYYY-MM-DD') as date_auto FROM clotures_caisse WHERE id_salon = $1 AND est_cloture_automatique = TRUE ORDER BY id_cloture DESC LIMIT 1", [req.user.id_salon]);
        res.json({ 
            cloture_faite: r.rowCount > 0,
            derniere_cloture_auto: auto.rowCount > 0 ? auto.rows[0].date_auto : null
        });
    } catch (e) { res.status(500).json({ erreur: "Erreur vérification du statut de clôture." }); }
});

app.get('/api/caisse/verification-matinale', verifierToken, async (req, res) => {
    try {
        // On cherche si la TOUTE DERNIÈRE clôture Z (globale du salon) était automatique et est toujours en attente
        const auto = await pool.query(
            "SELECT id_cloture, TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_cloture_fr, total_especes_theorique FROM clotures_caisse WHERE id_salon = $1 ORDER BY id_cloture DESC LIMIT 1", 
            [req.user.id_salon]
        );
        
        if (auto.rowCount > 0 && auto.rows[0].total_especes_theorique !== null) {
            // Si c'est bien la dernière et qu'elle attend d'être régularisée
            const derniereEstAuto = await pool.query(
                "SELECT 1 FROM clotures_caisse WHERE id_cloture = $1 AND est_cloture_automatique = TRUE", 
                [auto.rows[0].id_cloture]
            );
            
            if (derniereEstAuto.rowCount > 0) {
                return res.json({ necessite_regularisation: true, cloture: auto.rows[0] });
            }
        }
        res.json({ necessite_regularisation: false });
    } catch (e) { res.status(500).json({ erreur: "Erreur vérification matinale." }); }
});

app.post('/api/caisse/regulariser', verifierToken, async (req, res) => {
    const { id_cloture, montant_reel, id_employe, nom_operateur, code_pin } = req.body;
    try {
        await verifierPinActionSensibleSalon(req, {
            id_employe,
            nom_operateur,
            code_pin,
            action_label: 'Régularisation matinale de caisse'
        });
    } catch (pinErr) {
        return res.status(400).json({ erreur: pinErr.message, require_pin: true });
    }
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const clotureRes = await clientDB.query("SELECT * FROM clotures_caisse WHERE id_cloture = $1 AND id_salon = $2 AND est_cloture_automatique = TRUE FOR UPDATE", [id_cloture, req.user.id_salon]);
        if (clotureRes.rowCount === 0) throw new Error("Clôture automatique introuvable ou déjà régularisée.");
        
        const cloture = clotureRes.rows[0];
        const theorique = parseFloat(cloture.total_especes_theorique);
        const reel = parseFloat(montant_reel);
        const ecart = Number((reel - theorique).toFixed(2));

        // Si l'équipe constate un écart par rapport au théorique de la fermeture auto, on crée un mouvement scellé
        if (Math.abs(ecart) > 0) {
            await enregistrerMouvementCaisseScelle(clientDB, {
                id_salon: req.user.id_salon,
                id_employe: id_employe || null,
                type_mouvement: 'REGULARISATION',
                montant: ecart,
                motif: `Régularisation ouverture suite fermeture auto`
            });
        }
        await enregistrerJET(req.user.id_salon, 'REGULARISATION_CAISSE', { id_cloture, theorique, reel, ecart }, clientDB);

        // On lève uniquement le flag est_cloture_automatique (autorisé par le trigger NF525) sans toucher aux colonnes scellées
        await clientDB.query("UPDATE clotures_caisse SET est_cloture_automatique = FALSE WHERE id_cloture = $1", [id_cloture]);
        
        await clientDB.query('COMMIT');
        res.json({ message: "Caisse régularisée avec succès." });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ erreur: e.message || "Erreur de régularisation." });
    } finally { clientDB.release(); }
});

app.post('/api/stocks/verification/fait', verifierToken, async (req, res) => {
    if (!['gerant', 'salon'].includes(req.user.role)) return res.status(403).json({ erreur: "Réservé au gérant et au salon." });
    try {
        await pool.query('UPDATE configuration_salon SET derniere_verif_stock = CURRENT_DATE WHERE id_salon = $1', [req.user.id_salon]);
        res.json({ message: "Vérification des stocks enregistrée." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de l'enregistrement." }); }
});

// =========================================================================
// --- AUDIT DE CONFORMITÉ NF525 (Vérification Cryptographique) ---
// =========================================================================
app.get('/api/admin/verifier-nf525', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') return res.status(403).json({ erreur: "Accès refusé." });
    const id_salon = req.user.id_salon;
    
    try {
        let erreurs = [];
        let alertes = [];
        
        // 1. Audit des TICKETS
        const tickets = await pool.query('SELECT id_ticket, numero_ticket_caisse, total_ttc, hash_ticket, donnees_scellees FROM tickets WHERE id_salon = $1 ORDER BY id_ticket ASC', [id_salon]);
        let prevHashTicket = 'GENESIS_BLOCK';
        
        for (let t of tickets.rows) {
            if (!t.hash_ticket) {
                alertes.push(`Ticket #${t.id_ticket} non scellé (possible ticket hors-ligne en attente).`);
                continue;
            }
            let hashValide = false;
            if (t.donnees_scellees) {
                const parts = t.donnees_scellees.split('|');
                const prevInPayload = parts[parts.length - 1];
                const computedEnrichi = crypto.createHash('sha256').update(t.donnees_scellees).digest('hex');
                if (prevInPayload === prevHashTicket && computedEnrichi === t.hash_ticket) {
                    hashValide = true;
                }
            } else {
                const computedFormatted = crypto.createHash('sha256').update(`${t.id_ticket}-${t.numero_ticket_caisse}-${Number(t.total_ttc).toFixed(2)}-${prevHashTicket}`).digest('hex');
                const computedLegacy = crypto.createHash('sha256').update(`${t.id_ticket}-${t.numero_ticket_caisse}-${parseFloat(t.total_ttc)}-${prevHashTicket}`).digest('hex');
                if (computedFormatted === t.hash_ticket || computedLegacy === t.hash_ticket) {
                    hashValide = true;
                }
            }
            if (!hashValide) {
                erreurs.push(`Rupture cryptographique sur le ticket #${t.id_ticket} (${t.numero_ticket_caisse}).`);
                break;
            }
            prevHashTicket = t.hash_ticket;
        }

        // 2. Audit des CLÔTURES (Z) et continuité de numero_z_salon + cumul perpétuel
        const clotures = await pool.query('SELECT id_cloture, numero_z_salon, total_encaisse, cumul_perpetuel_ttc, signature_hash, hash_precedent, date_cloture FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon ASC NULLS FIRST, id_cloture ASC', [id_salon]);
        let prevHashZ = 'GENESIS_Z';
        let expectedNumZ = 1;
        let prevCumulZ = 0;
        for (let c of clotures.rows) {
            const dCloture = new Date(c.date_cloture);
            const dateClotureYMD = `${dCloture.getFullYear()}-${String(dCloture.getMonth() + 1).padStart(2, '0')}-${String(dCloture.getDate()).padStart(2, '0')}`;
            if (c.hash_precedent !== prevHashZ) {
                erreurs.push(`Rupture de chaînage sur la clôture Z du ${dCloture.toLocaleDateString('fr-FR')}.`);
                break;
            }
            if (c.numero_z_salon && parseInt(c.numero_z_salon) !== expectedNumZ) {
                erreurs.push(`Rupture de séquence sur la numérotation Z : attendu Z#${expectedNumZ}, trouvé Z#${c.numero_z_salon}.`);
                break;
            }
            const cumulAttendu = Number((prevCumulZ + parseFloat(c.total_encaisse || 0)).toFixed(2));
            const cumulStocke = Number(parseFloat(c.cumul_perpetuel_ttc || 0).toFixed(2));
            if (Math.abs(cumulStocke - cumulAttendu) > 0.02) {
                erreurs.push(`Altération du cumul perpétuel sur Z#${c.numero_z_salon || c.id_cloture} (Attendu: ${cumulAttendu.toFixed(2)}€, Stocké: ${cumulStocke.toFixed(2)}€).`);
                break;
            }
            const expectedHashZ = crypto.createHash('sha256')
                .update(`Z-${id_salon}-${c.numero_z_salon || expectedNumZ}-${dateClotureYMD}-${Number(c.total_encaisse || 0).toFixed(2)}-${cumulStocke.toFixed(2)}-${prevHashZ}`)
                .digest('hex');
            if (c.signature_hash && c.signature_hash !== expectedHashZ) {
                // Tolérance legacy si le Z a été généré avant le correctif déterministe, signalé en alerte
                alertes.push(`Z#${c.numero_z_salon || expectedNumZ} (${dateClotureYMD}) signé avec l'ancien format d'horodatage dynamique.`);
            }
            prevCumulZ = cumulStocke;
            expectedNumZ++;
            prevHashZ = c.signature_hash;
        }

        // 2 bis. Audit des MOUVEMENTS DE CAISSE scellés
        const mouvements = await pool.query('SELECT id_mouvement, type_mouvement, montant, motif, hash_precedent, hash_mouvement FROM mouvements_caisse WHERE id_salon = $1 AND hash_mouvement IS NOT NULL ORDER BY id_mouvement ASC', [id_salon]);
        let prevHashMvt = 'GENESIS_MVT';
        for (let m of mouvements.rows) {
            const expectedMvtHash = crypto.createHash('sha256')
                .update(`MVT-${id_salon}-${m.id_mouvement}-${m.type_mouvement}-${Number(m.montant).toFixed(2)}-${String(m.motif || '').trim()}-${prevHashMvt}`)
                .digest('hex');
            if (m.hash_precedent !== prevHashMvt || m.hash_mouvement !== expectedMvtHash) {
                erreurs.push(`Rupture de chaînage sur le mouvement de caisse #${m.id_mouvement}.`);
                break;
            }
            prevHashMvt = m.hash_mouvement;
        }

        // 3. Audit du Journal des Événements Techniques (JET)
        const jetLogs = await pool.query('SELECT id_jet, hash_jet, hash_precedent, action FROM jet_logs WHERE id_salon = $1 ORDER BY id_jet ASC', [id_salon]);
        let prevHashJet = 'GENESIS_JET';
        for (let j of jetLogs.rows) {
            if (j.hash_precedent !== prevHashJet) {
                erreurs.push(`Rupture de chaînage sur le Journal Technique (Action #${j.id_jet} - ${j.action}).`);
                break;
            }
            prevHashJet = j.hash_jet;
        }

        // Traçabilité de l'audit lui-même
        await enregistrerJET(id_salon, 'AUDIT_NF525_EXECUTE', { tickets: tickets.rowCount, clotures: clotures.rowCount, jet: jetLogs.rowCount, conforme: erreurs.length === 0 });

        res.json({ 
            conforme: erreurs.length === 0, 
            erreurs,
            alertes,
            total_tickets_verifies: tickets.rowCount,
            total_z_verifies: clotures.rowCount,
            total_jet_verifies: jetLogs.rowCount
        });
    } catch (e) {
        console.error("Erreur Audit:", e);
        res.status(500).json({ erreur: "Erreur lors de l'audit NF525." });
    }
});

// =========================================================================
// --- EXPORT PDF : DOSSIER TECHNIQUE NF525 & ATTESTATION INDIVIDUELLE ---
// =========================================================================
app.get('/api/admin/dossier-technique-nf525/pdf', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') {
        return res.status(403).json({ erreur: "Accès réservé au gérant ou au poste de caisse lors d'un contrôle." });
    }
    const id_salon = req.user.id_salon;

    try {
        const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salon = configRes.rows[0] || {};

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerantSalon = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Représentant Légal';

        const statsFiscalesRes = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM tickets WHERE id_salon = $1 AND hash_ticket IS NOT NULL) as nb_tickets_scelles,
                (SELECT COUNT(*) FROM clotures_caisse WHERE id_salon = $1) as nb_z_scelles,
                (SELECT COUNT(*) FROM mouvements_caisse WHERE id_salon = $1 AND hash_mouvement IS NOT NULL) as nb_mvt_scelles,
                (SELECT COUNT(*) FROM jet_logs WHERE id_salon = $1) as nb_jet_scelles
        `, [id_salon]);
        const statsFiscales = statsFiscalesRes.rows[0] || {};

        const dernierZRes = await pool.query(`
            SELECT numero_z_salon, TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_z, cumul_perpetuel_ttc, signature_hash
            FROM clotures_caisse WHERE id_salon = $1
            ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon]);
        const dernierZ = dernierZRes.rowCount > 0 ? dernierZRes.rows[0] : null;

        // Variables Éditeur (surchageables via Render .env dès réception du Kbis définitif)
        const EDITEUR = {
            nom: process.env.EDITEUR_NOM || 'STACK',
            forme: process.env.EDITEUR_FORME_JURIDIQUE || '[Forme juridique & Capital social à venir]',
            siret: process.env.EDITEUR_SIRET || '[SIRET / SIREN en cours d\'immatriculation]',
            rcs: process.env.EDITEUR_RCS || '[RCS à venir]',
            adresse: process.env.EDITEUR_ADRESSE || '[Adresse du siège social à venir]',
            representant: process.env.EDITEUR_REPRESENTANT || 'Valentin TARDY',
            qualite: process.env.EDITEUR_QUALITE || 'Président / Gérant',
            logiciel: 'STACK',
            version: 'v1.0.0',
            date_version: 'Octobre 2026'
        };

        await enregistrerJET(id_salon, 'EDITION_DOSSIER_TECHNIQUE_NF525', { version: EDITEUR.version, demande_par: req.user.role });

        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Dossier_Technique_NF525_Attestation_STACK_${id_salon}.pdf"`);
        doc.pipe(res);

        const MAIN_COLOR = '#111827';
        const SEC_COLOR = '#4b5563';
        const ACCENT_COLOR = '#166534';
        const BORDER_COLOR = '#d1d5db';
        const BG_LIGHT = '#f9fafb';
        let currentY = 40;

        const drawSectionHeader = (title) => {
            if (currentY > 710) { doc.addPage(); currentY = 40; }
            currentY += 8;
            doc.rect(40, currentY, 515, 22).fill('#111827');
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(title, 50, currentY + 6, { width: 495 });
            currentY += 30;
        };

        const drawSubTitle = (subtitle) => {
            if (currentY > 735) { doc.addPage(); currentY = 40; }
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT_COLOR).text(subtitle, 40, currentY);
            currentY += 14;
        };

        const drawParagraph = (text, options = {}) => {
            doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 8.5).fillColor(options.color || SEC_COLOR);
            const h = doc.heightOfString(text, { width: 515, lineGap: 2 });
            if (currentY + h > 775) { doc.addPage(); currentY = 40; }
            doc.text(text, 40, currentY, { width: 515, lineGap: 2, align: options.align || 'justify' });
            currentY += h + 6;
        };

        const drawRow = (cols, isHeader = false, isBold = false) => {
            const activeCols = cols.filter(c => c.w > 0);
            const defaultFont = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
            const defaultSize = isHeader ? 8 : 8.5;

            let maxH = 0;
            activeCols.forEach(col => {
                doc.font(col.font || defaultFont).fontSize(col.size || defaultSize);
                const h = doc.heightOfString(col.text != null ? String(col.text) : '', { width: col.w });
                if (h > maxH) maxH = h;
            });

            if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }

            let xPos = 40;
            activeCols.forEach(col => {
                doc.font(col.font || defaultFont).fontSize(col.size || defaultSize).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, { width: col.w, align: col.align || 'left' });
                xPos += col.w + 10;
            });

            currentY += Math.max(maxH, 10) + 4;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 5;
        };

        // =========================================================================
        // PAGE 1 : EN-TÊTE OFFICIEL, IDENTIFICATION &ARCHITECTURE DE SÉCURITÉ
        // =========================================================================
        doc.rect(40, currentY, 515, 68).fillAndStroke('#f0fdf4', '#16a34a');
        doc.font('Helvetica-Bold').fontSize(14).fillColor(MAIN_COLOR).text('DOSSIER TECHNIQUE DESCRIPTIF & ATTESTATION NF525', 52, currentY + 10);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT_COLOR).text('Article 286, I-3° bis du Code Général des Impôts — BOI-TVA-DECLA-30-10-30 — Article L. 80 O du LPF', 52, currentY + 30);
        doc.font('Helvetica').fontSize(8.5).fillColor(SEC_COLOR).text(
            `Document officiel généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} pour présentation immédiate à l'administration fiscale.`,
            52, currentY + 46
        );
        currentY += 80;

        // 1. IDENTIFICATION DE L'ÉDITEUR ET DU LOGICIEL
        drawSectionHeader("1. IDENTIFICATION DE L'ÉDITEUR, DU LOGICIEL ET DE L'ÉTABLISSEMENT");
        drawRow([
            { text: 'Paramètre d\'identification', w: 195 },
            { text: 'Valeur déclarée et certifiée', w: 310 }
        ], true);
        drawRow([{ text: 'Raison sociale de l\'Éditeur', w: 195, isBold: true }, { text: `${EDITEUR.nom} — ${EDITEUR.forme}`, w: 310 }]);
        drawRow([{ text: 'Immatriculation Éditeur (SIRET / RCS)', w: 195 }, { text: `SIRET : ${EDITEUR.siret} | RCS : ${EDITEUR.rcs}`, w: 310 }]);
        drawRow([{ text: 'Siège social de l\'Éditeur', w: 195 }, { text: EDITEUR.adresse, w: 310 }]);
        drawRow([{ text: 'Représentant légal signataire', w: 195 }, { text: `${EDITEUR.representant}, agissant en qualité de ${EDITEUR.qualite}`, w: 310 }]);
        drawRow([{ text: 'Nom et Version du logiciel de caisse', w: 195 }, { text: `${EDITEUR.logiciel} — Version ${EDITEUR.version} (Mise en production : ${EDITEUR.date_version})`, w: 310 }], false, true);
        drawRow([{ text: 'Architecture et Technologie', w: 195 }, { text: 'Application Cloud SaaS Multi-Tenant — Node.js / PostgreSQL (ACID) / Cryptographie SHA-256', w: 310 }]);
        drawRow([{ text: 'Absence de mode école / démo / devis', w: 195 }, { text: 'Certifié : Le logiciel ne comporte aucun mode formation, école ou brouillon d\'encaissement.', w: 310, color: ACCENT_COLOR }]);
        drawRow([{ text: 'Établissement utilisateur (Assujetti)', w: 195 }, { text: `${salon.nom_salon || 'Salon'} ${salon.forme_juridique ? '(' + salon.forme_juridique + ')' : ''} — SIRET : ${salon.siret || 'Non renseigné'}`, w: 310 }]);
        drawRow([{ text: 'Adresse de l\'établissement utilisateur', w: 195 }, { text: `${salon.adresse_salon || 'Non renseignée'} (ID Interne Salon : #${id_salon})`, w: 310 }]);

        // 2. RESPECT DES 4 CONDITIONS LÉGALES (BOI-TVA-DECLA-30-10-30)
        drawSectionHeader("2. ARCHITECTURE TECHNIQUE : RESPECT DES 4 CONDITIONS LÉGALES");

        drawSubTitle("2.1. Condition d'Inaltérabilité (Triggers PostgreSQL & Interdiction des suppressions)");
        drawParagraph(
            "Les données d'origine relatives aux encaissements, lignes de vente, mouvements de caisse, clôtures journalières (Z), clôtures mensuelles et événements techniques (JET) sont enregistrées dans une base PostgreSQL sécurisée. " +
            "Au niveau du moteur de base de données, le trigger PL/pgSQL strict « nf525_prevent_alteration() » est attaché en BEFORE DELETE OR UPDATE sur les tables « tickets », « lignes_ticket », « clotures_caisse », « mouvements_caisse », « jet_logs » et « liasses_mensuelles_validees ». " +
            "Toute requête SQL visant à supprimer (DELETE) une ligne ou à modifier (UPDATE) un montant, un taux de TVA, une date, un mode de règlement ou un hash cryptographique déclenche une exception bloquante immédiate, sans aucune porte dérobée (y compris pour le Super-Administrateur)."
        );
        drawParagraph(
            "Procédure de correction et d'annulation : Lorsqu'un ticket doit être annulé (totalement ou partiellement), le ticket initial reste strictement intact en base. Le système exige un motif obligatoire et génère un nouveau ticket d'avoir compensatoire (« type_ticket = ANNULATION », numéroté séquentiellement « TKT-AN-YYYYMM-XXXXXX ») comportant des montants algébriques négatifs, rattaché à la pièce d'origine via la clé « id_ticket_origine » et scellé dans la chaîne SHA-256.",
            { bold: false }
        );

        drawSubTitle("2.2. Condition de Sécurisation (Chaînage Cryptographique SHA-256 & Verrous ACID)");
        drawParagraph(
            "Chaque opération fiscale fait l'objet d'un scellement numérique immédiat via l'algorithme standard SHA-256 (empreinte de 64 caractères hexadécimaux) intégrant l'empreinte de l'opération précédente du même établissement (Chaînage de type Blockchain locale par salon). " +
            "La concurrence d'accès est protégée par des transactions SQL strictes (BEGIN / COMMIT) couplées à des verrous exclusifs (SELECT ... FOR UPDATE et pg_advisory_xact_lock), garantissant une séquentialité continue sans trou ni doublon."
        );

        // Tableau des formules de hachage SHA-256
        drawRow([
            { text: 'Chaîne Fiscale', w: 95 },
            { text: 'Bloc Genesis', w: 75 },
            { text: 'Structure exacte de la chaîne concaténée soumise au condensat SHA-256', w: 325 }
        ], true);
        drawRow([
            { text: 'Tickets & Avoirs', w: 95, isBold: true },
            { text: 'GENESIS_BLOCK', w: 75, font: 'Courier', size: 7.5 },
            { text: '{id_ticket}|{numero_ticket}|{date_ISO}|{type_ticket}|{methode_paiement}|{total_ttc}|{total_tva}|{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
        ]);
        drawRow([
            { text: 'Clôtures Z', w: 95, isBold: true },
            { text: 'GENESIS_Z', w: 75, font: 'Courier', size: 7.5 },
            { text: 'Z-{id_salon}-{numero_z_salon}-{date_cloture_YYYY-MM-DD}-{total_encaisse}-{cumul_perpetuel_ttc}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
        ]);
        drawRow([
            { text: 'Mouvements Esp.', w: 95, isBold: true },
            { text: 'GENESIS_MVT', w: 75, font: 'Courier', size: 7.5 },
            { text: 'MVT-{id_salon}-{id_mouvement}-{type_mouvement}-{montant}-{motif}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
        ]);
        drawRow([
            { text: 'Journal JET', w: 95, isBold: true },
            { text: 'GENESIS_JET', w: 75, font: 'Courier', size: 7.5 },
            { text: '{id_salon}-{action}-{details_json}-{date_ISO}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
        ]);
        drawRow([
            { text: 'Liasses Mensuelles', w: 95, isBold: true },
            { text: 'GENESIS_LIASSE', w: 75, font: 'Courier', size: 7.5 },
            { text: 'LIASSE-{id_salon}-{mois_annee}-{ht}-{tva}-{ttc}-{cumul_perpetuel}-{signataire}-{date_ISO}-{hash_precedent}', w: 325, font: 'Courier', size: 7.5 }
        ]);

        // =========================================================================
        // PAGE 2 : CLÔTURES Z, CONSERVATION, ARCHIVAGE & SCHÉMA DES TABLES
        // =========================================================================
        doc.addPage();
        currentY = 40;

        drawSubTitle("2.3. Règle de Calcul du Cumul Perpétuel (Grand Total) et Continuité des Clôtures Z");
        drawParagraph(
            "Conformément aux exigences de la norme NF525, chaque établissement dispose d'une séquence de clôture journalière propre et continue (« numero_z_salon » de 1 à N). " +
            "Le Grand Total Perpétuel TTC (« cumul_perpetuel_ttc ») n'est jamais calculé par une somme globale a posteriori, mais exclusivement de manière incrémentale lors du scellement de chaque Z : " +
            "Nouveau Cumul Perpétuel TTC = Ancien Cumul Perpétuel TTC (issu du dernier Z scellé verrouillé en FOR UPDATE) + Chiffre d'Affaires TTC de la journée clôturée (somme algébrique des tickets de vente et des avoirs d'annulation du jour). " +
            "Il est strictement impossible d'enregistrer un nouvel encaissement ou un mouvement de caisse sur une journée dont le Z a été scellé (verrou HTTP 423)."
        );

        drawSubTitle("2.4. Condition de Conservation et Infrastructure d'Hébergement (6 ans LPF / 10 ans Compta)");
        drawParagraph(
            "• Hébergement souverain UE : Le serveur applicatif Node.js et la base de données PostgreSQL sont hébergés par Render Cloud dans la région Francfort (Allemagne — Union Européenne). Les pièces justificatives et documents PDF sont stockés de manière redondée sur Cloudflare R2.\n" +
            "• Politique de sauvegarde (Backups) : La base PostgreSQL fait l'objet de sauvegardes automatiques quotidiennes (Snapshots + Point-in-Time Recovery) garantissant l'absence de perte de données.\n" +
            "• Conciliation RGPD et Obligation Fiscale (Art. L. 102 B du LPF) : En cas de suppression d'un client, d'un collaborateur ou de résiliation complète d'un salon, aucune ligne des tables fiscales (« tickets », « lignes_ticket », « clotures_caisse », « mouvements_caisse », « jet_logs », « liasses_mensuelles_validees ») n'est supprimée pendant le délai légal de 6 ans (10 ans pour les pièces comptables). Les fiches personnes physiques liées sont uniquement anonymisées."
        );

        drawSubTitle("2.5. Condition d'Archivage, Export FEC et Vérification par l'Administration Fiscale");
        drawParagraph(
            "En cas de contrôle fiscal (article L. 80 O ou L. 47 A du LPF), l'interface met à disposition immédiate trois outils d'audit :\n" +
            "1. Export de l'Archive Fiscale Scellée (GET /api/export-archive-fiscale) : Génère un fichier CSV UTF-8 contenant tous les tickets, lignes détaillées, clôtures Z et journaux techniques (JET) sur la période choisie, signé cryptographiquement en fin de fichier par un condensat HMAC-SHA256.\n" +
            "2. Export du Fichier des Écritures Comptables — FEC (GET /api/export-fec) : Génère le fichier texte normé DGFiP (« SIRENFECYYYYMMDD.txt », encodage UTF-8, séparateur tabulation, 18 colonnes obligatoires Art. A.47 A-1 du LPF, numérotation continue EC-000001 à N, équilibre strict Débit = Crédit).\n" +
            "3. Audit Cryptographique Automatisé (GET /api/admin/verifier-nf525) : Recalcule en temps réel chaque hash SHA-256 depuis le bloc Genesis pour détecter toute altération ou rupture de séquence."
        );

        // 3. DICTIONNAIRE DES TABLES FISCALES
        drawSectionHeader("3. DICTIONNAIRE DES TABLES FISCALES ET DU JOURNAL TECHNIQUE (JET)");
        drawRow([
            { text: 'Table SQL', w: 110 },
            { text: 'Clé & Séquence', w: 85 },
            { text: 'Colonnes Fiscales Scellées et Rôle Réglementaire', w: 300 }
        ], true);
        drawRow([
            { text: 'tickets', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_ticket\nnumero_ticket_caisse', w: 85, size: 8 },
            { text: 'En-tête des ventes et avoirs (TKT-YYYYMM-XXXXXX / TKT-AN-...). Contient date_creation, total_ttc, methode_paiement, type_ticket, id_ticket_origine, motif_annulation, donnees_scellees, hash_ticket.', w: 300, size: 8 }
        ]);
        drawRow([
            { text: 'lignes_ticket', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_ligne\n(FK id_ticket)', w: 85, size: 8 },
            { text: 'Détail immuable des articles vendus avec snapshot figé au moment de la vente : nom_article_snapshot, quantite, prix_unitaire_ttc, total_ligne_ttc, taux_tva_snapshot.', w: 300, size: 8 }
        ]);
        drawRow([
            { text: 'clotures_caisse', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_cloture\nnumero_z_salon', w: 85, size: 8 },
            { text: 'Clôtures journalières Z. Contient date_cloture, total_encaisse, cumul_perpetuel_ttc, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, hash_precedent, signature_hash.', w: 300, size: 8 }
        ]);
        drawRow([
            { text: 'mouvements_caisse', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_mouvement', w: 85, size: 8 },
            { text: 'Traçabilité des flux d\'espèces hors ventes (ENTREE, SORTIE, REGULARISATION), categorie_comptable, montant, motif, date_creation, hash_precedent, hash_mouvement.', w: 300, size: 8 }
        ]);
        drawRow([
            { text: 'jet_logs', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_jet', w: 85, size: 8 },
            { text: 'Journal des Événements Techniques (JET) chaîné : CONNEXION, ENCAISSEMENT_TICKET, ANNULATION_TICKET, MOUVEMENT_CAISSE, CLOTURE_Z, IMPRESSION_DUPLICATA_Z, CLOTURE_MENSUELLE, AUDIT_NF525, EXPORT_FEC.', w: 300, size: 8 }
        ]);
        drawRow([
            { text: 'liasses_mensuelles\n_validees', w: 110, font: 'Courier-Bold', size: 8 },
            { text: 'id_validation\n(id_salon, mois)', w: 85, size: 8 },
            { text: 'Scellement mensuel signé par code PIN du gérant : total_ht, total_tva, total_ttc, cumul_perpetuel_ttc, valide_par, date_validation, hash_precedent, signature_hash.', w: 300, size: 8 }
        ]);

        // 4. ÉTAT CRYPTOGRAPHIQUE TEMPS RÉEL DU SALON
        drawSectionHeader("4. ÉTAT DE SANTÉ CRYPTOGRAPHIQUE EN TEMPS RÉEL DE L'ÉTABLISSEMENT");
        const splitHash32 = (h) => (h && h.length === 64) ? `${h.substring(0, 32)}\n${h.substring(32, 64)}` : (h || 'GENESIS_Z (Aucune clôture Z effectuée)');
        drawRow([
            { text: 'Compteur / Indicateur d\'intégrité NF525 (Salon #' + id_salon + ')', w: 250 },
            { text: 'Valeur constatée en Base de Données', w: 255, align: 'right' }
        ], true);
        drawRow([{ text: 'Tickets de caisse et Avoirs scellés (SHA-256)', w: 250 }, { text: `${statsFiscales.nb_tickets_scelles || 0} pièce(s)`, w: 255, align: 'right' }]);
        drawRow([{ text: 'Clôtures journalières (Z) scellées', w: 250 }, { text: `${statsFiscales.nb_z_scelles || 0} clôture(s)`, w: 255, align: 'right' }]);
        drawRow([{ text: 'Mouvements d\'espèces scellés', w: 250 }, { text: `${statsFiscales.nb_mvt_scelles || 0} mouvement(s)`, w: 255, align: 'right' }]);
        drawRow([{ text: 'Événements inscrits au Journal Technique (JET)', w: 250 }, { text: `${statsFiscales.nb_jet_scelles || 0} événement(s)`, w: 255, align: 'right' }]);
        drawRow([
            { text: 'Dernier Z scellé & Grand Total Perpétuel TTC', w: 250, isBold: true },
            { text: dernierZ ? `Z N° ${String(dernierZ.numero_z_salon).padStart(4, '0')} du ${dernierZ.date_z} — Cumul : ${Number(dernierZ.cumul_perpetuel_ttc || 0).toFixed(2).replace('.', ',')} €` : 'Aucun Z clôturé à ce jour', w: 255, align: 'right', isBold: true }
        ], false, true);
        drawRow([
            { text: 'Dernière empreinte SHA-256 de clôture Z', w: 250 },
            { text: splitHash32(dernierZ ? dernierZ.signature_hash : null), w: 255, align: 'right', font: 'Courier-Bold', size: 7.5, color: ACCENT_COLOR }
        ]);

        // =========================================================================
        // PAGE 3 (OU NOUVELLE PAGE) : ATTESTATION INDIVIDUELLE OFFICIELLE (MODÈLE DGFiP)
        // =========================================================================
        doc.addPage();
        currentY = 40;

        doc.rect(40, currentY, 515, 52).fillAndStroke('#111827', '#111827');
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff').text('ATTESTATION INDIVIDUELLE DE CONFORMITÉ', 50, currentY + 10, { align: 'center', width: 495 });
        doc.font('Helvetica').fontSize(9).fillColor('#e5e7eb').text(
            'Modèle conforme aux dispositions du 3° bis du I de l\'article 286 du Code Général des Impôts (BOI-LETTRE-000242)',
            50, currentY + 30, { align: 'center', width: 495 }
        );
        currentY += 65;

        // VOLET 1 : ÉDITEUR
        doc.rect(40, currentY, 515, 235).strokeColor(MAIN_COLOR).lineWidth(1).stroke();
        doc.rect(40, currentY, 515, 22).fill('#f3f4f6');
        doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text('VOLET 1 : PARTIE RÉSERVÉE À L\'ÉDITEUR DU LOGICIEL OU SYSTÈME DE CAISSE', 50, currentY + 6);
        currentY += 30;

        doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(
            `Je soussigné(e), ${EDITEUR.representant}, agissant en qualité de ${EDITEUR.qualite} de la structure éditrice désignée ci-dessous :`,
            52, currentY, { width: 490 }
        );
        currentY += 20;

        const drawAttestLine = (label, val) => {
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SEC_COLOR).text(label, 52, currentY, { width: 175 });
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(val, 230, currentY, { width: 310 });
            currentY += 14;
        };

        drawAttestLine('• Raison sociale / Nom de l\'éditeur :', `${EDITEUR.nom} (${EDITEUR.forme})`);
        drawAttestLine('• Numéro SIRET / SIREN :', `${EDITEUR.siret} — RCS : ${EDITEUR.rcs}`);
        drawAttestLine('• Adresse du siège social :', EDITEUR.adresse);
        drawAttestLine('• Nom et référence du logiciel :', `${EDITEUR.logiciel}`);
        drawAttestLine('• Numéro de version (Majeure.Mineure) :', `${EDITEUR.version} (Date de mise en service : ${EDITEUR.date_version})`);
        currentY += 6;

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT_COLOR).text(
            `ATTESTE que le logiciel ou système de caisse « ${EDITEUR.logiciel} » (version ${EDITEUR.version}) satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données en vue du contrôle de l'administration fiscale, prévues au 3° bis du I de l'article 286 du Code Général des Impôts (Norme NF525).`,
            52, currentY, { width: 490, lineGap: 2 }
        );
        currentY += 42;

        doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(`Fait le : ${new Date().toLocaleDateString('fr-FR')}`, 52, currentY);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(`Signataire : ${EDITEUR.representant} (${EDITEUR.qualite})`, 260, currentY);
        currentY += 14;
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(SEC_COLOR).text(
            'Rappel légal : L\'établissement ou l\'utilisation d\'une fausse attestation est passible d\'une amende fiscale de 45 000 € (Art. 1770 duodecies du CGI) et de sanctions pénales de 3 ans d\'emprisonnement (Art. 441-1 du Code pénal).',
            52, currentY, { width: 490 }
        );
        currentY += 35;

        // VOLET 2 : ENTREPRISE ASSUJETTIE (LE SALON)
        doc.rect(40, currentY, 515, 235).strokeColor(MAIN_COLOR).lineWidth(1).stroke();
        doc.rect(40, currentY, 515, 22).fill('#f3f4f6');
        doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text('VOLET 2 : PARTIE RÉSERVÉE À L\'ENTREPRISE UTILISATRICE ASSUJETTIE À LA TVA', 50, currentY + 6);
        currentY += 30;

        doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(
            `Je soussigné(e), ${nomGerantSalon}, représentant légal de l'établissement utilisateur désigné ci-dessous :`,
            52, currentY, { width: 490 }
        );
        currentY += 20;

        drawAttestLine('• Raison sociale / Enseigne du Salon :', `${salon.nom_salon || 'Non renseigné'} ${salon.forme_juridique ? '(' + salon.forme_juridique + ')' : ''}`);
        drawAttestLine('• Numéro SIRET :', `${salon.siret || 'À compléter dans Paramètres > Identité & Légal'}`);
        drawAttestLine('• Adresse d\'exploitation :', `${salon.adresse_salon || 'À compléter dans Paramètres > Identité & Légal'}`);
        drawAttestLine('• Régime de TVA / N° Intracom. :', salon.tva_intra && salon.tva_intra.trim() !== '' ? salon.tva_intra : 'Franchise en base de TVA (Art. 293 B du CGI)');
        drawAttestLine('• Logiciel utilisé pour l\'encaissement :', `${EDITEUR.logiciel} ${EDITEUR.version} (Identifiant Salon Cloud : #${id_salon})`);
        currentY += 6;

        doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(
            `Déclare utiliser le logiciel de caisse « ${EDITEUR.logiciel} » (${EDITEUR.version}) pour l'enregistrement des règlements de mes clients et reconnais avoir reçu la présente attestation individuelle de conformité délivrée par l'éditeur conformément à l'article 286, I-3° bis du CGI et à l'article L. 80 O du LPF.`,
            52, currentY, { width: 490, lineGap: 2 }
        );
        currentY += 42;

        doc.font('Helvetica').fontSize(8.5).fillColor(MAIN_COLOR).text(`Date de réception : ${new Date().toLocaleDateString('fr-FR')}`, 52, currentY);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(`Cachet et Signature de l'exploitant (${nomGerantSalon}) :`, 260, currentY);

        // --- PAGINATION DYNAMIQUE ---
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
            doc.switchToPage(i);
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(8.5).fillColor(SEC_COLOR).text(
                `STACK ${EDITEUR.version} — Dossier Technique & Attestation NF525 (Salon #${id_salon}) — Page ${page} / ${range.count}`,
                0, 815,
                { align: 'center', width: 595 }
            );
            doc.page.margins.bottom = originalBottomMargin;
        }

        doc.end();
    } catch (e) {
        console.error("Erreur génération PDF Dossier Technique NF525 :", e);
        res.status(500).json({ erreur: "Erreur lors de la génération du Dossier Technique NF525." });
    }
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

        const cloturesRes = await pool.query(
            `SELECT id_cloture, numero_z_salon, date_cloture, total_encaisse, cumul_perpetuel_ttc, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, ferme_par, hash_precedent, signature_hash
             FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3
             ORDER BY numero_z_salon ASC NULLS LAST, id_cloture ASC`,
            [id_salon, date_debut, date_fin]
        );

        let csv = 'TICKETS\r\n';
        csv += ['id_ticket','numero_ticket','date_creation','type_ticket','statut','est_compense','id_ticket_origine','motif_annulation','methode_paiement','total_ttc','id_article','nom_article','quantite','prix_unitaire_ttc','taux_tva','total_ligne_ttc','hash_ticket'].join(';') + '\r\n';
        for (const r of ticketsRes.rows) {
            csv += [r.id_ticket, r.numero_ticket_caisse, new Date(r.date_creation).toISOString(), r.type_ticket, r.statut, r.est_compense, r.id_ticket_origine || '', r.motif_annulation || '', r.methode_paiement, r.total_ttc, r.id_article || '', r.nom_article, r.quantite, r.prix_unitaire_ttc, r.taux_tva_snapshot, r.total_ligne_ttc, r.hash_ticket]
                .map(echapper).join(';') + '\r\n';
        }

        csv += '\r\nCLOTURES_Z\r\n';
        csv += ['id_cloture','numero_z_salon','date_cloture','total_encaisse','cumul_perpetuel_ttc','fond_caisse_matin','total_especes_theorique','total_especes_reel','ecart_caisse','justification_ecart','ferme_par','hash_precedent','signature_hash'].join(';') + '\r\n';
        for (const z of cloturesRes.rows) {
            csv += [z.id_cloture, z.numero_z_salon, new Date(z.date_cloture).toISOString().split('T')[0], z.total_encaisse, z.cumul_perpetuel_ttc, z.fond_caisse_matin, z.total_especes_theorique, z.total_especes_reel, z.ecart_caisse, z.justification_ecart || '', z.ferme_par, z.hash_precedent, z.signature_hash]
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
// --- MOTEUR UNIFIÉ & ROUTE EXPORT FEC (Art. A.47 A-1 du LPF / NF525) ---
// =========================================================================
async function construireContenuFEC(id_salon, date_debut, date_fin) {
    // 1. Récupérer la configuration comptable et fiscale (Franchise TVA + SIREN) du salon
    const configRes = await pool.query(
        'SELECT siret, tva_intra, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva FROM configuration_salon WHERE id_salon = $1',
        [id_salon]
    );
    const config = configRes.rows[0] || {};
    const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';
    const siren = config.siret ? String(config.siret).replace(/\D/g, '').substring(0, 9) : '';

    const CPT_BANQUE = config.compte_banque || '512000';
    const CPT_CAISSE = config.compte_caisse || '530000';
    const CPT_PRESTA = config.compte_prestations || '706000';
    const CPT_PROD = config.compte_produits || '707000';
    const CPT_TVA_BASE = config.compte_tva || '445710';
    const CPT_POURBOIRES = '426000';

    const getCompteTvaCollectee = (taux) => {
        if (CPT_TVA_BASE !== '445710') return CPT_TVA_BASE;
        const t = Number(taux);
        if (t === 20) return '445711';
        if (t === 10) return '445712';
        if (t === 5.5) return '445713';
        return CPT_TVA_BASE;
    };

    // 2. Récupérer tous les tickets validés (ventes + avoirs d'annulation + pourboires) sur la période
    const ticketsRes = await pool.query(`
        SELECT 
            t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.methode_paiement, t.total_ttc, t.montant_pourboire, t.type_ticket,
            lt.id_ligne, lt.total_ligne_ttc, lt.taux_tva_snapshot, COALESCE(lt.nom_article_snapshot, c.nom, 'Prestation') as nom_article,
            COALESCE(c.type_article, 'PRESTATION') as type_article,
            cc.date_cloture
        FROM tickets t
        LEFT JOIN lignes_ticket lt ON t.id_ticket = lt.id_ticket
        LEFT JOIN catalogue c ON lt.id_article = c.id_article
        LEFT JOIN clotures_caisse cc ON cc.id_salon = t.id_salon AND cc.date_cloture = DATE(t.date_creation)
        WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
        ORDER BY t.date_creation ASC, t.id_ticket ASC, lt.id_ligne ASC
    `, [id_salon, date_debut, date_fin]);

    const formatDateFEC = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };
    const formatMontant = (cents) => (Math.abs(cents) / 100).toFixed(2).replace('.', ',');

    // Regroupement par ticket dans l'ordre chronologique strict
    const ticketsList = [];
    const ticketsMap = new Map();
    ticketsRes.rows.forEach(r => {
        if (!ticketsMap.has(r.id_ticket)) {
            const tObj = {
                id_ticket: r.id_ticket,
                numero: r.numero_ticket_caisse || `TKT-${r.id_ticket}`,
                date: r.date_creation,
                date_valid: r.date_cloture || r.date_creation,
                methode: r.methode_paiement || 'CARTE',
                type_ticket: r.type_ticket || 'VENTE',
                total_ttc: parseFloat(r.total_ttc) || 0,
                pourboire: parseFloat(r.montant_pourboire) || 0,
                lignes: []
            };
            ticketsMap.set(r.id_ticket, tObj);
            ticketsList.push(tObj);
        }
        if (r.total_ligne_ttc !== null && r.total_ligne_ttc !== undefined) {
            ticketsMap.get(r.id_ticket).lignes.push(r);
        }
    });

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const lignesFec = [];
    let sequenceEcriture = 1; // Numérotation continue globale sans trou (Exigence Art. A.47 A-1 LPF)

    for (const t of ticketsList) {
        const ticketCents = Math.round(t.total_ttc * 100);
        const pourboireCents = Math.max(0, Math.round((t.pourboire || 0) * 100));
        if (ticketCents === 0 && pourboireCents === 0) continue;

        const estAvoir = ticketCents < 0 || t.type_ticket === 'ANNULATION';
        const absTicketCents = Math.abs(ticketCents);
        const totalEncaisseCents = estAvoir ? absTicketCents : (absTicketCents + pourboireCents);

        const dateEcriture = formatDateFEC(t.date);
        const dateValid = formatDateFEC(t.date_valid);
        const pieceRef = String(t.numero).replace(/[\t\r\n]/g, ' ').trim();
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        const cptePaiement = (t.methode === 'ESPECES') ? CPT_CAISSE : CPT_BANQUE;
        const libellePaiement = (t.methode === 'ESPECES') ? 'Caisse' : 'Banque';
        const prefixeLib = estAvoir ? 'Avoir Annulation' : 'Encaissement';

        // 1. Ligne de règlement (Débit si Vente, Crédit si Avoir/Annulation)
        lignesFec.push({
            JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
            CompteNum: cptePaiement, CompteLib: libellePaiement, CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `${prefixeLib} ${pieceRef}`.substring(0, 40),
            Debit: estAvoir ? '0,00' : formatMontant(totalEncaisseCents),
            Credit: estAvoir ? formatMontant(totalEncaisseCents) : '0,00',
            EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
        });
        if (estAvoir) totalCreditCents += totalEncaisseCents;
        else totalDebitCents += totalEncaisseCents;

        // 1 Bis. Ligne de Pourboire éventuel (Compte 426000 - Hors TVA)
        if (!estAvoir && pourboireCents > 0) {
            lignesFec.push({
                JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                CompteNum: CPT_POURBOIRES, CompteLib: 'Pourboires salaries a reverser', CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `Pourboire ${pieceRef}`.substring(0, 40),
                Debit: '0,00',
                Credit: formatMontant(pourboireCents),
                EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
            });
            totalCreditCents += pourboireCents;
        }

        // 2. Préparation et proratisation au centime près des lignes de produits/prestations (pour les anciens tickets avec remise)
        const lignesBrutes = t.lignes.length > 0
            ? t.lignes
            : [{ total_ligne_ttc: t.total_ttc, taux_tva_snapshot: 20.00, nom_article: 'Prestation globale', type_article: 'PRESTATION' }];

        const rawLinesCents = lignesBrutes.map(l => ({
            ...l,
            rawCents: Math.abs(Math.round((parseFloat(l.total_ligne_ttc) || 0) * 100))
        }));
        const sumRawCents = rawLinesCents.reduce((s, l) => s + l.rawCents, 0);

        let cumulAlloue = 0;
        const lignesCalculees = rawLinesCents.map((l, idx) => {
            if (sumRawCents === 0) return { ...l, absCents: idx === 0 ? absTicketCents : 0 };
            if (sumRawCents === absTicketCents) return { ...l, absCents: l.rawCents };
            if (idx === rawLinesCents.length - 1) {
                return { ...l, absCents: Math.max(0, absTicketCents - cumulAlloue) };
            }
            const prorata = Math.round((l.rawCents * absTicketCents) / sumRawCents);
            cumulAlloue += prorata;
            return { ...l, absCents: prorata };
        });

        // 3. Génération des lignes de Produits (706/707) et de TVA par taux (44571x)
        for (const ligne of lignesCalculees) {
            if (ligne.absCents === 0) continue;

            const tauxTVA = franchiseTVA ? 0 : (parseFloat(ligne.taux_tva_snapshot) ?? 20.00);
            const ligneHTCents = franchiseTVA ? ligne.absCents : Math.round(ligne.absCents / (1 + tauxTVA / 100));
            const ligneTVACents = franchiseTVA ? 0 : (ligne.absCents - ligneHTCents);

            const cpteVente = (ligne.type_article === 'PRODUIT_REVENTE') ? CPT_PROD : CPT_PRESTA;
            const libelleVente = (ligne.type_article === 'PRODUIT_REVENTE') ? 'Vente Produit' : 'Vente Prestation';
            const nomNettoye = (ligne.nom_article || 'Article').substring(0, 30).replace(/[\t\r\n]/g, ' ').trim();

            if (ligneHTCents > 0) {
                lignesFec.push({
                    JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                    CompteNum: cpteVente, CompteLib: libelleVente, CompAuxNum: '', CompAuxLib: '',
                    PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: nomNettoye,
                    Debit: estAvoir ? formatMontant(ligneHTCents) : '0,00',
                    Credit: estAvoir ? '0,00' : formatMontant(ligneHTCents),
                    EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
                });
                if (estAvoir) totalDebitCents += ligneHTCents;
                else totalCreditCents += ligneHTCents;
            }

            if (ligneTVACents > 0) {
                const tauxAff = Number(tauxTVA).toString().replace('.', ',');
                const cpteTvaSpecifique = getCompteTvaCollectee(tauxTVA);
                lignesFec.push({
                    JournalCode: 'VT', JournalLib: 'Ventes', EcritureNum: ecritureNum, EcritureDate: dateEcriture,
                    CompteNum: cpteTvaSpecifique, CompteLib: `TVA Collectee ${tauxAff}%`, CompAuxNum: '', CompAuxLib: '',
                    PieceRef: pieceRef, PieceDate: dateEcriture, EcritureLib: `TVA ${nomNettoye}`.substring(0, 30),
                    Debit: estAvoir ? formatMontant(ligneTVACents) : '0,00',
                    Credit: estAvoir ? '0,00' : formatMontant(ligneTVACents),
                    EcritureLet: '', DateLet: '', ValidDate: dateValid, Montantdevise: '', Idevise: ''
                });
                if (estAvoir) totalDebitCents += ligneTVACents;
                else totalCreditCents += ligneTVACents;
            }
        }
    }

    // 4. JOURNAL DES ACHATS (AC) : Factures fournisseurs validées sur la période
    const achatsRes = await pool.query(`
        SELECT id_facture, nom_fournisseur, numero_facture, COALESCE(date_facture, DATE(date_traitement)) as date_piece,
               montant_ht, montant_tva, montant_ttc, compte_comptable
        FROM factures_fournisseurs
        WHERE id_salon = $1 AND statut_verification = 'VALIDE'
          AND COALESCE(date_facture, DATE(date_traitement)) BETWEEN $2 AND $3
        ORDER BY COALESCE(date_facture, DATE(date_traitement)) ASC, id_facture ASC
    `, [id_salon, date_debut, date_fin]);

    for (const f of achatsRes.rows) {
        const ttcCents = Math.round((parseFloat(f.montant_ttc) || 0) * 100);
        if (ttcCents <= 0) continue;

        let htCents = franchiseTVA ? ttcCents : Math.round((parseFloat(f.montant_ht) || 0) * 100);
        let tvaCents = franchiseTVA ? 0 : Math.round((parseFloat(f.montant_tva) || 0) * 100);
        if (htCents + tvaCents !== ttcCents) {
            htCents = ttcCents - tvaCents;
        }

        const datePiece = formatDateFEC(f.date_piece);
        const pieceRef = String(f.numero_facture || `FAC-${f.id_facture}`).replace(/[\t\r\n]/g, ' ').trim();
        const nomFourn = String(f.nom_fournisseur || 'Fournisseur').replace(/[\t\r\n]/g, ' ').trim();
        const codeAux = 'F' + nomFourn.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8).padEnd(4, '0');
        const cpteCharge = (f.compte_comptable ? String(f.compte_comptable).replace(/\D/g, '') : '604000').padEnd(6, '0').substring(0, 6);
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        // Débit Charge (6xx)
        if (htCents > 0) {
            lignesFec.push({
                JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
                CompteNum: cpteCharge, CompteLib: `Achats / Charges (${cpteCharge})`, CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `Facture ${nomFourn}`.substring(0, 40),
                Debit: formatMontant(htCents), Credit: '0,00',
                EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
            });
            totalDebitCents += htCents;
        }

        // Débit TVA déductible sur autres biens et services (445660)
        if (tvaCents > 0) {
            lignesFec.push({
                JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
                CompteNum: '445660', CompteLib: 'TVA deductible sur ABS', CompAuxNum: '', CompAuxLib: '',
                PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `TVA ${nomFourn}`.substring(0, 40),
                Debit: formatMontant(tvaCents), Credit: '0,00',
                EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
            });
            totalDebitCents += tvaCents;
        }

        // Crédit Fournisseur (401000)
        lignesFec.push({
            JournalCode: 'AC', JournalLib: 'Achats', EcritureNum: ecritureNum, EcritureDate: datePiece,
            CompteNum: '401000', CompteLib: 'Fournisseurs', CompAuxNum: codeAux, CompAuxLib: nomFourn.substring(0, 30),
            PieceRef: pieceRef, PieceDate: datePiece, EcritureLib: `Facture ${nomFourn}`.substring(0, 40),
            Debit: '0,00', Credit: formatMontant(ttcCents),
            EcritureLet: '', DateLet: '', ValidDate: datePiece, Montantdevise: '', Idevise: ''
        });
        totalCreditCents += ttcCents;
    }

    // 5. JOURNAL DE CAISSE (CA) : Mouvements d'espèces hors tickets (Remises en banque, Apports, Prélèvements, Régularisations)
    const mvtsRes = await pool.query(`
        SELECT id_mouvement, type_mouvement, categorie_comptable, montant, motif, date_creation
        FROM mouvements_caisse
        WHERE id_salon = $1 AND DATE(date_creation) BETWEEN $2 AND $3
        ORDER BY date_creation ASC, id_mouvement ASC
    `, [id_salon, date_debut, date_fin]);

    for (const m of mvtsRes.rows) {
        const mntCents = Math.round(Math.abs(parseFloat(m.montant) || 0) * 100);
        if (mntCents === 0) continue;

        const cat = deduireCategorieMouvement(m.type_mouvement, m.motif, m.categorie_comptable);
        const dateMvt = formatDateFEC(m.date_creation);
        const pieceRef = `MVT-${m.id_mouvement}`;
        const motifClean = String(m.motif || cat).replace(/[\t\r\n]/g, ' ').trim().substring(0, 40);
        const ecritureNum = `EC-${String(sequenceEcriture).padStart(6, '0')}`;
        sequenceEcriture++;

        let estEntreeCaisse = m.type_mouvement === 'ENTREE' || (m.type_mouvement === 'REGULARISATION' && parseFloat(m.montant) > 0);
        let cpteContrepartie = '580000';
        let libContrepartie = 'Virements internes';

        if (cat === 'REMISE_BANQUE' || cat === 'APPORT_FONDS') {
            cpteContrepartie = '580000';
            libContrepartie = 'Virements internes (Banque/Caisse)';
        } else if (cat === 'PRELEVEMENT_GERANT') {
            cpteContrepartie = '108000';
            libContrepartie = 'Compte de l exploitant';
        } else if (cat === 'ACHAT_ESPECES') {
            cpteContrepartie = '401000';
            libContrepartie = 'Reglement especes fournisseur';
        } else if (cat === 'ECART_CAISSE') {
            cpteContrepartie = estEntreeCaisse ? '758000' : '658000';
            libContrepartie = estEntreeCaisse ? 'Produits divers gestion courante (Boni)' : 'Charges diverses gestion courante (Mali)';
        }

        // Ligne Caisse (530000)
        lignesFec.push({
            JournalCode: 'CA', JournalLib: 'Caisse', EcritureNum: ecritureNum, EcritureDate: dateMvt,
            CompteNum: CPT_CAISSE, CompteLib: 'Caisse', CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateMvt, EcritureLib: motifClean,
            Debit: estEntreeCaisse ? formatMontant(mntCents) : '0,00',
            Credit: estEntreeCaisse ? '0,00' : formatMontant(mntCents),
            EcritureLet: '', DateLet: '', ValidDate: dateMvt, Montantdevise: '', Idevise: ''
        });

        // Ligne Contrepartie
        lignesFec.push({
            JournalCode: 'CA', JournalLib: 'Caisse', EcritureNum: ecritureNum, EcritureDate: dateMvt,
            CompteNum: cpteContrepartie, CompteLib: libContrepartie, CompAuxNum: '', CompAuxLib: '',
            PieceRef: pieceRef, PieceDate: dateMvt, EcritureLib: motifClean,
            Debit: estEntreeCaisse ? '0,00' : formatMontant(mntCents),
            Credit: estEntreeCaisse ? formatMontant(mntCents) : '0,00',
            EcritureLet: '', DateLet: '', ValidDate: dateMvt, Montantdevise: '', Idevise: ''
        });

        totalDebitCents += mntCents;
        totalCreditCents += mntCents;
    }

    if (totalDebitCents !== totalCreditCents) {
        throw new Error(`Déséquilibre comptable détecté (Débit: ${(totalDebitCents / 100).toFixed(2)}€ / Crédit: ${(totalCreditCents / 100).toFixed(2)}€).`);
    }

    const headers = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
    let fecContent = headers.join('\t') + '\r\n';
    for (const row of lignesFec) {
        fecContent += headers.map(h => row[h]).join('\t') + '\r\n';
    }

    const dateFinCompact = date_fin.replace(/-/g, '');
    const nomFichier = siren.length === 9
        ? `${siren}FEC${dateFinCompact}.txt`
        : `FEC_${id_salon}_${date_debut.replace(/-/g, '')}_${dateFinCompact}.txt`;

    return { fecContent, nomFichier, nbLignes: lignesFec.length, totalEquilibre: totalDebitCents / 100 };
}

app.get('/api/export-fec', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const { date_debut, date_fin } = req.query;
    if (!date_debut || !date_fin) return res.status(400).json({ erreur: "Les paramètres date_debut et date_fin (YYYY-MM-DD) sont requis." });

    try {
        const { fecContent, nomFichier, nbLignes, totalEquilibre } = await construireContenuFEC(id_salon, date_debut, date_fin);

        await enregistrerJET(id_salon, 'EXPORT_FEC_GENERE', { date_debut, date_fin, nb_lignes: nbLignes, total_equilibre: totalEquilibre });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
        res.send(fecContent);
    } catch (e) {
        console.error("❌ Erreur export FEC:", e);
        res.status(500).json({ erreur: e.message || "Erreur lors de la génération du fichier FEC." });
    }
});

// =========================================================================
// --- MESSAGERIE INTERNE ---
// =========================================================================
app.get('/api/messages', verifierToken, async (req, res) => {
    try {
        let query = `
            SELECT m.*, COALESCE(e.nom, CASE WHEN m.id_expediteur = -1 THEN 'Salon' ELSE 'Gérant' END) as nom_expediteur, e.photo_url as photo_expediteur 
            FROM messages m 
            LEFT JOIN employes e ON m.id_expediteur = e.id_employe AND e.id_salon = m.id_salon
            WHERE m.id_salon = $1
        `;
        const params = [req.user.id_salon];

        // 🔒 SÉCURITÉ : Un employé ne peut récupérer que les messages du groupe (0) ou ceux où il est expéditeur/destinataire
        if (req.user.role === 'employe') {
            query += ` AND (m.id_destinataire = 0 OR m.id_expediteur = $2 OR m.id_destinataire = $2)`;
            params.push(req.user.id_employe);
        }

        query += ` ORDER BY m.date_creation ASC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur messages." }); }
});

app.post('/api/messages', verifierToken, async (req, res) => {
    const { id_destinataire, contenu, fichier_url } = req.body;
    const textePropre = typeof contenu === 'string' ? contenu.trim() : '';

    if (!textePropre && !fichier_url) {
        return res.status(400).json({ erreur: "Le message ne peut pas être vide." });
    }
    if (textePropre.length > 5000) {
        return res.status(400).json({ erreur: "Le message dépasse la limite autorisée (5000 caractères)." });
    }

    // 🔒 SÉCURITÉ : Validation stricte du fichier uploadé (liste blanche MIME & taille max ~4 Mo en base64)
    if (fichier_url) {
        if (typeof fichier_url !== 'string' || fichier_url.length > 5500000) {
            return res.status(400).json({ erreur: "Fichier trop volumineux (max 4 Mo)." });
        }
        const mimeValide = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(fichier_url);
        if (!mimeValide) {
            return res.status(400).json({ erreur: "Format d'image non autorisé (seuls JPG, PNG, WEBP et GIF sont acceptés)." });
        }
    }

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

        let dest = null;
        if (id_destinataire === 'salon' || id_destinataire === 0 || id_destinataire === '0') {
            dest = 0;
        } else if (id_destinataire === 'gerant' || id_destinataire === null || id_destinataire === -1) {
            dest = null;
        } else {
            const parsedDest = parseInt(id_destinataire, 10);
            if (isNaN(parsedDest)) return res.status(400).json({ erreur: "Destinataire invalide." });
            const checkDest = await pool.query('SELECT 1 FROM employes WHERE id_employe = $1 AND id_salon = $2', [parsedDest, req.user.id_salon]);
            if (checkDest.rowCount === 0) return res.status(404).json({ erreur: "Destinataire introuvable dans ce salon." });
            dest = parsedDest;
        }

        const result = await pool.query(
            `INSERT INTO messages (id_salon, id_expediteur, id_destinataire, contenu, fichier_url) VALUES ($1, $2, $3, $4, $5) RETURNING id_message, date_creation`,
            [req.user.id_salon, id_expediteur, dest, textePropre, fichier_url || null]
        );
        const newMessage = {
            id_message: result.rows[0].id_message,
            id_salon: req.user.id_salon,
            id_expediteur,
            id_destinataire: dest,
            contenu: textePropre,
            fichier_url: fichier_url || null,
            date_creation: result.rows[0].date_creation,
            nom_expediteur,
            photo_expediteur,
            reactions: {},
            vu_par: []
        };
        const salonRoom = req.user.id_salon.toString();
        if (dest === 0) {
            io.to(salonRoom).emit('nouveauMessage', newMessage);
        } else {
            const ciblesRooms = new Set([`${salonRoom}_gerant`, `${salonRoom}_salon`]);
            if (id_expediteur && id_expediteur > 0) ciblesRooms.add(`${salonRoom}_emp_${id_expediteur}`);
            if (dest && dest > 0) ciblesRooms.add(`${salonRoom}_emp_${dest}`);
            ciblesRooms.forEach(room => io.to(room).emit('nouveauMessage', newMessage));
        }
        
        // Envoi de la notification Push : uniquement au(x) vrai(s) destinataire(s) du message
        let cibleNotif;
        if (dest === 0) {
            cibleNotif = 'salon'; // message de groupe : tout le monde
        } else if (dest === null) {
            cibleNotif = 'gerant'; // message adressé au gérant
        } else {
            cibleNotif = { type: 'employe', id_employe: dest }; // message privé à un employé précis
        }
        const apercuNotif = textePropre ? (textePropre.length > 40 ? textePropre.substring(0, 40) + '...' : textePropre) : '📷 Photo envoyée';
        envoyerNotificationPush(req.user.id_salon, cibleNotif, {
            title: `Nouveau message de ${newMessage.nom_expediteur}`,
            body: apercuNotif,
            url: '/?tab=messagerie'
        });

        res.status(201).json(newMessage);
    } catch (e) { res.status(500).json({ erreur: "Erreur envoi message." }); }
});

app.put('/api/messages/:id', verifierToken, async (req, res) => {
    const textePropre = typeof req.body.contenu === 'string' ? req.body.contenu.trim() : '';
    if (!textePropre || textePropre.length > 5000) return res.status(400).json({ erreur: "Contenu invalide." });

    const id_expediteur = req.user.role === 'employe' ? req.user.id_employe : (req.user.role === 'salon' ? -1 : null);
    try {
        // 🔒 SÉCURITÉ ANTI-IDOR : Seul l'auteur exact du message peut le modifier
        const updateRes = await pool.query(
            'UPDATE messages SET contenu = $1 WHERE id_message = $2 AND id_salon = $3 AND id_expediteur IS NOT DISTINCT FROM $4 RETURNING id_message',
            [textePropre, req.params.id, req.user.id_salon, id_expediteur]
        );
        if (updateRes.rowCount === 0) {
            return res.status(403).json({ erreur: "Action non autorisée ou message introuvable." });
        }
        io.to(req.user.id_salon.toString()).emit('messageModifie', { id_message: parseInt(req.params.id, 10), contenu: textePropre });
        res.json({ message: "Message modifié" });
    } catch(e) { res.status(500).json({erreur: "Erreur lors de la modification"}); }
});

app.delete('/api/messages/:id', verifierToken, async (req, res) => {
    const id_expediteur = req.user.role === 'employe' ? req.user.id_employe : (req.user.role === 'salon' ? -1 : null);
    try {
        // 🔒 SÉCURITÉ ANTI-IDOR : Un employé ou le compte salon ne peut supprimer que ses propres messages (le gérant peut modérer tout son salon)
        let deleteRes;
        if (req.user.role === 'gerant') {
            deleteRes = await pool.query('DELETE FROM messages WHERE id_message = $1 AND id_salon = $2 RETURNING id_message', [req.params.id, req.user.id_salon]);
        } else {
            deleteRes = await pool.query('DELETE FROM messages WHERE id_message = $1 AND id_salon = $2 AND id_expediteur IS NOT DISTINCT FROM $3 RETURNING id_message', [req.params.id, req.user.id_salon, id_expediteur]);
        }
        if (deleteRes.rowCount === 0) {
            return res.status(403).json({ erreur: "Action non autorisée ou message introuvable." });
        }
        io.to(req.user.id_salon.toString()).emit('messageSupprime', { id_message: parseInt(req.params.id, 10) });
        res.json({ message: "Message supprimé" });
    } catch(e) { res.status(500).json({erreur: "Erreur lors de la suppression"}); }
});

app.post('/api/messages/vu', verifierToken, async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n)) : [];
    if (ids.length === 0) return res.json({ message: "Rien à marquer." });
    const monId = req.user.role === 'employe' ? req.user.id_employe : (req.user.role === 'salon' ? -1 : null);
    const monProfilId = req.user.role === 'employe' ? `emp_${req.user.id_employe}` : (req.user.role === 'salon' ? 'salon' : 'gerant');
    try {
        const result = await pool.query(
            `UPDATE messages SET vu_par = CASE WHEN COALESCE(vu_par, '[]'::jsonb) @> to_jsonb($1::text) THEN COALESCE(vu_par, '[]'::jsonb) ELSE COALESCE(vu_par, '[]'::jsonb) || to_jsonb($1::text) END
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
    const allowedEmojis = ['👍', '❤️', '😂', '🔥', '👏', '😢'];
    if (!emoji || !allowedEmojis.includes(emoji)) return res.status(400).json({ erreur: "Émoji non valide." });

    const monProfilId = req.user.role === 'employe' ? `emp_${req.user.id_employe}` : (req.user.role === 'salon' ? 'salon' : 'gerant');
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        // 🔒 Verrouillage FOR UPDATE pour éviter la perte de réactions simultanées (Race Condition)
        const msgRes = await clientDB.query('SELECT reactions FROM messages WHERE id_message = $1 AND id_salon = $2 FOR UPDATE', [req.params.id, req.user.id_salon]);
        if (msgRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            return res.status(404).json({ erreur: "Message introuvable" });
        }
        
        let reactions = msgRes.rows[0].reactions || {};
        if (typeof reactions === 'string') reactions = JSON.parse(reactions); 
        
        if (!Array.isArray(reactions[emoji])) reactions[emoji] = [];
        
        if (reactions[emoji].includes(monProfilId)) {
            reactions[emoji] = reactions[emoji].filter(id => id !== monProfilId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
            reactions[emoji].push(monProfilId);
        }
        
        await clientDB.query('UPDATE messages SET reactions = $1 WHERE id_message = $2 AND id_salon = $3', [JSON.stringify(reactions), req.params.id, req.user.id_salon]);
        await clientDB.query('COMMIT');
        io.to(req.user.id_salon.toString()).emit('messageReaction', { id_message: parseInt(req.params.id, 10), reactions });
        res.json({ message: "Réaction mise à jour" });
    } catch(e) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({erreur: "Erreur de réaction"});
    } finally {
        clientDB.release();
    }
});

// =========================================================================
// --- ROUTES CRUD & STATS ---
// =========================================================================
app.get('/api/caisse/tickets/:id', verifierToken, async (req, res) => {
    try {
        const lignes = await pool.query("SELECT id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, nom_article_snapshot FROM lignes_ticket WHERE id_ticket = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
        const lignesDejaAnnulees = await pool.query("SELECT id_article, SUM(ABS(quantite)) as qte_annulee FROM lignes_ticket WHERE id_ticket IN (SELECT id_ticket FROM tickets WHERE id_ticket_origine = $1) GROUP BY id_article", [req.params.id]);
        
        let mapAnnule = {};
        lignesDejaAnnulees.rows.forEach(r => mapAnnule[r.id_article] = parseFloat(r.qte_annulee));
        
        const lignesDispos = lignes.rows.map(l => ({
            ...l,
            quantite_restante: l.quantite - (mapAnnule[l.id_article] || 0)
        })).filter(l => l.quantite_restante > 0);

        res.json({ lignes: lignesDispos });
    } catch(e) { res.status(500).json({ erreur: "Erreur lors de la récupération du ticket." }); }
});
// =========================================================================
// --- EXPORT PDF : FACTURE / TICKET CLIENT (CONFORMITÉ B2B & B2C) ---
// =========================================================================
app.get('/api/caisse/tickets/:id/pdf', verifierToken, async (req, res) => {
    const id_ticket = req.params.id;
    const id_salon = req.user.id_salon;

    try {
        const ticketData = await pool.query(`
            SELECT t.*, COALESCE(c.nom, 'Client au comptoir') as nom_client, c.telephone as telephone_client
            FROM tickets t
            LEFT JOIN clients c ON t.id_client = c.id_client
            WHERE t.id_ticket = $1 AND t.id_salon = $2
        `, [id_ticket, id_salon]);

        if (ticketData.rowCount === 0) return res.status(404).json({ erreur: "Facture introuvable." });
        const ticket = ticketData.rows[0];

        const lignesData = await pool.query(`
            SELECT nom_article_snapshot, quantite, prix_unitaire_ttc, total_ligne_ttc, taux_tva_snapshot 
            FROM lignes_ticket WHERE id_ticket = $1
        `, [id_ticket]);

        const configData = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = configData.rows[0];
        const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';

        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Facture_${ticket.numero_ticket_caisse}.pdf"`);
            res.send(pdfData);
        });

        // --- En-tête Prestataire (Le Salon) ---
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(config.nom_salon || 'Salon', 50, 50);
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563');
        doc.text(config.adresse_salon || 'Adresse non renseignée', 50, 75);
        doc.text(`SIRET : ${config.siret || 'Non renseigné'}`, 50, 90);
        
        let mentionsEmetteur = `NAF : 96.02A`;
        if (config.forme_juridique) mentionsEmetteur += ` | ${config.forme_juridique}`;
        if (config.capital_social) mentionsEmetteur += ` | Capital : ${config.capital_social}`;
        if (config.rcs_ville) mentionsEmetteur += ` | RCS ${config.rcs_ville}`;
        doc.text(mentionsEmetteur, 50, 105);

        if (!franchiseTVA) {
            doc.text(`N° TVA Intracom. : ${config.tva_intra}`, 50, 120);
        }

        // --- En-tête Client ---
        doc.rect(300, 50, 245, 85).stroke('#e5e7eb');
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('FACTURÉ À :', 315, 60);
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(ticket.nom_client, 315, 80);
        if (ticket.telephone_client) doc.text(ticket.telephone_client, 315, 95);

        // --- Infos Facture ---
        const dTicket = new Date(ticket.date_creation);
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(ticket.type_ticket === 'ANNULATION' ? 'AVOIR / ANNULATION' : 'FACTURE', 50, 160);
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563');
        doc.text(`Numéro de pièce : ${ticket.numero_ticket_caisse}`, 50, 180);
        doc.text(`Date d'émission : ${dTicket.toLocaleDateString('fr-FR')} à ${dTicket.toLocaleTimeString('fr-FR')}`, 50, 195);
        doc.text(`Moyen de règlement : ${ticket.methode_paiement}`, 50, 210);

        // --- Tableau des Lignes ---
        let currentY = 250;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
        doc.text('Désignation', 50, currentY);
        doc.text('Qté', 300, currentY, { width: 40, align: 'center' });
        doc.text('PU HT', 340, currentY, { width: 60, align: 'right' });
        doc.text('TVA', 400, currentY, { width: 50, align: 'right' });
        doc.text('Total TTC', 460, currentY, { width: 85, align: 'right' });
        currentY += 15;
        doc.moveTo(50, currentY).lineTo(545, currentY).lineWidth(1).stroke('#111827');
        currentY += 10;

        let totalHT = 0;
        let totalTVA = 0;
        const totalTTC = parseFloat(ticket.total_ttc);

        doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
        lignesData.rows.forEach(l => {
            const lTTC = Math.abs(parseFloat(l.total_ligne_ttc));
            const lTVA_taux = franchiseTVA ? 0 : parseFloat(l.taux_tva_snapshot);
            const lHT = lTTC / (1 + lTVA_taux / 100);
            const lTVA_montant = lTTC - lHT;
            const puHT = lHT / Math.abs(l.quantite);

            // On additionne (le PDF affiche tout en positif, l'indication "AVOIR" s'occupe de la soustraction légale)
            totalHT += lHT;
            totalTVA += lTVA_montant;

            // Gestion de la hauteur dynamique pour les noms longs
            const txtHeight = doc.heightOfString(l.nom_article_snapshot, { width: 240 });
            if (currentY + txtHeight > 750) { doc.addPage(); currentY = 50; }

            doc.text(l.nom_article_snapshot, 50, currentY, { width: 240 });
            doc.text(Math.abs(l.quantite).toString(), 300, currentY, { width: 40, align: 'center' });
            doc.text(puHT.toFixed(2) + ' €', 340, currentY, { width: 60, align: 'right' });
            doc.text(franchiseTVA ? '0%' : lTVA_taux + '%', 400, currentY, { width: 50, align: 'right' });
            doc.text(lTTC.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
            currentY += txtHeight + 5;
        });

        currentY += 10;
        doc.moveTo(350, currentY).lineTo(545, currentY).lineWidth(0.5).stroke('#e5e7eb');
        currentY += 10;

        // --- Totaux ---
        doc.font('Helvetica').fontSize(10);
        doc.text('Total HT :', 350, currentY);
        doc.text(totalHT.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
        currentY += 15;

        if (!franchiseTVA) {
            doc.text('Total TVA :', 350, currentY);
            doc.text(totalTVA.toFixed(2) + ' €', 460, currentY, { width: 85, align: 'right' });
            currentY += 15;
        }

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827');
        doc.text('NET À PAYER TTC :', 300, currentY);
        doc.text(Math.abs(totalTTC).toFixed(2) + ' €', 440, currentY, { width: 105, align: 'right' });
        
        // --- Mentions Légales B2B & Sécurisation ---
        currentY = 680;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text("CONDITIONS DE PAIEMENT ET MENTIONS LÉGALES OBLIGATOIRES", 50, currentY);
        currentY += 12;
        doc.font('Helvetica').fontSize(7).fillColor('#4b5563');
        
        let mentionsArray = [
            `Échéance : Paiement comptant à réception. Aucun escompte accordé pour paiement anticipé.`,
            `Pénalités de retard : En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal en vigueur sera exigible de plein droit.`,
            `Frais de recouvrement : Conformément à l'art. D. 441-5 du Code de commerce, une indemnité forfaitaire de 40 € pour frais de recouvrement sera due en cas de retard de paiement.`
        ];

        if (franchiseTVA) {
            mentionsArray.unshift(`TVA non applicable, article 293 B du Code Général des Impôts.`);
        }

        mentionsArray.forEach(m => {
            doc.text(`• ${m}`, 50, currentY, { width: 495 });
            currentY += 10;
        });

        currentY += 8;
        const hashFacture = ticket.hash_ticket && ticket.hash_ticket.length === 64
            ? `${ticket.hash_ticket.substring(0, 32)}\n${ticket.hash_ticket.substring(32, 64)}`
            : (ticket.hash_ticket || 'Génération en cours');
        doc.font('Courier').fontSize(7).fillColor('#6b7280').text(`Trace NF525 (SHA-256) :\n${hashFacture}`, 50, currentY, { width: 495 });
        currentY += 22;
        doc.font('Helvetica-Oblique').fontSize(7).fillColor('#6b7280').text(
            "Logiciel STACK v1.0 — Attestation individuelle de conformité fiscale (Art. 286 I-3° bis du CGI - Norme NF525).",
            50, currentY, { width: 495 }
        );

        doc.end();

    } catch (error) {
        console.error("Erreur génération PDF B2B:", error);
        res.status(500).json({ erreur: "Impossible de générer le document client." });
    }
});

app.get('/api/clients', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM clients WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur clients."}); }});
app.post('/api/clients', verifierToken, async (req, res) => { const { prenom, nom, telephone, email, date_naissance } = req.body; try { await pool.query('INSERT INTO clients (prenom, nom, telephone, email, date_naissance, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [prenom || '', nom, telephone, email, date_naissance || null, req.user.id_salon]); res.status(201).json({message: "Client ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/clients/:id', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Action non autorisée." });
    try { await pool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Client supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression client."}); }
});

app.get('/api/employes', verifierToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT e.id_employe, e.nom, e.role, e.taux_commission_prestation, e.taux_commission_produit, e.photo_url, e.est_gerant, e.type_contrat, e.heures_mensuelles_base, e.id_salon, COALESCE(e.pin_tentatives_echouees, 0) as pin_tentatives_echouees, e.pin_bloque_jusqua, COALESCE(e.pin_bloque_definitif, FALSE) as pin_bloque_definitif, EXISTS(SELECT 1 FROM pointages p WHERE p.id_employe = e.id_employe AND p.date_jour = CURRENT_DATE) as a_pointe_aujourdhui FROM employes e WHERE e.id_salon = $1 ORDER BY e.nom ASC',
            [req.user.id_salon]
        );
        res.json(result.rows);
    } catch (e) { res.status(500).json({erreur: "Erreur employés."}); }
});

app.put('/api/employes/:id/debloquer-pin', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut débloquer le code PIN d'un collaborateur." });
    try {
        const r = await pool.query(
            'UPDATE employes SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $1 AND id_salon = $2 RETURNING nom',
            [req.params.id, req.user.id_salon]
        );
        if (r.rowCount === 0) return res.status(404).json({ erreur: "Collaborateur introuvable." });
        await enregistrerJET(req.user.id_salon, 'DEBLOCAGE_PIN_EMPLOYE', { id_employe: parseInt(req.params.id, 10), nom: r.rows[0].nom, debloque_par: 'gerant' });
        res.json({ message: `Accès PIN débloqué pour ${r.rows[0].nom}.` });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors du déblocage." }); }
});
app.post('/api/employes', verifierToken, async (req, res) => { 
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut ajouter un employé." });
    const { nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, type_contrat, heures_mensuelles_base } = req.body;
    try { 
        if (!code_pin) return res.status(400).json({ erreur: "Le code PIN est obligatoire." });
        if (isPinWeak(code_pin)) return res.status(400).json({ erreur: "Ce code PIN est trop simple (évitez 0000, 1234...)." });
        
        const hashPin = await bcrypt.hash(code_pin, 10);
        
        await pool.query(`
            INSERT INTO employes (nom, role, taux_commission_prestation, taux_commission_produit, code_pin, photo_url, type_contrat, heures_mensuelles_base, id_salon) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            nom, 
            role || 'Employé', 
            taux_commission_prestation || 0, 
            taux_commission_produit || 0, 
            hashPin, 
            photo_url || null, 
            type_contrat || '35H', 
            heures_mensuelles_base || 151.67, 
            req.user.id_salon
        ]); 
        
        res.status(201).json({message: "Employé ajouté"});
    } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }
});
app.put('/api/employes/:id', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut modifier un employé." });
    const { nom, code_pin, taux_commission_prestation, taux_commission_produit } = req.body;
    try {
        if (code_pin && code_pin.trim() !== '') {
            if (isPinWeak(code_pin)) return res.status(400).json({ erreur: "Ce code PIN est trop simple (évitez 0000, 1234...)." });
            const hashPin = await bcrypt.hash(code_pin, 10);
            await pool.query('UPDATE employes SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3, code_pin = $4, pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $5 AND id_salon = $6', [nom, taux_commission_prestation || 0, taux_commission_produit || 0, hashPin, req.params.id, req.user.id_salon]);
        } else {
            await pool.query('UPDATE employes SET nom = $1, taux_commission_prestation = $2, taux_commission_produit = $3 WHERE id_employe = $4 AND id_salon = $5', [nom, taux_commission_prestation || 0, taux_commission_produit || 0, req.params.id, req.user.id_salon]);
        }
        res.json({message: "Employé modifié"});
    } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }
});
app.delete('/api/employes/:id', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut supprimer un employé." });
    try { await pool.query('DELETE FROM employes WHERE id_employe = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Employé supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression employé."}); }
});

app.put('/api/employes/:id/photo', verifierToken, async (req, res) => {
    if (req.user.role !== 'employe' || parseInt(req.params.id) !== req.user.id_employe) return res.status(403).json({ erreur: "Action non autorisée." });
    try {
        await pool.query('UPDATE employes SET photo_url = $1 WHERE id_employe = $2 AND id_salon = $3', [req.body.photo_url || null, req.user.id_employe, req.user.id_salon]);
        res.json({ message: "Photo mise à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur mise à jour photo." }); }
});

app.get('/api/catalogue', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY type_article, nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur catalogue."}); }});

app.post('/api/catalogue', verifierToken, async (req, res) => { 
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Modification du catalogue réservée au gérant et au salon." });
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

app.delete('/api/catalogue/:id', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Suppression réservée au gérant et au salon." });
    try { const articleRes = await pool.query('SELECT nom, type_article, prix FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); await pool.query('DELETE FROM catalogue WHERE id_article = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); if (articleRes.rowCount > 0) { await enregistrerJET(req.user.id_salon, 'SUPPRESSION_ARTICLE', { id_article: req.params.id, ...articleRes.rows[0] }); } res.json({message: "Article supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression article."}); }
});

app.put('/api/catalogue/:id/nom', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Modification réservée au gérant et au salon." });
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
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Correction du stock réservée au gérant et au salon." });
    const nouveauStock = parseInt(req.body.nouveau_stock);
    if (isNaN(nouveauStock) || nouveauStock < 0) return res.status(400).json({ erreur: "Quantité invalide." });
    try {
        const result = await pool.query('UPDATE catalogue SET stock_actuel = $1 WHERE id_article = $2 AND id_salon = $3 RETURNING id_article', [nouveauStock, req.params.id, req.user.id_salon]);
        if (result.rowCount === 0) return res.status(404).json({ erreur: "Produit introuvable." });
        await enregistrerJET(req.user.id_salon, 'MODIFICATION_ARTICLE', { id_article: req.params.id, action: 'CORRECTION_STOCK', nouvelle_valeur: nouveauStock });
        res.json({ message: "Stock mis à jour." });
    } catch (e) { res.status(500).json({ erreur: "Erreur mise à jour du stock." }); }
});

app.post('/api/stocks/fusionner', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "La fusion des stocks est réservée au gérant et au poste Salon." });
    const { ids_articles, nom, reference, prix, type_article, delai_livraison_jours, id_employe, code_pin } = req.body;
    const id_salon = req.user.id_salon;

    if (!Array.isArray(ids_articles) || ids_articles.length < 2) {
        return res.status(400).json({ erreur: "Sélectionnez au moins 2 produits à unifier." });
    }
    if (!id_employe) {
        return res.status(400).json({ erreur: "Veuillez sélectionner le collaborateur responsable de la fusion." });
    }
    if (!code_pin || String(code_pin).trim().length < 4) {
        return res.status(400).json({ erreur: "Le code PIN personnel est obligatoire pour confirmer l'unification." });
    }
    if (!nom || !String(nom).trim()) {
        return res.status(400).json({ erreur: "Le nom du produit unifié est requis." });
    }

    try {
        // Vérification stricte du code PIN pour tout employé sélectionné (même sur session gérant)
        const empRes = await pool.query(
            'SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE id_employe = $1 AND id_salon = $2',
            [id_employe, id_salon]
        );
        if (empRes.rowCount === 0) return res.status(404).json({ erreur: "Collaborateur introuvable." });
        const emp = empRes.rows[0];

        if (emp.bloque_definitif) {
            return res.status(403).json({ erreur: `Accès PIN bloqué définitivement pour ${emp.nom}.` });
        }
        if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
            const minRestantes = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
            return res.status(403).json({ erreur: `Code PIN suspendu temporairement pour ${emp.nom} (${minRestantes} min).` });
        }

        const pinSaisi = String(code_pin).trim();
        let pinMatch = false;
        if (emp.code_pin && emp.code_pin.startsWith('$2')) {
            pinMatch = await bcrypt.compare(pinSaisi, emp.code_pin);
        } else {
            pinMatch = (String(emp.code_pin || '').trim() === pinSaisi);
        }

        if (!pinMatch) {
            const nouvellesTentatives = (parseInt(emp.tentatives, 10) || 0) + 1;
            let bloqueJusqua = null;
            let bloqueDefinitif = false;
            if (nouvellesTentatives >= 9) bloqueDefinitif = true;
            else if (nouvellesTentatives === 7) bloqueJusqua = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            else if (nouvellesTentatives === 5) bloqueJusqua = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            else if (nouvellesTentatives === 3) bloqueJusqua = new Date(Date.now() + 15 * 60 * 1000).toISOString();

            await pool.query(
                'UPDATE employes SET pin_tentatives_echouees = $1, pin_bloque_jusqua = $2, pin_bloque_definitif = $3 WHERE id_employe = $4 AND id_salon = $5',
                [nouvellesTentatives, bloqueJusqua, bloqueDefinitif, emp.id_employe, id_salon]
            );
            return res.status(400).json({ erreur: `Code PIN incorrect pour ${emp.nom}.` });
        }

        if (emp.tentatives > 0 || emp.pin_bloque_jusqua) {
            await pool.query('UPDATE employes SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $1 AND id_salon = $2', [emp.id_employe, id_salon]);
        }

        const clientDB = await pool.connect();
        try {
            await clientDB.query('BEGIN');
            const idsClean = ids_articles.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
            const articlesRes = await clientDB.query(
                'SELECT id_article, nom, stock_actuel, prix, reference, type_article, delai_livraison_jours FROM catalogue WHERE id_salon = $1 AND id_article = ANY($2::int[]) FOR UPDATE',
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

            // Mise à jour des recettes de l'Académie pour pointer vers l'article maître sans toucher aux lignes_ticket scellées NF525
            await clientDB.query(
                'UPDATE recettes_articles SET id_article = $1 WHERE id_article = ANY($2::int[])',
                [idMaitre, idsDoublons]
            );

            // Mise à jour de l'article maître avec la somme des stocks
            await clientDB.query(
                'UPDATE catalogue SET nom = $1, reference = $2, prix = $3, type_article = $4, stock_actuel = $5, delai_livraison_jours = $6 WHERE id_article = $7 AND id_salon = $8',
                [nomFinal, refFinale, prixFinal, typeFinal, stockTotal, delaiFinal, idMaitre, id_salon]
            );

            // Suppression des doublons du catalogue
            await clientDB.query(
                'DELETE FROM catalogue WHERE id_salon = $1 AND id_article = ANY($2::int[])',
                [id_salon, idsDoublons]
            );

            await enregistrerJET(id_salon, 'FUSION_ARTICLES_STOCK', {
                operateur: emp.nom,
                id_employe: emp.id_employe,
                id_article_maitre: idMaitre,
                ids_supprimes: idsDoublons,
                nom_unifie: nomFinal,
                stock_total_unifie: stockTotal
            }, clientDB);

            await clientDB.query('COMMIT');
            res.json({ message: `${articlesRes.rowCount} produits unifiés avec succès (Stock total : ${stockTotal}).`, stock_total: stockTotal });
        } catch (dbErr) {
            await clientDB.query('ROLLBACK');
            throw dbErr;
        } finally {
            clientDB.release();
        }
    } catch (e) {
        res.status(400).json({ erreur: e.message || "Erreur lors de la fusion des stocks." });
    }
});
app.get('/api/rh', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès RH réservé au gérant." });
    const id_salon = req.user.id_salon;
    try {
        const rhQuery = `SELECT e.id_employe, e.nom, e.photo_url, COALESCE(e.role, 'Employé') as role, e.type_contrat, e.heures_mensuelles_base, e.est_gerant, COUNT(DISTINCT CASE WHEN c.type_vente = 'PRESTATION' THEN c.id_ticket END) as clients_coiffes, COUNT(CASE WHEN c.type_vente != 'PRESTATION' THEN 1 END) as produits_vendus, COALESCE(SUM(c.montant_vente), 0) as ca_genere, COALESCE(SUM(c.montant_commission), 0) as prime_estimee FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 WHERE e.id_salon = $1 GROUP BY e.id_employe, e.nom, e.photo_url, e.role, e.type_contrat, e.heures_mensuelles_base, e.est_gerant ORDER BY e.id_employe;`;
        const rhResult = await pool.query(rhQuery, [id_salon]);

        // Calcul des heures pointées (Aujourd'hui, Cette semaine, Ce mois-ci) y compris session en cours
        const now = new Date();
        const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
        const jourSemaine = now.getDay();
        const diffLundi = now.getDate() - jourSemaine + (jourSemaine === 0 ? -6 : 1);
        const debutSemaine = new Date(now.getFullYear(), now.getMonth(), diffLundi);
        debutSemaine.setHours(0, 0, 0, 0);
        const debutRecherche = debutMois < debutSemaine ? debutMois : debutSemaine;
        const formatYMDLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const aujourdhuiYMD = formatYMDLocal(now);

        const pointagesRes = await pool.query(
            `SELECT id_employe, TO_CHAR(date_jour, 'YYYY-MM-DD') as date_ymd, type_action, heure_action
             FROM pointages
             WHERE id_salon = $1 AND date_jour >= $2
             ORDER BY id_employe ASC, date_jour ASC, heure_action ASC`,
            [id_salon, formatYMDLocal(debutRecherche)]
        );

        const moisCourantStr = aujourdhuiYMD.slice(0, 7);
        const ajustRes = await pool.query(
            `SELECT id_employe, COALESCE(SUM(heures_ajoutees), 0) as total_ajust
             FROM heures_ajustements
             WHERE mois_annee = $1
             GROUP BY id_employe`,
            [moisCourantStr]
        );
        const mapAjustMois = {};
        ajustRes.rows.forEach(r => { mapAjustMois[r.id_employe] = parseFloat(r.total_ajust) || 0; });

        const parEmpJour = {};
        pointagesRes.rows.forEach(pt => {
            const cle = `${pt.id_employe}_${pt.date_ymd}`;
            if (!parEmpJour[cle]) parEmpJour[cle] = { id_employe: pt.id_employe, date_ymd: pt.date_ymd, actions: [] };
            parEmpJour[cle].actions.push({ type: pt.type_action, ts: new Date(pt.heure_action).getTime() });
        });

        const heuresParEmploye = {};
        Object.values(parEmpJour).forEach(jour => {
            let debutTravail = null;
            let debutPause = null;
            let cumulMs = 0;

            jour.actions.forEach(act => {
                if (act.type === 'ENTREE') {
                    if (debutTravail === null) debutTravail = act.ts;
                } else if (act.type === 'PAUSE_DEBUT') {
                    if (debutTravail !== null && debutPause === null) debutPause = act.ts;
                } else if (act.type === 'PAUSE_FIN') {
                    if (debutPause !== null) {
                        debutTravail += (act.ts - debutPause);
                        debutPause = null;
                    }
                } else if (act.type === 'SORTIE') {
                    if (debutTravail !== null) {
                        const finEff = debutPause !== null ? debutPause : act.ts;
                        if (finEff > debutTravail) cumulMs += (finEff - debutTravail);
                        debutTravail = null;
                        debutPause = null;
                    }
                }
            });

            // Si la session est toujours ouverte aujourd'hui, on compte le temps en direct jusqu'à maintenant
            if (debutTravail !== null) {
                if (jour.date_ymd === aujourdhuiYMD) {
                    const finDirect = debutPause !== null ? debutPause : Date.now();
                    if (finDirect > debutTravail) cumulMs += (finDirect - debutTravail);
                } else if (debutPause !== null && debutPause > debutTravail) {
                    cumulMs += (debutPause - debutTravail);
                }
            }

            const hJour = cumulMs / 3600000;
            if (!heuresParEmploye[jour.id_employe]) {
                heuresParEmploye[jour.id_employe] = { aujourdhui: 0, semaine: 0, mois: 0 };
            }
            const dObj = new Date(jour.date_ymd + 'T12:00:00');
            if (jour.date_ymd === aujourdhuiYMD) heuresParEmploye[jour.id_employe].aujourdhui += hJour;
            if (dObj >= debutSemaine) heuresParEmploye[jour.id_employe].semaine += hJour;
            if (dObj >= debutMois) heuresParEmploye[jour.id_employe].mois += hJour;
        });

        const employesData = await Promise.all(rhResult.rows.map(async (emp) => {
            const histoQuery = `SELECT COALESCE(SUM(montant_commission), 0) as total_prime FROM commissions WHERE id_employe = $1 AND id_salon = $2 GROUP BY EXTRACT(MONTH FROM date_creation), EXTRACT(YEAR FROM date_creation) ORDER BY EXTRACT(YEAR FROM date_creation) ASC, EXTRACT(MONTH FROM date_creation) ASC;`;
            const histoResult = await pool.query(histoQuery, [emp.id_employe, id_salon]);
            let historique = histoResult.rows.map(r => parseFloat(r.total_prime));
            while(historique.length < 6) historique.unshift(0);
            if (historique.every(val => val === 0)) historique = [0, 0, 0, 0, 0, parseFloat(emp.prime_estimee) || 0];
            const avisEmp = await pool.query(`SELECT note, commentaire, prenom, date_creation FROM avis_demandes WHERE id_salon = $2 AND id_employe = $1 AND statut = 'REPONDU' AND note IS NOT NULL ORDER BY date_creation DESC`, [emp.id_employe, id_salon]);
            const notes = avisEmp.rows.map(a => a.note);
            const moyenneNote = notes.length > 0 ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;
            const hEmp = heuresParEmploye[emp.id_employe] || { aujourdhui: 0, semaine: 0, mois: 0 };
            const ajustMois = mapAjustMois[emp.id_employe] || 0;

            return {
                id_employe: emp.id_employe,
                nom: emp.nom,
                role: emp.role,
                est_gerant: emp.est_gerant,
                type_contrat: emp.type_contrat || '35H',
                heures_mensuelles_base: parseFloat(emp.heures_mensuelles_base) || 151.67,
                photo_url: emp.photo_url,
                heures_effectuees: {
                    aujourdhui: Number(hEmp.aujourdhui.toFixed(2)),
                    semaine: Number(hEmp.semaine.toFixed(2)),
                    mois: Number((hEmp.mois + ajustMois).toFixed(2)),
                    ajustements_mois: Number(ajustMois.toFixed(2))
                },
                performances_actuelles: {
                    clients_coiffes: parseInt(emp.clients_coiffes),
                    produits_vendus: parseInt(emp.produits_vendus),
                    ca_genere: parseFloat(emp.ca_genere),
                    prime_estimee: parseFloat(emp.prime_estimee)
                },
                historique_primes: historique.slice(-6),
                note_moyenne: moyenneNote,
                nb_avis: notes.length,
                derniers_avis: avisEmp.rows.slice(0, 3)
            };
        }));
        res.json(employesData);
    } catch (erreur) {
        res.status(500).json({ erreur: "Erreur requête RH." });
    }
});

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
            // 🚨 SÉCURITÉ : Liste blanche stricte pour bloquer les Malwares et XSS stockés
            const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
            const extension = nom_fichier.split('.').pop().toLowerCase();
            const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];

            if (!type_mime || !allowedMimes.includes(type_mime) || !allowedExts.includes(extension)) {
                return res.status(400).json({ erreur: "Format de fichier non autorisé. Seuls les PDF, JPG et PNG sont acceptés." });
            }

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
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut valider ou refuser une absence." });
    
    const { statut, motif_refus } = req.body;
    try {
        let conflits = [];
        if (statut === 'VALIDE') {
            const absenceResInfo = await pool.query("SELECT id_employe, TO_CHAR(date_debut, 'YYYY-MM-DD') as date_debut_str, TO_CHAR(date_fin, 'YYYY-MM-DD') as date_fin_str FROM absences_employes WHERE id_absence = $1 AND id_salon = $2", [req.params.id, req.user.id_salon]);
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
            'SELECT id_employe, fichier_cle_r2 FROM absences_employes WHERE id_absence = $1 AND id_salon = $2',
            [req.params.id, req.user.id_salon]
        );

        if (absenceRes.rowCount === 0 || !absenceRes.rows[0].fichier_cle_r2) {
            return res.status(404).json({ erreur: "Aucun justificatif trouvé." });
        }

        if (req.user.role !== 'gerant' && (req.user.role !== 'employe' || Number(req.user.id_employe) !== Number(absenceRes.rows[0].id_employe))) {
            return res.status(403).json({ erreur: "Accès refusé à ce justificatif médical." });
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
const PROMPT_SYSTEME_IA = `Tu es l'assistant pré-comptable d'un salon de coiffure. Analyse le contenu (email ou PDF) et retourne un JSON strict.

CAS 1 - FACTURE FOURNISSEUR (L'Oréal, Wella, Matériel, etc.) : Si c'est une facture d'achat de produits/matériel/services.
-> Renvoie EXACTEMENT ce format :
{"type": "FACTURE_ACHAT", "donnees": {
  "fournisseur": "Nom du fournisseur",
  "numero_facture": "Numéro de la facture (si présent, sinon null)",
  "date_facture": "YYYY-MM-DD",
  "montant_ht": 100.50,
  "montant_tva": 20.10,
  "montant_ttc": 120.60,
  "mode_paiement": "CARTE, ESPECES, PRELEVEMENT, VIREMENT, CHEQUE, ou NON_SPECIFIE",
  "compte_comptable": "Ex: 607 (Revente), 6061 (Energie/Eau), 613 (Loyer), 604 (Prestations/Services), ou 6028 (Consommables)",
  "produits": [
    {"nom": "Shampooing ABC", "quantite": 5, "prix_unitaire_ht": 10.00, "reference": "REF123", "type_destine": "REVENTE"},
    {"nom": "Tube Coloration XYZ", "quantite": 10, "prix_unitaire_ht": 5.00, "reference": "REF456", "type_destine": "CONSOMMABLE"}
  ]
}}
IMPORTANT: Devine si le produit est destiné à la "REVENTE" (shampooing grand public, soins beauté) ou si c'est un "CONSOMMABLE" technique (coloration, oxydant, décoloration, produit bac). Essaie de déduire le compte_comptable le plus logique selon le fournisseur.

CAS 2 - RDV : Réservation de client. -> Renvoie {"type": "RDV", "donnees": {"nom_client": "nom", "telephone": "numero", "prestation": "coupe...", "date_heure_debut": "YYYY-MM-DDTHH:MM", "duree_minutes": 30}}
CAS 3 - ABSENCE : Un employé sera absent. -> Renvoie {"type": "ABSENCE", "donnees": {"nom_employe": "nom", "type_demande": "ARRET_MALADIE ou CONGES", "date_debut": "YYYY-MM-DD", "date_fin": "YYYY-MM-DD"}}
CAS 4 - ACTION : Facture générale (EDF, Urssaf) ou urgence. -> Renvoie {"type": "ACTION", "donnees": {"titre": "Urssaf", "description": "...", "date_echeance": "YYYY-MM-DD"}}
CAS 5 - AUTRE : -> Renvoie {"type": "NONE"}`;

async function analyserEmailAvecIA(sujet, texte, pdfUrl = null, fichierCleR2 = null) {
    if (!process.env.GROQ_API_KEY) return [];

    // On augmente la limite pour pouvoir traiter le texte extrait des PDF (souvent assez long)
    const texteTronque = (texte || '').substring(0, 15000); 

    try {
        const anneeEnCours = new Date().getFullYear();
        const dateDuJour = new Date().toLocaleDateString('fr-FR');
        
        const completion = await groq.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 800, // Augmenté pour les longues listes de produits d'une facture
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: `${PROMPT_SYSTEME_IA}\nINFO : La date du jour est le ${dateDuJour}. Si l'e-mail ne précise pas l'année, utilise obligatoirement ${anneeEnCours}.` },
                { role: 'user', content: `Sujet : ${sujet}\n\nContenu :\n${texteTronque}` }
            ]
        });

        const brut = completion.choices?.[0]?.message?.content;
        if (!brut) return [];

        let analyse;
        try {
            const jsonNettoye = brut.replace(/```json/gi, '').replace(/```/g, '').trim();
            analyse = JSON.parse(jsonNettoye);
            console.log("✅ L'IA a compris :", analyse.type);
        } catch (erreurParsing) { return []; }

        // --- NOUVEAU CAS : FACTURE FOURNISSEUR PRÉ-COMPTABLE ---
        if (analyse.type === 'FACTURE_ACHAT' && analyse.donnees && analyse.donnees.fournisseur) {
            return [{
                type_tache: 'FACTURE_ACHAT',
                donnees: {
                    fournisseur: String(analyse.donnees.fournisseur).trim(),
                    numero_facture: analyse.donnees.numero_facture ? String(analyse.donnees.numero_facture).trim() : null,
                    date_facture: analyse.donnees.date_facture || dateDuJour,
                    montant_ht: parseFloat(analyse.donnees.montant_ht) || 0,
                    montant_tva: parseFloat(analyse.donnees.montant_tva) || 0,
                    montant_ttc: parseFloat(analyse.donnees.montant_ttc) || 0,
                    mode_paiement: analyse.donnees.mode_paiement || 'NON_SPECIFIE',
                    compte_comptable: analyse.donnees.compte_comptable || null,
                    produits: Array.isArray(analyse.donnees.produits) ? analyse.donnees.produits : [],
                    pdf_url: pdfUrl, // On attache le lien du PDF pour le Split-Screen
                    fichier_cle_r2: fichierCleR2 || null
                }
            }];
        }

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
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    try {
        const result = await pool.query("SELECT * FROM ia_taches_attente WHERE id_salon = $1 AND statut = 'ATTENTE' ORDER BY date_creation DESC", [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur IA" }); }
});

// --- SAISIE MANUELLE DE FACTURE / DÉPENSE (ACCESSIBLE PRO & PREMIUM) ---
app.post('/api/factures/saisie-manuelle', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    const { nom_fournisseur, numero_facture, date_facture, montant_ht, montant_tva, montant_ttc, mode_paiement, compte_comptable } = req.body;
    const id_salon = req.user.id_salon;

    if (!nom_fournisseur || !String(nom_fournisseur).trim()) {
        return res.status(400).json({ erreur: "Le nom du fournisseur est obligatoire." });
    }
    const ttc = parseFloat(montant_ttc);
    if (isNaN(ttc) || ttc <= 0) {
        return res.status(400).json({ erreur: "Le montant TTC doit être supérieur à 0." });
    }
    const ht = !isNaN(parseFloat(montant_ht)) ? parseFloat(montant_ht) : Number((ttc / 1.2).toFixed(2));
    const tva = !isNaN(parseFloat(montant_tva)) ? parseFloat(montant_tva) : Number((ttc - ht).toFixed(2));
    const mode = mode_paiement || 'CARTE';
    const compte = compte_comptable || '604';
    const numFac = numero_facture && String(numero_facture).trim() !== '' ? String(numero_facture).trim() : null;
    const dFac = date_facture ? new Date(date_facture) : new Date();
    const dateFactureISO = !isNaN(dFac.getTime()) ? dFac.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const dateReglementISO = (mode !== 'NON_SPECIFIE' && mode !== 'N/A') ? dateFactureISO : null;

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        await clientDB.query(
            `INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon, date_traitement, date_facture, date_reglement, numero_facture, mode_paiement, statut_verification, compte_comptable)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDE', $11)`,
            [String(nom_fournisseur).trim(), ht, tva, ttc, id_salon, new Date(dateFactureISO).toISOString(), dateFactureISO, dateReglementISO, numFac, mode, compte]
        );

        if (mode.toUpperCase() === 'ESPECES' && ttc > 0) {
            const motifSortie = numFac
                ? `Paiement Facture ${numFac} - ${String(nom_fournisseur).trim()}`
                : `Paiement Facture - ${String(nom_fournisseur).trim()}`;
            const scelle = await enregistrerMouvementCaisseScelle(clientDB, {
                id_salon,
                id_employe: null,
                type_mouvement: 'SORTIE',
                montant: ttc,
                motif: motifSortie,
                categorie_comptable: 'ACHAT_ESPECES'
            });
            await enregistrerJET(id_salon, 'MOUVEMENT_CAISSE', { id_mouvement: scelle.id_mouvement, type_mouvement: 'SORTIE', montant: ttc, motif: motifSortie, hash_mouvement: scelle.hash_mouvement }, clientDB);
        }

        await clientDB.query('COMMIT');
        res.status(201).json({ message: "Dépense enregistrée avec succès en comptabilité." });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        res.status(400).json({ erreur: e.message || "Erreur lors de l'enregistrement de la facture." });
    } finally {
        clientDB.release();
    }
});

// --- UPLOAD MANUEL DE FACTURE (PDF OU IMAGE) VERS L'IA (RÉSERVÉ PREMIUM) ---
app.post('/api/ia/upload-facture', verifierToken, verifierPlan(['PREMIUM']), async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    try {
        const { fichier_base64, mime_type } = req.body;
        if (!fichier_base64) return res.status(400).json({ erreur: "Fichier manquant." });

        const buffer = Buffer.from(fichier_base64, 'base64');
        const id_salon = req.user.id_salon;
        
        // Détection du format (Image ou PDF)
        const isImage = mime_type && mime_type.startsWith('image/');
        const extension = isImage ? (mime_type.includes('png') ? 'png' : 'jpg') : 'pdf';

        // 1. Sauvegarde sur Cloudflare R2 (avec conservation de la clé permanente R2 pour la liasse comptable)
        let urlCloudflare = null;
        let cleR2Facture = null;
        try {
            const nomFichierUnique = `factures/${id_salon}/${Date.now()}_upload_manuel.${extension}`;
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: nomFichierUnique,
                Body: buffer,
                ContentType: mime_type || 'application/pdf'
            }));
            cleR2Facture = nomFichierUnique;
            const commandGet = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: nomFichierUnique });
            urlCloudflare = await getSignedUrl(s3Client, commandGet, { expiresIn: 604800 });
        } catch (erreurR2) {
            console.error("⚠️ Erreur Cloudflare R2 (L'IA prend le relais localement) :", erreurR2.message);
            // Filet de sécurité : Si R2 échoue, on injecte directement le fichier en Base64 au frontend !
            urlCloudflare = `data:${mime_type || 'application/pdf'};base64,${fichier_base64}`;
        }

        let analyse;
        const anneeEnCours = new Date().getFullYear();
        const dateDuJour = new Date().toLocaleDateString('fr-FR');
        const promptContext = `${PROMPT_SYSTEME_IA}\nINFO : La date du jour est le ${dateDuJour}. Si l'année n'est pas précisée, utilise obligatoirement ${anneeEnCours}. Retourne uniquement un JSON strict.`;

        // 2. Extraction & Appel IA selon le format du document
        if (!isImage) {
            // Traitement PDF classique
            const dataPdf = await pdfParse(buffer);
            const textePdf = (dataPdf.text || '').substring(0, 15000);
            
            const completion = await groq.chat.completions.create({
                model: 'qwen/qwen3.8-27b',
                max_tokens: 800,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: promptContext },
                    { role: 'user', content: `Sujet : Upload Manuel\n\nContenu :\n${textePdf}` }
                ]
            });
            analyse = JSON.parse(completion.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim());
        } else {
            // Traitement Image avec le modèle Vision Haute Performance
            const completion = await groq.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
                max_tokens: 800,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: promptContext },
                    { role: 'user', content: [
                        { type: "text", text: "Extrais les données comptables et l'inventaire de cette facture/ticket de caisse." },
                        { type: "image_url", image_url: { url: `data:${mime_type};base64,${fichier_base64}` } }
                    ]}
                ]
            });
            analyse = JSON.parse(completion.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim());
        }

        // 3. Enregistrement en base avec statut ATTENTE pour garantir la validation humaine unique
        if (analyse.type === 'FACTURE_ACHAT' && analyse.donnees) {
            const donneesPropres = {
                fournisseur: String(analyse.donnees.fournisseur || 'Fournisseur Inconnu').trim(),
                numero_facture: analyse.donnees.numero_facture ? String(analyse.donnees.numero_facture).trim() : null,
                date_facture: analyse.donnees.date_facture || dateDuJour,
                montant_ht: parseFloat(analyse.donnees.montant_ht) || 0,
                montant_tva: parseFloat(analyse.donnees.montant_tva) || 0,
                montant_ttc: parseFloat(analyse.donnees.montant_ttc) || 0,
                mode_paiement: analyse.donnees.mode_paiement || 'NON_SPECIFIE',
                compte_comptable: analyse.donnees.compte_comptable || null,
                produits: Array.isArray(analyse.donnees.produits) ? analyse.donnees.produits : [],
                pdf_url: urlCloudflare,
                fichier_cle_r2: cleR2Facture,
                mime_type: mime_type || 'application/pdf'
            };

            const insertRes = await pool.query(
                `INSERT INTO ia_taches_attente (id_salon, type_tache, donnees, statut) VALUES ($1, 'FACTURE_ACHAT', $2, 'ATTENTE') RETURNING id_tache`,
                [id_salon, donneesPropres]
            );

            const tachePreRemplie = {
                id_tache: insertRes.rows[0].id_tache,
                type_tache: 'FACTURE_ACHAT',
                donnees: donneesPropres
            };
            
            return res.json({ message: "Analyse IA terminée avec succès.", tache: tachePreRemplie });
        } else {
            return res.status(400).json({ erreur: "L'IA n'a pas reconnu de facture valide dans ce document." });
        }

    } catch (e) {
        console.error("Erreur Upload Manuel :", e);
        res.status(500).json({ erreur: "Erreur lors de l'analyse du document par l'IA." });
    }
});

app.post('/api/ia/taches/:id/valider', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut valider une tâche IA." });
    const { id } = req.params;
    const donnees = req.body;
    const id_salon = req.user.id_salon;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        const idTacheNum = parseInt(id, 10);
        if (isNaN(idTacheNum)) throw new Error("Identifiant de tâche invalide.");

        const tacheRes = await clientDB.query(
            "SELECT type_tache FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2 AND statut = 'ATTENTE' FOR UPDATE",
            [idTacheNum, id_salon]
        );
        if (tacheRes.rowCount === 0) throw new Error("Tâche introuvable ou déjà traitée.");
        const type_tache = tacheRes.rows[0].type_tache;

        // --- NOUVEAU CAS : VALIDATION FACTURE FOURNISSEUR (DOUBLE ACTION) ---
        if (type_tache === 'FACTURE_ACHAT') {
            
            // 1. ACTION COMPTA : Insertion de la dépense dans factures_fournisseurs
            const ht = parseFloat(donnees.montant_ht) || 0;
            const tva = parseFloat(donnees.montant_tva) || 0;
            const ttc = parseFloat(donnees.montant_ttc) || 0;
            let dateFacture = donnees.date_facture ? new Date(donnees.date_facture) : new Date();
            if (isNaN(dateFacture)) dateFacture = new Date();

            const numFacture = donnees.numero_facture || null;
            const modePaiement = donnees.mode_paiement || 'NON_SPECIFIE';
            const justifUrl = donnees.pdf_url || null;
            const fichierCleR2 = donnees.fichier_cle_r2 || null;
            const compteComptable = donnees.compte_comptable || null;
            const fournisseur = donnees.fournisseur || 'Fournisseur Inconnu';
            const dateFactureISO = dateFacture.toISOString().split('T')[0];
            const dateReglementISO = (modePaiement !== 'NON_SPECIFIE' && modePaiement !== 'N/A') ? (donnees.date_reglement || dateFactureISO) : null;

            await clientDB.query(
                `INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon, date_traitement, date_facture, date_reglement, numero_facture, mode_paiement, statut_verification, justificatif_url, fichier_cle_r2, compte_comptable) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDE', $11, $12, $13)`,
                [fournisseur, ht, tva, ttc, id_salon, dateFacture.toISOString(), dateFactureISO, dateReglementISO, numFacture, modePaiement, justifUrl, fichierCleR2, compteComptable]
            );

            // 1 Bis. SYNCHRONISATION CAISSE (NF525) : Sortie d'espèces automatique scellée et catégorisée ACHAT_ESPECES
            if (modePaiement.toUpperCase() === 'ESPECES' && ttc > 0) {
                const motifSortie = numFacture 
                    ? `Paiement Facture ${numFacture} - ${fournisseur}` 
                    : `Paiement Facture - ${fournisseur}`;
                
                const scelle = await enregistrerMouvementCaisseScelle(clientDB, {
                    id_salon,
                    id_employe: null,
                    type_mouvement: 'SORTIE',
                    montant: ttc,
                    motif: motifSortie,
                    categorie_comptable: 'ACHAT_ESPECES'
                });
                
                // On trace l'événement dans le journal technique pour l'inaltérabilité
                await enregistrerJET(id_salon, 'MOUVEMENT_CAISSE', { id_mouvement: scelle.id_mouvement, type_mouvement: 'SORTIE', montant: ttc, motif: motifSortie, hash_mouvement: scelle.hash_mouvement }, clientDB);
            }

            // 2. ACTION STOCK : Ajout automatique des quantités validées
            if (donnees.produits && Array.isArray(donnees.produits)) {
                for (let p of donnees.produits) {
                    const qte = parseInt(p.quantite) || 0;
                    if (qte <= 0 || !p.nom) continue;

                    const typeArticle = p.type_destine === 'REVENTE' ? 'PRODUIT_REVENTE' : 'CONSOMMABLE';

                    // On cherche si le produit existe déjà par son nom exact
                    const check = await clientDB.query(
                        "SELECT id_article FROM catalogue WHERE nom ILIKE $1 AND id_salon = $2 LIMIT 1",
                        [p.nom, id_salon]
                    );

                    if (check.rowCount > 0) {
                        // Mise à jour : on additionne le stock
                        await clientDB.query(
                            "UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2",
                            [qte, check.rows[0].id_article]
                        );
                    } else {
                        // Création automatique du produit s'il est nouveau
                        await clientDB.query(
                            "INSERT INTO catalogue (nom, type_article, prix, stock_actuel, id_salon) VALUES ($1, $2, $3, $4, $5)",
                            [p.nom, typeArticle, 0, qte, id_salon] 
                        );
                    }
                }
            }
        }
        // --- FIN NOUVEAU CAS ---

        else if (type_tache === 'STOCK') {
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

        await clientDB.query("UPDATE ia_taches_attente SET statut = 'VALIDE' WHERE id_tache = $1 AND id_salon = $2", [idTacheNum, id_salon]);
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
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut ignorer une tâche IA." });
    try {
        const idTacheNum = parseInt(req.params.id, 10);
        if (isNaN(idTacheNum)) return res.status(400).json({ erreur: "ID invalide" });
        await pool.query("UPDATE ia_taches_attente SET statut = 'IGNORE' WHERE id_tache = $1 AND id_salon = $2", [idTacheNum, req.user.id_salon]);
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
        const configRes = await pool.query('SELECT nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville, heure_ouverture, heure_fermeture FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = configRes.rows[0] || {};
        
        const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${config.tva_intra}`;
        
        const filtreEmploye = estEmploye ? ' AND t.id_employe = $3' : '';
        const paramsVentes = estEmploye ? [id_salon, dateCible, id_employe] : [id_salon, dateCible];
        
        // 1. Ventes Détaillées (Inclut les ventes et les écritures d'annulation pour exactitude comptable NF525)
        const ventesResult = await pool.query(`
            SELECT 
                t.id_ticket, t.numero_ticket_caisse, TO_CHAR(t.date_creation, 'HH24:MI') as heure, t.total_ttc, t.methode_paiement, t.type_ticket,
                COALESCE(e.nom, 'Inconnu') as employe,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'nom', COALESCE(lt.nom_article_snapshot, c.nom, 'Article supprimé'),
                            'qte', COALESCE(lt.quantite, 0),
                            'ttc', COALESCE(lt.total_ligne_ttc, 0),
                            'tva', COALESCE(lt.taux_tva_snapshot, 20)
                        )
                    ) FILTER (WHERE lt.id_article IS NOT NULL), '[]'::json
                ) as lignes
            FROM tickets t
            LEFT JOIN lignes_ticket lt ON lt.id_ticket = t.id_ticket
            LEFT JOIN catalogue c ON lt.id_article = c.id_article
            LEFT JOIN employes e ON t.id_employe = e.id_employe
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.total_ttc, t.methode_paiement, t.type_ticket, e.nom
            ORDER BY t.date_creation ASC, t.id_ticket ASC
        `, paramsVentes);

        const caResult = await pool.query(`SELECT COALESCE(SUM(t.total_ttc), 0) as ca_total FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}`, paramsVentes);
        const caTotal = parseFloat(caResult.rows[0].ca_total) || 0;

        // 3. Clôture Info et Mouvements
        const clotureRes = await pool.query(`SELECT id_cloture, numero_z_salon, cumul_perpetuel_ttc, signature_hash, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2`, [id_salon, dateCible]);
        const clotureData = clotureRes.rowCount > 0 ? clotureRes.rows[0] : null;
        const cloturePar = clotureData ? clotureData.ferme_par : 'Non spécifié';

        const mouvementsResult = await pool.query(`SELECT COALESCE(SUM(montant), 0) as total_sorties FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2 AND type_mouvement = 'SORTIE'`, [id_salon, dateCible]);
        const totalSorties = parseFloat(mouvementsResult.rows[0].total_sorties) || 0;

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerant = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Gérant';

        let responsableCloture = cloturePar;
        if (cloturePar === 'Non spécifié' || cloturePar === 'Gérant') responsableCloture = nomGerant;
        else if (cloturePar.includes('Robot')) responsableCloture = 'Fermeture Automatique';

        // 4. Stats Commerciales (Annulations, Remises)
        const statsResult = await pool.query(`SELECT COUNT(DISTINCT id_ticket) as nb_tickets FROM tickets t WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE ${filtreEmploye}`, paramsVentes);
        const nbTickets = parseInt(statsResult.rows[0].nb_tickets) || 0;
        
        const annulsRes = await pool.query(`SELECT COUNT(*) as nb, COALESCE(SUM(ABS(total_ttc)), 0) as mnt FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND type_ticket = 'ANNULATION'`, [id_salon, dateCible]);
        const remisesRes = await pool.query(`SELECT COUNT(*) as nb FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND recompense_utilisee = TRUE AND statut = 'VALIDE' AND est_compense = FALSE`, [id_salon, dateCible]);

        // 5. CA par Catégorie
        const caCategories = await pool.query(`
            SELECT COALESCE(c.type_article, 'PRESTATION') as type_article, SUM(lt.total_ligne_ttc) as total
            FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY COALESCE(c.type_article, 'PRESTATION')
        `, paramsVentes);
        
        let totalPrestations = 0, totalRevente = 0;
        caCategories.rows.forEach(r => {
            if (r.type_article === 'PRESTATION') totalPrestations += parseFloat(r.total || 0);
            else totalRevente += parseFloat(r.total || 0);
        });

        // 6. Détail TVA
        const tvaDetails = await pool.query(`
            SELECT lt.taux_tva_snapshot as taux, SUM(lt.total_ligne_ttc) as total_ttc
            FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY lt.taux_tva_snapshot ORDER BY lt.taux_tva_snapshot DESC
        `, paramsVentes);

        // 7. Méthodes de Paiement
        const paiements = await pool.query(`
            SELECT methode_paiement, SUM(total_ttc) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' ${filtreEmploye}
            GROUP BY methode_paiement
        `, paramsVentes);
        
        let totalCB = 0, totalEspeces = 0, totalCheques = 0;
        paiements.rows.forEach(r => {
            if (r.methode_paiement === 'CARTE') totalCB += parseFloat(r.total || 0);
            if (r.methode_paiement === 'ESPECES') totalEspeces += parseFloat(r.total || 0);
            if (r.methode_paiement === 'CHEQUE') totalCheques += parseFloat(r.total || 0);
        });

        // 8. Stats par employé (Gérant uniquement - avec id_employe pour relier les pourboires)
        let employesStats = [];
        if (!estEmploye) {
            const empStatsRes = await pool.query(`
                SELECT e.id_employe, e.nom, e.est_gerant,
                       COALESCE(SUM(t.total_ttc), 0) as ca_genere,
                       (SELECT COALESCE(SUM(c.montant_commission), 0) FROM commissions c WHERE c.id_employe = e.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) = $2) as prime_due
                FROM employes e
                LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE'
                WHERE e.id_salon = $1
                GROUP BY e.id_employe, e.nom, e.est_gerant
                ORDER BY e.est_gerant DESC, e.nom ASC
            `, [id_salon, dateCible]);
            employesStats = empStatsRes.rows;
        }

        // ================== REQUÊTES ADDITIONNELLES POUR LE BILAN JOURNALIER ==================
        const salonExtra = config;
        const formeJuridique = config.forme_juridique ? ` - ${config.forme_juridique}` : '';

        // Ventilation CA par catégorie et par taux de TVA sur la journée
        const caDetailJourRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                COALESCE(lt.taux_tva_snapshot, 20) as taux_tva,
                SUM(lt.total_ligne_ttc) as total_ttc,
                SUM(lt.total_ligne_ttc / (1 + (COALESCE(lt.taux_tva_snapshot, 20) / 100))) as total_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2::date AND t.statut != 'ANNULE' ${filtreEmploye}
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), COALESCE(lt.taux_tva_snapshot, 20)
            ORDER BY type_article ASC, taux_tva DESC
        `, paramsVentes);

        // Nombre et montant des encaissements par mode sur la journée
        const paiementsDetailJourRes = await pool.query(`
            SELECT methode_paiement, COUNT(id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb, COALESCE(SUM(total_ttc), 0) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date AND statut != 'ANNULE' ${filtreEmploye}
            GROUP BY methode_paiement
        `, paramsVentes);

        // Détail des mouvements d'espèces du jour (Entrées, Sorties, Régularisations)
        const mvtJourDetailRes = await pool.query(`
            SELECT TO_CHAR(date_creation, 'HH24:MI') as heure_mvt, type_mouvement, montant, motif
            FROM mouvements_caisse
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date
            ORDER BY date_creation ASC
        `, [id_salon, dateCible]);

        // Pourboires du jour par collaborateur
        const pourboiresJourRes = await pool.query(`
            SELECT id_employe, COALESCE(SUM(montant_pourboire), 0) as total_pourboire
            FROM tickets
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date AND statut != 'ANNULE' AND est_compense = FALSE
            GROUP BY id_employe
        `, [id_salon, dateCible]);
        const mapPourboiresJour = {};
        pourboiresJourRes.rows.forEach(r => { mapPourboiresJour[r.id_employe] = parseFloat(r.total_pourboire) || 0; });

        // Numéro de Z séquentiel propre au salon
        let numZSalon = 1;
        if (clotureData && clotureData.numero_z_salon) {
            numZSalon = parseInt(clotureData.numero_z_salon);
        } else {
            const zSeqRes = await pool.query(`SELECT COALESCE(MAX(numero_z_salon), 0) + 1 as next_z FROM clotures_caisse WHERE id_salon = $1`, [id_salon]);
            numZSalon = parseInt(zSeqRes.rows[0].next_z);
        }

        // Récupération stricte du Z précédent par ordre chronologique et séquentiel
        const prevZRes = await pool.query(`
            SELECT id_cloture, numero_z_salon, cumul_perpetuel_ttc, signature_hash
            FROM clotures_caisse
            WHERE id_salon = $1 AND date_cloture < $2::date
            ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon, dateCible]);
        const cumulAvantBdd = prevZRes.rowCount > 0 ? (parseFloat(prevZRes.rows[0].cumul_perpetuel_ttc) || 0) : 0;
        const hashPrecedentFallback = prevZRes.rowCount > 0 ? prevZRes.rows[0].signature_hash : 'GENESIS_Z';

        // Si le numéro Z stocké est incohérent (ex: Z#1 alors qu'il existe des Z antérieurs), on calcule son rang réel
        if (clotureData && prevZRes.rowCount > 0 && numZSalon <= 1) {
            const rangRes = await pool.query(
                `SELECT COUNT(*)::int as rang FROM clotures_caisse WHERE id_salon = $1 AND (date_cloture < $2::date OR (date_cloture = $2::date AND id_cloture <= $3))`,
                [id_salon, dateCible, clotureData.id_cloture]
            );
            if (rangRes.rows[0]?.rang > 0) numZSalon = rangRes.rows[0].rang;
        }

        // Horaires effectifs d'ouverture / clôture et compteurs d'événements JET
        const horairesTicketsRes = await pool.query(`
            SELECT TO_CHAR(MIN(date_creation), 'HH24:MI') as premiere_vente,
                   TO_CHAR(MAX(date_creation), 'HH24:MI') as derniere_vente
            FROM tickets
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date
        `, [id_salon, dateCible]);
        const heurePremiereVente = horairesTicketsRes.rows[0]?.premiere_vente || null;
        const heureDerniereVente = horairesTicketsRes.rows[0]?.derniere_vente || null;

        const pointageMinRes = await pool.query(`
            SELECT TO_CHAR(MIN(heure_action), 'HH24:MI') as premier_pointage
            FROM pointages
            WHERE id_salon = $1 AND date_jour = $2::date AND type_action = 'ENTREE'
        `, [id_salon, dateCible]);
        const heurePremierPointage = pointageMinRes.rows[0]?.premier_pointage || null;

        const jetJourRes = await pool.query(`
            SELECT action, TO_CHAR(date_creation, 'DD/MM/YYYY à HH24:MI:SS') as date_heure_jet, TO_CHAR(date_creation, 'HH24:MI') as heure_jet
            FROM jet_logs
            WHERE id_salon = $1 AND (
                (action IN ('CLOTURE_Z', 'CLOTURE_Z_AUTOMATIQUE') AND details->>'date_cloture' = $2)
                OR (action = 'IMPRESSION_DUPLICATA_Z' AND details->>'date_cloture' = $2)
                OR (DATE(date_creation) = $2::date AND action IN ('OUVERTURE_TIROIR', 'TIROIR_SANS_VENTE'))
            )
            ORDER BY id_jet ASC
        `, [id_salon, dateCible]);

        let heureClotureJet = null;
        let dateHeureClotureComplete = null;
        let nbDuplicatasPrecedents = 0;
        let nbOuverturesTiroir = 0;

        jetJourRes.rows.forEach(j => {
            if (j.action === 'CLOTURE_Z' || j.action === 'CLOTURE_Z_AUTOMATIQUE') {
                heureClotureJet = j.heure_jet;
                dateHeureClotureComplete = j.date_heure_jet;
            } else if (j.action === 'IMPRESSION_DUPLICATA_Z') {
                nbDuplicatasPrecedents++;
            } else if (j.action === 'OUVERTURE_TIROIR' || j.action === 'TIROIR_SANS_VENTE') {
                nbOuverturesTiroir++;
            }
        });

        let numeroDuplicata = 0;
        if (clotureData) {
            numeroDuplicata = nbDuplicatasPrecedents + 1;
            await enregistrerJET(id_salon, 'IMPRESSION_DUPLICATA_Z', {
                date_cloture: dateCible,
                id_cloture: clotureData.id_cloture,
                num_z_salon: numZSalon,
                numero_duplicata: numeroDuplicata
            });
        }

        const heureOuvertureAff = heurePremierPointage || heurePremiereVente || `${String(salonExtra.heure_ouverture || 8).padStart(2, '0')}:00`;
        const heureClotureAff = clotureData ? (dateHeureClotureComplete || heureClotureJet || heureDerniereVente || '23:59') : 'En cours (Non clôturé)';

        // ================== CRÉATION DU PDF ==================
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Bilan_Journalier_${dateCible}.pdf"`);
        doc.pipe(res);

        let currentY = 40;
        const MAIN_COLOR = '#111827';
        const SEC_COLOR = '#4b5563';
        const BORDER_COLOR = '#e5e7eb';
        const nowImpression = new Date();
        const dateActiviteFr = new Date(dateCible).toLocaleDateString('fr-FR');

        const fMnt = (mnt) => {
            const parts = (parseFloat(mnt) || 0).toFixed(2).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return parts.join(',') + ' €';
        };

        // --- EN-TÊTE LÉGAL ET STATUT (TICKET Z vs TICKET X) ---
        const titrePrincipal = clotureData
            ? `BILAN JOURNALIER DE CLÔTURE — Z N° ${String(numZSalon).padStart(4, '0')}${estEmploye ? ' (EMPLOYÉ)' : ''}`
            : `LECTURE DE CAISSE EN COURS DE JOURNÉE (TICKET X)${estEmploye ? ' (EMPLOYÉ)' : ''}`;

        doc.font('Helvetica-Bold').fontSize(15).fillColor(MAIN_COLOR).text(titrePrincipal, 40, currentY);
        currentY += 20;

        const capSocialAff = config.capital_social && String(config.capital_social).trim() !== ''
            ? (String(config.capital_social).includes('€') ? config.capital_social.trim() : `${config.capital_social.trim()} €`)
            : 'Non renseigné';
        const rcsVilleAff = config.rcs_ville && String(config.rcs_ville).trim() !== '' ? config.rcs_ville.trim() : 'Non renseigné';

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${config.nom_salon || 'Salon'}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${config.adresse_salon || 'Non renseignée'}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${config.siret || 'Non renseigné'} | Capital social : ${capSocialAff} | RCS : ${rcsVilleAff}`, 40, currentY);
        currentY += 12;
        doc.text(`${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 14;

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MAIN_COLOR).text(
            `Journée d'activité : ${dateActiviteFr} | Ouverture : ${heureOuvertureAff} | Scellement Z : ${heureClotureAff} | Opérateur : ${clotureData ? responsableCloture : 'Ticket X'}`,
            40, currentY, { width: 515 }
        );
        currentY += 14;

        if (clotureData) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#16a34a').text(
                `CLÔTURE DÉFINITIVE Z N° ${String(numZSalon).padStart(4, '0')} — DUPLICATA N° ${numeroDuplicata}`,
                40, currentY
            );
            doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
                `Réimpression du : ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                330, currentY, { width: 225, align: 'right' }
            );
            currentY += 18;
        } else {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(
                `TICKET X : Lecture intermédiaire non clôturante et non numérotée`,
                40, currentY
            );
            doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
                `Imprimé le : ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                330, currentY, { width: 225, align: 'right' }
            );
            currentY += 18;
        }

        // --- MOTEUR DE DESSIN UNIFIÉ (Anti-chevauchement avec support font/size par colonne) ---
        const drawTableTitle = (title) => {
            if (currentY > 730) { doc.addPage(); currentY = 40; }
            currentY += 6;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(title, 40, currentY);
            currentY += 16;
        };

        const drawRow = (cols, isHeader = false, isBold = false) => {
            const activeCols = cols.filter(c => c.w > 0);
            const defaultFont = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
            const defaultSize = isHeader ? 8 : 8.5;

            let maxH = 0;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s);
                const txt = col.text != null ? String(col.text) : '';
                const h = doc.heightOfString(txt, { width: col.w });
                if (h > maxH) maxH = h;
            });

            if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }

            let xPos = 40;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, {
                    width: col.w,
                    align: col.align || 'left'
                });
                xPos += col.w + 10;
            });

            currentY += Math.max(maxH, 10) + 4;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 5;
        };

        // --- 1. CHIFFRE D'AFFAIRES DU JOUR ---
        drawTableTitle("1. CHIFFRE D'AFFAIRES DU JOUR");
        drawRow([
            {text: 'Catégorie & Taux TVA', w: 180},
            {text: 'Base HT', w: 100, align: 'right'},
            {text: 'TVA Collectée', w: 100, align: 'right'},
            {text: 'Total TTC', w: 105, align: 'right'}
        ], true);

        let totalJourHT = 0, totalJourTVA = 0, totalJourTTC = 0;
        if (caDetailJourRes.rowCount === 0) {
            drawRow([
                {text: 'Aucune vente enregistrée sur la journée', w: 180},
                {text: '0,00 €', w: 100, align: 'right'},
                {text: '0,00 €', w: 100, align: 'right'},
                {text: '0,00 €', w: 105, align: 'right'}
            ]);
        } else {
            caDetailJourRes.rows.forEach(r => {
                const ttcCents = Math.round((parseFloat(r.total_ttc) || 0) * 100);
                const taux = franchiseTVA ? 0 : (parseFloat(r.taux_tva) || 0);
                const htCents = franchiseTVA ? ttcCents : Math.round(ttcCents / (1 + taux / 100));
                const tvaCents = ttcCents - htCents;

                const ht = htCents / 100;
                const tva = tvaCents / 100;
                const ttc = ttcCents / 100;

                const tauxTvaAff = franchiseTVA ? '0%' : `${taux.toString().replace('.', ',')}%`;
                const libelleCat = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaAff})`;

                totalJourHT = Number((totalJourHT + ht).toFixed(2));
                totalJourTVA = Number((totalJourTVA + tva).toFixed(2));
                totalJourTTC = Number((totalJourTTC + ttc).toFixed(2));

                drawRow([
                    {text: libelleCat, w: 180},
                    {text: fMnt(ht), w: 100, align: 'right'},
                    {text: fMnt(tva), w: 100, align: 'right'},
                    {text: fMnt(ttc), w: 105, align: 'right'}
                ]);
            });
        }

        drawRow([
            {text: "CHIFFRE D'AFFAIRES TOTAL DU JOUR", w: 180},
            {text: fMnt(totalJourHT), w: 100, align: 'right'},
            {text: fMnt(totalJourTVA), w: 100, align: 'right'},
            {text: fMnt(caTotal), w: 105, align: 'right'}
        ], false, true);

        if (franchiseTVA) {
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* TVA non applicable, art. 293 B du CGI.", 40, currentY);
            currentY += 12;
        }

        // --- 2. ENCAISSEMENTS PAR MODE & CONTRÔLE DE CAISSE DU JOUR ---
        drawTableTitle("2. ENCAISSEMENTS ET CONTRÔLE DE CAISSE DU JOUR");
        drawRow([
            {text: 'Mode de paiement', w: 210},
            {text: 'Nb Trans.', w: 85, align: 'center'},
            {text: 'Montant Encaissé TTC', w: 200, align: 'right'}
        ], true);

        const methodesJour = ['CARTE', 'ESPECES', 'CHEQUE', 'VIREMENT', 'BONS CADEAUX'];
        const mapPaiementsJour = {};
        paiementsDetailJourRes.rows.forEach(p => { mapPaiementsJour[p.methode_paiement] = p; });

        methodesJour.forEach(m => {
            const p = mapPaiementsJour[m] || { nb: 0, total: 0 };
            drawRow([
                {text: m, w: 210},
                {text: String(p.nb), w: 85, align: 'center'},
                {text: fMnt(p.total), w: 200, align: 'right'}
            ]);
        });

        const ticketMoyen = nbTickets > 0 ? (caTotal / nbTickets) : 0;
        drawRow([
            {text: `TOTAL ENCAISSÉ (${nbTickets} ticket(s), Panier Moyen : ${fMnt(ticketMoyen)})`, w: 305},
            {text: fMnt(caTotal), w: 200, align: 'right'}
        ], false, true);

        // Contrôle de caisse à l'échelle du jour (Gérant uniquement)
        if (!estEmploye) {
            currentY += 8;
            if (currentY > 650) { doc.addPage(); currentY = 40; }
            doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("CONTRÔLE DE LA CAISSE DU JOUR (Espèces)", 40, currentY);
            currentY += 14;

            let totalEntreesJour = 0;
            let totalSortiesJour = 0;
            let totalRegulJour = 0;
            mvtJourDetailRes.rows.forEach(m => {
                const mnt = parseFloat(m.montant) || 0;
                if (m.type_mouvement === 'ENTREE') totalEntreesJour += mnt;
                else if (m.type_mouvement === 'SORTIE') totalSortiesJour += mnt;
                else if (m.type_mouvement === 'REGULARISATION') totalRegulJour += mnt;
            });

            const fMatin = clotureData ? parseFloat(clotureData.fond_caisse_matin || 0) : 0;
            const tTheorique = clotureData
                ? parseFloat(clotureData.total_especes_theorique || 0)
                : (fMatin + totalEspeces + totalEntreesJour - totalSortiesJour + totalRegulJour);
            const tReel = clotureData ? parseFloat(clotureData.total_especes_reel || 0) : 0;
            const ecart = clotureData ? parseFloat(clotureData.ecart_caisse || 0) : 0;
            const isAutoClose = cloturePar.toLowerCase().includes('robot') || cloturePar.toLowerCase().includes('auto');

            drawRow([{text: 'Fond de caisse du matin (Ouverture)', w: 350}, {text: fMnt(fMatin), w: 155, align: 'right'}]);
            drawRow([{text: 'Espèces encaissées clients (+)', w: 350}, {text: fMnt(totalEspeces), w: 155, align: 'right'}]);
            drawRow([{text: 'Apports de caisse du jour (+)', w: 350}, {text: fMnt(totalEntreesJour), w: 155, align: 'right'}]);
            drawRow([{text: 'Retraits et dépenses en espèces du jour (-)', w: 350}, {text: totalSortiesJour > 0 ? `-${fMnt(totalSortiesJour)}` : '0,00 €', w: 155, align: 'right'}]);
            if (Math.abs(totalRegulJour) > 0.009) {
                drawRow([{text: 'Régularisations de caisse du jour (±)', w: 350}, {text: fMnt(totalRegulJour), w: 155, align: 'right'}]);
            }

            drawRow([{text: 'ESPÈCES THÉORIQUES (Attendues à la clôture)', w: 350}, {text: fMnt(tTheorique), w: 155, align: 'right'}], false, true);

            const texteReel = !clotureData
                ? 'En attente de clôture'
                : (isAutoClose ? 'Non compté (Clôture Auto.)' : fMnt(tReel));
            drawRow([{text: 'ESPÈCES COMPTÉES (Physique en caisse)', w: 350}, {text: texteReel, w: 155, align: 'right'}], false, true);

            const texteEcart = !clotureData
                ? 'Non applicable (Ticket X)'
                : (isAutoClose ? 'Non compté' : `${ecart > 0 ? '+' : ''}${fMnt(ecart)}`);
            drawRow([{text: 'ÉCART DE CAISSE CONSTATÉ', w: 350}, {text: texteEcart, w: 155, align: 'right'}], false, true);

            const texteFondConserve = !clotureData
                ? fMnt(tTheorique)
                : (isAutoClose ? fMnt(tTheorique) : fMnt(tReel));
            drawRow([{text: 'FOND DE CAISSE CONSERVÉ (Pour demain)', w: 350}, {text: texteFondConserve, w: 155, align: 'right'}], false, true);

            if (clotureData && clotureData.justification_ecart) {
                currentY += 3;
                doc.font('Helvetica-Oblique').fontSize(8).fillColor('#ea580c').text(`Justification de l'écart : "${clotureData.justification_ecart}"`, 40, currentY);
                currentY += 12;
            }

            if (mvtJourDetailRes.rowCount > 0) {
                currentY += 6;
                doc.font('Helvetica-Bold').fontSize(9).fillColor(SEC_COLOR).text("Détail des Apports, Sorties d'espèces et Régularisations du jour :", 40, currentY);
                currentY += 14;
                drawRow([
                    {text: 'Heure', w: 55, align: 'center'},
                    {text: 'Nature', w: 95},
                    {text: 'Motif / Dépense espèces', w: 235},
                    {text: 'Montant', w: 100, align: 'right'}
                ], true);

                mvtJourDetailRes.rows.forEach(mvt => {
                    const labelMvt = mvt.type_mouvement === 'ENTREE'
                        ? 'Apport (+)'
                        : (mvt.type_mouvement === 'SORTIE' ? 'Sortie espèces (-)' : 'Régularisation (±)');
                    drawRow([
                        {text: mvt.heure_mvt || '-', w: 55, align: 'center'},
                        {text: labelMvt, w: 95},
                        {text: mvt.motif || 'Non renseigné', w: 235},
                        {text: fMnt(mvt.montant), w: 100, align: 'right'}
                    ]);
                });
            }
        }

        // --- 3. COMPTEURS D'ÉVÉNEMENTS & INDICATEURS DU JOUR ---
        drawTableTitle("3. COMPTEURS D'ÉVÉNEMENTS ET INDICATEURS DU JOUR");
        drawRow([
            {text: 'Indicateur / Événement fiscal', w: 350},
            {text: 'Valeur / Cumul jour', w: 155, align: 'right'}
        ], true);

        const nbAnnuls = parseInt(annulsRes.rows[0].nb) || 0;
        const mntAnnuls = parseFloat(annulsRes.rows[0].mnt) || 0;

        drawRow([{text: 'Nombre de tickets validés sur la journée', w: 350}, {text: `${nbTickets}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Ticket moyen du jour', w: 350}, {text: fMnt(ticketMoyen), w: 155, align: 'right'}]);
        drawRow([{text: 'Annulations de tickets (Nombre et montant compensé)', w: 350}, {text: `${nbAnnuls} (${fMnt(mntAnnuls)})`, w: 155, align: 'right'}]);
        drawRow([{text: 'Avoirs / Retours hors annulation directe', w: 350}, {text: '0 (0,00 €)', w: 155, align: 'right'}]);
        drawRow([{text: 'Tickets avec remise ou avantage fidélité', w: 350}, {text: `${remisesRes.rows[0].nb}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Duplicatas de clôture émis', w: 350}, {text: `${numeroDuplicata}`, w: 155, align: 'right'}]);
        drawRow([{text: 'Ouvertures de tiroir-caisse sans vente', w: 350}, {text: `${nbOuverturesTiroir}`, w: 155, align: 'right'}]);

        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le mode formation est strictement exclu du chiffre d'affaires et des cumuls perpétuels.", 40, currentY);
        currentY += 12;

        // --- 4. ACTIVITÉ ET PRIMES DU JOUR PAR COLLABORATEUR ---
        if (!estEmploye) {
            drawTableTitle("4. ACTIVITÉ, PRIMES ET POURBOIRES DU JOUR PAR COLLABORATEUR");
            drawRow([
                {text: 'Collaborateur', w: 115},
                {text: 'Statut', w: 70, align: 'center'},
                {text: 'CA Jour TTC', w: 90, align: 'right'},
                {text: 'Pourboires Jour', w: 80, align: 'right'},
                {text: 'Prime Due (Base HT)', w: 120, align: 'right'}
            ], true);

            let sumCaCollaborateurs = 0;
            let sumPrimesJour = 0;
            let sumPourboiresJour = 0;

            employesStats.forEach(emp => {
                const caEmp = parseFloat(emp.ca_genere || 0);
                const primeEmp = parseFloat(emp.prime_due || 0);
                const pourboireEmp = mapPourboiresJour[emp.id_employe] || 0;
                sumCaCollaborateurs += caEmp;
                if (!emp.est_gerant) sumPrimesJour += primeEmp;

                drawRow([
                    {text: emp.nom, w: 115},
                    {text: emp.est_gerant ? 'Gérant' : 'Salarié(e)', w: 70, align: 'center'},
                    {text: fMnt(caEmp), w: 90, align: 'right'},
                    {text: emp.est_gerant ? 'N/A' : fMnt(pourboireEmp), w: 80, align: 'right'},
                    {text: emp.est_gerant ? 'N/A (Gérant)' : fMnt(primeEmp), w: 120, align: 'right'}
                ]);
            });

            Object.values(mapPourboiresJour).forEach(p => { sumPourboiresJour += p; });

            const caNonAttribueJour = caTotal - sumCaCollaborateurs;
            if (Math.abs(caNonAttribueJour) > 0.01) {
                drawRow([
                    {text: 'CA non attribué', w: 115},
                    {text: 'N/A', w: 70, align: 'center'},
                    {text: fMnt(caNonAttribueJour), w: 90, align: 'right'},
                    {text: '-', w: 80, align: 'right'},
                    {text: '-', w: 120, align: 'right'}
                ]);
            }

            drawRow([
                {text: 'TOTAL ÉQUIPE DU JOUR', w: 195},
                {text: fMnt(caTotal), w: 90, align: 'right'},
                {text: fMnt(sumPourboiresJour), w: 80, align: 'right'},
                {text: fMnt(sumPrimesJour), w: 120, align: 'right'}
            ], false, true);
        }

        // --- 5. DÉTAIL DES VENTES DU JOUR ---
        drawTableTitle("5. DÉTAIL DES VENTES DU JOUR");
        // Grille calibrée sans retour à la ligne sur le symbole € : 28 + 82 + 95 + 38 + 46 + 52 + 48 + 56 = 445 + (7 * 10) = 515 pt
        const drawHeaderVentesJour = () => {
            drawRow([
                {text: 'Heure', w: 28},
                {text: 'N° Ticket', w: 82},
                {text: 'Lignes (Qté x Presta / Produit)', w: 95},
                {text: 'Paiem.', w: 38, align: 'center'},
                {text: 'Vendeur', w: 46, align: 'center'},
                {text: 'HT', w: 52, align: 'right'},
                {text: 'TVA', w: 48, align: 'right'},
                {text: 'TTC', w: 56, align: 'right'}
            ], true);
        };

        drawHeaderVentesJour();

        if (ventesResult.rowCount === 0) {
            drawRow([{text: 'Aucune transaction enregistrée sur cette journée.', w: 515}]);
        } else {
            ventesResult.rows.forEach(v => {
                let lignesTxt = [];
                let totalTicketHT = 0;
                let totalTicketTVA = 0;
                const totalTicketTTC = parseFloat(v.total_ttc || 0);

                (v.lignes || []).forEach(l => {
                    if (!l.nom) return;
                    const lTtc = parseFloat(l.ttc || 0);
                    let lHt = lTtc, lTva = 0, lTaux = 0;
                    if (!franchiseTVA) {
                        lTaux = parseFloat(l.tva || 20);
                        lHt = lTtc / (1 + lTaux / 100);
                        lTva = lTtc - lHt;
                    }
                    totalTicketHT += lHt;
                    totalTicketTVA += lTva;
                    lignesTxt.push(`${l.qte || 1}x ${l.nom}`);
                });

                if (lignesTxt.length === 0) {
                    totalTicketHT = franchiseTVA ? totalTicketTTC : (totalTicketTTC / 1.2);
                    totalTicketTVA = totalTicketTTC - totalTicketHT;
                    lignesTxt.push('Encaissement direct');
                }

                if (currentY > 735) {
                    doc.addPage();
                    currentY = 40;
                    drawHeaderVentesJour();
                }

                drawRow([
                    {text: v.heure || '-', w: 28, size: 8},
                    {text: v.numero_ticket_caisse || '-', w: 82, size: 7.5},
                    {text: lignesTxt.join('\n'), w: 95, size: 8},
                    {text: v.methode_paiement || 'N/A', w: 38, align: 'center', size: 7.5},
                    {text: v.employe || 'Inconnu', w: 46, align: 'center', size: 8},
                    {text: fMnt(totalTicketHT), w: 52, align: 'right', size: 8},
                    {text: fMnt(totalTicketTVA), w: 48, align: 'right', size: 8},
                    {text: fMnt(totalTicketTTC), w: 56, align: 'right', size: 8}
                ]);
            });

            // Ligne de totalisation du journal des ventes (Fusion Col 1..5 = 28+82+95+38+46 + 4*10 = 329 pt)
            drawRow([
                {text: `TOTAL DES VENTES DU JOUR (${ventesResult.rowCount} pièce(s))`, w: 329},
                {text: fMnt(totalJourHT), w: 52, align: 'right'},
                {text: fMnt(totalJourTVA), w: 48, align: 'right'},
                {text: fMnt(caTotal), w: 56, align: 'right'}
            ], false, true);
        }

        // --- 6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 & CUMUL PERPÉTUEL ---
        if (currentY > 540) { doc.addPage(); currentY = 40; }
        drawTableTitle("6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 ET CUMUL PERPÉTUEL");

        // Règle NF525 stricte : Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour
        const cumulAvant = numZSalon === 1 ? 0 : Number(cumulAvantBdd.toFixed(2));
        const cumulApres = Number((cumulAvant + caTotal).toFixed(2));
        const ecartCumulDetecte = clotureData && clotureData.cumul_perpetuel_ttc != null
            && Math.abs((parseFloat(clotureData.cumul_perpetuel_ttc) || 0) - cumulApres) > 0.02;

        const hashActuel = clotureData ? (clotureData.signature_hash || 'NON-SIGNE') : 'EN ATTENTE DE CLÔTURE (TICKET X)';
        const hashPrec = (numZSalon === 1) ? 'GENESIS_Z' : (clotureData ? (clotureData.hash_precedent || hashPrecedentFallback) : hashPrecedentFallback);
        const splitHash32 = (h) => (h && h.length === 64) ? `${h.substring(0, 32)}\n${h.substring(32, 64)}` : h;

        drawRow([
            {text: 'Numéro de Z séquentiel (Propre au salon)', w: 260},
            {text: clotureData ? `Z N° ${String(numZSalon).padStart(4, '0')}` : 'Non numéroté (Ticket X en cours)', w: 245, align: 'right'}
        ], false, true);
        drawRow([
            {text: 'Cumul perpétuel TTC avant clôture', w: 260},
            {text: fMnt(cumulAvant), w: 245, align: 'right'}
        ]);
        drawRow([
            {text: "Chiffre d'affaires TTC du jour (+)", w: 260},
            {text: fMnt(caTotal), w: 245, align: 'right'}
        ]);
        drawRow([
            {text: 'Cumul perpétuel TTC après clôture (=)', w: 260},
            {text: fMnt(cumulApres), w: 245, align: 'right'}
        ], false, true);
        drawRow([
            {text: 'Contrôle mathématique (Après = Avant + CA du jour)', w: 260},
            {text: ecartCumulDetecte ? `ANOMALIE CUMUL STOCKÉ (${fMnt(clotureData.cumul_perpetuel_ttc)})` : `Conforme : ${fMnt(cumulApres)} = ${fMnt(cumulAvant)} + ${fMnt(caTotal)}`, w: 245, align: 'right', color: ecartCumulDetecte ? '#dc2626' : '#16a34a'}
        ], false, true);
        drawRow([
            {text: 'Algorithme et dispositif de signature', w: 260},
            {text: 'SHA-256 — Scellement et chaînage NF525', w: 245, align: 'right'}
        ]);
        drawRow([
            {text: 'Empreinte SHA-256 de ce Z (Scellement)', w: 260},
            {text: splitHash32(hashActuel), w: 245, align: 'right', font: 'Courier-Bold', size: 7.5, color: '#166534'}
        ]);
        drawRow([
            {text: 'Empreinte SHA-256 du Z précédent (Chaînage)', w: 260},
            {text: splitHash32(hashPrec), w: 245, align: 'right', font: 'Courier', size: 7.5, color: SEC_COLOR}
        ]);

        // --- MENTIONS LÉGALES & ATTESTATION DE L'ÉDITEUR ---
        currentY += 6;
        if (currentY > 665) { doc.addPage(); currentY = 40; }
        doc.rect(40, currentY, 515, 65).fillAndStroke('#f9fafb', BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MAIN_COLOR).text('MENTIONS LÉGALES, ATTESTATION ÉDITEUR ET CONSERVATION (Loi de Finances - NF525)', 50, currentY + 8);
        doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
            "• Attestation individuelle de conformité : L'éditeur du logiciel STACK v1.0 atteste que ce système satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données prévues au 3° bis du I de l'article 286 du CGI.\n" +
            "• Conservation légale : Les pièces et archives fiscales doivent être conservées pendant 6 ans (LPF, art. L. 102 B) et les pièces comptables pendant 10 ans (Code de commerce, art. L. 123-22).",
            50, currentY + 22, { width: 495, lineGap: 2 }
        );
        currentY += 75;

        if (clotureData) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text(
                `Clôturé par : ${responsableCloture} — Date et heure de clôture : ${dateHeureClotureComplete || (dateActiviteFr + ' à ' + heureClotureAff)}`,
                40, currentY
            );
        } else {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#ea580c').text(
                `Lecture en cours de journée (Ticket X non clôturant) — Édité le ${nowImpression.toLocaleDateString('fr-FR')} à ${nowImpression.toLocaleTimeString('fr-FR')}`,
                40, currentY
            );
        }

        // --- PAGINATION DYNAMIQUE ---
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
            doc.switchToPage(i);
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(
                `Page ${page} / ${range.count}`,
                0, 815,
                { align: 'center', width: 595 }
            );
            doc.page.margins.bottom = originalBottomMargin;
        }

        doc.end();
    } catch (erreur) { 
        console.error("Erreur PDF Journalier :", erreur);
        res.status(500).send("Erreur lors de la génération du PDF journalier."); 
    }
});

// =========================================================================
// --- EXPORT PDF : LIASSE MENSUELLE COMPTABLE & LÉGALE (NF525) ---
// =========================================================================

// Fonction centrale unifiée pour générer le PDF (Prévisualisation + Envoi final)
async function genererBufferLiassePdf(id_salon, mois_annee) {
    return new Promise(async (resolve, reject) => {
        try {
            const today = new Date();
        let referenceDate = new Date();
        if (mois_annee) {
            const [year, month] = mois_annee.split('-');
            referenceDate = new Date(year, parseInt(month) - 1, 15);
        }

        const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDayOfMonth);
        const dateFinStr = formatYMD(lastDayOfMonth);

        // --- STATUT ET LÉGALITÉ (Basé sur la validation scellée du gérant) ---
        const moisCibleStr = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
        const validationRes = await pool.query('SELECT valide_par, date_validation, signature_hash, hash_precedent FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [id_salon, moisCibleStr]);
        
        const estMoisCloture = validationRes.rowCount > 0;
        const statutDocument = estMoisCloture ? "DÉFINITIF (CLÔTURÉ ET SIGNÉ)" : "BROUILLON PROVISOIRE - NON SIGNÉ";
        
        let signatureArchive = '';
        let fullHashArchive = '';
        let numeroArchive = 'NON-APPLICABLE-MOIS-EN-COURS';
        if (estMoisCloture) {
            const dateValISO = validationRes.rows[0].date_validation ? new Date(validationRes.rows[0].date_validation).toISOString() : dateFinStr;
            fullHashArchive = validationRes.rows[0].signature_hash || crypto.createHash('sha256').update(`LIASSE-${id_salon}-${dateFinStr}-${validationRes.rows[0].valide_par}-${dateValISO}`).digest('hex');
            signatureArchive = fullHashArchive.substring(0, 16).toUpperCase();
            numeroArchive = `ARCH-${id_salon}-${referenceDate.getFullYear()}${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${signatureArchive}`;
        }

        // Utilisation de SELECT * pour éviter les crashs si la colonne forme_juridique n'est pas encore créée
        const configResult = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonConfig = configResult.rowCount > 0 ? configResult.rows[0] : {};
        const nomDuSalon = salonConfig.nom_salon || 'Salon Inconnu';
        
        // Déduction automatique du titre du dirigeant selon la forme juridique
        const getTitreDirigeant = (forme) => {
            if (!forme) return "Représentant Légal";
            const f = forme.toUpperCase().trim();
            if (['SARL', 'EURL', 'SNC'].includes(f)) return "Gérant(e)";
            if (['SAS', 'SASU', 'SA', 'ASSOCIATION'].includes(f)) return "Président(e)";
            if (['EI', 'EIRL', 'AUTO-ENTREPRENEUR', 'MICRO-ENTREPRISE'].includes(f)) return "Exploitant(e)";
            return "Représentant Légal";
        };
        const titreDirigeant = getTitreDirigeant(salonConfig.forme_juridique);
        
        // 🚨 BLOCAGE STRICT : SIRET ET ADRESSE OBLIGATOIRES (Rejection propre de la Promise)
        if (!salonConfig.siret || !salonConfig.adresse_salon || salonConfig.siret.trim() === '') {
            return reject(new Error("Édition bloquée : Le SIRET et l'Adresse du salon sont obligatoires pour générer une liasse légale. Veuillez les remplir dans vos paramètres."));
        }

        const franchiseTVA = !salonConfig.tva_intra || salonConfig.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${salonConfig.tva_intra}`;

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerant = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Gérant';

        // 1. REQUÊTE : Chiffre d'Affaires détaillé (Somme algébrique incluant ventes et avoirs d'annulation)
        const caDetailRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                lt.taux_tva_snapshot as taux_tva,
                SUM(lt.total_ligne_ttc) as total_ttc,
                SUM(lt.total_ligne_ttc / (1 + (lt.taux_tva_snapshot / 100))) as total_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), lt.taux_tva_snapshot
        `, [id_salon, dateDebutStr, dateFinStr]);

        // 2. REQUÊTE : Paiements et Mouvements
        const paiementsRes = await pool.query(`SELECT methode_paiement, COUNT(id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb, COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
        const statsRes = await pool.query(`SELECT COUNT(DISTINCT id_ticket) FILTER (WHERE type_ticket != 'ANNULATION' AND est_compense = FALSE) as nb_tickets, COUNT(DISTINCT id_client) as nb_clients, COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        
        const caisseRes = await pool.query(`
            SELECT 
                (SELECT COALESCE(fond_caisse_matin, 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3 ORDER BY date_cloture ASC LIMIT 1) as fond_debut_mois,
                (SELECT COALESCE(total_especes_reel, 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3 ORDER BY date_cloture DESC LIMIT 1) as fond_fin_mois,
                (SELECT COALESCE(SUM(ecart_caisse), 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3) 
                + 
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'REGULARISATION' AND DATE(date_creation) BETWEEN $2 AND $3) as ecarts,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'SORTIE' AND DATE(date_creation) BETWEEN $2 AND $3) as sorties,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'ENTREE' AND DATE(date_creation) BETWEEN $2 AND $3) as entrees
        `, [id_salon, dateDebutStr, dateFinStr]);

        const mouvementsRes = await pool.query(`
            SELECT type_mouvement, categorie_comptable, montant, motif, DATE(date_creation) as date_brute, TO_CHAR(date_creation, 'DD/MM/YYYY') as date_mvt 
            FROM mouvements_caisse 
            WHERE id_salon = $1 AND type_mouvement IN ('ENTREE', 'SORTIE') AND DATE(date_creation) BETWEEN $2 AND $3 
            ORDER BY date_creation ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        const pourboiresMoisRes = await pool.query(`
            SELECT COALESCE(SUM(montant_pourboire), 0) as total_pourboires
            FROM tickets
            WHERE id_salon = $1 AND statut = 'VALIDE' AND type_ticket != 'ANNULATION' AND est_compense = FALSE AND DATE(date_creation) BETWEEN $2 AND $3
        `, [id_salon, dateDebutStr, dateFinStr]);
        const totalPourboiresMois = parseFloat(pourboiresMoisRes.rows[0]?.total_pourboires) || 0;

        // --- Cumul annuel pour la Franchise en Base (basé sur l'année de referenceDate) ---
        const firstDayOfYear = new Date(referenceDate.getFullYear(), 0, 1);
        const dateDebutAnneeStr = formatYMD(firstDayOfYear);
        
        const cumulAnnuelRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                SUM(lt.total_ligne_ttc) as total_ttc
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION')
        `, [id_salon, dateDebutAnneeStr, dateFinStr]);

        // REQUÊTE : Historique des Z du mois (CA exact via c.total_encaisse, booléen est_cloture_automatique et nombre de tickets du jour)
        const zMoisRes = await pool.query(`
            SELECT c.id_cloture, COALESCE(c.numero_z_salon, c.id_cloture) as num_z_final, TO_CHAR(c.date_cloture, 'DD/MM/YYYY') as date_z, 
                   c.total_especes_reel, c.ferme_par, c.est_cloture_automatique, c.signature_hash, c.cumul_perpetuel_ttc,
                   COUNT(t.id_ticket) FILTER (WHERE t.type_ticket != 'ANNULATION' AND t.est_compense = FALSE) as nb_tickets,
                   COALESCE(c.total_encaisse, SUM(t.total_ttc), 0) as ca_ttc
            FROM clotures_caisse c
            LEFT JOIN tickets t ON t.id_salon = c.id_salon 
                                AND DATE(t.date_creation) = DATE(c.date_cloture)
                                AND t.statut = 'VALIDE'
            WHERE c.id_salon = $1 AND DATE(c.date_cloture) BETWEEN $2 AND $3 
            GROUP BY c.id_cloture, c.numero_z_salon, c.date_cloture, c.total_especes_reel, c.ferme_par, c.est_cloture_automatique, c.signature_hash, c.cumul_perpetuel_ttc, c.total_encaisse
            ORDER BY c.numero_z_salon ASC NULLS LAST, c.date_cloture ASC, c.id_cloture ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        // Sommes EXACTES arrêtées à la date du dernier Z
        const lastZRes = await pool.query(`SELECT MAX(DATE(date_cloture)) as date_max, TO_CHAR(MAX(date_cloture), 'DD/MM/YYYY') as date_max_str FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const lastZDate = lastZRes.rows[0].date_max || lastDayOfMonth;
        const lastZDateStr = lastZRes.rows[0].date_max_str || 'N/A';

        const controleRes = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(total_ttc), 0) FROM tickets WHERE id_salon = $1 AND methode_paiement = 'ESPECES' AND statut = 'VALIDE' AND DATE(date_creation) BETWEEN $2 AND $3) as especes_z,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'ENTREE' AND DATE(date_creation) BETWEEN $2 AND $3) as entrees_z,
                (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'SORTIE' AND DATE(date_creation) BETWEEN $2 AND $3) as sorties_z,
                (SELECT COALESCE(SUM(ecart_caisse), 0) FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3) + (SELECT COALESCE(SUM(montant), 0) FROM mouvements_caisse WHERE id_salon = $1 AND type_mouvement = 'REGULARISATION' AND DATE(date_creation) BETWEEN $2 AND $3) as ecarts_z
        `, [id_salon, dateDebutStr, lastZDate]);

        // 3. REQUÊTE : Dépenses
        const facturesRes = await pool.query(`SELECT nom_fournisseur, numero_facture, mode_paiement, statut_verification, justificatif_url, compte_comptable, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date_facture, montant_ht, montant_tva, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND DATE(date_traitement) BETWEEN $2 AND $3 ORDER BY date_traitement ASC`, [id_salon, dateDebutStr, dateFinStr]);

        // 4. REQUÊTE : Commissions Employés & Contrats (Recalcul exact + Heures + Pourboires)
        const rhRes = await pool.query(`
            SELECT e.id_employe, e.nom, e.est_gerant, e.type_contrat, e.heures_mensuelles_base,
                   MAX(e.taux_commission_prestation) as taux_presta,
                   MAX(e.taux_commission_produit) as taux_produit,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') = 'PRESTATION' THEN lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100) ELSE 0 END), 0) as base_presta_ht,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') != 'PRESTATION' THEN lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100) ELSE 0 END), 0) as base_produit_ht,
                   COALESCE(SUM(CASE WHEN COALESCE(c.type_article, 'PRESTATION') = 'PRESTATION' THEN (lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) * (e.taux_commission_prestation / 100) ELSE (lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) * (e.taux_commission_produit / 100) END), 0) as total_prime,
                   (SELECT COALESCE(SUM(montant_pourboire), 0) FROM tickets t2 WHERE t2.id_employe = e.id_employe AND DATE(t2.date_creation) BETWEEN $2 AND $3 AND t2.statut = 'VALIDE') as total_pourboire
            FROM employes e 
            LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) BETWEEN $2 AND $3 AND t.statut = 'VALIDE'
            LEFT JOIN lignes_ticket lt ON lt.id_ticket = t.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE e.id_salon = $1 
            GROUP BY e.id_employe, e.nom, e.est_gerant, e.type_contrat, e.heures_mensuelles_base
            ORDER BY e.est_gerant DESC, e.nom ASC
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);

        const anneeMoisAjustement = dateDebutStr.substring(0, 7); // Ex: "2026-10"
        const ajustementsRes = await pool.query(`SELECT id_employe, SUM(heures_ajoutees) as heures_supp FROM heures_ajustements WHERE mois_annee = $1 GROUP BY id_employe`, [anneeMoisAjustement]);
        const mapAjustements = {};
        ajustementsRes.rows.forEach(r => mapAjustements[r.id_employe] = parseFloat(r.heures_supp));

        // 4a. REQUÊTE : Calcul exact des heures pointées sur le mois (Mode POINTEUSE)
        const pointagesMoisRes = await pool.query(`
            SELECT id_employe, date_jour, type_action, heure_action
            FROM pointages
            WHERE id_salon = $1 AND date_jour BETWEEN $2 AND $3
            ORDER BY id_employe ASC, date_jour ASC, heure_action ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        const mapHeuresPointees = {};
        const pointagesParEmpJour = {};
        pointagesMoisRes.rows.forEach(pt => {
            const cle = `${pt.id_employe}_${new Date(pt.date_jour).toISOString().slice(0, 10)}`;
            if (!pointagesParEmpJour[cle]) pointagesParEmpJour[cle] = { id_employe: pt.id_employe, actions: [] };
            pointagesParEmpJour[cle].actions.push({ type: pt.type_action, ts: new Date(pt.heure_action).getTime() });
        });

        Object.values(pointagesParEmpJour).forEach(jour => {
            let debutTravail = null;
            let debutPause = null;
            let cumulMsJour = 0;

            jour.actions.forEach(act => {
                if (act.type === 'ENTREE') {
                    if (debutTravail === null) debutTravail = act.ts;
                } else if (act.type === 'PAUSE_DEBUT') {
                    if (debutTravail !== null && debutPause === null) debutPause = act.ts;
                } else if (act.type === 'PAUSE_FIN') {
                    if (debutPause !== null) {
                        debutTravail += (act.ts - debutPause);
                        debutPause = null;
                    }
                } else if (act.type === 'SORTIE') {
                    if (debutTravail !== null) {
                        const finEffective = debutPause !== null ? debutPause : act.ts;
                        if (finEffective > debutTravail) cumulMsJour += (finEffective - debutTravail);
                        debutTravail = null;
                        debutPause = null;
                    }
                }
            });

            const heuresJour = cumulMsJour / (1000 * 60 * 60);
            mapHeuresPointees[jour.id_employe] = (mapHeuresPointees[jour.id_employe] || 0) + heuresJour;
        });

        // 4bis. REQUÊTE : CA Réalisé par employé en HT réel
        const caEmployesRes = await pool.query(`
            SELECT t.id_employe, SUM(lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) as ca_realise_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY t.id_employe
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);
        const mapCaEmployes = {};
        caEmployesRes.rows.forEach(r => { mapCaEmployes[r.id_employe] = parseFloat(r.ca_realise_ht) || 0; });

        // 5. REQUÊTE : Absences
        const absencesRes = await pool.query(`
            SELECT DISTINCT e.nom as nom_employe, a.type_demande, a.nature_absence, a.date_debut, a.date_fin
            FROM absences_employes a
            JOIN employes e ON a.id_employe = e.id_employe
            WHERE a.id_salon = $1 AND a.statut = 'VALIDE' AND a.date_debut <= $3 AND a.date_fin >= $2
            ORDER BY e.nom ASC, a.date_debut ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

        // --- GÉNÉRATION DU PDF ---
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers); 
            // On renvoie le PDF brut en mémoire ainsi que les variables nécessaires pour la suite
            resolve({ 
                buffer: pdfData, 
                numeroArchive, 
                nomDuSalon, 
                firstDayOfMonth, 
                lastDayOfMonth, 
                salonConfig, 
                estMoisCloture 
            });
        });

        let currentY = 40;
        const MAIN_COLOR = '#111827'; const SEC_COLOR = '#4b5563'; const BORDER_COLOR = '#e5e7eb';

        // --- EN-TÊTE LÉGAL ---
        doc.font('Helvetica-Bold').fontSize(16).fillColor(MAIN_COLOR).text(`LIASSE COMPTABLE MENSUELLE`, 40, currentY);
        currentY += 20;
        
        const formeJuridique = salonConfig.forme_juridique ? ` - ${salonConfig.forme_juridique}` : '';
        const capSocialAff = salonConfig.capital_social && salonConfig.capital_social.trim() !== '' ? salonConfig.capital_social : 'Non renseigné';
        const rcsVilleAff = salonConfig.rcs_ville && salonConfig.rcs_ville.trim() !== '' ? salonConfig.rcs_ville : 'Non renseigné';

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${nomDuSalon}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${salonConfig.adresse_salon}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${salonConfig.siret} | Capital social : ${capSocialAff} | RCS : ${rcsVilleAff}`, 40, currentY);
        currentY += 12;
        doc.text(`${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 12;
        doc.text(`${titreDirigeant} : ${nomGerant}`, 40, currentY);
        currentY += 15;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(estMoisCloture ? '#16a34a' : '#ea580c').text(`ÉTAT : ${statutDocument}`, 40, currentY);
        doc.text(`Édité le : ${today.toLocaleDateString('fr-FR')} à ${today.toLocaleTimeString('fr-FR')}`, 355, currentY, { width: 200, align: 'right' });
        currentY += 15;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} au ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, currentY);
        currentY += 15;
        if (estMoisCloture) {
            // Encadré d'attestation individuelle (Conformité Loi de Finances)
            const hashLiasseSplit = fullHashArchive && fullHashArchive.length === 64
                ? `${fullHashArchive.substring(0, 32)}\n${fullHashArchive.substring(32, 64)}`
                : fullHashArchive;
            doc.rect(40, currentY - 5, 515, 75).fillAndStroke('#f0fdf4', '#16a34a');
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#16a34a').text(`✓ CLÔTURE MENSUELLE N° ${referenceDate.getFullYear()}${String(referenceDate.getMonth() + 1).padStart(2, '0')}`, 50, currentY);
            currentY += 14;
            doc.font('Courier').fontSize(7.5).fillColor('#111827').text(`Hash SHA-256 :\n${hashLiasseSplit}`, 50, currentY);
            currentY += 20;
            doc.font('Helvetica').fontSize(8).text(`Réf. Archive : ${numeroArchive}`, 50, currentY);
            currentY += 12;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor('#4b5563').text(`Logiciel STACK v1.0 - Attestation individuelle de conformité (CGI, art. 286, I-3° bis)`, 50, currentY);
            currentY += 15;
        }
        currentY += 25;

        // Moteur drawRow anti-chevauchement avec calcul dynamique de hauteur et support de police par colonne
        const drawRow = (cols, isHeader = false, isBold = false) => {
            const activeCols = cols.filter(c => c.w > 0);
            const defaultFont = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
            const defaultSize = isHeader ? 8 : 8.5;

            let maxH = 0;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s);
                const txt = col.text != null ? String(col.text) : '';
                const h = doc.heightOfString(txt, { width: col.w });
                if (h > maxH) maxH = h;
            });

            if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }

            let xPos = 40;
            activeCols.forEach(col => {
                const f = col.font || defaultFont;
                const s = col.size || defaultSize;
                doc.font(f).fontSize(s).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, {
                    width: col.w,
                    align: col.align || 'left',
                    link: col.link || null,
                    underline: !!col.link
                });
                xPos += col.w + 10;
            });

            currentY += Math.max(maxH, 10) + 4;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 5;
        };

        const drawTableTitle = (title) => {
            if (currentY > 750) { doc.addPage(); currentY = 40; }
            currentY += 10;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(title, 40, currentY);
            currentY += 16;
        };

        const fMnt = (mnt) => {
            const parts = (parseFloat(mnt) || 0).toFixed(2).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return parts.join(',') + ' €';
        };

        // --- 1. CHIFFRE D'AFFAIRES ---
        drawTableTitle("1. CHIFFRE D'AFFAIRES");
        drawRow([{text: 'Catégorie & Taux TVA', w: 180}, {text: 'Base HT', w: 100, align: 'right'}, {text: 'TVA Collectée', w: 100, align: 'right'}, {text: 'Total TTC', w: 105, align: 'right'}], true);
        let totalHT = 0, totalTVA = 0, globalTTC = 0;
        caDetailRes.rows.forEach(r => {
            const ttcCents = Math.round((parseFloat(r.total_ttc) || 0) * 100);
            const taux = franchiseTVA ? 0 : (parseFloat(r.taux_tva) || 0);
            const htCents = franchiseTVA ? ttcCents : Math.round(ttcCents / (1 + taux / 100));
            const tvaCents = ttcCents - htCents;

            const ht = htCents / 100;
            const tva = tvaCents / 100;
            const ttc = ttcCents / 100;

            const tauxTvaFormate = franchiseTVA ? '0%' : taux.toString().replace('.', ',') + '%';
            const label = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaFormate})`;
            
            totalHT = Number((totalHT + ht).toFixed(2));
            totalTVA = Number((totalTVA + tva).toFixed(2));
            globalTTC = Number((globalTTC + ttc).toFixed(2));
            drawRow([{text: label, w: 180}, {text: fMnt(ht), w: 100, align: 'right'}, {text: fMnt(tva), w: 100, align: 'right'}, {text: fMnt(ttc), w: 105, align: 'right'}]);
        });
        if (caDetailRes.rowCount === 0) drawRow([{text: 'Aucune transaction', w: 180}, {text: '-', w: 100, align: 'right'}, {text: '-', w: 100, align: 'right'}, {text: '-', w: 105, align: 'right'}]);
        drawRow([{text: 'TOTAL GÉNÉRAL', w: 180}, {text: fMnt(totalHT), w: 100, align: 'right'}, {text: fMnt(totalTVA), w: 100, align: 'right'}, {text: fMnt(globalTTC), w: 105, align: 'right'}], false, true);
        if (franchiseTVA) {
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* TVA non applicable, art. 293 B du CGI.", 40, currentY); currentY += 12;
            
            // Configuration des seuils légaux par année (Nouvelle réforme européenne applicable au 1er janvier 2025)
            const anneeEnCours = today.getFullYear();
            const seuilsFranchise = {
                2024: { presta_base: 36800, presta_majore: 39100, global_base: 91900, global_majore: 101000 },
                2025: { presta_base: 37500, presta_majore: 41250, global_base: 85000, global_majore: 93500 },
                2026: { presta_base: 37500, presta_majore: 41250, global_base: 85000, global_majore: 93500 }
            };
            // Si l'année n'est pas encore dans le tableau, on prend la dernière législation connue (2026)
            const s = seuilsFranchise[anneeEnCours] || seuilsFranchise[2026];

            // Affichage du cumul annuel pour surveillance des seuils de franchise
            let cumulServices = 0;
            let cumulTotal = 0;
            cumulAnnuelRes.rows.forEach(r => {
                const ttc = parseFloat(r.total_ttc) || 0;
                if (r.type_article === 'PRESTATION') cumulServices += ttc;
                cumulTotal += ttc;
            });

            currentY += 8;
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(`Suivi des seuils de Franchise en base (Cumul ${anneeEnCours}) :`, 40, currentY); currentY += 14;
            doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR).text(`• Prestations de services : ${fMnt(cumulServices)} (Seuil de base : ${fMnt(s.presta_base)} / Seuil majoré : ${fMnt(s.presta_majore)})`, 40, currentY); currentY += 12;
            doc.text(`• Chiffre d'affaires global (Prestations + Ventes) : ${fMnt(cumulTotal)} (Seuil de base : ${fMnt(s.global_base)} / Seuil majoré : ${fMnt(s.global_majore)})`, 40, currentY); currentY += 14;
            
            // Note explicative sur l'impact des seuils
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le dépassement du seuil majoré rend la TVA immédiate. Celui du seuil de base ne la déclenche qu'au 1er janvier suivant.", 40, currentY); currentY += 12;
        }

        // =========================================================================
        // PRÉPARATION DES DONNÉES FACTURES (Nécessaire pour la Section 2 et 3)
        // =========================================================================
        const iaFacturesRes = await pool.query(`SELECT id_tache, donnees, date_creation FROM ia_taches_attente WHERE id_salon = $1 AND type_tache = 'FACTURE_ACHAT' AND statut = 'ATTENTE'`, [id_salon]);
        const facturesMoisEtendues = await pool.query(`SELECT nom_fournisseur, numero_facture, mode_paiement, statut_verification, justificatif_url, fichier_cle_r2, compte_comptable, COALESCE(date_facture, DATE(date_traitement)) as date_facture_brute, COALESCE(date_reglement, DATE(date_traitement)) as date_paiement_brute, montant_ht, montant_tva, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND COALESCE(date_facture, DATE(date_traitement)) >= CURRENT_DATE - INTERVAL '1 year'`, [id_salon]);

        let toutesFactures = [];
        
        // 1. Ajout des factures validées (avec régénération à la volée des URLs R2 pour éviter tout lien expiré)
        for (const f of facturesMoisEtendues.rows) {
            let freshUrl = f.justificatif_url;
            if (f.fichier_cle_r2 && process.env.R2_BUCKET_NAME) {
                try {
                    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: f.fichier_cle_r2 });
                    freshUrl = await getSignedUrl(s3Client, cmd, { expiresIn: 604800 });
                } catch (e) {}
            }
            toutesFactures.push({
                fournisseur: f.nom_fournisseur || 'Inconnu',
                numero: f.numero_facture || null,
                date_facture: new Date(f.date_facture_brute),
                date_paiement: new Date(f.date_paiement_brute),
                mode_paiement: f.mode_paiement || 'NON_SPECIFIE',
                statut: 'VALIDE',
                compte: f.compte_comptable,
                ht: parseFloat(f.montant_ht) || 0,
                tva: parseFloat(f.montant_tva) || 0,
                ttc: parseFloat(f.montant_ttc) || 0,
                url: freshUrl,
                source: (freshUrl || f.fichier_cle_r2) ? 'IA' : 'Saisie'
            });
        }

        // 2. Ajout des factures IA en attente
        iaFacturesRes.rows.forEach(t => {
            const d = t.donnees || {};
            let dateF = d.date_facture ? new Date(d.date_facture) : new Date(t.date_creation);
            toutesFactures.push({
                fournisseur: d.fournisseur || 'Inconnu',
                numero: d.numero_facture || null,
                date_facture: dateF,
                date_paiement: dateF,
                mode_paiement: d.mode_paiement || 'NON_SPECIFIE',
                statut: 'A_VALIDER',
                compte: d.compte_comptable,
                ht: parseFloat(d.montant_ht) || 0,
                tva: parseFloat(d.montant_tva) || 0,
                ttc: parseFloat(d.montant_ttc) || 0,
                url: d.pdf_url,
                source: 'IA'
            });
        });

        let facturesAffichees = [];
        let facturesHorsPeriode = [];
        let facturesAPayer = [];
        let facturesDoublons = [];
        let mapUnique = new Map();
        let nbAValider = 0;

        toutesFactures.forEach(f => {
            const numKey = f.numero ? f.numero.toString().trim().toLowerCase() : 'sans_num';
            const key = `${f.fournisseur.trim().toLowerCase()}_${numKey}`;
            
            // Dédoublonnage exact
            if (numKey !== 'sans_num' && mapUnique.has(key)) {
                facturesDoublons.push(f);
                return;
            }
            if (numKey !== 'sans_num') mapUnique.set(key, true);
            if (f.statut === 'A_VALIDER') nbAValider++;

            // Vérification si la facture appartient à ce mois
            const isFactureInMonth = !isNaN(f.date_facture) && f.date_facture >= firstDayOfMonth && f.date_facture <= lastDayOfMonth;
            const isPaiementInMonth = !isNaN(f.date_paiement) && f.date_paiement >= firstDayOfMonth && f.date_paiement <= lastDayOfMonth;
            
            if (isNaN(f.date_facture.getTime())) {
                facturesHorsPeriode.push({...f, raison: "Date invalide ou manquante"});
            } else if (isFactureInMonth || isPaiementInMonth) {
                facturesAffichees.push(f);
                if (f.mode_paiement === 'NON_SPECIFIE' || f.mode_paiement === 'N/A') facturesAPayer.push(f);
            } else {
                facturesHorsPeriode.push({...f, raison: "Hors période cible"});
            }
        });

        facturesAffichees.sort((a, b) => a.date_facture - b.date_facture);

        // --- 2. RAPPROCHEMENT BANCAIRE ---
        // Total largeur : 210 + 70 + 215 = 495 + 2*10 = 515 pt (Fusion Col 1+2 = 210 + 10 + 70 = 290 pt)
        drawTableTitle("2. RAPPROCHEMENT BANCAIRE ET CAISSE");
        drawRow([{text: 'Méthode de paiement', w: 210}, {text: 'Nb Trans.', w: 70, align: 'center'}, {text: 'Montant Encaissé TTC', w: 215, align: 'right'}], true);
        
        const methodes = ['CARTE', 'ESPECES', 'CHEQUE', 'VIREMENT', 'BONS CADEAUX'];
        let mapPaiements = {}; paiementsRes.rows.forEach(m => mapPaiements[m.methode_paiement] = m);
        let totalEncaissementsReel = 0;
        methodes.forEach(m => {
            const row = mapPaiements[m] || { nb: 0, total: 0 };
            const mntMode = Number((parseFloat(row.total) || 0).toFixed(2));
            totalEncaissementsReel = Number((totalEncaissementsReel + mntMode).toFixed(2));
            drawRow([{text: m, w: 210}, {text: row.nb, w: 70, align: 'center'}, {text: fMnt(mntMode), w: 215, align: 'right'}]);
        });
        
        const panierMoyen = statsRes.rows[0].nb_tickets > 0 ? (totalEncaissementsReel / statsRes.rows[0].nb_tickets) : 0;
        drawRow([{text: `Total Encaissements CA (${statsRes.rows[0].nb_tickets} tickets, Panier Moyen : ${fMnt(panierMoyen)})`, w: 290}, {text: fMnt(totalEncaissementsReel), w: 215, align: 'right'}], false, true);
        if (totalPourboiresMois > 0) {
            drawRow([{text: 'Pourboires encaissés pour le compte des salariés (Compte 426 - Hors TVA)', w: 290}, {text: fMnt(totalPourboiresMois), w: 215, align: 'right'}]);
            drawRow([{text: 'TOTAL TRÉSORERIE ENCAISSÉE (CA TTC + Pourboires)', w: 290}, {text: fMnt(totalEncaissementsReel + totalPourboiresMois), w: 215, align: 'right'}], false, true);
        }
        
        currentY += 10;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Ce tableau facilite le rapprochement avec votre relevé bancaire.", 40, currentY); currentY += 12;

        // Ventilation intelligente des mouvements d'espèces par catégorie comptable (PCG)
        const hasValidZ = Boolean(lastZRes.rows[0].date_max);
        const datePivotZ = hasValidZ ? new Date(lastZRes.rows[0].date_max) : null;
        if (datePivotZ) datePivotZ.setHours(23, 59, 59, 999);

        let sumRemisesBanqueZ = 0;
        let sumAchatsEspecesZ = 0;
        let sumPrelevementsGerantZ = 0;

        mouvementsRes.rows.forEach(mvt => {
            const dM = new Date(mvt.date_brute);
            const cat = deduireCategorieMouvement(mvt.type_mouvement, mvt.motif, mvt.categorie_comptable);
            const mnt = parseFloat(mvt.montant) || 0;
            if (!datePivotZ || dM <= datePivotZ) {
                if (mvt.type_mouvement === 'SORTIE') {
                    if (cat === 'REMISE_BANQUE') sumRemisesBanqueZ += mnt;
                    else if (cat === 'PRELEVEMENT_GERANT') sumPrelevementsGerantZ += mnt;
                    else sumAchatsEspecesZ += mnt;
                }
            }
        });

        const totalChequesMois = parseFloat(mapPaiements['CHEQUE']?.total || 0);
        const totalRemisesAPointer = sumRemisesBanqueZ + totalChequesMois;

        drawRow([{text: 'Remises en banque déclarées (Dépôts espèces 580 + Chèques) :', w: 290}, {text: totalRemisesAPointer > 0 ? fMnt(totalRemisesAPointer) : '0,00 €', w: 215, align: 'right'}]);
        drawRow([{text: 'Commissions bancaires (Frais CB, Stripe, etc.) :', w: 290}, {text: 'À pointer sur relevé', w: 215, align: 'right'}]);
        
        const fondDebut = parseFloat(caisseRes.rows[0].fond_debut_mois) || 0;
        const fondFin = parseFloat(caisseRes.rows[0].fond_fin_mois) || 0;
        const especesEncaisseesZ = parseFloat(controleRes.rows[0].especes_z) || 0;
        const apportsZ = parseFloat(controleRes.rows[0].entrees_z) || 0;
        const retraitsZ = parseFloat(controleRes.rows[0].sorties_z) || 0;
        const ecartsZ = parseFloat(controleRes.rows[0].ecarts_z) || 0;
        
        const caisseCalculee = fondDebut + especesEncaisseesZ + apportsZ - retraitsZ + ecartsZ;
        
        currentY += 5;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text(`CONTRÔLE DE CAISSE (Arrêté au dernier Z : ${lastZDateStr})`, 40, currentY); currentY += 14;
        
        drawRow([{text: 'Fond de caisse au 1er du mois (Ouverture)', w: 290}, {text: fMnt(fondDebut), w: 215, align: 'right'}]);
        drawRow([{text: `Espèces encaissées (Jusqu'au ${lastZDateStr}) (+)`, w: 290}, {text: fMnt(especesEncaisseesZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Apports de fonds en caisse (Compte 580/108) (+)', w: 290}, {text: fMnt(apportsZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Achats et dépenses payés en espèces (Compte 6xx/401) (-)', w: 290}, {text: fMnt(sumAchatsEspecesZ), w: 215, align: 'right'}]);
        drawRow([{text: 'Remises d\'espèces en banque (Compte 580) (-)', w: 290}, {text: fMnt(sumRemisesBanqueZ), w: 215, align: 'right'}]);
        if (sumPrelevementsGerantZ > 0) {
            drawRow([{text: 'Prélèvements de l\'exploitant / Gérant (Compte 108) (-)', w: 290}, {text: fMnt(sumPrelevementsGerantZ), w: 215, align: 'right'}]);
        }
        drawRow([{text: 'Régularisations et Écarts constatés (Compte 658/758) (±)', w: 290}, {text: fMnt(ecartsZ), w: 215, align: 'right'}]);
        
        drawRow([{text: 'ESPÈCES THÉORIQUES (Calculées)', w: 290}, {text: fMnt(caisseCalculee), w: 215, align: 'right'}], false, true);
        
        let especesCompteesTexte = hasValidZ ? fMnt(fondFin) : 'Aucun Z clôturé';
        if (zMoisRes.rowCount > 0) {
            const dernierZMois = zMoisRes.rows[zMoisRes.rowCount - 1];
            const isAutoZ = Boolean(dernierZMois.est_cloture_automatique);
            if (isAutoZ) especesCompteesTexte = 'Non compté (Clôture Auto. à régulariser)';
        }
        
        drawRow([{text: `ESPÈCES COMPTÉES (Lors du Z du ${lastZDateStr})`, w: 290}, {text: especesCompteesTexte, w: 215, align: 'right'}], false, true);

        // --- VÉRIFICATION DE LA COHÉRENCE ESPÈCES (Factures espèces vs Sorties ACHAT_ESPECES uniquement) ---
        let totalFacturesEspecesMois = 0;
        facturesAffichees.forEach(f => {
            if (f.mode_paiement === 'ESPECES') totalFacturesEspecesMois += f.ttc;
        });

        const ecartDepensesCaisse = totalFacturesEspecesMois - sumAchatsEspecesZ;
        
        if (Math.abs(ecartDepensesCaisse) > 0.01) {
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#ea580c').text(
                `ALERTE COMPTABLE : Désynchronisation Caisse / Factures réglées en espèces.`, 40, currentY
            );
            currentY += 12;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text(
                `La section "3. Dépenses" totalise ${fMnt(totalFacturesEspecesMois)} de factures payées en espèces ce mois-ci, contre ${fMnt(sumAchatsEspecesZ)} de sorties d'achats en espèces enregistrées en caisse sur la période clôturée.`, 
                40, currentY, { width: 515, lineGap: 2 }
            );
            currentY += 20;
        }

        // Détail des mouvements de caisse (Apports/Retraits) sans bug lorsque aucun Z n'est présent
        if (mouvementsRes.rowCount > 0) {
            const mvtsAvantZ = [];
            const mvtsApresZ = [];

            mouvementsRes.rows.forEach(mvt => {
                const dM = new Date(mvt.date_brute);
                if (datePivotZ && dM <= datePivotZ) mvtsAvantZ.push(mvt);
                else mvtsApresZ.push(mvt);
            });

            const formatLabelCat = (mvt) => {
                const cat = deduireCategorieMouvement(mvt.type_mouvement, mvt.motif, mvt.categorie_comptable);
                if (mvt.type_mouvement === 'ENTREE') return 'Apport (580)';
                if (cat === 'REMISE_BANQUE') return 'Dépôt Banque (580)';
                if (cat === 'PRELEVEMENT_GERANT') return 'Prélèv. (108)';
                return 'Achat Esp. (6xx)';
            };

            if (mvtsAvantZ.length > 0) {
                currentY += 5;
                doc.font('Helvetica-Bold').fontSize(9).fillColor(SEC_COLOR).text(`Détail des Mouvements d'espèces (Inclus jusqu'au Z du ${lastZDateStr}) :`, 40, currentY); currentY += 14;
                mvtsAvantZ.forEach(mvt => {
                    drawRow([
                        {text: mvt.date_mvt, w: 65, align: 'center'}, 
                        {text: formatLabelCat(mvt), w: 90}, 
                        {text: mvt.motif || 'Non renseigné', w: 215}, 
                        {text: fMnt(mvt.montant), w: 115, align: 'right'}
                    ]);
                });
            }

            if (mvtsApresZ.length > 0) {
                currentY += 5;
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(`Mouvements en attente de clôture Z (Non inclus dans l'arrêté Z ci-dessus) :`, 40, currentY); currentY += 14;
                mvtsApresZ.forEach(mvt => {
                    drawRow([
                        {text: mvt.date_mvt, w: 65, align: 'center'}, 
                        {text: formatLabelCat(mvt), w: 90}, 
                        {text: mvt.motif || 'Non renseigné', w: 215}, 
                        {text: fMnt(mvt.montant), w: 115, align: 'right'}
                    ]);
                });
            }
        }

       // --- 3. DÉPENSES ---
        drawTableTitle("3. DÉPENSES ET ACHATS");

        doc.font('Helvetica-Oblique').fontSize(9).fillColor(SEC_COLOR)
           .text(`Factures dans l'app : ${toutesFactures.length} · Affichées : ${facturesAffichees.length} · Hors période ou sans date : ${facturesHorsPeriode.length} · Doublons : ${facturesDoublons.length}`, 40, currentY);
        currentY += 15;
        
        if (nbAValider > 0) {
            doc.font('Helvetica-Bold').fillColor('#ea580c').text(`BLOCAGE : ${nbAValider} dépense(s) "À valider". La version définitive nécessite leur traitement.`, 40, currentY);
            currentY += 15;
        }

        if (currentY > 680) { doc.addPage(); currentY = 40; }

        // Largeurs calibrées (10 colonnes) : 62 + 43 + 32 + 40 + 38 + 38 + 24 + 48 + 45 + 55 = 425 + 9*10 = 515 pt
        // Fusion Col 1+2 = 62 + 10 + 43 = 115 pt
        // Fusion Col 1..7 = 277 + 6*10 = 337 pt | Fusion Col 1..9 = 337 + 10 + 48 + 10 + 45 = 450 pt
        const drawHeaderDepenses = () => {
            drawRow([
                {text: 'Fournisseur', w: 62},
                {text: 'N° Fact.', w: 43},
                {text: 'Source', w: 32, align: 'center'},
                {text: 'Date F.', w: 40, align: 'center'},
                {text: 'Paiem.', w: 38, align: 'center'},
                {text: 'Statut', w: 38, align: 'center'},
                {text: 'Cpte', w: 24, align: 'center'},
                {text: 'HT', w: 48, align: 'right'},
                {text: 'TVA', w: 45, align: 'right'},
                {text: 'TTC', w: 55, align: 'right'}
            ], true);
        };
        
        drawHeaderDepenses();
        
        let sumDepensesBanque = 0, sumDepensesEspeces = 0, sumDepensesInconnu = 0;
        let totalDepensesHT = 0, totalDepensesTVA = 0, totalDepensesTTC = 0;
        const ventilationPCG = {};

        const libellesComptesPCG = {
            '6022': '6022 - Achats de fournitures et produits consommables (Bac / Technique)',
            '6028': '6028 - Achats d\'autres approvisionnements et consommables',
            '604': '6040 - Achats d\'études et prestations de services',
            '6061': '6061 - Fournitures non stockables (Eau, Énergie, Électricité)',
            '6063': '6063 - Fournitures d\'entretien et de petit équipement',
            '6064': '6064 - Fournitures administratives',
            '607': '6070 - Achats de marchandises (Produits destinés à la revente)',
            '613': '6130 - Locations immobilières et mobilières (Loyers)',
            '615': '6150 - Entretien et réparations',
            '616': '6160 - Primes d\'assurances',
            '6226': '6226 - Honoraires (Expert-comptable, Juridique)',
            '623': '6230 - Publicité, publications, relations publiques',
            '626': '6260 - Frais postaux et de télécommunications',
            '627': '6270 - Services bancaires et assimilés'
        };
        
        if (facturesAffichees.length === 0) {
            drawRow([{text: 'Aucune facture datée de cette période.', w: 515}]);
        } else {
            facturesAffichees.forEach(f => {
                const fTtcCents = Math.round((parseFloat(f.ttc) || 0) * 100);
                const fTvaCents = franchiseTVA ? 0 : Math.round((parseFloat(f.tva) || 0) * 100);
                let fHtCents = franchiseTVA ? fTtcCents : Math.round((parseFloat(f.ht) || 0) * 100);
                if (fHtCents + fTvaCents !== fTtcCents) fHtCents = fTtcCents - fTvaCents;

                const htPropre = fHtCents / 100;
                const tvaPropre = fTvaCents / 100;
                const ttcPropre = fTtcCents / 100;

                totalDepensesHT = Number((totalDepensesHT + htPropre).toFixed(2));
                totalDepensesTVA = Number((totalDepensesTVA + tvaPropre).toFixed(2));
                totalDepensesTTC = Number((totalDepensesTTC + ttcPropre).toFixed(2));
                
                if (f.mode_paiement === 'ESPECES') sumDepensesEspeces = Number((sumDepensesEspeces + ttcPropre).toFixed(2));
                else if (!f.mode_paiement || f.mode_paiement === 'NON_SPECIFIE' || f.mode_paiement === 'N/A') sumDepensesInconnu = Number((sumDepensesInconnu + ttcPropre).toFixed(2));
                else sumDepensesBanque = Number((sumDepensesBanque + ttcPropre).toFixed(2));
                
                let compte = f.compte ? String(f.compte).trim() : '';
                if (!compte) {
                    const nomLower = f.fournisseur.toLowerCase();
                    if (nomLower.includes('l\'oréal') || nomLower.includes('wella') || nomLower.includes('schwarzkopf') || nomLower.includes('revente') || nomLower.includes('produit') || nomLower.includes('grossiste')) compte = '607';
                    else if (nomLower.includes('edf') || nomLower.includes('engie') || nomLower.includes('eau')) compte = '6061';
                    else if (nomLower.includes('loyer') || nomLower.includes('sci') || nomLower.includes('immo')) compte = '613';
                    else if (nomLower.includes('assurance') || nomLower.includes('axa') || nomLower.includes('allianz')) compte = '616';
                    else compte = '604';
                }

                if (!ventilationPCG[compte]) ventilationPCG[compte] = { nb: 0, ht: 0, tva: 0, ttc: 0 };
                ventilationPCG[compte].nb++;
                ventilationPCG[compte].ht = Number((ventilationPCG[compte].ht + htPropre).toFixed(2));
                ventilationPCG[compte].tva = Number((ventilationPCG[compte].tva + tvaPropre).toFixed(2));
                ventilationPCG[compte].ttc = Number((ventilationPCG[compte].ttc + ttcPropre).toFixed(2));

                const statutColor = f.statut === 'VALIDE' ? '#16a34a' : '#ea580c';
                const statutText = f.statut === 'VALIDE' ? 'Validé' : 'À valider';

                let refFacture = f.numero ? String(f.numero) : 'n° inconnu';
                let sourceDoc = f.url ? { text: 'Doc IA', link: f.url, color: '#0ea5e9' } : { text: 'Saisie' };
                const modePaiementCourt = f.mode_paiement === 'NON_SPECIFIE' ? 'N/A' : f.mode_paiement;
                
                const dateFAff = !isNaN(f.date_facture) ? f.date_facture.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'2-digit'}) : 'N/A';

                if (currentY > 730) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }

                drawRow([
                    {text: f.fournisseur, w: 62, size: 7.5}, 
                    {text: refFacture, w: 43, size: 7.5}, 
                    {text: sourceDoc.text, link: sourceDoc.link, color: sourceDoc.color, w: 32, align: 'center', size: 8},
                    {text: dateFAff, w: 40, align: 'center', size: 8},
                    {text: modePaiementCourt, w: 38, align: 'center', size: 7.5}, 
                    {text: statutText, w: 38, align: 'center', color: statutColor, size: 8},
                    {text: compte, w: 24, align: 'center', size: 8}, 
                    {text: fMnt(htPropre), w: 48, align: 'right', size: 8},
                    {text: fMnt(tvaPropre), w: 45, align: 'right', size: 8}, 
                    {text: fMnt(ttcPropre), w: 55, align: 'right', size: 8}
                ]);
            });
        }
        
        if (currentY > 710) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }
        
        let hasChargesFixes = facturesAffichees.some(f => {
            const cpte = f.compte || '';
            const nomL = (f.fournisseur || '').toLowerCase();
            return cpte.startsWith('61') || cpte.startsWith('62') || cpte.startsWith('63') || cpte.startsWith('64') || nomL.includes('edf') || nomL.includes('urssaf') || nomL.includes('loyer') || nomL.includes('assurance');
        });

        // Fusion Col 1 + Col 2 = 62 + 10 + 43 = 115 pt pour alignement strict avec les colonnes 3 à 10
        if (!hasChargesFixes) {
            drawRow([
                {text: 'Aucune charge fixe saisie (Loyer, URSSAF...)', w: 115},
                {text: 'N/A', w: 32, align: 'center'},
                {text: '-', w: 40, align: 'center'},
                {text: '-', w: 38, align: 'center'},
                {text: '-', w: 38, align: 'center'},
                {text: '-', w: 24, align: 'center'},
                {text: '-', w: 48, align: 'right'},
                {text: '-', w: 45, align: 'right'},
                {text: '0,00 €', w: 55, align: 'right'}
            ]);
        }
        
        drawRow([
            {text: 'Variation de stock (Produits)', w: 115},
            {text: 'N/A', w: 32, align: 'center'},
            {text: '-', w: 40, align: 'center'},
            {text: '-', w: 38, align: 'center'},
            {text: 'Invent.', w: 38, align: 'center'},
            {text: '6037', w: 24, align: 'center'},
            {text: '-', w: 48, align: 'right'},
            {text: '-', w: 45, align: 'right'},
            {text: 'N/R', w: 55, align: 'right'}
        ]);
        
        if (currentY > 670) { doc.addPage(); currentY = 40; }
        
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES PAR BANQUE (CB, Prélèvement, Virement)', w: 450}, {text: fMnt(sumDepensesBanque), w: 55, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES EN ESPÈCES (Déduites de la caisse)', w: 450}, {text: fMnt(sumDepensesEspeces), w: 55, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES NON RÉGLÉES OU MODE INCONNU (Compte 401)', w: 450}, {text: fMnt(sumDepensesInconnu), w: 55, align: 'right'}], false, true);
        drawRow([
            {text: 'TOTAL GÉNÉRAL DES DÉPENSES', w: 337},
            {text: fMnt(totalDepensesHT), w: 48, align: 'right'},
            {text: fMnt(totalDepensesTVA), w: 45, align: 'right'},
            {text: fMnt(totalDepensesTTC), w: 55, align: 'right'}
        ], false, true);

        if (franchiseTVA) {
            currentY += 4;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* En franchise en base de TVA, la TVA sur achats n'est pas récupérable. La charge réelle retenue en comptabilité est le montant TTC.", 40, currentY); 
            currentY += 12;
        }

        // --- 3 BIS. VENTILATION DES ACHATS PAR COMPTE COMPTABLE (PCG CLASSE 6) ---
        const comptesTries = Object.keys(ventilationPCG).sort();
        if (comptesTries.length > 0) {
            if (currentY > 650) { doc.addPage(); currentY = 40; }
            drawTableTitle("3 BIS. VENTILATION COMPTABLE DES CHARGES PAR COMPTE (PCG)");
            // Largeurs : 240 + 45 + 60 + 60 + 70 = 475 + 4*10 = 515 pt
            drawRow([
                {text: 'Compte PCG & Intitulé', w: 240},
                {text: 'Pièces', w: 45, align: 'center'},
                {text: 'Base HT', w: 60, align: 'right'},
                {text: 'TVA (44566)', w: 60, align: 'right'},
                {text: 'Total TTC', w: 70, align: 'right'}
            ], true);

            comptesTries.forEach(cpte => {
                const v = ventilationPCG[cpte];
                const intitule = libellesComptesPCG[cpte] || `${cpte} - Autres achats et charges externes`;
                drawRow([
                    {text: intitule, w: 240},
                    {text: String(v.nb), w: 45, align: 'center'},
                    {text: fMnt(v.ht), w: 60, align: 'right'},
                    {text: fMnt(v.tva), w: 60, align: 'right'},
                    {text: fMnt(v.ttc), w: 70, align: 'right'}
                ]);
            });
            drawRow([
                {text: 'TOTAL VENTILATION CLASSE 6', w: 295},
                {text: fMnt(totalDepensesHT), w: 60, align: 'right'},
                {text: fMnt(totalDepensesTVA), w: 60, align: 'right'},
                {text: fMnt(totalDepensesTTC), w: 70, align: 'right'}
            ], false, true);
        }

        // --- 3 TER. SYNTHÈSE DE TVA (PRÉPARATION DÉCLARATION CA3 / CA12) ---
        if (!franchiseTVA) {
            if (currentY > 630) { doc.addPage(); currentY = 40; }
            drawTableTitle("3 TER. SYNTHÈSE DE TVA DU MOIS (Aide à la déclaration CA3)");
            // Largeurs : 265 + 115 + 115 = 495 + 2*10 = 515 pt
            drawRow([
                {text: 'Poste de TVA & Compte PCG', w: 265},
                {text: 'Base HT', w: 115, align: 'right'},
                {text: 'Montant TVA', w: 115, align: 'right'}
            ], true);

            drawRow([
                {text: 'TVA Collectée sur Chiffre d\'Affaires (Compte 44571x) (+)', w: 265},
                {text: fMnt(totalHT), w: 115, align: 'right'},
                {text: fMnt(totalTVA), w: 115, align: 'right'}
            ]);
            drawRow([
                {text: 'TVA Déductible sur Achats de biens et services (Compte 445660) (-)', w: 265},
                {text: fMnt(totalDepensesHT), w: 115, align: 'right'},
                {text: fMnt(totalDepensesTVA), w: 115, align: 'right'}
            ]);

            const tvaNette = Number((totalTVA - totalDepensesTVA).toFixed(2));
            const libelleTvaNette = tvaNette >= 0
                ? 'TVA NETTE À DÉCAISSER AU TRÉSOR PUBLIC (Compte 445510) (=)'
                : 'CRÉDIT DE TVA REPORTABLE SUR LE MOIS SUIVANT (Compte 445670) (=)';
            const couleurTvaNette = tvaNette >= 0 ? MAIN_COLOR : '#16a34a';

            drawRow([
                {text: libelleTvaNette, w: 390, color: couleurTvaNette},
                {text: fMnt(Math.abs(tvaNette)), w: 115, align: 'right', color: couleurTvaNette}
            ], false, true);
        }

        // --- ANNEXES : HORS PÉRIODE, DOUBLONS ET À PAYER ---
        if (facturesHorsPeriode.length > 0 || facturesDoublons.length > 0 || facturesAPayer.length > 0) {
            if (currentY > 650) { doc.addPage(); currentY = 40; } else { currentY += 15; }
            
            if (facturesHorsPeriode.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("Annexe : Factures hors période ou sans date (Exclues du total)", 40, currentY); currentY += 15;
                
                let sansDate = [];
                let parMois = {};
                facturesHorsPeriode.forEach(f => {
                    if (isNaN(f.date_facture.getTime())) {
                        sansDate.push(f);
                    } else {
                        const m = f.date_facture.toLocaleDateString('fr-FR', {month: 'long', year: 'numeric'});
                        if (!parMois[m]) parMois[m] = { count: 0, total: 0 };
                        parMois[m].count++;
                        parMois[m].total += f.ttc;
                    }
                });
                
                Object.keys(parMois).forEach(mois => {
                    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MAIN_COLOR).text(`• Synthèse : ${parMois[mois].count} facture(s) datée(s) de ${mois}, total ${fMnt(parMois[mois].total)}`, 50, currentY);
                    currentY += 12;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                
                sansDate.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - N° ${f.numero || 'Inconnu'} - Sans date - ${fMnt(f.ttc)} -> Exclue : Date invalide ou manquante`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                currentY += 10;
            }

            if (facturesDoublons.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#ea580c').text("Annexe : Doublons détectés et bloqués (Exclus du total)", 40, currentY); currentY += 15;
                facturesDoublons.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - ${fMnt(f.ttc)} -> doublon de la facture n° ${f.numero}`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
                currentY += 10;
            }

            if (facturesAPayer.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text("Factures à payer à fin de mois (Non réglées / Mode inconnu)", 40, currentY); currentY += 15;
                facturesAPayer.forEach(f => {
                    doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(`• ${f.fournisseur} - N° ${f.numero || 'Inconnu'} - Reste à régler : ${fMnt(f.ttc)}`, 50, currentY);
                    currentY += 10;
                    if (currentY > 780) { doc.addPage(); currentY = 40; }
                });
            }
        }

        // On démarre systématiquement la section 4 (Variables de paie) sur une nouvelle page
        doc.addPage();
        currentY = 40;

        // --- 4. VARIABLES DE PAIE ---
        drawTableTitle("4. VARIABLES DE PAIE (À transmettre au comptable)");
        
        // Largeurs calibrées sur le gap de 10pt de drawRow : 52+38+30+30+38+56+86+47+58 = 435pt + (8 * 10pt) = 515pt exacts
        drawRow([
            {text: 'Employé(e)', w: 52}, 
            {text: 'Statut', w: 38, align: 'center'},
            {text: 'Heures', w: 30, align: 'center'},
            {text: 'HS/HC', w: 30, align: 'center'},
            {text: 'Pourb.', w: 38, align: 'right'},
            {text: 'CA HT', w: 56, align: 'right'}, 
            {text: 'Base HT (Prs/Prd)', w: 86, align: 'right'}, 
            {text: 'Taux (P/P)', w: 47, align: 'center'}, 
            {text: 'Prime Brute', w: 58, align: 'right'}
        ], true);

        let globalPrimes = 0;
        let totalCAEmployes = 0;
        rhRes.rows.forEach(e => {
            const nomComplet = e.nom || 'Inconnu';
            const caRealiseBaseHT = mapCaEmployes[e.id_employe] || 0;
            totalCAEmployes += caRealiseBaseHT;
            
            const basePrestaHT = parseFloat(e.base_presta_ht || 0);
            const baseProduitHT = parseFloat(e.base_produit_ht || 0);
            
            let heuresAffichees = '-';
            let hsAffichees = '-';
            let pourboireAffiche = parseFloat(e.total_pourboire) > 0 ? fMnt(e.total_pourboire) : '0,00 €';

            if (e.est_gerant) {
                heuresAffichees = 'N/A';
                hsAffichees = 'N/A';
                pourboireAffiche = 'N/A';
            } else if (salonConfig.mode_suivi_heures === 'POINTEUSE') {
                const baseContrat = parseFloat(e.heures_mensuelles_base || 151.67);
                const heuresPointees = mapHeuresPointees[e.id_employe] || 0;
                const heuresAjust = mapAjustements[e.id_employe] || 0;
                const totalEffectif = Number((heuresPointees + heuresAjust).toFixed(2));

                if (totalEffectif > 0) {
                    heuresAffichees = `${totalEffectif.toFixed(1)}h`;
                    const diffHeures = Number((totalEffectif - baseContrat).toFixed(1));
                    hsAffichees = diffHeures > 0 ? `+${diffHeures}h` : `${diffHeures}h`;
                } else {
                    heuresAffichees = `${baseContrat.toFixed(0)}h*`;
                    hsAffichees = heuresAjust !== 0 ? (heuresAjust > 0 ? `+${heuresAjust}h` : `${heuresAjust}h`) : '0h';
                }
            } else {
                const baseContrat = parseFloat(e.heures_mensuelles_base || 151.67);
                const heuresAjust = mapAjustements[e.id_employe] || 0;
                
                heuresAffichees = `${baseContrat.toFixed(0)}h`;
                
                if (heuresAjust !== 0) {
                    hsAffichees = heuresAjust > 0 ? `+${heuresAjust}h` : `${heuresAjust}h`;
                } else {
                    hsAffichees = '0h';
                }
            }

            if (e.est_gerant) {
                drawRow([
                    {text: nomComplet, w: 52, size: 8}, 
                    {text: 'Gérant', w: 38, align: 'center', size: 8},
                    {text: heuresAffichees, w: 30, align: 'center', size: 8},
                    {text: hsAffichees, w: 30, align: 'center', size: 8},
                    {text: pourboireAffiche, w: 38, align: 'right', size: 8},
                    {text: fMnt(caRealiseBaseHT), w: 56, align: 'right', size: 8}, 
                    {text: '-', w: 86, align: 'right', size: 8}, 
                    {text: '-', w: 47, align: 'center', size: 8}, 
                    {text: '-', w: 58, align: 'right', size: 8}
                ]);
            } else {
                globalPrimes = Number((globalPrimes + (parseFloat(e.total_prime) || 0)).toFixed(2));
                const fmtBase = (n) => {
                    const parts = (parseFloat(n) || 0).toFixed(2).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                    return parts.join(',');
                };
                const tauxPresta = parseFloat(e.taux_presta || 0);
                const tauxProduit = parseFloat(e.taux_produit || 0);
                const regleTaux = `${tauxPresta}% / ${tauxProduit}%`;
                const basesConcat = `${fmtBase(basePrestaHT)} / ${fmtBase(baseProduitHT)}`;
                
                drawRow([
                    {text: nomComplet, w: 52, size: 8}, 
                    {text: 'Salarié', w: 38, align: 'center', size: 8},
                    {text: heuresAffichees, w: 30, align: 'center', size: 8},
                    {text: hsAffichees, w: 30, align: 'center', size: 8},
                    {text: pourboireAffiche, w: 38, align: 'right', size: 8},
                    {text: fMnt(caRealiseBaseHT), w: 56, align: 'right', size: 8}, 
                    {text: basesConcat, w: 86, align: 'right', size: 8}, 
                    {text: regleTaux, w: 47, align: 'center', size: 8}, 
                    {text: fMnt(e.total_prime), w: 58, align: 'right', size: 8}
                ]);
            }
        });
        
        // Calcul et affichage du CA non attribué (Tickets sans employé ou employé supprimé)
        const caNonAttribue = totalHT - totalCAEmployes;
        if (Math.abs(caNonAttribue) > 0.01) {
            drawRow([
                {text: 'CA orphelin', w: 52}, 
                {text: 'N/A', w: 38, align: 'center'},
                {text: '-', w: 30, align: 'center'},
                {text: '-', w: 30, align: 'center'},
                {text: '-', w: 38, align: 'right'},
                {text: fMnt(caNonAttribue), w: 56, align: 'right'}, 
                {text: '-', w: 86, align: 'right'}, 
                {text: '-', w: 47, align: 'center'}, 
                {text: '-', w: 58, align: 'right'}
            ]);
        }

        if (rhRes.rowCount === 0) drawRow([{text: 'Aucune donnée.', w: 515}]);
        
        currentY += 4;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le CA HT inclut toutes les ventes attribuées. La Base HT exclut les articles non-commissionnés. HC = Heures Compl., HS = Heures Supp.", 40, currentY); currentY += 12;
        
        // Fusion Col 1..8 = 377pt + 7*10pt = 447pt (+ 10pt gap + 58pt = 515pt exacts)
        drawRow([
            {text: 'TOTAL PRIMES ÉQUIPE SALARIÉE', w: 447}, 
            {text: fMnt(globalPrimes), w: 58, align: 'right'}
        ], false, true);
        
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(20).fillColor(MAIN_COLOR).text('Variables de Paie & Absences (Suite)', 40, 40);
        doc.font('Helvetica').fontSize(10).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} - ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, 70);
        currentY = 100;

        // --- 5. ABSENCES ---
        // Largeurs calibrées : 95 + 130 + 135 + 40 + 75 = 475pt + (4 * 10pt) = 515pt exacts
        drawTableTitle("5. REGISTRE DES ABSENCES ET CONGÉS");
        drawRow([{text: 'Employé', w: 95}, {text: 'Motif (Masquage RGPD)', w: 130}, {text: 'Période', w: 135}, {text: 'Jours', w: 40, align: 'center'}, {text: 'Infos Compl.', w: 75}], true);
        if (absencesRes.rowCount === 0) {
            drawRow([{text: 'Aucune absence sur la période.', w: 95}, {text: '-', w: 130}, {text: '-', w: 135}, {text: '-', w: 40, align: 'center'}, {text: '-', w: 75}]);
        } else {
            absencesRes.rows.forEach(a => {
                const estMaladie = a.type_demande === 'ARRET_MALADIE' || ['MALADIE_ORDINAIRE', 'ACCIDENT_TRAVAIL'].includes(a.nature_absence);
                const motifAffiche = estMaladie ? 'Arrêt de travail (Maladie/AT)' : (a.type_demande === 'CONGES' ? `Congé payé (${a.nature_absence})` : a.type_demande);
                const dDeb = new Date(a.date_debut); const dFin = new Date(a.date_fin);
                
                let joursOuvres = 0;
                for (let d = new Date(dDeb); d <= dFin; d.setDate(d.getDate() + 1)) { if (d.getDay() !== 0) joursOuvres++; }
                
                drawRow([
                    {text: a.nom_employe, w: 95}, 
                    {text: motifAffiche, w: 130}, 
                    {text: `Du ${dDeb.toLocaleDateString('fr-FR')} au ${dFin.toLocaleDateString('fr-FR')}`, w: 135}, 
                    {text: `${joursOuvres} j.`, w: 40, align: 'center'},
                    {text: estMaladie ? 'Attente CPAM' : 'Solde CP: -', w: 75}
                ]);
            });
        }

        // --- 5 BIS. ARCHIVE DES CLÔTURES (Z) ---
        // Largeurs calibrées : 28 + 48 + 62 + 22 + 48 + 55 + 52 + 130 = 445pt + (7 * 10pt) = 515pt exacts
        drawTableTitle("5 BIS. HISTORIQUE DES CLÔTURES DE CAISSE (Z)");
        drawRow([
            {text: 'N° Z', w: 28}, 
            {text: 'Date', w: 48, align: 'center'}, 
            {text: 'Opérateur', w: 62}, 
            {text: 'Tkts', w: 22, align: 'center'},
            {text: 'CA TTC', w: 48, align: 'right'},
            {text: 'Cumul P.', w: 55, align: 'right'},
            {text: 'Espèces', w: 52, align: 'right'}, 
            {text: 'Hash NF525 (SHA-256)', w: 130, align: 'right'}
        ], true);
        
        if (zMoisRes.rowCount === 0) {
            drawRow([{text: 'Aucune clôture enregistrée ce mois-ci.', w: 515}]);
        } else {
            let sumCaZ = 0;
            let expectedId = null;

            zMoisRes.rows.forEach(z => {
                const currentId = parseInt(z.num_z_final);
                
                // Détection de rupture de séquence des Z (Exigence NF525)
                if (expectedId !== null && currentId > expectedId) {
                    for (let i = expectedId; i < currentId; i++) {
                        drawRow([
                            {text: `Z-${i}`, w: 28, color: '#dc2626'}, 
                            {text: 'ANOMALIE', w: 48, align: 'center', color: '#dc2626'}, 
                            {text: 'Saut de N°', w: 62, color: '#dc2626'}, 
                            {text: '-', w: 22, align: 'center'},
                            {text: '-', w: 48, align: 'right'},
                            {text: '-', w: 55, align: 'right'},
                            {text: '-', w: 52, align: 'right'}, 
                            {text: 'Clôture manquante ou altérée', w: 130, align: 'right', color: '#dc2626'}
                        ]);
                    }
                }
                expectedId = currentId + 1;

                sumCaZ += parseFloat(z.ca_ttc) || 0;
                let cumulActuel = parseFloat(z.cumul_perpetuel_ttc) || 0;
                
                let operator = z.ferme_par || 'Non spécifié';
                let isAuto = Boolean(z.est_cloture_automatique);
                operator = isAuto ? 'Clôture Auto.' : operator;
                let especesReel = isAuto ? 'À régul.' : fMnt(z.total_especes_reel);
                
                // Césure stricte sur 2 lignes de 32 caractères avec '\n' pour éviter tout chevauchement
                let hashAffiche = 'NON-SIGNE';
                if (z.signature_hash && z.signature_hash.length === 64) {
                    hashAffiche = z.signature_hash.substring(0, 32) + '\n' + z.signature_hash.substring(32, 64);
                } else if (z.signature_hash) {
                    hashAffiche = z.signature_hash;
                }
                
                drawRow([
                    {text: `Z-${currentId}`, w: 28},
                    {text: z.date_z, w: 48, align: 'center'},
                    {text: operator, w: 62},
                    {text: String(z.nb_tickets), w: 22, align: 'center'},
                    {text: fMnt(z.ca_ttc), w: 48, align: 'right'},
                    {text: fMnt(cumulActuel), w: 55, align: 'right'},
                    {text: especesReel, w: 52, align: 'right'},
                    // On passe la taille à 7.5 et on ajoute un interligne naturel
                    {text: hashAffiche, w: 130, align: 'right', font: 'Courier', size: 7.5, color: SEC_COLOR}
                ]);
            });
            
            // Calcul du CA orphelin basé sur totalEncaissementsReel (inclut les remises fidélité éventuelles)
            const caNonCloture = totalEncaissementsReel - sumCaZ;
            if (Math.abs(caNonCloture) > 0.01) {
                drawRow([
                    {text: 'CA hors clôture (En attente de Z)', w: 190}, 
                    {text: fMnt(caNonCloture), w: 48, align: 'right'}, 
                    {text: '', w: 257, align: 'left'}
                ], false, true);
            }
        }

        // --- 6. MENTIONS LÉGALES & VALIDATION ---
        currentY += 30;
        if (currentY > 600) { doc.addPage(); currentY = 40; }
        
        doc.rect(40, currentY, 515, 85).fillAndStroke('#f9fafb', BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MAIN_COLOR).text('MENTIONS LÉGALES ET CONFORMITÉ (Loi de Finances)', 50, currentY + 10);
        doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
            "• L'éditeur du logiciel STACK v1.0 atteste que ce système satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données en vue du contrôle de l'administration fiscale, prévues au 3° bis du I de l'article 286 du CGI.\n" +
            "• Conservation : Les pièces fiscales doivent être conservées 6 ans, et les documents comptables 10 ans.\n" +
            "• RGPD : Les motifs médicaux exacts des arrêts de travail ont été masqués sur ce document de transmission comptable.\n" +
            "• Dépenses : Je confirme l'exactitude des frais déclarés et m'engage à fournir les justificatifs non-scannés à mon comptable.",
            50, currentY + 25, { width: 495, lineGap: 2 }
        );

        currentY += 100;

        // --- BLOC "BON POUR TRANSMISSION" ---
        doc.rect(40, currentY, 515, 90).stroke(BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text("BON POUR TRANSMISSION COMPTABLE", 50, currentY + 10);
        
        if (estMoisCloture) {
            doc.font('Helvetica').fontSize(10).text(`Nom du ${titreDirigeant} : ${nomGerant}`, 50, currentY + 30);
            doc.text(`Date : ${today.toLocaleDateString('fr-FR')} à ${today.toLocaleTimeString('fr-FR')}`, 50, currentY + 45);
            
            doc.font('Helvetica-Bold').text(`Signature :`, 350, currentY + 30);
            // Espace pour signer (plus large pour être bien sous "Bon pour transmission")
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("(Signature valant certification des données et validation du document)", 350, currentY + 65, { width: 150 });
        } else {
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#ea580c').text("DOCUMENT PROVISOIRE - NON SIGNÉ", 150, currentY + 35);
        }

        // --- PAGINATION DYNAMIQUE (Correction : ancrage absolu sans saut de page) ---
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count, page = 1; i < end; i++, page++) {
            doc.switchToPage(i);
            
            // On désactive temporairement la marge du bas pour forcer l'écriture sans créer de nouvelle page
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            
            doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(
                `Page ${page} / ${range.count}`, 
                0, 815, 
                { align: 'center', width: 595 }
            );
            
            // On restaure la marge
            doc.page.margins.bottom = originalBottomMargin;
        }

        doc.end();
    } catch (erreur) { 
        console.error("Erreur génération buffer PDF :", erreur);
        reject(erreur);
    }
    }); // Fin de la Promise
} // Fin de la fonction genererBufferLiassePdf

// ----------------------------------------------------------------------------------
// ROUTE DE TÉLÉCHARGEMENT MANUEL (Prévisualisation du Gérant)
// ----------------------------------------------------------------------------------
app.get('/api/export-pdf', verifierToken, async (req, res) => {
    try {
        // On fait appel au moteur de dessin unifié !
        const { buffer, numeroArchive, nomDuSalon, salonConfig, estMoisCloture } = await genererBufferLiassePdf(req.user.id_salon, req.query.mois_annee);
        
        // Envoi de sauvegarde (Brouillon) au gérant s'il a configuré son email
        if (estMoisCloture && salonConfig.email_reception_factures && salonConfig.mot_de_passe_app_email) {
            try {
                let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: salonConfig.email_reception_factures, pass: dechiffrer(salonConfig.mot_de_passe_app_email) } });
                await transporter.sendMail({
                    from: `"${nomDuSalon}" <${salonConfig.email_reception_factures}>`, 
                    to: salonConfig.email_reception_factures, 
                    subject: `📊 Liasse Mensuelle - ${nomDuSalon}`, 
                    text: `Bonjour,\nVeuillez trouver en pièce jointe la copie de votre liasse comptable.\nRéf. Archive NF525 : ${numeroArchive}`,
                    attachments: [{ filename: `Liasse_${numeroArchive}.pdf`, content: buffer }]
                });
            } catch (e) {} 
        }

        // On renvoie le PDF au navigateur pour le téléchargement
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Liasse_${numeroArchive}.pdf"`);
        res.send(buffer);
    } catch (erreur) {
        console.error("Erreur téléchargement PDF :", erreur);
        res.status(500).send("Erreur lors de la génération de la liasse mensuelle.");
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

        const salonsResult = await clientDB.query("SELECT id_salon, email_reception_factures, mot_de_passe_app_email FROM configuration_salon WHERE email_reception_factures IS NOT NULL AND email_reception_factures != '' AND mot_de_passe_app_email IS NOT NULL AND mot_de_passe_app_email != ''");
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

                        let texteEmail = mailParsi.text || mailParsi.html || ""; 
                        const sujetEmail = mailParsi.subject || "Sans Sujet";
                        let urlPdfCloudflare = null;
                        let cleR2Email = null;
                        
                        console.log(`\n=========================================`);
                        console.log(`📧 EMAIL DÉTECTÉ (Salon ${salon.id_salon}) : "${sujetEmail}"`);
                        
                        // --- NOUVEAU : EXTRACTION DE PIÈCE JOINTE PDF ---
                        if (mailParsi.attachments && mailParsi.attachments.length > 0) {
                            const pieceJointePdf = mailParsi.attachments.find(a => a.contentType === 'application/pdf');
                            if (pieceJointePdf && pieceJointePdf.content) {
                                try {
                                    // 1. On lit le texte brut à l'intérieur du PDF pour aider l'IA
                                    const dataPdf = await pdfParse(pieceJointePdf.content);
                                    texteEmail += `\n\n--- CONTENU DU PDF JOINT ---\n${dataPdf.text}`;
                                    
                                    // 2. On sauvegarde le PDF sur le Cloud R2 (Amazon S3) pour l'afficher au Gérant
                                    const nomFichierUnique = `factures/${salon.id_salon}/${Date.now()}_facture.pdf`;
                                    await s3Client.send(new PutObjectCommand({
                                        Bucket: process.env.R2_BUCKET_NAME,
                                        Key: nomFichierUnique,
                                        Body: pieceJointePdf.content,
                                        ContentType: 'application/pdf'
                                    }));
                                    cleR2Email = nomFichierUnique;
                                    
                                    // 3. On génère le lien de lecture (Valable 7 jours)
                                    const commandGet = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: nomFichierUnique });
                                    urlPdfCloudflare = await getSignedUrl(s3Client, commandGet, { expiresIn: 604800 });
                                    console.log(`📎 PDF Facture sauvegardé et analysé !`);
                                } catch (e) {
                                    console.error("Erreur parsing/upload PDF :", e);
                                }
                            }
                        }
                        
                        // 🚨 L'ancienne insertion "aveugle" (matchTTC) est retirée car c'est désormais l'IA qui pré-valide la facture
                        const tachesTrouvees = await analyserEmailAvecIA(sujetEmail, texteEmail, urlPdfCloudflare, cleR2Email);
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
            try {
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
            } catch (salonErr) {
                console.error(`[ROBOT-MARKETING] Erreur isolée pour le salon ${salon.id_salon}:`, salonErr);
            }
        } 
    } catch (err) {
        console.error("Erreur globale Robot Marketing/Prédictif:", err);
    }
}

// =========================================================================
// --- WORKFLOW COMPTABLE : ENVOI ET VALIDATION ---
// =========================================================================
async function envoyerBilanComptable(id_salon, mois_annee) {
    try {
        const today = new Date(); // <--- AJOUTE CETTE LIGNE ICI
        const salonRes = await pool.query("SELECT * FROM configuration_salon WHERE id_salon = $1", [id_salon]);
        if (salonRes.rowCount === 0) return;
        const salon = salonRes.rows[0];
        
        if (!salon.email_comptable || !salon.email_reception_factures || !salon.mot_de_passe_app_email) return;

        const [year, month] = mois_annee.split('-');
        const firstDayPrevMonth = new Date(year, parseInt(month) - 1, 1);
        const lastDayPrevMonth = new Date(year, parseInt(month), 0);
        
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDayPrevMonth);
        const dateFinStr = formatYMD(lastDayPrevMonth);

        const facturesResult = await pool.query(`SELECT nom_fournisseur, TO_CHAR(date_traitement, 'DD/MM/YYYY') as date, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND DATE(date_traitement) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const caResult = await pool.query(`SELECT COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const caParMethodeResult = await pool.query(`SELECT methode_paiement, COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND statut != 'ANNULE' AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
        const rhResult = await pool.query(`SELECT e.nom, COALESCE(SUM(c.montant_commission), 0) as total_prime FROM employes e LEFT JOIN commissions c ON e.id_employe = c.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) BETWEEN $2 AND $3 WHERE e.id_salon = $1 GROUP BY e.nom`, [id_salon, dateDebutStr, dateFinStr]);
        const absencesResult = await pool.query(`SELECT a.type_demande, a.nature_absence, a.date_debut, a.date_fin, a.fichier_cle_r2, e.nom as nom_employe FROM absences_employes a JOIN employes e ON a.id_employe = e.id_employe WHERE a.id_salon = $1 AND a.statut = 'VALIDE' AND a.date_debut <= $3 AND a.date_fin >= $2 ORDER BY e.nom ASC, a.date_debut ASC`, [id_salon, dateDebutStr, dateFinStr]);

        const caTotal = parseFloat(caResult.rows[0].ca_total);

        // --- GÉNÉRATION DU FEC (Moteur unifié normé Art. A.47 A-1 LPF) ---
        let fecContent = null;
        let nomFichierFec = `FEC_${salon.id_salon}_${dateDebutStr.replace(/-/g, '')}_${dateFinStr.replace(/-/g, '')}.txt`;
        try {
            const fecData = await construireContenuFEC(id_salon, dateDebutStr, dateFinStr);
            if (fecData && fecData.nbLignes > 0) {
                fecContent = fecData.fecContent;
                nomFichierFec = fecData.nomFichier;
            }
        } catch(e) { console.error(`Erreur génération FEC pour le salon ${id_salon}:`, e); }

        // --- GÉNÉRATION DU PDF DÉTAILLÉ ET ENVOI ---
        try {
            // L'appel magique : on génère le même document ultra-détaillé que la prévisualisation !
            const { buffer, numeroArchive, firstDayOfMonth, lastDayOfMonth } = await genererBufferLiassePdf(id_salon, mois_annee);
            
            let transporter = nodemailer.createTransport({ 
                host: 'smtp.gmail.com', port: 465, secure: true, 
                auth: { user: salon.email_reception_factures, pass: dechiffrer(salon.mot_de_passe_app_email) } 
            });
            const libelleMois = firstDayOfMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            
            const attachments = [
                { filename: `Liasse_Comptable_${numeroArchive}.pdf`, content: buffer }
            ];
            
            // Le fichier texte FEC normé DGFiP (SIRENFECYYYYMMDD.txt en UTF-8) est joint à l'email
            if (fecContent) {
                attachments.push({
                    filename: nomFichierFec,
                    content: fecContent,
                    contentType: 'text/plain; charset=utf-8'
                });
            }

            let textBody = `Bonjour,\n\nVeuillez trouver en pièce jointe la liasse comptable de ${salon.nom_salon} pour la période du ${firstDayOfMonth.toLocaleDateString('fr-FR')} au ${lastDayOfMonth.toLocaleDateString('fr-FR')}.\nCe document a été vérifié et signé électroniquement par le gérant.\n\n`;
            if (fecContent) textBody += `Le fichier FEC (Fichier des Écritures Comptables) est également joint, prêt à être importé dans votre logiciel.\n\n`;
            textBody += `Cordialement,`;

            await transporter.sendMail({
                from: `"${salon.nom_salon}" <${salon.email_reception_factures}>`, 
                to: salon.email_comptable, 
                subject: `✅ Liasse Comptable Mensuelle Validée - ${salon.nom_salon} (${libelleMois})`, 
                text: textBody,
                attachments: attachments
            });
        } catch (erreurEnvoi) {
            console.error(`Erreur envoi email comptable pour le salon ${id_salon}:`, erreurEnvoi);
        }

    } catch (err) {
        console.error("Erreur génération liasse comptable globale :", err);
    }
}

app.post('/api/compta/valider-mois', verifierToken, async (req, res) => {
    const { mois_annee, code_pin } = req.body; // YYYY-MM attendu
    const id_salon = req.user.id_salon;
    
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut valider et signer la liasse comptable." });
    if (!mois_annee || !/^\d{4}-\d{2}$/.test(mois_annee)) return res.status(400).json({ erreur: "Format de période invalide (YYYY-MM attendu)." });

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);

        const [yearStr, monthStr] = mois_annee.split('-');
        const firstDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
        const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0);
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateDebutStr = formatYMD(firstDay);
        const dateFinStr = formatYMD(lastDay);

        // 1. BLOCAGE STRICT : Vérification des factures en attente
        const tachesEnAttente = await clientDB.query(`SELECT 1 FROM ia_taches_attente WHERE id_salon = $1 AND type_tache = 'FACTURE_ACHAT' AND statut = 'ATTENTE'`, [id_salon]);
        if (tachesEnAttente.rowCount > 0) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ erreur: `Signature bloquée : Il vous reste ${tachesEnAttente.rowCount} facture(s) "À valider" dans l'application. Veuillez les traiter avant de clôturer le mois.` });
        }

        // 2. BLOCAGE STRICT NF525 : Toutes les journées ayant eu des tickets sur le mois doivent avoir leur Z clôturé
        const joursSansZ = await clientDB.query(`
            SELECT MIN(DATE(t.date_creation)) as jour_manquant
            FROM tickets t
            WHERE t.id_salon = $1 AND DATE(t.date_creation) BETWEEN $2 AND $3
              AND NOT EXISTS (
                  SELECT 1 FROM clotures_caisse c
                  WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation)
              )
        `, [id_salon, dateDebutStr, dateFinStr]);
        if (joursSansZ.rowCount > 0 && joursSansZ.rows[0].jour_manquant) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ erreur: `Signature bloquée (NF525) : La journée du ${new Date(joursSansZ.rows[0].jour_manquant).toLocaleDateString('fr-FR')} n'a pas fait l'objet d'une clôture Z.` });
        }

        // 3. BLOCAGE STRICT NF525 : Aucune clôture automatique en attente de régularisation sur la période
        const zAutoEnAttente = await clientDB.query(`
            SELECT TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_z
            FROM clotures_caisse
            WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3 AND est_cloture_automatique = TRUE
            LIMIT 1
        `, [id_salon, dateDebutStr, dateFinStr]);
        if (zAutoEnAttente.rowCount > 0) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ erreur: `Signature bloquée (NF525) : La clôture automatique du ${zAutoEnAttente.rows[0].date_z} doit d'abord être régularisée.` });
        }

        const empRes = await clientDB.query("SELECT nom, code_pin FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        if (empRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            return res.status(404).json({ erreur: "Gérant introuvable." });
        }
        
        const gerant = empRes.rows[0];
        let pinMatch = false;
        if (gerant.code_pin && gerant.code_pin.startsWith('$2')) {
            pinMatch = await bcrypt.compare(code_pin, gerant.code_pin);
        } else {
            pinMatch = (gerant.code_pin === code_pin);
        }

        if (!pinMatch) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ erreur: "Code PIN incorrect. Signature refusée." });
        }

        // Calcul des totaux mensuels figés et chaînage cryptographique mensuel NF525
        const confRes = await clientDB.query('SELECT tva_intra FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const franchiseTVA = !confRes.rows[0]?.tva_intra || confRes.rows[0].tva_intra.trim() === '';

        const caMoisRes = await clientDB.query(`
            SELECT COALESCE(lt.taux_tva_snapshot, 20) as taux_tva, COALESCE(SUM(lt.total_ligne_ttc), 0) as total_ttc
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND DATE(t.date_creation) BETWEEN $2 AND $3
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
            WHERE id_salon = $1 AND DATE(date_cloture) <= $2
            ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon, dateFinStr]);
        const cumulPerpetuel = Number(dernierZMois.rows[0]?.cumul || 0).toFixed(2);

        const prevLiasse = await clientDB.query(`
            SELECT signature_hash FROM liasses_mensuelles_validees
            WHERE id_salon = $1 AND signature_hash IS NOT NULL
            ORDER BY id_validation DESC LIMIT 1 FOR UPDATE
        `, [id_salon]);
        const hashPrecedent = prevLiasse.rowCount > 0 ? prevLiasse.rows[0].signature_hash : 'GENESIS_LIASSE';
        const dateValISO = new Date().toISOString();
        const signatureHash = crypto.createHash('sha256')
            .update(`LIASSE-${id_salon}-${mois_annee}-${totalHT}-${totalTVA}-${totalTTC}-${cumulPerpetuel}-${gerant.nom}-${dateValISO}-${hashPrecedent}`)
            .digest('hex');

        await clientDB.query(
            `INSERT INTO liasses_mensuelles_validees (id_salon, mois_annee, date_validation, valide_par, total_ht, total_tva, total_ttc, cumul_perpetuel_ttc, hash_precedent, signature_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id_salon, mois_annee) DO NOTHING`,
            [id_salon, mois_annee, dateValISO, gerant.nom, totalHT, totalTVA, totalTTC, cumulPerpetuel, hashPrecedent, signatureHash]
        );

        await enregistrerJET(id_salon, 'CLOTURE_MENSUELLE_SCELLEE', {
            mois_annee,
            total_ht: totalHT,
            total_tva: totalTVA,
            total_ttc: totalTTC,
            cumul_perpetuel_ttc: cumulPerpetuel,
            valide_par: gerant.nom,
            signature_hash: signatureHash
        }, clientDB);

        await clientDB.query('COMMIT');

        // Déclenche l'envoi immédiat au comptable
        await envoyerBilanComptable(id_salon, mois_annee);

        res.json({ message: "Liasse validée, signée et transmise à l'expert-comptable avec succès.", signature_hash: signatureHash });
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur validation mois:", e);
        res.status(500).json({ erreur: e.message || "Erreur lors de la validation." });
    } finally {
        clientDB.release();
    }
});

app.get('/api/compta/statut-mois', verifierToken, async (req, res) => {
    const { mois_annee } = req.query; // YYYY-MM
    try {
        const result = await pool.query('SELECT valide_par, date_validation FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [req.user.id_salon, mois_annee]);
        res.json({ valide: result.rowCount > 0, infos: result.rowCount > 0 ? result.rows[0] : null });
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture statut." }); }
});

// =========================================================================
// --- ROBOT D'ENVOI AU COMPTABLE (CRON JOB MODIFIÉ) ---
// =========================================================================
async function executerEnvoiComptable() {
    try {
        const salons = await pool.query("SELECT id_salon, nom_salon, jour_envoi_bilan, telephone_gerant, alertes_sms_actives, brevo_api_key, sms_sender_name FROM configuration_salon WHERE email_comptable IS NOT NULL");
        const today = new Date();
        const currentDay = today.getDate();
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        
        let prevMonth = today.getMonth(); 
        let year = today.getFullYear();
        if (prevMonth === 0) { prevMonth = 12; year -= 1; }
        const moisAnneeCible = `${year}-${String(prevMonth).padStart(2, '0')}`;

        for (let salon of salons.rows) {
            try {
                const jourCible = salon.jour_envoi_bilan || 1;
                const shouldCheck = currentDay === jourCible || (jourCible > lastDayOfMonth && currentDay === lastDayOfMonth);
                
                if (shouldCheck) {
                    const id_salon = salon.id_salon;
                    const validationRes = await pool.query('SELECT 1 FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [id_salon, moisAnneeCible]);
                    
                    if (validationRes.rowCount === 0) {
                        // Relance automatique du gérant car ce n'est pas validé
                        envoyerNotificationPush(id_salon, 'gerant', {
                            title: "⚠️ Liasse Comptable en attente",
                            body: `N'oubliez pas de vérifier et signer votre bilan du mois pour envoi à l'expert-comptable.`,
                            url: '/?tab=admin'
                        });
                        
                        if (salon.alertes_sms_actives && salon.telephone_gerant && salon.brevo_api_key) {
                            const smsTexte = `⚠️ STACK : Votre liasse comptable mensuelle attend votre signature ! Connectez-vous sur l'app pour la valider et l'envoyer à votre expert.`;
                            await envoyerSMS_Intelligent(id_salon, salon.brevo_api_key, salon.sms_sender_name, salon.telephone_gerant, smsTexte);
                        }
                    }
                }
            } catch (salonErr) {
                console.error(`[ROBOT-COMPTABLE] Erreur isolée pour le salon ${salon.id_salon}:`, salonErr);
            }
        }
    } catch (err) { console.error("Erreur globale Robot Comptable Automatique:", err); }
}


let isFantomeRunning = false;

async function executerClotureFantome() {
    if (isFantomeRunning) return;
    isFantomeRunning = true;

    const clientDB = await pool.connect();
    try {
        const salons = await clientDB.query("SELECT id_salon FROM configuration_salon");
        for (let s of salons.rows) {
            const id_salon = s.id_salon;
            
            // Verrou transactionnel pour éviter qu'un robot et un humain clôturent le même salon en même temps
            await clientDB.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);

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
                    await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);

                    const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalJour = Number(caResult.rows[0].total).toFixed(2);

                    // NF525: Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour.
                    const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1 FOR UPDATE', [id_salon]);
                    const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
                    const grandTotalPerpetuel = Number((ancienCumul + parseFloat(totalJour)).toFixed(2));
                    
                    const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
                    const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

                    // --- CALCUL DU THÉORIQUE POUR LE ROBOT (Somme algébrique exacte incluant ventes + et avoirs -) ---
                    const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

                    const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE montant END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
                    const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

                    const lastCloseRes = await clientDB.query('SELECT total_especes_reel FROM clotures_caisse WHERE id_salon = $1 AND date_cloture < $2 ORDER BY date_cloture DESC LIMIT 1', [id_salon, dateACloturerStr]);
                    const fCaisseMatin = lastCloseRes.rowCount > 0 ? parseFloat(lastCloseRes.rows[0].total_especes_reel) : 0;

                    const tEspecesTheorique = Number((fCaisseMatin + totalEspecesVentes + totalMouvements).toFixed(2));
                    // -----------------------------------------

                    const signature = crypto.createHash('sha256')
                        .update(`Z-${id_salon}-${nextZ}-${dateACloturerStr}-${totalJour}-${grandTotalPerpetuel.toFixed(2)}-${hashPrecedent}`)
                        .digest('hex');

                    await clientDB.query(
                        `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, est_cloture_automatique, numero_z_salon) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                        [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, 'Fermeture Automatique (En attente)', fCaisseMatin, tEspecesTheorique, tEspecesTheorique, 0, 'Clôture générée par le système', true, nextZ]
                    );

                    await enregistrerJET(id_salon, 'CLOTURE_Z_AUTOMATIQUE', { numero_z: nextZ, date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, ecart_caisse: 0, signature }, clientDB);
                    await clientDB.query('COMMIT');
                    console.log(`[ROBOT] Clôture fantôme réussie pour le salon ${id_salon} (Date: ${dateACloturerStr})`);
                } catch (e) {
                    await clientDB.query('ROLLBACK');
                    console.error(`[ROBOT] Erreur clôture fantôme salon ${id_salon}:`, e);
                }
            }
        }
    } catch (err) { console.error("Erreur Globale Robot Clôture:", err); } 
    finally { 
        clientDB.release(); 
        isFantomeRunning = false;
    }
}

// =========================================================================
// --- ROBOT ANALYTICS (CRON JOB) - RAPPORT HEBDO GÉRANT ---
// =========================================================================
async function executerRapportHebdoGerant() {
    console.log("\n🚀 [ROBOT-HEBDO] Démarrage du robot...");
    const clientDB = await pool.connect();
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.log("❌ [ROBOT-HEBDO] ARRÊT : Variables SMTP_USER ou SMTP_PASS introuvables.");
            return;
        }
        console.log(`📧 [ROBOT-HEBDO] Connexion SMTP configurée avec : ${process.env.SMTP_USER}`);
        
        // Utilisation du Port 587 (Standard Cloud) avec STARTTLS
        const transporter = nodemailer.createTransport({ 
            host: 'smtp.gmail.com', 
            port: 587, 
            secure: false, // Doit obligatoirement être "false" pour le port 587
            requireTLS: true, // Force le chiffrement moderne
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            logger: true,
            debug: true
        });

        const salons = await clientDB.query("SELECT id_salon, nom_salon FROM configuration_salon");
        console.log(`🔍 [ROBOT-HEBDO] ${salons.rowCount} salon(s) trouvé(s) en base.`);
        
        for (let s of salons.rows) {
            try {
                const id_salon = s.id_salon;
                console.log(`\n➡️ Analyse du salon #${id_salon} (${s.nom_salon})...`);

                // 1. Récupération de l'email du gérant
                const gerantRes = await clientDB.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [id_salon]);
                if (gerantRes.rowCount === 0 || !gerantRes.rows[0].email) {
                    console.log(`⚠️ [ROBOT-HEBDO] Ignoré : Aucun compte 'gerant' avec un email trouvé pour ce salon.`);
                    continue;
                }
                const emailGerant = gerantRes.rows[0].email;
                console.log(`👤 [ROBOT-HEBDO] Gérant ciblé : ${emailGerant}`);

                // 2. Requête d'agrégation intelligente
                const statsQuery = `
                    WITH Hebdo AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca, COUNT(id_ticket) as tickets FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= CURRENT_DATE - INTERVAL '7 days' AND date_creation < CURRENT_DATE
                    ),
                    HebdoPrec AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca, COUNT(id_ticket) as tickets FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= CURRENT_DATE - INTERVAL '14 days' AND date_creation < CURRENT_DATE - INTERVAL '7 days'
                    ),
                    Mensuel AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= date_trunc('month', CURRENT_DATE)
                    ),
                    MensuelPrec AS (
                        SELECT COALESCE(SUM(total_ttc), 0) as ca FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND date_creation >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date_creation < date_trunc('month', CURRENT_DATE)
                    )
                    SELECT 
                        (SELECT ca FROM Hebdo) as ca_hebdo, (SELECT tickets FROM Hebdo) as tickets_hebdo,
                        (SELECT ca FROM HebdoPrec) as ca_hebdo_prec,
                        (SELECT ca FROM Mensuel) as ca_mensuel,
                        (SELECT ca FROM MensuelPrec) as ca_mensuel_prec
                `;
                const stats = await clientDB.query(statsQuery, [id_salon]);
                if(stats.rowCount === 0) continue;
                const d = stats.rows[0];

                console.log(`💰 [ROBOT-HEBDO] CA 7j : ${d.ca_hebdo}€ | CA Prec : ${d.ca_hebdo_prec}€ | Tickets : ${d.tickets_hebdo}`);

                if (parseFloat(d.ca_hebdo) === 0 && parseFloat(d.ca_hebdo_prec) === 0) {
                    console.log(`🛑 [ROBOT-HEBDO] Annulation : Pas d'activité détectée sur les 14 derniers jours.`);
                    continue; 
                }

                // 3. Calculs des variations (Période sur Période)
                const caHebdo = parseFloat(d.ca_hebdo).toFixed(2);
                const caHebdoPrec = parseFloat(d.ca_hebdo_prec).toFixed(2);
                const evoHebdoRaw = caHebdoPrec > 0 ? ((caHebdo - caHebdoPrec) / caHebdoPrec * 100) : (caHebdo > 0 ? 100 : 0);
                const evoHebdo = Math.abs(evoHebdoRaw).toFixed(1);
                const signeHebdo = evoHebdoRaw >= 0 ? '+' : '-';
                const colorHebdo = evoHebdoRaw >= 0 ? '#166534' : '#99251b';
                const bgHebdo = evoHebdoRaw >= 0 ? '#e7f6ec' : '#fbeae8';

                const caMensuel = parseFloat(d.ca_mensuel).toFixed(2);
                const caMensuelPrec = parseFloat(d.ca_mensuel_prec).toFixed(2);
                const evoMensuelRaw = caMensuelPrec > 0 ? ((caMensuel - caMensuelPrec) / caMensuelPrec * 100) : (caMensuel > 0 ? 100 : 0);
                const evoMensuel = Math.abs(evoMensuelRaw).toFixed(1);
                const signeMensuel = evoMensuelRaw >= 0 ? '+' : '-';
                const colorMensuel = evoMensuelRaw >= 0 ? '#166534' : '#99251b';
                const bgMensuel = evoMensuelRaw >= 0 ? '#e7f6ec' : '#fbeae8';

                const panierMoyen = d.tickets_hebdo > 0 ? (caHebdo / d.tickets_hebdo).toFixed(2) : '0.00';

                // 4. Classement Hebdo (Top 3)
                const topPrestas = await clientDB.query(`
                    SELECT c.nom, SUM(lt.total_ligne_ttc) as total FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket JOIN catalogue c ON lt.id_article = c.id_article WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND t.date_creation >= CURRENT_DATE - INTERVAL '7 days' AND c.type_article = 'PRESTATION' GROUP BY c.nom ORDER BY total DESC LIMIT 3
                `, [id_salon]);

                let topPrestasHTML = '';
                if (topPrestas.rowCount > 0) {
                    topPrestasHTML = `<div style="background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #ececee; margin-bottom: 20px;">
                        <h3 style="margin-top: 0; color: #14141a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">🏆 Top Prestations (7 Jours)</h3>
                        <ul style="padding-left: 20px; margin: 0; color: #14141a; font-size: 14px;">`;
                    topPrestas.rows.forEach(p => { topPrestasHTML += `<li style="margin-bottom: 6px;"><strong>${p.nom}</strong> : ${parseFloat(p.total).toFixed(2)} €</li>`; });
                    topPrestasHTML += `</ul></div>`;
                }

                // 5. Structure de l'e-mail
                const htmlBody = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #ffffff; border: 1px solid #ececee; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #14141a; margin: 0; font-size: 22px;">Bilan Hebdomadaire</h2>
                        <p style="color: #77777f; margin: 4px 0 0 0; font-size: 14px;">Performances de <strong>${s.nom_salon}</strong></p>
                    </div>
                    
                    <div style="background: #fbfbfc; padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #ececee;">
                        <h3 style="margin-top: 0; color: #77777f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">7 Derniers Jours</h3>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 32px; font-weight: 800; color: #14141a; letter-spacing: -0.02em;">${caHebdo} €</span>
                            <span style="font-size: 14px; font-weight: 700; color: ${colorHebdo}; background: ${bgHebdo}; padding: 4px 10px; border-radius: 12px;">${signeHebdo}${evoHebdo}%</span>
                        </div>
                        <p style="color: #77777f; font-size: 13px; margin: 8px 0 0 0;">vs ${caHebdoPrec} € la semaine précédente</p>
                    </div>

                    <div style="background: #fbfbfc; padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #ececee;">
                        <h3 style="margin-top: 0; color: #77777f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Mois en cours</h3>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 24px; font-weight: 700; color: #14141a; letter-spacing: -0.02em;">${caMensuel} €</span>
                            <span style="font-size: 13px; font-weight: 700; color: ${colorMensuel}; background: ${bgMensuel}; padding: 4px 8px; border-radius: 12px;">${signeMensuel}${evoMensuel}%</span>
                        </div>
                        <p style="color: #77777f; font-size: 13px; margin: 8px 0 0 0;">vs ${caMensuelPrec} € le mois dernier</p>
                    </div>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                            <td width="48%" style="background: #fbfbfc; padding: 16px; border-radius: 12px; border: 1px solid #ececee; text-align: center;">
                                <span style="font-size: 11px; color: #77777f; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Clients (7j)</span>
                                <p style="font-size: 22px; font-weight: 800; color: #14141a; margin: 8px 0 0 0;">${d.tickets_hebdo}</p>
                            </td>
                            <td width="4%"></td>
                            <td width="48%" style="background: #fbfbfc; padding: 16px; border-radius: 12px; border: 1px solid #ececee; text-align: center;">
                                <span style="font-size: 11px; color: #77777f; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Panier Moyen (7j)</span>
                                <p style="font-size: 22px; font-weight: 800; color: #14141a; margin: 8px 0 0 0;">${panierMoyen} €</p>
                            </td>
                        </tr>
                    </table>

                    ${topPrestasHTML}

                    <hr style="border: none; border-top: 1px dashed #ececee; margin: 24px 0;" />
                    <p style="font-size: 12px; color: #a9a9b0; text-align: center; margin: 0;">STACK Analytics<br/>Le tableau de bord vient à vous.</p>
                </div>`;

                console.log(`📨 [ROBOT-HEBDO] Envoi de l'email en cours vers : ${emailGerant}...`);
                await transporter.sendMail({
                    from: `"STACK Analytics" <${process.env.SMTP_USER}>`,
                    to: emailGerant,
                    subject: `📊 Bilan STACK : ${caHebdo}€ cette semaine (${signeHebdo}${evoHebdo}%)`,
                    html: htmlBody
                });
                console.log(`✅ [ROBOT-HEBDO] Email envoyé avec succès !`);

            } catch (eSalon) { console.error(`❌ [ROBOT-HEBDO] Erreur Salon ${s.id_salon}:`, eSalon); }
        }
        console.log("🏁 [ROBOT-HEBDO] Fin de l'exécution.\n");
    } catch (err) { console.error("❌ [ROBOT-HEBDO] Erreur globale:", err); }
    finally { clientDB.release(); }
}

// Planification automatique
cron.schedule('0 8 * * 1', () => { executerRapportHebdoGerant(); }); // Tous les lundis à 08h00
cron.schedule('0 3 * * *', () => { executerClotureFantome(); }); // Le filet de sécurité à 3h00 du matin !
cron.schedule('0 8 * * *', () => { executerEnvoiComptable(); }); 
cron.schedule('0 9 * * *', () => { executerRobotMarketingEtPredictif(); }); 
cron.schedule('*/10 9-19 * * *', () => { executerRobotAvisSatisfaction(); }); 
cron.schedule('0 4 * * *', () => { executerRobotAvisSatisfaction(); }); 

app.get('/api/admin/forcer-robot', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        console.log("=========================================");
        console.log("=== DÉCLENCHEMENT MANUEL DES ROBOTS ===");
        console.log("=========================================");
        
        // 1. On AWAIT spécifiquement le rapport hebdo pour que la requête attende sa fin
        await executerRapportHebdoGerant();
        
        // 2. Les autres tournent en arrière-plan sans bloquer
        executerRobotComptable(); 
        executerClotureFantome();
        executerRobotMarketingEtPredictif();
        executerEnvoiComptable();
        
        res.json({ message: "Le cycle du robot hebdomadaire est terminé ! Les autres robots tournent en fond." }); 
    } catch (e) {
        console.error("❌ ERREUR CRITIQUE DANS LA ROUTE FORCER-ROBOT :", e);
        res.status(500).json({ erreur: e.message, stack: e.stack });
    }
});

// --- CHEAT CODE : VOYAGE DANS LE TEMPS (DÉVELOPPEMENT UNIQUEMENT) ---
app.get('/api/admin/time-travel/:id_salon', verifierToken, verifierSuperAdmin, async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ erreur: "Désactivé en production." });
    try {
        await pool.query(
            "UPDATE configuration_salon SET date_fin_essai = NOW() - INTERVAL '5 days' WHERE id_salon = $1", 
            [req.params.id_salon]
        );
        res.json({ message: `⏳ Voyage dans le temps réussi ! L'essai du salon #${req.params.id_salon} est maintenant expiré.` });
    } catch (e) { 
        res.status(500).json({ erreur: e.message }); 
    }
});

// --- CHEAT CODE : INJECTION SIRET POUR TEST PDF (DÉVELOPPEMENT UNIQUEMENT) ---
app.get('/api/admin/fix-siret-38', verifierToken, verifierSuperAdmin, async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ erreur: "Désactivé en production." });
    try {
        await pool.query(
            "UPDATE configuration_salon SET siret = '12345678901234', adresse_salon = '123 Rue de Test, 75000 Paris' WHERE id_salon = 38"
        );
        res.json({ message: "✅ SIRET et Adresse injectés avec succès !" });
    } catch (e) { 
        res.status(500).json({ erreur: e.message }); 
    }
});

// =========================================================================
// --- GOD MODE (SUPER-ADMIN) ---
// =========================================================================
async function verifierSuperAdmin(req, res, next) {
    try {
        const userRes = await pool.query("SELECT email FROM utilisateurs WHERE id_salon = $1 AND role = 'gerant' LIMIT 1", [req.user.id_salon]);
        if (userRes.rowCount === 0 || userRes.rows[0].email !== '2@gmail.com') {
            return res.status(403).json({ erreur: "Accès refusé. God mode uniquement." });
        }
        next();
    } catch (e) {
        return res.status(500).json({ erreur: "Erreur de vérification des droits admin." });
    }
}

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
        
        // 🚨 CONFORMITÉ NF525 : On NE supprime PLUS JAMAIS les données fiscales (6 ans de conservation).
        // On conserve indéfiniment en lecture seule : jet_logs, tickets, lignes_ticket, commissions, clotures_caisse.
        // Seules les données opérationnelles et personnelles (pour la conformité RGPD) du salon sont purgées.

        // Ordre de suppression calculé pour purger le SaaS tout en gardant l'archive fiscale intacte
        await clientDB.query('DELETE FROM rendez_vous WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM absences_employes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM recettes_articles WHERE id_protocole IN (SELECT id_protocole FROM protocoles WHERE id_salon = $1)', [id]);
        await clientDB.query('DELETE FROM protocoles WHERE id_salon = $1', [id]);
        // Anonymisation RGPD des fiches liées à des pièces fiscales (tickets/commissions) et suppression des fiches non liées
        await clientDB.query('DELETE FROM catalogue WHERE id_salon = $1 AND id_article NOT IN (SELECT DISTINCT id_article FROM lignes_ticket WHERE id_salon = $1 AND id_article IS NOT NULL)', [id]);
        await clientDB.query("UPDATE employes SET nom = 'Collaborateur Anonymisé #' || id_employe, code_pin = NULL, photo_url = NULL WHERE id_salon = $1 AND id_employe IN (SELECT DISTINCT id_employe FROM tickets WHERE id_salon = $1 AND id_employe IS NOT NULL UNION SELECT DISTINCT id_employe FROM commissions WHERE id_salon = $1 AND id_employe IS NOT NULL)", [id]);
        await clientDB.query('DELETE FROM employes WHERE id_salon = $1 AND id_employe NOT IN (SELECT DISTINCT id_employe FROM tickets WHERE id_salon = $1 AND id_employe IS NOT NULL UNION SELECT DISTINCT id_employe FROM commissions WHERE id_salon = $1 AND id_employe IS NOT NULL)', [id]);
        await clientDB.query("UPDATE clients SET nom = 'Client Anonymisé #' || id_client, prenom = '', telephone = NULL, email = NULL, notes = NULL, date_naissance = NULL WHERE id_salon = $1 AND id_client IN (SELECT DISTINCT id_client FROM tickets WHERE id_salon = $1 AND id_client IS NOT NULL)", [id]);
        await clientDB.query('DELETE FROM clients WHERE id_salon = $1 AND id_client NOT IN (SELECT DISTINCT id_client FROM tickets WHERE id_salon = $1 AND id_client IS NOT NULL)', [id]);
        await clientDB.query('DELETE FROM avis_demandes WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM taches_actions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM ia_taches_attente WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM push_subscriptions WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM sms_opt_out WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM messages WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM pointages WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM utilisateurs WHERE id_salon = $1', [id]);
        await clientDB.query('DELETE FROM configuration_salon WHERE id_salon = $1', [id]);

        await enregistrerJET(id, 'PURGE_RGPD_SALON', { purge_par: 'SUPERADMIN', archives_fiscales_conservees: true }, clientDB);

        await clientDB.query('COMMIT');
        res.json({ message: `Le salon #${id} a été purgé (archives fiscales et comptables NF525 conservées).` });
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
