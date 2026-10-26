/* Server-side grading, checked over plain HTTP (no browser): the exam API, the admin key endpoint, tampering from the
   browser's own database access, and that the public site files carry no answer keys.
   Start servers with test/start-servers.sh. */
import { roles, skillOf, trackOf } from './keys.mjs';
import { build, FILES, load } from '../tools/strip-keys.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
const NOKEY = process.env.NOKEY_URL || 'http://localhost:3114';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const jf = async (path, body) => (await fetch(FAKE + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)).json();
await jf('/__reset');

async function student(email, roadmap) {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Test Student' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  if (roadmap) {
    const p = await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
    need(p.status === 204, 'roadmap save ' + p.status);
  }
  return u;
}
const hdr = u => ({ authorization: 'Bearer ' + u.tok, 'content-type': 'application/json' });
const api = async (u, route, body, base) => {
  const r = await fetch((base || BASE) + route, { method: body ? 'POST' : 'GET', headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
// The server gives each question an id from its skill and position when it loads the curriculum; do the same here.
const qOf = (role, it) => skillOf(role, it.skill).assessment.find((q, i) => (q.qid || it.skill + '-q' + (i + 1)) === it.qid);
const keyFor = (role, items) => items.map(it => qOf(role, it).a);
const wrongFor = (role, items) => items.map(it => (qOf(role, it).a + 1) % 4);
const SKILL = 'discovery-pm';

await step('starting an exam needs a sign-in and a roadmap', async () => {
  need((await api(null, '/api/exam', { action: 'start', kind: 'skill', id: SKILL })).status === 401, 'signed-out start was not refused');
  const u = await student('noroad@usc.edu', null);
  const r = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  need(r.status === 403 && r.data.error.code === 'no_roadmap', 'got ' + r.status + ' ' + JSON.stringify(r.data));
});

await step('the questions sent to the browser carry no answers', async () => {
  const u = await student('start@usc.edu', 'pm');
  const r = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  need(r.status === 200 && r.data.items.length > 0, 'start failed ' + r.status);
  const text = JSON.stringify(r.data);
  need(!/"a"\s*:|"why"\s*:|"ans"/.test(text), 'start reply carries an answer field: ' + text.slice(0, 200));
});

await step('a perfect submission is graded on the server: stars, points and a saved row', async () => {
  const u = await student('perfect@usc.edu', 'pm');
  const s = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  const r = await api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers: keyFor('pm', s.data.items) });
  need(r.status === 200 && r.data.pct === 100 && r.data.newStars >= 1, 'submit ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 300));
  need(r.data.detail.every(d => d.ok && d.a === undefined && d.why === undefined), 'a correct answer revealed a key');
  const prof = await jf('/__profile?email=perfect@usc.edu');
  need(prof.points > 0 && prof.points === r.data.points, 'points not stored by the server: ' + prof.points);
  const saved = await jf('/__progress?email=perfect@usc.edu');
  const row = saved.skills.find(x => x.skill_id === SKILL);
  need(row && row.best === 100 && row.attempts === 1 && row.stars >= 1, 'row ' + JSON.stringify(row));
});

await step('the same attempt cannot be submitted twice or paid twice', async () => {
  const u = await student('twice@usc.edu', 'pm');
  const s = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  const answers = keyFor('pm', s.data.items);
  const [a, b] = await Promise.all([api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers }), api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers })]);
  need([a.status, b.status].sort().join() === '200,409', 'two submits gave ' + a.status + ',' + b.status);
  const again = await api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers });
  need(again.status === 409, 'third submit gave ' + again.status);
  const first = (await jf('/__profile?email=twice@usc.edu')).points;
  const one = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  need(one.status === 200, 'restart ' + one.status);
  need((await jf('/__profile?email=twice@usc.edu')).points === first, 'points changed without a graded attempt');
});

await step('wrong answers reveal the key only for the questions missed, and award nothing', async () => {
  const u = await student('wrong@usc.edu', 'pm');
  const s = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  const r = await api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers: wrongFor('pm', s.data.items) });
  need(r.status === 200 && r.data.pct === 0 && r.data.pointsAwarded === 0, 'wrong submit ' + JSON.stringify(r.data).slice(0, 200));
  need(r.data.detail.every(d => !d.ok && Number.isInteger(d.a) && typeof d.why === 'string'), 'missed questions did not carry the key');
  need((await jf('/__profile?email=wrong@usc.edu')).points === 0, 'points were awarded for a failed exam');
});

