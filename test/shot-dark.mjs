/* Dark mode. Every new surface uses the theme tokens, so this is checking that
   claim rather than trusting it. */
import { chromium } from "playwright";

const B = process.env.BASE || "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });

await page.goto(B);
await page.screenshot({ path: OUT + "D0-signin-dark.png", fullPage: true });

await page.click('[data-action="login"]');
await page.waitForSelector(".skill-list");
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + "D1-roadmap-dark.png", fullPage: true });

await page.click('[data-nav="challenge"]');
await page.waitForSelector("#ch-text");
await page.screenshot({ path: OUT + "D2-challenge-dark.png", fullPage: true });

await page.click('[data-nav="profile"]');
await page.waitForSelector(".summary-row");
await page.click('[data-action="onb-open"]');
await page.waitForSelector("#onb-file");
await page.screenshot({ path: OUT + "D3-onboard-dark.png", fullPage: true });

await browser.close();
console.log("dark shots written");
