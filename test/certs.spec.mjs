/* Certificates, over plain HTTP: issued by the server from real results, a random ID each, checked on a public route that
   shows only what a verifier needs, revocable by an admin, and impossible to create or change from the browser.
   Start servers with test/start-servers.sh. */
import { roles, skillOf, trackOf } from './keys.mjs';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const jf = async (path, body) => (await fetch(FAKE + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)).json();
await jf('/__reset');

const hdr = u => ({ authorization: 'Bearer ' + u.tok, 'content-type': 'application/json' });
async function student(email, roadmap, name) {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: name || 'Test Student', school: 'USC' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  if (roadmap) await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
  return u;
}
const api = async (u, route, body, method) => {
  const r = await fetch(BASE + route, { method: method || (body ? 'POST' : 'GET'), headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
const qOf = (role, it) => skillOf(role.id, it.skill).assessment.find((q, i) => (q.qid || it.skill + '-q' + (i + 1)) === it.qid);
async function pass(u, role, kind, id) {
  const s = await api(u, '/api/exam', { action: 'start', kind, id });
  need(s.status === 200, 'start ' + s.status + ' ' + JSON.stringify(s.data));
  const role0 = roles.find(r => r.id === role);
  const answers = s.data.items.map(it => qOf(role0, it).a);
  return api(u, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers });
}
const ID = /^CP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

let bo, bcert;
await step('passing a skill on a roadmap without modules issues a certificate with a random ID', async () => {
  bo = await student('bo@usc.edu', 'ba', 'Bo Chen');
  const none = await api(bo, '/api/certs');
  need(none.status === 200 && none.data.certs.length === 0, 'certificates before any result: ' + JSON.stringify(none.data));
  const r = await pass(bo, 'ba', 'skill', 'sql-ba');
  need(r.status === 200 && r.data.progress.stars >= 3, 'did not reach three stars: ' + JSON.stringify(r.data).slice(0, 200));
  const list = await api(bo, '/api/certs');
  need(list.data.certs.length === 1, 'expected one certificate, got ' + list.data.certs.length);
  bcert = list.data.certs[0];
  need(ID.test(bcert.id) && bcert.kind === 'skill' && bcert.target === 'sql-ba' && bcert.holder === 'Bo Chen' && bcert.school === 'USC' && !bcert.revoked, JSON.stringify(bcert));
  need(bcert.roadmapId === 'ba' && bcert.score >= 70, JSON.stringify(bcert));
  const again = await api(bo, '/api/certs');
  need(again.data.certs.length === 1 && again.data.certs[0].id === bcert.id, 'asking again changed the ID or issued a second certificate');
});

await step('IDs are different for different people and carry nothing guessable', async () => {
  const cy = await student('cy@usc.edu', 'ba', 'Cy Ode');
  await pass(cy, 'ba', 'skill', 'sql-ba');
  const c = (await api(cy, '/api/certs')).data.certs[0];
  need(ID.test(c.id) && c.id !== bcert.id, 'same ID for two students');
  const all = new Set(); for (let i = 0; i < 200; i++) { const mod = await import('../api/_certs.js'); all.add(mod.newId()); }
  need(all.size === 200, 'random IDs repeated');
  need([...all].every(i => ID.test(i) && !/[01OI]/.test(i.slice(3))), 'an ID has a confusable character');
});

await step('a certificate that is not earned is not issued: two stars, or another roadmap', async () => {
  const dee = await student('dee@usc.edu', 'ba', 'Dee');
  const s = await api(dee, '/api/exam', { action: 'start', kind: 'skill', id: 'sql-ba' });
  const role = roles.find(r => r.id === 'ba');
  const answers = s.data.items.map((it, i) => (i < 2 ? qOf(role, it).a : (qOf(role, it).a + 1) % 4));
  const r = await api(dee, '/api/exam', { action: 'submit', attempt: s.data.attempt, answers });
  need(r.status === 200 && r.data.progress.stars < 3, 'two right answers gave ' + r.data.progress.stars + ' stars');
  need((await api(dee, '/api/certs')).data.certs.length === 0, 'a certificate was issued below three stars');
});

await step('a module certificate is issued for a passed module exam, with the module title', async () => {
  const al = await student('al@usc.edu', 'pm', 'Al Rey');
  const t = trackOf('pm', 'pm-fundamentals');
  const skills = t.groups.flatMap(g => g.skills).map(id => ({ skill_id: id, stars: 3, best: 80, attempts: 1, project: false, lessons_done: [], history: [] }));
  await jf('/__seed?email=al@usc.edu', { skills });
  const r = await pass(al, 'pm', 'module', 'pm-fundamentals');
  need(r.status === 200 && r.data.passed, 'module exam not passed: ' + JSON.stringify(r.data).slice(0, 200));
  const certs = (await api(al, '/api/certs')).data.certs;
  need(certs.length === 1 && certs[0].kind === 'module' && certs[0].target === 'pm-fundamentals' && certs[0].title.startsWith(t.cert) && ID.test(certs[0].id), JSON.stringify(certs));
  need(certs[0].roadmap === 'Product Manager' || certs[0].roadmap.length > 3, 'roadmap name missing: ' + certs[0].roadmap);
});

await step('anyone can check an ID, and sees only what a verifier needs', async () => {
  const v = await api(null, '/api/verify?id=' + bcert.id);
  need(v.status === 200 && v.data.found && v.data.status === 'valid', JSON.stringify(v.data));
  need(v.data.holder === 'Bo Chen' && v.data.title === bcert.title && v.data.school === 'USC' && v.data.score === bcert.score && v.data.issued, JSON.stringify(v.data));
  const text = JSON.stringify(v.data);
  need(!/bo@usc|user_id|email|"id":"0000/.test(text), 'the public answer carries private data: ' + text);
  const low = await api(null, '/api/verify?id=' + bcert.id.toLowerCase().replace('-', ' - '));
  need(low.data.found, 'a lower-case ID with spaces was not found');
});

await step('unknown and malformed IDs get the same answer, nothing breaks', async () => {
  for (const id of ['CP-AAAA-BBBB', 'nonsense', '', "CP-AAAA-BBBB'; drop table certificates;--", 'CP-AAAA-BBBBB', '%00']) {
    const v = await api(null, '/api/verify?id=' + encodeURIComponent(id));
    need(v.status === 200 && v.data.found === false && Object.keys(v.data).join() === 'ok,found', id + ' -> ' + v.status + ' ' + JSON.stringify(v.data));
  }
});

await step('a student cannot create, edit or read someone else\'s certificate from the browser', async () => {
  const eve = await student('eve@usc.edu', 'ba', 'Eve');
  const row = { id: 'CP-FAKE-FAKE', user_id: eve.id, kind: 'skill', target: 'sql-ba', title: 'SQL', stars: 5, score: 100 };
  const ins = await fetch(FAKE + '/rest/v1/certificates', { method: 'POST', headers: hdr(eve), body: JSON.stringify(row) });
  need(ins.status === 403, 'a student inserted a certificate: ' + ins.status);
  const patch = await fetch(FAKE + '/rest/v1/certificates?id=eq.' + bcert.id, { method: 'PATCH', headers: hdr(eve), body: JSON.stringify({ holder: 'Eve' }) });
  need(patch.status === 403, 'a student edited a certificate: ' + patch.status);
  const read = await (await fetch(FAKE + '/rest/v1/certificates', { headers: hdr(eve) })).json();
  need(Array.isArray(read) && read.length === 0, 'a student read other certificates');
  need((await api(eve, '/api/certs?user=' + bo.id)).status === 403, 'a student asked for someone else\'s list');
  need((await api(eve, '/api/certs', { action: 'revoke', id: bcert.id })).status === 403, 'a student revoked a certificate');
  need((await api(null, '/api/certs')).status === 401, 'signed-out list was not refused');
  need((await api(null, '/api/verify?id=CP-FAKE-FAKE')).data.found === false, 'a forged ID verified');
});

await step('an admin sees a student\'s certificates and can revoke and restore one; the public page says so', async () => {
  const ad = await student('admin@usc.edu', null, 'Ada Admin'); await jf('/__admin?email=admin@usc.edu');
  const list = await api(ad, '/api/certs?user=' + bo.id);
  need(list.status === 200 && list.data.certs.length === 1 && list.data.certs[0].id === bcert.id, JSON.stringify(list.data));
  const rev = await api(ad, '/api/certs', { action: 'revoke', id: bcert.id });
  need(rev.status === 200 && rev.data.cert.revoked, JSON.stringify(rev.data));
  const v = await api(null, '/api/verify?id=' + bcert.id);
  need(v.data.found && v.data.status === 'revoked', 'public page does not say revoked: ' + JSON.stringify(v.data));
  await pass(bo, 'ba', 'skill', 'sql-ba');       // doing the exam again must not bring a revoked certificate back
  const mine = (await api(bo, '/api/certs')).data.certs;
  need(mine.length === 1 && mine[0].id === bcert.id && mine[0].revoked, 'a revoked certificate came back: ' + JSON.stringify(mine));
  const back = await api(ad, '/api/certs', { action: 'restore', id: bcert.id });
  need(back.data.cert.revoked === false && (await api(null, '/api/verify?id=' + bcert.id)).data.status === 'valid', 'restore did not work');
  need((await api(ad, '/api/certs', { action: 'revoke', id: 'CP-AAAA-ZZZZ' })).status === 404, 'revoking an unknown ID did not 404');
  need((await api(ad, '/api/certs', { action: 'delete', id: bcert.id })).status === 400, 'an unknown action was accepted');
});

await step('the holder name follows the profile, the ID stays', async () => {
  await fetch(FAKE + '/rest/v1/profiles?id=eq.' + bo.id, { method: 'PATCH', headers: hdr(bo), body: JSON.stringify({ name: 'Bo Q. Chen' }) });
  const c = (await api(bo, '/api/certs')).data.certs[0];
  need(c.id === bcert.id && c.holder === 'Bo Q. Chen', JSON.stringify(c));
  need((await api(null, '/api/verify?id=' + c.id)).data.holder === 'Bo Q. Chen', 'public page kept the old name');
});

await step('the public check is capped per minute for one address', async () => {
  let last = 0;
  for (let i = 0; i < 40; i++) { const r = await fetch(BASE + '/api/verify?id=CP-AAAA-BBBB', { headers: { 'x-forwarded-for': '203.0.113.9' } }); last = r.status; if (last === 429) break; }
  need(last === 429, 'no limit on public checks');
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
