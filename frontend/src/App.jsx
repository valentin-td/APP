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

  const [token, setToken] = useState(localStorage.getItem('ui_token') || null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  // --- ÉTATS GLOBAUX DES MODULES 1, 3, 4 & 5 (PLACÉS EN HAUT POUR ÉVITER L'ERREUR REACT #310) ---
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [scannerModalMode, setScannerModalMode] = useState(null);
  const [codeBarreManuel, setCodeBarreManuel] = useState('');
  const [dernierProduitScanne, setDernierProduitScanne] = useState(null);
  const [showReassortModal, setShowReassortModal] = useState(false);
  const [lignesReassort, setLignesReassort] = useState([]);
  const [fournisseurCommande, setFournisseurCommande] = useState("L'Oréal Professionnel");
  const [emailFournisseurCommande, setEmailFournisseurCommande] = useState('');
  const [noteCommande, setNoteCommande] = useState('');
  const [isSendingCommande, setIsSendingCommande] = useState(false);
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

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginType, setLoginType] = useState('gerant'); 
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [erreurLogin, setErreurLogin] = useState(null);
  const [msgSucces, setMsgSucces] = useState(null);
  
  const [emailInput, setEmailInput] = useState('');
  const [codePartenaireInput, setCodePartenaireInput] = useState('');
  const [motDePasseInput, setMotDePasseInput] = useState('');
  const [nomSalonInput, setNomSalonInput] = useState('');
  const [prenomGerantInput, setPrenomGerantInput] = useState('');
  const [nomFamilleGerantInput, setNomFamilleGerantInput] = useState('');
  const [idSalonInput, setIdSalonInput] = useState('');
  const [nomEmployeInput, setNomEmployeInput] = useState('');
  const [pinEmployeInput, setPinEmployeInput] = useState('');
  const [pinSalonInput, setPinSalonInput] = useState('');
  const [siretInput, setSiretInput] = useState('');
  const [adresseSalonInput, setAdresseSalonInput] = useState('');

  const [isAbonnementInactif, setIsAbonnementInactif] = useState(false);
  const [userRole, setUserRole] = useState('gerant'); 
  const [legalStatut, setLegalStatut] = useState(null); // null = inconnu / non concerné, sinon { accepte, en_attente, identite }

  // Acceptation des documents contractuels : vérifiée à chaque connexion du gérant
  useEffect(() => {
    if (!token || decodeToken(token)?.role !== 'gerant') { 
        setLegalStatut(null); 
        return; 
    }
    
    let annule = false;
    
    const verifierStatutLegal = async () => {
        try {
            // On utilise l'intercepteur global pour s'assurer que les identifiants/cookies sont transmis
            const res = await fetch(`${API_URL}/api/legal/statut`, { 
                headers: getAuthHeaders() 
            });
            
            // Si le token est expiré ou le compte bloqué
            if (res.status === 401 || res.status === 403) {
                const data = await res.json().catch(() => ({}));
                // Si l'erreur est juste un manque de forfait, on ne bloque pas le processus légal
                if (!data.require_upsell) {
                    seDeconnecter();
                    return;
                }
            }
            
            if (res.ok) {
                const data = await res.json();
                if (!annule && data) {
                    setLegalStatut(data);
                }
            } else {
                // Par sécurité, en cas d'erreur inattendue (sauf réseau pur), on force la vérification
                if (!annule) setLegalStatut({ accepte: false, en_attente: true });
            }
        } catch (e) {
            console.error("Impossible de vérifier le statut légal :", e);
            // Mode dégradé si le réseau plante totalement (pour ne pas bloquer un utilisateur en plein salon)
        }
    };

    verifierStatutLegal();
    
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

  // --- ÉTATS : GESTION MULTI-SALONS & FRANCHISE ---
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(true),
        credentials: 'include'
      });
      const data = await handleFetchError(res);

      // Nettoyage du cache local du salon précédent (en préservant les éventuels tickets hors-ligne)
      const clesCacheSalon = [
        'dashboardData', 'avisStats', 'catalogueListe', 'stocksData', 'rhData',
        'absencesRH', 'clientsListe', 'protocolesListe', 'employesListe',
        'messagesListe', 'historiqueData', 'tachesListe', 'configSalon', 'planningData'
      ];
      await Promise.all(clesCacheSalon.map(k => localforage.removeItem(k).catch(() => {})));

      localStorage.setItem('ui_token', data.ui_token);
      if (data.token_api) localStorage.setItem('api_token', data.token_api);

      setDashboardData(null);
      setPosEmploye(null);
      setPanierCaisse([]);
      setShowMultiSalonModal(false);
      setToken(data.ui_token);
      showToast("Établissement actif changé avec succès !", "success");
    } catch (e) {
      showToast(e.message || "Erreur lors du changement de salon.", "error");
    } finally {
      setIsSwitchingSalon(false);
    }
  };

  const creerNouveauSalonGroupe = async () => {
    if (!formNouveauSalon.nom_salon.trim()) {
      return showToast("Veuillez saisir le nom du nouvel établissement.", "error");
    }
    setIsCreatingSalon(true);
    try {
      const res = await fetch(`${API_URL}/api/mes-salons/creer`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify(formNouveauSalon)
      });
      const data = await handleFetchError(res);
      showToast(data.message || "Nouvel établissement créé !", "success");
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
      showToast(e.message || "Erreur lors de la création du salon.", "error");
    } finally {
      setIsCreatingSalon(false);
    }
  };
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
  const [showSaisieManuelleFacture, setShowSaisieManuelleFacture] = useState(false);
  const [formFactureManuelle, setFormFactureManuelle] = useState({
      nom_fournisseur: '',
      numero_facture: '',
      date_facture: new Date().toISOString().split('T')[0],
      montant_ht: '',
      montant_tva: '',
      montant_ttc: '',
      mode_paiement: 'CARTE',
      compte_comptable: '607',
      id_employe: '',
      code_pin: ''
    });
    const [erreurAnalyseIA, setErreurAnalyseIA] = useState(null);
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
  
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddEmploye, setShowAddEmploye] = useState(false);
  // --- ÉTATS : POINTEUSE NUMÉRIQUE ---
  const [pointeuse, setPointeuse] = useState({ open: false, step: 1, employe: null, pin: '', erreurPin: null });
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [statutsEquipe, setStatutsEquipe] = useState({}); // Mémorise qui est en pause ou non

  // 1. Mise à jour de l'affichage du PIN instantanément et de façon sécurisée
  const handlePointeusePin = (digit) => {
      const statutBlocage = getStatutBlocagePin(pointeuse.employe?.id_employe);
      if (statutBlocage.bloque) return;
      setPointeuse(prev => {
          if (prev.pin.length >= 4) return prev; // Sécurité : on empêche de taper plus de 4 chiffres
          return { ...prev, pin: prev.pin + digit, erreurPin: null };
      });
  };


  // 2. Vérification réseau automatique (déclenchée dès que le 4ème chiffre est tapé)
  useEffect(() => {
      if (pointeuse.open && pointeuse.step === 2 && pointeuse.pin.length === 4) {
          const verifierCode = async () => {
              let dataAuth = {};
              try {
                  const resAuth = await fetch(`${API_URL}/api/employes/login-pin`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          id_salon: decodeToken(token)?.id_salon,
                          id_employe: pointeuse.employe.id_employe,
                          nom_employe: pointeuse.employe.nom,
                          code_pin: pointeuse.pin,
                          is_pointeuse: true
                      })
                  });
                  dataAuth = await resAuth.json().catch(() => ({}));
                  if (!resAuth.ok) {
                      throw new Error(dataAuth.erreur || "Code PIN incorrect");
                  }
                  
                  // Succès : remise à zéro locale immédiate des tentatives
                  setEmployesListe(prev => (prev || []).map(emp =>
                      emp.id_employe === pointeuse.employe.id_employe
                          ? { ...emp, pin_tentatives_echouees: 0, pin_bloque_jusqua: null, pin_bloque_definitif: false }
                          : emp
                  ));

                  setButtonsDisabled(true);
                  setPointeuse(prev => ({ ...prev, step: 3, erreurPin: null }));
                  setTimeout(() => {
                      setButtonsDisabled(false);
                  }, 300);
                  
              } catch (e) {
                  // Mise à jour locale immédiate des compteurs et du blocage sans attendre le réseau
                  setEmployesListe(prev => (prev || []).map(emp => {
                      if (emp.id_employe !== pointeuse.employe?.id_employe) return emp;
                      return {
                          ...emp,
                          pin_tentatives_echouees: dataAuth.tentatives !== undefined ? dataAuth.tentatives : (emp.pin_tentatives_echouees || 0) + 1,
                          pin_bloque_jusqua: dataAuth.locked_until !== undefined ? dataAuth.locked_until : emp.pin_bloque_jusqua,
                          pin_bloque_definitif: dataAuth.locked_permanent !== undefined ? dataAuth.locked_permanent : emp.pin_bloque_definitif
                      };
                  }));
                  if (typeof chargerTout === 'function') chargerTout();
                  showToast(e.message || "Code PIN incorrect", "error");
                  setPointeuse(prev => ({ ...prev, pin: '', erreurPin: e.message || "Code PIN incorrect" }));
              }
          };
          verifierCode();
      }
  }, [pointeuse.pin, pointeuse.open, pointeuse.step, token]);

  const enregistrerPointage = async (action) => {
      try {
          const res = await fetch(`${API_URL}/api/rh/pointage`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify({ id_employe: pointeuse.employe.id_employe, type_action: action })
          });
          if (!res.ok) throw new Error("Erreur de pointage");
          
          // Dégrise instantanément le collaborateur sur l'interface SANS recharger la page et SANS déconnexion
          if (action === 'ENTREE') {
              setEmployesListe(prev => (prev || []).map(emp => 
                  emp.id_employe === pointeuse.employe.id_employe ? { ...emp, a_pointe_aujourdhui: true } : emp
              ));
          }
          
          // 1. MISE À JOUR LOCALE IMMÉDIATE (Plus besoin de refresh)
          setStatutsEquipe(prev => ({ ...prev, [pointeuse.employe.id_employe]: { action: action, heure: new Date().toISOString() } }));

          // On passe à l'étape 4 pour l'animation de succès au lieu de fermer direct
          setPointeuse(prev => ({ ...prev, step: 4, derniereAction: action }));
          
          // Fermeture automatique après 2,5 secondes
          setTimeout(() => {
              setPointeuse({ open: false, step: 1, employe: null, pin: '', derniereAction: null });
          }, 2500);
      } catch (e) {
          showToast(e.message, "error");
      }
  };
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
  const isSendingMsgRef = useRef(false);
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null); 
  

  // Auto-scroll doux et contrôlé (syntaxe 100% compatible)
  useEffect(() => {
      if (messagesEndRef.current && activeTab === 'messagerie') {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  // On écoute la LONGUEUR de la liste (messagesListe.length) au lieu de l'objet entier, 
  // pour ne pas scroller automatiquement quand on ajoute une simple réaction !
  }, [messagesListe.length, chatActif, activeTab]);

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
      if (Number(msg.id_destinataire) === 0) return 'salon';
      if (roleUtilisateur === 'employe') {
          if (Number(msg.id_expediteur) === Number(myId)) return (msg.id_destinataire === null || Number(msg.id_destinataire) === -1) ? 'gerant' : msg.id_destinataire;
          if (Number(msg.id_destinataire) === Number(myId)) return (msg.id_expediteur === null || Number(msg.id_expediteur) === -1) ? 'gerant' : msg.id_expediteur;
          return null;
      }
      if (roleUtilisateur === 'salon') {
          if ((msg.id_expediteur === -1 && msg.id_destinataire === null) || (msg.id_expediteur === null && msg.id_destinataire === -1)) return 'gerant';
      }
      // Vue gérant ou salon : l'autre extrémité de la conversation est celle qui n'est ni null (gérant) ni -1 (salon)
      const estIdentitePatron = (v) => v === null || Number(v) === -1;
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

      const idsAVoir = messagesConv.filter(m => m.id_expediteur !== myId && !(Array.isArray(m.vu_par) && m.vu_par.includes(monProfilId))).map(m => m.id_message);
      if (idsAVoir.length > 0) {
          // Mise à jour optimiste immédiate pour éviter les appels API redondants
          setMessagesListe(prev => (prev || []).map(m => {
              if (!idsAVoir.includes(m.id_message)) return m;
              const actuels = Array.isArray(m.vu_par) ? m.vu_par : [];
              return actuels.includes(monProfilId) ? m : { ...m, vu_par: [...actuels, monProfilId] };
          }));

          fetch(`${API_URL}/api/messages/vu`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ ids: idsAVoir }) })
              .then(async (res) => { if (!res.ok) { const d = await res.json().catch(() => ({})); console.error('Erreur marquage vu :', res.status, d.erreur); } })
              .catch((e) => console.error('Erreur réseau marquage vu :', e));
      }
  };

  // N'exécute le check que si l'onglet Chat est ouvert OU que l'on change de contact
  useEffect(() => {
      marquerConversationCommeLue();
  }, [chatActif, activeTab, messagesListe.length]);


  
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

  // --- ÉTATS : WORKFLOW DE VALIDATION & SIGNATURE MANUSCRITE COMPTABLE ---
  const [statutMoisPrecedent, setStatutMoisPrecedent] = useState(null);
  const [showModalValidationCompta, setShowModalValidationCompta] = useState(false);
  const [checklistCompta, setChecklistCompta] = useState({ caisse: false, paie: false, depenses: false });
  const [pinValidationCompta, setPinValidationCompta] = useState('');
  const [isValidatingCompta, setIsValidatingCompta] = useState(false);
  const [hasSignedCompta, setHasSignedCompta] = useState(false);
  const signatureCanvasRef = useRef(null);
  const isDrawingSignatureRef = useRef(false);

  const getCoordonneesSignature = (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
      return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
      };
  };

  const demarrerTraceSignature = (e) => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      if (e.cancelable) e.preventDefault();
      const ctx = canvas.getContext('2d');
      const { x, y } = getCoordonneesSignature(e, canvas);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      isDrawingSignatureRef.current = true;
      setHasSignedCompta(true);
  };

  const dessinerTraceSignature = (e) => {
      if (!isDrawingSignatureRef.current) return;
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      if (e.cancelable) e.preventDefault();
      const ctx = canvas.getContext('2d');
      const { x, y } = getCoordonneesSignature(e, canvas);
      ctx.lineTo(x, y);
      ctx.stroke();
  };

  const arreterTraceSignature = () => {
      isDrawingSignatureRef.current = false;
  };

  const effacerSignatureCompta = () => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignedCompta(false);
  };
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
  
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [clientHistorique, setClientHistorique] = useState({ rdv: [], achats: [], notes: '', gains: [] });
  const [chargementFiche, setChargementFiche] = useState(false);

  const [ticketGenere, setTicketGenere] = useState(null);
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
  const [emailTicketClient, setEmailTicketClient] = useState('');
  const [telephoneTicketClient, setTelephoneTicketClient] = useState('');

  const [newClient, setNewClient] = useState({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' });
  const [newEmploye, setNewEmploye] = useState({ prenom: '', nomFamille: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null, type_contrat: '35H', heures_mensuelles_base: 151.67 });
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
  const [pourboireCaisse, setPourboireCaisse] = useState(''); // Montant du pourboire
  const [showPourboireInput, setShowPourboireInput] = useState(false); // Afficher ou non le champ
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
    nom_salon: '', forme_juridique: '', siret: '', adresse_salon: '', tva_intra: '',
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

  // --- RÉCUPÉRATION DES STATUTS DE POINTAGE ---
  const chargerStatutsPointage = async () => {
      if (!token) return;
      try {
          const res = await fetch(`${API_URL}/api/rh/statut-pointages`, { headers: getAuthHeaders() });
          if (res.ok) {
              const data = await res.json();
              // Sécurité : On s'assure que le format est toujours un objet complexe pour éviter l'état "Absent"
              const formattedData = {};
              for (let id in data) {
                  if (typeof data[id] === 'string') {
                      formattedData[id] = { action: data[id], heure: new Date().toISOString() };
                  } else {
                      formattedData[id] = data[id];
                  }
              }
              setStatutsEquipe(formattedData);
          }
      } catch (e) { console.error("Erreur statuts pointages", e); }
  };

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

  const verifierTachesIAEnBase = async () => {
      if (!token || isAbonnementInactif || decodeToken(token)?.role !== 'gerant') return;
      try {
          const res = await fetch(`${API_URL}/api/ia/taches?_=${Date.now()}`, { 
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
          const tokenApi = localStorage.getItem('api_token');
          const url = `${API_URL}/api/events/${user.id_salon}${tokenApi ? `?token=${encodeURIComponent(tokenApi)}` : ''}`;
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
      
      verifierTachesIAEnBase();
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
          
          if (premiereTache.type_tache === 'RDV') {
              // L'IA n'a pas trouvé de durée ? On cherche dans notre catalogue (Auto-Match) !
              if (!premiereTache.donnees.duree_minutes) {
                  const nomPrestaIA = nettoyerTexteRecherche(premiereTache.donnees.prestation || '');
                  const prestaMatch = (catalogueListe || []).find(p => p.type_article === 'PRESTATION' && nettoyerTexteRecherche(p.nom).includes(nomPrestaIA));
                  premiereTache.donnees.duree_minutes = prestaMatch && prestaMatch.duree_estimee_minutes ? prestaMatch.duree_estimee_minutes : 30;
              }
              // Sécurité frontend : Auto-Match du collaborateur si l'ID n'a pas été posé par le serveur
              if (!premiereTache.donnees.id_employe && premiereTache.donnees.nom_employe_suggere) {
                  const nomSugg = nettoyerTexteRecherche(premiereTache.donnees.nom_employe_suggere);
                  const empMatch = (employesListe || []).find(e => nettoyerTexteRecherche(e.nom).includes(nomSugg));
                  if (empMatch) premiereTache.donnees.id_employe = empMatch.id_employe;
              }
          }
          
          setModalIA(premiereTache);
      }
  }, [tachesIA, modalIA, catalogueListe, employesListe]);

  // Fonction qui gère la transition automatique vers la facture suivante du lot
    const passerAuDocumentSuivant = (idTacheTraitee) => {
        const resteFile = fileAttenteIA.filter(t => t.id_tache !== idTacheTraitee);
        setFileAttenteIA(resteFile);
        if (resteFile.length > 0) {
            setModalIA(resteFile[0]); // Affiche instantanément la facture suivante
        } else {
            setModalIA(null); // Ferme la modale quand tout le lot est terminé
        }
    };

  const [showSimIAMenu, setShowSimIAMenu] = useState(false);

  // Détecte strictement si le salon actuellement ouvert est un Salon de Démo STACK Partners
  const isSalonDemoActif = useMemo(() => {
      const emailCourant = (decodeToken(token)?.email || '').toLowerCase().trim();
      const nomCourant = (configSalon?.nom_salon || '').toLowerCase().trim();
      const estVraiSalonDemo =
          emailCourant.includes('sandbox.demo') ||
          emailCourant.includes('@stack-sim.fr') ||
          nomCourant.includes('maison éclat') ||
          nomCourant.includes('salon démo') ||
          nomCourant.includes('salon vierge');

      // Si on est sur un vrai salon client, on purge immédiatement le flag sandbox résiduel du navigateur
      if (token && configSalon?.nom_salon && !estVraiSalonDemo) {
          localStorage.removeItem('skip_legal_sandbox');
      }
      return estVraiSalonDemo;
  }, [token, configSalon?.nom_salon]);

  // Génère une facture fournisseur visuelle haute définition (L'Oréal Professionnel) pour l'aperçu Split-Screen
  const genererFactureExempleUrl = () => {
      const dateFr = new Date().toLocaleDateString('fr-FR');
      const nomSalonCible = configSalon?.nom_salon || 'Maison Éclat — Salon Démo';
      const adresseCible = configSalon?.adresse_salon || '14 Place Kléber, 67000 Strasbourg';
      const siretCible = configSalon?.siret || '892 451 630 00018';

      const svgFacture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" width="100%" height="100%">
        <rect width="794" height="1123" fill="#ffffff"/>
        <rect width="794" height="14" fill="#111827"/>
        
        <!-- En-tête Fournisseur -->
        <text x="55" y="72" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="800" fill="#111827" letter-spacing="1">L'ORÉAL PROFESSIONNEL</text>
        <text x="55" y="92" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#6b7280" letter-spacing="2">PARIS • DIVISION PRODUITS PROFESSIONNELS</text>
        <text x="55" y="116" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#4b5563">14 Rue Royale, 75008 Paris • France</text>
        <text x="55" y="132" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#4b5563">SIRET : 632 012 100 00024 • TVA Intracom. : FR 18 632012100</text>

        <!-- Cartouche Facture Droite -->
        <rect x="490" y="46" width="249" height="94" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.5"/>
        <text x="614" y="74" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="800" fill="#111827" text-anchor="middle">FACTURE ORIGINALE</text>
        <text x="614" y="96" font-family="Courier, monospace" font-size="13" font-weight="700" fill="#111827" text-anchor="middle">N° FAC-LP-2026-8841</text>
        <text x="614" y="116" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563" text-anchor="middle">Date d'émission : ${dateFr}</text>
        <text x="614" y="131" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#16a34a" text-anchor="middle">PRÉLÈVEMENT SEPA AUTORISÉ</text>

        <line x1="55" y1="168" x2="739" y2="168" stroke="#e5e7eb" stroke-width="1.5"/>

        <!-- Encadré Client Destinataire -->
        <rect x="55" y="192" width="330" height="106" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.2"/>
        <text x="72" y="214" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#6b7280" letter-spacing="0.8">ÉTABLISSEMENT FACTURÉ &amp; LIVRÉ</text>
        <text x="72" y="236" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="800" fill="#111827">${nomSalonCible.replace(/&/g, '&amp;')}</text>
        <text x="72" y="256" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">${adresseCible.replace(/&/g, '&amp;')}</text>
        <text x="72" y="278" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#111827">SIRET : ${siretCible}</text>

        <!-- Encadré Références Commande -->
        <rect x="409" y="192" width="330" height="106" rx="10" fill="#ffffff" stroke="#e5e7eb" stroke-width="1.2"/>
        <text x="426" y="214" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#6b7280" letter-spacing="0.8">RÉFÉRENCES LOGISTIQUES</text>
        <text x="426" y="236" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">Bon de livraison : <tspan font-weight="700" fill="#111827">BL-STR-90412</tspan></text>
        <text x="426" y="256" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">Compte client : <tspan font-weight="700" fill="#111827">PRO-67000-ECLAT</tspan></text>
        <text x="426" y="276" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">Mode de règlement : <tspan font-weight="700" fill="#111827">Prélèvement SEPA</tspan></text>

        <!-- En-tête Tableau Produits -->
        <rect x="55" y="330" width="684" height="36" rx="6" fill="#111827"/>
        <text x="70" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff">RÉF.</text>
        <text x="155" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff">DÉSIGNATION DES ARTICLES</text>
        <text x="455" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff" text-anchor="middle">DESTINATION</text>
        <text x="535" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff" text-anchor="middle">QTÉ</text>
        <text x="615" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff" text-anchor="end">P.U. HT</text>
        <text x="720" y="353" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff" text-anchor="end">TOTAL HT</text>

        <!-- Ligne 1 -->
        <rect x="55" y="366" width="684" height="58" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
        <text x="70" y="399" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">KER-SH-250</text>
        <text x="155" y="393" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Shampoing Réparateur Kératine 250ml</text>
        <text x="155" y="410" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Gamme Pro-Kératine Absolut Repair • Flacon Revente</text>
        <rect x="415" y="384" width="80" height="22" rx="6" fill="#eff6ff"/>
        <text x="455" y="399" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">REVENTE</text>
        <text x="535" y="400" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">6</text>
        <text x="615" y="400" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">15,00 €</text>
        <text x="720" y="400" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">90,00 €</text>

        <!-- Ligne 2 -->
        <rect x="55" y="424" width="684" height="58" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
        <text x="70" y="457" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">MAS-NUT-500</text>
        <text x="155" y="451" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Masque Intense Nutrition 500ml</text>
        <text x="155" y="468" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Soin Profond Nutritifier Sans Silicone • Pot 500ml</text>
        <rect x="415" y="442" width="80" height="22" rx="6" fill="#eff6ff"/>
        <text x="455" y="457" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">REVENTE</text>
        <text x="535" y="458" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">4</text>
        <text x="615" y="458" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">25,00 €</text>
        <text x="720" y="458" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">100,00 €</text>

        <!-- Ligne 3 -->
        <rect x="55" y="482" width="684" height="58" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
        <text x="70" y="515" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">COL-MAJ-60</text>
        <text x="155" y="509" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Tube Coloration Sans Ammoniaque 60ml</text>
        <text x="155" y="526" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Inoa Nuances Fondamentales • Consommable Laboratoire</text>
        <rect x="410" y="500" width="90" height="22" rx="6" fill="#f3e8ff"/>
        <text x="455" y="515" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#7e22ce" text-anchor="middle">LABO / CONSO</text>
        <text x="535" y="516" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">12</text>
        <text x="615" y="516" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">10,00 €</text>
        <text x="720" y="516" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">120,00 €</text>

        <!-- Encadré Totaux -->
        <rect x="449" y="575" width="290" height="132" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.2"/>
        <text x="469" y="604" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="#4b5563">Total Hors Taxes (HT)</text>
        <text x="719" y="604" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">310,00 €</text>
        <text x="469" y="632" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="#4b5563">TVA (Taux normal 20,00 %)</text>
        <text x="719" y="632" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">62,00 €</text>
        <rect x="449" y="652" width="290" height="55" rx="8" fill="#111827"/>
        <text x="469" y="685" font-family="Helvetica, Arial, sans-serif" font-size="13.5" font-weight="800" fill="#ffffff">NET À PAYER TTC</text>
        <text x="719" y="686" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="end">372,00 €</text>

        <!-- Tampon Extraction IA -->
        <rect x="55" y="575" width="365" height="132" rx="10" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1.2"/>
        <text x="75" y="602" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="800" fill="#166534">DOCUMENT ANALYSÉ PAR LE MOTEUR OCR STACK IA</text>
        <text x="75" y="624" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#15803d">• Fournisseur &amp; N° de facture reconnus automatiquement</text>
        <text x="75" y="644" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#15803d">• Contrôle de cohérence HT (310 €) + TVA (62 €) = TTC (372 €) OK</text>
        <text x="75" y="664" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#15803d">• 3 références détectées pour mise à jour directe du stock</text>
        <text x="75" y="686" font-family="Courier, monospace" font-size="10.5" font-weight="700" fill="#166534">Compte PCG affecté : 607 (Achats de marchandises)</text>
      </svg>`;

      const blob = new Blob([svgFacture], { type: 'image/svg+xml;charset=utf-8' });
      return URL.createObjectURL(blob);
  };

  // Déclenche à la demande l'un des 5 scénarios IA dans le Salon de Démo
  const lancerSimulationIA = (typeScenario) => {
      setShowSimIAMenu(false);
      const now = new Date();
      const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const demain = new Date(now);
      demain.setDate(now.getDate() + 1);
      const dans7Jours = new Date(now);
      dans7Jours.setDate(now.getDate() + 7);
      const dans9Jours = new Date(now);
      dans9Jours.setDate(now.getDate() + 9);

      const premierEmp = (employesListe || []).find(e => !e.est_gerant) || (employesListe || [])[0];
      const secondEmp = (employesListe || []).filter(e => !e.est_gerant)[1] || premierEmp;
      const premierePresta = (catalogueListe || []).find(a => a.type_article === 'PRESTATION' && (a.nom || '').toLowerCase().includes('balayage'))
          || (catalogueListe || []).find(a => a.type_article === 'PRESTATION');
      const premierProdStock = (stocksData || [])[0] || (catalogueListe || []).find(a => a.type_article === 'PRODUIT_REVENTE');

      let tacheSimulee = null;

      if (typeScenario === 'RDV') {
          tacheSimulee = {
              id_tache: `SIM_IA_RDV_${Date.now()}`,
              type_tache: 'RDV',
              donnees: {
                  nom_client: 'Camille Rocher',
                  telephone: '0688990011',
                  prestation: premierePresta?.nom || 'Balayage Minéral + Patine Gloss + Soin Profond',
                  date_heure_debut: `${formatYMD(demain)}T15:00`,
                  duree_minutes: premierePresta?.duree_estimee_minutes || 120,
                  id_employe: premierEmp?.id_employe || ''
              }
          };
      } else if (typeScenario === 'STOCK') {
          tacheSimulee = {
              id_tache: `SIM_IA_STOCK_${Date.now()}`,
              type_tache: 'STOCK',
              donnees: {
                  nom_produit: premierProdStock?.nom || 'Shampoing Réparateur Kératine 250ml',
                  quantite: 12,
                  reference: premierProdStock?.reference || 'KER-SH-250'
              }
          };
      } else if (typeScenario === 'CONGES') {
          tacheSimulee = {
              id_tache: `SIM_IA_ABSENCE_CONGES_${Date.now()}`,
              type_tache: 'ABSENCE',
              donnees: {
                  id_employe: secondEmp?.id_employe || '',
                  nom_employe: secondEmp?.nom || 'Lucas Bernard',
                  type_demande: 'CONGES',
                  date_debut: formatYMD(dans7Jours),
                  date_fin: formatYMD(dans9Jours),
                  commentaire: 'Demande de 3 jours de congés payés reçue par e-mail (week-end prolongé familial).'
              }
          };
      } else if (typeScenario === 'MALADIE') {
          tacheSimulee = {
              id_tache: `SIM_IA_ABSENCE_MALADIE_${Date.now()}`,
              type_tache: 'ABSENCE',
              donnees: {
                  id_employe: premierEmp?.id_employe || '',
                  nom_employe: premierEmp?.nom || 'Camille Laurent',
                  type_demande: 'ARRET_MALADIE',
                  date_debut: formatYMD(now),
                  date_fin: formatYMD(demain),
                  commentaire: 'Certificat médical d\'arrêt de travail (Volet 3 transmis par e-mail) — Grippe saisonnière.'
              }
          };
      } else if (typeScenario === 'FACTURE') {
          const prod1 = (stocksData || [])[0]?.nom || 'Shampoing Réparateur Kératine 250ml';
          const prod2 = (stocksData || [])[1]?.nom || 'Masque Intense Nutrition 500ml';
          const prod3 = (stocksData || [])[2]?.nom || 'Tube Coloration Sans Ammoniaque 60ml';

          tacheSimulee = {
              id_tache: `SIM_IA_FACTURE_${Date.now()}`,
              type_tache: 'FACTURE_ACHAT',
              donnees: {
                  fournisseur: "L'Oréal Professionnel France",
                  numero_facture: 'FAC-LP-2026-8841',
                  date_facture: formatYMD(now),
                  mode_paiement: 'PRELEVEMENT',
                  compte_comptable: '607',
                  montant_ht: '310.00',
                  montant_tva: '62.00',
                  montant_ttc: '372.00',
                  mime_type: 'image/svg+xml',
                  pdf_url: genererFactureExempleUrl(),
                  produits: [
                      { nom: prod1, quantite: 6, type_destine: 'REVENTE' },
                      { nom: prod2, quantite: 4, type_destine: 'REVENTE' },
                      { nom: prod3, quantite: 12, type_destine: 'CONSOMMABLE' }
                  ]
              }
          };
      }

      if (tacheSimulee) {
          setFileAttenteIA([tacheSimulee]);
          setModalIA(tacheSimulee);
      }
  };

  const validerTacheIA = async (tache) => {
      try {
          const baseId = String(tache.id_tache).replace(/_\d+$/, '');

          // --- GESTION EN DIRECT DES SIMULATIONS IA DU SALON DÉMO ---
          if (baseId.startsWith('SIM_IA_')) {
              if (tache.type_tache === 'RDV') {
                  const rawDt = tache.donnees?.date_heure_debut || '';
                  const dtFormatted = rawDt.length === 16 ? `${rawDt}:00` : rawDt;
                  const resRdv = await fetch(`${API_URL}/api/rdv`, {
                      method: 'POST',
                      headers: getAuthHeaders(true),
                      body: JSON.stringify({
                          nom_client: tache.donnees?.nom_client || 'Client',
                          telephone_client: tache.donnees?.telephone || '',
                          id_employe: tache.donnees?.id_employe || (employesListe || [])[0]?.id_employe,
                          prestation: tache.donnees?.prestation || 'Prestation',
                          date_heure_debut: dtFormatted,
                          duree_minutes: parseInt(tache.donnees?.duree_minutes, 10) || 60,
                          forcer_ajout: true
                      })
                  });
                  await handleFetchError(resRdv);
                  showToast("RDV ajouté à l'Agenda !", "success");
              } else if (tache.type_tache === 'STOCK') {
                  const nomCherche = nettoyerTexteRecherche(tache.donnees?.nom_produit || '');
                  const qteAjout = parseInt(tache.donnees?.quantite, 10) || 1;
                  const articleExistant = (stocksData || []).find(s => nettoyerTexteRecherche(s.nom) === nomCherche)
                      || (catalogueListe || []).find(a => nettoyerTexteRecherche(a.nom) === nomCherche);

                  if (articleExistant) {
                      const nvStock = (parseInt(articleExistant.stock_actuel, 10) || 0) + qteAjout;
                      await fetch(`${API_URL}/api/stocks/${articleExistant.id_article}`, {
                          method: 'PUT',
                          headers: getAuthHeaders(true),
                          body: JSON.stringify({ nouveau_stock: nvStock })
                      });
                  } else {
                      await fetch(`${API_URL}/api/catalogue`, {
                          method: 'POST',
                          headers: getAuthHeaders(true),
                          body: JSON.stringify({
                              nom: tache.donnees?.nom_produit || 'Nouveau produit',
                              type_article: 'PRODUIT_REVENTE',
                              prix: 24,
                              stock_actuel: qteAjout,
                              reference: tache.donnees?.reference || 'REF-IA-01',
                              delai_livraison_jours: 3
                          })
                      });
                  }
                  showToast(`+${qteAjout} unité(s) ajoutées dans l'inventaire !`, "success");
              } else if (tache.type_tache === 'ABSENCE') {
                  const empMatch = (employesListe || []).find(e =>
                      String(e.id_employe) === String(tache.donnees?.id_employe) ||
                      nettoyerTexteRecherche(e.nom).includes(nettoyerTexteRecherche(tache.donnees?.nom_employe || ''))
                  ) || (employesListe || [])[0];

                  const isMaladie = tache.donnees?.type_demande === 'ARRET_MALADIE';
                  const resAbs = await fetch(`${API_URL}/api/rh/absences`, {
                      method: 'POST',
                      headers: getAuthHeaders(true),
                      body: JSON.stringify({
                          id_employe: empMatch?.id_employe,
                          type_demande: isMaladie ? 'ARRET_MALADIE' : 'CONGES',
                          nature_absence: isMaladie ? 'MALADIE_ORDINAIRE' : 'CP',
                          type_prolongation: 'INITIAL',
                          date_debut: tache.donnees?.date_debut,
                          moment_debut: 'MATIN',
                          date_fin: tache.donnees?.date_fin,
                          moment_fin: 'APRES_MIDI',
                          commentaire: tache.donnees?.commentaire || ''
                      })
                  });
                  const dataAbs = await handleFetchError(resAbs);
                  showToast(isMaladie ? "Arrêt maladie enregistré !" : "Demande de congés transmise dans Équipe RH !", "success");

                  if (dataAbs.conflits && dataAbs.conflits.length > 0 && empMatch) {
                      const prenomEmp = (empMatch.nom || '').split(' ')[0];
                      setCancellationRobot({ rdvs: dataAbs.conflits, id_employe: empMatch.id_employe, nom_employe: prenomEmp });
                      setSelectedCancelRdvs(dataAbs.conflits.map(r => r.id_rdv));
                      setCancelMessageTemplate(`Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`);
                  }
              } else if (tache.type_tache === 'FACTURE_ACHAT') {
                  await fetch(`${API_URL}/api/factures/saisie-manuelle`, {
                      method: 'POST',
                      headers: getAuthHeaders(true),
                      body: JSON.stringify({
                          nom_fournisseur: tache.donnees?.fournisseur || "L'Oréal Professionnel",
                          numero_facture: tache.donnees?.numero_facture || 'FAC-LP-2026-8841',
                          date_facture: tache.donnees?.date_facture || new Date().toISOString().split('T')[0],
                          montant_ht: parseFloat(tache.donnees?.montant_ht) || 310,
                          montant_tva: parseFloat(tache.donnees?.montant_tva) || 62,
                          montant_ttc: parseFloat(tache.donnees?.montant_ttc) || 372,
                          mode_paiement: tache.donnees?.mode_paiement || 'PRELEVEMENT',
                          compte_comptable: tache.donnees?.compte_comptable || '607'
                      })
                  });

                  for (const prod of (tache.donnees?.produits || [])) {
                      const matchProd = (stocksData || []).find(s => nettoyerTexteRecherche(s.nom) === nettoyerTexteRecherche(prod.nom));
                      if (matchProd) {
                          const nvStock = (parseInt(matchProd.stock_actuel, 10) || 0) + (parseInt(prod.quantite, 10) || 0);
                          await fetch(`${API_URL}/api/stocks/${matchProd.id_article}`, {
                              method: 'PUT',
                              headers: getAuthHeaders(true),
                              body: JSON.stringify({ nouveau_stock: nvStock })
                          }).catch(() => {});
                      }
                  }
                  showToast("Facture enregistrée en Comptabilité et stocks mis à jour !", "success");
              }

              setTachesIA(prev => (prev || []).filter(t => t.id_tache !== tache.id_tache));
              setRefreshTrigger(prev => prev + 1);
              if (typeof chargerTout === 'function') chargerTout();
              passerAuDocumentSuivant(tache.id_tache);
              return;
          }

          // --- FLUX NORMAL PRODUCTION ---
          const res = await fetch(`${API_URL}/api/ia/taches/${baseId}/valider`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify(tache.donnees)
          });
          
          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.erreur || "Erreur base de données");
          }
          
          showToast("Action de l'IA confirmée !", "success");
          setTachesIA(prev => (prev || []).filter(t => t.id_tache !== tache.id_tache));
          setRefreshTrigger(prev => prev + 1);
          if (typeof chargerTout === 'function') {
              chargerTout();
          }
          passerAuDocumentSuivant(tache.id_tache);
      } catch (e) {
          showToast(`Erreur : ${e.message}`, "error");
      }
  };

  const ignorerTacheIA = async (tache) => {
      try {
          const baseId = String(tache.id_tache).replace(/_\d+$/, '');
          if (!baseId.startsWith('SIM_IA_')) {
              await fetch(`${API_URL}/api/ia/taches/${baseId}/ignorer`, {
                  method: 'POST',
                  headers: getAuthHeaders()
              });
          }
          showToast("Tâche ignorée", "info");
          setTachesIA(prev => (prev || []).filter(t => t.id_tache !== tache.id_tache && String(t.id_tache) !== String(baseId)));
          passerAuDocumentSuivant(tache.id_tache);
      } catch (e) { 
          showToast("Erreur serveur.", "error"); 
      }
  };

  const sInscrire = async () => {
    if (!isLoginMode) {
        if (!prenomGerantInput.trim() || !nomFamilleGerantInput.trim()) {
            return setErreurLogin("Veuillez remplir les DEUX cases (Prénom et Nom de famille).");
        }

        // --- 1. SÉCURITÉ MOT DE PASSE (Renforcée) ---
        if (motDePasseInput.length < 8) {
            return setErreurLogin("Le mot de passe doit contenir au moins 8 caractères.");
        }
        const passwordSimple = motDePasseInput.toLowerCase();
        if (/^(1234|azerty|qwerty|password|motdepasse)/.test(passwordSimple) || /^(\w)\1+$/.test(passwordSimple) || '0123456789'.includes(passwordSimple) || '9876543210'.includes(passwordSimple)) {
            return setErreurLogin("Mot de passe trop faible ou suite logique détectée. Sécurisez-le.");
        }
    }

    try {
      const nomCompletGerant = `${prenomGerantInput.trim()} ${nomFamilleGerantInput.trim()}`;
      
      const urlParams = new URLSearchParams(window.location.search);
      // Remplace "const code_partenaire = urlParams..." par ceci :
      const code_partenaire = codePartenaireInput.trim() || urlParams.get('partner') || undefined;
      const siret_url = urlParams.get('siret') || undefined;

      const response = await fetch(`${API_URL}/api/register`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ 
              email: emailInput, 
              mot_de_passe: motDePasseInput, 
              nom_salon: nomSalonInput, 
              nom_gerant: nomCompletGerant,
              code_partenaire: code_partenaire,
              siret: siret_url
          }) 
      });
      const data = await response.json();
      
      if (response.ok) { 
          localStorage.setItem('ui_token', data.ui_token); 
          if (data.token_api) localStorage.setItem('api_token', data.token_api); 
          
          setToken(data.ui_token); 
          setErreurLogin(null);
          
          const decoded = decodeToken(data.ui_token);
          setUserRole(decoded?.role || 'gerant');
          setIsAbonnementInactif(false); 
          
          // --- FORCE L'AFFICHAGE DU POPUP LÉGAL IMMÉDIATEMENT ---
          setTimeout(() => {
              setLegalStatut({ accepte: false, en_attente: true });
          }, 100); 
          
      } else { 
          setErreurLogin(data.erreur); 
      }
    } catch (e) { 
        console.error("Détails du crash d'inscription :", e);
        setErreurLogin(`Erreur technique : ${e.message}`); 
    }
  };

  const seConnecter = async () => {
    try {
      const endpoint = loginType === 'employe' ? `${API_URL}/api/employes/login-pin`
                      : loginType === 'salon' ? `${API_URL}/api/salon/login-pin`
                      : `${API_URL}/api/login`;
      const payload = loginType === 'employe' ? { id_salon: idSalonInput, nom_employe: nomEmployeInput, code_pin: pinEmployeInput }
                     : loginType === 'salon' ? { id_salon: idSalonInput, pin: pinSalonInput }
                     : { email: emailInput, mot_de_passe: motDePasseInput };

      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      
      if (response.ok) { 
          localStorage.setItem('ui_token', data.ui_token); if (data.token_api) localStorage.setItem('api_token', data.token_api); setToken(data.ui_token); setErreurLogin(null);
          const decoded = decodeToken(data.ui_token); 
          setUserRole(decoded?.role || 'gerant'); // 👈 Sécurité ici avec le "?"
          setIsAbonnementInactif(false);
          if(decoded?.role === 'employe') { setActiveTab('agenda'); } else { setActiveTab('accueil'); }
      } else { setErreurLogin(data.erreur); }
    } catch (e) { setErreurLogin("Mode hors-ligne ou erreur de connexion."); }
  };

  const motDePasseOublie = async () => {
      try {
          const res = await fetch(`${API_URL}/api/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput }) });
          const data = await res.json();
          setMsgSucces(data.message); setErreurLogin(null);
      } catch (e) { 
        console.error("Détails du crash de mot de passe oublié :", e);
        setErreurLogin(`Erreur technique : ${e.message}`); 
      }
  };

  const seDeconnecter = () => {
      fetch(`${API_URL}/api/logout`, { method: 'POST' }).catch(e => console.log(e));
      localStorage.removeItem('ui_token');
      localStorage.removeItem('api_token');
      localStorage.removeItem('skip_legal_sandbox');
      setToken(null);
      setIsAbonnementInactif(false);
      setUserRole('gerant');
      if (socket) socket.disconnect();
  };

  const [planEmpreinteOnboarding, setPlanEmpreinteOnboarding] = useState('PREMIUM');

  const lancerPaiementStripe = async (planChoisi = 'PREMIUM') => {
      try {
          const planFinal = typeof planChoisi === 'string' ? planChoisi : planEmpreinteOnboarding;
          const res = await fetch(`${API_URL}/api/creer-checkout`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify({ plan: planFinal })
          });
          const data = await res.json();
          if (data.url) {
              window.location.href = data.url;
          } else {
              showToast(data.erreur || "Erreur lors de la création du lien Stripe.", "error");
          }
      } catch (e) {
          showToast("Erreur réseau avec Stripe.", "error");
      }
  };

  const ouvrirFicheClient = async (client) => {
      if(isOffline) return showToast("L'historique client est désactivé hors-ligne.", "error");
      setClientSelectionne(client);
      setChargementFiche(true);
      try {
          const res = await fetch(`${API_URL}/api/clients/${client.id_client}/history`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setClientHistorique(data);
      } catch (e) { showToast("Erreur lors du chargement de l'historique.", "error"); }
      setChargementFiche(false);
  };

  const sauvegarderNotesClient = async () => {
      if(isOffline) return showToast("Impossible d'enregistrer des notes hors-ligne.", "error");
      try {
          await fetch(`${API_URL}/api/clients/${clientSelectionne.id_client}/notes`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ notes: clientHistorique.notes }) });
          showToast("Notes sauvegardées avec succès !", "success");
      } catch (e) { showToast("Erreur lors de la sauvegarde des notes.", "error"); }
  };

  
  const annulerTicket = async (id_ticket) => {
      if(isOffline) return showToast("Annulation impossible hors-ligne.", "error");
      try {
          const res = await fetch(`${API_URL}/api/caisse/tickets/${id_ticket}`, { headers: getAuthHeaders() });
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
          const res = await fetch(`${API_URL}/api/caisse/annuler-ticket/${annulationDialog.id_ticket}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
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
          const res = await fetch(`${API_URL}/api/superadmin/salons/${id_salon}/status`, {
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
                  const res = await fetch(`${API_URL}/api/superadmin/salons/${id_salon}`, {
                      method: 'DELETE', headers: getAuthHeaders()
                  });
                  const data = await handleFetchError(res);
                  showToast(data.message, "success");
                  chargerTout();
              } catch (e) { showToast(e.message || "Erreur de suppression", "error"); }
          }
      });
  };

  const ajouterClient = async () => { if(isOffline) return showToast("Désactivé hors-ligne", "error"); try { const res = await fetch(`${API_URL}/api/clients`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(newClient) }); await handleFetchError(res); setNewClient({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' }); chargerTout(); showToast("Client ajouté.", "success"); setShowAddClient(false); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerClient = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`${API_URL}/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Client supprimé.", "success"); } catch(e) { showToast("Erreur suppression client.", "error"); }};
  const ajouterEmploye = async () => { if(isOffline) return showToast("Désactivé", "error"); if(!newEmploye.prenom.trim() || !newEmploye.nomFamille.trim()) return showToast("Le prénom ET le nom sont obligatoires.", "error"); if(!newEmploye.code_pin) return showToast("Le code PIN est obligatoire.", "error"); if(isPinWeak(newEmploye.code_pin)) return showToast("Le code PIN est trop simple (évitez 0000, 1234...).", "error"); try { const payload = { ...newEmploye, nom: `${newEmploye.prenom.trim()} ${newEmploye.nomFamille.trim()}` }; const res = await fetch(`${API_URL}/api/employes`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload) }); await handleFetchError(res); setNewEmploye({ prenom: '', nomFamille: '', role: 'Employé', taux_commission_prestation: '', taux_commission_produit: '', code_pin: '', photo_url: null, type_contrat: '35H', heures_mensuelles_base: 151.67 }); chargerTout(); showToast("Employé ajouté.", "success"); setShowAddEmploye(false); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  const supprimerEmploye = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`${API_URL}/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Employé supprimé.", "success"); } catch(e) { showToast("Erreur suppression employé.", "error"); }};
  const sauvegarderModifEmploye = async () => { if(isOffline) return showToast("Désactivé", "error"); if(!modifEmployeDialog.nom.trim().includes(' ')) return showToast("Le prénom et le nom sont obligatoires.", "error"); if(modifEmployeDialog.code_pin && isPinWeak(modifEmployeDialog.code_pin)) return showToast("Le code PIN est trop simple (évitez 0000, 1234...).", "error"); try { const res = await fetch(`${API_URL}/api/employes/${modifEmployeDialog.id_employe}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nom: modifEmployeDialog.nom, code_pin: modifEmployeDialog.code_pin, taux_commission_prestation: modifEmployeDialog.taux_commission_prestation, taux_commission_produit: modifEmployeDialog.taux_commission_produit }) }); await handleFetchError(res); chargerTout(); showToast("Employé mis à jour.", "success"); setModifEmployeDialog(null); } catch(e) { if(e.message !== "Abonnement inactif") showToast(e.message, "error"); }};
  
  const ajouterArticle = async () => { 
      if(isOffline) return showToast("Désactivé hors-ligne", "error"); 
      if (newArticle.type_article === 'PRODUIT_REVENTE') { 
          if (!newArticle.reference || newArticle.reference.trim().length < 4) { 
              showToast("Veuillez saisir une référence d'au moins 4 caractères.", "error"); 
              return; 
          } 
      } 
      try { 
          const res = await fetch(`${API_URL}/api/catalogue`, { 
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
  const supprimerArticle = async (id) => { if(isOffline) return showToast("Désactivé", "error"); try { await fetch(`${API_URL}/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError); chargerTout(); showToast("Article supprimé.", "success"); } catch(e) { showToast("Erreur suppression article.", "error"); }};

  const [modifNomDialog, setModifNomDialog] = useState(null);
  const confirmerModifNom = async () => {
      if (!modifNomDialog || !modifNomDialog.nom.trim()) return showToast("Le nom ne peut pas être vide.", "error");
      try {
          const res = await fetch(`${API_URL}/api/catalogue/${modifNomDialog.id_article}/nom`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nom: modifNomDialog.nom.trim() }) });
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
          const res = await fetch(`${API_URL}/api/stocks/${modifStockDialog.id_article}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ nouveau_stock: nouveauStock }) });
          await handleFetchError(res);
          setModifStockDialog(null);
          chargerTout();
          showToast("Stock mis à jour.", "success");
      } catch (e) { showToast("Erreur lors de la mise à jour du stock.", "error"); }
  };

  // Compression légère Canvas côté client pour les photos d'étapes et de galerie de l'Académie
  const compresserImageProtocole = (file, callback) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 1100;
              let w = img.width, h = img.height;
              if (w > maxDim || h > maxDim) {
                  if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                  else { w = Math.round((w * maxDim) / h); h = maxDim; }
              }
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              callback(canvas.toDataURL('image/jpeg', 0.78));
          };
          img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
  };

  // Normalise une étape (compatibilité anciens et nouveaux protocoles)
  const normaliserEtapeUI = (etape, index = 0) => {
      if (typeof etape === 'string') {
          return { id_etape: `et_${index}`, titre: `Étape ${index + 1}`, description: etape, texte: etape, duree_minutes: 0, timer_min: '', photo_url: null, ingredients: [] };
      }
      return {
          id_etape: etape.id_etape || `et_${index}_${Date.now()}`,
          titre: etape.titre || `Étape ${index + 1}`,
          description: etape.description || etape.texte || '',
          texte: etape.description || etape.texte || '',
          duree_minutes: parseInt(etape.duree_minutes ?? etape.timer_min, 10) || 0,
          timer_min: etape.duree_minutes || etape.timer_min || '',
          photo_url: etape.photo_url || null,
          ingredients: Array.isArray(etape.ingredients) ? etape.ingredients : []
      };
  };

  // Agrège tous les ingrédients de toutes les étapes (+ ingrédients globaux éventuels) pour le calcul de rentabilité et le déstockage
  const calculerIngredientsTotauxProtocole = (proto) => {
      if (!proto) return [];
      const cumulParArticle = new Map();
      const etapesList = Array.isArray(proto.etapes) ? proto.etapes : [];
      etapesList.forEach((et, idx) => {
          const ings = Array.isArray(et?.ingredients) ? et.ingredients : [];
          ings.forEach(ing => {
              if (!ing || !ing.id_article) return;
              const key = Number(ing.id_article);
              const artCat = (catalogueListe || []).find(a => Number(a.id_article) === key);
              const qte = parseFloat(ing.quantite_necessaire) || 1;
              if (cumulParArticle.has(key)) {
                  const prev = cumulParArticle.get(key);
                  prev.quantite_necessaire = Number((prev.quantite_necessaire + qte).toFixed(2));
                  if (ing.proportion && !prev.proportions.includes(ing.proportion)) prev.proportions.push(ing.proportion);
              } else {
                  cumulParArticle.set(key, {
                      id_article: key,
                      nom: ing.nom || artCat?.nom || 'Produit technique',
                      quantite_necessaire: qte,
                      proportion: ing.proportion || '',
                      proportions: ing.proportion ? [ing.proportion] : [],
                      numero_etape: idx + 1
                  });
              }
          });
      });

      if (cumulParArticle.size === 0 && Array.isArray(proto.ingredients)) {
          return proto.ingredients;
      }
      return Array.from(cumulParArticle.values());
  };

  // Ajout d'un ingrédient dans le brouillon de la nouvelle étape en cours de création
  const ajouterIngredientBrouillonEtape = () => {
      if (!ingredientTemp.id_article) return showToast("Sélectionnez un produit du catalogue.", "error");
      const art = (catalogueListe || []).find(a => String(a.id_article) === String(ingredientTemp.id_article));
      if (!art) return;
      const qte = parseFloat(ingredientTemp.quantite_necessaire) || 1;
      const proportion = (ingredientTemp.proportion || '').trim();
      const listeActuelle = Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : [];
      setEtapeTemp({
          ...etapeTemp,
          ingredients: [
              ...listeActuelle,
              { id_article: art.id_article, nom: art.nom, quantite_necessaire: qte, proportion }
          ]
      });
      setIngredientTemp({ id_article: '', quantite_necessaire: '1', proportion: '' });
  };

  // Ajout d'un ingrédient directement sur une étape déjà créée (par son index)
  const ajouterIngredientSurEtapeExistante = (idxEtape, idArticle, quantite, proportion) => {
      if (!idArticle) return showToast("Sélectionnez un produit du catalogue.", "error");
      const art = (catalogueListe || []).find(a => String(a.id_article) === String(idArticle));
      if (!art) return;
      const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
          if (i !== idxEtape) return et;
          const ings = Array.isArray(et.ingredients) ? [...et.ingredients] : [];
          ings.push({
              id_article: art.id_article,
              nom: art.nom,
              quantite_necessaire: parseFloat(quantite) || 1,
              proportion: (proportion || '').trim()
          });
          return { ...et, ingredients: ings };
      });
      setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const supprimerIngredientDuneEtape = (idxEtape, idxIng) => {
      const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
          if (i !== idxEtape) return et;
          return { ...et, ingredients: (et.ingredients || []).filter((_, j) => j !== idxIng) };
      });
      setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const modifierChampEtapeExistante = (idxEtape, champ, valeur) => {
      const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
          if (i !== idxEtape) return et;
          const updated = { ...et, [champ]: valeur };
          if (champ === 'description') updated.texte = valeur;
          if (champ === 'duree_minutes') updated.timer_min = valeur;
          return updated;
      });
      setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const uploaderPhotoSurEtape = (e, idxEtape = null) => {
      const file = e.target.files?.[0];
      if (!file) return;
      compresserImageProtocole(file, (dataUrl) => {
          if (idxEtape === null) {
              setEtapeTemp(prev => ({ ...prev, photo_url: dataUrl }));
          } else {
              modifierChampEtapeExistante(idxEtape, 'photo_url', dataUrl);
          }
      });
      e.target.value = null;
  };

  const ajouterEtapeRecette = () => {
      const desc = (etapeTemp.description || etapeTemp.texte || '').trim();
      const titre = (etapeTemp.titre || '').trim();
      if (!desc && !titre) return showToast("Renseignez au moins le titre ou les instructions de l'étape.", "error");
      const num = (nouveauProtocole.etapes || []).length + 1;
      const duree = parseInt(etapeTemp.duree_minutes || etapeTemp.timer_min, 10) || 0;
      const nouvelleEtape = {
          id_etape: `step_${Date.now()}`,
          numero: num,
          titre: titre || `Étape ${num}`,
          description: desc,
          texte: desc,
          duree_minutes: duree,
          timer_min: duree > 0 ? String(duree) : '',
          photo_url: etapeTemp.photo_url || null,
          ingredients: Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : []
      };
      setNouveauProtocole({ ...nouveauProtocole, etapes: [...(nouveauProtocole.etapes || []), nouvelleEtape] });
      setEtapeTemp({ titre: '', description: '', texte: '', duree_minutes: '', timer_min: '', photo_url: null, ingredients: [] });
  };

  const supprimerEtapeRecette = (id_etape) => {
      setNouveauProtocole({
          ...nouveauProtocole,
          etapes: (nouveauProtocole.etapes || []).filter((e, idx) => (e.id_etape || idx) !== id_etape)
      });
  };

  const deplacerEtapeRecette = (idx, direction) => {
      const cible = idx + direction;
      const list = [...(nouveauProtocole.etapes || [])];
      if (cible < 0 || cible >= list.length) return;
      const [moved] = list.splice(idx, 1);
      list.splice(cible, 0, moved);
      setNouveauProtocole({ ...nouveauProtocole, etapes: list });
  };

  const toggleTag = (tag) => {
      const tags = (nouveauProtocole.tags || []).includes(tag) ? (nouveauProtocole.tags || []).filter(t => t !== tag) : [...(nouveauProtocole.tags || []), tag];
      setNouveauProtocole({ ...nouveauProtocole, tags });
  };

  const uploadMediaProtocole = (e, type) => {
      const file = e.target.files?.[0];
      if (!file) return;
      compresserImageProtocole(file, (dataUrl) => {
          setNouveauProtocole(prev => ({ ...prev, medias: { ...(prev.medias || {}), [type]: dataUrl } }));
      });
      e.target.value = null;
  };

  const creerProtocole = async () => {
      if (isOffline) return showToast("Action impossible hors-ligne.", "error");
      if (!nouveauProtocole.nom_prestation) return showToast("Le nom de la prestation est requis.", "error");
      try {
          const method = nouveauProtocole.id_protocole ? 'PUT' : 'POST';
          const url = nouveauProtocole.id_protocole
              ? `${API_URL}/api/protocoles/${nouveauProtocole.id_protocole}`
              : `${API_URL}/api/protocoles`;

          // Si l'utilisateur a saisi une étape dans le bloc brouillon sans avoir cliqué sur "+ Ajouter l'étape", on l'inclut automatiquement !
          let etapesFinales = [...(nouveauProtocole.etapes || [])];
          if ((etapeTemp.titre && etapeTemp.titre.trim()) || (etapeTemp.description && etapeTemp.description.trim()) || (etapeTemp.texte && etapeTemp.texte.trim())) {
              const num = etapesFinales.length + 1;
              const desc = (etapeTemp.description || etapeTemp.texte || '').trim();
              const duree = parseInt(etapeTemp.duree_minutes || etapeTemp.timer_min, 10) || 0;
              etapesFinales.push({
                  id_etape: `step_${Date.now()}`,
                  numero: num,
                  titre: (etapeTemp.titre || '').trim() || `Étape ${num}`,
                  description: desc,
                  texte: desc,
                  duree_minutes: duree,
                  timer_min: duree > 0 ? String(duree) : '',
                  photo_url: etapeTemp.photo_url || null,
                  ingredients: Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : []
              });
          }

          const ingredientsPlat = [];
          etapesFinales.forEach((et, idx) => {
              (et.ingredients || []).forEach(ing => {
                  if (ing && ing.id_article) {
                      ingredientsPlat.push({
                          id_article: ing.id_article,
                          quantite_necessaire: parseFloat(ing.quantite_necessaire) || 1,
                          numero_etape: idx + 1,
                          proportion: ing.proportion || null
                      });
                  }
              });
          });

          const payload = {
              ...nouveauProtocole,
              etapes: etapesFinales,
              ingredients: ingredientsPlat.length > 0 ? ingredientsPlat : (nouveauProtocole.ingredients || []),
              temps_nettoyage_minutes: nouveauProtocole.a_temps_nettoyage ? (parseInt(nouveauProtocole.temps_nettoyage_minutes, 10) || 5) : 0
          };

          const res = await fetch(url, { method, headers: getAuthHeaders(true), body: JSON.stringify(payload) });
          await handleFetchError(res);
          setNouveauProtocole({ nom_prestation: '', etapes: [], medias: { avant: null, pendant: null, apres: null }, tags: [], ingredients: [], temps_nettoyage_minutes: 5, a_temps_nettoyage: false });
          setEtapeTemp({ titre: '', description: '', texte: '', duree_minutes: '', timer_min: '', photo_url: null, ingredients: [] });
          setModeEditionProtocole(null);
          chargerTout();
          showToast(nouveauProtocole.id_protocole ? "Protocole mis à jour !" : "Protocole créé avec succès !", "success");
      } catch (e) { showToast("Erreur lors de la sauvegarde du protocole.", "error"); }
  };

  const supprimerProtocole = async (id) => {
      if(isOffline) return showToast("Désactivé", "error");
      try { 
          await fetch(`${API_URL}/api/protocoles/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); 
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
  
  // --- VÉRIFICATION STRICTE DU STATUT DE POINTAGE (POUR LA CAISSE) ---
  const getStatutPointageEmploye = (emp) => {
      if (!emp) return { bloque: true, code: 'INCONNU', label: 'Indisponible' };
      if (emp.est_gerant || configSalon.mode_suivi_heures !== 'POINTEUSE') {
          return { bloque: false, code: 'EN_SERVICE', label: 'En service' };
      }
      const stObj = statutsEquipe[emp.id_employe];
      const action = typeof stObj === 'string' ? stObj : stObj?.action;
      if (!action) return { bloque: true, code: 'NON_POINTE', label: 'Pas pointé' };
      if (action === 'PAUSE_DEBUT') return { bloque: true, code: 'EN_PAUSE', label: 'En pause' };
      if (action === 'SORTIE') return { bloque: true, code: 'TERMINE', label: 'Service terminé' };
      return { bloque: false, code: 'EN_SERVICE', label: 'En service' };
  };

  const employeCaisseSelectionne = (employesListe || []).find(e => e.id_employe === posEmploye);
  const statutCaisseCourant = posEmploye ? getStatutPointageEmploye(employeCaisseSelectionne) : { bloque: false, label: '' };
  const isEmployeCaisseBloque = Boolean(posEmploye && statutCaisseCourant.bloque);

  // --- LOGIQUE CLIENT, FIDÉLITÉ ET OFFRE WINBACK ---
  let clientCaisseObj = null;
  let isEligibleFidelite = false;
  let texteRecompense = '';
  let isWinbackOffer = false;

  if (clientCaisse) {
      clientCaisseObj = (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse);
      if (clientCaisseObj) {
          // 1. Priorité absolue : l'offre de sauvetage (Winback)
          if (clientCaisseObj.remise_winback) {
              isEligibleFidelite = true;
              isWinbackOffer = true;
              texteRecompense = `Offre de pardon : ${clientCaisseObj.remise_winback}`;
          } 
          // 2. Sinon, on vérifie la fidélité normale
          else if (configSalon.fidelite_type !== 'NONE') {
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
  }

  if (remiseAppliquee) {
      const tempFicheClient = (clientsListe || []).find(c => String(c.id_client) === String(clientCaisse));
      const winbackStr = tempFicheClient?.remise_winback ? String(tempFicheClient.remise_winback) : '';

      if (winbackStr) {
          const pctMatch = winbackStr.match(/(\d+(?:[.,]\d+)?)\s*%/);
          const eurMatch = winbackStr.match(/(\d+(?:[.,]\d+)?)\s*€/);
          if (pctMatch) {
              const pct = Math.min(100, Math.max(0, parseFloat(pctMatch[1].replace(',', '.')) || 0));
              totalCaisse = Math.max(0, sousTotalCaisse * (1 - pct / 100));
          } else if (eurMatch) {
              const eur = Math.max(0, parseFloat(eurMatch[1].replace(',', '.')) || 0);
              totalCaisse = Math.max(0, sousTotalCaisse - eur);
          } else {
              totalCaisse = sousTotalCaisse;
          }
      } else {
          const cleanNumber = (val) => {
              if (val === null || val === undefined) return 0;
              const m = String(val).replace(',', '.').match(/\d+(?:\.\d+)?/);
              return m ? parseFloat(m[0]) || 0 : 0;
          };
          if (configSalon.fidelite_type === 'POINTS') {
              totalCaisse = Math.max(0, sousTotalCaisse - cleanNumber(configSalon.fidelite_points_valeur));
          } else if (configSalon.fidelite_type === 'TAMPONS') {
              if (configSalon.fidelite_recompense_type === 'MONTANT') {
                  totalCaisse = Math.max(0, sousTotalCaisse - cleanNumber(configSalon.fidelite_recompense_valeur));
              } else if (configSalon.fidelite_recompense_type === 'POURCENTAGE') {
                  const pct = Math.min(100, Math.max(0, cleanNumber(configSalon.fidelite_recompense_valeur)));
                  totalCaisse = Math.max(0, sousTotalCaisse * (1 - pct / 100));
              }
          }
      }
  }

  const montantPourboireFinal = parseFloat(String(pourboireCaisse || '').replace(',', '.')) || 0;
  totalCaisse = Number.isFinite(totalCaisse) ? Number((totalCaisse + montantPourboireFinal).toFixed(2)) : 0;

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

    const payloadTPE = { montant, id_employe: posEmploye, id_client: clientCaisse || null, lignes, recompense_appliquee: remiseAppliquee, methode_paiement: methodePaiement, pourboire: montantPourboireFinal };

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
        
        setPanierCaisse([]); setClientCaisse(''); setRemiseAppliquee(false); setMethodePaiement('ESPECES'); setRechercheCaisse(''); setPourboireCaisse(''); setShowPourboireInput(false);
        showToast("Ticket sauvegardé localement (Mode Hors-Ligne)", "success");
    };

    if (vraimentHorsLigne) {
        await forcerSauvegardeLocale();
        return;
    }

    if (methodePaiement === 'CARTE' && montant > 0) setNotificationCaisse(` Envoi de l'ordre au TPE physique. En attente de la carte...`);
    
    try {
        const res = await fetch(`${API_URL}/api/caisse/payer`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payloadTPE) });
        const data = await handleFetchError(res);
        
        setNotificationCaisse(null);
        setTicketGenere({
            id_ticket: data.id_ticket, montant: montant, client_id: clientCaisse,
            client_nom: clientCaisse ? formatNomClient((clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)) : 'Client de passage',
            client_email: clientCaisse ? (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)?.email : '',
            lignes: lignes
        });
        setEmailTicketClient(clientCaisse ? (clientsListe || []).find(c => c.id_client?.toString() === clientCaisse)?.email || '' : '');
        
        setPanierCaisse([]); setClientCaisse(''); setRemiseAppliquee(false); setMethodePaiement('CARTE'); setPourboireCaisse(''); setShowPourboireInput(false);
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
      const res = await fetch(`${API_URL}/api/caisse/envoyer-ticket`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ id_ticket: ticketGenere.id_ticket, email: emailTicketClient, id_client: ticketGenere.client_id, telephone: telephoneTicketClient, methode }) });
          await handleFetchError(res);
          showToast(`Ticket envoyé par ${methode.toUpperCase()} !`, "success");
          setTicketGenere(null);
          setPosEmploye(null);
          setClientsSuggeres([]);
      } catch (e) { showToast(`Erreur d'envoi : ${e.message}`, "error"); }
  }

  const declencherExport = async () => { if(isOffline || !navigator.onLine) return showToast("Export impossible sans réseau.", "error"); showToast("Génération du PDF en cours..."); try { const response = await fetch(`${API_URL}/api/export-pdf`, { headers: getAuthHeaders() }); if (response.status === 402) { setIsAbonnementInactif(true); return; } if (!response.ok) { const errText = await response.text(); throw new Error(`Erreur Serveur: ${errText}`); } const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "Liasse_Comptable.pdf"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Liasse PDF générée et envoyée !", "success"); } catch (error) { showToast(error.message, "error"); }};

  const lancerAuditNF525 = async () => {
      if(isOffline || !navigator.onLine) return showToast("Audit impossible hors-ligne.", "error");
      showToast("Audit cryptographique en cours...", "info");
      try {
          const res = await fetch(`${API_URL}/api/admin/verifier-nf525`, { headers: getAuthHeaders(), credentials: 'include' });
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
          
          const response = await fetch(`${API_URL}/api/export-fec?date_debut=${formatYMD(firstDay)}&date_fin=${formatYMD(lastDay)}`, { headers: getAuthHeaders() }); 
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
          const response = await fetch(`${API_URL}/api/export-pdf/${date_brute}`, { headers: getAuthHeaders() });
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
              const res = await fetch(`${API_URL}/api/employes/${decodeToken(token)?.id_employe}/photo`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ photo_url: reader.result }) });
              await handleFetchError(res);
              chargerTout();
              showToast("Photo mise à jour.", "success");
          } catch (err) { showToast("Erreur lors de la mise à jour de la photo.", "error"); }
      };
      reader.readAsDataURL(file);
  };

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

  const creerRdvManuel = async (forcer = false) => {
      if(isOffline || !navigator.onLine) return showToast("Impossible de créer un RDV hors-ligne.", "error");
      try {
          const datetime = `${formRdv.date}T${formRdv.heure}:00`;
          const res = await fetch(`${API_URL}/api/rdv`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...formRdv, date_heure_debut: datetime, forcer_ajout: forcer}) });
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
          const res = await fetch(`${API_URL}/api/rh/absences`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
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

  // --- FONCTIONS : WORKFLOW DE VALIDATION COMPTABLE ---
  const chargerStatutMoisCompta = async () => {
      if (!token || decodeToken(token)?.role !== 'gerant') return;
      const today = new Date();
      let prevMonth = today.getMonth(); 
      let year = today.getFullYear();
      if (prevMonth === 0) { prevMonth = 12; year -= 1; }
      const moisAnnee = `${year}-${String(prevMonth).padStart(2, '0')}`;

      try {
          const res = await fetch(`${API_URL}/api/compta/statut-mois?mois_annee=${moisAnnee}`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setStatutMoisPrecedent({ mois: moisAnnee, libelle: new Date(year, prevMonth - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), ...data });
      } catch (e) { console.error("Erreur statut mois", e); }
  };

  useEffect(() => {
      if (activeTab === 'admin') {
          chargerStatutMoisCompta();
          chargerMouvementsCaisse();
      }
  }, [activeTab]);

  const previsualiserBrouillon = async () => {
      if (isOffline || !navigator.onLine) return showToast("Téléchargement impossible hors-ligne.", "error");
      showToast("Génération du PDF en cours...");
      try {
          const res = await fetch(`${API_URL}/api/export-pdf?mois_annee=${statutMoisPrecedent?.mois}`, { headers: getAuthHeaders() });
          if (!res.ok) throw new Error("Erreur Serveur");
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `Liasse_${statutMoisPrecedent?.mois}.pdf`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      } catch (e) { showToast("Erreur de téléchargement", "error"); }
  };

  const validerEtEnvoyerMois = async () => {
      if (!checklistCompta.caisse || !checklistCompta.paie || !checklistCompta.depenses) return showToast("Veuillez cocher toutes les vérifications de conformité.", "error");
      if (!hasSignedCompta || !signatureCanvasRef.current) return showToast("Veuillez signer dans le cadre prévu à cet effet.", "error");
      if (!pinValidationCompta || pinValidationCompta.length < 4) return showToast("Veuillez saisir votre code PIN pour sceller votre signature.", "error");
      
      const signatureBase64 = signatureCanvasRef.current.toDataURL('image/png');

      setIsValidatingCompta(true);
      try {
          const res = await fetch(`${API_URL}/api/compta/valider-mois`, {
              method: 'POST', headers: getAuthHeaders(true),
              body: JSON.stringify({
                  mois_annee: statutMoisPrecedent.mois,
                  code_pin: pinValidationCompta,
                  signature_base64: signatureBase64
              })
          });
          const data = await handleFetchError(res);
          showToast(data.message, "success");
          setShowModalValidationCompta(false);
          setChecklistCompta({ caisse: false, paie: false, depenses: false });
          setPinValidationCompta('');
          setHasSignedCompta(false);
          chargerStatutMoisCompta();
      } catch (e) {
          showToast(e.message || "Erreur lors de la validation", "error");
      } finally {
          setIsValidatingCompta(false);
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

  const [isUploadingFacture, setIsUploadingFacture] = useState(false);
  const [progressionBatch, setProgressionBatch] = useState({ actuel: 0, total: 0 });
  const [fileAttenteIA, setFileAttenteIA] = useState([]);

  const handleUploadFactureManuel = async (e) => {
      const fichiers = Array.from(e.target.files || []);
      if (fichiers.length === 0) return;

      setIsUploadingFacture(true);
      setErreurAnalyseIA(null);
      setProgressionBatch({ actuel: 0, total: fichiers.length });

      const tachesAnalysees = [];
      let erreursCount = 0;

      // Compresse automatiquement les photos lourdes (ex: iPhone) pour éviter les échecs aléatoires de l'IA
      const lireFichierOptimiseEnBase64 = (file) => new Promise((resolve, reject) => {
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  const img = new Image();
                  img.onload = () => {
                      const maxDim = 1600;
                      let w = img.width, h = img.height;
                      if (w > maxDim || h > maxDim) {
                          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                          else { w = Math.round((w * maxDim) / h); h = maxDim; }
                      }
                      const canvas = document.createElement('canvas');
                      canvas.width = w;
                      canvas.height = h;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(img, 0, 0, w, h);
                      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                      resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg' });
                  };
                  img.onerror = reject;
                  img.src = ev.target.result;
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
          } else {
              const reader = new FileReader();
              reader.onload = () => resolve({ base64: reader.result.split(',')[1], mime: file.type });
              reader.onerror = reject;
              reader.readAsDataURL(file);
          }
      });

      for (let i = 0; i < fichiers.length; i++) {
          const file = fichiers[i];
          setProgressionBatch({ actuel: i + 1, total: fichiers.length });

          const isAccepted = file.type === 'application/pdf' || file.type.startsWith('image/');
          if (!isAccepted) {
              erreursCount++;
              continue;
          }

          try {
              const { base64, mime } = await lireFichierOptimiseEnBase64(file);
              const res = await fetch(`${API_URL}/api/ia/upload-facture`, {
                  method: 'POST',
                  headers: getAuthHeaders(true),
                  body: JSON.stringify({
                      fichier_base64: base64,
                      mime_type: mime
                  })
              });

              const data = await handleFetchError(res);

              if (data && data.tache) {
                  tachesAnalysees.push({
                      ...data.tache,
                      // IMPORTANT : On garde le vrai id_tache numérique de PostgreSQL pour que "Ignorer" et "Valider" suppriment bien la tâche en BDD !
                      id_tache: data.tache.id_tache,
                      cle_file_ui: `${data.tache.id_tache}_${i}`,
                      nom_fichier_origine: file.name
                  });
              } else {
                  erreursCount++;
              }
          } catch (err) {
              erreursCount++;
          }
      }

      setIsUploadingFacture(false);
      setProgressionBatch({ actuel: 0, total: 0 });
      e.target.value = null;

      if (tachesAnalysees.length > 0) {
          setErreurAnalyseIA(null);
          setFileAttenteIA(tachesAnalysees);
          setModalIA(tachesAnalysees[0]);

          if (erreursCount > 0) {
              showToast(`${tachesAnalysees.length} document(s) prêt(s), ${erreursCount} non reconnu(s).`, "info");
          } else if (tachesAnalysees.length > 1) {
              showToast(`${tachesAnalysees.length} documents prêts pour validation.`, "success");
          } else {
              showToast("Analyse de l'IA terminée.", "success");
          }
      } else {
          setErreurAnalyseIA("Aucune facture ou dépense exploitable n'a été détectée dans ce document. Vérifiez que le fichier est bien lisible ou utilisez la Saisie Manuelle.");
      }
  };

  const enregistrerFactureManuelle = async () => {
      if (!formFactureManuelle.nom_fournisseur.trim()) return showToast("Veuillez renseigner le fournisseur.", "error");
      
      const htNum = parseFloat(String(formFactureManuelle.montant_ht).replace(',', '.'));
      const tvaNum = parseFloat(String(formFactureManuelle.montant_tva).replace(',', '.'));
      let ttcNum = parseFloat(String(formFactureManuelle.montant_ttc).replace(',', '.'));

      if ((isNaN(ttcNum) || ttcNum <= 0) && !isNaN(htNum) && htNum > 0) {
          const tvaCalc = !isNaN(tvaNum) && tvaNum >= 0
              ? tvaNum
              : (formFactureManuelle.taux_tva_select !== 'PERSO' ? htNum * ((parseFloat(formFactureManuelle.taux_tva_select) || 0) / 100) : 0);
          ttcNum = Number((htNum + tvaCalc).toFixed(2));
      }

      if (isNaN(ttcNum) || ttcNum <= 0) return showToast("Veuillez saisir un montant HT ou TTC valide.", "error");
      
      const finalHt = !isNaN(htNum) && htNum > 0
          ? Number(htNum.toFixed(2))
          : (formFactureManuelle.taux_tva_select !== 'PERSO'
              ? Number((ttcNum / (1 + (parseFloat(formFactureManuelle.taux_tva_select) || 0) / 100)).toFixed(2))
              : (!isNaN(tvaNum) ? Number((ttcNum - tvaNum).toFixed(2)) : Number((ttcNum / 1.2).toFixed(2))));
      const finalTva = !isNaN(tvaNum) && tvaNum >= 0
          ? Number(tvaNum.toFixed(2))
          : Number(Math.max(0, ttcNum - finalHt).toFixed(2));

      if (role === 'salon' && configSalon.securite_pin_salon_active !== false) {
          if (!formFactureManuelle.id_employe) return showToast("Veuillez choisir l'employé responsable.", "error");
          if (!formFactureManuelle.code_pin || formFactureManuelle.code_pin.length < 4) return showToast("Le code PIN personnel est obligatoire.", "error");
      }

      try {
          const res = await fetch(`${API_URL}/api/factures/saisie-manuelle`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify({
                  ...formFactureManuelle,
                  montant_ht: finalHt,
                  montant_tva: finalTva,
                  montant_ttc: ttcNum
              })
          });
          const data = await handleFetchError(res);
          showToast(data.message || "Facture enregistrée.", "success");
          setShowSaisieManuelleFacture(false);
          setFormFactureManuelle({
              nom_fournisseur: '',
              numero_facture: '',
              date_facture: new Date().toISOString().split('T')[0],
              montant_ht: '',
              taux_tva_select: '20',
              montant_tva: '',
              montant_ttc: '',
              mode_paiement: 'CARTE',
              compte_comptable: '607',
              id_employe: '',
              code_pin: ''
          });
          setErreurPinAction(null);
          chargerTout();
      } catch (e) {
          if (e.data) appliquerRetourPinLocal(formFactureManuelle.id_employe, e.data);
          setFormFactureManuelle({ ...formFactureManuelle, code_pin: '' });
          showToast(e.message || "Erreur lors de l'enregistrement.", "error");
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
          const res = await fetch(`${API_URL}/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ ...editRdvForm, date_heure_debut: datetime, forcer_ajout: forcer }) });
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
          const res = await fetch(`${API_URL}/api/rdv/${rdvSelectionne.id_rdv}`, { method: 'DELETE', headers: getAuthHeaders() });
          if(res.ok) { setRdvSelectionne(null); setRefreshTrigger(prev => prev + 1); showToast("Rendez-vous supprimé", "success"); }
      } catch(e) { showToast("Erreur lors de la suppression.", "error"); }
  };

  const [zDialogOuvert, setZDialogOuvert] = useState(false);
  const [zEmployeSelect, setZEmployeSelect] = useState('');
  const [zCodePin, setZCodePin] = useState('');
  
  // Nouveaux états pour la calculatrice de caisse (Blind Close)
  const [compteCaisse, setCompteCaisse] = useState({
      b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '',
      p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: ''
  });
  const [fondCaisseMatin, setFondCaisseMatin] = useState('');
  const [ecartDetecte, setEcartDetecte] = useState(null);
  const [justificationEcart, setJustificationEcart] = useState('');

  const calculerTotalCaisseReel = () => {
      return ((parseInt(compteCaisse.b500)||0) * 500) + ((parseInt(compteCaisse.b200)||0) * 200) + ((parseInt(compteCaisse.b100)||0) * 100) +
             ((parseInt(compteCaisse.b50)||0) * 50) + ((parseInt(compteCaisse.b20)||0) * 20) + ((parseInt(compteCaisse.b10)||0) * 10) + ((parseInt(compteCaisse.b5)||0) * 5) +
             ((parseInt(compteCaisse.p2)||0) * 2) + ((parseInt(compteCaisse.p1)||0) * 1) + ((parseInt(compteCaisse.p050)||0) * 0.50) + ((parseInt(compteCaisse.p020)||0) * 0.20) +
             ((parseInt(compteCaisse.p010)||0) * 0.10) + ((parseInt(compteCaisse.p005)||0) * 0.05) + ((parseInt(compteCaisse.p002)||0) * 0.02) + ((parseInt(compteCaisse.p001)||0) * 0.01);
  };

  const [erreurPinAction, setErreurPinAction] = useState(null);

  const appliquerRetourPinLocal = (empIdentifier, dataErr) => appliquerRetourPinLocalUtil(setEmployesListe, empIdentifier, dataErr);
  const getStatutBlocagePin = (empIdentifier) => getStatutBlocagePinUtil(employesListe, empIdentifier);

  const debloquerPinEmploye = async (id_employe) => {
      try {
          const res = await fetch(`${API_URL}/api/employes/${id_employe}/debloquer-pin`, {
              method: 'PUT',
              headers: getAuthHeaders(true)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.erreur || "Impossible de débloquer ce collaborateur.");
          showToast(data.message || "Code PIN débloqué avec succès", "success");
          if (typeof chargerTout === 'function') chargerTout();
      } catch (e) {
          showToast(e.message, "error");
      }
  };

  const demanderZDeCaisse = () => {
      const currentRole = decodeToken(token)?.role || userRole;
      setZEmployeSelect(currentRole === 'gerant' ? 'gerant' : '');
      setZCodePin('');
      setErreurPinAction(null);
      setCompteCaisse({ b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '', p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: '' });
      setFondCaisseMatin('');
      setEcartDetecte(null);
      setJustificationEcart('');
      setZDialogOuvert(true);
  };

  const executerZDeCaisse = async (employeNom) => {
      if(isOffline || !navigator.onLine) { setZDialogOuvert(false); return showToast("Impossible de sceller la caisse sans réseau.", "error"); }
      if (fondCaisseMatin === '' || isNaN(fondCaisseMatin)) return showToast("Le fond de caisse du matin est obligatoire.", "error");
      if (userRole === 'salon' && configSalon.securite_pin_salon_active !== false) {
          if (!employeNom) return showToast("Veuillez sélectionner le collaborateur qui clôture la caisse.", "error");
          if (!zCodePin || zCodePin.trim().length < 4) return showToast("Veuillez saisir votre code PIN personnel pour sceller la clôture.", "error");
      }
      
      const totalReel = calculerTotalCaisseReel();
      let data = {};
      
      try {
          let enAttente = [];
          try {
              enAttente = await localforage.getItem('offline_tickets') || [];
          } catch(storageErr) {
              console.warn("Stockage local indisponible :", storageErr);
          }

          if (enAttente.length > 0) { 
              try { await syncOfflineTickets(); } catch(e) {}
              let reste = [];
              try { reste = await localforage.getItem('offline_tickets') || []; } catch(e) {}
              if (reste.length > 0) { 
                  setZDialogOuvert(false); 
                  return showToast(`${reste.length} ticket(s) hors-ligne à synchroniser avant la clôture.`, "error"); 
              } 
          }
          
          const empObj = (employesListe || []).find(
              e => e.nom === employeNom || String(e.id_employe) === String(employeNom) || (String(employeNom).toLowerCase() === 'gerant' && e.est_gerant)
          );
          const payload = {
              ferme_par: empObj ? empObj.nom : (employeNom === 'gerant' ? 'Gérant' : (employeNom || 'Gérant')),
              id_employe: empObj ? empObj.id_employe : (employeNom === 'gerant' ? 'gerant' : undefined),
              code_pin: zCodePin || undefined,
              fond_caisse_matin: parseFloat(fondCaisseMatin),
              total_especes_reel: totalReel,
              justification_ecart: justificationEcart
          };
          
          const res = await fetch(`${API_URL}/api/caisse/cloture`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload) });
          data = await res.json().catch(() => ({}));
          
          if (!res.ok) {
              if (data.require_justification) {
                  setErreurPinAction(null);
                  setEcartDetecte(data.ecart);
                  showToast(data.erreur || "Écart de caisse détecté : veuillez saisir une justification ci-dessous.", "error");
                  return;
              }
              if (data.require_pin) {
                  appliquerRetourPinLocal(employeNom, data);
                  setErreurPinAction(data.erreur || "Code PIN incorrect.");
              }
              throw new Error(data.erreur || "Erreur de clôture.");
          }

          setErreurPinAction(null);
          setZDialogOuvert(false);
          showToast(data.message, "success");
          setClotureFaiteAujourdhui(true);
          setZEmployeSelect('');
          setZCodePin('');
          if (typeof chargerTout === 'function') chargerTout();
      } catch(e) { 
          if (typeof chargerTout === 'function') chargerTout();
          setZCodePin('');
          showToast(e.message || "Erreur lors de la clôture.", "error"); 
      }
  };
  // --- Rappel de clôture journalière (bandeau) ---
  const [clotureFaiteAujourdhui, setClotureFaiteAujourdhui] = useState(true);
  const [heureActuelle, setHeureActuelle] = useState(new Date());
  const [clotureAutoInfo, setClotureAutoInfo] = useState(null);
  const [alertesFermees, setAlertesFermees] = useState(() => { try { return JSON.parse(localStorage.getItem('alertesFermees')) || {}; } catch(e) { return {}; } });

  // --- Garde-Fou : Régularisation Matinale (Blind Close) ---
  const [reguCloture, setReguCloture] = useState(null);
  const [reguMontant, setReguMontant] = useState('');
  const [reguEmployeId, setReguEmployeId] = useState('');
  const [reguCodePin, setReguCodePin] = useState('');

  const verifierRegularisationMatinale = async () => {
      if (!token) return;
      try {
          const res = await fetch(`${API_URL}/api/caisse/verification-matinale`, { headers: getAuthHeaders() });
          const data = await res.json();
          if (data.necessite_regularisation) {
              setReguCloture(data.cloture);
          } else {
              setReguCloture(null);
          }
      } catch(e) {}
  };

  const soumettreRegularisation = async () => {
      if (!reguMontant || isNaN(reguMontant)) return showToast("Veuillez saisir le montant réel.", "error");
      const currentRole = decodeToken(token)?.role;
      if (currentRole === 'salon' && configSalon.securite_pin_salon_active !== false) {
          if (!reguEmployeId) return showToast("Veuillez sélectionner le collaborateur qui ouvre la caisse.", "error");
          if (!reguCodePin || reguCodePin.trim().length < 4) return showToast("Veuillez saisir votre code PIN personnel.", "error");
      }
      try {
          const payload = { 
              id_cloture: reguCloture.id_cloture, 
              montant_reel: parseFloat(reguMontant), 
              id_employe: currentRole === 'employe' ? decodeToken(token).id_employe : (reguEmployeId || null),
              code_pin: currentRole === 'salon' ? reguCodePin : undefined
          };
          const res = await fetch(`${API_URL}/api/caisse/regulariser`, {
              method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(payload)
          });
          await handleFetchError(res);
          showToast("Caisse ouverte et régularisée !", "success");
          setReguCloture(null);
          setReguMontant('');
          setReguEmployeId('');
          setReguCodePin('');
          if (typeof chargerMouvementsCaisse === 'function') chargerMouvementsCaisse();
      } catch (e) { 
          setReguCodePin('');
          showToast(e.message, "error"); 
      }
  };

  const fermerAlerte = (cle) => {
      const next = { ...alertesFermees, [cle]: true };
      setAlertesFermees(next);
      localStorage.setItem('alertesFermees', JSON.stringify(next));
  };

  const verifierStatutCloture = async () => {
      if (decodeToken(token)?.role !== 'gerant') return;
      try {
          const res = await fetch(`${API_URL}/api/caisse/cloture/statut`, { headers: getAuthHeaders() });
          const data = await handleFetchError(res);
          setClotureFaiteAujourdhui(!!data.cloture_faite);
          if (data.derniere_cloture_auto) setClotureAutoInfo(data.derniere_cloture_auto);
      } catch (e) { /* échec silencieux : on retentera au prochain intervalle */ }
  };

  useEffect(() => {
      if (!token) return;
      verifierStatutCloture();
      verifierRegularisationMatinale();
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
          const res = await fetch(`${API_URL}/api/stocks/verification/fait`, { method: 'POST', headers: getAuthHeaders() });
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
      if (!file) return;
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
          showToast("Format non supporté (JPG, PNG, WEBP ou GIF uniquement).", "error");
          e.target.value = null;
          return;
      }
      if (file.size > 4 * 1024 * 1024) {
          showToast("L'image est trop lourde (maximum 4 Mo).", "error");
          e.target.value = null;
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setMsgFile(reader.result);
      reader.readAsDataURL(file);
      e.target.value = null;
  };

  const demarrerEnregistrementVocal = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return showToast("Microphone non supporté sur cet appareil.", "error");
      }
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
              ? 'audio/webm;codecs=opus'
              : ((typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) ? 'audio/mp4' : '');
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          window.__stackAudioChunks = [];

          recorder.ondataavailable = (ev) => {
              if (ev.data && ev.data.size > 0) window.__stackAudioChunks.push(ev.data);
          };

          recorder.onstop = () => {
              stream.getTracks().forEach(t => t.stop());
              clearInterval(window.__stackRecTimer);
              setIsRecordingAudio(false);
              setRecordingSeconds(0);
              if (!window.__stackAudioChunks || window.__stackAudioChunks.length === 0) return;
              const blob = new Blob(window.__stackAudioChunks, { type: recorder.mimeType || 'audio/webm' });
              const reader = new FileReader();
              reader.onloadend = () => {
                  if (typeof reader.result === 'string') setMsgFile(reader.result);
              };
              reader.readAsDataURL(blob);
          };

          window.__stackMediaRecorder = recorder;
          recorder.start();
          setIsRecordingAudio(true);
          setRecordingSeconds(0);
          clearInterval(window.__stackRecTimer);
          window.__stackRecTimer = setInterval(() => {
              setRecordingSeconds(s => {
                  if (s >= 59) {
                      if (window.__stackMediaRecorder && window.__stackMediaRecorder.state === 'recording') {
                          window.__stackMediaRecorder.stop();
                      }
                      return 60;
                  }
                  return s + 1;
              });
          }, 1000);
      } catch (err) {
          showToast("Autorisez l'accès au microphone pour envoyer un mémo vocal.", "error");
      }
  };

  const arreterEnregistrementVocal = () => {
      if (window.__stackMediaRecorder && window.__stackMediaRecorder.state === 'recording') {
          window.__stackMediaRecorder.stop();
      }
  };

  const annulerEnregistrementVocal = () => {
      window.__stackAudioChunks = [];
      if (window.__stackMediaRecorder && window.__stackMediaRecorder.state === 'recording') {
          window.__stackMediaRecorder.onstop = () => {
              if (window.__stackMediaRecorder.stream) {
                  window.__stackMediaRecorder.stream.getTracks().forEach(t => t.stop());
              }
          };
          window.__stackMediaRecorder.stop();
      }
      clearInterval(window.__stackRecTimer);
      setIsRecordingAudio(false);
      setRecordingSeconds(0);
  };

  const envoyerMessage = async () => {
      if (!msgInput.trim() && !msgFile) return;
      try {
          const destinataire = chatActif === 'salon' ? 0 : (chatActif === 'gerant' ? null : chatActif);

          const res = await fetch(`${API_URL}/api/messages`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`
              },
              body: JSON.stringify({
                  contenu: msgInput.trim(),
                  id_destinataire: destinataire,
                  fichier_url: msgFile || null,
                  reply_to: replyToMsg || null
              })
          });

          if (res.ok) {
              const nouveauMsg = await res.json();
              setMessagesListe(prev => {
                  const liste = Array.isArray(prev) ? prev : [];
                  if (liste.some(m => Number(m.id_message) === Number(nouveauMsg.id_message))) return liste;
                  return [...liste, nouveauMsg];
              });
              setMsgInput('');
              setMsgFile(null);
              setReplyToMsg(null);
          } else {
              const errData = await res.json().catch(() => ({}));
              showToast(errData.erreur || "Erreur lors de l'envoi du message.", "error");
          }
      } catch (e) {
          showToast("Erreur réseau lors de l'envoi du message.", "error");
      }
  };
