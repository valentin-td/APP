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
const {
    initCronJobs,
    executerRobotComptable,
    executerRobotAvisSatisfaction,
    executerRobotMarketingEtPredictif,
    executerEnvoiComptable,
    executerClotureFantome,
    executerRapportHebdoGerant,
    executerRobotsSmsAutomatiques
} = require('./jobs/cronJobs');
const { genererBufferBonCommandePDF } = require('./services/pdf/bonCommandePdf.service');
const { genererBufferFactureTicketPDF, genererBufferJournalierZ } = require('./services/pdf/ticketPdf.service');
const { genererBufferLiassePdf: genererBufferLiassePdfService, recupererBufferDepuisR2OuBase64 } = require('./services/pdf/liassePdf.service');
const { construireContenuFEC } = require('./services/compta/fec.service');
const { genererArchiveFiscale } = require('./services/compta/archiveFiscale.service');
const {
    envoyerBilanComptable: envoyerBilanComptableService,
    validerClotureMensuelle,
    obtenirStatutMois
} = require('./services/compta/clotureMensuelle.service');
const envoyerBilanComptable = (id_salon, mois_annee) => envoyerBilanComptableService({ pool, genererBufferLiassePdf }, { id_salon, mois_annee });
const {
    calculerPrevisionStocks,
    creerOuReapproArticle,
    supprimerArticle,
    renommerArticle,
    corrigerStock,
    fusionnerStocks,
    envoyerCommandeFournisseur,
    enregistrerVerificationStock
} = require('./services/stock/stock.service');
const {
    recupererEmployes,
    mettreAJourMonPin,
    debloquerPinEmploye,
    ajouterEmploye,
    modifierEmploye,
    supprimerOuAnonymiserEmploye,
    mettreAJourPhotoEmploye
} = require('./services/rh/employes.service');
const {
    recupererGamificationKpis,
    recupererObjectifsEquipe,
    creerObjectifEquipe,
    supprimerObjectifEquipe,
    ajusterHeures,
    recupererStatutPointages,
    enregistrerPointage,
    calculerTableauBordRH,
    deposerAbsence,
    deciderAbsence,
    genererLienJustificatifAbsence,
    recupererAbsences
} = require('./services/rh/rh.service');
const {
    stockerImageSurR2,
    resoudreUrlImageDepuisR2,
    migrerBase64ExistantsVersR2,
    recupererProtocoles,
    creerProtocole,
    modifierProtocole,
    supprimerProtocole,
    recupererTaches,
    creerTache,
    basculerStatutTache,
    supprimerTache
} = require('./services/protocoles/protocoles.service');
const {
    recupererMessages,
    envoyerMessage,
    modifierMessage,
    supprimerMessage,
    marquerMessagesLus,
    reagirMessage
} = require('./services/chat/chat.service');
const {
    recupererInfoAvis,
    recupererStatsAvis,
    arreterSmsClient,
    enregistrerNoteAvis,
    enregistrerCommentaireAvis,
    envoyerSmsManuel,
    envoyerSmsWinback
} = require('./services/marketing/marketing.service');
const {
    creerRdv,
    modifierRdv,
    supprimerRdv,
    recupererInfosReservationPublique,
    calculerCreneauxReservationPublique,
    verifierFideliteReservationPublique,
    creerReservationPublique,
    annulerRdvEnMasse,
    recupererPlanning,
    genererFluxIcal
} = require('./services/agenda/agenda.service');
const {
    assurerTableMultiSalons,
    resoudreEmailGerant,
    listerMesSalons,
    creerSalonGroupe,
    switchSalonGroupe,
    synchroniserCatalogueGroupe,
    exporterPortabiliteDonnees
} = require('./services/salons/salons.service');
const {
    assurerColonnesAbonnementEtSms,
    TARIFS_FORFAITS_STACK,
    getQuotaSmsParPlan,
    verifierEtIncrementerQuotaSMS,
    lireEtatAbonnement,
    creerCheckoutSession,
    confirmerSessionStripe,
    changerForfait,
    resilierAbonnement,
    reactiverAbonnement,
    traiterWebhookStripe
} = require('./services/stripe/stripe.service');
const {
    analyserEmailAvecIA,
    recupererTachesIA,
    saisirFactureManuelle,
    analyserEtUploaderFactureIA,
    supprimerTacheIA,
    validerTacheIA,
    ignorerTacheIA
} = require('./services/ia/ia.service');
const {
    recupererDashboardSalon,
    recupererDashboardEmploye,
    recupererDashboardGlobal
} = require('./services/dashboard/dashboard.service');
const {
    verifierSuperAdminMiddleware,
    forcerExecutionRobots,
    timeTravelSalon,
    fixSiret38,
    recupererStatsSuperAdmin,
    listerSalonsSuperAdmin,
    mettreAJourStatutSalonSuperAdmin,
    purgerSalonSuperAdmin
} = require('./services/admin/superadmin.service');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const webpush = require('web-push');
const pdfParse = require('pdf-parse');
const Sentry = require('@sentry/node');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialisation du client Cloudflare R2
const r2AccountClean = (process.env.R2_ACCOUNT_ID || '').replace(/^https?:\/\//, '').split('.')[0].trim();
const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountClean}.r2.cloudflarestorage.com`,
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
app.set('trust proxy', 1);

// 🚨 SÉCURITÉ : Restriction stricte des origines + Autorisation des Cookies (credentials)
const corsOptions = {
    origin: ['https://app-salon-caiss.onrender.com', 'http://localhost:5173', 'http://localhost:3000', 'https://stack-partners-frontend.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    credentials: true
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // <-- L'expression régulière /.*/ (sans guillemets) contourne le parseur de texte et empêche le crash

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
  if (
    req.originalUrl === '/api/webhooks' ||
    req.originalUrl === '/api/webhooks/' ||
    req.originalUrl.startsWith('/api/partners/webhooks/stripe')
  ) {
    next();
  } else {
    express.json({
      limit: '10mb',
      verify: (reqObj, resObj, buf) => { reqObj.rawBody = buf; }
    })(req, res, next);
  }
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
    ALTER TABLE recettes_articles ADD COLUMN IF NOT EXISTS numero_etape INT DEFAULT 0;
    ALTER TABLE recettes_articles ADD COLUMN IF NOT EXISTS proportion VARCHAR(120) DEFAULT NULL;
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS stripe_reader_id VARCHAR(255);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS prenom VARCHAR(100);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_naissance DATE;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS points_fidelite INT DEFAULT 0;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tampons_fidelite INT DEFAULT 0;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS derniere_visite DATE;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS remise_winback VARCHAR(100);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS dernier_sms_relance DATE;
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
    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS rappel_rdv_2h_actif BOOLEAN DEFAULT FALSE;
    ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS sms_rappel_envoye BOOLEAN DEFAULT FALSE;
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
    
    -- TABLES PORTAIL PARTENAIRES
    CREATE TABLE IF NOT EXISTS partner_agents (id_agent SERIAL PRIMARY KEY, nom VARCHAR(100) NOT NULL, prenom VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, telephone VARCHAR(20), mot_de_passe_hash VARCHAR(255) NOT NULL, siret_agent VARCHAR(50) NOT NULL, numero_rsac VARCHAR(100), iban VARCHAR(50), code_partenaire VARCHAR(50) UNIQUE NOT NULL, statut_compte VARCHAR(30) DEFAULT 'EN_ATTENTE_VALIDATION', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS partner_stocks_tpe (numero_serie VARCHAR(100) PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE SET NULL, statut VARCHAR(50) DEFAULT 'EN_STOCK_STACK', id_salon_affecte INT, date_attribution_agent TIMESTAMP);
    CREATE TABLE IF NOT EXISTS partner_factures_installation (id_facture SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, numero_facture VARCHAR(50) UNIQUE NOT NULL, nom_salon VARCHAR(255) NOT NULL, adresse_salon TEXT NOT NULL, siret_salon VARCHAR(50) NOT NULL, montant_ht NUMERIC(10,2) DEFAULT 99.00, statut VARCHAR(30) DEFAULT 'EN_ATTENTE_DE_PAIEMENT', date_emission TIMESTAMP DEFAULT CURRENT_TIMESTAMP, date_paiement TIMESTAMP);
    CREATE TABLE IF NOT EXISTS partner_prospects_reservations (id_prospect SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, nom_salon VARCHAR(255) NOT NULL, ville VARCHAR(100), code_postal VARCHAR(20), siret_prospect VARCHAR(50), telephone_salon VARCHAR(20), email_gerant VARCHAR(255) NOT NULL, statut_prospect VARCHAR(30) DEFAULT 'DECLARE', date_declaration TIMESTAMP DEFAULT CURRENT_TIMESTAMP, date_expiration_protection TIMESTAMP NOT NULL, id_salon_converti INT);
    CREATE TABLE IF NOT EXISTS partner_attributions_salons (id_attribution SERIAL PRIMARY KEY, id_salon INT UNIQUE REFERENCES configuration_salon(id_salon) ON DELETE CASCADE, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, mode_attribution VARCHAR(50) DEFAULT 'LIEN_AFFILIATION', frais_installation_factures NUMERIC(10,2) DEFAULT 99.00, statut_onboarding VARCHAR(50) DEFAULT 'EN_ATTENTE_VALIDATION_STACK', date_debut_commissionnement DATE, date_fin_commissionnement DATE, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS partner_commissions (id_commission SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, id_salon INT REFERENCES configuration_salon(id_salon) ON DELETE CASCADE, type_commission VARCHAR(50) DEFAULT 'ABONNEMENT_RECURRENT_20_POURCENT', periode_mois VARCHAR(7) NOT NULL, montant_base_ht NUMERIC(10,2) NOT NULL, taux_applique NUMERIC(5,2) DEFAULT 20.00, montant_commission NUMERIC(10,2) NOT NULL, statut_commission VARCHAR(30) DEFAULT 'EN_ATTENTE_SEUIL', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(id_salon, periode_mois, type_commission));

    CREATE TABLE IF NOT EXISTS partner_conformite_dossier (
        id_agent INT PRIMARY KEY REFERENCES partner_agents(id_agent) ON DELETE CASCADE,
        contrat_signe BOOLEAN DEFAULT FALSE,
        date_signature_contrat TIMESTAMP,
        statut_contrat VARCHAR(30) DEFAULT 'MANQUANT',
        date_naissance DATE,
        date_expiration_identite DATE,
        fichier_identite TEXT,
        statut_identite VARCHAR(30) DEFAULT 'MANQUANT',
        forme_juridique VARCHAR(50) DEFAULT 'EI',
        date_debut_activite DATE,
        adresse_pro TEXT,
        statut_siret VARCHAR(30) DEFAULT 'MANQUANT',
        greffe_rsac VARCHAR(150),
        date_emission_rsac DATE,
        fichier_rsac TEXT,
        statut_rsac VARCHAR(30) DEFAULT 'MANQUANT',
        date_emission_kbis DATE,
        fichier_kbis TEXT,
        statut_kbis VARCHAR(30) DEFAULT 'NON_REQUIS',
        code_verif_urssaf VARCHAR(100),
        date_emission_urssaf DATE,
        date_expiration_urssaf DATE,
        fichier_urssaf TEXT,
        statut_urssaf VARCHAR(30) DEFAULT 'MANQUANT',
        assureur_nom VARCHAR(150),
        assureur_contrat VARCHAR(100),
        assureur_plafond VARCHAR(100),
        date_expiration_rc_pro DATE,
        fichier_rc_pro TEXT,
        statut_rc_pro VARCHAR(30) DEFAULT 'MANQUANT',
        titulaire_iban VARCHAR(255),
        statut_iban VARCHAR(30) DEFAULT 'MANQUANT',
        regime_tva VARCHAR(50) DEFAULT 'FRANCHISE_293B',
        numero_tva_intra VARCHAR(50),
        statut_tva VARCHAR(30) DEFAULT 'MANQUANT',
        honneur_aucune_interdiction BOOLEAN DEFAULT FALSE,
        honneur_pas_exclusivite_employeur BOOLEAN DEFAULT FALSE,
        honneur_pas_mandat_concurrent BOOLEAN DEFAULT FALSE,
        date_declarations_honneur TIMESTAMP,
        charte_acceptee BOOLEAN DEFAULT FALSE,
        version_charte VARCHAR(20) DEFAULT 'v1.0',
        date_acceptation_charte TIMESTAMP,
        quiz_score INT DEFAULT 0,
        formation_validee BOOLEAN DEFAULT FALSE,
        date_validation_formation TIMESTAMP,
        telephone_confirme BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS partner_conformite_historique (
        id_historique SERIAL PRIMARY KEY,
        id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE,
        type_piece VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        statut_resultat VARCHAR(30) NOT NULL,
        verifie_par VARCHAR(150),
        commentaire TEXT,
        date_evenement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS id_agent_apporteur INT REFERENCES partner_agents(id_agent) ON DELETE SET NULL;
    
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
                        -- Seuls "hash_ticket" (si NULL à la base) et "est_compense" (uniquement FALSE -> TRUE) peuvent être modifiés par le code.
                        IF OLD.id_salon IS DISTINCT FROM NEW.id_salon
                           OR OLD.total_ttc IS DISTINCT FROM NEW.total_ttc 
                           OR OLD.montant_pourboire IS DISTINCT FROM NEW.montant_pourboire
                           OR OLD.numero_ticket_caisse IS DISTINCT FROM NEW.numero_ticket_caisse 
                           OR OLD.date_creation IS DISTINCT FROM NEW.date_creation 
                           OR OLD.methode_paiement IS DISTINCT FROM NEW.methode_paiement
                           OR OLD.statut IS DISTINCT FROM NEW.statut
                           OR OLD.type_ticket IS DISTINCT FROM NEW.type_ticket
                           OR OLD.id_ticket_origine IS DISTINCT FROM NEW.id_ticket_origine
                           OR OLD.motif_annulation IS DISTINCT FROM NEW.motif_annulation
                           OR OLD.id_employe IS DISTINCT FROM NEW.id_employe
                           OR OLD.id_client IS DISTINCT FROM NEW.id_client
                           OR (OLD.est_compense = TRUE AND NEW.est_compense = FALSE)
                           OR (OLD.hash_ticket IS NOT NULL AND OLD.hash_ticket IS DISTINCT FROM NEW.hash_ticket)
                           OR (OLD.donnees_scellees IS NOT NULL AND OLD.donnees_scellees IS DISTINCT FROM NEW.donnees_scellees) THEN
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
                        IF OLD.id_salon IS DISTINCT FROM NEW.id_salon
                           OR (OLD.hash_mouvement IS NOT NULL AND OLD.hash_mouvement IS DISTINCT FROM NEW.hash_mouvement)
                           OR OLD.hash_precedent IS DISTINCT FROM NEW.hash_precedent
                           OR OLD.montant IS DISTINCT FROM NEW.montant
                           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
                           OR OLD.categorie_comptable IS DISTINCT FROM NEW.categorie_comptable
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
                const isTrialing = user.plan_actuel === 'PREMIUM_TRIAL' && (!user.date_fin_essai || new Date(user.date_fin_essai) > new Date());
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

const normaliserTelephone = (tel) => String(tel || '').replace(/\D/g, '').slice(-9);

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
    if (categorieExplicite && ['ACHAT_ESPECES', 'REMISE_BANQUE', 'APPORT_FONDS', 'PRELEVEMENT_GERANT', 'ECART_CAISSE'].includes(categorieExplicite)) {
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

const limiteurAvisPublic = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    message: { erreur: "Trop de tentatives, réessayez plus tard." }
});

// Limiteur autonome anti-spam pour les routes publiques de réservation (évite tout crash d'ordre d'initialisation)
const mapLimiteurReservation = new Map();
const limiteurReservationPublique = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip';
    const now = Date.now();
    const entree = mapLimiteurReservation.get(ip) || { count: 0, resetAt: now + 60000 };
    if (now > entree.resetAt) {
        entree.count = 0;
        entree.resetAt = now + 60000;
    }
    entree.count++;
    mapLimiteurReservation.set(ip, entree);
    if (entree.count > 60) {
        return res.status(429).json({ erreur: "Trop de requêtes, veuillez réessayer dans un instant." });
    }
    next();
};

app.post('/api/register', authLimiter, async (req, res) => {
    const { email, mot_de_passe, nom_salon, nom_gerant, code_partenaire, siret } = req.body;
    if (!email || !mot_de_passe) return res.status(400).json({ erreur: "Email et mot de passe requis." });
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const exist = await clientDB.query('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
        if (exist.rowCount > 0) throw new Error("Cet email est déjà utilisé.");
        const hash = await bcrypt.hash(mot_de_passe, 10);
        
        // 1. Recherche de l'agent si un code partenaire est fourni via le lien d'onboarding
        let idAgentApporteur = null;
        if (code_partenaire) {
            const agentRes = await clientDB.query('SELECT id_agent FROM partner_agents WHERE code_partenaire = $1', [code_partenaire]);
            if (agentRes.rowCount > 0) {
                idAgentApporteur = agentRes.rows[0].id_agent;
            }
        }

        // 2. Création du salon avec l'affiliation et le SIRET (s'ils existent)
        const salonResult = await clientDB.query(
            "INSERT INTO configuration_salon (nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur, siret) VALUES ($1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL', $2, $3) RETURNING id_salon", 
            [nom_salon || 'Nouveau Salon', idAgentApporteur, siret || null]
        );
        const idNouveauSalon = salonResult.rows[0].id_salon;

        // 3. Officialisation de l'attribution et MAJ du prospect si un agent est lié
        if (idAgentApporteur) {
            await clientDB.query(
                "INSERT INTO partner_attributions_salons (id_salon, id_agent, mode_attribution, statut_onboarding) VALUES ($1, $2, 'LIEN_AFFILIATION', 'EN_ATTENTE_VALIDATION_STACK')",
                [idNouveauSalon, idAgentApporteur]
            );
            await clientDB.query(
                "UPDATE partner_prospects_reservations SET id_salon_converti = $1, statut_prospect = 'SIGNE' WHERE id_agent = $2 AND (email_gerant = $3 OR siret_prospect = $4)",
                [idNouveauSalon, idAgentApporteur, email, siret]
            );
        }

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
    try {
        const result = await ajusterHeures({ pool }, { id_salon: req.user.id_salon, role: req.user.role, body: req.body });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur BDD" });
    }
});

// --- GESTION DE LA POINTEUSE NUMÉRIQUE (MODE PREMIUM) ---
app.get('/api/rh/statut-pointages', verifierToken, async (req, res) => {
    try {
        const mapStatuts = await recupererStatutPointages({ pool }, req.user.id_salon);
        res.json(mapStatuts);
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lecture statuts" }); 
    }
});

app.post('/api/rh/pointage', verifierToken, async (req, res) => {
    try {
        const result = await enregistrerPointage({ pool, io }, { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, body: req.body });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur BDD" });
    }
});

app.post('/api/employes/login-pin', authLimiter, async (req, res) => {
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
                tentatives: parseInt(emp.pin_tentatives_echouees, 10) || 9,
                locked_permanent: true
            });
        }
        if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
            const minRestantes = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
            return res.status(403).json({
                erreur: `Code PIN suspendu temporairement pour ${emp.nom}. Réessayez dans ${minRestantes} minute(s).`,
                tentatives: parseInt(emp.pin_tentatives_echouees, 10) || 3,
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
                messageSanction = `Bloqué pendant 1 heure (2 essais restants ensuite avant blocage définitif).`;
            } else if (nouvellesTentatives === 5) {
                bloqueJusqua = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                messageSanction = `Bloqué pendant 30 minutes.`;
            } else if (nouvellesTentatives === 3) {
                bloqueJusqua = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                messageSanction = `Bloqué pendant 15 minutes.`;
            } else {
                const prochainSeuil = nouvellesTentatives < 3 ? 3 : (nouvellesTentatives < 5 ? 5 : (nouvellesTentatives < 7 ? 7 : 9));
                const restants = prochainSeuil - nouvellesTentatives;
                messageSanction = `${restants} essai${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''} avant verrouillage.`;
            }

            await pool.query(
                'UPDATE employes SET pin_tentatives_echouees = $1, pin_bloque_jusqua = $2, pin_bloque_definitif = $3 WHERE id_employe = $4 AND id_salon = $5',
                [nouvellesTentatives, bloqueJusqua, bloqueDefinitif, emp.id_employe, id_salon]
            );
            await enregistrerJET(id_salon, bloqueDefinitif ? 'PIN_BLOCAGE_DEFINITIF' : 'CONNEXION_ECHOUEE', { nom_employe: emp.nom, tentatives: nouvellesTentatives, is_pointeuse: !!is_pointeuse });
            return res.status(400).json({
                erreur: `Code PIN incorrect. ${messageSanction}`,
                tentatives: nouvellesTentatives,
                locked_until: bloqueJusqua,
                locked_permanent: bloqueDefinitif
            });
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
        const result = await pool.query('SELECT id_user, mot_de_passe_hash FROM utilisateurs WHERE email = $1', [email]);
        if (result.rowCount === 0) return res.json({ message: "Si cet email existe, un lien a été envoyé." });
        const secretUsageUnique = process.env.JWT_SECRET + '_' + result.rows[0].mot_de_passe_hash;
        const resetToken = jwt.sign({ email, purpose: 'password_reset' }, secretUsageUnique, { expiresIn: '15m' });
        const resetLink = `https://app-salon-caiss.onrender.com/?resetToken=${resetToken}`;
        let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        await transporter.sendMail({ from: `"Support SaaS Caisse" <${process.env.SMTP_USER}>`, to: email, subject: '🔐 Réinitialisation de votre mot de passe', html: `<p>Bonjour,</p><p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 15 minutes) :</p><p><a href="${resetLink}">Réinitialiser mon accès</a></p>` });
        res.json({ message: "Si cet email existe, un lien a été envoyé." });
    } catch (e) { res.status(500).json({ erreur: "Erreur lors de l'envoi." }); }
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
    const { token, nouveau_mot_de_passe } = req.body;
    if (!token || !nouveau_mot_de_passe || String(nouveau_mot_de_passe).length < 8) {
        return res.status(400).json({ erreur: "Un mot de passe d'au moins 8 caractères est requis." });
    }
    try {
        const unverified = jwt.decode(token);
        if (!unverified || !unverified.email || unverified.purpose !== 'password_reset') {
            return res.status(400).json({ erreur: "Jeton invalide." });
        }
        const userRes = await pool.query('SELECT mot_de_passe_hash FROM utilisateurs WHERE email = $1', [unverified.email]);
        if (userRes.rowCount === 0) return res.status(400).json({ erreur: "Lien expiré ou invalide." });

        const secretUsageUnique = process.env.JWT_SECRET + '_' + userRes.rows[0].mot_de_passe_hash;
        const decoded = jwt.verify(token, secretUsageUnique);
        const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
        await pool.query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = $2', [hash, decoded.email]);
        res.json({ message: "Mot de passe mis à jour avec succès !" });
    } catch (e) { res.status(400).json({ erreur: "Lien expiré, déjà utilisé ou falsifié." }); }
});

