import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import SvgEmptyState from '../common/SvgEmptyState';
import { API_URL } from '../../api/config';

export const AdminTab = ({
  isMobile,
  isTablet,
  role,
  historiqueData = [],
  mouvementsCaisse = [],
  demanderZDeCaisse,
  clotureFaiteAujourdhui,
  telechargerBilanJour,
  statutMoisPrecedent,
  previsualiserBrouillon,
  setShowModalValidationCompta,
  chargerMouvementsCaisse,
  setShowMouvementModal,
  erreurAnalyseIA,
  setErreurAnalyseIA,
  setShowSaisieManuelleFacture,
  aLeNiveau,
  handleUploadFactureManuel,
  isUploadingFacture,
  progressionBatch,
  setShowPricingModal,
  declencherExport,
  declencherExportFEC,
  lancerAuditNF525,
  expandedYear,
  setExpandedYear,
  expandedMonth,
  setExpandedMonth,
  showToast,
}) => {
  return (
    <>
              {(role === 'gerant' || role === 'salon') && (() => {
                  const estGerant = role === 'gerant';
                  const anneeCouranteStr = new Date().getFullYear().toString();
                  const moisNomsListe = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
                  const nomMoisCourant = moisNomsListe[new Date().getMonth()];

                  const anneeEnCoursObj = (historiqueData || []).find(a => String(a.annee) === anneeCouranteStr) || (historiqueData || [])[0];
                  const moisEnCoursObj = (anneeEnCoursObj?.mois || []).find(m => m.nom === nomMoisCourant) || (anneeEnCoursObj?.mois || [])[0];
                  const caMoisCourant = moisEnCoursObj ? (parseFloat(moisEnCoursObj.total_mensuel) || 0) : 0;
                  const nbJoursActifsMois = moisEnCoursObj?.jours ? moisEnCoursObj.jours.length : 0;

                  const soldePetiteCaisseJour = (mouvementsCaisse || []).reduce((acc, m) => {
                      const val = parseFloat(m.montant) || 0;
                      return m.type_mouvement === 'ENTREE' ? acc + val : acc - val;
                  }, 0);

                  return (
                    <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                      {/* EN-TÊTE FIXE RESPONSIVE */}
                      <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
                              <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                      <h1 style={{ margin: 0 }}>{estGerant ? 'Comptabilité & Conformité' : 'Clôture & Caisse'}</h1>
                                      <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                                          background: 'var(--bg-success)', color: 'var(--color-success)'
                                      }}>
                                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                                          CERTIFIÉ NF525
                                      </span>
                                  </div>
                                  <span className="date-subtitle" style={{ margin: '2px 0 0 0', display: 'block' }}>
                                      {estGerant ? '' : ''}
                                  </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <ThemeToggle />
                                  <button
                                      type="button"
                                      onClick={demanderZDeCaisse}
                                      className="btn-action"
                                      style={{
                                          padding: isMobile ? '9px 14px' : '11px 18px',
                                          borderRadius: '10px',
                                          fontSize: '13px',
                                          fontWeight: '700',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '7px',
                                          background: clotureFaiteAujourdhui ? 'var(--bg-card)' : 'var(--text-main)',
                                          color: clotureFaiteAujourdhui ? 'var(--text-main)' : 'var(--bg-card)',
                                          border: '1px solid var(--border-color)'
                                      }}
                                  >
                                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                      <span>{clotureFaiteAujourdhui ? 'Z du jour scellé' : 'Clôturer la caisse (Z)'}</span>
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* ZONE DÉFILANTE */}
                      <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>

                      {/* 1. BANDEAU DE SYNTHÈSE COMPTABLE (4 KPIS RESPONSIVES) */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : `repeat(${estGerant ? 4 : 2}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
                          {estGerant && (
                              <div className="carte" style={{ padding: '16px 18px', marginBottom: 0 }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      CA {moisEnCoursObj?.nom || nomMoisCourant}
                                  </span>
                                  <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: 'var(--text-main)', marginTop: '6px' }}>
                                      {caMoisCourant.toFixed(2)} <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>€</span>
                                  </div>
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}></span>
                              </div>
                          )}

                          <div className="carte" style={{ padding: '16px 18px', marginBottom: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clôture Z du Jour</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                  <span style={{
                                      width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                      background: clotureFaiteAujourdhui ? 'var(--color-success)' : '#f59e0b'
                                  }} />
                                  <span style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '800', color: 'var(--text-main)' }}>
                                      {clotureFaiteAujourdhui ? 'Scellée' : 'Ouverte'}
                                  </span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                                  {clotureFaiteAujourdhui ? '' : ''}
                              </span>
                          </div>

                          <div className="carte" style={{ padding: '16px 18px', marginBottom: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Flux Espèces (Jour)</span>
                              <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: '800', color: soldePetiteCaisseJour > 0 ? 'var(--color-success)' : soldePetiteCaisseJour < 0 ? 'var(--color-danger)' : 'var(--text-main)', marginTop: '6px' }}>
                                  {soldePetiteCaisseJour > 0 ? '+' : ''}{soldePetiteCaisseJour.toFixed(2)} <span style={{ fontSize: '14px' }}>€</span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}></span>
                          </div>

                          {estGerant && (
                              <div className="carte" style={{ padding: '16px 18px', marginBottom: 0 }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      Liasse {statutMoisPrecedent?.libelle || 'Mois Préc.'}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                      <span style={{
                                          padding: '3px 9px', borderRadius: '999px', fontSize: '11.5px', fontWeight: '800',
                                          background: statutMoisPrecedent?.valide ? 'var(--bg-success)' : 'var(--bg-info)',
                                          color: statutMoisPrecedent?.valide ? 'var(--color-success)' : 'var(--color-info)'
                                      }}>
                                          {statutMoisPrecedent?.valide ? 'Signée & Transmise' : 'À signer'}
                                      </span>
                                  </div>
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                                      {statutMoisPrecedent?.valide ? '' : 'En attente de validation PIN'}
                                  </span>
                              </div>
                          )}
                      </div>

                      {/* 2. BANDEAU VALIDATION LIASSE MENSUELLE (GÉRANT UNIQUEMENT) */}
                      {estGerant && statutMoisPrecedent && (
                          <div className="carte" style={{
                              marginBottom: '20px',
                              padding: isMobile ? '18px' : '22px 24px',
                              borderRadius: '18px',
                              border: `1.5px solid ${statutMoisPrecedent.valide ? 'var(--color-success)' : 'var(--border-color)'}`,
                              background: 'var(--bg-card)'
                          }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                      <div style={{
                                          width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                                          background: statutMoisPrecedent.valide ? 'var(--bg-success)' : 'var(--bg-app)',
                                          color: statutMoisPrecedent.valide ? 'var(--color-success)' : 'var(--text-main)',
                                          border: '1px solid var(--border-color)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                                      }}>
                                          {statutMoisPrecedent.valide ? (
                                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                          ) : (
                                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                          )}
                                      </div>
                                      <div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', color: 'var(--text-main)' }}>
                                                  Clôture Mensuelle — {statutMoisPrecedent.libelle}
                                              </h3>
                                              <span className="badge-discret" style={{ background: statutMoisPrecedent.valide ? 'var(--bg-success)' : 'var(--bg-info)', color: statutMoisPrecedent.valide ? 'var(--color-success)' : 'var(--color-info)' }}>
                                                  {statutMoisPrecedent.valide ? 'CERTIFIÉ NF525' : 'SIGNATURE REQUISE'}
                                              </span>
                                          </div>
                                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                              {statutMoisPrecedent.valide
                                                  ? `Liasse certifiée et scellée le ${new Date(statutMoisPrecedent.infos.date_validation).toLocaleDateString('fr-FR')} par ${statutMoisPrecedent.infos.valide_par}.`
                                                  : "Contrôlez le brouillon PDF de votre mois écoulé puis signez avec votre code PIN pour transmettre la liasse et le FEC à votre expert-comptable."}
                                          </p>
                                      </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                                      <button onClick={previsualiserBrouillon} className="btn-action" style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px 16px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '7px', flex: isMobile ? 1 : 'initial' }}>
                                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                          <span>{statutMoisPrecedent.valide ? 'Liasse PDF' : 'Brouillon PDF'}</span>
                                      </button>
                                      {!statutMoisPrecedent.valide && (
                                          <button onClick={() => setShowModalValidationCompta(true)} className="btn-action" style={{ padding: '10px 18px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '7px', flex: isMobile ? 1 : 'initial' }}>
                                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                              <span>Valider & Signer</span>
                                          </button>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* 3. GRILLE OPÉRATIONNELLE 2 COLONNES : PETITE CAISSE & FACTURES FOURNISSEURS */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '18px', marginBottom: '20px', alignItems: 'stretch' }}>
                          {/* COLONNE GAUCHE : PETITE CAISSE (MOUVEMENTS ESPÈCES DU JOUR) */}
                          <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', flexShrink: 0 }}>
                                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                                          </div>
                                          <div>
                                              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', color: 'var(--text-main)' }}>Petite Caisse (Espèces)</h3>
                                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                          </div>
                                      </div>

                                      <button
                                          type="button"
                                          onClick={() => { chargerMouvementsCaisse(); setShowMouvementModal(true); }}
                                          style={{
                                              background: 'var(--text-main)', color: 'var(--bg-card)', border: 'none',
                                              padding: '8px 13px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer',
                                              display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', flexShrink: 0
                                          }}
                                      >
                                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                          <span>Mouvement</span>
                                      </button>
                                  </div>

                                  {(mouvementsCaisse || []).length === 0 ? (
                                      <div style={{ background: 'var(--bg-app)', borderRadius: '12px', padding: '22px 16px', textAlign: 'center', border: '1px dashed var(--border-color)' }}>
                                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: '500' }}>Aucun mouvement d'espèces hors vente enregistré aujourd'hui.</span>
                                      </div>
                                  ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '210px', overflowY: 'auto', paddingRight: '4px' }}>
                                          {mouvementsCaisse.map(m => {
                                              const isEntree = m.type_mouvement === 'ENTREE';
                                              return (
                                                  <div key={m.id_mouvement} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-app)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: isEntree ? 'var(--bg-success)' : 'var(--bg-danger)', color: isEntree ? 'var(--color-success)' : 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                              {isEntree ? (
                                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                                                              ) : (
                                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                                                              )}
                                                          </div>
                                                          <div style={{ minWidth: 0 }}>
                                                              <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.motif}</div>
                                                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                                  {new Date(m.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {m.nom_employe || 'Gérant'}
                                                              </div>
                                                          </div>
                                                      </div>
                                                      <strong style={{ fontSize: '13.5px', fontWeight: '800', color: isEntree ? 'var(--color-success)' : 'var(--color-danger)', flexShrink: 0, marginLeft: '8px' }}>
                                                          {isEntree ? '+' : '-'}{parseFloat(m.montant).toFixed(2)} €
                                                      </strong>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  )}
                              </div>
                          </div>

                          {/* COLONNE DROITE : FACTURES & DÉPENSES FOURNISSEURS (MANUEL + SCAN IA) */}
                          <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                      <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', flexShrink: 0 }}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                      </div>
                                      <div>
                                          <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', color: 'var(--text-main)' }}>Achats & Factures Fournisseurs</h3>
                                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                      </div>
                                  </div>

                                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                                      
                                  </p>

                                  {erreurAnalyseIA && (
                                      <div style={{ background: 'var(--bg-danger)', border: '1px solid var(--color-danger)', borderRadius: '10px', marginBottom: '14px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                          <div style={{ color: 'var(--color-danger)', fontSize: '12px', lineHeight: 1.4 }}>
                                              <strong style={{ display: 'block' }}>Document non reconnu</strong>
                                              <span>{erreurAnalyseIA}</span>
                                          </div>
                                          <button onClick={() => setErreurAnalyseIA(null)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px' }}>✕</button>
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                                      <button
                                          type="button"
                                          onClick={() => setShowSaisieManuelleFacture(true)}
                                          className="btn-action"
                                          style={{ padding: '12px 14px', fontSize: '12.5px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                      >
                                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                          <span>Saisie Manuelle</span>
                                      </button>

                                      {aLeNiveau('PREMIUM') ? (
                                          <>
                                              <input
                                                  type="file"
                                                  id={`upload-facture-compta-${role}`}
                                                  accept="application/pdf, image/jpeg, image/png, image/jpg"
                                                  multiple
                                                  style={{ display: 'none' }}
                                                  onChange={handleUploadFactureManuel}
                                              />
                                              <button
                                                  type="button"
                                                  onClick={() => document.getElementById(`upload-facture-compta-${role}`).click()}
                                                  disabled={isUploadingFacture}
                                                  className="btn-action"
                                                  style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px 14px', fontSize: '12.5px', borderRadius: '10px', opacity: isUploadingFacture ? 0.5 : 1, cursor: isUploadingFacture ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                              >
                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                                                  <span>
                                                      {isUploadingFacture
                                                          ? (progressionBatch.total > 1 ? `Scan IA (${progressionBatch.actuel}/${progressionBatch.total})...` : 'Scan IA...')
                                                          : 'Scan Facture (IA)'}
                                                  </span>
                                              </button>
                                          </>
                                      ) : (
                                          <button
                                              type="button"
                                              onClick={() => setShowPricingModal(true)}
                                              style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: 0.7 }}
                                          >
                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                              <span>Scan IA (Premium)</span>
                                          </button>
                                      )}
                                  </div>

                                  {isUploadingFacture && (
                                      <div style={{ marginTop: '12px', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                              <span>
                                                  {progressionBatch.total > 1
                                                      ? `Analyse IA (${progressionBatch.actuel}/${progressionBatch.total})...`
                                                      : 'Analyse et extraction IA en cours...'}
                                              </span>
                                              <span style={{ color: 'var(--text-main)' }}>
                                                  {progressionBatch.total > 1 ? `${Math.round((progressionBatch.actuel / progressionBatch.total) * 100)}%` : 'Patientez...'}
                                              </span>
                                          </div>
                                          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--bg-card)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                              <div style={{ height: '100%', width: progressionBatch.total > 1 ? `${Math.max(15, Math.round((progressionBatch.actuel / progressionBatch.total) * 100))}%` : '70%', backgroundColor: 'var(--btn-primary)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* 4. CENTRE D'EXPORTS LÉGAUX & CONTRÔLE FISCAL NF525 (GÉRANT) */}
                      {estGerant && (
                          <>
                              <div className="section-titre" style={{ marginTop: '8px', marginBottom: '12px' }}>
                                  Exports Réglementaires & Contrôle Fiscal (Norme NF525)
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
                                  {/* Carte Export 1 : Liasse Mensuelle PDF */}
                                  <div className="carte" style={{ padding: '18px 20px', marginBottom: 0, borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                                      <div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
                                              </div>
                                              <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>PDF A4</span>
                                          </div>
                                          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Liasse Comptable Mensuelle</h3>
                                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                             
                                          </p>
                                      </div>
                                      <button type="button" onClick={declencherExport} className="btn-action" style={{ width: '100%', padding: '10px', fontSize: '12.5px', borderRadius: '10px' }}>
                                          Exporter la Liasse PDF
                                      </button>
                                  </div>

                                  {/* Carte Export 2 : Fichier des Écritures Comptables (FEC) */}
                                  <div className="carte" style={{ padding: '18px 20px', marginBottom: 0, borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                                      <div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                              </div>
                                              <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Art. A.47 A-1 LPF</span>
                                          </div>
                                          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Fichier des Écritures (FEC)</h3>
                                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                             
                                          </p>
                                      </div>
                                      <button type="button" onClick={declencherExportFEC} className="btn-action" style={{ width: '100%', padding: '10px', fontSize: '12.5px', borderRadius: '10px', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                          Télécharger le fichier FEC
                                      </button>
                                  </div>

                                  {/* Carte Export 3 : Audit Cryptographique NF525 */}
                                  <div className="carte" style={{ padding: '18px 20px', marginBottom: 0, borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                                      <div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-success)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                                              </div>
                                              <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-success)', color: 'var(--color-success)' }}>SHA-256</span>
                                          </div>
                                          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Audit d'Intégrité NF525</h3>
                                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                              
                                          </p>
                                      </div>
                                      <button type="button" onClick={lancerAuditNF525} className="btn-action" style={{ width: '100%', padding: '10px', fontSize: '12.5px', borderRadius: '10px', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                          Exécuter l'audit NF525
                                      </button>
                                  </div>
                              </div>

                              {/* 5. REGISTRE HISTORIQUE DES BILANS JOURNALIERS (Z) */}
                              <div className="section-titre" style={{ marginBottom: '12px' }}>
                                  Registre des Clôtures Journalières (Z) & Archives PDF
                              </div>

                              {(historiqueData || []).length === 0 ? (
                                  <div className="empty-state">
                                      <SvgEmptyState />
                                      <p>Aucune écriture comptable enregistrée pour le moment.</p>
                                  </div>
                              ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                      {(historiqueData || []).map((anneeData) => {
                                          const isYearOpen = expandedYear === anneeData.annee;
                                          const totalAnnee = (anneeData.mois || []).reduce((acc, m) => acc + (parseFloat(m.total_mensuel) || 0), 0);

                                          return (
                                              <div key={anneeData.annee} className="carte" style={{ padding: 0, marginBottom: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                                  <button
                                                      type="button"
                                                      onClick={() => setExpandedYear(isYearOpen ? null : anneeData.annee)}
                                                      style={{
                                                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                          padding: '16px 20px', background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontFamily: 'inherit'
                                                      }}
                                                  >
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                          <span style={{ display: 'flex', width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', transform: isYearOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>
                                                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                                          </span>
                                                          <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Exercice {anneeData.annee}</span>
                                                          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border-color)', fontWeight: '600' }}>
                                                              {(anneeData.mois || []).length} mois
                                                          </span>
                                                      </div>
                                                      <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>
                                                          {totalAnnee.toFixed(2)} €
                                                      </span>
                                                  </button>

                                                  {isYearOpen && (
                                                      <div style={{ padding: '0 16px 16px 16px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '14px' }}>
                                                          {(anneeData.mois || []).map((moisData) => {
                                                              const isMonthOpen = expandedMonth === moisData.nom;
                                                              const nbJours = (moisData.jours || []).length;

                                                              return (
                                                                  <div key={moisData.nom} style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                                                      <button
                                                                          type="button"
                                                                          onClick={() => setExpandedMonth(isMonthOpen ? null : moisData.nom)}
                                                                          style={{
                                                                              display: 'flex', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center',
                                                                              cursor: 'pointer', padding: '14px 16px', background: 'none', border: 'none', fontFamily: 'inherit'
                                                                          }}
                                                                      >
                                                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                              <span style={{ display: 'flex', width: '14px', height: '14px', color: 'var(--text-secondary)', transform: isMonthOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                                                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                                                              </span>
                                                                              <span style={{ fontWeight: '700', fontSize: '14.5px', color: 'var(--text-main)' }}>{moisData.nom}</span>
                                                                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>• {nbJours} jour{nbJours > 1 ? 's' : ''}</span>
                                                                          </div>
                                                                          <span style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--text-main)' }}>
                                                                              {moisData.total_mensuel?.toFixed(2) || '0.00'} €
                                                                          </span>
                                                                      </button>

                                                                      {isMonthOpen && (
                                                                          <div style={{ padding: '12px 14px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                              {(moisData.jours || []).map(jour => (
                                                                                  <div
                                                                                      key={jour.date_brute}
                                                                                      onClick={() => telechargerBilanJour(jour.date_brute)}
                                                                                      className="hover-bg-card"
                                                                                      style={{
                                                                                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                                          padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-card)',
                                                                                          border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.15s ease'
                                                                                      }}
                                                                                      title="Télécharger le Bilan Journalier Z (PDF)"
                                                                                  >
                                                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                                                                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                                                          </div>
                                                                                          <div>
                                                                                              <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '13.5px', display: 'block' }}>Journée du {jour.date_formattee}</span>
                                                                                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bilan Journalier Z • Certifié NF525</span>
                                                                                          </div>
                                                                                      </div>

                                                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                                          <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '14.5px' }}>{jour.total?.toFixed(2) || '0.00'} €</span>
                                                                                          <span style={{
                                                                                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                                              padding: '5px 10px', borderRadius: '8px', background: 'var(--bg-app)',
                                                                                              border: '1px solid var(--border-color)', color: 'var(--text-main)',
                                                                                              fontSize: '11.5px', fontWeight: '700'
                                                                                          }}>
                                                                                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/></svg>
                                                                                              PDF
                                                                                          </span>
                                                                                      </div>
                                                                                  </div>
                                                                              ))}
                                                                          </div>
                                                                      )}
                                                                  </div>
                                                              );
                                                          })}
                                                      </div>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </>
                      )}

                      </div> {/* FIN ZONE DÉFILANTE */}
                    </div>
                  );
              })()}

              {/* VUE COMPTA : EMPLOYÉ (HISTORIQUE PERSONNEL MODERNISÉ) */}
              {role === 'employe' && (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div>
                          <h1 style={{ margin: 0 }}>Mon Activité & Relevés</h1>
                          <span className="date-subtitle" style={{ margin: 0 }}></span>
                      </div>
                      <ThemeToggle />
                  </div>
                  {(historiqueData || []).length === 0 ? (
                      <div className="empty-state"><SvgEmptyState /><p>Aucune vente enregistrée pour le moment.</p></div>
                  ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {(historiqueData || []).map((anneeData) => (
                              <div key={anneeData.annee} className="carte" style={{ padding: 0, marginBottom: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                  <button type="button" onClick={() => setExpandedYear(expandedYear === anneeData.annee ? null : anneeData.annee)} className="list-row" style={{ fontWeight: '700', width: '100%', padding: '16px 20px' }}>
                                      <span className="list-row-icon" style={{ transform: expandedYear === anneeData.annee ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                      </span>
                                      <span className="list-row-label" style={{ fontWeight: '800', fontSize: '15px' }}>Exercice {anneeData.annee}</span>
                                  </button>
                                  {expandedYear === anneeData.annee && (
                                      <div style={{ padding: '0 14px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-app)' }}>
                                          {(anneeData.mois || []).map((moisData) => (
                                              <div key={moisData.nom} style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', marginTop: '10px' }}>
                                                  <button type="button" onClick={() => setExpandedMonth(expandedMonth === moisData.nom ? null : moisData.nom)} style={{ display: 'flex', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '13px 16px', background: 'none', border: 'none', fontFamily: 'inherit' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', color: 'var(--text-main)' }}>
                                                          <span style={{ display: 'flex', width: '14px', height: '14px', color: 'var(--text-secondary)', transform: expandedMonth === moisData.nom ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                                                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                                          </span>
                                                          {moisData.nom}
                                                      </div>
                                                      <span style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--text-main)' }}>{moisData.total_mensuel?.toFixed(2) || '0.00'} €</span>
                                                  </button>
                                                  {expandedMonth === moisData.nom && (
                                                      <div style={{ padding: '10px 14px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                          {(moisData.jours || []).map(jour => (
                                                              <div key={jour.date_brute} onClick={() => telechargerBilanJour(jour.date_brute)} className="hover-bg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                      <span style={{ display: 'flex', width: '16px', height: '16px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                                                                      <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '13.5px' }}>Relevé du {jour.date_formattee}</span>
                                                                  </div>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                      <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '14px' }}>{jour.total?.toFixed(2) || '0.00'} €</span>
                                                                      <span style={{ display: 'flex', width: '15px', height: '15px', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/></svg></span>
                                                                  </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}
                </div>
              )}

              

    </>
  );
};

export default AdminTab;
