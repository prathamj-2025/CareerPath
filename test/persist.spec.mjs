/* Accounts are kept in the browser, so leaving and coming back does not start from scratch.
   A reload inside one page keeps localStorage, which is what a returning visitor has. */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};

const FAKE_GSI = `window.google = { accounts: { id: {
  initialize: function (o) { window.__gcb = o.callback; },
  renderButton: function (el) {
    el.innerHTML = '<button id="fake-google" type="button">Sign in with Google</button>';
    el.querySelector('button').onclick = function () { window.__gcb({ credential: 'fake.jwt.token' }); };
  },
  disableAutoSelect: function () {}
} } };`;

async function open(page, google) {
  if (google) {
    await page.route('**/api/config', r => r.fulfill({ json: { googleClientId: 'test.apps.googleusercontent.com' } }));
    await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_GSI }));
    await page.route('**/api/google-auth', r => r.fulfill({ json: google }));
  }
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
}

await step('an email account survives a reload and can sign in again', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await open(page);
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Keep Me'); await page.fill('#su-email', 'keep@usc.edu'); await page.fill('#su-pass', 'secret');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('#onb-file');
  await page.reload(); await page.waitForTimeout(400);
  await page.fill('#li-email', 'keep@usc.edu'); await page.fill('#li-pass', 'secret');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(300);
  if (await page.isVisible('#auth')) throw new Error('saved account did not sign in after reload');
  if (!(await page.textContent('body')).includes('Keep Me')) throw new Error('name missing after sign-in');
  if (page.errs.length) throw new Error(page.errs.join(' | '));
  await page.close();
});

await step('signing up again with a saved email is refused', async () => {
  const page = await browser.newPage();
  await open(page);
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Dup'); await page.fill('#su-email', 'dup@usc.edu'); await page.fill('#su-pass', 'pass');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('#onb-file');
  await page.reload(); await page.waitForTimeout(400);
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Dup'); await page.fill('#su-email', 'dup@usc.edu'); await page.fill('#su-pass', 'pass');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('#auth .err');
  await page.close();
});

await step('Google account and its progress are remembered: no profile form the second time', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await open(page, { email: 'back@gmail.com', name: 'Back Again', picture: null });
  await page.waitForSelector('#fake-google');
  await page.click('#fake-google');
  await page.waitForSelector('[data-action="google-finish"]');
  await page.click('[data-action="google-finish"]');
  await page.waitForSelector('#onb-file');
  await page.click('[data-action="logout"]').catch(() => {});
  await page.reload(); await page.waitForTimeout(500);
  await page.waitForSelector('#fake-google');
  await page.click('#fake-google');
  await page.waitForTimeout(400);
  if (await page.$('[data-action="google-finish"]')) throw new Error('asked for the profile again');
  if (await page.isVisible('#auth')) throw new Error('did not sign in');
  await page.close();
});

await step('demo accounts and classmates are not copied into storage', async () => {
  const page = await browser.newPage();
  await open(page);
  await page.fill('#li-email', 'student@careerpath.com'); await page.fill('#li-pass', 'student');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => localStorage.getItem('cp-accounts'));
  if (saved && JSON.parse(saved).length) throw new Error('demo data stored: ' + saved.slice(0, 80));
  await page.close();
});

await step('broken storage does not break the app', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('cp-accounts', '{not json'); });
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await open(page);
  if (!(await page.$('#li-email'))) throw new Error('sign-in missing');
  if (page.errs.length) throw new Error(page.errs.join(' | '));
  await page.close();
});

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed');
process.exit(failed ? 1 : 0);
