/* ==========================================================================
   MODULE LÉGAL STACK — acceptation électronique des documents contractuels
   ----------------------------------------------------------------------
   - Les textes contractuels vivent ICI (côté serveur) : c'est le serveur qui
     les calcule, les hash (SHA-256) et les archive au moment de l'acceptation.
   - Chaque acceptation crée une ligne "ajout seul" (non modifiable) dans
     acceptations_legales + un événement chaîné dans le JET (jet_logs).
   - Pour modifier un document : changer son texte ET incrémenter sa version
     dans DOC_VERSIONS -> les gérants devront ré-accepter ce document.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

/* ---------- PARAMÈTRES À CONFIRMER (utilisés dans le contrat de prêt du TPE) ---------- */
const INDEMNITE_REMPLACEMENT_HT = '79,00';   // Article 6 — à confirmer
const FRAIS_RETOUR_A_CHARGE_DE = "l'Emprunteur"; // Article 7 — "l'Emprunteur" ou "le Prêteur"
const MENTION_COMMODAT = 'Lu et approuvé, bon pour réception';
const ATTESTATION_NF525_PATH = path.join(__dirname, 'legal', 'attestation-nf525.pdf'); // déposer le PDF ici

const DOC_VERSIONS = {
    cgv: '2026-09-28',
    confidentialite: '2026-09-28',
    sepa: '2026-09-28',
    commodat: '2026-09-28',
    nf525: '2026-09-28'
};

/* ==========================================================================
   TEXTES
   ========================================================================== */
const TEXTE_CGV = `Conditions Générales d'Utilisation et de Vente
Édité par Valentin Tardy (STACK), 32 rue du Goujon, Strasbourg — SIRET : En cours d'immatriculation.

1. Objet du contrat
L'application STACK est un logiciel en mode SaaS (Software as a Service) destiné à la gestion de salons de coiffure (caisse, agenda, stocks, ressources humaines et marketing).

2. Abonnement et Paiement
L'accès complet aux fonctionnalités de STACK (hors période d'essai ou mode restreint) nécessite un abonnement mensuel actif de 29,00 €. Les paiements sont sécurisés et traités par notre partenaire Stripe. L'abonnement est sans engagement de durée et peut être résilié à tout moment. En cas de défaut de paiement, l'accès au tableau de bord sera suspendu.

3. Conformité Caisse et Loi Anti-fraude (NF525)
STACK intègre un système de clôture journalière (Z de caisse) et un chaînage cryptographique des tickets pour garantir l'inaltérabilité des données financières.
- L'Utilisateur est seul responsable de réaliser ses clôtures de caisse quotidiennement.
- L'Utilisateur est seul responsable de ses déclarations fiscales et comptables. STACK agit comme un outil d'assistance et ne remplace pas les conseils d'un expert-comptable.

4. Fonctionnalités d'Intelligence Artificielle
L'application propose des outils automatisés (analyse d'e-mails pour la création de rendez-vous ou l'ajout de stock). Bien que l'IA soit conçue pour être précise, l'Utilisateur s'engage à vérifier les tâches générées avant de les valider. STACK ne saurait être tenu responsable d'une erreur d'interprétation de l'IA.

5. Disponibilité du Service et Mode Hors-Ligne
L'éditeur s'efforce de maintenir l'accès au serveur 24h/24 et 7j/7. En cas de coupure réseau côté client, STACK propose un "Mode Hors-Ligne" permettant d'encaisser en espèces. L'Utilisateur s'engage à reconnecter son appareil à Internet pour synchroniser ces tickets dès que possible.

6. Responsabilité
STACK décline toute responsabilité en cas de perte de chiffre d'affaires liée à une mauvaise utilisation du logiciel, à une panne matérielle de l'appareil de l'utilisateur, ou à un refus de paiement du terminal bancaire.`;

