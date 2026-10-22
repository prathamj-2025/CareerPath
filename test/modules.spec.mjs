/* Main modules, module exams and certificates for the Product Manager roadmap. */
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
const wait = (ms = 150) => page.waitForTimeout(ms);

await step('structure: 5 main modules, 28 sub-modules, each in exactly one module, 4 certificates', async () => {
  const r = await page.evaluate(() => {
    const pm = window.CP_ROLES.find(x => x.id === 'pm');
    const ids = pm.skills.map(s => s.id), seen = {};
    const out = { tracks: pm.tracks.map(t => t.id), certs: pm.tracks.filter(t => t.cert).map(t => t.cert), bad: [] };
    pm.tracks.forEach(t => t.groups.forEach(g => g.skills.forEach(id => { seen[id] = (seen[id] || 0) + 1; })));
    ids.forEach(id => { if (seen[id] !== 1) out.bad.push(id + ' x' + (seen[id] || 0)); });
    Object.keys(seen).forEach(id => { if (ids.indexOf(id) === -1) out.bad.push('unknown ' + id); });
    out.counts = pm.tracks.map(t => t.groups.reduce((a, g) => a + g.skills.length, 0));
    out.questionsOk = pm.tracks.every(t => !t.cert || t.questions >= 20);
    return out;
  });
  if (r.tracks.join() !== 'pm-fundamentals,pm-professional,pm-data,pm-sql,pm-career') throw new Error('tracks = ' + r.tracks);
  if (r.certs.length !== 4) throw new Error('certs = ' + r.certs);
  if (r.counts.join() !== '5,12,7,3,1') throw new Error('counts = ' + r.counts);
  if (r.bad.length) throw new Error(r.bad.join(', '));
  if (!r.questionsOk) throw new Error('exam size');
});

await step('SQL and Python sub-modules carry runnable code and real outputs', async () => {
  const r = await page.evaluate(() => {
    const pm = window.CP_ROLES.find(x => x.id === 'pm');
    const res = {};
    ['sql-foundations-pm', 'sql-joins-pm', 'sql-product-pm', 'python-basics-pm', 'pandas-pm'].forEach(id => {
      const s = pm.skills.find(x => x.id === id);
      const lang = id.startsWith('sql') ? '```sql' : '```python';
      res[id] = s.lessons.filter(l => l.body.indexOf(lang) > -1 && l.body.indexOf('```text') > -1).length + '/' + s.lessons.length;
    });
    return res;
  });
  Object.keys(r).forEach(id => {
    const [a, b] = r[id].split('/').map(Number);
    if (a < b - 1) throw new Error(id + ' only ' + r[id] + ' lessons have code with output');
  });
});

await step('a code block renders as preformatted text, escaped', async () => {
  await page.click('[data-action="login"]'); await wait(400);
  await page.click('[data-action="open-track"][data-track="pm-sql"]'); await wait(200);
  await page.click('[data-skill="sql-foundations-pm"]'); await wait(200);
  await page.click('[data-action="start-learn"][data-skill="sql-foundations-pm"]'); await wait(300);
  const n = (await page.$$('#view pre')).length;
  if (n < 1) throw new Error('no <pre> in the first SQL lesson');
  await page.click('[data-nav="roadmap"]'); await wait();
});

await step('the module exam is locked until every required sub-module is job-ready', async () => {
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await wait(200);
  if (!(await page.$('.mx-steps ~ * button[disabled], .card button[disabled]'))) throw new Error('exam button is not disabled');
  await page.evaluate(() => { const b = document.querySelector('[data-action="start-mexam"]'); if (b) b.click(); });
  await wait();
  if (await page.$('.q-card')) throw new Error('exam started although locked');
});

const keyFor = (q) => page.evaluate((qt) => {
  for (const r of window.CP_ROLES) for (const s of r.skills) for (const a of s.assessment) if (a.q === qt) return a.a;
  return -1;
}, q);

await step('four assessments to 100% unlock the exam (stars stay per sub-module)', async () => {
  for (const n of [2, 3, 4, 5]) {
    await page.click('.skill-row:nth-child(' + n + ')'); await wait();
    const id = await page.evaluate(() => document.querySelector('[data-action="start-exam"]').dataset.skill);
    const key = await page.evaluate((id) => window.CP_ROLES.find(r => r.id === 'pm').skills.find(s => s.id === id).assessment.map(q => q.a), id);
    await page.click('[data-action="start-exam"]'); await wait();
    for (const a of key) { await page.click('[data-action="exam-answer"][data-i="' + a + '"]'); await wait(40); }
    await wait(150);
    if (!(await page.textContent('.result-h1')).includes('100%')) throw new Error(id + ' not 100%');
    await page.click('[data-nav="roadmap"]'); await wait();
    await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await wait(150);
  }
  if (!(await page.textContent('.mx-steps')).includes('Done: 5 of 5')) throw new Error('steps = ' + (await page.textContent('.mx-steps')).slice(0, 160));
  if (!(await page.$('[data-action="start-mexam"]:not([disabled])'))) throw new Error('exam not unlocked');
  await page.click('[data-nav="roadmap"]'); await wait();
  if (!(await page.textContent('.rm-next-k')).includes('Module exam ready')) throw new Error('progress card does not point at the exam');
  const chips = await page.$$eval('.skill-row .rm-chip', els => els.map(e => e.textContent.trim()));
  if (chips[0] !== 'Exam ready') throw new Error('chips = ' + chips.join('|'));
  if (!(await page.textContent('.summary-row')).includes('0 / 4')) throw new Error('certificates cell');
});

