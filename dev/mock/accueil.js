const wait = ms => new Promise(r => setTimeout(r, ms));
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Évènements placés relativement à aujourd'hui pour tester "Aujourd'hui" / "Demain".
function ev(offset, heure, type, titre, local, categorie, groupe = '') {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return {
    id: `${offset}-${titre}`, jourSemaine: JOURS[d.getDay()], jour: String(d.getDate()), mois: MOIS[d.getMonth()],
    heure, type, titre, groupe, local, categorie, passe: offset < 0,
  };
}

export async function fetchAccueil() {
  await wait(500);
  return {
    utilisateur: 'Alex Martin',
    evenements: [
      ev(-2, '8:10 à 11:10', 'COURS - Théorie', 'Programmation web orientée services', 'A-214', 'Cours'),
      ev(0, '15:10 à 18:10', 'COURS - Laboratoire', 'Introduction à la programmation mobile', 'B-305', 'Cours'),
      ev(1, '', 'Évaluation (5%) · Littérature québécoise · 601-103-MQ gr. 1005', 'Test 4', '', 'Lea'),
      ev(1, '8:10 à 11:10', 'COURS - Laboratoire', 'Design d’interface', 'C-120', 'Cours'),
      ev(1, '12:10 à 15:10', 'COURS - Laboratoire', 'Programmation web orientée services', 'A-210', 'Cours'),
      ev(1, '16:10 à 18:10', 'COURS - Théorie', 'Littérature québécoise', 'D-018', 'Cours'),
      ev(4, '8:10 à 11:10', 'COURS - Théorie', 'Calcul différentiel', 'A-102', 'Cours'),
      ev(5, '8:10 à 11:10', 'COURS - Théorie', 'Programmation web orientée services', 'A-214', 'Cours'),
      ev(5, '12:10 à 15:10', 'COURS - Théorie', 'Philosophie : l’être humain', 'B-207', 'Cours'),
      ev(5, '', 'Journée pédagogique', 'Journée d’encadrement', '', 'CalScolaire'),
      ev(11, '', 'Évaluation (25%) · Calcul différentiel · 201-SN2-RE gr. 1001', 'Examen 2', '', 'Lea'),
    ],
  };
}