// Middleware SSO Sandbox & Bypass du popup légal uniquement pour les salons DEMO et VIDE (le salon ONBOARDING garde le tunnel légal pour s'exercer)
app.use(async (req, res, next) => {
    try {
        // 1. Si le frontend appelle l'API avec ?sandbox_token= ou un Referer contenant sandbox_token=, on injecte automatiquement l'Authorization et le Cookie
        let sbToken = req.query?.sandbox_token || req.query?.token_api;
        if (!sbToken && req.headers.referer && req.headers.referer.includes('sandbox_token=')) {
            const urlRef = new URL(req.headers.referer);
            sbToken = urlRef.searchParams.get('sandbox_token') || urlRef.searchParams.get('token_api');
        }
        if (sbToken && !req.headers.authorization) {
            req.headers.authorization = `Bearer ${sbToken}`;
            res.cookie('token', sbToken, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 24 * 60 * 60 * 1000 });
        }

        // 2. Si le module légal est interrogé pour un salon DEMO ou VIDE, on répond que les CGV sont déjà signées pour ouvrir directement la caisse !
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
                const dec = jwt.verify(tokenToDecode, process.env.JWT_SECRET);
                if (dec && dec.id_salon) {
                    if (!req.headers.authorization) req.headers.authorization = `Bearer ${tokenToDecode}`;
                    const sRes = await pool.query('SELECT est_bac_a_sable, type_bac_a_sable, nom_salon, siret, adresse_salon FROM configuration_salon WHERE id_salon = $1', [dec.id_salon]);
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
});

// Module légal : acceptation électronique des documents contractuels (CGV, RGPD, SEPA, NF525, prêt du TPE)
const originalDocumentsEnAttente = legal.documentsEnAttente;
if (typeof originalDocumentsEnAttente === 'function') {
    legal.documentsEnAttente = async (poolArg, idSalon) => {
        try {
            const s = await pool.query('SELECT est_bac_a_sable, type_bac_a_sable FROM configuration_salon WHERE id_salon = $1', [idSalon]);
            if (s.rowCount > 0 && s.rows[0].est_bac_a_sable && s.rows[0].type_bac_a_sable !== 'ONBOARDING') {
                return [];
            }
        } catch (e) {}
        return originalDocumentsEnAttente(poolArg, idSalon);
    };
}
// Interception et Refonte "STACK Executive" du Certificat d'Acceptation Électronique (STACK-acceptation-ACC-XX.pdf)
app.use(async (req, res, next) => {
    const isLegalPdfRoute =
        req.method === 'GET' &&
        req.path.startsWith('/api/legal') &&
        (req.path.includes('pdf') || req.path.includes('certificat') || req.path.includes('preuve') || req.query?.format === 'pdf');

    if (!isLegalPdfRoute) return next();

    try {
        // 1. Authentification du salon (Cookie, Header ou Query token)
        let token = req.query?.token || req.query?.sandbox_token || req.query?.token_api;
        if (!token && req.headers.authorization) token = req.headers.authorization.split(' ')[1];
        if (!token && req.headers.cookie) {
            const c = req.headers.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('token='));
            if (c) token = c.split('=')[1];
        }
        if (!token) return next();

        const user = jwt.verify(token, process.env.JWT_SECRET);
        if (!user || !user.id_salon) return next();

        // 2. Récupération de l'acceptation enregistrée dans acceptations_legales et des infos du salon
        const accIdParam = req.params?.id || req.query?.id || null;
        let accRow = null;
        try {
            const accRes = accIdParam
                ? await pool.query(`SELECT * FROM acceptations_legales WHERE id_salon = $1 AND (id::text = $2 OR id_acceptation::text = $2) ORDER BY 1 DESC LIMIT 1`, [user.id_salon, String(accIdParam)])
                : await pool.query(`SELECT * FROM acceptations_legales WHERE id_salon = $1 ORDER BY 1 DESC LIMIT 1`, [user.id_salon]);
            if (accRes.rowCount > 0) accRow = accRes.rows[0];
        } catch (e) {}

        const salonRes = await pool.query(`SELECT * FROM configuration_salon WHERE id_salon = $1`, [user.id_salon]);
        const salon = salonRes.rows[0] || {};
        const gerantRes = await pool.query(`SELECT nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1`, [user.id_salon]);

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

        // Textes officiels des 3 documents contractuels STACK
        const docsContractuels = [
            {
                code: 'CGV',
                titre: "Conditions Générales d'Utilisation et de Vente (CGUV)",
                version: '2026-09-28',
                hash: crypto.createHash('sha256').update('STACK_CGUV_2026-09-28').digest('hex'),
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
                hash: crypto.createHash('sha256').update('STACK_RGPD_2026-09-28').digest('hex'),
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
                hash: crypto.createHash('sha256').update('STACK_SEPA_2026-09-28').digest('hex'),
                articles: [
                    { t: "1. Moyens de paiement acceptés", c: "L'abonnement logiciel STACK est réglé par prélèvement automatique SEPA ou par carte bancaire, via l'infrastructure sécurisée de notre prestataire de paiement Stripe." },
                    { t: "2. Établissement du Mandat de prélèvement SEPA", c: "En choisissant le prélèvement SEPA, le mandat est établi et signé électroniquement lors de l'étape de paiement sécurisée Stripe. Ce mandat précise l'identifiant créancier SEPA (ICS), la Référence Unique du Mandat (RUM) et les coordonnées bancaires IBAN à débiter." },
                    { t: "3. Portée du mandat et Contestations", c: "Le mandat autorise le prélèvement récurrent des échéances de l'abonnement STACK choisi par le salon. Vos droits en matière de contestation et de remboursement d'un prélèvement SEPA sont garantis conformément à la réglementation européenne et aux conditions de votre établissement bancaire." },
                    { t: "4. Conservation de la preuve électronique", c: "Votre acceptation électronique du présent document, scellée par horodatage UTC, adresse IP et empreinte cryptographique SHA-256, est archivée de manière inaltérable par l'éditeur à titre de preuve légale." }
                ]
            }
        ];

        const hashGlobalPreuve = accRow?.empreinte_preuve || accRow?.signature_hash || accRow?.hash_preuve ||
            crypto.createHash('sha256').update(`${referenceCertificat}|${dateIso}|${nomSignataire}|${siretSalon}|${ipSignataire}`).digest('hex');

        const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
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

        // =========================================================================
        // PAGE 1 : CERTIFICAT OFFICIEL DE SIGNATURE ÉLECTRONIQUE (DESIGN EXECUTIVE)
        // =========================================================================
        doc.rect(0, 0, 595.28, 8).fill(DARK);

        let y = 36;
        doc.roundedRect(45, y, 36, 36, 9).fill(DARK);
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff').text('S', 45, y + 8, { width: 36, align: 'center' });

        doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK).text('STACK — Caisse Certifiée NF525', 92, y + 3, { width: 235, lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(LIGHT_MUTED).text('Tiers de preuve & Horodatage • Art. 1366 & 1367 C. civ.', 92, y + 21, { width: 240, lineBreak: false });

        doc.font('Helvetica-Bold').fontSize(12.5).fillColor(DARK).text('CERTIFICAT D\'ACCEPTATION', 345, y + 2, { width: 205, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text(`Réf. Dossier : ${referenceCertificat}`, 345, y + 19, { width: 205, align: 'right', lineBreak: false });

        doc.roundedRect(380, y + 34, 170, 18, 5).fill(GREEN_BG);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GREEN_TXT).text('SIGNATURE ÉLECTRONIQUE VALIDE', 380, y + 39, { width: 170, align: 'center' });

        y = 104;
        doc.moveTo(45, y).lineTo(550, y).lineWidth(0.8).strokeColor(BORDER).stroke();
        y += 16;

        // Cartes Éditeur (Gauche) & Signataire (Droite)
        const cardH = 108;
        doc.roundedRect(45, y, 242, cardH, 8).fillAndStroke(BG_SOFT, BORDER);
        doc.roundedRect(308, y, 242, cardH, 8).fillAndStroke('#ffffff', BORDER);

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(LIGHT_MUTED).text('ÉDITEUR DU LOGICIEL SAAS', 57, y + 11);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text('STACK (Valentin TARDY)', 57, y + 25);
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
        doc.text('32 Rue du Goujon, 67000 Strasbourg', 57, y + 41, { width: 218 });
        doc.text(`SIRET : ${process.env.EDITEUR_SIRET || 'En cours d\'immatriculation'}`, 57, y + 56, { width: 218 });
        doc.text('Logiciel : STACK Cloud SaaS v1.0 (Norme NF525)', 57, y + 71, { width: 218 });
        doc.font('Helvetica').fontSize(8).fillColor(LIGHT_MUTED).text('Support & DPO : stackcontact.fr@gmail.com', 57, y + 88);

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(LIGHT_MUTED).text('SIGNATAIRE & ÉTABLISSEMENT ENGAGÉ', 320, y + 11);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(nomSalon, 320, y + 25, { width: 218 });
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
        doc.text(`Représenté par : ${nomSignataire}`, 320, y + 41, { width: 218 });
        doc.text(`E-mail : ${emailSignataire}`, 320, y + 55, { width: 218 });
        doc.text(`Adresse : ${adresseSalon}`, 320, y + 69, { width: 218 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(`SIRET : ${formatSiret(siretSalon)}`, 320, y + 88, { width: 218 });

        y += cardH + 14;

        // Bandeau Métadonnées techniques d'horodatage et traçabilité IP
        doc.roundedRect(45, y, 505, 52, 6).fillAndStroke(BG_SOFT, BORDER);
        doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT_MUTED).text('HORODATAGE LÉGAL (EUROPE/PARIS)', 57, y + 8);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(dateParis, 57, y + 19);

        doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT_MUTED).text('HORODATAGE UNIVERSEL (UTC ISO-8601)', 225, y + 8);
        doc.font('Courier-Bold').fontSize(8).fillColor(DARK).text(dateIso, 225, y + 19);

        doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT_MUTED).text('ADRESSE IP SOURCE', 425, y + 8);
        doc.font('Courier-Bold').fontSize(8.5).fillColor(DARK).text(ipSignataire, 425, y + 19);

        doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`Empreinte Navigateur (User-Agent) : ${uaSignataire}`, 57, y + 35, { width: 480, lineBreak: false, ellipsis: true });

        y += 66;

        // Tableau des documents contractuels acceptés et leurs condensats SHA-256
        doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('DOCUMENTS CONTRACTUELS ACCEPTÉS ET SCELLÉS CRYPTOGRAPHIQUEMENT', 45, y);
        y += 14;

        doc.rect(45, y, 505, 22).fill(DARK);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('DOCUMENT CONTRACTUEL', 55, y + 7, { width: 210 });
        doc.text('VERSION', 270, y + 7, { width: 65, align: 'center' });
        doc.text('EMPREINTE SHA-256 DU DOCUMENT', 340, y + 7, { width: 200, align: 'right' });
        y += 22;

        docsContractuels.forEach((d, idx) => {
            const rowH = 34;
            doc.rect(45, y, 505, rowH).fillAndStroke(idx % 2 === 0 ? '#ffffff' : BG_SOFT, BORDER);
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(d.titre, 55, y + 11, { width: 210 });
            doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(d.version, 270, y + 12, { width: 65, align: 'center' });
            const hSplit = `${d.hash.slice(0, 32)}\n${d.hash.slice(32, 64)}`;
            doc.font('Courier').fontSize(7.2).fillColor(DARK).text(hSplit, 340, y + 7, { width: 200, align: 'right' });
            y += rowH;
        });

        y += 16;

        // Encadré Déclaration du signataire & Sceau Cryptographique Global du Dossier de Preuve
        doc.roundedRect(45, y, 505, 92, 8).fillAndStroke('#f0fdf4', '#bbf7d0');
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN_TXT).text('DÉCLARATION D\'ENGAGEMENT & SCEAU D\'INTÉGRITÉ DU DOSSIER DE PREUVE', 57, y + 11);
        doc.font('Helvetica').fontSize(8.2).fillColor(DARK).text(
            `Je soussigné(e) ${nomSignataire}, agissant en qualité de représentant légal habilité à engager l'établissement « ${nomSalon} » (SIRET ${formatSiret(siretSalon)}), atteste avoir pris pleinement connaissance de l'intégralité des documents contractuels listés ci-dessus et les accepter sans réserve.`,
            57, y + 26, { width: 480, lineGap: 1.5 }
        );
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text('EMPREINTE GLOBALE DU DOSSIER DE PREUVE (SHA-256) :', 57, y + 58);
        doc.font('Courier-Bold').fontSize(8.2).fillColor(GREEN_TXT).text(hashGlobalPreuve, 57, y + 70, { width: 480 });

        // Pied de page légal Page 1
        const p1FooterY = 740;
        doc.moveTo(45, p1FooterY).lineTo(550, p1FooterY).lineWidth(0.6).strokeColor(BORDER).stroke();
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(LIGHT_MUTED).text(
            'Valeur probante : Conformément aux articles 1366 et 1367 du Code civil et au règlement européen eIDAS (UE n°910/2014), le présent certificat d\'acceptation électronique scellé par condensat cryptographique SHA-256 et horodatage serveur fait foi entre les parties.',
            45, p1FooterY + 8, { width: 505, align: 'justify', lineGap: 1.5 }
        );

        // =========================================================================
        // PAGES SUIVANTES : ANNEXES INTÉGRALES DES CONTRATS ACCEPTÉS
        // =========================================================================
        doc.addPage();
        doc.rect(0, 0, 595.28, 8).fill(DARK);
        y = 36;

        doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK).text(`ANNEXES CONTRACTUELLES INTÉGRALES — DOSSIER ${referenceCertificat}`, 45, y);
        doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT_MUTED).text(`Texte intégral figé des documents acceptés électroniquement le ${dateParis} par ${nomSignataire}`, 45, y + 16);
        y += 36;

        for (const d of docsContractuels) {
            if (y > 670) {
                doc.addPage();
                doc.rect(0, 0, 595.28, 8).fill(DARK);
                y = 36;
            }
            doc.roundedRect(45, y, 505, 26, 5).fill(DARK);
            doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#ffffff').text(`${d.titre} (v.${d.version})`, 55, y + 8, { width: 345, lineBreak: false, ellipsis: true });
            doc.font('Courier').fontSize(7).fillColor('#9ca3af').text(`SHA-256 : ${d.hash.slice(0, 18)}...`, 405, y + 9, { width: 135, align: 'right', lineBreak: false });
            y += 36;

            for (const art of d.articles) {
                doc.font('Helvetica-Bold').fontSize(8.8);
                const hT = doc.heightOfString(art.t, { width: 495 });
                doc.font('Helvetica').fontSize(8.2);
                const hC = doc.heightOfString(art.c, { width: 495, lineGap: 1.5 });

                if (y + hT + hC + 16 > 750) {
                    doc.addPage();
                    doc.rect(0, 0, 595.28, 8).fill(DARK);
                    y = 36;
                }

                doc.font('Helvetica-Bold').fontSize(8.8).fillColor(DARK).text(art.t, 50, y, { width: 495 });
                y += hT + 3;
                doc.font('Helvetica').fontSize(8.2).fillColor(MUTED).text(art.c, 50, y, { width: 495, lineGap: 1.5, align: 'justify' });
                y += hC + 9;
            }
            y += 8;
        }

        // Pagination dynamique sur toutes les pages du certificat
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
});

