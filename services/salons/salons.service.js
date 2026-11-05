// =========================================================================
// SERVICE MULTI-SALONS & PORTABILITÉ RGPD (STACK SaaS)
// =========================================================================

/**
 * Initialise la table de liaison Multi-Salons et rattache automatiquement le salon courant
 */
async function assurerTableMultiSalons(clientOrPool, emailGerant, idSalonActuel) {
    await clientOrPool.query(`
        CREATE TABLE IF NOT EXISTS gerants_multi_salons (
            id_liaison SERIAL PRIMARY KEY,
            email_gerant VARCHAR(255) NOT NULL,
            id_salon INT NOT NULL,
            role_groupe VARCHAR(50) DEFAULT 'PROPRIETAIRE',
            date_ajout TIMESTAMP DEFAULT NOW(),
            UNIQUE(email_gerant, id_salon)
        );
    `);

    if (emailGerant && idSalonActuel) {
        await clientOrPool.query(
            `INSERT INTO gerants_multi_salons (email_gerant, id_salon, role_groupe)
             VALUES (LOWER(TRIM($1)), $2, 'PROPRIETAIRE')
             ON CONFLICT (email_gerant, id_salon) DO NOTHING`,
            [emailGerant, idSalonActuel]
        );
    }
}

/**
 * Récupère l'email du gérant connecté (depuis le JWT ou la base de données)
 */
async function resoudreEmailGerant(clientOrPool, reqUser) {
    if (reqUser?.email) return String(reqUser.email).toLowerCase().trim();
    try {
        const r = await clientOrPool.query(
            `SELECT email FROM configuration_salon WHERE id_salon = $1 LIMIT 1`,
            [reqUser.id_salon]
        );
        if (r.rows[0]?.email) return String(r.rows[0].email).toLowerCase().trim();
    } catch (e) {}
    try {
        const r2 = await clientOrPool.query(
            `SELECT email FROM salons WHERE id_salon = $1 LIMIT 1`,
            [reqUser.id_salon]
        );
        if (r2.rows[0]?.email) return String(r2.rows[0].email).toLowerCase().trim();
    } catch (e) {}
    return `gerant_salon_${reqUser.id_salon}@stack.local`;
}

/**
 * 1. Lister tous les salons du gérant + vue consolidée du groupe
 */
async function listerMesSalons({ pool }, { user }) {
    if (user.role !== 'gerant') {
        throw { status: 403, message: "Accès réservé au gérant." };
    }

    const emailGerant = await resoudreEmailGerant(pool, user);
    await assurerTableMultiSalons(pool, emailGerant, user.id_salon);

    // Rattache aussi automatiquement tout autre salon qui possède déjà le même email de gérant
    await pool.query(`
        INSERT INTO gerants_multi_salons (email_gerant, id_salon, role_groupe)
        SELECT LOWER(TRIM(email)), id_salon, 'PROPRIETAIRE'
        FROM configuration_salon
        WHERE LOWER(TRIM(email)) = $1
        ON CONFLICT (email_gerant, id_salon) DO NOTHING
    `, [emailGerant]).catch(() => {});

    const salonsRes = await pool.query(`
        SELECT 
            c.id_salon,
            COALESCE(c.nom_salon, 'Salon #' || c.id_salon) as nom_salon,
            c.adresse_salon,
            c.siret,
            c.forme_juridique,
            COALESCE(c.plan_actuel, 'PREMIUM_TRIAL') as plan_actuel,
            COALESCE(c.statut_abonnement, 'actif') as statut_abonnement,
            (
                SELECT COALESCE(SUM(t.total_ttc), 0)
                FROM tickets t
                WHERE t.id_salon = c.id_salon
                  AND t.statut = 'VALIDE'
                  AND DATE_TRUNC('month', t.date_creation) = DATE_TRUNC('month', CURRENT_DATE)
            ) as ca_mois_ttc,
            (
                SELECT COALESCE(SUM(t.total_ttc), 0)
                FROM tickets t
                WHERE t.id_salon = c.id_salon
                  AND t.statut = 'VALIDE'
                  AND DATE(t.date_creation) = CURRENT_DATE
            ) as ca_jour_ttc,
            EXISTS (
                SELECT 1 FROM clotures_caisse z
                WHERE z.id_salon = c.id_salon AND DATE(z.date_cloture) = CURRENT_DATE
            ) as z_fait_aujourdhui,
            (
                SELECT COUNT(*)::int FROM employes e WHERE e.id_salon = c.id_salon
            ) as nb_employes
        FROM gerants_multi_salons gms
        JOIN configuration_salon c ON c.id_salon = gms.id_salon
        WHERE gms.email_gerant = $1
        ORDER BY c.id_salon ASC
    `, [emailGerant]);

    const listeSalons = salonsRes.rows.map(s => ({
        ...s,
        ca_mois_ttc: parseFloat(s.ca_mois_ttc) || 0,
        ca_jour_ttc: parseFloat(s.ca_jour_ttc) || 0,
        est_salon_actif: Number(s.id_salon) === Number(user.id_salon)
    }));

    const syntheseGroupe = {
        nb_salons: listeSalons.length,
        ca_groupe_mois_ttc: Number(listeSalons.reduce((acc, s) => acc + s.ca_mois_ttc, 0).toFixed(2)),
        ca_groupe_jour_ttc: Number(listeSalons.reduce((acc, s) => acc + s.ca_jour_ttc, 0).toFixed(2)),
        total_employes_groupe: listeSalons.reduce((acc, s) => acc + (parseInt(s.nb_employes, 10) || 0), 0),
        nb_z_manquants_aujourdhui: listeSalons.filter(s => !s.z_fait_aujourdhui).length
    };

    return {
        id_salon_courant: user.id_salon,
        email_gerant: emailGerant,
        synthese_groupe: syntheseGroupe,
        salons: listeSalons
    };
}

