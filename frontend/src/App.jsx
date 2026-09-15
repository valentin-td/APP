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

  const [catalogueListe, setCatalogueListe] = useState([]);
  const [employesListe, setEmployesListe] = useState([]);
  const [clientsListe, setClientsListe] = useState([]);
  
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

  const [configSalon, setConfigSalon] = useState({
    google_api_key: '', google_account_id: '', google_location_id: '',
    email_factures: '', mot_de_passe_email: '', brevo_api_key: '', sms_sender_name: 'MonSalon', lien_google_maps: ''
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
    fetch('https://api-salon-backend.onrender.com/api/settings', { headers: getAuthHeaders() }).then(handleFetchError).then(d => setConfigSalon({ google_api_key: d.google_api_key || '', google_account_id: d.google_account_id || '', google_location_id: d.google_location_id || '', email_factures: d.email_reception_factures || '', mot_de_passe_email: d.mot_de_passe_app_email || '', brevo_api_key: d.brevo_api_key || '', sms_sender_name: d.sms_sender_name || 'MonSalon', lien_google_maps: d.lien_google_maps || '' })).catch(e => console.log(e.message));
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
              newSocket.on('paiementValide', (data) => { setNotificationCaisse(`✅ ${data.message}`); if(user.role === 'gerant') chargerTout(); setTimeout(() => setNotificationCaisse(null), 5000); });
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
          else { alert("Erreur lors de la création du lien de paiement."); }
      } catch (e) { alert("Erreur réseau avec Stripe."); }
  };

  const ajouterClient = async () => { try { const res = await fetch('https://api-salon-backend.onrender.com/api/clients', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newClient) }); await handleFetchError(res); setNewClient({ nom: '', telephone: '', email: '' }); chargerTout(); } catch(e) { if(e.message !== "Abonnement inactif") alert("❌ " + e.message); }};
  const supprimerClient = async (id) => { await fetch(`https://api-salon-backend.onrender.com/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); };
  const ajouterEmploye = async () => { try { const res = await fetch('https://api-salon-backend.onrender.com/api/employes', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newEmploye) }); await handleFetchError(res); setNewEmploye({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '' }); chargerTout(); } catch(e) { if(e.message !== "Abonnement inactif") alert("❌ " + e.message); }};
  const supprimerEmploye = async (id) => { await fetch(`https://api-salon-backend.onrender.com/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); };
  const ajouterArticle = async () => { if (newArticle.type_article === 'PRODUIT_REVENTE') { if (!newArticle.reference || newArticle.reference.trim().length < 4) { alert("❌ Veuillez saisir une référence d'au moins 4 caractères."); return; } } try { const res = await fetch('https://api-salon-backend.onrender.com/api/catalogue', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newArticle) }); const data = await handleFetchError(res); if (data.message && data.message.includes("Stock mis à jour")) { alert("✅ " + data.message); } setNewArticle({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '' }); chargerTout(); } catch(e) { if(e.message !== "Abonnement inactif") alert("❌ " + e.message); }};
  const supprimerArticle = async (id) => { await fetch(`https://api-salon-backend.onrender.com/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); };

  const getStockStatus = (q) => { const num = parseFloat(q); if (num > 20) return { couleur: '#34c759', label: 'Presque plein' }; if (num >= 6) return { couleur: '#007aff', label: 'Correct' }; if (num >= 1) return { couleur: '#ff3b30', label: 'Bientôt en rupture' }; return { couleur: '#1c1c1e', label: 'Rupture totale' }; };
  const dessinerCourbe = (d) => { const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' '); return <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#34c759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>; };
  const dessinerChronogramme = (d) => { const max = Math.max(...d) * 1.2; return (<svg width="100%" height="40px" viewBox={`0 0 100 40`} preserveAspectRatio="none">{d.map((val, i) => <rect key={i} x={i * 18} y={40 - ((val / max) * 40)} width={10} height={(val / max) * 40} fill="#a154f2" rx="2" />)}</svg>); };

  const scannerFacture = async () => { if (!texteFacture) return; setChargementScan(true); setResultatScan(null); try { const response = await fetch('https://api-salon-backend.onrender.com/api/factures/scan', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ texte_facture: texteFacture, nom_fournisseur: nomFournisseur }) }); setResultatScan(await handleFetchError(response)); } catch (error) { if(error.message !== "Abonnement inactif") setResultatScan({ erreur: "Erreur IA." }); } setChargementScan(false); };

  const lancerPaiementTPE = async (montant, lignes) => {
    if(!posEmploye) { alert("❌ Veuillez sélectionner un employé."); return; }
    setNotificationCaisse(`⏳ Envoi de l'ordre au TPE physique. En attente de la carte du client...`);
    try {
        const payloadTPE = { montant, id_employe: posEmploye.id_employe, id_client: clientCaisse || null, lignes };
        await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payloadTPE) });
    } catch (error) { if(error.message !== "Abonnement inactif") setNotificationCaisse("❌ Erreur de communication avec le TPE."); }
  };

  const declencherExport = async () => { setNotificationExport("⏳ Génération et envoi du PDF en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/export-pdf', { headers: getAuthHeaders() }); if (response.status === 402) { setIsAbonnementInactif(true); return; } if (!response.ok) { const errText = await response.text(); throw new Error(`Erreur Serveur: ${errText}`); } const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "Liasse_Comptable.pdf"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); setNotificationExport("✅ Liasse PDF générée et envoyée par e-mail !"); setTimeout(() => setNotificationExport(null), 5000); } catch (error) { setNotificationExport(`❌ ${error.message}`); setTimeout(() => setNotificationExport(null), 6000); }};
  const sauvegarderParametres = async () => { setNotificationSettings("⏳ Sauvegarde en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/settings', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(configSalon) }); const data = await handleFetchError(response); setNotificationSettings(`✅ ${data.message}`); chargerTout(); setTimeout(() => { setNotificationSettings(null); setActiveTab('accueil'); }, 2000); } catch (error) { if(error.message !== "Abonnement inactif") setNotificationSettings("❌ Erreur serveur."); }};

  // CRÉATION MANUELLE DE RDV
  const creerRdvManuel = async () => {
      try {
          const datetime = `${formRdv.date}T${formRdv.heure}:00`;
          const res = await fetch('https://api-salon-backend.onrender.com/api/rdv', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...formRdv, date_heure_debut: datetime}) });
          if(res.ok) { setShowModalRdv(false); setRefreshTrigger(prev => prev + 1); }
      } catch(e) { alert("Erreur de création."); }
  }

  // Z DE CAISSE LÉGAL
  const faireZdeCaisse = async () => {
      if(!window.confirm("Êtes-vous sûr de vouloir clôturer la caisse d'aujourd'hui ? Les données seront cryptées et figées.")) return;
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/cloture', { method: 'POST', headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          alert(data.message);
      } catch(e) { alert("Erreur lors de la clôture."); }
  }

  // --- RENDER LOGIN ---
  if (!token) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh' }}>
        <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '30px' }}>
          
          <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px'}}>
             <button onClick={() => {setLoginType('gerant'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: loginType === 'gerant' ? '#1c1c1e' : '#f2f2f7', color: loginType === 'gerant' ? 'white' : '#8e8e93', cursor: 'pointer'}}>Gérant</button>
             <button onClick={() => {setLoginType('employe'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: loginType === 'employe' ? '#1c1c1e' : '#f2f2f7', color: loginType === 'employe' ? 'white' : '#8e8e93', cursor: 'pointer'}}>Employé</button>
          </div>

          <div style={{ fontSize: '40px', marginBottom: '10px' }}>{loginType === 'gerant' ? '💼' : '🧑‍🎨'}</div>
          
          {isForgotPassword ? (
              <>
                 <h2>Mot de passe oublié</h2>
                 <p style={{fontSize:'13px', color:'#8e8e93'}}>Saisissez votre email pour réinitialiser l'accès.</p>
                 {msgSucces && <div style={{backgroundColor: '#e6f2ff', color: '#007aff', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '15px'}}>{msgSucces}</div>}
                 <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '10px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                 <button className="btn-action" onClick={motDePasseOublie} style={{ width: '100%', marginTop: '15px' }}>Recevoir le lien</button>
                 <p style={{fontSize: '13px', color: '#007aff', marginTop: '20px', cursor: 'pointer'}} onClick={() => setIsForgotPassword(false)}>Retour à la connexion</p>
              </>
          ) : (
             <>
                <h2>{loginType === 'gerant' ? (isLoginMode ? 'Espace Gérant' : 'Créer un compte') : 'Espace Équipe'}</h2>
                {erreurLogin && (<div style={{ backgroundColor: '#ffefef', color: '#ff3b30', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '15px' }}>{erreurLogin}</div>)}
                
                {loginType === 'gerant' ? (
                   <>
                      {!isLoginMode && (<input type="text" className="input-fournisseur" placeholder="Nom de votre salon" style={{marginBottom: '10px'}} value={nomSalonInput} onChange={(e) => setNomSalonInput(e.target.value)} />)}
                      <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '10px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                      <input type="password" className="input-fournisseur" placeholder="Mot de passe" value={motDePasseInput} onChange={(e) => setMotDePasseInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (isLoginMode ? seConnecter() : sInscrire())} />
                      <button className="btn-action" onClick={isLoginMode ? seConnecter : sInscrire} style={{ width: '100%', marginTop: '15px' }}>{isLoginMode ? 'Se connecter' : "S'inscrire"}</button>
                      <div style={{display:'flex', justifyContent:'space-between', marginTop: '20px'}}>
                         <p style={{fontSize: '13px', color: '#007aff', cursor: 'pointer', margin:0, fontWeight: '500'}} onClick={() => { setIsLoginMode(!isLoginMode); setErreurLogin(null); }}>{isLoginMode ? "Créer un compte" : "Se connecter"}</p>
                         {isLoginMode && <p style={{fontSize: '13px', color: '#8e8e93', cursor: 'pointer', margin:0}} onClick={() => setIsForgotPassword(true)}>Oublié ?</p>}
                      </div>
                   </>
                ) : (
                   <>
                      <p style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '20px' }}>Consultez votre agenda personnel.</p>
                      <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{marginBottom: '10px'}} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                      <input type="text" className="input-fournisseur" placeholder="Votre prénom" style={{marginBottom: '10px'}} value={nomEmployeInput} onChange={(e) => setNomEmployeInput(e.target.value)} />
                      <input type="password" maxLength="4" className="input-fournisseur" placeholder="Code PIN à 4 chiffres" value={pinEmployeInput} onChange={(e) => setPinEmployeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && seConnecter()} />
                      <button className="btn-action" onClick={seConnecter} style={{ width: '100%', marginTop: '15px' }}>Accéder au Planning</button>
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
        <div className="carte" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '30px', border: '2px solid #a154f2' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔒</div>
          <h2 style={{color: '#1c1c1e'}}>Abonnement Requis</h2>
          <p style={{ fontSize: '14px', color: '#3a3a3c', marginBottom: '20px', lineHeight: '1.5' }}>
            Pour accéder à votre tableau de bord, gérer votre catalogue et activer les automatisations (TPE, SMS, IA Comptable), vous devez activer votre abonnement mensuel.
          </p>
          <h1 style={{color: '#a154f2', marginBottom: '20px'}}>49.00 € <span style={{fontSize: '14px', color: '#8e8e93'}}>/ mois</span></h1>
          
          <button className="btn-action" onClick={lancerPaiementStripe} style={{ width: '100%', backgroundColor: '#a154f2' }}>
            💳 Payer de manière sécurisée avec Stripe
          </button>
          <button onClick={seDeconnecter} style={{background: 'none', border: 'none', color: '#8e8e93', marginTop: '20px', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline'}}>
             Me déconnecter
          </button>
        </div>
      </div>
     );
  }

  const role = userRole;

  return (
    <div style={{ display: 'flex' }}>
      <div className="navbar-sidebar">
         {role === 'gerant' && <div className={`nav-item ${activeTab === 'accueil' ? 'active' : ''}`} onClick={() => setActiveTab('accueil')}><span className="nav-icon">📊</span><span>Bord</span></div>}
         <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}><span className="nav-icon">📅</span><span>Agenda</span></div>
         {role === 'gerant' && (
             <>
                <div className={`nav-item ${activeTab === 'caisse' ? 'active' : ''}`} onClick={() => setActiveTab('caisse')}><span className="nav-icon">💳</span><span>Caisse</span></div>
                <div className={`nav-item ${activeTab === 'gestion' ? 'active' : ''}`} onClick={() => setActiveTab('gestion')}><span className="nav-icon">🗂️</span><span>Gestion</span></div>
                <div className={`nav-item ${activeTab === 'produits' ? 'active' : ''}`} onClick={() => setActiveTab('produits')}><span className="nav-icon">📦</span><span>Stocks</span></div>
                <div className={`nav-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => setActiveTab('rh')}><span className="nav-icon">👥</span><span>Équipe</span></div>
                <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}><span className="nav-icon">🧾</span><span>Compta</span></div>
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
                          <button onClick={() => changerSemaine(-1)} style={{background: '#f2f2f7', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>◀</button>
                          <span style={{fontSize: '14px', fontWeight: '600', color: '#1c1c1e', padding: '0 10px'}}>{joursSemaine[0].toLocaleDateString('fr-FR', {month: 'short'})} {joursSemaine[0].getFullYear()}</span>
                          <button onClick={() => changerSemaine(1)} style={{background: '#f2f2f7', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>▶</button>
                          <button onClick={() => setDateAgendaDebut(getMonday(new Date()))} style={{background: 'white', border: '1px solid #e5e5ea', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px'}}>Aujourd'hui</button>
                      </div>
                  </div>
                  <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                      <button onClick={() => setShowModalRdv(true)} style={{background: '#007aff', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>+ Nouveau RDV</button>
                      {role === 'gerant' && (
                          <select className="agenda-filtre" value={filtreAgenda} onChange={(e) => setFiltreAgenda(e.target.value)}>
                              <option value="TOUS">Tous les coiffeurs</option>
                              {employesListe.map(emp => <option key={emp.id_employe} value={emp.nom}>{emp.nom}</option>)}
                          </select>
                      )}
                      <button onClick={seDeconnecter} style={{background: '#ff3b30', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>Quitter</button>
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
                          {Array.from({ length: 13 }).map((_, i) => (<div key={i} className="time-label">{8 + i} h</div>))}
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
                                          const topPosition = ((dateDebut.getHours() - 8) * 60) + dateDebut.getMinutes();
                                          const backgroundColor = COULEURS_EMPLOYES[(rdv.id_employe || 0) % COULEURS_EMPLOYES.length];

                                          return (
                                              <div key={rdv.id_rdv} className="agenda-card" onClick={() => setRdvSelectionne(rdv)}
                                                   style={{ top: `${topPosition}px`, height: `${Math.max(rdv.duree_minutes, 20)}px`, backgroundColor: backgroundColor, color: '#1c1c1e' }}>
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
              </div>

              {/* MODAL CRÉATION RDV MANUEL */}
              {showModalRdv && (
                  <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                      <div style={{ background: 'white', padding: '30px', borderRadius: '20px', width: '400px' }}>
                          <h3>Ajouter un Rendez-vous</h3>
                          <input type="text" className="input-fournisseur" placeholder="Nom du Client" value={formRdv.nom_client} onChange={e => setFormRdv({...formRdv, nom_client: e.target.value})} style={{marginBottom:'10px'}}/>
                          <input type="text" className="input-fournisseur" placeholder="Téléphone" value={formRdv.telephone_client} onChange={e => setFormRdv({...formRdv, telephone_client: e.target.value})} style={{marginBottom:'10px'}}/>
                          <select className="input-fournisseur" value={formRdv.id_employe} onChange={e => setFormRdv({...formRdv, id_employe: e.target.value})} style={{marginBottom:'10px'}}>
                              <option value="">-- Choisir un coiffeur --</option>
                              {employesListe.map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                          </select>
                          <input type="text" className="input-fournisseur" placeholder="Prestation (ex: Coupe Homme)" value={formRdv.prestation} onChange={e => setFormRdv({...formRdv, prestation: e.target.value})} style={{marginBottom:'10px'}}/>
                          <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                              <input type="date" className="input-fournisseur" value={formRdv.date} onChange={e => setFormRdv({...formRdv, date: e.target.value})} />
                              <input type="time" className="input-fournisseur" value={formRdv.heure} onChange={e => setFormRdv({...formRdv, heure: e.target.value})} />
                          </div>
                          <button onClick={creerRdvManuel} className="btn-action" style={{width:'100%', marginBottom:'10px', background:'#34c759'}}>Enregistrer</button>
                          <button onClick={() => setShowModalRdv(false)} className="btn-action" style={{width:'100%', background:'#e5e5ea', color:'#1c1c1e'}}>Annuler</button>
                      </div>
                  </div>
              )}

              {/* Pop-up de détails & annulation */}
              {rdvSelectionne && (
                  <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                      <div style={{ background: 'white', padding: '30px', borderRadius: '20px', width: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                          <h3 style={{marginTop: 0, marginBottom: '5px'}}>Détails du Rendez-vous</h3>
                          <p style={{margin: '0 0 20px 0', fontSize: '13px', color: '#8e8e93'}}>Avec {rdvSelectionne.nom_employe}</p>
                          
                          <div style={{marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '12px'}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}><span>Client :</span> <strong>{rdvSelectionne.nom_client}</strong></div>
                              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}><span>Tel :</span> <a href={`tel:${rdvSelectionne.telephone_client}`} style={{color: '#007aff', textDecoration: 'none'}}>{rdvSelectionne.telephone_client}</a></div>
                              <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Service :</span> <strong>{rdvSelectionne.prestation}</strong></div>
                          </div>

                          <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                              {rdvSelectionne.stripe_payment_id && role === 'gerant' && (
                                  <button onClick={() => window.open(`https://dashboard.stripe.com/payments/${rdvSelectionne.stripe_payment_id}`, '_blank')} 
                                          style={{background: '#ff3b30', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'}}>
                                      Annuler & Gérer l'acompte (Stripe)
                                  </button>
                              )}
                              <button onClick={() => setRdvSelectionne(null)} style={{background: '#e5e5ea', color: '#1c1c1e', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'}}>
                                  Fermer
                              </button>
                          </div>
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
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h1 style={{margin: 0}}>
                  Tableau de bord
                  <span style={{fontSize: '14px', color: '#8e8e93', fontWeight: 'normal', marginLeft: '10px'}}>(ID de votre salon : {decodeToken(token)?.id_salon})</span>
                </h1>
                <div style={{display: 'flex', gap: '15px'}}>
                  <button onClick={() => setActiveTab('parametres')} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0}}>⚙️</button>
                  <button onClick={seDeconnecter} style={{background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: 0}} title="Se déconnecter">🚪</button>
                </div>
              </div>
              <span className="date-subtitle">{formatDateComplete(new Date())}</span>
              {erreur && <p style={{color: 'red'}}>❌ {erreur}</p>}
              {!dashboardData && !erreur ? <p>Chargement...</p> : dashboardData && (
                <>
                  {dashboardData.marketing && (
                    <div className="carte reputation-carte">
                      <div className="reputation-gauche">
                        <h3 style={{color: '#a154f2', display: 'flex', alignItems: 'center', gap: '5px'}}><span className="icon icon-purple" style={{width: '20px', height: '20px', fontSize: '12px'}}>G</span> Google Maps</h3>
                        <div className="reputation-note">{dashboardData.marketing.note_actuelle} <span className="reputation-etoile">★</span></div>
                        <span className="reputation-avis">Sur {dashboardData.marketing.total_avis} avis</span>
                      </div>
                      <div className="reputation-droite"><span className="tendance-label">En hausse ↗</span>{dessinerCourbe(dashboardData.marketing.tendance_6_mois)}</div>
                    </div>
                  )}
                  <div className="cartes-financieres">
                    <div className="carte"><div className="carte-titre-container"><div className="icon icon-orange">€</div><h3>Chiffre d'Aff.</h3></div><p className="montant">{dashboardData.finances.chiffre_affaires_total} €</p></div>
                    <div className="carte"><div className="carte-titre-container"><div className="icon icon-blue">🛍️</div><h3>Panier Moyen</h3></div><p className="montant">{dashboardData.finances.panier_moyen} €</p></div>
                  </div>
                  <div className="section-titre"><span>Top 3 Prestations</span></div>
                  <div className="top-prestations">
                    {dashboardData.top_3_prestations.map((presta, i) => (
                      <div className="presta-item" key={i}><div className="presta-header"><span className="presta-nom">✂️ {presta.nom}</span>{i === 0 && <span className="badge-succes">N°1</span>}</div><div className="presta-details"><span>Total généré</span><span className="montant-presta">{presta.total_genere} €</span></div></div>
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
              
              <div className="section-titre"><span>Catalogue (Prestations & Produits)</span></div>
              <div className="carte scan-carte">
                <div style={{display: 'flex', gap: '10px'}}>
                  <input type="text" className="input-fournisseur" placeholder={newArticle.type_article === 'PRODUIT_REVENTE' ? "Nom (Laissez vide si réassort)" : "Nom (ex: Coupe Homme)"} value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value})} />
                  <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '100px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value})} />
                </div>
                <div style={{display: 'flex', gap: '10px'}}>
                  <select className="input-fournisseur" value={newArticle.type_article} onChange={(e) => setNewArticle({...newArticle, type_article: e.target.value, reference: '', stock_actuel: ''})}>
                    <option value="PRESTATION">Prestation (Service)</option>
                    <option value="PRODUIT_REVENTE">Produit Revente (Stock)</option>
                  </select>
                  {newArticle.type_article === 'PRODUIT_REVENTE' && (
                    <>
                      <input type="text" className="input-fournisseur" placeholder="Réf. (min 4 car.)" style={{width: '150px'}} value={newArticle.reference} onChange={(e) => setNewArticle({...newArticle, reference: e.target.value})} />
                      <input type="number" className="input-fournisseur" placeholder="Qté" style={{width: '90px'}} value={newArticle.stock_actuel} onChange={(e) => setNewArticle({...newArticle, stock_actuel: e.target.value})} />
                    </>
                  )}
                </div>
                <button className="btn-action" onClick={ajouterArticle} disabled={(newArticle.type_article === 'PRESTATION' && (!newArticle.nom || !newArticle.prix)) || (newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.reference)}>{newArticle.type_article === 'PRODUIT_REVENTE' && !newArticle.nom ? 'Mettre à jour le stock' : 'Ajouter au catalogue'}</button>
                <div style={{marginTop: '15px'}}>
                  {catalogueListe.map(art => (
                    <div key={art.id_article} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: '14px'}}>
                      <span>{art.type_article === 'PRESTATION' ? '✂️' : '🧴'} {art.nom} - {art.prix}€ {art.reference && <span style={{fontSize: '11px', color: '#8e8e93', marginLeft: '5px'}}>(Réf: {art.reference})</span>}</span>
                      <button onClick={() => supprimerArticle(art.id_article)} style={{background:'none', border:'none', color:'red', cursor:'pointer'}}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-titre" style={{marginTop: '30px'}}><span>Équipe & Commissions</span></div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Nom de l'employé" value={newEmploye.nom} onChange={(e) => setNewEmploye({...newEmploye, nom: e.target.value})} />
                
                <input type="text" maxLength="4" className="input-fournisseur" placeholder="Code PIN personnel (ex: 1234)" value={newEmploye.code_pin} onChange={(e) => setNewEmploye({...newEmploye, code_pin: e.target.value})} />
                
                <div style={{display: 'flex', gap: '10px'}}>
                  <input type="number" className="input-fournisseur" placeholder="% Com. Prestations" value={newEmploye.taux_commission_prestation} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_prestation: e.target.value})} />
                  <input type="number" className="input-fournisseur" placeholder="% Com. Produits" value={newEmploye.taux_commission_produit} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_produit: e.target.value})} />
                </div>
                <button className="btn-action" onClick={ajouterEmploye} disabled={!newEmploye.nom || !newEmploye.code_pin}>Ajouter un employé</button>
                <div style={{marginTop: '15px'}}>
                  {employesListe.map(emp => (
                    <div key={emp.id_employe} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: '14px'}}>
                      <span>🧑‍🎨 {emp.nom} (PIN: {emp.code_pin || '0000'})</span>
                      <button onClick={() => supprimerEmploye(emp.id_employe)} style={{background:'none', border:'none', color:'red', cursor:'pointer'}}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-titre" style={{marginTop: '30px'}}><span>Base Clients (Pour les SMS)</span></div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Nom du client" value={newClient.nom} onChange={(e) => setNewClient({...newClient, nom: e.target.value})} />
                <input type="tel" className="input-fournisseur" placeholder="Téléphone (ex: +33612345678)" value={newClient.telephone} onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} />
                <button className="btn-action" onClick={ajouterClient} disabled={!newClient.nom}>Ajouter un client</button>
                <div style={{marginTop: '15px'}}>
                  {clientsListe.map(cli => (
                    <div key={cli.id_client} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: '14px'}}>
                      <span>📱 {cli.nom} ({cli.telephone || 'Pas de numéro'})</span>
                      <button onClick={() => supprimerClient(cli.id_client)} style={{background:'none', border:'none', color:'red', cursor:'pointer'}}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {role === 'gerant' && activeTab === 'parametres' && (
            <div className="admin-container">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h1 style={{margin: 0}}>Paramètres</h1>
                <button onClick={() => setActiveTab('accueil')} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0}}>✖</button>
              </div>
              <span className="date-subtitle">Configuration de votre salon</span>
              {notificationSettings && <div className="resultat-scan" style={{marginBottom: '20px'}}><h4 style={{color: '#1c1c1e'}}>{notificationSettings}</h4></div>}
              
              <div className="carte scan-carte">
                <h3 style={{marginBottom: '5px', color: '#1c1c1e'}}>📍 Google My Business</h3>
                <span style={{fontSize: '12px', color: '#8e8e93', marginBottom: '10px'}}>Connectez vos avis clients en direct.</span>
                <input type="text" className="input-fournisseur" placeholder="Clé API Google" value={configSalon.google_api_key} onChange={(e) => setConfigSalon({...configSalon, google_api_key: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Google Account ID" value={configSalon.google_account_id} onChange={(e) => setConfigSalon({...configSalon, google_account_id: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Google Location ID" value={configSalon.google_location_id} onChange={(e) => setConfigSalon({...configSalon, google_location_id: e.target.value})} />
              </div>
              
              <div className="carte scan-carte" style={{marginTop: '20px'}}>
                <h3 style={{marginBottom: '5px', color: '#1c1c1e'}}>✉️ Boîte Mail (Robot Comptable)</h3>
                <span style={{fontSize: '12px', color: '#8e8e93', marginBottom: '10px'}}>L'IA analysera vos factures fournisseurs.</span>
                <input type="email" className="input-fournisseur" placeholder="Email du salon" value={configSalon.email_factures} onChange={(e) => setConfigSalon({...configSalon, email_factures: e.target.value})} />
                <input type="password" className="input-fournisseur" placeholder="Mot de passe d'application" value={configSalon.mot_de_passe_email} onChange={(e) => setConfigSalon({...configSalon, mot_de_passe_email: e.target.value})} />
              </div>
              
              <div className="carte scan-carte" style={{marginTop: '20px', border: '2px solid #34c759'}}>
                <h3 style={{marginBottom: '5px', color: '#34c759'}}>💬 Fidélisation (SMS Auto)</h3>
                <span style={{fontSize: '12px', color: '#8e8e93', marginBottom: '10px'}}>Vos clients recevront un SMS de remerciement.</span>
                <input type="text" className="input-fournisseur" placeholder="Clé API Brevo" value={configSalon.brevo_api_key} onChange={(e) => setConfigSalon({...configSalon, brevo_api_key: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Nom expéditeur (ex: MonSalon)" maxLength="11" value={configSalon.sms_sender_name} onChange={(e) => setConfigSalon({...configSalon, sms_sender_name: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Lien d'avis Google Maps (ex: https://g.page/...)" value={configSalon.lien_google_maps} onChange={(e) => setConfigSalon({...configSalon, lien_google_maps: e.target.value})} />
              </div>
              <button className="btn-action" style={{marginTop: '25px', width: '100%'}} onClick={sauvegarderParametres}>💾 Enregistrer la configuration</button>
            </div>
          )}

          {role === 'gerant' && activeTab === 'caisse' && (
            <div className="admin-container">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h1>Caisse Tactile</h1>
                {posStep !== 'employee' && (
                  <button onClick={() => { setPosStep('employee'); setPosEmploye(null); }} style={{padding:'8px 12px', borderRadius:'8px', background:'#eee', border:'none', cursor:'pointer'}}>
                    ⬅ Changer d'opérateur ({posEmploye?.nom.split(' ')[0]})
                  </button>
                )}
              </div>

              {notificationCaisse && <div className="resultat-scan" style={{backgroundColor: '#e6f2ff', borderColor: '#b3d9ff'}}><h4 style={{color: '#007aff'}}>{notificationCaisse}</h4></div>}

              {posStep === 'employee' && (
                <div>
                  <h3 style={{color: '#8e8e93', marginBottom: '15px'}}>1. Qui réalise la vente ?</h3>
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px'}}>
                    {employesListe.map((emp, index) => (
                      <div key={emp.id_employe} onClick={() => { setPosEmploye(emp); setPosStep('type'); }}
                        style={{ backgroundColor: COULEURS_EMPLOYES[index % COULEURS_EMPLOYES.length], color: '#1c1c1e', padding: '30px', borderRadius: '16px', fontSize: '20px', fontWeight: '700', textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        {emp.nom.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                  {employesListe.length === 0 && <p style={{fontSize: '14px', color: '#8e8e93', textAlign: 'center', marginTop: '20px'}}>Aucun employé. Allez dans l'onglet "Gestion".</p>}
                </div>
              )}

              {posStep === 'type' && (
                <div>
                  <h3 style={{color: '#8e8e93', marginBottom: '15px'}}>2. Type de transaction</h3>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                    <div onClick={() => { setPosType('PRESTATION'); setPosStep('items'); }} style={{ background: '#2c3e50', color: 'white', padding: '50px 20px', borderRadius: '20px', fontSize: '24px', fontWeight: '700', textAlign: 'center', cursor: 'pointer' }}>✂️ Services</div>
                    <div onClick={() => { setPosType('PRODUIT_REVENTE'); setPosStep('items'); }} style={{ background: '#16a085', color: 'white', padding: '50px 20px', borderRadius: '20px', fontSize: '24px', fontWeight: '700', textAlign: 'center', cursor: 'pointer' }}>🧴 Produits</div>
                  </div>
                </div>
              )}

              {posStep === 'items' && (
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '15px'}}>
                    <h3 style={{color: '#8e8e93', margin: 0}}>3. Sélectionner ({posType === 'PRESTATION' ? 'Services' : 'Produits'})</h3>
                    <button onClick={() => setPosStep('type')} style={{border:'none', background:'none', color:'#007aff', cursor:'pointer', fontWeight:600}}>⬅ Changer (Service/Produit)</button>
                  </div>

                  <div style={{marginBottom: '20px'}}>
                    <select className="input-fournisseur" value={clientCaisse} onChange={(e) => setClientCaisse(e.target.value)}>
                      <option value="">-- Assigner un Client (Optionnel - Pour le SMS Google) --</option>
                      {clientsListe.map(cli => <option key={cli.id_client} value={cli.id_client}>{cli.nom}</option>)}
                    </select>
                  </div>

                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px'}}>
                    {catalogueListe
                      .filter(art => art.type_article === posType)
                      .sort((a, b) => a.nom.localeCompare(b.nom))
                      .map(art => (
                        <div key={art.id_article} onClick={() => {
                           const total = parseFloat(art.prix);
                           lancerPaiementTPE(total, [{ id_article: art.id_article, quantite: 1, prix_unitaire: total }]);
                           setPosStep('employee'); setPosEmploye(null);
                        }} style={{ background: posType === 'PRESTATION' ? '#2c3e50' : '#16a085', color: 'white', padding: '25px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
                          <span style={{fontSize: '16px', fontWeight: '600'}}>{art.nom}</span>
                          <span style={{fontSize: '20px', fontWeight: '800'}}>{parseFloat(art.prix).toFixed(2)} €</span>
                        </div>
                    ))}
                  </div>

                  {catalogueListe.filter(art => art.type_article === posType).length === 0 && <p style={{fontSize: '14px', color: '#8e8e93', textAlign: 'center', marginTop: '20px'}}>Aucun élément dans cette catégorie.</p>}
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
                        <div className="stock-info"><div className="pastille" style={{ backgroundColor: status.couleur }}></div><div className="stock-details"><span className="stock-nom">{produit.nom}</span><span className="stock-label">{status.label}</span></div></div>
                        <div className="stock-quantite-container"><span className="stock-quantite">{produit.stock_actuel}</span></div>
                      </div>
                    );
                })}
                {stocksData.length === 0 && <p style={{fontSize: '14px', color: '#8e8e93', textAlign: 'center'}}>Aucun produit en stock.</p>}
              </div>
            </div>
          )}

          {role === 'gerant' && activeTab === 'rh' && (
            <div className="admin-container">
              <h1>Ressources Humaines</h1><span className="date-subtitle">Suivi des primes et performances</span>
              {rhData.length === 0 ? <p style={{fontSize: '14px', color: '#8e8e93', textAlign: 'center', marginTop: '20px'}}>Aucun employé. Allez dans l'onglet "Gestion".</p> : rhData.map(employe => (
                <div className="carte rh-carte" key={employe.id_employe}>
                  <div className="rh-header"><span className="rh-nom">🧑‍🎨 {employe.nom}</span><span className="rh-role">{employe.role}</span></div>
                  <div className="rh-stats">
                    <div className="rh-stat-item"><span className="rh-stat-valeur">{employe.performances_actuelles.clients_coiffes}</span><span className="rh-stat-label">Clients</span></div>
                    <div className="rh-stat-item"><span className="rh-stat-valeur">{employe.performances_actuelles.produits_vendus}</span><span className="rh-stat-label">Produits</span></div>
                    <div className="rh-stat-item"><span className="rh-stat-valeur">+{((employe.performances_actuelles.ca_genere / 10000) * 100).toFixed(1)}%</span><span className="rh-stat-label">CA suppl.</span></div>
                  </div>
                  <div className="rh-prime-box"><span className="rh-prime-label">Prime estimée</span><span className="rh-prime-montant">{employe.performances_actuelles.prime_estimee} €</span></div>
                  <div className="rh-chronogramme"><span className="chronogramme-titre">Évolution des primes (6 derniers mois)</span>{dessinerChronogramme(employe.historique_primes)}</div>
                </div>
              ))}
            </div>
          )}

          {role === 'gerant' && activeTab === 'admin' && (
            <div className="admin-container">
              <h1>Comptabilité Légale (NF525)</h1><span className="date-subtitle">Robot IA & Clôtures de Caisse</span>
              
              <div style={{background: '#fff0e6', border: '1px solid #ff9500', borderRadius: '12px', padding: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                 <div>
                    <h3 style={{margin: '0 0 5px 0', color: '#1c1c1e'}}>Clôture Journalière (Z)</h3>
                    <span style={{fontSize: '12px', color: '#8e8e93'}}>Obligatoire chaque soir pour sceller les encaissements.</span>
                 </div>
                 <button onClick={faireZdeCaisse} style={{background: '#ff9500', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>Générer le Z de Caisse</button>
              </div>

              <div className="carte export-carte"><div><h3 style={{margin: '0 0 5px 0', color: 'white'}}>Liasse Mensuelle</h3><span style={{fontSize: '12px', color: '#8e8e93'}}>Génération PDF & Envoi Email</span></div><button className="btn-export" onClick={declencherExport}>Exporter</button></div>
              <div className="section-titre"><span>Historique des factures</span></div>
              {historiqueData.length === 0 ? <p style={{fontSize: '14px', color: '#8e8e93', textAlign: 'center'}}>Aucune facture.</p> : historiqueData.map((dossier, index) => (
                <div className="dossier-mois" key={index}><div className="dossier-header"><span className="dossier-titre">📁 {dossier.mois}</span><span className="dossier-total">{dossier.total_ttc.toFixed(2)} €</span></div>
                  {dossier.factures.map(facture => (<div className="facture-mini" key={facture.id}><span>{facture.fournisseur} ({facture.date})</span><span style={{fontWeight: 500, color: '#3a3a3c'}}>{facture.ttc.toFixed(2)} €</span></div>))}
                </div>
              ))}
              <div className="section-titre" style={{marginTop: '30px'}}><span>Scanner IA Manuel</span></div>
              <div className="carte scan-carte">
                <input type="text" className="input-fournisseur" placeholder="Fournisseur (ex: L'Oréal)" value={nomFournisseur} onChange={(e) => setNomFournisseur(e.target.value)} />
                <textarea className="textarea-facture" placeholder="Texte de la facture..." value={texteFacture} onChange={(e) => setTexteFacture(e.target.value)} />
                <button className="btn-action" onClick={scannerFacture} disabled={chargementScan || !texteFacture}>🔍 Lancer l'IA Comptable</button>
                {resultatScan && resultatScan.donnees_extraites && (
                  <div className="resultat-scan"><h4>✅ Données extraites</h4>
                    <div className="scan-details"><div className="scan-ligne"><span>HT :</span> <strong>{resultatScan.donnees_extraites.ht} €</strong></div><div className="scan-ligne"><span>TVA :</span> <strong>{resultatScan.donnees_extraites.tva} €</strong></div><div className="scan-ligne total"><span>TTC :</span> <strong>{resultatScan.donnees_extraites.ttc} €</strong></div></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;