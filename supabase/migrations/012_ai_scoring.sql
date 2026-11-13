-- 012_ai_scoring.sql
-- AI scoring for written answers.
--
--   challenges.reference           the model answer for a weekly challenge, written by an admin. Only the server reads it (it is
--                                  handed to the AI marker); students are never sent it. Empty means the one that ships with the
--                                  site (content/challenge-refs.js) is used.
--   challenge_submissions.met      which rubric lines the marker found in the answer, one true or false per line, in order,
--                                  so the page shows the same ticks every time it is opened.
--   challenge_submissions.judged   true when the AI marker scored it, false when the keyword check did (no model available).
--
-- Additive and safe to run again. Run it BEFORE pushing the website that uses it; the old website ignores the new columns.

alter table public.challenges add column if not exists reference text not null default ''
  check (char_length(reference) <= 6000);

alter table public.challenge_submissions add column if not exists met jsonb;
alter table public.challenge_submissions add column if not exists judged boolean not null default false;
