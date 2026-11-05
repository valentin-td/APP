import { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';
import './App.css';
import LiquidTabBar from './LiquidTabBar';
import Parametres from './Parametres';
import PopupLegal from './PopupLegal';   
import PricingModal from './PricingModal';
import { API_URL } from './api/config'; 

import './utils/fetchClient';
import { urlBase64ToUint8Array, decodeToken, isPinWeak } from './utils/auth';
import AvisPublic from './AvisPublic.jsx';
import PageReservationPublique from './pages/ReservationPublique.jsx';
import ThemeToggleComponent from './components/common/ThemeToggle.jsx';
import LoginView from './components/auth/LoginView.jsx';
import CaisseTab from './components/caisse/CaisseTab.jsx';
import ActionsTab from './components/actions/ActionsTab.jsx';
import AgendaTab from './components/agenda/AgendaTab.jsx';
import ProtocolesTab from './components/protocoles/ProtocolesTab.jsx';
import StocksTab from './components/stock/StocksTab.jsx';
import RHTab from './components/rh/RHTab.jsx';
import AdminTab from './components/admin/AdminTab.jsx';
import MessagerieTab from './components/chat/MessagerieTab.jsx';
import SuperAdminTab from './components/superadmin/SuperAdminTab.jsx';
import DashboardTab from './components/dashboard/DashboardTab.jsx';
import { getStatutBlocagePin as getStatutBlocagePinUtil, appliquerRetourPinLocal as appliquerRetourPinLocalUtil } from './utils/pin.js';
import AppHeaderBanners from './components/navigation/AppHeaderBanners.jsx';
import NavbarSidebar from './components/navigation/NavbarSidebar.jsx';
import BottomMenuOutils from './components/navigation/BottomMenuOutils.jsx';
import RegularisationZModal from './components/modals/RegularisationZModal.jsx';
import MouvementCaisseModal from './components/modals/MouvementCaisseModal.jsx';
import ClotureZDialog from './components/modals/ClotureZDialog.jsx';
import AnnulationTicketModal from './components/modals/AnnulationTicketModal.jsx';
import { ConfirmDialog, ModifStockDialog, ModifNomDialog, CancellationRobotDialog, AuditNf525Dialog, SauvetageClientDialog } from './components/modals/ActionDialogs.jsx';
import PointeuseModal from './components/modals/PointeuseModal.jsx';
import FusionStocksModal from './components/modals/FusionStocksModal.jsx';
import SaisieFactureManuelleModal from './components/modals/SaisieFactureManuelleModal.jsx';
import ModalIA from './components/modals/ModalIA.jsx';
import ValidationComptaModal from './components/modals/ValidationComptaModal.jsx';
import SimulateurIAButton from './components/common/SimulateurIAButton.jsx';
import ToastNotification from './components/common/ToastNotification.jsx';

import useInternalChat from './hooks/useInternalChat';
import useStocksReassort from './hooks/useStocksReassort';
import usePointeuseRH from './hooks/usePointeuseRH';
import useComptaValidation from './hooks/useComptaValidation';
import useAgendaPlanning from './hooks/useAgendaPlanning';
import useCaissePOS from './hooks/useCaissePOS';
import useMultiSalons from './hooks/useMultiSalons';
import { useFacturesOCR } from './hooks/useFacturesOCR';
import useClotureZ from './hooks/useClotureZ';
import useProtocolesCoiffure from './hooks/useProtocolesCoiffure';
import useEntitiesCRUD from './hooks/useEntitiesCRUD.jsx';
import useAuthSession from './hooks/useAuthSession';


function App() {
  if (window.location.pathname.startsWith('/avis/')) {
      return <AvisPublic token={window.location.pathname.split('/avis/')[1]} />;
  }
  if (window.location.pathname.startsWith('/reservation/') || new URLSearchParams(window.location.search).get('reservation')) {
      const idSalonPublic = window.location.pathname.startsWith('/reservation/')
          ? window.location.pathname.split('/reservation/')[1]?.split('/')[0]
          : new URLSearchParams(window.location.search).get('reservation');
      return <PageReservationPublique idSalon={idSalonPublic} />;
  }

  // --- GESTION DE SESSION & AUTHENTIFICATION (useAuthSession) ---
  const {
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
  } = useAuthSession({
    API_URL,
    setActiveTab: (t) => setActiveTab(t),
    showToast: (m, t) => showToast(m, t)
  });
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  // --- ÉTATS GLOBAUX DES MODULES 1, 3, 4 & 5 (PLACÉS EN HAUT POUR ÉVITER L'ERREUR REACT #310) ---
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sbToken = params.get('sandbox_token');
    const sbMode = params.get('sandbox_mode');
    if (sbToken) {
      localStorage.setItem('ui_token', sbToken);
      localStorage.setItem('api_token', sbToken);
      if (sbMode === 'DEMO' || sbMode === 'VIDE') {
        localStorage.setItem('skip_legal_sandbox', 'true');
      } else {
        localStorage.removeItem('skip_legal_sandbox');
      }
      window.history.replaceState({}, document.title, window.location.pathname + (params.get('partner') ? `?partner=${params.get('partner')}` : ''));
      window.location.reload();
    }
  }, []);

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
      const noop = () => {};
      document.addEventListener('touchstart', noop, { passive: true });
      return () => document.removeEventListener('touchstart', noop);
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
          document.body.classList.add('dark-mode'); document.documentElement.classList.add('dark-mode');
          document.documentElement.style.backgroundColor = '#0b0b0d'; // Force le fond racine
          document.body.style.backgroundColor = '#0b0b0d'; // Fix: Force le fond iOS
          metaThemeColor.setAttribute('content', '#0b0b0d'); // Colore la barre iOS/Android
          localStorage.setItem('theme', 'dark');
      } else {
          document.body.classList.remove('dark-mode'); document.documentElement.classList.remove('dark-mode');
          document.documentElement.style.backgroundColor = '#f6f6f7';
          document.body.style.backgroundColor = '#f6f6f7'; // Fix: Force le fond iOS
          metaThemeColor.setAttribute('content', '#f6f6f7');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  const ThemeToggle = ({ isFixed }) => (
    <ThemeToggleComponent isFixed={isFixed} isDarkMode={isDarkMode} onToggle={() => setIsDarkMode(!isDarkMode)} />
  );



  const [activeTab, setActiveTab] = useState('accueil');
  const [dashboardData, setDashboardData] = useState(null);
  const [avisStats, setAvisStats] = useState(null);
  const [salonDashboardData, setSalonDashboardData] = useState(null);
  const [employeDashboardData, setEmployeDashboardData] = useState(null);
  const [rhData, setRhData] = useState([]);
  const [absencesRH, setAbsencesRH] = useState([]);
  const [historiqueData, setHistoriqueData] = useState([]);
  const [expandedYear, setExpandedYear] = useState(new Date().getFullYear().toString());
  const [expandedMonth, setExpandedMonth] = useState(["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][new Date().getMonth()]);
  const [planningData, setPlanningData] = useState([]); 
  const [superAdminData, setSuperAdminData] = useState(null);
  const [superAdminSalons, setSuperAdminSalons] = useState([]);

  // --- GESTION DES ENTITÉS : CLIENTS, EMPLOYÉS, ARTICLES & EXPORTS (useEntitiesCRUD) ---
  const {
    clientsListe,
    setClientsListe,
    showAddClient,
    setShowAddClient,
    newClient,
    setNewClient,
    clientSelectionne,
    setClientSelectionne,
    clientHistorique,
    setClientHistorique,
    chargementFiche,
    setChargementFiche,
    ajouterClient,
    supprimerClient,
    ouvrirFicheClient,
    sauvegarderNotesClient,
    employesListe,
    setEmployesListe,
    showAddEmploye,
    setShowAddEmploye,
    employeMenuOuvert,
    setEmployeMenuOuvert,
    modifEmployeDialog,
    setModifEmployeDialog,
    newEmploye,
    setNewEmploye,
    handleImageUpload,
    ajouterEmploye,
    supprimerEmploye,
    sauvegarderModifEmploye,
    modifierMaPhoto,
    catalogueListe,
    setCatalogueListe,
    stocksData,
    setStocksData,
    showAddProduit,
    setShowAddProduit,
    stockSearch,
    setStockSearch,
    stockSortBy,
    setStockSortBy,
    isStockExpanded,
    setIsStockExpanded,
    isTachesTermineesExpanded,
    setIsTachesTermineesExpanded,
    stockMenuOuvert,
    setStockMenuOuvert,
    modifStockDialog,
    setModifStockDialog,
    modifNomDialog,
    setModifNomDialog,
    newArticle,
    setNewArticle,
    ajouterArticle,
    supprimerArticle,
    confirmerModifNom,
    confirmerModifStock,
    validerVerifStock,
    afficherRappelStock,
    getStockStatus,
    getTendanceStock,
    dessinerCourbe,
    dessinerChronogramme,
    auditNf525,
    setAuditNf525,
    declencherExport,
    lancerAuditNF525,
    declencherExportFEC,
    telechargerBilanJour
  } = useEntitiesCRUD({
    token,
    userRole,
    isOffline,
    showToast,
    getAuthHeaders,
    handleFetchError,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); },
    setIsAbonnementInactif,
    configSalon,
    setConfigSalon,
    heureActuelle: new Date(),
    API_URL,
    decodeToken,
    isPinWeak
  });

  // --- SYNCHRONISATION GAMIFICATION & OBJECTIFS D'ÉQUIPE (REMONTÉ POUR ÉVITER REACT #310) ---
  const chargerObjectifsEquipe = async () => {
      try {
          const res = await fetch(`${API_URL}/api/equipe/objectifs`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('api_token') || token}` }
          });
          if (res.ok) {
              const data = await res.json();
              setObjectifsEquipeListe(Array.isArray(data) ? data : []);
          }
      } catch (e) {}
  };

  useEffect(() => {
      const currentRole = userRole;
      if (currentRole === 'employe' && token && activeTab === 'accueil') {
          fetch(`${API_URL}/api/employes/gamification-kpis`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('api_token') || token}` }
          })
              .then(r => r.ok ? r.json() : null)
              .then(data => { if (data) setEmpGamificationKpis(data); })
              .catch(() => {});
      }
      if (currentRole === 'gerant' && token && activeTab === 'rh') {
          chargerObjectifsEquipe();
      }
  }, [userRole, token, activeTab]);

  // --- ÉTATS & LOGIQUE : GESTION MULTI-SALONS & FRANCHISE ---
  const {
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
  } = useMultiSalons({
    token,
    setToken,
    configSalon,
    getAuthHeaders,
    handleFetchError,
    showToast,
    setDashboardData,
    setPosEmploye,
    setPanierCaisse
  });
  const [tachesListe, setTachesListe] = useState([]);
  const [nouvelleTache, setNouvelleTache] = useState({ titre: '', description: '', date_echeance: '' });
  const [sauvetageClient, setSauvetageClient] = useState(null);
  const [smsSauvetage, setSmsSauvetage] = useState('');
  const [remiseSauvetage, setRemiseSauvetage] = useState('');
  const [rhSortBy, setRhSortBy] = useState('ca');
  const [rhPeriodeHeures, setRhPeriodeHeures] = useState('mois');
  const [rhAvisExpanded, setRhAvisExpanded] = useState({});
  const [isStockMergeMode, setIsStockMergeMode] = useState(false);
  const [selectedStocksToMerge, setSelectedStocksToMerge] = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeForm, setMergeForm] = useState({ nom: '', reference: '', prix: '', type_article: 'PRODUIT_REVENTE', delai_livraison_jours: 3, id_employe: '', code_pin: '' });
  const [erreurPinAction, setErreurPinAction] = useState(null);
    const [checklistOnboarding, setChecklistOnboarding] = useState({
    etape_materiel_ok: false,
    etape_catalogue_ok: false,
    etape_equipe_ok: false,
    etape_stripe_ok: false,
    etape_formation_ok: false,
    statut_onboarding: 'EN_COURS' // Bloqué par défaut
  });

  
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  
  // Chargement automatique et systématique du verrou Go-Live dès qu'un token est présent
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/onboarding/checklist`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`,
        'Content-Type': 'application/json'
      }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
          'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      if (res.ok) {
        const saved = await res.json();
        setChecklistOnboarding(saved);
        if (saved.statut_onboarding === 'TERMINE' && typeof showToast === 'function') {
          showToast("Checklist Go-Live complétée à 100 % ! Votre caisse est déverrouillée.");
        }
      }
    } catch (e) {}
  };
    
  const envoyerSmsSauvetage = async () => {
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
              showToast("Offre de sauvetage envoyée et enregistrée !", "success"); 
              setSauvetageClient(null); 
              setRemiseSauvetage('');
              chargerTout();
          } else { 
              const data = await res.json(); 
              showToast(data.erreur || "Erreur d'envoi", "error"); 
          }
      } catch(e) { 
          showToast("Erreur réseau", "error"); 
      }
  };
  

  // --- ÉTATS & LOGIQUE : POINTEUSE NUMÉRIQUE ---
  const {
    pointeuse,
    setPointeuse,
    buttonsDisabled,
    setButtonsDisabled,
    statutsEquipe,
    setStatutsEquipe,
    handlePointeusePin,
    enregistrerPointage,
    chargerStatutsPointage,
    debloquerPinEmploye,
    getStatutPointageEmploye
  } = usePointeuseRH({
    token,
    configSalon,
    employesListe,
    setEmployesListe,
    getAuthHeaders,
    showToast,
    chargerTout: () => { if (typeof chargerTout === 'function') chargerTout(); },
    getStatutBlocagePin: (empId) => getStatutBlocagePinUtil(employesListe, empId)
  });

  // --- ÉTATS & LOGIQUE : SCANNER CODE-BARRES & RÉASSORT FOURNISSEURS (useStocksReassort) ---
  const {
    scannerModalMode,
    setScannerModalMode,
    codeBarreManuel,
    setCodeBarreManuel,
    dernierProduitScanne,
    setDernierProduitScanne,
    showReassortModal,
    setShowReassortModal,
    lignesReassort,
    setLignesReassort,
    fournisseurCommande,
    setFournisseurCommande,
    emailFournisseurCommande,
    setEmailFournisseurCommande,
    noteCommande,
    setNoteCommande,
    isSendingCommande,
    emettreBipScan,
    fermerScannerCodeBarre,
    traiterCodeBarreDetecte,
    ouvrirScannerCodeBarre,
    produitsEnAlerteStock,
    ouvrirModaleReassort,
    changerFournisseurReassort,
    copierListeReassort,
    telechargerBonCommandePdf,
    envoyerBonCommandeParMail
  } = useStocksReassort({
    catalogueListe,
    configSalon,
    token,
    showToast,
    setShowAddProduit,
    setNewArticle
  });



  const [messagesListe, setMessagesListe] = useState([]);
  // --- ÉTATS & LOGIQUE : MESSAGERIE INTERNE (useInternalChat) ---
  const {
    chatActif,
    setChatActif,
    msgInput,
    setMsgInput,
    msgFile,
    setMsgFile,
    editingMsgId,
    setEditingMsgId,
    editMsgContent,
    setEditMsgContent,
    activeMenuId,
    setActiveMenuId,
    activeReactionId,
    setActiveReactionId,
    vuParOuvertMsgId,
    setVuParOuvertMsgId,
    replyToMsg,
    setReplyToMsg,
    isRecordingAudio,
    recordingSeconds,
    messagesEndRef,
    chatMessagesRef,
    nonLusParConv,
    aDesMessagesNonLus,
    contactsTries,
    formatDateSeparateur,
    resoudreProfilVu,
    handleChatFileUpload,
    demarrerEnregistrementVocal,
    arreterEnregistrementVocal,
    annulerEnregistrementVocal,
    envoyerMessage,
    demarrerEdition,
    validerEdition,
    demanderSuppressionMessage,
    toggleReaction
  } = useInternalChat({
    token,
    role: userRole,
    employesListe,
    messagesListe,
    setMessagesListe,
    activeTab,
    showToast,
    getAuthHeaders,
    chargerTout: () => { if (typeof chargerTout === 'function') chargerTout(); },
    handleFetchError,
    setConfirmDialog
  });
  const TAGS_DISPONIBLES = ['Coloration', 'Soin', 'Technique', 'Barbier', 'Coupe'];


  
  const [erreur, setErreur] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);


  const [toast, setToast] = useState(null);

  // Intercepte les retours de Stripe (Paiement ou Prise d'empreinte CB 0 € à l'installation)
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const paiementStatus = params.get('paiement');
      const sessionId = params.get('session_id');
      const planUrl = params.get('plan');

      if (paiementStatus === 'succes' || paiementStatus === 'empreinte_ok') {
          fetch(`${API_URL}/api/stripe/confirmer-session`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`
              },
              body: JSON.stringify({ session_id: sessionId, plan: planUrl })
          })
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                  setChecklistOnboarding(prev => ({ ...prev, etape_stripe_ok: true }));
                  if (typeof chargerTout === 'function') chargerTout();
                  setToast({
                      message: data?.message || "Empreinte bancaire Stripe validée (0 € aujourd'hui) ! Étape 4 Go-Live cochée.",
                      type: 'success'
                  });
                  setTimeout(() => setToast(null), 5000);
              })
              .catch(() => {});
          window.history.replaceState({}, document.title, "/");
      } else if (paiementStatus === 'annule') {
          setToast({ message: "Enregistrement de l'empreinte bancaire annulé.", type: 'error' });
          setTimeout(() => setToast(null), 4000);
          window.history.replaceState({}, document.title, "/");
      }
  }, []);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [annulationDialog, setAnnulationDialog] = useState(null);
  const [cancellationRobot, setCancellationRobot] = useState(null);

  // --- ÉTATS & LOGIQUE : CERTIFICATION COMPTABLE & SIGNATURE (useComptaValidation) ---
  const {
    statutMoisPrecedent,
    setStatutMoisPrecedent,
    showModalValidationCompta,
    setShowModalValidationCompta,
    checklistCompta,
    setChecklistCompta,
    pinValidationCompta,
    setPinValidationCompta,
    isValidatingCompta,
    hasSignedCompta,
    setHasSignedCompta,
    signatureCanvasRef,
    isDrawingSignatureRef,
    demarrerTraceSignature,
    dessinerTraceSignature,
    arreterTraceSignature,
    effacerSignatureCompta,
    chargerStatutMoisCompta,
    previsualiserBrouillon,
    validerEtEnvoyerMois
  } = useComptaValidation({
    token,
    isOffline,
    showToast,
    getAuthHeaders,
    handleFetchError
  });

  const [selectedCancelRdvs, setSelectedCancelRdvs] = useState([]);
  const [cancelMessageTemplate, setCancelMessageTemplate] = useState('');

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
          const response = await fetch(`${API_URL}/api/push/vapid-key`);
          const data = await response.json();
          const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

          // 2. On génère le ticket d'abonnement de cet appareil
          const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey
          });

          // 3. On l'envoie au serveur
          const resSub = await fetch(`${API_URL}/api/push/subscribe`, {
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
  


    const [mouvementsCaisse, setMouvementsCaisse] = useState([]);
    const [showMouvementModal, setShowMouvementModal] = useState(false);
    const [newMouvement, setNewMouvement] = useState({ type_mouvement: 'SORTIE', montant: '', motif: '', id_employe: '' });

    // Nouveaux états pour le mode calculatrice de la Petite Caisse
    const [modeCalculatrice, setModeCalculatrice] = useState(false);
    const [ongletCalculatrice, setOngletCalculatrice] = useState('MONNAIES');
    const [detailsMonnaie, setDetailsMonnaie] = useState({ b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '', p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: '' });

    useEffect(() => {
        if (modeCalculatrice) {
            const total = ((parseInt(detailsMonnaie.b500)||0) * 500) + ((parseInt(detailsMonnaie.b200)||0) * 200) + ((parseInt(detailsMonnaie.b100)||0) * 100) +
                          ((parseInt(detailsMonnaie.b50)||0) * 50) + ((parseInt(detailsMonnaie.b20)||0) * 20) + ((parseInt(detailsMonnaie.b10)||0) * 10) + ((parseInt(detailsMonnaie.b5)||0) * 5) +
                          ((parseInt(detailsMonnaie.p2)||0) * 2) + ((parseInt(detailsMonnaie.p1)||0) * 1) + ((parseInt(detailsMonnaie.p050)||0) * 0.50) + ((parseInt(detailsMonnaie.p020)||0) * 0.20) +
                          ((parseInt(detailsMonnaie.p010)||0) * 0.10) + ((parseInt(detailsMonnaie.p005)||0) * 0.05) + ((parseInt(detailsMonnaie.p002)||0) * 0.02) + ((parseInt(detailsMonnaie.p001)||0) * 0.01);
            setNewMouvement(prev => ({ ...prev, montant: total > 0 ? total.toFixed(2) : '' }));
        }
    }, [detailsMonnaie, modeCalculatrice]);

    const chargerMouvementsCaisse = async () => {
        try {
            const res = await fetch(`${API_URL}/api/caisse/mouvements/aujourdhui`, { headers: getAuthHeaders(true) });
            if (res.ok) setMouvementsCaisse(await res.json());
        } catch (e) {}
    };

    const ajouterMouvementCaisse = async () => {
        if (!newMouvement.motif.trim() || !newMouvement.montant) return showToast("Veuillez remplir le montant et le motif.", "error");
        try {
            const res = await fetch(`${API_URL}/api/caisse/mouvements`, {
                method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newMouvement)
            });
            await handleFetchError(res);
            showToast("Mouvement enregistré.", "success");
            setShowMouvementModal(false);
            setNewMouvement({ type_mouvement: 'SORTIE', montant: '', motif: '', id_employe: '', code_pin: '' });
            setModeCalculatrice(false);
            setDetailsMonnaie({ b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '', p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: '' });
            chargerMouvementsCaisse();
        } catch (e) { 
            setNewMouvement({ ...newMouvement, code_pin: '' });
            showToast(e.message, "error"); 
        }
    };



  // --- ÉTATS & LOGIQUE : CAISSE ENREGISTREUSE SMART POS NF525 (useCaissePOS) ---
  const {
    posStep,
    setPosStep,
    posEmploye,
    setPosEmploye,
    posType,
    setPosType,
    rechercheCaisse,
    setRechercheCaisse,
    clientCaisse,
    setClientCaisse,
    panierCaisse,
    setPanierCaisse,
    remiseAppliquee,
    setRemiseAppliquee,
    pourboireCaisse,
    setPourboireCaisse,
    showPourboireInput,
    setShowPourboireInput,
    methodePaiement,
    setMethodePaiement,
    clientsSuggeres,
    setClientsSuggeres,
    notificationCaisse,
    setNotificationCaisse,
    ticketGenere,
    setTicketGenere,
    emailTicketClient,
    setEmailTicketClient,
    telephoneTicketClient,
    setTelephoneTicketClient,
    sousTotalCaisse,
    totalCaisse,
    montantPourboireFinal,
    clientCaisseObj,
    isEligibleFidelite,
    texteRecompense,
    isWinbackOffer,
    ajouterAuPanier,
    retirerDuPanier,
    handleSelectEmployeCaisse,
    validerEncaisser,
    lancerPaiementTPE,
    envoyerTicketEco,
    annulerTicket,
    confirmerAnnulationTicket
  } = useCaissePOS({
    token,
    isOffline,
    setIsOffline,
    configSalon,
    clientsListe,
    employesListe,
    planningData,
    getAuthHeaders,
    handleFetchError,
    showToast,
    chargerTout: () => { if (typeof chargerTout === 'function') chargerTout(); },
    setAnnulationDialog,
    annulationDialog,
    clientSelectionne,
    ouvrirFicheClient
  });
  
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

  // --- ÉTATS & LOGIQUE : PROTOCOLES COIFFURE ET FICHES TECHNIQUES (useProtocolesCoiffure) ---
  const {
    protocolesListe,
    setProtocolesListe,
    nouveauProtocole,
    setNouveauProtocole,
    ingredientTemp,
    setIngredientTemp,
    etapeTemp,
    setEtapeTemp,
    protocoleVisible,
    setProtocoleVisible,
    modeEditionProtocole,
    setModeEditionProtocole,
    rechercheProtocole,
    setRechercheProtocole,
    showAddPrestation,
    setShowAddPrestation,
    compresserImageProtocole,
    normaliserEtapeUI,
    calculerIngredientsTotauxProtocole,
    ajouterIngredientBrouillonEtape,
    ajouterIngredientSurEtapeExistante,
    supprimerIngredientDuneEtape,
    modifierChampEtapeExistante,
    uploaderPhotoSurEtape,
    ajouterEtapeRecette,
    supprimerEtapeRecette,
    deplacerEtapeRecette,
    toggleTag,
    ajouterTagProtocole,
    supprimerTagProtocole,
    uploadMediaProtocole,
    creerProtocole,
    supprimerProtocole,
    handleImageUploadProtocole
  } = useProtocolesCoiffure({
    catalogueListe,
    isOffline,
    showToast,
    getAuthHeaders,
    handleFetchError,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); },
    API_URL
  });

  // --- ÉTATS & LOGIQUE : AGENDA PLANNING & ABSENCES (useAgendaPlanning) ---
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const {
    semaineOffset,
    setSemaineOffset,
    filtresEmployes,
    setFiltresEmployes,
    expandedAbsenceDate,
    setExpandedAbsenceDate,
    showModalRdv,
    setShowModalRdv,
    formRdv,
    setFormRdv,
    showDropdownClient,
    setShowDropdownClient,
    showDropdownPresta,
    setShowDropdownPresta,
    showModalAbsence,
    setShowModalAbsence,
    ongletAbsence,
    setOngletAbsence,
    isSubmittingAbsence,
    formAbsence,
    setFormAbsence,
    rdvSelectionne,
    setRdvSelectionne,
    isEditingRdv,
    setIsEditingRdv,
    editRdvForm,
    setEditRdvForm,
    getClientsSuggeresPourRdv,
    getPrestationsSuggeresPourRdv,
    ouvrirRdvSelectionne,
    creerRdvManuel,
    sauvegarderModifRdv,
    demanderSuppressionRdv,
    handleUploadJustificatifAbsence,
    soumettreAbsence,
    demanderAbsence
  } = useAgendaPlanning({
    token,
    isOffline,
    employesListe,
    catalogueListe,
    clientsListe,
    getAuthHeaders,
    handleFetchError,
    showToast,
    setRefreshTrigger,
    setConfirmDialog,
    setCancellationRobot,
    setSelectedCancelRdvs,
    setCancelMessageTemplate,
    protocoleVisible,
    setProtocoleVisible,
    chargerTout: () => { if (typeof chargerTout === 'function') chargerTout(); }
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

  // --- ÉTATS & LOGIQUE : ANALYSE OCR & TÂCHES IA (useFacturesOCR) ---
  const {
    tachesIA,
    setTachesIA,
    modalIA,
    setModalIA,
    fileAttenteIA,
    setFileAttenteIA,
    showSimIAMenu,
    setShowSimIAMenu,
    erreurAnalyseIA,
    setErreurAnalyseIA,
    isUploadingFacture,
    setIsUploadingFacture,
    progressionBatch,
    setProgressionBatch,
    showSaisieManuelleFacture,
    setShowSaisieManuelleFacture,
    formFactureManuelle,
    setFormFactureManuelle,
    isSalonDemoActif,
    verifierTachesIAEnBase,
    passerAuDocumentSuivant,
    genererFactureExempleUrl,
    lancerSimulationIA,
    validerTacheIA,
    ignorerTacheIA,
    handleUploadFactureManuel,
    enregistrerFactureManuelle
  } = useFacturesOCR({
    token,
    role: userRole,
    configSalon,
    employesListe,
    catalogueListe,
    stocksData,
    isAbonnementInactif,
    showToast,
    getAuthHeaders,
    handleFetchError,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); },
    setRefreshTrigger,
    setCancellationRobot,
    setSelectedCancelRdvs,
    setCancelMessageTemplate,
    appliquerRetourPinLocal: (empId, err) => appliquerRetourPinLocalUtil(setEmployesListe, empId, err),
    setErreurPinAction,
    API_URL,
    decodeToken
  });

  const formatDateComplete = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formatDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isToday = (d) => { const today = new Date(); return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }
  const getAuthHeaders = (isJson = false) => { const headers = {}; if (isJson) headers['Content-Type'] = 'application/json'; return headers; };
  
  const handleFetchError = async (res) => {
      const data = await res.json().catch(() => ({})); 

      if (res.status === 403 && data.require_upsell) {
          throw new Error("Forfait insuffisant");
      }
      if (res.status === 403 && !data.require_upsell) {
          throw new Error(data.erreur || "Accès refusé");
      }
      if (res.status === 401) { 
          seDeconnecter(); 
          throw new Error("Session expirée"); 
      } 
      if (res.status === 402) { 
          setIsAbonnementInactif(true); 
          throw new Error("Abonnement inactif"); 
      } 
      if (!res.ok) {
          if (data.require_pin) {
              setErreurPinAction(data.erreur || "Code PIN incorrect.");
              if (typeof chargerTout === 'function') chargerTout();
          }
          const err = new Error(data.erreur || "Erreur serveur");
          err.data = data;
          throw err; 
      }
      setErreurPinAction(null);
      return data; 
  };

  const formatNomClient = (client) => {
      if (!client) return 'Client inconnu';
      if (client.prenom && client.nom) return `${client.prenom} ${client.nom}`;
      return client.nom || 'Client sans nom';
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
                  res = await fetch(`${API_URL}/api/caisse/payer`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(ticket) });
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

  // --- RÉCUPÉRATION DES STATUTS DE POINTAGE (Géré par usePointeuseRH) ---
  const chargerTout = () => {
    const role = decodeToken(token)?.role;

    // Appel direct de notre nouvelle fonction pour que la caisse connaisse les statuts !
    chargerStatutsPointage();

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
                nom_salon: d?.nom_salon || '', forme_juridique: d?.forme_juridique || '', siret: d?.siret || '', adresse_salon: d?.adresse_salon || '', tva_intra: d?.tva_intra || '',
                google_api_key: d?.google_api_key || '', google_account_id: d?.google_account_id || '', google_location_id: d?.google_location_id || '', email_factures: d?.email_reception_factures || '', mot_de_passe_email: d?.mot_de_passe_app_email || '', brevo_api_key: d?.brevo_api_key || '', sms_sender_name: d?.sms_sender_name || 'MonSalon', lien_google_maps: d?.lien_google_maps || '', stripe_reader_id: d?.stripe_reader_id || '', heure_ouverture: d?.heure_ouverture || 8, heure_fermeture: d?.heure_fermeture || 20,
                fidelite_type: d?.fidelite_type || 'NONE', fidelite_points_seuil: d?.fidelite_points_seuil || 100, fidelite_points_valeur: d?.fidelite_points_valeur || 10, fidelite_tampons_seuil: d?.fidelite_tampons_seuil || 10, fidelite_recompense_type: d?.fidelite_recompense_type || 'MONTANT', fidelite_recompense_valeur: d?.fidelite_recompense_valeur || '10', fidelite_delai_sms: d?.fidelite_delai_sms || 60,
                telephone_gerant: d?.telephone_gerant || '', alertes_sms_actives: d?.alertes_sms_actives || false, email_comptable: d?.email_comptable || '', jour_envoi_bilan: d?.jour_envoi_bilan || 1, derniere_verif_stock: d?.derniere_verif_stock || null, pin_salon: (d?.pin_salon && !String(d.pin_salon).startsWith('$2')) ? d.pin_salon : '', securite_pin_salon_active: d?.securite_pin_salon_active !== false, temps_nettoyage_minutes: d?.temps_nettoyage_minutes || 0,
                plan_actuel: d?.plan_actuel || 'PREMIUM_TRIAL', date_fin_essai: d?.date_fin_essai || null, pennylane_api_key: d?.pennylane_api_key || '', mode_suivi_heures: d?.mode_suivi_heures || 'MANUEL',
                comptes_emails: Array.isArray(d?.comptes_emails) ? d.comptes_emails : (d?.email_reception_factures ? [{ email: d.email_reception_factures, mot_de_passe: d.mot_de_passe_app_email || '' }] : [])
            };
            setConfigSalon(config);
            await localforage.setItem('configSalon', config);
        }).catch(async () => {
            const cachedConf = await localforage.getItem('configSalon');
            if(cachedConf) setConfigSalon(cachedConf);
        });

    if (role === 'employe') return;

    setDashboardData(null); 
    fetchAndCache('/api/dashboard', setDashboardData, 'dashboardData', 'object');
    fetchAndCache('/api/avis/stats', setAvisStats, 'avisStats', 'object');
    fetchAndCache('/api/catalogue', setCatalogueListe, 'catalogueListe');
    fetchAndCache('/api/stocks', setStocksData, 'stocksData');
    if (role === 'gerant') {
        fetchAndCache('/api/rh', setRhData, 'rhData');
        chargerMesSalons();
    }
    fetchAndCache('/api/rh/absences', setAbsencesRH, 'absencesRH');
    fetchAndCache('/api/clients', setClientsListe, 'clientsListe');
    fetchAndCache('/api/protocoles', setProtocolesListe, 'protocolesListe');

    if (decodeToken(token)?.id_salon === 38) {
        fetchAndCache('/api/superadmin/stats', setSuperAdminData, 'superAdminData', 'object');
        fetchAndCache('/api/superadmin/salons', setSuperAdminSalons, 'superAdminSalons');
    }
  };

  useEffect(() => {
      if (token && !isAbonnementInactif) { 
          const user = decodeToken(token); setUserRole(user?.role || 'gerant');
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
                  transports: ['websocket', 'polling'], // ESSENTIEL : Permet de basculer en HTTP si le WebSocket est bloqué par Render
                  reconnectionAttempts: 10,
                  timeout: 10000, // Augmenté pour éviter que Render ne coupe la connexion trop vite
                  withCredentials: true,
                  auth: { token: localStorage.getItem('api_token') }
              });
              newSocket.on('connect', () => {
                  newSocket.emit('rejoindreSalon', user.id_salon);
              });
              newSocket.on('paiementValide', (data) => { showToast(data.message, "success"); if(user.role === 'gerant') chargerTout(); });
              newSocket.on('nouveauRDV', () => { setRefreshTrigger(prev => prev + 1); });
              newSocket.on('nouveauMessage', (data) => {
                  // Filtrage de sécurité côté client : un employé ignore les messages privés qui ne le concernent pas
                  if (user.role === 'employe' && data.id_destinataire !== 0 && data.id_expediteur !== user.id_employe && data.id_destinataire !== user.id_employe) {
                      return;
                  }
                  setMessagesListe(prev => {
                      const liste = prev || [];
                      if (liste.some(m => Number(m.id_message) === Number(data.id_message))) return liste;
                      return [...liste, data];
                  });
              });
              newSocket.on('messageModifie', (data) => { setMessagesListe(prev => (prev || []).map(m => Number(m.id_message) === Number(data.id_message) ? { ...m, contenu: data.contenu } : m)); });
              newSocket.on('messageSupprime', (data) => { setMessagesListe(prev => (prev || []).filter(m => Number(m.id_message) !== Number(data.id_message))); });
              newSocket.on('messageReaction', (data) => { setMessagesListe(prev => (prev || []).map(m => Number(m.id_message) === Number(data.id_message) ? { ...m, reactions: data.reactions } : m)); });
              newSocket.on('messageVu', (data) => {
                  setMessagesListe(prev => (prev || []).map(m => {
                      if (Number(m.id_message) !== Number(data.id_message)) return m;
                      const existants = Array.isArray(m.vu_par) ? m.vu_par : [];
                      const nouveaux = Array.isArray(data.vu_par) ? data.vu_par : [];
                      return { ...m, vu_par: Array.from(new Set([...existants, ...nouveaux])) };
                  }));
              });
              
              // ÉCOUTE TEMPS RÉEL (Synchronisation instantanée des statuts et du chronomètre)
              newSocket.on('statutPointageUpdate', (data) => {
                  setStatutsEquipe(prev => ({ ...prev, [data.id_employe]: { action: data.type_action, heure: data.heure } }));
              });
              
              newSocket.on('connect_error', () => {});
              setSocket(newSocket);
              return () => newSocket.disconnect();
          }
      } 
  }, [token, isAbonnementInactif, isOffline]);







  const sauvegarderParametres = async (customConfig = null) => {
      if(isOffline || !navigator.onLine) return showToast("Action impossible hors-ligne.", "error");
      const sourceConfig = (customConfig && typeof customConfig === 'object' && !customConfig.nativeEvent && !customConfig.target) ? customConfig : configSalon;
      if(sourceConfig.pin_salon && !String(sourceConfig.pin_salon).startsWith('$2') && isPinWeak(sourceConfig.pin_salon)) {
          return showToast("Le code PIN du salon est trop simple (évitez 0000, 1234...).", "error");
      }
      
      try { 
          const payload = { ...sourceConfig };
          payload.securite_pin_salon_active = sourceConfig.securite_pin_salon_active !== false; 
          if (userRole !== 'gerant') {
              delete payload.pin_salon;
              delete payload.securite_pin_salon_active;
          }
          
          const response = await fetch(`${API_URL}/api/settings`, { 
              method: 'POST', 
              headers: getAuthHeaders(true), 
              body: JSON.stringify(payload) 
          }); 
          await handleFetchError(response); 
          
          setConfigSalon(prev => ({ ...prev, ...sourceConfig, securite_pin_salon_active: sourceConfig.securite_pin_salon_active !== false }));
          showToast("Vos paramètres ont bien été enregistrés.", "success");
          chargerTout(); 
          return true;
      } catch (error) { 
          console.error("Erreur Sauvegarde Paramètres :", error);
          if(error.message !== "Abonnement inactif") {
              showToast(`Erreur : ${error.message || "Impossible d'enregistrer"}`, "error");
          }
          return false;
      }
  };


  // --- FONCTIONS : WORKFLOW DE VALIDATION COMPTABLE (useComptaValidation) ---
  useEffect(() => {
      if (activeTab === 'admin') {
          chargerStatutMoisCompta();
          chargerMouvementsCaisse();
      }
  }, [activeTab]);

  



  // --- ÉTATS & LOGIQUE : CLÔTURE Z ET RÉGULARISATION NF525 (useClotureZ) ---
  const {
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
  } = useClotureZ({
    token,
    userRole,
    configSalon,
    employesListe,
    isOffline,
    showToast,
    getAuthHeaders,
    handleFetchError,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); },
    API_URL,
    decodeToken,
    syncOfflineTickets,
    chargerMouvementsCaisse,
    appliquerRetourPinLocal: (empId, err) => appliquerRetourPinLocalUtil(setEmployesListe, empId, err),
    setErreurPinAction
  });



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
               const res = await fetch(`${API_URL}/api/reset-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: resetTokenUrl, nouveau_mot_de_passe: newPassword}) });
               if(res.ok) { showToast("Mot de passe mis à jour !", "success"); setTimeout(() => window.location.href = '/', 2000); } else { showToast("Lien expiré ou invalide.", "error"); }
            }}>Confirmer la modification</button>
          </div>
        </div>
      )
  }

  if (!token) {
    return (
      <LoginView
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        loginType={loginType}
        setLoginType={setLoginType}
        isForgotPassword={isForgotPassword}
        setIsForgotPassword={setIsForgotPassword}
        isLoginMode={isLoginMode}
        setIsLoginMode={setIsLoginMode}
        emailInput={emailInput}
        setEmailInput={setEmailInput}
        motDePasseInput={motDePasseInput}
        setMotDePasseInput={setMotDePasseInput}
        prenomGerantInput={prenomGerantInput}
        setPrenomGerantInput={setPrenomGerantInput}
        nomFamilleGerantInput={nomFamilleGerantInput}
        setNomFamilleGerantInput={setNomFamilleGerantInput}
        nomSalonInput={nomSalonInput}
        setNomSalonInput={setNomSalonInput}
        idSalonInput={idSalonInput}
        setIdSalonInput={setIdSalonInput}
        nomEmployeInput={nomEmployeInput}
        setNomEmployeInput={setNomEmployeInput}
        pinEmployeInput={pinEmployeInput}
        setPinEmployeInput={setPinEmployeInput}
        pinSalonInput={pinSalonInput}
        setPinSalonInput={setPinSalonInput}
        erreurLogin={erreurLogin}
        setErreurLogin={setErreurLogin}
        msgSucces={msgSucces}
        onLogin={seConnecter}
        onRegister={sInscrire}
        onForgotPassword={motDePasseOublie}
      />
    );
  }

  // Pop-up bloquant : le gérant doit accepter les documents contractuels avant tout (et avant le paiement)
  if (token && userRole === 'gerant' && legalStatut && legalStatut.accepte === false) {
    return (
      <PopupLegal
        apiBase={API_URL}
        token={localStorage.getItem('api_token')}
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

// --- MODULE 3 : SCANNER DE CODE-BARRES CAMÉRA (CAISSE & STOCKS) ---
  

  // --- MODULE 5 & OBJECTIFS D'ÉQUIPE (FONCTIONS SANS HOOKS CONDITIONNELS) ---
  const chargerKpisEmploye = async () => {
      try {
          const res = await fetch(`${API_URL}/api/employes/gamification-kpis`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('api_token') || token}` }
          });
          if (res.ok) {
              const data = await res.json();
              if (data) setEmpGamificationKpis(data);
          }
      } catch (e) {}
  };

  const creerObjectifEquipe = async () => {
      if (!newObjectifForm.titre.trim() || !newObjectifForm.valeur_cible) {
          return showToast("Veuillez renseigner un intitulé et une valeur cible.", "error");
      }
      try {
          const res = await fetch(`${API_URL}/api/equipe/objectifs`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`
              },
              body: JSON.stringify(newObjectifForm)
          });
          if (res.ok) {
              showToast("Objectif enregistré pour l'équipe.", "success");
              setShowAddObjectifModal(false);
              setNewObjectifForm({ titre: '', type_indicateur: 'TAUX_REVENTE', valeur_cible: '20', id_employe: 'TOUS', recompense: '' });
              chargerObjectifsEquipe();
          } else {
              const err = await res.json().catch(() => ({}));
              showToast(err.erreur || "Erreur lors de la création.", "error");
          }
      } catch (e) {
          showToast("Erreur réseau.", "error");
      }
  };

  const supprimerObjectifEquipe = async (idObj) => {
      try {
          const res = await fetch(`${API_URL}/api/equipe/objectifs/${idObj}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${localStorage.getItem('api_token') || token}` }
          });
          if (res.ok) {
              showToast("Objectif retiré.", "info");
              chargerObjectifsEquipe();
          }
      } catch (e) {}
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

      <AppHeaderBanners
        isTrialing={isTrialing}
        joursRestantsEssai={joursRestantsEssai}
        alertesFermees={alertesFermees}
        fermerAlerte={fermerAlerte}
        setShowPricingModal={setShowPricingModal}
        afficherRappelCloture={afficherRappelCloture}
        setActiveTab={setActiveTab}
        afficherRappelStock={afficherRappelStock}
        validerVerifStock={validerVerifStock}
        clotureAutoInfo={clotureAutoInfo}
        isOffline={isOffline}
        pendingOfflineCount={pendingOfflineCount}
      />

      <ModalIA
        modalIA={modalIA}
        setModalIA={setModalIA}
        isMobile={isMobile}
        tachesIA={tachesIA}
        fileAttenteIA={fileAttenteIA}
        ignorerTacheIA={ignorerTacheIA}
        validerTacheIA={validerTacheIA}
        employesListe={employesListe}
      />

      {/* --- BARRE DE NAVIGATION (DESKTOP & MOBILE) --- */}
      <NavbarSidebar
        isMobile={isMobile}
        role={role}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        nbTachesUrgentes={nbTachesUrgentes}
        tachesIA={tachesIA}
        aLeNiveau={aLeNiveau}
        handleTabClick={handleTabClick}
        decodeToken={decodeToken}
        token={token}
        aDesMessagesNonLus={aDesMessagesNonLus}
        seDeconnecter={seDeconnecter}
        isOutilsMenuOpen={isOutilsMenuOpen}
        setIsOutilsMenuOpen={setIsOutilsMenuOpen}
        onglMobilesParRole={onglMobilesParRole}
      />

      <div className="main-content">
        <div className={`dashboard-container ${['caisse', 'agenda', 'messagerie'].includes(activeTab) ? 'wide' : ''}`}>

              {/* La carte de validation de la liasse mensuelle est désormais intégrée directement dans la vue Compta ci-dessous */}

              {/* MODALE DE VALIDATION ET SIGNATURE COMPTABLE (AVEC PAVÉ MANUSCRIT + PIN NF525) */}
              <ValidationComptaModal
                showModalValidationCompta={showModalValidationCompta}
                setShowModalValidationCompta={setShowModalValidationCompta}
                statutMoisPrecedent={statutMoisPrecedent}
                setHasSignedCompta={setHasSignedCompta}
                hasSignedCompta={hasSignedCompta}
                checklistCompta={checklistCompta}
                setChecklistCompta={setChecklistCompta}
                effacerSignatureCompta={effacerSignatureCompta}
                signatureCanvasRef={signatureCanvasRef}
                demarrerTraceSignature={demarrerTraceSignature}
                dessinerTraceSignature={dessinerTraceSignature}
                arreterTraceSignature={arreterTraceSignature}
                pinValidationCompta={pinValidationCompta}
                setPinValidationCompta={setPinValidationCompta}
                validerEtEnvoyerMois={validerEtEnvoyerMois}
                isValidatingCompta={isValidatingCompta}
              />

              {/* VUE : TABLEAU DE BORD (ACCUEIL) — REFONTE EXECUTIVE PREMIUM & RESPONSIVE */}
              {/* VUE : TABLEAU DE BORD (ACCUEIL) */}
              {activeTab === 'accueil' && (
                <DashboardTab
                  role={role}
                  isMobile={isMobile}
                  isTablet={isTablet}
                  token={token}
                  setActiveTab={setActiveTab}
                  handleTabClick={handleTabClick}
                  configSalon={configSalon}
                  dashboardData={dashboardData}
                  salonDashboardData={salonDashboardData}
                  employeDashboardData={employeDashboardData}
                  empGamificationKpis={empGamificationKpis}
                  avisStats={avisStats}
                  planningData={planningData}
                  employesListe={employesListe}
                  statutsEquipe={statutsEquipe}
                  heureActuelle={heureActuelle}
                  mesSalonsGroupe={mesSalonsGroupe}
                  showMultiSalonModal={showMultiSalonModal}
                  setShowMultiSalonModal={setShowMultiSalonModal}
                  showFormNouveauSalon={showFormNouveauSalon}
                  setShowFormNouveauSalon={setShowFormNouveauSalon}
                  formNouveauSalon={formNouveauSalon}
                  setFormNouveauSalon={setFormNouveauSalon}
                  isCreatingSalon={isCreatingSalon}
                  isSwitchingSalon={isSwitchingSalon}
                  nbTachesUrgentes={nbTachesUrgentes}
                  isToday={isToday}
                  setPointeuse={setPointeuse}
                  changerDeSalonActif={changerDeSalonActif}
                  chargerMesSalons={chargerMesSalons}
                  creerNouveauSalonGroupe={creerNouveauSalonGroupe}
                  getAuthHeaders={getAuthHeaders}
                  handleFetchError={handleFetchError}
                  showToast={showToast}
                />
              )}


              {/* VUE : PARAMÈTRES DU SALON */}

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

              {activeTab === 'caisse' && (role === 'gerant' || role === 'salon') && (
                <CaisseTab
                  checklistOnboarding={checklistOnboarding}
                  basculerEtapeChecklist={basculerEtapeChecklist}
                  planEmpreinteOnboarding={planEmpreinteOnboarding}
                  setPlanEmpreinteOnboarding={setPlanEmpreinteOnboarding}
                  lancerPaiementStripe={lancerPaiementStripe}
                  ouvrirScannerCodeBarre={ouvrirScannerCodeBarre}
                  fermerScannerCodeBarre={fermerScannerCodeBarre}
                  scannerModalMode={scannerModalMode}
                  codeBarreManuel={codeBarreManuel}
                  setCodeBarreManuel={setCodeBarreManuel}
                  traiterCodeBarreDetecte={traiterCodeBarreDetecte}
                  showAddClient={showAddClient}
                  setShowAddClient={setShowAddClient}
                  newClient={newClient}
                  setNewClient={setNewClient}
                  ajouterClient={ajouterClient}
                  posEmploye={posEmploye}
                  setPosEmploye={setPosEmploye}
                  employesListe={employesListe}
                  getStatutPointageEmploye={getStatutPointageEmploye}
                  handleSelectEmployeCaisse={handleSelectEmployeCaisse}
                  showToast={showToast}
                  isMobile={isMobile}
                  posType={posType}
                  setPosType={setPosType}
                  rechercheCaisse={rechercheCaisse}
                  setRechercheCaisse={setRechercheCaisse}
                  catalogueListe={catalogueListe}
                  ajouterAuPanier={ajouterAuPanier}
                  retirerDuPanier={retirerDuPanier}
                  ticketGenere={ticketGenere}
                  setTicketGenere={setTicketGenere}
                  emailTicketClient={emailTicketClient}
                  setEmailTicketClient={setEmailTicketClient}
                  telephoneTicketClient={telephoneTicketClient}
                  setTelephoneTicketClient={setTelephoneTicketClient}
                  isOffline={isOffline}
                  envoyerTicketEco={envoyerTicketEco}
                  clientCaisse={clientCaisse}
                  setClientCaisse={setClientCaisse}
                  clientsSuggeres={clientsSuggeres}
                  setClientsSuggeres={setClientsSuggeres}
                  clientsListe={clientsListe}
                  clientCaisseObj={clientCaisseObj}
                  configSalon={configSalon}
                  panierCaisse={panierCaisse}
                  isEligibleFidelite={isEligibleFidelite}
                  isWinbackOffer={isWinbackOffer}
                  texteRecompense={texteRecompense}
                  remiseAppliquee={remiseAppliquee}
                  setRemiseAppliquee={setRemiseAppliquee}
                  showPourboireInput={showPourboireInput}
                  setShowPourboireInput={setShowPourboireInput}
                  pourboireCaisse={pourboireCaisse}
                  setPourboireCaisse={setPourboireCaisse}
                  sousTotalCaisse={sousTotalCaisse}
                  montantPourboireFinal={montantPourboireFinal}
                  totalCaisse={totalCaisse}
                  methodePaiement={methodePaiement}
                  setMethodePaiement={setMethodePaiement}
                  notificationCaisse={notificationCaisse}
                  validerEncaisser={validerEncaisser}
                  isEmployeCaisseBloque={isEmployeCaisseBloque}
                  statutCaisseCourant={statutCaisseCourant}
                  setPosStep={setPosStep}
                />
              )}

              {/* VUE : CENTRE D'ACTION (TÂCHES) */}
              {(role === 'gerant' || role === 'salon' || role === 'employe') && activeTab === 'actions' && (
                <ActionsTab
                  role={role}
                  isMobile={isMobile}
                  setShowSaisieManuelleFacture={setShowSaisieManuelleFacture}
                  aLeNiveau={aLeNiveau}
                  handleUploadFactureManuel={handleUploadFactureManuel}
                  isUploadingFacture={isUploadingFacture}
                  setShowPricingModal={setShowPricingModal}
                  erreurAnalyseIA={erreurAnalyseIA}
                  setErreurAnalyseIA={setErreurAnalyseIA}
                  nouvelleTache={nouvelleTache}
                  setNouvelleTache={setNouvelleTache}
                  employesListe={employesListe}
                  token={token}
                  getAuthHeaders={getAuthHeaders}
                  showToast={showToast}
                  chargerTout={chargerTout}
                  tachesListe={tachesListe}
                  getCouleurTache={getCouleurTache}
                  setSauvetageClient={setSauvetageClient}
                  setSmsSauvetage={setSmsSauvetage}
                  isTachesTermineesExpanded={isTachesTermineesExpanded}
                  setIsTachesTermineesExpanded={setIsTachesTermineesExpanded}
                />
              )}

             {/* VUE : AGENDA */}
             {activeTab === 'agenda' && (
                <AgendaTab
                  isMobile={isMobile}
                  role={role}
                  token={token}
                  configSalon={configSalon}
                  changerPeriode={changerPeriode}
                  resetToToday={resetToToday}
                  joursSemaine={joursSemaine}
                  isToday={isToday}
                  setPointeuse={setPointeuse}
                  setShowModalAbsence={setShowModalAbsence}
                  setShowModalRdv={setShowModalRdv}
                  filtresEmployes={filtresEmployes}
                  setFiltresEmployes={setFiltresEmployes}
                  employesListe={employesListe}
                  nbHeures={nbHeures}
                  heureDebutAgenda={heureDebutAgenda}
                  planningData={planningData}
                  expandedAbsenceDate={expandedAbsenceDate}
                  setExpandedAbsenceDate={setExpandedAbsenceDate}
                  ouvrirRdvSelectionne={ouvrirRdvSelectionne}
                  showModalRdv={showModalRdv}
                  formRdv={formRdv}
                  setFormRdv={setFormRdv}
                  showDropdownClient={showDropdownClient}
                  setShowDropdownClient={setShowDropdownClient}
                  getClientsSuggeresPourRdv={getClientsSuggeresPourRdv}
                  showDropdownPresta={showDropdownPresta}
                  setShowDropdownPresta={setShowDropdownPresta}
                  getPrestationsSuggeresPourRdv={getPrestationsSuggeresPourRdv}
                  creerRdvManuel={creerRdvManuel}
                  showModalAbsence={showModalAbsence}
                  ongletAbsence={ongletAbsence}
                  setOngletAbsence={setOngletAbsence}
                  formAbsence={formAbsence}
                  setFormAbsence={setFormAbsence}
                  handleUploadJustificatifAbsence={handleUploadJustificatifAbsence}
                  demanderAbsence={demanderAbsence}
                  rdvSelectionne={rdvSelectionne}
                  setRdvSelectionne={setRdvSelectionne}
                  isEditingRdv={isEditingRdv}
                  setIsEditingRdv={setIsEditingRdv}
                  editRdvForm={editRdvForm}
                  setEditRdvForm={setEditRdvForm}
                  demanderSuppressionRdv={demanderSuppressionRdv}
                  sauvegarderModifRdv={sauvegarderModifRdv}
                  protocoleVisible={protocoleVisible}
                  setProtocoleVisible={setProtocoleVisible}
                  protocolesListe={protocolesListe}
                  showToast={showToast}
                />
              )}

              {/* VUE : L'ACADÉMIE (PROTOCOLES & TUTORIELS ÉTAPE PAR ÉTAPE) */}
              {(role === 'gerant' || role === 'salon') && activeTab === 'protocoles' && (
                <ProtocolesTab
                  isMobile={isMobile}
                  showAddPrestation={showAddPrestation}
                  setShowAddPrestation={setShowAddPrestation}
                  modeEditionProtocole={modeEditionProtocole}
                  setModeEditionProtocole={setModeEditionProtocole}
                  nouveauProtocole={nouveauProtocole}
                  setNouveauProtocole={setNouveauProtocole}
                  etapeTemp={etapeTemp}
                  setEtapeTemp={setEtapeTemp}
                  ingredientTemp={ingredientTemp}
                  setIngredientTemp={setIngredientTemp}
                  rechercheProtocole={rechercheProtocole}
                  setRechercheProtocole={setRechercheProtocole}
                  newArticle={newArticle}
                  setNewArticle={setNewArticle}
                  creerArticle={creerArticle}
                  catalogueListe={catalogueListe}
                  protocolesListe={protocolesListe}
                  calculerIngredientsTotauxProtocole={calculerIngredientsTotauxProtocole}
                  ajouterTagProtocole={ajouterTagProtocole}
                  supprimerTagProtocole={supprimerTagProtocole}
                  supprimerProtocole={supprimerProtocole}
                  modifierChampEtapeExistante={modifierChampEtapeExistante}
                  deplacerEtapeRecette={deplacerEtapeRecette}
                  supprimerEtapeRecette={supprimerEtapeRecette}
                  ajouterIngredientSurEtapeExistante={ajouterIngredientSurEtapeExistante}
                  uploaderPhotoSurEtape={uploaderPhotoSurEtape}
                  uploadMediaProtocole={uploadMediaProtocole}
                  creerProtocole={creerProtocole}
                  setModifNomDialog={setModifNomDialog}
                  supprimerArticle={supprimerArticle}
                  showToast={showToast}
                />
              )}

              {/* VUE : PRODUITS (STOCKS) */}
              {(role === 'gerant' || role === 'salon') && activeTab === 'produits' && (
                <StocksTab
                  isMobile={isMobile}
                  role={role}
                  ouvrirScannerCodeBarre={ouvrirScannerCodeBarre}
                  ouvrirModaleReassort={ouvrirModaleReassort}
                  produitsEnAlerteStock={produitsEnAlerteStock}
                  isStockMergeMode={isStockMergeMode}
                  setIsStockMergeMode={setIsStockMergeMode}
                  selectedStocksToMerge={selectedStocksToMerge}
                  setSelectedStocksToMerge={setSelectedStocksToMerge}
                  showAddProduit={showAddProduit}
                  setShowAddProduit={setShowAddProduit}
                  dernierProduitScanne={dernierProduitScanne}
                  setDernierProduitScanne={setDernierProduitScanne}
                  showReassortModal={showReassortModal}
                  setShowReassortModal={setShowReassortModal}
                  fournisseurCommande={fournisseurCommande}
                  changerFournisseurReassort={changerFournisseurReassort}
                  emailFournisseurCommande={emailFournisseurCommande}
                  setEmailFournisseurCommande={setEmailFournisseurCommande}
                  lignesReassort={lignesReassort}
                  setLignesReassort={setLignesReassort}
                  noteCommande={noteCommande}
                  setNoteCommande={setNoteCommande}
                  copierListeReassort={copierListeReassort}
                  isSendingCommande={isSendingCommande}
                  telechargerBonCommandePdf={telechargerBonCommandePdf}
                  envoyerBonCommandeParMail={envoyerBonCommandeParMail}
                  scannerModalMode={scannerModalMode}
                  fermerScannerCodeBarre={fermerScannerCodeBarre}
                  codeBarreManuel={codeBarreManuel}
                  setCodeBarreManuel={setCodeBarreManuel}
                  traiterCodeBarreDetecte={traiterCodeBarreDetecte}
                  stocksData={stocksData}
                  setMergeForm={setMergeForm}
                  setShowMergeModal={setShowMergeModal}
                  newArticle={newArticle}
                  setNewArticle={setNewArticle}
                  ajouterArticle={ajouterArticle}
                  isStockExpanded={isStockExpanded}
                  setIsStockExpanded={setIsStockExpanded}
                  stockSearch={stockSearch}
                  setStockSearch={setStockSearch}
                  stockSortBy={stockSortBy}
                  setStockSortBy={setStockSortBy}
                  getStockStatus={getStockStatus}
                  getTendanceStock={getTendanceStock}
                  stockMenuOuvert={stockMenuOuvert}
                  setStockMenuOuvert={setStockMenuOuvert}
                  setModifStockDialog={setModifStockDialog}
                  setConfirmDialog={setConfirmDialog}
                  supprimerArticle={supprimerArticle}
                  showToast={showToast}
                />
              )}

              {/* VUE : RH (ÉQUIPE) — REFONTE EXECUTIVE PREMIUM & RESPONSIVE */}
              {role === 'gerant' && activeTab === 'rh' && (
                <RHTab
                  isMobile={isMobile}
                  isTablet={isTablet}
                  rhData={rhData}
                  absencesRH={absencesRH}
                  rhPeriodeHeures={rhPeriodeHeures}
                  setRhPeriodeHeures={setRhPeriodeHeures}
                  rhSortBy={rhSortBy}
                  setRhSortBy={setRhSortBy}
                  showAddEmploye={showAddEmploye}
                  setShowAddEmploye={setShowAddEmploye}
                  objectifsEquipeListe={objectifsEquipeListe}
                  showAddObjectifModal={showAddObjectifModal}
                  setShowAddObjectifModal={setShowAddObjectifModal}
                  chargerObjectifsEquipe={chargerObjectifsEquipe}
                  newObjectifForm={newObjectifForm}
                  setNewObjectifForm={setNewObjectifForm}
                  creerObjectifEquipe={creerObjectifEquipe}
                  supprimerObjectifEquipe={supprimerObjectifEquipe}
                  employesListe={employesListe}
                  newEmploye={newEmploye}
                  setNewEmploye={setNewEmploye}
                  handleImageUpload={handleImageUpload}
                  ajouterEmploye={ajouterEmploye}
                  statutsEquipe={statutsEquipe}
                  employeMenuOuvert={employeMenuOuvert}
                  setEmployeMenuOuvert={setEmployeMenuOuvert}
                  setModifEmployeDialog={setModifEmployeDialog}
                  setConfirmDialog={setConfirmDialog}
                  supprimerEmploye={supprimerEmploye}
                  modifEmployeDialog={modifEmployeDialog}
                  sauvegarderModifEmploye={sauvegarderModifEmploye}
                  getAuthHeaders={getAuthHeaders}
                  handleFetchError={handleFetchError}
                  showToast={showToast}
                  chargerTout={chargerTout}
                  setRefreshTrigger={setRefreshTrigger}
                />
              )}

              {/* VUE : ADMIN COMPTA — REFONTE EXECUTIVE PREMIUM & RESPONSIVE */}
              {/* VUE : ADMIN COMPTA & CLÔTURE */}
              {activeTab === 'admin' && (
                <AdminTab
                  isMobile={isMobile}
                  isTablet={isTablet}
                  role={role}
                  historiqueData={historiqueData}
                  mouvementsCaisse={mouvementsCaisse}
                  demanderZDeCaisse={demanderZDeCaisse}
                  clotureFaiteAujourdhui={clotureFaiteAujourdhui}
                  showClotureZModal={showClotureZModal}
                  setShowClotureZModal={setShowClotureZModal}
                  zPreview={zPreview}
                  isCloturantZ={isCloturantZ}
                  validerClotureZFinale={validerClotureZFinale}
                  telechargerBilanJour={telechargerBilanJour}
                  telechargerDossierNF525={telechargerDossierNF525}
                  telechargerArchiveMensuelle={telechargerArchiveMensuelle}
                  showModalEntreeSortie={showModalEntreeSortie}
                  setShowModalEntreeSortie={setShowModalEntreeSortie}
                  typeMouvement={typeMouvement}
                  setTypeMouvement={setTypeMouvement}
                  montantMouvement={montantMouvement}
                  setMontantMouvement={setMontantMouvement}
                  motifMouvement={motifMouvement}
                  setMotifMouvement={setMotifMouvement}
                  validerMouvementCaisse={validerMouvementCaisse}
                  expandedYear={expandedYear}
                  setExpandedYear={setExpandedYear}
                  expandedMonth={expandedMonth}
                  setExpandedMonth={setExpandedMonth}
                  showToast={showToast}
                />
              )}


              {/* VUE : MESSAGERIE (TEAMS STYLE) */}
              {activeTab === 'messagerie' && (
                <MessagerieTab
                  isMobile={isMobile}
                  role={role}
                  token={token}
                  chatActif={chatActif}
                  setChatActif={setChatActif}
                  nonLusParConv={nonLusParConv}
                  configSalon={configSalon}
                  contactsTries={contactsTries}
                  employesListe={employesListe}
                  chatMessages={chatMessages}
                  formatDateSeparateur={formatDateSeparateur}
                  editingMsgId={editingMsgId}
                  setEditingMsgId={setEditingMsgId}
                  editMsgContent={editMsgContent}
                  setEditMsgContent={setEditMsgContent}
                  validerEdition={validerEdition}
                  vuParOuvertMsgId={vuParOuvertMsgId}
                  setVuParOuvertMsgId={setVuParOuvertMsgId}
                  resoudreProfilVu={resoudreProfilVu}
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  replyToMsg={replyToMsg}
                  setReplyToMsg={setReplyToMsg}
                  demarrerEdition={demarrerEdition}
                  demanderSuppressionMessage={demanderSuppressionMessage}
                  messagesEndRef={messagesEndRef}
                  handleChatFileUpload={handleChatFileUpload}
                  demarrerEnregistrementVocal={demarrerEnregistrementVocal}
                  isRecordingAudio={isRecordingAudio}
                  recordingSeconds={recordingSeconds}
                  arreterEnregistrementVocal={arreterEnregistrementVocal}
                  annulerEnregistrementVocal={annulerEnregistrementVocal}
                  msgFile={msgFile}
                  setMsgFile={setMsgFile}
                  msgInput={msgInput}
                  setMsgInput={setMsgInput}
                  envoyerMessage={envoyerMessage}
                  toggleReaction={toggleReaction}
                />
              )}

              {/* === GOD MODE (SUPER-ADMIN) === */}
              {role === 'gerant' && activeTab === 'superadmin' && decodeToken(token)?.email === '2@gmail.com' && (
                <SuperAdminTab
                  isMobile={isMobile}
                  superAdminData={superAdminData}
                  showToast={showToast}
                  superAdminSalons={superAdminSalons}
                  basculerStatutSalon={basculerStatutSalon}
                  supprimerSalonAdmin={supprimerSalonAdmin}
                />
              )}
            </div>
      </div>
      {/* --- MENU OUTILS (BOTTOM SHEET MOBILE) --- */}
      <BottomMenuOutils
        isMobile={isMobile}
        isOutilsMenuOpen={isOutilsMenuOpen}
        setIsOutilsMenuOpen={setIsOutilsMenuOpen}
        role={role}
        aLeNiveau={aLeNiveau}
        handleTabClick={handleTabClick}
        setActiveTab={setActiveTab}
        token={token}
        decodeToken={decodeToken}
        aDesMessagesNonLus={aDesMessagesNonLus}
        seDeconnecter={seDeconnecter}
      />

      {/* --- MODALES GLOBALES --- */}
      <RegularisationZModal
        reguCloture={reguCloture}
        setReguCloture={setReguCloture}
        reguMontant={reguMontant}
        setReguMontant={setReguMontant}
        role={role}
        configSalon={configSalon}
        getStatutBlocagePin={getStatutBlocagePin}
        reguEmployeId={reguEmployeId}
        setReguEmployeId={setReguEmployeId}
        reguCodePin={reguCodePin}
        setReguCodePin={setReguCodePin}
        erreurPinAction={erreurPinAction}
        setErreurPinAction={setErreurPinAction}
        employesListe={employesListe}
        showToast={showToast}
        decodeToken={decodeToken}
        token={token}
        API_URL={API_URL}
        getAuthHeaders={getAuthHeaders}
        handleFetchError={handleFetchError}
        chargerMouvementsCaisse={chargerMouvementsCaisse}
        appliquerRetourPinLocal={appliquerRetourPinLocal}
      />

      <MouvementCaisseModal
        showMouvementModal={showMouvementModal}
        setShowMouvementModal={setShowMouvementModal}
        newMouvement={newMouvement}
        setNewMouvement={setNewMouvement}
        modeCalculatrice={modeCalculatrice}
        setModeCalculatrice={setModeCalculatrice}
        ongletCalculatrice={ongletCalculatrice}
        setOngletCalculatrice={setOngletCalculatrice}
        detailsMonnaie={detailsMonnaie}
        setDetailsMonnaie={setDetailsMonnaie}
        role={role}
        configSalon={configSalon}
        employesListe={employesListe}
        getStatutBlocagePin={getStatutBlocagePin}
        erreurPinAction={erreurPinAction}
        setErreurPinAction={setErreurPinAction}
        showToast={showToast}
        API_URL={API_URL}
        getAuthHeaders={getAuthHeaders}
        handleFetchError={handleFetchError}
        chargerMouvementsCaisse={chargerMouvementsCaisse}
        appliquerRetourPinLocal={appliquerRetourPinLocal}
      />

      <ClotureZDialog
        zDialogOuvert={zDialogOuvert}
        setZDialogOuvert={setZDialogOuvert}
        isMobile={isMobile}
        role={role}
        zEmployeSelect={zEmployeSelect}
        setZEmployeSelect={setZEmployeSelect}
        zCodePin={zCodePin}
        setZCodePin={setZCodePin}
        erreurPinAction={erreurPinAction}
        setErreurPinAction={setErreurPinAction}
        employesListe={employesListe}
        configSalon={configSalon}
        getStatutBlocagePin={getStatutBlocagePin}
        fondCaisseMatin={fondCaisseMatin}
        setFondCaisseMatin={setFondCaisseMatin}
        compteCaisse={compteCaisse}
        setCompteCaisse={setCompteCaisse}
        calculerTotalCaisseReel={calculerTotalCaisseReel}
        ecartDetecte={ecartDetecte}
        justificationEcart={justificationEcart}
        setJustificationEcart={setJustificationEcart}
        executerZDeCaisse={executerZDeCaisse}
      />

      <ConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />

      <ModifStockDialog
        modifStockDialog={modifStockDialog}
        setModifStockDialog={setModifStockDialog}
        confirmerModifStock={confirmerModifStock}
      />

      <ModifNomDialog
        modifNomDialog={modifNomDialog}
        setModifNomDialog={setModifNomDialog}
        confirmerModifNom={confirmerModifNom}
      />

      <AnnulationTicketModal
        annulationDialog={annulationDialog}
        setAnnulationDialog={setAnnulationDialog}
        confirmerAnnulationTicket={confirmerAnnulationTicket}
      />

      <CancellationRobotDialog
        cancellationRobot={cancellationRobot}
        setCancellationRobot={setCancellationRobot}
        cancelMessageTemplate={cancelMessageTemplate}
        setCancelMessageTemplate={setCancelMessageTemplate}
        selectedCancelRdvs={selectedCancelRdvs}
        setSelectedCancelRdvs={setSelectedCancelRdvs}
        showToast={showToast}
        chargerTout={chargerTout}
        setRefreshTrigger={setRefreshTrigger}
        API_URL={API_URL}
        getAuthHeaders={getAuthHeaders}
        handleFetchError={handleFetchError}
      />

      <AuditNf525Dialog
        auditNf525={auditNf525}
        setAuditNf525={setAuditNf525}
      />

      <SauvetageClientDialog
        sauvetageClient={sauvetageClient}
        setSauvetageClient={setSauvetageClient}
        remiseSauvetage={remiseSauvetage}
        setRemiseSauvetage={setRemiseSauvetage}
        smsSauvetage={smsSauvetage}
        setSmsSauvetage={setSmsSauvetage}
        envoyerSmsSauvetage={envoyerSmsSauvetage}
      />

      {showPricingModal && (
        <PricingModal 
          onClose={() => setShowPricingModal(false)}
          isSoftLock={isSoftLock}
          isHardLock={isHardLock}
          joursRestants={joursRestantsEssai}
          token={token}
          onSubscribe={async (plan, cycle) => {
            try {
              const res = await fetch(`${API_URL}/api/creer-checkout`, { 
                method: 'POST', 
                headers: getAuthHeaders(true), 
                body: JSON.stringify({ plan_choisi: plan, cycle_choisi: cycle }) 
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                alert();
                return;
              }
              if (data.url) {
                window.location.href = data.url;
              } else if (data.success) {
                setShowPricingModal(false);
                showToast(data.message, 'success');
              }
            } catch (err) {
              alert();
            }
          }}
        />
      )}

      <PointeuseModal
        pointeuse={pointeuse}
        setPointeuse={setPointeuse}
        employesListe={employesListe}
        statutsEquipe={statutsEquipe}
        getStatutBlocagePin={getStatutBlocagePin}
        handlePointeusePin={handlePointeusePin}
        enregistrerPointage={enregistrerPointage}
        buttonsDisabled={buttonsDisabled}
      />

      <FusionStocksModal
        showMergeModal={showMergeModal}
        setShowMergeModal={setShowMergeModal}
        selectedStocksToMerge={selectedStocksToMerge}
        setSelectedStocksToMerge={setSelectedStocksToMerge}
        mergeForm={mergeForm}
        setMergeForm={setMergeForm}
        role={role}
        configSalon={configSalon}
        getStatutBlocagePin={getStatutBlocagePin}
        employesListe={employesListe}
        erreurPinAction={erreurPinAction}
        setErreurPinAction={setErreurPinAction}
        setIsStockMergeMode={setIsStockMergeMode}
        showToast={showToast}
        chargerTout={chargerTout}
        API_URL={API_URL}
        getAuthHeaders={getAuthHeaders}
        handleFetchError={handleFetchError}
        appliquerRetourPinLocal={appliquerRetourPinLocal}
      />

      <SaisieFactureManuelleModal
        showSaisieManuelleFacture={showSaisieManuelleFacture}
        setShowSaisieManuelleFacture={setShowSaisieManuelleFacture}
        formFactureManuelle={formFactureManuelle}
        setFormFactureManuelle={setFormFactureManuelle}
        role={role}
        configSalon={configSalon}
        employesListe={employesListe}
        getStatutBlocagePin={getStatutBlocagePin}
        erreurPinAction={erreurPinAction}
        setErreurPinAction={setErreurPinAction}
        enregistrerFactureManuelle={enregistrerFactureManuelle}
      />

      <SimulateurIAButton
        token={token}
        isSalonDemoActif={isSalonDemoActif}
        role={role}
        isMobile={isMobile}
        showSimIAMenu={showSimIAMenu}
        setShowSimIAMenu={setShowSimIAMenu}
        lancerSimulationIA={lancerSimulationIA}
      />

      <ToastNotification
        toast={toast}
        isMobile={isMobile}
      />
    </div>
    </>
  );
}

export default App;
