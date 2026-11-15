# CareerPath: notes for working in this repo

Vanilla JS single page app (`public/app.js`) plus Vercel serverless functions (`api/*.js`) and Supabase. Free tiers only.

## Hard rules
- **Vercel Hobby allows 12 functions per deployment, and we are at exactly 12.** Files starting with `_` are helpers, not
  routes. New server features go in a `_` helper and are dispatched from an existing function (see `api/config.js?task=`).
  `test/keepalive.spec.mjs` fails if a 13th function appears.
- **Answer keys never reach `public/`.** `content/*.js` is the source (full, with keys, never served). After changing it run
  `npm run build:content`, and commit both folders. `test/grading.spec.mjs` fails if they disagree or a key leaks.
- Stars, scores and certificates are written only by the server. Never add a browser path that sets them.
- No paid services. Avoid redeploys that are not needed.
- Short answers, no em dashes in anything written for the owner.

## Layout
- `content/lessons-pm.js`, `lessons-pjm.js`, `lessons-ba.js`: the three courses (5 modules, 28 skills each). Built by
  `tools/build_lessons_*.py` from written module files that live outside the repo; the built files are the source of truth.
  `docs/ba-course-source/` keeps the BA spec, review notes and outline.
- `content/data6.js`: resume vocabulary, guided questions, weekly challenges (rubric patterns, server only).
- Admin edits: lessons and questions (008), weekly challenges (011), project briefs and practice (013) are stored in the
  database and overlaid on the files by `api/_content.js`. Restore saves an old version as a new live one.
- `supabase/migrations/*.sql`: run in order in the SQL editor. `test/sql.spec.mjs` runs them on in-memory Postgres.

## Testing
- `./test/start-servers.sh` starts the local servers (demo 3111, real 3114/3115/3116/3117/3118, fake supabase 3113, fake
  model 3112). Restart them after changing anything in `api/`.
- Browser tests: `export CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the same shell call.
- `npm test` runs every spec in a chain and stops at the first failing file. Run one with `node test/<name>.spec.mjs`.

## Shipping
Zip with `git archive`, unzip into the Prototypes folder, rsync into `~/CareerPath_push`, `git add -A`, commit, push.
Run any new migration only after the matching website version is deployed (each migration file says so).
