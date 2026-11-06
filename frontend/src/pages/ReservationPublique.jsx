// frontend/src/pages/ReservationPublique.jsx
// Vitrine & Tunnel de Réservation Publique en Ligne (Design Executive type Planity)

import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../api/config';

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
  const MAX_WIDTH = '1024px';

  // États vitrine (Avis, Galerie, Carte)
  const [ongletAvis, setOngletAvis] = useState('note'); // 'note' | 'avis'
  const [carteActive, setCarteActive] = useState(false);
  const [galerieModalOpen, setGalerieModalOpen] = useState(false);
  const [categoriesDepliees, setCategoriesDepliees] = useState({});

  // États du tunnel de réservation
  const [etapeActive, setEtapeActive] = useState(1);
  const [prestaChoisie, setPrestaChoisie] = useState(null);
  const [employeChoisi, setEmployeChoisi] = useState('AUTO');
  const [dateChoisie, setDateChoisie] = useState(() => {
    // Utilise le fuseau horaire de Paris pour éviter un décalage de date la nuit
    const tzDate = new Date().toLocaleString("fr-CA", { timeZone: "Europe/Paris" });
    return tzDate.slice(0, 10);
  });
  const [creneaux, setCreneaux] = useState([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);
  const [creneauSelectionne, setCreneauSelectionne] = useState(null);

  // États client & validation
  const [clientNom, setClientNom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const [fideliteClient, setFideliteClient] = useState(null);
  const [confirmationOk, setConfirmationOk] = useState(() => new URLSearchParams(window.location.search).get('success') === '1');
  const [erreurMsg, setErreurMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMobile = windowWidth < 920;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/public/reservation/${idSalon}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) setInfos(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idSalon]);

  useEffect(() => {
    if (prestaChoisie && dateChoisie) {
      setLoadingCreneaux(true);
      setCreneauSelectionne(null);
      const empId = employeChoisi === 'AUTO' ? '' : (employeChoisi || '');
      fetch(`${API_URL}/api/public/reservation/${idSalon}/creneaux?date=${dateChoisie}&id_employe=${empId}&duree=${prestaChoisie.duree_estimee_minutes || 30}`)
        .then(r => (r.ok ? r.json() : { creneaux: [] }))
        .then(data => {
          setCreneaux(data.creneaux || []);
          setLoadingCreneaux(false);
        })
        .catch(() => setLoadingCreneaux(false));
    }
  }, [idSalon, prestaChoisie, employeChoisi, dateChoisie]);

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

  const indicateurPrix = useMemo(() => {
    const prestations = infos?.prestations || [];
    if (prestations.length === 0) return '€€';
    
    const prixTries = prestations
      .map(p => parseFloat(p.prix) || 0)
      .filter(prix => prix > 0)
      .sort((a, b) => a - b);
      
    if (prixTries.length === 0) return '€€';
    
    const milieu = Math.floor(prixTries.length / 2);
    const mediane = prixTries.length % 2 !== 0 
      ? prixTries[milieu] 
      : (prixTries[milieu - 1] + prixTries[milieu]) / 2;
      
    if (mediane < 20) return '€';
    if (mediane > 50) return '€€€';
    return '€€';
  }, [infos]);

  const verifierFideliteTel = (telVal) => {
    setClientTel(telVal);
    if (telVal.replace(/\s+/g, '').length >= 8) {
      fetch(`${API_URL}/api/public/reservation/${idSalon}/fidelite?telephone=${encodeURIComponent(telVal)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.client_trouve) {
            setFideliteClient(data);
            if (!clientNom && (data.prenom || data.nom)) {
              setClientNom(`${data.prenom || ''} ${data.nom || ''}`.trim());
            }
          } else {
            setFideliteClient(null);
          }
        })
        .catch(() => {});
    }
  };

  const selectionnerPrestation = (presta) => {
    setPrestaChoisie(presta);
    setEtapeActive(2);
    const el = document.getElementById('tunnel-reservation-ancrage');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const validerReservation = async (avecAcompteStripe = false) => {
    if (!creneauSelectionne || !clientNom.trim() || !clientTel.trim()) {
      setErreurMsg('Veuillez renseigner vos coordonnées complètes.');
      return;
    }
    setErreurMsg('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/reservation/${idSalon}/reserver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom_client: clientNom.trim(),
          telephone_client: clientTel.trim(),
          id_employe: creneauSelectionne.id_employe_suggere,
          prestation: prestaChoisie.nom,
          date_heure_debut: creneauSelectionne.date_heure_debut,
          duree_minutes: prestaChoisie.duree_estimee_minutes || 30,
          payer_acompte: avecAcompteStripe
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreurMsg(data.erreur || 'Impossible de valider ce créneau.');
      } else if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      } else {
        setConfirmationOk(true);
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
      // Correction du décalage UTC
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f8', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '110px' }}>

      {/* BARRE DE NAVIGATION SUPÉRIEURE SOBRIÉTÉ EXECUTIVE */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: isMobile ? '14px 16px' : '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '17px', letterSpacing: '0.18em', color: '#111827' }}>
            <img src="/logo-stack.png" alt="STACK" style={{ height: '26px', width: 'auto', objectFit: 'contain', display: 'block' }} />
            <span>STACK</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('choix-prestation-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            Prendre RDV
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1160px', margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 28px' }}>

        {/* EN-TÊTE ÉTABLISSEMENT (TITRE, ADRESSE SOULIGNÉE, NOTE, BOUTON PRENDRE RDV) */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '16px', marginBottom: '22px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '24px' : '30px', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
              {nomSalon}
            </h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px', color: '#4b5563' }}>
              <a
                href="#localisation-salon"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#4b5563', textDecoration: 'underline', fontWeight: '500' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{adresseSalon}</span>
              </a>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#4b5563', fontWeight: '500' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <strong style={{ color: '#111827' }}>{avisStats.noteGlobale}</strong>
                <span>({avisStats.nbAvis} avis)</span>
                <span>•</span>
                <span>{indicateurPrix}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('choix-prestation-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Prendre RDV
            </button>
          </div>
        </div>

        {/* GALERIE BENTO (PHOTOS CONFIGURÉES OU AFFICHAGE ARCHITECTURAL STYLISÉ AVEC LOGO) */}
        {photosSalon.length >= 3 ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr 1fr', gridTemplateRows: isMobile ? '240px' : '185px 185px', gap: '12px', marginBottom: '36px', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ gridRow: isMobile ? 'span 1' : 'span 2', position: 'relative', overflow: 'hidden', borderRadius: '14px', backgroundColor: '#111827' }}>
              <img src={photosSalon[0]} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {!isMobile && (
              <>
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img src={photosSalon[1]} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img src={photosSalon[2]} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ overflow: 'hidden', borderRadius: '14px', backgroundColor: '#1f2937' }}>
                  <img src={photosSalon[3] || photosSalon[1]} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div
                  onClick={() => setGalerieModalOpen(true)}
                  style={{ position: 'relative', overflow: 'hidden', borderRadius: '14px', backgroundColor: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {photosSalon[4] && <img src={photosSalon[4]} alt={nomSalon} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px) brightness(0.55)' }} />}
                  <span style={{ position: 'relative', zIndex: 2, color: '#ffffff', fontWeight: '600', fontSize: '13.5px' }}>
                    Voir les {photosSalon.length} photos
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          /* FALLBACK ESTHÉTIQUE EXECUTIVE SANS CERCLES IA */
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
                <div style={{ width: isMobile ? '68px' : '84px', height: isMobile ? '68px' : '84px', borderRadius: '20px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }}>
                  {infos.salon.logo_url ? (
                    <img src={infos.salon.logo_url} alt={nomSalon} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px' }} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                      <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', opacity: 0.85 }}>{initialesSalon}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{nomSalon}</div>
                  <div style={{ fontSize: '13.5px', color: '#d1d5db', marginTop: '6px' }}>{infos.salon.adresse_salon || infos.salon.adresse || nomSalon}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', fontSize: '12.5px', color: '#d1d5db', position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Confirmation SMS immédiate</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Réservation en ligne 24h/24</span>
              </div>
            </div>

            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '12px' }}>
                <div style={{ borderRadius: '16px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>Informations Pratiques</span>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>Annulation Gratuite & Paiement Sécurisé</div>
                    <div style={{ fontSize: '12.5px', color: '#6b7280', lineHeight: 1.45 }}>Modifiez ou annulez votre RDV sans frais. Payez sur place en toute sécurité après votre prestation.</div>
                  </div>
                </div>

                <div style={{ borderRadius: '16px', backgroundColor: '#1f2328', color: '#ffffff', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Programme Fidélité Salon</span>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff' }}>{avisStats.noteGlobale !== 'N/A' ? `★ ${avisStats.noteGlobale} / 5` : 'Nouveau'}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>Cumulez vos avantages automatiquement</div>
                    <div style={{ fontSize: '12.5px', color: '#9ca3af', lineHeight: 1.45 }}>Vos points ou tampons de fidélité sont reconnus dès la saisie de votre numéro de mobile.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SOUS-TITRE RÉSERVATION */}
        <div id="choix-prestation-section" style={{ marginBottom: '26px' }}>
          <h2 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '20px' : '22px', fontWeight: '800', color: '#111827' }}>
            Réserver en ligne pour un RDV chez {nomSalon}
          </h2>
          <div style={{ fontSize: '13.5px', color: '#6b7280' }}>
            24h/24 - Paiement sur place - Confirmation immédiate
          </div>
        </div>

        {/* GRILLE PRINCIPALE 2 COLONNES (GAUCHE : PRESTATIONS & TUNNEL | DROITE : NOTE GLOBALE, AVIS & HORAIRES) */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: '32px', alignItems: 'start' }}>

          {/* COLONNE GAUCHE : CHOIX DE LA PRESTATION + TUNNEL ACTIF + CARTE + COLLABORATEURS */}
          <div>
            {confirmationOk ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '36px 28px', textAlign: 'center', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#111827', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px auto' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '21px', fontWeight: '800' }}>Votre rendez-vous est confirmé</h3>
                <p style={{ color: '#4b5563', fontSize: '14px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
                  Votre créneau chez <strong>{nomSalon}</strong> est réservé. Un SMS récapitulatif vous sera envoyé avant votre venue.
                </p>
                <button
                  type="button"
                  onClick={() => { setConfirmationOk(false); setPrestaChoisie(null); setCreneauSelectionne(null); setEtapeActive(1); }}
                  style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Prendre un autre rendez-vous
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ margin: '0 0 18px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                  Choix de la prestation
                </h3>

                {/* LISTE DES CATÉGORIES DE PRESTATIONS (STYLE PLANITY) */}
                {Object.entries(prestationsParCategorie).map(([categorie, items]) => {
                  const estDepliee = !!categoriesDepliees[categorie];
                  const itemsAffiches = estDepliee ? items : items.slice(0, 5);
                  const resteCount = items.length - 5;

                  return (
                    <div key={categorie} style={{ marginBottom: '28px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '17px', fontWeight: '700', color: '#111827' }}>
                        {categorie}
                      </h4>
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '4px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        {itemsAffiches.map((p, idx) => {
                          const estSelectionnee = prestaChoisie && (prestaChoisie.id_article || prestaChoisie.id) === (p.id_article || p.id);
                          return (
                            <div
                              key={p.id_article || p.id || idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '18px 0',
                                borderBottom: idx < itemsAffiches.length - 1 || (!estDepliee && resteCount > 0) ? '1px solid #f3f4f6' : 'none'
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '14.5px', fontWeight: '600', color: '#111827' }}>{p.nom}</div>
                                {p.description && (
                                  <div style={{ fontSize: '12.5px', color: '#6b7280', marginTop: '3px' }}>{p.description}</div>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                                <div style={{ fontSize: '13.5px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                  <span>{p.duree_estimee_minutes || 30}min</span>
                                  <span style={{ margin: '0 6px', color: '#d1d5db' }}>•</span>
                                  <strong style={{ color: '#111827', fontWeight: '700' }}>{parseFloat(p.prix).toFixed(0)} €</strong>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => selectionnerPrestation(p)}
                                  style={{
                                    backgroundColor: estSelectionnee ? '#16a34a' : '#1f2328',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '9px 16px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease'
                                  }}
                                >
                                  {estSelectionnee ? 'Sélectionné' : 'Choisir'}
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {!estDepliee && resteCount > 0 && (
                          <div style={{ padding: '14px 0' }}>
                            <button
                              type="button"
                              onClick={() => setCategoriesDepliees(prev => ({ ...prev, [categorie]: true }))}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#111827', textDecoration: 'underline', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Voir {resteCount} autre{resteCount > 1 ? 's' : ''} prestation{resteCount > 1 ? 's' : ''}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* TUNNEL DE SÉLECTION DU COLLABORATEUR, CRÉNEAU & VALIDATION (S'OUVRE AU CLIC SUR "CHOISIR") */}
                <div id="tunnel-reservation-ancrage">
                  {prestaChoisie && (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1.5px solid #111827', padding: isMobile ? '18px' : '24px', marginBottom: '36px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', marginBottom: '18px', borderBottom: '1px solid #f3f4f6' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>
                            Prestation sélectionnée
                          </span>
                          <div style={{ fontSize: '16.5px', fontWeight: '800', color: '#111827', marginTop: '2px' }}>
                            {prestaChoisie.nom} ({prestaChoisie.duree_estimee_minutes || 30} min • {parseFloat(prestaChoisie.prix).toFixed(2)} €)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setPrestaChoisie(null); setCreneauSelectionne(null); setEtapeActive(1); }}
                          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: '#4b5563', cursor: 'pointer' }}
                        >
                          Changer
                        </button>
                      </div>

                      {/* ÉTAPE 2 : CHOIX DU SPÉCIALISTE */}
                      <div style={{ marginBottom: '22px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                          1. Choisir avec qui prendre rendez-vous
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => { setEmployeChoisi('AUTO'); setEtapeActive(3); }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '10px',
                              padding: '10px 16px', borderRadius: '999px', cursor: 'pointer',
                              border: employeChoisi === 'AUTO' ? '1.5px solid #111827' : '1px solid #e5e7eb',
                              backgroundColor: employeChoisi === 'AUTO' ? '#111827' : '#ffffff',
                              color: employeChoisi === 'AUTO' ? '#ffffff' : '#111827',
                              fontSize: '13px', fontWeight: '600'
                            }}
                          >
                            <span>Sans préférence (Premier disponible)</span>
                          </button>

                          {(infos.employes || []).map(emp => {
                            const actif = employeChoisi === emp.id_employe;
                            const prenom = (emp.nom || 'Coiffeur').split(' ')[0];
                            return (
                              <button
                                key={emp.id_employe}
                                type="button"
                                onClick={() => { setEmployeChoisi(emp.id_employe); setEtapeActive(3); }}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                                  padding: '6px 14px 6px 6px', borderRadius: '999px', cursor: 'pointer',
                                  border: actif ? '1.5px solid #111827' : '1px solid #e5e7eb',
                                  backgroundColor: actif ? '#111827' : '#ffffff',
                                  color: actif ? '#ffffff' : '#111827',
                                  fontSize: '13px', fontWeight: '600'
                                }}
                              >
                                <span style={{
                                  width: '28px', height: '28px', borderRadius: '50%',
                                  backgroundColor: actif ? '#ffffff' : '#111827',
                                  color: actif ? '#111827' : '#ffffff',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '12px', fontWeight: '800'
                                }}>
                                  {prenom.charAt(0).toUpperCase()}
                                </span>
                                <span>{prenom}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ÉTAPE 3 : DATE & HEURE */}
                      <div style={{ marginBottom: creneauSelectionne ? '22px' : 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                          2. Sélectionner la date et l'horaire
                        </div>

                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '14px' }}>
                          {genererJoursSemaine().map(jour => {
                            const isSelected = dateChoisie === jour.date;
                            return (
                              <button
                                key={jour.date}
                                type="button"
                                onClick={() => { setDateChoisie(jour.date); setEtapeActive(3); }}
                                style={{
                                  flexShrink: 0, width: '64px', height: '70px', borderRadius: '10px',
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
                            Chargement des créneaux disponibles...
                          </div>
                        ) : creneaux.length === 0 ? (
                          <div style={{ padding: '18px', textAlign: 'center', color: '#6b7280', fontSize: '13.5px', backgroundColor: '#f9fafb', borderRadius: '10px' }}>
                            Aucun créneau disponible à cette date. Sélectionnez un autre jour ci-dessus.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: '8px' }}>
                            {creneaux.map(c => {
                              const isSlotSelected = creneauSelectionne?.heure === c.heure;
                              return (
                                <button
                                  key={c.heure}
                                  type="button"
                                  onClick={() => { setCreneauSelectionne(c); setEtapeActive(4); }}
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

                      {/* ÉTAPE 4 : COORDONNÉES CLIENT & CONFIRMATION */}
                      {creneauSelectionne && (
                        <div style={{ paddingTop: '18px', borderTop: '1px solid #f3f4f6' }}>
                          <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                            3. Vos coordonnées pour la confirmation SMS
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                            <input
                              type="tel"
                              placeholder="Téléphone mobile (ex: 06...)"
                              value={clientTel}
                              onChange={e => verifierFideliteTel(e.target.value)}
                              style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontSize: '14px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="Prénom & Nom"
                              value={clientNom}
                              onChange={e => setClientNom(e.target.value)}
                              style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontSize: '14px', outline: 'none' }}
                            />
                          </div>

                          {fideliteClient && (
                            <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>
                              Compte fidélité reconnu ({fideliteClient.prenom}) : {infos.salon.fidelite_type === 'TAMPONS' ? `${fideliteClient.tampons_fidelite} tampons` : `${fideliteClient.points_fidelite} points`} enregistrés.
                              {fideliteClient.remise_winback ? ` Offre active : ${fideliteClient.remise_winback}` : ''}
                            </div>
                          )}

                          {erreurMsg && (
                            <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>
                              {erreurMsg}
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => validerReservation(false)}
                              style={{ flex: 1, padding: '14px 18px', borderRadius: '10px', backgroundColor: '#111827', color: '#ffffff', fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                            >
                              {isSubmitting ? 'Validation en cours...' : `Confirmer le RDV (${creneauSelectionne.heure}) — Paiement sur place`}
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => validerReservation(true)}
                              style={{ padding: '14px 18px', borderRadius: '10px', backgroundColor: '#ffffff', color: '#111827', fontSize: '13px', fontWeight: '700', border: '1px solid #d1d5db', cursor: 'pointer' }}
                            >
                              Garantir avec acompte CB (30%)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div id="localisation-salon" style={{ marginTop: '20px', marginBottom: '40px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>Où se situe le salon ?</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: '#4b5563', textDecoration: 'underline', marginBottom: '14px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{infos.salon.adresse_salon || infos.salon.adresse || nomSalon}</span>
              </div>
              <div style={{ position: 'relative', height: '290px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: '#e5e7eb' }}>
                <iframe
                  title="Localisation du salon"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(infos.salon.adresse_salon || infos.salon.adresse || nomSalon)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                  style={{ width: '100%', height: '100%', border: 0, filter: carteActive ? 'none' : 'blur(6px) opacity(0.88)', pointerEvents: carteActive ? 'auto' : 'none', transition: 'filter 0.25s ease' }}
                  loading="lazy"
                />
                {!carteActive && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' }}>
                    <button
                      type="button"
                      onClick={() => setCarteActive(true)}
                      style={{
                        backgroundColor: '#1f2328',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px 20px',
                        fontSize: '13.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                      <span>Afficher la carte</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION : COLLABORATEURS (PASTILLES INITIALES NOIRES & PRÉNOMS) */}
            {(infos.employes || []).length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                  Collaborateurs
                </h3>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '22px', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '18px' }}>
                  {(infos.employes || []).map(emp => {
                    const prenom = (emp.nom || 'Collaborateur').split(' ')[0];
                    return (
                      <div key={emp.id_employe} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '50%', backgroundColor: '#000000', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>
                          {emp.photo_url ? (
                            <img src={emp.photo_url} alt={prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            prenom.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span style={{ fontSize: '14.5px', fontWeight: '600', color: '#111827' }}>{prenom}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* COLONNE DROITE : CARTE NOTE GLOBALE / AVIS + HORAIRES D'OUVERTURE */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* CARTE NOTE GLOBALE / AVIS */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  onClick={() => setOngletAvis('note')}
                  style={{
                    background: 'none', border: 'none',
                    borderBottom: ongletAvis === 'note' ? '2px solid #111827' : '2px solid transparent',
                    padding: '15px 10px', fontSize: '13.5px', fontWeight: ongletAvis === 'note' ? '700' : '500',
                    color: ongletAvis === 'note' ? '#111827' : '#6b7280', cursor: 'pointer'
                  }}
                >
                  Note globale
                </button>
                <button
                  type="button"
                  onClick={() => setOngletAvis('avis')}
                  style={{
                    background: 'none', border: 'none',
                    borderBottom: ongletAvis === 'avis' ? '2px solid #111827' : '2px solid transparent',
                    padding: '15px 10px', fontSize: '13.5px', fontWeight: ongletAvis === 'avis' ? '700' : '500',
                    color: ongletAvis === 'avis' ? '#111827' : '#6b7280', cursor: 'pointer'
                  }}
                >
                  Avis
                </button>
              </div>

              <div style={{ padding: '20px' }}>
                {ongletAvis === 'note' ? (
                  <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                    <div style={{ backgroundColor: '#1f2328', color: '#ffffff', width: '92px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: '800', flexShrink: 0 }}>
                      {avisStats.noteGlobale}
                    </div>
                    <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12.5px', color: '#4b5563' }}>
                      {[
                        { label: 'Accueil', val: avisStats.accueil },
                        { label: 'Propreté', val: avisStats.proprete },
                        { label: 'Cadre & Ambiance', val: avisStats.cadre },
                        { label: 'Qualité de la prestation', val: avisStats.qualite }
                      ].map(crit => (
                        <div key={crit.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{crit.label}</span>
                          <strong style={{ color: '#111827', marginLeft: '2px' }}>{crit.val}</strong>
                          <span style={{ color: '#111827', fontSize: '11px' }}>★</span>
                        </div>
                      ))}
                      <div style={{ marginTop: '6px', fontSize: '12.5px', color: '#111827', fontWeight: '500' }}>
                        {avisStats.nbAvis} clients ont donné leur avis
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto' }}>
                    {avisStats.liste.length === 0 ? (
                      <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', padding: '16px 0' }}>
                        Avis clients vérifiés après passage au salon (Note moyenne : {avisStats.noteGlobale}/5).
                      </div>
                    ) : (
                      avisStats.liste.slice(0, 6).map((av, i) => (
                        <div key={i} style={{ paddingBottom: '10px', borderBottom: i < avisStats.liste.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: '700', marginBottom: '4px' }}>
                            <span>{av.prenom || 'Client vérifié'}</span>
                            <span>{av.note || 5} ★</span>
                          </div>
                          <div style={{ fontSize: '12.5px', color: '#4b5563', lineHeight: 1.4 }}>{av.commentaire}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CARTE HORAIRES D'OUVERTURE */}
            <div>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '19px', fontWeight: '800', color: '#111827' }}>
                Horaires d'ouverture
              </h3>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '6px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                {JOURS_SEMAINE.map((jour, idx) => {
                  const estAujourdhui = idx === indexJourActuel;
                  const valeurHoraire = horairesSalon[jour] || '09:00 - 19:00';
                  const estFerme = String(valeurHoraire).toLowerCase().includes('fermé');
                  return (
                    <div
                      key={jour}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '15px 0',
                        borderBottom: idx < JOURS_SEMAINE.length - 1 ? '1px solid #f3f4f6' : 'none',
                        fontSize: '14px'
                      }}
                    >
                      <span style={{ color: estAujourdhui ? '#111827' : '#6b7280', fontWeight: estAujourdhui ? '700' : '400' }}>
                        {jour}
                      </span>
                      <span style={{ color: estFerme ? '#9ca3af' : '#111827', fontWeight: estAujourdhui ? '800' : '600', textAlign: 'right', whiteSpace: 'pre-line' }}>
                        {valeurHoraire}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </aside>
        </div>
      </main>

      {/* MODALE GALERIE PHOTOS SI LE SALON A PLUSIEURS PHOTOS */}
      {galerieModalOpen && (
        <div
          onClick={() => setGalerieModalOpen(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.82)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '860px', width: '100%', maxHeight: '85vh', backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <strong style={{ fontSize: '17px' }}>Photos de {nomSalon}</strong>
              <button type="button" onClick={() => setGalerieModalOpen(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: '600', cursor: 'pointer' }}>Fermer</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              {photosSalon.map((url, idx) => (
                <img key={idx} src={url} alt={`${nomSalon} ${idx + 1}`} style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '10px' }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BARRE RÉCAPITULATIVE FLOTTANTE EN BAS LORSQU'UNE PRESTATION EST SÉLECTIONNÉE */}
      {!confirmationOk && prestaChoisie && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTop: '1px solid #e5e7eb', padding: '14px 24px', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)', zIndex: 100 }}>
          <div style={{ maxWidth: '1024px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{prestaChoisie.nom}</span>
              <span style={{ fontSize: '15px', color: '#d1d5db' }}>|</span>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{parseFloat(prestaChoisie.prix).toFixed(2)} €</span>
              <span style={{ fontSize: '15px', color: '#d1d5db' }}>|</span>
              <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{prestaChoisie.duree_estimee_minutes || 30} min</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {creneauSelectionne ? (
                <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#111827' }}>
                  Créneau : {creneauSelectionne.heure} ({new Date(creneauSelectionne.date_heure_debut).toLocaleDateString('fr-FR')})
                </div>
              ) : (
                <div style={{ fontSize: '14px', color: '#4b5563', fontWeight: '600' }}>
                  Sélectionnez votre créneau ci-dessus
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
