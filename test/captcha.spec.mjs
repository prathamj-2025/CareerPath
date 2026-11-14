/* The optional "are you human" check (Cloudflare Turnstile) on sign-up, sign-in, resend and reset. The check is stood in
   for by a fake widget; the fake database refuses sign-in calls that lack its token. Start servers with test/start-servers.sh. */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
const NOKEY = process.env.NOKEY_URL || 'http://localhost:3114';
const CRON = process.env.CRON_URL || 'http://localhost:3118';     // started with TURNSTILE_SITE_KEY=test-site-key
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const j = async path => (await fetch(FAKE + path)).json();
const need = (c, m) => { if (!c) throw new Error(m); };
await j('/__reset');

const FAKE_TURNSTILE = `(function () {
  var w = window.__ts = { renders: 0, executes: 0, resets: 0, mode: window.__tsMode || 'good', params: null };
  window.turnstile = {
    render: function (el, p) { w.renders++; w.params = p; return 'w1'; },
    reset: function () { w.resets++; },
    execute: function () {
      w.executes++;
      setTimeout(function () {
        if (window.__tsMode === 'fail') w.params['error-callback'](); else w.params.callback('good-token');
      }, 20);
    }
  };
})();`;

async function openPage(opts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  page.turnstileRequests = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { supabaseUrl: FAKE, supabaseKey: 'sb_publishable_test', captchaSiteKey: opts.key === false ? null : 'test-site-key' } }));
  await page.route('https://challenges.cloudflare.com/**', r => {
    page.turnstileRequests++;
    if (opts.block) return r.abort();
    return r.fulfill({ contentType: 'text/javascript', body: FAKE_TURNSTILE });
  });
  if (opts.mode) await page.addInitScript(m => { window.__tsMode = m; }, opts.mode);
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signup(page, email) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', 'Human Check'); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
}

await step('/api/config carries the site key only when TURNSTILE_SITE_KEY is set', async () => {
  const withKey = await (await fetch(CRON + '/api/config')).json();
  const without = await (await fetch(NOKEY + '/api/config')).json();
  need(withKey.captchaSiteKey === 'test-site-key', 'key missing: ' + JSON.stringify(withKey.captchaSiteKey));
  need(without.captchaSiteKey === null, 'key present when not set');
});

await step('with no site key the check is never loaded and sign-up works as before', async () => {
  const page = await openPage({ key: false });
  await signup(page, 'plain@usc.edu');
  await page.waitForSelector('[data-action="resend-confirm"]');
  need(page.turnstileRequests === 0, 'the check script was requested');
  need(!(await page.evaluate(() => !!window.turnstile)), 'widget exists');
  await page.context().close();
});

await step('with a site key, sign-up and sign-in send the token and succeed', async () => {
  await j('/__captcha?on=1');
  const page = await openPage({});
  await signup(page, 'human1@usc.edu');
  await page.waitForSelector('[data-action="resend-confirm"]', { timeout: 6000 });
  const seen = await j('/__captchaseen');
  need(seen.length === 1 && seen[0] === 'good-token', 'sign-up token: ' + JSON.stringify(seen));
  const { hash } = await j('/__confirm?email=human1@usc.edu');
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForTimeout(300);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  await page.click('[data-tab="login"]');
  await page.fill('#li-email', 'human1@usc.edu'); await page.fill('#li-pass', 'longenough1');
  await page.click('[data-action="login"]');
  await page.waitForSelector('#shell:not([hidden])', { timeout: 6000 });
  const seen2 = await j('/__captchaseen');
  need(seen2.length === 2 && seen2[1] === 'good-token', 'sign-in token: ' + JSON.stringify(seen2));
  const ts = await page.evaluate(() => window.__ts);
  need(ts.renders === 1 && ts.executes === 1, 'widget used ' + JSON.stringify(ts));
  need(!page.errs.length, page.errs.join(' | '));
  await page.context().close();
});

await step('a second sign-in attempt reuses the one widget and asks for a fresh token', async () => {
  const page = await openPage({});
  await page.click('[data-tab="login"]');
  for (let i = 0; i < 2; i++) {
    await page.fill('#li-email', 'nobody@usc.edu'); await page.fill('#li-pass', 'wrongpass12');
    await page.click('[data-action="login"]');
    await page.waitForSelector('#auth .err', { timeout: 6000 });
    await page.waitForTimeout(150);
  }
  const ts = await page.evaluate(() => window.__ts);
  need(ts.renders === 1 && ts.executes === 2 && ts.resets === 1, 'widget calls ' + JSON.stringify(ts));
  await page.context().close();
});

await step('if the check fails, nothing is sent to the database and the person is told', async () => {
  await j('/__reset'); await j('/__captcha?on=1');
  const page = await openPage({ mode: 'fail' });
  await signup(page, 'bot@usc.edu');
  await page.waitForSelector('#auth .err', { timeout: 6000 });
  need(/could not check that you are human/i.test(await page.textContent('#auth .err')), 'message: ' + await page.textContent('#auth .err'));
  const state = await j('/__state');
  need(!state.emails.includes('bot@usc.edu'), 'account was created without a check');
  need((await j('/__captchaseen')).length === 0, 'a call reached the database');
  await page.context().close();
});

await step('if the check script cannot load, sign-up is refused with the same message', async () => {
  const page = await openPage({ block: true });
  await signup(page, 'blocked@usc.edu');
  await page.waitForSelector('#auth .err', { timeout: 6000 });
  need(/could not check that you are human/i.test(await page.textContent('#auth .err')), 'message missing');
  need(!(await j('/__state')).emails.includes('blocked@usc.edu'), 'account created');
  await page.context().close();
});

await step('the database refusing a missing token is explained in plain words', async () => {
  const page = await openPage({ key: false });       // page does not send a token, the database (with captcha on) refuses
  await signup(page, 'notoken@usc.edu');
  await page.waitForSelector('#auth .err', { timeout: 6000 });
  need(/could not check that you are human/i.test(await page.textContent('#auth .err')), 'message: ' + await page.textContent('#auth .err'));
  await page.context().close();
});

await j('/__captcha?on=0');
console.log(failed ? failed + ' failed' : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
