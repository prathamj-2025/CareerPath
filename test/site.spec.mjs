/* The top-bar role switcher, the logo, the roadmap page layout and the website pages.
   Needs the demo server (PORT 3111) for the app and, for the footer, the real-mode server (3114, see accounts.spec.mjs). */
import { chromium } from 'playwright';

const DEMO = process.env.BASE || 'http://localhost:3111';
const REAL = process.env.REAL_URL || 'http://localhost:3114';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };
const wait = (p) => p.waitForTimeout(150);

async function signedIn(width = 1280, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('cp-tutor-dock', '0'); } catch (e) {} });
  await page.goto(DEMO + '/');
  await page.click('[data-action="login"]');
  await page.waitForSelector('.skill-list');
  return page;
}
const pill = (page) => page.textContent(width(page) > 860 ? '#sidebar .role-btn span' : '#mobilebar .role-btn span');
const width = (page) => page.viewportSize().width;
const bar = (page) => width(page) > 860 ? '#sidebar' : '#mobilebar';

const page = await signedIn();

await step('the logo opens the homepage from any page', async () => {
  await page.click('[data-nav="leaderboard"]'); await wait(page);
  need(!(await page.$('.skill-list')), 'did not leave the roadmap');
  await page.click('#sidebar .brand'); await wait(page);
  need(await page.$('.skill-list'), 'logo did not return to the roadmap');
  need((await page.getAttribute('#sidebar [data-nav="roadmap"]', 'aria-current')) === 'true', 'roadmap not marked current');
});

await step('the roadmap page no longer carries the order note or a bottom Change role button', async () => {
  const txt = await page.textContent('#view');
  need(!/can be opened/.test(txt), 'order note is still there');
  need(!/Open a main module to see/.test(txt), 'module note is still there');
  need(!(await page.$('.rm-foot')), 'old footer row still rendered');
  need(!(await page.$('#view [data-nav="roles"]')), 'Change role button still on the page');
});

await step('the left column is filled: how stars work and certificates you can earn', async () => {
  const cards = await page.$$eval('.ex-card h3', els => els.map(e => e.textContent));
  need(cards.join('|') === 'How stars work|Certificates you can earn', cards.join('|'));
  need((await page.$$('.ex-levels li')).length === 5, 'five star levels expected');
});

