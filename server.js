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
const {
    initCaisseService,
    enregistrerJET,
    deduireCategorieMouvement,
    enregistrerMouvementCaisseScelle,
    creerVerifierClotureZMiddleware,
    verifierPinActionSensibleSalon,
    encaisserTicket,
    encaisserPourboireIsole,
    annulerTicketCaisse,
    envoyerTicketCaisse,
    recupererMouvementsJour,
    creerMouvementCaisse,
    cloturerCaisseZ,
    recupererStatutCloture,
    recupererVerificationMatinale,
    regulariserCaisse,
    verifierConformiteNF525,
    recupererLignesTicket
} = require('./services/caisse/caisse.service');
const { genererDossierTechniqueNF525PDF } = require('./services/caisse/dossierNf525Pdf.service');
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

// Initialisation du service Caisse & Smart POS NF525
initCaisseService({ pool, io, stripe, envoyerNotificationPush });

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

const verifierClotureZ = creerVerifierClotureZMiddleware({ pool });

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

// =========================================================================
// --- MODULE CAISSE & SMART POS (NF525) ---
// =========================================================================
app.post('/api/caisse/payer', verifierToken, verifierClotureZ, async (req, res) => {
    try {
        const result = await encaisserTicket(
            { pool, io, stripe, crypto, enregistrerJET },
            { user: req.user, body: req.body, dateTicketEffective: req.dateTicketEffective, idTempOffline: req.idTempOffline }
        );
        res.json(result);
    } catch (error) {
        console.error("Erreur Encaisser:", error);
        res.status(error.status || 500).json({ erreur: "Erreur lors de l'encaissement. " + (error.message || '') });
    }
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
// --- MODULE CAISSE SMART POS & SCELLAGE NF525 ---
app.post('/api/caisse/pourboire-isole', verifierToken, verifierClotureZ, async (req, res) => {
    try {
        const result = await encaisserPourboireIsole(
            { pool, io, stripe, crypto, enregistrerJET },
            { user: req.user, body: req.body }
        );
        res.json(result);
    } catch (error) {
        console.error("Erreur Encaisser Pourboire Isolé:", error);
        res.status(error.status || 500).json({ erreur: "Erreur lors de l'encaissement du pourboire. " + (error.message || '') });
    }
});

app.put('/api/caisse/annuler-ticket/:id', verifierToken, async (req, res) => {
    try {
        const result = await annulerTicketCaisse(
            { pool, crypto, enregistrerJET },
            {
                user: req.user,
                id_ticket: req.params.id,
                motif: req.body.motif,
                lignes_a_annuler: req.body.lignes_a_annuler
            }
        );
        res.json(result);
    } catch (err) {
        console.error("Erreur Annulation Ticket:", err);
        res.status(err.status || 500).json({ erreur: err.message || "Erreur lors de l'annulation." });
    }
});

app.post('/api/caisse/envoyer-ticket', verifierToken, async (req, res) => {
    try {
        const result = await envoyerTicketCaisse(
            { pool, nodemailer, dechiffrer, crypto, normaliserTelephone, verifierEtIncrementerQuotaSMS },
            { user: req.user, body: req.body }
        );
        res.json(result);
    } catch (error) {
        console.error("Erreur envoi ticket:", error);
        res.status(error.status || 500).json({ erreur: error.message || "Erreur lors de l'envoi du ticket." });
    }
});

app.get('/api/caisse/mouvements/aujourdhui', verifierToken, async (req, res) => {
    try {
        const rows = await recupererMouvementsJour({ pool }, req.user.id_salon);
        res.json(rows);
    } catch (e) {
        console.error("Erreur récupération mouvements :", e);
        res.status(500).json({ erreur: "Erreur serveur." });
    }
});

app.post('/api/caisse/mouvements', verifierToken, async (req, res) => {
    try {
        const result = await creerMouvementCaisse(
            { pool, verifierPinActionSensibleSalon, enregistrerMouvementCaisseScelle, enregistrerJET },
            { user: req.user, req, body: req.body }
        );
        res.status(201).json(result);
    } catch (e) {
        res.status(e.status || 400).json({
            erreur: e.message || "Erreur lors de la sauvegarde.",
            require_pin: !!e.require_pin,
            tentatives: e.tentatives,
            locked_until: e.locked_until,
            locked_permanent: e.locked_permanent
        });
    }
});

app.post('/api/caisse/cloture', verifierToken, async (req, res) => {
    try {
        const result = await cloturerCaisseZ(
            { pool, crypto, verifierPinActionSensibleSalon, enregistrerJET },
            { user: req.user, req, body: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({
            erreur: e.message || "Erreur lors de la clôture.",
            require_pin: !!e.require_pin,
            tentatives: e.tentatives,
            locked_until: e.locked_until,
            locked_permanent: e.locked_permanent,
            require_justification: !!e.require_justification,
            ecart: e.ecart
        });
    }
});

app.get('/api/caisse/cloture/statut', verifierToken, async (req, res) => {
    try {
        const statut = await recupererStatutCloture({ pool }, req.user.id_salon);
        res.json(statut);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur vérification du statut de clôture." });
    }
});

app.get('/api/caisse/verification-matinale', verifierToken, async (req, res) => {
    try {
        const verif = await recupererVerificationMatinale({ pool }, req.user.id_salon);
        res.json(verif);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur vérification matinale." });
    }
});

app.post('/api/caisse/regulariser', verifierToken, async (req, res) => {
    try {
        const result = await regulariserCaisse(
            { pool, verifierPinActionSensibleSalon, enregistrerMouvementCaisseScelle, enregistrerJET },
            { user: req.user, req, body: req.body }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({
            erreur: e.message || "Erreur de régularisation.",
            require_pin: !!e.require_pin,
            tentatives: e.tentatives,
            locked_until: e.locked_until,
            locked_permanent: e.locked_permanent
        });
    }
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
// --- AUDIT DE CONFORMITÉ NF525 & DOSSIER TECHNIQUE LÉGAL ---
// =========================================================================
app.get('/api/admin/verifier-nf525', verifierToken, async (req, res) => {
    if (req.user.role !== 'gerant' && req.user.role !== 'salon') return res.status(403).json({ erreur: "Accès refusé." });
    try {
        const rapport = await verifierConformiteNF525({ pool, crypto, enregistrerJET }, req.user.id_salon);
        res.json(rapport);
    } catch (e) {
        console.error("Erreur vérification NF525 :", e);
        res.status(500).json({ erreur: "Erreur lors de la vérification de conformité." });
    }
});

app.get('/api/admin/dossier-technique-nf525/pdf', verifierToken, async (req, res) => {
    try {
        await genererDossierTechniqueNF525PDF(
            { pool, PDFDocument, enregistrerJET },
            { id_salon: req.user.id_salon, role: req.user.role, res }
        );
    } catch (e) {
        console.error("Erreur génération PDF Dossier Technique NF525 :", e);
        if (!res.headersSent) {
            res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la génération du Dossier Technique NF525." });
        }
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
        const data = await recupererLignesTicket({ pool }, { id_salon: req.user.id_salon, id_ticket: req.params.id });
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur lors de la récupération du ticket." });
    }
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
    enregistrerJET,
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
