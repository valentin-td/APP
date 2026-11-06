/**
 * services/agenda/agenda.service.js
 * Gestion de l'agenda salon, des créneaux, réservations publiques en ligne et flux iCal
 */

/**
 * Création d'un rendez-vous interne avec détection de collision et d'absence
 */
async function creerRdv({ pool, io }, { id_salon, body }) {
    const { nom_client, telephone_client, id_employe, prestation, date_heure_debut, duree_minutes, forcer_ajout } = body;

    if (id_employe) {
        const dateRDV = String(date_heure_debut).split('T')[0];
        const absence = await pool.query(
            `SELECT type_demande FROM absences_employes 
             WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND $3 BETWEEN date_debut AND date_fin`,
            [id_salon, id_employe, dateRDV]
        );
        if (absence.rowCount > 0) {
            const err = new Error("Impossible d'ajouter ce rdv car le collaborateur n'est pas disponible sur cette date.");
            err.status = 400;
            throw err;
        }
    }

    const dureeReelle = parseInt(duree_minutes, 10) || 30;

    if (id_employe && !forcer_ajout) {
        const configRes = await pool.query('SELECT temps_nettoyage_minutes FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const tempsNettoyage = configRes.rowCount > 0 ? (configRes.rows[0].temps_nettoyage_minutes || 0) : 0;
        const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

        const rdvExistants = await pool.query(
            `SELECT id_rdv FROM rendez_vous 
             WHERE id_salon = $1 AND id_employe = $2 
             AND (
                (date_heure_debut < ($3::timestamp + ($4 || ' minutes')::interval)) 
                AND 
                (date_heure_debut + ((COALESCE(duree_minutes, 30) + $5) || ' minutes')::interval > $3::timestamp)
             )`,
            [id_salon, id_employe, date_heure_debut, dureeTotaleBloquee, tempsNettoyage]
        );

        if (rdvExistants.rowCount > 0) {
            const err = new Error("Un rendez-vous est déjà prévu sur cette plage horaire pour ce coiffeur. Êtes-vous sûr de vouloir forcer l'ajout ?");
            err.status = 409;
            throw err;
        }
    }

    await pool.query(
        `INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id_salon, id_employe || null, nom_client, telephone_client, prestation, date_heure_debut, dureeReelle]
    );

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');
    return { message: "RDV ajouté." };
}

/**
 * Modification d'un rendez-vous existant
 */
async function modifierRdv({ pool, io }, { id_salon, id_rdv, body }) {
    const { id_employe, prestation, date_heure_debut, duree_minutes, forcer_ajout } = body;

    if (id_employe) {
        const dateRDV = String(date_heure_debut).split('T')[0];
        const absence = await pool.query(
            `SELECT type_demande FROM absences_employes 
             WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND $3 BETWEEN date_debut AND date_fin`,
            [id_salon, id_employe, dateRDV]
        );
        if (absence.rowCount > 0) {
            const err = new Error("Impossible de déplacer sur ce collaborateur car il est absent ou en congé sur cette date.");
            err.status = 400;
            throw err;
        }
    }

    const dureeReelle = parseInt(duree_minutes, 10) || 30;

    if (id_employe && !forcer_ajout) {
        const configRes = await pool.query('SELECT temps_nettoyage_minutes FROM configuration_salon WHERE id_salon = $1', [id_salon]);
        const tempsNettoyage = configRes.rowCount > 0 ? (configRes.rows[0].temps_nettoyage_minutes || 0) : 0;
        const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

        const rdvExistants = await pool.query(
            `SELECT id_rdv FROM rendez_vous 
             WHERE id_salon = $1 AND id_employe = $2 AND id_rdv != $3
             AND (
                (date_heure_debut < ($4::timestamp + ($5 || ' minutes')::interval)) 
                AND 
                (date_heure_debut + ((COALESCE(duree_minutes, 30) + $6) || ' minutes')::interval > $4::timestamp)
             )`,
            [id_salon, id_employe, id_rdv, date_heure_debut, dureeTotaleBloquee, tempsNettoyage]
        );

        if (rdvExistants.rowCount > 0) {
            const err = new Error("Ce collaborateur a déjà un rendez-vous sur cette plage horaire. Forcer la modification ?");
            err.status = 409;
            throw err;
        }
    }

    await pool.query(
        `UPDATE rendez_vous 
         SET id_employe = $1, prestation = $2, date_heure_debut = $3, duree_minutes = $4 
         WHERE id_rdv = $5 AND id_salon = $6`,
        [id_employe || null, prestation, date_heure_debut, dureeReelle, id_rdv, id_salon]
    );

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');
    return { message: "RDV modifié." };
}

/**
 * Supprime un rendez-vous
 */
async function supprimerRdv({ pool, io }, { id_salon, id_rdv }) {
    await pool.query('DELETE FROM rendez_vous WHERE id_rdv = $1 AND id_salon = $2', [id_rdv, id_salon]);
    if (io) io.to(id_salon.toString()).emit('nouveauRDV');
    return { message: "RDV supprimé." };
}

/**
 * Informations publiques du salon, catalogue des prestations et équipe
 */
async function recupererInfosReservationPublique({ pool }, id_salon) {
    const salonRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    if (salonRes.rowCount === 0) {
        const err = new Error("Salon introuvable.");
        err.status = 404;
        throw err;
    }
    const s = salonRes.rows[0];

    const prestaRes = await pool.query(
        `SELECT id_article, nom, prix, COALESCE(duree_estimee_minutes, 30) AS duree_estimee_minutes
         FROM catalogue
         WHERE id_salon = $1 AND type_article = 'PRESTATION'
         ORDER BY nom ASC`,
        [id_salon]
    );

    const empRes = await pool.query(
        `SELECT id_employe, nom, photo_url, role
         FROM employes
         WHERE id_salon = $1
         ORDER BY nom ASC`,
        [id_salon]
    );

    return {
        salon: {
            id_salon: s.id_salon,
            nom_salon: s.nom_salon || 'Salon de Coiffure',
            adresse: s.adresse || s.adresse_salon || '',
            telephone: s.telephone || s.telephone_salon || '',
            heure_ouverture: s.heure_ouverture || '09:00',
            heure_fermeture: s.heure_fermeture || '19:00',
            fidelite_type: s.fidelite_type || 'POINTS',
            fidelite_points_seuil: s.fidelite_points_seuil || 100,
            fidelite_tampons_seuil: s.fidelite_tampons_seuil || 10,
            logo_url: s.logo_url || null,
            photos_salon: Array.isArray(s.photos_salon) ? s.photos_salon : (typeof s.photos_salon === 'string' ? JSON.parse(s.photos_salon || '[]') : [])
        },
        prestations: prestaRes.rows,
        employes: empRes.rows
    };
}

/**
 * Calcul en temps réel des créneaux disponibles pour la réservation publique
 */
async function calculerCreneauxReservationPublique({ pool }, { id_salon, date, id_employe, duree }) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const err = new Error("Date invalide.");
        err.status = 400;
        throw err;
    }

    const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const config = configRes.rows[0] || {};
    const tempsNettoyage = parseInt(config.temps_nettoyage_minutes, 10) || 0;
    const dureePresta = (parseInt(duree, 10) || 30) + tempsNettoyage;

    const ouvParts = String(config.heure_ouverture || '09:00').split(':');
    const fermParts = String(config.heure_fermeture || '19:00').split(':');
    const minDebutJour = (parseInt(ouvParts[0], 10) || 9) * 60 + (parseInt(ouvParts[1], 10) || 0);
    const minFinJour = (parseInt(fermParts[0], 10) || 19) * 60 + (parseInt(fermParts[1], 10) || 0);

    let employesCibles = [];
    if (id_employe && id_employe !== 'AUTO') {
        employesCibles = [parseInt(id_employe, 10)];
    } else {
        const empAll = await pool.query('SELECT id_employe FROM employes WHERE id_salon = $1', [id_salon]);
        employesCibles = empAll.rows.map(r => r.id_employe);
    }

    const absRes = await pool.query(
        `SELECT id_employe FROM absences_employes
         WHERE id_salon = $1 AND statut = 'VALIDE' AND $2::date BETWEEN date_debut AND date_fin`,
        [id_salon, date]
    );
    const idsAbsents = new Set(absRes.rows.map(r => Number(r.id_employe)));
    const employesDisposJour = employesCibles.filter(id => !idsAbsents.has(Number(id)));

    if (employesDisposJour.length === 0) {
        return { creneaux: [] };
    }

    const rdvsRes = await pool.query(
        `SELECT id_employe, date_heure_debut, COALESCE(duree_minutes, 30) AS duree_minutes
         FROM rendez_vous
         WHERE id_salon = $1 AND DATE(date_heure_debut) = $2::date`,
        [id_salon, date]
    );

    const creneauxDispos = [];
    const maintenant = new Date();

    for (let m = minDebutJour; m + dureePresta <= minFinJour; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const debutSlot = new Date(`${date}T${hh}:${mm}:00`);
        const finSlot = new Date(debutSlot.getTime() + dureePresta * 60000);

        if (debutSlot <= maintenant) continue;

        const employeLibre = employesDisposJour.find(idEmp => {
            const conflit = rdvsRes.rows.some(r => {
                if (Number(r.id_employe) !== Number(idEmp)) return false;
                const dExistant = new Date(String(r.date_heure_debut).replace('Z', ''));
                const fExistant = new Date(dExistant.getTime() + ((parseInt(r.duree_minutes, 10) || 30) + tempsNettoyage) * 60000);
                return dExistant < finSlot && fExistant > debutSlot;
            });
            return !conflit;
        });

        if (employeLibre) {
            creneauxDispos.push({
                heure: `${hh}:${mm}`,
                date_heure_debut: `${date}T${hh}:${mm}`,
                id_employe_suggere: employeLibre
            });
        }
    }

    return { creneaux: creneauxDispos };
}

/**
 * Vérification des avantages Fidélité / Winback lors d'une réservation publique
 */
async function verifierFideliteReservationPublique({ pool }, { id_salon, telephone }) {
    const tel = String(telephone || '').replace(/\s+/g, '').trim();
    if (!tel || tel.length < 8) return { client_trouve: false };

    const cliRes = await pool.query(
        `SELECT prenom, nom, points_fidelite, tampons_fidelite, remise_winback
         FROM clients
         WHERE id_salon = $1 AND REPLACE(telephone, ' ', '') LIKE $2
         LIMIT 1`,
        [id_salon, `%${tel.slice(-8)}%`]
    );
    if (cliRes.rowCount === 0) return { client_trouve: false };

    const c = cliRes.rows[0];
    return {
        client_trouve: true,
        prenom: c.prenom || '',
        nom: c.nom || '',
        points_fidelite: c.points_fidelite || 0,
        tampons_fidelite: c.tampons_fidelite || 0,
        remise_winback: c.remise_winback || null
    };
}

/**
 * Création d'une réservation en ligne par un client avec option acompte Stripe
 */
async function creerReservationPublique({ pool, io, stripe, envoyerNotificationPush }, { id_salon, originUrl, body }) {
    const { nom_client, telephone_client, id_employe, prestation, date_heure_debut, duree_minutes, payer_acompte } = body;

    if (!nom_client || !telephone_client || !prestation || !date_heure_debut) {
        const err = new Error("Veuillez remplir tous les champs obligatoires.");
        err.status = 400;
        throw err;
    }

    const dureeReelle = parseInt(duree_minutes, 10) || 30;
    const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const config = configRes.rows[0] || {};
    const tempsNettoyage = parseInt(config.temps_nettoyage_minutes, 10) || 0;
    const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

    if (id_employe) {
        const rdvExistants = await pool.query(
            `SELECT id_rdv FROM rendez_vous 
             WHERE id_salon = $1 AND id_employe = $2 
             AND (
                (date_heure_debut < ($3::timestamp + ($4 || ' minutes')::interval)) 
                AND 
                (date_heure_debut + ((COALESCE(duree_minutes, 30) + $5) || ' minutes')::interval > $3::timestamp)
             )`,
            [id_salon, id_employe, date_heure_debut, dureeTotaleBloquee, tempsNettoyage]
        );
        if (rdvExistants.rowCount > 0) {
            const err = new Error("Ce créneau vient tout juste d'être réservé. Veuillez choisir un autre horaire.");
            err.status = 409;
            throw err;
        }
    }

    const insertRdv = await pool.query(
        `INSERT INTO rendez_vous (id_salon, id_employe, nom_client, telephone_client, prestation, date_heure_debut, duree_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_rdv`,
        [id_salon, id_employe || null, nom_client.trim(), telephone_client.trim(), prestation, date_heure_debut, dureeReelle]
    );

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');

    if (typeof envoyerNotificationPush === 'function') {
        envoyerNotificationPush(id_salon, 'gerant', {
            title: "Nouvelle réservation en ligne STACK",
            body: `${nom_client} a réservé "${prestation}" (${date_heure_debut.replace('T', ' à ')}).`,
            url: '/?tab=agenda'
        });
    }

    if (payer_acompte && process.env.STRIPE_SECRET_KEY && stripe) {
        const prestaRes = await pool.query('SELECT prix FROM catalogue WHERE id_salon = $1 AND nom = $2 LIMIT 1', [id_salon, prestation]);
        const prixPresta = prestaRes.rowCount > 0 ? (parseFloat(prestaRes.rows[0].prix) || 30) : 30;
        const montantAcompteCents = Math.max(500, Math.round(prixPresta * 0.30 * 100));

        const baseOrigin = originUrl || 'https://app-salon-caiss.onrender.com';
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Acompte Réservation — ${prestation} (${config.nom_salon || 'Salon'})`,
                        description: `RDV du ${date_heure_debut.replace('T', ' à ')} pour ${nom_client}`
                    },
                    unit_amount: montantAcompteCents
                },
                quantity: 1
            }],
            success_url: `${baseOrigin}/?reservation=${id_salon}&success=1`,
            cancel_url: `${baseOrigin}/?reservation=${id_salon}`
        });

        return {
            status: 201,
            message: "Redirection vers l'acompte Stripe...",
            checkout_url: session.url,
            id_rdv: insertRdv.rows[0].id_rdv
        };
    }

    return {
        status: 201,
        message: "Rendez-vous confirmé.",
        id_rdv: insertRdv.rows[0].id_rdv
    };
}

