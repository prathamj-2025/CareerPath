# CareerPath

A skill-verification platform for students preparing for a specific career role. Pick a
target role, get the roadmap of skills it needs, learn each one through that role's lens,
and earn stars only by passing assessment. Nothing can be checked off by hand.

Built by a student team at USC, started in MOR 531 and now run as a real product.

## What it does

**Three roadmaps**: Product Manager, Business Analyst and Project Manager. The same named skill is
taught and assessed differently per role, which is the product thesis. (Data Analyst and Financial Analyst
were removed; students who were on them keep their stars in their roadmap history and are asked to pick again.)

**Onboarding.** Upload a resume and CareerPath reads it in the browser. The text is first checked to be a
resume at all (section headings, contact details, date ranges, bullets that start with a verb, degrees, minus
the markers of job descriptions, papers, invoices, contracts and cover letters); anything else (including an I-20, visa, passport page, bank or tax statement, transcript, offer letter) is turned away
with "does not look like a resume, please upload your resume". PDFs are read with pdf.js in the browser (embedded-font PDFs defeated the
small built-in reader); a file with no text at all (a scan or photo) gets its own message. Then the student chooses "I know my target role"
(straight to the three roadmaps) or "Help me choose" (five plain questions with no right answer, read together
with the resume, giving a match % for every roadmap with a reason). There is no skip button: the choice is the
way forward, and a quiet "I don't have a resume yet" link covers people with nothing to upload. The ranking is
advice, not a gate. The file is parsed on the viewer's own machine and never uploaded anywhere.

The ranking itself is a model call. It gets the resume matches and every answer, and returns a match percentage
and a reason per roadmap. The model's reply is parsed strictly and discarded if it does not fit, and a fixed set
of weights ranks the roadmaps instead. The page says which of the two produced the numbers.

**Student side.** Choose a target role, work through course modules, attempt
practice exercises with progressive hints and an answer check, take a 10-question
assessment graded L1 to L5, earn one to five stars, and compete on a leaderboard limited to
your own school and target role. The leaderboard updates on screen as other students finish,
with no reload. Certificates are issued for passed module exams (see the three course sections below).

**Project Manager course.** 5 main modules, 28 sub-modules, 200 lessons, built the same way as the Product
Manager course: Project Management Fundamentals, Planning Risk and Control, Agile and Hybrid Delivery,
Leadership and Stakeholder Management (four certificates), and Interview-Ready Project Manager (practice only).
Every calculation in it (critical path, PERT, earned value, EMV, velocity, cycle time, capacity, weighted scores)
was computed in code, and every module went through an independent accuracy review before it was added.

**Business Analyst course.** 5 main modules, 28 sub-modules, 207 lessons, built the same way as the other two: Business Analysis
Fundamentals, Requirements Modeling and Design, Solutions Validation and Delivery, Data and Technology for Analysts (four
certificates; the data module downloads the TuneBox CSVs for SQL and Excel practice), and Interview-Ready Business Analyst
(practice only).
Course data lives in `content/lessons-ba.js` (`CP_BA_META`, `CP_BA_COURSE`, `CP_BA_TRACKS`), built by
`tools/build_lessons_ba.py` from the written modules. The source notes and outline are kept in `docs/ba-course-source/`
(the module files themselves are large and live outside the repo; the built `content/lessons-ba.js` is the source of truth).
The five original BA skills (`sql-ba`, `requirements-ba`, `process-ba`, `excel-ba`, `stakeholder-ba`) kept their ids, so
existing students keep their stars, and they keep their practice exercises.

**Product Manager course.** 5 main modules, 28 sub-modules, 217 lessons. Stars are earned per
sub-module (3 stars = job-ready, 75% on its assessment). A certificate belongs to a main module:
every required sub-module at 3 stars, then a module exam drawn from those sub-modules'
assessments (24 or 25 questions, 75% to pass). Four certificates exist: PM Fundamentals,
Professional Product Management, Data-Driven Product Management (the optional Python
sub-modules add "with Python") and SQL for Product Managers. Interview-Ready PM is practice only.
The SQL, statistics, BI, Python, pandas and visualization lessons run on one shared synthetic
dataset (TuneBox); every query and code block was executed and its output pasted as run.
Course data lives in `public/lessons-pm.js` (`CP_PM_META`, `CP_PM_COURSE`, `CP_PM_TRACKS`).

