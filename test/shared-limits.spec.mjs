/* The request limits are counted across running copies of the site (api/_burst.js, migration 014): two copies of the
   module, which stand for two running servers, share one count in the database. Start servers with test/start-servers.sh. */
process.env.SUPABASE_URL = process.env.FAKE_URL || 'http://localhost:3113';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
const FAKE = process.env.SUPABASE_URL;
const BASE = process.env.REAL_URL || 'http://localhost:3115';
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const jf = async (path) => (await fetch(FAKE + path)).json();
await jf('/__reset');

const { serviceRest } = await import('../api/_auth.js');
const A = await import('../api/_burst.js?copy=a');     // two copies of the module: two servers, each with its own memory
const B = await import('../api/_burst.js?copy=b');
const rest = serviceRest();
need(rest, 'no service rest: check SUPABASE_URL');

await step('a caller split across two servers is stopped at the shared limit, not at twice the limit', async () => {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(await (i % 2 ? A : B).overBurst(rest, 'ask:user-1', 10, 60));
  need(out.slice(0, 10).every(x => x === false), 'refused too early: ' + out.join());
  need(out[10] === true && out[11] === true, 'not refused after ten, spread over two servers: ' + out.join());
});

await step('another caller is not affected', async () => {
  need((await A.overBurst(rest, 'ask:user-2', 10, 60)) === false, 'a different key was refused');
});

await step('a server whose own count is over refuses without asking the database', async () => {
  await jf('/__reset');
  for (let i = 0; i < 10; i++) await A.overBurst(rest, 'solo:1', 10, 60);
  const before = JSON.stringify(await jf('/__bursts'));
  need((await A.overBurst(rest, 'solo:1', 10, 60)) === true, 'not refused');
  need(JSON.stringify(await jf('/__bursts')) === before, 'the database was written to for a caller already over');
});

await step('without migration 014 each server still limits on its own count, and nothing breaks', async () => {
  await jf('/__reset'); await jf('/__burstoff?on=1');
  try {
    const out = [];
    for (let i = 0; i < 12; i++) out.push(await A.overBurst(rest, 'nodb:1', 10, 60));
    need(out.slice(0, 10).every(x => x === false) && out[10] === true, out.join());
    need((await B.overBurst(rest, 'nodb:1', 10, 60)) === false, 'the other server should have its own count without 014');
    need((await A.overBurst(null, 'nokey:1', 3, 60)) === false, 'no database key must not throw');
  } finally { await jf('/__burstoff?on=0'); }
});

await step('addresses are stored only as a one-way hash', async () => {
  const k = A.addressKey('203.0.113.9');
  need(/^[0-9a-f]{32}$/.test(k) && !k.includes('203') && k === A.addressKey('203.0.113.9') && k !== A.addressKey('203.0.113.10'), k);
});

await step('the public certificate check is limited per address across servers, and the key holds no address', async () => {
  await jf('/__reset');
  let last = 0;
  for (let i = 0; i < 40; i++) { const r = await fetch(BASE + '/api/verify?id=CP-AAAA-BBBB', { headers: { 'x-forwarded-for': '203.0.113.77' } }); last = r.status; if (last === 429) break; }
  need(last === 429, 'no limit on public checks');
  const keys = Object.keys(await jf('/__bursts'));
  need(keys.length > 0 && keys.every(k => k.startsWith('verify:') && !k.includes('203.0.113')), 'keys: ' + keys.join());
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
