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

const PHOTOS_SALON_DEFAUT = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80'
];

function nettoyerNomVille(villeBrute, adresseBrute) {
  const source = String(villeBrute || adresseBrute || '').trim();
  const matchCp = source.match(/\b\d{5}\s+([A-Za-zÀ-ÖØ-öø-ÿ\-\s']+)/);
  if (matchCp && matchCp[1]) return matchCp[1].trim();
  if (/^\d+/.test(source) || /(rue|avenue|boulevard|chemin|place|impasse|allée|route)/i.test(source)) {
    const parts = source.split(',');
    const last = parts[parts.length - 1].trim();
    if (!/^\d+/.test(last) && !/(rue|avenue|boulevard|chemin|place|impasse|allée|route)/i.test(last)) {
      return last || 'France';
    }
    return 'France';
  }
  return source || 'France';
}

function SalonMarketplaceCard({ salon, isMobile, favorisIds, onToggleFavori, onSlotsLoaded }) {
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
        if (active && data) {
          setApercuCreneaux(data);
          if (typeof onSlotsLoaded === 'function') {
            onSlotsLoaded(salon.id_salon, data);
          }
        }
        if (active) setLoadingSlots(false);
      })
      .catch(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [salon.id_salon, startDateStr]);

  const aVraiesPhotos = Array.isArray(salon.photos_salon) && salon.photos_salon.length > 0;
  const fallbackPhoto = PHOTOS_SALON_DEFAUT[(Number(salon.id_salon) || 0) % PHOTOS_SALON_DEFAUT.length];
  const photos = aVraiesPhotos ? salon.photos_salon : [fallbackPhoto];
  const isFav = favorisIds.includes(salon.id_salon);
  const villePropre = nettoyerNomVille(salon.ville, salon.adresse_salon);

  const allerSurSalon = (paramsExtra = '') => {
    window.location.href = `/?reservation=${salon.id_salon}${paramsExtra}`;
  };

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
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}
    >
      {/* PHOTO DE COUVERTURE */}
      <div style={{ position: 'relative', height: '215px', backgroundColor: '#111827', overflow: 'hidden' }}>
        <img
          src={photos[photoIdx % photos.length]}
          alt={salon.nom_salon}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: aVraiesPhotos ? 'none' : 'brightness(0.88)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(17,24,39,0.5) 0%, transparent 45%)', pointerEvents: 'none' }} />

        <div style={{
          position: 'absolute', bottom: '12px', left: '12px',
          padding: '4px 10px', borderRadius: '999px',
          backgroundColor: 'rgba(17, 24, 39, 0.72)', color: '#ffffff',
          fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em',
          backdropFilter: 'blur(4px)'
        }}>
          {villePropre}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavori(salon); }}
          style={{ position: 'absolute', top: '12px', right: '12px', width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(17, 24, 39, 0.5)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', backdropFilter: 'blur(4px)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#ffffff' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>

        {photos.length > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.88)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.88)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
          </>
        )}
      </div>

      {/* CONTENU DE LA CARTE */}
      <div style={{ padding: '16px 18px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: '800', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {salon.nom_salon}
          </h3>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '700', color: '#111827', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#111827" stroke="#111827" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>{salon.note_moyenne || 'Nouveau'}</span>
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: '#6b7280', marginBottom: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {salon.adresse_salon} • <strong style={{ color: '#111827' }}>{salon.gamme_prix || '€€'}</strong>
        </div>

        {/* CRÉNEAUX EN GRILLE 2 COLONNES */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
          {loadingSlots ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
              Vérification des créneaux...
            </div>
          ) : displaySlots.length > 0 ? (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Prochains créneaux</span>
                <span style={{ color: '#059669' }}>En direct</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {displaySlots.slice(0, 2).map((slot, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); allerSurSalon(`&date=${slot.date}&heure=${encodeURIComponent(slot.heure)}`); }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f9fafb',
                      color: '#111827',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {slot.label} {slot.heure}
                  </button>
                ))}
              </div>
            </div>
          ) : apercuCreneaux?.prochaine_disponibilite ? (
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', padding: '9px 12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'center' }}>
              Prochaine dispo : {apercuCreneaux.prochaine_disponibilite.date.split('-').reverse().slice(0, 2).join('/')} à {apercuCreneaux.prochaine_disponibilite.premier_creneau}
            </div>
          ) : (
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', padding: '9px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
              Consulter le planning →
            </div>
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
  const [filtreDispo, setFiltreDispo] = useState('TOUS'); // 'TOUS' | 'AUJOURDHUI' | 'DEMAIN' | 'NOTES'
  const [disposParSalon, setDisposParSalon] = useState({});

  const [salons, setSalons] = useState([]);
  const [villesPopulaires, setVillesPopulaires] = useState([]);
  const [loadingSalons, setLoadingSalons] = useState(false);

  const handleSlotsLoaded = (idSalon, data) => {
    setDisposParSalon(prev => ({ ...prev, [idSalon]: data }));
  };

  const salonsFiltresAccueil = useMemo(() => {
    let list = [...salons];
    if (filtreDispo === 'AUJOURDHUI') {
      list = list.filter(s => {
        const ap = disposParSalon[s.id_salon];
        if (!ap) return true;
        return (ap.jours?.[0]?.total_dispos || 0) > 0;
      });
    } else if (filtreDispo === 'DEMAIN') {
      list = list.filter(s => {
        const ap = disposParSalon[s.id_salon];
        if (!ap) return true;
        return (ap.jours?.[1]?.total_dispos || 0) > 0;
      });
    } else if (filtreDispo === 'NOTES') {
      list.sort((a, b) => {
        const na = parseFloat(String(a.note_moyenne || '0').replace(',', '.')) || 0;
        const nb = parseFloat(String(b.note_moyenne || '0').replace(',', '.')) || 0;
        return nb - na;
      });
    }
    return list;
  }, [salons, filtreDispo, disposParSalon]);

  const grandesMetropoles = useMemo(() => {
    const base = [
      { ville: 'Paris', region: 'Île-de-France' },
      { ville: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
      { ville: 'Marseille', region: 'Provence-Alpes-Côte d’Azur' },
      { ville: 'Bordeaux', region: 'Nouvelle-Aquitaine' },
      { ville: 'Strasbourg', region: 'Grand Est' },
      { ville: 'Toulouse', region: 'Occitanie' },
      { ville: 'Lille', region: 'Hauts-de-France' },
      { ville: 'Nantes', region: 'Pays de la Loire' },
      { ville: 'Nice', region: 'Côte d’Azur' },
      { ville: 'Montpellier', region: 'Occitanie' },
      { ville: 'Rennes', region: 'Bretagne' },
      { ville: 'Besançon', region: 'Bourgogne-Franche-Comté' }
    ];

    const mapVilles = new Map();
    base.forEach(b => mapVilles.set(b.ville.toLowerCase(), { ...b, count: 0 }));

    (villesPopulaires || []).forEach(vp => {
      const nomNettoye = nettoyerNomVille(vp.ville, '');
      if (!nomNettoye || nomNettoye === 'France' || /\d/.test(nomNettoye)) return;
      const cle = nomNettoye.toLowerCase();
      if (mapVilles.has(cle)) {
        mapVilles.get(cle).count = vp.nb_salons || 1;
      } else if (nomNettoye.length >= 3 && nomNettoye.length <= 22) {
        mapVilles.set(cle, { ville: nomNettoye, region: 'France', count: vp.nb_salons || 1 });
      }
    });

    return Array.from(mapVilles.values()).slice(0, 12);
  }, [villesPopulaires]);

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

      {/* HEADER EXECUTIVE STACK (SANS LOGO IMAGE) */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 80 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            onClick={() => { setModeVue('ACCUEIL'); setSearchVille(''); setSearchQ(''); }}
            style={{ fontWeight: '800', fontSize: '19px', letterSpacing: '0.22em', color: '#111827', cursor: 'pointer' }}
          >
            STACK
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
      {/* VUE 1 : PAGE D'ACCUEIL MARKETPLACE (DÉGRADÉ PREMIUM + CARTE FRANCE) */}
      {/* =================================================================== */}
      {modeVue === 'ACCUEIL' ? (
        <>
          {/* 1. HERO ÉDITORIAL SPLIT-SCREEN (GAUCHE : RECHERCHE | DROITE : ARCHITECTURE SALON) */}
          <section style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            borderBottom: '1px solid #1e293b',
            padding: isMobile ? '32px 16px 40px 16px' : '56px 32px 64px 32px'
          }}>
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr',
              gap: isMobile ? '32px' : '48px',
              alignItems: 'center'
            }}>
              {/* Colonne Gauche : Proposition de valeur & Recherche */}
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 12px', borderRadius: '999px',
                  backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                  fontSize: '11.5px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: '#e2e8f0', marginBottom: '20px'
                }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  <span>Réservation en ligne 24h/24 • Confirmation immédiate</span>
                </div>

                <h1 style={{
                  fontSize: isMobile ? '30px' : '46px',
                  fontWeight: '800',
                  lineHeight: 1.12,
                  letterSpacing: '-0.03em',
                  margin: '0 0 16px 0',
                  color: '#ffffff'
                }}>
                  Réservez votre prochain rendez-vous coiffure & barbier.
                </h1>

                <p style={{
                  fontSize: isMobile ? '14.5px' : '16px',
                  color: '#94a3b8',
                  lineHeight: 1.6,
                  margin: '0 0 28px 0',
                  maxWidth: '560px'
                }}>
                  Accédez aux agendas en temps réel des salons partenaires STACK, choisissez votre collaborateur et validez votre créneau en quelques secondes.
                </p>

                {/* Barre de recherche principale */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setModeVue('RESULTATS');
                    lancerRecherche(searchVille, searchQ, chipActif);
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    padding: isMobile ? '12px' : '8px 8px 8px 20px',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: 'stretch',
                    gap: isMobile ? '10px' : '0',
                    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.35)'
                  }}
                >
                  <div style={{
                    flex: 1.1, textAlign: 'left',
                    paddingRight: isMobile ? 0 : '14px',
                    borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
                    borderBottom: isMobile ? '1px solid #e5e7eb' : 'none',
                    paddingBottom: isMobile ? '10px' : 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <label style={{ fontSize: '10.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                      Prestation ou salon
                    </label>
                    <input
                      type="text"
                      placeholder="Coupe, balayage, barbe, nom du salon..."
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: '14.5px', fontWeight: '600', color: '#111827', width: '100%', padding: '3px 0' }}
                    />
                  </div>

                  <div style={{
                    flex: 0.9, textAlign: 'left',
                    paddingLeft: isMobile ? 0 : '16px',
                    paddingRight: isMobile ? 0 : '12px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <label style={{ fontSize: '10.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                      Ville ou code postal
                    </label>
                    <input
                      type="text"
                      placeholder="Paris, Lyon, Strasbourg..."
                      value={searchVille}
                      onChange={e => setSearchVille(e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: '14.5px', fontWeight: '600', color: '#111827', width: '100%', padding: '3px 0' }}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#111827',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: isMobile ? '14px' : '15px 26px',
                      fontSize: '14.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    Rechercher
                  </button>
                </form>

                {/* Filtres rapides sous la barre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '18px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', marginRight: '4px' }}>
                    Accès direct :
                  </span>
                  {[
                    { id: 'Coiffure femme', label: 'Coiffure Femme' },
                    { id: 'Coiffure homme', label: 'Coupe Homme' },
                    { id: 'Barbier', label: 'Barbier' },
                    { id: 'Coiffure jeunes', label: 'Coupe Étudiant / Enfant' }
                  ].map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => { setChipActif(tag.id); setModeVue('RESULTATS'); lancerRecherche(searchVille, searchQ, tag.id); }}
                      style={{
                        padding: '6px 13px',
                        borderRadius: '999px',
                        border: '1px solid rgba(255,255,255,0.18)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        color: '#f8fafc',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colonne Droite : Visuel Éditorial + Carte Flottante Temps Réel */}
              {!isMobile && (
                <div style={{ position: 'relative' }}>
                  <div style={{
                    height: '390px',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.45)'
                  }}>
                    <img
                      src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1000&q=80"
                      alt="Salon de coiffure partenaire STACK"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>

                  {/* Carte flottante d'aperçu */}
                  <div style={{
                    position: 'absolute',
                    bottom: '-18px',
                    left: '-24px',
                    backgroundColor: '#ffffff',
                    color: '#111827',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.22)',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      backgroundColor: '#111827', color: '#ffffff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#111827' }}>
                        Disponibilités synchronisées
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Rappel SMS & modification en 1 clic
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* CONTENU CENTRAL */}
          <section style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '36px 16px' : '56px 32px' }}>

            {/* 2. SECTION : SALONS AUTOUR DE VOUS + BARRE DE FILTRES DISPONIBILITÉ */}
            <div style={{ marginBottom: '64px' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    Réservation directe
                  </div>
                  <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
                    Salons autour de vous {searchVille ? `(${searchVille})` : ''}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition(async (pos) => {
                        try {
                          const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${pos.coords.longitude}&lat=${pos.coords.latitude}`);
                          const d = await r.json();
                          const city = d?.features?.[0]?.properties?.city;
                          if (city) {
                            setSearchVille(city);
                            lancerRecherche(city, searchQ, chipActif);
                          }
                        } catch (e) {}
                      });
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '9px 14px', borderRadius: '8px', border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff', color: '#111827', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
                    <span>Me localiser</span>
                  </button>

                  {salons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setModeVue('RESULTATS')}
                      style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: '700', color: '#111827', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Voir tout le catalogue ({salons.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Barre de filtres "Disponibilité immédiate" */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '22px' }}>
                {[
                  { id: 'TOUS', label: 'Tous les établissements' },
                  { id: 'AUJOURDHUI', label: 'Disponible aujourd’hui' },
                  { id: 'DEMAIN', label: 'Disponible demain' },
                  { id: 'NOTES', label: 'Les mieux notés' }
                ].map(f => {
                  const actif = filtreDispo === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltreDispo(f.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '999px',
                        border: actif ? '1.5px solid #111827' : '1px solid #e5e7eb',
                        backgroundColor: actif ? '#111827' : '#ffffff',
                        color: actif ? '#ffffff' : '#374151',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {loadingSalons ? (
                <div style={{ padding: '44px', textAlign: 'center', color: '#6b7280', fontSize: '14px', backgroundColor: '#f9fafb', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
                  Chargement des salons partenaires...
                </div>
              ) : salonsFiltresAccueil.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#4b5563', fontSize: '14px', backgroundColor: '#f9fafb', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
                  Aucun salon ne correspond à ce filtre immédiat.
                  <button
                    type="button"
                    onClick={() => { setFiltreDispo('TOUS'); setSearchVille(''); lancerRecherche('', searchQ, chipActif); }}
                    style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#111827', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))', gap: '22px' }}>
                  {salonsFiltresAccueil.slice(0, 4).map(s => (
                    <SalonMarketplaceCard
                      key={s.id_salon}
                      salon={s}
                      isMobile={isMobile}
                      favorisIds={favorisIds}
                      onToggleFavori={handleToggleFavori}
                      onSlotsLoaded={handleSlotsLoaded}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 3. OPTION B : EXPLORATEUR PAR GRANDES MÉTROPOLES (SANS CARTE ARTIFICIELLE NI ADRESSES BRUTES) */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              padding: isMobile ? '26px 18px' : '40px 44px',
              marginBottom: '56px'
            }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '12px', marginBottom: '28px' }}>
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    Réseau National STACK
                  </div>
                  <h3 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
                    Rechercher par grande ville
                  </h3>
                </div>
                <span style={{ fontSize: '13.5px', color: '#6b7280' }}>
                  Sélectionnez une métropole pour afficher ses établissements et créneaux disponibles.
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: '12px'
              }}>
                {grandesMetropoles.map(item => (
                  <button
                    key={item.ville}
                    type="button"
                    onClick={() => {
                      setSearchVille(item.ville);
                      setModeVue('RESULTATS');
                      lancerRecherche(item.ville, searchQ, chipActif);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '15px 18px',
                      borderRadius: '12px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      color: '#111827',
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14.5px', fontWeight: '700', color: '#111827' }}>
                        {item.ville}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#6b7280', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.count > 0 ? `${item.count} établissement${item.count > 1 ? 's' : ''}` : item.region}
                      </div>
                    </div>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. SECTION : POURQUOI RÉSERVER SUR STACK (3 CARTES MINIMALISTES) */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
              {[
                {
                  titre: 'Créneaux en temps réel',
                  texte: 'Les disponibilités affichées sont directement reliées au planning de caisse du salon, sans attente ni double réservation.',
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                },
                {
                  titre: 'Rappel SMS & Gestion en 1 clic',
                  texte: 'Recevez votre confirmation immédiatement et gérez ou déplacez vos rendez-vous depuis votre espace client.',
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                },
                {
                  titre: 'Programme de fidélité intégré',
                  texte: 'Cumulez automatiquement vos points ou tampons de fidélité dans votre salon habituel à chaque réservation.',
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                }
              ].map((card, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #e5e7eb',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    backgroundColor: '#f3f4f6', color: '#111827',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {card.icon}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827' }}>
                    {card.titre}
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#6b7280', lineHeight: 1.55 }}>
                    {card.texte}
                  </div>
                </div>
              ))}
            </div>

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
