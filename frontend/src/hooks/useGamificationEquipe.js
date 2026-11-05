import { useState, useEffect } from 'react';

/**
 * useGamificationEquipe - Hook gérant la gamification, les paliers de récompense,
 * les objectifs d'équipe RH, et les KPIs individuels des collaborateurs.
 */
export const useGamificationEquipe = ({
  token,
  userRole,
  activeTab,
  API_URL,
  showToast = () => {}
}) => {
  const [empGamificationKpis, setEmpGamificationKpis] = useState(null);
  const [objectifsEquipeListe, setObjectifsEquipeListe] = useState([]);
  const [showAddObjectifModal, setShowAddObjectifModal] = useState(false);
  const [newObjectifForm, setNewObjectifForm] = useState({
    titre: '',
    type_indicateur: 'TAUX_REVENTE',
    valeur_cible: '20',
    id_employe: 'TOUS',
    recompense: ''
  });

  const chargerObjectifsEquipe = async () => {
    try {
      const res = await fetch(`${API_URL}/api/equipe/objectifs`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('api_token') || token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setObjectifsEquipeListe(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Erreur chargement objectifs équipe', e);
    }
  };

  const chargerKpisEmploye = async () => {
    try {
      const res = await fetch(`${API_URL}/api/employes/gamification-kpis`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('api_token') || token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) setEmpGamificationKpis(data);
      }
    } catch (e) {}
  };

  // Synchronisation automatique selon le rôle et l'onglet actif
  useEffect(() => {
    if (userRole === 'employe' && token && activeTab === 'accueil') {
      chargerKpisEmploye();
    }
    if (userRole === 'gerant' && token && activeTab === 'rh') {
      chargerObjectifsEquipe();
    }
  }, [userRole, token, activeTab]);

  const creerObjectifEquipe = async () => {
    if (!newObjectifForm.titre.trim() || !newObjectifForm.valeur_cible) {
      return showToast('Veuillez renseigner un intitulé et une valeur cible.', 'error');
    }
    try {
      const res = await fetch(`${API_URL}/api/equipe/objectifs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`
        },
        body: JSON.stringify(newObjectifForm)
      });
      if (res.ok) {
        showToast("Objectif enregistré pour l'équipe.", 'success');
        setShowAddObjectifModal(false);
        setNewObjectifForm({
          titre: '',
          type_indicateur: 'TAUX_REVENTE',
          valeur_cible: '20',
          id_employe: 'TOUS',
          recompense: ''
        });
        chargerObjectifsEquipe();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.erreur || 'Erreur lors de la création.', 'error');
      }
    } catch (e) {
      showToast('Erreur réseau.', 'error');
    }
  };

  const supprimerObjectifEquipe = async (idObj) => {
    try {
      const res = await fetch(`${API_URL}/api/equipe/objectifs/${idObj}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('api_token') || token}` }
      });
      if (res.ok) {
        showToast('Objectif retiré.', 'info');
        chargerObjectifsEquipe();
      }
    } catch (e) {}
  };

  return {
    empGamificationKpis,
    setEmpGamificationKpis,
    objectifsEquipeListe,
    setObjectifsEquipeListe,
    showAddObjectifModal,
    setShowAddObjectifModal,
    newObjectifForm,
    setNewObjectifForm,
    chargerObjectifsEquipe,
    chargerKpisEmploye,
    creerObjectifEquipe,
    supprimerObjectifEquipe
  };
};

export default useGamificationEquipe;
