/**
 * Utilitaires de gestion et de contrôle des codes PIN et des verrouillages de sécurité (NF525).
 */

export function getStatutBlocagePin(employesListe, empIdentifier) {
  if (!empIdentifier) return { bloque: false, definitif: false, message: null, tentatives: 0, essaisRestants: 3 };
  const emp = (employesListe || []).find(
    e => String(e.id_employe) === String(empIdentifier)
      || (e.nom && e.nom.toLowerCase() === String(empIdentifier).toLowerCase())
      || (String(empIdentifier).toLowerCase() === 'gerant' && e.est_gerant)
  );
  if (!emp) return { bloque: false, definitif: false, message: null, tentatives: 0, essaisRestants: 3 };
  const tentatives = parseInt(emp.pin_tentatives_echouees, 10) || 0;
  const prochainSeuil = tentatives < 3 ? 3 : (tentatives < 5 ? 5 : (tentatives < 7 ? 7 : 9));
  const essaisRestants = Math.max(0, prochainSeuil - tentatives);

  if (emp.pin_bloque_definitif) {
    return {
      bloque: true,
      definitif: true,
      tentatives: tentatives || 9,
      essaisRestants: 0,
      message: "Accès PIN bloqué définitivement (9 échecs)."
    };
  }
  if (emp.pin_bloque_jusqua && new Date(emp.pin_bloque_jusqua) > new Date()) {
    const min = Math.max(1, Math.ceil((new Date(emp.pin_bloque_jusqua).getTime() - Date.now()) / 60000));
    return {
      bloque: true,
      definitif: false,
      tentatives: tentatives || 3,
      essaisRestants,
      message: `PIN suspendu temporairement (${min} min restante${min > 1 ? 's' : ''}).`
    };
  }
  return { bloque: false, definitif: false, message: null, tentatives, essaisRestants };
}

export function appliquerRetourPinLocal(setEmployesListe, empIdentifier, dataErr) {
  if (!empIdentifier || !dataErr) return;
  setEmployesListe(prev => (prev || []).map(emp => {
    const match = String(emp.id_employe) === String(empIdentifier)
      || (emp.nom && emp.nom.toLowerCase() === String(empIdentifier).toLowerCase())
      || (String(empIdentifier).toLowerCase() === 'gerant' && emp.est_gerant);
    if (!match) return emp;
    return {
      ...emp,
      pin_tentatives_echouees: dataErr.tentatives !== undefined ? dataErr.tentatives : emp.pin_tentatives_echouees,
      pin_bloque_jusqua: dataErr.locked_until !== undefined ? dataErr.locked_until : emp.pin_bloque_jusqua,
      pin_bloque_definitif: dataErr.locked_permanent !== undefined ? dataErr.locked_permanent : emp.pin_bloque_definitif
    };
  }));
}
