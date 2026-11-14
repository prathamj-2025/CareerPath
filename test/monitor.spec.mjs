/* Error reporting: the route logs one safe line per report and refuses abuse; the page reports uncaught errors without
   personal data, at most five distinct ones; analytics loads only when switched on. Start servers with test/start-servers.sh. */
import { chromium } from 'playwright';

const BASE = process.env.REAL_URL || 'http://localhost:3115';
const DEMO = process.env.DEMO_URL || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const post = (body, ip, raw) => fetch(BASE + '/api/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '9.9.9.9' }, body: raw || JSON.stringify(body) });
const stamp = Date.now().toString(36);

await step('a valid report is accepted with no content back', async () => {
  const r = await post({ msg: 'x is not a function', src: 'https://site/app.js', line: 10, col: 4, stack: 'at a', page: '/', ua: 'Test', kind: 'error' }, '1.1.1.1');
  need(r.status === 204, 'status ' + r.status);
});
await step('only POST is allowed, and junk or empty reports are refused', async () => {
  need((await fetch(BASE + '/api/report')).status === 405, 'GET allowed');
  need((await post(null, '2.2.2.2', 'not json')).status === 400, 'junk accepted');
  need((await post({ msg: '' }, '2.2.2.2')).status === 400, 'empty msg accepted');
  need((await post({ msg: 'x'.repeat(10), pad: 'y'.repeat(7000) }, '2.2.2.2', JSON.stringify({ msg: 'x', pad: 'y'.repeat(7000) }))).status === 413, 'huge body accepted');
});
await step('one address can send only a handful per hour', async () => {
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await post({ msg: 'spam ' + stamp + i }, '3.3.3.3')).status;
  need(last === 429, 'never limited, last ' + last);
  need((await post({ msg: 'fine' }, '4.4.4.4')).status === 204, 'another address was blocked');
});

async function pageWith(url, cfg) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.reports = []; page.vaRequests = 0;
  await page.route('**/api/report', async r => { page.reports.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 204, body: '' }); });
  await page.route('**/_vercel/insights/script.js', r => { page.vaRequests++; return r.fulfill({ contentType: 'text/javascript', body: '/* counter */' }); });
  if (cfg) await page.route('**/api/config', r => r.fulfill({ json: cfg }));
  await page.goto(url); await page.waitForTimeout(500);
  return page;
}
await step('an uncaught error and a rejected promise are reported, with no personal data', async () => {
  const page = await pageWith(DEMO + '/?secret=abc#token=xyz');
  await page.evaluate(() => { setTimeout(() => { throw new Error('boom ' + 'one'); }, 0); });
  await page.evaluate(() => { Promise.reject(new Error('boom two')); });
  await page.waitForTimeout(600);
  const msgs = page.reports.map(r => r.msg);
  need(msgs.some(m => /boom one$/.test(m)) && msgs.includes('boom two'), 'reports: ' + JSON.stringify(msgs));
  const all = JSON.stringify(page.reports);
  need(!/secret=abc|token=xyz/.test(all), 'query or hash was sent');
  need(page.reports.every(r => r.page === '/'), 'page path wrong');
  await page.context().close();
});
await step('the same error is sent once, and no more than five distinct ones', async () => {
  const page = await pageWith(DEMO + '/');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('same'); }, 0); });
  await page.evaluate(() => { for (let i = 0; i < 10; i++) setTimeout(() => { throw new Error('different ' + i); }, 0); });
  await page.waitForTimeout(800);
  need(page.reports.filter(r => /same$/.test(r.msg)).length === 1, 'duplicates sent');
  need(page.reports.length === 5, 'sent ' + page.reports.length);
  await page.context().close();
});
await step('a broken image is not reported as a code error', async () => {
  const page = await pageWith(DEMO + '/');
  await page.evaluate(() => { const i = document.createElement('img'); i.src = '/nope.png'; document.body.appendChild(i); });
  await page.waitForTimeout(500);
  need(page.reports.length === 0, 'reported ' + JSON.stringify(page.reports));
  await page.context().close();
});
await step('the page counter loads only when analytics is switched on', async () => {
  const off = await pageWith(BASE + '/', { supabaseUrl: null, supabaseKey: null, analytics: false });
  need(off.vaRequests === 0, 'loaded while off');
  await off.context().close();
  const on = await pageWith(BASE + '/', { supabaseUrl: null, supabaseKey: null, analytics: true });
  need(on.vaRequests === 1, 'not loaded when on: ' + on.vaRequests);
  await on.context().close();
});
console.log(failed ? failed + ' failed' : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
