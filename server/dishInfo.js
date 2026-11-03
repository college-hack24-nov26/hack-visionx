// Maps model labels to donor-facing listing suggestions. A label the
// map does not know still comes back as a readable name with no
// category/dietary guess - the donor confirms or edits everything.
const DISHES = {
  idli: { foodName: 'Idli', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Soft steamed rice cakes, a light South Indian breakfast favourite.' },
  samosa: { foodName: 'Samosa', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Crisp golden pastry with a spiced potato and pea filling.' },
  misal_pav: { foodName: 'Misal Pav', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Spicy sprouted-bean curry with farsan, onion and lemon, served with pav.' },
  pav_bhaji: { foodName: 'Pav Bhaji', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Buttery mashed vegetable curry served with soft pav.' },
  biryani: { foodName: 'Biryani', category: 'COOKED_MEALS', dietaryType: null, description: 'Fragrant layered rice cooked with spices.' },
  veg_biryani: { foodName: 'Veg Biryani', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Fragrant layered rice with vegetables and spices.' },
  chicken_biryani: { foodName: 'Chicken Biryani', category: 'COOKED_MEALS', dietaryType: 'NON_VEG', description: 'Layered rice cooked with chicken and spices.' },
  butter_chicken: { foodName: 'Butter Chicken', category: 'COOKED_MEALS', dietaryType: 'NON_VEG', description: 'Chicken in a rich tomato-butter gravy.' },
  chicken_curry: { foodName: 'Chicken Curry', category: 'COOKED_MEALS', dietaryType: 'NON_VEG', description: 'Chicken simmered in a spiced curry gravy.' },
  masala_dosa: { foodName: 'Masala Dosa', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Crisp crepe with a spiced potato filling.' },
  dosa: { foodName: 'Dosa', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Crisp fermented rice-and-lentil crepe.' },
  uttapam: { foodName: 'Uttapam', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Thick savoury pancake topped with onion and tomato.' },
  medu_vada: { foodName: 'Medu Vada', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Crisp lentil doughnuts, soft inside.' },
  vada_pav: { foodName: 'Vada Pav', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Spiced potato fritter in a pav with chutneys.' },
  poha: { foodName: 'Poha', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Flattened rice tossed with onion, peanuts and turmeric.' },
  khichdi: { foodName: 'Khichdi', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Comforting rice and lentils cooked together.' },
  dal_tadka: { foodName: 'Dal Tadka', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Yellow lentils tempered with ghee, garlic and spices.' },
  dal_fry: { foodName: 'Dal Fry', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Lentils cooked with onion, tomato and spices.' },
  daal_baati_churma: { foodName: 'Daal Baati Churma', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Baked wheat baati with dal and sweet churma.' },
  paneer_butter_masala: { foodName: 'Paneer Butter Masala', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Paneer in a creamy tomato gravy.' },
  palak_paneer: { foodName: 'Palak Paneer', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Paneer cubes in a spinach gravy.' },
  chole_bhature: { foodName: 'Chole Bhature', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Spiced chickpea curry with fluffy fried bhature.' },
  rajma: { foodName: 'Rajma', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Kidney beans simmered in a tomato-onion gravy.' },
  aloo_paratha: { foodName: 'Aloo Paratha', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Whole-wheat flatbread stuffed with spiced potato.' },
  dhokla: { foodName: 'Dhokla', category: 'COOKED_MEALS', dietaryType: 'VEG', description: 'Steamed, spongy gram-flour cakes from Gujarat.' },
  gulab_jamun: { foodName: 'Gulab Jamun', category: null, dietaryType: 'VEG', description: 'Soft milk dumplings soaked in sugar syrup.' },
  rasgulla: { foodName: 'Rasgulla', category: null, dietaryType: 'VEG', description: 'Spongy cheese balls in light sugar syrup.' },
  rasmalai: { foodName: 'Rasmalai', category: null, dietaryType: 'VEG', description: 'Soft cheese discs in sweetened saffron milk.' },
  jalebi: { foodName: 'Jalebi', category: null, dietaryType: 'VEG', description: 'Crisp syrup-soaked spirals.' },
  modak: { foodName: 'Modak', category: null, dietaryType: 'VEG', description: 'Sweet rice-flour dumplings with coconut and jaggery.' },
};

function normalize(label) {
  return String(label || '').toLowerCase().replace(/[\s-]+/g, '_');
}

function titleCase(label) {
  return normalize(label).split('_').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function suggestionFor(label) {
  const hit = DISHES[normalize(label)];
  if (hit) return { ...hit };
  return { foodName: titleCase(label), category: null, dietaryType: null, description: '' };
}

module.exports = { suggestionFor };