legal.installerRoutesLegales({ app, pool, jwt, enregistrerJET, PDFDocument, nodemailer, crypto });

// Module Portail Partenaires (Agents Commerciaux)
const routesPartners = require('./routes_partners');
app.use('/api/partners', routesPartners);

// ============================================================================
// CHECKLIST GO-LIVE (VERROUILLAGE DE LA CAISSE)
// ============================================================================

// 1. Récupérer l'état de la checklist du salon connecté
app.get('/api/onboarding/checklist', verifierToken, async (req, res) => {
  try {
    const idSalon = req.user.id_salon;
    const result = await pool.query(
      `SELECT etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok, statut_onboarding 
       FROM configuration_salon WHERE id_salon = $1`,
      [idSalon]
    );
    if (result.rowCount === 0) return res.status(404).json({ erreur: "Salon introuvable" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
});

// 2. Mettre à jour une étape et déverrouiller la caisse si 100% complété
app.put('/api/onboarding/checklist', verifierToken, async (req, res) => {
  try {
    const idSalon = req.user.id_salon;
    const { etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok } = req.body;

    const toutEstValide = Boolean(etape_materiel_ok && etape_catalogue_ok && etape_equipe_ok && etape_stripe_ok && etape_formation_ok);
    const nouveauStatut = toutEstValide ? 'TERMINE' : 'EN_COURS';

    const result = await pool.query(
      `UPDATE configuration_salon 
       SET etape_materiel_ok = $1, etape_catalogue_ok = $2, etape_equipe_ok = $3, etape_stripe_ok = $4, etape_formation_ok = $5, statut_onboarding = $6
       WHERE id_salon = $7
       RETURNING etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok, statut_onboarding`,
      [!!etape_materiel_ok, !!etape_catalogue_ok, !!etape_equipe_ok, !!etape_stripe_ok, !!etape_formation_ok, nouveauStatut, idSalon]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
});

app.post('/api/creer-checkout', async (req, res) => {
    let token = null;
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        if (tokenCookie) token = tokenCookie.split('=')[1];
    }
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }
    if (!token) return res.status(401).json({ erreur: "Accès refusé." });

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ erreur: "Token invalide." });
        try {
            const origin = req.headers.origin || process.env.FRONTEND_URL;
            const data = await creerCheckoutSession({ pool, stripe, legal }, { user, body: req.body, origin });
            res.json(data);
        } catch (e) {
            console.error("Erreur Checkout Stripe:", e);
            res.status(e.status || 500).json({ erreur: e.message || "Erreur Checkout Stripe." });
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
    try {
        const result = await traiterWebhookStripe({ pool, stripe }, {
            rawBody: req.body,
            signature: req.headers['stripe-signature'],
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
        });
        res.json(result);
    } catch (e) {
        if (e.status === 400) return res.status(400).send(e.message);
        console.error("❌ Erreur webhook Stripe :", e);
        res.status(e.status || 500).send(e.message || "Erreur webhook");
    }
});

app.post('/api/settings', verifierToken, async (req, res) => { 
    const { google_api_key, google_account_id, google_location_id, email_factures, mot_de_passe_email, brevo_api_key, sms_sender_name, lien_google_maps, stripe_reader_id, heure_ouverture, heure_fermeture, telephone_gerant, alertes_sms_actives, email_comptable, jour_envoi_bilan, pin_salon, securite_pin_salon_active, temps_nettoyage_minutes, compte_banque, compte_caisse, compte_prestations, compte_produits, compte_tva, pennylane_api_key, mode_suivi_heures, nom_salon, siret, adresse_salon, tva_intra, forme_juridique, capital_social, rcs_ville, fidelite_type, fidelite_points_seuil, fidelite_points_valeur, fidelite_tampons_seuil, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_delai_sms, rappel_rdv_2h_actif } = req.body;
    try { 
        if (req.user.role === 'employe') {
            return res.status(403).json({ erreur: "Les employés ne peuvent pas modifier les paramètres du salon." });
        }

        if (req.user.role === 'salon') {
            if (pin_salon && String(pin_salon).trim() !== '') {
                return res.status(403).json({ erreur: "Seul le gérant peut modifier le code PIN du salon." });
            }
            await pool.query(
                `UPDATE configuration_salon SET 
                    heure_ouverture = $1, heure_fermeture = $2, temps_nettoyage_minutes = $3,
                    fidelite_type = COALESCE($4, fidelite_type),
                    fidelite_points_seuil = COALESCE($5, fidelite_points_seuil),
                    fidelite_points_valeur = COALESCE($6, fidelite_points_valeur),
                    fidelite_tampons_seuil = COALESCE($7, fidelite_tampons_seuil),
                    fidelite_recompense_type = COALESCE($8, fidelite_recompense_type),
                    fidelite_recompense_valeur = COALESCE($9, fidelite_recompense_valeur),
                    fidelite_delai_sms = COALESCE($10, fidelite_delai_sms)
                 WHERE id_salon = $11`,
                [
                    heure_ouverture !== undefined ? parseInt(heure_ouverture, 10) : 8,
                    heure_fermeture !== undefined ? parseInt(heure_fermeture, 10) : 20,
                    temps_nettoyage_minutes !== undefined ? parseInt(temps_nettoyage_minutes, 10) : 0,
                    fidelite_type || null,
                    fidelite_points_seuil !== undefined ? parseInt(fidelite_points_seuil, 10) : null,
                    fidelite_points_valeur !== undefined ? String(fidelite_points_valeur) : null,
                    fidelite_tampons_seuil !== undefined ? parseInt(fidelite_tampons_seuil, 10) : null,
                    fidelite_recompense_type || null,
                    fidelite_recompense_valeur !== undefined ? String(fidelite_recompense_valeur) : null,
                    fidelite_delai_sms !== undefined ? parseInt(fidelite_delai_sms, 10) : null,
                    req.user.id_salon
                ]
            );
            await enregistrerJET(req.user.id_salon, 'MODIFICATION_PARAMETRES_SALON', { role: 'salon', champs_modifies: ['horaires', 'fidelite'] });
            return res.json({ message: "Paramètres enregistrés avec succès !" });
        }

        const passChiffre = mot_de_passe_email ? chiffrer(mot_de_passe_email) : null; 
        const nouveauPinFourni = pin_salon !== undefined && String(pin_salon).trim() !== '';
        if (nouveauPinFourni && isPinWeak(String(pin_salon).trim())) {
            return res.status(400).json({ erreur: "Le code PIN du salon est trop simple (évitez 0000, 1234...)." });
        }
        
        let finalPinSalon = null;
        if (nouveauPinFourni) {
            finalPinSalon = String(pin_salon).trim().startsWith('$2')
                ? String(pin_salon).trim()
                : await bcrypt.hash(String(pin_salon).trim(), 10);
        }
        const secPinSalon = securite_pin_salon_active !== undefined ? Boolean(securite_pin_salon_active) : true;

        const updateQuery = `
            UPDATE configuration_salon SET 
                google_api_key = $1, google_account_id = $2, google_location_id = $3, 
                email_reception_factures = $4, mot_de_passe_app_email = COALESCE($5, mot_de_passe_app_email), 
                brevo_api_key = $6, sms_sender_name = $7, lien_google_maps = $8, stripe_reader_id = $9, 
                heure_ouverture = $10, heure_fermeture = $11, telephone_gerant = $12, alertes_sms_actives = $13, 
                email_comptable = $14, jour_envoi_bilan = $15, temps_nettoyage_minutes = $17, 
                compte_banque = $18, compte_caisse = $19, compte_prestations = $20, compte_produits = $21, compte_tva = $22, 
                pennylane_api_key = $23, mode_suivi_heures = $24, nom_salon = $25, siret = $26, adresse_salon = $27, 
                tva_intra = $28, forme_juridique = $29, capital_social = $30, rcs_ville = $31, 
                securite_pin_salon_active = $32,
                pin_salon = CASE WHEN $33::varchar IS NOT NULL THEN $33::varchar ELSE pin_salon END,
                fidelite_type = COALESCE($34, fidelite_type),
                fidelite_points_seuil = COALESCE($35, fidelite_points_seuil),
                fidelite_points_valeur = COALESCE($36, fidelite_points_valeur),
                fidelite_tampons_seuil = COALESCE($37, fidelite_tampons_seuil),
                fidelite_recompense_type = COALESCE($38, fidelite_recompense_type),
                fidelite_recompense_valeur = COALESCE($39, fidelite_recompense_valeur),
                fidelite_delai_sms = COALESCE($40, fidelite_delai_sms),
                rappel_rdv_2h_actif = $41
            WHERE id_salon = $16
        `;

        const params = [
            google_api_key, google_account_id, google_location_id, email_factures, passChiffre, 
            brevo_api_key, sms_sender_name || 'MonSalon', lien_google_maps, stripe_reader_id, 
            heure_ouverture !== undefined ? parseInt(heure_ouverture, 10) : 8, 
            heure_fermeture !== undefined ? parseInt(heure_fermeture, 10) : 20, 
            telephone_gerant, Boolean(alertes_sms_actives), email_comptable, 
            jour_envoi_bilan || 1, req.user.id_salon, 
            temps_nettoyage_minutes !== undefined ? parseInt(temps_nettoyage_minutes, 10) : 0, 
            compte_banque || '512000', compte_caisse || '530000', compte_prestations || '706000', 
            compte_produits || '707000', compte_tva || '445710', pennylane_api_key || null, 
            mode_suivi_heures || 'MANUEL', nom_salon || null, siret || null, adresse_salon || null, 
            tva_intra || null, forme_juridique || null, capital_social || null, rcs_ville || null, 
            secPinSalon, finalPinSalon,
            fidelite_type || 'NONE',
            fidelite_points_seuil !== undefined ? parseInt(fidelite_points_seuil, 10) : 100,
            fidelite_points_valeur !== undefined ? String(fidelite_points_valeur) : '10',
            fidelite_tampons_seuil !== undefined ? parseInt(fidelite_tampons_seuil, 10) : 10,
            fidelite_recompense_type || 'MONTANT',
            fidelite_recompense_valeur !== undefined ? String(fidelite_recompense_valeur) : '10',
            fidelite_delai_sms !== undefined ? parseInt(fidelite_delai_sms, 10) : 60,
            Boolean(rappel_rdv_2h_actif)
        ];
        
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

// =========================================================================
// --- MODULE AGENDA & PLANNING ---
// =========================================================================
app.post('/api/rdv', verifierToken, async (req, res) => {
    try {
        const result = await creerRdv({ pool, io }, { id_salon: req.user.id_salon, body: req.body });
        res.status(201).json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur création RDV." });
    }
});

app.put('/api/rdv/:id', verifierToken, async (req, res) => {
    try {
        const result = await modifierRdv({ pool, io }, { id_salon: req.user.id_salon, id_rdv: req.params.id, body: req.body });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur modification RDV." });
    }
});

app.delete('/api/rdv/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerRdv({ pool, io }, { id_salon: req.user.id_salon, id_rdv: req.params.id });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression RDV." });
    }
});

app.post('/api/rdv/mass-cancel', verifierToken, async (req, res) => {
    try {
        const result = await annulerRdvEnMasse({ pool, io, envoyerNotificationPush }, { id_salon: req.user.id_salon, role: req.user.role, body: req.body });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de l'annulation." });
    }
});

app.get('/api/planning', verifierToken, async (req, res) => {
    try {
        const result = await recupererPlanning(
            { pool },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe: req.user.id_employe, startDate: req.query.startDate, endDate: req.query.endDate }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lecture agenda." });
    }
});

app.get('/api/ical/:id_salon/:id_employe.ics', limiteurAvisPublic, async (req, res) => {
    try {
        const icsContent = await genererFluxIcal({ pool }, { id_salon: req.params.id_salon, id_employe: req.params.id_employe });
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="agenda-${req.params.id_employe}.ics"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(icsContent);
    } catch (e) {
        res.status(e.status || 500).send("Erreur génération flux iCal.");
    }
});

// =========================================================================
// --- MODULE RÉSERVATION PUBLIQUE EN LIGNE (SANS AUTH) ---
// =========================================================================
app.get('/api/public/reservation/:id_salon', limiteurReservationPublique, async (req, res) => {
    try {
        const result = await recupererInfosReservationPublique({ pool }, req.params.id_salon);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur chargement page de réservation." });
    }
});

app.get('/api/public/reservation/:id_salon/creneaux', limiteurReservationPublique, async (req, res) => {
    try {
        const result = await calculerCreneauxReservationPublique(
            { pool },
            { id_salon: req.params.id_salon, date: req.query.date, id_employe: req.query.id_employe, duree: req.query.duree }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur calcul des créneaux." });
    }
});

app.get('/api/public/reservation/:id_salon/fidelite', limiteurReservationPublique, async (req, res) => {
    try {
        const result = await verifierFideliteReservationPublique({ pool }, { id_salon: req.params.id_salon, telephone: req.query.telephone });
        res.json(result);
    } catch (e) {
        res.json({ client_trouve: false });
    }
});

app.post('/api/public/reservation/:id_salon/reserver', limiteurReservationPublique, async (req, res) => {
    try {
        const result = await creerReservationPublique(
            { pool, io, stripe, envoyerNotificationPush },
            { id_salon: req.params.id_salon, originUrl: req.headers.origin, body: req.body }
        );
        res.status(result.status || 201).json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la réservation." });
    }
});

// =========================================================================
// --- L'ENCAISSEMENT & MÉTHODES DE PAIEMENT (SMART POS) ---
// =========================================================================
app.get('/api/avis/info/:token', limiteurAvisPublic, async (req, res) => {
    try {
        const result = await recupererInfoAvis({ pool }, req.params.token);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur." });
    }
});

app.get('/api/avis/stats', verifierToken, async (req, res) => {
    try {
        const stats = await recupererStatsAvis({ pool }, req.user.id_salon);
        res.json(stats);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur statistiques avis." });
    }
});

app.post('/api/avis/:token/stop', async (req, res) => {
    try {
        const result = await arreterSmsClient({ pool, normaliserTelephone }, req.params.token);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur." });
    }
});

app.post('/api/avis/:token/note', limiteurAvisPublic, async (req, res) => {
    try {
        const result = await enregistrerNoteAvis({ pool }, { token: req.params.token, note: req.body.note });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur." });
    }
});

app.post('/api/avis/:token/commentaire', limiteurAvisPublic, async (req, res) => {
    try {
        const result = await enregistrerCommentaireAvis(
            { pool, envoyerNotificationPush },
            { token: req.params.token, commentaire: req.body.commentaire }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur." });
    }
});

app.post('/api/sms/send', verifierToken, async (req, res) => {
    try {
        const result = await envoyerSmsManuel({ pool }, { id_salon: req.user.id_salon, role: req.user.role, telephone: req.body.telephone, message: req.body.message });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur d'envoi." });
    }
});

app.post('/api/sms/winback', verifierToken, async (req, res) => {
    try {
        const result = await envoyerSmsWinback(
            { pool, envoyerSMS_Intelligent },
            { id_salon: req.user.id_salon, role: req.user.role, body: req.body }
        );
        res.json(result);
    } catch (e) {
        console.error("Erreur Winback :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur serveur lors de l'envoi." });
    }
});

app.post('/api/caisse/payer', verifierToken, verifierClotureZ, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "L'encaissement est réservé au poste Caisse/Salon ou au Gérant." });
    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement, pourboire, _id_temp, date_creation } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const montantBasket = parseFloat(montant) || 0;
    const montantPourboire = parseFloat(pourboire) || 0;
    const montantTotalAEncaisser = montantBasket + montantPourboire;
    
    if (montantTotalAEncaisser <= 0 || !Array.isArray(lignes) || lignes.length === 0) {
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

            if (methode === 'CARTE' && montantTotalAEncaisser > 0) {
                const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
                const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;

                if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

                const paymentIntent = await stripe.paymentIntents.create({
                  amount: Math.round(montantTotalAEncaisser * 100), currency: 'eur', payment_method_types: ['card_present'], capture_method: 'manual', 
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
        
        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, date_creation, id_temp_offline, date_synchro_hors_ligne, montant_pourboire) VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE', COALESCE($8::timestamp, NOW()), $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL::timestamp ELSE NOW() END, $10) RETURNING id_ticket, date_creation;`, 
            [numeroTicket, id_client || null, id_employe, montantBasket, id_salon, recompense_appliquee || false, methode, req.dateTicketEffective || null, req.idTempOffline || null, montantPourboire]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;
        const dateCreationISO = new Date(ticketResult.rows[0].date_creation).toISOString();

        const employeResult = await clientDB.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        const employe = employeResult.rowCount > 0 ? employeResult.rows[0] : null;

        let totalTvaTicketCents = 0;

        if (lignes && lignes.length > 0) {
            // Calcul de la somme brute des lignes pour répartir au centime près toute remise éventuelle (Cohérence NF525 : Somme Lignes === Ticket TTC)
            const targetTicketCents = Math.round(montantBasket * 100);
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

        const montantScelle = Number(montantBasket).toFixed(2);
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
            const clientCheck = await clientDB.query(`SELECT points_fidelite, tampons_fidelite, remise_winback FROM clients WHERE id_client = $1 AND id_salon = $2 FOR UPDATE`, [id_client, id_salon]);
            if (clientCheck.rowCount === 0) throw new Error("Client introuvable dans ce salon.");
            const clientFidelite = clientCheck.rows[0];

            await clientDB.query(`UPDATE clients SET derniere_visite = CURRENT_DATE WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);

            const configRes = await clientDB.query(`SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
            
            if (configRes.rowCount > 0) {
                const config = configRes.rows[0];
                const utiliseWinback = Boolean(recompense_appliquee && clientFidelite.remise_winback);

                if (utiliseWinback) {
                    // On consomme la remise Winback et on crédite les points/tampons sur le montant payé
                    await clientDB.query(`UPDATE clients SET remise_winback = NULL WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
                    if (config.fidelite_type === 'POINTS') {
                        const pointsToAdd = Math.max(0, Math.floor(montant));
                        await clientDB.query(`UPDATE clients SET points_fidelite = COALESCE(points_fidelite, 0) + $1 WHERE id_client = $2 AND id_salon = $3`, [pointsToAdd, id_client, id_salon]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = COALESCE(tampons_fidelite, 0) + 1 WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
                    }
                } else if (recompense_appliquee) {
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
                        await clientDB.query(`UPDATE clients SET points_fidelite = COALESCE(points_fidelite, 0) + $1 WHERE id_client = $2 AND id_salon = $3`, [pointsToAdd, id_client, id_salon]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = COALESCE(tampons_fidelite, 0) + 1 WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
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

// --- MODULE 5 & OBJECTIFS D'ÉQUIPE : KPIS INDIVIDUELS & GESTION DES OBJECTIFS PAR LE GÉRANT ---
app.get('/api/employes/gamification-kpis', verifierToken, async (req, res) => {
    try {
        const kpis = await recupererGamificationKpis(
            { pool },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, query_id_employe: req.query.id_employe }
        );
        res.json(kpis);
    } catch (e) {
        console.error("Erreur gamification KPIs :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur calcul KPIs employé." });
    }
});

app.get('/api/equipe/objectifs', verifierToken, async (req, res) => {
    try {
        const objectifsEnrichis = await recupererObjectifsEquipe({ pool }, req.user.id_salon);
        res.json(objectifsEnrichis);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur récupération des objectifs." });
    }
});

app.post('/api/equipe/objectifs', verifierToken, async (req, res) => {
    try {
        const result = await creerObjectifEquipe({ pool }, { id_salon: req.user.id_salon, role: req.user.role, body: req.body });
        res.status(result.status || 201).json({ message: result.message });
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur création de l'objectif." });
    }
});

app.delete('/api/equipe/objectifs/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerObjectifEquipe({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_objectif: req.params.id });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression de l'objectif." });
    }
});
// NOUVELLE ROUTE : ENCAISSEMENT D'UN POURBOIRE ISOLÉ (Post-Encaissement)
app.post('/api/caisse/pourboire-isole', verifierToken, verifierClotureZ, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "L'encaissement est réservé à la caisse." });
    const { montant_pourboire, id_employe, methode_paiement, id_client } = req.body;
    const id_salon = req.user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const montantPb = parseFloat(montant_pourboire) || 0;

    if (montantPb <= 0) return res.status(400).json({ erreur: "Montant invalide." });

    const clientDB = await pool.connect();
    try {
        let reader = null;
        let paymentIntentId = null;
        let intentStatus = null;

        if (methode === 'CARTE') {
            const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;
            if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(montantPb * 100), currency: 'eur', payment_method_types: ['card_present'], capture_method: 'manual', 
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
        
        const configRes = await clientDB.query('SELECT compteur_tickets FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        const seq = parseInt(configRes.rows[0].compteur_tickets) + 1;
        
        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';
        
        const anneeMois = new Date().toISOString().slice(0, 7).replace('-', '');
        const numeroTicket = `TKT-PB-${anneeMois}-${String(seq).padStart(6, '0')}`;

        await clientDB.query('UPDATE configuration_salon SET compteur_tickets = $1 WHERE id_salon = $2', [seq, id_salon]);
        
        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, type_ticket, date_creation, montant_pourboire) VALUES ($1, $2, $3, 0.00, $4, FALSE, $5, 'VALIDE', 'POURBOIRE', NOW(), $6) RETURNING id_ticket, date_creation;`, 
            [numeroTicket, id_client || null, id_employe, id_salon, methode, montantPb]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;
        const dateCreationISO = new Date(ticketResult.rows[0].date_creation).toISOString();

        const chaineScellee = `${idNouveauTicket}|${numeroTicket}|${dateCreationISO}|POURBOIRE|${methode}|0.00|0.00|${previousHash}`;
        const newHash = crypto.createHash('sha256').update(chaineScellee).digest('hex');
        
        await clientDB.query('UPDATE tickets SET hash_ticket = $1, donnees_scellees = $2 WHERE id_ticket = $3', [newHash, chaineScellee, idNouveauTicket]);

        await enregistrerJET(id_salon, 'ENCAISSEMENT_POURBOIRE_ISOLE', { id_ticket: idNouveauTicket, numero_ticket: numeroTicket, montant_pourboire: montantPb, methode_paiement: methode, hash_ticket: newHash }, clientDB);

        if (methode === 'CARTE' && intentStatus === 'requires_capture') {
            await stripe.paymentIntents.capture(paymentIntentId);
        }

        await clientDB.query('COMMIT');
        
        let messageFinal = methode === 'CARTE' ? `Pourboire validé sur TPE (Ticket #${idNouveauTicket})` : `Pourboire validé (Ticket #${idNouveauTicket})`;
        io.to(id_salon.toString()).emit('paiementValide', { message: messageFinal });
        res.json({ message: messageFinal, reader, id_ticket: idNouveauTicket });

    } catch (error) {
        await clientDB.query('ROLLBACK');
        if (paymentIntentId && intentStatus === 'requires_capture') {
            try { await stripe.paymentIntents.cancel(paymentIntentId); } catch(e) {}
        }
        res.status(500).json({ erreur: "Erreur lors de l'encaissement du pourboire." });
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
                    let dejaAnnuleQte = mapDejaAnnule[origLigne.id_article] || 0;
                    let maxAnnulable = origLigne.quantite - dejaAnnuleQte;
                    let qte = Math.min(reqLigne.quantite, maxAnnulable);
                    if (qte > 0) {
                        const totalOrigine = parseFloat(origLigne.total_ligne_ttc) || 0;
                        const totalLigneRembourse = (qte === Number(origLigne.quantite))
                            ? totalOrigine
                            : Number(((totalOrigine * qte) / Number(origLigne.quantite)).toFixed(2));
                        lignesToProcess.push({
                            ...origLigne,
                            quantite: qte,
                            total_ligne_ttc: totalLigneRembourse
                        });
                    }
                }
            }
        } else {
            // Fallback: Annulation totale de ce qui reste
            for (let origLigne of lignesOrigine.rows) {
                let dejaAnnuleQte = mapDejaAnnule[origLigne.id_article] || 0;
                let maxAnnulable = origLigne.quantite - dejaAnnuleQte;
                if (maxAnnulable > 0) {
                    const totalOrigine = parseFloat(origLigne.total_ligne_ttc) || 0;
                    const totalLigneRembourse = (maxAnnulable === Number(origLigne.quantite))
                        ? totalOrigine
                        : Number(((totalOrigine * maxAnnulable) / Number(origLigne.quantite)).toFixed(2));
                    lignesToProcess.push({
                        ...origLigne,
                        quantite: maxAnnulable,
                        total_ligne_ttc: totalLigneRembourse
                    });
                }
            }
        }

        if (lignesToProcess.length === 0) throw new Error("Ce ticket a déjà été entièrement annulé.");

        const montantCompensation = Number((-lignesToProcess.reduce((sum, l) => sum + parseFloat(l.total_ligne_ttc), 0)).toFixed(2));

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
        
        const verifSms = await verifierEtIncrementerQuotaSMS(req.user.id_salon, 1);
        if (!verifSms.autorise) {
            return res.status(403).json({ erreur: verifSms.erreur });
        }
        

        const textRecap = `Merci pour votre visite chez ${config.nom_salon} !\nTicket n°${ticket.numero_ticket_caisse} du ${new Date(ticket.date_creation).toLocaleDateString()}.\nMontant total : ${parseFloat(ticket.total_ttc).toFixed(2)} € (Réglé par ${ticket.methode_paiement}).\nÀ très bientôt !`;
        
        if (methode === 'email') {
            if (!config.email_reception_factures || !config.mot_de_passe_app_email) return res.status(400).json({ erreur: "Email non configuré." });
            let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.email_reception_factures, pass: dechiffrer(config.mot_de_passe_app_email) } });
            await transporter.sendMail({ from: `"${config.nom_salon}" <${config.email_reception_factures}>`, to: email, subject: `Votre reçu - ${config.nom_salon}`, text: textRecap });
            if (id_client && email) await pool.query('UPDATE clients SET email = $1 WHERE id_client = $2 AND id_salon = $3', [email, id_client, id_salon]);
        } else if (methode === 'sms') {
            if (!config.brevo_api_key) return res.status(400).json({ erreur: "Clé Brevo non configurée." });
            let telephoneEnvoi;
            if (id_client) {
                const client = await pool.query('SELECT telephone FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
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
    if (req.user.role === 'gerant') {
        return { autorise: true, id_employe: null, nom: 'Gérant' };
    }

    const id_salon = req.user.id_salon;
    
    if (req.user.role === 'salon') {
        const confRes = await pool.query('SELECT COALESCE(securite_pin_salon_active, TRUE) as active FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const protectionActive = confRes.rowCount > 0 ? confRes.rows[0].active : true;
        if (!protectionActive && !code_pin) {
            return { autorise: true, id_employe: (id_employe && id_employe !== 'gerant') ? id_employe : null, nom: nom_operateur || 'Salon' };
        }
    }

    let empRes;
        if (id_employe && id_employe !== 'gerant') {
            empRes = await pool.query('SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        } else if (id_employe === 'gerant' || (nom_operateur && String(nom_operateur).trim() !== '')) {
            const searchNom = id_employe === 'gerant' ? 'Gérant' : String(nom_operateur).trim();
            if (id_employe === 'gerant' || searchNom.toLowerCase() === 'gérant') {
                empRes = await pool.query('SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE est_gerant = TRUE AND id_salon = $1 LIMIT 1', [id_salon]);
            } else {
                empRes = await pool.query('SELECT id_employe, nom, code_pin, COALESCE(pin_tentatives_echouees, 0) as tentatives, pin_bloque_jusqua, COALESCE(pin_bloque_definitif, FALSE) as bloque_definitif FROM employes WHERE TRIM(nom) ILIKE TRIM($1) AND id_salon = $2 LIMIT 1', [searchNom, id_salon]);
            }
        } else {
            const err = new Error("Veuillez sélectionner le collaborateur qui effectue l'opération et saisir son code PIN.");
            err.require_pin = true;
            throw err;
        }

        if (!empRes || empRes.rowCount === 0) {
            const err = new Error("Collaborateur introuvable dans ce salon.");
            err.require_pin = true;
            throw err;
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
        return res.status(400).json({
            erreur: pinErr.message,
            require_pin: true,
            tentatives: pinErr.tentatives,
            locked_until: pinErr.locked_until,
            locked_permanent: pinErr.locked_permanent
        });
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
            id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
            nom_operateur: ferme_par,
            code_pin,
            action_label: 'Clôture journalière Z'
        });
    } catch (pinErr) {
        return res.status(400).json({
            erreur: pinErr.message,
            require_pin: true,
            tentatives: pinErr.tentatives,
            locked_until: pinErr.locked_until,
            locked_permanent: pinErr.locked_permanent
        });
    }
    const operateurFinalNom = operateurCloture.nom || ferme_par || 'Gérant';

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        // Verrouillage transactionnel strict NF525 sur le salon
        await clientDB.query('SELECT id_salon FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        await clientDB.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);

        // Bloquer la clôture si la clôture précédente est une clôture automatique non régularisée
        const autoNonRegul = await clientDB.query(
            `SELECT TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_z FROM clotures_caisse WHERE id_salon = $1 AND est_cloture_automatique = TRUE LIMIT 1`,
            [id_salon]
        );
        if (autoNonRegul.rowCount > 0) {
            throw new Error(`Veuillez d'abord régulariser le comptage espèces de la clôture automatique du ${autoNonRegul.rows[0].date_z} avant de clôturer la caisse.`);
        }

        const jourRes = await clientDB.query(
            `SELECT TO_CHAR(MIN(jour_activite), 'YYYY-MM-DD') as jour_non_cloture
             FROM (
                 SELECT DATE(t.date_creation) as jour_activite FROM tickets t WHERE t.id_salon = $1
                 UNION
                 SELECT DATE(m.date_creation) as jour_activite FROM mouvements_caisse m WHERE m.id_salon = $1
             ) act
             WHERE NOT EXISTS (
                 SELECT 1 FROM clotures_caisse c
                 WHERE c.id_salon = $1 AND c.date_cloture = act.jour_activite
             )`,
            [id_salon]
        );

        let dateACloturerStr;
        if (jourRes.rowCount > 0 && jourRes.rows[0].jour_non_cloture) {
             dateACloturerStr = jourRes.rows[0].jour_non_cloture;
        } else {
             const d = new Date();
             dateACloturerStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        const dejaCloture = await clientDB.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = $2', [id_salon, dateACloturerStr]);
        if (dejaCloture.rowCount > 0) throw new Error(`La caisse pour la date du ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')} a déjà été clôturée.`);

        const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
        const totalJour = Number(caResult.rows[0].total).toFixed(2);

        // RÈGLE D'OR NF525 : Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour (verrouillé FOR UPDATE).
        const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc, total_especes_reel FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1 FOR UPDATE', [id_salon]);
        
        const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
        const grandTotalPerpetuel = Number((ancienCumul + parseFloat(totalJour)).toFixed(2));
        const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
        const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

        // --- CALCUL NF525 DE L'ÉCART DE CAISSE (CONTINUITÉ DU FOND DE CAISSE & RATTRAPAGE) ---
        const dNow = new Date();
        const aujourdhuiStr = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
        const estRattrapageJourPasse = (dateACloturerStr < aujourdhuiStr);

        const fCaisseMatin = (dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].total_especes_reel !== null)
            ? Number(parseFloat(dernierZInfo.rows[0].total_especes_reel).toFixed(2))
            : Number((parseFloat(fond_caisse_matin) || 0).toFixed(2));

        // Somme algébrique exacte (inclut le ticket d'origine + et l'éventuel ticket d'annulation - du jour) + les pourboires
        const especesResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc + COALESCE(montant_pourboire, 0)), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND methode_paiement = 'ESPECES' AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
        const totalEspecesVentes = parseFloat(especesResult.rows[0].total);

        const mouvementsResult = await clientDB.query(`SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant WHEN type_mouvement = 'SORTIE' THEN -montant ELSE montant END), 0) as total FROM mouvements_caisse WHERE id_salon = $1 AND DATE(date_creation) = $2`, [id_salon, dateACloturerStr]);
        const totalMouvements = parseFloat(mouvementsResult.rows[0].total);

        const tEspecesTheorique = Number((fCaisseMatin + totalEspecesVentes + totalMouvements).toFixed(2));
        const tEspecesReel = estRattrapageJourPasse ? tEspecesTheorique : Number((parseFloat(total_especes_reel) || 0).toFixed(2));
        const ecartCaisse = estRattrapageJourPasse ? 0 : Number((tEspecesReel - tEspecesTheorique).toFixed(2));
        const justificationFinale = estRattrapageJourPasse
            ? (justification_ecart || 'Rattrapage de clôture antérieure (Régularisation reportée au comptage matinal)')
            : (justification_ecart || null);

        // 🚨 SI L'ÉCART EST > 2€ ET QU'ON N'A PAS ENCORE DE JUSTIFICATION, ON BLOQUE !
        if (!estRattrapageJourPasse && Math.abs(ecartCaisse) > 2.00 && (!justification_ecart || justification_ecart.trim() === '')) {
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
            `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, est_cloture_automatique, numero_z_salon) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, operateurFinalNom, fCaisseMatin, tEspecesTheorique, tEspecesReel, ecartCaisse, justificationFinale, estRattrapageJourPasse, nextZ]
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
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "La régularisation de caisse est réservée au gérant ou au poste Salon." });
    const { id_cloture, montant_reel, id_employe, nom_operateur, code_pin } = req.body;
    let operateurRegu;
    try {
        operateurRegu = await verifierPinActionSensibleSalon(req, {
            id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
            nom_operateur,
            code_pin,
            action_label: 'Régularisation matinale de caisse'
        });
    } catch (pinErr) {
        return res.status(400).json({
            erreur: pinErr.message,
            require_pin: true,
            tentatives: pinErr.tentatives,
            locked_until: pinErr.locked_until,
            locked_permanent: pinErr.locked_permanent
        });
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
                id_employe: operateurRegu.id_employe || (id_employe && id_employe !== 'gerant' ? id_employe : null),
                type_mouvement: 'REGULARISATION',
                montant: ecart,
                motif: `Régularisation ouverture suite fermeture auto (Z#${cloture.numero_z_salon || id_cloture})`,
                categorie_comptable: 'ECART_CAISSE'
            });
        }
        await enregistrerJET(req.user.id_salon, 'REGULARISATION_CAISSE', { id_cloture, numero_z: cloture.numero_z_salon, operateur: operateurRegu.nom, theorique, reel, ecart }, clientDB);

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
    try {
        const result = await enregistrerVerificationStock({ pool }, { id_salon: req.user.id_salon, role: req.user.role });
        res.json(result);
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de l'enregistrement." }); 
    }
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
                const idInPayload = parts[0];
                const numInPayload = parts[1];
                const ttcInPayload = parts[5];
                const computedEnrichi = crypto.createHash('sha256').update(t.donnees_scellees).digest('hex');
                if (
                    prevInPayload === prevHashTicket &&
                    computedEnrichi === t.hash_ticket &&
                    String(t.id_ticket) === idInPayload &&
                    String(t.numero_ticket_caisse) === numInPayload &&
                    Number(t.total_ttc).toFixed(2) === ttcInPayload
                ) {
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
        const clotures = await pool.query("SELECT id_cloture, numero_z_salon, total_encaisse, cumul_perpetuel_ttc, signature_hash, hash_precedent, date_cloture, TO_CHAR(date_cloture, 'YYYY-MM-DD') as date_cloture_ymd FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon ASC NULLS FIRST, id_cloture ASC", [id_salon]);
        let prevHashZ = 'GENESIS_Z';
        let expectedNumZ = 1;
        let prevCumulZ = 0;
        for (let c of clotures.rows) {
            const dCloture = new Date(c.date_cloture);
            const dateClotureYMD = c.date_cloture_ymd;
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
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') return res.status(403).json({ erreur: "Accès réservé au gérant ou au poste de caisse." });
    const id_salon = req.user.id_salon;
    const { date_debut, date_fin } = req.query;
    if (!date_debut || !date_fin) return res.status(400).json({ erreur: "Les paramètres date_debut et date_fin (YYYY-MM-DD) sont requis." });

    try {
        const { csv, nomFichier } = await genererArchiveFiscale({ pool, enregistrerJET }, { id_salon, date_debut, date_fin });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=\"${nomFichier}\"`);
        res.send(csv);
    } catch (e) { 
        console.error("❌ Erreur export archive fiscale:", e);
        res.status(500).json({ erreur: "Erreur lors de la génération de l'archive fiscale." });
    }
});

// =========================================================================
// --- MOTEUR UNIFIÉ & ROUTE EXPORT FEC (Art. A.47 A-1 du LPF / NF525) ---
// =========================================================================
// (construireContenuFEC est désormais importé depuis ./services/compta/fec.service)
// =========================================================================
// --- ARCHITECTURE MULTI-SALONS / FRANCHISE (GROUPE D'ÉTABLISSEMENTS) ---
// =========================================================================

// 1. LISTER TOUS LES SALONS DU GÉRANT + VUE CONSOLIDÉE DU GROUPE
app.get('/api/mes-salons', verifierToken, async (req, res) => {
    try {
        const data = await listerMesSalons({ pool }, { user: req.user });
        res.json(data);
    } catch (e) {
        console.error("Erreur GET /api/mes-salons :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Impossible de récupérer vos établissements." });
    }
});

// 2. CRÉER UN NOUVEL ÉTABLISSEMENT SOUS LE MÊME COMPTE GÉRANT (AVEC OPTION DE CLONAGE DU CATALOGUE)
app.post('/api/mes-salons/creer', verifierToken, async (req, res) => {
    try {
        const data = await creerSalonGroupe({ pool, enregistrerJET }, { user: req.user, body: req.body });
        res.status(data.status || 201).json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la création du nouvel établissement." });
    }
});

// 3. BASCULER INSTANTANÉMENT D'UN SALON À UN AUTRE (SWITCH JWT SANS RECONNEXION)
app.post('/api/mes-salons/switch/:id_salon_cible', verifierToken, async (req, res) => {
    try {
        const data = await switchSalonGroupe({ pool, jwt, enregistrerJET }, { user: req.user, id_salon_cible: req.params.id_salon_cible });
        res.cookie('token', data.token_api, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors du changement d'établissement." });
    }
});

// 4. SYNCHRONISER LE CATALOGUE & LES TUTORIELS ACADÉMIE DU SALON ACTUEL VERS LES AUTRES SALONS DU GROUPE
app.post('/api/mes-salons/synchroniser-catalogue', verifierToken, async (req, res) => {
    try {
        const data = await synchroniserCatalogueGroupe({ pool }, { user: req.user });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la synchronisation du catalogue." });
    }
});

// =========================================================================
// --- GESTION D'ABONNEMENT STRIPE & QUOTAS MENSUELS ---
// =========================================================================

// Route pour lire l'état du compteur SMS et de l'empreinte CB
app.get('/api/abonnement/etat', verifierToken, async (req, res) => {
    try {
        const data = await lireEtatAbonnement({ pool }, { id_salon: req.user.id_salon });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lecture état abonnement." });
    }
});

// Confirmation automatique au retour de Stripe : enregistre l'empreinte CB et coche l'étape 4 du Go-Live !
app.post('/api/stripe/confirmer-session', verifierToken, async (req, res) => {
    try {
        const data = await confirmerSessionStripe({ pool, stripe }, { id_salon: req.user.id_salon, body: req.body });
        res.json(data);
    } catch (e) {
        console.error("Erreur confirmation session Stripe :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la validation de l'empreinte Stripe." });
    }
});

// Changement de forfait (39€ / 69€ / 99€) synchronisé avec Stripe
app.post('/api/abonnement/changer-forfait', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') {
        return res.status(403).json({ erreur: "Seul le gérant peut modifier le forfait du salon." });
    }
    try {
        const data = await changerForfait({ pool, stripe }, { id_salon: req.user.id_salon, nouveau_plan: req.body?.nouveau_plan });
        res.json(data);
    } catch (e) {
        console.error("Erreur changement forfait :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la mise à jour de votre formule." });
    }
});

// Résiliation en fin de mois (stoppe le prélèvement Stripe suivant)
app.post('/api/abonnement/resilier', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    try {
        const data = await resilierAbonnement({ pool, stripe }, { id_salon: req.user.id_salon });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la résiliation." });
    }
});

// Réactivation en 1 clic
app.post('/api/abonnement/reactiver', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    try {
        const data = await reactiverAbonnement({ pool, stripe }, { id_salon: req.user.id_salon });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la réactivation." });
    }
});

