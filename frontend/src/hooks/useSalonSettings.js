import { useCallback } from 'react';
import { urlBase64ToUint8Array, isPinWeak } from '../utils/auth';

/**
 * useSalonSettings - Hook gérant l'enregistrement des paramètres de configuration
 * du salon (horaires, PIN établissement NF525, sécurité) et l'activation des notifications push Web/Mobile.
 */
export default function useSalonSettings({
  token,
  userRole,
  configSalon,
  setConfigSalon,
  isOffline,
  API_URL,
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  showToast = () => {},
  chargerTout = () => {}
}) {
  const sauvegarderParametres = useCallback(
    async (customConfig = null) => {
      if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return showToast("Action impossible hors-ligne.", "error");
      }
      const sourceConfig =
        customConfig &&
        typeof customConfig === 'object' &&
        !customConfig.nativeEvent &&
        !customConfig.target
          ? customConfig
          : configSalon;

      if (
        sourceConfig.pin_salon &&
        !String(sourceConfig.pin_salon).startsWith('$2') &&
        isPinWeak(sourceConfig.pin_salon)
      ) {
        return showToast("Le code PIN du salon est trop simple (évitez 0000, 1234...).", "error");
      }

      try {
        const payload = { ...sourceConfig };
        payload.securite_pin_salon_active = sourceConfig.securite_pin_salon_active !== false;
        if (userRole !== 'gerant') {
          delete payload.pin_salon;
          delete payload.securite_pin_salon_active;
        }

        const response = await fetch(`${API_URL}/api/settings`, {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify(payload)
        });
        await handleFetchError(response);

        setConfigSalon((prev) => ({
          ...prev,
          ...sourceConfig,
          securite_pin_salon_active: sourceConfig.securite_pin_salon_active !== false
        }));
        showToast("Vos paramètres ont bien été enregistrés.", "success");
        if (typeof chargerTout === 'function') chargerTout();
        return true;
      } catch (error) {
        console.error("Erreur Sauvegarde Paramètres :", error);
        if (error.message !== "Abonnement inactif") {
          showToast(`Erreur : ${error.message || "Impossible d'enregistrer"}`, "error");
        }
        return false;
      }
    },
    [isOffline, configSalon, setConfigSalon, userRole, API_URL, getAuthHeaders, handleFetchError, showToast, chargerTout]
  );

  const activerNotificationsPush = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast("Les notifications Push ne sont pas supportées par ce navigateur.", "error");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast("Vous avez refusé les notifications dans les réglages.", "error");
        return;
      }
      const registration = await navigator.serviceWorker.ready;

      // 1. Récupération de la clé publique VAPID
      const response = await fetch(`${API_URL}/api/push/vapid-key`);
      const data = await response.json();
      const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

      // 2. Génération de la souscription Push de l'appareil
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // 3. Envoi au backend
      const resSub = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ subscription })
      });

      if (resSub.ok) {
        showToast("Notifications activées avec succès sur ce téléphone !", "success");
      } else {
        showToast("Erreur lors de l'enregistrement côté serveur.", "error");
      }
    } catch (error) {
      console.error("Erreur activation push :", error);
      showToast("Erreur lors de l'activation des notifications.", "error");
    }
  }, [API_URL, getAuthHeaders, showToast]);

  return {
    sauvegarderParametres,
    activerNotificationsPush
  };
}
