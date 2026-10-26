/* Real files through the real upload box: resumes are accepted whatever PDF flavor they are,
   and a visa, an I-20, a bank statement, scans and photos are refused with a clear reason. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "pdfs");
const URL = process.env.BASE || "http://localhost:3111";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
let failed = 0;
const step = async (l, f) => { try { await f(); console.log("ok   " + l); } catch (e) { failed++; console.log("FAIL " + l + " :: " + e.message.split("\n")[0]); } };

await page.goto(URL);
await page.click('[data-tab="signup"]'); await page.waitForTimeout(100);
await page.fill("#su-name", "Sam Ortiz"); await page.fill("#su-email", "sam@usc.edu"); await page.fill("#su-pass", "pass");
await page.click('[data-action="signup"]');
await page.waitForSelector("#onb-file");

async function upload(file) {
  if (!(await page.$("#onb-file"))) { await page.click('[data-action="onb-redo"]'); await page.waitForSelector("#onb-file"); }
  await page.setInputFiles("#onb-file", path.join(dir, file));
  await page.waitForSelector(".cover-row, .err", { timeout: 30000 });
  const accepted = !!(await page.$(".cover-row"));
  const err = accepted ? "" : await page.textContent(".err");
  return { accepted, err };
}

for (const f of ["resume-simple.pdf", "resume-flow.pdf", "resume-objstm.pdf", "resume-cid.pdf", "resume.docx"]) {
  await step("resume accepted: " + f, async () => {
    const r = await upload(f);
    if (!r.accepted) throw new Error("refused: " + r.err);
  });
}
for (const [f, want] of [
  ["i20.pdf", /does not look like a resume/],
  ["visa.pdf", /does not look like a resume/],
  ["i20-cid.pdf", /does not look like a resume/],
  ["visa-cid.pdf", /does not look like a resume/],
  ["i20-cid-objstm.pdf", /does not look like a resume/],
  ["bank-statement.pdf", /does not look like a resume/],
  ["i20-scan.pdf", /scan or a photo/],
  ["visa-scan.pdf", /scan or a photo/],
  ["visa-photo.jpg", /image, not a resume/]
]) {
  await step("refused: " + f, async () => {
    const r = await upload(f);
    if (r.accepted) throw new Error("accepted a document that is not a resume");
    if (!want.test(r.err)) throw new Error("wrong message: " + r.err.slice(0, 160));
    if (/paste the text instead and it will work/i.test(r.err)) throw new Error("told the student to paste a document that is not a resume");
  });
}

console.log(errs.length ? "\nJS ERRORS:\n" + errs.join("\n") : "\nno js errors");
console.log(failed ? "\n" + failed + " FAILED" : "\nall steps passed");
await browser.close();
process.exit(failed ? 1 : 0);
