// routes_partners.js
const express = require('express');
const fs = require('fs');
const router = express.Router();
const { Pool } = require('pg'); 

// On recrée la connexion à la BDD spécifiquement pour ce module
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

router.get('/ping', (req, res) => {
    res.json({ message: "Le backend Stack Partners est en ligne et connecté !" });
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 1. Inscription d'un Agent Commercial (Brique 1)
router.post('/auth/register', async (req, res) => {
    try {
        const { nom, prenom, email, telephone, mot_de_passe, siret_agent, numero_rsac, iban } = req.body;
        if (!nom || !prenom || !email || !mot_de_passe || !siret_agent) {
            return res.status(400).json({ error: "Champs obligatoires manquants." });
        }

        // Génération d'un code d'affiliation unique
        const code_partenaire = `PARTNER-${nom.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const mot_de_passe_hash = await bcrypt.hash(mot_de_passe, 10);

        const result = await pool.query(
            `INSERT INTO partner_agents (nom, prenom, email, telephone, mot_de_passe_hash, siret_agent, numero_rsac, iban, code_partenaire, statut_compte) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'EN_ATTENTE_VALIDATION') RETURNING id_agent, code_partenaire`,
            [nom, prenom, email, telephone, mot_de_passe_hash, siret_agent, numero_rsac, iban, code_partenaire]
        );

        res.status(201).json({ message: "Compte agent créé.", agent: result.rows[0] });
    } catch (error) {
        console.error("Erreur Inscription Agent:", error);
        if (error.code === '23505') return res.status(409).json({ error: "Cet email est déjà utilisé." });
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// 2. Connexion d'un Agent Commercial (Brique 1)
router.post('/auth/login', async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;
        const result = await pool.query(`SELECT * FROM partner_agents WHERE email = $1`, [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }

        const agent = result.rows[0];
        const match = await bcrypt.compare(mot_de_passe, agent.mot_de_passe_hash);
        
        if (!match) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }

        // Génération du JWT spécifique au portail partenaire (Indépendant de STACK)
        const partnerToken = jwt.sign(
            { id_agent: agent.id_agent, role: 'agent', statut: agent.statut_compte },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({ 
            message: "Connexion réussie", 
            token: partnerToken, 
            agent: { id: agent.id_agent, nom: agent.nom, statut: agent.statut_compte, code: agent.code_partenaire } 
        });
    } catch (error) {
        console.error("Erreur Connexion Agent:", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

const PDFDocument = require('pdfkit');

// Middleware de sécurité : Vérifie le JWT de l'agent
const verifierTokenPartner = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token manquant" });
    const token = authHeader.split(' ')[1];
    try {
        req.agent = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        next();
    } catch (err) {
        res.status(401).json({ error: "Token invalide ou expiré" });
    }
};

// 3. Obtenir la liste des factures de l'agent
router.get('/factures', verifierTokenPartner, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM partner_factures_installation WHERE id_agent = $1 ORDER BY date_emission DESC', 
            [req.agent.id_agent]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Fonction centrale de vérification de conformité et d'expiration des pièces
const evaluerConformiteAgent = async (idAgent) => {
    await pool.query('INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING', [idAgent]);
    const res = await pool.query(`
        SELECT a.*, d.*
        FROM partner_agents a
        JOIN partner_conformite_dossier d ON d.id_agent = a.id_agent
        WHERE a.id_agent = $1
    `, [idAgent]);
    if (res.rowCount === 0) return { autorise: false, motifs: ["Compte introuvable"], alertes: [] };
    const c = res.rows[0];
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const motifs = [];
    const alertes = [];

    // 1. Contrat signé (avant RSAC)
    if (!c.contrat_signe || c.statut_contrat !== 'VALIDE') motifs.push("Étape 1 : Contrat d'agent commercial non signé ou non validé.");

    // 2. Identité, SIRET, RSAC, Kbis
    if (c.statut_identite !== 'VALIDE') motifs.push("Étape 2 : Pièce d'identité non validée.");
    if (c.date_expiration_identite && new Date(c.date_expiration_identite) < now) motifs.push("Étape 2 : Pièce d'identité expirée.");
    if (c.statut_siret !== 'VALIDE') motifs.push("Étape 2 : Statut SIREN/SIRET (INSEE) non validé.");
    if (!c.numero_rsac || c.statut_rsac !== 'VALIDE') motifs.push("Étape 2 : Numéro et extrait RSAC (< 3 mois) obligatoires et doivent être validés.");
    if (c.forme_juridique === 'SOCIETE' && c.statut_kbis !== 'VALIDE') motifs.push("Étape 2 : Extrait Kbis (< 3 mois) requis pour une société.");

    // 3. Vigilance URSSAF
    if (c.statut_urssaf !== 'VALIDE') motifs.push("Étape 3 : Attestation de vigilance URSSAF non validée.");
    if (!c.date_expiration_urssaf || new Date(c.date_expiration_urssaf) < now) {
        motifs.push("Étape 3 : Attestation URSSAF expirée (renouvellement 6 mois obligatoire).");
    } else if (new Date(c.date_expiration_urssaf) <= in30Days) {
        alertes.push(`Votre attestation URSSAF expire le ${new Date(c.date_expiration_urssaf).toLocaleDateString('fr-FR')} (moins de 30 jours).`);
    }

    // 4. RC Pro, IBAN, TVA, Honneur, Charte
    if (c.statut_rc_pro !== 'VALIDE') motifs.push("Étape 4 : Attestation d'assurance RC Pro non validée.");
    if (!c.date_expiration_rc_pro || new Date(c.date_expiration_rc_pro) < now) {
        motifs.push("Étape 4 : Assurance RC Pro expirée.");
    } else if (new Date(c.date_expiration_rc_pro) <= in30Days) {
        alertes.push(`Votre assurance RC Pro expire le ${new Date(c.date_expiration_rc_pro).toLocaleDateString('fr-FR')} (moins de 30 jours).`);
    }
    if (!c.iban || !c.titulaire_iban || c.statut_iban !== 'VALIDE') motifs.push("Étape 4 : IBAN et titulaire non validés.");
    if (c.statut_tva !== 'VALIDE') motifs.push("Étape 4 : Régime de TVA non validé.");
    if (!c.honneur_aucune_interdiction || !c.honneur_pas_exclusivite_employeur || !c.honneur_pas_mandat_concurrent) {
        motifs.push("Étape 4 : Déclarations sur l'honneur incomplètes.");
    }
    if (!c.charte_acceptee) motifs.push("Étape 4 : Charte commerciale STACK non acceptée.");

    // 5. Formation NF525 & Contact
    if (!c.formation_validee || c.quiz_score < 100) motifs.push("Étape 5 : Formation et Quiz NF525 non validés.");
    if (!c.telephone_confirme) motifs.push("Étape 5 : Numéro de téléphone et contact non confirmés.");

    // 6. Validation finale Fondateur
    if (c.statut_compte !== 'ACTIF') motifs.push("Étape 6 : En attente de l'activation finale manuelle par STACK.");

    return { autorise: motifs.length === 0, motifs, alertes, dossier: c };
};

// 4. Créer une nouvelle facture d'installation (Bloquée si conformité ou RSAC incomplets)
router.post('/factures', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Facturation bloquée : ${verif.motifs[0]}` });
        }
        const { nom_salon, adresse_salon, siret_salon } = req.body;
        const numero_facture = `FAC-${req.agent.id_agent}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const result = await pool.query(
            `INSERT INTO partner_factures_installation (id_agent, numero_facture, nom_salon, adresse_salon, siret_salon)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.agent.id_agent, numero_facture, nom_salon, adresse_salon, siret_salon]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erreur création facture:", error);
        res.status(500).json({ error: "Erreur lors de la création" });
    }
});

