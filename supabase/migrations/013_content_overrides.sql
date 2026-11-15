-- 013_content_overrides.sql
-- Admin edits to project briefs and practice exercises, with the earlier versions kept so any change can be restored.
-- Lessons and exam questions already have their own tables (008). This one holds the rest, in a single table:
--
--   kind = 'project'   key = the skill id                 data = { "title": ..., "brief": ... }
--   kind = 'practice'  key = the skill id, '#', the number of the exercise (from 0)
--                                                         data = { "prompt": ..., "hints": [...], "answer": ... }
--
-- status is 'live' for the version students see and 'archived' for every earlier one. Version 1 is the text as shipped in
-- the files, saved the first time it is edited. The scoring rules of an exercise (what a correct answer must contain) are
-- not editable here; they stay in the files.
--
-- Nobody signed in can read or write this table. Only the server (service role key, api/content.js) does, after checking
-- that the caller is an admin. Safe to run again. Run after 012, and after the website that uses it is deployed (until then
-- the admin page cannot save project or practice edits, and everything else works as before).

create table if not exists public.content_overrides (
  kind      text not null check (kind in ('project', 'practice')),
  key       text not null check (char_length(key) between 1 and 100),
  version   int  not null check (version >= 1),
  status    text not null check (status in ('live', 'archived')),
  data      jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz not null default now(),
  primary key (kind, key, version)
);
create unique index if not exists content_overrides_one_live on public.content_overrides (kind, key) where status = 'live';

alter table public.content_overrides enable row level security;
revoke all on public.content_overrides from anon, authenticated;
