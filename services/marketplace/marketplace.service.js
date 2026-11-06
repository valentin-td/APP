/**
 * services/marketplace/marketplace.service.js
 * Moteur de recherche Marketplace Planity-style, villes populaires et aperçu rapide des créneaux
 */

const { normaliserUrlMedia } = require('../settings/settings.service');
const { calculerCreneauxReservationPublique } = require('../agenda/agenda.service');

function extraireVilleDepuisAdresse(adresse) {
    if (!adresse) return 'France';
    const str = String(adresse).trim();
    const matchCpVille = str.match(/\b(\d{5})\s+([A-Za-zÀ-ÖØ-öø-ÿ\-\s']+)/);
    if (matchCpVille && matchCpVille[2]) {
        return matchCpVille[2].trim();
    }
    const parts = str.split(',');
    const candidate = parts[parts.length - 1].trim();
    if (/^\d+/.test(candidate) || /(rue|avenue|boulevard|chemin|place|impasse|allée|route)/i.test(candidate)) {
        return 'France';
    }
    return candidate || 'France';
}

function calculerSymbolePrix(mediane) {
    if (!mediane || mediane < 20) return '€';
    if (mediane <= 35) return '€€';
    if (mediane <= 55) return '€€€';
    return '€€€€';
}

/**
 * 1. Liste et recherche de salons actifs sur la Marketplace
 * GET /api/public/marketplace/salons?q=...&ville=...&categorie=...&page=...
 */
async function rechercherSalonsMarketplace({ pool }, { q = '', ville = '', categorie = '', page = 1 }) {
    const limit = 20;
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

    const params = [];
    let whereClauses = [
        `COALESCE(s.est_bac_a_sable, FALSE) = FALSE`,
        `s.nom_salon IS NOT NULL`,
        `TRIM(s.nom_salon) != ''`,
        `NOT EXISTS (
            SELECT 1 FROM utilisateurs u 
            WHERE u.id_salon = s.id_salon AND u.role = 'gerant' AND u.statut_abonnement = 'inactif'
        )`
    ];

    if (ville && ville.trim()) {
        params.push(`%${ville.trim()}%`);
        whereClauses.push(`(COALESCE(s.adresse_salon, '') ILIKE $${params.length} OR COALESCE(s.rcs_ville, '') ILIKE $${params.length})`);
    }

    if (q && q.trim()) {
        params.push(`%${q.trim()}%`);
        const idx = params.length;
        whereClauses.push(`(
            s.nom_salon ILIKE $${idx}
            OR COALESCE(s.adresse_salon, '') ILIKE $${idx}
            OR COALESCE(s.description_salon, '') ILIKE $${idx}
            OR EXISTS (
                SELECT 1 FROM catalogue c 
                WHERE c.id_salon = s.id_salon AND c.type_article = 'PRESTATION' AND c.nom ILIKE $${idx}
            )
        )`);
    }

    if (categorie && categorie.trim() && categorie !== 'TOUS') {
        const catLower = categorie.trim().toLowerCase();
        if (catLower.includes('barbier') || catLower.includes('homme')) {
            whereClauses.push(`(
                s.nom_salon ILIKE '%barber%' OR s.nom_salon ILIKE '%barbier%'
                OR EXISTS (SELECT 1 FROM catalogue c WHERE c.id_salon = s.id_salon AND c.type_article = 'PRESTATION' AND (c.nom ILIKE '%barbe%' OR c.nom ILIKE '%homme%' OR c.nom ILIKE '%dégradé%'))
            )`);
        } else if (catLower.includes('femme')) {
            whereClauses.push(`EXISTS (SELECT 1 FROM catalogue c WHERE c.id_salon = s.id_salon AND c.type_article = 'PRESTATION' AND (c.nom ILIKE '%femme%' OR c.nom ILIKE '%brushing%' OR c.nom ILIKE '%balayage%' OR c.nom ILIKE '%coloration%'))`);
        } else if (catLower.includes('jeune') || catLower.includes('enfant')) {
            whereClauses.push(`EXISTS (SELECT 1 FROM catalogue c WHERE c.id_salon = s.id_salon AND c.type_article = 'PRESTATION' AND (c.nom ILIKE '%enfant%' OR c.nom ILIKE '%étudiant%' OR c.nom ILIKE '%jeune%'))`);
        }
    }

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const query = `
        SELECT 
            s.id_salon,
            s.nom_salon,
            COALESCE(s.adresse_salon, '') AS adresse_salon,
            s.rcs_ville,
            s.logo_url,
            s.photos_salon,
            s.description_salon,
            s.heure_ouverture,
            s.heure_fermeture,
            COALESCE(av.note_moyenne, 0) AS note_moyenne,
            COALESCE(av.nb_avis, 0) AS nb_avis,
            COALESCE(cat.prix_min, 0) AS prix_min,
            COALESCE(cat.prix_median, 25) AS prix_median,
            COALESCE(cat.prestations_apercu, '[]'::jsonb) AS prestations_apercu
        FROM configuration_salon s
        LEFT JOIN LATERAL (
            SELECT 
                ROUND(AVG(note)::numeric, 1) AS note_moyenne,
                COUNT(*)::int AS nb_avis
            FROM avis_demandes a
            WHERE a.id_salon = s.id_salon AND a.note IS NOT NULL
        ) av ON TRUE
        LEFT JOIN LATERAL (
            SELECT 
                MIN(c.prix)::numeric(10,2) AS prix_min,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.prix) AS prix_median,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'id_article', c.id_article,
                            'nom', c.nom,
                            'prix', c.prix,
                            'duree_estimee_minutes', COALESCE(c.duree_estimee_minutes, 30)
                        ) ORDER BY c.prix ASC
                    ) FILTER (WHERE c.id_article IS NOT NULL),
                    '[]'::jsonb
                ) AS prestations_apercu
            FROM catalogue c
            WHERE c.id_salon = s.id_salon AND c.type_article = 'PRESTATION' AND c.prix > 0
        ) cat ON TRUE
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY COALESCE(av.nb_avis, 0) DESC, s.id_salon DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await pool.query(query, params);

    const salons = res.rows.map(row => {
        const rawPhotos = row.photos_salon;
        const parsedPhotos = Array.isArray(rawPhotos)
            ? rawPhotos
            : (typeof rawPhotos === 'string' ? (() => { try { return JSON.parse(rawPhotos); } catch (e) { return []; } })() : []);
        const photosPropres = parsedPhotos.map(normaliserUrlMedia).filter(Boolean);
        const logoPropre = normaliserUrlMedia(row.logo_url);
        if (photosPropres.length === 0 && logoPropre) {
            photosPropres.push(logoPropre);
        }

        return {
            id_salon: row.id_salon,
            nom_salon: row.nom_salon,
            adresse_salon: row.adresse_salon || 'Adresse disponible sur la fiche',
            ville: row.rcs_ville || extraireVilleDepuisAdresse(row.adresse_salon),
            logo_url: logoPropre,
            photos_salon: photosPropres,
            description_salon: row.description_salon || '',
            note_moyenne: Number(row.note_moyenne) > 0 ? Number(row.note_moyenne).toFixed(1).replace('.', ',') : null,
            nb_avis: parseInt(row.nb_avis, 10) || 0,
            prix_min: parseFloat(row.prix_min) || 0,
            gamme_prix: calculerSymbolePrix(parseFloat(row.prix_median)),
            prestations_apercu: Array.isArray(row.prestations_apercu) ? row.prestations_apercu.slice(0, 5) : []
        };
    });

    return { salons, page: parseInt(page, 10) || 1 };
}

/**
 * 2. Villes populaires ayant des salons actifs sur STACK
 * GET /api/public/marketplace/villes-populaires
 */
async function recupererVillesPopulaires({ pool }) {
    const res = await pool.query(`
        SELECT adresse_salon, rcs_ville, photos_salon, logo_url
        FROM configuration_salon s
        WHERE COALESCE(s.est_bac_a_sable, FALSE) = FALSE
          AND s.nom_salon IS NOT NULL
          AND TRIM(s.nom_salon) != ''
    `);

    const compteurVilles = new Map();

    res.rows.forEach(r => {
        const villeBrute = (r.rcs_ville || extraireVilleDepuisAdresse(r.adresse_salon) || '').trim();
        if (!villeBrute || villeBrute.toLowerCase() === 'france') return;
        const cle = villeBrute.charAt(0).toUpperCase() + villeBrute.slice(1).toLowerCase();

        const rawPhotos = r.photos_salon;
        const parsedPhotos = Array.isArray(rawPhotos)
            ? rawPhotos
            : (typeof rawPhotos === 'string' ? (() => { try { return JSON.parse(rawPhotos); } catch (e) { return []; } })() : []);
        const firstPhoto = parsedPhotos.map(normaliserUrlMedia).filter(Boolean)[0] || normaliserUrlMedia(r.logo_url) || null;

        if (!compteurVilles.has(cle)) {
            compteurVilles.set(cle, { ville: cle, nb_salons: 0, photo_url: firstPhoto });
        }
        const item = compteurVilles.get(cle);
        item.nb_salons += 1;
        if (!item.photo_url && firstPhoto) item.photo_url = firstPhoto;
    });

    // Villes vitrines par défaut complétées par les vraies villes de la BDD
    const villesDefaut = [
        { ville: 'Paris', nb_salons: 12, photo_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80' },
        { ville: 'Lyon', nb_salons: 8, photo_url: 'https://images.unsplash.com/photo-1524396309943-e03f5249f002?auto=format&fit=crop&w=800&q=80' },
        { ville: 'Marseille', nb_salons: 9, photo_url: 'https://images.unsplash.com/photo-1565018054866-968e244671af?auto=format&fit=crop&w=800&q=80' },
        { ville: 'Strasbourg', nb_salons: 7, photo_url: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=800&q=80' },
        { ville: 'Bordeaux', nb_salons: 6, photo_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80' },
        { ville: 'Toulouse', nb_salons: 5, photo_url: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?auto=format&fit=crop&w=800&q=80' }
    ];

    villesDefaut.forEach(vd => {
        if (!compteurVilles.has(vd.ville)) {
            compteurVilles.set(vd.ville, vd);
        } else {
            const exist = compteurVilles.get(vd.ville);
            if (!exist.photo_url) exist.photo_url = vd.photo_url;
        }
    });

    return Array.from(compteurVilles.values())
        .sort((a, b) => b.nb_salons - a.nb_salons)
        .slice(0, 8);
}

/**
 * 3. Aperçu rapide des créneaux sur 3 jours (Matin / Après-midi) + Prochaine disponibilité
 * GET /api/public/marketplace/salon/:id_salon/creneaux-apercu
 */
async function recupererApercuCreneauxSalon({ pool }, { id_salon, startDate }) {
    const baseDate = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
    const jours = [];

    for (let i = 0; i < 3; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 10);
        const jourLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' }).replace('.', '');
        const numJour = String(d.getDate()).padStart(2, '0');

        const { creneaux = [] } = await calculerCreneauxReservationPublique(
            { pool },
            { id_salon, date: dateStr, id_employe: 'AUTO', duree: 30 }
        ).catch(() => ({ creneaux: [] }));

        const matin = [];
        const apres_midi = [];

        creneaux.forEach(c => {
            const h = parseInt(String(c.heure).split(':')[0], 10) || 0;
            if (h < 12) matin.push(c.heure);
            else apres_midi.push(c.heure);
        });

        jours.push({
            date: dateStr,
            label_jour: `${jourLabel.charAt(0).toUpperCase() + jourLabel.slice(1)}.`,
            numero_jour: numJour,
            matin: matin.slice(0, 3),
            apres_midi: apres_midi.slice(0, 3),
            total_dispos: creneaux.length
        });
    }

    const aucunSur3Jours = jours.every(j => j.total_dispos === 0);
    let prochaine_disponibilite = null;

    if (aucunSur3Jours) {
        for (let i = 3; i <= 14; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toLocaleString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 10);
            const { creneaux = [] } = await calculerCreneauxReservationPublique(
                { pool },
                { id_salon, date: dateStr, id_employe: 'AUTO', duree: 30 }
            ).catch(() => ({ creneaux: [] }));

            if (creneaux.length > 0) {
                prochaine_disponibilite = {
                    date: dateStr,
                    label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }),
                    premier_creneau: creneaux[0].heure
                };
                break;
            }
        }
    }

    return {
        id_salon: parseInt(id_salon, 10),
        jours,
        prochaine_disponibilite
    };
}

module.exports = {
    rechercherSalonsMarketplace,
    recupererVillesPopulaires,
    recupererApercuCreneauxSalon
};
