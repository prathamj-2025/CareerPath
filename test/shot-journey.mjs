/* Journey restyle: landing, roadmap, skill, lesson, quiz, results, profile in both themes. */
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const s = (n) => page.screenshot({ path: `${OUT}J-${scheme}-${n}.png`, fullPage: true });
  await page.goto(B); await s("1-landing");
  await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list"); await page.waitForTimeout(300);
  await s("2-roadmap");
  await page.click(".skill-row"); await page.waitForTimeout(300); await s("3-skill");
  await page.click('[data-nav="profile"]'); await page.waitForSelector(".summary-row"); await s("4-profile");
  await page.close();
}
await browser.close(); console.log("ok");
