/* The feedback form (public/feedback.html) and the admin Feedback tab.

     POST /api/config?task=feedback   anyone; saves one answer. A signed-in student's answer is linked to their account
                                      when the page sends their token and they left "link to my account" on.
     GET  /api/config?task=feedback   admins only; every answer, newest first.

   Every field is checked against a fixed list of choices or cut to a fixed length, so nothing else can be stored.
   A hidden field that people never see catches simple spam bots. Each address may send a limited number per hour
   (a whole campus can share one address, so the limit is generous). Stored only when 015_feedback.sql has been run. */
import { serviceRest, authenticate } from "./_auth.js";
import { supabase } from "./_env.js";
import { overBurst, addressKey } from "./_burst.js";

const MAX_BODY = 12000;
const PER_HOUR = 20;
const TEXT = 1000;

export const CHOICES = {
  status: ["student", "working", "other"],
  role: ["pm", "pjm", "ba", "other", "unsure"],
  prepare: ["google", "youtube", "courses", "chatgpt", "linkedin", "mentors", "books", "none"],
  struggle: ["order", "testing", "too_many", "time", "interviews", "other"],
  heard: ["whatsapp", "friend", "class", "linkedin", "poster", "other"],
  tried: ["yes", "no"],
  why_not: ["no_time", "not_sure", "forgot", "other"],
  used: ["match", "roadmap", "lessons", "practice", "assessments", "assistant", "leaderboard", "challenge"],
  device: ["phone", "laptop", "tablet"],
  continue: ["regularly", "sometimes", "interviews", "no"],
  pmf: ["very", "somewhat", "not"],
  source: ["page", "app", "prompt"]
};

