/* The resume check: real resumes pass, other documents do not. Pure logic, no browser. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RESUMES, NOT_RESUMES } from "./fixtures/resumes.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const w = {};
globalThis.window = w; globalThis.document = {};
new Function("window", fs.readFileSync(path.join(dir, "../public/onboard.js"), "utf8"))(w);
const check = w.CP_ONBOARD.assessResume;
const clean = w.CP_ONBOARD.clean;

let failed = 0;
for (const [name, text] of Object.entries(RESUMES)) {
  const r = check(clean(text));
  const ok = r.ok;
  if (!ok) failed++;
  console.log((ok ? "ok   " : "FAIL ") + "resume accepted: " + name + "  score " + r.score);
}
for (const [name, text] of Object.entries(NOT_RESUMES)) {
  const r = check(clean(text));
  const ok = !r.ok;
  if (!ok) failed++;
  console.log((ok ? "ok   " : "FAIL ") + "not a resume: " + name + "  score " + r.score + (r.looksLike ? "  (" + r.looksLike + ")" : ""));
}
// Same text with every line break removed, as a PDF extractor sometimes returns it.
for (const [name, text] of Object.entries(RESUMES)) {
  const r = check(clean(text.replace(/\n/g, " ")));
  if (!r.ok) { failed++; console.log("FAIL flattened resume accepted: " + name + "  score " + r.score); }
}
console.log(failed ? failed + " failed" : "all passed");
process.exit(failed ? 1 : 0);