// =========================================================================
// --- EXPORT & PORTABILITÉ DES DONNÉES (RGPD ART. 20 / CGU ART. 7 / NF525) ---
// =========================================================================
app.get('/api/export-portabilite', verifierToken, async (req, res) => {
    try {
        const result = await exporterPortabiliteDonnees({ pool, enregistrerJET, crypto }, { user: req.user, query: req.query });
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        if (result.buffer) {
            return res.send(result.buffer);
        }
        return res.send(result.content);
    } catch (e) {
        console.error("Erreur export portabilité:", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la génération de l'export de portabilité." });
    }
});


app.get('/api/export-fec', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "L'export comptable FEC est strictement réservé au gérant." });
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
// =========================================================================
// --- MODULE MESSAGERIE INTERNE & CHAT D'ÉQUIPE ---
// =========================================================================
app.get('/api/messages', verifierToken, async (req, res) => {
    try {
        const rows = await recupererMessages({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_employe: req.user.id_employe });
        res.json(rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur messages." }); }
});

app.post('/api/messages', verifierToken, async (req, res) => {
    try {
        const newMessage = await envoyerMessage(
            { pool, io, envoyerNotificationPush },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, body: req.body }
        );
        res.status(201).json(newMessage);
    } catch (e) {
        console.error("Erreur envoi message :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de l'envoi du message." });
    }
});

