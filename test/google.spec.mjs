/* Sign in with Google. Google itself cannot be reached from the test sandbox, so the Google
   script and the verification route are stubbed in the browser; the real server route is
   checked separately for the inputs it must refuse. */
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

async function pageWith({ clientId, profile, status = 200 }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  await page.route('**/api/config', r => r.fulfill({ json: { googleClientId: clientId } }));
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_GSI }));
  await page.route('**/api/google-auth', r => r.fulfill({ status, json: profile }));
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
  return page;
}

await step('no client ID configured: no Google button, password sign-in unchanged', async () => {
  const page = await pageWith({ clientId: null, profile: {} });
  const shown = await page.$eval('#g-wrap', el => !el.hidden).catch(() => false);
  if (shown) throw new Error('Google button shown without a client ID');
  if (!(await page.$('[data-action="login"]'))) throw new Error('password sign-in missing');
  await page.close();
});

await step('first Google sign-in asks for school, then starts onboarding', async () => {
  const page = await pageWith({ clientId: 'test.apps.googleusercontent.com',
    profile: { email: 'new.person@gmail.com', name: 'New Person', picture: null } });
  await page.waitForSelector('#fake-google');
  if (await page.$eval('#g-wrap', el => el.hidden)) throw new Error('Google button hidden');
  await page.click('#fake-google');
  await page.waitForSelector('[data-action="google-finish"]');
  const t = await page.textContent('#auth');
  if (!t.includes('new.person@gmail.com')) throw new Error('email not shown on the profile step');
  if ((await page.inputValue('#gf-name')) !== 'New Person') throw new Error('name not prefilled');
  await page.click('[data-action="google-finish"]');
  await page.waitForSelector('#onb-file, .onb-step', { timeout: 5000 });
  if (page.errs.length) throw new Error(page.errs.join(' | '));
  await page.close();
});

await step('a rejected token shows the server message and signs nobody in', async () => {
  const page = await pageWith({ clientId: 'test.apps.googleusercontent.com', status: 401,
    profile: { error: { code: 'invalid_token', message: 'This sign-in was not issued for CareerPath.' } } });
  await page.waitForSelector('#fake-google');
  await page.click('#fake-google');
  await page.waitForSelector('#auth .err');
  if (!(await page.textContent('#auth .err')).includes('not issued for CareerPath')) throw new Error('wrong message');
  if (!(await page.isVisible('#auth'))) throw new Error('left the sign-in screen');
  await page.close();
});

await step('a Google-only account cannot be opened with an empty password', async () => {
  const page = await pageWith({ clientId: 'test.apps.googleusercontent.com',
    profile: { email: 'g.only@gmail.com', name: 'G Only', picture: null } });
  await page.waitForSelector('#fake-google');
  await page.click('#fake-google');
  await page.waitForSelector('[data-action="google-finish"]');
  await page.click('[data-action="google-finish"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="logout"]').catch(() => {});
  await page.waitForSelector('#li-email');
  await page.fill('#li-email', 'g.only@gmail.com'); await page.fill('#li-pass', '');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(200);
  if (!(await page.isVisible('#auth'))) throw new Error('signed in with no password');
  await page.close();
});

await step('server route refuses a missing token and an unconfigured deployment', async () => {
  const page = await browser.newPage();
  await page.goto(BASE + '/');
  const r = await page.evaluate(async () => {
    const a = await fetch('/api/google-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const c = await fetch('/api/config');
    return { status: a.status, body: await a.json(), config: await c.json() };
  });
  // The test server runs without GOOGLE_CLIENT_ID, so the route must say it is not set up.
  if (r.config.googleClientId !== null) throw new Error('config leaked a client id');
  if (r.status !== 500 || r.body.error.code !== 'not_configured') throw new Error(JSON.stringify(r));
  await page.close();
});

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed');
process.exit(failed ? 1 : 0);
