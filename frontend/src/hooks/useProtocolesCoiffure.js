import { useState } from 'react';

/**
 * useProtocolesCoiffure - Hook métier dédié aux fiches techniques / recettes de coiffure,
 * étapes détaillées, minuteurs, calcul d'ingrédients et déstockage, photos et médias avant/après.
 */
export const useProtocolesCoiffure = ({
  catalogueListe = [],
  isOffline = false,
  showToast = () => {},
  getAuthHeaders = () => ({}),
  handleFetchError = async (r) => r.json(),
  chargerTout = () => {},
  API_URL
}) => {
  const [protocolesListe, setProtocolesListe] = useState([]);
  const [nouveauProtocole, setNouveauProtocole] = useState({
    nom_prestation: '',
    etapes: [],
    medias: { avant: null, pendant: null, apres: null },
    tags: [],
    ingredients: [],
    temps_nettoyage_minutes: 5,
    a_temps_nettoyage: false
  });
  const [ingredientTemp, setIngredientTemp] = useState({ id_article: '', quantite_necessaire: '' });
  const [etapeTemp, setEtapeTemp] = useState({ texte: '', timer_min: '' });
  const [protocoleVisible, setProtocoleVisible] = useState(null);
  const [modeEditionProtocole, setModeEditionProtocole] = useState(null);
  const [rechercheProtocole, setRechercheProtocole] = useState('');
  const [showAddPrestation, setShowAddPrestation] = useState(false);

  // Compression légère Canvas côté client pour les photos d'étapes et de galerie
  const compresserImageProtocole = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1100;
        let w = img.width,
          h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Normalise une étape (compatibilité anciens et nouveaux protocoles)
  const normaliserEtapeUI = (etape, index = 0) => {
    if (typeof etape === 'string') {
      return {
        id_etape: `et_${index}`,
        titre: `Étape ${index + 1}`,
        description: etape,
        texte: etape,
        duree_minutes: 0,
        timer_min: '',
        photo_url: null,
        ingredients: []
      };
    }
    return {
      id_etape: etape.id_etape || `et_${index}_${Date.now()}`,
      titre: etape.titre || `Étape ${index + 1}`,
      description: etape.description || etape.texte || '',
      texte: etape.description || etape.texte || '',
      duree_minutes: parseInt(etape.duree_minutes ?? etape.timer_min, 10) || 0,
      timer_min: etape.duree_minutes || etape.timer_min || '',
      photo_url: etape.photo_url || null,
      ingredients: Array.isArray(etape.ingredients) ? etape.ingredients : []
    };
  };

  // Agrège tous les ingrédients de toutes les étapes pour calcul rentabilité et déstockage
  const calculerIngredientsTotauxProtocole = (proto) => {
    if (!proto) return [];
    const cumulParArticle = new Map();
    const etapesList = Array.isArray(proto.etapes) ? proto.etapes : [];
    etapesList.forEach((et, idx) => {
      const ings = Array.isArray(et?.ingredients) ? et.ingredients : [];
      ings.forEach((ing) => {
        if (!ing || !ing.id_article) return;
        const key = Number(ing.id_article);
        const artCat = (catalogueListe || []).find((a) => Number(a.id_article) === key);
        const qte = parseFloat(ing.quantite_necessaire) || 1;
        if (cumulParArticle.has(key)) {
          const prev = cumulParArticle.get(key);
          prev.quantite_necessaire = Number((prev.quantite_necessaire + qte).toFixed(2));
          if (ing.proportion && !prev.proportions.includes(ing.proportion)) prev.proportions.push(ing.proportion);
        } else {
          cumulParArticle.set(key, {
            id_article: key,
            nom: ing.nom || artCat?.nom || 'Produit technique',
            quantite_necessaire: qte,
            proportion: ing.proportion || '',
            proportions: ing.proportion ? [ing.proportion] : [],
            numero_etape: idx + 1
          });
        }
      });
    });

    if (cumulParArticle.size === 0 && Array.isArray(proto.ingredients)) {
      return proto.ingredients;
    }
    return Array.from(cumulParArticle.values());
  };

  // Ajout d'un ingrédient dans le brouillon de la nouvelle étape
  const ajouterIngredientBrouillonEtape = () => {
    if (!ingredientTemp.id_article) return showToast('Sélectionnez un produit du catalogue.', 'error');
    const art = (catalogueListe || []).find((a) => String(a.id_article) === String(ingredientTemp.id_article));
    if (!art) return;
    const qte = parseFloat(ingredientTemp.quantite_necessaire) || 1;
    const proportion = (ingredientTemp.proportion || '').trim();
    const listeActuelle = Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : [];
    setEtapeTemp({
      ...etapeTemp,
      ingredients: [...listeActuelle, { id_article: art.id_article, nom: art.nom, quantite_necessaire: qte, proportion }]
    });
    setIngredientTemp({ id_article: '', quantite_necessaire: '1', proportion: '' });
  };

  // Ajout d'un ingrédient directement sur une étape déjà créée
  const ajouterIngredientSurEtapeExistante = (idxEtape, idArticle, quantite, proportion) => {
    if (!idArticle) return showToast('Sélectionnez un produit du catalogue.', 'error');
    const art = (catalogueListe || []).find((a) => String(a.id_article) === String(idArticle));
    if (!art) return;
    const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
      if (i !== idxEtape) return et;
      const ings = Array.isArray(et.ingredients) ? [...et.ingredients] : [];
      ings.push({
        id_article: art.id_article,
        nom: art.nom,
        quantite_necessaire: parseFloat(quantite) || 1,
        proportion: (proportion || '').trim()
      });
      return { ...et, ingredients: ings };
    });
    setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const supprimerIngredientDuneEtape = (idxEtape, idxIng) => {
    const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
      if (i !== idxEtape) return et;
      return { ...et, ingredients: (et.ingredients || []).filter((_, j) => j !== idxIng) };
    });
    setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const modifierChampEtapeExistante = (idxEtape, champ, valeur) => {
    const nouvellesEtapes = (nouveauProtocole.etapes || []).map((et, i) => {
      if (i !== idxEtape) return et;
      const updated = { ...et, [champ]: valeur };
      if (champ === 'description') updated.texte = valeur;
      if (champ === 'duree_minutes') updated.timer_min = valeur;
      return updated;
    });
    setNouveauProtocole({ ...nouveauProtocole, etapes: nouvellesEtapes });
  };

  const uploaderPhotoSurEtape = (e, idxEtape = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compresserImageProtocole(file, (dataUrl) => {
      if (idxEtape === null) {
        setEtapeTemp((prev) => ({ ...prev, photo_url: dataUrl }));
      } else {
        modifierChampEtapeExistante(idxEtape, 'photo_url', dataUrl);
      }
    });
    e.target.value = null;
  };

  const ajouterEtapeRecette = () => {
    const desc = (etapeTemp.description || etapeTemp.texte || '').trim();
    const titre = (etapeTemp.titre || '').trim();
    if (!desc && !titre) return showToast("Renseignez au moins le titre ou les instructions de l'étape.", 'error');
    const num = (nouveauProtocole.etapes || []).length + 1;
    const duree = parseInt(etapeTemp.duree_minutes || etapeTemp.timer_min, 10) || 0;
    const nouvelleEtape = {
      id_etape: `step_${Date.now()}`,
      numero: num,
      titre: titre || `Étape ${num}`,
      description: desc,
      texte: desc,
      duree_minutes: duree,
      timer_min: duree > 0 ? String(duree) : '',
      photo_url: etapeTemp.photo_url || null,
      ingredients: Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : []
    };
    setNouveauProtocole({ ...nouveauProtocole, etapes: [...(nouveauProtocole.etapes || []), nouvelleEtape] });
    setEtapeTemp({ titre: '', description: '', texte: '', duree_minutes: '', timer_min: '', photo_url: null, ingredients: [] });
  };

  const supprimerEtapeRecette = (id_etape) => {
    setNouveauProtocole({
      ...nouveauProtocole,
      etapes: (nouveauProtocole.etapes || []).filter((e, idx) => (e.id_etape || idx) !== id_etape)
    });
  };

  const deplacerEtapeRecette = (idx, direction) => {
    const cible = idx + direction;
    const list = [...(nouveauProtocole.etapes || [])];
    if (cible < 0 || cible >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(cible, 0, moved);
    setNouveauProtocole({ ...nouveauProtocole, etapes: list });
  };

  const toggleTag = (tag) => {
    const tags = (nouveauProtocole.tags || []).includes(tag)
      ? (nouveauProtocole.tags || []).filter((t) => t !== tag)
      : [...(nouveauProtocole.tags || []), tag];
    setNouveauProtocole({ ...nouveauProtocole, tags });
  };

  const uploadMediaProtocole = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compresserImageProtocole(file, (dataUrl) => {
      setNouveauProtocole((prev) => ({ ...prev, medias: { ...(prev.medias || {}), [type]: dataUrl } }));
    });
    e.target.value = null;
  };

  const creerProtocole = async () => {
    if (isOffline) return showToast('Action impossible hors-ligne.', 'error');
    if (!nouveauProtocole.nom_prestation) return showToast('Le nom de la prestation est requis.', 'error');
    try {
      const method = nouveauProtocole.id_protocole ? 'PUT' : 'POST';
      const url = nouveauProtocole.id_protocole
        ? `${API_URL}/api/protocoles/${nouveauProtocole.id_protocole}`
        : `${API_URL}/api/protocoles`;

      let etapesFinales = [...(nouveauProtocole.etapes || [])];
      if (
        (etapeTemp.titre && etapeTemp.titre.trim()) ||
        (etapeTemp.description && etapeTemp.description.trim()) ||
        (etapeTemp.texte && etapeTemp.texte.trim())
      ) {
        const num = etapesFinales.length + 1;
        const desc = (etapeTemp.description || etapeTemp.texte || '').trim();
        const duree = parseInt(etapeTemp.duree_minutes || etapeTemp.timer_min, 10) || 0;
        etapesFinales.push({
          id_etape: `step_${Date.now()}`,
          numero: num,
          titre: (etapeTemp.titre || '').trim() || `Étape ${num}`,
          description: desc,
          texte: desc,
          duree_minutes: duree,
          timer_min: duree > 0 ? String(duree) : '',
          photo_url: etapeTemp.photo_url || null,
          ingredients: Array.isArray(etapeTemp.ingredients) ? etapeTemp.ingredients : []
        });
      }

      const ingredientsPlat = [];
      etapesFinales.forEach((et, idx) => {
        (et.ingredients || []).forEach((ing) => {
          if (ing && ing.id_article) {
            ingredientsPlat.push({
              id_article: ing.id_article,
              quantite_necessaire: parseFloat(ing.quantite_necessaire) || 1,
              numero_etape: idx + 1,
              proportion: ing.proportion || null
            });
          }
        });
      });

      const payload = {
        ...nouveauProtocole,
        etapes: etapesFinales,
        ingredients: ingredientsPlat.length > 0 ? ingredientsPlat : nouveauProtocole.ingredients || [],
        temps_nettoyage_minutes: nouveauProtocole.a_temps_nettoyage
          ? parseInt(nouveauProtocole.temps_nettoyage_minutes, 10) || 5
          : 0
      };

      const res = await fetch(url, { method, headers: getAuthHeaders(true), body: JSON.stringify(payload) });
      await handleFetchError(res);
      setNouveauProtocole({
        nom_prestation: '',
        etapes: [],
        medias: { avant: null, pendant: null, apres: null },
        tags: [],
        ingredients: [],
        temps_nettoyage_minutes: 5,
        a_temps_nettoyage: false
      });
      setEtapeTemp({ titre: '', description: '', texte: '', duree_minutes: '', timer_min: '', photo_url: null, ingredients: [] });
      setModeEditionProtocole(null);
      chargerTout();
      showToast(nouveauProtocole.id_protocole ? 'Protocole mis à jour !' : 'Protocole créé avec succès !', 'success');
    } catch (e) {
      showToast('Erreur lors de la sauvegarde du protocole.', 'error');
    }
  };

  const supprimerProtocole = async (id) => {
    if (isOffline) return showToast('Désactivé', 'error');
    try {
      await fetch(`${API_URL}/api/protocoles/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setModeEditionProtocole(null);
      chargerTout();
      showToast('Protocole supprimé.', 'success');
    } catch (e) {
      showToast('Erreur suppression.', 'error');
    }
  };

  const handleImageUploadProtocole = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compresserImageProtocole(file, (dataUrl) => {
      setNouveauProtocole((prev) => ({ ...prev, photo_url: dataUrl, image_url: dataUrl }));
    });
    e.target.value = null;
  };

  return {
    protocolesListe,
    setProtocolesListe,
    nouveauProtocole,
    setNouveauProtocole,
    ingredientTemp,
    setIngredientTemp,
    etapeTemp,
    setEtapeTemp,
    protocoleVisible,
    setProtocoleVisible,
    modeEditionProtocole,
    setModeEditionProtocole,
    rechercheProtocole,
    setRechercheProtocole,
    showAddPrestation,
    setShowAddPrestation,
    compresserImageProtocole,
    normaliserEtapeUI,
    calculerIngredientsTotauxProtocole,
    ajouterIngredientBrouillonEtape,
    ajouterIngredientSurEtapeExistante,
    supprimerIngredientDuneEtape,
    modifierChampEtapeExistante,
    uploaderPhotoSurEtape,
    ajouterEtapeRecette,
    supprimerEtapeRecette,
    deplacerEtapeRecette,
    toggleTag,
    ajouterTagProtocole: toggleTag,
    supprimerTagProtocole: toggleTag,
    uploadMediaProtocole,
    creerProtocole,
    supprimerProtocole,
    handleImageUploadProtocole
  };
};

export default useProtocolesCoiffure;
