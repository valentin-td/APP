import { useState } from 'react';

/**
 * useEntitiesCRUD - Hook métier centralisant la gestion CRUD des entités du salon :
 * Clients & Historique, Collaborateurs & Équipe RH, Catalogue Produits & Inventaire Stocks,
 * Exports comptables (PDF, FEC double-partie) et Audit cryptographique NF525.
 */
export const useEntitiesCRUD = ({
  token,
  userRole,
  isOffline = false,
  showToast = () => {},
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  chargerTout = () => {},
  setIsAbonnementInactif = () => {},
  configSalon,
  setConfigSalon,
  heureActuelle = new Date(),
  API_URL,
  decodeToken = () => ({}),
  isPinWeak = () => false
}) => {
  // --- CLIENTS ---
  const [clientsListe, setClientsListe] = useState([]);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClient, setNewClient] = useState({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' });
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [clientHistorique, setClientHistorique] = useState({ rdv: [], achats: [], notes: '', gains: [] });
  const [chargementFiche, setChargementFiche] = useState(false);

  const ajouterClient = async () => {
    if (isOffline) return showToast('Désactivé hors-ligne', 'error');
    try {
      const res = await fetch(`${API_URL}/api/clients`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(newClient)
      });
      await handleFetchError(res);
      setNewClient({ prenom: '', nom: '', telephone: '', email: '', date_naissance: '' });
      chargerTout();
      showToast('Client ajouté.', 'success');
      setShowAddClient(false);
    } catch (e) {
      if (e.message !== 'Abonnement inactif') showToast(e.message, 'error');
    }
  };

  const supprimerClient = async (id) => {
    if (isOffline) return showToast('Désactivé', 'error');
    try {
      await fetch(`${API_URL}/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError);
      chargerTout();
      showToast('Client supprimé.', 'success');
    } catch (e) {
      showToast('Erreur suppression client.', 'error');
    }
  };

  const ouvrirFicheClient = async (client) => {
    if (isOffline) return showToast("L'historique client est désactivé hors-ligne.", 'error');
    setClientSelectionne(client);
    setChargementFiche(true);
    try {
      const res = await fetch(`${API_URL}/api/clients/${client.id_client}/history`, { headers: getAuthHeaders() });
      const data = await handleFetchError(res);
      setClientHistorique(data);
    } catch (e) {
      showToast("Erreur lors du chargement de l'historique.", 'error');
    }
    setChargementFiche(false);
  };

  const sauvegarderNotesClient = async () => {
    if (isOffline) return showToast("Impossible d'enregistrer des notes hors-ligne.", 'error');
    try {
      await fetch(`${API_URL}/api/clients/${clientSelectionne.id_client}/notes`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ notes: clientHistorique.notes })
      });
      showToast('Notes sauvegardées avec succès !', 'success');
    } catch (e) {
      showToast('Erreur lors de la sauvegarde des notes.', 'error');
    }
  };

  // --- COLLABORATEURS (RH) ---
  const [employesListe, setEmployesListe] = useState([]);
  const [showAddEmploye, setShowAddEmploye] = useState(false);
  const [employeMenuOuvert, setEmployeMenuOuvert] = useState(null);
  const [modifEmployeDialog, setModifEmployeDialog] = useState(null);
  const [newEmploye, setNewEmploye] = useState({
    prenom: '',
    nomFamille: '',
    role: 'Employé',
    taux_commission_prestation: '',
    taux_commission_produit: '',
    code_pin: '',
    photo_url: null,
    type_contrat: '35H',
    heures_mensuelles_base: 151.67
  });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewEmploye((prev) => ({ ...prev, photo_url: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const ajouterEmploye = async () => {
    if (isOffline) return showToast('Désactivé', 'error');
    if (!newEmploye.prenom.trim() || !newEmploye.nomFamille.trim())
      return showToast('Le prénom ET le nom sont obligatoires.', 'error');
    if (!newEmploye.code_pin) return showToast('Le code PIN est obligatoire.', 'error');
    if (isPinWeak(newEmploye.code_pin)) return showToast('Le code PIN est trop simple (évitez 0000, 1234...).', 'error');
    try {
      const payload = {
        ...newEmploye,
        nom: `${newEmploye.prenom.trim()} ${newEmploye.nomFamille.trim()}`
      };
      const res = await fetch(`${API_URL}/api/employes`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload)
      });
      await handleFetchError(res);
      setNewEmploye({
        prenom: '',
        nomFamille: '',
        role: 'Employé',
        taux_commission_prestation: '',
        taux_commission_produit: '',
        code_pin: '',
        photo_url: null,
        type_contrat: '35H',
        heures_mensuelles_base: 151.67
      });
      chargerTout();
      showToast('Employé ajouté.', 'success');
      setShowAddEmploye(false);
    } catch (e) {
      if (e.message !== 'Abonnement inactif') showToast(e.message, 'error');
    }
  };

  const supprimerEmploye = async (id) => {
    if (isOffline) return showToast('Désactivé', 'error');
    try {
      await fetch(`${API_URL}/api/employes/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError);
      chargerTout();
      showToast('Employé supprimé.', 'success');
    } catch (e) {
      showToast('Erreur suppression employé.', 'error');
    }
  };

  const sauvegarderModifEmploye = async () => {
    if (isOffline) return showToast('Désactivé', 'error');
    if (!modifEmployeDialog.nom.trim().includes(' ')) return showToast('Le prénom et le nom sont obligatoires.', 'error');
    if (modifEmployeDialog.code_pin && isPinWeak(modifEmployeDialog.code_pin))
      return showToast('Le code PIN est trop simple (évitez 0000, 1234...).', 'error');
    try {
      const res = await fetch(`${API_URL}/api/employes/${modifEmployeDialog.id_employe}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          nom: modifEmployeDialog.nom,
          code_pin: modifEmployeDialog.code_pin,
          taux_commission_prestation: modifEmployeDialog.taux_commission_prestation,
          taux_commission_produit: modifEmployeDialog.taux_commission_produit
        })
      });
      await handleFetchError(res);
      chargerTout();
      showToast('Employé mis à jour.', 'success');
      setModifEmployeDialog(null);
    } catch (e) {
      if (e.message !== 'Abonnement inactif') showToast(e.message, 'error');
    }
  };

  const modifierMaPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await fetch(`${API_URL}/api/employes/${decodeToken(token)?.id_employe}/photo`, {
          method: 'PUT',
          headers: getAuthHeaders(true),
          body: JSON.stringify({ photo_url: reader.result })
        });
        await handleFetchError(res);
        chargerTout();
        showToast('Photo mise à jour.', 'success');
      } catch (err) {
        showToast('Erreur lors de la mise à jour de la photo.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  // --- CATALOGUE & STOCKS ---
  const [catalogueListe, setCatalogueListe] = useState([]);
  const [stocksData, setStocksData] = useState([]);
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockSortBy, setStockSortBy] = useState('nom');
  const [isStockExpanded, setIsStockExpanded] = useState(true);
  const [isTachesTermineesExpanded, setIsTachesTermineesExpanded] = useState(false);
  const [stockMenuOuvert, setStockMenuOuvert] = useState(null);
  const [modifStockDialog, setModifStockDialog] = useState(null);
  const [modifNomDialog, setModifNomDialog] = useState(null);
  const [newArticle, setNewArticle] = useState({
    nom: '',
    type_article: 'PRESTATION',
    prix: '',
    stock_actuel: '',
    reference: '',
    delai_livraison_jours: 3,
    duree_estimee_minutes: 30
  });

  const ajouterArticle = async (setShowAddPrestation = () => {}) => {
    if (isOffline) return showToast('Désactivé hors-ligne', 'error');
    if (newArticle.type_article === 'PRODUIT_REVENTE') {
      if (!newArticle.reference || newArticle.reference.trim().length < 4) {
        showToast("Veuillez saisir une référence d'au moins 4 caractères.", 'error');
        return;
      }
    }
    try {
      const res = await fetch(`${API_URL}/api/catalogue`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          ...newArticle,
          delai_livraison_jours: parseInt(newArticle.delai_livraison_jours, 10) || 3
        })
      });
      const data = await handleFetchError(res);
      if (data.message && data.message.includes('Stock mis à jour')) {
        showToast(data.message, 'success');
      }
      setNewArticle({ nom: '', type_article: 'PRESTATION', prix: '', stock_actuel: '', reference: '', delai_livraison_jours: 3 });
      chargerTout();
      showToast('Catalogue mis à jour.', 'success');
      setShowAddPrestation(false);
      setShowAddProduit(false);
    } catch (e) {
      if (e.message !== 'Abonnement inactif') showToast(e.message, 'error');
    }
  };

  const supprimerArticle = async (id) => {
    if (isOffline) return showToast('Désactivé', 'error');
    try {
      await fetch(`${API_URL}/api/catalogue/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).then(handleFetchError);
      chargerTout();
      showToast('Article supprimé.', 'success');
    } catch (e) {
      showToast('Erreur suppression article.', 'error');
    }
  };

  const confirmerModifNom = async () => {
    if (!modifNomDialog || !modifNomDialog.nom.trim()) return showToast('Le nom ne peut pas être vide.', 'error');
    try {
      const res = await fetch(`${API_URL}/api/catalogue/${modifNomDialog.id_article}/nom`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ nom: modifNomDialog.nom.trim() })
      });
      await handleFetchError(res);
      setModifNomDialog(null);
      chargerTout();
      showToast('Prestation renommée.', 'success');
    } catch (e) {
      showToast(e.message || 'Erreur lors du renommage.', 'error');
    }
  };

  const confirmerModifStock = async () => {
    if (!modifStockDialog) return;
    const nouveauStock = parseInt(modifStockDialog.valeur, 10);
    if (isNaN(nouveauStock) || nouveauStock < 0) return showToast('Quantité invalide.', 'error');
    try {
      const res = await fetch(`${API_URL}/api/stocks/${modifStockDialog.id_article}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ nouveau_stock: nouveauStock })
      });
      await handleFetchError(res);
      setModifStockDialog(null);
      chargerTout();
      showToast('Stock mis à jour.', 'success');
    } catch (e) {
      showToast(e.message || 'Erreur lors de la mise à jour du stock.', 'error');
    }
  };

  const validerVerifStock = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stocks/verification/fait`, { method: 'POST', headers: getAuthHeaders() });
      await handleFetchError(res);
      setConfigSalon((prev) => ({ ...prev, derniere_verif_stock: new Date().toISOString() }));
      showToast('Vérification trimestrielle enregistrée.', 'success');
    } catch (e) {
      showToast("Erreur lors de l'enregistrement.", 'error');
    }
  };

  const afficherRappelStock = (() => {
    if (!['gerant', 'salon'].includes(decodeToken(token)?.role)) return false;
    if (!configSalon?.derniere_verif_stock) return true;
    const prochainRappel = new Date(configSalon.derniere_verif_stock);
    prochainRappel.setMonth(prochainRappel.getMonth() + 3);
    return heureActuelle >= prochainRappel;
  })();

  const getStockStatus = (q) => {
    const num = parseFloat(q);
    if (num > 20) return { bg: 'var(--bg-success)', text: 'var(--color-success)', label: 'En stock' };
    if (num >= 6) return { bg: 'var(--bg-info)', text: 'var(--color-info)', label: 'Correct' };
    if (num >= 1) return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Faible' };
    return { bg: 'var(--bg-danger)', text: 'var(--color-danger)', label: 'Rupture' };
  };

  const getTendanceStock = (produit) => {
    if (produit.jours_restants === null || produit.jours_restants === undefined) return null;
    const jours = produit.jours_restants;
    let couleur = 'var(--color-success)';
    if (jours <= 3) couleur = 'var(--color-danger)';
    else if (jours <= 10) couleur = 'var(--color-info)';
    const texte = jours <= 0 ? 'Rupture imminente' : `~${jours} j restant(s)`;
    return { texte, couleur, date: produit.date_rupture_prevue };
  };

  const dessinerCourbe = (d) => {
    if (!d || !Array.isArray(d) || d.length === 0) return null;
    const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' ');
    return (
      <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  const dessinerChronogramme = (d) => {
    if (!d || !Array.isArray(d) || d.length === 0) return null;
    const max = Math.max(...d) * 1.2 || 1;
    return (
      <svg width="100%" height="40px" viewBox={`0 0 100 40`} preserveAspectRatio="none">
        {d.map((val, i) => (
          <rect key={i} x={i * 18} y={40 - (val / max) * 40} width={10} height={(val / max) * 40} fill="var(--btn-primary)" rx="2" />
        ))}
      </svg>
    );
  };

  // --- EXPORTS & AUDIT CRYPTOGRAPHIQUE NF525 ---
  const [auditNf525, setAuditNf525] = useState(null);

  const declencherExport = async () => {
    if (isOffline || !navigator.onLine) return showToast('Export impossible sans réseau.', 'error');
    showToast('Génération du PDF en cours...');
    try {
      const response = await fetch(`${API_URL}/api/export-pdf`, { headers: getAuthHeaders() });
      if (response.status === 402) {
        setIsAbonnementInactif(true);
        return;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur Serveur: ${errText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Liasse_Comptable.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Liasse PDF générée et envoyée !', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const lancerAuditNF525 = async () => {
    if (isOffline || !navigator.onLine) return showToast('Audit impossible hors-ligne.', 'error');
    showToast('Audit cryptographique en cours...', 'info');
    try {
      const res = await fetch(`${API_URL}/api/admin/verifier-nf525`, { headers: getAuthHeaders(), credentials: 'include' });
      const data = await handleFetchError(res);
      setAuditNf525(data);
    } catch (e) {
      showToast(e.message || "Erreur lors de l'audit.", 'error');
    }
  };

  const declencherExportFEC = async () => {
    if (isOffline || !navigator.onLine) return showToast('Export impossible sans réseau.', 'error');
    showToast('Génération du FEC (Partie Double) en cours...');
    try {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const formatYMD = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const response = await fetch(`${API_URL}/api/export-fec?date_debut=${formatYMD(firstDay)}&date_fin=${formatYMD(lastDay)}`, {
        headers: getAuthHeaders()
      });
      if (response.status === 402) {
        setIsAbonnementInactif(true);
        return;
      }
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.erreur || 'Erreur Serveur');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FEC_${formatYMD(firstDay).replace(/-/g, '')}_${formatYMD(lastDay).replace(/-/g, '')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Fichier FEC téléchargé avec succès !', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const telechargerBilanJour = async (date_brute) => {
    if (isOffline || !navigator.onLine) return showToast('Téléchargement impossible hors-ligne.', 'error');
    showToast('Génération du PDF en cours...');
    try {
      const response = await fetch(`${API_URL}/api/export-pdf/${date_brute}`, { headers: getAuthHeaders() });
      if (response.status === 402) {
        setIsAbonnementInactif(true);
        return;
      }
      if (!response.ok) throw new Error('Erreur Serveur');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bilan_${date_brute}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('PDF téléchargé !', 'success');
    } catch (error) {
      showToast('Erreur lors du téléchargement.', 'error');
    }
  };

  return {
    // Clients
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
    // Employes
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
    // Catalogue & Stocks
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
    // Exports & Audit
    auditNf525,
    setAuditNf525,
    declencherExport,
    lancerAuditNF525,
    declencherExportFEC,
    telechargerBilanJour
  };
};

export default useEntitiesCRUD;
