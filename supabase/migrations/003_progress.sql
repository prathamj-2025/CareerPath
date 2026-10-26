-- 003_progress.sql
-- Student progress follows the student across devices: points, stars per skill, lessons done,
-- attempt history, and module exam results.
-- Run once in the Supabase SQL editor, after 001 and 002. Safe to run again.
--
-- IMPORTANT: for now the website writes these rows itself, so a determined student could edit their own
-- numbers. The row-level rules below make sure nobody can touch ANOTHER student's rows, and that is the
-- part that matters for privacy. When exams are graded on the server (a later step), the direct write
-- permission on these tables is removed and only the grading function can change stars and points.

-- 1. Points live on the profile.
alter table public.profiles
  add column if not exists points int not null default 0;
alter table public.profiles drop constraint if exists profiles_points_check;
alter table public.profiles add constraint profiles_points_check check (points >= 0 and points < 1000000);
grant update (points) on public.profiles to authenticated;

-- 2. One row per student per skill.
create table if not exists public.skill_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  skill_id     text not null check (char_length(skill_id) between 1 and 80),
  stars        int  not null default 0 check (stars between 0 and 5),
  best         int  not null default 0 check (best between 0 and 100),
  attempts     int  not null default 0 check (attempts between 0 and 10000),
  project      boolean not null default false,
  lessons_done int[] not null default '{}' check (cardinality(lessons_done) <= 200),
  history      jsonb not null default '[]'::jsonb
               check (jsonb_typeof(history) = 'array' and pg_column_size(history) < 32768),
  updated_at   timestamptz not null default now(),
  primary key (user_id, skill_id)
);

-- 3. One row per student per module exam.
create table if not exists public.module_results (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  track_id   text not null check (char_length(track_id) between 1 and 80),
  best       int  not null default 0 check (best between 0 and 100),
  attempts   int  not null default 0 check (attempts between 0 and 10000),
  passed     boolean not null default false,
  passed_on  text not null default '',
  history    jsonb not null default '[]'::jsonb
             check (jsonb_typeof(history) = 'array' and pg_column_size(history) < 32768),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

drop trigger if exists skill_progress_touch on public.skill_progress;
create trigger skill_progress_touch before update on public.skill_progress
  for each row execute function public.touch_updated_at();
drop trigger if exists module_results_touch on public.module_results;
create trigger module_results_touch before update on public.module_results
  for each row execute function public.touch_updated_at();

-- 4. Security rules: a student sees and changes only their own rows. Admins can read everything.
alter table public.skill_progress enable row level security;
alter table public.module_results enable row level security;

do $$
declare t text;
begin
  foreach t in array array['skill_progress', 'module_results'] loop
    execute format('drop policy if exists "%1$s: read own" on public.%1$s', t);
    execute format('create policy "%1$s: read own" on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('drop policy if exists "%1$s: admins read all" on public.%1$s', t);
    execute format('create policy "%1$s: admins read all" on public.%1$s for select to authenticated using (public.is_admin())', t);
    execute format('drop policy if exists "%1$s: insert own" on public.%1$s', t);
    execute format('create policy "%1$s: insert own" on public.%1$s for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "%1$s: update own" on public.%1$s', t);
    execute format('create policy "%1$s: update own" on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

revoke all on public.skill_progress, public.module_results from anon;
grant select, insert, update on public.skill_progress, public.module_results to authenticated;
