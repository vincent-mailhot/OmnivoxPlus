// Portail Omnivox : nom de l'utilisateur et évènements (horaire, calendrier scolaire, Léa).

import { intrHome } from './session.js';
import { INTR, text } from './http.js';

// Le portail charge les évènements en AJAX : la réponse est du JSON { html, filtres }.
const EVENEMENTS_URL = `${INTR}/intr/UI/WebParts/Intraflex_CalendrierScolaire/WebService/EvenementsWebService.asmx/GetFirstLoad?isMobile=false`;

export async function fetchAccueil() {
  const [{ doc }, evenements] = await Promise.all([intrHome(), fetchEvenements()]);
  return {
    utilisateur: text(doc, '#headerNavbarProfileUserName'),
    evenements,
  };
}

async function fetchEvenements() {
  const res = await fetch(EVENEMENTS_URL, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} : évènements`);
  const { html } = await res.json();
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html');
  return [...doc.querySelectorAll('.carte-evenement')]
    .map(c => ({
      id: c.dataset.idunifie ?? '',
      jourSemaine: text(c, '.nom-jour-semaine'),
      jour: text(c, '.no-jour'),
      mois: text(c, '.nom-mois'),
      heure: text(c, '.carte-portail-border'),
      type: parts(c.querySelector('.carte-portail-type')),
      titre: text(c, '.carte-portail-titre'),
      groupe: text(c, '.carte-portail-cours-groupe'),
      local: text(c, '.carte-portail-local'),
      categorie: [...c.classList].find(x => x.startsWith('categorie_'))?.slice('categorie_'.length),
      passe: c.classList.contains('evenement-passe'),
    }))
    .filter(e => e.categorie && e.titre); // écarte les cartes de remplissage du carrousel
}

// "Évaluation (5%)" + "Littérature québécoise" + "601-103-MQ" -> "Évaluation (5%) · Littérature québécoise · 601-103-MQ"
function parts(el) {
  if (!el) return '';
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.replace(/\s+/g, ' ').trim();
    if (s) out.push(s);
  }
  return out.join(' · ');
}
