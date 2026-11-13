-- 010_certificates.sql
-- Certificates with a public verification ID.
-- The server (api/certs.js) issues a certificate when a student has earned it: a passed module exam, or three stars on a
-- skill for roadmaps without modules. Each gets a random ID like CP-7K2M-X9QD that cannot be guessed or worked out from
-- anything else. Anyone with an ID can check it on the verification page (api/verify.js), which shows only the holder's
-- name, the title, the roadmap, the school, the date and the score. An admin can revoke a certificate (set revoked_at),
-- and the page then says so.
-- Nothing here is written from the browser: students and admins can read, only the server writes (service role key).
-- Safe to run again. Run after 009, and after the website that uses it is deployed.

create table if not exists public.certificates (
  id           text primary key check (id ~ '^CP-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('skill', 'module')),
  target       text not null check (char_length(target) between 1 and 80),     -- the skill id or the module (track) id
  title        text not null check (char_length(title) between 1 and 200),
  holder       text not null default '' check (char_length(holder) <= 200),
  school       text not null default '' check (char_length(school) <= 200),
  roadmap_id   text not null default '',
  roadmap_name text not null default '',
  stars        int  not null default 0 check (stars between 0 and 5),
  score        int  not null default 0 check (score between 0 and 100),
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (user_id, kind, target)
);
create index if not exists certificates_user on public.certificates (user_id);

alter table public.certificates enable row level security;
drop policy if exists "certificates: read own" on public.certificates;
create policy "certificates: read own" on public.certificates for select to authenticated using (user_id = auth.uid());
drop policy if exists "certificates: admins read all" on public.certificates;
create policy "certificates: admins read all" on public.certificates for select to authenticated using (public.is_admin());
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;           -- reads only; the server writes with the service role
