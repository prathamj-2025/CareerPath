/* Every main screen, in light and dark mode, on a laptop and a phone: no duplicate ids, every button and link has a name,
   every field has a label, images have alt text, no text too faint to read (contrast under 3:1), and no page errors.
   Needs the demo server (3111) and the real-mode server (3114). */
import { chromium } from 'playwright';
import { scan } from './quality-lib.mjs';

const DEMO = process.env.BASE || 'http://localhost:3111';
const REAL = process.env.REAL_URL || 'http://localhost:3114';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
// The test machine cannot reach Google Fonts; a font that fails to load is not a page error.
const ignorable = (t) => /ERR_TUNNEL_CONNECTION_FAILED|fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED.*fonts/.test(t);

async function run(scheme, w, h, touch) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: touch, hasTouch: touch });
  await c.addInitScript(() => { try { localStorage.setItem('cp-tutor-dock', '0'); } catch (e) {} });
  const p = await c.newPage();
  const errs = [], problems = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errs.push(m.text()); });
  const S = async (label) => {
    const r = await scan(p);
    for (const [k, v] of Object.entries(r)) if (v.length) problems.push(label + ' ' + k + ': ' + v.slice(0, 3).join(' | '));
  };
  const vis = async (s) => { const e = await p.$(s + ':visible'); if (!e) throw new Error('missing ' + s); await e.click(); await p.waitForTimeout(450); };

  for (const pg of ['about', 'faq', 'help', 'contact', 'feedback', 'privacy', 'terms', 'verify']) { await p.goto(REAL + '/' + pg + '.html'); await p.waitForTimeout(300); await S(pg); }
  await p.goto(REAL + '/feedback.html'); await p.waitForTimeout(300);
  await (await p.$('.fb-q[data-q="tried"] .fb-chip')).click(); await p.waitForTimeout(150); await S('feedback, "Yes" questions open');
  await p.goto(REAL + '/'); await p.waitForTimeout(500); await S('sign-in');
  await p.click('[data-tab="signup"]'); await p.waitForTimeout(200);
  await p.selectOption('#su-school', 'Other'); await p.selectOption('#su-major', 'Other'); await S('create account with Other');

  await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list'); await p.waitForTimeout(300); await S('roadmap');
  await vis('[data-action="open-track"]'); await S('module');
  await vis('.skill-row'); await S('skill');
  await vis('[data-action="start-learn"]'); await S('lesson');
  await p.evaluate(() => { const all = [...document.querySelectorAll('[data-action="lesson"][data-i]')]; const max = Math.max(...all.map(b => +b.dataset.i)); all.find(b => +b.dataset.i === max && b.offsetParent).click(); });
  await p.waitForTimeout(400); await S('last lesson');
  await vis('[data-action="start-exam"]'); await S('assessment');
  for (let i = 0; i < 40; i++) { const o = await p.$('[data-action="exam-answer"]'); if (!o) break; await o.click(); await p.waitForTimeout(100); }
  await p.waitForTimeout(500); await S('result');
  for (const n of ['leaderboard', 'challenge', 'certs', 'history', 'profile']) { await vis('[data-nav="' + n + '"]'); await S(n); }
  const fab = await p.$('#tutor-launch:visible'); if (fab) { await fab.click(); await p.waitForTimeout(300); await S('assistant'); }
  await c.close();

  const a = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: touch, hasTouch: touch });
  const q = await a.newPage();
  q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(DEMO + '/'); await q.waitForTimeout(300);
  await q.evaluate(() => { document.querySelector('#li-email').value = 'admin@careerpath.com'; document.querySelector('#li-pass').value = 'admin'; });
  await q.click('[data-action="login"]'); await q.waitForTimeout(600);
  const SA = async (label) => { const r = await scan(q); for (const [k, v] of Object.entries(r)) if (v.length) problems.push('admin ' + label + ' ' + k + ': ' + v.slice(0, 3).join(' | ')); };
  await SA('content');
  const open = await q.$('[data-action="a-open"]:visible'); if (open) { await open.click(); await q.waitForTimeout(400); await SA('skill editor'); }
  for (const n of ['a-drafts', 'a-challenges', 'a-students', 'a-feedback']) { const e = await q.$('[data-nav="' + n + '"]:visible'); if (e) { await e.click(); await q.waitForTimeout(500); await SA(n); } }
  await a.close();
  return { errs, problems };
}

for (const [scheme, w, h, touch] of [['light', 1280, 900, false], ['dark', 1280, 900, false], ['light', 375, 812, true], ['dark', 375, 812, true]]) {
  await step(`every screen reads well and works for screen readers (${scheme}, ${w}px)`, async () => {
    const { errs, problems } = await run(scheme, w, h, touch);
    if (problems.length) throw new Error(problems.length + ' problem(s): ' + problems.slice(0, 6).join(' ;; '));
    if (errs.length) throw new Error('page errors: ' + errs.slice(0, 3).join(' | '));
  });
}

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
