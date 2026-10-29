// Outils DOM. Tout le contenu venant d'Omnivox est inséré en texte (textContent),
// sauf le corps des MIO qui passe par sanitize() : liste blanche de balises, aucun attribut conservé
// à part href (http/https/mailto) sur les liens.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    // Via CSSOM : la politique de sécurité de l'extension interdit les attributs style="" en ligne.
    else if (k === 'style') for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop, val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter(c => c != null && c !== false)
    .map(c => (c instanceof Node ? c : String(c))));
  return el;
}

// Icônes SVG en ligne (trait 24×24, couleur héritée via currentColor).
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  documents: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  travaux: ['M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'm9 14 2 2 4-4'],
  notes: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  absences: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  communiques: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  evenements: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 10h18'],
  forum: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M8 9h8', 'M8 13h5'],
  lien: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  externe: ['M7 17 17 7', 'M7 7h10v10'],
  accueil: ['m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  cours: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  mio: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 6-10 7L2 6'],
  actualiser: ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5'],
  lieu: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  trombone: ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  retour: ['M19 12H5', 'm12 19-7-7 7-7'],
  fleche: ['M5 12h14', 'm12 5 7 7-7 7'],
  chevron: ['m6 9 6 6 6-6'],
  telecharger: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  ok: ['M20 6 9 17l-5-5'],
  erreur: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 8v4', 'M12 16h.01'],
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? ICONS.lien) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const KEEP = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'div', 'span',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'code', 'hr', 'small', 'sub', 'sup']);
const RENAME = { font: 'span', center: 'div' };
const DROP = new Set(['script', 'style', 'iframe', 'frame', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'img', 'video', 'audio', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta']);

export function sanitize(root, base) {
  const out = document.createDocumentFragment();
  const walk = (src, dst) => {
    for (const n of src.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) { dst.append(n.textContent); continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = n.localName;
      if (DROP.has(tag)) continue;
      if (!KEEP.has(tag) && !RENAME[tag]) { walk(n, dst); continue; }
      const el = document.createElement(RENAME[tag] ?? tag);
      if (tag === 'a') {
        const href = safeHref(n.getAttribute('href'), base);
        if (href) {
          el.href = href;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        }
      }
      walk(n, el);
      dst.append(el);
    }
  };
  walk(root, out);
  return out;
}

function safeHref(href, base) {
  try {
    const u = new URL(href, base);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const hrs = Math.round(min / 60);
  return hrs < 24 ? `il y a ${hrs} h` : `il y a ${Math.round(hrs / 24)} j`;
}
