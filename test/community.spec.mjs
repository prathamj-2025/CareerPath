/* Real leaderboard, profile editing, account deletion and the admin student list (test/fakesupabase.mjs). */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3114';
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

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signupConfirmed(page, name, email) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
}
async function login(page, email) {
  await page.click('[data-tab="login"]');
  await page.fill('#li-email', email); await page.fill('#li-pass', 'longenough1');
  await page.click('[data-action="login"]');
  await page.waitForSelector('#shell:not([hidden])');
}
async function pickRole(page, id) {
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="' + id + '"]');
  await page.waitForSelector('[data-action="open-track"], .skill-row');
}

let tia, sam;
await step('two real students on the same roadmap and school see each other by short name only', async () => {
  tia = await fresh(); await signupConfirmed(tia, 'Tia Ramirez', 'tia@usc.edu'); await pickRole(tia, 'pm');
  sam = await fresh(); await signupConfirmed(sam, 'Sam Saver', 'sam@usc.edu'); await pickRole(sam, 'pm');
  await tia.waitForTimeout(1500);
  await j('/__seed?email=tia@usc.edu', { points: 900, skills: [{ skill_id: 'discovery-pm', stars: 4, best: 90, attempts: 2, project: false, lessons_done: [0], history: [] }] });
  await sam.click('[data-nav="leaderboard"]');
  await sam.waitForFunction(() => /Tia R\./.test(document.body.textContent), null, { timeout: 8000 });
  const t = await sam.textContent('[data-live="board"]');
  need(t.includes('Tia R.'), 'peer not shown: ' + t.slice(0, 200));
  need(!t.includes('Ramirez') && !t.includes('tia@'), 'full name or email shown');
  need(t.includes('Sam Saver') && t.includes('You'), 'own row missing');
  need(t.indexOf('Tia R.') < t.indexOf('Sam Saver'), 'ranking order wrong');
});

await step('no made-up classmates appear on a real board', async () => {
  const text = await sam.textContent('body');
  for (const fake of ['Priya Chavan', 'Marcus Webb', 'Ana Ruiz', 'Dev Patel', 'Raj Menon', 'Dana Whitfield'])
    need(!text.includes(fake), fake + ' is still shown');
  need(!/generated on a timer/.test(text), 'prototype note still shown');
});

await step('a student on another roadmap or school is not on the board', async () => {
  const other = await fresh(); await signupConfirmed(other, 'Ola Other', 'ola@usc.edu'); await pickRole(other, 'pjm');
  await j('/__seed?email=ola@usc.edu', { points: 5000 });
  await sam.waitForTimeout(500);
  await sam.click('[data-nav="roadmap"]'); await sam.click('[data-nav="leaderboard"]');
  await sam.waitForTimeout(800);
  need(!(await sam.textContent('[data-live="board"]')).includes('Ola'), 'student from another roadmap shown');
  await other.context().close();
});