**Weekly challenge.** One open-ended brief per roadmap per week, scored against a published
rubric, with written feedback from the assistant and its own leaderboard. An AI marker
(`api/_judge.js`) reads each answer against the rubric lines and an admin-written reference answer and says,
line by line, whether the answer does what the line asks, by meaning and not by wording. The server turns
those yes/no answers into the percentage, so the model never sets a number. The reference answer never reaches
a student's browser. If no model is available the old keyword rubric scores the answer instead.
The same marker checks the written practice in the modules (`api/judge.js`): practice exercises and lesson
scenarios, with the keyword check as the fallback. Set `AI_JUDGE=off` to switch AI scoring off.
The practical project reviewer (`api/grade-project.js`) tries a second time if the model's reply cannot be read, and logs the
unreadable reply to the host's function logs so a recurring problem can be diagnosed.

**Admin side.** A separate role on the same application. Lessons publish directly.
Assessment questions go through draft, review and publish, and the version they replace is
archived, so a score recorded against v2 stays explainable after v3 goes live. Weekly
challenges follow the same discipline, because they award points: created as a draft,
scheduled, then published, and publishing closes the one it replaces rather than deleting it.
Admins can preview any content exactly as a student sees it, and can read student progress
and challenge submissions but never change either.

**Study assistant.** Ask questions about the module you are reading, or select any text and
ask about that passage. It is switched off during a graded assessment, because a verified
star has to mean the student knew the answer.

## The website around the app

`public/about.html`, `faq.html`, `help.html`, `contact.html`, `terms.html` and `privacy.html` are static pages
generated by `node tools/build-pages.mjs` (edit the text in that file, run it, commit the output). They share
`site.css`, and `site.js` fills the support address from `/api/config`. The address defaults to
careerpath531@gmail.com; set `SUPPORT_EMAIL` in Vercel to change it without a redeploy of the pages.
On a real deployment the sign-in page and the foot of every signed-in page link to all six.

`public/feedback.html` (with `feedback.js`) is the feedback form. It is hand-written, not generated, and works without an account.
Answers go to `/api/config?task=feedback` (`api/_feedback.js`), which checks every field against a fixed list, drops anything
else, catches simple bots with a hidden field, and allows 20 answers an hour per address. They are stored in the `feedback` table
(`supabase/migrations/015_feedback.sql`, server only). A signed-in student's answer is linked to their account unless they untick
the box. Students reach the form from the top bar (Feedback, between their name and Sign out), the last tab on phones, the footer,
the Contact page, and once after their first assessment ("Not now" hides it for good). Admins see every answer, the averages,
the recommend score and a CSV download in the Feedback tab. On the preview copy the answers stay in the browser.

Leaderboards are live. `supabase/migrations/006_realtime.sql` makes the database send an empty "changed" message on
a private Realtime channel whenever a score, star count, roadmap, school, name or the hide-me choice changes. The page
(`CP_AUTH.listen` in `public/auth.js`, a small Phoenix-protocol client, no library) reloads its board at once. The message
carries no data, so privacy is unchanged: the board still comes from the `leaderboard` function. A 2-minute poll is the safety
net, and it drops to 30 seconds while the connection is down. The "Live" pill shows only while the connection is really up.

The role pill in the top bar is the role switcher. It lists every roadmap with the match score saved from the
placement questions (`placement.matches` in the profile). The CareerPath logo always returns to the roadmap.

## Running it

```bash
npm i -g vercel        # once
cp .env.example .env   # then paste your key into .env
vercel dev
```

Open http://localhost:3000.

