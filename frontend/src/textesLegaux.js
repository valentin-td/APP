/* ==========================================================================
   TEXTES LÉGAUX — À REMPLIR PLUS TARD
   Ces deux textes s'affichent dans Paramètres → Informations légales.

   Comment faire : collez votre texte ENTRE les deux accents graves (` `).
   Les retours à la ligne et les paragraphes sont conservés tels quels.

   ⚠️ Dans le texte, n'écrivez ni d'accent grave (`) ni la suite de
      caractères ${ — sinon l'application ne compilera plus.

   Tant qu'un texte est vide, la page affiche "Ce contenu sera bientôt
   disponible."
   ========================================================================== */

export const TEXTE_CONDITIONS_GENERALES = `Conditions Générales d'Utilisation et de Vente
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

export const TEXTE_POLITIQUE_CONFIDENTIALITE = `Politique de Confidentialité (RGPD)

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
