/* The feedback form (public/feedback.html, api/_feedback.js, supabase/migrations/015_feedback.sql): what is saved, what is
   refused, who can read the answers, the links to the form in the app and on the website, the one-time prompt after an
   assessment, and the admin Feedback tab. Start servers with test/start-servers.sh. */
import { chromium } from 'playwright';

const DEMO = process.env.BASE || 'http://localhost:3111';
const REAL = process.env.REAL_URL || 'http://localhost:3115';
const NOKEY = process.env.NOKEY_URL || 'http://localhost:3114';
const FAKE = process.env.FAKE_URL || 'http://localhost:3113';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const jf = async (path) => (await fetch(FAKE + path)).json();
let ipN = 0;
const ip = () => '10.9.' + Math.floor(++ipN / 250) + '.' + (ipN % 250);
async function send(body, opts = {}) {
  const h = { 'content-type': 'application/json', 'x-forwarded-for': opts.ip || ip() };
  if (opts.token) h.authorization = 'Bearer ' + opts.token;
  const r = await fetch((opts.base || REAL) + '/api/config?task=feedback', { method: 'POST', headers: h, body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}
async function person(email, admin) {
  await fetch(FAKE + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'longenough1', data: { name: 'Fee Back' } }) });
  const { hash } = await jf('/__confirm?email=' + email);
  const tok = new URLSearchParams(hash.slice(1)).get('access_token');
  const me = await (await fetch(FAKE + '/auth/v1/user', { headers: { authorization: 'Bearer ' + tok } })).json();
  if (admin) await jf('/__admin?email=' + email);
  return { tok, id: me.id };
}
const YES = { status: 'student', role: 'pm', school: 'USC', program: 'MS EM', prepare: ['youtube', 'google'], struggle: ['order', 'testing'],
  tried: 'yes', used: ['lessons', 'assessments'], ease: 4, device: ['phone'], broken: '', lessons: 5, lessons_better: 'More examples',
  favorite: 'assessments', continue: 'regularly', recommend: 9, change: 'More SQL practice', email: 'Me@Usc.edu' };

await jf('/__reset');
await jf('/__feedbackclear');
await jf('/__feedbackoff?on=0');

await step('an answer is saved with every field checked, and unknown fields are dropped', async () => {
  const r = await send({ ...YES, prepare: ['youtube', 'youtube', 'tiktok'], extra: 'nope', ease: 4, sneaky: { a: 1 } });
  ok(r.status === 201 && r.data.ok, JSON.stringify(r));
  const rows = await jf('/__feedback');
  ok(rows.length === 1, 'rows: ' + rows.length);
  const x = rows[0];
  ok(x.tried === 'yes' && x.ease === 4 && x.lessons === 5 && x.recommend === 9 && x.continue_use === 'regularly' && x.target_role === 'pm' && x.status === 'student', JSON.stringify(x));
  ok(x.email === 'me@usc.edu' && x.source === 'page' && x.user_id == null, 'email, source or user: ' + JSON.stringify(x));
  ok(JSON.stringify(x.answers.prepare) === '["youtube"]', 'choices not cleaned: ' + JSON.stringify(x.answers.prepare));
  ok(!('extra' in x) && !('extra' in x.answers) && !('sneaky' in x.answers) && !('broken' in x.answers), 'unknown or empty fields kept: ' + JSON.stringify(x.answers));
});

await step('required answers and a wrong email are refused with a plain message', async () => {
  let r = await send({ status: 'student', role: 'pm' });
  ok(r.status === 400 && /tried/.test(r.data.error.message), JSON.stringify(r));
  r = await send({ ...YES, lessons: null });
  ok(r.status === 400 && /lessons/.test(r.data.error.message), JSON.stringify(r));
  r = await send({ ...YES, recommend: 11 });
  ok(r.status === 400 && /recommend/.test(r.data.error.message), JSON.stringify(r));
  r = await send({ ...YES, email: 'not-an-email' });
  ok(r.status === 400 && /email/.test(r.data.error.message), JSON.stringify(r));
  ok((await jf('/__feedback')).length === 1, 'a refused answer was saved');
});