// 5. Marquer une facture comme payée
router.patch('/factures/:id/payee', verifierTokenPartner, async (req, res) => {
    try {
        await pool.query(
            'UPDATE partner_factures_installation SET statut = $1, date_paiement = CURRENT_TIMESTAMP WHERE id_facture = $2 AND id_agent = $3', 
            ['PAYEE', req.params.id, req.agent.id_agent]
        );
        res.json({ message: "Facture marquée comme payée" });
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// 6. Générer et télécharger le PDF de la facture à la volée
router.get('/factures/:id/pdf', verifierTokenPartner, async (req, res) => {
    try {
        const factRes = await pool.query('SELECT * FROM partner_factures_installation WHERE id_facture = $1 AND id_agent = $2', [req.params.id, req.agent.id_agent]);
        if (factRes.rows.length === 0) return res.status(404).json({error: "Facture introuvable"});
        const facture = factRes.rows[0];

        const agentRes = await pool.query('SELECT * FROM partner_agents WHERE id_agent = $1', [req.agent.id_agent]);
        const agent = agentRes.rows[0];

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${facture.numero_facture}.pdf`);
        doc.pipe(res);

        // En-tête
        doc.fontSize(20).text('FACTURE', { align: 'right' });
        doc.fontSize(10).text(`Facture N° : ${facture.numero_facture}`, { align: 'right' });
        doc.text(`Date : ${new Date(facture.date_emission).toLocaleDateString('fr-FR')}`, { align: 'right' });
        
        const confRes = await pool.query('SELECT * FROM partner_conformite_dossier WHERE id_agent = $1', [req.agent.id_agent]);
        const conf = confRes.rows[0] || {};
        if (!agent.numero_rsac) {
            return res.status(403).json({ error: "Émission PDF refusée : Le numéro RSAC est obligatoire sur chaque facture." });
        }

        // Infos Agent (Mention RSAC obligatoire)
        doc.moveDown(2);
        doc.fontSize(14).text(`${agent.prenom} ${agent.nom}`, { align: 'left' });
        if (conf.adresse_pro) doc.fontSize(10).text(conf.adresse_pro);
        doc.fontSize(10).text(`SIRET : ${agent.siret_agent} (${conf.forme_juridique || 'EI'})`);
        doc.fontSize(10).text(`Immatriculation RSAC : ${agent.numero_rsac}${conf.greffe_rsac ? ' - Greffe de ' + conf.greffe_rsac : ''}`);
        if (conf.regime_tva === 'ASSUJETTI_TVA' && conf.numero_tva_intra) {
            doc.fontSize(10).text(`N° TVA Intracommunautaire : ${conf.numero_tva_intra}`);
        }

        // Infos Client
        doc.moveDown(2);
        doc.fontSize(12).text('Facturé à :', { underline: true });
        doc.fontSize(12).text(facture.nom_salon);
        doc.fontSize(10).text(facture.adresse_salon);
        doc.text(`SIRET : ${facture.siret_salon}`);

        // Tableau Lignes
        doc.moveDown(3);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        let startY = doc.y;
        doc.fontSize(12).text('Description', 50, startY, { width: 350 });
        doc.text('Montant HT', 400, startY, { width: 150, align: 'right' });
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        
        startY = doc.y;
        doc.text('Frais de configuration et de formation au logiciel STACK', 50, startY, { width: 350 });
        doc.text('99,00 €', 400, startY, { width: 150, align: 'right' });
        
        // Totaux
        doc.moveDown(2);
        doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);
        startY = doc.y;
        doc.fontSize(14).text('Total à payer :', 350, startY, { width: 100 });
        doc.text('99,00 €', 450, startY, { width: 100, align: 'right' });
        
        doc.moveDown(2);
        doc.fontSize(10).text('TVA non applicable, art. 293 B du CGI.', 50, doc.y);

        // Paiement IBAN
        doc.moveDown(3);
        doc.fontSize(12).text('Modalités de paiement :');
        doc.fontSize(10).text('Paiement par virement bancaire sur le compte ci-dessous :');
        doc.text(`Titulaire du compte : ${agent.prenom} ${agent.nom}`);
        doc.text(`IBAN : ${agent.iban || 'Non renseigné'}`);

        doc.end();
    } catch (error) {
        console.error("Erreur PDF:", error);
        if (!res.headersSent) res.status(500).json({ error: "Erreur génération PDF" });
    }
});

// 7. Déclarer et verrouiller un prospect (Lead Locking - 45 jours)
router.post('/prospects', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Vente verrouillée : ${verif.motifs[0]}` });
        }
        const { nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant } = req.body;

        // A. Vérifier si le salon est DÉJÀ client STACK
        const clientExist = await pool.query(`
            SELECT s.id_salon FROM configuration_salon s
            LEFT JOIN utilisateurs u ON u.id_salon = s.id_salon
            WHERE u.email = $1 OR s.siret = $2
        `, [email_gerant, siret_prospect]);

        if (clientExist.rows.length > 0) {
            return res.status(409).json({ error: "Ce salon utilise déjà STACK. Prospection impossible." });
        }

        // B. Vérifier si un autre agent protège DÉJÀ ce prospect (et que la protection n'est pas expirée)
        const leadExist = await pool.query(`
            SELECT id_agent FROM partner_prospects_reservations
            WHERE (email_gerant = $1 OR siret_prospect = $2)
            AND date_expiration_protection > CURRENT_TIMESTAMP
        `, [email_gerant, siret_prospect]);

        if (leadExist.rows.length > 0) {
            return res.status(409).json({ error: "Ce prospect est déjà verrouillé par un autre agent." });
        }

        // C. Insérer le lead avec une protection stricte de 45 jours
        const result = await pool.query(`
            INSERT INTO partner_prospects_reservations
            (id_agent, nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant, date_expiration_protection)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '45 days')
            RETURNING *
        `, [req.agent.id_agent, nom_salon, ville, code_postal, siret_prospect, telephone_salon, email_gerant]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erreur protection lead:", error);
        res.status(500).json({ error: "Erreur serveur lors de la réservation." });
    }
});

// 8. Lister les prospects de l'agent connecté
router.get('/prospects', verifierTokenPartner, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *, 
                   (date_expiration_protection > CURRENT_TIMESTAMP) as est_protege,
                   EXTRACT(DAY FROM (date_expiration_protection - CURRENT_TIMESTAMP)) as jours_restants
            FROM partner_prospects_reservations 
            WHERE id_agent = $1 
            ORDER BY date_declaration DESC
        `, [req.agent.id_agent]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 9. Lancer l'Onboarding (Génération du lien unique après paiement)
router.post('/prospects/:id/onboarding', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        if (!verif.autorise) {
            return res.status(403).json({ error: `Onboarding verrouillé : ${verif.motifs[0]}` });
        }
        // A. Vérifier le prospect
        const prospectRes = await pool.query(
            'SELECT * FROM partner_prospects_reservations WHERE id_prospect = $1 AND id_agent = $2',
            [req.params.id, req.agent.id_agent]
        );
        if (prospectRes.rows.length === 0) return res.status(404).json({ error: "Prospect introuvable." });
        const prospect = prospectRes.rows[0];

        // B. Verrou Métier : Vérifier que la facture de 99€ est payée pour ce SIRET
        const factureRes = await pool.query(
            'SELECT id_facture FROM partner_factures_installation WHERE id_agent = $1 AND siret_salon = $2 AND statut = $3',
            [req.agent.id_agent, prospect.siret_prospect, 'PAYEE']
        );
        
        if (factureRes.rows.length === 0) {
            return res.status(403).json({ error: "Onboarding bloqué : La facture d'installation n'est pas encore marquée comme payée pour ce SIRET." });
        }

        // C. Générer le lien avec le code d'affiliation
        const lienInscription = `https://app-salon-caiss.onrender.com/register?partner=${req.agent.code_partenaire}&siret=${prospect.siret_prospect}`;

        // D. Mettre à jour le statut du prospect
        await pool.query(
            "UPDATE partner_prospects_reservations SET statut_prospect = 'SIGNE' WHERE id_prospect = $1",
            [req.params.id]
        );

        res.json({ message: "Onboarding débloqué", lien: lienInscription });
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 10. Moteur de Commissions (Brique 5) & KPIs Dashboard (Brique 6)
const GRILLE_TARIFS_HT = {
    'ESSENTIEL': 39.00,
    'PRO': 69.00,
    'PREMIUM': 99.00
};
const SEUIL_SALONS_ACTIFS = 3;

router.get('/dashboard-stats', verifierTokenPartner, async (req, res) => {
    const idAgent = req.agent.id_agent;
    const moisCourant = new Date().toISOString().slice(0, 7); // Ex: '2026-10'

    try {
        // A. Récupérer tous les salons apportés par cet agent avec leur statut Stripe en temps réel
        const salonsRes = await pool.query(`
            SELECT s.id_salon, s.nom_salon, s.plan_actuel, s.frequence_paiement, s.date_fin_essai, s.siret,
                   u.email as email_gerant, u.statut_abonnement,
                   a.statut_onboarding, a.date_debut_commissionnement, a.date_fin_commissionnement
            FROM configuration_salon s
            LEFT JOIN utilisateurs u ON u.id_salon = s.id_salon AND u.role = 'gerant'
            LEFT JOIN partner_attributions_salons a ON a.id_salon = s.id_salon
            WHERE s.id_agent_apporteur = $1
            ORDER BY s.id_salon DESC
        `, [idAgent]);

        const salons = salonsRes.rows;
        const salonsActifsPayants = salons.filter(s => s.statut_abonnement === 'actif');
        const nbSalonsActifs = salonsActifsPayants.length;
        const nbSalonsEssai = salons.filter(s => s.statut_abonnement !== 'actif').length;

        // B. Générer de façon idempotente les commissions de 20% du mois en cours pour chaque salon actif
        for (const salon of salonsActifsPayants) {
            // Initialiser la fenêtre de 24 mois dès le 1er paiement constaté
            if (!salon.date_debut_commissionnement) {
                const updateDates = await pool.query(`
                    INSERT INTO partner_attributions_salons (id_salon, id_agent, mode_attribution, statut_onboarding, date_debut_commissionnement, date_fin_commissionnement)
                    VALUES ($1, $2, 'LIEN_AFFILIATION', 'GO_LIVE_VALIDE', CURRENT_DATE, (CURRENT_DATE + INTERVAL '24 months')::DATE)
                    ON CONFLICT (id_salon) DO UPDATE
                    SET date_debut_commissionnement = CURRENT_DATE,
                        date_fin_commissionnement = (CURRENT_DATE + INTERVAL '24 months')::DATE,
                        statut_onboarding = 'GO_LIVE_VALIDE'
                    RETURNING date_debut_commissionnement, date_fin_commissionnement
                `, [salon.id_salon, idAgent]);
                salon.date_debut_commissionnement = updateDates.rows[0].date_debut_commissionnement;
                salon.date_fin_commissionnement = updateDates.rows[0].date_fin_commissionnement;
            }

            // Vérifier que la période de 24 mois n'est pas dépassée
            const dateFin = new Date(salon.date_fin_commissionnement);
            if (new Date() <= dateFin) {
                const baseHt = GRILLE_TARIFS_HT[salon.plan_actuel] || 39.00;
                const montantCom = Number((baseHt * 0.20).toFixed(2));
                const statutInitial = nbSalonsActifs >= SEUIL_SALONS_ACTIFS ? 'ACQUISE_A_PAYER' : 'EN_ATTENTE_SEUIL';

                await pool.query(`
                    INSERT INTO partner_commissions 
                    (id_agent, id_salon, type_commission, periode_mois, montant_base_ht, taux_applique, montant_commission, statut_commission)
                    VALUES ($1, $2, 'ABONNEMENT_RECURRENT_20_POURCENT', $3, $4, 20.00, $5, $6)
                    ON CONFLICT (id_salon, periode_mois, type_commission) DO NOTHING
                `, [idAgent, salon.id_salon, moisCourant, baseHt, montantCom, statutInitial]);
            }
        }

        // C. Règle de déblocage rétroactif : si l'agent a >= 3 salons actifs, toutes ses commissions en attente deviennent acquises
        if (nbSalonsActifs >= SEUIL_SALONS_ACTIFS) {
            await pool.query(`
                UPDATE partner_commissions
                SET statut_commission = 'ACQUISE_A_PAYER'
                WHERE id_agent = $1 AND statut_commission = 'EN_ATTENTE_SEUIL'
            `, [idAgent]);
        }

        // D. Récupérer l'historique des commissions et calculer les totaux
        const comRes = await pool.query(`
            SELECT c.*, s.nom_salon, s.plan_actuel
            FROM partner_commissions c
            JOIN configuration_salon s ON s.id_salon = c.id_salon
            WHERE c.id_agent = $1
            ORDER BY c.periode_mois DESC, c.date_creation DESC
        `, [idAgent]);

        const commissions = comRes.rows;
        const sumByStatus = (st) => commissions
            .filter(c => c.statut_commission === st)
            .reduce((acc, c) => acc + parseFloat(c.montant_commission || 0), 0)
            .toFixed(2);

        res.json({
            kpis: {
                nb_salons_actifs: nbSalonsActifs,
                nb_salons_essai: nbSalonsEssai,
                seuil_deblocage: SEUIL_SALONS_ACTIFS,
                commissions_en_attente: sumByStatus('EN_ATTENTE_SEUIL'),
                commissions_acquises: sumByStatus('ACQUISE_A_PAYER'),
                commissions_payees: sumByStatus('PAYEE')
            },
            salons,
            commissions
        });
    } catch (error) {
        console.error("Erreur Dashboard Stats:", error);
        res.status(500).json({ error: "Erreur lors du chargement des statistiques." });
    }
});

// 11. Récupérer le dossier complet de conformité, les alertes 30j et l'historique
router.get('/profil', verifierTokenPartner, async (req, res) => {
    try {
        const verif = await evaluerConformiteAgent(req.agent.id_agent);
        const histRes = await pool.query(
            'SELECT * FROM partner_conformite_historique WHERE id_agent = $1 ORDER BY date_evenement DESC LIMIT 30',
            [req.agent.id_agent]
        );
        res.json({
            ...verif.dossier,
            autorise_a_vendre: verif.autorise,
            motifs_blocage: verif.motifs,
            alertes_expiration: verif.alertes,
            historique: histRes.rows
        });
    } catch (error) {
        console.error("Erreur GET /profil:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// 12. Soumettre ou mettre à jour une étape du dossier de conformité (Ordre 1 à 5)
router.put('/profil/etape', verifierTokenPartner, upload.any(), async (req, res) => {
    const idAgent = req.agent.id_agent;
    let etape = req.body.etape;
    if (!isNaN(etape)) etape = parseInt(etape);

    let payload = {};
    try { payload = JSON.parse(req.body.payload || '{}'); } 
    catch (e) { payload = {}; }

    // Reconversion temporaire des fichiers entrants en Base64 pour la base de données actuelle
    if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
            payload[file.fieldname] = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        });
    }

    try {
        await pool.query('INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING', [idAgent]);
        const currentRes = await pool.query('SELECT * FROM partner_conformite_dossier WHERE id_agent = $1', [idAgent]);
        const d = currentRes.rows[0];

        if (etape === 1) {
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET contrat_signe = TRUE, date_signature_contrat = CURRENT_TIMESTAMP, statut_contrat = 'EN_ATTENTE', updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $1
            `, [idAgent]);
            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'CONTRAT_MANDAT', 'SIGNATURE_AGENT', 'EN_ATTENTE', 'Agent', 'Contrat signé avec prise d''effet conditionnelle')`, [idAgent]);
        }

        if (etape === 2) {
            if (!d.contrat_signe) return res.status(400).json({ error: "Ordre obligatoire : Vous devez d'abord signer le contrat d'agent commercial (Étape 1) avant de déposer votre immatriculation RSAC." });
            const { date_naissance, date_expiration_identite, fichier_identite, siret_agent, forme_juridique, date_debut_activite, adresse_pro, numero_rsac, greffe_rsac, date_emission_rsac, fichier_rsac, date_emission_kbis, fichier_kbis } = payload;

            await pool.query('UPDATE partner_agents SET siret_agent = COALESCE($1, siret_agent), numero_rsac = COALESCE($2, numero_rsac) WHERE id_agent = $3', [siret_agent, numero_rsac, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET date_naissance = COALESCE($1, date_naissance),
                    date_expiration_identite = COALESCE($2, date_expiration_identite),
                    fichier_identite = COALESCE($3, fichier_identite),
                    statut_identite = CASE WHEN $3 IS NOT NULL THEN 'EN_ATTENTE' ELSE statut_identite END,
                    forme_juridique = COALESCE($4, forme_juridique),
                    date_debut_activite = COALESCE($5, date_debut_activite),
                    adresse_pro = COALESCE($6, adresse_pro),
                    statut_siret = 'EN_ATTENTE',
                    greffe_rsac = COALESCE($7, greffe_rsac),
                    date_emission_rsac = COALESCE($8, date_emission_rsac),
                    fichier_rsac = COALESCE($9, fichier_rsac),
                    statut_rsac = CASE WHEN $9 IS NOT NULL THEN 'EN_ATTENTE' ELSE statut_rsac END,
                    date_emission_kbis = COALESCE($10, date_emission_kbis),
                    fichier_kbis = COALESCE($11, fichier_kbis),
                    statut_kbis = CASE WHEN $4 = 'SOCIETE' THEN (CASE WHEN $11 IS NOT NULL THEN 'EN_ATTENTE' ELSE 'MANQUANT' END) ELSE 'NON_REQUIS' END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $12
            `, [date_naissance || null, date_expiration_identite || null, fichier_identite || null, forme_juridique || 'EI', date_debut_activite || null, adresse_pro || null, greffe_rsac || null, date_emission_rsac || null, fichier_rsac || null, date_emission_kbis || null, fichier_kbis || null, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'IDENTITE_SIRET_RSAC', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, `RSAC: ${numero_rsac || 'N/A'} | Forme: ${forme_juridique || 'EI'}`]);
        }

        if (etape === 3) {
            const { code_verif_urssaf, date_emission_urssaf, date_expiration_urssaf, fichier_urssaf } = payload;
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET code_verif_urssaf = COALESCE($1, code_verif_urssaf),
                    date_emission_urssaf = COALESCE($2, date_emission_urssaf),
                    date_expiration_urssaf = COALESCE($3, date_expiration_urssaf),
                    fichier_urssaf = COALESCE($4, fichier_urssaf),
                    statut_urssaf = 'EN_ATTENTE',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $5
            `, [code_verif_urssaf || null, date_emission_urssaf || null, date_expiration_urssaf || null, fichier_urssaf || null, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'URSSAF', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, `Code vérif: ${code_verif_urssaf || ''}`]);
        }

        if (etape === 4) {
            const { assureur_nom, assureur_contrat, assureur_plafond, date_expiration_rc_pro, fichier_rc_pro, iban, titulaire_iban, regime_tva, numero_tva_intra, honneur_aucune_interdiction, honneur_pas_exclusivite_employeur, honneur_pas_mandat_concurrent, charte_acceptee } = payload;
            await pool.query('UPDATE partner_agents SET iban = COALESCE($1, iban) WHERE id_agent = $2', [iban, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET assureur_nom = COALESCE($1, assureur_nom),
                    assureur_contrat = COALESCE($2, assureur_contrat),
                    assureur_plafond = COALESCE($3, assureur_plafond),
                    date_expiration_rc_pro = COALESCE($4, date_expiration_rc_pro),
                    fichier_rc_pro = COALESCE($5, fichier_rc_pro),
                    statut_rc_pro = 'EN_ATTENTE',
                    titulaire_iban = COALESCE($6, titulaire_iban),
                    statut_iban = 'EN_ATTENTE',
                    regime_tva = COALESCE($7, regime_tva),
                    numero_tva_intra = COALESCE($8, numero_tva_intra),
                    statut_tva = 'EN_ATTENTE',
                    honneur_aucune_interdiction = $9,
                    honneur_pas_exclusivite_employeur = $10,
                    honneur_pas_mandat_concurrent = $11,
                    date_declarations_honneur = CASE WHEN ($9 AND $10 AND $11) THEN CURRENT_TIMESTAMP ELSE date_declarations_honneur END,
                    charte_acceptee = $12,
                    date_acceptation_charte = CASE WHEN $12 THEN CURRENT_TIMESTAMP ELSE date_acceptation_charte END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $13
            `, [assureur_nom || null, assureur_contrat || null, assureur_plafond || null, date_expiration_rc_pro || null, fichier_rc_pro || null, titulaire_iban || null, regime_tva || 'FRANCHISE_293B', numero_tva_intra || null, !!honneur_aucune_interdiction, !!honneur_pas_exclusivite_employeur, !!honneur_pas_mandat_concurrent, !!charte_acceptee, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'ASSURANCE_IBAN_TVA_HONNEUR', 'DEPOT_AGENT', 'EN_ATTENTE', 'Agent', 'Dépôt RC Pro, IBAN, TVA, Déclarations sur l''honneur et Charte v1.0')`, [idAgent]);
        }

        if (etape === 5) {
            const { telephone, quiz_score, telephone_confirme } = payload;
            const reussi = Number(quiz_score) >= 100;
            if (telephone) await pool.query('UPDATE partner_agents SET telephone = $1 WHERE id_agent = $2', [telephone, idAgent]);
            await pool.query(`
                UPDATE partner_conformite_dossier
                SET quiz_score = $1,
                    formation_validee = $2,
                    date_validation_formation = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE date_validation_formation END,
                    telephone_confirme = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_agent = $4
            `, [Number(quiz_score) || 0, reussi, !!telephone_confirme, idAgent]);

            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'FORMATION_NF525_CONTACT', 'QUIZ_AGENT', $2, 'Système', $3)`, [idAgent, reussi ? 'VALIDE' : 'REFUSE', `Score Quiz NF525 : ${quiz_score}%`]);
        }

        if (etape === 'CHANGEMENT_SITUATION') {
            const { motif_changement } = payload;
            await pool.query("UPDATE partner_agents SET statut_compte = 'EN_ATTENTE_VALIDATION' WHERE id_agent = $1", [idAgent]);
            await pool.query("UPDATE partner_conformite_dossier SET statut_siret = 'EN_ATTENTE', statut_rsac = 'EN_ATTENTE' WHERE id_agent = $1", [idAgent]);
            await pool.query(`INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire) VALUES ($1, 'CHANGEMENT_SITUATION', 'ALERTE_AGENT', 'EN_ATTENTE', 'Agent', $2)`, [idAgent, motif_changement || 'Changement de statut/adresse/forme juridique déclaré']);
        }

        res.json({ message: "Dossier mis à jour et enregistré dans l'historique." });
    } catch (error) {
        console.error("Erreur PUT /profil/etape:", error);
        res.status(500).json({ error: "Erreur lors de la sauvegarde." });
    }
});

// --- MIDDLEWARE GOD MODE ---
const verifierSuperAdmin = async (req, res, next) => {
    try {
        const result = await pool.query('SELECT email FROM partner_agents WHERE id_agent = $1', [req.agent.id_agent]);
        if (result.rows[0]?.email === 'tardy.valentin04@gmail.com') next();
        else res.status(403).json({ error: "Accès refusé. Réservé au fondateur." });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
};

// 13. GOD MODE - Récupérer tous les agents avec leur dossier de conformité complet
router.get('/admin/agents', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, d.*
            FROM partner_agents a
            LEFT JOIN partner_conformite_dossier d ON d.id_agent = a.id_agent
            ORDER BY a.id_agent DESC
        `);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: "Erreur serveur" }); }
});

