import React from 'react';

export default function AnnulationTicketModal({
  annulationDialog,
  setAnnulationDialog,
  confirmerAnnulationTicket
}) {
  if (!annulationDialog) return null;

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
        <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '20px' }}>Annuler ce paiement</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
          Cette action génère un ticket de compensation (Loi NF525). Vous pouvez annuler le ticket entier ou sélectionner des articles spécifiques.
        </p>

        {annulationDialog.lignes && annulationDialog.lignes.length > 0 && (
          <div style={{ textAlign: 'left', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', marginBottom: '16px', maxHeight: '150px', overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '8px' }}>ARTICLES REMBOURSABLES :</div>
            {annulationDialog.lignes.map(ligne => {
              const inList = annulationDialog.lignes_a_annuler.find(l => l.id_article === ligne.id_article);
              const qte = inList ? inList.quantite : 0;
              return (
                <div key={ligne.id_article} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{ligne.nom_article_snapshot}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ligne.prix_unitaire_ttc} € / unité (Max: {ligne.quantite_restante})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '2px' }}>
                    <button
                      onClick={() => {
                        if (qte === 0) return;
                        const newLignes = [...annulationDialog.lignes_a_annuler];
                        if (qte === 1) {
                          setAnnulationDialog({ ...annulationDialog, lignes_a_annuler: newLignes.filter(l => l.id_article !== ligne.id_article) });
                        } else {
                          const idx = newLignes.findIndex(l => l.id_article === ligne.id_article);
                          newLignes[idx].quantite -= 1;
                          setAnnulationDialog({ ...annulationDialog, lignes_a_annuler: newLignes });
                        }
                      }}
                      style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-main)' }}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 'bold', minWidth: '16px', textAlign: 'center' }}>{qte}</span>
                    <button
                      onClick={() => {
                        if (qte >= ligne.quantite_restante) return;
                        const newLignes = [...annulationDialog.lignes_a_annuler];
                        const idx = newLignes.findIndex(l => l.id_article === ligne.id_article);
                        if (idx >= 0) newLignes[idx].quantite += 1;
                        else newLignes.push({ id_article: ligne.id_article, quantite: 1 });
                        setAnnulationDialog({ ...annulationDialog, lignes_a_annuler: newLignes });
                      }}
                      style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-main)' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            {annulationDialog.lignes_a_annuler.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '8px', fontStyle: 'italic' }}>Aucun article sélectionné = Annulation totale du ticket.</div>
            )}
          </div>
        )}

        <textarea
          value={annulationDialog.motif}
          onChange={(e) => setAnnulationDialog({ ...annulationDialog, motif: e.target.value })}
          placeholder="Motif de l'annulation (ex : erreur de saisie, geste commercial...)"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '20px', fontFamily: 'inherit', fontSize: '13px', resize: 'vertical' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setAnnulationDialog(null)} style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>Retour</button>
          <button onClick={confirmerAnnulationTicket} disabled={!annulationDialog.motif.trim()} style={{ flex: 1, background: 'var(--color-danger)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: annulationDialog.motif.trim() ? 'pointer' : 'not-allowed', opacity: annulationDialog.motif.trim() ? 1 : 0.5, transition: 'all 0.15s' }}>Confirmer l'annulation</button>
        </div>
      </div>
    </div>
  );
}
