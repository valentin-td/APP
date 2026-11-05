import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import { renderAvatar } from '../common/Avatar';
import { decodeToken } from '../../utils/auth';
import { getCleConversation } from '../../hooks/useInternalChat';

const CHAT_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😢'];

export const MessagerieTab = ({
  isMobile,
  role,
  token,
  chatActif,
  setChatActif,
  nonLusParConv = {},
  configSalon = {},
  contactsTries = [],
  employesListe = [],
  chatMessages = [],
  formatDateSeparateur,
  editingMsgId,
  setEditingMsgId,
  editMsgContent,
  setEditMsgContent,
  validerEdition,
  vuParOuvertMsgId,
  setVuParOuvertMsgId,
  resoudreProfilVu,
  activeMenuId,
  setActiveMenuId,
  activeReactionId,
  setActiveReactionId,
  chatMessagesRef,
  replyToMsg,
  setReplyToMsg,
  demarrerEdition,
  demanderSuppressionMessage,
  messagesEndRef,
  handleChatFileUpload,
  demarrerEnregistrementVocal,
  isRecordingAudio,
  recordingSeconds,
  arreterEnregistrementVocal,
  annulerEnregistrementVocal,
  msgFile,
  setMsgFile,
  msgInput,
  setMsgInput,
  envoyerMessage,
  toggleReaction,
}) => {
  return (
                <div className={isMobile ? "admin-container mobile-chat-container" : "admin-container"} style={!isMobile ? { display: 'flex', flexDirection: 'column', minHeight: '100%' } : {}}>
                  {/* Sur Desktop, on garde le titre. Sur mobile, on le masque pour gagner de la place */}
                  {!isMobile && (
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                          <div>
                              <h1 style={{margin: 0}}>Messagerie</h1>
                              <span className="date-subtitle" style={{margin: 0}}></span>
                          </div>
                          <ThemeToggle />
                      </div>
                  )}

                  <div className="chat-wrapper">
                      <div className="chat-sidebar">
                          <div className="chat-header">Discussions</div>
                          <div className="chat-contact-list">
                              <div className={`chat-contact ${chatActif === 'salon' ? 'active' : ''}`} onClick={() => setChatActif('salon')} style={{position: 'relative'}}>
                                  {nonLusParConv['salon'] && <span className="badge-ia-rouge"></span>}
                                  <div style={{width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, borderRadius: '8px', background: 'var(--text-main)', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0}}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                                  <div className="chat-contact-name" style={{fontWeight: '600'}}>{configSalon.nom_salon || 'Groupe Salon'}</div>
                              </div>
                              {contactsTries.map(c => (
                                  <div key={c.key} className={`chat-contact ${chatActif === c.key ? 'active' : ''}`} onClick={() => setChatActif(c.key)} style={{position: 'relative'}}>
                                      {nonLusParConv[c.key] && <span className="badge-ia-rouge"></span>}
                                      {renderAvatar(c.photo_url, c.nom, isMobile ? 48 : 40)}
                                      <div className="chat-contact-name">{c.nom}</div>
                                  </div>
                              ))}
                          </div>
                      </div>

                      <div className="chat-main">
                          <div className="chat-header">
                              {chatActif === 'salon' ? (configSalon.nom_salon || 'Groupe Salon') : 
                               chatActif === 'gerant' ? 'Gérant' : 
                               ((employesListe || []).find(e => e.id_employe === chatActif)?.nom || 'Conversation')}
                          </div>
                          
                          <style>{`
                              .chat-date-separateur { display: flex; justify-content: center; margin: 8px 0; }
                              .chat-date-separateur span { font-size: 11px; font-weight: 600; color: var(--text-secondary); background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 12px; padding: 4px 12px; }
                              .chat-vu-par { position: absolute; bottom: -9px; right: 4px; display: flex; cursor: pointer; z-index: 2; }
                              .chat-vu-par-bulle { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--bg-card); background: var(--bg-app); overflow: hidden; display: flex; align-items: center; justify-content: center; }
                              .chat-vu-par-plus { font-size: 8px; font-weight: 700; color: var(--text-secondary); }
                              .chat-vu-par-liste { position: absolute; bottom: 20px; right: 0; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-md); padding: 10px; min-width: 160px; z-index: 20; max-height: 150px; overflow-y: auto; }
                              .chat-vu-par-liste-titre { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; position: sticky; top: 0; background: var(--bg-card); padding-bottom: 4px; z-index: 2; }
                              .chat-vu-par-liste-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--text-main); white-space: nowrap; }
                          `}</style>
                          <div className="chat-messages" ref={chatMessagesRef}>
                                  {(chatMessages || []).filter(m => {
                                      const myId = role === 'employe' ? decodeToken(token)?.id_employe : (role === 'salon' ? -1 : null);
                                      // 1. Message du Groupe Salon (id_destinataire === 0)
                                      if (m.id_destinataire === 0 || m.id_destinataire === '0' || m.id_destinataire === 'salon') {
                                          return String(chatActif) === 'salon';
                                      }
                                      // 2. Quand un employé discute avec le Gérant (dans un sens ou dans l'autre)
                                      if (role === 'employe' && (m.id_destinataire === null || m.id_destinataire === -1 || m.id_expediteur === null || m.id_expediteur === -1)) {
                                          return String(chatActif) === 'gerant';
                                      }
                                      // 3. Quand le Gérant ou le Salon consulte la discussion d'un employé qui lui a écrit
                                      if ((role === 'gerant' || role === 'salon') && (m.id_destinataire === null || m.id_destinataire === -1) && m.id_expediteur > 0) {
                                          return String(m.id_expediteur) === String(chatActif);
                                      }
                                      return String(getCleConversation(m, role, myId)) === String(chatActif);
                                  }).map((msg, idxMsg, tableauMsgsConv) => {
                                      const myId = role === 'employe' ? decodeToken(token)?.id_employe : (role === 'salon' ? -1 : null);
                                      const isMine = (myId === null && msg.id_expediteur === null) || (myId !== null && Number(msg.id_expediteur) === Number(myId));
                                      const myReactId = role === 'employe' ? `emp_${myId}` : (role === 'salon' ? 'salon' : 'gerant');
                                      const messagePrecedent = tableauMsgsConv[idxMsg - 1];
                                      const changerDeJour = !messagePrecedent || new Date(msg.date_creation).toDateString() !== new Date(messagePrecedent.date_creation).toDateString();
                                      const safeReactions = typeof msg.reactions === 'string' ? (() => { try { return JSON.parse(msg.reactions); } catch(e) { return {}; } })() : (msg.reactions || {});
                                      const safeVuPar = Array.isArray(msg.vu_par) ? msg.vu_par : [];
                                      const isSafeImage = typeof msg.fichier_url === 'string' && (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(msg.fichier_url) || msg.fichier_url.startsWith('https://'));
                                      const isSafeAudio = typeof msg.fichier_url === 'string' && /^data:(audio|video)\/(webm|mp4|mpeg|ogg|wav|aac|x-m4a);/i.test(msg.fichier_url);
                                      const parsedReplyTo = typeof msg.reply_to === 'string' ? (() => { try { return JSON.parse(msg.reply_to); } catch (e) { return null; } })() : msg.reply_to;

                                      return (
                                          <div key={msg.id_message} style={{display: 'contents'}}>
                                          {changerDeJour && (
                                              <div className="chat-date-separateur"><span>{formatDateSeparateur(msg.date_creation)}</span></div>
                                          )}
                                          <div className={`chat-msg-row ${isMine ? 'mine' : 'others'}`} style={{position: 'relative', maxWidth: '100%'}}>
                                              {!isMine && renderAvatar(msg.photo_expediteur, msg.nom_expediteur || 'Gérant', 32)}
                                              
                                              <div style={{display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', minWidth: 0}}>
                                                  {!isMine && <span style={{fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', marginLeft: '4px'}}>{msg.nom_expediteur || 'Gérant'}</span>}
                                                  
                                                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isMine ? 'row-reverse' : 'row', maxWidth: '100%', minWidth: 0}}>
                                                      
                                                      {editingMsgId === msg.id_message ? (
                                                          <div style={{display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '12px', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)'}}>
                                                              <textarea value={editMsgContent} onChange={e => setEditMsgContent(e.target.value)} className="chat-input" style={{minHeight: '60px', width: '250px', border: '1px solid var(--border-focus)'}} />
                                                              <div style={{display: 'flex', gap: '8px'}}>
                                                                  <button onClick={() => validerEdition(msg.id_message)} style={{background: 'var(--btn-primary)', color: 'var(--btn-text)', border: 'none', borderRadius: '16px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold'}}>Valider</button>
                                                                  <button onClick={() => setEditingMsgId(null)} style={{background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold'}}>Annuler</button>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <div style={{position: 'relative'}}>
                                                              <div className="chat-bubble">
                                                                  {parsedReplyTo && (
                                                                      <div style={{ padding: '6px 10px', marginBottom: '6px', borderRadius: '8px', background: 'rgba(0,0,0,0.08)', borderLeft: '3px solid currentColor', fontSize: '11.5px', opacity: 0.9 }}>
                                                                          <strong style={{ display: 'block', fontSize: '11px' }}>↩ {parsedReplyTo.nom_expediteur}</strong>
                                                                          <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>{parsedReplyTo.extrait}</span>
                                                                      </div>
                                                                  )}
                                                                  {msg.contenu}
                                                                  {isSafeImage && <img src={msg.fichier_url} alt="Fichier joint" className="chat-attached-image" />}
                                                                  {isSafeAudio && (
                                                                      <div style={{ marginTop: msg.contenu ? '6px' : '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                          <audio controls src={msg.fichier_url} style={{ height: '34px', maxWidth: '220px' }} />
                                                                      </div>
                                                                  )}
                                                              </div>
                                                              {isMine && safeVuPar.length > 0 && (
                                                                  <div className="chat-vu-par" onClick={(e) => { e.stopPropagation(); setVuParOuvertMsgId(vuParOuvertMsgId === msg.id_message ? null : msg.id_message); }}>
                                                                      {safeVuPar.slice(0, 3).map((idProfil, i) => {
                                                                          const dernierEtTropPlein = i === 2 && safeVuPar.length > 3;
                                                                          const profil = resoudreProfilVu(idProfil);
                                                                          return (
                                                                              <div key={idProfil} className="chat-vu-par-bulle" style={{ marginLeft: i === 0 ? 0 : '-8px' }}>
                                                                                  {dernierEtTropPlein ? <span className="chat-vu-par-plus">+{safeVuPar.length - 2}</span> : renderAvatar(profil.photo_url, profil.nom, 14)}
                                                                              </div>
                                                                          );
                                                                      })}
                                                                      {vuParOuvertMsgId === msg.id_message && (
                                                                          <>
                                                                              {/* Calque invisible pour fermer l'encart en cliquant n'importe où à côté */}
                                                                              <div onClick={(e) => { e.stopPropagation(); setVuParOuvertMsgId(null); }} style={{position: 'fixed', inset: 0, zIndex: 19}}></div>
                                                                              
                                                                              <div className="chat-vu-par-liste" onMouseLeave={() => setVuParOuvertMsgId(null)} onClick={(e) => e.stopPropagation()}>
                                                                                  <div className="chat-vu-par-liste-titre">Vu par</div>
                                                                                  {safeVuPar.map(idProfil => {
                                                                                      const profil = resoudreProfilVu(idProfil);
                                                                                      return (
                                                                                          <div key={idProfil} className="chat-vu-par-liste-item">
                                                                                              {renderAvatar(profil.photo_url, profil.nom, 22)}
                                                                                              <span>{profil.nom}</span>
                                                                                          </div>
                                                                                      );
                                                                                  })}
                                                                              </div>
                                                                          </>
                                                                      )}
                                                                  </div>
                                                              )}
                                                          </div>
                                                      )}
                                                      
                                                      {(isMine || role === 'gerant') && !editingMsgId && (
                                                          <div style={{position: 'relative'}}>
                                                              <button className="chat-msg-actions-btn" onClick={() => setActiveMenuId(activeMenuId === msg.id_message ? null : msg.id_message)}>
                                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                                              </button>
                                                              {activeMenuId === msg.id_message && (
                                                                  <>
                                                                      <div onClick={() => setActiveMenuId(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                                                      <div className="chat-msg-menu" style={{zIndex: 999}}>
                                                                          <button onClick={() => { setReplyToMsg({ id_message: msg.id_message, nom_expediteur: msg.nom_expediteur || 'Gérant', extrait: msg.contenu || (isSafeAudio ? '🎤 Mémo vocal' : '📷 Photo') }); setActiveMenuId(null); }}>↩ Répondre</button>
                                                                          {isMine && <button onClick={() => demarrerEdition(msg)}> Modifier</button>}
                                                                          <button onClick={() => demanderSuppressionMessage(msg.id_message)} style={{color: 'var(--color-danger)'}}> Supprimer</button>
                                                                      </div>
                                                                  </>
                                                              )}
                                                          </div>
                                                      )}
                                                      
                                                      {!isMine && (
                                                          <div style={{position: 'relative'}}>
                                                              <button className="chat-msg-actions-btn" onClick={() => setActiveReactionId(activeReactionId === msg.id_message ? null : msg.id_message)}>
                                                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-3-10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-3 5.5c2.326 0 4.316-1.42 5.127-3.5H8.873c.81 2.08 2.8 3.5 5.127 3.5z"/></svg>
                                                              </button>
                                                              {activeReactionId === msg.id_message && (
                                                                  <>
                                                                      <div onClick={() => setActiveReactionId(null)} style={{position: 'fixed', inset: 0, zIndex: 998}}></div>
                                                                      <div className="chat-reaction-picker" style={{zIndex: 999}} onMouseLeave={() => setActiveReactionId(null)}>
                                                                          {CHAT_EMOJIS.map(em => (
                                                                              <button key={em} onClick={() => toggleReaction(msg.id_message, em)}>{em}</button>
                                                                          ))}
                                                                      </div>
                                                                  </>
                                                              )}
                                                          </div>
                                                      )}
                                                  </div>
                                                  
                                                  {Object.keys(safeReactions).length > 0 && (
                                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', width: '100%', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                                                          {Object.entries(safeReactions).map(([em, users]) => {
                                                              const safeUsers = Array.isArray(users) ? users : [];
                                                              if (safeUsers.length === 0) return null;
                                                              const listeNoms = safeUsers.map(id => resoudreProfilVu(id).nom).join(', ');
                                                              const isReacted = safeUsers.includes(myReactId);
                                                              return (
                                                                  <div key={em} title={listeNoms} onClick={() => toggleReaction(msg.id_message, em)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', border: `1px solid ${isReacted ? 'var(--color-info)' : 'var(--border-color)'}`, background: isReacted ? 'var(--bg-info)' : 'var(--bg-card)', color: isReacted ? 'var(--color-info)' : 'var(--text-secondary)' }}>
                                                                      <span>{em}</span> <span>{safeUsers.length}</span>
                                                                  </div>
                                                              );
                                                          })}
                                                      </div>
                                                  )}
                                                  
                                                  <div className="chat-meta">
                                                      <span>{new Date(msg.date_creation).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                  </div>
                                              </div>
                                          </div>
                                          </div>
                                      );
                                  })}
                                  <div ref={messagesEndRef} />
                              </div>

                          <div className="chat-input-area">
                              <button className="chat-btn chat-file-btn" title="Joindre une photo" onClick={() => document.getElementById('chat-file-upload').click()}>
                                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                              </button>
                              <input type="file" id="chat-file-upload" accept="image/*" style={{display:'none'}} onChange={handleChatFileUpload} />

                              {/* Bouton Mémo Vocal (Mains-libres) */}
                              <button
                                  type="button"
                                  className="chat-btn chat-file-btn"
                                  title={isRecordingAudio ? "Arrêter l'enregistrement" : "Enregistrer un mémo vocal"}
                                  onClick={isRecordingAudio ? arreterEnregistrementVocal : demarrerEnregistrementVocal}
                                  style={isRecordingAudio ? { background: 'var(--color-danger, #ef4444)', color: '#fff', borderColor: 'var(--color-danger, #ef4444)' } : {}}
                              >
                                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                              </button>

                              <div style={{flex: 1, position: 'relative'}}>
                                  {/* Bandeau Réponse citée */}
                                  {replyToMsg && (
                                      <div style={{ position: 'absolute', bottom: '100%', left: '8px', right: '8px', marginBottom: msgFile ? '78px' : '8px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', borderLeft: '3px solid var(--text-main)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '12px', zIndex: 29 }}>
                                          <div style={{ minWidth: 0 }}>
                                              <strong style={{ display: 'block', fontSize: '11px', color: 'var(--text-main)' }}>↩ Réponse à {replyToMsg.nom_expediteur}</strong>
                                              <span style={{ color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyToMsg.extrait}</span>
                                          </div>
                                          <button type="button" onClick={() => setReplyToMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '800', fontSize: '13px', padding: '2px 4px' }}>✕</button>
                                      </div>
                                  )}

                                  {/* Bandeau Enregistrement vocal en cours */}
                                  {isRecordingAudio && (
                                      <div style={{ position: 'absolute', bottom: '100%', left: '12px', marginBottom: '10px', background: 'var(--color-danger, #ef4444)', color: '#fff', padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 6px 18px rgba(239,68,68,0.35)', zIndex: 31 }}>
                                          <span>● Enregistrement vocal ({recordingSeconds}s)</span>
                                          <button type="button" onClick={arreterEnregistrementVocal} style={{ background: '#fff', color: '#111827', border: 'none', borderRadius: '999px', padding: '3px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}>Terminer</button>
                                          <button type="button" onClick={annulerEnregistrementVocal} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '800', padding: 0 }}>✕</button>
                                      </div>
                                  )}

                                  {/* Aperçu Miniature Photo OU Lecteur Mémo Vocal prêt à envoyer */}
                                  {msgFile && (
                                      <div style={{ position: 'absolute', bottom: '100%', left: '12px', marginBottom: '10px', background: 'var(--bg-card)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 6px 18px rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', gap: '8px', zIndex: 30 }}>
                                          {/^data:(audio|video)\//i.test(msgFile) ? (
                                              <audio controls src={msgFile} style={{ height: '32px', width: '200px' }} />
                                          ) : (
                                              <img src={msgFile} alt="Aperçu" style={{ width: '58px', height: '58px', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
                                          )}
                                          <button
                                              type="button"
                                              onClick={() => setMsgFile(null)}
                                              style={{ position: 'absolute', top: '-7px', right: '-7px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-danger, #ef4444)', color: '#fff', border: '2px solid var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', padding: 0, lineHeight: 1 }}
                                          >
                                              ✕
                                          </button>
                                      </div>
                                  )}

                                  <textarea className="chat-input" placeholder="Écrire un nouveau message..." value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => {if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerMessage(); }}} />
                              </div>
                              <button className="chat-btn" disabled={!msgInput.trim() && !msgFile} onClick={envoyerMessage}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                          </div>
                      </div>
                  </div>
                </div>

  );
};

export default MessagerieTab;
