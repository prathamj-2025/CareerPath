-- 015_feedback.sql
-- Answers to the feedback form (public/feedback.html). One row per answer, one column per question, in the same order as the
-- form, and every column carries the question it holds (see the comments at the end, or hover the column in Supabase).
--
-- Anyone may send an answer, with or without an account. Only the server writes them (api/_feedback.js, with the service role
-- key, after checking every field against the same choices and a per-address limit), and only admins read them, also through
-- the server. Nothing here can be read or written from the site directly. An email is kept only when someone types it in.
--
-- Safe to run again. Run after 014, and after the website that has the form is deployed.
-- Ran the first copy of this file (with an `answers` column)? Run this one: it moves every saved answer into the new columns
-- and removes the old table.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'feedback' and column_name = 'answers') then
    alter table public.feedback rename to feedback_v1;
  end if;
end $$;

create table if not exists public.feedback (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid references auth.users (id) on delete set null,
  source         text not null default 'page' check (source in ('page', 'app', 'prompt')),
  -- About you
  status         text check (status in ('student', 'working', 'other')),                                          -- Q1
  school         text check (char_length(school) <= 120),                                                        -- Q2
  program        text check (char_length(program) <= 120),                                                       -- Q2
  target_role    text check (target_role in ('pm', 'pjm', 'ba', 'other', 'unsure')),                            -- Q3
  prepare        text[] not null default '{}'
                 check (prepare <@ array['google', 'youtube', 'courses', 'chatgpt', 'linkedin', 'mentors', 'books', 'none']),  -- Q4
  struggle       text[] not null default '{}'
                 check (struggle <@ array['order', 'testing', 'too_many', 'time', 'interviews', 'other']),      -- Q5
  -- CareerPath
  heard          text check (heard in ('whatsapp', 'friend', 'class', 'linkedin', 'poster', 'other')),         -- Q6
  tried          text not null check (tried in ('yes', 'no')),                                                   -- Q7
  -- Using it (only when tried = 'yes')
  used           text[] not null default '{}'
                 check (used <@ array['match', 'roadmap', 'lessons', 'practice', 'assessments', 'assistant', 'leaderboard', 'challenge']),  -- Q8
  ease           smallint check (ease between 1 and 5),                                                          -- Q9
  device         text[] not null default '{}' check (device <@ array['phone', 'laptop', 'tablet']),             -- Q10
  broken         text check (char_length(broken) <= 1000),                                                       -- Q11
  lessons        smallint check (lessons between 1 and 5),                                                       -- Q12
  lessons_better text check (char_length(lessons_better) <= 1000),                                               -- Q12 follow-up
  favorite       text check (favorite in ('match', 'roadmap', 'lessons', 'practice', 'assessments', 'assistant', 'leaderboard', 'challenge')),  -- Q13
  continue_use   text check (continue_use in ('regularly', 'sometimes', 'interviews', 'no')),                   -- Q14
  change_mind    text check (char_length(change_mind) <= 1000),                                                  -- Q14 follow-up
  pmf            text check (pmf in ('very', 'somewhat', 'not')),                                                -- Q15
  recommend      smallint check (recommend between 0 and 10),                                                    -- Q16
  add_or_change  text check (char_length(add_or_change) <= 1000),                                                -- Q17
  -- Before you try it (only when tried = 'no')
  why_not        text check (why_not in ('no_time', 'not_sure', 'forgot', 'other')),                            -- Q8
  would_try      text check (char_length(would_try) <= 1000),                                                    -- Q9
  -- Follow-up
  email          text check (email is null or (char_length(email) <= 200 and position('@' in email) > 1))
);

-- Move answers saved by the first copy of this file, then drop the old table.
do $$
begin
  if to_regclass('public.feedback_v1') is not null then
    insert into public.feedback (created_at, user_id, source, status, school, program, target_role, prepare, struggle, tried,
                                 used, ease, device, broken, lessons, lessons_better, favorite, continue_use, change_mind,
                                 recommend, add_or_change, why_not, would_try, email)
    select created_at, user_id, source, status,
           nullif(answers->>'school', ''), nullif(answers->>'program', ''), target_role,
           coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(answers->'prepare') = 'array' then answers->'prepare' else '[]' end)), '{}'),
           coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(answers->'struggle') = 'array' then answers->'struggle' else '[]' end)), '{}'),
           tried,
           coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(answers->'used') = 'array' then answers->'used' else '[]' end)), '{}'),
           ease,
           coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(answers->'device') = 'array' then answers->'device' else '[]' end)), '{}'),
           nullif(answers->>'broken', ''), lessons, nullif(answers->>'lessons_better', ''), nullif(answers->>'favorite', ''),
           continue_use, nullif(answers->>'change_mind', ''), recommend, nullif(answers->>'change', ''),
           nullif(answers->>'why_not', ''), nullif(answers->>'would_try', ''), email
    from public.feedback_v1
    order by created_at;
    drop table public.feedback_v1;
  end if;
end $$;

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

comment on table  public.feedback is 'Answers to the feedback form (public/feedback.html), one column per question in form order.';
comment on column public.feedback.source         is 'Where the form was opened: page (shared link), app (top bar or tab), prompt (after an assessment)';
comment on column public.feedback.user_id        is 'The signed-in student, only when they left "link this answer to my account" ticked';
comment on column public.feedback.status         is 'Q1 Are you a student or working?';
comment on column public.feedback.school         is 'Q2 Your school and program: school';
comment on column public.feedback.program        is 'Q2 Your school and program: program';
comment on column public.feedback.target_role    is 'Q3 Which role are you aiming for?';
comment on column public.feedback.prepare        is 'Q4 How are you preparing for your target role right now?';
comment on column public.feedback.struggle       is 'Q5 What is the hardest part of preparing for your target role?';
comment on column public.feedback.heard          is 'Q6 How did you hear about CareerPath?';
comment on column public.feedback.tried          is 'Q7 Have you tried CareerPath?';
comment on column public.feedback.used           is 'Q8 Which parts did you use?';
comment on column public.feedback.ease           is 'Q9 How easy was it to get started? (1 to 5)';
comment on column public.feedback.device         is 'Q10 What did you use it on?';
comment on column public.feedback.broken         is 'Q11 Did anything look broken or confusing?';
comment on column public.feedback.lessons        is 'Q12 How helpful were the lessons in the modules? (1 to 5)';
comment on column public.feedback.lessons_better is 'Q12 follow-up: What would make the lessons better?';
comment on column public.feedback.favorite       is 'Q13 Which part did you like most?';
comment on column public.feedback.continue_use   is 'Q14 Will you keep using CareerPath?';
comment on column public.feedback.change_mind    is 'Q14 follow-up (when No): What would change your mind?';
comment on column public.feedback.pmf            is 'Q15 How would you feel if you could no longer use CareerPath?';
comment on column public.feedback.recommend      is 'Q16 How likely are you to recommend CareerPath to a friend? (0 to 10)';
comment on column public.feedback.add_or_change  is 'Q17 One thing you would add or change';
comment on column public.feedback.why_not        is 'Not yet Q8 What stopped you so far?';
comment on column public.feedback.would_try      is 'Not yet Q9 What would make you try it?';
comment on column public.feedback.email          is 'Want us to follow up? Email, only when typed in';
