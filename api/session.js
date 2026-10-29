// Gestion des sessions : Omnivox (portail), MIO et Léa (autre sous-domaine, SSO par jeton "lk").
// Aucun identifiant n'est manipulé : on réutilise la session déjà ouverte dans Chrome.

import { INTR, LEA, getDoc, isLoginPage, SessionError } from './http.js';

const LEA_HOME = `${LEA}/cvir/doce/Default.aspx`;

export async function intrHome() {
  const page = await getDoc(`${INTR}/intr/`);
  if (isLoginPage(page)) throw new SessionError('Omnivox');
  return page;
}

let mioReady = null;

export function ensureMio({ force = false } = {}) {
  if (force) mioReady = null;
  mioReady ??= fetch(`${INTR}/intr/Module/ServicesExterne/RedirigeMio.ashx`, { credentials: 'include' })
    .then(res => {
      if (/login|identification/i.test(new URL(res.url).pathname)) throw new SessionError('Omnivox');
    })
    .catch(err => {
      mioReady = null;
      throw err;
    });
  return mioReady;
}

const isLeaHome = page => !!page.doc.querySelector('.classes-wrapper');

let leaPending = null;

export function leaHome() {
  leaPending ??= loadLeaHome().finally(() => { leaPending = null; });
  return leaPending;
}

async function loadLeaHome() {
  let page = await getDoc(LEA_HOME);
  if (isLeaHome(page)) return page;

  // 1er essai : suivre le lien SSO par fetch (redirections HTTP).
  try {
    await fetch(await leaSsoLink(), { credentials: 'include' });
  } catch { /* on tente l'onglet en arrière-plan */ }
  page = await getDoc(LEA_HOME);
  if (isLeaHome(page)) return page;

  // 2e essai : ouvrir le lien SSO dans un onglet invisible, puis le refermer.
  await openInBackgroundTab(await leaSsoLink(), LEA);
  page = await getDoc(LEA_HOME);
  if (isLeaHome(page)) return page;

  throw new SessionError('Léa');
}

// Le jeton "lk" change à chaque chargement du portail : on relit toujours une page fraîche.
async function leaSsoLink() {
  const { doc, url } = await intrHome();
  const a = [...doc.querySelectorAll('a[href*="Skytech.aspx"]')]
    .find(a => /^\s*L[ée]a\s*$/i.test(a.textContent));
  if (!a) throw new Error('Lien Léa introuvable sur le portail Omnivox');
  return new URL(a.getAttribute('href'), url).href;
}

function openInBackgroundTab(url, origin, timeout = 20000) {
  return new Promise(resolve => {
    let tabId = null;
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
      resolve();
    };
    const onUpdated = (id, info, tab) => {
      if (id === tabId && info.status === 'complete' && tab.url?.startsWith(origin)) done();
    };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.create({ url, active: false }).then(tab => { tabId = tab.id; }, done);
  });
}
