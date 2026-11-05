/* Admin content edits through the real pages (real-account mode, fake database): an admin changes a lesson and a question
   on the admin screens, and a student sees both. Start servers with test/start-servers.sh. */
import { chromium } from 'playwright';
import { keyOf } from './keys.mjs';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
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
await new Promise(r => setTimeout(r, 900));   // the server's cached copy of earlier test data expires

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
  await page.waitForTimeout(1500);
}
const SK = 'discovery-pm';
const NEWQ = 'Which number would you look at first on Monday morning?';
let adminPage, firstTitle = '';

await step('an admin edits a lesson and a question on the admin screens, and both are saved', async () => {
  adminPage = await fresh();
  await signupConfirmed(adminPage, 'Ada Admin', 'ada@usc.edu');
  await j('/__admin?email=ada@usc.edu');
  await adminPage.click('[data-action="logout"]').catch(() => {});
  await adminPage.goto(BASE + '/'); await adminPage.waitForTimeout(400);
  await login(adminPage, 'ada@usc.edu');
  await adminPage.waitForSelector('[data-action="a-lessons"][data-skill="' + SK + '"]');

  await adminPage.click('[data-action="a-lessons"][data-skill="' + SK + '"]');
  await adminPage.click('[data-action="al-edit"][data-i="0"]');
  await adminPage.fill('#al-t', 'A rewritten first lesson');
  await adminPage.fill('#al-b', 'This is the rewritten body of the first lesson. It is plain text.');
  await adminPage.click('[data-action="al-save"]');
  await adminPage.waitForSelector('text=A rewritten first lesson');
  need((await j('/__content')).lessons.some(r => r.skill_id === SK && r.status === 'live' && r.title === 'A rewritten first lesson'), 'lesson not saved to the database');

  await adminPage.click('[data-nav="a-content"]');
  await adminPage.click('[data-action="a-open"][data-skill="' + SK + '"]');
  await adminPage.click('[data-action="a-edit"][data-qid="' + SK + '-q1"]');
  await adminPage.fill('#ae-q', NEWQ);
  await adminPage.selectOption('#ae-a', '3');
  await adminPage.click('[data-action="a-save"]');
  await adminPage.waitForSelector('[data-action="a-publish"]');
  need((await j('/__content')).questions.some(r => r.status === 'draft' && r.q === NEWQ), 'draft not saved');
  await adminPage.click('[data-action="a-publish"]');
  await adminPage.waitForFunction(() => !document.querySelector('[data-action="a-publish"]'));
  const rows = (await j('/__content')).questions.filter(r => r.qid === SK + '-q1');
  need(rows.some(r => r.status === 'live' && r.version === 2 && r.answer === 3) && rows.some(r => r.status === 'archived' && r.version === 1), 'versions ' + JSON.stringify(rows.map(r => [r.version, r.status])));
  need(adminPage.errs.length === 0, adminPage.errs.join(' | '));
});

await step('a student sees the new lesson and the new question, and is graded against the new answer', async () => {
  const page = await fresh();
  await signupConfirmed(page, 'Stu Dent', 'stu@usc.edu');
  await pickPM(page);
  await page.waitForFunction(() => window.CP_ROLES[0].skills.some(s => s.lessons[0].title === 'A rewritten first lesson'), null, { timeout: 8000 });
  const leaked = await page.evaluate(() => JSON.stringify(window.CP_ROLES[0].skills.find(s => s.id === 'discovery-pm').assessment).match(/"a":|"why":/));
  need(!leaked, 'the student page holds an answer key');
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(3)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-exam"]');
  await page.waitForSelector('[data-action="exam-answer"]');
  need((await page.textContent('#view')).includes(NEWQ), 'the edited question is not shown in the exam');
  const key = keyOf('pm', SK); key[0] = 3;
  for (const a of key) { const opts = await page.$$('[data-action="exam-answer"]'); await opts[a].click(); await page.waitForTimeout(40); }
  await page.waitForSelector('.result-h1', { timeout: 10000 });
  need((await page.textContent('.result-h1')).includes('100%'), 'not graded 100% against the new answer: ' + (await page.textContent('.result-h1')));
  need(page.errs.length === 0, page.errs.join(' | '));
  await page.context().close();
});

await step('a refused change shows the reason and changes nothing', async () => {
  const before = JSON.stringify((await j('/__content')).questions);
  await adminPage.click('[data-nav="a-content"]');
  await adminPage.click('[data-action="a-open"][data-skill="' + SK + '"]');
  for (let i = 0; i < 6; i++) {
    const btn = await adminPage.$('[data-action="a-retire"]');
    if (!btn) break;
    await btn.click(); await adminPage.waitForTimeout(250);
  }
  await adminPage.waitForSelector('text=At least', { timeout: 3000 }).catch(() => {});
  const msg = await adminPage.textContent('#view');
  need(/at least 5 live questions/i.test(msg), 'no reason shown: ' + msg.slice(0, 200));
  const left = await adminPage.$$eval('[data-action="a-retire"]', els => els.length);
  need(left === 5, left + ' questions left');
  need(JSON.stringify((await j('/__content')).questions) !== before, 'retired questions were not saved');
  await adminPage.context().close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
