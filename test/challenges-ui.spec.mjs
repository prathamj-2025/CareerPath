/* Weekly challenges through the real pages (real-account mode, fake database): an admin writes a challenge, publishes it,
   and a student sees it; the server records that the student has the challenge open and lifts it when they leave.
   Start servers with test/start-servers.sh. */
import { chromium } from 'playwright';

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
await new Promise(r => setTimeout(r, 900));

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
let adm, stu;

await step('an admin writes a challenge, saves it as a draft, and the database has it', async () => {
  adm = await fresh();
  await signupConfirmed(adm, 'Ada Admin', 'ada@usc.edu');
  await j('/__admin?email=ada@usc.edu');
  await adm.click('[data-action="logout"]').catch(() => {});
  await adm.goto(BASE + '/'); await adm.waitForTimeout(400);
  await login(adm, 'ada@usc.edu');
  await adm.click('[data-nav="a-challenges"]');
  await adm.waitForSelector('[data-action="ac-new"]');
  const before = await adm.textContent('#view');
  need(before.includes('Pick the one thing to build') && before.includes('Top sellers last month') && before.includes('Plan a customer webinar'), 'the week 1 challenges are not listed');
  await adm.click('[data-action="ac-new"]');
  await adm.selectOption('#ac-role', 'pm');
  await adm.fill('#ac-week', '2');
  await adm.fill('#ac-title', 'Name one success metric');
  await adm.fill('#ac-brief', 'Your team ships a new search box. Name one metric that shows it worked and say why you chose it.');
  await adm.fill('#ac-min', '20');
  await adm.fill('#ac-rubric', 'Names one metric | metric|rate|conversion|click\nSays why | because|so that|since');
  await adm.click('[data-action="ac-save"]');
  await adm.waitForSelector('text=Name one success metric');
  const rows = await j('/__challenges');
  need(rows.length === 1 && rows[0].title === 'Name one success metric' && rows[0].status === 'draft' && rows[0].rubric.length === 2, JSON.stringify(rows));
  need(adm.errs.length === 0, adm.errs.join('; '));
});

await step('a bad pattern is refused on the admin page with the server\'s reason, and nothing is saved', async () => {
  await adm.click('[data-action="ac-new"]');
  await adm.fill('#ac-title', 'Broken'); await adm.fill('#ac-brief', 'Brief text.');
  await adm.fill('#ac-rubric', 'Bad one | (unclosed');
  await adm.click('[data-action="ac-save"]');
  await adm.waitForSelector('text=That did not save');
  need((await adm.textContent('#view')).includes('not valid'), 'no reason shown');
  need((await j('/__challenges')).length === 1, 'a refused challenge was saved');
  await adm.click('[data-action="ac-cancel"]');
});

await step('a student with the week 1 challenge open is locked out of the assistant by the server, and leaving lifts it', async () => {
  stu = await fresh();
  await signupConfirmed(stu, 'Sam Rivera', 'sam@usc.edu');
  await pickPM(stu);
  await stu.click('[data-nav="challenge"]');
  await stu.waitForSelector('#ch-text');
  need((await stu.textContent('#view')).includes('Pick the one thing to build'), 'week 1 challenge not shown');
  await stu.waitForTimeout(600);
  let at = await j('/__attempts?email=sam@usc.edu');
  need(at.some(a => a.kind === 'challenge' && a.target === 'pm-start' && !a.submitted_at), 'the server has no record of the open challenge: ' + JSON.stringify(at));
  const tok = await stu.evaluate(() => CP_AUTH.token());
  const ask = () => fetch(BASE + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ rules: 'x', messages: [{ role: 'user', content: 'hi' }] }) });
  need((await ask()).status === 403, 'the server still answered while the challenge was open');
  await stu.click('[data-nav="roadmap"]');
  await stu.waitForTimeout(600);
  at = await j('/__attempts?email=sam@usc.edu');
  need(!at.some(a => a.kind === 'challenge' && !a.submitted_at), 'leaving did not close the open challenge');
  need((await ask()).status === 200, 'the assistant did not come back after leaving');
});

await step('after the admin publishes the new challenge, the student sees it on their next visit', async () => {
  await adm.click('.ch-row:has-text("Name one success metric") [data-action="ac-status"][data-to="live"]');
  await adm.waitForFunction(() => [...document.querySelectorAll('.ch-row')].some(r => /Name one success metric/.test(r.textContent) && /Live/.test(r.textContent)));
  const rows = await j('/__challenges');
  need(rows.find(r => r.title === 'Name one success metric').status === 'live' && rows.find(r => r.cid === 'pm-start').status === 'closed', JSON.stringify(rows.map(r => [r.cid, r.status])));
  await new Promise(r => setTimeout(r, 600));
  await stu.reload(); await stu.waitForSelector('#shell:not([hidden])');
  await stu.click('[data-nav="challenge"]');
  await stu.waitForSelector('#ch-text');
  const t = await stu.textContent('#view');
  need(t.includes('Name one success metric') && !t.includes('Pick the one thing to build'), 'student still sees the old challenge');
  await stu.fill('#ch-text', 'The metric I would watch is the search conversion rate, because it shows whether people find what they came for.');
  await stu.click('[data-action="ch-submit"]');
  await stu.waitForSelector('.check-panel', { timeout: 10000 });
  need((await stu.textContent('.check-panel')).includes('100%'), 'score from the admin rubric not shown');
});

await step('a live or closed challenge has no Edit button on the admin page', async () => {
  await adm.reload(); await adm.waitForSelector('#shell:not([hidden])');
  await adm.click('[data-nav="a-challenges"]'); await adm.waitForSelector('[data-action="ac-new"]');
  const rowsHtml = await adm.$$eval('.ch-row', els => els.map(e => ({ t: e.textContent, edit: !!e.querySelector('[data-action="ac-edit"]') })));
  const live = rowsHtml.find(r => r.t.includes('Name one success metric')), closed = rowsHtml.find(r => r.t.includes('Pick the one thing to build'));
  need(live && !live.edit && closed && !closed.edit, JSON.stringify(rowsHtml.map(r => [r.t.slice(0, 30), r.edit])));
  need(rowsHtml.filter(r => r.edit).length >= 1, 'drafts should still be editable');
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
