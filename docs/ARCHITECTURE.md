# 🏛️ Architecture Globale — Application STACK

> **Document de référence architectural**  
> *Dernière mise à jour : 05/11/2026*  
> *Statut du code analysé : Répertoire local `APP-GITHUB` (branche `main`)*

---

## 1. Vue d'Ensemble du Système

**STACK** est une plateforme SaaS tout-en-un destinée aux gérants et équipes de salons de coiffure et instituts de beauté. L'application combine :
1. **Un terminal point de vente (Smart POS)** certifié conforme à la norme fiscale **NF525** (inaltérabilité, traçabilité, conservation, archivage).
2. **Un agenda métier et une borne de réservation en ligne** publique avec calcul dynamique de créneaux.
3. **La gestion des collaborateurs (RH)** : pointeuse digitale, calcul des heures travaillées, suivi des commissions, primes, gestion des congés et arrêts avec justificatifs sécurisés.
4. **La gestion prédictive des stocks** et le réassort automatique auprès des fournisseurs avec bons de commande PDF.
5. **Un robot comptable autonome (IA)** capable d'ingérer les emails fournisseurs (IMAP), d'extraire les données des factures PDF (Groq/OpenAI) et de préparer les écritures comptables.
6. **Une liasse fiscale et export FEC** (Fichier des Écritures Comptables) conforme aux normes DGI.
7. **Un système de marketing relationnel** : relance prédictive des clients dormants (winback) et collecte d'avis de satisfaction via SMS (Brevo).
8. **Une messagerie interne d'équipe** en temps réel (Socket.io) avec audio, photos et réactions.
9. **Un portail dédié aux agents commerciaux partenaires** pour la distribution et l'équipement matériel (TPE Stripe).

---

## 2. Diagramme Architectural Global

```mermaid
flowchart TB
    subgraph Clients["📱 Clients & Interfaces Utilisateurs"]
        PWA["PWA React 19 (Desktop / iPad / Mobile)<br/>App.jsx & LiquidTabBar"]
        PublicBooking["Borne Réservation Publique<br/>App.jsx /reservation/:id"]
        PublicReview["Borne Avis Client Publique<br/>AvisPublic.jsx /avis/:token"]
        PartnerPortal["Portail Partenaires Agents<br/>stack-partners-frontend"]
    end

    subgraph CDN_Gateway["🌐 Passerelle & Hébergement"]
        RenderFE["Render Frontend (Static Web Service)<br/>app-salon-caiss.onrender.com"]
        RenderAPI["Render API Backend (Web Service Node.js)<br/>api-salon-backend.onrender.com"]
        CORS["CORS Handler & Express Rate Limiters"]
    end

    subgraph BackendCore["⚙️ Backend Node.js / Express 5 (server.js)"]
        direction TB
        MW["Middlewares (verifierToken, verifierPlan, verifierSuperAdmin)"]
        RouterPartners["Routeur Partenaires (routes_partners.js)"]
        ModuleLegal["Module Légal & Signature (legal.js)"]
        
        subgraph ModularServices["📦 Services Métier Découplés"]
            SRV_Compta["services/compta/<br/>(fec, clotureMensuelle, archiveFiscale)"]
            SRV_PDF["services/pdf/<br/>(ticketPdf, liassePdf, bonCommandePdf)"]
            SRV_Stock["services/stock/<br/>(stock.service.js)"]
            SRV_RH["services/rh/<br/>(rh.service.js, employes.service.js)"]
        end

        subgraph CoreMonolith["🏛️ Domaines en cours d'extraction (server.js)"]
            DomainCaisse["Caisse NF525 & Clôtures Z"]
            DomainAgenda["Agenda & Planning"]
            DomainChat["Messagerie Interne"]
            DomainProto["Protocoles Académie & Tâches"]
            DomainSalons["Multi-Salons & Abonnements Stripe"]
        end

        subgraph BackgroundJobs["⏱️ Tâches de Fond & Robots (jobs/cronJobs.js)"]
            CronRobotIA["Robot Comptable IMAP/IA"]
            CronCloture["Clôture Fantôme (3h00)"]
            CronHebdo["Rapport Hebdo Gérant (Lundi 8h00)"]
            CronSMS["Rappels RDV & Marketing Prédictif (Brevo)"]
            CronAvis["Robot Avis Satisfaction"]
        end
    end

    subgraph DataStorage["💾 Stockage & Persistance"]
        PG[("PostgreSQL Render<br/>35+ Tables relationnelles")]
        R2[("Cloudflare R2 Object Storage<br/>(Photos, Justificatifs, Factures)")]
    end

    subgraph ExternalServices["🔌 Services Tiers & Intégrations"]
        Stripe["Stripe API & Stripe Terminal POS"]
        Brevo["Brevo API (Envoi SMS)"]
        Groq["Groq / OpenAI API (LLM Extraction Factures)"]
        Gmail["Gmail IMAP & SMTP (Nodemailer)"]
        Sentry["Sentry Monitoring (Erreurs Node & React)"]
        VAPID["WebPush (VAPID Notifications)"]
    end

    %% Connexions Clients -> Passerelle
    PWA -->|"HTTPS REST + WSS"| RenderAPI
    PublicBooking -->|"HTTPS REST"| RenderAPI
    PublicReview -->|"HTTPS REST"| RenderAPI
    PartnerPortal -->|"HTTPS REST"| RenderAPI
    RenderFE -.->|"Sert les assets statiques"| PWA

    %% Passerelle -> Backend
    RenderAPI --> CORS --> MW
    MW --> ModularServices
    MW --> CoreMonolith
    MW --> RouterPartners
    MW --> ModuleLegal

    %% Backend -> Jobs
    RenderAPI -.->|"Initialise au boot"| BackgroundJobs

    %% Backend & Jobs -> BDD / Storage
    ModularServices --> PG
    CoreMonolith --> PG
    RouterPartners --> PG
    BackgroundJobs --> PG
    
    ModularServices --> R2
    CoreMonolith --> R2
    BackgroundJobs --> R2

    %% Backend & Jobs -> Services Externes
    CoreMonolith --> Stripe
    BackgroundJobs --> Brevo
    BackgroundJobs --> Groq
    BackgroundJobs --> Gmail
    ModularServices --> Sentry
    CoreMonolith --> VAPID
```

