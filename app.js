import { h, icon, timeAgo } from './lib/dom.js';
import { INTR, SessionError } from './api/http.js';
import { fetchAccueil } from './api/accueil.js';
import { fetchCours, fetchDocuments, downloadDocument, fetchNotes } from './api/lea.js';
import { fetchMessages, fetchMessage, MIO_URL } from './api/mio.js';
import { readCache, writeCache } from './api/cache.js';

const SOURCES = {
  accueil: { label: 'Portail', load: fetchAccueil },
  cours: { label: 'Léa', load: fetchCours },
  mio: { label: 'MIO', load: fetchMessages },
  // Une requête par cours : chargé seulement quand la page Notes est ouverte (ou déjà chargé une fois).
  notes: { label: 'Notes', load: () => loadNotes(), lazy: true },
};

const CATEGORIES = { Cours: 'Cours', Lea: 'Léa', CalScolaire: 'Calendrier scolaire', Autre: 'Autre' };

const NAV = [
  { page: '', label: 'Accueil', icon: 'accueil' },
  { page: 'cours', label: 'Cours', icon: 'cours' },
  { page: 'notes', label: 'Notes', icon: 'notes' },
  { page: 'mio', label: 'MIO', icon: 'mio', badge: () => unreadCount() },
  { page: 'agenda', label: 'Agenda', icon: 'evenements' },
];

// Résolu depuis ce fichier : fonctionne dans l'extension comme dans l'aperçu local (dev/).
const LOGO = new URL('./icons/logo.svg', import.meta.url).href;

const TITLES = { '': 'Accueil', cours: 'Mes cours', notes: 'Mes notes', mio: 'Messagerie', agenda: 'Agenda' };

const state = {
  accueil: null,
  cours: null,
  mio: null,
  notes: null,
  at: {},
  errors: {},
  loading: new Set(),
  messages: new Map(),
  hiddenCats: new Set(),
  docs: new Map(),      // clé du cours -> { status: 'loading' | 'ok' | 'error', data, error }
  openDocs: new Set(),  // clés des cours dont la liste de documents est dépliée
  dl: new Map(),        // href du document -> 'loading' | 'done' | 'error'
  access: true,         // accès aux domaines Omnivox (Firefox permet de le refuser ou de le retirer)
};

const root = document.getElementById('app');

// ---------- Permissions ----------

const ORIGINS = ['https://cegepmontpetit.omnivox.ca/*', 'https://cegepmontpetit-lea.omnivox.ca/*'];

async function checkAccess() {
  try {
    state.access = await chrome.permissions.contains({ origins: ORIGINS });
  } catch {
    state.access = true; // API absente (aperçu local) : on suppose l'accès accordé
  }
  return state.access;
}

// Firefox exige que la demande parte directement du clic : aucun await avant permissions.request().
function requestAccess() {
  chrome.permissions.request({ origins: ORIGINS }).then(granted => {
    state.access = granted;
    render();
    if (granted) refreshAll();
  });
}

// ---------- Données ----------

const inflight = {};

function refresh(key) {
  inflight[key] ??= (async () => {
    state.loading.add(key);
    render();
    try {
      const data = await SOURCES[key].load();
      state[key] = data;
      state.at[key] = Date.now();
      delete state.errors[key];
      writeCache(key, data);
    } catch (err) {
      state.errors[key] = err;
      console.error(`[Omnivox+] ${key}`, err);
    } finally {
      state.loading.delete(key);
      render();
    }
  })().finally(() => { delete inflight[key]; });
  return inflight[key];
}

const refreshAll = () => (state.access
  ? Promise.all(Object.keys(SOURCES)
    .filter(k => !SOURCES[k].lazy || state[k] != null || route().page === k)
    .map(refresh))
  : Promise.resolve());

// Les liens de notes viennent de la liste des cours ; s'ils ont expiré, on la recharge une fois.
async function loadNotes() {
  if (!state.cours) await refresh('cours');
  if (!state.cours) throw state.errors.cours ?? new Error('Liste des cours indisponible');
  try {
    return await fetchNotes(state.cours);
  } catch {
    await refresh('cours');
    return fetchNotes(state.cours);
  }
}

const pendingMessages = new Set();

async function openMessage(id) {
  if (state.messages.has(id) || pendingMessages.has(id)) return;
  pendingMessages.add(id);
  try {
    state.messages.set(id, await fetchMessage(id));
    const m = state.mio?.find(x => x.id === id);
    if (m?.nonLu) {
      m.nonLu = false;
      writeCache('mio', state.mio);
    }
  } catch (err) {
    state.messages.set(id, err);
  } finally {
    pendingMessages.delete(id);
    render();
  }
}

