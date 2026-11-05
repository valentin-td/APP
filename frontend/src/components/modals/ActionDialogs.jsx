import React from 'react';

export function ConfirmDialog({ confirmDialog, setConfirmDialog }) {
  if (!confirmDialog) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ color: 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px' }}>{confirmDialog.titre}</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>{confirmDialog.message}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>Annuler</button>
          <button onClick={confirmDialog.action} style={{ flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>{confirmDialog.btnTexte}</button>
        </div>
      </div>
    </div>
  );
}

export function ModifStockDialog({ modifStockDialog, setModifStockDialog, confirmerModifStock }) {
  if (!modifStockDialog) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '360px' }}>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px' }}>Modifier le stock</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>{modifStockDialog.nom}</p>
        <input
          type="number"
          min="0"
          value={modifStockDialog.valeur}
          onChange={(e) => setModifStockDialog({ ...modifStockDialog, valeur: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '16px', textAlign: 'center' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setModifStockDialog(null)} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>Annuler</button>
          <button onClick={confirmerModifStock} style={{ flex: 1, background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function ModifNomDialog({ modifNomDialog, setModifNomDialog, confirmerModifNom }) {
  if (!modifNomDialog) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '360px' }}>
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-main)', fontSize: '20px' }}>Renommer la prestation</h2>
        <input
          type="text"
          value={modifNomDialog.nom}
          onChange={(e) => setModifNomDialog({ ...modifNomDialog, nom: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '14px' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setModifNomDialog(null)} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>Annuler</button>
          <button onClick={confirmerModifNom} disabled={!modifNomDialog.nom.trim()} style={{ flex: 1, background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: modifNomDialog.nom.trim() ? 'pointer' : 'not-allowed', opacity: modifNomDialog.nom.trim() ? 1 : 0.5, transition: 'all 0.15s' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function CancellationRobotDialog({
  cancellationRobot,
  setCancellationRobot,
  cancelMessageTemplate,
  setCancelMessageTemplate,
  selectedCancelRdvs,
  setSelectedCancelRdvs,
  showToast,
  chargerTout,
  setRefreshTrigger,
  API_URL,
  getAuthHeaders,
  handleFetchError
}) {
  if (!cancellationRobot) return null;

  const handleConfirmer = async () => {
    if (selectedCancelRdvs.length === 0) return setCancellationRobot(null);
    try {
      const res = await fetch(`${API_URL}/api/agenda/annulation-massee`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          rdv_ids: selectedCancelRdvs,
          template_sms: cancelMessageTemplate
        })
      });
      const data = await handleFetchError(res);
      showToast(data.message, "success");
      setCancellationRobot(null);
      if (typeof chargerTout === 'function') chargerTout();
      if (typeof setRefreshTrigger === 'function') setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      showToast(e.message || "Erreur d'annulation", "error");
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ textAlign: 'left', maxWidth: '500px', width: '90%' }}>
        <div style={{ color: '#f59e0b', display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </div>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px', textAlign: 'center' }}>Détection de RDV</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5', textAlign: 'center' }}>
          <strong>{cancellationRobot.nom_employe}</strong> a <strong>{cancellationRobot.rdvs.length} RDV</strong> sur cette période. Décochez ceux que vous allez confier à un autre coiffeur, et annulez le reste.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Message envoyé</label>
          <textarea
            value={cancelMessageTemplate}
            onChange={(e) => setCancelMessageTemplate(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '13px', minHeight: '80px', resize: 'vertical' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Les balises [Prénom], [Date] et [Lien] s'adapteront à chaque client.</span>
        </div>

        <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', marginBottom: '24px' }}>
          {cancellationRobot.rdvs.map(rdv => {
            const hasPhone = rdv.telephone_client && rdv.telephone_client.trim().length >= 9;
            return (
              <label key={rdv.id_rdv} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', opacity: selectedCancelRdvs.includes(rdv.id_rdv) ? 1 : 0.6 }}>
                <input
                  type="checkbox"
                  checked={selectedCancelRdvs.includes(rdv.id_rdv)}
                  onChange={() => {
                    if (selectedCancelRdvs.includes(rdv.id_rdv)) {
                      setSelectedCancelRdvs(selectedCancelRdvs.filter(id => id !== rdv.id_rdv));
                    } else {
                      setSelectedCancelRdvs([...selectedCancelRdvs, rdv.id_rdv]);
                    }
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--btn-primary)' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{rdv.nom_client || 'Client inconnu'}</span>
                    <span style={{ fontSize: '12px', fontWeight: 'normal' }}>{new Date(rdv.date_heure_debut.replace('Z', '')).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: hasPhone ? 'var(--text-secondary)' : 'var(--color-danger)', fontWeight: hasPhone ? 'normal' : 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    {hasPhone ? `📞 ${rdv.telephone_client} - ${rdv.prestation}` : `⚠️ Aucun numéro - Appel manuel requis`}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setCancellationRobot(null)} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer' }}>
            Ne rien annuler
          </button>
          <button onClick={handleConfirmer} style={{ flex: 2, background: 'var(--btn-primary)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer' }}>
            Envoyer ({selectedCancelRdvs.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuditNf525Dialog({ auditNf525, setAuditNf525 }) {
  if (!auditNf525) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '450px' }}>
        <div style={{ color: auditNf525.conforme ? 'var(--color-success)' : 'var(--color-danger)', display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {auditNf525.conforme
            ? <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            : <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          }
        </div>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px' }}>
          {auditNf525.conforme ? "Base de données intègre" : "Altération détectée"}
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
          {auditNf525.conforme
            ? "Le chaînage cryptographique est parfaitement valide. Aucune donnée financière n'a été altérée."
            : "Le système a détecté une rupture dans la chaîne cryptographique !"}
        </p>
        <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '13px' }}>
          <div style={{ marginBottom: '8px'}}><strong>Tickets vérifiés :</strong> {auditNf525.total_tickets_verifies}</div>
          <div style={{ marginBottom: '8px'}}><strong>Clôtures (Z) vérifiées :</strong> {auditNf525.total_z_verifies}</div>
          <div><strong>Journaux Techniques (JET) :</strong> {auditNf525.total_jet_verifies}</div>
        </div>

        {auditNf525.erreurs && auditNf525.erreurs.length > 0 && (
          <div style={{ background: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '12px', maxHeight: '100px', overflowY: 'auto' }}>
            {auditNf525.erreurs.map((err, i) => <div key={i}>• {err}</div>)}
          </div>
        )}

        {auditNf525.alertes && auditNf525.alertes.length > 0 && (
          <div style={{ background: 'var(--bg-info)', color: 'var(--color-info)', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left', fontSize: '12px', maxHeight: '100px', overflowY: 'auto' }}>
            {auditNf525.alertes.map((al, i) => <div key={i}>• {al}</div>)}
          </div>
        )}

        <button onClick={() => setAuditNf525(null)} className="btn-action" style={{ width: '100%' }}>Fermer</button>
      </div>
    </div>
  );
}

export function SauvetageClientDialog({
  sauvetageClient,
  setSauvetageClient,
  remiseSauvetage,
  setRemiseSauvetage,
  smsSauvetage,
  setSmsSauvetage,
  envoyerSmsSauvetage
}) {
  if (!sauvetageClient) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '18px' }}>Sauver ce client</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Envoyez un SMS d'excuse avec une offre pour le faire revenir.</p>

        <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Offre ajoutée à sa fiche (Rappel en caisse)</label>
        <select
          className="input-fournisseur"
          value={remiseSauvetage}
          onChange={(e) => {
            const val = e.target.value;
            setRemiseSauvetage(val);
            if (val === '-10% sur la prochaine visite') setSmsSauvetage("Bonjour, je suis le gérant du salon. Vraiment navré pour votre expérience. Voici -10% sur votre prochaine coupe pour nous faire pardonner. À très vite !");
            if (val === '-20% sur la prochaine visite') setSmsSauvetage("Bonjour, je suis le gérant du salon. Vraiment navré pour votre expérience. Voici -20% sur votre prochaine coupe pour nous faire pardonner. À très vite !");
            if (val === 'Soin offert à la prochaine visite') setSmsSauvetage("Bonjour, je suis le gérant du salon. Vraiment navré pour votre expérience. Un Soin vous sera offert lors de votre prochaine visite pour nous faire pardonner. À très vite !");
          }}
          style={{ marginBottom: '16px', width: '100%' }}
        >
          <option value="">Aucune (Juste un SMS d'excuse)</option>
          <option value="-10% sur la prochaine visite">-10% sur la prochaine visite</option>
          <option value="-20% sur la prochaine visite">-20% sur la prochaine visite</option>
          <option value="Soin offert à la prochaine visite">Soin offert à la prochaine visite</option>
        </select>

        <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Message SMS envoyé</label>
        <textarea className="input-fournisseur" rows={5} value={smsSauvetage} onChange={e => setSmsSauvetage(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginBottom: '20px', fontSize: '13px', resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => { setSauvetageClient(null); setRemiseSauvetage(''); }} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer' }}>Annuler</button>
          <button onClick={envoyerSmsSauvetage} className="btn-action" style={{ flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none' }}>Envoyer l'offre</button>
        </div>
      </div>
    </div>
  );
}
