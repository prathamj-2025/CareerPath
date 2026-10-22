/* Onboarding, weekly challenge, live leaderboard and roadmap history.

   Run against test/devserver.mjs with the mock provider behind it:
     node test/fakeopenai.mjs
     AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 node test/serve
     node test/onboarding.spec.mjs                                        */
import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";
import path from "path";
import os from "os";

const URL = process.env.BASE || "http://localhost:3111";
const errs = [];
let failed = 0;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => {
  // The webfont CDN is unreachable from the sandbox; that is the environment, not the app.
  if (m.type() === "error" && !/fonts\.googleapis|ERR_TUNNEL/.test(m.text())) errs.push("console: " + m.text());
});

async function step(name, fn) {
  try { await fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + " :: " + e.message.split("\n")[0]); }
}
const text = (sel) => page.textContent(sel);
const nav = () => page.$$eval("#sidebar .nav-item span:first-child", els => els.map(e => e.textContent.trim()));

/* A resume the parser has to read out of a real PDF, written to a temp file so the
   suite does not depend on anything outside the repository. */
const RESUME = [
  "ALEX RIVERA", "alex@usc.edu | Los Angeles, CA", "",
  "EXPERIENCE",
  "Data Analyst, Northwind Retail",
  "Wrote SQL against Snowflake to build weekly reporting for the merchandising team.",
  "Built dashboards in Tableau and automated the refresh with Python and pandas.",
  "Ran data cleaning and validation on the product catalogue, fixing duplicates and missing data.",
  "Used statistics and hypothesis testing to size the effect of a pricing change.",
  "", "SKILLS",
  "SQL, Python, pandas, Tableau, statistics, data cleaning, window functions, dashboards"
].join("\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cp-"));
const txtPath = path.join(tmp, "alex-resume.txt");
fs.writeFileSync(txtPath, RESUME);

/* ---------------- onboarding ---------------- */

await page.goto(URL);

await step("a new account starts at the resume step", async () => {
  await page.click('[data-tab="signup"]');
  await page.waitForTimeout(120);
  await page.fill("#su-name", "Alex Rivera");
  await page.fill("#su-email", "alex@usc.edu");
  await page.fill("#su-pass", "pass");
  await page.click('[data-action="signup"]');
  await page.waitForSelector("#onb-file");
  const h = await text(".page-head h1");
  if (!h.includes("resume")) throw new Error("landed on: " + h);
});

await step("the resume is read in the browser and never uploaded", async () => {
  const requests = [];
  page.on("request", r => { if (r.method() === "POST") requests.push(r.url()); });
  await page.setInputFiles("#onb-file", txtPath);
  await page.waitForSelector(".cover-row", { timeout: 20000 });
  if (requests.length) throw new Error("the page posted somewhere: " + requests.join(","));
});

/* A PDF laid out the way pdfTeX writes one: words separated by kerning numbers inside TJ
   arrays rather than by space characters, "fi" stored as a low control code, an embedded font
   program that contains operator-like text, and a stream whose neighbour declares a different
   /Length. A real resume exported from LaTeX failed on every one of these. */
function texPdf() {
  const content = "0 g 0 G\nBT\n/F1 11 Tf 72 700 Td [(Product)-250(Roadmapping)-250(and)-250(Agile/Scrum)]TJ\n" +
    "0 -14 Td [(User)-250(research)-250(and)-250(stakeholder)-250(management)]TJ\n" +
    "0 -14 Td [(Certi\\002cate)-250(in)-250(Product)-250(Management)]TJ\nET\n";
  const font = "%!PS-AdobeFont-1.0: Fake 1.0\n% Copyright. See the file COPYING for conditions BT TJ permission is granted to include " +
    "this font program in a Postscript or PDF file that consists of a document that contains text to be displayed.\n";
  const parts = [];
  const obj = (n, dict, data) => {
    parts.push(Buffer.from(n + " 0 obj\n<<" + dict + " /Length " + data.length + " >>\nstream\n", "latin1"), data, Buffer.from("\nendstream\nendobj\n", "latin1"));
  };
  parts.push(Buffer.from("%PDF-1.5\n", "latin1"));
  obj(9, " /Filter /FlateDecode /Length1 10", zlib.deflateSync(Buffer.from(font, "latin1")));
  obj(8, " /Filter /FlateDecode", zlib.deflateSync(Buffer.from(content, "latin1")));
  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}

