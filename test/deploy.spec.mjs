/* End-to-end test of the deployed shape: static files from public/, assistant via /api/ask. */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', r => errs.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};

await step('the static site loads with every asset', async () => {
  const res = await page.goto(BASE + '/');
  if (!res.ok()) throw new Error('index status ' + res.status());
  await page.waitForTimeout(400);
  const loaded = await page.evaluate(() => ({
    roles: (window.CP_ROLES || []).length,
    skills: (window.CP_ROLES || []).reduce((a, r) => a + r.skills.length, 0),
    checks: (window.CP_ROLES || []).every(r => r.skills.every(s => s.practice.every(p => p.check)))
  }));
  if (loaded.roles !== 4) throw new Error('roles = ' + loaded.roles);
  if (loaded.skills !== 21) throw new Error('skills = ' + loaded.skills);
  if (!loaded.checks) throw new Error('practice checks missing: a data file did not load');
  const title = await page.title();
  if (title !== 'CareerPath') throw new Error('title = ' + title);
});

await step('doctype, charset and viewport are present', async () => {
  const meta = await page.evaluate(() => ({
    doctype: document.doctype ? document.doctype.name : null,
    charset: document.characterSet,
    viewport: document.querySelector('meta[name=viewport]')?.content || '',
    headStyles: document.head.querySelectorAll('style').length,
    strayInBody: document.body.querySelectorAll('title, link[rel=stylesheet]').length
  }));
  if (meta.doctype !== 'html') throw new Error('no doctype');
  if (!/UTF-8/i.test(meta.charset)) throw new Error('charset = ' + meta.charset);
  if (!/viewport-fit=cover/.test(meta.viewport)) throw new Error('viewport = ' + meta.viewport);
  if (meta.headStyles < 2) throw new Error('styles not in head: ' + meta.headStyles);
  if (meta.strayInBody) throw new Error('title or stylesheet left in body');
});

await step('stars render as characters, not mojibake', async () => {
  await page.click('[data-action="login"]');
  await page.waitForTimeout(300);
  const legend = await page.textContent('.page-head ~ .row p, .page-head + * p') .catch(() => '');
  const body = await page.textContent('#view');
  if (body.includes('â')) throw new Error('encoding broken somewhere in the view');
  if (!body.includes('★')) throw new Error('no star glyphs found');
});

