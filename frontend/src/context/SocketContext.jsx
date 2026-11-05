// frontend/src/context/SocketContext.jsx
// Contexte temps réel WebSockets (Socket.io) et synchronisation hors-ligne (STACK)

import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

const SocketContext = createContext(null);

export function SocketProvider({ children, token, isOffline, onPaiementValide, onNouveauRDV, onNouveauMessage, onMessageModifie, onMessageSupprime, onMessageReaction, onMessageVu, onStatutPointageUpdate }) {
  const [socket, setSocket] = useState(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  // Surveillance périodique de la file d'attente hors-ligne (localforage)
  useEffect(() => {
    const checkQueue = async () => {
      try {
        const queue = (await localforage.getItem('offline_tickets')) || [];
        setPendingOfflineCount(queue.length);
      } catch (e) {
        console.error("Erreur lecture offline_tickets:", e);
      }
    };
    checkQueue();
    const interval = setInterval(checkQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  // Gestion de la connexion Socket.io temps réel
  useEffect(() => {
    if (!token || isOffline || typeof navigator !== 'undefined' && !navigator.onLine) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const user = decodeToken(token);
    if (!user || !user.id_salon) return;

    const apiToken = localStorage.getItem('api_token');
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      timeout: 10000,
      withCredentials: true,
      auth: { token: apiToken }
    });

    newSocket.on('connect', () => {
      newSocket.emit('rejoindreSalon', user.id_salon);
    });

    if (onPaiementValide) newSocket.on('paiementValide', onPaiementValide);
    if (onNouveauRDV) newSocket.on('nouveauRDV', onNouveauRDV);
    if (onNouveauMessage) newSocket.on('nouveauMessage', onNouveauMessage);
    if (onMessageModifie) newSocket.on('messageModifie', onMessageModifie);
    if (onMessageSupprime) newSocket.on('messageSupprime', onMessageSupprime);
    if (onMessageReaction) newSocket.on('messageReaction', onMessageReaction);
    if (onMessageVu) newSocket.on('messageVu', onMessageVu);
    if (onStatutPointageUpdate) newSocket.on('statutPointageUpdate', onStatutPointageUpdate);

    newSocket.on('connect_error', () => {});

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, isOffline]);

  return (
    <SocketContext.Provider value={{ socket, pendingOfflineCount }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export default SocketContext;