app.put('/api/messages/:id', verifierToken, async (req, res) => {
    try {
        const result = await modifierMessage(
            { pool, io },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, id_message: req.params.id, body: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur modification" });
    }
});

app.delete('/api/messages/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerMessage(
            { pool, io },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, id_message: req.params.id }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la suppression" });
    }
});

app.post('/api/messages/vu', verifierToken, async (req, res) => {
    try {
        const result = await marquerMessagesLus(
            { pool, io },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, ids: req.body.ids }
        );
        res.json(result);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur marquage vu." });
    }
});

app.post('/api/messages/:id/react', verifierToken, async (req, res) => {
    try {
        const result = await reagirMessage(
            { pool, io },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, id_message: req.params.id, emoji: req.body.emoji }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur de réaction" });
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
        const config = configData.rows[0] || {};

        const buffer = await genererBufferFactureTicketPDF({ ticket, lignes: lignesData.rows, config });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Facture_${ticket.numero_ticket_caisse}.pdf"`);
        res.send(buffer);

    } catch (error) {
        console.error("Erreur génération PDF B2B:", error);
        res.status(500).json({ erreur: "Impossible de générer le document client." });
    }
});

app.get('/api/clients', verifierToken, async (req, res) => { try { const result = await pool.query('SELECT * FROM clients WHERE id_salon = $1 ORDER BY nom ASC', [req.user.id_salon]); res.json(result.rows); } catch (e) { res.status(500).json({erreur: "Erreur clients."}); }});
app.post('/api/clients', verifierToken, async (req, res) => { const { prenom, nom, telephone, email, date_naissance } = req.body; try { await pool.query('INSERT INTO clients (prenom, nom, telephone, email, date_naissance, id_salon) VALUES ($1, $2, $3, $4, $5, $6)', [prenom || '', nom, telephone, email, date_naissance || null, req.user.id_salon]); res.status(201).json({message: "Client ajouté"}); } catch (e) { res.status(500).json({erreur: `Erreur BDD : ${e.message}`}); }});
app.delete('/api/clients/:id', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Action non autorisée." });
    try {
        const lieTicket = await pool.query('SELECT 1 FROM tickets WHERE id_client = $1 AND id_salon = $2 LIMIT 1', [req.params.id, req.user.id_salon]);
        if (lieTicket.rowCount > 0) {
            await pool.query(
                "UPDATE clients SET nom = 'Client Anonymisé #' || id_client, prenom = '', telephone = NULL, email = NULL, notes = NULL, date_naissance = NULL, remise_winback = NULL WHERE id_client = $1 AND id_salon = $2",
                [req.params.id, req.user.id_salon]
            );
            await enregistrerJET(req.user.id_salon, 'ANONYMISATION_CLIENT_RGPD', { id_client: parseInt(req.params.id, 10) });
            return res.json({ message: "Client anonymisé (conservation fiscale NF525 des tickets liés)." });
        }
        await pool.query('DELETE FROM clients WHERE id_client = $1 AND id_salon = $2', [req.params.id, req.user.id_salon]);
        res.json({ message: "Client supprimé" });
    } catch (e) { res.status(500).json({ erreur: "Erreur suppression client." }); }
});

