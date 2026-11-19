-- 015_feedback.sql
-- Answers to the feedback form (public/feedback.html). One row per answer, one column per question, in the same order as the
-- form. Every choice is stored exactly as it reads on the page ("Knowing what to learn first and next", "Very disappointed"),
-- and several choices are stored in the order they appear on the page. Every column carries its question as a comment, and
-- the view feedback_by_question shows the same answers with the full questions as column names, ready to export.
--
-- Anyone may send an answer, with or without an account. Only the server writes them (api/_feedback.js, with the service role
-- key, after checking every field against the same choices and a per-address limit), and only admins read them, also through
-- the server. Nothing here can be read or written from the site directly. An email is kept only when someone types it in.
--
-- Safe to run again. Run after 014, and after the website that has the form is deployed.
-- Ran an earlier copy of this file? Run this one: it moves every saved answer into this layout and rewrites short codes
-- (order, youtube, very, ...) into the words on the page. Nothing is lost.

-- 1. The very first copy kept most answers in one `answers` column: set that table aside to move its answers below.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'feedback' and column_name = 'answers') then
    alter table public.feedback rename to feedback_v1;
  end if;
end $$;

-- 2. One column per question, in the order of the form. The allowed choices are added in step 3.
create table if not exists public.feedback (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid references auth.users (id) on delete set null,
  source         text not null default 'page' check (source in ('page', 'app', 'prompt')),
  -- About you
  status         text,                                                      -- Q1
  school         text check (char_length(school) <= 120),                   -- Q2
  program        text check (char_length(program) <= 120),                  -- Q2
  target_role    text,                                                      -- Q3
  prepare        text[] not null default '{}',                              -- Q4 (several)
  struggle       text[] not null default '{}',                              -- Q5 (several)
  -- CareerPath
  heard          text,                                                      -- Q6
  tried          text not null,                                             -- Q7
  -- Using it (only when tried = 'Yes')
  used           text[] not null default '{}',                              -- Q8 (several)
  ease           smallint check (ease between 1 and 5),                     -- Q9
  device         text[] not null default '{}',                              -- Q10 (several)
  broken         text check (char_length(broken) <= 1000),                  -- Q11
  lessons        smallint check (lessons between 1 and 5),                  -- Q12
  lessons_better text check (char_length(lessons_better) <= 1000),          -- Q12 follow-up
  favorite       text,                                                      -- Q13
  continue_use   text,                                                      -- Q14
  change_mind    text check (char_length(change_mind) <= 1000),             -- Q14 follow-up
  pmf            text,                                                      -- Q15
  recommend      smallint check (recommend between 0 and 10),               -- Q16
  add_or_change  text check (char_length(add_or_change) <= 1000),           -- Q17
  -- Before you try it (only when tried = 'Not yet')
  why_not        text,                                                      -- Q8
  would_try      text check (char_length(would_try) <= 1000),               -- Q9
  -- Follow-up
  email          text check (email is null or (char_length(email) <= 200 and position('@' in email) > 1))
);

-- Move answers saved by the very first copy of this file (step 1), then drop the old table. Step 3 turns their codes into words.
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

-- 3. Choices are stored exactly as they read on the form. The first copies of this file stored short codes instead
--    (order, youtube, ...): this turns any of those into the words on the page, then allows only those words.
-- Remove every older rule on these columns first, whatever it is called: earlier copies of this file left rules that allow only
-- the short codes, and Postgres sometimes names them with a number on the end (feedback_continue_use_check1).
do $$
declare r record;
begin
  for r in
    select distinct c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.feedback'::regclass and c.contype = 'c'
      and a.attname in ('status', 'target_role', 'prepare', 'struggle', 'heard', 'tried', 'used', 'device', 'favorite',
                        'continue_use', 'pmf', 'why_not')
  loop
    execute format('alter table public.feedback drop constraint %I', r.conname);
  end loop;
end $$;

