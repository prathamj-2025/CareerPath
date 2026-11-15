/* Keeps the free Supabase project awake.
 *
 * Supabase pauses a free project after about a week with no database activity. Vercel calls this route once a day
 * (the "crons" entry in vercel.json), and it reads one row so the project counts as active. It returns only
 * { ok, status }, never any data.
 *
 * Optional: set CRON_SECRET in Vercel (any long random string). Vercel then sends it as a bearer token on its own
 * cron calls, and this route refuses everyone else. Without it the route still works; it is read-only and tiny.
 */
import { supabase } from "./_env.js";
import { serviceRest } from "./_auth.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const auth = String(req.headers.authorization || "");
    if (auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "not_allowed" }); return; }
  }
  try {
    let status = 0;
    const rest = serviceRest();
    if (rest) {
      status = (await rest("GET", "profiles?select=id&limit=1")).status;
    } else {
      const env = supabase();
      const r = await fetch(env.url + "/rest/v1/profiles?select=id&limit=1", { headers: { apikey: env.key } });
      status = r.status;
    }
    const ok = status >= 200 && status < 300;
    res.status(ok ? 200 : 502).json({ ok, status });
  } catch (e) {
    res.status(502).json({ ok: false, status: 0 });
  }
}
