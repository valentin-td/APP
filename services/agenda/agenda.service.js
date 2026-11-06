/**
 * services/agenda/agenda.service.js
 * Gestion de l'agenda salon, des créneaux, réservations publiques en ligne et flux iCal
 */

const { normaliserUrlMedia } = require('../settings/settings.service');

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
        `SELECT id_employe, nom, photo_url, role, COALESCE(expertises, '[]'::jsonb) AS expertises
         FROM employes
         WHERE id_salon = $1
         ORDER BY nom ASC`,
        [id_salon]
    );

    const rawPhotos = s.photos_salon;
    const listPhotos = Array.isArray(rawPhotos) ? rawPhotos : (typeof rawPhotos === 'string' ? JSON.parse(rawPhotos || '[]') : []);

    // Suggestions Up-Sell express
    let suggestionsUpsell = [];
    if (s.upsell_mode === 'MANUEL' && Array.isArray(s.upsell_articles_ids) && s.upsell_articles_ids.length > 0) {
        const upRes = await pool.query(
            `SELECT id_article, nom, prix, COALESCE(duree_estimee_minutes, 10) AS duree_estimee_minutes
             FROM catalogue
             WHERE id_salon = $1 AND id_article = ANY($2::int[])`,
            [id_salon, s.upsell_articles_ids]
        );
        suggestionsUpsell = upRes.rows;
    }
    if (suggestionsUpsell.length === 0) {
        // Mode automatique par défaut : sélection des prestations courtes (<= 15 min) du catalogue
        const autoUpRes = await pool.query(
            `SELECT id_article, nom, prix, COALESCE(duree_estimee_minutes, 10) AS duree_estimee_minutes
             FROM catalogue
             WHERE id_salon = $1 AND type_article = 'PRESTATION' AND COALESCE(duree_estimee_minutes, 30) <= 15
             ORDER BY prix ASC
             LIMIT 3`,
            [id_salon]
        );
        suggestionsUpsell = autoUpRes.rows;
        if (suggestionsUpsell.length === 0) {
            const fallbackUpRes = await pool.query(
                `SELECT id_article, nom, prix, COALESCE(duree_estimee_minutes, 15) AS duree_estimee_minutes
                 FROM catalogue
                 WHERE id_salon = $1 AND type_article = 'PRESTATION'
                 ORDER BY prix ASC
                 LIMIT 2`,
                [id_salon]
            );
            suggestionsUpsell = fallbackUpRes.rows;
        }
    }

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
            logo_url: normaliserUrlMedia(s.logo_url),
            photos_salon: listPhotos.map(normaliserUrlMedia).filter(Boolean),
            description_salon: s.description_salon || '',
            anti_noshow_actif: s.anti_noshow_actif === true,
            anti_noshow_pourcentage: s.anti_noshow_pourcentage || 30,
            anti_noshow_mode_annulation: s.anti_noshow_mode_annulation || 'AVOIR',
            delai_annulation_heures: s.delai_annulation_heures || 24,
            upsell_suggestions: suggestionsUpsell
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

    const dateObj = new Date(`${date}T12:00:00Z`);
    const jourIndex = dateObj.getUTCDay(); // 0 = Dimanche
    if (jourIndex === 0) {
        return { creneaux: [], message: "Le salon est fermé le dimanche." };
    }

    const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const config = configRes.rows[0] || {};
    const tempsNettoyage = parseInt(config.temps_nettoyage_minutes, 10) || 0;
    const dureePresta = (parseInt(duree, 10) || 30) + tempsNettoyage;

    let hOuv = 8;
    let mOuv = 0;
    if (typeof config.heure_ouverture === 'number') {
        hOuv = config.heure_ouverture;
    } else if (config.heure_ouverture) {
        const p = String(config.heure_ouverture).split(':');
        hOuv = parseInt(p[0], 10) || 8;
        mOuv = parseInt(p[1], 10) || 0;
    }

    let hFerm = 19;
    let mFerm = 0;
    if (typeof config.heure_fermeture === 'number') {
        hFerm = config.heure_fermeture;
    } else if (config.heure_fermeture) {
        const p = String(config.heure_fermeture).split(':');
        hFerm = parseInt(p[0], 10) || 19;
        mFerm = parseInt(p[1], 10) || 0;
    }

    if (hFerm <= hOuv) hFerm = 19;
    const minDebutJour = hOuv * 60 + mOuv;
    const minFinJour = hFerm * 60 + mFerm;

    let employesCibles = [];
    if (id_employe && id_employe !== 'AUTO' && id_employe !== 'undefined') {
        const parsedEmp = parseInt(id_employe, 10);
        if (!isNaN(parsedEmp)) employesCibles = [parsedEmp];
    }
    if (employesCibles.length === 0) {
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
         WHERE id_salon = $1 AND DATE(date_heure_debut) = $2::date AND date_annulation IS NULL`,
        [id_salon, date]
    );

    // Calcul du temps total déjà réservé par collaborateur (pour privilégier celui ayant le plus de "trous")
    const occupationParEmploye = {};
    employesDisposJour.forEach(idEmp => { occupationParEmploye[Number(idEmp)] = 0; });
    rdvsRes.rows.forEach(r => {
        const idEmp = Number(r.id_employe);
        if (occupationParEmploye[idEmp] !== undefined) {
            occupationParEmploye[idEmp] += (parseInt(r.duree_minutes, 10) || 30) + tempsNettoyage;
        }
    });

    const creneauxDispos = [];
    const maintenant = new Date();

    for (let m = minDebutJour; m + dureePresta <= minFinJour; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const debutSlot = new Date(`${date}T${hh}:${mm}:00+01:00`);
        const finSlot = new Date(debutSlot.getTime() + dureePresta * 60000);

        if (debutSlot.getTime() <= maintenant.getTime()) continue;

        const employesLibres = employesDisposJour.filter(idEmp => {
            const conflit = rdvsRes.rows.some(r => {
                if (Number(r.id_employe) !== Number(idEmp)) return false;
                const dExistant = new Date(String(r.date_heure_debut).replace('Z', ''));
                const fExistant = new Date(dExistant.getTime() + ((parseInt(r.duree_minutes, 10) || 30) + tempsNettoyage) * 60000);
                return dExistant < finSlot && fExistant > debutSlot;
            });
            return !conflit;
        });

        if (employesLibres.length > 0) {
            // IA d'optimisation de remplissage : attribuer au collaborateur ayant le plus de "trous"
            employesLibres.sort((a, b) => (occupationParEmploye[Number(a)] || 0) - (occupationParEmploye[Number(b)] || 0));
            const meilleurEmploye = employesLibres[0];

            creneauxDispos.push({
                heure: `${hh}:${mm}`,
                date_heure_debut: `${date}T${hh}:${mm}`,
                id_employe_suggere: meilleurEmploye
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
 * Envoi d'un email transactionnel de confirmation de rendez-vous via Brevo SMTP API
 */
async function envoyerEmailConfirmationRdvBrevo({ pool }, { id_salon, rdv, client, configSalon, employeNom }) {
    try {
        const destEmail = rdv.email_client || client?.email;
        if (!destEmail || !destEmail.includes('@')) return;

        let brevoKey = (configSalon?.brevo_api_key || process.env.BREVO_API_KEY || '').trim();
        if (!brevoKey) {
            const dbKey = await pool.query(`SELECT brevo_api_key FROM configuration_salon WHERE id_salon = $1`, [id_salon]).catch(() => ({ rows: [] }));
            brevoKey = (dbKey.rows[0]?.brevo_api_key || process.env.BREVO_API_KEY || '').trim();
        }
        if (!brevoKey) return;

        const nomSalon = configSalon?.nom_salon || "Votre Salon";
        const adresseSalon = configSalon?.adresse_salon || configSalon?.adresse || "";
        const telSalon = configSalon?.telephone_salon || configSalon?.telephone_gerant || "";
        
        const dateRdvObj = new Date(String(rdv.date_heure_debut).replace('Z', ''));
        const dateFr = dateRdvObj.toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        const heureFr = dateRdvObj.toLocaleTimeString('fr-FR', {
            hour: '2-digit', minute: '2-digit'
        });

        const prenomAffiche = client?.prenom || (client?.nom ? client.nom.split(' ')[0] : 'Cher(e) client(e)');

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 30px 15px; color: #111827;">
          <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
            <div style="background: #111827; padding: 26px 30px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;">${nomSalon}</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #9ca3af;">Confirmation de votre rendez-vous</p>
            </div>
            <div style="padding: 28px 30px;">
              <p style="font-size: 15px; margin: 0 0 16px 0; color: #111827;">Bonjour <strong>${prenomAffiche}</strong>,</p>
              <p style="font-size: 14px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
                Votre rendez-vous a bien été enregistré chez <strong>${nomSalon}</strong>. Toute notre équipe se réjouit de vous recevoir !
              </p>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280; width: 140px;">📅 Date :</td>
                    <td style="padding: 7px 0; font-weight: 700; color: #111827; text-transform: capitalize;">${dateFr}</td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280;">⏰ Heure :</td>
                    <td style="padding: 7px 0; font-weight: 700; color: #111827;">${heureFr}</td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280;">✂️ Prestation(s) :</td>
                    <td style="padding: 7px 0; font-weight: 700; color: #111827;">${rdv.prestation}</td>
                  </tr>
                  ${employeNom ? `
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280;">👤 Coiffeur :</td>
                    <td style="padding: 7px 0; font-weight: 700; color: #111827;">${employeNom}</td>
                  </tr>` : ''}
                  ${rdv.acompte_paye > 0 ? `
                  <tr>
                    <td style="padding: 7px 0; color: #059669;">💳 Acompte en ligne :</td>
                    <td style="padding: 7px 0; font-weight: 800; color: #059669;">${parseFloat(rdv.acompte_paye).toFixed(2)} € (décompté de votre note)</td>
                  </tr>` : ''}
                  ${adresseSalon ? `
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280;">📍 Adresse :</td>
                    <td style="padding: 7px 0; color: #111827;">${adresseSalon}</td>
                  </tr>` : ''}
                  ${telSalon ? `
                  <tr>
                    <td style="padding: 7px 0; color: #6b7280;">📞 Téléphone :</td>
                    <td style="padding: 7px 0; color: #111827;">${telSalon}</td>
                  </tr>` : ''}
                </table>
              </div>
              <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #1e40af; margin-bottom: 24px; line-height: 1.5;">
                <strong>Rappel :</strong> Vous pouvez consulter ou annuler votre réservation jusqu'à 24h avant sans frais depuis votre espace client.
              </div>
              <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 28px 0 0 0;">
                ${nomSalon} • Propulsé par la plateforme de réservation <strong>STACK</strong>
              </p>
            </div>
          </div>
        </body>
        </html>
        `;

        await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: nomSalon, email: configSalon?.email_reception_factures || "contact@app-salon.com" },
                to: [{ email: destEmail, name: `${client?.prenom || ''} ${client?.nom || ''}`.trim() || destEmail }],
                subject: `Confirmation de votre rendez-vous — ${nomSalon}`,
                htmlContent
            })
        });
    } catch (e) {
        console.error("⚠️ Erreur lors de l'envoi de l'email de confirmation Brevo :", e.message);
    }
}

