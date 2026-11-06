import { useState, useEffect } from 'react';
import './App.css';
import Parametres from './Parametres';
import PopupLegal from './PopupLegal';   
import PricingModal from './PricingModal';
import { API_URL } from './api/config'; 

import './utils/fetchClient';
import { decodeToken, isPinWeak, isTokenExpired } from './utils/auth';
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
import useOfflineSync from './hooks/useOfflineSync';
import useMouvementsCaisse from './hooks/useMouvementsCaisse';
import useGamificationEquipe from './hooks/useGamificationEquipe';
import useAppDataLoader from './hooks/useAppDataLoader';
import useActionsChecklist from './hooks/useActionsChecklist';
import usePricingLock from './hooks/usePricingLock';
import useResponsiveAgendaDate from './hooks/useResponsiveAgendaDate';
import useSalonSettings from './hooks/useSalonSettings';


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

  // --- ÉTATS GLOBAUX FONDAMENTAUX ---
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };
  const [activeTab, setActiveTab] = useState('accueil');
  const [erreurPinAction, setErreurPinAction] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isOutilsMenuOpen, setIsOutilsMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [annulationDialog, setAnnulationDialog] = useState(null);
  const [cancellationRobot, setCancellationRobot] = useState(null);
  const [selectedCancelRdvs, setSelectedCancelRdvs] = useState([]);
  const [cancelMessageTemplate, setCancelMessageTemplate] = useState('');
  const [messagesListe, setMessagesListe] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [expandedYear, setExpandedYear] = useState(new Date().getFullYear().toString());
  const [expandedMonth, setExpandedMonth] = useState(["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][new Date().getMonth()]);
  const [configSalon, setConfigSalon] = useState({
    nom_salon: '', forme_juridique: '', siret: '', adresse_salon: '', tva_intra: '',
    google_api_key: '', google_account_id: '', google_location_id: '', email_factures: '', mot_de_passe_email: '', brevo_api_key: '', sms_sender_name: 'MonSalon', lien_google_maps: '', stripe_reader_id: '', heure_ouverture: 8, heure_fermeture: 20,
    fidelite_type: 'NONE', fidelite_points_seuil: 100, fidelite_points_valeur: 10, fidelite_tampons_seuil: 10, fidelite_recompense_type: 'MONTANT', fidelite_recompense_valeur: '10', fidelite_delai_sms: 60,
    telephone_gerant: '', alertes_sms_actives: false, email_comptable: '', jour_envoi_bilan: 1, derniere_verif_stock: null, pin_salon: '', temps_nettoyage_minutes: 0,
    plan_actuel: 'PREMIUM_TRIAL', date_fin_essai: null,
    logo_url: null, photos_salon: [], description_salon: '',
    anti_noshow_actif: false, anti_noshow_pourcentage: 30, anti_noshow_mode_annulation: 'AVOIR', delai_annulation_heures: 24,
    upsell_mode: 'AUTO', upsell_articles_ids: []
  });

  // --- HELPERS COMMUNS & GESTION DES ERREURS HTTP / NF525 ---
  const formatDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isToday = (d) => { const today = new Date(); return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); };
  const getAuthHeaders = (isJson = false) => { const headers = {}; if (isJson) headers['Content-Type'] = 'application/json'; return headers; };

  const handleFetchError = async (res) => {
      const data = await res.json().catch(() => ({})); 

      if (
          res.status === 401 ||
          data.session_expiree ||
          (data.erreur && (data.erreur.includes('expiré') || data.erreur.includes('invalide') || data.erreur.includes('Session expirée')))
      ) { 
          seDeconnecter(); 
          throw new Error("Session expirée. Veuillez vous reconnecter."); 
      } 
      if (res.status === 403 && data.require_upsell) {
          throw new Error("Forfait insuffisant");
      }
      if (res.status === 403 && !data.require_upsell) {
          throw new Error(data.erreur || "Accès refusé");
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

  // Détection proactive de session expirée (au retour sur l'onglet ou après mise en veille)
  useEffect(() => {
    const verifierSession = () => {
      const storedToken = localStorage.getItem('token') || localStorage.getItem('ui_token') || localStorage.getItem('token_api');
      if (storedToken && isTokenExpired(storedToken)) {
        seDeconnecter();
      }
    };

    window.addEventListener('focus', verifierSession);
    document.addEventListener('visibilitychange', verifierSession);
    const timer = setInterval(verifierSession, 30000);

    return () => {
      window.removeEventListener('focus', verifierSession);
      document.removeEventListener('visibilitychange', verifierSession);
      clearInterval(timer);
    };
  }, [token, seDeconnecter]);

  // Interception du jeton Sandbox
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

  // Fix pour les 'doubles clics' sur iPhone standalone (PWA)
  useEffect(() => {
      const noop = () => {};
      document.addEventListener('touchstart', noop, { passive: true });
      return () => document.removeEventListener('touchstart', noop);
  }, []);

  // Gestion du thème sombre et coloration de la status bar iOS/Android
  useEffect(() => {
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
          metaThemeColor = document.createElement('meta');
          metaThemeColor.name = 'theme-color';
          document.head.appendChild(metaThemeColor);
      }

      if (isDarkMode) {
          document.body.classList.add('dark-mode'); document.documentElement.classList.add('dark-mode');
          document.documentElement.style.backgroundColor = '#0b0b0d';
          document.body.style.backgroundColor = '#0b0b0d';
          metaThemeColor.setAttribute('content', '#0b0b0d');
          localStorage.setItem('theme', 'dark');
      } else {
          document.body.classList.remove('dark-mode'); document.documentElement.classList.remove('dark-mode');
          document.documentElement.style.backgroundColor = '#f6f6f7';
          document.body.style.backgroundColor = '#f6f6f7';
          metaThemeColor.setAttribute('content', '#f6f6f7');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  const ThemeToggle = ({ isFixed }) => (
    <ThemeToggleComponent isFixed={isFixed} isDarkMode={isDarkMode} onToggle={() => setIsDarkMode(!isDarkMode)} />
  );

  // --- ÉTATS & LOGIQUE : SYNCHRONISATION HORS-LIGNE & RÉSEAU (useOfflineSync) ---
  const {
    isOffline,
    setIsOffline,
    pendingOfflineCount,
    setPendingOfflineCount,
    syncOfflineTickets,
    syncEnCours
  } = useOfflineSync({
    token,
    API_URL,
    getAuthHeaders,
    showToast,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); },
    decodeToken,
    setMethodePaiement: (m) => { if (typeof setMethodePaiement === "function") setMethodePaiement(m); },
    setTicketGenere: (t) => { if (typeof setTicketGenere === "function") setTicketGenere(t); }
  });

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

  // --- ÉTATS & LOGIQUE : REVERSE TRIAL & VERROUILLAGE DES NIVEAUX (usePricingLock) ---
  const {
    showPricingModal,
    setShowPricingModal,
    isTrialing,
    dateFinEssai,
    joursRestantsEssai,
    isSoftLock,
    isHardLock,
    aLeNiveau,
    handleTabClick
  } = usePricingLock({
    configSalon,
    userRole,
    activeTab,
    setActiveTab,
    isAbonnementInactif,
    showToast
  });

  // --- ÉTATS & LOGIQUE : RESPONSIVE & CALENDRIER MULTI-JOURS (useResponsiveAgendaDate) ---
  const {
    windowWidth,
    isMobile,
    isTablet,
    nbJoursAffichage,
    currentDate,
    setCurrentDate,
    startDate,
    joursSemaine,
    changerPeriode,
    resetToToday,
    heureDebutAgenda,
    heureFinAgenda,
    nbHeures
  } = useResponsiveAgendaDate(configSalon);

  // --- ÉTATS & LOGIQUE : PARAMÈTRES DU SALON & PUSH NOTIFICATIONS (useSalonSettings) ---
  const {
    sauvegarderParametres,
    activerNotificationsPush
  } = useSalonSettings({
    token,
    userRole,
    configSalon,
    setConfigSalon,
    isOffline,
    API_URL,
    getAuthHeaders,
    handleFetchError,
    showToast,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); }
  });

  // --- ÉTATS & LOGIQUE : ACTIONS, TÂCHES & CHECKLIST GO-LIVE (useActionsChecklist) ---
  const {
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
  } = useActionsChecklist({
    token,
    userRole,
    decodeToken,
    activeTab,
    API_URL,
    getAuthHeaders,
    showToast,
    chargerTout: () => { if (typeof chargerTout === "function") chargerTout(); }
  });

  // --- ÉTATS & LOGIQUE : GESTION MULTI-SALONS & FRANCHISE (useMultiSalons) ---
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
    setDashboardData: (d) => { if (typeof setDashboardData === 'function') setDashboardData(d); },
    setPosEmploye: (e) => { if (typeof setPosEmploye === 'function') setPosEmploye(e); },
    setPanierCaisse: (p) => { if (typeof setPanierCaisse === 'function') setPanierCaisse(p); }
  });

  // --- ÉTATS & LOGIQUE : GAMIFICATION & OBJECTIFS D'ÉQUIPE (useGamificationEquipe) ---
  const {
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
  } = useGamificationEquipe({
    token,
    userRole,
    activeTab,
    API_URL,
    showToast
  });

  // --- ÉTATS & LOGIQUE : POINTEUSE NUMÉRIQUE (usePointeuseRH) ---
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

  // --- ÉTATS & LOGIQUE : MOUVEMENTS DE PETITE CAISSE (useMouvementsCaisse) ---
  const {
    mouvementsCaisse,
    setMouvementsCaisse,
    showMouvementModal,
    setShowMouvementModal,
    newMouvement,
    setNewMouvement,
    modeCalculatrice,
    setModeCalculatrice,
    ongletCalculatrice,
    setOngletCalculatrice,
    detailsMonnaie,
    setDetailsMonnaie,
    chargerMouvementsCaisse,
    ajouterMouvementCaisse
  } = useMouvementsCaisse({
    API_URL,
    getAuthHeaders,
    handleFetchError,
    showToast
  });

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
    acompteDeduit,
    acompteADeduire,
    netAPayer,
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
    catalogueListe,
    getPlanningData: () => (typeof planningData !== 'undefined' ? planningData : []),
    getAuthHeaders,
    handleFetchError,
    showToast,
    chargerTout: () => { if (typeof chargerTout === 'function') chargerTout(); },
    setAnnulationDialog,
    annulationDialog,
    clientSelectionne,
    ouvrirFicheClient
  });

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

  // --- ÉTATS & LOGIQUE : SYNCHRONISATION DES DONNÉES & SOCKETS (useAppDataLoader) ---
  const {
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
  } = useAppDataLoader({
    token,
    userRole,
    setUserRole,
    isAbonnementInactif,
    isOffline,
    activeTab,
    refreshTrigger,
    setRefreshTrigger,
    joursSemaine,
    formatDateInput,
    configSalon,
    setConfigSalon,
    setEmployesListe,
    setMessagesListe,
    setTachesListe,
    setCatalogueListe,
    setStocksData,
    setClientsListe,
    setProtocolesListe,
    setStatutsEquipe,
    chargerStatutsPointage,
    chargerMesSalons,
    getAuthHeaders,
    handleFetchError,
    showToast,
    decodeToken,
    setConfirmDialog,
    API_URL
  });

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

  // Déclencheurs Compta et Stripe
  useEffect(() => {
      if (activeTab === 'admin') {
          chargerStatutMoisCompta();
          chargerMouvementsCaisse();
      }
  }, [activeTab]);

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

  const role = userRole;
  const appliquerRetourPinLocal = (empId, err) => appliquerRetourPinLocalUtil(setEmployesListe, empId, err);
  const getStatutBlocagePin = (empId) => getStatutBlocagePinUtil(employesListe, empId);
  const statutCaisseCourant = getStatutBlocagePin(posEmploye);
  const isEmployeCaisseBloque = Boolean(posEmploye && statutCaisseCourant?.bloque);
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
                  setSauvetageClient={setSauvetageClient}
                  setSmsSauvetage={setSmsSauvetage}
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
                  catalogueListe={catalogueListe}
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
                  acompteADeduire={acompteADeduire}
                  netAPayer={netAPayer}
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
                  creerArticle={ajouterArticle}
                  catalogueListe={catalogueListe}
                  protocolesListe={protocolesListe}
                  calculerIngredientsTotauxProtocole={calculerIngredientsTotauxProtocole}
                  toggleTag={toggleTag}
                  ajouterTagProtocole={ajouterTagProtocole}
                  supprimerTagProtocole={supprimerTagProtocole}
                  supprimerProtocole={supprimerProtocole}
                  modifierChampEtapeExistante={modifierChampEtapeExistante}
                  deplacerEtapeRecette={deplacerEtapeRecette}
                  supprimerEtapeRecette={supprimerEtapeRecette}
                  ajouterIngredientSurEtapeExistante={ajouterIngredientSurEtapeExistante}
                  supprimerIngredientDuneEtape={supprimerIngredientDuneEtape}
                  ajouterIngredientBrouillonEtape={ajouterIngredientBrouillonEtape}
                  ajouterEtapeRecette={ajouterEtapeRecette}
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
                  setCancellationRobot={setCancellationRobot}
                  setSelectedCancelRdvs={setSelectedCancelRdvs}
                  setCancelMessageTemplate={setCancelMessageTemplate}
                  dessinerChronogramme={dessinerChronogramme}
                  debloquerPinEmploye={debloquerPinEmploye}
                  rhAvisExpanded={rhAvisExpanded}
                  setRhAvisExpanded={setRhAvisExpanded}
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
                  telechargerBilanJour={telechargerBilanJour}
                  statutMoisPrecedent={statutMoisPrecedent}
                  previsualiserBrouillon={previsualiserBrouillon}
                  setShowModalValidationCompta={setShowModalValidationCompta}
                  chargerMouvementsCaisse={chargerMouvementsCaisse}
                  setShowMouvementModal={setShowMouvementModal}
                  erreurAnalyseIA={erreurAnalyseIA}
                  setErreurAnalyseIA={setErreurAnalyseIA}
                  setShowSaisieManuelleFacture={setShowSaisieManuelleFacture}
                  aLeNiveau={aLeNiveau}
                  handleUploadFactureManuel={handleUploadFactureManuel}
                  isUploadingFacture={isUploadingFacture}
                  progressionBatch={progressionBatch}
                  setShowPricingModal={setShowPricingModal}
                  declencherExport={declencherExport}
                  declencherExportFEC={declencherExportFEC}
                  lancerAuditNF525={lancerAuditNF525}
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
                  chatMessages={messagesListe}
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
                  activeReactionId={activeReactionId}
                  setActiveReactionId={setActiveReactionId}
                  chatMessagesRef={chatMessagesRef}
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
