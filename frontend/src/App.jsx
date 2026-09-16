import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginType, setLoginType] = useState('gerant'); 
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [erreurLogin, setErreurLogin] = useState(null);
  const [msgSucces, setMsgSucces] = useState(null);
  
  const [emailInput, setEmailInput] = useState('');
  const [motDePasseInput, setMotDePasseInput] = useState('');
  const [nomSalonInput, setNomSalonInput] = useState('');
  const [idSalonInput, setIdSalonInput] = useState('1'); 
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
  const [erreur, setErreur] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const [resetTokenUrl] = useState(urlParams.get('resetToken'));
  const [newPassword, setNewPassword] = useState('');

  // --- TOAST NOTIFICATIONS (Remplacement des alert) ---
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  const [catalogueListe, setCatalogueListe] = useState([]);
  const [employesListe, setEmployesListe] = useState([]);
  const [clientsListe, setClientsListe] = useState([]);
  
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [clientHistorique, setClientHistorique] = useState({ rdv: [], achats: [], notes: '' });
  const [chargementFiche, setChargementFiche] = useState(false);

  const [ticketGenere, setTicketGenere] = useState(null);
  const [emailTicketClient, setEmailTicketClient] = useState('');

  const [newClient, setNewClient] = useState({ nom: '', telephone: '', email: '' });
  const [newEmploye, setNewEmploye] = useState({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '' });
  const [newArticle, setNewArticle] = useState({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '' });

  const [posStep, setPosStep] = useState('employee'); 
  const [posEmploye, setPosEmploye] = useState(null);
  const [posType, setPosType] = useState(null); 
  const COULEURS_EMPLOYES = ['#a2d2ff', '#b9fbc0', '#fcf6bd', '#ffc6ff', '#ffd6a5', '#c8b6ff'];
  const [clientCaisse, setClientCaisse] = useState('');

  // --- AGENDA & CREATION MANUELLE ---
  const getMonday = (d) => { const date = new Date(d); const day = date.getDay(); const diff = date.getDate() - day + (day === 0 ? -6 : 1); return new Date(date.setDate(diff)); };
  const [dateAgendaDebut, setDateAgendaDebut] = useState(getMonday(new Date())); 
  const [filtreAgenda, setFiltreAgenda] = useState('TOUS');
  const [rdvSelectionne, setRdvSelectionne] = useState(null); 
  const [isEditingRdv, setIsEditingRdv] = useState(false);
  const [editRdvForm, setEditRdvForm] = useState({ date: '', heure: '', prestation: '', id_employe: '' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const [showModalRdv, setShowModalRdv] = useState(false);
  const [formRdv, setFormRdv] = useState({ nom_client: '', telephone_client: '', id_employe: '', prestation: '', date: '', heure: '10:00', duree_minutes: 30 });

  const joursSemaine = Array.from({length: 7}).map((_, i) => { const d = new Date(dateAgendaDebut); d.setDate(d.getDate() + i); return d; });

  const [texteFacture, setTexteFacture] = useState('');
  const [nomFournisseur, setNomFournisseur] = useState('');
  const [resultatScan, setResultatScan] = useState(null);
  const [chargementScan, setChargementScan] = useState(false);
  const [notificationCaisse, setNotificationCaisse] = useState(null);
  const [socket, setSocket] = useState(null);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [notificationExport, setNotificationExport] = useState(null);

  const [configSalon, setConfigSalon] = useState({
    google_api_key: '', google_account_id: '', google_location_id: '',
    email_factures: '', mot_de_passe_email: '', brevo_api_key: '', sms_sender_name: 'MonSalon', lien_google_maps: '', stripe_reader_id: '',
    heure_ouverture: 8, heure_fermeture: 20
  });

  const decodeToken = (t) => { try { return JSON.parse(atob(t.split('.')[1])); } catch(e) { return null; } };
  const formatDateComplete = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formatDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  const changerSemaine = (semaines) => { const nouvelleDate = new Date(dateAgendaDebut); nouvelleDate.setDate(nouvelleDate.getDate() + (semaines * 7)); setDateAgendaDebut(nouvelleDate); };
  const isToday = (d) => { const today = new Date(); return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }

  // API CALLS
  const getAuthHeaders = (isJson = false) => { const headers = { 'Authorization': `Bearer ${token}` }; if (isJson) headers['Content-Type'] = 'application/json'; return headers; };
  const handleFetchError = async (res) => { if (res.status === 401 || res.status === 403) { seDeconnecter(); throw new Error("Session expirée"); } if (res.status === 402) { setIsAbonnementInactif(true); throw new Error("Abonnement inactif"); } const data = await res.json(); if (!res.ok) throw new Error(data.erreur || "Erreur serveur"); return data; };

  const sInscrire = async () => {
    try {
      const response = await fetch('https://api-salon-backend.onrender.com/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, mot_de_passe: motDePasseInput, nom_salon: nomSalonInput })
      });
      const data = await response.json();
      if (response.ok) { localStorage.setItem('token', data.token); setToken(data.token); setErreurLogin(null); setIsAbonnementInactif(true); setUserRole('gerant'); } 
      else { setErreurLogin(data.erreur); }
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
    } catch (e) { setErreurLogin("Erreur de connexion."); }
  };

  const motDePasseOublie = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput }) });
          const data = await res.json();
          setMsgSucces(data.message); setErreurLogin(null);
      } catch (e) { setErreurLogin("Erreur d'envoi."); }
  }

  const seDeconnecter = () => { localStorage.removeItem('token'); setToken(null); setIsAbonnementInactif(false); setUserRole('gerant'); if(socket) socket.disconnect(); };

  const chargerTout = () => {
    const role = decodeToken(token)?.role;
    if (role === 'employe') return; 
    fetch('https://api-salon-backend.onrender.com/api/dashboard', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setDashboardData(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/employes', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setEmployesListe(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/catalogue', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setCatalogueListe(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/stocks', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setStocksData(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/rh', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setRhData(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/factures/historique', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setHistoriqueData(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/clients', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setClientsListe(d)).catch(e => console.log(e.message));
    fetch('https://api-salon-backend.onrender.com/api/settings', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setConfigSalon({ google_api_key: d.google_api_key || '', google_account_id: d.google_account_id || '', google_location_id: d.google_location_id || '', email_factures: d.email_reception_factures || '', mot_de_passe_email: d.mot_de_passe_app_email || '', brevo_api_key: d.brevo_api_key || '', sms_sender_name: d.sms_sender_name || 'MonSalon', lien_google_maps: d.lien_google_maps || '', stripe_reader_id: d.stripe_reader_id || '', heure_ouverture: d.heure_ouverture || 8, heure_fermeture: d.heure_fermeture || 20 })).catch(e => console.log(e.message));
  };

  useEffect(() => {
      if (token && !isAbonnementInactif) {
          const startStr = formatDateInput(joursSemaine[0]); const endStr = formatDateInput(joursSemaine[6]);
          fetch(`https://api-salon-backend.onrender.com/api/planning?startDate=${startStr}&endDate=${endStr}`, { headers: getAuthHeaders() })
          .then(handleFetchError).then(d => setPlanningData(d)).catch(e => console.log(e.message));
      }
  }, [dateAgendaDebut, activeTab, refreshTrigger, token, isAbonnementInactif]);

  useEffect(() => { 
      if (token && !isAbonnementInactif) { 
          const user = decodeToken(token); setUserRole(user?.role || 'gerant');
          chargerTout(); 
          if (user && user.id_salon) {
              const newSocket = io('https://api-salon-backend.onrender.com');
              newSocket.emit('rejoindreSalon', user.id_salon);
              newSocket.on('paiementValide', (data) => { 
                  showToast(data.message, "success"); 
                  if(user.role === 'gerant') chargerTout(); 
              });
              newSocket.on('nouveauRDV', () => { setRefreshTrigger(prev => prev + 1); });
              setSocket(newSocket);
              return () => newSocket.disconnect();
          }
      } 
  }, [token, isAbonnementInactif]);

  const lancerPaiementStripe = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/creer-checkout', { method: 'POST', headers: getAuthHeaders() });
          const data = await res.json();
          if(data.url) { window.location.href = data.url; } 
          else { showToast("Erreur lors de la création du lien de paiement.", "error"); }
      } catch (e) { showToast("Erreur réseau avec Stripe.", "error"); }
  };

  // --- ACTIONS CRM ---
  const ouvrirFicheClient = async (client) => {
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
      try {
          await fetch(`https://api-salon-backend.onrender.com/api/clients/${clientSelectionne.id_client}/notes`, {
              method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ notes: clientHistorique.notes })
          });
          showToast("Notes sauvegardées avec succès !", "success");
      } catch (e) { showToast("Erreur lors de la sauvegarde des notes.", "error"); }
  };

  const ajouterClient = async () => { try { const res = await fetch('https://api-salon-backend.onrender.com/api/clients', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newClient) }); await handleFetchError(res); setNewClient({ nom: '', telephone: '', email: '' }); chargerTout(); showToast("Client ajouté.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerClient = async (id) => { try { await fetch(`https://api-salon-backend.onrender.com/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Client supprimé.", "success"); } catch(e) { showToast("Erreur suppression client.", "error"); }};
  const ajouterEmploye = async () => { try { const res = await fetch('https://api-salon-backend.onrender.com/api/employes', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newEmploye) }); await handleFetchError(res); setNewEmploye({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '' }); chargerTout(); showToast("Employé ajouté.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerEmploye = async (id) => { try { await fetch(`https://api-salon-backend.onrender.com/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Employé supprimé.", "success"); } catch(e) { showToast("Erreur suppression employé.", "error"); }};
  const ajouterArticle = async () => { if (newArticle.type_article === 'PRODUIT_REVENTE') { if (!newArticle.reference || newArticle.reference.trim().length < 4) { showToast("Veuillez saisir une référence d'au moins 4 caractères.", "error"); return; } } try { const res = await fetch('https://api-salon-backend.onrender.com/api/catalogue', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newArticle) }); const data = await handleFetchError(res); if (data.message && data.message.includes("Stock mis à jour")) { showToast(data.message, "success"); } setNewArticle({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '' }); chargerTout(); showToast("Catalogue mis à jour.", "success"); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerArticle = async (id) => { try { await fetch(`https://api-salon-backend.onrender.com/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Article supprimé.", "success"); } catch(e) { showToast("Erreur suppression article.", "error"); }};

  const getStockStatus = (q) => { 
      const num = parseFloat(q); 
      if (num > 20) return { bg: 'var(--bg-success)', text: 'var(--color-success)', label: 'En stock' }; 
      if (num >= 6) return { bg: 'var(--bg-info)', text: 'var(--color-info)', label: 'Correct' }; 
      if (num >= 1) return { bg: '#fef3c7', text: '#92400e', label: 'Faible' }; 
      return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Rupture' }; 
  };
  const dessinerCourbe = (d) => { const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' '); return <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#34c759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>; };
  const dessinerChronogramme = (d) => { const max = Math.max(...d) * 1.2; return (<svg width="100%" height="40px" viewBox={`0 0 100 40`} preserveAspectRatio="none">{d.map((val, i) => <rect key={i} x={i * 18} y={40 - ((val / max) * 40)} width={10} height={(val / max) * 40} fill="#a154f2" rx="2" />)}</svg>); };

  const scannerFacture = async () => { if (!texteFacture) return; setChargementScan(true); setResultatScan(null); try { const response = await fetch('https://api-salon-backend.onrender.com/api/factures/scan', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ texte_facture: texteFacture, nom_fournisseur: nomFournisseur }) }); setResultatScan(await handleFetchError(response)); showToast("Facture analysée", "success"); } catch (error) { if(error.message !== "Abonnement inactif") showToast("Erreur IA.", "error"); } setChargementScan(false); };

  // --- ACTIONS CAISSE & TICKET ECOLOGIQUE ---
  const lancerPaiementTPE = async (montant, lignes) => {
    if(!posEmploye) { showToast("Veuillez sélectionner un employé.", "error"); return; }
    setNotificationCaisse(`⏳ Envoi de l'ordre au TPE physique. En attente de la carte...`);
    try {
        const payloadTPE = { montant, id_employe: posEmploye.id_employe, id_client: clientCaisse || null, lignes };
        const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payloadTPE) });
        const data = await handleFetchError(res);
        
        setNotificationCaisse(null);
        setTicketGenere({
            id_ticket: data.id_ticket, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.nom : 'Client de passage',
            client_email: clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.email : '',
            lignes: lignes
        });
        setEmailTicketClient(clientCaisse ? clientsListe.find(c => c.id_client.toString() === clientCaisse)?.email || '' : '');
        setPosStep('employee'); setPosEmploye(null); setClientCaisse('');
    } catch (error) { if(error.message !== "Abonnement inactif") setNotificationCaisse(`❌ ${error.message || "Erreur TPE."}`); }
  };

  const envoyerTicketEco = async (methode) => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/envoyer-ticket', {
              method: 'POST', headers: getAuthHeaders(true),
              body: JSON.stringify({ id_ticket: ticketGenere.id_ticket, email: emailTicketClient, id_client: ticketGenere.client_id, methode })
          });
          await handleFetchError(res);
          showToast(`Ticket envoyé par ${methode.toUpperCase()} !`, "success");
          setTicketGenere(null);
      } catch (e) { showToast(`Erreur d'envoi : ${e.message}`, "error"); }
  }

  const declencherExport = async () => { showToast("Génération du PDF en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/export-pdf', { headers: getAuthHeaders() }); if (response.status === 402) { setIsAbonnementInactif(true); return; } if (!response.ok) { const errText = await response.text(); throw new Error(`Erreur Serveur: ${errText}`); } const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "Liasse_Comptable.pdf"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Liasse PDF générée et envoyée !", "success"); } catch (error) { showToast(error.message, "error"); }};
  const sauvegarderParametres = async () => { showToast("Sauvegarde en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/settings', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(configSalon) }); const data = await handleFetchError(response); showToast(data.message, "success"); chargerTout(); setTimeout(() => { setActiveTab('accueil'); }, 1000); } catch (error) { if(error.message !== "Abonnement inactif") showToast("Erreur serveur.", "error"); }};

  // --- ACTIONS AGENDA DYNAMIQUE ---
  const creerRdvManuel = async () => {
      try {
          const datetime = `${formRdv.date}T${formRdv.heure}:00`;
          const res = await fetch('https://api-salon-backend.onrender.com/api/rdv', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...formRdv, date_heure_debut: datetime}) });
          if(res.ok) { setShowModalRdv(false); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous créé", "success"); }
      } catch(e) { showToast("Erreur de création.", "error"); }
  }

  const ouvrirRdvSelectionne = (rdv) => {
      setRdvSelectionne(rdv);
      setIsEditingRdv(false);
      const d = new Date(rdv.date_heure_debut);
      setEditRdvForm({
          date: formatDateInput(d),
          heure: d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
          prestation: rdv.prestation,
          id_employe: rdv.id_employe || ''
      });
  };

  const sauvegarderModifRdv = async () => {
      try {
          const datetime = `${editRdvForm.date}T${editRdvForm.heure}:00`;
          const res = await fetch(`https://api-salon-backend.onrender.com/api/rdv/${rdvSelectionne.id_rdv}`, {
              method: 'PUT', headers: getAuthHeaders(true),
              body: JSON.stringify({ ...editRdvForm, date_heure_debut: datetime })
          });
          if(res.ok) { setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous modifié", "success"); }
      } catch(e) { showToast("Erreur lors de la modification.", "error"); }
  };

  const supprimerRdvManuel = async () => {
      if(!window.confirm("Supprimer ce rendez-vous ?")) return;
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'DELETE', headers: getAuthHeaders() });
          if(res.ok) { setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous supprimé", "success"); }
      } catch(e) { showToast("Erreur lors de la suppression.", "error"); }
  };

  // Z DE CAISSE LÉGAL
  const faireZdeCaisse = async () => {
      if(!window.confirm("Êtes-vous sûr de vouloir clôturer la caisse d'aujourd'hui ? Les données seront cryptées et figées.")) return;
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/cloture', { method: 'POST', headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
      } catch(e) { showToast("Erreur lors de la clôture.", "error"); }
  }

  // --- RENDER RESET PASSWORD ---
  if (resetTokenUrl) {
      return (
        <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '90vh' }}>
          <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '30px' }}>
            <h2>Nouveau mot de passe</h2>
            <p style={{fontSize:'13px', color:'var(--text-secondary)'}}>Votre lien est sécurisé et valable 15 minutes.</p>
            <input type="password" placeholder="Votre nouveau mot de passe" className="input-fournisseur" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <button className="btn-action" style={{ width: '100%', marginTop: '15px' }} onClick={async () => {
               const res = await fetch('https://api-salon-backend.onrender.com/api/reset-password', {
                  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: resetTokenUrl, nouveau_mot_de_passe: newPassword})
               });
               if(res.ok) { showToast("Mot de passe mis à jour !", "success"); setTimeout(() => window.location.href = '/', 2000); }
               else { showToast("Lien expiré ou invalide.", "error"); }
            }}>Confirmer la modification</button>
          </div>
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
      )
  }

  // --- RENDER LOGIN ---
  if (!token) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh' }}>
        <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '30px' }}>
          
          <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px'}}>
             <button onClick={() => {setLoginType('gerant'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: loginType === 'gerant' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'gerant' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', border: '1px solid var(--border-color)'}}>Gérant</button>
             <button onClick={() => {setLoginType('employe'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: loginType === 'employe' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'employe' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', border: '1px solid var(--border-color)'}}>Employé</button>
          </div>
          
          {isForgotPassword ? (
              <>
                 <h2 style={{color: 'var(--text-main)'}}>Mot de passe oublié</h2>
                 <p style={{fontSize:'13px', color:'var(--text-secondary)', marginBottom: '24px'}}>Saisissez votre email pour réinitialiser l'accès.</p>
                 {msgSucces && <div style={{backgroundColor: 'var(--bg-success)', color: 'var(--color-success)', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '15px'}}>{msgSucces}</div>}
                 <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '10px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                 <button className="btn-action" onClick={motDePasseOublie} style={{ width: '100%', marginTop: '15px' }}>Recevoir le lien</button>
                 <p style={{fontSize: '13px', color: 'var(--text-main)', marginTop: '20px', cursor: 'pointer', fontWeight: '500'}} onClick={() => setIsForgotPassword(false)}>Retour à la connexion</p>
              </>
          ) : (
             <>
                <h2 style={{color: 'var(--text-main)', marginBottom: '24px'}}>{loginType === 'gerant' ? (isLoginMode ? 'Connexion' : 'Créer un compte') : 'Espace Équipe'}</h2>
                {erreurLogin && (<div style={{ backgroundColor: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '15px' }}>{erreurLogin}</div>)}
                
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
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Saisissez votre code confidentiel.</p>
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
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh' }}>
        <div className="carte" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>
             <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 style={{color: 'var(--text-main)'}}>Abonnement Requis</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
            Pour accéder à votre tableau de bord, gérer votre catalogue et activer les automatisations (TPE, SMS, IA Comptable), vous devez activer votre abonnement mensuel.
          </p>
          <h1 style={{color: 'var(--text-main)', marginBottom: '24px'}}>49.00 € <span style={{fontSize: '14px', color: 'var(--text-secondary)'}}>/ mois</span></h1>
          
          <button className="btn-action" onClick={lancerPaiementStripe} style={{ width: '100%' }}>
            Payer de manière sécurisée avec Stripe
          </button>
          <button onClick={seDeconnecter} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', marginTop: '24px', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline'}}>
             Me déconnecter
          </button>
        </div>
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

  const role = userRole;

  // Calcul dynamique des heures de l'agenda (borné entre 0h et 23h)
  const heureDebutAgenda = Math.max(0, Math.min(23, parseInt(configSalon.heure_ouverture) || 8));
  const heureFinAgenda = Math.max(heureDebutAgenda, Math.min(23, parseInt(configSalon.heure_fermeture) || 20));
  const nbHeures = Math.max(1, heureFinAgenda - heureDebutAgenda + 1);

  return (
    <div style={{ display: 'flex' }}>
      <div className="navbar-sidebar">
         {role === 'gerant' && (
             <div className={`nav-item ${activeTab === 'accueil' ? 'active' : ''}`} onClick={() => setActiveTab('accueil')}>
                 <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
                 <span>Bord</span>
             </div>
         )}
         <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
             <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
             <span>Agenda</span>
         </div>
         {role === 'gerant' && (
             <>
                <div className={`nav-item ${activeTab === 'caisse' ? 'active' : ''}`} onClick={() => setActiveTab('caisse')}>
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>
                    <span>Caisse</span>
                </div>
                <div className={`nav-item ${activeTab === 'gestion' ? 'active' : ''}`} onClick={() => setActiveTab('gestion')}>
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                    <span>Gestion</span>
                </div>
                <div className={`nav-item ${activeTab === 'produits' ? 'active' : ''}`} onClick={() => setActiveTab('produits')}>
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                    <span>Stocks</span>
                </div>
                <div className={`nav-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => setActiveTab('rh')}>
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                    <span>Équipe</span>
                </div>
                <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
                    <span>Compta</span>
                </div>
             </>
         )}
      </div>

      <div style={{ flexGrow: 1, marginLeft: '90px' }}>
        <div className="dashboard-container" style={{maxWidth: (activeTab === 'caisse' || activeTab === 'agenda') ? '900px' : '600px'}}>
          
          {/* ============================================== */}
          {/* ONGLET : AGENDA / PLANNING (VUE SEMAINE)         */}
          {/* ============================================== */}
          {activeTab === 'agenda' && (
            <div className="admin-container">
              <div className="agenda-header">
                  <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                      <h1 style={{margin: 0}}>Agenda</h1>
                      
                      <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                          <button onClick={() => changerSemaine(-1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>◀</button>
                          <span style={{fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', padding: '0 10px'}}>{joursSemaine[0].toLocaleDateString('fr-FR', {month: 'short'})} {joursSemaine[0].getFullYear()}</span>
                          <button onClick={() => changerSemaine(1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>▶</button>
                          <button onClick={() => setDateAgendaDebut(getMonday(new Date()))} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px'}}>Aujourd'hui</button>
                      </div>
                  </div>
                  <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                      <button onClick={() => setShowModalRdv(true)} className="btn-action">+ Nouveau RDV</button>
                      {role === 'gerant' && (
                          <select className="agenda-filtre" value={filtreAgenda} onChange={(e) => setFiltreAgenda(e.target.value)}>
                              <option value="TOUS">Tous les collaborateurs</option>
                              {employesListe.map(emp => <option key={emp.id_employe} value={emp.nom}>{emp.nom}</option>)}
                          </select>
                      )}
                  </div>
              </div>

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

                 <div className="week-body">
                      <div className="time-column">
                          {Array.from({ length: nbHeures }).map((_, i) => (<div key={i} className="time-label">{heureDebutAgenda + i} h</div>))}
                      </div>
                      <div className="days-container">
                          {joursSemaine.map((jour, indexJour) => {
                              const dateStringJour = formatDateInput(jour);
                              const rdvsDuJour = planningData.filter(rdv => {
                                  const rdvDateStr = rdv.date_heure_debut.split('T')[0];
                                  return rdvDateStr === dateStringJour && 
                                         (role === 'employe' || filtreAgenda === 'TOUS' || rdv.nom_employe === filtreAgenda);
                              });

                              return (
                                  <div key={indexJour} className="day-column">
                                      {rdvsDuJour.map((rdv) => {
                                          const dateDebut = new Date(rdv.date_heure_debut);
                                          
                                          // NOUVELLE ÉCHELLE DYNAMIQUE : 80px par heure
                                          const ECHELLE_HEURE = 80;
                                          const dureeReelle = rdv.duree_minutes || 30;
                                          
                                          // Calcul de la position et de la taille
                                          const topPosition = ((dateDebut.getHours() - heureDebutAgenda) * ECHELLE_HEURE) + (dateDebut.getMinutes() * (ECHELLE_HEURE / 60));
                                          // On force une hauteur minimale de 26px pour qu'on puisse toujours lire la carte
                                          const hauteurCard = Math.max((dureeReelle * (ECHELLE_HEURE / 60)), 26);

                                          const backgroundColor = COULEURS_EMPLOYES[(rdv.id_employe || 0) % COULEURS_EMPLOYES.length];

                                          return (
                                              <div key={rdv.id_rdv} className="agenda-card" onClick={() => ouvrirRdvSelectionne(rdv)}
                                                   style={{ top: `${topPosition}px`, height: `${hauteurCard}px`, backgroundColor: backgroundColor, color: '#1c1c1e' }}>
                                                  <span className="agenda-card-title">{dateDebut.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {rdv.nom_client}</span>
                                                  <span className="agenda-card-subtitle">{rdv.prestation}</span>
                                              </div>
                                          );
                                      })}
                                  </div>
                              );
                          })}
                      </div>
                  </div>
            

              {/* MODAL CRÉATION RDV MANUEL */}
              {showModalRdv && (
                  <div className="modal-overlay">
                      <div className="modal-content">
                          <div className="modal-header">
                              <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Nouveau Rendez-vous</h3>
                              <button className="modal-close-btn" onClick={() => setShowModalRdv(false)}>
                                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
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

              {/* Pop-up de détails, modification & annulation */}
              {rdvSelectionne && (
                  <div className="modal-overlay">
                      <div className="modal-content">
                          <div className="modal-header">
                              <h3 style={{margin: 0, fontSize: '18px'}}>{!isEditingRdv ? "Détails du Rendez-vous" : "Modifier le Rendez-vous"}</h3>
                              <button className="modal-close-btn" onClick={() => setRdvSelectionne(null)}>
                                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
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
                                      {role === 'gerant' && <button onClick={supprimerRdvManuel} style={{background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Supprimer le rendez-vous</button>}
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

          {/* ============================================== */}
          {/* LES AUTRES ONGLETS (RÉSERVÉS AU GÉRANT)          */}
          {/* ============================================== */}
          {role === 'gerant' && activeTab === 'accueil' && (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                <h1 style={{margin: 0}}>
                  Tableau de bord
                  <span style={{fontSize: '14px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '10px'}}>(ID de votre salon : {decodeToken(token)?.id_salon})</span>
                </h1>
                <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                  <button onClick={() => setActiveTab('parametres')} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, width: '22px', height: '22px', transition: 'color 0.2s'}} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  </button>
                  <button onClick={seDeconnecter} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, width: '22px', height: '22px', transition: 'color 0.2s'}} title="Se déconnecter" onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </button>
                </div>
              </div>
              <span className="date-subtitle">{formatDateComplete(new Date())}</span>
              {erreur && <p style={{color: 'var(--color-danger)'}}>❌ {erreur}</p>}
              {!dashboardData && !erreur ? <p style={{color: 'var(--text-secondary)'}}>Chargement de vos données...</p> : dashboardData && (
                <>
                  {dashboardData.marketing && (
                    <div className="carte reputation-carte">
                      <div className="reputation-gauche">
                        <h3 style={{color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px'}}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            Google Maps
                        </h3>
                        <div className="reputation-note">{dashboardData.marketing.note_actuelle} <span className="reputation-etoile" style={{color: '#fbbf24'}}>★</span></div>
                        <span className="reputation-avis">Sur {dashboardData.marketing.total_avis} avis</span>
                      </div>
                      <div className="reputation-droite"><span className="tendance-label">En hausse ↗</span>{dessinerCourbe(dashboardData.marketing.tendance_6_mois)}</div>
                    </div>
                  )}
                  
                  <div className="cartes-financieres">
                    <div className="carte">
                      <div className="carte-titre-container">
                        <div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                        <h3>Chiffre d'Affaires</h3>
                      </div>
                      <p className="montant">{dashboardData.finances.chiffre_affaires_total} <span className="devise">€</span></p>
                    </div>
                    <div className="carte">
                      <div className="carte-titre-container">
                        <div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
                        <h3>Panier Moyen</h3>
                      </div>
                      <p className="montant">{dashboardData.finances.panier_moyen} <span className="devise">€</span></p>
                    </div>
                  </div>
                  <div className="section-titre">Top 3 Prestations</div>
                  <div className="top-prestations">
                    {dashboardData.top_3_prestations.map((presta, i) => (
                      <div className="presta-item" key={i}><div className="presta-header"><span className="presta-nom"> {presta.nom}</span>{i === 0 && <span className="badge-succes">N°1</span>}</div><div className="presta-details"><span>Total généré</span><span className="montant-presta">{presta.total_genere} <span className="devise" style={{fontSize:'12px'}}>€</span></span></div></div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {role === 'gerant' && activeTab === 'gestion' && (
            <div className="admin-container">
              <h1>Gestion du Salon</h1>
              <span className="date-subtitle">Remplissez votre base de données</span>
              
              <div className="section-titre">Catalogue (Prestations & Produits)</div>
              <div className="carte scan-carte">
                <div style={{display: 'flex', gap: '12px'}}>
                  <input type="text" className="input-fournisseur" placeholder={newArticle.type_article === 'PRODUIT_REVENTE' ? "Nom (Laissez vide si réassort)" : "Nom (ex: Coupe Homme)"} value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value})} />
                  <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '100px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value})} />
                </div>
                <div style={{display: 'flex', gap: '12px'}}>
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
                <button className="btn-action" onClick={ajouterArticle} disabled={(newArticle.type_article === 'PRESTATION' && (!newArticle.nom || !newArticle.prix)) || (newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.reference)}>{newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.nom ? 'Mettre à jour le stock' : 'Ajouter au catalogue'}</button>
                <div style={{marginTop: '16px'}}>
                  {catalogueListe.map(art => (
                    <div key={art.id_article} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                      <span><strong style={{color: 'var(--text-main)'}}>{art.nom}</strong> - {art.prix} € {art.reference && <span style={{color: 'var(--text-muted)', marginLeft: '8px'}}>(Réf: {art.reference})</span>}</span>
                      <button onClick={() => supprimerArticle(art.id_article)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-titre" style={{marginTop: '32px'}}>Équipe & Commissions</div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Nom du collaborateur" value={newEmploye.nom} onChange={(e) => setNewEmploye({...newEmploye, nom: e.target.value})} />
                <input type="password" maxLength="4" className="input-fournisseur" placeholder="Code PIN personnel (ex: 1234)" value={newEmploye.code_pin} onChange={(e) => setNewEmploye({...newEmploye, code_pin: e.target.value})} />
                
                <div style={{display: 'flex', gap: '12px'}}>
                  <input type="number" className="input-fournisseur" placeholder="% Com. Prestations" value={newEmploye.taux_commission_prestation} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_prestation: e.target.value})} />
                  <input type="number" className="input-fournisseur" placeholder="% Com. Produits" value={newEmploye.taux_commission_produit} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_produit: e.target.value})} />
                </div>
                <button className="btn-action" onClick={ajouterEmploye} disabled={!newEmploye.nom || !newEmploye.code_pin}>Ajouter un collaborateur</button>
                <div style={{marginTop: '16px'}}>
                  {employesListe.map(emp => (
                    <div key={emp.id_employe} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                      <span style={{fontWeight: '500', color: 'var(--text-main)'}}>{emp.nom} <span style={{color: 'var(--text-muted)', fontWeight: 'normal'}}>(PIN: {emp.code_pin || '0000'})</span></span>
                      <button onClick={() => supprimerEmploye(emp.id_employe)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-titre" style={{marginTop: '32px'}}>Base Clients (CRM)</div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Nom du client" value={newClient.nom} onChange={(e) => setNewClient({...newClient, nom: e.target.value})} />
                <input type="tel" className="input-fournisseur" placeholder="Téléphone (ex: +33612345678)" value={newClient.telephone} onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} />
                <button className="btn-action" onClick={ajouterClient} disabled={!newClient.nom}>Ajouter un client</button>
                <div style={{marginTop: '16px'}}>
                  {clientsListe.map(cli => (
                    <div key={cli.id_client} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                      <span style={{cursor: 'pointer', color: 'var(--btn-primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'}} onClick={() => ouvrirFicheClient(cli)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {cli.nom} <span style={{color: 'var(--text-muted)', fontWeight: 'normal'}}>({cli.telephone || 'Pas de numéro'})</span>
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
                                <h2 style={{margin: 0, fontSize: '20px', color: 'var(--text-main)'}}>{clientSelectionne.nom}</h2>
                                <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>{clientSelectionne.telephone}</span>
                              </div>
                              <button className="modal-close-btn" onClick={() => setClientSelectionne(null)}>
                                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                          </div>
                          
                          {chargementFiche ? <p style={{textAlign: 'center', color: 'var(--text-secondary)'}}>Chargement des données...</p> : (
                            <>
                              <div className="section-titre" style={{fontSize: '13px', marginTop: '16px'}}>Dossier Technique</div>
                              <textarea 
                                  className="textarea-facture" 
                                  value={clientHistorique.notes} 
                                  onChange={e => setClientHistorique({...clientHistorique, notes: e.target.value})}
                                  placeholder="Saisissez vos notes techniques (ex: Formule coloration)..."
                                  style={{marginBottom: '12px'}}
                              />
                              <button className="btn-action" onClick={sauvegarderNotesClient} style={{width: '100%', marginBottom: '32px'}}>Enregistrer le dossier</button>

                              <div className="section-titre" style={{fontSize: '13px'}}>Rendez-vous passés</div>
                              {clientHistorique.rdv.length === 0 ? <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px'}}>Aucun historique.</p> : (
                                  <div style={{marginBottom: '32px', background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', padding: '0 12px'}}>
                                      {clientHistorique.rdv.map((r, i) => (
                                          <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i !== clientHistorique.rdv.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                              <span><strong style={{color: 'var(--text-main)'}}>{new Date(r.date_heure_debut).toLocaleDateString()}</strong> - {r.prestation}</span>
                                              <span style={{color: 'var(--text-muted)'}}>{r.nom_employe}</span>
                                          </div>
                                      ))}
                                  </div>
                              )}

                              <div className="section-titre" style={{fontSize: '13px'}}>Historique d'Achats</div>
                              {clientHistorique.achats.length === 0 ? <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun achat en caisse.</p> : (
                                  <div style={{background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', padding: '0 12px'}}>
                                      {clientHistorique.achats.map((a, i) => (
                                          <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i !== clientHistorique.achats.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                              <span><strong style={{color: 'var(--text-main)'}}>{new Date(a.date_creation).toLocaleDateString()}</strong> - {a.article} <span style={{color: 'var(--text-muted)'}}>(x{a.quantite})</span></span>
                                              <span style={{fontWeight: '600', color: 'var(--text-main)'}}>{parseFloat(a.prix_unitaire_ttc).toFixed(2)} €</span>
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
                <button onClick={() => setActiveTab('accueil')} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)'}}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <span className="date-subtitle">Configuration de votre salon</span>
              
              <div className="carte scan-carte">
                <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Google My Business</h3>
                <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Connectez vos avis clients en direct.</span>
                <input type="text" className="input-fournisseur" placeholder="Clé API Google" value={configSalon.google_api_key} onChange={(e) => setConfigSalon({...configSalon, google_api_key: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Google Account ID" value={configSalon.google_account_id} onChange={(e) => setConfigSalon({...configSalon, google_account_id: e.target.value})} />
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
                <input type="email" className="input-fournisseur" placeholder="Email du salon" value={configSalon.email_factures} onChange={(e) => setConfigSalon({...configSalon, email_factures: e.target.value})} />
                <input type="password" className="input-fournisseur" placeholder="Mot de passe d'application" value={configSalon.mot_de_passe_email} onChange={(e) => setConfigSalon({...configSalon, mot_de_passe_email: e.target.value})} />
              </div>
              
              <div className="carte scan-carte">
                <h3 style={{marginBottom: '5px', color: 'var(--text-main)'}}>Fidélisation (SMS Auto)</h3>
                <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Vos clients recevront un SMS de remerciement.</span>
                <input type="text" className="input-fournisseur" placeholder="Clé API Brevo" value={configSalon.brevo_api_key} onChange={(e) => setConfigSalon({...configSalon, brevo_api_key: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Nom expéditeur (ex: MonSalon)" maxLength="11" value={configSalon.sms_sender_name} onChange={(e) => setConfigSalon({...configSalon, sms_sender_name: e.target.value})} />
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

          {role === 'gerant' && activeTab === 'caisse' && (
            <div className="admin-container">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                <h1 style={{margin: 0}}>Caisse Tactile</h1>
                {posStep !== 'employee' && (
                  <button onClick={() => { setPosStep('employee'); setPosEmploye(null); }} style={{padding:'10px 16px', borderRadius:'var(--radius-input)', background:'var(--bg-card)', border:'1px solid var(--border-color)', cursor:'pointer', fontWeight: '500', color: 'var(--text-main)'}}>
                    ⬅ Changer ({posEmploye?.nom.split(' ')[0]})
                  </button>
                )}
              </div>

              {posStep === 'employee' && (
                <div>
                  <h3 style={{color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: '500', fontSize: '14px'}}>1. Qui réalise la vente ?</h3>
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'}}>
                    {employesListe.map((emp, index) => (
                      <div key={emp.id_employe} onClick={() => { setPosEmploye(emp); setPosStep('type'); }}
                        style={{ backgroundColor: COULEURS_EMPLOYES[index % COULEURS_EMPLOYES.length], color: '#1c1c1e', padding: '32px', borderRadius: 'var(--radius-card)', fontSize: '20px', fontWeight: '600', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.05)' }}>
                        {emp.nom.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                  {employesListe.length === 0 && <p style={{fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '24px'}}>Aucun employé. Allez dans l'onglet "Gestion".</p>}
                </div>
              )}

              {posStep === 'type' && (
                <div>
                  <h3 style={{color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: '500', fontSize: '14px'}}>2. Type de transaction</h3>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                    <div onClick={() => { setPosType('PRESTATION'); setPosStep('items'); }} style={{ background: '#1f2937', color: 'white', padding: '40px 20px', borderRadius: 'var(--radius-card)', fontSize: '20px', fontWeight: '600', textAlign: 'center', cursor: 'pointer' }}>Services</div>
                    <div onClick={() => { setPosType('PRODUIT_REVENTE'); setPosStep('items'); }} style={{ background: '#374151', color: 'white', padding: '40px 20px', borderRadius: 'var(--radius-card)', fontSize: '20px', fontWeight: '600', textAlign: 'center', cursor: 'pointer' }}>Produits</div>
                  </div>
                </div>
              )}

              {posStep === 'items' && (
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '16px'}}>
                    <h3 style={{color: 'var(--text-secondary)', margin: 0, fontWeight: '500', fontSize: '14px'}}>3. Sélectionner ({posType === 'PRESTATION' ? 'Services' : 'Produits'})</h3>
                    <button onClick={() => setPosStep('type')} style={{border:'none', background:'none', color:'var(--text-main)', cursor:'pointer', fontWeight:500, textDecoration: 'underline'}}>Changer de catégorie</button>
                  </div>

                  <div style={{marginBottom: '24px'}}>
                    <select className="input-fournisseur" value={clientCaisse} onChange={(e) => setClientCaisse(e.target.value)}>
                      <option value="">-- Assigner un Client (Optionnel) --</option>
                      {clientsListe.map(cli => <option key={cli.id_client} value={cli.id_client}>{cli.nom}</option>)}
                    </select>
                  </div>

                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px'}}>
                    {catalogueListe
                      .filter(art => art.type_article === posType)
                      .sort((a, b) => a.nom.localeCompare(b.nom))
                      .map(art => (
                        <div key={art.id_article} onClick={() => {
                           const total = parseFloat(art.prix);
                           lancerPaiementTPE(total, [{ id_article: art.id_article, quantite: 1, prix_unitaire: total }]);
                        }} style={{ background: posType === 'PRESTATION' ? '#1f2937' : '#374151', color: 'white', padding: '24px', borderRadius: 'var(--radius-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
                          <span style={{fontSize: '15px', fontWeight: '500'}}>{art.nom}</span>
                          <span style={{fontSize: '22px', fontWeight: '700'}}>{parseFloat(art.prix).toFixed(2)} €</span>
                        </div>
                    ))}
                  </div>

                  {catalogueListe.filter(art => art.type_article === posType).length === 0 && <p style={{fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '24px'}}>Aucun élément dans cette catégorie.</p>}
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
                          <h1 style={{color: 'var(--text-main)', fontSize: '40px', margin: '0 0 24px 0', letterSpacing: '-0.02em'}}>{ticketGenere.montant.toFixed(2)} <span style={{fontSize: '24px', color: 'var(--text-secondary)'}}>€</span></h1>
                          
                          <div style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: 'var(--radius-card)', marginBottom: '24px', textAlign: 'left'}}>
                              <span style={{fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Reçu dématérialisé (Loi anti-gaspillage)</span>
                              
                              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                                  <input type="email" className="input-fournisseur" placeholder="Email du client" value={emailTicketClient} onChange={e => setEmailTicketClient(e.target.value)} style={{flex: 1}}/>
                                  <button className="btn-action" onClick={() => envoyerTicketEco('email')} disabled={!emailTicketClient}>Envoyer</button>
                              </div>

                              <button className="btn-action" onClick={() => envoyerTicketEco('sms')} disabled={!ticketGenere.client_id} style={{width: '100%', background: ticketGenere.client_id ? 'var(--btn-primary)' : 'var(--bg-app)', color: ticketGenere.client_id ? 'white' : 'var(--text-muted)', border: `1px solid ${ticketGenere.client_id ? 'var(--btn-primary)' : 'var(--border-color)'}`}}>
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
              <h1>Inventaire</h1><span className="date-subtitle">Gestion intelligente des stocks</span>
              <div className="stock-container">
                {stocksData.map((produit) => {
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
                {stocksData.length === 0 && <p style={{fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0'}}>Aucun produit en stock.</p>}
              </div>
            </div>
          )}

          {role === 'gerant' && activeTab === 'rh' && (
            <div className="admin-container">
              <h1>Ressources Humaines</h1><span className="date-subtitle">Suivi des primes et performances</span>
              {rhData.length === 0 ? <p style={{fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px'}}>Aucun employé. Allez dans l'onglet "Gestion".</p> : rhData.map(employe => (
                <div className="carte rh-carte" key={employe.id_employe}>
                  <div className="rh-header"><span className="rh-nom">{employe.nom}</span><span className="rh-role">{employe.role}</span></div>
                  <div className="rh-stats">
                    <div className="rh-stat-item"><span className="rh-stat-valeur">{employe.performances_actuelles.clients_coiffes}</span><span className="rh-stat-label">Clients</span></div>
                    <div className="rh-stat-item"><span className="rh-stat-valeur">{employe.performances_actuelles.produits_vendus}</span><span className="rh-stat-label">Produits</span></div>
                    <div className="rh-stat-item"><span className="rh-stat-valeur" style={{color: 'var(--color-success)'}}>+{((employe.performances_actuelles.ca_genere / 10000) * 100).toFixed(1)}%</span><span className="rh-stat-label">CA suppl.</span></div>
                  </div>
                  <div className="rh-prime-box" style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)'}}>
                    <span className="rh-prime-label" style={{color: 'var(--text-main)'}}>Prime estimée</span>
                    <span className="rh-prime-montant" style={{color: 'var(--text-main)'}}>{employe.performances_actuelles.prime_estimee} <span style={{fontSize: '16px', color: 'var(--text-secondary)'}}>€</span></span>
                  </div>
                  <div className="rh-chronogramme"><span className="chronogramme-titre">Évolution des primes (6 derniers mois)</span>{dessinerChronogramme(employe.historique_primes)}</div>
                </div>
              ))}
            </div>
          )}

          {role === 'gerant' && activeTab === 'admin' && (
            <div className="admin-container">
              <h1>Comptabilité Légale (NF525)</h1><span className="date-subtitle">Robot IA & Clôtures de Caisse</span>
              
              <div style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)'}}>
                 <div>
                    <h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Clôture Journalière (Z)</h3>
                    <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Obligatoire chaque soir pour sceller les encaissements.</span>
                 </div>
                 <button onClick={faireZdeCaisse} className="btn-action">Générer le Z de Caisse</button>
              </div>

              <div className="carte export-carte"><div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Liasse Mensuelle</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Génération PDF & Envoi Email</span></div><button className="btn-export" onClick={declencherExport}>Exporter</button></div>
              <div className="section-titre">Historique des factures</div>
              {historiqueData.length === 0 ? <p style={{fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0'}}>Aucune facture.</p> : historiqueData.map((dossier, index) => (
                <div className="dossier-mois" key={index}><div className="dossier-header"><span className="dossier-titre">{dossier.mois}</span><span className="dossier-total" style={{color: 'var(--text-main)'}}>{dossier.total_ttc.toFixed(2)} €</span></div>
                  {dossier.factures.map(facture => (<div className="facture-mini" key={facture.id}><span>{facture.fournisseur} <span style={{color: 'var(--text-muted)'}}>({facture.date})</span></span><span style={{fontWeight: 600, color: 'var(--text-main)'}}>{facture.ttc.toFixed(2)} €</span></div>))}
                </div>
              ))}
              <div className="section-titre" style={{marginTop: '32px'}}>Scanner IA Manuel</div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Fournisseur (ex: L'Oréal)" value={nomFournisseur} onChange={(e) => setNomFournisseur(e.target.value)} />
                <textarea className="textarea-facture" placeholder="Texte de la facture..." value={texteFacture} onChange={(e) => setTexteFacture(e.target.value)} />
                <button className="btn-action" onClick={scannerFacture} disabled={chargementScan || !texteFacture}>Lancer l'IA Comptable</button>
                {resultatScan && resultatScan.donnees_extraites && (
                  <div className="resultat-scan" style={{background: 'var(--bg-success)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-input)', padding: '16px', marginTop: '16px'}}>
                    <h4 style={{color: 'var(--color-success)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        Données extraites
                    </h4>
                    <div className="scan-details"><div className="scan-ligne"><span style={{color: 'var(--color-success)'}}>HT</span> <strong style={{color: 'var(--color-success)'}}>{resultatScan.donnees_extraites.ht} €</strong></div><div className="scan-ligne"><span style={{color: 'var(--color-success)'}}>TVA</span> <strong style={{color: 'var(--color-success)'}}>{resultatScan.donnees_extraites.tva} €</strong></div><div className="scan-ligne total" style={{borderTopColor: '#bbf7d0', paddingTop: '8px', marginTop: '8px'}}><span style={{color: 'var(--color-success)'}}>TTC</span> <strong style={{color: 'var(--color-success)'}}>{resultatScan.donnees_extraites.ttc} €</strong></div></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
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