/**
 * Création d'une réservation en ligne avec CRM automatique, Brevo et Anti-NoShow
 */
async function creerReservationPublique({ pool, io, stripe, envoyerNotificationPush }, { id_salon, originUrl, body }) {
    const { 
        nom_client, telephone_client, email_client, id_employe, prestation, 
        prestations, date_heure_debut, duree_minutes, payer_acompte 
    } = body;

    if (!nom_client || !telephone_client || (!prestation && (!Array.isArray(prestations) || prestations.length === 0)) || !date_heure_debut) {
        const err = new Error("Veuillez remplir tous les champs obligatoires.");
        err.status = 400;
        throw err;
    }

    // Gestion multi-prestations
    let prestationsList = [];
    if (Array.isArray(prestations) && prestations.length > 0) {
        prestationsList = prestations;
    } else {
        prestationsList = [{ nom: prestation, duree_estimee_minutes: parseInt(duree_minutes, 10) || 30, prix: body.prix || 0 }];
    }

    const libellePrestation = prestationsList.map(p => p.nom || p).join(' + ');
    const dureeReelle = prestationsList.reduce((acc, p) => acc + (parseInt(p.duree_estimee_minutes || p.duree || 0, 10) || 30), 0) || parseInt(duree_minutes, 10) || 30;

    const configRes = await pool.query('SELECT * FROM configuration_salon WHERE id_salon = $1', [id_salon]);
    const config = configRes.rows[0] || {};
    const tempsNettoyage = parseInt(config.temps_nettoyage_minutes, 10) || 0;
    const dureeTotaleBloquee = dureeReelle + tempsNettoyage;

    // Détermination de l'employé (auto-attribution intelligente si AUTO / non spécifié)
    let finalEmployeId = id_employe && id_employe !== 'AUTO' ? parseInt(id_employe, 10) : null;

    if (!finalEmployeId) {
        // Trouver le collaborateur disponible qui a le moins de temps réservé (le plus de trous)
        const dateJour = date_heure_debut.slice(0, 10);
        const empAll = await pool.query('SELECT id_employe FROM employes WHERE id_salon = $1', [id_salon]);
        const idsEmp = empAll.rows.map(r => r.id_employe);

        const absRes = await pool.query(
            `SELECT id_employe FROM absences_employes WHERE id_salon = $1 AND statut = 'VALIDE' AND $2::date BETWEEN date_debut AND date_fin`,
            [id_salon, dateJour]
        );
        const idsAbsents = new Set(absRes.rows.map(r => Number(r.id_employe)));
        const employesDispos = idsEmp.filter(id => !idsAbsents.has(Number(id)));

        const rdvsJour = await pool.query(
            `SELECT id_employe, date_heure_debut, COALESCE(duree_minutes, 30) AS duree_minutes
             FROM rendez_vous
             WHERE id_salon = $1 AND DATE(date_heure_debut) = $2::date AND date_annulation IS NULL`,
            [id_salon, dateJour]
        );

        const debutSlot = new Date(String(date_heure_debut).replace('Z', ''));
        const finSlot = new Date(debutSlot.getTime() + dureeTotaleBloquee * 60000);

        const occupation = {};
        employesDispos.forEach(id => { occupation[id] = 0; });
        rdvsJour.rows.forEach(r => {
            const id = Number(r.id_employe);
            if (occupation[id] !== undefined) occupation[id] += (parseInt(r.duree_minutes, 10) || 30) + tempsNettoyage;
        });

        const libres = employesDispos.filter(idEmp => {
            return !rdvsJour.rows.some(r => {
                if (Number(r.id_employe) !== Number(idEmp)) return false;
                const dExistant = new Date(String(r.date_heure_debut).replace('Z', ''));
                const fExistant = new Date(dExistant.getTime() + ((parseInt(r.duree_minutes, 10) || 30) + tempsNettoyage) * 60000);
                return dExistant < finSlot && fExistant > debutSlot;
            });
        });

        if (libres.length > 0) {
            libres.sort((a, b) => (occupation[a] || 0) - (occupation[b] || 0));
            finalEmployeId = libres[0];
        }
    } else {
        // Vérifier conflit si employé choisi manuellement
        const rdvExistants = await pool.query(
            `SELECT id_rdv FROM rendez_vous 
             WHERE id_salon = $1 AND id_employe = $2 AND date_annulation IS NULL
             AND (
                (date_heure_debut < ($3::timestamp + ($4 || ' minutes')::interval)) 
                AND 
                (date_heure_debut + ((COALESCE(duree_minutes, 30) + $5) || ' minutes')::interval > $3::timestamp)
             )`,
            [id_salon, finalEmployeId, date_heure_debut, dureeTotaleBloquee, tempsNettoyage]
        );
        if (rdvExistants.rowCount > 0) {
            const err = new Error("Ce créneau vient tout juste d'être réservé. Veuillez choisir un autre horaire.");
            err.status = 409;
            throw err;
        }
    }

    // --- RECHERCHE OU CRÉATION AUTOMATIQUE DU CLIENT DANS LE CRM DU SALON ---
    const telPropre = String(telephone_client || '').trim();
    const telChiffres = telPropre.replace(/[^\d+]/g, '');
    const emailPropre = email_client ? String(email_client).trim().toLowerCase() : null;

    let nomVal = nom_client.trim();
    let prenomVal = (body.prenom_client || body.prenom || '').trim();
    if (!prenomVal && nomVal.includes(' ')) {
        const parts = nomVal.split(/\s+/);
        prenomVal = parts[0];
        nomVal = parts.slice(1).join(' ');
    }

    let clientRow = null;
    if (telChiffres) {
        const existTel = await pool.query(
            `SELECT id_client, nom, prenom, email, telephone, solde_avoir, points_fidelite, tampons_fidelite
             FROM clients
             WHERE id_salon = $1 AND (telephone = $2 OR REPLACE(REPLACE(telephone, ' ', ''), '.', '') = $3)
             LIMIT 1`,
            [id_salon, telPropre, telChiffres]
        );
        if (existTel.rowCount > 0) clientRow = existTel.rows[0];
    }
    if (!clientRow && emailPropre) {
        const existEmail = await pool.query(
            `SELECT id_client, nom, prenom, email, telephone, solde_avoir, points_fidelite, tampons_fidelite
             FROM clients
             WHERE id_salon = $1 AND LOWER(TRIM(email)) = $2
             LIMIT 1`,
            [id_salon, emailPropre]
        );
        if (existEmail.rowCount > 0) clientRow = existEmail.rows[0];
    }

    if (!clientRow) {
        // Auto-création de la fiche client
        const insClient = await pool.query(
            `INSERT INTO clients (id_salon, nom, prenom, telephone, email)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id_client, nom, prenom, email, telephone, solde_avoir, points_fidelite, tampons_fidelite`,
            [id_salon, nomVal || 'Client', prenomVal || '', telPropre, emailPropre]
        );
        clientRow = insClient.rows[0];
    } else {
        if (!clientRow.email && emailPropre) {
            await pool.query('UPDATE clients SET email = $1 WHERE id_client = $2', [emailPropre, clientRow.id_client]);
            clientRow.email = emailPropre;
        }
    }

    // Récupérer le nom du collaborateur pour l'email
    let employeNom = '';
    if (finalEmployeId) {
        const empNomRes = await pool.query('SELECT nom FROM employes WHERE id_employe = $1', [finalEmployeId]);
        employeNom = empNomRes.rows[0]?.nom || '';
    }

    // Calcul du prix total des prestations pour l'acompte Anti-NoShow
    let prixTotalPrestations = 0;
    for (const p of prestationsList) {
        if (p.prix !== undefined && p.prix !== null) {
            prixTotalPrestations += parseFloat(p.prix) || 0;
        } else {
            const pr = await pool.query('SELECT prix FROM catalogue WHERE id_salon = $1 AND nom = $2 LIMIT 1', [id_salon, p.nom || p]);
            if (pr.rowCount > 0) prixTotalPrestations += parseFloat(pr.rows[0].prix) || 0;
        }
    }
    if (prixTotalPrestations <= 0) prixTotalPrestations = 30.00;

    const antiNoShowActif = config.anti_noshow_actif === true || Boolean(payer_acompte);
    const pourcentageAcompte = parseInt(config.anti_noshow_pourcentage, 10) || 30;
    const montantAcompteBrut = antiNoShowActif
        ? Math.max(5.00, Math.round(prixTotalPrestations * (pourcentageAcompte / 100) * 100) / 100)
        : 0.00;

    // Déduction éventuelle de l'avoir disponible sur le compte du client
    let acompteFinalAPayer = montantAcompteBrut;
    let avoirDeduit = 0.00;
    const soldeAvoirClient = parseFloat(clientRow?.solde_avoir || 0);

    if (montantAcompteBrut > 0 && soldeAvoirClient > 0) {
        avoirDeduit = Math.min(montantAcompteBrut, soldeAvoirClient);
        acompteFinalAPayer = Math.max(0, Math.round((montantAcompteBrut - avoirDeduit) * 100) / 100);
        await pool.query(
            'UPDATE clients SET solde_avoir = solde_avoir - $1 WHERE id_client = $2',
            [avoirDeduit, clientRow.id_client]
        );
    }

    // Enregistrement du rendez-vous
    const statutAcompteInitial = acompteFinalAPayer > 0 ? 'EN_ATTENTE_STRIPE' : (avoirDeduit > 0 ? 'PAYE_PAR_AVOIR' : 'NON_APPLICABLE');

    const insertRdv = await pool.query(
        `INSERT INTO rendez_vous (
            id_salon, id_employe, id_client, nom_client, telephone_client, email_client,
            prestation, prestations_details, date_heure_debut, duree_minutes,
            acompte_exige, acompte_paye, statut_acompte
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id_rdv`,
        [
            id_salon, finalEmployeId || null, clientRow.id_client, nomVal, telPropre, emailPropre,
            libellePrestation, JSON.stringify(prestationsList), date_heure_debut, dureeReelle,
            montantAcompteBrut, avoirDeduit, statutAcompteInitial
        ]
    );

    const idRdv = insertRdv.rows[0].id_rdv;

    if (io) io.to(id_salon.toString()).emit('nouveauRDV');

    if (typeof envoyerNotificationPush === 'function') {
        envoyerNotificationPush(id_salon, 'gerant', {
            title: "Nouvelle réservation en ligne STACK",
            body: `${nomVal} a réservé "${libellePrestation}" (${date_heure_debut.replace('T', ' à ')}).`,
            url: '/?tab=agenda'
        });
    }

    // Gestion session Stripe Checkout si acompte requis
    if (acompteFinalAPayer > 0 && process.env.STRIPE_SECRET_KEY && stripe) {
        const montantCents = Math.round(acompteFinalAPayer * 100);
        const baseOrigin = originUrl || 'https://app-salon-caiss.onrender.com';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: emailPropre || undefined,
            client_reference_id: String(idRdv),
            metadata: {
                id_salon: String(id_salon),
                id_rdv: String(idRdv),
                id_client: String(clientRow.id_client),
                acompte_montant: String(acompteFinalAPayer)
            },
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Acompte Réservation — ${libellePrestation} (${config.nom_salon || 'Salon'})`,
                        description: `RDV du ${date_heure_debut.replace('T', ' à ')} pour ${nomVal}`
                    },
                    unit_amount: montantCents
                },
                quantity: 1
            }],
            success_url: `${baseOrigin}/?reservation=${id_salon}&success=1&id_rdv=${idRdv}`,
            cancel_url: `${baseOrigin}/?reservation=${id_salon}&cancelled=1`
        });

        // Mise à jour de la session Stripe
        await pool.query('UPDATE rendez_vous SET stripe_payment_intent_id = $1 WHERE id_rdv = $2', [session.id, idRdv]);

        return {
            status: 201,
            message: "Redirection vers le paiement sécurisé de l'acompte...",
            checkout_url: session.url,
            id_rdv: idRdv,
            acompte_exige: acompteFinalAPayer
        };
    }

    // Envoi de l'email de confirmation Brevo (asynchrone)
    envoyerEmailConfirmationRdvBrevo({ pool }, {
        id_salon,
        rdv: { date_heure_debut, prestation: libellePrestation, email_client: emailPropre, acompte_paye: avoirDeduit },
        client: clientRow,
        configSalon: config,
        employeNom
    }).catch(() => {});

    return {
        status: 201,
        message: "Rendez-vous confirmé avec succès !",
        id_rdv: idRdv,
        id_client: clientRow.id_client
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
    genererFluxIcal,
    envoyerEmailConfirmationRdvBrevo
};
