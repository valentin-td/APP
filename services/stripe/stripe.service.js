// =========================================================================
// SERVICE STRIPE & GESTION D'ABONNEMENT (STACK SaaS)
// =========================================================================

/**
 * Assure les colonnes nécessaires pour les abonnements et le compteur SMS
 */
async function assurerColonnesAbonnementEtSms(pool) {
    await pool.query(`
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS plan_actuel VARCHAR(50) DEFAULT 'PREMIUM_TRIAL';
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS plan_choisi_apres_essai VARCHAR(50) DEFAULT 'PREMIUM';
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS statut_abonnement VARCHAR(50) DEFAULT 'actif';
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days');
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS empreinte_cb_validee BOOLEAN DEFAULT FALSE;
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS sms_envoyes_mois INT DEFAULT 0;
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS mois_compteur_sms VARCHAR(7);
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS frequence_paiement VARCHAR(20) DEFAULT 'MENSUEL';
    `).catch(() => {});
}

const TARIFS_FORFAITS_STACK = {
    ESSENTIAL: { nom: 'STACK Essential', montant_cents: 3900, quota_sms: 100, env_price: process.env.STRIPE_PRICE_ESSENTIAL || process.env.PRICE_ESSENTIEL_MOIS },
    PRO:       { nom: 'STACK Pro',       montant_cents: 6900, quota_sms: 250, env_price: process.env.STRIPE_PRICE_PRO || process.env.PRICE_PRO_MOIS },
    PREMIUM:   { nom: 'STACK Premium',   montant_cents: 9900, quota_sms: 500, env_price: process.env.STRIPE_PRICE_PREMIUM || process.env.PRICE_PREMIUM_MOIS }
};

function getQuotaSmsParPlan(plan) {
    const p = (plan || 'PREMIUM_TRIAL').toUpperCase().trim();
    if (p === 'ESSENTIAL' || p === 'ESSENTIEL') return 100;
    if (p === 'PRO') return 250;
    return 500; // PREMIUM et PREMIUM_TRIAL
}

/**
 * Gardien central des quotas SMS mensuels (100 / 250 / 500 SMS)
 */
async function verifierEtIncrementerQuotaSMS(pool, id_salon, nbSms = 1) {
    await assurerColonnesAbonnementEtSms(pool);
    const moisActuel = new Date().toISOString().slice(0, 7);

    const resConf = await pool.query(
        `SELECT plan_actuel, brevo_api_key, sms_envoyes_mois, mois_compteur_sms
         FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    if (resConf.rowCount === 0) return { autorise: false, erreur: "Salon introuvable." };

    const conf = resConf.rows[0];
    const quotaMax = getQuotaSmsParPlan(conf.plan_actuel);

    let compteurActuel = parseInt(conf.sms_envoyes_mois, 10) || 0;
    if (conf.mois_compteur_sms !== moisActuel) {
        compteurActuel = 0;
        await pool.query(
            `UPDATE configuration_salon SET sms_envoyes_mois = 0, mois_compteur_sms = $1 WHERE id_salon = $2`,
            [moisActuel, id_salon]
        );
    }

    const utiliseSaPropreCleBrevo = Boolean(
        conf.brevo_api_key &&
        conf.brevo_api_key.trim() !== '' &&
        conf.brevo_api_key.trim() !== (process.env.BREVO_API_KEY || '').trim()
    );

    if (!utiliseSaPropreCleBrevo && (compteurActuel + nbSms) > quotaMax) {
        return {
            autorise: false,
            utilise: compteurActuel,
            quota: quotaMax,
            restants: Math.max(0, quotaMax - compteurActuel),
            erreur: `Quota mensuel de SMS atteint (${compteurActuel}/${quotaMax} SMS utilisés ce mois-ci avec votre forfait ${conf.plan_actuel === 'ESSENTIAL' ? 'Essential (100 SMS/mois)' : conf.plan_actuel}). Passez sur la formule supérieure ou privilégiez l'envoi gratuit par E-mail.`
        };
    }

    const upd = await pool.query(
        `UPDATE configuration_salon
         SET sms_envoyes_mois = COALESCE(sms_envoyes_mois, 0) + $1,
             mois_compteur_sms = $2
         WHERE id_salon = $3
         RETURNING sms_envoyes_mois`,
        [nbSms, moisActuel, id_salon]
    );

    const nouveauTotal = parseInt(upd.rows[0]?.sms_envoyes_mois, 10) || (compteurActuel + nbSms);
    return {
        autorise: true,
        utilise: nouveauTotal,
        quota: quotaMax,
        restants: Math.max(0, quotaMax - nouveauTotal)
    };
}

