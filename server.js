console.log("Étape 1 : Démarrage du script...");
require('dotenv').config();

console.log("Étape 2 : Chargement des modules...");
const express = require('express');
const cors = require('cors');    
const { pool, initDatabaseSchema } = require('./config/db');
const {
    initAuthService,
    chiffrer,
    dechiffrer,
    isPinWeak,
    generateUIToken,
    verifierToken,
    verifierPlan,
    authLimiter,
    limiteurAvisPublic,
    limiteurReservationPublique,
    inscrireSalon,
    connecterGerant,
    connecterEmployePin,
    connecterSalonPin,
    demanderReinitialisationMdp,
    reinitialiserMdp,
    deconnecterUtilisateur
} = require('./services/auth/auth.service');
const {
    initNotificationsService,
    abonnesSSE,
    envoyerEvenementSSE,
    gererConnexionSSE,
    envoyerNotificationPush,
    recupererVapidPublicKey,
    enregistrerPushSubscription,
    normaliserTelephone,
    envoyerSMS,
    envoyerSMS_Intelligent
} = require('./services/notifications/notifications.service');
const {
    initSettingsService,
    recupererChecklistOnboarding,
    mettreAJourChecklistOnboarding,
    recupererConfigurationSalon,
    mettreAJourConfigurationSalon,
    uploaderGalerieSalon,
    supprimerElementGalerie
} = require('./services/settings/settings.service');
const {
    initClientsService,
    recupererClients,
    creerClient,
    supprimerClient,
    recupererHistoriqueClient,
    mettreAJourNotesClient
} = require('./services/clients/clients.service');
const {
    creerMiddlewareSSOSandbox,
    creerMiddlewareCertificatLegalPDF
} = require('./services/pdf/legalAcceptancePdf.service'); 
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
const multer = require('multer');
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
    process.exit(1);
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
app.options(/.*/, cors(corsOptions));

app.post('/api/logout', (req, res) => {
    res.json(deconnecterUtilisateur(res));
});

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

app.get('/api/events/:id_salon', (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
}, verifierToken, gererConnexionSSE);

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

// Initialisation des Schémas BDD et Services Transverses
initDatabaseSchema({ webpush });
initAuthService({ pool });
initNotificationsService({ pool, webpush });
initSettingsService({ pool });
initClientsService({ pool });

// Initialisation du service Caisse & Smart POS NF525
initCaisseService({ pool, io, stripe, envoyerNotificationPush });

const verifierClotureZ = creerVerifierClotureZMiddleware({ pool });

app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const result = await inscrireSalon({ pool, stripe, jwt, generateUIToken }, { body: req.body, res });
        res.status(result.status || 201).json(result.data || result);
    } catch (err) {
        res.status(err.status || 400).json({ erreur: err.message });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const data = await connecterGerant({ pool, jwt, generateUIToken, enregistrerJET }, { body: req.body, res });
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ erreur: err.message || "Erreur serveur." });
    }
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
    try {
        const data = await connecterEmployePin({ pool, jwt, generateUIToken, enregistrerJET }, { body: req.body, res });
        res.json(data);
    } catch (err) {
        res.status(err.status || 400).json({
            erreur: err.message,
            tentatives: err.tentatives,
            locked_until: err.locked_until,
            locked_permanent: err.locked_permanent
        });
    }
});

app.post('/api/salon/login-pin', authLimiter, async (req, res) => {
    try {
        const data = await connecterSalonPin({ pool, jwt, generateUIToken, enregistrerJET }, { body: req.body, res });
        res.json(data);
    } catch (err) {
        res.status(err.status || 401).json({ erreur: err.message });
    }
});

app.post('/api/forgot-password', authLimiter, async (req, res) => {
    try {
        const data = await demanderReinitialisationMdp({ pool, jwt, nodemailer }, { body: req.body });
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ erreur: err.message || "Erreur lors de l'envoi." });
    }
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
    try {
        const data = await reinitialiserMdp({ pool, jwt }, { body: req.body });
        res.json(data);
    } catch (err) {
        res.status(err.status || 400).json({ erreur: err.message || "Lien expiré, déjà utilisé ou falsifié." });
    }
});

