/* PM course content: lesson rendering (tables, code, callouts) and the skill page. */
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  await page.goto(B); await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list");
  await page.screenshot({ path: `${OUT}C-${scheme}-roadmap.png`, fullPage: true });
  await page.locator(".skill-row").first().click(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}C-${scheme}-skill.png`, fullPage: true });
  await page.click('[data-action="start-learn"]'); await page.waitForTimeout(200);
  await page.click('[data-action="lesson"][data-i="2"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}C-${scheme}-lesson.png`, fullPage: true });
  await page.close();
}
await browser.close(); console.log("ok");