/**
 * Annulation en masse de rendez-vous avec envoi facultatif de SMS d'information
 */
async function annulerRdvEnMasse({ pool, io, envoyerNotificationPush }, { id_salon, role, body }) {
    if (role === 'employe') {
        const err = new Error("Action réservée au gérant et au salon.");
        err.status = 403;
        throw err;
    }

    const { id_employe, rdv_ids, message_personnalise } = body;
    if (!Array.isArray(rdv_ids) || rdv_ids.length === 0) {
        const err = new Error("Aucun rendez-vous sélectionné.");
        err.status = 400;
        throw err;
    }

    const salonConfig = await pool.query('SELECT nom_salon, brevo_api_key, lien_google_maps FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const config = salonConfig.rows[0] || {};
    let countEnvoyes = 0;

    for (let id_rdv of rdv_ids) {
        const rdvRes = await pool.query('SELECT nom_client, telephone_client, date_heure_debut FROM rendez_vous WHERE id_rdv = $1 AND id_salon = $2', [id_rdv, id_salon]);
        if (rdvRes.rowCount > 0) {
            const rdv = rdvRes.rows[0];
            await pool.query('DELETE FROM rendez_vous WHERE id_rdv = $1', [id_rdv]);

            if (config.brevo_api_key && rdv.telephone_client && rdv.telephone_client.trim().length >= 9) {
                const optOutCheck = await pool.query(
                    `SELECT 1 FROM sms_opt_out WHERE id_salon = $1 AND telephone = RIGHT(regexp_replace($2, '\\D', '', 'g'), 9)`,
                    [id_salon, rdv.telephone_client]
                );

                if (optOutCheck.rowCount === 0) {
                    const dateRdv = new Date(rdv.date_heure_debut).toLocaleString('fr-FR', {
                        weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
                    });
                    const prenom = rdv.nom_client ? rdv.nom_client.split(' ')[0] : 'Client';
                    const lien = config.lien_google_maps || 'notre site internet';

                    let texteSms = message_personnalise || `Bonjour [Prénom], votre RDV du [Date] est annulé. Reprogrammez ici : [Lien]`;
                    texteSms = texteSms.replace(/\[Prénom\]/gi, prenom).replace(/\[Date\]/gi, dateRdv).replace(/\[Lien\]/gi, lien);

                    try {
                        await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
                            method: 'POST',
                            headers: {
                                'accept': 'application/json',
                                'api-key': config.brevo_api_key,
                                'content-type': 'application/json'
                            },
                            body: JSON.stringify({
                                type: 'transactional',
                                unicodeEnabled: false,
                                sender: (config.nom_salon || 'LeSalon').substring(0, 11),
                                recipient: rdv.telephone_client,
                                content: texteSms
                            })
                        }).catch(() => {});
                        countEnvoyes++;
                    } catch (e) {
                        console.error("Erreur SMS mass-cancel:", e);
                    }
                }
            }
        }
    }

    if (envoyerNotificationPush && id_employe) {
        envoyerNotificationPush(id_salon, { type: 'employe', id_employe }, {
            title: "Mise à jour Agenda",
            body: `Tes ${rdv_ids.length} RDV ont été annulés depuis le planning.`,
            url: '/?tab=agenda'
        });
    }

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');
    return { message: `${rdv_ids.length} rendez-vous annulés (${countEnvoyes} SMS envoyés).` };
}

