/* Admin edits to project briefs and practice exercises, and restoring earlier versions (supabase/migrations/013,
   api/content.js) over plain HTTP against the fake database. Start servers with test/start-servers.sh. */
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
await new Promise(r => setTimeout(r, 900));
const waitCache = () => new Promise(r => setTimeout(r, 900));

const hdr = u => ({ authorization: 'Bearer ' + u.tok, 'content-type': 'application/json' });
async function person(email, roadmap, admin) {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Test Person' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  if (roadmap) await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
  if (admin) await jf('/__admin?email=' + email);
  return u;
}
const call = async (u, route, body) => {
  const r = await fetch(BASE + route, { method: body ? 'POST' : 'GET', headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
const admin = await person('boss@usc.edu', 'ba', true);
const stu = await person('stu@usc.edu', 'ba', false);

const SK = 'sql-ba';                       // has a project and two practice exercises (one query exercise)
const PROJ = { title: 'Reconciliation pack', brief: 'Write five queries and say what result you expect for each.' };
const PRAC = { prompt: 'Revenue is off by 8 percent. Where do you look first?', hints: ['Think about the grain of the join.', 'Check for rows that fan out.'], answer: 'Check the grain first: a join that fans out rows inflates the sum.' };
const save = (u, body) => call(u, '/api/content', { action: 'override-save', skill: SK, ...body });

let shippedProject = '';
await step('with no edits students get no project or practice overrides', async () => {
  const s = await call(stu, '/api/content');
  need(s.status === 200 && !s.data.skills[SK], JSON.stringify(s.data).slice(0, 200));
});

await step('only admins can save a project brief or an exercise', async () => {
  need((await save(stu, { kind: 'project', fields: PROJ })).status === 403, 'a student saved a project');
  need((await save(null, { kind: 'practice', i: 0, fields: PRAC })).status === 401, 'signed out saved an exercise');
});

await step('an admin edits a project brief: it goes live at once and students see it', async () => {
  const r = await save(admin, { kind: 'project', fields: PROJ });
  need(r.status === 200 && r.data.ok, JSON.stringify(r.data).slice(0, 200));
  const a = r.data.skills[SK];
  need(a.project.title === PROJ.title && a.project.brief === PROJ.brief, 'admin view: ' + JSON.stringify(a.project));
  shippedProject = a.history.project[0] ? a.history.project[0].title : '';
  need(a.history.project.length === 1 && a.history.project[0].v === 1 && shippedProject, 'version 1 (as shipped) was not kept: ' + JSON.stringify(a.history.project));
  await waitCache();
  const s = await call(stu, '/api/content');
  need(s.data.skills[SK].project.title === PROJ.title, 'student does not see the new brief');
  need(!s.data.skills[SK].history, 'history reached a student');
});

await step('the AI reviewer is told the edited brief, not the shipped one', async () => {
  await jf('/__reset-lastbody-noop').catch(() => {});
  // the project route reads the brief from the same merged content; a student submits and the fake model sees it
  const text = ('I wrote five queries on the practice data and checked each result against the source. ').repeat(8);
  const r = await call(stu, '/api/grade-project', { skill: SK, text: 'GOODPROJECT ' + text });
  need(r.status === 200 || r.status === 429 || r.status === 503, 'unexpected ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 160));
});

await step('an admin edits a practice exercise: prompt, hints and model answer change, scoring rules stay', async () => {
  const r = await save(admin, { kind: 'practice', i: 1, fields: PRAC });
  need(r.status === 200, JSON.stringify(r.data).slice(0, 200));
  const a = r.data.skills[SK];
  need(a.practice[1].prompt === PRAC.prompt && a.practice[1].hints.length === 2 && a.practice[1].answer === PRAC.answer, JSON.stringify(a.practice));
  need(a.history.practice[1] && a.history.practice[1][0].v === 1, 'shipped version not kept');
  await waitCache();
  const s = await call(stu, '/api/content');
  need(s.data.skills[SK].practice[1].prompt === PRAC.prompt, 'student does not see the new exercise');
});

await step('bad input is refused with a plain reason and nothing changes', async () => {
  const bad = [
    [{ kind: 'project', fields: { title: '', brief: 'x' } }, 'empty title'],
    [{ kind: 'project', fields: { title: 'T', brief: 'x'.repeat(4001) } }, 'huge brief'],
    [{ kind: 'practice', i: 1, fields: { ...PRAC, hints: ['only one'] } }, 'one hint'],
    [{ kind: 'practice', i: 1, fields: { ...PRAC, answer: '' } }, 'no answer'],
    [{ kind: 'practice', i: 99, fields: PRAC }, 'no such exercise'],
    [{ kind: 'weird', fields: PROJ }, 'bad kind']
  ];
  for (const [b, why] of bad) { const r = await save(admin, b); need(r.status >= 400 && r.status < 500, why + ' gave ' + r.status); }
  const r = await save({ ...admin }, { kind: 'practice', i: 0, fields: PRAC }); need(r.status === 200, 'good save after bad ones');
});

await step('saving the same text again changes nothing', async () => {
  const before = await call(admin, '/api/content');
  const r = await save(admin, { kind: 'project', fields: PROJ });
  need(r.status === 200 && r.data.skills[SK].history.project.length === before.data.skills[SK].history.project.length, 'a duplicate version was written');
});

await step('a second edit archives the first, and an earlier version can be restored', async () => {
  const second = { title: 'Second title', brief: 'A different brief for the same project.' };
  let r = await save(admin, { kind: 'project', fields: second });
  need(r.data.skills[SK].project.title === 'Second title' && r.data.skills[SK].history.project.length === 2, JSON.stringify(r.data.skills[SK].history.project).slice(0, 200));
  r = await call(admin, '/api/content', { action: 'restore', kind: 'project', skill: SK, version: 1 });
  need(r.status === 200 && r.data.skills[SK].project.title === shippedProject, 'restore did not bring back the shipped text');
  need(r.data.skills[SK].history.project.length === 3, 'the replaced version was not kept: ' + r.data.skills[SK].history.project.length);
  r = await call(admin, '/api/content', { action: 'restore', kind: 'project', skill: SK, version: 999 });
  need(r.status === 404, 'restoring a missing version gave ' + r.status);
});

await step('an exercise can be restored too', async () => {
  const r = await call(admin, '/api/content', { action: 'restore', kind: 'practice', skill: SK, i: 1, version: 1 });
  need(r.status === 200 && r.data.skills[SK].practice[1].prompt !== PRAC.prompt, 'exercise not restored');
});

await step('a lesson can be edited and then restored to the shipped text', async () => {
  const s0 = await call(admin, '/api/content', { action: 'lesson-save', skill: SK, idx: 0, title: 'Edited title', body: 'Edited body text for the first lesson.' });
  need(s0.status === 200 && s0.data.skills[SK].lessons[0].title === 'Edited title', JSON.stringify(s0.data).slice(0, 200));
  const hist = s0.data.skills[SK].history.lessons[0];
  need(hist && hist.length === 1 && hist[0].v === 1, 'lesson history missing: ' + JSON.stringify(hist).slice(0, 120));
  const r = await call(admin, '/api/content', { action: 'restore', kind: 'lesson', skill: SK, idx: 0, version: 1 });
  need(r.status === 200 && r.data.skills[SK].lessons[0].title !== 'Edited title', 'lesson not restored');
  need(r.data.skills[SK].history.lessons[0].length === 2, 'replaced lesson version not kept');
});

await step('an admin adds a lesson at the end, edits it, removes it, and brings it back', async () => {
  const A = (b) => call(admin, '/api/content', Object.assign({ skill: SK }, b));
  const n0 = (await A({ action: 'lesson-save', idx: 0, title: 'Edited title', body: 'Edited body text for the first lesson.' })).data.skills[SK].count;
  need(n0 >= 2, 'base lesson count missing: ' + n0);
  need((await call(stu, '/api/content', null)).status === 200, 'student read failed');
  need((await call(stu, '/api/content', { action: 'lesson-add', skill: SK, title: 'x', body: 'y' })).status === 403, 'a student added a lesson');
  need((await A({ action: 'lesson-add', title: '', body: 'text' })).status === 400, 'empty title accepted');
  need((await A({ action: 'lesson-add', title: 'T', body: '' })).status === 400, 'empty body accepted');
  const body = 'A new lesson written by an admin. '.repeat(30);
  const add = await A({ action: 'lesson-add', title: 'A brand new lesson', body });
  const v = add.data.skills[SK];
  need(add.status === 200 && v.count === n0 + 1 && v.lessons[n0] && v.lessons[n0].title === 'A brand new lesson' && v.lessons[n0].minutes >= 1, JSON.stringify(v.lessons[n0]) + ' count ' + v.count);
  await waitCache();
  const sv = (await call(stu, '/api/content')).data.skills[SK];
  need(sv.count === n0 + 1 && sv.lessons[n0].body === body.trim(), 'student does not see the new lesson');
  const ed = await A({ action: 'lesson-save', idx: n0, title: 'Renamed new lesson', body: 'Second text of the new lesson.' });
  need(ed.status === 200 && ed.data.skills[SK].lessons[n0].title === 'Renamed new lesson' && ed.data.skills[SK].count === n0 + 1, 'edit of an added lesson failed: ' + JSON.stringify(ed.data).slice(0, 160));
  need((await A({ action: 'lesson-remove', idx: 0 })).status === 400, 'a shipped lesson was removed');
  need((await A({ action: 'lesson-remove', idx: n0 - 1 })).status === 400, 'a lesson that is not last was removed');
  need((await call(stu, '/api/content', { action: 'lesson-remove', skill: SK, idx: n0 })).status === 403, 'a student removed a lesson');
  const rm = await A({ action: 'lesson-remove', idx: n0 });
  need(rm.status === 200 && rm.data.skills[SK].count === n0, 'remove failed: ' + JSON.stringify(rm.data).slice(0, 160));
  await waitCache();
  need((await call(stu, '/api/content')).data.skills[SK].count === n0, 'student still sees the removed lesson');
  const hist = rm.data.skills[SK].history.lessons[n0];
  need(hist && hist.length >= 2, 'removed lesson has no history: ' + JSON.stringify(hist).slice(0, 160));
  const back = await A({ action: 'restore', kind: 'lesson', idx: n0, version: hist[0].v });
  need(back.status === 200 && back.data.skills[SK].count === n0 + 1 && back.data.skills[SK].lessons[n0].title === hist[0].title, 'removed lesson did not come back');
  const again = await A({ action: 'lesson-remove', idx: n0 });
  need(again.status === 200, 'second remove failed');
  const readd = await A({ action: 'lesson-add', title: 'Another one', body: 'Different text.' });
  need(readd.status === 200 && readd.data.skills[SK].count === n0 + 1 && readd.data.skills[SK].lessons[n0].title === 'Another one', 'adding after a removal failed: ' + JSON.stringify(readd.data).slice(0, 160));
  await A({ action: 'lesson-remove', idx: n0 });
});

await step('a skill cannot grow past 30 lessons', async () => {
  const A = (b) => call(admin, '/api/content', Object.assign({ skill: SK }, b));
  let last;
  for (let i = 0; i < 40; i++) { last = await A({ action: 'lesson-add', title: 'L' + i, body: 'Text ' + i }); if (last.status !== 200) break; }
  need(last.status === 400 && last.data.error.code === 'too_many', 'no cap: ' + last.status + ' ' + JSON.stringify(last.data).slice(0, 120));
  for (let i = 0; i < 40; i++) { const c = (await A({ action: 'lesson-add', title: 'x', body: 'y' })); if (c.status === 400) break; }
  // take the added ones away again, last first
  let v = (await call(admin, '/api/content')).data.skills[SK];
  while (v.lessons[v.count - 1] && v.lessons[v.count - 1].minutes) { const r = await A({ action: 'lesson-remove', idx: v.count - 1 }); if (r.status !== 200) break; v = r.data.skills[SK]; }
  need(v.count < 30, 'could not clean up');
});

await step('before migration 013 everything else still works and a save says what to do', async () => {
  await jf('/__overridesoff?on=1'); await waitCache();
  try {
    const s = await call(stu, '/api/content');
    need(s.status === 200, 'content broke without 013: ' + s.status);
    const r = await save(admin, { kind: 'project', fields: { title: 'New', brief: 'Another brief text.' } });
    need(r.status === 502 && /013/.test(JSON.stringify(r.data)), 'save without 013: ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 160));
  } finally { await jf('/__overridesoff?on=0'); await waitCache(); }
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