---

## 3. Description des Couches Techniques

### 3.1. Couche Frontend (SPA Progressive Web App)
- **Framework** : React 19.2.8 avec Vite 8.3.0.
- **PWA & Offline** : `vite-plugin-pwa`, `sw.js` pour les notifications push web, et `localforage` (IndexedDB) pour le cache hors-ligne du catalogue et du panier caisse.
- **Gestion des états** : Composant racine `App.jsx` agissant comme orchestrateur principal (~11 500 lignes, ~230 hooks d'état), dialoguant avec des composants satellites :
  - `Parametres.jsx` : panneau de configuration salon (TPE, SMS, alertes, forfaits, exports comptables).
  - `LiquidTabBar.jsx` : barre de navigation flottante avec retours haptiques.
  - `PopupLegal.jsx` : modal bloquante de signature contractuelle électronique lors de la première connexion.
  - `PricingModal.jsx` : sélecteur de formules Stripe (Essentiel / Pro / Premium).
  - `AvisPublic.jsx` : vue publique dédiée aux clients recevant un lien SMS de satisfaction.
- **Point de configuration API** : `frontend/src/api/config.js` détecte automatiquement l'hôte (`localhost` vs domaine de production Render) pour router les requêtes.

### 3.2. Couche Passerelle & Contrôle d'Accès
- **Serveur HTTP** : Node.js avec Express 5.2.1.
- **Sécurité Réseau & CORS** : Restriction des origines autorisées (`app-salon-caiss.onrender.com`, `localhost:5173`, `stack-partners-frontend.onrender.com`), transmission des cookies avec `credentials: true`.
- **Limiteurs de Débit (`express-rate-limit`)** :
  - `authLimiter` : protège les endpoints sensibles (`/api/login`, `/api/employes/login-pin`, `/api/register`, `/api/forgot-password`).
  - `limiteurReservationPublique` & `limiteurAvisPublic` : prévient le scraping et les attaques par déni de service sur les routes publiques ouvertes.
- **Authentification & Session** :
  - JWT stockés dans des cookies HTTP-Only (`token`, `sameSite: none`, `secure: true`) et délivrance parallèle d'un `ui_token` pour l'interface React.
  - Middleware `verifierToken` : valide le jeton et extrait le contexte `{ id_salon, role, id_employe }`.
  - Middleware `verifierPlan(['PRO', 'PREMIUM'])` : contrôle d'accès aux fonctionnalités avancées (IA, OCR factures, pointeuse).
  - Middleware `verifierSuperAdmin` : réservé au support technique et administration globale.

### 3.3. Couche Métier & Services Modulaires
Les fonctionnalités clés sont organisées en modules autonomes injectant leurs dépendances :
- `services/pdf/` : moteurs de rendu vectoriel PDFKit pour tickets de caisse scellés, liasses mensuelles certifiées et bons de commande fournisseurs.
- `services/compta/` : génération du Fichier des Écritures Comptables (FEC), archivage fiscal scellé et clôtures de fin de mois.
- `services/stock/` : algorithme prédictif de rupture selon l'historique des ventes, gestion des alertes d'inventaire, fusion d'articles et réassort.
- `services/rh/` : calcul analytique des heures travaillées, gestion du pointage direct, détection des conflits d'agenda lors des arrêts, et anonymisation conforme NF525/RGPD.

### 3.4. Couche Données (PostgreSQL & Stockage Objets)
- **Base relationnelle** : PostgreSQL (hébergée sur Render, client `pg.Pool`).
- **Stockage Cloudflare R2** : Compatible Amazon S3 (`@aws-sdk/client-s3`), utilisé pour les photos de profil, les justificatifs médicaux confidentiels (avec URLs présignées éphémères de 15 minutes) et les factures fournisseurs numérisées.
- **Chiffrement applicatif** : Les informations confidentielles (mots de passe boîtes mail IMAP des salons) sont chiffrées en base via **AES-256-CBC** (`crypto.createCipheriv`).

### 3.5. Couche Temps Réel & Tâches Asynchrones
- **WebSockets (`socket.io`)** : Synchronisation immédiate des modifications de caisse, prise de RDV, pointage des collaborateurs et messagerie interne.
- **Server-Sent Events (`/api/events/:id_salon`)** : Flux d'événements unidirectionnel pour alerter le gérant des notifications urgentes.
- **WebPush (VAPID)** : Notifications système sur mobiles et tablettes gérants/employés, même lorsque l'application est en arrière-plan.
- **Crons (`node-cron`)** : Filet de sécurité à 3h du matin (clôture Z automatique), lecture périodique des boîtes emails, envoi des bilans comptables et SMS de relance.

---

## 4. Flux de Données Majeurs

### 4.1. Flux d'Encaissement & Scellement NF525
```mermaid
sequenceDiagram
    autonumber
    actor Caisse as Gérant / Employé
    participant Front as Frontend (App.jsx)
    participant Back as server.js (/api/caisse/payer)
    participant Stripe as Stripe Terminal (Lecteur TPE)
    participant DB as PostgreSQL (Tickets & JET)
    participant Socket as Socket.io Room

    Caisse->>Front: Valide le panier & mode de paiement (ex: CB)
    Front->>Back: POST /api/caisse/payer {montant, items, methode}
    alt Paiement par Carte TPE
        Back->>Stripe: Crée PaymentIntent (capture_method: manual)
        Back->>Stripe: Transmet l'instruction au TPE physique
        Stripe-->>Caisse: Présentation de la carte / PIN
        Stripe-->>Back: Confirmation empreinte bancaire
    end
    Back->>DB: BEGIN Transaction SQL
    Back->>DB: Récupère la signature SHA-256 du ticket précédent
    Back->>DB: Calcule SHA-256 du ticket courant (chaînage fiscal)
    Back->>DB: INSERT INTO tickets & lignes_ticket (scellé)
    Back->>DB: INSERT INTO commissions (primes collaborateurs)
    Back->>DB: Enregistre l'événement dans jet_logs
    Back->>DB: COMMIT Transaction SQL
    alt Paiement par Carte
        Back->>Stripe: Capture effective des fonds
    end
    Back->>Socket: Émet 'paiementValide' (mise à jour instantanée)
    Back-->>Front: Succès + Données ticket + Numéro fiscal
```

### 4.2. Flux de Réservation Publique sans Authentification
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Final (Smartphone)
    participant Public as Vue Réservation (/reservation/:id_salon)
    participant API as server.js (/api/public/reservation)
    participant DB as PostgreSQL (Agenda, Horaires, Absences)
    participant Socket as Socket.io

    Client->>Public: Ouvre la page du salon
    Public->>API: GET /api/public/reservation/:id_salon/creneaux?date=YYYY-MM-DD
    API->>DB: Croise horaires d'ouverture, RDV existants et congés collaborateurs
    API-->>Public: Liste des créneaux libres par collaborateur
    Client->>Public: Sélectionne prestation, créneau et saisit ses coordonnées
    Public->>API: POST /api/public/reservation/:id_salon/reserver
    API->>DB: Vérifie l'absence de collision à la seconde près
    API->>DB: INSERT INTO rendez_vous & crée/associe le client
    API->>Socket: Émet 'nouveauRdv' sur le canal du salon
    API-->>Public: Confirmation de réservation
```

### 4.3. Flux du Robot Comptable Autonome (IA)
```mermaid
sequenceDiagram
    autonumber
    participant Cron as cronJobs.js (Toutes les 10 min)
    participant Mail as Boîte Mail Gérant (IMAP)
    participant OCR as pdf-parse & Parser
    participant AI as Groq / OpenAI LLM
    participant R2 as Cloudflare R2
    participant DB as PostgreSQL
    participant Push as WebPush Gérant

    Cron->>DB: Sélectionne les salons avec option IA activée
    Cron->>Mail: Connexion IMAP sécurisée (mot de passe déchiffré AES)
    Mail-->>Cron: Liste des nouveaux emails avec pièces jointes PDF
    Cron->>OCR: Extraction du texte brut de la facture PDF
    Cron->>AI: Prompt structuré : identification fournisseur, dates, HT, TVA, TTC, lignes
    AI-->>Cron: JSON normalisé de la facture
    Cron->>R2: Sauvegarde pérenne du fichier PDF original
    Cron->>DB: INSERT INTO factures_fournisseurs & ia_taches_attente
    Cron->>Push: Notification gérant : "Nouvelle facture fournisseur prête à valider"
```

---

## 5. Schéma Entités / Relations Principal (BDD)

```mermaid
erDiagram
    configuration_salon ||--o{ utilisateurs : "possede"
    configuration_salon ||--o{ employes : "emploie"
    configuration_salon ||--o{ clients : "gere"
    configuration_salon ||--o{ catalogue : "propose"
    configuration_salon ||--o{ tickets : "emet"
    configuration_salon ||--o{ clotures_caisse : "cloture"
    configuration_salon ||--o{ rendez_vous : "planifie"
    configuration_salon ||--o{ absences_employes : "enregistre"
    configuration_salon ||--o{ messages : "echange"
    configuration_salon ||--o{ factures_fournisseurs : "recoit"

    tickets ||--|{ lignes_ticket : "contient"
    tickets ||--o{ commissions : "genere"
    tickets }o--|| clients : "associe a"
    tickets }o--|| employes : "realise par"

    employes ||--o{ pointages : "pointe"
    employes ||--o{ heures_ajustements : "ajuste"
    employes ||--o{ absences_employes : "depose"
    employes ||--o{ commissions : "beneficie"

    catalogue ||--o{ recettes_articles : "utilise dans"
    protocoles ||--|{ recettes_articles : "consomme"

    clotures_caisse ||--o{ liasses_mensuelles_validees : "agregee dans"
    configuration_salon ||--o{ jet_logs : "trace"
```