await step('a submission with the wrong number of answers, or somebody else\'s attempt, is refused', async () => {
  const a = await student('own@usc.edu', 'pm'), b = await student('other@usc.edu', 'pm');
  const s = await api(a, '/api/exam', { action: 'start', kind: 'skill', id: SKILL });
  need((await api(a, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers: [0] })).status === 400, 'short answers accepted');
  need((await api(b, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers: keyFor('pm', s.data.items) })).status === 404, "another student's attempt accepted");
  need((await api(a, '/api/exam', { action: 'submit', attempt: 'nope', answers: [] })).status >= 400, 'bad attempt accepted');
});

await step('a skill from another roadmap, and a module exam before 3 stars, are refused', async () => {
  const u = await student('scope@usc.edu', 'pm');
  const ba = roles.find(r => r.id === 'ba').skills[0].id;
  need((await api(u, '/api/exam', { action: 'start', kind: 'skill', id: ba })).status === 404, 'other roadmap skill allowed');
  const track = roles.find(r => r.id === 'pm').tracks.find(t => t.cert);
  const r = await api(u, '/api/exam', { action: 'start', kind: 'module', id: track.id });
  need(r.status === 403 && r.data.error.code === 'not_eligible', 'module start ' + r.status + ' ' + JSON.stringify(r.data));
});

await step('the browser\'s own database access cannot set points, stars or scores', async () => {
  const u = await student('tamper@usc.edu', 'pm');
  const h = { ...hdr(u), prefer: 'return=minimal' };
  let r = await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: h, body: JSON.stringify({ points: 99999 }) });
  need(r.status >= 400, 'points patch gave ' + r.status);
  r = await fetch(FAKE + '/rest/v1/skill_progress', { method: 'POST', headers: h, body: JSON.stringify({ user_id: u.id, skill_id: SKILL, stars: 3, best: 100, attempts: 1 }) });
  need(r.status >= 400, 'skill_progress insert gave ' + r.status);
  r = await fetch(FAKE + '/rest/v1/rpc/add_points', { method: 'POST', headers: h, body: JSON.stringify({ p_user: u.id, p_delta: 5000 }) });
  need(r.status >= 400, 'add_points gave ' + r.status);
  r = await fetch(FAKE + '/rest/v1/exam_attempts', { method: 'POST', headers: h, body: JSON.stringify({ user_id: u.id, kind: 'skill', target: SKILL, items: [] }) });
  need(r.status >= 400, 'exam_attempts insert gave ' + r.status);
  need((await jf('/__profile?email=tamper@usc.edu')).points === 0, 'points changed');
});

await step('the answer-key endpoint serves admins and refuses students and signed-out callers', async () => {
  const st = await student('plain@usc.edu', 'pm'), ad = await student('boss@usc.edu', 'pm');
  await jf('/__admin?email=boss@usc.edu');
  need((await api(null, '/api/keys')).status === 401, 'signed-out got keys');
  need((await api(st, '/api/keys')).status === 403, 'student got keys');
  const r = await api(ad, '/api/keys');
  need(r.status === 200 && r.data.keys['pm/' + SKILL].length > 0 && Number.isInteger(r.data.keys['pm/' + SKILL][0].a), 'admin did not get keys');
});

await step('without the service key the exam API says it is not set up and never grades', async () => {
  const u = await student('nokey@usc.edu', 'pm');
  const r = await api(u, '/api/exam', { action: 'start', kind: 'skill', id: SKILL }, NOKEY);
  need(r.status >= 500 && r.data && r.data.error, 'got ' + r.status + ' ' + JSON.stringify(r.data));
});

await step('the served site files hold no answer keys and match what the build produces', async () => {
  const gen = build(false);
  const pub = path.join(import.meta.dirname, '..', 'public');
  for (const f of FILES) {
    const served = await (await fetch(BASE + '/' + f)).text();
    need(served === fs.readFileSync(path.join(pub, f), 'utf8'), f + ' served differs from disk');
    const want = gen[f] != null ? (gen[f].text != null ? gen[f].text : gen[f]) : null;
    if (want != null) need(served === want, f + ' is out of date: run npm run build:content');
  }
  const win = load(FILES, pub);
  let n = 0;
  win.CP_ROLES.forEach(r => r.skills.forEach(s => (s.assessment || []).forEach(q => { n++; need(!('a' in q) && !('why' in q), 'key left in public ' + r.id + '/' + s.id + '/' + q.qid); })));
  need(n > 500, 'only ' + n + ' public questions found');
  // the curriculum on disk for the server must still hold every key
  const full = roles.flatMap(r => r.skills.flatMap(s => s.assessment));
  need(full.length === n && full.every(q => Number.isInteger(q.a)), 'content/ is missing keys');
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
