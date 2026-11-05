// frontend/src/hooks/useInternalChat.js
// Hook de gestion de la messagerie interne temps réel, mémos vocaux et statuts de lecture (STACK)

import { useState, useEffect, useRef, useMemo } from 'react';
import localforage from 'localforage';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

// Identifie à quelle conversation (clé du contact) appartient un message
export const getCleConversation = (msg, roleUtilisateur, myId) => {
  if (Number(msg.id_destinataire) === 0) return 'salon';
  if (roleUtilisateur === 'employe') {
    if (Number(msg.id_expediteur) === Number(myId)) {
      return msg.id_destinataire === null || Number(msg.id_destinataire) === -1 ? 'gerant' : msg.id_destinataire;
    }
    if (Number(msg.id_destinataire) === Number(myId)) {
      return msg.id_expediteur === null || Number(msg.id_expediteur) === -1 ? 'gerant' : msg.id_expediteur;
    }
    return null;
  }
  if (roleUtilisateur === 'salon') {
    if ((msg.id_expediteur === -1 && msg.id_destinataire === null) || (msg.id_expediteur === null && msg.id_destinataire === -1)) return 'gerant';
  }
  const estIdentitePatron = (v) => v === null || Number(v) === -1;
  if (estIdentitePatron(msg.id_expediteur) && !estIdentitePatron(msg.id_destinataire)) return msg.id_destinataire;
  if (estIdentitePatron(msg.id_destinataire) && !estIdentitePatron(msg.id_expediteur)) return msg.id_expediteur;
  return null;
};

