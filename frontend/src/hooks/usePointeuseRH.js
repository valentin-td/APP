// frontend/src/hooks/usePointeuseRH.js
// Hook de gestion de la pointeuse digitale tactile, statuts de pointage et sécurité PIN (STACK / NF525)

import { useState, useEffect } from 'react';
import { API_URL } from '../api/config';
import { decodeToken } from '../utils/auth';

export function usePointeuseRH({
  token,
  configSalon = {},
  employesListe = [],
  setEmployesListe,
  getAuthHeaders,
  showToast,
  chargerTout,
  getStatutBlocagePin
}) {
  const [pointeuse, setPointeuse] = useState({ open: false, step: 1, employe: null, pin: '', erreurPin: null });
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [statutsEquipe, setStatutsEquipe] = useState({});

  // 1. Saisie sécurisée du PIN
  const handlePointeusePin = (digit) => {
    const statutBlocage = getStatutBlocagePin ? getStatutBlocagePin(pointeuse.employe?.id_employe) : { bloque: false };
    if (statutBlocage.bloque) return;
    setPointeuse((prev) => {
      if (prev.pin.length >= 4) return prev;
      return { ...prev, pin: prev.pin + digit, erreurPin: null };
    });
  };

  // 2. Vérification automatique à 4 chiffres avec gestion du lockout NF525
  useEffect(() => {
    if (pointeuse.open && pointeuse.step === 2 && pointeuse.pin.length === 4) {
      const verifierCode = async () => {
        let dataAuth = {};
        try {
          const resAuth = await fetch(`${API_URL}/api/employes/login-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_salon: decodeToken(token)?.id_salon,
              id_employe: pointeuse.employe.id_employe,
              nom_employe: pointeuse.employe.nom,
              code_pin: pointeuse.pin,
              is_pointeuse: true
            })
          });
          dataAuth = await resAuth.json().catch(() => ({}));
          if (!resAuth.ok) {
            throw new Error(dataAuth.erreur || 'Code PIN incorrect');
          }

          // Succès : remise à zéro locale immédiate des tentatives
          if (setEmployesListe) {
            setEmployesListe((prev) =>
              (prev || []).map((emp) =>
                emp.id_employe === pointeuse.employe.id_employe
                  ? { ...emp, pin_tentatives_echouees: 0, pin_bloque_jusqua: null, pin_bloque_definitif: false }
                  : emp
              )
            );
          }

          setButtonsDisabled(true);
          setPointeuse((prev) => ({ ...prev, step: 3, erreurPin: null }));
          setTimeout(() => {
            setButtonsDisabled(false);
          }, 300);
        } catch (e) {
          if (setEmployesListe) {
            setEmployesListe((prev) =>
              (prev || []).map((emp) => {
                if (emp.id_employe !== pointeuse.employe?.id_employe) return emp;
                return {
                  ...emp,
                  pin_tentatives_echouees:
                    dataAuth.tentatives !== undefined ? dataAuth.tentatives : (emp.pin_tentatives_echouees || 0) + 1,
                  pin_bloque_jusqua: dataAuth.locked_until !== undefined ? dataAuth.locked_until : emp.pin_bloque_jusqua,
                  pin_bloque_definitif:
                    dataAuth.locked_permanent !== undefined ? dataAuth.locked_permanent : emp.pin_bloque_definitif
                };
              })
            );
          }
          if (typeof chargerTout === 'function') chargerTout();
          showToast?.(e.message || 'Code PIN incorrect', 'error');
          setPointeuse((prev) => ({ ...prev, pin: '', erreurPin: e.message || 'Code PIN incorrect' }));
        }
      };
      verifierCode();
    }
  }, [pointeuse.pin, pointeuse.open, pointeuse.step, token]);

  // 3. Enregistrement de l'action de pointage
  const enregistrerPointage = async (action) => {
    try {
      const res = await fetch(`${API_URL}/api/rh/pointage`, {
        method: 'POST',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_employe: pointeuse.employe.id_employe, type_action: action })
      });
      if (!res.ok) throw new Error('Erreur de pointage');

      if (action === 'ENTREE' && setEmployesListe) {
        setEmployesListe((prev) =>
          (prev || []).map((emp) =>
            emp.id_employe === pointeuse.employe.id_employe ? { ...emp, a_pointe_aujourdhui: true } : emp
          )
        );
      }

      setStatutsEquipe((prev) => ({
        ...prev,
        [pointeuse.employe.id_employe]: { action: action, heure: new Date().toISOString() }
      }));

      setPointeuse((prev) => ({ ...prev, step: 4, derniereAction: action }));

      setTimeout(() => {
        setPointeuse({ open: false, step: 1, employe: null, pin: '', derniereAction: null });
      }, 2500);
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  };

  // 4. Chargement des statuts de pointage
  const chargerStatutsPointage = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/rh/statut-pointages`, {
        headers: getAuthHeaders ? getAuthHeaders() : {}
      });
      if (res.ok) {
        const data = await res.json();
        const formattedData = {};
        for (let id in data) {
          if (typeof data[id] === 'string') {
            formattedData[id] = { action: data[id], heure: new Date().toISOString() };
          } else {
            formattedData[id] = data[id];
          }
        }
        setStatutsEquipe(formattedData);
      }
    } catch (e) {
      console.error('Erreur statuts pointages', e);
    }
  };

  // 5. Déblocage PIN collaborateur par le gérant
  const debloquerPinEmploye = async (id_employe) => {
    try {
      const res = await fetch(`${API_URL}/api/employes/${id_employe}/debloquer-pin`, {
        method: 'PUT',
        headers: getAuthHeaders ? getAuthHeaders(true) : { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erreur || 'Impossible de débloquer ce collaborateur.');
      showToast?.(data.message || 'Code PIN débloqué avec succès', 'success');
      if (typeof chargerTout === 'function') chargerTout();
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  };

  // 6. Vérification du statut de pointage pour l'accès caisse
  const getStatutPointageEmploye = (emp) => {
    if (!emp) return { bloque: true, code: 'INCONNU', label: 'Indisponible' };
    if (emp.est_gerant || configSalon.mode_suivi_heures !== 'POINTEUSE') {
      return { bloque: false, code: 'EN_SERVICE', label: 'En service' };
    }
    const stObj = statutsEquipe[emp.id_employe];
    const action = typeof stObj === 'string' ? stObj : stObj?.action;
    if (!action) return { bloque: true, code: 'NON_POINTE', label: 'Pas pointé' };
    if (action === 'PAUSE_DEBUT') return { bloque: true, code: 'EN_PAUSE', label: 'En pause' };
    if (action === 'SORTIE') return { bloque: true, code: 'TERMINE', label: 'Service terminé' };
    return { bloque: false, code: 'EN_SERVICE', label: 'En service' };
  };

  return {
    pointeuse,
    setPointeuse,
    buttonsDisabled,
    setButtonsDisabled,
    statutsEquipe,
    setStatutsEquipe,
    handlePointeusePin,
    enregistrerPointage,
    chargerStatutsPointage,
    debloquerPinEmploye,
    getStatutPointageEmploye
  };
}

export default usePointeuseRH;