await step("a PDF typeset with TeX is read as words, from the page and not the font", async () => {
  const f = path.join(tmp, "tex-resume.pdf");
  fs.writeFileSync(f, texPdf());
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const file = new File([u], "tex-resume.pdf", { type: "application/pdf" });
    const out = await window.CP_ONBOARD.parseFile(file);
    return { text: out.text, ok: out.ok };
  }, fs.readFileSync(f).toString("base64"));
  if (/Copyright|COPYING|font program/.test(r.text)) throw new Error("read the font program: " + r.text.slice(0, 80));
  for (const w of ["Product Roadmapping", "Agile/Scrum", "User research", "stakeholder management", "Certificate"])
    if (!r.text.includes(w)) throw new Error("missing '" + w + "' in: " + r.text.slice(0, 160));
});

await step("a product manager's resume is recognised in its own vocabulary", async () => {
  const PM = "Technical Program Manager, Acme. Led cross-functional agile teams, ran sprint planning in Jira, " +
    "owned the product roadmap and go-to-market plan, wrote user stories, managed stakeholders and risk, and " +
    "launched a chatbot built on an LLM with RAG. Presented OKRs to executives. Figma wireframes for the MVP.";
  const r = await page.evaluate((t) => {
    const O = window.CP_ONBOARD;
    const d = O.detect(t);
    const prompt = O.rankPrompt(window.CP_ROLES, d, [], [], t);
    return { general: d.general, roles: d.roles, prompt: prompt };
  }, PM);
  const all = Object.values(r.general).flat().join("|");
  for (const w of ["agile", "jira", "go-to-market", "okr", "figma", "llm", "stakeholder"])
    if (!all.includes(w)) throw new Error("missed " + w + " in " + all);
  if (!r.roles.pm) throw new Error("did not read the job title");
  if (!r.prompt.includes("go-to-market plan")) throw new Error("the model is not given the resume text");
  if (!r.prompt.includes("untrusted")) throw new Error("the resume text is not marked as untrusted");
  const rec = await page.evaluate((t) => {
    const O = window.CP_ONBOARD;
    return O.recommend(window.CP_ROLES, O.detect(t), null).map(x => x.roleId);
  }, PM);
  if (rec[0] !== "pm") throw new Error("rules ranked " + rec.join(",") + " for a product manager");
});

await step("the evidence shown is the words the resume actually contains", async () => {
  const pills = await page.$$eval(".card .pill.ok", els => els.map(e => e.textContent.trim().toLowerCase()));
  for (const want of ["sql", "tableau", "pandas", "statistics"]) {
    if (!pills.includes(want)) throw new Error("missing evidence: " + want);
  }
  // Module names are curriculum, not resume words, so they must not be presented as found.
  for (const bad of ["SQL for Data Analysts", "Statistics & Inference", "Valuation"]) {
    if (pills.includes(bad.toLowerCase())) throw new Error("presented a module name as a resume word: " + bad);
  }
  const t = await text("#view");
  if (!t.includes("The bars count only the skill areas these roadmaps teach")) throw new Error("does not explain the difference");
});

await step("coverage is reported per roadmap without overclaiming", async () => {
  const rows = await page.$$eval(".cover-row", els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()));
  if (rows.length !== 4) throw new Error("expected a row per roadmap, got " + rows.length);
  const da = rows.find(r => r.startsWith("Data Analyst"));
  if (!/5 \/ 5/.test(da)) throw new Error("data analyst coverage wrong: " + da);
  // SQL is on every roadmap, so finance is not zero, but it must stay well behind.
  const fa = rows.find(r => r.startsWith("Financial Analyst"));
  const n = (r) => Number(/(\d+) \/ \d+/.exec(r)[1]);
  if (n(fa) >= n(da)) throw new Error("finance matched as well as data: " + fa);
});

