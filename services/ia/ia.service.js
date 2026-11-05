// =========================================================================
// SERVICE INTELLIGENCE ARTIFICIELLE & TRAITEMENT OCR FACTURES (STACK SaaS)
// =========================================================================

const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const groqClient = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY || 'fake_key'
});

const PROMPT_SYSTEME_IA = `Tu es l'assistant pré-comptable et agenda d'un salon de coiffure. Analyse le contenu (email ou PDF) et retourne un JSON strict.

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

CAS 2 - RDV (Email direct, Planity, Treatwell, Wavy) : Réservation, modification ou annulation d'un rendez-vous client.
-> Renvoie EXACTEMENT :
{"type": "RDV", "donnees": {
  "action_rdv": "CREATION, MODIFICATION ou ANNULATION",
  "plateforme": "PLANITY, TREATWELL ou DIRECT",
  "nom_client": "Prénom Nom du client",
  "telephone": "numéro de téléphone (si présent, sinon '')",
  "prestation": "Nom de la prestation (ex: Coupe + Balayage)",
  "date_heure_debut": "YYYY-MM-DDTHH:MM",
  "duree_minutes": 30,
  "nom_employe": "Prénom du coiffeur/collaborateur mentionné dans l'e-mail (sinon '')"
}}

CAS 3 - ABSENCE : Un employé sera absent. -> Renvoie {"type": "ABSENCE", "donnees": {"nom_employe": "nom", "type_demande": "ARRET_MALADIE ou CONGES", "date_debut": "YYYY-MM-DD", "date_fin": "YYYY-MM-DD"}}
CAS 4 - ACTION : Facture générale (EDF, Urssaf) ou urgence. -> Renvoie {"type": "ACTION", "donnees": {"titre": "Urssaf", "description": "...", "date_echeance": "YYYY-MM-DD"}}
CAS 5 - AUTRE : -> Renvoie {"type": "NONE"}`;

/**
 * Analyse d'un email automatique reçu par IMAP
 */
async function analyserEmailAvecIA(sujet, texte, pdfUrl = null, fichierCleR2 = null, client = groqClient) {
    if (!process.env.GROQ_API_KEY) return [];

    const texteTronque = (texte || '').substring(0, 15000); 

    try {
        const anneeEnCours = new Date().getFullYear();
        const dateDuJour = new Date().toLocaleDateString('fr-FR');
        
        const completion = await client.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 800,
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

        // --- CAS 1 : FACTURE FOURNISSEUR PRÉ-COMPTABLE ---
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
                    pdf_url: pdfUrl,
                    fichier_cle_r2: fichierCleR2 || null
                }
            }];
        }

        // --- CAS 2 : STOCK ---
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

        // --- CAS 3 : RDV (DIRECT OU SYNCHRO PLANITY / TREATWELL) ---
        if (analyse.type === 'RDV' && analyse.donnees && analyse.donnees.nom_client) {
            const dateHeurePropre = analyse.donnees.date_heure_debut || analyse.donnees.date_heure || '';
            return [{
                type_tache: 'RDV',
                donnees: {
                    action_rdv: analyse.donnees.action_rdv || 'CREATION',
                    plateforme: analyse.donnees.plateforme || 'DIRECT',
                    nom_client: String(analyse.donnees.nom_client).trim().substring(0, 100),
                    telephone: analyse.donnees.telephone ? String(analyse.donnees.telephone).replace(/[^\d+]/g, '').substring(0, 20) : '',
                    prestation: analyse.donnees.prestation ? String(analyse.donnees.prestation).trim().substring(0, 100) : 'Prestation à définir',
                    date_heure_debut: dateHeurePropre,
                    duree_minutes: analyse.donnees.duree_minutes ? parseInt(analyse.donnees.duree_minutes, 10) : 30,
                    nom_employe_suggere: analyse.donnees.nom_employe ? String(analyse.donnees.nom_employe).trim() : '',
                    id_employe: ''
                }
            }];
        }

        // --- CAS 4 : ABSENCE ---
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

        // --- CAS 5 : ACTION ---
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

/**
 * Récupère les tâches IA en attente pour un salon
 */
async function recupererTachesIA({ pool }, { id_salon }) {
    const result = await pool.query(
        "SELECT * FROM ia_taches_attente WHERE id_salon = $1 AND statut = 'ATTENTE' ORDER BY date_creation DESC",
        [id_salon]
    );
    return result.rows;
}

/**
 * Saisie manuelle de facture / dépense fournisseur avec vérification code PIN
 */
