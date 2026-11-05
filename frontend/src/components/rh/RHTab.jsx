import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import SvgEmptyState from '../common/SvgEmptyState';
import { renderAvatar } from '../common/Avatar';
import { API_URL } from '../../api/config';

export const RHTab = ({
  isMobile,
  isTablet,
  rhData = [],
  absencesRH = [],
  rhPeriodeHeures,
  setRhPeriodeHeures,
  rhSortBy,
  setRhSortBy,
  showAddEmploye,
  setShowAddEmploye,
  objectifsEquipeListe = [],
  showAddObjectifModal,
  setShowAddObjectifModal,
  chargerObjectifsEquipe,
  newObjectifForm = {},
  setNewObjectifForm,
  creerObjectifEquipe,
  supprimerObjectifEquipe,
  employesListe = [],
  newEmploye = {},
  setNewEmploye,
  handleImageUpload,
  ajouterEmploye,
  statutsEquipe = {},
  employeMenuOuvert,
  setEmployeMenuOuvert,
  setModifEmployeDialog,
  setConfirmDialog,
  supprimerEmploye,
  modifEmployeDialog,
  sauvegarderModifEmploye,
  getAuthHeaders,
  handleFetchError,
  showToast,
  chargerTout,
  setRefreshTrigger,
}) => {
                  const listeRh = Array.isArray(rhData) ? rhData : [];
                  const totalCaEquipe = listeRh.reduce((acc, e) => acc + (parseFloat(e.performances_actuelles?.ca_genere) || 0), 0);
                  const totalPrimesEquipe = listeRh.filter(e => !e.est_gerant).reduce((acc, e) => acc + (parseFloat(e.performances_actuelles?.prime_estimee) || 0), 0);
                  const totalHeuresPeriode = listeRh.filter(e => !e.est_gerant).reduce((acc, e) => {
                      const h = rhPeriodeHeures === 'aujourdhui' ? (e.heures_effectuees?.aujourdhui || 0) : (rhPeriodeHeures === 'semaine' ? (e.heures_effectuees?.semaine || 0) : (e.heures_effectuees?.mois || 0));
                      return acc + (parseFloat(h) || 0);
                  }, 0);
                  const demandesAttente = (absencesRH || []).filter(a => a.statut === 'EN_ATTENTE');

                  return (
                    <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                      {/* EN-TÊTE FIXE RESPONSIVE */}
                      <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '16px', flexDirection: isMobile ? 'column' : 'row', gap: '12px'}}>
                              <div>
                                  <h1 style={{margin: 0}}>Équipe & Ressources Humaines</h1>
                                  <span className="date-subtitle" style={{margin: 0}}></span>
                              </div>

                              <div style={{display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end'}}>
                                  {/* Sélecteur segmenté Période d'heures */}
                                  <div style={{display: 'inline-flex', background: 'var(--bg-card)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-color)'}}>
                                      {[
                                          { id: 'aujourdhui', label: 'Jour' },
                                          { id: 'semaine', label: 'Semaine' },
                                          { id: 'mois', label: 'Mois' }
                                      ].map(p => (
                                          <button
                                              key={p.id}
                                              type="button"
                                              onClick={() => setRhPeriodeHeures(p.id)}
                                              style={{
                                                  border: 'none',
                                                  background: rhPeriodeHeures === p.id ? 'var(--text-main)' : 'transparent',
                                                  color: rhPeriodeHeures === p.id ? 'var(--bg-card)' : 'var(--text-secondary)',
                                                  padding: '6px 11px',
                                                  borderRadius: '7px',
                                                  fontSize: '12px',
                                                  fontWeight: '700',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.15s ease'
                                              }}
                                          >
                                              {p.label}
                                          </button>
                                      ))}
                                  </div>

                                  <select className="input-fournisseur" style={{marginBottom: 0, width: 'auto', padding: '8px 12px', fontSize: '12px', fontWeight: '600', height: '36px'}} value={rhSortBy} onChange={e => setRhSortBy(e.target.value)}>
                                      <option value="ca">Tri : Chiffre d'affaires</option>
                                      <option value="note">Tri : Satisfaction client</option>
                                  </select>

                                  <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                      <ThemeToggle />
                                      <button onClick={() => setShowAddEmploye(!showAddEmploye)} className="btn-action" style={{height: '38px', padding: isMobile ? '0 12px' : '0 16px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px'}} title="Ajouter un collaborateur">
                                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                          {!isMobile && <span>Collaborateur</span>}
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* SECTION GESTION DES OBJECTIFS D'ÉQUIPE (GÉRANT) */}
                      <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: '20px', borderRadius: '18px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: objectifsEquipeListe.length > 0 || showAddObjectifModal ? '16px' : 0 }}>
                              <div>
                                  <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                                      Pilotage & Performance
                                  </span>
                                  <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>
                                      Objectifs Mensuels de l'Équipe
                                  </h3>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <button
                                      type="button"
                                      onClick={chargerObjectifsEquipe}
                                      style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                      title="Actualiser la progression"
                                  >
                                      Actualiser
                                  </button>
                                  <button
                                      type="button"
                                      onClick={() => {
                                          if (!showAddObjectifModal) chargerObjectifsEquipe();
                                          setShowAddObjectifModal(!showAddObjectifModal);
                                      }}
                                      className="btn-action"
                                      style={{ padding: '9px 15px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
                                  >
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                      <span>{showAddObjectifModal ? 'Fermer' : 'Nouvel Objectif'}</span>
                                  </button>
                              </div>
                          </div>

                          {showAddObjectifModal && (
                              <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', marginBottom: objectifsEquipeListe.length > 0 ? '16px' : 0 }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1.4fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                      <div>
                                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Intitulé de l'objectif</label>
                                          <input
                                              type="text"
                                              className="input-fournisseur"
                                              placeholder="Ex: Challenge Revente Soins Profonds"
                                              value={newObjectifForm.titre}
                                              onChange={e => setNewObjectifForm({ ...newObjectifForm, titre: e.target.value })}
                                              style={{ marginBottom: 0 }}
                                          />
                                      </div>
                                      <div>
                                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Indicateur mesuré</label>
                                          <select
                                              className="input-fournisseur"
                                              value={newObjectifForm.type_indicateur}
                                              onChange={e => setNewObjectifForm({ ...newObjectifForm, type_indicateur: e.target.value })}
                                              style={{ marginBottom: 0 }}
                                          >
                                              <option value="TAUX_REVENTE">Taux de revente produits (%)</option>
                                              <option value="CA_TTC">Chiffre d'affaires TTC (€)</option>
                                              <option value="PANIER_MOYEN">Panier moyen TTC (€)</option>
                                              <option value="PRODUITS_VENDUS">Nombre de produits vendus</option>
                                              <option value="NB_CLIENTS">Nombre de clients coiffés</option>
                                              <option value="CAGNOTTE_PRIMES">Palier de commissions (€)</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Valeur cible</label>
                                          <input
                                              type="number"
                                              className="input-fournisseur"
                                              placeholder="Ex: 20"
                                              value={newObjectifForm.valeur_cible}
                                              onChange={e => setNewObjectifForm({ ...newObjectifForm, valeur_cible: e.target.value })}
                                              style={{ marginBottom: 0 }}
                                          />
                                      </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                                      <div>
                                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Collaborateur concerné</label>
                                          <select
                                              className="input-fournisseur"
                                              value={newObjectifForm.id_employe}
                                              onChange={e => setNewObjectifForm({ ...newObjectifForm, id_employe: e.target.value })}
                                              style={{ marginBottom: 0 }}
                                          >
                                              <option value="TOUS">Toute l'équipe (Objectif individuel commun)</option>
                                              {(employesListe || []).map(emp => (
                                                  <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>
                                              ))}
                                          </select>
                                      </div>
                                      <div>
                                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Prime ou récompense (optionnelle)</label>
                                          <input
                                              type="text"
                                              className="input-fournisseur"
                                              placeholder="Ex: Prime de 50 €"
                                              value={newObjectifForm.recompense}
                                              onChange={e => setNewObjectifForm({ ...newObjectifForm, recompense: e.target.value })}
                                              style={{ marginBottom: 0 }}
                                          />
                                      </div>
                                      <button type="button" onClick={creerObjectifEquipe} className="btn-action" style={{ height: '42px', padding: '0 20px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '700' }}>
                                          Valider
                                      </button>
                                  </div>
                              </div>
                          )}

                          {objectifsEquipeListe.length > 0 && (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
                                  {objectifsEquipeListe.map(obj => {
                                      const unite = obj.type_indicateur === 'TAUX_REVENTE' ? '%' : (obj.type_indicateur === 'PRODUITS_VENDUS' || obj.type_indicateur === 'NB_CLIENTS') ? '' : ' €';
                                      return (
                                          <div key={obj.id_objectif} style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                  <div>
                                                      <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)' }}>{obj.titre}</div>
                                                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                          Cible : <strong>{obj.nom_employe || "Toute l'équipe"}</strong>
                                                          {obj.recompense ? ` • Prime : ${obj.recompense}` : ''}
                                                      </div>
                                                  </div>
                                                  <button
                                                      type="button"
                                                      onClick={() => supprimerObjectifEquipe(obj.id_objectif)}
                                                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', lineHeight: 1 }}
                                                      title="Supprimer cet objectif"
                                                  >
                                                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                  </button>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: '800' }}>
                                                  <span style={{ color: 'var(--text-secondary)' }}>Progression</span>
                                                  <span style={{ color: obj.atteint ? 'var(--color-success)' : 'var(--text-main)' }}>
                                                      {obj.valeur_actuelle}{unite} / {obj.valeur_cible}{unite} ({obj.progression}%)
                                                  </span>
                                              </div>
                                              <div style={{ height: '6px', width: '100%', background: 'var(--bg-card)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                                  <div style={{ height: '100%', width: `${obj.progression}%`, background: obj.atteint ? 'var(--color-success)' : 'var(--text-main)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>

                      {/* ZONE DÉFILANTE */}
                      <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>

                      {/* BANDEAU DE SYNTHÈSE RH (4 KPIS RESPONSIVES) */}
                      <div style={{display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px'}}>
                          <div className="carte" style={{padding: '16px 18px', marginBottom: 0}}>
                              <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em'}}>Collaborateurs</span>
                              <div style={{fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: 'var(--text-main)', marginTop: '6px'}}>{listeRh.length}</div>
                              <span style={{fontSize: '11.5px', color: 'var(--text-muted)'}}>{listeRh.filter(e => !e.est_gerant).length} salarié(s) actif(s)</span>
                          </div>
                          <div className="carte" style={{padding: '16px 18px', marginBottom: 0}}>
                              <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em'}}>Volume CA Équipe</span>
                              <div style={{fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: 'var(--text-main)', marginTop: '6px'}}>{totalCaEquipe.toFixed(0)} <span style={{fontSize: '14px', color: 'var(--text-secondary)'}}>€</span></div>
                              <span style={{fontSize: '11.5px', color: 'var(--text-muted)'}}></span>
                          </div>
                          <div className="carte" style={{padding: '16px 18px', marginBottom: 0}}>
                              <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em'}}>Enveloppe Primes</span>
                              <div style={{fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: 'var(--color-success)', marginTop: '6px'}}>{totalPrimesEquipe.toFixed(2)} <span style={{fontSize: '14px'}}>€</span></div>
                              <span style={{fontSize: '11.5px', color: 'var(--text-muted)'}}></span>
                          </div>
                          <div className="carte" style={{padding: '16px 18px', marginBottom: 0}}>
                              <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em'}}>
                                  Heures ({rhPeriodeHeures === 'aujourdhui' ? 'Jour' : rhPeriodeHeures === 'semaine' ? 'Semaine' : 'Mois'})
                              </span>
                              <div style={{fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: 'var(--text-main)', marginTop: '6px'}}>{totalHeuresPeriode.toFixed(1)} <span style={{fontSize: '14px', color: 'var(--text-secondary)'}}>h</span></div>
                              <span style={{fontSize: '11.5px', color: 'var(--text-muted)'}}></span>
                          </div>
                      </div>

                      {/* DEMANDES DE CONGÉS & ABSENCES EN ATTENTE (SANS ÉMOJI) */}
                      {demandesAttente.length > 0 && (
                          <div className="carte scan-carte" style={{ marginBottom: '22px', borderColor: 'var(--color-info)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--bg-info)', color: 'var(--color-info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                      </div>
                                      <div>
                                          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)' }}>Demandes d'absences à arbitrer</h3>
                                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{demandesAttente.length} demande{demandesAttente.length > 1 ? 's' : ''} en attente de décision</span>
                                      </div>
                                  </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                                  {demandesAttente.map(abs => (
                                      <div key={abs.id_absence} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                                          <div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                  <div>
                                                      <strong style={{ display: 'block', fontSize: '14.5px', color: 'var(--text-main)' }}>{abs.nom_employe}</strong>
                                                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Du {new Date(abs.date_debut).toLocaleDateString('fr-FR')} au {new Date(abs.date_fin).toLocaleDateString('fr-FR')}</span>
                                                  </div>
                                                  <span className="badge-discret" style={{ background: 'var(--bg-info)', color: 'var(--color-info)' }}>{(abs.nature_absence || '').replace('_', ' ')}</span>
                                              </div>
                                              {abs.commentaire && <div style={{ fontSize: '12.5px', fontStyle: 'italic', color: 'var(--text-secondary)', padding: '8px 10px', background: 'var(--bg-card)', borderRadius: '8px', marginTop: '8px' }}>"{abs.commentaire}"</div>}
                                          </div>

                                          <div style={{ display: 'flex', gap: '8px' }}>
                                              {abs.fichier_cle_r2 && (
                                                  <button onClick={async () => {
                                                      try {
                                                          const res = await fetch(`${API_URL}/api/rh/absences/${abs.id_absence}/justificatif`, { headers: getAuthHeaders() });
                                                          const data = await handleFetchError(res);
                                                          window.open(data.url, '_blank');
                                                      } catch(e) { showToast("Justificatif indisponible", "error"); }
                                                  }} style={{ flex: 1, padding: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>Pièce jointe</button>
                                              )}
                                              <button onClick={async () => {
                                                  const motif = prompt("Motif du refus (Optionnel) :");
                                                  if (motif !== null) {
                                                      try {
                                                          const res = await fetch(`${API_URL}/api/rh/absences/${abs.id_absence}/decision`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ statut: 'REFUSE', motif_refus: motif }) });
                                                          await handleFetchError(res);
                                                          showToast("Demande refusée", "success");
                                                          chargerTout(); setRefreshTrigger(prev => prev+1);
                                                      } catch(e) { showToast(e.message || "Erreur", "error"); }
                                                  }
                                              }} style={{ flex: 1, padding: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>Refuser</button>
                                              <button onClick={async () => {
                                                  try {
                                                      const res = await fetch(`${API_URL}/api/rh/absences/${abs.id_absence}/decision`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify({ statut: 'VALIDE', motif_refus: null }) });
                                                      const data = await handleFetchError(res);
                                                      showToast("Absence validée", "success");
                                                      if (data.conflits && data.conflits.length > 0) {
                                                          const prenomEmp = abs.nom_employe.split(' ')[0];
                                                          setCancellationRobot({ rdvs: data.conflits, id_employe: abs.id_employe, nom_employe: prenomEmp });
                                                          setSelectedCancelRdvs(data.conflits.map(r => r.id_rdv));
                                                          setCancelMessageTemplate(`Bonjour [Prénom], en raison d'une absence exceptionnelle, votre RDV du [Date] avec ${prenomEmp} ne pourra pas être assuré. Cliquez ici pour reprogrammer : [Lien]. L'équipe du Salon.`);
                                                      } else {
                                                          chargerTout(); setRefreshTrigger(prev => prev+1);
                                                      }
                                                  } catch(e) { showToast(e.message || "Erreur", "error"); }
                                              }} className="btn-action" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>Valider</button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* FORMULAIRE D'AJOUT DE COLLABORATEUR */}
                      {showAddEmploye && (
                          <div className="carte scan-carte" style={{marginBottom: '22px', animation: 'fadeIn 0.25s ease'}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
                                  <h3 style={{margin: 0, fontSize: '16px'}}>Nouveau Collaborateur</h3>
                                  <button type="button" onClick={() => setShowAddEmploye(false)} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}>
                                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                              </div>
                              <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 140px', gap: '12px', marginBottom: '12px'}}>
                                  <input type="text" className="input-fournisseur" placeholder="Prénom" style={{marginBottom: 0}} value={newEmploye.prenom} onChange={(e) => setNewEmploye({...newEmploye, prenom: e.target.value})} />
                                  <input type="text" className="input-fournisseur" placeholder="Nom de famille" style={{marginBottom: 0}} value={newEmploye.nomFamille} onChange={(e) => setNewEmploye({...newEmploye, nomFamille: e.target.value})} />
                                  <input type="password" maxLength="4" className="input-fournisseur" placeholder="PIN (4 chiffres)" style={{marginBottom: 0}} value={newEmploye.code_pin} onChange={(e) => setNewEmploye({...newEmploye, code_pin: e.target.value})} />
                              </div>

                              <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px'}}>
                                  <input type="number" className="input-fournisseur" style={{marginBottom: 0}} placeholder="% Commission Prestations (ex: 10)" value={newEmploye.taux_commission_prestation} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_prestation: e.target.value})} />
                                  <input type="number" className="input-fournisseur" style={{marginBottom: 0}} placeholder="% Commission Produits (ex: 15)" value={newEmploye.taux_commission_produit} onChange={(e) => setNewEmploye({...newEmploye, taux_commission_produit: e.target.value})} />
                              </div>

                              <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', alignItems: 'center'}}>
                                  <select className="input-fournisseur" style={{marginBottom: 0}} value={newEmploye.type_contrat} onChange={(e) => {
                                      const typeC = e.target.value;
                                      let hBase = newEmploye.heures_mensuelles_base;
                                      if (typeC === '35H') hBase = 151.67;
                                      if (typeC === '39H') hBase = 169.00;
                                      setNewEmploye({...newEmploye, type_contrat: typeC, heures_mensuelles_base: hBase});
                                  }}>
                                      <option value="35H">Temps Plein (35h / sem)</option>
                                      <option value="39H">Temps Plein (39h / sem)</option>
                                      <option value="PARTIEL">Temps Partiel</option>
                                      <option value="APPRENTI">Apprenti / Alternant</option>
                                  </select>

                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                      <input type="number" step="0.01" className="input-fournisseur" style={{marginBottom: 0}} value={newEmploye.heures_mensuelles_base} onChange={(e) => setNewEmploye({...newEmploye, heures_mensuelles_base: e.target.value})} />
                                      <span style={{fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>h / mois</span>
                                  </div>

                                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                      <div style={{width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0}}>
                                          {newEmploye.photo_url ? <img src={newEmploye.photo_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                                      </div>
                                      <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={handleImageUpload} style={{fontSize: '11.5px', color: 'var(--text-main)', width: '100%'}} />
                                  </div>
                              </div>

                              <button className="btn-action" onClick={() => {ajouterEmploye(); setShowAddEmploye(false);}} disabled={!newEmploye.prenom || !newEmploye.nomFamille || !newEmploye.code_pin} style={{width: '100%'}}>Enregistrer le collaborateur</button>
                          </div>
                      )}

                      {/* GRILLE DES CARTES COLLABORATEURS RESPONSIVE (PC / TABLETTE / MOBILE) */}
                      {listeRh.length === 0 ? (
                          <div className="empty-state"><SvgEmptyState /><p>Aucun collaborateur enregistré dans ce salon.</p></div>
                      ) : (
                          <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px'}}>
                              {[...listeRh].sort((a, b) => rhSortBy === 'note' ? (b.note_moyenne || 0) - (a.note_moyenne || 0) : (b.performances_actuelles?.ca_genere || 0) - (a.performances_actuelles?.ca_genere || 0)).map(employe => {
                                  const empInfo = (employesListe || []).find(e => e.id_employe === employe.id_employe) || employe;
                                  const statutLiveObj = statutsEquipe[employe.id_employe];
                                  const actionLive = statutLiveObj ? statutLiveObj.action : null;
                                  const enService = actionLive === 'ENTREE' || actionLive === 'PAUSE_FIN';
                                  const enPause = actionLive === 'PAUSE_DEBUT';

                                  const heuresAffichees = rhPeriodeHeures === 'aujourdhui'
                                      ? (employe.heures_effectuees?.aujourdhui || 0)
                                      : rhPeriodeHeures === 'semaine'
                                          ? (employe.heures_effectuees?.semaine || 0)
                                          : (employe.heures_effectuees?.mois || 0);
                                  const baseContrat = parseFloat(employe.heures_mensuelles_base) || 151.67;
                                  const pctContratMois = Math.min(100, Math.round(((employe.heures_effectuees?.mois || 0) / baseContrat) * 100));
                                  const partCaPct = totalCaEquipe > 0 ? Math.round(((employe.performances_actuelles?.ca_genere || 0) / totalCaEquipe) * 100) : 0;

                                  return (
                                      <div key={employe.id_employe} className="carte" style={{padding: 0, marginBottom: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '18px', border: '1px solid var(--border-color)', position: 'relative'}}>
                                          <div>
                                              {/* 1. EN-TÊTE DU COLLABORATEUR */}
                                              <div style={{padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px'}}>
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0}}>
                                                      <div style={{position: 'relative', flexShrink: 0}}>
                                                          { renderAvatar(employe.photo_url, employe.nom, 50) }
                                                          <span
                                                              title={enService ? 'En service' : enPause ? 'En pause' : 'Hors service'}
                                                              style={{
                                                                  position: 'absolute', bottom: '0', right: '0',
                                                                  width: '13px', height: '13px', borderRadius: '50%',
                                                                  background: enService ? 'var(--color-success)' : enPause ? '#f59e0b' : 'var(--border-color)',
                                                                  border: '2px solid var(--bg-card)'
                                                              }}
                                                          />
                                                      </div>

                                                      <div style={{minWidth: 0}}>
                                                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                                                              <h3 style={{margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{employe.nom}</h3>
                                                              <span style={{fontSize: '10.5px', background: employe.est_gerant ? 'var(--text-main)' : 'var(--bg-app)', color: employe.est_gerant ? 'var(--bg-card)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '999px', fontWeight: '700'}}>
                                                                  {employe.est_gerant ? 'Direction' : (employe.type_contrat || '35H')}
                                                              </span>
                                                          </div>

                                                          <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px'}}>{employe.role || 'Collaborateur'}</div>

                                                          <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px'}}>
                                                              {employe.note_moyenne ? (
                                                                  <>
                                                                      <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800'}}>
                                                                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                                                          {employe.note_moyenne} / 5
                                                                      </span>
                                                                      <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>({employe.nb_avis} avis)</span>
                                                                  </>
                                                              ) : (
                                                                  <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>Aucun avis noté</span>
                                                              )}
                                                          </div>
                                                      </div>
                                                  </div>

                                                  {/* Bouton Menu Actions SVG */}
                                                  <div style={{position: 'relative'}}>
                                                      <button onClick={(e) => { e.stopPropagation(); setEmployeMenuOuvert(employeMenuOuvert === employe.id_employe ? null : employe.id_employe); }} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)'}}>
                                                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
                                                      </button>
                                                      {employeMenuOuvert === employe.id_employe && (
                                                          <>
                                                              <div onClick={() => setEmployeMenuOuvert(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                                              <div className="chat-msg-menu" style={{top: '38px', right: 0, bottom: 'auto', zIndex: 999, width: '175px'}}>
                                                                  <button onClick={() => { setModifEmployeDialog({ id_employe: employe.id_employe, nom: employe.nom, code_pin: '', taux_commission_prestation: empInfo.taux_commission_prestation ?? '', taux_commission_produit: empInfo.taux_commission_produit ?? '' }); setEmployeMenuOuvert(null); }}>Modifier le profil</button>
                                                                  <button onClick={() => { setEmployeMenuOuvert(null); setConfirmDialog({ titre: "Supprimer le collaborateur", message: `Voulez-vous vraiment retirer "${employe.nom}" de l'équipe ?`, btnTexte: "Supprimer", action: () => supprimerEmploye(employe.id_employe) }); }} style={{color: 'var(--color-danger)'}}>Supprimer</button>
                                                              </div>
                                                          </>
                                                      )}
                                                  </div>
                                              </div>

                                              {/* 2. CORPS : MÉTRIQUES DE PERFORMANCE & PRIME */}
                                              <div style={{padding: '18px 20px'}}>
                                                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--bg-app)', borderRadius: '12px', padding: '12px', border: '1px solid var(--border-color)', marginBottom: '14px', textAlign: 'center'}}>
                                                      <div>
                                                          <div style={{fontSize: '17px', fontWeight: '800', color: 'var(--text-main)'}}>{employe.performances_actuelles?.clients_coiffes || 0}</div>
                                                          <div style={{fontSize: '10.5px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '2px'}}>Clients</div>
                                                      </div>
                                                      <div style={{borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)'}}>
                                                          <div style={{fontSize: '17px', fontWeight: '800', color: 'var(--text-main)'}}>{employe.performances_actuelles?.produits_vendus || 0}</div>
                                                          <div style={{fontSize: '10.5px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '2px'}}>Reventes</div>
                                                      </div>
                                                      <div>
                                                          <div style={{fontSize: '17px', fontWeight: '800', color: 'var(--text-main)'}}>{(employe.performances_actuelles?.ca_genere || 0).toFixed(0)} €</div>
                                                          <div style={{fontSize: '10.5px', fontWeight: '700', color: 'var(--color-success)', marginTop: '2px'}}>{partCaPct}% du CA</div>
                                                      </div>
                                                  </div>

                                                  {/* Bloc Prime Estimée & Tendance */}
                                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-hover)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '14px'}}>
                                                      <div>
                                                          <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block'}}>Prime sur ventes (HT)</span>
                                                          <span style={{fontSize: '19px', fontWeight: '900', color: 'var(--color-success)'}}>
                                                              {employe.est_gerant ? 'Direction' : `${(employe.performances_actuelles?.prime_estimee || 0).toFixed(2)} €`}
                                                          </span>
                                                      </div>
                                                      {!employe.est_gerant && Array.isArray(employe.historique_primes) && (
                                                          <div style={{width: '90px', height: '34px'}}>
                                                              {dessinerChronogramme(employe.historique_primes)}
                                                          </div>
                                                      )}
                                                  </div>

                                                  {/* Alerte de déblocage PIN si verrouillé */}
                                                  {(() => {
                                                      const estBloqueTemp = empInfo.pin_bloque_jusqua && new Date(empInfo.pin_bloque_jusqua) > new Date();
                                                      const estBloqueDef = Boolean(empInfo.pin_bloque_definitif);
                                                      if (!estBloqueTemp && !estBloqueDef) return null;
                                                      const minRestantes = estBloqueTemp ? Math.max(1, Math.ceil((new Date(empInfo.pin_bloque_jusqua).getTime() - Date.now()) / 60000)) : 0;

                                                      return (
                                                          <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-danger)', border: '1px solid var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '700' }}>
                                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                                  <span>{estBloqueDef ? "PIN bloqué (9 échecs)" : `PIN suspendu (${minRestantes} min)`}</span>
                                                              </div>
                                                              <button type="button" onClick={() => debloquerPinEmploye(employe.id_employe)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-danger)', background: 'var(--bg-card)', color: 'var(--color-danger)', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}>
                                                                  Débloquer
                                                              </button>
                                                          </div>
                                                      );
                                                  })()}

                                                  {/* Module Suivi des Heures & Ajustement */}
                                                  <div style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px'}}>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                                                          <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                              Heures ({rhPeriodeHeures === 'aujourdhui' ? "Aujourd'hui" : rhPeriodeHeures === 'semaine' ? 'Semaine' : 'Mois'})
                                                          </span>
                                                          <span style={{fontSize: '14px', fontWeight: '900', color: 'var(--text-main)'}}>{heuresAffichees} h</span>
                                                      </div>

                                                      {!employe.est_gerant && (
                                                          <>
                                                              <div style={{height: '6px', background: 'var(--bg-card)', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px', border: '1px solid var(--border-color)'}}>
                                                                  <div style={{width: `${pctContratMois}%`, height: '100%', background: 'var(--text-main)', borderRadius: '999px', transition: 'width 0.3s ease'}} />
                                                              </div>
                                                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '11px', color: 'var(--text-muted)'}}>
                                                                  <span>Base contrat : {baseContrat}h / mois</span>
                                                                  {employe.heures_effectuees?.ajustements_mois !== 0 && (
                                                                      <span style={{color: 'var(--color-success)', fontWeight: '700'}}>
                                                                          Ajusté : {employe.heures_effectuees?.ajustements_mois > 0 ? `+${employe.heures_effectuees?.ajustements_mois}` : employe.heures_effectuees?.ajustements_mois}h
                                                                      </span>
                                                                  )}
                                                              </div>

                                                              <div style={{display: 'flex', gap: '8px'}}>
                                                                  <input type="number" step="0.5" id={`heures_supp_${employe.id_employe}`} placeholder="Ajuster heures (ex: +2 ou -1.5)" className="input-fournisseur" style={{flex: 1, marginBottom: 0, padding: '7px 10px', fontSize: '12px', background: 'var(--bg-card)'}} />
                                                                  <button onClick={async () => {
                                                                      const input = document.getElementById(`heures_supp_${employe.id_employe}`);
                                                                      const hAjust = parseFloat(input.value);
                                                                      if (!hAjust) return showToast("Saisissez un nombre d'heures.", "error");
                                                                      try {
                                                                          const moisStr = new Date().toISOString().substring(0, 7);
                                                                          const res = await fetch(`${API_URL}/api/rh/ajustements`, {
                                                                              method: 'POST', headers: getAuthHeaders(true),
                                                                              body: JSON.stringify({ id_employe: employe.id_employe, mois_annee: moisStr, heures_ajoutees: hAjust, motif: 'Ajustement manuel' })
                                                                          });
                                                                          if (res.ok) { showToast("Ajustement enregistré !", "success"); input.value = ''; chargerTout(); }
                                                                          else showToast("Erreur d'ajout", "error");
                                                                      } catch (e) { showToast("Erreur serveur", "error"); }
                                                                  }} style={{background: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', padding: '0 14px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px'}}>Valider</button>
                                                              </div>
                                                          </>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>

                                          {/* 3. TIROIR DES DERNIERS AVIS CLIENTS */}
                                          {employe.derniers_avis && employe.derniers_avis.length > 0 && (
                                              <div style={{background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', padding: '10px 20px'}}>
                                                  <button onClick={() => setRhAvisExpanded({...rhAvisExpanded, [employe.id_employe]: !rhAvisExpanded[employe.id_employe]})} style={{background: 'none', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '700', padding: '4px 0'}}>
                                                      <span>{rhAvisExpanded[employe.id_employe] ? 'Masquer les verbatims clients' : `Voir les ${employe.derniers_avis.length} derniers avis`}</span>
                                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{transform: rhAvisExpanded[employe.id_employe] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease'}}><polyline points="6 9 12 15 18 9"/></svg>
                                                  </button>
                                                  {rhAvisExpanded[employe.id_employe] && (
                                                      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', paddingBottom: '6px'}}>
                                                          {employe.derniers_avis.map((avis, i) => {
                                                              const isPositif = avis.note >= 4;
                                                              return (
                                                                  <div key={i} style={{background: isPositif ? 'var(--bg-card)' : 'var(--bg-danger)', borderLeft: `3px solid ${isPositif ? 'var(--color-success)' : 'var(--color-danger)'}`, padding: '10px 12px', borderRadius: '8px', fontSize: '12px', textAlign: 'left', boxShadow: 'var(--shadow-sm)'}}>
                                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                                                          <strong style={{color: isPositif ? 'var(--text-main)' : 'var(--color-danger)'}}>{avis.prenom || 'Client'}</strong>
                                                                          <span style={{color: '#d97706', fontWeight: '800', fontSize: '11.5px'}}>{avis.note} / 5</span>
                                                                      </div>
                                                                      {avis.commentaire && <span style={{color: isPositif ? 'var(--text-secondary)' : 'var(--color-danger)', fontStyle: 'italic', lineHeight: '1.4', display: 'block'}}>"{avis.commentaire}"</span>}
                                                                  </div>
                                                              );
                                                          })}
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}

                      {modifEmployeDialog && (
                          <div className="modal-overlay">
                              <div className="modal-content">
                                  <div className="modal-header">
                                      <h3 style={{margin: 0, fontSize: '18px'}}>Modifier {modifEmployeDialog.nom.split(' ')[0]}</h3>
                                      <button className="modal-close-btn" onClick={() => setModifEmployeDialog(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                                  </div>
                                  <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                                      <input type="text" className="input-fournisseur" placeholder="Prénom" style={{flex: 1}} value={(modifEmployeDialog.nom || '').split(' ')[0] || ''} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, nom: `${e.target.value} ${(modifEmployeDialog.nom || '').split(' ').slice(1).join(' ')}`.trim()})} />
                                      <input type="text" className="input-fournisseur" placeholder="Nom de famille" style={{flex: 1}} value={(modifEmployeDialog.nom || '').split(' ').slice(1).join(' ') || ''} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, nom: `${(modifEmployeDialog.nom || '').split(' ')[0] || ''} ${e.target.value}`.trim()})} />
                                  </div>
                                  <input type="password" maxLength="4" className="input-fournisseur" placeholder="Nouveau PIN (laisser vide pour ne pas changer)" value={modifEmployeDialog.code_pin} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, code_pin: e.target.value})} style={{marginBottom: '12px'}} />
                                  <div style={{display: 'flex', gap: '12px', marginBottom: '24px'}}>
                                      <input type="number" className="input-fournisseur" placeholder="% Com. Prestations" value={modifEmployeDialog.taux_commission_prestation} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, taux_commission_prestation: e.target.value})} />
                                      <input type="number" className="input-fournisseur" placeholder="% Com. Produits" value={modifEmployeDialog.taux_commission_produit} onChange={(e) => setModifEmployeDialog({...modifEmployeDialog, taux_commission_produit: e.target.value})} />
                                  </div>
                                  <div style={{display: 'flex', gap: '12px'}}>
                                      <button onClick={() => setModifEmployeDialog(null)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer'}}>Annuler</button>
                                      <button onClick={sauvegarderModifEmploye} className="btn-action" style={{flex: 2}} disabled={!modifEmployeDialog.nom}>Enregistrer</button>
                                  </div>
                              </div>
                          </div>
                      )}
                      </div> {/* FIN ZONE DÉFILANTE */}
                    </div>
                  );


};

export default RHTab;
