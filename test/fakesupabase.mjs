/* A small stand-in for Supabase Auth + the profiles table, for tests only.
   Mirrors the behaviour the site relies on: email confirmation, wrong-password errors, refresh tokens,
   recovery links, and the profiles rules from 001/002 (own row only, role cannot be edited). */
import http from 'node:http';
import { WebSocketServer } from 'ws';
const PORT = Number(process.env.FAKE_PORT || 3113);
const users = new Map();      // email -> { id, email, password, confirmed, meta }
const profiles = new Map();   // id -> row
const tokens = new Map();     // access token -> user id
const refreshes = new Map();  // refresh token -> user id
let n = 0;
let failing = false;   // when true, progress calls fail like a dropped connection
const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const ALLOWED = new Set(['name', 'school', 'major', 'grad_year', 'picture_url', 'roadmap_id', 'roadmap_history', 'onboarding', 'points', 'show_on_leaderboard']);
const progress = new Map();   // 'user|skill' -> row
const modules = new Map();    // 'user|track' -> row
const subs = new Map();       // 'user|challenge' -> challenge_submissions row (written only with the service key)
const SECRET = 'sb_secret_test';
const log = [];               // every write, so tests can see what the site sent

// ---- Realtime (Phoenix channels over a WebSocket), as Supabase serves it ----
const slug = t => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const sockets = new Set();            // { ws, uid, chans: Set<topic>, tokens: Map<topic, token> }
const rt = { joins: [], fanouts: [], tokenUpdates: 0, refuse: false };
const wss = new WebSocketServer({ noServer: true });
function fanout(topic) {              // what the database trigger + Supabase do when a leaderboard moves
  rt.fanouts.push(topic);
  for (const c of sockets) if (c.chans.has(topic))
    c.ws.send(JSON.stringify({ topic: 'realtime:' + topic, event: 'broadcast', ref: null, payload: { event: 'changed', payload: {}, type: 'broadcast' } }));
}
const boardOf = p => (p && p.school && ['pm', 'ba', 'pjm'].includes(p.roadmap_id)) ? 'board:' + slug(p.school) + ':' + p.roadmap_id : null;
function allowed(uid, topic) {        // the realtime.messages policy from 006_realtime.sql
  const me = profiles.get(uid); if (!me) return false;
  return topic.startsWith('challenge:') || topic.startsWith('board:' + slug(me.school) + ':');
}
function onSocket(ws) {
  const c = { ws, uid: null, chans: new Set(), tokens: new Map() };
  sockets.add(c);
  ws.on('close', () => sockets.delete(c));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    const reply = (topic, status, response) => ws.send(JSON.stringify({ topic, event: 'phx_reply', ref: m.ref, payload: { status, response: response || {} } }));
    if (m.topic === 'phoenix') return reply('phoenix', 'ok');
    const topic = String(m.topic || '').replace(/^realtime:/, '');
    if (m.event === 'phx_join') {
      const uid = tokens.get(m.payload && m.payload.access_token);
      rt.joins.push({ topic, ok: !!uid, private: !!(m.payload && m.payload.config && m.payload.config.private) });
      if (rt.refuse || !uid || !m.payload.config.private || !allowed(uid, topic)) return reply(m.topic, 'error', { reason: 'Unauthorized' });
      c.uid = uid; c.chans.add(topic); c.tokens.set(topic, m.payload.access_token);
      return reply(m.topic, 'ok', { postgres_changes: [] });
    }
    if (m.event === 'access_token') { rt.tokenUpdates++; c.tokens.set(topic, m.payload && m.payload.access_token); return; }
    if (m.event === 'phx_leave') { c.chans.delete(topic); return reply(m.topic, 'ok'); }
  });
}

function session(u) {
  const access = 'acc-' + uuid(), refresh = 'ref-' + uuid();
  tokens.set(access, u.id); refreshes.set(refresh, u.id);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer',
    user: { id: u.id, email: u.email, identities: [{}] } };
}
const who = req => tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));

