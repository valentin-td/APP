import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  
  // Détection du réseau
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
      if (isDarkMode) {
          document.body.classList.add('dark-mode');
          localStorage.setItem('theme', 'dark');
      } else {
          document.body.classList.remove('dark-mode');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  const ThemeToggle = ({ isFixed }) => {
      const isMob = typeof window !== 'undefined' && window.innerWidth < 768;
      const mobileStyle = isMob && isFixed ? { top: '65px', right: '16px' } : {};
      
      return (
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`theme-toggle-btn ${isFixed ? 'theme-toggle-fixed' : ''}`} style={mobileStyle} title="Basculer le thème">
              {isDarkMode ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
          </button>
      );
  };

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginType, setLoginType] = useState('gerant'); 
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [erreurLogin, setErreurLogin] = useState(null);
  const [msgSucces, setMsgSucces] = useState(null);
  
  const [emailInput, setEmailInput] = useState('');
  const [motDePasseInput, setMotDePasseInput] = useState('');
  const [nomSalonInput, setNomSalonInput] = useState('');
  const [idSalonInput, setIdSalonInput] = useState(''); 
  const [nomEmployeInput, setNomEmployeInput] = useState('');
  const [pinEmployeInput, setPinEmployeInput] = useState('');

  const [isAbonnementInactif, setIsAbonnementInactif] = useState(false);
  const [userRole, setUserRole] = useState('gerant'); 

  const [activeTab, setActiveTab] = useState('accueil');
  const [dashboardData, setDashboardData] = useState(null);
  const [stocksData, setStocksData] = useState([]);
  const [rhData, setRhData] = useState([]);
  const [historiqueData, setHistoriqueData] = useState([]);
  const [planningData, setPlanningData] = useState([]); 
  
  // ÉTATS DE L'IA AUTOMATIQUE EN ARRIÈRE-PLAN
  const [tachesIA, setTachesIA] = useState([]);
  const [modalIA, setModalIA] = useState(null);
  
  const [erreur, setErreur] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const [resetTokenUrl] = useState(urlParams.get('resetToken'));
  const [newPassword, setNewPassword] = useState('');

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  const [catalogueListe, setCatalogueListe] = useState([]);
  const [employesListe, setEmployesListe] = useState([]);
  const [clientsListe, setClientsListe] = useState([]);
  
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [clientHistorique, setClientHistorique] = useState({ rdv: [], achats: [], notes: '', gains: [] });
  const [chargementFiche, setChargementFiche] = useState(false);

  const [ticketGenere, setTicketGenere] = useState(null);
  const [emailTicketClient, setEmailTicketClient] = useState('');

  const [newClient, setNewClient] = useState({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' });
  const [newEmploye, setNewEmploye] = useState({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null });
  const [newArticle, setNewArticle] = useState({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '' });

  const [posStep, setPosStep] = useState('employee'); 
  const [posEmploye, setPosEmploye] = useState(null);
  const [posType, setPosType] = useState('PRESTATION'); 
  const [clientCaisse, setClientCaisse] = useState('');
  const [panierCaisse, setPanierCaisse] = useState([]); 
  const [remiseAppliquee, setRemiseAppliquee] = useState(false); 
  const [methodePaiement, setMethodePaiement] = useState('ESPECES');
  const [clientsSuggeres, setClientsSuggeres] = useState([]); 
  const [socket, setSocket] = useState(null);
  
  const COULEURS_EMPLOYES = ['#a2d2ff', '#b9fbc0', '#fcf6bd', '#ffc6ff', '#ffd6a5', '#c8b6ff'];

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const nbJoursAffichage = isMobile ? 3 : (isTablet ? 4 : 7);

  const getStartOfPeriod = (d, daysCount) => {
      const date = new Date(d);
      if (daysCount === 7) {
          const day = date.getDay();
          const diff = date.getDate() - day + (day === 0 ? -6 : 1);
          return new Date(date.setDate(diff));
      }
      return date; 
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const startDate = getStartOfPeriod(currentDate, nbJoursAffichage);
  const joursSemaine = Array.from({length: nbJoursAffichage}).map((_, i) => { const d = new Date(startDate); d.setDate(d.getDate() + i); return d; });

  const changerPeriode = (direction) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + (direction * nbJoursAffichage));
      setCurrentDate(newDate);
  };
  const resetToToday = () => setCurrentDate(new Date());

  const [filtreAgenda, setFiltreAgenda] = useState('TOUS');
  const [rdvSelectionne, setRdvSelectionne] = useState(null); 
  const [isEditingRdv, setIsEditingRdv] = useState(false);
  const [editRdvForm, setEditRdvForm] = useState({ date: '', heure: '', prestation: '', id_employe: '' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showModalRdv, setShowModalRdv] = useState(false);
  const [formRdv, setFormRdv] = useState({ nom_client: '', telephone_client: '', id_employe: '', prestation: '', date: '', heure: '10:00', duree_minutes: 30 });

  const [configSalon, setConfigSalon] = useState({
    google_api_key: '', google_account_id: '', google_location_id: '', email_factures: '', mot_de_passe_email: '', brevo_api_key: '', sms_sender_name: 'MonSalon', lien_google_maps: '', stripe_reader_id: '', heure_ouverture: 8, heure_fermeture: 20,
    fidelite_type: 'NONE', fidelite_points_seuil: 100, fidelite_points_valeur: 10, fidelite_tampons_seuil: 10, fidelite_recompense_type: 'MONTANT', fidelite_recompense_valeur: '10', fidelite_delai_sms: 60
  });

  const decodeToken = (t) => { try { return JSON.parse(atob(t.split('.')[1])); } catch(e) { return null; } };
  const formatDateComplete = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formatDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isToday = (d) => { const today = new Date(); return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }
  const getAuthHeaders = (isJson = false) => { const headers = { 'Authorization': `Bearer ${token}` }; if (isJson) headers['Content-Type'] = 'application/json'; return headers; };
  
  const handleFetchError = async (res) => { 
      if (res.status === 401 || res.status === 403) { seDeconnecter(); throw new Error("Session expirée"); } 
      if (res.status === 402) { setIsAbonnementInactif(true); throw new Error("Abonnement inactif"); } 
      const data = await res.json(); 
      if (!res.ok) throw new Error(data.erreur || "Erreur serveur"); 
      return data; 
  };

  const formatNomClient = (client) => {
      if (!client) return 'Client inconnu';
      if (client.prenom && client.nom) return `${client.prenom} ${client.nom}`;
      return client.nom || 'Client sans nom';
  };

  const handleImageUpload = (e) => {
      const file = e.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { setNewEmploye({ ...newEmploye, photo_url: reader.result }); };
          reader.readAsDataURL(file);
      }
  };

  // --- MÉCANIQUE OFFLINE ANTI-BUG iOS ---
  useEffect(() => {
      const handleOnline = () => { setIsOffline(false); syncOfflineTickets(); };
      const handleOffline = () => { setIsOffline(true); setMethodePaiement('ESPECES'); }; 
      
      const checkNetworkAggressively = () => {
          const currentOfflineStatus = !navigator.onLine;
          if (isOffline !== currentOfflineStatus) {
              setIsOffline(currentOfflineStatus);
              if (!currentOfflineStatus) syncOfflineTickets();
          }
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      document.addEventListener('visibilitychange', checkNetworkAggressively);
      window.addEventListener('focus', checkNetworkAggressively);

      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
          document.removeEventListener('visibilitychange', checkNetworkAggressively);
          window.removeEventListener('focus', checkNetworkAggressively);
      };
  }, [token, isOffline]);

  const syncOfflineTickets = async () => {
      if (!token) return;
      const queue = await localforage.getItem('offline_tickets') || [];
      if (queue.length === 0) return;
      
      showToast(`Synchronisation de ${queue.length} ticket(s) en attente...`, "info");
      let ticketsRestants = [];
      
      for (let ticket of queue) {
          try {
              await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { 
                  method: 'POST', 
                  headers: getAuthHeaders(true), 
                  body: JSON.stringify(ticket) 
              });
          } catch (e) {
              ticketsRestants.push(ticket);
          }
      }
      
      await localforage.setItem('offline_tickets', ticketsRestants);
      if (ticketsRestants.length === 0) {
          showToast("Tous les tickets hors-ligne ont été synchronisés !", "success");
          chargerTout();
      } else {
          showToast("Réseau instable, synchronisation partielle.", "error");
      }
  };

  const fetchAndCache = async (url, setter, cacheKey) => {
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com${url}`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setter(data);
          await localforage.setItem(cacheKey, data);
      } catch (e) {
          const cachedData = await localforage.getItem(cacheKey);
          if (cachedData) setter(cachedData);
      }
  };

  const chargerTout = () => {
    const role = decodeToken(token)?.role;
    if (role === 'employe') return; 
    setDashboardData(null); 
    fetchAndCache('/api/dashboard', setDashboardData, 'dashboardData');
    fetchAndCache('/api/employes', setEmployesListe, 'employesListe');
    fetchAndCache('/api/catalogue', setCatalogueListe, 'catalogueListe');
    fetchAndCache('/api/stocks', setStocksData, 'stocksData');
    fetchAndCache('/api/rh', setRhData, 'rhData');
    fetchAndCache('/api/factures/historique', setHistoriqueData, 'historiqueData');
    fetchAndCache('/api/clients', setClientsListe, 'clientsListe');
    fetchAndCache('/api/ia/taches', setTachesIA, 'tachesIA'); // CHARGEMENT DES TÂCHES IA
    
    fetch('https://api-salon-backend.onrender.com/api/settings', { headers: getAuthHeaders() })
        .then(handleFetchError)
        .then(async (d) => {
            const config = { 
                google_api_key: d.google_api_key || '', google_account_id: d.google_account_id || '', google_location_id: d.google_location_id || '', email_factures: d.email_reception_factures || '', mot_de_passe_email: d.mot_de_passe_app_email || '', brevo_api_key: d.brevo_api_key || '', sms_sender_name: d.sms_sender_name || 'MonSalon', lien_google_maps: d.lien_google_maps || '', stripe_reader_id: d.stripe_reader_id || '', heure_ouverture: d.heure_ouverture || 8, heure_fermeture: d.heure_fermeture || 20,
                fidelite_type: d.fidelite_type || 'NONE', fidelite_points_seuil: d.fidelite_points_seuil || 100, fidelite_points_valeur: d.fidelite_points_valeur || 10, fidelite_tampons_seuil: d.fidelite_tampons_seuil || 10, fidelite_recompense_type: d.fidelite_recompense_type || 'MONTANT', fidelite_recompense_valeur: d.fidelite_recompense_valeur || '10', fidelite_delai_sms: d.fidelite_delai_sms || 60
            };
            setConfigSalon(config);
            await localforage.setItem('configSalon', config);
        }).catch(async () => {
            const cachedConf = await localforage.getItem('configSalon');
            if(cachedConf) setConfigSalon(cachedConf);
        });
  };

  useEffect(() => {
      if (token && !isAbonnementInactif) {
          const startStr = formatDateInput(joursSemaine[0]); 
          const endStr = formatDateInput(joursSemaine[joursSemaine.length - 1]);
          fetchAndCache(`/api/planning?startDate=${startStr}&endDate=${endStr}`, setPlanningData, 'planningData');
      }
  }, [currentDate, windowWidth, activeTab, refreshTrigger, token, isAbonnementInactif]);

  useEffect(() => { 
      if (token && !isAbonnementInactif) { 
          const user = decodeToken(token); setUserRole(user?.role || 'gerant');
          chargerTout(); 
          if (user && user.id_salon && !isOffline && navigator.onLine) {
             const newSocket = io('https://api-salon-backend.onrender.com', {
                      reconnectionAttempts: Infinity,
                      timeout: 5000,
                  });
                  
                  // DOUBLE SÉCURITÉ : Immédiat + À la reconnexion
                  newSocket.emit('rejoindreSalon', user.id_salon);
                  newSocket.on('connect', () => {
                      newSocket.emit('rejoindreSalon', user.id_salon);
                      chargerTout(); // resynchronise tout après une reconnexion (réveil d'instance, coupure réseau, etc.)
                  });

                  newSocket.on('paiementValide', (data) => { showToast(data.message, "success"); if(user.role === 'gerant') chargerTout(); });
                  newSocket.on('nouveauRDV', () => { setRefreshTrigger(prev => prev + 1); });
                  newSocket.on('nouvelleTacheIA', () => { 
                      showToast("🤖 L'IA a détecté une nouvelle action !", "success");
                      if(user.role === 'gerant') chargerTout();
                  });
                  newSocket.on('connect_error', () => {});
                  setSocket(newSocket);
                  return () => newSocket.disconnect();
              }
      } 
  }, [token, isAbonnementInactif, isOffline]);

  // LOGIQUE DU POP-UP INTELLIGENT DE L'IA QUAND ON CHANGE D'ONGLET
  useEffect(() => {
      if (activeTab === 'produits' && !modalIA && tachesIA && tachesIA.length > 0) {
          const tacheStock = tachesIA.find(t => t.type_tache === 'STOCK');
          if (tacheStock) setModalIA(tacheStock);
      }
      if (activeTab === 'agenda' && !modalIA && tachesIA && tachesIA.length > 0) {
          const tacheClient = tachesIA.find(t => t.type_tache === 'CLIENT');
          if (tacheClient) setModalIA(tacheClient);
      }
  }, [activeTab, tachesIA, modalIA]);

  const validerTacheIA = async (tache) => {
      try {
          await fetch(`https://api-salon-backend.onrender.com/api/ia/taches/${tache.id_tache}/valider`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify(tache.donnees)
          });
          showToast("Action de l'IA confirmée !", "success");
          setModalIA(null);
          chargerTout();
      } catch (e) { showToast("Erreur lors de la validation.", "error"); }
  };

  const ignorerTacheIA = async (tache) => {
      try {
          await fetch(`https://api-salon-backend.onrender.com/api/ia/taches/${tache.id_tache}/ignorer`, {
              method: 'POST',
              headers: getAuthHeaders()
          });
          setModalIA(null);
          chargerTout();
      } catch (e) { showToast("Erreur serveur.", "error"); }
  };

  const sInscrire = async () => {
    try {
      const response = await fetch('https://api-salon-backend.onrender.com/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput, mot_de_passe: motDePasseInput, nom_salon: nomSalonInput }) });
      const data = await response.json();
      if (response.ok) { localStorage.setItem('token', data.token); setToken(data.token); setErreurLogin(null); setIsAbonnementInactif(true); setUserRole('gerant'); } else { setErreurLogin(data.erreur); }
    } catch (e) { setErreurLogin("Erreur de connexion au serveur."); }
  };

  const seConnecter = async () => {
    try {
      const isEmploye = loginType === 'employe';
      const endpoint = isEmploye ? 'https://api-salon-backend.onrender.com/api/employes/login-pin' : 'https://api-salon-backend.onrender.com/api/login';
      const payload = isEmploye ? { id_salon: idSalonInput, nom_employe: nomEmployeInput, code_pin: pinEmployeInput } : { email: emailInput, mot_de_passe: motDePasseInput };

      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      
      if (response.ok) { 
          localStorage.setItem('token', data.token); setToken(data.token); setErreurLogin(null); 
          const decoded = decodeToken(data.token); setUserRole(decoded.role || 'gerant');
          if(decoded.role === 'employe') { setActiveTab('agenda'); } else { setActiveTab('accueil'); if(data.statut_abonnement !== 'actif') setIsAbonnementInactif(true); }
      } else { setErreurLogin(data.erreur); }
    } catch (e) { setErreurLogin("Mode hors-ligne ou erreur de connexion."); }
  };

  const motDePasseOublie = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput }) });
          const data = await res.json();
          setMsgSucces(data.message); setErreurLogin(null);
      } catch (e) { setErreurLogin("Erreur d'envoi."); }
  }

  const seDeconnecter = () => { localStorage.removeItem('token'); setToken(null); setIsAbonnementInactif(false); setUserRole('gerant'); if(socket) socket.disconnect(); };

  const lancerPaiementStripe = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/creer-checkout', { method: 'POST', headers: getAuthHeaders() });
          const data = await res.json();
          if(data.url) { window.location.href = data.url; } 
          else { showToast("Erreur lors de la création du lien de paiement.", "error"); }
      } catch (e) { showToast("Erreur réseau avec Stripe.", "error"); }
  };

  const ouvrirFicheClient = async (client) => {
      if(isOffline) return showToast("L'historique client est désactivé hors-ligne.", "error");
      setClientSelectionne(client);
      setChargementFiche(true);
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/clients/${client.id_client}/history`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setClientHistorique(data);
      } catch (e) { showToast("Erreur lors du chargement de l'historique.", "error"); }
      setChargementFiche(false);
  };

  const sauvegarderNotesClient = async () => {
      if(isOffline) return showToast("Impossible d'enregistrer des notes hors-ligne.", "error");
      try {
          await fetch(`https://api-salon-backend.onrender.com/api/clients/${clientSelectionne.id_client}/notes`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ notes: clientHistorique.notes }) });
          showToast("Notes sauvegardées avec succès !", "success");
      } catch (e) { showToast("Erreur lors de la sauvegarde des notes.", "error"); }
  };

  const annulerTicket = async (id_ticket) => {
      if(isOffline) return showToast("Annulation impossible hors-ligne.", "error");
      if (!window.confirm("Êtes-vous sûr de vouloir annuler ce paiement ?")) return;
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/caisse/annuler-ticket/${id_ticket}`, { method: 'PUT', headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          ouvrirFicheClient(clientSelectionne);
          chargerTout();
      } catch (error) { showToast(error.message, "error"); }
  };

  const ajouterClient = async () => { if(isOffline) return showToast("Désactivé hors-ligne", "error"); try { const res = await fetch('https://api-salon-backend.onrender.com/api/clients', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newClient) }); await handleFetchError(res); setNewClient({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' }); chargerTout(); showToast("Client ajouté.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerClient = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Client supprimé.", "success"); } catch(e) { showToast("Erreur suppression client.", "error"); }};
  const ajouterEmploye = async () => { if(isOffline) return showToast("Désactivé", "error"); try { const res = await fetch('https://api-salon-backend.onrender.com/api/employes', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newEmploye) }); await handleFetchError(res); setNewEmploye({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null }); chargerTout(); showToast("Employé ajouté.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerEmploye = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Employé supprimé.", "success"); } catch(e) { showToast("Erreur suppression employé.", "error"); }};
  const ajouterArticle = async () => { if(isOffline) return showToast("Désactivé", "error"); if (newArticle.type_article === 'PRODUIT_REVENTE') { if (!newArticle.reference || newArticle.reference.trim().length < 4) { showToast("Veuillez saisir une référence d'au moins 4 caractères.", "error"); return; } } try { const res = await fetch('https://api-salon-backend.onrender.com/api/catalogue', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newArticle) }); const data = await handleFetchError(res); if (data.message && data.message.includes("Stock mis à jour")) { showToast(data.message, "success"); } setNewArticle({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '' }); chargerTout(); showToast("Catalogue mis à jour.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerArticle = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Article supprimé.", "success"); } catch(e) { showToast("Erreur suppression article.", "error"); }};

  const getStockStatus = (q) => { const num = parseFloat(q); if (num > 20) return { bg: 'var(--bg-success)', text: 'var(--color-success)', label: 'En stock' }; if (num >= 6) return { bg: 'var(--bg-info)', text: 'var(--color-info)', label: 'Correct' }; if (num >= 1) return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Faible' }; return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Rupture' }; };
  const dessinerCourbe = (d) => { const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' '); return <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>; };
  const dessinerChronogramme = (d) => { const max = Math.max(...d) * 1.2; return (<svg width="100%" height="40px" viewBox={`0 0 100 40`} preserveAspectRatio="none">{d.map((val, i) => <rect key={i} x={i * 18} y={40 - ((val / max) * 40)} width={10} height={(val / max) * 40} fill="var(--btn-primary)" rx="2" />)}</svg>); };

  const handleSelectEmployeCaisse = (id_employe) => {
      setPosEmploye(id_employe);
      const now = new Date();
      let matches = [];

      const rdvsToday = planningData.filter(r => r.id_employe === id_employe && isToday(new Date(r.date_heure_debut.replace('Z', ''))));
      rdvsToday.sort((a, b) => new Date(b.date_heure_debut.replace('Z', '')) - new Date(a.date_heure_debut.replace('Z', '')));

      for (let rdv of rdvsToday) {
          const rdvStart = new Date(rdv.date_heure_debut.replace('Z', ''));
          const diffMinutes = (now - rdvStart) / 60000; 
          if (diffMinutes > -30 && diffMinutes < 150) { 
              let clientInCRM = null;
              if (rdv.telephone_client) {
                  clientInCRM = clientsListe.find(c => c.telephone === rdv.telephone_client);
              }
              if (!clientInCRM && rdv.nom_client) {
                  clientInCRM = clientsListe.find(c => c.nom.toLowerCase() === rdv.nom_client.toLowerCase());
              }
              if (clientInCRM && !matches.find(m => m.id_client === clientInCRM.id_client)) {
                  matches.push({ ...clientInCRM, prestation_rdv: rdv.prestation });
              }
          }
      }

      if (matches.length > 0) {
          setClientsSuggeres(matches);
      } else {
          setClientCaisse('');
          setPosStep('type');
      }
  };

  const ajouterAuPanier = (article) => {
      const exist = panierCaisse.find(item => item.id_article === article.id_article);
      if (exist) {
          setPanierCaisse(panierCaisse.map(item => item.id_article === article.id_article ? { ...item, quantite: item.quantite + 1 } : item));
      } else {
          setPanierCaisse([...panierCaisse, { ...article, quantite: 1, prix_unitaire: parseFloat(article.prix) }]);
      }
  };
  const retirerDuPanier = (id_article) => { setPanierCaisse(panierCaisse.filter(item => item.id_article !== id_article)); };

  const sousTotalCaisse = panierCaisse.reduce((acc, item) => acc + (item.prix_unitaire * item.quantite), 0);
  let totalCaisse = sousTotalCaisse;
  
  if (remiseAppliquee) {
      if (configSalon.fidelite_type === 'POINTS') {
          totalCaisse = Math.max(0, sousTotalCaisse - parseFloat(configSalon.fidelite_points_valeur));
      } else if (configSalon.fidelite_type === 'TAMPONS') {
          if (configSalon.fidelite_recompense_type === 'MONTANT') {
              totalCaisse = Math.max(0, sousTotalCaisse - parseFloat(configSalon.fidelite_recompense_valeur));
          } else if (configSalon.fidelite_recompense_type === 'POURCENTAGE') {
              totalCaisse = sousTotalCaisse * (1 - (parseFloat(configSalon.fidelite_recompense_valeur) / 100));
          }
      }
  }

  const validerEncaisser = () => {
      if(!posEmploye) { showToast("Veuillez sélectionner un employé.", "error"); return; }
      if(panierCaisse.length === 0) { showToast("Le ticket est vide.", "error"); return; }
      
      const vraimentHorsLigne = isOffline || !navigator.onLine;
      if (vraimentHorsLigne && methodePaiement === 'CARTE') { showToast("Le TPE (Carte) nécessite une connexion.", "error"); return; }
      
      lancerPaiementTPE(totalCaisse, panierCaisse);
  };

  const lancerPaiementTPE = async (montant, lignes) => {
    const vraimentHorsLigne = isOffline || !navigator.onLine;
    if (vraimentHorsLigne !== isOffline) setIsOffline(vraimentHorsLigne);

    const payloadTPE = { montant, id_employe: posEmploye, id_client: clientCaisse || null, lignes, recompense_appliquee: remiseAppliquee, methode_paiement: methodePaiement };

    const forcerSauvegardeLocale = async () => {
        const offlineTicketId = `TKT-OFFLINE-${Date.now()}`;
        const offlineTicket = { ...payloadTPE, _id_temp: offlineTicketId, date_creation: new Date().toISOString() };
        
        const queue = await localforage.getItem('offline_tickets') || [];
        queue.push(offlineTicket);
        await localforage.setItem('offline_tickets', queue);

        setTicketGenere({
            id_ticket: offlineTicketId, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? formatNomClient(clientsListe.find(c => c.id_client.toString() === clientCaisse)) : 'Client de passage',
            client_email: clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.email : '',
            lignes: lignes,
            is_offline: true
        });
        
        setPanierCaisse([]); setClientCaisse(''); setPosEmploye(''); setRemiseAppliquee(false); setMethodePaiement('ESPECES');
        showToast("Ticket sauvegardé localement (Mode Hors-Ligne)", "success");
    };

    if (vraimentHorsLigne) {
        await forcerSauvegardeLocale();
        return;
    }

    if (methodePaiement === 'CARTE' && montant > 0) setNotificationCaisse(`⏳ Envoi de l'ordre au TPE physique. En attente de la carte...`);
    
    try {
        const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payloadTPE) });
        const data = await handleFetchError(res);
        
        setNotificationCaisse(null);
        setTicketGenere({
            id_ticket: data.id_ticket, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? formatNomClient(clientsListe.find(c => c.id_client.toString() === clientCaisse)) : 'Client de passage',
            client_email: clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.email : '',
            lignes: lignes
        });
        setEmailTicketClient(clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.email || '' : '');
        
        setPanierCaisse([]); setClientCaisse(''); setPosEmploye(''); setRemiseAppliquee(false); setMethodePaiement('CARTE');
        chargerTout(); 
    } catch (error) { 
        if(error.message === "Load failed" || error.message === "Failed to fetch" || !navigator.onLine) {
            setIsOffline(true);
            await forcerSauvegardeLocale();
        } else if(error.message !== "Abonnement inactif") {
            setNotificationCaisse(`❌ ${error.message || "Erreur Caisse."}`); 
        }
    }
  };

  const envoyerTicketEco = async (methode) => {
      if(isOffline || !navigator.onLine) return showToast("Envoi impossible sans réseau.", "error");
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/envoyer-ticket', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ id_ticket: ticketGenere.id_ticket, email: emailTicketClient, id_client: ticketGenere.client_id, methode }) });
          await handleFetchError(res);
          showToast(`Ticket envoyé par ${methode.toUpperCase()} !`, "success");
          setTicketGenere(null);
      } catch (e) { showToast(`Erreur d'envoi : ${e.message}`, "error"); }
  }

  const declencherExport = async () => { if(isOffline || !navigator.onLine) return showToast("Export impossible sans réseau.", "error"); showToast("Génération du PDF en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/export-pdf', { headers: getAuthHeaders() }); if (response.status === 402) { setIsAbonnementInactif(true); return; } if (!response.ok) { const errText = await response.text(); throw new Error(`Erreur Serveur: ${errText}`); } const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "Liasse_Comptable.pdf"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Liasse PDF générée et envoyée !", "success"); } catch (error) { showToast(error.message, "error"); }};
  
  const sauvegarderParametres = async () => { 
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      showToast("Sauvegarde en cours..."); 
      try { 
          const response = await fetch('https://api-salon-backend.onrender.com/api/settings', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(configSalon) }); 
          const data = await handleFetchError(response); 
          showToast(data.message, "success"); 
          chargerTout(); 
          setTimeout(() => { setActiveTab('accueil'); }, 1000); 
      } catch (error) { if(error.message !== "Abonnement inactif") showToast("Erreur serveur.", "error"); }
  };

  const creerRdvManuel = async () => {
      if(isOffline || !navigator.onLine) return showToast("Impossible de créer un RDV hors-ligne.", "error");
      try {
          const datetime = `${formRdv.date}T${formRdv.heure}:00`;
          const res = await fetch('https://api-salon-backend.onrender.com/api/rdv', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...formRdv, date_heure_debut: datetime}) });
          if(res.ok) { setShowModalRdv(false); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous créé", "success"); }
      } catch(e) { showToast("Erreur de création.", "error"); }
  }

  const ouvrirRdvSelectionne = (rdv) => {
      setRdvSelectionne(rdv);
      setIsEditingRdv(false);
      const d = new Date(rdv.date_heure_debut.replace('Z', ''));
      setEditRdvForm({
          date: formatDateInput(d),
          heure: d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
          prestation: rdv.prestation,
          id_employe: rdv.id_employe || ''
      });
  };

  const sauvegarderModifRdv = async () => {
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      try {
          const datetime = `${editRdvForm.date}T${editRdvForm.heure}:00`;
          const res = await fetch(`https://api-salon-backend.onrender.com/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ ...editRdvForm, date_heure_debut: datetime }) });
          if(res.ok) { setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous modifié", "success"); }
      } catch(e) { showToast("Erreur lors de la modification.", "error"); }
  };

  const demanderSuppressionRdv = () => {
      setConfirmDialog({ titre: "Supprimer le rendez-vous", message: "Êtes-vous sûr de vouloir annuler ce rendez-vous ? Cette action est irréversible.", btnTexte: "Supprimer le RDV", action: executerSuppressionRdv });
  };
  const executerSuppressionRdv = async () => {
      if(isOffline || !navigator.onLine) { setConfirmDialog(null); return showToast("Action impossible hors-ligne.", "error"); }
      setConfirmDialog(null);
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'DELETE', headers: getAuthHeaders() });
          if(res.ok) { setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous supprimé", "success"); }
      } catch(e) { showToast("Erreur lors de la suppression.", "error"); }
  };

  const demanderZDeCaisse = () => {
      setConfirmDialog({ titre: "Clôture Journalière (Z)", message: "Êtes-vous sûr de vouloir clôturer la caisse d'aujourd'hui ? Les données seront cryptées et figées de manière irréversible selon la loi NF525.", btnTexte: "Générer le Z", action: executerZDeCaisse });
  };
  const executerZDeCaisse = async () => {
      if(isOffline || !navigator.onLine) { setConfirmDialog(null); return showToast("Impossible de sceller la caisse sans réseau.", "error"); }
      setConfirmDialog(null);
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/cloture', { method: 'POST', headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
      } catch(e) { showToast("Erreur lors de la clôture.", "error"); }
  };

  const SvgEmptyState = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
  );

  let clientCaisseObj = null;
  let isEligibleFidelite = false;
  let texteRecompense = '';

  if (clientCaisse) {
      clientCaisseObj = clientsListe.find(c => c.id_client.toString() === clientCaisse);
      if (clientCaisseObj && configSalon.fidelite_type !== 'NONE') {
          if (configSalon.fidelite_type === 'POINTS' && (clientCaisseObj.points_fidelite || 0) >= configSalon.fidelite_points_seuil) {
              isEligibleFidelite = true;
              texteRecompense = `-${configSalon.fidelite_points_valeur}€ offerts`;
          } else if (configSalon.fidelite_type === 'TAMPONS' && (clientCaisseObj.tampons_fidelite || 0) >= configSalon.fidelite_tampons_seuil) {
              isEligibleFidelite = true;
              texteRecompense = configSalon.fidelite_recompense_type === 'MONTANT' ? `-${configSalon.fidelite_recompense_valeur}€ offerts` : 
                                configSalon.fidelite_recompense_type === 'POURCENTAGE' ? `-${configSalon.fidelite_recompense_valeur}% appliqués` : 
                                `Cadeau: ${configSalon.fidelite_recompense_valeur}`;
          }
      }
  }

  if (resetTokenUrl) {
      return (
        <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '90vh', position: 'relative' }}>
          <ThemeToggle isFixed={true} />
          <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '32px' }}>
            <div className="logo-container"><img src={isDarkMode ? "/IMG_6805.png" : "/IMG_6804.png"} alt="STACK Logo" className="app-logo" /></div>
            <h2 style={{color: 'var(--text-main)'}}>Nouveau mot de passe</h2>
            <p style={{fontSize:'13px', color:'var(--text-secondary)'}}>Votre lien est sécurisé et valable 15 minutes.</p>
            <input type="password" placeholder="Votre nouveau mot de passe" className="input-fournisseur" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <button className="btn-action" style={{ width: '100%', marginTop: '16px' }} onClick={async () => {
               const res = await fetch('https://api-salon-backend.onrender.com/api/reset-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: resetTokenUrl, nouveau_mot_de_passe: newPassword}) });
               if(res.ok) { showToast("Mot de passe mis à jour !", "success"); setTimeout(() => window.location.href = '/', 2000); } else { showToast("Lien expiré ou invalide.", "error"); }
            }}>Confirmer la modification</button>
          </div>
        </div>
      )
  }

  if (!token) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh', position: 'relative' }}>
        <ThemeToggle isFixed={true} />
        <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '32px' }}>
          <div className="logo-container"><img src={isDarkMode ? "/IMG_6805.png" : "/IMG_6804.png"} alt="STACK Logo" className="app-logo" /></div>

          <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px'}}>
             <button onClick={() => {setLoginType('gerant'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'gerant' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'gerant' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease'}}>Gérant</button>
             <button onClick={() => {setLoginType('employe'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'employe' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'employe' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease'}}>Employé</button>
          </div>
          
          {isForgotPassword ? (
              <>
                 <h2 style={{color: 'var(--text-main)'}}>Mot de passe oublié</h2>
                 <p style={{fontSize:'13px', color:'var(--text-secondary)', marginBottom: '24px'}}>Saisissez votre email pour réinitialiser l'accès.</p>
                 {msgSucces && <div style={{backgroundColor: 'var(--bg-success)', color: 'var(--color-success)', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', marginBottom: '16px', fontWeight: '500'}}>{msgSucces}</div>}
                 <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '12px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                 <button className="btn-action" onClick={motDePasseOublie} style={{ width: '100%', marginTop: '8px' }}>Recevoir le lien</button>
                 <p style={{fontSize: '13px', color: 'var(--text-main)', marginTop: '24px', cursor: 'pointer', fontWeight: '500'}} onClick={() => setIsForgotPassword(false)}>Retour à la connexion</p>
              </>
          ) : (
             <>
                {erreurLogin && (<div style={{ backgroundColor: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>{erreurLogin}</div>)}
                {loginType === 'gerant' ? (
                   <>
                      {!isLoginMode && (<input type="text" className="input-fournisseur" placeholder="Nom de votre salon" style={{marginBottom: '12px'}} value={nomSalonInput} onChange={(e) => setNomSalonInput(e.target.value)} />)}
                      <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '12px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                      <input type="password" className="input-fournisseur" placeholder="Mot de passe" value={motDePasseInput} onChange={(e) => setMotDePasseInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (isLoginMode ? seConnecter() : sInscrire())} />
                      <button className="btn-action" onClick={isLoginMode ? seConnecter : sInscrire} style={{ width: '100%', marginTop: '16px' }}>{isLoginMode ? 'Se connecter' : "S'inscrire"}</button>
                      <div style={{display:'flex', justifyContent:'space-between', marginTop: '24px'}}>
                         <p style={{fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', margin:0, fontWeight: '600'}} onClick={() => { setIsLoginMode(!isLoginMode); setErreurLogin(null); }}>{isLoginMode ? "Créer un compte" : "Se connecter"}</p>
                         {isLoginMode && <p style={{fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', margin:0}} onClick={() => setIsForgotPassword(true)}>Oublié ?</p>}
                      </div>
                   </>
                ) : (
                   <>
                      <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{marginBottom: '12px'}} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                      <input type="text" className="input-fournisseur" placeholder="Votre prénom" style={{marginBottom: '12px'}} value={nomEmployeInput} onChange={(e) => setNomEmployeInput(e.target.value)} />
                      <input type="password" maxLength="4" className="input-fournisseur" placeholder="Code PIN à 4 chiffres" value={pinEmployeInput} onChange={(e) => setPinEmployeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && seConnecter()} />
                      <button className="btn-action" onClick={seConnecter} style={{ width: '100%', marginTop: '16px' }}>Accéder au Planning</button>
                   </>
                )}
             </>
          )}
        </div>
      </div>
    );
  }

  if (isAbonnementInactif && userRole === 'gerant') {
     return (
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh', position: 'relative' }}>
        <ThemeToggle isFixed={true} />
        <div className="carte" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '32px' }}>
          <div className="logo-container"><img src={isDarkMode ? "/IMG_6805.png" : "/IMG_6804.png"} alt="STACK Logo" className="app-logo" /></div>
          <h2 style={{color: 'var(--text-main)', margin: '0 0 8px 0'}}>Abonnement Requis</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>Pour accéder à votre tableau de bord, gérer votre catalogue et activer les automatisations, vous devez activer votre abonnement mensuel.</p>
          <h1 style={{color: 'var(--text-main)', marginBottom: '24px'}}>49.00 <span style={{fontSize: '20px', color: 'var(--text-secondary)'}}>€ / mois</span></h1>
          <button className="btn-action" onClick={lancerPaiementStripe} style={{ width: '100%' }}>Payer de manière sécurisée avec Stripe</button>
          <button onClick={seDeconnecter} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', marginTop: '24px', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline'}}>Me déconnecter</button>
        </div>
      </div>
     );
  }

  const role = userRole;
  const heureDebutAgenda = Math.max(0, Math.min(23, parseInt(configSalon.heure_ouverture) || 8));
  const heureFinAgenda = Math.max(heureDebutAgenda, Math.min(23, parseInt(configSalon.heure_fermeture) || 20));
  const nbHeures = Math.max(1, heureFinAgenda - heureDebutAgenda + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* BANDEAU HORS-LIGNE CRITIQUE */}
      {isOffline && (
        <div style={{ background: '#dc2626', color: 'white', textAlign: 'center', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', zIndex: 10000, width: '100%', boxSizing: 'border-box' }}>
            ⚠️ Connexion perdue. Mode hors-ligne activé. Les encaissements sont sauvegardés localement.
        </div>
      )}

      {/* POP-UP INTELLIGENT DE L'IA (STOCK & CLIENT) */}
      {modalIA && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '400px'}}>
                  <div style={{color: 'var(--btn-primary)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                      <span style={{fontSize: '48px'}}>🤖</span>
                  </div>
                  <h2 style={{margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '20px'}}>
                      {modalIA.type_tache === 'STOCK' ? "Nouvelle commande détectée" : "Nouveau client détecté"}
                  </h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px'}}>
                      {modalIA.type_tache === 'STOCK' ? "L'IA a lu vos emails et trouvé une facture." : "L'IA a trouvé une demande de rendez-vous."}
                  </p>
                  
                  <div style={{textAlign: 'left', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', marginBottom: '24px'}}>
                      {modalIA.type_tache === 'STOCK' && (
                          <>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Article commandé</label>
                              <input className="input-fournisseur" style={{marginBottom: '12px'}} value={modalIA.donnees.nom_produit || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, nom_produit: e.target.value}})} />
                              
                              <div style={{display: 'flex', gap: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Quantité reçue</label>
                                      <input type="number" className="input-fournisseur" value={modalIA.donnees.quantite || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, quantite: parseInt(e.target.value)}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Référence</label>
                                      <input className="input-fournisseur" placeholder="Optionnel" value={modalIA.donnees.reference || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, reference: e.target.value}})} />
                                  </div>
                              </div>
                          </>
                      )}
                      {modalIA.type_tache === 'CLIENT' && (
                          <>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Nom du client</label>
                              <input className="input-fournisseur" style={{marginBottom: '12px'}} value={modalIA.donnees.nom || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, nom: e.target.value}})} />
                              
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Téléphone</label>
                              <input className="input-fournisseur" value={modalIA.donnees.telephone || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, telephone: e.target.value}})} />
                          </>
                      )}
                  </div>
                  
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => ignorerTacheIA(modalIA)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Ignorer</button>
                      <button onClick={() => validerTacheIA(modalIA)} className="btn-action" style={{flex: 2}}>
                          {modalIA.type_tache === 'STOCK' ? "Ajouter au stock" : "Ajouter au CRM"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div className="navbar-sidebar" style={isMobile ? { flexDirection: 'row', top: 'auto', bottom: 0, width: '100%', height: '90px', padding: '10px 16px 20px 16px', boxSizing: 'border-box', borderRight: 'none', borderTop: '1px solid var(--border-color)', justifyContent: 'space-between', overflowX: 'auto', zIndex: 1000 } : {}}>
             {role === 'gerant' && (
                 <div className={`nav-item ${activeTab === 'accueil' ? 'active' : ''}`} onClick={() => setActiveTab('accueil')} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span>Bord</span></div>
             )}
             
             <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')} style={{ position: 'relative', ...(isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}) }}>
                 {tachesIA && tachesIA.some(t => t.type_tache === 'CLIENT') && <span className="badge-ia-rouge"></span>}
                 <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span><span>Agenda</span>
             </div>
             
             {role === 'gerant' && (
                 <>
                    <div className={`nav-item ${activeTab === 'caisse' ? 'active' : ''}`} onClick={() => setActiveTab('caisse')} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span><span>Caisse</span></div>
                    <div className={`nav-item ${activeTab === 'gestion' ? 'active' : ''}`} onClick={() => setActiveTab('gestion')} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span><span>Gestion</span></div>
                    
                    <div className={`nav-item ${activeTab === 'produits' ? 'active' : ''}`} onClick={() => setActiveTab('produits')} style={{ position: 'relative', ...(isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}) }}>
                        {tachesIA && tachesIA.some(t => t.type_tache === 'STOCK') && <span className="badge-ia-rouge"></span>}
                        <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span><span>Stocks</span>
                    </div>
                    
                    <div className={`nav-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => setActiveTab('rh')} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span>Équipe</span></div>
                    <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto' } : {}}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span><span>Compta</span></div>
                 </>
             )}
             <div className="navbar-spacer" style={isMobile ? { display: 'none' } : {}}></div>
             <div className="nav-item" onClick={seDeconnecter} style={isMobile ? { minWidth: '60px', padding: '4px', margin: 0, width: 'auto', color: 'var(--color-danger)' } : { color: 'var(--color-danger)' }} title="Se déconnecter"><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span style={{fontWeight: 500}}>Quitter</span></div>
          </div>

          <div className="main-content" style={{ overflowY: 'auto', flex: 1, ...(isMobile ? { paddingTop: '65px', paddingBottom: '110px' } : {}) }}>
            <div className={`dashboard-container ${activeTab === 'caisse' || activeTab === 'agenda' ? 'wide' : ''}`}>
              
              {activeTab === 'agenda' && (
                <div className="admin-container">
                  <div className="agenda-header">
                      <div style={{display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap'}}>
                          <h1 style={{margin: 0}}>Agenda</h1>
                          <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                              <button onClick={() => changerPeriode(-1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>◀</button>
                              <span style={{fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', padding: '0 10px'}}>{joursSemaine[0].toLocaleDateString('fr-FR', {month: 'short'})} {joursSemaine[0].getFullYear()}</span>
                              <button onClick={() => changerPeriode(1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>▶</button>
                              <button onClick={resetToToday} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px'}}>Aujourd'hui</button>
                          </div>
                      </div>
                      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                          <ThemeToggle />
                          <button onClick={() => setShowModalRdv(true)} className="btn-action">+ Nouveau RDV</button>
                          {role === 'gerant' && (
                              <select className="agenda-filtre" value={filtreAgenda} onChange={(e) => setFiltreAgenda(e.target.value)} style={{width: 'auto'}}>
                                  <option value="TOUS">Tous les collaborateurs</option>
                                  {employesListe.map(emp => <option key={emp.id_employe} value={emp.nom}>{emp.nom}</option>)}
                              </select>
                          )}
                      </div>
                  </div>

                  {/* --- GRILLE AGENDA 100% DYNAMIQUE & CORRECTION BUG CSS --- */}
                  <div className="week-calendar">
                      <div className="week-header-row">
                          <div className="time-spacer"></div>
                          {joursSemaine.map((jour, index) => (
                              <div key={index} className={`day-header ${isToday(jour) ? 'today' : ''}`}>
                                  <span className="day-name">{jour.toLocaleDateString('fr-FR', {weekday: 'short'})}</span>
                                  <span className="day-number">{jour.getDate()}</span>
                              </div>
                          ))}
                      </div>

                      <div className="week-body" style={{ overflowY: 'auto', background: 'var(--bg-card)' }}>
                          <div style={{ display: 'flex', position: 'relative', height: `${nbHeures * 80}px`, minHeight: '100%' }}>
                              <div className="time-column" style={{ width: '64px', flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-app)' }}>
                                  {Array.from({ length: nbHeures }).map((_, i) => (
                                      <div key={i} className="time-label" style={{ height: '80px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', paddingRight: '10px', transform: 'translateY(-7px)', fontWeight: '500' }}>
                                          {heureDebutAgenda + i} h
                                      </div>
                                  ))}
                              </div>
                              
                              <div className="days-container" style={{ display: 'flex', flex: 1, position: 'relative' }}>
                                  {joursSemaine.map((jour, indexJour) => {
                                      const dateStringJour = formatDateInput(jour);
                                      const rdvsDuJour = planningData.filter(rdv => {
                                          const rdvDateStr = rdv.date_heure_debut.replace('Z', '').split('T')[0];
                                          return rdvDateStr === dateStringJour && (role === 'employe' || filtreAgenda === 'TOUS' || rdv.nom_employe === filtreAgenda);
                                      });

                                      return (
                                          <div key={indexJour} className="day-column" style={{ flex: 1, borderRight: '1px solid var(--border-color)', position: 'relative', backgroundImage: 'linear-gradient(to bottom, var(--border-color) 1px, transparent 1px)', backgroundSize: '100% 80px' }}>
                                              {rdvsDuJour.map((rdv) => {
                                                  const dateDebut = new Date(rdv.date_heure_debut.replace('Z', ''));
                                                  const ECHELLE_HEURE = 80;
                                                  const dureeReelle = rdv.duree_minutes || 30;
                                                  const topPosition = ((dateDebut.getHours() - heureDebutAgenda) * ECHELLE_HEURE) + (dateDebut.getMinutes() * (ECHELLE_HEURE / 60));
                                                  const hauteurCard = Math.max((dureeReelle * (ECHELLE_HEURE / 60)), 26);
                                                  const backgroundColor = COULEURS_EMPLOYES[(rdv.id_employe || 0) % COULEURS_EMPLOYES.length];

                                                  return (
                                                      <div key={rdv.id_rdv} onClick={() => ouvrirRdvSelectionne(rdv)}
                                                           style={{ position: 'absolute', left: '2px', width: 'calc(100% - 4px)', boxSizing: 'border-box', top: `${topPosition}px`, height: `${hauteurCard}px`, backgroundColor: backgroundColor, color: '#111827', borderRadius: '6px', padding: '4px 6px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer', zIndex: 5 }}>
                                                          <div style={{fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{dateDebut.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {rdv.nom_client}</div>
                                                          <div style={{fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rdv.prestation}</div>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  </div>

                  {showModalRdv && (
                      <div className="modal-overlay">
                          <div className="modal-content">
                              <div className="modal-header">
                                  <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Nouveau Rendez-vous</h3>
                                  <button className="modal-close-btn" onClick={() => setShowModalRdv(false)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              <input type="text" className="input-fournisseur" placeholder="Nom du Client" value={formRdv.nom_client} onChange={e => setFormRdv({...formRdv, nom_client: e.target.value})} style={{marginBottom:'12px'}}/>
                              <input type="text" className="input-fournisseur" placeholder="Téléphone" value={formRdv.telephone_client} onChange={e => setFormRdv({...formRdv, telephone_client: e.target.value})} style={{marginBottom:'12px'}}/>
                              <select className="input-fournisseur" value={formRdv.id_employe} onChange={e => setFormRdv({...formRdv, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
                                  <option value="">-- Choisir un collaborateur --</option>
                                  {employesListe.map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                              </select>
                              <input type="text" className="input-fournisseur" placeholder="Prestation" value={formRdv.prestation} onChange={e => setFormRdv({...formRdv, prestation: e.target.value})} style={{marginBottom:'12px'}}/>
                              <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                                  <input type="date" className="input-fournisseur" value={formRdv.date} onChange={e => setFormRdv({...formRdv, date: e.target.value})} />
                                  <input type="time" className="input-fournisseur" value={formRdv.heure} onChange={e => setFormRdv({...formRdv, heure: e.target.value})} />
                              </div>
                              <button onClick={creerRdvManuel} className="btn-action" style={{width:'100%'}}>Créer le rendez-vous</button>
                          </div>
                      </div>
                  )}

                  {rdvSelectionne && (
                      <div className="modal-overlay">
                          <div className="modal-content">
                              <div className="modal-header">
                                  <h3 style={{margin: 0, fontSize: '18px'}}>{!isEditingRdv ? "Détails du Rendez-vous" : "Modifier le Rendez-vous"}</h3>
                                  <button className="modal-close-btn" onClick={() => setRdvSelectionne(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              
                              {!isEditingRdv ? (
                                  <>
                                      <div style={{marginBottom: '24px', padding: '16px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)'}}>
                                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}}><span style={{color: 'var(--text-secondary)'}}>Client</span> <strong style={{color: 'var(--text-main)'}}>{rdvSelectionne.nom_client}</strong></div>
                                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}}><span style={{color: 'var(--text-secondary)'}}>Téléphone</span> <strong>{rdvSelectionne.telephone_client}</strong></div>
                                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}}><span style={{color: 'var(--text-secondary)'}}>Service</span> <strong>{rdvSelectionne.prestation}</strong></div>
                                          <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: 'var(--text-secondary)'}}>Collaborateur</span> <strong>{rdvSelectionne.nom_employe}</strong></div>
                                      </div>
                                      <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                          {role === 'gerant' && <button onClick={() => setIsEditingRdv(true)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s'}}>Modifier l'horaire</button>}
                                          {rdvSelectionne.stripe_payment_id && role === 'gerant' && <button onClick={() => window.open(`https://dashboard.stripe.com/payments/${rdvSelectionne.stripe_payment_id}`, '_blank')} className="btn-action">Gérer l'acompte (Stripe)</button>}
                                          {role === 'gerant' && <button onClick={demanderSuppressionRdv} style={{background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Supprimer le rendez-vous</button>}
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      <select className="input-fournisseur" value={editRdvForm.id_employe} onChange={e => setEditRdvForm({...editRdvForm, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
                                          <option value="">-- Choisir un collaborateur --</option>
                                          {employesListe.map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                                      </select>
                                      <input type="text" className="input-fournisseur" placeholder="Prestation" value={editRdvForm.prestation} onChange={e => setEditRdvForm({...editRdvForm, prestation: e.target.value})} style={{marginBottom:'12px'}}/>
                                      <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                                          <input type="date" className="input-fournisseur" value={editRdvForm.date} onChange={e => setEditRdvForm({...editRdvForm, date: e.target.value})} />
                                          <input type="time" className="input-fournisseur" value={editRdvForm.heure} onChange={e => setEditRdvForm({...editRdvForm, heure: e.target.value})} />
                                      </div>
                                      <div style={{display: 'flex', gap: '12px'}}>
                                        <button onClick={() => setIsEditingRdv(false)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer'}}>Annuler</button>
                                        <button onClick={sauvegarderModifRdv} className="btn-action" style={{flex: 2}}>Enregistrer</button>
                                      </div>
                                  </>
                              )}
                          </div>
                      </div>
                  )}
                </div>
              )}

              {role === 'gerant' && activeTab === 'accueil' && (
                <>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                    <h1 style={{margin: 0}}>Tableau de bord <span style={{fontSize: '14px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '10px'}}>(ID de votre salon : {decodeToken(token)?.id_salon})</span></h1>
                    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                      <ThemeToggle />
                      <button onClick={() => setActiveTab('parametres')} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, width: '22px', height: '22px', transition: 'color 0.2s'}} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'} title="Paramètres">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      </button>
                    </div>
                  </div>
                  <span className="date-subtitle">{formatDateComplete(new Date())}</span>
                  {erreur && <p style={{color: 'var(--color-danger)'}}>❌ {erreur}</p>}
                  
                  {!dashboardData && !erreur ? (
                    <div>
                      <div className="carte skeleton-loading" style={{height: '100px', marginBottom: '24px'}}></div>
                      <div className="cartes-financieres"><div className="carte skeleton-loading" style={{height: '120px'}}></div><div className="carte skeleton-loading" style={{height: '120px'}}></div></div>
                      <div className="carte skeleton-loading" style={{height: '200px'}}></div>
                    </div>
                  ) : dashboardData && (
                    <>
                      {dashboardData.marketing && (
                        <div className="carte reputation-carte">
                          <div className="reputation-gauche">
                            <h3 style={{color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px'}}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Google Maps</h3>
                            <div className="reputation-note">{dashboardData.marketing.note_actuelle} <span className="reputation-etoile" style={{color: '#fbbf24'}}>★</span></div>
                            <span className="reputation-avis">Sur {dashboardData.marketing.total_avis} avis</span>
                          </div>
                          <div className="reputation-droite"><span className="tendance-label">En hausse ↗</span>{dessinerCourbe(dashboardData.marketing.tendance_6_mois)}</div>
                        </div>
                      )}
                      
                      <div className="cartes-financieres">
                        <div className="carte">
                          <div className="carte-titre-container"><div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><h3>Chiffre d'Affaires</h3></div>
                          <p className="montant">{dashboardData.finances.chiffre_affaires_total} <span className="devise">€</span></p>
                        </div>
                        <div className="carte">
                          <div className="carte-titre-container"><div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><h3>Panier Moyen</h3></div>
                          <p className="montant">{dashboardData.finances.panier_moyen} <span className="devise">€</span></p>
                        </div>
                      </div>
                      <div className="section-titre">Top 3 Prestations</div>
                      <div className="top-prestations">
                        {dashboardData.top_3_prestations.length === 0 ? (
                            <div className="empty-state"><SvgEmptyState /><p>Aucune prestation enregistrée.</p></div>
                        ) : dashboardData.top_3_prestations.map((presta, i) => (
                          <div className="presta-item" key={i}><div className="presta-header"><span className="presta-nom"> {presta.nom}</span>{i === 0 && <span className="badge-succes">N°1</span>}</div><div className="presta-details"><span>Total généré</span><span className="montant-presta">{presta.total_genere} <span className="devise" style={{fontSize:'12px'}}>€</span></span></div></div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {role === 'gerant' && activeTab === 'gestion' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <h1 style={{margin: 0}}>Gestion du Salon</h1>
                      <ThemeToggle />
                  </div>
                  <span className="date-subtitle">Remplissez votre base de données</span>
                  
                  <div className="section-titre">Catalogue (Prestations & Produits)</div>
                  <div className="carte scan-carte">
                    <div style={{display: 'flex', gap: '12px'}}>
                      <input type="text" className="input-fournisseur" placeholder={newArticle.type_article === 'PRODUIT_REVENTE' ? "Nom (Laissez vide si réassort)" : "Nom (ex: Coupe Homme)"} value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value})} />
                      <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '100px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value})} />
                    </div>
                    <div style={{display: 'flex', gap: '12px', marginTop: '12px', marginBottom: '16px'}}>
                      <select className="input-fournisseur" value={newArticle.type_article} onChange={(e) => setNewArticle({...newArticle, type_article: e.target.value, reference: '', stock_actuel: ''})}>
                        <option value="PRESTATION">Prestation (Service)</option>
                        <option value="PRODUIT_REVENTE">Produit Revente (Stock)</option>
                      </select>
                      {newArticle.type_article === 'PRODUIT_REVENTE' && (
                        <>
                          <input type="text" className="input-fournisseur" placeholder="Réf." style={{width: '150px'}} value={newArticle.reference} onChange={(e) => setNewArticle({...newArticle, reference: e.target.value})} />
                          <input type="number" className="input-fournisseur" placeholder="Qté" style={{width: '90px'}} value={newArticle.stock_actuel} onChange={(e) => setNewArticle({...newArticle, stock_actuel: e.target.value})} />
                        </>
                      )}
                    </div>
                    <button className="btn-action" onClick={ajouterArticle} disabled={(newArticle.type_article === 'PRESTATION' && (!newArticle.nom || !newArticle.prix)) || (newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.reference)} style={{width: '100%'}}>{newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.nom ? 'Mettre à jour le stock' : 'Ajouter au catalogue'}</button>
                    <div style={{marginTop: '24px'}}>
                      {catalogueListe.length === 0 ? (
                          <div className="empty-state" style={{padding: '20px'}}><p>Catalogue vide.</p></div>
                      ) : catalogueListe.map(art => (
                        <div key={art.id_article} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                          <span><strong style={{color: 'var(--text-main)'}}>{art.nom}</strong> - {art.prix} € {art.reference && <span style={{color: 'var(--text-muted)', marginLeft: '8px'}}>(Réf: {art.reference})</span>}</span>
                          <button onClick={() => supprimerArticle(art.id_article)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="section-titre" style={{marginTop: '32px'}}>Équipe & Commissions</div>
                  <div className="carte scan-carte">
                    <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                      <input type="text" className="input-fournisseur" placeholder="Nom du collaborateur" value={newEmploye.nom} onChange={(e) => setNewEmploye({...newEmploye, nom: e.target.value})} />
                      <input type="password" maxLength="4" className="input-fournisseur" placeholder="PIN (ex: 1234)" value={newEmploye.code_pin} onChange={(e) => setNewEmploye({...newEmploye, code_pin: e.target.value})} style={{width: '120px'}}/>
                    </div>

                    <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px'}}>Photo de profil (Optionnel)</label>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                        <div className="rh-avatar" style={{width: '40px', height: '40px', flexShrink: 0, border: 'none', background: 'transparent'}}>
                            {newEmploye.photo_url ? (
                                <img src={newEmploye.photo_url} alt="Aperçu" style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%'}} />
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--text-muted)', width: '24px', height: '24px'}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            )}
                        </div>
                        <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={handleImageUpload} style={{fontSize: '12px', color: 'var(--text-main)'}} />
                    </div>

                    <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                      <input type="number" className="input-fournisseur" placeholder="% Com. Prestations" value={newEmploye.taux_commission_prestation} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_prestation: e.target.value})} />
                      <input type="number" className="input-fournisseur" placeholder="% Com. Produits" value={newEmploye.taux_commission_produit} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_produit: e.target.value})} />
                    </div>
                    <button className="btn-action" onClick={ajouterEmploye} disabled={!newEmploye.nom || !newEmploye.code_pin} style={{width: '100%'}}>Ajouter un collaborateur</button>
                    <div style={{marginTop: '24px'}}>
                      {employesListe.length === 0 ? (
                          <div className="empty-state" style={{padding: '20px'}}><p>Aucun collaborateur.</p></div>
                      ) : employesListe.map(emp => (
                        <div key={emp.id_employe} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                          <span style={{fontWeight: '500', color: 'var(--text-main)'}}>{emp.nom} <span style={{color: 'var(--text-muted)', fontWeight: 'normal'}}>(PIN: {emp.code_pin || '0000'})</span></span>
                          <button onClick={() => supprimerEmploye(emp.id_employe)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="section-titre" style={{marginTop: '32px'}}>Base Clients (CRM)</div>
                  <div className="carte scan-carte">
                    <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                      <input type="text" className="input-fournisseur" placeholder="Prénom" value={newClient.prenom} onChange={(e) => setNewClient({...newClient, prenom: e.target.value})} />
                      <input type="text" className="input-fournisseur" placeholder="Nom" value={newClient.nom} onChange={(e) => setNewClient({...newClient, nom: e.target.value})} />
                    </div>
                    <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                      <input type="tel" className="input-fournisseur" placeholder="Téléphone" value={newClient.telephone} onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} />
                      <input type="date" className="input-fournisseur" placeholder="Date de naissance" value={newClient.date_naissance} onChange={(e) => setNewClient({...newClient, date_naissance: e.target.value})} />
                    </div>
                    <button className="btn-action" onClick={ajouterClient} disabled={!newClient.nom} style={{width: '100%'}}>Ajouter un client</button>
                    <div style={{marginTop: '24px'}}>
                      {clientsListe.length === 0 ? (
                          <div className="empty-state" style={{padding: '20px'}}><p>Base client vide.</p></div>
                      ) : clientsListe.map(cli => (
                        <div key={cli.id_client} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                          <span style={{cursor: 'pointer', color: 'var(--color-info)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'}} onClick={() => ouvrirFicheClient(cli)}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            {formatNomClient(cli)} <span style={{color: 'var(--text-muted)', fontWeight: 'normal'}}>({cli.telephone || 'Pas de numéro'})</span>
                          </span>
                          <button onClick={() => supprimerClient(cli.id_client)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* --- MODAL FICHE CLIENT (CRM) --- */}
                  {clientSelectionne && (
                      <div className="modal-overlay">
                          <div className="modal-content">
                              <div className="modal-header">
                                  <div>
                                    <h2 style={{margin: 0, fontSize: '20px', color: 'var(--text-main)'}}>{formatNomClient(clientSelectionne)}</h2>
                                    <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>{clientSelectionne.telephone}</span>
                                  </div>
                                  <button className="modal-close-btn" onClick={() => setClientSelectionne(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              
                              {chargementFiche ? (
                                  <div className="skeleton-loading" style={{height: '200px'}}></div>
                              ) : (
                                <>
                                  {configSalon.fidelite_type !== 'NONE' && (
                                      <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '24px'}}>
                                          <h4 style={{margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px'}}>🎁 Programme Fidélité</h4>
                                          {(() => {
                                              const current = configSalon.fidelite_type === 'POINTS' ? (clientSelectionne.points_fidelite || 0) : (clientSelectionne.tampons_fidelite || 0);
                                              const max = configSalon.fidelite_type === 'POINTS' ? configSalon.fidelite_points_seuil : configSalon.fidelite_tampons_seuil;
                                              const percentage = Math.min(100, (current / max) * 100);
                                              const label = configSalon.fidelite_type === 'POINTS' ? 'Points' : 'Tampons';
                                              return (
                                                  <>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px'}}>
                                                          <span>Progression ({label})</span>
                                                          <strong style={{color: 'var(--text-main)'}}>{current} / {max}</strong>
                                                      </div>
                                                      <div style={{height: '10px', background: 'var(--border-color)', borderRadius: '10px', overflow: 'hidden'}}>
                                                          <div style={{height: '100%', width: `${percentage}%`, background: percentage >= 100 ? 'var(--color-success)' : 'var(--color-info)', transition: 'width 0.5s ease'}} />
                                                      </div>
                                                      {percentage >= 100 && <p style={{margin: '8px 0 0 0', fontSize: '12px', color: 'var(--color-success)', fontWeight: '600'}}>✅ Récompense débloquée !</p>}
                                                  </>
                                              )
                                          })()}
                                      </div>
                                  )}

                                  <div className="section-titre" style={{fontSize: '13px'}}>Dossier Technique</div>
                                  <textarea className="textarea-facture" value={clientHistorique.notes} onChange={e => setClientHistorique({...clientHistorique, notes: e.target.value})} placeholder="Saisissez vos notes techniques (ex: Formule coloration)..." style={{marginBottom: '12px'}}/>
                                  <button className="btn-action" onClick={sauvegarderNotesClient} style={{width: '100%', marginBottom: '32px'}}>Enregistrer le dossier</button>

                                  <div className="section-titre" style={{fontSize: '13px'}}>Rendez-vous passés</div>
                                  {clientHistorique.rdv.length === 0 ? <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px'}}>Aucun historique.</p> : (
                                      <div style={{marginBottom: '32px', background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', padding: '0 12px'}}>
                                          {clientHistorique.rdv.map((r, i) => (
                                              <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i !== clientHistorique.rdv.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                                  <span><strong style={{color: 'var(--text-main)'}}>{new Date(r.date_heure_debut.replace('Z','')).toLocaleDateString()}</strong> - {r.prestation}</span>
                                                  <span style={{color: 'var(--text-muted)'}}>{r.nom_employe}</span>
                                              </div>
                                          ))}
                                      </div>
                                  )}

                                  <div className="section-titre" style={{fontSize: '13px'}}>Historique des Cadeaux / Récompenses</div>
                                  {!clientHistorique.gains || clientHistorique.gains.length === 0 ? (
                                      <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px'}}>Aucune récompense utilisée pour le moment.</p>
                                  ) : (
                                      <div style={{marginBottom: '32px', background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', padding: '0 12px'}}>
                                          {clientHistorique.gains.map((g, i) => (
                                              <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i !== clientHistorique.gains.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                                  <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}><span style={{fontSize: '14px'}}>🎁</span> <strong style={{color: 'var(--text-main)'}}>{new Date(g.date_creation).toLocaleDateString()}</strong></span>
                                                  <span style={{color: 'var(--color-success)', fontWeight: '600'}}>Récompense appliquée</span>
                                              </div>
                                          ))}
                                      </div>
                                  )}

                                  <div className="section-titre" style={{fontSize: '13px'}}>Historique d'Achats (Caisse)</div>
                                  {clientHistorique.achats.length === 0 ? <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun achat en caisse.</p> : (
                                      <div style={{background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', padding: '0 12px'}}>
                                          {clientHistorique.achats.map((a, i) => (
                                              <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i !== clientHistorique.achats.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                                  <span style={{opacity: a.statut === 'ANNULE' ? 0.5 : 1}}>
                                                      <strong style={{color: 'var(--text-main)'}}>{new Date(a.date_creation).toLocaleDateString()}</strong> - {a.article} <span style={{color: 'var(--text-muted)'}}>(x{a.quantite})</span>
                                                  </span>
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                                      <span style={{fontWeight: '600', color: 'var(--text-main)', textDecoration: a.statut === 'ANNULE' ? 'line-through' : 'none'}}>{parseFloat(a.prix_unitaire_ttc).toFixed(2)} €</span>
                                                      {a.statut === 'ANNULE' ? (
                                                          <span style={{fontSize: '11px', fontWeight: 'bold', color: 'var(--color-danger)'}}>ANNULÉ</span>
                                                      ) : (
                                                          <button onClick={() => annulerTicket(a.id_ticket)} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '14px'}} title="Annuler ce paiement">❌</button>
                                                      )}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                                </>
                              )}
                          </div>
                      </div>
                  )}
                </div>
              )}

              {role === 'gerant' && activeTab === 'parametres' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                    <h1 style={{margin: 0}}>Paramètres</h1>
                    <button onClick={() => setActiveTab('accueil')} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)'}}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                  <span className="date-subtitle">Configuration de votre salon</span>
                  
                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>🎁 Programme de Fidélité</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', display:'block', marginBottom: '16px'}}>Définissez les règles pour récompenser vos clients.</span>
                    
                    <select className="input-fournisseur" value={configSalon.fidelite_type} onChange={e => setConfigSalon({...configSalon, fidelite_type: e.target.value})} style={{marginBottom: '16px'}}>
                        <option value="NONE">Désactivé</option>
                        <option value="POINTS">Par Points (1€ = 1 point)</option>
                        <option value="TAMPONS">Carte à Tampons (1 visite = 1 tampon)</option>
                    </select>

                    {configSalon.fidelite_type === 'POINTS' && (
                        <div style={{display: 'flex', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                            <div style={{flex: 1}}>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Points à atteindre</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 100" value={configSalon.fidelite_points_seuil} onChange={e => setConfigSalon({...configSalon, fidelite_points_seuil: e.target.value})} />
                            </div>
                            <div style={{flex: 1}}>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Réduction offerte (€)</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 10" value={configSalon.fidelite_points_valeur} onChange={e => setConfigSalon({...configSalon, fidelite_points_valeur: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {configSalon.fidelite_type === 'TAMPONS' && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                            <div>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Nombre de passages requis</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 10" value={configSalon.fidelite_tampons_seuil} onChange={e => setConfigSalon({...configSalon, fidelite_tampons_seuil: e.target.value})} />
                            </div>
                            <div style={{display: 'flex', gap: '12px'}}>
                                <div style={{flex: 1}}>
                                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Type de récompense</label>
                                    <select className="input-fournisseur" value={configSalon.fidelite_recompense_type} onChange={e => setConfigSalon({...configSalon, fidelite_recompense_type: e.target.value})}>
                                        <option value="MONTANT">Remise fixe (€)</option>
                                        <option value="POURCENTAGE">Pourcentage (%)</option>
                                        <option value="PRODUIT">Produit / Service offert</option>
                                    </select>
                                </div>
                                <div style={{flex: 1}}>
                                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Valeur (Ex: 20, 10, Shampoing)</label>
                                    <input type="text" className="input-fournisseur" value={configSalon.fidelite_recompense_valeur} onChange={e => setConfigSalon({...configSalon, fidelite_recompense_valeur: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    )}

                    <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '24px 0 8px 0'}}>📱 Relance SMS Auto</h4>
                    <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                        <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Délai d'inactivité avant relance (Jours)</label>
                        <input type="number" className="input-fournisseur" placeholder="Ex: 60" value={configSalon.fidelite_delai_sms} onChange={e => setConfigSalon({...configSalon, fidelite_delai_sms: e.target.value})} />
                        <p style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0}}>Un SMS incitatif sera envoyé si le client ne vient pas pendant cette durée.</p>
                    </div>
                  </div>

                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Google My Business</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Connectez vos avis clients en direct.</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API Google" value={configSalon.google_api_key} onChange={(e) => setConfigSalon({...configSalon, google_api_key: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Google Account ID" value={configSalon.google_account_id} onChange={(e) => setConfigSalon({...configSalon, google_account_id: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Google Location ID" value={configSalon.google_location_id} onChange={(e) => setConfigSalon({...configSalon, google_location_id: e.target.value})} />
                  </div>

                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Horaires de l'Agenda</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Modifiez l'affichage de votre grille.</span>
                    <div style={{display: 'flex', gap: '15px'}}>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: '500'}}>Ouverture (0-23)</label>
                        <input type="number" min="0" max="23" className="input-fournisseur" value={configSalon.heure_ouverture} onChange={e => setConfigSalon({...configSalon, heure_ouverture: e.target.value})} />
                      </div>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: '500'}}>Fermeture (0-23)</label>
                        <input type="number" min="0" max="23" className="input-fournisseur" value={configSalon.heure_fermeture} onChange={e => setConfigSalon({...configSalon, heure_fermeture: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Boîte Mail (Robot Comptable)</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>L'IA analysera vos factures fournisseurs.</span>
                    <input type="email" className="input-fournisseur" placeholder="Email du salon" value={configSalon.email_factures} onChange={(e) => setConfigSalon({...configSalon, email_factures: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="password" className="input-fournisseur" placeholder="Mot de passe d'application" value={configSalon.mot_de_passe_email} onChange={(e) => setConfigSalon({...configSalon, mot_de_passe_email: e.target.value})} />
                  </div>
                  
                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Fidélisation (SMS Auto)</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Vos clients recevront un SMS de remerciement.</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API Brevo" value={configSalon.brevo_api_key} onChange={(e) => setConfigSalon({...configSalon, brevo_api_key: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Nom expéditeur (ex: MonSalon)" maxLength="11" value={configSalon.sms_sender_name} onChange={(e) => setConfigSalon({...configSalon, sms_sender_name: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Lien d'avis Google Maps (ex: https://g.page/...)" value={configSalon.lien_google_maps} onChange={(e) => setConfigSalon({...configSalon, lien_google_maps: e.target.value})} />
                  </div>

                  <div className="carte scan-carte">
                    <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>TPE Physique (Stripe Terminal)</h3>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Connectez votre lecteur de carte physique au logiciel de caisse.</span>
                    <input type="text" className="input-fournisseur" placeholder="Identifiant du lecteur (ex: tmr_...)" value={configSalon.stripe_reader_id || ''} onChange={(e) => setConfigSalon({...configSalon, stripe_reader_id: e.target.value})} />
                  </div>

                  <button className="btn-action" style={{marginTop: '8px', width: '100%'}} onClick={sauvegarderParametres}>Enregistrer la configuration</button>
                </div>
              )}

              {/* --- NOUVELLE CAISSE ENREGISTREUSE TACTILE (SPLIT SCREEN) --- */}
              {role === 'gerant' && activeTab === 'caisse' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                    <h1 style={{margin: 0}}>Caisse</h1>
                    <ThemeToggle />
                  </div>

                  <div className="caisse-split-container">
                      {/* PANNEAU GAUCHE */}
                      <div className="caisse-left-panel">
                          {!posEmploye ? (
                            <div className="carte">
                                <h3 style={{color: 'var(--text-main)', marginBottom: '16px', fontWeight: '600', fontSize: '16px'}}>1. Qui réalise la vente ?</h3>
                                {employesListe.length === 0 ? (
                                    <div className="empty-state"><p>Aucun collaborateur enregistré.</p></div>
                                ) : (
                                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '16px'}}>
                                        {employesListe.map((emp, index) => (
                                            <div key={emp.id_employe} onClick={() => handleSelectEmployeCaisse(emp.id_employe)}
                                                style={{ backgroundColor: COULEURS_EMPLOYES[index % COULEURS_EMPLOYES.length], color: '#111827', padding: '24px 12px', borderRadius: 'var(--radius-card)', fontSize: '16px', fontWeight: '600', textAlign: 'center', cursor: 'pointer', transition: 'transform 0.15s ease' }}>
                                                {emp.nom.split(' ')[0]}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                          ) : (
                            <>
                              <div style={{display: 'flex', gap: '12px', marginBottom: '24px'}}>
                                  <button onClick={() => setPosType('PRESTATION')} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', border: 'none', background: posType === 'PRESTATION' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRESTATION' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Prestations</button>
                                  <button onClick={() => setPosType('PRODUIT_REVENTE')} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', border: 'none', background: posType === 'PRODUIT_REVENTE' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRODUIT_REVENTE' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Produits</button>
                              </div>

                              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px'}}>
                                {catalogueListe.filter(art => art.type_article === posType).map(art => (
                                    <div key={art.id_article} onClick={() => ajouterAuPanier(art)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '24px 16px', borderRadius: 'var(--radius-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center', transition: 'border-color 0.2s ease', boxShadow: 'var(--shadow-sm)' }}>
                                      <span style={{fontSize: '14px', fontWeight: '500', color: 'var(--text-main)'}}>{art.nom}</span>
                                      <span style={{fontSize: '18px', fontWeight: '700', color: 'var(--text-main)'}}>{parseFloat(art.prix).toFixed(2)} €</span>
                                    </div>
                                ))}
                              </div>
                              {catalogueListe.filter(art => art.type_article === posType).length === 0 && (
                                  <div className="empty-state">
                                      <SvgEmptyState />
                                      <p>Aucun élément dans cette catégorie.</p>
                                  </div>
                              )}
                            </>
                          )}
                      </div>

                      {/* PANNEAU DROITE */}
                      <div className="caisse-right-panel">
                          {/* --- AFFICHAGE DES ERREURS DE PAIEMENT --- */}
                          {notificationCaisse && (
                              <div style={{padding: '12px', background: 'var(--bg-danger)', color: 'var(--color-danger)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', fontWeight: '600'}}>
                                  {notificationCaisse}
                              </div>
                          )}

                          <div className="ticket-header">
                              <h3 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                  Ticket en cours
                                  {posEmploye && <button onClick={() => { setPosEmploye(null); setClientsSuggeres([]); }} style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer', textDecoration:'underline'}}>Changer employé</button>}
                              </h3>
                              <select className="input-fournisseur" value={clientCaisse} onChange={(e) => { setClientCaisse(e.target.value); setRemiseAppliquee(false); }} style={{fontSize: '13px', padding: '8px'}}>
                                  <option value="">Client de passage (Optionnel)</option>
                                  {clientsListe.map(cli => <option key={cli.id_client} value={cli.id_client.toString()}>{formatNomClient(cli)}</option>)}
                              </select>
                          </div>

                          {/* --- ALERTE INTELLIGENTE FIDÉLITÉ --- */}
                          {isEligibleFidelite && (
                              <div style={{background: 'var(--bg-info)', padding: '12px', borderRadius: 'var(--radius-input)', marginBottom: '16px', border: '1px solid #bfdbfe'}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                      <div>
                                          <span style={{fontSize: '13px', fontWeight: '600', color: 'var(--color-info)', display: 'block'}}>
                                              {configSalon.fidelite_type === 'POINTS' ? '💰 Fidélité atteinte !' : '🎟️ Carte complétée !'}
                                          </span>
                                          <span style={{fontSize: '12px', color: 'var(--color-info)'}}>🎁 {texteRecompense}</span>
                                      </div>
                                      {!remiseAppliquee ? (
                                          <button onClick={() => setRemiseAppliquee(true)} style={{background: 'var(--color-info)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>
                                              Appliquer
                                          </button>
                                      ) : (
                                          <span style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--color-success)'}}>✅ Appliquée</span>
                                      )}
                                  </div>
                              </div>
                          )}

                          <div className="ticket-lignes">
                              {panierCaisse.length === 0 ? (
                                  <p style={{fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px'}}>Sélectionnez des articles à gauche.</p>
                              ) : (
                                  panierCaisse.map((item, index) => (
                                      <div className="ticket-ligne" key={index}>
                                          <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                                              <span className="ticket-ligne-nom">{item.nom}</span>
                                              <span style={{fontSize: '12px', color: 'var(--text-secondary)'}}>{item.quantite} x {item.prix_unitaire.toFixed(2)} €</span>
                                          </div>
                                          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                              <span className="ticket-ligne-prix">{(item.quantite * item.prix_unitaire).toFixed(2)} €</span>
                                              <button className="ticket-ligne-supprimer" onClick={() => retirerDuPanier(item.id_article)}>
                                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                              </button>
                                          </div>
                                      </div>
                                  ))
                              )}
                              {remiseAppliquee && configSalon.fidelite_type !== 'NONE' && (
                                  <div className="ticket-ligne" style={{color: 'var(--color-success)'}}>
                                      <span className="ticket-ligne-nom">🎁 Remise Fidélité</span>
                                      <span className="ticket-ligne-prix">-{Math.max(0, sousTotalCaisse - totalCaisse).toFixed(2)} €</span>
                                  </div>
                              )}
                          </div>

                          <div className="ticket-footer">
                              <div className="ticket-total">
                                  <span>Total TTC</span>
                                  <span>{totalCaisse.toFixed(2)} €</span>
                              </div>
                              
                              {/* CHOIX DU MOYEN DE PAIEMENT */}
                              <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                                  <button onClick={() => setMethodePaiement('CARTE')} disabled={isOffline || !navigator.onLine} style={{flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: methodePaiement === 'CARTE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CARTE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: (isOffline || !navigator.onLine) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', opacity: (isOffline || !navigator.onLine) ? 0.5 : 1}}>💳 TPE</button>
                                  <button onClick={() => setMethodePaiement('ESPECES')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: methodePaiement === 'ESPECES' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'ESPECES' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600'}}>💶 Espèces</button>
                                  <button onClick={() => setMethodePaiement('CHEQUE')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: methodePaiement === 'CHEQUE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CHEQUE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600'}}>📝 Chèque</button>
                              </div>

                              <button className="btn-action" style={{width: '100%', padding: '16px', fontSize: '16px'}} onClick={validerEncaisser} disabled={panierCaisse.length === 0 || !posEmploye}>
                                  Encaisser {(isOffline || !navigator.onLine) ? '(Hors-Ligne)' : ''}
                              </button>
                          </div>
                      </div>
                  </div>
                  
                  {/* --- MODAL SUGGESTION DE CLIENT (SMART POS MULTIPLE) --- */}
                  {clientsSuggeres.length > 0 && (
                      <div className="modal-overlay">
                          <div className="modal-content" style={{textAlign: 'center'}}>
                              <div style={{color: 'var(--btn-primary)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              </div>
                              <h2 style={{margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '20px'}}>
                                  {clientsSuggeres.length === 1 ? `Encaisser ${formatNomClient(clientsSuggeres[0])} ?` : "Quel client encaissez-vous ?"}
                              </h2>
                              <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px'}}>
                                  {clientsSuggeres.length === 1 ? "D'après l'agenda, c'est le client que vous venez de coiffer." : "Plusieurs rendez-vous ont eu lieu récemment avec vous."}
                              </p>
                              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                  {clientsSuggeres.map(client => (
                                      <button key={client.id_client} onClick={() => { setClientCaisse(client.id_client.toString()); setClientsSuggeres([]); setPosStep('type'); }} className="btn-action" style={{padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                          <span style={{fontSize: '16px'}}>✅ {formatNomClient(client)}</span>
                                          <span style={{fontSize: '12px', opacity: 0.8}}>{client.prestation_rdv}</span>
                                      </button>
                                  ))}
                                  <button onClick={() => { setClientCaisse(''); setClientsSuggeres([]); setPosStep('type'); }} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', marginTop: '8px'}}>
                                      ❌ Aucun / Client de passage
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* --- MODAL TICKET ÉCOLOGIQUE (LOI ANTI-GASPI) --- */}
                  {ticketGenere && (
                      <div className="modal-overlay">
                          <div className="modal-content" style={{textAlign: 'center', padding: '40px 32px'}}>
                              <div style={{color: 'var(--color-success)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                                  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                              </div>
                              <h2 style={{marginTop: 0, marginBottom: '8px', color: 'var(--text-main)', fontSize: '24px'}}>Paiement Validé</h2>
                              {ticketGenere.is_offline && <span style={{fontSize: '12px', color: 'var(--color-danger)', fontWeight: 'bold'}}>Ticket sauvegardé hors-ligne</span>}
                              <h1 style={{color: 'var(--text-main)', fontSize: '40px', margin: '0 0 24px 0', letterSpacing: '-0.02em'}}>{ticketGenere.montant.toFixed(2)} <span style={{fontSize: '24px', color: 'var(--text-secondary)'}}>€</span></h1>
                              
                              <div style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: 'var(--radius-card)', marginBottom: '24px', textAlign: 'left'}}>
                                  <span style={{fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Reçu dématérialisé (Loi anti-gaspillage)</span>
                                  
                                  <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                                      <input type="email" className="input-fournisseur" placeholder="Email du client" value={emailTicketClient} onChange={e => setEmailTicketClient(e.target.value)} style={{flex: 1}}/>
                                      <button className="btn-action" onClick={() => envoyerTicketEco('email')} disabled={!emailTicketClient || isOffline || !navigator.onLine}>Envoyer</button>
                                  </div>

                                  <button className="btn-action" onClick={() => envoyerTicketEco('sms')} disabled={!ticketGenere.client_id || isOffline || !navigator.onLine} style={{width: '100%', background: ticketGenere.client_id ? 'var(--btn-primary)' : 'var(--bg-app)', color: ticketGenere.client_id ? 'var(--btn-text)' : 'var(--text-muted)', border: `1px solid ${ticketGenere.client_id ? 'var(--btn-primary)' : 'var(--border-color)'}`}}>
                                      Envoyer par SMS {ticketGenere.client_id ? `(${ticketGenere.client_nom})` : '(Client inconnu)'}
                                  </button>
                              </div>

                              <button onClick={() => setTicketGenere(null)} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: '500', cursor: 'pointer', padding: '10px', transition: 'color 0.15s'}} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>Fermer (Sans reçu)</button>
                          </div>
                      </div>
                  )}
                </div>
              )}

              {role === 'gerant' && activeTab === 'produits' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div>
                          <h1 style={{margin: 0}}>Inventaire</h1>
                          <span className="date-subtitle" style={{margin: 0}}>Gestion intelligente des stocks</span>
                      </div>
                      <ThemeToggle />
                  </div>
                  <div className="stock-container">
                    {stocksData.length === 0 ? (
                        <div className="empty-state">
                            <SvgEmptyState />
                            <p>Aucun produit en stock.</p>
                        </div>
                    ) : stocksData.map((produit) => {
                        const status = getStockStatus(produit.stock_actuel);
                        return (
                          <div className="stock-item" key={produit.id_article}>
                            <div className="stock-info">
                              <div className="stock-details">
                                <span className="stock-nom">{produit.nom}</span>
                                <span className="badge-discret" style={{ backgroundColor: status.bg, color: status.text }}>{status.label}</span>
                              </div>
                            </div>
                            <div className="stock-quantite-container">
                              <span className="stock-quantite">{produit.stock_actuel}</span>
                            </div>
                          </div>
                        );
                    })}
                  </div>
                </div>
              )}

              {/* --- NOUVELLE PAGE RH (ÉQUIPE) --- */}
              {role === 'gerant' && activeTab === 'rh' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div>
                          <h1 style={{margin: 0}}>Ressources Humaines</h1>
                          <span className="date-subtitle" style={{margin: 0}}>Suivi des primes et performances</span>
                      </div>
                      <ThemeToggle />
                  </div>
                  
                  {rhData.length === 0 ? (
                      <div className="empty-state">
                          <SvgEmptyState />
                          <p>Aucun employé enregistré.</p>
                      </div>
                  ) : (
                    <div className="rh-grid">
                      {rhData.map(employe => (
                        <div className="rh-carte" key={employe.id_employe}>
                          
                          <div className="rh-header-profil">
                            <div className="rh-avatar">
                              {employe.photo_url ? (
                                <img src={employe.photo_url} alt={employe.nom} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              )}
                            </div>
                            <div className="rh-identite">
                              <h3>{employe.nom}</h3>
                              <span className="rh-role-badge">{employe.role}</span>
                            </div>
                          </div>

                          <div className="rh-stats-row">
                            <div className="rh-stat-bloc">
                              <span className="valeur">{employe.performances_actuelles.clients_coiffes}</span>
                              <span className="label">Clients</span>
                            </div>
                            <div className="rh-stat-bloc">
                              <span className="valeur">{employe.performances_actuelles.produits_vendus}</span>
                              <span className="label">Produits</span>
                            </div>
                            <div className="rh-stat-bloc">
                              <span className="valeur" style={{color: 'var(--color-success)'}}>+{((employe.performances_actuelles.ca_genere / (dashboardData?.finances?.chiffre_affaires_total || 1)) * 100).toFixed(1)}%</span>
                              <span className="label">CA Généré</span>
                            </div>
                          </div>

                          <div className="rh-prime-box">
                            <span className="label">Prime estimée</span>
                            <span className="montant">{employe.performances_actuelles.prime_estimee.toFixed(2)} <span style={{fontSize: '14px'}}>€</span></span>
                          </div>

                          <div style={{marginTop: '8px'}}>
                            <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '8px', display: 'block'}}>Évolution (6 mois)</span>
                            {dessinerChronogramme(employe.historique_primes)}
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {role === 'gerant' && activeTab === 'admin' && (
                <div className="admin-container">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div>
                          <h1 style={{margin: 0}}>Comptabilité Légale</h1>
                          <span className="date-subtitle" style={{margin: 0}}>Robot IA & Clôtures NF525</span>
                      </div>
                      <ThemeToggle />
                  </div>
                  
                  <div style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)'}}>
                     <div>
                        <h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Clôture Journalière (Z)</h3>
                        <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Obligatoire chaque soir pour sceller les encaissements.</span>
                     </div>
                     <button onClick={demanderZDeCaisse} className="btn-action">Générer le Z</button>
                  </div>
              
                  <div className="carte export-carte"><div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Liasse Mensuelle</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Génération PDF & Envoi Email</span></div><button className="btn-export" onClick={declencherExport}>Exporter</button></div>
                  <div className="section-titre">Historique des factures</div>
                  {historiqueData.length === 0 ? (
                      <div className="empty-state">
                          <SvgEmptyState />
                          <p>Aucune facture traitée.</p>
                      </div>
                  ) : historiqueData.map((dossier, index) => (
                    <div className="dossier-mois" key={index}><div className="dossier-header"><span className="dossier-titre">{dossier.mois}</span><span className="dossier-total" style={{color: 'var(--text-main)'}}>{dossier.total_ttc.toFixed(2)} €</span></div>
                      {dossier.factures.map(facture => (<div className="facture-mini" key={facture.id}><span>{facture.fournisseur} <span style={{color: 'var(--text-muted)'}}>({facture.date})</span></span><span style={{fontWeight: 600, color: 'var(--text-main)'}}>{facture.ttc.toFixed(2)} €</span></div>))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>
      
      {/* --- MODALE GLOBALE DE CONFIRMATION (DANGER) --- */}
      {confirmDialog && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '400px'}}>
                  <div style={{color: 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>{confirmDialog.titre}</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5'}}>{confirmDialog.message}</p>
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setConfirmDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Annuler</button>
                      <button onClick={confirmDialog.action} style={{flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>{confirmDialog.btnTexte}</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- TOAST NOTIFICATIONS JSX --- */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-success)'}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-danger)'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