const TEXTE_CONFIDENTIALITE = `Politique de Confidentialité (RGPD)

1. Rôles et Responsabilités (RGPD)
Dans le cadre de l'utilisation de STACK, le gérant du salon de coiffure agit en tant que Responsable de traitement des données de ses clients. STACK agit en tant que Sous-traitant, fournissant uniquement l'infrastructure technique pour stocker et traiter ces données.

2. Données collectées et finalités
Nous collectons et hébergeons les données suivantes :
- Données du Salon : Nom, email, code PIN, taux de commission. Utilisées pour l'authentification et les primes.
- Données des Clients finaux : Prénom, nom, téléphone, email, date de naissance, historique d'achats et notes. Utilisées pour la gestion de l'agenda, la fidélité et l'envoi de SMS/Emails de rappel.
- Données Financières : Tickets de caisse, méthodes de paiement, clôtures. Utilisées pour la conformité légale et l'export comptable.

3. Services Tiers et Sous-traitants ultérieurs
Pour garantir le bon fonctionnement de l'application, STACK s'appuie sur des partenaires sécurisés :
- Render & PostgreSQL : Hébergement de l'application et de la base de données.
- Stripe : Traitement des paiements de l'abonnement et liaison avec le TPE.
- Brevo : Envoi des campagnes SMS (Rappels de RDV, anniversaires, fidélité).
- Groq (IA) : Traitement éphémère du texte des e-mails pour l'automatisation des tâches. Ces textes ne sont pas utilisés pour entraîner des modèles publics.

4. Sécurité et Inaltérabilité
Les mots de passe des utilisateurs sont hachés (bcrypt). Les mots de passe d'applications tierces (comme le mot de passe de la boîte mail du salon) sont chiffrés en base de données (AES-256). Les historiques de caisse sont scellés cryptographiquement.

5. Durée de conservation
Les données de facturation (tickets, Z de caisse, journal des événements techniques) sont conservées de manière inaltérable selon les durées légales en vigueur (généralement 6 ans en France). Les données clients peuvent être supprimées à tout moment par le gérant via l'interface.

6. Exercice des Droits
Les utilisateurs de l'application (gérants et employés) peuvent exercer leurs droits d'accès, de rectification ou de suppression en nous contactant à stackcontact.fr@gmail.com. Les clients finaux doivent formuler ces demandes directement auprès de leur salon de coiffure.`;

const TEXTE_SEPA = `Paiement de l'abonnement et mandat de prélèvement SEPA

1. Moyens de paiement
L'abonnement STACK est réglé par prélèvement SEPA ou par carte bancaire, via le prestataire de paiement Stripe.

2. Mandat de prélèvement SEPA
Si vous choisissez le prélèvement SEPA, le mandat est établi et autorisé en ligne à l'étape de paiement sécurisée de Stripe. Ce mandat précise le créancier, la référence unique du mandat et les coordonnées bancaires à débiter. Le présent document ne remplace pas ce mandat : il vous informe de son existence et de son usage.

3. Portée du mandat
Le mandat autorise le prélèvement des mensualités de l'abonnement STACK.

4. Vos droits
Vos droits en matière de contestation et de remboursement d'un prélèvement sont ceux décrits dans le mandat et dans les conditions de votre banque.

5. Preuve
Votre acceptation du présent document, ainsi que les informations d'horodatage associées, sont conservées par l'éditeur.`;

const TEXTE_NF525 = `Attestation de conformité à la loi anti-fraude à la TVA (NF525)

L'attestation de conformité relative au logiciel de caisse STACK est mise à disposition au format PDF avec le présent document.
En cochant la case correspondante, vous reconnaissez avoir pu consulter cette attestation.`;

