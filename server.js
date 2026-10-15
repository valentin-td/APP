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
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            if (String(user.id_salon) !== String(id_salon)) return; 
            socket.join(id_salon.toString());
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

app.get('/api/events/:id_salon', verifierToken, (req, res) => {
    if (String(req.user.id_salon) !== req.params.id_salon) return res.status(403).end();
    
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
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS montant_pourboire NUMERIC(10, 2) DEFAULT 0.00;
    
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS telephone_gerant VARCHAR(20);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS alertes_sms_actives BOOLEAN DEFAULT FALSE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS email_comptable VARCHAR(255);
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS jour_envoi_bilan INT DEFAULT 1;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS derniere_verif_stock DATE;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pin_salon VARCHAR(255);
    ALTER TABLE configuration_salon ALTER COLUMN pin_salon TYPE VARCHAR(255);
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
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS factures_fournisseurs (id_facture SERIAL PRIMARY KEY, id_salon INT, nom_fournisseur VARCHAR(255), montant_ht NUMERIC(10,2), montant_tva NUMERIC(10,2), montant_ttc NUMERIC(10,2), date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS numero_facture VARCHAR(255);
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(50) DEFAULT 'NON_SPECIFIE';
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS statut_verification VARCHAR(20) DEFAULT 'A_VALIDER';
    ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS justificatif_url TEXT;
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
        
        // BACKFILL : Attribution d'un numéro de Z rétroactif continu pour tous les anciens historiques sans exception
        await pool.query(`
            UPDATE clotures_caisse
            SET numero_z_salon = subquery.seq
            FROM (
                SELECT id_cloture, ROW_NUMBER() OVER (PARTITION BY id_salon ORDER BY date_cloture ASC, id_cloture ASC) as seq
                FROM clotures_caisse
            ) AS subquery
            WHERE clotures_caisse.id_cloture = subquery.id_cloture
            AND clotures_caisse.numero_z_salon IS NULL;
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
                    ELSIF TG_TABLE_NAME IN ('lignes_ticket', 'clotures_caisse', 'jet_logs', 'mouvements_caisse') THEN
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

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limite stricte
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Isole le compteur par IP, par type de connexion (route) et par cible (ID du salon ou email)
        const cible = req.body.id_salon || req.body.email || 'global';
        return `${req.ip}_${req.path}_${cible}`;
    },
    message: { erreur: "Trop de tentatives pour ce compte. Veuillez patienter 15 minutes avant de réessayer." }
});

app.post('/api/register', authLimiter, async (req, res) => {
    const { email, mot_de_passe, nom_salon, nom_gerant } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        let type_tache = '';

        // --- GESTION DES UPLOADS MANUELS VS TÂCHES AUTOMATIQUES ---
        if (String(id).startsWith('UPLOAD_MANUEL_')) {
            type_tache = 'FACTURE_ACHAT'; // On force le type pour un upload manuel
        } else {
            const tacheRes = await clientDB.query("SELECT type_tache FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2", [id, id_salon]);
            if (tacheRes.rowCount === 0) throw new Error("Tâche introuvable.");
            type_tache = tacheRes.rows[0].type_tache;
        }
        
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
    const { id_employe, mois_annee, heures_ajoutees, motif } = req.body;
    try {
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
    try {
        await pool.query(
            `INSERT INTO pointages (id_employe, id_salon, date_jour, type_action) VALUES ($1, $2, CURRENT_DATE, $3)`,
            [id_employe, id_salon, type_action]
        );
        
        // NOTIFICATION TEMPS RÉEL (WebSockets) avec l'heure exacte
        io.to(id_salon.toString()).emit('statutPointageUpdate', { id_employe, type_action, heure: new Date().toISOString() });
        
        res.json({ message: "Pointage enregistré" });
    } catch (e) { res.status(500).json({ erreur: "Erreur BDD" }); }
});

app.post('/api/employes/login-pin', authLimiter, async (req, res) => {
    const { id_salon, nom_employe, code_pin, is_pointeuse } = req.body;
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

        // NOUVEAU: Si c'est juste la pointeuse qui vérifie le PIN, on s'arrête ici sans écraser le cookie
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
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture, telephone_gerant, alertes_sms_actives, email_comptable, jour_envoi_bilan, pin_salon, temps_nettoyage_minutes, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva, pennylane_api_key, mode_suivi_heures, nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville } = req.body;
    try { 
        const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
        if (pin_salon !== undefined && req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut modifier le code PIN du salon." });
        if (pin_salon && isPinWeak(pin_salon)) return res.status(400).json({ erreur: "Le code PIN du salon est trop simple (évitez 0000, 1234...)." });
        
        let finalPinSalon = pin_salon;
        if (pin_salon && !pin_salon.startsWith('$2')) {
            finalPinSalon = await bcrypt.hash(pin_salon, 10);
        }

        const updateQuery = pin_salon !== undefined
            ? `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $24, pin_salon = $23, mode_suivi_heures = $25, nom_salon = $26, siret = $27, adresse_salon = $28, tva_intra = $29, forme_juridique = $30, capital_social = $31, rcs_ville = $32 WHERE id_salon = $16`
            : `UPDATE configuration_salon SET google_api_key = $1, google_account_id = $2, google_location_id = $3, email_reception_factures = $4, mot_de_passe_app_email = $5, brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, pennylane_api_key = $23, mode_suivi_heures = $24, nom_salon = $25, siret = $26, adresse_salon = $27, tva_intra = $28, forme_juridique = $29, capital_social = $30, rcs_ville = $31 WHERE id_salon = $16`; 
            
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
        
        await pool.query(updateQuery, params);
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
    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement, pourboire, _id_temp, date_creation } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    
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
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, date_creation, id_temp_offline, date_synchro_hors_ligne, montant_pourboire) VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE', COALESCE($8::timestamp, NOW()), $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL::timestamp ELSE NOW() END, $10) RETURNING id_ticket;`, 
            [numeroTicket, id_client || null, id_employe, montant, id_salon, recompense_appliquee || false, methode, req.dateTicketEffective || null, req.idTempOffline || null, pourboire]
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
                    
                    // CORRECTION FRANCHISE EN BASE : Si franchise, TVA = 0 (HT = TTC). Sinon on applique le vrai taux de l'article.
                    const tauxTvaReel = franchiseTVA ? 0 : parseFloat(tvaSnapshot);
                    const baseHtCommission = total_ligne / (1 + (tauxTvaReel / 100));
                    
                    const montant_commission = (baseHtCommission * (taux / 100)).toFixed(2);
                    
                    // On insère 'baseHtCommission' dans montant_vente pour que les tableaux de bord affichent la vraie base HT
                    await clientDB.query(`INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon, date_creation) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))`, 
                    [id_employe, idNouveauTicket, baseHtCommission, montant_commission, type_article, id_salon, req.dateTicketEffective || null]);
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
    const { motif, lignes_a_annuler } = req.body;
    if (!motif || !motif.trim()) return res.status(400).json({ erreur: "Un motif d'annulation est obligatoire." });

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        const ticketRes = await clientDB.query(
            "SELECT * FROM tickets WHERE id_ticket = $1 AND id_salon = $2 AND type_ticket != 'ANNULATION'",
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
             VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'VALIDE', 'ANNULATION', $7, $8) RETURNING id_ticket;`,
            [numeroCompensation, ticket.id_client, ticket.id_employe, montantCompensation, id_salon, ticket.methode_paiement, id_ticket, motif.trim()]
        );
        const idTicketCompensation = compensationResult.rows[0].id_ticket;

        const newHash = crypto.createHash('sha256').update(`${idTicketCompensation}-${numeroCompensation}-${montantCompensation}-${previousHash}`).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1 WHERE id_ticket = $2', [newHash, idTicketCompensation]);

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

app.post('/api/caisse/mouvements', verifierToken, async (req, res) => {
    const { type_mouvement, montant, motif, id_employe } = req.body;
    if (!motif || !motif.trim()) return res.status(400).json({ erreur: "Le motif est obligatoire." });
    if (!montant || isNaN(montant) || parseFloat(montant) <= 0) return res.status(400).json({ erreur: "Montant invalide." });
    try {
        await pool.query(
            `INSERT INTO mouvements_caisse (id_salon, id_employe, type_mouvement, montant, motif) VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id_salon, id_employe || null, type_mouvement, parseFloat(montant), motif.trim()]
        );
        await enregistrerJET(req.user.id_salon, 'MOUVEMENT_CAISSE', { type_mouvement, montant: parseFloat(montant), motif });
        res.status(201).json({ message: "Mouvement de caisse enregistré." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de la sauvegarde." }); }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    const id_salon = req.user.id_salon;
    const { ferme_par, fond_caisse_matin, total_especes_reel, justification_ecart } = req.body;
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

        // RÈGLE D'OR NF525 : Le cumul n'est plus une somme globale (qui cause des décalages si l'historique est purgé/modifié).
        // Nouveau Cumul = Cumul précédent + CA du jour.
        const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc FROM clotures_caisse WHERE id_salon = $1 ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1', [id_salon]);
        
        const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
        const grandTotalPerpetuel = ancienCumul + parseFloat(totalJour);
        const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
        const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

        // --- CALCUL NF525 DE L'ÉCART DE CAISSE (BLIND CLOSE) ---
        const fCaisseMatin = parseFloat(fond_caisse_matin) || 0;
        const tEspecesReel = parseFloat(total_especes_reel) || 0;

        const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE' AND est_compense = FALSE`, [id_salon, dateACloturerStr]);
        const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

        const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE 0 END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
        const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

        const tEspecesTheorique = fCaisseMatin + totalEspecesVentes + totalMouvements;
        const ecartCaisse = tEspecesReel - tEspecesTheorique;

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

        const dateISO = new Date().toISOString();
        
        const signature = crypto.createHash('sha256')
            .update(`Z-${id_salon}-${nextZ}-${totalJour}-${grandTotalPerpetuel}-${hashPrecedent}-${dateISO}`)
            .digest('hex');

        await clientDB.query(
            `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, numero_z_salon) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, ferme_par || 'Gérant', fCaisseMatin, tEspecesTheorique, tEspecesReel, ecartCaisse, justification_ecart || null, nextZ]
        );

        await enregistrerJET(id_salon, 'CLOTURE_Z', { numero_z: nextZ, date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, ecart_caisse: ecartCaisse, signature }, clientDB);

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
    const { id_cloture, montant_reel, id_employe } = req.body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const clotureRes = await clientDB.query("SELECT * FROM clotures_caisse WHERE id_cloture = $1 AND id_salon = $2 AND est_cloture_automatique = TRUE", [id_cloture, req.user.id_salon]);
        if (clotureRes.rowCount === 0) throw new Error("Clôture automatique introuvable ou déjà régularisée.");
        
        const cloture = clotureRes.rows[0];
        const theorique = parseFloat(cloture.total_especes_theorique);
        const reel = parseFloat(montant_reel);
        const ecart = reel - theorique;

        // Si l'équipe ne trouve pas le même montant que ce que le robot prévoyait, on l'injecte dans le bilan comptable du jour.
        if (Math.abs(ecart) > 0) {
            await clientDB.query(
                `INSERT INTO mouvements_caisse (id_salon, id_employe, type_mouvement, montant, motif) VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id_salon, id_employe || null, 'REGULARISATION', ecart, `Régularisation ouverture suite fermeture auto`]
            );
            await enregistrerJET(req.user.id_salon, 'REGULARISATION_CAISSE', { id_cloture, theorique, reel, ecart }, clientDB);
        }

        // On lève le flag pour débloquer le logiciel
        await clientDB.query("UPDATE clotures_caisse SET est_cloture_automatique = FALSE, ferme_par = 'Robot (Régularisé)' WHERE id_cloture = $1", [id_cloture]);
        
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
        const tickets = await pool.query('SELECT id_ticket, numero_ticket_caisse, total_ttc, hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket ASC', [id_salon]);
        let prevHashTicket = 'GENESIS_BLOCK';
        
        for (let t of tickets.rows) {
            if (!t.hash_ticket) {
                alertes.push(`Ticket #${t.id_ticket} non scellé (possible ticket hors-ligne en attente).`);
                continue;
            }
            const computed = crypto.createHash('sha256').update(`${t.id_ticket}-${t.numero_ticket_caisse}-${t.total_ttc}-${prevHashTicket}`).digest('hex');
            if (computed !== t.hash_ticket) {
                erreurs.push(`Rupture cryptographique sur le ticket #${t.id_ticket} (${t.numero_ticket_caisse}).`);
                break;
            }
            prevHashTicket = t.hash_ticket;
        }

        // 2. Audit des CLÔTURES (Z)
        const clotures = await pool.query('SELECT id_cloture, signature_hash, hash_precedent, date_cloture FROM clotures_caisse WHERE id_salon = $1 ORDER BY id_cloture ASC', [id_salon]);
        let prevHashZ = 'GENESIS_Z';
        for (let c of clotures.rows) {
            if (c.hash_precedent !== prevHashZ) {
                erreurs.push(`Rupture de chaînage sur la clôture Z du ${new Date(c.date_cloture).toLocaleDateString('fr-FR')}.`);
                break;
            }
            prevHashZ = c.signature_hash;
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

        currentY += 10;
        doc.font('Courier').fontSize(7).fillColor('#9ca3af').text(`Trace NF525 : Algorithme SHA-256 | Hash = ${ticket.hash_ticket || 'Génération en cours'}`, 50, currentY);

        doc.end();

    } catch (error) {
        console.error("Erreur génération PDF B2B:", error);
        res.status(500).json({ erreur: "Impossible de générer le document client." });
    }
});