update public.feedback set
  status = case status when 'student' then 'Student' when 'working' then 'Working professional' when 'other' then 'Other' else status end,
  target_role = case target_role when 'pm' then 'Product Manager' when 'pjm' then 'Project Manager' when 'ba' then 'Business Analyst' when 'other' then 'Something else' when 'unsure' then 'Not sure yet' else target_role end,
  prepare = array(select case x when 'google' then 'Google search' when 'youtube' then 'YouTube' when 'courses' then 'Online courses' when 'chatgpt' then 'ChatGPT or other AI' when 'linkedin' then 'LinkedIn posts' when 'mentors' then 'Mentors or friends' when 'books' then 'Books' when 'none' then 'I have not started' else x end from unnest(prepare) with ordinality u(x, i) order by i),
  struggle = array(select case x when 'order' then 'Knowing what to learn first and next' when 'testing' then 'Testing whether I really know it' when 'too_many' then 'Too many resources' when 'time' then 'Finding the time' when 'interviews' then 'Getting ready for interviews' when 'other' then 'Something else' else x end from unnest(struggle) with ordinality u(x, i) order by i),
  heard = case heard when 'whatsapp' then 'WhatsApp or group chat' when 'friend' then 'A friend or classmate' when 'class' then 'In class or from a professor' when 'linkedin' then 'LinkedIn' when 'poster' then 'A poster or flyer' when 'other' then 'Something else' else heard end,
  tried = case tried when 'yes' then 'Yes' when 'no' then 'Not yet' else tried end,
  used = array(select case x when 'match' then 'Role match (resume or questions)' when 'roadmap' then 'Roadmap' when 'lessons' then 'Lessons' when 'practice' then 'Practice with hints' when 'assessments' then 'Assessments and stars' when 'assistant' then 'Study assistant' when 'leaderboard' then 'Leaderboard' when 'challenge' then 'Weekly challenge' else x end from unnest(used) with ordinality u(x, i) order by i),
  device = array(select case x when 'phone' then 'Phone' when 'laptop' then 'Laptop' when 'tablet' then 'Tablet' else x end from unnest(device) with ordinality u(x, i) order by i),
  favorite = case favorite when 'match' then 'Role match (resume or questions)' when 'roadmap' then 'Roadmap' when 'lessons' then 'Lessons' when 'practice' then 'Practice with hints' when 'assessments' then 'Assessments and stars' when 'assistant' then 'Study assistant' when 'leaderboard' then 'Leaderboard' when 'challenge' then 'Weekly challenge' else favorite end,
  continue_use = case continue_use when 'regularly' then 'Yes, regularly' when 'sometimes' then 'Now and then' when 'interviews' then 'Only before interviews' when 'no' then 'No' else continue_use end,
  pmf = case pmf when 'very' then 'Very disappointed' when 'somewhat' then 'Somewhat disappointed' when 'not' then 'Not disappointed' else pmf end,
  why_not = case why_not when 'no_time' then 'No time yet' when 'not_sure' then 'Not sure it is for me' when 'forgot' then 'I forgot about it' when 'other' then 'Something else' else why_not end;