const courseKey = c => `${c.code}|${c.desc}`;
const docsSection = c => c.sections.find(s => sectionKind(s.titre) === 'documents' && s.href);

function toggleDocs(c) {
  const key = courseKey(c);
  if (state.openDocs.has(key)) {
    state.openDocs.delete(key);
  } else {
    state.openDocs.add(key);
    if (state.docs.get(key)?.status !== 'ok') loadDocs(key);
  }
  render();
}

// Les liens Léa contiennent un jeton de session : s'il a expiré (données en cache), on recharge
// la liste des cours pour obtenir un lien frais, puis on réessaie une fois.
async function loadDocs(key) {
  state.docs.set(key, { status: 'loading' });
  render();
  const hrefOf = () => docsSection(state.cours?.find(c => courseKey(c) === key) ?? { sections: [] })?.href;
  try {
    let data;
    try {
      data = await fetchDocuments(hrefOf());
    } catch {
      await refresh('cours');
      data = await fetchDocuments(hrefOf());
    }
    state.docs.set(key, { status: 'ok', data });
  } catch (err) {
    console.error('[Omnivox+] documents', err);
    state.docs.set(key, { status: 'error', error: err });
  }
  render();
}

async function download(d) {
  state.dl.set(d.href, 'loading');
  render();
  try {
    const { blob, nom, extension } = await downloadDocument(d.href);
    saveBlob(blob, nom || `${d.titre}${extension}`);
    state.dl.set(d.href, 'done');
  } catch (err) {
    console.error('[Omnivox+] téléchargement', err);
    state.dl.set(d.href, 'error');
  }
  render();
}

async function downloadAll(files) {
  for (const d of files) await download(d);
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name.replace(/[\\/:*?"<>|]+/g, '_') });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------- Dérivés ----------

const unreadCount = () => state.mio?.filter(m => m.nonLu).length ?? 0;
const upcoming = () => state.accueil?.evenements.filter(e => !e.passe) ?? null;
const noteOf = c => c.sections.find(s => /note/i.test(s.titre))?.lignes[0]?.droite;

function pctOf(note) {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(note ?? '');
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// "33.5/40 (84%)" -> "33,5/40 · 84 %" ; "81.5%" -> "81,5 %"
function fmtNote(note) {
  const num = s => parseFloat(s.replace(',', '.')).toLocaleString('fr-CA', { maximumFractionDigits: 1 });
  const m = /^([\d.,]+)\s*\/\s*([\d.,]+)/.exec(note ?? '');
  const pct = pctOf(note);
  if (m) return pct != null ? `${num(m[1])}/${num(m[2])} · ${fmtPct(pct)}` : `${num(m[1])}/${num(m[2])}`;
  return pct != null ? fmtPct(pct) : note;
}

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const gradeClass = pct => (pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'low');
const fmtHeures = n => `${n.toLocaleString('fr-CA')} h`;
const fmtPct = n => `${n.toLocaleString('fr-CA', { maximumFractionDigits: 1 })} %`;

const hue = s => [...(s || '?')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 360;

function initials(name) {
  const parts = (name || '?').split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAY = 86_400_000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Les cartes d'évènements donnent "Vendredi 30 octobre" sans année : on prend l'année la plus proche.
function eventDate(e) {
  const m = MOIS.indexOf(e.mois.toLocaleLowerCase('fr-CA'));
  if (m < 0 || !e.jour) return null;
  const today = startOfToday();
  const d = new Date(today.getFullYear(), m, Number(e.jour));
  if (d - today > 180 * DAY) d.setFullYear(d.getFullYear() - 1);
  if (today - d > 180 * DAY) d.setFullYear(d.getFullYear() + 1);
  return d;
}

function relDay(e) {
  const d = eventDate(e);
  const diff = d ? Math.round((d - startOfToday()) / DAY) : null;
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  return null;
}

const shortDay = e => relDay(e) ?? `${e.jourSemaine.slice(0, 3).toLocaleLowerCase('fr-CA')} ${e.jour}`;
const splitHeure = e => (e.heure ? e.heure.split(/\s*à\s*/) : []);

function fmtMioDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T00:00`);
  const diff = Math.round((startOfToday() - d) / DAY);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

// ---------- Rendu ----------

function route() {
  const [, page = '', arg = ''] = location.hash.split('/');
  return { page, arg: decodeURIComponent(arg) };
}

let lastPage = null;
let lastAnchor = null;

function render() {
  const scroll = [...root.querySelectorAll('[data-scroll]')].map(el => [el.dataset.scroll, el.scrollTop]);
  const { page, arg } = route();
  const entering = page !== lastPage;
  if (entering) lastAnchor = null;
  lastPage = page;
  root.replaceChildren(
    sidebar(page),
    h('main', { class: 'main' },
      topbar(page),
      banner(),
      h('div', { class: entering ? 'view enter' : 'view' }, view(page, arg))),
  );
  for (const [key, top] of scroll) {
    const el = root.querySelector(`[data-scroll="${key}"]`);
    if (el) el.scrollTop = top;
  }
  // #/notes/201-SN2-RE : défile jusqu'au cours demandé (une seule fois).
  if (page === 'notes' && arg && arg !== lastAnchor) {
    const target = document.getElementById(`notes-${arg}`);
    if (target) {
      lastAnchor = arg;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function view(page, arg) {
  switch (page) {
    case 'cours': return viewCours();
    case 'notes': return viewNotes();
    case 'mio': return viewMio(arg);
    case 'agenda': return viewAgenda();
    default: return viewAccueil();
  }
}

function sidebar(page) {
  const user = state.accueil?.utilisateur;
  return h('nav', { class: 'sidebar', 'aria-label': 'Navigation principale' },
    h('a', { class: 'brand', href: '#/' }, h('img', { class: 'brand-logo', src: LOGO, alt: '' }), h('span', null, 'Omnivox', h('em', null, '+'))),
    h('ul', { class: 'nav' }, NAV.map(n => {
      const active = n.page === page;
      const badge = n.badge?.();
      return h('li', null, h('a', { href: `#/${n.page}`, class: active ? 'active' : null, 'aria-current': active ? 'page' : null },
        icon(n.icon), h('span', { class: 'nav-label' }, n.label), badge ? h('span', { class: 'badge' }, badge) : null));
    })),
    h('div', { class: 'sidebar-foot' },
      user ? h('div', { class: 'me' }, avatar(user), h('span', null, h('strong', null, user), h('small', null, 'Cégep Édouard-Montpetit'))) : null,
      h('a', { class: 'classic', href: `${INTR}/intr/`, target: '_blank', rel: 'noopener noreferrer' }, 'Omnivox classique', icon('externe'))));
}

