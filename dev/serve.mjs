// Mini-serveur statique pour l'aperçu : node dev/serve.mjs puis http://localhost:8765/dev/preview.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) return res.writeHead(403).end();
  try {
    const body = await readFile(join(ROOT, path || 'dev/preview.html'));
    res.writeHead(200, { 'content-type': `${TYPES[extname(path)] ?? 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('introuvable');
  }
}).listen(8765, '127.0.0.1', () => console.log('Aperçu : http://localhost:8765/dev/preview.html'));
