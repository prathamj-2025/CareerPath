/* Roadmap progress view: light and dark at 1280px, and 390px wide on a phone. */
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const [scheme, w, h, name] of [["light", 1280, 900, "P-light-1280"], ["dark", 1280, 900, "P-dark-1280"],
                                    ["light", 390, 800, "P-light-390"], ["dark", 390, 800, "P-dark-390"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
  await page.goto(B); await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list");
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + name + ".png", fullPage: true });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(name, "h-scroll:", ov);
  if (w === 1280 && scheme === "light") {
    // Same page with the study assistant undocked, so the list gets its full-width row layout.
    const hide = await page.$("#tutor-undock:not([hidden])");
    if (hide) { await hide.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: OUT + "P-light-1280-wide.png", fullPage: true });
  }
  await page.close();
}
await browser.close();