/**
 * 2. Créer un nouvel établissement sous le même compte gérant (avec clonage optionnel catalogue/protocoles)
 */
async function creerSalonGroupe({ pool, enregistrerJET }, { user, body }) {
    if (user.role !== 'gerant') {
        throw { status: 403, message: "Seul le gérant peut ouvrir un nouvel établissement." };
    }

    const {
        nom_salon,
        adresse_salon,
        siret,
        forme_juridique,
        tva_intra,
        copier_catalogue = true,
        copier_protocoles = true
    } = body;

    if (!nom_salon || !nom_salon.trim()) {
        throw { status: 400, message: "Le nom du nouvel établissement est obligatoire." };
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        const emailGerant = await resoudreEmailGerant(clientDB, user);
        await assurerTableMultiSalons(clientDB, emailGerant, user.id_salon);

        // 1. Lecture du salon source pour copier les identifiants du gérant (mot_de_passe, statut légal, etc.)
        const sourceSalonRes = await clientDB.query(
            `SELECT * FROM configuration_salon WHERE id_salon = $1 LIMIT 1`,
            [user.id_salon]
        );
        if (sourceSalonRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            throw { status: 404, message: "Salon principal introuvable." };
        }
        const src = sourceSalonRes.rows[0];

        // 2. Création du nouveau salon dans configuration_salon
        const newSalonRes = await clientDB.query(`
            INSERT INTO configuration_salon (
                nom_salon, email, mot_de_passe, forme_juridique, siret, adresse_salon, tva_intra,
                heure_ouverture, heure_fermeture, mode_suivi_heures, plan_actuel, date_fin_essai, statut_abonnement
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, 'PREMIUM_TRIAL', NOW() + INTERVAL '30 days', 'actif'
            ) RETURNING id_salon
        `, [
            nom_salon.trim(),
            src.email || emailGerant,
            src.mot_de_passe || null,
            forme_juridique || src.forme_juridique || '',
            siret ? siret.trim() : '',
            adresse_salon ? adresse_salon.trim() : '',
            tva_intra !== undefined ? tva_intra : (src.tva_intra || ''),
            src.heure_ouverture || 8,
            src.heure_fermeture || 20,
            src.mode_suivi_heures || 'POINTEUSE'
        ]);

        const newIdSalon = newSalonRes.rows[0].id_salon;

        // 3. Liaison au groupe Multi-Salons du gérant
        await clientDB.query(
            `INSERT INTO gerants_multi_salons (email_gerant, id_salon, role_groupe)
             VALUES ($1, $2, 'PROPRIETAIRE')
             ON CONFLICT (email_gerant, id_salon) DO NOTHING`,
            [emailGerant, newIdSalon]
        );

        // 4. Duplication du profil Employé-Gérant (avec son code PIN hashé) dans le nouveau salon
        const gerantEmpRes = await clientDB.query(
            `SELECT nom, role, code_pin, photo_url FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1`,
            [user.id_salon]
        );
        const gerantEmp = gerantEmpRes.rows[0] || { nom: 'Gérant', role: 'Gérant', code_pin: '0000', photo_url: null };

        await clientDB.query(
            `INSERT INTO employes (id_salon, nom, role, code_pin, photo_url, est_gerant, type_contrat, heures_mensuelles_base)
             VALUES ($1, $2, $3, $4, $5, TRUE, '35H', 151.67)`,
            [newIdSalon, gerantEmp.nom, gerantEmp.role || 'Gérant', gerantEmp.code_pin, gerantEmp.photo_url]
        );

        // 5. Duplication optionnelle du Catalogue
        const mapAncienVersNouvelArticle = new Map();
        if (copier_catalogue) {
            const catSourceRes = await clientDB.query(
                `SELECT id_article, nom, type_article, prix, taux_tva, reference, delai_livraison_jours, duree_estimee_minutes
                 FROM catalogue WHERE id_salon = $1`,
                [user.id_salon]
            );
            for (const art of catSourceRes.rows) {
                const insArt = await clientDB.query(
                    `INSERT INTO catalogue (id_salon, nom, type_article, prix, taux_tva, stock_actuel, reference, delai_livraison_jours, duree_estimee_minutes)
                     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8) RETURNING id_article`,
                    [
                        newIdSalon,
                        art.nom,
                        art.type_article,
                        art.prix,
                        art.taux_tva ?? 20,
                        art.reference || null,
                        art.delai_livraison_jours || 3,
                        art.duree_estimee_minutes || 30
                    ]
                );
                mapAncienVersNouvelArticle.set(Number(art.id_article), insArt.rows[0].id_article);
            }
        }

        // 6. Duplication optionnelle des Protocoles & Tutoriels de l'Académie
        if (copier_catalogue && copier_protocoles) {
            const protoSourceRes = await clientDB.query(
                `SELECT * FROM protocoles WHERE id_salon = $1`,
                [user.id_salon]
            );
            for (const pr of protoSourceRes.rows) {
                const etapesRemappees = Array.isArray(pr.etapes)
                    ? pr.etapes.map(et => {
                        if (!et || typeof et !== 'object') return et;
                        const ings = Array.isArray(et.ingredients)
                            ? et.ingredients.map(ing => ({
                                ...ing,
                                id_article: mapAncienVersNouvelArticle.get(Number(ing.id_article)) || ing.id_article
                            }))
                            : [];
                        return { ...et, ingredients: ings };
                    })
                    : [];

                const insPr = await clientDB.query(
                    `INSERT INTO protocoles (id_salon, nom_prestation, description, etapes, medias, tags, delai_livraison_jours, temps_nettoyage_minutes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_protocole`,
                    [
                        newIdSalon,
                        pr.nom_prestation,
                        pr.description,
                        JSON.stringify(etapesRemappees),
                        JSON.stringify(pr.medias || {}),
                        JSON.stringify(pr.tags || []),
                        pr.delai_livraison_jours || 3,
                        pr.temps_nettoyage_minutes || 0
                    ]
                );

                const newIdProto = insPr.rows[0].id_protocole;
                const recSource = await clientDB.query(
                    `SELECT id_article, quantite_necessaire, numero_etape, proportion FROM recettes_articles WHERE id_protocole = $1`,
                    [pr.id_protocole]
                );
                for (const r of recSource.rows) {
                    const newArtId = mapAncienVersNouvelArticle.get(Number(r.id_article));
                    if (newArtId) {
                        await clientDB.query(
                            `INSERT INTO recettes_articles (id_protocole, id_article, quantite_necessaire, numero_etape, proportion)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [newIdProto, newArtId, r.quantite_necessaire, r.numero_etape || 0, r.proportion || null]
                        );
                    }
                }
            }
        }

        // 7. Scellement Genesis NF525 du nouvel établissement
        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(newIdSalon, 'CREATION_ETABLISSEMENT_GROUPE', {
                cree_depuis_salon: user.id_salon,
                nom_salon: nom_salon.trim(),
                email_gerant: emailGerant
            }, clientDB);
        }

        await clientDB.query('COMMIT');
        return {
            status: 201,
            message: `Établissement "${nom_salon.trim()}" créé avec succès !`,
            id_salon: newIdSalon
        };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur création multi-salon :", e);
        if (e.status) throw e;
        throw { status: 500, message: e.message || "Erreur lors de la création du nouvel établissement." };
    } finally {
        clientDB.release();
    }
}

/**
 * 3. Basculer instantanément d'un salon à un autre (switch JWT sans reconnexion)
 */
async function switchSalonGroupe({ pool, jwt, enregistrerJET }, { user, id_salon_cible }) {
    if (user.role !== 'gerant') {
        throw { status: 403, message: "Seul le gérant peut changer d'établissement." };
    }

    const idSalonCible = parseInt(id_salon_cible, 10);
    if (!idSalonCible) {
        throw { status: 400, message: "Identifiant de salon invalide." };
    }

    const emailGerant = await resoudreEmailGerant(pool, user);
    await assurerTableMultiSalons(pool, emailGerant, user.id_salon);

    // Vérification stricte d'appartenance (Empêche tout accès IDOR à un salon tiers)
    const accesRes = await pool.query(
        `SELECT 1 FROM gerants_multi_salons WHERE email_gerant = $1 AND id_salon = $2 LIMIT 1`,
        [emailGerant, idSalonCible]
    );
    if (accesRes.rowCount === 0) {
        throw { status: 403, message: "Accès refusé : cet établissement n'est pas rattaché à votre compte gérant." };
    }

    const empGerantCible = await pool.query(
        `SELECT id_employe, nom FROM employes WHERE id_salon = $1 AND est_gerant = TRUE LIMIT 1`,
        [idSalonCible]
    );
    const idEmployeGerant = empGerantCible.rows[0]?.id_employe || null;

    const payloadJwt = {
        id_salon: idSalonCible,
        email: emailGerant,
        role: 'gerant',
        id_employe: idEmployeGerant
    };

    const jwtSecret = process.env.JWT_SECRET || 'secret_temporaire_stack';
    const newTokenApi = jwt.sign(payloadJwt, jwtSecret, { expiresIn: '7d' });
    const newUiToken = jwt.sign(payloadJwt, jwtSecret, { expiresIn: '7d' });

    if (typeof enregistrerJET === 'function') {
        await enregistrerJET(idSalonCible, 'CONNEXION_SWITCH_MULTI_SALON', {
            depuis_salon: user.id_salon,
            email_gerant: emailGerant
        });
    }

    return {
        id_salon: idSalonCible,
        ui_token: newUiToken,
        token_api: newTokenApi,
        message: "Bascule vers l'établissement réussie."
    };
}

/**
 * 4. Synchroniser le catalogue & tutoriels vers les autres salons du groupe
 */
async function synchroniserCatalogueGroupe({ pool }, { user }) {
    if (user.role !== 'gerant') {
        throw { status: 403, message: "Seul le gérant peut synchroniser le catalogue du groupe." };
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');
        const emailGerant = await resoudreEmailGerant(clientDB, user);
        await assurerTableMultiSalons(clientDB, emailGerant, user.id_salon);

        const ciblesRes = await clientDB.query(
            `SELECT id_salon FROM gerants_multi_salons WHERE email_gerant = $1 AND id_salon != $2`,
            [emailGerant, user.id_salon]
        );
        if (ciblesRes.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            throw { status: 400, message: "Aucune autre succursale à synchroniser." };
        }

        const catSource = await clientDB.query(
            `SELECT * FROM catalogue WHERE id_salon = $1`,
            [user.id_salon]
        );
        const protoSource = await clientDB.query(
            `SELECT * FROM protocoles WHERE id_salon = $1`,
            [user.id_salon]
        );

        let nbArticlesSync = 0;
        let nbProtosSync = 0;

        for (const rowCible of ciblesRes.rows) {
            const idCible = rowCible.id_salon;
            const mapSourceVersCible = new Map();

            // 1. Synchronisation des articles du catalogue
            for (const art of catSource.rows) {
                const existArt = await clientDB.query(
                    `SELECT id_article FROM catalogue
                     WHERE id_salon = $1 AND LOWER(TRIM(nom)) = LOWER(TRIM($2)) AND type_article = $3
                     LIMIT 1`,
                    [idCible, art.nom, art.type_article]
                );

                if (existArt.rowCount > 0) {
                    const idArtCible = existArt.rows[0].id_article;
                    await clientDB.query(
                        `UPDATE catalogue
                         SET prix = $1, duree_estimee_minutes = $2, delai_livraison_jours = $3, reference = COALESCE($4, reference)
                         WHERE id_article = $5`,
                        [art.prix, art.duree_estimee_minutes || 30, art.delai_livraison_jours || 3, art.reference || null, idArtCible]
                    );
                    mapSourceVersCible.set(Number(art.id_article), idArtCible);
                } else {
                    const ins = await clientDB.query(
                        `INSERT INTO catalogue (id_salon, nom, type_article, prix, taux_tva, stock_actuel, reference, delai_livraison_jours, duree_estimee_minutes)
                         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8) RETURNING id_article`,
                        [idCible, art.nom, art.type_article, art.prix, art.taux_tva ?? 20, art.reference || null, art.delai_livraison_jours || 3, art.duree_estimee_minutes || 30]
                    );
                    mapSourceVersCible.set(Number(art.id_article), ins.rows[0].id_article);
                    nbArticlesSync++;
                }
            }

            // 2. Synchronisation des protocoles de l'Académie
            for (const pr of protoSource.rows) {
                const existPr = await clientDB.query(
                    `SELECT id_protocole FROM protocoles
                     WHERE id_salon = $1 AND LOWER(TRIM(nom_prestation)) = LOWER(TRIM($2))
                     LIMIT 1`,
                    [idCible, pr.nom_prestation]
                );

                const etapesRemappees = Array.isArray(pr.etapes)
                    ? pr.etapes.map(et => {
                        if (!et || typeof et !== 'object') return et;
                        const ings = Array.isArray(et.ingredients)
                            ? et.ingredients.map(ing => ({
                                ...ing,
                                id_article: mapSourceVersCible.get(Number(ing.id_article)) || ing.id_article
                            }))
                            : [];
                        return { ...et, ingredients: ings };
                    })
                    : [];

                if (existPr.rowCount === 0) {
                    await clientDB.query(
                        `INSERT INTO protocoles (id_salon, nom_prestation, description, etapes, medias, tags, delai_livraison_jours, temps_nettoyage_minutes)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            idCible,
                            pr.nom_prestation,
                            pr.description,
                            JSON.stringify(etapesRemappees),
                            JSON.stringify(pr.medias || {}),
                            JSON.stringify(pr.tags || []),
                            pr.delai_livraison_jours || 3,
                            pr.temps_nettoyage_minutes || 0
                        ]
                    );
                    nbProtosSync++;
                }
            }
        }

        await clientDB.query('COMMIT');
        return {
            message: `Catalogue et Académie synchronisés vers ${ciblesRes.rowCount} succursale(s) (${nbArticlesSync} nouvel(s) article(s), ${nbProtosSync} nouvelle(s) recette(s)).`
        };
    } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("Erreur synchro catalogue groupe :", e);
        if (e.status) throw e;
        throw { status: 500, message: "Erreur lors de la synchronisation du catalogue." };
    } finally {
        clientDB.release();
    }
}

