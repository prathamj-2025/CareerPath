/* A small stand-in for Supabase Auth + the profiles table, for tests only.
   Mirrors the behaviour the site relies on: email confirmation, wrong-password errors, refresh tokens,
   recovery links, and the profiles rules from 001/002 (own row only, role cannot be edited). */
import http from 'node:http';
const PORT = Number(process.env.FAKE_PORT || 3113);
const users = new Map();      // email -> { id, email, password, confirmed, meta }
const profiles = new Map();   // id -> row
const tokens = new Map();     // access token -> user id
const refreshes = new Map();  // refresh token -> user id
let n = 0;
const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const ALLOWED = new Set(['name', 'school', 'major', 'grad_year', 'picture_url', 'roadmap_id', 'roadmap_history', 'onboarding']);

function session(u) {
  const access = 'acc-' + uuid(), refresh = 'ref-' + uuid();
  tokens.set(access, u.id); refreshes.set(refresh, u.id);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer',
    user: { id: u.id, email: u.email, identities: [{}] } };
}
const who = req => tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));

http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url, 'http://x');
  const chunks = []; for await (const c of req) chunks.push(c);
  let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
  const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  const p = url.pathname;

  // ---- test helpers ----
  if (p === '/__confirm') {            // simulates clicking the link in the email
    const u = users.get(url.searchParams.get('email')); if (!u) return send(404, {});
    u.confirmed = true; const s = session(u);
    return send(200, { hash: `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&type=signup` });
  }
  if (p === '/__recovery') {
    const u = users.get(url.searchParams.get('email')); if (!u) return send(404, {});
    const s = session(u);
    return send(200, { hash: `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&type=recovery` });
  }
  if (p === '/__admin') { const u = users.get(url.searchParams.get('email')); profiles.get(u.id).role = 'admin'; return send(200, {}); }
  if (p === '/__expire') { tokens.clear(); return send(200, {}); }   // access tokens die, refresh tokens live
  if (p === '/__profile') { const u = users.get(url.searchParams.get('email')); return send(200, profiles.get(u.id) || null); }
  if (p === '/__reset') { users.clear(); profiles.clear(); tokens.clear(); refreshes.clear(); return send(200, {}); }
  if (p === '/__state') return send(200, { users: users.size, emails: [...users.keys()] });

  // ---- auth ----
  if (p === '/auth/v1/signup') {
    if (String(body.password || '').length < 8) return send(422, { error_code: 'weak_password', msg: 'Password should be at least 8 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(body.email || '')) return send(400, { error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
    if (users.has(body.email)) return send(200, { id: uuid(), email: body.email, identities: [] });
    const u = { id: uuid(), email: body.email, password: body.password, confirmed: false, meta: body.data || {} };
    users.set(body.email, u);
    profiles.set(u.id, { id: u.id, email: u.email, name: u.meta.name || '', role: 'student', school: u.meta.school || '', major: u.meta.major || '',
      grad_year: u.meta.grad_year || '', title: '', picture_url: null, roadmap_id: null, roadmap_history: [], onboarding: {} });
    return send(200, { id: u.id, email: u.email, identities: [{}] });
  }
  if (p === '/auth/v1/token') {
    const g = url.searchParams.get('grant_type');
    if (g === 'password') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return send(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!u.confirmed) return send(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return send(200, session(u));
    }
    if (g === 'refresh_token') {
      const id = refreshes.get(body.refresh_token); if (!id) return send(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      refreshes.delete(body.refresh_token);
      return send(200, session([...users.values()].find(x => x.id === id)));
    }
  }
  if (p === '/auth/v1/user') {
    const id = who(req); if (!id) return send(401, { msg: 'invalid JWT' });
    const u = [...users.values()].find(x => x.id === id);
    if (req.method === 'PUT') {
      if (String(body.password || '').length < 8) return send(422, { error_code: 'weak_password', msg: 'weak' });
      if (body.password === u.password) return send(422, { error_code: 'same_password', msg: 'same' });
      u.password = body.password; return send(200, { id });
    }
    return send(200, { id, email: u.email, identities: [{}] });
  }
  if (p === '/auth/v1/resend') return send(200, {});
  if (p === '/auth/v1/recover') return send(200, {});
  if (p === '/auth/v1/logout') { tokens.delete(String(req.headers.authorization || '').replace(/^Bearer /, '')); return send(204); }

  // ---- profiles (PostgREST) ----
  if (p === '/rest/v1/profiles') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    const want = (url.searchParams.get('id') || '').replace(/^eq\./, '');
    const me = profiles.get(id);
    if (req.method === 'GET') {
      const rows = [...profiles.values()].filter(r => (me.role === 'admin' || r.id === id) && (!want || r.id === want));
      return send(200, rows);
    }
    if (req.method === 'PATCH') {
      if (want !== id) return send(200, []);                         // row-level security hides other rows
      const bad = Object.keys(body).filter(k => !ALLOWED.has(k));
      if (bad.length) return send(403, { code: '42501', message: 'permission denied for table profiles' });
      if (body.roadmap_id && !['pm', 'ba', 'pjm'].includes(body.roadmap_id)) return send(400, { code: '23514', message: 'check constraint' });
      Object.assign(me, body); return send(204);
    }
  }
  send(404, { message: 'not found' });
}).listen(PORT, () => console.log('fake supabase on http://localhost:' + PORT));
