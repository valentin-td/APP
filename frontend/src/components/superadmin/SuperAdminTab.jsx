import React from 'react';
import ThemeToggle from '../common/ThemeToggle';
import { API_URL } from '../../api/config';

export const SuperAdminTab = ({
  isMobile,
  superAdminData,
  showToast,
  superAdminSalons = [],
  basculerStatutSalon,
  supprimerSalonAdmin,
}) => {
  return (
    <div className={isMobile ? "admin-container mobile-fixed-header" : "admin-container"} style={isMobile ? { zIndex: 10 } : {}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
        <div><h1 style={{margin: 0, color: '#aa3bff'}}>God Mode</h1><span className="date-subtitle" style={{margin: 0}}>Espace Fondateur STACK</span></div>
        <ThemeToggle />
      </div>
      
      {superAdminData ? (
        <>
          <div className="cartes-financieres">
            <div className="carte" style={{border: '1px solid #aa3bff'}}><div className="carte-titre-container"><div className="icon" style={{color: '#aa3bff'}}><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><h3>MRR (Revenu Récurrent)</h3></div><p className="montant" style={{color: '#aa3bff'}}>{superAdminData?.mrr_estime || 0} <span className="devise">€ / mois</span></p></div>
            <div className="carte"><div className="carte-titre-container"><div className="icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><h3>Salons Inscrits</h3></div><p className="montant">{superAdminData?.salons_actifs || 0} <span className="devise" style={{fontSize: '14px'}}>actifs sur {superAdminData?.total_salons || 0} au total</span></p></div>
          </div>
          
          <div className="carte export-carte" style={{borderColor: '#aa3bff', marginTop: '-12px'}}>
            <div><h3 style={{margin: '0 0 4px 0', color: '#aa3bff', fontSize: '15px'}}>Forcer les Robots (CRON)</h3><span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>Déclenche l'envoi du récapitulatif hebdo et autres tâches.</span></div>
            <button className="btn-export" onClick={async () => {
              console.log("🔘 Clic sur le bouton 'Forcer les Robots'");
              try {
                showToast("⏳ Exécution en cours, patientez...", "info");
                
                const res = await fetch(`${API_URL}/api/admin/forcer-robot`);
                const data = await res.json().catch(() => null);
                
                console.log("📡 Statut HTTP :", res.status);
                console.log("📦 Données reçues :", data);
                
                if (!res.ok) {
                  alert(`❌ ERREUR SERVEUR (${res.status})\n\nDétails : ${JSON.stringify(data)}`);
                  showToast("Échec de l'exécution", "error");
                  return;
                }

                alert(`✅ REQUÊTE RÉUSSIE !\n\nRéponse du serveur : ${data?.message || 'OK'}\n\n⚠️ IMPORTANT : Regarde dans ton navigateur (F12 > Console) et surtout dans les "Logs" de Render pour lire ce que le robot a réellement fait !`);
                showToast("Robots terminés", "success");
              } catch (e) { 
                console.error("❌ Crash lors de l'appel :", e);
                alert(`❌ CRASH RESEAU\n\nErreur : ${e.message}`);
                showToast("Erreur de connexion", "error"); 
              }
            }} style={{background: '#aa3bff', color: 'white', border: 'none'}}>Exécuter (Test)</button>
          </div>
        </>
      ) : <div className="skeleton-loading" style={{height: '120px', marginBottom: '32px'}}></div>}

      <div className="section-titre" style={{marginTop: '32px', color: '#aa3bff', borderColor: '#aa3bff'}}>Gestion des Salons (Clients)</div>
      <div className="carte scan-carte">
        {(superAdminSalons || []).map(salon => (
          <div key={salon.id_salon} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)'}}>
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                <strong style={{color: 'var(--text-main)', fontSize: '15px'}}>{salon.nom_salon}</strong><span style={{fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-secondary)'}}>ID: {salon.id_salon}</span>{salon.email === '2@gmail.com' && <span style={{fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#aa3bff', color: 'white'}}>Fondateur</span>}
              </div>
              <span style={{color: 'var(--text-secondary)', fontSize: '13px'}}>{salon.email}</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
              <span className="badge-discret" style={{ background: salon.statut_abonnement === 'actif' ? 'var(--bg-success)' : 'var(--bg-danger)', color: salon.statut_abonnement === 'actif' ? 'var(--color-success)' : 'var(--color-danger)' }}>{salon.statut_abonnement === 'actif' ? 'Abonné (Actif)' : 'Inactif / Impayé'}</span>
              {salon.email !== '2@gmail.com' && ( 
                <div style={{display: 'flex', gap: '8px'}}>
                  <button onClick={() => basculerStatutSalon(salon.id_salon, salon.statut_abonnement)} style={{background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>{salon.statut_abonnement === 'actif' ? 'Couper l\'accès' : 'Activer de force'}</button>
                  <button onClick={() => supprimerSalonAdmin(salon.id_salon, salon.nom_salon)} style={{background: 'var(--bg-danger)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}} title="Détruire ce salon">Supprimer</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {(superAdminSalons || []).length === 0 && <div className="empty-state"><p>Aucun salon chargé.</p></div>}
      </div>
    </div>
  );
};

export default SuperAdminTab;
