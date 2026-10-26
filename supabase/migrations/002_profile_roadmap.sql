-- 002_profile_roadmap.sql
-- Student profile and roadmap: which roadmap a student is on, the roadmaps they left behind,
-- and the summary of their resume and placement test (never the resume file itself).
-- Run once in the Supabase SQL editor, after 001. Safe to run again.

alter table public.profiles
  add column if not exists roadmap_id      text,
  add column if not exists roadmap_history jsonb not null default '[]'::jsonb,
  add column if not exists onboarding      jsonb not null default '{}'::jsonb;

-- Only the three live roadmaps are allowed. Null means "not chosen yet".
alter table public.profiles drop constraint if exists profiles_roadmap_id_check;
alter table public.profiles add constraint profiles_roadmap_id_check
  check (roadmap_id is null or roadmap_id in ('pm', 'ba', 'pjm'));

-- Keep the JSON columns small so nobody can use them as free storage.
alter table public.profiles drop constraint if exists profiles_roadmap_history_size;
alter table public.profiles add constraint profiles_roadmap_history_size
  check (jsonb_typeof(roadmap_history) = 'array' and pg_column_size(roadmap_history) < 65536);

alter table public.profiles drop constraint if exists profiles_onboarding_size;
alter table public.profiles add constraint profiles_onboarding_size
  check (jsonb_typeof(onboarding) = 'object' and pg_column_size(onboarding) < 65536);

-- Students may edit these on their own row. The row-level rule from 001 still limits
-- every update to the student's own row.
grant update (roadmap_id, roadmap_history, onboarding) on public.profiles to authenticated;
