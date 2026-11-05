import React from 'react';

export default function FusionStocksModal({
  showMergeModal,
  setShowMergeModal,
  selectedStocksToMerge,
  setSelectedStocksToMerge,
  mergeForm,
  setMergeForm,
  role,
  configSalon,
  getStatutBlocagePin,
  employesListe,
  erreurPinAction,
  setErreurPinAction,
  setIsStockMergeMode,
  showToast,
  chargerTout,
  API_URL,
  getAuthHeaders,
  handleFetchError,
  appliquerRetourPinLocal
}) {
  if (!showMergeModal) return null;

  const statutPinFusion = (role === 'salon' && getStatutBlocagePin)
    ? getStatutBlocagePin(mergeForm.id_employe)
    : { bloque: false, tentatives: 0, essaisRestants: 3 };

  const handleConfirmer = async () => {
    if (!mergeForm.nom?.trim()) return showToast("Le nom du produit est requis.", "error");
    if (role === 'salon' && configSalon?.securite_pin_salon_active !== false) {
      if (!mergeForm.id_employe) return showToast("Veuillez choisir l'employé responsable.", "error");
      if (!mergeForm.code_pin || mergeForm.code_pin.length < 4) return showToast("Le code PIN personnel est obligatoire.", "error");
    }
    try {
      const res = await fetch(`${API_URL}/api/stocks/fusionner`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          ids_articles: selectedStocksToMerge,
          nom: mergeForm.nom,
          reference: mergeForm.reference,
          prix: mergeForm.prix,
          type_article: mergeForm.type_article,
          id_employe: mergeForm.id_employe,
          code_pin: mergeForm.code_pin
        })
      });
      const data = await handleFetchError(res);
      showToast(data.message || "Stocks unifiés avec succès !", "success");
      setShowMergeModal(false);
      setIsStockMergeMode(false);
      setSelectedStocksToMerge([]);
      if (typeof chargerTout === 'function') chargerTout();
    } catch (e) {
      if (e.data) appliquerRetourPinLocal(mergeForm.id_employe, e.data);
      setMergeForm({ ...mergeForm, code_pin: '' });
      showToast(e.message || "Erreur lors de la fusion", "error");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-main)' }}>Unifier les doublons de stock</h3>
          <button className="modal-close-btn" onClick={() => setShowMergeModal(false)}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
          Cette opération additionnera les quantités de {selectedStocksToMerge?.length || 0} produits sélectionnés dans le produit final et supprimera les doublons.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Nom final du produit unifié</label>
          <input type="text" className="input-fournisseur" value={mergeForm.nom} onChange={e => setMergeForm({ ...mergeForm, nom: e.target.value })} style={{ marginBottom: 0 }} />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Référence</label>
            <input type="text" className="input-fournisseur" placeholder="Optionnel" value={mergeForm.reference} onChange={e => setMergeForm({ ...mergeForm, reference: e.target.value })} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Prix (€)</label>
            <input type="number" step="0.01" className="input-fournisseur" placeholder="0.00" value={mergeForm.prix} onChange={e => setMergeForm({ ...mergeForm, prix: e.target.value })} style={{ marginBottom: 0 }} />
          </div>
        </div>

        {role === 'salon' && configSalon?.securite_pin_salon_active !== false && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Employé responsable de la fusion</label>
              <select className="input-fournisseur" value={mergeForm.id_employe} onChange={e => { setMergeForm({ ...mergeForm, id_employe: e.target.value, code_pin: '' }); setErreurPinAction(null); }} style={{ marginBottom: 0 }}>
                <option value="">-- Sélectionnez votre nom --</option>
                <option value="gerant">Gérant (Moi-même)</option>
                {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                <span>Code PIN personnel (Validation NF525)</span>
                {statutPinFusion.tentatives > 0 && !statutPinFusion.bloque && (
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706', textTransform: 'none' }}>
                    {statutPinFusion.essaisRestants} essai{statutPinFusion.essaisRestants > 1 ? 's' : ''} restant{statutPinFusion.essaisRestants > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength="10"
                disabled={statutPinFusion.bloque}
                className="input-fournisseur"
                placeholder={statutPinFusion.bloque ? "Accès verrouillé" : "Votre code PIN"}
                value={mergeForm.code_pin}
                onChange={e => { setMergeForm({ ...mergeForm, code_pin: e.target.value.replace(/\D/g, '') }); setErreurPinAction(null); }}
                style={{ marginBottom: 0, letterSpacing: '0.2em', textAlign: 'center', fontWeight: 'bold', opacity: statutPinFusion.bloque ? 0.5 : 1, border: (statutPinFusion.bloque || erreurPinAction) ? '1px solid var(--color-danger)' : undefined }}
              />
              {(statutPinFusion.bloque || erreurPinAction) && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{statutPinFusion.bloque ? statutPinFusion.message : erreurPinAction}</span>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: role === 'gerant' ? '24px' : '0' }}>
          <button onClick={() => { setShowMergeModal(false); setErreurPinAction(null); }} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer' }}>Annuler</button>
          <button
            disabled={role === 'salon' && configSalon?.securite_pin_salon_active !== false && (getStatutBlocagePin ? getStatutBlocagePin(mergeForm.id_employe).bloque : false)}
            onClick={handleConfirmer}
            className="btn-action"
            style={{ flex: 2 }}
          >
            Confirmer et additionner
          </button>
        </div>
      </div>
    </div>
  );
}
