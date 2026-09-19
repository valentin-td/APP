import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import du module PWA
import { registerSW } from 'virtual:pwa-register';

// Enregistrement forcé du Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    // Recharge la page si une nouvelle mise à jour du code est détectée
    if (confirm('Nouvelle mise à jour disponible. Recharger ?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('✅ Le mode hors-ligne est installé et prêt à être utilisé !');
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
