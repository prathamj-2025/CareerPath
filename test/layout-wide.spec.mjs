/* Wide screens use their room, and board names are never cut off or shown as stray symbols.
   Needs the demo server (PORT 3111). */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const DEMO = process.env.BASE || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// shortName and initials come straight from app.js
const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const grab = (name) => { const i = src.indexOf('  function ' + name + '('); const j = src.indexOf('\n  }\n', i); return src.slice(i, j + 4); };
const { shortName, initials } = new Function(grab('shortName') + grab('initials') + '; return { shortName, initials };')();

await step('board names: first name and last initial, no stray symbols', async () => {
  const cases = { 'Pratham Jain': 'Pratham J.', 'PJ (2)': 'PJ', 'PJ (Pratham Jain)': 'Pratham J.', 'Ana': 'Ana', '': 'Student', '  maria   de la cruz ': 'maria C.', 'Zoë Müller': 'Zoë M.' };
  for (const k of Object.keys(cases)) ok(shortName(k) === cases[k], JSON.stringify(k) + ' -> ' + shortName(k) + ' (wanted ' + cases[k] + ')');
});
await step('initials ignore brackets and numbers', async () => {
  ok(initials('PJ (2)') === 'P', initials('PJ (2)'));
  ok(initials('Pratham Jain') === 'PJ', initials('Pratham Jain'));
  ok(initials('(2)') === '?', initials('(2)'));
});

async function roadmap(w, h, dock) {
  const c = await browser.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript(d => { try { localStorage.setItem('cp-tutor-dock', d); } catch (e) {} }, dock);
  const p = await c.newPage(); await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list'); await p.waitForTimeout(400);
  return { c, p };
}
const box = (p, sel) => p.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; }, sel);

await step('MacBook Air width (1440, assistant hidden): the roadmap fills the screen', async () => {
  const { c, p } = await roadmap(1440, 800, '0');
  const pg = await box(p, '.roadmap-cols'); ok(pg.w >= 1250, 'content only ' + Math.round(pg.w) + 'px wide');
  const rail = await box(p, '.rail'); ok(rail.w >= 300, 'side board only ' + Math.round(rail.w) + 'px wide');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sideways scroll');
  await c.close();
});
await step('large screen (1920): content stays centred and readable', async () => {
  const { c, p } = await roadmap(1920, 1080, '0');
  const pg = await box(p, '.roadmap-cols'); ok(pg.w <= 1320 && pg.w >= 1200, 'width ' + Math.round(pg.w));
  await c.close();
});
await step('with the assistant docked (1440) nothing overflows and the board stays beside the roadmap', async () => {
  const { c, p } = await roadmap(1440, 800, '1');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sideways scroll');
  const a = await box(p, '.skill-list, .rm-list'), r = await box(p, '.rail'); ok(r.l >= a.r - 1, 'board not beside the list');
  await c.close();
});
await step('lessons keep a readable line length on a wide screen', async () => {
  const { c, p } = await roadmap(1920, 1080, '0');
  for (const s of ['[data-action="open-track"]', '.skill-row', '[data-action="start-learn"]']) { await (await p.$(s + ':visible')).click(); await p.waitForTimeout(300); }
  const v = await box(p, '#view'); ok(v.w <= 1090, 'lesson page ' + Math.round(v.w) + 'px wide');
  await c.close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
