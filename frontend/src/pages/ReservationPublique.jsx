// frontend/src/pages/ReservationPublique.jsx
// Vitrine & Tunnel de Réservation Publique en Ligne (Design Executive type Planity)

import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../api/config';
import { isTokenExpired } from '../utils/auth';

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function extraireCategoriePrestation(presta) {
  if (presta.categorie && presta.categorie.trim()) return presta.categorie.trim();
  const nom = (presta.nom || '').toLowerCase();
  if (nom.includes('barbe') || nom.includes('homme') || nom.includes('dégradé')) return 'Coupe Homme & Barbe';
  if (nom.includes('balayage') || nom.includes('ombré') || nom.includes('mèches') || nom.includes('patine')) return 'Balayage & Techniques';
  if (nom.includes('coloration') || nom.includes('couleur') || nom.includes('racines')) return 'Coloration';
  if (nom.includes('soin') || nom.includes('kératine') || nom.includes('botox') || nom.includes('olaplex')) return 'Soins Profonds';
  if (nom.includes('enfant')) return 'Coupe Enfant';
  return 'Coupes & Coiffage';
}

function obtenirInitialesSalon(nom) {
  if (!nom) return 'S';
  const mots = String(nom).trim().split(/\s+/).filter(Boolean);
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return `${mots[0][0]}${mots[1][0]}`.toUpperCase();
}

