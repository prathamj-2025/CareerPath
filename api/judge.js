/* AI check for the written practice in the modules: the practice exercises and the lesson scenarios.

   POST { kind: "practice", roleId, skill, i, text }     exercise number i of a skill
        { kind: "scenario", roleId, skill, i, text }     the scenario of lesson number i of a skill
   Answers { ok: true, ai: true, result } where result is the shape the page's check panel draws:
        { criteria: [{ label, ok, why }], problems: [label], met, total, graded, verdict }
   or { ok: true, ai: false, reason } when the AI check cannot run (no model set up, over this student's hourly or daily
   allowance, the model did not answer). The page then runs the keyword check it has always had, so a student always gets
   a result. Practice never affects stars or points, so nothing is saved.

   The reference answer comes from the server's copy of the curriculum (content/), is shown only to the AI marker, and is
   never part of the reply. Counts against the same hourly and daily allowance as the study assistant (009_ai_usage.sql). */
import { authenticate, body, fail } from "./_auth.js";
import { baseContent } from "./_content.js";
import { judge, judgeOff } from "./_judge.js";

const HOURLY = Number(process.env.AI_HOURLY_LIMIT) || 40;
const DAILY = Number(process.env.AI_DAILY_LIMIT) || 200;
const GLOBAL_DAILY = Number(process.env.AI_GLOBAL_DAILY) || 10000;
const BURST = 10;                              // checks per student per minute, per server instance
const recent = new Map();

function tooFast(uid) {
  const now = Date.now(), list = (recent.get(uid) || []).filter((t) => now - t < 60000);
  list.push(now); recent.set(uid, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < 60000)) recent.delete(k);
  return list.length > BURST;
}

function findSkill(roleId, skillId) {
  const C = baseContent();
  const own = C.roles.filter((r) => r.id === roleId)[0];
  const inOwn = own && own.skills.filter((s) => s.id === skillId)[0];
  if (inOwn) return inOwn;
  for (const r of C.roles) { const s = r.skills.filter((x) => x.id === skillId)[0]; if (s) return s; }
  return null;
}
const labels = (list) => (Array.isArray(list) ? list : []).map((x) => String(x && x.label || "")).filter(Boolean);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  res.setHeader("cache-control", "no-store");
  const ctx = await authenticate(req, res);
  if (!ctx) return;
  const b = body(req);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const idx = Number.isInteger(b.i) ? b.i : -1;
  if (!text || idx < 0 || typeof b.skill !== "string" || (b.kind !== "practice" && b.kind !== "scenario"))
    return fail(res, 400, "bad_request", "Send the exercise and your answer.");
  if (text.length > 6000) return fail(res, 400, "too_long", "That answer is too long. Keep it under 6,000 characters.");

  const sk = findSkill(String(b.roleId || ""), b.skill);
  let task;
  if (sk && b.kind === "practice") {
    const ex = (sk.practice || [])[idx];
    const c = ex && ex.check;
    if (c) {
      const graded = !(c.points && c.points.length);
      task = { kind: ex.kind || "written", question: ex.prompt, reference: ex.solution || ex.answer || "",
        criteria: labels(graded ? c.must : c.points), problems: labels(c.forbid), graded: graded };
    }
  } else if (sk && b.kind === "scenario") {
    const sc = (sk.lessons || [])[idx] && sk.lessons[idx].scenario;
    if (sc && sc.written) {
      task = { kind: "written", question: (sc.setup || "") + "\n\n" + (sc.written.prompt || ""), reference: sc.written.improved || "",
        criteria: labels(sc.written.points), problems: [], graded: false };
    }
  }
  if (!task || !task.criteria.length) return fail(res, 404, "no_exercise", "That exercise could not be found.");

  const off = (reason) => res.status(200).json({ ok: true, ai: false, reason: reason });
  if (judgeOff()) return off("disabled");
  if (!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY)) return off("no_ai");
  if (tooFast(ctx.uid)) return off("busy");
  const lim = await ctx.rest("POST", "rpc/take_ai", { p_user: ctx.uid, p_hour: HOURLY, p_day: DAILY, p_global: GLOBAL_DAILY });
  if (lim.ok && lim.data && typeof lim.data === "object" && !lim.data.ok) return off("limit");

  const marked = await judge({ kind: task.kind, question: task.question, reference: task.reference,
    criteria: task.criteria, problems: task.problems, answer: text });
  if (!marked) return off("unavailable");

  const criteria = task.criteria.map((label, k) => ({ label: label, ok: marked.criteria[k].ok, why: marked.criteria[k].why }));
  const problems = task.problems.filter((p, k) => marked.problems[k]);
  const met = criteria.filter((x) => x.ok).length, total = criteria.length;
  const verdict = task.graded
    ? (met === total && !problems.length ? "correct" : !problems.length && met / total >= 0.6 ? "close" : "not-yet")
    : (met === total ? "full" : met ? "partial" : "none-covered");
  return res.status(200).json({ ok: true, ai: true, result: { criteria: criteria, problems: problems, met: met, total: total, graded: task.graded, verdict: verdict } });
}
