import React from 'react';

export default function ModalIA({
  modalIA,
  setModalIA,
  isMobile,
  tachesIA,
  fileAttenteIA,
  ignorerTacheIA,
  validerTacheIA,
  employesListe
}) {
  if (!modalIA) return null;

          const isFactureIA = modalIA.type_tache === 'FACTURE_ACHAT';
          const nbTotalAttente = Math.max((tachesIA || []).length, (fileAttenteIA || []).length);

          const labelStyleIA = {
              fontSize: '11px',
              fontWeight: '700',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              display: 'block',
              marginBottom: '6px'
          };

          const inputBoxStyleIA = {
              marginBottom: 0,
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--bg-card)',
              fontWeight: '600',
              fontSize: '13.5px',
              height: '42px',
              borderRadius: '10px'
          };

          return (
              <div className="modal-overlay" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 100000 }}>
                  <div
                      className="modal-content"
                      style={{
                          maxWidth: isFactureIA ? '1020px' : '540px',
                          width: isFactureIA ? '95vw' : '92vw',
                          padding: isMobile ? '20px' : '28px',
                          borderRadius: '22px',
                          border: '1px solid var(--border-color)',
                          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.18)',
                          transition: 'all 0.25s ease'
                      }}
                  >
                      {/* EN-TÊTE EXECUTIVE DE LA POPUP IA */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '22px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                              <div style={{
                                  width: '46px', height: '46px', borderRadius: '14px',
                                  background: 'var(--text-main)', color: 'var(--bg-card)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0, boxShadow: 'var(--shadow-sm)'
                              }}>
                                  {isFactureIA ? (
                                      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                  ) : modalIA.type_tache === 'STOCK' ? (
                                      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                  ) : modalIA.type_tache === 'RDV' ? (
                                      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                  ) : modalIA.type_tache === 'ABSENCE' ? (
                                      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 14l2 2 4-4"/></svg>
                                  ) : (
                                      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                                  )}
                              </div>

                              <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                      <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                                          padding: '3px 9px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '800',
                                          background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                                          textTransform: 'uppercase', letterSpacing: '0.04em'
                                      }}>
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)' }} />
                                          Détection Automatique IA
                                      </span>
                                      {nbTotalAttente > 1 && (
                                          <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '700', background: 'var(--bg-info)', color: 'var(--color-info)' }}>
                                              {nbTotalAttente} en attente
                                          </span>
                                      )}
                                  </div>

                                  <h2 style={{ margin: '0 0 2px 0', color: 'var(--text-main)', fontSize: isMobile ? '17px' : '19px', fontWeight: '800', letterSpacing: '-0.01em' }}>
                                      {isFactureIA ? "Facture fournisseur analysée" : modalIA.type_tache === 'STOCK' ? "Réassort de stock détecté" : modalIA.type_tache === 'RDV' ? "Nouveau rendez-vous détecté" : modalIA.type_tache === 'ABSENCE' ? "Absence collaborateur détectée" : "Nouvelle tâche administrative"}
                                  </h2>
                                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                                      {isFactureIA ? "Vérifiez la ventilation comptable et l'inventaire avant validation" : modalIA.type_tache === 'STOCK' ? "Données extraites automatiquement d'un bon de livraison ou e-mail" : modalIA.type_tache === 'RDV' ? "Vérifiez le créneau et le collaborateur avant ajout à l'agenda" : modalIA.type_tache === 'ABSENCE' ? "Contrôlez les dates avant blocage du planning" : "Action extraite automatiquement de votre boîte mail"}
                                  </p>
                              </div>
                          </div>

                          <button
                              type="button"
                              onClick={() => setModalIA(null)}
                              title="Fermer temporairement"
                              style={{
                                  width: '34px', height: '34px', borderRadius: '10px', border: '1px solid var(--border-color)',
                                  background: 'var(--bg-app)', color: 'var(--text-secondary)', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
                              }}
                          >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                      </div>

                      {isFactureIA ? (
                          (() => {
                              const ht = parseFloat(modalIA.donnees?.montant_ht) || 0;
                              const tva = parseFloat(modalIA.donnees?.montant_tva) || 0;
                              const ttc = parseFloat(modalIA.donnees?.montant_ttc) || 0;
                              const ecart = Math.abs((ht + tva) - ttc);
                              const hasEcart = ecart > 0.05;

                              return (
                                  <div style={{ display: 'flex', gap: '20px', flexDirection: isMobile ? 'column' : 'row', marginBottom: '22px' }}>
                                      <div style={{ flex: 1, minWidth: '42%', background: 'var(--bg-app)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-main)' }}>Pièce justificative originale</span>
                                              {modalIA.donnees?.pdf_url && (
                                                  <a href={modalIA.donnees.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-main)', textDecoration: 'underline' }}>Ouvrir plein écran</a>
                                              )}
                                          </div>
                                          {modalIA.donnees?.pdf_url ? (
                                              modalIA.donnees?.mime_type && modalIA.donnees.mime_type.startsWith('image/') ? (
                                                  <div style={{ width: '100%', height: isMobile ? '320px' : '480px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827' }}>
                                                      <img src={modalIA.donnees.pdf_url} alt="Facture scannée" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                  </div>
                                              ) : (
                                                  <iframe src={modalIA.donnees.pdf_url} style={{ width: '100%', height: isMobile ? '320px' : '480px', border: 'none' }} title="Facture Document" />
                                              )
                                          ) : (
                                              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: 'auto' }}>
                                                  Aperçu visuel non disponible.
                                              </div>
                                          )}
                                      </div>

                                      <div style={{ flex: 1.15, display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: isMobile ? 'none' : '520px', overflowY: 'auto', paddingRight: '4px' }}>
                                          <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: '12px' }}>
                                                  <div>
                                                      <label style={labelStyleIA}>Nom du Fournisseur</label>
                                                      <input className="input-fournisseur" value={modalIA.donnees?.fournisseur || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, fournisseur: e.target.value } })} style={inputBoxStyleIA} />
                                                  </div>
                                                  <div>
                                                      <label style={labelStyleIA}>N° de Pièce / Facture</label>
                                                      <input type="text" className="input-fournisseur" placeholder="Ex: FAC-2026-01" value={modalIA.donnees?.numero_facture || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, numero_facture: e.target.value } })} style={inputBoxStyleIA} />
                                                  </div>
                                              </div>

                                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                                                  <div>
                                                      <label style={labelStyleIA}>Date Facture</label>
                                                      <input type="date" className="input-fournisseur" value={modalIA.donnees?.date_facture || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, date_facture: e.target.value } })} style={inputBoxStyleIA} />
                                                  </div>
                                                  <div>
                                                      <label style={labelStyleIA}>Règlement</label>
                                                      <select className="input-fournisseur" value={modalIA.donnees?.mode_paiement || 'NON_SPECIFIE'} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, mode_paiement: e.target.value } })} style={inputBoxStyleIA}>
                                                          <option value="NON_SPECIFIE">À définir</option>
                                                          <option value="PRELEVEMENT">Prélèvement</option>
                                                          <option value="VIREMENT">Virement</option>
                                                          <option value="CARTE">Carte / CB</option>
                                                          <option value="ESPECES">Espèces (Caisse)</option>
                                                          <option value="CHEQUE">Chèque</option>
                                                      </select>
                                                  </div>
                                                  <div>
                                                      <label style={labelStyleIA}>Compte PCG</label>
                                                      <select className="input-fournisseur" value={modalIA.donnees?.compte_comptable || '607'} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, compte_comptable: e.target.value } })} style={inputBoxStyleIA}>
                                                          <option value="607">607 - Revente</option>
                                                          <option value="6028">6028 - Conso/Bac</option>
                                                          <option value="604">604 - Services</option>
                                                          <option value="613">613 - Loyer</option>
                                                          <option value="6061">6061 - Énergie</option>
                                                      </select>
                                                  </div>
                                              </div>
                                          </div>

                                          <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '14px', border: hasEcart ? '1.5px solid var(--color-danger)' : '1px solid var(--border-color)' }}>
                                              <span style={labelStyleIA}>Montants Comptables (Liasse & FEC)</span>
                                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                                                  <div>
                                                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Base HT (€)</span>
                                                      <input type="number" step="0.01" className="input-fournisseur" value={modalIA.donnees?.montant_ht || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, montant_ht: e.target.value } })} style={inputBoxStyleIA} />
                                                  </div>
                                                  <span style={{ paddingTop: '18px', fontWeight: '700', color: 'var(--text-muted)' }}>+</span>
                                                  <div>
                                                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>TVA (€)</span>
                                                      <input type="number" step="0.01" className="input-fournisseur" value={modalIA.donnees?.montant_tva || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, montant_tva: e.target.value } })} style={inputBoxStyleIA} />
                                                  </div>
                                                  <span style={{ paddingTop: '18px', fontWeight: '700', color: 'var(--text-muted)' }}>=</span>
                                                  <div>
                                                      <span style={{ fontSize: '11px', color: 'var(--text-main)', fontWeight: '700', display: 'block', marginBottom: '4px' }}>Total TTC (€)</span>
                                                      <input type="number" step="0.01" className="input-fournisseur" value={modalIA.donnees?.montant_ttc || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, montant_ttc: e.target.value } })} style={{ ...inputBoxStyleIA, fontWeight: '800' }} />
                                                  </div>
                                              </div>
                                          </div>

                                          <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                  <span style={{ ...labelStyleIA, marginBottom: 0 }}>Articles à entrer en stock</span>
                                                  <span style={{ fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '999px', fontWeight: '700' }}>
                                                      {(modalIA.donnees?.produits || []).length} ligne(s)
                                                  </span>
                                              </div>
                                              {(!modalIA.donnees?.produits || modalIA.donnees.produits.length === 0) ? (
                                                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>Aucun produit d'inventaire sur cette facture.</p>
                                              ) : (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                      {modalIA.donnees.produits.map((prod, idx) => (
                                                          <div key={idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                                  <input className="input-fournisseur" value={prod.nom} onChange={e => {
                                                                      const newProds = [...modalIA.donnees.produits];
                                                                      newProds[idx].nom = e.target.value;
                                                                      setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, produits: newProds } });
                                                                  }} style={{ marginBottom: 0, flex: 1, padding: '6px 10px', fontSize: '12.5px', height: '34px' }} />
                                                                  <button type="button" onClick={() => {
                                                                      const newProds = modalIA.donnees.produits.filter((_, i) => i !== idx);
                                                                      setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, produits: newProds } });
                                                                  }} style={{ background: 'var(--bg-danger)', border: 'none', color: 'var(--color-danger)', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer' }}>✕</button>
                                                              </div>
                                                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700' }}>Qté</span>
                                                                      <input type="number" value={prod.quantite} onChange={e => {
                                                                          const newProds = [...modalIA.donnees.produits];
                                                                          newProds[idx].quantite = parseInt(e.target.value, 10) || 0;
                                                                          setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, produits: newProds } });
                                                                      }} style={{ width: '48px', border: 'none', background: 'transparent', fontWeight: '800', textAlign: 'center', color: 'var(--text-main)' }} />
                                                                  </div>
                                                                  <div style={{ flex: 1, display: 'flex', background: 'var(--bg-app)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                                      <button type="button" onClick={() => {
                                                                          const newProds = [...modalIA.donnees.produits];
                                                                          newProds[idx].type_destine = 'REVENTE';
                                                                          setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, produits: newProds } });
                                                                      }} style={{ flex: 1, padding: '5px', fontSize: '11px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', background: prod.type_destine === 'REVENTE' ? 'var(--text-main)' : 'transparent', color: prod.type_destine === 'REVENTE' ? 'var(--bg-card)' : 'var(--text-secondary)' }}>Revente</button>
                                                                      <button type="button" onClick={() => {
                                                                          const newProds = [...modalIA.donnees.produits];
                                                                          newProds[idx].type_destine = 'CONSOMMABLE';
                                                                          setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, produits: newProds } });
                                                                      }} style={{ flex: 1, padding: '5px', fontSize: '11px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', background: prod.type_destine === 'CONSOMMABLE' ? 'var(--text-main)' : 'transparent', color: prod.type_destine === 'CONSOMMABLE' ? 'var(--bg-card)' : 'var(--text-secondary)' }}>Consommable</button>
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              );
                          })()
                      ) : (
                          <div style={{
                              textAlign: 'left',
                              background: 'var(--bg-app)',
                              padding: isMobile ? '16px' : '20px',
                              borderRadius: '16px',
                              border: '1px solid var(--border-color)',
                              marginBottom: '22px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '16px'
                          }}>
                              {modalIA.type_tache === 'STOCK' && (
                                  <>
                                      <div>
                                          <label style={labelStyleIA}>Désignation du produit (Catalogue / Stock)</label>
                                          <input className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.nom_produit || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, nom_produit: e.target.value } })} />
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Quantité à ajouter (+)</label>
                                              <input type="number" min="1" className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.quantite || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, quantite: parseInt(e.target.value, 10) || 0 } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Référence / Code article</label>
                                              <input className="input-fournisseur" placeholder="Optionnel (ex: KER-250)" style={inputBoxStyleIA} value={modalIA.donnees?.reference || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, reference: e.target.value } })} />
                                          </div>
                                      </div>
                                  </>
                              )}

                              {modalIA.type_tache === 'RDV' && (
                                  <>
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Client(e)</label>
                                              <input className="input-fournisseur" placeholder="Prénom et Nom" style={inputBoxStyleIA} value={modalIA.donnees?.nom_client || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, nom_client: e.target.value } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Téléphone mobile</label>
                                              <input className="input-fournisseur" placeholder="06..." style={inputBoxStyleIA} value={modalIA.donnees?.telephone || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, telephone: e.target.value } })} />
                                          </div>
                                      </div>

                                      <div>
                                          <label style={labelStyleIA}>Prestation demandée</label>
                                          <input className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.prestation || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, prestation: e.target.value } })} />
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Date et Heure du RDV</label>
                                              <input type="datetime-local" className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.date_heure_debut || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, date_heure_debut: e.target.value } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Durée prévue</label>
                                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                  <input type="number" min="5" step="5" className="input-fournisseur" style={{ ...inputBoxStyleIA, paddingRight: '46px' }} value={modalIA.donnees?.duree_minutes ?? ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, duree_minutes: parseInt(e.target.value, 10) || '' } })} />
                                                  <span style={{ position: 'absolute', right: '14px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', pointerEvents: 'none' }}>min</span>
                                              </div>
                                          </div>
                                      </div>

                                      <div>
                                          <label style={labelStyleIA}>Collaborateur assigné au planning</label>
                                          <select className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.id_employe || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, id_employe: e.target.value } })}>
                                              <option value="">-- Sélectionner un collaborateur de l'équipe --</option>
                                              {(employesListe || []).map(emp => (
                                                  <option key={emp.id_employe} value={emp.id_employe}>{emp.nom} {emp.role ? `(${emp.role})` : ''}</option>
                                              ))}
                                          </select>
                                      </div>
                                  </>
                              )}

                              {modalIA.type_tache === 'ABSENCE' && (
                                  <>
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Collaborateur concerné</label>
                                              <input className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.nom_employe || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, nom_employe: e.target.value } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Nature de l'absence</label>
                                              <select className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.type_demande || 'CONGES'} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, type_demande: e.target.value } })}>
                                                  <option value="CONGES">Demande de Congés</option>
                                                  <option value="ARRET_MALADIE">Arrêt Maladie (Blocage immédiat)</option>
                                              </select>
                                          </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Date de début</label>
                                              <input type="date" className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.date_debut || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, date_debut: e.target.value } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Date de fin (incluse)</label>
                                              <input type="date" className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.date_fin || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, date_fin: e.target.value } })} />
                                          </div>
                                      </div>

                                      <div>
                                          <label style={labelStyleIA}>Motif / Commentaire extrait</label>
                                          <textarea className="input-fournisseur" rows="2" style={{ ...inputBoxStyleIA, height: 'auto', padding: '10px 12px', resize: 'vertical' }} value={modalIA.donnees?.commentaire || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, commentaire: e.target.value } })} />
                                      </div>
                                  </>
                              )}

                              {modalIA.type_tache === 'ACTION' && (
                                  <>
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '12px' }}>
                                          <div>
                                              <label style={labelStyleIA}>Intitulé de l'action administrative</label>
                                              <input className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.titre || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, titre: e.target.value } })} />
                                          </div>
                                          <div>
                                              <label style={labelStyleIA}>Date d'échéance</label>
                                              <input type="date" className="input-fournisseur" style={inputBoxStyleIA} value={modalIA.donnees?.date_echeance || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, date_echeance: e.target.value } })} />
                                          </div>
                                      </div>

                                      <div>
                                          <label style={labelStyleIA}>Détails extraits de l'e-mail</label>
                                          <textarea className="input-fournisseur" rows="3" style={{ ...inputBoxStyleIA, height: 'auto', padding: '10px 12px', resize: 'vertical' }} value={modalIA.donnees?.description || ''} onChange={e => setModalIA({ ...modalIA, donnees: { ...modalIA.donnees, description: e.target.value } })} />
                                      </div>
                                  </>
                              )}
                          </div>
                      )}

                      {/* BOUTONS D'ACTION EXECUTIVE */}
                      <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                          <button
                              type="button"
                              onClick={() => ignorerTacheIA(modalIA)}
                              style={{
                                  flex: 1,
                                  background: 'var(--bg-app)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-color)',
                                  padding: '13px 16px',
                                  borderRadius: '12px',
                                  fontWeight: '700',
                                  fontSize: '13.5px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px'
                              }}
                          >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              <span>Ignorer</span>
                          </button>

                          <button
                              type="button"
                              onClick={() => validerTacheIA(modalIA)}
                              className="btn-action"
                              style={{
                                  flex: 2,
                                  padding: '13px 20px',
                                  borderRadius: '12px',
                                  fontSize: '14px',
                                  fontWeight: '800',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px'
                              }}
                          >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              <span>
                                  {isFactureIA ? "Valider Facture & Stocks" : modalIA.type_tache === 'STOCK' ? "Ajouter au Stock" : modalIA.type_tache === 'RDV' ? "Confirmer et Ajouter à l'Agenda" : modalIA.type_tache === 'ABSENCE' ? "Enregistrer l'Absence" : "Ajouter au Centre d'Action"}
                              </span>
                          </button>
                      </div>
                  </div>
              </div>
          );

}
