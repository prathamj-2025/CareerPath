/* The curriculum for the serverless functions, answer keys included, with the admins' edits applied.

   Two layers:
     1. the files in content/ (never served to browsers; see tools/strip-keys.mjs), the starting point;
     2. rows in content_lessons and content_questions (supabase/migrations/008_content_edits.sql), and in content_overrides
        (013_content_overrides.sql: project briefs and practice exercises), what admins changed.
   content() returns layer 2 applied over layer 1. The database rows are cached for a few seconds so a busy site does
   not read them on every request, and the cache is dropped as soon as an admin saves. If the tables do not exist yet
   (the migration has not been run) the files alone are used. Files that start with an underscore are not routes. */
import vm from "node:vm";
import fs from "node:fs";
import { serviceRest } from "./_auth.js";

const ROOT = new URL("../", import.meta.url);
const FILES = ["data.js", "data2.js", "data4.js", "data5.js", "lessons-pm.js", "lessons-ba.js", "lessons-pjm.js"];
const TTL_MS = Number(process.env.CONTENT_TTL_MS) || 8000;   // how long database edits are cached between reads

function run(files, dir, ctx) {
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(dir + f, ROOT), "utf8"), ctx, { filename: f });
}

let baseCache = null;
export function baseContent() {
  if (baseCache) return baseCache;
  const win = {};
  const ctx = vm.createContext({ window: win });
  run(FILES, "content/", ctx);
  run(["grading.js", "project.js"], "public/", ctx);
  const roles = win.CP_ROLES || [];
  roles.forEach((r) => r.skills.forEach((s) => s.assessment.forEach((q, i) => {
    if (!q.qid) q.qid = s.id + "-q" + (i + 1);
    q.v = 1;
  })));
  baseCache = { roles, levels: win.CP_LEVELS, grading: win.CP_GRADING, project: win.CP_PROJECT };
  return baseCache;
}

