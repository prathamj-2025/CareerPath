# Writer brief: one CareerPath Business Analyst sub-module

You write ONE module for a Business Analyst course for beginners (MS students and career switchers).
Voice: plain, friendly, concrete, never hypey; short sentences; define every term the first time; use real
company examples only where well known and label invented numbers "illustrative" or "hypothetical".
The reader has no prior project experience. Method-neutral and tool-neutral; teach BABOK Guide v3 concepts and common industry practice accurately, in your own words.
Use recurring invented organizations for worked examples (a regional bank branch, a clinic scheduling system, an online retailer returns process, a university enrollment office) and label them "illustrative".

## Inputs (read first)
- `/home/claude/content-ba/outline.json` : find your module by id: name, lens, summary, exact lesson titles (use them verbatim, in order), `project`, `notes`.
- Style exemplars (read 2 lessons and the quiz/assessment of each): `/home/claude/content-pm2/mods/metrics-pm.json`, `/home/claude/content-pm2/mods/experimentation-pm.json`. Match their tone, depth and structure exactly. (They are about product management; yours is business analysis.)
- Modules marked DATA MODULE in their `notes` use the TuneBox practice dataset: read `/home/claude/content-pm2/SCHEMA.md` (SQLite at `/home/claude/content-pm2/data/tunebox.db`, CSVs beside it) and execute EVERY query or code block, pasting only true output (each output block under 12 lines, each code block under 20 lines, no SQL comments `--`). For all other modules there is no dataset: every calculation (business case maths, availability, cycle time, weighted scores, decision-table coverage, traceability coverage, formulas) must be computed by you with python3 and pasted from real output.

## Output
Write exactly one file: `/home/claude/content-ba/new/<id>.json`. Work ONLY in that file and in your own scratch folder `/tmp/scratch-<id>/`. Do not touch any other file. Write it in chunks (build each lesson in a scratch JSON, then merge with a small python script) so a failure never loses finished work.
The file is JSON: `{"lessons":[...], "quiz":[...], "assessment":[...]}` and nothing else.

### Lesson object
```
{"title": <exact title, <=70 chars>, "minutes": 7-12,
 "body": "<markdown subset>",
 "scenario": {"setup": "<2-3 sentences, a concrete workplace situation, second person "You are a business analyst at ..."",
   "mcq": {"q":"...", "opts":[4 strings], "a": <0-3>, "why":"..."},
   "written": {"prompt":"In 3 to 6 sentences, ...", "points":[3-5 of {"label":"...","re":"<regex text>"}],
               "improved":"<model answer, 4-7 sentences>", "lesson":"Lesson: <one sentence>"}},
 "revision": [[concept, remember] x 4-7]}
```
### Body rules (validator enforces)
- 450-850 words excluding code blocks. Markdown subset ONLY: `## Heading`, `### Sub`, paragraphs, `- ` bullets, `1. ` numbered, `> ` callout, tables with `|`, fenced code (```sql / ```python / ```text), `**bold**`, `` `code` ``.
- Structure: opening 1-3 sentence hook paragraph (no heading), 2-4 teaching `##` sections, EXACTLY ONE `> ` callout line (the single most important idea, one line, placed after the teaching sections), then `## Why this matters`, `## Common mistakes`, `## Key takeaways` (LAST; 3-5 `- ` bullets).
- Include at least one worked example, table, or runnable code per lesson. Calculation lessons: show the inputs and the worked result in a ```text block.
- ASCII only: no smart quotes, no em/en dashes, no arrows, no emoji, no "--" as a dash. Use straight quotes. Write "x" not the multiplication sign.
- Never write "In conclusion", "delve", "landscape", "unlock", "leverage" as filler.

### Scenario rules
- The MCQ tests a DECISION, not trivia. The correct option must NOT be systematically the longest or most detailed; vary the correct position 0..3 across lessons. Wrong options must be plausible mistakes a real beginner would pick.
- The written prompt asks the learner to explain what they would do/say/query (3-6 sentences). `points` are 3-5 key ideas a good answer covers; each `re` is a case-insensitive regex alternation of realistic words/phrases (e.g. `"cohort|segment|by channel"`), written loosely enough that different valid phrasings match, tightly enough that filler text ("I would think about it and know the idea") does not. `re` must match your own `improved` answer for every point. No point may match an empty string. Avoid bare common words (idea, know, data, user) as the only alternatives.
- `improved` is a model answer the learner can compare with. `lesson` is the one-sentence takeaway.

### Quiz (4 items) and Assessment (10 items)
Objects `{"q","opts":[4],"a":0-3,"why"}`; assessment items also carry `"lvl"` and the levels are EXACTLY in order 1,1,2,2,3,3,4,4,5,5 (1 recall, 2 understand, 3 apply, 4 analyze a situation, 5 judge/trade-off scenarios). Assessment questions must cover the whole module evenly (not just the first lessons), be answerable from the lessons, and have a unique best answer. Spread correct answer positions (no more than 4 of 10 in any slot). At levels 3-5 include calculation or judgement questions whose answer you verified in python or by clear reasoning.

### Accuracy (non-negotiable)
- Every calculation must be executed by you in python3 and the numbers in the lesson must match the output. Keep each text/table block under 14 lines and any code block under 20 lines (the reader is on a phone). Most lessons need no code: use worked examples in ```text blocks (tables, networks, templates) instead.
- Facts about real tools, frameworks, certifications and laws must be ones you are certain of; otherwise say "typically", "check the current official guide" or omit. Never state prices, exam fees or pass rates. Not legal advice where contracts appear.
- Put number formats consistent with the actual output.

### Finish
1. `node /home/claude/content-ba/validate_module.mjs /home/claude/content-ba/new/<id>.json <lessonCount>` must print OK (warnings about "longest option" mean fix by rebalancing option length; try to have none).
2. Re-check every number in the lessons, quiz and assessment against your python output.
3. Reply with ONE line: `done <id> <lessons> lessons, validator OK`. Do not paste the content back.

## Ship-quality bar (added: this is a live product, not a prototype)
Students will use this to genuinely learn and prepare for exams and jobs. Treat every sentence as published. Teach standard, widely accepted practice (BABOK Guide v3 concepts, standard modeling notations such as BPMN, UML, DFD and ERD, Scrum Guide ideas, standard techniques) correctly and completely; where practice differs by organization say so. Do not simplify into something wrong. Every formula must be stated correctly and shown with a verified worked example. Every quiz and assessment question must have exactly one defensible best answer, with a "why" that explains the other options. Prefer depth and concrete, realistic worked examples over generalities. If you are not certain of a fact, leave it out or hedge it.
