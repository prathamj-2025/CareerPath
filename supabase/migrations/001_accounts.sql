-- 001_accounts.sql
-- Accounts: one profile row per signed-in user, plus the student/admin role.
-- Run once in the Supabase SQL editor. Safe to run again.
-- Everyone else's tables should reference public.profiles(id).

-- 1. The profiles table. id is the same value as the sign-in user id.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        text not null default 'student' check (role in ('student', 'admin')),
  school      text not null default '',
  major       text not null default '',
  grad_year   text not null default '',
  title       text not null default '',
  picture_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- 2. Admin check used by the security rules. SECURITY DEFINER so the rule can look
--    at profiles without triggering the same rule again.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 3. Create the profile automatically when someone signs up (email or Google).
--    Role is always 'student' here. Admins are promoted by hand (see bottom of file).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, school, major, grad_year)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    coalesce(new.raw_user_meta_data ->> 'school', ''),
    coalesce(new.raw_user_meta_data ->> 'major', ''),
    coalesce(new.raw_user_meta_data ->> 'grad_year', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 5. Security rules (row level security).
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all" on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- No insert policy: rows are created only by the sign-up trigger.
-- No delete policy: rows go away only when the auth user is deleted.

-- 6. A student may change only these columns. role, email and id cannot be edited from
--    the website, so nobody can make themselves an admin.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, school, major, grad_year, picture_url) on public.profiles to authenticated;

-- 7. Making an admin (run by hand, in the SQL editor, for your own email):
--    update public.profiles set role = 'admin', title = 'Content Manager'
--    where lower(email) = lower('you@example.com');
