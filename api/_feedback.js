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
  tried: ["yes", "no"],
  why_not: ["no_time", "not_sure", "forgot", "other"],
  used: ["match", "roadmap", "lessons", "practice", "assessments", "assistant", "leaderboard", "challenge"],
  device: ["phone", "laptop", "tablet"],
  continue: ["regularly", "sometimes", "interviews", "no"],
  source: ["page", "app", "prompt"]
};

function clip(v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").trim().slice(0, n); }
const one = (v, list) => (list.indexOf(v) > -1 ? v : null);
const many = (v, list) => (Array.isArray(v) ? v.filter((x, i) => list.indexOf(x) > -1 && v.indexOf(x) === i) : []);
function num(v, lo, hi) { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

/* Returns { row } or { error }. */
export function clean(b) {
  const tried = one(b.tried, CHOICES.tried);
  if (!tried) return { error: "Please say whether you have tried CareerPath." };
  const status = one(b.status, CHOICES.status), role = one(b.role, CHOICES.role);
  if (!status) return { error: "Please choose student, working or other." };
  if (!role) return { error: "Please choose the role you are aiming for." };
  let email = clip(b.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address does not look right. Leave it empty if you prefer." };
  if (!email) email = null;

  const answers = {
    school: clip(b.school, 120), program: clip(b.program, 120),
    prepare: many(b.prepare, CHOICES.prepare), struggle: many(b.struggle, CHOICES.struggle)
  };
  const row = { source: one(b.source, CHOICES.source) || "page", status, target_role: role, tried,
    ease: null, lessons: null, recommend: null, continue_use: null, email };

  if (tried === "yes") {
    row.ease = num(b.ease, 1, 5); row.lessons = num(b.lessons, 1, 5);
    row.recommend = num(b.recommend, 0, 10); row.continue_use = one(b.continue, CHOICES.continue);
    if (row.ease == null) return { error: "Please rate how easy it was to get started." };
    if (row.lessons == null) return { error: "Please rate how helpful the lessons were." };
    if (row.continue_use == null) return { error: "Please say whether you will keep using CareerPath." };
    if (row.recommend == null) return { error: "Please choose how likely you are to recommend CareerPath." };
    Object.assign(answers, {
      used: many(b.used, CHOICES.used), device: many(b.device, CHOICES.device),
      favorite: one(b.favorite, CHOICES.used), broken: clip(b.broken, TEXT), lessons_better: clip(b.lessons_better, TEXT),
      change_mind: row.continue_use === "no" ? clip(b.change_mind, TEXT) : "", change: clip(b.change, TEXT)
    });
  } else {
    Object.assign(answers, { why_not: one(b.why_not, CHOICES.why_not), would_try: clip(b.would_try, TEXT) });
  }
  for (const k of Object.keys(answers)) {
    const v = answers[k];
    if (v === "" || v == null || (Array.isArray(v) && !v.length)) delete answers[k];
  }
  row.answers = answers;
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

const missingTable = (r) => r.status === 404 || (r.data && /PGRST205|42P01|does not exist|Could not find the table/.test(String(r.data.code || "") + " " + String(r.data.message || "")));
const NEEDS_015 = { code: "needs_015", message: "Feedback is not switched on yet. Run supabase/migrations/015_feedback.sql in the Supabase SQL editor." };

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const who = await authenticate(req, res, { admins: true });
    if (!who) return;
    const r = await who.rest("GET", "feedback?select=*&order=created_at.desc&limit=2000");
    if (!r.ok) { res.status(503).json({ error: missingTable(r) ? NEEDS_015 : { code: "server_error", message: "Could not load the feedback. Try again." } }); return; }
    res.status(200).json({ rows: Array.isArray(r.data) ? r.data : [] });
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