/**
 * Lecture de l'état de l'abonnement et des quotas SMS
 */
async function lireEtatAbonnement({ pool }, { id_salon }) {
    await assurerColonnesAbonnementEtSms(pool);
    const moisActuel = new Date().toISOString().slice(0, 7);
    const r = await pool.query(
        `SELECT plan_actuel, plan_choisi_apres_essai, statut_abonnement, date_fin_essai,
                empreinte_cb_validee, stripe_subscription_id, sms_envoyes_mois, mois_compteur_sms
         FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    const c = r.rows[0] || {};
    const smsUtilises = c.mois_compteur_sms === moisActuel ? (parseInt(c.sms_envoyes_mois, 10) || 0) : 0;
    const quotaSms = getQuotaSmsParPlan(c.plan_actuel);

    return {
        plan_actuel: c.plan_actuel || 'PREMIUM_TRIAL',
        plan_choisi_apres_essai: c.plan_choisi_apres_essai || 'PREMIUM',
        statut_abonnement: c.statut_abonnement || 'actif',
        empreinte_cb_validee: Boolean(c.empreinte_cb_validee || c.stripe_subscription_id),
        sms_utilises: smsUtilises,
        sms_quota: quotaSms,
        sms_restants: Math.max(0, quotaSms - smsUtilises)
    };
}

/**
 * Création d'une session Checkout Stripe (avec empreinte 0€ pendant 30j et support évolution d'abonnement)
 */
async function creerCheckoutSession({ pool, stripe, legal }, { user, body, origin }) {
    await assurerColonnesAbonnementEtSms(pool);
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
        throw { status: 500, message: "Clé STRIPE_SECRET_KEY non configurée sur le serveur." };
    }

    if (legal && typeof legal.documentsEnAttente === 'function') {
        const docsEnAttente = await legal.documentsEnAttente(pool, user.id_salon);
        if (docsEnAttente.length > 0) {
            throw { status: 403, message: "Vous devez d'abord accepter les conditions contractuelles.", require_legal: true };
        }
    }

    const planDemande = ((body && body.plan) || (body && body.plan_choisi) || 'PREMIUM').toUpperCase().trim();
    const cycleDemande = (body && body.cycle_choisi) || 'month';
    const isAnnuel = cycleDemande === 'year' || cycleDemande === 'Annuel' || cycleDemande === 'ANNUEL';

    let codePlan = 'PREMIUM';
    if (planDemande.includes('ESSENTIEL') || planDemande === 'ESSENTIAL') codePlan = 'ESSENTIAL';
    else if (planDemande.includes('PRO')) codePlan = 'PRO';
    else codePlan = 'PREMIUM';

    const tarifObj = TARIFS_FORFAITS_STACK[codePlan];

    const salonRes = await pool.query(
        `SELECT nom_salon, email, plan_actuel, date_fin_essai, stripe_customer_id, stripe_subscription_id, statut_abonnement
         FROM configuration_salon WHERE id_salon = $1`,
        [user.id_salon]
    );
    const salon = salonRes.rows[0] || {};

    let customerId = salon.stripe_customer_id;
    if (!customerId) {
        let emailStripe = salon.email || user.email;
        if (!emailStripe || !emailStripe.includes('@')) {
            emailStripe = `salon${user.id_salon}@stack-app.fr`;
        }
        try {
            const customer = await stripe.customers.create({ email: emailStripe, name: salon.nom_salon || `Salon #${user.id_salon}` });
            customerId = customer.id;
            await pool.query('UPDATE configuration_salon SET stripe_customer_id = $1 WHERE id_salon = $2', [customerId, user.id_salon]);
            await pool.query('UPDATE utilisateurs SET _customer_id = $1 WHERE id_salon = $2', [customerId, user.id_salon]).catch(() => {});
        } catch (e) {
            console.warn("⚠️ Avertissement création customer Stripe :", e.message);
        }
    }

    // Si le salon a déjà un abonnement Stripe actif et change de forfait sans passer par le checkout complet
    const subId = salon.stripe_subscription_id;
    if (salon.statut_abonnement === 'actif' && subId && tarifObj.env_price) {
        try {
            const subscription = await stripe.subscriptions.retrieve(subId);
            if (subscription && subscription.items?.data?.[0]?.id) {
                await stripe.subscriptions.update(subId, {
                    items: [{ id: subscription.items.data[0].id, price: tarifObj.env_price }],
                    proration_behavior: 'none',
                    metadata: { id_salon: user.id_salon.toString(), plan_choisi: codePlan, frequence: isAnnuel ? 'ANNUEL' : 'MENSUEL' }
                });
                await pool.query('UPDATE configuration_salon SET plan_actuel = $1, frequence_paiement = $2 WHERE id_salon = $3', [codePlan, isAnnuel ? 'ANNUEL' : 'MENSUEL', user.id_salon]);
                return { success: true, message: `Évolution validée vers le forfait ${tarifObj.nom}.` };
            }
        } catch (subErr) {
            console.warn("⚠️ Impossible de mettre à jour directement l'abonnement Stripe, création d'une session checkout :", subErr.message);
        }
    }

    // Calcul des jours d'essai restants (0€ pendant 30j)
    let joursEssaiRestants = 0;
    if (salon.date_fin_essai) {
        const diffMs = new Date(salon.date_fin_essai).getTime() - Date.now();
        joursEssaiRestants = Math.max(0, Math.min(30, Math.ceil(diffMs / (1000 * 3600 * 24))));
    } else if (salon.plan_actuel === 'PREMIUM_TRIAL') {
        joursEssaiRestants = 30;
    }

    const frontendOrigin = origin || process.env.FRONTEND_URL || 'https://app-salon-caiss.onrender.com';

    const lineItem = tarifObj.env_price
        ? { price: tarifObj.env_price, quantity: 1 }
        : {
            price_data: {
                currency: 'eur',
                product_data: {
                    name: `${tarifObj.nom} — Abonnement Mensuel`,
                    description: `Formule ${tarifObj.nom} (${tarifObj.quota_sms} SMS/mois inclus) — Sans engagement`
                },
                unit_amount: tarifObj.montant_cents,
                recurring: { interval: isAnnuel ? 'year' : 'month' }
            },
            quantity: 1
        };

    const sessionConfig = {
        mode: 'subscription',
        payment_method_types: process.env.STRIPE_SEPA === 'oui' ? ['card', 'sepa_debit'] : ['card'],
        payment_method_collection: 'always',
        customer_email: customerId ? undefined : (salon.email || user.email || undefined),
        customer: customerId || undefined,
        line_items: [lineItem],
        metadata: {
            id_salon: String(user.id_salon),
            plan_choisi: codePlan,
            frequence: isAnnuel ? 'ANNUEL' : 'MENSUEL'
        },
        subscription_data: {
            metadata: {
                id_salon: String(user.id_salon),
                plan_choisi: codePlan,
                frequence: isAnnuel ? 'ANNUEL' : 'MENSUEL'
            },
            ...(joursEssaiRestants > 0 ? { trial_period_days: joursEssaiRestants } : {})
        },
        success_url: `${frontendOrigin}/?paiement=empreinte_ok&plan=${codePlan}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendOrigin}/?paiement=annule`
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    await pool.query(
        `UPDATE configuration_salon SET plan_choisi_apres_essai = $1 WHERE id_salon = $2`,
        [codePlan, user.id_salon]
    );

    return { url: session.url };
}

