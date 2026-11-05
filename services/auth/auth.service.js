const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { pool: defaultPool } = require('../../config/db');

let pool = defaultPool;

function initAuthService(deps = {}) {
    if (deps.pool) pool = deps.pool;
}

const ENCRYPTION_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'fallback_secret_for_key_generation', 'salt', 32);
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
    const repeating = /^(\d)\1+$/.test(strPin);
    const sequentialUp = '0123456789'.includes(strPin);
    const sequentialDown = '9876543210'.includes(strPin);
    return repeating || sequentialUp || sequentialDown;
}

function generateUIToken(payload) {
    return Buffer.from(JSON.stringify({ alg: "none" })).toString('base64url') + "." + 
           Buffer.from(JSON.stringify(payload)).toString('base64url') + ".";
}

function verifierToken(req, res, next) {
    const cookieHeader = req.headers.cookie;
    let token = null;
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
                
                if (statutSub !== 'actif' && !isTrialing) { 
                    return res.status(402).json({ erreur: "Paiement requis.", require_payment: true }); 
                }
            }
            req.user = user; 
            next(); 
        } catch (e) { return res.status(500).json({ erreur: "Erreur vérification." }); }
    });
}

const verifierPlan = (plansAutorises) => {
    return (req, res, next) => {
        const plan = req.user.plan_actuel;
        if (plan === 'PREMIUM_TRIAL' || plansAutorises.includes(plan)) {
            return next();
        }
        return res.status(403).json({ erreur: "Accès refusé. Cette fonctionnalité nécessite un forfait supérieur.", require_upsell: true });
    };
};

function verifierSuperAdmin(req, res, next) {
    const email = req.user?.email || '';
    const superAdminList = (process.env.SUPERADMIN_EMAILS || 'admin@stack.fr,valentin@stack.fr')
        .split(',')
        .map(e => e.trim().toLowerCase());

    if (!superAdminList.includes(email.toLowerCase())) {
        return res.status(403).json({ erreur: "Accès réservé au Super-Administrateur de la plateforme." });
    }
    next();
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    keyGenerator: (req) => {
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

/**
 * Inscription d'un nouveau salon / gérant
 */
async function inscrireSalon({ pool: p, stripe, jwt: jwtLib, generateUIToken: uiGen }, { body, res }) {
    const dbPool = p || pool;
    const { email, mot_de_passe, nom_salon, nom_gerant, code_partenaire, siret } = body;
    if (!email || !mot_de_passe) {
        const err = new Error("Email et mot de passe requis.");
        err.status = 400;
        throw err;
    }
    const clientDB = await dbPool.connect();
    try {
        await clientDB.query('BEGIN');
        const exist = await clientDB.query('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
        if (exist.rowCount > 0) throw new Error("Cet email est déjà utilisé.");
        const hash = await bcrypt.hash(mot_de_passe, 10);
        
        let idAgentApporteur = null;
        if (code_partenaire) {
            const agentRes = await clientDB.query('SELECT id_agent FROM partner_agents WHERE code_partenaire = $1', [code_partenaire]);
            if (agentRes.rowCount > 0) {
                idAgentApporteur = agentRes.rows[0].id_agent;
            }
        }

        const salonResult = await clientDB.query(
            "INSERT INTO configuration_salon (nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur, siret) VALUES ($1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL', $2, $3) RETURNING id_salon", 
            [nom_salon || 'Nouveau Salon', idAgentApporteur, siret || null]
        );
        const idNouveauSalon = salonResult.rows[0].id_salon;

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
        if (stripe) {
            try {
                const customer = await stripe.customers.create({ email: email, name: nom_salon });
                customerId = customer.id;
            } catch(e) {}
        }
        await clientDB.query('INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, _customer_id, statut_abonnement) VALUES ($1, $2, $3, $4, $5, $6)', [email, hash, idNouveauSalon, 'gerant', customerId, 'inactif']); 
        
        const defaultPinHash = await bcrypt.hash('0000', 10);
        await clientDB.query("INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)", [nom_gerant || 'Patron', idNouveauSalon, defaultPinHash]);

        await clientDB.query('COMMIT');
        const payload = { id_salon: idNouveauSalon, role: 'gerant', email };
        const token = (jwtLib || jwt).sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000 });
        
        return {
            status: 201,
            data: {
                message: "Inscription réussie",
                ui_token: (uiGen || generateUIToken)(payload),
                token_api: token
            }
        };
    } catch (erreur) {
        await clientDB.query('ROLLBACK');
        throw erreur;
    } finally {
        clientDB.release();
    }
}

/**
 * Connexion du gérant avec email et mot de passe
 */
async function connecterGerant({ pool: p, jwt: jwtLib, generateUIToken: uiGen, enregistrerJET }, { body, res }) {
    const dbPool = p || pool;
    const { email, mot_de_passe } = body;
    const result = await dbPool.query('SELECT id_salon, mot_de_passe_hash, statut_abonnement FROM utilisateurs WHERE email = $1 LIMIT 1', [email]);
    if (result.rowCount === 0) {
        const err = new Error("Aucun compte trouvé avec cet e-mail.");
        err.status = 401;
        throw err;
    }
    const { id_salon, mot_de_passe_hash, statut_abonnement } = result.rows[0];
    const match = await bcrypt.compare(mot_de_passe, mot_de_passe_hash);
    if (!match) {
        if (enregistrerJET) await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { email, raison: 'mot_de_passe_incorrect' });
        const err = new Error("Mot de passe incorrect.");
        err.status = 401;
        throw err;
    }
    const payload = { id_salon, role: 'gerant', email };
    const token = (jwtLib || jwt).sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000 });
    if (enregistrerJET) await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { email, role: 'gerant' });
    return {
        message: "Connexion réussie",
        ui_token: (uiGen || generateUIToken)(payload),
        token_api: token,
        statut_abonnement
    };
}

