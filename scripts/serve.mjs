// A zero-dependency static server for `examples/`, on port 3000.
//
// 3000 is not arbitrary: a publishable key is accepted only from the origins
// it lists, and the seeded staging key lists `http://localhost:3000`. The
// built bundle is served at `/widgets/v1.js` from `packages/widgets/dist` so
// the example page can use the same path shape the CDN will.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = resolve(import.meta.dirname, '..');
const EXAMPLES = join(ROOT, 'examples');
const DIST = join(ROOT, 'packages', 'widgets', 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

function fileFor(url) {
  const path = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (path.startsWith('/widgets/')) return join(DIST, normalize(path.slice('/widgets/'.length)));
  const rel = path === '/' ? '/plain-html/index.html' : path;
  return join(EXAMPLES, normalize(rel));
}

createServer(async (req, res) => {
  let file = fileFor(req.url ?? '/');
  if (!file.startsWith(EXAMPLES) && !file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`not found: ${req.url}`);
  }
}).listen(PORT, () => {
  console.log(`examples at http://localhost:${PORT}/  (bundle at /widgets/v1.js)`);
});
