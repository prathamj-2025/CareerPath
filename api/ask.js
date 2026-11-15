/* Server-side proxy for the study assistant.
 *
 * The API key lives here, in a Vercel environment variable, and never reaches the
 * browser. The page posts {rules, messages} and gets back a stream of text.
 *
 * Provider-neutral: it speaks the OpenAI chat-completions format, which OpenAI, Google
 * Gemini and several others all serve. Switching provider is three variables, no code.
 *
 * Environment variables (set these in the hosting settings, never in the repo):
 *   AI_API_KEY    required. The provider's API key.
 *   AI_BASE_URL   optional. Defaults to https://api.openai.com/v1
 *                 Gemini: https://generativelanguage.googleapis.com/v1beta/openai
 *   AI_MODEL      optional. Defaults to gpt-4o-mini
 *   AI_MAX_TOKENS optional. Reply limit, default 2500 (thinking models count their thinking against it).
 *   AI_REASONING_EFFORT optional. For thinking models, for example low. Leave unset for other models.
 *                 Gemini: a model id from aistudio.google.com, e.g. gemini-3.8-flash
 *
 * OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL still work as fallbacks, so an
 * existing deployment keeps running after this change.
 */

import { authenticate } from "./_auth.js";
import { overBurst } from "./_burst.js";

/* Who may ask, and how much. On a deployment with real accounts (SUPABASE_SERVICE_ROLE_KEY set) a question needs a sign-in,
   is refused while the student has an exam open, and is counted against limits per student (hour, day) and for the whole
   site (day) by supabase/migrations/009_ai_usage.sql. Browser-only demo deployments have no accounts and stay open.
     AI_HOURLY_LIMIT  default 40 questions per student per hour
     AI_DAILY_LIMIT   default 200 per student per day
     AI_GLOBAL_DAILY  default 10000 across the site per day
   Until 009 is run, only the per-minute burst limit and the exam lock apply. */
const HOURLY = Number(process.env.AI_HOURLY_LIMIT) || 40;
const DAILY = Number(process.env.AI_DAILY_LIMIT) || 200;
const GLOBAL_DAILY = Number(process.env.AI_GLOBAL_DAILY) || 10000;
const BURST = 10;                  // questions per student per minute, shared across running copies (014_rate_limits.sql)
const EXAM_LOCK_MINUTES = 30;      // an exam attempt left open this long no longer switches the assistant off
async function examOpen({ uid, rest }) {
  const since = new Date(Date.now() - EXAM_LOCK_MINUTES * 60e3).toISOString();
  const r = await rest("GET", "exam_attempts?user_id=eq." + uid + "&submitted_at=is.null&started_at=gte." + encodeURIComponent(since) + "&select=id,kind");
  return r.ok && Array.isArray(r.data) && r.data.some((x) => x.kind === "skill" || x.kind === "module" || x.kind === "challenge");
}

async function overLimit({ uid, rest }) {
  const r = await rest("POST", "rpc/take_ai", { p_user: uid, p_hour: HOURLY, p_day: DAILY, p_global: GLOBAL_DAILY });
  if (!r.ok || !r.data || typeof r.data !== "object") return "";     // 009 not run yet, or the database is busy: do not block the student
  return r.data.ok ? "" : String(r.data.why || "day");
}

const MAX_TOTAL_CHARS = 60000;   // roughly the model's input budget for this use
const MAX_TURNS = 12;
const MAX_TURN_CHARS = 20000;
const MAX_RULES_CHARS = 30000;   // standing instructions plus the student's context