await step('"not yet" answers keep only the questions for people who have not tried it', async () => {
  const r = await send({ status: 'working', role: 'unsure', tried: 'no', why_not: 'no_time', would_try: 'A short demo video', ease: 5, recommend: 10, lessons: 1 });
  ok(r.status === 201, JSON.stringify(r));
  const x = (await jf('/__feedback')).pop();
  ok(x.tried === 'no' && x.ease == null && x.recommend == null && x.lessons == null, 'rating kept: ' + JSON.stringify(x));
  ok(x.answers.why_not === 'no_time' && x.answers.would_try === 'A short demo video', JSON.stringify(x.answers));
});

await step('the hidden spam field is accepted quietly and nothing is saved', async () => {
  const before = (await jf('/__feedback')).length;
  const r = await send({ ...YES, website: 'http://spam.example' });
  ok(r.status === 201, JSON.stringify(r));
  ok((await jf('/__feedback')).length === before, 'a bot answer was saved');
});

let stu, boss;
await step('a signed-in student is linked to the answer only when they leave the box ticked', async () => {
  stu = await person('fb-stu@usc.edu'); boss = await person('fb-boss@usc.edu', true);
  await send({ ...YES, source: 'app' }, { token: stu.tok });
  let x = (await jf('/__feedback')).pop();
  ok(x.user_id === stu.id && x.source === 'app', 'not linked: ' + JSON.stringify(x));
  await send({ ...YES, link: false }, { token: stu.tok });
  x = (await jf('/__feedback')).pop();
  ok(x.user_id == null, 'linked although the box was cleared');
  await send({ ...YES }, { token: 'acc-forged' });
  x = (await jf('/__feedback')).pop();
  ok(x.user_id == null, 'a bad token was trusted');
});

await step('one address cannot flood the form', async () => {
  const one = ip();
  let last = null;
  for (let i = 0; i < 21; i++) last = await send({ ...YES }, { ip: one });
  ok(last.status === 429 && /later/.test(last.data.error.message), 'the 21st answer in an hour was taken: ' + JSON.stringify(last));
  ok((await send({ ...YES })).status === 201, 'another address was blocked too');
});

await step('only admins can read the answers', async () => {
  const get = async (tok) => { const r = await fetch(REAL + '/api/config?task=feedback', { headers: tok ? { authorization: 'Bearer ' + tok } : {} }); return { status: r.status, data: await r.json() }; };
  ok((await get()).status === 401, 'signed out could read');
  ok((await get(stu.tok)).status === 403, 'a student could read');
  const a = await get(boss.tok);
  ok(a.status === 200 && Array.isArray(a.data.rows) && a.data.rows.length >= 5, JSON.stringify(a).slice(0, 200));
  ok(new Date(a.data.rows[0].created_at) >= new Date(a.data.rows[a.data.rows.length - 1].created_at), 'not newest first');
});

await step('before 015 is run the form and the admin tab say what to do', async () => {
  await jf('/__feedbackoff?on=1');
  const r = await send({ ...YES });
  ok(r.status === 503 && r.data.error.code === 'needs_015' && /015_feedback/.test(r.data.error.message), JSON.stringify(r));
  const g = await fetch(REAL + '/api/config?task=feedback', { headers: { authorization: 'Bearer ' + boss.tok } });
  ok(g.status === 503 && (await g.json()).error.code === 'needs_015', 'admin read: ' + g.status);
  await jf('/__feedbackoff?on=0');
});

await step('a copy of the site without the server key says it cannot save', async () => {
  const r = await send({ ...YES }, { base: NOKEY });
  ok(r.status === 503 && r.data.error.code === 'not_configured', JSON.stringify(r));
});

const pick = async (p, q, i) => { await (await p.$$(`.fb-q[data-q="${q}"] .fb-chip, .fb-q[data-q="${q}"] .fb-cell`))[i].click(); };
async function fillYes(p) {
  await pick(p, 'status', 0); await pick(p, 'role', 1); await pick(p, 'prepare', 1); await pick(p, 'struggle', 0); await pick(p, 'tried', 0);
  await pick(p, 'used', 2); await pick(p, 'ease', 3); await pick(p, 'lessons', 4); await pick(p, 'favorite', 2); await pick(p, 'continue', 1); await pick(p, 'recommend', 8);
  await p.fill('[name="change"]', 'More SQL, please');
}

