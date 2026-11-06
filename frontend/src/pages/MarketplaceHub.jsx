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
  const [dayOffset, setDayOffset] = useState(0);

  const startDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toLocaleString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 10);
  }, [dayOffset]);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    fetch(`${API_URL}/api/public/marketplace/salon/${salon.id_salon}/creneaux-apercu?startDate=${startDateStr}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data) setApercuCreneaux(data);
        if (active) setLoadingSlots(false);
      })
      .catch(() => {
        if (active) setLoadingSlots(false);
      });
    return () => { active = false; };
  }, [salon.id_salon, startDateStr]);

  const photos = salon.photos_salon && salon.photos_salon.length > 0 ? salon.photos_salon : [];
  const isFav = favorisIds.includes(salon.id_salon);

  const allerSurSalon = (paramsExtra = '') => {
    window.location.href = `/?reservation=${salon.id_salon}${paramsExtra}`;
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '14px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '310px 1fr',
      boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      transition: 'box-shadow 0.2s ease'
    }}>
      {/* CARROUSEL PHOTOS À GAUCHE */}
      <div style={{ position: 'relative', height: isMobile ? '220px' : '100%', minHeight: '260px', backgroundColor: '#111827', overflow: 'hidden' }}>
        {photos.length > 0 ? (
          <img
            src={photos[photoIdx % photos.length]}
            alt={salon.nom_salon}
            onClick={() => allerSurSalon()}
            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
          />
        ) : (
          <div
            onClick={() => allerSurSalon()}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer', padding: '20px', boxSizing: 'border-box', textAlign: 'center' }}
          >
            <div style={{ width: '54px', height: '54px', borderRadius: '14px', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', fontSize: '18px', fontWeight: '800', letterSpacing: '0.08em' }}>
              {String(salon.nom_salon || 'S').slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: '14px', fontWeight: '700' }}>{salon.nom_salon}</span>
          </div>
        )}

        {/* BOUTON COEUR FAVORIS */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavori(salon); }}
          aria-label="Ajouter aux favoris"
          style={{
            position: 'absolute', top: '12px', right: '12px',
            width: '34px', height: '34px', borderRadius: '50%',
            backgroundColor: 'rgba(17, 24, 39, 0.45)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff'
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isFav ? '#ffffff' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        {/* FLÈCHES ET DOTS DU CARROUSEL */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <div style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '5px' }}>
              {photos.map((_, idx) => (
                <span
                  key={idx}
                  style={{
                    width: idx === photoIdx % photos.length ? '16px' : '6px',
                    height: '6px',
                    borderRadius: '999px',
                    backgroundColor: idx === photoIdx % photos.length ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    transition: 'all 0.2s ease'
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* CONTENU DROITE : INFOS SALON + SÉLECTEUR DE CRÉNEAUX 3 JOURS + ACTIONS */}
      <div style={{ padding: isMobile ? '18px' : '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 290px', gap: '20px', alignItems: 'start' }}>
          {/* Infos principales */}
          <div>
            <h3
              onClick={() => allerSurSalon()}
              style={{ margin: '0 0 6px 0', fontSize: '19px', fontWeight: '800', color: '#111827', cursor: 'pointer', letterSpacing: '-0.01em' }}
            >
              {salon.nom_salon}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{salon.adresse_salon}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#4b5563', fontWeight: '500' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {salon.nb_avis > 0 ? (
                <>
                  <strong style={{ color: '#111827' }}>{salon.note_moyenne}</strong>
                  <span>({salon.nb_avis} avis)</span>
                </>
              ) : (
                <span>Nouveau sur STACK</span>
              )}
              <span>•</span>
              <span style={{ fontWeight: '700', color: '#111827' }}>{salon.gamme_prix || '€€'}</span>
            </div>
          </div>

          {/* Sélecteur de créneaux direct (Colonnes 3 jours + MATIN / APRÈS-MIDI) */}
          <div style={{ borderLeft: isMobile ? 'none' : '1px solid #f3f4f6', paddingLeft: isMobile ? 0 : '18px' }}>
            {loadingSlots ? (
              <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                Chargement des disponibilités...
              </div>
            ) : apercuCreneaux?.prochaine_disponibilite ? (
              <div
                onClick={() => allerSurSalon(`&date=${apercuCreneaux.prochaine_disponibilite.date}`)}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#f9fafb'
                }}
              >
                <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  PROCHAINE DISPONIBILITÉ
                </div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', textTransform: 'capitalize' }}>
                  {apercuCreneaux.prochaine_disponibilite.label} ({apercuCreneaux.prochaine_disponibilite.premier_creneau})
                </div>
              </div>
            ) : (
              <div>
                {/* En-tête des 3 jours avec flèches */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <button
                    type="button"
                    disabled={dayOffset === 0}
                    onClick={() => setDayOffset(Math.max(0, dayOffset - 3))}
                    style={{ background: 'none', border: 'none', cursor: dayOffset === 0 ? 'default' : 'pointer', opacity: dayOffset === 0 ? 0.25 : 1, padding: '2px', color: '#111827' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', flex: 1, textAlign: 'center', gap: '6px' }}>
                    {(apercuCreneaux?.jours || []).map(j => (
                      <div key={j.date} style={{ fontSize: '11.5px', fontWeight: '700', color: '#111827' }}>
                        <span style={{ color: '#6b7280', fontWeight: '500' }}>{j.label_jour} </span>
                        <span>{j.numero_jour}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDayOffset(dayOffset + 3)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#111827' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>

                {/* Ligne MATIN */}
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#9ca3af', textAlign: 'center', letterSpacing: '0.08em', margin: '4px 0' }}>
                  MATIN
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
                  {(apercuCreneaux?.jours || []).map(j => (
                    <div key={j.date + '_m'} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                      {j.matin.length === 0 ? (
                        <span style={{ fontSize: '11px', color: '#d1d5db', padding: '4px 0' }}>—</span>
                      ) : (
                        j.matin.slice(0, 2).map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => allerSurSalon(`&date=${j.date}&heure=${encodeURIComponent(h)}`)}
                            style={{ width: '100%', padding: '4px 0', fontSize: '11.5px', fontWeight: '600', color: '#111827', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            {h}
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                </div>

                {/* Ligne APRÈS-MIDI */}
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#9ca3af', textAlign: 'center', letterSpacing: '0.08em', margin: '4px 0' }}>
                  APRÈS-MIDI
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {(apercuCreneaux?.jours || []).map(j => (
                    <div key={j.date + '_am'} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                      {j.apres_midi.length === 0 ? (
                        <span style={{ fontSize: '11px', color: '#d1d5db', padding: '4px 0' }}>—</span>
                      ) : (
                        j.apres_midi.slice(0, 2).map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => allerSurSalon(`&date=${j.date}&heure=${encodeURIComponent(h)}`)}
                            style={{ width: '100%', padding: '4px 0', fontSize: '11.5px', fontWeight: '600', color: '#111827', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            {h}
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Barre d'actions en bas de carte */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid #f3f4f6' }}>
          <button
            type="button"
            onClick={() => allerSurSalon('#description-salon')}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', fontWeight: '600', color: '#111827', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Plus d'informations
          </button>
          <button
            type="button"
            onClick={() => allerSurSalon()}
            style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }}
          >
            Prendre RDV
          </button>
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

      {/* HEADER GLOBAL PLANITY-STYLE */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 80 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '16px' : '36px' }}>
            <div
              onClick={() => { setModeVue('ACCUEIL'); setSearchVille(''); setSearchQ(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '19px', letterSpacing: '0.22em', color: '#111827', cursor: 'pointer' }}
            >
              <span>STACK</span>
            </div>

            {!isMobile && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
                {CATEGORIES_HEADER.map(cat => {
                  const actif = categorieHeader === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategorieHeader(cat);
                        if (cat === 'Barbier') setChipActif('Barbier');
                        else setChipActif('TOUS');
                      }}
                      style={{
                        background: 'none', border: 'none', padding: '4px 0',
                        fontSize: '14px', fontWeight: actif ? '700' : '500',
                        color: '#111827', cursor: 'pointer',
                        borderBottom: actif ? '2px solid #111827' : '2px solid transparent'
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isMobile && (
              <button
                type="button"
                onClick={() => { window.location.href = '/?pro=1'; }}
                style={{
                  backgroundColor: '#f3f4f6',
                  color: '#111827',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Je suis un professionnel de beauté
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
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>{clientConnecte ? 'Mon compte' : 'Mon compte'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* VUE 1 : PAGE D'ACCUEIL MARKETPLACE (HERO BANNER + VILLES)           */}
      {/* =================================================================== */}
      {modeVue === 'ACCUEIL' ? (
        <>
          {/* HERO BANNER */}
          <section style={{
            position: 'relative',
            minHeight: isMobile ? '360px' : '440px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '32px 16px' : '48px 24px',
            backgroundImage: 'linear-gradient(rgba(17, 24, 39, 0.48), rgba(17, 24, 39, 0.58)), url("https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1800&q=80")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}>
            <div style={{ maxWidth: '920px', width: '100%', textAlign: 'center' }}>
              <h1 style={{ color: '#ffffff', fontSize: isMobile ? '26px' : '40px', fontWeight: '600', margin: '0 0 28px 0', letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                Réserver en ligne un RDV avec un {categorieHeader.toLowerCase()}
              </h1>

              {/* BARRE DE RECHERCHE DOUBLE UNIFIÉE */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setModeVue('RESULTATS');
                  lancerRecherche(searchVille, searchQ, chipActif);
                }}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: isMobile ? '12px' : '8px 8px 8px 20px',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'stretch',
                  gap: isMobile ? '10px' : '0',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.22)'
                }}
              >
                <div style={{ flex: 1, textAlign: 'left', paddingRight: isMobile ? 0 : '16px', borderRight: isMobile ? 'none' : '1px solid #e5e7eb', borderBottom: isMobile ? '1px solid #e5e7eb' : 'none', paddingBottom: isMobile ? '8px' : 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '2px' }}>
                    Que cherchez-vous ?
                  </label>
                  <input
                    type="text"
                    placeholder="Nom du salon, prestations (coupe, balayage...)"
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: '14px', fontWeight: '500', color: '#111827', width: '100%', padding: '2px 0' }}
                  />
                </div>

                <div style={{ flex: 1, textAlign: 'left', paddingLeft: isMobile ? 0 : '18px', paddingRight: isMobile ? 0 : '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '2px' }}>
                    Où
                  </label>
                  <input
                    type="text"
                    placeholder="Adresse, ville..."
                    value={searchVille}
                    onChange={e => setSearchVille(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: '14px', fontWeight: '500', color: '#111827', width: '100%', padding: '2px 0' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    backgroundColor: '#1f2328',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: isMobile ? '14px' : '16px 28px',
                    fontSize: '14.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  Rechercher
                </button>
              </form>
            </div>
          </section>

          {/* SECTION VILLES & DÉCOUVERTE */}
          <section style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '36px 16px' : '56px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
                DÉCOUVREZ NOS PROFESSIONNELS
              </div>
              <h2 style={{ margin: 0, fontSize: isMobile ? '24px' : '30px', fontWeight: '700', color: '#111827' }}>
                {categorieHeader}
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '24px', marginBottom: '56px' }}>
              {villesPopulaires.slice(0, 6).map(item => (
                <div
                  key={item.ville}
                  onClick={() => {
                    setSearchVille(item.ville);
                    setModeVue('RESULTATS');
                    lancerRecherche(item.ville, searchQ, chipActif);
                  }}
                  style={{ cursor: 'pointer', group: 'true' }}
                >
                  <div style={{ height: '210px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#111827', marginBottom: '12px', position: 'relative' }}>
                    {item.photo_url && (
                      <img
                        src={item.photo_url}
                        alt={item.ville}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
                    Découvrez nos
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15.5px', fontWeight: '700', color: '#111827' }}>
                      {categorieHeader}s à {item.ville}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              ))}
            </div>

            {/* APERÇU DIRECT DES ÉTABLISSEMENTS PARTENAIRES */}
            {salons.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                    Établissements disponibles immédiatement en ligne
                  </h3>
                  <button
                    type="button"
                    onClick={() => setModeVue('RESULTATS')}
                    style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: '700', color: '#111827', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Voir tous les salons ({salons.length})
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {salons.slice(0, 4).map(s => (
                    <SalonMarketplaceCard
                      key={s.id_salon}
                      salon={s}
                      isMobile={isMobile}
                      favorisIds={favorisIds}
                      onToggleFavori={handleToggleFavori}
                    />
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
