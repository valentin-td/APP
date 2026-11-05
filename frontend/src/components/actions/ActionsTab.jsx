import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import { API_URL } from '../../api/config';
import { decodeToken } from '../../utils/auth';

export const ActionsTab = ({
  role,
  isMobile,
  setShowSaisieManuelleFacture,
  aLeNiveau,
  handleUploadFactureManuel,
  isUploadingFacture,
  setShowPricingModal,
  erreurAnalyseIA,
  setErreurAnalyseIA,
  nouvelleTache = {},
  setNouvelleTache,
  employesListe = [],
  token,
  getAuthHeaders,
  showToast,
  chargerTout,
  tachesListe = [],
  getCouleurTache,
  setSauvetageClient,
  setSmsSauvetage,
  isTachesTermineesExpanded,
  setIsTachesTermineesExpanded,
}) => {
  return (
    <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* EN-TÊTE FIXE */}
      <div className={isMobile ? "mobile-fixed-header-top" : ""}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
          <div>
            <h1 style={{margin: 0}}>Centre d'Action</h1>
            <span className="date-subtitle" style={{margin: 0}}></span>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ZONE DÉFILANTE */}
      <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
        {role === 'gerant' && (
          <>
            <div className="carte scan-carte" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '15px' }}>Factures & Dépenses</h3>
                </div>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}></span>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '1 1 300px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowSaisieManuelleFacture(true)}
                  className="btn-action"
                  style={{ flex: 1, minWidth: '145px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px' }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  Saisie Manuelle
                </button>

                {aLeNiveau('PREMIUM') ? (
                  <>
                    <input
                      type="file"
                      id="upload-facture-actions-ia"
                      accept="application/pdf, image/jpeg, image/png, image/jpg"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleUploadFactureManuel}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('upload-facture-actions-ia').click()}
                      disabled={isUploadingFacture}
                      className="btn-action"
                      style={{ flex: 1, minWidth: '175px', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', opacity: isUploadingFacture ? 0.5 : 1, cursor: isUploadingFacture ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px' }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      {isUploadingFacture ? 'Lecture IA en cours...' : 'Saisie Automatique (IA)'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPricingModal(true)}
                    style={{ flex: 1, minWidth: '175px', background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: 'var(--radius-input)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: 0.65 }}
                    title="Fonctionnalité réservée au forfait PREMIUM"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Saisie Automatique (IA)
                  </button>
                )}
              </div>
            </div>

            {erreurAnalyseIA && (
              <div className="carte" style={{ background: 'var(--bg-danger)', border: '1px solid var(--color-danger)', marginBottom: '16px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--color-danger)' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '2px', fontSize: '13px' }}>Document non reconnu par l'IA</strong>
                    <span style={{ fontSize: '12.5px', lineHeight: '1.4' }}>{erreurAnalyseIA}</span>
                  </div>
                </div>
                <button onClick={() => setErreurAnalyseIA(null)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
          </>
        )}

        <div className="carte scan-carte">
          {role === 'gerant' && (
            <select className="input-fournisseur" style={{marginBottom: '12px'}} value={nouvelleTache.proprietaire || 'gerant'} onChange={e => setNouvelleTache({...nouvelleTache, proprietaire: e.target.value})}>
              <option value="gerant">Assigner à : Moi (Gérant)</option>
              <option value="salon">Assigner à : Tout le salon (Commun)</option>
              {(employesListe || []).map(emp => (
                <option key={emp.id_employe} value={`emp_${emp.id_employe}`}>Assigner à : {emp.nom} {emp.est_gerant ? '(Mon profil employé)' : ''}</option>
              ))}
            </select>
          )}
          <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
            <input type="text" className="input-fournisseur" placeholder="Titre (ex: Payer l'URSSAF)" style={{flex: 2}} value={nouvelleTache.titre} onChange={e => setNouvelleTache({...nouvelleTache, titre: e.target.value})} />
            <input type="date" className="input-fournisseur" style={{flex: 1}} value={nouvelleTache.date_echeance} onChange={e => setNouvelleTache({...nouvelleTache, date_echeance: e.target.value})} />
          </div>
          <input type="text" className="input-fournisseur" placeholder="Détails (Optionnel)" style={{marginBottom: '16px'}} value={nouvelleTache.description} onChange={e => setNouvelleTache({...nouvelleTache, description: e.target.value})} />
          <button className="btn-action" style={{width: '100%'}} disabled={!nouvelleTache.titre} onClick={async () => {
            const proprietaireActuel = role === 'gerant' ? (nouvelleTache.proprietaire || 'gerant') : (role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : role);
            try { await fetch(`${API_URL}/api/taches`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({...nouvelleTache, proprietaire: proprietaireActuel}) }); showToast("Action ajoutée", "success"); setNouvelleTache({titre:'', description:'', date_echeance:'', proprietaire: 'gerant'}); chargerTout(); } catch(e) { showToast("Erreur", "error"); }
          }}>Ajouter une tâche</button>
        </div>

        {(() => {
          const proprietaireActuel = role === 'employe' ? `emp_${decodeToken(token)?.id_employe}` : role;
          
          const mesTaches = (tachesListe || []).filter(t => {
            const prop = t.proprietaire || 'gerant';
            if (role === 'gerant') return true;
            if (role === 'employe') return prop === proprietaireActuel || prop === 'salon';
            return prop === proprietaireActuel || prop === 'salon';
          });
          
          const tachesAFaire = mesTaches.filter(t => t.statut === 'A_FAIRE');
          const tachesFaites = mesTaches.filter(t => t.statut === 'FAIT');

          return (
            <>
              <div className="section-label">À traiter ({tachesAFaire.length})</div>
              {tachesAFaire.length === 0 ? (
                <div className="empty-state"><p>Toutes vos actions sont à jour.</p></div>
              ) : (
                <div className="list-group">
                  {tachesAFaire.map(tache => (
                    <div key={tache.id_tache} className="list-row" style={{alignItems: 'flex-start'}}>
                      <button onClick={async () => { await fetch(`${API_URL}/api/taches/${tache.id_tache}/statut`, { method: 'PUT', headers: getAuthHeaders() }); chargerTout(); }} title="Marquer comme terminée" style={{background: 'none', border: `2px solid ${getCouleurTache(tache)}`, width: '20px', height: '20px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, marginTop: '2px', padding: 0}}></button>
                      <div className="list-row-content">
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                          <span className="list-row-label">{tache.titre}</span>
                          {tache.source === 'IA' && <span style={{fontSize: '10px', background: 'var(--btn-primary)', color: 'var(--btn-text)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600'}}>DÉTECTÉ</span>}
                          {tache.source === 'AVIS_CLIENT' && <button onClick={() => { setSauvetageClient(tache.donnees); setSmsSauvetage(`Bonjour ${tache.donnees?.prenom || ''}, je suis le gérant du salon. Vraiment navré pour votre expérience. Voici -20% sur votre prochaine coupe pour nous faire pardonner. À très vite !`); }} style={{fontSize: '10px', background: 'var(--color-danger)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: '600', border: 'none', cursor: 'pointer', marginLeft: '8px'}}>Sauver ce client</button>}
                          
                          {role === 'gerant' && tache.proprietaire && tache.proprietaire !== 'gerant' && (
                            <span style={{fontSize: '10px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', border: '1px solid #bfdbfe'}}>
                              {tache.proprietaire === 'salon' ? 'SALON ENTIER' : ((employesListe || []).find(e => `emp_${e.id_employe}` === tache.proprietaire)?.nom || 'EMPLOYÉ')}
                            </span>
                          )}
                        </div>
                        {tache.description && <p style={{margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)'}}>{tache.description}</p>}
                        {tache.date_echeance && <span style={{display: 'block', marginTop: '4px', fontSize: '11px', fontWeight: '600', color: getCouleurTache(tache)}}>Échéance : {new Date(tache.date_echeance).toLocaleDateString()}</span>}
                      </div>
                      <button onClick={async () => { await fetch(`${API_URL}/api/taches/${tache.id_tache}`, { method: 'DELETE', headers: getAuthHeaders() }); chargerTout(); }} title="Supprimer" style={{background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, padding: '2px'}}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tachesFaites.length > 0 && (
                <div className="carte scan-carte" style={{marginTop: '16px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', paddingBottom: isTachesTermineesExpanded ? '12px' : '0'}} onClick={() => setIsTachesTermineesExpanded(!isTachesTermineesExpanded)}>
                    <h3 style={{margin: 0, color: 'var(--text-main)', fontSize: '15px'}}>Terminées ({tachesFaites.length})</h3>
                    <span style={{fontSize: '20px', color: 'var(--text-secondary)'}}>{isTachesTermineesExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isTachesTermineesExpanded && (
                    <div className="list-group" style={{opacity: 0.65}}>
                      {tachesFaites.map(tache => (
                        <div key={tache.id_tache} className="list-row" style={{minHeight: '36px', padding: '8px 16px'}}>
                          <span className="list-row-label" style={{textDecoration: 'line-through', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '13px'}}>
                            {tache.titre}
                            {role === 'gerant' && tache.proprietaire && tache.proprietaire !== 'gerant' && (
                              <span style={{fontSize: '9px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '2px 4px', borderRadius: '4px', fontWeight: '600', border: '1px solid #bfdbfe', marginLeft: '8px'}}>
                                {tache.proprietaire === 'salon' ? 'SALON' : ((employesListe || []).find(e => `emp_${e.id_employe}` === tache.proprietaire)?.nom || 'EMP')}
                              </span>
                            )}
                          </span>
                          <button onClick={async () => { await fetch(`${API_URL}/api/taches/${tache.id_tache}/statut`, { method: 'PUT', headers: getAuthHeaders() }); chargerTout(); }} style={{background: 'none', border: 'none', color: 'var(--btn-primary)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', flexShrink: 0}}>Annuler</button>
                          <button onClick={async () => { await fetch(`${API_URL}/api/taches/${tache.id_tache}`, { method: 'DELETE', headers: getAuthHeaders() }); chargerTout(); }} title="Supprimer" style={{background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, padding: '2px', marginLeft: '4px'}}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default ActionsTab;
