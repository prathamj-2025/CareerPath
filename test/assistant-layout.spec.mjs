/* The study assistant button and chat on phones, tablets and laptops of any size.
   Needs the demo server (PORT 3111). */
import { chromium } from 'playwright';

const DEMO = process.env.BASE || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

async function toLesson(p) {
  await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list');
  for (const s of ['[data-action="open-track"]', '.skill-row', '[data-action="start-learn"]']) { await (await p.$(s + ':visible')).click(); await p.waitForTimeout(300); }
}
const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; }, sel);
const inside = (r, W, H) => r && r.l >= -0.5 && r.t >= -0.5 && r.r <= W + 0.5 && r.b <= H + 0.5;
const overlap = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

for (const [w, h, touch] of [[320, 568, true], [375, 600, true], [390, 844, true], [430, 932, true], [740, 360, true], [768, 1024, true], [1024, 768, false], [1280, 720, false], [1366, 768, false], [1920, 1080, false]]) {
  await step(`assistant opens inside the screen at ${w}x${h}`, async () => {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch });
    const p = await c.newPage(); await toLesson(p);
    const launch = await p.$('#tutor-launch:visible');
    if (launch) { await launch.click(); await p.waitForTimeout(400); }
    const panel = await rect(p, '#tutor-panel');
    ok(inside(panel, w, h), 'panel outside screen ' + JSON.stringify(panel));
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sideways scroll');
    const input = await rect(p, '#tutor-input');
    ok(inside(input, w, h), 'question box outside screen');
    await c.close();
  });
}

await step('on a phone the button does not cover the last button on a page', async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 600 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(); await toLesson(p);
  const nums = await p.$$('.lesson-nav [data-action="lesson"][data-i]'); await nums[nums.length - 1].click(); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
  const l = await rect(p, '#tutor-launch'), n = await rect(p, '[data-action="start-exam"]');
  ok(l && n, 'missing button'); ok(!overlap(l, n), 'assistant button covers the assessment button');
  ok(l.r - l.l <= 56, 'button is not compact');
  await c.close();
});

await step('on a phone the button is not shown during an assessment', async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 600 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(); await toLesson(p);
  const nums = await p.$$('.lesson-nav [data-action="lesson"][data-i]'); await nums[nums.length - 1].click(); await p.waitForTimeout(300);
  await (await p.$('[data-action="start-exam"]:visible')).click(); await p.waitForTimeout(500);
  ok(!(await rect(p, '#tutor-launch')), 'assistant button visible during the exam');
  await c.close();
});

await step('on a phone the chat shrinks with the keyboard and the page behind does not scroll', async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(); await toLesson(p);
  await (await p.$('#tutor-launch:visible')).click(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.body.classList.contains('tutor-locked')), 'page behind not locked');
  ok(!(await p.evaluate(() => document.activeElement && document.activeElement.id === 'tutor-input')), 'keyboard raised before a tap');
  await p.setViewportSize({ width: 375, height: 330 }); await p.waitForTimeout(400);
  const panel = await rect(p, '#tutor-panel'), foot = await rect(p, '#tutor-foot');
  ok(inside(panel, 375, 330) && inside(foot, 375, 330), 'chat not inside the shrunken screen');
  await p.click('#tutor-close'); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => document.body.classList.contains('tutor-locked'))), 'page stays locked after closing');
  await c.close();
});

await step('on a laptop the assistant docks beside the page without covering it', async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await c.newPage(); await toLesson(p);
  const panel = await rect(p, '#tutor-panel'), view = await rect(p, '#view');
  ok(panel && view && view.r <= panel.l + 1, 'docked panel covers the page');
  await c.close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
