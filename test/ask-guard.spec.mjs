/* The study assistant on a real-account deployment (api/ask.js): a sign-in is required, it is off while an exam is open,
   questions are limited per student, and a deployment without accounts stays open. Over plain HTTP against the fake
   database and the fake model. Start servers with test/start-servers.sh. */
const REAL = process.env.REAL_URL || 'http://localhost:3115';
const DEMO = process.env.DEMO_URL || 'http://localhost:3111';
const BURST = process.env.BURST_URL || 'http://localhost:3116';   // generous hourly limit, so the per-minute limit is what applies
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
async function student(email, roadmap = 'pm') {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Test Student' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  const p = await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
  need(p.status === 204, 'roadmap ' + p.status);
  return u;
}
const ask = async (u, base = REAL, text = 'What is a funnel?') => {
  const r = await fetch(base + '/api/ask', { method: 'POST', headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: JSON.stringify({ rules: 'Be brief.', messages: [{ role: 'user', content: text }] }) });
  const raw = await r.text(); let data = null; try { data = JSON.parse(raw); } catch (e) {}
  return { status: r.status, data, raw };
};
const exam = async (u, body) => {
  const r = await fetch(REAL + '/api/exam', { method: 'POST', headers: hdr(u), body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};

await step('a signed-out caller is refused, and a signed-in student gets an answer', async () => {
  const a = await ask(null);
  need(a.status === 401 && a.data.error.code === 'signed_out', 'signed out: ' + a.status + ' ' + a.raw.slice(0, 100));
  const bad = await ask({ tok: 'not-a-real-token' });
  need(bad.status === 401, 'bad token: ' + bad.status);
  const s = await student('asker@usc.edu');
  const r = await ask(s);
  need(r.status === 200 && r.raw.length > 10, 'signed in: ' + r.status + ' ' + r.raw.slice(0, 100));
});

await step('the assistant is off while an exam is open, and comes back when it is submitted or cancelled', async () => {
  const s = await student('exam@usc.edu');
  need((await ask(s)).status === 200, 'not available before the exam');
  const st = await exam(s, { action: 'start', kind: 'skill', id: 'discovery-pm' });
  need(st.status === 200, 'start ' + st.status);
  const locked = await ask(s);
  need(locked.status === 403 && locked.data.error.code === 'exam_locked', 'open exam did not lock: ' + locked.status);
  const other = await student('other@usc.edu');
  need((await ask(other)).status === 200, "one student's exam locked another student");
  const c = await exam(s, { action: 'cancel' });
  need(c.status === 200 && (await ask(s)).status === 200, 'cancel did not bring the assistant back');
  const st2 = await exam(s, { action: 'start', kind: 'skill', id: 'discovery-pm' });
  need((await ask(s)).status === 403, 'second exam did not lock');
  const sub = await exam(s, { action: 'submit', attempt: st2.data.attempt, answers: st2.data.items.map(() => 0) });
  need(sub.status === 200 && (await ask(s)).status === 200, 'submit did not bring the assistant back');
});

await step('an exam left open for more than 30 minutes no longer locks the assistant', async () => {
  const s = await student('stale@usc.edu');
  const st = await exam(s, { action: 'start', kind: 'skill', id: 'discovery-pm' });
  const old = new Date(Date.now() - 31 * 60e3).toISOString();
  await fetch(FAKE + '/rest/v1/exam_attempts?id=eq.' + st.data.attempt, { method: 'PATCH', headers: { apikey: 'sb_secret_test', 'content-type': 'application/json' }, body: JSON.stringify({ started_at: old }) });
  need((await ask(s)).status === 200, 'a stale attempt still locks');
});

await step('questions are limited per student and per hour, and one student cannot use up another\'s allowance', async () => {
  const a = await student('heavy@usc.edu'), b = await student('light@usc.edu');
  let last = null, firstRefused = 0;
  for (let i = 1; i <= 10; i++) { last = await ask(a); if (last.status === 429 && !firstRefused) firstRefused = i; }
  need(firstRefused === 9 && last.data.error.code === 'limit_hour', 'refused at ' + firstRefused + ' with ' + JSON.stringify(last.data));
  need((await ask(b)).status === 200, 'a second student was limited by the first');
});

await step('a quick burst is slowed down', async () => {
  const s = await student('burst@usc.edu');
  const out = [];
  for (let i = 0; i < 11; i++) out.push((await ask(s, BURST)).status);
  need(out.slice(0, 10).every(x => x === 200) && out[10] === 429, 'statuses ' + out.join(','));
});

await step('until the limits table exists the assistant still works', async () => {
  await jf('/__aioff?on=1');
  const s = await student('nolimits@usc.edu');
  const r = await ask(s);
  await jf('/__aioff?on=0');
  need(r.status === 200, 'assistant blocked while 009 is missing: ' + r.status);
});

await step('a deployment without accounts keeps the assistant open', async () => {
  const r = await ask(null, DEMO);
  need(r.status === 200, 'demo deployment: ' + r.status + ' ' + r.raw.slice(0, 80));
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
