/* One new student, start to finish, the way a real person would use CareerPath: on a phone they create an account (school
   and major typed in under Other), confirm their email, paste a resume, answer the five questions, follow the recommendation,
   read every lesson of a skill, try the practice with a hint, ask the study assistant, pass the assessment, see their points
   on their school's leaderboard, send feedback from the prompt, edit their profile, sign out and back in. Then on a laptop
   everything they did is still there. Real-account mode with server grading against the fake database (3115, 3113). */
import { chromium } from 'playwright';
import fs from 'node:fs';
import vm from 'node:vm';
import { RESUMES } from './fixtures/resumes.mjs';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0, stop = false;
const step = async (label, fn) => {
  if (stop) { console.log('skip ' + label); return; }
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; stop = true; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const j = async (p) => (await fetch(FAKE + p)).json();
const need = (c, m) => { if (!c) throw new Error(m); };

// The answer key, read from the course files the way the server reads them (never from the page).
const sandbox = { window: {} }; vm.createContext(sandbox);
for (const f of ['data.js', 'lessons-pm.js']) vm.runInContext(fs.readFileSync(new URL('../content/' + f, import.meta.url), 'utf8'), sandbox);
const KEY = new Map();
const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
  if (typeof o.q === 'string' && Array.isArray(o.opts) && Number.isInteger(o.a)) KEY.set(o.q, o.opts[o.a]); Object.values(o).forEach(walk); };
walk(sandbox.window);

const tag = Date.now() % 100000;
const EMAIL = 'maya.journey' + tag + '@pcc.edu', PASS = 'longenough1', SCHOOL = 'Pasadena City College ' + tag;
const resume = Object.values(RESUMES)[0];
const resumeText = typeof resume === 'string' ? resume : (resume.text || JSON.stringify(resume));

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
let p = await phone.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const tap = async (sel) => { await p.locator(sel).locator('visible=true').first().click({ timeout: 15000 }); await p.waitForTimeout(350); };
let firstSkill = '', pointsAfter = 0;

await step('a new student creates an account on a phone, typing a school and a major that are not in the lists', async () => {
  await p.goto(BASE + '/'); await p.waitForSelector('#auth:not([hidden])');
  await tap('[data-tab="signup"]');
  await p.fill('#su-name', 'Maya Journey'); await p.fill('#su-email', EMAIL); await p.fill('#su-pass', PASS);
  await p.selectOption('#su-school', 'Other'); await p.fill('#su-school-other', SCHOOL);
  await p.selectOption('#su-major', 'Other'); await p.fill('#su-major-other', 'Public Policy');
  await tap('[data-action="signup"]');
  await p.waitForSelector('[data-action="resend-confirm"], #onb-file', { timeout: 15000 });
});

await step('they confirm their email and land on the resume step', async () => {
  if (!(await p.$('#onb-file'))) {
    const { hash } = await j('/__confirm?email=' + EMAIL);
    await p.goto('about:blank'); await p.goto(BASE + '/' + hash);
  }
  await p.waitForSelector('#onb-file', { timeout: 15000 });
  const prof = await j('/__profile?email=' + EMAIL);
  need(prof.school === SCHOOL && prof.major === 'Public Policy', 'saved: ' + JSON.stringify([prof.school, prof.major]));
});

await step('they paste their resume and see what was read from it', async () => {
  await tap('[data-action="onb-paste"]');
  await p.fill('#onb-text', resumeText);
  await tap('[data-action="onb-paste-save"]');
  await p.waitForSelector('.cover-row', { timeout: 20000 });
  need((await p.$$('.cover-row')).length === 3, 'not one row per roadmap');
});