const server = http.createServer(async (req, res) => {
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
  if (p === '/__google') {            // simulates coming back from Google: confirmed, name and email only
    const email = url.searchParams.get('email');
    const u = { id: uuid(), email, password: null, confirmed: true, meta: { full_name: 'Gina Google' } };
    users.set(email, u);
    profiles.set(u.id, { id: u.id, email, name: 'Gina Google', role: 'student', points: 0, show_on_leaderboard: true, school: '', major: '', grad_year: '', title: '',
      picture_url: null, roadmap_id: null, roadmap_history: [], onboarding: {} });
    const s = session(u);
    return send(200, { hash: `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer` });
  }
  if (p === '/__admin') { const u = users.get(url.searchParams.get('email')); profiles.get(u.id).role = 'admin'; return send(200, {}); }
  if (p === '/__expire') { tokens.clear(); return send(200, {}); }   // access tokens die, refresh tokens live
  if (p === '/__profile') { const u = users.get(url.searchParams.get('email')); return send(200, profiles.get(u.id) || null); }
  if (p === '/__reset') { rt.joins = []; rt.fanouts = []; rt.tokenUpdates = 0; rt.refuse = false; for (const c of sockets) c.ws.terminate(); users.clear(); profiles.clear(); tokens.clear(); refreshes.clear(); progress.clear(); modules.clear(); subs.clear(); log.length = 0; return send(200, {}); }
  if (p === '/__progress') { const u = users.get(url.searchParams.get('email')); return send(200, { skills: [...progress.values()].filter(r => r.user_id === u.id), modules: [...modules.values()].filter(r => r.user_id === u.id) }); }
  if (p === '/__seed') {   // put saved progress on the server before the student signs in (as if from another device)
    const u = users.get(url.searchParams.get('email')); const b = body;
    (b.skills || []).forEach(r => progress.set(u.id + '|' + r.skill_id, { user_id: u.id, ...r }));
    (b.modules || []).forEach(r => modules.set(u.id + '|' + r.track_id, { user_id: u.id, ...r }));
    if (b.points != null) profiles.get(u.id).points = b.points;
    return send(200, {});
  }
  if (p === '/__subs') return send(200, [...subs.values()]);
  if (p === '/__log') return send(200, log);
  if (p === '/__rt') {
    const by = {}; for (const c of sockets) { const em = c.uid && profiles.get(c.uid) && profiles.get(c.uid).email; by[em || 'unjoined'] = (by[em || 'unjoined'] || []).concat([...c.chans]); }
    const per = {}; for (const c of sockets) { const em = c.uid && profiles.get(c.uid) && profiles.get(c.uid).email; per[em || 'unjoined'] = (per[em || 'unjoined'] || 0) + 1; }
    return send(200, { ...rt, sockets: sockets.size, channels: [...sockets].flatMap(c => [...c.chans]), by, per });
  }
  if (p === '/__rtdrop') { for (const c of sockets) c.ws.terminate(); return send(200, {}); }   // the network drops
  if (p === '/__rtrefuse') { rt.refuse = url.searchParams.get('on') === '1'; return send(200, {}); }
  if (p === '/__rtclear') { rt.joins = []; rt.fanouts = []; rt.tokenUpdates = 0; return send(200, {}); }
  if (p === '/__fail') { failing = url.searchParams.get('on') === '1'; return send(200, {}); }
  if (p === '/__state') return send(200, { users: users.size, emails: [...users.keys()] });

  // ---- auth ----
  if (p === '/auth/v1/signup') {
    if (String(body.password || '').length < 8) return send(422, { error_code: 'weak_password', msg: 'Password should be at least 8 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(body.email || '')) return send(400, { error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
    if (users.has(body.email)) return send(200, { id: uuid(), email: body.email, identities: [] });
    const u = { id: uuid(), email: body.email, password: body.password, confirmed: false, meta: body.data || {} };
    users.set(body.email, u);
    profiles.set(u.id, { id: u.id, email: u.email, name: u.meta.name || '', role: 'student', points: 0, show_on_leaderboard: true, school: u.meta.school || '', major: u.meta.major || '',
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

  // ---- progress tables (PostgREST) ----
  if (p === '/rest/v1/skill_progress' || p === '/rest/v1/module_results') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (failing) return send(503, { message: 'down' });
    const store = p.endsWith('skill_progress') ? progress : modules;
    const key = p.endsWith('skill_progress') ? 'skill_id' : 'track_id';
    const me = profiles.get(id);
    if (req.method === 'GET') {
      const want = (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
      return send(200, [...store.values()].filter(r => (me.role === 'admin' || r.user_id === id) && (!want || r.user_id === want)));
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      if (rows.some(r => r.user_id !== id)) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
      if (rows.some(r => r.stars > 5 || r.best > 100)) return send(400, { code: '23514', message: 'check constraint' });
      log.push({ table: p.split('/').pop(), rows: rows.length });
      rows.forEach(r => {
        const old = store.get(r.user_id + '|' + r[key]);
        store.set(r.user_id + '|' + r[key], r);
        if (store === progress && (!old || old.stars !== r.stars)) {      // skill_progress_board_* triggers
          const sfx = (String(r.skill_id).match(/-([a-z]+)$/) || [])[1];
          const t = boardOf({ school: me.school, roadmap_id: sfx }); if (t) fanout(t);
        }
      });
      return send(201);
    }
  }

  // ---- weekly challenge submissions: students read their own; only the server (service key) writes ----
  if (p === '/rest/v1/challenge_submissions') {
    if (req.method === 'POST') {
      if (req.headers.apikey !== SECRET) return send(401, { code: '42501', message: 'permission denied for table challenge_submissions' });
      const r = body; const key = r.user_id + '|' + r.challenge_id;
      if (subs.has(key)) return send(201, []);                                   // on conflict do nothing
      if (!profiles.has(r.user_id) || r.score < 0 || r.score > 100 || !r.answer) return send(400, { code: '23514', message: 'check constraint' });
      const row = { id: subs.size + 1, created_at: new Date().toISOString(), ...r };
      subs.set(key, row); log.push({ table: 'challenge_submissions', rows: 1 });
      fanout('challenge:' + r.challenge_id);                                     // challenge_submissions_board_insert trigger
      return send(201, [row]);
    }
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    const me = profiles.get(id);
    const eq = k => (url.searchParams.get(k) || '').replace(/^eq\./, '');
    return send(200, [...subs.values()].filter(r => (me.role === 'admin' || r.user_id === id) && (!eq('user_id') || r.user_id === eq('user_id')) && (!eq('challenge_id') || r.challenge_id === eq('challenge_id'))));
  }
  if (p === '/rest/v1/rpc/challenge_board') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    const short = n => { const w = String(n || '').trim().split(/\s+/); return w.length < 2 ? (w[0] || 'Student') : w[0] + ' ' + w[w.length - 1][0].toUpperCase() + '.'; };
    const rows = [...subs.values()].filter(r => r.challenge_id === body.p_challenge)
      .map(r => ({ r, p: profiles.get(r.user_id) })).filter(x => x.p && x.p.role === 'student' && (x.p.show_on_leaderboard !== false || x.r.user_id === id))
      .sort((a, b) => b.r.score - a.r.score || a.r.created_at.localeCompare(b.r.created_at))
      .map((x, i) => ({ user_id: x.r.user_id, display_name: short(x.p.name), school: x.p.school, score: x.r.score, hits: x.r.hits, submitted_at: x.r.created_at, rank: i + 1, is_me: x.r.user_id === id }));
    return send(200, rows.filter(r => r.rank <= 50 || r.is_me));
  }

  // ---- functions (rpc) ----
  if (p === '/rest/v1/rpc/leaderboard') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    const me = profiles.get(id);
    if (!['pm', 'ba', 'pjm'].includes(body.p_roadmap) || (body.p_school !== me.school && me.role !== 'admin')) return send(200, []);
    const short = n => { const w = String(n || '').trim().split(/\s+/); return w.length < 2 ? (w[0] || 'Student') : w[0] + ' ' + w[w.length - 1][0].toUpperCase() + '.'; };
    const rows = [...profiles.values()].filter(r => r.role === 'student' && r.roadmap_id === body.p_roadmap && r.school === body.p_school && (r.show_on_leaderboard !== false || r.id === id)).map(r => {
      const mine = [...progress.values()].filter(x => x.user_id === r.id && x.skill_id.endsWith('-' + body.p_roadmap));
      return { user_id: r.id, display_name: short(r.name), points: r.points || 0, total_stars: mine.reduce((a, x) => a + (x.stars || 0), 0),
        job_ready: mine.filter(x => x.stars >= 3).length, is_me: r.id === id };
    }).sort((a, b) => b.points - a.points || b.total_stars - a.total_stars);
    return send(200, rows.filter((r, i) => i < 50 || r.is_me));
  }
  if (p === '/rest/v1/rpc/delete_my_account') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (profiles.get(id).role === 'admin') return send(400, { message: 'admin accounts are removed by the platform team' });
    const u = [...users.values()].find(x => x.id === id); users.delete(u.email);
    const gone = boardOf(profiles.get(id)); profiles.delete(id); if (gone) fanout(gone);
    [...progress.keys()].filter(k => k.startsWith(id + '|')).forEach(k => progress.delete(k));
    [...modules.keys()].filter(k => k.startsWith(id + '|')).forEach(k => modules.delete(k));
    tokens.clear(); return send(204);
  }

  // ---- profiles (PostgREST) ----
  if (p === '/rest/v1/profiles') {
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    const want = (url.searchParams.get('id') || '').replace(/^eq\./, '');
    const me = profiles.get(id);
    if (req.method === 'GET') {
      const wantRole = (url.searchParams.get('role') || '').replace(/^eq\./, '');
      const off = Number(url.searchParams.get('offset') || 0), lim = Number(url.searchParams.get('limit') || 1000);
      const rows = [...profiles.values()].filter(r => (me.role === 'admin' || r.id === id) && (!want || r.id === want) && (!wantRole || r.role === wantRole));
      return send(200, rows.slice(off, off + lim));
    }
    if (req.method === 'PATCH') {
      if (want !== id) return send(200, []);                         // row-level security hides other rows
      const bad = Object.keys(body).filter(k => !ALLOWED.has(k));
      if (bad.length) return send(403, { code: '42501', message: 'permission denied for table profiles' });
      if (body.roadmap_id && !['pm', 'ba', 'pjm'].includes(body.roadmap_id)) return send(400, { code: '23514', message: 'check constraint' });
      const before = { ...me };
      Object.assign(me, body);
      const moved = ['points', 'roadmap_id', 'school', 'name', 'show_on_leaderboard'].some(k => before[k] !== me[k]);
      if (moved) {                                                   // profiles_board_changed trigger
        const t = boardOf(me); if (t) fanout(t);
        const t0 = boardOf(before); if (t0 && t0 !== t) fanout(t0);
      }
      return send(204);
    }
  }
  send(404, { message: 'not found' });
});
server.on('upgrade', (req, socket, head) => {
  if (!String(req.url).startsWith('/realtime/v1/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, onSocket);
});
server.listen(PORT, () => console.log('fake supabase on http://localhost:' + PORT));
