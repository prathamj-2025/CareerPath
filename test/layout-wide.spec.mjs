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
await step('lesson text keeps a readable line length on a wide screen', async () => {
  const { c, p } = await roadmap(1920, 1080, '0');
  for (const s of ['[data-action="open-track"]', '.skill-row', '[data-action="start-learn"]']) { await (await p.$(s + ':visible')).click(); await p.waitForTimeout(300); }
  const v = await box(p, '.prose'); ok(v.w <= 1000, 'lesson text ' + Math.round(v.w) + 'px wide');
  await c.close();
});

await step('lesson page: a lesson list beside the lesson on a laptop, numbered chips on a phone', async () => {
  const { c, p } = await roadmap(1440, 800, '0');
  for (const s of ['[data-action="open-track"]', '.skill-row', '[data-action="start-learn"]']) { await (await p.$(s + ':visible')).click(); await p.waitForTimeout(300); }
  const rail = await box(p, '.learn-rail'), main = await box(p, '.learn-main');
  ok(rail.w >= 250 && rail.l >= main.r, 'lesson list not beside the lesson');
  ok(main.w >= 800, 'lesson only ' + Math.round(main.w) + 'px wide');
  await (await p.$('.learn-rail [data-action="lesson"][data-i="2"]')).click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /Lesson 3 of/.test(document.querySelector('.eyebrow').textContent)), 'list did not open lesson 3');
  await c.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const q = await m.newPage(); await q.goto(DEMO + '/'); await q.waitForTimeout(300);
  await q.click('[data-action="login"]'); await q.waitForSelector('.skill-list');
  for (const s of ['[data-action="open-track"]', '.skill-row', '[data-action="start-learn"]']) { await (await q.$(s + ':visible')).click(); await q.waitForTimeout(300); }
  ok(!(await q.$('.learn-rail:visible')), 'lesson list shown on a phone');
  ok(await q.$('.lesson-nav [data-action="lesson"]:visible'), 'numbered lessons missing on a phone');
  await m.close();
});

await step('the Ask button never sits on the footer links', async () => {
  for (const [w, h, touch] of [[1440, 800, false], [1024, 700, false], [390, 800, true]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch });
    await c.addInitScript(() => { try { localStorage.setItem('cp-tutor-dock', '0'); } catch (e) {} });
    const p = await c.newPage(); await p.goto(DEMO + '/'); await p.waitForTimeout(300);
    await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list'); await p.waitForTimeout(300);
    await p.evaluate(() => { document.getElementById('sitefoot').innerHTML = '<a href="#">About</a> <a href="#">FAQ</a> <a href="#">Terms</a>'; window.scrollTo(0, document.body.scrollHeight); });
    await p.waitForTimeout(300);
    const hit = await p.evaluate(() => { const a = document.getElementById('tutor-launch').getBoundingClientRect();
      return [...document.querySelectorAll('#sitefoot a')].some(e => { const r = e.getBoundingClientRect(); return r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top; }); });
    ok(!hit, 'Ask button covers a footer link at ' + w + 'px');
    await c.close();
  }
});

await step('skill page uses two columns on a laptop', async () => {
  const { c, p } = await roadmap(1440, 800, '0');
  for (const s of ['[data-action="open-track"]', '.skill-row']) { await (await p.$(s + ':visible')).click(); await p.waitForTimeout(300); }
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector('.skill-cols')).gridTemplateColumns.split(' ').length);
  ok(cols === 2, 'columns: ' + cols);
  await c.close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
