import { useState, useEffect } from 'react';
import './PopupLegal.css';

/* Pop-up bloquant d'acceptation des documents contractuels (première connexion du gérant).
   Étape 1 : identité (pré-remplie)  ->  Étape 2 : lecture + cases + signature  ->  Étape 3 : confirmation.
   Toute la preuve (textes, SHA-256, IP, date, identité) est écrite côté serveur. */
const MENTION = 'Lu et approuvé, bon pour réception';

export default function PopupLegal({ apiBase, token, onAccepted, onRefuse }) {
  const [etape, setEtape] = useState('chargement'); // chargement | identite | documents | fait
  const [identite, setIdentite] = useState({ nom_salon: '', gerant_prenom: '', gerant_nom: '', adresse_salon: '', siret_salon: '', email: '' });
  const [docs, setDocs] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [consultes, setConsultes] = useState([]);
  const [cases, setCases] = useState({});
  const [pouvoir, setPouvoir] = useState(false);
  const [mention, setMention] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);

  const headers = (json) => ({ Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });

  useEffect(() => {
    let annule = false;
    fetch(`${apiBase}/api/legal/statut`, { headers: headers(false) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (annule) return;
        if (!ok) { setErreur(d.erreur || 'Erreur de chargement.'); setEtape('identite'); return; }
        if (d.accepte) { onAccepted(); return; }
        setIdentite(d.identite); setEtape('identite');
      })
      .catch(() => { if (!annule) { setErreur('Connexion impossible. Vérifiez votre réseau.'); setEtape('identite'); } });
    return () => { annule = true; };
  }, []);

  const maj = (champ) => (e) => setIdentite(prev => ({ ...prev, [champ]: e.target.value }));
  const identiteOk = identite.nom_salon.trim() && identite.gerant_prenom.trim() && identite.gerant_nom.trim() && identite.adresse_salon.trim() && identite.siret_salon.replace(/\s/g, '').length === 14;

  const validerIdentite = async () => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`${apiBase}/api/legal/identite`, { method: 'POST', headers: headers(true), body: JSON.stringify(identite) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur || 'Erreur.');
      setDocs(d.documents); setEtape('documents');
    } catch (e) { setErreur(e.message); }
    setEnvoi(false);
  };

  const ouvrirDoc = (doc) => { setOuvert(doc); setConsultes(prev => prev.includes(doc.id) ? prev : [...prev, doc.id]); };
  const commodat = docs.find(d => d.mention_requise);
  const normalise = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mentionOk = !commodat || normalise(mention) === normalise(MENTION);
  const toutCoche = docs.length > 0 && docs.every(d => cases[d.id] === true);
  const peutSigner = toutCoche && pouvoir && mentionOk && !envoi;

  const signer = async () => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`${apiBase}/api/legal/accepter`, { method: 'POST', headers: headers(true), body: JSON.stringify({ cases, pouvoir, mention_commodat: commodat ? mention : undefined, consultes }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur || 'Erreur.');
      if (d.deja_accepte) { onAccepted(); return; }
      setResultat(d); setEtape('fait');
    } catch (e) { setErreur(e.message); }
    setEnvoi(false);
  };

  const telechargerCopie = async () => {
    try {
      const r = await fetch(`${apiBase}/api/legal/certificat/${resultat.id_acceptation}`, { headers: headers(false) });
      if (!r.ok) throw new Error();
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `STACK-acceptation-ACC-${resultat.id_acceptation}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setErreur('Téléchargement impossible pour le moment.'); }
  };

  // Fonction de rendu (et non composant imbriqué) : évite de perdre le focus à chaque frappe
  const champ = (label, nom, extra = {}) => (
    <label className="pl-champ" key={nom}><span>{label}</span><input className="pl-input" value={identite[nom]} onChange={maj(nom)} {...extra} /></label>
  );

  return (
    <div className="pl-overlay" role="dialog" aria-modal="true" aria-labelledby="pl-titre">
      <div className="pl-carte">
        {etape === 'chargement' && <p className="pl-muted">Chargement…</p>}

        {etape === 'identite' && (<>
          <h1 id="pl-titre" className="pl-titre">Conditions générales</h1>
          <p className="pl-intro">Avant de commencer, vérifiez les informations qui figureront sur vos documents contractuels. Elles sont pré-remplies quand nous les connaissons.</p>
          <div className="pl-form">
            {champ('Prénom du gérant', 'gerant_prenom', { autoComplete: 'given-name' })}
            {champ('Nom du gérant', 'gerant_nom', { autoComplete: 'family-name' })}
            {champ('Nom du salon (raison sociale)', 'nom_salon')}
            {champ('Adresse du salon', 'adresse_salon', { autoComplete: 'street-address' })}
            {champ('SIRET (14 chiffres)', 'siret_salon', { inputMode: 'numeric' })}
            <label className="pl-champ"><span>Email du compte</span><input className="pl-input" value={identite.email} disabled /></label>
          </div>
          {erreur && <p className="pl-erreur">{erreur}</p>}
          <div className="pl-actions">
            <button className="pl-btn pl-btn-sec" onClick={onRefuse}>Refuser</button>
            <button className="pl-btn pl-btn-pri" disabled={!identiteOk || envoi} onClick={validerIdentite}>{envoi ? '…' : 'Continuer'}</button>
          </div>
        </>)}

        {etape === 'documents' && (<>
          <h1 id="pl-titre" className="pl-titre">Conditions générales</h1>
          <p className="pl-intro">Ouvrez et lisez chaque document, puis cochez les cases correspondantes. Votre acceptation vaut signature électronique.</p>
          <div className="pl-liste">
            {docs.map(d => (
              <button key={d.id} className="pl-ligne" onClick={() => ouvrirDoc(d)}>
                <span className="pl-ligne-titre">{d.titre}</span>
                <span className={`pl-badge ${consultes.includes(d.id) ? 'pl-badge-ok' : ''}`}>{consultes.includes(d.id) ? 'Lu ✓' : 'À lire'}</span>
                <span className="pl-chevron">›</span>
              </button>
            ))}
          </div>
          <div className="pl-cases">
            {docs.map(d => (
              <label key={d.id} className={`pl-case ${consultes.includes(d.id) ? '' : 'pl-case-off'}`}>
                <input type="checkbox" disabled={!consultes.includes(d.id)} checked={!!cases[d.id]} onChange={(e) => setCases(prev => ({ ...prev, [d.id]: e.target.checked }))} />
                <span>{d.id === 'nf525' ? "Je reconnais avoir consulté l'attestation de conformité NF525." : `J'ai lu et j'accepte : ${d.titre}.`}</span>
              </label>
            ))}
            <label className="pl-case"><input type="checkbox" checked={pouvoir} onChange={(e) => setPouvoir(e.target.checked)} /><span>Je déclare avoir le pouvoir d'engager la société {identite.nom_salon}.</span></label>
          </div>
          {commodat && (
            <label className="pl-champ pl-mention"><span>Contrat de prêt du TPE — recopiez la mention : « {MENTION} »</span>
              <input className="pl-input" value={mention} onChange={(e) => setMention(e.target.value)} placeholder={MENTION} autoCapitalize="off" autoCorrect="off" />
            </label>
          )}
          {erreur && <p className="pl-erreur">{erreur}</p>}
          <div className="pl-actions">
            <button className="pl-btn pl-btn-sec" onClick={onRefuse}>Refuser</button>
            <button className="pl-btn pl-btn-pri" disabled={!peutSigner} onClick={signer}>{envoi ? '…' : 'Accepter et signer'}</button>
          </div>
        </>)}

        {etape === 'fait' && (<>
          <h1 id="pl-titre" className="pl-titre">Merci</h1>
          <p className="pl-intro">Votre acceptation a été enregistrée. Une copie PDF de ce que vous avez signé est envoyée à <strong>{resultat?.email}</strong>. Conservez-la.</p>
          {erreur && <p className="pl-erreur">{erreur}</p>}
          <div className="pl-actions">
            <button className="pl-btn pl-btn-sec" onClick={telechargerCopie}>Télécharger ma copie</button>
            <button className="pl-btn pl-btn-pri" onClick={onAccepted}>Continuer</button>
          </div>
        </>)}
      </div>

      {ouvert && (
        <div className="pl-lecteur" role="dialog" aria-modal="true">
          <div className="pl-lecteur-carte">
            <div className="pl-lecteur-tete"><strong>{ouvert.titre}</strong><button className="pl-btn pl-btn-sec pl-petit" onClick={() => setOuvert(null)}>Fermer</button></div>
            <div className="pl-lecteur-texte">{ouvert.texte}</div>
            {ouvert.url && <a className="pl-btn pl-btn-pri pl-lien" href={`${apiBase}${ouvert.url}`} target="_blank" rel="noopener noreferrer">Ouvrir l'attestation (PDF)</a>}
          </div>
        </div>
      )}
    </div>
  );
}