export default function PageReservationPublique({ idSalon }) {
  const [infos, setInfos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // États vitrine (Avis, Galerie, Carte)
  const [ongletAvis, setOngletAvis] = useState('note'); // 'note' | 'avis'
  const [carteActive, setCarteActive] = useState(false);
  const [galerieModalOpen, setGalerieModalOpen] = useState(false);
  const [categoriesDepliees, setCategoriesDepliees] = useState({});

  // --- PANIER MULTI-PRESTATIONS & TUNNEL DE RÉSERVATION ---
  const [panierPrestations, setPanierPrestations] = useState([]);
  const [employeChoisi, setEmployeChoisi] = useState('AUTO');
  const [dateChoisie, setDateChoisie] = useState(() => {
    const tzDate = new Date().toLocaleString("fr-CA", { timeZone: "Europe/Paris" });
    const nowParis = new Date();
    const heuresParis = parseInt(nowParis.toLocaleString("fr-FR", { timeZone: "Europe/Paris", hour: '2-digit', hour12: false }), 10) || 0;
    // Si l'heure actuelle à Paris dépasse 18h, on pré-sélectionne directement le lendemain
    if (heuresParis >= 18) {
      const demain = new Date();
      demain.setDate(demain.getDate() + 1);
      return demain.toLocaleString("fr-CA", { timeZone: "Europe/Paris" }).slice(0, 10);
    }
    return tzDate.slice(0, 10);
  });
  const [creneaux, setCreneaux] = useState([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);
  const [creneauSelectionne, setCreneauSelectionne] = useState(null);

  // --- ÉTAPE IDENTIFICATION (NOUVEAU ? vs DÉJÀ UN COMPTE ?) ---
  const [modeIdentification, setModeIdentification] = useState('CHOIX'); // 'CHOIX' | 'LOGIN' | 'REGISTER' | 'INVITE'
  const [clientConnecte, setClientConnecte] = useState(null);
  const [tokenClient, setTokenClient] = useState(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('token_client') || '';
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem('token_client');
      return '';
    }
    return stored;
  });

  // Formulaires Client
  const [identifiantLogin, setIdentifiantLogin] = useState('');
  const [passwordLogin, setPasswordLogin] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [clientPrenom, setClientPrenom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');

  // Espace "Mon Compte"
  const [monCompteOpen, setMonCompteOpen] = useState(false);
  const [profilClientData, setProfilClientData] = useState(null);
  const [ongletMonCompte, setOngletMonCompte] = useState('rdvs'); // 'rdvs' | 'historique'
  const [actionAnnulationNotice, setActionAnnulationNotice] = useState(null);

  // Validation finale & confirmation
  const [confirmationOk, setConfirmationOk] = useState(() => new URLSearchParams(window.location.search).get('success') === '1');
  const [erreurMsg, setErreurMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMobile = windowWidth < 920;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Chargement des données du salon
  useEffect(() => {
    fetch(`${API_URL}/api/public/reservation/${idSalon}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) setInfos(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idSalon]);

  // Validation immédiate du retour paiement en ligne si id_rdv dans l'URL
  useEffect(() => {
    const idRdvUrl = new URLSearchParams(window.location.search).get('id_rdv');
    if (confirmationOk && idRdvUrl && idSalon) {
      fetch(`${API_URL}/api/public/reservation/${idSalon}/valider-retour-stripe/${idRdvUrl}`, {
        method: 'POST'
      }).catch(() => {});
    }
  }, [confirmationOk, idSalon]);

  // Chargement du profil client si token présent
  const rechargerProfilClient = () => {
    if (!tokenClient || isTokenExpired(tokenClient)) {
      setClientConnecte(null);
      localStorage.removeItem('token_client');
      setTokenClient('');
      return;
    }
    fetch(`${API_URL}/api/public/client/me`, {
      headers: { 'Authorization': `Bearer ${tokenClient}` }
    })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('token_client');
          setTokenClient('');
          setClientConnecte(null);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data?.client) {
          setClientConnecte(data.client);
          setProfilClientData(data);
          setClientNom(data.client.nom || '');
          setClientPrenom(data.client.prenom || '');
          setClientTel(data.client.telephone || '');
          setClientEmail(data.client.email || '');
        } else {
          setClientConnecte(null);
          localStorage.removeItem('token_client');
          setTokenClient('');
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    rechargerProfilClient();
  }, [tokenClient, idSalon]);

  // Durée totale et prix total cumulés du panier multi-prestations
  const { dureeTotaleMinutes, prixTotalPanier } = useMemo(() => {
    let duree = 0;
    let prix = 0;
    panierPrestations.forEach(p => {
      duree += parseInt(p.duree_estimee_minutes || 30, 10) || 30;
      prix += parseFloat(p.prix || 0) || 0;
    });
    return { dureeTotaleMinutes: duree || 30, prixTotalPanier: prix };
  }, [panierPrestations]);

  // Calcul dynamique des créneaux
  useEffect(() => {
    if (panierPrestations.length > 0 && dateChoisie) {
      setLoadingCreneaux(true);
      setCreneauSelectionne(null);
      const empId = employeChoisi === 'AUTO' ? '' : (employeChoisi || '');
      fetch(`${API_URL}/api/public/reservation/${idSalon}/creneaux?date=${dateChoisie}&id_employe=${empId}&duree=${dureeTotaleMinutes}`)
        .then(r => (r.ok ? r.json() : { creneaux: [] }))
        .then(data => {
          setCreneaux(data.creneaux || []);
          setLoadingCreneaux(false);
        })
        .catch(() => setLoadingCreneaux(false));
    }
  }, [idSalon, panierPrestations, employeChoisi, dateChoisie, dureeTotaleMinutes]);

  const prestationsParCategorie = useMemo(() => {
    const liste = infos?.prestations || [];
    const groupes = {};
    liste.forEach(p => {
      const cat = extraireCategoriePrestation(p);
      if (!groupes[cat]) groupes[cat] = [];
      groupes[cat].push(p);
    });
    return groupes;
  }, [infos]);

  const photosSalon = useMemo(() => {
    const s = infos?.salon || {};
    const raw = s.photos_salon || s.photos || s.galerie || [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      try { return JSON.parse(raw).filter(Boolean); } catch (e) { return []; }
    }
    if (s.banniere_url || s.photo_url) return [s.banniere_url || s.photo_url];
    return [];
  }, [infos]);

  const horairesSalon = useMemo(() => {
    const s = infos?.salon || {};
    if (s.horaires_ouverture && typeof s.horaires_ouverture === 'object') {
      return s.horaires_ouverture;
    }
    const hOuv = s.heure_ouverture !== undefined ? String(s.heure_ouverture).padStart(2, '0') + ':00' : '08:00';
    const hFerm = s.heure_fermeture !== undefined ? String(s.heure_fermeture).padStart(2, '0') + ':00' : '17:00';
    return {
      Lundi: `${hOuv} - ${hFerm}`,
      Mardi: `${hOuv} - ${hFerm}`,
      Mercredi: `${hOuv} - ${hFerm}`,
      Jeudi: `${hOuv} - ${hFerm}`,
      Vendredi: `${hOuv} - ${hFerm}`,
      Samedi: `${hOuv} - ${hFerm}`,
      Dimanche: 'Fermé'
    };
  }, [infos]);

  const avisStats = useMemo(() => {
    const s = infos?.salon || {};
    const avisListe = infos?.avis || s.avis_recents || [];
    let vraieMoyenne = 0;
    if (avisListe.length > 0) {
      const sum = avisListe.reduce((acc, av) => acc + (Number(av.note) || 5), 0);
      vraieMoyenne = sum / avisListe.length;
    }
    const noteMoyenne = avisListe.length > 0 ? vraieMoyenne.toFixed(1).replace('.', ',') : "N/A";
    return { 
      noteGlobale: noteMoyenne, 
      nbAvis: avisListe.length, 
      liste: avisListe 
    };
  }, [infos]);

  const togglePrestationPanier = (presta) => {
    setPanierPrestations(prev => {
      const exist = prev.find(p => (p.id_article || p.id) === (presta.id_article || presta.id));
      if (exist) {
        return prev.filter(p => (p.id_article || p.id) !== (presta.id_article || presta.id));
      } else {
        return [...prev, presta];
      }
    });
    const el = document.getElementById('tunnel-reservation-ancrage');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const retirerPrestationPanier = (idArticle) => {
    setPanierPrestations(prev => prev.filter(p => (p.id_article || p.id) !== idArticle));
  };

  // --- ACTIONS CLIENT : LOGIN & REGISTER ---
  const handleClientLogin = async (e) => {
    e.preventDefault();
    setErreurMsg('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_salon: idSalon,
          identifiant: identifiantLogin.trim(),
          mot_de_passe: passwordLogin
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || "Identifiant ou mot de passe incorrect.");

      localStorage.setItem('token_client', data.token);
      setTokenClient(data.token);
      setClientConnecte(data.client);
      setModeIdentification('CHOIX');
    } catch (err) {
      setErreurMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientRegister = async (e) => {
    e.preventDefault();
    setErreurMsg('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_salon: idSalon,
          nom: clientNom.trim(),
          prenom: clientPrenom.trim(),
          telephone: clientTel.trim(),
          email: clientEmail.trim(),
          mot_de_passe: clientPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de la création du compte.");

      localStorage.setItem('token_client', data.token);
      setTokenClient(data.token);
      setClientConnecte(data.client);
      setModeIdentification('CHOIX');
    } catch (err) {
      setErreurMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutClient = () => {
    localStorage.removeItem('token_client');
    setTokenClient('');
    setClientConnecte(null);
    setProfilClientData(null);
    setMonCompteOpen(false);
  };

  // --- ANNULATION 1-CLIC PAR LE CLIENT ---
  const handleAnnulerRdv = async (idRdv) => {
    const confirm = window.confirm("Confirmez-vous l'annulation de ce rendez-vous ?");
    if (!confirm) return;

    setActionAnnulationNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/public/client/annuler-rdv/${idRdv}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenClient}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de l'annulation.");

      setActionAnnulationNotice({ type: 'success', message: data.message });
      rechargerProfilClient();
    } catch (err) {
      setActionAnnulationNotice({ type: 'error', message: err.message });
    }
  };

  // --- VALIDATION FINALE DU RDV ---
  const validerReservation = async () => {
    if (!creneauSelectionne || (!clientNom.trim() && !clientConnecte?.nom) || (!clientTel.trim() && !clientConnecte?.telephone)) {
      setErreurMsg('Veuillez renseigner vos coordonnées complètes.');
      return;
    }
    setErreurMsg('');
    setIsSubmitting(true);
    try {
      const nomFinal = clientConnecte?.nom ? `${clientConnecte.prenom || ''} ${clientConnecte.nom}`.trim() : `${clientPrenom} ${clientNom}`.trim();
      const telFinal = clientConnecte?.telephone || clientTel.trim();
      const emailFinal = clientConnecte?.email || clientEmail.trim();

      const antiNoShowActif = Boolean(infos?.salon?.anti_noshow_actif);

      const res = await fetch(`${API_URL}/api/public/reservation/${idSalon}/reserver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom_client: nomFinal,
          prenom_client: clientConnecte?.prenom || clientPrenom.trim(),
          telephone_client: telFinal,
          email_client: emailFinal,
          id_employe: creneauSelectionne.id_employe_suggere,
          prestation: panierPrestations.map(p => p.nom).join(' + '),
          prestations: panierPrestations,
          date_heure_debut: creneauSelectionne.date_heure_debut,
          duree_minutes: dureeTotaleMinutes,
          payer_acompte: antiNoShowActif
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreurMsg(data.erreur || 'Impossible de valider ce créneau.');
      } else if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      } else {
        setConfirmationOk(true);
        rechargerProfilClient();
      }
    } catch (e) {
      setErreurMsg('Erreur réseau lors de la validation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const genererJoursSemaine = () => {
    const jours = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const localDateStr = d.toLocaleString("fr-CA", { timeZone: "Europe/Paris" }).slice(0, 10);
      jours.push({
        date: localDateStr,
        jourFmt: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        numFmt: d.getDate(),
        moisFmt: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
      });
    }
    return jours;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: '#f7f7f7', color: '#111827', fontWeight: '600', fontSize: '14px' }}>
        Chargement de l'établissement...
      </div>
    );
  }

  if (!infos?.salon) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: '#f7f7f7', color: '#dc2626', fontWeight: '600', fontSize: '14px' }}>
        Établissement introuvable.
      </div>
    );
  }

  const nomSalon = infos.salon.nom_salon || 'Salon de Coiffure';
  const adresseSalon = infos.salon.adresse || infos.salon.adresse_salon || 'Adresse renseignée au salon';
  const initialesSalon = obtenirInitialesSalon(nomSalon);
  const indexJourActuel = (new Date().getDay() + 6) % 7; // 0 = Lundi

  const suggestionsUpsell = Array.isArray(infos.salon.upsell_suggestions) ? infos.salon.upsell_suggestions : [];
  const antiNoShowActif = Boolean(infos.salon.anti_noshow_actif);
  const acomptePourcent = infos.salon.anti_noshow_pourcentage || 30;
  const montantAcompteRequis = antiNoShowActif ? Math.max(5.00, Math.round(prixTotalPanier * (acomptePourcent / 100) * 100) / 100) : 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f8', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '110px' }}>

      {/* BARRE DE NAVIGATION SUPÉRIEURE SOBRIÉTÉ EXECUTIVE */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '17px', letterSpacing: '0.18em', color: '#111827' }}>
            <img src="/logo-stack.png" alt="STACK" style={{ height: '26px', width: 'auto', objectFit: 'contain', display: 'block' }} />
            <span>STACK</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {clientConnecte ? (
              <button
                type="button"
                onClick={() => setMonCompteOpen(true)}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  border: '1.5px solid #111827',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span>Mon Compte ({clientConnecte.prenom || clientConnecte.nom})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setModeIdentification('LOGIN');
                  const el = document.getElementById('tunnel-reservation-ancrage');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Se connecter
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('choix-prestation-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              Prendre RDV
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1160px', margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 28px' }}>

        {/* EN-TÊTE ÉTABLISSEMENT */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '16px', marginBottom: '22px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '24px' : '30px', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
              {nomSalon}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13.5px', color: '#4b5563' }}>
              <span
                onClick={() => {
                  const el = document.getElementById('localisation-salon');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {adresseSalon}
              </span>
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {avisStats.noteGlobale} ({avisStats.nbAvis} avis)
              </span>
            </div>
          </div>
        </div>

        {/* GALERIE BENTO (DISPOSITION CONFORME AVEC TOUTES LES PHOTOS ET MODALE PLEIN ÉCRAN) */}
        {photosSalon.length >= 3 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr 1fr',
            gridTemplateRows: isMobile ? '240px' : '185px 185px',
            gap: '12px',
            marginBottom: '36px',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            {/* GRANDE PHOTO COUVERTURE (À GAUCHE, SUR 2 LIGNES) */}
            <div style={{
              gridRow: isMobile ? 'span 1' : 'span 2',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '14px',
              backgroundColor: '#111827'
            }}>
              <img
                src={photosSalon[0]}
                alt={nomSalon}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {!isMobile && (
              <>
                {/* PHOTO 2 : HAUT MILIEU */}
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img
                    src={photosSalon[1] || photosSalon[0]}
                    alt={nomSalon}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>

                {/* PHOTO 3 : HAUT DROITE */}
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img
                    src={photosSalon[2] || photosSalon[0]}
                    alt={nomSalon}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>

                {/* PHOTO 4 : BAS MILIEU */}
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img
                    src={photosSalon[3] || photosSalon[1] || photosSalon[0]}
                    alt={nomSalon}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>

                {/* BOUTON VOIR TOUTES LES PHOTOS : BAS DROITE */}
                <div
                  onClick={() => setGalerieModalOpen(true)}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '14px',
                    backgroundColor: '#111827',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {photosSalon[4] ? (
                    <img
                      src={photosSalon[4]}
                      alt={nomSalon}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px) brightness(0.55)' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : photosSalon[2] ? (
                    <img
                      src={photosSalon[2]}
                      alt={nomSalon}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px) brightness(0.55)' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                  <span style={{ position: 'relative', zIndex: 2, color: '#ffffff', fontWeight: '700', fontSize: '13.5px', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                    Voir les {photosSalon.length} photos
                  </span>
                </div>
              </>
            )}
          </div>
        ) : photosSalon.length === 2 ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', height: isMobile ? '240px' : '340px', marginBottom: '36px', borderRadius: '16px', overflow: 'hidden' }}>
            {photosSalon.map((img, i) => (
              <div key={i} style={{ borderRadius: '14px', overflow: 'hidden', height: '100%', backgroundColor: '#111827' }}>
                <img src={img} alt={`${nomSalon} ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        ) : photosSalon.length === 1 ? (
          <div style={{ height: isMobile ? '240px' : '340px', marginBottom: '36px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#111827' }}>
            <img src={photosSalon[0]} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          /* FALLBACK ESTHÉTIQUE EXECUTIVE AVEC LOGO DU SALON */
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.45fr 1fr', gap: '12px', marginBottom: '36px' }}>
            <div style={{
              minHeight: isMobile ? '220px' : '280px',
              borderRadius: '16px',
              backgroundColor: '#111827',
              backgroundImage: 'linear-gradient(45deg, #1f2937 25%, transparent 25%, transparent 75%, #1f2937 75%, #1f2937), linear-gradient(45deg, #1f2937 25%, transparent 25%, transparent 75%, #1f2937 75%, #1f2937)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 10px 10px',
              color: '#ffffff',
              padding: isMobile ? '24px' : '36px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', border: '1px solid #1f2937'
            }}>
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(17, 24, 39, 0.85)', zIndex: 1 }}></div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                <span style={{ padding: '6px 12px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Établissement Partenaire Certifié
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', zIndex: 2, margin: '24px 0' }}>
                <div style={{ width: isMobile ? '68px' : '84px', height: isMobile ? '68px' : '84px', borderRadius: '20px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                  {infos.salon.logo_url ? (
                    <img
                      src={infos.salon.logo_url}
                      alt={nomSalon}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div style={{ display: infos.salon.logo_url ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                    <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', opacity: 0.85 }}>{initialesSalon}</span>
                  </div>
                </div>
                <div>
                  <h2 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: '#ffffff' }}>
                    {nomSalon}
                  </h2>
                  <div style={{ fontSize: '13px', opacity: 0.8, color: '#e5e7eb' }}>
                    {adresseSalon}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DISPOSITION 2 COLONNES */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: '32px', alignItems: 'start' }}>

          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* MESSAGE CONFIRMATION */}
            {confirmationOk && (
              <div style={{ padding: '24px', borderRadius: '14px', backgroundColor: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#065f46', marginBottom: '28px' }}>
                <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>🎉 Votre rendez-vous est confirmé !</div>
                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
                  Un email de confirmation vous a été envoyé. Vous pouvez consulter, modifier ou annuler votre réservation à tout moment en cliquant sur <strong>Mon Compte</strong>.
                </div>
              </div>
            )}

            {/* SECTION CATALOGUE : CHOIX DES PRESTATIONS */}
            <div id="choix-prestation-section" style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                  Choix des prestations
                </h3>
                {panierPrestations.length > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#4b5563', backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '999px' }}>
                    {panierPrestations.length} sélectionnée{panierPrestations.length > 1 ? 's' : ''} ({prixTotalPanier.toFixed(2)} €)
                  </span>
                )}
              </div>

              {Object.entries(prestationsParCategorie).map(([categorie, prestations]) => (
                <div key={categorie} style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '700', color: '#111827' }}>
                    {categorie}
                  </h4>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '4px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    {prestations.map(p => {
                      const estDansPanier = panierPrestations.some(item => (item.id_article || item.id) === (p.id_article || p.id));
                      return (
                        <div
                          key={p.id_article || p.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '14px 0',
                            borderBottom: '1px solid #f3f4f6'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{p.nom}</div>
                            <div style={{ fontSize: '12.5px', color: '#6b7280', marginTop: '2px' }}>
                              {p.duree_estimee_minutes || 30} min • {parseFloat(p.prix).toFixed(2)} €
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => togglePrestationPanier(p)}
                            style={{
                              backgroundColor: estDansPanier ? '#111827' : '#ffffff',
                              color: estDansPanier ? '#ffffff' : '#111827',
                              border: estDansPanier ? '1px solid #111827' : '1px solid #d1d5db',
                              borderRadius: '8px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {estDansPanier ? "✓ Ajouté" : "Choisir"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* TUNNEL DE RÉSERVATION (S'OUVRE LORSQU'AU MOINS UNE PRESTATION EST COCHÉE) */}
            <div id="tunnel-reservation-ancrage">
              {panierPrestations.length > 0 && (
                <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1.5px solid #111827', padding: isMobile ? '18px' : '26px', marginBottom: '36px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>

                  {/* 1. RÉCAPITULATIF PRESTATIONS SÉLECTIONNÉES (STYLE PLANITY SCREENSHOT) */}
                  <div style={{ paddingBottom: '18px', marginBottom: '22px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827' }}>
                        1. Prestation{panierPrestations.length > 1 ? 's' : ''} sélectionnée{panierPrestations.length > 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#4b5563' }}>
                        Total : {dureeTotaleMinutes} min • {prixTotalPanier.toFixed(2)} €
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {panierPrestations.map(p => (
                        <div
                          key={p.id_article || p.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#f9fafb',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '14.5px', fontWeight: '700', color: '#111827' }}>{p.nom}</span>
                            <span style={{ fontSize: '12.5px', color: '#6b7280', marginLeft: '10px' }}>
                              {p.duree_estimee_minutes || 30} min • {parseFloat(p.prix).toFixed(2)} €
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => retirerPrestationPanier(p.id_article || p.id)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. SUGGESTION "VENTES ADDITIONNELLES" (UP-SELL EXPRESS) */}
                  {suggestionsUpsell.length > 0 && (
                    <div style={{ backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#854d0e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✨ Envie de parfaire ce moment ?</span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {suggestionsUpsell.filter(up => !panierPrestations.some(p => (p.id_article || p.id) === up.id_article)).map(up => (
                          <button
                            key={up.id_article}
                            type="button"
                            onClick={() => togglePrestationPanier(up)}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #fde047',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              fontSize: '12.5px',
                              fontWeight: '600',
                              color: '#713f12',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>+ {up.nom}</span>
                            <span style={{ fontWeight: '800', color: '#111827' }}>+{parseFloat(up.prix).toFixed(0)}€ ({up.duree_estimee_minutes || 10} min)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. SÉLECTION DU COLLABORATEUR PAR EXPERTISE */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
                      2. Choisir avec qui prendre rendez-vous
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setEmployeChoisi('AUTO')}
                        style={{
                          display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start',
                          padding: '10px 18px', borderRadius: '12px', cursor: 'pointer',
                          border: employeChoisi === 'AUTO' ? '1.5px solid #111827' : '1px solid #e5e7eb',
                          backgroundColor: employeChoisi === 'AUTO' ? '#111827' : '#ffffff',
                          color: employeChoisi === 'AUTO' ? '#ffffff' : '#111827',
                          fontSize: '13px', fontWeight: '700'
                        }}
                      >
                        <span>Sans préférence (Premier disponible)</span>
                        <span style={{ fontSize: '11px', opacity: 0.8, fontWeight: '500' }}>Attribution automatique optimisée</span>
                      </button>

                      {(infos.employes || []).map(emp => {
                        const actif = employeChoisi === emp.id_employe;
                        const prenom = (emp.nom || 'Coiffeur').split(' ')[0];
                        const expertises = Array.isArray(emp.expertises) ? emp.expertises : [];

                        return (
                          <button
                            key={emp.id_employe}
                            type="button"
                            onClick={() => setEmployeChoisi(emp.id_employe)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '10px',
                              padding: '8px 14px', borderRadius: '12px', cursor: 'pointer',
                              border: actif ? '1.5px solid #111827' : '1px solid #e5e7eb',
                              backgroundColor: actif ? '#111827' : '#ffffff',
                              color: actif ? '#ffffff' : '#111827'
                            }}
                          >
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%',
                              backgroundColor: actif ? '#ffffff' : '#111827',
                              color: actif ? '#111827' : '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: '800'
                            }}>
                              {prenom.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: '13px', fontWeight: '700' }}>{prenom}</div>
                              {expertises.length > 0 && (
                                <div style={{ fontSize: '10.5px', opacity: 0.85, fontWeight: '500' }}>
                                  {expertises.slice(0, 2).join(' • ')}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. DATE ET HORAIRE */}
                  <div style={{ marginBottom: creneauSelectionne ? '24px' : 0 }}>
                    <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
                      3. Date et heure du rendez-vous
                    </div>

                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '14px' }}>
                      {genererJoursSemaine().map(jour => {
                        const isSelected = dateChoisie === jour.date;
                        return (
                          <button
                            key={jour.date}
                            type="button"
                            onClick={() => setDateChoisie(jour.date)}
                            style={{
                              flexShrink: 0, width: '66px', height: '72px', borderRadius: '12px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                              backgroundColor: isSelected ? '#111827' : '#f9fafb',
                              color: isSelected ? '#ffffff' : '#111827',
                              border: isSelected ? 'none' : '1px solid #e5e7eb',
                              cursor: 'pointer'
                            }}
                          >
                            <span style={{ fontSize: '11px', textTransform: 'capitalize', opacity: isSelected ? 0.85 : 0.6 }}>{jour.jourFmt}</span>
                            <span style={{ fontSize: '16px', fontWeight: '800' }}>{jour.numFmt}</span>
                            <span style={{ fontSize: '10px', textTransform: 'capitalize', opacity: isSelected ? 0.85 : 0.6 }}>{jour.moisFmt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {loadingCreneaux ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13.5px' }}>
                        Calcul des disponibilités en cours...
                      </div>
                    ) : creneaux.length === 0 ? (
                      <div style={{ padding: '20px 18px', textAlign: 'center', color: '#4b5563', fontSize: '13.5px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                        <div style={{ marginBottom: '10px' }}>
                          {dateChoisie === new Date().toLocaleString("fr-CA", { timeZone: "Europe/Paris" }).slice(0, 10)
                            ? "Tous les créneaux pour aujourd'hui sont passés ou complets."
                            : `Aucun créneau continu de ${dureeTotaleMinutes} min disponible ce jour.`
                          }
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const jours = genererJoursSemaine();
                            const demain = jours[1]?.date;
                            if (demain) setDateChoisie(demain);
                          }}
                          style={{
                            backgroundColor: '#111827',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '9px 18px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Consulter les créneaux dès demain →
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: '8px' }}>
                        {creneaux.map(c => {
                          const isSlotSelected = creneauSelectionne?.heure === c.heure;
                          return (
                            <button
                              key={c.heure}
                              type="button"
                              onClick={() => setCreneauSelectionne(c)}
                              style={{
                                padding: '11px 0', borderRadius: '8px', fontSize: '13.5px', fontWeight: '700',
                                backgroundColor: isSlotSelected ? '#111827' : '#ffffff',
                                color: isSlotSelected ? '#ffffff' : '#111827',
                                border: isSlotSelected ? '1.5px solid #111827' : '1px solid #e5e7eb',
                                cursor: 'pointer'
                              }}
                            >
                              {c.heure}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 5. ÉTAPE IDENTIFICATION (EXACTEMENT COMME SUR LE SCREENSHOT FOURNI PAR L'UTILISATEUR) */}
                  {creneauSelectionne && (
                    <div style={{ paddingTop: '22px', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827', marginBottom: '16px' }}>
                        4. Identification
                      </div>

                      {clientConnecte ? (
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '18px', marginBottom: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: '#166534' }}>
                                Connecté en tant que {clientConnecte.prenom} {clientConnecte.nom}
                              </div>
                              <div style={{ fontSize: '12.5px', color: '#15803d', marginTop: '2px' }}>
                                {clientConnecte.telephone} • {clientConnecte.email}
                              </div>
                              {clientConnecte.solde_avoir > 0 && (
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#047857', marginTop: '6px' }}>
                                  🎁 Avoir disponible : {clientConnecte.solde_avoir.toFixed(2)} € (sera déduit en caisse)
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleLogoutClient}
                              style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              Changer de compte
                            </button>
                          </div>
                        </div>
                      ) : modeIdentification === 'CHOIX' ? (
                        /* ENCADRÉ CONFORME AU SCREENSHOT */
                        <div style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '14px',
                          border: '1px solid #e5e7eb',
                          padding: isMobile ? '24px 18px' : '36px 32px',
                          textAlign: 'center',
                          marginBottom: '20px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}>
                          <div style={{ marginBottom: '22px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: '700', color: '#111827' }}>
                              Nouveau ?
                            </h4>
                            <button
                              type="button"
                              onClick={() => setModeIdentification('REGISTER')}
                              style={{
                                width: '100%',
                                maxWidth: '420px',
                                padding: '13px 20px',
                                borderRadius: '8px',
                                backgroundColor: '#ffffff',
                                color: '#111827',
                                border: '1.5px solid #111827',
                                fontSize: '14px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Créer mon compte
                            </button>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            margin: '22px auto',
                            maxWidth: '420px',
                            color: '#9ca3af',
                            fontSize: '13px'
                          }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
                            <span style={{ padding: '0 14px', fontWeight: '500' }}>ou</span>
                            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
                          </div>

                          <div>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: '700', color: '#111827' }}>
                              Vous avez déjà un compte ?
                            </h4>
                            <button
                              type="button"
                              onClick={() => setModeIdentification('LOGIN')}
                              style={{
                                width: '100%',
                                maxWidth: '420px',
                                padding: '13px 20px',
                                borderRadius: '8px',
                                backgroundColor: '#111827',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '14px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Se connecter
                            </button>
                          </div>
                        </div>
                      ) : modeIdentification === 'LOGIN' ? (
                        /* FORMULAIRE DE CONNEXION */
                        <form onSubmit={handleClientLogin} style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>Connexion à votre compte</span>
                            <button type="button" onClick={() => setModeIdentification('CHOIX')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Retour</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                            <input
                              type="text"
                              placeholder="Email ou Téléphone"
                              value={identifiantLogin}
                              onChange={e => setIdentifiantLogin(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                            <input
                              type="password"
                              placeholder="Mot de passe"
                              value={passwordLogin}
                              onChange={e => setPasswordLogin(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontWeight: '700', cursor: 'pointer' }}
                          >
                            {isSubmitting ? "Connexion..." : "Se connecter et continuer"}
                          </button>
                        </form>
                      ) : (
                        /* FORMULAIRE CRÉATION DE COMPTE */
                        <form onSubmit={handleClientRegister} style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>Créer mon compte STACK</span>
                            <button type="button" onClick={() => setModeIdentification('CHOIX')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Retour</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <input
                              type="text"
                              placeholder="Prénom"
                              value={clientPrenom}
                              onChange={e => setClientPrenom(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                            <input
                              type="text"
                              placeholder="Nom"
                              value={clientNom}
                              onChange={e => setClientNom(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                            <input
                              type="tel"
                              placeholder="Téléphone mobile"
                              value={clientTel}
                              onChange={e => setClientTel(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                            <input
                              type="email"
                              placeholder="Adresse email"
                              value={clientEmail}
                              onChange={e => setClientEmail(e.target.value)}
                              required
                              style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                          </div>
                          <div style={{ marginBottom: '14px' }}>
                            <input
                              type="password"
                              placeholder="Choisissez un mot de passe"
                              value={clientPassword}
                              onChange={e => setClientPassword(e.target.value)}
                              required
                              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '14px' }}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontWeight: '700', cursor: 'pointer' }}
                          >
                            {isSubmitting ? "Création..." : "Créer mon compte et continuer"}
                          </button>
                        </form>
                      )}

                      {/* NOTICE ANTI-NOSHOW */}
                      {antiNoShowActif && (
                        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px', fontSize: '13px', color: '#1e40af', lineHeight: 1.5 }}>
                          🛡️ <strong>Garantie Anti-NoShow :</strong> Pour valider votre créneau, un acompte de {acomptePourcent}% ({montantAcompteRequis.toFixed(2)} €) est requis par carte bancaire. Il sera directement décompté de votre note au salon. Annulation gratuite jusqu'à 24h avant le rendez-vous.
                        </div>
                      )}

                      {erreurMsg && (
                        <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>
                          {erreurMsg}
                        </div>
                      )}

                      {/* BOUTON FINAL DE CONFIRMATION */}
                      {(clientConnecte || modeIdentification !== 'CHOIX') && (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={validerReservation}
                          style={{
                            width: '100%',
                            padding: '16px 20px',
                            borderRadius: '10px',
                            backgroundColor: '#111827',
                            color: '#ffffff',
                            fontSize: '15px',
                            fontWeight: '800',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(17, 24, 39, 0.2)'
                          }}
                        >
                          {isSubmitting ? "Validation en cours..." : antiNoShowActif ? (
                            `Régler l'acompte (${montantAcompteRequis.toFixed(2)} €) et confirmer le RDV (${creneauSelectionne.heure})`
                          ) : (
                            `Confirmer mon rendez-vous (${creneauSelectionne.heure}) — Paiement sur place`
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION LOCALISATION SALON */}
            <div id="localisation-salon" style={{ marginTop: '20px', marginBottom: '40px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>Où se situe le salon ?</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: '#4b5563', textDecoration: 'underline', marginBottom: '14px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{adresseSalon}</span>
              </div>
              <div style={{ position: 'relative', height: '290px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: '#e5e7eb' }}>
                <iframe
                  title="Localisation du salon"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(adresseSalon)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                  style={{ width: '100%', height: '100%', border: 0, filter: carteActive ? 'none' : 'blur(6px) opacity(0.88)', pointerEvents: carteActive ? 'auto' : 'none', transition: 'filter 0.25s ease' }}
                  loading="lazy"
                />
                {!carteActive && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' }}>
                    <button
                      type="button"
                      onClick={() => setCarteActive(true)}
                      style={{
                        backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px',
                        padding: '12px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                      <span>Afficher la carte</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION DESCRIPTION DU SALON */}
            <div id="description-salon" style={{ marginBottom: '40px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                Description
              </h3>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '22px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '14.5px',
                  lineHeight: '1.7',
                  color: '#374151',
                  whiteSpace: 'pre-line'
                }}>
                  {infos.salon.description_salon || `Bienvenue chez ${nomSalon}. Notre équipe vous accueille avec passion et expertise pour prendre soin de vous et sublimer votre style. Choisissez votre prestation et réservez votre créneau en toute simplicité.`}
                </p>
              </div>
            </div>

            {/* SECTION COLLABORATEURS AVEC BADGES D'EXPERTISE */}
            {(infos.employes || []).length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                  Collaborateurs
                </h3>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '22px', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '18px' }}>
                  {(infos.employes || []).map(emp => {
                    const prenom = (emp.nom || 'Collaborateur').split(' ')[0];
                    const expertises = Array.isArray(emp.expertises) ? emp.expertises : [];

                    return (
                      <div key={emp.id_employe} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '50%', backgroundColor: '#000000', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>
                          {emp.photo_url ? (
                            <img src={emp.photo_url} alt={prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            prenom.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: '700', color: '#111827' }}>{prenom}</div>
                          {expertises.length > 0 ? (
                            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
                              {expertises.join(' • ')}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>Coiffeur Styliste</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* COLONNE DROITE : AVIS + HORAIRES D'OUVERTURE */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827', marginBottom: '14px' }}>Horaires d'ouverture</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                {JOURS_SEMAINE.map((j, idx) => {
                  const estAujourdhui = idx === indexJourActuel;
                  return (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: estAujourdhui ? '700' : '400', color: estAujourdhui ? '#111827' : '#4b5563' }}>
                      <span>{j}</span>
                      <span>{horairesSalon[j] || 'Fermé'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* MODALE ESPACE "MON COMPTE" DU CLIENT */}
      {monCompteOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '18px', maxWidth: '620px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '20px' : '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#111827' }}>
                  Mon Espace Client
                </h3>
                <span style={{ fontSize: '12.5px', color: '#6b7280' }}>
                  {clientConnecte?.prenom} {clientConnecte?.nom} • {clientConnecte?.telephone}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMonCompteOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            {actionAnnulationNotice && (
              <div style={{
                padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', marginBottom: '16px',
                backgroundColor: actionAnnulationNotice.type === 'error' ? '#fef2f2' : '#ecfdf5',
                color: actionAnnulationNotice.type === 'error' ? '#dc2626' : '#047857',
                border: `1px solid ${actionAnnulationNotice.type === 'error' ? '#fca5a5' : '#a7f3d0'}`
              }}>
                {actionAnnulationNotice.message}
              </div>
            )}

            {/* JAUGE DE FIDÉLITÉ STACK */}
            {profilClientData?.jauge_fidelite?.actif && (
              <div style={{ backgroundColor: '#f9fafb', borderRadius: '14px', padding: '18px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#111827' }}>Programme de Fidélité STACK</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#15803d', backgroundColor: '#dcfce7', padding: '3px 8px', borderRadius: '999px' }}>
                    {profilClientData.jauge_fidelite.type === 'TAMPONS' 
                      ? `${profilClientData.jauge_fidelite.tampons_actuels} / ${profilClientData.jauge_fidelite.seuil} tampons`
                      : `${profilClientData.jauge_fidelite.points_actuels} points`}
                  </span>
                </div>
                <div style={{ width: '100%', height: '10px', backgroundColor: '#e5e7eb', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: `${profilClientData.jauge_fidelite.pourcentage || 0}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '12.5px', color: '#4b5563', fontWeight: '600' }}>
                  {profilClientData.jauge_fidelite.message}
                </span>
              </div>
            )}

            {/* SOLDE D'AVOIR CLIENT */}
            {clientConnecte?.solde_avoir > 0 && (
              <div style={{ backgroundColor: '#ecfdf5', borderRadius: '12px', padding: '14px 16px', border: '1px solid #a7f3d0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#047857' }}>🎁 Solde d'Avoir disponible</div>
                  <div style={{ fontSize: '11.5px', color: '#065f46' }}>Utilisable directement lors de votre prochain paiement</div>
                </div>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#047857' }}>
                  {parseFloat(clientConnecte.solde_avoir).toFixed(2)} €
                </span>
              </div>
            )}

            {/* ONGLETS MON COMPTE : RDV À VENIR vs HISTORIQUE */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setOngletMonCompte('rdvs')}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  backgroundColor: ongletMonCompte === 'rdvs' ? '#111827' : '#f3f4f6',
                  color: ongletMonCompte === 'rdvs' ? '#ffffff' : '#4b5563',
                  fontSize: '13px', fontWeight: '700'
                }}
              >
                Rendez-vous à venir ({(profilClientData?.rdvs_a_venir || []).length})
              </button>
              <button
                type="button"
                onClick={() => setOngletMonCompte('historique')}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  backgroundColor: ongletMonCompte === 'historique' ? '#111827' : '#f3f4f6',
                  color: ongletMonCompte === 'historique' ? '#ffffff' : '#4b5563',
                  fontSize: '13px', fontWeight: '700'
                }}
              >
                Historique des visites ({(profilClientData?.rdvs_passes || []).length})
              </button>
            </div>

            {ongletMonCompte === 'rdvs' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(profilClientData?.rdvs_a_venir || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6b7280', fontSize: '13.5px' }}>
                    Vous n'avez aucun rendez-vous à venir.
                  </div>
                ) : (
                  profilClientData.rdvs_a_venir.map(r => {
                    const dateFr = new Date(String(r.date_heure_debut).replace('Z', '')).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={r.id_rdv} style={{ backgroundColor: '#ffffff', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827', textTransform: 'capitalize' }}>
                            {dateFr}
                          </div>
                          <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '2px' }}>
                            {r.prestation} • avec <strong>{r.employe_nom}</strong>
                          </div>
                          {r.acompte_paye > 0 && (
                            <span style={{ fontSize: '11px', color: '#047857', fontWeight: '700' }}>
                              Acompte réglé en ligne : {r.acompte_paye.toFixed(2)} €
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAnnulerRdv(r.id_rdv)}
                          style={{
                            backgroundColor: '#ffffff',
                            color: '#dc2626',
                            border: '1px solid #fee2e2',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          Annuler d'un clic
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(profilClientData?.rdvs_passes || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6b7280', fontSize: '13.5px' }}>
                    Aucun historique de visite passé.
                  </div>
                ) : (
                  profilClientData.rdvs_passes.map(r => {
                    const dateFr = new Date(String(r.date_heure_debut).replace('Z', '')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
                    return (
                      <div key={r.id_rdv} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#111827' }}>{r.prestation}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{dateFr} avec {r.employe_nom}</div>
                        </div>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: r.statut === 'ANNULE' ? '#fee2e2' : '#e5e7eb', color: r.statut === 'ANNULE' ? '#991b1b' : '#374151', fontWeight: '700' }}>
                          {r.statut === 'ANNULE' ? 'Annulé' : 'Effectué'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleLogoutClient}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE PLEIN ÉCRAN TOUTES LES PHOTOS */}
      {galerieModalOpen && (
        <div
          onClick={() => setGalerieModalOpen(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '860px', width: '100%', maxHeight: '85vh', backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <strong style={{ fontSize: '18px', color: '#111827' }}>Photos de {nomSalon}</strong>
              <button type="button" onClick={() => setGalerieModalOpen(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: '700', cursor: 'pointer', color: '#374151' }}>Fermer</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
              {photosSalon.map((url, idx) => (
                <div key={idx} style={{ borderRadius: '12px', overflow: 'hidden', height: '240px', backgroundColor: '#f3f4f6' }}>
                  <img src={url} alt={`${nomSalon} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BARRE RÉCAPITULATIVE FLOTTANTE EN BAS */}
      {!confirmationOk && panierPrestations.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTop: '1px solid #e5e7eb', padding: '14px 24px', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)', zIndex: 100 }}>
          <div style={{ maxWidth: '1024px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>
                {panierPrestations.map(p => p.nom).join(' + ')}
              </span>
              <span style={{ fontSize: '15px', color: '#d1d5db' }}>|</span>
              <span style={{ fontSize: '14px', color: '#4b5563' }}>{dureeTotaleMinutes} min</span>
              <span style={{ fontSize: '15px', color: '#d1d5db' }}>|</span>
              <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>{prixTotalPanier.toFixed(2)} €</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('tunnel-reservation-ancrage');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }}
            >
              {creneauSelectionne ? "Confirmer la réservation" : "Choisir date & heure"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
