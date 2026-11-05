import React from 'react';
import LiquidTabBar from '../../LiquidTabBar.jsx';

const iconBord = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const iconCaisse = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const iconAgenda = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const iconActions = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const iconCompta = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const iconOutils = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;

export default function NavbarSidebar({
  isMobile,
  role,
  activeTab,
  setActiveTab,
  nbTachesUrgentes,
  tachesIA,
  aLeNiveau,
  handleTabClick,
  decodeToken,
  token,
  aDesMessagesNonLus,
  seDeconnecter,
  isOutilsMenuOpen,
  setIsOutilsMenuOpen,
  onglMobilesParRole
}) {
  const defaultOnglMobilesParRole = (r) => {
    const iconComptaLock = !aLeNiveau('PREMIUM') ? (
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', top: '-4px', right: '-4px', color: 'var(--text-muted)', background: 'var(--bg-app)', borderRadius: '50%', padding: '1px', display: 'flex' }}>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        {iconCompta}
      </div>
    ) : iconCompta;

    if (r === 'gerant') {
      return [
        { key: 'accueil', label: 'Bord', icon: iconBord },
        { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
        { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
        { key: 'outils', label: 'Outils', icon: iconOutils },
      ];
    }
    if (r === 'salon') {
      return [
        { key: 'accueil', label: 'Bord', icon: iconBord },
        { key: 'caisse', label: 'Caisse', icon: iconCaisse },
        { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
        { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
        { key: 'outils', label: 'Outils', icon: iconOutils },
      ];
    }
    return [
      { key: 'accueil', label: 'Bord', icon: iconBord },
      { key: 'agenda', label: 'Agenda', badge: (tachesIA || []).some(t => t.type_tache === 'CLIENT'), icon: iconAgenda },
      { key: 'admin', label: 'Compta', icon: iconComptaLock },
      { key: 'actions', label: 'Actions', badge: nbTachesUrgentes > 0, icon: iconActions },
      { key: 'outils', label: 'Outils', icon: iconOutils },
    ];
  };

  const getOnglets = onglMobilesParRole || defaultOnglMobilesParRole;

  return (
    <div className="navbar-sidebar">
      {/* VUE DESKTOP */}
      {!isMobile && (
        <>
          <div className={`nav-item ${activeTab === 'accueil' ? 'active' : ''}`} onClick={() => setActiveTab('accueil')}>
            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
            <span>Bord</span>
          </div>

          {role === 'salon' && (
            <div className={`nav-item ${activeTab === 'caisse' ? 'active' : ''}`} onClick={() => setActiveTab('caisse')}>
              <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg></span>
              <span>Caisse</span>
            </div>
          )}

          {(role === 'gerant' || role === 'salon' || role === 'employe') && (
            <div className={`nav-item ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')} style={{ position: 'relative' }}>
              {nbTachesUrgentes > 0 && <span style={{ position: 'absolute', top: '6px', right: '14px', width: '10px', height: '10px', background: 'var(--color-danger)', borderRadius: '50%', border: '2px solid var(--bg-card)' }}></span>}
              <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span>
              <span>Actions</span>
            </div>
          )}

          <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')} style={{ position: 'relative' }}>
            {(tachesIA || []).some(t => t.type_tache === 'CLIENT') && <span className="badge-ia-rouge"></span>}
            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
            <span>Agenda</span>
          </div>

          {(role === 'gerant' || role === 'salon') && (
            <>
              <div className={`nav-item ${activeTab === 'protocoles' ? 'active' : ''}`} onClick={() => handleTabClick('protocoles')} style={{ position: 'relative' }}>
                {!aLeNiveau('PRO') && (
                  <span style={{ position: 'absolute', top: '8px', right: '8px', color: 'var(--text-muted)' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </span>
                )}
                <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></span>
                <span>L'Académie</span>
              </div>

              <div className={`nav-item ${activeTab === 'produits' ? 'active' : ''}`} onClick={() => setActiveTab('produits')} style={{ position: 'relative' }}>
                {(tachesIA || []).some(t => t.type_tache === 'STOCK') && <span className="badge-ia-rouge"></span>}
                <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg></span>
                <span>Stocks</span>
              </div>
            </>
          )}

          {role === 'gerant' && (
            <div className={`nav-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => handleTabClick('rh')} style={{ position: 'relative' }}>
              <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>
              <span>Équipe</span>
            </div>
          )}

          {(role === 'gerant' || role === 'salon' || role === 'employe') && (
            <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => handleTabClick('admin')} style={{ position: 'relative' }}>
              {!aLeNiveau('PREMIUM') && (
                <span style={{ position: 'absolute', top: '8px', right: '8px', color: 'var(--text-muted)' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </span>
              )}
              <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></span>
              <span>Compta</span>
            </div>
          )}

          {role === 'gerant' && decodeToken(token)?.email === '2@gmail.com' && (
            <div className={`nav-item ${activeTab === 'superadmin' ? 'active' : ''}`} onClick={() => setActiveTab('superadmin')}>
              <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#aa3bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg></span>
              <span style={{ color: '#aa3bff', fontWeight: 'bold' }}>God Mode</span>
            </div>
          )}

          <div className={`nav-item ${activeTab === 'messagerie' ? 'active' : ''}`} onClick={() => setActiveTab('messagerie')} style={{ position: 'relative' }}>
            {aDesMessagesNonLus && <span className="badge-ia-rouge"></span>}
            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg></span>
            <span>Chat</span>
          </div>

          <div className="navbar-spacer"></div>

          <div className="nav-item" onClick={seDeconnecter} style={{ color: 'var(--color-danger)' }} title="Se déconnecter">
            <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span>
            <span style={{ fontWeight: 500 }}>Quitter</span>
          </div>
        </>
      )}

      {/* VUE MOBILE : BARRE "LIQUID GLASS" */}
      {isMobile && (
        <LiquidTabBar
          activeIndex={(() => {
            const items = getOnglets(role);
            const idxOutils = items.length - 1;
            if (isOutilsMenuOpen || ['protocoles', 'produits', 'rh', 'superadmin'].includes(activeTab)) return idxOutils;
            const idx = items.findIndex(it => it.key === activeTab || (it.key === 'admin' && activeTab === 'admin'));
            return idx >= 0 ? idx : 0;
          })()}
          items={getOnglets(role).map(it => {
            if (it.key === 'outils') return { ...it, badge: aDesMessagesNonLus && !isOutilsMenuOpen, onSelect: () => setIsOutilsMenuOpen(true) };
            return { ...it, onSelect: () => { handleTabClick(it.key); setIsOutilsMenuOpen(false); } };
          })}
        />
      )}
    </div>
  );
}
