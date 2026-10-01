# CareerPath

A skill-verification platform for students preparing for a specific career role. Pick a
target role, get the roadmap of skills it needs, learn each one through that role's lens,
and earn stars only by passing assessment. Nothing can be checked off by hand.

Built as the team prototype for MOR 531 at USC.

## What it does

**Four role tracks**, 21 skills. The same named skill is taught and assessed differently
per role: SQL for a Product Manager covers funnels, retention and experiment readouts,
while SQL for a Financial Analyst covers ledger periods and trial balance tie-outs. That
difference is the product thesis.

**Onboarding.** Upload a resume and CareerPath reads it in the browser, works out which of
the 21 skills it actually claims, asks eight plain questions with no right answer, and ranks
the four roadmaps with the reason for each. Every step is skippable and the ranking is advice,
not a gate. The file is parsed on the viewer's own machine and never uploaded anywhere.

The ten questions are a mix. Six ask how the person prefers to work and have no right answer;
four have a best answer and say so. None of them needs prior knowledge, because asking a
stranger to write SQL before they have picked a roadmap filters out exactly the people the
recommendation is for. No question shows which roadmap an option favours: a visible label turns
the test into a form where people pick the role they already had in mind.

The ranking itself is a model call. It gets the resume matches, every answer, and which of the
applied questions were right, and returns a match percentage and a reason per roadmap. The
model's reply is parsed strictly and discarded if it does not fit, and a fixed set of weights
ranks the roadmaps instead. The page says which of the two produced the numbers.

**Student side.** Choose a target role, work through course modules, attempt
practice exercises with progressive hints and an answer check, take a 10-question
assessment graded L1 to L5, earn one to five stars, download a certificate at three stars
or above, and compete on a leaderboard limited to your own school and target role. The
leaderboard updates on screen as other students finish, with no reload.

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

## Running it

```bash
npm i -g vercel        # once
cp .env.example .env   # then paste your key into .env
vercel dev
```

Open http://localhost:3000.

The site itself is static and needs no build step. The only server-side piece is
`api/ask.js`, which the study assistant calls.

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
public/data2.js        Business Analyst and Data Analyst tracks.
public/data3.js        Financial Analyst track.
public/data4.js        Practice exercises: prompts, schemas, hints, model answers.
public/data5.js        Answer-checking rules for practice exercises.
public/data6.js        Resume vocabulary and the weekly challenge library.
public/onboard.js      Resume parsing, skill detection, placement, recommendation.
test/app.spec.mjs      Student and admin flows.
test/onboarding.spec.mjs Resume, placement, recommendation, challenge, live board, history.
test/assistant.spec.mjs  Assistant, both backends, and the assessment lock.
test/deploy.spec.mjs   The deployed build: assets, encoding, /api/ask streaming.
test/devserver.mjs     Local stand-in for Vercel's routing.
test/fakeopenai.mjs    Local stand-in for the model provider.
```

`app.js` has two assistant backends behind one interface. On claude.ai it uses the
artifact runtime; anywhere else it posts to `/api/ask`. Opened as a local file with neither
available, the assistant hides itself and the rest of the app works normally.

## Known limits of the prototype

**Nothing persists.** All state is in memory, so a refresh resets everything and accounts
do not exist across devices. Adding a database is the next step, and the honest place to
draw the line between a prototype and a product.

**The answer check is structural.** A practice query is checked against what a correct
answer must contain and the mistakes that make one wrong. It does not execute the query,
because there is no database behind the page. Written answers are checked for concept
coverage, which reports whether an idea was raised, not how well it was argued. Both
caveats are printed in the app where a learner sees them.

**Question banks are demo-depth.** Ten questions per assessment, enough to demonstrate the
scoring honestly, not a full curriculum.

**Peer activity on the leaderboard is simulated.** The board genuinely updates live, but with
no shared backend there are no other real students to update it, so results are generated on a
timer in the page. The UI says so where a student can see it. In the product this is one
subscription to the same rows every open page is watching, which is why the code paints only
the board rather than re-rendering the view.

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

**The placement questions have no right answer and no score.** A score there would imply the
product had judged the person before teaching them anything, and it would be the wrong signal
anyway: what roadmap suits you is a question about what you want to do, not what you can
already do. The skills half of the ranking comes from the resume.

**The resume is read in the browser and not stored.** Parsing and the skill search happen on the
viewer's machine, and the test suite asserts the page makes no network request while reading it.
Only the conclusion is kept (the skills found). When the model writes the ranking, the resume text
is included in that one request, because keyword hits alone cannot show experience, and then it is
dropped. The sign-in and upload screens say so.