const TEXTE_COMMODAT = `CONTRAT DE PRÊT À USAGE (COMMODAT) DE MATÉRIEL

Entre les soussignés :

L'entreprise STACK
Représentée par M. Valentin Tardy
Siège social : 32 rue du Goujon, 67000 Strasbourg
SIRET : En cours d'immatriculation
Ci-après dénommée le « Prêteur »,

ET

{{nom_salon}}
Représenté par {{gerant_prenom}} {{gerant_nom}}
Siège social : {{adresse_salon}}
SIRET : {{siret_salon}}
Ci-après dénommée l'« Emprunteur »,

Article 1 – Objet du contrat
Le présent contrat est un prêt à usage (ou commodat) régi par les articles 1875 et suivants du Code civil. Le Prêteur met à la disposition de l'Emprunteur un Terminal de Paiement Électronique (ci-après le « Matériel ») afin de lui permettre d'encaisser ses clients via le logiciel STACK.

Article 2 – Description du Matériel prêté
Le prêt porte sur le Matériel suivant :
Type de matériel : Terminal de Paiement Électronique (TPE) compatible Stripe
Marque et Modèle : {{tpe_modele}}
Numéro de série / Identifiant : {{tpe_serie}}
Accessoires fournis : {{tpe_accessoires}}
Le Matériel est remis ce jour à l'Emprunteur, qui reconnaît l'avoir reçu en parfait état de fonctionnement.

Article 3 – Durée du prêt
Le présent prêt est consenti pour une durée indéterminée, strictement liée à la durée de l'abonnement de l'Emprunteur au logiciel STACK.
La résiliation de l'abonnement au logiciel STACK, quelle qu'en soit la cause ou l'auteur, entraîne la fin immédiate du présent contrat de prêt et l'obligation de restituer le Matériel.

Article 4 – Gratuité et Propriété
Ce prêt est consenti à titre gratuit, le coût de mise à disposition étant inclus dans l'abonnement logiciel STACK.
Le Matériel prêté reste la propriété exclusive, insaisissable et inaliénable du Prêteur (STACK). L'Emprunteur ne peut en aucun cas le sous-louer, le prêter à un tiers, le céder, le mettre en gage ou le modifier.

Article 5 – Obligations de l'Emprunteur
Pendant toute la durée du prêt, l'Emprunteur s'engage à :
- Utiliser le Matériel conformément à sa destination (encaissements par carte bancaire pour l'activité du salon via le logiciel STACK exclusif).
- Apporter tous les soins nécessaires à la garde et à la conservation du Matériel.
- Prendre à sa charge les frais d'entretien courant (nettoyage) et l'alimentation électrique nécessaire à son fonctionnement.
- Ne procéder à aucune modification, démontage ou tentative de réparation par un tiers non autorisé par le Prêteur.

Article 6 – Perte, Vol et Dégradations
L'Emprunteur assume l'entière responsabilité du Matériel dès sa remise. En cas de perte, de vol, de destruction ou de dégradation rendant le Matériel inutilisable (chute, casse, contact avec des liquides, etc.), l'Emprunteur s'engage à en informer le Prêteur sous 48 heures.
Dans un tel cas, l'Emprunteur sera redevable d'une indemnité forfaitaire de remplacement fixée à {{indemnite_ht}} € HT. Le Prêteur sera autorisé à facturer cette somme directement à l'Emprunteur ou à l'encaisser via le moyen de paiement enregistré pour l'abonnement logiciel.

Article 7 – Restitution du Matériel
À l'échéance du contrat ou en cas de résiliation de l'abonnement STACK, l'Emprunteur s'engage à restituer le Matériel complet (avec ses accessoires) et en bon état d'usage au Prêteur, dans un délai maximum de sept (7) jours ouvrés.
Les éventuels frais d'expédition pour le retour du Matériel sont à la charge de {{frais_retour}}.
À défaut de restitution dans ce délai, l'indemnité forfaitaire prévue à l'Article 6 sera exigible de plein droit.

Article 8 – Droit applicable et Litiges
Le présent contrat est soumis au droit français. En cas de litige, et à défaut de résolution amiable, compétence exclusive est attribuée aux tribunaux compétents de Strasbourg.

Fait à Strasbourg, le {{date}}.
Contrat conclu par voie électronique : chaque partie en conserve un exemplaire (PDF).

Pour le Prêteur (STACK) — « Lu et approuvé, bon pour prêt »
Valentin Tardy

Pour l'Emprunteur — « {{mention}} »
{{gerant_prenom}} {{gerant_nom}}`;

/* ==========================================================================
   OUTILS
   ========================================================================== */
const sha256 = (data) => require('crypto').createHash('sha256').update(data).digest('hex');
const fusionner = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null && String(vars[k]).trim() !== '' ? String(vars[k]) : '{{' + k + '}}'));
const normaliserMention = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const attestationDisponible = () => { try { return fs.existsSync(ATTESTATION_NF525_PATH); } catch (e) { return false; } };
const dateFR = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
const dateHeureFR = (d) => d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

