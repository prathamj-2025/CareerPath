-- 015_feedback.sql
-- Answers to the feedback form (public/feedback.html). Anyone may send one, with or without an account; only the server
-- writes them (api/_feedback.js, with the service role key, after checking every field and a per-address limit), and only
-- admins read them, also through the server. Nothing here can be read or written from the site directly.
--
-- The rating answers have their own columns so they are easy to average; everything else sits in `answers`.
-- An email address is kept only when the person typed one in to be contacted.
-- Safe to run again. Run after 014, and after the website that has the form is deployed.

create table if not exists public.feedback (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users (id) on delete set null,
  source       text not null default 'page' check (source in ('page', 'app', 'prompt')),
  status       text check (status in ('student', 'working', 'other')),
  target_role  text check (target_role in ('pm', 'pjm', 'ba', 'other', 'unsure')),
  tried        text not null check (tried in ('yes', 'no')),
  ease         smallint check (ease between 1 and 5),
  lessons      smallint check (lessons between 1 and 5),
  recommend    smallint check (recommend between 0 and 10),
  continue_use text check (continue_use in ('regularly', 'sometimes', 'interviews', 'no')),
  answers      jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 12000),
  email        text check (email is null or (char_length(email) <= 200 and position('@' in email) > 1))
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
