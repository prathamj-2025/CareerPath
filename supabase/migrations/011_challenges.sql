-- 011_challenges.sql
-- Weekly challenges written by admins, and the server-side lock for the study assistant during a challenge.
--
--   challenges   one row per challenge an admin has created or changed. The challenges that ship with the site (the file
--                public/data6.js) are the starting point; a row here replaces the file's version of the same challenge or
--                adds a new one. Status moves draft, scheduled, live, closed. One challenge can be live per roadmap.
--                The scoring patterns in the rubric stay on the server: students are sent only the labels.
--   exam_attempts  now also accepts kind 'challenge'. While a student has a challenge page open and has not submitted,
--                the server records it, and the study assistant refuses questions (the same lock exams already use).
--
-- Students and admins cannot read or write `challenges` directly; only the server (service role key, api/challenges.js)
-- does, after checking the caller. Safe to run again. Run after 010, and after the website that uses it is deployed
-- (until then the site uses the challenges in the file and the assistant lock for challenges is not enforced).

create table if not exists public.challenges (
  cid          text primary key check (char_length(cid) between 1 and 80),
  role_id      text not null check (role_id in ('pm', 'ba', 'pjm')),
  week         int  not null check (week between 1 and 200),
  status       text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'closed')),
  title        text not null check (char_length(title) between 1 and 200),
  brief        text not null check (char_length(brief) between 1 and 4000),
  min_words    int  not null default 40 check (min_words between 1 and 2000),
  rubric       jsonb not null check (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 1 and 12
                                     and pg_column_size(rubric) < 16000),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  closed_at    timestamptz
);
create unique index if not exists challenges_one_live on public.challenges (role_id) where status = 'live';

alter table public.challenges enable row level security;
revoke all on public.challenges from anon, authenticated;

-- The assistant lock for challenges uses the same table as exam attempts.
alter table public.exam_attempts drop constraint if exists exam_attempts_kind_check;
alter table public.exam_attempts add constraint exam_attempts_kind_check
  check (kind in ('skill', 'module', 'project', 'challenge'));