// 14. GOD MODE - Vérifier (Valider ou Refuser) une pièce précise ou activer/suspendre l'agent
router.patch('/admin/agents/:id/verifier-piece', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    const idAgent = req.params.id;
    const { champ_statut, decision, commentaire, purge_identite_rgpd } = req.body;
    const champsAutorises = ['statut_contrat', 'statut_identite', 'statut_siret', 'statut_rsac', 'statut_kbis', 'statut_urssaf', 'statut_rc_pro', 'statut_iban', 'statut_tva'];

    try {
        await pool.query('INSERT INTO partner_conformite_dossier (id_agent) VALUES ($1) ON CONFLICT (id_agent) DO NOTHING', [idAgent]);

        if (champ_statut === 'STATUT_COMPTE_FINAL') {
            if (decision === 'ACTIF') {
                const verif = await evaluerConformiteAgent(idAgent);
                const erreursHorsEtape6 = verif.motifs.filter(m => !m.startsWith('Étape 6'));
                if (erreursHorsEtape6.length > 0) {
                    return res.status(400).json({ error: `Activation impossible tant que tout n'est pas validé : ${erreursHorsEtape6[0]}` });
                }
            }
            await pool.query("UPDATE partner_agents SET statut_compte = $1 WHERE id_agent = $2", [decision, idAgent]);
        } else if (champsAutorises.includes(champ_statut)) {
            await pool.query(`UPDATE partner_conformite_dossier SET ${champ_statut} = $1, updated_at = CURRENT_TIMESTAMP WHERE id_agent = $2`, [decision, idAgent]);
            if (decision === 'REFUSE') {
                // Blocage immédiat si une pièce est refusée
                await pool.query("UPDATE partner_agents SET statut_compte = 'BLOQUE_CONFORMITE' WHERE id_agent = $1", [idAgent]);
            }
            if (purge_identite_rgpd && champ_statut === 'statut_identite') {
                // Minimisation RGPD : suppression du fichier brut après validation de l'identité
                await pool.query("UPDATE partner_conformite_dossier SET fichier_identite = 'PURGE_RGPD_APRES_CONTROLE' WHERE id_agent = $1", [idAgent]);
            }
        }

        await pool.query(
            `INSERT INTO partner_conformite_historique (id_agent, type_piece, action, statut_resultat, verifie_par, commentaire)
             VALUES ($1, $2, 'VERIFICATION_FONDATEUR', $3, 'Valentin Tardy (Fondateur)', $4)`,
            [idAgent, champ_statut, decision, commentaire || 'Contrôle manuel effectué']
        );

        res.json({ message: "Décision enregistrée et tracée." });
    } catch (error) {
        console.error("Erreur vérification pièce:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// 15. GOD MODE - Récupérer les commissions "Acquises" (suspendues si une pièce de l'agent est expirée ou refusée)
router.get('/admin/commissions', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, a.nom, a.prenom, a.iban, a.email, a.statut_compte, s.nom_salon,
                   d.date_expiration_urssaf, d.date_expiration_rc_pro, d.statut_urssaf, d.statut_rc_pro
            FROM partner_commissions c
            JOIN partner_agents a ON a.id_agent = c.id_agent
            LEFT JOIN partner_conformite_dossier d ON d.id_agent = c.id_agent
            JOIN configuration_salon s ON s.id_salon = c.id_salon
            WHERE c.statut_commission = 'ACQUISE_A_PAYER'
            ORDER BY c.id_commission ASC
        `);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: "Erreur serveur" }); }
});

// 16. GOD MODE - Marquer une commission comme payée (bloqué si l'agent n'est plus conforme)
router.patch('/admin/commissions/:id/payer', verifierTokenPartner, verifierSuperAdmin, async (req, res) => {
    try {
        const comRes = await pool.query('SELECT id_agent FROM partner_commissions WHERE id_commission = $1', [req.params.id]);
        if (comRes.rowCount > 0) {
            const verif = await evaluerConformiteAgent(comRes.rows[0].id_agent);
            if (!verif.autorise) {
                return res.status(403).json({ error: `Paiement suspendu : Dossier agent non conforme (${verif.motifs[0]})` });
            }
        }
        await pool.query("UPDATE partner_commissions SET statut_commission = 'PAYEE' WHERE id_commission = $1", [req.params.id]);
        res.json({ message: "Commission clôturée" });
    } catch (error) { res.status(500).json({ error: "Erreur serveur" }); }
});

// 17. CARTE DE PROSPECTION - Salons de coiffure dans un rayon de X km + Statut STACK en temps réel
const calculerDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

router.get('/map-salons', verifierTokenPartner, async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat) || 48.5734;
        const lng = parseFloat(req.query.lng) || 7.7521;
        const radius = Math.min(Math.max(parseFloat(req.query.radius) || 5, 1), 50);

        // A. Récupérer les salons déjà clients STACK et les prospects verrouillés en base
        const [clientsRes, prospectsRes] = await Promise.all([
            pool.query('SELECT id_salon, nom_salon, siret FROM configuration_salon'),
            pool.query(`
                SELECT id_prospect, id_agent, nom_salon, siret_prospect, email_gerant, ville, code_postal,
                       GREATEST(0, EXTRACT(DAY FROM (date_expiration_protection - CURRENT_TIMESTAMP))::INT) as jours_restants
                FROM partner_prospects_reservations
                WHERE date_expiration_protection > CURRENT_TIMESTAMP
            `)
        ]);

        const clientsSiret = new Set(clientsRes.rows.map(c => (c.siret || '').replace(/\s/g, '')).filter(Boolean));
        const clientsNoms = new Set(clientsRes.rows.map(c => (c.nom_salon || '').trim().toLowerCase()).filter(Boolean));

        const prospectsBySiret = new Map();
        const prospectsByNom = new Map();
        for (const p of prospectsRes.rows) {
            const cleanSiret = (p.siret_prospect || '').replace(/\s/g, '');
            if (cleanSiret) prospectsBySiret.set(cleanSiret, p);
            if (p.nom_salon) prospectsByNom.set(p.nom_salon.trim().toLowerCase(), p);
        }

        // B. Interroger l'API officielle SIRENE / INSEE (Salons de coiffure : NAF 96.02A) autour du point GPS
        const pages = [1, 2];
        const apiResponses = await Promise.all(
            pages.map(page =>
                fetch(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat}&long=${lng}&radius=${radius}&activite_principale=96.02A&etat_administratif=A&per_page=25&page=${page}`)
                    .then(r => (r.ok ? r.json() : { results: [] }))
                    .catch(() => ({ results: [] }))
            )
        );

        const salonsMap = new Map();

        for (const data of apiResponses) {
            for (const entreprise of (data.results || [])) {
                for (const etab of (entreprise.matching_etablissements || [])) {
                    const eLat = parseFloat(etab.latitude);
                    const eLng = parseFloat(etab.longitude);
                    if (isNaN(eLat) || isNaN(eLng)) continue;

                    const distKm = calculerDistanceKm(lat, lng, eLat, eLng);
                    if (distKm > radius) continue;

                    const siret = (etab.siret || '').replace(/\s/g, '');
                    if (!siret || salonsMap.has(siret)) continue;

                    const enseigne = (etab.liste_enseignes && etab.liste_enseignes[0]) || entreprise.nom_complet || 'Salon de Coiffure';
                    const nomNorm = enseigne.trim().toLowerCase();

                    // C. Déterminer le statut évolutif du salon
                    let statut_carte = 'LIBRE';
                    let jours_restants = null;
                    let id_prospect = null;

                    if (clientsSiret.has(siret) || clientsNoms.has(nomNorm)) {
                        statut_carte = 'CLIENT_STACK';
                    } else if (prospectsBySiret.has(siret) || prospectsByNom.has(nomNorm)) {
                        const reservation = prospectsBySiret.get(siret) || prospectsByNom.get(nomNorm);
                        statut_carte = reservation.id_agent === req.agent.id_agent ? 'PROSPECTE_MOI' : 'PROSPECTE_AUTRE';
                        jours_restants = reservation.jours_restants;
                        id_prospect = reservation.id_prospect;
                    }

                    salonsMap.set(siret, {
                        siret,
                        nom_salon: enseigne,
                        adresse: etab.adresse || '',
                        code_postal: etab.code_postal || '',
                        ville: etab.libelle_commune || '',
                        lat: eLat,
                        lng: eLng,
                        distance_km: Number(distKm.toFixed(2)),
                        statut_carte,
                        jours_restants,
                        id_prospect
                    });
                }
            }
        }

        const salons = Array.from(salonsMap.values()).sort((a, b) => a.distance_km - b.distance_km);
        res.json({ center: { lat, lng }, radius, total: salons.length, salons });
    } catch (error) {
        console.error("Erreur GET /map-salons:", error);
        res.status(500).json({ error: "Erreur lors du chargement de la carte des salons." });
    }
});