/* Construit la liste des documents applicables à ce salon, avec texte fusionné et empreinte SHA-256 */
function construireDocuments(ctx, maintenant) {
    const vars = {
        nom_salon: ctx.nom_salon, gerant_prenom: ctx.gerant_prenom, gerant_nom: ctx.gerant_nom,
        adresse_salon: ctx.adresse_salon, siret_salon: ctx.siret_salon,
        tpe_modele: ctx.tpe_modele, tpe_serie: ctx.stripe_reader_id,
        tpe_accessoires: ctx.tpe_accessoires || 'Câble de rechargement USB',
        indemnite_ht: INDEMNITE_REMPLACEMENT_HT, frais_retour: FRAIS_RETOUR_A_CHARGE_DE,
        date: dateFR(maintenant), mention: MENTION_COMMODAT
    };
    const docs = [
        { id: 'cgv', titre: "Conditions générales d'utilisation et de vente", texte: TEXTE_CGV },
        { id: 'confidentialite', titre: 'Politique de confidentialité (RGPD)', texte: TEXTE_CONFIDENTIALITE },
        { id: 'sepa', titre: 'Paiement et mandat de prélèvement SEPA', texte: TEXTE_SEPA }
    ];
    if (attestationDisponible()) docs.push({ id: 'nf525', titre: 'Attestation de conformité NF525', texte: TEXTE_NF525, url: '/api/legal/attestation-nf525' });
    if (ctx.stripe_reader_id) docs.push({ id: 'commodat', titre: 'Contrat de prêt du terminal de paiement (TPE)', texte: TEXTE_COMMODAT, mention_requise: MENTION_COMMODAT });
    return docs.map(d => {
        const texte = fusionner(d.texte, vars);
        const empreinteSource = d.id === 'nf525' ? sha256(fs.readFileSync(ATTESTATION_NF525_PATH)) : sha256(texte);
        return { ...d, version: DOC_VERSIONS[d.id], texte, sha256: empreinteSource };
    });
}

const identiteComplete = (c) => !!(c.nom_salon && c.gerant_prenom && c.gerant_nom && c.adresse_salon && c.siret_salon);
const textesIncomplets = (docs) => docs.filter(d => /\{\{\w+\}\}/.test(d.texte)).map(d => d.id);

async function chargerContexte(pool, id_salon) {
    const r = await pool.query(
        `SELECT c.nom_salon, c.gerant_prenom, c.gerant_nom, c.adresse_salon, c.siret_salon, c.stripe_reader_id, c.tpe_modele, c.tpe_accessoires, u.email
         FROM configuration_salon c LEFT JOIN utilisateurs u ON u.id_salon = c.id_salon WHERE c.id_salon = $1`, [id_salon]);
    return r.rows[0] || null;
}

async function documentsAcceptes(pool, id_salon) {
    const r = await pool.query('SELECT documents FROM acceptations_legales WHERE id_salon = $1', [id_salon]);
    const set = new Set();
    r.rows.forEach(row => (row.documents || []).forEach(d => set.add(d.id + '@' + d.version)));
    return set;
}

/* Documents applicables mais pas encore acceptés dans leur version courante */
async function documentsEnAttente(pool, id_salon) {
    const ctx = await chargerContexte(pool, id_salon);
    if (!ctx) return [];
    const docs = construireDocuments(ctx, new Date());
    const acceptes = await documentsAcceptes(pool, id_salon);
    return docs.filter(d => !acceptes.has(d.id + '@' + d.version));
}

/* ==========================================================================
   CERTIFICAT PDF (dossier de preuve remis au gérant + archivé par l'éditeur)
   ========================================================================== */
