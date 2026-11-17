import { chromium } from 'playwright';
/* Phone layout: no sideways scroll, nothing wider than the screen, 16px inputs (no iOS zoom), at common phone widths,
   on the main learner and admin screens plus the public pages. Needs the demo server (PORT 3111). */
import { audit, report, LAST } from './phone-lib.mjs';
const DEMO = process.env.BASE || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const WIDTHS = (process.env.W || '320,390,430').split(',').map(Number);
const click = async (p, sel, ms = 400) => { const el = await p.$(sel + ':visible'); if (!el) throw new Error('missing ' + sel); await el.click(); await p.waitForTimeout(ms); };
async function run(w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('cp-tutor-dock', '0'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const A = (l) => audit(p, l, w);
  await p.goto(DEMO + '/'); await p.waitForTimeout(500); await A('demo sign-in');
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list'); await p.waitForTimeout(400);
  await A('roadmap');
  await click(p, '[data-action="open-track"]'); await A('module page');
  await click(p, '.skill-row'); await A('skill page');
  await click(p, '[data-action="start-learn"]'); await A('lesson 1');
  { const fab = await p.$('#tutor-launch:visible'); if (fab) { await fab.click(); await p.waitForTimeout(600); await A('assistant open'); const x = await p.$('#tutor-close:visible, #tutor-undock:visible'); if (x) { await x.click(); await p.waitForTimeout(300); } } }
  const lastBtn = await p.$$('.lesson-nav [data-action="lesson"][data-i]'); await lastBtn[lastBtn.length - 1].click(); await p.waitForTimeout(400); await A('last lesson (practice, project, quiz)');
  await click(p, '[data-action="start-exam"]'); await A('exam question');
  for (let i = 0; i < 40; i++) { const o = await p.$('[data-action="exam-answer"]'); if (!o) break; await o.click(); await p.waitForTimeout(200); }
  await p.waitForTimeout(800); await A('exam result');
  for (const n of ['leaderboard', 'challenge', 'certs', 'history', 'profile']) { await click(p, '[data-nav="' + n + '"]', 600); await A(n); }
  await click(p, '[data-action="role-menu"]'); await A('role menu open'); await p.keyboard.press('Escape');
  for (const pg of ['about', 'faq', 'help', 'contact', 'privacy', 'terms']) { const x = await ctx.newPage(); await x.goto(DEMO + '/' + pg + '.html'); await x.waitForTimeout(250); await audit(x, pg + '.html', w); await x.close(); }
  await p.close(); await ctx.close();
  // admin
  const c2 = await browser.newContext({ viewport: { width: w, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const q = await c2.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto(DEMO + '/'); await q.waitForTimeout(400);
  await q.evaluate(() => { const e = document.querySelector('#li-email'), pw = document.querySelector('#li-pass'); e.value = 'admin@careerpath.com'; pw.value = 'admin'; });
  await q.click('[data-action="login"]'); await q.waitForTimeout(800);
  const AA = (l) => audit(q, l, w);
  await AA('admin content');
  const open = await q.$('[data-action="a-open"]'); if (open) { await open.click(); await q.waitForTimeout(400); await AA('admin skill'); const lb = await q.$('[data-action="a-lessons"]'); }
  for (const n of ['a-drafts', 'a-challenges', 'a-students']) { const el = await q.$('[data-nav="' + n + '"]:visible'); if (el) { await el.click(); await q.waitForTimeout(600); await AA(n); } }
  await c2.close();
  if (errs.length) report.push({ w, label: 'JS ERRORS', bad: true, wide: errs.slice(0, 3), small: [], tiny: [], docOver: 0, bodyOver: 0 });
}
for (const w of WIDTHS) { try { await run(w); } catch (e) { report.push({ w, label: 'RUN ERROR', bad: true, wide: ['after ' + LAST + ': ' + e.message.replace(/\s+/g, ' ').slice(0, 700)], small: [], tiny: [], docOver: 0, bodyOver: 0 }); } }
const bad = report.filter(r => r.bad);
for (const r of report) console.log((r.bad ? 'FAIL ' : 'ok   ') + r.w + 'px ' + r.label + (r.bad ? ' :: docOver=' + r.docOver + ' bodyOver=' + r.bodyOver + ' ' + r.wide.join(' ; ') : ''));
await browser.close();
if (bad.length) { console.log(bad.length + ' phone layout problem(s)'); process.exit(1); }
console.log('phone layout ok: ' + report.length + ' screens');
