/* Runs the real migration files in supabase/migrations on an in-memory Postgres (PGlite) and checks the
   row-level security rules: who can read and write what. No network, no Supabase needed. */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
let failed = 0;
const step = async (label, fn) => {
  try { await fn(); console.log('ok   ' + label); }
  catch (e) { failed++; console.log('FAIL ' + label + ' :: ' + e.message); }
};
const need = (c, m) => { if (!c) throw new Error(m); };

const db = new PGlite();
// What Supabase provides before our files run.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
// A stand-in for Supabase Realtime: realtime.send() just records the message, as Supabase would broadcast it.
await db.exec(`
  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text, extension text default 'broadcast', event text, payload jsonb);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
    insert into realtime.messages (topic, event, payload) values (topic, event, payload) $$;
  grant usage on schema realtime to authenticated; grant select on realtime.messages to authenticated;
`);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const f of files) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
// Running every file a second time must not fail.
for (const f of files) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', ADM = '33333333-3333-4333-8333-333333333333';
for (const [id, email, name] of [[A, 'a@usc.edu', 'Ann'], [B, 'b@usc.edu', 'Bo'], [ADM, 'admin@x.com', 'Ada']]) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ name, school: 'USC', major: 'EM', grad_year: '2027' })]);
}
await db.exec(`update public.profiles set role = 'admin' where id = '${ADM}'`);

