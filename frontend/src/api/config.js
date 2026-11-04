// frontend/src/api/config.js
// Configuration centralisée de l'API STACK
// - En développement local : bascule automatiquement sur http://localhost:3000 si non configuré
// - En production : utilise VITE_API_URL ou fallback sur Render

const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_URL = import.meta.env.VITE_API_URL || 
  (isLocalhost ? 'http://localhost:3000' : 'https://api-salon-backend.onrender.com');

export default API_URL;
