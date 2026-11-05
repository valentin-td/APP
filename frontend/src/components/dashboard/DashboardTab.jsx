import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import { renderAvatar } from '../common/Avatar';
import { decodeToken } from '../../utils/auth';
import { API_URL } from '../../api/config';

const dessinerCourbe = (d) => { 
  if (!d || !Array.isArray(d) || d.length === 0) return null;
  const points = d.map((val, i) => `${(i / 5) * 120},${40 - ((val - 4.0) / 1.0) * 40}`).join(' '); 
  return <svg width="100%" height="40px" viewBox={`0 0 120 40`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>; 
};

export const DashboardTab = ({
  role,
  isMobile,
  isTablet,
  token,
  setActiveTab,
  handleTabClick,
  configSalon = {},
  dashboardData = {},
  salonDashboardData = {},
  employeDashboardData = {},
  empGamificationKpis,
  avisStats = {},
  planningData = {},
  employesListe = [],
  statutsEquipe = {},
  heureActuelle,
  mesSalonsGroupe = [],
  showMultiSalonModal,
  setShowMultiSalonModal,
  showFormNouveauSalon,
  setShowFormNouveauSalon,
  formNouveauSalon = {},
  setFormNouveauSalon,
  isCreatingSalon,
  isSwitchingSalon,
  nbTachesUrgentes = 0,
  isToday,
  setPointeuse,
  changerDeSalonActif,
  chargerMesSalons,
  creerNouveauSalonGroupe,
  getAuthHeaders,
  handleFetchError,
  showToast,
}) => {
  return (
    <>
              {role === 'salon' && (() => {
                const evoSalon = parseFloat(salonDashboardData?.evolution_pourcentage) || 0;
                const listeRdvsSalon = Array.isArray(planningData) ? planningData : (planningData?.rendez_vous || []);
                const rdvsAujourdhuiSalon = listeRdvsSalon.filter(r => r?.date_heure_debut && isToday(new Date(r.date_heure_debut.replace('Z', '')))).length;

                return (
                  <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                    <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h1 style={{ margin: 0 }}>Tableau de Bord</h1>
                            <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                              Poste Salon • #{decodeToken(token)?.id_salon}
                            </span>
                          </div>
                          <span className="date-subtitle" style={{ margin: '2px 0 0 0', display: 'block' }}>
                            {configSalon.nom_salon || 'Salon'} — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setActiveTab('caisse')}
                            className="btn-action"
                            style={{ padding: isMobile ? '9px 14px' : '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
                          >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                            <span>Ouvrir la Caisse</span>
                          </button>
                          <ThemeToggle />
                          <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                      {/* 3 KPIs Salon */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                        <div className="carte" style={{ padding: '20px 22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passages Clients (Mois)</span>
                            {salonDashboardData && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '999px', fontSize: '11.5px', fontWeight: '800',
                                background: evoSalon >= 0 ? 'var(--bg-success)' : 'var(--bg-danger)',
                                color: evoSalon >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                              }}>
                                {evoSalon >= 0 ? (
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>
                                )}
                                {Math.abs(evoSalon)}%
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                            {salonDashboardData?.nb_clients_mois ?? '—'}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}></span>
                        </div>

                        <div onClick={() => setActiveTab('agenda')} className="carte hover-lift" style={{ padding: '20px 22px', marginBottom: 0, borderRadius: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rendez-vous du Jour</span>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          </div>
                          <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                            {rdvsAujourdhuiSalon}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}></span>
                        </div>

                        <div onClick={() => setActiveTab('actions')} className="carte hover-lift" style={{ padding: '20px 22px', marginBottom: 0, borderRadius: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centre d'Action</span>
                            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: nbTachesUrgentes > 0 ? 'var(--color-danger)' : 'var(--color-success)' }} />
                          </div>
                          <div style={{ fontSize: '36px', fontWeight: '900', color: nbTachesUrgentes > 0 ? 'var(--color-danger)' : 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                            {nbTachesUrgentes}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{nbTachesUrgentes > 0 ? 'Tâche(s) prioritaire(s) à traiter' : ''}</span>
                        </div>
                      </div>

                      {/* WIDGET : L'ÉQUIPE EN DIRECT (SALON) */}
                      {configSalon.mode_suivi_heures === 'POINTEUSE' && (
                        <div className="carte" style={{ padding: isMobile ? '18px' : '22px', borderRadius: '18px', marginBottom: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Présence de l'Équipe en Direct</h3>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Statut de pointage en temps réel des collaborateurs</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPointeuse({ open: true, step: 1, employe: null, pin: '' })}
                              style={{ background: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', padding: '8px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                              Ouvrir la Pointeuse
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                            {(employesListe || []).map(emp => {
                              const statutData = statutsEquipe[emp.id_employe];
                              const statut = statutData ? statutData.action : null;
                              let pastilleCouleur = 'var(--text-muted)';
                              let badgeBg = 'var(--bg-card)';
                              let texteStatut = 'Non pointé';

                              if (statut === 'ENTREE' || statut === 'PAUSE_FIN') {
                                pastilleCouleur = 'var(--color-success)';
                                badgeBg = 'var(--bg-success)';
                                texteStatut = 'En service';
                              } else if (statut === 'PAUSE_DEBUT') {
                                pastilleCouleur = '#d97706';
                                badgeBg = 'rgba(245, 158, 11, 0.14)';
                                texteStatut = 'En pause';
                              } else if (statut === 'SORTIE') {
                                pastilleCouleur = 'var(--color-danger)';
                                badgeBg = 'var(--bg-danger)';
                                texteStatut = 'Service terminé';
                              }

                              return (
                                <div key={emp.id_employe} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'var(--bg-app)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    {renderAvatar(emp.photo_url, emp.nom, 38)}
                                    <div style={{ minWidth: 0 }}>
                                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nom}</span>
                                      <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{emp.role || 'Collaborateur'}</span>
                                    </div>
                                  </div>
                                  <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: badgeBg, color: pastilleCouleur, flexShrink: 0 }}>
                                    {texteStatut}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {role === 'employe' && (() => {
                const monIdEmp = decodeToken(token)?.id_employe;
                const monProfilEmp = (employesListe || []).find(e => e.id_employe === monIdEmp);
                const evoEmp = parseFloat(employeDashboardData?.evolution_pourcentage) || 0;
                const listeRdvsEmp = Array.isArray(planningData) ? planningData : (planningData?.rendez_vous || []);
                const mesRdvsJour = listeRdvsEmp
                  .filter(r => Number(r?.id_employe) === Number(monIdEmp) && r?.date_heure_debut && isToday(new Date(r.date_heure_debut.replace('Z', ''))))
                  .sort((a, b) => new Date(a.date_heure_debut.replace('Z', '')) - new Date(b.date_heure_debut.replace('Z', '')));

                const nbClientsMois = empGamificationKpis?.nb_clients_mois ?? employeDashboardData?.nb_clients_mois ?? 0;
                const commTotale = empGamificationKpis?.commission_totale ?? employeDashboardData?.commission_mois ?? 0;
                const commPresta = empGamificationKpis?.comm_prestation ?? 0;
                const commProduit = empGamificationKpis?.comm_produit ?? 0;
                const pourboiresMois = empGamificationKpis?.pourboires_mois ?? 0;
                const cagnotteGlobale = empGamificationKpis?.cagnotte_globale ?? commTotale;
                const nbProduits = empGamificationKpis?.nb_produits_vendus ?? employeDashboardData?.nb_produits_vendus ?? 0;
                const panierMoyenEmp = empGamificationKpis?.panier_moyen ?? 0;
                const tauxReventeEmp = empGamificationKpis?.taux_revente ?? 0;
                const tauxFidelisationEmp = empGamificationKpis?.taux_fidelisation ?? 0;

                // Système de paliers Gamification (Bronze -> Argent -> Or -> Élite)
                const paliers = [
                  { nom: 'Bronze', seuil: 100 },
                  { nom: 'Argent', seuil: 250 },
                  { nom: 'Or', seuil: 500 },
                  { nom: 'Élite STACK', seuil: 800 }
                ];
                const palierSuivant = paliers.find(p => cagnotteGlobale < p.seuil) || paliers[paliers.length - 1];
                const palierActuel = cagnotteGlobale >= 800 ? 'Élite STACK' : cagnotteGlobale >= 500 ? 'Or' : cagnotteGlobale >= 250 ? 'Argent' : 'Bronze';
                const progressionPalier = Math.min(100, Math.round((cagnotteGlobale / palierSuivant.seuil) * 100));
                const restePourPalier = Math.max(0, (palierSuivant.seuil - cagnotteGlobale)).toFixed(2);

                return (
                  <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                    <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {renderAvatar(monProfilEmp?.photo_url, monProfilEmp?.nom || 'Collaborateur', 46)}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Bonjour {(monProfilEmp?.nom || 'Collaborateur').split(' ')[0]}</h1>
                              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: 'var(--text-main)', color: 'var(--bg-card)' }}>
                                Rang {palierActuel}
                              </span>
                            </div>
                            <span className="date-subtitle" style={{ margin: 0 }}></span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <ThemeToggle />
                          <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                      {/* CARTE GAMIFICATION : PROGRESSION DU PALIER DE PRIMES DU MOIS */}
                      <div className="carte" style={{ padding: isMobile ? '16px 18px' : '18px 22px', marginBottom: '16px', borderRadius: '18px', border: '1.5px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Challenge Primes & Pourboires du mois
                            </span>
                            <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
                              {cagnotteGlobale >= 800
                                ? 'Palier maximum Élite atteint ce mois-ci !'
                                : `Plus que ${restePourPalier} € de primes pour débloquer le rang ${palierSuivant.nom}`}
                            </div>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: '900', color: 'var(--color-success)' }}>
                            {cagnotteGlobale.toFixed(2)} € / {palierSuivant.seuil} €
                          </span>
                        </div>
                        <div style={{ height: '8px', width: '100%', background: 'var(--bg-app)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                          <div style={{ height: '100%', width: `${progressionPalier}%`, background: 'var(--color-success)', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                      {/* OBJECTIFS FIXÉS PAR LE GÉRANT */}
                      {(empGamificationKpis?.objectifs_assignes || []).length > 0 && (
                        <div className="carte" style={{ padding: isMobile ? '16px 18px' : '18px 22px', marginBottom: '16px', borderRadius: '18px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Objectifs Mensuels du Salon
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                              {(empGamificationKpis.objectifs_assignes || []).filter(o => o.atteint).length} / {(empGamificationKpis.objectifs_assignes || []).length} validé(s)
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {empGamificationKpis.objectifs_assignes.map(obj => {
                              const unite = obj.type_indicateur === 'TAUX_REVENTE' ? '%' : (obj.type_indicateur === 'PRODUITS_VENDUS' || obj.type_indicateur === 'NB_CLIENTS') ? '' : ' €';
                              return (
                                <div key={obj.id_objectif} style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                    <div>
                                      <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>{obj.titre}</strong>
                                      {obj.recompense && (
                                        <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '800', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                                          Prime : {obj.recompense}
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: obj.atteint ? 'var(--color-success)' : 'var(--text-main)' }}>
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
                        </div>
                      )}

                      {/* GRILLE DES 4 KPIS PERSONNELS DE PERFORMANCE */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                        {/* KPI 1 : Cagnotte Primes + Pourboires */}
                        <div className="carte" style={{ padding: '16px 18px', marginBottom: 0, borderRadius: '18px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Cagnotte du Mois</span>
                          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '900', color: 'var(--color-success)', margin: '8px 0 4px 0' }}>
                            {cagnotteGlobale.toFixed(2)} <span style={{ fontSize: '14px' }}>€</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                            Presta: {commPresta.toFixed(0)}€ • Prod: {commProduit.toFixed(0)}€ {pourboiresMois > 0 ? `• PB: ${pourboiresMois.toFixed(0)}€` : ''}
                          </span>
                        </div>

                        {/* KPI 2 : Taux de Revente Produit (Upsell) */}
                        <div className="carte" style={{ padding: '16px 18px', marginBottom: 0, borderRadius: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taux Revente</span>
                            <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: tauxReventeEmp >= 20 ? 'var(--bg-success)' : 'var(--bg-app)', color: tauxReventeEmp >= 20 ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                              Obj. 20%
                            </span>
                          </div>
                          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '8px 0 4px 0' }}>
                            {tauxReventeEmp}%
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                            {nbProduits} produit{nbProduits > 1 ? 's' : ''} vendu{nbProduits > 1 ? 's' : ''} ce mois
                          </span>
                        </div>

                        {/* KPI 3 : Panier Moyen TTC */}
                        <div className="carte" style={{ padding: '16px 18px', marginBottom: 0, borderRadius: '18px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Panier Moyen</span>
                          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '8px 0 4px 0' }}>
                            {panierMoyenEmp.toFixed(2)} <span style={{ fontSize: '14px' }}>€</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                            Sur {nbClientsMois} passage{nbClientsMois > 1 ? 's' : ''} client
                          </span>
                        </div>

                        {/* KPI 4 : Clients Coiffés & Fidélisation */}
                        <div className="carte" style={{ padding: '16px 18px', marginBottom: 0, borderRadius: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clients Coiffés</span>
                            {employeDashboardData && (
                              <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '800', background: evoEmp >= 0 ? 'var(--bg-success)' : 'var(--bg-danger)', color: evoEmp >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {evoEmp >= 0 ? '+' : '-'}{Math.abs(evoEmp)}%
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '8px 0 4px 0' }}>
                            {nbClientsMois}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                            Fidélisation : <strong>{tauxFidelisationEmp}%</strong> de retour
                          </span>
                        </div>
                      </div>

                      {/* Rappel des RDV du jour de l'employé */}
                      <div className="carte" style={{ padding: isMobile ? '18px' : '22px', borderRadius: '18px', marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                          <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', color: 'var(--text-main)' }}>Mes Rendez-vous d'Aujourd'hui ({mesRdvsJour.length})</h3>
                          <button type="button" onClick={() => setActiveTab('agenda')} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                            Voir mon agenda
                          </button>
                        </div>
                        {mesRdvsJour.length === 0 ? (
                          <div style={{ padding: '18px', textAlign: 'center', background: 'var(--bg-app)', borderRadius: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            Aucun rendez-vous planifié aujourd'hui.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {mesRdvsJour.map(rdv => {
                              const dRdv = new Date(rdv.date_heure_debut.replace('Z', ''));
                              return (
                                <div key={rdv.id_rdv} onClick={() => setActiveTab('agenda')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-app)', borderRadius: '10px', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                  <div>
                                    <strong style={{ fontSize: '14px', color: 'var(--text-main)', display: 'block' }}>{rdv.nom_client}</strong>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{rdv.prestation || rdv.type_coupe} ({rdv.duree_minutes || 30} min)</span>
                                  </div>
                                  <span style={{ padding: '5px 10px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontWeight: '800', fontSize: '13px', color: 'var(--text-main)' }}>
                                    {dRdv.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {role === 'gerant' && (() => {
                const caTotalGerant = parseFloat(dashboardData?.finances?.chiffre_affaires_total) || 0;
                const panierMoyenGerant = parseFloat(dashboardData?.finances?.panier_moyen) || 0;
                const commissionsAPayerGerant = parseFloat(dashboardData?.finances?.commissions_a_payer) || 0;
                const noteMoyenneCampagne = avisStats?.note_moyenne || (dashboardData?.marketing?.note_actuelle > 0 ? dashboardData.marketing.note_actuelle : null);
                const npsScore = dashboardData?.marketing?.nps;
                const verbatimsListe = dashboardData?.marketing?.verbatims || [];

                const renderSvgStars = (noteVal, size = 13) => {
                  const n = Math.round(parseFloat(noteVal) || 0);
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map(idx => (
                        <svg key={idx} viewBox="0 0 24 24" width={size} height={size} fill={idx <= n ? '#f59e0b' : 'none'} stroke={idx <= n ? '#f59e0b' : 'var(--border-color)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      ))}
                    </span>
                  );
                };

                return (
                  <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
                    {/* EN-TÊTE FIXE EXECUTIVE (AVEC SÉLECTEUR MULTI-SALONS / FRANCHISE) */}
                    <div className={isMobile ? "mobile-fixed-header-top" : ""}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h1 style={{ margin: 0 }}>Tableau de Bord</h1>
                            <button
                              type="button"
                              onClick={() => { chargerMesSalons(); setShowMultiSalonModal(true); }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                padding: '5px 12px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                background: 'var(--bg-card)',
                                color: 'var(--text-main)',
                                border: '1.5px solid var(--border-color)',
                                cursor: 'pointer',
                                boxShadow: 'var(--shadow-sm)'
                              }}
                              title="Changer d'établissement ou ajouter un nouveau salon"
                            >
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--color-success)' }} />
                              <span>{configSalon.nom_salon || `Salon #${decodeToken(token)?.id_salon}`}</span>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>(#{decodeToken(token)?.id_salon})</span>
                              {(mesSalonsGroupe.salons || []).length > 1 && (
                                <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '10px', background: 'var(--text-main)', color: 'var(--bg-card)' }}>
                                  {mesSalonsGroupe.salons.length} salons
                                </span>
                              )}
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: 'var(--text-main)', color: 'var(--bg-card)' }}>
                              {configSalon.plan_actuel === 'PREMIUM_TRIAL' ? 'Essai Premium 30j' : (configSalon.plan_actuel || 'PREMIUM')}
                            </span>
                          </div>
                          <span className="date-subtitle" style={{ margin: '2px 0 0 0', display: 'block', textTransform: 'capitalize' }}>
                            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => { chargerMesSalons(); setShowMultiSalonModal(true); }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              fontSize: '12px',
                              fontWeight: '700',
                              background: 'var(--bg-card)',
                              color: 'var(--text-main)',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer'
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            {!isMobile && <span>Mes Salons ({Math.max(1, (mesSalonsGroupe.salons || []).length)})</span>}
                          </button>
                          <ThemeToggle />
                          <button onClick={() => setActiveTab('parametres')} className="theme-toggle-btn" title="Paramètres du salon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* MODALE MULTI-SALONS & FRANCHISE (SWITCH RAPIDE + AJOUT DE SUCCURSALE) */}
                    {showMultiSalonModal && (
                      <div className="modal-overlay" style={{ zIndex: 100000 }}>
                        <div className="modal-content" style={{ maxWidth: '620px', width: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
                          <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className="icon" style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--text-main)', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                              </div>
                              <div>
                                <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--text-main)' }}>Mes Établissements & Franchise</h3>
                                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Basculez d'une adresse à l'autre en 1 clic</span>
                              </div>
                            </div>
                            <button className="modal-close-btn" onClick={() => { setShowMultiSalonModal(false); setShowFormNouveauSalon(false); }}>
                              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>

                          {/* Synthèse consolidée du groupe si plusieurs salons */}
                          {mesSalonsGroupe.synthese_groupe && mesSalonsGroupe.synthese_groupe.nb_salons > 1 && (
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                              <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>CA Groupe (Mois)</span>
                                <strong style={{ fontSize: '18px', color: 'var(--text-main)' }}>{mesSalonsGroupe.synthese_groupe.ca_groupe_mois_ttc.toFixed(2)} €</strong>
                              </div>
                              <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>CA Groupe (Jour)</span>
                                <strong style={{ fontSize: '18px', color: 'var(--color-success)' }}>{mesSalonsGroupe.synthese_groupe.ca_groupe_jour_ttc.toFixed(2)} €</strong>
                              </div>
                              <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Effectif Total</span>
                                <strong style={{ fontSize: '18px', color: 'var(--text-main)' }}>{mesSalonsGroupe.synthese_groupe.total_employes_groupe} collab.</strong>
                              </div>
                            </div>
                          )}

                          {/* Liste des salons rattachés au gérant */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                            {(mesSalonsGroupe.salons || []).map(s => {
                              const estActif = Number(s.id_salon) === Number(decodeToken(token)?.id_salon);
                              return (
                                <div
                                  key={s.id_salon}
                                  onClick={() => !estActif && !isSwitchingSalon && changerDeSalonActif(s.id_salon)}
                                  style={{
                                    padding: '14px 16px',
                                    borderRadius: '14px',
                                    border: estActif ? '2px solid var(--text-main)' : '1px solid var(--border-color)',
                                    background: estActif ? 'var(--bg-app)' : 'var(--bg-card)',
                                    cursor: estActif ? 'default' : 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '12px',
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                      <strong style={{ fontSize: '14.5px', color: 'var(--text-main)' }}>{s.nom_salon}</strong>
                                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                        ID #{s.id_salon}
                                      </span>
                                      {estActif && (
                                        <span style={{ fontSize: '10.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-success)', color: 'var(--color-success)' }}>
                                          Établissement actif
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                      {s.adresse_salon || 'Adresse non renseignée'} {s.siret ? `• SIRET : ${s.siret}` : ''}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-main)' }}>
                                      <span>CA Mois : <strong>{Number(s.ca_mois_ttc || 0).toFixed(2)} €</strong></span>
                                      <span>• Équipe : <strong>{s.nb_employes || 1}</strong></span>
                                      <span style={{ color: s.z_fait_aujourdhui ? 'var(--color-success)' : 'var(--text-muted)' }}>
                                        • {s.z_fait_aujourdhui ? 'Z du jour clôturé ✓' : 'Z du jour en attente'}
                                      </span>
                                    </div>
                                  </div>

                                  {!estActif && (
                                    <button
                                      type="button"
                                      disabled={isSwitchingSalon}
                                      onClick={(e) => { e.stopPropagation(); changerDeSalonActif(s.id_salon); }}
                                      className="btn-action"
                                      style={{ padding: '9px 14px', fontSize: '12.5px', flexShrink: 0 }}
                                    >
                                      {isSwitchingSalon ? 'Bascule...' : 'Ouvrir ce salon'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {(mesSalonsGroupe.salons || []).length > 1 && !showFormNouveauSalon && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await fetch(`${API_URL}/api/mes-salons/synchroniser-catalogue`, {
                                    method: 'POST',
                                    headers: getAuthHeaders(true),
                                    credentials: 'include'
                                  });
                                  const data = await handleFetchError(res);
                                  showToast(data.message, "success");
                                } catch (e) {
                                  showToast(e.message || "Erreur de synchronisation.", "error");
                                }
                              }}
                              style={{
                                width: '100%',
                                marginBottom: '10px',
                                padding: '11px 14px',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-main)',
                                fontWeight: '700',
                                fontSize: '12.5px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                              <span>Propager le catalogue & les recettes de ce salon vers mes autres adresses</span>
                            </button>
                          )}

                          {/* Bouton ou Formulaire de création d'une nouvelle succursale */}
                          {!showFormNouveauSalon ? (
                            <button
                              type="button"
                              onClick={() => setShowFormNouveauSalon(true)}
                              style={{
                                width: '100%',
                                padding: '13px',
                                borderRadius: '12px',
                                border: '1.5px dashed var(--border-color)',
                                background: 'var(--bg-app)',
                                color: 'var(--text-main)',
                                fontWeight: '800',
                                fontSize: '13.5px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                            >
                              <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
                              <span>Ajouter un nouvel établissement / succursale</span>
                            </button>
                          ) : (
                            <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>Nouvel établissement rattaché à votre compte</strong>
                                <button type="button" onClick={() => setShowFormNouveauSalon(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>Annuler</button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '10px' }}>
                                <input
                                  type="text"
                                  className="input-fournisseur"
                                  placeholder="Nom du nouveau salon (ex: Maison Éclat — Lyon)"
                                  value={formNouveauSalon.nom_salon}
                                  onChange={e => setFormNouveauSalon({ ...formNouveauSalon, nom_salon: e.target.value })}
                                  style={{ marginBottom: 0, background: 'var(--bg-card)' }}
                                />
                                <input
                                  type="text"
                                  className="input-fournisseur"
                                  placeholder="Forme juridique (SASU, SARL...)"
                                  value={formNouveauSalon.forme_juridique}
                                  onChange={e => setFormNouveauSalon({ ...formNouveauSalon, forme_juridique: e.target.value })}
                                  style={{ marginBottom: 0, background: 'var(--bg-card)' }}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: '10px' }}>
                                <input
                                  type="text"
                                  className="input-fournisseur"
                                  placeholder="N° SIRET (14 chiffres de cette adresse)"
                                  value={formNouveauSalon.siret}
                                  onChange={e => setFormNouveauSalon({ ...formNouveauSalon, siret: e.target.value })}
                                  style={{ marginBottom: 0, background: 'var(--bg-card)' }}
                                />
                                <input
                                  type="text"
                                  className="input-fournisseur"
                                  placeholder="Adresse complète du nouvel établissement"
                                  value={formNouveauSalon.adresse_salon}
                                  onChange={e => setFormNouveauSalon({ ...formNouveauSalon, adresse_salon: e.target.value })}
                                  style={{ marginBottom: 0, background: 'var(--bg-card)' }}
                                />
                              </div>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                <input
                                  type="checkbox"
                                  checked={formNouveauSalon.copier_catalogue}
                                  onChange={e => setFormNouveauSalon({ ...formNouveauSalon, copier_catalogue: e.target.checked })}
                                  style={{ width: '16px', height: '16px' }}
                                />
                                <span>Dupliquer automatiquement mon catalogue de prestations et mes références produits (stocks initialisés à 0)</span>
                              </label>

                              {formNouveauSalon.copier_catalogue && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                  <input
                                    type="checkbox"
                                    checked={formNouveauSalon.copier_protocoles}
                                    onChange={e => setFormNouveauSalon({ ...formNouveauSalon, copier_protocoles: e.target.checked })}
                                    style={{ width: '16px', height: '16px' }}
                                  />
                                  <span>Dupliquer également mes recettes & tutoriels pas-à-pas de L'Académie</span>
                                </label>
                              )}

                              <button
                                type="button"
                                disabled={isCreatingSalon}
                                onClick={creerNouveauSalonGroupe}
                                className="btn-action"
                                style={{ width: '100%', padding: '12px' }}
                              >
                                {isCreatingSalon ? 'Création et clonage en cours...' : 'Créer et basculer sur ce nouvel établissement'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ZONE DÉFILANTE */}
                    <div style={isMobile ? { flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '120px' } : {}}>
                      {!dashboardData ? (
                        <div className="skeleton-loading" style={{ height: '220px', borderRadius: '18px' }}></div>
                      ) : (
                        <>
                          {/* 1. BANDEAU DES 4 KPIS FINANCIERS & SATISFACTION */}
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
                            {/* KPI 1 : Chiffre d'affaires */}
                            <div onClick={() => handleTabClick('admin')} className="carte hover-lift" style={{ padding: isMobile ? '16px' : '20px 22px', marginBottom: 0, borderRadius: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chiffre d'Affaires</span>
                                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                </div>
                              </div>
                              <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                                {caTotalGerant.toFixed(2)} <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '700' }}>€</span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}></span>
                            </div>

                            {/* KPI 2 : Panier Moyen */}
                            <div className="carte" style={{ padding: isMobile ? '16px' : '20px 22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Panier Moyen</span>
                                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                                </div>
                              </div>
                              <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                                {panierMoyenGerant.toFixed(2)} <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '700' }}>€</span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}></span>
                            </div>

                            {/* KPI 3 : Commissions Équipe */}
                            <div onClick={() => handleTabClick('rh')} className="carte hover-lift" style={{ padding: isMobile ? '16px' : '20px 22px', marginBottom: 0, borderRadius: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Primes Équipe</span>
                                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--bg-success)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                </div>
                              </div>
                              <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '900', color: 'var(--color-success)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                                {commissionsAPayerGerant.toFixed(2)} <span style={{ fontSize: '14px', fontWeight: '700' }}>€</span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}></span>
                            </div>

                            {/* KPI 4 : Satisfaction & NPS */}
                            <div className="carte" style={{ padding: isMobile ? '16px' : '20px 22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}> Satisfaction</span>
                                {npsScore !== null && npsScore !== undefined ? (
                                  <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: npsScore >= 0 ? 'var(--bg-success)' : 'var(--bg-danger)', color: npsScore >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                    NPS {npsScore > 0 ? `+${npsScore}` : npsScore}
                                  </span>
                                ) : (
                                  <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '900', color: 'var(--text-main)', margin: '10px 0 4px 0', letterSpacing: '-0.02em' }}>
                                {noteMoyenneCampagne ? `${noteMoyenneCampagne} / 5` : '—'}
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                {verbatimsListe.length > 0 ? `` : 'Enquêtes SMS post-visite'}
                              </span>
                            </div>
                          </div>

                          {/* 1 BIS. COCKPIT DE PILOTAGE GROUPE / FRANCHISE (AFFICHÉ SI LE GÉRANT POSSÈDE 2 SALONS OU PLUS) */}
                          {(mesSalonsGroupe.salons || []).length > 1 && (() => {
                            const synthese = mesSalonsGroupe.synthese_groupe || {};
                            const salonsTries = [...(mesSalonsGroupe.salons || [])].sort((a, b) => (b.ca_mois_ttc || 0) - (a.ca_mois_ttc || 0));
                            const maxCaSalon = Math.max(...salonsTries.map(s => s.ca_mois_ttc || 0), 1);
                            const nbZFaits = salonsTries.filter(s => s.z_fait_aujourdhui).length;

                            return (
                              <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: '20px', borderRadius: '18px', border: '1.5px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                      <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '800', background: 'var(--text-main)', color: 'var(--bg-card)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Vue Consolidée Groupe ({salonsTries.length} salons)
                                      </span>
                                      <span style={{
                                        padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                                        background: nbZFaits === salonsTries.length ? 'var(--bg-success)' : 'rgba(245, 158, 11, 0.14)',
                                        color: nbZFaits === salonsTries.length ? 'var(--color-success)' : '#d97706'
                                      }}>
                                        Clôtures Z du jour : {nbZFaits}/{salonsTries.length} scellées
                                      </span>
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: '800', color: 'var(--text-main)' }}>
                                      Comparatif de Performance Multi-Établissements
                                    </h3>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                                      <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>CA Cumulé Groupe (Mois)</span>
                                      <strong style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)' }}>
                                        {(synthese.ca_groupe_mois_ttc || 0).toFixed(2)} € <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: '700' }}>(+{(synthese.ca_groupe_jour_ttc || 0).toFixed(2)} € aujourd'hui)</span>
                                      </strong>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setShowMultiSalonModal(true)}
                                      style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '8px 13px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                      Gérer mes adresses
                                    </button>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(265px, 1fr))', gap: '12px' }}>
                                  {salonsTries.map((s, idx) => {
                                    const estActif = Number(s.id_salon) === Number(decodeToken(token)?.id_salon);
                                    const partGroupe = (synthese.ca_groupe_mois_ttc || 0) > 0
                                      ? Math.round(((s.ca_mois_ttc || 0) / synthese.ca_groupe_mois_ttc) * 100)
                                      : 0;

                                    return (
                                      <div
                                        key={s.id_salon}
                                        onClick={() => !estActif && changerDeSalonActif(s.id_salon)}
                                        style={{
                                          background: 'var(--bg-app)',
                                          border: estActif ? '1.5px solid var(--text-main)' : '1px solid var(--border-color)',
                                          borderRadius: '14px',
                                          padding: '14px',
                                          cursor: estActif ? 'default' : 'pointer',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          justifyContent: 'space-between',
                                          gap: '10px'
                                        }}
                                      >
                                        <div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                              <span style={{ width: '20px', height: '20px', borderRadius: '6px', background: idx === 0 ? 'var(--text-main)' : 'var(--bg-card)', color: idx === 0 ? 'var(--bg-card)' : 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {idx + 1}
                                              </span>
                                              <strong style={{ fontSize: '13.5px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {s.nom_salon}
                                              </strong>
                                            </div>
                                            <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '2px 7px', borderRadius: '999px', background: estActif ? 'var(--bg-success)' : 'var(--bg-card)', color: estActif ? 'var(--color-success)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                                              {estActif ? 'Actif' : `#${s.id_salon}`}
                                            </span>
                                          </div>

                                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {s.adresse_salon || 'Adresse non renseignée'}
                                          </div>

                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-main)' }}>
                                              {(s.ca_mois_ttc || 0).toFixed(2)} €
                                            </span>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                                              {partGroupe}% du groupe
                                            </span>
                                          </div>

                                          <div style={{ height: '6px', background: 'var(--bg-card)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                            <div style={{ width: `${Math.max(4, ((s.ca_mois_ttc || 0) / maxCaSalon) * 100)}%`, height: '100%', background: 'var(--text-main)', borderRadius: '999px' }} />
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                          <span>Jour : <strong style={{ color: 'var(--text-main)' }}>{(s.ca_jour_ttc || 0).toFixed(2)} €</strong> • {s.nb_employes || 1} équip.</span>
                                          <span style={{ fontWeight: '700', color: s.z_fait_aujourdhui ? 'var(--color-success)' : '#d97706' }}>
                                            {s.z_fait_aujourdhui ? 'Z scellé ✓' : 'Z à faire'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 2. GRILLE PRINCIPALE BENTO : MUR DES VERBATIMS & COLONNE DROITE (TOP PRESTATIONS + GOOGLE + ÉQUIPE LIVE) */}
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.25fr 1fr', gap: '18px', alignItems: 'start' }}>

                            {/* COLONNE GAUCHE : MUR DES VERBATIMS & SAUVETAGE CLIENT WINBACK */}
                            <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px', display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'none' : '540px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexShrink: 0 }}>
                                <div>
                                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Retours Clients</h3>
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                </div>
                                {npsScore !== null && npsScore !== undefined && (
                                  <div style={{ background: 'var(--bg-app)', padding: '5px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: '700', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} title="Net Promoter Score (-100 à +100)">
                                    <span style={{ color: 'var(--text-secondary)' }}>Score NPS :</span>
                                    <span style={{ color: npsScore > 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: '800' }}>{npsScore > 0 ? '+' : ''}{npsScore}</span>
                                  </div>
                                )}
                              </div>

                              {/* Statistiques d'entonnoir SMS Avis */}
                              {avisStats && parseInt(avisStats.nb_envoyes, 10) > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--bg-app)', padding: '12px', borderRadius: '12px', marginBottom: '16px', flexShrink: 0, border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                  <div>
                                    <span style={{ display: 'block', fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>{avisStats.nb_envoyes}</span>
                                    <span style={{ fontSize: '10.5px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SMS Envoyés</span>
                                  </div>
                                  <div style={{ borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                                    <span style={{ display: 'block', fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>
                                      {avisStats.nb_repondus} <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>({Math.round((avisStats.nb_repondus / avisStats.nb_envoyes) * 100)}%)</span>
                                    </span>
                                    <span style={{ fontSize: '10.5px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Réponses</span>
                                  </div>
                                  <div>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '16px', fontWeight: '800', color: '#d97706' }}>
                                      {avisStats.note_moyenne || '—'}
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                    </span>
                                    <span style={{ display: 'block', fontSize: '10.5px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Moyenne</span>
                                  </div>
                                </div>
                              )}

                              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                                {verbatimsListe.length === 0 ? (
                                  <div style={{ padding: '28px 16px', textAlign: 'center', background: 'var(--bg-app)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Aucun avis client reçu récemment.</p>
                                  </div>
                                ) : (
                                  verbatimsListe.map(avis => {
                                    const isPositif = avis.note >= 4;
                                    return (
                                      <div
                                        key={avis.id_demande}
                                        style={{
                                          background: isPositif ? 'var(--bg-app)' : 'var(--bg-danger)',
                                          border: `1px solid ${isPositif ? 'var(--border-color)' : 'var(--color-danger)'}`,
                                          borderLeft: `4px solid ${isPositif ? 'var(--color-success)' : 'var(--color-danger)'}`,
                                          borderRadius: '12px',
                                          padding: '14px'
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <strong style={{ color: isPositif ? 'var(--text-main)' : 'var(--color-danger)', fontSize: '14px' }}>{avis.prenom || 'Client'}</strong>
                                            {renderSvgStars(avis.note, 13)}
                                          </div>
                                          <span style={{
                                            fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px',
                                            background: isPositif ? 'var(--bg-success)' : 'rgba(220, 38, 38, 0.15)',
                                            color: isPositif ? 'var(--color-success)' : 'var(--color-danger)'
                                          }}>
                                            {isPositif ? 'Ambassadeur' : 'Alerte Winback'}
                                          </span>
                                        </div>

                                        {avis.commentaire && (
                                          <p style={{ margin: '0 0 10px 0', fontSize: '13px', lineHeight: 1.45, fontStyle: 'italic', color: isPositif ? 'var(--text-secondary)' : 'var(--color-danger)' }}>
                                            "{avis.commentaire}"
                                          </p>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                                            {new Date(avis.date_creation).toLocaleDateString('fr-FR')} {avis.nom_employe ? `• Coiffé(e) par ${avis.nom_employe}` : ''}
                                          </span>
                                          {!isPositif && avis.telephone && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSauvetageClient({ telephone: avis.telephone, prenom: avis.prenom });
                                                setSmsSauvetage(`Bonjour ${avis.prenom || ''}, je suis le gérant du salon. Vraiment navré pour votre dernière expérience. Voici -20% sur votre prochaine visite pour nous faire pardonner. À très vite !`);
                                              }}
                                              style={{
                                                fontSize: '11.5px', background: 'var(--color-danger)', color: '#ffffff',
                                                padding: '5px 12px', borderRadius: '8px', fontWeight: '700', border: 'none',
                                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                              }}
                                            >
                                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                              Sauver ce client
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* COLONNE DROITE : TOP PRESTATIONS, AVIS GOOGLE & ÉQUIPE EN DIRECT */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                              {/* Carte 1 : Top 3 Prestations */}
                              <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                  <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Meilleures Prestations</h3>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                  </div>
                                  <button type="button" onClick={() => handleTabClick('protocoles')} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}>
                                    Catalogue
                                  </button>
                                </div>

                                {(dashboardData.top_3_prestations || []).length > 0 ? (
                                  <div className="rank-list">
                                    {(() => {
                                      const maxVal = Math.max(...(dashboardData.top_3_prestations || []).map(p => parseFloat(p.total_genere || 0)), 1);
                                      return (dashboardData.top_3_prestations || []).map((p, i) => {
                                        const val = parseFloat(p.total_genere || 0);
                                        const pctDuCa = caTotalGerant > 0 ? Math.round((val / caTotalGerant) * 100) : 0;
                                        return (
                                          <div key={i} className="rank-row">
                                            <span className="rank-badge" style={{ background: i === 0 ? 'var(--text-main)' : 'var(--bg-app)', color: i === 0 ? 'var(--bg-card)' : 'var(--text-main)', border: '1px solid var(--border-color)' }}>{i + 1}</span>
                                            <div className="rank-info">
                                              <div className="rank-info-top">
                                                <span className="rank-name" style={{ fontWeight: '700' }}>{p.nom}</span>
                                                <span className="rank-value" style={{ fontWeight: '800' }}>
                                                  {val.toFixed(2)} € <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>({pctDuCa}%)</span>
                                                </span>
                                              </div>
                                              <div className="rank-bar-track"><div className="rank-bar-fill" style={{ width: `${(val / maxVal) * 100}%` }}></div></div>
                                            </div>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                ) : (
                                  <div style={{ padding: '18px', textAlign: 'center', background: 'var(--bg-app)', borderRadius: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    Pas encore assez de ventes pour établir le palmarès.
                                  </div>
                                )}
                              </div>

                              {/* Carte 2 : L'Équipe en direct (si Pointeuse active) */}
                              {configSalon.mode_suivi_heures === 'POINTEUSE' && (
                                <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div>
                                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>L'Équipe en Direct</h3>
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                    </div>
                                    <button type="button" onClick={() => handleTabClick('rh')} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}>
                                      Équipe RH
                                    </button>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {(employesListe || []).map(emp => {
                                      const statutData = statutsEquipe[emp.id_employe];
                                      const statut = statutData ? statutData.action : null;
                                      let pastilleCouleur = 'var(--text-muted)';
                                      let badgeBg = 'var(--bg-card)';
                                      let texteStatut = 'Non arrivé';
                                      let chronoText = null;

                                      if (statut === 'ENTREE' || statut === 'PAUSE_FIN') {
                                        pastilleCouleur = 'var(--color-success)';
                                        badgeBg = 'var(--bg-success)';
                                        texteStatut = 'En service';
                                      } else if (statut === 'PAUSE_DEBUT') {
                                        pastilleCouleur = '#d97706';
                                        badgeBg = 'rgba(245, 158, 11, 0.14)';
                                        texteStatut = 'En pause';
                                        if (statutData?.heure) {
                                          const diffMin = Math.floor((heureActuelle.getTime() - new Date(statutData.heure).getTime()) / 60000);
                                          chronoText = diffMin > 0 ? `${diffMin} min` : '1 min';
                                        }
                                      } else if (statut === 'SORTIE') {
                                        pastilleCouleur = 'var(--color-danger)';
                                        badgeBg = 'var(--bg-danger)';
                                        texteStatut = 'Terminé';
                                      }

                                      return (
                                        <div key={emp.id_employe} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                            {renderAvatar(emp.photo_url, emp.nom, 34)}
                                            <span style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nom}</span>
                                          </div>
                                          <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: badgeBg, color: pastilleCouleur, flexShrink: 0 }}>
                                            {texteStatut}{chronoText ? ` (${chronoText})` : ''}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    {(employesListe || []).length === 0 && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Aucun collaborateur enregistré.</span>}
                                  </div>
                                </div>
                              )}

                              {/* Carte 3 : Réputation Google Business */}
                              <div className="carte" style={{ padding: isMobile ? '18px' : '22px', marginBottom: 0, borderRadius: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                  <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Visibilité Google Business</h3>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></span>
                                  </div>
                                  <button type="button" onClick={() => setActiveTab('parametres')} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}>
                                    Configurer
                                  </button>
                                </div>

                                {dashboardData.marketing && dashboardData.marketing.total_avis > 0 ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'var(--bg-app)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ textAlign: 'center', paddingRight: '16px', borderRight: '1px solid var(--border-color)' }}>
                                      <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', lineHeight: 1 }}>{dashboardData.marketing.note_actuelle}</div>
                                      <div style={{ marginTop: '6px' }}>{renderSvgStars(dashboardData.marketing.note_actuelle, 12)}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>{dashboardData.marketing.total_avis} avis</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: '10.5px', textTransform: 'uppercase', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block', letterSpacing: '0.04em' }}>Courbe de progression (6 mois)</span>
                                      {dessinerCourbe(dashboardData.marketing.tendance_6_mois)}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ padding: '16px', background: 'var(--bg-app)', borderRadius: '12px', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                      Reliez votre fiche Google Business dans vos paramètres pour suivre l'impact de vos campagnes SMS sur votre note Google.
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>
                        </>
                      )}
                    </div> {/* FIN ZONE DÉFILANTE */}
                  </div>
                );
              })()}

    </>
  );
};

export default DashboardTab;
