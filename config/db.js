const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

let vapidPublicKey = null;
let vapidPrivateKey = null;

async function initDatabaseSchema({ webpush } = {}) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ia_taches_attente (id_tache SERIAL PRIMARY KEY, id_salon INT, type_tache VARCHAR(50), donnees JSONB, statut VARCHAR(20) DEFAULT 'ATTENTE', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS taches_actions (id_tache SERIAL PRIMARY KEY, id_salon INT, titre VARCHAR(255), description TEXT, date_echeance DATE, statut VARCHAR(20) DEFAULT 'A_FAIRE', source VARCHAR(20) DEFAULT 'MANUEL', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS avis_demandes (id_demande SERIAL PRIMARY KEY, id_salon INT, telephone VARCHAR(30), prenom VARCHAR(100), token VARCHAR(64) UNIQUE, id_rdv INT, statut VARCHAR(20) DEFAULT 'EN_ATTENTE', note INT, commentaire TEXT, date_prevue TIMESTAMP DEFAULT NOW(), date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      ALTER TABLE avis_demandes ADD COLUMN IF NOT EXISTS id_employe INT;
      ALTER TABLE taches_actions ADD COLUMN IF NOT EXISTS donnees JSONB;
      CREATE TABLE IF NOT EXISTS sms_opt_out (id_salon INT, telephone VARCHAR(20), date_creation TIMESTAMP DEFAULT NOW(), PRIMARY KEY (id_salon, telephone));
      CREATE TABLE IF NOT EXISTS protocoles (id_protocole SERIAL PRIMARY KEY, id_salon INT, nom_prestation VARCHAR(255), description TEXT, photo_url TEXT, delai_livraison_jours INT DEFAULT 3, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS etapes JSONB DEFAULT '[]';
      ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS medias JSONB DEFAULT '{}';
      ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
      ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS delai_livraison_jours INT DEFAULT 3;
      ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS duree_estimee_minutes INT DEFAULT 30;
      ALTER TABLE protocoles ADD COLUMN IF NOT EXISTS temps_nettoyage_minutes INT DEFAULT 0;
      ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS duree_estimee_minutes INT DEFAULT 30;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS temps_nettoyage_minutes INT DEFAULT 0;
      CREATE TABLE IF NOT EXISTS recettes_articles (id_recette SERIAL PRIMARY KEY, id_protocole INT REFERENCES protocoles(id_protocole) ON DELETE CASCADE, id_article INT, quantite_necessaire NUMERIC(10,2) DEFAULT 1);
      ALTER TABLE recettes_articles ADD COLUMN IF NOT EXISTS numero_etape INT DEFAULT 0;
      ALTER TABLE recettes_articles ADD COLUMN IF NOT EXISTS proportion VARCHAR(120) DEFAULT NULL;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS stripe_reader_id VARCHAR(255);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS prenom VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_naissance DATE;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS points_fidelite INT DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS tampons_fidelite INT DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS derniere_visite DATE;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS remise_winback VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS dernier_sms_relance DATE;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS solde_avoir NUMERIC(10,2) DEFAULT 0.00;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS mot_de_passe_hash VARCHAR(255);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_verifie BOOLEAN DEFAULT FALSE;

      ALTER TABLE employes ADD COLUMN IF NOT EXISTS expertises JSONB DEFAULT '[]'::jsonb;

      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS id_client INT REFERENCES clients(id_client) ON DELETE SET NULL;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS email_client VARCHAR(255);
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS prestations_details JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS acompte_exige NUMERIC(10,2) DEFAULT 0.00;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS acompte_paye NUMERIC(10,2) DEFAULT 0.00;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS statut_acompte VARCHAR(30) DEFAULT 'NON_APPLICABLE';
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMP;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS motif_annulation VARCHAR(255);

      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS anti_noshow_actif BOOLEAN DEFAULT FALSE;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS anti_noshow_pourcentage INT DEFAULT 30;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS anti_noshow_mode_annulation VARCHAR(30) DEFAULT 'AVOIR';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS delai_annulation_heures INT DEFAULT 24;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS upsell_mode VARCHAR(20) DEFAULT 'AUTO';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS upsell_articles_ids JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS heure_ouverture INT DEFAULT 8;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS heure_fermeture INT DEFAULT 20;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_type VARCHAR(20) DEFAULT 'NONE';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_points_seuil INT DEFAULT 100;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_points_valeur VARCHAR(50) DEFAULT '10';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_tampons_seuil INT DEFAULT 10;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_recompense_type VARCHAR(20) DEFAULT 'MONTANT';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_recompense_valeur VARCHAR(50) DEFAULT '10';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS fidelite_delai_sms INT DEFAULT 60;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS recompense_utilisee BOOLEAN DEFAULT FALSE;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS methode_paiement VARCHAR(50) DEFAULT 'CARTE';
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'VALIDE';
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS est_gerant BOOLEAN DEFAULT FALSE;
      ALTER TABLE employes ALTER COLUMN code_pin TYPE VARCHAR(255);
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_tentatives_echouees INT DEFAULT 0;
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_bloque_jusqua TIMESTAMP NULL;
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS pin_bloque_definitif BOOLEAN DEFAULT FALSE;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS montant_pourboire NUMERIC(10, 2) DEFAULT 0.00;
      
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS telephone_gerant VARCHAR(20);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS alertes_sms_actives BOOLEAN DEFAULT FALSE;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS rappel_rdv_2h_actif BOOLEAN DEFAULT FALSE;
      ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS sms_rappel_envoye BOOLEAN DEFAULT FALSE;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS email_comptable VARCHAR(255);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS jour_envoi_bilan INT DEFAULT 1;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS derniere_verif_stock DATE;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pin_salon VARCHAR(255);
      ALTER TABLE configuration_salon ALTER COLUMN pin_salon TYPE VARCHAR(255);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS securite_pin_salon_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_temp_offline VARCHAR(64);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS date_synchro_hors_ligne TIMESTAMP;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_id_temp_offline ON tickets (id_salon, id_temp_offline) WHERE id_temp_offline IS NOT NULL;
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS type_contrat VARCHAR(20) DEFAULT '35H';
      ALTER TABLE employes ADD COLUMN IF NOT EXISTS heures_mensuelles_base NUMERIC(10, 2) DEFAULT 151.67;

      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type_ticket VARCHAR(20) DEFAULT 'VENTE';
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS id_ticket_origine INT REFERENCES tickets(id_ticket);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS motif_annulation TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS est_compense BOOLEAN DEFAULT FALSE;

      ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS nom_article_snapshot VARCHAR(255);
      ALTER TABLE lignes_ticket ADD COLUMN IF NOT EXISTS taux_tva_snapshot NUMERIC(5,2) DEFAULT 20.00;
      ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5,2) DEFAULT 20.00;

      CREATE TABLE IF NOT EXISTS jet_logs (id_jet SERIAL PRIMARY KEY, id_salon INT NOT NULL, action VARCHAR(50) NOT NULL, details JSONB, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, hash_precedent VARCHAR(64), hash_jet VARCHAR(64));
      CREATE INDEX IF NOT EXISTS idx_jet_logs_salon_date ON jet_logs (id_salon, date_creation);

      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS id_cloture SERIAL;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS date_cloture DATE;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS cumul_perpetuel_ttc NUMERIC(14,2);
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS ferme_par VARCHAR(100) DEFAULT 'Non spécifié';
      
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_caisse_matin NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_especes_theorique NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_especes_reel NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS ecart_caisse NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS justification_ecart TEXT;
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS est_cloture_automatique BOOLEAN DEFAULT FALSE;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compteur_tickets INT DEFAULT 0;
      
      ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS numero_z_salon INT;
      CREATE TABLE IF NOT EXISTS mouvements_caisse (
          id_mouvement SERIAL PRIMARY KEY,
          id_salon INT,
          id_employe INT,
          type_mouvement VARCHAR(50) NOT NULL, -- 'ENTREE', 'SORTIE', 'REGULARISATION'
          montant NUMERIC(10, 2) NOT NULL,
          motif TEXT NOT NULL,
          date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          hash_precedent VARCHAR(64),
          hash_mouvement VARCHAR(64)
      );
      ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
      ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS hash_mouvement VARCHAR(64);
      ALTER TABLE mouvements_caisse ADD COLUMN IF NOT EXISTS categorie_comptable VARCHAR(40) DEFAULT 'AUTRE';

      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS plan_actuel VARCHAR(20) DEFAULT 'PREMIUM_TRIAL';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS siret VARCHAR(50);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS forme_juridique VARCHAR(30);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS capital_social VARCHAR(50);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS rcs_ville VARCHAR(100);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS mode_suivi_heures VARCHAR(20) DEFAULT 'MANUEL';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS tva_intra VARCHAR(50);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS adresse_salon TEXT;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS frequence_paiement VARCHAR(20) DEFAULT 'MENSUEL';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS sms_envoyes_mois INT DEFAULT 0;
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS mois_en_cours VARCHAR(7);
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS _subscription_id VARCHAR(255);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_banque VARCHAR(20) DEFAULT '512000';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_caisse VARCHAR(20) DEFAULT '530000';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_prestations VARCHAR(20) DEFAULT '706000';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_produits VARCHAR(20) DEFAULT '707000';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS compte_tva VARCHAR(20) DEFAULT '445710';
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS pennylane_api_key VARCHAR(255);
      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS comptes_emails JSONB DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS factures_fournisseurs (id_facture SERIAL PRIMARY KEY, id_salon INT, nom_fournisseur VARCHAR(255), montant_ht NUMERIC(10,2), montant_tva NUMERIC(10,2), montant_ttc NUMERIC(10,2), date_traitement TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS numero_facture VARCHAR(255);
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(50) DEFAULT 'NON_SPECIFIE';
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS statut_verification VARCHAR(20) DEFAULT 'A_VALIDER';
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS justificatif_url TEXT;
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS fichier_cle_r2 TEXT;
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS date_facture DATE;
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS date_reglement DATE;
      ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS compte_comptable VARCHAR(20);

      CREATE TABLE IF NOT EXISTS messages (id_message SERIAL PRIMARY KEY, id_salon INT, id_expediteur INT, id_destinataire INT, contenu TEXT, fichier_url TEXT, reactions JSONB DEFAULT '{}', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

      CREATE TABLE IF NOT EXISTS absences_employes (
          id_absence SERIAL PRIMARY KEY,
          id_salon INT NOT NULL,
          id_employe INT NOT NULL,
          type_demande VARCHAR(20) NOT NULL, 
          nature_absence VARCHAR(50) NOT NULL, 
          type_prolongation VARCHAR(20) DEFAULT 'INITIAL', 
          date_debut DATE NOT NULL,
          moment_debut VARCHAR(10) DEFAULT 'MATIN', 
          date_fin DATE NOT NULL,
          moment_fin VARCHAR(10) DEFAULT 'APRES_MIDI', 
          heures_sortie VARCHAR(100), 
          commentaire TEXT,
          fichier_cle_r2 TEXT, 
          statut VARCHAR(20) DEFAULT 'EN_ATTENTE', 
          motif_refus TEXT,
          date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS vu_par JSONB DEFAULT '[]';
      
      CREATE TABLE IF NOT EXISTS heures_ajustements (id_ajustement SERIAL PRIMARY KEY, id_employe INT, mois_annee VARCHAR(7), heures_ajoutees NUMERIC(10,2), motif TEXT, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS liasses_mensuelles_validees (id_validation SERIAL PRIMARY KEY, id_salon INT, mois_annee VARCHAR(7), date_validation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, valide_par VARCHAR(255), UNIQUE(id_salon, mois_annee));
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14,2) DEFAULT 0.00;
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_tva NUMERIC(14,2) DEFAULT 0.00;
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14,2) DEFAULT 0.00;
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS cumul_perpetuel_ttc NUMERIC(14,2) DEFAULT 0.00;
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS hash_precedent VARCHAR(64);
      ALTER TABLE liasses_mensuelles_validees ADD COLUMN IF NOT EXISTS signature_hash VARCHAR(64);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS donnees_scellees TEXT;
      CREATE TABLE IF NOT EXISTS push_subscriptions (id_sub SERIAL PRIMARY KEY, id_salon INT, role VARCHAR(20), id_employe INT, endpoint TEXT, keys JSONB, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS pointages (id_pointage SERIAL PRIMARY KEY, id_employe INT, id_salon INT, date_jour DATE DEFAULT CURRENT_DATE, type_action VARCHAR(20), heure_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      
      -- TABLES PORTAIL PARTENAIRES
      CREATE TABLE IF NOT EXISTS partner_agents (id_agent SERIAL PRIMARY KEY, nom VARCHAR(100) NOT NULL, prenom VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, telephone VARCHAR(20), mot_de_passe_hash VARCHAR(255) NOT NULL, siret_agent VARCHAR(50) NOT NULL, numero_rsac VARCHAR(100), iban VARCHAR(50), code_partenaire VARCHAR(50) UNIQUE NOT NULL, statut_compte VARCHAR(30) DEFAULT 'EN_ATTENTE_VALIDATION', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS partner_stocks_tpe (numero_serie VARCHAR(100) PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE SET NULL, statut VARCHAR(50) DEFAULT 'EN_STOCK_STACK', id_salon_affecte INT, date_attribution_agent TIMESTAMP);
      CREATE TABLE IF NOT EXISTS partner_factures_installation (id_facture SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, numero_facture VARCHAR(50) UNIQUE NOT NULL, nom_salon VARCHAR(255) NOT NULL, adresse_salon TEXT NOT NULL, siret_salon VARCHAR(50) NOT NULL, montant_ht NUMERIC(10,2) DEFAULT 99.00, statut VARCHAR(30) DEFAULT 'EN_ATTENTE_DE_PAIEMENT', date_emission TIMESTAMP DEFAULT CURRENT_TIMESTAMP, date_paiement TIMESTAMP);
      CREATE TABLE IF NOT EXISTS partner_prospects_reservations (id_prospect SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, nom_salon VARCHAR(255) NOT NULL, ville VARCHAR(100), code_postal VARCHAR(20), siret_prospect VARCHAR(50), telephone_salon VARCHAR(20), email_gerant VARCHAR(255) NOT NULL, statut_prospect VARCHAR(30) DEFAULT 'DECLARE', date_declaration TIMESTAMP DEFAULT CURRENT_TIMESTAMP, date_expiration_protection TIMESTAMP NOT NULL, id_salon_converti INT);
      CREATE TABLE IF NOT EXISTS partner_attributions_salons (id_attribution SERIAL PRIMARY KEY, id_salon INT UNIQUE REFERENCES configuration_salon(id_salon) ON DELETE CASCADE, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, mode_attribution VARCHAR(50) DEFAULT 'LIEN_AFFILIATION', frais_installation_factures NUMERIC(10,2) DEFAULT 99.00, statut_onboarding VARCHAR(50) DEFAULT 'EN_ATTENTE_VALIDATION_STACK', date_debut_commissionnement DATE, date_fin_commissionnement DATE, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS partner_commissions (id_commission SERIAL PRIMARY KEY, id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE, id_salon INT REFERENCES configuration_salon(id_salon) ON DELETE CASCADE, type_commission VARCHAR(50) DEFAULT 'ABONNEMENT_RECURRENT_20_POURCENT', periode_mois VARCHAR(7) NOT NULL, montant_base_ht NUMERIC(10,2) NOT NULL, taux_applique NUMERIC(5,2) DEFAULT 20.00, montant_commission NUMERIC(10,2) NOT NULL, statut_commission VARCHAR(30) DEFAULT 'EN_ATTENTE_SEUIL', date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(id_salon, periode_mois, type_commission));

      CREATE TABLE IF NOT EXISTS partner_conformite_dossier (
          id_agent INT PRIMARY KEY REFERENCES partner_agents(id_agent) ON DELETE CASCADE,
          contrat_signe BOOLEAN DEFAULT FALSE,
          date_signature_contrat TIMESTAMP,
          statut_contrat VARCHAR(30) DEFAULT 'MANQUANT',
          date_naissance DATE,
          date_expiration_identite DATE,
          fichier_identite TEXT,
          statut_identite VARCHAR(30) DEFAULT 'MANQUANT',
          forme_juridique VARCHAR(50) DEFAULT 'EI',
          date_debut_activite DATE,
          adresse_pro TEXT,
          statut_siret VARCHAR(30) DEFAULT 'MANQUANT',
          greffe_rsac VARCHAR(150),
          date_emission_rsac DATE,
          fichier_rsac TEXT,
          statut_rsac VARCHAR(30) DEFAULT 'MANQUANT',
          date_emission_kbis DATE,
          fichier_kbis TEXT,
          statut_kbis VARCHAR(30) DEFAULT 'NON_REQUIS',
          code_verif_urssaf VARCHAR(100),
          date_emission_urssaf DATE,
          date_expiration_urssaf DATE,
          fichier_urssaf TEXT,
          statut_urssaf VARCHAR(30) DEFAULT 'MANQUANT',
          assureur_nom VARCHAR(150),
          assureur_contrat VARCHAR(100),
          assureur_plafond VARCHAR(100),
          date_expiration_rc_pro DATE,
          fichier_rc_pro TEXT,
          statut_rc_pro VARCHAR(30) DEFAULT 'MANQUANT',
          titulaire_iban VARCHAR(255),
          statut_iban VARCHAR(30) DEFAULT 'MANQUANT',
          regime_tva VARCHAR(50) DEFAULT 'FRANCHISE_293B',
          numero_tva_intra VARCHAR(50),
          statut_tva VARCHAR(30) DEFAULT 'MANQUANT',
          honneur_aucune_interdiction BOOLEAN DEFAULT FALSE,
          honneur_pas_exclusivite_employeur BOOLEAN DEFAULT FALSE,
          honneur_pas_mandat_concurrent BOOLEAN DEFAULT FALSE,
          date_declarations_honneur TIMESTAMP,
          charte_acceptee BOOLEAN DEFAULT FALSE,
          version_charte VARCHAR(20) DEFAULT 'v1.0',
          date_acceptation_charte TIMESTAMP,
          quiz_score INT DEFAULT 0,
          formation_validee BOOLEAN DEFAULT FALSE,
          date_validation_formation TIMESTAMP,
          telephone_confirme BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS partner_conformite_historique (
          id_historique SERIAL PRIMARY KEY,
          id_agent INT REFERENCES partner_agents(id_agent) ON DELETE CASCADE,
          type_piece VARCHAR(50) NOT NULL,
          action VARCHAR(50) NOT NULL,
          statut_resultat VARCHAR(30) NOT NULL,
          verifie_par VARCHAR(150),
          commentaire TEXT,
          date_evenement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE configuration_salon ADD COLUMN IF NOT EXISTS id_agent_apporteur INT REFERENCES partner_agents(id_agent) ON DELETE SET NULL;
      
      ALTER TABLE configuration_salon 
      ADD COLUMN IF NOT EXISTS etape_materiel_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_catalogue_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_equipe_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_stripe_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS etape_formation_ok BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS statut_onboarding VARCHAR(30) DEFAULT 'EN_COURS',
      ADD COLUMN IF NOT EXISTS est_bac_a_sable BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS type_bac_a_sable VARCHAR(30) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS date_expiration_sandbox TIMESTAMP DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS logo_url TEXT,
      ADD COLUMN IF NOT EXISTS photos_salon JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS description_salon TEXT;
    `);

    // Gestion des clés VAPID
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS vapid_keys (id INT PRIMARY KEY, public_key TEXT, private_key TEXT)`);
      const res = await pool.query('SELECT * FROM vapid_keys WHERE id = 1');
      if (res.rowCount === 0) {
        if (webpush && typeof webpush.generateVAPIDKeys === 'function') {
          const keys = webpush.generateVAPIDKeys();
          await pool.query('INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, $1, $2)', [keys.publicKey, keys.privateKey]);
          vapidPublicKey = keys.publicKey;
          vapidPrivateKey = keys.privateKey;
          console.log("Nouvelles clés VAPID générées et sauvegardées en BDD.");
        }
      } else {
        vapidPublicKey = res.rows[0].public_key;
        vapidPrivateKey = res.rows[0].private_key;
        console.log("Clés VAPID (Push) chargées depuis la BDD.");
      }
      if (webpush && typeof webpush.setVapidDetails === 'function' && vapidPublicKey && vapidPrivateKey) {
        webpush.setVapidDetails('mailto:contact@stack.fr', vapidPublicKey, vapidPrivateKey);
      }
    } catch (e) {
      console.error("Erreur init VAPID:", e);
    }

    // Gestion des contraintes et triggers NF525
    try {
      await pool.query(`ALTER TABLE clotures_caisse ALTER COLUMN date_cloture SET DEFAULT CURRENT_TIMESTAMP;`);
      await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cloture_salon_jour') THEN ALTER TABLE clotures_caisse ADD CONSTRAINT uq_cloture_salon_jour UNIQUE (id_salon, date_cloture); END IF; END $$;`);
      
      // BACKFILL STRICT NF525 : Séquence 1..N par salon
      await pool.query(`DROP TRIGGER IF EXISTS trigger_nf525_clotures ON clotures_caisse;`);
      await pool.query(`
          UPDATE clotures_caisse
          SET numero_z_salon = subquery.seq
          FROM (
              SELECT id_cloture, ROW_NUMBER() OVER (PARTITION BY id_salon ORDER BY date_cloture ASC, id_cloture ASC) as seq
              FROM clotures_caisse
          ) AS subquery
          WHERE clotures_caisse.id_cloture = subquery.id_cloture
          AND clotures_caisse.numero_z_salon IS DISTINCT FROM subquery.seq;
      `);
      
      // 🚨 SÉCURITÉ NF525 : Triggers stricts anti-altération et anti-suppression
      await pool.query(`
          CREATE OR REPLACE FUNCTION nf525_prevent_alteration() RETURNS TRIGGER AS $$
          BEGIN
              IF TG_OP = 'DELETE' THEN
                  RAISE EXCEPTION 'Action bloquée (NF525) : Suppression interdite sur la table %', TG_TABLE_NAME;
              END IF;
              
              IF TG_OP = 'UPDATE' THEN
                  IF TG_TABLE_NAME = 'tickets' THEN
                      IF OLD.id_salon IS DISTINCT FROM NEW.id_salon
                         OR OLD.total_ttc IS DISTINCT FROM NEW.total_ttc 
                         OR OLD.montant_pourboire IS DISTINCT FROM NEW.montant_pourboire
                         OR OLD.numero_ticket_caisse IS DISTINCT FROM NEW.numero_ticket_caisse 
                         OR OLD.date_creation IS DISTINCT FROM NEW.date_creation 
                         OR OLD.methode_paiement IS DISTINCT FROM NEW.methode_paiement
                         OR OLD.statut IS DISTINCT FROM NEW.statut
                         OR OLD.type_ticket IS DISTINCT FROM NEW.type_ticket
                         OR OLD.id_ticket_origine IS DISTINCT FROM NEW.id_ticket_origine
                         OR OLD.motif_annulation IS DISTINCT FROM NEW.motif_annulation
                         OR OLD.id_employe IS DISTINCT FROM NEW.id_employe
                         OR OLD.id_client IS DISTINCT FROM NEW.id_client
                         OR (OLD.est_compense = TRUE AND NEW.est_compense = FALSE)
                         OR (OLD.hash_ticket IS NOT NULL AND OLD.hash_ticket IS DISTINCT FROM NEW.hash_ticket)
                         OR (OLD.donnees_scellees IS NOT NULL AND OLD.donnees_scellees IS DISTINCT FROM NEW.donnees_scellees) THEN
                          RAISE EXCEPTION 'Action bloquée (NF525) : Altération des données fiscales, de paiement ou de traçabilité interdite.';
                      END IF;
                  ELSIF TG_TABLE_NAME = 'clotures_caisse' THEN
                      IF OLD.est_cloture_automatique IS DISTINCT FROM TRUE
                         OR NEW.est_cloture_automatique IS DISTINCT FROM FALSE
                         OR OLD.total_encaisse IS DISTINCT FROM NEW.total_encaisse
                         OR OLD.signature_hash IS DISTINCT FROM NEW.signature_hash
                         OR OLD.date_cloture IS DISTINCT FROM NEW.date_cloture
                         OR OLD.cumul_perpetuel_ttc IS DISTINCT FROM NEW.cumul_perpetuel_ttc
                         OR OLD.hash_precedent IS DISTINCT FROM NEW.hash_precedent
                         OR OLD.fond_caisse_matin IS DISTINCT FROM NEW.fond_caisse_matin
                         OR OLD.total_especes_theorique IS DISTINCT FROM NEW.total_especes_theorique
                         OR OLD.total_especes_reel IS DISTINCT FROM NEW.total_especes_reel
                         OR OLD.ecart_caisse IS DISTINCT FROM NEW.ecart_caisse
                         OR OLD.numero_z_salon IS DISTINCT FROM NEW.numero_z_salon THEN
                          RAISE EXCEPTION 'Action bloquée (NF525) : Altération interdite sur la table clotures_caisse';
                      END IF;
                  ELSIF TG_TABLE_NAME = 'mouvements_caisse' THEN
                      IF OLD.id_salon IS DISTINCT FROM NEW.id_salon
                         OR (OLD.hash_mouvement IS NOT NULL AND OLD.hash_mouvement IS DISTINCT FROM NEW.hash_mouvement)
                         OR OLD.hash_precedent IS DISTINCT FROM NEW.hash_precedent
                         OR OLD.montant IS DISTINCT FROM NEW.montant
                         OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
                         OR OLD.categorie_comptable IS DISTINCT FROM NEW.categorie_comptable
                         OR OLD.motif IS DISTINCT FROM NEW.motif
                         OR OLD.date_creation IS DISTINCT FROM NEW.date_creation THEN
                          RAISE EXCEPTION 'Action bloquée (NF525) : Modification absolue interdite sur la table mouvements_caisse';
                      END IF;
                  ELSIF TG_TABLE_NAME IN ('lignes_ticket', 'jet_logs', 'liasses_mensuelles_validees') THEN
                      RAISE EXCEPTION 'Action bloquée (NF525) : Modification absolue interdite sur la table %', TG_TABLE_NAME;
                  END IF;
              END IF;
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          DROP TRIGGER IF EXISTS trigger_nf525_tickets ON tickets;
          CREATE TRIGGER trigger_nf525_tickets BEFORE DELETE OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();
          
          DROP TRIGGER IF EXISTS trigger_nf525_lignes ON lignes_ticket;
          CREATE TRIGGER trigger_nf525_lignes BEFORE DELETE OR UPDATE ON lignes_ticket FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

          DROP TRIGGER IF EXISTS trigger_nf525_clotures ON clotures_caisse;
          CREATE TRIGGER trigger_nf525_clotures BEFORE DELETE OR UPDATE ON clotures_caisse FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

          DROP TRIGGER IF EXISTS trigger_nf525_jet ON jet_logs;
          CREATE TRIGGER trigger_nf525_jet BEFORE DELETE OR UPDATE ON jet_logs FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

          DROP TRIGGER IF EXISTS trigger_nf525_mouvements ON mouvements_caisse;
          CREATE TRIGGER trigger_nf525_mouvements BEFORE DELETE OR UPDATE ON mouvements_caisse FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();

          DROP TRIGGER IF EXISTS trigger_nf525_liasses ON liasses_mensuelles_validees;
          CREATE TRIGGER trigger_nf525_liasses BEFORE DELETE OR UPDATE ON liasses_mensuelles_validees FOR EACH ROW EXECUTE FUNCTION nf525_prevent_alteration();
      `);
    } catch (e) {
      console.error("Erreur Triggers NF525:", e);
    }
    console.log("✅ Base de données initialisée & Schéma synchronisé.");
  } catch (e) {
    console.error("Erreur Init DB:", e);
  }
}

function getVapidKeys() {
  return { vapidPublicKey, vapidPrivateKey };
}

module.exports = {
  pool,
  initDatabaseSchema,
  getVapidKeys
};
