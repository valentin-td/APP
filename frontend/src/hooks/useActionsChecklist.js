import { useState, useEffect } from 'react';

/**
 * useActionsChecklist - Hook gérant la checklist Go-Live de démarrage du salon,
 * la campagne SMS de sauvetage client (winback), le centre de tâches/to-do list,
 * la fusion/dédoublonnage de stocks et les filtres RH.
 */
export const useActionsChecklist = ({
  token,
  userRole,
  decodeToken = () => ({}),
  activeTab,
  API_URL,
  getAuthHeaders = () => ({}),
  showToast = () => {},
  chargerTout = () => {}
}) => {
  // Checklist Go-Live
  const [checklistOnboarding, setChecklistOnboarding] = useState({
    etape_materiel_ok: false,
    etape_catalogue_ok: false,
    etape_equipe_ok: false,
    etape_stripe_ok: false,
    etape_formation_ok: false,
    statut_onboarding: 'EN_COURS'
  });
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // Sauvetage Client (Winback)
  const [sauvetageClient, setSauvetageClient] = useState(null);
  const [smsSauvetage, setSmsSauvetage] = useState('');
  const [remiseSauvetage, setRemiseSauvetage] = useState('');

  // Centre d'action & Tâches
  const [tachesListe, setTachesListe] = useState([]);
  const [nouvelleTache, setNouvelleTache] = useState({ titre: '', description: '', date_echeance: '' });

  // Fusion de stocks
  const [isStockMergeMode, setIsStockMergeMode] = useState(false);
  const [selectedStocksToMerge, setSelectedStocksToMerge] = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeForm, setMergeForm] = useState({
    nom: '',
    reference: '',
    prix: '',
    type_article: 'PRODUIT_REVENTE',
    delai_livraison_jours: 3,
    id_employe: '',
    code_pin: ''
  });

  // Filtres RH
  const [rhSortBy, setRhSortBy] = useState('ca');
  const [rhPeriodeHeures, setRhPeriodeHeures] = useState('mois');
  const [rhAvisExpanded, setRhAvisExpanded] = useState({});

  // Chargement automatique du verrou Go-Live
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/onboarding/checklist`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('api_token') || token}`,
        'Content-Type': 'application/json'
      }
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.statut_onboarding) {
          setChecklistOnboarding(data);
        }
      })
      .catch(() => {});
  }, [token, activeTab]);

  const basculerEtapeChecklist = async (champ) => {
    const nextState = { ...checklistOnboarding, [champ]: !checklistOnboarding[champ] };
    const toutCoche = Boolean(
      nextState.etape_materiel_ok &&
        nextState.etape_catalogue_ok &&
        nextState.etape_equipe_ok &&
        nextState.etape_stripe_ok &&
        nextState.etape_formation_ok
    );
    nextState.statut_onboarding = toutCoche ? 'TERMINE' : 'EN_COURS';
    setChecklistOnboarding(nextState);

    try {
      const res = await fetch(`${API_URL}/api/onboarding/checklist`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      if (res.ok) {
        const saved = await res.json();
        setChecklistOnboarding(saved);
        if (saved.statut_onboarding === 'TERMINE') {
          showToast('Checklist Go-Live complétée à 100 % ! Votre caisse est déverrouillée.');
        }
      }
    } catch (e) {}
  };

  const envoyerSmsSauvetage = async () => {
    if (!sauvetageClient) return;
    try {
      const res = await fetch(`${API_URL}/api/sms/winback`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          id_client: sauvetageClient.id_client,
          telephone: sauvetageClient.telephone,
          message: smsSauvetage,
          remise_winback: remiseSauvetage
        })
      });
      if (res.ok) {
        showToast('Offre de sauvetage envoyée et enregistrée !', 'success');
        setSauvetageClient(null);
        setRemiseSauvetage('');
        chargerTout();
      } else {
        const data = await res.json();
        showToast(data.erreur || "Erreur d'envoi", 'error');
      }
    } catch (e) {
      showToast('Erreur réseau', 'error');
    }
  };

  const getCouleurTache = (tache) => {
    if (!tache) return '#f59e0b';
    if (tache.statut === 'FAIT') return 'var(--color-success)';
    if (!tache.date_echeance) return '#f59e0b';
    const joursRestants = (new Date(tache.date_echeance) - new Date()) / (1000 * 60 * 60 * 24);
    if (joursRestants <= 2) return 'var(--color-danger)';
    return '#f59e0b';
  };

  const nbTachesUrgentes = (tachesListe || []).filter(t => {
    const prop = t.proprietaire || 'gerant';
    const isUrgent = t.statut === 'A_FAIRE' && (!t.date_echeance || (new Date(t.date_echeance) - new Date()) / (1000 * 60 * 60 * 24) <= 2);
    if (!isUrgent) return false;
    
    if (userRole === 'gerant') return true; // Le gérant est alerté de toutes les urgences
    if (userRole === 'employe') return prop === `emp_${decodeToken(token)?.id_employe}` || prop === 'salon';
    return prop === userRole || prop === 'salon';
  }).length;

  return {
    checklistOnboarding,
    setChecklistOnboarding,
    showChecklistModal,
    setShowChecklistModal,
    basculerEtapeChecklist,
    sauvetageClient,
    setSauvetageClient,
    smsSauvetage,
    setSmsSauvetage,
    remiseSauvetage,
    setRemiseSauvetage,
    envoyerSmsSauvetage,
    tachesListe,
    setTachesListe,
    nouvelleTache,
    setNouvelleTache,
    isStockMergeMode,
    setIsStockMergeMode,
    selectedStocksToMerge,
    setSelectedStocksToMerge,
    showMergeModal,
    setShowMergeModal,
    mergeForm,
    setMergeForm,
    rhSortBy,
    setRhSortBy,
    rhPeriodeHeures,
    setRhPeriodeHeures,
    rhAvisExpanded,
    setRhAvisExpanded,
    getCouleurTache,
    nbTachesUrgentes
  };
};

export default useActionsChecklist;
