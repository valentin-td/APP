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
  link: ico(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>),
  lock: ico(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
  key: ico(<><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>),
  logout: ico(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
  back: ico(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  person: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c0-4.2 3.6-6.8 8.5-6.8s8.5 2.6 8.5 6.8z"/></svg>,
};

const TITRES = {
  identite: 'Identité & Légal (NF525)',
  securite: 'Sécurité & Codes PIN',
  fidelite: 'Programme de fidélité',
  sms: 'Fidélisation (SMS Auto)',
  horaires: "Horaires de l'agenda",
  alertes: 'Alertes urgences (gérant)',
  google: 'Google My Business',
  sync_planity: 'Synchronisation Planity',
  mail: 'Boîte mail du salon',
  export_compta: 'Exportations comptable',
  config_compta: 'Configuration Comptable (FEC)',
  tpe: 'TPE physique (Stripe Terminal)',
  cgu: 'Conditions générales',
  confidentialite: 'Politique de confidentialité',
  nf525: 'Attestation Fiscale NF525',
};

export default function Parametres({
  configSalon, setConfigSalon, onSave, onBack, onLogout,
  salonId, isDarkMode, onToggleTheme, onEnablePush, role, photoUrl, onUploadPhoto, employesListe
}) {
  const [section, setSection] = useState(null);   // null = liste principale

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
  }, [section]);

  const retour = () => (section ? setSection(null) : onBack());
  const statut = (ok, oui = 'Configuré', non = 'À configurer') => (ok ? oui : non);

  const fideliteLabel = { NONE: 'Désactivé', POINTS: 'Points', TAMPONS: 'Tampons' }[configSalon.fidelite_type || 'NONE'];

  // Rôle "gerant" : accès complet. Rôle "salon" : uniquement les horaires. Rôle "employe" : rien de spécifique (affichage + légal + déconnexion seulement).
  const groupesHaut = role === 'gerant' ? [
    { titre: null, lignes: [
      { id: 'fidelite', icone: ICONS.gift, label: 'Programme de fidélité', valeur: fideliteLabel },
      { id: 'sms', icone: ICONS.sms, label: 'Fidélisation SMS', valeur: statut(configSalon.brevo_api_key) },
    ] },
    { titre: 'Salon', lignes: [
      { id: 'identite', icone: ICONS.shield, label: 'Identité & Légal', valeur: statut(configSalon.siret) },
      { id: 'securite', icone: ICONS.lock, label: 'Sécurité', valeur: configSalon.securite_pin_salon_active !== false ? 'Activée' : 'Désactivée' },
      { id: 'horaires', icone: ICONS.calendar, label: "Horaires de l'agenda", valeur: `${configSalon.heure_ouverture || 8}h – ${configSalon.heure_fermeture || 20}h` },
      { id: 'alertes', icone: ICONS.bell, label: 'Alertes urgences', valeur: statut(configSalon.alertes_sms_actives, 'Activées', 'Désactivées') },
      { id: 'mail', icone: ICONS.mail, label: 'Boîtes mail du salon', valeur: `${(Array.isArray(configSalon.comptes_emails) ? configSalon.comptes_emails : []).filter(c => c.email).length} / 5` },
    ] },
    { titre: 'Intégrations & Comptabilité', lignes: [
      { id: 'google', icone: ICONS.star, label: 'Google My Business', valeur: statut(configSalon.google_api_key) },
      { id: 'sync_planity', icone: ICONS.link, label: 'Synchronisation Planity (iCal)', valeur: '' },
      { id: 'export_compta', icone: ICONS.send, label: 'Envoi Bilan Comptable', valeur: statut(configSalon.email_comptable) },
      { id: 'config_compta', icone: ICONS.file, label: 'Configuration Comptable (FEC)' },
      { id: 'tpe', icone: ICONS.card, label: 'TPE physique', valeur: statut(configSalon.stripe_reader_id) },
    ] },
    { titre: 'Ressources Humaines (RH)', lignes: [
      { id: 'suivi_heures', icone: ICONS.person, label: 'Suivi des heures', valeur: configSalon.mode_suivi_heures === 'POINTEUSE' ? 'Pointeuse (Premium)' : 'Semi-Auto (Pro)' },
    ] },    
  ] : role === 'salon' ? [
    { titre: 'Salon', lignes: [
      { id: 'horaires', icone: ICONS.calendar, label: "Horaires de l'agenda", valeur: `${configSalon.heure_ouverture || 8}h – ${configSalon.heure_fermeture || 20}h` },
    ] },
  ] : role === 'employe' ? [
    { titre: 'Sécurité de mon compte', lignes: [
      { id: 'securite_employe', icone: ICONS.lock, label: 'Modifier mon code PIN personnel' },
    ] },
  ] : [];

const groupesBas = [
      { titre: 'Informations légales', lignes: [
        { id: 'cgu', icone: ICONS.file, label: 'Conditions générales' },
        { id: 'confidentialite', icone: ICONS.shield, label: 'Politique de confidentialité' },
        { id: 'nf525', icone: ICONS.shield, label: 'Attestation Fiscale NF525' },
      ] },
    ];

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
      setIsSaving(true);
      setSaveSuccess(false);
      try {
          const ok = await onSave(configSalon);
          if (ok !== false) {
              setSaveSuccess(true);
              setTimeout(() => setSaveSuccess(false), 3000);
          }
      } finally {
          setIsSaving(false);
      }
  };

  const carteSauvegarde = (
    <div style={{ marginTop: '16px', marginBottom: '32px' }}>
      <button 
          type="button" 
          className="btn-action" 
          style={{
              width: '100%',
              opacity: isSaving ? 0.7 : 1,
              cursor: isSaving ? 'wait' : 'pointer',
              background: saveSuccess ? 'var(--color-success)' : undefined,
              color: saveSuccess ? '#ffffff' : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
          }} 
          onClick={handleSave} 
          disabled={isSaving}
      >
          {saveSuccess ? (
              <>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Modifications enregistrées</span>
              </>
          ) : isSaving ? (
              <span>Enregistrement en cours...</span>
          ) : (
              <span>Enregistrer la configuration</span>
          )}
      </button>
    </div>
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
 const telechargerDossierNF525 = async () => {
    try {
        const apiBase = window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://api-salon-backend.onrender.com';
        const tokenLocal = localStorage.getItem('token_api') || localStorage.getItem('token');

        const response = await fetch(`${apiBase}/api/admin/dossier-technique-nf525/pdf`, {
            method: 'GET',
            credentials: 'include',
            headers: tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {}
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf')) {
            let msg = "Erreur lors de la génération du Dossier Technique NF525.";
            try {
                const errData = await response.json();
                if (errData.erreur) msg = errData.erreur;
            } catch (e) { /* ignore */ }
            throw new Error(msg);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dossier_Technique_Attestation_NF525_STACK.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert(err.message);
    }
  };

  const renderSection = (id) => {
    switch (id) {
      case 'identite': return (<>
          <div className="carte scan-carte">
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px' }}>Ces informations sont obligatoires pour générer votre Liasse Comptable Légale (NF525).</span>
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Raison sociale / Nom</label>
                      <input type="text" className="input-fournisseur" value={configSalon.nom_salon || ''} onChange={e => setConfigSalon({...configSalon, nom_salon: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forme juridique</label>
                      <select className="input-fournisseur" value={configSalon.forme_juridique || ''} onChange={e => setConfigSalon({...configSalon, forme_juridique: e.target.value})}>
                          <option value="">Sélectionner</option>
                          <option value="SARL">SARL</option>
                          <option value="EURL">EURL</option>
                          <option value="SAS">SAS</option>
                          <option value="SASU">SASU</option>
                          <option value="Auto-entrepreneur">Auto-entrepreneur</option>
                          <option value="EI">EI</option>
                          <option value="EIRL">EIRL</option>
                          <option value="SNC">SNC</option>
                          <option value="SA">SA</option>
                          <option value="Association">Association</option>
                      </select>
                  </div>
              </div>

              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adresse complète</label>
              <input type="text" className="input-fournisseur" value={configSalon.adresse_salon || ''} onChange={e => setConfigSalon({...configSalon, adresse_salon: e.target.value})} style={{ marginBottom: '12px' }} />
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numéro SIRET</label>
                      <input type="text" className="input-fournisseur" placeholder="Ex: 12345678900012" value={configSalon.siret || ''} onChange={e => setConfigSalon({...configSalon, siret: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>N° TVA Intracom.</label>
                      <input type="text" className="input-fournisseur" placeholder="Vide si franchise" value={configSalon.tva_intra || ''} onChange={e => setConfigSalon({...configSalon, tva_intra: e.target.value})} />
                  </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capital Social (Si société)</label>
                      <input type="text" className="input-fournisseur" placeholder="Ex: 1 000 €" value={configSalon.capital_social || ''} onChange={e => setConfigSalon({...configSalon, capital_social: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ville du RCS</label>
                      <input type="text" className="input-fournisseur" placeholder="Ex: Paris" value={configSalon.rcs_ville || ''} onChange={e => setConfigSalon({...configSalon, rcs_ville: e.target.value})} />
                  </div>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0', fontStyle: 'italic' }}>
                  * Laissez le champ TVA vide si vous êtes en Franchise en base de TVA. Le logiciel génèrera une liasse sans TVA. Remplissez-le dès le dépassement de votre seuil majoré.
              </p>
          </div>

          {/* Bloc de téléchargement du Dossier Technique & Attestation NF525 */}
          <div className="carte scan-carte" style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                      <span style={{ width: '20px', height: '20px', display: 'flex' }}>{ICONS.shield}</span>
                  </div>
                  <div>
                      <h4 style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 2px 0', fontWeight: '600' }}>Dossier Technique & Attestation (NF525)</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Document officiel de contrôle fiscal (Art. L. 80 O du LPF)</span>
                  </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                Génère le dossier technique descriptif de l'architecture cryptographique de STACK, l'état de scellement en direct de votre salon et votre attestation individuelle pré-remplie.
              </p>
              <button
                  type="button"
                  onClick={telechargerDossierNF525}
                  style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-input, 12px)',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                  }}
              >
                  <span style={{ width: '16px', height: '16px', display: 'flex' }}>{ICONS.file}</span>
                  Télécharger le Dossier Technique & Attestation (PDF)
              </button>
          </div>

        {carteSauvegarde}
      </>);
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

                    <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '24px 0 8px 0'}}>Relance SMS Auto</h4>
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
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px'}}>Configurez l'envoi de vos SMS automatiques (remerciement, avis Google et rappels).</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API Brevo" value={configSalon.brevo_api_key || ''} onChange={(e) => setConfigSalon({...configSalon, brevo_api_key: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Nom expéditeur (ex: MonSalon)" maxLength="11" value={configSalon.sms_sender_name || ''} onChange={(e) => setConfigSalon({...configSalon, sms_sender_name: e.target.value})} style={{marginBottom: '12px'}}/>
                    <input type="text" className="input-fournisseur" placeholder="Lien d'avis Google Maps" value={configSalon.lien_google_maps || ''} onChange={(e) => setConfigSalon({...configSalon, lien_google_maps: e.target.value})} style={{marginBottom: '20px'}} />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px', background: 'var(--bg-app)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-main)', fontWeight: '600' }}>Rappel automatique 2h avant le RDV</h4>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', lineHeight: '1.4' }}>
                          Activez cette option si vous n'utilisez pas déjà un système externe (ex: Planity) qui envoie ses propres SMS de rappel, afin d'éviter les doublons.
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!configSalon.rappel_rdv_2h_actif}
                        onClick={() => setConfigSalon({ ...configSalon, rappel_rdv_2h_actif: !configSalon.rappel_rdv_2h_actif })}
                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <span className={`st-switch${configSalon.rappel_rdv_2h_actif ? ' on' : ''}`}></span>
                      </button>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'securite': {
          const pinSensibleActif = configSalon.securite_pin_salon_active !== false;
          const actionsProtegees = [
              { titre: 'Clôture journalière (Z de caisse)', desc: 'Authentifie formellement le collaborateur qui compte les espèces et scelle le Z (champ opérateur NF525).', icone: ICONS.shield },
              { titre: 'Mouvements du tiroir-caisse & Régularisations', desc: 'Demande le code PIN personnel lors des apports de monnaie, retraits d\'espèces ou régularisations matinales.', icone: ICONS.card },
              { titre: 'Pointeuse numérique & Présence', desc: 'Empêche un collaborateur de pointer une entrée, une pause ou une sortie à la place d\'un collègue.', icone: ICONS.person },
          ];
          return (<>
              <div className="carte scan-carte">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '42px', height: '42px', minWidth: '42px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                              <span style={{ width: '20px', height: '20px', display: 'flex' }}>{ICONS.lock}</span>
                          </div>
                          <div>
                              <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', color: 'var(--text-main)', fontWeight: '600' }}>Code PIN sur les actions sensibles</h3>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Appliqué uniquement sur l'interface partagée « Salon »</span>
                          </div>
                      </div>
                      <button
                          type="button"
                          role="switch"
                          aria-checked={pinSensibleActif}
                          onClick={() => setConfigSalon({ ...configSalon, securite_pin_salon_active: !pinSensibleActif })}
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                          <span className={`st-switch${pinSensibleActif ? ' on' : ''}`}></span>
                      </button>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 14px 0' }}>
                      Lorsque cette protection est activée, chaque collaborateur utilisant la tablette commune du salon doit saisir son code PIN personnel pour valider une opération critique. Votre session « Gérant » reste exemptée de code PIN.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '16px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                      <span style={{ width: '16px', height: '16px', minWidth: '16px', color: 'var(--text-main)', marginTop: '1px', display: 'flex' }}>{ICONS.shield}</span>
                      <span>
                          <strong style={{ color: 'var(--text-main)' }}>Protection anti-forçage :</strong> Après 3 essais erronés, les actions sensibles du collaborateur sont suspendues pendant 15 min, puis 30 min (+2 essais), 1 h (+2 essais), avant blocage définitif nécessitant votre déblocage manuel dans l'onglet Équipe.
                      </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: pinSensibleActif ? 1 : 0.55, transition: 'opacity 0.2s ease' }}>
                      {actionsProtegees.map((act, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                              <span style={{ width: '18px', height: '18px', minWidth: '18px', color: 'var(--text-main)', marginTop: '2px', display: 'flex' }}>{act.icone}</span>
                              <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>{act.titre}</span>
                                      <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: '6px', background: pinSensibleActif ? 'var(--bg-hover, rgba(0,0,0,0.06))' : 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                                          {pinSensibleActif ? 'PIN requis' : 'Libre'}
                                      </span>
                                  </div>
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4', display: 'block' }}>{act.desc}</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="carte scan-carte" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ width: '38px', height: '38px', minWidth: '38px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                          <span style={{ width: '18px', height: '18px', display: 'flex' }}>{ICONS.key}</span>
                      </div>
                      <div>
                          <h4 style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 2px 0', fontWeight: '600' }}>Code PIN d'ouverture du poste « Salon »</h4>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Connexion initiale à la tablette d'accueil partagée</span>
                      </div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px', lineHeight: '1.4' }}>
                      Ce code PIN permet d'ouvrir la session commune du salon le matin (Caisse, Stock, Agenda, Académie, Messagerie, Clôture). Laissez ce champ vide si vous ne souhaitez pas modifier le code actuel.
                  </span>
                  <input
                      type="password"
                      inputMode="numeric"
                      maxLength="10"
                      className="input-fournisseur"
                      placeholder="Nouveau code PIN du poste Salon (ex: 2580)"
                      value={configSalon.pin_salon || ''}
                      onChange={e => setConfigSalon({ ...configSalon, pin_salon: e.target.value.replace(/\D/g, '') })}
                  />
              </div>
              {carteSauvegarde}
          </>);
      }
      case 'securite_employe': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'block'}}>Modifiez votre code PIN personnel à 4 chiffres. Ce code est strictement confidentiel.</span>
                    <input type="password" maxLength="4" inputMode="numeric" className="input-fournisseur" placeholder="Nouveau PIN (ex: 1234)" value={configSalon.nouveau_pin_employe || ''} onChange={(e) => setConfigSalon({...configSalon, nouveau_pin_employe: e.target.value.replace(/\D/g, '')})} style={{marginBottom: '16px', letterSpacing: '0.2em', fontWeight: 'bold'}}/>
                    <button type="button" className="btn-action" style={{ width: '100%' }} onClick={async () => {
                        if (!configSalon.nouveau_pin_employe || configSalon.nouveau_pin_employe.length < 4) return alert("Veuillez saisir 4 chiffres.");
                        try {
                            const tokenApi = localStorage.getItem('api_token');
                            const res = await fetch(`https://api-salon-backend.onrender.com/api/employes/mon-pin`, {
                                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenApi}` },
                                body: JSON.stringify({ nouveau_pin: configSalon.nouveau_pin_employe })
                            });
                            if(res.ok) { alert("Code PIN modifié avec succès !"); setConfigSalon({...configSalon, nouveau_pin_employe: ''}); }
                            else alert("Erreur : Ce code PIN est trop simple ou invalide.");
                        } catch(e) { alert("Erreur de connexion."); }
                    }}>Enregistrer le nouveau PIN</button>
                  </div>
      </>);
      case 'horaires': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '14px'}}>Modifiez l'amplitude horaire affichée sur votre agenda (de 0h à 23h).</span>
                    <div style={{display: 'flex', gap: '15px'}}>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600'}}>Ouverture (0-23)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="8"
                          className="input-fournisseur"
                          value={configSalon.heure_ouverture ?? ''}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                            if (raw === '') {
                              setConfigSalon({ ...configSalon, heure_ouverture: '' });
                            } else {
                              setConfigSalon({ ...configSalon, heure_ouverture: Math.min(23, parseInt(raw, 10)) });
                            }
                          }}
                          onBlur={() => {
                            if (configSalon.heure_ouverture === '' || configSalon.heure_ouverture === null || isNaN(parseInt(configSalon.heure_ouverture, 10))) {
                              setConfigSalon({ ...configSalon, heure_ouverture: 8 });
                            }
                          }}
                        />
                      </div>
                      <div style={{flex: 1}}>
                        <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600'}}>Fermeture (0-23)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="20"
                          className="input-fournisseur"
                          value={configSalon.heure_fermeture ?? ''}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                            if (raw === '') {
                              setConfigSalon({ ...configSalon, heure_fermeture: '' });
                            } else {
                              setConfigSalon({ ...configSalon, heure_fermeture: Math.min(23, parseInt(raw, 10)) });
                            }
                          }}
                          onBlur={() => {
                            if (configSalon.heure_fermeture === '' || configSalon.heure_fermeture === null || isNaN(parseInt(configSalon.heure_fermeture, 10))) {
                              setConfigSalon({ ...configSalon, heure_fermeture: 20 });
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
        {carteSauvegarde}
      </>);
      case 'alertes': return (<>
                  <div className="carte scan-carte">
                    <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '0 0 16px 0'}}>Notifications sur ce téléphone</h4>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '16px'}}>Recevez des alertes en direct (messages, RDV, urgences) même si l'application est fermée.</span>
                    <button type="button" className="btn-action" style={{ width: '100%', marginBottom: '24px' }} onClick={onEnablePush}>Activer les notifications de l'App</button>
                    
                    <div style={{borderBottom: '1px solid var(--border-color)', margin: '0 -24px 24px -24px'}}></div>
                    
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0'}}>
                        <span style={{width: '16px', height: '16px', display: 'flex', color: 'var(--text-main)'}}>{ICONS.sms}</span>
                        <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: 0}}>Alertes SMS (Secours)</h4>
                    </div>
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
      case 'mail': {
          let comptes = Array.isArray(configSalon.comptes_emails) ? [...configSalon.comptes_emails] : [];
          if (comptes.length === 0 && configSalon.email_factures) {
              comptes = [{ email: configSalon.email_factures, mot_de_passe: configSalon.mot_de_passe_email || '' }];
          }
          if (comptes.length === 0) {
              comptes = [{ email: '', mot_de_passe: '' }];
          }

          return (<>
              <div className="carte scan-carte">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>Adresses e-mail connectées (Max 5)</span>
                      <span className="badge-discret" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)' }}>{comptes.length} / 5</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>
                      L'IA de STACK scrute ces boîtes mail pour alimenter automatiquement votre comptabilité (factures, reçus) et votre agenda (rendez-vous).
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                      {comptes.map((compte, idx) => (
                          <div key={idx} style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Boîte mail #{idx + 1}</span>
                                  {comptes.length > 1 && (
                                      <button 
                                          type="button" 
                                          onClick={() => {
                                              const updated = comptes.filter((_, i) => i !== idx);
                                              setConfigSalon({
                                                  ...configSalon,
                                                  comptes_emails: updated,
                                                  email_factures: updated[0]?.email || '',
                                                  mot_de_passe_email: updated[0]?.mot_de_passe || ''
                                              });
                                          }} 
                                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      >
                                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                          Supprimer
                                      </button>
                                  )}
                              </div>
                              <input 
                                  type="email" 
                                  className="input-fournisseur" 
                                  placeholder="Ex: comptabilite@monsalon.fr" 
                                  value={compte.email || ''} 
                                  onChange={e => {
                                      const updated = [...comptes];
                                      updated[idx] = { ...updated[idx], email: e.target.value };
                                      setConfigSalon({
                                          ...configSalon,
                                          comptes_emails: updated,
                                          email_factures: idx === 0 ? e.target.value : configSalon.email_factures,
                                          mot_de_passe_email: idx === 0 ? updated[0]?.mot_de_passe : configSalon.mot_de_passe_email
                                      });
                                  }} 
                                  style={{ marginBottom: '10px' }}
                              />
                              <input 
                                  type="password" 
                                  className="input-fournisseur" 
                                  placeholder="Mot de passe d'application (fournisseur mail)" 
                                  value={compte.mot_de_passe || ''} 
                                  onChange={e => {
                                      const updated = [...comptes];
                                      updated[idx] = { ...updated[idx], mot_de_passe: e.target.value };
                                      setConfigSalon({
                                          ...configSalon,
                                          comptes_emails: updated,
                                          mot_de_passe_email: idx === 0 ? e.target.value : configSalon.mot_de_passe_email
                                      });
                                  }} 
                                  style={{ marginBottom: 0 }}
                              />
                          </div>
                      ))}
                  </div>

                  {comptes.length < 5 && (
                      <button 
                          type="button" 
                          onClick={() => {
                              const updated = [...comptes, { email: '', mot_de_passe: '' }];
                              setConfigSalon({ ...configSalon, comptes_emails: updated });
                          }} 
                          style={{ width: '100%', padding: '12px', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px dashed var(--border-color)', borderRadius: '12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Ajouter une autre boîte mail (+1 max 5)
                      </button>
                  )}
              </div>
              {carteSauvegarde}
          </>);
      }
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
      case 'config_compta': return (<>
                  <div className="carte scan-carte">
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'block'}}>Personnalisez vos codes comptables (Plan Comptable Général) pour l'export FEC.</span>
                    
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Compte Banque</label>
                    <input type="text" className="input-fournisseur" value={configSalon.compte_banque || '512000'} onChange={(e) => setConfigSalon({...configSalon, compte_banque: e.target.value})} style={{marginBottom: '12px'}}/>
                    
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Compte Caisse (Espèces)</label>
                    <input type="text" className="input-fournisseur" value={configSalon.compte_caisse || '530000'} onChange={(e) => setConfigSalon({...configSalon, compte_caisse: e.target.value})} style={{marginBottom: '12px'}}/>
                    
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Ventes Prestations</label>
                    <input type="text" className="input-fournisseur" value={configSalon.compte_prestations || '706000'} onChange={(e) => setConfigSalon({...configSalon, compte_prestations: e.target.value})} style={{marginBottom: '12px'}}/>
                    
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Ventes Produits</label>
                    <input type="text" className="input-fournisseur" value={configSalon.compte_produits || '707000'} onChange={(e) => setConfigSalon({...configSalon, compte_produits: e.target.value})} style={{marginBottom: '12px'}}/>
                    
                    <label style={{fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em'}}>TVA Collectée</label>
                    <input type="text" className="input-fournisseur" value={configSalon.compte_tva || '445710'} onChange={(e) => setConfigSalon({...configSalon, compte_tva: e.target.value})} style={{marginBottom: '24px'}}/>

                    <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px'}}>API Temps Réel (Pennylane, Tiime...)</h4>
                    <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', display: 'block'}}>Collez ici votre clé d'API. À chaque "Z de Caisse", l'écriture comptable sera poussée automatiquement au logiciel de votre expert-comptable.</span>
                    <input type="text" className="input-fournisseur" placeholder="Clé API (ex: sk_live_...)" value={configSalon.pennylane_api_key || ''} onChange={(e) => setConfigSalon({...configSalon, pennylane_api_key: e.target.value})} />
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

      case 'sync_planity': return (<>
          <div className="carte scan-carte" style={{textAlign: 'left'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px'}}>
                  <div style={{width: '48px', height: '48px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)'}}>{ICONS.link}</div>
                  <div>
                      <h3 style={{margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-main)'}}>Liens iCal (Webcal)</h3>
                      <p style={{margin: 0, fontSize: '12px', color: 'var(--text-secondary)'}}>Connectez vos collaborateurs à Planity ou Treatwell.</p>
                  </div>
              </div>

              <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '0 0 16px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px'}}>1. Comment ça marche ? (Tutoriel)</h4>
              <div style={{display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px'}}>
                  <div className="tuto-step">
                      <span className="tuto-step-number">1</span>
                      <span className="tuto-step-text"><b>Copiez le lien personnel</b> de votre collaborateur dans la liste ci-dessous.</span>
                  </div>
                  <div className="tuto-step">
                      <span className="tuto-step-number">2</span>
                      <span className="tuto-step-text">Ouvrez <b>Planity PRO</b>, naviguez dans <i>Réglages &gt; Gestion des agendas &gt; Importer un agenda externe</i>.</span>
                  </div>
                  <div className="tuto-step">
                      <span className="tuto-step-number">3</span>
                      <span className="tuto-step-text"><b>Collez le lien.</b> L'agenda de STACK bloquera automatiquement les créneaux indisponibles sur Planity.</span>
                  </div>
              </div>

              <h4 style={{fontSize: '13px', color: 'var(--text-main)', margin: '0 0 16px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px'}}>2. Vos liens de synchronisation</h4>
              {(!employesListe || employesListe.length === 0) ? (
                  <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Aucun employé n'est enregistré dans l'équipe.</p>
              ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                      {employesListe.map(emp => {
                          const icalUrl = `https://api-salon-backend.onrender.com/api/ical/${salonId}/${emp.id_employe}.ics`;
                          return (
                              <div key={emp.id_employe} className="employe-link-row">
                                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                      {emp.photo_url ? (
                                          <img src={emp.photo_url} alt="" style={{width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)'}} />
                                      ) : (
                                          <div style={{width: '32px', height: '32px', borderRadius: '50%', background: 'var(--btn-primary)', color: 'var(--btn-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold'}}>{emp.nom.substring(0, 2).toUpperCase()}</div>
                                      )}
                                      <span style={{fontSize: '14px', fontWeight: '600', color: 'var(--text-main)'}}>{emp.nom}</span>
                                  </div>
                                  <button onClick={(e) => { 
                                      navigator.clipboard.writeText(icalUrl); 
                                      const old = e.target.innerText; e.target.innerText = 'Copié'; 
                                      setTimeout(() => { e.target.innerText = old; }, 2000); 
                                  }} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s'}}>
                                      Copier le lien
                                  </button>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      </>);
      case 'suivi_heures': return (<>
          <div className="carte scan-carte">
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-main)' }}>Suivi des heures & Liasse comptable</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  STACK pré-remplit les heures de vos collaborateurs sur la liasse mensuelle. Choisissez votre méthode de suivi.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <label style={{ display: 'flex', gap: '12px', padding: '16px', background: configSalon.mode_suivi_heures !== 'POINTEUSE' ? 'var(--bg-hover)' : 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="mode_suivi" checked={configSalon.mode_suivi_heures !== 'POINTEUSE'} onChange={() => setConfigSalon({...configSalon, mode_suivi_heures: 'MANUEL'})} style={{ accentColor: 'var(--btn-primary)', marginTop: '4px' }} />
                      <div>
                          <span style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '14px' }}>Mode Semi-Automatique (Inclus Pro)</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Les contrats (35h, 24h...) s'inscrivent automatiquement à la fin du mois. Vous ne saisissez que les ajustements (Heures Supp/Absences) dans l'onglet Équipe.</span>
                      </div>
                  </label>

                  <label style={{ display: 'flex', gap: '12px', padding: '16px', background: configSalon.mode_suivi_heures === 'POINTEUSE' ? 'var(--bg-info)' : 'var(--bg-app)', border: configSalon.mode_suivi_heures === 'POINTEUSE' ? '1px solid var(--color-info)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="mode_suivi" checked={configSalon.mode_suivi_heures === 'POINTEUSE'} onChange={() => setConfigSalon({...configSalon, mode_suivi_heures: 'POINTEUSE'})} style={{ accentColor: 'var(--btn-primary)', marginTop: '4px' }} />
                      <div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '14px' }}>Pointeuse Numérique <span style={{ background: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>PREMIUM</span></span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Vos employés pointent chaque matin/soir avec leur code PIN. STACK calcule le temps de travail réel à la minute près et déduit les Heures Supp' tout seul.</span>
                      </div>
                  </label>
              </div>
          </div>
        {carteSauvegarde}
      </>);
      
      case 'cgu': return (
        <div className="carte scan-carte" style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '13px', color: 'var(--text-main)' }}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>Conditions Générales d'Utilisation et de Vente (CGU/CGV)</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Édité par Valentin Tardy (STACK), 32 rue du Goujon, Strasbourg — SIRET : En cours d'immatriculation. Contact support : contact@stack.fr</p>

            <p><strong>1. Objet du contrat</strong><br/>L'application STACK est un logiciel en mode SaaS destiné à la gestion de salons de coiffure (caisse, agenda, stocks, ressources humaines et marketing).</p>

            <p><strong>2. Accès et Sécurité des Identifiants</strong><br/>L'accès au logiciel s'effectue via des comptes individuels (Gérant, Employé) ou un code PIN partagé ("Mode Salon"). L'Utilisateur est entièrement responsable de la confidentialité de ses identifiants et codes PIN. Toute opération ou encaissement effectué via un accès valide est réputé autorisé par le gérant.</p>

            <p><strong>3. Abonnement et Défaut de paiement</strong><br/>L'accès aux fonctionnalités de STACK nécessite un abonnement mensuel actif de 29,00 €, géré de façon sécurisée par Stripe. L'abonnement est sans engagement. En cas d'échec de prélèvement, une période de grâce de 7 jours est accordée. Au-delà, la création de nouvelles données (tickets, RDV) sera suspendue. L'export des données historiques restera accessible.</p>

            <p><strong>4. Conformité Caisse et Loi Anti-fraude (NF525)</strong><br/>STACK intègre un système de clôture (Z de caisse) et un chaînage cryptographique des tickets pour garantir l'inaltérabilité des données.</p>
            <ul style={{ paddingLeft: '20px', marginTop: '-10px', marginBottom: '16px' }}>
                <li>L'Utilisateur est seul responsable de réaliser ses clôtures de caisse quotidiennement.</li>
                <li>L'Utilisateur est seul responsable de ses déclarations fiscales et comptables. STACK agit comme un outil d'assistance et ne remplace pas les conseils d'un expert-comptable.</li>
            </ul>

            <p><strong>5. Disponibilité, Force Majeure et Mode Hors-Ligne</strong><br/>L'éditeur s'efforce de maintenir l'accès au serveur 24h/24, hors cas de force majeure (ex: panne prolongée de l'hébergeur cloud). En cas de coupure réseau, STACK propose un "Mode Hors-Ligne". <strong>Attention :</strong> ces données sont stockées temporairement dans le cache de l'appareil. L'Utilisateur s'engage à se reconnecter rapidement pour synchroniser. STACK décline toute responsabilité en cas de perte de données si l'Utilisateur vide son cache (historique navigateur) ou change d'appareil avant la synchronisation.</p>

            <p><strong>6. Intelligence Artificielle (IA)</strong><br/>L'application propose des outils automatisés (analyse d'e-mails pour RDV ou gestion de stock). L'Utilisateur s'engage à vérifier les tâches générées avant de les valider. STACK ne saurait être tenu responsable d'une erreur d'interprétation de l'IA.</p>

            <p><strong>7. Propriété Intellectuelle et Données</strong><br/>STACK (code, marque, infrastructure) reste la propriété exclusive de Valentin Tardy. Le salon reste propriétaire de ses données métiers (clients, catalogue, comptabilité) et peut les exporter à tout moment.</p>

            <p><strong>8. Résiliation et Sort des données</strong><br/>En cas de résiliation, les données courantes (fichier clients, agenda) seront supprimées de nos serveurs sous 60 jours. Les archives comptables inaltérables (tickets, Z de caisse) seront conservées à disposition pendant la durée légale de 6 ans.</p>

            <p><strong>9. Limitation de Responsabilité</strong><br/>STACK exclut toute responsabilité en cas de perte de chiffre d'affaires liée à une mauvaise utilisation du logiciel ou à une panne matérielle. Si la responsabilité de STACK devait être retenue, celle-ci est expressément plafonnée au montant total des abonnements versés par l'Utilisateur au cours des 12 derniers mois.</p>

            <p><strong>10. Modification des CGU et Juridiction</strong><br/>STACK se réserve le droit de modifier ces CGU moyennant un préavis de 30 jours (notification par e-mail ou sur l'application). Le contrat est soumis au droit français. Tout litige relèvera de la compétence exclusive des tribunaux de Strasbourg.</p>
        </div>
      );

      case 'confidentialite': return (
        <div className="carte scan-carte" style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '13px', color: 'var(--text-main)' }}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>Politique de Confidentialité (RGPD)</h2>
            
            <p><strong>1. Rôles et Responsabilités</strong><br/>Le gérant du salon agit en tant que Responsable de traitement des données de ses clients. STACK agit en tant que Sous-traitant, fournissant l'infrastructure technique.</p>
            
            <p><strong>2. Données collectées et finalités</strong><br/>Nous hébergeons les données suivantes :</p>
            <ul style={{ paddingLeft: '20px', marginTop: '-10px', marginBottom: '16px' }}>
                <li><strong>Données du Salon et Employés :</strong> Nom, email, code PIN, photos de profil. Utilisées pour l'authentification et les statistiques.</li>
                <li><strong>Données Clients :</strong> Identité, téléphone, email, date de naissance, historique, notes, photos avant/après (Académie). Utilisées pour l'agenda, la fidélité et les SMS.</li>
                <li><strong>Données Financières :</strong> Tickets de caisse, paiements. Utilisées pour la conformité fiscale.</li>
                <li><strong>Données Techniques :</strong> Jetons Push pour les notifications.</li>
            </ul>

            <p><strong>3. Cookies et Stockage Local</strong><br/>STACK utilise le stockage local du navigateur (LocalStorage / LocalForage) pour maintenir la session active (Jetons JWT) et permettre le fonctionnement du Mode Hors-Ligne (cache des tickets et de l'agenda). Aucun cookie publicitaire n'est utilisé.</p>

            <p><strong>4. Services Tiers et Transfert de données</strong><br/>STACK s'appuie sur des partenaires sécurisés :</p>
            <ul style={{ paddingLeft: '20px', marginTop: '-10px', marginBottom: '16px' }}>
                <li><strong>Render & PostgreSQL :</strong> Hébergement (UE).</li>
                <li><strong>Stripe :</strong> Paiements et abonnements.</li>
                <li><strong>Brevo :</strong> Envoi de SMS transactionnels.</li>
                <li><strong>Groq (IA) :</strong> Traitement des e-mails. Les serveurs de Groq pouvant être situés hors UE, le transfert est encadré par des Clauses Contractuelles Types. Les textes ne sont jamais utilisés pour entraîner des modèles publics.</li>
            </ul>

            <p><strong>5. Sécurité</strong><br/>Les mots de passe d'accès sont hachés (bcrypt). Les mots de passe d'applications tierces (boîte mail du salon) sont chiffrés en base de données (AES-256). Les échanges internes (messagerie) sont sécurisés et les historiques de caisse scellés cryptographiquement.</p>

            <p><strong>6. Durée de conservation</strong><br/>Les données fiscales (tickets, clôtures Z, journal technique) sont conservées 6 ans (obligation légale). Les autres données (messagerie, clients) sont conservées jusqu'à suppression par le gérant ou 60 jours après résiliation du compte.</p>

            <p><strong>7. Exercice des Droits (CNIL)</strong><br/>Les utilisateurs (gérants/employés) peuvent exercer leurs droits d'accès, rectification ou suppression en écrivant à <strong>contact@stack.fr</strong> (délai de réponse : 1 mois). Vous disposez du droit d'introduire une réclamation auprès de la CNIL. Les clients finaux doivent exercer leurs droits directement auprès de leur salon de coiffure.</p>
        </div>
      );

      case 'nf525': return (
        <div className="carte scan-carte" style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '13px', color: 'var(--text-main)' }}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>Attestation de conformité — Logiciel STACK</h2>
            <div style={{ background: 'var(--bg-info)', padding: '12px', borderRadius: '8px', color: 'var(--color-info)', marginBottom: '24px', fontSize: '12px' }}>
                <strong>Base légale :</strong> article 286, I‑3° bis du Code général des impôts (CGI). Modèle inspiré du document administratif BOI‑LETTRE‑000242 publié par la DGFiP.
            </div>

            <h3 style={{ fontSize: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Volet 1 — Rempli par l'éditeur du logiciel</h3>
            <p><strong>Je soussigné,</strong> Valentin Tardy, agissant en qualité de Fondateur pour le compte de l'entreprise STACK (SIRET : En cours d'immatriculation, siège : 32 rue du Goujon, Strasbourg),</p>
            <p><strong>atteste que</strong> le logiciel de caisse et de gestion dénommé <strong>« STACK »</strong> satisfait aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage des données (ISCA) prévues à l'article 286, I‑3° bis du CGI, à savoir :</p>
            <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
                <li><strong>Inaltérabilité :</strong> toute correction donne lieu à une écriture de compensation traçant l'opération initiale.</li>
                <li><strong>Sécurisation :</strong> chaque écriture est scellée par un chaînage cryptographique (hash).</li>
                <li><strong>Conservation :</strong> le journal des événements techniques (JET) est conservé et ne peut être purgé par l'utilisateur.</li>
                <li><strong>Archivage :</strong> le logiciel permet l'extraction d'une archive fiscale reprenant l'intégralité des données brutes, signée cryptographiquement.</li>
            </ul>

            <h3 style={{ fontSize: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Volet 2 — Rempli par le salon (Utilisateur)</h3>
            <p>Je soussigné(e), représentant l'établissement <strong>{configSalon.nom_salon || 'Gérant du Salon'}</strong>, atteste utiliser ce logiciel pour enregistrer les règlements de mes clients, conformément à la réglementation fiscale en vigueur.</p>
            <p style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '16px' }}>Il est rappelé que l'établissement d'une fausse attestation est un délit pénal passible de 3 ans d'emprisonnement et de 45 000 € d'amende (Code pénal, art. 441‑1).</p>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="st-page" key={section || 'liste'} style={{ position: 'relative', zIndex: 20, paddingBottom: '120px' }}>
      <div
        className="st-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
          paddingBottom: '12px',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <button
          type="button"
          className="st-back"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            retour();
          }}
          aria-label="Retour"
          style={{
            position: 'relative',
            zIndex: 60,
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          {ICONS.back}
        </button>
        <h1 className="st-title" style={{ margin: 0 }}>{section ? TITRES[section] : 'Paramètres'}</h1>
      </div>

      {section === null ? (
        <>
          <div className="st-account">
            {role === 'employe' ? (
                <label className="st-avatar" style={{cursor: 'pointer', overflow: 'hidden', position: 'relative'}}>
                    {photoUrl ? <img src={photoUrl} alt="Ma photo" style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%'}} /> : ICONS.person}
                    <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={onUploadPhoto} style={{display: 'none'}} />
                </label>
            ) : (
                <div className="st-avatar">{ICONS.person}</div>
            )}
            <div>
              <div className="st-account-name">{configSalon.nom_salon || 'Mon salon'}</div>
              {salonId ? <div className="st-account-id">ID : {salonId}</div> : null}
              {role === 'employe' && <div style={{fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px'}}>Touchez votre photo pour la modifier</div>}
            </div>
          </div>

          {groupesHaut.map((g, i) => (
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

          {groupesBas.map((g, i) => (
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
