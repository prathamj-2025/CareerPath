import { chromium } from 'playwright';

const errs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/TUNNEL/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

const BASE = process.env.BASE_URL || 'http://localhost:3111';
const URL = BASE + '/';
await page.goto(URL);
await page.waitForTimeout(400);

let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const nav = async () => (await page.$$eval('#sidebar .nav-item span:first-child', ns => ns.map(n => n.textContent)));

/* ---------- login screen ---------- */

await step('login screen shows both credential cards', async () => {
  const t = await page.textContent('.cred-grid');
  if (!t.includes('student@careerpath.com')) throw new Error('student cred missing');
  if (t.includes('admin@careerpath.com')) throw new Error('admin cred must not be shown on the landing page');
  if ((await page.textContent('#auth')).includes('demo@usc.edu')) throw new Error('old demo cred still present');
});

await page.screenshot({ path: 'shot-login.png' });

/* ---------- student ---------- */

await step('student signs in and has no admin nav', async () => {
  await page.click('[data-action="login"]');
  await page.waitForSelector('#shell:not([hidden])');
  const items = await nav();
  if (items.join(',') !== 'Roadmap,Weekly challenge,Leaderboard,Certificates,History')
    throw new Error('student nav = ' + items.join(','));
  if ((await page.textContent('#sidebar')).includes('Admin')) throw new Error('Admin visible to student');
});

await step('student cannot reach admin screens by route', async () => {
  const landed = await page.evaluate(() => {
    document.querySelector('[data-nav="leaderboard"]').click();
    return document.querySelector('.page-head h1').textContent;
  });
  if (!landed.includes('leaderboard')) throw new Error('nav broken: ' + landed);
});

await step('student assessment still scores and awards', async () => {
  await page.click('[data-nav="roadmap"]');
  await page.waitForTimeout(120);
  const key = await page.evaluate(() =>
    window.CP_ROLES.find(r => r.id === 'pm').skills.find(s => s.id === 'discovery-pm').assessment.map(q => q.a));
  await page.click('.skill-row:nth-child(3)');
  await page.waitForTimeout(120);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(150);
  for (const a of key) {
    const opts = await page.$$('[data-action="exam-answer"]');
    await opts[a].click();
    await page.waitForTimeout(50);
  }
  const h = await page.textContent('.page-head h1');
  if (!h.includes('100%')) throw new Error('expected 100%, got ' + h);
  const pts = await page.textContent('.who-sub');
  console.log('     after exam: ' + h.trim() + ' | ' + pts.trim());
});

await page.screenshot({ path: 'shot-student-result.png' });