export function useInternalChat({
  token,
  role,
  employesListe,
  messagesListe,
  setMessagesListe,
  activeTab,
  showToast,
  getAuthHeaders,
  chargerTout,
  handleFetchError,
  setConfirmDialog
}) {
  const [chatActif, setChatActif] = useState('salon');
  const [msgInput, setMsgInput] = useState('');
  const [msgFile, setMsgFile] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editMsgContent, setEditMsgContent] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [activeReactionId, setActiveReactionId] = useState(null);
  const [vuParOuvertMsgId, setVuParOuvertMsgId] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const isSendingMsgRef = useRef(false);
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);

  // Auto-scroll doux et contrôlé
  useEffect(() => {
    if (messagesEndRef.current && activeTab === 'messagerie') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messagesListe?.length, chatActif, activeTab]);

  // --- Pastilles de messages non lus ---
  const [dernierLuParConv, setDernierLuParConv] = useState({});
  useEffect(() => {
    localforage.getItem('dernierLuParConv').then((saved) => {
      if (saved) {
        setDernierLuParConv((prev) => {
          const next = { ...saved };
          for (let k in prev) {
            next[k] = Math.max(Number(next[k]) || 0, Number(prev[k]) || 0);
          }
          return next;
        });
      }
    });
  }, []);

  // Calcule, pour chaque conversation, s'il reste des messages non lus
  const nonLusParConv = useMemo(() => {
    const roleUtilisateur = decodeToken(token)?.role;
    const myId = roleUtilisateur === 'employe' ? decodeToken(token)?.id_employe : (roleUtilisateur === 'salon' ? -1 : null);
    const map = {};

    const clesActives = new Set(['salon']);
    if (roleUtilisateur === 'employe') clesActives.add('gerant');

    const safeEmployes = Array.isArray(employesListe) ? employesListe : [];
    const safeMessages = Array.isArray(messagesListe) ? messagesListe : [];

    safeEmployes.forEach((emp) => clesActives.add(String(emp.id_employe)));

    safeMessages.forEach((m) => {
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
    (Array.isArray(messagesListe) ? messagesListe : []).forEach((m) => {
      const cle = getCleConversation(m, roleUtilisateur, myId);
      if (cle === null || cle === undefined) return;
      const id = Number(m.id_message) || 0;
      if (id > (map[cle] || 0)) map[cle] = id;
    });
    return map;
  }, [messagesListe, token]);

  // Liste des contacts triée du plus récent au plus ancien
  const contactsTries = useMemo(() => {
    const roleUtilisateur = decodeToken(token)?.role;
    const myIdActuel = decodeToken(token)?.id_employe;
    const safeEmployes = Array.isArray(employesListe) ? employesListe : [];
    let base;
    if (roleUtilisateur === 'gerant') {
      base = safeEmployes.map((emp) => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }));
    } else if (roleUtilisateur === 'salon') {
      base = [
        { key: 'gerant', nom: 'Gérant', photo_url: null },
        ...safeEmployes.map((emp) => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }))
      ];
    } else {
      base = [
        { key: 'gerant', nom: 'Gérant', photo_url: null },
        ...safeEmployes.filter((e) => e.id_employe !== myIdActuel).map((emp) => ({ key: emp.id_employe, nom: emp.nom, photo_url: emp.photo_url }))
      ];
    }
    return base.sort((a, b) => (dernierMessageParConv[b.key] || 0) - (dernierMessageParConv[a.key] || 0));
  }, [employesListe, token, dernierMessageParConv]);

  // Marque la conversation active comme lue
  const marquerConversationCommeLue = () => {
    if (activeTab !== 'messagerie') return;

    const roleUtilisateur = decodeToken(token)?.role;
    const myId = roleUtilisateur === 'employe' ? decodeToken(token)?.id_employe : (roleUtilisateur === 'salon' ? -1 : null);
    const monProfilId = roleUtilisateur === 'employe' ? `emp_${myId}` : (roleUtilisateur === 'salon' ? 'salon' : 'gerant');
    const cleActuelleStr = String(chatActif);

    const messagesConv = (messagesListe || []).filter((m) => String(getCleConversation(m, roleUtilisateur, myId)) === cleActuelleStr);
    const idsConv = messagesConv.map((m) => Number(m.id_message));

    if (idsConv.length === 0) return;
    const maxId = Math.max(...idsConv);

    setDernierLuParConv((prev) => {
      if (Number(prev[cleActuelleStr] || 0) >= maxId) return prev;
      const next = { ...prev, [cleActuelleStr]: maxId };
      localforage.setItem('dernierLuParConv', next);
      return next;
    });

    const idsAVoir = messagesConv.filter((m) => m.id_expediteur !== myId && !(Array.isArray(m.vu_par) && m.vu_par.includes(monProfilId))).map((m) => m.id_message);
    if (idsAVoir.length > 0) {
      setMessagesListe((prev) =>
        (prev || []).map((m) => {
          if (!idsAVoir.includes(m.id_message)) return m;
          const actuels = Array.isArray(m.vu_par) ? m.vu_par : [];
          return actuels.includes(monProfilId) ? m : { ...m, vu_par: [...actuels, monProfilId] };
        })
      );

      fetch(`${API_URL}/api/messages/vu`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsAVoir })
      })
        .then(async (res) => {
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            console.error('Erreur marquage vu :', res.status, d.erreur);
          }
        })
        .catch((e) => console.error('Erreur réseau marquage vu :', e));
    }
  };

  useEffect(() => {
    marquerConversationCommeLue();
  }, [chatActif, activeTab, messagesListe?.length]);

  const formatDateSeparateur = (dateStr) => {
    const d = new Date(dateStr);
    const maintenant = new Date();
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    if (d.toDateString() === maintenant.toDateString()) return "Aujourd'hui";
    if (d.toDateString() === hier.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== maintenant.getFullYear() ? 'numeric' : undefined
    });
  };

  const resoudreProfilVu = (idProfil) => {
    if (idProfil === 'gerant') return { nom: 'Gérant', photo_url: null };
    if (idProfil === 'salon') return { nom: 'Salon', photo_url: null };
    const idEmp = parseInt(String(idProfil).replace('emp_', ''));
    const emp = (employesListe || []).find((e) => e.id_employe === idEmp);
    return { nom: emp?.nom || 'Employé', photo_url: emp?.photo_url || null };
  };

  const handleChatFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      showToast?.('Format non supporté (JPG, PNG, WEBP ou GIF uniquement).', 'error');
      e.target.value = null;
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      showToast?.("L'image est trop lourde (maximum 4 Mo).", 'error');
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
      return showToast?.('Microphone non supporté sur cet appareil.', 'error');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      window.__stackAudioChunks = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) window.__stackAudioChunks.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
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
        setRecordingSeconds((s) => {
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
      showToast?.("Autorisez l'accès au microphone pour envoyer un mémo vocal.", 'error');
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
          window.__stackMediaRecorder.stream.getTracks().forEach((t) => t.stop());
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
      const destinataire = chatActif === 'salon' ? 0 : chatActif === 'gerant' ? null : chatActif;

      const res = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`
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
        setMessagesListe((prev) => {
          const liste = Array.isArray(prev) ? prev : [];
          if (liste.some((m) => Number(m.id_message) === Number(nouveauMsg.id_message))) return liste;
          return [...liste, nouveauMsg];
        });
        setMsgInput('');
        setMsgFile(null);
        setReplyToMsg(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast?.(errData.erreur || "Erreur lors de l'envoi du message.", 'error');
      }
    } catch (e) {
      showToast?.("Erreur réseau lors de l'envoi du message.", 'error');
    }
  };

  const demarrerEdition = (msg) => {
    setEditingMsgId(msg.id_message);
    setEditMsgContent(msg.contenu);
    setActiveMenuId(null);
  };

  const validerEdition = async (id) => {
    if (!editMsgContent.trim()) return setEditingMsgId(null);
    try {
      const res = await fetch(`${API_URL}/api/messages/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: editMsgContent.trim() })
      });
      if (handleFetchError) await handleFetchError(res);
      setEditingMsgId(null);
    } catch (e) {
      showToast?.(e.message || 'Erreur de modification', 'error');
    }
  };

  const demanderSuppressionMessage = (id) => {
    if (setConfirmDialog) {
      setConfirmDialog({
        title: 'Supprimer ce message ?',
        message: 'Cette action est irréversible pour tous les membres du salon.',
        onConfirm: async () => {
          try {
            const res = await fetch(`${API_URL}/api/messages/${id}`, {
              method: 'DELETE',
              headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' }
            });
            if (handleFetchError) await handleFetchError(res);
            setConfirmDialog(null);
          } catch (e) {
            showToast?.(e.message || 'Erreur de suppression', 'error');
          }
        }
      });
    }
  };

  const toggleReaction = async (id, emoji) => {
    setActiveReactionId(null);
    const monProfilId = role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : role === 'salon' ? 'salon' : 'gerant';
    setMessagesListe((prev) =>
      (prev || []).map((m) => {
        if (m.id_message !== id) return m;
        const rec = { ...(m.reactions || {}) };
        if (!rec[emoji]) rec[emoji] = [];
        if (rec[emoji].includes(monProfilId)) {
          rec[emoji] = rec[emoji].filter((uid) => uid !== monProfilId);
          if (rec[emoji].length === 0) delete rec[emoji];
        } else {
          rec[emoji] = [...rec[emoji], monProfilId];
        }
        return { ...m, reactions: rec };
      })
    );

    try {
      await fetch(`${API_URL}/api/messages/${id}/react`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      });
    } catch (e) {
      showToast?.('Erreur réseau', 'error');
      if (chargerTout) chargerTout();
    }
  };

  return {
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
    dernierMessageParConv,
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
    toggleReaction,
    marquerConversationCommeLue
  };
}

export default useInternalChat;
