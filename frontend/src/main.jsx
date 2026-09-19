import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import du module PWA
import { registerSW } from 'virtual:pwa-register';

// `immediate: true` déclenche l'enregistrement du Service Worker dès
// l'exécution de ce script, sans attendre l'évènement `load` de la fenêtre.
// Plus le SW est actif tôt, plus vite il peut prendre le contrôle de l'onglet
// (avec skipWaiting/clientsClaim côté vite.config.js) et servir le fallback
// hors-ligne dès le prochain reload — y compris le tout premier après
// l'installation sur le poste de caisse.
const updateSW = registerSW({
  immediate: true,

  onNeedRefresh() {
    // Recharge la page si une nouvelle mise à jour du code est détectée
    if (confirm('Nouvelle mise à jour disponible. Recharger ?')) {
      updateSW(true);
    }
  },

  onOfflineReady() {
    console.log('✅ Le mode hors-ligne est installé et prêt à être utilisé !');
  },

  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    // L'app reste souvent ouverte toute la journée sur le poste de caisse :
    // on force une vérification de mise à jour du SW toutes les heures,
    // plutôt que de dépendre uniquement des reloads/navigations.
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);
  },

  onRegisterError(error) {
    console.error("Erreur d'enregistrement du Service Worker :", error);
  },
});

// Filet de sécurité : une exception JS non interceptée pendant le rendu
// (ex: accès réseau non catché ailleurs) ne doit pas se traduire par un
// écran blanc totalement silencieux. Ça ne remplace pas une vraie
// Error Boundary React, mais ça garantit une trace exploitable.
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