alter table public.feedback add constraint feedback_status_check check (status in ('Student', 'Working professional', 'Other'));
alter table public.feedback add constraint feedback_target_role_check check (target_role in ('Product Manager', 'Project Manager', 'Business Analyst', 'Something else', 'Not sure yet'));
alter table public.feedback add constraint feedback_prepare_check check (prepare <@ array['Google search', 'YouTube', 'Online courses', 'ChatGPT or other AI', 'LinkedIn posts', 'Mentors or friends', 'Books', 'I have not started']::text[]);
alter table public.feedback add constraint feedback_struggle_check check (struggle <@ array['Knowing what to learn first and next', 'Testing whether I really know it', 'Too many resources', 'Finding the time', 'Getting ready for interviews', 'Something else']::text[]);
alter table public.feedback add constraint feedback_heard_check check (heard in ('WhatsApp or group chat', 'A friend or classmate', 'In class or from a professor', 'LinkedIn', 'A poster or flyer', 'Something else'));
alter table public.feedback add constraint feedback_tried_check check (tried in ('Yes', 'Not yet'));
alter table public.feedback add constraint feedback_used_check check (used <@ array['Role match (resume or questions)', 'Roadmap', 'Lessons', 'Practice with hints', 'Assessments and stars', 'Study assistant', 'Leaderboard', 'Weekly challenge']::text[]);
alter table public.feedback add constraint feedback_device_check check (device <@ array['Phone', 'Laptop', 'Tablet']::text[]);
alter table public.feedback add constraint feedback_favorite_check check (favorite in ('Role match (resume or questions)', 'Roadmap', 'Lessons', 'Practice with hints', 'Assessments and stars', 'Study assistant', 'Leaderboard', 'Weekly challenge'));
alter table public.feedback add constraint feedback_continue_use_check check (continue_use in ('Yes, regularly', 'Now and then', 'Only before interviews', 'No'));
alter table public.feedback add constraint feedback_pmf_check check (pmf in ('Very disappointed', 'Somewhat disappointed', 'Not disappointed'));
alter table public.feedback add constraint feedback_why_not_check check (why_not in ('No time yet', 'Not sure it is for me', 'I forgot about it', 'Something else'));

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

comment on table  public.feedback is 'Answers to the feedback form (public/feedback.html), one column per question in form order, choices exactly as worded on the page.';
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

-- 4. The same answers with the full questions as column names, for reading and exporting (Table Editor > feedback_by_question,
--    or select * from public.feedback_by_question). Several choices are joined with "; " in the order of the page.
--    Like the table, only the server and the SQL editor can read it.
drop view if exists public.feedback_by_question;
create view public.feedback_by_question with (security_invoker = true) as
select
  f.id                                                                   as "Answer number",
  to_char(f.created_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as "Sent (Los Angeles time)",
  case f.source when 'app' then 'From the app' when 'prompt' then 'After an assessment' else 'Shared link' end as "Opened from",
  f.status                                                               as "Q1 Are you a student or working?",
  f.school                                                               as "Q2 School",
  f.program                                                              as "Q2 Program",
  f.target_role                                                          as "Q3 Which role are you aiming for?",
  array_to_string(f.prepare, '; ')                                       as "Q4 How are you preparing for your target role right now?",
  array_to_string(f.struggle, '; ')                                      as "Q5 What is the hardest part of preparing for your target role?",
  f.heard                                                                as "Q6 How did you hear about CareerPath?",
  f.tried                                                                as "Q7 Have you tried CareerPath?",
  array_to_string(f.used, '; ')                                          as "Q8 Which parts did you use?",
  f.ease                                                                 as "Q9 How easy was it to get started? (1 to 5)",
  array_to_string(f.device, '; ')                                        as "Q10 What did you use it on?",
  f.broken                                                               as "Q11 Did anything look broken or confusing?",
  f.lessons                                                              as "Q12 How helpful were the lessons in the modules? (1 to 5)",
  f.lessons_better                                                       as "Q12 What would make the lessons better?",
  f.favorite                                                             as "Q13 Which part did you like most?",
  f.continue_use                                                         as "Q14 Will you keep using CareerPath?",
  f.change_mind                                                          as "Q14 What would change your mind?",
  f.pmf                                                                  as "Q15 How would you feel if you could no longer use CareerPath?",
  f.recommend                                                            as "Q16 How likely to recommend CareerPath to a friend? (0 to 10)",
  f.add_or_change                                                        as "Q17 One thing you would add or change",
  f.why_not                                                              as "Not tried yet: What stopped you so far?",
  f.would_try                                                            as "Not tried yet: What would make you try it?",
  f.email                                                                as "Follow-up email",
  case when f.user_id is null then 'No' else 'Yes' end                   as "Linked to an account"
from public.feedback f
order by f.created_at;
revoke all on public.feedback_by_question from anon, authenticated;
comment on view public.feedback_by_question is 'The feedback answers with the full questions as column names, in form order.';
