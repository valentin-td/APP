import React from 'react';

export default function ClotureZDialog({
  zDialogOuvert,
  setZDialogOuvert,
  isMobile,
  role,
  zEmployeSelect,
  setZEmployeSelect,
  zCodePin,
  setZCodePin,
  erreurPinAction,
  setErreurPinAction,
  employesListe,
  configSalon,
  getStatutBlocagePin,
  fondCaisseMatin,
  setFondCaisseMatin,
  compteCaisse,
  setCompteCaisse,
  calculerTotalCaisseReel,
  ecartDetecte,
  justificationEcart,
  setJustificationEcart,
  executerZDeCaisse
}) {
  if (!zDialogOuvert) return null;

  const handleClose = () => {
    setZDialogOuvert(false);
    setZEmployeSelect('');
    setZCodePin('');
  };

  const statutPinZ = (role === 'salon' && getStatutBlocagePin) 
    ? getStatutBlocagePin(zEmployeSelect) 
    : { bloque: false, tentatives: 0, essaisRestants: 3 };

  return (
    <div className="modal-overlay" style={{ zIndex: 100000, padding: isMobile ? '0' : '16px' }}>
      <div className="modal-content" style={{ maxWidth: '600px', width: '100%', padding: '0', overflow: 'hidden', height: isMobile ? '100%' : 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-app)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ color: 'var(--btn-primary)' }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '18px' }}>Clôture de Caisse (Z)</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Comptage physique obligatoire (Loi NF525)</span>
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {role === 'salon' && (
            <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '12px', border: `1px solid ${(statutPinZ.bloque || erreurPinAction) ? 'var(--color-danger)' : 'var(--border-color)'}`, marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ flex: '1 1 210px', minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Responsable de la fermeture</label>
                  <select className="input-fournisseur" value={zEmployeSelect} onChange={e => { setZEmployeSelect(e.target.value); setZCodePin(''); setErreurPinAction(null); }} style={{ margin: 0, width: '100%', boxSizing: 'border-box', minHeight: '44px' }}>
                    <option value="">-- Sélectionnez votre nom --</option>
                    {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.nom}>{emp.nom}</option>)}
                  </select>
                </div>
                {configSalon?.securite_pin_salon_active !== false && (
                  <div style={{ flex: '1 1 210px', minWidth: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        Code PIN personnel
                      </span>
                      {statutPinZ.tentatives > 0 && !statutPinZ.bloque && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706', textTransform: 'none' }}>
                          {statutPinZ.essaisRestants} essai{statutPinZ.essaisRestants > 1 ? 's' : ''} restant{statutPinZ.essaisRestants > 1 ? 's' : ''}
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength="10"
                      disabled={statutPinZ.bloque}
                      className="input-fournisseur"
                      placeholder={statutPinZ.bloque ? "Accès verrouillé" : "Votre code PIN"}
                      value={zCodePin}
                      onChange={e => { setZCodePin(e.target.value.replace(/\D/g, '')); setErreurPinAction(null); }}
                      style={{ margin: 0, width: '100%', boxSizing: 'border-box', minHeight: '44px', fontSize: 'clamp(14px, 2.5vw, 16px)', letterSpacing: zCodePin ? '0.2em' : 'normal', textAlign: 'center', fontWeight: '600', opacity: statutPinZ.bloque ? 0.5 : 1 }}
                    />
                  </div>
                )}
              </div>
              {(statutPinZ.bloque || erreurPinAction) && (
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{statutPinZ.bloque ? statutPinZ.message : erreurPinAction}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '12px', border: '1px dashed var(--border-color)', marginBottom: '24px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>
              <span>Fond de caisse du matin (Ouverture)</span>
            </label>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>Montant en espèces (fonds de roulement) présent à l'ouverture.</p>
            <div style={{ position: 'relative' }}>
              <input type="number" placeholder="Ex: 150.00" value={fondCaisseMatin} onChange={(e) => setFondCaisseMatin(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 40px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '16px', fontWeight: 'bold' }}>€</span>
            </div>
          </div>

          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2" /><circle cx="12" cy="12" r="2" /></svg>
            Billets comptés
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { key: 'b500', label: '500 €' }, { key: 'b200', label: '200 €' }, { key: 'b100', label: '100 €' },
              { key: 'b50', label: '50 €' }, { key: 'b20', label: '20 €' }, { key: 'b10', label: '10 €' }, { key: 'b5', label: '5 €' }
            ].map(b => (
              <div key={b.key} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 8px' }}>
                <span style={{ width: '45px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{b.label}</span>
                <span style={{ color: 'var(--border-color)', margin: '0 8px' }}>×</span>
                <input type="number" min="0" value={compteCaisse[b.key]} onChange={e => setCompteCaisse({ ...compteCaisse, [b.key]: e.target.value })} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} placeholder="0" />
              </div>
            ))}
          </div>

          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>
            Pièces comptées
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              { key: 'p2', label: '2 €' }, { key: 'p1', label: '1 €' }, { key: 'p050', label: '0.50 €' }, { key: 'p020', label: '0.20 €' },
              { key: 'p010', label: '0.10 €' }, { key: 'p005', label: '0.05 €' }, { key: 'p002', label: '0.02 €' }, { key: 'p001', label: '0.01 €' }
            ].map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 8px' }}>
                <span style={{ width: '45px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{p.label}</span>
                <span style={{ color: 'var(--border-color)', margin: '0 8px' }}>×</span>
                <input type="number" min="0" value={compteCaisse[p.key]} onChange={e => setCompteCaisse({ ...compteCaisse, [p.key]: e.target.value })} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} placeholder="0" />
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-main)' }}>Total Compté (Réel) :</span>
            <span style={{ fontSize: '24px', fontWeight: '900', color: 'var(--btn-primary)' }}>{calculerTotalCaisseReel().toFixed(2)} €</span>
          </div>

          {ecartDetecte !== null && (
            <div style={{ background: 'var(--bg-danger)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-danger)', marginBottom: '16px', textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                Écart de caisse détecté : {ecartDetecte > 0 ? '+' : ''}{ecartDetecte.toFixed(2)} €
              </p>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-danger)', marginBottom: '8px' }}>Pour valider la clôture NF525, une justification est obligatoire :</label>
              <textarea
                className="input-fournisseur"
                placeholder="Ex: Erreur de rendu de monnaie, ou oubli de saisie d'une petite caisse..."
                rows="3"
                value={justificationEcart}
                onChange={e => setJustificationEcart(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-danger)' }}
              />
            </div>
          )}

          <button
            onClick={() => executerZDeCaisse(role === 'gerant' ? 'Gérant' : zEmployeSelect)}
            disabled={(role === 'salon' && !zEmployeSelect) || fondCaisseMatin === '' || (role === 'salon' && configSalon?.securite_pin_salon_active !== false && zCodePin.length < 4) || (ecartDetecte !== null && !justificationEcart.trim())}
            className="btn-action"
            style={{ width: '100%', padding: '16px', fontSize: '16px', background: (ecartDetecte !== null && !justificationEcart.trim()) ? 'var(--text-muted)' : (ecartDetecte !== null ? 'var(--color-danger)' : 'var(--text-main)') }}
          >
            {ecartDetecte !== null ? "Justifier et Sceller" : "Sceller la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}
