import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';

/**
 * useAppDataLoader - Hook central d'orchestration des données du salon :
 * Chargement et mise en cache IndexedDB (`localforage`), synchronisation WebSocket temps réel
 * (nouveau message, nouveau RDV, paiement validé), tableaux de bord exécutifs et planification.
 */
export const useAppDataLoader = ({
  token,
  userRole,
  setUserRole = () => {},
  isAbonnementInactif = false,
  isOffline = false,
  activeTab = 'accueil',
  refreshTrigger = 0,
  setRefreshTrigger = () => {},
  joursSemaine = [],
  formatDateInput = (d) => d.toISOString().split('T')[0],
  configSalon,
  setConfigSalon = () => {},
  setEmployesListe = () => {},
  setMessagesListe = () => {},
  setTachesListe = () => {},
  setCatalogueListe = () => {},
  setStocksData = () => {},
  setClientsListe = () => {},
  setProtocolesListe = () => {},
  setStatutsEquipe = () => {},
  chargerStatutsPointage = () => {},
  chargerMesSalons = () => {},
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  showToast = () => {},
  decodeToken = () => ({}),
  setConfirmDialog = () => {},
  API_URL
}) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [avisStats, setAvisStats] = useState(null);
  const [salonDashboardData, setSalonDashboardData] = useState(null);
  const [employeDashboardData, setEmployeDashboardData] = useState(null);
  const [rhData, setRhData] = useState([]);
  const [absencesRH, setAbsencesRH] = useState([]);
  const [historiqueData, setHistoriqueData] = useState([]);
  const [planningData, setPlanningData] = useState([]);
  const [superAdminData, setSuperAdminData] = useState(null);
  const [superAdminSalons, setSuperAdminSalons] = useState([]);
  const [socket, setSocket] = useState(null);

  // Méthode générique de fetch avec fallback sur le cache localforage
  const fetchAndCache = async (url, setter, cacheKey, expectedType = 'array') => {
    const sanitizeData = (d) => {
      if (expectedType === 'array') return Array.isArray(d) ? d : [];
      return d || null;
    };

    try {
      const cacheBuster = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
      const res = await fetch(`${API_URL}${url}${cacheBuster}`, {
        headers: getAuthHeaders(),
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await handleFetchError(res);
      const cleanData = sanitizeData(data);
      setter(cleanData);
      await localforage.setItem(cacheKey, cleanData);
    } catch (e) {
      const cachedData = await localforage.getItem(cacheKey);
      setter(sanitizeData(cachedData));
    }
  };

  // Chargement global de toutes les ressources du salon
  const chargerTout = () => {
    const role = decodeToken(token)?.role;

    if (typeof chargerStatutsPointage === 'function') {
      chargerStatutsPointage();
    }

    fetchAndCache('/api/employes', setEmployesListe, 'employesListe');
    fetchAndCache('/api/messages', setMessagesListe, 'messagesListe');
    fetchAndCache('/api/factures/historique', setHistoriqueData, 'historiqueData');
    fetchAndCache('/api/taches', setTachesListe, 'tachesListe');

    if (role === 'salon') fetchAndCache('/api/dashboard/salon', setSalonDashboardData, 'salonDashboardData', 'object');
    if (role === 'employe') fetchAndCache('/api/dashboard/employe', setEmployeDashboardData, 'employeDashboardData', 'object');

    fetch(`${API_URL}/api/settings?_=${Date.now()}`, { headers: getAuthHeaders(), cache: 'no-store' })
      .then(handleFetchError)
      .then(async (d) => {
        const config = {
          nom_salon: d?.nom_salon || '',
          forme_juridique: d?.forme_juridique || '',
          siret: d?.siret || '',
          adresse_salon: d?.adresse_salon || '',
          tva_intra: d?.tva_intra || '',
          google_api_key: d?.google_api_key || '',
          google_account_id: d?.google_account_id || '',
          google_location_id: d?.google_location_id || '',
          email_factures: d?.email_reception_factures || '',
          mot_de_passe_email: d?.mot_de_passe_app_email || '',
          brevo_api_key: d?.brevo_api_key || '',
          sms_sender_name: d?.sms_sender_name || 'MonSalon',
          lien_google_maps: d?.lien_google_maps || '',
          stripe_reader_id: d?.stripe_reader_id || '',
          heure_ouverture: d?.heure_ouverture || 8,
          heure_fermeture: d?.heure_fermeture || 20,
          fidelite_type: d?.fidelite_type || 'NONE',
          fidelite_points_seuil: d?.fidelite_points_seuil || 100,
          fidelite_points_valeur: d?.fidelite_points_valeur || 10,
          fidelite_tampons_seuil: d?.fidelite_tampons_seuil || 10,
          fidelite_recompense_type: d?.fidelite_recompense_type || 'MONTANT',
          fidelite_recompense_valeur: d?.fidelite_recompense_valeur || '10',
          fidelite_delai_sms: d?.fidelite_delai_sms || 60,
          telephone_gerant: d?.telephone_gerant || '',
          alertes_sms_actives: d?.alertes_sms_actives || false,
          email_comptable: d?.email_comptable || '',
          jour_envoi_bilan: d?.jour_envoi_bilan || 1,
          derniere_verif_stock: d?.derniere_verif_stock || null,
          pin_salon: d?.pin_salon && !String(d.pin_salon).startsWith('$2') ? d.pin_salon : '',
          securite_pin_salon_active: d?.securite_pin_salon_active !== false,
          temps_nettoyage_minutes: d?.temps_nettoyage_minutes || 0,
          plan_actuel: d?.plan_actuel || 'PREMIUM_TRIAL',
          date_fin_essai: d?.date_fin_essai || null,
          pennylane_api_key: d?.pennylane_api_key || '',
          mode_suivi_heures: d?.mode_suivi_heures || 'MANUEL',
          comptes_emails: Array.isArray(d?.comptes_emails)
            ? d.comptes_emails
            : d?.email_reception_factures
            ? [{ email: d.email_reception_factures, mot_de_passe: d.mot_de_passe_app_email || '' }]
            : [],
          logo_url: d?.logo_url || null,
          photos_salon: Array.isArray(d?.photos_salon)
            ? d.photos_salon
            : (typeof d?.photos_salon === 'string' ? JSON.parse(d.photos_salon || '[]') : []),
          description_salon: d?.description_salon || '',
          anti_noshow_actif: Boolean(d?.anti_noshow_actif),
          anti_noshow_pourcentage: d?.anti_noshow_pourcentage !== undefined ? parseInt(d.anti_noshow_pourcentage, 10) : 30,
          anti_noshow_mode_annulation: d?.anti_noshow_mode_annulation || 'AVOIR',
          delai_annulation_heures: d?.delai_annulation_heures !== undefined ? parseInt(d.delai_annulation_heures, 10) : 24,
          upsell_mode: d?.upsell_mode || 'AUTO',
          upsell_articles_ids: Array.isArray(d?.upsell_articles_ids)
            ? d.upsell_articles_ids
            : (typeof d?.upsell_articles_ids === 'string' ? JSON.parse(d.upsell_articles_ids || '[]') : [])
        };
        setConfigSalon(config);
        await localforage.setItem('configSalon', config);
      })
      .catch(async () => {
        const cachedConf = await localforage.getItem('configSalon');
        if (cachedConf) setConfigSalon(cachedConf);
      });

    if (role === 'employe') return;

    setDashboardData(null);
    fetchAndCache('/api/dashboard', setDashboardData, 'dashboardData', 'object');
    fetchAndCache('/api/avis/stats', setAvisStats, 'avisStats', 'object');
    fetchAndCache('/api/catalogue', setCatalogueListe, 'catalogueListe');
    fetchAndCache('/api/stocks', setStocksData, 'stocksData');
    if (role === 'gerant') {
      fetchAndCache('/api/rh', setRhData, 'rhData');
      if (typeof chargerMesSalons === 'function') chargerMesSalons();
    }
    fetchAndCache('/api/rh/absences', setAbsencesRH, 'absencesRH');
    fetchAndCache('/api/clients', setClientsListe, 'clientsListe');
    fetchAndCache('/api/protocoles', setProtocolesListe, 'protocolesListe');

    if (decodeToken(token)?.id_salon === 38) {
      fetchAndCache('/api/superadmin/stats', setSuperAdminData, 'superAdminData', 'object');
      fetchAndCache('/api/superadmin/salons', setSuperAdminSalons, 'superAdminSalons');
    }
  };

  // Chargement automatique du planning
  const planningStartTs = joursSemaine && joursSemaine.length > 0 ? joursSemaine[0].getTime() : 0;
  const planningEndTs = joursSemaine && joursSemaine.length > 0 ? joursSemaine[joursSemaine.length - 1].getTime() : 0;

  useEffect(() => {
    if (token && !isAbonnementInactif && planningStartTs > 0) {
      const startStr = formatDateInput(new Date(planningStartTs));
      const endStr = formatDateInput(new Date(planningEndTs));
      fetchAndCache(`/api/planning?startDate=${startStr}&endDate=${endStr}`, setPlanningData, 'planningData', 'object');

      if (decodeToken(token)?.role === 'employe') {
        fetchAndCache('/api/protocoles', setProtocolesListe, 'protocolesListe', 'array');
      }
    }
  }, [planningStartTs, planningEndTs, activeTab, refreshTrigger, token, isAbonnementInactif]);

  // Établissement de la connexion WebSocket et listeners en direct
  useEffect(() => {
    if (token && !isAbonnementInactif) {
      const user = decodeToken(token);
      setUserRole(user?.role || 'gerant');
      if (user?.role === 'salon') {
        const apiTok = localStorage.getItem('api_token');
        const apiRole = decodeToken(apiTok)?.role;
        if (apiTok && apiRole && apiRole !== 'salon') {
          localStorage.removeItem('api_token');
        }
      }
      chargerTout();

      if (user && user.id_salon && !isOffline && navigator.onLine) {
        const newSocket = io(API_URL, {
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 10,
          timeout: 10000,
          withCredentials: true,
          auth: { token: localStorage.getItem('api_token') }
        });

        newSocket.on('connect', () => {
          newSocket.emit('rejoindreSalon', user.id_salon);
        });

        newSocket.on('paiementValide', (data) => {
          showToast(data.message, 'success');
          if (user.role === 'gerant') chargerTout();
        });

        newSocket.on('nouveauRDV', () => {
          setRefreshTrigger((prev) => prev + 1);
        });

        newSocket.on('nouveauMessage', (data) => {
          if (
            user.role === 'employe' &&
            data.id_destinataire !== 0 &&
            data.id_expediteur !== user.id_employe &&
            data.id_destinataire !== user.id_employe
          ) {
            return;
          }
          setMessagesListe((prev) => {
            const liste = prev || [];
            if (liste.some((m) => Number(m.id_message) === Number(data.id_message))) return liste;
            return [...liste, data];
          });
        });

        newSocket.on('messageModifie', (data) => {
          setMessagesListe((prev) =>
            (prev || []).map((m) => (Number(m.id_message) === Number(data.id_message) ? { ...m, contenu: data.contenu } : m))
          );
        });

        newSocket.on('messageSupprime', (data) => {
          setMessagesListe((prev) => (prev || []).filter((m) => Number(m.id_message) !== Number(data.id_message)));
        });

        newSocket.on('messageReaction', (data) => {
          setMessagesListe((prev) =>
            (prev || []).map((m) => (Number(m.id_message) === Number(data.id_message) ? { ...m, reactions: data.reactions } : m))
          );
        });

        newSocket.on('messageVu', (data) => {
          setMessagesListe((prev) =>
            (prev || []).map((m) => {
              if (Number(m.id_message) !== Number(data.id_message)) return m;
              const existants = Array.isArray(m.vu_par) ? m.vu_par : [];
              const nouveaux = Array.isArray(data.vu_par) ? data.vu_par : [];
              return { ...m, vu_par: Array.from(new Set([...existants, ...nouveaux])) };
            })
          );
        });

        newSocket.on('statutPointageUpdate', (data) => {
          if (data && data.id_employe && typeof setStatutsEquipe === 'function') {
            setStatutsEquipe((prev) => ({ ...prev, [data.id_employe]: { action: data.type_action, heure: data.heure } }));
          } else if (typeof chargerStatutsPointage === 'function') {
            chargerStatutsPointage();
          }
        });

        newSocket.on('connect_error', () => {});
        setSocket(newSocket);

        return () => {
          newSocket.disconnect();
        };
      }
    }
  }, [token, isAbonnementInactif, isOffline]);

  const basculerStatutSalon = async (id_salon, statutActuel) => {
    const nouveauStatut = statutActuel === 'actif' ? 'inactif' : 'actif';
    try {
      const res = await fetch(`${API_URL}/api/superadmin/salons/${id_salon}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ statut: nouveauStatut })
      });
      const data = await handleFetchError(res);
      showToast(data?.message || 'Statut mis à jour', 'success');
      chargerTout();
    } catch (e) {
      showToast('Erreur lors de la modification', 'error');
    }
  };

  const supprimerSalonAdmin = async (id_salon, nom_salon) => {
    if (typeof setConfirmDialog === 'function') {
      setConfirmDialog({
        titre: 'DANGER : Destruction du Salon',
        message: `Êtes-vous sûr de vouloir SUPPRIMER DÉFINITIVEMENT le salon "${nom_salon}" (ID: ${id_salon}) ? Absolument TOUT sera effacé de la base de données sans aucun retour en arrière possible.`,
        btnTexte: 'Oui, tout détruire',
        action: async () => {
          setConfirmDialog(null);
          try {
            const res = await fetch(`${API_URL}/api/superadmin/salons/${id_salon}`, {
              method: 'DELETE',
              headers: getAuthHeaders()
            });
            const data = await handleFetchError(res);
            showToast(data?.message || 'Salon supprimé', 'success');
            chargerTout();
          } catch (e) {
            showToast(e.message || 'Erreur de suppression', 'error');
          }
        }
      });
    }
  };

  return {
    dashboardData,
    setDashboardData,
    avisStats,
    setAvisStats,
    salonDashboardData,
    setSalonDashboardData,
    employeDashboardData,
    setEmployeDashboardData,
    rhData,
    setRhData,
    absencesRH,
    setAbsencesRH,
    historiqueData,
    setHistoriqueData,
    planningData,
    setPlanningData,
    superAdminData,
    setSuperAdminData,
    superAdminSalons,
    setSuperAdminSalons,
    basculerStatutSalon,
    supprimerSalonAdmin,
    fetchAndCache,
    chargerTout,
    socket
  };
};

export default useAppDataLoader;
