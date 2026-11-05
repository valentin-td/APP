// frontend/src/hooks/useMultiSalons.js
// Hook de gestion multi-établissements, franchise et switch de salons (STACK)

import { useState } from 'react';
import localforage from 'localforage';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

export function useMultiSalons({
  token,
  setToken,
  configSalon = {},
  getAuthHeaders,
  handleFetchError,
  showToast,
  setDashboardData,
  setPosEmploye,
  setPanierCaisse
}) {
  const [mesSalonsGroupe, setMesSalonsGroupe] = useState({ synthese_groupe: null, salons: [] });
  const [showMultiSalonModal, setShowMultiSalonModal] = useState(false);
  const [showFormNouveauSalon, setShowFormNouveauSalon] = useState(false);
  const [isSwitchingSalon, setIsSwitchingSalon] = useState(false);
  const [isCreatingSalon, setIsCreatingSalon] = useState(false);
  const [formNouveauSalon, setFormNouveauSalon] = useState({
    nom_salon: '',
    forme_juridique: 'SASU',
    siret: '',
    adresse_salon: '',
    tva_intra: '',
    copier_catalogue: true,
    copier_protocoles: true
  });

  const chargerMesSalons = async () => {
    if (!token || decodeToken(token)?.role !== 'gerant') return;
    try {
      const res = await fetch(`${API_URL}/api/mes-salons?_=${Date.now()}`, {
        headers: getAuthHeaders ? getAuthHeaders() : {},
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setMesSalonsGroupe({
          synthese_groupe: data.synthese_groupe || null,
          salons: Array.isArray(data.salons) ? data.salons : []
        });
      }
    } catch (e) {}
  };

  const changerDeSalonActif = async (idSalonCible) => {
    if (!idSalonCible || Number(idSalonCible) === Number(decodeToken(token)?.id_salon)) {
      setShowMultiSalonModal(false);
      return;
    }
    setIsSwitchingSalon(true);
    try {
      const res = await fetch(`${API_URL}/api/mes-salons/switch/${idSalonCible}`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();

      const clesCacheSalon = [
        'dashboardData',
        'avisStats',
        'catalogueListe',
        'stocksData',
        'rhData',
        'absencesRH',
        'clientsListe',
        'protocolesListe',
        'employesListe',
        'messagesListe',
        'historiqueData',
        'tachesListe',
        'configSalon',
        'planningData'
      ];
      await Promise.all(clesCacheSalon.map((k) => localforage.removeItem(k).catch(() => {})));

      localStorage.setItem('ui_token', data.ui_token);
      if (data.token_api) localStorage.setItem('api_token', data.token_api);

      if (setDashboardData) setDashboardData(null);
      if (setPosEmploye) setPosEmploye(null);
      if (setPanierCaisse) setPanierCaisse([]);
      setShowMultiSalonModal(false);
      if (setToken) setToken(data.ui_token);
      showToast?.('Établissement actif changé avec succès !', 'success');
    } catch (e) {
      showToast?.(e.message || 'Erreur lors du changement de salon.', 'error');
    } finally {
      setIsSwitchingSalon(false);
    }
  };

  const creerNouveauSalonGroupe = async () => {
    if (!formNouveauSalon.nom_salon.trim()) {
      return showToast?.('Veuillez saisir le nom du nouvel établissement.', 'error');
    }
    setIsCreatingSalon(true);
    try {
      const res = await fetch(`${API_URL}/api/mes-salons/creer`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formNouveauSalon)
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      showToast?.(data.message || 'Nouvel établissement créé !', 'success');
      setShowFormNouveauSalon(false);
      setFormNouveauSalon({
        nom_salon: '',
        forme_juridique: configSalon.forme_juridique || 'SASU',
        siret: '',
        adresse_salon: '',
        tva_intra: configSalon.tva_intra || '',
        copier_catalogue: true,
        copier_protocoles: true
      });
      await chargerMesSalons();
      if (data.id_salon) {
        await changerDeSalonActif(data.id_salon);
      }
    } catch (e) {
      showToast?.(e.message || 'Erreur lors de la création du salon.', 'error');
    } finally {
      setIsCreatingSalon(false);
    }
  };

  return {
    mesSalonsGroupe,
    setMesSalonsGroupe,
    showMultiSalonModal,
    setShowMultiSalonModal,
    showFormNouveauSalon,
    setShowFormNouveauSalon,
    isSwitchingSalon,
    isCreatingSalon,
    formNouveauSalon,
    setFormNouveauSalon,
    chargerMesSalons,
    changerDeSalonActif,
    creerNouveauSalonGroupe
  };
}

export default useMultiSalons;
