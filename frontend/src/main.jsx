import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import du module PWA
import { registerSW } from 'virtual:pwa-register';

// PREUVE DE BUILD : si vous ne voyez PAS cette ligne dans la console juste
// après un déploiement + reload, c'est que le navigateur exécute encore un
// ancien bundle (Service Worker qui sert du cache périmé) — pas la peine de
// chercher un bug plus loin tant que cette ligne n'apparaît pas.
console.log(
  '%c🚀 main.jsx chargé — build du ' + new Date().toLocaleString(),
  'color: #ff9900; font-weight: bold; font-size: 14px'
);

// `immediate: true` : le SW s'enregistre dès l'exécution du script, sans
// attendre l'évènement `load`.
const updateSW = registerSW({
  immediate: true,

  // ANCIEN COMPORTEMENT (bloquant) : on attendait un confirm() du gérant
  // pour appliquer une mise à jour. Si cette popup passe inaperçue ou est
  // fermée sans cliquer "OK", l'app reste bloquée sur l'ancien code POUR
  // TOUJOURS, même après 50 rechargements — c'était la cause du bug de ces
  // derniers échanges : aucun de nos correctifs ne s'exécutait jamais.
  //
  // NOUVEAU COMPORTEMENT : on applique la mise à jour immédiatement et
  // automatiquement, sans demander confirmation. Pour un logiciel de caisse
  // utilisé au quotidien, mieux vaut un reload silencieux et rapide qu'un
  // gérant qui reste bloqué sur une vieille version sans le savoir.
  onNeedRefresh() {
    console.log('%c🔄 Nouvelle version détectée, application immédiate...', 'color: #ff0000; font-weight: bold;');
    updateSW(true);
  },

  onOfflineReady() {
    console.log('✅ Le mode hors-ligne est installé et prêt à être utilisé !');
  },

  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    // Le poste de caisse reste souvent ouvert toute la journée : on force
    // une vérification de mise à jour toutes les 15 minutes, plutôt que de
    // dépendre uniquement d'un reload manuel pour la détecter.
    setInterval(() => {
      registration.update().catch(() => {});
    }, 15 * 60 * 1000);
  },

  onRegisterError(error) {
    console.error("Erreur d'enregistrement du Service Worker :", error);
  },
});

window.addEventListener('error', (e) => {
  console.error('Erreur globale non interceptée :', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promesse rejetée non interceptée :', e.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
