/* Course content edited by admins.

   GET   anyone signed in. The lessons and questions admins have changed since the files shipped. Students get the live
         text with no answers. Admins also get the answers, the drafts and the earlier versions.
   POST  admins only. One action per call:
           lesson-save  { skill, idx, title, body }       publishes at once; the old version is kept
           q-draft      { skill, qid?, fields }           a new question (no qid) or a change to a live one; saved as a draft
           q-discard    { qid }                           throws a draft away
           q-publish    { skill, qid }                    the draft goes live; the live version moves to the archive
           q-retire     { skill, qid }                    takes a question out of the exam; its history stays
         Every call answers with the admin view of the content so the page can redraw.

   The tables behind this (supabase/migrations/008_content_edits.sql) cannot be reached from the browser at all: the server
   checks the caller is an admin, checks the content, then writes with the service role key. */
import { authenticate, body, fail } from "./_auth.js";
import { content, baseContent, invalidate, questionOf, skillOf, viewFor } from "./_content.js";

const MIN_QUESTIONS = 5;   // a skill assessment must keep at least this many live questions

function text(v, max) { return typeof v === "string" ? v.trim().slice(0, max + 1) : ""; }

function checkFields(f) {
  if (!f || typeof f !== "object") return "Send the question.";
  const q = text(f.q, 800), why = typeof f.why === "string" ? f.why.trim() : "";
  if (!q || q.length > 800) return "The question must be 1 to 800 characters.";
  if (!Array.isArray(f.opts) || f.opts.length !== 4) return "Give exactly four options.";
  for (const o of f.opts) { const t = text(o, 300); if (!t || t.length > 300) return "Each option must be 1 to 300 characters."; }
  if (!Number.isInteger(f.a) || f.a < 0 || f.a > 3) return "Choose which option is correct.";
  if (!Number.isInteger(f.lvl) || f.lvl < 1 || f.lvl > 5) return "Choose a difficulty level from 1 to 5.";
  if (why.length > 1200) return "The explanation must be under 1,200 characters.";
  return "";
}
const clean = (f) => ({ q: f.q.trim(), opts: f.opts.map((o) => o.trim()), answer: f.a, lvl: f.lvl, why: (f.why || "").trim() });

