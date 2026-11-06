import { useState, useEffect } from 'react';
import { decodeToken, isTokenExpired } from '../utils/auth';

/**
 * useAuthSession - Hook métier gérant l'authentification (gérant, salon, employé avec code PIN),
 * les tokens JWT (ui_token et token_api), la conformité légale obligatoire NF525 (CGV/Politique),
 * la réinitialisation de mot de passe et le paiement Stripe (Reverse Trial).
 */
export const useAuthSession = ({
  API_URL,
  setActiveTab = () => {},
  showToast = () => {},
  socket = null
}) => {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('ui_token') || localStorage.getItem('token');
    if (saved && isTokenExpired(saved)) {
      localStorage.removeItem('ui_token');
      localStorage.removeItem('api_token');
      localStorage.removeItem('token');
      localStorage.removeItem('token_api');
      return null;
    }
    return saved;
  });
  const [userRole, setUserRole] = useState(() => {
    const saved = localStorage.getItem('ui_token');
    return saved ? decodeToken(saved)?.role || 'gerant' : 'gerant';
  });
  const [isAbonnementInactif, setIsAbonnementInactif] = useState(false);
  const [legalStatut, setLegalStatut] = useState(null);

  // Formulaire d'authentification
  const [loginType, setLoginType] = useState('gerant'); // 'gerant' | 'salon' | 'employe'
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [motDePasseInput, setMotDePasseInput] = useState('');
  const [nomSalonInput, setNomSalonInput] = useState('');
  const [codePartenaireInput, setCodePartenaireInput] = useState('');
  const [prenomGerantInput, setPrenomGerantInput] = useState('');
  const [nomFamilleGerantInput, setNomFamilleGerantInput] = useState('');
  const [idSalonInput, setIdSalonInput] = useState('');
  const [nomEmployeInput, setNomEmployeInput] = useState('');
  const [pinEmployeInput, setPinEmployeInput] = useState('');
  const [pinSalonInput, setPinSalonInput] = useState('');
  const [siretInput, setSiretInput] = useState('');
  const [adresseSalonInput, setAdresseSalonInput] = useState('');
  const [erreurLogin, setErreurLogin] = useState(null);
  const [msgSucces, setMsgSucces] = useState(null);

  // Réinitialisation de mot de passe par URL
  const urlParams = new URLSearchParams(window.location.search);
  const [resetTokenUrl] = useState(urlParams.get('resetToken'));
  const [newPassword, setNewPassword] = useState('');

  // Plan Stripe Onboarding
  const [planEmpreinteOnboarding, setPlanEmpreinteOnboarding] = useState('PREMIUM');

  // Acceptation des documents contractuels : vérifiée à chaque connexion du gérant
  useEffect(() => {
    if (!token || decodeToken(token)?.role !== 'gerant') {
      setLegalStatut(null);
      return;
    }

    let annule = false;

    const verifierStatutLegal = async () => {
      try {
        const res = await fetch(`${API_URL}/api/legal/statut`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('api_token') || token}`
          },
          credentials: 'include'
        });
        if (res.ok && !annule) {
          const data = await res.json();
          setLegalStatut(data);
        }
      } catch (e) {
        if (!annule) {
          setLegalStatut({ accepte: true, en_attente: false });
        }
      }
    };

    verifierStatutLegal();

    return () => {
      annule = true;
    };
  }, [token, API_URL]);

  const sInscrire = async () => {
    if (!isLoginMode) {
      if (!prenomGerantInput.trim() || !nomFamilleGerantInput.trim()) {
        return setErreurLogin('Veuillez remplir les DEUX cases (Prénom et Nom de famille).');
      }

      if (motDePasseInput.length < 8) {
        return setErreurLogin('Le mot de passe doit contenir au moins 8 caractères.');
      }
      const passwordSimple = motDePasseInput.toLowerCase();
      if (
        /^(1234|azerty|qwerty|password|motdepasse)/.test(passwordSimple) ||
        /^(\w)\1+$/.test(passwordSimple) ||
        '0123456789'.includes(passwordSimple) ||
        '9876543210'.includes(passwordSimple)
      ) {
        return setErreurLogin('Mot de passe trop faible ou suite logique détectée. Sécurisez-le.');
      }
    }

    try {
      const nomCompletGerant = `${prenomGerantInput.trim()} ${nomFamilleGerantInput.trim()}`;
      const searchParams = new URLSearchParams(window.location.search);
      const code_partenaire = codePartenaireInput.trim() || searchParams.get('partner') || undefined;
      const siret_url = searchParams.get('siret') || undefined;

      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          mot_de_passe: motDePasseInput,
          nom_salon: nomSalonInput,
          nom_gerant: nomCompletGerant,
          code_partenaire: code_partenaire,
          siret: siret_url
        })
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('ui_token', data.ui_token);
        if (data.token_api) localStorage.setItem('api_token', data.token_api);

        setToken(data.ui_token);
        setErreurLogin(null);

        const decoded = decodeToken(data.ui_token);
        setUserRole(decoded?.role || 'gerant');
        setIsAbonnementInactif(false);

        setTimeout(() => {
          setLegalStatut({ accepte: false, en_attente: true });
        }, 100);
      } else {
        setErreurLogin(data.erreur);
      }
    } catch (e) {
      console.error("Détails du crash d'inscription :", e);
      setErreurLogin(`Erreur technique : ${e.message}`);
    }
  };

  const seConnecter = async () => {
    try {
      const endpoint =
        loginType === 'employe'
          ? `${API_URL}/api/employes/login-pin`
          : loginType === 'salon'
          ? `${API_URL}/api/salon/login-pin`
          : `${API_URL}/api/login`;
      const payload =
        loginType === 'employe'
          ? { id_salon: idSalonInput, nom_employe: nomEmployeInput, code_pin: pinEmployeInput }
          : loginType === 'salon'
          ? { id_salon: idSalonInput, pin: pinSalonInput }
          : { email: emailInput, mot_de_passe: motDePasseInput };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('ui_token', data.ui_token);
        if (data.token_api) localStorage.setItem('api_token', data.token_api);
        setToken(data.ui_token);
        setErreurLogin(null);
        const decoded = decodeToken(data.ui_token);
        setUserRole(decoded?.role || 'gerant');
        setIsAbonnementInactif(false);
        if (decoded?.role === 'employe') {
          setActiveTab('agenda');
        } else {
          setActiveTab('accueil');
        }
      } else {
        setErreurLogin(data.erreur);
      }
    } catch (e) {
      setErreurLogin('Mode hors-ligne ou erreur de connexion.');
    }
  };

  const motDePasseOublie = async () => {
    try {
      const res = await fetch(`${API_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput })
      });
      const data = await res.json();
      setMsgSucces(data.message);
      setErreurLogin(null);
    } catch (e) {
      console.error('Détails du crash de mot de passe oublié :', e);
      setErreurLogin(`Erreur technique : ${e.message}`);
    }
  };

  const seDeconnecter = () => {
    fetch(`${API_URL}/api/logout`, { method: 'POST' }).catch((e) => console.log(e));
    localStorage.removeItem('ui_token');
    localStorage.removeItem('api_token');
    localStorage.removeItem('token');
    localStorage.removeItem('token_api');
    localStorage.removeItem('skip_legal_sandbox');
    setToken(null);
    setIsAbonnementInactif(false);
    setUserRole('gerant');
    if (socket) socket.disconnect();
  };

  useEffect(() => {
    const handleSessionExpiree = () => {
      seDeconnecter();
    };
    window.addEventListener('session_expiree', handleSessionExpiree);
    return () => window.removeEventListener('session_expiree', handleSessionExpiree);
  }, []);

  const lancerPaiementStripe = async (planChoisi = 'PREMIUM') => {
    try {
      const planFinal = typeof planChoisi === 'string' ? planChoisi : planEmpreinteOnboarding;
      const res = await fetch(`${API_URL}/api/creer-checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: planFinal })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.erreur || 'Erreur lors de la création du lien Stripe.', 'error');
      }
    } catch (e) {
      showToast('Erreur réseau avec Stripe.', 'error');
    }
  };

  return {
    token,
    setToken,
    userRole,
    setUserRole,
    isAbonnementInactif,
    setIsAbonnementInactif,
    legalStatut,
    setLegalStatut,
    loginType,
    setLoginType,
    isForgotPassword,
    setIsForgotPassword,
    isLoginMode,
    setIsLoginMode,
    emailInput,
    setEmailInput,
    motDePasseInput,
    setMotDePasseInput,
    nomSalonInput,
    setNomSalonInput,
    codePartenaireInput,
    setCodePartenaireInput,
    prenomGerantInput,
    setPrenomGerantInput,
    nomFamilleGerantInput,
    setNomFamilleGerantInput,
    idSalonInput,
    setIdSalonInput,
    nomEmployeInput,
    setNomEmployeInput,
    pinEmployeInput,
    setPinEmployeInput,
    pinSalonInput,
    setPinSalonInput,
    siretInput,
    setSiretInput,
    adresseSalonInput,
    setAdresseSalonInput,
    erreurLogin,
    setErreurLogin,
    msgSucces,
    setMsgSucces,
    resetTokenUrl,
    newPassword,
    setNewPassword,
    planEmpreinteOnboarding,
    setPlanEmpreinteOnboarding,
    sInscrire,
    seConnecter,
    motDePasseOublie,
    seDeconnecter,
    lancerPaiementStripe
  };
};

export default useAuthSession;
