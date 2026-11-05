import { useState, useEffect } from 'react';
import localforage from 'localforage';

/**
 * useClotureZ - Hook métier gérant la clôture journalière Z de caisse NF525,
 * la calculatrice d'espèces / Blind Close, la régularisation matinale,
 * la détection des écarts de caisse avec justification obligatoire,
 * et les rappels / bandeaux d'alerte de fermeture.
 */
export const useClotureZ = ({
  token,
  userRole,
  configSalon,
  employesListe = [],
  isOffline = false,
  showToast = () => {},
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  chargerTout = () => {},
  API_URL,
  decodeToken = () => ({}),
  syncOfflineTickets = async () => {},
  chargerMouvementsCaisse = () => {},
  appliquerRetourPinLocal = () => {},
  setErreurPinAction = () => {}
}) => {
  const [zDialogOuvert, setZDialogOuvert] = useState(false);
  const [zEmployeSelect, setZEmployeSelect] = useState('');
  const [zCodePin, setZCodePin] = useState('');

  // États pour la calculatrice de caisse (Blind Close)
  const [compteCaisse, setCompteCaisse] = useState({
    b500: '',
    b200: '',
    b100: '',
    b50: '',
    b20: '',
    b10: '',
    b5: '',
    p2: '',
    p1: '',
    p050: '',
    p020: '',
    p010: '',
    p005: '',
    p002: '',
    p001: ''
  });
  const [fondCaisseMatin, setFondCaisseMatin] = useState('');
  const [ecartDetecte, setEcartDetecte] = useState(null);
  const [justificationEcart, setJustificationEcart] = useState('');

  // Rappel de clôture journalière (bandeau)
  const [clotureFaiteAujourdhui, setClotureFaiteAujourdhui] = useState(true);
  const [heureActuelle, setHeureActuelle] = useState(new Date());
  const [clotureAutoInfo, setClotureAutoInfo] = useState(null);
  const [alertesFermees, setAlertesFermees] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('alertesFermees')) || {};
    } catch (e) {
      return {};
    }
  });

  // Garde-Fou : Régularisation Matinale (Blind Close)
  const [reguCloture, setReguCloture] = useState(null);
  const [reguMontant, setReguMontant] = useState('');
  const [reguEmployeId, setReguEmployeId] = useState('');
  const [reguCodePin, setReguCodePin] = useState('');

  const calculerTotalCaisseReel = () => {
    return (
      (parseInt(compteCaisse.b500) || 0) * 500 +
      (parseInt(compteCaisse.b200) || 0) * 200 +
      (parseInt(compteCaisse.b100) || 0) * 100 +
      (parseInt(compteCaisse.b50) || 0) * 50 +
      (parseInt(compteCaisse.b20) || 0) * 20 +
      (parseInt(compteCaisse.b10) || 0) * 10 +
      (parseInt(compteCaisse.b5) || 0) * 5 +
      (parseInt(compteCaisse.p2) || 0) * 2 +
      (parseInt(compteCaisse.p1) || 0) * 1 +
      (parseInt(compteCaisse.p050) || 0) * 0.5 +
      (parseInt(compteCaisse.p020) || 0) * 0.2 +
      (parseInt(compteCaisse.p010) || 0) * 0.1 +
      (parseInt(compteCaisse.p005) || 0) * 0.05 +
      (parseInt(compteCaisse.p002) || 0) * 0.02 +
      (parseInt(compteCaisse.p001) || 0) * 0.01
    );
  };

  const demanderZDeCaisse = () => {
    const currentRole = decodeToken(token)?.role || userRole;
    setZEmployeSelect(currentRole === 'gerant' ? 'gerant' : '');
    setZCodePin('');
    setErreurPinAction(null);
    setCompteCaisse({
      b500: '',
      b200: '',
      b100: '',
      b50: '',
      b20: '',
      b10: '',
      b5: '',
      p2: '',
      p1: '',
      p050: '',
      p020: '',
      p010: '',
      p005: '',
      p002: '',
      p001: ''
    });
    setFondCaisseMatin('');
    setEcartDetecte(null);
    setJustificationEcart('');
    setZDialogOuvert(true);
  };

  const executerZDeCaisse = async (employeNom) => {
    if (isOffline || !navigator.onLine) {
      setZDialogOuvert(false);
      return showToast('Impossible de sceller la caisse sans réseau.', 'error');
    }
    if (fondCaisseMatin === '' || isNaN(fondCaisseMatin))
      return showToast('Le fond de caisse du matin est obligatoire.', 'error');
    if (userRole === 'salon' && configSalon?.securite_pin_salon_active !== false) {
      if (!employeNom) return showToast('Veuillez sélectionner le collaborateur qui clôture la caisse.', 'error');
      if (!zCodePin || zCodePin.trim().length < 4)
        return showToast('Veuillez saisir votre code PIN personnel pour sceller la clôture.', 'error');
    }

    const totalReel = calculerTotalCaisseReel();
    let data = {};

    try {
      let enAttente = [];
      try {
        enAttente = (await localforage.getItem('offline_tickets')) || [];
      } catch (storageErr) {
        console.warn('Stockage local indisponible :', storageErr);
      }

      if (enAttente.length > 0) {
        try {
          await syncOfflineTickets();
        } catch (e) {}
        let reste = [];
        try {
          reste = (await localforage.getItem('offline_tickets')) || [];
        } catch (e) {}
        if (reste.length > 0) {
          setZDialogOuvert(false);
          return showToast(`${reste.length} ticket(s) hors-ligne à synchroniser avant la clôture.`, 'error');
        }
      }

      const empObj = (employesListe || []).find(
        (e) =>
          e.nom === employeNom ||
          String(e.id_employe) === String(employeNom) ||
          (String(employeNom).toLowerCase() === 'gerant' && e.est_gerant)
      );
      const payload = {
        ferme_par: empObj ? empObj.nom : employeNom === 'gerant' ? 'Gérant' : employeNom || 'Gérant',
        id_employe: empObj ? empObj.id_employe : employeNom === 'gerant' ? 'gerant' : undefined,
        code_pin: zCodePin || undefined,
        fond_caisse_matin: parseFloat(fondCaisseMatin),
        total_especes_reel: totalReel,
        justification_ecart: justificationEcart
      };

      const res = await fetch(`${API_URL}/api/caisse/cloture`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload)
      });
      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.require_justification) {
          setErreurPinAction(null);
          setEcartDetecte(data.ecart);
          showToast(data.erreur || 'Écart de caisse détecté : veuillez saisir une justification ci-dessous.', 'error');
          return;
        }
        if (data.require_pin) {
          appliquerRetourPinLocal(employeNom, data);
          setErreurPinAction(data.erreur || 'Code PIN incorrect.');
        }
        throw new Error(data.erreur || 'Erreur de clôture.');
      }

      setErreurPinAction(null);
      setZDialogOuvert(false);
      showToast(data.message, 'success');
      setClotureFaiteAujourdhui(true);
      setZEmployeSelect('');
      setZCodePin('');
      if (typeof chargerTout === 'function') chargerTout();
    } catch (e) {
      if (typeof chargerTout === 'function') chargerTout();
      setZCodePin('');
      showToast(e.message || 'Erreur lors de la clôture.', 'error');
    }
  };

  const verifierRegularisationMatinale = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/caisse/verification-matinale`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.necessite_regularisation) {
        setReguCloture(data.cloture);
      } else {
        setReguCloture(null);
      }
    } catch (e) {}
  };

  const soumettreRegularisation = async () => {
    if (!reguMontant || isNaN(reguMontant)) return showToast('Veuillez saisir le montant réel.', 'error');
    const currentRole = decodeToken(token)?.role;
    if (currentRole === 'salon' && configSalon?.securite_pin_salon_active !== false) {
      if (!reguEmployeId) return showToast('Veuillez sélectionner le collaborateur qui ouvre la caisse.', 'error');
      if (!reguCodePin || reguCodePin.trim().length < 4)
        return showToast('Veuillez saisir votre code PIN personnel.', 'error');
    }
    try {
      const payload = {
        id_cloture: reguCloture.id_cloture,
        montant_reel: parseFloat(reguMontant),
        id_employe: currentRole === 'employe' ? decodeToken(token).id_employe : reguEmployeId || null,
        code_pin: currentRole === 'salon' ? reguCodePin : undefined
      };
      const res = await fetch(`${API_URL}/api/caisse/regulariser`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload)
      });
      await handleFetchError(res);
      showToast('Caisse ouverte et régularisée !', 'success');
      setReguCloture(null);
      setReguMontant('');
      setReguEmployeId('');
      setReguCodePin('');
      if (typeof chargerMouvementsCaisse === 'function') chargerMouvementsCaisse();
    } catch (e) {
      setReguCodePin('');
      showToast(e.message, 'error');
    }
  };

  const fermerAlerte = (cle) => {
    const next = { ...alertesFermees, [cle]: true };
    setAlertesFermees(next);
    localStorage.setItem('alertesFermees', JSON.stringify(next));
  };

  const verifierStatutCloture = async () => {
    if (decodeToken(token)?.role !== 'gerant') return;
    try {
      const res = await fetch(`${API_URL}/api/caisse/cloture/statut`, { headers: getAuthHeaders() });
      const data = await handleFetchError(res);
      setClotureFaiteAujourdhui(!!data.cloture_faite);
      if (data.derniere_cloture_auto) setClotureAutoInfo(data.derniere_cloture_auto);
    } catch (e) {}
  };

  useEffect(() => {
    if (!token) return;
    verifierStatutCloture();
    verifierRegularisationMatinale();
    const intervalStatut = setInterval(verifierStatutCloture, 5 * 60 * 1000);
    const intervalHorloge = setInterval(() => setHeureActuelle(new Date()), 60 * 1000);
    return () => {
      clearInterval(intervalStatut);
      clearInterval(intervalHorloge);
    };
  }, [token]);

  const afficherRappelCloture = (() => {
    if (decodeToken(token)?.role !== 'gerant' || clotureFaiteAujourdhui) return false;
    const heureFermeture = parseFloat(configSalon?.heure_fermeture) || 20;
    const minutesFermeture = heureFermeture * 60;
    const minutesActuelles = heureActuelle.getHours() * 60 + heureActuelle.getMinutes();
    return minutesActuelles >= minutesFermeture - 30;
  })();

  return {
    zDialogOuvert,
    setZDialogOuvert,
    zEmployeSelect,
    setZEmployeSelect,
    zCodePin,
    setZCodePin,
    compteCaisse,
    setCompteCaisse,
    fondCaisseMatin,
    setFondCaisseMatin,
    ecartDetecte,
    setEcartDetecte,
    justificationEcart,
    setJustificationEcart,
    calculerTotalCaisseReel,
    demanderZDeCaisse,
    executerZDeCaisse,
    clotureFaiteAujourdhui,
    setClotureFaiteAujourdhui,
    heureActuelle,
    setHeureActuelle,
    clotureAutoInfo,
    setClotureAutoInfo,
    alertesFermees,
    setAlertesFermees,
    reguCloture,
    setReguCloture,
    reguMontant,
    setReguMontant,
    reguEmployeId,
    setReguEmployeId,
    reguCodePin,
    setReguCodePin,
    verifierRegularisationMatinale,
    soumettreRegularisation,
    fermerAlerte,
    verifierStatutCloture,
    afficherRappelCloture
  };
};

export default useClotureZ;