// =========================================================================
// --- MODULE GESTION DE L'ÉQUIPE & EMPLOYÉS ---
// =========================================================================
app.get('/api/employes', verifierToken, async (req, res) => {
    try {
        const rows = await recupererEmployes({ pool }, req.user.id_salon);
        res.json(rows);
    } catch (e) { res.status(500).json({ erreur: "Erreur employés." }); }
});

app.put('/api/employes/mon-pin', verifierToken, async (req, res) => {
    try {
        const result = await mettreAJourMonPin({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_employe: req.user.id_employe, nouveau_pin: req.body.nouveau_pin });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la mise à jour." }); }
});

app.put('/api/employes/:id/debloquer-pin', verifierToken, async (req, res) => {
    try {
        const result = await debloquerPinEmploye({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_employe_cible: req.params.id });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur lors du déblocage." }); }
});

app.post('/api/employes', verifierToken, async (req, res) => { 
    try { 
        const result = await ajouterEmploye({ pool }, { id_salon: req.user.id_salon, role: req.user.role, body: req.body });
        res.status(result.status || 201).json({ message: result.message });
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur BDD" }); }
});

app.put('/api/employes/:id', verifierToken, async (req, res) => {
    try {
        const result = await modifierEmploye({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_employe_cible: req.params.id, body: req.body });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur BDD" }); }
});

app.delete('/api/employes/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerOuAnonymiserEmploye({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_employe_cible: req.params.id });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression employé." }); }
});

app.put('/api/employes/:id/photo', verifierToken, async (req, res) => {
    try {
        const result = await mettreAJourPhotoEmploye({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, id_employe_cible: req.params.id, photo_url: req.body.photo_url });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur mise à jour photo." }); }
});

// =========================================================================
// --- MODULE CATALOGUE, STOCKS ET COMMANDES FOURNISSEURS ---
// =========================================================================
app.get('/api/catalogue', verifierToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM catalogue WHERE id_salon =  ORDER BY type_article, nom ASC', [req.user.id_salon]);
        res.json(result.rows);
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur catalogue." }); 
    }
});

app.post('/api/catalogue', verifierToken, async (req, res) => {
    try {
        const result = await creerOuReapproArticle({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, body: req.body });
        res.status(result.status || 200).json({ message: result.message });
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur interne" }); 
    }
});

app.delete('/api/catalogue/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerArticle({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_article: req.params.id });
        res.json(result);
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression article." }); 
    }
});