function genererCertificatPDF(PDFDocument, acc) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks = [];
        doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        doc.fontSize(18).text("Certificat d'acceptation électronique — STACK", { align: 'center' }).moveDown();
        doc.fontSize(10).text(`Référence : ACC-${acc.id_acceptation}`);
        doc.text(`Date et heure (Europe/Paris) : ${dateHeureFR(new Date(acc.date_acceptation))}`);
        doc.text(`Date (UTC, ISO) : ${new Date(acc.date_acceptation).toISOString()}`).moveDown();
        doc.fontSize(12).text('Signataire', { underline: true });
        doc.fontSize(10);
        const i = acc.identite || {};
        doc.text(`${i.gerant_prenom || ''} ${i.gerant_nom || ''} — ${i.email || ''}`);
        doc.text(`${i.nom_salon || ''} — ${i.adresse_salon || ''} — SIRET ${i.siret_salon || ''}`);
        doc.text(`Adresse IP : ${acc.ip || 'inconnue'}`);
        doc.text(`Navigateur : ${acc.user_agent || 'inconnu'}`).moveDown();
        doc.fontSize(12).text('Documents acceptés', { underline: true });
        doc.fontSize(10);
        (acc.documents || []).forEach(d => doc.text(`• ${d.titre} — version ${d.version}\n  SHA-256 : ${d.sha256}`));
        doc.moveDown();
        doc.fontSize(12).text('Déclarations du signataire', { underline: true });
        doc.fontSize(10);
        doc.text('Le signataire déclare avoir le pouvoir d’engager la société ci-dessus, avoir pris connaissance des documents listés et les accepter.');
        if (acc.mentions && acc.mentions.mention_commodat) doc.text(`Mention recopiée pour le contrat de prêt : « ${acc.mentions.mention_commodat} »`);
        doc.moveDown();
        doc.fontSize(9).text(`Empreinte du dossier de preuve (SHA-256) : ${acc.hash_preuve}`);
        doc.text('Cette acceptation est destinée à valoir signature électronique (articles 1366 et 1367 du Code civil). Le présent certificat est généré automatiquement par le serveur STACK.');
        (acc.documents || []).forEach(d => {
            doc.addPage();
            doc.fontSize(13).text(d.titre + ' — version ' + d.version, { underline: true }).moveDown();
            doc.fontSize(9).text(d.texte);
        });
        doc.end();
    });
}

/* ==========================================================================
   ROUTES
   ========================================================================== */
