import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * useResponsiveAgendaDate - Hook gérant l'écoute responsive de la taille d'écran,
 * la pagination multi-jours du planning agenda (3 jours mobile, 4 tablette, 7 desktop)
 * et le calcul des plages horaires d'ouverture du salon.
 */
export default function useResponsiveAgendaDate(configSalon = {}) {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const nbJoursAffichage = isMobile ? 3 : (isTablet ? 4 : 7);

  const getStartOfPeriod = useCallback((d, daysCount) => {
    const date = new Date(d);
    if (daysCount === 7) {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    }
    return date;
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  const startDate = useMemo(
    () => getStartOfPeriod(currentDate, nbJoursAffichage),
    [currentDate, nbJoursAffichage, getStartOfPeriod]
  );

  const joursSemaine = useMemo(() => {
    return Array.from({ length: nbJoursAffichage }).map((_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [startDate, nbJoursAffichage]);

  const changerPeriode = useCallback(
    (direction) => {
      setCurrentDate((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + direction * nbJoursAffichage);
        return next;
      });
    },
    [nbJoursAffichage]
  );

  const resetToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Plages horaires de configuration salon pour l'agenda
  const heureDebutAgenda = Math.max(0, Math.min(23, parseInt(configSalon?.heure_ouverture) || 8));
  const heureFinAgenda = Math.max(heureDebutAgenda, Math.min(23, parseInt(configSalon?.heure_fermeture) || 20));
  const nbHeures = Math.max(1, heureFinAgenda - heureDebutAgenda + 1);

  return {
    windowWidth,
    isMobile,
    isTablet,
    nbJoursAffichage,
    currentDate,
    setCurrentDate,
    startDate,
    joursSemaine,
    changerPeriode,
    resetToToday,
    getStartOfPeriod,
    heureDebutAgenda,
    heureFinAgenda,
    nbHeures
  };
}
