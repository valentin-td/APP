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

function SalonMarketplaceCard({ salon, isMobile, favorisIds, onToggleFavori, onSlotsLoaded, isHorizontal = false }) {
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
  const displaySlots = allSlots.slice(0, isHorizontal ? 4 : 2);
  const horizontalLayout = isHorizontal && !isMobile;

  return (
    <div
      onClick={() => allerSurSalon()}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        display: horizontalLayout ? 'grid' : 'flex',
        gridTemplateColumns: horizontalLayout ? '320px 1fr' : undefined,
        flexDirection: horizontalLayout ? undefined : 'column',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease'
      }}
    >
      {/* PHOTO DE COUVERTURE */}
      <div style={{ position: 'relative', height: horizontalLayout ? '100%' : '220px', minHeight: horizontalLayout ? '220px' : undefined, backgroundColor: '#111111', overflow: 'hidden' }}>
        <img
          src={photos[photoIdx % photos.length]}
          alt={salon.nom_salon}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: aVraiesPhotos ? 'none' : 'brightness(0.92)' }}
        />

        {/* On affiche la ville uniquement si c'est une vraie ville détectée (jamais "France") */}
        {villePropre && villePropre.toLowerCase() !== 'france' && (
          <div style={{
            position: 'absolute', bottom: '12px', left: '12px',
            padding: '4px 10px', borderRadius: '6px',
            backgroundColor: 'rgba(17, 17, 17, 0.78)', color: '#ffffff',
            fontSize: '11px', fontWeight: '600'
          }}>
            {villePropre}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavori(salon); }}
          style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(17, 17, 17, 0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? '#ffffff' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>

        {photos.length > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111111' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111111' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
          </>
        )}
      </div>

      {/* CONTENU DE LA CARTE */}
      <div style={{ padding: horizontalLayout ? '22px 26px' : '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: horizontalLayout ? '19px' : '16.5px', fontWeight: '700', color: '#111111', letterSpacing: '-0.01em' }}>
              {salon.nom_salon}
            </h3>
            {salon.note_moyenne && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '700', color: '#111111', flexShrink: 0 }}>
                <span>★ {salon.note_moyenne}</span>
                {salon.nb_avis > 0 && <span style={{ color: '#6b7280', fontWeight: '400' }}>({salon.nb_avis})</span>}
              </div>
            )}
          </div>

          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            {salon.adresse_salon} • <span style={{ color: '#111111', fontWeight: '600' }}>{salon.gamme_prix || '€€'}</span>
          </div>
        </div>

        {/* CRÉNEAUX SOBRES SANS MENTION VERTE CRIARDE */}
        <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #f3f4f6' }}>
          {loadingSlots ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', padding: '6px 0' }}>
              Recherche des disponibilités...
            </div>
          ) : displaySlots.length > 0 ? (
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: '500', color: '#6b7280', marginBottom: '8px' }}>
                Prochains créneaux disponibles
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: horizontalLayout ? 'repeat(4, 1fr)' : '1fr 1fr', gap: '8px' }}>
                {displaySlots.map((slot, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); allerSurSalon(`&date=${slot.date}&heure=${encodeURIComponent(slot.heure)}`); }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff',
                      color: '#111111',
                      fontSize: '12.5px',
                      fontWeight: '600',
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
            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151', padding: '8px 0' }}>
              Prochaine disponibilité le {apercuCreneaux.prochaine_disponibilite.date.split('-').reverse().slice(0, 2).join('/')} à {apercuCreneaux.prochaine_disponibilite.premier_creneau}
            </div>
          ) : (
            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#111111', padding: '6px 0', textDecoration: 'underline' }}>
              Voir les prestations et horaires
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

  const grandesMetropoles = useMemo(() => [
    { ville: 'Paris', dept: '75' },
    { ville: 'Lyon', dept: '69' },
    { ville: 'Marseille', dept: '13' },
    { ville: 'Bordeaux', dept: '33' },
    { ville: 'Strasbourg', dept: '67' },
    { ville: 'Toulouse', dept: '31' },
    { ville: 'Lille', dept: '59' },
    { ville: 'Nantes', dept: '44' },
    { ville: 'Nice', dept: '06' },
    { ville: 'Montpellier', dept: '34' },
    { ville: 'Rennes', dept: '35' },
    { ville: 'Besançon', dept: '25' }
  ], []);

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
      {/* VUE 1 : PAGE D'ACCUEIL MARKETPLACE (DÉGRADÉ PREMIUM + OPTION B)     */}
      {/* =================================================================== */}
      {modeVue === 'ACCUEIL' ? (
        <>
          {/* 1. HERO ÉDITORIAL CARbone (SANS BADGE POINT VERT NI CARTE FLOTTANTE IA) */}
          <section style={{
            backgroundColor: '#111111',
            color: '#ffffff',
            padding: isMobile ? '36px 16px 44px 16px' : '64px 32px 72px 32px'
          }}>
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
              gap: isMobile ? '32px' : '56px',
              alignItems: 'center'
            }}>
              {/* Colonne Gauche */}
              <div>
                <h1 style={{
                  fontSize: isMobile ? '30px' : '46px',
                  fontWeight: '700',
                  lineHeight: 1.12,
                  letterSpacing: '-0.03em',
                  margin: '0 0 16px 0',
                  color: '#ffffff'
                }}>
                  Réservez votre prochain rendez-vous coiffure & barbier.
                </h1>

                <p style={{
                  fontSize: isMobile ? '14.5px' : '16px',
                  color: '#a1a1aa',
                  lineHeight: 1.6,
                  margin: '0 0 32px 0',
                  maxWidth: '540px'
                }}>
                  Choisissez votre salon partenaire, sélectionnez votre prestation et réservez votre créneau en ligne avec confirmation immédiate.
                </p>

                {/* Barre de recherche élargie avec placeholders non tronqués */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setModeVue('RESULTATS');
                    lancerRecherche(searchVille, searchQ, chipActif);
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    padding: isMobile ? '12px' : '8px 8px 8px 20px',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: 'stretch',
                    gap: isMobile ? '10px' : '0'
                  }}
                >
                  <div style={{
                    flex: 1.15, textAlign: 'left',
                    paddingRight: isMobile ? 0 : '16px',
                    borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
                    borderBottom: isMobile ? '1px solid #e5e7eb' : 'none',
                    paddingBottom: isMobile ? '10px' : 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '2px' }}>
                      Que cherchez-vous ?
                    </label>
                    <input
                      type="text"
                      placeholder="Salon, prestation (coupe, barbe...)"
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: '14px', fontWeight: '500', color: '#111111', width: '100%', padding: '3px 0' }}
                    />
                  </div>

                  <div style={{
                    flex: 0.85, textAlign: 'left',
                    paddingLeft: isMobile ? 0 : '16px',
                    paddingRight: isMobile ? 0 : '12px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '2px' }}>
                      Où ?
                    </label>
                    <input
                      type="text"
                      placeholder="Ville, code postal..."
                      value={searchVille}
                      onChange={e => setSearchVille(e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: '14px', fontWeight: '500', color: '#111111', width: '100%', padding: '3px 0' }}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#111111',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: isMobile ? '14px' : '15px 28px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    Rechercher
                  </button>
                </form>

                {/* Liens de spécialités sobres */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '20px' }}>
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
                        padding: '7px 14px',
                        borderRadius: '6px',
                        border: '1px solid #27272a',
                        backgroundColor: '#18181b',
                        color: '#e4e4e7',
                        fontSize: '12.5px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colonne Droite : Photographie d'architecture sobre, sans badge flottant */}
              {!isMobile && (
                <div style={{
                  height: '380px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: '#18181b'
                }}>
                  <img
                    src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1000&q=85"
                    alt="Intérieur salon"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'contrast(1.04) brightness(0.92)' }}
                  />
                </div>
              )}
            </div>
          </section>

          {/* CONTENU PRINCIPAL */}
          <section style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '40px 16px' : '64px 32px' }}>

            {/* 2. SALONS AUTOUR DE VOUS */}
            <div style={{ marginBottom: '72px' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '16px', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', fontWeight: '700', color: '#111111', letterSpacing: '-0.02em' }}>
                  Salons autour de vous {searchVille ? `— ${searchVille}` : ''}
                </h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
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
                      padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff', color: '#111111', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>Me localiser</span>
                  </button>

                  {salons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setModeVue('RESULTATS')}
                      style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: '600', color: '#111111', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Tout afficher ({salons.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Filtres de disponibilité */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px' }}>
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
                        borderRadius: '6px',
                        border: actif ? '1px solid #111111' : '1px solid #e5e7eb',
                        backgroundColor: actif ? '#111111' : '#ffffff',
                        color: actif ? '#ffffff' : '#4b5563',
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
                <div style={{ padding: '44px', textAlign: 'center', color: '#6b7280', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                  Chargement des établissements...
                </div>
              ) : salonsFiltresAccueil.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#4b5563', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                  Aucun établissement ne correspond à ce filtre.
                  <button
                    type="button"
                    onClick={() => { setFiltreDispo('TOUS'); setSearchVille(''); lancerRecherche('', searchQ, chipActif); }}
                    style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#111111', fontWeight: '600', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Réinitialiser
                  </button>
                </div>
              ) : (
                /* Si 1 ou 2 salons seulement, affichage horizontal large pour ne pas laisser de vide */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : salonsFiltresAccueil.length === 1
                      ? '1fr'
                      : salonsFiltresAccueil.length === 2
                        ? 'repeat(2, 1fr)'
                        : 'repeat(auto-fill, minmax(270px, 1fr))',
                  gap: '22px'
                }}>
                  {salonsFiltresAccueil.slice(0, 4).map(s => (
                    <SalonMarketplaceCard
                      key={s.id_salon}
                      salon={s}
                      isMobile={isMobile}
                      favorisIds={favorisIds}
                      onToggleFavori={handleToggleFavori}
                      onSlotsLoaded={handleSlotsLoaded}
                      isHorizontal={salonsFiltresAccueil.length <= 2}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 3. RECHERCHER PAR VILLE (SANS GROSSE BOÎTE GRISE NI FAUX COMPTEURS) */}
            <div style={{ paddingTop: '48px', borderTop: '1px solid #e5e7eb', marginBottom: '72px' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'baseline', gap: '8px', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '24px', fontWeight: '700', color: '#111111', letterSpacing: '-0.02em' }}>
                  Rechercher par ville
                </h2>
                <span style={{ fontSize: '13.5px', color: '#6b7280' }}>
                  Accédez directement aux établissements disponibles par secteur
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
                      padding: '14px 18px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      color: '#111111',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: '600', color: '#111111' }}>
                        {item.ville}
                      </span>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        ({item.dept})
                      </span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. BANDEAU ÉDITORIAL EN 3 COLONNES (SANS BOÎTES NI ICÔNES ENFERMÉES) */}
            <div style={{
              paddingTop: '44px',
              borderTop: '1px solid #e5e7eb',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: isMobile ? '28px' : '40px'
            }}>
              {[
                {
                  num: '01',
                  titre: 'Disponibilités en temps réel',
                  texte: 'Les créneaux affichés correspondent directement à l’agenda du salon, sans attente de validation.'
                },
                {
                  num: '02',
                  titre: 'Confirmation & Rappel SMS',
                  texte: 'Recevez immédiatement votre récapitulatif et gérez ou déplacez votre rendez-vous depuis votre compte.'
                },
                {
                  num: '03',
                  titre: 'Fidélité automatisée',
                  texte: 'Vos avantages, points ou tampons de fidélité sont crédités automatiquement à chaque passage.'
                }
              ].map((item) => (
                <div key={item.num}>
                  <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#9ca3af', marginBottom: '8px', letterSpacing: '0.08em' }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: '15.5px', fontWeight: '700', color: '#111111', marginBottom: '6px' }}>
                    {item.titre}
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#6b7280', lineHeight: 1.6 }}>
                    {item.texte}
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
