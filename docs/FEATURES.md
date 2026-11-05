# 📋 Inventaire des Fonctionnalités — Application STACK

> **Inventaire fonctionnel exhaustif et fiches de dépendance**  
> *Dernière mise à jour : 05/11/2026*  
> *Statut du code analysé : Répertoire local `APP-GITHUB` (branche `main`)*

---

## Sommaire des Fonctionnalités

1. [Authentification, Sessions & Sécurité](#1-authentification-sessions--sécurité)
2. [Caisse Enregistreuse & Encaissement NF525](#2-caisse-enregistreuse--encaissement-nf525)
3. [Clôture de Caisse Journalière (Z de Caisse) & Clôture Fantôme](#3-clôture-de-caisse-journalière-z-de-caisse--clôture-fantôme)
4. [Journal des Événements Techniques (JET) & Audit NF525](#4-journal-des-événements-techniques-jet--audit-nf525)
5. [Agenda Métier & Planning des Rendez-Vous](#5-agenda-métier--planning-des-rendez-vous)
6. [Borne de Réservation Publique en Ligne](#6-borne-de-réservation-publique-en-ligne)
7. [Fichier Clients, Historique & Fidélité](#7-fichier-clients-historique--fidélité)
8. [Gestion des Collaborateurs & Sécurité PIN](#8-gestion-des-collaborateurs--sécurité-pin)
9. [Pointeuse Digitale & Décompte des Heures](#9-pointeuse-digitale--décompte-des-heures)
10. [Rémunération, Commissions & Primes Collaborateurs](#10-rémunération-commissions--primes-collaborateurs)
11. [Absences, Congés & Justificatifs Médicaux](#11-absences-congés--justificatifs-médicaux)
12. [Gamification & Objectifs d'Équipe](#12-gamification--objectifs-déquipe)
13. [Catalogue Prestations & Gestion Prédictive des Stocks](#13-catalogue-prestations--gestion-prédictive-des-stocks)
14. [Commandes Fournisseurs & Bons de Commande PDF](#14-commandes-fournisseurs--bons-de-commande-pdf)
15. [Protocoles Techniques & Académie Coiffure](#15-protocoles-techniques--académie-coiffure)
16. [Tâches d'Action & To-Do List Salon](#16-tâches-daction--to-do-list-salon)
17. [Messagerie Interne d'Équipe](#17-messagerie-interne-déquipe)
18. [Notifications Temps Réel (WebPush & SSE)](#18-notifications-temps-réel-webpush--sse)
19. [Avis Clients & Réputation Google](#19-avis-clients--réputation-google)
20. [Marketing Prédictif & SMS Automatisés (Brevo)](#20-marketing-prédictif--sms-automatisés-brevo)
21. [Robot Comptable Autonome (IA IMAP & Factures OCR)](#21-robot-comptable-autonome-ia-imap--factures-ocr)
22. [Comptabilité, Liasse Mensuelle & Export FEC](#22-comptabilité-liasse-mensuelle--export-fec)
23. [Multi-Établissements & Bascule de Salons](#23-multi-établissements--bascule-de-salons)
24. [Abonnement SaaS & Facturation Stripe](#24-abonnement-saas--facturation-stripe)
25. [Portail Partenaires & Agents Commerciaux](#25-portail-partenaires--agents-commerciaux)
26. [Signature Électronique Contractuelle](#26-signature-électronique-contractuelle)
27. [Super-Administration Système](#27-super-administration-système)

---

## 1. Authentification, Sessions & Sécurité

- **Objectif** : Authentifier les gérants (email/mot de passe), les employés (code PIN à la caisse ou sur mobile), gérer les sessions JWT sécurisées (cookies HTTP-Only) et protéger les routes contre les attaques par force brute.
- **Fichiers Frontend** : `frontend/src/App.jsx` (écrans de login gérant, login PIN collaborateur, reset password).
- **Fichiers Backend** : `server.js` (routes auth), `services/rh/employes.service.js` (règles PIN).
- **Routes API** :
  - `POST /api/register`
  - `POST /api/login`
  - `POST /api/logout`
  - `POST /api/employes/login-pin`
  - `POST /api/salon/login-pin`
  - `POST /api/forgot-password`
  - `POST /api/reset-password`
- **Services / Modules** : `bcrypt`, `jsonwebtoken`, `authLimiter` (`express-rate-limit`), `enregistrerJET`.
- **Tables BDD** : `utilisateurs`, `employes`, `configuration_salon`, `jet_logs`.
- **Dépendances Amont** : Aucune (point d'entrée).
- **Dépendances Aval** : Toutes les fonctionnalités authentifiées (`verifierToken`).
- **Interactions** : La saisie d'un PIN erroné 3, 5, 7 fois déclenche des verrouillages temporaires (15m, 30m, 1h) puis définitifs (au bout de 9 essais), enregistrés dans `jet_logs`.
- **Points Sensibles / Risques** :
  - Fuite de token ou écrasement de session si un collaborateur pointe sur la session d'un gérant (`is_pointeuse`).
  - Blocage accidentel du personnel en caisse si les tentatives ne sont pas remises à zéro après succès.
- **Tests Recommandés** :
  - Test login gérant (succès, mauvais mot de passe).
  - Test login PIN employé (succès, tentative invalide avec décompte d'essais restants).
  - Test isolation de la session pointeuse (le cookie salon ne doit pas être écrasé).

---

## 2. Caisse Enregistreuse & Encaissement NF525

- **Objectif** : Encaisser les prestations et produits vendus, gérer les paiements mixtes (CB, espèces, chèque), piloter le TPE physique Stripe Terminal, calculer la ventilation de TVA, et sceller chaque ticket avec une signature cryptographique chaînée SHA-256.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Caisse, panier, clavier PIN, sélection client/collaborateur).
- **Fichiers Backend** : `server.js` (lignes ~2650-3300), `services/pdf/ticketPdf.service.js`.
- **Routes API** :
  - `POST /api/caisse/payer`
  - `POST /api/caisse/pourboire-isole`
  - `PUT /api/caisse/annuler-ticket/:id`
  - `POST /api/caisse/envoyer-ticket`
  - `GET /api/caisse/tickets/:id`
  - `GET /api/caisse/tickets/:id/pdf`
- **Services / Modules** : `stripe` (Terminal Readers & PaymentIntents), `pdfkit`, `enregistrerJET`, `verifierClotureZ`.
- **Tables BDD** : `tickets`, `lignes_ticket`, `commissions`, `clients`, `employes`, `catalogue`, `configuration_salon`, `mouvements_caisse`, `jet_logs`.
- **Dépendances Amont** : `configuration_salon`, `employes`, `catalogue`, `clotures_caisse` (vérification qu'un Z n'est pas déjà tiré pour la journée).
- **Dépendances Aval** : Clôture Z, Commissions RH, Stocks (décrémentation automatique), Liasse comptable, FEC.
- **Interactions** :
  - L'encaissement décrémente automatiquement le stock des produits vendus.
  - Génère immédiatement les lignes de `commissions` pour les collaborateurs concernés.
  - Bloqué immédiatement si la caisse de la journée a déjà fait l'objet d'un Z (`verifierClotureZ`).
- **Points Sensibles / Risques** :
  - **CONFORMITÉ NF525 STRICTE** : Interdiction totale de modifier ou supprimer un ticket en base (`DELETE` ou `UPDATE total` interdit). Seule une annulation via émission d'un avoir négatif chaîné est légale.
  - En cas d'erreur réseau avec Stripe Terminal, annulation immédiate de l'empreinte bancaire pour éviter un double débit.
- **Tests Recommandés** :
  - Encaissement espèces / carte / mixte.
  - Vérification de la continuité de la chaîne de signature (`signature_precedente` -> `signature_actuelle`).
  - Tentative d'encaissement après clôture Z (doit renvoyer HTTP 403).

---

## 3. Clôture de Caisse Journalière (Z de Caisse) & Clôture Fantôme

- **Objectif** : Clôturer la journée de caisse, calculer les cumuls perpétuels (Grand Total brut, net, TVA par taux), sceller le rapport Z journalier avec hachage SHA-256 et verrouiller la caisse jusqu'au lendemain.
- **Fichiers Frontend** : `frontend/src/App.jsx` (modale de clôture Z, comptage du tiroir-caisse, écarts espèces).
- **Fichiers Backend** : `server.js` (lignes ~3490-3750), `jobs/cronJobs.js` (`executerClotureFantome`).
- **Routes API** :
  - `POST /api/caisse/cloture`
  - `GET /api/caisse/cloture/statut`
  - `GET /api/caisse/verification-matinale`
  - `POST /api/caisse/regulariser`
  - `GET /api/caisse/mouvements/aujourdhui`
  - `POST /api/caisse/mouvements`
- **Services / Modules** : `services/pdf/ticketPdf.service.js`, `crypto` (SHA-256), `enregistrerJET`.
- **Tables BDD** : `clotures_caisse`, `tickets`, `mouvements_caisse`, `jet_logs`, `configuration_salon`.
- **Dépendances Amont** : `tickets`, `mouvements_caisse`.
- **Dépendances Aval** : Liasse mensuelle, Export FEC, Archive fiscale.
- **Interactions** :
  - Si un gérant oublie de faire son Z le soir, le cron `executerClotureFantome` s'exécute à 3h00 du matin pour clôturer automatiquement la caisse et garantir la continuité fiscale.
  - Le lendemain matin, l'API force la vérification du fond de caisse (`verification-matinale`).
- **Points Sensibles / Risques** :
  - Rupture du chaînage des clôtures Z (`signature_precedente`).
  - Écarts d'arrondis sur la TVA entre les tickets individuels et l'agrégat du Z.
- **Tests Recommandés** :
  - Tirage d'un Z avec tickets multi-taux de TVA.
  - Vérification du verrouillage d'encaissement après Z.
  - Exécution simulée de la clôture fantôme à 3h00.

---

## 4. Journal des Événements Techniques (JET) & Audit NF525

- **Objectif** : Enregistrer de façon immuable tous les événements système sensibles (connexions échouées, ouvertures de tiroir, modifications de prix, annulations de tickets, clôtures Z, déblocages PIN).
- **Fichiers Frontend** : `frontend/src/App.jsx` (écran de conformité administrative / Super Admin).
- **Fichiers Backend** : `server.js` (`enregistrerJET`, `/api/admin/verifier-nf525`), `legal.js`.
- **Routes API** :
  - `GET /api/admin/verifier-nf525`
  - `GET /api/admin/dossier-technique-nf525/pdf`
- **Services / Modules** : `crypto` (SHA-256), `pdfkit`.
- **Tables BDD** : `jet_logs`, `tickets`, `clotures_caisse`.
- **Dépendances Amont** : Déclenché par tous les modules de l'application via `enregistrerJET()`.
- **Dépendances Aval** : Contrôles fiscaux, audits de certification.
- **Points Sensibles / Risques** :
  - `jet_logs` est une table en écriture seule (append-only). Aucun `UPDATE` ni `DELETE` ne doit jamais y être exécuté.
- **Tests Recommandés** :
  - Exécution de l'audit automatique `/api/admin/verifier-nf525` (doit valider 100% de la chaîne sans anomalie).

---

## 5. Agenda Métier & Planning des Rendez-Vous

- **Objectif** : Gérer les rendez-vous du salon en interne : vue par collaborateur, glisser-déposer, gestion des durées, notifications de modification, synchro iCal avec Apple Calendar / Google Calendar.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Agenda, modale de prise de RDV).
- **Fichiers Backend** : `services/agenda/agenda.service.js`, `server.js` (délégation des routes).
- **Routes API** :
  - `GET /api/planning`
  - `POST /api/rdv`
  - `PUT /api/rdv/:id`
  - `DELETE /api/rdv/:id`
  - `POST /api/rdv/mass-cancel`
  - `GET /api/ical/:id_salon/:id_employe.ics`
- **Services / Modules** : `services/agenda/agenda.service.js`, `socket.io`, `web-push`.
- **Tables BDD** : `rendez_vous`, `employes`, `clients`, `absences_employes`, `configuration_salon`.
- **Dépendances Amont** : `employes`, `clients`, `catalogue`, `absences_employes` (les indisponibilités et congés doivent masquer les créneaux).
- **Dépendances Aval** : Rappels SMS automatisés, Envoi de demandes d'avis post-RDV, Caisse (un clic transforme un RDV en ticket).
- **Interactions** : La suppression en masse (`mass-cancel`) déplace ou annule les rendez-vous en cas d'absence imprévue d'un coiffeur (ex: arrêt maladie).
- **Points Sensibles / Risques** :
  - Conflits de rendez-vous en cas de prise simultanée sur deux tablettes (géré par Socket.io).
- **Tests Recommandés** :
  - Création, modification horaire et suppression d'un RDV.
  - Vérification du flux iCal (format `.ics` RFC 5545 valide).

---

## 6. Borne de Réservation Publique en Ligne

- **Objectif** : Permettre aux clients finaux de prendre rendez-vous en ligne 24/7 sur smartphone/PC sans création préalable de compte, avec calcul en temps réel des créneaux libres.
- **Fichiers Frontend** : `frontend/src/App.jsx` (vue conditionnelle `PageReservationPublique` sur `/reservation/:id_salon`).
- **Fichiers Backend** : `services/agenda/agenda.service.js`, `server.js` (délégation des routes).
- **Routes API** :
  - `GET /api/public/reservation/:id_salon`
  - `GET /api/public/reservation/:id_salon/creneaux`
  - `GET /api/public/reservation/:id_salon/fidelite`
  - `POST /api/public/reservation/:id_salon/reserver`
- **Services / Modules** : `services/agenda/agenda.service.js`, `limiteurReservationPublique`, `socket.io`.
- **Tables BDD** : `configuration_salon`, `catalogue`, `employes`, `rendez_vous`, `absences_employes`, `clients`.
- **Dépendances Amont** : Horaires du salon (`configuration_salon`), catalogue prestations, absences collaborateurs.
- **Dépendances Aval** : Agenda interne (insertion instantanée), SMS de confirmation.
- **Points Sensibles / Risques** :
  - Collision de créneaux (deux clients réservant la même minute). Requête SQL avec verrouillage ou vérification d'absence stricte.
  - Abus / Spam : protégé par rate-limiting IP.
- **Tests Recommandés** :
  - Calcul des créneaux disponibles selon la durée cumulée de plusieurs prestations.
  - Réservation complète avec vérification de l'apparition en temps réel dans l'agenda salon via WebSocket.

---

## 7. Fichier Clients, Historique & Fidélité

- **Objectif** : Centraliser l'historique des visites, les formules techniques (colorations, mélanges), les coordonnées clients, et calculer automatiquement le statut de fidélité.
- **Fichiers Frontend** : `frontend/src/App.jsx` (recherche client caisse, fiche profil).
- **Fichiers Backend** : `server.js` (lignes ~1956-1975 et 5745-5750).
- **Routes API** :
  - `GET /api/clients`
  - `POST /api/clients`
  - `DELETE /api/clients/:id`
  - `GET /api/clients/:id/history`
  - `PUT /api/clients/:id/notes`
- **Services / Modules** : `pool`.
- **Tables BDD** : `clients`, `tickets`, `rendez_vous`.
- **Dépendances Amont** : Aucune.
- **Dépendances Aval** : Caisse (attribution du ticket au client), Agenda, Marketing SMS, Programme de fidélité.
- **Points Sensibles / Risques** :
  - Confidentialité des données (RGPD). Droit à l'oubli et export de portabilité.
- **Tests Recommandés** :
  - Ajout client avec téléphone international ou local français.
  - Consultation de l'historique d'achats d'un client.

---

## 8. Gestion des Collaborateurs & Sécurité PIN

- **Objectif** : Gérer l'équipe du salon, attribuer les taux de commission (prestations et revente produits), sécuriser l'accès par code PIN haché, et garantir l'anonymisation RGPD sans détruire les tickets NF525.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Équipe, modal ajout/modification collaborateur).
- **Fichiers Backend** : `server.js`, `services/rh/employes.service.js`.
- **Routes API** :
  - `GET /api/employes`
  - `POST /api/employes`
  - `PUT /api/employes/:id`
  - `DELETE /api/employes/:id`
  - `PUT /api/employes/mon-pin`
  - `PUT /api/employes/:id/debloquer-pin`
  - `PUT /api/employes/:id/photo`
- **Services / Modules** : `bcrypt`, `isPinWeak`, `enregistrerJET`.
- **Tables BDD** : `employes`, `tickets`, `commissions`, `jet_logs`.
- **Dépendances Amont** : `configuration_salon`.
- **Dépendances Aval** : Caisse (affectation des ventes), Pointeuse, Agenda, Commissions, RH.
- **Interactions** : Si un collaborateur est lié à des tickets scellés ou des commissions, sa suppression physique est refusée et remplacée par une anonymisation RGPD (`Collaborateur Anonymisé #ID`) pour préserver l'intégrité fiscale NF525.
- **Points Sensibles / Risques** :
  - Définition de PINs trop faibles (ex: `0000`, `1234`) interceptée par `isPinWeak`.
- **Tests Recommandés** :
  - Tentative de suppression d'un collaborateur ayant des ventes (doit anonymiser).
  - Tentative de suppression d'un collaborateur sans historique (doit supprimer de la BDD).

---

## 9. Pointeuse Digitale & Décompte des Heures

- **Objectif** : Permettre aux salariés de pointer leur arrivée, pauses et départ en salon via code PIN, calculer les heures effectives en direct et gérer les ajustements manuels d'heures du gérant.
- **Fichiers Frontend** : `frontend/src/App.jsx` (modal pointeuse, chronomètre en direct sur l'accueil).
- **Fichiers Backend** : `server.js`, `services/rh/rh.service.js`.
- **Routes API** :
  - `GET /api/rh/statut-pointages`
  - `POST /api/rh/pointage`
  - `POST /api/rh/ajustements`
- **Services / Modules** : `socket.io` (`statutPointageUpdate`).
- **Tables BDD** : `pointages`, `heures_ajustements`, `employes`.
- **Dépendances Amont** : `employes`.
- **Dépendances Aval** : Tableau de bord RH, Bilan mensuel.
- **Points Sensibles / Risques** :
  - Sessions non fermées en fin de journée (prises en compte jusqu'à l'heure actuelle si aujourd'hui, plafonnées sinon).
- **Tests Recommandés** :
  - Cycle complet de pointage : ENTREE -> PAUSE_DEBUT -> PAUSE_FIN -> SORTIE.
  - Vérification de l'émission WebSocket en direct vers les autres écrans.

---

## 10. Rémunération, Commissions & Primes Collaborateurs

- **Objectif** : Calculer en temps réel les primes et commissions acquises par chaque employé sur les prestations coiffure et la vente de produits, avec historique glissant sur 6 mois.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet RH, fiches collaborateurs).
- **Fichiers Backend** : `server.js`, `services/rh/rh.service.js` (`calculerTableauBordRH`).
- **Routes API** :
  - `GET /api/rh`
- **Services / Modules** : Requêtes analytiques SQL avec fenêtrage mensuel.
- **Tables BDD** : `commissions`, `employes`, `tickets`, `avis_demandes`.
- **Dépendances Amont** : `tickets`, `employes`.
- **Dépendances Aval** : Fiches de paie / Préparation comptable.
- **Points Sensibles / Risques** :
  - Modification rétroactive de tickets (interdite par NF525, ce qui garantit la fiabilité des commissions).
- **Tests Recommandés** :
  - Vente d'un forfait coiffure + shampooing revente : vérification de la ventilation exacte des deux taux de commission.

---

## 11. Absences, Congés & Justificatifs Médicaux

- **Objectif** : Dépôt de congés payés ou d'arrêts maladie par les salariés, détection automatique des rendez-vous en conflit dans l'agenda, stockage chiffré des arrêts maladie sur Cloudflare R2, et validation/refus par le gérant.
- **Fichiers Frontend** : `frontend/src/App.jsx` (modal dépôt congé/arrêt, aperçu justificatif).
- **Fichiers Backend** : `server.js`, `services/rh/rh.service.js`.
- **Routes API** :
  - `GET /api/rh/absences`
  - `POST /api/rh/absences`
  - `PUT /api/rh/absences/:id/decision`
  - `GET /api/rh/absences/:id/justificatif`
- **Services / Modules** : Cloudflare R2 (`PutObjectCommand`, `GetObjectCommand`, `getSignedUrl`), WebPush.
- **Tables BDD** : `absences_employes`, `rendez_vous`, `taches_actions`, `push_subscriptions`.
- **Dépendances Amont** : `employes`.
- **Dépendances Aval** : Agenda (conflits), Pointeuse, Actions prioritaires.
- **Points Sensibles / Risques** :
  - Confidentialité médicale : les justificatifs ne sont accessibles qu'avec un lien éphémère de 15 minutes signé via AWS SDK presigner.
  - Sécurité des fichiers : liste blanche stricte des formats (PDF, JPG, PNG) et contrôle de taille (max 5 Mo).
- **Tests Recommandés** :
  - Dépôt d'un arrêt maladie sur une période contenant des RDV : vérification du rapport de conflits renvoyé et création de la tâche IA urgente.

---

## 12. Gamification & Objectifs d'Équipe

- **Objectif** : Motiver les équipes via des challenges mensuels (CA généré, taux de revente de produits, panier moyen, nombre de nouveaux clients, cagnotte globale de primes).
- **Fichiers Frontend** : `frontend/src/App.jsx` (barres de progression, récompenses promises).
- **Fichiers Backend** : `server.js`, `services/rh/rh.service.js`.
- **Routes API** :
  - `GET /api/employes/gamification-kpis`
  - `GET /api/equipe/objectifs`
  - `POST /api/equipe/objectifs`
  - `DELETE /api/equipe/objectifs/:id`
- **Services / Modules** : Fonctions d'évaluation d'objectifs (`evaluerValeurObjectif`).
- **Tables BDD** : `objectifs_equipe`, `tickets`, `commissions`, `clients`.
- **Dépendances Amont** : `tickets`, `employes`.
- **Dépendances Aval** : Tableau de bord collaborateur sur mobile.
- **Tests Recommandés** :
  - Création d'un objectif de revente produits à 20% et vérification du calcul de progression en direct.

---

## 13. Catalogue Prestations & Gestion Prédictive des Stocks

- **Objectif** : Répertoire complet des prestations et des produits de revente/techniques, calcul prédictif de vélocité des ventes, détection des ruptures de stock imminentes, correction d'inventaire et fusion de doublons.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglets Produits & Caisse, modale de fusion, modale de réassort).
- **Fichiers Backend** : `server.js`, `services/stock/stock.service.js`.
- **Routes API** :
  - `GET /api/catalogue`
  - `POST /api/catalogue`
  - `PUT /api/catalogue/:id/nom`
  - `DELETE /api/catalogue/:id`
  - `GET /api/stocks`
  - `PUT /api/stocks/:id`
  - `POST /api/stocks/fusionner`
  - `POST /api/stocks/verification/fait`
- **Services / Modules** : Algorithme prédictif de stock, `enregistrerJET`.
- **Tables BDD** : `catalogue`, `lignes_ticket`, `jet_logs`.
- **Dépendances Amont** : `configuration_salon`.
- **Dépendances Aval** : Caisse (sélection des articles), Commandes fournisseurs, Protocoles (recettes techniques).
- **Interactions** : La fusion regroupe deux articles identiques, additionne leurs stocks physiques et met à jour l'historique sans rupture de traçabilité.
- **Points Sensibles / Risques** :
  - Dérive des stocks due aux pertes ou vols : nécessitant pointage périodique et enregistrement JET du motif d'écart.
- **Tests Recommandés** :
  - Fusion de 2 articles avec calcul du nouveau stock cumulé.
  - Calcul de l'alerte de stock prédictive selon le rythme moyen de vente.

---

## 14. Commandes Fournisseurs & Bons de Commande PDF

- **Objectif** : Générer des bons de commande officiels au format PDF vectoriel et les envoyer par e-mail directement aux grossistes/fournisseurs (L'Oréal, Wella, Schwarzkopf, etc.).
- **Fichiers Frontend** : `frontend/src/App.jsx` (panier de réassort fournisseur).
- **Fichiers Backend** : `server.js`, `services/stock/stock.service.js`, `services/pdf/bonCommandePdf.service.js`.
- **Routes API** :
  - `POST /api/catalogue/bon-commande-pdf`
  - `POST /api/catalogue/envoyer-commande`
- **Services / Modules** : `pdfkit`, `nodemailer` (Gmail SMTP).
- **Tables BDD** : `catalogue`, `configuration_salon`.
- **Dépendances Amont** : `catalogue`, seuils d'alerte de stock.
- **Dépendances Aval** : Entrées en stock lors de la livraison.
- **Tests Recommandés** :
  - Génération du buffer PDF et validation de la structure du bon de commande.

---

## 15. Protocoles Techniques & Académie Coiffure

- **Objectif** : Digitaliser le savoir-faire du salon : fiches protocoles par technique (Balayage, Ombré, Lissage brésilien) avec étapes chronométrées, photos et décompte automatique des doses de produits (recettes).
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Protocoles).
- **Fichiers Backend** : `server.js`, `services/protocoles/protocoles.service.js`.
- **Routes API** :
  - `GET /api/protocoles`
  - `POST /api/protocoles`
  - `PUT /api/protocoles/:id`
  - `DELETE /api/protocoles/:id`
- **Services / Modules** : `services/protocoles/protocoles.service.js`, Cloudflare R2 (photos des réalisations).
- **Tables BDD** : `protocoles`, `recettes_articles`, `catalogue`.
- **Dépendances Amont** : `catalogue` (pour la liaison des ingrédients de recette).
- **Dépendances Aval** : Caisse & Stocks (consommation technique décomptée lors de l'encaissement).
- **Tests Recommandés** :
  - Création d'un protocole avec 2 ingrédients et vérification de la décrémentation des stocks lors de l'application.

---

## 16. Tâches d'Action & To-Do List Salon

- **Objectif** : Organiser les tâches opérationnelles du salon (ménage, réassort, relances clients, déclarations) créées manuellement ou injectées par l'IA.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Actions).
- **Fichiers Backend** : `server.js`, `services/protocoles/protocoles.service.js`.
- **Routes API** :
  - `GET /api/taches`
  - `POST /api/taches`
  - `PUT /api/taches/:id/statut`
  - `DELETE /api/taches/:id`
- **Services / Modules** : `services/protocoles/protocoles.service.js`, `pool`.
- **Tables BDD** : `taches_actions`.
- **Dépendances Amont** : Alimenté manuellement ou par `cronJobs.js` / arrêts maladie.
- **Dépendances Aval** : Organisation interne de l'équipe.
- **Tests Recommandés** :
  - Création et passage d'une tâche à l'état `TERMINEE`.

---

## 17. Messagerie Interne d'Équipe

- **Objectif** : Chat d'équipe privé et temps réel entre collaborateurs et gérant : messages texte, notes vocales audio (Base64), photos d'inspiration, réactions emojis et statuts de lecture ("Vu").
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet Messagerie, composant d'enregistrement audio).
- **Fichiers Backend** : `server.js`, `services/chat/chat.service.js`.
- **Routes API** :
  - `GET /api/messages`
  - `POST /api/messages`
  - `PUT /api/messages/:id`
  - `DELETE /api/messages/:id`
  - `POST /api/messages/vu`
  - `POST /api/messages/:id/react`
- **Services / Modules** : `services/chat/chat.service.js`, `socket.io` (`nouveauMessage`, `reactionMessageUpdate`), WebPush.
- **Tables BDD** : `messages`, `employes`, `configuration_salon`.
- **Dépendances Amont** : `employes`.
- **Dépendances Aval** : Notifications push sur mobiles.
- **Points Sensibles / Risques** :
  - Poids des payloads audio/photo transitant par WebSocket : limitation à 2 Mo par message.
- **Tests Recommandés** :
  - Envoi d'un message avec écoute sur un deuxième client via Socket.io.
  - Ajout d'une réaction emoji.

---

## 18. Notifications Temps Réel (WebPush & SSE)

- **Objectif** : Avertir instantanément le personnel et les gérants (nouveau message, nouvelle réservation en ligne, alerte stock, arrêt maladie) sur écran allumé (SSE) ou appareil en veille (WebPush VAPID).
- **Fichiers Frontend** : `frontend/src/sw.js`, `frontend/src/App.jsx`.
- **Fichiers Backend** : `server.js` (`envoyerNotificationPush`, SSE `/api/events/:id_salon`).
- **Routes API** :
  - `GET /api/events/:id_salon`
  - `GET /api/push/vapid-key`
  - `POST /api/push/subscribe`
- **Services / Modules** : `web-push`, SSE Express.
- **Tables BDD** : `push_subscriptions`, `vapid_keys`.
- **Dépendances Amont** : Clés VAPID valides.
- **Dépendances Aval** : Messagerie, Agenda, Arrêts RH, Robot IA.
- **Tests Recommandés** :
  - Souscription d'un navigateur client et envoi d'un test push.

---

## 19. Avis Clients & Réputation Google

- **Objectif** : Envoyer un SMS de demande d'avis après chaque prestation. Si la note est excellente (4 ou 5 étoiles), redirection vers la fiche Google Business du salon ; si la note est moyenne ou mauvaise (1 à 3 étoiles), ouverture d'un formulaire de recueil interne pour désamorcer l'insatisfaction.
- **Fichiers Frontend** : `frontend/src/AvisPublic.jsx` (route `/avis/:token`).
- **Fichiers Backend** : `server.js`, `services/marketing/marketing.service.js`, `jobs/cronJobs.js` (`executerRobotAvisSatisfaction`).
- **Routes API** :
  - `GET /api/avis/info/:token`
  - `GET /api/avis/stats`
  - `POST /api/avis/:token/stop`
  - `POST /api/avis/:token/note`
  - `POST /api/avis/:token/commentaire`
- **Services / Modules** : `services/marketing/marketing.service.js`, `limiteurAvisPublic`, `jobs/cronJobs.js`.
- **Tables BDD** : `avis_demandes`, `sms_opt_out`, `tickets`, `clients`, `configuration_salon`.
- **Dépendances Amont** : `tickets` (encaissements du jour), `configuration_salon` (lien Google Maps).
- **Dépendances Aval** : Statistiques e-réputation, Notation moyenne dans les fiches employés RH.
- **Interactions** : Respect de la loi avec gestion du lien STOP SMS (insertion dans `sms_opt_out`).
- **Tests Recommandés** :
  - Notation 5 étoiles : vérification de la proposition de redirection Google.
  - Notation 2 étoiles : vérification de la sauvegarde du commentaire interne sans redirection Google.

---

## 20. Marketing Prédictif & SMS Automatisés (Brevo)

- **Objectif** : Détecter automatiquement les clients dont la fréquence de visite habituelle est dépassée (risque de churn) et leur envoyer un SMS personnalisé de relance (winback), ainsi que des rappels de RDV 2 heures avant.
- **Fichiers Frontend** : `frontend/src/Parametres.jsx` (modèles de SMS, quotas).
- **Fichiers Backend** : `server.js`, `services/marketing/marketing.service.js`, `jobs/cronJobs.js` (`executerRobotMarketingEtPredictif`, `executerRobotsSmsAutomatiques`).
- **Routes API** :
  - `POST /api/sms/send`
  - `POST /api/sms/winback`
- **Services / Modules** : `services/marketing/marketing.service.js`, API Brevo HTTP/REST, `normaliserTelephone`.
- **Tables BDD** : `clients`, `rendez_vous`, `sms_opt_out`, `configuration_salon`.
- **Dépendances Amont** : Clé API Brevo configurée, solde SMS.
- **Dépendances Aval** : Agenda, Rétention client.
- **Tests Recommandés** :
  - Test de normalisation du numéro (+33 6... / 06...).
  - Vérification de l'exclusion des clients présents dans `sms_opt_out`.

---

## 21. Robot Comptable Autonome (IA IMAP & Factures OCR)

- **Objectif** : Scruter la boîte mail professionnelle du salon toutes les 10 minutes, télécharger les factures fournisseurs en pièce jointe, extraire les montants HT/TVA/TTC et lignes produits via Groq LLM (modèle vision/texte rapide), et créer une tâche de validation pré-remplie.
- **Fichiers Frontend** : `frontend/src/App.jsx` (modale de validation facture IA, saisie manuelle).
- **Fichiers Backend** : `server.js` (lignes ~6240-6740), `jobs/cronJobs.js` (`executerRobotComptable`).
- **Routes API** :
  - `GET /api/ia/taches`
  - `POST /api/ia/upload-facture`
  - `POST /api/factures/saisie-manuelle`
  - `POST /api/ia/taches/:id/valider`
  - `POST /api/ia/taches/:id/ignorer`
  - `DELETE /api/ia/taches/:id`
  - `GET /api/factures/historique`
- **Services / Modules** : `ImapFlow`, `pdf-parse`, `openai` (Groq API), Cloudflare R2.
- **Tables BDD** : `factures_fournisseurs`, `ia_taches_attente`, `robot_memoire_emails`, `configuration_salon`.
- **Dépendances Amont** : Identifiants IMAP du salon (chiffrés AES-256), Clé Groq/OpenAI.
- **Dépendances Aval** : Liasse comptable, FEC, Stocks (si réassort détecté).
- **Points Sensibles / Risques** :
  - Hallucination potentielle de l'IA sur un montant de TVA : nécessite toujours la validation humaine d'un gérant avant écriture comptable définitive.
- **Tests Recommandés** :
  - Téléversement d'une facture PDF test et vérification du JSON d'extraction retourné par l'IA.

---

## 22. Comptabilité, Liasse Mensuelle & Export FEC

- **Objectif** : Clôturer chaque mois comptable, générer la liasse PDF certifiée (Z de caisse agrégés, ventilation TVA, factures achats), générer le fichier FEC officiel (format DGI 18 colonnes) et l'archive fiscale annuelle scellée.
- **Fichiers Frontend** : `frontend/src/Parametres.jsx` (téléchargement FEC, liasse, validation de fin de mois).
- **Fichiers Backend** : `server.js`, `services/compta/fec.service.js`, `services/compta/archiveFiscale.service.js`, `services/compta/clotureMensuelle.service.js`, `services/pdf/liassePdf.service.js`.
- **Routes API** :
  - `GET /api/export-fec`
  - `GET /api/export-archive-fiscale`
  - `GET /api/export-pdf`
  - `GET /api/export-pdf/:date`
  - `POST /api/compta/valider-mois`
  - `GET /api/compta/statut-mois`
- **Services / Modules** : `pdfkit`, `crypto` (hachage d'archive), `nodemailer` (envoi automatique à l'expert-comptable).
- **Tables BDD** : `liasses_mensuelles_validees`, `clotures_caisse`, `tickets`, `factures_fournisseurs`, `configuration_salon`.
- **Dépendances Amont** : Clôtures Z journalières du mois.
- **Dépendances Aval** : Expert-comptable, Administration fiscale.
- **Points Sensibles / Risques** :
  - **CONFORMITÉ FISCALE DGI** : Format tabulaire strict du FEC (séparateur tabulation, dates AAAAMMJJ, équilibre débit/crédit parfait).
- **Tests Recommandés** :
  - Génération d'un export FEC sur un mois test et vérification du nombre de colonnes et de l'équilibre comptable.

---

## 23. Multi-Établissements & Bascule de Salons

- **Objectif** : Permettre à un propriétaire de plusieurs salons de basculer instantanément de l'un à l'autre sans se reconnecter, et synchroniser le catalogue de prestations/produits sur tous ses établissements en 1 clic.
- **Fichiers Frontend** : `frontend/src/App.jsx` (sélecteur de salon dans l'en-tête, modale de gestion du groupe).
- **Fichiers Backend** : `server.js` (lignes ~4340-4750).
- **Routes API** :
  - `GET /api/mes-salons`
  - `POST /api/mes-salons/creer`
  - `POST /api/mes-salons/switch/:id_salon_cible`
  - `POST /api/mes-salons/synchroniser-catalogue`
- **Services / Modules** : JWT re-signing, `enregistrerJET`.
- **Tables BDD** : `gerants_multi_salons`, `configuration_salon`, `utilisateurs`, `catalogue`.
- **Dépendances Amont** : Authentification gérant.
- **Dépendances Aval** : Tout l'état global du frontend (l'ID salon actif change).
- **Points Sensibles / Risques** :
  - Fuite de données entre salons : isolation absolue via `WHERE id_salon = $1` sur 100% des requêtes SQL de l'application.
- **Tests Recommandés** :
  - Switch vers un salon B : vérification que les tickets du salon A sont inaccessibles.

---

## 24. Abonnement SaaS & Facturation Stripe

- **Objectif** : Gérer les forfaits mensuels de l'application (Essentiel, Pro, Premium), la période d'essai, le paiement via Stripe Checkout, le prélèvement automatique, les changements de forfait et le traitement des webhooks Stripe.
- **Fichiers Frontend** : `frontend/src/PricingModal.jsx`, `frontend/src/Parametres.jsx`.
- **Fichiers Backend** : `server.js` (lignes ~4890-5160), webhook Stripe ligne ~1677.
- **Routes API** :
  - `GET /api/abonnement/etat`
  - `POST /api/creer-checkout`
  - `POST /api/stripe/confirmer-session`
  - `POST /api/abonnement/changer-forfait`
  - `POST /api/abonnement/resilier`
  - `POST /api/abonnement/reactiver`
  - `POST /api/webhooks/`
- **Services / Modules** : `stripe` (Subscriptions, Customers, Webhooks).
- **Tables BDD** : `configuration_salon`.
- **Dépendances Amont** : Clés API Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **Dépendances Aval** : Accès aux fonctionnalités payantes (`verifierPlan`).
- **Points Sensibles / Risques** :
  - Traitement du webhook Stripe (`express.raw({type: 'application/json'})`) : vérification obligatoire de la signature pour bloquer les faux événements.
- **Tests Recommandés** :
  - Souscription d'un forfait en mode test Stripe.

---

## 25. Portail Partenaires & Agents Commerciaux

- **Objectif** : Portail B2B distinct pour les apporteurs d'affaires et agents commerciaux distribuant STACK : suivi des prospects, gestion des parrainages, commissions d'installation, conformité légale agent et gestion du stock physique de TPE Stripe.
- **Fichiers Frontend** : Dépôt séparé `stack-partners-frontend`.
- **Fichiers Backend** : `routes_partners.js` (~3 630 lignes).
- **Routes API** : `/api/partners/*` (38 routes).
- **Services / Modules** : `pg.Pool` dédié, `bcrypt`, `jwt`.
- **Tables BDD** : `partner_agents`, `partner_prospects_reservations`, `partner_attributions_salons`, `partner_commissions`, `partner_factures_installation`, `partner_conformite_dossier`, `partner_stocks_tpe`.
- **Dépendances Amont** : Base PostgreSQL.
- **Dépendances Aval** : Équipement TPE des salons.
- **Points Sensibles / Risques** :
  - Ce fichier instancie actuellement son propre `new Pool()` au lieu d'utiliser le pool partagé de `server.js`.
- **Tests Recommandés** :
  - Connexion agent et attribution d'un salon.

---

## 26. Signature Électronique Contractuelle

- **Objectif** : Soumettre obligatoirement au gérant lors de sa première connexion les CGV et conditions contractuelles, recueillir son consentement éclairé, horodater l'acceptation et sceller une preuve cryptographique infalsifiable (SHA-256) avec génération d'un certificat PDF.
- **Fichiers Frontend** : `frontend/src/PopupLegal.jsx`, `frontend/src/textesLegaux.js`.
- **Fichiers Backend** : `legal.js` (~450 lignes).
- **Routes API** : `/api/legal/*` (gérées via `legal.js`).
- **Services / Modules** : `crypto` (SHA-256), `pdfkit`.
- **Tables BDD** : `acceptations_legales`.
- **Dépendances Amont** : Authentification gérant.
- **Dépendances Aval** : Déblocage de l'accès au tableau de bord.
- **Tests Recommandés** :
  - Connexion d'un compte gérant neuf : la modal `PopupLegal` doit s'afficher et bloquer toute navigation avant signature.

---

## 27. Super-Administration Système

- **Objectif** : Tableau de bord de pilotage technique pour l'éditeur du logiciel : surveillance de la santé des salons, statistiques globales, déclenchement manuel des robots d'arrière-plan, simulation d'avance temporelle (time-travel) pour tester les clôtures et déblocage d'anomalies.
- **Fichiers Frontend** : `frontend/src/App.jsx` (onglet SuperAdmin).
- **Fichiers Backend** : `server.js` (lignes ~7310-7430).
- **Routes API** :
  - `GET /api/superadmin/stats`
  - `GET /api/superadmin/salons`
  - `PUT /api/superadmin/salons/:id/status`
  - `DELETE /api/superadmin/salons/:id`
  - `GET /api/admin/forcer-robot`
  - `GET /api/admin/time-travel/:id_salon`
- **Services / Modules** : `verifierSuperAdmin`.
- **Tables BDD** : Accès global multi-salons.
- **Points Sensibles / Risques** :
  - Droits ultra-élevés : accès strictement restreint par mot de passe et email super-admin.
- **Tests Recommandés** :
  - Tentative d'accès avec un compte gérant classique (doit renvoyer HTTP 403 Forbidden).