/**
 * Récupère le planning complet (rendez-vous et absences croisés) pour une période
 */
async function recupererPlanning({ pool }, { id_salon, role, id_employe, startDate, endDate }) {
    let queryRdv = `SELECT r.*, e.nom as nom_employe FROM rendez_vous r LEFT JOIN employes e ON r.id_employe = e.id_employe WHERE r.id_salon = $1 AND DATE(r.date_heure_debut) >= $2 AND DATE(r.date_heure_debut) <= $3`;
    const paramsRdv = [id_salon, startDate, endDate];
    if (role === 'employe') {
        queryRdv += ` AND r.id_employe = $4`;
        paramsRdv.push(id_employe);
    }
    queryRdv += ` ORDER BY r.date_heure_debut ASC`;
    const rdvResult = await pool.query(queryRdv, paramsRdv);

    let queryAbs = `SELECT a.*, e.nom as nom_employe FROM absences_employes a LEFT JOIN employes e ON a.id_employe = e.id_employe WHERE a.id_salon = $1 AND a.statut != 'REFUSE' AND a.date_fin >= $2 AND a.date_debut <= $3`;
    const paramsAbs = [id_salon, startDate, endDate];
    if (role === 'employe') {
        queryAbs += ` AND a.id_employe = $4`;
        paramsAbs.push(id_employe);
    }
    const absResult = await pool.query(queryAbs, paramsAbs);

    return {
        rendez_vous: rdvResult.rows,
        absences: absResult.rows
    };
}

