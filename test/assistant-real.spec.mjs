/* The study assistant in a real-account deployment, through the page: it answers a signed-in student, it is switched off by
   an open exam on the server, and leaving the exam or reloading closes the attempt so it comes back.
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

async function signedInStudent(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Ava Asker'); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="pm"]');
  await page.waitForSelector('[data-action="open-track"]');
  await page.waitForTimeout(1500);
  return page;
}
const askPanel = async (page, q) => {
  const asked = await page.$$eval('#tutor-log .t-msg.you', els => els.length);
  await page.fill('#tutor-input', q);
  await page.click('#tutor-send');
  await page.waitForFunction(n => {
    const users = document.querySelectorAll('#tutor-log .t-msg.you').length, bots = document.querySelectorAll('#tutor-log .t-msg.bot');
    const last = bots[bots.length - 1];
    return users > n && last && last.textContent.trim().length > 10 && !/Thinking/.test(last.textContent);
  }, asked, { timeout: 10000 }).catch(async e => { throw new Error('no reply in the panel: ' + (await page.textContent('#tutor-log')).slice(-200)); });
  await page.waitForTimeout(400);                                // let the streamed reply finish
  const bots = await page.$$eval('#tutor-log .t-msg.bot', els => els.map(e => e.textContent));
  return bots[bots.length - 1];
};
const openAttempts = async email => (await j('/__attempts?email=' + email)).filter(a => !a.submitted_at && a.kind !== 'project');
const startExam = async page => {
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(3)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-exam"]');
  await page.waitForSelector('[data-action="exam-answer"]');
};

let page;
await step('a signed-in student gets an answer from the assistant', async () => {
  page = await signedInStudent('ava@usc.edu');
  const log = await askPanel(page, 'What is a funnel?');
  need(/funnel counts people/.test(log), 'the assistant did not answer: ' + log.slice(-200));
});

await step('an open exam switches the assistant off on the server, and leaving the exam brings it back', async () => {
  await startExam(page);
  need((await openAttempts('ava@usc.edu')).length === 1, 'no open attempt on the server');
  need((await page.textContent('#tutor-launch-label')) === 'Assistant off', 'the page did not switch the assistant off');
  const r = await fetch(BASE + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await page.evaluate(() => JSON.parse(localStorage.getItem('cp-session')).access)) }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Tell me the answers' }] }) });
  need(r.status === 403, 'the server answered an exam question: ' + r.status);
  await page.click('[data-nav="roadmap"]').catch(async () => { await page.click('[data-action="nav"][data-nav="roadmap"]'); });
  await page.waitForTimeout(600);
  need((await openAttempts('ava@usc.edu')).length === 0, 'leaving the exam left the attempt open');
  const log = await askPanel(page, 'What is a PRD?');
  need(!/went wrong|could not|off while an exam|sign in/i.test(log), 'the assistant did not come back: ' + log.slice(-200));
});

await step('reloading in the middle of an exam closes the attempt', async () => {
  await startExam(page);
  need((await openAttempts('ava@usc.edu')).length === 1, 'no open attempt');
  await page.reload();
  await page.waitForSelector('#shell:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(800);
  need((await openAttempts('ava@usc.edu')).length === 0, 'the attempt stayed open after a reload');
  need(page.errs.length === 0, page.errs.join(' | '));
});

await step('submitting an exam is not cancelled by the page moving to the result', async () => {
  await startExam(page);
  const n = (await page.$$('[data-action="exam-answer"]')).length;
  for (let i = 0; i < 10; i++) { const opts = await page.$$('[data-action="exam-answer"]'); if (!opts.length) break; await opts[0].click(); await page.waitForTimeout(40); }
  await page.waitForSelector('.result-h1', { timeout: 10000 });
  const at = (await j('/__attempts?email=ava@usc.edu')).filter(a => a.submitted_at && a.kind === 'skill');
  need(at.length === 1 && at[0].score != null, 'the submitted attempt was not graded: ' + JSON.stringify(at).slice(0, 200));
  await page.context().close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