await step('SQL practice is attempt-first with schema, hints and answer', async () => {
  await page.click('[data-nav="roadmap"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-learn"]');
  await page.waitForTimeout(150);
  const tabs = await page.$$('.lesson-nav button');
  await tabs[tabs.length - 1].click();
  await page.waitForTimeout(200);

  const kinds = await page.$$eval('.ex .pill:nth-child(2)', ps => ps.map(p => p.textContent));
  if (!kinds.every(k => k === 'Write a query')) throw new Error('kinds = ' + kinds.join('|'));
  if (!(await page.$('.ex-schema pre'))) throw new Error('no schema shown for a query exercise');
  const schema = await page.textContent('.ex-schema pre');
  if (!schema.includes('user_id')) throw new Error('schema looks wrong: ' + schema.slice(0, 40));

  const box = await page.$('.ex-input');
  if (!box) throw new Error('no attempt box');
  await box.fill('SELECT count(*) FROM events');
  await page.waitForTimeout(80);

  if (await page.$('.hint')) throw new Error('hints visible before asking');
  if (await page.$('.ex-solution')) throw new Error('solution visible before asking');

  await page.click('.ex [data-action="practice-hint"]');
  await page.waitForTimeout(150);
  if ((await page.$$('.ex:first-of-type .hint')).length !== 1) throw new Error('expected exactly one hint');
  if (await page.inputValue('.ex-input') !== 'SELECT count(*) FROM events')
    throw new Error('attempt lost when the hint was revealed');

  await page.click('.ex [data-action="practice-hint"]');
  await page.waitForTimeout(150);
  if ((await page.$$('.ex:first-of-type .hint')).length !== 2) throw new Error('second hint did not appear');

  await page.click('.ex [data-action="practice-answer"]');
  await page.waitForTimeout(150);
  const sol = await page.textContent('.ex-solution pre');
  if (!/COUNT\(DISTINCT/.test(sol)) throw new Error('model query missing: ' + sol.slice(0, 60));
  if (!(await page.$('.ex .why'))) throw new Error('answer notes missing');

  await page.click('.ex [data-action="practice-answer"]');
  await page.waitForTimeout(150);
  if (await page.$('.ex-solution')) throw new Error('answer did not hide again');
});

await step('checking a wrong query reports what is missing', async () => {
  await page.fill('.ex-input', 'SELECT COUNT(*) FROM events');
  await page.click('.ex [data-action="practice-check"]');
  await page.waitForTimeout(200);
  const panel = await page.$('.check-panel');
  if (!panel) throw new Error('no check panel');
  const cls = await panel.getAttribute('class');
  if (!/bad|warn/.test(cls)) throw new Error('wrong query judged as: ' + cls);
  const unmet = await page.$$eval('.crit.unmet span:last-child', ss => ss.map(s => s.textContent));
  if (!unmet.some(u => /distinct/i.test(u))) throw new Error('did not flag the distinct requirement');
  const problems = await page.$$eval('.crit.problem span:last-child', ss => ss.map(s => s.textContent));
  if (!problems.some(p => /COUNT\(\*\)/.test(p))) throw new Error('did not flag COUNT(*): ' + problems.join('|'));
  const note = await page.textContent('.check-note');
  if (!/does not run the query/.test(note)) throw new Error('honesty note missing');
});

await step('checking a correct query passes', async () => {
  await page.fill('.ex-input', `SELECT
      COUNT(DISTINCT CASE WHEN event = 'view_cart' THEN user_id END) AS s1,
      COUNT(DISTINCT CASE WHEN event = 'begin_checkout' THEN user_id END) AS s2,
      COUNT(DISTINCT CASE WHEN event = 'purchase' THEN user_id END) AS s3
    FROM events WHERE event_date BETWEEN '2026-09-01' AND '2026-09-14'`);
  await page.click('.ex [data-action="practice-check"]');
  await page.waitForTimeout(200);
  const cls = await (await page.$('.check-panel')).getAttribute('class');
  if (!/ok/.test(cls)) throw new Error('correct query judged as: ' + cls);
  const title = await page.textContent('.check-panel b');
  if (!/Looks correct/.test(title)) throw new Error('verdict = ' + title);
  if ((await page.$$('.crit.unmet')).length) throw new Error('unmet criteria on a correct answer');
});

await step('empty attempt is refused rather than passed', async () => {
  await page.fill('.ex-input', '');
  await page.click('.ex [data-action="practice-check"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('.check-panel');
  if (!/Write an attempt first/.test(t)) throw new Error('empty attempt: ' + t.slice(0, 60));
});

await page.screenshot({ path: 'shot-practice.png', fullPage: true });

await step('judgement skills keep a written answer with hints', async () => {
  await page.click('[data-nav="roadmap"]');
  await page.waitForTimeout(150);
  await page.click('.skill-row:nth-child(4)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-learn"]');
  await page.waitForTimeout(150);
  const tabs = await page.$$('.lesson-nav button');
  await tabs[tabs.length - 1].click();
  await page.waitForTimeout(200);
  const kinds = await page.$$eval('.ex .pill:nth-child(2)', ps => ps.map(p => p.textContent));
  if (!kinds.every(k => k === 'Written answer')) throw new Error('kinds = ' + kinds.join('|'));
  if (await page.$('.ex-schema')) throw new Error('schema shown on a written exercise');
  if (!(await page.$('[data-action="practice-hint"]'))) throw new Error('no hints on written exercise');

  await page.fill('.ex-input', 'The scope is different, not the speed. Ask both what they think is in scope.');
  await page.click('.ex [data-action="practice-check"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('.check-panel');
  if (!/key points/.test(t)) throw new Error('written check should count key points: ' + t.slice(0, 80));
  const note = await page.textContent('.check-note');
  if (!/not how well you argued/.test(note)) throw new Error('coverage caveat missing');
  if ((await page.$$('.crit.met')).length < 2) throw new Error('coverage detection too strict');
});

await step('every practice exercise has hints', async () => {
  const bad = await page.evaluate(() => {
    const out = [];
    window.CP_ROLES.forEach(r => r.skills.forEach(s => s.practice.forEach((ex, i) => {
      if (!ex.hints || ex.hints.length < 2) out.push(s.id + '#' + i);
      if (ex.kind === 'query' && (!ex.schema || !ex.solution)) out.push(s.id + '#' + i + ' (no schema/solution)');
      const c = ex.check;
      if (!c || (!c.must.length && !c.points.length)) out.push(s.id + '#' + i + ' (no check)');
      if (ex.kind === 'query' && c && !c.must.length) out.push(s.id + '#' + i + ' (query with no requirements)');
    })));
    return out;
  });
  if (bad.length) throw new Error('incomplete: ' + bad.join(', '));
});

/* ---------- admin ---------- */

await step('admin signs in to a different surface', async () => {
  await page.click('[data-action="logout"]');
  await page.waitForTimeout(150);
  await page.fill('#li-email', 'admin@careerpath.com'); await page.fill('#li-pass', 'admin');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(200);
  const items = await nav();
  if (items.join(',') !== 'Content,Review queue,Weekly challenge,Students') throw new Error('admin nav = ' + items.join(','));
  const h = await page.textContent('.page-head h1');
  if (!h.includes('Roadmaps')) throw new Error('admin landed on: ' + h);
  if ((await page.textContent('#sidebar')).includes('Leaderboard')) throw new Error('admin sees student nav');
});

await page.screenshot({ path: 'shot-admin-content.png' });

await step('admin opens a question bank with versions', async () => {
  await page.click('[data-action="a-open"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('#view');
  if (!/v1/.test(t)) throw new Error('no version numbers shown');
  if (!t.includes('Preview assessment as student')) throw new Error('preview control missing');
});

await step('editing creates a draft, not a live change', async () => {
  const before = await page.evaluate(() => {
    const s = window.CP_ROLES[0].skills[0];
    return { q: s.assessment[0].q, v: s.assessment[0].v, drafts: s.drafts.length };
  });
  await page.click('[data-action="a-edit"]');
  await page.waitForTimeout(150);
  await page.fill('#ae-q', 'DRAFTED QUESTION TEXT');
  await page.click('[data-action="a-save"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const s = window.CP_ROLES[0].skills[0];
    return { q: s.assessment[0].q, v: s.assessment[0].v, drafts: s.drafts.length };
  });
  if (after.q !== before.q) throw new Error('live question changed before publish');
  if (after.v !== before.v) throw new Error('version bumped before publish');
  if (after.drafts !== before.drafts + 1) throw new Error('draft not created');
  const h = await page.textContent('.page-head h1');
  if (!h.includes('drafts')) throw new Error('did not land on review queue: ' + h);
});

await step('review queue shows a current vs proposed diff', async () => {
  const t = await page.textContent('#view');
  if (!t.includes('Currently live')) throw new Error('no current column');
  if (!t.includes('Proposed')) throw new Error('no proposed column');
  if (!t.includes('DRAFTED QUESTION TEXT')) throw new Error('proposed text missing');
  const changed = await page.$$('.diff-field.changed');
  if (changed.length < 2) throw new Error('changed fields not highlighted');
});

await page.screenshot({ path: 'shot-review.png' });

await step('publishing bumps the version and archives the old one', async () => {
  await page.click('[data-action="a-publish"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const s = window.CP_ROLES[0].skills[0];
    return { q: s.assessment[0].q, v: s.assessment[0].v, drafts: s.drafts.length, archive: s.archive.length };
  });
  if (after.q !== 'DRAFTED QUESTION TEXT') throw new Error('publish did not apply');
  if (after.v !== 2) throw new Error('version is ' + after.v + ', expected 2');
  if (after.drafts !== 0) throw new Error('draft not cleared');
  if (after.archive !== 1) throw new Error('old version not archived');
  console.log('     live now v' + after.v + ', archive holds ' + after.archive + ' version');
});

await step('version history is visible on the question', async () => {
  await page.click('[data-nav="a-content"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="a-open"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="a-history"]');
  await page.waitForTimeout(150);
  const t = await page.textContent('#view');
  if (!t.includes('Superseded')) throw new Error('archived version not listed');
});

await step('adding a question also goes through the queue', async () => {
  await page.click('[data-action="a-new"]');
  await page.waitForTimeout(150);
  await page.fill('#ae-q', 'BRAND NEW QUESTION');
  for (let j = 0; j < 4; j++) await page.fill('#ae-o' + j, 'Choice ' + j);
  await page.click('[data-action="a-save"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('#view');
  if (!t.includes('New question')) throw new Error('new-question draft not shown');
  const liveBefore = await page.evaluate(() => window.CP_ROLES[0].skills[0].assessment.length);
  await page.click('[data-action="a-publish"]');
  await page.waitForTimeout(200);
  const liveAfter = await page.evaluate(() => window.CP_ROLES[0].skills[0].assessment.length);
  if (liveAfter !== liveBefore + 1) throw new Error('new question not added on publish');
});

await step('lessons publish directly, no queue', async () => {
  await page.click('[data-nav="a-content"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="a-lessons"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="al-edit"]');
  await page.waitForTimeout(150);
  await page.fill('#al-t', 'EDITED LESSON TITLE');
  await page.click('[data-action="al-save"]');
  await page.waitForTimeout(200);
  const live = await page.evaluate(() => window.CP_ROLES[0].skills[0].lessons[0].title);
  if (live !== 'EDITED LESSON TITLE') throw new Error('lesson edit did not publish');
  const drafts = await page.evaluate(() => window.CP_ROLES[0].skills[0].drafts.length);
  if (drafts !== 0) throw new Error('lesson edit wrongly created a draft');
});

/* ---------- preview mode ---------- */

await step('preview opens the student course view with a banner', async () => {
  await page.click('[data-action="preview"][data-mode="learn"]');
  await page.waitForTimeout(200);
  if (!(await page.$('.preview-bar'))) throw new Error('no preview banner');
  const t = await page.textContent('.preview-bar');
  if (!t.includes('Nothing here is recorded')) throw new Error('banner copy missing');
  if (!(await page.$('.lesson-nav'))) throw new Error('not the student lesson view');
});

await page.screenshot({ path: 'shot-preview.png' });

await step('preview assessment records nothing for anyone', async () => {
  const before = await page.evaluate(() =>
    window.__cpUsers ? 0 : document.querySelector('.who-sub').textContent);
  await page.click('[data-action="exit-preview"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="preview"][data-mode="assess"]');
  await page.waitForTimeout(200);
  let guard = 0;
  while ((await page.$$('[data-action="exam-answer"]')).length && guard++ < 30) {
    const opts = await page.$$('[data-action="exam-answer"]');
    await opts[0].click();
    await page.waitForTimeout(40);
  }
  const t = await page.textContent('#view');
  if (!t.includes('Preview only')) throw new Error('result did not flag preview');
  if (!(await page.$('.preview-bar'))) throw new Error('banner lost on result page');
  const after = await page.evaluate(() => document.querySelector('.who-sub').textContent);
  if (after !== before) throw new Error('admin sidebar changed: ' + before + ' -> ' + after);
  const studentTouched = await page.evaluate(() => {
    const u = window.__cp && window.__cp.users;
    return false;
  });
  if (studentTouched) throw new Error('student data mutated by preview');
});

await step('exiting preview returns to the question bank', async () => {
  await page.click('[data-action="exit-preview"]');
  await page.waitForTimeout(200);
  if (await page.$('.preview-bar')) throw new Error('banner still showing');
  const h = await page.textContent('.page-head h1');
  if (!h.trim()) throw new Error('no heading after exit');
});

await step('admin students table is read-only', async () => {
  await page.click('[data-nav="a-students"]');
  await page.waitForTimeout(200);
  const rows = await page.$$('table.grid tbody tr');
  if (rows.length < 5) throw new Error('rows=' + rows.length);
  const t = await page.textContent('#view');
  if (!t.includes('Read-only')) throw new Error('read-only note missing');
  if (await page.$('table.grid input, table.grid select')) throw new Error('editable field in students table');
  const btns = await page.$$eval('table.grid button', bs => [...new Set(bs.map(b => b.className))]);
  if (btns.some(c => c !== 'linkbtn')) throw new Error('non-link control in students table: ' + btns.join('|'));
});

await step('clicking a student name opens their profile', async () => {
  const name = await page.textContent('table.grid tbody tr:first-child .linkbtn');
  await page.click('table.grid tbody tr:first-child .linkbtn');
  await page.waitForTimeout(200);
  const h = await page.textContent('.page-head h1');
  if (h.trim() !== name.trim()) throw new Error('opened ' + h + ', expected ' + name);
  const t = await page.textContent('#view');
  for (const section of ['Roadmap progress', 'Assessment history', 'Certificates issued']) {
    if (!t.includes(section)) throw new Error('missing section: ' + section);
  }
  const cols = await page.$$eval('table.grid thead th', ts => ts.map(t => t.textContent));
  for (const c of ['Status', 'Stars', 'Best', 'Attempts', 'Modules read', 'Project']) {
    if (!cols.includes(c)) throw new Error('missing column: ' + c);
  }
  if (!t.includes('Read-only')) throw new Error('read-only note missing on profile');
});

await step('profile distinguishes studying from verified', async () => {
  await page.click('[data-nav="a-students"]');
  await page.waitForTimeout(150);
  await page.fill('#sf-q', 'Pratham');
  await page.waitForTimeout(200);
  await page.click('table.grid tbody tr:first-child .linkbtn');
  await page.waitForTimeout(200);
  const pills = await page.$$eval('table.grid tbody tr td:nth-child(2)', ts => ts.map(t => t.textContent.trim()));
  if (!pills.some(p => /Job-ready|Basic application/.test(p))) throw new Error('no verified rows: ' + pills.join('|'));
  if (!pills.some(p => p === 'Not started')) throw new Error('no not-started rows: ' + pills.join('|'));
  const hist = await page.$$('table.grid tbody tr');
  if (hist.length < 6) throw new Error('profile tables look empty');
});

await step('back returns to the filtered student list', async () => {
  await page.click('[data-nav="a-students"]');
  await page.waitForTimeout(200);
  const h = await page.textContent('.page-head h1');
  if (!h.includes('Registered')) throw new Error('got: ' + h);
  await page.click('[data-action="sf-clear"]');
  await page.waitForTimeout(150);
});

await step('students filter by target role', async () => {
  const before = (await page.$$('table.grid tbody tr')).length;
  await page.selectOption('#sf-role', 'ba');
  await page.waitForTimeout(150);
  const after = (await page.$$('table.grid tbody tr')).length;
  if (after >= before) throw new Error('role filter did not narrow: ' + before + ' -> ' + after);
  const roles = await page.$$eval('table.grid tbody tr td:nth-child(3)', ts => [...new Set(ts.map(t => t.textContent))]);
  if (roles.length !== 1 || roles[0] !== 'Business Analyst') throw new Error('mixed roles: ' + roles.join('|'));
  const showing = await page.textContent('.summary-cell .v');
  if (!showing.includes('of')) throw new Error('summary does not show filtered count');
});

await step('students filter by school, combined with role', async () => {
  await page.selectOption('#sf-school', 'UCLA');
  await page.waitForTimeout(150);
  const t = await page.textContent('#view');
  if (!t.includes('No students match')) throw new Error('expected empty state for BA at UCLA');
  await page.selectOption('#sf-role', 'all');
  await page.waitForTimeout(150);
  const schools = await page.$$eval('table.grid tbody tr td:nth-child(2)', ts => [...new Set(ts.map(t => t.textContent))]);
  if (schools.length !== 1 || schools[0] !== 'UCLA') throw new Error('schools = ' + schools.join('|'));
});

await step('student search keeps focus while typing', async () => {
  await page.click('[data-action="sf-clear"]');
  await page.waitForTimeout(150);
  await page.click('#sf-q');
  await page.type('#sf-q', 'pri', { delay: 40 });
  await page.waitForTimeout(150);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  if (focused !== 'sf-q') throw new Error('focus lost, active = ' + focused);
  const val = await page.inputValue('#sf-q');
  if (val !== 'pri') throw new Error('input value = ' + val);
  const names = await page.$$eval('table.grid tbody tr td:first-child', ts => ts.map(t => t.textContent));
  if (names.length !== 1 || !names[0].includes('Priya')) throw new Error('search result = ' + names.join('|'));
});

await step('clear restores the full list', async () => {
  await page.click('[data-action="sf-clear"]');
  await page.waitForTimeout(150);
  const rows = (await page.$$('table.grid tbody tr')).length;
  if (rows < 10) throw new Error('rows after clear = ' + rows);
  const disabled = await page.$eval('[data-action="sf-clear"]', b => b.disabled);
  if (!disabled) throw new Error('clear button should be disabled when nothing is filtered');
});

/* ---------- regressions ---------- */

await step('student sees the admin-published question change', async () => {
  await page.click('[data-action="logout"]');
  await page.waitForTimeout(150);
  await page.click('[data-email="student@careerpath.com"]');
  await page.click('[data-action="login"]');
  await page.waitForTimeout(200);
  await page.click('.skill-row:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click('[data-action="start-exam"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('.q-card');
  if (!t.includes('DRAFTED QUESTION TEXT')) throw new Error('published edit not live for student');
  if (!/v2/.test(t)) throw new Error('version stamp missing on exam question');
});

await step('signup still creates a student, never an admin', async () => {
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.click('[data-tab="signup"]');
  await page.waitForTimeout(120);
  await page.fill('#su-name', 'Test Student');
  await page.fill('#su-email', 'test@usc.edu');
  await page.fill('#su-pass', 'pass');
  await page.click('[data-action="signup"]');
  await page.waitForTimeout(250);
  const items = await nav();
  if (items.indexOf('Content') > -1) throw new Error('signup produced an admin');
  // A new account starts at onboarding, which is skippable straight to the role picker.
  let h = await page.textContent('.page-head h1');
  if (!h.includes('resume')) throw new Error('signup did not land on onboarding: ' + h);
  await page.click('[data-action="onb-skip"]');
  await page.waitForTimeout(150);
  h = await page.textContent('.page-head h1');
  if (!h.includes('target role')) throw new Error('got: ' + h);
});

await step('mobile width has no horizontal scroll', async () => {
  await page.click('[data-role="fa"]');
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error('overflow ' + over + 'px');
});

await page.screenshot({ path: 'shot-mobile.png' });

console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno js errors');
console.log(failed ? '\n' + failed + ' FAILED' : '\nall steps passed');
await browser.close();
