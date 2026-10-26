/* Real accounts against a stand-in Supabase (test/fakesupabase.mjs).
   Start: FAKE_PORT=3113 node test/fakesupabase.mjs &
          CP_DEMO=0 SUPABASE_URL=http://localhost:3113 SUPABASE_PUBLISHABLE_KEY=sb_publishable_test PORT=3114 node test/devserver.mjs & */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3114';
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

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signup(page, name, email, pass) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', pass);
  await page.click('[data-action="signup"]');
}
async function login(page, email, pass) {
  await page.click('[data-tab="login"]');
  await page.fill('#li-email', email); await page.fill('#li-pass', pass);
  await page.click('[data-action="login"]');
}
async function link(page, hash) { await page.goto(BASE + '/' + hash); }

await step('real mode: no demo logins, no pre-filled password', async () => {
  const page = await fresh();
  need(!(await page.textContent('#auth')).includes('student@careerpath.com'), 'demo account shown');
  need((await page.inputValue('#li-pass')) === '', 'password pre-filled');
  need(await page.isVisible('[data-action="forgot"]'), 'no forgot-password link');
  await page.context().close();
});

await step('sign-up asks to confirm the email, keeps what was typed on an error', async () => {
  const page = await fresh();
  await signup(page, 'Mia Test', 'mia@usc.edu', 'short');
  await page.waitForSelector('#auth .err');
  need((await page.textContent('#auth .err')).includes('8 characters'), 'short password not refused');
  need((await page.inputValue('#su-name')) === 'Mia Test', 'typed name lost');
  await page.fill('#su-pass', 'longenough1');
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  need((await page.textContent('#auth')).includes('mia@usc.edu'), 'email not shown');
  need(await page.isHidden('#onb-file').catch(() => true), 'signed in before confirming');
  await page.context().close();
});

await step('an unconfirmed email cannot sign in and is told why', async () => {
  const page = await fresh();
  await login(page, 'mia@usc.edu', 'longenough1');
  await page.waitForSelector('[data-action="resend-confirm"]');
  await page.click('[data-action="resend-confirm"]');
  await page.waitForFunction(() => /Sent again/.test(document.querySelector('#auth').textContent));
  await page.context().close();
});

await step('wrong password gives a plain message', async () => {
  const page = await fresh();
  await j('/__confirm?email=mia@usc.edu');
  await login(page, 'mia@usc.edu', 'not-the-password');
  await page.waitForSelector('#auth .err');
  need((await page.textContent('#auth .err')).includes('Wrong email or password'), 'unexpected message');
  await page.context().close();
});

await step('an already-registered email is refused at sign-up', async () => {
  const page = await fresh();
  await signup(page, 'Mia Again', 'mia@usc.edu', 'longenough1');
  await page.waitForSelector('#auth .err');
  need((await page.textContent('#auth .err')).includes('already exists'), 'duplicate not refused');
  await page.context().close();
});

await step('the email link signs the student in, and school/major/year reach the profile', async () => {
  const page = await fresh();
  await signup(page, 'Lee Grad', 'lee@usc.edu', 'longenough1');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=lee@usc.edu');
  await link(page, hash);
  await page.waitForSelector('#onb-file');
  need(!page.url().includes('access_token'), 'tokens left in the address bar');
  const row = await j('/__profile?email=lee@usc.edu');
  need(row.name === 'Lee Grad' && row.school && row.grad_year, 'profile fields missing: ' + JSON.stringify(row));
  need(row.role === 'student', 'not a student');
  await page.context().close();
});

await step('roadmap choice is saved to the profile and survives a reload and a new browser', async () => {
  const page = await fresh();
  await signup(page, 'Pat Road', 'pat@usc.edu', 'longenough1');
  await page.waitForSelector('[data-action="resend-confirm"]');
  await link(page, (await j('/__confirm?email=pat@usc.edu')).hash);
  await page.waitForSelector('#onb-file');
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="pjm"]');
  await page.waitForTimeout(1800);
  let row = await j('/__profile?email=pat@usc.edu');
  need(row.roadmap_id === 'pjm', 'roadmap not saved: ' + row.roadmap_id);
  await page.reload(); await page.waitForTimeout(800);
  need(await page.isHidden('#auth'), 'signed out by a reload');
  need((await page.textContent('body')).includes('Pat Road'), 'name missing after reload');
  // a different browser: no local data, everything comes from the profile
  const other = await fresh();
  await login(other, 'pat@usc.edu', 'longenough1');
  await other.waitForSelector('#shell:not([hidden])');
  await other.waitForTimeout(500);
  need((await other.textContent('#shell')).includes('Project Manager'), 'roadmap not restored on another browser');
  need(other.errs.length === 0, other.errs.join(' | '));
  await page.context().close(); await other.context().close();
});

