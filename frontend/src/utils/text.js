export const nettoyerTexteRecherche = (texte) => {
  if (!texte) return '';
  return String(texte)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
};

export const formatNomClient = (client) => {
  if (!client) return 'Client inconnu';
  if (client.prenom && client.nom) return `${client.prenom} ${client.nom}`;
  return client.nom || 'Client sans nom';
};

export const formatDateComplete = (d) => {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  return dateObj.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

export const formatDateInput = (d) => {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

export const formatPortion = (qte) => {
  const num = parseFloat(qte);
  if (isNaN(num)) return '0';
  return Number.isInteger(num) ? num.toString() : num.toFixed(1);
};