function dateText(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
const fromRow = (r) => ({ qid: r.qid, v: r.version, lvl: r.lvl, q: r.q, opts: r.opts, a: r.answer, why: r.why || "" });

/* Pure: base roles plus database rows in, merged roles out. Skills with no edits are the same objects as in the base.
   Every merged skill gets drafts[] and archive[] (empty when there is nothing). */
export function applyOverlay(baseRoles, lessonRows, questionRows, overrideRows) {
  const liveLesson = {};
  (lessonRows || []).filter((r) => r.status === "live").forEach((r) => { (liveLesson[r.skill_id] = liveLesson[r.skill_id] || {})[r.idx] = r; });
  const qBy = {};
  (questionRows || []).forEach((r) => { (qBy[r.skill_id] = qBy[r.skill_id] || []).push(r); });
  const projectBy = {}, practiceBy = {};
  (overrideRows || []).filter((r) => r.status === "live").forEach((r) => {
    if (r.kind === "project") projectBy[r.key] = r;
    else if (r.kind === "practice") { const [sid, i] = String(r.key).split("#"); (practiceBy[sid] = practiceBy[sid] || {})[i] = r; }
  });
  const changed = new Set();

  const roles = baseRoles.map((role) => {
    let touched = false;
    const skills = role.skills.map((sk) => {
      const L = liveLesson[sk.id], Q = qBy[sk.id], PJ = projectBy[sk.id], PR = practiceBy[sk.id];
      if (!L && !Q && !PJ && !PR) return sk;
      touched = true; changed.add(sk.id);
      const out = Object.assign({}, sk, { lessons: sk.lessons.slice(), drafts: [], archive: [] });
      if (PJ && PJ.data) out.project = Object.assign({}, sk.project || {}, { title: String(PJ.data.title || ""), brief: String(PJ.data.brief || "") });
      if (PR) {
        out.practice = (sk.practice || []).map((ex, i) => {
          const r = PR[i]; if (!r || !r.data) return ex;
          const d = r.data, o = Object.assign({}, ex, { prompt: String(d.prompt || ex.prompt), hints: Array.isArray(d.hints) ? d.hints.map(String) : ex.hints });
          if (ex.kind === "query") o.solution = String(d.answer || ex.solution); else o.answer = String(d.answer || ex.answer);
          return o;
        });
      }
      if (L) {
        Object.keys(L).forEach((i) => {
          if (out.lessons[i]) out.lessons[i] = Object.assign({}, out.lessons[i], { title: L[i].title, body: L[i].body, v: L[i].version });
        });
      }
      if (Q) {
        const live = {}, gone = new Set(), fresh = [];
        Q.forEach((r) => {
          if (r.status === "live") live[r.qid] = r;
          else if (r.status === "retired") { gone.add(r.qid); out.archive.push({ qid: r.qid, v: r.version, retired: dateText(r.retired_at || r.created_at), retiredOut: true, fields: fieldsOf(r) }); }
          else if (r.status === "archived") out.archive.push({ qid: r.qid, v: r.version, retired: dateText(r.retired_at || r.published_at || r.created_at), fields: fieldsOf(r) });
          else if (r.status === "draft") out.drafts.push({ qid: r.qid, isNew: !!r.is_new, created: dateText(r.created_at), version: r.version, fields: fieldsOf(r) });
        });
        const baseIds = new Set(sk.assessment.map((q) => q.qid));
        out.assessment = sk.assessment.filter((q) => !gone.has(q.qid) || live[q.qid]).map((q) => (live[q.qid] ? fromRow(live[q.qid]) : q));
        Object.keys(live).filter((id) => !baseIds.has(id)).forEach((id) => fresh.push(live[id]));
        fresh.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        fresh.forEach((r) => out.assessment.push(fromRow(r)));
        out.archive.sort((a, b) => (a.qid === b.qid ? a.v - b.v : a.qid.localeCompare(b.qid)));
      }
      return out;
    });
    return touched ? Object.assign({}, role, { skills }) : role;
  });
  return { roles, changed };
}
function fieldsOf(r) { return { q: r.q, opts: r.opts, a: r.answer, lvl: r.lvl, why: r.why || "" }; }

let rowCache = { at: 0, lessons: [], questions: [], overrides: [], loaded: false };
let mergedCache = null;
export function invalidate() { rowCache.at = 0; mergedCache = null; }

async function all(rest, path) {
  const out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = await rest("GET", path + "&limit=1000&offset=" + off);
    if (!r.ok) return { ok: false, status: r.status, data: r.data };
    out.push(...(Array.isArray(r.data) ? r.data : []));
    if (!Array.isArray(r.data) || r.data.length < 1000) break;
  }
  return { ok: true, data: out };
}
const tableMissing = (r) => r.status === 404 || (r.data && (r.data.code === "PGRST205" || r.data.code === "42P01"));

async function loadRows() {
  if (rowCache.loaded && Date.now() - rowCache.at < TTL_MS) return;
  const rest = serviceRest();
  if (!rest) { rowCache = { at: Date.now(), lessons: [], questions: [], overrides: [], loaded: true }; mergedCache = null; return; }
  const [l, q, o] = await Promise.all([
    all(rest, "content_lessons?select=*&order=skill_id.asc,idx.asc,version.asc"),
    all(rest, "content_questions?select=*&order=created_at.asc"),
    all(rest, "content_overrides?select=*&order=key.asc,version.asc")
  ]);
  // Migration 013 may not have been run yet: the project and practice edits are then simply absent.
  const over = o.ok ? o.data : (tableMissing(o) ? [] : null);
  if (l.ok && q.ok && over) { rowCache = { at: Date.now(), lessons: l.data, questions: q.data, overrides: over, loaded: true }; mergedCache = null; return; }
  if ((!l.ok && tableMissing(l)) || (!q.ok && tableMissing(q))) {          // migration 008 not run yet: the files alone
    rowCache = { at: Date.now(), lessons: [], questions: [], overrides: [], loaded: true }; mergedCache = null; return;
  }
  if (rowCache.loaded) { rowCache.at = Date.now() - TTL_MS + 2000; return; }   // keep the last good copy, try again soon
  throw new Error("content_unavailable");
}

/* The curriculum as it stands now: { roles, levels, grading, project, changed:Set, rows }. Throws "content_unavailable"
   if the edits cannot be read and there is no earlier copy, so a grader never guesses with out-of-date answers. */
