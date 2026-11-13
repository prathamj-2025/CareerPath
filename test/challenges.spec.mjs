/* Weekly challenges saved in the database, and the assistant lock during a challenge, over plain HTTP against the fake
   database and the fake model. Start servers with test/start-servers.sh. */
const REAL = process.env.REAL_URL || 'http://localhost:3115';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const jf = async (path, body) => (await fetch(FAKE + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
await jf('/__reset');
await sleep(900);                                   // the server's cached copy of earlier test data expires

const hdr = u => ({ authorization: 'Bearer ' + u.tok, 'content-type': 'application/json' });
async function person(email, roadmap, admin) {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Test ' + email.split('@')[0], school: 'USC' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  if (roadmap) await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
  if (admin) await jf('/__admin?email=' + email);
  return u;
}
const api = async (u, route, body, base) => {
  const r = await fetch((base || REAL) + route, { method: body ? 'POST' : 'GET', headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
const ask = async u => {
  const r = await fetch(REAL + '/api/ask', { method: 'POST', headers: hdr(u), body: JSON.stringify({ rules: 'Be brief.', messages: [{ role: 'user', content: 'What is a funnel?' }] }) });
  let data = null; const raw = await r.text(); try { data = JSON.parse(raw); } catch (e) {}
  return { status: r.status, data };
};
const GOOD = 'I would build the first-day tutorial. 60% of new users leave on day 1, which is the biggest problem and it affects everyone who joins. ' +
  'Dark mode and PDF export are useful, but they can wait for the next sprint because fewer users depend on them. After launch I would check day-1 retention.';
const NEW = { action: 'save', roleId: 'pm', week: 5, title: 'Pick a metric', brief: 'Your team ships a new search box. Name one metric that tells you it worked, and say why.', minWords: 20,
  rubric: [{ label: 'Names one metric', re: 'metric|rate|conversion|click' }, { label: 'Says why', re: 'because|so that|since' }] };

const admin = await person('ada@usc.edu', null, true);
const stu = await person('sam@usc.edu', 'pm');
const stuBa = await person('bea@usc.edu', 'ba');

await step('a student is sent the live challenges with rubric labels only, never the scoring patterns or drafts', async () => {
  const r = await api(stu, '/api/challenges');
  need(r.status === 200 && r.data.admin === false, JSON.stringify(r.data).slice(0, 120));
  const ids = r.data.challenges.map(c => c.cid).sort();
  need(ids.join() === 'ba-start,pjm-start,pm-start', 'wrong challenges: ' + ids.join());
  const text = JSON.stringify(r.data);
  need(!text.includes('"re"') && !text.includes('order\\\\s+by') && !text.includes('limit'), 'a scoring pattern reached a student');
  need(r.data.challenges.every(c => c.rubric.length >= 4 && c.rubric.every(x => typeof x.label === 'string' && Object.keys(x).join() === 'label')), 'rubric shape');
  need((await api(null, '/api/challenges')).status === 401, 'signed-out read was allowed');
});

await step('an admin is sent every challenge, drafts and patterns included', async () => {
  const r = await api(admin, '/api/challenges');
  need(r.data.admin && r.data.challenges.length >= 9, 'admin list: ' + r.data.challenges.length);
  const w2 = r.data.challenges.find(c => c.cid === 'pm-w2');
  need(w2 && w2.status === 'draft' && w2.rubric[0].re, 'draft or pattern missing');
  need(r.data.challenges.find(c => c.cid === 'pm-start').week === 1, 'week 1 is not the easy one');
});

await step('only an admin can save or publish, and a bad challenge is refused with a reason', async () => {
  need((await api(stu, '/api/challenges', NEW)).status === 403, 'a student saved a challenge');
  need((await api(null, '/api/challenges', NEW)).status === 401, 'a signed-out caller saved a challenge');
  const bad = async (patch, word) => {
    const r = await api(admin, '/api/challenges', Object.assign({}, NEW, patch));
    need(r.status === 400 && r.data.error.message.toLowerCase().includes(word), word + ': ' + r.status + ' ' + JSON.stringify(r.data));
  };
  await bad({ title: '' }, 'title'); await bad({ brief: '' }, 'brief'); await bad({ week: 0 }, 'week'); await bad({ roleId: 'xx' }, 'roadmap');
  await bad({ minWords: 0 }, 'minimum'); await bad({ rubric: [] }, 'rubric'); await bad({ rubric: [{ label: 'x', re: '(unclosed' }] }, 'not valid');
  await bad({ rubric: [{ label: 'x', re: '(a+)+$' }] }, 'slow'); await bad({ rubric: [{ label: '', re: 'x' }] }, 'description');
  need((await jf('/__challenges')).length === 0, 'a refused challenge was saved');
});

let cid;
await step('a saved challenge is a draft: students do not see it, and the admin can edit it', async () => {
  const r = await api(admin, '/api/challenges', NEW);
  need(r.status === 200, JSON.stringify(r.data));
  const made = r.data.challenges.find(c => c.title === 'Pick a metric');
  need(made && made.status === 'draft' && made.cid.startsWith('pm-w5-') && made.rubric.length === 2, JSON.stringify(made));
  cid = made.cid;
  const rows = await jf('/__challenges');
  need(rows.length === 1 && rows[0].cid === cid && rows[0].status === 'draft' && rows[0].role_id === 'pm' && rows[0].min_words === 20, JSON.stringify(rows));
  await sleep(500);
  need(!(await api(stu, '/api/challenges')).data.challenges.some(c => c.cid === cid), 'a draft reached a student');
  const edit = await api(admin, '/api/challenges', Object.assign({}, NEW, { cid, title: 'Pick one metric' }));
  need(edit.status === 200 && edit.data.challenges.find(c => c.cid === cid).title === 'Pick one metric', 'edit not saved');
  need((await jf('/__challenges')).length === 1, 'an edit made a second row');
});

await step('publishing makes it live for students and closes the one it replaces; nothing is deleted', async () => {
  need((await api(admin, '/api/challenges', { action: 'status', cid, to: 'live' })).status === 200, 'publish failed');
  const rows = await jf('/__challenges');
  need(rows.find(r => r.cid === cid).status === 'live' && rows.find(r => r.cid === 'pm-start').status === 'closed', JSON.stringify(rows.map(r => [r.cid, r.status])));
  await sleep(500);
  const s = (await api(stu, '/api/challenges')).data.challenges.filter(c => c.roleId === 'pm');
  need(s.length === 1 && s[0].cid === cid, 'students do not see the new live challenge: ' + JSON.stringify(s.map(c => c.cid)));
  const other = (await api(stuBa, '/api/challenges')).data.challenges.filter(c => c.roleId === 'ba');
  need(other.length === 1 && other[0].cid === 'ba-start', 'another roadmap changed');
});

await step('scoring follows the new live challenge: the closed one is refused, the live one is scored with the admin\'s rubric', async () => {
  const old = await api(stu, '/api/grade-challenge', { cid: 'pm-start', answer: GOOD }, REAL);
  need(old.status === 404, 'the closed challenge still took an answer: ' + old.status);
  const ans = 'The metric I would watch is the search conversion rate, because it shows whether people find what they came for.';
  const r = await api(stu, '/api/grade-challenge', { cid, answer: ans });
  need(r.status === 200 && r.data.submission.pct === 100 && r.data.submission.of === 2, JSON.stringify(r.data).slice(0, 200));
});

await step('a live or closed challenge cannot be edited, and impossible status changes are refused', async () => {
  const e = await api(admin, '/api/challenges', Object.assign({}, NEW, { cid, title: 'Changed after the fact' }));
  need(e.status === 409 && e.data.error.code === 'locked', 'live edit: ' + e.status);
  const c = await api(admin, '/api/challenges', Object.assign({}, NEW, { cid: 'pm-start', title: 'x' }));
  need(c.status === 409, 'closed edit: ' + c.status);
  need((await api(admin, '/api/challenges', { action: 'status', cid: 'pm-start', to: 'live' })).status === 409, 'a closed challenge was reopened');
  need((await api(admin, '/api/challenges', { action: 'status', cid, to: 'draft' })).status === 409, 'moved back to draft');
  need((await api(admin, '/api/challenges', { action: 'status', cid: 'nope', to: 'live' })).status === 404, 'unknown challenge');
  need((await api(admin, '/api/challenges', { action: 'weird' })).status === 400, 'unknown action');
  need((await api(admin, '/api/challenges', { action: 'save', cid: 'pm-w2', roleId: 'ba', week: 2, title: 't', brief: 'b', minWords: 5, rubric: [{ label: 'l', re: 'x' }] })).status === 400, 'roadmap changed');
});

await step('a file challenge can be scheduled and published from the admin side too', async () => {
  const w2 = 'pm-w2';
  need((await api(admin, '/api/challenges', { action: 'status', cid: w2, to: 'scheduled' })).status === 200, 'schedule failed');
  need((await jf('/__challenges')).find(r => r.cid === w2).status === 'scheduled', 'row not saved as scheduled');
  need((await api(admin, '/api/challenges', { action: 'status', cid: w2, to: 'live' })).status === 200, 'publish failed');
  const rows = await jf('/__challenges');
  need(rows.find(r => r.cid === w2).status === 'live' && rows.find(r => r.cid === cid).status === 'closed', JSON.stringify(rows.map(r => [r.cid, r.status])));
  need(rows.find(r => r.cid === w2).rubric.length === 4 && rows.find(r => r.cid === w2).title.includes('guardrail'), 'file challenge not copied whole');
});

let lockStu;
await step('while a student has the challenge open, the assistant is refused by the server; leaving, or submitting, lifts it', async () => {
  lockStu = await person('lock@usc.edu', 'ba');
  need((await ask(lockStu)).status === 200, 'not available before');
  const open = await api(lockStu, '/api/challenges', { action: 'open', cid: 'ba-start' });
  need(open.status === 200 && open.data.locked === true, JSON.stringify(open.data));
  const a = await ask(lockStu);
  need(a.status === 403 && a.data.error.code === 'exam_locked', 'open challenge did not lock the assistant: ' + a.status);
  const other = await person('free@usc.edu', 'ba');
  need((await ask(other)).status === 200, "one student's challenge locked another student");
  need((await api(lockStu, '/api/challenges', { action: 'leave' })).status === 200 && (await ask(lockStu)).status === 200, 'leaving did not lift the lock');
  await api(lockStu, '/api/challenges', { action: 'open', cid: 'ba-start' });
  need((await ask(lockStu)).status === 403, 'second open did not lock');
  const sub = await api(lockStu, '/api/grade-challenge', { cid: 'ba-start', answer: 'SELECT product, SUM(quantity) FROM orders WHERE order_date >= DATE_TRUNC(\'month\', CURRENT_DATE) GROUP BY product ORDER BY 2 DESC LIMIT 3' });
  need(sub.status === 200, 'submit ' + sub.status + JSON.stringify(sub.data).slice(0, 120));
  need((await ask(lockStu)).status === 200, 'submitting did not lift the lock');
});

await step('there is no lock for a challenge already submitted, one that is not live, or one on another roadmap', async () => {
  need((await api(lockStu, '/api/challenges', { action: 'open', cid: 'ba-start' })).data.locked === false, 'locked after submitting');
  need((await ask(lockStu)).status === 200, 'assistant off after submitting');
  const s = await person('wrong@usc.edu', 'ba');
  need((await api(s, '/api/challenges', { action: 'open', cid: 'pm-w2' })).data.locked === false, 'locked for another roadmap');
  need((await api(s, '/api/challenges', { action: 'open', cid: 'nope' })).data.locked === false, 'locked for an unknown challenge');
  need((await ask(s)).status === 200, 'assistant off');
  const ad = await api(admin, '/api/challenges', { action: 'open', cid: 'ba-start' });
  need(ad.status === 200 && ad.data.locked === false, 'an admin was locked');
});

await step('an abandoned challenge page stops locking the assistant after 30 minutes', async () => {
  const s = await person('stale@usc.edu', 'ba');
  await api(s, '/api/challenges', { action: 'open', cid: 'ba-start' });
  need((await ask(s)).status === 403, 'not locked');
  const at = (await (await fetch(FAKE + '/__attempts?email=stale@usc.edu')).json());
  need(at.length === 1 && at[0].kind === 'challenge', 'attempt not recorded: ' + JSON.stringify(at));
  await fetch(FAKE + '/__age?id=' + at[0].id + '&minutes=40');
  need((await ask(s)).status === 200, 'a 40-minute-old open page still locks');
});

await step('before 011 is run, the site uses the challenges in the files and nothing breaks', async () => {
  // A server that has never seen the table: loaded fresh, the list is exactly the challenges in the files.
  const mod = await import('../api/_challenges.js');
  const list = await mod.challenges(async () => ({ ok: false, status: 404, data: { code: 'PGRST205' } }));
  need(list.length === mod.base().list.length && list.filter(c => c.status === 'live').map(c => c.cid).sort().join() === 'ba-start,pjm-start,pm-start', 'files not used on their own');
  await jf('/__challengesoff?on=1'); await sleep(500);
  const r = await api(stu, '/api/challenges');
  need(r.status === 200 && r.data.challenges.length >= 1, 'the list broke when the table went missing: ' + r.status);
  const sv = await api(admin, '/api/challenges', NEW);
  need(sv.status === 502 && sv.data.error.code === 'save_failed', 'a save without the table did not fail cleanly: ' + sv.status);
  const s = await person('early@usc.edu', 'ba');
  need((await api(s, '/api/challenges', { action: 'open', cid: 'ba-start' })).data.locked === false, 'reported a lock that was not recorded');
  need((await ask(s)).status === 200, 'the assistant was blocked without 011');
  await jf('/__challengesoff?on=0');
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
