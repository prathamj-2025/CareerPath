/* Type scale, practice gating and the practical project: screenshots for a visual check. */
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  await page.goto(B); await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list, .rm-row");
  await page.locator('[data-action="open-skill"]').first().click(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}T-${scheme}-skill.png`, fullPage: true });
  await page.click('[data-action="start-learn"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}T-${scheme}-lesson.png`, fullPage: true });
  const n = await page.locator('.lesson-nav button').count();
  await page.click(`[data-action="lesson"][data-i="${n - 1}"]`); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}T-${scheme}-lastlesson.png`, fullPage: true });
  await page.click('#tutor-launch').catch(() => {}); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}T-${scheme}-tutor.png` });
  await page.close();
}
await browser.close(); console.log("ok");
