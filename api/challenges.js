/* Weekly challenges.

   GET   anyone signed in. A student gets the live challenges (title, brief, minimum words and the rubric labels, never the
         scoring patterns). An admin gets every challenge with its patterns.
   POST  students:  { action: "open", cid }   the student has the challenge page open and has not submitted: the study
                                              assistant is refused until they submit or leave (the same lock exams use)
                    { action: "leave" }       they left the page
         admins:    { action: "save", cid?, roleId, week, title, brief, minWords, rubric: [{ label, re }] }
                                              a new challenge (saved as a draft) or a change to a draft or scheduled one
                    { action: "status", cid, to: "scheduled" | "live" | "closed" }
                                              publishing closes the one it replaces on that roadmap; a live or closed
                                              challenge cannot be edited, because scores were made against its rubric
         Every admin call answers with the admin view so the page can redraw.

   The table behind this (supabase/migrations/011_challenges.sql) cannot be reached from the browser: the server checks the
   caller, checks the challenge, then writes with the service role key. */
import { authenticate, body, fail } from "./_auth.js";
import { ROLE_IDS, challenges, invalidate, liveFor, toRow, viewFor } from "./_challenges.js";

function text(v, max) { return typeof v === "string" ? v.trim() : ""; }

function check(b) {
  if (!ROLE_IDS.includes(b.roleId)) return "Choose a roadmap.";
  if (!Number.isInteger(b.week) || b.week < 1 || b.week > 200) return "The week must be a number from 1 to 200.";
  const title = text(b.title), brief = text(b.brief);
  if (!title || title.length > 200) return "The title must be 1 to 200 characters.";
  if (!brief || brief.length > 4000) return "The brief must be 1 to 4,000 characters.";
  if (!Number.isInteger(b.minWords) || b.minWords < 1 || b.minWords > 2000) return "The minimum words must be a number from 1 to 2,000.";
  if (!Array.isArray(b.rubric) || b.rubric.length < 1 || b.rubric.length > 12) return "Give 1 to 12 rubric lines.";
  for (const r of b.rubric) {
    const label = text(r && r.label), re = typeof (r && r.re) === "string" ? r.re.trim() : "";
    if (!label || label.length > 200) return "Each rubric line needs a description of 1 to 200 characters.";
    if (!re || re.length > 400) return "Each rubric pattern must be 1 to 400 characters.";
    try { new RegExp(re, "i"); } catch (e) { return "This rubric pattern is not valid: " + re.slice(0, 60); }
    if (/\([^)]*[+*][^)]*\)[+*{]/.test(re)) return "This rubric pattern could make scoring very slow. Simplify it: " + re.slice(0, 60);
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use GET or POST.");
  const ctx = await authenticate(req, res);
  if (!ctx) return;
  const { uid, rest, profile } = ctx;
  const admin = profile.role === "admin";
  res.setHeader("cache-control", "no-store");
  let list;
  try { list = await challenges(rest); } catch (e) { return fail(res, 503, "unavailable", "The challenges could not be loaded. Try again in a moment."); }

  if (req.method === "GET") return res.status(200).json({ ok: true, admin, challenges: viewFor(list, admin) });

  const b = body(req);

  if (b.action === "open" || b.action === "leave") {
    if (profile.role !== "student") return res.status(200).json({ ok: true, locked: false });
    await rest("DELETE", "exam_attempts?user_id=eq." + uid + "&kind=eq.challenge&submitted_at=is.null");
    if (b.action === "leave") return res.status(200).json({ ok: true, locked: false });
    const cid = typeof b.cid === "string" ? b.cid.slice(0, 80) : "";
    const c = liveFor(list, profile.roadmap_id);
    if (!c || c.cid !== cid) return res.status(200).json({ ok: true, locked: false });
    const done = await rest("GET", "challenge_submissions?user_id=eq." + uid + "&challenge_id=eq." + encodeURIComponent(cid) + "&select=id");
    if (done.ok && Array.isArray(done.data) && done.data.length) return res.status(200).json({ ok: true, locked: false });
    const made = await rest("POST", "exam_attempts", { user_id: uid, kind: "challenge", target: cid, items: [] }, "return=minimal");
    return res.status(200).json({ ok: true, locked: made.ok });     // not locked if 011 has not been run yet; the page still hides the assistant
  }

  if (!admin) return fail(res, 403, "admins_only", "Only admins can do this.");
  const now = new Date().toISOString();
  const saveFailed = () => fail(res, 502, "save_failed", "That could not be saved. Nothing changed, so try again.");
  const upsert = (c, extra) => rest("POST", "challenges?on_conflict=cid", Object.assign(toRow(c), { updated_at: now }, extra || {}), "resolution=merge-duplicates,return=minimal");
  const done = async () => {
    invalidate();
    try { return res.status(200).json({ ok: true, admin: true, challenges: viewFor(await challenges(rest), true) }); }
    catch (e) { return fail(res, 503, "unavailable", "Saved, but the page could not be refreshed. Reload it."); }
  };

  if (b.action === "save") {
    const bad = check(b);
    if (bad) return fail(res, 400, "bad_request", bad);
    const fields = { roleId: b.roleId, week: b.week, title: text(b.title), brief: text(b.brief), minWords: b.minWords,
      rubric: b.rubric.map((r) => ({ label: text(r.label), re: r.re.trim() })) };
    const cid = typeof b.cid === "string" ? b.cid.slice(0, 80) : "";
    if (cid) {
      const cur = list.filter((x) => x.cid === cid)[0];
      if (!cur) return fail(res, 404, "no_challenge", "That challenge does not exist.");
      if (cur.status === "live" || cur.status === "closed")
        return fail(res, 409, "locked", "A live or closed challenge cannot be changed, because scores were made against it. Write a new one instead.");
      if (fields.roleId !== cur.roleId) return fail(res, 400, "bad_request", "The roadmap of a challenge cannot be changed.");
      const r = await upsert(Object.assign({}, cur, fields));
      return r.ok ? done() : saveFailed();
    }
    const taken = new Set(list.map((x) => x.cid));
    let id = "", tries = 0;
    do { id = fields.roleId + "-w" + fields.week + "-" + Math.random().toString(36).slice(2, 5); } while (taken.has(id) && ++tries < 20);
    const r = await upsert(Object.assign({ cid: id, status: "draft" }, fields), { created_by: uid });
    return r.ok ? done() : saveFailed();
  }

  if (b.action === "status") {
    const cid = typeof b.cid === "string" ? b.cid.slice(0, 80) : "", to = b.to;
    const cur = list.filter((x) => x.cid === cid)[0];
    if (!cur) return fail(res, 404, "no_challenge", "That challenge does not exist.");
    const allowed = { draft: ["scheduled", "live"], scheduled: ["live"], live: ["closed"], closed: [] };
    if (!(allowed[cur.status] || []).includes(to)) return fail(res, 409, "bad_status", "A " + cur.status + " challenge cannot become " + to + ".");
    const closedOthers = [];
    if (to === "live") {                              // one live challenge per roadmap; the one it replaces is closed, not deleted
      for (const o of list.filter((x) => x.roleId === cur.roleId && x.status === "live" && x.cid !== cid)) {
        const r = await upsert(Object.assign({}, o, { status: "closed" }), { closed_at: now });
        if (!r.ok) { for (const k of closedOthers) await upsert(Object.assign({}, k, { status: "live" }), { closed_at: null }); return saveFailed(); }
        closedOthers.push(o);
      }
    }
    const extra = to === "live" ? { published_at: now } : to === "closed" ? { closed_at: now } : {};
    const r = await upsert(Object.assign({}, cur, { status: to }), extra);
    if (!r.ok) { for (const k of closedOthers) await upsert(Object.assign({}, k, { status: "live" }), { closed_at: null }); return saveFailed(); }
    return done();
  }

  return fail(res, 400, "bad_request", "Unknown action.");
}
