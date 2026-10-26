/* Graded assessments and module exams, scored on the server.

   The page never sees an answer key. Flow:
     start   { kind: "skill" | "module", id }   the server picks the questions, records an open attempt, and returns the list
                                                 of question ids (the question text is already on the page, the answers are not)
     submit  { attempt, answers: [0..3, ...] }   the server grades against content/, saves the attempt, the stars, the best score,
                                                 the module result and the points, and returns the score with the explanations
                                                 for the questions that were missed

   Stars, scores and points are written here with the service role key. The database refuses the same writes from a browser
   (supabase/migrations/007_server_grading.sql), so a score cannot be set from the page. Real accounts only. */
import { authenticate, body, fail, today } from "./_auth.js";
import { content, roleOf, skillOf, questionOf } from "./_content.js";

const MAX_STARTS_PER_HOUR = 20;      // exam attempts opened by one student
const MAX_ATTEMPTS_PER_DAY = 10;     // graded attempts of one exam by one student in 24 hours
const MAX_OPEN_MINUTES = 240;        // an attempt left open longer than this is expired

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const splitHistory = (h) => {
  const list = Array.isArray(h) ? h : [];
  return { exams: list.filter((x) => !(x && x.kind === "project")), project: list.filter((x) => x && x.kind === "project").slice(-1) };
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  const ctx = await authenticate(req, res, { students: true });
  if (!ctx) return;
  const b = body(req);
  if (b.action === "start") return start(ctx, b, res);
  if (b.action === "submit") return submit(ctx, b, res);
  return fail(res, 400, "bad_request", "Unknown action.");
}

async function start({ uid, profile, rest }, b, res) {
  const C = content(), G = C.grading;
  const role = roleOf(profile.roadmap_id);
  if (!role) return fail(res, 403, "no_roadmap", "Choose a roadmap first.");
  const kind = b.kind === "module" ? "module" : "skill";
  const id = typeof b.id === "string" ? b.id.slice(0, 80) : "";
  let items;

  if (kind === "skill") {
    const sk = skillOf(role, id);
    if (!sk) return fail(res, 404, "no_such_exam", "That assessment is not on your roadmap.");
    items = sk.assessment.map((q) => ({ skill: sk.id, qid: q.qid }));
  } else {
    const t = (role.tracks || []).filter((x) => x.id === id)[0];
    if (!t || !t.cert) return fail(res, 404, "no_such_exam", "That module has no exam.");
    const req = G.skillsOfTrack(role, t, true);
    const rows = await rest("GET", "skill_progress?user_id=eq." + uid + "&select=skill_id,stars");
    const stars = {};
    (rows.data || []).forEach((r) => { stars[r.skill_id] = r.stars; });
    const missing = req.filter((s) => (stars[s.id] || 0) < G.JOB_READY);
    if (missing.length) return fail(res, 403, "not_eligible", "Reach 3 stars in every required sub-module first: " + missing.map((s) => s.name).join(", ") + ".");
    items = G.drawModuleExam(role, t);
  }
  if (!items.length) return fail(res, 404, "no_questions", "This exam has no questions yet.");

  const recent = await rest("GET", "exam_attempts?user_id=eq." + uid + "&started_at=gte." + encodeURIComponent(ago(3600e3)) + "&select=id");
  if (recent.ok && Array.isArray(recent.data) && recent.data.length >= MAX_STARTS_PER_HOUR)
    return fail(res, 429, "too_many", "You have started a lot of exams in the last hour. Take a break and try again later.");
  const day = await rest("GET", "exam_attempts?user_id=eq." + uid + "&kind=eq." + kind + "&target=eq." + encodeURIComponent(id) +
    "&submitted_at=gte." + encodeURIComponent(ago(86400e3)) + "&select=id");
  if (day.ok && Array.isArray(day.data) && day.data.length >= MAX_ATTEMPTS_PER_DAY)
    return fail(res, 429, "daily_limit", "You have reached today's limit of " + MAX_ATTEMPTS_PER_DAY + " attempts for this exam. Review the lessons and come back tomorrow.");

  await rest("DELETE", "exam_attempts?user_id=eq." + uid + "&kind=eq." + kind + "&target=eq." + encodeURIComponent(id) + "&submitted_at=is.null");
  const made = await rest("POST", "exam_attempts", { user_id: uid, kind, target: id, items }, "return=representation");
  if (!made.ok || !Array.isArray(made.data) || !made.data[0]) return fail(res, 502, "save_failed", "Could not start the exam. Try again.");
  return res.status(200).json({ ok: true, attempt: made.data[0].id, kind, id, items });
}

