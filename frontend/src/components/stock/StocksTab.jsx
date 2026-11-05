import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import SvgEmptyState from '../common/SvgEmptyState';

export const StocksTab = ({
  isMobile,
  role,
  ouvrirScannerCodeBarre,
  ouvrirModaleReassort,
  produitsEnAlerteStock = [],
  isStockMergeMode,
  setIsStockMergeMode,
  selectedStocksToMerge = [],
  setSelectedStocksToMerge,
  showAddProduit,
  setShowAddProduit,
  dernierProduitScanne,
  setDernierProduitScanne,
  showReassortModal,
  setShowReassortModal,
  fournisseurCommande,
  changerFournisseurReassort,
  emailFournisseurCommande,
  setEmailFournisseurCommande,
  lignesReassort = [],
  setLignesReassort,
  noteCommande,
  setNoteCommande,
  copierListeReassort,
  isSendingCommande,
  telechargerBonCommandePdf,
  envoyerBonCommandeParMail,
  scannerModalMode,
  fermerScannerCodeBarre,
  codeBarreManuel,
  setCodeBarreManuel,
  traiterCodeBarreDetecte,
  stocksData = [],
  setMergeForm,
  setShowMergeModal,
  newArticle = {},
  setNewArticle,
  ajouterArticle,
  isStockExpanded,
  setIsStockExpanded,
  stockSearch,
  setStockSearch,
  stockSortBy,
  setStockSortBy,
  getStockStatus,
  getTendanceStock,
  stockMenuOuvert,
  setStockMenuOuvert,
  setModifStockDialog,
  setConfirmDialog,
  supprimerArticle,
  showToast,
}) => {
  return (
                <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : { display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                  {/* EN-TÊTE FIXE */}
                  <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '10px', flexWrap: 'wrap'}}>
                          <div><h1 style={{margin: 0}}>Inventaire & Produits</h1><span className="date-subtitle" style={{margin: 0}}></span></div>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
                              <ThemeToggle />
                              <button
                                  type="button"
                                  onClick={() => ouvrirScannerCodeBarre('STOCKS')}
                                  style={{ background: 'var(--bg-app)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: isMobile ? '0 11px' : '0 14px', borderRadius: '999px', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: '700', fontSize: '12.5px' }}
                                  title="Scanner un code-barres produit"
                              >
                                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>
                                  {!isMobile && <span>Scanner EAN</span>}
                              </button>
                              <button
                                  type="button"
                                  onClick={ouvrirModaleReassort}
                                  style={{ background: produitsEnAlerteStock.length > 0 ? 'var(--bg-danger)' : 'var(--bg-app)', color: produitsEnAlerteStock.length > 0 ? 'var(--color-danger)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: isMobile ? '0 11px' : '0 14px', borderRadius: '999px', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: '800', fontSize: '12.5px' }}
                                  title="Préparer un bon de commande fournisseur"
                              >
                                  <span>Réassort ({produitsEnAlerteStock.length})</span>
                              </button>
                              <button 
                                  onClick={() => {
                                      setIsStockMergeMode(!isStockMergeMode);
                                      setSelectedStocksToMerge([]);
                                  }} 
                                  className="theme-toggle-btn" 
                                  style={{ background: isStockMergeMode ? 'var(--btn-primary)' : 'var(--bg-app)', color: isStockMergeMode ? 'var(--btn-text)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border-color)' }}
                                  title="Unifier les doublons de stock"
                              >
                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                              </button>
                              <button onClick={() => setShowAddProduit(!showAddProduit)} className="btn-action" style={{width: '40px', height: '40px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Nouveau Produit">+</button>
                          </div>
                      </div>
                  </div>

                  {/* Fiche rapide si un produit existant vient d'être scanné */}
                  {dernierProduitScanne && (
                      <div className="carte" style={{ marginBottom: '16px', padding: '14px 18px', border: '1.5px solid var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                              <span style={{ fontSize: '10.5px', fontWeight: '800', color: 'var(--color-success)', textTransform: 'uppercase' }}>✓ Produit scanné</span>
                              <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>{dernierProduitScanne.nom}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                  Réf : <strong>{dernierProduitScanne.reference || 'N/A'}</strong> • Prix : <strong>{dernierProduitScanne.prix} €</strong> • Stock actuel : <strong>{dernierProduitScanne.stock_actuel ?? 0}</strong>
                              </div>
                          </div>
                          <button type="button" onClick={() => setDernierProduitScanne(null)} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                              Fermer ✕
                          </button>
                      </div>
                  )}

                  {/* Modale de Réassort & Bon de Commande Fournisseur */}
                  {showReassortModal && (
                      <div onClick={() => setShowReassortModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.72)', backdropFilter: 'blur(4px)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px' }}>
                          <div onClick={e => e.stopPropagation()} className="carte" style={{ width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', marginBottom: 0, padding: isMobile ? '16px' : '22px', borderRadius: '20px', background: 'var(--bg-card)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                  <div>
                                      <span style={{ fontSize: '10.5px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Réassort Intelligent</span>
                                      <h3 style={{ margin: '2px 0 0 0', fontSize: '17px', color: 'var(--text-main)' }}>Préparer ma commande fournisseur</h3>
                                  </div>
                                  <button type="button" onClick={() => setShowReassortModal(false)} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: '800' }}>✕</button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                  <div>
                                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Fournisseur / Grossiste</label>
                                      <input
                                          type="text"
                                          list="liste-fournisseurs-coiffure"
                                          className="input-fournisseur"
                                          value={fournisseurCommande}
                                          onChange={e => changerFournisseurReassort(e.target.value)}
                                          placeholder="Ex: L'Oréal, Wella, Bleu Libellule..."
                                          style={{ marginBottom: 0 }}
                                      />
                                      <datalist id="liste-fournisseurs-coiffure">
                                          <option value="L'Oréal Professionnel" />
                                          <option value="Wella Professionals" />
                                          <option value="Schwarzkopf Professional" />
                                          <option value="Bleu Libellule" />
                                          <option value="Gouiran Beauté" />
                                      </datalist>
                                  </div>
                                  <div>
                                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>E-mail du commercial (mémorisé auto)</label>
                                      <input
                                          type="email"
                                          className="input-fournisseur"
                                          value={emailFournisseurCommande}
                                          onChange={e => setEmailFournisseurCommande(e.target.value)}
                                          placeholder="commercial@fournisseur.fr (optionnel)"
                                          style={{ marginBottom: 0 }}
                                      />
                                  </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto', marginBottom: '14px', paddingRight: '4px' }}>
                                  {lignesReassort.map((item, idx) => (
                                      <div key={item.id_article || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                                          <div style={{ minWidth: 0, flex: 1 }}>
                                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nom}</div>
                                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                  <span>Réf : <strong>{item.reference || 'N/A'}</strong></span>
                                                  <span>• Stock : <strong style={{ color: item.stock_actuel <= 2 ? 'var(--color-danger)' : 'var(--text-main)' }}>{item.stock_actuel}</strong></span>
                                                  {item.reference && (
                                                      <button type="button" onClick={() => { navigator.clipboard?.writeText(item.reference); showToast(`Réf "${item.reference}" copiée !`, "info"); }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', color: 'var(--text-main)' }}>
                                                          Copier réf.
                                                      </button>
                                                  )}
                                              </div>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700' }}>Qté :</span>
                                              <input
                                                  type="number"
                                                  min="1"
                                                  className="input-fournisseur"
                                                  value={item.quantite_commande}
                                                  onChange={e => {
                                                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                                      setLignesReassort(prev => prev.map((l, i) => i === idx ? { ...l, quantite_commande: val } : l));
                                                  }}
                                                  style={{ width: '58px', padding: '6px', marginBottom: 0, textAlign: 'center', fontWeight: '800' }}
                                              />
                                              <button type="button" onClick={() => setLignesReassort(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontWeight: '800', padding: '4px' }}>✕</button>
                                          </div>
                                      </div>
                                  ))}
                              </div>

                              <input
                                  type="text"
                                  className="input-fournisseur"
                                  placeholder="Note optionnelle (ex: Livraison souhaitée avant vendredi, franco de port...)"
                                  value={noteCommande}
                                  onChange={e => setNoteCommande(e.target.value)}
                                  style={{ marginBottom: '14px', fontSize: '12.5px' }}
                              />

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px' }}>
                                  <button type="button" onClick={copierListeReassort} style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '11px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                                      1. Copier la liste (Site / WhatsApp)
                                  </button>
                                  <button type="button" disabled={isSendingCommande} onClick={telechargerBonCommandePdf} style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '11px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                                      2. Télécharger le Bon (.PDF)
                                  </button>
                                  <button type="button" disabled={isSendingCommande} onClick={envoyerBonCommandeParMail} className="btn-action" style={{ padding: '11px 12px', borderRadius: '10px', fontSize: '12px' }}>
                                      3. Envoyer au commercial
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* MODALE DU SCANNER CAMÉRA DANS L'ONGLET STOCKS */}
                  {scannerModalMode && (
                      <div onClick={fermerScannerCodeBarre} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.75)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                          <div onClick={e => e.stopPropagation()} className="carte" style={{ width: '100%', maxWidth: '420px', marginBottom: 0, padding: '20px', borderRadius: '20px', background: 'var(--bg-card)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                  <div>
                                      <span style={{ fontSize: '10.5px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                          Inventaire & Réception
                                      </span>
                                      <h3 style={{ margin: '2px 0 0 0', fontSize: '16.5px', color: 'var(--text-main)' }}>Scanner un Code-Barres</h3>
                                  </div>
                                  <button type="button" onClick={fermerScannerCodeBarre} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: '800' }}>✕</button>
                              </div>

                              <div id="stack-barcode-reader" style={{ width: '100%', minHeight: '220px', borderRadius: '14px', overflow: 'hidden', background: '#111827', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12.5px' }}>
                                  Ouverture de la caméra...
                              </div>

                              <div style={{ display: 'flex', gap: '8px' }}>
                                  <input
                                      type="text"
                                      className="input-fournisseur"
                                      placeholder="Ou saisir / biper la référence EAN..."
                                      value={codeBarreManuel}
                                      onChange={e => setCodeBarreManuel(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') traiterCodeBarreDetecte(codeBarreManuel, scannerModalMode); }}
                                      style={{ marginBottom: 0, flex: 1 }}
                                  />
                                  <button type="button" onClick={() => traiterCodeBarreDetecte(codeBarreManuel, scannerModalMode)} className="btn-action" style={{ padding: '0 16px', borderRadius: '10px', fontSize: '12.5px' }}>
                                      Valider
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}

                  {isStockMergeMode && (
                      <div className="carte" style={{ background: 'var(--bg-info)', border: '1px solid #bfdbfe', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-info)' }}>
                              Mode sélection multiple actif : cochez les doublons à fusionner ({selectedStocksToMerge.length} sélectionné{selectedStocksToMerge.length > 1 ? 's' : ''})
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                  onClick={() => {
                                      setIsStockMergeMode(false);
                                      setSelectedStocksToMerge([]);
                                  }} 
                                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  Annuler
                              </button>
                              <button 
                                  onClick={() => {
                                      if (selectedStocksToMerge.length < 2) {
                                          showToast("Sélectionnez au moins 2 produits à unifier.", "error");
                                          return;
                                      }
                                      const premier = stocksData.find(s => s.id_article === selectedStocksToMerge[0]);
                                      setMergeForm({
                                          nom: premier?.nom || '',
                                          reference: '',
                                          prix: '',
                                          type_article: premier?.type_article || 'PRODUIT_REVENTE',
                                          delai_livraison_jours: 3,
                                          id_employe: '',
                                          code_pin: ''
                                      });
                                      setShowMergeModal(true);
                                  }} 
                                  disabled={selectedStocksToMerge.length < 2}
                                  className="btn-action"
                                  style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', opacity: selectedStocksToMerge.length < 2 ? 0.5 : 1 }}
                              >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  Valider la fusion
                              </button>
                          </div>
                      </div>
                  )}

                  {/* ZONE DÉFILANTE */}
                  <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                  {showAddProduit && (
                      <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
                          <h3 style={{marginTop: 0}}>Nouveau Produit (Revente/Labo)</h3>
                          <div style={{display: 'flex', gap: '12px'}}>
                            <input type="text" className="input-fournisseur" placeholder="Nom du produit (Laissez vide si réassort)" value={newArticle.nom} onChange={(e) => setNewArticle({...newArticle, nom: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Prix (€)" style={{width: '100px'}} value={newArticle.prix} onChange={(e) => setNewArticle({...newArticle, prix: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                          </div>
                          <div style={{display: 'flex', gap: '12px', marginTop: '12px', marginBottom: '16px'}}>
                            <input type="text" className="input-fournisseur" placeholder="Réf." style={{width: '120px'}} value={newArticle.reference} onChange={(e) => setNewArticle({...newArticle, reference: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Qté" style={{width: '70px'}} value={newArticle.stock_actuel} onChange={(e) => setNewArticle({...newArticle, stock_actuel: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                            <input type="number" className="input-fournisseur" placeholder="Délai (j)" title="Délai moyen de livraison (jours)" style={{width: '90px'}} value={newArticle.delai_livraison_jours} onChange={(e) => setNewArticle({...newArticle, delai_livraison_jours: e.target.value, type_article: 'PRODUIT_REVENTE'})} />
                          </div>
                          <button className="btn-action" onClick={() => { setNewArticle({...newArticle, type_article: 'PRODUIT_REVENTE'}); ajouterArticle(); setShowAddProduit(false); }} disabled={!newArticle.reference} style={{width: '100%'}}>{!newArticle.nom ? 'Mettre à jour le stock' : 'Ajouter au catalogue'}</button>
                      </div>
                  )}

                  <div className="carte scan-carte">
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', paddingBottom: isStockExpanded ? '16px' : '0'}} onClick={() => setIsStockExpanded(!isStockExpanded)}>
                          <h3 style={{margin: 0, color: 'var(--text-main)'}}>État des Stocks</h3>
                          <span style={{fontSize: '20px', color: 'var(--text-secondary)'}}>{isStockExpanded ? '▲' : '▼'}</span>
                      </div>
                      
                      {isStockExpanded && (
                          <>
                              <div style={{display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap'}}>
                                  <input type="text" className="input-fournisseur" placeholder="Chercher un produit..." value={stockSearch} onChange={e => setStockSearch(e.target.value)} style={{flex: 1, minWidth: '200px'}} />
                                  <select className="input-fournisseur" value={stockSortBy} onChange={e => setStockSortBy(e.target.value)} style={{width: 'auto', minWidth: '150px'}}>
                                      <option value="nom">Trier par: Nom (A-Z)</option>
                                      <option value="stock">Trier par: Quantité</option>
                                  </select>
                              </div>
                              <div className="stock-container">
                                {stocksData
                                    .filter(p => p.nom.toLowerCase().includes(stockSearch.toLowerCase()))
                                    .sort((a, b) => {
                                        if (stockSortBy === 'nom') return a.nom.localeCompare(b.nom);
                                        if (stockSortBy === 'stock') return a.stock_actuel - b.stock_actuel;
                                        return 0;
                                    })
                                    .map((produit) => {
                                    const status = getStockStatus(produit.stock_actuel);
                                    const tendance = getTendanceStock(produit);
                                    const isSelectedForMerge = selectedStocksToMerge.includes(produit.id_article);
                                    return (
                                        <div 
                                            className="stock-item" 
                                            key={produit.id_article} 
                                            onClick={() => {
                                                if (isStockMergeMode) {
                                                    if (isSelectedForMerge) {
                                                        setSelectedStocksToMerge(selectedStocksToMerge.filter(id => id !== produit.id_article));
                                                    } else {
                                                        setSelectedStocksToMerge([...selectedStocksToMerge, produit.id_article]);
                                                    }
                                                }
                                            }}
                                            style={{ position: 'relative', cursor: isStockMergeMode ? 'pointer' : 'default', background: isSelectedForMerge ? 'var(--bg-info)' : 'var(--bg-card)' }}
                                        >
                                            <div className="stock-info">
                                                <div className="stock-details">
                                                    {isStockMergeMode && (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelectedForMerge} 
                                                            onChange={() => {}} 
                                                            style={{ width: '18px', height: '18px', accentColor: 'var(--btn-primary)', cursor: 'pointer', marginRight: '4px' }} 
                                                        />
                                                    )}
                                                    <span className="stock-nom">{produit.nom}</span>
                                                    <span className="badge-discret" style={{ backgroundColor: status.bg, color: status.text }}>{status.label}</span>
                                                    {tendance && <span className="badge-discret" style={{ backgroundColor: 'var(--bg-info)', color: tendance.couleur }} title={tendance.date ? `Rupture estimée le ${new Date(tendance.date).toLocaleDateString()}` : ''}>{tendance.texte}</span>}
                                                </div>
                                            </div>
                                            <div className="stock-quantite-container" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                                <span className="stock-quantite">{produit.stock_actuel}</span>
                                                {!isStockMergeMode && (
                                                    <button onClick={(e) => { e.stopPropagation(); setStockMenuOuvert(stockMenuOuvert === produit.id_article ? null : produit.id_article); }} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '18px', fontWeight: 'bold', lineHeight: 1}}>⋮</button>
                                                )}
                                            </div>
                                        {stockMenuOuvert === produit.id_article && (
                                            <>
                                                <div onClick={() => setStockMenuOuvert(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                                <div className="chat-msg-menu" style={{top: '100%', bottom: 'auto', zIndex: 999, width: '170px'}}>
                                                    <button onClick={() => { setModifStockDialog({ id_article: produit.id_article, nom: produit.nom, valeur: produit.stock_actuel }); setStockMenuOuvert(null); }}>Modifier la quantité</button>
                                                    <button onClick={() => { setStockMenuOuvert(null); setConfirmDialog({ titre: "Supprimer le produit", message: `Voulez-vous vraiment supprimer "${produit.nom}" du catalogue ? Cette action est irréversible.`, btnTexte: "Supprimer", action: () => supprimerArticle(produit.id_article) }); }} style={{color: 'var(--color-danger)'}}>Supprimer</button>
                                                </div>
                                            </>
                                        )}
                                      </div>
                                    );
                                })}
                                {stocksData.length === 0 && <div className="empty-state"><SvgEmptyState /><p>Aucun produit en stock.</p></div>}
                              </div>
                          </>
                      )}
                  </div>
                  </div> {/* FIN ZONE DÉFILANTE */}
                </div>

  );
};

export default StocksTab;
