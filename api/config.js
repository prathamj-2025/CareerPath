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
 * CP_DEMO=1 switches the real accounts off and returns to the browser-only demo (used by tests).
 */
import { DEFAULT_URL, DEFAULT_KEY } from "./_env.js";

const DEFAULT_SUPPORT = "careerpath531@gmail.com";

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const demo = process.env.CP_DEMO === "1";
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    supabaseUrl: demo ? null : (process.env.SUPABASE_URL || DEFAULT_URL),
    supabaseKey: demo ? null : (process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY),
    supportEmail: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT,
    googleOAuth: !demo && process.env.SUPABASE_GOOGLE === "1"
  });
}
