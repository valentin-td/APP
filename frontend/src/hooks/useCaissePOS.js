// frontend/src/hooks/useCaissePOS.js
// Hook d'orchestration de la Caisse Enregistreuse Smart POS NF525, panier, TPE et mode hors-ligne (STACK)

import { useState } from 'react';
import localforage from 'localforage';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';
import { formatNomClient } from '../utils/text';

export function useCaissePOS({
  token,
  isOffline,
  setIsOffline,
  configSalon = {},
  clientsListe = [],
  employesListe = [],
  planningData = [],
  getAuthHeaders,
  handleFetchError,
  showToast,
  chargerTout,
  setAnnulationDialog,
  annulationDialog,
  clientSelectionne,
  ouvrirFicheClient
}) {
  const [posStep, setPosStep] = useState('employee');
  const [posEmploye, setPosEmploye] = useState(null);
  const [posType, setPosType] = useState('PRESTATION');
  const [rechercheCaisse, setRechercheCaisse] = useState('');

  const [clientCaisse, setClientCaisse] = useState('');
  const [panierCaisse, setPanierCaisse] = useState([]);
  const [remiseAppliquee, setRemiseAppliquee] = useState(false);
  const [pourboireCaisse, setPourboireCaisse] = useState('');
  const [showPourboireInput, setShowPourboireInput] = useState(false);
  const [methodePaiement, setMethodePaiement] = useState('ESPECES');
  const [clientsSuggeres, setClientsSuggeres] = useState([]);
  const [notificationCaisse, setNotificationCaisse] = useState(null);

  const [ticketGenere, setTicketGenere] = useState(null);
  const [emailTicketClient, setEmailTicketClient] = useState('');
  const [telephoneTicketClient, setTelephoneTicketClient] = useState('');

  const isToday = (d) => {
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };

  const handleSelectEmployeCaisse = (id_employe) => {
    setPosEmploye(id_employe);
    const now = new Date();
    let matches = [];

    const listeRdvs = Array.isArray(planningData) ? planningData : planningData.rendez_vous || [];
    const rdvsToday = listeRdvs.filter(
      (r) => r.id_employe === id_employe && r.date_heure_debut && isToday(new Date(r.date_heure_debut.replace('Z', '')))
    );
    rdvsToday.sort(
      (a, b) => new Date(a.date_heure_debut.replace('Z', '')).getTime() - new Date(b.date_heure_debut.replace('Z', '')).getTime()
    );

    for (let rdv of rdvsToday) {
      const rdvStart = new Date(rdv.date_heure_debut.replace('Z', ''));
      const diffMinutes = (now.getTime() - rdvStart.getTime()) / 60000;

      if (diffMinutes > -30 && diffMinutes < 150) {
        let clientInCRM = null;
        if (rdv.telephone_client) {
          clientInCRM = (clientsListe || []).find((c) => c.telephone === rdv.telephone_client);
        }
        if (!clientInCRM && rdv.nom_client) {
          clientInCRM = (clientsListe || []).find(
            (c) => (c.nom || '').toLowerCase() === (rdv.nom_client || '').toLowerCase()
          );
        }
        if (clientInCRM && !matches.find((m) => m.id_client === clientInCRM.id_client)) {
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
    const exist = (panierCaisse || []).find((item) => item.id_article === article.id_article);
    if (exist) {
      setPanierCaisse(
        (panierCaisse || []).map((item) =>
          item.id_article === article.id_article ? { ...item, quantite: item.quantite + 1 } : item
        )
      );
    } else {
      setPanierCaisse([
        ...(panierCaisse || []),
        { ...article, quantite: 1, prix_unitaire: parseFloat(article.prix || 0) }
      ]);
    }
  };

  const retirerDuPanier = (id_article) => {
    setPanierCaisse((panierCaisse || []).filter((item) => item.id_article !== id_article));
  };

  const sousTotalCaisse = (panierCaisse || []).reduce(
    (acc, item) => acc + (item.prix_unitaire || 0) * (item.quantite || 0),
    0
  );
  let totalCaisse = sousTotalCaisse;

  // Logique client, fidélité et offre winback
  let clientCaisseObj = null;
  let isEligibleFidelite = false;
  let texteRecompense = '';
  let isWinbackOffer = false;

  if (clientCaisse) {
    clientCaisseObj = (clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse);
    if (clientCaisseObj) {
      if (clientCaisseObj.remise_winback) {
        isEligibleFidelite = true;
        isWinbackOffer = true;
        texteRecompense = `Offre de pardon : ${clientCaisseObj.remise_winback}`;
      } else if (configSalon.fidelite_type !== 'NONE') {
        if (
          configSalon.fidelite_type === 'POINTS' &&
          (clientCaisseObj.points_fidelite || 0) >= (configSalon.fidelite_points_seuil || 0)
        ) {
          isEligibleFidelite = true;
          texteRecompense = `-${configSalon.fidelite_points_valeur}€ offerts`;
        } else if (
          configSalon.fidelite_type === 'TAMPONS' &&
          (clientCaisseObj.tampons_fidelite || 0) >= (configSalon.fidelite_tampons_seuil || 0)
        ) {
          isEligibleFidelite = true;
          texteRecompense =
            configSalon.fidelite_recompense_type === 'MONTANT'
              ? `-${configSalon.fidelite_recompense_valeur}€ offerts`
              : configSalon.fidelite_recompense_type === 'POURCENTAGE'
              ? `-${configSalon.fidelite_recompense_valeur}% appliqués`
              : `Cadeau: ${configSalon.fidelite_recompense_valeur}`;
        }
      }
    }
  }

  if (remiseAppliquee) {
    const tempFicheClient = (clientsListe || []).find((c) => String(c.id_client) === String(clientCaisse));
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

  const lancerPaiementTPE = async (montant, lignes) => {
    const vraimentHorsLigne = isOffline || !navigator.onLine;
    if (vraimentHorsLigne !== isOffline && setIsOffline) setIsOffline(vraimentHorsLigne);

    const payloadTPE = {
      montant,
      id_employe: posEmploye,
      id_client: clientCaisse || null,
      lignes,
      recompense_appliquee: remiseAppliquee,
      methode_paiement: methodePaiement,
      pourboire: montantPourboireFinal
    };

    const forcerSauvegardeLocale = async () => {
      const offlineTicketId = `TKT-OFFLINE-${Date.now()}`;
      const offlineTicket = {
        ...payloadTPE,
        _id_temp: offlineTicketId,
        _id_salon: decodeToken(token)?.id_salon,
        date_creation: new Date().toISOString()
      };

      const queue = (await localforage.getItem('offline_tickets')) || [];
      queue.push(offlineTicket);
      await localforage.setItem('offline_tickets', queue);

      setTicketGenere({
        id_ticket: offlineTicketId,
        montant: montant,
        client_id: clientCaisse,
        client_nom: clientCaisse
          ? formatNomClient((clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse))
          : 'Client de passage',
        client_email: clientCaisse
          ? (clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse)?.email
          : '',
        lignes: lignes,
        is_offline: true
      });

      setPanierCaisse([]);
      setClientCaisse('');
      setRemiseAppliquee(false);
      setMethodePaiement('ESPECES');
      setRechercheCaisse('');
      setPourboireCaisse('');
      setShowPourboireInput(false);
      showToast?.('Ticket sauvegardé localement (Mode Hors-Ligne)', 'success');
    };

    if (vraimentHorsLigne) {
      await forcerSauvegardeLocale();
      return;
    }

    if (methodePaiement === 'CARTE' && montant > 0)
      setNotificationCaisse("Envoi de l'ordre au TPE physique. En attente de la carte...");

    try {
      const res = await fetch(`${API_URL}/api/caisse/payer`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadTPE)
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();

      setNotificationCaisse(null);
      setTicketGenere({
        id_ticket: data.id_ticket,
        montant: montant,
        client_id: clientCaisse,
        client_nom: clientCaisse
          ? formatNomClient((clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse))
          : 'Client de passage',
        client_email: clientCaisse
          ? (clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse)?.email || ''
          : '',
        lignes: lignes
      });
      setEmailTicketClient(
        clientCaisse ? (clientsListe || []).find((c) => c.id_client?.toString() === clientCaisse)?.email || '' : ''
      );

      setPanierCaisse([]);
      setClientCaisse('');
      setRemiseAppliquee(false);
      setMethodePaiement('CARTE');
      setPourboireCaisse('');
      setShowPourboireInput(false);
      if (chargerTout) chargerTout();
    } catch (error) {
      if (error.message === 'Load failed' || error.message === 'Failed to fetch' || !navigator.onLine) {
        if (setIsOffline) setIsOffline(true);
        await forcerSauvegardeLocale();
      } else if (error.message !== 'Abonnement inactif') {
        setNotificationCaisse(`❌ ${error.message || 'Erreur Caisse.'}`);
      }
    }
  };

  const validerEncaisser = () => {
    if (!posEmploye) {
      showToast?.('Veuillez sélectionner un employé.', 'error');
      return;
    }
    if ((panierCaisse || []).length === 0) {
      showToast?.('Le ticket est vide.', 'error');
      return;
    }

    const vraimentHorsLigne = isOffline || !navigator.onLine;
    if (vraimentHorsLigne && methodePaiement === 'CARTE') {
      showToast?.('Le TPE (Carte) nécessite une connexion.', 'error');
      return;
    }

    lancerPaiementTPE(totalCaisse, panierCaisse);
  };

  const envoyerTicketEco = async (methode) => {
    if (isOffline || !navigator.onLine) return showToast?.('Envoi impossible sans réseau.', 'error');
    try {
      const res = await fetch(`${API_URL}/api/caisse/envoyer-ticket`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_ticket: ticketGenere.id_ticket,
          email: emailTicketClient,
          id_client: ticketGenere.client_id,
          telephone: telephoneTicketClient,
          methode
        })
      });
      if (handleFetchError) await handleFetchError(res);
      showToast?.(`Ticket envoyé par ${methode.toUpperCase()} !`, 'success');
      setTicketGenere(null);
      setPosEmploye(null);
      setClientsSuggeres([]);
    } catch (e) {
      showToast?.(`Erreur d'envoi : ${e.message}`, 'error');
    }
  };

  const annulerTicket = async (id_ticket) => {
    if (isOffline) return showToast?.('Annulation impossible hors-ligne.', 'error');
    try {
      const res = await fetch(`${API_URL}/api/caisse/tickets/${id_ticket}`, {
        headers: getAuthHeaders ? getAuthHeaders() : {}
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      if (data.lignes.length === 0) return showToast?.('Ce ticket est déjà entièrement remboursé.', 'info');
      if (setAnnulationDialog) {
        setAnnulationDialog({ id_ticket, motif: '', lignes: data.lignes, lignes_a_annuler: [] });
      }
    } catch (e) {
      showToast?.('Erreur lors de la récupération des détails du ticket.', 'error');
    }
  };

  const confirmerAnnulationTicket = async () => {
    if (!annulationDialog) return;
    const motif = (annulationDialog.motif || '').trim();
    if (!motif) return showToast?.("Le motif d'annulation est obligatoire.", 'error');
    try {
      const payload = { motif, lignes_a_annuler: annulationDialog.lignes_a_annuler };
      const res = await fetch(`${API_URL}/api/caisse/annuler-ticket/${annulationDialog.id_ticket}`, {
        method: 'PUT',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      showToast?.(data.message || 'Ticket annulé avec succès.', 'success');
      if (setAnnulationDialog) setAnnulationDialog(null);
      if (clientSelectionne && ouvrirFicheClient) ouvrirFicheClient(clientSelectionne);
      if (chargerTout) chargerTout();
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  return {
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
  };
}

export default useCaissePOS;