await step('profile details save to the database and the leaderboard opt-out hides the student from others', async () => {
  await tia.click('[data-nav="profile"]');
  await tia.waitForSelector('#pf-name');
  const lay = async () => tia.evaluate(() => {
    const b = document.querySelector('#pf-board').getBoundingClientRect();
    const t = document.querySelector('.check-title').getBoundingClientRect();
    const h = document.querySelector('.check-help');
    const lines = Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight));
    const words = h.textContent.trim().split(/\s+/);
    const r = document.createRange(); r.selectNodeContents(h);
    const rects = Array.from(r.getClientRects()); const lastTop = Math.max(...rects.map(x => x.top));
    const lastWords = rects.filter(x => x.top === lastTop).length;
    return { sameRow: Math.abs((b.top + b.height / 2) - (t.top + t.height / 2)) < 10 && t.left > b.right, lines, lastTop, lastWords, w: b.width };
  });
  let L = await lay();
  need(L.sameRow && L.w < 30, 'checkbox and label are not on one row: ' + JSON.stringify(L));
  need(L.lines === 1, 'help text should sit on one line on a desktop screen: ' + JSON.stringify(L));
  await tia.setViewportSize({ width: 380, height: 800 }); await tia.waitForTimeout(150);
  L = await lay();
  need(L.sameRow && L.w < 30, 'narrow: checkbox and label are not on one row: ' + JSON.stringify(L));
  await tia.setViewportSize({ width: 1280, height: 900 });
  await tia.fill('#pf-name', 'Tia Ramirez-Lopez');
  await tia.selectOption('#pf-year', '2028');
  await tia.uncheck('#pf-board');
  await tia.click('[data-action="profile-save"]');
  await tia.waitForTimeout(2200);
  const row = await j('/__profile?email=tia@usc.edu');
  need(row.name === 'Tia Ramirez-Lopez' && row.grad_year === '2028' && row.show_on_leaderboard === false, JSON.stringify(row));
  await sam.click('[data-nav="roadmap"]'); await sam.click('[data-nav="leaderboard"]');
  await sam.waitForTimeout(500);
  await sam.evaluate(() => new Promise(r => setTimeout(r, 100)));
  // the board refreshes every 30 seconds; trigger the refresh the way a page change does
  await sam.click('[data-nav="roadmap"]'); await sam.click('[data-nav="leaderboard"]');
  await sam.waitForFunction(() => !/Tia R\./.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 8000 });
});

await step('an empty name is refused', async () => {
  await tia.fill('#pf-name', '');
  await tia.click('[data-action="profile-save"]');
  await tia.waitForFunction(() => /cannot be empty/.test(document.body.textContent));
});

await step('the admin sees real students, and they are not kept in the browser', async () => {
  const adm = await fresh(); await signupConfirmed(adm, 'Ada Admin', 'ada@careerpath.com');
  await j('/__admin?email=ada@careerpath.com');
  await adm.click('[data-action="logout"]');
  await adm.waitForSelector('#auth:not([hidden])');
  await login(adm, 'ada@careerpath.com');
  await adm.click('[data-nav="a-students"]');
  await adm.waitForFunction(() => /Sam Saver/.test(document.body.textContent) && /Tia Ramirez-Lopez/.test(document.body.textContent), null, { timeout: 8000 });
  need(!(await adm.textContent('body')).includes('Priya Chavan'), 'made-up students shown to the admin');
  const stored = await adm.evaluate(() => localStorage.getItem('cp-accounts') || '');
  need(!stored.includes('Sam Saver') && !stored.includes('tia@usc.edu'), 'students were copied into the admin\'s browser storage');
  await adm.context().close();
});

await step('deleting an account removes it from the database and signs the student out', async () => {
  await sam.click('[data-nav="profile"]');
  await sam.waitForSelector('[data-action="delete-ask"]');
  await sam.click('[data-action="delete-ask"]');
  await sam.waitForSelector('[data-action="delete-confirm"]');
  await sam.click('[data-action="delete-cancel"]');
  need(await sam.isVisible('[data-action="delete-ask"]'), 'cancel did not keep the account');
  await sam.click('[data-action="delete-ask"]');
  await sam.click('[data-action="delete-confirm"]');
  await sam.waitForSelector('#auth:not([hidden])');
  need((await sam.textContent('#auth')).includes('were deleted'), 'no confirmation message');
  const state = await j('/__state');
  need(!state.emails.includes('sam@usc.edu'), 'account still exists on the server');
  await sam.fill('#li-email', 'sam@usc.edu'); await sam.fill('#li-pass', 'longenough1');
  await sam.click('[data-action="login"]');
  await sam.waitForSelector('#auth .err');
  const stored = await sam.evaluate(() => localStorage.getItem('cp-accounts') || '');
  need(!stored.includes('Sam Saver'), 'deleted student still in browser storage');
  need(!(await sam.evaluate(() => localStorage.getItem('cp-session'))), 'session kept after deleting');
});

await tia.context().close(); await sam.context().close();
await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