The site itself is static and needs no build step. The only server-side piece is
`api/ask.js`, which the study assistant calls.

### Real accounts (Supabase)

On a deployment that can reach `/api/config`, the site uses real accounts: email and password with
email confirmation, password reset, and a `profiles` row per student in Supabase. The demo logins and
seeded demo students are not created in this mode. The Claude artifact copy and local tests stay in the
browser-only demo (set `CP_DEMO=1` to force that).

- Database files are in `supabase/migrations/` and are run in order in the Supabase SQL editor.
- The Project URL and publishable key are public by design (see `api/config.js`). Never put the
  service role or secret key in the repo or the website.
- In Supabase, Authentication, URL Configuration: set the Site URL to the deployed address and add it
  to the Redirect URLs, or confirmation and reset emails will point at the wrong place.
- Name, school, major, graduation year, role, roadmap, roadmaps left behind and the resume and
  placement summaries are saved to the profile. Progress and scores are still kept in the browser
  until the progress step moves them too.
- Run the SQL files in order, and run a new file BEFORE deploying the website version that needs it:
  `001_accounts.sql`, `002_profile_roadmap.sql`, `003_progress.sql`, `004_leaderboard_account.sql`.
- Progress (stars, points, lessons done, module results) is saved to the database and merged with what a
  browser already holds: more attempts wins, lessons done are combined, points never go backwards, and nothing
  is written until the saved copy has been read.
- The school leaderboard is read from the database (`leaderboard()` function): same school and roadmap, short
  names only, and a student can hide themselves on the Profile page. Students can also delete their account.
- Admins read every student from the database. Those copies stay in memory and are never stored in the browser.
- Weekly challenge answers are already scored on the server (`api/grade-challenge.js`, see `supabase/README.md`).
- The study assistant needs a sign-in, is off while an exam is open, and is limited per student and per day
  (`api/ask.js`, `supabase/migrations/009_ai_usage.sql`, see `supabase/README.md`).
- Admins edit lessons and questions on the admin pages. Changes are saved to the database (`api/content.js`,
  `supabase/migrations/008_content_edits.sql`) and reach students without a redeploy. Run 008 after deploying this version.
- Certificates are issued by the server with a random ID, checked on a public page (`verify.html`, `api/verify.js`,
  `api/certs.js`, `supabase/migrations/010_certificates.sql`). Admins can revoke one. Run 010 after deploying this version.
- Weekly challenges written by admins are saved to the database (`api/challenges.js`,
  `supabase/migrations/011_challenges.sql`), and the server refuses the study assistant while a student has the challenge
  open. Week 1 is the easy starter set. Run 011 after deploying this version.
- Admins can also edit each skill's project brief and its practice exercises (wording, hints, model answer; the scoring
  rules stay in the files), and put any earlier version of a lesson, brief or exercise back
  (`api/content.js`, `supabase/migrations/013_content_overrides.sql`). Run 013 after deploying this version; until then
  lesson and question edits work as before and a project or practice save says to run 013.
- Request limits (study assistant 10 a minute, written-answer marker 10 a minute, certificate check 30 a minute per address, error
  reports 20 an hour per address) are counted in one shared table so they hold across every running copy of the site
  (`api/_burst.js`, `supabase/migrations/014_rate_limits.sql`). Run 014 after deploying this version; until then each copy counts
  for itself, as before.
- Feedback form at `/feedback.html`, stored by the server in `supabase/migrations/015_feedback.sql`. Run 015 after deploying
  this version; until then the form says feedback is not switched on yet and nothing else changes.
- Admins can add a lesson after the last one in a skill (up to 30 lessons per skill) and remove one they added while it is the last;
  a removed lesson can be brought back from its earlier versions. Lessons that shipped can be edited but not removed, because
  students' progress refers to lessons by position. New lessons have no scenario or revision sheet. Adding a whole new skill is
  deliberately not offered: a skill carries an assessment, a project, a place in a module and the certificate rules, which belong in the files.
  No new SQL: added lessons use the existing `content_lessons` table (008).