async function as(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role`); }
}
async function fails(uid, sql, params) {
  try { await as(uid, sql, params); } catch (e) { return String(e.message); }
  return null;
}

await step('signing up creates a student profile from the sign-up details', async () => {
  const r = await db.query(`select name, school, major, grad_year, role, points from public.profiles where id = $1`, [A]);
  need(r.rows[0].name === 'Ann' && r.rows[0].school === 'USC' && r.rows[0].role === 'student' && r.rows[0].points === 0, JSON.stringify(r.rows));
});
await step('a student sees only their own profile; an admin sees all', async () => {
  need((await as(A, `select id from public.profiles`)).rows.length === 1, 'student saw other profiles');
  need((await as(ADM, `select id from public.profiles`)).rows.length === 3, 'admin could not see all');
});
await step('a student cannot make themselves an admin or change their email', async () => {
  need(await fails(A, `update public.profiles set role = 'admin' where id = $1`, [A]), 'role edit allowed');
  need(await fails(A, `update public.profiles set email = 'x@x.com' where id = $1`, [A]), 'email edit allowed');
});
await step('a student can edit their own details and roadmap, but not someone else\'s', async () => {
  await as(A, `update public.profiles set school = 'UCLA', roadmap_id = 'pm', onboarding = '{"resume":null}' where id = $1`, [A]);
  await db.query(`update public.profiles set points = 120 where id = $1`, [A]);      // what the server does after grading
  const mine = await db.query(`select school, roadmap_id, points from public.profiles where id = $1`, [A]);
  need(mine.rows[0].school === 'UCLA' && mine.rows[0].roadmap_id === 'pm' && mine.rows[0].points === 120, JSON.stringify(mine.rows));
  await as(A, `update public.profiles set school = 'Hacked' where id = $1`, [B]);
  need((await db.query(`select school from public.profiles where id = $1`, [B])).rows[0].school === 'USC', 'another student was edited');
});
await step('invalid roadmaps, negative points and oversized data are refused', async () => {
  need(await fails(A, `update public.profiles set roadmap_id = 'da' where id = $1`, [A]), 'retired roadmap accepted');
  need(await fails(A, `update public.profiles set points = -5 where id = $1`, [A]), 'negative points accepted');
  need(await fails(A, `update public.profiles set roadmap_history = '{}'::jsonb where id = $1`, [A]), 'non-array history accepted');
});
await step('progress: a student reads only their own rows (the server writes them)', async () => {
  await db.query(`insert into public.skill_progress (user_id, skill_id, stars, best, attempts, lessons_done, history) values ($1, 'discovery-pm', 3, 82, 2, '{0,1,2}', '[{"pct":82}]')`, [A]);
  await db.query(`insert into public.skill_progress (user_id, skill_id, stars) values ($1, 'discovery-pm', 1)`, [B]);
  need((await as(A, `select * from public.skill_progress`)).rows.length === 1, 'A saw more than their own row');
  need((await as(B, `select * from public.skill_progress`)).rows[0].stars === 1, 'B saw the wrong row');
  need((await as(ADM, `select * from public.skill_progress`)).rows.length === 2, 'admin could not read all');
});
await step('progress: writing a row for another student is refused', async () => {
  need(await fails(A, `insert into public.skill_progress (user_id, skill_id) values ($1, 'x-pm')`, [B]), 'insert for another user allowed');
  need(await fails(A, `update public.skill_progress set stars = 5 where user_id = $1`, [B]), 'update of another student allowed');
  need((await db.query(`select stars from public.skill_progress where user_id = $1`, [B])).rows[0].stars === 1, 'another student\'s progress was changed');
});
const dbFails = async (sql, params) => { try { await db.query(sql, params); } catch (e) { return String(e.message); } return null; };
await step('progress: impossible values are refused even from the server', async () => {
  need(await dbFails(`insert into public.skill_progress (user_id, skill_id, stars) values ($1, 'y-pm', 6)`, [A]), 'six stars accepted');
  need(await dbFails(`insert into public.skill_progress (user_id, skill_id, best) values ($1, 'z-pm', 101)`, [A]), 'score over 100 accepted');
  need(await dbFails(`insert into public.module_results (user_id, track_id, history) values ($1, 'm', '{}'::jsonb)`, [A]), 'bad history accepted');
});
await step('progress: saving the same skill twice updates it, and the update time moves', async () => {
  const before = (await db.query(`select updated_at from public.skill_progress where user_id = $1`, [A])).rows[0].updated_at;
  await new Promise(r => setTimeout(r, 20));
  await db.query(`insert into public.skill_progress (user_id, skill_id, stars, attempts) values ($1, 'discovery-pm', 4, 3)
                  on conflict (user_id, skill_id) do update set stars = excluded.stars, attempts = excluded.attempts`, [A]);
  const r = (await db.query(`select stars, attempts, updated_at from public.skill_progress where user_id = $1`, [A])).rows[0];
  need(r.stars === 4 && r.attempts === 3 && new Date(r.updated_at) > new Date(before), JSON.stringify(r));
});
await step('module results follow the same rules', async () => {
  await db.query(`insert into public.module_results (user_id, track_id, best, attempts, passed, passed_on) values ($1, 'pm-fundamentals', 90, 1, true, 'Oct 26, 2026')`, [A]);
  need((await as(B, `select * from public.module_results`)).rows.length === 0, 'B saw A\'s module result');
  need(await fails(B, `insert into public.module_results (user_id, track_id) values ($1, 'm2')`, [A]), 'insert for another user allowed');
});
await step('visitors who are not signed in can read nothing', async () => {
  await db.exec(`set role anon`);
  const errs = [];
  for (const t of ['profiles', 'skill_progress', 'module_results']) {
    try { await db.query(`select * from public.${t}`); errs.push(t + ' readable'); } catch { /* expected */ }
  }
  await db.exec(`reset role`);
  need(errs.length === 0, errs.join(', '));
});
await step('leaderboard: ranks same-school students on a roadmap, shows short names only', async () => {
  const C = '44444444-4444-4444-8444-444444444444', D = '55555555-5555-4555-8555-555555555555';
  for (const [id, email, name, school] of [[C, 'c@usc.edu', 'Priya Chavan Rao', 'USC'], [D, 'd@ucla.edu', 'Dev Patel', 'UCLA']]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ name, school, major: 'EM', grad_year: '2027' })]);
  }
  await db.exec(`update public.profiles set roadmap_id = 'pm', school = 'USC', points = 120 where id = '${A}';
                 update public.profiles set roadmap_id = 'pm', school = 'USC', points = 900 where id = '${C}';
                 update public.profiles set roadmap_id = 'pm', school = 'UCLA', points = 5000 where id = '${D}'`);
  await db.exec(`insert into public.skill_progress (user_id, skill_id, stars) values ('${C}', 'discovery-pm', 4), ('${C}', 'prd-pm', 2), ('${C}', 'sql-ba', 5)`);
  const r = (await as(A, `select * from public.leaderboard('pm', 'USC')`)).rows;
  need(r.length === 2, 'expected 2 USC students, got ' + r.length);
  need(r[0].display_name === 'Priya R.' && r[0].points === 900 && r[0].total_stars === 6 && r[0].job_ready === 1, JSON.stringify(r[0]));
  need(r[1].is_me === true && r[1].display_name === 'Ann', 'caller row missing: ' + JSON.stringify(r[1]));
  need(!JSON.stringify(r).includes('@') && !JSON.stringify(r).includes('Chavan'), 'full name or email leaked');
  need(!r.some(x => x.points === 5000), 'another school appeared');
});
await step('leaderboard: a student cannot ask for another school, and visitors get nothing', async () => {
  need((await as(A, `select * from public.leaderboard('pm', 'UCLA')`)).rows.length === 0, 'another school readable');
  need((await as(A, `select * from public.leaderboard('pm; drop', 'USC')`)).rows.length === 0, 'odd roadmap accepted');
  await db.exec(`set role anon`);
  let blocked = false;
  try { await db.query(`select * from public.leaderboard('pm', 'USC')`); } catch { blocked = true; }
  await db.exec(`reset role`);
  need(blocked, 'visitor could call the leaderboard');
});
await step('leaderboard: hiding yourself removes you for others but not for you', async () => {
  const C = '44444444-4444-4444-8444-444444444444';
  await as(C, `update public.profiles set show_on_leaderboard = false where id = $1`, [C]);
  need((await as(A, `select * from public.leaderboard('pm', 'USC')`)).rows.length === 1, 'hidden student still shown');
  need((await as(C, `select * from public.leaderboard('pm', 'USC')`)).rows.some(x => x.is_me), 'hidden student cannot see own row');
});
await step('leaderboard: the admin can read a board', async () => {
  need((await as(ADM, `select * from public.leaderboard('pm', 'UCLA')`)).rows.length === 1, 'admin could not read UCLA');
});
await step('delete my account removes everything, and admins cannot use it', async () => {
  const D = '55555555-5555-4555-8555-555555555555';
  await db.exec(`insert into public.skill_progress (user_id, skill_id, stars) values ('${D}', 'x-pm', 2)`);
  await as(D, `select public.delete_my_account()`);
  need((await db.query(`select 1 from auth.users where id = $1`, [D])).rows.length === 0, 'sign-in left behind');
  need((await db.query(`select 1 from public.profiles where id = $1`, [D])).rows.length === 0, 'profile left behind');
  need((await db.query(`select 1 from public.skill_progress where user_id = $1`, [D])).rows.length === 0, 'progress left behind');
  need(await fails(ADM, `select public.delete_my_account()`), 'admin could delete themselves');
});
await step('deleting an account removes the profile and its progress', async () => {
  await db.query(`delete from auth.users where id = $1`, [B]);
  need((await db.query(`select 1 from public.profiles where id = $1`, [B])).rows.length === 0, 'profile left behind');
  need((await db.query(`select 1 from public.skill_progress where user_id = $1`, [B])).rows.length === 0, 'progress left behind');
});

/* ---- 005: weekly challenge submissions and the all-colleges board ---- */
const U = n => `55555555-5555-4555-8555-55555555555${n}`;
const people = [[1, 'Una Park', 'USC', 90], [2, 'Vik Rao', 'USC', 80], [3, 'Wes Lin', 'USC', 70], [4, 'Xia Chen', 'UCLA', 95], [5, 'Yan Zhu', 'NYU', 60]];
for (const [n, name, school] of people) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [U(n), `u${n}@x.edu`, JSON.stringify({ name, school, major: 'EM', grad_year: '2027' })]);
}
for (const [n, , , score] of people) {
  await db.query(`insert into public.challenge_submissions (user_id, challenge_id, roadmap_id, week_of, answer, words, score, hits)
                  values ($1, 'pm-w1', 'pm', '2026-10-26', 'my answer', 100, $2, 3)`, [U(n), score]);
}

await step('challenge: students cannot write submissions from the site, only read their own', async () => {
  need(await fails(U(1), `insert into public.challenge_submissions (user_id, challenge_id, roadmap_id, week_of, answer, score) values ($1, 'pm-w2', 'pm', '2026-11-02', 'x', 100)`, [U(1)]), 'student inserted a submission');
  need(await fails(U(1), `update public.challenge_submissions set score = 100 where user_id = $1`, [U(1)]), 'student edited a score');
  need(await fails(U(1), `delete from public.challenge_submissions where user_id = $1`, [U(1)]), 'student deleted a submission');
  const mine = (await as(U(1), `select user_id from public.challenge_submissions`)).rows;
  need(mine.length === 1 && mine[0].user_id === U(1), 'student saw other rows: ' + mine.length);
  need((await as(ADM, `select 1 from public.challenge_submissions`)).rows.length === 5, 'admin could not read all');
});
await step('challenge: one attempt per student per challenge, and scores stay within 0 to 100', async () => {
  let dup = false; try { await db.query(`insert into public.challenge_submissions (user_id, challenge_id, roadmap_id, week_of, answer, score) values ($1, 'pm-w1', 'pm', '2026-10-26', 'again', 50)`, [U(1)]); } catch { dup = true; }
  need(dup, 'second attempt accepted');
  let bad = false; try { await db.query(`insert into public.challenge_submissions (user_id, challenge_id, roadmap_id, week_of, answer, score) values ($1, 'pm-w9', 'pm', '2026-10-26', 'x', 101)`, [U(1)]); } catch { bad = true; }
  need(bad, 'score above 100 accepted');
});
await step('challenge board: every college together, ranked by score, short names and school only', async () => {
  const r = (await as(U(5), `select * from public.challenge_board('pm-w1')`)).rows;
  need(r.length === 5, 'rows = ' + r.length);
  need(r.map(x => x.score).join() === '95,90,80,70,60', r.map(x => x.score).join());
  need(r[0].display_name === 'Xia C.' && r[0].school === 'UCLA' && r[0].rank === 1, JSON.stringify(r[0]));
  need(r[4].is_me === true && r.filter(x => x.is_me).length === 1, 'is_me wrong');
  need(!Object.keys(r[0]).some(k => /email|answer|feedback|name$/.test(k) && k !== 'display_name'), 'board leaks a column: ' + Object.keys(r[0]));
});
await step('challenge board: visitors get nothing, and an unknown challenge is empty', async () => {
  await db.exec(`set role anon`);
  let blocked = false; try { await db.query(`select * from public.challenge_board('pm-w1')`); } catch { blocked = true; }
  await db.exec(`reset role`);
  need(blocked, 'visitor could call the board');
  need((await as(U(1), `select * from public.challenge_board('nope')`)).rows.length === 0, 'unknown challenge returned rows');
});
await step('challenge board: a tie goes to whoever submitted first; hiding removes you for others only', async () => {
  await db.query(`update public.challenge_submissions set score = 90, created_at = now() - interval '1 day' where user_id = $1`, [U(4)]);
  let r = (await as(U(5), `select display_name from public.challenge_board('pm-w1') order by rank`)).rows.map(x => x.display_name);
  need(r[0] === 'Xia C.' && r[1] === 'Una P.', 'tie order: ' + r.join());
  await as(U(2), `update public.profiles set show_on_leaderboard = false where id = $1`, [U(2)]);
  r = (await as(U(5), `select display_name from public.challenge_board('pm-w1')`)).rows.map(x => x.display_name);
  need(r.length === 4 && !r.includes('Vik R.'), 'hidden student still shown: ' + r.join());
  need((await as(U(2), `select 1 from public.challenge_board('pm-w1') where is_me`)).rows.length === 1, 'hidden student cannot see themselves');
});
await step('challenge top schools: a college needs 3 entrants, and one student cannot carry it', async () => {
  await as(U(2), `update public.profiles set show_on_leaderboard = true where id = $1`, [U(2)]);
  const r = (await as(U(5), `select * from public.challenge_top_schools('pm-w1')`)).rows;
  need(r.length === 1 && r[0].school === 'USC' && r[0].entrants === 3 && r[0].average === 80 && r[0].rank === 1, JSON.stringify(r));
  await db.exec(`set role anon`);
  let blocked = false; try { await db.query(`select * from public.challenge_top_schools('pm-w1')`); } catch { blocked = true; }
  await db.exec(`reset role`);
  need(blocked, 'visitor could call top schools');
});
await step('challenge: deleting an account removes its submissions', async () => {
  await db.query(`delete from auth.users where id = $1`, [U(5)]);
  need((await db.query(`select 1 from public.challenge_submissions where user_id = $1`, [U(5)])).rows.length === 0, 'submission left behind');
});

/* ---- 006: live leaderboards (Realtime) ---- */
const sent = async () => (await db.query(`select topic, event, payload from realtime.messages order by id`)).rows;
const clear = () => db.exec(`delete from realtime.messages`);
const R1 = '66666666-6666-4666-8666-666666666661', R2 = '66666666-6666-4666-8666-666666666662', R3 = '66666666-6666-4666-8666-666666666663';
for (const [id, name, school] of [[R1, 'Rae One', 'University of Michigan'], [R2, 'Sam Two', 'USC'], [R3, 'Tia Three', 'UCLA']]) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, id.slice(-1) + '@r.edu', JSON.stringify({ name, school, major: 'EM', grad_year: '2027' })]);
}
await db.exec(`update public.profiles set roadmap_id = 'pm' where id in ('${R1}','${R2}')`);

await step('live: a points change sends one empty "changed" message on that school and roadmap channel', async () => {
  await clear();
  await db.query(`update public.profiles set points = 40 where id = $1`, [R1]);
  const m = await sent();
  need(m.length === 1 && m[0].topic === 'board:university-of-michigan:pm' && m[0].event === 'changed', JSON.stringify(m));
  need(JSON.stringify(m[0].payload) === '{}', 'the message carries data: ' + JSON.stringify(m[0].payload));
});
await step('live: a change that cannot move the board sends nothing', async () => {
  await clear();
  await as(R1, `update public.profiles set major = 'CS' where id = $1`, [R1]);
  await db.query(`update public.profiles set points = 40 where id = $1`, [R1]);
  need((await sent()).length === 0, 'unnecessary message sent');
});
await step('live: star changes on a skill ping the board, a repeat save of the same stars does not', async () => {
  await clear();
  await db.query(`insert into public.skill_progress (user_id, skill_id, stars, best, attempts) values ($1, 'sql-foundations-pm', 3, 80, 1)`, [R2]);
  let m = await sent();
  need(m.length === 1 && m[0].topic === 'board:usc:pm', JSON.stringify(m));
  await clear();
  await db.query(`update public.skill_progress set attempts = 2 where user_id = $1`, [R2]);
  need((await sent()).length === 0, 'same stars still sent a message');
  await db.query(`update public.skill_progress set stars = 4 where user_id = $1`, [R2]);
  need((await sent()).length === 1, 'star change sent no message');
});
await step('live: switching roadmap or school tells both the board you left and the board you joined', async () => {
  await clear();
  await as(R2, `update public.profiles set roadmap_id = 'pjm' where id = $1`, [R2]);
  let t = (await sent()).map(x => x.topic).sort();
  need(t.join() === 'board:usc:pjm,board:usc:pm', t.join());
  await clear();
  await as(R2, `update public.profiles set school = 'NYU' where id = $1`, [R2]);
  t = (await sent()).map(x => x.topic).sort();
  need(t.join() === 'board:nyu:pjm,board:usc:pjm', t.join());
});
await step('live: hiding yourself, and deleting your account, update the boards too', async () => {
  await clear();
  await as(R1, `update public.profiles set show_on_leaderboard = false where id = $1`, [R1]);
  need((await sent()).some(x => x.topic === 'board:university-of-michigan:pm'), 'hide sent nothing');
  await clear();
  await db.query(`delete from auth.users where id = $1`, [R2]);
  need((await sent()).some(x => x.topic === 'board:nyu:pjm'), 'delete sent nothing');
});
await step('live: a new challenge submission pings that challenge channel', async () => {
  await clear();
  await db.query(`insert into public.challenge_submissions (user_id, challenge_id, roadmap_id, week_of, answer, score) values ($1, 'pm-w7', 'pm', '2026-11-02', 'x', 70)`, [R1]);
  const m = await sent();
  need(m.length === 1 && m[0].topic === 'challenge:pm-w7' && JSON.stringify(m[0].payload) === '{}', JSON.stringify(m));
  await clear();
  await as(R1, `update public.profiles set show_on_leaderboard = true where id = $1`, [R1]);
  need((await sent()).some(x => x.topic === 'challenge:pm-w7'), 'visibility change did not ping the challenge board');
});
await step('live: who may listen. Own school boards and challenge channels only, and nobody can send', async () => {
  await db.exec(`delete from realtime.messages`);
  for (const t of ['board:university-of-michigan:pm', 'board:ucla:pm', 'challenge:pm-w7']) await db.query(`insert into realtime.messages (topic) values ($1)`, [t]);
  const listen = async (uid, topic) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('realtime.topic', '${topic}', false)`);
    try { return (await db.query(`select topic from realtime.messages where topic = '${topic}'`)).rows.length; } finally { await db.exec(`reset role`); }
  };
  need(await listen(R1, 'board:university-of-michigan:pm') === 1, 'student cannot hear their own school');
  need(await listen(R1, 'board:ucla:pm') === 0, 'student can hear another school');
  need(await listen(R3, 'board:ucla:pm') === 1, 'UCLA student cannot hear UCLA');
  need(await listen(R3, 'challenge:pm-w7') === 1, 'student cannot hear a challenge channel');
  need(await fails(R1, `insert into realtime.messages (topic) values ('board:university-of-michigan:pm')`), 'a student could send a message');
  await db.exec(`reset role`);
});
await step('live: a Realtime failure never stops a score from saving', async () => {
  await db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$`);
  await db.query(`update public.profiles set points = 99 where id = $1`, [R1]);
  need((await db.query(`select points from public.profiles where id = $1`, [R1])).rows[0].points === 99, 'score lost while Realtime was down');
  await db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages (topic, event, payload) values (topic, event, payload) $$`);
});
await step('live: channel names are one spelling for one school', async () => {
  const r = (await db.query(`select public.board_slug('  University of Michigan ') a, public.board_slug('U.S.C.') b, public.board_slug(null) c, public.board_slug('Georgia Tech') d`)).rows[0];
  need(r.a === 'university-of-michigan' && r.b === 'u-s-c' && r.c === '' && r.d === 'georgia-tech', JSON.stringify(r));
});

