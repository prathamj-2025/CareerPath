/* The full curriculum, answer keys included, for the serverless functions. Files that start with an underscore are
   not routes. content/ is never served to browsers (see tools/strip-keys.mjs); public/ holds the stripped copies. */
import vm from "node:vm";
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url);
const FILES = ["data.js", "data2.js", "data4.js", "data5.js", "lessons-pm.js", "lessons-ba.js", "lessons-pjm.js"];

function run(files, dir, ctx) {
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(dir + f, ROOT), "utf8"), ctx, { filename: f });
}

let cached = null;
export function content() {
  if (cached) return cached;
  const win = {};
  const ctx = vm.createContext({ window: win });
  run(FILES, "content/", ctx);
  run(["grading.js", "project.js"], "public/", ctx);
  const roles = win.CP_ROLES || [];
  roles.forEach((r) => r.skills.forEach((s) => s.assessment.forEach((q, i) => { if (!q.qid) q.qid = s.id + "-q" + (i + 1); })));
  cached = { roles, levels: win.CP_LEVELS, grading: win.CP_GRADING, project: win.CP_PROJECT };
  return cached;
}

export function roleOf(id) { return content().roles.filter((r) => r.id === id)[0] || null; }
export function skillOf(role, skillId) { return role ? role.skills.filter((s) => s.id === skillId)[0] || null : null; }
export function questionOf(skill, qid) { return skill ? skill.assessment.filter((q) => q.qid === qid)[0] || null : null; }