/**
 * Confirmation de session Stripe (sauvegarde empreinte CB & déblocage étape 4 Onboarding)
 */
async function confirmerSessionStripe({ pool, stripe }, { id_salon, body }) {
    await assurerColonnesAbonnementEtSms(pool);
    const { session_id, plan } = body || {};
    let customerId = null;
    let subscriptionId = null;
    let planRetenu = ['ESSENTIAL', 'PRO', 'PREMIUM'].includes((plan || '').toUpperCase())
        ? plan.toUpperCase()
        : 'PREMIUM';

    if (session_id && stripe && process.env.STRIPE_SECRET_KEY) {
        try {
            const session = await stripe.checkout.sessions.retrieve(session_id);
            customerId = session.customer || null;
            subscriptionId = session.subscription || null;
            if (session.metadata?.plan_choisi) {
                planRetenu = session.metadata.plan_choisi;
            }
        } catch (e) {
            console.warn("⚠️ Erreur récupération session Stripe :", e.message);
        }
    }

    await pool.query(
        `UPDATE configuration_salon
         SET stripe_customer_id = COALESCE($1, stripe_customer_id),
             stripe_subscription_id = COALESCE($2, stripe_subscription_id),
             empreinte_cb_validee = TRUE,
             plan_choisi_apres_essai = $3,
             statut_abonnement = 'actif',
             plan_actuel = CASE WHEN plan_actuel = 'PREMIUM_TRIAL' AND date_fin_essai > NOW() THEN 'PREMIUM_TRIAL' ELSE $3 END
         WHERE id_salon = $4`,
        [customerId, subscriptionId, planRetenu, id_salon]
    );

    await pool.query(
        `UPDATE onboarding_salons
         SET etape_stripe_ok = TRUE,
             statut_onboarding = CASE
                 WHEN etape_materiel_ok AND etape_catalogue_ok AND etape_equipe_ok AND etape_formation_ok THEN 'TERMINE'
                 ELSE statut_onboarding
             END
         WHERE id_salon = $1`,
        [id_salon]
    ).catch(() => {});

    return {
        message: "Empreinte bancaire validée avec succès ! L'étape 4 de votre Checklist Go-Live est débloquée.",
        empreinte_cb_validee: true,
        plan_choisi: planRetenu
    };
}

