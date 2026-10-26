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
with no reload. Business Analyst issues a certificate per skill at three stars or above.

**Project Manager course.** 5 main modules, 28 sub-modules, 200 lessons, built the same way as the Product
Manager course: Project Management Fundamentals, Planning Risk and Control, Agile and Hybrid Delivery,
Leadership and Stakeholder Management (four certificates), and Interview-Ready Project Manager (practice only).
Every calculation in it (critical path, PERT, earned value, EMV, velocity, cycle time, capacity, weighted scores)
was computed in code, and every module went through an independent accuracy review before it was added.

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
rubric, with written feedback from the assistant and its own leaderboard. The rubric sets the
score so two identical answers always score the same; the model writes the feedback around it.

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
- Known gap: until exams are graded on the server, a student could change their own stars and points from the
  browser. The rules stop anyone touching another student's data. Server-side grading closes the gap.
- Tests: `test/sql.spec.mjs` runs the migration files on an in-memory Postgres and checks the security rules.
  `accounts`, `progress` and `community` specs run against `test/fakesupabase.mjs`, a small stand-in server.

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

   For **OpenAI**:

   | Name          | Value                          |
   | ------------- | ------------------------------ |
   | `AI_API_KEY`  | your key from platform.openai.com |
   | `AI_BASE_URL` | `https://api.openai.com/v1`    |
   | `AI_MODEL`    | `gpt-4o-mini`                  |

5. Deploy. If you add the key after the first deploy, redeploy so the function picks it up.

The key is only ever read inside `api/ask.js`, which runs on Vercel's servers. It is never
sent to the browser and is not in this repository.

### Switching provider

`api/ask.js` speaks the OpenAI chat-completions format, which OpenAI, Gemini and several
other providers all serve. Changing provider means changing those three variables and
redeploying. No code changes.

## Tests

There is a browser test suite covering the student flow, the admin draft-and-publish
workflow, the assistant, and the deployed shape of the site.

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
public/index.html      Markup and all styling.
public/app.js          The whole application: routing, scoring, admin, assistant.
public/data.js         Product Manager track.
public/data2.js        Business Analyst track.
public/lessons-pjm.js Project Manager course (built by tools/build_lessons_pjm.py).
public/data4.js        Practice exercises: prompts, schemas, hints, model answers.
public/data5.js        Answer-checking rules for practice exercises.
public/data6.js        Resume vocabulary, the five guided questions and the weekly challenge library.
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

**Grading still runs in the browser.** Accounts, progress, points and the leaderboard are saved in the
database, but stars and points are calculated by the page, so a technically skilled student could forge
them. Moving grading into database functions closes this and is the next backend step.

**The answer check is structural.** A practice query is checked against what a correct
answer must contain and the mistakes that make one wrong. It does not execute the query,
because there is no database behind the page. Written answers are checked for concept
coverage, which reports whether an idea was raised, not how well it was argued. Both
caveats are printed in the app where a learner sees them.

**Question banks are still growing.** Ten questions per assessment on most skills; the Business Analyst
roadmap is being expanded to the same depth as Product Manager and Project Manager.

**The preview copy simulates classmates.** On the live site the school leaderboard is read from the
database every 30 seconds. The Claude artifact copy has no database, so it generates sample classmates
and says so on the page.

**Resume parsing works on most PDFs, not all.** Text is pulled out of the file's own streams
and mapped back through the embedded font's ToUnicode table, which covers what Word, Google
Docs and LibreOffice export. A scanned or image-only resume has no text to find, so the page
says so and offers a paste box instead of failing quietly.

## Design decisions worth defending

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

**The rubric scores the challenge, the model explains it.** A score that changes between two
identical submissions cannot sit on a leaderboard, so the criteria are fixed and published
before the student writes. The model's job is to say what to do better, not to decide the
number.

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
