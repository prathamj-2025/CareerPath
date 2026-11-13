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

- `008_content_edits.sql`: admin edits to lessons and questions (`content_lessons`, `content_questions`). Locked: the site
  cannot read or write them, only `api/content.js` can, after checking the caller is an admin. Safe to run twice. Run it
  after the website that uses it is deployed; until then the site simply uses the files in `content/`.

- `009_ai_usage.sql`: limits on the study assistant (`ai_usage` table and the `take_ai` function). Server only: the site cannot
  read or call them. Safe to run twice. Run after the website that uses it is deployed; until then the assistant works but
  only the per-minute limit and the exam lock apply.

- `010_certificates.sql`: the `certificates` table. Students and admins can read it; only `api/certs.js` and `api/exam.js` write
  to it (service role key). Safe to run twice. Run it after the website that uses it is deployed; until then certificate IDs
  show "issuing..." and the verification page finds nothing.

- `011_challenges.sql`: the `challenges` table (weekly challenges written or changed by admins) and the `challenge` kind for
  open attempts, which is how the server knows a student has the challenge page open. Server only: the site cannot read or
  write the table. Safe to run twice. Run it after the website that uses it is deployed; until then the site uses the challenges
  in `public/data6.js`, admins cannot save challenge changes, and the assistant lock for challenges is not enforced.

Run them in order, one at a time, in the SQL editor.

## Exam and project scoring (server side)

`api/exam.js` starts and grades skill assessments and module exams, and `api/grade-project.js` reviews practical
projects. The answer keys are not in the website files: the curriculum with keys lives in `content/` (never served),
and `public/` holds copies with the keys removed. After you change anything in `content/`, run `npm run build:content`
and commit both folders; `test/grading.spec.mjs` fails if they disagree or if a key reaches `public/`.
`api/keys.js` gives the keys to signed-in admins only, for the question bank and the admin preview. Uses the same
`SUPABASE_SERVICE_ROLE_KEY` as below. Limits: 20 exam starts per hour and 10 graded attempts per exam per 24 hours.

## Certificates

A certificate is issued by the server when the results in the database say it is earned: a passed module exam (roadmaps with
modules), or three stars on a skill (roadmaps without). `api/exam.js` issues it right after the result is saved, and
`api/certs.js` (called when a student opens the Certificates pages) issues anything missing. Each gets a random ID like
`CP-7K2M-X9QD` (letters and digits without 0, O, 1, I; about a trillion combinations), so an ID cannot be guessed or worked out
from anything else. `verify.html` (and `api/verify.js` behind it, no sign-in) shows the holder's name, the certificate title,
the roadmap, the school, the date and the score, and nothing else (no email, no student id). Unknown and badly formed IDs get
the same answer, and one address can make 30 checks a minute. The holder's name follows the profile, so a corrected name is
corrected on the certificate; the ID never changes. An admin can revoke a certificate on the student's page in the admin area
(and restore it); the verification page then says it was revoked, and doing the exam again does not bring it back.
Students use the Print or save as PDF button on the certificate page, which prints the certificate alone in light colours.

## Weekly challenges

The challenges in `public/data6.js` are the starting point. Admins create, edit, schedule, publish and close challenges on the
admin page; the changes are saved by `api/challenges.js` into the `challenges` table and a row replaces the file's version of
the same challenge. Publishing one closes the live one on that roadmap (nothing is deleted). A challenge can be edited only
while it is a draft or scheduled: once it is live or closed, scores were made against its rubric, so write a new one.
Students are sent the live challenges with the rubric labels only; the scoring patterns stay on the server for the new
and changed challenges. Week 1 is deliberately easy (one realistic situation from each roadmap's first module); the harder
challenges follow in later weeks. While a student has the challenge page open and has not submitted, the server records an
open attempt and `api/ask.js` refuses the study assistant (same lock as exams, 30 minutes at most); leaving the page or
submitting lifts it.

## Study assistant limits

`api/ask.js` needs a sign-in on a deployment with real accounts, refuses questions while the student has an exam open
(the page closes the attempt when the student leaves the exam or reloads, and an attempt older than 30 minutes no longer
counts), and counts each question through `take_ai` (009). Defaults: 40 questions per student per hour, 200 per student per
day, 10,000 across the site per day, and 10 per minute per student. Change them with `AI_HOURLY_LIMIT`, `AI_DAILY_LIMIT`
and `AI_GLOBAL_DAILY` in Vercel. The weekly challenge lock is still enforced by the page and the assistant's instructions only.

## Editing course content (admins)

The lessons and questions in `content/` are the starting point. When an admin changes something on the admin pages, the
change is saved to the database through `api/content.js` and students see it within a minute (the page refreshes content
when a student opens a skill). Lessons publish at once. Questions are saved as a draft and go live when published; the
version they replace moves to the archive, and an exam attempt that was already open is graded against the version the
student saw. A skill must keep at least 5 live questions. Admin edits are layered over the files, so a file change to a
question an admin has edited does not show until that edit is retired. Answer keys for edited questions stay on the server.

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