/**
 * Changement de formule / plan tarifaire
 */
async function changerForfait({ pool, stripe }, { id_salon, nouveau_plan }) {
    const planCible = (nouveau_plan || '').toUpperCase().trim();
    if (!['ESSENTIAL', 'PRO', 'PREMIUM'].includes(planCible)) {
        throw { status: 400, message: "Forfait sélectionné invalide." };
    }

    await assurerColonnesAbonnementEtSms(pool);
    const curRes = await pool.query(
        `SELECT plan_actuel, stripe_subscription_id FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    const salon = curRes.rows[0] || {};
    const tarifCible = TARIFS_FORFAITS_STACK[planCible];

    if (salon.stripe_subscription_id && stripe && process.env.STRIPE_SECRET_KEY) {
        try {
            const sub = await stripe.subscriptions.retrieve(salon.stripe_subscription_id);
            const itemId = sub.items?.data?.[0]?.id;
            if (itemId) {
                const updateItem = tarifCible.env_price
                    ? { id: itemId, price: tarifCible.env_price }
                    : {
                        id: itemId,
                        price_data: {
                            currency: 'eur',
                            product: sub.items.data[0].price.product,
                            unit_amount: tarifCible.montant_cents,
                            recurring: { interval: 'month' }
                        }
                    };
                await stripe.subscriptions.update(salon.stripe_subscription_id, {
                    cancel_at_period_end: false,
                    proration_behavior: 'none',
                    items: [updateItem]
                });
            }
        } catch (stripeErr) {
            console.warn("⚠️ Avertissement synchro Stripe changement de plan :", stripeErr.message);
        }
    }

    await pool.query(
        `UPDATE configuration_salon
         SET plan_actuel = $1,
             plan_choisi_apres_essai = $1,
             statut_abonnement = 'actif'
         WHERE id_salon = $2`,
        [planCible, id_salon]
    );

    return {
        message: `Forfait basculé sur ${tarifCible.nom} (${tarifCible.montant_cents / 100} € HT/mois — ${tarifCible.quota_sms} SMS/mois inclus).`,
        plan_actuel: planCible,
        sms_quota: tarifCible.quota_sms
    };
}

/**
 * Résiliation de l'abonnement
 */
async function resilierAbonnement({ pool, stripe }, { id_salon }) {
    await assurerColonnesAbonnementEtSms(pool);
    const curRes = await pool.query(`SELECT stripe_subscription_id FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
    const subId = curRes.rows[0]?.stripe_subscription_id;

    if (subId && stripe && process.env.STRIPE_SECRET_KEY) {
        await stripe.subscriptions.update(subId, { cancel_at_period_end: true }).catch(() => {});
    }
    await pool.query(`UPDATE configuration_salon SET statut_abonnement = 'resilie_fin_periode' WHERE id_salon = $1`, [id_salon]);
    return { message: "Résiliation enregistrée : aucun prélèvement ne sera effectué le mois prochain.", statut_abonnement: 'resilie_fin_periode' };
}

/**
 * Réactivation de l'abonnement
 */
async function reactiverAbonnement({ pool, stripe }, { id_salon }) {
    await assurerColonnesAbonnementEtSms(pool);
    const curRes = await pool.query(`SELECT stripe_subscription_id FROM configuration_salon WHERE id_salon = $1`, [id_salon]);
    const subId = curRes.rows[0]?.stripe_subscription_id;

    if (subId && stripe && process.env.STRIPE_SECRET_KEY) {
        await stripe.subscriptions.update(subId, { cancel_at_period_end: false }).catch(() => {});
    }
    await pool.query(`UPDATE configuration_salon SET statut_abonnement = 'actif' WHERE id_salon = $1`, [id_salon]);
    return { message: "Abonnement réactivé !", statut_abonnement: 'actif' };
}

/**
 * Traitement des Webhooks Stripe
 */
async function traiterWebhookStripe({ pool, stripe }, { rawBody, signature, webhookSecret }) {
    if (!webhookSecret) {
        throw { status: 500, message: "Clé secrète Webhook Stripe manquante." };
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
        throw { status: 400, message: `Webhook Error: ${err.message}` };
    }

    // 1. Nouvel Abonnement
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const idSalon = session.metadata?.id_salon;
        const planChoisi = session.metadata?.plan_choisi || 'PREMIUM';
        const frequence = session.metadata?.frequence || 'MENSUEL';

        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1, _subscription_id = $2 WHERE _customer_id = $3', ['actif', session.subscription, session.customer]).catch(() => {});
        if (idSalon) {
            await pool.query('UPDATE configuration_salon SET plan_actuel = $1, frequence_paiement = $2, stripe_subscription_id = COALESCE($3, stripe_subscription_id), empreinte_cb_validee = TRUE, statut_abonnement = \'actif\' WHERE id_salon = $4', [planChoisi, frequence, session.subscription, idSalon]).catch(() => {});
        }

        // 1.b. Validation de l'Acompte Anti-NoShow pour une réservation en ligne
        if (session.metadata?.id_rdv) {
            const idRdv = parseInt(session.metadata.id_rdv, 10);
            const acompteMontant = parseFloat(session.metadata.acompte_montant || 0);
            const rdvRes = await pool.query(
                `UPDATE rendez_vous 
                 SET acompte_paye = acompte_paye + $1,
                     statut_acompte = 'PAYE_STRIPE',
                     stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id)
                 WHERE id_rdv = $3
                 RETURNING *`,
                [acompteMontant, session.payment_intent || session.id, idRdv]
            ).catch(() => ({ rows: [] }));

            if (rdvRes.rows && rdvRes.rows.length > 0) {
                const rdv = rdvRes.rows[0];
                const confRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [rdv.id_salon]).catch(() => ({ rows: [] }));
                const clientRes = rdv.id_client ? await pool.query('SELECT * FROM clients WHERE id_client = $1', [rdv.id_client]).catch(() => ({ rows: [] })) : { rows: [] };
                const empRes = rdv.id_employe ? await pool.query('SELECT nom FROM employes WHERE id_employe = $1', [rdv.id_employe]).catch(() => ({ rows: [] })) : { rows: [] };

                try {
                    const { envoyerEmailConfirmationRdvBrevo } = require('../agenda/agenda.service');
                    if (envoyerEmailConfirmationRdvBrevo) {
                        await envoyerEmailConfirmationRdvBrevo({ pool }, {
                            id_salon: rdv.id_salon,
                            rdv,
                            client: clientRes.rows[0] || { nom: rdv.nom_client, telephone: rdv.telephone_client, email: rdv.email_client },
                            configSalon: confRes.rows[0] || {},
                            employeNom: empRes.rows[0]?.nom || ''
                        });
                    }
                } catch (mailErr) {
                    console.error("⚠️ Erreur Brevo après confirmation Stripe :", mailErr.message);
                }
            }
        }
    }

    // 2. Résiliation
    if (event.type === 'customer.subscription.deleted') {
        const session = event.data.object;
        await pool.query('UPDATE utilisateurs SET statut_abonnement = $1 WHERE _subscription_id = $2', ['inactif', session.id]).catch(() => {});

        const userQuery = await pool.query('SELECT id_salon FROM utilisateurs WHERE _subscription_id = $1', [session.id]);
        if (userQuery.rowCount > 0) {
            await pool.query("UPDATE configuration_salon SET plan_actuel = 'ESSENTIAL', statut_abonnement = 'inactif' WHERE id_salon = $1", [userQuery.rows[0].id_salon]).catch(() => {});
        }
    }

    // 3. Facture Mensuelle Payée (Moteur de Commissions STACK Partners)
    if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.paid') {
        const invoice = event.data.object;

        if (invoice.amount_paid > 0) {
            const customerId = invoice.customer;
            const subId = invoice.subscription || null;

            const salonLookup = await pool.query(`
                SELECT s.id_salon, s.id_agent_apporteur, s.plan_actuel, a.date_fin_commissionnement
                FROM utilisateurs u
                JOIN configuration_salon s ON u.id_salon = s.id_salon
                LEFT JOIN partner_attributions_salons a ON s.id_salon = a.id_salon
                WHERE (u._customer_id = $1 OR ($2::varchar IS NOT NULL AND u._subscription_id = $2) OR LOWER(TRIM(u.email)) = LOWER(TRIM($3)))
                  AND COALESCE(s.est_bac_a_sable, FALSE) = FALSE
                LIMIT 1
            `, [customerId, subId, invoice.customer_email || '']);

            if (salonLookup.rowCount > 0) {
                const { id_salon, id_agent_apporteur, plan_actuel } = salonLookup.rows[0];
                let date_fin = salonLookup.rows[0].date_fin_commissionnement;

                const planPayant = (plan_actuel && plan_actuel !== 'PREMIUM_TRIAL') ? plan_actuel : 'PREMIUM';
                await pool.query(`UPDATE utilisateurs SET statut_abonnement = 'actif' WHERE id_salon = $1`, [id_salon]).catch(() => {});
                await pool.query(`UPDATE configuration_salon SET plan_actuel = $1, statut_abonnement = 'actif' WHERE id_salon = $2`, [planPayant, id_salon]).catch(() => {});

                if (id_agent_apporteur) {
                    if (!date_fin) {
                        const updateRes = await pool.query(`
                            INSERT INTO partner_attributions_salons (id_salon, id_agent, mode_attribution, statut_onboarding, date_debut_commissionnement, date_fin_commissionnement)
                            VALUES ($1, $2, 'LIEN_AFFILIATION', 'GO_LIVE_VALIDE', CURRENT_DATE, (CURRENT_DATE + INTERVAL '24 months')::DATE)
                            ON CONFLICT (id_salon) DO UPDATE
                            SET date_debut_commissionnement = COALESCE(partner_attributions_salons.date_debut_commissionnement, CURRENT_DATE),
                                date_fin_commissionnement = COALESCE(partner_attributions_salons.date_fin_commissionnement, (CURRENT_DATE + INTERVAL '24 months')::DATE),
                                statut_onboarding = 'GO_LIVE_VALIDE'
                            RETURNING date_fin_commissionnement
                        `, [id_salon, id_agent_apporteur]);
                        date_fin = updateRes.rows[0].date_fin_commissionnement;
                    }

                    if (new Date() <= new Date(date_fin)) {
                        const baseCents = invoice.subtotal_excluding_tax || invoice.amount_Excluding_Tax || invoice.amount_paid;
                        const montantBaseHT = Number((baseCents / 100).toFixed(2));
                        const montantCommission = Number((montantBaseHT * 0.20).toFixed(2));
                        const periodeMois = new Date((invoice.created || Math.floor(Date.now() / 1000)) * 1000).toISOString().slice(0, 7);

                        const seuilRes = await pool.query(`
                            SELECT COUNT(DISTINCT s.id_salon) as nb_actifs
                            FROM configuration_salon s
                            JOIN utilisateurs u ON u.id_salon = s.id_salon AND u.role = 'gerant'
                            WHERE s.id_agent_apporteur = $1
                              AND u.statut_abonnement = 'actif'
                              AND s.plan_actuel != 'PREMIUM_TRIAL'
                              AND COALESCE(s.est_bac_a_sable, FALSE) = FALSE
                        `, [id_agent_apporteur]);

                        const nbActifs = parseInt(seuilRes.rows[0].nb_actifs, 10) || 0;
                        const statutCommission = nbActifs >= 3 ? 'ACQUISE_A_PAYER' : 'EN_ATTENTE_SEUIL';

                        await pool.query(`
                            INSERT INTO partner_commissions 
                            (id_agent, id_salon, type_commission, periode_mois, montant_base_ht, taux_applique, montant_commission, statut_commission)
                            VALUES ($1, $2, 'ABONNEMENT_RECURRENT_20_POURCENT', $3, $4, 20.00, $5, $6)
                            ON CONFLICT (id_salon, periode_mois, type_commission) DO UPDATE
                            SET montant_base_ht = EXCLUDED.montant_base_ht,
                                montant_commission = EXCLUDED.montant_commission,
                                statut_commission = CASE WHEN partner_commissions.statut_commission = 'PAYEE' THEN 'PAYEE' ELSE EXCLUDED.statut_commission END
                        `, [id_agent_apporteur, id_salon, periodeMois, montantBaseHT, montantCommission, statutCommission]);

                        if (nbActifs >= 3) {
                            await pool.query(`
                                UPDATE partner_commissions
                                SET statut_commission = 'ACQUISE_A_PAYER'
                                WHERE id_agent = $1 AND statut_commission = 'EN_ATTENTE_SEUIL'
                            `, [id_agent_apporteur]);
                        }
                    }
                }
            }
        }
    }

    return { received: true };
}

module.exports = {
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
};
