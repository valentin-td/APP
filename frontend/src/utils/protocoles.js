export const normaliserEtapeUI = (etape, index = 0) => {
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

export default normaliserEtapeUI;