- AI scoring of written answers (`api/_judge.js`, `api/judge.js`, `api/grade-challenge.js`,
  `supabase/migrations/012_ai_scoring.sql`, reference answers in `content/challenge-refs.js`). Run 012 BEFORE pushing this version.
- Skill assessments, module exams and practical projects are graded on the server (`api/exam.js`, `api/grade-project.js`).
  The answer keys live in `content/`, which is never served; `public/` has copies without keys, made by
  `npm run build:content`. Students cannot write points, stars or scores from the browser (`007_server_grading.sql`).
  Run 007 only after this version is deployed and `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel.
- Tests: `test/sql.spec.mjs` runs the migration files on an in-memory Postgres and checks the security rules.
  `accounts`, `grading`, `content`, `content-ui`, `ask-guard`, `assistant-real`, `progress`, `community` and `challenge`, `judge` and `judge-ui` specs run against `test/fakesupabase.mjs`, a small stand-in server.

### Sign-in for the demo

| Role    | Email                    | Password  |
| ------- | ------------------------ | --------- |
| Student | student@careerpath.com   | student   |
| Admin   | admin@careerpath.com     | admin     |

Both appear as clickable cards on the sign-in screen.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New > Project**, and import the repository.
3. Framework preset: **Other**. No build command. Output directory: `public`.
   Vercel detects this automatically from the repository layout.
4. Under **Settings > Environment Variables**, add three values. Tick Production,
   Preview and Development for each.

   For **Google Gemini**, which has a free tier:

   | Name          | Value                                                  |
   | ------------- | ------------------------------------------------------ |
   | `AI_API_KEY`  | your Gemini key from aistudio.google.com               |
   | `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
   | `AI_MODEL`    | a model id from AI Studio, e.g. `gemini-3.8-flash`     |
   | `AI_REASONING_EFFORT` | `low` (recommended for Gemini 3.x thinking models: faster, and the thinking cannot use up the reply) |

   For **OpenAI**:

   | Name          | Value                          |
   | ------------- | ------------------------------ |
   | `AI_API_KEY`  | your key from platform.openai.com |
   | `AI_BASE_URL` | `https://api.openai.com/v1`    |
   | `AI_MODEL`    | `gpt-4o-mini`                  |

5. Deploy. If you add the key after the first deploy, redeploy so the function picks it up.

The key is only ever read inside `api/ask.js`, which runs on Vercel's servers. It is never
sent to the browser and is not in this repository.

### Keeping the free database awake

Supabase pauses a free project after about a week with no activity. `vercel.json` has a daily cron that calls
`/api/config?task=keepalive`, which reads one row and returns only `{ ok, status }`. Nothing to set up. Optionally add
`CRON_SECRET` (any long random string) in Vercel: Vercel then sends it on its own cron calls and the route refuses
everyone else. To check it by hand, open `https://<your-site>/api/config?task=keepalive`; `{"ok":true,"status":200}` means the
database answered. Vercel's free (Hobby) plan allows one cron run per day, which is all this needs.

### Error reports and page counts

`public/monitor.js` reports uncaught browser errors to `/api/config?task=report`, which writes one line to the function log (Vercel, your
project, Logs, search `client-error`). Nothing is stored and no names, emails or answers are sent: the error text, file and line,
a short stack, the page path and the browser name. At most five distinct errors per page load and twenty per address per hour.
Optional page-view counts: turn on Analytics in the Vercel project (free on the Hobby plan), then add `WEB_ANALYTICS` = `1` in
Environment Variables and redeploy. The privacy page already describes both.

### Sign-up protection

Supabase's own rate limits plus an optional invisible Cloudflare Turnstile check on sign-up and sign-in. It stays off until
`TURNSTILE_SITE_KEY` is set and the secret is added in Supabase; follow the order in `supabase/README.md` (Sign-up abuse protection).

### Switching provider

