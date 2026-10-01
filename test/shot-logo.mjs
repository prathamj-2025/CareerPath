import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
for (const [name, scheme] of [["logo-light", "light"], ["logo-dark", "dark"]]) {
  const p = await b.newPage({ viewport: { width: 1100, height: 1200 }, colorScheme: scheme });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file:///home/claude/logo-options/preview.html");
  await p.waitForSelector(".opt");
  await p.screenshot({ path: `/home/claude/careerpath-web/shots/${name}.png`, fullPage: true });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(name, "overflow:", over, errs.length ? "ERR " + errs.join(";") : "");
  await p.close();
}
const m = await b.newPage({ viewport: { width: 400, height: 900 } });
await m.goto("file:///home/claude/logo-options/preview.html");
await m.waitForSelector(".opt");
const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("mobile overflow:", over);
await m.screenshot({ path: "/home/claude/careerpath-web/shots/logo-mobile.png", fullPage: true });
await b.close();
