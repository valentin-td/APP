import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 📡 INSTALLATION DU SERVICE WORKER (NOTIFICATIONS PUSH)
// On enregistre le nouveau SW dédié uniquement aux notifications push (pas de mise en cache offline agressive)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker enregistré pour les Push Notifications. Scope:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Échec de l\'enregistrement du Service Worker:', error);
      });
  });
}

// Filet de sécurité classique
window.addEventListener('error', (e) => {
  console.error('Erreur globale :', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promesse rejetée :', e.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
