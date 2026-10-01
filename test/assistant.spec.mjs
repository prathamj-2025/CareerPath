/* Study assistant tests.
   The assistant has two backends. These tests stub the claude.ai artifact runtime to
   exercise that path, and check that the page falls back to /api/ask without it.
   Needs the local server running: npm run serve (and npm run mock-provider). */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3111';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.addInitScript(() => {
  window.__calls = [];
  const fake = async (input, opts = {}) => {
    window.__calls.push({ input, opts: { cache: opts.cache, tier: opts.modelTier } });
    const reply = 'Short answer for the test.\n\nSecond paragraph with `code`.';
    if (opts.onText) {
      opts.onText({ text: 'Short answer', delta: 'Short answer' });
      await new Promise(r => setTimeout(r, 30));
      opts.onText({ text: reply, delta: reply.slice('Short answer'.length) });
    }
    return { text: reply, truncated: false, modelTierApplied: 'default' };
  };
  fake.json = async () => ({});
  fake.limits = async () => ({ maxPromptBytes: 65536 });
  window.claude = { use: async name => (name === 'sample' ? fake : null) };
});

let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};

await page.goto(BASE + '/');
await page.waitForTimeout(400);

await step('panel is docked on a wide screen for a signed-in student', async () => {
  if (!(await page.$('#tutor[hidden]'))) throw new Error('tutor visible before sign-in');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(400);
  if (await page.$eval('#tutor', el => el.hidden)) throw new Error('assistant hidden for a student');
  if (await page.$eval('#tutor-panel', el => el.hidden)) throw new Error('docked panel not open by default');
  if (!(await page.$eval('#tutor-launch', el => el.hidden))) throw new Error('floating button shown while docked');
  if (!(await page.$eval('body', b => b.classList.contains('tutor-docked')))) throw new Error('body not in docked mode');
  const pad = await page.$eval('#shell', el => getComputedStyle(el).paddingRight);
  if (parseInt(pad, 10) < 300) throw new Error('content not inset for the rail: ' + pad);
  const overlap = await page.evaluate(() => {
    const p = document.querySelector('#tutor-panel').getBoundingClientRect();
    const v = document.querySelector('#view').getBoundingClientRect();
    return v.right - p.left;
  });
  if (overlap > 1) throw new Error('rail covers the content by ' + overlap + 'px');
});

await step('hide switches to the floating button, dock brings it back', async () => {
  await page.click('[data-tutor="undock"]');
  await page.waitForTimeout(200);
  if (!(await page.$eval('#tutor-panel', el => el.hidden))) throw new Error('panel still open after Hide');
  if (await page.$eval('#tutor-launch', el => el.hidden)) throw new Error('floating button missing after Hide');
  if (await page.$eval('body', b => b.classList.contains('tutor-docked'))) throw new Error('content still inset');

  await page.click('#tutor-launch');
  await page.waitForTimeout(150);
  if (await page.$eval('#tutor-dock', el => el.hidden)) throw new Error('Dock control missing on a wide screen');
  await page.click('[data-tutor="dock"]');
  await page.waitForTimeout(200);
  if (!(await page.$eval('body', b => b.classList.contains('tutor-docked')))) throw new Error('Dock did not re-dock');
});

await step('narrow screens fall back to the floating button', async () => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.waitForTimeout(250);
  if (await page.$eval('body', b => b.classList.contains('tutor-docked'))) throw new Error('docked at 820px');
  if (await page.$eval('#tutor-launch', el => el.hidden)) throw new Error('no floating button at 820px');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error('horizontal overflow at 820px: ' + over);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  if (!(await page.$eval('body', b => b.classList.contains('tutor-docked')))) throw new Error('did not re-dock at 1280px');
});