function subtitle(page) {
  switch (page) {
    case 'cours': return state.cours ? `${state.cours.length} cours cette session` : '';
    case 'notes': return 'Détail des évaluations et comparaison avec ton groupe';
    case 'mio': return state.mio ? (unreadCount() ? plural(unreadCount(), 'message non lu', 'messages non lus') : 'Tout est lu') : '';
    case 'agenda': return upcoming() ? plural(upcoming().length, 'évènement à venir', 'évènements à venir') : '';
    default: {
      const d = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
      return d.charAt(0).toLocaleUpperCase('fr-CA') + d.slice(1);
    }
  }
}

function topbar(page) {
  const busy = state.loading.size > 0;
  const times = Object.values(state.at);
  const status = busy ? 'Synchronisation…' : times.length ? `Synchronisé ${timeAgo(Math.min(...times))}` : '';
  return h('header', { class: 'topbar' },
    h('div', null,
      h('h1', null, page === '' && state.accueil?.utilisateur ? `Bonjour ${state.accueil.utilisateur.split(' ')[0]}` : TITLES[page] ?? 'Omnivox+'),
      h('p', { class: 'subtitle' }, subtitle(page))),
    h('div', { class: 'status' },
      h('span', null, status),
      h('button', {
        class: `icon-btn ghost${busy ? ' spinning' : ''}`, onclick: refreshAll, disabled: busy,
        title: 'Actualiser', 'aria-label': 'Actualiser',
      }, icon('actualiser'))));
}

