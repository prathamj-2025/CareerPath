# Reviewer brief: ship-quality accuracy review of Business Analyst modules

This is a live product that students use to learn and to prepare for exams and jobs. You are a senior CBAP-level business analyst and an exacting copy editor. For EACH module file assigned to you (`/home/claude/content-ba/new/<id>.json`; lesson titles and intent are in `/home/claude/content-ba/outline.json`; format rules are in `/home/claude/content-ba/SPEC.md`):

1. Read every lesson body, scenario, revision card, quiz and assessment item.
2. Fact-check: every definition, formula, framework description, role name and process claim must match standard accepted practice (BABOK Guide v3 concepts, BPMN 2.0, UML, DFD and ERD notation, Scrum Guide, SQL semantics, spreadsheet functions, common certification facts). Remove or hedge anything you cannot confirm. No prices, fees or pass rates. Fix wrong or misleading statements.
3. Recompute EVERY number with python3, and for DATA MODULES re-execute every SQL or code block against the TuneBox data (`/home/claude/content-pm2/SCHEMA.md`, `/home/claude/content-pm2/data/tunebox.db`) and compare the pasted output exactly (business case maths, availability, cycle time, weighted scores, decision-table coverage, spreadsheet formula results, etc.). Fix any mismatch between text, tables, answers and `why` explanations.
4. Question quality: every mcq, quiz item and assessment item must have exactly one defensible best answer; wrong options must be clearly worse (not arguably right); the `a` index must be correct; the `why` must explain it. Rewrite any ambiguous, trick, trivia or flawed item. Keep assessment levels 1,1,2,2,3,3,4,4,5,5, spread answer positions, avoid the correct option being systematically longest. Check written `points[].re` still match `improved`.
5. Teaching quality: lessons must be complete and useful for a beginner who wants to genuinely learn the topic and pass exams. If a lesson skips something important that its title promises, add it (within the 450-850 word body limit; trim fluff first). Keep the exact lesson titles.
6. Language: US spelling, plain, consistent, no em/en dashes, ASCII only.

Edit the JSON in place (read, modify with python, write back; keep a one-time backup in `/tmp/scratch-review-<id>.json`). Then run `node /home/claude/content-ba/validate_module.mjs <file> <lessonCount>` for each module until OK. Do not touch other files.

Reply with ONE short paragraph: for each module, how many substantive fixes you made (facts, numbers, questions) and the single most important one. No pasted content.
