import { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';

/**
 * useOfflineSync - Hook gérant l'état réseau (en ligne / hors-ligne),
 * la file d'attente IndexedDB (`offline_tickets`), la synchronisation automatique
 * des tickets NF525 lors du rétablissement de la connexion, et les vérifications périodiques.
 */
export const useOfflineSync = ({
  token,
  API_URL,
  getAuthHeaders = () => ({}),
  showToast = () => {},
  chargerTout = () => {},
  decodeToken = () => ({}),
  setMethodePaiement = () => {},
  setTicketGenere = () => {}
}) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const syncEnCours = useRef(false);

  // Vérifie la taille de la file d'attente locale toutes les 3 secondes
  useEffect(() => {
    const checkQueue = async () => {
      try {
        const queue = (await localforage.getItem('offline_tickets')) || [];
        setPendingOfflineCount(queue.length);
      } catch (e) {
        // En cas d'erreur de stockage local, on ignore silencieusement
      }
    };
    checkQueue();
    const inter = setInterval(checkQueue, 3000);
    return () => clearInterval(inter);
  }, []);

  // Synchronisation des tickets stockés localement
  const syncOfflineTickets = async () => {
    if (!token || syncEnCours.current) return;
    const queue = (await localforage.getItem('offline_tickets')) || [];
    if (queue.length === 0) return;
    const idSalonActuel = decodeToken(token)?.id_salon;

    syncEnCours.current = true;
    showToast(`Synchronisation de ${queue.length} ticket(s) en attente...`, 'info');
    let restants = [...queue];
    let nbOk = 0,
      nbRejetes = 0,
      arret = null;

    try {
      for (const ticket of queue) {
        if (ticket._id_salon && idSalonActuel && String(ticket._id_salon) !== String(idSalonActuel)) continue;
        let res;
        try {
          res = await fetch(`${API_URL}/api/caisse/payer`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify(ticket)
          });
        } catch (e) {
          arret = 'Réseau instable, synchronisation reportée.';
          break;
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          restants = restants.filter((t) => t !== ticket);
          nbOk++;
          await localforage.setItem('offline_tickets', restants);
          setTicketGenere((prev) =>
            prev && prev.id_ticket === ticket._id_temp ? { ...prev, id_ticket: data.id_ticket, is_offline: false } : prev
          );
          continue;
        }

        const data = await res.json().catch(() => ({}));
        if ([401, 402, 403, 423].includes(res.status) || res.status >= 500) {
          arret =
            res.status === 423
              ? data.erreur || 'Clôture manquante : synchronisation reportée.'
              : res.status === 401 || res.status === 403
              ? 'Session expirée : reconnectez-vous, vos tickets sont conservés.'
              : res.status === 402
              ? 'Abonnement inactif : vos tickets sont conservés.'
              : 'Serveur indisponible, synchronisation reportée.';
          break;
        }

        const rejetes = (await localforage.getItem('offline_tickets_rejetes')) || [];
        rejetes.push({ ...ticket, _erreur: data.erreur || `Erreur ${res.status}` });
        await localforage.setItem('offline_tickets_rejetes', rejetes);
        restants = restants.filter((t) => t !== ticket);
        await localforage.setItem('offline_tickets', restants);
        nbRejetes++;
      }
    } finally {
      syncEnCours.current = false;
    }

    if (nbOk > 0) chargerTout();
    if (nbRejetes > 0)
      showToast(`${nbRejetes} ticket(s) refusé(s) par le serveur, conservés à part. Contactez le support.`, 'error');
    else if (arret) showToast(arret, 'error');
    else if (nbOk > 0) showToast('Tous les tickets hors-ligne ont été synchronisés !', 'success');
  };

  // Écoute des changements de connectivité réseau
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineTickets();
    };
    const handleOffline = () => {
      setIsOffline(true);
      setMethodePaiement('ESPECES');
    };

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

  // Tentative automatique de synchronisation toutes les 5 minutes si le réseau est revenu
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => {
      if (navigator.onLine && !syncEnCours.current) syncOfflineTickets();
    }, 300000);
    return () => clearInterval(t);
  }, [token]);

  return {
    isOffline,
    setIsOffline,
    pendingOfflineCount,
    setPendingOfflineCount,
    syncOfflineTickets,
    syncEnCours
  };
};

export default useOfflineSync;
