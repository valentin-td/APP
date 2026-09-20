import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 🚨 DESTRUCTION TOTALE DU MODE HORS-LIGNE (PWA) 🚨
// Ce script traque et désinstalle tous les anciens Service Workers 
// qui bloquaient les mises à jour et les connexions en direct.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
      console.log("💀 Ancien cache hors-ligne (PWA) détruit !");
    }
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
