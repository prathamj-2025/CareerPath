/* Who is calling, and a small PostgREST client for the serverless functions. Files that start with an underscore are
   not routes. The service role key is read from the host's environment and never leaves the server. */
import { supabase } from "./_env.js";

export function fail(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
  return null;
}

/* Returns { env, uid, profile, asUser, asServer, get, rest } or null after sending the error. */
export async function authenticate(req, res, opts) {
  const env = supabase();
  if (!env.secret) {
    return fail(res, 500, "not_configured",
      "Server grading is not set up on this deployment. Add SUPABASE_SERVICE_ROLE_KEY in the hosting settings and redeploy.");
  }
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return fail(res, 401, "signed_out", "Please sign in again.");

  const asUser = { apikey: env.key, authorization: "Bearer " + token };
  const asServer = { apikey: env.secret, "content-type": "application/json" };
  if (env.secret.startsWith("eyJ")) asServer.authorization = "Bearer " + env.secret;   // legacy JWT-style key

  let uid = "";
  try {
    const r = await fetch(env.url + "/auth/v1/user", { headers: asUser });
    if (!r.ok) return fail(res, 401, "signed_out", "Your session expired. Sign in again.");
    uid = (await r.json()).id || "";
  } catch (e) {
    return fail(res, 502, "auth_unreachable", "Could not reach the sign-in service. Try again.");
  }
  if (!uid) return fail(res, 401, "signed_out", "Please sign in again.");

  // Read as the server so the answer never depends on what row-level rules let the student see.
  const rest = async (method, path, body, prefer) => {
    const h = Object.assign({}, asServer);
    if (prefer) h.prefer = prefer;
    const r = await fetch(env.url + "/rest/v1/" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { ok: r.ok, status: r.status, data };
  };
  const got = await rest("GET", "profiles?id=eq." + uid + "&select=id,role,roadmap_id,points");
  const profile = got.ok && Array.isArray(got.data) ? got.data[0] : null;
  if (!profile) return fail(res, 403, "no_profile", "Your profile is not ready yet. Try again in a moment.");
  if (opts && opts.students && profile.role !== "student") return fail(res, 403, "students_only", "Only students can do this.");
  if (opts && opts.admins && profile.role !== "admin") return fail(res, 403, "admins_only", "Only admins can do this.");
  return { env, uid, profile, rest };
}

export function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === "object" ? b : {};
}

/* The date format the page already uses for history rows, e.g. "Oct 26, 2026". */
export function today() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
