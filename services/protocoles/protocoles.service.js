/**
 * services/protocoles/protocoles.service.js
 * Gestion des fiches techniques (Académie), recettes produits, médias Cloudflare R2 et tâches d'action
 */

const crypto = require('crypto');
const { PutObjectCommand: R2PutObjectCommand, GetObjectCommand: R2GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Convertit une image Base64 en fichier binaire sur Cloudflare R2 et renvoie "r2://..."
 * Si l'image est déjà une URL signée R2 existante, conserve sa clé interne.
 */
async function stockerImageSurR2(valeurImage, id_salon, sousDossier = 'academie', deps = {}) {
    if (!valeurImage || typeof valeurImage !== 'string') return null;
    const str = valeurImage.trim();
    if (!str) return null;

    // 1. Déjà au format clé R2 interne
    if (str.startsWith('r2://')) return str;

    // 2. Si le frontend renvoie une URL signée R2 d'une image déjà stockée (lors d'une édition)
    const matchCleExistante = str.match(/salons\/\d+\/(?:academie|signatures)\/[a-zA-Z0-9_.-]+/);
    if (matchCleExistante) {
        return `r2://${matchCleExistante[0]}`;
    }

    const s3Client = deps.s3Client || global.s3Client;

    // 3. Si c'est une nouvelle image en Base64 ("data:image/...;base64,...")
    if (str.startsWith('data:image/') && process.env.R2_BUCKET_NAME && s3Client) {
        try {
            const matchB64 = str.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (matchB64) {
                const mimeType = matchB64[1];
                const base64Data = matchB64[2];
                const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
                const buffer = Buffer.from(base64Data, 'base64');
                const cleR2 = `salons/${id_salon}/${sousDossier}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

                await s3Client.send(new R2PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: cleR2,
                    Body: buffer,
                    ContentType: mimeType
                }));
                return `r2://${cleR2}`;
            }
        } catch (errR2) {
            console.error("⚠️ [R2 Upload] Bascule en stockage local suite à une erreur R2 :", errR2.message);
        }
    }

    // Fallback si R2 non configuré en local ou URL externe classique
    return str;
}

/**
 * Transforme une clé "r2://..." en URL temporaire signée (valable 7 jours) pour l'affichage React
 */
async function resoudreUrlImageDepuisR2(valeurStockee, deps = {}) {
    if (!valeurStockee || typeof valeurStockee !== 'string') return null;
    const s3Client = deps.s3Client || global.s3Client;

    if (valeurStockee.startsWith('r2://') && process.env.R2_BUCKET_NAME && s3Client) {
        try {
            const cleR2 = valeurStockee.replace('r2://', '');
            const cmd = new R2GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: cleR2 });
            return await getSignedUrl(s3Client, cmd, { expiresIn: 604800 });
        } catch (errSign) {
            console.error("⚠️ [R2 Sign URL] Impossible de signer l'URL :", errSign.message);
            return null;
        }
    }
    return valeurStockee;
}

/**
 * Migration d'arrière-plan des images/signatures Base64 existantes vers R2
 */
async function migrerBase64ExistantsVersR2({ pool, s3Client }) {
    if (!process.env.R2_BUCKET_NAME || !s3Client) return;
    try {
        const protosRes = await pool.query(`
            SELECT id_protocole, id_salon, medias, etapes
            FROM protocoles
            WHERE medias::text LIKE '%data:image/%' OR etapes::text LIKE '%data:image/%'
        `);

        for (const p of protosRes.rows) {
            let mediasObj = p.medias && typeof p.medias === 'object' ? { ...p.medias } : {};
            for (const k of ['avant', 'pendant', 'apres']) {
                if (mediasObj[k] && String(mediasObj[k]).startsWith('data:image/')) {
                    mediasObj[k] = await stockerImageSurR2(mediasObj[k], p.id_salon, 'academie', { s3Client });
                }
            }

            let etapesArr = Array.isArray(p.etapes) ? [...p.etapes] : [];
            for (let i = 0; i < etapesArr.length; i++) {
                if (etapesArr[i] && typeof etapesArr[i] === 'object' && etapesArr[i].photo_url && String(etapesArr[i].photo_url).startsWith('data:image/')) {
                    etapesArr[i] = {
                        ...etapesArr[i],
                        photo_url: await stockerImageSurR2(etapesArr[i].photo_url, p.id_salon, 'academie', { s3Client })
                    };
                }
            }

            await pool.query(
                `UPDATE protocoles SET medias = $1, etapes = $2 WHERE id_protocole = $3`,
                [JSON.stringify(mediasObj), JSON.stringify(etapesArr), p.id_protocole]
            );
        }

        await pool.query(`ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS signature_base64 TEXT`).catch(() => {});
        const sigsRes = await pool.query(`
            SELECT id_validation, id_salon, signature_base64
            FROM liasses_mensuelles_validees
            WHERE signature_base64 LIKE 'data:image/%'
        `);

        for (const s of sigsRes.rows) {
            const cleSigR2 = await stockerImageSurR2(s.signature_base64, s.id_salon, 'signatures', { s3Client });
            if (cleSigR2 && cleSigR2.startsWith('r2://')) {
                await pool.query(
                    `UPDATE liasses_mensuelles_validees SET signature_base64 = $1 WHERE id_validation = $2`,
                    [cleSigR2, s.id_validation]
                );
            }
        }

        if (protosRes.rowCount > 0 || sigsRes.rowCount > 0) {
            console.log(`✅ [Optimisation PostgreSQL -> R2] ${protosRes.rowCount} protocole(s) et ${sigsRes.rowCount} signature(s) migrés hors de PostgreSQL.`);
        }
    } catch (errMig) {
        console.error("⚠️ [Migration R2] Erreur non bloquante :", errMig.message);
    }
}

