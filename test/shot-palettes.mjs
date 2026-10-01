import { chromium } from "playwright";
const B = "http://localhost:3111";
const OUT = new URL("../shots/", import.meta.url).pathname;
const P = {
  A: { l: ["#166534", "#E5EFE8"], d: ["#3BA374", "#14281D"] },
  B: { l: ["#14532D", "#E3ECE6"], d: ["#2F9461", "#13251B"] },
  C: { l: ["#2F6B4F", "#E6EEE9"], d: ["#6FAE8D", "#16241D"] },
  D: { l: ["#1F5A44", "#E3EDE8"], d: ["#4DA386", "#122620"] },
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
for (const [k, v] of Object.entries(P)) for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, colorScheme: scheme });
  const [a, t] = v[scheme[0]];
  await page.goto(B); await page.click('[data-action="login"]'); await page.waitForSelector(".skill-list");
  await page.addStyleTag({ content: `:root,:root[data-theme]{--accent:${a}!important;--ok:${a}!important;--accent-soft:${t}!important;--ok-soft:${t}!important}` });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}pal-${k}-${scheme}.png` });
  await page.close();
}
await browser.close();
