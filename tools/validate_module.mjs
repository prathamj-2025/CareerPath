// usage: node validate_module.mjs <file.json> <expectedLessonCount>
import fs from "fs";
const [,, file, nExp] = process.argv;
const errs = [], warns = [];
const E = (m) => errs.push(m), W = (m) => warns.push(m);
let d;
try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.log("BAD JSON", e.message); process.exit(1); }
const raw = fs.readFileSync(file, "utf8");
if (/[^\x09\x0a\x0d\x20-\x7e]/.test(raw)) E("non-ASCII characters present: " + [...new Set(raw.match(/[^\x09\x0a\x0d\x20-\x7e]/g))].join(" "));
if (/—|–| -- /.test(raw)) E("dash char/--");
if (!Array.isArray(d.lessons) || d.lessons.length !== +nExp) E("lesson count " + (d.lessons && d.lessons.length) + " != " + nExp);
const str = (x) => typeof x === "string" && x.trim().length > 0;
(d.lessons || []).forEach((l, i) => {
  const t = "L" + (i + 1) + ": ";
  if (!str(l.title) || l.title.length > 70) E(t + "title missing or >70 chars");
  if (!(l.minutes >= 5 && l.minutes <= 15)) E(t + "minutes should be 5-15");
  const b = l.body || "";
  const words = b.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  if (words < 420 || words > 900) E(t + "body words " + words + " (want 450-850 excluding code)");
  const callouts = b.split("\n").filter((x) => x.startsWith("> ")).length;
  if (callouts !== 1) E(t + "callout lines " + callouts + " (want exactly 1)");
  const heads = b.split("\n").filter((x) => /^## /.test(x)).map((x) => x.slice(3).trim());
  const iw = heads.indexOf("Why this matters"), ic = heads.indexOf("Common mistakes"), ik = heads.indexOf("Key takeaways");
  if (iw < 1 || ic < 0 || ik < 0) E(t + "missing Why this matters / Common mistakes / Key takeaways");
  else if (!(iw < ic && ic < ik && ik === heads.length - 1)) E(t + "section order wrong: " + heads.join(" | "));
  if (heads.length < 4) E(t + "too few sections");
  const fences = (b.match(/^```/gm) || []).length;
  if (fences % 2) E(t + "unbalanced code fences");
  const lastSec = b.slice(b.lastIndexOf("## Key takeaways"));
  if ((lastSec.match(/^- /gm) || []).length < 3) E(t + "key takeaways needs >=3 bullets");
  if (/\r/.test(b)) E(t + "CR in body");
  const s = l.scenario || {};
  if (!str(s.setup)) E(t + "scenario.setup");
  const m = s.mcq || {};
  if (!str(m.q) || !Array.isArray(m.opts) || m.opts.length !== 4 || !m.opts.every(str)) E(t + "mcq shape");
  else {
    if (!(Number.isInteger(m.a) && m.a >= 0 && m.a < 4)) E(t + "mcq.a");
    if (!str(m.why)) E(t + "mcq.why");
    const lens = m.opts.map((o) => o.length), mx = Math.max(...lens);
    if (lens[m.a] === mx && lens.filter((x) => x > mx * 0.85).length === 1 && mx > 60) W(t + "correct mcq option is clearly the longest");
  }
  const w = s.written || {};
  if (!str(w.prompt) || !str(w.improved) || !str(w.lesson)) E(t + "written fields");
  if (!Array.isArray(w.points) || w.points.length < 3 || w.points.length > 5) E(t + "written.points 3-5");
  else w.points.forEach((p, j) => {
    if (!str(p.label) || !str(p.re)) { E(t + "point " + j + " shape"); return; }
    let re; try { re = new RegExp(p.re, "i"); } catch (e) { E(t + "point " + j + " regex invalid"); return; }
    if (re.test("")) E(t + "point " + j + " matches empty text");
    if (re.test("the a and to of it is we")) E(t + "point " + j + " matches filler");
    if (!re.test(w.improved || "")) E(t + "point " + j + " does not match model answer: " + p.re);
  });
  const sents = (w.improved || "").split(/[.!?]+\s/).length;
  if (sents < 3) W(t + "improved answer very short");
  if (!Array.isArray(l.revision) || l.revision.length < 4 || l.revision.length > 7 || !l.revision.every((r) => Array.isArray(r) && r.length === 2 && str(r[0]) && str(r[1]))) E(t + "revision shape (4-7 [concept,remember] pairs)");
});
function qs(arr, n, name, lvl) {
  if (!Array.isArray(arr) || arr.length !== n) { E(name + " count " + (arr && arr.length) + " != " + n); return; }
  arr.forEach((q, i) => {
    const t = name + (i + 1) + ": ";
    if (!str(q.q) || !Array.isArray(q.opts) || q.opts.length !== 4 || !q.opts.every(str)) E(t + "shape");
    if (!(Number.isInteger(q.a) && q.a >= 0 && q.a < 4)) E(t + "a");
    if (!str(q.why)) E(t + "why");
    if (new Set((q.opts || []).map((o) => o.toLowerCase())).size !== 4) E(t + "duplicate options");
    if (lvl && q.lvl !== lvl[i]) E(t + "lvl " + q.lvl + " want " + lvl[i]);
  });
  const dist = [0, 0, 0, 0]; arr.forEach((q) => dist[q.a]++);
  if (Math.max(...dist) > Math.ceil(n * 0.5)) W(name + " answer positions skewed " + dist.join(","));
}
qs(d.quiz, 4, "quiz");
qs(d.assessment, 10, "assess", [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
for (const k of Object.keys(d)) if (!["lessons", "quiz", "assessment"].includes(k)) E("unknown key " + k);
console.log(errs.length ? "FAIL " + file + "\n  " + errs.join("\n  ") : "OK   " + file + (warns.length ? "" : ""));
if (warns.length) console.log("  warn: " + warns.join("\n  warn: "));
process.exit(errs.length ? 1 : 0);
