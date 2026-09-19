import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Import du module hors-ligne (Service Worker)
import { registerSW } from 'virtual:pwa-register';

// Lancement immédiat de la mise en cache de l'application
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