// ---- 007: scores, stars and points are written by the server only ----
const S1 = '77777777-7777-4777-8777-777777777771', S2 = '77777777-7777-4777-8777-777777777772';
for (const [id, name] of [[S1, 'Sia One'], [S2, 'Tom Two']]) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, id.slice(-1) + '@s.edu', JSON.stringify({ name, school: 'USC', major: 'EM', grad_year: '2027' })]);
}
await db.exec(`grant all on all tables in schema public to service_role`);
async function svc(sql, params) {
  await db.exec(`set role service_role`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role`); }
}
await step('grading: a student cannot write stars, scores, history, projects or module results from the site', async () => {
  need(await fails(S1, `insert into public.skill_progress (user_id, skill_id, stars) values ($1, 'discovery-pm', 5)`, [S1]), 'inserted a skill row');
  await svc(`insert into public.skill_progress (user_id, skill_id, stars, best, attempts) values ($1, 'discovery-pm', 2, 70, 1)`, [S1]);
  need(await fails(S1, `update public.skill_progress set stars = 5, best = 100, project = true where user_id = $1`, [S1]), 'raised own stars');
  need(await fails(S1, `update public.skill_progress set skill_id = 'prd-pm' where user_id = $1`, [S1]), 'renamed a row to move stars');
  need(await fails(S1, `delete from public.skill_progress where user_id = $1`, [S1]), 'deleted own progress');
  need(await fails(S1, `insert into public.module_results (user_id, track_id, passed) values ($1, 'pm-fundamentals', true)`, [S1]), 'inserted a module pass');
  need(await fails(S1, `update public.module_results set passed = true where user_id = $1`, [S1]), 'edited a module result');
  const r = (await svc(`select stars, best from public.skill_progress where user_id = $1`, [S1])).rows[0];
  need(r.stars === 2 && r.best === 70, JSON.stringify(r));
});
await step('grading: a student cannot set their own points, the server adds them in one step', async () => {
  need(await fails(S1, `update public.profiles set points = 99999 where id = $1`, [S1]), 'points edited by the student');
  need(await fails(S1, `select public.add_points($1, 500)`, [S1]), 'a student called add_points');
  const a = (await svc(`select public.add_points($1, 250) as p`, [S1])).rows[0].p;
  const b = (await svc(`select public.add_points($1, 100) as p`, [S1])).rows[0].p;
  need(a === 250 && b === 350, a + ' ' + b);
  need((await svc(`select public.add_points($1, -9999) as p`, [S1])).rows[0].p === 0, 'points went below zero');
  await db.exec(`set role anon`); let blocked = false;
  try { await db.query(`select public.add_points($1, 5)`, [S1]); } catch { blocked = true; } await db.exec(`reset role`);
  need(blocked, 'a visitor called add_points');
});
await step('grading: save_lessons saves only the lessons list for the signed-in student, and never removes lessons', async () => {
  await as(S2, `select public.save_lessons('foundations-pm', '{2,0,1}')`);
  await as(S2, `select public.save_lessons('foundations-pm', '{1,5}')`);
  const r = (await svc(`select lessons_done, stars, attempts, project from public.skill_progress where user_id = $1 and skill_id = 'foundations-pm'`, [S2])).rows[0];
  need(JSON.stringify(r.lessons_done) === '[0,1,2,5]' && r.stars === 0 && r.attempts === 0 && r.project === false, JSON.stringify(r));
  await svc(`update public.skill_progress set stars = 3, best = 80, attempts = 2 where user_id = $1 and skill_id = 'foundations-pm'`, [S2]);
  await as(S2, `select public.save_lessons('foundations-pm', '{9}')`);
  const k = (await svc(`select lessons_done, stars, best, attempts from public.skill_progress where user_id = $1 and skill_id = 'foundations-pm'`, [S2])).rows[0];
  need(JSON.stringify(k.lessons_done) === '[0,1,2,5,9]' && k.stars === 3 && k.best === 80 && k.attempts === 2, 'saving lessons changed the score: ' + JSON.stringify(k));
  need(await fails(S2, `select public.save_lessons('', '{1}')`), 'empty skill id accepted');
  await db.exec(`set role anon`); let blocked = false;
  try { await db.query(`select public.save_lessons('x', '{1}')`); } catch { blocked = true; } await db.exec(`reset role`);
  need(blocked, 'a visitor saved lessons');
});
await step('grading: exam attempts are readable by their owner and admins, and written only by the server', async () => {
  await svc(`insert into public.exam_attempts (user_id, kind, target, items) values ($1, 'skill', 'discovery-pm', '[{"skill":"discovery-pm","qid":"discovery-pm-q1"}]')`, [S1]);
  need((await as(S1, `select * from public.exam_attempts`)).rows.length === 1, 'owner cannot read own attempt');
  need((await as(S2, `select * from public.exam_attempts`)).rows.length === 0, 'another student read it');
  need((await as(ADM, `select * from public.exam_attempts`)).rows.length === 1, 'admin cannot read');
  need(await fails(S1, `insert into public.exam_attempts (user_id, kind, target) values ($1, 'skill', 'x')`, [S1]), 'student created an attempt');
  need(await fails(S1, `update public.exam_attempts set score = 100 where user_id = $1`, [S1]), 'student edited an attempt');
  need(await fails(S1, `delete from public.exam_attempts where user_id = $1`, [S1]), 'student deleted an attempt');
  need(await dbFails(`insert into public.exam_attempts (user_id, kind, target, score) values ($1, 'skill', 'x', 101)`, [S1]), 'score over 100 accepted');
  need(await dbFails(`insert into public.exam_attempts (user_id, kind, target) values ($1, 'nonsense', 'x')`, [S1]), 'unknown kind accepted');
});

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
