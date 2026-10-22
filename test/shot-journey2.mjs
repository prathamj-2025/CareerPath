import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const s = (n) => page.screenshot({ path: `${OUT}J-${scheme}-${n}.png`, fullPage: true });
  await page.goto(B); await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list");
  await page.locator(".skill-row").nth(2).click(); await page.waitForTimeout(200);
  await page.click('[data-action="start-exam"]'); await page.waitForSelector('[data-action="exam-answer"]');
  await page.locator('[data-action="exam-answer"]').first().click(); await page.waitForTimeout(200);
  await s("6-exam");
  for (let k = 0; k < 40; k++) {
    if (!(await page.locator('[data-action="exam-answer"]').count())) break;
    await page.locator('[data-action="exam-answer"]').first().click(); await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400); await s("7-result");
  await page.close();
}
await browser.close(); console.log("ok");