/**
 * 5. Export & Portabilité des Données (RGPD Art. 20 / NF525)
 */
async function exporterPortabiliteDonnees({ pool, enregistrerJET, crypto }, { user, query }) {
    const id_salon = user.id_salon;
    const format = (query.format || 'json_complet').toLowerCase();

    if (user.role !== 'gerant') {
        throw { status: 403, message: "Accès refusé : seul le gérant peut exporter les données du salon." };
    }

    const safeQuery = async (sql, params = []) => {
        try {
            const r = await pool.query(sql, params);
            return r.rows || [];
        } catch (e) {
            return [];
        }
    };

    const escapeCsvCell = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/\r?\n|\r/g, ' ').trim();
        if (str.includes(';') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const buildCsvBuffer = (headers, rows) => {
        const lines = [
            headers.map(escapeCsvCell).join(';'),
            ...rows.map(row => row.map(escapeCsvCell).join(';'))
        ];
        return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf-8');
    };

    const dateJour = new Date().toISOString().slice(0, 10);
    const salonRows = await safeQuery(
        `SELECT id_salon, nom_salon, forme_juridique, siret, adresse_salon, tva_intra, capital_social, rcs_ville, email_comptable, plan_actuel
         FROM configuration_salon WHERE id_salon = $1`,
        [id_salon]
    );
    const salonInfo = salonRows[0] || { id_salon, nom_salon: `Salon_${id_salon}` };
    const slugSalon = (salonInfo.nom_salon || `Salon_${id_salon}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. CSV CLIENTS
    if (format === 'csv_clients') {
        const clients = await safeQuery(
            `SELECT id_client, prenom, nom, telephone, email, date_naissance, points_fidelite, tampons_fidelite, remise_winback, notes, date_creation
             FROM clients WHERE id_salon = $1 ORDER BY nom ASC, prenom ASC`,
            [id_salon]
        );

        const csvBuf = buildCsvBuffer(
            ['ID Client', 'Prénom', 'Nom', 'Téléphone', 'E-mail', 'Date de naissance', 'Points Fidélité', 'Tampons Fidélité', 'Offre Winback', 'Notes & Formules Techniques', 'Date Création'],
            clients.map(c => [
                c.id_client,
                c.prenom || '',
                c.nom || '',
                c.telephone || '',
                c.email || '',
                c.date_naissance ? new Date(c.date_naissance).toLocaleDateString('fr-FR') : '',
                c.points_fidelite || 0,
                c.tampons_fidelite || 0,
                c.remise_winback || '',
                c.notes || '',
                c.date_creation ? new Date(c.date_creation).toLocaleDateString('fr-FR') : ''
            ])
        );

        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(id_salon, 'EXPORT_PORTABILITE_CLIENTS_CSV', { nb_clients: clients.length });
        }

        return {
            type: 'csv',
            contentType: 'text/csv; charset=utf-8',
            filename: `Clients_${slugSalon}_${dateJour}.csv`,
            buffer: csvBuf
        };
    }

    // 2. CSV CATALOGUE & STOCKS
    if (format === 'csv_catalogue') {
        const articles = await safeQuery(
            `SELECT id_article, type_article, reference, nom, prix, taux_tva, stock_actuel, duree_estimee_minutes, delai_livraison_jours
             FROM catalogue WHERE id_salon = $1 ORDER BY type_article ASC, nom ASC`,
            [id_salon]
        );

        const csvBuf = buildCsvBuffer(
            ['ID Article', 'Catégorie', 'Référence', 'Désignation', 'Prix TTC (€)', 'Taux TVA (%)', 'Stock Actuel', 'Durée Prestation (min)', 'Délai Livraison (j)'],
            articles.map(a => [
                a.id_article,
                a.type_article || 'PRESTATION',
                a.reference || '',
                a.nom || '',
                parseFloat(a.prix || 0).toFixed(2).replace('.', ','),
                a.taux_tva !== undefined && a.taux_tva !== null ? a.taux_tva : 20,
                a.type_article === 'PRESTATION' ? 'N/A' : (a.stock_actuel ?? 0),
                a.type_article === 'PRESTATION' ? (a.duree_estimee_minutes || 30) : 'N/A',
                a.delai_livraison_jours || 3
            ])
        );

        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(id_salon, 'EXPORT_PORTABILITE_CATALOGUE_CSV', { nb_articles: articles.length });
        }

        return {
            type: 'csv',
            contentType: 'text/csv; charset=utf-8',
            filename: `Catalogue_Stocks_${slugSalon}_${dateJour}.csv`,
            buffer: csvBuf
        };
    }

    // 3. CSV RDV AGENDA
    if (format === 'csv_rdv') {
        const rdvs = await safeQuery(
            `SELECT r.id_rdv, r.date_heure_debut, r.duree_minutes, r.nom_client, r.telephone_client, r.prestation, COALESCE(e.nom, 'Non assigné') as nom_employe
             FROM rdv r
             LEFT JOIN employes e ON r.id_employe = e.id_employe
             WHERE r.id_salon = $1
             ORDER BY r.date_heure_debut DESC`,
            [id_salon]
        );

        const csvBuf = buildCsvBuffer(
            ['ID RDV', 'Date', 'Heure', 'Durée (min)', 'Client', 'Téléphone Client', 'Prestation', 'Collaborateur'],
            rdvs.map(r => {
                const dt = r.date_heure_debut ? new Date(r.date_heure_debut) : null;
                return [
                    r.id_rdv,
                    dt && !isNaN(dt) ? dt.toLocaleDateString('fr-FR') : '',
                    dt && !isNaN(dt) ? dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
                    r.duree_minutes || 30,
                    r.nom_client || '',
                    r.telephone_client || '',
                    r.prestation || '',
                    r.nom_employe || ''
                ];
            })
        );

        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(id_salon, 'EXPORT_PORTABILITE_RDV_CSV', { nb_rdv: rdvs.length });
        }

        return {
            type: 'csv',
            contentType: 'text/csv; charset=utf-8',
            filename: `Agenda_RDV_${slugSalon}_${dateJour}.csv`,
            buffer: csvBuf
        };
    }

    // 4. CSV TICKETS & CLÔTURES Z (NF525)
    if (format === 'csv_caisse_z') {
        const tickets = await safeQuery(
            `SELECT t.id_ticket, t.numero_ticket_caisse, t.date_creation, t.type_ticket, t.statut, t.methode_paiement,
                    t.total_ttc, COALESCE(t.montant_pourboire, 0) as pourboire, t.signature_hash, t.hash_precedent,
                    COALESCE(e.nom, 'Non spécifié') as vendeur
             FROM tickets t
             LEFT JOIN employes e ON t.id_employe = e.id_employe
             WHERE t.id_salon = $1
             ORDER BY t.date_creation ASC, t.id_ticket ASC`,
            [id_salon]
        );

        const csvBuf = buildCsvBuffer(
            ['ID Interne', 'N° Ticket Séq.', 'Date & Heure', 'Type', 'Statut', 'Mode Paiement', 'Vendeur', 'Total TTC (€)', 'Pourboire (€)', 'Hash SHA-256 (NF525)', 'Hash Précédent'],
            tickets.map(t => [
                t.id_ticket,
                t.numero_ticket_caisse || '',
                t.date_creation ? new Date(t.date_creation).toLocaleString('fr-FR') : '',
                t.type_ticket || 'VENTE',
                t.statut || 'VALIDE',
                t.methode_paiement || '',
                t.vendeur || '',
                parseFloat(t.total_ttc || 0).toFixed(2).replace('.', ','),
                parseFloat(t.pourboire || 0).toFixed(2).replace('.', ','),
                t.signature_hash || '',
                t.hash_precedent || ''
            ])
        );

        if (typeof enregistrerJET === 'function') {
            await enregistrerJET(id_salon, 'EXPORT_PORTABILITE_TICKETS_NF525_CSV', { nb_tickets: tickets.length });
        }

        return {
            type: 'csv',
            contentType: 'text/csv; charset=utf-8',
            filename: `Archive_Tickets_NF525_${slugSalon}_${dateJour}.csv`,
            buffer: csvBuf
        };
    }

    // 5. EXPORT COMPLET DE PORTABILITÉ (JSON SCELLÉ SHA-256)
    const [
        clients,
        employes,
        catalogue,
        protocoles,
        rdvs,
        facturesFournisseurs,
        tickets,
        lignesTickets,
        cloturesZ,
        mouvementsCaisse,
        liassesValidees
    ] = await Promise.all([
        safeQuery(`SELECT * FROM clients WHERE id_salon = $1 ORDER BY id_client ASC`, [id_salon]),
        safeQuery(`SELECT id_employe, nom, role, est_gerant, type_contrat, heures_mensuelles_base, taux_commission_prestation, taux_commission_produit FROM employes WHERE id_salon = $1 ORDER BY id_employe ASC`, [id_salon]),
        safeQuery(`SELECT * FROM catalogue WHERE id_salon = $1 ORDER BY id_article ASC`, [id_salon]),
        safeQuery(`SELECT id_protocole, nom_prestation, description, tags, temps_nettoyage_minutes, etapes FROM protocoles WHERE id_salon = $1 ORDER BY id_protocole ASC`, [id_salon]),
        safeQuery(`SELECT * FROM rdv WHERE id_salon = $1 ORDER BY date_heure_debut DESC`, [id_salon]),
        safeQuery(`SELECT id_facture, nom_fournisseur, numero_facture, date_facture, mode_paiement, compte_comptable, montant_ht, montant_tva, montant_ttc, statut_verification FROM factures_fournisseurs WHERE id_salon = $1 ORDER BY id_facture ASC`, [id_salon]),
        safeQuery(`SELECT * FROM tickets WHERE id_salon = $1 ORDER BY id_ticket ASC`, [id_salon]),
        safeQuery(`SELECT lt.* FROM lignes_ticket lt JOIN tickets t ON t.id_ticket = lt.id_ticket WHERE t.id_salon = $1 ORDER BY lt.id_ticket ASC`, [id_salon]),
        safeQuery(`SELECT * FROM clotures_caisse WHERE id_salon = $1 ORDER BY date_cloture ASC`, [id_salon]),
        safeQuery(`SELECT * FROM mouvements_caisse WHERE id_salon = $1 ORDER BY date_creation ASC`, [id_salon]),
        safeQuery(`SELECT id_validation, mois_annee, date_validation, valide_par, total_ht, total_tva, total_ttc, cumul_perpetuel_ttc, hash_precedent, signature_hash FROM liasses_mensuelles_validees WHERE id_salon = $1 ORDER BY mois_annee ASC`, [id_salon])
    ]);

    const archivePayload = {
        meta: {
            logiciel: 'STACK SaaS v1.0',
            type_export: 'ARCHIVE_INTEGRALE_PORTABILITE_RGPD_ET_NF525',
            date_generation_iso: new Date().toISOString(),
            id_salon,
            nom_salon: salonInfo.nom_salon,
            siret: salonInfo.siret || 'Non renseigné'
        },
        etablissement: salonInfo,
        statistiques_export: {
            nb_clients: clients.length,
            nb_collaborateurs: employes.length,
            nb_articles_catalogue: catalogue.length,
            nb_protocoles_academie: protocoles.length,
            nb_rendez_vous: rdvs.length,
            nb_factures_fournisseurs: facturesFournisseurs.length,
            nb_tickets_caisse: tickets.length,
            nb_clotures_z: cloturesZ.length,
            nb_liasses_mensuelles: liassesValidees.length
        },
        donnees: {
            clients,
            collaborateurs: employes,
            catalogue_et_stocks: catalogue,
            protocoles_academie: protocoles,
            agenda_rendez_vous: rdvs,
            achats_factures_fournisseurs: facturesFournisseurs,
            caisse_tickets: tickets,
            caisse_lignes_tickets: lignesTickets,
            caisse_clotures_z: cloturesZ,
            caisse_mouvements_especes: mouvementsCaisse,
            comptabilite_liasses_scellees: liassesValidees
        }
    };

    const hashFn = crypto || require('crypto');
    const empreinteArchive = hashFn
        .createHash('sha256')
        .update(JSON.stringify(archivePayload))
        .digest('hex');

    const archiveFinale = {
        ...archivePayload,
        scellement_cryptographique_nf525: {
            algorithme: 'SHA-256',
            empreinte_sha256: empreinteArchive
        }
    };

    if (typeof enregistrerJET === 'function') {
        await enregistrerJET(id_salon, 'EXPORT_PORTABILITE_INTEGRALE_JSON', {
            empreinte_sha256: empreinteArchive,
            nb_clients: clients.length,
            nb_tickets: tickets.length
        });
    }

    return {
        type: 'json',
        contentType: 'application/json; charset=utf-8',
        filename: `Archive_Portabilite_STACK_${slugSalon}_${dateJour}.json`,
        content: JSON.stringify(archiveFinale, null, 2)
    };
}

module.exports = {
    assurerTableMultiSalons,
    resoudreEmailGerant,
    listerMesSalons,
    creerSalonGroupe,
    switchSalonGroupe,
    synchroniserCatalogueGroupe,
    exporterPortabiliteDonnees
};