// --- MODULE 3 : SCANNER DE CODE-BARRES CAMÉRA (CAISSE & STOCKS) ---
  

  const emettreBipScan = () => {
      try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
      } catch (e) {}
  };

  const fermerScannerCodeBarre = async () => {
      if (window.__stackHtml5QrCode) {
          try {
              if (window.__stackHtml5QrCode.isScanning) {
                  await window.__stackHtml5QrCode.stop();
              }
              window.__stackHtml5QrCode.clear();
          } catch (e) {}
          window.__stackHtml5QrCode = null;
      }
      setScannerModalMode(null);
      setCodeBarreManuel('');
  };

  const traiterCodeBarreDetecte = (codeBrut, modeCible) => {
      const code = String(codeBrut || '').trim();
      if (!code) return;
      emettreBipScan();

      const articleTrouve = (catalogueListe || []).find(
          a => String(a.reference || '').trim().toLowerCase() === code.toLowerCase()
      );

      fermerScannerCodeBarre();

      if (modeCible === 'STOCKS') {
          if (articleTrouve) {
              setDernierProduitScanne(articleTrouve);
              showToast(`Produit reconnu : ${articleTrouve.nom} (Stock actuel : ${articleTrouve.stock_actuel ?? 0})`, "success");
          } else {
              setShowAddProduit(true);
              setNewArticle(prev => ({ ...prev, reference: code, type_article: 'PRODUIT_REVENTE' }));
              showToast(`Code ${code} scanné ! Référence pré-remplie pour ce nouveau produit.`, "info");
          }
      } else if (modeCible === 'CAISSE') {
          if (articleTrouve) {
              setDernierProduitScanne(articleTrouve);
              showToast(`Produit scanné : ${articleTrouve.nom} (${articleTrouve.prix} €)`, "success");
          } else {
              showToast(`Aucun produit trouvé avec le code-barres "${code}".`, "error");
          }
      }
  };

  const ouvrirScannerCodeBarre = (mode) => {
      setScannerModalMode(mode);
      setCodeBarreManuel('');
      setTimeout(() => {
          const demarrerLecteur = () => {
              if (!window.Html5Qrcode) return;
              const container = document.getElementById('stack-barcode-reader');
              if (!container) return;
              try {
                  const qr = new window.Html5Qrcode('stack-barcode-reader');
                  window.__stackHtml5QrCode = qr;
                  qr.start(
                      { facingMode: 'environment' },
                      { fps: 10, qrbox: { width: 240, height: 120 } },
                      (decodedText) => {
                          traiterCodeBarreDetecte(decodedText, mode);
                      },
                      () => {}
                  ).catch(() => {});
              } catch (e) {}
          };

          if (window.Html5Qrcode) {
              demarrerLecteur();
          } else {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
              script.onload = demarrerLecteur;
              document.body.appendChild(script);
          }
      }, 150);
  };

  // --- MODULE 4 : BONS DE COMMANDE FOURNISSEURS & RÉASSORT 3 OPTIONS ---
  const produitsEnAlerteStock = (catalogueListe || []).filter(
      a => (a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE') && (parseInt(a.stock_actuel, 10) || 0) <= 2
  );

  const ouvrirModaleReassort = () => {
      const sauvegardesMails = JSON.parse(localStorage.getItem('stack_fournisseurs_emails_v1') || '{}');
      const initFourn = fournisseurCommande || "L'Oréal Professionnel";
      setEmailFournisseurCommande(sauvegardesMails[initFourn] || '');

      const baseArticles = produitsEnAlerteStock.length > 0
          ? produitsEnAlerteStock
          : (catalogueListe || []).filter(a => a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE').slice(0, 8);

      setLignesReassort(
          baseArticles.map(a => ({
              id_article: a.id_article,
              nom: a.nom,
              reference: a.reference || '',
              stock_actuel: parseInt(a.stock_actuel, 10) || 0,
              quantite_commande: Math.max(6 - (parseInt(a.stock_actuel, 10) || 0), 3)
          }))
      );
      setShowReassortModal(true);
  };

  const changerFournisseurReassort = (nomFourn) => {
      setFournisseurCommande(nomFourn);
      const sauvegardesMails = JSON.parse(localStorage.getItem('stack_fournisseurs_emails_v1') || '{}');
      if (sauvegardesMails[nomFourn]) {
          setEmailFournisseurCommande(sauvegardesMails[nomFourn]);
      }
  };

  const copierListeReassort = () => {
      if (lignesReassort.length === 0) return;
      const texte = [
          `COMMANDE ${configSalon.nom_salon || 'SALON'} (${new Date().toLocaleDateString('fr-FR')}) - ${fournisseurCommande}`,
          ...lignesReassort.map(l => `• ${l.reference ? `[${l.reference}] ` : ''}${l.nom} : x${l.quantite_commande}`),
          noteCommande ? `\nNote : ${noteCommande}` : ''
      ].filter(Boolean).join('\n');
      navigator.clipboard?.writeText(texte);
      showToast("Liste de commande copiée ! Vous pouvez la coller sur le site fournisseur ou WhatsApp.", "success");
  };

  const telechargerBonCommandePdf = async () => {
      if (lignesReassort.length === 0) return;
      setIsSendingCommande(true);
      try {
          const res = await fetch(`${API_URL}/api/catalogue/bon-commande-pdf`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`
              },
              body: JSON.stringify({
                  fournisseur: fournisseurCommande,
                  lignes: lignesReassort,
                  commentaire: noteCommande
              })
          });
          if (!res.ok) throw new Error("Erreur PDF");
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Bon_Commande_${fournisseurCommande.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
          a.click();
          showToast("Bon de commande PDF téléchargé !", "success");
      } catch (e) {
          showToast("Erreur lors du téléchargement du PDF.", "error");
      } finally {
          setIsSendingCommande(false);
      }
  };

  const envoyerBonCommandeParMail = async () => {
      if (!emailFournisseurCommande || !emailFournisseurCommande.includes('@')) {
          return showToast("Saisissez l'e-mail du commercial (il sera mémorisé pour la prochaine fois).", "error");
      }
      const sauvegardesMails = JSON.parse(localStorage.getItem('stack_fournisseurs_emails_v1') || '{}');
      sauvegardesMails[fournisseurCommande] = emailFournisseurCommande.trim();
      localStorage.setItem('stack_fournisseurs_emails_v1', JSON.stringify(sauvegardesMails));

      setIsSendingCommande(true);
      try {
          const res = await fetch(`${API_URL}/api/catalogue/envoyer-commande`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('api_token') || token}`
              },
              body: JSON.stringify({
                  email_fournisseur: emailFournisseurCommande.trim(),
                  fournisseur: fournisseurCommande,
                  lignes: lignesReassort,
                  commentaire: noteCommande
              })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.fallback_mailto) {
              const corpsTexte = lignesReassort.map(l => `- ${l.reference ? `[${l.reference}] ` : ''}${l.nom} : x${l.quantite_commande}`).join('%0D%0A');
              window.location.href = `mailto:${emailFournisseurCommande.trim()}?subject=${encodeURIComponent(data.sujet || 'Bon de commande')}&body=${corpsTexte}`;
              showToast("Messagerie ouverte avec votre commande pré-remplie !", "info");
          } else if (res.ok) {
              showToast(data.message || "Commande envoyée au commercial !", "success");
              setShowReassortModal(false);
          } else {
              showToast(data.erreur || "Erreur lors de l'envoi.", "error");
          }
      } catch (e) {
          showToast("Erreur réseau.", "error");
      } finally {
          setIsSendingCommande(false);
      }
  };

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

  const supprimerMessage = async (id) => {
      try {
          const res = await fetch(`${API_URL}/api/messages/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
          await handleFetchError(res);
          setActiveMenuId(null);
      } catch (e) { showToast(e.message || "Erreur de suppression", "error"); }
  };

  const demarrerEdition = (msg) => {
      setEditingMsgId(msg.id_message);
      setEditMsgContent(msg.contenu);
      setActiveMenuId(null);
  };

  const validerEdition = async (id) => {
      if(!editMsgContent.trim()) return setEditingMsgId(null);
      try {
          const res = await fetch(`${API_URL}/api/messages/${id}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ contenu: editMsgContent.trim() }) });
          await handleFetchError(res);
          setEditingMsgId(null);
      } catch (e) { showToast(e.message || "Erreur de modification", "error"); }
  };

  const toggleReaction = async (id, emoji) => {
      setActiveReactionId(null);
      
      const monProfilId = role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : (role === 'salon' ? 'salon' : 'gerant');
      setMessagesListe(prev => (prev || []).map(m => {
          if (m.id_message !== id) return m;
          const rec = { ...(m.reactions || {}) };
          if (!rec[emoji]) rec[emoji] = [];
          if (rec[emoji].includes(monProfilId)) {
              rec[emoji] = rec[emoji].filter(uid => uid !== monProfilId);
              if (rec[emoji].length === 0) delete rec[emoji];
          } else {
              rec[emoji] = [...rec[emoji], monProfilId];
          }
          return { ...m, reactions: rec };
      }));

      try { 
          await fetch(`${API_URL}/api/messages/${id}/react`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ emoji }) }); 
      } catch(e) { 
          showToast("Erreur réseau", "error"); 
          chargerTout(); 
      }
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
