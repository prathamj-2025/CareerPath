/* Admin content edits (supabase/migrations/008, api/content.js) over plain HTTP against the fake database:
   an admin's change reaches students, grading follows it, the answers never reach a student, and bad input is refused.
   Start servers with test/start-servers.sh. */
import { skillOf } from './keys.mjs';

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
await new Promise(r => setTimeout(r, 900));   // let the server's cached copy of the old data expire

const hdr = u => ({ authorization: 'Bearer ' + u.tok, 'content-type': 'application/json' });
async function person(email, roadmap, admin) {
  const r = await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Test Person' } }) });
  need(r.ok, 'signup ' + r.status);
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  const u = { email, tok, id: me.id };
  if (roadmap) {
    const p = await fetch(FAKE + '/rest/v1/profiles?id=eq.' + u.id, { method: 'PATCH', headers: hdr(u), body: JSON.stringify({ roadmap_id: roadmap }) });
    need(p.status === 204, 'roadmap ' + p.status);
  }
  if (admin) await jf('/__admin?email=' + email);
  return u;
}
const call = async (u, route, body) => {
  const r = await fetch(BASE + route, { method: body ? 'POST' : 'GET', headers: u ? hdr(u) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
const SK = 'discovery-pm';
const base = () => skillOf('pm', SK);
const qid = i => SK + '-q' + (i + 1);
const fields = (o = {}) => ({ q: 'What is the first thing a PM checks?', opts: ['Alpha', 'Beta', 'Gamma', 'Delta'], a: 2, lvl: 3, why: 'Because gamma.', ...o });
const startSkill = u => call(u, '/api/exam', { action: 'start', kind: 'skill', id: SK });
const keyOfItem = (it, over) => over[it.qid] != null ? over[it.qid] : skillOf('pm', SK).assessment.find((q, i) => qid(i) === it.qid).a;
const waitCache = () => new Promise(r => setTimeout(r, 900));   // the test server caches edits for 0.4 s (CONTENT_TTL_MS)

const admin = await person('boss@usc.edu', 'pm', true);
const stu = await person('stu@usc.edu', 'pm', false);

await step('with no edits, students and admins get no overrides and the files are used', async () => {
  const s = await call(stu, '/api/content');
  need(s.status === 200 && s.data.admin === false && Object.keys(s.data.skills).length === 0, JSON.stringify(s.data).slice(0, 200));
  need((await call(null, '/api/content')).status === 401, 'signed-out read allowed');
});

await step('only admins can change content', async () => {
  const body = { action: 'lesson-save', skill: SK, idx: 0, title: 'Hacked', body: 'Hacked body' };
  need((await call(stu, '/api/content', body)).status === 403, 'a student saved a lesson');
  need((await call(null, '/api/content', body)).status === 401, 'a signed-out caller saved a lesson');
  need((await call(stu, '/api/content', { action: 'q-draft', skill: SK, fields: fields() })).status === 403, 'a student drafted a question');
});

await step('a lesson edit publishes at once, reaches students, and keeps the old version', async () => {
  const r = await call(admin, '/api/content', { action: 'lesson-save', skill: SK, idx: 0, title: 'New first lesson', body: 'Fresh text for the first lesson.' });
  need(r.status === 200 && r.data.skills[SK].lessons[0].title === 'New first lesson', 'save ' + r.status + JSON.stringify(r.data).slice(0, 200));
  const s = await call(stu, '/api/content');
  const l = s.data.skills[SK].lessons[0];
  need(l.title === 'New first lesson' && l.body === 'Fresh text for the first lesson.', 'student does not see the edit');
  const rows = (await jf('/__content')).lessons.filter(x => x.skill_id === SK);
  need(rows.length === 2 && rows.some(x => x.status === 'archived' && x.version === 1 && x.title === base().lessons[0].title) && rows.some(x => x.status === 'live' && x.version === 2), 'versions ' + JSON.stringify(rows.map(x => [x.version, x.status])));
  const again = await call(admin, '/api/content', { action: 'lesson-save', skill: SK, idx: 0, title: 'Second wording', body: 'Fresh text again.' });
  const rows2 = (await jf('/__content')).lessons.filter(x => x.skill_id === SK);
  need(again.status === 200 && rows2.length === 3 && rows2.filter(x => x.status === 'live').length === 1, 'second edit ' + JSON.stringify(rows2.map(x => [x.version, x.status])));
});

await step('the answers never reach a student, only an admin', async () => {
  const s = JSON.stringify((await call(stu, '/api/content')).data);
  need(!/"a"\s*:|"why"\s*:/.test(s), 'student content carries an answer');
  const a = await call(admin, '/api/content', { action: 'q-draft', skill: SK, qid: qid(0), fields: fields() });
  need(a.status === 200, 'draft ' + a.status);
  const sa = a.data.skills[SK];
  need(sa.drafts.length === 1 && sa.drafts[0].fields.a === 2 && Number.isInteger(sa.assessment[0].a), 'admin view lacks answers or the draft');
  const s2 = JSON.stringify((await call(stu, '/api/content')).data);
  need(!/"a"\s*:|"why"\s*:|drafts|Alpha/.test(s2), 'a student can see a draft or an answer');
});

await step('a draft changes nothing for students until it is published', async () => {
  const st = await startSkill(stu);
  need(st.status === 200, 'start ' + st.status);
  need(st.data.items[0].q === base().assessment[0].q && st.data.items[0].v === 1, 'the draft leaked into the exam');
});

await step('publishing makes the new question live for exams, archives the old one, and grading follows it', async () => {
  const p = await call(admin, '/api/content', { action: 'q-publish', skill: SK, qid: qid(0) });
  need(p.status === 200, 'publish ' + p.status + JSON.stringify(p.data));
  const sa = p.data.skills[SK];
  need(sa.drafts.length === 0 && sa.assessment[0].v === 2 && sa.assessment[0].a === 2, 'view after publish');
  need(sa.archive.some(x => x.qid === qid(0) && x.v === 1 && x.fields.q === base().assessment[0].q && x.fields.a === base().assessment[0].a), 'version 1 not archived with its key');
  const u = await person('after@usc.edu', 'pm', false);
  const st = await startSkill(u);
  const it = st.data.items.find(x => x.qid === qid(0));
  need(it.q === fields().q && it.opts[2] === 'Gamma' && it.v === 2, 'the exam does not show the edited question');
  const answers = st.data.items.map(x => keyOfItem(x, { [qid(0)]: 2 }));
  const r = await call(u, '/api/exam', { action: 'submit', attempt: st.data.attempt, answers });
  need(r.data.pct === 100, 'graded ' + r.data.pct + ' with the new key');
  const old = await person('old@usc.edu', 'pm', false);
  const st2 = await startSkill(old);
  const wrong = st2.data.items.map(x => keyOfItem(x, { [qid(0)]: base().assessment[0].a }));   // the OLD key for question 1
  need(base().assessment[0].a !== 2, 'test needs a question whose key changes');
  const r2 = await call(old, '/api/exam', { action: 'submit', attempt: st2.data.attempt, answers: wrong });
  need(r2.data.pct === 90 && r2.data.detail.filter(d => !d.ok).length === 1, 'the old key still scored as right: ' + r2.data.pct);
});

await step('an attempt started before a change is graded against the version the student saw', async () => {
  const u = await person('mid@usc.edu', 'pm', false);
  const st = await startSkill(u);                                              // sees question 2 as written now
  const old = st.data.items.find(x => x.qid === qid(1));
  await call(admin, '/api/content', { action: 'q-draft', skill: SK, qid: qid(1), fields: fields({ q: 'A different second question?', a: (base().assessment[1].a + 1) % 4 }) });
  const pub = await call(admin, '/api/content', { action: 'q-publish', skill: SK, qid: qid(1) });
  need(pub.status === 200, 'publish ' + pub.status);
  const answers = st.data.items.map(x => keyOfItem(x, {}));                    // every answer right for what the student saw
  const r = await call(u, '/api/exam', { action: 'submit', attempt: st.data.attempt, answers: answers.map((a, i) => (st.data.items[i].qid === qid(0) ? 2 : a)) });
  need(old.v === 1 && r.status === 200 && r.data.pct === 100, 'graded against the new key: ' + r.status + ' ' + (r.data && r.data.pct));
});

await step('a new question goes live after publishing and joins the exam; discarding removes a draft', async () => {
  const d = await call(admin, '/api/content', { action: 'q-draft', skill: SK, fields: fields({ q: 'A brand new question?', a: 1 }) });
  const nd = d.data.skills[SK].drafts.find(x => x.isNew);
  need(d.status === 200 && nd && /^discovery-pm-n\d+$/.test(nd.qid), 'new draft ' + d.status);
  const before = (await startSkill(await person('n1@usc.edu', 'pm', false))).data.items.length;
  const p = await call(admin, '/api/content', { action: 'q-publish', skill: SK, qid: nd.qid });
  need(p.status === 200 && p.data.skills[SK].assessment.length === before + 1, 'not appended');
  const st = await startSkill(await person('n2@usc.edu', 'pm', false));
  need(st.data.items.length === before + 1 && st.data.items.some(x => x.qid === nd.qid && x.q === 'A brand new question?'), 'the new question is not in the exam');
  const d2 = await call(admin, '/api/content', { action: 'q-draft', skill: SK, qid: qid(2), fields: fields() });
  need(d2.data.skills[SK].drafts.length === 1, 'draft not saved');
  const x = await call(admin, '/api/content', { action: 'q-discard', qid: qid(2) });
  need(x.status === 200 && x.data.skills[SK].drafts.length === 0, 'draft not discarded');
});

await step('bad questions are refused with a reason and nothing is saved', async () => {
  const before = JSON.stringify((await jf('/__content')).questions);
  const bad = async (f, m) => { const r = await call(admin, '/api/content', { action: 'q-draft', skill: SK, qid: qid(3), fields: f }); need(r.status === 400, m + ' gave ' + r.status); };
  await bad(fields({ opts: ['a', 'b', 'c'] }), 'three options');
  await bad(fields({ opts: ['a', 'b', 'c', ''] }), 'an empty option');
  await bad(fields({ a: 4 }), 'answer 4');
  await bad(fields({ lvl: 9 }), 'level 9');
  await bad(fields({ q: '' }), 'empty question');
  await bad(fields({ q: 'x'.repeat(900) }), 'a very long question');
  need((await call(admin, '/api/content', { action: 'q-draft', skill: SK, qid: 'nope-q1', fields: fields() })).status === 404, 'a missing question was accepted');
  need((await call(admin, '/api/content', { action: 'lesson-save', skill: SK, idx: 999, title: 't', body: 'b' })).status === 404, 'a missing lesson was accepted');
  need((await call(admin, '/api/content', { action: 'lesson-save', skill: SK, idx: 0, title: '', body: 'b' })).status === 400, 'an empty title was accepted');
  need((await call(admin, '/api/content', { action: 'lesson-save', skill: 'nope', idx: 0, title: 't', body: 'b' })).status === 404, 'a missing skill was accepted');
  need((await call(admin, '/api/content', { action: 'q-publish', skill: SK, qid: qid(3) })).status === 404, 'published a question with no draft');
  need(JSON.stringify((await jf('/__content')).questions) === before, 'a refused request still wrote');
});

await step('retiring removes a question from exams, keeps its history, and a skill keeps at least 5', async () => {
  const r = await call(admin, '/api/content', { action: 'q-retire', skill: SK, qid: qid(4) });
  need(r.status === 200 && !r.data.skills[SK].assessment.some(x => x.qid === qid(4)), 'still in the bank');
  need(r.data.skills[SK].archive.some(x => x.qid === qid(4) && x.retiredOut), 'no history row');
  const st = await startSkill(await person('r1@usc.edu', 'pm', false));
  need(!st.data.items.some(x => x.qid === qid(4)), 'a retired question is still asked');
  for (let i = 5; i < 10; i++) need((await call(admin, '/api/content', { action: 'q-retire', skill: SK, qid: qid(i) })).status === 200, 'retire ' + i);
  const left = (await call(admin, '/api/content')).data.skills[SK].assessment.length;
  const x = await call(admin, '/api/content', { action: 'q-retire', skill: SK, qid: qid(0) });
  need(left === 5 && x.status === 409 && x.data.error.code === 'too_few', 'left ' + left + ', next retire gave ' + x.status);
});

await step('a module exam draws from the edited questions too', async () => {
  const u = await person('mod@usc.edu', 'pm', false);
  const r = await call(u, '/api/exam', { action: 'start', kind: 'module', id: 'pm-fundamentals' });
  need(r.status === 403 && r.data.error.code === 'not_eligible', 'module start ' + r.status);   // eligibility still applies
});

await step('if the 008 tables are not there yet, the site keeps working from the files', async () => {
  await jf('/__contentoff?on=1');
  await waitCache();
  const s = await call(stu, '/api/content');
  need(s.status === 200 && Object.keys(s.data.skills).length === 0, 'content endpoint ' + s.status);
  const st = await startSkill(await person('files@usc.edu', 'pm', false));
  need(st.status === 200 && st.data.items.length === base().assessment.length && st.data.items[0].q === base().assessment[0].q, 'exam did not fall back to the files');
  await jf('/__contentoff?on=0');
  await waitCache();
  need(Object.keys((await call(stu, '/api/content')).data.skills).length === 1, 'edits did not come back');
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