await step('they ask for help, answer the five questions, and get a match score for every roadmap', async () => {
  const cont = await p.$('[data-action="onb-to-fork"]:visible, [data-action="onb-continue"]:visible');
  if (cont) { await cont.click(); await p.waitForTimeout(400); }
  await tap('[data-action="onb-guided"]');
  for (let i = 0; i < 5; i++) {
    await p.waitForSelector('.q-card .opt', { timeout: 10000 });
    const idx = await p.evaluate((n) => Math.max(0, window.CP_GUIDED[n].opts.findIndex((o) => o.w.pm >= 3)), i);
    await p.$$eval('.q-card .opt', (els, k) => els[k].click(), idx);
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(800);
  const rec = p.locator('[data-action="onb-to-recommend"]:visible');
  if (await rec.count()) await tap('[data-action="onb-to-recommend"]');
  await p.waitForSelector('[data-action="onb-pick"][data-role="pm"]', { timeout: 30000 });
  const t = await p.textContent('#view');
  need((t.match(/\d+%/g) || []).length >= 3, 'no match scores: ' + t.slice(0, 200));
});

await step('they follow the recommendation to the Product Manager roadmap', async () => {
  await tap('[data-action="onb-pick"][data-role="pm"]');
  await p.waitForSelector('[data-action="open-track"]', { timeout: 15000 });
  need(/Product Manager/i.test(await p.textContent('#mobilebar')), 'role pill does not say Product Manager');
});

await step('they open the first module and skill, and read every lesson with Next', async () => {
  await tap('[data-action="open-track"]');
  await tap('.skill-row');
  firstSkill = (await p.textContent('#view h1')).trim();
  await tap('[data-action="start-learn"]');
  for (let i = 0; i < 40; i++) {
    const next = await p.$('button[data-action="lesson"]:visible:has-text("Next lesson")');
    if (!next) break;
    await next.click(); await p.waitForTimeout(250);
  }
  need(await p.$('[data-action="start-exam"]:visible'), 'never reached the last lesson');
  need(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the lesson scrolls sideways on a phone');
});

await step('they try the practice scenario and take a hint', async () => {
  const pick = await p.$('[data-action="scn-pick"]');
  if (pick) {
    await pick.click(); await p.waitForTimeout(300);
    const ta = await p.$('textarea[data-practice]'); await ta.fill('I would talk to five users first, define the riskiest assumption and test it cheaply before building anything.');
    await (await p.$('[data-action="scn-hint"]')).click();
    await p.waitForTimeout(1500);
    need(/Hint 1/.test(await p.textContent('#view')), 'no hint appeared');
  }
});

await step('they ask the study assistant about the lesson and get an answer', async () => {
  await tap('#tutor-launch');
  await p.fill('#tutor-input', 'What does this lesson say a product manager does?');
  await tap('#tutor-send');
  await p.waitForFunction(() => { const m = document.querySelectorAll('#tutor-log .t-msg.bot'); return m.length && !/Thinking/.test(m[m.length - 1].textContent) && m[m.length - 1].textContent.trim().length > 5; }, null, { timeout: 30000 });
  await tap('#tutor-close');
});

await step('they pass the assessment, and the server awards stars and points', async () => {
  await tap('[data-action="start-exam"]');
  for (let i = 0; i < 40; i++) {
    const stem = await p.$('.q-stem'); if (!stem) break;
    const q = (await stem.textContent()).trim(); const right = KEY.get(q);
    need(right, 'no key for: ' + q);
    const opts = await p.$$('[data-action="exam-answer"]');
    let hit = null; for (const o of opts) if ((await o.textContent()).includes(right)) hit = o;
    need(hit, 'right option not shown for: ' + q);
    await hit.click(); await p.waitForTimeout(250);
  }
  await p.waitForSelector('.result-head', { timeout: 20000 });
  const head = await p.textContent('.result-head');
  need(/100%/.test(head) && /leaderboard points were added/.test(head), 'result: ' + head);
  pointsAfter = Number(((await p.textContent('#sidebar .who-sub')).match(/(\d+)\s*pts/) || [])[1] || 0);
  need(pointsAfter > 0, 'no points in the top bar');
});

await step('their school leaderboard shows them with those points', async () => {
  await tap('[data-nav="leaderboard"]');
  try { await p.waitForSelector('#view tr.lb-you', { timeout: 15000 }); }
  catch (e) { throw new Error('not on the board: ' + (await p.textContent('#view')).slice(0, 500)); }
  const row = await p.$eval('#view tr.lb-you', (r) => r.textContent);
  need(row.includes(String(pointsAfter)), 'board row: ' + row);
});

await step('they send feedback from the prompt, and it is saved and linked to their account', async () => {
  const before = (await j('/__feedback')).length;
  await tap('[data-nav="history"]');
  await p.goto(BASE + '/feedback.html?from=prompt'); await p.waitForTimeout(500);
  const pick = async (q, i) => { await (await p.$$(`.fb-q[data-q="${q}"] .fb-chip, .fb-q[data-q="${q}"] .fb-cell`))[i].click(); };
  await pick('status', 0); await pick('role', 0); await pick('prepare', 1); await pick('struggle', 0); await pick('heard', 1); await pick('tried', 0);
  await pick('used', 2); await pick('ease', 4); await pick('lessons', 4); await pick('continue', 0); await pick('pmf', 0); await pick('recommend', 10);
  await p.fill('[name="add_or_change"]', 'More mock interviews');
  await tap('#fb-send');
  await p.waitForSelector('#fb-done:visible', { timeout: 10000 });
  const rows = await j('/__feedback');
  const x = rows[rows.length - 1];
  need(rows.length === before + 1 && x.source === 'prompt' && x.user_id && x.pmf === 'Very disappointed' && x.add_or_change === 'More mock interviews', JSON.stringify(x).slice(0, 300));
  await p.goto(BASE + '/'); await p.waitForSelector('#shell:not([hidden])');
});

await step('they change their major on Profile and it sticks', async () => {
  await tap('[data-nav="profile"]');
  need(await p.inputValue('#pf-school') === 'Other' && await p.inputValue('#pf-school-other') === SCHOOL, 'school not shown as typed');
  await p.fill('#pf-major-other', 'Marketing');
  await tap('[data-action="profile-save"]');
  await p.waitForTimeout(1500);
  need((await j('/__profile?email=' + EMAIL)).major === 'Marketing', 'major not saved');
});

await step('they sign out, sign back in, and nothing is lost', async () => {
  await tap('#mobilebar [data-action="logout"]');
  await p.waitForSelector('#auth:not([hidden])');
  await tap('[data-tab="signup"]');
  const left = await p.evaluate(() => ['su-name', 'su-email', 'su-pass', 'su-major-other', 'su-school-other']
    .map((id) => (document.getElementById(id) || {}).value || '').concat([document.getElementById('su-major').value]).join('|'));
  need(left === '|||||' + (await p.$eval('#su-major option', (o) => o.value)), 'the sign-up form still shows the last student: ' + left);
  await tap('[data-tab="login"]');
  need(await p.inputValue('#li-email') === '' && await p.inputValue('#li-pass') === '', 'the sign-in form kept the last details');
  await p.fill('#li-email', EMAIL); await p.fill('#li-pass', PASS);
  await tap('[data-action="login"]');
  await p.waitForSelector('#shell:not([hidden])', { timeout: 15000 });
  await p.waitForTimeout(1500);
  need(new RegExp('^' + pointsAfter + '\\s*pts').test((await p.textContent('#sidebar .who-sub')).trim()), 'points lost after signing in again');
  await tap('[data-nav="history"]');
  need((await p.textContent('#view tbody tr')).includes(firstSkill), 'the newest attempt is not first in history');
  need(!errs.length, 'page errors on the phone: ' + errs.join(' | '));
});
await phone.close();

await step('later, on a laptop, the same account shows the same progress', async () => {
  const lap = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await lap.newPage(); const e2 = []; q.on('pageerror', (e) => e2.push(e.message));
  await q.goto(BASE + '/'); await q.waitForSelector('#auth:not([hidden])');
  await q.click('[data-tab="login"]');
  await q.fill('#li-email', EMAIL); await q.fill('#li-pass', PASS);
  await q.click('[data-action="login"]');
  await q.waitForSelector('#shell:not([hidden])', { timeout: 15000 }); await q.waitForTimeout(1500);
  need(new RegExp(pointsAfter + '\\s*pts').test(await q.textContent('#sidebar')), 'points differ on the laptop');
  need(/1\/28/.test(await q.textContent('#sidebar')) || /job-ready/i.test(await q.textContent('#view')), 'progress not shown');
  need(!e2.length, 'page errors on the laptop: ' + e2.join(' | '));
  await lap.close();
});

await step('on a shared computer, the next student gets a blank sign-up form after the last one signs out', async () => {
  // Exactly what happened on the live site, where "Confirm email" is off: sign up, signed straight in, sign out, Create account.
  stop = false;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await ctx.newPage();
  await q.goto(BASE + '/'); await q.waitForSelector('#auth:not([hidden])');
  await q.click('[data-tab="signup"]');
  await q.fill('#su-name', 'Rohan Shared'); await q.fill('#su-email', 'noconfirm.rohan' + tag + '@pcc.edu'); await q.fill('#su-pass', 'longenough1');
  await q.selectOption('#su-major', 'Other'); await q.fill('#su-major-other', 'Public Policy');
  await q.click('[data-action="signup"]');
  await q.waitForSelector('#onb-file', { timeout: 15000 });
  await q.click('#sidebar [data-action="logout"]');
  await q.waitForSelector('#auth:not([hidden])');
  await q.click('[data-tab="signup"]');
  const left = await q.evaluate(() => ['su-name', 'su-email', 'su-pass'].map((id) => document.getElementById(id).value).join('|') +
    '|' + document.getElementById('su-major').value + '|' + ((document.getElementById('su-major-other') || {}).value || ''));
  need(!/Rohan|noconfirm|Public Policy|Other/.test(left), 'the sign-up form still shows the last student: ' + left);
  await q.click('[data-tab="login"]');
  need(await q.inputValue('#li-email') === '', 'the sign-in form kept the last email');
  await ctx.close();
});

await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
