// frontend/src/hooks/useStocksReassort.js
// Hook de gestion du scanner code-barres caméra et réassort fournisseurs PDF / Email (STACK)

import { useState } from 'react';
import { API_URL } from '../api/config';

export function useStocksReassort({
  catalogueListe,
  configSalon,
  token,
  showToast,
  setShowAddProduit,
  setNewArticle
}) {
  const [scannerModalMode, setScannerModalMode] = useState(null);
  const [codeBarreManuel, setCodeBarreManuel] = useState('');
  const [dernierProduitScanne, setDernierProduitScanne] = useState(null);

  const [showReassortModal, setShowReassortModal] = useState(false);
  const [lignesReassort, setLignesReassort] = useState([]);
  const [fournisseurCommande, setFournisseurCommande] = useState("L'Oréal Professionnel");
  const [emailFournisseurCommande, setEmailFournisseurCommande] = useState('');
  const [noteCommande, setNoteCommande] = useState('');
  const [isSendingCommande, setIsSendingCommande] = useState(false);

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
      (a) => String(a.reference || '').trim().toLowerCase() === code.toLowerCase()
    );

    fermerScannerCodeBarre();

    if (modeCible === 'STOCKS') {
      if (articleTrouve) {
        setDernierProduitScanne(articleTrouve);
        showToast?.(`Produit reconnu : ${articleTrouve.nom} (Stock actuel : ${articleTrouve.stock_actuel ?? 0})`, 'success');
      } else {
        if (setShowAddProduit) setShowAddProduit(true);
        if (setNewArticle) setNewArticle((prev) => ({ ...prev, reference: code, type_article: 'PRODUIT_REVENTE' }));
        showToast?.(`Code ${code} scanné ! Référence pré-remplie pour ce nouveau produit.`, 'info');
      }
    } else if (modeCible === 'CAISSE') {
      if (articleTrouve) {
        setDernierProduitScanne(articleTrouve);
        showToast?.(`Produit scanné : ${articleTrouve.nom} (${articleTrouve.prix} €)`, 'success');
      } else {
        showToast?.(`Aucun produit trouvé avec le code-barres "${code}".`, 'error');
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

  const produitsEnAlerteStock = (catalogueListe || []).filter(
    (a) => (a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE') && (parseInt(a.stock_actuel, 10) || 0) <= 2
  );

  const ouvrirModaleReassort = () => {
    const sauvegardesMails = JSON.parse(localStorage.getItem('stack_fournisseurs_emails_v1') || '{}');
    const initFourn = fournisseurCommande || "L'Oréal Professionnel";
    setEmailFournisseurCommande(sauvegardesMails[initFourn] || '');

    const baseArticles =
      produitsEnAlerteStock.length > 0
        ? produitsEnAlerteStock
        : (catalogueListe || []).filter((a) => a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE').slice(0, 8);

    setLignesReassort(
      baseArticles.map((a) => ({
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
      `COMMANDE ${configSalon?.nom_salon || 'SALON'} (${new Date().toLocaleDateString('fr-FR')}) - ${fournisseurCommande}`,
      ...lignesReassort.map((l) => `• ${l.reference ? `[${l.reference}] ` : ''}${l.nom} : x${l.quantite_commande}`),
      noteCommande ? `\nNote : ${noteCommande}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(texte);
    showToast?.('Liste de commande copiée ! Vous pouvez la coller sur le site fournisseur ou WhatsApp.', 'success');
  };

  const telechargerBonCommandePdf = async () => {
    if (lignesReassort.length === 0) return;
    setIsSendingCommande(true);
    try {
      const res = await fetch(`${API_URL}/api/catalogue/bon-commande-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`
        },
        body: JSON.stringify({
          fournisseur: fournisseurCommande,
          lignes: lignesReassort,
          commentaire: noteCommande
        })
      });
      if (!res.ok) throw new Error('Erreur PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bon_Commande_${fournisseurCommande.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      a.click();
      showToast?.('Bon de commande PDF téléchargé !', 'success');
    } catch (e) {
      showToast?.('Erreur lors du téléchargement du PDF.', 'error');
    } finally {
      setIsSendingCommande(false);
    }
  };

  const envoyerBonCommandeParMail = async () => {
    if (!emailFournisseurCommande || !emailFournisseurCommande.includes('@')) {
      return showToast?.("Saisissez l'e-mail du commercial (il sera mémorisé pour la prochaine fois).", 'error');
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
          Authorization: `Bearer ${localStorage.getItem('api_token') || token}`
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
        const corpsTexte = lignesReassort
          .map((l) => `- ${l.reference ? `[${l.reference}] ` : ''}${l.nom} : x${l.quantite_commande}`)
          .join('%0D%0A');
        window.location.href = `mailto:${emailFournisseurCommande.trim()}?subject=${encodeURIComponent(
          data.sujet || 'Bon de commande'
        )}&body=${corpsTexte}`;
        showToast?.('Messagerie ouverte avec votre commande pré-remplie !', 'info');
      } else if (res.ok) {
        showToast?.(data.message || 'Commande envoyée au commercial !', 'success');
        setShowReassortModal(false);
      } else {
        showToast?.(data.erreur || "Erreur lors de l'envoi.", 'error');
      }
    } catch (e) {
      showToast?.('Erreur réseau.', 'error');
    } finally {
      setIsSendingCommande(false);
    }
  };

  return {
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
  };
}

export default useStocksReassort;
