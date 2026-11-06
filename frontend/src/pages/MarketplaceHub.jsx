// frontend/src/pages/MarketplaceHub.jsx
// Portail Marketplace Global STACK (Vues 1 & 2 façon Planity Executive)

import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../api/config';
import { isTokenExpired } from '../utils/auth';

const CATEGORIES_HEADER = ['Coiffeur', 'Barbier', 'Manucure', 'Institut de beauté', 'Bien-être'];
const CHIPS_FILTRES = [
  { id: 'TOUS', label: 'Tous les salons' },
  { id: 'Coiffure homme', label: 'Coiffure homme' },
  { id: 'Coiffure femme', label: 'Coiffure femme' },
  { id: 'Coiffure jeunes', label: 'Coiffure jeunes' },
  { id: 'Barbier', label: 'Barbier' }
];

function SalonMarketplaceCard({ salon, isMobile, favorisIds, onToggleFavori }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [apercuCreneaux, setApercuCreneaux] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);

  const startDateStr = useMemo(() => new Date().toLocaleString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 10), []);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    fetch(`${API_URL}/api/public/marketplace/salon/${salon.id_salon}/creneaux-apercu?startDate=${startDateStr}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data) setApercuCreneaux(data);
        if (active) setLoadingSlots(false);
      })
      .catch(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [salon.id_salon, startDateStr]);

  const photos = salon.photos_salon && salon.photos_salon.length > 0 ? salon.photos_salon : [];
  const isFav = favorisIds.includes(salon.id_salon);

  const allerSurSalon = (paramsExtra = '') => {
    window.location.href = `/?reservation=${salon.id_salon}${paramsExtra}`;
  };

  // Aplatir les créneaux pour le design vertical (Max 4 créneaux affichés)
  const allSlots = [];
  if (apercuCreneaux?.jours) {
    apercuCreneaux.jours.forEach(j => {
      j.matin.forEach(h => allSlots.push({ date: j.date, heure: h, label: j.label_jour }));
      j.apres_midi.forEach(h => allSlots.push({ date: j.date, heure: h, label: j.label_jour }));
    });
  }
  const displaySlots = allSlots.slice(0, 4);

  return (
    <div
      onClick={() => allerSurSalon()}
      style={{
        backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)', cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}
    >
      {/* PHOTO TOP */}
      <div style={{ position: 'relative', height: '240px', backgroundColor: '#111827', overflow: 'hidden' }}>
        {photos.length > 0 ? (
          <img src={photos[photoIdx % photos.length]} alt={salon.nom_salon} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '14px', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', fontSize: '18px', fontWeight: '800' }}>
              {String(salon.nom_salon || 'S').slice(0, 2).toUpperCase()}
            </div>
          </div>
        )}

        {/* COEUR FAVORIS */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavori(salon); }}
          style={{ position: 'absolute', top: '12px', right: '12px', width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(17, 24, 39, 0.45)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', backdropFilter: 'blur(4px)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isFav ? '#ffffff' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>

        {/* DOTS & FLÈCHES */}
        {photos.length > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
            <div style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '5px' }}>
              {photos.map((_, idx) => (
                <span key={idx} style={{ width: idx === photoIdx % photos.length ? '16px' : '6px', height: '6px', borderRadius: '999px', backgroundColor: idx === photoIdx % photos.length ? '#ffffff' : 'rgba(255,255,255,0.55)', transition: 'all 0.2s ease' }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* INFOS SALON (BOTTOM) */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '10px' }}>
            {salon.nom_salon}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13.5px', fontWeight: '700', color: '#111827', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#111827" stroke="#111827" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {salon.note_moyenne || 'Nouveau'}
          </div>
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {salon.ville} • {salon.gamme_prix || '€€'}
        </div>

        {/* CRÉNEAUX DISPONIBLES (MINI PILULES) */}
        <div style={{ marginTop: 'auto' }}>
          {loadingSlots ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '10px 0' }}>Disponibilités en cours...</div>
          ) : displaySlots.length > 0 ? (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {displaySlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); allerSurSalon(`&date=${slot.date}&heure=${encodeURIComponent(slot.heure)}`); }}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#111827', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                >
                  {slot.label} {slot.heure}
                </button>
              ))}
            </div>
          ) : apercuCreneaux?.prochaine_disponibilite ? (
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#4b5563', padding: '8px 12px', backgroundColor: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
              Dispo le {apercuCreneaux.prochaine_disponibilite.date.split('-').reverse().slice(0,2).join('/')} à {apercuCreneaux.prochaine_disponibilite.premier_creneau}
            </div>
          ) : (
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>Aucun créneau immédiat</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplaceHub() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialVille = urlParams.get('ville') || '';
  const initialQuery = urlParams.get('q') || '';
  const initialCat = urlParams.get('categorie') || 'Coiffeur';

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [modeVue, setModeVue] = useState(() => (initialVille || initialQuery || urlParams.get('search') === '1') ? 'RESULTATS' : 'ACCUEIL');

  const [categorieHeader, setCategorieHeader] = useState(initialCat);
  const [searchQ, setSearchQ] = useState(initialQuery);
  const [searchVille, setSearchVille] = useState(initialVille);
  const [chipActif, setChipActif] = useState('TOUS');

  const [salons, setSalons] = useState([]);
  const [villesPopulaires, setVillesPopulaires] = useState([]);
  const [loadingSalons, setLoadingSalons] = useState(false);

  const [favorisIds, setFavorisIds] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('stack_favoris_salons') || '[]');
      return Array.isArray(raw) ? raw.map(s => s.id_salon) : [];
    } catch (e) { return []; }
  });

  const isMobile = windowWidth < 900;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/public/marketplace/villes-populaires`)
      .then(r => (r.ok ? r.json() : { villes: [] }))
      .then(data => setVillesPopulaires(data.villes || []))
      .catch(() => {});
  }, []);

  const lancerRecherche = (customVille = searchVille, customQ = searchQ, customChip = chipActif) => {
    setLoadingSalons(true);
    const params = new URLSearchParams();
    if (customQ.trim()) params.set('q', customQ.trim());
    if (customVille.trim()) params.set('ville', customVille.trim());
    if (customChip && customChip !== 'TOUS') params.set('categorie', customChip);

    fetch(`${API_URL}/api/public/marketplace/salons?${params.toString()}`)
      .then(r => (r.ok ? r.json() : { salons: [] }))
      .then(data => {
        setSalons(data.salons || []);
        setLoadingSalons(false);
      })
      .catch(() => setLoadingSalons(false));
  };

  useEffect(() => {
    lancerRecherche(searchVille, searchQ, chipActif);
  }, [modeVue, chipActif]);

  const handleToggleFavori = (salonObj) => {
    try {
      const existants = JSON.parse(localStorage.getItem('stack_favoris_salons') || '[]');
      const deja = existants.some(s => s.id_salon === salonObj.id_salon);
      const maj = deja
        ? existants.filter(s => s.id_salon !== salonObj.id_salon)
        : [...existants, {
            id_salon: salonObj.id_salon,
            nom_salon: salonObj.nom_salon,
            adresse_salon: salonObj.adresse_salon,
            photo_url: salonObj.photos_salon?.[0] || salonObj.logo_url || null,
            note_moyenne: salonObj.note_moyenne,
            nb_avis: salonObj.nb_avis
          }];
      localStorage.setItem('stack_favoris_salons', JSON.stringify(maj));
      setFavorisIds(maj.map(s => s.id_salon));
    } catch (e) {}
  };

  const clientConnecte = useMemo(() => {
    const tok = localStorage.getItem('token_client');
    return Boolean(tok && !isTokenExpired(tok));
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* HEADER EXECUTIVE STACK */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 80 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <div
            onClick={() => { setModeVue('ACCUEIL'); setSearchVille(''); setSearchQ(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '19px', letterSpacing: '0.22em', color: '#111827', cursor: 'pointer' }}
          >
            <img src="/logo-stack.png" alt="STACK" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
            <span>STACK</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!isMobile && (
              <button
                type="button"
                onClick={() => { window.location.href = '/?pro=1'; }}
                style={{
                  background: 'none',
                  color: '#4b5563',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '4px'
                }}
              >
                STACK pour les Pros
              </button>
            )}
            <button
              type="button"
              onClick={() => { window.location.href = '/mon-compte'; }}
              style={{
                backgroundColor: '#1f2328',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '13.5px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>{clientConnecte ? 'Mon Espace' : 'Se connecter'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* VUE 1 : PAGE D'ACCUEIL MARKETPLACE (HERO + RADAR)                   */}
      {/* =================================================================== */}
      {modeVue === 'ACCUEIL' ? (
        <>
          {/* HERO BANNER (RECHERCHE + PILLS) */}
          <section style={{
            position: 'relative',
            minHeight: isMobile ? '380px' : '460px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '32px 16px' : '48px 24px',
            backgroundColor: '#ffffff',
            backgroundImage: 'radial-gradient(circle at center, #f3f4f6 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}>
            <div style={{ maxWidth: '860px', width: '100%', textAlign: 'center', position: 'relative', zIndex: 10 }}>
              <h1 style={{ color: '#111827', fontSize: isMobile ? '28px' : '44px', fontWeight: '800', margin: '0 0 12px 0', letterSpacing: '-0.03em' }}>
                L'Excellence près de chez vous.
              </h1>
              <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#6b7280', margin: '0 0 32px 0', fontWeight: '500' }}>
                Réservez dans les meilleurs salons et instituts du réseau STACK.
              </p>

              {/* BARRE DE RECHERCHE UNIFIÉE */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setModeVue('RESULTATS');
                  lancerRecherche(searchVille, searchQ, chipActif);
                }}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: isMobile ? '12px' : '8px 8px 8px 24px',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'stretch',
                  gap: isMobile ? '12px' : '0',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.06)',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div style={{ flex: 1, textAlign: 'left', paddingRight: isMobile ? 0 : '16px', borderRight: isMobile ? 'none' : '1px solid #e5e7eb', borderBottom: isMobile ? '1px solid #e5e7eb' : 'none', paddingBottom: isMobile ? '12px' : 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Que cherchez-vous ?
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Balayage, Barbier..."
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#111827', width: '100%', padding: '2px 0' }}
                  />
                </div>

                <div style={{ flex: 1, textAlign: 'left', paddingLeft: isMobile ? 0 : '20px', paddingRight: isMobile ? 0 : '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Où ?
                  </label>
                  <input
                    type="text"
                    placeholder="Adresse, Ville..."
                    value={searchVille}
                    onChange={e => setSearchVille(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#111827', width: '100%', padding: '2px 0' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    backgroundColor: '#111827', color: '#ffffff', border: 'none',
                    borderRadius: '10px', padding: isMobile ? '16px' : '0 32px',
                    fontSize: '15px', fontWeight: '700', cursor: 'pointer', flexShrink: 0
                  }}
                >
                  Rechercher
                </button>
              </form>

              {/* PILLS CATÉGORIES */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '28px' }}>
                {[
                  { id: 'Coiffure femme', label: 'Coiffure', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> },
                  { id: 'Barbier', label: 'Barbier', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> },
                  { id: 'Esthétique', label: 'Esthétique', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> }
                ].map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setChipActif(c.id); setModeVue('RESULTATS'); lancerRecherche(searchVille, searchQ, c.id); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px', borderRadius: '999px', border: '1px solid #e5e7eb',
                      backgroundColor: '#ffffff', color: '#111827', fontSize: '13px', fontWeight: '600',
                      cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
                    }}
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* BANDEAU PREUVE SOCIALE STACK */}
          <div style={{ backgroundColor: '#111827', padding: '20px 16px' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', fontSize: '13.5px', fontWeight: '700' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                +450 Salons partenaires
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', fontSize: '13.5px', fontWeight: '700' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Paiement 100% sécurisé
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', fontSize: '13.5px', fontWeight: '700' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Réservation 24h/24
              </div>
            </div>
          </div>

          {/* LE RADAR STACK (CARTE ANIMÉE) */}
          <section style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '36px 16px' : '56px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '24px' : '28px', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
                La sélection STACK
              </h2>
              <div style={{ fontSize: '15px', color: '#6b7280', marginTop: '8px' }}>Explorez notre réseau d'établissements d'exception.</div>
            </div>

            <div style={{ position: 'relative', height: isMobile ? '280px' : '420px', borderRadius: '24px', backgroundColor: '#0f172a', overflow: 'hidden', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
              <style>{`@keyframes spin-radar { 100% { transform: rotate(360deg); } } @keyframes pulse-dot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.6; } }`}</style>
              
              {/* Grille de fond cartographique */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.6 }}></div>
              
              {/* Faisceau rotatif */}
              <div style={{ position: 'absolute', width: '150%', height: '150%', background: 'conic-gradient(from 0deg, transparent 70%, rgba(56, 189, 248, 0.25) 100%)', animation: 'spin-radar 4s linear infinite', borderRadius: '50%' }}></div>
              
              {/* Salons (Points lumineux) */}
              <div style={{ position: 'absolute', top: '35%', left: '25%', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8', boxShadow: '0 0 14px #38bdf8', animation: 'pulse-dot 2.5s infinite' }}></div>
              <div style={{ position: 'absolute', top: '55%', left: '70%', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 16px #10b981', animation: 'pulse-dot 2s infinite' }}></div>
              <div style={{ position: 'absolute', top: '75%', left: '45%', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }}></div>
              <div style={{ position: 'absolute', top: '25%', left: '60%', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#8b5cf6', boxShadow: '0 0 18px #8b5cf6', animation: 'pulse-dot 3s infinite' }}></div>
              <div style={{ position: 'absolute', top: '65%', left: '30%', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 14px #10b981', animation: 'pulse-dot 2.8s infinite' }}></div>

              {/* Texte Central */}
              <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', backgroundColor: 'rgba(15, 23, 42, 0.75)', padding: '20px 32px', borderRadius: '16px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '6px' }}>Réseau Connecté</div>
                <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>Déjà +450 salons référencés</div>
                <div style={{ fontSize: '14.5px', color: '#94a3b8', marginTop: '6px' }}>Mises à jour des disponibilités en temps réel.</div>
              </div>
            </div>

            {/* LISTE DES SALONS (SI PRÉSENTS) */}
            {salons.length > 0 && (
              <div style={{ marginTop: '56px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                    Salons fraîchement ajoutés
                  </h3>
                  <button
                    type="button"
                    onClick={() => setModeVue('RESULTATS')}
                    style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: '700', color: '#111827', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Voir tout ({salons.length})
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {salons.slice(0, 4).map(s => (
                    <SalonMarketplaceCard key={s.id_salon} salon={s} isMobile={isMobile} favorisIds={favorisIds} onToggleFavori={handleToggleFavori} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        /* =================================================================== */
        /* VUE 2 : LISTE DES RÉSULTATS & RECHERCHE (PLANITY /COIFFEUR/VILLE)   */
        /* =================================================================== */
        <div style={{ backgroundColor: '#f7f7f8', minHeight: 'calc(100vh - 65px)', paddingBottom: '60px' }}>

          {/* BARRE DE RECHERCHE HAUTE STICKY + FILTRES CHIPS */}
          <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '14px 16px' }}>
            <div style={{ maxWidth: '1140px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  lancerRecherche(searchVille, searchQ, chipActif);
                }}
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  padding: '6px 6px 6px 14px',
                  gap: '10px',
                  maxWidth: '680px',
                  backgroundColor: '#ffffff'
                }}
              >
                <input
                  type="text"
                  placeholder="Coiffeurs, coupe, balayage..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13.5px', fontWeight: '600', color: '#111827', width: '100%' }}
                />
                {!isMobile && <span style={{ color: '#e5e7eb' }}>|</span>}
                <input
                  type="text"
                  placeholder="Ville, code postal..."
                  value={searchVille}
                  onChange={e => setSearchVille(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13.5px', fontWeight: '600', color: '#111827', width: '100%' }}
                />
                {!isMobile && <span style={{ color: '#e5e7eb' }}>|</span>}
                {!isMobile && (
                  <span style={{ fontSize: '13px', color: '#6b7280', padding: '0 8px', whiteSpace: 'nowrap' }}>
                    À tout moment
                  </span>
                )}
                <button
                  type="submit"
                  aria-label="Rechercher"
                  style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', width: isMobile ? '100%' : '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
              </form>

              {/* FILTRES RAPIDES (CHIPS) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', fontWeight: '600', color: '#111827', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                  <span>Filtres</span>
                </div>
                {CHIPS_FILTRES.map(ch => {
                  const actif = chipActif === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setChipActif(ch.id)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        border: actif ? '1.5px solid #111827' : '1px solid #e5e7eb',
                        backgroundColor: actif ? '#111827' : '#ffffff',
                        color: actif ? '#ffffff' : '#374151',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* LISTE DES CARTES DE SALONS */}
          <div style={{ maxWidth: '1040px', margin: '0 auto', padding: isMobile ? '20px 16px' : '28px 24px' }}>
            <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                Sélection de salons {searchVille ? `à ${searchVille}` : 'partenaires STACK'} ({salons.length})
              </h1>
              <button
                type="button"
                onClick={() => setModeVue('ACCUEIL')}
                style={{ background: 'none', border: 'none', fontSize: '13px', fontWeight: '600', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Retour à l'accueil
              </button>
            </div>

            {loadingSalons ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '48px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280', fontWeight: '600' }}>
                Recherche des établissements et de leurs disponibilités en temps réel...
              </div>
            ) : salons.length === 0 ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '48px 24px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '17px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
                  Aucun salon trouvé pour cette recherche
                </div>
                <div style={{ fontSize: '13.5px', color: '#6b7280', marginBottom: '20px' }}>
                  Essayez d'élargir votre recherche ou de réinitialiser les filtres.
                </div>
                <button
                  type="button"
                  onClick={() => { setSearchQ(''); setSearchVille(''); setChipActif('TOUS'); lancerRecherche('', '', 'TOUS'); }}
                  style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Afficher tous les salons
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {salons.map(salon => (
                  <SalonMarketplaceCard
                    key={salon.id_salon}
                    salon={salon}
                    isMobile={isMobile}
                    favorisIds={favorisIds}
                    onToggleFavori={handleToggleFavori}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