export async function content() {
  await loadRows();
  if (mergedCache) return mergedCache;
  const B = baseContent();
  const o = applyOverlay(B.roles, rowCache.lessons, rowCache.questions, rowCache.overrides);
  mergedCache = { roles: o.roles, levels: B.levels, grading: B.grading, project: B.project, changed: o.changed, rows: rowCache };
  return mergedCache;
}

export function roleOf(C, id) { return C.roles.filter((r) => r.id === id)[0] || null; }
export function skillOf(role, skillId) { return role ? role.skills.filter((s) => s.id === skillId)[0] || null : null; }
export function questionOf(skill, qid) { return skill ? skill.assessment.filter((q) => q.qid === qid)[0] || null : null; }

/* The question as it was at version v, for grading an attempt that started before an admin changed or removed it.
   Returns { qid, v, lvl, q, opts, a, why } or null. */
export function questionAt(skill, qid, v) {
  const cur = questionOf(skill, qid);
  if (cur && (!v || cur.v === v)) return cur;
  const old = skill && skill.archive ? skill.archive.filter((x) => x.qid === qid && x.v === v)[0] : null;
  if (old) return { qid, v, lvl: old.fields.lvl, q: old.fields.q, opts: old.fields.opts, a: old.fields.a, why: old.fields.why };
  return cur;
}

/* What the page needs. Students get the edited lessons and the live question text, with no answers. Admins also get the
   answers, the drafts and the earlier versions. Only skills that have edits are listed; the page keeps its files for the rest. */
/* Earlier versions an admin can restore: lessons, the project brief and practice exercises. Newest first, live one left out. */
function historyOf(rows, skillId) {
  const at = (t) => dateText(t);
  const lessons = {}, practice = {};
  let project = [];
  ((rows && rows.lessons) || []).filter((r) => r.skill_id === skillId && r.status === "archived").forEach((r) => {
    (lessons[r.idx] = lessons[r.idx] || []).push({ v: r.version, title: r.title, body: r.body, at: at(r.edited_at) });
  });
  ((rows && rows.overrides) || []).filter((r) => r.status === "archived").forEach((r) => {
    if (r.kind === "project" && r.key === skillId) project.push({ v: r.version, title: r.data.title, brief: r.data.brief, at: at(r.edited_at) });
    if (r.kind === "practice" && String(r.key).split("#")[0] === skillId) {
      const i = String(r.key).split("#")[1];
      (practice[i] = practice[i] || []).push({ v: r.version, prompt: r.data.prompt, hints: r.data.hints || [], answer: r.data.answer, at: at(r.edited_at) });
    }
  });
  const newest = (a, b) => b.v - a.v;
  Object.keys(lessons).forEach((k) => lessons[k].sort(newest));
  Object.keys(practice).forEach((k) => practice[k].sort(newest));
  project.sort(newest);
  return { lessons, project, practice };
}

export function viewFor(C, admin) {
  const skills = {};
  C.roles.forEach((r) => r.skills.forEach((s) => {
    if (!C.changed.has(s.id)) return;
    const base = baseContent().roles.filter((x) => x.id === r.id)[0].skills.filter((x) => x.id === s.id)[0];
    const lessons = {};
    s.lessons.forEach((l, i) => { if (l !== base.lessons[i]) lessons[i] = { title: l.title, body: l.body, v: l.v || 1 }; });
    const v = { lessons, assessment: s.assessment.map((q) => (admin ? { qid: q.qid, v: q.v, lvl: q.lvl, q: q.q, opts: q.opts, a: q.a, why: q.why } : { qid: q.qid, v: q.v, lvl: q.lvl, q: q.q, opts: q.opts })) };
    if (s.project !== base.project) v.project = { title: s.project.title, brief: s.project.brief };
    const prac = {};
    (s.practice || []).forEach((ex, i) => { if (ex !== (base.practice || [])[i]) prac[i] = { prompt: ex.prompt, hints: ex.hints || [], answer: ex.kind === "query" ? ex.solution : ex.answer }; });
    if (Object.keys(prac).length) v.practice = prac;
    if (admin) {
      v.drafts = s.drafts || []; v.archive = s.archive || [];
      v.history = historyOf(C.rows, s.id);
    }
    skills[s.id] = v;
  }));
  return { skills };
}
