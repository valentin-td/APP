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
    return originalFetch(resource, config);
  };

  interceptorInstalled = true;
}

// Installation automatique dès l'import
setupFetchInterceptor();