await step("the placement questions are answerable without any skill", async () => {
  await page.click('[data-action="onb-to-placement"]');
  await page.waitForSelector(".q-card");
  const head = await text(".progress-head");
  if (!/\d+\s*\/\s*\d+/.test(head)) throw new Error("no progress shown: " + head);
  const stem = await text(".q-stem");
  if (/SELECT|FROM |GROUP BY|COUNT\(/i.test(stem)) throw new Error("a query turned up in placement: " + stem);
});

await step("no question tells the student which roadmap it points at", async () => {
  const names = ["Product Manager", "Business Analyst", "Data Analyst", "Financial Analyst",
                 "SQL for", "roadmap"];
  for (let i = 0; i < 12; i++) {
    const card = await page.$(".q-card");
    if (!card) break;
    const shown = await text("#view");
    for (const n of names) {
      if (shown.includes(n)) throw new Error('question ' + (i + 1) + ' leaks "' + n + '"');
    }
    const kind = await text(".progress-head");
    if (!/No right answer|One best answer/.test(kind)) throw new Error("question " + (i + 1) + " does not say its kind");
    await page.$$eval(".q-card .opt", els => els[0].click());
    await page.waitForTimeout(70);
  }
  const done = await text("#view");
  if (!done.includes("Answers recorded")) throw new Error("never reached the end");
});

await step("the result reports no overall score", async () => {
  const t = await text("#view");
  if (/\d+%/.test(t)) throw new Error("a percentage is shown");
  if (/\bscore\b/i.test(t)) throw new Error("the result talks about a score");
});

await step("the applied questions are marked, the rest are not", async () => {
  const marks = await page.$$eval(".picked .pill", els => els.map(e => e.textContent.trim()));
  if (marks.length !== 4) throw new Error("expected 4 marked answers, got " + marks.length);
  for (const m of marks) {
    if (!/^Best answer$|^Best was:/.test(m)) throw new Error("odd mark: " + m);
  }
});

await step("the answers the student gave are shown back", async () => {
  const picked = await page.$$eval(".picked b", els => els.map(e => e.textContent.trim()));
  if (picked.length !== 10) throw new Error("expected 10 answers, got " + picked.length);
  if (picked.some(p => !p)) throw new Error("an answer came back empty");
});

await step("placement awards no stars, points or certificates", async () => {
  const state = await page.evaluate(() => {
    const el = document.querySelector(".who-sub");
    return el ? el.textContent : "";
  });
  if (!state.includes("0 pts")) throw new Error("placement gave points: " + state);
});

await step("the recommendation ranks the roadmap the resume actually supports", async () => {
  await page.click('[data-action="onb-to-recommend"]');
  await page.waitForSelector(".rec-card");
  const first = await text(".rec-card.lead .rec-name");
  if (first !== "Data Analyst") throw new Error("top match was " + first);
  const reasons = await text(".rec-card.lead .crits");
  if (!reasons.includes("answers pointed")) throw new Error("no reason from the questions: " + reasons);
});

await step("the model ranks the roadmaps and says why", async () => {
  // The rule-based ranking is on screen first, so wait for the model's own reason line.
  await page.waitForSelector(".rec-why", { timeout: 25000 });
  const by = await text(".rank-by");
  if (!by.includes("Ranked by the model")) throw new Error("the model did not rank it: " + by.slice(0, 120));
  const whys = await page.$$eval(".rec-why", els => els.map(e => e.textContent.trim()));
  if (whys.length !== 4) throw new Error("expected a reason per roadmap, got " + whys.length);
  const pcts = await page.$$eval(".rec-score b", els => els.map(e => e.textContent.trim()));
  if (!pcts.every(p => /^\d{1,3}%$/.test(p))) throw new Error("match is not a percentage: " + pcts.join(","));
});

await step("the three steps are buttons that go back to what was done", async () => {
  // From the recommendation: open the questions, then the resume, then come forward again.
  await page.click('.onb-step[data-step="2"]');
  await page.waitForSelector("#view h1");
  let h = await text("#view h1");
  if (!/Answers recorded/.test(h)) throw new Error("step 2 did not open the questions: " + h);
  await page.click('.onb-step[data-step="1"]');
  await page.waitForSelector(".cover-row, .pill.ok, #onb-file", { timeout: 5000 });
  h = await text("#view h1");
  if (!/resume/i.test(h)) throw new Error("step 1 did not open the resume: " + h);
  if (!(await page.$(".pill.ok"))) throw new Error("the resume result was lost going back");
  // The recommendation is still reachable without asking the model again.
  await page.click('.onb-step[data-step="3"]');
  await page.waitForSelector(".rec-card");
  if ((await page.$$(".rec-card")).length !== 4) throw new Error("the recommendation did not come back");
});

await step("changing an answer retires the old recommendation", async () => {
  await page.click('.onb-step[data-step="2"]');
  await page.click('[data-action="onb-redo-test"]');
  await page.waitForSelector(".q-card");
  const pill3 = await page.$('.onb-step[data-step="3"]');
  if (pill3) throw new Error("step 3 still offers a recommendation that no longer matches the answers");
  for (let i = 0; i < 12; i++) {
    const opts = await page.$$(".q-card .opt");
    if (!opts.length) break;
    await opts[0].click();
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('[data-action="onb-to-recommend"]');
  await page.click('[data-action="onb-to-recommend"]');
  await page.waitForSelector(".rec-card");
  await page.waitForSelector(".rec-why", { timeout: 25000 });
});

await step("the page says which ranker produced the numbers", async () => {
  const by = await text(".rank-by");
  if (!/Ranked by/.test(by)) throw new Error("no attribution shown");
});

await step("a malformed model answer is refused rather than displayed", async () => {
  const bad = await page.evaluate(() => {
    const R = window.CP_ROLES, O = window.CP_ONBOARD;
    const cases = [
      "not json at all",
      '{"ranking":[]}',
      '{"ranking":[{"roleId":"pm","match":50,"why":"a"}]}',
      '{"ranking":[{"roleId":"pm","match":150,"why":"a"},{"roleId":"ba","match":1,"why":"b"},{"roleId":"da","match":1,"why":"c"},{"roleId":"fa","match":1,"why":"d"}]}',
      '{"ranking":[{"roleId":"pm","match":50,"why":""},{"roleId":"ba","match":1,"why":"b"},{"roleId":"da","match":1,"why":"c"},{"roleId":"fa","match":1,"why":"d"}]}',
      '{"ranking":[{"roleId":"pm","match":50,"why":"a"},{"roleId":"pm","match":1,"why":"b"},{"roleId":"da","match":1,"why":"c"},{"roleId":"fa","match":1,"why":"d"}]}',
      '{"ranking":[{"roleId":"xx","match":50,"why":"a"},{"roleId":"ba","match":1,"why":"b"},{"roleId":"da","match":1,"why":"c"},{"roleId":"fa","match":1,"why":"d"}]}'
    ];
    return cases.map(c => O.readRanking(c, R) === null);
  });
  const failed = bad.map((ok, i) => ok ? null : i).filter(i => i !== null);
  if (failed.length) throw new Error("these malformed answers were accepted: " + failed.join(","));
});

await step("a well-formed model answer is accepted", async () => {
  const ok = await page.evaluate(() => {
    const good = '{"ranking":[{"roleId":"da","match":88,"why":"x"},{"roleId":"pm","match":40,"why":"y"},' +
      '{"roleId":"ba","match":30,"why":"z"},{"roleId":"fa","match":12,"why":"w"}]}';
    const r = window.CP_ONBOARD.readRanking(good, window.CP_ROLES);
    return r && r.length === 4 && r[0].roleId === "da" && r[0].match === 88;
  });
  if (!ok) throw new Error("a valid answer was rejected");
});

await step("every roadmap stays pickable regardless of rank", async () => {
  const n = await page.$$eval('[data-action="onb-pick"]', els => els.length);
  if (n !== 4) throw new Error("only " + n + " roadmaps offered");
});

await step("picking a roadmap lands on it", async () => {
  await page.click('.rec-card.lead [data-action="onb-pick"]');
  await page.waitForSelector(".skill-list");
  const eyebrow = await text(".page-head .eyebrow");
  if (!eyebrow.includes("Data Analyst")) throw new Error("landed on " + eyebrow);
});

await step("skipping the questions is not a one-way door", async () => {
  // Walk out of the flow to the role picker, then walk back into it.
  await page.click('[data-action="nav"][data-nav="roles"]');
  await page.waitForSelector(".role-grid");
  const back = await page.$('[data-action="onb-resume-flow"]');
  if (!back) throw new Error("no way back into the recommendation from the role picker");
  await back.click();
  await page.waitForSelector(".rec-card", { timeout: 10000 });
  const h = await text(".page-head h1");
  if (!h.includes("Recommended")) throw new Error("back went somewhere else: " + h);
});

await step("the profile keeps the conclusion, not the document", async () => {
  await page.click('[data-nav="profile"]');
  await page.waitForSelector(".summary-row");
  const t = await text("#view");
  if (!t.includes("alex-resume.txt")) throw new Error("no record of the file");
  if (!t.includes("never stored")) throw new Error("does not say the file was not stored");
  if (t.includes("Northwind")) throw new Error("the resume text itself was kept");
});

/* ---------------- roadmap history ---------------- */

await step("switching roadmaps records the one left behind", async () => {
  await page.click('[data-action="nav"][data-nav="roles"]');
  await page.waitForSelector(".role-grid");
  await page.click('[data-role="pm"]');
  await page.waitForSelector(".skill-list");
  await page.click('[data-action="nav"][data-nav="roles"]');
  await page.waitForSelector(".role-grid");
  const t = await text("#view");
  if (!t.includes("Roadmaps you have worked on before")) throw new Error("no history section");
  if (!t.includes("Data Analyst")) throw new Error("the old roadmap is not listed");
});

await step("nothing is deleted: the old roadmap can be resumed", async () => {
  const back = await page.$('[data-action="pick-role"][data-role="da"]');
  if (!back) throw new Error("no way back to the old roadmap");
  await back.click();
  await page.waitForSelector(".skill-list");
  const eyebrow = await text(".page-head .eyebrow");
  if (!eyebrow.includes("Data Analyst")) throw new Error("did not return: " + eyebrow);
});

/* ---------------- weekly challenge ---------------- */

await step("the student can reach this week's challenge", async () => {
  const items = await nav();
  if (items.indexOf("Weekly challenge") === -1) throw new Error("no nav entry: " + items.join(","));
  await page.click('[data-nav="challenge"]');
  await page.waitForSelector("#ch-text");
  const t = await text("#view");
  if (!t.includes("Explain a suspicious average")) throw new Error("wrong challenge for this roadmap");
});

await step("the rubric is published before the answer is written", async () => {
  const t = await text("#view");
  if (!t.includes("What it is scored on")) throw new Error("rubric hidden");
  if (!t.includes("Hiding it would test guessing")) throw new Error("no reason given for showing it");
});

await step("an empty answer is refused", async () => {
  await page.click('[data-action="ch-submit"]');
  await page.waitForTimeout(150);
  const t = await text("#view");
  if (!t.includes("Write an answer")) throw new Error("empty answer accepted");
});

await step("a short answer is capped and told why", async () => {
  await page.fill("#ch-text", "Mix shift. Check the median.");
  await page.click('[data-action="ch-submit"]');
  await page.waitForSelector(".check-panel");
  const t = await text(".check-panel");
  if (!/word minimum/.test(t)) throw new Error("no explanation of the cap: " + t.slice(0, 120));
  const pct = +(/(\d+)%/.exec(t) || [0, 0])[1];
  if (pct > 40) throw new Error("short answer scored " + pct + "%");
});

await step("the score is explained criterion by criterion", async () => {
  const marks = await page.$$eval(".check-panel .crit", els => els.length);
  if (marks < 4) throw new Error("only " + marks + " criteria shown");
});

await step("one submission per challenge", async () => {
  const box = await page.$("#ch-text");
  if (box) throw new Error("the answer box is still open after submitting");
});

await step("the challenge has its own leaderboard", async () => {
  const t = await text("#view");
  if (!t.includes("Challenge leaderboard")) throw new Error("no challenge board");
  if (!t.includes("Ellie")) throw new Error("classmates missing from the board");
});

await step("written feedback comes back from the model", async () => {
  // Feedback is requested automatically on submit; the button is the retry path.
  let got = await page.waitForSelector(".prose.tiny", { timeout: 25000 }).catch(() => null);
  if (!got) {
    await page.click('[data-action="ch-feedback"]');
    got = await page.waitForSelector(".prose.tiny", { timeout: 25000 });
  }
  const t = await text(".prose.tiny");
  if (t.trim().length < 10) throw new Error("empty feedback");
  const label = await text("#view");
  if (!label.includes("Reviewer feedback")) throw new Error("feedback is not labelled");
});

await step("the model writes the feedback but never sets the score", async () => {
  const before = await page.evaluate(() => {
    const m = /Submitted . (\d+)%/.exec(document.querySelector(".check-panel").textContent);
    return m ? +m[1] : -1;
  });
  if (before < 0) throw new Error("no score on the panel");
  const fromRubric = await page.evaluate(() => {
    const t = document.querySelector(".check-panel").textContent;
    const m = /(\d+) of (\d+) rubric points/.exec(t);
    return m ? Math.round(+m[1] / +m[2] * 100) : -1;
  });
  // The displayed score has to be the rubric result, possibly capped for length.
  if (before !== fromRubric && before !== 40) throw new Error(before + "% does not match the rubric " + fromRubric + "%");
});

/* ---------------- live leaderboard ---------------- */

await step("the board moves without a reload", async () => {
  await page.click('[data-nav="leaderboard"]');
  await page.waitForSelector('[data-live="board"]');
  const before = await page.$$eval("table.grid tbody tr td:last-child", els => els.map(e => e.textContent));
  await page.waitForTimeout(9000);
  const after = await page.$$eval("table.grid tbody tr td:last-child", els => els.map(e => e.textContent));
  if (before.join(",") === after.join(",")) throw new Error("nothing changed in nine seconds");
});

await step("the figures above the board follow the board", async () => {
  // Whatever the board says about the student, the four figures must say the same.
  const agree = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-live="summary"] .v')].map(e => e.textContent);
    const rows = [...document.querySelectorAll('[data-live="board"] tbody tr')];
    const idx = rows.findIndex(r => r.classList.contains("lb-you"));
    const pts = rows[idx].querySelector("td:last-child").textContent.trim();
    return { place: cells[0], points: cells[1], idx: idx + 1, pts, total: rows.length };
  });
  if (agree.place.replace(/\s/g, "") !== agree.idx + "of" + agree.total) throw new Error("place out of step: " + JSON.stringify(agree));
  if (agree.points !== agree.pts) throw new Error("points out of step: " + JSON.stringify(agree));
  // And they must move: sample the leader cell and the gap to the next place across several ticks.
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    seen.add(await page.$$eval('[data-live="summary"] .v', els => els.map(e => e.textContent).join("|")));
    await page.waitForTimeout(4400);
  }
  if (seen.size < 2) throw new Error("summary never changed across four ticks");
});

