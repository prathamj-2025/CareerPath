/* A student saved on the Data Analyst roadmap, which no longer exists, is sent to the roadmap
   picker with their stars kept in history, and cannot "resume" a roadmap that is gone. */
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
let failed = 0;
const step = async (l, f) => { try { await f(); console.log('ok   ' + l); } catch (e) { failed++; console.log('FAIL ' + l + ' :: ' + e.message); } };

await page.addInitScript(() => {
  if (!localStorage.getItem('cp-accounts')) {
    localStorage.setItem('cp-accounts', JSON.stringify([{
      id: 'uold1', name: 'Old Student', email: 'old@usc.edu', password: 'pw', role: 'student', school: 'USC', major: 'DS',
      gradYear: '2026', roleId: 'da', points: 300,
      progress: { 'sql-da': { stars: 3, best: 80, attempts: 1, project: false, lessonsDone: [0], history: [] },
                  'stats-da': { stars: 2, best: 70, attempts: 1, project: false, lessonsDone: [0], history: [] } },
      roleHistory: [], challenges: {}, mexams: {}, resume: null, placement: null
    }]));
  }
});
await page.goto(BASE + '/'); await page.waitForTimeout(400);

await step('a student on a retired roadmap lands on the roadmap picker', async () => {
  await page.fill('#li-email', 'old@usc.edu'); await page.fill('#li-pass', 'pw');
  await page.click('[data-action="login"]');
  await page.waitForSelector('.role-grid', { timeout: 8000 });
  const cards = await page.$$eval('.role-card', els => els.length);
  if (cards !== 3) throw new Error('expected 3 roadmaps, got ' + cards);
});

await step('their stars are kept in history and cannot be resumed', async () => {
  const t = await page.textContent('#view');
  if (!t.includes('Data Analyst')) throw new Error('history lost');
  if (!t.includes('No longer offered')) throw new Error('no explanation that the roadmap is gone');
  if (await page.$('[data-action="pick-role"][data-role="da"]')) throw new Error('a retired roadmap can be picked');
  const stars = await page.$$eval('table.grid tbody tr', rows => rows[0].children[1].textContent.trim());
  if (stars !== '5') throw new Error('stars shown: ' + stars);
});

console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno js errors');
console.log(failed ? '\n' + failed + ' FAILED' : '\nall steps passed');
await browser.close();
process.exit(failed ? 1 : 0);