/**
 * Connexion d'un employé par code PIN (avec paliers de verrouillage NF525)
 */
async function connecterEmployePin({ pool: p, jwt: jwtLib, generateUIToken: uiGen, enregistrerJET }, { body, res }) {
    const dbPool = p || pool;
    const { id_salon, id_employe, nom_employe, code_pin, is_pointeuse } = body;

    let result;
    if (id_employe) {
        result = await dbPool.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
    } else {
        result = await dbPool.query('SELECT * FROM employes WHERE TRIM(nom) ILIKE TRIM($1) AND id_salon = $2 LIMIT 1', [String(nom_employe || ''), id_salon]);
    }
    if (result.rowCount === 0) {
        const err = new Error("Employé introuvable.");
        err.status = 404;
        throw err;
    }
    const emp = result.rows[0];

    // 1. Vérification du blocage définitif
    if (emp.pin_bloque_definitif) {
        const err = new Error(`Accès PIN bloqué définitivement pour ${emp.nom}. Le gérant doit débloquer votre profil dans l'espace Équipe.`);
        err.status = 403;
        err.tentatives = parseInt(emp.pin_tentatives_echouees, 10) || 9;
        err.locked_permanent = true;
        throw err;
    }
    // 2. Vérification du blocage temporaire
    if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
        const minRestantes = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
        const err = new Error(`Code PIN suspendu temporairement pour ${emp.nom}. Réessayez dans ${minRestantes} minute(s).`);
        err.status = 403;
        err.tentatives = parseInt(emp.pin_tentatives_echouees, 10) || 3;
        err.locked_until = emp.pin_bloque_jusqua;
        throw err;
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

        await dbPool.query(
            'UPDATE employes SET pin_tentatives_echouees = $1, pin_bloque_jusqua = $2, pin_bloque_definitif = $3 WHERE id_employe = $4 AND id_salon = $5',
            [nouvellesTentatives, bloqueJusqua, bloqueDefinitif, emp.id_employe, id_salon]
        );
        if (enregistrerJET) {
            await enregistrerJET(id_salon, bloqueDefinitif ? 'PIN_BLOCAGE_DEFINITIF' : 'CONNEXION_ECHOUEE', { nom_employe: emp.nom, tentatives: nouvellesTentatives, is_pointeuse: !!is_pointeuse });
        }
        const err = new Error(`Code PIN incorrect. ${messageSanction}`);
        err.status = 400;
        err.tentatives = nouvellesTentatives;
        err.locked_until = bloqueJusqua;
        err.locked_permanent = bloqueDefinitif;
        throw err;
    }

    // Remise à zéro des tentatives en cas de succès
    if ((emp.pin_tentatives_echouees || 0) > 0 || emp.pin_bloque_jusqua) {
        await dbPool.query('UPDATE employes SET pin_tentatives_echouees = 0, pin_bloque_jusqua = NULL, pin_bloque_definitif = FALSE WHERE id_employe = $1 AND id_salon = $2', [emp.id_employe, id_salon]);
    }

    if (is_pointeuse) {
        return { message: "PIN valide", employe: { id: emp.id_employe, nom: emp.nom } };
    }

    const payload = { id_salon: emp.id_salon, role: 'employe', id_employe: emp.id_employe };
    const token = (jwtLib || jwt).sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 12 * 60 * 60 * 1000 });
    if (enregistrerJET) await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { nom_employe: emp.nom, role: 'employe', id_employe: emp.id_employe });
    return {
        message: "Accès employé autorisé",
        ui_token: (uiGen || generateUIToken)(payload),
        token_api: token,
        employe: { id: emp.id_employe, nom: emp.nom }
    };
}

