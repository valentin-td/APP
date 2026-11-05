import React from 'react';

export default function RegularisationZModal({
  reguCloture,
  setReguCloture,
  reguMontant,
  setReguMontant,
  role,
  configSalon,
  getStatutBlocagePin,
  reguEmployeId,
  setReguEmployeId,
  reguCodePin,
  setReguCodePin,
  erreurPinAction,
  setErreurPinAction,
  employesListe,
  showToast,
  decodeToken,
  token,
  API_URL,
  getAuthHeaders,
  handleFetchError,
  chargerMouvementsCaisse,
  appliquerRetourPinLocal
}) {
  if (!reguCloture) return null;

  const currentRole = decodeToken(token)?.role;

  const handleValider = async () => {
    if (!reguMontant || isNaN(reguMontant)) return showToast("Veuillez saisir le montant réel.", "error");
    if (currentRole === 'salon' && configSalon?.securite_pin_salon_active !== false) {
      if (!reguEmployeId) return showToast("Veuillez sélectionner le collaborateur qui ouvre la caisse.", "error");
      if (!reguCodePin || reguCodePin.trim().length < 4) return showToast("Veuillez saisir votre code PIN personnel.", "error");
    }
    try {
      const payload = {
        id_cloture: reguCloture.id_cloture,
        montant_reel: parseFloat(reguMontant),
        id_employe: currentRole === 'employe' ? decodeToken(token).id_employe : (reguEmployeId || null),
        code_pin: currentRole === 'salon' ? reguCodePin : undefined
      };
      const res = await fetch(`${API_URL}/api/caisse/regulariser`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload)
      });
      await handleFetchError(res);
      showToast("Caisse ouverte et régularisée !", "success");
      setReguCloture(null);
      setReguMontant('');
      setReguEmployeId('');
      setReguCodePin('');
      setErreurPinAction(null);
      if (typeof chargerMouvementsCaisse === 'function') chargerMouvementsCaisse();
    } catch (e) {
      if (e.data) appliquerRetourPinLocal(reguEmployeId, e.data);
      setReguCodePin('');
      showToast(e.message, "error");
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 999999, background: 'var(--bg-app)' }}>
      <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center', padding: '32px' }}>
        <div style={{ color: 'var(--color-info)', display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px' }}>Ouverture de Caisse</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
          La caisse a été fermée automatiquement hier soir par le système avec un solde théorique estimé à <strong>{parseFloat(reguCloture.total_especes_theorique).toFixed(2)} €</strong>.<br /><br />
          Quel est votre <strong>Fond de Caisse Réel</strong> (espèces physiquement présentes) ce matin ?
        </p>

        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type="number"
            placeholder="Ex: 150.00"
            value={reguMontant}
            onChange={(e) => setReguMontant(e.target.value)}
            style={{ width: '100%', padding: '16px 16px 16px 40px', boxSizing: 'border-box', borderRadius: '12px', border: '2px solid var(--btn-primary)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '20px', fontWeight: 'bold' }}
            autoFocus
          />
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-main)', fontSize: '20px', fontWeight: 'bold' }}>€</span>
        </div>

        {role === 'salon' && configSalon?.securite_pin_salon_active !== false && (() => {
          const statutPin = getStatutBlocagePin ? getStatutBlocagePin(reguEmployeId) : { bloque: false, tentatives: 0 };
          return (
            <div style={{ textAlign: 'left', background: 'var(--bg-app)', padding: '14px', borderRadius: '12px', border: `1px solid ${statutPin.bloque ? 'var(--color-danger)' : 'var(--border-color)'}`, marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collaborateur à l'ouverture</label>
              <select
                className="input-fournisseur"
                value={reguEmployeId}
                onChange={e => { setReguEmployeId(e.target.value); setReguCodePin(''); setErreurPinAction(null); }}
                style={{ marginBottom: '12px', width: '100%', boxSizing: 'border-box' }}
              >
                <option value="">-- Sélectionnez votre nom --</option>
                <option value="gerant">Gérant (Moi-même)</option>
                {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Code PIN personnel
                </span>
                {statutPin.tentatives > 0 && !statutPin.bloque && (
                  <span style={{ fontSize: '10px', color: '#d97706', textTransform: 'none' }}>{statutPin.tentatives} échec(s) enregistré(s)</span>
                )}
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength="10"
                disabled={statutPin.bloque}
                className="input-fournisseur"
                placeholder={statutPin.bloque ? "Accès verrouillé" : "Saisissez votre code PIN"}
                value={reguCodePin}
                onChange={e => { setReguCodePin(e.target.value.replace(/\D/g, '')); setErreurPinAction(null); }}
                style={{ margin: 0, width: '100%', boxSizing: 'border-box', minHeight: '44px', fontSize: 'clamp(14px, 2.5vw, 16px)', letterSpacing: reguCodePin ? '0.2em' : 'normal', textAlign: 'center', fontWeight: '600', opacity: statutPin.bloque ? 0.5 : 1, border: (statutPin.bloque || erreurPinAction) ? '1px solid var(--color-danger)' : undefined }}
              />
              {(statutPin.bloque || erreurPinAction) && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{statutPin.bloque ? statutPin.message : erreurPinAction}</span>
                </div>
              )}
            </div>
          );
        })()}

        <button
          onClick={handleValider}
          disabled={!reguMontant || (role === 'salon' && configSalon?.securite_pin_salon_active !== false && (!reguEmployeId || reguCodePin.length < 4))}
          className="btn-action"
          style={{ width: '100%', padding: '16px', fontSize: '16px' }}
        >
          Valider et Ouvrir la caisse
        </button>
      </div>
    </div>
  );
}
