import { useState, useEffect } from 'react';
import './Parametres.css';
import { TEXTE_CONDITIONS_GENERALES, TEXTE_POLITIQUE_CONFIDENTIALITE } from './textesLegaux';
import { API_URL } from './api/config';
 
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
  camera: ico(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>),
  upload: ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>),
  trash: ico(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>),
  plus: ico(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
};

const TITRES = {
  identite: 'Identité & Légal (NF525)',
  galerie: 'Vitrine & Galerie Photos',
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
  portabilite: 'Export & Portabilité des données (RGPD)',
  abonnement: 'Mon Abonnement & Forfait',
  tpe: 'TPE physique (Stripe Terminal)',
  cgu: 'Conditions générales',
  confidentialite: 'Politique de confidentialité',
  nf525: 'Attestation Fiscale NF525',
};

export default function Parametres({
  configSalon: rawConfigSalon, setConfigSalon: rawSetConfigSalon, onSave, onBack, onLogout,
  salonId, isDarkMode, onToggleTheme, onEnablePush, role, photoUrl, onUploadPhoto, employesListe
}) {
  const configSalon = rawConfigSalon || {};
  const setConfigSalon = typeof rawSetConfigSalon === 'function' ? rawSetConfigSalon : () => {};
  const [section, setSection] = useState(null);   // null = liste principale

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
  }, [section]);

  const retour = () => (section ? setSection(null) : onBack());
  const statut = (ok, oui = 'Configuré', non = 'À configurer') => (ok ? oui : non);

  const fideliteLabel = { NONE: 'Désactivé', POINTS: 'Points', TAMPONS: 'Tampons' }[(configSalon && configSalon.fidelite_type) || 'NONE'];

  // Rôle "gerant" : accès complet. Rôle "salon" : uniquement les horaires. Rôle "employe" : rien de spécifique (affichage + légal + déconnexion seulement).
  const groupesHaut = role === 'gerant' ? [
    { titre: null, lignes: [
      { id: 'fidelite', icone: ICONS.gift, label: 'Programme de fidélité', valeur: fideliteLabel },
      { id: 'sms', icone: ICONS.sms, label: 'Fidélisation SMS', valeur: statut(configSalon.brevo_api_key) },
    ] },
    { titre: 'Salon', lignes: [
      { id: 'identite', icone: ICONS.shield, label: 'Identité & Légal', valeur: statut(configSalon.siret) },
      { id: 'galerie', icone: ICONS.camera, label: 'Vitrine & Galerie Photos', valeur: `${(Array.isArray(configSalon.photos_salon) ? configSalon.photos_salon : []).length} / 5 photos` },
      { id: 'abonnement', icone: ICONS.card, label: 'Mon Abonnement & Forfait', valeur: configSalon.plan_actuel === 'PREMIUM_TRIAL' ? 'Essai 30j' : (configSalon.plan_actuel || 'PREMIUM') },
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
      { id: 'portabilite', icone: ICONS.file, label: 'Export & Portabilité des données', valeur: 'CSV / JSON' },
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
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [galerieNotice, setGalerieNotice] = useState(null);

  const handleUploadVisuel = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      setGalerieNotice({ type: 'error', message: "L'image ne doit pas dépasser 5 Mo." });
      return;
    }

    if (type === 'logo') setIsUploadingLogo(true);
    else setIsUploadingPhoto(true);
    setGalerieNotice(null);

    try {
      const tokenLocal = localStorage.getItem('token_api') || localStorage.getItem('token') || localStorage.getItem('ui_token');
      const formData = new FormData();
      formData.append('type', type);
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/parametres/galerie`, {
        method: 'PUT',
        credentials: 'include',
        headers: tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {},
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Erreur lors du téléversement.");

      setConfigSalon(prev => ({
        ...prev,
        logo_url: data.logo_url !== undefined ? data.logo_url : prev.logo_url,
        photos_salon: Array.isArray(data.photos_salon) ? data.photos_salon : prev.photos_salon
      }));
      setGalerieNotice({ type: 'success', message: data.message || "Visuel enregistré avec succès !" });
      setTimeout(() => setGalerieNotice(null), 4000);
    } catch (err) {
      setGalerieNotice({ type: 'error', message: err.message || "Erreur réseau lors de l'envoi." });
    } finally {
      setIsUploadingLogo(false);
      setIsUploadingPhoto(false);
    }
  };

  const handleSupprimerVisuel = async (type, index = null) => {
    const confirmation = window.confirm(
      type === 'logo'
        ? "Confirmez-vous la suppression du logo du salon ?"
        : "Confirmez-vous la suppression de cette photo de la galerie ?"
    );
    if (!confirmation) return;

    setGalerieNotice(null);
    try {
      const tokenLocal = localStorage.getItem('token_api') || localStorage.getItem('token') || localStorage.getItem('ui_token');
      const res = await fetch(`${API_URL}/api/parametres/galerie`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {})
        },
        body: JSON.stringify({ type, index })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de la suppression.");

      setConfigSalon(prev => ({
        ...prev,
        logo_url: data.logo_url !== undefined ? data.logo_url : (type === 'logo' ? null : prev.logo_url),
        photos_salon: Array.isArray(data.photos_salon) ? data.photos_salon : prev.photos_salon
      }));
      setGalerieNotice({ type: 'success', message: data.message || "Élément supprimé avec succès." });
      setTimeout(() => setGalerieNotice(null), 4000);
    } catch (err) {
      setGalerieNotice({ type: 'error', message: err.message || "Erreur lors de la suppression." });
    }
  };

  const handleEnregistrerDescription = async () => {
    setIsSavingDescription(true);
    setGalerieNotice(null);
    try {
      const tokenLocal = localStorage.getItem('token_api') || localStorage.getItem('token') || localStorage.getItem('ui_token');
      const res = await fetch(`${API_URL}/api/parametres/description`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {})
        },
        body: JSON.stringify({ description_salon: configSalon.description_salon ?? '' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de l'enregistrement de la description.");

      setConfigSalon(prev => ({
        ...prev,
        description_salon: data.description_salon !== undefined ? data.description_salon : prev.description_salon
      }));
      setGalerieNotice({ type: 'success', message: data.message || "Description enregistrée avec succès !" });
      setTimeout(() => setGalerieNotice(null), 4000);
    } catch (err) {
      setGalerieNotice({ type: 'error', message: err.message || "Erreur lors de l'enregistrement de la description." });
    } finally {
      setIsSavingDescription(false);
    }
  };

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
        const apiBase = API_URL;
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

  const [exportingFormat, setExportingFormat] = useState(null);

  const telechargerExportPortabilite = async (format, nomFichierDefaut) => {
    setExportingFormat(format);
    try {
      const apiBase = API_URL;
      const tokenLocal = localStorage.getItem('api_token') || localStorage.getItem('token_api') || localStorage.getItem('ui_token');

      const response = await fetch(`${apiBase}/api/export-portabilite?format=${encodeURIComponent(format)}`, {
        method: 'GET',
        credentials: 'include',
        headers: tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {}
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.erreur || "Erreur lors de l'export des données.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomFichierDefaut;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExportingFormat(null);
    }
  };
 // --- ÉTATS : CHANGEMENT DE FORFAIT (DOWNGRADE / UPGRADE) & RÉSILIATION GUIDÉE ---
  const [planCibleSelectionne, setPlanCibleSelectionne] = useState(null);
  const [showTunnelResiliation, setShowTunnelResiliation] = useState(false);
  const [etapeResiliation, setEtapeResiliation] = useState(1);
  const [motifResiliation, setMotifResiliation] = useState('');
  const [commentaireResiliation, setCommentaireResiliation] = useState('');
  const [isUpdatingSub, setIsUpdatingSub] = useState(false);
  const [statutAboLocal, setStatutAboLocal] = useState('actif');
  const [etatQuotaSms, setEtatQuotaSms] = useState({ sms_utilises: 0, sms_quota: 100, empreinte_cb_validee: false });

  useEffect(() => {
    const apiBase = API_URL;
    const tokenLocal = localStorage.getItem('api_token') || localStorage.getItem('token_api') || localStorage.getItem('ui_token');
    fetch(`${apiBase}/api/abonnement/etat`, {
      credentials: 'include',
      headers: tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {}
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setEtatQuotaSms({
            sms_utilises: d.sms_utilises || 0,
            sms_quota: d.sms_quota || 100,
            empreinte_cb_validee: !!d.empreinte_cb_validee
          });
          if (d.statut_abonnement) setStatutAboLocal(d.statut_abonnement);
        }
      })
      .catch(() => {});
  }, [configSalon?.plan_actuel]);

  const FORFAITS_STACK = [
    {
      code: 'ESSENTIAL',
      nom: 'Essential',
      prix: '39 €',
      cible: 'Caisse NF525 & Agenda',
      inclus: ['Caisse NF525 & Clôtures Z', 'Agenda & Synchro Planity', 'Fichier clients & Stocks'],
      perduSiChoisi: 'Désactive L’Académie, la Pointeuse RH, la Compta (Liasse/FEC) et le Scan IA.'
    },
    {
      code: 'PRO',
      nom: 'Pro',
      prix: '69 €',
      cible: 'Équipe RH, Académie & Avis',
      inclus: ['Tout Essential inclus', 'Académie & Recettes labo', 'Pointeuse PIN, RH & Avis SMS'],
      perduSiChoisi: 'Désactive la Liasse Comptable signée, l’export FEC et le Scan IA des factures.'
    },
    {
      code: 'PREMIUM',
      nom: 'Premium',
      prix: '99 €',
      cible: 'IA Complète & Comptabilité',
      inclus: ['Tout Pro inclus', 'Scan IA Factures, RDV & Absences', 'Liasse Compta, FEC & Multi-salons'],
      perduSiChoisi: null
    }
  ];

  const confirmerChangementForfait = async (nouveauPlan) => {
    setIsUpdatingSub(true);
    try {
      const apiBase = API_URL;
      const tokenLocal = localStorage.getItem('api_token') || localStorage.getItem('token_api') || localStorage.getItem('ui_token');

      const res = await fetch(`${apiBase}/api/abonnement/changer-forfait`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {})
        },
        body: JSON.stringify({ nouveau_plan: nouveauPlan })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Impossible de modifier le forfait.");

      setConfigSalon(prev => ({ ...prev, plan_actuel: nouveauPlan }));
      setPlanCibleSelectionne(null);
      setShowTunnelResiliation(false);
      alert(data.message || `Votre abonnement est désormais passé sur la formule ${nouveauPlan}.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdatingSub(false);
    }
  };

  const confirmerResiliationAbonnement = async () => {
    if (!motifResiliation) {
      return alert("Veuillez sélectionner la raison principale de votre résiliation.");
    }
    setIsUpdatingSub(true);
    try {
      const apiBase = API_URL;
      const tokenLocal = localStorage.getItem('api_token') || localStorage.getItem('token_api') || localStorage.getItem('ui_token');

      const res = await fetch(`${apiBase}/api/abonnement/resilier`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {})
        },
        body: JSON.stringify({
          motif_resiliation: motifResiliation,
          commentaire: commentaireResiliation
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de la résiliation.");

      setStatutAboLocal('resilie_fin_periode');
      setShowTunnelResiliation(false);
      setEtapeResiliation(1);
      alert(data.message);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdatingSub(false);
    }
  };

  const reactiverMonAbonnement = async () => {
    setIsUpdatingSub(true);
    try {
      const apiBase = API_URL;
      const tokenLocal = localStorage.getItem('api_token') || localStorage.getItem('token_api') || localStorage.getItem('ui_token');

      const res = await fetch(`${apiBase}/api/abonnement/reactiver`, {
        method: 'POST',
        credentials: 'include',
        headers: tokenLocal ? { 'Authorization': `Bearer ${tokenLocal}` } : {}
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || "Erreur lors de la réactivation.");

      setStatutAboLocal('actif');
      alert(data.message);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdatingSub(false);
    }
  };

  const renderGalerie = () => {
    const photos = Array.isArray(configSalon.photos_salon) ? configSalon.photos_salon : [];
    const logoUrl = configSalon.logo_url;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {galerieNotice && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '13.5px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: galerieNotice.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: galerieNotice.type === 'error' ? '#dc2626' : '#15803d',
            border: `1px solid ${galerieNotice.type === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {galerieNotice.type === 'error' ? (
                <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
              ) : (
                <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
              )}
            </svg>
            <span>{galerieNotice.message}</span>
          </div>
        )}

        {/* SECTION 1 : LOGO DU SALON */}
        <div className="carte scan-carte" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', backgroundColor: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '800', color: '#111827', letterSpacing: '-0.01em' }}>
              Logo de l'établissement
            </h3>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              Ce visuel apparaîtra en haut de votre page de réservation en ligne et sur vos factures.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
            <div style={{
              width: '92px',
              height: '92px',
              borderRadius: '16px',
              backgroundColor: '#f9fafb',
              border: '1.5px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo salon"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div style={{ display: logoUrl ? 'none' : 'flex', color: '#9ca3af', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '28px', height: '28px', display: 'flex' }}>{ICONS.camera}</span>
                <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aucun</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isUploadingLogo ? 'wait' : 'pointer',
                  opacity: isUploadingLogo ? 0.7 : 1,
                  boxShadow: '0 2px 8px rgba(17, 24, 39, 0.15)',
                  transition: 'background-color 0.15s ease',
                  userSelect: 'none'
                }}>
                  <span style={{ width: '15px', height: '15px', display: 'flex' }}>{ICONS.upload}</span>
                  <span>{isUploadingLogo ? "Téléversement en cours..." : (logoUrl ? "Remplacer le logo" : "Importer un logo")}</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={(e) => handleUploadVisuel(e, 'logo')}
                    disabled={isUploadingLogo}
                    style={{ display: 'none' }}
                  />
                </label>

                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => handleSupprimerVisuel('logo')}
                    disabled={isUploadingLogo}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #fee2e2',
                      fontSize: '12.5px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <span style={{ width: '13px', height: '13px', display: 'flex' }}>{ICONS.trash}</span>
                    <span>Supprimer</span>
                  </button>
                )}
              </div>
              <span style={{ fontSize: '11.5px', color: '#6b7280' }}>Formats recommandés : PNG ou JPG (carré 500x500 max 5 Mo)</span>
            </div>
          </div>
        </div>

        {/* SECTION 2 : GALERIE PHOTOS (MAX 5) */}
        <div className="carte scan-carte" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', backgroundColor: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#111827', letterSpacing: '-0.01em' }}>
                  Galerie de l'établissement
                </h3>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '999px',
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                  fontSize: '11px',
                  fontWeight: '700'
                }}>
                  {photos.length} / 5
                </span>
              </div>
              <span style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                Alimente la vitrine et la galerie photo façon Planity sur votre page publique client.
              </span>
            </div>

            {photos.length < 5 && (
              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                borderRadius: '10px',
                backgroundColor: '#111827',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isUploadingPhoto ? 'wait' : 'pointer',
                opacity: isUploadingPhoto ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(17, 24, 39, 0.15)',
                userSelect: 'none'
              }}>
                <span style={{ width: '15px', height: '15px', display: 'flex' }}>{ICONS.plus}</span>
                <span>{isUploadingPhoto ? "Envoi..." : "Ajouter une photo"}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  onChange={(e) => handleUploadVisuel(e, 'photo')}
                  disabled={isUploadingPhoto}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>

          {photos.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              border: '2px dashed #e5e7eb',
              borderRadius: '14px',
              backgroundColor: '#f9fafb',
              marginTop: '10px'
            }}>
              <div style={{ width: '42px', height: '42px', margin: '0 auto 12px', color: '#9ca3af' }}>
                {ICONS.camera}
              </div>
              <div style={{ fontSize: '14.5px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                Aucune photo dans votre vitrine
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', maxWidth: '400px', margin: '0 auto 18px', lineHeight: 1.5 }}>
                Ajoutez jusqu'à 5 photos de votre salon (intérieur, bacs, devanture) pour donner envie à vos clients de réserver.
              </div>
              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '10px',
                backgroundColor: '#111827',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isUploadingPhoto ? 'wait' : 'pointer',
                boxShadow: '0 2px 8px rgba(17, 24, 39, 0.15)',
                userSelect: 'none'
              }}>
                <span style={{ width: '15px', height: '15px', display: 'flex' }}>{ICONS.plus}</span>
                <span>{isUploadingPhoto ? "Envoi en cours..." : "Ajouter la 1ère photo"}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  onChange={(e) => handleUploadVisuel(e, 'photo')}
                  disabled={isUploadingPhoto}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '14px',
              marginTop: '14px'
            }}>
              {photos.map((url, idx) => (
                <div key={idx} style={{
                  position: 'relative',
                  height: '145px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1.5px solid #e5e7eb',
                  backgroundColor: '#f3f4f6'
                }}>
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', backgroundColor: '#f3f4f6' }}>
                    <span style={{ width: '28px', height: '28px', display: 'flex' }}>{ICONS.camera}</span>
                  </div>

                  {idx === 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      backgroundColor: 'rgba(17, 24, 39, 0.88)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: '800',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backdropFilter: 'blur(4px)'
                    }}>
                      Couverture
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSupprimerVisuel('photo', idx)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(17, 24, 39, 0.82)',
                      color: '#ef4444',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backdropFilter: 'blur(4px)',
                      transition: 'transform 0.15s ease'
                    }}
                    title="Supprimer cette photo"
                  >
                    <span style={{ width: '14px', height: '14px', display: 'flex' }}>{ICONS.trash}</span>
                  </button>
                </div>
              ))}

              {photos.length < 5 && (
                <label style={{
                  height: '145px',
                  borderRadius: '12px',
                  border: '2px dashed #d1d5db',
                  backgroundColor: '#f9fafb',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isUploadingPhoto ? 'wait' : 'pointer',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  padding: '12px',
                  textAlign: 'center',
                  userSelect: 'none'
                }}>
                  <div style={{ width: '26px', height: '26px', color: '#6b7280' }}>
                    {isUploadingPhoto ? ICONS.upload : ICONS.plus}
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#111827' }}>
                    {isUploadingPhoto ? "Envoi en cours..." : "Ajouter une photo"}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>
                    {5 - photos.length} restante{5 - photos.length > 1 ? 's' : ''}
                  </span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={(e) => handleUploadVisuel(e, 'photo')}
                    disabled={isUploadingPhoto}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* SECTION 3 : DESCRIPTION DE L'ÉTABLISSEMENT */}
        <div className="carte scan-carte" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', backgroundColor: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '800', color: '#111827', letterSpacing: '-0.01em' }}>
              Description de l'établissement
            </h3>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              Présentez votre univers, vos spécialités et l'ambiance du salon. Ce texte apparaîtra directement sur votre vitrine de réservation publique.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <textarea
              value={configSalon.description_salon ?? ''}
              onChange={(e) => setConfigSalon(prev => ({ ...prev, description_salon: e.target.value }))}
              placeholder="Ex : Bienvenue dans notre salon ! Spécialistes des coiffures tendances, soins sur-mesure et balayages personnalisés, nous vous accueillons dans une ambiance chaleureuse et moderne pour sublimer votre style..."
              rows={5}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1.5px solid #e5e7eb',
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#111827',
                backgroundColor: '#f9fafb',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease, background-color 0.15s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#111827';
                e.target.style.backgroundColor = '#ffffff';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.backgroundColor = '#f9fafb';
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {(configSalon.description_salon || '').length} caractère{(configSalon.description_salon || '').length > 1 ? 's' : ''}
              </span>

              <button
                type="button"
                onClick={handleEnregistrerDescription}
                disabled={isSavingDescription}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: isSavingDescription ? 'wait' : 'pointer',
                  opacity: isSavingDescription ? 0.7 : 1,
                  boxShadow: '0 2px 8px rgba(17, 24, 39, 0.15)',
                  transition: 'background-color 0.15s ease'
                }}
              >
                <span>{isSavingDescription ? "Enregistrement..." : "Enregistrer la description"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (id) => {
    switch (id) {
      case 'galerie': return renderGalerie();
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
                            const res = await fetch(`${API_URL}/api/employes/mon-pin`, {
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
case 'portabilite': {
          const slug = (configSalon.nom_salon || 'MonSalon').replace(/[^a-zA-Z0-9_-]/g, '_');
          const dJour = new Date().toISOString().slice(0, 10);
          const exportsDispo = [
              {
                  id: 'csv_clients',
                  titre: 'Fichier Clients CRM & Fidélité (.CSV)',
                  desc: 'Prénom, nom, téléphone, e-mail, date de naissance, solde points/tampons, offres Winback et notes techniques. Compatible Excel et autres logiciels.',
                  ext: 'CSV Excel',
                  filename: `Clients_${slug}_${dJour}.csv`
              },
              {
                  id: 'csv_catalogue',
                  titre: 'Catalogue Prestations & État des Stocks (.CSV)',
                  desc: 'Toutes vos prestations (tarifs TTC, durées) et votre inventaire produits (références, quantités en stock, délais fournisseurs).',
                  ext: 'CSV Excel',
                  filename: `Catalogue_Stocks_${slug}_${dJour}.csv`
              },
              {
                  id: 'csv_rdv',
                  titre: 'Historique & Futurs Rendez-vous Agenda (.CSV)',
                  desc: 'Intégralité des rendez-vous passés et à venir avec dates, heures, durées, clients, prestations et collaborateurs.',
                  ext: 'CSV Excel',
                  filename: `Agenda_RDV_${slug}_${dJour}.csv`
              },
              {
                  id: 'csv_caisse_z',
                  titre: 'Journal Fiscal des Tickets de Caisse (.CSV — NF525)',
                  desc: 'Registre chronologique inaltérable des tickets encaissés, modes de règlement, pourboires et empreintes SHA-256.',
                  ext: 'CSV Fiscal',
                  filename: `Archive_Tickets_NF525_${slug}_${dJour}.csv`
              }
          ];

          return (
              <>
                  <div className="carte scan-carte">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <div style={{ width: '42px', height: '42px', minWidth: '42px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
                              <span style={{ width: '20px', height: '20px', display: 'flex' }}>{ICONS.shield}</span>
                          </div>
                          <div>
                              <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', color: 'var(--text-main)', fontWeight: '700' }}>Portabilité & Propriété de vos Données</h3>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Conformité RGPD (Art. 20), CGU STACK (Art. 7) & Conservation NF525</span>
                          </div>
                      </div>

                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 18px 0' }}>
                          Vous êtes propriétaire à 100 % des données de votre établissement. Téléchargez à tout moment vos fichiers en format <strong>.CSV (compatible Excel et logiciels tiers)</strong> ou récupérez l'archive intégrale scellée de votre salon.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                          {exportsDispo.map(item => (
                              <div key={item.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 240px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                          <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>{item.titre}</strong>
                                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{item.ext}</span>
                                      </div>
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', display: 'block' }}>{item.desc}</span>
                                  </div>
                                  <button
                                      type="button"
                                      disabled={exportingFormat !== null}
                                      onClick={() => telechargerExportPortabilite(item.id, item.filename)}
                                      style={{
                                          background: 'var(--bg-card)',
                                          color: 'var(--text-main)',
                                          border: '1px solid var(--border-color)',
                                          padding: '9px 14px',
                                          borderRadius: '10px',
                                          fontSize: '12.5px',
                                          fontWeight: '700',
                                          cursor: exportingFormat ? 'wait' : 'pointer',
                                          flexShrink: 0
                                      }}
                                  >
                                      {exportingFormat === item.id ? 'Export...' : 'Télécharger .CSV'}
                                  </button>
                              </div>
                          ))}
                      </div>

                      {/* Archive Intégrale JSON Scellée SHA-256 */}
                      <div style={{ background: 'var(--bg-app)', border: '1.5px solid var(--text-main)', borderRadius: '14px', padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>Archive Intégrale de Portabilité & Départ (.JSON Scellé SHA-256)</strong>
                              <span style={{ fontSize: '10.5px', fontWeight: '800', padding: '3px 8px', borderRadius: '999px', background: 'var(--text-main)', color: 'var(--bg-card)' }}>ARCHIVE COMPLÈTE</span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45', margin: '0 0 14px 0' }}>
                              Réunit en un seul fichier structuré : identité légale, fichier clients, équipe RH, catalogue, recettes Académie, agenda, factures fournisseurs, tickets, clôtures Z et liasses mensuelles, avec empreinte cryptographique SHA-256 inscrite au Journal des Événements Techniques (JET).
                          </p>
                          <button
                              type="button"
                              disabled={exportingFormat !== null}
                              onClick={() => telechargerExportPortabilite('json_complet', `Archive_Portabilite_STACK_${slug}_${dJour}.json`)}
                              className="btn-action"
                              style={{ width: '100%', padding: '12px' }}
                          >
                              {exportingFormat === 'json_complet' ? 'Génération de l’archive scellée...' : 'Télécharger l’Archive Intégrale (.JSON)'}
                          </button>
                      </div>
                  </div>
              </>
          );
      }
      case 'abonnement': {
          const planBrut = configSalon.plan_actuel || 'PREMIUM_TRIAL';
          const estEnEssai = planBrut === 'PREMIUM_TRIAL';
          const codePlanActuel = estEnEssai ? 'PREMIUM' : planBrut;
          const ordrePlans = { ESSENTIAL: 1, PRO: 2, PREMIUM: 3 };
          const rangActuel = ordrePlans[codePlanActuel] || 3;
          const slug = (configSalon.nom_salon || 'MonSalon').replace(/[^a-zA-Z0-9_-]/g, '_');
          const dJour = new Date().toISOString().slice(0, 10);

          return (
              <>
                  {/* EN-TÊTE COMPACT DU FORFAIT ACTUEL */}
                  <div className="carte scan-carte" style={{ marginBottom: '14px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Forfait actif</span>
                              <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '700', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                  SMS ce mois : {etatQuotaSms.sms_utilises} / {etatQuotaSms.sms_quota}
                              </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '17px', color: 'var(--text-main)' }}>
                                  {estEnEssai ? 'STACK Premium (Essai 30j)' : `STACK ${codePlanActuel}`}
                              </strong>
                              <span style={{
                                  padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '800',
                                  background: statutAboLocal === 'resilie_fin_periode' ? 'var(--bg-danger)' : 'var(--bg-success)',
                                  color: statutAboLocal === 'resilie_fin_periode' ? 'var(--color-danger)' : 'var(--color-success)'
                              }}>
                                  {statutAboLocal === 'resilie_fin_periode' ? 'Fin programmée' : 'Sans engagement'}
                              </span>
                          </div>
                      </div>
                      {statutAboLocal === 'resilie_fin_periode' && (
                          <button type="button" disabled={isUpdatingSub} onClick={reactiverMonAbonnement} className="btn-action" style={{ padding: '8px 14px', fontSize: '12px' }}>
                              Réactiver
                          </button>
                      )}
                  </div>

                  {/* GRILLE COMPACTE DES 3 FORFAITS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      {FORFAITS_STACK.map(f => {
                          const estActuel = f.code === codePlanActuel && !estEnEssai;
                          const estSelectionne = planCibleSelectionne === f.code;
                          const estDowngrade = ordrePlans[f.code] < rangActuel;

                          return (
                              <div
                                  key={f.code}
                                  onClick={() => !estActuel && setPlanCibleSelectionne(estSelectionne ? null : f.code)}
                                  className="carte"
                                  style={{
                                      marginBottom: 0,
                                      padding: '16px',
                                      borderRadius: '14px',
                                      border: estSelectionne ? '2px solid var(--text-main)' : estActuel ? '1.5px solid var(--color-success)' : '1px solid var(--border-color)',
                                      cursor: estActuel ? 'default' : 'pointer',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'space-between',
                                      gap: '12px'
                                  }}
                              >
                                  <div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                                          <strong style={{ fontSize: '16px', color: 'var(--text-main)' }}>{f.nom}</strong>
                                          <span style={{ fontSize: '16px', fontWeight: '900', color: 'var(--text-main)' }}>
                                              {f.prix} <small style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>HT/m</small>
                                          </span>
                                      </div>
                                      <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>{f.cible}</span>

                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', color: 'var(--text-main)' }}>
                                          {f.inclus.map((inc, i) => (
                                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                  <span style={{ color: 'var(--color-success)', fontWeight: '800' }}>✓</span>
                                                  <span>{inc}</span>
                                              </div>
                                          ))}
                                      </div>

                                      {estSelectionne && estDowngrade && f.perduSiChoisi && (
                                          <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: '11px', lineHeight: 1.4, fontWeight: '600' }}>
                                              ⚠️ {f.perduSiChoisi}
                                          </div>
                                      )}
                                  </div>

                                  {estActuel ? (
                                      <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'var(--bg-app)', color: 'var(--color-success)', fontSize: '12px', fontWeight: '800' }}>
                                          Formule actuelle
                                      </div>
                                  ) : (
                                      <button
                                          type="button"
                                          disabled={isUpdatingSub}
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              if (estSelectionne) confirmerChangementForfait(f.code);
                                              else setPlanCibleSelectionne(f.code);
                                          }}
                                          className={estSelectionne ? "btn-action" : ""}
                                          style={estSelectionne ? { width: '100%', padding: '9px', fontSize: '12px' } : {
                                              width: '100%', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)',
                                              padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                                          }}
                                      >
                                          {isUpdatingSub && estSelectionne ? 'Validation...' : estSelectionne ? `Confirmer ${f.nom}` : `Choisir ${f.nom}`}
                                      </button>
                                  )}
                              </div>
                          );
                      })}
                  </div>

                  {/* ENCART RÉSILIATION ULTRA-COMPACT */}
                  <div className="carte scan-carte" style={{ padding: '14px 18px' }}>
                      {!showTunnelResiliation ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                  Besoin de suspendre votre abonnement ou de récupérer vos archives ?
                              </span>
                              <button
                                  type="button"
                                  onClick={() => setShowTunnelResiliation(true)}
                                  style={{ background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                              >
                                  Résilier mon abonnement
                              </button>
                          </div>
                      ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>Résiliation sans frais (fin de mois)</strong>
                                  <button type="button" onClick={() => setShowTunnelResiliation(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Fermer ✕</button>
                              </div>

                              <select
                                  className="input-fournisseur"
                                  value={motifResiliation}
                                  onChange={e => setMotifResiliation(e.target.value)}
                                  style={{ marginBottom: 0, background: 'var(--bg-app)' }}
                              >
                                  <option value="">-- Motif principal de résiliation --</option>
                                  <option value="PRIX">Tarif trop élevé (Préférez le forfait Essential à 39 €)</option>
                                  <option value="FONCTIONNALITES_TROP_COMPLEXES">Je n’utilise pas tous les outils</option>
                                  <option value="FERMETURE_SALON">Fermeture ou cession du salon</option>
                                  <option value="AUTRE_LOGICIEL">Changement de logiciel</option>
                              </select>

                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button
                                      type="button"
                                      onClick={() => telechargerExportPortabilite('json_complet', `Archive_STACK_${slug}_${dJour}.json`)}
                                      style={{ flex: 1, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                      1. Exporter mes archives NF525 (.JSON)
                                  </button>
                                  <button
                                      type="button"
                                      disabled={!motifResiliation || isUpdatingSub}
                                      onClick={confirmerResiliationAbonnement}
                                      style={{ flex: 1, background: 'var(--color-danger)', color: '#fff', border: 'none', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: motifResiliation ? 'pointer' : 'not-allowed', opacity: motifResiliation ? 1 : 0.5 }}
                                  >
                                      {isUpdatingSub ? 'En cours...' : '2. Confirmer la résiliation'}
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              </>
          );
      }
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
                          const icalUrl = `${API_URL}/api/ical/${salonId}/${emp.id_employe}.ics`;
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
