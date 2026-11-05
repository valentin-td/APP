// frontend/src/hooks/useAgendaPlanning.js
// Hook de gestion du planning agenda, détection de collisions, RDVs et absences collaborateurs (STACK)

import { useState } from 'react';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';
import { nettoyerTexteRecherche } from '../utils/text';

export const formatDateInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function useAgendaPlanning({
  token,
  isOffline,
  employesListe = [],
  catalogueListe = [],
  clientsListe = [],
  getAuthHeaders,
  handleFetchError,
  showToast,
  setRefreshTrigger,
  setConfirmDialog,
  setCancellationRobot,
  setSelectedCancelRdvs,
  setCancelMessageTemplate,
  protocoleVisible: protocoleVisibleProp,
  setProtocoleVisible: setProtocoleVisibleProp,
  chargerTout
}) {
  const [internalProtocoleVisible, setInternalProtocoleVisible] = useState(null);
  const protocoleVisible = protocoleVisibleProp !== undefined ? protocoleVisibleProp : internalProtocoleVisible;
  const setProtocoleVisible = setProtocoleVisibleProp || setInternalProtocoleVisible;
  const [filtresEmployes, setFiltresEmployes] = useState([]);
  const [expandedAbsenceDate, setExpandedAbsenceDate] = useState(null);

  const [showModalRdv, setShowModalRdv] = useState(false);
  const defaultRdvDate = formatDateInput(new Date());
  const [formRdv, setFormRdv] = useState({
    date: defaultRdvDate,
    heure: '09:00',
    nom_client: '',
    telephone_client: '',
    prestation: '',
    id_employe: '',
    duree_minutes: 30
  });

  const [showDropdownClient, setShowDropdownClient] = useState(false);
  const [showDropdownPresta, setShowDropdownPresta] = useState(false);

  const [showModalAbsence, setShowModalAbsence] = useState(false);
  const [ongletAbsence, setOngletAbsence] = useState('CONGES');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
  const [formAbsence, setFormAbsence] = useState({
    type_demande: 'CONGES',
    nature_absence: 'CP',
    type_prolongation: 'INITIAL',
    date_debut: defaultRdvDate,
    moment_debut: 'MATIN',
    date_fin: defaultRdvDate,
    moment_fin: 'APRES_MIDI',
    heures_sortie: '',
    commentaire: '',
    fichier_base64: null,
    nom_fichier: '',
    type_mime: ''
  });

  const [rdvSelectionne, setRdvSelectionne] = useState(null);
  const [isEditingRdv, setIsEditingRdv] = useState(false);
  const [editRdvForm, setEditRdvForm] = useState({
    date: defaultRdvDate,
    heure: '09:00',
    prestation: '',
    id_employe: '',
    duree_minutes: 30
  });

  const getClientsSuggeresPourRdv = (texteSaisi) => {
    const searchClean = nettoyerTexteRecherche(texteSaisi);
    if (!searchClean) return clientsListe || [];
    return (clientsListe || []).filter(
      (c) =>
        nettoyerTexteRecherche(c.nom || '').includes(searchClean) ||
        nettoyerTexteRecherche(c.telephone || '').includes(searchClean)
    );
  };

  const getPrestationsSuggeresPourRdv = (texteSaisi) => {
    const prestationsDb = (catalogueListe || []).filter((a) => a.type_article === 'PRESTATION');
    const searchClean = nettoyerTexteRecherche(texteSaisi);
    if (!searchClean) return prestationsDb;
    return prestationsDb.filter((p) => nettoyerTexteRecherche(p.nom || '').includes(searchClean));
  };

  const ouvrirRdvSelectionne = (rdv) => {
    setRdvSelectionne(rdv);
    setIsEditingRdv(false);
    const d = new Date((rdv.date_heure_debut || '').replace('Z', ''));
    setEditRdvForm({
      date: formatDateInput(d),
      heure: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      prestation: rdv.prestation,
      id_employe: rdv.id_employe || '',
      duree_minutes: rdv.duree_minutes || 30
    });
  };

  const creerRdvManuel = async (forcer = false) => {
    if (isOffline || !navigator.onLine) return showToast?.('Impossible de créer un RDV hors-ligne.', 'error');
    try {
      const datetime = `${formRdv.date}T${formRdv.heure}:00`;
      const res = await fetch(`${API_URL}/api/rdv`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formRdv, date_heure_debut: datetime, forcer_ajout: forcer })
      });
      if (res.status === 409) {
        const data = await res.json();
        setConfirmDialog?.({
          titre: "Conflit d'horaire",
          message: data.erreur,
          btnTexte: "Forcer l'ajout",
          action: () => {
            setConfirmDialog?.(null);
            creerRdvManuel(true);
          }
        });
        return;
      }
      if (res.ok) {
        setShowModalRdv(false);
        setRefreshTrigger?.((prev) => prev + 1);
        showToast?.('Rendez-vous créé', 'success');
      } else {
        const err = await res.json();
        throw new Error(err.erreur || 'Erreur de création.');
      }
    } catch (e) {
      showToast?.(e.message || 'Erreur de création.', 'error');
    }
  };

  const sauvegarderModifRdv = async (forcer = false) => {
    if (isOffline || !navigator.onLine) return showToast?.('Action impossible hors-ligne.', 'error');
    try {
      const datetime = `${editRdvForm.date}T${editRdvForm.heure}:00`;
      const res = await fetch(`${API_URL}/api/rdv/${rdvSelectionne.id_rdv}`, {
        method: 'PUT',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editRdvForm, date_heure_debut: datetime, forcer_ajout: forcer })
      });
      if (res.status === 409) {
        const data = await res.json();
        setConfirmDialog?.({
          titre: "Conflit d'horaire",
          message: data.erreur,
          btnTexte: 'Forcer la modification',
          action: () => {
            setConfirmDialog?.(null);
            sauvegarderModifRdv(true);
          }
        });
        return;
      }
      if (res.ok) {
        setRdvSelectionne(null);
        setRefreshTrigger?.((prev) => prev + 1);
        showToast?.('Rendez-vous modifié', 'success');
      } else {
        const err = await res.json();
        throw new Error(err.erreur || 'Erreur lors de la modification.');
      }
    } catch (e) {
      showToast?.(e.message || 'Erreur lors de la modification.', 'error');
    }
  };

  const executerSuppressionRdv = async () => {
    if (isOffline || !navigator.onLine) {
      setConfirmDialog?.(null);
      return showToast?.('Action impossible hors-ligne.', 'error');
    }
    setConfirmDialog?.(null);
    try {
      const res = await fetch(`${API_URL}/api/rdv/${rdvSelectionne.id_rdv}`, {
        method: 'DELETE',
        headers: getAuthHeaders ? getAuthHeaders() : {}
      });
      if (res.ok) {
        setRdvSelectionne(null);
        setRefreshTrigger?.((prev) => prev + 1);
        showToast?.('Rendez-vous supprimé', 'success');
      }
    } catch (e) {
      showToast?.('Erreur lors de la suppression.', 'error');
    }
  };

  const demanderSuppressionRdv = () => {
    setConfirmDialog?.({
      titre: 'Supprimer le rendez-vous',
      message: 'Êtes-vous sûr de vouloir annuler ce rendez-vous ? Cette action est irréversible.',
      btnTexte: 'Supprimer le RDV',
      action: executerSuppressionRdv
    });
  };

  const handleUploadJustificatifAbsence = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () =>
        setFormAbsence((prev) => ({
          ...prev,
          fichier_base64: reader.result,
          nom_fichier: file.name,
          type_mime: file.type
        }));
      reader.readAsDataURL(file);
    }
  };

  const soumettreAbsence = async () => {
    if (isOffline || !navigator.onLine) return showToast?.('Action impossible hors-ligne.', 'error');
    if (!formAbsence.date_debut || !formAbsence.date_fin) return showToast?.('Veuillez sélectionner les dates.', 'error');
    if (isSubmittingAbsence) return;

    setIsSubmittingAbsence(true);
    try {
      const payload = { ...formAbsence, type_demande: ongletAbsence };
      const res = await fetch(`${API_URL}/api/rh/absences`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      showToast?.(data.message || 'Demande transmise avec succès.', 'success');
      setShowModalAbsence(false);

      if (data.conflits && data.conflits.length > 0) {
        const empId = formAbsence.id_employe || decodeToken(token)?.id_employe;
        const nomEmp = (employesListe || []).find((e) => e.id_employe === Number(empId))?.nom || 'ce collaborateur';
        const prenomEmp = nomEmp.split(' ')[0];
        setCancellationRobot?.({ rdvs: data.conflits, id_employe: empId, nom_employe: prenomEmp });
        setSelectedCancelRdvs?.(data.conflits.map((r) => r.id_rdv));
        setCancelMessageTemplate?.(
          `Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`
        );
      } else {
        if (chargerTout) chargerTout();
        setRefreshTrigger?.((prev) => prev + 1);
      }

      setFormAbsence({
        type_demande: 'CONGES',
        nature_absence: 'CP',
        type_prolongation: 'INITIAL',
        date_debut: defaultRdvDate,
        moment_debut: 'MATIN',
        date_fin: defaultRdvDate,
        moment_fin: 'APRES_MIDI',
        heures_sortie: '',
        commentaire: '',
        fichier_base64: null,
        nom_fichier: '',
        type_mime: ''
      });
    } catch (e) {
      showToast?.(e.message || 'Erreur de soumission', 'error');
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  return {
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
    protocoleVisible,
    setProtocoleVisible,
    getClientsSuggeresPourRdv,
    getPrestationsSuggeresPourRdv,
    ouvrirRdvSelectionne,
    creerRdvManuel,
    sauvegarderModifRdv,
    demanderSuppressionRdv,
    handleUploadJustificatifAbsence,
    soumettreAbsence,
    demanderAbsence: soumettreAbsence
  };
}

export default useAgendaPlanning;
