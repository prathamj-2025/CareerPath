/* Public, non-secret settings the page needs at start-up.
 *
 * Every value here is designed to be public: the Supabase project URL and publishable key sit in
 * every page that talks to Supabase, and are protected by row level security in the database,
 * not by being hidden. The service role / secret key must never be put here or anywhere in the repo.
 *
 * GOOGLE_CLIENT_ID drives the older in-page Google button (kept for the preview copy).
 * SUPABASE_GOOGLE=1 shows "Continue with Google" for real accounts (turn it on only after the
 * Google provider is set up in Supabase).
 * SUPPORT_EMAIL is the address shown on the Help, FAQ and Contact pages. Set it in Vercel when the
 * CareerPath mailbox exists; no redeploy of the pages is needed.
 * TURNSTILE_SITE_KEY (public by design) switches on the invisible "are you human" check on sign-up, sign-in, reset and
 * resend. Turn it on in Supabase (Authentication > Attack Protection) with the matching secret; see supabase/README.md.
 * WEB_ANALYTICS=1 loads Vercel's page-view counter (turn on Analytics in the Vercel project first; free on Hobby).
 * CP_DEMO=1 switches the real accounts off and returns to the browser-only demo (used by tests).
 */
import { DEFAULT_URL, DEFAULT_KEY } from "./_env.js";
import keepalive from "./_keepalive.js";
import report from "./_report.js";
import feedback from "./_feedback.js";

const DEFAULT_SUPPORT = "careerpath531@gmail.com";

/* Vercel's free plan allows 12 functions per deployment, and every file in api/ without a leading underscore counts as one.
   So the daily keep-alive ping and the browser error report ride on this function:
     /api/config?task=keepalive   called by the daily cron in vercel.json (see api/_keepalive.js)
     /api/config?task=report      POST from public/monitor.js (see api/_report.js)
     /api/config?task=feedback    POST from public/feedback.html, GET for the admin Feedback tab (see api/_feedback.js)
   Do not add a new file to api/ without removing or merging another. */
export default function handler(req, res) {
  let task = "";
  try { task = new URL(req.url || "/", "http://x").searchParams.get("task") || ""; } catch (e) { task = ""; }
  if (task === "keepalive") return keepalive(req, res);
  if (task === "report") return report(req, res);
  if (task === "feedback") return feedback(req, res);
  res.setHeader("cache-control", "no-store");
  const demo = process.env.CP_DEMO === "1";
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    supabaseUrl: demo ? null : (process.env.SUPABASE_URL || DEFAULT_URL),
    supabaseKey: demo ? null : (process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY),
    supportEmail: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT,
    googleOAuth: !demo && process.env.SUPABASE_GOOGLE === "1",
    captchaSiteKey: demo ? null : (process.env.TURNSTILE_SITE_KEY || null),
    analytics: process.env.WEB_ANALYTICS === "1"
  });
}