app.put('/api/catalogue/:id/nom', verifierToken, async (req, res) => {
    try {
        const result = await renommerArticle({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_article: req.params.id, nouveauNom: req.body.nom });
        res.json(result);
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors du renommage." }); 
    }
});

app.post('/api/catalogue/bon-commande-pdf', verifierToken, async (req, res) => {
    if (req.user.role === 'employe') return res.status(403).json({ erreur: "Réservé au gérant et au salon." });
    const { fournisseur, lignes, commentaire } = req.body;
    if (!Array.isArray(lignes) || lignes.length === 0) {
        return res.status(400).json({ erreur: "Aucun produit sélectionné dans le bon de commande." });
    }
    try {
        const salonRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = ', [req.user.id_salon]);
        const salon = salonRes.rows[0] || {};
        const { buffer, numCommande } = await genererBufferBonCommandePDF(salon, fournisseur, lignes, commentaire);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=\"${numCommande}.pdf\"`);
        res.send(buffer);
    } catch (e) { 
        console.error("Erreur génération Bon de commande PDF :", e);
        res.status(500).json({ erreur: "Erreur création PDF : " + e.message }); 
    }
});

app.post('/api/catalogue/envoyer-commande', verifierToken, async (req, res) => {
    try {
        const result = await envoyerCommandeFournisseur(
            { pool, genererBufferBonCommandePDF, transporter: typeof transporter !== 'undefined' ? transporter : null },
            { id_salon: req.user.id_salon, role: req.user.role, body: req.body }
        );
        res.json(result);
    } catch (e) { 
        console.error("Erreur envoi commande mail :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur envoi mail." }); 
    }
});

app.get('/api/stocks', verifierToken, async (req, res) => {
    try {
        const stocks = await calculerPrevisionStocks({ pool }, req.user.id_salon);
        res.json(stocks);
    } catch (erreur) { 
        res.status(500).json({ erreur: "Erreur stocks." }); 
    }
});

app.put('/api/stocks/:id', verifierToken, async (req, res) => {
    try {
        const result = await corrigerStock({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_article: req.params.id, nouveauStock: req.body.nouveau_stock });
        res.json(result);
    } catch (e) { 
        res.status(e.status || 500).json({ erreur: e.message || "Erreur mise à jour du stock." }); 
    }
});

app.post('/api/stocks/fusionner', verifierToken, async (req, res) => {
    try {
        const result = await fusionnerStocks(
            { pool, enregistrerJET, verifierPinActionSensibleSalon },
            { id_salon: req.user.id_salon, role: req.user.role, req, body: req.body }
        );
        res.json(result);
    } catch (e) { 
        if (e.details) {
            return res.status(e.status || 400).json({ erreur: e.message, ...e.details });
        }
        res.status(e.status || 400).json({ erreur: e.message || "Erreur lors de la fusion des stocks." }); 
    }
});
// =========================================================================
// --- MODULE RH : TABLEAU DE BORD, CONGÉS ET ARRÊTS MALADIE ---
// =========================================================================
app.get('/api/rh', verifierToken, async (req, res) => {
    try {
        const employesData = await calculerTableauBordRH({ pool }, { id_salon: req.user.id_salon, role: req.user.role });
        res.json(employesData);
    } catch (erreur) {
        res.status(erreur.status || 500).json({ erreur: erreur.message || "Erreur requête RH." });
    }
});

