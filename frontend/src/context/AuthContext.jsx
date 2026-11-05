// frontend/src/context/AuthContext.jsx
// Contexte d'authentification, gestion des sessions et rôles (STACK)

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('ui_token') || null);
  const [userRole, setUserRole] = useState(() => {
    const t = localStorage.getItem('ui_token');
    return decodeToken(t)?.role || 'gerant';
  });
  const [legalStatut, setLegalStatut] = useState(null);
  const [isAbonnementInactif, setIsAbonnementInactif] = useState(false);

  // Synchronisation du token et mise à jour du rôle utilisateur
  useEffect(() => {
    if (token) {
      const decoded = decodeToken(token);
      setUserRole(decoded?.role || 'gerant');
    }
  }, [token]);

  // Vérification de l'acceptation des documents légaux contractuels pour le gérant
  useEffect(() => {
    if (!token || decodeToken(token)?.role !== 'gerant') {
      setLegalStatut(null);
      return;
    }

    let annule = false;

    const verifierStatutLegal = async () => {
      try {
        const res = await fetch(`${API_URL}/api/legal/statut`);
        if (res.status === 401 || res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (!data.require_upsell) {
            seDeconnecter();
            return;
          }
        }
        if (res.ok) {
          const data = await res.json();
          if (!annule && data) {
            setLegalStatut(data);
          }
        } else {
          if (!annule) setLegalStatut({ accepte: false, en_attente: true });
        }
      } catch (e) {
        console.error("Impossible de vérifier le statut légal :", e);
      }
    };

    verifierStatutLegal();
    return () => { annule = true; };
  }, [token]);

  const getAuthHeaders = (isJson = false) => {
    const headers = {};
    if (isJson) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const seDeconnecter = () => {
    fetch(`${API_URL}/api/logout`, { method: 'POST' }).catch(e => console.log(e));
    localStorage.removeItem('ui_token');
    localStorage.removeItem('api_token');
    localStorage.removeItem('skip_legal_sandbox');
    setToken(null);
    setIsAbonnementInactif(false);
    setUserRole('gerant');
  };

  const user = useMemo(() => decodeToken(token), [token]);

  const value = {
    token,
    setToken,
    userRole,
    setUserRole,
    user,
    legalStatut,
    setLegalStatut,
    isAbonnementInactif,
    setIsAbonnementInactif,
    getAuthHeaders,
    seDeconnecter
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
