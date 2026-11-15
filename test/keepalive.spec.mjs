/* The keep-alive route: reads one row so the free database never pauses, returns no data, honours an optional cron secret,
   and is scheduled once a day in vercel.json. Start servers with test/start-servers.sh. */
import { readFileSync, readdirSync } from 'node:fs';

const KEY = process.env.REAL_URL || 'http://localhost:3115';          // service key set
const NOKEY = process.env.NOKEY_URL || 'http://localhost:3114';       // no service key
const CRON = process.env.CRON_URL || 'http://localhost:3118';         // CRON_SECRET set
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const get = async (base, headers) => { const r = await fetch(base + '/api/config?task=keepalive', { headers }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };

await step('with the service key it reads the database and answers ok, with nothing else in the reply', async () => {
  const r = await get(KEY);
  need(r.s === 200 && r.d.ok === true && r.d.status === 200, JSON.stringify(r));
  need(Object.keys(r.d).sort().join() === 'ok,status', 'reply carries extra fields: ' + Object.keys(r.d));
});
await step('without the service key it still reaches the database with the public key', async () => {
  const r = await get(NOKEY);
  need(r.d && typeof r.d.ok === 'boolean' && r.d.status > 0, JSON.stringify(r));
});
await step('with a cron secret set, a caller without it is refused', async () => {
  const a = await get(CRON); need(a.s === 401 && a.d.ok === false, 'no header: ' + JSON.stringify(a));
  const b = await get(CRON, { authorization: 'Bearer wrong' }); need(b.s === 401, 'wrong secret: ' + b.s);
});
await step('with the right cron secret it runs', async () => {
  const r = await get(CRON, { authorization: 'Bearer cron-secret-test' });
  need(r.s === 200 && r.d.ok === true, JSON.stringify(r));
});
await step('vercel.json schedules it once a day', async () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const c = (v.crons || []).find(x => x.path === '/api/config?task=keepalive');
  need(c, 'no cron entry');
  need(/^\d+ \d+ \* \* \*$/.test(c.schedule), 'not a once-a-day schedule: ' + c.schedule);
});
await step('the api folder stays within the 12 functions Vercel allows on the free plan', async () => {
  const n = readdirSync(new URL('../api/', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  need(n.length <= 12, n.length + ' functions: ' + n.join(', '));
});
await step('the database being down is reported, not hidden', async () => {
  // point a throwaway copy of the handler at a dead address
  process.env.SUPABASE_URL = 'http://localhost:1'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_x';
  const { default: h } = await import('../api/_keepalive.js?dead');
  let code = 0, body = null;
  await h({ headers: {} }, { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; } });
  need(code === 502 && body.ok === false, code + ' ' + JSON.stringify(body));
});
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
