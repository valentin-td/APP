import React from 'react';

export default function ValidationComptaModal({
  showModalValidationCompta,
  setShowModalValidationCompta,
  statutMoisPrecedent,
  setHasSignedCompta,
  hasSignedCompta,
  checklistCompta,
  setChecklistCompta,
  effacerSignatureCompta,
  signatureCanvasRef,
  demarrerTraceSignature,
  dessinerTraceSignature,
  arreterTraceSignature,
  pinValidationCompta,
  setPinValidationCompta,
  validerEtEnvoyerMois,
  isValidatingCompta
}) {
  if (!showModalValidationCompta || !statutMoisPrecedent) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-content" style={{ maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon" style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--text-main)', color: 'var(--bg-card)' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--text-main)' }}>Certification — {statutMoisPrecedent.libelle}</h3>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Validation légale NF525 & Signature dirigeant</span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={() => { setShowModalValidationCompta(false); setHasSignedCompta(false); }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          Vérifiez les 3 points de contrôle ci-dessous, apposez votre signature manuscrite (qui figurera sur la liasse PDF finale) et confirmez avec votre code PIN gérant.
        </p>

        <div className="checklist-container" style={{ marginBottom: '16px' }}>
          <div className={`checklist-item ${checklistCompta.caisse ? 'checked' : ''}`} onClick={() => setChecklistCompta({ ...checklistCompta, caisse: !checklistCompta.caisse })}>
            <div className="checklist-checkbox">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="checklist-content">
              <span className="checklist-title">Caisse et clôtures Z vérifiées</span>
              <span className="checklist-desc">Le rapprochement entre les encaissements, les espèces physiques et les remises en banque est exact.</span>
            </div>
          </div>

          <div className={`checklist-item ${checklistCompta.paie ? 'checked' : ''}`} onClick={() => setChecklistCompta({ ...checklistCompta, paie: !checklistCompta.paie })}>
            <div className="checklist-checkbox">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="checklist-content">
              <span className="checklist-title">Variables de paie et absences vérifiées</span>
              <span className="checklist-desc">Les commissions, heures supplémentaires/complémentaires et congés de l'équipe sont complets.</span>
            </div>
          </div>

          <div className={`checklist-item ${checklistCompta.depenses ? 'checked' : ''}`} onClick={() => setChecklistCompta({ ...checklistCompta, depenses: !checklistCompta.depenses })}>
            <div className="checklist-checkbox">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="checklist-content">
              <span className="checklist-title">Dépenses et achats justifiés</span>
              <span className="checklist-desc">Les factures fournisseurs du mois sont validées et les justificatifs sont tenus à disposition.</span>
            </div>
          </div>
        </div>

        {/* PAVÉ DE SIGNATURE MANUSCRITE (TACTILE & SOURIS) */}
        <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              <span>1. Signature manuscrite du gérant (Apposée sur le PDF)</span>
            </label>
            {hasSignedCompta && (
              <button
                type="button"
                onClick={effacerSignatureCompta}
                style={{ background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', padding: '2px 6px' }}
              >
                Recommencer
              </button>
            )}
          </div>

          <div style={{ position: 'relative', background: '#ffffff', borderRadius: '10px', border: `1.5px dashed ${hasSignedCompta ? '#16a34a' : '#cbd5e1'}`, overflow: 'hidden', height: '130px', touchAction: 'none' }}>
            {!hasSignedCompta && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>
                <span>Signez ici avec votre souris ou votre doigt</span>
                <span style={{ fontSize: '10.5px', fontWeight: '500', marginTop: '2px' }}>« Certifié sincère et véritable »</span>
              </div>
            )}
            <canvas
              ref={signatureCanvasRef}
              width={460}
              height={130}
              onMouseDown={demarrerTraceSignature}
              onMouseMove={dessinerTraceSignature}
              onMouseUp={arreterTraceSignature}
              onMouseLeave={arreterTraceSignature}
              onTouchStart={demarrerTraceSignature}
              onTouchMove={dessinerTraceSignature}
              onTouchEnd={arreterTraceSignature}
              style={{ width: '100%', height: '130px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
            />
          </div>
        </div>

        {/* CODE PIN DE SCELLEMENT CRYPTOGRAPHIQUE NF525 */}
        <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border-color)', marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span>2. Code PIN gérant (Scellement cryptographique SHA-256)</span>
          </label>
          <input
            type="password"
            maxLength="10"
            inputMode="numeric"
            className="input-fournisseur"
            placeholder="Saisissez votre code PIN"
            value={pinValidationCompta}
            onChange={e => setPinValidationCompta(e.target.value)}
            style={{ marginBottom: '6px', letterSpacing: '0.2em', fontWeight: '700', background: 'var(--bg-card)', textAlign: 'center' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
            Scelle l'empreinte SHA-256 de votre signature et de la liasse aux normes NF525 (Art. 1367 C. civ.).
          </span>
        </div>

        <button
          onClick={validerEtEnvoyerMois}
          className="btn-action"
          disabled={isValidatingCompta || !checklistCompta.caisse || !checklistCompta.paie || !checklistCompta.depenses || !hasSignedCompta || (pinValidationCompta || '').length < 4}
          style={{ width: '100%', gap: '8px', padding: '14px' }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          <span>{isValidatingCompta ? "Scellement et envoi en cours..." : "Certifier, Signer et Transmettre la Liasse"}</span>
        </button>
      </div>
    </div>
  );
}
