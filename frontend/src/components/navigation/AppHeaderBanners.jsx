import React from 'react';

export default function AppHeaderBanners({
  isTrialing,
  joursRestantsEssai,
  alertesFermees,
  fermerAlerte,
  setShowPricingModal,
  afficherRappelCloture,
  setActiveTab,
  afficherRappelStock,
  validerVerifStock,
  clotureAutoInfo,
  isOffline,
  pendingOfflineCount
}) {
  const jourKey = new Date().toLocaleDateString('fr-FR');
  const showTrial = isTrialing && joursRestantsEssai <= 5 && joursRestantsEssai > 0 && !alertesFermees[`trial_${jourKey}`];
  const showCloture = afficherRappelCloture && !alertesFermees[`cloture_${jourKey}`];
  const showStock = afficherRappelStock && !alertesFermees[`stock_${jourKey}`];
  const showAuto = clotureAutoInfo && !alertesFermees[`cloture_auto_${clotureAutoInfo}`];

  const hasRappels = showTrial || showCloture || showStock || showAuto;

  return (
    <>
      {hasRappels && (
        <div className="rappels-fixes-container">
          {showTrial && (
            <div className="rappel-stock-banner" style={{ borderColor: '#f59e0b', borderLeftColor: '#f59e0b', position: 'relative', paddingRight: '40px' }}>
              <span>⚠️ Votre mois d'essai gratuit se termine dans {joursRestantsEssai} jour(s). Pensez à choisir votre forfait.</span>
              <button onClick={() => setShowPricingModal(true)} style={{ background: '#f59e0b' }}>Choisir</button>
              <button onClick={() => fermerAlerte(`trial_${jourKey}`)} style={{ position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
            </div>
          )}
          {showCloture && (
            <div className="rappel-cloture-banner" style={{ position: 'relative', paddingRight: '40px' }}>
              <span>N'oublie pas d'effectuer la Clôture Journalière</span>
              <button onClick={() => setActiveTab('admin')}>Faire la clôture</button>
              <button onClick={() => fermerAlerte(`cloture_${jourKey}`)} style={{ position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
            </div>
          )}
          {showStock && (
            <div className="rappel-stock-banner" style={{ position: 'relative', paddingRight: '40px' }}>
              <span>Nous vous conseillons de vérifier les stocks manuellement</span>
              <button onClick={validerVerifStock}>Fait</button>
              <button onClick={() => fermerAlerte(`stock_${jourKey}`)} style={{ position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
            </div>
          )}
          {showAuto && (
            <div className="rappel-stock-banner" style={{ borderColor: 'var(--color-info)', borderLeftColor: 'var(--color-info)', position: 'relative', paddingRight: '40px' }}>
              <span>La caisse du {new Date(clotureAutoInfo).toLocaleDateString('fr-FR')} a été clôturée automatiquement.</span>
              <button onClick={() => fermerAlerte(`cloture_auto_${clotureAutoInfo}`)} style={{ background: 'var(--color-info)' }}>OK</button>
              <button onClick={() => fermerAlerte(`cloture_auto_${clotureAutoInfo}`)} style={{ position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .rdv-card-accordeon {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rdv-card-accordeon:hover {
          z-index: 100 !important;
          transform: scale(1.02);
          box-shadow: 0 8px 16px rgba(0,0,0,0.25) !important;
        }
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 100000, width: '100%' }}>
        {isOffline && (
          <div style={{ background: '#dc2626', color: 'white', textAlign: 'center', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box' }}>
            ⚠️ Connexion perdue. Mode hors-ligne activé.
          </div>
        )}

        {pendingOfflineCount > 0 && (
          <div style={{ background: '#991b1b', color: 'white', textAlign: 'center', padding: '12px 16px', fontSize: '13px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 12px rgba(153, 27, 27, 0.4)' }}>
            ⚠️ {pendingOfflineCount} ticket(s) en attente de réseau. Ne fermez pas cette page et ne videz pas l'historique.
          </div>
        )}
      </div>
    </>
  );
}
