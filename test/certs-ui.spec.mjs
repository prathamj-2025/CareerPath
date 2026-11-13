/* Certificates through the real pages (real-account mode, fake database): a student with a passed module sees an ID the
   server issued, can print and copy a link, the public page checks it, and an admin can revoke it from the student's page.
   Start servers with test/start-servers.sh. */
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

async function fresh(width) {
  const ctx = await browser.newContext({ viewport: { width: width || 1280, height: 900 } });
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
async function pickPM(page) {
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="pm"]');
  await page.waitForSelector('[data-action="open-track"]');
  await page.waitForTimeout(1500);
}
const TRACK = 'pm-fundamentals';
const SKILLS = ['foundations-pm', 'lifecycle-pm', 'discovery-pm', 'market-pm', 'strategy-pm'];
let stu, certId;

await step('a student with a passed module sees the ID the server issued, on the list and on the certificate', async () => {
  stu = await fresh();
  await signupConfirmed(stu, 'Sam Rivera', 'sam@usc.edu');
  await pickPM(stu);
  await j('/__seed?email=sam@usc.edu', {
    skills: SKILLS.map(id => ({ skill_id: id, stars: 3, best: 80, attempts: 1, project: false, lessons_done: [], history: [] })),
    modules: [{ track_id: TRACK, best: 86, attempts: 1, passed: true, passed_on: 'Oct 26, 2026', history: [] }]
  });
  await stu.reload(); await stu.waitForSelector('#shell:not([hidden])');
  await stu.click('[data-action="nav"][data-nav="certs"]');
  await stu.waitForFunction(() => /CP-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(document.querySelector('.skill-lens') ? document.querySelector('.skill-lens').textContent : ''));
  const list = await j('/__certs');
  need(list.length === 1, 'expected one issued certificate, got ' + list.length);
  certId = list[0].id;
  need((await stu.textContent('.skill-lens')).includes(certId), 'list does not show the server ID');
  await stu.click('[data-action="open-cert"]');
  await stu.waitForSelector('.cert');
  await stu.waitForFunction(() => !/issuing/.test(document.querySelector('.cert-meta').textContent));
  const meta = await stu.textContent('.cert-meta');
  need(meta.includes('ID ' + certId) && meta.includes('86%'), meta);
  need(await stu.textContent('.cert-name') === 'Sam Rivera', 'name on the certificate');
  need(!(await stu.textContent('#main, main, body')).includes('In the working product'), 'placeholder text is still there');
  need(await stu.$('[data-action="print-cert"]') && await stu.$('[data-action="copy-cert-link"]'), 'print or copy button missing');
  need(stu.errs.length === 0, stu.errs.join('; '));
});

await step('the certificate can be printed on its own, in light colours, without the app around it', async () => {
  await stu.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const vis = await stu.evaluate(() => {
    const v = el => el && getComputedStyle(el).visibility, d = el => el && getComputedStyle(el).display;
    const cert = document.querySelector('.cert');
    return { cert: v(cert), name: v(document.querySelector('.cert-name')), side: v(document.querySelector('#sidebar')), btn: d(document.querySelector('.no-print')),
      bg: getComputedStyle(cert).backgroundColor, ink: getComputedStyle(document.querySelector('.cert-name')).color };
  });
  need(vis.cert === 'visible' && vis.name === 'visible', 'certificate hidden when printing: ' + JSON.stringify(vis));
  need(vis.side === 'hidden' && vis.btn === 'none', 'the app is not hidden when printing: ' + JSON.stringify(vis));
  need(vis.bg === 'rgb(255, 255, 255)' && vis.ink === 'rgb(20, 24, 26)', 'not light colours when printing: ' + JSON.stringify(vis));
  await stu.emulateMedia({ media: 'screen' });
});

await step('the public page checks the ID: valid, with only the holder, title, school, date and score', async () => {
  const p = await fresh();
  await p.goto(BASE + '/verify.html?id=' + certId);
  await p.waitForSelector('.vstate');
  need((await p.textContent('.vstate')) === 'Valid certificate', await p.textContent('#vout'));
  const text = await p.textContent('#vout');
  need(text.includes('Sam Rivera') && text.includes('86%') && text.includes(certId), text);
  need(!/sam@usc|@/.test(text), 'the public page shows an email: ' + text);
  await p.close();
});

await step('typing an ID into the form works, and a wrong ID says it is not genuine', async () => {
  const p = await browser.newPage({ viewport: { width: 380, height: 800 } });
  await p.goto(BASE + '/verify.html');
  await p.fill('#vid', certId.toLowerCase()); await p.click('#vform button');
  await p.waitForSelector('.vstate');
  need(/Valid/.test(await p.textContent('.vstate')), 'lower-case ID not accepted');
  await p.fill('#vid', 'CP-ZZZZ-ZZZZ'); await p.click('#vform button');
  await p.waitForSelector('.vres.bad');
  need(/not genuine/.test(await p.textContent('#vout')), await p.textContent('#vout'));
  need((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'sideways scroll on a phone');
  await p.close();
});

await step('an admin sees the ID on the student\'s page and can revoke it; the public page then says revoked', async () => {
  const a = await fresh();
  await signupConfirmed(a, 'Ada Admin', 'ada@usc.edu');
  await j('/__admin?email=ada@usc.edu');
  await a.click('[data-action="logout"]').catch(() => {});
  await a.goto(BASE + '/'); await a.waitForTimeout(400);
  await login(a, 'ada@usc.edu');
  await a.click('[data-action="nav"][data-nav="a-students"]');
  await a.click('[data-action="a-student"]:has-text("Sam Rivera")');
  await a.waitForSelector('[data-action="cert-revoke"]');
  need((await a.textContent('.grid:has([data-action="cert-revoke"])')).includes(certId), 'admin page does not show the ID');
  await a.click('[data-action="cert-revoke"]');
  await a.waitForSelector('[data-action="cert-restore"]');
  const p = await fresh();
  await p.goto(BASE + '/verify.html?id=' + certId);
  await p.waitForSelector('.vstate');
  need((await p.textContent('.vstate')) === 'Revoked', await p.textContent('#vout'));
  await p.close();
  await stu.reload(); await stu.waitForSelector('#shell:not([hidden])');
  await stu.click('[data-action="nav"][data-nav="certs"]'); await stu.click('[data-action="open-cert"]');
  await stu.waitForSelector('text=This certificate was revoked');
  await a.click('[data-action="cert-restore"]'); await a.waitForSelector('[data-action="cert-revoke"]');
  need(a.errs.length === 0, a.errs.join('; '));
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
