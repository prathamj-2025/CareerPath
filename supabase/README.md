# Database (Supabase)

One shared Supabase project. Database changes live here as numbered SQL files in
`migrations/`. Never edit a file that has already been run; add the next number instead.

- `001_accounts.sql`: profiles table, student/admin role, sign-up trigger, security rules.
- `002_profile_roadmap.sql`: roadmap choice, roadmap history, onboarding summary on the profile.
- `003_progress.sql`: points, stars per skill, module exam results.
- `004_leaderboard_account.sql`: the school leaderboard, hide-me choice, delete my account.
- `005_challenges.sql`: weekly challenge submissions and the all-colleges challenge board.
- `006_realtime.sql`: live leaderboards. Triggers send an empty "changed" message on private Realtime
  channels (`board:<school>:<roadmap>`, `challenge:<id>`); only signed-in students can listen. Run after 005.
  Needs Realtime on in the Supabase project (it is by default).
- `007_server_grading.sql`: server-side grading. Students lose the right to write points, stars, scores and module
  results; the `exam_attempts` table records each exam the server starts; `add_points` is service role only; students
  keep one write, `save_lessons`, for lessons done. Safe to run twice. Run it AFTER the website that uses it is
  deployed and `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel, because the old site wrote scores from the browser.

Run them in order, one at a time, in the SQL editor.

## Exam and project scoring (server side)

`api/exam.js` starts and grades skill assessments and module exams, and `api/grade-project.js` reviews practical
projects. The answer keys are not in the website files: the curriculum with keys lives in `content/` (never served),
and `public/` holds copies with the keys removed. After you change anything in `content/`, run `npm run build:content`
and commit both folders; `test/grading.spec.mjs` fails if they disagree or if a key reaches `public/`.
`api/keys.js` gives the keys to signed-in admins only, for the question bank and the admin preview. Uses the same
`SUPABASE_SERVICE_ROLE_KEY` as below. Limits: 20 exam starts per hour and 10 graded attempts per exam per 24 hours.

## Weekly challenge scoring (server side)

Challenge answers are scored by `api/grade-challenge.js`, not by the page, so a score cannot be faked from the
browser. The function saves the row with the Supabase secret key, because students have no permission to write
to `challenge_submissions`. One setting is needed:

1. In Supabase open Project Settings, then API Keys. Copy the **secret** key (starts with `sb_secret_`; on older
   projects it is the `service_role` key).
2. In Vercel open the project, Settings, Environment Variables. Add `SUPABASE_SERVICE_ROLE_KEY` with that value,
   type Secret, environment Production. Redeploy.

Never put this key in the repo, the website or a chat. Without it the challenge page tells the student that
scoring is not switched on, and nothing is saved. Written feedback uses the same `AI_API_KEY` as the study
assistant; if the model is down the answer is still scored and saved with a plain note instead of a review.

Rules for everyone working here
- Every new table turns on row level security and ships its policies in the same file.
- Reference `public.profiles(id)` for the student. Use `public.is_admin()` for admin-only rules.
- Never put the service role key in the repo, the website or a chat. Only the Project URL and
  the anon public key are allowed in the website.
