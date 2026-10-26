/* Scores a weekly challenge answer on the server and saves it, so the score on the leaderboard cannot be set
   from the browser.

   The student sends their sign-in token and the answer. This function:
     1. asks Supabase who the token belongs to,
     2. checks the challenge is live and is on the student's own roadmap,
     3. refuses a second submission (the stored one is returned instead),
     4. scores the answer with the fixed rubric (public/challenge.js, the same code the page uses),
     5. writes the AI feedback if a model is set up, with a plain fallback if not,
     6. saves one row with the service role key. That key is read from SUPABASE_SERVICE_ROLE_KEY in the host's
        environment settings and is never sent to the browser.
   Real accounts only. Setup is in supabase/README.md. */
import vm from "node:vm";
import fs from "node:fs";
import { supabase } from "./_env.js";
import { completeText } from "./_ai.js";

const PUB = new URL("../public/", import.meta.url);
let loaded = null;
function lib() {
  if (loaded) return loaded;
  const win = {};
  const ctx = vm.createContext({ window: win });
  for (const f of ["data6.js", "challenge.js"]) {
    vm.runInContext(fs.readFileSync(new URL(f, PUB), "utf8"), ctx, { filename: f });
  }
  loaded = { challenges: win.CP_CHALLENGES || [], ch: win.CP_CHALLENGE };
  return loaded;
}

function fail(res, status, code, message) {
  res.status(status).json({ error: { code: code, message: message } });
}

// Monday of the current week, UTC, as YYYY-MM-DD.
function weekOf(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

function shape(c, row, points) {
  const L = lib().ch;
  const res = L.score(c, row.answer);
  return {
    pct: row.score, hit: row.hits, of: c.rubric.length, words: row.words, short: row.words < c.minWords,
    when: String(row.created_at || "").slice(0, 10), feedback: row.feedback || "",
    source: row.feedback && row.feedback.indexOf("No written review is available") !== 0 ? "ai" : "rules",
    points: points || 0, met: res.met, answer: row.answer
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");

  const env = supabase();
  if (!env.secret) {
    return fail(res, 500, "not_configured",
      "Challenge scoring is not set up on this deployment. Add SUPABASE_SERVICE_ROLE_KEY in the hosting settings and redeploy.");
  }

  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return fail(res, 401, "signed_out", "Please sign in again.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const cid = body && typeof body.cid === "string" ? body.cid.slice(0, 80) : "";
  const answer = body && typeof body.answer === "string" ? body.answer.trim() : "";
  if (!cid || !answer) return fail(res, 400, "bad_request", "Send the challenge and your answer.");
  if (answer.length > 12000) return fail(res, 400, "too_long", "That answer is too long. Keep it under 12,000 characters.");

  const L = lib();
  const c = L.challenges.filter((x) => x.cid === cid && x.status === "live")[0];
  if (!c) return fail(res, 404, "no_challenge", "That challenge is not open.");

  const asUser = { apikey: env.key, authorization: "Bearer " + token };
  const asServer = { apikey: env.secret, "content-type": "application/json" };
  if (env.secret.startsWith("eyJ")) asServer.authorization = "Bearer " + env.secret;   // legacy JWT-style key

  // 1. Who is this?
  let uid = "";
  try {
    const r = await fetch(env.url + "/auth/v1/user", { headers: asUser });
    if (!r.ok) return fail(res, 401, "signed_out", "Your session expired. Sign in again.");
    uid = (await r.json()).id || "";
  } catch (e) {
    return fail(res, 502, "auth_unreachable", "Could not reach the sign-in service. Try again.");
  }
  if (!uid) return fail(res, 401, "signed_out", "Please sign in again.");

  const get = async (path) => {
    const r = await fetch(env.url + "/rest/v1/" + path, { headers: asUser });
    return r.ok ? r.json() : null;
  };

  // 2. Student, on this roadmap.
  const prof = await get("profiles?id=eq." + uid + "&select=roadmap_id,role");
  if (!prof || !prof[0]) return fail(res, 403, "no_profile", "Your profile is not ready yet. Try again in a moment.");
  if (prof[0].role !== "student") return fail(res, 403, "students_only", "Only students can submit challenges.");
  if (prof[0].roadmap_id !== c.roleId) return fail(res, 403, "wrong_roadmap", "This challenge is for a different roadmap.");

  // 3. One submission each: hand back the stored one.
  const mine = "challenge_submissions?user_id=eq." + uid + "&challenge_id=eq." + encodeURIComponent(c.cid) + "&select=*";
  const have = await get(mine);
  if (have && have[0]) return res.status(200).json({ ok: true, already: true, submission: shape(c, have[0], 0) });

  // 4 and 5. Score, then feedback.
  const result = L.ch.score(c, answer);
  let feedback = await completeText(L.ch.feedbackRules, [{ role: "user", content: L.ch.feedbackPrompt(c, result, answer) }], 18000);
  feedback = feedback.replace(/—/g, ", ").slice(0, 7900);
  if (!feedback) feedback = L.ch.noReviewText(result.of);

  // 6. Save.
  let saved;
  try {
    const r = await fetch(env.url + "/rest/v1/challenge_submissions", {
      method: "POST",
      headers: Object.assign({ prefer: "resolution=ignore-duplicates,return=representation" }, asServer),
      body: JSON.stringify({
        user_id: uid, challenge_id: c.cid, roadmap_id: c.roleId, week_of: weekOf(new Date()),
        answer: answer, words: Math.min(result.words, 5000), score: result.pct, hits: result.hit, feedback: feedback
      })
    });
    if (!r.ok) return fail(res, 502, "save_failed", "Your answer could not be saved. Nothing was submitted, so try again.");
    saved = await r.json();
  } catch (e) {
    return fail(res, 502, "save_failed", "Your answer could not be saved. Nothing was submitted, so try again.");
  }
  if (!Array.isArray(saved) || !saved[0]) {                       // lost a race with a second tab
    const again = await get(mine);
    if (again && again[0]) return res.status(200).json({ ok: true, already: true, submission: shape(c, again[0], 0) });
    return fail(res, 502, "save_failed", "Your answer could not be saved. Try again.");
  }
  return res.status(200).json({ ok: true, already: false, submission: shape(c, saved[0], L.ch.points(result.pct)) });
}
