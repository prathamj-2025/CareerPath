/* Live leaderboards in real mode (against test/fakesupabase.mjs, which serves a Realtime WebSocket and
   simulates the database triggers from 006_realtime.sql). Start the servers as for accounts.spec.mjs. */
import { chromium } from 'playwright';
import WebSocket from 'ws';

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
await j('/__reset');

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  page.boardCalls = 0; page.on('request', r => { if (r.url().endsWith('/rpc/leaderboard')) page.boardCalls++; });
  await page.goto(BASE + '/'); await page.waitForSelector('#auth:not([hidden])');
  return page;
}
async function signupConfirmed(page, name, email, school) {
  await page.click('[data-tab="signup"]');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', 'longenough1');
  if (school) await page.selectOption('#su-school', school);
  await page.click('[data-action="signup"]');
  await page.waitForSelector('[data-action="resend-confirm"]');
  const { hash } = await j('/__confirm?email=' + email);
  await page.goto('about:blank'); await page.goto(BASE + '/' + hash);
  await page.waitForSelector('#onb-file');
}
async function pickRole(page, id) {
  await page.click('[data-action="onb-to-fork"]');
  await page.click('[data-action="onb-know"]');
  await page.click('[data-action="pick-role"][data-role="' + id + '"]');
  await page.waitForSelector('[data-action="open-track"], .skill-row');
}
// Change a student's own profile row the way the site does, so the database (here: the fake) fires its trigger.
async function patch(page, body) {
  const { access, user } = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cp-session')); return { access: s.access, user: s.user }; });
  const r = await fetch(FAKE + '/rest/v1/profiles?id=eq.' + user.id, { method: 'PATCH', headers: { authorization: 'Bearer ' + access, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  need(r.status === 204, 'patch failed ' + r.status);
}
const rt = () => j('/__rt');
const board = page => page.textContent('[data-live="board"]');
const pill = page => page.textContent('[data-live="pill"]');

const ann = await fresh(); await signupConfirmed(ann, 'Ann Alvarez', 'ann@usc.edu', 'USC'); await pickRole(ann, 'pm');
const ben = await fresh(); await signupConfirmed(ben, 'Ben Baker', 'ben@usc.edu', 'USC'); await pickRole(ben, 'pm');
await ben.click('[data-nav="leaderboard"]');
await ben.waitForFunction(() => /Live/.test((document.querySelector('[data-live="pill"]') || {}).textContent || ''), null, { timeout: 8000 });

await step('an open leaderboard joins its own private school and roadmap channel and says Live', async () => {
  const s = await rt();
  need((s.by['ben@usc.edu'] || []).includes('board:usc:pm'), 'not subscribed: ' + JSON.stringify(s.by));
  need(s.joins.every(x => x.private), 'a non-private channel was joined');
  need((await pill(ben)).trim() === 'Live', 'pill = ' + await pill(ben));
});

await step('a score change shows on the other student\'s board within a couple of seconds, with no page change', async () => {
  const before = ben.boardCalls, t0 = Date.now();
  await patch(ann, { points: 700 });
  await ben.waitForFunction(() => /Ann A\./.test(document.querySelector('[data-live="board"]').textContent) && /700/.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 5000 });
  const ms = Date.now() - t0;
  need(ms < 3000, 'took ' + ms + ' ms');
  need(ben.boardCalls > before, 'board was not reloaded from the database');
  need(!(await board(ben)).includes('Alvarez'), 'full name shown');
});

await step('a burst of saves becomes a few reloads, and the board ends on the last value', async () => {
  const before = ben.boardCalls;
  for (const p of [710, 720, 730, 740, 750, 760]) await patch(ann, { points: p });
  await ben.waitForFunction(() => /760/.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 5000 });
  await sleep(1200);
  const calls = ben.boardCalls - before;
  need(calls <= 3, 'six saves caused ' + calls + ' reloads');
});

await step('hiding yourself removes you from the other board at once, and showing again brings you back', async () => {
  await patch(ann, { show_on_leaderboard: false });
  await ben.waitForFunction(() => !/Ann A\./.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 5000 });
  await patch(ann, { show_on_leaderboard: true });
  await ben.waitForFunction(() => /Ann A\./.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 5000 });
});

await step('a change at another school or on another roadmap does not wake this board', async () => {
  const cal = await fresh(); await signupConfirmed(cal, 'Cal Cho', 'cal@ucla.edu', 'UCLA'); await pickRole(cal, 'pm');
  await sleep(300);
  const before = ben.boardCalls;
  await patch(cal, { points: 9999 });
  await sleep(1500);
  need(ben.boardCalls === before, 'unrelated change reloaded the board');
  need(!(await board(ben)).includes('Cal'), 'other school shown');
  await cal.context().close();
});

