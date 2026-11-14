/* The browser's Back and Forward buttons move between the app's pages, an exam is not a history step, and another
   account's trail is ignored. Real accounts against test/fakesupabase.mjs. Start servers with test/start-servers.sh. */
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

async function signedIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Back Tester'); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="pm"]');
  await page.waitForSelector('[data-action="open-track"]');
  await page.waitForTimeout(1500);     // the server starts exams against the saved roadmap, so let it save first
  return page;
}
const where = page => page.evaluate(() => ({
  roadmap: !!document.querySelector('[data-action="open-track"]'),
  track: !!document.querySelector('.skill-row') && !document.querySelector('[data-action="open-track"]'),
  skill: !!document.querySelector('[data-action="start-exam"]'),
  auth: !document.querySelector('#auth').hidden
}));
const settle = page => page.waitForTimeout(250);

let page;
await step('Back goes from skill to track to roadmap, and Forward returns', async () => {
  page = await signedIn('back1@usc.edu');
  need((await where(page)).roadmap, 'not on roadmap');
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await settle(page);
  need((await where(page)).track, 'not on track page');
  await page.click('.skill-row:nth-child(1)'); await settle(page);
  need((await where(page)).skill, 'not on skill page');
  await page.goBack(); await settle(page);
  let w = await where(page); need(w.track && !w.skill, 'Back from skill did not reach track: ' + JSON.stringify(w));
  await page.goBack(); await settle(page);
  w = await where(page); need(w.roadmap && !w.track, 'Back from track did not reach roadmap: ' + JSON.stringify(w));
  await page.goForward(); await settle(page);
  w = await where(page); need(w.track, 'Forward did not return to track: ' + JSON.stringify(w));
  need(!w.auth, 'sign-in screen appeared');
  need(!page.errs.length, page.errs.join(' | '));
});

await step('Back from the roadmap does not break the page or sign the user out', async () => {
  await page.goBack(); await settle(page);
  await page.goBack().catch(() => {}); await settle(page);
  const w = await where(page);
  need(!w.auth, 'signed out by Back');
  need(!page.errs.length, page.errs.join(' | '));
});

await step('opening an exam adds no history step: Back from it returns to the page before the skill', async () => {
  const p = await signedIn('back2@usc.edu');
  await p.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await settle(p);
  await p.click('.skill-row:nth-child(1)'); await settle(p);
  await p.click('[data-action="start-exam"]'); await settle(p);
  await p.waitForSelector('[data-action="exam-answer"]', { timeout: 8000 });
  await p.goBack(); await settle(p);
  const w = await where(p);
  need(w.track && !w.auth, 'Back from the exam did not land on the track page: ' + JSON.stringify(w));
  need(!p.errs.length, p.errs.join(' | '));
});

await step('refresh keeps the page and Back still works afterwards', async () => {
  const p = await signedIn('back3@usc.edu');
  await p.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await settle(p);
  await p.reload(); await p.waitForTimeout(800);
  let w = await where(p);
  if (w.auth) { await p.fill('#li-email', 'back3@usc.edu'); await p.fill('#li-pass', 'longenough1'); await p.click('[data-action="login"]'); await p.waitForSelector('#shell:not([hidden])'); await settle(p); w = await where(p); }
  need(!w.auth, 'signed out after reload');
  need(!p.errs.length, p.errs.join(' | '));
});

console.log(failed ? failed + ' failed' : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
