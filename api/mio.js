// MIO : liste des messages reçus et lecture d'un message.
// Ouvrir un message dans Omnivox+ le marque comme lu, exactement comme dans Omnivox.

import { ensureMio } from './session.js';
import { INTR, PARAMS, getDoc, isLoginPage, text, abs, SessionError } from './http.js';
import { sanitize } from '../lib/dom.js';

const BASE = `${INTR}/WebApplication/Module.MIOE/Commun/Message`;
export const MIO_URL = `${INTR}/intr/Module/ServicesExterne/RedirigeMio.ashx`;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mioDoc(path) {
  await ensureMio();
  let page = await getDoc(`${BASE}/${path}`);
  if (isLoginPage(page)) {
    await ensureMio({ force: true });
    page = await getDoc(`${BASE}/${path}`);
    if (isLoginPage(page)) throw new SessionError('MIO');
  }
  return page;
}

export async function fetchMessages() {
  const { doc } = await mioDoc(`MioListe.aspx?NomCategorie=SEARCH_FOLDER_MioRecu&${PARAMS}`);
  return [...doc.querySelectorAll('#lstMIO tr[id^="tr"]')]
    .map(tr => {
      // .lsTdTitle = <div><em>sujet</em> début du message…</div>
      const titre = tr.querySelector('.lsTdTitle')?.cloneNode(true);
      const sujet = text(titre, 'em');
      titre?.querySelectorAll('em').forEach(e => e.remove());
      return {
        id: tr.querySelector('[data-message]')?.getAttribute('data-message') ?? '',
        de: text(tr, '.name'),
        sujet,
        apercu: titre?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        date: text(tr, '.date'),
        categorie: text(tr, '.categorie'),
        pieceJointe: !!tr.querySelector('.fileSize'),
        nonLu: /non\s*lu/i.test(tr.querySelector('.stateIcon title')?.textContent ?? ''),
      };
    })
    .filter(m => GUID.test(m.id));
}

export async function fetchMessage(id) {
  if (!GUID.test(id)) throw new Error('Identifiant de message invalide');
  const { doc, url } = await mioDoc(`MioDetail.aspx?m=${id}&${PARAMS}`);
  const corps = doc.querySelector('#contenuWrapper');
  return {
    id,
    de: text(doc, '.cDe'),
    a: text(doc, '.cA'),
    date: text(doc, '.cDate'),
    sujet: text(doc, '.cSujet'),
    corps: corps ? sanitize(corps, url) : document.createDocumentFragment(),
    piecesJointes: [...doc.querySelectorAll('.cAttach a')]
      .map(a => ({ nom: a.textContent.replace(/\s+/g, ' ').trim() || 'Pièce jointe', href: abs(a.getAttribute('href'), url) }))
      .filter(p => p.href),
  };
}