`api/ask.js` speaks the OpenAI chat-completions format, which OpenAI, Gemini and several
other providers all serve. Changing provider means changing those three variables and
redeploying. No code changes.

## Tests

There is a browser test suite covering the student flow, the admin draft-and-publish
workflow, the assistant, and the deployed shape of the site. `test/phone.spec.mjs` checks the
main screens at 320, 390 and 430 px wide for sideways scroll, oversized elements and inputs under 16px
(which make iPhones zoom in).

```bash
npm i                        # installs playwright
npx playwright install chromium

npm run mock-provider        # terminal 1: stands in for the model, spends no key
AI_API_KEY=test-key AI_BASE_URL=http://localhost:3112 npm run serve   # terminal 2
npm test                     # terminal 3
```

`test/fakeopenai.mjs` speaks the streaming chat-completions format, so the whole request
path including `api/ask.js` is exercised without a real key. `test/devserver.mjs` mimics
what Vercel does: static files from `public/`, `/api/ask` routed to the function.

Set `FAIL_MODE` on the mock provider to exercise the failure paths: `quota`, `ratelimit`
or `model`. Each should produce a different, actionable message in the assistant panel.

## Layout

```
api/ask.js             Serverless function. Holds the API key, streams the reply back.
api/grade-challenge.js Serverless function. Scores and saves a weekly challenge answer (secret key, server only).
api/challenges.js      Weekly challenges: read, admin save and publish, and the open-challenge lock for the assistant.
api/certs.js           Issues and lists certificates; admins revoke or restore. api/verify.js is the public check.
public/verify.html     The public page where a certificate ID is checked.
public/index.html      Markup and all styling.
public/app.js          The whole application: routing, scoring, admin, assistant.
public/data.js         Product Manager track.
public/data2.js        Business Analyst track.
public/lessons-pjm.js Project Manager course (built by tools/build_lessons_pjm.py).
public/lessons-ba.js  Business Analyst course (built by tools/build_lessons_ba.py; the full copy is content/lessons-ba.js).
public/data4.js        Practice exercises: prompts, schemas, hints, model answers.
public/data5.js        Answer-checking rules for practice exercises.
content/data6.js       Resume vocabulary, the five guided questions and the weekly challenge library, with each rubric line's scoring pattern (server only).
public/data6.js        The same file as the site serves it: built by `npm run build:content`, with every rubric `re` pattern removed.
public/onboard.js      Resume parsing, resume check, skill detection, guided questions, recommendation.
public/vendor/         pdf.js 3.11.174 (Apache-2.0), loaded the first time a PDF is chosen so real-world PDFs can be read.
test/app.spec.mjs      Student and admin flows.
test/onboarding.spec.mjs Resume, fork, guided questions, recommendation, challenge, live board, history.
test/assistant.spec.mjs  Assistant, both backends, and the assessment lock.
test/deploy.spec.mjs   The deployed build: assets, encoding, /api/ask streaming.
test/devserver.mjs     Local stand-in for Vercel's routing.
test/fakeopenai.mjs    Local stand-in for the model provider.
```

`app.js` has two assistant backends behind one interface. On claude.ai it uses the
artifact runtime; anywhere else it posts to `/api/ask`. Opened as a local file with neither
available, the assistant hides itself and the rest of the app works normally.

## Known limits

**Grading is on the server for assessments, module exams and projects.** Stars, scores and points are written only by
the server, so they cannot be forged from the browser. The weekly challenge lock and the study assistant's exam lock
are enforced by the server for the assistant, but the challenge lock itself is still the page's.

**The answer check is structural.** A practice query is checked against what a correct
answer must contain and the mistakes that make one wrong. It does not execute the query,
because there is no database behind the page. Written answers are checked for concept
coverage, which reports whether an idea was raised, not how well it was argued. Both
caveats are printed in the app where a learner sees them.

**Question banks are still growing.** Ten questions per assessment on every skill, in all three roadmaps. More can be
added by admins from the Content page.