async function saisirFactureManuelle({ pool, enregistrerMouvementCaisseScelle, enregistrerJET, verifierPinActionSensibleSalon }, { req, user, body }) {
    if (user.role === 'employe') {
        throw { status: 403, message: "Accès réservé au gérant ou à la caisse." };
    }

    const { nom_fournisseur, numero_facture, date_facture, montant_ht, montant_tva, montant_ttc, mode_paiement, compte_comptable, id_employe, code_pin } = body;
    const id_salon = user.id_salon;

    if (verifierPinActionSensibleSalon) {
        try {
            await verifierPinActionSensibleSalon(req, {
                id_employe: id_employe === 'gerant' ? 'gerant' : id_employe,
                nom_operateur: id_employe === 'gerant' ? 'Gérant' : null,
                code_pin,
                action_label: 'Saisie manuelle de dépense'
            });
        } catch (pinErr) {
            throw {
                status: 400,
                message: pinErr.message,
                require_pin: true,
                tentatives: pinErr.tentatives,
                locked_until: pinErr.locked_until,
                locked_permanent: pinErr.locked_permanent
            };
        }
    }

    if (!nom_fournisseur || !String(nom_fournisseur).trim()) {
        throw { status: 400, message: "Le nom du fournisseur est obligatoire." };
    }
    const ttc = parseFloat(montant_ttc);
    if (isNaN(ttc) || ttc <= 0) {
        throw { status: 400, message: "Le montant TTC doit être supérieur à 0." };
    }
    const ht = !isNaN(parseFloat(montant_ht)) ? parseFloat(montant_ht) : Number((ttc / 1.2).toFixed(2));
    const tva = !isNaN(parseFloat(montant_tva)) ? parseFloat(montant_tva) : Number((ttc - ht).toFixed(2));
    const mode = mode_paiement || 'CARTE';
    const compte = compte_comptable || '604';
    const numFac = numero_facture && String(numero_facture).trim() !== '' ? String(numero_facture).trim() : null;
    const dFac = date_facture ? new Date(date_facture) : new Date();
    const dateFactureISO = !isNaN(dFac.getTime()) ? dFac.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const dateReglementISO = (mode !== 'NON_SPECIFIE' && mode !== 'N/A') ? dateFactureISO : null;

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        await clientDB.query(
            `INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon, date_traitement, date_facture, date_reglement, numero_facture, mode_paiement, statut_verification, compte_comptable)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDE', $11)`,
            [String(nom_fournisseur).trim(), ht, tva, ttc, id_salon, new Date(dateFactureISO).toISOString(), dateFactureISO, dateReglementISO, numFac, mode, compte]
        );

        if (mode.toUpperCase() === 'ESPECES' && ttc > 0 && typeof enregistrerMouvementCaisseScelle === 'function') {
            const motifSortie = numFac
                ? `Paiement Facture ${numFac} - ${String(nom_fournisseur).trim()}`
                : `Paiement Facture - ${String(nom_fournisseur).trim()}`;
            const scelle = await enregistrerMouvementCaisseScelle(clientDB, {
                id_salon,
                id_employe: null,
                type_mouvement: 'SORTIE',
                montant: ttc,
                motif: motifSortie,
                categorie_comptable: 'ACHAT_ESPECES'
            });
            if (typeof enregistrerJET === 'function') {
                await enregistrerJET(id_salon, 'MOUVEMENT_CAISSE', { id_mouvement: scelle.id_mouvement, type_mouvement: 'SORTIE', montant: ttc, motif: motifSortie, hash_mouvement: scelle.hash_mouvement }, clientDB);
            }
        }

        await clientDB.query('COMMIT');
        return { message: "Dépense enregistrée avec succès en comptabilité." };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur saisie manuelle facture:", e);
        if (e.status) throw e;
        throw { status: 400, message: e.message || "Erreur lors de l'enregistrement de la facture." };
    } finally {
        clientDB.release();
    }
}

/**
 * Upload manuel de facture (PDF ou image) vers l'IA avec stockage R2 et analyse OCR
 */
