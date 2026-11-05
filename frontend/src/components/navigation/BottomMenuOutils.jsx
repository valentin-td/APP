import React from 'react';

export default function BottomMenuOutils({
  isMobile,
  isOutilsMenuOpen,
  setIsOutilsMenuOpen,
  role,
  aLeNiveau,
  handleTabClick,
  setActiveTab,
  token,
  decodeToken,
  aDesMessagesNonLus,
  seDeconnecter
}) {
  if (!isMobile) return null;

  return (
    <>
      <div 
        className={`outils-bottom-sheet-overlay ${isOutilsMenuOpen ? 'open' : ''}`} 
        onClick={() => setIsOutilsMenuOpen(false)}
      />
      <div className={`outils-bottom-sheet ${isOutilsMenuOpen ? 'open' : ''}`}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', textAlign: 'center' }}>Outils & Gestion</h3>
        <div className="outils-grid">
          {(role === 'gerant' || role === 'salon') && (
            <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('protocoles'); }}>
              <div className="outil-btn-icon" style={{ position: 'relative' }}>
                {!aLeNiveau('PRO') && (
                  <span style={{ position: 'absolute', top: '-6px', right: '-6px', color: 'var(--text-muted)', background: 'var(--bg-app)', borderRadius: '50%', padding: '2px', display: 'flex' }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                )}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <span className="outil-btn-label">Académie</span>
            </button>
          )}

          {(role === 'gerant' || role === 'salon') && (
            <button className="outil-btn" onClick={() => { setActiveTab('produits'); setIsOutilsMenuOpen(false); }}>
              <div className="outil-btn-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <span className="outil-btn-label">Stocks</span>
            </button>
          )}

          {role === 'gerant' && (
            <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('rh'); }}>
              <div className="outil-btn-icon" style={{ position: 'relative' }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="outil-btn-label">Équipe</span>
            </button>
          )}

          {(role === 'gerant' || role === 'salon') && (
            <button className="outil-btn" onClick={() => { setIsOutilsMenuOpen(false); handleTabClick('admin'); }}>
              <div className="outil-btn-icon" style={{ position: 'relative' }}>
                {!aLeNiveau('PREMIUM') && (
                  <span style={{ position: 'absolute', top: '-6px', right: '-6px', color: 'var(--text-muted)', background: 'var(--bg-app)', borderRadius: '50%', padding: '2px', display: 'flex' }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                )}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <span className="outil-btn-label">Compta</span>
            </button>
          )}

          {decodeToken(token)?.email === '2@gmail.com' && role === 'gerant' && (
            <button className="outil-btn" onClick={() => { setActiveTab('superadmin'); setIsOutilsMenuOpen(false); }}>
              <div className="outil-btn-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="outil-btn-label">God Mode</span>
            </button>
          )}

          <button className="outil-btn" onClick={() => { setActiveTab('messagerie'); setIsOutilsMenuOpen(false); }} style={{ position: 'relative' }}>
            {aDesMessagesNonLus && <span className="badge-ia-rouge" style={{ top: '-2px', right: '-2px' }}></span>}
            <div className="outil-btn-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <span className="outil-btn-label">Chat</span>
          </button>

          <button className="outil-btn" onClick={() => { seDeconnecter(); setIsOutilsMenuOpen(false); }}>
            <div className="outil-btn-icon" style={{ color: 'var(--color-danger)' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <span className="outil-btn-label" style={{ color: 'var(--color-danger)' }}>Quitter</span>
          </button>
        </div>
      </div>
    </>
  );
}