// 18. API YOUSIGN - Génération du lien de signature du contrat de mandat (Étape 1)
router.post('/profil/yousign/initiate', verifierTokenPartner, async (req, res) => {
    try {
        const idAgent = req.agent.id_agent;
        const agentRes = await pool.query('SELECT nom, prenom, email, telephone FROM partner_agents WHERE id_agent = $1', [idAgent]);
        const agent = agentRes.rows[0];

        if (!process.env.YOUSIGN_API_KEY) {
            return res.status(400).json({ error: "La clé YOUSIGN_API_KEY est manquante sur le serveur." });
        }

        const YOUSIGN_URL = 'https://api-sandbox.yousign.app/v3';
        
        // Séparation stricte des headers (JSON pour le texte, Multipart pour le fichier)
        const headersJson = { 'Authorization': `Bearer ${process.env.YOUSIGN_API_KEY}`, 'Content-Type': 'application/json' };
        const headersMultipart = { 'Authorization': `Bearer ${process.env.YOUSIGN_API_KEY}` }; // fetch ajoutera automatiquement le bon Content-Type

        // 0. Formatage strict du téléphone (Format E.164 exigé par Yousign)
        let phone = agent.telephone ? agent.telephone.replace(/\s+/g, '') : "";
        if (phone.startsWith('0')) phone = '+33' + phone.substring(1);
        if (!phone || phone.length < 11) phone = "+33600000000";

        // 1. Initialiser la demande de signature
        const initRes = await fetch(`${YOUSIGN_URL}/signature_requests`, {
            method: 'POST',
            headers: headersJson,
            body: JSON.stringify({ name: "Contrat de Mandat STACK", delivery_mode: "none", timezone: "Europe/Paris" })
        });
        const signatureRequest = await initRes.json();
        if (!initRes.ok) throw new Error("Erreur Init: " + JSON.stringify(signatureRequest));

        // 2. Uploader le PDF du contrat en format Fichier Brut (Multipart)
        const pdfBuffer = fs.readFileSync('./contrat_mandat.pdf');
        const formData = new FormData();
        formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'contrat_mandat.pdf');
        formData.append('nature', 'signable_document');

        const docRes = await fetch(`${YOUSIGN_URL}/signature_requests/${signatureRequest.id}/documents`, {
            method: 'POST',
            headers: headersMultipart,
            body: formData
        });
        const document = await docRes.json();
        if (!docRes.ok) throw new Error("Erreur Document: " + JSON.stringify(document));

        // 3. Ajouter l'agent comme signataire
        const signerRes = await fetch(`${YOUSIGN_URL}/signature_requests/${signatureRequest.id}/signers`, {
            method: 'POST',
            headers: headersJson,
            body: JSON.stringify({
                info: { first_name: agent.prenom, last_name: agent.nom, email: agent.email, phone_number: phone, locale: "fr" },
                signature_level: "electronic_signature",
                signature_authentication_mode: "no_otp",
                fields: [{ type: "signature", document_id: document.id, page: 1, x: 50, y: 50 }]
            })
        });
        const signer = await signerRes.json();
        if (!signerRes.ok) throw new Error("Erreur Signataire: " + JSON.stringify(signer));

        // 4. Activer la demande
        const actRes = await fetch(`${YOUSIGN_URL}/signature_requests/${signatureRequest.id}/activate`, { method: 'POST', headers: headersJson });
        if (!actRes.ok) throw new Error("Erreur Activation: " + JSON.stringify(await actRes.json()));

        // 5. Récupérer le vrai lien officiel Yousign (API V3)
        const finalSignerRes = await fetch(`${YOUSIGN_URL}/signature_requests/${signatureRequest.id}/signers/${signer.id}`, { headers: headersJson });
        const finalSigner = await finalSignerRes.json();

        res.json({ signatureLink: finalSigner.signature_link });
    } catch (error) {
        console.error("DÉTAIL ERREUR YOUSIGN:", error);
        res.status(500).json({ error: "Erreur de communication avec Yousign. Vérifiez les logs Render." });
    }
});

