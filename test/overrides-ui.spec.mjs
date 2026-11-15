/* An admin edits a skill's project brief and a practice exercise on the admin screen, then puts an earlier version back
   (real-account mode, fake database). Start servers with test/start-servers.sh. */
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

const SK = 'sql-ba';
let page, shippedTitle = '';

await step('an admin edits a project brief and a practice exercise on the admin screen', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Ada Admin'); await page.fill('#su-email', 'ada@usc.edu'); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=ada@usc.edu');
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
  await j('/__admin?email=ada@usc.edu');
  await page.goto(BASE + '/'); await page.waitForTimeout(500);
  if (await page.$('[data-action="logout"]')) await page.click('[data-action="logout"]');
  await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="login"]');
  await page.fill('#li-email', 'ada@usc.edu'); await page.fill('#li-pass', 'longenough1');
  await page.click('[data-action="login"]');
  await page.waitForSelector('#shell:not([hidden])');
  await page.waitForSelector('[data-action="a-lessons"][data-skill="' + SK + '"]');
  await page.click('[data-action="a-lessons"][data-skill="' + SK + '"]');

  shippedTitle = (await page.textContent('h2:has-text("Skill project") + div p')).trim();
  need(shippedTitle.length > 3, 'no project shown');
  await page.click('[data-action="ap-edit"]');
  await page.fill('#ap-t', 'Reconciliation pack');
  await page.fill('#ap-b', 'Write five queries and say what result you expect for each one.');
  await page.click('[data-action="ap-save"]');
  await page.waitForSelector('text=Reconciliation pack');
  const db = await j('/__content');
  need(db.overrides.some(r => r.kind === 'project' && r.key === SK && r.status === 'live' && r.data.title === 'Reconciliation pack'), 'project not saved: ' + JSON.stringify(db.overrides).slice(0, 200));

  await page.click('[data-action="ax-edit"][data-i="0"]');
  await page.fill('#ax-p', 'Revenue is off by 8 percent. Where do you look first?');
  await page.fill('#ax-h', 'Think about the grain of the join.\nCheck for rows that fan out.');
  await page.click('[data-action="ax-save"]');
  await page.waitForSelector('text=Revenue is off by 8 percent');
  need((await j('/__content')).overrides.some(r => r.kind === 'practice' && r.key === SK + '#0' && r.status === 'live'), 'exercise not saved');
  need(page.errs.length === 0, 'page errors: ' + page.errs.join('; '));
});

await step('an empty brief is not sent, and an earlier version can be restored from the page', async () => {
  await page.click('[data-action="ap-edit"]');
  await page.fill('#ap-b', '');
  await page.click('[data-action="ap-save"]');
  need((await j('/__content')).overrides.filter(r => r.kind === 'project' && r.status === 'live').length === 1, 'an empty brief changed the live version');
  await page.click('[data-action="ap-cancel"]');
  await page.click('h2:has-text("Skill project") + div summary');
  await page.click('[data-action="ar-restore"][data-kind="project"][data-v="1"]');
  await page.waitForSelector('text=' + shippedTitle);
  const live = (await j('/__content')).overrides.filter(r => r.kind === 'project' && r.key === SK && r.status === 'live');
  need(live.length === 1 && live[0].data.title === shippedTitle, 'restore did not put the shipped project back: ' + JSON.stringify(live));
  need(page.errs.length === 0, 'page errors: ' + page.errs.join('; '));
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