/**
 * Normalise les étapes d'un protocole et extrait les ingrédients de recette associés
 */
async function normaliserEtapesEtExtraireIngredients(etapesBrutes = [], ingredientsGlobaux = [], id_salon = 0, deps = {}) {
    const etapesNormalisees = [];
    const lignesRecetteSQL = [];

    if (Array.isArray(etapesBrutes)) {
        for (let index = 0; index < etapesBrutes.length; index++) {
            const etape = etapesBrutes[index];
            if (typeof etape === 'string') {
                etapesNormalisees.push({
                    numero: index + 1,
                    titre: `Étape ${index + 1}`,
                    description: etape,
                    duree_minutes: 0,
                    photo_url: null,
                    video_url: null,
                    ingredients: []
                });
            } else if (etape && typeof etape === 'object') {
                const ingsEtape = Array.isArray(etape.ingredients)
                    ? etape.ingredients
                        .filter(ing => ing && ing.id_article)
                        .map(ing => ({
                            id_article: parseInt(ing.id_article, 10),
                            nom: ing.nom || null,
                            quantite_necessaire: parseFloat(String(ing.quantite_necessaire || 1).replace(',', '.')) || 1,
                            proportion: ing.proportion ? String(ing.proportion).trim().substring(0, 120) : ''
                        }))
                    : [];

                ingsEtape.forEach(ing => {
                    lignesRecetteSQL.push({
                        id_article: ing.id_article,
                        quantite_necessaire: ing.quantite_necessaire,
                        numero_etape: index + 1,
                        proportion: ing.proportion || null
                    });
                });

                const photoStockeeR2 = etape.photo_url
                    ? await stockerImageSurR2(etape.photo_url, id_salon, 'academie', deps)
                    : null;

                etapesNormalisees.push({
                    numero: index + 1,
                    titre: etape.titre ? String(etape.titre).trim() : `Étape ${index + 1}`,
                    description: etape.description ? String(etape.description).trim() : (etape.texte ? String(etape.texte).trim() : ''),
                    duree_minutes: parseInt(etape.duree_minutes ?? etape.timer_min, 10) || 0,
                    photo_url: photoStockeeR2,
                    video_url: etape.video_url || null,
                    ingredients: ingsEtape
                });
            }
        }
    }

    if (lignesRecetteSQL.length === 0 && Array.isArray(ingredientsGlobaux)) {
        ingredientsGlobaux.forEach(ing => {
            if (!ing || !ing.id_article) return;
            lignesRecetteSQL.push({
                id_article: parseInt(ing.id_article, 10),
                quantite_necessaire: parseFloat(String(ing.quantite_necessaire || 1).replace(',', '.')) || 1,
                numero_etape: parseInt(ing.numero_etape, 10) || 0,
                proportion: ing.proportion ? String(ing.proportion).trim().substring(0, 120) : null
            });
        });
    }

    return { etapesNormalisees, lignesRecetteSQL };
}

/**
 * Normalise la galerie de médias (Avant / Pendant / Après) vers R2
 */
async function normaliserGalerieMediasVersR2(mediasBruts = {}, id_salon = 0, deps = {}) {
    if (!mediasBruts || typeof mediasBruts !== 'object') return { avant: null, pendant: null, apres: null };
    return {
        avant: mediasBruts.avant ? await stockerImageSurR2(mediasBruts.avant, id_salon, 'academie', deps) : null,
        pendant: mediasBruts.pendant ? await stockerImageSurR2(mediasBruts.pendant, id_salon, 'academie', deps) : null,
        apres: mediasBruts.apres ? await stockerImageSurR2(mediasBruts.apres, id_salon, 'academie', deps) : null
    };
}

/**
 * Récupère tous les protocoles du salon avec ingrédients et URLs signées
 */