function installerRoutesLegales({ app, pool, jwt, enregistrerJET, PDFDocument, nodemailer, crypto }) {

    // Migration : table de preuves en ajout seul + colonnes d'identité / TPE
    (async () => {
        try {
            await pool.query(`ALTER TABLE configuration_salon
                ADD COLUMN IF NOT EXISTS gerant_prenom VARCHAR(100),
                ADD COLUMN IF NOT EXISTS gerant_nom VARCHAR(100),
                ADD COLUMN IF NOT EXISTS adresse_salon VARCHAR(255),
                ADD COLUMN IF NOT EXISTS siret_salon VARCHAR(20),
                ADD COLUMN IF NOT EXISTS tpe_modele VARCHAR(100),
                ADD COLUMN IF NOT EXISTS tpe_accessoires VARCHAR(255)`);
            await pool.query(`CREATE TABLE IF NOT EXISTS acceptations_legales (
                id_acceptation SERIAL PRIMARY KEY,
                id_salon INTEGER NOT NULL,
                email VARCHAR(255),
                identite JSONB NOT NULL,
                documents JSONB NOT NULL,
                mentions JSONB,
                ip VARCHAR(64),
                user_agent TEXT,
                date_acceptation TIMESTAMPTZ NOT NULL,
                hash_preuve VARCHAR(64) NOT NULL
            )`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_acceptations_salon ON acceptations_legales (id_salon)`);
            await pool.query(`CREATE OR REPLACE FUNCTION interdire_modif_acceptations() RETURNS trigger AS $$
                BEGIN RAISE EXCEPTION 'acceptations_legales est en ajout seul (preuve juridique).'; END; $$ LANGUAGE plpgsql`);
            await pool.query(`DROP TRIGGER IF EXISTS trg_acceptations_ajout_seul ON acceptations_legales`);
            await pool.query(`CREATE TRIGGER trg_acceptations_ajout_seul BEFORE UPDATE OR DELETE ON acceptations_legales
                FOR EACH ROW EXECUTE PROCEDURE interdire_modif_acceptations()`);
            console.log('✅ Module légal prêt (acceptations_legales, ajout seul).');
        } catch (e) { console.error('❌ Migration module légal :', e.message); }
    })();

    // Gérant authentifié, MÊME sans abonnement actif (le contrat précède le paiement)
    const verifierGerantLegal = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ erreur: 'Accès refusé.' });
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) return res.status(403).json({ erreur: 'Token expiré ou invalide.' });
            if (user.role !== 'gerant') return res.status(403).json({ erreur: 'Réservé au gérant.' });
            req.user = user; next();
        });
    };
    const ipDe = (req) => ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '');

    // Pièce publique : l'attestation NF525 (PDF déposé côté serveur)
    app.get('/api/legal/attestation-nf525', (req, res) => {
        if (!attestationDisponible()) return res.status(404).json({ erreur: 'Attestation non disponible.' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="attestation-nf525.pdf"');
        fs.createReadStream(ATTESTATION_NF525_PATH).pipe(res);
    });

    // Statut : que doit encore accepter ce gérant ? + identité pré-remplie
    app.get('/api/legal/statut', verifierGerantLegal, async (req, res) => {
        try {
            const ctx = await chargerContexte(pool, req.user.id_salon);
            if (!ctx) return res.status(404).json({ erreur: 'Salon introuvable.' });
            const enAttente = await documentsEnAttente(pool, req.user.id_salon);
            res.json({
                accepte: enAttente.length === 0,
                en_attente: enAttente.map(d => ({ id: d.id, titre: d.titre })),
                identite: { nom_salon: ctx.nom_salon || '', gerant_prenom: ctx.gerant_prenom || '', gerant_nom: ctx.gerant_nom || '', adresse_salon: ctx.adresse_salon || '', siret_salon: ctx.siret_salon || '', email: ctx.email || '' }
            });
        } catch (e) { console.error('legal/statut', e.message); res.status(500).json({ erreur: 'Erreur de vérification des conditions.' }); }
    });

    // Étape 1 : enregistrer l'identité (mentions du contrat remplies automatiquement) et renvoyer les documents à lire
    app.post('/api/legal/identite', verifierGerantLegal, async (req, res) => {
        const b = req.body || {};
        const propre = (v, max) => String(v || '').trim().slice(0, max);
        const ident = { nom_salon: propre(b.nom_salon, 150), gerant_prenom: propre(b.gerant_prenom, 100), gerant_nom: propre(b.gerant_nom, 100), adresse_salon: propre(b.adresse_salon, 255), siret_salon: propre(b.siret_salon, 20).replace(/\s/g, '') };
        if (!identiteComplete(ident)) return res.status(400).json({ erreur: 'Tous les champs sont obligatoires.' });
        if (!/^\d{14}$/.test(ident.siret_salon)) return res.status(400).json({ erreur: 'Le SIRET doit comporter 14 chiffres.' });
        try {
            await pool.query('UPDATE configuration_salon SET nom_salon=$1, gerant_prenom=$2, gerant_nom=$3, adresse_salon=$4, siret_salon=$5 WHERE id_salon=$6',
                [ident.nom_salon, ident.gerant_prenom, ident.gerant_nom, ident.adresse_salon, ident.siret_salon, req.user.id_salon]);
            const ctx = await chargerContexte(pool, req.user.id_salon);
            const enAttente = await documentsEnAttente(pool, req.user.id_salon);
            const incomplets = textesIncomplets(enAttente);
            if (incomplets.length) return res.status(409).json({ erreur: 'Document incomplet côté éditeur : ' + incomplets.join(', ') + '. Contactez le support.' });
            res.json({ documents: enAttente.map(d => ({ id: d.id, titre: d.titre, version: d.version, texte: d.texte, url: d.url || null, mention_requise: d.mention_requise || null })), email: ctx.email });
        } catch (e) { console.error('legal/identite', e.message); res.status(500).json({ erreur: "Erreur d'enregistrement." }); }
    });

    // Étape 2 : acceptation = signature électronique + dossier de preuve
    app.post('/api/legal/accepter', verifierGerantLegal, async (req, res) => {
        const { cases, mention_commodat, pouvoir, consultes } = req.body || {};
        try {
            const ctx = await chargerContexte(pool, req.user.id_salon);
            if (!ctx || !identiteComplete(ctx)) return res.status(400).json({ erreur: "Complétez d'abord l'identité." });
            const maintenant = new Date();
            const enAttente = await documentsEnAttente(pool, req.user.id_salon);
            if (enAttente.length === 0) return res.json({ ok: true, deja_accepte: true });
            if (pouvoir !== true) return res.status(400).json({ erreur: "Vous devez déclarer avoir le pouvoir d'engager la société." });
            for (const d of enAttente) { if (!cases || cases[d.id] !== true) return res.status(400).json({ erreur: 'Case non cochée : ' + d.titre }); }
            const commodat = enAttente.find(d => d.id === 'commodat');
            if (commodat && normaliserMention(mention_commodat) !== normaliserMention(MENTION_COMMODAT)) return res.status(400).json({ erreur: `Recopiez la mention « ${MENTION_COMMODAT} ».` });

            // Re-génération des textes avec la date d'acceptation : c'est CE texte qui est archivé
            const docs = construireDocuments(ctx, maintenant).filter(d => enAttente.some(e => e.id === d.id));
            if (textesIncomplets(docs).length) return res.status(409).json({ erreur: 'Document incomplet côté éditeur.' });
            const documents = docs.map(d => ({ id: d.id, titre: d.titre, version: d.version, sha256: d.sha256, texte: d.texte }));
            const identite = { nom_salon: ctx.nom_salon, gerant_prenom: ctx.gerant_prenom, gerant_nom: ctx.gerant_nom, adresse_salon: ctx.adresse_salon, siret_salon: ctx.siret_salon, email: ctx.email };
            const mentions = { cases, pouvoir: true, consultes: Array.isArray(consultes) ? consultes.slice(0, 10) : [], mention_commodat: commodat ? String(mention_commodat).slice(0, 200) : null };
            const ip = ipDe(req).slice(0, 64), ua = String(req.headers['user-agent'] || '').slice(0, 500);
            const dateIso = maintenant.toISOString();
            const hash_preuve = crypto.createHash('sha256').update(JSON.stringify({ id_salon: req.user.id_salon, identite, documents: documents.map(d => ({ id: d.id, version: d.version, sha256: d.sha256 })), mentions, ip, ua, date: dateIso })).digest('hex');

            const ins = await pool.query(
                `INSERT INTO acceptations_legales (id_salon, email, identite, documents, mentions, ip, user_agent, date_acceptation, hash_preuve)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_acceptation`,
                [req.user.id_salon, ctx.email, identite, JSON.stringify(documents), JSON.stringify(mentions), ip, ua, dateIso, hash_preuve]);
            const id_acceptation = ins.rows[0].id_acceptation;

            try { await enregistrerJET(req.user.id_salon, 'ACCEPTATION_LEGALE', { id_acceptation, hash_preuve, documents: documents.map(d => d.id + '@' + d.version) }); } catch (e) { console.error('JET acceptation :', e.message); }

            // Copie PDF par email (gérant + archive éditeur) — ne bloque jamais l'acceptation
            (async () => {
                try {
                    const pdf = await genererCertificatPDF(PDFDocument, { id_acceptation, identite, documents, mentions, ip, user_agent: ua, date_acceptation: dateIso, hash_preuve });
                    const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
                    await transporter.sendMail({
                        from: `"STACK" <${process.env.SMTP_USER}>`, to: ctx.email, bcc: process.env.EMAIL_ARCHIVE_LEGAL || process.env.SMTP_USER,
                        subject: `STACK — Copie de votre acceptation (réf. ACC-${id_acceptation})`,
                        text: `Bonjour ${ctx.gerant_prenom},\n\nVous avez accepté électroniquement les documents contractuels STACK le ${dateHeureFR(maintenant)}.\nVous trouverez en pièce jointe le certificat d'acceptation, qui contient l'intégralité des textes acceptés.\n\nConservez ce document.\n\nSTACK`,
                        attachments: [{ filename: `STACK-acceptation-ACC-${id_acceptation}.pdf`, content: pdf }]
                    });
                } catch (e) { console.error('Email acceptation :', e.message); }
            })();

            res.json({ ok: true, id_acceptation, date: dateIso, email: ctx.email });
        } catch (e) { console.error('legal/accepter', e.message); res.status(500).json({ erreur: "Erreur d'enregistrement de l'acceptation." }); }
    });

    // Téléchargement du certificat PDF par le gérant
    app.get('/api/legal/certificat/:id', verifierGerantLegal, async (req, res) => {
        try {
            const r = await pool.query('SELECT * FROM acceptations_legales WHERE id_acceptation = $1 AND id_salon = $2', [parseInt(req.params.id, 10), req.user.id_salon]);
            if (r.rowCount === 0) return res.status(404).json({ erreur: 'Introuvable.' });
            const a = r.rows[0];
            const pdf = await genererCertificatPDF(PDFDocument, { ...a, date_acceptation: a.date_acceptation });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="STACK-acceptation-ACC-${a.id_acceptation}.pdf"`);
            res.send(pdf);
        } catch (e) { res.status(500).json({ erreur: 'Erreur de génération du certificat.' }); }
    });
}

module.exports = { installerRoutesLegales, documentsEnAttente, construireDocuments, genererCertificatPDF, normaliserMention, fusionner, MENTION_COMMODAT };