await step('no row text runs past its own row', async () => {
  for (const w of [1280, 1100, 960]) {
    await page.setViewportSize({ width: w, height: 900 }); await wait(page);
    const bad = await page.$$eval('.rm-row', rows => rows.flatMap(r => {
      const rb = r.getBoundingClientRect();
      return [...r.querySelectorAll('.rm-note, .rm-chip, .rm-chev, .skill-lens')]
        .filter(e => e.getBoundingClientRect().right > rb.right + 0.5).map(e => e.className);
    }));
    need(!bad.length, 'overflow at ' + w + ': ' + bad.join(','));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step('the role pill opens a menu of every roadmap with its match score', async () => {
  need(/product manager/i.test(await pill(page)), 'pill = ' + await pill(page));
  need(!(await page.isVisible('#sidebar .role-menu')), 'menu open at rest');
  await page.click('#sidebar .role-btn'); await wait(page);
  const opts = await page.$$eval('#sidebar .role-opt', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  need(opts.length === 3, 'options = ' + opts.length);
  need(/Product Manager.*86%/.test(opts[0]) && /Current/.test(opts[0]), opts[0]);
  need(/Project Manager.*41%/.test(opts[1]), opts[1]);
  need(/Business Analyst.*38%/.test(opts[2]), opts[2]);
  need((await page.getAttribute('#sidebar .role-btn', 'aria-expanded')) === 'true', 'aria-expanded');
});

await step('Escape and an outside click close it', async () => {
  await page.keyboard.press('Escape'); await wait(page);
  need(!(await page.isVisible('#sidebar .role-menu')), 'Escape did not close');
  await page.click('#sidebar .role-btn'); await wait(page);
  await page.click('#view h1'); await wait(page);
  need(!(await page.isVisible('#sidebar .role-menu')), 'outside click did not close');
});

await step('choosing a roadmap from the menu switches the role and keeps the old stars', async () => {
  const before = await page.textContent('[data-nav="roadmap"] .nav-count');
  await page.click('#sidebar .role-btn');
  await page.click('#sidebar .role-opt[data-role="pjm"]'); await wait(page);
  need(/project manager/i.test(await pill(page)), 'pill = ' + await pill(page));
  need(/Project Manager roadmap/i.test(await page.textContent('.eyebrow')), 'page did not change roadmap');
  await page.click('#sidebar .role-btn');
  await page.click('#sidebar .role-opt[data-role="pm"]'); await wait(page);
  need((await page.textContent('[data-nav="roadmap"] .nav-count')) === before, 'stars lost when switching back');
});

await step('the study assistant does not name the roadmap or which model answers', async () => {
  await page.click('#tutor-launch'); await wait(page);
  need((await page.textContent('#tutor-sub')).trim() === '', 'sub = ' + await page.textContent('#tutor-sub'));
  need(!(await page.$('#tutor-note')), 'note still there');
  await page.click('[data-tutor="close"]');
});

await step('the compare roadmaps link opens the role picker', async () => {
  await page.click('#sidebar .role-btn'); await page.click('#sidebar [data-nav="roles"]'); await wait(page);
  need(await page.$('.role-card[data-role="ba"]'), 'role picker not shown');
  await page.click('#sidebar .brand'); await wait(page);
  need(await page.$('.skill-list'), 'logo did not return home from the picker');
});

await step('the Business Analyst roadmap has its own filled layout', async () => {
  await page.click('#sidebar .role-btn'); await page.click('#sidebar .role-opt[data-role="ba"]'); await wait(page);
  const t = await page.textContent('#view');
  need(!/Any skill can be opened/.test(t), 'note remains on BA page');
  const cards = await page.$$eval('.ex-card h3', els => els.map(e => e.textContent));
  need(cards[0] === 'How stars work' && cards[1] === 'Recent results', cards.join('|'));
});
need(!page.errs.length, 'js errors: ' + page.errs.join(' | '));
await page.close();

const m = await signedIn(390, 800);
await step('on a phone the role switcher sits in the top bar and fits the screen', async () => {
  need(/product manager|product man/i.test(await pill(m)), 'pill');
  await m.click('#mobilebar .role-btn'); await wait(m);
  const r = await m.$eval('#mobilebar .role-menu', e => { const b = e.getBoundingClientRect(); return [b.left, b.right]; });
  need(r[0] >= 0 && r[1] <= 390, 'menu leaves the screen: ' + r);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  need(over <= 0, 'horizontal scroll ' + over);
  const top = await m.$eval('#mobilebar .mb-top', e => e.getBoundingClientRect().height);
  need(top < 70, 'top bar wrapped onto two lines: ' + top);
  await m.click('#mobilebar .role-opt[data-role="pjm"]'); await wait(m);
  need(/project/i.test(await pill(m)), 'switch from phone failed');
});
await m.close();

/* ---- website pages (static files, served by either server) ---- */
const pages = { 'about.html': 'About CareerPath', 'faq.html': 'Frequently asked questions', 'help.html': 'Help and support',
  'contact.html': 'Contact us', 'terms.html': 'Terms of use', 'privacy.html': 'Privacy policy' };
for (const [file, h1] of Object.entries(pages)) {
  await step('website page ' + file + ' loads with header, footer and no errors', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const res = await p.goto(DEMO + '/' + file);
    need(res.status() === 200, 'status ' + res.status());
    need((await p.textContent('h1')).trim() === h1, 'h1 = ' + await p.textContent('h1'));
    need((await p.$$('.site-head nav a')).length === 4, 'header links');
    need((await p.$$('.site-foot nav a')).length === 6, 'footer links');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    need(over <= 0, 'horizontal scroll at desktop width');
    await p.setViewportSize({ width: 380, height: 800 });
    const over2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    need(over2 <= 0, 'horizontal scroll on a phone: ' + over2);
    need(!errs.length, errs.join('|'));
    await p.close();
  });
}
await step('the FAQ has real answers and the contact page has an address to write to', async () => {
  const p = await browser.newPage();
  await p.goto(DEMO + '/faq.html');
  need((await p.$$('details')).length >= 12, 'too few questions');
  need(!/prototype/i.test(await p.textContent('main')), 'still calls itself a prototype');
  await p.goto(DEMO + '/contact.html');
  need((await p.$$('a.support-email[href^="mailto:"]')).length >= 3, 'no mailto links');
  need((await p.textContent('main')).includes('careerpath531@gmail.com'), 'contact address is not the CareerPath mailbox');
  await p.goto(DEMO + '/privacy.html');
  const t = await p.textContent('main');
  need(!/no database|only in your own browser/i.test(t), 'privacy page still says there is no database');
  need(/Supabase/.test(t) && /delete your account/i.test(t), 'privacy page does not describe the real storage');
  await p.close();
});

await step('on a real deployment the sign-in page links to every website page', async () => {
  const p = await browser.newPage();
  let up = true; try { await p.goto(REAL + '/', { timeout: 4000 }); } catch (e) { up = false; }
  if (!up) { console.log('     (real-mode server not running, skipped)'); await p.close(); return; }
  await p.waitForSelector('#auth:not([hidden])');
  const hrefs = await p.$$eval('#auth .site-links a', as => as.map(a => a.getAttribute('href')));
  need(hrefs.join() === 'about.html,faq.html,help.html,contact.html,privacy.html,terms.html', hrefs.join());
  await p.close();
});

await browser.close();
console.log(failed ? failed + ' FAILED' : 'all steps passed');
process.exit(failed ? 1 : 0);
