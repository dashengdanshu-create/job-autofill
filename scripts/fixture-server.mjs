/**
 * Static file server for the E2E fixtures.
 *
 * The fixtures are served over http:// rather than opened as file:// because
 * Chrome only injects content scripts into file:// URLs when the user ticks
 * "Allow access to file URLs", which cannot be set from the command line.
 * Serving over http also matches how real recruitment sites are loaded.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tests/fixtures');
const port = Number(process.env.FIXTURE_PORT ?? 5177);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  // normalize + prefix check keeps a crafted path from escaping the directory
  const target = resolve(fixturesDir, `.${normalize(url.pathname)}`);
  if (!target.startsWith(fixturesDir)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`[fixtures] http://localhost:${port}`);
});
