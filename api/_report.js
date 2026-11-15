/* Receives a browser error from public/monitor.js and writes one line to the function log, where it shows up in
 * Vercel > project > Logs (search for "client-error"). Nothing is stored. No names, emails or answers are sent: only the
 * error text, the script file and line, a short stack, the page path and the browser name.
 *
 * Abuse limits: POST only, small body, each line is cut to a fixed length, and each address may send a handful per hour
 * (counted across all running copies when 014_rate_limits.sql has been run, in memory otherwise).
 */
import { serviceRest } from "./_auth.js";
import { overBurst, addressKey } from "./_burst.js";

const MAX_BODY = 6000;
const PER_HOUR = 20;

function clip(v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, n); }

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
  let b = req.body;
  if (typeof b === "string") { if (b.length > MAX_BODY) { res.status(413).json({ ok: false }); return; } try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") { res.status(400).json({ ok: false }); return; }
  const ip = clip(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown", 60);
  if (await overBurst(serviceRest(), "report:" + addressKey(ip), PER_HOUR, 3600)) { res.status(429).json({ ok: false }); return; }
  const line = {
    msg: clip(b.msg, 300), src: clip(b.src, 200), line: Number(b.line) || 0, col: Number(b.col) || 0,
    stack: clip(b.stack, 1200), page: clip(b.page, 100), kind: b.kind === "promise" ? "promise" : "error",
    ua: clip(b.ua, 160)
  };
  if (!line.msg) { res.status(400).json({ ok: false }); return; }
  console.error("[client-error] " + JSON.stringify(line));
  res.status(204).end();
}
