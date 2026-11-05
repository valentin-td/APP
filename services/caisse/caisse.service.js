// services/caisse/caisse.service.js
// Module Caisse Smart POS, Encaissements, Mouvements & Scellement NF525
// Conforme à la norme NF525 (Article 286, I-3° bis du CGI, BOI-TVA-DECLA-30-10-30)

const crypto = require('crypto');
const bcrypt = require('bcrypt');

let defaultPool = null;
let defaultIo = null;
let defaultStripe = null;
let defaultNotificationPush = null;

/**
 * Initialisation optionnelle des dépendances partagées du service caisse
 */
function initCaisseService({ pool, io, stripe, envoyerNotificationPush }) {
    if (pool) defaultPool = pool;
    if (io) defaultIo = io;
    if (stripe) defaultStripe = stripe;
    if (envoyerNotificationPush) defaultNotificationPush = envoyerNotificationPush;
}

/**
 * Journal des Événements Techniques (JET) chaîné cryptographiquement (NF525)
 * Enregistre chaque action sensible de manière immuable avec scellement SHA-256
 */
async function enregistrerJET(id_salon, action, details = {}, dbClient = null) {
    const client = dbClient || defaultPool;
    if (!client) return null;
    try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [parseInt(id_salon) || 0]);
        const dernier = await client.query('SELECT hash_jet FROM jet_logs WHERE id_salon = $1 ORDER BY id_jet DESC LIMIT 1', [id_salon]);
        const hashPrecedent = dernier.rowCount > 0 ? dernier.rows[0].hash_jet : 'GENESIS_JET';
        const dateISO = new Date().toISOString();
        const detailsJSON = JSON.stringify(details || {});
        const hashJet = crypto.createHash('sha256').update(`${id_salon}-${action}-${detailsJSON}-${dateISO}-${hashPrecedent}`).digest('hex');
        await client.query(
            'INSERT INTO jet_logs (id_salon, action, details, date_creation, hash_precedent, hash_jet) VALUES ($1, $2, $3, $4, $5, $6)',
            [id_salon, action, detailsJSON, dateISO, hashPrecedent, hashJet]
        );
        return hashJet;
    } catch (e) {
        return null;
    }
}

/**
 * Déduit la catégorie comptable d'un mouvement d'espèces hors vente
 */
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

/**
 * Enregistre et scelle un mouvement de caisse d'espèces (NF525)
 */
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

/**
 * Middleware Express vérifiant l'état de clôture Z avant encaissement (NF525)
 */
function creerVerifierClotureZMiddleware({ pool }) {
    const dbPool = pool || defaultPool;
    return async (req, res, next) => {
        const id_salon = req.user.id_salon;
        const idTemp = req.body && req.body._id_temp ? String(req.body._id_temp).slice(0, 64) : null;
        try {
            let dateTicket = null;
            if (idTemp) {
                if (req.body.methode_paiement === 'CARTE') return res.status(400).json({ erreur: "Un paiement par carte ne peut pas être enregistré hors-ligne." });
                const doublon = await dbPool.query('SELECT id_ticket FROM tickets WHERE id_salon = $1 AND id_temp_offline = $2', [id_salon, idTemp]);
                if (doublon.rowCount > 0) return res.json({ message: "Ticket déjà synchronisé.", id_ticket: doublon.rows[0].id_ticket, deja_synchronise: true });
                const d = new Date(req.body.date_creation);
                const maintenant = Date.now();
                if (!isNaN(d) && d.getTime() <= maintenant + 5 * 60 * 1000 && d.getTime() >= maintenant - 7 * 24 * 3600 * 1000) {
                    const ferme = await dbPool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = DATE($2::timestamp)', [id_salon, d.toISOString()]);
                    if (ferme.rowCount === 0) dateTicket = d.toISOString();
                }
            }
            // NF525 : Interdiction formelle d'encaisser sur une journée dont le Z est déjà scellé
            const zCibleDejaFait = await dbPool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = DATE(COALESCE($2::timestamp, NOW()))', [id_salon, dateTicket]);
            if (zCibleDejaFait.rowCount > 0) {
                return res.status(423).json({ erreur: "La clôture (Z) d'aujourd'hui a déjà été effectuée. Aucun nouvel encaissement n'est autorisé sur une journée clôturée." });
            }
            req.dateTicketEffective = dateTicket;
            req.idTempOffline = idTemp;
            const jourBloquant = await dbPool.query(
                `SELECT MIN(DATE(t.date_creation)) as jour FROM tickets t WHERE t.id_salon = $1 AND DATE(t.date_creation) < DATE(COALESCE($2::timestamp, NOW())) AND NOT EXISTS (SELECT 1 FROM clotures_caisse c WHERE c.id_salon = t.id_salon AND c.date_cloture = DATE(t.date_creation))`,
                [id_salon, dateTicket]
            );
            if (jourBloquant.rowCount > 0 && jourBloquant.rows[0].jour) {
                return res.status(423).json({ erreur: `Clôture (Z) manquante pour le ${new Date(jourBloquant.rows[0].jour).toLocaleDateString('fr-FR')}. Effectuez la clôture avant d'encaisser.`, z_manquant: jourBloquant.rows[0].jour });
            }
            next();
        } catch (e) {
            res.status(500).json({ erreur: "Erreur vérification clôture." });
        }
    };
}

/**
 * Vérification du code PIN personnel pour les actions sensibles en caisse / salon
 * Paliers de sécurité : 3 essais (15m) -> 5 essais (30m) -> 7 essais (1h) -> 9 essais (Définitif)
 */