function banner() {
  if (!state.access) {
    return h('div', { class: 'banner warn', role: 'status' },
      h('div', null,
        h('strong', null, 'Accès à Omnivox requis'),
        h('p', null, 'Omnivox+ a besoin de ta permission pour lire les pages d’Omnivox et de Léa. Aucune autre donnée n’est consultée.')),
      h('button', { class: 'btn primary', onclick: requestAccess }, 'Autoriser l’accès'));
  }
  const errs = Object.entries(state.errors);
  if (!errs.length) return null;
  const labels = errs.map(([k]) => SOURCES[k].label).join(', ');
  if (errs.some(([, e]) => e instanceof SessionError)) {
    return h('div', { class: 'banner warn', role: 'status' },
      h('div', null,
        h('strong', null, 'Session Omnivox inactive'),
        h('p', null, `Impossible de lire ${labels}. Connecte-toi dans Omnivox, puis reviens ici : tout se mettra à jour automatiquement.`)),
      h('button', { class: 'btn primary', onclick: () => chrome.tabs.create({ url: `${INTR}/intr/` }) }, 'Se connecter'));
  }
  return h('div', { class: 'banner error', role: 'alert' },
    h('div', null,
      h('strong', null, `Impossible de charger : ${labels}`),
      h('p', null, errs[0][1].message)),
    h('button', { class: 'btn', onclick: () => errs.forEach(([k]) => refresh(k)) }, 'Réessayer'));
}

function placeholder(key, rows = 3) {
  if (!state.loading.has(key)) return h('p', { class: 'empty' }, 'Données indisponibles pour le moment.');
  return h('div', { class: 'skeletons', 'aria-busy': 'true', 'aria-label': 'Chargement' },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton' })));
}

function panel(title, more, data, key, emptyText, renderList) {
  const body = data == null ? placeholder(key)
    : !data.length ? h('p', { class: 'empty' }, emptyText)
    : renderList(data);
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', null, title),
      h('a', { href: more, class: 'more' }, 'Tout voir', icon('fleche'))),
    body);
}

const avatar = (name, cls = '') => h('span', { class: `avatar ${cls}`, style: { '--hue': hue(name) }, 'aria-hidden': 'true' }, initials(name));

function gradeBar(note, compact = false) {
  const pct = pctOf(note);
  return h('div', { class: `grade${compact ? ' compact' : ''}` },
    compact ? null : h('div', { class: 'grade-top' }, h('span', null, 'Note actuelle'), h('strong', null, fmtNote(note))),
    pct != null
      ? h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `Note ${note}` },
          h('span', { class: `bar-fill ${gradeClass(pct)}`, style: { '--pct': `${Math.min(pct, 100)}%` } }))
      : null);
}

// ---------- Accueil ----------

function viewAccueil() {
  const next = upcoming()?.[0];
  return h('div', { class: 'stack' },
    stats(next),
    h('div', { class: 'grid-dash' },
      panel('À venir', '#/agenda', upcoming()?.slice(0, 6), 'accueil', 'Rien à l’horaire.',
        list => h('ul', { class: 'events' }, list.map(e => eventItem(e)))),
      panel('Messages récents', '#/mio', state.mio?.slice(0, 5), 'mio', 'Aucun message.',
        list => h('ul', { class: 'mio-items' }, list.map(m => mioItem(m, false, true)))),
      panel('Mes cours', '#/cours', state.cours, 'cours', 'Aucun cours.',
        list => h('ul', { class: 'cours-mini' }, list.map(coursMini)))));
}

function stats(next) {
  const pcts = (state.cours ?? []).map(c => pctOf(noteOf(c))).filter(p => p != null);
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const abs = state.cours?.some(c => c.absences) ? state.cours.reduce((s, c) => s + (c.absences?.total ?? 0), 0) : null;
  const unread = state.mio ? unreadCount() : null;
  const [debut] = next ? splitHeure(next) : [];
  const pending = key => state[key] == null && state.loading.has(key);
  return h('div', { class: 'stats' },
    stat({
      cls: 'stat-next', kind: 'evenements', href: '#/agenda', label: 'Prochain', pending: pending('accueil'),
      value: next ? next.titre : '—',
      sub: next ? [shortDay(next), debut, next.local].filter(Boolean).join(' · ') : 'Rien à l’horaire',
    }),
    stat({ kind: 'mio', href: '#/mio', label: 'MIO non lus', pending: pending('mio'), value: unread ?? '—', sub: unread ? 'à lire' : 'Tout est lu' }),
    stat({ kind: 'notes', href: '#/notes', label: 'Moyenne', pending: pending('cours'), value: avg != null ? fmtPct(avg) : '—', sub: pcts.length ? `sur ${pcts.length} cours notés` : 'Aucune note' }),
    stat({ kind: 'absences', href: '#/cours', label: 'Absences', pending: pending('cours'), value: abs != null ? fmtHeures(abs) : '—', sub: 'cette session' }));
}

