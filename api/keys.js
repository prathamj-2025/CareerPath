/* The answer keys, for admins only. The public site files carry no keys (tools/strip-keys.mjs), so the admin question
   bank and the admin preview fetch them here after sign-in. A student calling this gets a refusal. */
import { authenticate, fail } from "./_auth.js";
import { content } from "./_content.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use GET.");
  const ctx = await authenticate(req, res, { admins: true });
  if (!ctx) return;
  const keys = {};
  content().roles.forEach((r) => r.skills.forEach((s) => {
    keys[r.id + "/" + s.id] = s.assessment.map((q) => ({ qid: q.qid, a: q.a, why: q.why }));
  }));
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ ok: true, keys });
}
