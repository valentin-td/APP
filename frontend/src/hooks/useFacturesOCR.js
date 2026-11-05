import { useState, useEffect, useMemo } from 'react';
import { nettoyerTexteRecherche } from '../utils/text';

/**
 * useFacturesOCR - Hook métier gérant la détection, l'extraction OCR par IA,
 * la file d'attente multi-documents, les simulations du salon démo,
 * ainsi que l'upload et la saisie manuelle de factures fournisseurs.
 */
export const useFacturesOCR = ({
  token,
  role,
  configSalon,
  employesListe = [],
  catalogueListe = [],
  stocksData = [],
  isAbonnementInactif = false,
  showToast = () => {},
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  chargerTout = () => {},
  setRefreshTrigger = () => {},
  setCancellationRobot = () => {},
  setSelectedCancelRdvs = () => {},
  setCancelMessageTemplate = () => {},
  appliquerRetourPinLocal = () => {},
  setErreurPinAction = () => {},
  API_URL,
  decodeToken = () => ({})
}) => {
  const [tachesIA, setTachesIA] = useState([]);
  const [modalIA, setModalIA] = useState(null);
  const [fileAttenteIA, setFileAttenteIA] = useState([]);
  const [showSimIAMenu, setShowSimIAMenu] = useState(false);
  const [erreurAnalyseIA, setErreurAnalyseIA] = useState(null);
  const [isUploadingFacture, setIsUploadingFacture] = useState(false);
  const [progressionBatch, setProgressionBatch] = useState({ actuel: 0, total: 0 });
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
    code_pin: '',
    taux_tva_select: '20'
  });

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
  }, [token, configSalon?.nom_salon, decodeToken]);

  // Récupère les tâches IA en attente depuis la base de données
  const verifierTachesIAEnBase = async () => {
    if (!token || isAbonnementInactif || decodeToken(token)?.role !== 'gerant') return;
    try {
      const res = await fetch(`${API_URL}/api/ia/taches?_=${Date.now()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
        pragma: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        setTachesIA(data || []);
      }
    } catch (e) {
      console.error('Erreur lecture IA', e);
    }
  };

  // Connexion SSE en temps réel pour recevoir les événements IA
  useEffect(() => {
    if (!token || isAbonnementInactif || decodeToken(token)?.role !== 'gerant') return;

    const user = decodeToken(token);
    let eventSource = null;

    const ouvrirConnexionSSE = () => {
      if (eventSource) eventSource.close();
      const tokenApi = localStorage.getItem('api_token');
      const url = `${API_URL}/api/events/${user.id_salon}${tokenApi ? `?token=${encodeURIComponent(tokenApi)}` : ''}`;
      eventSource = new EventSource(url, { withCredentials: true });

      eventSource.addEventListener('connected', () => {
        console.log('%c📡 SSE connecté', 'color: #00aa00; font-weight: bold;');
      });

      eventSource.addEventListener('nouvelleTacheIA', () => {
        console.log('%c🤖 Event nouvelleTacheIA REÇU côté client', 'color: #ff0000; font-weight: bold; font-size: 14px');
        showToast("🤖 L'IA a détecté une nouvelle action !", 'success');
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

  // Sélection automatique et enrichissement de la première tâche IA
  useEffect(() => {
    if (!modalIA && tachesIA && (tachesIA || []).length > 0) {
      let premiereTache = { ...tachesIA[0] };

      if (premiereTache.type_tache === 'RDV') {
        if (!premiereTache.donnees.duree_minutes) {
          const nomPrestaIA = nettoyerTexteRecherche(premiereTache.donnees.prestation || '');
          const prestaMatch = (catalogueListe || []).find(
            (p) => p.type_article === 'PRESTATION' && nettoyerTexteRecherche(p.nom).includes(nomPrestaIA)
          );
          premiereTache.donnees.duree_minutes =
            prestaMatch && prestaMatch.duree_estimee_minutes ? prestaMatch.duree_estimee_minutes : 30;
        }
        if (!premiereTache.donnees.id_employe && premiereTache.donnees.nom_employe_suggere) {
          const nomSugg = nettoyerTexteRecherche(premiereTache.donnees.nom_employe_suggere);
          const empMatch = (employesListe || []).find((e) => nettoyerTexteRecherche(e.nom).includes(nomSugg));
          if (empMatch) premiereTache.donnees.id_employe = empMatch.id_employe;
        }
      }

      setModalIA(premiereTache);
    }
  }, [tachesIA, modalIA, catalogueListe, employesListe]);

  // Transition automatique vers la facture suivante du lot
  const passerAuDocumentSuivant = (idTacheTraitee) => {
    const resteFile = fileAttenteIA.filter((t) => t.id_tache !== idTacheTraitee);
    setFileAttenteIA(resteFile);
    if (resteFile.length > 0) {
      setModalIA(resteFile[0]);
    } else {
      setModalIA(null);
    }
  };

  // Facture SVG vectorielle haute fidélité pour simulation salon démo
  const genererFactureExempleUrl = () => {
    const dateFr = new Date().toLocaleDateString('fr-FR');
    const nomSalonCible = configSalon?.nom_salon || 'Maison Éclat — Salon Démo';
    const adresseCible = configSalon?.adresse_salon || '14 Place Kléber, 67000 Strasbourg';
    const siretCible = configSalon?.siret || '892 451 630 00018';

    const svgFacture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" width="100%" height="100%">
      <rect width="794" height="1123" fill="#ffffff"/>
      <rect width="794" height="14" fill="#111827"/>
      <text x="55" y="72" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="800" fill="#111827" letter-spacing="1">L'ORÉAL PROFESSIONNEL</text>
      <text x="55" y="92" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#6b7280" letter-spacing="2">PARIS • DIVISION PRODUITS PROFESSIONNELS</text>
      <text x="55" y="116" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#4b5563">14 Rue Royale, 75008 Paris • France</text>
      <text x="55" y="132" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#4b5563">SIRET : 632 012 100 00024 • TVA Intracom. : FR 18 632012100</text>
      <rect x="490" y="46" width="249" height="94" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.5"/>
      <text x="614" y="74" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="800" fill="#111827" text-anchor="middle">FACTURE ORIGINALE</text>
      <text x="614" y="96" font-family="Courier, monospace" font-size="13" font-weight="700" fill="#111827" text-anchor="middle">N° FAC-LP-2026-8841</text>
      <text x="614" y="116" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563" text-anchor="middle">Date d'émission : ${dateFr}</text>
      <text x="614" y="131" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#16a34a" text-anchor="middle">PRÉLÈVEMENT SEPA AUTORISÉ</text>
      <line x1="55" y1="168" x2="739" y2="168" stroke="#e5e7eb" stroke-width="1.5"/>
      <rect x="55" y="192" width="330" height="106" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.2"/>
      <text x="72" y="214" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#6b7280" letter-spacing="0.8">ÉTABLISSEMENT FACTURÉ &amp; LIVRÉ</text>
      <text x="72" y="236" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="800" fill="#111827">${nomSalonCible.replace(/&/g, '&amp;')}</text>
      <text x="72" y="256" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">${adresseCible.replace(/&/g, '&amp;')}</text>
      <text x="72" y="278" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#111827">SIRET : ${siretCible}</text>
      <rect x="409" y="192" width="330" height="106" rx="10" fill="#ffffff" stroke="#e5e7eb" stroke-width="1.2"/>
      <text x="426" y="214" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#6b7280" letter-spacing="0.8">RÉFÉRENCES LOGISTIQUES</text>
      <text x="426" y="236" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">Bon de livraison : <tspan font-weight="700" fill="#111827">BL-STR-90412</tspan></text>
      <text x="426" y="256" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#4b5563">Compte client : <tspan font-weight="700" fill="#111827">PRO-67000-ECLAT</tspan></text>
      <rect x="55" y="324" width="684" height="42" rx="8" fill="#111827"/>
      <text x="70" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff">RÉF.</text>
      <text x="155" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff">DÉSIGNATION DE L'ARTICLE</text>
      <text x="430" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff">TYPE</text>
      <text x="535" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">QTÉ</text>
      <text x="615" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="end">P.U. HT</text>
      <text x="720" y="350" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="end">TOTAL HT</text>
      <rect x="55" y="366" width="684" height="58" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
      <text x="70" y="399" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">SH-KER-250</text>
      <text x="155" y="393" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Shampoing Réparateur Kératine 250ml</text>
      <text x="155" y="410" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Série Expert Absolut Repair • Flacon Pompe 250ml</text>
      <rect x="415" y="384" width="80" height="22" rx="6" fill="#eff6ff"/>
      <text x="455" y="399" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">REVENTE</text>
      <text x="535" y="400" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">6</text>
      <text x="615" y="400" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">15,00 €</text>
      <text x="720" y="400" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">90,00 €</text>
      <rect x="55" y="424" width="684" height="58" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
      <text x="70" y="457" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">MAS-NUT-500</text>
      <text x="155" y="451" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Masque Intense Nutrition 500ml</text>
      <text x="155" y="468" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Soin Profond Nutritifier Sans Silicone • Pot 500ml</text>
      <rect x="415" y="442" width="80" height="22" rx="6" fill="#eff6ff"/>
      <text x="455" y="457" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">REVENTE</text>
      <text x="535" y="458" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">4</text>
      <text x="615" y="458" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">25,00 €</text>
      <text x="720" y="458" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">100,00 €</text>
      <rect x="55" y="482" width="684" height="58" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
      <text x="70" y="515" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#374151">COL-MAJ-60</text>
      <text x="155" y="509" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#111827">Tube Coloration Sans Ammoniaque 60ml</text>
      <text x="155" y="526" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280">Inoa Nuances Fondamentales • Consommable Laboratoire</text>
      <rect x="410" y="500" width="90" height="22" rx="6" fill="#f3e8ff"/>
      <text x="455" y="515" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#7e22ce" text-anchor="middle">LABO / CONSO</text>
      <text x="535" y="516" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#111827" text-anchor="middle">12</text>
      <text x="615" y="516" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#374151" text-anchor="end">10,00 €</text>
      <text x="720" y="516" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">120,00 €</text>
      <rect x="449" y="575" width="290" height="132" rx="10" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1.2"/>
      <text x="469" y="604" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="#4b5563">Total Hors Taxes (HT)</text>
      <text x="719" y="604" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">310,00 €</text>
      <text x="469" y="632" font-family="Helvetica, Arial, sans-serif" font-size="12.5" fill="#4b5563">TVA (Taux normal 20,00 %)</text>
      <text x="719" y="632" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827" text-anchor="end">62,00 €</text>
      <rect x="449" y="652" width="290" height="55" rx="8" fill="#111827"/>
      <text x="469" y="685" font-family="Helvetica, Arial, sans-serif" font-size="13.5" font-weight="800" fill="#ffffff">NET À PAYER TTC</text>
      <text x="719" y="686" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="end">372,00 €</text>
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

  // Déclenche à la demande l'un des scénarios IA dans le Salon de Démo
  const lancerSimulationIA = (typeScenario) => {
    setShowSimIAMenu(false);
    const now = new Date();
    const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const demain = new Date(now);
    demain.setDate(demain.getDate() + 1);
    const dans7Jours = new Date(now);
    dans7Jours.setDate(dans7Jours.getDate() + 7);
    const dans9Jours = new Date(now);
    dans9Jours.setDate(dans9Jours.getDate() + 9);

    const premierEmp = (employesListe || []).find((e) => !e.est_gerant) || (employesListe || [])[0] || { id_employe: 1, nom: 'Alexandre' };
    const secondEmp = (employesListe || []).filter((e) => !e.est_gerant)[1] || premierEmp;
    const premierePresta = (catalogueListe || []).find((a) => a.type_article === 'PRESTATION') || { nom: 'Balayage Californien + Soin Olaplex', duree_estimee_minutes: 90 };
    const premierProdStock = (stocksData || [])[0] || (catalogueListe || []).find((a) => a.type_article === 'PRODUIT_REVENTE') || { nom: 'Huile Capillaire Précieuse 100ml', reference: 'REF-HUILE-01' };

    let tacheSimulee = null;

    if (typeScenario === 'RDV_DEMAIN') {
      tacheSimulee = {
        id_tache: `SIM_IA_RDV_${Date.now()}`,
        type_tache: 'RDV',
        confiance: 0.96,
        source: 'SMS / WhatsApp',
        donnees: {
          nom_client: 'Claire De la Tour',
          telephone: '06 98 45 12 30',
          prestation: premierePresta.nom,
          duree_minutes: premierePresta.duree_estimee_minutes || 90,
          date_heure_debut: `${formatYMD(demain)}T10:00`,
          id_employe: premierEmp.id_employe,
          nom_employe_suggere: premierEmp.nom,
          note: "Message reçu : 'Bonjour Alexandre, est-ce que je pourrais venir demain vers 10h pour refaire mon balayage et un soin ? Belle journée ! Claire'"
        }
      };
    } else if (typeScenario === 'REASSORT_LIVRAISON') {
      tacheSimulee = {
        id_tache: `SIM_IA_STOCK_${Date.now()}`,
        type_tache: 'STOCK',
        confiance: 0.94,
        source: 'Bon de livraison Scanné',
        donnees: {
          nom_produit: premierProdStock.nom,
          reference: premierProdStock.reference || 'REF-SIM-99',
          quantite: 12,
          fournisseur: "L'Oréal Professionnel Paris",
          prix_achat_unitaire: 14.5,
          commentaire: 'Réception conforme du colis express #BL-8924'
        }
      };
    } else if (typeScenario === 'ARRET_MALADIE') {
      tacheSimulee = {
        id_tache: `SIM_IA_ABS_MALADIE_${Date.now()}`,
        type_tache: 'ABSENCE',
        confiance: 0.98,
        source: 'Certificat Médical Déposé',
        donnees: {
          id_employe: secondEmp.id_employe,
          nom_employe: secondEmp.nom,
          type_demande: 'ARRET_MALADIE',
          nature_absence: 'MALADIE_ORDINAIRE',
          date_debut: formatYMD(demain),
          date_fin: formatYMD(demain),
          commentaire: "Arrêt de travail initial délivré par le Dr. Martin pour le Dr. L'agent d'annulation robotique est pré-configuré."
        }
      };
    } else if (typeScenario === 'DEMANDE_CONGES') {
      tacheSimulee = {
        id_tache: `SIM_IA_ABS_CONGES_${Date.now()}`,
        type_tache: 'ABSENCE',
        confiance: 0.95,
        source: 'Demande Écrite Salarié',
        donnees: {
          id_employe: premierEmp.id_employe,
          nom_employe: premierEmp.nom,
          type_demande: 'CONGES',
          nature_absence: 'CP',
          date_debut: formatYMD(dans7Jours),
          date_fin: formatYMD(dans9Jours),
          commentaire: "Demande de 3 jours de congés payés posée par le collaborateur."
        }
      };
    } else if (typeScenario === 'FACTURE_FOURNISSEUR') {
      const prod1 = (stocksData || [])[0]?.nom || 'Shampoing Réparateur Kératine 250ml';
      const prod2 = (stocksData || [])[1]?.nom || 'Masque Intense Nutrition 500ml';
      const prod3 = (stocksData || [])[2]?.nom || 'Tube Coloration Sans Ammoniaque 60ml';

      tacheSimulee = {
        id_tache: `SIM_IA_FACT_${Date.now()}`,
        type_tache: 'FACTURE_ACHAT',
        confiance: 0.99,
        source: 'Facture PDF OCR Split-Screen',
        donnees: {
          fournisseur: "L'Oréal Professionnel",
          numero_facture: 'FAC-LP-2026-8841',
          date_facture: formatYMD(now),
          montant_ht: 310.0,
          montant_tva: 62.0,
          montant_ttc: 372.0,
          mode_paiement: 'PRELEVEMENT',
          compte_comptable: '607',
          pdf_url: genererFactureExempleUrl(),
          produits: [
            { nom: prod1, quantite: 6, prix_unitaire: 15.0, type: 'REVENTE' },
            { nom: prod2, quantite: 4, prix_unitaire: 25.0, type: 'REVENTE' },
            { nom: prod3, quantite: 12, prix_unitaire: 10.0, type: 'LABO' }
          ]
        }
      };
    }

    if (tacheSimulee) {
      setFileAttenteIA([tacheSimulee]);
      setModalIA(tacheSimulee);
    }
  };

  // Validation d'une tâche IA (production ou salon de démo)
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
          showToast("RDV ajouté à l'Agenda !", 'success');
        } else if (tache.type_tache === 'STOCK') {
          const nomCherche = nettoyerTexteRecherche(tache.donnees?.nom_produit || '');
          const qteAjout = parseInt(tache.donnees?.quantite, 10) || 1;
          const articleExistant =
            (stocksData || []).find((s) => nettoyerTexteRecherche(s.nom) === nomCherche) ||
            (catalogueListe || []).find((a) => nettoyerTexteRecherche(a.nom) === nomCherche);

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
          showToast(`+${qteAjout} unité(s) ajoutées dans l'inventaire !`, 'success');
        } else if (tache.type_tache === 'ABSENCE') {
          const empMatch =
            (employesListe || []).find(
              (e) =>
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
          showToast(isMaladie ? 'Arrêt maladie enregistré !' : 'Demande de congés transmise dans Équipe RH !', 'success');

          if (dataAbs.conflits && dataAbs.conflits.length > 0 && empMatch) {
            const prenomEmp = (empMatch.nom || '').split(' ')[0];
            setCancellationRobot({ rdvs: dataAbs.conflits, id_employe: empMatch.id_employe, nom_employe: prenomEmp });
            setSelectedCancelRdvs(dataAbs.conflits.map((r) => r.id_rdv));
            setCancelMessageTemplate(
              `Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`
            );
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

          for (const prod of tache.donnees?.produits || []) {
            const matchProd = (stocksData || []).find((s) => nettoyerTexteRecherche(s.nom) === nettoyerTexteRecherche(prod.nom));
            if (matchProd) {
              const nvStock = (parseInt(matchProd.stock_actuel, 10) || 0) + (parseInt(prod.quantite, 10) || 0);
              await fetch(`${API_URL}/api/stocks/${matchProd.id_article}`, {
                method: 'PUT',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ nouveau_stock: nvStock })
              }).catch(() => {});
            }
          }
          showToast('Facture enregistrée en Comptabilité et stocks mis à jour !', 'success');
        }

        setTachesIA((prev) => (prev || []).filter((t) => t.id_tache !== tache.id_tache));
        setRefreshTrigger((prev) => prev + 1);
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
        throw new Error(err.erreur || 'Erreur base de données');
      }

      showToast("Action de l'IA confirmée !", 'success');
      setTachesIA((prev) => (prev || []).filter((t) => t.id_tache !== tache.id_tache));
      setRefreshTrigger((prev) => prev + 1);
      if (typeof chargerTout === 'function') {
        chargerTout();
      }
      passerAuDocumentSuivant(tache.id_tache);
    } catch (e) {
      showToast(`Erreur : ${e.message}`, 'error');
    }
  };

  // Ignorer une tâche IA
  const ignorerTacheIA = async (tache) => {
    try {
      const baseId = String(tache.id_tache).replace(/_\d+$/, '');
      if (!baseId.startsWith('SIM_IA_')) {
        await fetch(`${API_URL}/api/ia/taches/${baseId}/ignorer`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
      showToast('Tâche ignorée', 'info');
      setTachesIA((prev) => (prev || []).filter((t) => t.id_tache !== tache.id_tache && String(t.id_tache) !== String(baseId)));
      passerAuDocumentSuivant(tache.id_tache);
    } catch (e) {
      showToast('Erreur serveur.', 'error');
    }
  };

  // Lecture et compression canvas base64
  const lireFichierOptimiseEnBase64 = (file) =>
    new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const maxDim = 1600;
            let w = img.width,
              h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
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

  // Upload manuel de factures et déclenchement de l'analyse OCR par IA
  const handleUploadFactureManuel = async (e) => {
    const fichiers = Array.from(e.target.files || []);
    if (fichiers.length === 0) return;

    setIsUploadingFacture(true);
    setErreurAnalyseIA(null);
    setProgressionBatch({ actuel: 0, total: fichiers.length });

    const tachesAnalysees = [];
    let erreursCount = 0;

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
        showToast(`${tachesAnalysees.length} document(s) prêt(s), ${erreursCount} non reconnu(s).`, 'info');
      } else if (tachesAnalysees.length > 1) {
        showToast(`${tachesAnalysees.length} documents prêts pour validation.`, 'success');
      } else {
        showToast("Analyse de l'IA terminée.", 'success');
      }
    } else {
      setErreurAnalyseIA(
        "Aucune facture ou dépense exploitable n'a été détectée dans ce document. Vérifiez que le fichier est bien lisible ou utilisez la Saisie Manuelle."
      );
    }
  };

  // Enregistrement manuel d'une facture fournisseur avec conformité PIN NF525
  const enregistrerFactureManuelle = async () => {
    if (!formFactureManuelle.nom_fournisseur.trim()) return showToast('Veuillez renseigner le fournisseur.', 'error');

    const htNum = parseFloat(String(formFactureManuelle.montant_ht).replace(',', '.'));
    const tvaNum = parseFloat(String(formFactureManuelle.montant_tva).replace(',', '.'));
    let ttcNum = parseFloat(String(formFactureManuelle.montant_ttc).replace(',', '.'));

    if ((isNaN(ttcNum) || ttcNum <= 0) && !isNaN(htNum) && htNum > 0) {
      const tvaCalc =
        !isNaN(tvaNum) && tvaNum >= 0
          ? tvaNum
          : formFactureManuelle.taux_tva_select !== 'PERSO'
          ? htNum * ((parseFloat(formFactureManuelle.taux_tva_select) || 0) / 100)
          : 0;
      ttcNum = Number((htNum + tvaCalc).toFixed(2));
    }

    if (isNaN(ttcNum) || ttcNum <= 0) return showToast('Veuillez saisir un montant HT ou TTC valide.', 'error');

    const finalHt =
      !isNaN(htNum) && htNum > 0
        ? Number(htNum.toFixed(2))
        : formFactureManuelle.taux_tva_select !== 'PERSO'
        ? Number((ttcNum / (1 + (parseFloat(formFactureManuelle.taux_tva_select) || 0) / 100)).toFixed(2))
        : !isNaN(tvaNum)
        ? Number((ttcNum - tvaNum).toFixed(2))
        : Number((ttcNum / 1.2).toFixed(2));
    const finalTva =
      !isNaN(tvaNum) && tvaNum >= 0 ? Number(tvaNum.toFixed(2)) : Number(Math.max(0, ttcNum - finalHt).toFixed(2));

    if (role === 'salon' && configSalon?.securite_pin_salon_active !== false) {
      if (!formFactureManuelle.id_employe) return showToast("Veuillez choisir l'employé responsable.", 'error');
      if (!formFactureManuelle.code_pin || formFactureManuelle.code_pin.length < 4)
        return showToast('Le code PIN personnel est obligatoire.', 'error');
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
      showToast(data.message || 'Facture enregistrée.', 'success');
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
      showToast(e.message || "Erreur lors de l'enregistrement.", 'error');
    }
  };

  return {
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
  };
};