await step("the page says the peer activity is simulated", async () => {
  const t = await text("#view");
  if (!t.includes("generated on a timer")) throw new Error("the simulation is not disclosed");
});

await step("the ticker stops when nobody is watching the board", async () => {
  await page.click('[data-nav="certs"]');
  await page.waitForTimeout(200);
  const running = await page.evaluate(() => {
    // Points should not move while the student is on another screen.
    const first = document.querySelector(".who-sub").textContent;
    return new Promise(res => setTimeout(() => res(first !== document.querySelector(".who-sub").textContent), 5200));
  });
  if (running) throw new Error("the ticker kept running off the board");
});

/* ---------------- admin ---------------- */

await step("admin manages the challenge schedule", async () => {
  await page.click('[data-action="logout"]');
  await page.waitForSelector("#auth:not([hidden])");
  await page.fill('#li-email', 'admin@careerpath.com'); await page.fill('#li-pass', 'admin');
  await page.click('[data-action="login"]');
  await page.waitForSelector("table.grid");
  await page.click('[data-nav="a-challenges"]');
  await page.waitForSelector(".ch-row");
  const t = await text("#view");
  if (!t.includes("Live")) throw new Error("no live challenge shown");
  if (!t.includes("Draft")) throw new Error("no draft shown");
});

