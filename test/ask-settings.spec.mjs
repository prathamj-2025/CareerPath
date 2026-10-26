/* api/ask.js request settings: generous reply limit, optional thinking control. No servers needed. */
import handler from '../api/ask.js';

let failed = 0;
const step = async (label, fn) => { try { await fn(); console.log('ok   ' + label); } catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); } };
const need = (c, m) => { if (!c) throw new Error(m); };

async function sent(env) {
  const keep = { ...process.env };
  Object.assign(process.env, { AI_API_KEY: 'k', AI_BASE_URL: 'http://provider.test', AI_MODEL: 'm' }, env);
  for (const k of ['AI_MAX_TOKENS', 'AI_REASONING_EFFORT']) if (!(k in env)) delete process.env[k];
  const realFetch = globalThis.fetch; let body = null;
  globalThis.fetch = async (u, o) => { body = JSON.parse(o.body); return new Response('data: [DONE]\n\n', { status: 200 }); };
  const res = { setHeader() {}, status() { return this; }, json() {}, write() {}, end() {} };
  try { await handler({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] } }, res); }
  finally { globalThis.fetch = realFetch; for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); }
  return body;
}

await step('the reply limit leaves room for a thinking model', async () => {
  const b = await sent({});
  need(b.max_tokens >= 2000, 'max_tokens is ' + b.max_tokens);
  need(!('reasoning_effort' in b), 'reasoning_effort sent when not set');
});
await step('AI_MAX_TOKENS and AI_REASONING_EFFORT are passed on when set', async () => {
  const b = await sent({ AI_MAX_TOKENS: '3000', AI_REASONING_EFFORT: 'low' });
  need(b.max_tokens === 3000 && b.reasoning_effort === 'low', JSON.stringify(b));
});

console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