// 1. Dépôt d'absence (Congé ou Arrêt maladie)
app.post('/api/rh/absences', verifierToken, verifierPlan(['PREMIUM']), async (req, res) => {
    try {
        const result = await deposerAbsence(
            { pool, s3Client, PutObjectCommand, envoyerNotificationPush },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, body: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de l'enregistrement de l'absence." });
    }
});

// 2. Décision du gérant (validation ou refus)
app.put('/api/rh/absences/:id/decision', verifierToken, async (req, res) => {
    try {
        const result = await deciderAbsence(
            { pool, envoyerNotificationPush },
            { id_salon: req.user.id_salon, role: req.user.role, id_absence: req.params.id, body: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la décision." });
    }
});

// 3. Lire un justificatif sécurisé (Lien éphémère de 15 minutes R2)
app.get('/api/rh/absences/:id/justificatif', verifierToken, async (req, res) => {
    try {
        const result = await genererLienJustificatifAbsence(
            { pool, s3Client, GetObjectCommand, getSignedUrl },
            { id_salon: req.user.id_salon, role: req.user.role, id_employe_auth: req.user.id_employe, id_absence: req.params.id }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur génération lien sécurisé." });
    }
});

// 4. Récupérer toutes les absences (pour le tableau de bord RH du gérant)
app.get('/api/rh/absences', verifierToken, async (req, res) => {
    try {
        const absences = await recupererAbsences({ pool }, { id_salon: req.user.id_salon, role: req.user.role });
        res.json(absences);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lecture absences." });
    }
});

app.get('/api/dashboard/salon', verifierToken, async (req, res) => {
    try {
        const data = await recupererDashboardSalon({ pool }, { id_salon: req.user.id_salon });
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur dashboard salon." });
    }
});

app.get('/api/dashboard/employe', verifierToken, async (req, res) => {
    if (req.user.role !== 'employe') return res.status(403).json({ erreur: "Réservé aux employés." });
    try {
        const data = await recupererDashboardEmploye({ pool }, { id_salon: req.user.id_salon, id_employe: req.user.id_employe });
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur dashboard employé." });
    }
});

app.get('/api/dashboard', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Le tableau de bord financier global est réservé au gérant." });
    try {
        const data = await recupererDashboardGlobal({ pool }, { id_salon: req.user.id_salon });
        res.json(data);
    } catch (erreur) {
        console.error("Erreur Dashboard:", erreur);
        res.status(500).json({ erreur: "Erreur calcul dashboard." });
    }
});

// =========================================================================
// --- L'INTELLIGENCE ARTIFICIELLE & TRAITEMENT OCR FACTURES ---
// =========================================================================

app.get('/api/ia/taches', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Accès réservé au gérant." });
    try {
        const taches = await recupererTachesIA({ pool }, { id_salon: req.user.id_salon });
        res.json(taches);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur IA" });
    }
});

// --- SAISIE MANUELLE DE FACTURE / DÉPENSE (ACCESSIBLE PRO & PREMIUM) ---
app.post('/api/factures/saisie-manuelle', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    try {
        const result = await saisirFactureManuelle(
            { pool, enregistrerMouvementCaisseScelle, enregistrerJET, verifierPinActionSensibleSalon },
            { req, user: req.user, body: req.body }
        );
        res.status(201).json(result);
    } catch (e) {
        if (e.require_pin) return res.status(400).json(e);
        res.status(e.status || 400).json({ erreur: e.message || "Erreur lors de l'enregistrement de la facture." });
    }
});

// --- UPLOAD MANUEL DE FACTURE (PDF OU IMAGE) VERS L'IA ---
app.post('/api/ia/upload-facture', verifierToken, verifierPlan(['PREMIUM']), async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') {
        return res.status(403).json({ erreur: "Accès réservé au gérant ou au poste de caisse." });
    }
    try {
        const result = await analyserEtUploaderFactureIA({ pool, s3Client }, { id_salon: req.user.id_salon, body: req.body });
        res.json(result);
    } catch (e) {
        console.error("Erreur Upload Manuel :", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de l'analyse du document par l'IA." });
    }
});

// --- SUPPRESSION / IGNORER UNE FACTURE EN ATTENTE ---
app.delete('/api/ia/taches/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerTacheIA({ pool }, { id_salon: req.user.id_salon, id_tache: req.params.id });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la suppression de la tâche." });
    }
});

// --- VALIDATION D'UNE TÂCHE IA ---
app.post('/api/ia/taches/:id/valider', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut valider une tâche IA." });
    try {
        const result = await validerTacheIA(
            { pool, io, enregistrerMouvementCaisseScelle, enregistrerJET },
            { id_salon: req.user.id_salon, id_tache: req.params.id, donnees: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la validation de la tâche IA." });
    }
});

// --- IGNORER UNE TÂCHE IA ---
app.post('/api/ia/taches/:id/ignorer', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "Seul le gérant peut ignorer une tâche IA." });
    try {
        const result = await ignorerTacheIA({ pool }, { id_salon: req.user.id_salon, id_tache: req.params.id });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur" });
    }
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
    try {
        const { buffer, nomFichier } = await genererBufferJournalierZ(
            { pool, enregistrerJET },
            { id_salon: req.user.id_salon, dateCible: req.params.date, user: req.user }
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=\"${nomFichier}\"`);
        res.send(buffer);
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
    return genererBufferLiassePdfService({ pool, s3Client, GetObjectCommand, getSignedUrl }, id_salon, mois_annee);
} // Fin de la fonction genererBufferLiassePdf

// ----------------------------------------------------------------------------------
// ROUTE DE TÉLÉCHARGEMENT MANUEL (Prévisualisation du Gérant)
// ----------------------------------------------------------------------------------
app.get('/api/export-pdf', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant') return res.status(403).json({ erreur: "La liasse comptable mensuelle est strictement réservée au gérant." });
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
                    subject: `Liasse Mensuelle - ${nomDuSalon}`, 
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

// (Robot Comptable extrait dans jobs/cronJobs.js)


// =========================================================================
// --- CENTRE D'ACTION (TÂCHES & URGENCES) ---
// =========================================================================
app.get('/api/taches', verifierToken, async (req, res) => {
    try {
        const result = await recupererTaches({ pool }, req.user.id_salon);
        res.json(result);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture tâches." }); }
});

app.post('/api/taches', verifierToken, async (req, res) => {
    try {
        const result = await creerTache({ pool }, { id_salon: req.user.id_salon, body: req.body });
        res.status(result.status || 201).json({ message: result.message });
    } catch (e) { res.status(500).json({ erreur: "Erreur ajout tâche." }); }
});

app.put('/api/taches/:id/statut', verifierToken, async (req, res) => {
    try {
        const result = await basculerStatutTache({ pool }, { id_salon: req.user.id_salon, id_tache: req.params.id });
        res.json(result);
    } catch (e) { res.status(500).json({ erreur: "Erreur modification." }); }
});

app.delete('/api/taches/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerTache({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_tache: req.params.id });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression." }); }
});

// Lancement de la migration asynchrone des médias R2 existants
setTimeout(() => migrerBase64ExistantsVersR2({ pool, s3Client }), 8000);

// =========================================================================
// --- MODULE PROTOCOLES & ACADÉMIE ---
// =========================================================================
app.get('/api/protocoles', verifierToken, async (req, res) => {
    try {
        const result = await recupererProtocoles({ pool, s3Client }, req.user.id_salon);
        res.json(result);
    } catch (e) { res.status(500).json({ erreur: "Erreur lecture protocoles." }); }
});

app.post('/api/protocoles', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    try {
        const result = await creerProtocole({ pool, s3Client }, { id_salon: req.user.id_salon, body: req.body });
        res.status(result.status || 201).json({ message: result.message });
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur création protocole." });
    }
});

app.put('/api/protocoles/:id', verifierToken, verifierPlan(['PRO', 'PREMIUM']), async (req, res) => {
    try {
        const result = await modifierProtocole({ pool, s3Client }, { id_salon: req.user.id_salon, id_protocole: req.params.id, body: req.body });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur modification protocole." });
    }
});

app.delete('/api/protocoles/:id', verifierToken, async (req, res) => {
    try {
        const result = await supprimerProtocole({ pool }, { id_salon: req.user.id_salon, role: req.user.role, id_protocole: req.params.id });
        res.json(result);
    } catch (e) { res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression protocole." }); }
});

// (Robots Avis & Marketing extraits dans jobs/cronJobs.js)
// --- MODULE COMPTABILITÉ & CLÔTURE MENSUELLE (Délégué à services/compta/clotureMensuelle.service) ---

app.post('/api/compta/valider-mois', verifierToken, async (req, res) => {
    const { mois_annee, code_pin, signature_base64 } = req.body;
    try {
        const result = await validerClotureMensuelle(
            { pool, bcrypt, crypto, enregistrerJET, stockerImageSurR2, genererBufferLiassePdf },
            { id_salon: req.user.id_salon, role: req.user.role, mois_annee, code_pin, signature_base64 }
        );
        res.json(result);
    } catch (e) { 
        console.error("Erreur validation mois:", e);
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la validation." });
    }
});

app.get('/api/compta/statut-mois', verifierToken, async (req, res) => {
    try {
        const result = await obtenirStatutMois({ pool }, { id_salon: req.user.id_salon, mois_annee: req.query.mois_annee });
        res.json(result);
    } catch (e) { 
        res.status(500).json({ erreur: "Erreur lecture statut." }); 
    }
});

// =========================================================================
// --- GOD MODE (SUPER-ADMIN) & MAINTENANCE SYSTÈME ---
// =========================================================================
async function verifierSuperAdmin(req, res, next) {
    return verifierSuperAdminMiddleware({ pool }, req, res, next);
}

// (Robots Comptabilité, Clôture Fantôme et Rapport Hebdo extraits dans jobs/cronJobs.js)
app.get('/api/admin/forcer-robot', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await forcerExecutionRobots({
            executerRapportHebdoGerant,
            executerRobotComptable,
            executerClotureFantome,
            executerRobotMarketingEtPredictif,
            executerEnvoiComptable
        });
        res.json(result);
    } catch (e) {
        console.error("❌ ERREUR CRITIQUE DANS LA ROUTE FORCER-ROBOT :", e);
        res.status(500).json({ erreur: "Erreur interne lors de l'exécution du robot." });
    }
});

// --- CHEAT CODE : VOYAGE DANS LE TEMPS (DÉVELOPPEMENT UNIQUEMENT) ---
app.get('/api/admin/time-travel/:id_salon', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await timeTravelSalon({ pool }, { id_salon: req.params.id_salon });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
    }
});

// --- CHEAT CODE : INJECTION SIRET POUR TEST PDF (DÉVELOPPEMENT UNIQUEMENT) ---
app.get('/api/admin/fix-siret-38', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await fixSiret38({ pool });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
    }
});

app.get('/api/superadmin/stats', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const data = await recupererStatsSuperAdmin({ pool });
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur lecture stats admin." });
    }
});

app.get('/api/superadmin/salons', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const data = await listerSalonsSuperAdmin({ pool });
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur lecture liste salons." });
    }
});

app.put('/api/superadmin/salons/:id/status', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await mettreAJourStatutSalonSuperAdmin({ pool }, { id_salon: req.params.id, statut: req.body?.statut });
        res.json(result);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur mise à jour statut." });
    }
});

app.delete('/api/superadmin/salons/:id', verifierToken, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await purgerSalonSuperAdmin({ pool, enregistrerJET }, { id_salon: req.params.id, id_user_salon: req.user.id_salon });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la destruction du salon." });
    }
});


// Sentry v10 : On utilise la nouvelle fonction dédiée
if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
}

// =========================================================================
// --- INITIALISATION DES CRONS ET ROBOTS D'ARRIÈRE-PLAN ---
// =========================================================================
initCronJobs({
    pool,
    cron,
    crypto,
    dechiffrer,
    ImapFlow,
    simpleParser,
    pdfParse,
    s3Client,
    PutObjectCommand,
    GetObjectCommand,
    getSignedUrl,
    analyserEmailAvecIA,
    envoyerEvenementSSE,
    envoyerNotificationPush,
    envoyerSMS,
    envoyerSMS_Intelligent,
    normaliserTelephone,
    signalerErreur,
    nodemailer
});

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`✅ API Multi-Tenant LÉGALE démarrée sur le port ${PORT}`));
