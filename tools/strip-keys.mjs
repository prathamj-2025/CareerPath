/* Builds the files the browser downloads from the full curriculum in content/.

   content/*.js is the source of truth and is never served. It holds every question WITH its answer key.
   This script copies each file to public/ with the answer (a) and the explanation (why) removed from every
   graded assessment question, so the keys never reach a student's browser. The server reads content/
   directly (api/_content.js) and grades there.

   Run after any change to content/:  npm run build:content
   `npm test` checks that public/ is exactly what this script produces and holds no answer keys. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import * as acorn from "acorn";

const ROOT = new URL("../", import.meta.url).pathname;
export const FILES = ["data.js", "data2.js", "data4.js", "data5.js", "lessons-pm.js", "lessons-ba.js", "lessons-pjm.js"];
const SECRET = new Set(["a", "why"]);

const keyName = (p) => (p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : "");

/* Source text with the secret properties of every `assessment` question cut out. */
export function strip(src) {
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" });
  const cuts = [];
  (function walk(n) {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "Property" && keyName(n) === "assessment" && n.value.type === "ArrayExpression") {
      for (const item of n.value.elements) {
        if (!item || item.type !== "ObjectExpression") continue;
        const props = item.properties;
        if (!props.some((p) => p.type === "Property" && SECRET.has(keyName(p)))) continue;
        const kept = props.filter((p) => !(p.type === "Property" && SECRET.has(keyName(p))));
        cuts.push({ removed: props.length - kept.length });
        if (!kept.length) { cuts[cuts.length - 1] = { s: item.start + 1, e: item.end - 1, r: "", removed: props.length }; continue; }
        // rebuild the span of properties from the kept ones, keeping the original text between neighbours that stayed adjacent
        let text = "";
        kept.forEach((p, i) => {
          if (i) {
            const prev = kept[i - 1];
            text += props.indexOf(p) === props.indexOf(prev) + 1 ? src.slice(prev.end, p.start) : ", ";
          }
          text += src.slice(p.start, p.end);
        });
        cuts[cuts.length - 1] = { s: props[0].start, e: props[props.length - 1].end, r: text, removed: props.length - kept.length };
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v);
    }
  })(ast);
  cuts.sort((x, y) => y.s - x.s);
  let out = src, removed = 0;
  for (const c of cuts) { out = out.slice(0, c.s) + c.r + out.slice(c.e); removed += c.removed; }
  return { text: out, removed };
}

/* Runs the files the way the page does and returns window. */
export function load(files, dir) {
  const win = {};
  const ctx = vm.createContext({ window: win, console });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  return win;
}

export function build(write = true) {
  const out = {};
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, "content", f), "utf8");
    const r = strip(src);
    out[f] = r;
    if (write) fs.writeFileSync(path.join(ROOT, "public", f), r.text);
  }
  return out;
}

if (import.meta.url === "file://" + process.argv[1]) {
  const res = build(true);
  let n = 0;
  for (const f of FILES) { console.log(f.padEnd(16), res[f].removed, "properties removed"); n += res[f].removed; }
  // Verify: the full set has keys everywhere, the public set has none.
  const full = load(FILES.concat([]), path.join(ROOT, "content")), pub = load(FILES, path.join(ROOT, "public"));
  let total = 0, leaked = 0, missing = 0;
  full.CP_ROLES.forEach((r) => r.skills.forEach((s) => s.assessment.forEach((q) => { total++; if (typeof q.a !== "number" || !q.why) missing++; })));
  pub.CP_ROLES.forEach((r) => r.skills.forEach((s) => s.assessment.forEach((q) => { if (q.a !== undefined || q.why !== undefined) leaked++; })));
  console.log(total + " assessment questions; " + missing + " without a key in content/; " + leaked + " still carrying a key in public/");
  if (leaked || missing) process.exit(1);
}
