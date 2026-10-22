/* Layout pass: the same screens with the assistant hidden, at three widths.
   The rail has to behave in all of them. */
import { chromium } from "playwright";

const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

async function run(name, width, hideAssistant) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  if (hideAssistant) {
    await page.addInitScript(() => {
      try { localStorage.setItem("cp-tutor-dock", "0"); } catch (e) {}
    });
  }
  await page.goto(B);
  await page.click('[data-action="login"]');
  await page.waitForSelector(".skill-list");
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + name + ".png", fullPage: true });
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.close();
  return over;
}

const checks = [
  ["L1-wide-no-assistant", 1440, true],
  ["L2-laptop-no-assistant", 1180, true],
  ["L3-tablet", 900, true],
  ["L4-narrow-docked", 1200, false]
];

for (const [name, w, hide] of checks) {
  const over = await run(name, w, hide);
  console.log((over > 1 ? "OVERFLOW " + over + "px  " : "ok         ") + name + " @" + w);
}

await browser.close();