async function verifierPinActionSensibleSalon(req, { id_employe, nom_operateur, code_pin, action_label }, deps = {}) {
    const pool = deps.pool || defaultPool;
    const jetFn = deps.enregistrerJET || enregistrerJET;
    const notifFn = deps.envoyerNotificationPush || defaultNotificationPush;

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

    // 3. Gestion de l'échec
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

        if (typeof jetFn === 'function') {
            await jetFn(id_salon, bloqueDefinitif ? 'PIN_BLOCAGE_DEFINITIF' : 'PIN_ACTION_SENSIBLE_ECHOUE', {
                action: action_label,
                collaborateur: emp.nom,
                tentatives: nouvellesTentatives,
                bloque_jusqua: bloqueJusqua,
                bloque_definitif: bloqueDefinitif
            }, pool);
        }

        if (bloqueDefinitif && typeof notifFn === 'function') {
            notifFn(id_salon, 'gerant', {
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

/**
 * Encaissement complet d'un panier de vente (Smart POS / NF525)
 */
async function encaisserTicket({ pool, io, stripe, crypto, enregistrerJET: jetFn }, { user, body, dateTicketEffective, idTempOffline }) {
    const dbPool = pool || defaultPool;
    const socketIo = io || defaultIo;
    const stripeApi = stripe || defaultStripe;
    const jet = jetFn || enregistrerJET;

    if (user.role === 'employe') {
        const err = new Error("L'encaissement est réservé au poste Caisse/Salon ou au Gérant.");
        err.status = 403;
        throw err;
    }

    const { montant, id_employe, id_client, lignes, recompense_appliquee, methode_paiement, pourboire } = body;
    const id_salon = user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const montantBasket = parseFloat(montant) || 0;
    const montantPourboire = parseFloat(pourboire) || 0;
    const montantTotalAEncaisser = montantBasket + montantPourboire;

    if (montantTotalAEncaisser <= 0 || !Array.isArray(lignes) || lignes.length === 0) {
        const err = new Error("Montant ou panier invalide.");
        err.status = 400;
        throw err;
    }

    // SÉCURITÉ ANTI-FRAUDE : VÉRIFICATION DU POINTAGE
    const configData = await dbPool.query('SELECT mode_suivi_heures FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    if (configData.rows.length > 0 && configData.rows[0].mode_suivi_heures === 'POINTEUSE') {
        const empData = await dbPool.query('SELECT role FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        if (empData.rows.length > 0 && empData.rows[0].role !== 'Gérant') {
            const pointageData = await dbPool.query(`
                SELECT type_action FROM pointages 
                WHERE id_salon = $1 AND id_employe = $2 AND date_jour = CURRENT_DATE 
                ORDER BY heure_action DESC LIMIT 1
            `, [id_salon, id_employe]);

            const actionActuelle = pointageData.rows.length > 0 ? pointageData.rows[0].type_action : null;
            if (!actionActuelle || actionActuelle === 'PAUSE_DEBUT' || actionActuelle === 'SORTIE') {
                const err = new Error("Action refusée (Sécurité Serveur) : L'employé sélectionné n'a pas pointé son arrivée ou est en pause.");
                err.status = 403;
                throw err;
            }
        }
    }

    const clientDB = await dbPool.connect();
    let reader = null;
    let paymentIntentId = null;
    let intentStatus = null;

    try {
        if (methode === 'CARTE' && montantTotalAEncaisser > 0) {
            const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;

            if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

            const paymentIntent = await stripeApi.paymentIntents.create({
                amount: Math.round(montantTotalAEncaisser * 100),
                currency: 'eur',
                payment_method_types: ['card_present'],
                capture_method: 'manual',
            });
            paymentIntentId = paymentIntent.id;
            intentStatus = paymentIntent.status;
            reader = await stripeApi.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });

            if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.includes('test')) {
                try { await stripeApi.testHelpers.terminal.readers.presentPaymentMethod(readerId); } catch(e) {}
            }

            let attempts = 0;
            while (intentStatus === 'requires_payment_method' && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const checkIntent = await stripeApi.paymentIntents.retrieve(paymentIntentId);
                intentStatus = checkIntent.status;
                attempts++;
            }

            if (intentStatus !== 'requires_capture') {
                try { await stripeApi.terminal.readers.cancelAction(readerId); } catch(e) {}
                try { await stripeApi.paymentIntents.cancel(paymentIntentId); } catch(e) {}
                throw new Error("Paiement refusé ou délai d'attente dépassé sur le TPE.");
            }
        }

        await clientDB.query('BEGIN');

        // VERROU TRANSACTIONNEL : On bloque la lecture/écriture du compteur pour ce salon précis
        const configRes = await clientDB.query('SELECT compteur_tickets, tva_intra FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        const seq = parseInt(configRes.rows[0].compteur_tickets) + 1;

        // DÉTECTION FRANCHISE : Vérifie si le salon est assujetti à la TVA
        const franchiseTVA = !configRes.rows[0].tva_intra || configRes.rows[0].tva_intra.trim() === '';

        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';

        const anneeMois = new Date().toISOString().slice(0, 7).replace('-', '');
        const numeroTicket = `TKT-${anneeMois}-${String(seq).padStart(6, '0')}`;

        await clientDB.query('UPDATE configuration_salon SET compteur_tickets = $1 WHERE id_salon = $2', [seq, id_salon]);

        const ticketResult = await clientDB.query(
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, date_creation, id_temp_offline, date_synchro_hors_ligne, montant_pourboire)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALIDE', COALESCE($8::timestamp, NOW()), $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL::timestamp ELSE NOW() END, $10)
             RETURNING id_ticket, date_creation;`,
            [numeroTicket, id_client || null, id_employe, montantBasket, id_salon, recompense_appliquee || false, methode, dateTicketEffective || null, idTempOffline || null, montantPourboire]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;
        const dateCreationISO = new Date(ticketResult.rows[0].date_creation).toISOString();

        const employeResult = await clientDB.query('SELECT * FROM employes WHERE id_employe = $1 AND id_salon = $2', [id_employe, id_salon]);
        const employe = employeResult.rowCount > 0 ? employeResult.rows[0] : null;

        let totalTvaTicketCents = 0;

        if (lignes && lignes.length > 0) {
            // Répartition au centime près des remises (Cohérence NF525 : Somme Lignes === Ticket TTC)
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

                await clientDB.query(
                    `INSERT INTO lignes_ticket (id_ticket, id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, id_salon, nom_article_snapshot, taux_tva_snapshot)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                    [idNouveauTicket, ligne.id_article, ligne.quantite, puEffectif, total_ligne, id_salon, nomSnapshot, tvaSnapshot]
                );

                const updateStockQuery = `UPDATE catalogue SET stock_actuel = stock_actuel - $1 WHERE id_article = $2 AND id_salon = $3 AND type_article IN ('PRODUIT_REVENTE', 'CONSOMMABLE') RETURNING nom, stock_actuel, type_article;`;
                const stockResult = await clientDB.query(updateStockQuery, [ligne.quantite, ligne.id_article, id_salon]);
                let type_article = 'PRESTATION';
                if (stockResult.rowCount > 0) type_article = stockResult.rows[0].type_article;

                // Déstockage automatique des ingrédients (recettes protocoles)
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

                    await clientDB.query(
                        `INSERT INTO commissions (id_employe, id_ticket, montant_vente, montant_commission, type_vente, id_salon, date_creation)
                         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))`,
                        [id_employe, idNouveauTicket, baseHtCommission, montant_commission, type_article, id_salon, dateTicketEffective || null]
                    );
                }
            }
        }

        const montantScelle = Number(montantBasket).toFixed(2);
        const tvaScellee = (totalTvaTicketCents / 100).toFixed(2);
        const chaineScellee = `${idNouveauTicket}|${numeroTicket}|${dateCreationISO}|VENTE|${methode}|${montantScelle}|${tvaScellee}|${previousHash}`;
        const newHash = crypto.createHash('sha256').update(chaineScellee).digest('hex');
        await clientDB.query('UPDATE tickets SET hash_ticket = $1, donnees_scellees = $2 WHERE id_ticket = $3', [newHash, chaineScellee, idNouveauTicket]);

        await jet(id_salon, idTempOffline ? 'ENCAISSEMENT_TICKET_OFFLINE_SYNC' : 'ENCAISSEMENT_TICKET', {
            id_ticket: idNouveauTicket,
            numero_ticket: numeroTicket,
            montant_ttc: montantScelle,
            tva_ttc: tvaScellee,
            methode_paiement: methode,
            id_temp_offline: idTempOffline || null,
            hash_ticket: newHash
        }, clientDB);

        if (id_client) {
            const clientCheck = await clientDB.query(`SELECT points_fidelite, tampons_fidelite, remise_winback FROM clients WHERE id_client = $1 AND id_salon = $2 FOR UPDATE`, [id_client, id_salon]);
            if (clientCheck.rowCount === 0) throw new Error("Client introuvable dans ce salon.");
            const clientFidelite = clientCheck.rows[0];

            await clientDB.query(`UPDATE clients SET derniere_visite = CURRENT_DATE WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);

            const configResFid = await clientDB.query(`SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
            if (configResFid.rowCount > 0) {
                const config = configResFid.rows[0];
                const utiliseWinback = Boolean(recompense_appliquee && clientFidelite.remise_winback);

                if (utiliseWinback) {
                    await clientDB.query(`UPDATE clients SET remise_winback = NULL WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
                    if (config.fidelite_type === 'POINTS') {
                        const pointsToAdd = Math.max(0, Math.floor(montantBasket));
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
                        const pointsToAdd = Math.max(0, Math.floor(montantBasket));
                        await clientDB.query(`UPDATE clients SET points_fidelite = COALESCE(points_fidelite, 0) + $1 WHERE id_client = $2 AND id_salon = $3`, [pointsToAdd, id_client, id_salon]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query(`UPDATE clients SET tampons_fidelite = COALESCE(tampons_fidelite, 0) + 1 WHERE id_client = $1 AND id_salon = $2`, [id_client, id_salon]);
                    }
                }
            }
        }

        // On ne capture l'argent QUE si tout le reste en BDD s'est bien passé
        if (methode === 'CARTE' && montantBasket > 0 && intentStatus === 'requires_capture') {
            await stripeApi.paymentIntents.capture(paymentIntentId);
        }

        await clientDB.query('COMMIT');

        const messageFinal = (methode === 'CARTE' && montantBasket > 0) ? `En attente du TPE... (Ticket #${idNouveauTicket})` : `Paiement en ${methode} validé (Ticket #${idNouveauTicket})`;
        if (socketIo) {
            socketIo.to(id_salon.toString()).emit('paiementValide', { message: messageFinal });
        }

        return { message: messageFinal, reader, id_ticket: idNouveauTicket };
    } catch (error) {
        await clientDB.query('ROLLBACK');
        if (paymentIntentId && intentStatus === 'requires_capture' && stripeApi) {
            try {
                await stripeApi.paymentIntents.cancel(paymentIntentId);
                console.log(`[STRIPE] Paiement ${paymentIntentId} annulé suite à un échec BDD.`);
            } catch(e) {
                console.error("[STRIPE] Erreur annulation:", e);
            }
        }
        throw error;
    } finally {
        clientDB.release();
    }
}

/**
 * Encaissement d'un pourboire isolé post-encaissement (NF525)
 */
async function encaisserPourboireIsole({ pool, io, stripe, crypto, enregistrerJET: jetFn }, { user, body }) {
    const dbPool = pool || defaultPool;
    const socketIo = io || defaultIo;
    const stripeApi = stripe || defaultStripe;
    const jet = jetFn || enregistrerJET;

    if (user.role === 'employe') {
        const err = new Error("L'encaissement est réservé à la caisse.");
        err.status = 403;
        throw err;
    }

    const { montant_pourboire, id_employe, methode_paiement, id_client } = body;
    const id_salon = user.id_salon;
    const methode = methode_paiement || 'CARTE';
    const montantPb = parseFloat(montant_pourboire) || 0;

    if (montantPb <= 0) {
        const err = new Error("Montant invalide.");
        err.status = 400;
        throw err;
    }

    const clientDB = await dbPool.connect();
    let reader = null;
    let paymentIntentId = null;
    let intentStatus = null;

    try {
        if (methode === 'CARTE') {
            const configResult = await clientDB.query('SELECT stripe_reader_id FROM configuration_salon WHERE id_salon = $1', [id_salon]);
            const readerId = configResult.rowCount > 0 ? configResult.rows[0].stripe_reader_id : null;
            if (!readerId) throw new Error("Aucun lecteur TPE configuré.");

            const paymentIntent = await stripeApi.paymentIntents.create({
                amount: Math.round(montantPb * 100),
                currency: 'eur',
                payment_method_types: ['card_present'],
                capture_method: 'manual',
            });
            paymentIntentId = paymentIntent.id;
            intentStatus = paymentIntent.status;
            reader = await stripeApi.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });

            if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.includes('test')) {
                try { await stripeApi.testHelpers.terminal.readers.presentPaymentMethod(readerId); } catch(e) {}
            }

            let attempts = 0;
            while (intentStatus === 'requires_payment_method' && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const checkIntent = await stripeApi.paymentIntents.retrieve(paymentIntentId);
                intentStatus = checkIntent.status;
                attempts++;
            }

            if (intentStatus !== 'requires_capture') {
                try { await stripeApi.terminal.readers.cancelAction(readerId); } catch(e) {}
                try { await stripeApi.paymentIntents.cancel(paymentIntentId); } catch(e) {}
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
            `INSERT INTO tickets (numero_ticket_caisse, id_client, id_employe, total_ttc, id_salon, recompense_utilisee, methode_paiement, statut, type_ticket, date_creation, montant_pourboire)
             VALUES ($1, $2, $3, 0.00, $4, FALSE, $5, 'VALIDE', 'POURBOIRE', NOW(), $6)
             RETURNING id_ticket, date_creation;`,
            [numeroTicket, id_client || null, id_employe, id_salon, methode, montantPb]
        );
        const idNouveauTicket = ticketResult.rows[0].id_ticket;
        const dateCreationISO = new Date(ticketResult.rows[0].date_creation).toISOString();

        const chaineScellee = `${idNouveauTicket}|${numeroTicket}|${dateCreationISO}|POURBOIRE|${methode}|0.00|0.00|${previousHash}`;
        const newHash = crypto.createHash('sha256').update(chaineScellee).digest('hex');

        await clientDB.query('UPDATE tickets SET hash_ticket = $1, donnees_scellees = $2 WHERE id_ticket = $3', [newHash, chaineScellee, idNouveauTicket]);

        await jet(id_salon, 'ENCAISSEMENT_POURBOIRE_ISOLE', {
            id_ticket: idNouveauTicket,
            numero_ticket: numeroTicket,
            montant_pourboire: montantPb,
            methode_paiement: methode,
            hash_ticket: newHash
        }, clientDB);

        if (methode === 'CARTE' && intentStatus === 'requires_capture') {
            await stripeApi.paymentIntents.capture(paymentIntentId);
        }

        await clientDB.query('COMMIT');

        const messageFinal = methode === 'CARTE' ? `Pourboire validé sur TPE (Ticket #${idNouveauTicket})` : `Pourboire validé (Ticket #${idNouveauTicket})`;
        if (socketIo) {
            socketIo.to(id_salon.toString()).emit('paiementValide', { message: messageFinal });
        }
        return { message: messageFinal, reader, id_ticket: idNouveauTicket };
    } catch (error) {
        await clientDB.query('ROLLBACK');
        if (paymentIntentId && intentStatus === 'requires_capture' && stripeApi) {
            try { await stripeApi.paymentIntents.cancel(paymentIntentId); } catch(e) {}
        }
        throw error;
    } finally {
        clientDB.release();
    }
}

/**
 * Annulation totale ou partielle d'un ticket avec génération d'avoir compensatoire scellé (NF525)
 */
async function annulerTicketCaisse({ pool, crypto, enregistrerJET: jetFn }, { user, id_ticket, motif, lignes_a_annuler }) {
    const dbPool = pool || defaultPool;
    const jet = jetFn || enregistrerJET;

    if (user.role !== 'gerant') {
        const err = new Error("Seul le gérant est habilité à annuler un ticket.");
        err.status = 403;
        throw err;
    }

    const id_salon = user.id_salon;
    if (!motif || !motif.trim()) {
        const err = new Error("Un motif d'annulation est obligatoire.");
        err.status = 400;
        throw err;
    }

    const clientDB = await dbPool.connect();
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

        // VERROU TRANSACTIONNEL
        const configRes = await clientDB.query('SELECT compteur_tickets FROM configuration_salon WHERE id_salon = $1 FOR UPDATE', [id_salon]);
        const seq = parseInt(configRes.rows[0].compteur_tickets) + 1;

        const lastTicket = await clientDB.query('SELECT hash_ticket FROM tickets WHERE id_salon = $1 ORDER BY id_ticket DESC LIMIT 1', [id_salon]);
        const previousHash = lastTicket.rowCount > 0 && lastTicket.rows[0].hash_ticket ? lastTicket.rows[0].hash_ticket : 'GENESIS_BLOCK';

        const anneeMois = new Date().toISOString().slice(0, 7).replace('-', '');
        const numeroCompensation = `TKT-AN-${anneeMois}-${String(seq).padStart(6, '0')}`;

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

            // Remise en stock des recettes si prestation
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

        // Proratisation des commissions annulées
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
                const pointsARetirer = Math.floor(Math.abs(montantCompensation));
                const tamponsARetirer = estAnnulationTotale ? 1 : 0;
                await clientDB.query("UPDATE clients SET points_fidelite = GREATEST(0, points_fidelite - $1), tampons_fidelite = GREATEST(0, tampons_fidelite - $2) WHERE id_client = $3", [pointsARetirer, tamponsARetirer, ticket.id_client]);
            } else if (estAnnulationTotale) {
                const configResFid = await clientDB.query('SELECT fidelite_type, fidelite_points_seuil, fidelite_tampons_seuil FROM configuration_salon WHERE id_salon = $1', [id_salon]);
                if (configResFid.rowCount > 0) {
                    const config = configResFid.rows[0];
                    if (config.fidelite_type === 'POINTS') {
                        await clientDB.query("UPDATE clients SET points_fidelite = points_fidelite + $1 WHERE id_client = $2", [config.fidelite_points_seuil, ticket.id_client]);
                    } else if (config.fidelite_type === 'TAMPONS') {
                        await clientDB.query("UPDATE clients SET tampons_fidelite = tampons_fidelite + $1 WHERE id_client = $2", [config.fidelite_tampons_seuil, ticket.id_client]);
                    }
                }
            }
        }

        await jet(id_salon, 'ANNULATION_TICKET', {
            id_ticket_origine: parseInt(id_ticket),
            id_ticket_compensation: idTicketCompensation,
            montant: montantCompensation,
            lignes_annulees: lignesToProcess.map(l => ({ id_article: l.id_article, quantite: l.quantite })),
            motif: motif.trim()
        }, clientDB);

        await clientDB.query('COMMIT');
        return { message: "Remboursement validé (écriture de compensation générée). Stock et fidélité mis à jour." };
    } catch (err) {
        await clientDB.query('ROLLBACK');
        throw err;
    } finally {
        clientDB.release();
    }
}