await step('the page shows the right questions for "yes" and "not yet", and asks for missing answers', async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(DEMO + '/feedback.html'); await p.waitForTimeout(300);
  ok(!(await p.isVisible('#fb-yes')) && !(await p.isVisible('#fb-no')) && !(await p.isVisible('#fb-send')), 'branches shown before the choice');
  await pick(p, 'tried', 0);
  ok(await p.isVisible('#fb-yes') && !(await p.isVisible('#fb-no')), '"yes" questions missing');
  ok(!(await p.isVisible('#fb-mind')), '"change your mind" shown too early');
  await pick(p, 'continue', 3);
  ok(await p.isVisible('#fb-mind'), '"change your mind" missing after No');
  await pick(p, 'tried', 1);
  ok(!(await p.isVisible('#fb-yes')) && await p.isVisible('#fb-no'), '"not yet" questions missing');
  await pick(p, 'tried', 0);
  await p.click('#fb-send'); await p.waitForTimeout(300);
  const bad = await p.$$eval('.fb-q.bad', els => els.map(e => e.getAttribute('data-q')));
  ok(['status', 'role', 'ease', 'lessons', 'recommend'].every(q => bad.includes(q)), 'missing answers not marked: ' + bad);
  ok(!(await p.isVisible('#fb-done')), 'sent with missing answers');
  ok(!errs.length, errs.join(' | '));
  await c.close();
});

await step('on the live site the page sends the answer, from the app, linked to the signed-in student', async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  await c.addInitScript(t => { try { localStorage.setItem('cp-session', JSON.stringify({ access: t, refresh: 'x', exp: Date.now() + 3600e3 })); } catch (e) {} }, stu.tok);
  const p = await c.newPage();
  await p.goto(REAL + '/feedback.html?from=app'); await p.waitForTimeout(500);
  ok(await p.isVisible('#fb-linked'), 'the "link to my account" box is missing for a signed-in student');
  const before = (await jf('/__feedback')).length;
  await fillYes(p);
  await p.click('#fb-send'); await p.waitForSelector('#fb-done:visible', { timeout: 5000 });
  const rows = await jf('/__feedback');
  const x = rows[rows.length - 1];
  ok(rows.length === before + 1 && x.source === 'app' && x.user_id === stu.id && x.target_role === 'pjm' && x.answers.change === 'More SQL, please', JSON.stringify(x));
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sideways scroll on a phone');
  await c.close();
});

await step('when saving fails the page keeps the answers and shows why', async () => {
  await jf('/__feedbackoff?on=1');
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const p = await c.newPage();
  await p.goto(REAL + '/feedback.html'); await p.waitForTimeout(400);
  await fillYes(p);
  await p.click('#fb-send'); await p.waitForSelector('#fb-error:visible', { timeout: 5000 });
  ok(/not switched on/.test(await p.textContent('#fb-error')), 'error text: ' + await p.textContent('#fb-error'));
  ok(await p.isVisible('#fb-form') && await p.isEnabled('#fb-send'), 'the form was lost');
  await jf('/__feedbackoff?on=0');
  await c.close();
});

await step('the Contact page and the website footer link to the form', async () => {
  const c = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await c.newPage();
  await p.goto(DEMO + '/contact.html'); await p.waitForTimeout(200);
  ok(await p.getAttribute('.card a.btn', 'href') === 'feedback.html', 'no Give feedback button on Contact');
  ok(/Or email/.test(await p.textContent('.card .fb-or')), 'the email line was removed');
  for (const pg of ['about', 'faq', 'help', 'privacy', 'terms']) {
    await p.goto(DEMO + '/' + pg + '.html');
    ok(await p.$('.site-foot a[href="feedback.html"]'), pg + ' footer has no Feedback link');
  }
  await c.close();
});