await step('a student cannot listen to another school\'s channel', async () => {
  const dee = await fresh(); await signupConfirmed(dee, 'Dee Diaz', 'dee@nyu.edu', 'NYU'); await pickRole(dee, 'pm');
  const { access } = await dee.evaluate(() => JSON.parse(localStorage.getItem('cp-session')));
  const reply = await new Promise((resolve, reject) => {
    const ws = new WebSocket(FAKE.replace('http', 'ws') + '/realtime/v1/websocket?apikey=k&vsn=1.0.0');
    ws.on('open', () => ws.send(JSON.stringify({ topic: 'realtime:board:usc:pm', event: 'phx_join', ref: '1', payload: { config: { private: true }, access_token: access } })));
    ws.on('message', d => { const m = JSON.parse(String(d)); if (m.event === 'phx_reply') { ws.close(); resolve(m.payload.status); } });
    setTimeout(() => reject(new Error('no reply')), 4000);
  });
  need(reply === 'error', 'NYU student joined a USC channel: ' + reply);
  await dee.context().close();
});

await step('if the connection drops the pill says Refreshing, then it reconnects and shows Live again', async () => {
  await j('/__rtdrop');
  await ben.waitForFunction(() => /Refreshing/.test(document.querySelector('[data-live="pill"]').textContent), null, { timeout: 3000 });
  await ben.waitForFunction(() => /Live/.test(document.querySelector('[data-live="pill"]').textContent), null, { timeout: 15000 });
});

await step('a change made while the connection was down is caught up on reconnect', async () => {
  await j('/__rtdrop');
  await ben.waitForFunction(() => /Refreshing/.test(document.querySelector('[data-live="pill"]').textContent), null, { timeout: 3000 });
  await patch(ann, { points: 880 });
  await ben.waitForFunction(() => /880/.test(document.querySelector('[data-live="board"]').textContent), null, { timeout: 15000 });
});

await step('when Realtime is refused the page says so honestly and recovers when it is back', async () => {
  await j('/__rtrefuse?on=1'); await j('/__rtdrop');
  await ben.waitForFunction(() => /Refreshing/.test(document.querySelector('[data-live="pill"]').textContent), null, { timeout: 4000 });
  await sleep(2500);
  need(/Refreshing/.test(await pill(ben)), 'claimed Live while refused');
  await j('/__rtrefuse?on=0');
  await ben.waitForFunction(() => /Live/.test(document.querySelector('[data-live="pill"]').textContent), null, { timeout: 20000 });
});

await step('leaving the leaderboard pages closes the connection, and coming back reopens it', async () => {
  await ben.click('[data-nav="history"]');
  await sleep(600);
  let s = await rt();
  need(!(s.by['ben@usc.edu'] || []).includes('board:usc:pm'), 'still subscribed after leaving');
  await ben.click('[data-nav="leaderboard"]');
  await ben.waitForFunction(() => /Live/.test((document.querySelector('[data-live="pill"]') || {}).textContent || ''), null, { timeout: 8000 });
  s = await rt();
  need((s.by['ben@usc.edu'] || []).includes('board:usc:pm'), 'did not resubscribe');
});

await step('switching roadmap moves the subscription to the new channel', async () => {
  await ben.click('#sidebar .role-btn'); await ben.click('#sidebar .role-opt[data-role="pjm"]');
  await ben.waitForSelector('.skill-list, .rm-list');
  await ben.click('[data-nav="leaderboard"]');
  await ben.waitForFunction(() => /Live/.test((document.querySelector('[data-live="pill"]') || {}).textContent || ''), null, { timeout: 8000 });
  const s = await rt();
  const mine = s.by['ben@usc.edu'] || [];
  need(mine.includes('board:usc:pjm') && !mine.includes('board:usc:pm'), JSON.stringify(mine));
});

await step('signing out closes the connection', async () => {
  await ben.click('[data-action="logout"]');
  await ben.waitForSelector('#auth:not([hidden])');
  await sleep(500);
  const r = await rt();
  need(!(r.by['ben@usc.edu'] || []).length && !(r.per['ben@usc.edu'] || 0), 'Ben still has an open connection: ' + JSON.stringify(r.per));
});

await step('the footer links sit at the bottom of the screen on a short page, and below the content on a long one', async () => {
  await ann.click('[data-nav="certs"]'); await ann.waitForTimeout(300);
  for (const h of [700, 900, 1100]) {
    await ann.setViewportSize({ width: 1280, height: h }); await ann.waitForTimeout(150);
    const r = await ann.evaluate(() => { const f = document.getElementById('sitefoot').getBoundingClientRect(); return { bottom: Math.round(f.bottom + window.scrollY), page: document.documentElement.scrollHeight, links: document.querySelectorAll('#sitefoot a').length }; });
    need(r.links === 6, 'footer links: ' + r.links);
    need(Math.abs(r.bottom - r.page) <= 2, 'footer not at the bottom at height ' + h + ': ' + JSON.stringify(r));
    need(r.bottom >= h - 2, 'footer floats above the bottom of the screen at height ' + h + ': ' + JSON.stringify(r));
  }
  await ann.click('[data-nav="roadmap"]'); await ann.waitForTimeout(300);
  const long = await ann.evaluate(() => { const f = document.getElementById('sitefoot').getBoundingClientRect(), v = document.getElementById('view').getBoundingClientRect(); return f.top >= v.bottom - 1; });
  need(long, 'footer overlaps the content');
});

for (const p of [ann, ben]) need(!p.errs.length, 'js errors: ' + p.errs.join('|'));
await ann.context().close(); await ben.context().close();
await browser.close();
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