// Middleware SSO Sandbox & Bypass du popup légal pour les salons DEMO et VIDE
app.use(creerMiddlewareSSOSandbox({ pool, jwt, legal }));

// Interception et Refonte "STACK Executive" du Certificat d'Acceptation Électronique
app.use(creerMiddlewareCertificatLegalPDF({ pool, PDFDocument, jwt, crypto }));

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
        const data = await recupererChecklistOnboarding({ pool }, req.user.id_salon);
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
    }
});

// 2. Mettre à jour une ou plusieurs étapes de la checklist
app.put('/api/onboarding/checklist', verifierToken, async (req, res) => {
    try {
        const data = await mettreAJourChecklistOnboarding({ pool }, { id_salon: req.user.id_salon, body: req.body });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
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
app.get('/api/push/vapid-key', recupererVapidPublicKey);
app.post('/api/push/subscribe', verifierToken, enregistrerPushSubscription);

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
    try {
        const data = await mettreAJourConfigurationSalon({ pool, enregistrerJET }, { user: req.user, body: req.body });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
    }
});

app.get('/api/settings', verifierToken, async (req, res) => { 
    try {
        const data = await recupererConfigurationSalon({ pool }, req.user);
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message });
    }
});

// --- GESTION VITRINE & GALERIE DU SALON (LOGO & JUSQU'À 5 PHOTOS VERS CLOUDFLARE R2) ---
const uploadGalerie = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5 Mo par image
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error("Seules les images (PNG, JPG, WEBP) sont acceptées."));
        }
    }
});

const handleUploadGalerieMiddleware = (req, res, next) => {
    uploadGalerie.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ erreur: "L'image dépasse la limite maximale autorisée (5 Mo)." });
            }
            return res.status(400).json({ erreur: `Erreur téléversement : ${err.message}` });
        } else if (err) {
            return res.status(400).json({ erreur: err.message });
        }
        next();
    });
};

app.put('/api/parametres/galerie', verifierToken, handleUploadGalerieMiddleware, async (req, res) => {
    try {
        const { type } = req.body;
        const result = await uploaderGalerieSalon(
            { pool, s3Client, PutObjectCommand },
            { id_salon: req.user.id_salon, role: req.user.role, type, file: req.file }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors du téléversement du visuel." });
    }
});

app.delete('/api/parametres/galerie', verifierToken, async (req, res) => {
    try {
        const { type, index, url } = req.body;
        const result = await supprimerElementGalerie(
            { pool },
            { id_salon: req.user.id_salon, role: req.user.role, type, index, url }
        );
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur lors de la suppression du visuel." });
    }
});

app.get('/api/clients/:id/history', verifierToken, async (req, res) => {
    try {
        const data = await recupererHistoriqueClient({ pool }, { id_salon: req.user.id_salon, id_client: req.params.id });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: "Erreur lors de la récupération de l'historique." });
    }
});

app.put('/api/clients/:id/notes', verifierToken, async (req, res) => {
    try {
        const data = await mettreAJourNotesClient({ pool }, { id_salon: req.user.id_salon, id_client: req.params.id, notes: req.body.notes });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: "Erreur lors de la mise à jour des notes." });
    }
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

app.get('/api/clients', verifierToken, async (req, res) => {
    try {
        const data = await recupererClients({ pool }, req.user.id_salon);
        res.json(data);
    } catch (e) {
        res.status(500).json({ erreur: "Erreur clients." });
    }
});

app.post('/api/clients', verifierToken, async (req, res) => {
    try {
        const data = await creerClient({ pool }, { id_salon: req.user.id_salon, body: req.body });
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ erreur: `Erreur BDD : ${e.message}` });
    }
});

app.delete('/api/clients/:id', verifierToken, async (req, res) => {
    try {
        const data = await supprimerClient({ pool, enregistrerJET }, { id_salon: req.user.id_salon, role: req.user.role, id_client: req.params.id });
        res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ erreur: e.message || "Erreur suppression client." });
    }
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
        const result = await pool.query('SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY type_article, nom ASC', [req.user.id_salon]);
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