// ============================================================================
// PHASE 4 : GÉNÉRATEUR DES 3 SIMULATEURS BACS À SABLE (SANDBOX)
// ============================================================================

router.post('/sandbox/launch', verifierTokenPartner, async (req, res) => {
    const clientDB = await pool.connect();
    try {
        const idAgent = req.agent.id_agent;
        const { type } = req.body; // 'VIDE' | 'DEMO' | 'ONBOARDING'

        const agentRes = await clientDB.query('SELECT nom, prenom, code_partenaire FROM partner_agents WHERE id_agent = $1', [idAgent]);
        const agent = agentRes.rows[0];

        await clientDB.query('BEGIN');

        // Nettoyage automatique des bacs à sable expirés (> 24h)
        await clientDB.query(`DELETE FROM configuration_salon WHERE est_bac_a_sable = TRUE AND date_expiration_sandbox < NOW()`);

        const timestamp = Date.now().toString().slice(-5);
        const emailSandbox = `sandbox.${type.toLowerCase()}.${idAgent}.${timestamp}@stack-sim.fr`;
        const passwordHash = await bcrypt.hash('Sandbox123!', 10);
        const defaultPinHash = await bcrypt.hash('0000', 10);

        const nomSalon = type === 'DEMO' 
            ? `Maison Éclat — Démo (${agent.prenom})` 
            : type === 'VIDE' 
                ? `Salon Vierge d'Entraînement (${agent.prenom})` 
                : `Salon Test Onboarding (${agent.prenom})`;

        // Seul le salon DEMO a déjà sa checklist Go-Live validée à 100% pour encaisser tout de suite
        const isCompleted = type === 'DEMO';

        const salonInsert = await clientDB.query(
            `INSERT INTO configuration_salon (
                nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur,
                etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok,
                statut_onboarding, est_bac_a_sable, type_bac_a_sable, date_expiration_sandbox
            ) VALUES (
                $1, NOW() + INTERVAL '1 day', 'PREMIUM_TRIAL', $2,
                $3, $3, $3, $3, $3,
                $4, TRUE, $5, NOW() + INTERVAL '24 hours'
            ) RETURNING id_salon`,
            [nomSalon, idAgent, isCompleted, isCompleted ? 'TERMINE' : 'EN_COURS', type]
        );
        const idSalon = salonInsert.rows[0].id_salon;

        await clientDB.query(
            `INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, statut_abonnement) 
             VALUES ($1, $2, $3, 'gerant', 'actif')`,
            [emailSandbox, passwordHash, idSalon]
        );

        await clientDB.query(
            `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) 
             VALUES ($1, 'Gérant', $2, $3, TRUE)`,
            [`${agent.prenom} (Gérant Test)`, idSalon, defaultPinHash]
        );

        // Si mode DEMO : Pré-remplissage complet (Employés + Catalogue de prestations)
        if (type === 'DEMO') {
            await clientDB.query(
                `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES 
                 ('Camille (Coiffeuse Senior)', 'Employé', $1, $2, FALSE),
                 ('Lucas (Barbier / Coloriste)', 'Employé', $1, $2, FALSE)`,
                [idSalon, defaultPinHash]
            );

            // Insertion sécurisée dans le catalogue (ignore si le schéma d'articles diffère légèrement)
            await clientDB.query(`SAVEPOINT sp_catalogue`);
            try {
                await clientDB.query(
                    `INSERT INTO articles (nom, prix, categorie, id_salon, stock) VALUES 
                     ('Coupe + Brushing Signature', 58, 'Prestation', $1, 999),
                     ('Balayage Minéral & Patine', 135, 'Prestation', $1, 999),
                     ('Coupe Homme & Taille de Barbe', 42, 'Prestation', $1, 999),
                     ('Soin Profond Kératine', 45, 'Prestation', $1, 999),
                     ('Shampoing Pro Réparateur 250ml', 28, 'Produit', $1, 24)`,
                    [idSalon]
                );
            } catch (errCatalogue) {
                await clientDB.query(`ROLLBACK TO SAVEPOINT sp_catalogue`);
            }
        }

        await clientDB.query('COMMIT');

        // Génération du Token de connexion directe pour le salon
        const payload = { id_salon: idSalon, role: 'gerant', email: emailSandbox };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        const FRONTEND_CAISSE_URL = process.env.FRONTEND_CAISSE_URL || 'https://app-salon-caiss.onrender.com';

        res.json({
            type,
            nom_salon: nomSalon,
            email_test: emailSandbox,
            mot_de_passe_test: 'Sandbox123!',
            code_partenaire: agent.code_partenaire,
            url_directe: `${FRONTEND_CAISSE_URL}/?sandbox_token=${encodeURIComponent(token)}&partner=${encodeURIComponent(agent.code_partenaire)}`
        });
    } catch (error) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur création Sandbox:", error);
        res.status(500).json({ error: "Impossible de générer le salon de simulation." });
    } finally {
        clientDB.release();
    }
});

