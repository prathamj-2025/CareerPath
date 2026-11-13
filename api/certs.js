/* A signed-in student's certificates.
   GET            brings them up to date (issues any that are earned and not yet issued) and returns the list
   GET ?user=ID   admins only: another student's certificates, read-only, nothing is issued
   POST           admins only: { action: "revoke" | "restore", id }  a revoked certificate still verifies, but says it was revoked
   Real accounts only. The ID of each certificate is checked on the public page (verify.html, api/verify.js). */
import { authenticate, body, fail } from "./_auth.js";
import { content } from "./_content.js";
import { ID_PATTERN, sync, shape } from "./_certs.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use GET or POST.");
  const ctx = await authenticate(req, res, req.method === "POST" ? { admins: true } : undefined);
  if (!ctx) return;
  res.setHeader("cache-control", "no-store");
  if (req.method === "POST") {
    const b = body(req), id = typeof b.id === "string" ? b.id.trim().toUpperCase() : "";
    if (!ID_PATTERN.test(id) || (b.action !== "revoke" && b.action !== "restore")) return fail(res, 400, "bad_request", "Send the certificate ID and an action.");
    const r = await ctx.rest("PATCH", "certificates?id=eq." + id, { revoked_at: b.action === "revoke" ? new Date().toISOString() : null }, "return=representation");
    if (!r.ok) return fail(res, 502, "save_failed", "That could not be saved. Try again.");
    if (!r.data || !r.data[0]) return fail(res, 404, "not_found", "No certificate has that ID.");
    return res.status(200).json({ ok: true, cert: shape(r.data[0]) });
  }
  const url = new URL(req.url, "http://x");
  const other = url.searchParams.get("user");

  if (other) {
    if (ctx.profile.role !== "admin") return fail(res, 403, "admins_only", "Only admins can do this.");
    if (!/^[0-9a-f-]{36}$/i.test(other)) return fail(res, 400, "bad_request", "Unknown student.");
    const r = await ctx.rest("GET", "certificates?user_id=eq." + other + "&select=*");
    if (!r.ok) return fail(res, 502, "unavailable", "Certificates could not be loaded. Try again.");
    return res.status(200).json({ ok: true, certs: r.data.map(shape) });
  }
  if (ctx.profile.role !== "student") return res.status(200).json({ ok: true, certs: [] });

  let C;
  try { C = await content(); } catch (e) { return fail(res, 503, "content_unavailable", "The course content could not be loaded. Try again in a moment."); }
  const list = await sync(C, ctx.uid, ctx.profile, ctx.rest);
  if (!list) return fail(res, 502, "unavailable", "Certificates could not be loaded. Try again in a moment.");
  return res.status(200).json({ ok: true, certs: list.map(shape) });
}
