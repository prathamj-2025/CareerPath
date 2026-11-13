/* Public check of a certificate ID. No sign-in. Anyone with an ID can see who it was issued to and for what, and nothing else:
   no email, no student id, no progress. Unknown IDs and badly formed ones get the same answer, so the page cannot be used
   to probe for valid IDs, and a caller is limited to thirty checks a minute per address and server instance. */
import { serviceRest } from "./_auth.js";
import { ID_PATTERN } from "./_certs.js";

const hits = new Map();
function tooFast(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 60e3);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 30;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") return res.status(405).json({ error: { code: "method_not_allowed", message: "Use GET." } });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (tooFast(ip)) return res.status(429).json({ error: { code: "too_fast", message: "Too many checks. Wait a minute and try again." } });
  const rest = serviceRest();
  if (!rest) return res.status(503).json({ error: { code: "not_configured", message: "Verification is not set up on this site yet." } });

  const url = new URL(req.url, "http://x");
  const id = String(url.searchParams.get("id") || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!ID_PATTERN.test(id)) return res.status(200).json({ ok: true, found: false });
  const r = await rest("GET", "certificates?id=eq." + id + "&select=id,title,holder,school,roadmap_name,stars,score,issued_at,revoked_at,kind");
  if (!r.ok) return res.status(503).json({ error: { code: "unavailable", message: "The check could not be completed. Try again in a moment." } });
  const c = Array.isArray(r.data) ? r.data[0] : null;
  if (!c) return res.status(200).json({ ok: true, found: false });
  return res.status(200).json({ ok: true, found: true, id: c.id, status: c.revoked_at ? "revoked" : "valid", kind: c.kind, title: c.title,
    holder: c.holder, school: c.school, roadmap: c.roadmap_name, stars: c.stars, score: c.score, issued: c.issued_at });
}
