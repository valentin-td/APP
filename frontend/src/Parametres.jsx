import { useState, useEffect } from 'react';
import './Parametres.css';
import { TEXTE_CONDITIONS_GENERALES, TEXTE_POLITIQUE_CONFIDENTIALITE } from './textesLegaux';

/* ==========================================================================
   ONGLET PARAMÈTRES — liste style iOS (catégories → sous-pages)
   Les formulaires (fidélité, Google, horaires, mail, SMS, alertes, TPE) sont
   exactement ceux de l'ancien onglet : mêmes champs, mêmes états (configSalon),
   même sauvegarde (onSave = sauvegarderParametres).
   ========================================================================== */

const ico = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ICONS = {
  gift: ico(<><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>),
  sms: ico(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>),
  calendar: ico(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  bell: ico(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>),
  star: ico(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>),
  mail: ico(<><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></>),
  card: ico(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>),
  send: ico(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>),
  moon: ico(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>),
  file: ico(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></>),
  shield: ico(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>),
  logout: ico(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
  back: ico(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  person: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c0-4.2 3.6-6.8 8.5-6.8s8.5 2.6 8.5 6.8z"/></svg>,
};

const TITRES = {
  fidelite: 'Programme de fidélité',
  sms: 'Fidélisation (SMS Auto)',
  horaires: "Horaires de l'agenda",
  alertes: 'Alertes urgences (gérant)',
  google: 'Google My Business',
  mail: 'Boîte mail du salon',
  export_compta: 'Exportations comptable',
  tpe: 'TPE physique (Stripe Terminal)',
  cgu: 'Conditions générales',
  confidentialite: 'Politique de confidentialité',
};

export default function Parametres({
  configSalon, setConfigSalon, onSave, onBack, onLogout,
  salonId, isDarkMode, onToggleTheme,
}) {
  const [section, setSection] = useState(null);   // null = liste principale

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
  }, [section]);

  const retour = () => (section ? setSection(null) : onBack());
  const statut = (ok, oui = 'Configuré', non = 'À configurer') => (ok ? oui : non);

  const fideliteLabel = { NONE: 'Désactivé', POINTS: 'Points', TAMPONS: 'Tampons' }[configSalon.fidelite_type || 'NONE'];

  const GROUPES = [
    { titre: null, lignes: [
      { id: 'fidelite', icone: ICONS.gift, label: 'Programme de fidélité', valeur: fideliteLabel },
      { id: 'sms', icone: ICONS.sms, label: 'Fidélisation SMS', valeur: statut(configSalon.brevo_api_key) },
    ] },
    { titre: 'Salon', lignes: [
      { id: 'horaires', icone: ICONS.calendar, label: "Horaires de l'agenda", valeur: `${configSalon.heure_ouverture || 8}h – ${configSalon.heure_fermeture || 20}h` },
      { id: 'alertes', icone: ICONS.bell, label: 'Alertes urgences', valeur: statut(configSalon.alertes_sms_actives, 'Activées', 'Désactivées') },
    ] },
    { titre: 'Intégrations', lignes: [
      { id: 'google', icone: ICONS.star, label: 'Google My Business', valeur: statut(configSalon.google_api_key) },
      { id: 'mail', icone: ICONS.mail, label: 'Boîte mail du salon', valeur: statut(configSalon.email_factures) },
      { id: 'export_compta', icone: ICONS.send, label: 'Exportations comptable', valeur: statut(configSalon.email_comptable) },
      { id: 'tpe', icone: ICONS.card, label: 'TPE physique', valeur: statut(configSalon.stripe_reader_id) },
    ] },
    { titre: 'Informations légales', lignes: [
      { id: 'cgu', icone: ICONS.file, label: 'Conditions générales' },
      { id: 'confidentialite', icone: ICONS.shield, label: 'Politique de confidentialité' },
    ] },
  ];

  const carteSauvegarde = (
    <button type="button" className="btn-action" style={{ width: '100%' }} onClick={onSave}>Enregistrer la configuration</button>
  );

  const pageLegale = (texte) => (
    <div className="carte scan-carte">
      {texte && texte.trim() ? (
        <div className="st-legal">{texte}</div>
      ) : (
        <div className="st-empty">
          <div className="st-empty-icon">{ICONS.file}</div>
          <p>Ce contenu sera bientôt disponible.</p>
        </div>
      )}
    </div>
  );

  const renderSection = (id) => {
    switch (id) {
      case 'fidelite': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', display:'block', marginBottom: '16px'}}>Définissez les règles pour récompenser vos clients.</span>
                    
                    <select className="input-fournisseur" value={configSalon.fidelite_type || 'NONE'} onChange={e => setConfigSalon({...configSalon, fidelite_type: e.target.value})} style={{marginBottom: '16px'}}>
                        <option value="NONE">Désactivé</option>
                        <option value="POINTS">Par Points (1€ = 1 point)</option>
                        <option value="TAMPONS">Carte à Tampons (1 visite = 1 tampon)</option>
                    </select>

                    {configSalon.fidelite_type === 'POINTS' && (
                        <div style={{display: 'flex', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                            <div style={{flex: 1}}>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Points à atteindre</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 100" value={configSalon.fidelite_points_seuil || ''} onChange={e => setConfigSalon({...configSalon, fidelite_points_seuil: e.target.value})} />
                            </div>
                            <div style={{flex: 1}}>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Réduction offerte (€)</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 10" value={configSalon.fidelite_points_valeur || ''} onChange={e => setConfigSalon({...configSalon, fidelite_points_valeur: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {configSalon.fidelite_type === 'TAMPONS' && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                            <div>
                                <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Nombre de passages requis</label>
                                <input type="number" className="input-fournisseur" placeholder="Ex: 10" value={configSalon.fidelite_tampons_seuil || ''} onChange={e => setConfigSalon({...configSalon, fidelite_tampons_seuil: e.target.value})} />
                            </div>
                            <div style={{display: 'flex', gap: '12px'}}>
                                <div style={{flex: 1}}>
                                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Type de récompense</label>
                                    <select className="input-fournisseur" value={configSalon.fidelite_recompense_type || 'MONTANT'} onChange={e => setConfigSalon({...configSalon, fidelite_recompense_type: e.target.value})}>
                                        <option value="MONTANT">Remise fixe (€)</option>
                                        <option value="POURCENTAGE">Pourcentage (%)</option>
                                        <option value="PRODUIT">Produit / Service offert</option>
                                    </select>
                                </div>
                                <div style={{flex: 1}}>
                                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Valeur (Ex: 20, 10, Shampoing)</label>
                                    <input type="text" className="input-fournisseur" value={configSalon.fidelite_recompense_valeur || ''} onChange={e => setConfigSalon({...configSalon, fidelite_recompense_valeur: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    )}

                    <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '24px 0 8px 0'}}>📱 Relance SMS Auto</h4>
                    <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                        <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Délai d'inactivité avant relance (Jours)</label>
                        <input type="number" className="input-fournisseur" placeholder="Ex: 60" value={configSalon.fidelite_delai_sms || ''} onChange={e => setConfigSalon({...configSalon, fidelite_delai_sms: e.target.value})} />
                        <p style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0}}>Un SMS incitatif sera envoyé si le client ne vient pas pendant cette durée.</p>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'sms': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Vos clients recevront un SMS de remerciement.</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API Brevo" value={configSalon.brevo_api_key || ''} onChange={(e) => setConfigSalon({...configSalon, brevo_api_key: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Nom expéditeur (ex: MonSalon)" maxLength="11" value={configSalon.sms_sender_name || ''} onChange={(e) => setConfigSalon({...configSalon, sms_sender_name: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Lien d'avis Google Maps" value={configSalon.lien_google_maps || ''} onChange={(e) => setConfigSalon({...configSalon, lien_google_maps: e.target.value})} />
                  </div>
        {carteSauvegarde}
      </>);
      case 'horaires': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Modifiez l'affichage de votre grille.</span>
                    <div style={{display: 'flex', gap: '15px'}}>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: '500'}}>Ouverture (0-23)</label>
                        <input type="number" min="0" max="23" className="input-fournisseur" value={configSalon.heure_ouverture || 8} onChange={e => setConfigSalon({...configSalon, heure_ouverture: e.target.value})} />
                      </div>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: '500'}}>Fermeture (0-23)</label>
                        <input type="number" min="0" max="23" className="input-fournisseur" value={configSalon.heure_fermeture || 20} onChange={e => setConfigSalon({...configSalon, heure_fermeture: e.target.value})} />
                      </div>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'alertes': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'block'}}>Recevez un SMS si une tâche de votre Centre d'Action arrive à expiration.</span>
                    
                    <div style={{display: 'flex', gap: '15px', alignItems: 'center', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                        <div style={{flex: 1}}>
                            <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Votre téléphone</label>
                            <input type="tel" className="input-fournisseur" placeholder="Ex: +33612345678" value={configSalon.telephone_gerant || ''} onChange={(e) => setConfigSalon({...configSalon, telephone_gerant: e.target.value})} />
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px'}}>
                            <input type="checkbox" id="alertes_sms" checked={configSalon.alertes_sms_actives || false} onChange={(e) => setConfigSalon({...configSalon, alertes_sms_actives: e.target.checked})} style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--btn-primary)'}} />
                            <label htmlFor="alertes_sms" style={{fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600'}}>Activer les SMS</label>
                        </div>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'google': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Connectez vos avis clients en direct.</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API Google" value={configSalon.google_api_key || ''} onChange={(e) => setConfigSalon({...configSalon, google_api_key: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Google Account ID" value={configSalon.google_account_id || ''} onChange={(e) => setConfigSalon({...configSalon, google_account_id: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Google Location ID" value={configSalon.google_location_id || ''} onChange={(e) => setConfigSalon({...configSalon, google_location_id: e.target.value})} />
                  </div>
        {carteSauvegarde}
      </>);
      case 'mail': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', display: 'block'}}>Connectez la boîte mail de votre salon. L'IA analysera vos factures fournisseurs et cette adresse servira d'expéditeur.</span>
                    <input type="email" className="input-fournisseur" placeholder="Email du salon (ex: contact@monsalon.com)" value={configSalon.email_factures || ''} onChange={(e) => setConfigSalon({...configSalon, email_factures: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="password" className="input-fournisseur" placeholder="Mot de passe d'application" value={configSalon.mot_de_passe_email || ''} onChange={(e) => setConfigSalon({...configSalon, mot_de_passe_email: e.target.value})} />
                  </div>
        {carteSauvegarde}
      </>);
      case 'export_compta': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'block'}}>Le bilan mensuel sera envoyé automatiquement à cette adresse tous les mois. (La Boîte mail du salon doit être configurée au-dessus).</span>
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Adresse e-mail du comptable</label>
                    <input type="email" className="input-fournisseur" placeholder="Ex: cabinet@expert-comptable.fr" value={configSalon.email_comptable || ''} onChange={(e) => setConfigSalon({...configSalon, email_comptable: e.target.value})} style={{marginBottom: '16px'}}/>
                    
                    <div style={{background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)'}}>
                        <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Jour d'envoi automatique (1 à 31)</label>
                        <input type="number" min="1" max="31" className="input-fournisseur" placeholder="Ex: 1 (le 1er du mois)" value={configSalon.jour_envoi_bilan || 1} onChange={(e) => setConfigSalon({...configSalon, jour_envoi_bilan: e.target.value})} />
                        <p style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0}}>Si le mois est plus court (ex: février), l'envoi se fera le dernier jour du mois.</p>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'tpe': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px'}}>Connectez votre lecteur de carte physique au logiciel de caisse.</span>
                    <input type="text" className="input-fournisseur" placeholder="Identifiant du lecteur (ex: tmr_...)" value={configSalon.stripe_reader_id || ''} onChange={(e) => setConfigSalon({...configSalon, stripe_reader_id: e.target.value})} />
                  </div>
        {carteSauvegarde}
      </>);
      case 'cgu': return pageLegale(TEXTE_CONDITIONS_GENERALES);
      case 'confidentialite': return pageLegale(TEXTE_POLITIQUE_CONFIDENTIALITE);
      default: return null;
    }
  };

  return (
    <div className="st-page" key={section || 'liste'}>
      <div className="st-header">
        <button type="button" className="st-back" onClick={retour} aria-label="Retour">{ICONS.back}</button>
        <h1 className="st-title">{section ? TITRES[section] : 'Paramètres'}</h1>
      </div>

      {section === null ? (
        <>
          <div className="st-account">
            <div className="st-avatar">{ICONS.person}</div>
            <div>
              <div className="st-account-name">{configSalon.nom_salon || 'Mon salon'}</div>
              {salonId ? <div className="st-account-id">ID : {salonId}</div> : null}
            </div>
          </div>

          {GROUPES.slice(0, 3).map((g, i) => (
            <section key={i}>
              {g.titre && <h2 className="st-section-title">{g.titre}</h2>}
              <div className="st-group">
                {g.lignes.map((l) => (
                  <button type="button" key={l.id} className="st-row" onClick={() => setSection(l.id)}>
                    <span className="st-row-icon">{l.icone}</span>
                    <span className="st-row-label">{l.label}</span>
                    {l.valeur ? <span className="st-row-value">{l.valeur}</span> : null}
                    <span className="st-row-chevron">{ICONS.chevron}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section>
            <h2 className="st-section-title">Affichage</h2>
            <div className="st-group">
              <button type="button" className="st-row" onClick={onToggleTheme} role="switch" aria-checked={!!isDarkMode}>
                <span className="st-row-icon">{ICONS.moon}</span>
                <span className="st-row-label">Mode sombre</span>
                <span className="st-row-value">{isDarkMode ? 'Sombre' : 'Clair'}</span>
                <span className={`st-switch${isDarkMode ? ' on' : ''}`}></span>
              </button>
            </div>
          </section>

          {GROUPES.slice(3).map((g, i) => (
            <section key={'l' + i}>
              {g.titre && <h2 className="st-section-title">{g.titre}</h2>}
              <div className="st-group">
                {g.lignes.map((l) => (
                  <button type="button" key={l.id} className="st-row" onClick={() => setSection(l.id)}>
                    <span className="st-row-icon">{l.icone}</span>
                    <span className="st-row-label">{l.label}</span>
                    <span className="st-row-chevron">{ICONS.chevron}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <div className="st-group st-group-logout">
            <button type="button" className="st-row" onClick={onLogout}>
              <span className="st-row-icon">{ICONS.logout}</span>
              <span className="st-row-label">Déconnexion</span>
            </button>
          </div>
        </>
      ) : (
        <div className="st-detail">{renderSection(section)}</div>
      )}
    </div>
  );
}
