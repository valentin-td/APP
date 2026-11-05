import React from 'react';

export default function SaisieFactureManuelleModal({
  showSaisieManuelleFacture,
  setShowSaisieManuelleFacture,
  formFactureManuelle,
  setFormFactureManuelle,
  role,
  configSalon,
  employesListe,
  getStatutBlocagePin,
  erreurPinAction,
  setErreurPinAction,
  enregistrerFactureManuelle
}) {
  if (!showSaisieManuelleFacture) return null;

  const statutPinDepense = (role === 'salon' && getStatutBlocagePin)
    ? getStatutBlocagePin(formFactureManuelle.id_employe)
    : { bloque: false, tentatives: 0, essaisRestants: 3 };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-main)' }}>Saisie manuelle d'une dépense</h3>
          <button className="modal-close-btn" onClick={() => { setShowSaisieManuelleFacture(false); setErreurPinAction(null); }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Fournisseur</label>
          <input type="text" className="input-fournisseur" placeholder="Ex: L'Oréal, EDF, Loyer..." value={formFactureManuelle.nom_fournisseur} onChange={e => setFormFactureManuelle({ ...formFactureManuelle, nom_fournisseur: e.target.value })} style={{ marginBottom: 0 }} />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>N° Facture</label>
            <input type="text" className="input-fournisseur" placeholder="Optionnel" value={formFactureManuelle.numero_facture} onChange={e => setFormFactureManuelle({ ...formFactureManuelle, numero_facture: e.target.value })} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Date</label>
            <input type="date" className="input-fournisseur" value={formFactureManuelle.date_facture} onChange={e => setFormFactureManuelle({ ...formFactureManuelle, date_facture: e.target.value })} style={{ marginBottom: 0 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Moyen de paiement</label>
            <select className="input-fournisseur" value={formFactureManuelle.mode_paiement} onChange={e => setFormFactureManuelle({ ...formFactureManuelle, mode_paiement: e.target.value })} style={{ marginBottom: 0 }}>
              <option value="CARTE">Carte / TPE</option>
              <option value="ESPECES">Espèces (Caisse)</option>
              <option value="VIREMENT">Virement</option>
              <option value="PRELEVEMENT">Prélèvement</option>
              <option value="CHEQUE">Chèque</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Compte comptable</label>
            <select className="input-fournisseur" value={formFactureManuelle.compte_comptable} onChange={e => setFormFactureManuelle({ ...formFactureManuelle, compte_comptable: e.target.value })} style={{ marginBottom: 0 }}>
              <option value="607">607 - Revente</option>
              <option value="604">604 - Prestations</option>
              <option value="6028">6028 - Consommables</option>
              <option value="613">613 - Loyer</option>
              <option value="6061">6061 - Énergie / Eau</option>
            </select>
          </div>
        </div>

        <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 95px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Montant HT (€)</label>
              <input
                type="number"
                step="0.01"
                className="input-fournisseur"
                placeholder="0.00"
                value={formFactureManuelle.montant_ht}
                onChange={e => {
                  const valHt = e.target.value;
                  const ht = parseFloat(valHt);
                  const tauxSel = formFactureManuelle.taux_tva_select ?? '20';
                  if (!isNaN(ht) && ht >= 0) {
                    if (tauxSel !== 'PERSO') {
                      const taux = parseFloat(tauxSel) || 0;
                      const tvaCalc = Number((ht * (taux / 100)).toFixed(2));
                      const ttcCalc = Number((ht + tvaCalc).toFixed(2));
                      setFormFactureManuelle({ ...formFactureManuelle, montant_ht: valHt, montant_tva: tvaCalc.toFixed(2), montant_ttc: ttcCalc.toFixed(2) });
                    } else {
                      const tvaMan = parseFloat(formFactureManuelle.montant_tva) || 0;
                      setFormFactureManuelle({ ...formFactureManuelle, montant_ht: valHt, montant_ttc: (ht + tvaMan).toFixed(2) });
                    }
                  } else {
                    setFormFactureManuelle({ ...formFactureManuelle, montant_ht: valHt });
                  }
                }}
                style={{ marginBottom: 0 }}
              />
            </div>
            <span style={{ paddingBottom: '10px', color: 'var(--text-muted)' }}>+</span>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Taux TVA</label>
              <select
                className="input-fournisseur"
                value={formFactureManuelle.taux_tva_select ?? '20'}
                onChange={e => {
                  const newTauxSel = e.target.value;
                  const ht = parseFloat(formFactureManuelle.montant_ht);
                  if (newTauxSel !== 'PERSO') {
                    const taux = parseFloat(newTauxSel) || 0;
                    if (!isNaN(ht) && ht >= 0) {
                      const tvaCalc = Number((ht * (taux / 100)).toFixed(2));
                      const ttcCalc = Number((ht + tvaCalc).toFixed(2));
                      setFormFactureManuelle({ ...formFactureManuelle, taux_tva_select: newTauxSel, montant_tva: tvaCalc.toFixed(2), montant_ttc: ttcCalc.toFixed(2) });
                    } else {
                      setFormFactureManuelle({ ...formFactureManuelle, taux_tva_select: newTauxSel, montant_tva: '' });
                    }
                  } else {
                    setFormFactureManuelle({ ...formFactureManuelle, taux_tva_select: 'PERSO' });
                  }
                }}
                style={{ marginBottom: 0 }}
              >
                <option value="20">20 % (Normal)</option>
                <option value="10">10 % (Interm.)</option>
                <option value="5.5">5,5 % (Réduit)</option>
                <option value="2.1">2,1 % (Partic.)</option>
                <option value="0">0 % (Exonéré)</option>
                <option value="PERSO">Montant libre (€)</option>
              </select>
            </div>
            <span style={{ paddingBottom: '10px', color: 'var(--text-muted)' }}>=</span>
            <div style={{ flex: '1 1 95px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>TTC (€)</label>
              <input
                type="number"
                step="0.01"
                className="input-fournisseur"
                placeholder="0.00"
                value={formFactureManuelle.montant_ttc}
                onChange={e => {
                  const valTtc = e.target.value;
                  const ttc = parseFloat(valTtc);
                  const tauxSel = formFactureManuelle.taux_tva_select ?? '20';
                  if (!isNaN(ttc) && ttc >= 0) {
                    if (tauxSel !== 'PERSO') {
                      const taux = parseFloat(tauxSel) || 0;
                      const htCalc = Number((ttc / (1 + taux / 100)).toFixed(2));
                      const tvaCalc = Number((ttc - htCalc).toFixed(2));
                      setFormFactureManuelle({ ...formFactureManuelle, montant_ttc: valTtc, montant_ht: htCalc.toFixed(2), montant_tva: tvaCalc.toFixed(2) });
                    } else {
                      const tvaMan = parseFloat(formFactureManuelle.montant_tva) || 0;
                      setFormFactureManuelle({ ...formFactureManuelle, montant_ttc: valTtc, montant_ht: Math.max(0, ttc - tvaMan).toFixed(2) });
                    }
                  } else {
                    setFormFactureManuelle({ ...formFactureManuelle, montant_ttc: valTtc });
                  }
                }}
                style={{ marginBottom: 0, fontWeight: 'bold' }}
              />
            </div>
          </div>

          {formFactureManuelle.taux_tva_select === 'PERSO' ? (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Montant personnalisé de la TVA (€)</label>
              <input
                type="number"
                step="0.01"
                className="input-fournisseur"
                placeholder="Ex: 12.50"
                value={formFactureManuelle.montant_tva}
                onChange={e => {
                  const valTva = e.target.value;
                  const tva = parseFloat(valTva) || 0;
                  const ht = parseFloat(formFactureManuelle.montant_ht);
                  const ttc = parseFloat(formFactureManuelle.montant_ttc);
                  if (!isNaN(ht) && ht > 0) {
                    setFormFactureManuelle({ ...formFactureManuelle, montant_tva: valTva, montant_ttc: (ht + tva).toFixed(2) });
                  } else if (!isNaN(ttc) && ttc > 0) {
                    setFormFactureManuelle({ ...formFactureManuelle, montant_tva: valTva, montant_ht: Math.max(0, ttc - tva).toFixed(2) });
                  } else {
                    setFormFactureManuelle({ ...formFactureManuelle, montant_tva: valTva });
                  }
                }}
                style={{ marginBottom: 0 }}
              />
            </div>
          ) : (
            formFactureManuelle.montant_tva !== '' && (
              <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                Montant TVA calculé : <strong>{parseFloat(formFactureManuelle.montant_tva || 0).toFixed(2)} €</strong>
              </div>
            )
          )}
        </div>

        {role === 'salon' && configSalon?.securite_pin_salon_active !== false && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Employé responsable</label>
              <select className="input-fournisseur" value={formFactureManuelle.id_employe} onChange={e => { setFormFactureManuelle({ ...formFactureManuelle, id_employe: e.target.value, code_pin: '' }); setErreurPinAction(null); }} style={{ marginBottom: 0 }}>
                <option value="">-- Sélectionnez votre nom --</option>
                <option value="gerant">Gérant (Moi-même)</option>
                {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                <span>Code PIN personnel (Validation NF525)</span>
                {statutPinDepense.tentatives > 0 && !statutPinDepense.bloque && (
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706', textTransform: 'none' }}>
                    {statutPinDepense.essaisRestants} essai{statutPinDepense.essaisRestants > 1 ? 's' : ''} restant{statutPinDepense.essaisRestants > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength="10"
                disabled={statutPinDepense.bloque}
                className="input-fournisseur"
                placeholder={statutPinDepense.bloque ? "Accès verrouillé" : "Votre code PIN"}
                value={formFactureManuelle.code_pin}
                onChange={e => { setFormFactureManuelle({ ...formFactureManuelle, code_pin: e.target.value.replace(/\D/g, '') }); setErreurPinAction(null); }}
                style={{ marginBottom: 0, letterSpacing: '0.2em', textAlign: 'center', fontWeight: 'bold', opacity: statutPinDepense.bloque ? 0.5 : 1, border: (statutPinDepense.bloque || erreurPinAction) ? '1px solid var(--color-danger)' : undefined }}
              />
              {(statutPinDepense.bloque || erreurPinAction) && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{statutPinDepense.bloque ? statutPinDepense.message : erreurPinAction}</span>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => { setShowSaisieManuelleFacture(false); setErreurPinAction(null); }} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer' }}>Annuler</button>
          <button disabled={role === 'salon' && configSalon?.securite_pin_salon_active !== false && (getStatutBlocagePin ? getStatutBlocagePin(formFactureManuelle.id_employe).bloque : false)} onClick={enregistrerFactureManuelle} className="btn-action" style={{ flex: 2 }}>Enregistrer la dépense</button>
        </div>
      </div>
    </div>
  );
}
