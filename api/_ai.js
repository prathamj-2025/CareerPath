/* One non-streaming call to the same model provider api/ask.js uses (AI_API_KEY, AI_BASE_URL, AI_MODEL).
   Returns the reply text, or "" when the provider is not set up, is slow or fails, so callers can fall back. */
export async function completeText(rules, messages, timeoutMs) {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return "";
  const base = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "system", content: rules }].concat(messages),
        stream: false,
        temperature: 0.3,
        max_tokens: Number(process.env.AI_MAX_TOKENS) || 2500,
        ...(process.env.AI_REASONING_EFFORT ? { reasoning_effort: process.env.AI_REASONING_EFFORT } : {})
      })
    });
    if (!r.ok) return "";
    const j = await r.json();
    const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return typeof t === "string" ? t.trim() : "";
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
