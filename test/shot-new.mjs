/* Visual pass over the new screens. Screenshots go to shots/ so they can be
   looked at, because a page that is merely free of errors can still be ugly. */
import { chromium } from "playwright";

const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const RES = "/tmp/claude-0/-home-claude/d033872e-969c-5be4-900f-f11172b5adc1/scratchpad/res/resume.pdf";
const errs = [];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1340, height: 980 } });
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });

const shot = (n) => page.screenshot({ path: OUT + n + ".png", fullPage: true });

await page.goto(B);
await page.click('[data-action="login"]');
await page.waitForSelector(".skill-list");
await shot("01-roadmap");

await page.click('[data-nav="leaderboard"]');
await page.waitForSelector('[data-live="board"]');
await page.waitForTimeout(5200);
await shot("02-leaderboard-live");

await page.click('[data-nav="challenge"]');
await page.waitForSelector("#ch-text");
await shot("03-challenge");

await page.fill("#ch-text",
  "I would start by segmenting the drop by acquisition channel and by platform, because a single retention " +
  "number hides a mix shift. First I would check whether the channel mix changed, since paid traffic from a new " +
  "campaign retains worse than organic and that alone would explain the fall without anything being broken in " +
  "the product. Second I would check instrumentation, because a broken event would show as a retention drop " +
  "that never happened; if the activation event stopped firing on one platform the curve falls for a reason " +
  "that is not real. Third I would compare cohorts week over week rather than looking at the blended figure, " +
  "which would rule out a one-week anomaly. Each of these would rule something in or out before I touch the " +
  "product itself.");
await page.click('[data-action="ch-submit"]');
await page.waitForSelector(".check-panel");
await page.waitForTimeout(500);
await shot("04-challenge-scored");

await page.click('[data-nav="profile"]');
await page.waitForSelector(".summary-row");
await shot("05-profile");

await page.click('[data-action="onb-open"]');
await page.waitForSelector("#onb-file");
await shot("06-onb-upload");

await page.setInputFiles("#onb-file", RES);
await page.waitForSelector(".cover-row", { timeout: 20000 });
await shot("07-onb-read");

await page.click('[data-action="onb-to-placement"]');
await page.waitForSelector(".q-card");
await shot("08-onb-placement");

for (let i = 0; i < 12; i++) {
  const opts = await page.$$(".q-card .opt");
  if (!opts.length) break;
  await opts[0].click();
  await page.waitForTimeout(80);
}
await page.waitForSelector('[data-action="onb-to-recommend"]');
await shot("09-onb-result");

await page.click('[data-action="onb-to-recommend"]');
await page.waitForSelector(".rec-card");
await shot("10-onb-recommend");

// Pick the roadmap that is NOT the current one, so history has something in it.
const buttons = await page.$$('[data-action="onb-pick"]');
let picked = false;
for (const b of buttons) {
  if ((await b.getAttribute("data-role")) !== "pm") { await b.click(); picked = true; break; }
}
if (!picked) await buttons[0].click();
await page.waitForSelector(".skill-list");
await shot("11-roadmap-after-switch");

await page.click('[data-action="nav"][data-nav="roles"]');
await page.waitForSelector(".role-grid");
await shot("12-roles-with-history");

await page.click('[data-action="logout"]');
await page.fill('#li-email', 'admin@careerpath.com'); await page.fill('#li-pass', 'admin');
await page.click('[data-action="login"]');
await page.waitForSelector("table.grid");
await page.click('[data-nav="a-challenges"]');
await page.waitForSelector(".ch-row");
await shot("13-admin-challenges");

await page.click('[data-action="ac-new"]');
await page.waitForSelector("#ac-title");
await shot("14-admin-ch-new");

const m = await browser.newPage({ viewport: { width: 400, height: 860 } });
m.on("pageerror", e => errs.push("mobile pageerror: " + e.message));
await m.goto(B);
await m.click('[data-action="login"]');
await m.waitForSelector(".skill-list");
await m.screenshot({ path: OUT + "15-mobile-roadmap.png", fullPage: true });
await m.click('.mb-nav [data-nav="challenge"]');
await m.waitForSelector("#ch-text");
await m.screenshot({ path: OUT + "16-mobile-challenge.png", fullPage: true });

console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console or page errors");
await browser.close();