/**
 * Génère le flux de calendrier iCal (.ics) pour synchronisation Apple Calendar / Google Calendar
 */
async function genererFluxIcal({ pool }, { id_salon, id_employe }) {
    const empRes = await pool.query(
        'SELECT e.nom, cs.nom_salon FROM employes e JOIN configuration_salon cs ON cs.id_salon = e.id_salon WHERE e.id_employe = $1 AND e.id_salon = $2',
        [id_employe, id_salon]
    );

    if (empRes.rowCount === 0) {
        const err = new Error("Collaborateur introuvable.");
        err.status = 404;
        throw err;
    }

    const { nom: nomEmp, nom_salon: nomSalon } = empRes.rows[0];

    const rdvRes = await pool.query(
        `SELECT id_rdv, nom_client, telephone_client, prestation, date_heure_debut, COALESCE(duree_minutes, 30) as duree_minutes
         FROM rendez_vous
         WHERE id_salon = $1 AND id_employe = $2 AND date_heure_debut >= NOW() - INTERVAL '30 days'
         ORDER BY date_heure_debut ASC`,
        [id_salon, id_employe]
    );

    const absRes = await pool.query(
        `SELECT id_absence, type_demande, date_debut, date_fin, commentaire
         FROM absences_employes
         WHERE id_salon = $1 AND id_employe = $2 AND statut = 'VALIDE' AND date_fin >= CURRENT_DATE - INTERVAL '30 days'`,
        [id_salon, id_employe]
    );

    const formatICalDate = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    };

    const escapeICal = (str) => String(str || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

    let ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//STACK SAS//Planning Coiffure//FR',
        `X-WR-CALNAME:${escapeICal(nomSalon)} - ${escapeICal(nomEmp)}`,
        'X-WR-TIMEZONE:Europe/Paris',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    for (const r of rdvRes.rows) {
        const dStart = new Date(r.date_heure_debut);
        const dEnd = new Date(dStart.getTime() + (parseInt(r.duree_minutes, 10) || 30) * 60000);
        const uid = `rdv-${r.id_rdv}-${id_salon}@stack.app`;
        const summary = `${r.prestation || 'Prestation'} - ${r.nom_client || 'Client'}`;
        const desc = `Client : ${r.nom_client || 'Non renseigné'}\\nTel : ${r.telephone_client || 'Non renseigné'}\\nDurée : ${r.duree_minutes} min`;

        ics.push(
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${formatICalDate(new Date())}`,
            `DTSTART:${formatICalDate(dStart)}`,
            `DTEND:${formatICalDate(dEnd)}`,
            `SUMMARY:${escapeICal(summary)}`,
            `DESCRIPTION:${escapeICal(desc)}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
        );
    }

    for (const a of absRes.rows) {
        const dStart = new Date(a.date_debut);
        const dEnd = new Date(a.date_fin);
        dEnd.setDate(dEnd.getDate() + 1);
        const uid = `abs-${a.id_absence}-${id_salon}@stack.app`;
        const summary = a.type_demande === 'ARRET_MALADIE' ? 'Arrêt Maladie' : 'Congés / Absence';

        ics.push(
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${formatICalDate(new Date())}`,
            `DTSTART;VALUE=DATE:${dStart.getFullYear()}${String(dStart.getMonth() + 1).padStart(2, '0')}${String(dStart.getDate()).padStart(2, '0')}`,
            `DTEND;VALUE=DATE:${dEnd.getFullYear()}${String(dEnd.getMonth() + 1).padStart(2, '0')}${String(dEnd.getDate()).padStart(2, '0')}`,
            `SUMMARY:${escapeICal(summary)}`,
            `DESCRIPTION:${escapeICal(a.commentaire || '')}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
        );
    }

    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
}

module.exports = {
    creerRdv,
    modifierRdv,
    supprimerRdv,
    recupererInfosReservationPublique,
    calculerCreneauxReservationPublique,
    verifierFideliteReservationPublique,
    creerReservationPublique,
    annulerRdvEnMasse,
    recupererPlanning,
    genererFluxIcal
};