/**
 * Connexion du mode Salon par PIN
 */
async function connecterSalonPin({ pool: p, jwt: jwtLib, generateUIToken: uiGen, enregistrerJET }, { body, res }) {
    const dbPool = p || pool;
    const { id_salon, pin } = body;
    const result = await dbPool.query('SELECT id_salon, pin_salon FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    if (result.rowCount === 0) {
        const err = new Error("Salon introuvable.");
        err.status = 404;
        throw err;
    }
    const salon = result.rows[0];
    
    let pinMatch = false;
    if (salon.pin_salon && salon.pin_salon.startsWith('$2')) {
        pinMatch = await bcrypt.compare(pin, salon.pin_salon);
    } else {
        pinMatch = (salon.pin_salon === pin);
    }

    if (!salon.pin_salon || !pinMatch) {
        if (enregistrerJET) await enregistrerJET(id_salon, 'CONNEXION_ECHOUEE', { raison: 'pin_salon_incorrect' });
        const err = new Error("Code PIN invalide.");
        err.status = 401;
        throw err;
    }
    const payload = { id_salon: salon.id_salon, role: 'salon' };
    const token = (jwtLib || jwt).sign(payload, process.env.JWT_SECRET, { expiresIn: '18h' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 18 * 60 * 60 * 1000 });
    if (enregistrerJET) await enregistrerJET(id_salon, 'CONNEXION_REUSSIE', { role: 'salon' });
    return {
        message: "Accès salon autorisé",
        ui_token: (uiGen || generateUIToken)(payload),
        token_api: token
    };
}

/**
 * Demande de réinitialisation de mot de passe (envoi d'email sécurisé)
 */
async function demanderReinitialisationMdp({ pool: p, jwt: jwtLib, nodemailer }, { body }) {
    const dbPool = p || pool;
    const { email } = body;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        const err = new Error("Serveur mail non configuré.");
        err.status = 500;
        throw err;
    }
    const result = await dbPool.query('SELECT id_user, mot_de_passe_hash FROM utilisateurs WHERE email = $1', [email]);
    if (result.rowCount === 0) return { message: "Si cet email existe, un lien a été envoyé." };

    const secretUsageUnique = process.env.JWT_SECRET + '_' + result.rows[0].mot_de_passe_hash;
    const resetToken = (jwtLib || jwt).sign({ email, purpose: 'password_reset' }, secretUsageUnique, { expiresIn: '15m' });
    const resetLink = `https://app-salon-caiss.onrender.com/?resetToken=${resetToken}`;
    let transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transporter.sendMail({
        from: `"Support SaaS Caisse" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🔐 Réinitialisation de votre mot de passe',
        html: `<p>Bonjour,</p><p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 15 minutes) :</p><p><a href="${resetLink}">Réinitialiser mon accès</a></p>`
    });
    return { message: "Si cet email existe, un lien a été envoyé." };
}

/**
 * Réinitialisation effective du mot de passe
 */
async function reinitialiserMdp({ pool: p, jwt: jwtLib }, { body }) {
    const dbPool = p || pool;
    const { token, nouveau_mot_de_passe } = body;
    if (!token || !nouveau_mot_de_passe || String(nouveau_mot_de_passe).length < 8) {
        const err = new Error("Un mot de passe d'au moins 8 caractères est requis.");
        err.status = 400;
        throw err;
    }
    const unverified = (jwtLib || jwt).decode(token);
    if (!unverified || !unverified.email || unverified.purpose !== 'password_reset') {
        const err = new Error("Jeton invalide.");
        err.status = 400;
        throw err;
    }
    const userRes = await dbPool.query('SELECT mot_de_passe_hash FROM utilisateurs WHERE email = $1', [unverified.email]);
    if (userRes.rowCount === 0) {
        const err = new Error("Lien expiré ou invalide.");
        err.status = 400;
        throw err;
    }

    const secretUsageUnique = process.env.JWT_SECRET + '_' + userRes.rows[0].mot_de_passe_hash;
    const decoded = (jwtLib || jwt).verify(token, secretUsageUnique);
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await dbPool.query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = $2', [hash, decoded.email]);
    return { message: "Mot de passe mis à jour avec succès !" };
}

/**
 * Déconnexion d'un utilisateur
 */
function deconnecterUtilisateur(res) {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    return { message: "Déconnecté" };
}

module.exports = {
    initAuthService,
    chiffrer,
    dechiffrer,
    isPinWeak,
    generateUIToken,
    verifierToken,
    verifierPlan,
    verifierSuperAdmin,
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
};
