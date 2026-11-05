const webpush = require('web-push');
const { pool: defaultPool, getVapidKeys } = require('../../config/db');

let pool = defaultPool;
let customWebpush = webpush;

function initNotificationsService(deps = {}) {
    if (deps.pool) pool = deps.pool;
    if (deps.webpush) customWebpush = deps.webpush;
}

const abonnesSSE = new Map();

/**
 * Envoie un événement Server-Sent Events (SSE) aux clients connectés d'un salon
 */
function envoyerEvenementSSE(id_salon, nomEvenement, data = {}) {
    const room = id_salon.toString();
    const clients = abonnesSSE.get(room);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${nomEvenement}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try {
            res.write(payload);
        } catch (e) {
            clients.delete(res);
        }
    }
}

/**
 * Gestionnaire de connexion SSE pour un salon
 */
function gererConnexionSSE(req, res) {
    if (String(req.user.id_salon) !== String(req.params.id_salon) || req.user.role !== 'gerant') {
        return res.status(403).end();
    }
    
    const room = req.params.id_salon;
    req.setTimeout(0);
    res.socket.setTimeout(0);
    res.socket.setNoDelay(true);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    if (!abonnesSSE.has(room)) abonnesSSE.set(room, new Set());
    abonnesSSE.get(room).add(res);
    res.write(`event: connected\ndata: {}\n\n`);

    const heartbeat = setInterval(() => {
        try {
            res.write(`event: heartbeat\ndata: {}\n\n`);
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        abonnesSSE.get(room)?.delete(res);
    });
}

/**
 * Envoie une notification Push Web (VAPID)
 */
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

        const subs = await pool.query(query, params);
        if (subs.rowCount === 0) return;

        for (let sub of subs.rows) {
            try {
                await customWebpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: sub.keys
                }, JSON.stringify(payload));
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                }
            }
        }
    } catch (e) {
        console.error("Erreur d'envoi Push :", e);
    }
}

/**
 * Récupère la clé publique VAPID
 */
function recupererVapidPublicKey(req, res) {
    const { vapidPublicKey } = getVapidKeys();
    res.json({ publicKey: vapidPublicKey });
}

/**
 * Enregistre un abonnement Web Push
 */
async function enregistrerPushSubscription(req, res) {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ erreur: "Données de souscription invalides." });
    }
    const { endpoint, keys } = subscription;
    const id_salon = req.user.id_salon;
    const role = req.user.role;
    const id_employe = role === 'employe' ? req.user.id_employe : null;

    try {
        const exist = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
        if (exist.rowCount === 0) {
            await pool.query(
                'INSERT INTO push_subscriptions (id_salon, role, id_employe, endpoint, keys) VALUES ($1, $2, $3, $4, $5)',
                [id_salon, role, id_employe, endpoint, keys]
            );
        }
        res.status(201).json({ message: "Souscription enregistrée." });
    } catch (e) {
        console.error("Erreur abonnement Push :", e);
        res.status(500).json({ erreur: "Erreur serveur." });
    }
}

const normaliserTelephone = (tel) => String(tel || '').replace(/\D/g, '').slice(-9);

async function envoyerSMS(apiKey, senderName, telephone, contenu) {
    try {
        const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                type: 'transactional',
                unicodeEnabled: false,
                sender: (senderName || 'LeSalon').substring(0, 11),
                recipient: telephone,
                content: contenu
            })
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
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                type: 'transactional',
                unicodeEnabled: false,
                sender: (senderName || 'LeSalon').substring(0, 11),
                recipient: telephone,
                content: contenu
            })
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

module.exports = {
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
};