const stat = ({ cls = '', kind, href, label, value, sub, pending }) =>
  h('a', { class: `stat k-${kind} ${cls}`, href, 'aria-busy': pending ? 'true' : null },
    h('span', { class: 'stat-head' }, h('span', { class: 'stat-icon' }, icon(kind)), h('span', { class: 'stat-label' }, label)),
    pending ? h('span', { class: 'skeleton stat-skel' }) : h('strong', { class: 'stat-value' }, value),
    pending ? h('span', { class: 'skeleton stat-skel sub' }) : h('span', { class: 'stat-sub' }, sub));

function coursMini(c) {
  const note = noteOf(c);
  return h('li', { style: { '--hue': hue(c.code) } },
    h('span', { class: 'dot-hue', 'aria-hidden': 'true' }),
    h('span', { class: 'cm-text' }, h('strong', null, c.nom), c.prof ? h('small', null, c.prof) : null),
    h('span', { class: 'cm-grade' },
      h('span', { class: 'cm-note' }, pctOf(note) != null ? fmtPct(pctOf(note)) : note && note !== '-' ? note : '—'),
      pctOf(note) != null ? gradeBar(note, true) : null));
}

function eventItem(e, { withDay = true } = {}) {
  const [debut, fin] = splitHeure(e);
  return h('li', { class: `event cat-${e.categorie}` },
    h('div', { class: 'event-when' },
      withDay ? h('span', { class: 'event-day' }, shortDay(e)) : null,
      h('strong', null, debut ?? 'Journée'),
      fin ? h('small', null, fin) : null),
    h('div', { class: 'event-body' },
      h('span', { class: 'event-type' }, e.type || CATEGORIES[e.categorie] || ''),
      h('strong', { class: 'event-title' }, e.titre),
      e.local ? h('span', { class: 'event-meta' }, icon('lieu'), e.local) : null));
}

// ---------- Cours ----------

const SECTION_KINDS = [
  [/document|vid[ée]o/i, 'documents'],
  [/travau/i, 'travaux'],
  [/note/i, 'notes'],
  [/retard|absence/i, 'absences'],
  [/communiq/i, 'communiques'],
  [/v[eè]nement/i, 'evenements'],
  [/forum/i, 'forum'],
];

const sectionKind = titre => SECTION_KINDS.find(([re]) => re.test(titre))?.[1] ?? 'lien';

// Ajoute les heures d'absence à la section "Retards et absences", ou crée cette section
// (juste après les notes) pour les cours où Léa ne l'affiche pas.
function sectionsOf(c) {
  if (!c.absences) return c.sections;
  const lignes = [
    { gauche: 'Total', droite: fmtHeures(c.absences.total) },
    ...c.absences.details.map(d => ({ gauche: d.date, droite: fmtHeures(d.heures) })),
  ];
  const sections = c.sections.map(s => (sectionKind(s.titre) === 'absences' ? { ...s, lignes } : s));
  if (!sections.some(s => sectionKind(s.titre) === 'absences')) {
    const apresNotes = sections.findIndex(s => sectionKind(s.titre) === 'notes') + 1 || sections.length;
    sections.splice(apresNotes, 0, { titre: 'Retards et absences', href: null, lignes });
  }
  return sections;
}

// "gr. 1001 - lun 08:10, jeu 15:10, Marie Tremblay" -> ["gr. 1001", "lun 08:10", "jeu 15:10"]
const horaireOf = desc => [
  ...(/gr\.\s*\d+/i.exec(desc) ?? []),
  ...(desc.match(/\p{L}{3}\.?\s+\d{1,2}:\d{2}/gu) ?? []),
];

function viewCours() {
  if (!state.cours) return h('div', { class: 'grid-cours' }, placeholder('cours', 4));
  return h('div', { class: 'grid-cours' }, state.cours.map(courseCard));
}

