/* The Product Manager course (28 sub-modules in 5 main modules): data integrity across all 217 lessons, and the
   scenario practice and revision sheet as a learner uses them. */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3111';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/'); await page.waitForTimeout(400);

await step('the PM roadmap has 28 sub-modules and 217 lessons, every one complete', async () => {
  const r = await page.evaluate(() => {
    const pm = window.CP_ROLES.find(x => x.id === 'pm');
    const bad = []; let lessons = 0;
    pm.skills.forEach(s => {
      if (s.quiz.length !== 4) bad.push(s.id + ': quiz');
      if (s.assessment.length !== 10) bad.push(s.id + ': assessment');
      if (!s.project || !s.project.title) bad.push(s.id + ': project');
      s.lessons.forEach((l, i) => {
        lessons++;
        const w = l.scenario && l.scenario.written;
        if (!l.body || !l.scenario || !l.revision || l.revision.length < 4) bad.push(s.id + ' L' + (i + 1) + ': missing parts');
        else {
          if (!w.points.every(p => p.re.test(w.improved))) bad.push(s.id + ' L' + (i + 1) + ': model answer fails its own points');
          if (w.points.some(p => p.re.test(''))) bad.push(s.id + ' L' + (i + 1) + ': a point matches empty text');
          if (w.points.some(p => p.re.test('I do not know what to say here and have no idea'))) bad.push(s.id + ' L' + (i + 1) + ': a point matches filler text');
        }
      });
    });
    return { skills: pm.skills.length, lessons, bad };
  });
  if (r.skills !== 28 || r.lessons !== 217) throw new Error(r.skills + ' skills, ' + r.lessons + ' lessons');
  if (r.bad.length) throw new Error(r.bad.slice(0, 5).join(' | ') + (r.bad.length > 5 ? ' ...' : ''));
});

await step('roadmap shows 5 main modules and a bar with 5 labelled segments', async () => {
  await page.click('[data-action="login"]'); await page.waitForTimeout(400);
  if ((await page.$$('.rm-row')).length !== 5) throw new Error('rows');
  if ((await page.$$('.rm-seg')).length !== 5) throw new Error('segments');
  if (!(await page.textContent('.rm-num')).includes('of 4 certificates')) throw new Error('count');
  if ((await page.$$('.rm-seg span')).length !== 5) throw new Error('segment labels');
});

await step('a lesson shows its scenario and revision sheet', async () => {
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await page.waitForTimeout(250);
  await page.click('[data-skill="foundations-pm"]'); await page.waitForTimeout(250);
  await page.click('[data-action="start-learn"][data-skill="foundations-pm"]'); await page.waitForTimeout(250);
  if (!(await page.textContent('.page-head .eyebrow')).includes('Lesson 1 of 8')) throw new Error('eyebrow');
  if (!(await page.$('.scn'))) throw new Error('no scenario');
  const rows = await page.$$('.rev table tr');
  if (rows.length < 5) throw new Error('revision rows ' + rows.length);
});

await step('headings, lists and callouts render as such even without blank lines in the source', async () => {
  const check = async (idx) => {
    await page.click('.lesson-nav button:nth-child(' + (idx + 1) + ')'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.prose');
      const heads = [...root.querySelectorAll('h3')].map(h => h.textContent.trim());
      return { heads, long: heads.filter(h => h.length > 70), lists: root.querySelectorAll('ul').length, keypt: root.querySelectorAll('.keypt').length,
               rawDash: /(^|\s)- [A-Z]/.test(root.textContent) };
    });
    if (r.long.length) throw new Error('lesson ' + (idx + 1) + ' has a heading swallowing the paragraph: ' + r.long[0].slice(0, 60));
    if (r.heads.length < 4) throw new Error('lesson ' + (idx + 1) + ' headings = ' + r.heads.length);
    if (!r.heads.includes('Key takeaways') || r.lists < 2) throw new Error('lesson ' + (idx + 1) + ' lists = ' + r.lists);
    if (r.keypt !== 1) throw new Error('callouts = ' + r.keypt);
    if (r.rawDash) throw new Error('bullet markers shown as text');
  };
  await check(3); await check(0); await check(7);
  await page.click('.lesson-nav button:nth-child(1)'); await page.waitForTimeout(150);
});