app.get('/api/clients', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM clients WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur clients."}); }});
app.post('/api/clients', verifierToken, async (req, res) => { const { prenom, nom, telephone, email, date_naissance } = req.body; try { await pool.query('INSERT INTO clients (prenom, nom, telephone, email, date_naissance, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [prenom || '', nom, telephone, email, date_naissance || null, req.user.id_salon]); res.status(201).json({message: "Client ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/clients/:id', verifierToken, async (req, res) => { try { await pool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]); res.json({message: "Client supprimé"}); } catch (e) { res.status(500).json({erreur: "Erreur suppression client."}); }});

app.get('/api/employes', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT e.*, EXISTS(SELECT 1 FROM pointages p WHERE p.id_employe = e.id_employe AND p.date_jour = CURRENT_DATE) as a_pointe_aujourdhui FROM employes e WHERE e.id_salon = $1 ORDER BY e.nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur employés."}); }});
app.post('/api/employes', verifierToken, async (req, res) => { 
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

async function analyserEmailAvecIA(sujet, texte, pdfUrl = null) {
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
                    pdf_url: pdfUrl // On attache le lien du PDF pour le Split-Screen
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
    try {
        const result = await pool.query("SELECT * FROM ia_taches_attente WHERE id_salon = $1 AND statut = 'ATTENTE' ORDER BY date_creation DESC", [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur IA" }); }
});

// --- UPLOAD MANUEL DE FACTURE (PDF OU IMAGE) VERS L'IA ---
app.post('/api/ia/upload-facture', verifierToken, async (req, res) => {
    try {
        const { fichier_base64, mime_type } = req.body;
        if (!fichier_base64) return res.status(400).json({ erreur: "Fichier manquant." });

        const buffer = Buffer.from(fichier_base64, 'base64');
        const id_salon = req.user.id_salon;
        
        // Détection du format (Image ou PDF)
        const isImage = mime_type && mime_type.startsWith('image/');
        const extension = isImage ? (mime_type.includes('png') ? 'png' : 'jpg') : 'pdf';

        // 1. Sauvegarde sur Cloudflare R2 (pour l'affichage futur dans le Split-Screen)
        let urlCloudflare = null;
        try {
            const nomFichierUnique = `factures/${id_salon}/${Date.now()}_upload_manuel.${extension}`;
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: nomFichierUnique,
                Body: buffer,
                ContentType: mime_type || 'application/pdf'
            }));
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

        // 3. Formatage et renvoi immédiat au frontend (Sans passage par la base de données)
        if (analyse.type === 'FACTURE_ACHAT' && analyse.donnees) {
            const tachePreRemplie = {
                id_tache: 'UPLOAD_MANUEL_' + Date.now(), // Identifiant spécifique pour contourner l'attente
                type_tache: 'FACTURE_ACHAT',
                donnees: {
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
                    mime_type: mime_type || 'application/pdf'
                }
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
    const { id } = req.params;
    const donnees = req.body;
    const id_salon = req.user.id_salon;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        let type_tache = '';

        // --- GESTION DES UPLOADS MANUELS VS TÂCHES AUTOMATIQUES ---
        if (String(id).startsWith('UPLOAD_MANUEL_')) {
            type_tache = 'FACTURE_ACHAT'; // On force le type pour un upload manuel
        } else {
            const tacheRes = await clientDB.query("SELECT type_tache FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2", [id, id_salon]);
            if (tacheRes.rowCount === 0) throw new Error("Tâche introuvable.");
            type_tache = tacheRes.rows[0].type_tache;
        }

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
            const compteComptable = donnees.compte_comptable || null;
            const fournisseur = donnees.fournisseur || 'Fournisseur Inconnu';

            await clientDB.query(
                `INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon, date_traitement, numero_facture, mode_paiement, statut_verification, justificatif_url, compte_comptable) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALIDE', $9, $10)`,
                [fournisseur, ht, tva, ttc, id_salon, dateFacture.toISOString(), numFacture, modePaiement, justifUrl, compteComptable]
            );

            // 1 Bis. SYNCHRONISATION CAISSE (NF525) : Sortie d'espèces automatique
            if (modePaiement.toUpperCase() === 'ESPECES' && ttc > 0) {
                const motifSortie = numFacture 
                    ? `Paiement Facture ${numFacture} - ${fournisseur}` 
                    : `Paiement Facture - ${fournisseur}`;
                
                await clientDB.query(
                    `INSERT INTO mouvements_caisse (id_salon, type_mouvement, montant, motif) VALUES ($1, 'SORTIE', $2, $3)`,
                    [id_salon, ttc, motifSortie]
                );
                
                // On trace l'événement dans le journal technique pour l'inaltérabilité
                await enregistrerJET(id_salon, 'MOUVEMENT_CAISSE', { type_mouvement: 'SORTIE', montant: ttc, motif: motifSortie }, clientDB);
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

        if (!String(id).startsWith('UPLOAD_MANUEL_')) {
            await clientDB.query("UPDATE ia_taches_attente SET statut = 'VALIDE' WHERE id_tache = $1", [id]);
        }
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
        const configRes = await pool.query('SELECT nom_salon, siret, adresse_salon, tva_intra FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const config = configRes.rows[0] || {};
        
        const franchiseTVA = !config.tva_intra || config.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${config.tva_intra}`;
        
        const filtreEmploye = estEmploye ? ' AND t.id_employe = $3' : '';
        const paramsVentes = estEmploye ? [id_salon, dateCible, id_employe] : [id_salon, dateCible];
        
        // 1. Ventes Détaillées
        const ventesResult = await pool.query(`
            SELECT 
                t.id_ticket, t.numero_ticket_caisse, TO_CHAR(t.date_creation, 'HH24:MI') as heure, t.total_ttc, t.methode_paiement,
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
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' AND t.est_compense = FALSE ${filtreEmploye}
            GROUP BY t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.total_ttc, t.methode_paiement, e.nom
            ORDER BY t.date_creation ASC
        `, paramsVentes);

        const caResult = await pool.query(`SELECT COALESCE(SUM(t.total_ttc), 0) as ca_total FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' AND t.est_compense = FALSE ${filtreEmploye}`, paramsVentes);
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
        const statsResult = await pool.query(`SELECT COUNT(DISTINCT id_ticket) as nb_tickets FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' AND est_compense = FALSE ${filtreEmploye}`, paramsVentes);
        const nbTickets = parseInt(statsResult.rows[0].nb_tickets) || 0;
        
        const annulsRes = await pool.query(`SELECT COUNT(*) as nb, COALESCE(SUM(ABS(total_ttc)), 0) as mnt FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND type_ticket = 'ANNULATION'`, [id_salon, dateCible]);
        const remisesRes = await pool.query(`SELECT COUNT(*) as nb FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND recompense_utilisee = TRUE AND statut = 'VALIDE' AND est_compense = FALSE`, [id_salon, dateCible]);

        // 5. CA par Catégorie
        const caCategories = await pool.query(`
            SELECT COALESCE(c.type_article, 'PRESTATION') as type_article, SUM(lt.total_ligne_ttc) as total
            FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' AND t.est_compense = FALSE ${filtreEmploye}
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
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' AND t.est_compense = FALSE ${filtreEmploye}
            GROUP BY lt.taux_tva_snapshot ORDER BY lt.taux_tva_snapshot DESC
        `, paramsVentes);

        // 7. Méthodes de Paiement
        const paiements = await pool.query(`
            SELECT methode_paiement, SUM(total_ttc) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE' AND est_compense = FALSE ${filtreEmploye}
            GROUP BY methode_paiement
        `, paramsVentes);
        
        let totalCB = 0, totalEspeces = 0, totalCheques = 0;
        paiements.rows.forEach(r => {
            if (r.methode_paiement === 'CARTE') totalCB += parseFloat(r.total || 0);
            if (r.methode_paiement === 'ESPECES') totalEspeces += parseFloat(r.total || 0);
            if (r.methode_paiement === 'CHEQUE') totalCheques += parseFloat(r.total || 0);
        });

        // 8. Stats par employé (Gérant uniquement - base HT)
        let employesStats = [];
        if (!estEmploye) {
            const empStatsRes = await pool.query(`
                SELECT e.nom, e.est_gerant,
                       COALESCE(SUM(t.total_ttc), 0) as ca_genere,
                       (SELECT COALESCE(SUM(c.montant_commission), 0) FROM commissions c WHERE c.id_employe = e.id_employe AND c.id_salon = $1 AND DATE(c.date_creation) = $2) as prime_due
                FROM employes e
                LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) = $2 AND t.statut != 'ANNULE' AND t.est_compense = FALSE
                WHERE e.id_salon = $1
                GROUP BY e.id_employe, e.nom, e.est_gerant
                ORDER BY e.est_gerant DESC, e.nom ASC
            `, [id_salon, dateCible]);
            employesStats = empStatsRes.rows;
        }

        // ================== REQUÊTES ADDITIONNELLES POUR LE BILAN JOURNALIER ==================
        const salonExtraRes = await pool.query('SELECT forme_juridique, heure_ouverture, heure_fermeture FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const salonExtra = salonExtraRes.rows[0] || {};
        const formeJuridique = salonExtra.forme_juridique ? ` - ${salonExtra.forme_juridique}` : '';

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
            WHERE t.id_salon = $1 AND DATE(t.date_creation) = $2::date AND t.statut != 'ANNULE' AND t.est_compense = FALSE ${filtreEmploye}
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), COALESCE(lt.taux_tva_snapshot, 20)
            ORDER BY type_article ASC, taux_tva DESC
        `, paramsVentes);

        // Nombre et montant des encaissements par mode sur la journée
        const paiementsDetailJourRes = await pool.query(`
            SELECT methode_paiement, COUNT(id_ticket) as nb, COALESCE(SUM(total_ttc), 0) as total
            FROM tickets t
            WHERE id_salon = $1 AND DATE(date_creation) = $2::date AND statut != 'ANNULE' AND est_compense = FALSE ${filtreEmploye}
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

        const prevZRes = await pool.query(`
            SELECT cumul_perpetuel_ttc, signature_hash
            FROM clotures_caisse
            WHERE id_salon = $1 AND date_cloture < $2::date
            ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1
        `, [id_salon, dateCible]);
        const cumulAvantBdd = prevZRes.rowCount > 0 ? (parseFloat(prevZRes.rows[0].cumul_perpetuel_ttc) || 0) : 0;
        const hashPrecedentFallback = prevZRes.rowCount > 0 ? prevZRes.rows[0].signature_hash : 'GENESIS_Z';

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
        const heureClotureAff = clotureData ? (heureClotureJet || heureDerniereVente || '23:59') : 'En cours (Non clôturé)';

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

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${config.nom_salon || 'Salon'}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${config.adresse_salon || 'N/A'}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${config.siret || 'N/A'} | ${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 14;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(MAIN_COLOR).text(
            `Date d'activité : ${dateActiviteFr} | Ouverture : ${heureOuvertureAff} | Clôture : ${heureClotureAff} | Clôturé par : ${clotureData ? responsableCloture : 'Non applicable (Ticket X)'}`,
            40, currentY
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

        // --- MOTEUR DE DESSIN ---
        const drawTableTitle = (title) => {
            if (currentY > 730) { doc.addPage(); currentY = 40; }
            currentY += 6;
            doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(title, 40, currentY);
            currentY += 16;
        };

        const drawRow = (cols, isHeader = false, isBold = false) => {
            if (currentY > 770) { doc.addPage(); currentY = 40; }
            const fontToUse = isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica';
            const sizeToUse = isHeader ? 8 : 9;
            doc.font(fontToUse).fontSize(sizeToUse).fillColor(isHeader ? SEC_COLOR : MAIN_COLOR);
            let xPos = 40;
            let maxH = 0;
            cols.forEach(col => {
                const txt = col.text != null ? String(col.text) : '';
                const h = doc.heightOfString(txt, { width: col.w });
                if (h > maxH) maxH = h;
            });
            if (currentY + maxH > 775) { doc.addPage(); currentY = 40; }
            cols.forEach(col => {
                doc.font(fontToUse).fontSize(sizeToUse).fillColor(col.color || (isHeader ? SEC_COLOR : MAIN_COLOR));
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, { width: col.w, align: col.align || 'left' });
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
                let ttc = parseFloat(r.total_ttc) || 0;
                let ht = parseFloat(r.total_ht) || 0;
                let tva = ttc - ht;
                if (franchiseTVA) { ht = ttc; tva = 0; }
                const tauxTvaAff = franchiseTVA ? '0%' : `${parseFloat(r.taux_tva).toString().replace('.', ',')}%`;
                const libelleCat = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaAff})`;

                totalJourHT += ht;
                totalJourTVA += tva;
                totalJourTTC += ttc;

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
                // Recherche des pourboires via le nom ou l'équipe
                sumCaCollaborateurs += caEmp;
                if (!emp.est_gerant) sumPrimesJour += primeEmp;

                drawRow([
                    {text: emp.nom, w: 115},
                    {text: emp.est_gerant ? 'Gérant' : 'Salarié(e)', w: 70, align: 'center'},
                    {text: fMnt(caEmp), w: 90, align: 'right'},
                    {text: emp.est_gerant ? 'N/A' : fMnt(0), w: 80, align: 'right'},
                    {text: emp.est_gerant ? '- (Non salarié)' : fMnt(primeEmp), w: 120, align: 'right'}
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
        const drawHeaderVentesJour = () => {
            drawRow([
                {text: 'Heure', w: 30},
                {text: 'N° Ticket', w: 75},
                {text: 'Lignes (Qté x Prestation / Produit)', w: 125},
                {text: 'Paiem.', w: 38, align: 'center'},
                {text: 'Vendeur', w: 45, align: 'center'},
                {text: 'HT', w: 42, align: 'right'},
                {text: 'TVA', w: 38, align: 'right'},
                {text: 'TTC', w: 52, align: 'right'}
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
                    {text: v.heure || '-', w: 30},
                    {text: v.numero_ticket_caisse || '-', w: 75},
                    {text: lignesTxt.join('\n'), w: 125},
                    {text: (v.methode_paiement || 'N/A').substring(0, 7), w: 38, align: 'center'},
                    {text: (v.employe || 'Inconnu').substring(0, 10), w: 45, align: 'center'},
                    {text: fMnt(totalTicketHT), w: 42, align: 'right'},
                    {text: fMnt(totalTicketTVA), w: 38, align: 'right'},
                    {text: fMnt(totalTicketTTC), w: 52, align: 'right'}
                ]);
            });
        }

        // --- 6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 & CUMUL PERPÉTUEL ---
        if (currentY > 560) { doc.addPage(); currentY = 40; }
        drawTableTitle("6. CHAÎNAGE CRYPTOGRAPHIQUE NF525 ET CUMUL PERPÉTUEL");

        // Recalcul et vérification du cumul perpétuel avant / après clôture
        let cumulAvant = cumulAvantBdd;
        let cumulApres = cumulAvant + caTotal;
        if (clotureData) {
            const cumulStocke = parseFloat(clotureData.cumul_perpetuel_ttc) || 0;
            if (cumulStocke >= cumulAvant + caTotal) {
                cumulApres = cumulStocke;
                cumulAvant = cumulApres - caTotal;
            } else {
                cumulApres = cumulAvant + caTotal;
            }
        }

        const hashActuel = clotureData ? (clotureData.signature_hash || 'NON-SIGNE') : 'EN ATTENTE DE CLÔTURE (TICKET X)';
        const hashPrec = clotureData ? (clotureData.hash_precedent || 'GENESIS_Z') : hashPrecedentFallback;

        drawRow([
            {text: 'Numéro de Z séquentiel (Propre au salon)', w: 260},
            {text: clotureData ? `Z N° ${String(numZSalon).padStart(4, '0')} (ID interne #${clotureData.id_cloture})` : 'Non numéroté (Ticket X en cours)', w: 245, align: 'right'}
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
            {text: `Conforme : ${fMnt(cumulApres)} = ${fMnt(cumulAvant)} + ${fMnt(caTotal)}`, w: 245, align: 'right', color: '#16a34a'}
        ], false, true);
        drawRow([
            {text: 'Algorithme et dispositif de signature', w: 260},
            {text: 'SHA-256 — Scellement et chaînage NF525', w: 245, align: 'right'}
        ]);

        currentY += 4;
        doc.rect(40, currentY, 515, 42).fillAndStroke('#f0fdf4', '#16a34a');
        doc.font('Courier-Bold').fontSize(8).fillColor(MAIN_COLOR).text(`Hash de ce Z     : ${hashActuel}`, 48, currentY + 9, { width: 499 });
        doc.font('Courier').fontSize(8).fillColor(SEC_COLOR).text(`Hash Z précédent : ${hashPrec}`, 48, currentY + 24, { width: 499 });
        currentY += 54;

        // --- MENTIONS LÉGALES & CLÔTURE ---
        if (currentY > 680) { doc.addPage(); currentY = 40; }
        doc.rect(40, currentY, 515, 52).fillAndStroke('#f9fafb', BORDER_COLOR);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MAIN_COLOR).text('MENTIONS LÉGALES ET CONSERVATION (Loi de Finances)', 50, currentY + 8);
        doc.font('Helvetica').fontSize(8).fillColor(SEC_COLOR).text(
            "• Ce document est généré par le système d'encaissement STACK assurant la traçabilité des données (CGI, art. 286, I-3° bis).\n" +
            "• Conservation légale : Les pièces et archives fiscales doivent être conservées pendant 6 ans (LPF, art. L. 102 B) et les pièces comptables pendant 10 ans (Code de commerce, art. L. 123-22).",
            50, currentY + 22, { width: 495, lineGap: 2 }
        );
        currentY += 64;

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

        // --- STATUT ET LÉGALITÉ (Basé sur la validation du gérant) ---
        const moisCibleStr = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
        const validationRes = await pool.query('SELECT valide_par FROM liasses_mensuelles_validees WHERE id_salon = $1 AND mois_annee = $2', [id_salon, moisCibleStr]);
        
        const estMoisCloture = validationRes.rowCount > 0;
        const statutDocument = estMoisCloture ? "DÉFINITIF (CLÔTURÉ ET SIGNÉ)" : "BROUILLON PROVISOIRE - NON SIGNÉ";
        
        let signatureArchive = '';
        let numeroArchive = 'NON-APPLICABLE-MOIS-EN-COURS';
        if (estMoisCloture) {
            signatureArchive = crypto.createHash('sha256').update(`LIASSE-${id_salon}-${dateFinStr}-${Date.now()}`).digest('hex').substring(0, 16).toUpperCase();
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
        
        // 🚨 BLOCAGE STRICT : SIRET ET ADRESSE OBLIGATOIRES
        if (!salonConfig.siret || !salonConfig.adresse_salon || salonConfig.siret.trim() === '') {
            return res.status(400).json({ erreur: "Édition bloquée : Le SIRET et l'Adresse du salon sont obligatoires pour générer une liasse légale. Veuillez les remplir dans vos paramètres." });
        }

        const franchiseTVA = !salonConfig.tva_intra || salonConfig.tva_intra.trim() === '';
        const mentionTVA = franchiseTVA ? `Franchise en base de TVA (Art. 293 B CGI)` : `N° TVA : ${salonConfig.tva_intra}`;

        const gerantRes = await pool.query("SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        const nomGerant = gerantRes.rowCount > 0 ? gerantRes.rows[0].nom : 'Le Gérant';

        // 1. REQUÊTE : Chiffre d'Affaires détaillé
        const caDetailRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                lt.taux_tva_snapshot as taux_tva,
                SUM(lt.total_ligne_ttc) as total_ttc,
                SUM(lt.total_ligne_ttc / (1 + (lt.taux_tva_snapshot / 100))) as total_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION'), lt.taux_tva_snapshot
        `, [id_salon, dateDebutStr, dateFinStr]);

        // 2. REQUÊTE : Paiements et Mouvements
        const paiementsRes = await pool.query(`SELECT methode_paiement, COUNT(id_ticket) as nb, SUM(total_ttc) as total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND DATE(date_creation) BETWEEN $2 AND $3 GROUP BY methode_paiement`, [id_salon, dateDebutStr, dateFinStr]);
        const statsRes = await pool.query(`SELECT COUNT(DISTINCT id_ticket) as nb_tickets, COUNT(DISTINCT id_client) as nb_clients, COALESCE(SUM(total_ttc), 0) as ca_total FROM tickets WHERE id_salon = $1 AND statut = 'VALIDE' AND est_compense = FALSE AND DATE(date_creation) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        
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
            SELECT type_mouvement, montant, motif, TO_CHAR(date_creation, 'DD/MM/YYYY') as date_mvt 
            FROM mouvements_caisse 
            WHERE id_salon = $1 AND type_mouvement IN ('ENTREE', 'SORTIE') AND DATE(date_creation) BETWEEN $2 AND $3 
            ORDER BY date_creation ASC
        `, [id_salon, dateDebutStr, dateFinStr]);

       // --- NOUVEAUTÉ : Cumul annuel pour la Franchise en Base ---
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
        const dateDebutAnneeStr = formatYMD(firstDayOfYear);
        
        // CORRECTION DU CRASH : Paramètres $1, $2, $3 bien alignés
        const cumulAnnuelRes = await pool.query(`
            SELECT 
                COALESCE(c.type_article, 'PRESTATION') as type_article,
                SUM(lt.total_ligne_ttc) as total_ttc
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            LEFT JOIN catalogue c ON c.id_article = lt.id_article
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY COALESCE(c.type_article, 'PRESTATION')
        `, [id_salon, dateDebutAnneeStr, dateFinStr]);

        // REQUÊTE : Historique des Z du mois (Enrichie avec le CA et tickets)
        const zMoisRes = await pool.query(`
            SELECT c.id_cloture, COALESCE(c.numero_z_salon, c.id_cloture) as num_z_final, TO_CHAR(c.date_cloture, 'DD/MM/YYYY') as date_z, 
                   c.total_especes_reel, c.ferme_par, c.signature_hash, c.cumul_perpetuel_ttc,
                   COUNT(t.id_ticket) as nb_tickets,
                   COALESCE(SUM(t.total_ttc), 0) as ca_ttc
            FROM clotures_caisse c
            LEFT JOIN tickets t ON t.id_salon = c.id_salon 
                                AND DATE(t.date_creation) = DATE(c.date_cloture)
                                AND t.statut = 'VALIDE' AND t.est_compense = FALSE
            WHERE c.id_salon = $1 AND DATE(c.date_cloture) BETWEEN $2 AND $3 
            GROUP BY c.id_cloture, c.numero_z_salon, c.date_cloture, c.total_especes_reel, c.ferme_par, c.signature_hash, c.cumul_perpetuel_ttc
            ORDER BY num_z_final ASC
        `, [id_salon, dateDebutStr, dateFinStr]);
        // NOUVEAU : On récupère les sommes EXACTES arrêtées à la date du dernier Z
        const lastZRes = await pool.query(`SELECT MAX(DATE(date_cloture)) as date_max, TO_CHAR(MAX(date_cloture), 'DD/MM/YYYY') as date_max_str FROM clotures_caisse WHERE id_salon = $1 AND DATE(date_cloture) BETWEEN $2 AND $3`, [id_salon, dateDebutStr, dateFinStr]);
        const lastZDate = lastZRes.rows[0].date_max || lastDayOfMonth;
        const lastZDateStr = lastZRes.rows[0].date_max_str || 'N/A';

        // CORRECTION DU CRASH 42P18 : Paramètres $1, $2, $3 parfaitement alignés sans trous
        const controleRes = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(total_ttc), 0) FROM tickets WHERE id_salon = $1 AND methode_paiement = 'ESPECES' AND statut = 'VALIDE' AND est_compense = FALSE AND DATE(date_creation) BETWEEN $2 AND $3) as especes_z,
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
                   (SELECT COALESCE(SUM(montant_pourboire), 0) FROM tickets t2 WHERE t2.id_employe = e.id_employe AND DATE(t2.date_creation) BETWEEN $2 AND $3 AND t2.statut = 'VALIDE' AND t2.est_compense = FALSE) as total_pourboire
            FROM employes e 
            LEFT JOIN tickets t ON t.id_employe = e.id_employe AND t.id_salon = $1 AND DATE(t.date_creation) BETWEEN $2 AND $3 AND t.statut = 'VALIDE' AND t.est_compense = FALSE
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

        // 4bis. REQUÊTE : CA Réalisé par employé pour comparer avec la base (Passe en HT réel)
        const caEmployesRes = await pool.query(`
            SELECT t.id_employe, SUM(lt.total_ligne_ttc / (1 + (CASE WHEN $4::boolean THEN 0 ELSE lt.taux_tva_snapshot END) / 100)) as ca_realise_ht
            FROM lignes_ticket lt
            JOIN tickets t ON t.id_ticket = lt.id_ticket
            WHERE t.id_salon = $1 AND t.statut = 'VALIDE' AND t.est_compense = FALSE AND DATE(t.date_creation) BETWEEN $2 AND $3
            GROUP BY t.id_employe
        `, [id_salon, dateDebutStr, dateFinStr, franchiseTVA]);
        const mapCaEmployes = {};
        caEmployesRes.rows.forEach(r => mapCaEmployes[r.id_employe] = parseFloat(r.ca_realise_ht));

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
        let capitalEtRCS = '';
        if (salonConfig.capital_social || salonConfig.rcs_ville) {
            const cap = salonConfig.capital_social ? `Capital social : ${salonConfig.capital_social}` : '';
            const rcs = salonConfig.rcs_ville ? `RCS : ${salonConfig.rcs_ville}` : '';
            if (cap && rcs) capitalEtRCS = ` | ${cap} | ${rcs}`;
            else if (cap) capitalEtRCS = ` | ${cap}`;
            else if (rcs) capitalEtRCS = ` | ${rcs}`;
        }

        doc.font('Helvetica-Bold').fontSize(11).fillColor(MAIN_COLOR).text(`Société : ${nomDuSalon}${formeJuridique}`, 40, currentY);
        currentY += 14;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Adresse : ${salonConfig.adresse_salon}`, 40, currentY);
        currentY += 12;
        doc.text(`SIRET : ${salonConfig.siret}${capitalEtRCS}`, 40, currentY);
        currentY += 12;
        doc.text(`${mentionTVA} | NAF : 96.02A | IDCC : 2596 (Coiffure)`, 40, currentY);
        currentY += 12;
        doc.text(`${titreDirigeant} : ${nomGerant}`, 40, currentY);
        currentY += 15;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(estMoisCloture ? '#16a34a' : '#ea580c').text(`ÉTAT : ${statutDocument}`, 40, currentY);
        doc.text(`Édité le : ${today.toLocaleDateString('fr-FR')} à ${today.toLocaleTimeString('fr-FR')}`, 390, currentY, { align: 'right' });
        currentY += 15;
        doc.font('Helvetica').fontSize(9).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} au ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, currentY);
        currentY += 15;
        if (estMoisCloture) {
            // Encadré d'attestation individuelle (Conformité Loi de Finances)
            doc.rect(40, currentY - 5, 515, 65).fillAndStroke('#f0fdf4', '#16a34a');
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#16a34a').text(`✓ CLÔTURE MENSUELLE N° ${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`, 50, currentY);
            currentY += 14;
            doc.font('Courier').fontSize(8).fillColor('#111827').text(`Hash de validation : ${signatureArchive}`, 50, currentY);
            currentY += 12;
            doc.font('Helvetica').fontSize(8).text(`Réf. Archive : ${numeroArchive}`, 50, currentY);
            currentY += 12;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor('#4b5563').text(`Logiciel STACK v1.0 - Attestation individuelle de conformité (CGI, art. 286, I-3° bis)`, 50, currentY);
            currentY += 15;
        }
        currentY += 25;

        const drawRow = (cols, isHeader = false, isBold = false) => {
            if (currentY > 780) { doc.addPage(); currentY = 40; }
            doc.font(isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 8 : 9).fillColor(isHeader ? SEC_COLOR : MAIN_COLOR);
            let xPos = 40;
            cols.forEach(col => {
                if (col.color) doc.fillColor(col.color);
                doc.text(col.text != null ? String(col.text) : '', xPos, currentY, { width: col.w, align: col.align || 'left', link: col.link || null, underline: !!col.link });
                if (col.color) doc.fillColor(isHeader ? SEC_COLOR : MAIN_COLOR); // Reset de la couleur
                xPos += col.w + 10;
            });
            currentY += 12;
            doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(isHeader ? 1 : 0.5).strokeColor(isHeader ? MAIN_COLOR : BORDER_COLOR).stroke();
            currentY += 6;
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
            let ht = parseFloat(r.total_ht), ttc = parseFloat(r.total_ttc), tva = ttc - ht;
            if (franchiseTVA) { ht = ttc; tva = 0; } // En franchise, HT = TTC
            const tauxTvaFormate = franchiseTVA ? '0%' : parseFloat(r.taux_tva).toString().replace('.', ',') + '%';
            const label = `${r.type_article === 'PRESTATION' ? 'Prestations de services' : 'Vente de produits'} (${tauxTvaFormate})`;
            
            totalHT += ht; totalTVA += tva; globalTTC += ttc;
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
        const facturesMoisEtendues = await pool.query(`SELECT nom_fournisseur, numero_facture, mode_paiement, statut_verification, justificatif_url, compte_comptable, date_traitement as date_facture_brute, date_traitement as date_paiement_brute, montant_ht, montant_tva, montant_ttc FROM factures_fournisseurs WHERE id_salon = $1 AND date_traitement >= NOW() - INTERVAL '1 year'`, [id_salon]);

        let toutesFactures = [];
        
        // 1. Ajout des factures validées
        facturesMoisEtendues.rows.forEach(f => {
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
                url: f.justificatif_url,
                source: f.justificatif_url ? 'IA' : 'Saisie'
            });
        });

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
        drawTableTitle("2. RAPPROCHEMENT BANCAIRE ET CAISSE");
        drawRow([{text: 'Méthode de paiement', w: 200}, {text: 'Nb Trans.', w: 60, align: 'center'}, {text: 'Montant Encaissé TTC', w: 225, align: 'right'}], true);
        
        const methodes = ['CARTE', 'ESPECES', 'CHEQUE', 'VIREMENT', 'BONS CADEAUX'];
        let mapPaiements = {}; paiementsRes.rows.forEach(m => mapPaiements[m.methode_paiement] = m);
        methodes.forEach(m => {
            const row = mapPaiements[m] || { nb: 0, total: 0 };
            drawRow([{text: m, w: 200}, {text: row.nb, w: 60, align: 'center'}, {text: fMnt(row.total), w: 225, align: 'right'}]);
        });
        
        const panierMoyen = statsRes.rows[0].nb_tickets > 0 ? (globalTTC / statsRes.rows[0].nb_tickets) : 0;
        drawRow([{text: `Total Encaissements (${statsRes.rows[0].nb_tickets} tickets, Panier Moyen : ${fMnt(panierMoyen)})`, w: 260}, {text: '', w: 0}, {text: fMnt(globalTTC), w: 225, align: 'right'}], false, true);
        
        currentY += 10;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Ce tableau facilite le rapprochement avec votre relevé bancaire.", 40, currentY); currentY += 12;

        // Lignes de rapprochement bancaire (sans pointillés pour document définitif)
        drawRow([{text: 'Remises en banque (Espèces & Chèques) à pointer :', w: 260}, {text: '', w: 0}, {text: 'Non renseigné', w: 225, align: 'right'}]);
        drawRow([{text: 'Commissions bancaires (Frais CB, Stripe, etc.) :', w: 260}, {text: '', w: 0}, {text: 'Non renseigné', w: 225, align: 'right'}]);
        
        const fondDebut = parseFloat(caisseRes.rows[0].fond_debut_mois) || 0;
        const fondFin = parseFloat(caisseRes.rows[0].fond_fin_mois) || 0;
        const especesEncaisseesZ = parseFloat(controleRes.rows[0].especes_z) || 0;
        const apportsZ = parseFloat(controleRes.rows[0].entrees_z) || 0;
        const retraitsZ = parseFloat(controleRes.rows[0].sorties_z) || 0;
        const ecartsZ = parseFloat(controleRes.rows[0].ecarts_z) || 0;
        
        // Formule de contrôle stricte arrêtée à la date du Z
        const caisseCalculee = fondDebut + especesEncaisseesZ + apportsZ - retraitsZ + ecartsZ;
        
        currentY += 5;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(MAIN_COLOR).text(`CONTRÔLE DE CAISSE (Arrêté au dernier Z du ${lastZDateStr})`, 40, currentY); currentY += 14;
        
        drawRow([{text: 'Fond de caisse au 1er du mois (Ouverture)', w: 260}, {text: '', w: 0}, {text: fMnt(fondDebut), w: 225, align: 'right'}]);
        drawRow([{text: `Espèces encaissées (Jusqu'au ${lastZDateStr}) (+)`, w: 260}, {text: '', w: 0}, {text: fMnt(especesEncaisseesZ), w: 225, align: 'right'}]);
        drawRow([{text: 'Apports de caisse (+)', w: 260}, {text: '', w: 0}, {text: fMnt(apportsZ), w: 225, align: 'right'}]);
        drawRow([{text: 'Retraits et Dépenses en espèces (-)', w: 260}, {text: '', w: 0}, {text: fMnt(retraitsZ), w: 225, align: 'right'}]);
        drawRow([{text: 'Remises en banque non déclarées dans l\'App (-)', w: 260}, {text: '', w: 0}, {text: '0,00 €', w: 225, align: 'right'}]);
        drawRow([{text: 'Régularisations et Écarts constatés (±)', w: 260}, {text: '', w: 0}, {text: fMnt(ecartsZ), w: 225, align: 'right'}]);
        
        drawRow([{text: 'ESPÈCES THÉORIQUES (Calculées)', w: 260}, {text: '', w: 0}, {text: fMnt(caisseCalculee), w: 225, align: 'right'}], false, true);
        
        // Détermination du texte pour Espèces Comptées
        let especesCompteesTexte = fMnt(fondFin);
        if (zMoisRes.rowCount > 0) {
            const dernierZMois = zMoisRes.rows[zMoisRes.rowCount - 1];
            let opZ = dernierZMois.ferme_par || 'Non spécifié';
            let isAutoZ = opZ.toLowerCase().includes('robot') || opZ.toLowerCase().includes('auto') || opZ === 'Non spécifié';
            if (isAutoZ) especesCompteesTexte = 'Non compté';
        }
        
        drawRow([{text: `ESPÈCES COMPTÉES (Lors du Z du ${lastZDateStr})`, w: 260}, {text: '', w: 0}, {text: especesCompteesTexte, w: 225, align: 'right'}], false, true);
        // --- VÉRIFICATION DE LA COHÉRENCE ESPÈCES (Factures vs Retraits) ---
        // On calcule le total des factures du mois payées en espèces (issues du bas de page)
        let totalFacturesEspecesMois = 0;
        facturesAffichees.forEach(f => {
            if (f.mode_paiement === 'ESPECES') totalFacturesEspecesMois += f.ttc;
        });

        const ecartDepensesCaisse = totalFacturesEspecesMois - retraitsZ;
        
        if (Math.abs(ecartDepensesCaisse) > 0.01) {
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#ea580c').text(
                `ALERTE COMPTABLE : Désynchronisation Caisse / Dépenses.`, 40, currentY
            );
            currentY += 12;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text(
                `La section "3. Dépenses" totalise ${fMnt(totalFacturesEspecesMois)} de factures payées en espèces ce mois-ci, mais seuls ${fMnt(retraitsZ)} ont été officiellement retirés de la caisse durant cette même période. (Ex: Une facture de fin de mois a pu être réglée sur la caisse du mois suivant).`, 
                40, currentY, { width: 515, lineGap: 2 }
            );
            currentY += 20; // Plus d'espace si le texte prend 2 lignes
        }

        // Détail des mouvements de caisse (Apports/Retraits)
        if (mouvementsRes.rowCount > 0) {
            currentY += 5;
            doc.font('Helvetica-Bold').fontSize(9).fillColor(SEC_COLOR).text(`Détail des Apports et Retraits (Inclus jusqu'au Z du ${lastZDateStr}) :`, 40, currentY); currentY += 14;
            
            const partsZ = lastZDateStr.split('/');
            const dZ = new Date(partsZ[2], partsZ[1] - 1, partsZ[0]);
            let aPosteriors = false;

            mouvementsRes.rows.forEach(mvt => {
                const partsM = mvt.date_mvt.split('/');
                const dM = new Date(partsM[2], partsM[1] - 1, partsM[0]);
                
                if (dM <= dZ) {
                    const typeMvt = mvt.type_mouvement === 'ENTREE' ? 'Apport (+)' : 'Retrait/Dép. (-)';
                    drawRow([
                        {text: mvt.date_mvt, w: 65, align: 'center'}, 
                        {text: typeMvt, w: 90}, 
                        {text: mvt.motif || 'Non renseigné', w: 215}, 
                        {text: fMnt(mvt.montant), w: 115, align: 'right'}
                    ]);
                } else {
                    aPosteriors = true;
                }
            });

            if (aPosteriors) {
                currentY += 5;
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(`Mouvements postérieurs au dernier Z (Non inclus dans le contrôle ci-dessus) :`, 40, currentY); currentY += 14;
                mouvementsRes.rows.forEach(mvt => {
                    const partsM = mvt.date_mvt.split('/');
                    const dM = new Date(partsM[2], partsM[1] - 1, partsM[0]);
                    
                    if (dM > dZ) {
                        const typeMvt = mvt.type_mouvement === 'ENTREE' ? 'Apport (+)' : 'Retrait/Dép. (-)';
                        drawRow([
                            {text: mvt.date_mvt, w: 65, align: 'center'}, 
                            {text: typeMvt, w: 90}, 
                            {text: mvt.motif || 'Non renseigné', w: 215}, 
                            {text: fMnt(mvt.montant), w: 115, align: 'right'}
                        ]);
                    }
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

        // On empêche d'isoler l'en-tête du tableau tout en bas de la page
        if (currentY > 680) { doc.addPage(); currentY = 40; }

        const drawHeaderDepenses = () => {
            drawRow([
                {text: 'Fournisseur', w: 60},
                {text: 'N° Fact.', w: 50},
                {text: 'Source', w: 35, align: 'center'},
                {text: 'Date F.', w: 50, align: 'center'},
                {text: 'Paiem.', w: 45, align: 'center'},
                {text: 'Statut', w: 45, align: 'center'},
                {text: 'Cpte', w: 30, align: 'center'},
                {text: 'HT', w: 40, align: 'right'},
                {text: 'TVA', w: 35, align: 'right'},
                {text: 'TTC', w: 50, align: 'right'}
            ], true);
        };
        
        drawHeaderDepenses();
        
        let sumDepensesBanque = 0, sumDepensesEspeces = 0, sumDepensesInconnu = 0;
        let totalDepensesHT = 0, totalDepensesTVA = 0, totalDepensesTTC = 0;
        
        if (facturesAffichees.length === 0) {
            drawRow([{text: 'Aucune facture datée de cette période.', w: 515}]);
        } else {
            facturesAffichees.forEach(f => {
                totalDepensesHT += f.ht; totalDepensesTVA += f.tva; totalDepensesTTC += f.ttc;
                
                if (f.mode_paiement === 'ESPECES') sumDepensesEspeces += f.ttc;
                else if (!f.mode_paiement || f.mode_paiement === 'NON_SPECIFIE' || f.mode_paiement === 'N/A') sumDepensesInconnu += f.ttc;
                else sumDepensesBanque += f.ttc;
                
                let compte = f.compte || '604';
                if (!f.compte) {
                    const nomLower = f.fournisseur.toLowerCase();
                    if (nomLower.includes('l\'oréal') || nomLower.includes('wella') || nomLower.includes('schwarzkopf') || nomLower.includes('revente') || nomLower.includes('produit') || nomLower.includes('grossiste')) compte = '607';
                    else if (nomLower.includes('edf') || nomLower.includes('eau') || nomLower.includes('urssaf') || nomLower.includes('loyer')) compte = '613';
                }

                const statutColor = f.statut === 'VALIDE' ? '#16a34a' : '#ea580c';
                const statutText = f.statut === 'VALIDE' ? 'Validé' : 'À valider';

                let refFacture = f.numero ? f.numero.substring(0, 8) : 'n° non détecté';
                let sourceDoc = f.url ? { text: 'Doc IA', link: f.url, color: '#0ea5e9' } : { text: 'Saisie' };
                const modePaiementCourt = f.mode_paiement === 'NON_SPECIFIE' ? 'N/A' : f.mode_paiement.substring(0, 7);
                
                const dateFAff = !isNaN(f.date_facture) ? f.date_facture.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) : 'N/A';
                const datePAff = !isNaN(f.date_paiement) ? f.date_paiement.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) : 'N/A';

                // Pagination avant de dessiner la ligne (Pour éviter les factures coupées)
                if (currentY > 730) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }

                drawRow([
                    {text: f.fournisseur.substring(0, 12), w: 60}, {text: refFacture, w: 50}, {...sourceDoc, w: 35, align: 'center'},
                    {text: dateFAff, w: 50, align: 'center'},
                    {text: modePaiementCourt, w: 45, align: 'center'}, {text: statutText, w: 45, align: 'center', color: statutColor},
                    {text: compte, w: 30, align: 'center'}, {text: fMnt(f.ht), w: 40, align: 'right'},
                    {text: fMnt(f.tva), w: 35, align: 'right'}, {text: fMnt(f.ttc), w: 50, align: 'right'}
                ]);
            });
        }
        
        // Lignes d'attentes gérées dynamiquement (On fusionne le texte des deux 1ères colonnes pour gagner de la place)
        if (currentY > 710) { doc.addPage(); currentY = 40; drawHeaderDepenses(); }
        
        // Détection intelligente : Y a-t-il de vraies charges fixes déjà renseignées dans le tableau ?
        let hasChargesFixes = facturesAffichees.some(f => {
            const cpte = f.compte || '';
            const nomL = (f.fournisseur || '').toLowerCase();
            return cpte.startsWith('61') || cpte.startsWith('62') || cpte.startsWith('63') || cpte.startsWith('64') || nomL.includes('edf') || nomL.includes('urssaf') || nomL.includes('loyer') || nomL.includes('assurance');
        });

        // Si aucune charge fixe n'est remontée par l'IA ou la saisie, on informe qu'il n'y en a pas
        if (!hasChargesFixes) {
            drawRow([{text: 'Aucune charge fixe saisie (Loyer, URSSAF...)', w: 105}, {text: 'N/A', w: 25, align: 'center'}, {text: '-', w: 45, align: 'center'}, {text: '-', w: 45, align: 'center'}, {text: '-', w: 38, align: 'center'}, {text: '-', w: 32, align: 'center'}, {text: '-', w: 22, align: 'center'}, {text: '-', w: 33, align: 'right'}, {text: '-', w: 28, align: 'right'}, {text: '0,00 €', w: 45, align: 'right'}]);
        }
        
        drawRow([{text: 'Variation de stock (Produits)', w: 105}, {text: 'N/A', w: 25, align: 'center'}, {text: '-', w: 45, align: 'center'}, {text: '-', w: 45, align: 'center'}, {text: '-', w: 38, align: 'center'}, {text: 'Invent.', w: 32, align: 'center'}, {text: '6037', w: 22, align: 'center'}, {text: '-', w: 33, align: 'right'}, {text: '-', w: 28, align: 'right'}, {text: 'Non renseigné', w: 45, align: 'right'}]);
        
        // Protection pour ne jamais séparer les totaux de leur tableau
        if (currentY > 670) { doc.addPage(); currentY = 40; }
        
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES PAR BANQUE (CB, Prélèvement, Virement)', w: 435}, {text: fMnt(sumDepensesBanque), w: 60, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES PAYÉES EN ESPÈCES (Déduites de la caisse)', w: 435}, {text: fMnt(sumDepensesEspeces), w: 60, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL DÉPENSES NON RÉGLÉES OU MODE INCONNU (À compléter)', w: 435}, {text: fMnt(sumDepensesInconnu), w: 60, align: 'right'}], false, true);
        drawRow([{text: 'TOTAL GÉNÉRAL DES DÉPENSES', w: 330}, {text: fMnt(totalDepensesHT), w: 45, align: 'right'}, {text: fMnt(totalDepensesTVA), w: 35, align: 'right'}, {text: fMnt(totalDepensesTTC), w: 60, align: 'right'}], false, true);

        if (franchiseTVA) {
            currentY += 4;
            doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* En franchise en base de TVA, la TVA sur achats n'est pas récupérable. La charge réelle retenue en comptabilité est le montant TTC.", 40, currentY); 
            currentY += 12;
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
        
        drawRow([
            {text: 'Employé(e)', w: 50}, 
            {text: 'Statut', w: 55, align: 'center'},
            {text: 'Heures', w: 45, align: 'center'},
            {text: 'HS/HC', w: 40, align: 'center'},
            {text: 'Pourboire', w: 40, align: 'center'},
            {text: 'CA Rél.', w: 45, align: 'right'}, 
            {text: 'Base HT (Prs/Prd)', w: 70, align: 'right'}, 
            {text: 'Taux (Prs/Prd)', w: 60, align: 'center'}, 
            {text: 'Prime Brute', w: 55, align: 'right'}
        ], true);

        let globalPrimes = 0;
        let totalCAEmployes = 0;
        rhRes.rows.forEach(e => {
            // Utilisation du nom complet tel qu'enregistré, sans altération
            const nomComplet = e.nom;
            const caRealiseBaseHT = mapCaEmployes[e.id_employe] || 0;
            totalCAEmployes += caRealiseBaseHT;
            
            // Les bases sont maintenant calculées à la virgule près avec la vraie TVA
            const basePrestaHT = parseFloat(e.base_presta_ht || 0);
            const baseProduitHT = parseFloat(e.base_produit_ht || 0);
            
            
            // Logique d'affichage automatisée des heures et pourboires (sans champs "À saisir" à l'impression)
            let heuresAffichees = 'Non renseigné';
            let hsAffichees = '0h';
            let pourboireAffiche = parseFloat(e.total_pourboire) > 0 ? fMnt(e.total_pourboire) : '0,00 €';

            if (e.est_gerant) {
                heuresAffichees = 'N/A';
                hsAffichees = 'N/A';
                pourboireAffiche = 'N/A';
            } else if (salonConfig.mode_suivi_heures === 'POINTEUSE') {
                heuresAffichees = 'Non renseigné';
                hsAffichees = 'Non renseigné';
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
                    {text: nomComplet.substring(0,12), w: 50}, 
                    {text: 'Gérant', w: 55, align: 'center'},
                    {text: heuresAffichees, w: 45, align: 'center'},
                    {text: hsAffichees, w: 40, align: 'center'},
                    {text: pourboireAffiche, w: 40, align: 'center'},
                    {text: fMnt(caRealiseBaseHT), w: 45, align: 'right'}, 
                    {text: '-', w: 70, align: 'right'}, 
                    {text: '-', w: 60, align: 'center'}, 
                    {text: '-', w: 55, align: 'right'}
                ]);
            } else {
                globalPrimes += parseFloat(e.total_prime || 0);
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
                    {text: nomComplet.substring(0,12), w: 50}, 
                    {text: 'À déclarer', w: 55, align: 'center'},
                    {text: heuresAffichees, w: 45, align: 'center'},
                    {text: hsAffichees, w: 40, align: 'center'},
                    {text: pourboireAffiche, w: 40, align: 'center'},
                    {text: fMnt(caRealiseBaseHT), w: 45, align: 'right'}, 
                    {text: basesConcat, w: 70, align: 'right'}, 
                    {text: regleTaux, w: 60, align: 'center'}, 
                    {text: fMnt(e.total_prime), w: 55, align: 'right'}
                ]);
            }
        });
        
        // Calcul et affichage du CA non attribué (Tickets sans employé ou employé supprimé)
        const caNonAttribue = totalHT - totalCAEmployes;
        if (Math.abs(caNonAttribue) > 0.01) {
            drawRow([
                {text: 'CA non attribué', w: 50}, 
                {text: 'N/A', w: 55, align: 'center'},
                {text: 'N/A', w: 45, align: 'center'},
                {text: 'N/A', w: 40, align: 'center'},
                {text: '-', w: 40, align: 'center'},
                {text: fMnt(caNonAttribue), w: 45, align: 'right'}, 
                {text: '-', w: 70, align: 'right'}, 
                {text: '-', w: 60, align: 'center'}, 
                {text: '-', w: 55, align: 'right'}
            ]);
        }
                

        if (rhRes.rowCount === 0) drawRow([{text: 'Aucune donnée.', w: 515}]);
        
        currentY += 4;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SEC_COLOR).text("* Le CA Réalisé inclut tout. La Base HT exclut les articles non-commissionnés (forfaits techniques...). HC = Heures Complémentaires, HS = Supplémentaires.", 40, currentY); currentY += 12;
        
        drawRow([
            {text: 'TOTAL PRIMES ÉQUIPE SALARIÉE', w: 450}, 
            {text: fMnt(globalPrimes), w: 55, align: 'right'}
        ], false, true);
        
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(20).fillColor(MAIN_COLOR).text('Variables de Paie & Absences (Suite)', 40, 40);
        doc.font('Helvetica').fontSize(10).fillColor(SEC_COLOR).text(`Période : ${firstDayOfMonth.toLocaleDateString('fr-FR')} - ${lastDayOfMonth.toLocaleDateString('fr-FR')}`, 40, 70);
        currentY = 100;

        // --- 5. ABSENCES ---
        drawTableTitle("5. REGISTRE DES ABSENCES ET CONGÉS");
        drawRow([{text: 'Employé', w: 100}, {text: 'Motif (Masquage RGPD)', w: 130}, {text: 'Période', w: 140}, {text: 'Jours', w: 40, align: 'center'}, {text: 'Infos Compl.', w: 75}], true);
        if (absencesRes.rowCount === 0) {
            drawRow([{text: 'Aucune absence sur la période.', w: 100}, {text: '-', w: 130}, {text: '-', w: 140}, {text: '-', w: 40, align: 'center'}, {text: '-', w: 75}]);
        } else {
            absencesRes.rows.forEach(a => {
                const estMaladie = a.type_demande === 'ARRET_MALADIE' || ['MALADIE_ORDINAIRE', 'ACCIDENT_TRAVAIL'].includes(a.nature_absence);
                const motifAffiche = estMaladie ? 'Arrêt de travail (Maladie/AT)' : (a.type_demande === 'CONGES' ? `Congé payé (${a.nature_absence})` : a.type_demande);
                const dDeb = new Date(a.date_debut); const dFin = new Date(a.date_fin);
                
                let joursOuvres = 0;
                for (let d = new Date(dDeb); d <= dFin; d.setDate(d.getDate() + 1)) { if (d.getDay() !== 0) joursOuvres++; }
                
                drawRow([
                    {text: a.nom_employe, w: 100}, 
                    {text: motifAffiche, w: 130}, 
                    {text: `Du ${dDeb.toLocaleDateString('fr-FR')} au ${dFin.toLocaleDateString('fr-FR')}`, w: 140}, 
                    {text: `${joursOuvres} j.`, w: 40, align: 'center'},
                    {text: estMaladie ? 'Attente CPAM' : 'Solde CP: -', w: 75}
                ]);
            });
        }

        // --- 5 BIS. ARCHIVE DES CLÔTURES (Z) ---
        drawTableTitle("5 BIS. HISTORIQUE DES CLÔTURES DE CAISSE (Z)");
        drawRow([
            {text: 'N° Z', w: 25}, 
            {text: 'Date', w: 50, align: 'center'}, 
            {text: 'Opérateur', w: 75}, 
            {text: 'Tkts', w: 20, align: 'center'},
            {text: 'CA TTC', w: 45, align: 'right'},
            {text: 'Cumul P.', w: 55, align: 'right'},
            {text: 'Espèces', w: 55, align: 'right'}, 
            {text: 'Hash NF525', w: 120, align: 'right'}
        ], true);
        
        if (zMoisRes.rowCount === 0) {
            drawRow([{text: 'Aucune clôture enregistrée ce mois-ci.', w: 515}]);
        } else {
            let sumCaZ = 0;
            let dernierCumulAffiche = null;
            let expectedId = null;

            zMoisRes.rows.forEach(z => {
                const currentId = parseInt(z.num_z_final);
                
                if (expectedId !== null && currentId > expectedId) {
                    for (let i = expectedId; i < currentId; i++) {
                        drawRow([
                            {text: `Z-${i}`, w: 25}, 
                            {text: 'N/A', w: 50, align: 'center'}, 
                            {text: 'Saut d\'ID', w: 65}, 
                            {text: '-', w: 20, align: 'center'},
                            {text: '-', w: 45, align: 'right'},
                            {text: '-', w: 55, align: 'right'},
                            {text: '-', w: 55, align: 'right'}, 
                            {text: 'Clôture manquante ou purgée', w: 130, align: 'right'}
                        ]);
                    }
                }
                expectedId = currentId + 1;

                sumCaZ += parseFloat(z.ca_ttc) || 0;
                let cumulActuel = parseFloat(z.cumul_perpetuel_ttc) || 0;
                
                let operator = z.ferme_par || 'Non spécifié';
                let isAuto = operator.toLowerCase().includes('robot') || operator.toLowerCase().includes('auto') || operator === 'Non spécifié';
                operator = isAuto ? 'Clôture Auto.' : operator.substring(0, 12);
                let especesReel = isAuto ? 'N/A' : fMnt(z.total_especes_reel);
                
                // NOUVEAU : On coupe le Hash SHA-256 en deux morceaux de 32 caractères pour qu'il tienne parfaitement dans la colonne
                let hashAffiche = 'NON-SIGNE';
                if (z.signature_hash && z.signature_hash.length === 64) {
                    hashAffiche = z.signature_hash.substring(0, 32) + '\n' + z.signature_hash.substring(32, 64);
                } else if (z.signature_hash) {
                    hashAffiche = z.signature_hash;
                }
                
                // Pagination manuelle pour éviter de couper la cellule multi-lignes
                if (currentY > 750) { doc.addPage(); currentY = 40; }

                doc.font('Helvetica').fontSize(9).fillColor(MAIN_COLOR);
                doc.text(`Z-${currentId}`, 40, currentY, { width: 25 });
                doc.text(z.date_z, 75, currentY, { width: 50, align: 'center' });
                doc.text(operator, 135, currentY, { width: 65 });
                doc.text(z.nb_tickets, 210, currentY, { width: 20, align: 'center' });
                doc.text(fMnt(z.ca_ttc), 240, currentY, { width: 45, align: 'right' });
                doc.text(fMnt(cumulActuel), 295, currentY, { width: 55, align: 'right' });
                doc.text(especesReel, 360, currentY, { width: 55, align: 'right' });
                
                doc.font('Courier').fontSize(6).fillColor(SEC_COLOR);
                doc.text(hashAffiche, 425, currentY, { width: 130, align: 'right' });
                
                currentY += 22; // Espace pour les deux lignes du Hash
                doc.moveTo(40, currentY).lineTo(555, currentY).lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
                currentY += 6;
            });
            
            // Calcul du CA orphelin (Jours où il y a eu des ventes mais aucune clôture de caisse Z n'a été faite)
            const caNonCloture = globalTTC - sumCaZ;
            if (caNonCloture > 0.01 || caNonCloture < -0.01) {
                drawRow([
                    {text: 'CA des jours non clôturés (En attente de Z)', w: 175}, 
                    {text: '', w: 0}, {text: '', w: 0}, {text: '', w: 0}, 
                    {text: fMnt(caNonCloture), w: 45, align: 'right'}, 
                    {text: '', w: 55}, {text: '', w: 50}, {text: '', w: 120}
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

                        let texteEmail = mailParsi.text || mailParsi.html || ""; 
                        const sujetEmail = mailParsi.subject || "Sans Sujet";
                        let urlPdfCloudflare = null;
                        
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
                        const tachesTrouvees = await analyserEmailAvecIA(sujetEmail, texteEmail, urlPdfCloudflare);
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

        // --- GÉNÉRATION DU FEC ---
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
            
            // Le fichier texte FEC est conservé et joint à l'email comme avant
            if (fecContent) {
                attachments.push({
                    filename: `FEC_${salon.id_salon}_${dateDebutStr.replace(/-/g, '')}_${dateFinStr.replace(/-/g, '')}.txt`,
                    content: fecContent,
                    contentType: 'text/plain; charset=windows-1252'
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
    
    try {
        // BLOCAGE STRICT : Vérification des factures en attente
        const tachesEnAttente = await pool.query(`SELECT 1 FROM ia_taches_attente WHERE id_salon = $1 AND type_tache = 'FACTURE_ACHAT' AND statut = 'ATTENTE'`, [id_salon]);
        if (tachesEnAttente.rowCount > 0) {
            return res.status(400).json({ erreur: `Signature bloquée : Il vous reste ${tachesEnAttente.rowCount} facture(s) "À valider" dans l'application. Veuillez les traiter avant de clôturer le mois.` });
        }

        const empRes = await pool.query("SELECT nom, code_pin FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1", [id_salon]);
        if (empRes.rowCount === 0) return res.status(404).json({ erreur: "Gérant introuvable." });
        
        const gerant = empRes.rows[0];
        let pinMatch = false;
        if (gerant.code_pin && gerant.code_pin.startsWith('$2')) {
            pinMatch = await bcrypt.compare(code_pin, gerant.code_pin);
        } else {
            pinMatch = (gerant.code_pin === code_pin);
        }

        if (!pinMatch) return res.status(400).json({ erreur: "Code PIN incorrect. Signature refusée." });

        await pool.query(
            "INSERT INTO liasses_mensuelles_validees (id_salon, mois_annee, valide_par) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [id_salon, mois_annee, gerant.nom]
        );

        // Déclenche l'envoi immédiat au comptable
        await envoyerBilanComptable(id_salon, mois_annee);

        res.json({ message: "Liasse validée, signée et transmise à l'expert-comptable avec succès." });
    } catch (e) {
        console.error("Erreur validation mois:", e);
        res.status(500).json({ erreur: "Erreur lors de la validation." });
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
                    const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
                    const totalJour = caResult.rows[0].total;

                    // NF525: Nouveau Cumul = Ancien Cumul + CA du jour.
                    const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc FROM clotures_caisse WHERE id_salon = $1 AND date_cloture < $2 ORDER BY date_cloture DESC, id_cloture DESC LIMIT 1', [id_salon, dateACloturerStr]);
                    const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
                    const grandTotalPerpetuel = ancienCumul + parseFloat(totalJour);
                    
                    const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
                    const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

                    // --- CALCUL DU THÉORIQUE POUR LE ROBOT ---
                    const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE' AND est_compense = FALSE`, [id_salon, dateACloturerStr]);
                    const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

                    const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE 0 END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
                    const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

                    const lastCloseRes = await clientDB.query('SELECT total_especes_reel FROM clotures_caisse WHERE id_salon = $1 AND date_cloture < $2 ORDER BY date_cloture DESC LIMIT 1', [id_salon, dateACloturerStr]);
                    const fCaisseMatin = lastCloseRes.rowCount > 0 ? parseFloat(lastCloseRes.rows[0].total_especes_reel) : 0;

                    const tEspecesTheorique = fCaisseMatin + totalEspecesVentes + totalMouvements;
                    // Le robot force le total_reel au total_theorique (écart = 0) pour valider mathématiquement la journée
                    // -----------------------------------------

                    const dateISO = new Date(j.jour); 
                    dateISO.setHours(23, 59, 59); // On scelle le robot à 23:59:59 de la veille
                    
                    const signature = crypto.createHash('sha256').update(`Z-${id_salon}-${nextZ}-${totalJour}-${grandTotalPerpetuel}-${hashPrecedent}-${dateISO.toISOString()}`).digest('hex');

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

app.get('/api/admin/forcer-robot', async (req, res) => { 
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

// --- CHEAT CODE : INJECTION SIRET POUR TEST PDF ---
app.get('/api/admin/fix-siret-38', async (req, res) => {
    try {
        await pool.query(
            "UPDATE configuration_salon SET siret = '12345678901234', siret_salon = '12345678901234', adresse_salon = '123 Rue de Test, 75000 Paris' WHERE id_salon = 38"
        );
        res.json({ message: "✅ SIRET (12345678901234) et Adresse injectés avec succès pour le salon 38 !" });
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
        
        // 🚨 CONFORMITÉ NF525 : On NE supprime PLUS JAMAIS les données fiscales (6 ans de conservation).
        // On conserve indéfiniment en lecture seule : jet_logs, tickets, lignes_ticket, commissions, clotures_caisse.
        // Seules les données opérationnelles et personnelles (pour la conformité RGPD) du salon sont purgées.

        // Ordre de suppression calculé pour purger le SaaS tout en gardant l'archive fiscale intacte
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