await step('students reach the form from the top bar on a laptop and from the tab row on a phone; admins do not', async () => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 800 } });
  const p = await c.newPage();
  await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list');
  const a = await p.$('.fb-top:visible');
  ok(a && await a.getAttribute('href') === 'feedback.html?from=app' && await a.getAttribute('target') === '_blank', 'no Feedback link in the top bar');
  const order = await p.evaluate(() => [...document.querySelector('.side-foot').children].map(e => e.textContent.trim().slice(0, 8)));
  ok(order.indexOf('Feedback') > 0 && order.indexOf('Feedback') === order.length - 2, 'Feedback is not between the name and Sign out: ' + order);
  await c.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const q = await m.newPage();
  await q.goto(DEMO + '/'); await q.waitForTimeout(300);
  await q.click('[data-action="login"]'); await q.waitForSelector('.skill-list');
  const tabs = await q.$$eval('.mb-nav > *', els => els.map(e => e.textContent.trim()));
  ok(tabs[tabs.length - 1] === 'Feedback' && tabs[tabs.length - 2] === 'Profile', 'phone tabs: ' + tabs);
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sideways scroll');
  await m.close();
  const d = await browser.newContext({ viewport: { width: 1440, height: 800 } });
  const r = await d.newPage();
  await r.goto(DEMO + '/'); await r.waitForTimeout(300);
  await r.evaluate(() => { document.querySelector('#li-email').value = 'admin@careerpath.com'; document.querySelector('#li-pass').value = 'admin'; });
  await r.click('[data-action="login"]'); await r.waitForTimeout(500);
  ok(!(await r.$('.fb-top:visible')), 'admins got the student Feedback link');
  ok(await r.$('[data-nav="a-feedback"]:visible'), 'admins have no Feedback tab');
  await d.close();
});

await step('after an assessment students are asked once, and "Not now" means not again', async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.click('[data-action="login"]'); await p.waitForSelector('.skill-list');
  const takeOne = async () => {
    await p.evaluate(() => window.scrollTo(0, 0));
    await (await p.$('[data-action="open-track"]:visible')).click(); await p.waitForTimeout(250);
    await (await p.$('.skill-row:visible')).click(); await p.waitForTimeout(250);
    await (await p.$('[data-action="start-exam"]:visible')).click(); await p.waitForTimeout(300);
    for (let i = 0; i < 40; i++) { const o = await p.$('[data-action="exam-answer"]'); if (!o) break; await o.click(); await p.waitForTimeout(120); }
    await p.waitForTimeout(600);
  };
  await takeOne();
  ok(await p.isVisible('.fb-prompt'), 'no feedback prompt after the first assessment');
  ok(await p.getAttribute('.fb-prompt a.fb-go', 'href') === 'feedback.html?from=prompt', 'prompt link');
  await p.click('.fb-prompt [data-action="fb-dismiss"]'); await p.waitForTimeout(200);
  ok(!(await p.isVisible('.fb-prompt')), 'Not now did not close it');
  await (await p.$('[data-action="nav"][data-nav="roadmap"]:visible')).click(); await p.waitForTimeout(250);
  await takeOne();
  ok(!(await p.$('.fb-prompt')), 'asked again after Not now');
  await c.close();
});

await step('the admin Feedback tab shows the averages, every answer, and a CSV download', async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await c.newPage();
  await p.goto(DEMO + '/feedback.html'); await p.waitForTimeout(300);
  await fillYes(p);
  await p.click('#fb-send'); await p.waitForSelector('#fb-done:visible');
  ok(/this browser only/.test(await p.textContent('#fb-done-text')), 'preview copy note missing');
  await p.goto(DEMO + '/'); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#li-email').value = 'admin@careerpath.com'; document.querySelector('#li-pass').value = 'admin'; });
  await p.click('[data-action="login"]'); await p.waitForTimeout(500);
  await (await p.$('[data-nav="a-feedback"]:visible')).click(); await p.waitForTimeout(400);
  const txt = await p.textContent('#view');
  ok(/Lessons helpful\s*5\.0/.test(txt) && /Easy to start\s*4\.0/.test(txt) && /Will keep using\s*100%/.test(txt), 'summary: ' + txt.slice(0, 300));
  ok(/More SQL, please/.test(txt) && /Project Manager/.test(txt), 'the answer is not listed');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="fb-csv"]')]);
  const csv = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8'));
  ok(/^﻿?created_at,source,status,target_role/.test(csv) && /More SQL, please/.test(csv) && /,pjm,/.test(csv), 'csv: ' + csv.slice(0, 200));
  await c.close();
});

await jf('/__feedbackclear');
await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