async function analyserEtUploaderFactureIA({ pool, s3Client }, { id_salon, body }) {
    const { fichier_base64, mime_type } = body;
    if (!fichier_base64) throw { status: 400, message: "Fichier manquant." };

    const base64Propre = String(fichier_base64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Propre, 'base64');

    const isImage = mime_type && mime_type.startsWith('image/');
    const extension = isImage ? (mime_type.includes('png') ? 'png' : 'jpg') : 'pdf';

    // 1. Sauvegarde sur Cloudflare R2
    let urlCloudflare = null;
    let cleR2Facture = null;
    let r2Reussi = false;
    if (s3Client && process.env.R2_BUCKET_NAME) {
        try {
            const nomFichierUnique = `factures/${id_salon}/${Date.now()}_upload_manuel.${extension}`;
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: nomFichierUnique,
                Body: buffer,
                ContentType: mime_type || 'application/pdf'
            }));
            cleR2Facture = nomFichierUnique;
            const commandGet = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: nomFichierUnique });
            urlCloudflare = await getSignedUrl(s3Client, commandGet, { expiresIn: 604800 });
            r2Reussi = !!(urlCloudflare && urlCloudflare.startsWith('https://'));
        } catch (erreurR2) {
            console.error("⚠️ Erreur Cloudflare R2 (Repli local) :", erreurR2.message);
            urlCloudflare = `data:${mime_type || 'application/pdf'};base64,${base64Propre}`;
        }
    } else {
        urlCloudflare = `data:${mime_type || 'application/pdf'};base64,${base64Propre}`;
    }

    const anneeEnCours = new Date().getFullYear();
    const dateDuJour = new Date().toISOString().slice(0, 10);

    const promptFactureDedie = `Tu es l'expert-comptable d'un salon de coiffure. Analyse cette facture ou ce ticket de dépense et retourne UNIQUEMENT un JSON strict au format suivant :
{
  "est_facture_valide": true,
  "fournisseur": "Nom du fournisseur ou enseigne",
  "numero_facture": "Numéro de facture ou ticket (sinon null)",
  "date_facture": "YYYY-MM-DD (utilise ${anneeEnCours} si l'année est absente, ou ${dateDuJour} par défaut)",
  "montant_ht": 100.00,
  "montant_tva": 20.00,
  "montant_ttc": 120.00,
  "mode_paiement": "CARTE, ESPECES, PRELEVEMENT, VIREMENT, CHEQUE ou NON_SPECIFIE",
  "compte_comptable": "607 (Revente), 6028 (Consommables pro), 6061 (Énergie/Eau), 613 (Loyer), 604 (Services) ou 6064 (Fournitures)",
  "produits": [
    {"nom": "Nom article", "quantite": 1, "prix_unitaire_ht": 10.00, "reference": "REF", "type_destine": "REVENTE ou CONSOMMABLE"}
  ]
}
Si le document n'a aucun rapport avec une facture, un reçu ou une dépense, renvoie {"est_facture_valide": false}.`;

    let completion;
    if (!isImage) {
        const dataPdf = await pdfParse(buffer);
        const textePdf = (dataPdf.text || '').substring(0, 15000);
        completion = await groqClient.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 900,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: promptFactureDedie },
                { role: 'user', content: `Contenu de la facture :\n${textePdf}` }
            ]
        });
    } else {
        const imageSourceUrl = r2Reussi ? urlCloudflare : `data:${mime_type || 'image/jpeg'};base64,${base64Propre}`;
        completion = await groqClient.chat.completions.create({
            model: 'qwen/qwen3.8-27b',
            max_tokens: 900,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: promptFactureDedie },
                {
                    role: 'user',
                    content: [
                        { type: "text", text: "Extrais toutes les données comptables et les lignes de produits de cette facture." },
                        { type: "image_url", image_url: { url: imageSourceUrl } }
                    ]
                }
            ]
        });
    }

    const brut = (completion.choices?.[0]?.message?.content || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const analyse = JSON.parse(brut);
    const d = analyse.donnees || analyse;

    const montantTtcNum = parseFloat(d.montant_ttc) || 0;
    const montantHtNum = parseFloat(d.montant_ht) || (montantTtcNum > 0 ? Number((montantTtcNum / 1.2).toFixed(2)) : 0);
    const montantTvaNum = parseFloat(d.montant_tva) || Number(Math.max(0, montantTtcNum - montantHtNum).toFixed(2));

    if (analyse.est_facture_valide === false || (!d.fournisseur && montantTtcNum === 0 && montantHtNum === 0)) {
        throw { status: 400, message: "L'IA n'a pas reconnu de facture valide dans ce document." };
    }

    const donneesPropres = {
        fournisseur: String(d.fournisseur || 'Fournisseur').trim(),
        numero_facture: d.numero_facture ? String(d.numero_facture).trim() : null,
        date_facture: d.date_facture || dateDuJour,
        montant_ht: montantHtNum,
        montant_tva: montantTvaNum,
        montant_ttc: montantTtcNum || Number((montantHtNum + montantTvaNum).toFixed(2)),
        mode_paiement: d.mode_paiement || 'NON_SPECIFIE',
        compte_comptable: d.compte_comptable || '6028',
        produits: Array.isArray(d.produits) ? d.produits : [],
        pdf_url: urlCloudflare,
        fichier_cle_r2: cleR2Facture,
        mime_type: mime_type || 'application/pdf'
    };

    // Purge les anciens doublons en attente de la même facture
    await pool.query(
        `DELETE FROM ia_taches_attente
         WHERE id_salon = $1
           AND type_tache = 'FACTURE_ACHAT'
           AND statut = 'ATTENTE'
           AND COALESCE(donnees->>'fournisseur', '') = $2
           AND COALESCE(donnees->>'montant_ttc', '') = $3`,
        [id_salon, donneesPropres.fournisseur, String(donneesPropres.montant_ttc)]
    ).catch(() => {});

    const insertRes = await pool.query(
        `INSERT INTO ia_taches_attente (id_salon, type_tache, donnees, statut)
         VALUES ($1, 'FACTURE_ACHAT', $2, 'ATTENTE')
         RETURNING id_tache`,
        [id_salon, donneesPropres]
    );

    return {
        message: "Analyse IA terminée avec succès.",
        tache: {
            id_tache: insertRes.rows[0].id_tache,
            type_tache: 'FACTURE_ACHAT',
            donnees: donneesPropres
        }
    };
}

