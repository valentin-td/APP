import { useState, useEffect } from 'react';

/**
 * useMouvementsCaisse - Hook gérant les entrées/sorties de petite caisse (espèces),
 * la calculatrice de décompte de monnaie/billets, et la traçabilité NF525 avec code PIN.
 */
export const useMouvementsCaisse = ({
  API_URL,
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  showToast = () => {}
}) => {
  const [mouvementsCaisse, setMouvementsCaisse] = useState([]);
  const [showMouvementModal, setShowMouvementModal] = useState(false);
  const [newMouvement, setNewMouvement] = useState({
    type_mouvement: 'SORTIE',
    montant: '',
    motif: '',
    id_employe: '',
    code_pin: ''
  });

  const [modeCalculatrice, setModeCalculatrice] = useState(false);
  const [ongletCalculatrice, setOngletCalculatrice] = useState('MONNAIES');
  const [detailsMonnaie, setDetailsMonnaie] = useState({
    b500: '',
    b200: '',
    b100: '',
    b50: '',
    b20: '',
    b10: '',
    b5: '',
    p2: '',
    p1: '',
    p050: '',
    p020: '',
    p010: '',
    p005: '',
    p002: '',
    p001: ''
  });

  useEffect(() => {
    if (modeCalculatrice) {
      const total =
        (parseInt(detailsMonnaie.b500, 10) || 0) * 500 +
        (parseInt(detailsMonnaie.b200, 10) || 0) * 200 +
        (parseInt(detailsMonnaie.b100, 10) || 0) * 100 +
        (parseInt(detailsMonnaie.b50, 10) || 0) * 50 +
        (parseInt(detailsMonnaie.b20, 10) || 0) * 20 +
        (parseInt(detailsMonnaie.b10, 10) || 0) * 10 +
        (parseInt(detailsMonnaie.b5, 10) || 0) * 5 +
        (parseInt(detailsMonnaie.p2, 10) || 0) * 2 +
        (parseInt(detailsMonnaie.p1, 10) || 0) * 1 +
        (parseInt(detailsMonnaie.p050, 10) || 0) * 0.5 +
        (parseInt(detailsMonnaie.p020, 10) || 0) * 0.2 +
        (parseInt(detailsMonnaie.p010, 10) || 0) * 0.1 +
        (parseInt(detailsMonnaie.p005, 10) || 0) * 0.05 +
        (parseInt(detailsMonnaie.p002, 10) || 0) * 0.02 +
        (parseInt(detailsMonnaie.p001, 10) || 0) * 0.01;
      setNewMouvement((prev) => ({ ...prev, montant: total > 0 ? total.toFixed(2) : '' }));
    }
  }, [detailsMonnaie, modeCalculatrice]);

  const chargerMouvementsCaisse = async () => {
    try {
      const res = await fetch(`${API_URL}/api/caisse/mouvements/aujourdhui`, { headers: getAuthHeaders(true) });
      if (res.ok) setMouvementsCaisse(await res.json());
    } catch (e) {}
  };

  const ajouterMouvementCaisse = async () => {
    if (!newMouvement.motif.trim() || !newMouvement.montant) {
      return showToast('Veuillez remplir le montant et le motif.', 'error');
    }
    try {
      const res = await fetch(`${API_URL}/api/caisse/mouvements`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(newMouvement)
      });
      await handleFetchError(res);
      showToast('Mouvement enregistré.', 'success');
      setShowMouvementModal(false);
      setNewMouvement({ type_mouvement: 'SORTIE', montant: '', motif: '', id_employe: '', code_pin: '' });
      setModeCalculatrice(false);
      setDetailsMonnaie({
        b500: '',
        b200: '',
        b100: '',
        b50: '',
        b20: '',
        b10: '',
        b5: '',
        p2: '',
        p1: '',
        p050: '',
        p020: '',
        p010: '',
        p005: '',
        p002: '',
        p001: ''
      });
      chargerMouvementsCaisse();
    } catch (e) {
      setNewMouvement({ ...newMouvement, code_pin: '' });
      showToast(e.message, 'error');
    }
  };

  return {
    mouvementsCaisse,
    setMouvementsCaisse,
    showMouvementModal,
    setShowMouvementModal,
    newMouvement,
    setNewMouvement,
    modeCalculatrice,
    setModeCalculatrice,
    ongletCalculatrice,
    setOngletCalculatrice,
    detailsMonnaie,
    setDetailsMonnaie,
    chargerMouvementsCaisse,
    ajouterMouvementCaisse
  };
};

export default useMouvementsCaisse;