function find(C, skillId) {
  for (const r of C.roles) { const s = skillOf(r, skillId); if (s) return { role: r, skill: s }; }
  return null;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use GET or POST.");
  const ctx = await authenticate(req, res, req.method === "POST" ? { admins: true } : undefined);
  if (!ctx) return;
  let C;
  try { C = await content(); } catch (e) { return fail(res, 503, "content_unavailable", "The course content could not be loaded. Try again in a moment."); }
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") return res.status(200).json({ ok: true, admin: ctx.profile.role === "admin", ...viewFor(C, ctx.profile.role === "admin") });

  const b = body(req);
  const found = find(C, typeof b.skill === "string" ? b.skill.slice(0, 80) : "");
  const done = async () => {                       // answer with the fresh admin view
    invalidate();
    try { return res.status(200).json({ ok: true, admin: true, ...viewFor(await content(), true) }); }
    catch (e) { return fail(res, 503, "content_unavailable", "Saved, but the page could not be refreshed. Reload it."); }
  };
  const saveFailed = () => fail(res, 502, "save_failed", "That could not be saved. Nothing changed, so try again.");
  const { uid, rest } = ctx;
  const now = new Date().toISOString();
  const rows = C.rows;

  if (b.action === "lesson-save") {
    if (!found) return fail(res, 404, "no_skill", "That skill does not exist.");
    const idx = b.idx, title = text(b.title, 200), bodyText = typeof b.body === "string" ? b.body.trim() : "";
    const lesson = Number.isInteger(idx) ? found.skill.lessons[idx] : null;
    if (!lesson) return fail(res, 404, "no_lesson", "That lesson does not exist.");
    if (!title || title.length > 200) return fail(res, 400, "bad_request", "The title must be 1 to 200 characters.");
    if (!bodyText || bodyText.length > 30000) return fail(res, 400, "bad_request", "The lesson text must be 1 to 30,000 characters.");
    if (title === lesson.title && bodyText === lesson.body) return done();
    const mine = rows.lessons.filter((r) => r.skill_id === found.skill.id && r.idx === idx);
    const live = mine.filter((r) => r.status === "live")[0];
    const next = Math.max(1, ...mine.map((r) => r.version)) + 1;
    if (!live) {                                    // first edit: keep the lesson as it shipped as version 1
      const orig = baseContent().roles.filter((r) => r.id === found.role.id)[0].skills.filter((s) => s.id === found.skill.id)[0].lessons[idx];
      const keep = await rest("POST", "content_lessons", { skill_id: found.skill.id, idx, version: 1, status: "archived", title: orig.title, body: orig.body, edited_by: null },
        "resolution=ignore-duplicates,return=minimal");
      if (!keep.ok) return saveFailed();
    } else {
      const arch = await rest("PATCH", "content_lessons?skill_id=eq." + encodeURIComponent(found.skill.id) + "&idx=eq." + idx + "&status=eq.live", { status: "archived" }, "return=minimal");
      if (!arch.ok) return saveFailed();
    }
    const made = await rest("POST", "content_lessons", { skill_id: found.skill.id, idx, version: next, status: "live", title, body: bodyText, edited_by: uid }, "return=minimal");
    if (!made.ok) {
      if (live) await rest("PATCH", "content_lessons?skill_id=eq." + encodeURIComponent(found.skill.id) + "&idx=eq." + idx + "&version=eq." + live.version, { status: "live" }, "return=minimal");
      return saveFailed();
    }
    return done();
  }

  if (b.action === "q-draft") {
    if (!found) return fail(res, 404, "no_skill", "That skill does not exist.");
    const bad = checkFields(b.fields);
    if (bad) return fail(res, 400, "bad_request", bad);
    const f = clean(b.fields);
    const sid = found.skill.id;
    let qid = typeof b.qid === "string" ? b.qid.slice(0, 100) : "", version = 1, isNew = true;
    if (qid) {
      const cur = questionOf(found.skill, qid);
      if (!cur) return fail(res, 404, "no_question", "That question is not live.");
      version = cur.v + 1; isNew = false;
    } else {
      const taken = new Set(rows.questions.map((r) => r.qid));
      let n = rows.questions.filter((r) => r.skill_id === sid && r.is_new).length + 1;
      while (taken.has(sid + "-n" + n)) n++;
      qid = sid + "-n" + n;
    }
    const have = rows.questions.filter((r) => r.qid === qid && r.status === "draft")[0];
    const row = { qid, version, status: "draft", skill_id: sid, is_new: isNew, lvl: f.lvl, q: f.q, opts: f.opts, answer: f.answer, why: f.why, created_by: uid };
    const saved = have
      ? await rest("PATCH", "content_questions?qid=eq." + encodeURIComponent(qid) + "&status=eq.draft", Object.assign({}, row, { created_at: now }), "return=minimal")
      : await rest("POST", "content_questions", row, "return=minimal");
    return saved.ok ? done() : saveFailed();
  }

  if (b.action === "q-discard") {
    const qid = typeof b.qid === "string" ? b.qid.slice(0, 100) : "";
    if (!qid) return fail(res, 400, "bad_request", "Send the question.");
    const r = await rest("DELETE", "content_questions?qid=eq." + encodeURIComponent(qid) + "&status=eq.draft", undefined, "return=minimal");
    return r.ok ? done() : saveFailed();
  }

  if (b.action === "q-publish") {
    if (!found) return fail(res, 404, "no_skill", "That skill does not exist.");
    const qid = typeof b.qid === "string" ? b.qid.slice(0, 100) : "";
    const draft = rows.questions.filter((r) => r.qid === qid && r.status === "draft" && r.skill_id === found.skill.id)[0];
    if (!draft) return fail(res, 404, "no_draft", "There is no draft for that question.");
    const where = "content_questions?qid=eq." + encodeURIComponent(qid);
    if (draft.is_new) {
      const r = await rest("PATCH", where + "&status=eq.draft", { status: "live", published_at: now }, "return=minimal");
      return r.ok ? done() : saveFailed();
    }
    const cur = questionOf(found.skill, qid);
    if (!cur) return fail(res, 409, "retired", "That question was removed. Discard the draft.");
    const liveRow = rows.questions.filter((r) => r.qid === qid && r.status === "live")[0];
    if (liveRow) {
      const a = await rest("PATCH", where + "&status=eq.live", { status: "archived", retired_at: now }, "return=minimal");
      if (!a.ok) return saveFailed();
    } else {                                        // first change to a question that shipped in the files: keep it as version 1
      const a = await rest("POST", "content_questions", { qid, version: cur.v, status: "archived", skill_id: found.skill.id, lvl: cur.lvl, q: cur.q, opts: cur.opts, answer: cur.a, why: cur.why || "", retired_at: now },
        "resolution=ignore-duplicates,return=minimal");
      if (!a.ok) return saveFailed();
    }
    const up = await rest("PATCH", where + "&status=eq.draft", { status: "live", version: cur.v + 1, published_at: now }, "return=minimal");
    if (!up.ok) {                                   // put the live version back
      if (liveRow) await rest("PATCH", where + "&version=eq." + liveRow.version, { status: "live", retired_at: null }, "return=minimal");
      else await rest("DELETE", where + "&version=eq." + cur.v + "&status=eq.archived", undefined, "return=minimal");
      return saveFailed();
    }
    return done();
  }

  if (b.action === "q-retire") {
    if (!found) return fail(res, 404, "no_skill", "That skill does not exist.");
    const qid = typeof b.qid === "string" ? b.qid.slice(0, 100) : "";
    const cur = questionOf(found.skill, qid);
    if (!cur) return fail(res, 404, "no_question", "That question is not live.");
    if (found.skill.assessment.length - 1 < MIN_QUESTIONS)
      return fail(res, 409, "too_few", "A skill needs at least " + MIN_QUESTIONS + " live questions. Add a replacement first.");
    const where = "content_questions?qid=eq." + encodeURIComponent(qid);
    const liveRow = rows.questions.filter((r) => r.qid === qid && r.status === "live")[0];
    const r = liveRow
      ? await rest("PATCH", where + "&status=eq.live", { status: "retired", retired_at: now }, "return=minimal")
      : await rest("POST", "content_questions", { qid, version: cur.v, status: "retired", skill_id: found.skill.id, lvl: cur.lvl, q: cur.q, opts: cur.opts, answer: cur.a, why: cur.why || "", retired_at: now },
        "resolution=ignore-duplicates,return=minimal");
    if (!r.ok) return saveFailed();
    await rest("DELETE", where + "&status=eq.draft", undefined, "return=minimal");
    return done();
  }

  return fail(res, 400, "bad_request", "Unknown action.");
}
