/* The weekly challenges as they stand now: the ones that ship with the site (content/data6.js) with the admins' changes from
   the database layered on top (supabase/migrations/011_challenges.sql). A row in the table replaces the file's version of
   the same challenge, or adds a new one. If the table is missing (011 not run yet) the file's challenges are used as they are.
   The scoring patterns (the rubric's `re`) and the reference answer are sent only to admins; students get the labels.
   A row from before migration 012 has no reference answer; the one in content/challenge-refs.js is used then. */
import vm from "node:vm";
import fs from "node:fs";

const PUB = new URL("../public/", import.meta.url);
const SERVER = new URL("../content/", import.meta.url);
const TTL_MS = Number(process.env.CONTENT_TTL_MS) || 8000;
export const ROLE_IDS = ["pm", "ba", "pjm"];

let baseCache = null;
export function base() {
  if (baseCache) return baseCache;
  const win = {};
  const ctx = vm.createContext({ window: win });
  vm.runInContext(fs.readFileSync(new URL("data6.js", SERVER), "utf8"), ctx, { filename: "data6.js" });   // the rubric patterns: server only
  vm.runInContext(fs.readFileSync(new URL("challenge.js", PUB), "utf8"), ctx, { filename: "challenge.js" });
  vm.runInContext(fs.readFileSync(new URL("challenge-refs.js", SERVER), "utf8"), ctx, { filename: "challenge-refs.js" });   // reference answers: server only
  const refs = win.CP_CHALLENGE_REFS || {};
  baseCache = { list: (win.CP_CHALLENGES || []).map((c) => plain(c, refs[c.cid] || "")), ch: win.CP_CHALLENGE };
  return baseCache;
}
function plain(c, reference) {
  return { cid: c.cid, roleId: c.roleId, week: c.week, status: c.status, title: c.title, brief: c.brief, minWords: c.minWords,
    reference: reference || "", rubric: c.rubric.map((r) => ({ label: r.label, re: r.re })) };
}
const fromRow = (r) => ({ cid: r.cid, roleId: r.role_id, week: r.week, status: r.status, title: r.title, brief: r.brief,
  minWords: r.min_words, reference: typeof r.reference === "string" ? r.reference : "", rubric: Array.isArray(r.rubric) ? r.rubric.map((x) => ({ label: String(x.label || ""), re: String(x.re || "") })) : [] });
export const toRow = (c) => ({ cid: c.cid, role_id: c.roleId, week: c.week, status: c.status, title: c.title, brief: c.brief,
  min_words: c.minWords, rubric: c.rubric, reference: c.reference || "" });

let cache = { list: null, at: 0 };
export function invalidate() { cache = { list: null, at: 0 }; }

/* All challenges, merged. `rest` is the service-role client. */
export async function challenges(rest) {
  if (cache.list && Date.now() - cache.at < TTL_MS) return cache.list;
  const rows = await rest("GET", "challenges?select=*");
  const out = base().list.map((c) => Object.assign({}, c));
  if (rows.ok && Array.isArray(rows.data)) {
    rows.data.forEach((r) => {
      const c = fromRow(r), i = out.findIndex((x) => x.cid === c.cid);
      if (i >= 0 && !c.reference) c.reference = out[i].reference || "";      // a row saved before 012 keeps the file's reference
      if (i >= 0) out[i] = c; else out.push(c);
    });
  } else if (cache.list) {
    cache.at = Date.now() - TTL_MS + 2000;          // keep the last good copy and try again soon
    return cache.list;
  }
  cache = { list: out, at: Date.now() };
  return out;
}

export const liveFor = (list, roleId) => list.filter((c) => c.roleId === roleId && c.status === "live")[0] || null;

/* What the page is sent. Students: the live challenges (one per roadmap, so a student who switches roadmap needs no reload),
   rubric labels only. Admins: everything, patterns included. */
export function viewFor(list, admin) {
  if (admin) return list.map((c) => Object.assign({}, c, { rubric: c.rubric.map((r) => ({ label: r.label, re: r.re })) }));
  return list.filter((c) => c.status === "live").map((c) => ({ cid: c.cid, roleId: c.roleId, week: c.week, status: c.status, title: c.title,
    brief: c.brief, minWords: c.minWords, rubric: c.rubric.map((r) => ({ label: r.label })) }));
}
