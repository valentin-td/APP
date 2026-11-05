import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import { COULEURS_EMPLOYES } from '../../constants/theme';
import { formatNomClient, formatPortion, formatDateInput } from '../../utils/text';
import { normaliserEtapeUI } from '../../utils/protocoles';
import { decodeToken } from '../../utils/auth';

export const AgendaTab = ({
  isMobile,
  role,
  token,
  configSalon = {},
  changerPeriode,
  resetToToday,
  joursSemaine = [],
  isToday,
  setPointeuse,
  setShowModalAbsence,
  setShowModalRdv,
  filtresEmployes = [],
  setFiltresEmployes,
  employesListe = [],
  nbHeures = 11,
  heureDebutAgenda = 9,
  planningData = {},
  expandedAbsenceDate,
  setExpandedAbsenceDate,
  ouvrirRdvSelectionne,
  showModalRdv,
  formRdv = {},
  setFormRdv,
  showDropdownClient,
  setShowDropdownClient,
  getClientsSuggeresPourRdv,
  showDropdownPresta,
  setShowDropdownPresta,
  getPrestationsSuggeresPourRdv,
  creerRdvManuel,
  showModalAbsence,
  ongletAbsence,
  setOngletAbsence,
  formAbsence = {},
  setFormAbsence,
  handleUploadJustificatifAbsence,
  demanderAbsence,
  rdvSelectionne,
  setRdvSelectionne,
  isEditingRdv,
  setIsEditingRdv,
  editRdvForm = {},
  setEditRdvForm,
  demanderSuppressionRdv,
  sauvegarderModifRdv,
  protocoleVisible,
  setProtocoleVisible,
  protocolesListe = [],
  showToast,
}) => {
  return (
    <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"}>
      <div className="agenda-header">
        <div className="agenda-title-group" style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          <h1 style={{margin: 0}}>Agenda</h1>
          <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
            <button onClick={() => changerPeriode(-1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>◀</button>
            <span style={{fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', padding: '0 10px'}}>{joursSemaine[0]?.toLocaleDateString('fr-FR', {month: 'short'})} {joursSemaine[0]?.getFullYear()}</span>
            <button onClick={() => changerPeriode(1)} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)'}}>▶</button>
            <button onClick={resetToToday} style={{background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px'}}>Aujourd'hui</button>
          </div>
        </div>
        <div className="agenda-actions-group" style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
          <ThemeToggle />
          
          {/* BOUTON POINTEUSE : EXCLUSIF AU RÔLE "SALON" */}
          {role === 'salon' && configSalon.mode_suivi_heures === 'POINTEUSE' && (
            <button onClick={() => setPointeuse({ open: true, step: 1, employe: null, pin: '' })} style={{background: '#f59e0b', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 'var(--radius-input)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              {!isMobile && "Pointeuse"}
            </button>
          )}

          {/* BOUTON ABSENCE : Masqué pour le rôle "salon" */}
          {role !== 'salon' && (
            <button onClick={() => setShowModalAbsence(true)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px 16px', borderRadius: 'var(--radius-input)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px'}}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
              Absence
            </button>
          )}
          <button onClick={() => setShowModalRdv(true)} className="btn-action">+ Nouveau RDV</button>
        </div>
      </div>

      {/* SÉLECTEUR MULTI-COLLABORATEURS */}
      <div className="agenda-filtres-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: '8px', marginBottom: '16px', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: '8px', width: '100%' }}>
        {role === 'gerant' && (
          <button 
            onClick={() => setFiltresEmployes([])} 
            style={{ background: filtresEmployes.length === 0 ? 'var(--text-main)' : 'var(--bg-card)', color: filtresEmployes.length === 0 ? 'var(--bg-card)' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s ease', flexShrink: 0 }}>
            Toute l'équipe
          </button>
        )}
        {role === 'gerant' && decodeToken(token)?.id_employe && (
          <button
            onClick={() => {
              const myEmpId = decodeToken(token)?.id_employe;
              const isOnlyMe = filtresEmployes.length === 1 && filtresEmployes[0] === myEmpId;
              setFiltresEmployes(isOnlyMe ? [] : [myEmpId]);
            }}
            style={{
              background: (filtresEmployes.length === 1 && filtresEmployes[0] === decodeToken(token)?.id_employe) ? 'var(--btn-primary)' : 'var(--bg-card)',
              color: (filtresEmployes.length === 1 && filtresEmployes[0] === decodeToken(token)?.id_employe) ? 'white' : 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '6px 12px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>👤 Mon Planning (Gérant)</span>
          </button>
        )}
        {(employesListe || [])
          .filter(emp => role !== 'employe' || emp.id_employe === decodeToken(token)?.id_employe)
          .map((emp, index) => {
            const originalIndex = (employesListe || []).findIndex(e => e.id_employe === emp.id_employe);
            const color = COULEURS_EMPLOYES[originalIndex % COULEURS_EMPLOYES.length];
            const isActive = role === 'employe' || filtresEmployes.includes(emp.id_employe);
            return (
              <button 
                key={emp.id_employe}
                onClick={() => {
                  if (role === 'employe') return; 
                  if (isActive) { setFiltresEmployes(filtresEmployes.filter(id => id !== emp.id_employe)); } 
                  else { setFiltresEmployes([...filtresEmployes, emp.id_employe]); }
                }}
                style={{ background: isActive ? color : 'var(--bg-card)', color: isActive ? '#111827' : 'var(--text-secondary)', border: `1px solid ${isActive ? color : 'var(--border-color)'}`, borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: role === 'gerant' ? 'pointer' : 'default', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease', flexShrink: 0 }}>
                {!isActive && <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color}}></span>}
                {role === 'employe' ? `Mon Planning (${(emp.nom || '').split(' ')[0]})` : (emp.nom || '').split(' ')[0]}
              </button>
            );
          })}
      </div>

      <div className="week-calendar" style={isMobile ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'flex', flexDirection: 'column' }}>
        <div className="week-header-row" style={{ display: 'flex' }}>
          <div className="time-spacer" style={isMobile ? { width: '48px', flexShrink: 0 } : { width: '64px', flexShrink: 0 }}></div>
          {joursSemaine.map((jour, index) => (
            <div key={index} className={`day-header ${isToday(jour) ? 'today' : ''}`} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
              <span className="day-name">{jour.toLocaleDateString('fr-FR', {weekday: 'short'})}</span>
              <span className="day-number">{jour.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="week-body" style={isMobile ? { overflowY: 'auto', background: 'var(--bg-card)', overflowX: 'hidden', flex: 1, paddingTop: '10px', paddingBottom: '120px' } : { overflowY: 'auto', background: 'var(--bg-card)', overflowX: 'hidden', paddingTop: '10px' }}>
          <div style={{ display: 'flex', position: 'relative', height: `${nbHeures * 80}px`, minHeight: '100%' }}>
            <div className="time-column" style={isMobile ? { width: '48px', flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-app)' } : { width: '64px', flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-app)' }}>
              {Array.from({ length: nbHeures }).map((_, i) => (
                <div key={i} className="time-label" style={{ height: '80px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', paddingRight: '10px', transform: 'translateY(-7px)', fontWeight: '500' }}>{heureDebutAgenda + i} h</div>
              ))}
            </div>
            <div className="days-container" style={{ display: 'flex', flex: 1 }}>
              {joursSemaine.map((jour, indexJour) => {
                const dateStringJour = formatDateInput(jour);
                const listeRdvs = Array.isArray(planningData) ? planningData : (planningData.rendez_vous || []);
                const listeAbsences = Array.isArray(planningData) ? [] : (planningData.absences || []);

                const rdvsDuJourBruts = listeRdvs.filter(rdv => {
                  if(!rdv || !rdv.date_heure_debut) return false;
                  const rdvDateStr = (rdv.date_heure_debut || '').replace('Z', '').split('T')[0];
                  return rdvDateStr === dateStringJour && (filtresEmployes.length === 0 || filtresEmployes.includes(rdv.id_employe));
                });
                const sortedRdvs = rdvsDuJourBruts.map(rdv => {
                  const start = new Date((rdv.date_heure_debut || '').replace('Z', ''));
                  const end = new Date(start.getTime() + ((rdv.duree_minutes || 30) * 60000));
                  return { ...rdv, start, end };
                }).sort((a, b) => a.start - b.start);
                const clusters = []; let currentCluster = []; let clusterEnd = null;
                sortedRdvs.forEach(rdv => {
                  if (currentCluster.length === 0) { currentCluster.push(rdv); clusterEnd = rdv.end; } 
                  else {
                    if (rdv.start < clusterEnd) { currentCluster.push(rdv); if (rdv.end > clusterEnd) clusterEnd = rdv.end; } 
                    else { clusters.push([...currentCluster]); currentCluster = [rdv]; clusterEnd = rdv.end; }
                  }
                });
                if (currentCluster.length > 0) clusters.push(currentCluster);

                const absencesDuJour = listeAbsences.filter(abs => {
                  if(!abs || !abs.date_debut || !abs.date_fin) return false;
                  const dateD = abs.date_debut.split('T')[0];
                  const dateF = abs.date_fin.split('T')[0];
                  return dateStringJour >= dateD && dateStringJour <= dateF && (filtresEmployes.length === 0 || filtresEmployes.includes(abs.id_employe));
                });

                return (
                  <div key={indexJour} className="day-column" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
                    {/* ESPACE GÉRANT / SALON : L'Accordéon discret collé en haut */}
                    {role !== 'employe' && absencesDuJour.length > 0 && (
                      <div style={{ position: 'sticky', top: '4px', left: '4px', right: '4px', zIndex: 20, margin: '4px' }}>
                        <div onClick={() => setExpandedAbsenceDate(expandedAbsenceDate === dateStringJour ? null : dateStringJour)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: expandedAbsenceDate === dateStringJour ? '6px 6px 0 0' : '6px', padding: '6px 8px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s' }}>
                          <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {absencesDuJour.length} Absence{absencesDuJour.length > 1 ? 's' : ''}</span>
                          <span style={{color: 'var(--text-secondary)'}}>{expandedAbsenceDate === dateStringJour ? '▲' : '▼'}</span>
                        </div>
                        {expandedAbsenceDate === dateStringJour && (
                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: 'var(--shadow-sm)', maxHeight: '200px', overflowY: 'auto' }}>
                            {absencesDuJour.map(abs => {
                              const isMaladie = abs.type_demande === 'ARRET_MALADIE';
                              const isAttente = abs.statut === 'EN_ATTENTE';
                              const bgStyle = isMaladie ? 'var(--bg-danger)' : (isAttente ? 'var(--bg-hover)' : 'var(--bg-info)');
                              const colorStyle = isMaladie ? 'var(--color-danger)' : (isAttente ? 'var(--text-secondary)' : 'var(--color-info)');
                              return (
                                <div key={`abs-mini-${abs.id_absence}`} style={{ fontSize: '11px', padding: '6px', background: bgStyle, color: colorStyle, borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{abs.nom_employe}</span>
                                    <span>{isMaladie ? 'Maladie' : (isAttente ? 'Attente' : 'Validé')}</span>
                                  </div>
                                  <span style={{ fontSize: '10px', opacity: 0.85 }}>{abs.nature_absence} ({abs.moment_debut} - {abs.moment_fin})</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* VUE EMPLOYÉ : Bannière d'absence bloquante pleine hauteur si l'employé est absent ce jour-là */}
                    {role === 'employe' && absencesDuJour.map(abs => {
                      const isMaladie = abs.type_demande === 'ARRET_MALADIE';
                      const isAttente = abs.statut === 'EN_ATTENTE';
                      const dateDebutJour = abs.date_debut.split('T')[0];
                      const dateFinJour = abs.date_fin.split('T')[0];
                      const isPremierJour = dateStringJour === dateDebutJour;
                      const isDernierJour = dateStringJour === dateFinJour;

                      let topAbs = 0;
                      let hauteurAbs = nbHeures * 80;

                      if (isPremierJour && abs.moment_debut === 'APRES_MIDI') {
                        topAbs = (nbHeures * 80) / 2;
                        hauteurAbs = (nbHeures * 80) / 2;
                      } else if (isDernierJour && abs.moment_fin === 'MATIN') {
                        topAbs = 0;
                        hauteurAbs = (nbHeures * 80) / 2;
                      }

                      const bgStyle = isMaladie 
                        ? 'repeating-linear-gradient(45deg, #fee2e2, #fee2e2 10px, #fecaca 10px, #fecaca 20px)'
                        : (isAttente 
                          ? 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 10px, #e5e7eb 10px, #e5e7eb 20px)'
                          : 'repeating-linear-gradient(45deg, #e0f2fe, #e0f2fe 10px, #bae6fd 10px, #bae6fd 20px)');
                      const borderColor = isMaladie ? '#ef4444' : (isAttente ? '#9ca3af' : '#38bdf8');
                      const textColor = isMaladie ? '#991b1b' : (isAttente ? '#4b5563' : '#075985');
                      
                      return (
                        <div key={`abs-${abs.id_absence}`} style={{ position: 'absolute', left: '2px', width: 'calc(100% - 4px)', boxSizing: 'border-box', top: `${topAbs}px`, height: `${hauteurAbs}px`, background: bgStyle, border: `1px solid ${borderColor}`, borderRadius: '6px', padding: '6px', opacity: 0.85, zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: textColor, textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>{isMaladie ? 'Arrêt Maladie' : (isAttente ? 'Congé (Attente)' : 'Congé Validé')}</span>
                          <span style={{ fontSize: '11px', color: textColor, fontWeight: '600', textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>{abs.nom_employe}</span>
                        </div>
                      );
                    })}

                    {clusters.flatMap((cluster) => {
                      const clusterSize = cluster.length;
                      return cluster.map((rdv, indexInCluster) => {
                        const ECHELLE_HEURE = 80; const dureeReelle = rdv.duree_minutes || 30;
                        const topPosition = ((rdv.start.getHours() - heureDebutAgenda) * ECHELLE_HEURE) + (rdv.start.getMinutes() * (ECHELLE_HEURE / 60));
                        const hauteurCard = Math.max((dureeReelle * (ECHELLE_HEURE / 60)), 26);
                        const empIndex = (employesListe || []).findIndex(e => e.id_employe === rdv.id_employe);
                        const backgroundColor = empIndex >= 0 ? COULEURS_EMPLOYES[empIndex % COULEURS_EMPLOYES.length] : '#ccc';
                        const widthPercent = clusterSize === 1 ? 100 : (100 - (clusterSize - 1) * 10);
                        const leftOffset = clusterSize === 1 ? 0 : (indexInCluster * 10);
                        const zIndex = 5 + indexInCluster;
                        return (
                          <div key={rdv.id_rdv} onClick={() => ouvrirRdvSelectionne(rdv)} className="rdv-card-accordeon"
                            style={{ position: 'absolute', left: `calc(2px + ${leftOffset}%)`, width: `calc(${widthPercent}% - 4px)`, boxSizing: 'border-box', top: `${topPosition}px`, height: `${hauteurCard}px`, backgroundColor: backgroundColor, color: '#111827', borderRadius: '6px', padding: '4px 6px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', cursor: 'pointer', zIndex: zIndex }}>
                            <div style={{fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rdv.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {rdv.nom_client}</div>
                            <div style={{fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rdv.prestation}</div>
                          </div>
                        );
                      });
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL RDV */}
      {showModalRdv && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Nouveau Rendez-vous</h3>
              <button className="modal-close-btn" onClick={() => setShowModalRdv(false)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input 
                type="text" className="input-fournisseur" placeholder="Nom du Client ou N° de Téléphone" value={formRdv.nom_client} 
                onChange={e => { setFormRdv({...formRdv, nom_client: e.target.value}); setShowDropdownClient(true); }} 
                onFocus={() => setShowDropdownClient(true)} onBlur={() => setTimeout(() => setShowDropdownClient(false), 200)} 
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 0 }}
              />
              {showDropdownClient && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '160px', overflowY: 'auto' }}>
                  {getClientsSuggeresPourRdv(formRdv.nom_client).map((cli, idx) => (
                    <div key={cli.id_client} onClick={() => { setFormRdv({ ...formRdv, nom_client: formatNomClient(cli), telephone_client: cli.telephone || formRdv.telephone_client }); setShowDropdownClient(false); }} className="hover-bg-app" style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx !== 4 ? '1px solid var(--bg-app)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style={{color: 'var(--text-main)', fontSize: '13px', fontWeight: '600'}}>{formatNomClient(cli)}</span></div>
                      {cli.telephone && <span style={{color: 'var(--text-secondary)', fontSize: '11px', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px'}}>{cli.telephone}</span>}
                    </div>
                  ))}
                  {formRdv.nom_client && !getClientsSuggeresPourRdv(formRdv.nom_client).find(c => formatNomClient(c).toLowerCase() === formRdv.nom_client.toLowerCase()) && (
                    <div onClick={() => setShowDropdownClient(false)} style={{ padding: '10px 12px', cursor: 'pointer', background: 'var(--bg-info)', color: 'var(--color-info)', fontSize: '13px', fontStyle: 'italic', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouveau client : "{formRdv.nom_client}"
                    </div>
                  )}
                </div>
              )}
            </div>
            <input type="text" className="input-fournisseur" placeholder="Téléphone" value={formRdv.telephone_client} onChange={e => setFormRdv({...formRdv, telephone_client: e.target.value})} style={{marginBottom:'12px'}}/>
            <select className="input-fournisseur" value={formRdv.id_employe} onChange={e => setFormRdv({...formRdv, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
              <option value="">-- Choisir un collaborateur --</option>
              {(employesListe || [])
                .filter(emp => role !== 'employe' || emp.id_employe === decodeToken(token)?.id_employe)
                .map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
            </select>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input 
                type="text" className="input-fournisseur" placeholder="Prestation..." value={formRdv.prestation} 
                onChange={e => { setFormRdv({...formRdv, prestation: e.target.value}); setShowDropdownPresta(true); }} 
                onFocus={() => setShowDropdownPresta(true)} onBlur={() => setTimeout(() => setShowDropdownPresta(false), 200)} 
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 0 }}
              />
              {showDropdownPresta && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '160px', overflowY: 'auto' }}>
                  {getPrestationsSuggeresPourRdv(formRdv.prestation).map((p, idx) => (
                    <div key={p.id_article} onClick={() => { setFormRdv({ ...formRdv, prestation: p.nom, duree_minutes: p.duree_minutes || formRdv.duree_minutes }); setShowDropdownPresta(false); }} className="hover-bg-app" style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx !== 4 ? '1px solid var(--bg-app)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}>
                      <span style={{color: 'var(--text-main)', fontSize: '13px', fontWeight: '600'}}>{p.nom}</span>
                      <span style={{color: 'var(--text-secondary)', fontSize: '11px', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px'}}>{p.duree_minutes || 30} min</span>
                    </div>
                  ))}
                  {formRdv.prestation && !getPrestationsSuggeresPourRdv(formRdv.prestation).find(p => p.nom.toLowerCase() === formRdv.prestation.toLowerCase()) && (
                    <div onClick={() => setShowDropdownPresta(false)} style={{ padding: '10px 12px', cursor: 'pointer', background: 'var(--bg-info)', color: 'var(--color-info)', fontSize: '13px', fontStyle: 'italic', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Utiliser "{formRdv.prestation}" (Texte libre)
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
              <input type="date" className="input-fournisseur" value={formRdv.date} onChange={e => setFormRdv({...formRdv, date: e.target.value})} />
              <input type="time" className="input-fournisseur" value={formRdv.heure} onChange={e => setFormRdv({...formRdv, heure: e.target.value})} />
              <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{width:'110px'}} value={formRdv.duree_minutes} onChange={e => setFormRdv({...formRdv, duree_minutes: parseInt(e.target.value) || 30})} title="Durée de la prestation (minutes)" />
            </div>
            <button onClick={() => creerRdvManuel(false)} className="btn-action" style={{width:'100%'}}>Créer le rendez-vous</button>
          </div>
        </div>
      )}

      {showModalAbsence && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Déclarer une absence</h3>
              <button className="modal-close-btn" onClick={() => setShowModalAbsence(false)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            <div style={{ display: 'flex', marginBottom: '20px', background: 'var(--bg-app)', padding: '4px', borderRadius: '8px' }}>
              <button onClick={() => setOngletAbsence('CONGES')} style={{ flex: 1, padding: '8px', border: 'none', background: ongletAbsence === 'CONGES' ? 'var(--bg-card)' : 'transparent', color: ongletAbsence === 'CONGES' ? 'var(--text-main)' : 'var(--text-secondary)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: ongletAbsence === 'CONGES' ? 'var(--shadow-sm)' : 'none' }}>Congés</button>
              <button onClick={() => setOngletAbsence('ARRET_MALADIE')} style={{ flex: 1, padding: '8px', border: 'none', background: ongletAbsence === 'ARRET_MALADIE' ? 'var(--bg-card)' : 'transparent', color: ongletAbsence === 'ARRET_MALADIE' ? 'var(--color-danger)' : 'var(--text-secondary)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: ongletAbsence === 'ARRET_MALADIE' ? 'var(--shadow-sm)' : 'none' }}>Arrêt Maladie</button>
            </div>

            {role === 'gerant' && (
              <select className="input-fournisseur" value={formAbsence.id_employe || ''} onChange={e => setFormAbsence({...formAbsence, id_employe: e.target.value})} style={{marginBottom: '16px'}}>
                <option value="">-- Concerne quel collaborateur ? --</option>
                {(employesListe || []).map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Nature</label>
                <select className="input-fournisseur" value={formAbsence.nature_absence} onChange={e => setFormAbsence({...formAbsence, nature_absence: e.target.value})}>
                  {ongletAbsence === 'CONGES' ? (
                    <>
                      <option value="CP">Congés Payés (CP)</option>
                      <option value="SANS_SOLDE">Congé Sans Solde</option>
                      <option value="RTT">Récupération / RTT</option>
                      <option value="EVENEMENT">Événement Familial</option>
                    </>
                  ) : (
                    <>
                      <option value="MALADIE_ORDINAIRE">Maladie Ordinaire</option>
                      <option value="ACCIDENT_TRAVAIL">Accident du Travail</option>
                      <option value="MATERNITE">Congé Maternité/Paternité</option>
                    </>
                  )}
                </select>
              </div>
              {ongletAbsence === 'ARRET_MALADIE' && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Type</label>
                  <select className="input-fournisseur" value={formAbsence.type_prolongation} onChange={e => setFormAbsence({...formAbsence, type_prolongation: e.target.value})}>
                    <option value="INITIAL">Arrêt Initial</option>
                    <option value="PROLONGATION">Prolongation</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Date de début</label>
                <input type="date" className="input-fournisseur" value={formAbsence.date_debut} onChange={e => setFormAbsence({...formAbsence, date_debut: e.target.value})} style={{ marginBottom: '4px' }} />
                <select className="input-fournisseur" value={formAbsence.moment_debut} onChange={e => setFormAbsence({...formAbsence, moment_debut: e.target.value})}>
                  <option value="MATIN">Matin</option>
                  <option value="APRES_MIDI">Après-midi</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Date de fin (Inclus)</label>
                <input type="date" className="input-fournisseur" value={formAbsence.date_fin} onChange={e => setFormAbsence({...formAbsence, date_fin: e.target.value})} style={{ marginBottom: '4px' }} />
                <select className="input-fournisseur" value={formAbsence.moment_fin} onChange={e => setFormAbsence({...formAbsence, moment_fin: e.target.value})}>
                  <option value="MATIN">Matin</option>
                  <option value="APRES_MIDI">Après-midi</option>
                </select>
              </div>
            </div>

            {(ongletAbsence === 'ARRET_MALADIE' || formAbsence.nature_absence === 'EVENEMENT') && (
              <div style={{ marginBottom: '16px', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Justificatif (Volet 3 ou Document légal)</label>
                <input type="file" accept="image/*,application/pdf" onChange={handleUploadJustificatifAbsence} style={{ fontSize: '12px', color: 'var(--text-main)', width: '100%' }} />
                {formAbsence.nom_fichier && <span style={{ fontSize: '11px', color: 'var(--color-success)', display: 'block', marginTop: '4px' }}>✅ Fichier prêt ({formAbsence.nom_fichier})</span>}
              </div>
            )}

            {ongletAbsence === 'ARRET_MALADIE' && (
              <input type="text" className="input-fournisseur" placeholder="Heures de sorties autorisées (Optionnel)" value={formAbsence.heures_sortie} onChange={e => setFormAbsence({...formAbsence, heures_sortie: e.target.value})} style={{ marginBottom: '16px' }} />
            )}

            <textarea className="input-fournisseur" placeholder="Un commentaire (Optionnel) ?" rows="2" value={formAbsence.commentaire} onChange={e => setFormAbsence({...formAbsence, commentaire: e.target.value})} style={{ marginBottom: '20px' }}></textarea>

            <button onClick={demanderAbsence} className="btn-action" style={{ width: '100%', background: ongletAbsence === 'ARRET_MALADIE' ? 'var(--color-danger)' : 'var(--btn-primary)' }}>
              {ongletAbsence === 'ARRET_MALADIE' ? 'Transmettre l’arrêt maladie' : 'Valider la demande'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL GESTION DU RDV CLIQUE */}
      {rdvSelectionne && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{margin: 0, fontSize: '18px', color: 'var(--text-main)'}}>Détails du Rendez-vous</h3>
              <button className="modal-close-btn" onClick={() => { setRdvSelectionne(null); setIsEditingRdv(false); }}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            {!isEditingRdv ? (
              <>
                <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', marginBottom: '20px'}}>
                  <h2 style={{margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-main)'}}>{rdvSelectionne.nom_client}</h2>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: 'var(--text-secondary)'}}>
                    <div>✂️ <strong>Prestation :</strong> {rdvSelectionne.prestation}</div>
                    <div>👤 <strong>Coiffé par :</strong> {rdvSelectionne.nom_employe}</div>
                    <div>🕒 <strong>Horaire :</strong> {new Date((rdvSelectionne.date_heure_debut || '').replace('Z', '')).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à {new Date((rdvSelectionne.date_heure_debut || '').replace('Z', '')).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({rdvSelectionne.duree_minutes || 30} min)</div>
                    {rdvSelectionne.telephone_client && <div>📞 <strong>Téléphone :</strong> <a href={`tel:${rdvSelectionne.telephone_client}`} style={{color: 'var(--btn-primary)', textDecoration: 'none', fontWeight: 'bold'}}>{rdvSelectionne.telephone_client}</a></div>}
                  </div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  
                  {/* BOUTON VOIR LE PROTOCOLE */}
                  {(() => {
                    const protoAssocie = (protocolesListe || []).find(p => (p.nom_prestation || '').toLowerCase() === (rdvSelectionne.prestation || '').toLowerCase());
                    if (protoAssocie) {
                      return (
                        <button onClick={() => { setRdvSelectionne(null); setProtocoleVisible(protoAssocie); }} style={{background: 'var(--btn-primary)', color: 'white', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                          Voir le Protocole (Recette)
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {role === 'gerant' && <button onClick={() => setIsEditingRdv(true)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s'}}>Modifier l'horaire</button>}
                  {role === 'gerant' && <button onClick={demanderSuppressionRdv} style={{background: 'var(--bg-danger)', color: 'var(--color-danger)', border: 'none', padding: '12px', borderRadius: 'var(--radius-input)', fontWeight: '600', cursor: 'pointer'}}>Supprimer le rendez-vous</button>}
                </div>
              </>
            ) : (
              <>
                <select className="input-fournisseur" value={editRdvForm.id_employe} onChange={e => setEditRdvForm({...editRdvForm, id_employe: e.target.value})} style={{marginBottom:'12px'}}>
                  <option value="">-- Choisir un collaborateur --</option>
                  {(employesListe || [])
                    .filter(emp => role !== 'employe' || emp.id_employe === decodeToken(token)?.id_employe)
                    .map(emp => <option key={emp.id_employe} value={emp.id_employe}>{emp.nom}</option>)}
                </select>
                <input type="text" className="input-fournisseur" placeholder="Prestation" value={editRdvForm.prestation} onChange={e => setEditRdvForm({...editRdvForm, prestation: e.target.value})} style={{marginBottom:'12px'}}/>
                <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                  <input type="date" className="input-fournisseur" value={editRdvForm.date} onChange={e => setEditRdvForm({...editRdvForm, date: e.target.value})} />
                  <input type="time" className="input-fournisseur" value={editRdvForm.heure} onChange={e => setEditRdvForm({...editRdvForm, heure: e.target.value})} />
                  <input type="number" className="input-fournisseur" placeholder="Durée (min)" style={{width:'110px'}} value={editRdvForm.duree_minutes} onChange={e => setEditRdvForm({...editRdvForm, duree_minutes: parseInt(e.target.value) || 30})} />
                </div>
                <div style={{display: 'flex', gap: '12px'}}>
                  <button onClick={() => setIsEditingRdv(false)} style={{flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-input)', fontWeight: '500', cursor: 'pointer'}}>Annuler</button>
                  <button onClick={() => sauvegarderModifRdv(false)} className="btn-action" style={{flex: 2}}>Enregistrer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODALE AFFICHAGE DU PROTOCOLE TUTORIEL POUR L'EMPLOYÉ (AGENDA) */}
      {protocoleVisible && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '680px', maxHeight: '86vh', overflowY: 'auto', padding: isMobile ? '18px' : '28px'}}>
            <div className="modal-header" style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px'}}>
              <div>
                <span style={{fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px'}}>Guide Technique & Protocole</span>
                <h3 style={{margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-main)'}}>{protocoleVisible.nom_prestation}</h3>
                <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                  {(protocoleVisible.tags || []).map(t => <span key={t} style={{fontSize: '11px', background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border-color)', fontWeight: '600'}}>{t}</span>)}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setProtocoleVisible(null)}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            {/* Tutoriel pas-à-pas interactif */}
            <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
              {(protocoleVisible.etapes || []).length > 0 ? (
                (protocoleVisible.etapes || []).map((rawEtape, index) => {
                  const etape = normaliserEtapeUI(rawEtape, index);
                  return (
                    <label key={index} style={{display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                          <input type="checkbox" style={{width: '18px', height: '18px', accentColor: 'var(--btn-primary)', cursor: 'pointer'}} />
                          <span style={{background: 'var(--text-main)', color: 'var(--bg-card)', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700'}}>{index + 1}</span>
                          <strong style={{fontSize: '15px', color: 'var(--text-main)'}}>{etape.titre}</strong>
                        </div>
                        {etape.duree_minutes > 0 && (
                          <button type="button" onClick={(e) => { e.preventDefault(); showToast(`Minuteur de ${etape.duree_minutes} min lancé !`, "info"); }} style={{fontSize: '11.5px', background: 'var(--bg-info)', color: 'var(--color-info)', padding: '5px 10px', borderRadius: '999px', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {etape.duree_minutes} min
                          </button>
                        )}
                      </div>

                      {etape.description && (
                        <p style={{margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.55', paddingLeft: '28px'}}>{etape.description}</p>
                      )}

                      {etape.ingredients && etape.ingredients.length > 0 && (
                        <div style={{marginLeft: '28px', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px'}}>
                          <span style={{fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px'}}>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><line x1="5.52" y1="16" x2="18.48" y2="16"/></svg>
                            Produits & Proportions de l'étape
                          </span>
                          <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                            {etape.ingredients.map((ing, i) => (
                              <span key={i} style={{fontSize: '12px', background: 'var(--bg-card)', color: 'var(--text-main)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: '600'}}>
                                {ing.nom} • <strong>{ing.proportion ? ing.proportion : `${formatPortion(ing.quantite_necessaire)} dose(s)`}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {etape.photo_url && (
                        <div style={{marginLeft: '28px', borderRadius: '10px', overflow: 'hidden', maxHeight: '220px', border: '1px solid var(--border-color)', background: 'var(--bg-app)'}}>
                          <img src={etape.photo_url} alt={etape.titre} style={{width: '100%', height: '220px', objectFit: 'cover', display: 'block'}} />
                        </div>
                      )}
                    </label>
                  );
                })
              ) : (
                <div style={{fontSize: '14px', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)'}}>
                  {protocoleVisible.description || "Aucune étape enregistrée pour ce protocole."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendaTab;
