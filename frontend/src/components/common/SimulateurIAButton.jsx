import React from 'react';

export default function SimulateurIAButton({
  token,
  isSalonDemoActif,
  role,
  isMobile,
  showSimIAMenu,
  setShowSimIAMenu,
  lancerSimulationIA
}) {
  if (!token || !isSalonDemoActif || role !== 'gerant') return null;

  const simulationItems = [
    {
      key: 'FACTURE',
      title: 'Facture Fournisseur (Split-Screen)',
      desc: "Facture L'Oréal Professionnel + 3 stocks",
      icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    },
    {
      key: 'RDV',
      title: 'Nouveau Rendez-vous Client',
      desc: 'Balayage Minéral + Patine (Demain 15h)',
      icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    },
    {
      key: 'STOCK',
      title: 'Livraison de Stock (+12 unités)',
      desc: 'Bon de livraison Shampoing Kératine',
      icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
    },
    {
      key: 'CONGES',
      title: 'Demande de Congés Payés (RH)',
      desc: 'Demande de 3 jours à arbitrer',
      icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 14l2 2 4-4"/></svg>
    },
    {
      key: 'MALADIE',
      title: 'Arrêt Maladie & Robot SMS',
      desc: 'Arrêt immédiat + détection RDV en conflit',
      icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: isMobile ? '92px' : '24px',
      right: isMobile ? '16px' : '24px',
      zIndex: 99990,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '10px'
    }}>
      {showSimIAMenu && (
        <div style={{
          width: isMobile ? '290px' : '320px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '18px',
          padding: '14px',
          boxShadow: '0 20px 44px rgba(0,0,0,0.22)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px 8px 4px', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Outil de Démonstration Agent</span>
              <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>Simuler une détection de l'IA</strong>
            </div>
            <button type="button" onClick={() => setShowSimIAMenu(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>✕</button>
          </div>

          {simulationItems.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => lancerSimulationIA(item.key)}
              className="hover-bg-card"
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                width: '100%', textAlign: 'left', padding: '10px 12px',
                borderRadius: '12px', border: '1px solid var(--border-color)',
                background: 'var(--bg-app)', color: 'var(--text-main)',
                cursor: 'pointer', transition: 'all 0.15s ease'
              }}
            >
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.icon}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: '800', color: 'var(--text-main)' }}>{item.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowSimIAMenu(!showSimIAMenu)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '9px',
          padding: '12px 18px',
          borderRadius: '999px',
          background: 'var(--text-main)',
          color: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
          fontWeight: '800',
          fontSize: '13px',
          cursor: 'pointer'
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>Simulateur IA (Démo)</span>
      </button>
    </div>
  );
}
