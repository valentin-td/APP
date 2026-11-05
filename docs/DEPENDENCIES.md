# 🕸️ Carte des Dépendances — Application STACK

> **Analyse structurelle des couplages, flux et risques de régression**  
> *Dernière mise à jour : 05/11/2026*  
> *Statut du code analysé : Répertoire local `APP-GITHUB` (branche `main`)*

---

## 1. Dépendances Globales de l'Architecture

Ce diagramme met en évidence les **composants carrefours** (utilisés par la quasi-totalité de l'application) et les modules plus périphériques.

```mermaid
flowchart TD
    %% Nœuds centraux
    DB[(PostgreSQL Pool)]
    JWT["Middleware Auth (verifierToken)"]
    JET["Module d'Audit NF525 (jet_logs)"]
    Socket["Serveur WebSocket (io)"]
    R2["Cloudflare R2 (S3 Storage)"]

    %% Modules Métier
    Auth["1. Auth & Sécurité"]
    Caisse["2. Caisse NF525"]
    Cloture["3. Clôture Z & Fantôme"]
    Agenda["5. Agenda & Planning"]
    Booking["6. Réservation Publique"]
    RH["8-11. RH, Pointage & Absences"]
    Stock["13-14. Stocks & Catalogue"]
    Chat["17. Messagerie Interne"]
    IA["21. Robot IA & Factures"]
    Compta["22. Liasse & FEC"]
    Salons["23. Multi-Salons"]
    StripeSub["24. Abonnements Stripe"]

    %% Connexions transversales
    Auth --> DB
    Auth --> JWT
    Auth --> JET

    Caisse --> DB
    Caisse --> JWT
    Caisse --> JET
    Caisse --> Socket
    Caisse -.->|"Décrémente"| Stock
    Caisse -.->|"Alimente"| RH
    Caisse -.->|"Conditionné par"| Cloture

    Cloture --> DB
    Cloture --> JET
    Cloture -.->|"Alimente"| Compta

    Agenda --> DB
    Agenda --> JWT
    Agenda --> Socket
    Agenda -.->|"Bloqué par"| RH

    Booking --> DB
    Booking --> Socket
    Booking -.->|"Crée RDV dans"| Agenda

    RH --> DB
    RH --> JWT
    RH --> JET
    RH --> Socket
    RH --> R2

    Stock --> DB
    Stock --> JWT
    Stock --> JET

    Chat --> DB
    Chat --> JWT
    Chat --> Socket

    IA --> DB
    IA --> R2
    IA -.->|"Alimente"| Compta

    Compta --> DB
    Compta --> JET

    Salons --> DB
    Salons --> JWT
    Salons --> JET

    StripeSub --> DB
    StripeSub --> JWT

    classDef critical fill:#ff4d4f,stroke:#fff,stroke-width:2px,color:#fff;
    classDef high fill:#fa8c16,stroke:#fff,stroke-width:2px,color:#fff;
    classDef medium fill:#1890ff,stroke:#fff,stroke-width:2px,color:#fff;
    classDef shared fill:#722ed1,stroke:#fff,stroke-width:2px,color:#fff;

    class Caisse,Cloture,JET critical;
    class DB,JWT,Socket shared;
    class RH,Stock,Agenda,Compta high;
    class Booking,Chat,IA,Salons,StripeSub medium;
```

---

## 2. Dépendances par Domaine Fonctionnel

### 2.1. Le Cœur Transactionnel & Fiscal (NF525)

C'est la chaîne la plus critique de l'application. Une régression sur l'un de ces maillons invalide la conformité fiscale légale du salon.

```mermaid
flowchart LR
    subgraph Encaissement["Encaissement"]
        Cart["Panier Caisse (App.jsx)"] --> PayRoute["POST /api/caisse/payer (services/caisse)"]
        PayRoute --> HashPrev["Vérification Hash Ticket N-1"]
        HashPrev --> HashCurr["Calcul Hash SHA-256 Ticket N"]
        HashCurr --> InsertTicket["INSERT tickets (Inaltérable)"]
        InsertTicket --> Lignes["INSERT lignes_ticket"]
        InsertTicket --> Comm["INSERT commissions"]
        InsertTicket --> StockDec["UPDATE stock catalogue"]
    end

    subgraph ClotureFiscale["Clôture Journalière"]
        InsertTicket --> ClotureRoute["POST /api/caisse/cloture (services/caisse)"]
        CronFantome["executerClotureFantome (3h00)"] --> ClotureRoute
        ClotureRoute --> HashZPrev["Vérification Hash Z N-1"]
        HashZPrev --> HashZCurr["Calcul Hash SHA-256 Z N"]
        HashZCurr --> InsertZ["INSERT clotures_caisse"]
        InsertZ --> Lock["Verrouillage caisse de la journée"]
    end

    subgraph Restitution["Comptabilité & Audit"]
        InsertZ --> Liasse["Génération Liasse PDF Mensuelle"]
        InsertZ --> FEC["Export FEC (DGI)"]
        InsertTicket --> FEC
        InsertTicket --> AuditNF["Audit /api/admin/verifier-nf525"]
        InsertZ --> AuditNF
    end

    PayRoute -.->|"Enregistre tout"| JET[("jet_logs (Append-only)")]
    ClotureRoute -.->|"Enregistre tout"| JET
```

---

### 2.2. Le Module RH, Absences & Agenda

```mermaid
flowchart TD
    subgraph Collaborateur["Gestion Collaborateurs"]
        Emp["Employé (services/rh/employes.service.js)"]
        Pin["Code PIN haché bcrypt"]
        Emp --> Pin
    end

    subgraph HeuresEtPointage["Pointage & Horaires"]
        Pointeuse["POST /api/rh/pointage"] --> Emp
        Pointeuse --> PointageTable[("pointages")]
        PointageTable --> CalculHeures["calculerTableauBordRH()"]
        Ajustement["POST /api/rh/ajustements"] --> CalculHeures
    end

    subgraph AbsencesEtAgenda["Congés & Planning"]
        Absence["POST /api/rh/absences"] --> ConflitTest{"Conflit avec RDV ?"}
        ConflitTest -->|"Oui (Arrêt maladie)"| TacheUrgente["INSERT taches_actions (IA)"]
        ConflitTest -->|"Oui"| PushGerant["Notification Push Gérant"]
        Absence --> CloudflareR2["Upload Justificatif (R2)"]
        Absence --> AbsTable[("absences_employes")]
        AbsTable --> PlanningEmp["Planning Agenda (/api/planning)"]
        RDVTable[("rendez_vous")] --> PlanningEmp
    end

    subgraph Primes["Rémunération"]
        TicketsTable[("tickets")] --> CommTable[("commissions")]
        CommTable --> CalculHeures
    end
```

---

### 2.3. Le Module Stocks, Catalogue & Académie

```mermaid
flowchart TD
    subgraph CatalogueBase["Catalogue & Produits"]
        Cat[("catalogue")]
        Presta["Prestations"]
        Prod["Produits de Revente"]
        Tech["Produits Techniques (Bacs)"]
        Cat --> Presta
        Cat --> Prod
        Cat --> Tech
    end

    subgraph VentesEtConsommation["Flux de Sortie"]
        CaisseSale["Vente Caisse"] -->|"Décrémente stock"| Prod
        Protocole["Fiche Protocole (Académie)"] -->|"Consomme doses"| Recette[("recettes_articles")]
        Recette -->|"Décrémente stock"| Tech
    end

    subgraph PrevisionEtReassort["Flux d'Entrée"]
        Algorithme["calculerPrevisionStocks()"] --> Cat
        Algorithme -->|"Détecte rupture < seuil"| Alerte["Alerte Stock"]
        Alerte --> BonCommande["services/pdf/bonCommandePdf.service.js"]
        BonCommande --> MailFournisseur["Envoi Email Fournisseur (Nodemailer)"]
    end
```

---

## 3. Matrice d'Interdépendance des Fonctionnalités

Le tableau ci-dessous indique pour chaque fonctionnalité son niveau d'interconnexion :
- **Autonome** : Peut fonctionner ou être modifiée sans impacter le reste du système.
- **Dépendante** : Consomme des données d'autres modules.
- **Centrale** : D'autres modules majeurs dépendent directement de son fonctionnement.

| # | Fonctionnalité | Type | Dépend de | Impacte directement |
|---|---|---|---|---|
| **1** | Authentification & Sécurité | **Centrale** | Base de données | 100% des modules (sécurisation JWT) |
| **2** | Caisse NF525 & Encaissement | **Centrale** | Auth, Catalogue, Employés, Clôtures | Stocks, Commissions RH, Clôture Z, FEC, JET |
| **3** | Clôture de Caisse (Z) | **Centrale** | Tickets de caisse, Mouvements | Caisse (blocage), Liasse, FEC, Archive |
| **4** | Journal Technique (JET) | **Centrale** | Base de données | Audit fiscal NF525, Traçabilité légale |
| **5** | Agenda & Planning | **Dépendante** | Employés, Clients, Absences | Caisse (transformation RDV en ticket), SMS |
| **6** | Réservation Publique | **Dépendante** | Horaires salon, Absences, Catalogue | Agenda (création RDV), Fichier Clients |
| **7** | Fichier Clients | **Mixte** | Base de données | Caisse, Agenda, Avis, Marketing SMS |
| **8** | Collaborateurs & PIN | **Centrale** | Base de données | Caisse, Agenda, Pointage, Commissions, RH |
| **9** | Pointeuse & Horaires | **Dépendante** | Employés | Tableau de bord RH |
| **10** | Commissions & Primes | **Dépendante** | Tickets, Employés | Tableau de bord RH |
| **11** | Absences & Justificatifs R2 | **Dépendante** | Employés, Cloudflare R2 | Agenda (blocage créneaux), Planning |
| **12** | Gamification & Objectifs | **Dépendante** | Tickets, Commissions, Employés | Tableau de bord mobile collaborateur |
| **13** | Stocks & Catalogue | **Centrale** | Base de données | Caisse, Bons de commande, Protocoles |
| **14** | Bons de Commande PDF | **Dépendante** | Catalogue, Stocks, Fournisseurs | Fournisseurs externes |
| **15** | Protocoles & Académie | **Dépendante** | Catalogue (recettes), R2 | Stocks (décompte doses) |
| **16** | Tâches d'Action | **Autonome** | Base de données | Organisation interne gérant |
| **17** | Messagerie Interne | **Autonome** | Employés, Socket.io | Notifications push |
| **18** | Notifications (Push & SSE) | **Centrale** | VAPID, WebPush, SSE | Messagerie, Agenda, Arrêts RH, Robot IA |
| **19** | Avis Clients & Réputation | **Dépendante** | Tickets, Clients, SMS Brevo | e-Réputation Google, Fiches RH |
| **20** | Marketing Prédictif SMS | **Dépendante** | Tickets, Clients, Agenda, Brevo | Rétention client, Chiffre d'affaires |
| **21** | Robot Comptable IA | **Mixte** | IMAP, Groq LLM, R2 | Tâches en attente, Factures, Compta |
| **22** | Liasse Mensuelle & FEC | **Dépendante** | Clôtures Z, Tickets, Factures | Expert-comptable, Fisc |
| **23** | Multi-Établissements | **Centrale** | Auth, Salons | Contexte global de l'application |
| **24** | Abonnements Stripe | **Centrale** | Stripe API, Webhooks | Droits d'accès aux fonctionnalités (Plan) |
| **25** | Portail Partenaires | **Isolé** | Base de données (Pool propre) | Équipement TPE Stripe des salons |
| **26** | Signature Électronique | **Centrale** | Base de données, Auth | Déblocage de l'accès au logiciel |
| **27** | Super-Administration | **Isolé** | Comptes gérants, Crons | Maintenance et support |

---

## 4. Composants Centraux & Risques de Goulot d'Étranglement

### 4.1. Le Pool de Connexions PostgreSQL (`pg.Pool`)
- **Situation actuelle** :
  - `config/db.js` instancie et exporte le pool unique partagé entre toutes les requêtes Express, les crons et les services métiers.
  - `routes_partners.js` instancie son propre pool dédié.
- **Risque** :
  - Épuisement de la limite de connexions PostgreSQL autorisée par Render (ex: 20 à 50 connexions max sur les plans standards).
  - Un pic d'activité sur le portail partenaires peut faire tomber le serveur de caisse en production.

### 4.2. Le Serveur WebSocket (`socket.io`)
- **Rôle** : Reçoit et diffuse en direct :
  - `paiementValide` (synchronisation caisse multi-écrans).
  - `nouveauRdv` (mise à jour instantanée de l'agenda).
  - `statutPointageUpdate` (chronomètre de la pointeuse).
  - `nouveauMessage` & `reactionMessageUpdate` (chat).
- **Risque** :
  - En cas de perte de connexion WebSocket, le client bascule en mode dégradé mais doit interroger l'API en polling.
  - Une fuite mémoire sur les listeners WebSocket impacterait tous les utilisateurs connectés.

### 4.3. Le Frontend Modulaire & Composants Métier (`frontend/src/`)
- **Orchestrateur racine** : `frontend/src/App.jsx` (réduit de 11 553 lignes à **1 865 lignes** [-83.8%] après extraction de tous les onglets de domaine, modales globales, composants de navigation et 20 custom hooks de logique métier).
- **Hooks Métier Découplés (`frontend/src/hooks/`)** :
  - `useAuthSession.js` : Authentification multi-rôles (gérant, salon, employé avec PIN), tokens JWT, conformité légale NF525 (CGV/Politique), reset mot de passe et Reverse Trial Stripe.
  - `useCaissePOS.js` : Smart POS NF525, panier interactif, pourboires, remises, encaissement espèces/CB Stripe Terminal, éco-tickets et queue hors-ligne `localforage`.
  - `useClotureZ.js` : Clôture journalière Z certifiée NF525, calculatrice Blind Close, régularisation matinale obligatoire, justification des écarts et alertes de fermeture.
  - `useAgendaPlanning.js` : Planning hebdomadaire des collaborateurs, collisions de rendez-vous, CRUD RDV, absences/congés et upload justificatifs Cloudflare R2.
  - `useStocksReassort.js` : Scanner de code-barres caméra HTML5 / manuel, détection de rupture d'inventaire, panier réassort fournisseur, bon de commande PDF et expédition email.
  - `usePointeuseRH.js` : Pointeuse tactile 4 étapes, saisie PIN sécurisée avec lockout exponentiel NF525 (3, 5, 7, 9 tentatives), chronomètres en direct et déblocage gérant.
  - `useComptaValidation.js` : Validation mensuelle des écritures comptables, signature tactile sur canvas, 3 points de contrôle de conformité et scellement d'archive fiscale.
  - `useInternalChat.js` : Messagerie d'équipe temps réel (Socket.io), mémos vocaux (MediaRecorder), pastilles non-lus `localforage`, accusés de lecture "Vu par" et réactions emojis.
  - `useMultiSalons.js` : Multi-établissements et franchise, création de succursales et bascule instantanée avec purge du cache local.
  - `useFacturesOCR.js` : Moteur OCR de détection et d'extraction de factures par IA, événements SSE temps réel, file d'attente de documents, simulateur salon démo et saisie manuelle.
  - `useProtocolesCoiffure.js` : Académie technique, fiches recettes de coiffure, étapes avec proportions de produits, photos/médias et calcul de rentabilité.
  - `useEntitiesCRUD.jsx` : Gestion CRUD centralisée des clients (historique et notes), des collaborateurs (PIN, commissions), du catalogue de prestations et de l'inventaire des stocks, ainsi que des exports comptables (FEC, liasse PDF) et de l'audit cryptographique NF525.
  - `useOfflineSync.js` : Écouteur réseau (online/offline), boucle de vérification (3s/5min) et vidage automatique de la file d'attente des tickets hors-ligne scellés.
  - `useMouvementsCaisse.js` : Mouvements d'espèces de caisse (entrées/sorties), calculatrice de pièces et billets, motifs prédéfinis et contrôle PIN.
  - `useGamificationEquipe.js` : Objectifs d'équipe, paliers et KPIs collaborateurs gamifiés, modales de gestion et de suivi en temps réel.
  - `useActionsChecklist.js` : Checklist Go-Live de démarrage salon, campagne SMS de sauvetage client (winback), to-do list et fusion de doublons de stocks.
  - `useAppDataLoader.js` : Moteur de synchronisation globale IndexedDB (`localforage`), auto-fetch et écouteurs WebSockets temps réel (nouveaux RDV, paiements validés, chat).
  - `usePricingLock.js` : Gestion de la logique de monétisation SaaS (Reverse Trial, soft lock, hard lock) et filtrage des accès par niveau d'abonnement (Essential, Pro, Premium).
  - `useResponsiveAgendaDate.js` : Écouteur responsive dynamique (mobile 3j, tablette 4j, desktop 7j) et pagination temporelle de l'agenda avec bornes d'ouverture.
  - `useSalonSettings.js` : Sauvegarde des paramètres de configuration du salon (horaires, sécurité PIN établissement NF525) et souscription aux notifications push Web/Mobile.
- **Structure modulaire en place** :
  - `frontend/src/components/navigation/` :
    - `NavbarSidebar.jsx` : barre latérale de navigation desktop et intégration `LiquidTabBar`.
    - `BottomMenuOutils.jsx` : menu tiroir mobile "Outils & Gestion".
    - `AppHeaderBanners.jsx` : bannières supérieures (rappel Z, essais Stripe, alertes stocks, statut hors-ligne).
  - `frontend/src/components/modals/` :
    - `RegularisationZModal.jsx` : régularisation ouverture caisse & clôture fantôme.
    - `MouvementCaisseModal.jsx` : entrées/sorties de petite caisse avec calculatrice espèces.
    - `ClotureZDialog.jsx` : clôture quotidienne Z conforme NF525 et scellement d'archive.
    - `AnnulationTicketModal.jsx` : compensation et annulation de ticket fiscal.
    - `ActionDialogs.jsx` : dialogues système (`ConfirmDialog`, `ModifStockDialog`, `ModifNomDialog`, `CancellationRobotDialog`, `AuditNf525Dialog`, `SauvetageClientDialog`).
    - `PointeuseModal.jsx` : pointeuse tactile d'horaires en 4 étapes.
    - `FusionStocksModal.jsx` : réconciliation et fusion des stocks doublons.
    - `SaisieFactureManuelleModal.jsx` : saisie manuelle de dépenses/factures avec TVA.
    - `ModalIA.jsx` : arbitrage OCR factures IA, congés et rendez-vous.
    - `ValidationComptaModal.jsx` : certification mensuelle avec signature tactile canvas.
  - `frontend/src/components/dashboard/DashboardTab.jsx` : Dashboard Salon, Salarié & Gérant.
  - `frontend/src/components/caisse/CaisseTab.jsx` : Smart POS NF525, panier réactif, scanner code-barres.
  - `frontend/src/components/actions/ActionsTab.jsx` : Centre de tâches d'action, IA OCR factures, sauvetage clients.
  - `frontend/src/components/agenda/AgendaTab.jsx` : Planning hebdo, modales RDV/absences, tutoriel pas-à-pas de recettes.
  - `frontend/src/components/protocoles/ProtocolesTab.jsx` : Académie technique, éditeur d'étapes et de proportions.
  - `frontend/src/components/stock/StocksTab.jsx` : Stocks labo/revente, réassort PDF et fusion de doublons.
  - `frontend/src/components/rh/RHTab.jsx` : Équipe, KPIs RH, fiches collaborateurs, congés et arrêts maladie.
  - `frontend/src/components/admin/AdminTab.jsx` : Clôture Z NF525, mouvements d'espèces, historiques CA & liasse.
  - `frontend/src/components/chat/MessagerieTab.jsx` : Chat interne temps réel d'équipe (Teams-style), mémos vocaux.
  - `frontend/src/components/superadmin/SuperAdminTab.jsx` : God Mode fondateur, parc de salons, MRR et robots CRON.
  - `frontend/src/components/common/` : `Avatar.jsx`, `SvgEmptyState.jsx`, `ThemeToggle.jsx`, `ToastNotification.jsx`, `SimulateurIAButton.jsx`.
  - `frontend/src/constants/theme.js` & `frontend/src/utils/` : `pin.js`, `text.js`, `protocoles.js`, `auth.js`, `fetchClient.js`.
- **Risques maîtrisés** :
  - Isolation du rendu JSX par onglet et par modalité opérationnelle.
  - Prévention de l'erreur React `#310` en garantissant la constance de l'ordre d'appel des hooks au sein de chaque composant.

---

## 5. Analyse des Cycles et Couplages Forts

1. **Couplage Caisse <-> Stocks <-> Commissions** :
   - Lorsqu'un ticket est validé, il décrémente les stocks et calcule les commissions dans la même transaction SQL.
   - **Protection en place** : Transaction SQL `BEGIN / COMMIT / ROLLBACK` stricte. Si la mise à jour des stocks ou des commissions échoue, le ticket n'est pas encaissé et l'empreinte CB Stripe est annulée.

2. **Couplage Agenda <-> Absences RH** :
   - La pose d'un arrêt maladie doit vérifier l'agenda, mais l'agenda doit également masquer les plages des collaborateurs absents.
   - **Absence de cycle bloquant** : La relation est unidirectionnelle en BDD (`absences_employes` et `rendez_vous` sont distincts et croisés en lecture via SQL).

3. **Absence de dépendance circulaire dans les services** :
   - L'architecture modulaire mise en place (`services/pdf/`, `services/compta/`, `services/stock/`, `services/rh/`) utilise l'**injection de dépendances**. Les services ne s'importent pas mutuellement en boucle mais reçoivent les clients (`pool`, `s3Client`, `io`) en paramètre.
