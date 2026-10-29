const wait = ms => new Promise(r => setTimeout(r, ms));
const L = '#lea';

const sec = (titre, lignes = [], href = L) => ({ titre, href, lignes });
const docs = n => sec('Documents et vidéos', [{ gauche: 'Documents distribués', droite: String(n) }]);
const travaux = n => sec('Travaux', [{ gauche: 'Énoncés distribués', droite: String(n) }]);
const note = v => sec('Notes d’évaluation', [{ gauche: 'Votre note actuelle', droite: v }]);
const base = (n, t, v, extra = []) => [docs(n), travaux(t), note(v), ...extra, sec('Communiqués', [], null), sec('Évènements'), sec('Forum de classe')];
const abs = (total, details = []) => ({ total, details });

export async function fetchCours() {
  await wait(900);
  return [
    { code: '201-SN2-RE', nom: 'Calcul différentiel', prof: 'Marie Tremblay', desc: 'gr. 1001 - lun 08:10, jeu 15:10, Marie Tremblay',
      sections: base(8, 0, '33.5/40 (84%)', [sec('Retards et absences')]), absences: abs(2, [{ date: 'jeu 17 sep', heures: 2 }]) },
    { code: '420-4W6-EM', nom: 'Programmation web orientée services', prof: 'Julien Gagnon', desc: 'gr. 1002 - mar 08:10, ven 12:10, Julien Gagnon',
      sections: base(12, 3, '81.5%', [sec('Retards et absences')]), absences: abs(1.5, [{ date: 'ven 11 sep', heures: 1 }, { date: 'mar 06 oct', heures: 0.5 }]) },
    { code: '582-905-EM', nom: 'Design d’interface', prof: 'Sophie Roy', desc: 'gr. 1003 - mer 08:10, ven 08:10, Sophie Roy',
      sections: base(5, 2, '74.0%', [sec('Retards et absences')]), absences: abs(1, [{ date: 'mer 21 oct', heures: 1 }]) },
    { code: '420-3M5-EM', nom: 'Introduction à la programmation mobile', prof: 'Alexandre Côté', desc: 'gr. 1004 - mar 15:10, jeu 08:10, Alexandre Côté',
      sections: base(4, 1, '57.0%'), absences: abs(0) },
    { code: '601-103-MQ', nom: 'Littérature québécoise', prof: 'Isabelle Bouchard', desc: 'gr. 1005 - mer 10:10, ven 16:10, Isabelle Bouchard',
      sections: base(3, 1, '72.0%'), absences: abs(0) },
    { code: '340-102-MQ', nom: 'Philosophie : l’être humain', prof: 'Nicolas Pelletier', desc: 'gr. 1006 - mar 12:10, Nicolas Pelletier',
      sections: base(6, 0, '88.0%'), absences: abs(0) },
    { code: '109-366-EM', nom: 'Randonnée pédestre', prof: 'Émilie Lavoie', desc: 'gr. 2001 Émilie Lavoie',
      sections: base(0, 0, '-'), absences: abs(0) },
  ];
}

const doc = (titre, date, extra = {}) => ({ titre, date, description: '', lien: false, nouveau: false, href: `#doc-${titre}`, ...extra });

export async function fetchDocuments() {
  await wait(600);
  return [
    { categorie: 'Examen 2', documents: [doc('Informations importantes', '26 oct 2026', { nouveau: true })] },
    { categorie: 'Divers', documents: [doc('Corrigé - Notes de cours - Page 56', '13 oct 2026')] },
    { categorie: 'Aide aux étudiant-e-s', documents: [
      doc('Périodes de disponibilité aux étudiant-e-s', '27 aoû 2026'),
      doc('Horaire du Centre d’aide en mathématiques', '27 aoû 2026'),
      doc('Ma réussite', '19 aoû 2026', { lien: true, description: 'Lien vers le site internet « Ma réussite au Cégep »' }),
    ] },
    { categorie: 'Plan de cours', documents: [doc('Plan de cours 201-SN2-RE gr. 1001', '19 aoû 2026')] },
  ];
}

const ev = (titre, date, note, notePct, moyGroupe, poids, points = '') => ({ titre, date, note, notePct, moyGroupe, poids, points });

export async function fetchNotes() {
  await wait(1000);
  return [
    { code: '201-SN2-RE', nom: 'Calcul différentiel', prof: 'Marie Tremblay',
      actuelle: { points: '24.6/32', pct: 77 }, groupe: { moyenne: 70, mediane: 72, ecartType: 15.3 },
      categories: [
        { nom: 'Examens', poids: 64, moyenne: 76.9, evaluations: [
          ev('Examen 1', '1 octobre', '38.5/50', 77, '35.1/50', 32, '24.64/32'),
          ev('Examen 2', '9 novembre', '-', null, '-', 32),
        ] },
        { nom: 'Évaluation finale', poids: 36, moyenne: null, evaluations: [ev('Examen final', '', '-', null, '-', 36)] },
      ] },
    { code: '420-4W6-EM', nom: 'Programmation web orientée services', prof: 'Julien Gagnon',
      actuelle: { points: '22.8/25', pct: 91 }, groupe: { moyenne: 79, mediane: 84, ecartType: 13.6 },
      categories: [
        { nom: 'Laboratoires', poids: 60, moyenne: 91.2, evaluations: [
          ev('TP1', '', '18/20', 90, '16.4/20', 5, '4.5/5'),
          ev('TP2', '', '55/60', 91.67, '47.8/60', 20, '18.33/20'),
          ev('TP3', '', '-', null, '-', 10),
          ev('TP4', '', '-', null, '-', 25),
        ] },
        { nom: 'Examens', poids: 40, moyenne: null, evaluations: [ev('Ex1', '', '-', null, '-', 15), ev('Ex2', '', '-', null, '-', 25)] },
      ] },
    { code: '340-102-MQ', nom: 'Philosophie : l’être humain', prof: 'Nicolas Pelletier',
      actuelle: { points: null, pct: null }, groupe: { moyenne: null, mediane: null, ecartType: null },
      categories: [{ nom: '', poids: null, moyenne: null, evaluations: [ev('e1', '', '-', null, '-', 30)] }] },
  ];
}

export async function downloadDocument() {
  await wait(700);
  return { blob: new Blob(['aperçu'], { type: 'text/plain' }), nom: 'apercu.txt', extension: '' };
}
