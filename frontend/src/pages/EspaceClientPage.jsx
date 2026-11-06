// frontend/src/pages/EspaceClientPage.jsx
// Espace Client Dédié Plein Écran (/mon-compte) — Design Planity Executive

import { useState, useEffect } from 'react';
import { API_URL } from '../api/config';
import { isTokenExpired } from '../utils/auth';

export default function EspaceClientPage() {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [tokenClient, setTokenClient] = useState(() => {
    const stored = localStorage.getItem('token_client') || '';
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem('token_client');
      return '';
    }
    return stored;
  });

  const [ongletActif, setOngletActif] = useState('rdvs'); // 'rdvs' | 'infos' | 'favoris' | 'proches'
  const [loading, setLoading] = useState(Boolean(tokenClient));
  const [client, setClient] = useState(null);
  const [rdvsAVenir, setRdvsAVenir] = useState([]);
  const [rdvsPasses, setRdvsPasses] = useState([]);
  const [notice, setNotice] = useState(null);

  // États Authentification (si non connecté)
  const [modeAuth, setModeAuth] = useState('LOGIN'); // 'LOGIN' | 'REGISTER'
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // États Favoris & Proches (stockés localement et synchronisés)
  const [favoris, setFavoris] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stack_favoris_salons') || '[]'); } catch (e) { return []; }
  });
  const [proches, setProches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stack_proches_client') || '[]'); } catch (e) { return []; }
  });
  const [nouveauProche, setNouveauProche] = useState({ prenom: '', nom: '', lien: 'Famille' });

  const isMobile = windowWidth < 900;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const chargerDonneesClient = (tok = tokenClient) => {
    if (!tok) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/api/public/client/rdvs-tous-salons`, {
      headers: { Authorization: `Bearer ${tok}` }
    })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('token_client');
          setTokenClient('');
          setClient(null);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data?.client) {
          setClient(data.client);
          setPrenom(data.client.prenom || '');
          setNom(data.client.nom || '');
          setTelephone(data.client.telephone || '');
          setEmail(data.client.email || '');
          setRdvsAVenir(data.rdvs_a_venir || []);
          setRdvsPasses(data.rdvs_passes || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    chargerDonneesClient(tokenClient);
  }, [tokenClient]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim(), mot_de_passe: motDePasse })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || 'Identifiant ou mot de passe incorrect.');
      localStorage.setItem('token_client', data.token);
      setTokenClient(data.token);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: prenom.trim(),
          nom: nom.trim(),
          telephone: telephone.trim(),
          email: email.trim(),
          mot_de_passe: motDePasse
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || 'Impossible de créer le compte.');
      localStorage.setItem('token_client', data.token);
      setTokenClient(data.token);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveInfos = async (e) => {
    e.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/client/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenClient}` },
        body: JSON.stringify({ prenom, nom, telephone, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || 'Erreur lors de la sauvegarde.');
      setClient(data.client);
      setNotice({ type: 'success', text: 'Vos informations ont été mises à jour.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnnulerRdv = async (rdv) => {
    if (!window.confirm(`Confirmez-vous l'annulation de votre rendez-vous chez ${rdv.nom_salon} ?`)) return;
    setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/public/client/annuler-rdv/${rdv.id_rdv}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenClient}` },
        body: JSON.stringify({ id_salon: rdv.id_salon })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || 'Erreur lors de l’annulation.');
      setNotice({ type: 'success', text: data.message });
      chargerDonneesClient();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleReprendreRdv = (rdv) => {
    const premierePresta = String(rdv.prestation || '').split(' + ')[0].trim();
    window.location.href = `/?reservation=${rdv.id_salon}&prestation=${encodeURIComponent(premierePresta)}`;
  };

  const handleDeconnexion = () => {
    localStorage.removeItem('token_client');
    setTokenClient('');
    setClient(null);
    window.location.href = '/coiffeurs';
  };

  const formaterDateRdv = (isoStr) => {
    const d = new Date(String(isoStr).replace('Z', ''));
    const jourDate = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${jourDate.charAt(0).toUpperCase() + jourDate.slice(1)} ${heure}`;
  };

  const renderRdvCard = (rdv, estAVenir = false) => (
    <div
      key={rdv.id_rdv}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: isMobile ? '18px' : '24px',
        marginBottom: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>
          {formaterDateRdv(rdv.date_heure_debut)}
        </div>
        {rdv.statut === 'ANNULE' && (
          <span style={{ fontSize: '11.5px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626' }}>
            Annulé
          </span>
        )}
      </div>

      {/* Miniature carrée + Nom et adresse du salon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingBottom: '18px', borderBottom: '1px solid #f3f4f6' }}>
        <div
          onClick={() => { window.location.href = `/?reservation=${rdv.id_salon}`; }}
          style={{ width: '56px', height: '56px', borderRadius: '8px', backgroundColor: '#111827', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: '800', fontSize: '15px' }}
        >
          {rdv.photo_salon ? (
            <img src={rdv.photo_salon} alt={rdv.nom_salon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            String(rdv.nom_salon || 'S').slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <div
            onClick={() => { window.location.href = `/?reservation=${rdv.id_salon}`; }}
            style={{ fontSize: '15px', fontWeight: '700', color: '#111827', cursor: 'pointer', marginBottom: '4px' }}
          >
            {rdv.nom_salon}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: '#6b7280' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>{rdv.adresse_salon || 'Voir la fiche du salon'}</span>
          </div>
        </div>
      </div>

      {/* Détails de la prestation + Bouton noir "Reprendre RDV" */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '16px', paddingTop: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '13.5px', color: '#4b5563' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#111827', fontWeight: '600' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 12 12 22 2 12 12 2"/></svg>
            <span>{rdv.prestation}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>{rdv.duree_minutes}min</span>
          </div>
          {rdv.prix_total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span>{rdv.prix_total.toFixed(0)} €</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>avec {rdv.employe_nom}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
          {estAVenir && rdv.statut !== 'ANNULE' && (
            <button
              type="button"
              onClick={() => handleAnnulerRdv(rdv)}
              style={{
                backgroundColor: '#ffffff',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                flex: isMobile ? 1 : 'initial'
              }}
            >
              Annuler le RDV
            </button>
          )}
          <button
            type="button"
            onClick={() => handleReprendreRdv(rdv)}
            style={{
              backgroundColor: '#1f2328',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '11px 20px',
              fontSize: '13.5px',
              fontWeight: '600',
              cursor: 'pointer',
              flex: isMobile ? 1 : 'initial'
            }}
          >
            Reprendre RDV
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f8', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* HEADER EXECUTIVE STACK */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            onClick={() => { window.location.href = '/coiffeurs'; }}
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
              onClick={() => { window.location.href = '/coiffeurs'; }}
              style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }}
            >
              Explorer les salons
            </button>
          </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '24px 16px' : '44px 28px' }}>
        {loading ? (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '48px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280', fontWeight: '600' }}>
            Chargement de votre espace client...
          </div>
        ) : !tokenClient || !client ? (
          /* FORMULAIRE DE CONNEXION / INSCRIPTION PLEIN ÉCRAN */
          <div style={{ maxWidth: '460px', margin: '20px auto', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: isMobile ? '24px 20px' : '36px 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '800', color: '#111827', textAlign: 'center' }}>
              {modeAuth === 'LOGIN' ? 'Vous avez déjà un compte ?' : 'Créer mon compte STACK'}
            </h1>
            <p style={{ margin: '0 0 24px 0', fontSize: '13.5px', color: '#6b7280', textAlign: 'center' }}>
              Retrouvez tous vos rendez-vous, vos salons favoris et vos avantages fidélité.
            </p>

            {authError && (
              <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>
                {authError}
              </div>
            )}

            {modeAuth === 'LOGIN' ? (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Email ou Téléphone mobile *</label>
                  <input
                    type="text"
                    required
                    value={identifiant}
                    onChange={e => setIdentifiant(e.target.value)}
                    placeholder="Ex: 06 12 34 56 78 ou email"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Mot de passe *</label>
                  <input
                    type="password"
                    required
                    value={motDePasse}
                    onChange={e => setMotDePasse(e.target.value)}
                    placeholder="Votre mot de passe"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: '100%', padding: '14px', borderRadius: '8px', backgroundColor: '#1f2328', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '6px' }}
                >
                  {submitting ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input type="text" required placeholder="Prénom *" value={prenom} onChange={e => setPrenom(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                  <input type="text" required placeholder="Nom *" value={nom} onChange={e => setNom(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <input type="tel" required placeholder="Téléphone mobile *" value={telephone} onChange={e => setTelephone(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                <input type="email" required placeholder="Adresse email *" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                <input type="password" required placeholder="Choisissez un mot de passe *" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: '100%', padding: '14px', borderRadius: '8px', backgroundColor: '#1f2328', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '6px' }}
                >
                  {submitting ? 'Création...' : 'Créer mon compte'}
                </button>
              </form>
            )}

            <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', color: '#9ca3af', fontSize: '12.5px' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
              <span style={{ padding: '0 12px' }}>ou</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
            </div>

            <button
              type="button"
              onClick={() => { setModeAuth(modeAuth === 'LOGIN' ? 'REGISTER' : 'LOGIN'); setAuthError(''); }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#ffffff', color: '#111827', border: '1.5px solid #111827', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }}
            >
              {modeAuth === 'LOGIN' ? 'Nouveau sur STACK ? Créer mon compte' : 'J’ai déjà un compte — Me connecter'}
            </button>
          </div>
        ) : (
          /* LAYOUT 2 COLONNES PLANITY (/MON-COMPTE) */
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '32px', alignItems: 'start' }}>

            {/* SIDEBAR GAUCHE */}
            <aside style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '28px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h1 style={{ margin: '0 0 22px 0', fontSize: '22px', fontWeight: '700', color: '#111827' }}>
                Mon compte
              </h1>

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
                {[
                  { id: 'rdvs', label: 'Mes rendez-vous' },
                  { id: 'infos', label: 'Mes informations' },
                  { id: 'favoris', label: 'Mes favoris' },
                  { id: 'proches', label: 'Mes proches' }
                ].map(item => {
                  const actif = ongletActif === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setOngletActif(item.id); setNotice(null); }}
                      style={{
                        background: 'none', border: 'none', padding: '4px 0', textAlign: 'left',
                        fontSize: '14.5px', fontWeight: actif ? '700' : '400',
                        color: actif ? '#111827' : '#4b5563',
                        textDecoration: actif ? 'underline' : 'none',
                        textUnderlineOffset: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div style={{ paddingTop: '18px', borderTop: '1px solid #f3f4f6' }}>
                <button
                  type="button"
                  onClick={handleDeconnexion}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#dc2626', fontSize: '13.5px', fontWeight: '500', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Se déconnecter
                </button>
              </div>
            </aside>

            {/* ZONE DE CONTENU DROITE */}
            <section>
              {notice && (
                <div style={{
                  padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontSize: '13.5px', fontWeight: '600',
                  backgroundColor: notice.type === 'error' ? '#fef2f2' : '#ecfdf5',
                  color: notice.type === 'error' ? '#dc2626' : '#065f46',
                  border: `1px solid ${notice.type === 'error' ? '#fecaca' : '#a7f3d0'}`
                }}>
                  {notice.text}
                </div>
              )}

              {ongletActif === 'rdvs' && (
                <div>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                    Mes RDV à venir
                  </h2>
                  {rdvsAVenir.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Vous n'avez pas encore de RDV à venir</span>
                      <button
                        type="button"
                        onClick={() => { window.location.href = '/coiffeurs'; }}
                        style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Prendre RDV
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '36px' }}>
                      {rdvsAVenir.map(rdv => renderRdvCard(rdv, true))}
                    </div>
                  )}

                  <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                    Mes RDV passés
                  </h2>
                  {rdvsPasses.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', fontSize: '14px', color: '#6b7280' }}>
                      Aucun historique de rendez-vous passé.
                    </div>
                  ) : (
                    <div>
                      {rdvsPasses.map(rdv => renderRdvCard(rdv, false))}
                    </div>
                  )}
                </div>
              )}

              {ongletActif === 'infos' && (
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: isMobile ? '20px' : '28px' }}>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: '700', color: '#111827' }}>
                    Mes informations personnelles
                  </h2>
                  <form onSubmit={handleSaveInfos} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '520px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#4b5563', marginBottom: '6px' }}>Prénom</label>
                        <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#4b5563', marginBottom: '6px' }}>Nom</label>
                        <input type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#4b5563', marginBottom: '6px' }}>Téléphone portable</label>
                      <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#4b5563', marginBottom: '6px' }}>Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ alignSelf: 'flex-start', backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      {submitting ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </form>
                </div>
              )}

              {ongletActif === 'favoris' && (
                <div>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                    Mes favoris
                  </h2>
                  {favoris.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '28px', fontSize: '14px', color: '#6b7280' }}>
                      Vous n'avez pas encore ajouté de salon à vos favoris.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {favoris.map(fav => (
                        <div key={fav.id_salon} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                          <div>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{fav.nom_salon}</div>
                            <div style={{ fontSize: '13px', color: '#6b7280' }}>{fav.adresse_salon}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const next = favoris.filter(f => f.id_salon !== fav.id_salon);
                                setFavoris(next);
                                localStorage.setItem('stack_favoris_salons', JSON.stringify(next));
                              }}
                              style={{ backgroundColor: '#ffffff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '9px 14px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Retirer
                            </button>
                            <button
                              type="button"
                              onClick={() => { window.location.href = `/?reservation=${fav.id_salon}`; }}
                              style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Prendre RDV
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {ongletActif === 'proches' && (
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: isMobile ? '20px' : '28px' }}>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '19px', fontWeight: '700', color: '#111827' }}>
                    Mes proches
                  </h2>
                  <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: '#6b7280' }}>
                    Ajoutez un proche pour réserver plus rapidement un rendez-vous pour lui.
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!nouveauProche.prenom.trim()) return;
                      const next = [...proches, { id: Date.now(), ...nouveauProche }];
                      setProches(next);
                      localStorage.setItem('stack_proches_client', JSON.stringify(next));
                      setNouveauProche({ prenom: '', nom: '', lien: 'Famille' });
                    }}
                    style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '10px', marginBottom: '22px' }}
                  >
                    <input type="text" required placeholder="Prénom du proche" value={nouveauProche.prenom} onChange={e => setNouveauProche({ ...nouveauProche, prenom: e.target.value })} style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13.5px' }} />
                    <input type="text" placeholder="Nom" value={nouveauProche.nom} onChange={e => setNouveauProche({ ...nouveauProche, nom: e.target.value })} style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13.5px' }} />
                    <button type="submit" style={{ backgroundColor: '#1f2328', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>
                      Ajouter
                    </button>
                  </form>

                  {proches.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {proches.map(pr => (
                        <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '10px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{pr.prenom} {pr.nom}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = proches.filter(item => item.id !== pr.id);
                              setProches(next);
                              localStorage.setItem('stack_proches_client', JSON.stringify(next));
                            }}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
