// Couche HTTP : télécharge une page Omnivox et la transforme en Document (jamais affiché).

export const INTR = 'https://cegepmontpetit.omnivox.ca';
export const LEA = 'https://cegepmontpetit-lea.omnivox.ca';
export const PARAMS = 'C=EDM&E=P&L=FRA';

export class SessionError extends Error {
  constructor(service) {
    super(`Session ${service} expirée ou absente`);
    this.service = service;
  }
}

export async function getDoc(url) {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${new URL(url).pathname}`);
  const html = decode(await res.arrayBuffer(), res.headers.get('content-type'));
  return { doc: new DOMParser().parseFromString(html, 'text/html'), url: res.url };
}

// Omnivox mélange UTF-8 et windows-1252 : on respecte le charset annoncé.
function decode(buf, contentType) {
  let charset = /charset=([\w-]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = new TextDecoder('windows-1252').decode(buf.slice(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export function isLoginPage({ doc, url }) {
  return /login|identification|authentification/i.test(new URL(url).pathname)
    || !!doc.querySelector('input[type="password"]');
}

export const text = (root, sel) =>
  root?.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? '';

// URL absolue http(s) seulement ; rejette javascript:, data:, et les liens cassés d'Omnivox (".../undefined").
export function abs(href, base) {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return /^https?:$/.test(u.protocol) && !u.pathname.endsWith('/undefined') ? u.href : null;
  } catch {
    return null;
  }
}
