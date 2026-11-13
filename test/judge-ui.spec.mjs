/* AI scoring as a student sees it: the weekly challenge result, a lesson scenario and a practice exercise, against the
   real-account server with AI scoring on (3117), the fake database and the fake model. */
import { chromium } from 'playwright';

const BASE = process.env.JUDGE_URL || 'http://localhost:3117';
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

async function student(name, email, roadmap) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await c.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.selectOption('#su-school', 'USC');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="' + roadmap + '"]');
  await page.waitForSelector('[data-action="open-track"], .skill-row');
  for (let i = 0; i < 40; i++) { if ((await j('/__profile?email=' + email)).roadmap_id === roadmap) break; await page.waitForTimeout(250); }
  return page;
}
async function openSkill(page, id, track) {
  if (track) { await page.click('[data-nav="roadmap"]'); await page.waitForTimeout(250); await page.click('[data-action="open-track"][data-track="' + track + '"]'); await page.waitForTimeout(250); }
  await page.click('[data-skill="' + id + '"]'); await page.waitForTimeout(250);
  await page.click('[data-action="start-learn"][data-skill="' + id + '"]'); await page.waitForTimeout(300);
}
const lastLesson = async (page) => {
  const n = await page.evaluate(() => document.querySelectorAll('.lesson-nav [data-action="lesson"][data-i]').length);
  const idx = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.lesson-nav [data-action="lesson"][data-i]')].map(b => +b.dataset.i)));
  await page.click('.lesson-nav [data-action="lesson"][data-i="' + idx + '"]'); await page.waitForTimeout(300);
  return n;
};

const PAD = ' I would build the first-day tutorial because most new users leave on day 1, so it helps the largest group, and the other two requests can wait for a later sprint. After launch I would check day-1 retention to see whether more new users stay with us after the first day.';
let pm;

await step('the weekly challenge result says an AI marker judged it, with a tick for each line it found', async () => {
  pm = await student('Pia Marsh', 'pia@usc.edu', 'pm');
  await pm.click('[data-nav="challenge"]'); await pm.waitForSelector('#ch-text');
  await pm.fill('#ch-text', PAD + ' MET:1,2,4');
  await pm.click('[data-action="ch-submit"]');
  await pm.waitForSelector('.check-panel', { timeout: 10000 });
  const t = await pm.textContent('.check-panel');
  need(t.includes('Submitted') && t.includes('75%') && t.includes('3 of 4'), 'score: ' + t.slice(0, 120));
  need(t.includes('An AI marker read your answer') && t.includes('not exact words'), 'AI note missing: ' + t.slice(-260));
  need((await pm.$$('.check-panel .crit.met')).length === 3 && (await pm.$$('.check-panel .crit.unmet')).length === 1, 'ticks wrong');
  need(!t.includes('not how well you argued it'), 'old keyword note still shown');
});

await step('after a reload the same ticks and note come back from the saved row', async () => {
  await pm.reload(); await pm.waitForSelector('[data-nav="challenge"]');
  await pm.click('[data-nav="challenge"]'); await pm.waitForSelector('.check-panel');
  const t = await pm.textContent('.check-panel');
  need(t.includes('75%') && t.includes('An AI marker read your answer') && (await pm.$$('.check-panel .crit.met')).length === 3, 'saved result differs: ' + t.slice(0, 160));
});

await step('a lesson scenario is marked by the AI, each key point with a short reason, and falls back with a note when it cannot', async () => {
  await openSkill(pm, 'foundations-pm', 'pm-fundamentals'); await pm.waitForSelector('.scn textarea');
  await pm.fill('.scn textarea', 'It depends on the problem. MET:1,3');
  await pm.click('[data-action="scn-check"]');
  await pm.waitForSelector('.scn .check-panel .crit');
  let t = await pm.textContent('.scn .check-panel');
  need(t.includes('Partly covered') && t.includes('2 / 4') && t.includes('Your answer does this.') && t.includes('An AI marker read your answer'), 'AI result: ' + t.slice(0, 200));
  await pm.fill('.scn textarea', 'BADJSON the answer');
  await pm.click('[data-action="scn-check"]');
  await pm.waitForFunction(() => /quick keyword check/.test(document.querySelector('.scn .check-panel').textContent));
  t = await pm.textContent('.scn .check-panel');
  need(t.includes('checks whether you raised each idea') && !t.includes('An AI marker'), 'fallback: ' + t.slice(0, 200));
  need(pm.errs.length === 0, pm.errs.join('; '));
});

await step('a practice exercise is marked by the AI too, and the button shows it is working', async () => {
  const ba = await student('Bea Okafor', 'bea@usc.edu', 'ba');
  await openSkill(ba, 'requirements-ba');
  await lastLesson(ba);
  await ba.waitForSelector('.ex textarea');
  await ba.fill('.ex textarea', 'I would ask what it is for. MET:2');
  await ba.click('.ex [data-action="practice-check"]');
  await ba.waitForSelector('.ex .check-panel .crit');
  const t = await ba.textContent('.ex .check-panel');
  need(t.includes('1 / 3') && t.includes('An AI marker read your answer') && t.includes('Partly covered'), 'practice result: ' + t.slice(0, 200));
  need((await ba.textContent('.ex [data-action="practice-check"]')).includes('Check again'), 'button did not return');
  need(await ba.$('.ex [data-action="practice-answer"]'), 'the model answer should unlock after a check');
  need(ba.errs.length === 0, ba.errs.join('; '));
});

await browser.close();
console.log(failed ? failed + ' check(s) failed' : 'all judge UI checks passed');
process.exit(failed ? 1 : 0);