**The preview copy simulates classmates.** On the live site the school leaderboard is read from the
database every 30 seconds. The Claude artifact copy has no database, so it generates sample classmates
and says so on the page.

**Resume parsing works on most PDFs, not all.** Text is pulled out of the file's own streams
and mapped back through the embedded font's ToUnicode table, which covers what Word, Google
Docs and LibreOffice export. A scanned or image-only resume has no text to find, so the page
says so and offers a paste box instead of failing quietly.

## Design decisions worth defending

**The browser's Back and Forward buttons work.** Each browsing page you open (roadmap, track, skill, lesson, leaderboard, history, profile,
admin pages) is a history entry, with the address unchanged so a refresh still works. Exams, results and the first-run steps are
not entries: Back from an exam returns to the page before the skill. Entries carry the user id, so another account's trail is
ignored. Not used in the preview copy.

**Progress is earned, not declared.** There is no way for a student or an admin to set a
star level. This is the difference between CareerPath and a self-reported skills list.

**Graded content is versioned.** Editing a live assessment question would make every past
score unexplainable and every certificate issued from it meaningless. So an edit creates a
draft, publishing archives the version it replaces, and each attempt records the version it
was scored against.

**Lessons and exams have different review policies.** A typo in a lesson carries no scoring
risk, so lessons publish immediately. Questions do not.

**AI helps you learn and is blocked while you are tested.** The assistant is available in
modules, practice and results, including an explanation of any question you got wrong. It
is unavailable during an assessment.

**The rubric scores the challenge, the model marks it line by line.** A score that changes between two
identical submissions cannot sit on a leaderboard, so the criteria are fixed and published
before the student writes. The model answers one yes or no per criterion (at temperature 0, with a reference
answer as an example and not a template) and the server computes the number, so the model never sets a score
and a student's answer is treated as material to mark, never as instructions. A second call writes the feedback.
Keyword patterns remain only as the fallback when no model is available.

**Switching roadmaps deletes nothing.** The roadmap left behind is recorded with the stars
earned on it, and can be resumed exactly where it stopped. Stars still do not transfer,
because the same skill is a different exam on a different roadmap.

**After the resume, the student chooses: "I know my target role" or "Help me choose".** The first goes
straight to the roadmap list, with resume coverage shown on each card. The second asks five questions
(`CP_GUIDED` in `data6.js`), three options each, none with a right answer, and ends on a match score for each
roadmap. There is no skip control anywhere in the flow. The score is the answers alone, or 60% answers and 40%
resume when a resume was read, and never reaches 100. Checked with 22 role-played personas (all matched; the test suite re-scores them) and with 20,000 simulated
people whose other answers are random: when 3 of 5 answers follow the person's role the top roadmap is right
99.8% of the time, and 81% of the time at 2 of 5 (the right roadmap is in the top two 99% of the time).
Weak spot: the options are fairly easy to read, so someone who already knows the roles can pick theirs directly.
The score reports fit with what the person said, not ability.

**The resume is read in the browser and not stored.** Parsing and the skill search happen on the
viewer's machine, and the test suite asserts the page makes no network request while reading it.
Only the conclusion is kept (the skills found). When the model writes the ranking, the resume text
is included in that one request, because keyword hits alone cannot show experience, and then it is
dropped. The sign-in and upload screens say so.

## Testing the study assistant

`tools/ai-eval.mjs` sends 123 realistic student questions (concepts for all three roadmaps, how the site works,
study plans, career questions, off-topic and trick questions, things it should not know) through the same
instructions and lesson text the site uses, then scores each answer with automatic checks and a second AI pass.
Run it on your own computer so the key stays there:

```
AI_API_KEY=your-key AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai AI_MODEL=your-model \
  npm run ai-eval
```

Options: `-- --only concept`, `-- --limit 20`, `-- --no-judge`. The report is written to `ai-eval-out/report.md`.
To improve an answer, change the instructions or the product facts in `public/tutor.js` and run it again.
The cases live in `tools/ai-eval-cases.mjs`; add a case whenever a real student question goes badly.
