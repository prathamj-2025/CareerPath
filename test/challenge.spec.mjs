/* Weekly challenge for real accounts: scored and saved by the server, never by the page.
   Needs: fake Supabase (3113), the fake model (3112), and a real-mode server with the service key set (3115):
     CP_DEMO=0 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test \
       AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 PORT=3115 node test/devserver.mjs
   and the usual real-mode server without the key (3114) for the "not switched on" check. */
import { chromium } from 'playwright';
import vm from 'node:vm';
import fs from 'node:fs';

const BASE = process.env.CH_URL || 'http://localhost:3115';
const NOKEY = process.env.REAL_URL || 'http://localhost:3114';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const j = async (path, body) => (await fetch(FAKE + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)).json();
const need = (c, m) => { if (!c) throw new Error(m); };
await j('/__reset');

// The course data, loaded the way the server loads it, to know what score an answer must get.
const win = {}; const ctx = vm.createContext({ window: win });
for (const f of ['data6.js', 'challenge.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx);
const PM1 = win.CP_CHALLENGES.find(c => c.cid === 'pm-w1');
const GOOD = 'First I would segment the drop by platform, channel and cohort rather than look at one number. Second I would check the acquisition mix, ' +
  'because a change in paid or organic traffic can lower retention without any product change. Third I would rule out an instrumentation or tracking error ' +
  'in the logging pipeline before blaming the product. Each check would tell me something different: if the drop is in one channel the mix explains it, ' +
  'and if it is everywhere the data quality check would confirm or eliminate a broken event. Then I would pick the next step based on what the first check showed, start by the cheapest one.';
const WEAK = 'I would look at the numbers and talk to the team about what changed in the product during those weeks and then decide what to do about it after we have discussed it as a group together.';
const EXPECT = win.CP_CHALLENGE.score(PM1, GOOD);
need(EXPECT.pct >= 80 && !EXPECT.short, 'test answer is not a strong one: ' + JSON.stringify(EXPECT));

async function fresh() {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await c.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signup(page, name, email, school) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  if (school) await page.selectOption('#su-school', school);
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
}
async function pickRole(page, id) {
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="' + id + '"]');
  await page.waitForSelector('[data-action="open-track"], .skill-row');
}
const saved = async (email, roadmap) => { for (let i = 0; i < 40; i++) { if ((await j('/__profile?email=' + email)).roadmap_id === roadmap) return; await new Promise(r => setTimeout(r, 250)); } throw new Error('roadmap never saved for ' + email); };
const openChallenge = async (page) => { await page.click('[data-nav="challenge"]'); await page.waitForSelector('#ch-text, .check-panel'); };
const call = (page, body, url) => page.evaluate(async ({ body, url }) => {
  const t = await CP_AUTH.token();
  const r = await fetch(url + '/api/grade-challenge', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, { body, url: url || '' });

let tia, sam, ola;

await step('a submitted answer is scored and saved by the server, and the page shows it', async () => {
  tia = await fresh(); await signup(tia, 'Tia Ramirez', 'tia@usc.edu', 'USC'); await pickRole(tia, 'pm'); await saved('tia@usc.edu', 'pm');
  await openChallenge(tia);
  await tia.fill('#ch-text', GOOD);
  await tia.click('[data-action="ch-submit"]');
  await tia.waitForSelector('.check-panel', { timeout: 10000 });
  const txt = await tia.textContent('.check-panel');
  need(txt.includes('Submitted') && txt.includes(EXPECT.pct + '%'), 'score not shown: ' + txt.slice(0, 120));
  const rows = await j('/__subs');
  need(rows.length === 1 && rows[0].score === EXPECT.pct && rows[0].hits === EXPECT.hit && rows[0].challenge_id === 'pm-w1', JSON.stringify(rows));
  need(rows[0].answer === GOOD.trim() && rows[0].roadmap_id === 'pm' && /^\d{4}-\d\d-\d\d$/.test(rows[0].week_of), 'row fields wrong: ' + JSON.stringify(rows[0]).slice(0, 200));
  const fb = await tia.textContent('body');
  need(fb.includes('REVIEW: you scored ' + EXPECT.pct + '%'), 'written review missing');
  need(tia.errs.length === 0, tia.errs.join('; '));
});

await step('the browser cannot write a score itself', async () => {
  const r = await tia.evaluate(async (fake) => {
    const t = await CP_AUTH.token();
    const out = {};
    for (const body of [{ user_id: CP_AUTH.userId(), challenge_id: 'pm-w1', roadmap_id: 'pm', week_of: '2026-10-19', answer: 'x', score: 100, hits: 5, words: 1, feedback: '' }]) {
      const x = await fetch(fake + '/rest/v1/challenge_submissions', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'sb_publishable_test', authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
      out.insert = x.status;
    }
    return out;
  }, FAKE);
  need(r.insert === 401, 'a student insert was accepted: ' + JSON.stringify(r));
  need((await j('/__subs')).length === 1, 'row count changed');
});

await step('a second submission returns the stored one and adds nothing', async () => {
  const r = await call(tia, { cid: 'pm-w1', answer: WEAK });
  need(r.status === 200 && r.body.already === true && r.body.submission.pct === EXPECT.pct && r.body.submission.points === 0, JSON.stringify(r.body).slice(0, 200));
  const rows = await j('/__subs');
  need(rows.length === 1 && rows[0].score === EXPECT.pct, 'the stored row changed');
});

await step('requests are refused without a sign-in, for another roadmap, for unknown or draft challenges, and for bad input', async () => {
  const anon = await fetch(BASE + '/api/grade-challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cid: 'pm-w1', answer: GOOD }) });
  need(anon.status === 401, 'no token: ' + anon.status);
  const bad = await fetch(BASE + '/api/grade-challenge', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-token' }, body: JSON.stringify({ cid: 'pm-w1', answer: GOOD }) });
  need(bad.status === 401, 'bad token: ' + bad.status);
  ola = await fresh(); await signup(ola, 'Ola Other', 'ola@usc.edu', 'USC'); await pickRole(ola, 'ba'); await saved('ola@usc.edu', 'ba');
  const wrong = await call(ola, { cid: 'pm-w1', answer: GOOD });
  need(wrong.status === 403 && wrong.body.error.code === 'wrong_roadmap', 'other roadmap: ' + JSON.stringify(wrong));
  const draft = await call(tia, { cid: 'pm-w2', answer: GOOD });
  need(draft.status === 404, 'draft challenge: ' + draft.status);
  const nope = await call(tia, { cid: 'nope', answer: GOOD });
  need(nope.status === 404, 'unknown challenge: ' + nope.status);
  const empty = await call(tia, { cid: 'pm-w1', answer: '   ' });
  need(empty.status === 400, 'empty answer: ' + empty.status);
  const huge = await call(ola, { cid: 'ba-w1', answer: 'word '.repeat(3000) });
  need(huge.status === 400 && huge.body.error.code === 'too_long', 'huge answer: ' + JSON.stringify(huge).slice(0, 120));
  need((await j('/__subs')).length === 1, 'a refused request saved something');
});

await step('without the service key the server says scoring is not switched on', async () => {
  const r = await (await fetch(NOKEY + '/api/grade-challenge', { method: 'POST', headers: { authorization: 'Bearer x', 'content-type': 'application/json' }, body: '{}' })).json();
  need(r.error && r.error.code === 'not_configured', JSON.stringify(r));
});

await step('the board covers every college and moves live without a reload', async () => {
  sam = await fresh(); await signup(sam, 'Sam Saver', 'sam@ucla.edu', 'UCLA'); await pickRole(sam, 'pm'); await saved('sam@ucla.edu', 'pm');
  await openChallenge(sam);
  await sam.waitForFunction(() => /Tia R\./.test(document.querySelector('[data-live="chboard"]').textContent), null, { timeout: 8000 });
  let t = await sam.textContent('[data-live="chboard"]');
  need(t.includes('USC') && !t.includes('Ramirez') && !t.includes('tia@'), 'school or short name wrong: ' + t.slice(0, 160));
  await sam.waitForFunction(() => /Live/.test(document.querySelector('.side-head').textContent), null, { timeout: 6000 });
  // Sam submits a weaker answer; Tia's open page should pick it up on its own.
  await openChallenge(tia);
  await j('/__rtclear');
  await sam.fill('#ch-text', WEAK + ' ' + WEAK);
  await sam.click('[data-action="ch-submit"]');
  await sam.waitForSelector('.check-panel', { timeout: 10000 });
  await tia.waitForFunction(() => /Sam S\./.test(document.querySelector('[data-live="chboard"]').textContent), null, { timeout: 6000 });
  t = await tia.textContent('[data-live="chboard"]');
  need(t.includes('UCLA') && t.indexOf('Tia R.') < t.indexOf('Sam S.'), 'board order or school wrong: ' + t.slice(0, 200));
  const s = await j('/__subs');
  need(s.length === 2 && s.find(x => x.answer.startsWith('I would look')).score <= 40, 'short answer not capped: ' + JSON.stringify(s.map(x => x.score)));
});

await step('a student who hides from the leaderboards drops off the challenge board', async () => {
  await tia.click('[data-nav="profile"]'); await tia.waitForSelector('#pf-board');
  await tia.uncheck('#pf-board'); await tia.click('[data-action="profile-save"]'); await tia.waitForTimeout(2200);
  await sam.click('[data-nav="roadmap"]'); await sam.waitForSelector('.skill-row, [data-action="open-track"]');
  await openChallenge(sam);
  await sam.waitForFunction(() => !/Tia R\./.test(document.querySelector('[data-live="chboard"]').textContent), null, { timeout: 8000 });
  const mine = await tia.evaluate(async () => (await CP_AUTH.rest('POST', 'rpc/challenge_board', { p_challenge: 'pm-w1' })).body.filter(r => r.is_me).length);
  need(mine === 1, 'a hidden student should still see their own row');
});

await step('a returning student sees the saved result and cannot submit again', async () => {
  await tia.reload(); await tia.waitForSelector('#shell:not([hidden])', { timeout: 10000 });
  await openChallenge(tia);
  await tia.waitForSelector('.check-panel', { timeout: 8000 });
  const t = await tia.textContent('body');
  need(t.includes('Submitted') && t.includes(EXPECT.pct + '%') && t.includes('REVIEW: you scored') && t.includes('First I would segment'), 'saved result not shown');
  need(await tia.locator('[data-action="ch-submit"]').count() === 0, 'submit form still shown');
});

await step('an error from the server keeps the written answer', async () => {
  const p = await fresh(); await signup(p, 'Pia Pending', 'pia@usc.edu', 'USC'); await pickRole(p, 'pjm'); await saved('pia@usc.edu', 'pjm');
  await openChallenge(p);
  await p.fill('#ch-text', GOOD);
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => String(u).includes('/api/grade-challenge') ? Promise.reject(new Error('offline')) : f(u, o); });
  await p.click('[data-action="ch-submit"]');
  await p.waitForFunction(() => /Could not reach the server/.test(document.body.textContent), null, { timeout: 6000 });
  need((await p.inputValue('#ch-text')) === GOOD, 'the answer was lost');
  need((await j('/__subs')).length === 2, 'something was saved');
  await p.context().close();
});

await browser.close();
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
