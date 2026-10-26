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

Run them in order, one at a time, in the SQL editor.

Rules for everyone working here
- Every new table turns on row level security and ships its policies in the same file.
- Reference `public.profiles(id)` for the student. Use `public.is_admin()` for admin-only rules.
- Never put the service role key in the repo, the website or a chat. Only the Project URL and
  the anon public key are allowed in the website.