async function submit({ uid, profile, rest }, b, res) {
  const C = content(), G = C.grading;
  const attemptId = typeof b.attempt === "string" ? b.attempt.slice(0, 64) : "";
  const answers = Array.isArray(b.answers) ? b.answers : null;
  if (!attemptId || !answers) return fail(res, 400, "bad_request", "Send the attempt and your answers.");

  const got = await rest("GET", "exam_attempts?id=eq." + encodeURIComponent(attemptId) + "&user_id=eq." + uid + "&select=*");
  const at = got.ok && Array.isArray(got.data) ? got.data[0] : null;
  if (!at) return fail(res, 404, "no_attempt", "That attempt was not found. Start the exam again.");
  if (at.submitted_at) return fail(res, 409, "already_submitted", "That attempt was already submitted.");
  if (Date.now() - new Date(at.started_at).getTime() > MAX_OPEN_MINUTES * 60e3) return fail(res, 410, "expired", "That attempt expired. Start the exam again.");
  const items = Array.isArray(at.items) ? at.items : [];
  if (answers.length !== items.length) return fail(res, 400, "bad_request", "Answer every question before submitting.");

  const role = roleOf(profile.roadmap_id);
  if (!role) return fail(res, 403, "no_roadmap", "Choose a roadmap first.");

  // Grade.
  const detail = items.map((it, i) => {
    const sk = skillOf(role, it.skill), q = questionOf(sk, it.qid);
    const given = Number.isInteger(answers[i]) ? answers[i] : -1;
    const ok = !!q && given === q.a;
    return { i, skill: it.skill, qid: it.qid, lvl: q ? q.lvl : 0, ok, a: ok ? undefined : (q ? q.a : undefined), why: ok ? undefined : (q ? q.why : undefined) };
  });
  const right = detail.filter((d) => d.ok).length;
  const pct = Math.round(right / items.length * 100);

  // Claim the attempt first, so two submits of the same attempt cannot both pay out.
  const claimed = await rest("PATCH", "exam_attempts?id=eq." + encodeURIComponent(attemptId) + "&user_id=eq." + uid + "&submitted_at=is.null",
    { submitted_at: new Date().toISOString(), answers: answers.map((x) => (Number.isInteger(x) ? x : -1)), score: pct, right }, "return=representation");
  if (!claimed.ok || !Array.isArray(claimed.data) || !claimed.data[0]) return fail(res, 409, "already_submitted", "That attempt was already submitted.");
  const release = () => rest("PATCH", "exam_attempts?id=eq." + encodeURIComponent(attemptId) + "&user_id=eq." + uid, { submitted_at: null, answers: null, score: null, right: null });

  let out;
  try {
    out = at.kind === "module" ? await gradeModule(uid, role, at, pct, rest, C) : await gradeSkill(uid, at, pct, rest, C);
  } catch (e) { out = null; }
  if (!out) { await release(); return fail(res, 502, "save_failed", "Your result could not be saved. Nothing was recorded, so try again."); }

  const total = out.delta ? await rest("POST", "rpc/add_points", { p_user: uid, p_delta: out.delta }) : null;
  let points = total && total.ok && typeof total.data === "number" ? total.data : null;
  if (points == null) { const p = await rest("GET", "profiles?id=eq." + uid + "&select=points"); points = p.ok && p.data && p.data[0] ? p.data[0].points : profile.points; }

  return res.status(200).json({ ok: true, kind: at.kind, target: at.target, pct, right, total: items.length, detail, points,
    pointsAwarded: out.delta, award: out.award, newStars: out.newStars, passed: out.passed, first: out.first,
    progress: out.progress, module: out.module });
}

async function gradeSkill(uid, at, pct, rest, C) {
  const G = C.grading, L = C.levels;
  const cur = await rest("GET", "skill_progress?user_id=eq." + uid + "&skill_id=eq." + encodeURIComponent(at.target) + "&select=*");
  if (!cur.ok) return null;
  const row = (cur.data && cur.data[0]) || { stars: 0, best: 0, attempts: 0, project: false, lessons_done: [], history: [] };
  const award = G.awardFor(L, pct, !!row.project);
  const split = splitHistory(row.history);
  const exams = split.exams.concat([{ pct, stars: award.stars, when: today() }]).slice(-49);
  const next = {
    user_id: uid, skill_id: at.target, stars: Math.max(row.stars || 0, award.stars), best: Math.max(row.best || 0, pct),
    attempts: (row.attempts || 0) + 1, project: !!row.project, lessons_done: row.lessons_done || [], history: exams.concat(split.project)
  };
  const saved = await rest("POST", "skill_progress?on_conflict=user_id,skill_id", next, "resolution=merge-duplicates,return=representation");
  if (!saved.ok) return null;
  const gained = award.stars > (row.stars || 0);
  return { delta: gained ? (award.stars - (row.stars || 0)) * G.STAR_POINTS : 0, award, newStars: gained || pct > (row.best || 0),
    progress: { stars: next.stars, best: next.best, attempts: next.attempts, project: next.project, history: next.history } };
}

async function gradeModule(uid, role, at, pct, rest, C) {
  const G = C.grading, L = C.levels;
  const cur = await rest("GET", "module_results?user_id=eq." + uid + "&track_id=eq." + encodeURIComponent(at.target) + "&select=*");
  if (!cur.ok) return null;
  const row = (cur.data && cur.data[0]) || { best: 0, attempts: 0, passed: false, passed_on: "", history: [] };
  const pass = pct >= G.passMark(L), first = pass && !row.passed;
  const next = {
    user_id: uid, track_id: at.target, best: Math.max(row.best || 0, pct), attempts: (row.attempts || 0) + 1,
    passed: !!row.passed || pass, passed_on: row.passed ? row.passed_on : (pass ? today() : ""),
    history: (Array.isArray(row.history) ? row.history : []).concat([{ pct, when: today() }]).slice(-60)
  };
  const saved = await rest("POST", "module_results?on_conflict=user_id,track_id", next, "resolution=merge-duplicates,return=representation");
  if (!saved.ok) return null;
  return { delta: first ? G.EXAM_POINTS : 0, passed: pass, first, module: { best: next.best, attempts: next.attempts, passed: next.passed, passedOn: next.passed_on, history: next.history } };
}
