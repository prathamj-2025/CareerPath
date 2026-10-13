/* Local harness that mimics Vercel: serves public/ and routes /api/ask to api/ask.js.
   Only used for testing in this container. `vercel dev` does the same thing properly. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import handler from '../api/ask.js';

const PORT = Number(process.env.PORT || 3111);
const ROOT = path.join(import.meta.dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function vercelify(req, res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/ask') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    req.body = Buffer.concat(chunks).toString('utf8');
    try { await handler(req, vercelify(req, res)); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: { code: 'crash', message: String(e) } })); }
    return;
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.statusCode = 403; res.end('no'); return; }
  try {
    const buf = await readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(PORT, () => console.log('serving on http://localhost:' + PORT));
