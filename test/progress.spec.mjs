/* Progress saved to the database (against test/fakesupabase.mjs): stars, points, lessons done, module results.
   Start servers the same way as accounts.spec.mjs. */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3114';
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

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signupConfirmed(page, name, email) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
}
async function login(page, email) {
  await page.click('[data-tab="login"]');
  await page.fill('#li-email', email); await page.fill('#li-pass', 'longenough1');
  await page.click('[data-action="login"]');
  await page.waitForSelector('#shell:not([hidden])');
}
async function pickPM(page) {
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="pm"]');
  await page.waitForSelector('[data-action="open-track"]');
}
async function perfectExam(page, skillId, n) {
  const key = await page.evaluate(id => window.CP_ROLES.find(r => r.id === 'pm').skills.find(s => s.id === id).assessment.map(q => q.a), skillId);
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(' + n + ')');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(150);
  for (const a of key) { const opts = await page.$$('[data-action="exam-answer"]'); await opts[a].click(); await page.waitForTimeout(40); }
}

let firstPoints = 0;
await step('an assessment result is saved: stars, best score, attempts, history and points', async () => {
  const page = await fresh();
  await signupConfirmed(page, 'Sam Saver', 'sam@usc.edu');
  await pickPM(page);
  await perfectExam(page, 'discovery-pm', 3);
  await page.waitForTimeout(2500);
  const saved = await j('/__progress?email=sam@usc.edu');
  const row = saved.skills.find(r => r.skill_id === 'discovery-pm');
  need(row, 'no progress row saved: ' + JSON.stringify(saved));
  need(row.stars >= 1 && row.best === 100 && row.attempts === 1 && row.history.length === 1, 'wrong values: ' + JSON.stringify(row));
  const prof = await j('/__profile?email=sam@usc.edu');
  need(prof.points > 0, 'points not saved');
  firstPoints = prof.points;
  need(!saved.skills.some(r => r.attempts === 0 && r.stars === 0), 'empty rows were saved');
  await page.context().close();
});

await step('signing in on another device shows the same stars and points', async () => {
  const other = await fresh();
  await login(other, 'sam@usc.edu');
  await other.waitForTimeout(1500);
  const pts = await other.evaluate(() => document.querySelector('.who-sub').textContent);
  need(pts.includes(String(firstPoints)), 'points not restored: ' + pts);
  await other.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await other.waitForTimeout(200);
  const rowText = await other.textContent('.skill-row:nth-child(3)');
  need(/100|★|verified/i.test(rowText), 'stars not restored on the skill: ' + rowText.slice(0, 120));
  need(other.errs.length === 0, other.errs.join(' | '));
  await other.context().close();
});

await step('saved progress is never overwritten by an older copy from another browser', async () => {
  // Server holds 3 attempts. A fresh browser has none, so it must read before it writes.
  await j('/__seed?email=sam@usc.edu', { skills: [{ skill_id: 'foundations-pm', stars: 4, best: 88, attempts: 3, project: false, lessons_done: [0, 1, 2], history: [] }], points: firstPoints + 400 });
  const other = await fresh();
  await login(other, 'sam@usc.edu');
  await other.waitForTimeout(2500);
  const saved = await j('/__progress?email=sam@usc.edu');
  const row = saved.skills.find(r => r.skill_id === 'foundations-pm');
  need(row && row.attempts === 3 && row.stars === 4, 'server copy was overwritten: ' + JSON.stringify(row));
  const prof = await j('/__profile?email=sam@usc.edu');
  need(prof.points === firstPoints + 400, 'points went backwards: ' + prof.points);
  await other.context().close();
});

await step('if saved progress cannot be read, nothing is written over it', async () => {
  await j('/__fail?on=1');
  const page = await fresh();
  const before = (await j('/__log')).length;
  await login(page, 'sam@usc.edu');
  await perfectExam(page, 'discovery-pm', 3).catch(() => {});
  await page.waitForTimeout(2500);
  const after = (await j('/__log')).length;
  await j('/__fail?on=0');
  need(after === before, 'wrote progress without reading it first (' + (after - before) + ' writes)');
  await page.context().close();
});

await step('a module exam result is saved', async () => {
  await j('/__seed?email=sam@usc.edu', { modules: [{ track_id: 'pm-fundamentals', best: 92, attempts: 2, passed: true, passed_on: 'Oct 26, 2026', history: [] }] });
  const page = await fresh();
  await login(page, 'sam@usc.edu');
  await page.waitForTimeout(1500);
  await page.click('[data-nav="certs"]');
  await page.waitForTimeout(300);
  const t = await page.textContent('#main, main, body');
  need(/PM Fundamentals/.test(t), 'passed module not shown on certificates');
  await page.context().close();
});

await step('a project submission is saved inside history, loads on another device, and stays out of the attempt list', async () => {
  // Needs the real-mode server started with the fake model too (AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112).
  await j('/__seed?email=sam@usc.edu', { skills: [{ skill_id: 'discovery-pm', stars: 4, best: 90, attempts: 2, project: false, lessons_done: [0],
    history: [{ pct: 80, stars: 3, when: 'Sep 1, 2026' }, { pct: 90, stars: 4, when: 'Sep 2, 2026' }] }] });
  const page = await fresh();
  await login(page, 'sam@usc.edu');
  await page.waitForTimeout(1500);
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(3)');
  await page.waitForSelector('textarea[data-proj]');
  const words = (m) => m + ' ' + Array.from({ length: 90 }, (_, i) => 'w' + i).join(' ');
  await page.fill('textarea[data-proj]', words('WEAK'));
  await page.click('[data-action="project-submit"]');
  await page.waitForSelector('text=Not accepted yet');
  await page.waitForTimeout(2500);
  let row = (await j('/__progress?email=sam@usc.edu')).skills.find(r => r.skill_id === 'discovery-pm');
  need(row.project === false, 'project flag set by a fail');
  need(row.history.length === 3 && row.history[2].kind === 'project' && row.history[2].score === 55 && row.history[2].accepted === false, 'project entry not saved: ' + JSON.stringify(row.history).slice(0, 300));
  need(row.history.slice(0, 2).every(h => !h.kind), 'attempts changed');
  await page.context().close();

  const other = await fresh();
  await login(other, 'sam@usc.edu');
  await other.waitForTimeout(1500);
  await other.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await other.waitForTimeout(150);
  await other.click('.skill-row:nth-child(3)');
  await other.waitForSelector('textarea[data-proj]');
  need((await other.inputValue('textarea[data-proj]')).startsWith('WEAK'), 'draft not restored on the other device');
  need(/55 \/ 100/.test(await other.locator('.proj').innerText()), 'review not restored');
  await other.fill('textarea[data-proj]', words('GOODPROJECT'));
  await other.click('[data-action="project-submit"]');
  await other.waitForSelector('.proj .pill.ok');
  await other.waitForTimeout(2500);
  row = (await j('/__progress?email=sam@usc.edu')).skills.find(r => r.skill_id === 'discovery-pm');
  need(row.project === true && row.history.length === 3 && row.history[2].accepted === true && row.history[2].score === 82, 'accepted project not saved: ' + JSON.stringify(row.history).slice(0, 300));
  await other.click('[data-nav="history"]');
  await other.waitForTimeout(300);
  const rows = await other.locator('table.grid tbody tr').count();
  need(rows === 2, 'attempt list should show 2 scored attempts, got ' + rows);
  need(other.errs.length === 0, other.errs.join(' | '));
  await other.context().close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
