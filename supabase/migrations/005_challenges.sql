-- 005_challenges.sql
-- Weekly challenge submissions, and the all-colleges challenge leaderboard.
-- Run once in the Supabase SQL editor, after 001 to 004. Safe to run again.
--
-- The challenge leaderboard is across ALL colleges (the course leaderboard stays per school).
-- Students cannot write to this table from the website. Only the grading function on the server
-- (api/grade-challenge.js, using the service role key kept in Vercel) can add a row, so a score
-- cannot be forged from the browser.

-- 1. One row per student per challenge.
create table if not exists public.challenge_submissions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  challenge_id text not null check (char_length(challenge_id) between 1 and 80),
  roadmap_id   text not null check (roadmap_id in ('pm', 'ba', 'pjm')),
  week_of      date not null,
  answer       text not null check (char_length(answer) between 1 and 12000),
  words        int  not null default 0 check (words between 0 and 5000),
  score        int  not null check (score between 0 and 100),
  hits         int  not null default 0 check (hits between 0 and 50),
  feedback     text not null default '' check (char_length(feedback) < 8000),
  created_at   timestamptz not null default now(),
  unique (user_id, challenge_id)
);
create index if not exists challenge_submissions_board
  on public.challenge_submissions (challenge_id, score desc, created_at);

-- 2. Security: a student reads only their own submissions; admins read all. Nobody writes from the site.
alter table public.challenge_submissions enable row level security;
revoke all on public.challenge_submissions from anon, authenticated;
grant select on public.challenge_submissions to authenticated;

drop policy if exists "challenge_submissions: read own" on public.challenge_submissions;
create policy "challenge_submissions: read own" on public.challenge_submissions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "challenge_submissions: admins read all" on public.challenge_submissions;
create policy "challenge_submissions: admins read all" on public.challenge_submissions
  for select to authenticated using (public.is_admin());

-- 3. The board for one challenge, every college together: the top 50 plus the caller.
-- Ranked by score, then by who submitted first. Returns a short name, school and score, never a full name
-- or an email. Students who switched off "show me on the leaderboard" are left out (but still see themselves).
create or replace function public.challenge_board(p_challenge text)
returns table (user_id uuid, display_name text, school text, score int, hits int, submitted_at timestamptz, rank int, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select s.user_id, p.name, p.school, s.score, s.hits, s.created_at
    from public.challenge_submissions s
    join public.profiles p on p.id = s.user_id
    where auth.uid() is not null
      and s.challenge_id = p_challenge
      and p.role = 'student'
      and (p.show_on_leaderboard or s.user_id = auth.uid())
  ),
  ranked as (
    select e.*, row_number() over (order by e.score desc, e.created_at, e.user_id)::int as rn
    from eligible e
  )
  select r.user_id, public.display_name(r.name), r.school, r.score, r.hits, r.created_at, r.rn, r.user_id = auth.uid()
  from ranked r
  where r.rn <= 50 or r.user_id = auth.uid()
  order by r.rn
$$;

revoke all on function public.challenge_board(text) from public, anon;
grant execute on function public.challenge_board(text) to authenticated;

-- 4. "Top school of the week": the best average score per college for one challenge.
-- A college needs at least 3 entrants to appear, so one strong student cannot carry a whole school.
create or replace function public.challenge_top_schools(p_challenge text)
returns table (school text, entrants int, average int, rank int)
language sql
stable
security definer
set search_path = public
as $$
  with per_school as (
    select min(btrim(p.school)) as school, count(*)::int as entrants, round(avg(s.score))::int as average
    from public.challenge_submissions s
    join public.profiles p on p.id = s.user_id
    where auth.uid() is not null
      and s.challenge_id = p_challenge
      and p.role = 'student'
      and p.show_on_leaderboard
      and btrim(coalesce(p.school, '')) <> ''
    group by lower(btrim(p.school))
    having count(*) >= 3
  )
  select ps.school, ps.entrants, ps.average, (row_number() over (order by ps.average desc, ps.entrants desc, ps.school))::int
  from per_school ps
  order by 4
  limit 10
$$;

revoke all on function public.challenge_top_schools(text) from public, anon;
grant execute on function public.challenge_top_schools(text) to authenticated;
