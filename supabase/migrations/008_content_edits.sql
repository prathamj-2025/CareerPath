-- 008_content_edits.sql
-- Admin edits to course content. The lessons and questions that ship with the site (the files in content/) stay
-- the starting point; these tables hold what admins change on top, so a fix goes live without a redeploy.
--
--   content_lessons    one row per lesson edit. The live row is what students see; older rows are kept.
--   content_questions  one row per question version: draft, live, archived (replaced) or retired (removed).
--
-- Both tables hold answer keys, so no signed-in user can read or write them directly. Only the server (service role
-- key, through api/content.js) touches them, and it checks that the caller is an admin first.
-- Safe to run again. Run after 007, and after the website that reads these tables is deployed.

create table if not exists public.content_lessons (
  skill_id  text not null check (char_length(skill_id) between 1 and 80),
  idx       int  not null check (idx >= 0 and idx < 200),              -- position of the lesson inside the skill
  version   int  not null check (version >= 1),                        -- 1 is the lesson as shipped in the files
  status    text not null check (status in ('live', 'archived')),
  title     text not null check (char_length(title) between 1 and 200),
  body      text not null check (char_length(body) between 1 and 30000),
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz not null default now(),
  primary key (skill_id, idx, version)
);
create unique index if not exists content_lessons_one_live on public.content_lessons (skill_id, idx) where status = 'live';

create table if not exists public.content_questions (
  qid          text not null check (char_length(qid) between 1 and 100),
  version      int  not null check (version >= 1),                     -- 1 is the question as shipped in the files
  status       text not null check (status in ('draft', 'live', 'archived', 'retired')),
  skill_id     text not null check (char_length(skill_id) between 1 and 80),
  is_new       boolean not null default false,                         -- added by an admin, not in the files
  lvl          int  not null check (lvl between 1 and 5),
  q            text not null check (char_length(q) between 1 and 800),
  opts         jsonb not null check (jsonb_typeof(opts) = 'array' and jsonb_array_length(opts) = 4),
  answer       int  not null check (answer between 0 and 3),
  why          text not null default '' check (char_length(why) <= 1200),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  retired_at   timestamptz,
  primary key (qid, version)
);
-- At most one live version and one draft per question.
create unique index if not exists content_questions_one_live  on public.content_questions (qid) where status = 'live';
create unique index if not exists content_questions_one_draft on public.content_questions (qid) where status = 'draft';
create index if not exists content_questions_skill on public.content_questions (skill_id, status);

-- Locked: row level security on with no policies, and no table rights for the site's own roles.
alter table public.content_lessons   enable row level security;
alter table public.content_questions enable row level security;
revoke all on public.content_lessons   from anon, authenticated;
revoke all on public.content_questions from anon, authenticated;
