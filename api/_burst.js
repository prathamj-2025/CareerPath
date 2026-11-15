/* A request limit that holds across every running copy of the site.

   Each running copy counts requests itself, which is fast and costs nothing, and refuses a caller as soon as its own count is
   over. Then, when the database is reachable, the request is also counted in one shared table (take_burst in
   supabase/migrations/014_rate_limits.sql), so a caller who is sent to different copies is still stopped at the limit.
   If the database function is missing (014 not run) or the database is busy, only the per-copy count applies, as before.

     overBurst(rest, key, max, windowSeconds)   true when the caller is over the limit
     addressKey(ip)                             a one-way hash of an address, so no address is stored */
import { createHash } from "node:crypto";

const mem = new Map();   // key -> timestamps

function local(key, max, windowMs) {
  const now = Date.now(), list = (mem.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); mem.set(key, list);
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some((t) => now - t < windowMs)) mem.delete(k);
  return list.length > max;
}

export function addressKey(ip) {
  return createHash("sha256").update("cp-rate|" + String(ip || "")).digest("hex").slice(0, 32);
}

export async function overBurst(rest, key, max, windowSeconds) {
  if (local(key, max, windowSeconds * 1000)) return true;
  if (!rest) return false;
  try {
    const r = await rest("POST", "rpc/take_burst", { p_key: key, p_window: windowSeconds, p_max: max });
    if (r.ok && r.data && typeof r.data === "object") return r.data.ok === false;
  } catch (e) { /* the database is busy: the per-copy count has already been applied */ }
  return false;
}
