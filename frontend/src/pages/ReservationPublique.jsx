// frontend/src/pages/ReservationPublique.jsx
// Borne de Réservation Publique en Ligne (Anti-Planity)

import { useState, useEffect } from 'react';
import { API_URL } from '../api/config';

export default function PageReservationPublique({ idSalon }) {
  const [infos, setInfos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prestaChoisie, setPrestaChoisie] = useState(null);
  const [employeChoisi, setEmployeChoisi] = useState('AUTO');
  const [dateChoisie, setDateChoisie] = useState(() => new Date().toISOString().slice(0, 10));
  const [creneaux, setCreneaux] = useState([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);
  const [creneauSelectionne, setCreneauSelectionne] = useState(null);
  const [clientNom, setClientNom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const [fideliteClient, setFideliteClient] = useState(null);
  const [confirmationOk, setConfirmationOk] = useState(() => new URLSearchParams(window.location.search).get('success') === '1');
  const [erreurMsg, setErreurMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/public/reservation/${idSalon}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setInfos(data);
          if (data.prestations?.length > 0) setPrestaChoisie(data.prestations[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idSalon]);

  useEffect(() => {
    if (!prestaChoisie || !dateChoisie) return;
    setLoadingCreneaux(true);
    setCreneauSelectionne(null);
    fetch(`${API_URL}/api/public/reservation/${idSalon}/creneaux?date=${dateChoisie}&id_employe=${employeChoisi}&duree=${prestaChoisie.duree_estimee_minutes || 30}`)
      .then(r => r.ok ? r.json() : { creneaux: [] })
      .then(data => {
        setCreneaux(data.creneaux || []);
        setLoadingCreneaux(false);
      })
      .catch(() => setLoadingCreneaux(false));
  }, [idSalon, prestaChoisie, employeChoisi, dateChoisie]);

  const verifierFideliteTel = (telVal) => {
    setClientTel(telVal);
    if (telVal.replace(/\s+/g, '').length >= 8) {
      fetch(`${API_URL}/api/public/reservation/${idSalon}/fidelite?telephone=${encodeURIComponent(telVal)}`)
        .then(r => r.ok ? r.json() : null)
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

  const validerReservation = async (avecAcompteStripe = false) => {
    if (!creneauSelectionne || !clientNom.trim() || !clientTel.trim()) {
      setErreurMsg("Veuillez choisir un créneau et renseigner votre nom et téléphone.");
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
        setErreurMsg(data.erreur || "Impossible de valider ce créneau.");
      } else if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      } else {
        setConfirmationOk(true);
      }
    } catch (e) {
      setErreurMsg("Erreur réseau.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f6f6f7', color: '#111827', fontWeight: '700' }}>Chargement de l'agenda du salon...</div>;
  }
  if (!infos?.salon) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f6f6f7', color: '#dc2626', fontWeight: '700' }}>Salon introuvable.</div>;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f6f7', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        {/* En-tête du Salon */}
        <div style={{ background: '#111827', color: '#ffffff', borderRadius: '22px', padding: '24px', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#ffffff', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '20px' }}>
              ✂️
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }}>{infos.salon.nom_salon}</h1>
              <p style={{ margin: '2px 0 0', fontSize: '13px', opacity: 0.8 }}>{infos.salon.adresse_salon || 'Réservation en ligne'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12.5px', opacity: 0.9, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
            <span>🕒 Ouvert de {infos.salon.heure_ouverture || 9}h à {infos.salon.heure_fermeture || 19}h</span>
            <span>📍 Confirmation instantanée par SMS</span>
          </div>
        </div>

        {confirmationOk ? (
          <div style={{ background: '#ffffff', borderRadius: '22px', padding: '36px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 16px' }}>
              ✓
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 8px' }}>Rendez-vous confirmé !</h2>
            <p style={{ color: '#4b5563', fontSize: '14.5px', margin: '0 0 20px', lineHeight: 1.5 }}>
              Merci {clientNom}, votre réservation a bien été enregistrée par le salon. Un SMS de rappel vous sera envoyé avant votre visite.
            </p>
            <button
              onClick={() => { setConfirmationOk(false); setCreneauSelectionne(null); }}
              style={{ background: '#111827', color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
            >
              Prendre un autre rendez-vous
            </button>
          </div>
        ) : (
          <div style={{ background: '#ffffff', borderRadius: '22px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. Choix de la Prestation */}
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>1. Prestation</label>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(infos.prestations || []).map(p => {
                  const selected = prestaChoisie?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setPrestaChoisie(p)}
                      style={{
                        padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                        border: selected ? '2px solid #111827' : '1px solid #e5e7eb',
                        background: selected ? '#f9fafb' : '#ffffff',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px' }}>{p.nom}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Durée estimée : {p.duree_estimee_minutes || 30} min</div>
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: '800' }}>{parseFloat(p.prix).toFixed(2)} €</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Choix du Collaborateur & de la Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>2. Collaborateur</label>
                <select value={employeChoisi} onChange={e => setEmployeChoisi(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: '11px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13.5px', fontWeight: '600' }}>
                  <option value="AUTO">Premier disponible</option>
                  {(infos.employes || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>3. Date souhaitée</label>
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={dateChoisie} onChange={e => setDateChoisie(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '11px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13.5px', fontWeight: '600' }} />
              </div>
            </div>

            {/* 3. Grille des Créneaux Disponibles */}
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>4. Créneaux disponibles</label>
              {loadingCreneaux ? (
                <div style={{ fontSize: '13px', color: '#6b7280', padding: '12px 0' }}>Recherche des disponibilités...</div>
              ) : creneaux.length === 0 ? (
                <div style={{ padding: '14px', borderRadius: '12px', background: '#f9fafb', color: '#6b7280', fontSize: '13px', textAlign: 'center' }}>Aucun créneau disponible à cette date. Essayez un autre jour.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: '8px' }}>
                  {creneaux.map(c => {
                    const selected = creneauSelectionne?.heure === c.heure;
                    return (
                      <button
                        key={c.heure}
                        type="button"
                        onClick={() => setCreneauSelectionne(c)}
                        style={{ padding: '10px 6px', borderRadius: '10px', border: selected ? '2px solid #111827' : '1px solid #e5e7eb', background: selected ? '#111827' : '#ffffff', color: selected ? '#ffffff' : '#111827', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
                      >
                        {c.heure}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Coordonnées & Reconnaissance Fidélité instantanée */}
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>5. Vos coordonnées (Cumul Fidélité)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input type="tel" placeholder="Téléphone mobile (ex: 06...)" value={clientTel} onChange={e => verifierFideliteTel(e.target.value)} style={{ padding: '11px 12px', borderRadius: '11px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13.5px' }} />
                <input type="text" placeholder="Votre Prénom & Nom" value={clientNom} onChange={e => setClientNom(e.target.value)} style={{ padding: '11px 12px', borderRadius: '11px', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13.5px' }} />
              </div>

              {fideliteClient && (
                <div style={{ padding: '10px 14px', borderRadius: '11px', background: '#dcfce7', color: '#166534', fontSize: '12.5px', fontWeight: '700', marginBottom: '10px' }}>
                  ✨ Bon retour {fideliteClient.prenom} ! Votre compte fidélité ({infos.salon.fidelite_type === 'TAMPONS' ? `${fideliteClient.tampons_fidelite} tampons` : `${fideliteClient.points_fidelite} points`}) est bien rattaché à cette réservation.
                  {fideliteClient.remise_winback ? ` Offre spéciale active : ${fideliteClient.remise_winback} !` : ''}
                </div>
              )}

              {erreurMsg && (
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', color: '#dc2626', fontSize: '12.5px', fontWeight: '700', marginBottom: '10px' }}>
                  {erreurMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={isSubmitting || !creneauSelectionne}
                  onClick={() => validerReservation(false)}
                  style={{ flex: 1, background: '#111827', color: '#ffffff', border: 'none', padding: '13px 16px', borderRadius: '12px', fontSize: '13.5px', fontWeight: '800', cursor: creneauSelectionne ? 'pointer' : 'not-allowed', opacity: creneauSelectionne ? 1 : 0.5 }}
                >
                  {isSubmitting ? 'Validation...' : 'Confirmer mon RDV (Paiement au salon)'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !creneauSelectionne}
                  onClick={() => validerReservation(true)}
                  style={{ flex: 1, background: '#f9fafb', color: '#111827', border: '1.5px solid #111827', padding: '13px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '800', cursor: creneauSelectionne ? 'pointer' : 'not-allowed', opacity: creneauSelectionne ? 1 : 0.5 }}
                >
                  Garantir avec Acompte CB (30%)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
