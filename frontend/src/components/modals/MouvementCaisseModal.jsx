import React from 'react';

export default function MouvementCaisseModal({
  showMouvementModal,
  setShowMouvementModal,
  newMouvement,
  setNewMouvement,
  modeCalculatrice,
  setModeCalculatrice,
  ongletCalculatrice,
  setOngletCalculatrice,
  detailsMonnaie,
  setDetailsMonnaie,
  role,
  configSalon,
  employesListe,
  getStatutBlocagePin,
  erreurPinAction,
  setErreurPinAction,
  showToast,
  API_URL,
  getAuthHeaders,
  handleFetchError,
  chargerMouvementsCaisse,
  appliquerRetourPinLocal
}) {
  if (!showMouvementModal) return null;

  const handleClose = () => {
    setShowMouvementModal(false);
    setModeCalculatrice(false);
    setDetailsMonnaie({ b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '', p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: '' });
    setNewMouvement({ ...newMouvement, montant: '', code_pin: '' });
  };

  const handleValider = async () => {
    if (!newMouvement.motif.trim() || !newMouvement.montant) return showToast("Veuillez remplir le montant et le motif.", "error");
    try {
      const res = await fetch(`${API_URL}/api/caisse/mouvements`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(newMouvement)
      });
      await handleFetchError(res);
      showToast("Mouvement enregistré.", "success");
      setShowMouvementModal(false);
      setNewMouvement({ type_mouvement: 'SORTIE', montant: '', motif: '', id_employe: '', code_pin: '' });
      setModeCalculatrice(false);
      setDetailsMonnaie({ b500: '', b200: '', b100: '', b50: '', b20: '', b10: '', b5: '', p2: '', p1: '', p050: '', p020: '', p010: '', p005: '', p002: '', p001: '' });
      if (typeof chargerMouvementsCaisse === 'function') chargerMouvementsCaisse();
    } catch (e) {
      if (e.data) appliquerRetourPinLocal(newMouvement.id_employe, e.data);
      setNewMouvement({ ...newMouvement, code_pin: '' });
      showToast(e.message, "error");
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-content" style={{ maxWidth: '400px', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-main)' }}>Mouvement de Caisse</h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button onClick={() => setNewMouvement({ ...newMouvement, type_mouvement: 'SORTIE' })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${newMouvement.type_mouvement === 'SORTIE' ? 'var(--color-danger)' : 'var(--border-color)'}`, background: newMouvement.type_mouvement === 'SORTIE' ? 'var(--bg-danger)' : 'var(--bg-app)', color: newMouvement.type_mouvement === 'SORTIE' ? 'var(--color-danger)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Sortie d'espèces
            </button>
            <button onClick={() => setNewMouvement({ ...newMouvement, type_mouvement: 'ENTREE' })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${newMouvement.type_mouvement === 'ENTREE' ? 'var(--color-success)' : 'var(--border-color)'}`, background: newMouvement.type_mouvement === 'ENTREE' ? 'var(--bg-success)' : 'var(--bg-app)', color: newMouvement.type_mouvement === 'ENTREE' ? 'var(--color-success)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Entrée d'espèces
            </button>
          </div>

          {!modeCalculatrice ? (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>Montant (€)</label>
                <button onClick={() => setModeCalculatrice(true)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2" /><circle cx="12" cy="12" r="2" /></svg>
                  Mode billets
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input type="number" placeholder="0.00" value={newMouvement.montant} onChange={(e) => setNewMouvement({ ...newMouvement, montant: e.target.value })} style={{ width: '100%', padding: '12px 12px 12px 40px', boxSizing: 'border-box', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold' }} autoFocus />
                <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>€</span>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <button onClick={() => setOngletCalculatrice('BILLETS')} style={{ background: ongletCalculatrice === 'BILLETS' ? 'var(--btn-primary)' : 'transparent', color: ongletCalculatrice === 'BILLETS' ? 'var(--btn-text)' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Billets</button>
                  <button onClick={() => setOngletCalculatrice('MONNAIES')} style={{ background: ongletCalculatrice === 'MONNAIES' ? 'var(--btn-primary)' : 'transparent', color: ongletCalculatrice === 'MONNAIES' ? 'var(--btn-text)' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Pièces</button>
                </div>
                <button onClick={() => setModeCalculatrice(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>Manuel</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                {ongletCalculatrice === 'MONNAIES' ? (
                  [{ key: 'p2', label: '2 €' }, { key: 'p1', label: '1 €' }, { key: 'p050', label: '0.50 €' }, { key: 'p020', label: '0.20 €' }, { key: 'p010', label: '0.10 €' }, { key: 'p005', label: '0.05 €' }, { key: 'p002', label: '0.02 €' }, { key: 'p001', label: '0.01 €' }].map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px' }}>
                      <span style={{ width: '45px', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--border-color)', margin: '0 6px' }}>×</span>
                      <input type="number" min="0" value={detailsMonnaie[item.key]} onChange={e => setDetailsMonnaie({ ...detailsMonnaie, [item.key]: e.target.value })} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} placeholder="0" />
                    </div>
                  ))
                ) : (
                  [{ key: 'b500', label: '500 €' }, { key: 'b200', label: '200 €' }, { key: 'b100', label: '100 €' }, { key: 'b50', label: '50 €' }, { key: 'b20', label: '20 €' }, { key: 'b10', label: '10 €' }, { key: 'b5', label: '5 €' }].map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px' }}>
                      <span style={{ width: '45px', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--border-color)', margin: '0 6px' }}>×</span>
                      <input type="number" min="0" value={detailsMonnaie[item.key]} onChange={e => setDetailsMonnaie({ ...detailsMonnaie, [item.key]: e.target.value })} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} placeholder="0" />
                    </div>
                  ))
                )}
              </div>
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Total calculé :</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-main)' }}>{newMouvement.montant || '0.00'} €</span>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>Motif obligatoire</label>
            <input type="text" placeholder="Ex: Achat café, rendu monnaie..." value={newMouvement.motif} onChange={(e) => setNewMouvement({ ...newMouvement, motif: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px', marginBottom: '8px' }} />

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span
                onClick={() => setNewMouvement({ ...newMouvement, motif: "Remise en banque (Dépôt)" })}
                style={{
                  fontSize: '12px', padding: '6px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  borderRadius: '16px', cursor: 'pointer', fontWeight: '500'
                }}
              >
                Dépôt Banque
              </span>
              <span
                onClick={() => setNewMouvement({ ...newMouvement, motif: "Apport de monnaie (Retrait banque)" })}
                style={{
                  fontSize: '12px', padding: '6px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  borderRadius: '16px', cursor: 'pointer', fontWeight: '500'
                }}
              >
                Retrait Monnaie
              </span>
              <span
                onClick={() => setNewMouvement({ ...newMouvement, motif: "Achat fournitures (Café, etc.)" })}
                style={{
                  fontSize: '12px', padding: '6px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  borderRadius: '16px', cursor: 'pointer', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '5px'
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                Achats / Frais
              </span>
            </div>
          </div>

          {role === 'salon' && configSalon?.securite_pin_salon_active !== false && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>Collaborateur responsable</label>
              <select value={newMouvement.id_employe} onChange={(e) => { setNewMouvement({ ...newMouvement, id_employe: e.target.value, code_pin: '' }); setErreurPinAction(null); }} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px' }}>
                <option value="">-- Sélectionnez votre nom --</option>
                <option value="gerant">Gérant (Moi-même)</option>
                {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
              </select>
            </div>
          )}

          {role === 'salon' && configSalon?.securite_pin_salon_active !== false && (() => {
            const statutPinMvt = getStatutBlocagePin ? getStatutBlocagePin(newMouvement.id_employe) : { bloque: false, tentatives: 0, essaisRestants: 3 };
            return (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Code PIN personnel
                  </span>
                  {statutPinMvt.tentatives > 0 && !statutPinMvt.bloque && (
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706' }}>
                      {statutPinMvt.essaisRestants} essai{statutPinMvt.essaisRestants > 1 ? 's' : ''} restant{statutPinMvt.essaisRestants > 1 ? 's' : ''}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength="10"
                  disabled={statutPinMvt.bloque}
                  placeholder={statutPinMvt.bloque ? "Accès verrouillé" : "Saisissez votre code PIN"}
                  value={newMouvement.code_pin || ''}
                  onChange={(e) => { setNewMouvement({ ...newMouvement, code_pin: e.target.value.replace(/\D/g, '') }); setErreurPinAction(null); }}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '12px', borderRadius: '12px', border: `1px solid ${(statutPinMvt.bloque || erreurPinAction) ? 'var(--color-danger)' : 'var(--border-color)'}`, background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: '600', letterSpacing: newMouvement.code_pin ? '0.2em' : 'normal', textAlign: 'center', opacity: statutPinMvt.bloque ? 0.5 : 1 }}
                />
                {(statutPinMvt.bloque || erreurPinAction) && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <span>{statutPinMvt.bloque ? statutPinMvt.message : erreurPinAction}</span>
                  </div>
                )}
              </div>
            );
          })()}

          <button
            disabled={role === 'salon' && configSalon?.securite_pin_salon_active !== false && (getStatutBlocagePin ? getStatutBlocagePin(newMouvement.id_employe).bloque : false)}
            onClick={handleValider}
            className="btn-action"
            style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '16px' }}
          >
            Valider l'opération
          </button>
        </div>
      </div>
    </div>
  );
}