function fail(res, status, code, message) {
  res.status(status).json({ error: { code: code, message: message } });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");

  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return fail(res, 500, "no_key",
      "AI_API_KEY is not set. Add it in Vercel under Settings, Environment Variables, then redeploy.");
  }

  // Real accounts: a signed-in student, not in the middle of an exam, not asking too fast.
  let who = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    who = await authenticate(req, res);
    if (!who) return;
    if (await overBurst(who.rest, "ask:" + who.uid, BURST, 60)) return fail(res, 429, "too_fast", "You are asking very quickly. Wait a moment and try again.");
    if (await examOpen(who)) return fail(res, 403, "exam_locked", "The assistant is off while an exam or the weekly challenge is open. It comes back when you submit or leave.");
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    return fail(res, 400, "bad_request", "Expected a JSON body with a non-empty messages array.");
  }

  // Only the roles the page is allowed to send, trimmed and length-capped.
  const turns = body.messages
    .slice(-MAX_TURNS)
    .map(function (m) {
      const role = m && m.role === "assistant" ? "assistant" : "user";
      return { role: role, content: String((m && m.content) || "").slice(0, MAX_TURN_CHARS) };
    })
    .filter(function (m) { return m.content.trim().length > 0; });

  if (!turns.length) return fail(res, 400, "bad_request", "Every message was empty.");

  const messages = [];
  if (body.rules) {
    messages.push({ role: "system", content: String(body.rules).slice(0, MAX_RULES_CHARS) });
  }
  for (const t of turns) messages.push(t);

  const total = messages.reduce(function (a, m) { return a + m.content.length; }, 0);
  if (total > MAX_TOTAL_CHARS) {
    return fail(res, 413, "too_large", "That is too much text to send at once. Select a smaller piece.");
  }

  if (who) {
    const why = await overLimit(who);
    if (why === "hour") return fail(res, 429, "limit_hour", "You have asked a lot of questions this hour. Try again in a little while.");
    if (why === "day") return fail(res, 429, "limit_day", "You have reached today's limit for the assistant. It resets tomorrow.");
    if (why) return fail(res, 429, "limit_global", "The assistant is very busy today. Please try again tomorrow.");
  }

  const base = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL ||
                "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  let upstream;
  try {
    upstream = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.3,
        // Models that think before answering spend part of this allowance on the thinking, so it is generous.
        max_tokens: Number(process.env.AI_MAX_TOKENS) || 2500,
        // Optional. Set AI_REASONING_EFFORT=low to make a thinking model answer faster and more reliably.
        ...(process.env.AI_REASONING_EFFORT ? { reasoning_effort: process.env.AI_REASONING_EFFORT } : {})
      })
    });
  } catch (e) {
    return fail(res, 502, "upstream_unreachable", "Could not reach the model provider.");
  }

  if (!upstream.ok || !upstream.body) {
    // Read the provider's own error so the page can say what is actually wrong.
    // A 429 on a first request is usually spent quota, not rate limiting, and those
    // need completely different fixes.
    let detail = "";
    let providerCode = "";
    try {
      const raw = await upstream.text();
      detail = raw.slice(0, 400);
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.error) {
          providerCode = parsed.error.code || parsed.error.type || "";
          if (parsed.error.message) detail = String(parsed.error.message).slice(0, 400);
        }
      } catch (e) { /* not JSON: keep the raw text */ }
    } catch (e) { /* no body at all */ }

    let code, message;
    if (providerCode === "insufficient_quota") {
      code = "no_quota";
      message = "The API account has no credit. Note that a ChatGPT or Gemini consumer " +
                "subscription does not include API usage, which is billed separately. " +
                "Add credit on the provider's billing page, then ask again.";
    } else if (upstream.status === 401 || providerCode === "invalid_api_key") {
      code = "bad_key";
      message = "The API key was rejected. Check AI_API_KEY in the hosting settings. " +
                "Provider said: " + detail;
    } else if (providerCode === "model_not_found" || upstream.status === 404) {
      code = "bad_model";
      message = "That model is not available to this API key. Set AI_MODEL to one " +
                "you have access to. Provider said: " + detail;
    } else if (upstream.status === 429) {
      code = "rate_limited";
      message = "The provider is rate limiting these requests. Provider said: " + detail;
    } else {
      code = "upstream_error";
      message = "The provider returned an error. Provider said: " + detail;
    }
    return fail(res, upstream.status, code, message);
  }

  // Re-emit as a simple {delta} event stream so the page does not depend on the
  // provider's wire format.
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("x-accel-buffering", "no");

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const choice = parsed.choices && parsed.choices[0];
          const delta = choice && choice.delta && choice.delta.content;
          if (delta) res.write("data: " + JSON.stringify({ delta: delta }) + "\n\n");
        } catch (e) { /* partial frame: ignore and keep reading */ }
      }
    }
    res.write("data: [DONE]\n\n");
  } catch (e) {
    res.write("data: " + JSON.stringify({ error: "interrupted" }) + "\n\n");
  }
  res.end();
}
