// frontend/src/hooks/useComptaValidation.js
// Hook de gestion de la certification mensuelle gérant, signature manuscrite canvas et scellement NF525 (STACK)

import { useState, useRef, useEffect } from 'react';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

export function useComptaValidation({
  token,
  isOffline,
  showToast,
  getAuthHeaders,
  handleFetchError
}) {
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

  const chargerStatutMoisCompta = async () => {
    if (!token || decodeToken(token)?.role !== 'gerant') return;
    const today = new Date();
    let prevMonth = today.getMonth();
    let year = today.getFullYear();
    if (prevMonth === 0) {
      prevMonth = 12;
      year -= 1;
    }
    const moisAnnee = `${year}-${String(prevMonth).padStart(2, '0')}`;

    try {
      const res = await fetch(`${API_URL}/api/compta/statut-mois?mois_annee=${moisAnnee}`, {
        headers: getAuthHeaders ? getAuthHeaders() : {}
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      setStatutMoisPrecedent({
        mois: moisAnnee,
        libelle: new Date(year, prevMonth - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        ...data
      });
    } catch (e) {
      console.error('Erreur statut mois', e);
    }
  };

  const previsualiserBrouillon = async () => {
    if (isOffline || !navigator.onLine) return showToast?.('Téléchargement impossible hors-ligne.', 'error');
    showToast?.('Génération du PDF en cours...');
    try {
      const res = await fetch(`${API_URL}/api/export-pdf?mois_annee=${statutMoisPrecedent?.mois}`, {
        headers: getAuthHeaders ? getAuthHeaders() : {}
      });
      if (!res.ok) throw new Error('Erreur Serveur');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Liasse_${statutMoisPrecedent?.mois}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('Erreur de téléchargement', 'error');
    }
  };

  const validerEtEnvoyerMois = async () => {
    if (!checklistCompta.caisse || !checklistCompta.paie || !checklistCompta.depenses) {
      return showToast?.('Veuillez cocher toutes les vérifications de conformité.', 'error');
    }
    if (!hasSignedCompta || !signatureCanvasRef.current) {
      return showToast?.('Veuillez signer dans le cadre prévu à cet effet.', 'error');
    }
    if (!pinValidationCompta || pinValidationCompta.length < 4) {
      return showToast?.('Veuillez saisir votre code PIN pour sceller votre signature.', 'error');
    }

    const signatureBase64 = signatureCanvasRef.current.toDataURL('image/png');

    setIsValidatingCompta(true);
    try {
      const res = await fetch(`${API_URL}/api/compta/valider-mois`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mois_annee: statutMoisPrecedent.mois,
          code_pin: pinValidationCompta,
          signature_base64: signatureBase64
        })
      });
      const data = handleFetchError ? await handleFetchError(res) : await res.json();
      showToast?.(data.message || 'Mois comptable certifié et scellé avec succès.', 'success');
      setShowModalValidationCompta(false);
      setChecklistCompta({ caisse: false, paie: false, depenses: false });
      setPinValidationCompta('');
      setHasSignedCompta(false);
      chargerStatutMoisCompta();
    } catch (e) {
      showToast?.(e.message || 'Erreur lors de la validation', 'error');
    } finally {
      setIsValidatingCompta(false);
    }
  };

  return {
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
  };
}

export default useComptaValidation;