async function recupererProtocoles({ pool, s3Client }, id_salon) {
    const result = await pool.query(`
        SELECT p.*, 
               COALESCE(
                   json_agg(
                       json_build_object(
                           'id_recette', r.id_recette,
                           'id_article', r.id_article,
                           'quantite_necessaire', r.quantite_necessaire,
                           'numero_etape', COALESCE(r.numero_etape, 0),
                           'proportion', r.proportion,
                           'nom', c.nom,
                           'stock_actuel', c.stock_actuel
                       ) ORDER BY COALESCE(r.numero_etape, 0) ASC, r.id_recette ASC
                   ) FILTER (WHERE r.id_article IS NOT NULL),
                   '[]'
               ) as ingredients
        FROM protocoles p
        LEFT JOIN recettes_articles r ON p.id_protocole = r.id_protocole
        LEFT JOIN catalogue c ON r.id_article = c.id_article
        WHERE p.id_salon = $1
        GROUP BY p.id_protocole
        ORDER BY p.nom_prestation ASC
    `, [id_salon]);

    const rowsEnrichies = await Promise.all(result.rows.map(async (proto) => {
        const ingsList = Array.isArray(proto.ingredients) ? proto.ingredients : [];
        const rawEtapes = Array.isArray(proto.etapes) ? proto.etapes : [];

        const mediasResolus = {
            avant: proto.medias?.avant ? await resoudreUrlImageDepuisR2(proto.medias.avant, { s3Client }) : null,
            pendant: proto.medias?.pendant ? await resoudreUrlImageDepuisR2(proto.medias.pendant, { s3Client }) : null,
            apres: proto.medias?.apres ? await resoudreUrlImageDepuisR2(proto.medias.apres, { s3Client }) : null
        };

        const etapesStructurees = await Promise.all(rawEtapes.map(async (et, idx) => {
            const numEtape = idx + 1;
            const ingsDeCetteEtape = ingsList.filter(i => Number(i.numero_etape) === numEtape);

            if (typeof et === 'string') {
                return {
                    numero: numEtape,
                    titre: `Étape ${numEtape}`,
                    description: et,
                    duree_minutes: 0,
                    photo_url: null,
                    video_url: null,
                    ingredients: ingsDeCetteEtape
                };
            }

            const ingsDansJson = Array.isArray(et.ingredients) ? et.ingredients : [];
            const ingsFusionnes = ingsDeCetteEtape.length > 0
                ? ingsDeCetteEtape
                : ingsDansJson.map(ij => {
                    const matchCat = ingsList.find(x => Number(x.id_article) === Number(ij.id_article));
                    return {
                        ...ij,
                        nom: matchCat?.nom || ij.nom || 'Produit technique'
                    };
                });

            const photoUrlSignee = et.photo_url ? await resoudreUrlImageDepuisR2(et.photo_url, { s3Client }) : null;

            return {
                numero: numEtape,
                titre: et.titre || `Étape ${numEtape}`,
                description: et.description || et.texte || '',
                duree_minutes: parseInt(et.duree_minutes ?? et.timer_min, 10) || 0,
                photo_url: photoUrlSignee,
                video_url: et.video_url || null,
                ingredients: ingsFusionnes
            };
        }));

        return {
            ...proto,
            medias: mediasResolus,
            etapes: etapesStructurees
        };
    }));

    return rowsEnrichies;
}

/**
 * Crée un nouveau protocole avec ingrédients et téléversement R2
 */
