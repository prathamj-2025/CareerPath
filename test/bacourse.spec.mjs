/* The Business Analyst course (28 sub-modules in 5 main modules): content integrity across every
   lesson, question and answer key, and the roadmap as a student opens it. */
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

await step('the Business Analyst roadmap has 28 sub-modules and 207 lessons, every one complete', async () => {
  const r = await page.evaluate(() => {
    const ba = window.CP_ROLES.find(x => x.id === 'ba');
    const bad = []; let lessons = 0;
    ba.skills.forEach(s => {
      if (s.quiz.length !== 4) bad.push(s.id + ': quiz');
      if (s.assessment.length !== 10) bad.push(s.id + ': assessment');
      if (s.assessment.map(q => q.lvl).join('') !== '1122334455') bad.push(s.id + ': assessment levels');
      if (!s.project || !s.project.title) bad.push(s.id + ': project');
      s.lessons.forEach((l, i) => {
        lessons++;
        const w = l.scenario && l.scenario.written;
        if (!l.body || !l.scenario || !l.revision || l.revision.length < 4) bad.push(s.id + ' L' + (i + 1) + ': missing parts');
        else {
          if (!w.points.every(p => p.re.test(w.improved))) bad.push(s.id + ' L' + (i + 1) + ': model answer fails its own points');
          if (w.points.some(p => p.re.test(''))) bad.push(s.id + ' L' + (i + 1) + ': a point matches empty text');
          if (w.points.some(p => p.re.test('I do not know what to say here and have no idea'))) bad.push(s.id + ' L' + (i + 1) + ': a point matches filler text');
          if (/[^\x09\x0a\x20-\x7e]/.test(l.body)) bad.push(s.id + ' L' + (i + 1) + ': non-ASCII text');
        }
      });
      const qs = s.quiz.concat(s.assessment).concat(s.lessons.map(l => l.scenario.mcq));
      qs.forEach((q, i) => {
        if (q.opts.length !== 4 || !(q.a >= 0 && q.a < 4) || !q.why) bad.push(s.id + ' question ' + i + ': shape');
        if (new Set(q.opts).size !== 4) bad.push(s.id + ' question ' + i + ': duplicate options');
      });
    });
    return { skills: ba.skills.length, lessons, bad, tracks: ba.tracks.map(t => t.id + ':' + !!t.cert) };
  });
  if (r.skills !== 28 || r.lessons !== 207) throw new Error(r.skills + ' skills, ' + r.lessons + ' lessons');
  if (r.bad.length) throw new Error(r.bad.slice(0, 5).join(' | ') + (r.bad.length > 5 ? ' ... (' + r.bad.length + ')' : ''));
  if (r.tracks.length !== 5 || r.tracks.filter(t => t.endsWith('true')).length !== 4) throw new Error('tracks: ' + r.tracks.join(','));
});

await step('every skill on the roadmap appears in exactly one main module', async () => {
  const r = await page.evaluate(() => {
    const ba = window.CP_ROLES.find(x => x.id === 'ba');
    const seen = {};
    ba.tracks.forEach(t => t.groups.forEach(g => g.skills.forEach(id => { seen[id] = (seen[id] || 0) + 1; })));
    return { missing: ba.skills.filter(s => seen[s.id] !== 1).map(s => s.id), extra: Object.keys(seen).filter(id => !ba.skills.some(s => s.id === id)) };
  });
  if (r.missing.length || r.extra.length) throw new Error(JSON.stringify(r));
});

await step('a student on the Business Analyst roadmap sees 5 main modules', async () => {
  await page.click('[data-action="login"]'); await page.waitForTimeout(400);
  await page.click('#sidebar .role-btn'); await page.click('#sidebar [data-nav="roles"]'); await page.waitForSelector('.role-card[data-role="ba"]');
  await page.click('.role-card[data-role="ba"]'); await page.waitForTimeout(300);
  if ((await page.$$('.rm-row')).length !== 5) throw new Error('rows ' + (await page.$$('.rm-row')).length);
  if (!(await page.textContent('.rm-num')).includes('of 4 certificates')) throw new Error('count');
});

await step('a lesson opens with its scenario, revision sheet and a Business Analyst heading', async () => {
  await page.click('[data-action="open-track"][data-track="ba-fundamentals"]'); await page.waitForTimeout(250);
  await page.click('[data-skill="foundations-ba"]'); await page.waitForTimeout(250);
  await page.click('[data-action="start-learn"][data-skill="foundations-ba"]'); await page.waitForTimeout(250);
  if (!(await page.textContent('.page-head .eyebrow')).includes('Lesson 1 of 8')) throw new Error('eyebrow');
  if (!(await page.$('.scn'))) throw new Error('no scenario');
  if ((await page.$$('.rev table tr')).length < 5) throw new Error('revision rows');
  const h = await page.textContent('.page-head h1');
  if (!/business analysis/i.test(h)) throw new Error('heading: ' + h);
});

await step('the model written answer scores full and a vague one does not', async () => {
  const model = await page.evaluate(() => window.CP_ROLES.find(x => x.id === 'ba').skills[0].lessons[0].scenario.written.improved);
  await page.fill('.scn textarea', model);
  await page.click('[data-action="scn-check"]'); await page.waitForTimeout(150);
  if (!(await page.textContent('.scn .check-panel')).includes('Covers every key point')) throw new Error('model answer did not score full');
  await page.fill('.scn textarea', 'I would just start working on it.');
  await page.click('[data-action="scn-check"]'); await page.waitForTimeout(150);
  if ((await page.textContent('.scn .check-panel')).includes('Covers every key point')) throw new Error('vague answer scored full');
});

console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno js errors');
console.log(failed ? '\n' + failed + ' FAILED' : '\nall steps passed');
await browser.close();
process.exit(failed ? 1 : 0);
