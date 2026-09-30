import { useState, useEffect } from 'react';

export default function AvisPublic({ token }) {
    const [etat, setEtat] = useState('chargement'); // chargement | notation | commentaire | redirection | termine | erreur
    const [infos, setInfos] = useState(null);
    const [lienGoogle, setLienGoogle] = useState(null);
    const [commentaire, setCommentaire] = useState('');

    useEffect(() => {
        fetch(`https://api-salon-backend.onrender.com/api/avis/info/${token}`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => { setInfos(data); setEtat(data.etape); })
            .catch(() => setEtat('erreur'));
    }, [token]);

    const envoyerNote = async (note) => {
        try {
            const res = await fetch(`https://api-salon-backend.onrender.com/api/avis/${token}/note`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
            const data = await res.json();
            if (!res.ok) return setEtat('erreur');
            if (data.besoin_commentaire) { setEtat('commentaire'); }
            else { setLienGoogle(data.lien_google_maps); setEtat('redirection'); }
        } catch (e) { setEtat('erreur'); }
    };

    const envoyerCommentaire = async () => {
        try {
            const res = await fetch(`https://api-salon-backend.onrender.com/api/avis/${token}/commentaire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentaire }) });
            if (!res.ok) return setEtat('erreur');
            setEtat('termine');
        } catch (e) { setEtat('erreur'); }
    };

    const conteneur = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', padding: '24px', boxSizing: 'border-box' };
    const carte = { background: 'var(--bg-card)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', padding: '32px 28px', maxWidth: '380px', width: '100%', textAlign: 'center' };

    if (etat === 'chargement') return <div style={conteneur}><div style={carte}><p style={{color: 'var(--text-secondary)'}}>Chargement...</p></div></div>;
    if (etat === 'erreur') return <div style={conteneur}><div style={carte}><p style={{color: 'var(--text-secondary)'}}>Ce lien n'est plus valide.</p></div></div>;
    if (etat === 'termine') return <div style={conteneur}><div style={carte}><h2 style={{color: 'var(--text-main)'}}>Merci !</h2><p style={{color: 'var(--text-secondary)'}}>Votre retour a bien été transmis au salon.</p></div></div>;

    if (etat === 'redirection') {
        return (
            <div style={conteneur}>
                <div style={carte}>
                    <h2 style={{color: 'var(--text-main)', marginBottom: '12px'}}>Merci {infos?.prenom || ''} !</h2>
                    <p style={{color: 'var(--text-secondary)', marginBottom: '20px'}}>Votre avis compte énormément pour {infos?.nom_salon || 'le salon'}. Pourriez-vous le partager sur Google ?</p>
                    {lienGoogle ? (
                        <a href={lienGoogle} target="_blank" rel="noopener noreferrer" className="btn-action" style={{display: 'block', textDecoration: 'none'}}>Laisser un avis Google</a>
                    ) : (
                        <p style={{color: 'var(--text-muted)', fontSize: '13px'}}>Le salon n'a pas encore configuré son lien Google.</p>
                    )}
                </div>
            </div>
        );
    }

    if (etat === 'commentaire') {
        return (
            <div style={conteneur}>
                <div style={carte}>
                    <h2 style={{color: 'var(--text-main)', marginBottom: '8px'}}>Nous sommes désolés</h2>
                    <p style={{color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px'}}>Que votre expérience chez {infos?.nom_salon || 'le salon'} n'ait pas été à la hauteur. Dites-nous ce qui n'allait pas afin que le gérant puisse vous recontacter.</p>
                    <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={4} placeholder="Votre message..." style={{width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-color)', marginBottom: '16px', fontFamily: 'inherit', fontSize: '14px'}} />
                    <button className="btn-action" onClick={envoyerCommentaire} style={{width: '100%'}}>Envoyer</button>
                </div>
            </div>
        );
    }

    return (
        <div style={conteneur}>
            <div style={carte}>
                <h2 style={{color: 'var(--text-main)', marginBottom: '8px'}}>Bonjour {infos?.prenom || ''} !</h2>
                <p style={{color: 'var(--text-secondary)', marginBottom: '24px'}}>Comment s'est passée votre visite chez {infos?.nom_salon || 'nous'} ?</p>
                <div style={{display: 'flex', justifyContent: 'center', gap: '6px', fontSize: '38px'}}>
                    {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} onClick={() => envoyerNote(n)} style={{cursor: 'pointer', color: 'var(--btn-primary)'}}>★</span>
                    ))}
                </div>
            </div>
        </div>
    );
}
