/* The Major list on sign-up, Google sign-up and Profile: MBA is offered, "Other" opens a box to type the major, and what is
   typed is what is saved. Needs the real-mode server (3114) and the fake database (3113). */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3114';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const j = async (path) => (await fetch(FAKE + path)).json();
const need = (c, m) => { if (!c) throw new Error(m); };
const tag = Date.now() % 100000;

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(BASE + '/'); await p.waitForSelector('#auth:not([hidden])');
  await p.click('[data-tab="signup"]');
  return p;
}
const fill = async (p, email) => { await p.fill('#su-name', 'Maya Banerjee'); await p.fill('#su-email', email); await p.fill('#su-pass', 'longenough1'); };

await step('the Major list offers MBA, Business Analytics and Other, and no longer Business Administration', async () => {
  const p = await page();
  const opts = await p.$$eval('#su-major option', o => o.map(x => x.textContent));
  need(opts.includes('MBA') && opts.includes('Business Analytics') && opts[opts.length - 1] === 'Other' && !opts.includes('Business Administration'), opts.join(', '));
  need(!(await p.isVisible('#su-major-other')), 'the "your major" box shows before Other is picked');
  await p.selectOption('#su-major', 'Other');
  need(await p.isVisible('#su-major-other'), 'the "your major" box did not appear');
  await p.selectOption('#su-major', 'MBA');
  need(!(await p.isVisible('#su-major-other')), 'the box stayed after picking MBA');
  need(!p.errs.length, p.errs.join(' | '));
  await p.context().close();
});

await step('picking Other without typing a major asks for it', async () => {
  const p = await page();
  await fill(p, 'major-empty-' + tag + '@usc.edu');
  await p.selectOption('#su-major', 'Other');
  await p.click('[data-action="signup"]'); await p.waitForTimeout(300);
  need(/type your major/.test(await p.textContent('#auth')), 'no message');
  need(!(await j('/__state')).emails.includes('major-empty-' + tag + '@usc.edu'), 'the account was created anyway');
  await p.context().close();
});

await step('a typed major is what gets saved, and MBA saves as MBA', async () => {
  const p = await page();
  const email = 'major-other-' + tag + '@usc.edu';
  await fill(p, email);
  await p.selectOption('#su-major', 'Other');
  await p.fill('#su-major-other', 'Marketing');
  await p.click('[data-action="signup"]'); await p.waitForTimeout(600);
  await j('/__confirm?email=' + email);
  const prof = await j('/__profile?email=' + email);
  need(prof && prof.major === 'Marketing', 'saved: ' + JSON.stringify(prof && prof.major));
  await p.context().close();
  const q = await page();
  const e2 = 'major-mba-' + tag + '@usc.edu';
  await fill(q, e2);
  await q.selectOption('#su-major', 'MBA');
  await q.click('[data-action="signup"]'); await q.waitForTimeout(600);
  await j('/__confirm?email=' + e2);
  need((await j('/__profile?email=' + e2)).major === 'MBA', 'MBA not saved');
  await q.context().close();
});

await step('on Profile a typed major shows as Other with the text filled in', async () => {
  const email = 'major-other-' + tag + '@usc.edu';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/'); await p.waitForSelector('#auth:not([hidden])');
  await p.click('[data-tab="login"]'); await p.fill('#li-email', email); await p.fill('#li-pass', 'longenough1');
  await p.click('[data-action="login"]'); await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = ''; });
  const prof = await p.$('[data-nav="profile"]:visible');
  if (prof) { await prof.click(); await p.waitForTimeout(500); }
  need(await p.$('#pf-major'), 'profile form not reached');
  need(await p.inputValue('#pf-major') === 'Other' && await p.inputValue('#pf-major-other') === 'Marketing', 'profile shows: ' + await p.inputValue('#pf-major'));
  await ctx.close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