await step('asking sends role and module context', async () => {
  await page.click('.skill-row:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-learn"]');
  await page.waitForTimeout(200);
  await page.fill('#tutor-input', 'What is a funnel?');
  await page.click('#tutor-send');
  await page.waitForTimeout(400);

  const calls = await page.evaluate(() => window.__calls);
  if (calls.length !== 1) throw new Error('calls = ' + calls.length);
  const turns = calls[0].input;
  if (!Array.isArray(turns)) throw new Error('input should be turns');
  if (turns[0].role !== 'user') throw new Error('first turn must be user');
  const rules = turns[0].content;
  for (const needle of ['Product Manager', 'SQL for Product Managers', 'Why PMs write their own SQL', 'Never hand over the answer']) {
    if (!rules.includes(needle)) throw new Error('context missing: ' + needle);
  }
  if (turns[turns.length - 1].content !== 'What is a funnel?') throw new Error('question not last turn');
  if (calls[0].opts.cache !== false) throw new Error('chat must not be cached');
});

await step('reply renders as formatted text', async () => {
  const bot = await page.textContent('.t-msg.bot');
  if (!bot.includes('Second paragraph')) throw new Error('reply not rendered: ' + bot);
  if (!(await page.$('.t-msg.bot code'))) throw new Error('inline code not formatted');
  const you = await page.textContent('.t-msg.you');
  if (!you.includes('What is a funnel?')) throw new Error('question bubble missing');
});