/**
 * Envoi d'un reçu / ticket par Email (SMTP Gmail) ou SMS transactionnel (Brevo)
 */
async function envoyerTicketCaisse({ pool, nodemailer, dechiffrer, crypto, normaliserTelephone, verifierEtIncrementerQuotaSMS }, { user, body }) {
    const dbPool = pool || defaultPool;
    const { id_ticket, email, id_client, methode } = body;
    const id_salon = user.id_salon;

    const salonConfig = await dbPool.query('SELECT nom_salon, email_reception_factures, mot_de_passe_app_email, brevo_api_key, sms_sender_name FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    if (salonConfig.rowCount === 0) {
        const err = new Error("Salon introuvable.");
        err.status = 404;
        throw err;
    }
    const config = salonConfig.rows[0];

    const ticketData = await dbPool.query('SELECT numero_ticket_caisse, total_ttc, date_creation, methode_paiement FROM tickets WHERE id_ticket = $1 AND id_salon = $2', [id_ticket, id_salon]);
    if (ticketData.rowCount === 0) {
        const err = new Error("Ticket introuvable.");
        err.status = 404;
        throw err;
    }
    const ticket = ticketData.rows[0];

    const verifSms = await verifierEtIncrementerQuotaSMS(user.id_salon, 1);
    if (!verifSms.autorise) {
        const err = new Error(verifSms.erreur);
        err.status = 403;
        throw err;
    }

    const textRecap = `Merci pour votre visite chez ${config.nom_salon} !\nTicket n°${ticket.numero_ticket_caisse} du ${new Date(ticket.date_creation).toLocaleDateString('fr-FR')}.\nMontant total : ${parseFloat(ticket.total_ttc).toFixed(2)} € (Réglé par ${ticket.methode_paiement}).\nÀ très bientôt !`;

    if (methode === 'email') {
        if (!config.email_reception_factures || !config.mot_de_passe_app_email) {
            const err = new Error("Email non configuré.");
            err.status = 400;
            throw err;
        }
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: config.email_reception_factures, pass: dechiffrer(config.mot_de_passe_app_email) }
        });
        await transporter.sendMail({ from: `"${config.nom_salon}" <${config.email_reception_factures}>`, to: email, subject: `Votre reçu - ${config.nom_salon}`, text: textRecap });
        if (id_client && email) {
            await dbPool.query('UPDATE clients SET email = $1 WHERE id_client = $2 AND id_salon = $3', [email, id_client, id_salon]);
        }
    } else if (methode === 'sms') {
        if (!config.brevo_api_key) {
            const err = new Error("Clé Brevo non configurée.");
            err.status = 400;
            throw err;
        }
        let telephoneEnvoi;
        if (id_client) {
            const client = await dbPool.query('SELECT telephone FROM clients WHERE id_client = $1 AND id_salon = $2', [id_client, id_salon]);
            if (client.rowCount === 0 || !client.rows[0].telephone) {
                const err = new Error("Aucun numéro.");
                err.status = 400;
                throw err;
            }
            telephoneEnvoi = client.rows[0].telephone;
        } else {
            telephoneEnvoi = (body.telephone || '').trim();
            if (!telephoneEnvoi) {
                const err = new Error("Numéro de téléphone requis.");
                err.status = 400;
                throw err;
            }
        }
        await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': config.brevo_api_key, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'transactional', unicodeEnabled: false, sender: (config.sms_sender_name || 'LeSalon').substring(0, 11), recipient: telephoneEnvoi, content: textRecap })
        });

        if (!id_client) {
            const telNormalise = normaliserTelephone(telephoneEnvoi);
            const dejaOptOut = await dbPool.query('SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = $2', [id_salon, telNormalise]);
            const clientConnu = await dbPool.query(`SELECT 1 FROM clients WHERE id_salon = $1 AND RIGHT(regexp_replace(telephone, '\\D', '', 'g'), 9) = $2`, [id_salon, telNormalise]);
            if (clientConnu.rowCount === 0 && dejaOptOut.rowCount === 0) {
                const tokenAvis = crypto.randomBytes(24).toString('hex');
                await dbPool.query(
                    `INSERT INTO avis_demandes (id_salon, telephone, token, statut, date_prevue) VALUES ($1, $2, $3, 'EN_ATTENTE', NOW() + INTERVAL '1.5 hours')`,
                    [id_salon, telephoneEnvoi, tokenAvis]
                );
            }
        }
    }
    return { message: "Ticket envoyé." };
}