function courseCard(c) {
  const note = noteOf(c);
  return h('article', { class: 'course', style: { '--hue': hue(c.code) } },
    h('header', { class: 'course-head' },
      h('span', { class: 'code' }, c.code),
      h('h2', null, c.nom),
      c.prof ? h('p', { class: 'course-prof' }, c.prof) : null,
      h('div', { class: 'pills' }, horaireOf(c.desc).map(t => h('span', { class: 'pill' }, t))),
      note && note !== '-'
        ? h('a', { class: 'grade-link', href: `#/notes/${c.code}`, title: 'Voir le détail des notes' }, gradeBar(note))
        : null),
    h('ul', { class: 'sections' }, sectionsOf(c).map(s => {
      const kind = sectionKind(s.titre);
      const lignes = kind === 'notes' ? [] : s.lignes; // la note est déjà dans l'en-tête
      if (kind === 'forum' || (!s.href && !lignes.length)) return null;
      return h('li', { class: `k-${kind}` },
        h('span', { class: 'section-icon' }, icon(kind)),
        h('div', { class: 'section-body' },
          s.href
            ? h('a', { href: s.href, target: '_blank', rel: 'noopener noreferrer', class: 'section-title', title: 'Ouvrir dans Léa' },
                s.titre, icon('externe'))
            : h('span', { class: 'section-title' }, s.titre),
          lignes.map(l => h('span', { class: 'ligne' }, h('span', null, l.gauche), l.droite ? h('b', null, l.droite) : null)),
          kind === 'documents' && s.href && s.lignes[0]?.droite !== '0' ? documentsBlock(c) : null));
    })));
}

function documentsBlock(c) {
  const key = courseKey(c);
  const open = state.openDocs.has(key);
  const toggle = h('button', { class: `btn small${open ? ' open' : ''}`, 'aria-expanded': String(open), onclick: () => toggleDocs(c) },
    open ? 'Masquer les documents' : 'Afficher les documents', icon('chevron'));
  if (!open) return toggle;

  const entry = state.docs.get(key);
  let body;
  if (!entry || entry.status === 'loading') {
    body = h('div', { class: 'skeletons' }, h('div', { class: 'skeleton thin' }), h('div', { class: 'skeleton thin' }));
  } else if (entry.status === 'error') {
    body = h('p', { class: 'error-text' }, `Impossible de charger les documents : ${entry.error.message}. `,
      h('button', { class: 'linklike', onclick: () => loadDocs(key) }, 'Réessayer'));
  } else if (!entry.data.length) {
    body = h('p', { class: 'empty small' }, 'Aucun document.');
  } else {
    const files = entry.data.flatMap(cat => cat.documents).filter(d => !d.lien);
    body = h('div', { class: 'docs' },
      files.length > 1
        ? h('button', { class: 'btn small accent', onclick: () => downloadAll(files) }, icon('telecharger'), `Tout télécharger (${files.length})`)
        : null,
      entry.data.map(cat => h('div', { class: 'doc-cat' },
        cat.categorie ? h('h3', null, cat.categorie) : null,
        h('ul', null, cat.documents.map(docItem)))));
  }
  return [toggle, body];
}