await step('the core student flow works on the deployed build', async () => {
  const key = await page.evaluate(() =>
    window.CP_ROLES[0].skills[2].assessment.map(q => q.a));
  await page.click('.skill-row:nth-child(3)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(200);
  for (const a of key) {
    const opts = await page.$$('[data-action="exam-answer"]');
    await opts[a].click();
    await page.waitForTimeout(40);
  }
  const h = await page.textContent('.page-head h1');
  if (!h.includes('100%')) throw new Error('exam result = ' + h);
});

await step('assistant uses /api/ask and streams the reply', async () => {
  await page.click('[data-nav="roadmap"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-learn"]');
  await page.waitForTimeout(250);

  if (await page.$eval('#tutor', el => el.hidden)) throw new Error('assistant hidden on the deployed build');
  const note = await page.textContent('#tutor-note');
  if (/Claude/.test(note)) throw new Error('note still credits Claude on a self-hosted build');

  const posted = page.waitForRequest(r => r.url().endsWith('/api/ask') && r.method() === 'POST');
  await page.fill('#tutor-input', 'Why distinct users and not rows?');
  await page.click('#tutor-send');
  const req = await posted;
  const sent = JSON.parse(req.postData() || '{}');
  if (!sent.rules || !/Product Manager/.test(sent.rules)) throw new Error('rules not sent');
  if (!/Why PMs write their own SQL/.test(sent.rules)) throw new Error('module context not sent');
  if (!Array.isArray(sent.messages) || sent.messages.length !== 1) throw new Error('messages = ' + JSON.stringify(sent.messages));
  if (sent.messages[0].role !== 'user') throw new Error('first message role = ' + sent.messages[0].role);

  await page.waitForTimeout(700);
  const bot = await page.textContent('.t-msg.bot');
  if (!/COUNT\(DISTINCT user_id\)/.test(bot)) throw new Error('reply not streamed in: ' + bot.slice(0, 80));
  if (!/FORWARDED=/.test(bot)) throw new Error('provider did not receive the call');
  const fwd = JSON.parse(bot.match(/FORWARDED=(\{.*\})/)[1]);
  if (fwd.roles[0] !== 'system') throw new Error('rules were not sent as a system message: ' + fwd.roles.join(','));
  if (fwd.roles.slice(1).some(r => r !== 'user' && r !== 'assistant')) throw new Error('bad roles: ' + fwd.roles.join(','));
  if (!fwd.model) throw new Error('no model set');
  console.log('     forwarded as ' + fwd.roles.join(' > ') + ' on ' + fwd.model);
});

await step('a second question carries the conversation', async () => {
  const posted = page.waitForRequest(r => r.url().endsWith('/api/ask') && r.method() === 'POST');
  await page.fill('#tutor-input', 'And retention?');
  await page.click('#tutor-send');
  const req = await posted;
  const sent = JSON.parse(req.postData() || '{}');
  if (sent.messages.length !== 3) throw new Error('turns = ' + sent.messages.length);
  if (sent.messages[1].role !== 'assistant') throw new Error('history roles = ' + sent.messages.map(m => m.role).join(','));
  await page.waitForTimeout(600);
});

await step('selection ask posts the quoted passage', async () => {
  await page.evaluate(() => {
    const p = document.querySelector('#view .prose p');
    const r = document.createRange(); r.selectNodeContents(p);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  if (await page.$eval('#sel-ask', el => el.hidden)) throw new Error('no select-to-ask on the deployed build');
  await page.click('#sel-ask');
  await page.waitForTimeout(150);
  const posted = page.waitForRequest(r => r.url().endsWith('/api/ask'));
  await page.fill('#tutor-input', 'Explain this');
  await page.click('#tutor-send');
  const sent = JSON.parse((await posted).postData() || '{}');
  const last = sent.messages[sent.messages.length - 1].content;
  if (!/About this text:/.test(last)) throw new Error('quote missing: ' + last.slice(0, 60));
  await page.waitForTimeout(600);
});

await step('assistant stays blocked during an assessment', async () => {
  let called = false;
  page.on('request', r => { if (r.url().endsWith('/api/ask')) called = true; });
  await page.click('[data-action="open-skill"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(300);
  const label = await page.textContent('#tutor-launch-label');
  if (label !== 'Assistant off') throw new Error('label = ' + label);
  if (!(await page.$eval('#tutor-foot', el => el.hidden))) throw new Error('composer available during the exam');
  if (called) throw new Error('a request went out during the exam');
});

await step('no stray console or network errors from our own code', async () => {
  // This container blocks outbound hosts, so Google Fonts cannot load here. That is a
  // sandbox limit, not a bug: the page declares a real fallback stack for both faces.
  const ours = errs.filter(e => !/fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/.test(e));
  if (ours.length) throw new Error(ours.join(' | '));
  const fontsBlocked = errs.some(e => /fonts\.googleapis/.test(e));
  console.log('     ' + (fontsBlocked ? 'fonts blocked by the sandbox, fallback stack in use' : 'fonts loaded'));
});

await step('the page is readable even with the webfont blocked', async () => {
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  if (!/Plus Jakarta Sans/.test(font)) throw new Error('font stack = ' + font);
  if (!/system-ui|sans-serif/.test(font)) throw new Error('no fallback in the stack: ' + font);
});

await step('a favicon is declared so there is no 404 in production', async () => {
  const icon = await page.evaluate(() => document.querySelector('link[rel=icon]')?.href || '');
  if (!/^data:image\/svg/.test(icon)) throw new Error('favicon = ' + icon.slice(0, 40));
});

console.log(failed ? '\n' + failed + ' FAILED' : '\nall steps passed');
await browser.close();
process.exit(failed ? 1 : 0);
