import { useState, useEffect, useCallback } from 'react';

/**
 * usePricingLock - Hook gérant la logique du Reverse Trial (essai Freemium/Premium),
 * le verrouillage doux (soft lock) et dur (hard lock), ainsi que les droits d'accès
 * aux différents modules (Premium vs Pro vs Basic).
 */
export default function usePricingLock({
  configSalon = {},
  userRole,
  activeTab,
  setActiveTab,
  isAbonnementInactif,
  showToast
}) {
  const [showPricingModal, setShowPricingModal] = useState(false);

  // --- LOGIQUE REVERSE TRIAL ---
  const isTrialing = configSalon.plan_actuel === 'PREMIUM_TRIAL';
  const dateFinEssai = configSalon.date_fin_essai ? new Date(configSalon.date_fin_essai) : null;
  const joursRestantsEssai = dateFinEssai
    ? Math.ceil((dateFinEssai.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : 999;

  const isSoftLock = isTrialing && joursRestantsEssai <= 0 && joursRestantsEssai >= -7;
  // Déclenche le "Hard Lock" si l'essai est terminé OU si l'abonnement est impayé
  const isHardLock = (isTrialing && joursRestantsEssai < -7) || isAbonnementInactif;

  useEffect(() => {
    if ((isSoftLock || isHardLock) && userRole === 'gerant' && activeTab !== 'caisse' && !showPricingModal) {
      setShowPricingModal(true);
    }
  }, [isSoftLock, isHardLock, userRole, activeTab, showPricingModal]);

  const aLeNiveau = useCallback(
    (niveauRequis) => {
      const plan = configSalon.plan_actuel || 'PREMIUM_TRIAL';
      if (plan === 'PREMIUM_TRIAL' || plan === 'PREMIUM') return true;
      if (niveauRequis === 'PRO' && (plan === 'PRO' || plan === 'PREMIUM')) return true;
      return false;
    },
    [configSalon.plan_actuel]
  );

  const handleTabClick = useCallback(
    (tabName) => {
      // Vérification des droits pour TOUS les rôles (gérant, salon, employé)
      if (tabName === 'admin' && !aLeNiveau('PREMIUM')) {
        if (userRole !== 'gerant') {
          showToast?.("Le gérant doit débloquer l'accès Premium.", 'error');
          return;
        }
        setShowPricingModal(true);
        return;
      }
      if (tabName === 'protocoles' && !aLeNiveau('PRO')) {
        if (userRole !== 'gerant') {
          showToast?.("Le gérant doit débloquer l'accès Pro.", 'error');
          return;
        }
        setShowPricingModal(true);
        return;
      }

      // Si autorisé, changement d'onglet
      setShowPricingModal(false);
      setActiveTab?.(tabName);
    },
    [aLeNiveau, userRole, showToast, setActiveTab]
  );

  return {
    showPricingModal,
    setShowPricingModal,
    isTrialing,
    dateFinEssai,
    joursRestantsEssai,
    isSoftLock,
    isHardLock,
    aLeNiveau,
    handleTabClick
  };
}
