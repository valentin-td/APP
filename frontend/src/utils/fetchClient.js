// frontend/src/utils/fetchClient.js
// Intercepteur global pour inclure automatiquement le Cookie httpOnly et le token API

import { API_URL } from '../api/config';

let interceptorInstalled = false;

export function setupFetchInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let [resource, config] = args;
    if (
      typeof resource === 'string' &&
      (resource.includes('api-salon-backend.onrender.com') || (API_URL && resource.startsWith(API_URL)))
    ) {
      config = config || {};
      config.credentials = 'include';
      const tokenApi = localStorage.getItem('api_token');
      if (tokenApi) {
        config.headers = {
          ...(config.headers || {}),
          Authorization: `Bearer ${tokenApi}`
        };
      }
    }
    const response = await originalFetch(resource, config);

    // Détection globale d'expiration de session sur l'API backend
    if (
      response.status === 401 &&
      typeof resource === 'string' &&
      !resource.includes('/api/login') &&
      !resource.includes('/api/employe-login') &&
      !resource.includes('/api/public/client/login') &&
      !resource.includes('/api/partner/login')
    ) {
      localStorage.removeItem('ui_token');
      localStorage.removeItem('api_token');
      localStorage.removeItem('token');
      localStorage.removeItem('token_api');
      window.dispatchEvent(new CustomEvent('session_expiree'));
    }

    return response;
  };

  interceptorInstalled = true;
}

// Installation automatique dès l'import
setupFetchInterceptor();
