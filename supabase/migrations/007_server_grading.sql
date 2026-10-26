-- 007_server_grading.sql
-- Scores, stars and points are now set only by the server (api/exam.js, api/grade-project.js, api/grade-challenge.js),
-- which uses the service role key. A signed-in student keeps the right to read their own rows and to save which lessons
-- they have opened, and nothing else on these tables.
-- Run once in the Supabase SQL editor, after 001 to 006. Safe to run again.
--
-- Order of deployment: push the new site first (it no longer tries to write scores), set SUPABASE_SERVICE_ROLE_KEY in
-- Vercel, then run this file. Running it earlier would make an old copy of the site fail to save.

-- 1. Exam attempts: the server draws the questions, records the attempt, and closes it when graded.
create table if not exists public.exam_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('skill', 'module', 'project')),
  target       text not null check (char_length(target) between 1 and 80),
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 32768),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  answers      jsonb,
  score        int check (score between 0 and 100),
  "right"      int
);
create index if not exists exam_attempts_user_started on public.exam_attempts (user_id, started_at desc);

alter table public.exam_attempts enable row level security;
drop policy if exists "exam_attempts: read own" on public.exam_attempts;
create policy "exam_attempts: read own" on public.exam_attempts for select to authenticated using (user_id = auth.uid());
drop policy if exists "exam_attempts: admins read all" on public.exam_attempts;
create policy "exam_attempts: admins read all" on public.exam_attempts for select to authenticated using (public.is_admin());
revoke all on public.exam_attempts from anon, authenticated;
grant select on public.exam_attempts to authenticated;       -- reads only; the server writes with the service role

-- 2. The browser may no longer write scores. It keeps one write: the list of lessons it has opened, through a function
--    that can touch nothing else on the row (a direct update could also rename the row and move stars to another skill).
revoke insert, update, delete on public.skill_progress from authenticated;
revoke insert, update, delete on public.module_results from authenticated;     -- read only for students now

create or replace function public.save_lessons(p_skill text, p_done int[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  merged int[];
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_skill is null or char_length(p_skill) not between 1 and 80 then raise exception 'bad skill'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into merged
    from unnest(coalesce(p_done, '{}') || coalesce((select lessons_done from public.skill_progress where user_id = uid and skill_id = p_skill), '{}')) as x
   where x between 0 and 199;
  insert into public.skill_progress (user_id, skill_id, lessons_done) values (uid, p_skill, merged)
  on conflict (user_id, skill_id) do update set lessons_done = excluded.lessons_done;
end;
$$;
revoke all on function public.save_lessons(text, int[]) from public, anon;
grant execute on function public.save_lessons(text, int[]) to authenticated;

-- 3. Points can no longer be set from the browser.
revoke update (points) on public.profiles from authenticated;

-- 4. The server adds points in one step, so two requests at once cannot overwrite each other.
create or replace function public.add_points(p_user uuid, p_delta int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set points = least(greatest(points + p_delta, 0), 999999)
   where id = p_user
  returning points;
$$;
revoke all on function public.add_points(uuid, int) from public, anon, authenticated;
grant execute on function public.add_points(uuid, int) to service_role;