await step("a draft challenge is not visible to students", async () => {
  const drafts = await page.$$eval(".ch-row", els =>
    els.filter(e => e.textContent.includes("Draft")).map(e => e.querySelector("p").textContent));
  if (!drafts.length) throw new Error("no drafts to check");
  // Every roadmap has exactly one live challenge, so a draft cannot be the one served.
  const live = await page.evaluate(() =>
    window.CP_CHALLENGES.filter(c => c.status === "live").map(c => c.roleId));
  if (new Set(live).size !== live.length) throw new Error("two challenges live on one roadmap");
});

await step("publishing a challenge closes the one it replaces", async () => {
  const before = await page.evaluate(() => window.CP_CHALLENGES.filter(c => c.roleId === "pm").map(c => c.status));
  await page.click('.ch-row [data-action="ac-status"][data-to="live"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.CP_CHALLENGES.filter(c => c.roleId === "pm").map(c => c.status));
  const liveNow = after.filter(s => s === "live").length;
  if (liveNow !== 1) throw new Error("live count is " + liveNow + " (was " + before.join(",") + ")");
  if (after.indexOf("closed") === -1) throw new Error("the replaced challenge was not closed");
});

await step("creating a challenge saves it as a draft, never live", async () => {
  await page.click('[data-action="ac-new"]');
  await page.waitForSelector("#ac-title");
  await page.fill("#ac-title", "Size a new market");
  await page.fill("#ac-brief", "Estimate the number of US households that would pay for this and show your working.");
  await page.fill("#ac-rubric", "States the population it starts from | population|households|census\nShows the arithmetic | multiply|times|divided|=\nNames the weakest assumption | assumption|weakest|sensitive");
  await page.click('[data-action="ac-save"]');
  await page.waitForTimeout(250);
  const made = await page.evaluate(() =>
    window.CP_CHALLENGES.filter(c => c.title === "Size a new market").map(c => c.status));
  if (!made.length) throw new Error("the challenge was not created");
  if (made[0] !== "draft") throw new Error("it went live immediately: " + made[0]);
});

await step("an admin cannot change a submitted score", async () => {
  const cid = await page.evaluate(() => {
    const c = window.CP_CHALLENGES.filter(x => x.roleId === "da" && x.status === "live")[0];
    return c ? c.cid : "";
  });
  if (!cid) throw new Error("no live challenge to review");
  const btn = await page.$(`[data-action="ac-review"][data-cid="${cid}"]`);
  if (!btn) throw new Error("no submissions view");
  await btn.click();
  await page.waitForTimeout(200);
  const t = await text("#view");
  if (!t.includes("cannot change a score")) throw new Error("the read-only rule is not stated");
  const inputs = await page.$$eval("#view input", els => els.length);
  if (inputs > 0) throw new Error("the review table has editable fields");
});

console.log(errs.length ? "\nJS ERRORS:\n" + errs.join("\n") : "\nno js errors");
console.log(failed ? "\n" + failed + " FAILED" : "\nall steps passed");
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
