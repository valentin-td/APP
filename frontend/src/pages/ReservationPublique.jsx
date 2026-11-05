// frontend/src/pages/ReservationPublique.jsx
// Borne & Tunnel de Réservation Publique en Ligne (Anti-Planity)

import { useState, useEffect } from 'react';
import { API_URL } from '../api/config';

export default function PageReservationPublique({ idSalon }) {
  const [infos, setInfos] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // États du tunnel de réservation
  const [etapeActive, setEtapeActive] = useState(1);
  const [prestaChoisie, setPrestaChoisie] = useState(null);
  const [employeChoisi, setEmployeChoisi] = useState(null);
  const [dateChoisie, setDateChoisie] = useState(() => new Date().toISOString().slice(0, 10));
  const [creneaux, setCreneaux] = useState([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);
  const [creneauSelectionne, setCreneauSelectionne] = useState(null);
  
  // États client
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
        if (data) setInfos(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idSalon]);

  // Charge les créneaux dès qu'on arrive à l'étape 3
  useEffect(() => {
    if (etapeActive === 3 && prestaChoisie && dateChoisie) {
      setLoadingCreneaux(true);
      setCreneauSelectionne(null);
      const empId = employeChoisi === 'AUTO' ? '' : (employeChoisi || '');
      fetch(`${API_URL}/api/public/reservation/${idSalon}/creneaux?date=${dateChoisie}&id_employe=${empId}&duree=${prestaChoisie.duree_estimee_minutes || 30}`)
        .then(r => r.ok ? r.json() : { creneaux: [] })
        .then(data => {
          setCreneaux(data.creneaux || []);
          setLoadingCreneaux(false);
        })
        .catch(() => setLoadingCreneaux(false));
    }
  }, [etapeActive, idSalon, prestaChoisie, employeChoisi, dateChoisie]);

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
      setErreurMsg("Veuillez renseigner votre nom et téléphone.");
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

  const genererJoursSemaine = () => {
    const jours = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      jours.push({
        date: d.toISOString().slice(0, 10),
        jourFmt: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        numFmt: d.getDate()
      });
    }
    return jours;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif', background: '#f9fafb', color: '#111827', fontWeight: '600' }}>
        Chargement du salon...
      </div>
    );
  }
  if (!infos?.salon) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif', background: '#f9fafb', color: '#dc2626', fontWeight: '600' }}>
        Salon introuvable.
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '100px' }}>
      
      {/* En-tête du Salon (Style Cover) */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '24px 16px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }}>{infos.salon.nom_salon}</h1>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>{infos.salon.adresse || infos.salon.adresse_salon}</div>
      </div>

      <div style={{ maxWidth: '640px', margin: '24px auto', padding: '0 16px' }}>
        
        {confirmationOk ? (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px 24px', textAlign: 'center', border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#111827', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', fontSize: '28px' }}>✓</div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '800' }}>Rendez-vous confirmé</h2>
            <p style={{ color: '#4b5563', fontSize: '14px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              Votre réservation a bien été enregistrée. Vous recevrez un SMS de rappel avant votre rendez-vous.
            </p>
            <button type="button" onClick={() => { setConfirmationOk(false); setEtapeActive(1); setPrestaChoisie(null); }} style={{ backgroundColor: '#f3f4f6', color: '#111827', border: 'none', padding: '12px 24px', borderRadius: '999px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Nouvelle réservation
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            
            {/* ÉTAPE 1 : CHOIX DE LA PRESTATION */}
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <button onClick={() => setEtapeActive(1)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: etapeActive >= 1 ? '#111827' : '#f3f4f6', color: etapeActive >= 1 ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>1</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: etapeActive >= 1 ? '#111827' : '#9ca3af' }}>Prestation</span>
                </div>
                {prestaChoisie && etapeActive !== 1 && (
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Modifier</span>
                )}
              </button>

              {etapeActive === 1 && (
                <div style={{ padding: '0 20px 20px 20px' }}>
                  {infos.prestations?.map(p => (
                    <div 
                      key={p.id_article || p.id} 
                      onClick={() => { setPrestaChoisie(p); setEtapeActive(2); }}
                      style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        padding: '16px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' 
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14.5px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>{p.nom}</div>
                        <div style={{ fontSize: '12.5px', color: '#6b7280' }}>{p.duree_estimee_minutes} min</div>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{parseFloat(p.prix).toFixed(2)} €</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ÉTAPE 2 : CHOIX DU COLLABORATEUR */}
            <div style={{ borderBottom: '1px solid #f3f4f6', opacity: etapeActive >= 2 ? 1 : 0.4 }}>
              <button disabled={etapeActive < 2} onClick={() => setEtapeActive(2)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'none', border: 'none', cursor: etapeActive >= 2 ? 'pointer' : 'default', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: etapeActive >= 2 ? '#111827' : '#f3f4f6', color: etapeActive >= 2 ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>2</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: etapeActive >= 2 ? '#111827' : '#9ca3af' }}>Collaborateur</span>
                </div>
                {employeChoisi && etapeActive !== 2 && (
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Modifier</span>
                )}
              </button>

              {etapeActive === 2 && (
                <div style={{ padding: '0 20px 20px 20px', display: 'flex', gap: '12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '10px' }}>
                  <div 
                    onClick={() => { setEmployeChoisi('AUTO'); setEtapeActive(3); }}
                    style={{ flexShrink: 0, width: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>⚡️</div>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'center' }}>Peu importe</span>
                  </div>

                  {infos.employes?.map(emp => (
                    <div 
                      key={emp.id_employe} 
                      onClick={() => { setEmployeChoisi(emp.id_employe); setEtapeActive(3); }}
                      style={{ flexShrink: 0, width: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#111827', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', overflow: 'hidden' }}>
                        {emp.photo_url ? <img src={emp.photo_url} alt={emp.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : emp.nom.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {emp.nom.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ÉTAPE 3 : DATE ET HEURE */}
            <div style={{ borderBottom: '1px solid #f3f4f6', opacity: etapeActive >= 3 ? 1 : 0.4 }}>
              <button disabled={etapeActive < 3} onClick={() => setEtapeActive(3)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'none', border: 'none', cursor: etapeActive >= 3 ? 'pointer' : 'default', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: etapeActive >= 3 ? '#111827' : '#f3f4f6', color: etapeActive >= 3 ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>3</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: etapeActive >= 3 ? '#111827' : '#9ca3af' }}>Date & Heure</span>
                </div>
                {creneauSelectionne && etapeActive !== 3 && (
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Modifier</span>
                )}
              </button>

              {etapeActive === 3 && (
                <div style={{ padding: '0 20px 20px 20px' }}>
                  {/* Sélecteur de date horizontal */}
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '12px', marginBottom: '16px', borderBottom: '1px solid #f3f4f6' }}>
                    {genererJoursSemaine().map(jour => {
                      const isSelected = dateChoisie === jour.date;
                      return (
                        <button
                          key={jour.date}
                          onClick={() => setDateChoisie(jour.date)}
                          style={{
                            flexShrink: 0, width: '56px', height: '64px', borderRadius: '12px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            backgroundColor: isSelected ? '#111827' : '#ffffff',
                            color: isSelected ? '#ffffff' : '#111827',
                            border: isSelected ? 'none' : '1px solid #e5e7eb',
                            cursor: 'pointer', fontWeight: '600'
                          }}
                        >
                          <span style={{ fontSize: '11px', textTransform: 'capitalize', opacity: isSelected ? 0.9 : 0.6 }}>{jour.jourFmt}</span>
                          <span style={{ fontSize: '16px', fontWeight: '800' }}>{jour.numFmt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Grille des créneaux */}
                  {loadingCreneaux ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280', fontSize: '14px' }}>Recherche des disponibilités...</div>
                  ) : creneaux.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280', fontSize: '14px', backgroundColor: '#f9fafb', borderRadius: '12px' }}>Aucun créneau disponible ce jour.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '10px' }}>
                      {creneaux.map(c => (
                        <button
                          key={c.heure}
                          onClick={() => { setCreneauSelectionne(c); setEtapeActive(4); }}
                          style={{
                            padding: '12px 0', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
                            backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', cursor: 'pointer'
                          }}
                        >
                          {c.heure}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ÉTAPE 4 : COORDONNÉES ET VALIDATION */}
            <div style={{ opacity: etapeActive >= 4 ? 1 : 0.4 }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '20px' }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: etapeActive >= 4 ? '#111827' : '#f3f4f6', color: etapeActive >= 4 ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>4</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: etapeActive >= 4 ? '#111827' : '#9ca3af' }}>Vos coordonnées</span>
              </div>

              {etapeActive === 4 && (
                <div style={{ padding: '0 20px 20px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <input 
                      type="tel" 
                      placeholder="Numéro de téléphone mobile" 
                      value={clientTel} 
                      onChange={e => verifierFideliteTel(e.target.value)} 
                      style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '15px', outline: 'none' }} 
                    />
                    <input 
                      type="text" 
                      placeholder="Prénom & Nom" 
                      value={clientNom} 
                      onChange={e => setClientNom(e.target.value)} 
                      style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '15px', outline: 'none' }} 
                    />
                  </div>

                  {fideliteClient && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '13px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ fontSize: '16px' }}>✨</span>
                      <div>
                        Ravi de vous revoir {fideliteClient.prenom} ! Vos {infos.salon.fidelite_type === 'TAMPONS' ? `${fideliteClient.tampons_fidelite} tampons` : `${fideliteClient.points_fidelite} points`} de fidélité ont bien été identifiés.
                        {fideliteClient.remise_winback ? <div style={{ marginTop: '4px', fontWeight: '800' }}>🎁 Offre active : {fideliteClient.remise_winback}</div> : ''}
                      </div>
                    </div>
                  )}

                  {erreurMsg && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13.5px', fontWeight: '600', marginBottom: '16px' }}>
                      {erreurMsg}
                    </div>
                  )}

                  <button
                    disabled={isSubmitting}
                    onClick={() => validerReservation(false)}
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: '#111827', color: '#ffffff', fontSize: '15px', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{isSubmitting ? 'Validation...' : 'Confirmer le rendez-vous'}</span>
                    <span>{parseFloat(prestaChoisie?.prix).toFixed(2)} €</span>
                  </button>
                  
                  <button
                    disabled={isSubmitting}
                    onClick={() => validerReservation(true)}
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', backgroundColor: 'transparent', color: '#111827', fontSize: '13px', fontWeight: '700', border: 'none', cursor: 'pointer', marginTop: '8px', textDecoration: 'underline' }}
                  >
                    Ou garantir avec un acompte CB (30%)
                  </button>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Récapitulatif Sticky en bas (façon Planity) */}
      {!confirmationOk && prestaChoisie && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTop: '1px solid #e5e7eb', padding: '16px 24px', boxShadow: '0 -4px 20px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Total</span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#111827' }}>{parseFloat(prestaChoisie.prix).toFixed(2)} €</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            {creneauSelectionne ? (
              <>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{creneauSelectionne.heure}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>le {new Date(creneauSelectionne.date_heure_debut).toLocaleDateString('fr-FR')}</div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>Sélectionnez un horaire</div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
