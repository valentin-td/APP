import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import SvgEmptyState from '../common/SvgEmptyState';
import { normaliserEtapeUI } from '../../utils/protocoles';
import { formatPortion, nettoyerTexteRecherche } from '../../utils/text';

const TAGS_DISPONIBLES = ['Coloration', 'Soin', 'Technique', 'Barbier', 'Coupe'];

export const ProtocolesTab = ({
  isMobile,
  showAddPrestation,
  setShowAddPrestation,
  modeEditionProtocole,
  setModeEditionProtocole,
  nouveauProtocole = {},
  setNouveauProtocole,
  etapeTemp = {},
  setEtapeTemp,
  ingredientTemp = {},
  setIngredientTemp,
  rechercheProtocole,
  setRechercheProtocole,
  newArticle = {},
  setNewArticle,
  creerArticle,
  ajouterArticle,
  catalogueListe = [],
  protocolesListe = [],
  calculerIngredientsTotauxProtocole,
  toggleTag,
  ajouterTagProtocole,
  supprimerTagProtocole,
  supprimerProtocole,
  modifierChampEtapeExistante,
  deplacerEtapeRecette,
  supprimerEtapeRecette,
  ajouterIngredientSurEtapeExistante,
  supprimerIngredientDuneEtape,
  ajouterIngredientBrouillonEtape,
  ajouterEtapeRecette,
  uploaderPhotoSurEtape,
  uploadMediaProtocole,
  creerProtocole,
  setModifNomDialog,
  supprimerArticle,
  showToast,
}) => {
  return (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px'}}>
                          <div>
                              <h1 style={{margin: 0}}>L'Académie</h1>
                              <span className="date-subtitle" style={{margin: 0}}></span>
                          </div>
                          <div style={{display: 'flex', gap: isMobile ? '8px' : '12px', alignItems: 'center'}}>
                              <ThemeToggle />
                              <button onClick={() => setShowAddPrestation(!showAddPrestation)} className="btn-action" style={{width: '40px', height: '40px', flexShrink: 0, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}} title="Nouvelle Prestation (Catalogue)">
                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              </button>
                              {!modeEditionProtocole && (
                                  <button
                                      onClick={() => {
                                          setNouveauProtocole({ nom_prestation: '', etapes: [], medias: { avant: null, pendant: null, apres: null }, tags: [], ingredients: [], temps_nettoyage_minutes: 5, a_temps_nettoyage: false });
                                          setEtapeTemp({ titre: '', description: '', texte: '', duree_minutes: '', timer_min: '', photo_url: null, ingredients: [] });
                                          setIngredientTemp({ id_article: '', quantite_necessaire: '1', proportion: '' });
                                          setModeEditionProtocole('NEW');
                                      }}
                                      className="btn-action"
                                      style={{ whiteSpace: 'nowrap', flexShrink: 0, padding: isMobile ? '9px 14px' : '11px 18px', fontSize: isMobile ? '12.5px' : '13.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                  >
                                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                                      <span>{isMobile ? 'Nouveau Tuto' : 'Créer un Tutoriel'}</span>
                                  </button>
                              )}
                          </div>
                      </div>
                      {!modeEditionProtocole && (
                          <input type="text" className="input-fournisseur" placeholder="Rechercher un tutoriel ou protocole (ex: Balayage, Patine, Kératine)..." value={rechercheProtocole} onChange={(e) => setRechercheProtocole(e.target.value)} style={{marginBottom: '16px', fontSize: '14px', width: '100%', boxSizing: 'border-box'}}/>
                      )}
                  </div>

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>

                  {showAddPrestation && (
                      <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                          <h3 style={{marginTop: 0, marginBottom: '14px', fontSize: '16px'}}>Nouvelle Prestation (Catalogue)</h3>
                          <div style={{display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap'}}>
                              <input type="text" className="input-fournisseur" style={{flex: '2 1 200px', marginBottom: 0}} placeholder="Nom de la prestation (ex: Balayage Signature)" value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value, type_article: 'PRESTATION'})} />
                              <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{flex: '1 1 100px', marginBottom: 0}} value={newArticle.duree_estimee_minutes} onChange={(e) => setNewArticle({...newArticle, duree_estimee_minutes: e.target.value, type_article: 'PRESTATION'})} />
                              <input type="number" className="input-fournisseur" placeholder="Prix TTC (€)" style={{flex: '1 1 100px', marginBottom: 0}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value, type_article: 'PRESTATION'})} />
                          </div>
                          <button className="btn-action" onClick={() => { setNewArticle({...newArticle, type_article: 'PRESTATION'}); ajouterArticle(); setShowAddPrestation(false); }} disabled={!newArticle.nom || !newArticle.prix} style={{width: '100%'}}>Ajouter la prestation au catalogue</button>
                      </div>
                  )}

                  <div className="caisse-split-container" style={{ display: 'block', height: 'auto', minHeight: 'unset', maxHeight: 'none', overflow: 'visible', padding: isMobile ? '16px 14px' : '28px 32px', boxSizing: 'border-box' }}>
                      {/* 1. GRILLE DES FICHES TUTORIELS */}
                      {!modeEditionProtocole && (
                          <div className="caisse-left-panel" style={{ width: '100%', borderRight: 'none', paddingRight: 0 }}>
                              <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px'}}>
                                  {(protocolesListe || []).filter(p => !rechercheProtocole || nettoyerTexteRecherche(p.nom_prestation).includes(nettoyerTexteRecherche(rechercheProtocole))).map(proto => {
                                      const ingsTotaux = calculerIngredientsTotauxProtocole(proto);
                                      let stockSuffisant = true;
                                      ingsTotaux.forEach(ing => {
                                          const articleDuStock = (catalogueListe || []).find(a => Number(a.id_article) === Number(ing.id_article));
                                          if (articleDuStock && parseFloat(articleDuStock.stock_actuel) < parseFloat(ing.quantite_necessaire)) stockSuffisant = false;
                                      });
                                      const nbEtapes = Array.isArray(proto.etapes) ? proto.etapes.length : 0;
                                      const dureeTotale = (proto.etapes || []).reduce((acc, e) => acc + (parseInt(e?.duree_minutes ?? e?.timer_min, 10) || 0), 0);
                                      const coverImg = proto.medias?.apres || (proto.etapes || []).find(e => e?.photo_url)?.photo_url || proto.medias?.avant || null;

                                      return (
                                          <div key={proto.id_protocole} onClick={() => setModeEditionProtocole(proto)} className="hover-lift" style={{background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '18px', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)'}}>
                                              <div>
                                                  {coverImg ? (
                                                      <div style={{height: '150px', width: '100%', background: 'var(--bg-hover)', position: 'relative'}}>
                                                          <img src={coverImg} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                          <span style={{position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(17,24,39,0.82)', color: '#fff', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', backdropFilter: 'blur(6px)'}}>
                                                              {nbEtapes} étape{nbEtapes > 1 ? 's' : ''}{dureeTotale > 0 ? ` • ${dureeTotale} min` : ''}
                                                          </span>
                                                      </div>
                                                  ) : (
                                                      <div style={{height: '6px', width: '100%', background: 'var(--text-main)'}}></div>
                                                  )}

                                                  <div style={{padding: '18px'}}>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px'}}>
                                                          <span style={{fontSize: '15.5px', fontWeight: '700', lineHeight: 1.35}}>{proto.nom_prestation}</span>
                                                          <span style={{
                                                              padding: '3px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '700', flexShrink: 0,
                                                              background: stockSuffisant ? 'var(--bg-success)' : 'var(--bg-danger)',
                                                              color: stockSuffisant ? 'var(--color-success)' : 'var(--color-danger)'
                                                          }}>
                                                              {stockSuffisant ? 'Stock OK' : 'Stock bas'}
                                                          </span>
                                                      </div>

                                                      <div style={{display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px'}}>
                                                          <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                                                              {nbEtapes} étape{nbEtapes > 1 ? 's' : ''}
                                                          </span>
                                                          <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><line x1="5.52" y1="16" x2="18.48" y2="16"/></svg>
                                                              {ingsTotaux.length} produit{ingsTotaux.length > 1 ? 's' : ''}
                                                          </span>
                                                          {dureeTotale > 0 && (
                                                              <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                                                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                                  {dureeTotale} min
                                                              </span>
                                                          )}
                                                      </div>

                                                      <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                                          {(proto.tags || []).map(t => <span key={t} style={{fontSize: '10.5px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '3px 9px', borderRadius: '999px', color: 'var(--text-secondary)', fontWeight: '600'}}>{t}</span>)}
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {(protocolesListe || []).length === 0 && <div className="empty-state" style={{gridColumn: '1 / -1'}}><SvgEmptyState /><p>Aucun tutoriel enregistré dans l'Académie.</p></div>}
                              </div>
                          </div>
                      )}

                      {/* 2. ÉDITEUR DE TUTORIEL ÉTAPE PAR ÉTAPE (CRÉATION & MODIFICATION) */}
                      {modeEditionProtocole === 'NEW' && (
                          <div className="caisse-right-panel" style={isMobile ? { width: '100%', height: 'auto', maxHeight: 'none', boxSizing: 'border-box', overflow: 'visible', padding: '4px 2px 110px 2px', border: 'none' } : { width: '100%', maxWidth: '880px', height: 'auto', maxHeight: 'none', margin: '0 auto', border: 'none', padding: '4px 12px 20px 12px', boxSizing: 'border-box', overflow: 'visible' }}>
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px'}}>
                                  <div>
                                      <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>{nouveauProtocole.id_protocole ? 'Édition du tutoriel' : 'Nouveau tutoriel'}</span>
                                      <h3 style={{margin: '2px 0 0 0', color: 'var(--text-main)', fontSize: '20px'}}>Configuration de la Fiche & des Étapes</h3>
                                  </div>
                                  <button type="button" onClick={() => setModeEditionProtocole(null)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                      Retour
                                  </button>
                              </div>

                              {/* Bloc 1 : Prestation cible, Tags & Temps de nettoyage */}
                              <div className="carte" style={{marginBottom: '20px', padding: isMobile ? '16px' : '20px'}}>
                                  <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: '16px', marginBottom: '16px'}}>
                                      <div>
                                          <label style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px'}}>Prestation du catalogue associée</label>
                                          <select className="input-fournisseur" style={{marginBottom: 0}} value={nouveauProtocole.nom_prestation} onChange={e => setNouveauProtocole({...nouveauProtocole, nom_prestation: e.target.value})}>
                                              <option value="">-- Sélectionner une prestation --</option>
                                              {(catalogueListe || []).filter(a => a.type_article === 'PRESTATION').map(p => <option key={p.id_article} value={p.nom}>{p.nom} ({p.prix} €)</option>)}
                                          </select>
                                      </div>

                                      <div>
                                          <label style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px'}}>Temps de nettoyage après RDV</label>
                                          <div style={{display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-app)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', minHeight: '42px', boxSizing: 'border-box'}}>
                                              <input type="checkbox" checked={!!nouveauProtocole.a_temps_nettoyage} onChange={e => setNouveauProtocole({...nouveauProtocole, a_temps_nettoyage: e.target.checked, temps_nettoyage_minutes: e.target.checked ? (nouveauProtocole.temps_nettoyage_minutes || 5) : 0})} style={{width: '17px', height: '17px', accentColor: 'var(--btn-primary)', cursor: 'pointer'}} />
                                              <span style={{fontSize: '12.5px', fontWeight: '600', color: 'var(--text-main)', flex: 1}}>Bloquer du temps à l'agenda</span>
                                              {nouveauProtocole.a_temps_nettoyage && (
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                      <input type="number" min="0" className="input-fournisseur" style={{width: '60px', padding: '5px 8px', marginBottom: 0, textAlign: 'center', fontWeight: '700'}} value={nouveauProtocole.temps_nettoyage_minutes} onChange={e => setNouveauProtocole({...nouveauProtocole, temps_nettoyage_minutes: parseInt(e.target.value, 10) || 0})} />
                                                      <span style={{fontSize: '12px', color: 'var(--text-secondary)'}}>min</span>
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  </div>

                                  <div>
                                      <label style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px'}}>Catégories & Spécialités (Tags)</label>
                                      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                                          {TAGS_DISPONIBLES.map(tag => {
                                              const actif = (nouveauProtocole.tags || []).includes(tag);
                                              return (
                                                  <button type="button" key={tag} onClick={() => toggleTag(tag)} style={{background: actif ? 'var(--text-main)' : 'var(--bg-app)', color: actif ? 'var(--bg-card)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '6px 13px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.15s ease'}}>{tag}</button>
                                              );
                                          })}
                                      </div>
                                  </div>
                              </div>

                              {/* Bloc 2 : Liste des étapes déjà créées (avec édition directe photo + ingrédients + proportions) */}
                              <div style={{marginBottom: '20px'}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                                          <h4 style={{fontSize: '15px', margin: 0, color: 'var(--text-main)'}}>Déroulé du Tutoriel ({(nouveauProtocole.etapes || []).length} étape{(nouveauProtocole.etapes || []).length > 1 ? 's' : ''})</h4>
                                      </div>
                                      <span style={{fontSize: '12.5px', fontWeight: '700', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                          Durée cumulée : {(nouveauProtocole.etapes || []).reduce((acc, e) => acc + (parseInt(e?.duree_minutes ?? e?.timer_min, 10) || 0), 0)} min
                                      </span>
                                  </div>

                                  <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
                                      {(nouveauProtocole.etapes || []).map((rawEtape, index) => {
                                          const etape = normaliserEtapeUI(rawEtape, index);
                                          return (
                                              <div key={etape.id_etape || index} className="carte" style={{padding: isMobile ? '14px' : '18px', marginBottom: 0, border: '1px solid var(--border-color)'}}>
                                                  {/* En-tête de l'étape */}
                                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap'}}>
                                                      <div style={{display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '200px'}}>
                                                          <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '26px', height: '26px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0}}>{index + 1}</span>
                                                          <input
                                                              type="text"
                                                              className="input-fournisseur"
                                                              placeholder={`Titre de l'étape ${index + 1}`}
                                                              value={etape.titre}
                                                              onChange={e => modifierChampEtapeExistante(index, 'titre', e.target.value)}
                                                              style={{marginBottom: 0, fontWeight: '700', fontSize: '14px', padding: '8px 12px'}}
                                                          />
                                                      </div>

                                                      <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                          <div style={{display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                              <input
                                                                  type="number"
                                                                  min="0"
                                                                  placeholder="Min"
                                                                  value={etape.duree_minutes || ''}
                                                                  onChange={e => modifierChampEtapeExistante(index, 'duree_minutes', parseInt(e.target.value, 10) || 0)}
                                                                  style={{width: '44px', border: 'none', background: 'transparent', color: 'var(--text-main)', fontWeight: '700', fontSize: '12.5px', textAlign: 'center', outline: 'none'}}
                                                              />
                                                              <span style={{fontSize: '11px', color: 'var(--text-secondary)'}}>min</span>
                                                          </div>

                                                          <button type="button" disabled={index === 0} onClick={() => deplacerEtapeRecette(index, -1)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.35 : 1, color: 'var(--text-main)'}} title="Monter">
                                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                                                          </button>
                                                          <button type="button" disabled={index === (nouveauProtocole.etapes || []).length - 1} onClick={() => deplacerEtapeRecette(index, 1)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: index === (nouveauProtocole.etapes || []).length - 1 ? 'not-allowed' : 'pointer', opacity: index === (nouveauProtocole.etapes || []).length - 1 ? 0.35 : 1, color: 'var(--text-main)'}} title="Descendre">
                                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                                          </button>
                                                          <button type="button" onClick={() => supprimerEtapeRecette(etape.id_etape || index)} style={{background: 'var(--bg-danger)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-danger)'}} title="Supprimer l'étape">
                                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                          </button>
                                                      </div>
                                                  </div>

                                                  {/* Corps de l'étape : Instructions + Photo de l'étape */}
                                                  <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: '12px', marginBottom: '12px'}}>
                                                      <textarea
                                                          rows="2"
                                                          className="input-fournisseur"
                                                          placeholder="Instructions techniques détaillées de cette étape..."
                                                          value={etape.description}
                                                          onChange={e => modifierChampEtapeExistante(index, 'description', e.target.value)}
                                                          style={{marginBottom: 0, resize: 'vertical', fontSize: '13px'}}
                                                      />

                                                      <div style={{height: '84px', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'var(--bg-app)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                                          {etape.photo_url ? (
                                                              <>
                                                                  <img src={etape.photo_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                                  <button type="button" onClick={() => modifierChampEtapeExistante(index, 'photo_url', null)} style={{position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '11px', zIndex: 2}}>✕</button>
                                                              </>
                                                          ) : (
                                                              <div style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '600', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
                                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                                                  <span>Photo de l'étape</span>
                                                              </div>
                                                          )}
                                                          <input type="file" accept="image/*" onChange={e => uploaderPhotoSurEtape(e, index)} style={{position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer'}} />
                                                      </div>
                                                  </div>

                                                  {/* Ingrédients & Proportions rattachés à cette étape */}
                                                  <div style={{background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)'}}>
                                                      <div style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><line x1="5.52" y1="16" x2="18.48" y2="16"/></svg>
                                                          Produits & Proportions utilisés à l'étape {index + 1}
                                                      </div>

                                                      {(etape.ingredients || []).length > 0 && (
                                                          <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px'}}>
                                                              {etape.ingredients.map((ing, idxIng) => (
                                                                  <span key={idxIng} style={{display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-main)'}}>
                                                                      <strong>{ing.nom}</strong>
                                                                      <span style={{color: 'var(--text-secondary)'}}>• {ing.proportion ? `${ing.proportion} (${formatPortion(ing.quantite_necessaire)} dose)` : `${formatPortion(ing.quantite_necessaire)} dose(s)`}</span>
                                                                      <button type="button" onClick={() => supprimerIngredientDuneEtape(index, idxIng)} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, fontWeight: '700'}}>✕</button>
                                                                  </span>
                                                              ))}
                                                          </div>
                                                      )}

                                                      <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                                          <select id={`sel_art_etape_${index}`} className="input-fournisseur" style={{flex: '2 1 160px', marginBottom: 0, padding: '7px 10px', fontSize: '12px'}}>
                                                              <option value="">+ Lier un produit du stock à cette étape...</option>
                                                              {(catalogueListe || []).filter(a => a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE').map(a => (
                                                                  <option key={a.id_article} value={a.id_article}>{a.nom} (Stock: {a.stock_actuel})</option>
                                                              ))}
                                                          </select>
                                                          <input id={`inp_prop_etape_${index}`} type="text" className="input-fournisseur" placeholder="Dosage (ex: 30g, 45ml, 1:1.5)" style={{flex: '1 1 130px', marginBottom: 0, padding: '7px 10px', fontSize: '12px'}} />
                                                          <select id={`sel_qte_etape_${index}`} className="input-fournisseur" defaultValue="1" style={{width: '100px', marginBottom: 0, padding: '7px 8px', fontSize: '12px'}}>
                                                              <option value="0.13">1/8 dose</option>
                                                              <option value="0.25">1/4 dose</option>
                                                              <option value="0.33">1/3 dose</option>
                                                              <option value="0.5">1/2 dose</option>
                                                              <option value="0.75">3/4 dose</option>
                                                              <option value="1">1 dose</option>
                                                              <option value="1.5">1.5 dose</option>
                                                              <option value="2">2 doses</option>
                                                          </select>
                                                          <button
                                                              type="button"
                                                              onClick={() => {
                                                                  const selArt = document.getElementById(`sel_art_etape_${index}`);
                                                                  const inpProp = document.getElementById(`inp_prop_etape_${index}`);
                                                                  const selQte = document.getElementById(`sel_qte_etape_${index}`);
                                                                  ajouterIngredientSurEtapeExistante(index, selArt?.value, selQte?.value, inpProp?.value);
                                                                  if (selArt) selArt.value = '';
                                                                  if (inpProp) inpProp.value = '';
                                                              }}
                                                              style={{background: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '8px', padding: '0 12px', fontWeight: '700', fontSize: '12px', cursor: 'pointer'}}
                                                          >
                                                              + Produit
                                                          </button>
                                                      </div>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>

                              {/* Bloc 3 : Constructeur d'une nouvelle étape (Photo + Produits + Proportions + Minuteur) */}
                              <div className="carte" style={{background: 'var(--bg-app)', border: '1.5px dashed var(--border-color)', padding: isMobile ? '16px' : '20px', marginBottom: '20px'}}>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px'}}>
                                      <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800'}}>
                                          {(nouveauProtocole.etapes || []).length + 1}
                                      </span>
                                      <h4 style={{margin: 0, fontSize: '14.5px', color: 'var(--text-main)'}}>Ajouter l'étape {(nouveauProtocole.etapes || []).length + 1} au tutoriel</h4>
                                  </div>

                                  <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 140px', gap: '10px', marginBottom: '10px'}}>
                                      <input
                                          type="text"
                                          className="input-fournisseur"
                                          placeholder="Titre de l'étape (ex: Préparation du mélange décolorant, Application racines...)"
                                          value={etapeTemp.titre || ''}
                                          onChange={e => setEtapeTemp({...etapeTemp, titre: e.target.value})}
                                          style={{marginBottom: 0, background: 'var(--bg-card)'}}
                                      />
                                      <input
                                          type="number"
                                          min="0"
                                          className="input-fournisseur"
                                          placeholder="Durée (min)"
                                          value={etapeTemp.duree_minutes ?? etapeTemp.timer_min ?? ''}
                                          onChange={e => setEtapeTemp({...etapeTemp, duree_minutes: e.target.value, timer_min: e.target.value})}
                                          style={{marginBottom: 0, background: 'var(--bg-card)'}}
                                      />
                                  </div>

                                  <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: '10px', marginBottom: '12px'}}>
                                      <textarea
                                          rows="3"
                                          className="input-fournisseur"
                                          placeholder="Décrivez précisément le geste technique, le temps de pause ou le conseil d'application..."
                                          value={etapeTemp.description ?? etapeTemp.texte ?? ''}
                                          onChange={e => setEtapeTemp({...etapeTemp, description: e.target.value, texte: e.target.value})}
                                          style={{marginBottom: 0, background: 'var(--bg-card)', resize: 'vertical'}}
                                      />

                                      <div style={{height: '88px', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'var(--bg-card)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                          {etapeTemp.photo_url ? (
                                              <>
                                                  <img src={etapeTemp.photo_url} alt="Aperçu étape" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                  <button type="button" onClick={() => setEtapeTemp({...etapeTemp, photo_url: null})} style={{position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '11px', zIndex: 2}}>✕</button>
                                              </>
                                          ) : (
                                              <div style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '600', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px'}}>
                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                                  <span>Illustrer l'étape (Photo)</span>
                                              </div>
                                          )}
                                          <input type="file" accept="image/*" onChange={e => uploaderPhotoSurEtape(e, null)} style={{position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer'}} />
                                      </div>
                                  </div>

                                  {/* Lier des ingrédients et proportions à cette étape en cours de création */}
                                  <div style={{background: 'var(--bg-card)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '12px'}}>
                                      <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px'}}>
                                          Produits & Proportions à préparer pour cette étape (Optionnel)
                                      </span>

                                      {Array.isArray(etapeTemp.ingredients) && etapeTemp.ingredients.length > 0 && (
                                          <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px'}}>
                                              {etapeTemp.ingredients.map((ing, i) => (
                                                  <span key={i} style={{display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '8px', fontSize: '12px'}}>
                                                      <strong>{ing.nom}</strong>
                                                      <span style={{color: 'var(--text-secondary)'}}>• {ing.proportion ? `${ing.proportion} (${formatPortion(ing.quantite_necessaire)} dose)` : `${formatPortion(ing.quantite_necessaire)} dose(s)`}</span>
                                                      <button type="button" onClick={() => setEtapeTemp({...etapeTemp, ingredients: etapeTemp.ingredients.filter((_, idx) => idx !== i)})} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, fontWeight: '700'}}>✕</button>
                                                  </span>
                                              ))}
                                          </div>
                                      )}

                                      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                                          <select className="input-fournisseur" style={{flex: '2 1 180px', marginBottom: 0, fontSize: '12.5px'}} value={ingredientTemp.id_article} onChange={e => setIngredientTemp({...ingredientTemp, id_article: e.target.value})}>
                                              <option value="">-- Choisir un produit du stock --</option>
                                              {(catalogueListe || []).filter(a => a.type_article === 'PRODUIT_REVENTE' || a.type_article === 'CONSOMMABLE').map(a => (
                                                  <option key={a.id_article} value={a.id_article}>{a.nom} ({parseFloat(a.prix || 0).toFixed(2)} €)</option>
                                              ))}
                                          </select>
                                          <input
                                              type="text"
                                              className="input-fournisseur"
                                              placeholder="Proportion (ex: 30g, 45ml, 1:1.5)"
                                              style={{flex: '1 1 140px', marginBottom: 0, fontSize: '12.5px'}}
                                              value={ingredientTemp.proportion || ''}
                                              onChange={e => setIngredientTemp({...ingredientTemp, proportion: e.target.value})}
                                          />
                                          <select className="input-fournisseur" style={{width: '110px', marginBottom: 0, fontSize: '12.5px'}} value={ingredientTemp.quantite_necessaire || '1'} onChange={e => setIngredientTemp({...ingredientTemp, quantite_necessaire: e.target.value})}>
                                              <option value="0.13">1/8 dose</option>
                                              <option value="0.25">1/4 dose</option>
                                              <option value="0.33">1/3 dose</option>
                                              <option value="0.5">1/2 dose</option>
                                              <option value="0.75">3/4 dose</option>
                                              <option value="1">1 dose</option>
                                              <option value="1.5">1.5 dose</option>
                                              <option value="2">2 doses</option>
                                              <option value="3">3 doses</option>
                                          </select>
                                          <button type="button" onClick={ajouterIngredientBrouillonEtape} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '0 14px', borderRadius: '10px', fontWeight: '700', fontSize: '12.5px', cursor: 'pointer'}}>
                                              + Lier le produit
                                          </button>
                                      </div>
                                  </div>

                                  <button type="button" className="btn-action" style={{width: '100%', padding: '12px'}} onClick={ajouterEtapeRecette}>
                                      + Valider et ajouter cette étape au tutoriel
                                  </button>
                              </div>

                              {/* Bloc 4 : Galerie Résultat Avant / Après (Optionnel) & Rentabilité */}
                              <div className="carte" style={{padding: isMobile ? '16px' : '20px', marginBottom: '20px'}}>
                                  <h4 style={{fontSize: '13.5px', margin: '0 0 12px 0', color: 'var(--text-main)'}}>Photos de couverture Avant / Pendant / Après (Optionnel)</h4>
                                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px'}}>
                                      {['avant', 'pendant', 'apres'].map(type => (
                                          <div key={type} style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                              <label style={{fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: 'var(--text-secondary)', textAlign: 'center'}}>{type}</label>
                                              <div style={{height: '96px', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative'}}>
                                                  {nouveauProtocole.medias?.[type] ? (
                                                      <img src={nouveauProtocole.medias[type]} alt={type} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                  ) : (
                                                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                  )}
                                                  <input type="file" accept="image/*" onChange={(e) => uploadMediaProtocole(e, type)} style={{position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer'}} />
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>

                              {(() => {
                                  const prestaChoisie = (catalogueListe || []).find(a => a.nom === nouveauProtocole.nom_prestation && a.type_article === 'PRESTATION');
                                  const prixVente = prestaChoisie ? parseFloat(prestaChoisie.prix) : 0;
                                  const ingsCumules = calculerIngredientsTotauxProtocole(nouveauProtocole);
                                  const coutProduits = ingsCumules.reduce((acc, ing) => {
                                      const art = (catalogueListe || []).find(a => Number(a.id_article) === Number(ing.id_article));
                                      return acc + (art ? parseFloat(art.prix || 0) * (parseFloat(ing.quantite_necessaire) || 1) : 0);
                                  }, 0);
                                  const margeValeur = prixVente - coutProduits;
                                  const margePourcentage = prixVente > 0 ? (margeValeur / prixVente) * 100 : 0;
                                  const couleurMarge = margePourcentage > 60 ? 'var(--color-success)' : (margePourcentage > 30 ? 'var(--color-info)' : 'var(--color-danger)');

                                  return (nouveauProtocole.nom_prestation && (
                                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                              <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '700'}}>Rentabilité & Déstockage Automatique</span>
                                              <span style={{fontSize: '13px', color: 'var(--text-main)'}}>Prix Prestation : <strong>{prixVente.toFixed(2)} €</strong> • Coût Produits ({ingsCumules.length}) : <strong>{coutProduits.toFixed(2)} €</strong></span>
                                          </div>
                                          <div style={{textAlign: 'right'}}>
                                              <span style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '700', display: 'block'}}>Marge Brute Estimée</span>
                                              <div style={{display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end'}}>
                                                  <span style={{fontSize: '14px', fontWeight: '700', color: 'var(--text-main)'}}>+{margeValeur.toFixed(2)} €</span>
                                                  <span style={{fontSize: '18px', fontWeight: '900', color: couleurMarge}}>{margePourcentage.toFixed(0)}%</span>
                                              </div>
                                          </div>
                                      </div>
                                  ));
                              })()}

                              <div style={{display: 'flex', gap: '12px'}}>
                                  <button type="button" onClick={() => setModeEditionProtocole(null)} style={{flex: 1, padding: '15px', borderRadius: 'var(--radius-input)', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: '700', cursor: 'pointer'}}>Annuler</button>
                                  <button type="button" className="btn-action" style={{flex: 2, padding: '15px', fontSize: '15px'}} disabled={!nouveauProtocole.nom_prestation} onClick={creerProtocole}>Enregistrer le Tutoriel</button>
                              </div>
                          </div>
                      )}

                      {/* 3. LECTEUR DE TUTORIEL INTERACTIF (CONSULTATION D'UNE FICHE) */}
                      {modeEditionProtocole && modeEditionProtocole !== 'NEW' && (() => {
                          const ingsTotaux = calculerIngredientsTotauxProtocole(modeEditionProtocole);
                          const dureeTotale = (modeEditionProtocole.etapes || []).reduce((acc, e) => acc + (parseInt(e?.duree_minutes ?? e?.timer_min, 10) || 0), 0);

                          return (
                              <div className="caisse-right-panel" style={isMobile ? { width: '100%', height: 'auto', maxHeight: 'none', boxSizing: 'border-box', overflow: 'visible', padding: '4px 2px 110px 2px', border: 'none' } : { width: '100%', maxWidth: '880px', height: 'auto', maxHeight: 'none', margin: '0 auto', border: 'none', padding: '4px 12px 20px 12px', boxSizing: 'border-box', overflow: 'visible' }}>
                                  <div className="carte" style={{padding: isMobile ? '18px' : '24px', marginBottom: '20px'}}>
                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '18px'}}>
                                          <div>
                                              <button type="button" onClick={() => setModeEditionProtocole(null)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '999px', cursor: 'pointer', fontWeight: '700', marginBottom: '12px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
                                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                                  Retour à l'Académie
                                              </button>
                                              <h2 style={{margin: '0 0 8px 0', fontSize: isMobile ? '20px' : '24px'}}>{modeEditionProtocole.nom_prestation}</h2>
                                              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'}}>
                                                  {(modeEditionProtocole.tags || []).map(t => <span key={t} style={{fontSize: '11px', background: 'var(--text-main)', color: 'var(--bg-card)', padding: '3px 10px', borderRadius: '999px', fontWeight: '700'}}>{t}</span>)}
                                                  {dureeTotale > 0 && (
                                                      <span style={{fontSize: '11.5px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '3px 10px', borderRadius: '999px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                          Temps technique : {dureeTotale} min
                                                      </span>
                                                  )}
                                                  {modeEditionProtocole.temps_nettoyage_minutes > 0 && (
                                                      <span style={{fontSize: '11.5px', background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', fontWeight: '600'}}>
                                                          +{modeEditionProtocole.temps_nettoyage_minutes} min nettoyage
                                                      </span>
                                                  )}
                                              </div>
                                          </div>

                                          <div style={{display: 'flex', gap: '8px'}}>
                                              <button
                                                  type="button"
                                                  onClick={() => {
                                                      const etapesNorm = (modeEditionProtocole.etapes || []).map((et, i) => normaliserEtapeUI(et, i));
                                                      setNouveauProtocole({
                                                          ...modeEditionProtocole,
                                                          etapes: etapesNorm,
                                                          medias: modeEditionProtocole.medias || { avant: null, pendant: null, apres: null },
                                                          a_temps_nettoyage: (modeEditionProtocole.temps_nettoyage_minutes > 0),
                                                          temps_nettoyage_minutes: modeEditionProtocole.temps_nettoyage_minutes || 5
                                                      });
                                                      setModeEditionProtocole('NEW');
                                                  }}
                                                  style={{background: 'var(--text-main)', border: 'none', color: 'var(--bg-card)', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px'}}
                                              >
                                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                                  Modifier
                                              </button>
                                              <button
                                                  type="button"
                                                  onClick={() => supprimerProtocole(modeEditionProtocole.id_protocole)}
                                                  style={{color: 'var(--color-danger)', background: 'var(--bg-danger)', border: 'none', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '12.5px'}}
                                              >
                                                  Supprimer
                                              </button>
                                          </div>
                                      </div>

                                      {/* Galerie Avant / Pendant / Après si renseignée */}
                                      {modeEditionProtocole.medias && (modeEditionProtocole.medias.avant || modeEditionProtocole.medias.pendant || modeEditionProtocole.medias.apres) && (
                                          <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px'}}>
                                              {['avant', 'pendant', 'apres'].map(type => (
                                                  modeEditionProtocole.medias[type] && (
                                                      <div key={type} style={{borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-app)'}}>
                                                          <img src={modeEditionProtocole.medias[type]} alt={type} style={{width: '100%', height: '160px', objectFit: 'cover', display: 'block'}} />
                                                          <span style={{fontSize: '11px', fontWeight: '700', display: 'block', textAlign: 'center', padding: '6px', textTransform: 'uppercase', color: 'var(--text-secondary)'}}>{type}</span>
                                                      </div>
                                                  )
                                              ))}
                                          </div>
                                      )}

                                      {/* Récapitulatif Laboratoire (Total des produits nécessaires) */}
                                      <div style={{background: 'var(--bg-app)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)'}}>
                                          <div style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><line x1="5.52" y1="16" x2="18.48" y2="16"/></svg>
                                              Préparation Laboratoire Globale ({ingsTotaux.length} produit{ingsTotaux.length > 1 ? 's' : ''})
                                          </div>
                                          {ingsTotaux.length > 0 ? (
                                              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                                                  {ingsTotaux.map((ing, i) => (
                                                      <span key={i} style={{fontSize: '12.5px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '9px', border: '1px solid var(--border-color)', color: 'var(--text-main)'}}>
                                                          <strong>{ing.nom}</strong> • <span style={{color: 'var(--text-secondary)', fontWeight: '600'}}>{ing.proportion ? `${ing.proportion} (${formatPortion(ing.quantite_necessaire)} dose)` : `${formatPortion(ing.quantite_necessaire)} dose(s)`}</span>
                                                      </span>
                                                  ))}
                                              </div>
                                          ) : (
                                              <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun produit technique rattaché.</span>
                                          )}
                                      </div>
                                  </div>

                                  {/* Cartes Tutoriel Étape par Étape */}
                                  <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                                      {(modeEditionProtocole.etapes || []).map((rawEtape, index) => {
                                          const etape = normaliserEtapeUI(rawEtape, index);
                                          return (
                                              <div key={index} className="carte" style={{padding: isMobile ? '16px' : '22px', marginBottom: 0, display: 'grid', gridTemplateColumns: (etape.photo_url && !isMobile) ? '1fr 240px' : '1fr', gap: '20px', alignItems: 'start'}}>
                                                  <div>
                                                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap'}}>
                                                          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                                              <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '13px', fontWeight: '800', flexShrink: 0}}>{index + 1}</span>
                                                              <h4 style={{margin: 0, fontSize: '16px', color: 'var(--text-main)'}}>{etape.titre}</h4>
                                                          </div>
                                                          {etape.duree_minutes > 0 && (
                                                              <span style={{fontSize: '12px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '4px 10px', borderRadius: '999px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                                                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                                  {etape.duree_minutes} min
                                                              </span>
                                                          )}
                                                      </div>

                                                      {etape.description && (
                                                          <p style={{margin: '0 0 14px 0', fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)', whiteSpace: 'pre-line'}}>{etape.description}</p>
                                                      )}

                                                      {etape.ingredients && etape.ingredients.length > 0 && (
                                                          <div style={{background: 'var(--bg-app)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)'}}>
                                                              <div style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><line x1="5.52" y1="16" x2="18.48" y2="16"/></svg>
                                                                  Ingrédients & Proportions de l'étape {index + 1}
                                                              </div>
                                                              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                                                                  {etape.ingredients.map((ing, i) => (
                                                                      <span key={i} style={{fontSize: '12.5px', background: 'var(--bg-card)', color: 'var(--text-main)', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                                                          <strong>{ing.nom}</strong> • <span style={{color: 'var(--btn-primary)', fontWeight: '700'}}>{ing.proportion ? ing.proportion : `${formatPortion(ing.quantite_necessaire)} dose(s)`}</span>
                                                                      </span>
                                                                  ))}
                                                              </div>
                                                          </div>
                                                      )}
                                                  </div>

                                                  {etape.photo_url && (
                                                      <div style={{borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-app)'}}>
                                                          <img src={etape.photo_url} alt={etape.titre} style={{width: '100%', height: '165px', objectFit: 'cover', display: 'block'}} />
                                                      </div>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          );
                      })()}
                  </div>
                  
                  {!modeEditionProtocole && (
                      <>
                          <div className="section-titre" style={{marginTop: '32px'}}>Catalogue des Prestations</div>
                          <div className="carte scan-carte">
                              {(catalogueListe || []).filter(art => art.type_article === 'PRESTATION').length === 0 ? (
                                  <div className="empty-state"><p>Aucune prestation au catalogue.</p></div>
                              ) : (catalogueListe || []).filter(art => art.type_article === 'PRESTATION').map(art => (
                                  <div key={art.id_article} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', fontSize: '13px', alignItems: 'center'}}>
                                      <span><strong style={{color: 'var(--text-main)'}}>{art.nom}</strong> — {art.prix} € </span>
                                      <div style={{display: 'flex', gap: '16px'}}>
                                          <button onClick={() => setModifNomDialog({ id_article: art.id_article, nom: art.nom })} style={{background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontWeight: '600'}}>Renommer</button>
                                          <button onClick={() => supprimerArticle(art.id_article)} style={{background:'none', border:'none', color:'var(--color-danger)', cursor:'pointer', fontWeight: '600'}}>Supprimer</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </>
                  )}

                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>
  );
};

export default ProtocolesTab;
