import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import SvgEmptyState from '../common/SvgEmptyState';
import { COULEURS_EMPLOYES } from '../../constants/theme';
import { nettoyerTexteRecherche, formatNomClient } from '../../utils/text';

export const CaisseTab = ({
  checklistOnboarding = {},
  basculerEtapeChecklist,
  planEmpreinteOnboarding,
  setPlanEmpreinteOnboarding,
  lancerPaiementStripe,
  ouvrirScannerCodeBarre,
  fermerScannerCodeBarre,
  scannerModalMode,
  codeBarreManuel,
  setCodeBarreManuel,
  traiterCodeBarreDetecte,
  showAddClient,
  setShowAddClient,
  newClient,
  setNewClient,
  ajouterClient,
  posEmploye,
  setPosEmploye,
  employesListe = [],
  getStatutPointageEmploye,
  handleSelectEmployeCaisse,
  showToast,
  isMobile,
  posType,
  setPosType,
  rechercheCaisse,
  setRechercheCaisse,
  catalogueListe = [],
  ajouterAuPanier,
  retirerDuPanier,
  ticketGenere,
  setTicketGenere,
  emailTicketClient,
  setEmailTicketClient,
  telephoneTicketClient,
  setTelephoneTicketClient,
  isOffline,
  envoyerTicketEco,
  clientCaisse,
  setClientCaisse,
  clientsSuggeres = [],
  setClientsSuggeres,
  clientsListe = [],
  clientCaisseObj,
  configSalon = {},
  panierCaisse = [],
  isEligibleFidelite,
  isWinbackOffer,
  texteRecompense,
  remiseAppliquee,
  setRemiseAppliquee,
  showPourboireInput,
  setShowPourboireInput,
  pourboireCaisse,
  setPourboireCaisse,
  sousTotalCaisse = 0,
  montantPourboireFinal = 0,
  totalCaisse = 0,
  acompteADeduire = 0,
  netAPayer,
  methodePaiement,
  setMethodePaiement,
  notificationCaisse,
  validerEncaisser,
  isEmployeCaisseBloque,
  statutCaisseCourant = { bloque: false, label: '' },
  setPosStep,
}) => {
  return (
    <>
      {/* 1. ÉCRAN BLOQUANT : CHECKLIST GO-LIVE ONBOARDING */}
      {checklistOnboarding?.statut_onboarding !== 'TERMINE' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: '75px',
          zIndex: 9990,
          backgroundColor: 'var(--bg-primary, #f6f6f7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          overflowY: 'auto'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '560px',
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              border: '1px solid #fecaca'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
      
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 8px 0', color: 'var(--text-primary, #111827)' }}>
              Caisse Verrouillée — Checklist Go-Live Requise
            </h2>
            <p style={{ fontSize: '13.5px', color: '#6b7280', lineHeight: 1.5, margin: '0 0 24px 0' }}>
              Pour garantir la conformité fiscale NF525, validez ces 5 vérifications de mise en service avec votre agent STACK pour débloquer vos encaissements.
            </p>
      
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
              {[
                { key: 'etape_materiel_ok', title: '1. Matériel & Imprimante connectés', desc: 'Tablette/PC configuré et impression ticket testée.' },
                { key: 'etape_catalogue_ok', title: '2. Catalogue de prestations paramétré', desc: 'Prestations, produits, tarifs TTC et TVA vérifiés.' },
                { key: 'etape_equipe_ok', title: '3. Collaborateurs & Codes PIN créés', desc: 'Comptes employés actifs pour la pointeuse et la caisse.' },
                { key: 'etape_stripe_ok', title: '4. Empreinte Bancaire Stripe (0 € aujourd’hui — Essai 30j)', desc: 'Enregistrement sécurisé de la CB sur Stripe (aucun débit avant la fin des 30 jours d’essai gratuit).' },
                { key: 'etape_formation_ok', title: '5. Formation Clôture Z de caisse effectuée', desc: 'Procédure Blind Close NF525 expliquée au gérant.' }
              ].map(item => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: checklistOnboarding[item.key] ? '1.5px solid #16a34a' : '1px solid var(--border-color, #e5e7eb)',
                    backgroundColor: checklistOnboarding[item.key] ? 'rgba(22, 163, 74, 0.06)' : 'transparent'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!checklistOnboarding[item.key]}
                      onChange={() => basculerEtapeChecklist(item.key)}
                      style={{ width: '19px', height: '19px', marginTop: '2px', accentColor: '#16a34a', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary, #111827)' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                  </label>

                  {item.key === 'etape_stripe_ok' && !checklistOnboarding.etape_stripe_ok && (
                    <div style={{ paddingLeft: '31px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={planEmpreinteOnboarding}
                        onChange={e => setPlanEmpreinteOnboarding(e.target.value)}
                        style={{
                          padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)',
                          fontSize: '12px', fontWeight: '700', backgroundColor: 'var(--bg-card, #fff)', color: 'var(--text-main, #111827)'
                        }}
                      >
                        <option value="PREMIUM">Après 30j : Premium (99 € HT/m)</option>
                        <option value="PRO">Après 30j : Pro (69 € HT/m)</option>
                        <option value="ESSENTIAL">Après 30j : Essential (39 € HT/m)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => lancerPaiementStripe(planEmpreinteOnboarding)}
                        className="btn-action"
                        style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '8px' }}
                      >
                        Enregistrer l’empreinte CB (0,00 €) →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. INTERFACE PRINCIPALE DE CAISSE */}
      <div className="admin-container caisse-split-container">
        {/* LEFT PANEL - CATALOGUE */}
        <div className={`caisse-left-panel ${!posEmploye ? 'caisse-left-panel--waiting' : ''}`}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
            <div><h1 style={{margin: 0}}>Caisse</h1></div>
            <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => ouvrirScannerCodeBarre('CAISSE')}
                style={{ background: 'var(--bg-app)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: '0 14px', borderRadius: '999px', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: '700', fontSize: '12.5px' }}
                title="Scanner un produit à encaisser"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>
                <span>Scanner</span>
              </button>
              <button onClick={() => setShowAddClient(!showAddClient)} className="btn-action" style={{width: '40px', height: '40px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}} title="Nouveau Client">+</button>
            </div>
          </div>

          {/* MODALE UNIVERSELLE DU SCANNER CAMÉRA (CAISSE & STOCKS) */}
          {scannerModalMode && (
            <div onClick={fermerScannerCodeBarre} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.75)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
              <div onClick={e => e.stopPropagation()} className="carte" style={{ width: '100%', maxWidth: '420px', marginBottom: 0, padding: '20px', borderRadius: '20px', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10.5px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {scannerModalMode === 'STOCKS' ? 'Inventaire & Réception' : 'Encaissement Rapide'}
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

          {showAddClient && (
            <div className="carte scan-carte" style={{marginBottom: '24px', animation: 'fadeIn 0.3s ease'}}>
              <h3 style={{marginTop: 0}}>Nouveau Client</h3>
              <div style={{display: 'flex', gap: '12px', marginBottom: '12px'}}>
                <input type="text" className="input-fournisseur" placeholder="Prénom" value={newClient.prenom} onChange={(e) => setNewClient({...newClient, prenom: e.target.value})} />
                <input type="text" className="input-fournisseur" placeholder="Nom" value={newClient.nom} onChange={(e) => setNewClient({...newClient, nom: e.target.value})} />
              </div>
              <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                <input type="tel" className="input-fournisseur" placeholder="Téléphone" value={newClient.telephone} onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} />
                <input type="date" className="input-fournisseur" placeholder="Date de naissance" value={newClient.date_naissance} onChange={(e) => setNewClient({...newClient, date_naissance: e.target.value})} />
              </div>
              <button className="btn-action" onClick={() => {ajouterClient(); setShowAddClient(false);}} disabled={!newClient.nom} style={{width: '100%'}}>Enregistrer le client</button>
            </div>
          )}

          {!posEmploye ? (
            <div className="carte">
              <h3 style={{color: 'var(--text-main)', marginBottom: '16px', fontWeight: '600', fontSize: '16px'}}>1. Qui réalise la vente ?</h3>
              {(employesListe || []).length === 0 ? (
                <div className="empty-state"><p>Aucun collaborateur enregistré.</p></div>
              ) : (
                <div className="grid-collaborateurs">
                  {(employesListe || []).map((emp, index) => {
                    const st = getStatutPointageEmploye(emp);
                    const bloque = st.bloque;
                    return (
                      <div key={emp.id_employe} 
                        onClick={(e) => {
                          if (bloque) {
                            e.preventDefault();
                            e.stopPropagation();
                            showToast(`Encaissement verrouillé : ${(emp.nom || '').split(' ')[0]} (${st.label}). Pointage requis dans l'Agenda.`, "error");
                            return;
                          }
                          handleSelectEmployeCaisse(emp.id_employe);
                        }} 
                        className={bloque ? "" : "hover-lift"}
                        style={{ 
                          background: bloque ? 'var(--bg-app)' : COULEURS_EMPLOYES[index % COULEURS_EMPLOYES.length], 
                          color: bloque ? 'var(--text-muted)' : '#111827', 
                          padding: '20px 12px', 
                          borderRadius: 'var(--radius-card)', 
                          border: bloque ? '1px dashed var(--border-color)' : '1px solid transparent',
                          fontSize: '16px', 
                          fontWeight: '600', 
                          textAlign: 'center', 
                          cursor: bloque ? 'not-allowed' : 'pointer', 
                          boxShadow: bloque ? 'none' : 'var(--shadow-sm)', 
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                          opacity: bloque ? 0.65 : 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          userSelect: 'none',
                          WebkitUserSelect: 'none'
                        }}>
                        <span>{(emp.nom || 'Inconnu').split(' ')[0]}</span>
                        {bloque && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600', color: 'var(--color-danger)', background: 'var(--bg-danger)', padding: '2px 8px', borderRadius: '999px' }}>
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            {st.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{display: 'flex', gap: '12px', marginBottom: '16px'}}>
                <button onClick={() => { setPosType('PRESTATION'); setRechercheCaisse(''); }} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', background: posType === 'PRESTATION' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRESTATION' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Prestations</button>
                <button onClick={() => { setPosType('PRODUIT_REVENTE'); setRechercheCaisse(''); }} style={{flex: 1, padding: '16px', borderRadius: 'var(--radius-card)', background: posType === 'PRODUIT_REVENTE' ? 'var(--text-main)' : 'var(--bg-card)', color: posType === 'PRODUIT_REVENTE' ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s ease'}}>Produits</button>
              </div>
              <input type="text" className="input-fournisseur" placeholder="Rechercher un article ou un code-barres..." value={rechercheCaisse} onChange={e => setRechercheCaisse(e.target.value)} style={{marginBottom: '24px', fontSize: '15px'}} />
              
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', overflowY: 'auto', paddingBottom: '20px', maxHeight: isMobile ? '40vh' : 'none'}}>
                {(catalogueListe || [])
                  .filter(art => {
                    if (art.type_article !== posType) return false;
                    if (!rechercheCaisse) return true;
                    const searchClean = nettoyerTexteRecherche(rechercheCaisse);
                    const nomClean = nettoyerTexteRecherche(art.nom);
                    return nomClean.includes(searchClean);
                  })
                  .map(art => (
                    <div key={art.id_article} onClick={() => ajouterAuPanier(art)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100px', transition: 'transform 0.1s'}} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                      <span style={{fontWeight: '600', fontSize: '13px', color: 'var(--text-main)'}}>{art.nom}</span>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span style={{fontWeight: 'bold', color: 'var(--btn-primary)'}}>{parseFloat(art.prix || 0).toFixed(2)}€</span>
                        {posType === 'PRODUIT_REVENTE' && <span style={{fontSize: '11px', color: 'var(--text-secondary)'}}>Stock: {art.stock_actuel}</span>}
                      </div>
                    </div>
                  ))}
              </div>
              {(catalogueListe || []).filter(art => art.type_article === posType).length === 0 && (
                <div className="empty-state"><SvgEmptyState /><p>Aucun élément dans cette catégorie.</p></div>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL - PANIER & ENCAISSEMENT (FLOATING ACTION BAR SUR MOBILE) */}
        <div className={`caisse-right-panel ${!posEmploye ? 'caisse-right-panel--waiting' : ''}`}>
          {ticketGenere ? (
            <div style={{padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center'}}>
              <div style={{color: 'var(--color-success)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
              <h2 style={{marginTop: 0, marginBottom: '8px', color: 'var(--text-main)', fontSize: '24px'}}>Paiement Validé</h2>
              {ticketGenere.is_offline && <span style={{fontSize: '12px', color: 'var(--color-danger)', fontWeight: 'bold'}}>Ticket sauvegardé hors-ligne</span>}
              <h1 style={{color: 'var(--text-main)', fontSize: '40px', margin: '0 0 24px 0', letterSpacing: '-0.02em'}}>{ticketGenere.montant.toFixed(2)} <span style={{fontSize: '24px', color: 'var(--text-secondary)'}}>€</span></h1>
              
              <div style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: 'var(--radius-card)', marginBottom: '24px', textAlign: 'left'}}>
                <span style={{fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Reçu dématérialisé (Loi anti-gaspillage)</span>
                <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}><input type="email" className="input-fournisseur" placeholder="Email du client" value={emailTicketClient} onChange={e => setEmailTicketClient(e.target.value)} style={{flex: 1}}/><button className="btn-action" onClick={() => { if (isOffline || !navigator.onLine) return showToast("Envoi impossible sans réseau.", "error"); if (!emailTicketClient) return showToast("Saisissez d'abord l'email du client.", "error"); envoyerTicketEco('email'); }}>Envoyer</button></div>
                {ticketGenere.client_id ? (
                  <button className="btn-action" onClick={() => envoyerTicketEco('sms')} disabled={isOffline || !navigator.onLine} style={{width: '100%'}}>Envoyer par SMS ({ticketGenere.client_nom})</button>
                ) : (
                  <div style={{display: 'flex', gap: '8px'}}>
                    <input type="tel" className="input-fournisseur" placeholder="Numéro du client" value={telephoneTicketClient} onChange={e => setTelephoneTicketClient(e.target.value)} style={{flex: 1}} />
                    <button className="btn-action" onClick={() => { if (isOffline || !navigator.onLine) return showToast("Envoi impossible sans réseau.", "error"); if (!telephoneTicketClient) return showToast("Saisissez d'abord le numéro du client.", "error"); envoyerTicketEco('sms'); }}>Envoyer</button>
                  </div>
                )}
              </div>
              <button onClick={() => { setTicketGenere(null); setPosEmploye(null); setClientsSuggeres([]); }} className="hover-text-main" style={{background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: '500', cursor: 'pointer', padding: '10px', transition: 'color 0.15s'}}>Fermer (Sans reçu)</button>
            </div>
          ) : (
            <>
              <div style={{padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-app)'}}>
                <div className="ticket-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <h3 style={{margin: 0, color: 'var(--text-main)', fontSize: '16px'}}>Ticket en cours</h3>
                  {posEmploye && <button onClick={() => { setPosEmploye(null); setClientsSuggeres([]); }} style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer', textDecoration:'underline'}}>Changer employé</button>}
                </div>
                <select className="input-fournisseur" value={clientCaisse || ''} onChange={e => { setClientCaisse(e.target.value); setRemiseAppliquee(false); }} style={{marginBottom: 0, background: 'var(--bg-card)'}}>
                  <option value="">👤 Client de passage...</option>
                  {(clientsSuggeres || []).map(c => <option key={c.id_client} value={c.id_client.toString()}>⚡ RDV : {c.nom} {c.prenom} ({c.prestation_rdv})</option>)}
                  {(clientsListe || []).map(c => <option key={c.id_client} value={c.id_client.toString()}>{c.nom} {c.prenom}</option>)}
                </select>

                {/* AFFICHAGE DU SOLDE DE FIDÉLITÉ ET DE L'OFFRE WINBACK EN TEMPS RÉEL */}
                {clientCaisseObj && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {configSalon.fidelite_type === 'POINTS' && (
                      <span style={{ fontSize: '12px', background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontWeight: '600' }}>
                        Points : {clientCaisseObj.points_fidelite || 0} / {configSalon.fidelite_points_seuil}
                      </span>
                    )}
                    {configSalon.fidelite_type === 'TAMPONS' && (
                      <span style={{ fontSize: '12px', background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontWeight: '600' }}>
                        Visites : {clientCaisseObj.tampons_fidelite || 0} / {configSalon.fidelite_tampons_seuil}
                      </span>
                    )}
                    {clientCaisseObj.remise_winback && (
                      <span style={{ fontSize: '12px', background: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                        🎁 Offre Winback : {clientCaisseObj.remise_winback}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="ticket-lignes" style={{padding: '16px'}}>
                {(panierCaisse || []).length === 0 ? (
                  <div className="empty-state" style={{marginTop: '10px'}}><p>Le ticket est vide.</p></div>
                ) : (
                  (panierCaisse || []).map(item => (
                    <div key={item.id_article} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <span style={{background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: 'var(--text-main)'}}>{item.quantite}x</span>
                        <span style={{color: 'var(--text-main)'}}>{item.nom}</span>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                        <span style={{fontWeight: '600', color: 'var(--text-main)'}}>{((item.prix_unitaire || 0) * (item.quantite || 1)).toFixed(2)}€</span>
                        <button onClick={() => retirerDuPanier(item.id_article)} style={{background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0}}>✕</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{padding: '16px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)'}}>
                {isEligibleFidelite && (
                  <div style={{background: isWinbackOffer ? 'var(--bg-danger)' : 'var(--bg-info)', padding: '12px', borderRadius: 'var(--radius-input)', marginBottom: '16px', border: `1px solid ${isWinbackOffer ? 'var(--border-danger, #fca5a5)' : 'var(--border-color)'}`}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div>
                        <span style={{fontSize: '12px', fontWeight: 'bold', color: isWinbackOffer ? 'var(--color-danger)' : 'var(--color-info)', display: 'block'}}>
                          {isWinbackOffer ? '❤️ Opération Pardon Client :' : (configSalon.fidelite_type === 'POINTS' ? 'Palier fidélité atteinte !' : 'Carte complétée !')}
                        </span>
                        <span style={{fontSize: '12px', color: isWinbackOffer ? 'var(--color-danger)' : 'var(--color-info)'}}> {texteRecompense}</span>
                      </div>
                      {!remiseAppliquee ? (
                        <button onClick={() => setRemiseAppliquee(true)} style={{background: 'var(--color-info)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>Appliquer</button>
                      ) : (
                        <span style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--color-success)'}}>Appliquée</span>
                      )}
                    </div>
                  </div>
                )}
                
                {remiseAppliquee && (configSalon.fidelite_type !== 'NONE' || isWinbackOffer) && (
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px', color: 'var(--color-success)'}}>
                    <span style={{fontWeight: 'bold'}}>{isWinbackOffer ? 'Offre Spéciale Appliquée' : 'Remise Fidélité'}</span>
                    <span style={{fontWeight: 'bold'}}>-{Math.max(0, sousTotalCaisse - totalCaisse + montantPourboireFinal).toFixed(2)} €</span>
                  </div>
                )}

                {/* BLOC POURBOIRE ÉPURÉ */}
                <div style={{ marginBottom: '16px' }}>
                  {!showPourboireInput && !pourboireCaisse ? (
                    <button 
                      onClick={() => setShowPourboireInput(true)} 
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                    >
                      Ajouter un pourboire
                    </button>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '14px' }}>Pourboire</span>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="number" 
                          min="0"
                          placeholder="0.00"
                          value={pourboireCaisse}
                          onChange={(e) => setPourboireCaisse(e.target.value)}
                          style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}
                          autoFocus
                        />
                        <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>€</span>
                        <button onClick={() => { setPourboireCaisse(''); setShowPourboireInput(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', marginLeft: '4px' }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {acompteADeduire > 0 && (
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '13px', color: '#047857', background: '#ecfdf5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0'}}>
                    <span style={{fontWeight: '700'}}>💳 Acompte réservation réglé en ligne</span>
                    <span style={{fontWeight: '800'}}>-{acompteADeduire.toFixed(2)} €</span>
                  </div>
                )}

                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '18px', fontWeight: 'bold', color: 'var(--text-main)'}}>
                  <span>{acompteADeduire > 0 ? "Solde net à régler" : "Total TTC"}</span>
                  <span>{(netAPayer !== undefined ? netAPayer : totalCaisse).toFixed(2)} €</span>
                </div>

                <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                  <button onClick={() => setMethodePaiement('CARTE')} disabled={isOffline || !navigator.onLine} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'CARTE' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'CARTE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CARTE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: (isOffline || !navigator.onLine) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', opacity: (isOffline || !navigator.onLine) ? 0.5 : 1, transition: 'all 0.15s'}}>TPE</button>
                  <button onClick={() => setMethodePaiement('ESPECES')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'ESPECES' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'ESPECES' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'ESPECES' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'}}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Espèces</button>
                  <button onClick={() => setMethodePaiement('CHEQUE')} style={{flex: 1, padding: '8px', borderRadius: '4px', border: methodePaiement === 'CHEQUE' ? '2px solid var(--btn-primary)' : '1px solid var(--border-color)', background: methodePaiement === 'CHEQUE' ? 'var(--text-main)' : 'var(--bg-app)', color: methodePaiement === 'CHEQUE' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'}}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Chèque</button>
                </div>

                {notificationCaisse && <div style={{padding: '12px', background: 'var(--bg-info)', color: 'var(--color-info)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold'}}>{notificationCaisse}</div>}
                
                <button onClick={validerEncaisser} className="btn-action" style={{width: '100%', padding: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}} disabled={!!notificationCaisse || (panierCaisse || []).length === 0 || !posEmploye || isEmployeCaisseBloque}>
                  {isEmployeCaisseBloque ? (
                    <>
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>Pointage requis ({statutCaisseCourant.label})</span>
                    </>
                  ) : notificationCaisse && notificationCaisse.includes('Envoi') ? (
                    "En attente du TPE..."
                  ) : (
                    `Encaisser ${(isOffline || !navigator.onLine) ? '(Hors-Ligne) ' : ''}${(netAPayer !== undefined ? netAPayer : totalCaisse).toFixed(2)} €`
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. MODAL SUGGESTION DE CLIENTS INTELLIGENTE */}
      {clientsSuggeres.length > 0 && (
        <div className="modal-overlay">
          <div className="modal-content" style={{textAlign: 'center'}}>
            <div style={{color: 'var(--btn-primary)', display: 'flex', justifyContent: 'center', marginBottom: '16px'}}><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
            <h2 style={{margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '20px'}}>{clientsSuggeres.length === 1 ? `Encaisser ${formatNomClient(clientsSuggeres[0])} ?` : "Quel client encaissez-vous ?"}</h2>
            <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px'}}>
              {clientsSuggeres.length === 1 
                ? "D'après l'agenda, c'est le client le plus probable à encaisser pour vous en ce moment." 
                : "D'après l'agenda, voici les clients que vous venez de coiffer, du plus ancien au plus récent."}
            </p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              {(clientsSuggeres || []).map((client, i) => (
                <button key={client.id_client} onClick={() => { setClientCaisse(client.id_client.toString()); setClientsSuggeres([]); setPosStep('type'); }} className="btn-action" style={{padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: i === 0 ? 'var(--btn-primary)' : 'var(--bg-app)', color: i === 0 ? 'white' : 'var(--text-main)', border: i === 0 ? 'none' : '1px solid var(--border-color)'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{fontSize: '16px'}}>{formatNomClient(client)}</span></div><span style={{fontSize: '12px', opacity: 0.8}}>{client.prestation_rdv}</span>
                </button>
              ))}
              <button onClick={() => { setClientCaisse(''); setClientsSuggeres([]); setPosStep('type'); }} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Aucun / Client de passage</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CaisseTab;