await step('the decision question reveals the answer and cannot be changed', async () => {
  const right = await page.evaluate(() => window.CP_ROLES.find(x => x.id === 'pm').skills[0].lessons[0].scenario.mcq.a);
  const wrong = right === 0 ? 1 : 0;
  await page.click('.scn [data-action="scn-pick"][data-i="' + wrong + '"]'); await page.waitForTimeout(150);
  if (!(await page.textContent('.scn .why')).includes('Not quite')) throw new Error('no wrong-answer feedback');
  if ((await page.getAttribute('.scn [data-i="' + right + '"]', 'data-state')) !== 'correct') throw new Error('correct option not marked');
  if (!(await page.$('.scn [data-action="scn-pick"][disabled]'))) throw new Error('options still clickable');
});

await step('an empty written answer is refused; a strong one covers every point', async () => {
  await page.click('[data-action="scn-check"]'); await page.waitForTimeout(150);
  if (!(await page.textContent('.scn .check-panel')).includes('Write an attempt first')) throw new Error('empty not refused');
  const model = await page.evaluate(() => window.CP_ROLES.find(x => x.id === 'pm').skills[0].lessons[0].scenario.written.improved);
  await page.fill('.scn textarea', model);
  await page.click('[data-action="scn-check"]'); await page.waitForTimeout(150);
  const t = await page.textContent('.scn .check-panel');
  if (!t.includes('Covers every key point')) throw new Error('model answer did not score full: ' + t.slice(0, 80));
});

await step('a vague answer covers fewer points, and the stronger answer is shown on request', async () => {
  await page.fill('.scn textarea', 'I would just build the feature quickly.');
  await page.click('[data-action="scn-check"]'); await page.waitForTimeout(150);
  const t = await page.textContent('.scn .check-panel');
  if (t.includes('Covers every key point')) throw new Error('vague answer scored full');
  await page.click('[data-action="scn-show"]'); await page.waitForTimeout(150);
  if (!(await page.$('.scn .ex-solution'))) throw new Error('stronger answer not shown');
  if (!(await page.textContent('.scn-lesson')).startsWith('Lesson')) throw new Error('lesson line missing');
});

await step('written review appears when an AI reviewer is reachable', async () => {
  if (!(await page.$('[data-action="scn-review"]'))) throw new Error('review button missing although the test server has an assistant');
  await page.click('[data-action="scn-review"]');
  await page.waitForSelector('.scn .hint, .scn .check-panel.warn', { timeout: 6000 });
  if (!(await page.$('.scn .hint'))) throw new Error('no review text: ' + (await page.textContent('.scn .check-panel.warn')).slice(0, 100));
});

await step('the last lesson shows the deliverable and the module quiz, no old practice block', async () => {
  await page.click('.lesson-nav button:last-child'); await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  if (!t.includes('Practical project') || !(await page.$('textarea[data-proj]'))) throw new Error('no project box on the last lesson');
  if (!t.includes('Module quiz')) throw new Error('no quiz');
  if (t.includes('Practice exercises')) throw new Error('old practice block still shown');
});

await step('resume terms exist for every PM skill', async () => {
  const miss = await page.evaluate(() => window.CP_ROLES.find(x => x.id === 'pm').skills.filter(s => !(window.CP_SKILL_TERMS[s.id] && window.CP_SKILL_TERMS[s.id].length)).map(s => s.id));
  if (miss.length) throw new Error('no resume terms for: ' + miss.join(', '));
});

if (errs.length) { failed++; console.log('FAIL page errors :: ' + errs.join(' | ')); }
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed');
process.exit(failed ? 1 : 0);