await step('an expired access token is refreshed without signing the student out', async () => {
  const page = await fresh();
  await login(page, 'pat@usc.edu', 'longenough1');
  await page.waitForSelector('#shell:not([hidden])');
  await j('/__expire');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cp-session')); s.exp = Date.now() - 1000; localStorage.setItem('cp-session', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(800);
  need(await page.isHidden('#auth'), 'signed out although the refresh token was valid');
  await page.context().close();
});

await step('signing out clears the session and the next student sees none of the first one', async () => {
  const page = await fresh();
  await login(page, 'pat@usc.edu', 'longenough1');
  await page.waitForSelector('#shell:not([hidden])');
  await page.click('[data-action="logout"]');
  await page.waitForSelector('#auth:not([hidden])');
  need(!(await page.evaluate(() => localStorage.getItem('cp-session'))), 'session kept after sign-out');
  await page.reload(); await page.waitForTimeout(600);
  need(await page.isVisible('#auth'), 'still signed in after sign-out + reload');
  await j('/__confirm?email=lee@usc.edu');
  await login(page, 'lee@usc.edu', 'longenough1');
  await page.waitForSelector('#onb-file');
  need(!(await page.content()).includes('Pat Road'), 'first student visible to the second');
  await page.context().close();
});

await step('forgot password, reset link, new password works, old one does not', async () => {
  const page = await fresh();
  await page.click('[data-action="forgot"]');
  await page.fill('#fg-email', 'pat@usc.edu');
  await page.click('[data-action="forgot-send"]');
  await page.waitForFunction(() => /reset link is on its way/.test(document.querySelector('#auth').textContent));
  await link(page, (await j('/__recovery?email=pat@usc.edu')).hash);
  await page.waitForSelector('#rs-pass');
  await page.fill('#rs-pass', 'newpassword9'); await page.fill('#rs-pass2', 'different99');
  await page.click('[data-action="reset-save"]');
  await page.waitForSelector('#auth .err');
  await page.fill('#rs-pass', 'newpassword9'); await page.fill('#rs-pass2', 'newpassword9');
  await page.click('[data-action="reset-save"]');
  await page.waitForSelector('#shell:not([hidden])');
  await page.click('[data-action="logout"]');
  await page.waitForSelector('#auth:not([hidden])');
  await login(page, 'pat@usc.edu', 'longenough1');
  await page.waitForSelector('#auth .err');
  await login(page, 'pat@usc.edu', 'newpassword9');
  await page.waitForSelector('#shell:not([hidden])');
  await page.context().close();
});

await step('an expired or used email link shows a clear message', async () => {
  const page = await fresh();
  await link(page, '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.waitForSelector('#auth .err');
  need((await page.textContent('#auth .err')).includes('expired'), 'no expiry message');
  await page.context().close();
});

await step('a student cannot make themselves an admin, an admin goes to Content', async () => {
  const page = await fresh();
  await login(page, 'pat@usc.edu', 'newpassword9');
  await page.waitForSelector('#shell:not([hidden])');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('cp-session')).access);
  const bad = await fetch(FAKE + '/rest/v1/profiles?id=eq.x', { method: 'PATCH', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
  need(bad.status !== 204, 'role edit was accepted');
  await page.click('[data-action="logout"]');
  await signup(page, 'Ada Admin', 'ada@careerpath.com', 'longenough1');
  await link(page, (await j('/__confirm?email=ada@careerpath.com')).hash);
  await page.waitForSelector('#onb-file');
  await j('/__admin?email=ada@careerpath.com');
  await page.click('[data-action="logout"]').catch(() => {});
  await page.goto(BASE + '/'); await page.waitForTimeout(400);
  await login(page, 'ada@careerpath.com', 'longenough1');
  await page.waitForFunction(() => /Content|Review queue/.test(document.body.textContent) && !document.getElementById('shell').hidden);
  await page.context().close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