await step('selecting text offers Ask about this', async () => {
  await page.evaluate(() => {
    const p = document.querySelector('#view .prose p');
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  if (await page.$eval('#sel-ask', el => el.hidden)) throw new Error('Ask about this did not appear');
  await page.click('#sel-ask');
  await page.waitForTimeout(150);
  const quoted = await page.$eval('#tutor-quote', el => el.hidden);
  if (quoted) throw new Error('quote not attached');
  const qt = await page.textContent('#tutor-quote-text');
  if (qt.length < 20) throw new Error('quote too short: ' + qt);

  await page.fill('#tutor-input', 'Explain this line');
  await page.click('#tutor-send');
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__calls);
  const last = calls[calls.length - 1].input;
  const lastTurn = last[last.length - 1].content;
  if (!/About this text:/.test(lastTurn)) throw new Error('selection not passed: ' + lastTurn.slice(0, 60));
});

await step('assistant is locked during a graded assessment', async () => {
  const before = (await page.evaluate(() => window.__calls)).length;
  await page.click('[data-action="open-skill"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(300);
  const label = await page.textContent('#tutor-launch-label');
  if (label !== 'Assistant off') throw new Error('label = ' + label);
  const t = await page.textContent('#tutor-log');
  if (!/off during an assessment/.test(t)) throw new Error('no lock message');
  if (!(await page.$eval('#tutor-foot', el => el.hidden))) throw new Error('composer still available');
  const after = (await page.evaluate(() => window.__calls)).length;
  if (after !== before) throw new Error('a call was made during the exam');
});

await step('selection ask is also blocked during an assessment', async () => {
  await page.evaluate(() => {
    const p = document.querySelector('#view .q-stem');
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  if (!(await page.$eval('#sel-ask', el => el.hidden))) throw new Error('select-to-ask offered during the exam');
});

await step('explain-why appears on the result page and asks with the question', async () => {
  const key = await page.evaluate(() =>
    window.CP_ROLES[0].skills[0].assessment.map(q => q.a));
  for (let i = 0; i < key.length; i++) {
    const opts = await page.$$('[data-action="exam-answer"]');
    if (!opts.length) break;
    await opts[(key[i] + 1) % 4].click();   // always wrong, so every question is reviewable
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  const btn = await page.$('[data-action="tutor-explain"]');
  if (!btn) throw new Error('no explain button on missed questions');
  const label = await page.textContent('#tutor-launch-label');
  if (label !== 'Ask') throw new Error('assistant still locked after the exam: ' + label);

  const before = (await page.evaluate(() => window.__calls)).length;
  await btn.click();
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__calls);
  if (calls.length !== before + 1) throw new Error('explain did not ask');
  const last = calls[calls.length - 1].input;
  const q = last[last.length - 1].content;
  if (!/I chose [ABCD]\. The correct answer is [ABCD]\./.test(q)) throw new Error('explain prompt: ' + q.slice(0, 120));
  const bubbles = await page.$$eval('.t-msg.you', els => els.map(e => e.textContent));
  const bubble = bubbles[bubbles.length - 1];
  if (!/Why was my answer/.test(bubble)) throw new Error('bubble shows the raw prompt: ' + bubble.slice(0, 60));
});

await step('clear empties the conversation', async () => {
  await page.click('[data-tutor="clear"]');
  await page.waitForTimeout(150);
  if (await page.$('.t-msg')) throw new Error('messages still present');
  const t = await page.textContent('#tutor-log');
  if (!/Ask about what you are reading/.test(t)) throw new Error('empty state missing');
});

await step('admin does not get the study assistant', async () => {
  await page.click('[data-action="logout"]');
  await page.waitForTimeout(200);
  await page.fill('#li-email', 'admin@careerpath.com'); await page.fill('#li-pass', 'admin');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(300);
  if (!(await page.$eval('#tutor', el => el.hidden))) throw new Error('assistant shown to admin');
});

await step('preview mode gives the admin the student assistant', async () => {
  await page.click('[data-action="a-open"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="preview"][data-mode="learn"]');
  await page.waitForTimeout(300);
  if (await page.$eval('#tutor', el => el.hidden)) throw new Error('assistant hidden in preview');
});

await step('a viewer who declines sees the assistant disappear', async () => {
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p2.addInitScript(() => {
    const denier = async () => { throw { code: 'not_granted', message: 'declined' }; };
    denier.json = async () => ({});
    denier.limits = async () => ({ maxPromptBytes: 65536 });
    window.claude = { use: async n => (n === 'sample' ? denier : null) };
  });
  await p2.goto(BASE + '/');
  await p2.waitForTimeout(300);
  await p2.click('[data-action="login"]');
  await p2.waitForTimeout(300);
  await p2.fill('#tutor-input', 'hello');
  await p2.click('#tutor-send');
  await p2.waitForTimeout(400);
  const t = await p2.textContent('#tutor-log');
  if (!/declined access/.test(t)) throw new Error('no denial copy: ' + t.slice(0, 80));
  if (!(await p2.$eval('#tutor', el => el.hidden))) throw new Error('assistant not hidden after denial');
  await p2.close();
});

await step('without the artifact runtime it falls back to /api/ask', async () => {
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p3.goto(BASE + '/');   // no window.claude, which is the deployed case
  await p3.waitForTimeout(300);
  await p3.click('[data-action="login"]');
  await p3.waitForTimeout(300);
  if (await p3.$eval('#tutor', el => el.hidden)) throw new Error('assistant hidden on a self-hosted build');
  const note = await p3.textContent('#tutor-note');
  if (/Claude/.test(note)) throw new Error('note credits Claude without the runtime: ' + note);

  const posted = p3.waitForRequest(r => r.url().endsWith('/api/ask'));
  await p3.fill('#tutor-input', 'ping');
  await p3.click('#tutor-send');
  await posted;
  await p3.waitForTimeout(500);
  if (!(await p3.$('.t-msg.bot'))) throw new Error('no reply through the server function');
  await p3.close();
});

await step('opened as a local file the assistant hides itself', async () => {
  const p4 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p4.goto('file://' + process.cwd() + '/public/index.html');
  await p4.waitForTimeout(400);
  await p4.click('[data-action="login"]');
  await p4.waitForTimeout(300);
  if (!(await p4.$eval('#tutor', el => el.hidden))) throw new Error('assistant offered with no backend reachable');
  const h = await p4.textContent('.page-head h1');
  if (!h.includes('roadmap')) throw new Error('the rest of the app broke: ' + h);
  await p4.close();
});

console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno js errors');
console.log(failed ? '\n' + failed + ' FAILED' : '\nall steps passed');
await browser.close();