function docItem(d) {
  const dl = state.dl.get(d.href);
  const action = d.lien
    ? h('a', { class: 'icon-btn', href: d.href, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir le lien', 'aria-label': `Ouvrir ${d.titre}` },
        icon('externe'))
    : h('button', {
        class: `icon-btn${dl ? ` dl-${dl}` : ''}`,
        title: dl === 'error' ? 'Échec, réessayer' : 'Télécharger',
        'aria-label': `Télécharger ${d.titre}`,
        disabled: dl === 'loading',
        onclick: () => download(d),
      }, icon(dl === 'done' ? 'ok' : dl === 'error' ? 'erreur' : 'telecharger'));
  return h('li', { class: 'doc' },
    h('span', { class: 'doc-info' },
      h('span', { class: 'doc-title' }, d.titre, d.nouveau ? h('span', { class: 'tag' }, 'Nouveau') : null),
      d.description || d.date ? h('small', null, [d.description, d.date].filter(Boolean).join(' · ')) : null),
    action);
}

// ---------- Notes ----------

const fmtNum = n => n.toLocaleString('fr-CA', { maximumFractionDigits: 2 });

// "41.5/50" -> "41,5/50"
const fmtRatio = s => s.replace(/\d+(?:\.\d+)?/g, x => fmtNum(parseFloat(x)));

function ratioPct(s) {
  const m = /^([\d.,]+)\s*\/\s*([\d.,]+)$/.exec(s ?? '');
  if (!m) return null;
  const den = parseFloat(m[2].replace(',', '.'));
  return den ? (parseFloat(m[1].replace(',', '.')) / den) * 100 : null;
}

function viewNotes() {
  if (!state.notes) return h('div', { class: 'stack' }, placeholder('notes', 3));
  if (!state.notes.length) return h('p', { class: 'empty' }, 'Aucune note publiée pour l’instant.');
  return h('div', { class: 'grid-notes' }, state.notes.map(notesCard));
}

function notesCard(n) {
  const pct = n.actuelle.pct;
  const g = n.groupe;
  const delta = pct != null && g.moyenne != null ? pct - g.moyenne : null;
  return h('article', { class: 'notes-card', id: `notes-${n.code}`, style: { '--hue': hue(n.code) } },
    h('header', { class: 'notes-head' },
      h('div', { class: 'notes-title' },
        h('span', { class: 'code' }, n.code),
        h('h2', null, n.nom),
        n.prof ? h('p', { class: 'course-prof' }, n.prof) : null),
      h('div', { class: 'notes-score' },
        h('strong', { class: pct != null ? `score ${gradeClass(pct)}` : 'score' }, pct != null ? fmtPct(pct) : '—'),
        h('small', null, n.actuelle.points ? `${fmtRatio(n.actuelle.points)} pts accumulés` : 'Aucune note encore'))),
    pct != null && g.moyenne != null ? compareBar(pct, g.moyenne) : null,
    g.moyenne != null
      ? h('div', { class: 'notes-stats' },
          miniStat('Moyenne du groupe', fmtPct(g.moyenne)),
          g.mediane != null ? miniStat('Médiane', fmtPct(g.mediane)) : null,
          g.ecartType != null ? miniStat('Écart-type', fmtPct(g.ecartType)) : null,
          delta != null
            ? h('span', { class: `delta ${delta >= 0 ? 'up' : 'down'}` }, `${delta >= 0 ? '+' : '−'}${fmtNum(Math.round(Math.abs(delta) * 10) / 10)} pts vs groupe`)
            : null)
      : null,
    h('div', { class: 'notes-cats' }, n.categories.map(cat => h('section', { class: 'notes-cat' },
      cat.nom
        ? h('div', { class: 'cat-head' },
            h('h3', null, cat.nom),
            h('span', { class: 'cat-meta' }, [
              cat.poids != null ? `${fmtPct(cat.poids)} de la note finale` : null,
              cat.moyenne != null ? `ta moyenne ${fmtPct(cat.moyenne)}` : null,
            ].filter(Boolean).join(' · ')))
        : null,
      h('ul', { class: 'evals' }, cat.evaluations.map(evalRow))))));
}

const miniStat = (label, value) => h('span', { class: 'mini-stat' }, h('small', null, label), h('strong', null, value));

function compareBar(pct, moyenne) {
  return h('div', { class: 'compare' },
    h('div', { class: 'compare-track' },
      h('span', { class: `compare-fill ${gradeClass(pct)}`, style: { '--pct': `${Math.min(pct, 100)}%` } }),
      h('span', { class: 'compare-mark', style: { '--pct': `${Math.min(moyenne, 100)}%` }, title: `Moyenne du groupe : ${fmtPct(moyenne)}` })),
    h('div', { class: 'compare-legend' },
      h('span', null, h('i', { class: `lg-you ${gradeClass(pct)}` }), 'Toi'),
      h('span', null, h('i', { class: 'lg-group' }), 'Moyenne du groupe')));
}

function evalRow(e) {
  const done = e.notePct != null;
  const groupe = ratioPct(e.moyGroupe);
  return h('li', { class: `eval${done ? '' : ' pending'}` },
    h('div', { class: 'eval-main' },
      h('strong', null, e.titre),
      h('small', null, [e.date, e.poids != null ? `${fmtPct(e.poids)} de la note` : null].filter(Boolean).join(' · '))),
    h('div', { class: 'eval-group' }, groupe != null ? [h('small', null, 'Groupe'), h('span', null, fmtPct(Math.round(groupe * 10) / 10))] : null),
    h('div', { class: 'eval-score' }, done
      ? [h('span', { class: `pill-score ${gradeClass(e.notePct)}` }, fmtPct(e.notePct)), h('small', null, fmtRatio(e.note))]
      : h('span', { class: 'pill-score none' }, 'À venir')));
}

// ---------- MIO ----------

function mioItem(m, selected, compact = false) {
  return h('li', null,
    h('a', { href: `#/mio/${m.id}`, class: ['mio-item', m.nonLu && 'unread', selected && 'selected'].filter(Boolean).join(' ') },
      avatar(m.de),
      h('span', { class: 'mio-text' },
        h('span', { class: 'row1' }, h('span', { class: 'from' }, m.de), h('span', { class: 'date' }, fmtMioDate(m.date))),
        h('span', { class: 'subject' }, m.pieceJointe ? icon('trombone') : null, m.sujet),
        !compact && m.apercu ? h('span', { class: 'preview' }, m.apercu) : null)));
}

function viewMio(id) {
  if (!state.mio) return h('div', { class: 'panel' }, placeholder('mio', 6));
  if (id) openMessage(id);
  return h('div', { class: `mio${id ? ' reading' : ''}` },
    h('ul', { class: 'mio-list mio-items', 'data-scroll': 'mio' }, state.mio.map(m => mioItem(m, m.id === id))),
    h('section', { class: 'reader', 'data-scroll': 'reader' }, reader(id)));
}

function reader(id) {
  if (!id) {
    return h('div', { class: 'reader-empty' }, h('span', { class: 'reader-empty-icon' }, icon('mio')), h('p', null, 'Choisis un message pour le lire.'));
  }
  const m = state.messages.get(id);
  if (m instanceof Error) return h('div', { class: 'banner error' }, h('p', null, `Impossible d’ouvrir ce message : ${m.message}`));
  if (!m) {
    return h('div', { class: 'skeletons' }, h('div', { class: 'skeleton title' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton tall' }));
  }
  return h('article', { class: 'message' },
    h('a', { href: '#/mio', class: 'back' }, icon('retour'), 'Messages'),
    h('h2', null, m.sujet),
    h('div', { class: 'message-head' },
      avatar(m.de, 'lg'),
      h('div', null,
        h('strong', null, m.de),
        m.a ? h('small', null, `À : ${m.a}`) : null,
        h('small', null, m.date))),
    m.piecesJointes.length
      ? h('ul', { class: 'attach' }, m.piecesJointes.map(p => h('li', null,
          h('a', { href: p.href, target: '_blank', rel: 'noopener noreferrer' }, icon('trombone'), p.nom))))
      : null,
    h('div', { class: 'body' }, m.corps.cloneNode(true)),
    h('div', { class: 'message-actions' },
      h('a', { class: 'btn', href: MIO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Répondre dans Omnivox', icon('externe'))));
}

// ---------- Agenda ----------

function viewAgenda() {
  const evs = upcoming();
  if (!evs) return h('div', { class: 'panel' }, placeholder('accueil', 5));
  const cats = [...new Set(evs.map(e => e.categorie))];
  const days = new Map();
  for (const e of evs.filter(e => !state.hiddenCats.has(e.categorie))) {
    const key = `${e.jourSemaine} ${e.jour} ${e.mois}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(e);
  }
  return h('div', { class: 'stack' },
    cats.length > 1
      ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer par catégorie' }, cats.map(c => {
          const on = !state.hiddenCats.has(c);
          return h('button', {
            class: `chip cat-${c}`, 'aria-pressed': String(on),
            onclick: () => { on ? state.hiddenCats.add(c) : state.hiddenCats.delete(c); render(); },
          }, h('span', { class: 'chip-dot' }), CATEGORIES[c] ?? c);
        }))
      : null,
    days.size
      ? [...days].map(([, list]) => {
          const e = list[0];
          const rel = relDay(e);
          return h('section', { class: `day${rel === 'Aujourd’hui' ? ' today' : ''}` },
            h('h2', { class: 'day-head' },
              h('span', { class: 'day-num' }, e.jour),
              h('span', null, h('strong', null, rel ?? e.jourSemaine), h('small', null, rel ? `${e.jourSemaine} ${e.jour} ${e.mois}` : e.mois))),
            h('ul', { class: 'events' }, list.map(ev => eventItem(ev, { withDay: false }))));
        })
      : h('p', { class: 'empty' }, 'Aucun évènement à venir.'));
}

// ---------- Démarrage ----------

async function init() {
  for (const key of Object.keys(SOURCES)) {
    const cached = await readCache(key);
    if (cached) {
      state[key] = cached.data;
      state.at[key] = cached.at;
    }
  }
  if (location.hash === '#/actualites') location.hash = '#/';
  await checkAccess();
  render();
  refreshAll();
}

window.addEventListener('hashchange', () => {
  if (state.access && route().page === 'notes' && state.notes == null && !inflight.notes) refresh('notes');
  render();
});
// Retour sur l'onglet (connexion à Omnivox, permission accordée ailleurs) : on réessaie ce qui a échoué.
window.addEventListener('focus', async () => {
  if (!state.access) {
    if (await checkAccess()) {
      render();
      refreshAll();
    }
    return;
  }
  Object.keys(state.errors).forEach(refresh);
});
setInterval(() => {
  if (document.visibilityState === 'visible') refreshAll();
}, 10 * 60 * 1000);

init();
