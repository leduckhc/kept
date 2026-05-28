import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const repoRoot = resolve(new URL('../../..', import.meta.url).pathname);
const desktopRoot = join(repoRoot, 'apps/desktop');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function resolveRequest(url) {
  const requested = url === '/' ? '/apps/desktop/index.html' : url.split('?')[0];
  if (requested === '/favicon.svg') return normalize(join(desktopRoot, 'favicon.svg'));
  if (requested.startsWith('/src/')) return normalize(join(desktopRoot, requested));
  return normalize(join(repoRoot, requested));
}

const server = createServer(async (req, res) => {
  const file = resolveRequest(req.url || '/');
  if (!file.startsWith(repoRoot)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, () => console.log(`Kept desktop preview: http://127.0.0.1:${port}`));