function clip(v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").trim().slice(0, n); }
const one = (v, list) => (list.indexOf(v) > -1 ? v : null);
const many = (v, list) => (Array.isArray(v) ? v.filter((x, i) => list.indexOf(x) > -1 && v.indexOf(x) === i) : []);
function num(v, lo, hi) { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

/* Returns { row } or { error }. The row has one key per column of public.feedback, in the order of the form
   (supabase/migrations/015_feedback.sql), so every answer lands in its own column. Questions that do not apply to this
   person (the "Using it" ones for someone who has not tried CareerPath, and the other way round) are left empty. */
export const COLUMNS = ["source", "user_id", "status", "school", "program", "target_role", "prepare", "struggle", "heard", "tried",
  "used", "ease", "device", "broken", "lessons", "lessons_better", "favorite", "continue_use", "change_mind", "pmf", "recommend",
  "add_or_change", "why_not", "would_try", "email"];

export function clean(b) {
  const text = (v, n) => clip(v, n || TEXT) || null;
  const status = one(b.status, CHOICES.status), role = one(b.role, CHOICES.role);
  if (!status) return { error: "Please choose student, working or other." };
  if (!role) return { error: "Please choose the role you are aiming for." };
  const prepare = many(b.prepare, CHOICES.prepare), struggle = many(b.struggle, CHOICES.struggle), heard = one(b.heard, CHOICES.heard);
  if (!prepare.length) return { error: "Please choose how you are preparing for your target role." };
  if (!struggle.length) return { error: "Please choose what is hardest about preparing." };
  if (!heard) return { error: "Please say how you heard about CareerPath." };
  const tried = one(b.tried, CHOICES.tried);
  if (!tried) return { error: "Please say whether you have tried CareerPath." };
  let email = clip(b.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address does not look right. Leave it empty if you prefer." };

  const row = {
    source: one(b.source, CHOICES.source) || "page", user_id: null,
    status, school: text(b.school, 120), program: text(b.program, 120), target_role: role, prepare, struggle, heard, tried,
    used: [], ease: null, device: [], broken: null, lessons: null, lessons_better: null, favorite: null, continue_use: null,
    change_mind: null, pmf: null, recommend: null, add_or_change: null,
    why_not: null, would_try: null,
    email: email || null
  };

  if (tried === "yes") {
    row.used = many(b.used, CHOICES.used);
    row.ease = num(b.ease, 1, 5); row.lessons = num(b.lessons, 1, 5); row.continue_use = one(b.continue, CHOICES.continue);
    row.pmf = one(b.pmf, CHOICES.pmf); row.recommend = num(b.recommend, 0, 10);
    if (!row.used.length) return { error: "Please choose the parts of CareerPath you used." };
    if (row.ease == null) return { error: "Please rate how easy it was to get started." };
    if (row.lessons == null) return { error: "Please rate how helpful the lessons were." };
    if (row.continue_use == null) return { error: "Please say whether you will keep using CareerPath." };
    if (row.pmf == null) return { error: "Please say how you would feel if you could no longer use CareerPath." };
    if (row.recommend == null) return { error: "Please choose how likely you are to recommend CareerPath." };
    row.device = many(b.device, CHOICES.device);
    row.broken = text(b.broken); row.lessons_better = text(b.lessons_better); row.favorite = one(b.favorite, CHOICES.used);
    row.change_mind = row.continue_use === "no" ? text(b.change_mind) : null;
    row.add_or_change = text(b.add_or_change != null ? b.add_or_change : b.change);
  } else {
    row.why_not = one(b.why_not, CHOICES.why_not);
    if (!row.why_not) return { error: "Please say what stopped you from trying CareerPath." };
    row.would_try = text(b.would_try);
  }
  return { row };
}

async function signedInUser(req) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const env = supabase();
  try {
    const r = await fetch(env.url + "/auth/v1/user", { headers: { apikey: env.key, authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return (await r.json()).id || null;
  } catch (e) { return null; }
}

/* What students actually did, beside what they said: accounts, picked a roadmap, read a lesson, took an assessment, and came
   back on a later day than the one they signed up on (any lesson, assessment or exam after that day). Admins are not counted. */
export async function usage(rest) {
  try {
    const [p, sp, ex] = await Promise.all([
      rest("GET", "profiles?select=id,role,roadmap_id,created_at&role=eq.student&limit=20000"),
      rest("GET", "skill_progress?select=user_id,lessons_done,attempts,updated_at&limit=100000"),
      rest("GET", "exam_attempts?select=user_id,started_at&limit=100000")
    ]);
    if (!p.ok || !Array.isArray(p.data)) return null;
    const students = new Map(p.data.filter((x) => x.role === "student").map((x) => [x.id, x]));
    const day = (t) => (t ? String(t).slice(0, 10) : "");
    const lesson = new Set(), tested = new Set(), back = new Set();
    const later = (uid, t) => { const s = students.get(uid); if (s && s.created_at && t && day(t) > day(s.created_at)) back.add(uid); };
    for (const r of (sp.ok && Array.isArray(sp.data) ? sp.data : [])) {
      if (!students.has(r.user_id)) continue;
      if (Array.isArray(r.lessons_done) && r.lessons_done.length) lesson.add(r.user_id);
      if (Number(r.attempts) > 0) tested.add(r.user_id);
      later(r.user_id, r.updated_at);
    }
    for (const r of (ex.ok && Array.isArray(ex.data) ? ex.data : [])) {
      if (!students.has(r.user_id)) continue;
      tested.add(r.user_id); later(r.user_id, r.started_at);
    }
    return {
      accounts: students.size,
      onboarded: [...students.values()].filter((x) => !!x.roadmap_id).length,
      read_lesson: lesson.size, took_assessment: tested.size, came_back: back.size
    };
  } catch (e) { return null; }
}

const missingTable = (r) => r.status === 404 || (r.data && /PGRST205|42P01|does not exist|Could not find the table/.test(String(r.data.code || "") + " " + String(r.data.message || "")));
const NEEDS_015 = { code: "needs_015", message: "Feedback is not switched on yet. Run supabase/migrations/015_feedback.sql in the Supabase SQL editor." };

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const who = await authenticate(req, res, { admins: true });
    if (!who) return;
    const r = await who.rest("GET", "feedback?select=id,created_at," + COLUMNS.join(",") + "&order=created_at.desc&limit=2000");
    if (!r.ok) { res.status(503).json({ error: missingTable(r) ? NEEDS_015 : { code: "server_error", message: "Could not load the feedback. Try again." } }); return; }
    res.status(200).json({ rows: Array.isArray(r.data) ? r.data : [], usage: await usage(who.rest) });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: { code: "method", message: "Use POST." } }); return; }

  let b = req.body;
  if (typeof b === "string") { if (b.length > MAX_BODY) { res.status(413).json({ error: { code: "too_big", message: "That answer is too long." } }); return; } try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) { res.status(400).json({ error: { code: "bad_request", message: "Something went wrong. Please try again." } }); return; }
  if (b.website) { res.status(201).json({ ok: true }); return; }   // the hidden field: only a bot fills it in

  const rest = serviceRest();
  if (!rest) { res.status(503).json({ error: { code: "not_configured", message: "Feedback cannot be saved on this copy of the site." } }); return; }
  const ip = clip(String(req.headers["x-forwarded-for"] || "").split(",")[0], 60) || "unknown";
  if (await overBurst(rest, "feedback:" + addressKey(ip), PER_HOUR, 3600)) {
    res.status(429).json({ error: { code: "rate", message: "Thanks, we already have several answers from your network this hour. Please try again later." } });
    return;
  }
  const got = clean(b);
  if (got.error) { res.status(400).json({ error: { code: "invalid", message: got.error } }); return; }
  const row = got.row;
  if (b.link !== false) row.user_id = await signedInUser(req);

  const r = await rest("POST", "feedback", row, "return=minimal");
  if (!r.ok) { res.status(503).json({ error: missingTable(r) ? NEEDS_015 : { code: "server_error", message: "Your answer could not be saved. Please try again." } }); return; }
  res.status(201).json({ ok: true });
}
