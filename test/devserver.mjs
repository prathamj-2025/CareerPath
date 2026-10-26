/* Local harness that mimics Vercel: serves public/ and routes /api/* to the matching file in api/.
   Only used for testing in this container. `vercel dev` does the same thing properly. */
// Tests run the browser-only demo unless a spec asks for real accounts (CP_DEMO=0).
process.env.CP_DEMO = process.env.CP_DEMO ?? '1';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import handler from '../api/ask.js';
import configHandler from '../api/config.js';
import googleAuthHandler from '../api/google-auth.js';
import gradeHandler from '../api/grade-challenge.js';
import examHandler from '../api/exam.js';
import projectHandler from '../api/grade-project.js';
import keysHandler from '../api/keys.js';
const API = { '/api/ask': handler, '/api/config': configHandler, '/api/google-auth': googleAuthHandler, '/api/grade-challenge': gradeHandler, '/api/exam': examHandler, '/api/grade-project': projectHandler, '/api/keys': keysHandler };

const PORT = Number(process.env.PORT || 3111);
const ROOT = path.join(import.meta.dirname, '..', 'public');
const CONTENT = path.join(import.meta.dirname, '..', 'content');
const CURRICULUM = new Set(['data.js', 'data2.js', 'data4.js', 'data5.js', 'lessons-pm.js', 'lessons-ba.js', 'lessons-pjm.js']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function vercelify(req, res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (API[url.pathname]) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    req.body = Buffer.concat(chunks).toString('utf8');
    try { await API[url.pathname](req, vercelify(req, res)); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: { code: 'crash', message: String(e) } })); }
    return;
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  // The browser-only demo grades on the page, so it is served the full curriculum with answer keys (content/). Real-account
  // mode is served exactly what production serves: the stripped copies in public/, which carry no keys.
  const demo = process.env.CP_DEMO === '1';
  const full = demo && CURRICULUM.has(rel);
  const file = path.join(full ? CONTENT : ROOT, rel);
  if (!file.startsWith(full ? CONTENT : ROOT)) { res.statusCode = 403; res.end('no'); return; }
  try {
    const buf = await readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(PORT, () => console.log('serving on http://localhost:' + PORT));