let pointsBefore = 0;
const points = async () => Number((await page.$$eval('.summary-cell', els => els.map(e => e.textContent).find(t => /Leaderboard points/.test(t)))).replace(/\D/g, ''));
const runExam = async (mode) => {
  await page.click('[data-nav="roadmap"]'); await wait();
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await wait();
  await page.click('[data-action="start-mexam"]'); await wait();
  const subs = new Set(); let n = 0;
  for (;;) {
    const q = await page.textContent('.q-stem');
    subs.add((await page.textContent('.progress-head .ver')).trim());
    const key = await keyFor(q);
    if (key < 0) throw new Error('question not found in the bank: ' + q.slice(0, 50));
    const pick = mode === 'right' ? key : (key + 1) % 4;
    await page.click('[data-action="mexam-answer"][data-i="' + pick + '"]'); await wait(40);
    n++;
    if (await page.$('.result-h1')) break;
  }
  return { n, subs: subs.size };
};

await step('a failed module exam draws 25 questions across all 5 sub-modules and awards nothing', async () => {
  pointsBefore = (await page.click('[data-nav="roadmap"]'), await wait(), await points());
  const r = await runExam('wrong');
  if (r.n !== 25) throw new Error('questions = ' + r.n);
  if (r.subs !== 5) throw new Error('sub-modules sampled = ' + r.subs);
  const h = await page.textContent('.result-h1');
  if (!/Not yet/.test(h)) throw new Error('h1 = ' + h);
  if (!(await page.$('[data-action="start-mexam"]'))) throw new Error('no retry button');
  if (await page.$('[data-action="open-cert"]')) throw new Error('certificate offered after a fail');
  if (!(await page.textContent('#view')).includes('Performance by sub-module')) throw new Error('no breakdown');
  await page.click('[data-nav="certs"]'); await wait();
  if (await page.$('.skill-row')) throw new Error('a certificate exists after a failed exam');
});

await step('passing the module exam issues the certificate and points once', async () => {
  await runExam('right');
  const h = await page.textContent('.result-h1');
  if (!/100%/.test(h) || !/Passed/.test(h)) throw new Error('h1 = ' + h);
  if (!(await page.textContent('.page-head .sub')).includes('PM Fundamentals certificate')) throw new Error('sub = ' + (await page.textContent('.page-head .sub')));
  await page.click('[data-nav="roadmap"]'); await wait();
  const after = await points();
  if (after - pointsBefore !== 250) throw new Error('points ' + pointsBefore + ' -> ' + after);
  if (!(await page.textContent('.rm-num')).includes('1 of 4 certificates')) throw new Error('progress card');
  await runExam('right');
  await page.click('[data-nav="roadmap"]'); await wait();
  if ((await points()) !== after) throw new Error('points awarded twice');
});

await step('the certificate list and page name the module, not a single skill', async () => {
  await page.click('[data-nav="certs"]'); await wait();
  const rows = await page.$$eval('.skill-row .skill-name', els => els.map(e => e.textContent.trim()));
  if (rows.join() !== 'PM Fundamentals') throw new Error('rows = ' + rows);
  if ((await page.textContent('[data-nav="certs"] .nav-count')).trim() !== '1') throw new Error('nav count');
  await page.click('.skill-row'); await wait();
  const t = await page.textContent('.cert');
  if (!t.includes('PM Fundamentals') || !t.includes('Module exam passed with 100%') || !t.includes('Verified Module Certificate')) throw new Error(t.slice(0, 200));
  if (!/ID CP-PM-/.test(t)) throw new Error('no verification id');
});

await step('the Data-Driven module shows the optional Python group and no exam yet', async () => {
  await page.click('[data-nav="roadmap"]'); await wait();
  await page.click('[data-action="open-track"][data-track="pm-data"]'); await wait(200);
  const groups = await page.$$eval('.trk-group', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (groups.length !== 2 || !/Optional/.test(groups[1]) || !/Python/.test(groups[1])) throw new Error(groups.join('|'));
  if (!(await page.$('.card button[disabled]'))) throw new Error('exam should be locked');
  const links = await page.$$eval('a[download]', els => els.map(e => e.getAttribute('href')));
  if (links.length !== 8 || !links.includes('practice-data/listens.csv')) throw new Error('practice data links = ' + links.length);
});

await step('the Interview-Ready module has stars but no exam and no certificate', async () => {
  await page.click('[data-nav="roadmap"]'); await wait();
  await page.click('[data-action="open-track"][data-track="pm-career"]'); await wait(200);
  const t = await page.textContent('#view');
  if (!/no module exam and no certificate/.test(t)) throw new Error('missing explanation');
  if (await page.$('[data-action="start-mexam"]')) throw new Error('exam button on a practice module');
});

await step('the assistant is switched off during a module exam', async () => {
  await page.click('[data-nav="roadmap"]'); await wait();
  await page.click('[data-action="open-track"][data-track="pm-fundamentals"]'); await wait();
  await page.click('[data-action="start-mexam"]'); await wait(300);
  const label = await page.textContent('#tutor-launch-label');
  if (label !== 'Assistant off') throw new Error('label = ' + label);
  if (!(await page.$eval('#tutor-foot', el => el.hidden))) throw new Error('composer still available');
  await page.click('[data-nav="roadmap"]'); await wait();
});

if (errs.length) { failed++; console.log('FAIL page errors :: ' + errs.join(' | ')); }
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed');
process.exit(failed ? 1 : 0);
