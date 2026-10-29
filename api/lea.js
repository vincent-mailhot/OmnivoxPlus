// Léa : la page d'accueil "Activité dans mes classes" contient une carte par cours.

import { leaHome } from './session.js';
import { getDoc, text, abs } from './http.js';

export async function fetchCours() {
  const { doc, url } = await leaHome();
  const cours = [...doc.querySelectorAll('.classes-wrapper .card-panel')].map(card => {
    const titre = text(card, '.card-panel-title');
    const m = /^(\S+)\s+(.*)$/.exec(titre);
    const desc = text(card, '.card-panel-desc');
    return {
      code: m?.[1] ?? '',
      nom: capitalize(m?.[2] ?? titre),
      desc,
      prof: profOf(desc),
      sections: [...card.querySelectorAll('.card-panel-item-wrapper')].map(a => parseSection(a, url)),
    };
  });

  // Les absences ne sont pas sur l'accueil de Léa : une page les liste pour tous les cours.
  const absences = await fetchAbsences(cours).catch(err => {
    console.warn('[Omnivox+] absences', err);
    return null;
  });
  if (absences) for (const c of cours) c.absences = absences.get(c.code) ?? { total: 0, details: [] };
  return cours;
}

// N'importe quel lien "Retards et absences" mène à /cvir/abse/Notes.ovx, qui contient
// un tableau "Liste des absences par cours" : ligne du cours, lignes de détail, puis "Total:".
function fetchAbsences(cours) {
  const href = cours.flatMap(c => c.sections).find(s => /retard|absence/i.test(s.titre) && s.href)?.href;
  if (!href) return Promise.resolve(null);
  return serial(async () => {
    const { doc } = await getDoc(href);
    const table = doc.querySelector('td.nom-cours')?.closest('table');
    if (!table) throw new Error('Tableau des absences introuvable');
    const parCours = new Map();
    let current = null;
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll(':scope > td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
      const nom = tr.querySelector('td.nom-cours');
      if (nom) {
        current = { total: 0, details: [] };
        const code = /\d{3}-\w{3}-\w{2}/.exec(nom.textContent)?.[0];
        if (code) parCours.set(code, current);
        cells.splice(0, 2); // numéro et nom du cours
      } else if (/^Total/i.test(cells[0] ?? '')) {
        if (current) current.total = heures(cells[1]);
        continue;
      }
      if (current && cells.length >= 2 && cells[0] !== '-') current.details.push({ date: cells[0], heures: heures(cells[1]) });
    }
    for (const a of parCours.values()) {
      if (!a.total) a.total = a.details.reduce((sum, d) => sum + d.heures, 0);
    }
    return parCours;
  });
}

const heures = s => parseFloat(String(s ?? '').replace(',', '.')) || 0;

function parseSection(a, base) {
  const head = a.querySelector('.item-header-title')?.cloneNode(true);
  head?.querySelectorAll('svg, .svg-icon, .material-icons, i').forEach(n => n.remove());
  return {
    titre: (head?.textContent ?? '').replace(/\s+/g, ' ').replace(/^[a-z_]+(?=[A-ZÀ-Ý])/, '').trim(),
    href: abs(a.getAttribute('href'), base),
    lignes: [...a.querySelectorAll('.item-content-row')]
      .map(r => ({ gauche: text(r, '.left-section'), droite: rightText(r.querySelector('.right-section')) }))
      .filter(l => l.gauche || l.droite),
  };
}

// ---------- Documents distribués ----------

// Léa mémorise le "cours courant" côté serveur : le lien de la section Documents le change puis
// redirige vers ListeDocuments.aspx. On sérialise ces requêtes pour éviter de mélanger deux cours.
let queue = Promise.resolve();
const serial = fn => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

export function fetchDocuments(sectionHref) {
  return serial(async () => {
    const { doc, url } = await getDoc(sectionHref);
    if (!/ListeDocuments\.aspx/i.test(new URL(url).pathname)) throw new Error('Session Léa expirée');
    // Un seul tableau : chaque catégorie est une ligne d'en-tête suivie de ses documents.
    const categories = [];
    let current = null;
    for (const tr of doc.querySelectorAll('table.CategorieDocument tr')) {
      if (tr.querySelector('.DisDoc_TitreCategorie')) {
        current = { categorie: text(tr, '.DisDoc_TitreCategorie'), documents: [] };
        categories.push(current);
      } else if (tr.querySelector('.lblTitreDocumentDansListe')) {
        if (!current) categories.push(current = { categorie: '', documents: [] });
        const d = parseDocument(tr, url);
        if (d.href) current.documents.push(d);
      }
    }
    return categories.filter(c => c.documents.length);
  });
}

function parseDocument(tr, base) {
  const a = tr.querySelector('.colVoirTelecharger a') ?? tr.querySelector('a.lblTitreDocumentDansListe');
  const raw = a?.getAttribute('href') ?? '';
  // Les liens web sont "javascript:CallPageVisualiseDocument('VisualiseDocument.aspx?...')".
  const js = /CallPageVisualiseDocument\(\s*'([^']+)'/.exec(raw);
  return {
    titre: text(tr, 'a.lblTitreDocumentDansListe'),
    description: text(tr, '.lblTitreDocumentDansListe-Description'),
    date: text(tr, '.date-doc span') || text(tr, '.date-doc'),
    lien: !!js || !!tr.querySelector('img[src*="lienExterne"]'),
    nouveau: !!tr.querySelector('#colonneEtoileVisualisation img'),
    href: abs(js ? js[1] : raw, base),
  };
}