/**
 * Récupère les mouvements d'espèces de caisse du jour
 */
async function recupererMouvementsJour({ pool }, id_salon) {
    const dbPool = pool || defaultPool;
    const result = await dbPool.query(
        `SELECT m.*, e.nom as nom_employe FROM mouvements_caisse m LEFT JOIN employes e ON m.id_employe = e.id_employe WHERE m.id_salon = $1 AND DATE(m.date_creation) = CURRENT_DATE ORDER BY m.date_creation DESC`,
        [id_salon]
    );
    return result.rows;
}

/**
 * Crée et scelle un mouvement de caisse d'espèces (ENTREE / SORTIE)
 */
async function creerMouvementCaisse({ pool, verifierPinActionSensibleSalon: verifPinFn, enregistrerMouvementCaisseScelle: mvtFn, enregistrerJET: jetFn }, { user, req, body }) {
    const dbPool = pool || defaultPool;
    const mvtScelleFn = mvtFn || enregistrerMouvementCaisseScelle;
    const jet = jetFn || enregistrerJET;
    const checkPin = verifPinFn || verifierPinActionSensibleSalon;

    if (user.role === 'employe') {
        const err = new Error("Accès réservé à la caisse du salon ou au gérant.");
        err.status = 403;
        throw err;
    }

    const { type_mouvement, montant, motif, id_employe, nom_operateur, code_pin, categorie_comptable } = body;
    if (!['ENTREE', 'SORTIE'].includes(type_mouvement)) {
        const err = new Error("Type de mouvement invalide.");
        err.status = 400;
        throw err;
    }
    if (!motif || !motif.trim()) {
        const err = new Error("Le motif est obligatoire.");
        err.status = 400;
        throw err;
    }
    if (!montant || isNaN(montant) || parseFloat(montant) <= 0) {
        const err = new Error("Montant invalide.");
        err.status = 400;
        throw err;
    }

    const operateurValide = await checkPin(req, {
        id_employe,
        nom_operateur,
        code_pin,
        action_label: `Mouvement de caisse (${type_mouvement})`
    }, { pool: dbPool, enregistrerJET: jet });

    const clientDB = await dbPool.connect();
    try {
        await clientDB.query('BEGIN');
        const scelle = await mvtScelleFn(clientDB, {
            id_salon: user.id_salon,
            id_employe: operateurValide.id_employe || id_employe || null,
            type_mouvement,
            montant: parseFloat(montant),
            motif: motif.trim(),
            categorie_comptable: categorie_comptable || null
        });
        await jet(user.id_salon, 'MOUVEMENT_CAISSE', {
            id_mouvement: scelle.id_mouvement,
            operateur: operateurValide.nom,
            type_mouvement,
            categorie_comptable: scelle.categorie_comptable,
            montant: parseFloat(montant),
            motif: motif.trim(),
            hash_mouvement: scelle.hash_mouvement
        }, clientDB);
        await clientDB.query('COMMIT');
        return { message: "Mouvement de caisse enregistré et scellé." };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

/**
 * Clôture journalière de caisse (Z) avec scellement cryptographique et cumul perpétuel (NF525)
 */
async function cloturerCaisseZ({ pool, crypto, verifierPinActionSensibleSalon: verifPinFn, enregistrerJET: jetFn }, { user, req, body }) {
    const dbPool = pool || defaultPool;
    const jet = jetFn || enregistrerJET;
    const checkPin = verifPinFn || verifierPinActionSensibleSalon;

    if (user.role === 'employe') {
        const err = new Error("La clôture Z est réservée au gérant ou au poste Salon.");
        err.status = 403;
        throw err;
    }

    const id_salon = user.id_salon;
    const { ferme_par, id_employe, code_pin, fond_caisse_matin, total_especes_reel, justification_ecart } = body;

    // 1. Vérification du code PIN HORS transaction (évite deadlock SQL)
    const operateurCloture = await checkPin(req, {
        id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
        nom_operateur: ferme_par,
        code_pin,
        action_label: 'Clôture journalière Z'
    }, { pool: dbPool, enregistrerJET: jet });
    const operateurFinalNom = operateurCloture.nom || ferme_par || 'Gérant';

    const clientDB = await dbPool.connect();
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
        if (dejaCloture.rowCount > 0) {
            throw new Error(`La caisse pour la date du ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')} a déjà été clôturée.`);
        }

        const caResult = await clientDB.query(`SELECT COALESCE(SUM(total_ttc), 0) as total FROM tickets WHERE id_salon = $1 AND DATE(date_creation) = $2 AND statut != 'ANNULE'`, [id_salon, dateACloturerStr]);
        const totalJour = Number(caResult.rows[0].total).toFixed(2);

        // RÈGLE D'OR NF525 : Nouveau Cumul = Ancien Cumul (du dernier Z scellé) + CA du jour (verrouillé FOR UPDATE)
        const dernierZInfo = await clientDB.query('SELECT signature_hash, numero_z_salon, cumul_perpetuel_ttc, total_especes_reel FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon DESC NULLS LAST, date_cloture DESC, id_cloture DESC LIMIT 1 FOR UPDATE', [id_salon]);

        const ancienCumul = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].cumul_perpetuel_ttc ? parseFloat(dernierZInfo.rows[0].cumul_perpetuel_ttc) : 0;
        const grandTotalPerpetuel = Number((ancienCumul + parseFloat(totalJour)).toFixed(2));
        const hashPrecedent = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].signature_hash ? dernierZInfo.rows[0].signature_hash : 'GENESIS_Z';
        const nextZ = dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].numero_z_salon ? parseInt(dernierZInfo.rows[0].numero_z_salon) + 1 : 1;

        // CALCUL NF525 DE L'ÉCART DE CAISSE
        const dNow = new Date();
        const aujourdhuiStr = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
        const estRattrapageJourPasse = (dateACloturerStr < aujourdhuiStr);

        const fCaisseMatin = (dernierZInfo.rowCount > 0 && dernierZInfo.rows[0].total_especes_reel !== null)
            ? Number(parseFloat(dernierZInfo.rows[0].total_especes_reel).toFixed(2))
            : Number((parseFloat(fond_caisse_matin) || 0).toFixed(2));

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

        // Si l'écart est > 2€ et qu'on n'a pas de justification, on bloque (NF525)
        if (!estRattrapageJourPasse && Math.abs(ecartCaisse) > 2.00 && (!justification_ecart || justification_ecart.trim() === '')) {
            await clientDB.query('ROLLBACK');
            const err = new Error(`Un écart de caisse de ${ecartCaisse > 0 ? '+' : ''}${ecartCaisse.toFixed(2)} € a été détecté. Une justification est requise pour la loi NF525.`);
            err.status = 400;
            err.require_justification = true;
            err.ecart = ecartCaisse;
            throw err;
        }

        const signature = crypto.createHash('sha256')
            .update(`Z-${id_salon}-${nextZ}-${dateACloturerStr}-${totalJour}-${grandTotalPerpetuel.toFixed(2)}-${hashPrecedent}`)
            .digest('hex');

        await clientDB.query(
            `INSERT INTO clotures_caisse (id_salon, total_encaisse, signature_hash, date_cloture, cumul_perpetuel_ttc, hash_precedent, ferme_par, fond_caisse_matin, total_especes_theorique, total_especes_reel, ecart_caisse, justification_ecart, est_cloture_automatique, numero_z_salon) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [id_salon, totalJour, signature, dateACloturerStr, grandTotalPerpetuel, hashPrecedent, operateurFinalNom, fCaisseMatin, tEspecesTheorique, tEspecesReel, ecartCaisse, justificationFinale, estRattrapageJourPasse, nextZ]
        );

        await jet(id_salon, 'CLOTURE_Z', { numero_z: nextZ, date_cloture: dateACloturerStr, total_jour: totalJour, cumul_perpetuel: grandTotalPerpetuel, ecart_caisse: ecartCaisse, signature }, clientDB);

        // WEBHOOK / API TEMPS RÉEL (Comptabilité Pennylane) en tâche de fond
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
                    fetch('https://app.pennylane.com/api/v1/customer_invoices', {
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

        await clientDB.query('COMMIT');
        return {
            message: `Caisse clôturée avec succès pour le ${new Date(dateACloturerStr).toLocaleDateString('fr-FR')}.`,
            signature,
            cumul_perpetuel_ttc: grandTotalPerpetuel
        };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

/**
 * Récupère l'état de la clôture Z d'aujourd'hui
 */
async function recupererStatutCloture({ pool }, id_salon) {
    const dbPool = pool || defaultPool;
    const r = await dbPool.query('SELECT 1 FROM clotures_caisse WHERE id_salon = $1 AND date_cloture = CURRENT_DATE', [id_salon]);
    const auto = await dbPool.query("SELECT TO_CHAR(date_cloture, 'YYYY-MM-DD') as date_auto FROM clotures_caisse WHERE id_salon = $1 AND est_cloture_automatique = TRUE ORDER BY id_cloture DESC LIMIT 1", [id_salon]);
    return {
        cloture_faite: r.rowCount > 0,
        derniere_cloture_auto: auto.rowCount > 0 ? auto.rows[0].date_auto : null
    };
}

/**
 * Vérification matinale : détecte si une clôture automatique attend régularisation
 */
async function recupererVerificationMatinale({ pool }, id_salon) {
    const dbPool = pool || defaultPool;
    const auto = await dbPool.query(
        "SELECT id_cloture, TO_CHAR(date_cloture, 'DD/MM/YYYY') as date_cloture_fr, total_especes_theorique FROM clotures_caisse WHERE id_salon = $1 ORDER BY id_cloture DESC LIMIT 1",
        [id_salon]
    );

    if (auto.rowCount > 0 && auto.rows[0].total_especes_theorique !== null) {
        const derniereEstAuto = await dbPool.query(
            "SELECT 1 FROM clotures_caisse WHERE id_cloture = $1 AND est_cloture_automatique = TRUE",
            [auto.rows[0].id_cloture]
        );
        if (derniereEstAuto.rowCount > 0) {
            return { necessite_regularisation: true, cloture: auto.rows[0] };
        }
    }
    return { necessite_regularisation: false };
}

/**
 * Régularisation matinale du comptage espèces suite à fermeture automatique
 */
async function regulariserCaisse({ pool, verifierPinActionSensibleSalon: verifPinFn, enregistrerMouvementCaisseScelle: mvtFn, enregistrerJET: jetFn }, { user, req, body }) {
    const dbPool = pool || defaultPool;
    const jet = jetFn || enregistrerJET;
    const checkPin = verifPinFn || verifierPinActionSensibleSalon;
    const mvtScelleFn = mvtFn || enregistrerMouvementCaisseScelle;

    if (user.role === 'employe') {
        const err = new Error("La régularisation de caisse est réservée au gérant ou au poste Salon.");
        err.status = 403;
        throw err;
    }

    const { id_cloture, montant_reel, id_employe, nom_operateur, code_pin } = body;
    const operateurRegu = await checkPin(req, {
        id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
        nom_operateur,
        code_pin,
        action_label: 'Régularisation matinale de caisse'
    }, { pool: dbPool, enregistrerJET: jet });

    const clientDB = await dbPool.connect();
    try {
        await clientDB.query('BEGIN');
        const clotureRes = await clientDB.query("SELECT * FROM clotures_caisse WHERE id_cloture = $1 AND id_salon = $2 AND est_cloture_automatique = TRUE FOR UPDATE", [id_cloture, user.id_salon]);
        if (clotureRes.rowCount === 0) throw new Error("Clôture automatique introuvable ou déjà régularisée.");

        const cloture = clotureRes.rows[0];
        const theorique = parseFloat(cloture.total_especes_theorique);
        const reel = parseFloat(montant_reel);
        const ecart = Number((reel - theorique).toFixed(2));

        if (Math.abs(ecart) > 0) {
            await mvtScelleFn(clientDB, {
                id_salon: user.id_salon,
                id_employe: operateurRegu.id_employe || (id_employe && id_employe !== 'gerant' ? id_employe : null),
                type_mouvement: 'REGULARISATION',
                montant: ecart,
                motif: `Régularisation ouverture suite fermeture auto (Z#${cloture.numero_z_salon || id_cloture})`,
                categorie_comptable: 'ECART_CAISSE'
            });
        }
        await jet(user.id_salon, 'REGULARISATION_CAISSE', { id_cloture, numero_z: cloture.numero_z_salon, operateur: operateurRegu.nom, theorique, reel, ecart }, clientDB);

        // On lève uniquement le flag est_cloture_automatique (autorisé par NF525) sans toucher aux colonnes scellées
        await clientDB.query("UPDATE clotures_caisse SET est_cloture_automatique = FALSE WHERE id_cloture = $1", [id_cloture]);

        await clientDB.query('COMMIT');
        return { message: "Caisse régularisée avec succès." };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

