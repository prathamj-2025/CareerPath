/* Reviews a practical project on the server and records the result, so an accepted project (and the fifth star and
   points it unlocks) cannot be claimed from the browser.

   The student sends the project text. This function checks it is long enough, asks the AI reviewer to score it against
   what a hiring manager would accept (rules and parser are public/project.js, the same file the page uses), and saves the
   submission with the service role key. A score at or above the pass mark accepts it. If the reviewer is unavailable or its
   reply cannot be read, nothing is recorded and nothing is accepted. Real accounts only. */
import { authenticate, body, fail, today } from "./_auth.js";
import { content, roleOf, skillOf } from "./_content.js";
import { completeText } from "./_ai.js";

const MAX_PER_HOUR = 8;            // reviews one student can request per hour (each one is a paid AI call)
const MAX_CHARS = 20000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  const ctx = await authenticate(req, res, { students: true });
  if (!ctx) return;
  const { uid, profile, rest } = ctx;
  const C = content(), P = C.project, G = C.grading;

  const b = body(req);
  const skillId = typeof b.skill === "string" ? b.skill.slice(0, 80) : "";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const role = roleOf(profile.roadmap_id), sk = skillOf(role, skillId);
  if (!sk || !sk.project) return fail(res, 404, "no_project", "That project is not on your roadmap.");
  if (text.length > MAX_CHARS) return fail(res, 400, "too_long", "That is too long. Keep the project under " + MAX_CHARS.toLocaleString("en-US") + " characters.");
  const n = P.words(text);
  if (n < P.MIN_WORDS) return fail(res, 400, "too_short", "Write at least " + P.MIN_WORDS + " words before submitting. You have " + n + ".");

  const cur = await rest("GET", "skill_progress?user_id=eq." + uid + "&skill_id=eq." + encodeURIComponent(skillId) + "&select=*");
  if (!cur.ok) return fail(res, 502, "read_failed", "Could not read your progress. Try again.");
  const row = (cur.data && cur.data[0]) || { stars: 0, best: 0, attempts: 0, project: false, lessons_done: [], history: [] };
  if (row.project) return fail(res, 409, "already_accepted", "This project was already accepted.");

  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = await rest("GET", "exam_attempts?user_id=eq." + uid + "&kind=eq.project&started_at=gte." + encodeURIComponent(since) + "&select=id");
  if (recent.ok && Array.isArray(recent.data) && recent.data.length >= MAX_PER_HOUR)
    return fail(res, 429, "too_many", "You have requested a lot of reviews in the last hour. Revise your project and try again later.");

  const raw = await completeText(P.rules(today()), [{ role: "user", content: P.prompt(role.name, sk.name, sk.project, text) }], 40000);
  if (!raw) return fail(res, 503, "reviewer_unavailable", "The reviewer is not available right now, so the project was not submitted. Your text is still here; try again in a moment.");
  const r = P.read(raw);
  if (!r) return fail(res, 502, "unreadable", "The review came back in a form that could not be read, so nothing was recorded. Try submitting again.");

  const accepted = r.score >= P.PASS;
  const hist = Array.isArray(row.history) ? row.history : [];
  const prev = hist.filter((x) => x && x.kind === "project").slice(-1)[0];
  const sub = { score: r.score, accepted, text: text.slice(0, P.KEEP_CHARS), summary: r.summary, criteria: r.criteria, next: r.next,
    when: today(), tries: ((prev && prev.tries) || 0) + 1 };
  let stars = row.stars || 0, delta = 0;
  if (accepted) {
    delta = G.PROJECT_POINTS;
    if ((row.best || 0) >= 95 && stars < 5) { delta += G.FIFTH_STAR_POINTS; stars = 5; }
  }
  const next = {
    user_id: uid, skill_id: skillId, stars, best: row.best || 0, attempts: row.attempts || 0, project: accepted || !!row.project,
    lessons_done: row.lessons_done || [], history: hist.filter((x) => !(x && x.kind === "project")).slice(-49).concat([Object.assign({ kind: "project" }, sub)])
  };
  const saved = await rest("POST", "skill_progress?on_conflict=user_id,skill_id", next, "resolution=merge-duplicates,return=representation");
  if (!saved.ok) return fail(res, 502, "save_failed", "The review could not be saved. Nothing was recorded, so try again.");
  await rest("POST", "exam_attempts", { user_id: uid, kind: "project", target: skillId, items: [], submitted_at: new Date().toISOString(), score: r.score }, "return=minimal");

  let points = profile.points;
  if (delta) {
    const t = await rest("POST", "rpc/add_points", { p_user: uid, p_delta: delta });
    if (t.ok && typeof t.data === "number") points = t.data;
  }
  return res.status(200).json({ ok: true, sub, accepted, pointsAwarded: delta, points,
    progress: { stars: next.stars, best: next.best, attempts: next.attempts, project: next.project, history: next.history } });
}