/**
 * Supprimer une tâche IA
 */
async function supprimerTacheIA({ pool }, { id_salon, id_tache }) {
    await pool.query(
        `DELETE FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2`,
        [id_tache, id_salon]
    );
    return { message: "Facture ignorée et retirée de la file d'attente." };
}

/**
 * Valider une tâche IA (insertion compta, stocks, rendez-vous, absences ou actions)
 */
async function validerTacheIA({ pool, io, enregistrerMouvementCaisseScelle, enregistrerJET }, { id_salon, id_tache, donnees }) {
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        
        const idTacheNum = parseInt(id_tache, 10);
        if (isNaN(idTacheNum)) throw { status: 400, message: "Identifiant de tâche invalide." };

        const tacheRes = await clientDB.query(
            "SELECT type_tache FROM ia_taches_attente WHERE id_tache = $1 AND id_salon = $2 AND statut = 'ATTENTE' FOR UPDATE",
            [idTacheNum, id_salon]
        );
        if (tacheRes.rowCount === 0) throw { status: 404, message: "Tâche introuvable ou déjà traitée." };
        const type_tache = tacheRes.rows[0].type_tache;

        // 1. FACTURE FOURNISSEUR (DOUBLE ACTION COMPTA & STOCK)
        if (type_tache === 'FACTURE_ACHAT') {
            const ht = parseFloat(donnees.montant_ht) || 0;
            const tva = parseFloat(donnees.montant_tva) || 0;
            const ttc = parseFloat(donnees.montant_ttc) || 0;
            let dateFacture = donnees.date_facture ? new Date(donnees.date_facture) : new Date();
            if (isNaN(dateFacture)) dateFacture = new Date();

            const numFacture = donnees.numero_facture || null;
            const modePaiement = donnees.mode_paiement || 'NON_SPECIFIE';
            const justifUrl = donnees.pdf_url || null;
            const fichierCleR2 = donnees.fichier_cle_r2 || null;
            const compteComptable = donnees.compte_comptable || null;
            const fournisseur = donnees.fournisseur || 'Fournisseur Inconnu';
            const dateFactureISO = dateFacture.toISOString().split('T')[0];
            const dateReglementISO = (modePaiement !== 'NON_SPECIFIE' && modePaiement !== 'N/A') ? (donnees.date_reglement || dateFactureISO) : null;

            await clientDB.query(
                `INSERT INTO factures_fournisseurs (nom_fournisseur, montant_ht, montant_tva, montant_ttc, id_salon, date_traitement, date_facture, date_reglement, numero_facture, mode_paiement, statut_verification, justificatif_url, fichier_cle_r2, compte_comptable) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VALIDE', $11, $12, $13)`,
                [fournisseur, ht, tva, ttc, id_salon, dateFacture.toISOString(), dateFactureISO, dateReglementISO, numFacture, modePaiement, justifUrl, fichierCleR2, compteComptable]
            );

            // Synchronisation Caisse Sortie d'espèces
            if (modePaiement.toUpperCase() === 'ESPECES' && ttc > 0 && typeof enregistrerMouvementCaisseScelle === 'function') {
                const motifSortie = numFacture 
                    ? `Paiement Facture ${numFacture} - ${fournisseur}` 
                    : `Paiement Facture - ${fournisseur}`;
                
                const scelle = await enregistrerMouvementCaisseScelle(clientDB, {
                    id_salon,
                    id_employe: null,
                    type_mouvement: 'SORTIE',
                    montant: ttc,
                    motif: motifSortie,
                    categorie_comptable: 'ACHAT_ESPECES'
                });
                
                if (typeof enregistrerJET === 'function') {
                    await enregistrerJET(id_salon, 'MOUVEMENT_CAISSE', { id_mouvement: scelle.id_mouvement, type_mouvement: 'SORTIE', montant: ttc, motif: motifSortie, hash_mouvement: scelle.hash_mouvement }, clientDB);
                }
            }

            // Synchronisation Stock Produits
            if (donnees.produits && Array.isArray(donnees.produits)) {
                for (let p of donnees.produits) {
                    const qte = parseInt(p.quantite) || 0;
                    if (qte <= 0 || !p.nom) continue;

                    const typeArticle = p.type_destine === 'REVENTE' ? 'PRODUIT_REVENTE' : 'CONSOMMABLE';

                    const check = await clientDB.query(
                        "SELECT id_article FROM catalogue WHERE nom ILIKE $1 AND id_salon = $2 LIMIT 1",
                        [p.nom, id_salon]
                    );

                    if (check.rowCount > 0) {
                        await clientDB.query(
                            "UPDATE catalogue SET stock_actuel = stock_actuel + $1 WHERE id_article = $2",
                            [qte, check.rows[0].id_article]
                        );
                    } else {
                        await clientDB.query(
                            "INSERT INTO catalogue (nom, type_article, prix, stock_actuel, id_salon) VALUES ($1, $2, $3, $4, $5)",
                            [p.nom, typeArticle, 0, qte, id_salon] 
                        );
                    }
                }
            }
        } else if (type_tache === 'STOCK') {
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

            if (io) io.to(id_salon.toString()).emit('nouveauRDV');
        } else if (type_tache === 'ABSENCE') {
            const empRes = await clientDB.query("SELECT id_employe FROM employes WHERE nom ILIKE $1 AND id_salon = $2 LIMIT 1", [`%${donnees.nom_employe}%`, id_salon]);
            if (empRes.rowCount === 0) throw { status: 404, message: `Collaborateur introuvable : ${donnees.nom_employe}` };
            const idEmploye = empRes.rows[0].id_employe;

            const conflit = await clientDB.query(
                `SELECT 1 FROM absences_employes 
                 WHERE id_salon = $1 AND id_employe = $2 AND statut != 'REFUSE' 
                 AND date_debut <= $4 AND date_fin >= $3`,
                [id_salon, idEmploye, donnees.date_debut, donnees.date_fin]
            );
            if (conflit.rowCount > 0) throw { status: 400, message: "Cet employé a déjà une absence enregistrée sur cette période." };

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
            if (io) io.to(id_salon.toString()).emit('nouveauRDV');
        } else if (type_tache === 'ACTION') {
            let echeance = donnees.date_echeance && donnees.date_echeance !== '' ? donnees.date_echeance : null;
            await clientDB.query(
                "INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'IA')",
                [id_salon, donnees.titre, donnees.description, echeance]
            );
        }

        await clientDB.query("UPDATE ia_taches_attente SET statut = 'VALIDE' WHERE id_tache = $1 AND id_salon = $2", [idTacheNum, id_salon]);
        await clientDB.query('COMMIT');
        return { message: "Action IA validée !" };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur validation tâche IA:", e);
        if (e.status) throw e;
        throw { status: 500, message: e.message || "Erreur lors de la validation de la tâche IA." };
    } finally { 
        clientDB.release(); 
    }
}

/**
 * Ignorer une tâche IA
 */
async function ignorerTacheIA({ pool }, { id_salon, id_tache }) {
    const idTacheNum = parseInt(id_tache, 10);
    if (isNaN(idTacheNum)) throw { status: 400, message: "ID invalide" };
    await pool.query("UPDATE ia_taches_attente SET statut = 'IGNORE' WHERE id_tache = $1 AND id_salon = $2", [idTacheNum, id_salon]);
    return { message: "Tâche ignorée." };
}

module.exports = {
    analyserEmailAvecIA,
    recupererTachesIA,
    saisirFactureManuelle,
    analyserEtUploaderFactureIA,
    supprimerTacheIA,
    validerTacheIA,
    ignorerTacheIA
};
