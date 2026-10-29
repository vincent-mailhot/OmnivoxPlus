import { sanitize } from '/lib/dom.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
export const MIO_URL = '#mio';

const day = offset => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

const MESSAGES = [
  { de: 'Julien Gagnon', sujet: 'Remise du TP3 — API REST', apercu: 'Bonjour à tous, petit rappel pour la remise du TP3 vendredi…', date: day(0), nonLu: true, pieceJointe: true },
  { de: 'Marie Tremblay', sujet: 'Examen 2 : matière couverte', apercu: 'L’examen portera sur les chapitres 3 à 5 inclusivement…', date: day(1), nonLu: true, pieceJointe: false },
  { de: 'Aide pédagogique individuelle', sujet: 'Choix de cours — hiver 2027', apercu: 'La période de choix de cours débute le 9 novembre…', date: day(3), nonLu: false, pieceJointe: false },
  { de: 'Sophie Roy', sujet: 'Critique de maquettes en classe', apercu: 'Apportez vos maquettes Figma imprimées ou sur portable…', date: day(6), nonLu: false, pieceJointe: true },
  { de: 'Isabelle Bouchard', sujet: 'Lecture obligatoire', apercu: 'Merci d’avoir lu les chapitres 1 à 4 pour mercredi…', date: day(9), nonLu: false, pieceJointe: false },
  { de: 'Registrariat', sujet: 'Date limite d’abandon sans échec', apercu: 'Rappel : la date limite est fixée au 15 novembre…', date: day(14), nonLu: false, pieceJointe: false },
].map((m, i) => ({ id: `0000000${i}-0000-0000-0000-000000000000`, categorie: 'Reçus', ...m }));

export async function fetchMessages() {
  await wait(700);
  return MESSAGES.map(m => ({ ...m }));
}

export async function fetchMessage(id) {
  await wait(400);
  const m = MESSAGES.find(x => x.id === id);
  const src = new DOMParser().parseFromString(
    `<div><p>Bonjour à tous,</p><p>${m.apercu.replace('…', '.')} N’hésitez pas à me contacter si vous avez des questions.</p>
     <ul><li>Lire les consignes sur Léa</li><li>Remettre le fichier compressé</li></ul>
     <p>Bonne fin de semaine,<br>${m.de}</p><script>alert(1)</script></div>`, 'text/html');
  return {
    id, de: m.de, a: 'Alex Martin',
    date: `${new Date(`${m.date}T09:42`).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} à 09:42`,
    sujet: m.sujet,
    corps: sanitize(src.body.firstElementChild, location.href),
    piecesJointes: m.pieceJointe ? [{ nom: 'consignes.pdf', href: '#pj' }] : [],
  };
}
