/* Reproduce the floating assistant panel over page content. */
import { chromium } from "playwright";

const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

for (const w of [1000, 860, 1200]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(B);
  await page.click('[data-action="login"]');
  await page.waitForSelector(".skill-list");
  for (const sel of ['#sidebar [data-nav="profile"]', '.mb-nav [data-nav="profile"]']) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) { await el.click(); break; }
  }
  await page.waitForSelector(".summary-row");
  const docked0 = await page.evaluate(() => document.body.classList.contains("tutor-docked"));
  if (!docked0) {
    const open = await page.$("#tutor-launch");
    if (open && await open.isVisible()) await open.click().catch(() => {});
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}P-panel-${w}.png` });
  const docked = await page.evaluate(() => document.body.classList.contains("tutor-docked"));
  console.log(`${w}px  docked=${docked}`);
  await page.close();
}
await browser.close();
