import React from 'react';

export default function PointeuseModal({
  pointeuse,
  setPointeuse,
  employesListe,
  statutsEquipe,
  getStatutBlocagePin,
  handlePointeusePin,
  enregistrerPointage,
  buttonsDisabled
}) {
  if (!pointeuse?.open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div className="carte" style={{ width: '90%', maxWidth: '400px', textAlign: 'center', position: 'relative', padding: '32px 24px' }}>
        <button onClick={() => setPointeuse({ open: false, step: 1, employe: null, pin: '' })} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--text-secondary)', cursor: 'pointer' }}>×</button>

        {/* ÉTAPE 1 : CHOIX DE L'EMPLOYÉ */}
        {pointeuse.step === 1 && (
          <>
            <h2 style={{ fontSize: '20px', marginBottom: '24px', color: 'var(--text-main)' }}>Qui êtes-vous ?</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {(employesListe || []).map(emp => {
                const statutData = statutsEquipe ? statutsEquipe[emp.id_employe] : null;
                const statut = statutData ? statutData.action : null;
                let ringColor = 'transparent';
                let badgeBg = 'var(--bg-app)';
                let badgeColor = 'var(--text-muted)';
                let badgeIcon = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;

                if (statut === 'ENTREE' || statut === 'PAUSE_FIN') {
                  ringColor = 'var(--color-success)';
                  badgeBg = 'var(--bg-success)';
                  badgeColor = 'var(--color-success)';
                  badgeIcon = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
                } else if (statut === 'PAUSE_DEBUT') {
                  ringColor = '#f59e0b';
                  badgeBg = '#fef3c7';
                  badgeColor = '#f59e0b';
                  badgeIcon = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>;
                } else if (statut === 'SORTIE') {
                  ringColor = 'var(--color-danger)';
                  badgeBg = 'var(--bg-danger)';
                  badgeColor = 'var(--color-danger)';
                  badgeIcon = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
                }

                return (
                  <button key={emp.id_employe} onClick={() => setPointeuse({ ...pointeuse, step: 2, employe: emp, pin: '', erreurPin: null })} style={{ background: 'var(--bg-app)', border: `1px solid ${ringColor !== 'transparent' ? ringColor : 'var(--border-color)'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--btn-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', border: `2px solid ${ringColor !== 'transparent' ? ringColor : 'transparent'}` }}>
                        {emp.photo_url ? <img src={emp.photo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : emp.nom.substring(0, 2).toUpperCase()}
                      </div>
                      <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: badgeBg, color: badgeColor, border: '2px solid var(--bg-app)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {badgeIcon}
                      </div>
                    </div>
                    <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '14px', marginTop: '4px' }}>{emp.nom.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ÉTAPE 2 : CODE PIN */}
        {pointeuse.step === 2 && (() => {
          const statutPinPointeuse = getStatutBlocagePin ? getStatutBlocagePin(pointeuse.employe?.id_employe) : { bloque: false, tentatives: 0, essaisRestants: 3 };
          const prochainSeuil = statutPinPointeuse.tentatives < 3 ? 3 : (statutPinPointeuse.tentatives < 5 ? 5 : (statutPinPointeuse.tentatives < 7 ? 7 : 9));
          const essaisRestants = Math.max(0, prochainSeuil - statutPinPointeuse.tentatives);

          return (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={() => setPointeuse({ ...pointeuse, step: 1, pin: '', erreurPin: null })} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg></button>
                  <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-main)' }}>Code de {pointeuse.employe?.nom?.split(' ')[0]}</h2>
                </div>
                {statutPinPointeuse.tentatives > 0 && !statutPinPointeuse.bloque && (
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#d97706', background: 'rgba(245, 158, 11, 0.12)', padding: '4px 10px', borderRadius: '999px' }}>
                    {essaisRestants} essai{essaisRestants > 1 ? 's' : ''} restant{essaisRestants > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {(statutPinPointeuse.bloque || pointeuse.erreurPin) && (
                <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-danger)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', fontSize: '12.5px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '8px', textAlign: 'left', lineHeight: '1.4' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{statutPinPointeuse.bloque ? statutPinPointeuse.message : pointeuse.erreurPin}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '28px', opacity: statutPinPointeuse.bloque ? 0.35 : 1 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${pointeuse.erreurPin ? 'var(--color-danger)' : 'var(--text-main)'}`, background: (pointeuse.pin || '').length > i ? 'var(--text-main)' : 'transparent', transition: 'all 0.2s ease' }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '280px', margin: '0 auto', opacity: statutPinPointeuse.bloque ? 0.4 : 1, pointerEvents: statutPinPointeuse.bloque ? 'none' : 'auto' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} disabled={statutPinPointeuse.bloque} onClick={() => handlePointeusePin(num.toString())} className="hover-lift" style={{ padding: '16px', fontSize: '24px', fontWeight: 'bold', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-main)', cursor: statutPinPointeuse.bloque ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-sm)' }}>{num}</button>
                ))}
                <div />
                <button disabled={statutPinPointeuse.bloque} onClick={() => handlePointeusePin('0')} className="hover-lift" style={{ padding: '16px', fontSize: '24px', fontWeight: 'bold', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-main)', cursor: statutPinPointeuse.bloque ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-sm)' }}>0</button>
                <button disabled={statutPinPointeuse.bloque} onClick={() => setPointeuse(prev => ({ ...prev, pin: (prev.pin || '').slice(0, -1), erreurPin: null }))} className="hover-lift" style={{ padding: '16px', fontSize: '20px', fontWeight: 'bold', borderRadius: '12px', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: statutPinPointeuse.bloque ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
                </button>
              </div>
            </div>
          );
        })()}

        {/* ÉTAPE 3 : CHOIX DE L'ACTION (Logique Intelligente + Statut) */}
        {pointeuse.step === 3 && (() => {
          const statutData = statutsEquipe ? statutsEquipe[pointeuse.employe?.id_employe] : null;
          const statutActuel = statutData ? statutData.action : null;

          const peutArriver = !statutActuel || statutActuel === 'SORTIE';
          const peutPause = statutActuel === 'ENTREE' || statutActuel === 'PAUSE_FIN';
          const peutRetourPause = statutActuel === 'PAUSE_DEBUT';
          const peutPartir = statutActuel === 'ENTREE' || statutActuel === 'PAUSE_DEBUT' || statutActuel === 'PAUSE_FIN';

          let statutIcon = <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
          let statutText = "Non arrivé";
          let statutColor = "var(--text-muted)";

          if (statutActuel === 'ENTREE' || statutActuel === 'PAUSE_FIN') {
            statutIcon = <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
            statutText = "En service";
            statutColor = "var(--color-success)";
          } else if (statutActuel === 'PAUSE_DEBUT') {
            statutIcon = <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>;
            statutText = "En pause";
            statutColor = "#f59e0b";
          } else if (statutActuel === 'SORTIE') {
            statutIcon = <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
            statutText = "Service terminé";
            statutColor = "var(--color-danger)";
          }

          return (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ color: statutColor, display: 'flex', justifyContent: 'center', marginBottom: '8px', padding: '12px', background: 'var(--bg-app)', borderRadius: '50%', border: `1px solid ${statutColor}30` }}>
                  {statutIcon}
                </div>
                <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', color: 'var(--text-main)' }}>Prêt, {(pointeuse.employe?.nom || '').split(' ')[0]} ?</h2>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: statutColor }}>Statut : {statutText}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => enregistrerPointage('ENTREE')}
                  disabled={buttonsDisabled || !peutArriver}
                  className={peutArriver ? "hover-bg-card" : ""}
                  style={{ opacity: (buttonsDisabled || !peutArriver) ? 0.4 : 1, pointerEvents: (buttonsDisabled || !peutArriver) ? 'none' : 'auto', background: 'var(--bg-app)', border: '1px solid rgba(34, 197, 94, 0.3)', color: 'var(--text-main)', padding: '20px', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: peutArriver ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: '15px' }}>Arrivée (Prise de poste)</span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '2px' }}>Démarre votre journée</span>
                  </div>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    onClick={() => enregistrerPointage('PAUSE_DEBUT')}
                    disabled={buttonsDisabled || !peutPause}
                    className={peutPause ? "hover-bg-hover" : ""}
                    style={{ opacity: (buttonsDisabled || !peutPause) ? 0.4 : 1, pointerEvents: (buttonsDisabled || !peutPause) ? 'none' : 'auto', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', cursor: peutPause ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    Début Pause
                  </button>

                  <button
                    onClick={() => enregistrerPointage('PAUSE_FIN')}
                    disabled={buttonsDisabled || !peutRetourPause}
                    className={peutRetourPause ? "hover-bg-hover" : ""}
                    style={{ opacity: (buttonsDisabled || !peutRetourPause) ? 0.4 : 1, pointerEvents: (buttonsDisabled || !peutRetourPause) ? 'none' : 'auto', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', cursor: peutRetourPause ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    Retour Pause
                  </button>
                </div>

                <button
                  onClick={() => enregistrerPointage('SORTIE')}
                  disabled={buttonsDisabled || !peutPartir}
                  className={peutPartir ? "hover-bg-card" : ""}
                  style={{ opacity: (buttonsDisabled || !peutPartir) ? 0.4 : 1, pointerEvents: (buttonsDisabled || !peutPartir) ? 'none' : 'auto', background: 'var(--bg-app)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--text-main)', padding: '20px', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: peutPartir ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s ease', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: '15px' }}>Départ (Fin de service)</span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '2px' }}>Enregistre votre heure de départ</span>
                  </div>
                </button>
              </div>
            </>
          );
        })()}

        {/* ÉTAPE 4 : CONFIRMATION VISUELLE (SUCCÈS) */}
        {pointeuse.step === 4 && (
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeIn 0.4s ease' }}>
            <div style={{ color: 'var(--color-success)', marginBottom: '24px', animation: 'scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
              <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 style={{ fontSize: '24px', margin: '0 0 12px 0', color: 'var(--text-main)' }}>
              {pointeuse.derniereAction === 'ENTREE' ? 'Bonne journée !' :
                pointeuse.derniereAction === 'PAUSE_DEBUT' ? 'Bonne pause !' :
                  pointeuse.derniereAction === 'PAUSE_FIN' ? 'Bon retour !' :
                    'Fin de service'}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
              Pointage enregistré à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
