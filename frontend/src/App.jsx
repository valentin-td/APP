import { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';
import './App.css';
import LiquidTabBar from './LiquidTabBar';
import Parametres from './Parametres';
import PopupLegal from './PopupLegal';  
import PricingModal from './PricingModal';

// Fonction utilitaire obligatoire pour transformer la clé de sécurité pour le navigateur
function urlBase64ToUint8Array(base64String) { 
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Fonction sortie du composant pour être accessible partout sans erreur d'initialisation
const decodeToken = (t) => { 
    if (!t || !t.includes('.')) return null;
    try { 
        let base64Url = t.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        // Remplissage automatique pour éviter le crash atob
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        // Décodage compatible avec les accents (UTF-8)
        const jsonPayload = decodeURIComponent(atob(base64 + padding).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload); 
    } catch(e) { 
        return null; 
    } 
};

const isPinWeak = (pin) => {
    if (!pin) return false;
    const strPin = String(pin);
    const repeating = /^(\d)\1+$/.test(strPin);
    const sequentialUp = '0123456789'.includes(strPin);
    const sequentialDown = '9876543210'.includes(strPin);
    return repeating || sequentialUp || sequentialDown;
};

// Intercepteur global pour inclure automatiquement le Cookie httpOnly sur toutes les requêtes
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    if (typeof resource === 'string' && resource.includes('api-salon-backend.onrender.com')) {
        config = config || {};
        config.credentials = 'include';
    }
    return originalFetch(resource, config);
};

import AvisPublic from './AvisPublic.jsx';

function App() {
  if (window.location.pathname.startsWith('/avis/')) {
      return <AvisPublic token={window.location.pathname.split('/avis/')[1]} />;
  }

  const [token, setToken] = useState(localStorage.getItem('ui_token') || null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  useEffect(() => {
      const checkQueue = async () => {
          const queue = await localforage.getItem('offline_tickets') || [];
          setPendingOfflineCount(queue.length);
      };
      checkQueue();
      const inter = setInterval(checkQueue, 3000); // Vérifie toutes les 3 secondes
      return () => clearInterval(inter);
  }, []);

  const [isOutilsMenuOpen, setIsOutilsMenuOpen] = useState(false);

  const SvgEmptyState = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
  );
  
  // Corrige le bug des "doubles clics" sur iPhone (PWA ajoutée à l'écran d'accueil) :
  // en mode standalone, WebKit attend un évènement tactile réel avant de considérer
  // les éléments comme interactifs, sinon le premier tap ne fait que simuler le
  // survol (:hover) et il faut taper une seconde fois pour déclencher le clic.
  useEffect(() => {
      document.addEventListener('touchstart', function () {}, { passive: true });
  }, []);

  useEffect(() => {
      // On récupère ou on crée la balise qui contrôle la barre de statut mobile
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
          metaThemeColor = document.createElement('meta');
          metaThemeColor.name = 'theme-color';
          document.head.appendChild(metaThemeColor);
      }

      if (isDarkMode) {
          document.body.classList.add('dark-mode');
          document.documentElement.style.backgroundColor = '#0b0b0d'; // Force le fond racine
          document.body.style.backgroundColor = '#0b0b0d'; // Fix: Force le fond iOS
          metaThemeColor.setAttribute('content', '#0b0b0d'); // Colore la barre iOS/Android
          localStorage.setItem('theme', 'dark');
      } else {
          document.body.classList.remove('dark-mode');
          document.documentElement.style.backgroundColor = '#f6f6f7';
          document.body.style.backgroundColor = '#f6f6f7'; // Fix: Force le fond iOS
          metaThemeColor.setAttribute('content', '#f6f6f7');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  const ThemeToggle = ({ isFixed }) => {
      // Nous utilisons des styles en ligne stricts pour forcer le positionnement si isFixed est vrai (ex: page de connexion)
      const fixedStyle = isFixed ? { position: 'absolute', top: '24px', right: '24px', zIndex: 1000 } : {};
      
      return (
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="theme-toggle-btn" style={fixedStyle} title="Basculer le thème">
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
  const [nomGerantInput, setNomGerantInput] = useState('');
  const [idSalonInput, setIdSalonInput] = useState('');
  const [nomEmployeInput, setNomEmployeInput] = useState('');
  const [pinEmployeInput, setPinEmployeInput] = useState('');
  const [pinSalonInput, setPinSalonInput] = useState('');

  const [isAbonnementInactif, setIsAbonnementInactif] = useState(false);
  const [userRole, setUserRole] = useState('gerant'); 
  const [legalStatut, setLegalStatut] = useState(null); // null = inconnu / non concerné, sinon { accepte, en_attente, identite }

  // Acceptation des documents contractuels : vérifiée à chaque connexion du gérant (échec réseau = on ne bloque pas)
  useEffect(() => {
    if (!token || decodeToken(token)?.role !== 'gerant') { setLegalStatut(null); return undefined; }
    let annule = false;
    fetch('https://api-salon-backend.onrender.com/api/legal/statut', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!annule && d) setLegalStatut(d); })
      .catch(() => {});
    return () => { annule = true; };
  }, [token]);

  const [activeTab, setActiveTab] = useState('accueil');
  const [dashboardData, setDashboardData] = useState(null);
  const [avisStats, setAvisStats] = useState(null);
  const [salonDashboardData, setSalonDashboardData] = useState(null);
  const [employeDashboardData, setEmployeDashboardData] = useState(null);
  const [stocksData, setStocksData] = useState([]);
  const [rhData, setRhData] = useState([]);
  const [absencesRH, setAbsencesRH] = useState([]);
  const [historiqueData, setHistoriqueData] = useState([]);
  const [expandedYear, setExpandedYear] = useState(new Date().getFullYear().toString());
  const [expandedMonth, setExpandedMonth] = useState(["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][new Date().getMonth()]);
  const [planningData, setPlanningData] = useState([]); 
  const [superAdminData, setSuperAdminData] = useState(null);
  const [superAdminSalons, setSuperAdminSalons] = useState([]);
  const [tachesListe, setTachesListe] = useState([]);
  const [nouvelleTache, setNouvelleTache] = useState({ titre: '', description: '', date_echeance: '' });
  const [sauvetageClient, setSauvetageClient] = useState(null);
  const [smsSauvetage, setSmsSauvetage] = useState('');
  const [rhSortBy, setRhSortBy] = useState('ca');
  const [rhAvisExpanded, setRhAvisExpanded] = useState({});
  
  const envoyerSmsSauvetage = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/sms/send', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ telephone: sauvetageClient.telephone, message: smsSauvetage }) });
          if (res.ok) { showToast("SMS de sauvetage envoyé !", "success"); setSauvetageClient(null); } 
          else { const data = await res.json(); showToast(data.erreur || "Erreur", "error"); }
      } catch(e) { showToast("Erreur réseau", "error"); }
  };
  
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddEmploye, setShowAddEmploye] = useState(false);
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [showAddPrestation, setShowAddPrestation] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockSortBy, setStockSortBy] = useState('nom');
  const [isStockExpanded, setIsStockExpanded] = useState(true);
  const [isTachesTermineesExpanded, setIsTachesTermineesExpanded] = useState(false);
  const [stockMenuOuvert, setStockMenuOuvert] = useState(null);
  const [modifStockDialog, setModifStockDialog] = useState(null);
  const [employeMenuOuvert, setEmployeMenuOuvert] = useState(null);
  const [modifEmployeDialog, setModifEmployeDialog] = useState(null);
  
  const [protocolesListe, setProtocolesListe] = useState([]);
  const [nouveauProtocole, setNouveauProtocole] = useState({ nom_prestation: '', etapes: [], medias: { avant: null, pendant: null, apres: null }, tags: [], ingredients: [], temps_nettoyage_minutes: 5, a_temps_nettoyage: false });
  const [ingredientTemp, setIngredientTemp] = useState({ id_article: '', quantite_necessaire: '' });
  const [etapeTemp, setEtapeTemp] = useState({ texte: '', timer_min: '' });
  const [protocoleVisible, setProtocoleVisible] = useState(null); 
  const [modeEditionProtocole, setModeEditionProtocole] = useState(null); 
  const [rechercheProtocole, setRechercheProtocole] = useState('');

  // --- DÉCLARATION DES LISTES (Remontées ici pour éviter le crash de l'écran blanc) ---
  const [catalogueListe, setCatalogueListe] = useState([]);
  const [employesListe, setEmployesListe] = useState([]);
  const [clientsListe, setClientsListe] = useState([]);

  const [messagesListe, setMessagesListe] = useState([]);
  const [chatActif, setChatActif] = useState('salon');
  const [msgInput, setMsgInput] = useState('');
  const [msgFile, setMsgFile] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editMsgContent, setEditMsgContent] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [activeReactionId, setActiveReactionId] = useState(null);
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null); // <-- LA LIGNE MANQUANTE EST ICI
  

  // Auto-scroll doux et contrôlé (syntaxe 100% compatible)
  useEffect(() => {
      if (messagesEndRef.current && activeTab === 'messagerie') {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [messagesListe, chatActif, activeTab]);

  // --- Pastilles de messages non lus ---
  const [dernierLuParConv, setDernierLuParConv] = useState({});
  useEffect(() => { 
      localforage.getItem('dernierLuParConv').then(saved => { 
          if (saved) {
              setDernierLuParConv(prev => {
                  const next = { ...saved };
                  // On garde toujours l'ID le plus élevé (évite que la mémoire locale écrase une lecture récente)
                  for (let k in prev) {
                      next[k] = Math.max(Number(next[k]) || 0, Number(prev[k]) || 0);
                  }
                  return next;
              });
          }
      }); 
  }, []);

  // Identifie à quelle conversation (clé du contact) appartient un message.
  // Renvoie null si le message ne concerne pas l'utilisateur courant (ex: échange entre deux autres employés).
  const getCleConversation = (msg, roleUtilisateur, myId) => {
      if (msg.id_destinataire === 0) return 'salon';
      if (roleUtilisateur === 'employe') {
          if (msg.id_expediteur === myId) return (msg.id_destinataire === null || msg.id_destinataire === -1) ? 'gerant' : msg.id_destinataire;
          if (msg.id_destinataire === myId) return (msg.id_expediteur === null || msg.id_expediteur === -1) ? 'gerant' : msg.id_expediteur;
          return null;
      }
      // Vue gérant ou salon : l'autre extrémité de la conversation est celle qui n'est ni null (gérant) ni -1 (salon)
      const estIdentitePatron = (v) => v === null || v === -1;
      if (estIdentitePatron(msg.id_expediteur) && !estIdentitePatron(msg.id_destinataire)) return msg.id_destinataire;
      if (estIdentitePatron(msg.id_destinataire) && !estIdentitePatron(msg.id_expediteur)) return msg.id_expediteur;
      return null;
  };

  // Calcule, pour chaque conversation, s'il reste des messages non lus
  const nonLusParConv = useMemo(() => {
      const roleUtilisateur = decodeToken(token)?.role;
      const myId = roleUtilisateur === 'employe' ? decodeToken(token)?.id_employe : (roleUtilisateur === 'salon' ? -1 : null);
      const map = {};
      
      const clesActives = new Set(['salon']);
      if (roleUtilisateur === 'employe') clesActives.add('gerant');
      
      // Sécurité anti-crash
      const safeEmployes = Array.isArray(employesListe) ? employesListe : [];
      const safeMessages = Array.isArray(messagesListe) ? messagesListe : [];

      safeEmployes.forEach(emp => clesActives.add(String(emp.id_employe)));

      safeMessages.forEach(m => {
          if (m.id_expediteur === myId) return;
          const cleBrute = getCleConversation(m, roleUtilisateur, myId);
          if (cleBrute === null || cleBrute === undefined) return;
          
          const cle = String(cleBrute);
          if (!clesActives.has(cle)) return;

          if (activeTab === 'messagerie' && String(chatActif) === cle) return;

          if (Number(m.id_message) > Number(dernierLuParConv[cle] || 0)) {
              map[cle] = true;
          }
      });
      return map;
  }, [messagesListe, dernierLuParConv, token, employesListe, activeTab, chatActif]);

  const aDesMessagesNonLus = Object.keys(nonLusParConv).length > 0;

    // Dernier message de chaque conversation (sert à trier les contacts)
  const dernierMessageParConv = useMemo(() => {
      const roleUtilisateur = decodeToken(token)?.role;
      const myId = roleUtilisateur === 'employe' ? decodeToken(token)?.id_employe : (roleUtilisateur === 'salon' ? -1 : null);
      const map = {};
      (Array.isArray(messagesListe) ? messagesListe : []).forEach(m => {
          const cle = getCleConversation(m, roleUtilisateur, myId);
          if (cle === null || cle === undefined) return;
          const id = Number(m.id_message) || 0;
          if (id > (map[cle] || 0)) map[cle] = id;
      });
      return map;
  }, [messagesListe, token]);

  // Liste des contacts (hors "Groupe Salon", toujours épinglé en premier), triée du plus récent au plus ancien
  const contactsTries = useMemo(() => {
      const roleUtilisateur = decodeToken(token)?.role;
      const myIdActuel = decodeToken(token)?.id_employe;
      const safeEmployes = Array.isArray(employesListe) ? employesListe : []; // Sécurité anti-crash
      let base;
      if (roleUtilisateur === 'gerant') {
          base = safeEmployes.map(emp => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }));
      } else if (roleUtilisateur === 'salon') {
          base = [
              { key: 'gerant', nom: 'Gérant', photo_url: null },
              ...safeEmployes.map(emp => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }))
          ];
      } else {
          base = [
              { key: 'gerant', nom: 'Gérant', photo_url: null },
              ...safeEmployes.filter(e => e.id_employe !== myIdActuel).map(emp => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }))
          ];
      }
      return base.sort((a, b) => (dernierMessageParConv[b.key] || 0) - (dernierMessageParConv[a.key] || 0));
  }, [employesListe, token, dernierMessageParConv]);

  // Marque la conversation actuellement ouverte comme lue sans déclencher de boucle infinie
  const marquerConversationCommeLue = () => {
      if (activeTab !== 'messagerie') return;
      
      const roleUtilisateur = decodeToken(token)?.role;
      const myId = roleUtilisateur === 'employe' ? decodeToken(token)?.id_employe : (roleUtilisateur === 'salon' ? -1 : null);
      const monProfilId = roleUtilisateur === 'employe' ? `emp_${myId}` : (roleUtilisateur === 'salon' ? 'salon' : 'gerant');
      const cleActuelleStr = String(chatActif);
      
      const messagesConv = (messagesListe || []).filter(m => String(getCleConversation(m, roleUtilisateur, myId)) === cleActuelleStr);
      const idsConv = messagesConv.map(m => Number(m.id_message));
      
      if (idsConv.length === 0) return;
      const maxId = Math.max(...idsConv);

      setDernierLuParConv(prev => {
          if (Number(prev[cleActuelleStr] || 0) >= maxId) return prev;
          const next = { ...prev, [cleActuelleStr]: maxId };
          localforage.setItem('dernierLuParConv', next);
          return next;
      });

      const idsAVoir = messagesConv.filter(m => m.id_expediteur !== myId && !(m.vu_par || []).includes(monProfilId)).map(m => m.id_message);
      if (idsAVoir.length > 0) {
          fetch('https://api-salon-backend.onrender.com/api/messages/vu', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ ids: idsAVoir }) })
              .then(async (res) => { if (!res.ok) { const d = await res.json().catch(() => ({})); console.error('Erreur marquage vu :', res.status, d.erreur); } })
              .catch((e) => console.error('Erreur réseau marquage vu :', e));
      }
  };

  // N'exécute le check que si l'onglet Chat est ouvert OU que l'on change de contact
  useEffect(() => {
      marquerConversationCommeLue();
  }, [chatActif, activeTab, messagesListe.length]);

  // Corrige le gel du scroll tactile iOS/WebKit quand l'app revient du premier plan
  // (bug connu : overflow-y:auto imbriqué dans un ancêtre position:fixed se fige après une mise en arrière-plan)
  useEffect(() => {
      const debloquerScrollChat = () => {
          if (document.visibilityState !== 'visible') return;
          const el = chatMessagesRef.current;
          if (!el) return;
          el.style.overflowY = 'hidden';
          void el.offsetHeight; // force le reflow
          el.style.overflowY = 'auto';
      };
      document.addEventListener('visibilitychange', debloquerScrollChat);
      window.addEventListener('pageshow', debloquerScrollChat);
      return () => {
          document.removeEventListener('visibilitychange', debloquerScrollChat);
          window.removeEventListener('pageshow', debloquerScrollChat);
      };
  }, []);
  
  const CHAT_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😢'];
  const [vuParOuvertMsgId, setVuParOuvertMsgId] = useState(null);

  const formatDateSeparateur = (dateStr) => {
      const d = new Date(dateStr);
      const maintenant = new Date();
      const hier = new Date(); hier.setDate(hier.getDate() - 1);
      if (d.toDateString() === maintenant.toDateString()) return "Aujourd'hui";
      if (d.toDateString() === hier.toDateString()) return "Hier";
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: d.getFullYear() !== maintenant.getFullYear() ? 'numeric' : undefined });
  };

  const resoudreProfilVu = (idProfil) => {
      if (idProfil === 'gerant') return { nom: 'Gérant', photo_url: null };
      if (idProfil === 'salon') return { nom: 'Salon', photo_url: null };
      const idEmp = parseInt(String(idProfil).replace('emp_', ''));
      const emp = (employesListe || []).find(e => e.id_employe === idEmp);
      return { nom: emp?.nom || 'Employé', photo_url: emp?.photo_url || null };
  };
  const TAGS_DISPONIBLES = ['Coloration', 'Soin', 'Technique', 'Barbier', 'Coupe'];

  const [tachesIA, setTachesIA] = useState([]);
  const [modalIA, setModalIA] = useState(null);
  
  const [erreur, setErreur] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const [resetTokenUrl] = useState(urlParams.get('resetToken'));
  const [newPassword, setNewPassword] = useState('');

  const [toast, setToast] = useState(null);

  // Intercepte les retours de Stripe pour afficher un message
  useEffect(() => {
      const paiementStatus = urlParams.get('paiement');
      if (paiementStatus === 'succes') {
          setToast({ message: "Paiement réussi ! Votre abonnement est activé.", type: 'success' });
          setTimeout(() => setToast(null), 4000);
          window.history.replaceState({}, document.title, "/"); // Nettoie l'URL
      } else if (paiementStatus === 'annule') {
          setToast({ message: "Paiement annulé.", type: 'error' });
          setTimeout(() => setToast(null), 4000);
          window.history.replaceState({}, document.title, "/");
      }
  }, []);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [annulationDialog, setAnnulationDialog] = useState(null);
  const [cancellationRobot, setCancellationRobot] = useState(null);
  const [selectedCancelRdvs, setSelectedCancelRdvs] = useState([]);
  const [cancelMessageTemplate, setCancelMessageTemplate] = useState('');
  const [auditNf525, setAuditNf525] = useState(null);

  const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  const activerNotificationsPush = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          showToast("Les notifications Push ne sont pas supportées par ce navigateur.", "error");
          return;
      }
      try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
              showToast("Vous avez refusé les notifications dans les réglages.", "error");
              return;
          }
          const registration = await navigator.serviceWorker.ready;
          
          // 1. On récupère la clé publique du serveur
          const response = await fetch('https://api-salon-backend.onrender.com/api/push/vapid-key');
          const data = await response.json();
          const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

          // 2. On génère le ticket d'abonnement de cet appareil
          const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey
          });

          // 3. On l'envoie au serveur
          const resSub = await fetch('https://api-salon-backend.onrender.com/api/push/subscribe', {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify({ subscription })
          });

          if(resSub.ok) {
              showToast("Notifications activées avec succès sur ce téléphone !", "success");
          } else {
              showToast("Erreur lors de l'enregistrement côté serveur.", "error");
          }
      } catch (error) {
          console.error(error);
          showToast("Erreur lors de l'activation des notifications.", "error");
      }
  };
  
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [clientHistorique, setClientHistorique] = useState({ rdv: [], achats: [], notes: '', gains: [] });
  const [chargementFiche, setChargementFiche] = useState(false);

  const [ticketGenere, setTicketGenere] = useState(null);
  const [emailTicketClient, setEmailTicketClient] = useState('');
  const [telephoneTicketClient, setTelephoneTicketClient] = useState('');

  const [newClient, setNewClient] = useState({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' });
  const [newEmploye, setNewEmploye] = useState({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null });
  const [newArticle, setNewArticle] = useState({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '', delai_livraison_jours: 3, duree_estimee_minutes: 30 });

  const [posStep, setPosStep] = useState('employee');
  const [posEmploye, setPosEmploye] = useState(null);
  const [posType, setPosType] = useState('PRESTATION'); 
  const [rechercheCaisse, setRechercheCaisse] = useState('');

  const nettoyerTexteRecherche = (texte) => {
      if (!texte) return '';
      return String(texte).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  };
  
  const [clientCaisse, setClientCaisse] = useState('');
  const [panierCaisse, setPanierCaisse] = useState([]); 
  const [remiseAppliquee, setRemiseAppliquee] = useState(false); 
  const [methodePaiement, setMethodePaiement] = useState('ESPECES');
  const [clientsSuggeres, setClientsSuggeres] = useState([]); 
  const [socket, setSocket] = useState(null);
  const [notificationCaisse, setNotificationCaisse] = useState(null);
  
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

  const [filtresEmployes, setFiltresEmployes] = useState([]); 
  const [rdvSelectionne, setRdvSelectionne] = useState(null); 
  const [isEditingRdv, setIsEditingRdv] = useState(false);
  const [editRdvForm, setEditRdvForm] = useState({ date: '', heure: '', prestation: '', id_employe: '', duree_minutes: 30 });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showModalRdv, setShowModalRdv] = useState(false);
  const [showModalAbsence, setShowModalAbsence] = useState(false);
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
  const [expandedAbsenceDate, setExpandedAbsenceDate] = useState(null);
  const [ongletAbsence, setOngletAbsence] = useState('CONGES');
  const defaultAbsenceDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const [formAbsence, setFormAbsence] = useState({ type_demande: 'CONGES', nature_absence: 'CP', type_prolongation: 'INITIAL', date_debut: defaultAbsenceDate, moment_debut: 'MATIN', date_fin: defaultAbsenceDate, moment_fin: 'APRES_MIDI', heures_sortie: '', commentaire: '', fichier_base64: null, nom_fichier: '', type_mime: '' });
  const [showDropdownPresta, setShowDropdownPresta] = useState(false);
  const [showDropdownClient, setShowDropdownClient] = useState(false);
  const [formRdv, setFormRdv] = useState({ nom_client: '', telephone_client: '', id_employe: '', prestation: '', date: '', heure: '10:00', duree_minutes: 30 });

  const [configSalon, setConfigSalon] = useState({
    google_api_key: '', google_account_id: '', google_location_id: '', email_factures: '', mot_de_passe_email: '', brevo_api_key: '', sms_sender_name: 'MonSalon', lien_google_maps: '', stripe_reader_id: '', heure_ouverture: 8, heure_fermeture: 20,
    fidelite_type: 'NONE', fidelite_points_seuil: 100, fidelite_points_valeur: 10, fidelite_tampons_seuil: 10, fidelite_recompense_type: 'MONTANT', fidelite_recompense_valeur: '10', fidelite_delai_sms: 60,
    telephone_gerant: '', alertes_sms_actives: false, email_comptable: '', jour_envoi_bilan: 1, derniere_verif_stock: null, pin_salon: '', temps_nettoyage_minutes: 0,
    plan_actuel: 'PREMIUM_TRIAL', date_fin_essai: null
  });

  const [showPricingModal, setShowPricingModal] = useState(false);

  // --- LOGIQUE REVERSE TRIAL ---
  const isTrialing = configSalon.plan_actuel === 'PREMIUM_TRIAL';
  const dateFinEssai = configSalon.date_fin_essai ? new Date(configSalon.date_fin_essai) : null;
  const joursRestantsEssai = dateFinEssai ? Math.ceil((dateFinEssai.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : 999;
  
  const isSoftLock = isTrialing && joursRestantsEssai <= 0 && joursRestantsEssai >= -7;
  // On déclenche le "Hard Lock" si l'essai est terminé OU si l'abonnement est impayé
  const isHardLock = (isTrialing && joursRestantsEssai < -7) || isAbonnementInactif;

  useEffect(() => {
      if ((isSoftLock || isHardLock) && userRole === 'gerant' && activeTab !== 'caisse' && !showPricingModal) {
          setShowPricingModal(true);
      }
  }, [isSoftLock, isHardLock, userRole, activeTab]); // Retire 'token' et ajoute la sécurité anti-boucle

  const aLeNiveau = (niveauRequis) => {
      const plan = configSalon.plan_actuel || 'PREMIUM_TRIAL';
      if (plan === 'PREMIUM_TRIAL' || plan === 'PREMIUM') return true;
      if (niveauRequis === 'PRO' && (plan === 'PRO' || plan === 'PREMIUM')) return true;
      return false;
  };

  const handleTabClick = (tabName) => {
      // On vérifie les droits pour TOUS les rôles (gérant, salon, employé)
      if (tabName === 'admin' && !aLeNiveau('PREMIUM')) {
          if (userRole !== 'gerant') return showToast("Le gérant doit débloquer l'accès Premium.", "error");
          setShowPricingModal(true);
          return;
      }
      if (tabName === 'protocoles' && !aLeNiveau('PRO')) {
          if (userRole !== 'gerant') return showToast("Le gérant doit débloquer l'accès Pro.", "error");
          setShowPricingModal(true);
          return;
      }
      
      // Si tout va bien, on change d'onglet
      setShowPricingModal(false);
      setActiveTab(tabName);
  };

  const formatDateComplete = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formatDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isToday = (d) => { const today = new Date(); return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }
  const getAuthHeaders = (isJson = false) => { const headers = {}; if (isJson) headers['Content-Type'] = 'application/json'; return headers; };
  
  const handleFetchError = async (res) => {
      // On lit le corps de la réponse en premier pour voir s'il y a des détails
      const data = await res.json().catch(() => ({})); 

      // Si c'est un problème de forfait (Upsell), on ne déconnecte SURTOUT PAS
      if (res.status === 403 && data.require_upsell) {
          throw new Error("Forfait insuffisant");
      }

      // Si c'est un vrai problème d'authentification, là on déconnecte
      if (res.status === 401 || (res.status === 403 && !data.require_upsell)) { 
          seDeconnecter(); 
          throw new Error("Session expirée"); 
      } 
      
      if (res.status === 402) { 
          setIsAbonnementInactif(true); 
          throw new Error("Abonnement inactif"); 
      } 
      
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

  const handleImageUploadProtocole = (e) => {
      const file = e.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { setNouveauProtocole({ ...nouveauProtocole, photo_url: reader.result }); };
          reader.readAsDataURL(file);
      }
  };

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

  const syncEnCours = useRef(false);
  const syncOfflineTickets = async () => {
      if (!token || syncEnCours.current) return;
      const queue = await localforage.getItem('offline_tickets') || [];
      if (queue.length === 0) return;
      const idSalonActuel = decodeToken(token)?.id_salon;

      syncEnCours.current = true;
      showToast(`Synchronisation de ${queue.length} ticket(s) en attente...`, "info");
      let restants = [...queue];
      let nbOk = 0, nbRejetes = 0, arret = null;

      try {
          // Ordre chronologique conservé : on s'arrête au premier échec temporaire
          for (const ticket of queue) {
              if (ticket._id_salon && idSalonActuel && String(ticket._id_salon) !== String(idSalonActuel)) continue; // ticket d'un autre salon : on n'y touche pas
              let res;
              try {
                  res = await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(ticket) });
              } catch (e) { arret = "Réseau instable, synchronisation reportée."; break; }

              if (res.ok) {
                  const data = await res.json().catch(() => ({}));
                  restants = restants.filter(t => t !== ticket);
                  nbOk++;
                  await localforage.setItem('offline_tickets', restants);
                  // Si ce ticket est encore affiché à l'écran (reçu ouvert), on remplace son ID temporaire par le vrai ID serveur
                  setTicketGenere(prev => (prev && prev.id_ticket === ticket._id_temp) ? { ...prev, id_ticket: data.id_ticket, is_offline: false } : prev);
                  continue;
              }

              const data = await res.json().catch(() => ({}));
              if ([401, 402, 403, 423].includes(res.status) || res.status >= 500) {
                  arret = res.status === 423 ? (data.erreur || "Clôture manquante : synchronisation reportée.")
                        : res.status === 401 || res.status === 403 ? "Session expirée : reconnectez-vous, vos tickets sont conservés."
                        : res.status === 402 ? "Abonnement inactif : vos tickets sont conservés."
                        : "Serveur indisponible, synchronisation reportée.";
                  break;
              }

              // Refus définitif (ex : donnée invalide) : on ne perd jamais le ticket, on le met de côté
              const rejetes = await localforage.getItem('offline_tickets_rejetes') || [];
              rejetes.push({ ...ticket, _erreur: data.erreur || `Erreur ${res.status}` });
              await localforage.setItem('offline_tickets_rejetes', rejetes);
              restants = restants.filter(t => t !== ticket);
              await localforage.setItem('offline_tickets', restants);
              nbRejetes++;
          }
      } finally { syncEnCours.current = false; }

      if (nbOk > 0) chargerTout();
      if (nbRejetes > 0) showToast(`${nbRejetes} ticket(s) refusé(s) par le serveur, conservés à part. Contactez le support.`, "error");
      else if (arret) showToast(arret, "error");
      else if (nbOk > 0) showToast("Tous les tickets hors-ligne ont été synchronisés !", "success");
  };

  // Nouvelle tentative automatique toutes les 5 minutes uniquement si hors-ligne
  useEffect(() => {
      if (!token) return;
      const t = setInterval(() => { 
          if (navigator.onLine && !syncEnCours.current) syncOfflineTickets(); 
      }, 300000);
      return () => clearInterval(t);
  }, [token]);

  const fetchAndCache = async (url, setter, cacheKey, expectedType = 'array') => {
      const sanitizeData = (d) => {
          if (expectedType === 'array') return Array.isArray(d) ? d : [];
          return d || null; 
      };

      try {
          const cacheBuster = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
          const res = await fetch(`https://api-salon-backend.onrender.com${url}${cacheBuster}`, { 
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

  // Extraction des dates en nombres primitifs purs pour garantir la stabilité absolue du useEffect
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
  // On n'utilise QUE des valeurs numériques et strings. Fini le windowWidth qui fluctue avec les barres de défilement !
  }, [planningStartTs, planningEndTs, activeTab, refreshTrigger, token, isAbonnementInactif]);

  useEffect(() => {
      if (token && !isAbonnementInactif) { 
          const user = decodeToken(token); setUserRole(user?.role || 'gerant');
          chargerTout(); 
          if (user && user.id_salon && !isOffline && navigator.onLine) {
              const newSocket = io('https://api-salon-backend.onrender.com', {
                  transports: ['websocket'],
                  reconnectionAttempts: Infinity,
                  timeout: 5000,
                  withCredentials: true
              });
              newSocket.on('connect', () => {
                  newSocket.emit('rejoindreSalon', user.id_salon);
              });
              newSocket.on('paiementValide', (data) => { showToast(data.message, "success"); if(user.role === 'gerant') chargerTout(); });
              newSocket.on('nouveauRDV', () => { setRefreshTrigger(prev => prev + 1); });
              newSocket.on('nouveauMessage', (data) => { setMessagesListe(prev => [...(prev || []), data]); });
              newSocket.on('messageModifie', (data) => { setMessagesListe(prev => (prev || []).map(m => m.id_message === data.id_message ? { ...m, contenu: data.contenu } : m)); });
              newSocket.on('messageSupprime', (data) => { setMessagesListe(prev => (prev || []).filter(m => m.id_message !== data.id_message)); });
              newSocket.on('messageReaction', (data) => { setMessagesListe(prev => (prev || []).map(m => m.id_message === data.id_message ? { ...m, reactions: data.reactions } : m)); });
              newSocket.on('messageVu', (data) => { setMessagesListe(prev => (prev || []).map(m => m.id_message === data.id_message ? { ...m, vu_par: data.vu_par } : m)); });
              newSocket.on('connect_error', () => {});
              setSocket(newSocket);
              return () => newSocket.disconnect();
          }
      } 
  }, [token, isAbonnementInactif, isOffline]);

  const verifierTachesIAEnBase = async () => {
      if (!token || isAbonnementInactif || decodeToken(token)?.role !== 'gerant') return;
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/ia/taches?_=${Date.now()}`, { 
              headers: getAuthHeaders(), 
              cache: 'no-store',
              pragma: 'no-cache'
          });
          if(res.ok) {
              const data = await res.json();
              setTachesIA(data || []);
          }
      } catch (e) { console.error("Erreur lecture IA", e); }
  };

  useEffect(() => {
      if (!token || isAbonnementInactif || decodeToken(token)?.role !== 'gerant') return;
      
      const user = decodeToken(token);
      let eventSource = null;
      let watchdogId = null;
      let dernierSignal = Date.now();
      
      const ouvrirConnexionSSE = () => {
          if (eventSource) eventSource.close();
          const url = `https://api-salon-backend.onrender.com/api/events/${user.id_salon}`;
          eventSource = new EventSource(url, { withCredentials: true });
          dernierSignal = Date.now();
          
          eventSource.addEventListener('connected', () => {
              console.log('%c📡 SSE connecté', 'color: #00aa00; font-weight: bold;');
              dernierSignal = Date.now();
          });
          eventSource.addEventListener('heartbeat', () => {
              dernierSignal = Date.now();
          });
          
          eventSource.addEventListener('nouvelleTacheIA', () => {
              console.log('%c🤖 Event nouvelleTacheIA REÇU côté client', 'color: #ff0000; font-weight: bold; font-size: 14px');
              dernierSignal = Date.now();
              showToast("🤖 L'IA a détecté une nouvelle action !", "success");
              verifierTachesIAEnBase(); 
              chargerTout();
          });
      };
      
      ouvrirConnexionSSE();

      const onFocus = () => verifierTachesIAEnBase();
      const onVisibilityChange = () => {
          if (document.visibilityState === 'visible') verifierTachesIAEnBase();
      };
      window.addEventListener('focus', onFocus);
      window.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
          window.removeEventListener('focus', onFocus);
          window.removeEventListener('visibilitychange', onVisibilityChange);
          if (eventSource) {
              eventSource.close();
              eventSource = null;
          }
      };
  }, [token, isAbonnementInactif]);

  useEffect(() => {
      if (!modalIA && tachesIA && (tachesIA || []).length > 0) {
          let premiereTache = { ...tachesIA[0] };
          
          // L'IA n'a pas trouvé de durée ? On cherche dans notre catalogue (Auto-Match) !
          if (premiereTache.type_tache === 'RDV' && !premiereTache.donnees.duree_minutes) {
              const nomPrestaIA = nettoyerTexteRecherche(premiereTache.donnees.prestation || '');
              const prestaMatch = (catalogueListe || []).find(p => p.type_article === 'PRESTATION' && nettoyerTexteRecherche(p.nom).includes(nomPrestaIA));
              premiereTache.donnees.duree_minutes = prestaMatch && prestaMatch.duree_estimee_minutes ? prestaMatch.duree_estimee_minutes : 30;
          }
          
          setModalIA(premiereTache);
      }
  }, [tachesIA, modalIA, catalogueListe]);

  const validerTacheIA = async (tache) => {
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/ia/taches/${tache.id_tache}/valider`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify(tache.donnees)
          });
          
          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.erreur || "Erreur base de données");
          }
          
          showToast("Action de l'IA confirmée !", "success");
          setModalIA(null);
          setTachesIA(prev => (prev || []).filter(t => t.id_tache !== tache.id_tache));
          setRefreshTrigger(prev => prev + 1); 
      } catch (e) { 
          showToast(`Erreur : ${e.message}`, "error"); 
      }
  };

  const ignorerTacheIA = async (tache) => {
      try {
          await fetch(`https://api-salon-backend.onrender.com/api/ia/taches/${tache.id_tache}/ignorer`, {
              method: 'POST',
              headers: getAuthHeaders()
          });
          showToast("Tâche ignorée", "info");
          setModalIA(null);
          setTachesIA(prev => (prev || []).filter(t => t.id_tache !== tache.id_tache));
      } catch (e) { showToast("Erreur serveur.", "error"); }
  };

  const sInscrire = async () => {
    try {
      const response = await fetch('https://api-salon-backend.onrender.com/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput, mot_de_passe: motDePasseInput, nom_salon: nomSalonInput, nom_gerant: nomGerantInput }) });
      const data = await response.json();
      if (response.ok) { 
          localStorage.setItem('ui_token', data.ui_token); setToken(data.ui_token); setErreurLogin(null); 
          const decoded = decodeToken(data.ui_token);
          setUserRole(decoded?.role || 'gerant');
          setIsAbonnementInactif(false); 
      } else { setErreurLogin(data.erreur); }
    } catch (e) { 
        console.error("Détails du crash d'inscription :", e);
        setErreurLogin(`Erreur technique : ${e.message}`); 
    }
  };

  const seConnecter = async () => {
    try {
      const endpoint = loginType === 'employe' ? 'https://api-salon-backend.onrender.com/api/employes/login-pin'
                      : loginType === 'salon' ? 'https://api-salon-backend.onrender.com/api/salon/login-pin'
                      : 'https://api-salon-backend.onrender.com/api/login';
      const payload = loginType === 'employe' ? { id_salon: idSalonInput, nom_employe: nomEmployeInput, code_pin: pinEmployeInput }
                     : loginType === 'salon' ? { id_salon: idSalonInput, pin: pinSalonInput }
                     : { email: emailInput, mot_de_passe: motDePasseInput };

      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      
      if (response.ok) { 
          localStorage.setItem('ui_token', data.ui_token); setToken(data.ui_token); setErreurLogin(null); 
          const decoded = decodeToken(data.ui_token); 
          setUserRole(decoded?.role || 'gerant'); // 👈 Sécurité ici avec le "?"
          setIsAbonnementInactif(false);
          if(decoded?.role === 'employe') { setActiveTab('agenda'); } else { setActiveTab('accueil'); }
      } else { setErreurLogin(data.erreur); }
    } catch (e) { setErreurLogin("Mode hors-ligne ou erreur de connexion."); }
  };

  const motDePasseOublie = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput }) });
          const data = await res.json();
          setMsgSucces(data.message); setErreurLogin(null);
      } catch (e) { 
        console.error("Détails du crash de mot de passe oublié :", e);
        setErreurLogin(`Erreur technique : ${e.message}`); 
      }
  };

  const seDeconnecter = () => {
      fetch('https://api-salon-backend.onrender.com/api/logout', { method: 'POST' }).catch(e => console.log(e));
      localStorage.removeItem('ui_token'); setToken(null); setIsAbonnementInactif(false); setUserRole('gerant'); if(socket) socket.disconnect(); 
  };

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
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/caisse/tickets/${id_ticket}`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          if (data.lignes.length === 0) return showToast("Ce ticket est déjà entièrement remboursé.", "info");
          setAnnulationDialog({ id_ticket, motif: '', lignes: data.lignes, lignes_a_annuler: [] });
      } catch(e) {
          showToast("Erreur lors de la récupération des détails du ticket.", "error");
      }
  };

  const confirmerAnnulationTicket = async () => {
      if (!annulationDialog) return;
      const motif = (annulationDialog.motif || '').trim();
      if (!motif) return showToast("Le motif d'annulation est obligatoire.", "error");
      try {
          const payload = { motif, lignes_a_annuler: annulationDialog.lignes_a_annuler };
          const res = await fetch(`https://api-salon-backend.onrender.com/api/caisse/annuler-ticket/${annulationDialog.id_ticket}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          setAnnulationDialog(null);
          if (clientSelectionne) ouvrirFicheClient(clientSelectionne);
          chargerTout();
      } catch (error) { showToast(error.message, "error"); }
  };

  const basculerStatutSalon = async (id_salon, statutActuel) => {
      const nouveauStatut = statutActuel === 'actif' ? 'inactif' : 'actif';
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/superadmin/salons/${id_salon}/status`, {
              method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ statut: nouveauStatut })
          });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          chargerTout();
      } catch (e) { showToast("Erreur lors de la modification", "error"); }
  };

  const supprimerSalonAdmin = async (id_salon, nom_salon) => {
      setConfirmDialog({
          titre: "DANGER : Destruction du Salon",
          message: `Êtes-vous sûr de vouloir SUPPRIMER DÉFINITIVEMENT le salon "${nom_salon}" (ID: ${id_salon}) ? Absolument TOUT sera effacé de la base de données sans aucun retour en arrière possible.`,
          btnTexte: "Oui, tout détruire",
          action: async () => {
              setConfirmDialog(null);
              try {
                  const res = await fetch(`https://api-salon-backend.onrender.com/api/superadmin/salons/${id_salon}`, {
                      method: 'DELETE', headers: getAuthHeaders()
                  });
                  const data = await handleFetchError(res);
                  showToast(data.message, "success");
                  chargerTout();
              } catch (e) { showToast(e.message || "Erreur de suppression", "error"); }
          }
      });
  };

  const ajouterClient = async () => { if(isOffline) return showToast("Désactivé hors-ligne", "error"); try { const res = await fetch('https://api-salon-backend.onrender.com/api/clients', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newClient) }); await handleFetchError(res); setNewClient({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' }); chargerTout(); showToast("Client ajouté.", "success"); setShowAddClient(false); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerClient = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Client supprimé.", "success"); } catch(e) { showToast("Erreur suppression client.", "error"); }};
  const ajouterEmploye = async () => { if(isOffline) return showToast("Désactivé", "error"); if(!newEmploye.code_pin) return showToast("Le code PIN est obligatoire.", "error"); if(isPinWeak(newEmploye.code_pin)) return showToast("Le code PIN est trop simple (évitez 0000, 1234...).", "error"); try { const res = await fetch('https://api-salon-backend.onrender.com/api/employes', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newEmploye) }); await handleFetchError(res); setNewEmploye({ nom: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null }); chargerTout(); showToast("Employé ajouté.", "success"); setShowAddEmploye(false); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerEmploye = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Employé supprimé.", "success"); } catch(e) { showToast("Erreur suppression employé.", "error"); }};
  const sauvegarderModifEmploye = async () => { if(isOffline) return showToast("Désactivé", "error"); if(modifEmployeDialog.code_pin && isPinWeak(modifEmployeDialog.code_pin)) return showToast("Le code PIN est trop simple (évitez 0000, 1234...).", "error"); try { const res = await fetch(`https://api-salon-backend.onrender.com/api/employes/${modifEmployeDialog.id_employe}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nom: modifEmployeDialog.nom, code_pin: modifEmployeDialog.code_pin, taux_commission_prestation: modifEmployeDialog.taux_commission_prestation, taux_commission_produit: modifEmployeDialog.taux_commission_produit }) }); await handleFetchError(res); chargerTout(); showToast("Employé mis à jour.", "success"); setModifEmployeDialog(null); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  
  const ajouterArticle = async () => { 
      if(isOffline) return showToast("Désactivé hors-ligne", "error"); 
      if (newArticle.type_article === 'PRODUIT_REVENTE') { 
          if (!newArticle.reference || newArticle.reference.trim().length < 4) { 
              showToast("Veuillez saisir une référence d'au moins 4 caractères.", "error"); 
              return; 
          } 
      } 
      try { 
          const res = await fetch('https://api-salon-backend.onrender.com/api/catalogue', { 
              method: 'POST', 
              headers: getAuthHeaders(true), 
              body: JSON.stringify({
                  ...newArticle,
                  delai_livraison_jours: parseInt(newArticle.delai_livraison_jours) || 3
              }) 
          }); 
          const data = await handleFetchError(res); 
          if (data.message && data.message.includes("Stock mis à jour")) { 
              showToast(data.message, "success"); 
          } 
          setNewArticle({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '', delai_livraison_jours: 3 }); 
          chargerTout(); 
          showToast("Catalogue mis à jour.", "success"); 
          setShowAddPrestation(false);
          setShowAddProduit(false);
      } catch(e) { 
          if(e.message !== "Abonnement inactif") showToast(e.message, "error"); 
      }
  };
  const supprimerArticle = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`https://api-salon-backend.onrender.com/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Article supprimé.", "success"); } catch(e) { showToast("Erreur suppression article.", "error"); }};

  const [modifNomDialog, setModifNomDialog] = useState(null);
  const confirmerModifNom = async () => {
      if (!modifNomDialog || !modifNomDialog.nom.trim()) return showToast("Le nom ne peut pas être vide.", "error");
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/catalogue/${modifNomDialog.id_article}/nom`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nom: modifNomDialog.nom.trim() }) });
          await handleFetchError(res);
          setModifNomDialog(null);
          chargerTout();
          showToast("Prestation renommée.", "success");
      } catch (e) { showToast(e.message || "Erreur lors du renommage.", "error"); }
  };

  const confirmerModifStock = async () => {
      if (!modifStockDialog) return;
      const nouveauStock = parseInt(modifStockDialog.valeur);
      if (isNaN(nouveauStock) || nouveauStock < 0) return showToast("Quantité invalide.", "error");
      try {
          const res = await fetch(`https://api-salon-backend.onrender.com/api/stocks/${modifStockDialog.id_article}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nouveau_stock: nouveauStock }) });
          await handleFetchError(res);
          setModifStockDialog(null);
          chargerTout();
          showToast("Stock mis à jour.", "success");
      } catch (e) { showToast("Erreur lors de la mise à jour du stock.", "error"); }
  };

  const ajouterIngredientRecette = () => {
      if (!ingredientTemp.id_article || !ingredientTemp.quantite_necessaire) return showToast("Sélectionnez un article et une quantité.", "error");
      const art = (catalogueListe || []).find(a => a.id_article?.toString() === ingredientTemp.id_article);
      if ((nouveauProtocole.ingredients || []).find(i => i.id_article === art.id_article)) return showToast("Ingrédient déjà dans la recette.", "error");
      setNouveauProtocole({ ...nouveauProtocole, ingredients: [...(nouveauProtocole.ingredients || []), { id_article: art.id_article, nom: art.nom, quantite_necessaire: parseFloat(ingredientTemp.quantite_necessaire) }] });
      setIngredientTemp({ id_article: '', quantite_necessaire: '' });
  };
  const supprimerIngredientRecette = (id_article) => { setNouveauProtocole({ ...nouveauProtocole, ingredients: (nouveauProtocole.ingredients || []).filter(i => i.id_article !== id_article) }); };

  const ajouterEtapeRecette = () => {
      if (!etapeTemp.texte) return showToast("La description de l'étape est requise.", "error");
      setNouveauProtocole({ ...nouveauProtocole, etapes: [...(nouveauProtocole.etapes || []), { ...etapeTemp, id_etape: Date.now() }] });
      setEtapeTemp({ texte: '', timer_min: '' });
  };
  const supprimerEtapeRecette = (id_etape) => { setNouveauProtocole({ ...nouveauProtocole, etapes: (nouveauProtocole.etapes || []).filter(e => e.id_etape !== id_etape) }); };

  const toggleTag = (tag) => {
      const tags = (nouveauProtocole.tags || []).includes(tag) ? (nouveauProtocole.tags || []).filter(t => t !== tag) : [...(nouveauProtocole.tags || []), tag];
      setNouveauProtocole({ ...nouveauProtocole, tags });
  };

  const uploadMediaProtocole = (e, type) => {
      const file = e.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { setNouveauProtocole({ ...nouveauProtocole, medias: { ...nouveauProtocole.medias, [type]: reader.result } }); };
          reader.readAsDataURL(file);
      }
  };

  const creerProtocole = async () => {
      if(isOffline) return showToast("Action impossible hors-ligne.", "error");
      if(!nouveauProtocole.nom_prestation) return showToast("Le nom de la prestation est requis.", "error");
      try {
          const method = nouveauProtocole.id_protocole ? 'PUT' : 'POST';
          const url = nouveauProtocole.id_protocole 
              ? `https://api-salon-backend.onrender.com/api/protocoles/${nouveauProtocole.id_protocole}` 
              : 'https://api-salon-backend.onrender.com/api/protocoles';

          const res = await fetch(url, { method: method, headers: getAuthHeaders(true), body: JSON.stringify({...nouveauProtocole, temps_nettoyage_minutes: nouveauProtocole.a_temps_nettoyage ? nouveauProtocole.temps_nettoyage_minutes : 0}) });
          await handleFetchError(res);
          setNouveauProtocole({ nom_prestation: '', etapes: [], medias: { avant: null, pendant: null, apres: null }, tags: [], ingredients: [], temps_nettoyage_minutes: 5, a_temps_nettoyage: false });
          setModeEditionProtocole(null);
          chargerTout(); 
          showToast(nouveauProtocole.id_protocole ? "Fiche modifiée !" : "Fiche créée !", "success");
      } catch (e) { showToast("Erreur lors de la sauvegarde.", "error"); }
  };

  const supprimerProtocole = async (id) => {
      if(isOffline) return showToast("Désactivé", "error");
      try { 
          await fetch(`https://api-salon-backend.onrender.com/api/protocoles/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); 
          setModeEditionProtocole(null);
          chargerTout(); 
          showToast("Protocole supprimé.", "success"); 
      } catch (e) { showToast("Erreur suppression.", "error"); }
  };

  const getStockStatus = (q) => { const num = parseFloat(q); if (num > 20) return { bg: 'var(--bg-success)', text: 'var(--color-success)', label: 'En stock' }; if (num >= 6) return { bg: 'var(--bg-info)', text: 'var(--color-info)', label: 'Correct' }; if (num >= 1) return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Faible' }; return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Rupture' }; };

  const getTendanceStock = (produit) => {
      if (produit.jours_restants === null || produit.jours_restants === undefined) return null;
      const jours = produit.jours_restants;
      let couleur = 'var(--color-success)';
      if (jours <= 3) couleur = 'var(--color-danger)';
      else if (jours <= 10) couleur = 'var(--color-info)';
      const texte = jours <= 0 ? "Rupture imminente" : `~${jours} j restant(s)`;
      return { texte, couleur, date: produit.date_rupture_prevue };
  };
  
  const dessinerCourbe = (d) => { 
      if (!d || !Array.isArray(d) || d.length === 0) return null;
      const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' '); 
      return <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>; 
  };
  
  const dessinerChronogramme = (d) => { 
      if (!d || !Array.isArray(d) || d.length === 0) return null;
      const max = Math.max(...d) * 1.2 || 1; 
      return (<svg width="100%" height="40px" viewBox={`0 0 100 40`} preserveAspectRatio="none">{d.map((val, i) => <rect key={i} x={i * 18} y={40 - ((val / max) * 40)} width={10} height={(val / max) * 40} fill="var(--btn-primary)" rx="2" />)}</svg>); 
  };

  const handleSelectEmployeCaisse = (id_employe) => {
      setPosEmploye(id_employe);
      const now = new Date();
      let matches = [];

      const listeRdvs = Array.isArray(planningData) ? planningData : (planningData.rendez_vous || []);
      const rdvsToday = listeRdvs.filter(r => r.id_employe === id_employe && r.date_heure_debut && isToday(new Date(r.date_heure_debut.replace('Z', ''))));
      rdvsToday.sort((a, b) => new Date(a.date_heure_debut.replace('Z', '')).getTime() - new Date(b.date_heure_debut.replace('Z', '')).getTime());

      for (let rdv of rdvsToday) {
          const rdvStart = new Date(rdv.date_heure_debut.replace('Z', ''));
          const diffMinutes = (now.getTime() - rdvStart.getTime()) / 60000; 
          
          if (diffMinutes > -30 && diffMinutes < 150) { 
              let clientInCRM = null;
              if (rdv.telephone_client) {
                  clientInCRM = (clientsListe || []).find(c => c.telephone === rdv.telephone_client);
              }
              if (!clientInCRM && rdv.nom_client) {
                  clientInCRM = (clientsListe || []).find(c => (c.nom || '').toLowerCase() === (rdv.nom_client || '').toLowerCase());
              }
              if (clientInCRM && !matches.find(m => m.id_client === clientInCRM.id_client)) {
                  matches.push({ ...clientInCRM, prestation_rdv: rdv.prestation, diffMinutes });
              }
          }
      }

      matches.sort((a, b) => b.diffMinutes - a.diffMinutes);

      if (matches.length > 0) {
          setClientsSuggeres(matches);
          setClientCaisse(matches[0].id_client.toString());
      } else {
          setClientCaisse('');
          setClientsSuggeres([]);
      }
      setPosStep('type');
  };

  const ajouterAuPanier = (article) => {
      const exist = (panierCaisse || []).find(item => item.id_article === article.id_article);
      if (exist) {
          setPanierCaisse((panierCaisse || []).map(item => item.id_article === article.id_article ? { ...item, quantite: item.quantite + 1 } : item));
      } else {
          setPanierCaisse([...(panierCaisse || []), { ...article, quantite: 1, prix_unitaire: parseFloat(article.prix || 0) }]);
      }
  };
  const retirerDuPanier = (id_article) => { setPanierCaisse((panierCaisse || []).filter(item => item.id_article !== id_article)); };

  const sousTotalCaisse = (panierCaisse || []).reduce((acc, item) => acc + ((item.prix_unitaire || 0) * (item.quantite || 0)), 0);
  let totalCaisse = sousTotalCaisse;
  
  if (remiseAppliquee) {
      if (configSalon.fidelite_type === 'POINTS') {
          totalCaisse = Math.max(0, sousTotalCaisse - parseFloat(configSalon.fidelite_points_valeur || 0));
      } else if (configSalon.fidelite_type === 'TAMPONS') {
          if (configSalon.fidelite_recompense_type === 'MONTANT') {
              totalCaisse = Math.max(0, sousTotalCaisse - parseFloat(configSalon.fidelite_recompense_valeur || 0));
          } else if (configSalon.fidelite_recompense_type === 'POURCENTAGE') {
              totalCaisse = sousTotalCaisse * (1 - (parseFloat(configSalon.fidelite_recompense_valeur || 0) / 100));
          }
      }
  }

  const validerEncaisser = () => {
      if(!posEmploye) { showToast("Veuillez sélectionner un employé.", "error"); return; }
      if((panierCaisse || []).length === 0) { showToast("Le ticket est vide.", "error"); return; }
      
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
        const offlineTicket = { ...payloadTPE, _id_temp: offlineTicketId, _id_salon: decodeToken(token)?.id_salon, date_creation: new Date().toISOString() };
        
        const queue = await localforage.getItem('offline_tickets') || [];
        queue.push(offlineTicket);
        await localforage.setItem('offline_tickets', queue);

        setTicketGenere({
            id_ticket: offlineTicketId, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? formatNomClient((clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)) : 'Client de passage',
            client_email: clientCaisse ? (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)?.email : '',
            lignes: lignes,
            is_offline: true
        });
        
        setPanierCaisse([]); setClientCaisse(''); setRemiseAppliquee(false); setMethodePaiement('ESPECES'); setRechercheCaisse('');
        showToast("Ticket sauvegardé localement (Mode Hors-Ligne)", "success");
    };

    if (vraimentHorsLigne) {
        await forcerSauvegardeLocale();
        return;
    }

    if (methodePaiement === 'CARTE' && montant > 0) setNotificationCaisse(` Envoi de l'ordre au TPE physique. En attente de la carte...`);
    
    try {
        const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/payer', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payloadTPE) });
        const data = await handleFetchError(res);
        
        setNotificationCaisse(null);
        setTicketGenere({
            id_ticket: data.id_ticket, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? formatNomClient((clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)) : 'Client de passage',
            client_email: clientCaisse ? (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)?.email : '',
            lignes: lignes
        });
        setEmailTicketClient(clientCaisse ? (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)?.email || '' : '');
        
        setPanierCaisse([]); setClientCaisse(''); setRemiseAppliquee(false); setMethodePaiement('CARTE');
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
      const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/envoyer-ticket', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ id_ticket: ticketGenere.id_ticket, email: emailTicketClient, id_client: ticketGenere.client_id, telephone: telephoneTicketClient, methode }) });
          await handleFetchError(res);
          showToast(`Ticket envoyé par ${methode.toUpperCase()} !`, "success");
          setTicketGenere(null);
      } catch (e) { showToast(`Erreur d'envoi : ${e.message}`, "error"); }
  }

  const declencherExport = async () => { if(isOffline || !navigator.onLine) return showToast("Export impossible sans réseau.", "error"); showToast("Génération du PDF en cours..."); try { const response = await fetch('https://api-salon-backend.onrender.com/api/export-pdf', { headers: getAuthHeaders() }); if (response.status === 402) { setIsAbonnementInactif(true); return; } if (!response.ok) { const errText = await response.text(); throw new Error(`Erreur Serveur: ${errText}`); } const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "Liasse_Comptable.pdf"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Liasse PDF générée et envoyée !", "success"); } catch (error) { showToast(error.message, "error"); }};

  const lancerAuditNF525 = async () => {
      if(isOffline || !navigator.onLine) return showToast("Audit impossible hors-ligne.", "error");
      showToast("Audit cryptographique en cours...", "info");
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/admin/verifier-nf525', { headers: getAuthHeaders(), credentials: 'include' });
          const data = await handleFetchError(res);
          setAuditNf525(data);
      } catch (e) { showToast(e.message || "Erreur lors de l'audit.", "error"); }
  };

  const declencherExportFEC = async () => { 
      if(isOffline || !navigator.onLine) return showToast("Export impossible sans réseau.", "error"); 
      showToast("Génération du FEC (Partie Double) en cours..."); 
      try {
          const today = new Date(); 
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1); 
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
          const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
          
          const response = await fetch(`https://api-salon-backend.onrender.com/api/export-fec?date_debut=${formatYMD(firstDay)}&date_fin=${formatYMD(lastDay)}`, { headers: getAuthHeaders() }); 
          if (response.status === 402) { setIsAbonnementInactif(true); return; } 
          if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.erreur || "Erreur Serveur"); } 
          
          const blob = await response.blob(); 
          const url = window.URL.createObjectURL(blob); 
          const a = document.createElement('a'); 
          a.href = url; 
          a.download = `FEC_${formatYMD(firstDay).replace(/-/g, '')}_${formatYMD(lastDay).replace(/-/g, '')}.txt`; 
          document.body.appendChild(a); 
          a.click(); 
          a.remove(); 
          window.URL.revokeObjectURL(url); 
          showToast("Fichier FEC téléchargé avec succès !", "success"); 
      } catch (error) { showToast(error.message, "error"); }
  };

  const telechargerBilanJour = async (date_brute) => {
      if(isOffline || !navigator.onLine) return showToast("Téléchargement impossible hors-ligne.", "error");
      showToast("Génération du PDF en cours...");
      try {
          const response = await fetch(`https://api-salon-backend.onrender.com/api/export-pdf/${date_brute}`, { headers: getAuthHeaders() });
          if (response.status === 402) { setIsAbonnementInactif(true); return; }
          if (!response.ok) throw new Error("Erreur Serveur");
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Bilan_${date_brute}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          showToast("PDF téléchargé !", "success");
      } catch (error) { showToast("Erreur lors du téléchargement.", "error"); }
  };

  const modifierMaPhoto = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
          try {
              const res = await fetch(`https://api-salon-backend.onrender.com/api/employes/${decodeToken(token)?.id_employe}/photo`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ photo_url: reader.result }) });
              await handleFetchError(res);
              chargerTout();
              showToast("Photo mise à jour.", "success");
          } catch (err) { showToast("Erreur lors de la mise à jour de la photo.", "error"); }
      };
      reader.readAsDataURL(file);
  };

  const sauvegarderParametres = async () => {
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      if(configSalon.pin_salon && isPinWeak(configSalon.pin_salon)) return showToast("Le code PIN du salon est trop simple (évitez 0000, 1234...).", "error");
      showToast("Sauvegarde en cours...");
      try { 
          const response = await fetch('https://api-salon-backend.onrender.com/api/settings', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(configSalon) }); 
          const data = await handleFetchError(response); 
          showToast(data.message, "success"); 
          chargerTout(); 
          setTimeout(() => { setActiveTab('accueil'); }, 1000); 
      } catch (error) { if(error.message !== "Abonnement inactif") showToast("Erreur serveur.", "error"); }
  };

  const creerRdvManuel = async (forcer = false) => {
      if(isOffline || !navigator.onLine) return showToast("Impossible de créer un RDV hors-ligne.", "error");
      try {
          const datetime = `${formRdv.date}T${formRdv.heure}:00`;
          const res = await fetch('https://api-salon-backend.onrender.com/api/rdv', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...formRdv, date_heure_debut: datetime, forcer_ajout: forcer}) });
          if(res.status === 409) {
              const data = await res.json();
              setConfirmDialog({ titre: "Conflit d'horaire", message: data.erreur, btnTexte: "Forcer l'ajout", action: () => { setConfirmDialog(null); creerRdvManuel(true); } });
              return;
          }
          if(res.ok) { 
              setShowModalRdv(false); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous créé", "success"); 
          } else {
              const err = await res.json(); throw new Error(err.erreur || "Erreur de création.");
          }
      } catch(e) { showToast(e.message || "Erreur de création.", "error"); }
  }

  const soumettreAbsence = async () => {
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      if(!formAbsence.date_debut || !formAbsence.date_fin) return showToast("Veuillez sélectionner les dates.", "error");
      if(isSubmittingAbsence) return; // Empêche les clics multiples
      
      setIsSubmittingAbsence(true);
      try {
          const payload = { ...formAbsence, type_demande: ongletAbsence };
          const res = await fetch('https://api-salon-backend.onrender.com/api/rh/absences', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          setShowModalAbsence(false);

          if (data.conflits && data.conflits.length > 0) {
              const empId = formAbsence.id_employe || decodeToken(token)?.id_employe;
              const nomEmp = (employesListe || []).find(e => e.id_employe === Number(empId))?.nom || 'ce collaborateur';
              const prenomEmp = nomEmp.split(' ')[0];
              setCancellationRobot({ rdvs: data.conflits, id_employe: empId, nom_employe: prenomEmp });
              setSelectedCancelRdvs(data.conflits.map(r => r.id_rdv)); // On coche tout par défaut
              setCancelMessageTemplate(`Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`);
          } else {
              chargerTout(); setRefreshTrigger(prev => prev + 1);
          }

          const defaultAbsenceDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
          setFormAbsence({ type_demande: 'CONGES', nature_absence: 'CP', type_prolongation: 'INITIAL', date_debut: defaultAbsenceDate, moment_debut: 'MATIN', date_fin: defaultAbsenceDate, moment_fin: 'APRES_MIDI', heures_sortie: '', commentaire: '', fichier_base64: null, nom_fichier: '', type_mime: '' });
      } catch (e) { 
          showToast(e.message || "Erreur de soumission", "error"); 
      } finally {
          setIsSubmittingAbsence(false);
      }
  };
  const handleUploadJustificatifAbsence = (e) => {
      const file = e.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setFormAbsence({ ...formAbsence, fichier_base64: reader.result, nom_fichier: file.name, type_mime: file.type });
          reader.readAsDataURL(file);
      }
  };

  const ouvrirRdvSelectionne = (rdv) => {
      setRdvSelectionne(rdv);
      setIsEditingRdv(false);
      const d = new Date((rdv.date_heure_debut || '').replace('Z', ''));
      setEditRdvForm({
          date: formatDateInput(d),
          heure: d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
          prestation: rdv.prestation,
          id_employe: rdv.id_employe || '',
          duree_minutes: rdv.duree_minutes || 30
      });
  };

  const sauvegarderModifRdv = async (forcer = false) => {
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      try {
          const datetime = `${editRdvForm.date}T${editRdvForm.heure}:00`;
          const res = await fetch(`https://api-salon-backend.onrender.com/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ ...editRdvForm, date_heure_debut: datetime, forcer_ajout: forcer }) });
          if(res.status === 409) {
              const data = await res.json();
              setConfirmDialog({ titre: "Conflit d'horaire", message: data.erreur, btnTexte: "Forcer la modification", action: () => { setConfirmDialog(null); sauvegarderModifRdv(true); } });
              return;
          }
          if(res.ok) { 
              setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous modifié", "success"); 
          } else {
              const err = await res.json(); throw new Error(err.erreur || "Erreur lors de la modification.");
          }
      } catch(e) { showToast(e.message || "Erreur lors de la modification.", "error"); }
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

  const [zDialogOuvert, setZDialogOuvert] = useState(false);
  const [zEmployeSelect, setZEmployeSelect] = useState('');

  const demanderZDeCaisse = () => {
      if (role === 'gerant') {
          setConfirmDialog({ titre: "Clôture Journalière (Z)", message: "Êtes-vous sûr de vouloir clôturer la caisse d'aujourd'hui ? Les données seront cryptées et figées de manière irréversible selon la loi NF525.", btnTexte: "Générer le Z", action: () => executerZDeCaisse('Gérant') });
      } else {
          setZDialogOuvert(true);
      }
  };

  const executerZDeCaisse = async (employeNom) => {
      if(isOffline || !navigator.onLine) { setConfirmDialog(null); setZDialogOuvert(false); return showToast("Impossible de sceller la caisse sans réseau.", "error"); }
      setConfirmDialog(null);
      setZDialogOuvert(false);
      const enAttente = await localforage.getItem('offline_tickets') || [];
      if (enAttente.length > 0) { await syncOfflineTickets(); const reste = await localforage.getItem('offline_tickets') || []; if (reste.length > 0) return showToast(`${reste.length} ticket(s) hors-ligne à synchroniser avant la clôture.`, "error"); }
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/cloture', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ ferme_par: employeNom }) });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          setClotureFaiteAujourdhui(true); // le bandeau de rappel disparaît immédiatement
          setZEmployeSelect('');
      } catch(e) { showToast("Erreur lors de la clôture.", "error"); }
  };

  // --- Rappel de clôture journalière (bandeau) ---
  const [clotureFaiteAujourdhui, setClotureFaiteAujourdhui] = useState(true);
  const [heureActuelle, setHeureActuelle] = useState(new Date());
  const [clotureAutoInfo, setClotureAutoInfo] = useState(null);
  const [alertesFermees, setAlertesFermees] = useState(() => { try { return JSON.parse(localStorage.getItem('alertesFermees')) || {}; } catch(e) { return {}; } });

  const fermerAlerte = (cle) => {
      const next = { ...alertesFermees, [cle]: true };
      setAlertesFermees(next);
      localStorage.setItem('alertesFermees', JSON.stringify(next));
  };

  const verifierStatutCloture = async () => {
      if (decodeToken(token)?.role !== 'gerant') return;
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/caisse/cloture/statut', { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setClotureFaiteAujourdhui(!!data.cloture_faite);
          if (data.derniere_cloture_auto) setClotureAutoInfo(data.derniere_cloture_auto);
      } catch (e) { /* échec silencieux : on retentera au prochain intervalle */ }
  };

  useEffect(() => {
      if (!token) return;
      verifierStatutCloture();
      const intervalStatut = setInterval(verifierStatutCloture, 5 * 60 * 1000);
      const intervalHorloge = setInterval(() => setHeureActuelle(new Date()), 60 * 1000);
      return () => { clearInterval(intervalStatut); clearInterval(intervalHorloge); };
  }, [token]);

  const afficherRappelCloture = (() => {
      if (decodeToken(token)?.role !== 'gerant' || clotureFaiteAujourdhui) return false;
      const heureFermeture = parseFloat(configSalon.heure_fermeture) || 20;
      const minutesFermeture = heureFermeture * 60;
      const minutesActuelles = heureActuelle.getHours() * 60 + heureActuelle.getMinutes();
      return minutesActuelles >= (minutesFermeture - 30);
  })();

  // --- Rappel de vérification manuelle des stocks (tous les 3 mois) ---
  const validerVerifStock = async () => {
      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/stocks/verification/fait', { method: 'POST', headers: getAuthHeaders() });
          await handleFetchError(res);
          setConfigSalon(prev => ({ ...prev, derniere_verif_stock: new Date().toISOString() }));
      } catch (e) { showToast("Erreur lors de l'enregistrement.", "error"); }
  };

  const afficherRappelStock = (() => {
      if (!['gerant', 'salon'].includes(decodeToken(token)?.role)) return false;
      if (!configSalon.derniere_verif_stock) return true;
      const prochainRappel = new Date(configSalon.derniere_verif_stock);
      prochainRappel.setMonth(prochainRappel.getMonth() + 3);
      return heureActuelle >= prochainRappel;
  })();

  const getCouleurTache = (tache) => {
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

  let clientCaisseObj = null;
  let isEligibleFidelite = false;
  let texteRecompense = '';

  if (clientCaisse) {
      clientCaisseObj = (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse);
      if (clientCaisseObj && configSalon.fidelite_type !== 'NONE') {
          if (configSalon.fidelite_type === 'POINTS' && (clientCaisseObj.points_fidelite || 0) >= (configSalon.fidelite_points_seuil || 0)) {
              isEligibleFidelite = true;
              texteRecompense = `-${configSalon.fidelite_points_valeur}€ offerts`;
          } else if (configSalon.fidelite_type === 'TAMPONS' && (clientCaisseObj.tampons_fidelite || 0) >= (configSalon.fidelite_tampons_seuil || 0)) {
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

          <div style={{display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px'}}>
             <button onClick={() => {setLoginType('gerant'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'gerant' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'gerant' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px'}}>Gérant</button>
             <button onClick={() => {setLoginType('employe'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'employe' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'employe' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px'}}>Employé</button>
             <button onClick={() => {setLoginType('salon'); setErreurLogin(null); setIsForgotPassword(false);}} style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'salon' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'salon' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px'}}>Salon</button>
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
                      {!isLoginMode && (<input type="text" className="input-fournisseur" placeholder="Votre prénom (Le Gérant)" style={{marginBottom: '12px'}} value={nomGerantInput} onChange={(e) => setNomGerantInput(e.target.value)} />)}
                      {!isLoginMode && (<input type="text" className="input-fournisseur" placeholder="Nom de votre salon" style={{marginBottom: '12px'}} value={nomSalonInput} onChange={(e) => setNomSalonInput(e.target.value)} />)}
                      <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{marginBottom: '12px'}} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                      <input type="password" className="input-fournisseur" placeholder="Mot de passe" value={motDePasseInput} onChange={(e) => setMotDePasseInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (isLoginMode ? seConnecter() : sInscrire())} />
                      <button className="btn-action" onClick={isLoginMode ? seConnecter : sInscrire} style={{ width: '100%', marginTop: '16px' }}>{isLoginMode ? 'Se connecter' : "S'inscrire"}</button>
                      <div style={{display:'flex', justifyContent:'space-between', marginTop: '24px'}}>
                         <p style={{fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', margin:0, fontWeight: '600'}} onClick={() => { setIsLoginMode(!isLoginMode); setErreurLogin(null); }}>{isLoginMode ? "Créer un compte" : "Se connecter"}</p>
                         {isLoginMode && <p style={{fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', margin:0}} onClick={() => setIsForgotPassword(true)}>Oublié ?</p>}
                      </div>
                   </>
                ) : loginType === 'employe' ? (
                   <>
                      <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{marginBottom: '12px'}} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                      <input type="text" className="input-fournisseur" placeholder="Votre prénom" style={{marginBottom: '12px'}} value={nomEmployeInput} onChange={(e) => setNomEmployeInput(e.target.value)} />
                      <input type="password" maxLength="4" className="input-fournisseur" placeholder="Code PIN à 4 chiffres" value={pinEmployeInput} onChange={(e) => setPinEmployeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && seConnecter()} />
                      <button className="btn-action" onClick={seConnecter} style={{ width: '100%', marginTop: '16px' }}>Accéder au Planning</button>
                   </>
                ) : (
                   <>
                      <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{marginBottom: '12px'}} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                      <input type="password" maxLength="10" inputMode="numeric" className="input-fournisseur" placeholder="Code PIN du salon" value={pinSalonInput} onChange={(e) => setPinSalonInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && seConnecter()} />
                      <button className="btn-action" onClick={seConnecter} style={{ width: '100%', marginTop: '16px' }}>Accéder au Salon</button>
                   </>
                )}
             </>
          )}
        </div>
      </div>
    );
  }

  // Pop-up bloquant : le gérant doit accepter les documents contractuels avant tout (et avant le paiement)
  if (token && userRole === 'gerant' && legalStatut && legalStatut.accepte === false) {
    return (
      <PopupLegal
        apiBase="https://api-salon-backend.onrender.com"
        token={token}
        onAccepted={() => setLegalStatut({ ...legalStatut, accepte: true })}
        onRefuse={seDeconnecter}
      />
    );
  }


  const role = userRole;
  const heureDebutAgenda = Math.max(0, Math.min(23, parseInt(configSalon.heure_ouverture) || 8));
  const heureFinAgenda = Math.max(heureDebutAgenda, Math.min(23, parseInt(configSalon.heure_fermeture) || 20));
  const nbHeures = Math.max(1, heureFinAgenda - heureDebutAgenda + 1);

  const getPrestationsSuggerees = (texteSaisi) => {
      const prestationsDb = (catalogueListe || []).filter(a => a.type_article === 'PRESTATION');
      const searchClean = nettoyerTexteRecherche(texteSaisi);

      let resultats = [];
      
      if (!searchClean) {
          const topNoms = (dashboardData?.top_3_prestations || []).map(p => (p.nom || '').toLowerCase() || '') || [];
          const topPrestas = prestationsDb.filter(p => p.nom && topNoms.includes((p.nom || '').toLowerCase()));
          const autresPrestas = prestationsDb.filter(p => !p.nom || !topNoms.includes((p.nom || '').toLowerCase()));
          resultats = [...topPrestas, ...autresPrestas];
      } else {
          resultats = prestationsDb.filter(p => nettoyerTexteRecherche(p.nom).includes(searchClean));
      }
      
      return resultats.slice(0, 5); 
  };

  const getClientsSuggeresPourRdv = (texteSaisi) => {
      if (!texteSaisi) return (clientsListe || []).slice(0, 5);

      const searchClean = nettoyerTexteRecherche(texteSaisi);
      
      return (clientsListe || []).filter(cli => {
          const nomComplet = nettoyerTexteRecherche(formatNomClient(cli));
          const tel = nettoyerTexteRecherche(cli.telephone || '');
          return nomComplet.includes(searchClean) || tel.includes(searchClean);
      }).slice(0, 5); 
  };

  const formatPortion = (qte) => {
      const val = parseFloat(qte);
      if (Math.abs(val - 0.13) < 0.01) return "1/8";
      if (Math.abs(val - 0.25) < 0.01) return "1/4";
      if (Math.abs(val - 0.33) < 0.01) return "1/3";
      if (Math.abs(val - 0.5) < 0.01) return "1/2";
      if (Math.abs(val - 0.67) < 0.01) return "2/3";
      if (Math.abs(val - 0.75) < 0.01) return "3/4";
      return val;
  };

  const getInitials = (name) => {
      if (!name) return '??';
      const parts = name.trim().split(' ');
      if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.substring(0, 2).toUpperCase();
  };

  const renderAvatar = (url, name, size = 40) => (
      url ? 
      <img src={url} alt={name} style={{width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-color)'}} /> : 
      <div style={{width: size, height: size, borderRadius: '50%', background: 'var(--btn-primary)', color: 'var(--btn-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 'bold', flexShrink: 0, border: '1px solid var(--border-color)'}}>{getInitials(name || 'Inconnu')}</div>
  );

  const handleChatFileUpload = (e) => {
      const file = e.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setMsgFile(reader.result);
          reader.readAsDataURL(file);
      }
  };

  const envoyerMessage = async () => {
      if (!msgInput.trim() && !msgFile) return;
      
      const monProfil = role === 'employe' ? (employesListe || []).find(e => e.id_employe === decodeToken(token)?.id_employe) : null;
      
      const payload = {
          id_destinataire: chatActif,
          contenu: msgInput.trim(),
          fichier_url: msgFile,
          nom_expediteur: monProfil?.nom,
          photo_expediteur: monProfil?.photo_url
      };

      try {
          const res = await fetch('https://api-salon-backend.onrender.com/api/messages', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
          const data = await handleFetchError(res);
          setMsgInput('');
          setMsgFile(null);
          // Marquage "lu" immédiat, sans attendre l'effet ni l'écho du socket : évite le faux badge si on ferme/recharge juste après
          if (data && data.id_message) {
              const cleStr = String(chatActif);
              setDernierLuParConv(prev => {
                  if (Number(prev[cleStr] || 0) >= Number(data.id_message)) return prev;
                  const next = { ...prev, [cleStr]: Number(data.id_message) };
                  localforage.setItem('dernierLuParConv', next);
                  return next;
              });
          }
      } catch (e) { if (e.message !== "Session expirée" && e.message !== "Abonnement inactif") showToast(e.message || "Erreur d'envoi du message", "error"); }
  };

  const supprimerMessage = async (id) => {
      try { await fetch(`https://api-salon-backend.onrender.com/api/messages/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); setActiveMenuId(null); } catch (e) { showToast("Erreur de suppression", "error"); }
  };

  const demarrerEdition = (msg) => {
      setEditingMsgId(msg.id_message);
      setEditMsgContent(msg.contenu);
      setActiveMenuId(null);
  };

  const validerEdition = async (id) => {
      if(!editMsgContent.trim()) return setEditingMsgId(null);
      try { await fetch(`https://api-salon-backend.onrender.com/api/messages/${id}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ contenu: editMsgContent.trim() }) }); setEditingMsgId(null); } catch (e) { showToast("Erreur de modification", "error"); }
  };

  const toggleReaction = async (id, emoji) => {
      try { await fetch(`https://api-salon-backend.onrender.com/api/messages/${id}/react`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ emoji }) }); setActiveReactionId(null); } catch(e) { showToast("Erreur d'ajout de la réaction", "error"); }
  };

  const iconBord = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  const iconCaisse = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
  const iconAgenda = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconActions = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  const iconCompta = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
  const iconOutils = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;

  const onglMobilesParRole = (r) => {
      const iconComptaLock = !aLeNiveau('PREMIUM') ? (
          <div style={{position:'relative'}}>
              <span style={{position:'absolute', top:'-4px', right:'-4px', color:'var(--text-muted)', background:'var(--bg-app)', borderRadius:'50%', padding:'1px', display:'flex'}}><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>
              {iconCompta}
          </div>
      ) : iconCompta;

      if (r === 'gerant') return [
          { key: 'accueil', label: 'Bord', icon: iconBord },
          { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
          { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
          { key: 'outils', label: 'Outils', icon: iconOutils },
      ];
      if (r === 'salon') return [
          { key: 'accueil', label: 'Bord', icon: iconBord },
          { key: 'caisse', label: 'Caisse', icon: iconCaisse },
          { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
          { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
          { key: 'outils', label: 'Outils', icon: iconOutils },
      ];
      // employe
      return [
          { key: 'accueil', label: 'Bord', icon: iconBord },
          { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
          { key: 'admin', label: 'Compta', icon: iconComptaLock },
          { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
          { key: 'outils', label: 'Outils', icon: iconOutils },
      ];
  };
  return (
    <>
    <div className="app-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>

      {(() => {
          const jourKey = new Date().toLocaleDateString('fr-FR');
          const showTrial = isTrialing && joursRestantsEssai <= 5 && joursRestantsEssai > 0 && !alertesFermees[`trial_${jourKey}`];
          const showCloture = afficherRappelCloture && !alertesFermees[`cloture_${jourKey}`];
          const showStock = afficherRappelStock && !alertesFermees[`stock_${jourKey}`];
          const showAuto = clotureAutoInfo && !alertesFermees[`cloture_auto_${clotureAutoInfo}`];

          if (!showTrial && !showCloture && !showStock && !showAuto) return null;

          return (
              <div className="rappels-fixes-container">
                  {showTrial && (
                      <div className="rappel-stock-banner" style={{borderColor: '#f59e0b', borderLeftColor: '#f59e0b', position: 'relative', paddingRight: '40px'}}>
                          <span>⚠️ Votre mois d'essai gratuit se termine dans {joursRestantsEssai} jour(s). Pensez à choisir votre forfait.</span>
                          <button onClick={() => setShowPricingModal(true)} style={{background: '#f59e0b'}}>Choisir</button>
                          <button onClick={() => fermerAlerte(`trial_${jourKey}`)} style={{position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px'}}>✕</button>
                      </div>
                  )}
                  {showCloture && (
                      <div className="rappel-cloture-banner" style={{position: 'relative', paddingRight: '40px'}}>
                          <span>N'oublie pas d'effectuer la Clôture Journalière</span>
                          <button onClick={() => setActiveTab('admin')}>Faire la clôture</button>
                          <button onClick={() => fermerAlerte(`cloture_${jourKey}`)} style={{position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px'}}>✕</button>
                      </div>
                  )}
                  {showStock && (
                      <div className="rappel-stock-banner" style={{position: 'relative', paddingRight: '40px'}}>
                          <span>Nous vous conseillons de vérifier les stocks manuellement</span>
                          <button onClick={validerVerifStock}>Fait</button>
                          <button onClick={() => fermerAlerte(`stock_${jourKey}`)} style={{position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px'}}>✕</button>
                      </div>
                  )}
                  {showAuto && (
                      <div className="rappel-stock-banner" style={{borderColor: 'var(--color-info)', borderLeftColor: 'var(--color-info)', position: 'relative', paddingRight: '40px'}}>
                          <span>La caisse du {new Date(clotureAutoInfo).toLocaleDateString('fr-FR')} a été clôturée automatiquement.</span>
                          <button onClick={() => fermerAlerte(`cloture_auto_${clotureAutoInfo}`)} style={{background: 'var(--color-info)'}}>OK</button>
                          <button onClick={() => fermerAlerte(`cloture_auto_${clotureAutoInfo}`)} style={{position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px'}}>✕</button>
                      </div>
                  )}
              </div>
          );
      })()}

      <style>{`
          .rdv-card-accordeon {
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .rdv-card-accordeon:hover {
              z-index: 100 !important;
              transform: scale(1.02);
              box-shadow: 0 8px 16px rgba(0,0,0,0.25) !important;
          }
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 100000, width: '100%' }}>
          {isOffline && (
            <div style={{ background: '#dc2626', color: 'white', textAlign: 'center', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box' }}>
                ⚠️ Connexion perdue. Mode hors-ligne activé.
            </div>
          )}

          {pendingOfflineCount > 0 && (
            <div style={{ background: '#991b1b', color: 'white', textAlign: 'center', padding: '12px 16px', fontSize: '13px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 12px rgba(153, 27, 27, 0.4)' }}>
                ⚠️ {pendingOfflineCount} ticket(s) en attente de réseau. Ne fermez pas cette page et ne videz pas l'historique.
            </div>
          )}
      </div>

      {modalIA && (
          <div className="modal-overlay">
              <div className="modal-content" style={{maxWidth: '420px'}}>
                  <div style={{display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px'}}>
                      <div style={{width: '42px', height: '42px', borderRadius: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-main)'}}>
                          {modalIA.type_tache === 'STOCK' ? (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                          ) : modalIA.type_tache === 'RDV' ? (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          ) : modalIA.type_tache === 'ABSENCE' ? (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 14l2 2 4-4"/></svg>
                          ) : (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          )}
                      </div>
                      <div style={{flex: 1, minWidth: 0}}>
                          <span className="badge-discret" style={{background: 'var(--bg-app)', color: 'var(--text-secondary)', marginBottom: '6px'}}>Détection automatique</span>
                          <h2 style={{margin: '2px 0 2px 0', color: 'var(--text-main)', fontSize: '17px'}}>
                              {modalIA.type_tache === 'STOCK' ? "Nouvelle commande détectée" : modalIA.type_tache === 'RDV' ? "Nouveau RDV détecté" : modalIA.type_tache === 'ABSENCE' ? "Absence détectée" : "Nouvelle action détectée"}
                          </h2>
                          <p style={{fontSize: '13px', color: 'var(--text-secondary)', margin: 0}}>
                              {modalIA.type_tache === 'STOCK' ? "Extrait d'une facture reçue par e-mail" : modalIA.type_tache === 'RDV' ? "Extrait d'un e-mail de réservation" : modalIA.type_tache === 'ABSENCE' ? "Un collaborateur a signalé une absence" : "Extrait d'un e-mail entrant"}
                          </p>
                      </div>
                  </div>

                  <div style={{textAlign: 'left', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', marginBottom: '24px'}}>
                      {modalIA.type_tache === 'STOCK' && (
                          <>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Article commandé</label>
                              <input className="input-fournisseur" style={{marginBottom: '12px'}} value={modalIA.donnees?.nom_produit || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, nom_produit: e.target.value}})} />
                              
                              <div style={{display: 'flex', gap: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Quantité</label>
                                      <input type="number" className="input-fournisseur" value={modalIA.donnees?.quantite || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, quantite: parseInt(e.target.value)}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Référence</label>
                                      <input className="input-fournisseur" placeholder="Optionnel" value={modalIA.donnees?.reference || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, reference: e.target.value}})} />
                                  </div>
                              </div>
                          </>
                      )}
                      
                      {modalIA.type_tache === 'RDV' && (
                          <>
                              <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Client</label>
                                      <input className="input-fournisseur" value={modalIA.donnees?.nom_client || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, nom_client: e.target.value}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Téléphone</label>
                                      <input className="input-fournisseur" value={modalIA.donnees?.telephone || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, telephone: e.target.value}})} />
                                  </div>
                              </div>
                              
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Prestation demandée</label>
                              <input className="input-fournisseur" style={{marginBottom: '12px'}} value={modalIA.donnees?.prestation || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, prestation: e.target.value}})} />

                              <div style={{display: 'flex', gap: '12px'}}>
                                  <div style={{flex: 2}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Date et Heure</label>
                                      <input type="datetime-local" className="input-fournisseur" value={modalIA.donnees?.date_heure_debut || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, date_heure_debut: e.target.value}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Durée (min)</label>
                                      <input type="number" className="input-fournisseur" value={modalIA.donnees?.duree_minutes || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, duree_minutes: parseInt(e.target.value)}})} />
                                  </div>
                                  <div style={{flex: 2}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Coiffeur</label>
                                      <select className="input-fournisseur" value={modalIA.donnees?.id_employe || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, id_employe: e.target.value}})}>
                                          <option value="">-- Choisir --</option>
                                          {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                                      </select>
                                  </div>
                              </div>
                          </>
                      )}

                      {modalIA.type_tache === 'ABSENCE' && (
                          <>
                              <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Employé concerné</label>
                                      <input className="input-fournisseur" value={modalIA.donnees?.nom_employe || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, nom_employe: e.target.value}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Type</label>
                                      <select className="input-fournisseur" value={modalIA.donnees?.type_demande || 'CONGES'} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, type_demande: e.target.value}})}>
                                          <option value="CONGES">Congés (À valider)</option>
                                          <option value="ARRET_MALADIE">Arrêt Maladie (Imposé)</option>
                                      </select>
                                  </div>
                              </div>
                              
                              <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Du</label>
                                      <input type="date" className="input-fournisseur" value={modalIA.donnees?.date_debut || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, date_debut: e.target.value}})} />
                                  </div>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Au</label>
                                      <input type="date" className="input-fournisseur" value={modalIA.donnees?.date_fin || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, date_fin: e.target.value}})} />
                                  </div>
                              </div>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Commentaire extrait</label>
                              <textarea className="input-fournisseur" rows="2" value={modalIA.donnees?.commentaire || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, commentaire: e.target.value}})} />
                          </>
                      )}

                      {modalIA.type_tache === 'ACTION' && (
                          <>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Action requise détectée</label>
                              <input className="input-fournisseur" style={{marginBottom: '12px'}} value={modalIA.donnees?.titre || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, titre: e.target.value}})} />
                              
                              <div style={{display: 'flex', gap: '12px'}}>
                                  <div style={{flex: 1}}>
                                      <label style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Échéance</label>
                                      <input type="date" className="input-fournisseur" value={modalIA.donnees?.date_echeance || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, date_echeance: e.target.value}})} />
                                  </div>
                              </div>
                              <label style={{fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px', display: 'block'}}>Détails extraits</label>
                              <textarea className="input-fournisseur" rows="2" value={modalIA.donnees?.description || ''} onChange={e => setModalIA({...modalIA, donnees: {...modalIA.donnees, description: e.target.value}})} />
                          </>
                      )}
                  </div>
                  
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => ignorerTacheIA(modalIA)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Ignorer</button>
                      <button onClick={() => validerTacheIA(modalIA)} className="btn-action" style={{flex: 2}}>
                          {modalIA.type_tache === 'STOCK' ? "Ajouter au stock" : modalIA.type_tache === 'RDV' ? "Ajouter à l'Agenda" : modalIA.type_tache === 'ABSENCE' ? "Enregistrer l'absence" : "Ajouter au Centre d'Action"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- BARRE DE NAVIGATION (DESKTOP & MOBILE) --- */}
      <div className="navbar-sidebar">
          {/* VUE DESKTOP */}
          {!isMobile && (
              <>
                 <div className={`nav-item ${activeTab === 'accueil' ? 'active' : ''}`} onClick={() => setActiveTab('accueil')}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span>Bord</span></div>
                 {(role === 'gerant' || role === 'salon' || role === 'employe') && (
                     <div className={`nav-item ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')} style={{ position: 'relative' }}>
                         {nbTachesUrgentes > 0 && <span style={{position:'absolute', top:'6px', right:'14px', width:'10px', height:'10px', background:'var(--color-danger)', borderRadius:'50%', border:'2px solid var(--bg-card)'}}></span>}
                         <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span><span>Actions</span>
                     </div>
                 )}
                 <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')} style={{ position: 'relative' }}>
                     {(tachesIA || []).some(t => t.type_tache === 'CLIENT') && <span className="badge-ia-rouge"></span>}
                     <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span><span>Agenda</span>
                 </div>
                 {role === 'salon' && (
                     <div className={`nav-item ${activeTab === 'caisse' ? 'active' : ''}`} onClick={() => setActiveTab('caisse')}><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span><span>Caisse</span></div>
                 )}
                 {(role === 'gerant' || role === 'salon') && (
                     <>
                        <div className={`nav-item ${activeTab === 'protocoles' ? 'active' : ''}`} onClick={() => handleTabClick('protocoles')} style={{ position: 'relative' }}>
                            {!aLeNiveau('PRO') && <span style={{position:'absolute', top:'8px', right:'8px', color:'var(--text-muted)'}}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>}
                            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span><span>L'Académie</span>
                        </div>
                        <div className={`nav-item ${activeTab === 'produits' ? 'active' : ''}`} onClick={() => setActiveTab('produits')} style={{ position: 'relative' }}>
                            {(tachesIA || []).some(t => t.type_tache === 'STOCK') && <span className="badge-ia-rouge"></span>}
                            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span><span>Stocks</span>
                        </div>
                     </>
                 )}
                 {role === 'gerant' && (
                     <div className={`nav-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => handleTabClick('rh')} style={{ position: 'relative' }}>
                         <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span>Équipe</span>
                     </div>
                 )}
                 {(role === 'gerant' || role === 'salon' || role === 'employe') && (
                     <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => handleTabClick('admin')} style={{ position: 'relative' }}>
                         {!aLeNiveau('PREMIUM') && <span style={{position:'absolute', top:'8px', right:'8px', color:'var(--text-muted)'}}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>}
                         <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span><span>Compta</span>
                     </div>
                 )}
                 {role === 'gerant' && decodeToken(token)?.email === '2@gmail.com' && (
                     <div className={`nav-item ${activeTab === 'superadmin' ? 'active' : ''}`} onClick={() => setActiveTab('superadmin')}>
                         <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#aa3bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></span><span style={{color: '#aa3bff', fontWeight: 'bold'}}>God Mode</span>
                     </div>
                 )}
                 <div className={`nav-item ${activeTab === 'messagerie' ? 'active' : ''}`} onClick={() => setActiveTab('messagerie')} style={{ position: 'relative' }}>
                     {aDesMessagesNonLus && <span className="badge-ia-rouge"></span>}
                     <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></span><span>Chat</span>
                 </div>
                 <div className="navbar-spacer"></div>
                 <div className="nav-item" onClick={seDeconnecter} style={{ color: 'var(--color-danger)' }} title="Se déconnecter"><span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span style={{fontWeight: 500}}>Quitter</span></div>
              </>
          )}

          {/* VUE MOBILE : BARRE "LIQUID GLASS" (voir LiquidTabBar.jsx) */}
          {isMobile && (
              <LiquidTabBar
                  activeIndex={(() => {
                      const items = onglMobilesParRole(role);
                      const idxOutils = items.length - 1;
                      if (isOutilsMenuOpen || ['protocoles', 'produits', 'rh', 'superadmin'].includes(activeTab)) return idxOutils;
                      const idx = items.findIndex(it => it.key === activeTab || (it.key === 'admin' && activeTab === 'admin'));
                      return idx >= 0 ? idx : 0;
                  })()}
                  items={onglMobilesParRole(role).map(it => {
                      if (it.key === 'outils') return { ...it, badge: aDesMessagesNonLus && !isOutilsMenuOpen, onSelect: () => setIsOutilsMenuOpen(true) };
                      return { ...it, onSelect: () => { handleTabClick(it.key); setIsOutilsMenuOpen(false); } };
                  })}
              />
          )}
      </div>

      <div className="main-content">
        <div className={`dashboard-container ${['caisse', 'agenda', 'messagerie'].includes(activeTab) ? 'wide' : ''}`}>

              {/* VUE : TABLEAU DE BORD (ACCUEIL) */}
              {role === 'salon' && activeTab === 'accueil' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div><h1 style={{margin: 0}}>Tableau de bord</h1><span className="date-subtitle" style={{margin: 0}}>{configSalon.nom_salon || 'Salon'}</span></div>
                      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                          <ThemeToggle />
                          <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres">
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                          </button>
                      </div>
                  </div>
                  <div className="carte" style={{padding: '28px', textAlign: 'center'}}>
                      <span style={{fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Clients ce mois-ci</span>
                      <div style={{fontSize: '48px', fontWeight: '700', color: 'var(--text-main)', margin: '8px 0'}}>{salonDashboardData?.nb_clients_mois ?? '—'}</div>
                      {salonDashboardData && (
                          <span style={{fontSize: '14px', fontWeight: '600', color: salonDashboardData.evolution_pourcentage >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}}>
                              {salonDashboardData.evolution_pourcentage >= 0 ? '↗' : '↘'} {Math.abs(salonDashboardData.evolution_pourcentage)}% vs mois dernier
                          </span>
                      )}
                  </div>
                </div>
              )}

              {role === 'employe' && activeTab === 'accueil' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div><h1 style={{margin: 0}}>Bienvenue {(employesListe || []).find(e => e.id_employe === decodeToken(token)?.id_employe)?.nom || ''}</h1><span className="date-subtitle" style={{margin: 0}}>Votre tableau de bord — ce mois-ci</span></div>
                      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                          <ThemeToggle />
                          <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres">
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                          </button>
                      </div>
                  </div>
                  <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
                      <div className="carte" style={{padding: '24px', textAlign: 'center', flex: '1 1 200px'}}>
                          <span style={{fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Mes clients</span>
                          <div style={{fontSize: '40px', fontWeight: '700', color: 'var(--text-main)', margin: '8px 0'}}>{employeDashboardData?.nb_clients_mois ?? '—'}</div>
                          {employeDashboardData && (
                              <span style={{fontSize: '13px', fontWeight: '600', color: employeDashboardData.evolution_pourcentage >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}}>
                                  {employeDashboardData.evolution_pourcentage >= 0 ? '↗' : '↘'} {Math.abs(employeDashboardData.evolution_pourcentage)}%
                              </span>
                          )}
                      </div>
                      <div className="carte" style={{padding: '24px', textAlign: 'center', flex: '1 1 200px'}}>
                          <span style={{fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Ma commission</span>
                          <div style={{fontSize: '40px', fontWeight: '700', color: 'var(--text-main)', margin: '8px 0'}}>{(employeDashboardData?.commission_mois ?? 0).toFixed(2)} €</div>
                          <span style={{fontSize: '13px', color: 'var(--text-muted)'}}>Mois en cours</span>
                      </div>
                  </div>
                </div>
              )}

              {role === 'gerant' && activeTab === 'accueil' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div>
                              <h1 style={{margin: 0}}>Tableau de Bord <span style={{fontSize: '14px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '10px'}}>(ID : {decodeToken(token)?.id_salon})</span></h1>
                              <span className="date-subtitle" style={{margin: 0}}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                          </div>
                          <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                              <ThemeToggle />
                              <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres">
                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                              </button>
                          </div>
                      </div>
                  </div>
                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  {!dashboardData ? (
                      <div className="skeleton-loading" style={{height: '200px', borderRadius: 'var(--radius-card)'}}></div>
                  ) : (
                      <>
                          <div className="kpi-grid">
                              <div className="kpi-card">
                                  <span className="kpi-label">Chiffre d'affaires</span>
                                  <p className="kpi-value">{dashboardData.finances?.chiffre_affaires_total?.toFixed(2) || '0.00'} <span className="kpi-currency">€</span></p>
                              </div>
                              <div className="kpi-card">
                                  <span className="kpi-label">Panier moyen</span>
                                  <p className="kpi-value">{dashboardData.finances?.panier_moyen || '0.00'} <span className="kpi-currency">€</span></p>
                              </div>
                          </div>
                          <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '8px'}}>
                              <div className="carte" style={{flex: 1, minWidth: '300px'}}>
                                  <h3 style={{marginTop: 0, marginBottom: '16px', color: 'var(--text-main)'}}>Top Prestations</h3>
                                  {(dashboardData.top_3_prestations || []).length > 0 ? (
                                      <div className="rank-list">
                                          {(() => {
                                              const maxVal = Math.max(...(dashboardData.top_3_prestations || []).map(p => parseFloat(p.total_genere || 0)), 1);
                                              return (dashboardData.top_3_prestations || []).map((p, i) => {
                                                  const val = parseFloat(p.total_genere || 0);
                                                  return (
                                                      <div key={i} className="rank-row">
                                                          <span className="rank-badge">{i + 1}</span>
                                                          <div className="rank-info">
                                                              <div className="rank-info-top">
                                                                  <span className="rank-name">{p.nom}</span>
                                                                  <span className="rank-value">{val.toFixed(2)} €</span>
                                                              </div>
                                                              <div className="rank-bar-track"><div className="rank-bar-fill" style={{width: `${(val / maxVal) * 100}%`}}></div></div>
                                                          </div>
                                                      </div>
                                                  );
                                              });
                                          })()}
                                      </div>
                                  ) : <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Pas assez de données pour afficher le classement.</p>}
                              </div>

                              <div className="carte" style={{flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', maxHeight: '400px'}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0}}>
                                      <h3 style={{marginTop: 0, marginBottom: 0, color: 'var(--text-main)'}}>Mur des Verbatims</h3>
                                      {dashboardData.marketing?.nps !== null && dashboardData.marketing?.nps !== undefined && (
                                          <div style={{background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px'}} title="Net Promoter Score (-100 à +100)">
                                              NPS : <span style={{color: dashboardData.marketing.nps > 0 ? 'var(--color-success)' : 'var(--color-danger)'}}>{dashboardData.marketing.nps > 0 ? '+' : ''}{dashboardData.marketing.nps}</span>
                                          </div>
                                      )}
                                  </div>

                                  {/* --- RETOUR DES STATISTIQUES GLOBALES DE CAMPAGNE --- */}
                                  {avisStats && parseInt(avisStats.nb_envoyes) > 0 && (
                                      <div style={{display: 'flex', gap: '12px', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '16px', flexShrink: 0, border: '1px solid var(--border-color)'}}>
                                          <div style={{flex: 1, textAlign: 'center', borderRight: '1px solid var(--border-color)'}}>
                                              <span style={{display: 'block', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-main)'}}>{avisStats.nb_envoyes}</span>
                                              <span style={{fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase'}}>SMS Envoyés</span>
                                          </div>
                                          <div style={{flex: 1, textAlign: 'center', borderRight: '1px solid var(--border-color)'}}>
                                              <span style={{display: 'block', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-main)'}}>{avisStats.nb_repondus} <span style={{fontSize: '10px', fontWeight: 'normal', color: 'var(--text-secondary)'}}>({Math.round((avisStats.nb_repondus / avisStats.nb_envoyes) * 100)}%)</span></span>
                                              <span style={{fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase'}}>Réponses</span>
                                          </div>
                                          <div style={{flex: 1, textAlign: 'center'}}>
                                              <span style={{display: 'block', fontSize: '15px', fontWeight: 'bold', color: '#f59e0b'}}>{avisStats.note_moyenne || '-'} ★</span>
                                              <span style={{fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase'}}>Moyenne</span>
                                          </div>
                                      </div>
                                  )}
                                  
                                  <div style={{overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px'}}>
                                      {(dashboardData.marketing?.verbatims || []).length === 0 ? (
                                          <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun avis client reçu récemment.</p>
                                      ) : (
                                          dashboardData.marketing.verbatims.map(avis => {
                                              const isPositif = avis.note >= 4;
                                              return (
                                                  <div key={avis.id_demande} style={{background: isPositif ? 'var(--bg-card)' : 'var(--bg-danger)', border: `1px solid ${isPositif ? 'var(--color-success)' : 'var(--color-danger)'}`, borderLeftWidth: '4px', borderRadius: '8px', padding: '12px', position: 'relative'}}>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
                                                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                              <strong style={{color: isPositif ? 'var(--text-main)' : 'var(--color-danger)', fontSize: '14px'}}>{avis.prenom || 'Client'}</strong>
                                                              <span style={{color: '#f59e0b', fontSize: '13px'}}>{'★'.repeat(avis.note)}{'☆'.repeat(5 - avis.note)}</span>
                                                          </div>
                                                          {isPositif && <span style={{fontSize: '10px', background: 'var(--bg-success)', color: 'var(--color-success)', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold'}}>Fidélisé</span>}
                                                      </div>
                                                      {avis.commentaire && <p style={{margin: '0 0 8px 0', fontSize: '13px', fontStyle: 'italic', color: isPositif ? 'var(--text-secondary)' : 'var(--color-danger)'}}>"{avis.commentaire}"</p>}
                                                      
                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px'}}>
                                                          <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                                                              {new Date(avis.date_creation).toLocaleDateString('fr-FR')} {avis.nom_employe ? `• Par ${avis.nom_employe}` : ''}
                                                          </span>
                                                          {!isPositif && avis.telephone && (
                                                              <button onClick={() => { setSauvetageClient({ telephone: avis.telephone, prenom: avis.prenom }); setSmsSauvetage(`Bonjour ${avis.prenom || ''}, je suis le gérant du salon. Vraiment navré pour votre dernière expérience. Voici -20% sur votre prochaine visite pour nous faire pardonner. À très vite !`); }} style={{fontSize: '11px', background: 'var(--color-danger)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: '600', border: 'none', cursor: 'pointer'}}>Sauver</button>
                                                          )}
                                                      </div>
                                                  </div>
                                              )
                                          })
                                      )}
                                  </div>
                              </div>

                              <div className="carte" style={{flex: 1, minWidth: '300px'}}>
                                  <h3 style={{marginTop: 0, marginBottom: '16px', color: 'var(--text-main)'}}>Avis Google Business</h3>
                                  {dashboardData.marketing && dashboardData.marketing.total_avis > 0 ? (
                                      <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
                                          <div style={{textAlign: 'center'}}>
                                              <div style={{fontSize: '48px', fontWeight: '900', color: '#f59e0b'}}>{dashboardData.marketing.note_actuelle}</div>
                                              <div style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Sur {dashboardData.marketing.total_avis} avis</div>
                                          </div>
                                          <div style={{flex: 1}}>
                                              <span style={{fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block'}}>Tendance (6 mois)</span>
                                              {dessinerCourbe(dashboardData.marketing.tendance_6_mois)}
                                          </div>
                                      </div>
                                  ) : <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Connectez votre compte Google dans les paramètres pour afficher les avis.</p>}
                              </div>
                          </div>
                      </>
                  )}
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

              {/* VUE : PARAMÈTRES DU SALON */}
              {activeTab === 'parametres' && (
                <Parametres
                  configSalon={configSalon}
                  setConfigSalon={setConfigSalon}
                  onSave={sauvegarderParametres}
                  onBack={() => setActiveTab('accueil')}
                  onLogout={seDeconnecter}
                  salonId={decodeToken(token)?.id_salon}
                  role={role}
                  isDarkMode={isDarkMode}
                  onToggleTheme={() => setIsDarkMode(!isDarkMode)}
                  onEnablePush={activerNotificationsPush}
                  photoUrl={(employesListe || []).find(e => e.id_employe === decodeToken(token)?.id_employe)?.photo_url}
                  onUploadPhoto={modifierMaPhoto}
                  employesListe={employesListe}
                />
              )}
              
              {/* VUE : CAISSE & ENCAISSEMENT */}
              {(role === 'gerant' || role === 'salon') && activeTab === 'caisse' && (
                <div className="admin-container caisse-split-container">
                    {/* LEFT PANEL - CATALOGUE */}
                    <div className={`caisse-left-panel ${!posEmploye ? 'caisse-left-panel--waiting' : ''}`}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                            <div><h1 style={{margin: 0}}>Caisse</h1></div>
                            <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                                <ThemeToggle />
                                <button onClick={() => setShowAddClient(!showAddClient)} className="btn-action" style={{width: '40px', height: '40px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Nouveau Client">+</button>
                            </div>
                        </div>

                        {showAddClient && (
                            <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                                <h3 style={{marginTop: 0}}>Nouveau Client</h3>
                                <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                                  <input type="text" className="input-fournisseur" placeholder="Prénom" value={newClient.prenom} onChange={(e) => setNewClient({...newClient, prenom: e.target.value})} />
                                  <input type="text" className="input-fournisseur" placeholder="Nom" value={newClient.nom} onChange={(e) => setNewClient({...newClient, nom: e.target.value})} />
                                </div>
                                <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                                  <input type="tel" className="input-fournisseur" placeholder="Téléphone" value={newClient.telephone} onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} />
                                  <input type="date" className="input-fournisseur" placeholder="Date de naissance" value={newClient.date_naissance} onChange={(e) => setNewClient({...newClient, date_naissance: e.target.value})} />
                                </div>
                                <button className="btn-action" onClick={() => {ajouterClient(); setShowAddClient(false);}} disabled={!newClient.nom} style={{width: '100%'}}>Enregistrer le client</button>
                            </div>
                        )}

                        {!posEmploye ? (
                            <div className="carte">
                                <h3 style={{color: 'var(--text-main)', marginBottom: '16px', fontWeight: '600', fontSize: '16px'}}>1. Qui réalise la vente ?</h3>
                                {(employesListe || []).length === 0 ? (
                                    <div className="empty-state"><p>Aucun collaborateur enregistré.</p></div>
                                ) : (
                                    <div className="grid-collaborateurs">
                                        {(employesListe || []).map((emp, index) => (
                                            <div key={emp.id_employe} onClick={() => handleSelectEmployeCaisse(emp.id_employe)} className="hover-lift"
                                                style={{ backgroundColor: COULEURS_EMPLOYES[index % COULEURS_EMPLOYES.length], color: '#111827', padding: '24px 12px', borderRadius: 'var(--radius-card)', fontSize: '16px', fontWeight: '600', textAlign: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}>
                                                {(emp.nom || 'Inconnu').split(' ')[0]}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                                    <button onClick={() => { setPosType('PRESTATION'); setRechercheCaisse(''); }} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', border: 'none', background: posType === 'PRESTATION' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRESTATION' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Prestations</button>
                                    <button onClick={() => { setPosType('PRODUIT_REVENTE'); setRechercheCaisse(''); }} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', border: 'none', background: posType === 'PRODUIT_REVENTE' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRODUIT_REVENTE' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Produits</button>
                                </div>
                                <input type="text" className="input-fournisseur" placeholder="Rechercher un article ou un code-barres..." value={rechercheCaisse} onChange={e => setRechercheCaisse(e.target.value)} style={{marginBottom: '24px', fontSize: '15px'}} />
                                
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', overflowY: 'auto', paddingBottom: '20px', maxHeight: isMobile ? '40vh' : 'none'}}>
                                    {(catalogueListe || [])
                                        .filter(art => {
                                            if (art.type_article !== posType) return false;
                                            if (!rechercheCaisse) return true;
                                            const searchClean = nettoyerTexteRecherche(rechercheCaisse);
                                            const nomClean = nettoyerTexteRecherche(art.nom);
                                            return nomClean.includes(searchClean);
                                        })
                                        .map(art => (
                                        <div key={art.id_article} onClick={() => ajouterAuPanier(art)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100px', transition: 'transform 0.1s'}} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                                            <span style={{fontWeight: '600', fontSize: '13px', color: 'var(--text-main)'}}>{art.nom}</span>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <span style={{fontWeight: 'bold', color: 'var(--btn-primary)'}}>{parseFloat(art.prix || 0).toFixed(2)}€</span>
                                                {posType === 'PRODUIT_REVENTE' && <span style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Stock: {art.stock_actuel}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {(catalogueListe || []).filter(art => art.type_article === posType).length === 0 && (
                                    <div className="empty-state"><SvgEmptyState /><p>Aucun élément dans cette catégorie.</p></div>
                                )}
                            </>
                        )}
                    </div>

                    {/* RIGHT PANEL - PANIER & ENCAISSEMENT (FLOATING ACTION BAR SUR MOBILE) */}
                    <div className={`caisse-right-panel ${!posEmploye ? 'caisse-right-panel--waiting' : ''}`}>
                        {ticketGenere ? (
                            <div style={{padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center'}}>
                                <div style={{color: 'var(--color-success)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                                <h2 style={{marginTop: 0, marginBottom: '8px', color: 'var(--text-main)', fontSize: '24px'}}>Paiement Validé</h2>
                                {ticketGenere.is_offline && <span style={{fontSize: '12px', color: 'var(--color-danger)', fontWeight: 'bold'}}>Ticket sauvegardé hors-ligne</span>}
                                <h1 style={{color: 'var(--text-main)', fontSize: '40px', margin: '0 0 24px 0', letterSpacing: '-0.02em'}}>{ticketGenere.montant.toFixed(2)} <span style={{fontSize: '24px', color: 'var(--text-secondary)'}}>€</span></h1>
                                
                                <div style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: 'var(--radius-card)', marginBottom: '24px', textAlign: 'left'}}>
                                    <span style={{fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Reçu dématérialisé (Loi anti-gaspillage)</span>
                                    <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}><input type="email" className="input-fournisseur" placeholder="Email du client" value={emailTicketClient} onChange={e => setEmailTicketClient(e.target.value)} style={{flex: 1}}/><button className="btn-action" onClick={() => { if (isOffline || !navigator.onLine) return showToast("Envoi impossible sans réseau.", "error"); if (!emailTicketClient) return showToast("Saisissez d'abord l'email du client.", "error"); envoyerTicketEco('email'); }}>Envoyer</button></div>
                                    {ticketGenere.client_id ? (
                                        <button className="btn-action" onClick={() => envoyerTicketEco('sms')} disabled={isOffline || !navigator.onLine} style={{width: '100%'}}>Envoyer par SMS ({ticketGenere.client_nom})</button>
                                    ) : (
                                        <div style={{display: 'flex', gap: '8px'}}>
                                            <input type="tel" className="input-fournisseur" placeholder="Numéro du client" value={telephoneTicketClient} onChange={e => setTelephoneTicketClient(e.target.value)} style={{flex: 1}} />
                                            <button className="btn-action" onClick={() => { if (isOffline || !navigator.onLine) return showToast("Envoi impossible sans réseau.", "error"); if (!telephoneTicketClient) return showToast("Saisissez d'abord le numéro du client.", "error"); envoyerTicketEco('sms'); }}>Envoyer</button>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setTicketGenere(null)} className="hover-text-main" style={{background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: '500', cursor: 'pointer', padding: '10px', transition: 'color 0.15s'}}>Fermer (Sans reçu)</button>
                            </div>
                        ) : (
                            <>
                                <div style={{padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-app)'}}>
                                    <div className="ticket-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                        <h3 style={{margin: 0, color: 'var(--text-main)', fontSize: '16px'}}>Ticket en cours</h3>
                                        {posEmploye && <button onClick={() => { setPosEmploye(null); setClientsSuggeres([]); }} style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer', textDecoration:'underline'}}>Changer employé</button>}
                                    </div>
                                    <select className="input-fournisseur" value={clientCaisse || ''} onChange={e => { setClientCaisse(e.target.value); setRemiseAppliquee(false); }} style={{marginBottom: 0, background: 'var(--bg-card)'}}>
                                        <option value="">🤝 Client de passage...</option>
                                        {(clientsSuggeres || []).map(c => <option key={c.id_client} value={c.id_client.toString()}>⚡ RDV : {c.nom} {c.prenom} ({c.prestation_rdv})</option>)}
                                        {(clientsListe || []).map(c => <option key={c.id_client} value={c.id_client.toString()}>{c.nom} {c.prenom}</option>)}
                                    </select>
                                </div>

                                <div className="ticket-lignes" style={{padding: '16px'}}>
                                    {(panierCaisse || []).length === 0 ? (
                                        <div className="empty-state" style={{marginTop: '10px'}}><p>Le ticket est vide.</p></div>
                                    ) : (
                                        (panierCaisse || []).map(item => (
                                            <div key={item.id_article} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px'}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                    <span style={{background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: 'var(--text-main)'}}>{item.quantite}x</span>
                                                    <span style={{color: 'var(--text-main)'}}>{item.nom}</span>
                                                </div>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                                    <span style={{fontWeight: '600', color: 'var(--text-main)'}}>{((item.prix_unitaire || 0) * (item.quantite || 1)).toFixed(2)}€</span>
                                                    <button onClick={() => retirerDuPanier(item.id_article)} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0}}>✕</button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div style={{padding: '16px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)'}}>
                                    {isEligibleFidelite && (
                                        <div style={{background: 'var(--bg-info)', padding: '12px', borderRadius: 'var(--radius-input)', marginBottom: '16px', border: '1px solid #bfdbfe'}}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <div>
                                                    <span style={{fontSize: '13px', fontWeight: '600', color: 'var(--color-info)', display: 'block'}}>{configSalon.fidelite_type === 'POINTS' ? '💰 Fidélité atteinte !' : '🎟️ Carte complétée !'}</span>
                                                    <span style={{fontSize: '12px', color: 'var(--color-info)'}}>🎁 {texteRecompense}</span>
                                                </div>
                                                {!remiseAppliquee ? (
                                                    <button onClick={() => setRemiseAppliquee(true)} style={{background: 'var(--color-info)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>Appliquer</button>
                                                ) : (
                                                    <span style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--color-success)'}}>✅ Appliquée</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {remiseAppliquee && configSalon.fidelite_type !== 'NONE' && (
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px', color: 'var(--color-success)'}}>
                                            <span style={{fontWeight: 'bold'}}>🎁 Remise Fidélité</span>
                                            <span style={{fontWeight: 'bold'}}>-{Math.max(0, sousTotalCaisse - totalCaisse).toFixed(2)} €</span>
                                        </div>
                                    )}

                                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '18px', fontWeight: 'bold', color: 'var(--text-main)'}}>
                                        <span>Total TTC</span>
                                        <span>{totalCaisse.toFixed(2)} €</span>
                                    </div>

                                    <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                                        <button onClick={() => setMethodePaiement('CARTE')} disabled={isOffline || !navigator.onLine} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'CARTE' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'CARTE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CARTE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: (isOffline || !navigator.onLine) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', opacity: (isOffline || !navigator.onLine) ? 0.5 : 1, transition: 'all 0.15s'}}>TPE</button>
                                        <button onClick={() => setMethodePaiement('ESPECES')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'ESPECES' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'ESPECES' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'ESPECES' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s'}}>💶 Espèces</button>
                                        <button onClick={() => setMethodePaiement('CHEQUE')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'CHEQUE' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'CHEQUE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CHEQUE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s'}}>📝 Chèque</button>
                                    </div>

                                    {notificationCaisse && <div style={{padding: '12px', background: 'var(--bg-info)', color: 'var(--color-info)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold'}}>{notificationCaisse}</div>}
                                    
                                    <button onClick={validerEncaisser} className="btn-action" style={{width: '100%', padding: '16px', fontSize: '16px'}} disabled={!!notificationCaisse || (panierCaisse || []).length === 0 || !posEmploye}>
                                        {notificationCaisse && notificationCaisse.includes('⏳') ? "En attente du TPE..." : `Encaisser ${(isOffline || !navigator.onLine) ? '(Hors-Ligne) ' : ''}${totalCaisse.toFixed(2)} €`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
              )}

              {/* === MODAL SUGGESTION DE CLIENTS INTELLIGENTE === */}
              {clientsSuggeres.length > 0 && (
                  <div className="modal-overlay">
                      <div className="modal-content" style={{textAlign: 'center'}}>
                          <div style={{color: 'var(--btn-primary)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
                          <h2 style={{margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '20px'}}>{clientsSuggeres.length === 1 ? `Encaisser ${formatNomClient(clientsSuggeres[0])} ?` : "Quel client encaissez-vous ?"}</h2>
                          <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px'}}>
                              {clientsSuggeres.length === 1 
                                  ? "D'après l'agenda, c'est le client le plus probable à encaisser pour vous en ce moment." 
                                  : "D'après l'agenda, voici les clients que vous venez de coiffer, du plus ancien au plus récent."}
                          </p>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                              {(clientsSuggeres || []).map((client, i) => (
                                  <button key={client.id_client} onClick={() => { setClientCaisse(client.id_client.toString()); setClientsSuggeres([]); setPosStep('type'); }} className="btn-action" style={{padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: i === 0 ? 'var(--btn-primary)' : 'var(--bg-app)', color: i === 0 ? 'white' : 'var(--text-main)', border: i === 0 ? 'none' : '1px solid var(--border-color)'}}>
                                      <span style={{fontSize: '16px'}}>✅ {formatNomClient(client)}</span><span style={{fontSize: '12px', opacity: 0.8}}>{client.prestation_rdv}</span>
                                  </button>
                              ))}
                              <button onClick={() => { setClientCaisse(''); setClientsSuggeres([]); setPosStep('type'); }} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', marginTop: '8px'}}>❌ Aucun / Client de passage</button>
                          </div>
                      </div>
                  </div>
              )}

              {/* VUE : CENTRE D'ACTION (TÂCHES) */}
              {(role === 'gerant' || role === 'salon' || role === 'employe') && activeTab === 'actions' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div>
                              <h1 style={{margin: 0}}>Centre d'Action</h1>
                              <span className="date-subtitle" style={{margin: 0}}>Pilotez vos urgences administratives</span>
                          </div>
                          <ThemeToggle />
                      </div>
                  </div>

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  <div className="carte scan-carte">
                      {role === 'gerant' && (
                          <select className="input-fournisseur" style={{marginBottom: '12px'}} value={nouvelleTache.proprietaire || 'gerant'} onChange={e => setNouvelleTache({...nouvelleTache, proprietaire: e.target.value})}>
                              <option value="gerant">Assigner à : Moi (Gérant)</option>
                              <option value="salon">Assigner à : Tout le salon (Commun)</option>
                              {(employesListe || []).map(emp => (
                                  <option key={emp.id_employe} value={`emp_${emp.id_employe}`}>Assigner à : {emp.nom} {emp.est_gerant ? '(Mon profil employé)' : ''}</option>
                              ))}
                          </select>
                      )}
                      <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                          <input type="text" className="input-fournisseur" placeholder="Titre (ex: Payer l'URSSAF)" style={{flex: 2}} value={nouvelleTache.titre} onChange={e => setNouvelleTache({...nouvelleTache, titre: e.target.value})} />
                          <input type="date" className="input-fournisseur" style={{flex: 1}} value={nouvelleTache.date_echeance} onChange={e => setNouvelleTache({...nouvelleTache, date_echeance: e.target.value})} />
                      </div>
                      <input type="text" className="input-fournisseur" placeholder="Détails (Optionnel)" style={{marginBottom: '16px'}} value={nouvelleTache.description} onChange={e => setNouvelleTache({...nouvelleTache, description: e.target.value})} />
                      <button className="btn-action" style={{width: '100%'}} disabled={!nouvelleTache.titre} onClick={async () => {
                          const proprietaireActuel = role === 'gerant' ? (nouvelleTache.proprietaire || 'gerant') : (role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : role);
                          try { await fetch('https://api-salon-backend.onrender.com/api/taches', { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...nouvelleTache, proprietaire: proprietaireActuel}) }); showToast("Action ajoutée", "success"); setNouvelleTache({titre:'', description:'', date_echeance:'', proprietaire: 'gerant'}); chargerTout(); } catch(e) { showToast("Erreur", "error"); }
                      }}>Ajouter une tâche</button>
                  </div>

                  {(() => {
                      const proprietaireActuel = role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : role;
                      
                      const mesTaches = (tachesListe || []).filter(t => {
                          const prop = t.proprietaire || 'gerant';
                          if (role === 'gerant') return true; // Le gérant voit TOUTES les tâches
                          if (role === 'employe') return prop === proprietaireActuel || prop === 'salon';
                          return prop === proprietaireActuel || prop === 'salon';
                      });
                      
                      const tachesAFaire = mesTaches.filter(t => t.statut === 'A_FAIRE');
                      const tachesFaites = mesTaches.filter(t => t.statut === 'FAIT');

                      return (
                          <>
                              <div className="section-label">À traiter ({tachesAFaire.length})</div>
                              {tachesAFaire.length === 0 ? (
                                  <div className="empty-state"><p>Toutes vos actions sont à jour ! 🎉</p></div>
                              ) : (
                                  <div className="list-group">
                                      {tachesAFaire.map(tache => (
                                          <div key={tache.id_tache} className="list-row" style={{alignItems: 'flex-start'}}>
                                              <button onClick={async () => { await fetch(`https://api-salon-backend.onrender.com/api/taches/${tache.id_tache}/statut`, { method: 'PUT', headers: getAuthHeaders() }); chargerTout(); }} title="Marquer comme terminée" style={{background: 'none', border: `2px solid ${getCouleurTache(tache)}`, width: '20px', height: '20px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, marginTop: '2px', padding: 0}}></button>
                                              <div className="list-row-content">
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                                                      <span className="list-row-label">{tache.titre}</span>
                                                      {tache.source === 'IA' && <span style={{fontSize: '10px', background: 'var(--btn-primary)', color: 'var(--btn-text)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600'}}>DÉTECTÉ</span>}
                                                      {tache.source === 'AVIS_CLIENT' && <button onClick={() => { setSauvetageClient(tache.donnees); setSmsSauvetage(`Bonjour ${tache.donnees?.prenom || ''}, je suis le gérant du salon. Vraiment navré pour votre expérience. Voici -20% sur votre prochaine coupe pour nous faire pardonner. À très vite !`); }} style={{fontSize: '10px', background: 'var(--color-danger)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: '600', border: 'none', cursor: 'pointer', marginLeft: '8px'}}>Sauver ce client</button>}
                                                      
                                                      {/* BADGE POUR LE GÉRANT : Indique à qui appartient la tâche */}
                                                      {role === 'gerant' && tache.proprietaire && tache.proprietaire !== 'gerant' && (
                                                          <span style={{fontSize: '10px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', border: '1px solid #bfdbfe'}}>
                                                              {tache.proprietaire === 'salon' ? 'SALON ENTIER' : ((employesListe || []).find(e => `emp_${e.id_employe}` === tache.proprietaire)?.nom || 'EMPLOYÉ')}
                                                          </span>
                                                      )}
                                                  </div>
                                                  {tache.description && <p style={{margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)'}}>{tache.description}</p>}
                                                  {tache.date_echeance && <span style={{display: 'block', marginTop: '4px', fontSize: '11px', fontWeight: '600', color: getCouleurTache(tache)}}>Échéance : {new Date(tache.date_echeance).toLocaleDateString()}</span>}
                                              </div>
                                              <button onClick={async () => { await fetch(`https://api-salon-backend.onrender.com/api/taches/${tache.id_tache}`, { method: 'DELETE', headers: getAuthHeaders() }); chargerTout(); }} title="Supprimer" style={{background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, padding: '2px'}}>
                                                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              )}

                              {tachesFaites.length > 0 && (
                                  <>
                                      <div className="carte scan-carte" style={{marginTop: '16px'}}>
                                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', paddingBottom: isTachesTermineesExpanded ? '12px' : '0'}} onClick={() => setIsTachesTermineesExpanded(!isTachesTermineesExpanded)}>
                                              <h3 style={{margin: 0, color: 'var(--text-main)', fontSize: '15px'}}>Terminées ({tachesFaites.length})</h3>
                                              <span style={{fontSize: '20px', color: 'var(--text-secondary)'}}>{isTachesTermineesExpanded ? '▲' : '▼'}</span>
                                          </div>
                                          {isTachesTermineesExpanded && (
                                              <div className="list-group" style={{opacity: 0.65}}>
                                                  {tachesFaites.map(tache => (
                                                      <div key={tache.id_tache} className="list-row" style={{minHeight: '36px', padding: '8px 16px'}}>
                                                          <span className="list-row-label" style={{textDecoration: 'line-through', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '13px'}}>
                                                              {tache.titre}
                                                              {role === 'gerant' && tache.proprietaire && tache.proprietaire !== 'gerant' && (
                                                                  <span style={{fontSize: '9px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '2px 4px', borderRadius: '4px', fontWeight: '600', border: '1px solid #bfdbfe', marginLeft: '8px'}}>
                                                                      {tache.proprietaire === 'salon' ? 'SALON' : ((employesListe || []).find(e => `emp_${e.id_employe}` === tache.proprietaire)?.nom || 'EMP')}
                                                                  </span>
                                                              )}
                                                          </span>
                                                          <button onClick={async () => { await fetch(`https://api-salon-backend.onrender.com/api/taches/${tache.id_tache}/statut`, { method: 'PUT', headers: getAuthHeaders() }); chargerTout(); }} style={{background: 'none', border: 'none', color: 'var(--btn-primary)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', flexShrink: 0}}>Annuler</button>
                                                          <button onClick={async () => { await fetch(`https://api-salon-backend.onrender.com/api/taches/${tache.id_tache}`, { method: 'DELETE', headers: getAuthHeaders() }); chargerTout(); }} title="Supprimer" style={{background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, padding: '2px', marginLeft: '4px'}}>
                                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                          </button>
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  </>
                              )}
                          </>
                      );
                  })()}
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

             {/* VUE : AGENDA */}
             {activeTab === 'agenda' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div className="agenda-header">
                      <div className="agenda-title-group" style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                          <h1 style={{margin: 0}}>Agenda</h1>
                          <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                              <button onClick={() => changerPeriode(-1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>◀</button>
                              <span style={{fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', padding: '0 10px'}}>{joursSemaine[0].toLocaleDateString('fr-FR', {month: 'short'})} {joursSemaine[0].getFullYear()}</span>
                              <button onClick={() => changerPeriode(1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>▶</button>
                              <button onClick={resetToToday} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px'}}>Aujourd'hui</button>
                          </div>
                      </div>
                      <div className="agenda-actions-group" style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                          <ThemeToggle />
                          {role !== 'salon' && (
                              <button onClick={() => setShowModalAbsence(true)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px 16px', borderRadius: 'var(--radius-input)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px'}}>
                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
                                  Absence
                              </button>
                          )}
                          <button onClick={() => setShowModalRdv(true)} className="btn-action">+ Nouveau RDV</button>
                      </div>
                  </div>

                 {/* SÉLECTEUR MULTI-COLLABORATEURS */}
                  <div className="agenda-filtres-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: '8px', marginBottom: '16px', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: '8px', width: '100%' }}>
                      {role === 'gerant' && (
                          <button 
                              onClick={() => setFiltresEmployes([])} 
                              style={{ background: filtresEmployes.length === 0 ? 'var(--text-main)' : 'var(--bg-card)', color: filtresEmployes.length === 0 ? 'var(--bg-card)' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s ease', flexShrink: 0 }}>
                              Toute l'équipe
                          </button>
                      )}
                      {role === 'gerant' && decodeToken(token)?.id_employe && (
                          <button 
                              onClick={() => setFiltresEmployes([decodeToken(token)?.id_employe])} 
                              style={{ background: filtresEmployes.length === 1 && filtresEmployes[0] === decodeToken(token)?.id_employe ? 'var(--text-main)' : 'var(--bg-card)', color: filtresEmployes.length === 1 && filtresEmployes[0] === decodeToken(token)?.id_employe ? 'var(--bg-card)' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s ease', flexShrink: 0 }}>
                              Ma Vue
                          </button>
                      )}
                      {role === 'gerant' && <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 4px', flexShrink: 0 }}></div>}
                      {(employesListe || [])
                          .filter(emp => role === 'gerant' || emp.id_employe === decodeToken(token)?.id_employe)
                          .map((emp) => {
                              const originalIndex = (employesListe || []).findIndex(e => e.id_employe === emp.id_employe);
                              const isActive = role === 'employe' ? true : filtresEmployes.includes(emp.id_employe);
                              const color = COULEURS_EMPLOYES[originalIndex % COULEURS_EMPLOYES.length];
                              return (
                                  <button 
                                      key={emp.id_employe}
                                      onClick={() => {
                                          if (role === 'employe') return; 
                                          if (isActive) { setFiltresEmployes(filtresEmployes.filter(id => id !== emp.id_employe)); } 
                                          else { setFiltresEmployes([...filtresEmployes, emp.id_employe]); }
                                      }}
                                      style={{ background: isActive ? color : 'var(--bg-card)', color: isActive ? '#111827' : 'var(--text-secondary)', border: `1px solid ${isActive ? color : 'var(--border-color)'}`, borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: role === 'gerant' ? 'pointer' : 'default', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease', flexShrink: 0 }}>
                                      {!isActive && <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color}}></span>}
                                      {role === 'employe' ? `Mon Planning (${(emp.nom || '').split(' ')[0]})` : (emp.nom || '').split(' ')[0]}
                                  </button>
                              );
                          })}
                  </div>

                  <div className="week-calendar" style={isMobile ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'flex', flexDirection: 'column' }}>
                      <div className="week-header-row" style={{ display: 'flex' }}>
                          <div className="time-spacer" style={isMobile ? { width: '48px', flexShrink: 0 } : { width: '64px', flexShrink: 0 }}></div>
                          {joursSemaine.map((jour, index) => (
                              <div key={index} className={`day-header ${isToday(jour) ? 'today' : ''}`} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
                                  <span className="day-name">{jour.toLocaleDateString('fr-FR', {weekday: 'short'})}</span>
                                  <span className="day-number">{jour.getDate()}</span>
                              </div>
                          ))}
                      </div>
                      <div className="week-body" style={isMobile ? { overflowY: 'auto', background: 'var(--bg-card)', overflowX: 'hidden', flex: 1, paddingTop: '10px', paddingBottom: '120px' } : { overflowY: 'auto', background: 'var(--bg-card)', overflowX: 'hidden', paddingTop: '10px' }}>
                          <div style={{ display: 'flex', position: 'relative', height: `${nbHeures * 80}px`, minHeight: '100%' }}>
                              <div className="time-column" style={isMobile ? { width: '48px', flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-app)' } : { width: '64px', flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-app)' }}>
                                  {Array.from({ length: nbHeures }).map((_, i) => (
                                      <div key={i} className="time-label" style={{ height: '80px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', paddingRight: '10px', transform: 'translateY(-7px)', fontWeight: '500' }}>{heureDebutAgenda + i} h</div>
                                  ))}
                              </div>
                              <div className="days-container" style={{ display: 'flex', flex: 1 }}>
                                  {joursSemaine.map((jour, indexJour) => {
                                      const dateStringJour = formatDateInput(jour);
                                      const listeRdvs = Array.isArray(planningData) ? planningData : (planningData.rendez_vous || []);
                                      const listeAbsences = Array.isArray(planningData) ? [] : (planningData.absences || []);

                                      const rdvsDuJourBruts = listeRdvs.filter(rdv => {
                                          if(!rdv || !rdv.date_heure_debut) return false;
                                          const rdvDateStr = (rdv.date_heure_debut || '').replace('Z', '').split('T')[0];
                                          return rdvDateStr === dateStringJour && (filtresEmployes.length === 0 || filtresEmployes.includes(rdv.id_employe));
                                      });
                                      const sortedRdvs = rdvsDuJourBruts.map(rdv => {
                                          const start = new Date((rdv.date_heure_debut || '').replace('Z', ''));
                                          const end = new Date(start.getTime() + ((rdv.duree_minutes || 30) * 60000));
                                          return { ...rdv, start, end };
                                      }).sort((a, b) => a.start - b.start);
                                      const clusters = []; let currentCluster = []; let clusterEnd = null;
                                      sortedRdvs.forEach(rdv => {
                                          if (currentCluster.length === 0) { currentCluster.push(rdv); clusterEnd = rdv.end; } 
                                          else {
                                              if (rdv.start < clusterEnd) { currentCluster.push(rdv); if (rdv.end > clusterEnd) clusterEnd = rdv.end; } 
                                              else { clusters.push([...currentCluster]); currentCluster = [rdv]; clusterEnd = rdv.end; }
                                          }
                                      });
                                      if (currentCluster.length > 0) clusters.push(currentCluster);

                                      const absencesDuJour = listeAbsences.filter(abs => {
                                          if(!abs || !abs.date_debut || !abs.date_fin) return false;
                                          const dateD = abs.date_debut.split('T')[0];
                                          const dateF = abs.date_fin.split('T')[0];
                                          return dateStringJour >= dateD && dateStringJour <= dateF && (filtresEmployes.length === 0 || filtresEmployes.includes(abs.id_employe));
                                      });

                                      return (
                                          <div key={indexJour} className="day-column" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
                                              {/* ESPACE GÉRANT / SALON : L'Accordéon discret collé en haut */}
                                              {role !== 'employe' && absencesDuJour.length > 0 && (
                                                  <div style={{ position: 'sticky', top: '4px', left: '4px', right: '4px', zIndex: 20, margin: '4px' }}>
                                                      <div onClick={() => setExpandedAbsenceDate(expandedAbsenceDate === dateStringJour ? null : dateStringJour)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: expandedAbsenceDate === dateStringJour ? '6px 6px 0 0' : '6px', padding: '6px 8px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s' }}>
                                                          <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}><span style={{color: 'var(--color-danger)'}}>⚠️</span> {absencesDuJour.length} Absence{absencesDuJour.length > 1 ? 's' : ''}</span>
                                                          <span style={{color: 'var(--text-secondary)'}}>{expandedAbsenceDate === dateStringJour ? '▲' : '▼'}</span>
                                                      </div>
                                                      {expandedAbsenceDate === dateStringJour && (
                                                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: 'var(--shadow-sm)', maxHeight: '200px', overflowY: 'auto' }}>
                                                              {absencesDuJour.map(abs => {
                                                                  const isMaladie = abs.type_demande === 'ARRET_MALADIE';
                                                                  const isAttente = abs.statut === 'EN_ATTENTE';
                                                                  const bgStyle = isMaladie ? 'var(--bg-danger)' : (isAttente ? 'var(--bg-hover)' : 'var(--bg-info)');
                                                                  const colorStyle = isMaladie ? 'var(--color-danger)' : (isAttente ? 'var(--text-secondary)' : 'var(--color-info)');
                                                                  return (
                                                                      <div key={`abs-mini-${abs.id_absence}`} style={{ fontSize: '11px', padding: '6px', background: bgStyle, color: colorStyle, borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                                                                          <strong style={{color: 'var(--text-main)'}}>{abs.nom_employe}</strong>
                                                                          <span>{isMaladie ? 'Arrêt Maladie' : (isAttente ? 'Congé (Attente)' : 'Congé Validé')}</span>
                                                                      </div>
                                                                  );
                                                              })}
                                                          </div>
                                                      )}
                                                  </div>
                                              )}

                                              {/* ESPACE EMPLOYÉ : Le bloc d'origine en overlay */}
                                              {role === 'employe' && absencesDuJour.map(abs => {
                                                  const ECHELLE_HEURE = 80;
                                                  let startH = heureDebutAgenda;
                                                  let endH = heureFinAgenda;
                                                  const dDebut = abs.date_debut.split('T')[0];
                                                  const dFin = abs.date_fin.split('T')[0];
                                                  
                                                  if (dateStringJour === dDebut && abs.moment_debut === 'APRES_MIDI') startH = 13;
                                                  if (dateStringJour === dFin && abs.moment_fin === 'MATIN') endH = 13;
                                                  
                                                  startH = Math.max(heureDebutAgenda, startH);
                                                  endH = Math.min(heureFinAgenda, endH);
                                                  if (startH >= endH) return null;
                                                  
                                                  const topAbs = (startH - heureDebutAgenda) * ECHELLE_HEURE;
                                                  const hauteurAbs = (endH - startH) * ECHELLE_HEURE;
                                                  
                                                  const isMaladie = abs.type_demande === 'ARRET_MALADIE';
                                                  const isAttente = abs.statut === 'EN_ATTENTE';
                                                  
                                                  const bgStyle = isMaladie 
                                                      ? 'repeating-linear-gradient(45deg, #fee2e2, #fee2e2 10px, #fecaca 10px, #fecaca 20px)'
                                                      : (isAttente 
                                                          ? 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 10px, #e5e7eb 10px, #e5e7eb 20px)'
                                                          : 'repeating-linear-gradient(45deg, #e0f2fe, #e0f2fe 10px, #bae6fd 10px, #bae6fd 20px)');
                                                  const borderColor = isMaladie ? '#ef4444' : (isAttente ? '#9ca3af' : '#38bdf8');
                                                  const textColor = isMaladie ? '#991b1b' : (isAttente ? '#4b5563' : '#075985');
                                                  
                                                  return (
                                                      <div key={`abs-${abs.id_absence}`} style={{ position: 'absolute', left: '2px', width: 'calc(100% - 4px)', boxSizing: 'border-box', top: `${topAbs}px`, height: `${hauteurAbs}px`, background: bgStyle, border: `1px solid ${borderColor}`, borderRadius: '6px', padding: '6px', opacity: 0.85, zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: textColor, textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>{isMaladie ? 'Arrêt Maladie' : (isAttente ? 'Congé (Attente)' : 'Congé Validé')}</span>
                                                          <span style={{ fontSize: '11px', color: textColor, fontWeight: '600', textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>{abs.nom_employe}</span>
                                                      </div>
                                                  );
                                              })}
                                              {clusters.flatMap((cluster) => {
                                            
                                                  const clusterSize = cluster.length;
                                                  return cluster.map((rdv, indexInCluster) => {
                                                      const ECHELLE_HEURE = 80; const dureeReelle = rdv.duree_minutes || 30;
                                                      const topPosition = ((rdv.start.getHours() - heureDebutAgenda) * ECHELLE_HEURE) + (rdv.start.getMinutes() * (ECHELLE_HEURE / 60));
                                                      const hauteurCard = Math.max((dureeReelle * (ECHELLE_HEURE / 60)), 26);
                                                      const empIndex = (employesListe || []).findIndex(e => e.id_employe === rdv.id_employe);
                                                      const backgroundColor = empIndex >= 0 ? COULEURS_EMPLOYES[empIndex % COULEURS_EMPLOYES.length] : '#ccc';
                                                      const widthPercent = clusterSize === 1 ? 100 : (100 - (clusterSize - 1) * 10);
                                                      const leftOffset = clusterSize === 1 ? 0 : (indexInCluster * 10);
                                                      const zIndex = 5 + indexInCluster;
                                                      return (
                                                          <div key={rdv.id_rdv} onClick={() => ouvrirRdvSelectionne(rdv)} className="rdv-card-accordeon"
                                                               style={{ position: 'absolute', left: `calc(2px + ${leftOffset}%)`, width: `calc(${widthPercent}% - 4px)`, boxSizing: 'border-box', top: `${topPosition}px`, height: `${hauteurCard}px`, backgroundColor: backgroundColor, color: '#111827', borderRadius: '6px', padding: '4px 6px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', cursor: 'pointer', zIndex: zIndex }}>
                                                              <div style={{fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rdv.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {rdv.nom_client}</div>
                                                              <div style={{fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rdv.prestation}</div>
                                                          </div>
                                                      );
                                                  });
                                              })}
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* MODAL RDV */}
                  {showModalRdv && (
                      <div className="modal-overlay" style={{ zIndex: 9999 }}>
                          <div className="modal-content">
                              <div className="modal-header">
                                  <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Nouveau Rendez-vous</h3>
                                  <button className="modal-close-btn" onClick={() => setShowModalRdv(false)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              <div style={{ position: 'relative', marginBottom: '12px' }}>
                                  <input 
                                      type="text" className="input-fournisseur" placeholder="Nom du Client ou N° de Téléphone" value={formRdv.nom_client} 
                                      onChange={e => { setFormRdv({...formRdv, nom_client: e.target.value}); setShowDropdownClient(true); }} 
                                      onFocus={() => setShowDropdownClient(true)} onBlur={() => setTimeout(() => setShowDropdownClient(false), 200)} 
                                      style={{ width: '100%', boxSizing: 'border-box', marginBottom: 0 }}
                                  />
                                  {showDropdownClient && (
                                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '160px', overflowY: 'auto' }}>
                                          {getClientsSuggeresPourRdv(formRdv.nom_client).map((cli, idx) => (
                                              <div key={cli.id_client} onClick={() => { setFormRdv({ ...formRdv, nom_client: formatNomClient(cli), telephone_client: cli.telephone || formRdv.telephone_client }); setShowDropdownClient(false); }} className="hover-bg-app" style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx !== 4 ? '1px solid var(--bg-app)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}>
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}><span style={{fontSize: '14px'}}>👤</span><span style={{color: 'var(--text-main)', fontSize: '13px', fontWeight: '600'}}>{formatNomClient(cli)}</span></div>
                                                  {cli.telephone && <span style={{color: 'var(--text-secondary)', fontSize: '11px', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px'}}>{cli.telephone}</span>}
                                              </div>
                                          ))}
                                          {formRdv.nom_client && !getClientsSuggeresPourRdv(formRdv.nom_client).find(c => formatNomClient(c).toLowerCase() === formRdv.nom_client.toLowerCase()) && (
                                              <div onClick={() => setShowDropdownClient(false)} style={{ padding: '10px 12px', cursor: 'pointer', background: 'var(--bg-info)', color: 'var(--color-info)', fontSize: '13px', fontStyle: 'italic', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span style={{fontSize: '14px'}}>➕</span> Nouveau client : "{formRdv.nom_client}"
                                              </div>
                                          )}
                                      </div>
                                  )}
                              </div>
                              <input type="text" className="input-fournisseur" placeholder="Téléphone" value={formRdv.telephone_client} onChange={e => setFormRdv({...formRdv, telephone_client: e.target.value})} style={{marginBottom:'12px'}}/>
                              <select className="input-fournisseur" value={formRdv.id_employe} onChange={e => setFormRdv({...formRdv, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
                                  <option value="">-- Choisir un collaborateur --</option>
                                  {(employesListe || [])
                                      .filter(emp => role !== 'employe' || emp.id_employe === decodeToken(token)?.id_employe)
                                      .map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                              </select>
                              <div style={{ position: 'relative', marginBottom: '12px' }}>
                                  <input type="text" className="input-fournisseur" placeholder="Prestation (ex: Coupe Homme)" value={formRdv.prestation} onChange={e => { setFormRdv({...formRdv, prestation: e.target.value}); setShowDropdownPresta(true); }} onFocus={() => setShowDropdownPresta(true)} onBlur={() => setTimeout(() => setShowDropdownPresta(false), 200)} style={{ width: '100%', boxSizing: 'border-box', marginBottom: 0 }} />
                                  {showDropdownPresta && (
                                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '160px', overflowY: 'auto' }}>
                                          {getPrestationsSuggerees(formRdv.prestation).map((presta, idx) => {
                                              const isTop = dashboardData?.top_3_prestations?.find(p => (p.nom || '').toLowerCase() === (presta.nom || '').toLowerCase());
                                              return (
                                                  <div key={presta.id_article} onClick={() => { setFormRdv({...formRdv, prestation: presta.nom, duree_minutes: presta.duree_estimee_minutes || 30}); setShowDropdownPresta(false); }} className="hover-bg-app" style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx !== 4 ? '1px solid var(--bg-app)' : 'none', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}>
                                                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                          {isTop && <span style={{fontSize: '10px', background: 'var(--bg-success)', color: 'var(--color-success)', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold'}}>Top</span>}
                                                          <span style={{color: 'var(--text-main)', fontWeight: '500'}}>{presta.nom}</span>
                                                      </div>
                                                      <span style={{color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600'}}>{presta.prix} €</span>
                                                  </div>
                                              )
                                          })}
                                          {formRdv.prestation && !getPrestationsSuggerees(formRdv.prestation).find(p => (p.nom || '').toLowerCase() === (formRdv.prestation || '').toLowerCase()) && (
                                              <div onClick={() => setShowDropdownPresta(false)} style={{ padding: '10px 12px', cursor: 'pointer', background: 'var(--bg-info)', color: 'var(--color-info)', fontSize: '13px', fontStyle: 'italic', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                  Utiliser "{formRdv.prestation}" (Texte libre)
                                              </div>
                                          )}
                                      </div>
                                  )}
                              </div>
                              <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                                  <input type="date" className="input-fournisseur" value={formRdv.date} onChange={e => setFormRdv({...formRdv, date: e.target.value})} />
                                  <input type="time" className="input-fournisseur" value={formRdv.heure} onChange={e => setFormRdv({...formRdv, heure: e.target.value})} />
                                  <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{width:'110px'}} value={formRdv.duree_minutes} onChange={e => setFormRdv({...formRdv, duree_minutes: parseInt(e.target.value) || 30})} title="Durée de la prestation (minutes)" />
                              </div>
                              <button onClick={() => creerRdvManuel(false)} className="btn-action" style={{width:'100%'}}>Créer le rendez-vous</button>
                          </div>
                      </div>
                  )}

                  {showModalAbsence && (
                      <div className="modal-overlay" style={{ zIndex: 9999 }}>
                          <div className="modal-content" style={{ maxWidth: '450px' }}>
                              <div className="modal-header">
                                  <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Déclarer une absence</h3>
                                  <button className="modal-close-btn" onClick={() => setShowModalAbsence(false)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>

                              <div style={{ display: 'flex', marginBottom: '20px', background: 'var(--bg-app)', padding: '4px', borderRadius: '8px' }}>
                                  <button onClick={() => setOngletAbsence('CONGES')} style={{ flex: 1, padding: '8px', border: 'none', background: ongletAbsence === 'CONGES' ? 'var(--bg-card)' : 'transparent', color: ongletAbsence === 'CONGES' ? 'var(--text-main)' : 'var(--text-secondary)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: ongletAbsence === 'CONGES' ? 'var(--shadow-sm)' : 'none' }}>Congés</button>
                                  <button onClick={() => setOngletAbsence('ARRET_MALADIE')} style={{ flex: 1, padding: '8px', border: 'none', background: ongletAbsence === 'ARRET_MALADIE' ? 'var(--bg-card)' : 'transparent', color: ongletAbsence === 'ARRET_MALADIE' ? 'var(--color-danger)' : 'var(--text-secondary)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: ongletAbsence === 'ARRET_MALADIE' ? 'var(--shadow-sm)' : 'none' }}>Arrêt Maladie</button>
                              </div>

                              {role === 'gerant' && (
                                  <select className="input-fournisseur" value={formAbsence.id_employe || ''} onChange={e => setFormAbsence({...formAbsence, id_employe: e.target.value})} style={{marginBottom: '16px'}}>
                                      <option value="">-- Concerne quel collaborateur ? --</option>
                                      {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                                  </select>
                              )}

                              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                  <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Nature</label>
                                      <select className="input-fournisseur" value={formAbsence.nature_absence} onChange={e => setFormAbsence({...formAbsence, nature_absence: e.target.value})}>
                                          {ongletAbsence === 'CONGES' ? (
                                              <>
                                                  <option value="CP">Congés Payés (CP)</option>
                                                  <option value="SANS_SOLDE">Congé Sans Solde</option>
                                                  <option value="RTT">Récupération / RTT</option>
                                                  <option value="EVENEMENT">Événement Familial</option>
                                              </>
                                          ) : (
                                              <>
                                                  <option value="MALADIE_ORDINAIRE">Maladie Ordinaire</option>
                                                  <option value="ACCIDENT_TRAVAIL">Accident du Travail</option>
                                                  <option value="MATERNITE">Congé Maternité/Paternité</option>
                                              </>
                                          )}
                                      </select>
                                  </div>
                                  {ongletAbsence === 'ARRET_MALADIE' && (
                                      <div style={{ flex: 1 }}>
                                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Type</label>
                                          <select className="input-fournisseur" value={formAbsence.type_prolongation} onChange={e => setFormAbsence({...formAbsence, type_prolongation: e.target.value})}>
                                              <option value="INITIAL">Arrêt Initial</option>
                                              <option value="PROLONGATION">Prolongation</option>
                                          </select>
                                      </div>
                                  )}
                              </div>

                              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                  <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Date de début</label>
                                      <input type="date" className="input-fournisseur" value={formAbsence.date_debut} onChange={e => setFormAbsence({...formAbsence, date_debut: e.target.value})} style={{ marginBottom: '4px' }} />
                                      <select className="input-fournisseur" value={formAbsence.moment_debut} onChange={e => setFormAbsence({...formAbsence, moment_debut: e.target.value})}>
                                          <option value="MATIN">Matin</option>
                                          <option value="APRES_MIDI">Après-midi</option>
                                      </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Date de fin (Inclus)</label>
                                      <input type="date" className="input-fournisseur" value={formAbsence.date_fin} onChange={e => setFormAbsence({...formAbsence, date_fin: e.target.value})} style={{ marginBottom: '4px' }} />
                                      <select className="input-fournisseur" value={formAbsence.moment_fin} onChange={e => setFormAbsence({...formAbsence, moment_fin: e.target.value})}>
                                          <option value="MATIN">Matin</option>
                                          <option value="APRES_MIDI">Après-midi</option>
                                      </select>
                                  </div>
                              </div>

                              {(ongletAbsence === 'ARRET_MALADIE' || formAbsence.nature_absence === 'EVENEMENT') && (
                                  <div style={{ marginBottom: '16px', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Justificatif (Volet 3 ou Document légal)</label>
                                      <input type="file" accept="image/*,application/pdf" onChange={handleUploadJustificatifAbsence} style={{ fontSize: '12px', color: 'var(--text-main)', width: '100%' }} />
                                      {formAbsence.nom_fichier && <span style={{ fontSize: '11px', color: 'var(--color-success)', display: 'block', marginTop: '4px' }}>✅ Fichier prêt ({formAbsence.nom_fichier})</span>}
                                  </div>
                              )}

                              {ongletAbsence === 'ARRET_MALADIE' && (
                                  <input type="text" className="input-fournisseur" placeholder="Heures de sorties autorisées (Optionnel)" value={formAbsence.heures_sortie} onChange={e => setFormAbsence({...formAbsence, heures_sortie: e.target.value})} style={{ marginBottom: '16px' }} />
                              )}

                              <textarea className="input-fournisseur" placeholder="Un commentaire (Optionnel) ?" rows="2" value={formAbsence.commentaire} onChange={e => setFormAbsence({...formAbsence, commentaire: e.target.value})} style={{ marginBottom: '24px' }} />

                              <button onClick={soumettreAbsence} disabled={isSubmittingAbsence} className="btn-action" style={{ width: '100%', background: ongletAbsence === 'ARRET_MALADIE' ? 'var(--color-danger)' : 'var(--btn-primary)' }}>
                                  {isSubmittingAbsence ? "Envoi en cours..." : (ongletAbsence === 'ARRET_MALADIE' ? "Déclarer l'Arrêt Maladie" : "Envoyer la demande")}
                              </button>
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
                                          
                                          {/* BOUTON VOIR LE PROTOCOLE */}
                                          {(() => {
                                              const protoAssocie = (protocolesListe || []).find(p => (p.nom_prestation || '').toLowerCase() === (rdvSelectionne.prestation || '').toLowerCase());
                                              if (protoAssocie) {
                                                  return (
                                                      <button onClick={() => { setRdvSelectionne(null); setProtocoleVisible(protoAssocie); }} style={{background: 'var(--btn-primary)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                                          Voir le Protocole (Recette)
                                                      </button>
                                                  );
                                              }
                                              return null;
                                          })()}

                                          {role === 'gerant' && <button onClick={() => setIsEditingRdv(true)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s'}}>Modifier l'horaire</button>}
                                          {role === 'gerant' && <button onClick={demanderSuppressionRdv} style={{background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Supprimer le rendez-vous</button>}
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      <select className="input-fournisseur" value={editRdvForm.id_employe} onChange={e => setEditRdvForm({...editRdvForm, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
                                          <option value="">-- Choisir un collaborateur --</option>
                                          {(employesListe || [])
                                              .filter(emp => role !== 'employe' || emp.id_employe === decodeToken(token)?.id_employe)
                                              .map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                                      </select>
                                      <input type="text" className="input-fournisseur" placeholder="Prestation" value={editRdvForm.prestation} onChange={e => setEditRdvForm({...editRdvForm, prestation: e.target.value})} style={{marginBottom:'12px'}}/>
                                      <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                                          <input type="date" className="input-fournisseur" value={editRdvForm.date} onChange={e => setEditRdvForm({...editRdvForm, date: e.target.value})} />
                                          <input type="time" className="input-fournisseur" value={editRdvForm.heure} onChange={e => setEditRdvForm({...editRdvForm, heure: e.target.value})} />
                                          <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{width:'110px'}} value={editRdvForm.duree_minutes} onChange={e => setEditRdvForm({...editRdvForm, duree_minutes: parseInt(e.target.value) || 30})} />
                                      </div>
                                      <div style={{display: 'flex', gap: '12px'}}>
                                        <button onClick={() => setIsEditingRdv(false)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer'}}>Annuler</button>
                                        <button onClick={() => sauvegarderModifRdv(false)} className="btn-action" style={{flex: 2}}>Enregistrer</button>
                                      </div>
                                  </>
                              )}
                          </div>
                      </div>
                  )}

                  {/* MODALE AFFICHAGE DU PROTOCOLE POUR L'EMPLOYÉ (AGENDA) */}
                  {protocoleVisible && (
                      <div className="modal-overlay">
                          <div className="modal-content" style={{maxWidth: '600px', height: '80vh', overflowY: 'auto', padding: '24px'}}>
                              <div className="modal-header" style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px'}}>
                                  <div>
                                      <h3 style={{margin: '0 0 8px 0', fontSize: '22px', color: 'var(--text-main)'}}>{protocoleVisible.nom_prestation}</h3>
                                      <div style={{display: 'flex', gap: '8px'}}>
                                          {(protocoleVisible.tags || []).map(t => <span key={t} style={{fontSize: '11px', background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-color)'}}>{t}</span>)}
                                      </div>
                                  </div>
                                  <button className="modal-close-btn" onClick={() => setProtocoleVisible(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              
                              {/* GALERIE EMPLOYÉ */}
                              <div style={{display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px'}}>
                                  {['avant', 'pendant', 'apres'].map(type => (
                                      protocoleVisible.medias && protocoleVisible.medias[type] && (
                                          <div key={type} style={{flexShrink: 0, width: '140px'}}>
                                              <div style={{height: '140px', borderRadius: '8px', overflow: 'hidden', background: '#000'}}><img src={protocoleVisible.medias[type]} alt={type} style={{width: '100%', height: '100%', objectFit: 'cover'}} /></div>
                                              <span style={{fontSize: '11px', display: 'block', textAlign: 'center', marginTop: '4px', textTransform: 'capitalize', color: 'var(--text-secondary)'}}>{type}</span>
                                          </div>
                                      )
                                  ))}
                              </div>
                              
                              <div className="section-titre" style={{fontSize: '14px', marginTop: 0}}>Ingrédients (Préparation Labo)</div>
                              <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px dashed var(--border-color)'}}>
                                  {protocoleVisible.ingredients && (protocoleVisible.ingredients || []).length > 0 ? (
                                      (protocoleVisible.ingredients || []).map((ing, i) => (
                                          <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i !== (protocoleVisible.ingredients || []).length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '14px', color: 'var(--text-main)', fontWeight: '600'}}>
                                              <span><span style={{color: 'var(--text-secondary)', marginRight: '8px'}}>🧪</span>{ing.nom}</span>
                                              <span>{formatPortion(ing.quantite_necessaire)} dose(s)</span>
                                          </div>
                                      ))
                                  ) : <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun produit à préparer.</span>}
                              </div>

                              <div className="section-titre" style={{fontSize: '14px'}}>Déroulé de la prestation (To-Do List)</div>
                              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                  {protocoleVisible.etapes && (protocoleVisible.etapes || []).length > 0 ? (
                                      (protocoleVisible.etapes || []).map((etape, index) => (
                                          <label key={index} style={{display: 'flex', gap: '16px', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', cursor: 'pointer', alignItems: 'flex-start'}}>
                                              <input type="checkbox" style={{width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--btn-primary)', cursor: 'pointer'}} />
                                              <div style={{flex: 1}}>
                                                  <span style={{fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '4px'}}>Étape {index + 1}</span>
                                                  <p style={{margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.5'}}>{etape.texte}</p>
                                                  {etape.timer_min && (
                                                      <button onClick={(e) => { e.preventDefault(); showToast(`Minuteur de ${etape.timer_min} min lancé sur votre appareil !`, "info"); }} style={{fontSize: '12px', background: 'var(--btn-primary)', color: 'white', padding: '6px 12px', borderRadius: '16px', fontWeight: 'bold', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                          Lancer minuteur ({etape.timer_min} min)
                                                      </button>
                                                  )}
                                              </div>
                                          </label>
                                      ))
                                  ) : (
                                      <div style={{fontSize: '14px', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                          {protocoleVisible.description || "Aucune instruction enregistrée."}
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}
                </div>
              )}

              {/* VUE : L'ACADÉMIE (PROTOCOLES) */}
              {(role === 'gerant' || role === 'salon') && activeTab === 'protocoles' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div>
                              <h1 style={{margin: 0}}>L'Académie</h1>
                              <span className="date-subtitle" style={{margin: 0}}>Base de connaissances & Nomenclatures</span>
                          </div>
                          <div style={{display: 'flex', gap: isMobile ? '8px' : '16px', alignItems: 'center'}}>
                              <ThemeToggle />
                              <button onClick={() => setShowAddPrestation(!showAddPrestation)} className="btn-action" style={{width: '40px', height: '40px', flexShrink: 0, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Nouvelle Prestation (Catalogue)">+</button>
                              {!modeEditionProtocole && (
                                  <button onClick={() => { setNouveauProtocole({ nom_prestation: '', etapes: [], medias: { avant: null, pendant: null, apres: null }, tags: [], ingredients: [], temps_nettoyage_minutes: 5, a_temps_nettoyage: false }); setModeEditionProtocole('NEW'); }} className="btn-action" style={{ whiteSpace: 'nowrap', flexShrink: 0, padding: isMobile ? '8px 12px' : '12px 18px', fontSize: isMobile ? '12px' : '14px' }}>
                                      {isMobile ? 'Créer' : 'Créer une Fiche'}
                                  </button>
                              )}
                          </div>
                      </div>
                      {!modeEditionProtocole && (
                          <input type="text" className="input-fournisseur" placeholder="Rechercher (ex: Balayage)..." value={rechercheProtocole} onChange={(e) => setRechercheProtocole(e.target.value)} style={{marginBottom: '16px', fontSize: '14px', width: '100%', boxSizing: 'border-box'}}/>
                      )}
                  </div>

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>

                  {showAddPrestation && (
                      <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                          <h3 style={{marginTop: 0}}>Nouvelle Prestation (Catalogue)</h3>
                          <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                              <input type="text" className="input-fournisseur" placeholder="Nom de la prestation (ex: Coupe Homme)" value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value, type_article: 'PRESTATION'})} />
                              <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{width: '110px'}} value={newArticle.duree_estimee_minutes} onChange={(e) => setNewArticle({...newArticle, duree_estimee_minutes: e.target.value, type_article: 'PRESTATION'})} />
                              <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '90px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value, type_article: 'PRESTATION'})} />
                          </div>
                          <button className="btn-action" onClick={() => { setNewArticle({...newArticle, type_article: 'PRESTATION'}); ajouterArticle(); setShowAddPrestation(false); }} disabled={!newArticle.nom || !newArticle.prix} style={{width: '100%'}}>Ajouter la prestation</button>
                      </div>
                  )}

                  <div className="caisse-split-container" style={{ display: 'block' }}>
                      {!modeEditionProtocole && (
                          <div className="caisse-left-panel" style={{ width: '100%', borderRight: 'none', paddingRight: 0 }}>
                              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px'}}>
                                  {(protocolesListe || []).filter(p => !rechercheProtocole || nettoyerTexteRecherche(p.nom_prestation).includes(nettoyerTexteRecherche(rechercheProtocole))).map(proto => {
                                      let stockSuffisant = true;
                                      (proto.ingredients || []).forEach(ing => {
                                          const articleDuStock = (catalogueListe || []).find(a => a.id_article === ing.id_article);
                                          if (articleDuStock && articleDuStock.stock_actuel < ing.quantite_necessaire) stockSuffisant = false;
                                      });

                                      return (
                                          <div key={proto.id_protocole} onClick={() => setModeEditionProtocole(proto)} className="hover-lift" style={{background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)'}}>
                                              {proto.medias && proto.medias.apres ? (
                                                  <div style={{height: '140px', width: '100%', background: 'var(--bg-hover)'}}><img src={proto.medias.apres} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} /></div>
                                              ) : ( <div style={{height: '4px', width: '100%', background: 'var(--btn-primary)'}}></div> )}
                                              
                                              <div style={{padding: '16px'}}>
                                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
                                                      <span style={{fontSize: '15px', fontWeight: 'bold'}}>{proto.nom_prestation}</span>
                                                      <span style={{width: '12px', height: '12px', borderRadius: '50%', background: stockSuffisant ? 'var(--color-success)' : 'var(--color-danger)'}} title={stockSuffisant ? "Stock OK" : "Rupture prévue"}></span>
                                                  </div>
                                                  <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px'}}>
                                                      {(proto.tags || []).map(t => <span key={t} style={{fontSize: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-main)'}}>{t}</span>)}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {(protocolesListe || []).length === 0 && <div className="empty-state" style={{gridColumn: '1 / -1'}}><p>L'Académie est vide.</p></div>}
                              </div>
                          </div>
                      )}

                      {modeEditionProtocole === 'NEW' && (
                          <div className="caisse-right-panel" style={isMobile ? { width: '100%', boxSizing: 'border-box', overflowY: 'visible', paddingBottom: '130px' } : { width: '100%', maxWidth: '900px', margin: '0 auto', borderLeft: 'none', paddingLeft: 0, overflowY: 'visible', paddingBottom: '24px' }}>
                              <h3 style={{margin: '0 0 24px 0', color: 'var(--text-main)'}}>Création de Fiche Technique</h3>
                              
                              <div style={{marginBottom: '16px'}}>
                                  <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px'}}>Prestation cible (Sélecteur catalogue)</label>
                                  <select className="input-fournisseur" value={nouveauProtocole.nom_prestation} onChange={e => setNouveauProtocole({...nouveauProtocole, nom_prestation: e.target.value})}>
                                      <option value="">-- Choisir une prestation --</option>
                                      {(catalogueListe || []).filter(a => a.type_article === 'PRESTATION').map(p => <option key={p.id_article} value={p.nom}>{p.nom} ({p.prix}€)</option>)}
                                  </select>
                              </div>

                              <div style={{marginBottom: '24px'}}>
                                  <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px'}}>Catégories (Tags)</label>
                                  <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                                      {TAGS_DISPONIBLES.map(tag => (
                                          <button key={tag} onClick={() => toggleTag(tag)} style={{background: (nouveauProtocole.tags || []).includes(tag) ? 'var(--btn-primary)' : 'var(--bg-app)', color: (nouveauProtocole.tags || []).includes(tag) ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold'}}>{tag}</button>
                                      ))}
                                  </div>
                              </div>

                              <div style={{marginBottom: '24px', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', border: '1px dashed var(--border-color)'}}>
                                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                                      <input type="checkbox" checked={nouveauProtocole.a_temps_nettoyage} onChange={e => setNouveauProtocole({...nouveauProtocole, a_temps_nettoyage: e.target.checked, temps_nettoyage_minutes: e.target.checked ? (nouveauProtocole.temps_nettoyage_minutes || 5) : 0})} style={{width: '18px', height: '18px', accentColor: 'var(--btn-primary)'}} />
                                      <span style={{fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)'}}>Temps de nettoyage automatique à l'agenda</span>
                                  </label>
                                  {nouveauProtocole.a_temps_nettoyage && (
                                      <div style={{marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                          <input type="number" min="0" className="input-fournisseur" style={{width: '80px', padding: '8px'}} value={nouveauProtocole.temps_nettoyage_minutes} onChange={e => setNouveauProtocole({...nouveauProtocole, temps_nettoyage_minutes: parseInt(e.target.value) || 0})} />
                                          <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>minutes bloquées après chaque prestation</span>
                                      </div>
                                  )}
                              </div>

                              <div style={{marginBottom: '24px', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                  <h4 style={{fontSize: '13px', margin: '0 0 12px 0'}}>Galerie Multimédia</h4>
                                  <div style={{display: 'flex', gap: '12px'}}>
                                      {['avant', 'pendant', 'apres'].map(type => (
                                          <div key={type} style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                              <label style={{fontSize: '11px', textTransform: 'capitalize', color: 'var(--text-secondary)', textAlign: 'center'}}>{type}</label>
                                              <div style={{height: '100px', borderRadius: '6px', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative'}}>
                                                  {nouveauProtocole.medias[type] ? <img src={nouveauProtocole.medias[type]} alt={type} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <span style={{fontSize: '20px', color: 'var(--text-muted)'}}>+</span>}
                                                  <input type="file" accept="image/*" onChange={(e) => uploadMediaProtocole(e, type)} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'}} />
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>

                              <div style={{marginBottom: '24px'}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px'}}>
                                      <h4 style={{fontSize: '13px', margin: 0}}>Le Pas-à-Pas</h4>
                                      <span style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--btn-primary)'}}>Temps global : {(nouveauProtocole.etapes || []).reduce((acc, e) => acc + (parseInt(e.timer_min) || 0), 0)} min</span>
                                  </div>
                                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px'}}>
                                      {(nouveauProtocole.etapes || []).map((etape, index) => (
                                          <div key={etape.id_etape} draggable onDragStart={(e) => e.dataTransfer.setData("dragIndex", index)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const dragIndex = Number(e.dataTransfer.getData("dragIndex")); const dropIndex = index; const nouvellesEtapes = [...(nouveauProtocole.etapes || [])]; const [draggedEtape] = nouvellesEtapes.splice(dragIndex, 1); nouvellesEtapes.splice(dropIndex, 0, draggedEtape); setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes }); }} style={{background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'grab'}} title="Maintenez cliqué pour déplacer">
                                              <div style={{display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.5}}>
                                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                                              </div>
                                              <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '11px', fontWeight: 'bold'}}>{index + 1}</span>
                                              <div style={{flex: 1, fontSize: '13px'}}>{etape.texte}</div>
                                              {etape.timer_min && <div style={{fontSize: '12px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold'}}>⏱ {etape.timer_min} min</div>}
                                              <button onClick={() => supprimerEtapeRecette(etape.id_etape)} style={{color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer'}}>✕</button>
                                          </div>
                                      ))}
                                  </div>
                                  <div style={{display: 'flex', gap: '8px', background: 'var(--bg-app)', padding: '12px', borderRadius: '6px'}}>
                                      <input type="text" className="input-fournisseur" placeholder="Décrire l'étape..." style={{flex: 3}} value={etapeTemp.texte} onChange={e => setEtapeTemp({...etapeTemp, texte: e.target.value})} />
                                      <input type="number" className="input-fournisseur" placeholder="Min (Optionnel)" style={{flex: 1}} value={etapeTemp.timer_min} onChange={e => setEtapeTemp({...etapeTemp, timer_min: e.target.value})} />
                                      <button className="btn-action" style={{padding: '0 16px'}} onClick={ajouterEtapeRecette}>Ajouter</button>
                                  </div>
                              </div>

                              <h4 style={{fontSize: '13px', margin: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px'}}>Nomenclature (Recette)</h4>
                              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                                  <select className="input-fournisseur" style={{flex: 2}} value={ingredientTemp.id_article} onChange={e => setIngredientTemp({...ingredientTemp, id_article: e.target.value})}>
                                      <option value="">-- Ajouter un produit --</option>
                                      {(catalogueListe || []).filter(a => a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE').map(a => <option key={a.id_article} value={a.id_article}>{a.nom} ({parseFloat(a.prix).toFixed(2)}€)</option>)}
                                  </select>
                                  <select className="input-fournisseur" style={{width: '110px', padding: '11px 8px'}} value={ingredientTemp.quantite_necessaire} onChange={e => setIngredientTemp({...ingredientTemp, quantite_necessaire: e.target.value})}>
                                      <option value="">Portion</option>
                                      <option value="0.13">1/8 dose</option>
                                      <option value="0.25">1/4 dose</option>
                                      <option value="0.33">1/3 dose</option>
                                      <option value="0.5">1/2 dose</option>
                                      <option value="0.67">2/3 dose</option>
                                      <option value="0.75">3/4 dose</option>
                                      <option value="1">1 dose</option>
                                      <option value="1.5">1.5 dose</option>
                                      <option value="2">2 doses</option>
                                      <option value="3">3 doses</option>
                                  </select>
                                  <button onClick={ajouterIngredientRecette} style={{background: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', padding: '0 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>+</button>
                              </div>
                              
                              <div style={{display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px'}}>
                                  {(nouveauProtocole.ingredients || []).map(ing => (
                                      <div key={ing.id_article} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)'}}>
                                          <span><strong style={{color: 'var(--btn-primary)'}}>{formatPortion(ing.quantite_necessaire)} dose(s)</strong> de {ing.nom}</span>
                                          <button onClick={() => supprimerIngredientRecette(ing.id_article)} style={{color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}>✕</button>
                                      </div>
                                  ))}
                              </div>

                              {(() => {
                                  const prestaChoisie = (catalogueListe || []).find(a => a.nom === nouveauProtocole.nom_prestation && a.type_article === 'PRESTATION');
                                  const prixVente = prestaChoisie ? parseFloat(prestaChoisie.prix) : 0;
                                  const coutProduits = (nouveauProtocole.ingredients || []).reduce((acc, ing) => { const art = (catalogueListe || []).find(a => a.id_article === ing.id_article); return acc + (art ? parseFloat(art.prix) * ing.quantite_necessaire : 0); }, 0);
                                  const margeValeur = prixVente - coutProduits;
                                  const margePourcentage = prixVente > 0 ? (margeValeur / prixVente) * 100 : 0;
                                  const couleurMarge = margePourcentage > 60 ? 'var(--color-success)' : (margePourcentage > 30 ? 'var(--color-info)' : 'var(--color-danger)');

                                  return (nouveauProtocole.nom_prestation && (
                                      <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                              <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600'}}>Rentabilité</span>
                                              <span style={{fontSize: '13px', color: 'var(--text-main)'}}>Prix de Vente : <strong>{prixVente.toFixed(2)} €</strong></span>
                                              <span style={{fontSize: '13px', color: 'var(--text-main)'}}>Coût Produits : <strong>{coutProduits.toFixed(2)} €</strong></span>
                                          </div>
                                          <div style={{textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
                                              <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600'}}>Marge Brute Estimée</span>
                                              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                  <span style={{fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)'}}>+{margeValeur.toFixed(2)} €</span>
                                                  <span style={{fontSize: '18px', fontWeight: '900', color: couleurMarge}}>{margePourcentage.toFixed(0)}%</span>
                                              </div>
                                          </div>
                                      </div>
                                  ));
                              })()}

                              <div style={{display: 'flex', gap: '12px'}}>
                                  <button onClick={() => setModeEditionProtocole(null)} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-input)', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer'}}>Annuler</button>
                                  <button className="btn-action" style={{flex: 2, padding: '16px', fontSize: '15px'}} disabled={!nouveauProtocole.nom_prestation} onClick={creerProtocole}>Sauvegarder la Fiche</button>
                              </div>
                          </div>
                      )}
                      
                      {modeEditionProtocole && modeEditionProtocole !== 'NEW' && (
                          <div className="caisse-right-panel" style={isMobile ? { width: '100%', boxSizing: 'border-box', overflowY: 'visible', paddingBottom: '130px' } : { width: '100%', maxWidth: '900px', margin: '0 auto', borderLeft: 'none', paddingLeft: 0, overflowY: 'visible', paddingBottom: '24px' }}>
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px'}}>
                                  <div>
                                      <button onClick={() => setModeEditionProtocole(null)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '12px', fontSize: '11px'}}>← Retour à la liste</button>
                                      <h2 style={{margin: '0 0 8px 0'}}>{modeEditionProtocole.nom_prestation}</h2>
                                      <div style={{display: 'flex', gap: '8px'}}>
                                          {(modeEditionProtocole.tags || []).map(t => <span key={t} style={{fontSize: '11px', background: 'var(--btn-primary)', color: 'white', padding: '2px 8px', borderRadius: '12px'}}>{t}</span>)}
                                      </div>
                                  </div>
                                  <div style={{display: 'flex', gap: '8px'}}>
                                      <button onClick={() => { setNouveauProtocole({...modeEditionProtocole, a_temps_nettoyage: (modeEditionProtocole.temps_nettoyage_minutes > 0), temps_nettoyage_minutes: modeEditionProtocole.temps_nettoyage_minutes || 5}); setModeEditionProtocole('NEW'); }} style={{background: 'var(--btn-primary)', border: 'none', color: 'var(--btn-text)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                                          Modifier la fiche
                                      </button>
                                      <button onClick={() => supprimerProtocole(modeEditionProtocole.id_protocole)} style={{color: 'var(--color-danger)', background: 'var(--bg-app)', border: '1px solid var(--color-danger)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                                          Supprimer la fiche
                                      </button>
                                  </div>
                              </div>

                              <div style={{display: 'flex', gap: '12px', marginBottom: '24px'}}>
                                  {['avant', 'pendant', 'apres'].map(type => (
                                      modeEditionProtocole.medias && modeEditionProtocole.medias[type] && (
                                          <div key={type} style={{flex: 1}}>
                                              <div style={{height: '140px', borderRadius: '8px', overflow: 'hidden', background: '#000'}}><img src={modeEditionProtocole.medias[type]} alt={type} style={{width: '100%', height: '100%', objectFit: 'cover'}} /></div>
                                              <span style={{fontSize: '10px', display: 'block', textAlign: 'center', marginTop: '4px', textTransform: 'capitalize', color: 'var(--text-secondary)'}}>{type}</span>
                                          </div>
                                      )
                                  ))}
                              </div>

                              <h4 style={{fontSize: '13px', margin: '0 0 12px 0'}}>Recette Laboratoire</h4>
                              <div style={{background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '24px'}}>
                                  {(modeEditionProtocole.ingredients || []).map((ing, i) => (
                                      <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i !== (modeEditionProtocole.ingredients || []).length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '13px'}}>
                                          <span>{ing.nom}</span><strong style={{color: 'var(--text-main)'}}>{formatPortion(ing.quantite_necessaire)} dose(s)</strong>
                                      </div>
                                  ))}
                                  {(!modeEditionProtocole.ingredients || (modeEditionProtocole.ingredients || []).length === 0) && <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun produit lié.</span>}
                              </div>

                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px'}}>
                                  <h4 style={{fontSize: '13px', margin: 0}}>Étapes de réalisation</h4>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                      <span style={{fontSize: '10px', color: 'var(--text-muted)'}}>Auto-calcul depuis la recette du protocole</span>
                                      {modeEditionProtocole.temps_nettoyage_minutes > 0 && <span style={{fontSize: '10px', color: 'var(--color-info)', background: 'var(--bg-info)', padding: '2px 6px', borderRadius: '12px'}}>+{modeEditionProtocole.temps_nettoyage_minutes} min nettoyage</span>}
                                      <span style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--btn-primary)'}}>Temps global : {(modeEditionProtocole.etapes || []).reduce((acc, e) => acc + (parseInt(e.timer_min) || 0), 0)} min</span>
                                  </div>
                              </div>
                              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                  {(modeEditionProtocole.etapes || []).map((etape, index) => (
                                      <div key={index} style={{display: 'flex', gap: '12px', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                          <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '12px', fontWeight: 'bold', flexShrink: 0}}>{index + 1}</span>
                                          <div style={{flex: 1}}>
                                              <p style={{margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5'}}>{etape.texte}</p>
                                              {etape.timer_min && <span style={{fontSize: '11px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold'}}>⏱ Minuteur : {etape.timer_min} min</span>}
                                          </div>
                                      </div>
                                  ))}
                                  {(!modeEditionProtocole.etapes || (modeEditionProtocole.etapes || []).length === 0) && <div style={{fontSize: '14px', color: 'var(--text-secondary)'}}>{modeEditionProtocole.description || "Aucune instruction."}</div>}
                              </div>
                          </div>
                      )}
                  </div>
                  
                  {!modeEditionProtocole && (
                      <>
                          <div className="section-titre" style={{marginTop: '32px'}}>Catalogue des Prestations</div>
                          <div className="carte scan-carte">
                              {(catalogueListe || []).filter(art => art.type_article === 'PRESTATION').length === 0 ? (
                                  <div className="empty-state"><p>Aucune prestation au catalogue.</p></div>
                              ) : (catalogueListe || []).filter(art => art.type_article === 'PRESTATION').map(art => (
                                  <div key={art.id_article} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                                      <span><strong style={{color: 'var(--text-main)'}}>{art.nom}</strong> - {art.prix} € </span>
                                      <div style={{display: 'flex', gap: '16px'}}>
                                          <button onClick={() => setModifNomDialog({ id_article: art.id_article, nom: art.nom })} style={{background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontWeight: '500'}}>Renommer</button>
                                          <button onClick={() => supprimerArticle(art.id_article)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '500'}}>Supprimer</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </>
                  )}

                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

              {/* VUE : PRODUITS (STOCKS) */}
              {(role === 'gerant' || role === 'salon') && activeTab === 'produits' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div><h1 style={{margin: 0}}>Inventaire & Produits</h1><span className="date-subtitle" style={{margin: 0}}>Gestion intelligente des stocks</span></div>
                          <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                              <ThemeToggle />
                              <button onClick={() => setShowAddProduit(!showAddProduit)} className="btn-action" style={{width: '40px', height: '40px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Nouveau Produit">+</button>
                          </div>
                      </div>
                  </div>

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  {showAddProduit && (
                      <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                          <h3 style={{marginTop: 0}}>Nouveau Produit (Revente/Labo)</h3>
                          <div style={{display: 'flex', gap: '12px'}}>
                            <input type="text" className="input-fournisseur" placeholder="Nom du produit (Laissez vide si réassort)" value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '100px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                          </div>
                          <div style={{display: 'flex', gap: '12px', marginTop: '12px', marginBottom: '16px'}}>
                            <input type="text" className="input-fournisseur" placeholder="Réf." style={{width: '120px'}} value={newArticle.reference} onChange={(e) => setNewArticle({...newArticle, reference: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Qté" style={{width: '70px'}} value={newArticle.stock_actuel} onChange={(e) => setNewArticle({...newArticle, stock_actuel: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Délai (j)" title="Délai moyen de livraison (jours)" style={{width: '90px'}} value={newArticle.delai_livraison_jours} onChange={(e) => setNewArticle({...newArticle, delai_livraison_jours: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                          </div>
                          <button className="btn-action" onClick={() => { setNewArticle({...newArticle, type_article: 'PRODUIT_REVENTE'}); ajouterArticle(); setShowAddProduit(false); }} disabled={!newArticle.reference} style={{width: '100%'}}>{!newArticle.nom ? 'Mettre à jour le stock' : 'Ajouter au catalogue'}</button>
                      </div>
                  )}

                  <div className="carte scan-carte">
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', paddingBottom: isStockExpanded ? '16px' : '0'}} onClick={() => setIsStockExpanded(!isStockExpanded)}>
                          <h3 style={{margin: 0, color: 'var(--text-main)'}}>État des Stocks</h3>
                          <span style={{fontSize: '20px', color: 'var(--text-secondary)'}}>{isStockExpanded ? '▲' : '▼'}</span>
                      </div>
                      
                      {isStockExpanded && (
                          <>
                              <div style={{display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap'}}>
                                  <input type="text" className="input-fournisseur" placeholder="Chercher un produit..." value={stockSearch} onChange={e => setStockSearch(e.target.value)} style={{flex: 1, minWidth: '200px'}} />
                                  <select className="input-fournisseur" value={stockSortBy} onChange={e => setStockSortBy(e.target.value)} style={{width: 'auto', minWidth: '150px'}}>
                                      <option value="nom">Trier par: Nom (A-Z)</option>
                                      <option value="stock">Trier par: Quantité</option>
                                  </select>
                              </div>
                              <div className="stock-container">
                                {stocksData
                                    .filter(p => p.nom.toLowerCase().includes(stockSearch.toLowerCase()))
                                    .sort((a, b) => {
                                        if (stockSortBy === 'nom') return a.nom.localeCompare(b.nom);
                                        if (stockSortBy === 'stock') return a.stock_actuel - b.stock_actuel;
                                        return 0;
                                    })
                                    .map((produit) => {
                                    const status = getStockStatus(produit.stock_actuel);
                                    const tendance = getTendanceStock(produit);
                                    return (
                                      <div className="stock-item" key={produit.id_article} style={{position: 'relative'}}>
                                        <div className="stock-info"><div className="stock-details"><span className="stock-nom">{produit.nom}</span><span className="badge-discret" style={{ backgroundColor: status.bg, color: status.text }}>{status.label}</span>{tendance && <span className="badge-discret" style={{ backgroundColor: 'var(--bg-info)', color: tendance.couleur }} title={tendance.date ? `Rupture estimée le ${new Date(tendance.date).toLocaleDateString()}` : ''}>{tendance.texte}</span>}</div></div>
                                        <div className="stock-quantite-container" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                            <span className="stock-quantite">{produit.stock_actuel}</span>
                                            <button onClick={(e) => { e.stopPropagation(); setStockMenuOuvert(stockMenuOuvert === produit.id_article ? null : produit.id_article); }} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '18px', fontWeight: 'bold', lineHeight: 1}}>⋮</button>
                                        </div>
                                        {stockMenuOuvert === produit.id_article && (
                                            <>
                                                <div onClick={() => setStockMenuOuvert(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                                <div className="chat-msg-menu" style={{top: '100%', bottom: 'auto', zIndex: 999, width: '170px'}}>
                                                    <button onClick={() => { setModifStockDialog({ id_article: produit.id_article, nom: produit.nom, valeur: produit.stock_actuel }); setStockMenuOuvert(null); }}>Modifier la quantité</button>
                                                    <button onClick={() => { setStockMenuOuvert(null); setConfirmDialog({ titre: "Supprimer le produit", message: `Voulez-vous vraiment supprimer "${produit.nom}" du catalogue ? Cette action est irréversible.`, btnTexte: "Supprimer", action: () => supprimerArticle(produit.id_article) }); }} style={{color: 'var(--color-danger)'}}>Supprimer</button>
                                                </div>
                                            </>
                                        )}
                                      </div>
                                    );
                                })}
                                {stocksData.length === 0 && <div className="empty-state"><SvgEmptyState /><p>Aucun produit en stock.</p></div>}
                              </div>
                          </>
                      )}
                  </div>
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

              {/* VUE : RH (ÉQUIPE) */}
              {role === 'gerant' && activeTab === 'rh' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div><h1 style={{margin: 0}}>Ressources Humaines</h1><span className="date-subtitle" style={{margin: 0}}>Suivi des primes et performances</span></div>
                          <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
                              <select className="input-fournisseur" style={{marginBottom: 0, width: 'auto', padding: '8px', fontSize: '12px'}} value={rhSortBy} onChange={e => setRhSortBy(e.target.value)}>
                                  <option value="ca">Tri : CA généré</option>
                                  <option value="note">Tri : Palmarès (Note client)</option>
                              </select>
                              <ThemeToggle />
                              <button onClick={() => setShowAddEmploye(!showAddEmploye)} className="btn-action" style={{width: '40px', height: '40px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Ajouter un équipier">+</button>
                          </div>
                      </div>
                  </div>

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  
                  {/* PANNEAU DE CONTRÔLE : DEMANDES DE CONGÉS EN ATTENTE */}
                  {absencesRH && absencesRH.filter(a => a.statut === 'EN_ATTENTE').length > 0 && (
                      <div className="carte scan-carte" style={{ marginBottom: '24px', borderColor: 'var(--color-info)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)' }}>
                          <h3 style={{ marginTop: 0, color: 'var(--text-main)', marginBottom: '16px' }}>⚠️ Absences en attente</h3>
                          <div className="list-group" style={{ marginBottom: 0 }}>
                              {absencesRH.filter(a => a.statut === 'EN_ATTENTE').map(abs => (
                                  <div key={abs.id_absence} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px', padding: '16px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                          <div>
                                              <strong style={{ display: 'block', fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px' }}>{abs.nom_employe}</strong>
                                              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Du {new Date(abs.date_debut).toLocaleDateString('fr-FR')} au {new Date(abs.date_fin).toLocaleDateString('fr-FR')}</span>
                                          </div>
                                          <span className="badge-discret" style={{ background: 'var(--bg-info)', color: 'var(--color-info)' }}>{abs.nature_absence.replace('_', ' ')}</span>
                                      </div>
                                      {abs.commentaire && <div style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text-secondary)', padding: '8px', background: 'var(--bg-app)', borderRadius: '6px' }}>"{abs.commentaire}"</div>}
                                      
                                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                          {abs.fichier_cle_r2 && (
                                              <button onClick={async () => {
                                                  try {
                                                      const res = await fetch(`https://api-salon-backend.onrender.com/api/rh/absences/${abs.id_absence}/justificatif`, { headers: getAuthHeaders() });
                                                      const data = await handleFetchError(res);
                                                      window.open(data.url, '_blank');
                                                  } catch(e) { showToast("Justificatif indisponible", "error"); }
                                              }} style={{ flex: 1, padding: '10px 4px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}>Justificatif</button>
                                          )}
                                          <button onClick={async () => {
                                              const motif = prompt("Motif du refus (Optionnel) :");
                                              if (motif !== null) { // null = l'utilisateur a cliqué sur "Annuler"
                                                  try {
                                                      const res = await fetch(`https://api-salon-backend.onrender.com/api/rh/absences/${abs.id_absence}/decision`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ statut: 'REFUSE', motif_refus: motif }) });
                                                      await handleFetchError(res);
                                                      showToast("Demande refusée", "success"); 
                                                      chargerTout(); setRefreshTrigger(prev => prev+1);
                                                  } catch(e) { showToast(e.message || "Erreur", "error"); }
                                              }
                                          }} style={{ flex: 1, padding: '10px 4px', background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}>Refuser</button>
                                          <button onClick={async () => {
                                              try {
                                                  const res = await fetch(`https://api-salon-backend.onrender.com/api/rh/absences/${abs.id_absence}/decision`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ statut: 'VALIDE', motif_refus: null }) });
                                                  const data = await handleFetchError(res);
                                                  showToast("Absence validée", "success"); 
                                                  
                                                  if (data.conflits && data.conflits.length > 0) {
                                                      const prenomEmp = abs.nom_employe.split(' ')[0];
                                                      setCancellationRobot({ rdvs: data.conflits, id_employe: abs.id_employe, nom_employe: prenomEmp });
                                                      setSelectedCancelRdvs(data.conflits.map(r => r.id_rdv));
                                                      setCancelMessageTemplate(`Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`);
                                                  } else {
                                                      chargerTout(); setRefreshTrigger(prev => prev+1);
                                                  }
                                              } catch(e) { showToast(e.message || "Erreur", "error"); }
                                          }} className="btn-action" style={{ flex: 1, padding: '10px 4px', fontSize: '12px' }}>Valider</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  {showAddEmploye && (
                      <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                          <h3 style={{marginTop: 0}}>Nouveau Collaborateur</h3>
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
                          <button className="btn-action" onClick={() => {ajouterEmploye(); setShowAddEmploye(false);}} disabled={!newEmploye.nom || !newEmploye.code_pin} style={{width: '100%'}}>Enregistrer le collaborateur</button>
                      </div>
                  )}
                  
                  {(rhData || []).length === 0 ? (
                      <div className="empty-state"><SvgEmptyState /><p>Aucun employé enregistré.</p></div>
                  ) : (
                    <div className="rh-grid">
                      {[...rhData].sort((a, b) => rhSortBy === 'note' ? (b.note_moyenne || 0) - (a.note_moyenne || 0) : b.performances_actuelles.ca_genere - a.performances_actuelles.ca_genere).map(employe => (
                        <div className="rh-carte" key={employe.id_employe} style={{position: 'relative', padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)'}}>
                          
                          {/* 1. EN-TÊTE : PROFIL & NOTE (Nouveau Design) */}
                          <div style={{display: 'flex', alignItems: 'flex-start', padding: '20px', borderBottom: '1px solid var(--border-color)'}}>
                              <div className="rh-avatar" style={{width: '48px', height: '48px', marginRight: '16px'}}>
                                {employe.photo_url ? ( <img src={employe.photo_url} alt={employe.nom} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> ) : ( <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> )}
                              </div>
                              
                              <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                      <h3 style={{margin: 0, fontSize: '16px', color: 'var(--text-main)'}}>{employe.nom}</h3>
                                      <span style={{fontSize: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase'}}>{employe.role}</span>
                                  </div>
                                  
                                  {employe.note_moyenne ? (
                                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                          <span style={{color: '#f59e0b', fontSize: '14px', letterSpacing: '1px'}}>{'★'.repeat(Math.round(employe.note_moyenne))}{'☆'.repeat(5 - Math.round(employe.note_moyenne))}</span>
                                          <span style={{fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)'}}>{employe.note_moyenne}</span>
                                          <span style={{fontSize: '11px', color: 'var(--text-secondary)'}}>({employe.nb_avis} avis)</span>
                                      </div>
                                  ) : (
                                      <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>Aucun avis client</span>
                                  )}
                              </div>

                              <button onClick={(e) => { e.stopPropagation(); setEmployeMenuOuvert(employeMenuOuvert === employe.id_employe ? null : employe.id_employe); }} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', transition: 'all 0.15s'}}>⋮</button>
                              
                              {employeMenuOuvert === employe.id_employe && (
                                  <>
                                      <div onClick={() => setEmployeMenuOuvert(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                      <div className="chat-msg-menu" style={{top: '50px', right: '20px', bottom: 'auto', zIndex: 999, width: '170px'}}>
                                          <button onClick={() => { setModifEmployeDialog({ id_employe: employe.id_employe, nom: employe.nom, code_pin: '', taux_commission_prestation: employe.taux_commission_prestation ?? '', taux_commission_produit: employe.taux_commission_produit ?? '' }); setEmployeMenuOuvert(null); }}>Modifier</button>
                                          <button onClick={() => { setEmployeMenuOuvert(null); setConfirmDialog({ titre: "Supprimer l'employé", message: `Voulez-vous vraiment supprimer "${employe.nom}" ? Cette action est irréversible.`, btnTexte: "Supprimer", action: () => supprimerEmploye(employe.id_employe) }); }} style={{color: 'var(--color-danger)'}}>Supprimer</button>
                                      </div>
                                  </>
                              )}
                          </div>

                          {/* 2. CORPS : STATISTIQUES & PRIMES */}
                          <div style={{padding: '20px'}}>
                              <div style={{background: 'var(--bg-app)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', marginBottom: '16px', border: '1px solid var(--border-color)'}}>
                                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, borderRight: '1px solid var(--border-color)'}}>
                                      <span style={{fontSize: '18px', fontWeight: 'bold', color: 'var(--text-main)'}}>{employe.performances_actuelles.clients_coiffes}</span>
                                      <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px'}}>Clients</span>
                                  </div>
                                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, borderRight: '1px solid var(--border-color)'}}>
                                      <span style={{fontSize: '18px', fontWeight: 'bold', color: 'var(--text-main)'}}>{employe.performances_actuelles.produits_vendus}</span>
                                      <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px'}}>Produits</span>
                                  </div>
                                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1}}>
                                      <span style={{fontSize: '18px', fontWeight: 'bold', color: 'var(--color-success)'}}>+{((employe.performances_actuelles.ca_genere / (dashboardData?.finances?.chiffre_affaires_total || 1)) * 100).toFixed(0)}%</span>
                                      <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px'}}>CA Global</span>
                                  </div>
                              </div>

                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)'}}>
                                  <span style={{fontSize: '13px', fontWeight: '600', color: 'var(--text-main)'}}>Prime estimée</span>
                                  <span style={{fontSize: '18px', fontWeight: 'bold', color: 'var(--color-success)'}}>{employe.performances_actuelles.prime_estimee.toFixed(2)} <span style={{fontSize: '14px'}}>€</span></span>
                              </div>
                          </div>
                          
                          {/* 3. TIROIR DES AVIS (Inchangé sur le design des commentaires) */}
                          {employe.derniers_avis && employe.derniers_avis.length > 0 && (
                              <div style={{background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', padding: '12px 20px'}}>
                                  <button onClick={() => setRhAvisExpanded({...rhAvisExpanded, [employe.id_employe]: !rhAvisExpanded[employe.id_employe]})} style={{background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold', padding: '4px 0'}}>
                                      {rhAvisExpanded[employe.id_employe] ? 'Masquer les avis ▲' : 'Voir ses derniers avis ▼'}
                                  </button>
                                  {rhAvisExpanded[employe.id_employe] && (
                                      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px'}}>
                                          {employe.derniers_avis.map((avis, i) => {
                                              const isPositif = avis.note >= 4;
                                              return (
                                                  <div key={i} style={{background: isPositif ? 'var(--bg-card)' : 'var(--bg-danger)', borderLeft: `3px solid ${isPositif ? 'var(--color-success)' : 'var(--color-danger)'}`, padding: '10px 12px', borderRadius: '4px', fontSize: '12px', textAlign: 'left', boxShadow: 'var(--shadow-sm)'}}>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px'}}>
                                                          <strong style={{color: isPositif ? 'var(--text-main)' : 'var(--color-danger)'}}>{avis.prenom}</strong>
                                                          <span style={{color: '#f59e0b', fontSize: '13px', letterSpacing: '1px'}}>{'★'.repeat(avis.note)}{'☆'.repeat(5 - avis.note)}</span>
                                                      </div>
                                                      <span style={{color: isPositif ? 'var(--text-secondary)' : 'var(--color-danger)', fontStyle: 'italic', lineHeight: '1.4', display: 'block'}}>"{avis.commentaire}"</span>
                                                  </div>
                                              )
                                          })}
                                      </div>
                                  )}
                              </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {modifEmployeDialog && (
                      <div className="modal-overlay">
                          <div className="modal-content">
                              <div className="modal-header">
                                  <h3 style={{margin: 0, fontSize: '18px'}}>Modifier {modifEmployeDialog.nom}</h3>
                                  <button className="modal-close-btn" onClick={() => setModifEmployeDialog(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                              </div>
                              <input type="text" className="input-fournisseur" placeholder="Nom du collaborateur" value={modifEmployeDialog.nom} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, nom: e.target.value})} style={{marginBottom: '12px'}} />
                              <input type="password" maxLength="4" className="input-fournisseur" placeholder="Nouveau PIN (laisser vide pour ne pas changer)" value={modifEmployeDialog.code_pin} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, code_pin: e.target.value})} style={{marginBottom: '12px'}} />
                              <div style={{display: 'flex', gap: '12px', marginBottom: '24px'}}>
                                  <input type="number" className="input-fournisseur" placeholder="% Com. Prestations" value={modifEmployeDialog.taux_commission_prestation} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, taux_commission_prestation: e.target.value})} />
                                  <input type="number" className="input-fournisseur" placeholder="% Com. Produits" value={modifEmployeDialog.taux_commission_produit} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, taux_commission_produit: e.target.value})} />
                              </div>
                              <div style={{display: 'flex', gap: '12px'}}>
                                  <button onClick={() => setModifEmployeDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer'}}>Annuler</button>
                                  <button onClick={sauvegarderModifEmploye} className="btn-action" style={{flex: 2}} disabled={!modifEmployeDialog.nom}>Enregistrer</button>
                              </div>
                          </div>
                      </div>
                  )}
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

              {/* VUE : ADMIN COMPTA */}
              {role === 'salon' && activeTab === 'admin' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div><h1 style={{margin: 0}}>Comptabilité</h1><span className="date-subtitle" style={{margin: 0}}>Clôture NF525</span></div>
                      <ThemeToggle />
                  </div>
                  <div style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)'}}>
                     <div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Clôture Journalière (Z)</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Obligatoire chaque soir pour sceller les encaissements.</span></div>
                     <button onClick={demanderZDeCaisse} className="btn-action">Générer le Z</button>
                  </div>
                </div>
              )}

              {role === 'employe' && activeTab === 'admin' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                      <div><h1 style={{margin: 0}}>Ma comptabilité</h1><span className="date-subtitle" style={{margin: 0}}>Historique de mon chiffre d'affaires</span></div>
                      <ThemeToggle />
                  </div>
                  {(historiqueData || []).length === 0 ? (
                      <div className="empty-state"><SvgEmptyState /><p>Aucune vente enregistrée pour le moment.</p></div>
                  ) : (
                      <div className="list-group">
                          {(historiqueData || []).map((anneeData) => (
                              <div key={anneeData.annee} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <button type="button" onClick={() => setExpandedYear(expandedYear === anneeData.annee ? null : anneeData.annee)} className="list-row" style={{ fontWeight: '600', width: '100%' }}>
                                      <span className="list-row-icon" style={{ transform: expandedYear === anneeData.annee ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                      </span>
                                      <span className="list-row-label" style={{ fontWeight: '600' }}>Année {anneeData.annee}</span>
                                  </button>
                                  {expandedYear === anneeData.annee && (
                                      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-app)' }}>
                                          {(anneeData.mois || []).map((moisData) => (
                                              <div key={moisData.nom} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', overflow: 'hidden', marginTop: '12px' }}>
                                                  <button type="button" onClick={() => setExpandedMonth(expandedMonth === moisData.nom ? null : moisData.nom)} style={{ display: 'flex', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', background: 'none', border: 'none', fontFamily: 'inherit' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600', color: 'var(--text-main)' }}>
                                                          <span style={{ display: 'flex', width: '14px', height: '14px', color: 'var(--text-secondary)', transform: expandedMonth === moisData.nom ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                                          </span>
                                                          {moisData.nom}
                                                      </div>
                                                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>{moisData.total_mensuel?.toFixed(2) || '0.00'} €</span>
                                                  </button>
                                                  {expandedMonth === moisData.nom && (
                                                      <div style={{ padding: '12px 16px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                          {(moisData.jours || []).map(jour => (
                                                              <div key={jour.date_brute} onClick={() => telechargerBilanJour(jour.date_brute)} className="hover-bg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'background 0.2s' }} title="Cliquez pour télécharger le PDF détaillé">
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                      <span style={{ display: 'flex', width: '17px', height: '17px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                                                                      <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '14px' }}>Bilan du {jour.date_formattee}</span>
                                                                  </div>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                      <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '15px' }}>{jour.total?.toFixed(2) || '0.00'} €</span>
                                                                      <span style={{ display: 'flex', width: '15px', height: '15px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/></svg></span>
                                                                  </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}
                </div>
              )}

              {role === 'gerant' && activeTab === 'admin' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div><h1 style={{margin: 0}}>Comptabilité Légale</h1><span className="date-subtitle" style={{margin: 0}}>Historique Comptable & Clôtures NF525</span></div>
                          <ThemeToggle />
                      </div>
                  </div>
                  
                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  <div style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)'}}>
                     <div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Clôture Journalière (Z)</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Obligatoire chaque soir pour sceller les encaissements.</span></div>
                     <button onClick={demanderZDeCaisse} className="btn-action">Générer le Z</button>
                  </div>
              
                  <div className="carte export-carte"><div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Liasse Mensuelle</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Génération PDF & Envoi Email</span></div><button className="btn-export" onClick={declencherExport}>Exporter PDF</button></div>
                  <div className="carte export-carte" style={{marginTop: '16px'}}><div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Fichier FEC (Comptable)</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Export .txt normalisé (Partie double)</span></div><button className="btn-export" onClick={declencherExportFEC} style={{background: 'var(--text-main)', color: 'var(--bg-app)', border: 'none'}}>Télécharger FEC</button></div>
                  <div className="carte export-carte" style={{marginTop: '16px'}}><div><h3 style={{margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '15px'}}>Audit de Conformité (NF525)</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Vérification des chaînes cryptographiques</span></div><button className="btn-export" onClick={lancerAuditNF525} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)'}}>Lancer l'audit</button></div>
                  <div className="section-titre" style={{marginTop: '32px'}}>Historique des bilans comptables</div>
                  
                  {(historiqueData || []).length === 0 ? (
                      <div className="empty-state">
                          <SvgEmptyState />
                          <p>Aucune clôture de caisse (Z) effectuée pour le moment.</p>
                      </div>
                  ) : (
                      <div className="list-group">
                          {(historiqueData || []).map((anneeData) => (
                              <div key={anneeData.annee} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <button type="button" onClick={() => setExpandedYear(expandedYear === anneeData.annee ? null : anneeData.annee)} className="list-row" style={{ fontWeight: '600', width: '100%' }}>
                                      <span className="list-row-icon" style={{ transform: expandedYear === anneeData.annee ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                      </span>
                                      <span className="list-row-label" style={{ fontWeight: '600' }}>Année {anneeData.annee}</span>
                                  </button>

                                  {expandedYear === anneeData.annee && (
                                      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-app)' }}>
                                          {(anneeData.mois || []).map((moisData) => (
                                              <div key={moisData.nom} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', overflow: 'hidden', marginTop: '12px' }}>

                                                  <button type="button" onClick={() => setExpandedMonth(expandedMonth === moisData.nom ? null : moisData.nom)} style={{ display: 'flex', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', background: 'none', border: 'none', fontFamily: 'inherit' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600', color: 'var(--text-main)' }}>
                                                          <span style={{ display: 'flex', width: '14px', height: '14px', color: 'var(--text-secondary)', transform: expandedMonth === moisData.nom ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                                          </span>
                                                          {moisData.nom}
                                                      </div>
                                                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>
                                                          {moisData.total_mensuel?.toFixed(2) || '0.00'} €
                                                      </span>
                                                  </button>

                                                  {expandedMonth === moisData.nom && (
                                                      <div style={{ padding: '12px 16px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '13px', fontWeight: '600', border: '1px solid var(--border-color)', marginBottom: '8px' }}>
                                                              <span>Bilan consolidé ({moisData.nom})</span>
                                                              <span>{moisData.total_mensuel?.toFixed(2) || '0.00'} €</span>
                                                          </div>

                                                          {(moisData.jours || []).map(jour => (
                                                              <div key={jour.date_brute} onClick={() => telechargerBilanJour(jour.date_brute)} className="hover-bg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'background 0.2s' }} title="Cliquez pour télécharger le PDF détaillé">
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                      <span style={{ display: 'flex', width: '17px', height: '17px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                                                                      <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '14px' }}>Bilan du {jour.date_formattee}</span>
                                                                  </div>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                      <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '15px' }}>{jour.total?.toFixed(2) || '0.00'} €</span>
                                                                      <span style={{ display: 'flex', width: '15px', height: '15px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/></svg></span>
                                                                  </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
              )}

              {/* VUE : MESSAGERIE (TEAMS STYLE) */}
              {activeTab === 'messagerie' && (
                <div className={isMobile ? "admin-container mobile-chat-container" : "admin-container"} style={!isMobile ? { display: 'flex', flexDirection: 'column', minHeight: '100%' } : {}}>
                  {/* Sur Desktop, on garde le titre. Sur mobile, on le masque pour gagner de la place */}
                  {!isMobile && (
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div>
                              <h1 style={{margin: 0}}>Messagerie</h1>
                              <span className="date-subtitle" style={{margin: 0}}>Échanges d'équipe sécurisés</span>
                          </div>
                          <ThemeToggle />
                      </div>
                  )}

                  <div className="chat-wrapper">
                      <div className="chat-sidebar">
                          <div className="chat-header">Discussions</div>
                          <div className="chat-contact-list">
                              <div className={`chat-contact ${chatActif === 'salon' ? 'active' : ''}`} onClick={() => setChatActif('salon')} style={{position: 'relative'}}>
                                  {nonLusParConv['salon'] && <span className="badge-ia-rouge"></span>}
                                  <div style={{width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, borderRadius: '8px', background: 'var(--text-main)', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0}}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                                  <div className="chat-contact-name" style={{fontWeight: '600'}}>{configSalon.nom_salon || 'Groupe Salon'}</div>
                              </div>
                              {contactsTries.map(c => (
                                  <div key={c.key} className={`chat-contact ${chatActif === c.key ? 'active' : ''}`} onClick={() => setChatActif(c.key)} style={{position: 'relative'}}>
                                      {nonLusParConv[c.key] && <span className="badge-ia-rouge"></span>}
                                      {renderAvatar(c.photo_url, c.nom, isMobile ? 48 : 40)}
                                      <div className="chat-contact-name">{c.nom}</div>
                                  </div>
                              ))}
                          </div>
                      </div>

                      <div className="chat-main">
                          <div className="chat-header">
                              {chatActif === 'salon' ? (configSalon.nom_salon || 'Groupe Salon') : 
                               chatActif === 'gerant' ? 'Gérant' : 
                               ((employesListe || []).find(e => e.id_employe === chatActif)?.nom || 'Conversation')}
                          </div>
                          
                          <style>{`
                              .chat-date-separateur { display: flex; justify-content: center; margin: 8px 0; }
                              .chat-date-separateur span { font-size: 11px; font-weight: 600; color: var(--text-secondary); background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 12px; padding: 4px 12px; }
                              .chat-vu-par { position: absolute; bottom: -9px; right: 4px; display: flex; cursor: pointer; z-index: 2; }
                              .chat-vu-par-bulle { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--bg-card); background: var(--bg-app); overflow: hidden; display: flex; align-items: center; justify-content: center; }
                              .chat-vu-par-plus { font-size: 8px; font-weight: 700; color: var(--text-secondary); }
                              .chat-vu-par-liste { position: absolute; bottom: 20px; right: 0; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-md); padding: 10px; min-width: 160px; z-index: 20; max-height: 150px; overflow-y: auto; }
                              .chat-vu-par-liste-titre { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; position: sticky; top: 0; background: var(--bg-card); padding-bottom: 4px; z-index: 2; }
                              .chat-vu-par-liste-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--text-main); white-space: nowrap; }
                          `}</style>
                          <div className="chat-messages" ref={chatMessagesRef}>
                              {(messagesListe || []).filter(m => {
                                  const myId = role === 'employe' ? decodeToken(token)?.id_employe : (role === 'salon' ? -1 : null);
                                  if (chatActif === 'salon') return m.id_destinataire === 0;
                                  if (chatActif === 'gerant') return (m.id_expediteur === myId && m.id_destinataire === null) || (m.id_expediteur === null && m.id_destinataire === myId);
                                  return (m.id_expediteur === myId && m.id_destinataire === chatActif) || (m.id_expediteur === chatActif && m.id_destinataire === myId);
                              }).map((msg, idxMsg, tableauMsgsConv) => {
                                  const myId = role === 'employe' ? decodeToken(token)?.id_employe : (role === 'salon' ? -1 : null);
                                  const isMine = msg.id_expediteur === myId;
                                  const myReactId = role === 'employe' ? `emp_${myId}` : (role === 'salon' ? 'salon' : 'gerant');
                                  const messagePrecedent = tableauMsgsConv[idxMsg - 1];
                                  const changerDeJour = !messagePrecedent || new Date(msg.date_creation).toDateString() !== new Date(messagePrecedent.date_creation).toDateString();

                                  return (
                                      <div key={msg.id_message} style={{display: 'contents'}}>
                                      {changerDeJour && (
                                          <div className="chat-date-separateur"><span>{formatDateSeparateur(msg.date_creation)}</span></div>
                                      )}
                                      <div className={`chat-msg-row ${isMine ? 'mine' : 'others'}`} style={{position: 'relative', maxWidth: '100%'}}>
                                          {!isMine && renderAvatar(msg.photo_expediteur, msg.nom_expediteur, 32)}
                                          
                                          <div style={{display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', minWidth: 0}}>
                                              {!isMine && <span style={{fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', marginLeft: '4px'}}>{msg.nom_expediteur}</span>}
                                              
                                              <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isMine ? 'row-reverse' : 'row', maxWidth: '100%', minWidth: 0}}>
                                                  
                                                  {editingMsgId === msg.id_message ? (
                                                      <div style={{display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '12px', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)'}}>
                                                          <textarea value={editMsgContent} onChange={e => setEditMsgContent(e.target.value)} className="chat-input" style={{minHeight: '60px', width: '250px', border: '1px solid var(--border-focus)'}} />
                                                          <div style={{display: 'flex', gap: '8px'}}>
                                                              <button onClick={() => validerEdition(msg.id_message)} style={{background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', borderRadius: '16px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold'}}>Valider</button>
                                                              <button onClick={() => setEditingMsgId(null)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold'}}>Annuler</button>
                                                          </div>
                                                      </div>
                                                  ) : (
                                                      <div style={{position: 'relative'}}>
                                                          <div className="chat-bubble">
                                                              {msg.contenu}
                                                              {msg.fichier_url && <img src={msg.fichier_url} alt="Fichier joint" className="chat-attached-image" />}
                                                          </div>
                                                          {isMine && msg.vu_par && msg.vu_par.length > 0 && (
                                                              <div className="chat-vu-par" onClick={(e) => { e.stopPropagation(); setVuParOuvertMsgId(vuParOuvertMsgId === msg.id_message ? null : msg.id_message); }}>
                                                                  {msg.vu_par.slice(0, 3).map((idProfil, i) => {
                                                                      const dernierEtTropPlein = i === 2 && msg.vu_par.length > 3;
                                                                      const profil = resoudreProfilVu(idProfil);
                                                                      return (
                                                                          <div key={idProfil} className="chat-vu-par-bulle" style={{ marginLeft: i === 0 ? 0 : '-8px' }}>
                                                                              {dernierEtTropPlein ? <span className="chat-vu-par-plus">+{msg.vu_par.length - 2}</span> : renderAvatar(profil.photo_url, profil.nom, 14)}
                                                                          </div>
                                                                      );
                                                                  })}
                                                                  {vuParOuvertMsgId === msg.id_message && (
                                                                      <div className="chat-vu-par-liste" onMouseLeave={() => setVuParOuvertMsgId(null)} onClick={(e) => e.stopPropagation()}>
                                                                          <div className="chat-vu-par-liste-titre">Vu par</div>
                                                                          {msg.vu_par.map(idProfil => {
                                                                              const profil = resoudreProfilVu(idProfil);
                                                                              return (
                                                                                  <div key={idProfil} className="chat-vu-par-liste-item">
                                                                                      {renderAvatar(profil.photo_url, profil.nom, 22)}
                                                                                      <span>{profil.nom}</span>
                                                                                  </div>
                                                                              );
                                                                          })}
                                                                      </div>
                                                                  )}
                                                              </div>
                                                          )}
                                                      </div>
                                                  )}
                                                  
                                                  {isMine && !editingMsgId && (
                                                      <div style={{position: 'relative'}}>
                                                          <button className="chat-msg-actions-btn" onClick={() => setActiveMenuId(activeMenuId === msg.id_message ? null : msg.id_message)}>
                                                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                                          </button>
                                                          {activeMenuId === msg.id_message && (
                                                              <div className="chat-msg-menu">
                                                                  <button onClick={() => demarrerEdition(msg)}> Modifier</button>
                                                                  <button onClick={() => supprimerMessage(msg.id_message)} style={{color: 'var(--color-danger)'}}> Supprimer</button>
                                                              </div>
                                                          )}
                                                      </div>
                                                  )}
                                                  
                                                  {!isMine && (
                                                      <div style={{position: 'relative'}}>
                                                          <button className="chat-msg-actions-btn" onClick={() => setActiveReactionId(activeReactionId === msg.id_message ? null : msg.id_message)}>
                                                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-3-10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-3 5.5c2.326 0 4.316-1.42 5.127-3.5H8.873c.81 2.08 2.8 3.5 5.127 3.5z"/></svg>
                                                          </button>
                                                          {activeReactionId === msg.id_message && (
                                                              <div className="chat-reaction-picker" onMouseLeave={() => setActiveReactionId(null)}>
                                                                  {CHAT_EMOJIS.map(em => (
                                                                      <button key={em} onClick={() => toggleReaction(msg.id_message, em)}>{em}</button>
                                                                  ))}
                                                              </div>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                              
                                              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                  <div className="chat-reactions-display" style={{justifyContent: isMine ? 'flex-end' : 'flex-start'}}>
                                                      {Object.entries(msg.reactions).map(([em, users]) => (
                                                          <div key={em} className={`chat-reaction-badge ${users.includes(myReactId) ? 'active' : ''}`} onClick={() => toggleReaction(msg.id_message, em)}>
                                                              {em} {users.length}
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                              
                                              <div className="chat-meta">
                                                  <span>{new Date(msg.date_creation).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                              </div>
                                          </div>
                                      </div>
                                      </div>
                                  );
                              })}
                              <div ref={messagesEndRef} />
                          </div>

                          <div className="chat-input-area">
                              <button className="chat-btn chat-file-btn" onClick={() => document.getElementById('chat-file-upload').click()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
                              <input type="file" id="chat-file-upload" accept="image/*" style={{display:'none'}} onChange={handleChatFileUpload} />
                              <div style={{flex: 1, position: 'relative'}}>
                                  {msgFile && <div style={{position: 'absolute', bottom: '100%', left: '16px', marginBottom: '8px', background: 'var(--bg-hover)', padding: '4px 8px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>📷 Image jointe <button onClick={() => setMsgFile(null)} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0}}>✕</button></div>}
                                  <textarea className="chat-input" placeholder="Écrire un nouveau message..." value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => {if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerMessage(); }}} />
                              </div>
                              <button className="chat-btn" disabled={!msgInput.trim() && !msgFile} onClick={envoyerMessage}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                          </div>
                      </div>
                  </div>
                </div>
              )}

              {/* === GOD MODE (SUPER-ADMIN) === */}
              {role === 'gerant' && activeTab === 'superadmin' && decodeToken(token)?.email === '2@gmail.com' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : {}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                      <div><h1 style={{margin: 0, color: '#aa3bff'}}>God Mode</h1><span className="date-subtitle" style={{margin: 0}}>Espace Fondateur STACK</span></div>
                      <ThemeToggle />
                  </div>
                  
                  {superAdminData ? (
                      <div className="cartes-financieres">
                          <div className="carte" style={{border: '1px solid #aa3bff'}}><div className="carte-titre-container"><div className="icon" style={{color: '#aa3bff'}}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><h3>MRR (Revenu Récurrent)</h3></div><p className="montant" style={{color: '#aa3bff'}}>{superAdminData?.mrr_estime || 0} <span className="devise">€ / mois</span></p></div>
                          <div className="carte"><div className="carte-titre-container"><div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><h3>Salons Inscrits</h3></div><p className="montant">{superAdminData?.salons_actifs || 0} <span className="devise" style={{fontSize: '14px'}}>actifs sur {superAdminData?.total_salons || 0} au total</span></p></div>
                      </div>
                  ) : <div className="skeleton-loading" style={{height: '120px', marginBottom: '32px'}}></div>}

                  <div className="section-titre" style={{marginTop: '32px', color: '#aa3bff', borderColor: '#aa3bff'}}>Gestion des Salons (Clients)</div>
                  <div className="carte scan-carte">
                      {(superAdminSalons || []).map(salon => (
                          <div key={salon.id_salon} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)'}}>
                              <div>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                                      <strong style={{color: 'var(--text-main)', fontSize: '15px'}}>{salon.nom_salon}</strong><span style={{fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-secondary)'}}>ID: {salon.id_salon}</span>{salon.email === '2@gmail.com' && <span style={{fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#aa3bff', color: 'white'}}>Fondateur</span>}
                                  </div>
                                  <span style={{color: 'var(--text-secondary)', fontSize: '13px'}}>{salon.email}</span>
                              </div>
                              <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                                  <span className="badge-discret" style={{ background: salon.statut_abonnement === 'actif' ? 'var(--bg-success)' : 'var(--bg-danger)', color: salon.statut_abonnement === 'actif' ? 'var(--color-success)' : 'var(--color-danger)' }}>{salon.statut_abonnement === 'actif' ? 'Abonné (Actif)' : 'Inactif / Impayé'}</span>
                                  {salon.email !== '2@gmail.com' && ( 
                                      <div style={{display: 'flex', gap: '8px'}}>
                                          <button onClick={() => basculerStatutSalon(salon.id_salon, salon.statut_abonnement)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>{salon.statut_abonnement === 'actif' ? 'Couper l\'accès' : 'Activer de force'}</button>
                                          <button onClick={() => supprimerSalonAdmin(salon.id_salon, salon.nom_salon)} style={{background: 'var(--bg-danger)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}} title="Détruire ce salon">Supprimer</button>
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}
                      {(superAdminSalons || []).length === 0 && <div className="empty-state"><p>Aucun salon chargé.</p></div>}
                  </div>
                </div>
              )}
            </div>
      </div>
      {/* --- MENU OUTILS (BOTTOM SHEET MOBILE) DÉPLACÉ ICI POUR RÉSOUDRE LE FLOU SAFARI --- */}
      {isMobile && (
          <>
              <div className={`outils-bottom-sheet-overlay ${isOutilsMenuOpen ? 'open' : ''}`} onClick={() => setIsOutilsMenuOpen(false)}></div>
              <div className={`outils-bottom-sheet ${isOutilsMenuOpen ? 'open' : ''}`}>
                  <h3 style={{margin: '0 0 16px 0', fontSize: '18px', textAlign: 'center'}}>Outils & Gestion</h3>
                  <div className="outils-grid">
                      {(role === 'gerant' || role === 'salon') && (
                          <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('protocoles'); }}>
                              <div className="outil-btn-icon" style={{position:'relative'}}>{!aLeNiveau('PRO') && <span style={{position:'absolute', top:'-6px', right:'-6px', color:'var(--text-muted)', background:'var(--bg-app)', borderRadius:'50%', padding:'2px', display:'flex'}}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>}<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><span className="outil-btn-label">Académie</span>
                          </button>
                      )}
                      {(role === 'gerant' || role === 'salon') && (
                          <button className="outil-btn" onClick={() => {setActiveTab('produits'); setIsOutilsMenuOpen(false);}}>
                              <div className="outil-btn-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><span className="outil-btn-label">Stocks</span>
                          </button>
                      )}
                      {role === 'gerant' && (
                          <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('rh'); }}>
                              <div className="outil-btn-icon" style={{position:'relative'}}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><span className="outil-btn-label">Équipe</span>
                          </button>
                      )}
                      {(role === 'gerant' || role === 'salon') && (
                          <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('admin'); }}>
                              <div className="outil-btn-icon" style={{position:'relative'}}>{!aLeNiveau('PREMIUM') && <span style={{position:'absolute', top:'-6px', right:'-6px', color:'var(--text-muted)', background:'var(--bg-app)', borderRadius:'50%', padding:'2px', display:'flex'}}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>}<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><span className="outil-btn-label">Compta</span>
                          </button>
                      )}
                      {decodeToken(token)?.email === '2@gmail.com' && role === 'gerant' && (
                          <button className="outil-btn" onClick={() => {setActiveTab('superadmin'); setIsOutilsMenuOpen(false);}}>
                              <div className="outil-btn-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div><span className="outil-btn-label">God Mode</span>
                          </button>
                      )}
                      <button className="outil-btn" onClick={() => {setActiveTab('messagerie'); setIsOutilsMenuOpen(false);}} style={{position: 'relative'}}>
                          {aDesMessagesNonLus && <span className="badge-ia-rouge" style={{top: '-2px', right: '-2px'}}></span>}
                          <div className="outil-btn-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div><span className="outil-btn-label">Chat</span>
                      </button>
                      <button className="outil-btn" onClick={() => {seDeconnecter(); setIsOutilsMenuOpen(false);}}>
                          <div className="outil-btn-icon" style={{color:'var(--color-danger)'}}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div><span className="outil-btn-label" style={{color:'var(--color-danger)'}}>Quitter</span>
                      </button>
                  </div>
              </div>
          </>
      )}
      
      {/* --- MODALES GLOBALES --- */}
      {zDialogOuvert && (
          <div className="modal-overlay" style={{ zIndex: 100000 }}>
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '400px', paddingBottom: '30px'}}>
                  <div style={{color: 'var(--btn-primary)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>Clôture Journalière (Z)</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5'}}>Sélectionnez la personne responsable de la fermeture de la caisse ce soir.</p>
                  
                  <select className="input-fournisseur" value={zEmployeSelect} onChange={e => setZEmployeSelect(e.target.value)} style={{marginBottom: '24px', fontSize: '15px'}}>
                      <option value="">-- Sélectionnez votre nom --</option>
                      {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.nom}>{emp.nom}</option>)}
                  </select>

                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => { setZDialogOuvert(false); setZEmployeSelect(''); }} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Annuler</button>
                      <button onClick={() => executerZDeCaisse(zEmployeSelect)} disabled={!zEmployeSelect} style={{flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: zEmployeSelect ? 'pointer' : 'not-allowed', opacity: zEmployeSelect ? 1 : 0.5, transition: 'all 0.15s'}}>Générer le Z</button>
                  </div>
              </div>
          </div>
      )}

      {confirmDialog && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '400px'}}>
                  <div style={{color: 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>{confirmDialog.titre}</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5'}}>{confirmDialog.message}</p>
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setConfirmDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Annuler</button>
                      <button onClick={confirmDialog.action} style={{flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>{confirmDialog.btnTexte}</button>
                  </div>
              </div>
          </div>
      )}

      {modifStockDialog && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '360px'}}>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>Modifier le stock</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px'}}>{modifStockDialog.nom}</p>
                  <input type="number" min="0" value={modifStockDialog.valeur} onChange={(e) => setModifStockDialog({ ...modifStockDialog, valeur: e.target.value })} style={{width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '16px', textAlign: 'center'}} autoFocus />
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setModifStockDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Annuler</button>
                      <button onClick={confirmerModifStock} style={{flex: 1, background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Enregistrer</button>
                  </div>
              </div>
          </div>
      )}

      {modifNomDialog && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '360px'}}>
                  <h2 style={{margin: '0 0 20px 0', color: 'var(--text-main)', fontSize: '20px'}}>Renommer la prestation</h2>
                  <input type="text" value={modifNomDialog.nom} onChange={(e) => setModifNomDialog({ ...modifNomDialog, nom: e.target.value })} style={{width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '14px'}} autoFocus />
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setModifNomDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Annuler</button>
                      <button onClick={confirmerModifNom} disabled={!modifNomDialog.nom.trim()} style={{flex: 1, background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: modifNomDialog.nom.trim() ? 'pointer' : 'not-allowed', opacity: modifNomDialog.nom.trim() ? 1 : 0.5, transition: 'all 0.15s'}}>Enregistrer</button>
                  </div>
              </div>
          </div>
      )}

      {annulationDialog && (
          <div className="modal-overlay">
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '400px'}}>
                  <div style={{color: 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>Annuler ce paiement</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5'}}>Cette action génère un ticket de compensation (Loi NF525). Vous pouvez annuler le ticket entier ou sélectionner des articles spécifiques.</p>
                  
                  {annulationDialog.lignes && annulationDialog.lignes.length > 0 && (
                      <div style={{textAlign: 'left', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '16px', maxHeight: '150px', overflowY: 'auto'}}>
                          <div style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '8px'}}>ARTICLES REMBOURSABLES :</div>
                          {annulationDialog.lignes.map(ligne => {
                              const inList = annulationDialog.lignes_a_annuler.find(l => l.id_article === ligne.id_article);
                              const qte = inList ? inList.quantite : 0;
                              return (
                                  <div key={ligne.id_article} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px'}}>
                                      <div style={{display: 'flex', flexDirection: 'column'}}>
                                          <span style={{color: 'var(--text-main)', fontWeight: '500'}}>{ligne.nom_article_snapshot}</span>
                                          <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>{ligne.prix_unitaire_ttc} € / unité (Max: {ligne.quantite_restante})</span>
                                      </div>
                                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '2px'}}>
                                          <button onClick={() => {
                                              if (qte === 0) return;
                                              const newLignes = [...annulationDialog.lignes_a_annuler];
                                              if (qte === 1) {
                                                  setAnnulationDialog({...annulationDialog, lignes_a_annuler: newLignes.filter(l => l.id_article !== ligne.id_article)});
                                              } else {
                                                  const idx = newLignes.findIndex(l => l.id_article === ligne.id_article);
                                                  newLignes[idx].quantite -= 1;
                                                  setAnnulationDialog({...annulationDialog, lignes_a_annuler: newLignes});
                                              }
                                          }} style={{background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-main)'}}>-</button>
                                          <span style={{fontWeight: 'bold', minWidth: '16px', textAlign: 'center'}}>{qte}</span>
                                          <button onClick={() => {
                                              if (qte >= ligne.quantite_restante) return;
                                              const newLignes = [...annulationDialog.lignes_a_annuler];
                                              const idx = newLignes.findIndex(l => l.id_article === ligne.id_article);
                                              if (idx >= 0) newLignes[idx].quantite += 1;
                                              else newLignes.push({id_article: ligne.id_article, quantite: 1});
                                              setAnnulationDialog({...annulationDialog, lignes_a_annuler: newLignes});
                                          }} style={{background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-main)'}}>+</button>
                                      </div>
                                  </div>
                              );
                          })}
                          {annulationDialog.lignes_a_annuler.length === 0 && (
                              <div style={{fontSize: '11px', color: 'var(--color-danger)', marginTop: '8px', fontStyle: 'italic'}}>Aucun article sélectionné = Annulation totale du ticket.</div>
                          )}
                      </div>
                  )}

                  <textarea value={annulationDialog.motif} onChange={(e) => setAnnulationDialog({ ...annulationDialog, motif: e.target.value })} placeholder="Motif de l'annulation (ex : erreur de saisie, geste commercial...)" rows={3} style={{width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '13px', resize: 'vertical'}} autoFocus />
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setAnnulationDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'}}>Retour</button>
                      <button onClick={confirmerAnnulationTicket} disabled={!annulationDialog.motif.trim()} style={{flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: annulationDialog.motif.trim() ? 'pointer' : 'not-allowed', opacity: annulationDialog.motif.trim() ? 1 : 0.5, transition: 'all 0.15s'}}>Confirmer l'annulation</button>
                  </div>
              </div>
          </div>
      )}

      {cancellationRobot && (
          <div className="modal-overlay" style={{ zIndex: 10000 }}>
              <div className="modal-content" style={{textAlign: 'left', maxWidth: '500px', width: '90%'}}>
                  <div style={{color: '#f59e0b', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px', textAlign: 'center'}}>Détection de RDV</h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5', textAlign: 'center'}}>
                      <strong>{cancellationRobot.nom_employe}</strong> a <strong>{cancellationRobot.rdvs.length} RDV</strong> sur cette période. Décochez ceux que vous allez confier à un autre coiffeur, et annulez le reste.
                  </p>

                  <div style={{marginBottom: '16px'}}>
                      <label style={{fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block'}}>Message envoyé</label>
                      <textarea 
                          value={cancelMessageTemplate} 
                          onChange={(e) => setCancelMessageTemplate(e.target.value)}
                          style={{width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '13px', minHeight: '80px', resize: 'vertical'}}
                      />
                      <span style={{fontSize: '10px', color: 'var(--text-muted)'}}>Les balises [Prénom], [Date] et [Lien] s'adapteront à chaque client.</span>
                  </div>

                  <div style={{maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', marginBottom: '24px'}}>
                      {cancellationRobot.rdvs.map(rdv => {
                          const hasPhone = rdv.telephone_client && rdv.telephone_client.trim().length >= 9;
                          return (
                              <label key={rdv.id_rdv} style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', opacity: selectedCancelRdvs.includes(rdv.id_rdv) ? 1 : 0.6}}>
                                  <input 
                                      type="checkbox" 
                                      checked={selectedCancelRdvs.includes(rdv.id_rdv)} 
                                      onChange={() => {
                                          if (selectedCancelRdvs.includes(rdv.id_rdv)) {
                                              setSelectedCancelRdvs(selectedCancelRdvs.filter(id => id !== rdv.id_rdv));
                                          } else {
                                              setSelectedCancelRdvs([...selectedCancelRdvs, rdv.id_rdv]);
                                          }
                                      }}
                                      style={{width: '18px', height: '18px', accentColor: 'var(--btn-primary)'}}
                                  />
                                  <div style={{flex: 1}}>
                                      <div style={{fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between'}}>
                                          <span>{rdv.nom_client || 'Client inconnu'}</span>
                                          <span style={{fontSize: '12px', fontWeight: 'normal'}}>{new Date(rdv.date_heure_debut.replace('Z', '')).toLocaleString('fr-FR', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</span>
                                      </div>
                                      <div style={{fontSize: '12px', color: hasPhone ? 'var(--text-secondary)' : 'var(--color-danger)', fontWeight: hasPhone ? 'normal' : 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px'}}>
                                          {hasPhone ? `📞 ${rdv.telephone_client} - ${rdv.prestation}` : `⚠️ Aucun numéro - Appel manuel requis`}
                                      </div>
                                  </div>
                              </label>
                          )
                      })}
                  </div>

                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => { setCancellationRobot(null); chargerTout(); setRefreshTrigger(prev => prev + 1); }} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>
                          Ignorer
                      </button>
                      <button onClick={async () => {
                          try {
                              if (selectedCancelRdvs.length === 0) {
                                  showToast("Aucun rendez-vous sélectionné", "info");
                                  setCancellationRobot(null);
                                  chargerTout(); setRefreshTrigger(prev => prev + 1);
                                  return;
                              }
                              const res = await fetch('https://api-salon-backend.onrender.com/api/rdv/mass-cancel', {
                                  method: 'POST', headers: getAuthHeaders(true),
                                  body: JSON.stringify({ rdv_ids: selectedCancelRdvs, id_employe: cancellationRobot.id_employe, message_personnalise: cancelMessageTemplate })
                              });
                              const data = await handleFetchError(res);
                              showToast(data.message, "success");
                              setCancellationRobot(null);
                              chargerTout(); setRefreshTrigger(prev => prev + 1);
                          } catch (e) { showToast(e.message || "Erreur d'annulation", "error"); }
                      }} style={{flex: 2, background: 'var(--btn-primary)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>
                          Envoyer ({selectedCancelRdvs.length})
                      </button>
                  </div>
              </div>
          </div>
      )}

      {auditNf525 && (
          <div className="modal-overlay" style={{ zIndex: 100000 }}>
              <div className="modal-content" style={{textAlign: 'center', maxWidth: '450px'}}>
                  <div style={{color: auditNf525.conforme ? 'var(--color-success)' : 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}>
                      {auditNf525.conforme 
                          ? <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          : <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      }
                  </div>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px'}}>
                      {auditNf525.conforme ? "Base de données intègre" : "Altération détectée"}
                  </h2>
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5'}}>
                      {auditNf525.conforme 
                          ? "Le chaînage cryptographique est parfaitement valide. Aucune donnée financière n'a été altérée." 
                          : "Le système a détecté une rupture dans la chaîne cryptographique !"}
                  </p>
                  <div style={{background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '13px'}}>
                      <div style={{marginBottom: '8px'}}><strong>Tickets vérifiés :</strong> {auditNf525.total_tickets_verifies}</div>
                      <div style={{marginBottom: '8px'}}><strong>Clôtures (Z) vérifiées :</strong> {auditNf525.total_z_verifies}</div>
                      <div><strong>Journaux Techniques (JET) :</strong> {auditNf525.total_jet_verifies}</div>
                  </div>
                  
                  {auditNf525.erreurs && auditNf525.erreurs.length > 0 && (
                      <div style={{background: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '12px', maxHeight: '100px', overflowY: 'auto'}}>
                          {auditNf525.erreurs.map((err, i) => <div key={i}>• {err}</div>)}
                      </div>
                  )}
                  
                  {auditNf525.alertes && auditNf525.alertes.length > 0 && (
                      <div style={{background: 'var(--bg-info)', color: 'var(--color-info)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '12px', maxHeight: '100px', overflowY: 'auto'}}>
                          {auditNf525.alertes.map((al, i) => <div key={i}>• {al}</div>)}
                      </div>
                  )}

                  <button onClick={() => setAuditNf525(null)} className="btn-action" style={{width: '100%'}}>Fermer</button>
              </div>
          </div>
      )}

      {sauvetageClient && (
          <div className="modal-overlay" style={{ zIndex: 100000 }}>
              <div className="modal-content" style={{maxWidth: '400px'}}>
                  <h2 style={{margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '18px'}}>Sauver ce client</h2>
                  <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px'}}>Envoyez un SMS d'excuse avec une offre pour le faire revenir.</p>
                  <textarea className="input-fournisseur" rows={4} value={smsSauvetage} onChange={e => setSmsSauvetage(e.target.value)} style={{width: '100%', boxSizing: 'border-box', marginBottom: '16px', fontSize: '13px', resize: 'vertical'}} />
                  <div style={{display: 'flex', gap: '12px'}}>
                      <button onClick={() => setSauvetageClient(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Annuler</button>
                      <button onClick={envoyerSmsSauvetage} className="btn-action" style={{flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none'}}>Envoyer le SMS</button>
                  </div>
              </div>
          </div>
      )}

      {showPricingModal && (
          <PricingModal 
              onClose={() => setShowPricingModal(false)}
              isSoftLock={isSoftLock}
              isHardLock={isHardLock}
              joursRestants={joursRestantsEssai}
              token={token}
              onSubscribe={async (plan, cycle) => {
                  try {
                      const res = await fetch('https://api-salon-backend.onrender.com/api/creer-checkout', { 
                          method: 'POST', 
                          headers: getAuthHeaders(true), 
                          body: JSON.stringify({ plan_choisi: plan, cycle_choisi: cycle }) 
                      });
                      
                      const data = await res.json().catch(() => ({}));
                      
                      if (!res.ok) {
                          // On remplace le toast caché par une alerte native bloquante
                          alert(`🚨 STRIPE A BLOQUÉ : \n\n${data.erreur || "Erreur serveur"}`);
                          return;
                      }

                      if (data.url) {
                          window.location.href = data.url;
                      } else if (data.success) {
                          setShowPricingModal(false);
                          showToast(data.message, "success");
                      }
                  } catch (err) {
                      alert(`🚨 ERREUR RÉSEAU STRIPE : \n\n${err.message}`);
                  }
              }}
          />
      )}

            {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
    </>
  );
}

export default App;