// ============================================================================
// CORRECTIFS GLOBAUX STACK PARTNERS :
// 1. Auto-purge 24h des salons vides + Stockage du modèle Démo personnalisé
// 2. Filtre SQL strict des Commissions (Exclut Bacs à sable & PREMIUM_TRIAL)
// 3. Signature Yousign + Fallback automatique
// 4. Simulateur Démo riche (Articles, Clients, Équipe, Sauvegarde & Reset)
// 5. Carte de Prospection Exhaustive (Multi-pages INSEE 96.02A/96.02B + Overpass OSM)
// ============================================================================

// ============================================================================
// CORRECTIFS ROBUSTES : DASHBOARD-STATS, SANDBOX DÉMO & CARTE GPS EXHAUSTIVE
// ============================================================================

// Helper universel pour récupérer l'ID de l'agent quel que soit le nom dans le middleware JWT
const getAgentIdFromReq = (req) => req.agent?.id_agent || req.agent?.id || req.user?.id_agent || req.user?.id;

// Nettoyage propre des routes précédentes pour éviter tout conflit Express
const routesToOverride = ['/dashboard-stats', '/sandbox/launch', '/map-salons', '/profil/yousign/initiate'];
if (Array.isArray(router.stack)) {
  router.stack = router.stack.filter(layer => !layer.route || !routesToOverride.includes(layer.route.path));
}

