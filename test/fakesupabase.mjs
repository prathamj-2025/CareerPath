/* A small stand-in for Supabase Auth + the profiles table, for tests only.
   Mirrors the behaviour the site relies on: email confirmation, wrong-password errors, refresh tokens,
   recovery links, and the profiles rules from 001/002 (own row only, role cannot be edited). */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { FORM } from '../api/_feedback_form.js';   // 015 allows exactly these words
const PORT = Number(process.env.FAKE_PORT || 3113);
const users = new Map();      // email -> { id, email, password, confirmed, meta }
const captcha = { on: false, seen: [] };    // when on, sign-up, password sign-in, resend and recover need the token 'good-token'
function captchaOk(b) { if (!captcha.on) return true; const t = b && b.gotrue_meta_security && b.gotrue_meta_security.captcha_token; captcha.seen.push(t || null); return t === 'good-token'; }
const profiles = new Map();   // id -> row
const tokens = new Map();     // access token -> user id
const refreshes = new Map();  // refresh token -> user id
let n = 0;
let failing = false;   // when true, progress calls fail like a dropped connection
const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
// 007: points are no longer writable by the student.
const ALLOWED = new Set(['name', 'school', 'major', 'grad_year', 'picture_url', 'roadmap_id', 'roadmap_history', 'onboarding', 'show_on_leaderboard']);
const progress = new Map();   // 'user|skill' -> row
const modules = new Map();    // 'user|track' -> row
const attempts = new Map();   // id -> exam_attempts row (written only with the service key)
const content = { lessons: [], questions: [], overrides: [], missing: false, overridesMissing: false };   // admin content edits (service key only)
const chs = { rows: [], missing: false, noKind: false, noCols: false };   // noCols: migration 012 not run (no reference, met, judged)   // 011: challenges (server only); noKind = exam_attempts not yet accepting 'challenge'
const certs = new Map();      // id -> certificates row (migration 010; written only with the service key)
const bursts = new Map(); let burstOff = false;   // take_burst counters (migration 014)
const ai = new Map(); let aiOff = false;   // take_ai counters (migration 009)
const subs = new Map();       // 'user|challenge' -> challenge_submissions row (written only with the service key)
const fb = { rows: [], missing: false };   // feedback answers (015, written only with the service key)
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
const isService = req => req.headers.apikey === SECRET;
// PostgREST filters used by the server functions: col=eq.x, col=gte.x, col=is.null
function matches(row, url) {
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const m = /^(eq|gte|lte|is)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, val] = m, cur = row[k];
    if (op === 'eq' && String(cur) !== val) return false;
    if (op === 'is' && val === 'null' && cur != null) return false;
    if (op === 'gte' && !(cur != null && String(cur) >= val)) return false;
    if (op === 'lte' && !(cur != null && String(cur) <= val)) return false;
  }
  return true;
}

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
  if (p === '/__reset') { rt.joins = []; rt.fanouts = []; rt.tokenUpdates = 0; rt.refuse = false; for (const c of sockets) c.ws.terminate(); users.clear(); profiles.clear(); tokens.clear(); refreshes.clear(); progress.clear(); modules.clear(); subs.clear(); attempts.clear(); certs.clear(); chs.rows = []; chs.missing = false; chs.noKind = false; content.lessons = []; content.questions = []; content.overrides = []; content.missing = false; content.overridesMissing = false; ai.clear(); aiOff = false; bursts.clear(); burstOff = false; log.length = 0; captcha.on = false; captcha.seen = []; return send(200, {}); }
  if (p === '/__progress') { const u = users.get(url.searchParams.get('email')); return send(200, { skills: [...progress.values()].filter(r => r.user_id === u.id), modules: [...modules.values()].filter(r => r.user_id === u.id) }); }
  if (p === '/__seed') {   // put saved progress on the server before the student signs in (as if from another device)
    const u = users.get(url.searchParams.get('email')); const b = body;
    (b.skills || []).forEach(r => progress.set(u.id + '|' + r.skill_id, { user_id: u.id, ...r }));
    (b.modules || []).forEach(r => modules.set(u.id + '|' + r.track_id, { user_id: u.id, ...r }));
    if (b.points != null) profiles.get(u.id).points = b.points;
    return send(200, {});
  }
  if (p === '/__subs') return send(200, [...subs.values()]);
  if (p === '/__subsclear') { subs.clear(); return send(200, { ok: true }); }
  if (p === '/__attempts') { const u = users.get(url.searchParams.get('email')); return send(200, [...attempts.values()].filter(r => r.user_id === u.id)); }
  if (p === '/__age') { const a = attempts.get(url.searchParams.get('id')); if (a) a.started_at = new Date(Date.now() - Number(url.searchParams.get('minutes')) * 60e3).toISOString(); return send(200, {}); }
  if (p === '/__challenges') return send(200, chs.rows);
  if (p === '/__nocols') { chs.noCols = url.searchParams.get('on') === '1'; return send(200, { noCols: chs.noCols }); }
  if (p === '/__challengesoff') { chs.missing = url.searchParams.get('on') === '1'; chs.noKind = chs.missing; return send(200, {}); }   // as if 011 was not run
  if (p === '/__certs') return send(200, [...certs.values()]);
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
  if (p === '/__captcha') { captcha.on = url.searchParams.get('on') === '1'; return send(200, {}); }
  if (p === '/__captchaseen') return send(200, captcha.seen);
  const blocked = () => send(400, { error_code: 'captcha_failed', msg: 'captcha verification process failed' });
  const needsCaptcha = (route, g) => (route === '/auth/v1/signup' || route === '/auth/v1/resend' || route === '/auth/v1/recover' || (route === '/auth/v1/token' && g === 'password'));
  if (needsCaptcha(p, url.searchParams.get('grant_type')) && !captchaOk(body)) return blocked();
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

  // ---- progress tables (PostgREST). Students read their own rows; 007 removed their right to write scores,
  //      so only the server (service key) writes here. ----
  if (p === '/rest/v1/skill_progress' || p === '/rest/v1/module_results') {
    const svc = isService(req);
    const id = svc ? null : who(req); if (!svc && !id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (failing) return send(503, { message: 'down' });
    const store = p.endsWith('skill_progress') ? progress : modules;
    const key = p.endsWith('skill_progress') ? 'skill_id' : 'track_id';
    const me = id ? profiles.get(id) : null;
    if (req.method === 'GET') {
      return send(200, [...store.values()].filter(r => (svc || me.role === 'admin' || r.user_id === id) && matches(r, url)));
    }
    if (req.method === 'POST') {
      if (!svc) return send(403, { code: '42501', message: 'permission denied for table ' + p.split('/').pop() });
      const rows = Array.isArray(body) ? body : [body];
      if (rows.some(r => r.stars > 5 || r.best > 100)) return send(400, { code: '23514', message: 'check constraint' });
      log.push({ table: p.split('/').pop(), rows: rows.length, service: true });
      rows.forEach(r => {
        const old = store.get(r.user_id + '|' + r[key]);
        store.set(r.user_id + '|' + r[key], r);
        if (store === progress && (!old || old.stars !== r.stars)) {      // skill_progress_board_* triggers
          const owner = profiles.get(r.user_id);
          const sfx = (String(r.skill_id).match(/-([a-z]+)$/) || [])[1];
          const t = owner && boardOf({ school: owner.school, roadmap_id: sfx }); if (t) fanout(t);
        }
      });
      return (req.headers.prefer || '').includes('return=representation') ? send(201, rows) : send(201);
    }
    return send(403, { code: '42501', message: 'permission denied' });
  }
  if (p === '/rest/v1/rpc/save_lessons') {          // the one score-table write a student keeps
    const id = who(req); if (!id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (failing) return send(503, { message: 'down' });
    if (!body.p_skill || String(body.p_skill).length > 80) return send(400, { message: 'bad skill' });
    const k = id + '|' + body.p_skill, old = progress.get(k) || { user_id: id, skill_id: body.p_skill, stars: 0, best: 0, attempts: 0, project: false, lessons_done: [], history: [] };
    const done = [...new Set([...(old.lessons_done || []), ...(body.p_done || [])].filter(x => x >= 0 && x < 200))].sort((a, b) => a - b);
    progress.set(k, { ...old, lessons_done: done });
    log.push({ table: 'save_lessons', rows: 1 });
    return send(204);
  }
  if (p === '/rest/v1/rpc/add_points') {            // service role only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for function add_points' });
    const pr = profiles.get(body.p_user); if (!pr) return send(404, {});
    const before = { ...pr };
    pr.points = Math.min(Math.max((pr.points || 0) + Number(body.p_delta || 0), 0), 999999);
    const t = boardOf(pr); if (t) fanout(t);
    return send(200, pr.points);
  }
  if (p === '/__burstoff') { burstOff = url.searchParams.get('on') === '1'; return send(200, {}); }   // as if migration 014 was not run
  if (p === '/__bursts') return send(200, Object.fromEntries(bursts));
  if (p === '/rest/v1/rpc/take_burst') {              // service role only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for function take_burst' });
    if (burstOff) return send(404, { code: 'PGRST202', message: 'Could not find the function' });
    const w = Number(body.p_window), ws = Math.floor(Date.now() / 1000 / w) * w, k = body.p_key + '|' + ws;
    const n = (bursts.get(k) || 0) + 1; bursts.set(k, n);
    return send(200, { ok: n <= body.p_max, n });
  }
  if (p === '/__aioff') { aiOff = url.searchParams.get('on') === '1'; return send(200, {}); }   // as if migration 009 was not run
  if (p === '/rest/v1/rpc/take_ai') {                 // service role only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for function take_ai' });
    if (aiOff) return send(404, { code: 'PGRST202', message: 'Could not find the function' });
    const now = new Date(), hs = now.toISOString().slice(0, 13), ds = now.toISOString().slice(0, 10), zero = '0';
    const bump = k => { ai.set(k, (ai.get(k) || 0) + 1); return ai.get(k); };
    const h = bump(body.p_user + '|h|' + hs), d = bump(body.p_user + '|d|' + ds);
    if (h > body.p_hour) return send(200, { ok: false, why: 'hour', hour: h, day: d });
    if (d > body.p_day) return send(200, { ok: false, why: 'day', hour: h, day: d });
    const g = bump(zero + '|d|' + ds);
    if (g > body.p_global) return send(200, { ok: false, why: 'global', hour: h, day: d, global: g });
    return send(200, { ok: true, why: '', hour: h, day: d, global: g });
  }
  if (p === '/__feedback') return send(200, fb.rows);                                                  // 015: what was saved
  if (p === '/__feedbackoff') { fb.missing = url.searchParams.get('on') === '1'; return send(200, {}); }   // as if 015 was not run
  if (p === '/__feedbackclear') { fb.rows = []; return send(200, {}); }
  if (p === '/rest/v1/feedback') {   // 015: the server only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for table feedback' });
    if (fb.missing) return send(404, { code: 'PGRST205', message: 'Could not find the table' });
    if (req.method === 'GET') return send(200, [...fb.rows].reverse());
    if (req.method === 'POST') {
      const r = body || {};
      const cols = ['source', 'user_id', 'status', 'school', 'program', 'target_role', 'prepare', 'struggle', 'heard', 'tried', 'used', 'ease', 'device',
        'broken', 'lessons', 'lessons_better', 'favorite', 'continue_use', 'change_mind', 'pmf', 'recommend', 'add_or_change', 'why_not', 'would_try', 'email'];
      const ok = ['Yes', 'Not yet'].includes(r.tried) && (r.ease == null || (r.ease >= 1 && r.ease <= 5)) && (r.recommend == null || (r.recommend >= 0 && r.recommend <= 10))
        && Object.entries(FORM).every(([k, f]) => r[k] == null || (f.many ? Array.isArray(r[k]) && r[k].every(v => Object.values(f.opts).includes(v)) : Object.values(f.opts).includes(r[k])))
        && Object.keys(r).every(k => cols.includes(k));   // an unknown column is an error in PostgREST
      if (!ok) return send(400, { code: '23514', message: 'check violation' });
      fb.rows.push({ id: fb.rows.length + 1, created_at: new Date().toISOString(), user_id: null, ...r, _keys: Object.keys(r) });
      return send(201);
    }
  }
  if (p === '/__overridesoff') { content.overridesMissing = url.searchParams.get('on') === '1'; return send(200, {}); }   // as if migration 013 was not run
  if (p === '/rest/v1/content_overrides') {   // 013: the server only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for table content_overrides' });
    if (content.overridesMissing) return send(404, { code: 'PGRST205', message: 'Could not find the table' });
    const list = content.overrides;
    const pk = r => [r.kind, r.key, r.version].join('|');
    const clash = rows => {
      const seen = new Set(), live = new Set();
      for (const r of rows) {
        if (seen.has(pk(r))) return 'pk'; seen.add(pk(r));
        if (!['project', 'practice'].includes(r.kind) || !['live', 'archived'].includes(r.status) || !(r.version >= 1) || typeof r.data !== 'object') return 'check';
        if (r.status === 'live') { const k = r.kind + '|' + r.key; if (live.has(k)) return 'live'; live.add(k); }
      }
      return '';
    };
    if (req.method === 'GET') {
      const off = Number(url.searchParams.get('offset') || 0), lim = Number(url.searchParams.get('limit') || 1000);
      return send(200, list.filter(r => matches(r, url)).slice(off, off + lim));
    }
    if (req.method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]).map(r => ({ edited_at: new Date().toISOString(), ...r }));
      const ignore = (req.headers.prefer || '').includes('ignore-duplicates');
      for (const r of rows) {
        if (ignore && list.some(x => pk(x) === pk(r))) continue;
        const bad = clash([...list, r]); if (bad) return send(409, { code: '23505', message: 'violation ' + bad });
        list.push(r);
      }
      return send(201);
    }
    if (req.method === 'PATCH') {
      const hit = list.filter(r => matches(r, url));
      const next = list.map(r => (hit.includes(r) ? { ...r, ...body } : r));
      const bad = clash(next); if (bad) return send(409, { code: '23505', message: 'violation ' + bad });
      list.splice(0, list.length, ...next);
      return send(204);
    }
  }
  if (p === '/__contentoff') { content.missing = url.searchParams.get('on') === '1'; return send(200, {}); }   // as if migration 008 was not run
  if (p === '/__content') return send(200, content);
  if (p === '/rest/v1/content_lessons' || p === '/rest/v1/content_questions') {   // 008: the server only
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for table ' + p.split('/').pop() });
    if (content.missing) return send(404, { code: 'PGRST205', message: 'Could not find the table' });
    const isL = p.endsWith('lessons'), list = isL ? content.lessons : content.questions;
    const pk = r => isL ? [r.skill_id, r.idx, r.version].join('|') : [r.qid, r.version].join('|');
    const clash = (rows, except) => {                 // the unique indexes of 008
      const seen = new Set(), live = new Set(), dr = new Set();
      for (const r of rows) {
        if (seen.has(pk(r))) return 'pk'; seen.add(pk(r));
        const k = isL ? r.skill_id + '|' + r.idx : r.qid;
        if (r.status === 'live') { if (live.has(k)) return 'live'; live.add(k); }
        if (!isL && r.status === 'draft') { if (dr.has(k)) return 'draft'; dr.add(k); }
        if (!isL && (!Array.isArray(r.opts) || r.opts.length !== 4 || !(r.answer >= 0 && r.answer <= 3) || !(r.lvl >= 1 && r.lvl <= 5))) return 'check';
      }
      return '';
    };
    if (req.method === 'GET') {
      const off = Number(url.searchParams.get('offset') || 0), lim = Number(url.searchParams.get('limit') || 1000);
      return send(200, list.filter(r => matches(r, url)).slice(off, off + lim));
    }
    if (req.method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]).map(r => ({ created_at: new Date().toISOString(), ...r }));
      const ignore = (req.headers.prefer || '').includes('ignore-duplicates');
      for (const r of rows) {
        if (ignore && list.some(x => pk(x) === pk(r))) continue;
        const bad = clash([...list, r]); if (bad) return send(409, { code: '23505', message: 'unique violation ' + bad });
        list.push(r);
      }
      return send(201);
    }
    if (req.method === 'PATCH') {
      const hit = list.filter(r => matches(r, url));
      const next = list.map(r => (hit.includes(r) ? { ...r, ...body } : r));
      const bad = clash(next); if (bad) return send(409, { code: '23505', message: 'unique violation ' + bad });
      list.splice(0, list.length, ...next);
      return send(204);
    }
    if (req.method === 'DELETE') {
      const keep = list.filter(r => !matches(r, url));
      list.splice(0, list.length, ...keep);
      return send(204);
    }
  }
  if (p === '/rest/v1/exam_attempts') {
    const svc = isService(req);
    const id = svc ? null : who(req); if (!svc && !id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (req.method === 'GET') {
      const me = id ? profiles.get(id) : null;
      return send(200, [...attempts.values()].filter(r => (svc || me.role === 'admin' || r.user_id === id) && matches(r, url)));
    }
    if (!svc) return send(403, { code: '42501', message: 'permission denied for table exam_attempts' });
    if (req.method === 'POST') {
      if (!['skill', 'module', 'project', ...(chs.noKind ? [] : ['challenge'])].includes(body.kind)) return send(400, { code: '23514', message: 'check constraint' });
      const row = { id: uuid(), started_at: new Date().toISOString(), submitted_at: null, answers: null, score: null, right: null, items: [], ...body };
      attempts.set(row.id, row);
      return (req.headers.prefer || '').includes('return=representation') ? send(201, [row]) : send(201);
    }
    if (req.method === 'PATCH') {
      const hit = [...attempts.values()].filter(r => matches(r, url));
      hit.forEach(r => Object.assign(r, body));
      return (req.headers.prefer || '').includes('return=representation') ? send(200, hit) : send(204);
    }
    if (req.method === 'DELETE') { [...attempts.values()].filter(r => matches(r, url)).forEach(r => attempts.delete(r.id)); return send(204); }
  }

  // ---- certificates (010): students and admins read; only the server writes ----
  if (p === '/rest/v1/certificates') {
    const svc = isService(req);
    const id = svc ? null : who(req); if (!svc && !id) return send(401, { message: 'JWT expired', code: 'PGRST301' });
    if (req.method === 'GET') {
      const me = id ? profiles.get(id) : null;
      return send(200, [...certs.values()].filter(r => (svc || me.role === 'admin' || r.user_id === id) && matches(r, url)));
    }
    if (!svc) return send(403, { code: '42501', message: 'permission denied for table certificates' });
    if (req.method === 'POST') {
      if (!/^CP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.id || '')) return send(400, { code: '23514', message: 'check constraint' });
      if (certs.has(body.id)) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "certificates_pkey"' });
      if ([...certs.values()].some(r => r.user_id === body.user_id && r.kind === body.kind && r.target === body.target))
        return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "certificates_user_id_kind_target_key"' });
      const row = { issued_at: new Date().toISOString(), revoked_at: null, holder: '', school: '', roadmap_id: '', roadmap_name: '', stars: 0, score: 0, ...body };
      certs.set(row.id, row); log.push({ table: 'certificates', rows: 1 });
      return (req.headers.prefer || '').includes('return=representation') ? send(201, [row]) : send(201);
    }
    if (req.method === 'PATCH') {
      const hit = [...certs.values()].filter(r => matches(r, url));
      hit.forEach(r => Object.assign(r, body));
      return (req.headers.prefer || '').includes('return=representation') ? send(200, hit) : send(204);
    }
    return send(403, { code: '42501', message: 'permission denied' });
  }

  // ---- challenges (011): the server only ----
  if (p === '/rest/v1/challenges') {
    if (!isService(req)) return send(401, { code: '42501', message: 'permission denied for table challenges' });
    if (chs.missing) return send(404, { code: 'PGRST205', message: 'Could not find the table' });
    if (req.method === 'GET') return send(200, chs.rows.filter(r => matches(r, url)));
    if (req.method === 'POST') {
      if (chs.noCols && 'reference' in body) return send(400, { code: 'PGRST204', message: "Could not find the 'reference' column of 'challenges' in the schema cache" });
      const r = { created_at: new Date().toISOString(), ...body };
      if (!['pm', 'ba', 'pjm'].includes(r.role_id) || !['draft', 'scheduled', 'live', 'closed'].includes(r.status) || !Array.isArray(r.rubric) || r.rubric.length < 1 || r.rubric.length > 12)
        return send(400, { code: '23514', message: 'check constraint' });
      const i = chs.rows.findIndex(x => x.cid === r.cid);
      const next = i >= 0 ? chs.rows.map((x, k) => (k === i ? { ...x, ...r } : x)) : [...chs.rows, r];
      const live = next.filter(x => x.status === 'live'), roles = live.map(x => x.role_id);
      if (new Set(roles).size !== roles.length) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "challenges_one_live"' });
      chs.rows = next;
      return send(201);
    }
    return send(403, { code: '42501', message: 'permission denied' });
  }

  // ---- weekly challenge submissions: students read their own; only the server (service key) writes ----
  if (p === '/rest/v1/challenge_submissions') {
    if (req.method === 'POST') {
      if (req.headers.apikey !== SECRET) return send(401, { code: '42501', message: 'permission denied for table challenge_submissions' });
      const r = body; const key = r.user_id + '|' + r.challenge_id;
      if (chs.noCols && ('met' in r || 'judged' in r)) return send(400, { code: 'PGRST204', message: "Could not find the 'met' column of 'challenge_submissions' in the schema cache" });
      if (subs.has(key)) return send(201, []);                                   // on conflict do nothing
      if (!profiles.has(r.user_id) || r.score < 0 || r.score > 100 || !r.answer) return send(400, { code: '23514', message: 'check constraint' });
      const row = { id: subs.size + 1, created_at: new Date().toISOString(), ...r };
      subs.set(key, row); log.push({ table: 'challenge_submissions', rows: 1 });
      fanout('challenge:' + r.challenge_id);                                     // challenge_submissions_board_insert trigger
      return send(201, [row]);
    }
    if (isService(req)) return send(200, [...subs.values()].filter(r => matches(r, url)));
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
  if (p === '/rest/v1/profiles' && isService(req) && req.method === 'GET') {
    return send(200, [...profiles.values()].filter(r => matches(r, url)));
  }
  if (p === '/rest/v1/profiles' && isService(req) && req.method === 'PATCH') {   // the server may set any column, e.g. points
    const want = (url.searchParams.get('id') || '').replace(/^eq\./, '');
    const me = profiles.get(want); if (!me) return send(200, []);
    const before = { ...me };
    Object.assign(me, body);
    if (['points', 'roadmap_id', 'school', 'name', 'show_on_leaderboard'].some(k => before[k] !== me[k])) {
      const t = boardOf(me); if (t) fanout(t);
      const t0 = boardOf(before); if (t0 && t0 !== t) fanout(t0);
    }
    return send(204);
  }
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