const EXTENSIONS = { 'application/pdf': '.pdf', 'application/zip': '.zip' };

export async function downloadDocument(href) {
  const res = await fetch(href, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html')) throw new Error('Léa a renvoyé une page au lieu du fichier (session expirée ?)');
  const blob = await res.blob();
  return { blob, nom: fileName(res.headers.get('content-disposition')), extension: EXTENSIONS[blob.type] ?? '' };
}

function fileName(cd) {
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(cd ?? '');
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch { /* on essaie filename= */ }
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(cd ?? '')?.[1].trim() ?? null;
}

// ---------- Notes d'évaluation ----------

// Une page /cvir/note/ListeEvalCVIR.ovx par cours ("cours courant" côté serveur : requêtes en série).
export async function fetchNotes(cours) {
  const out = [];
  for (const c of cours) {
    const href = c.sections.find(s => /note/i.test(s.titre) && s.href)?.href;
    if (!href) continue;
    out.push({ code: c.code, nom: c.nom, prof: c.prof, ...(await serial(() => loadNotes(href))) });
  }
  return out;
}

async function loadNotes(href) {
  const { doc, url } = await getDoc(href);
  if (!/ListeEvalCVIR/i.test(new URL(url).pathname)) throw new Error('Session Léa expirée');

  // Bloc "SOMMAIRE POUR LE COURS" : libellé dans une cellule, valeur dans la suivante.
  const somm = [...doc.querySelectorAll('b')].find(b => /SOMMAIRE POUR LE COURS/i.test(b.textContent))?.closest('table');
  const cell = re => {
    const td = somm && [...somm.querySelectorAll('td')].find(td => re.test(td.textContent.trim()));
    return td?.nextElementSibling ? parts(td.nextElementSibling) : [];
  };
  const actuelle = cell(/^Note actuelle\s*:$/i);

  const categories = [];
  let current = null;
  for (const tr of doc.querySelectorAll('table.table-notes > tbody > tr')) {
    if (tr.classList.contains('tr-header-cat')) {
      const info = [...tr.querySelectorAll('table tr')]
        .map(r => [...r.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
      const get = re => info.find(([k]) => re.test(k ?? ''))?.[1] ?? '';
      categories.push(current = {
        nom: text(tr, 'b'),
        poids: pctOf(get(/^Poids/i)),
        moyenne: pctOf(get(/^Votre moy/i)),
        evaluations: [],
      });
    } else if (tr.querySelector(':scope > td.td-nombre')) {
      // Cellules : n° | titre + date | note + % | moyenne du groupe | poids + (points obtenus)
      const tds = [...tr.children];
      const [tTitre, tNote, tMoy, tPoids] = tds.slice(tds.findIndex(td => td.classList.contains('td-nombre')) + 1);
      if (!current) categories.push(current = { nom: '', poids: null, moyenne: null, evaluations: [] });
      current.evaluations.push({
        titre: text(tTitre, 'b'),
        date: parts(tTitre).slice(1).join(' '),
        note: text(tNote, 'b'),
        notePct: pctOf(parts(tNote).slice(1).join(' ')),
        moyGroupe: text(tMoy, 'b'),
        poids: pctOf(text(tPoids, 'b')),
        points: parts(tPoids).slice(1).join(' ').replace(/[()]/g, ''),
      });
    }
  }

  return {
    actuelle: {
      points: actuelle.find(p => p.includes('/')) ?? null,
      pct: pctOf(actuelle.find(p => p.includes('%'))),
    },
    groupe: {
      moyenne: pctOf(cell(/^Moyenne\s*:$/i)[0]),
      mediane: pctOf(cell(/^M[ée]diane\s*:$/i)[0]),
      ecartType: pctOf(cell(/^[ÉE]cart-type\s*:$/i)[0]),
    },
    categories: categories.filter(c => c.evaluations.length),
  };
}

function pctOf(s) {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(s ?? '');
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Morceaux de texte d'un élément : <b>41.5/50</b><br><font>83%</font> -> ["41.5/50", "83%"]
function parts(el) {
  if (!el) return [];
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.replace(/\s+/g, ' ').trim();
    if (s) out.push(s);
  }
  return out;
}

// ---------- Utilitaires ----------

// La note peut être "<span>33.5/40</span><br><span class="pourcentage">84%</span>" -> "33.5/40 (84%)".
function rightText(el) {
  if (!el) return '';
  const note = text(el, '.note-principale');
  const pct = text(el, '.pourcentage');
  if (note && pct) return `${note} (${pct})`;
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.replace(/\s+/g, ' ').trim();
    if (s) out.push(s);
  }
  return out.join(' ');
}

// "gr. 1001 - lun 08:10, jeu 15:10, Marie Tremblay" -> "Marie Tremblay"
const profOf = desc => desc
  .replace(/^gr\.\s*\d+\s*(-\s*)?/i, '')
  .replace(/\b\p{L}{3}\.?\s+\d{1,2}:\d{2}\s*,?\s*/gu, '')
  .trim();

const capitalize = s => {
  const low = s.toLocaleLowerCase('fr-CA');
  return low.charAt(0).toLocaleUpperCase('fr-CA') + low.slice(1);
};