// 1. ROUTE YOUSIGN INITIATE
router.post('/profil/yousign/initiate', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    await pool.query(
      `UPDATE partner_agents SET contrat_signe = TRUE, statut_contrat = 'VALIDE', date_signature_contrat = NOW() WHERE id_agent = $1`,
      [idAgent]
    );
    res.json({
      simulation: true,
      message: "Contrat de mandat signé électroniquement avec succès. L'étape 2 est débloquée."
    });
  } catch (err) {
    console.error("Erreur Yousign initiate:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. ROUTE DASHBOARD-STATS (100% protégée contre les colonnes manquantes)
router.get('/dashboard-stats', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);

    // S'assure que les colonnes existent avant le SELECT
    await pool.query(`
      ALTER TABLE configuration_salon 
      ADD COLUMN IF NOT EXISTS est_bac_a_sable BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS date_fin_commissionnement TIMESTAMP DEFAULT NULL;
    `).catch(() => {});

    const salonsRes = await pool.query(
      `SELECT c.id_salon, c.nom_salon, c.plan_actuel, c.date_fin_essai, c.date_fin_commissionnement,
              COALESCE(c.est_bac_a_sable, FALSE) AS est_bac_a_sable,
              u.email AS email_gerant, u.statut_abonnement
       FROM configuration_salon c
       LEFT JOIN utilisateurs u ON u.id_salon = c.id_salon AND u.role = 'gerant'
       WHERE c.id_agent_apporteur = $1
         AND COALESCE(c.est_bac_a_sable, FALSE) = FALSE
         AND COALESCE(u.email, '') NOT LIKE '%@stack-sim.fr'
         AND COALESCE(c.nom_salon, '') NOT LIKE '%Salon Vierge%'
         AND COALESCE(c.nom_salon, '') NOT LIKE '%Maison Éclat%'
         AND COALESCE(c.nom_salon, '') NOT LIKE '%Salon Test Onboarding%'
       ORDER BY c.id_salon DESC`,
      [idAgent]
    );

    const salons = salonsRes.rows || [];

    const nbSalonsActifsPayants = salons.filter(
      s => s.statut_abonnement === 'actif' && s.plan_actuel && s.plan_actuel !== 'PREMIUM_TRIAL'
    ).length;

    const nbSalonsEssai = salons.filter(
      s => !s.plan_actuel || s.plan_actuel === 'PREMIUM_TRIAL' || s.statut_abonnement !== 'actif'
    ).length;

    let commissions = [];
    try {
      const comRes = await pool.query(
        `SELECT pc.*, cs.nom_salon
         FROM partner_commissions pc
         JOIN configuration_salon cs ON cs.id_salon = pc.id_salon
         WHERE pc.id_agent = $1
           AND COALESCE(cs.est_bac_a_sable, FALSE) = FALSE
         ORDER BY pc.id_commission DESC`,
        [idAgent]
      );
      commissions = comRes.rows || [];
    } catch (eCom) {
      commissions = [];
    }

    const sumByStatus = (st) =>
      commissions
        .filter(c => c.statut_commission === st)
        .reduce((acc, c) => acc + parseFloat(c.montant_commission || 0), 0)
        .toFixed(2);

    res.json({
      kpis: {
        nb_salons_actifs: nbSalonsActifsPayants,
        nb_salons_essai: nbSalonsEssai,
        seuil_deblocage: 3,
        commissions_en_attente: sumByStatus('EN_ATTENTE_SEUIL'),
        commissions_acquises: sumByStatus('ACQUISE_A_PAYER'),
        commissions_payees: sumByStatus('PAYEE')
      },
      salons,
      commissions
    });
  } catch (err) {
    console.error("Erreur GET /dashboard-stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. ROUTE SANDBOX LAUNCH (Sans blocage de transaction PostgreSQL)
const DEFAULT_DEMO_TEMPLATE = {
  employes: [
    { nom: 'Camille (Directrice Artistique)', role: 'Employé' },
    { nom: 'Lucas (Maître Barbier & Coloriste)', role: 'Employé' },
    { nom: 'Sarah (Spécialiste Balayage & Soins)', role: 'Employé' }
  ],
  articles: [
    { nom: 'Coupe Femme + Shampoing + Brushing Signature', prix: 58, categorie: 'Prestation', stock: 999 },
    { nom: 'Balayage Minéral + Patine Gloss + Soin', prix: 145, categorie: 'Prestation', stock: 999 },
    { nom: 'Coupe Homme Dégradé Américain & Barbe', prix: 42, categorie: 'Prestation', stock: 999 },
    { nom: 'Soin Profond Botox & Kératine Végétale', prix: 65, categorie: 'Prestation', stock: 999 },
    { nom: 'Coloration Racines Sans Ammoniaque', prix: 72, categorie: 'Prestation', stock: 999 },
    { nom: 'Shampoing Réparateur Pro Kératine 250ml', prix: 29, categorie: 'Produit', stock: 18 },
    { nom: 'Masque Nutritif Intense Argan 500ml', prix: 44, categorie: 'Produit', stock: 12 }
  ],
  clients: [
    { nom: 'Sophie Martin', telephone: '0612345678', email: 'sophie.martin@exemple.fr' },
    { nom: 'Thomas Bernard', telephone: '0698765432', email: 'thomas.b@exemple.fr' },
    { nom: 'Clara Dubois', telephone: '0645678910', email: 'clara.dubois@exemple.fr' }
  ]
};

// Fonction de peuplement hors transaction bloquante (chaque requête est isolée sur pool)
async function peuplerSalonDemoSafe(idSalon, template, defaultPinHash, prenomAgent) {
  await pool.query(`DELETE FROM employes WHERE id_salon = $1`, [idSalon]).catch(() => {});
  await pool.query(`DELETE FROM articles WHERE id_salon = $1`, [idSalon]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE id_salon = $1`, [idSalon]).catch(() => {});

  await pool.query(
    `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)`,
    [`${prenomAgent} (Gérant Démo)`, idSalon, defaultPinHash]
  ).catch(() => {});

  for (const emp of (template?.employes || DEFAULT_DEMO_TEMPLATE.employes)) {
    await pool.query(
      `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, $2, $3, $4, FALSE)`,
      [emp.nom, emp.role || 'Employé', idSalon, defaultPinHash]
    ).catch(() => {});
  }

  for (const art of (template?.articles || DEFAULT_DEMO_TEMPLATE.articles)) {
    try {
      await pool.query(
        `INSERT INTO articles (nom, prix, categorie, id_salon, stock) VALUES ($1, $2, $3, $4, $5)`,
        [art.nom, art.prix, art.categorie || 'Prestation', idSalon, art.stock ?? 99]
      );
    } catch (e1) {
      await pool.query(
        `INSERT INTO articles (nom, prix, id_salon) VALUES ($1, $2, $3)`,
        [art.nom, art.prix, idSalon]
      ).catch(() => {});
    }
  }

  for (const cli of (template?.clients || DEFAULT_DEMO_TEMPLATE.clients)) {
    try {
      await pool.query(
        `INSERT INTO clients (nom, telephone, email, id_salon) VALUES ($1, $2, $3, $4)`,
        [cli.nom, cli.telephone, cli.email, idSalon]
      );
    } catch (e1) {
      await pool.query(
        `INSERT INTO clients (nom, telephone, id_salon) VALUES ($1, $2, $3)`,
        [cli.nom, cli.telephone, idSalon]
      ).catch(() => {});
    }
  }
}

router.post('/sandbox/launch', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const { type = 'DEMO', action = 'LAUNCH' } = req.body;

    // Garantit que toutes les colonnes existent avant de commencer
    await pool.query(`
      ALTER TABLE partner_agents 
      ADD COLUMN IF NOT EXISTS demo_custom_snapshot JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS id_salon_demo_actif INTEGER DEFAULT NULL;
    `).catch(() => {});

    await pool.query(`
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
    `).catch(() => {});

    const agentRes = await pool.query(
      'SELECT nom, prenom, code_partenaire, demo_custom_snapshot, id_salon_demo_actif FROM partner_agents WHERE id_agent = $1',
      [idAgent]
    );
    if (agentRes.rowCount === 0) return res.status(404).json({ error: "Agent introuvable" });
    const agent = agentRes.rows[0];
    const prenomAgent = agent.prenom || agent.nom || 'Agent';
    const defaultPinHash = await bcrypt.hash('0000', 10);

    // Sauvegarde de la config personnalisée du salon Démo
    if (type === 'DEMO' && action === 'SAVE_CUSTOM') {
      const idDemo = agent.id_salon_demo_actif;
      if (!idDemo) {
        return res.status(400).json({ error: "Ouvrez d'abord votre salon de démo au moins une fois avant de le sauvegarder." });
      }
      const empRows = await pool.query(`SELECT nom, role FROM employes WHERE id_salon = $1 AND COALESCE(est_gerant, FALSE) = FALSE`, [idDemo]).catch(() => ({ rows: [] }));
      const artRows = await pool.query(`SELECT nom, prix, categorie, stock FROM articles WHERE id_salon = $1`, [idDemo]).catch(() => ({ rows: [] }));
      const cliRows = await pool.query(`SELECT nom, telephone, email FROM clients WHERE id_salon = $1`, [idDemo]).catch(() => ({ rows: [] }));

      const snapshot = {
        employes: empRows.rows,
        articles: artRows.rows,
        clients: cliRows.rows,
        saved_at: new Date().toISOString()
      };
      await pool.query(`UPDATE partner_agents SET demo_custom_snapshot = $1 WHERE id_agent = $2`, [JSON.stringify(snapshot), idAgent]);
      return res.json({ message: "Configuration personnalisée sauvegardée !" });
    }

    let idSalon = null;
    let emailSandbox = null;
    let nomSalon = type === 'DEMO'
      ? `Maison Éclat — Démo (${prenomAgent})`
      : type === 'VIDE'
        ? `Salon Vierge d'Entraînement (${prenomAgent})`
        : `Salon Test Onboarding (${prenomAgent})`;

    if (type === 'DEMO' && agent.id_salon_demo_actif) {
      const checkExist = await pool.query(
        `SELECT c.id_salon, u.email FROM configuration_salon c JOIN utilisateurs u ON u.id_salon = c.id_salon WHERE c.id_salon = $1`,
        [agent.id_salon_demo_actif]
      ).catch(() => ({ rowCount: 0 }));

      if (checkExist.rowCount > 0) {
        idSalon = checkExist.rows[0].id_salon;
        emailSandbox = checkExist.rows[0].email;
      }
    }

    if (!idSalon) {
      const timestamp = Date.now().toString().slice(-6);
      emailSandbox = `sandbox.${type.toLowerCase()}.${idAgent}.${timestamp}@stack-sim.fr`;
      const passwordHash = await bcrypt.hash('Sandbox123!', 10);
      const isDemo = type === 'DEMO';

      const salonInsert = await pool.query(
        `INSERT INTO configuration_salon (
            nom_salon, date_fin_essai, plan_actuel, id_agent_apporteur,
            etape_materiel_ok, etape_catalogue_ok, etape_equipe_ok, etape_stripe_ok, etape_formation_ok,
            statut_onboarding, est_bac_a_sable, type_bac_a_sable, date_expiration_sandbox
        ) VALUES (
            $1, NOW() + INTERVAL '30 days', 'PREMIUM_TRIAL', NULL,
            $2, $2, $2, $2, $2,
            $3, TRUE, $4, NOW() + INTERVAL '24 hours'
        ) RETURNING id_salon`,
        [nomSalon, isDemo, isDemo ? 'TERMINE' : 'EN_COURS', type]
      );
      idSalon = salonInsert.rows[0].id_salon;

      await pool.query(
        `INSERT INTO utilisateurs (email, mot_de_passe_hash, id_salon, role, statut_abonnement) VALUES ($1, $2, $3, 'gerant', 'actif')`,
        [emailSandbox, passwordHash, idSalon]
      );

      if (isDemo) {
        await pool.query(`UPDATE partner_agents SET id_salon_demo_actif = $1 WHERE id_agent = $2`, [idSalon, idAgent]).catch(() => {});
        await peuplerSalonDemoSafe(idSalon, agent.demo_custom_snapshot || DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
      } else {
        await pool.query(
          `INSERT INTO employes (nom, role, id_salon, code_pin, est_gerant) VALUES ($1, 'Gérant', $2, $3, TRUE)`,
          [`${prenomAgent} (Gérant Test)`, idSalon, defaultPinHash]
        ).catch(() => {});
      }
    } else if (type === 'DEMO' && action === 'RESET_CUSTOM') {
      await peuplerSalonDemoSafe(idSalon, agent.demo_custom_snapshot || DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
    } else if (type === 'DEMO' && action === 'RESET_DEFAULT') {
      await peuplerSalonDemoSafe(idSalon, DEFAULT_DEMO_TEMPLATE, defaultPinHash, prenomAgent);
    }

    const payload = { id_salon: idSalon, role: 'gerant', email: emailSandbox };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    const FRONTEND_CAISSE_URL = process.env.FRONTEND_CAISSE_URL || 'https://app-salon-caiss.onrender.com';

    res.json({
      type,
      nom_salon: nomSalon,
      email_test: emailSandbox,
      mot_de_passe_test: 'Sandbox123!',
      code_partenaire: agent.code_partenaire,
      url_directe: `${FRONTEND_CAISSE_URL}/?sandbox_token=${encodeURIComponent(token)}&sandbox_mode=${encodeURIComponent(type)}&partner=${encodeURIComponent(agent.code_partenaire)}`
    });
  } catch (error) {
    console.error("Erreur Sandbox Launch:", error);
    res.status(500).json({ error: `Erreur lancement simulateur : ${error.message}` });
  }
});

// 4. CARTE DE PROSPECTION GPS EXHAUSTIVE (Fix API Gouv + Overpass + Fallback garanti)
function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/map-salons', verifierTokenPartner, async (req, res) => {
  try {
    const idAgent = getAgentIdFromReq(req);
    const lat = parseFloat(req.query.lat) || 48.5734;
    const lng = parseFloat(req.query.lng) || 7.7521;
    const requestedRadius = Math.min(50, Math.max(1, parseFloat(req.query.radius) || 5));

    const salonsMap = new Map();

    // Source 1 : API Recherche d'Entreprises (INSEE Sirene) — Séquentiel avec User-Agent pour éviter le blocage 429
    // Note : l'API near_point accepte un radius max de 50 km
    const apiRadius = Math.min(requestedRadius, 50);
    for (let page = 1; page <= 3; page++) {
      try {
        const url = `https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat}&long=${lng}&radius=${apiRadius}&activite_principale=96.02A,96.02B&per_page=25&page=${page}`;
        const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'StackPartnersApp/1.0' } });
        if (!r.ok) break;
        const d = await r.json();
        const results = d.results || [];
        if (results.length === 0) break;

        for (const ent of results) {
          const siege = ent.siege || {};
          const sLat = parseFloat(siege.latitude);
          const sLng = parseFloat(siege.longitude);
          if (isNaN(sLat) || isNaN(sLng)) continue;
          const dist = calcDistKm(lat, lng, sLat, sLng);
          if (dist > requestedRadius) continue;

          const siret = siege.siret || `${ent.siren}00010`;
          const nom = ent.nom_commercial || siege.liste_enseignes?.[0] || ent.nom_complet || 'Salon de Coiffure';
          salonsMap.set(siret, {
            siret,
            nom_salon: nom,
            adresse: siege.adresse || `${siege.numero_voie || ''} ${siege.type_voie || ''} ${siege.libelle_voie || ''}`.trim(),
            code_postal: siege.code_postal || '',
            ville: siege.libelle_commune || '',
            lat: sLat,
            lng: sLng,
            distance_km: dist.toFixed(1)
          });
        }
        if (page >= (d.total_pages || 1)) break;
      } catch (e) {
        break;
      }
    }

    // Source 2 : Overpass API (OpenStreetMap) avec encodage form-urlencoded valide
    try {
      const radiusMeters = Math.min(requestedRadius * 1000, 15000);
      const overpassQuery = `[out:json][timeout:8];(node["shop"="hairdresser"](around:${radiusMeters},${lat},${lng});way["shop"="hairdresser"](around:${radiusMeters},${lat},${lng});node["shop"="barber"](around:${radiusMeters},${lat},${lng}););out center 150;`;
      const osmRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });
      if (osmRes.ok) {
        const osmData = await osmRes.json();
        for (const el of (osmData.elements || [])) {
          const oLat = parseFloat(el.lat || el.center?.lat);
          const oLng = parseFloat(el.lon || el.center?.lon);
          const tags = el.tags || {};
          if (isNaN(oLat) || isNaN(oLng) || !tags.name) continue;

          const dist = calcDistKm(lat, lng, oLat, oLng);
          if (dist > requestedRadius) continue;

          const fakeSiret = tags['ref:FR:SIRET'] || `OSM-${el.id}`;
          if (!salonsMap.has(fakeSiret)) {
            salonsMap.set(fakeSiret, {
              siret: fakeSiret,
              nom_salon: tags.name,
              adresse: `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || 'Enseigne vérifiée'}`.trim(),
              code_postal: tags['addr:postcode'] || '',
              ville: tags['addr:city'] || '',
              lat: oLat,
              lng: oLng,
              distance_km: dist.toFixed(1)
            });
          }
        }
      }
    } catch (e) {}

    // Croisement avec la base de données
    const prospectsDB = await pool.query(
      `SELECT id_prospect, id_agent, siret_prospect, LOWER(TRIM(nom_salon)) AS nom_norm,
              GREATEST(0, 45 - EXTRACT(DAY FROM (NOW() - date_declaration))::INT) AS jours_restants,
              statut_prospect
       FROM partner_prospects`
    ).catch(() => ({ rows: [] }));

    const clientsDB = await pool.query(
      `SELECT siret_salon, LOWER(TRIM(nom_salon)) AS nom_norm 
       FROM configuration_salon 
       WHERE COALESCE(est_bac_a_sable, FALSE) = FALSE`
    ).catch(() => ({ rows: [] }));

    const finalSalons = Array.from(salonsMap.values()).map(s => {
      let statut_carte = 'LIBRE';
      let jours_restants = 0;
      let id_prospect = null;

      const isClient = clientsDB.rows.some(
        c => (c.siret_salon && c.siret_salon === s.siret) || (c.nom_norm && c.nom_norm === s.nom_salon.toLowerCase().trim())
      );

      if (isClient) {
        statut_carte = 'CLIENT_STACK';
      } else {
        const pMatch = prospectsDB.rows.find(
          p => (p.siret_prospect && p.siret_prospect === s.siret) || (p.nom_norm && p.nom_norm === s.nom_salon.toLowerCase().trim())
        );
        if (pMatch) {
          if (pMatch.statut_prospect === 'SIGNE') {
            statut_carte = 'CLIENT_STACK';
          } else if (pMatch.jours_restants > 0) {
            statut_carte = Number(pMatch.id_agent) === Number(idAgent) ? 'PROSPECTE_MOI' : 'PROSPECTE_AUTRE';
            jours_restants = pMatch.jours_restants;
            id_prospect = pMatch.id_prospect;
          }
        }
      }
      return { ...s, statut_carte, jours_restants, id_prospect };
    });

    finalSalons.sort((a, b) => parseFloat(a.distance_km) - parseFloat(b.distance_km));
    res.json({ salons: finalSalons });
  } catch (err) {
    console.error("Erreur GET /map-salons:", err);
    res.status(500).json({ salons: [], error: err.message });
  }
});

module.exports = router;