/**
 * Audit cryptographique complet NF525 (Vérification de la chaîne de signatures SHA-256)
 */
async function verifierConformiteNF525({ pool, crypto, enregistrerJET: jetFn }, id_salon) {
    const dbPool = pool || defaultPool;
    const jet = jetFn || enregistrerJET;
    let erreurs = [];
    let alertes = [];

    // 1. Audit des TICKETS
    const tickets = await dbPool.query('SELECT id_ticket, numero_ticket_caisse, total_ttc, hash_ticket, donnees_scellees FROM tickets WHERE id_salon = $1 ORDER BY id_ticket ASC', [id_salon]);
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

    // 2. Audit des CLÔTURES (Z) et continuité du cumul perpétuel
    const clotures = await dbPool.query("SELECT id_cloture, numero_z_salon, total_encaisse, cumul_perpetuel_ttc, signature_hash, hash_precedent, date_cloture, TO_CHAR(date_cloture, 'YYYY-MM-DD') as date_cloture_ymd FROM clotures_caisse WHERE id_salon = $1 ORDER BY numero_z_salon ASC NULLS FIRST, id_cloture ASC", [id_salon]);
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
            alertes.push(`Z#${c.numero_z_salon || expectedNumZ} (${dateClotureYMD}) signé avec l'ancien format d'horodatage dynamique.`);
        }
        prevCumulZ = cumulStocke;
        expectedNumZ++;
        prevHashZ = c.signature_hash;
    }

    // 2 bis. Audit des MOUVEMENTS DE CAISSE scellés
    const mouvements = await dbPool.query('SELECT id_mouvement, type_mouvement, montant, motif, hash_precedent, hash_mouvement FROM mouvements_caisse WHERE id_salon = $1 AND hash_mouvement IS NOT NULL ORDER BY id_mouvement ASC', [id_salon]);
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
    const jetLogs = await dbPool.query('SELECT id_jet, hash_jet, hash_precedent, action FROM jet_logs WHERE id_salon = $1 ORDER BY id_jet ASC', [id_salon]);
    let prevHashJet = 'GENESIS_JET';
    for (let j of jetLogs.rows) {
        if (j.hash_precedent !== prevHashJet) {
            erreurs.push(`Rupture de chaînage sur le Journal Technique (Action #${j.id_jet} - ${j.action}).`);
            break;
        }
        prevHashJet = j.hash_jet;
    }

    if (typeof jet === 'function') {
        await jet(id_salon, 'AUDIT_NF525_EXECUTE', { tickets: tickets.rowCount, clotures: clotures.rowCount, jet: jetLogs.rowCount, conforme: erreurs.length === 0 });
    }

    return {
        conforme: erreurs.length === 0,
        erreurs,
        alertes,
        total_tickets_verifies: tickets.rowCount,
        total_z_verifies: clotures.rowCount,
        total_jet_verifies: jetLogs.rowCount
    };
}

/**
 * Récupère le détail des lignes d'un ticket avec déduction des quantités annulées
 */
async function recupererLignesTicket({ pool }, { id_salon, id_ticket }) {
    const dbPool = pool || defaultPool;
    const lignes = await dbPool.query("SELECT id_article, quantite, prix_unitaire_ttc, total_ligne_ttc, nom_article_snapshot FROM lignes_ticket WHERE id_ticket = $1 AND id_salon = $2", [id_ticket, id_salon]);
    const lignesDejaAnnulees = await dbPool.query("SELECT id_article, SUM(ABS(quantite)) as qte_annulee FROM lignes_ticket WHERE id_ticket IN (SELECT id_ticket FROM tickets WHERE id_ticket_origine = $1) GROUP BY id_article", [id_ticket]);

    let mapAnnule = {};
    lignesDejaAnnulees.rows.forEach(r => mapAnnule[r.id_article] = parseFloat(r.qte_annulee));

    const lignesDispos = lignes.rows.map(l => ({
        ...l,
        quantite_restante: l.quantite - (mapAnnule[l.id_article] || 0)
    })).filter(l => l.quantite_restante > 0);

    return { lignes: lignesDispos };
}

module.exports = {
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
};
