// frontend/src/utils/auth.js
// Utilitaires d'authentification et de sécurité frontend (STACK)

/**
 * Transforme la clé publique VAPID en Uint8Array pour le navigateur (WebPush)
 */
export function urlBase64ToUint8Array(base64String) { 
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Décode un token JWT ou UI-token sans bibliothèque externe (compatible UTF-8)
 */
export const decodeToken = (t) => { 
  if (!t || !t.includes('.')) return null;
  try { 
    let base64Url = t.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const jsonPayload = decodeURIComponent(
      atob(base64 + padding)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload); 
  } catch(e) { 
    return null; 
  } 
};

/**
 * Vérifie si un token JWT est expiré ou invalide
 */
export const isTokenExpired = (t) => {
  if (!t || typeof t !== 'string') return true;
  const decoded = decodeToken(t);
  if (!decoded) return true;
  if (!decoded.exp) return false;
  // Marge de 10 secondes pour anticiper l'expiration
  return (decoded.exp * 1000) <= (Date.now() + 10000);
};

/**
 * Détecte les codes PIN trop faibles (séquentiels ou répétitifs) selon les règles de conformité
 */
export const isPinWeak = (pin) => {
  if (!pin) return false;
  const strPin = String(pin);
  const repeating = /^(\d)\1+$/.test(strPin);
  const sequentialUp = '0123456789'.includes(strPin);
  const sequentialDown = '9876543210'.includes(strPin);
  return repeating || sequentialUp || sequentialDown;
};