async function creerProtocole({ pool, s3Client }, { id_salon, body }) {
    const { nom_prestation, description, etapes, medias, tags, delai_livraison_jours, ingredients, temps_nettoyage_minutes } = body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const { etapesNormalisees, lignesRecetteSQL } = await normaliserEtapesEtExtraireIngredients(etapes, ingredients, id_salon, { s3Client });
        const mediasNormalisesR2 = await normaliserGalerieMediasVersR2(medias, id_salon, { s3Client });

        const protoRes = await clientDB.query(
            `INSERT INTO protocoles (id_salon, nom_prestation, description, etapes, medias, tags, delai_livraison_jours, temps_nettoyage_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_protocole`,
            [
                id_salon,
                nom_prestation,
                description || null,
                JSON.stringify(etapesNormalisees),
                JSON.stringify(mediasNormalisesR2),
                JSON.stringify(tags || []),
                delai_livraison_jours || 3,
                temps_nettoyage_minutes || 0
            ]
        );
        const idProto = protoRes.rows[0].id_protocole;

        for (const ing of lignesRecetteSQL) {
            await clientDB.query(
                `INSERT INTO recettes_articles (id_protocole, id_article, quantite_necessaire, numero_etape, proportion)
                 VALUES ($1, $2, $3, $4, $5)`,
                [idProto, ing.id_article, ing.quantite_necessaire, ing.numero_etape || 0, ing.proportion || null]
            );
        }

        await clientDB.query('COMMIT');
        return { status: 201, message: "Protocole et étapes enregistrés avec succès !" };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

/**
 * Modifie un protocole existant (avec vérification IDOR stricte)
 */
async function modifierProtocole({ pool, s3Client }, { id_salon, id_protocole, body }) {
    const { nom_prestation, description, etapes, medias, tags, delai_livraison_jours, ingredients, temps_nettoyage_minutes } = body;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const { etapesNormalisees, lignesRecetteSQL } = await normaliserEtapesEtExtraireIngredients(etapes, ingredients, id_salon, { s3Client });
        const mediasNormalisesR2 = await normaliserGalerieMediasVersR2(medias, id_salon, { s3Client });

        const updateRes = await clientDB.query(
            `UPDATE protocoles
             SET nom_prestation = $1, description = COALESCE($9, description), etapes = $2, medias = $3, tags = $4, delai_livraison_jours = $5, temps_nettoyage_minutes = $8
             WHERE id_protocole = $6 AND id_salon = $7
             RETURNING id_protocole`,
            [
                nom_prestation,
                JSON.stringify(etapesNormalisees),
                JSON.stringify(mediasNormalisesR2),
                JSON.stringify(tags || []),
                delai_livraison_jours || 3,
                id_protocole,
                id_salon,
                temps_nettoyage_minutes || 0,
                description !== undefined ? description : null
            ]
        );

        if (updateRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            const err = new Error("Protocole introuvable ou accès refusé.");
            err.status = 404;
            throw err;
        }

        await clientDB.query(`DELETE FROM recettes_articles WHERE id_protocole = $1`, [id_protocole]);
        for (const ing of lignesRecetteSQL) {
            await clientDB.query(
                `INSERT INTO recettes_articles (id_protocole, id_article, quantite_necessaire, numero_etape, proportion)
                 VALUES ($1, $2, $3, $4, $5)`,
                [id_protocole, ing.id_article, ing.quantite_necessaire, ing.numero_etape || 0, ing.proportion || null]
            );
        }

        await clientDB.query('COMMIT');
        return { message: "Protocole modifié avec succès !" };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        throw e;
    } finally {
        clientDB.release();
    }
}

/**
 * Supprime un protocole
 */
async function supprimerProtocole({ pool }, { id_salon, role, id_protocole }) {
    if (role === 'employe') {
        const err = new Error("Suppression de protocole réservée au gérant et au poste Salon.");
        err.status = 403;
        throw err;
    }
    await pool.query("DELETE FROM protocoles WHERE id_protocole = $1 AND id_salon = $2", [id_protocole, id_salon]);
    return { message: "Protocole supprimé." };
}

/**
 * Récupère les tâches d'action du salon
 */
async function recupererTaches({ pool }, id_salon) {
    const result = await pool.query(
        `SELECT * FROM taches_actions WHERE id_salon = $1 ORDER BY statut ASC, date_echeance ASC NULLS LAST`,
        [id_salon]
    );
    return result.rows;
}

/**
 * Crée une nouvelle tâche d'action
 */
async function creerTache({ pool }, { id_salon, body }) {
    const { titre, description, date_echeance } = body;
    await pool.query(
        "INSERT INTO taches_actions (id_salon, titre, description, date_echeance, source) VALUES ($1, $2, $3, $4, 'MANUEL')",
        [id_salon, titre, description, date_echeance || null]
    );
    return { status: 201, message: "Action ajoutée !" };
}

/**
 * Bascule le statut d'une tâche (A_FAIRE <-> FAIT)
 */
async function basculerStatutTache({ pool }, { id_salon, id_tache }) {
    await pool.query(
        "UPDATE taches_actions SET statut = CASE WHEN statut = 'A_FAIRE' THEN 'FAIT' ELSE 'A_FAIRE' END WHERE id_tache = $1 AND id_salon = $2",
        [id_tache, id_salon]
    );
    return { message: "Statut mis à jour." };
}

/**
 * Supprime une tâche d'action
 */
async function supprimerTache({ pool }, { id_salon, role, id_tache }) {
    if (role !== 'gerant') {
        const err = new Error("Seul le gérant peut supprimer une tâche.");
        err.status = 403;
        throw err;
    }
    await pool.query("DELETE FROM taches_actions WHERE id_tache = $1 AND id_salon = $2", [id_tache, id_salon]);
    return { message: "Tâche supprimée." };
}

module.exports = {
    stockerImageSurR2,
    resoudreUrlImageDepuisR2,
    migrerBase64ExistantsVersR2,
    normaliserEtapesEtExtraireIngredients,
    normaliserGalerieMediasVersR2,
    recupererProtocoles,
    creerProtocole,
    modifierProtocole,
    supprimerProtocole,
    recupererTaches,
    creerTache,
    basculerStatutTache,
    supprimerTache
};
