-- 004_leaderboard_account.sql
-- 1) The school leaderboard, built from real students' saved results.
-- 2) A student can hide themselves from it.
-- 3) A student can delete their own account and everything saved for it.
-- Run once in the Supabase SQL editor, after 001, 002 and 003. Safe to run again.
--
-- RUN THIS BEFORE deploying the website version that uses it: the site saves the "show me on the
-- leaderboard" choice with the rest of the profile.

alter table public.profiles
  add column if not exists show_on_leaderboard boolean not null default true;
grant update (show_on_leaderboard) on public.profiles to authenticated;

-- "Priya Chavan" becomes "Priya C." Other students never see a full name.
create or replace function public.display_name(n text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(n, '')) = '' then 'Student'
    when position(' ' in btrim(n)) = 0 then btrim(n)
    else split_part(btrim(n), ' ', 1) || ' ' ||
         upper(left((regexp_split_to_array(btrim(n), '\s+'))[cardinality(regexp_split_to_array(btrim(n), '\s+'))], 1)) || '.'
  end
$$;

-- The board for one roadmap at one school: the top 50 plus the caller, ranked by points, then stars.
-- Runs with elevated rights so it can total other students' results, but it returns only a short name,
-- points and star totals, and a student can only ask for their own school.
create or replace function public.leaderboard(p_roadmap text, p_school text)
returns table (user_id uuid, display_name text, points int, total_stars int, job_ready int, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select id, school from public.profiles where id = auth.uid()
  ),
  eligible as (
    select p.id, p.name, p.points,
           coalesce(sum(sp.stars), 0)::int as stars,
           (count(*) filter (where sp.stars >= 3))::int as ready
    from public.profiles p
    left join public.skill_progress sp
           on sp.user_id = p.id and sp.skill_id like '%-' || p_roadmap
    where auth.uid() is not null
      and p_roadmap in ('pm', 'ba', 'pjm')
      and p.role = 'student'
      and p.roadmap_id = p_roadmap
      and p.school = p_school
      and (p_school = (select school from caller) or public.is_admin())
      and (p.show_on_leaderboard or p.id = auth.uid())
    group by p.id
  ),
  ranked as (
    select e.*, row_number() over (order by e.points desc, e.stars desc, e.name, e.id) as rn
    from eligible e
  )
  select r.id, public.display_name(r.name), r.points, r.stars, r.ready, r.id = auth.uid()
  from ranked r
  where r.rn <= 50 or r.id = auth.uid()
  order by r.rn
$$;

revoke all on function public.leaderboard(text, text) from public, anon;
grant execute on function public.leaderboard(text, text) to authenticated;

-- Deleting an account removes the sign-in, and the profile, progress and results go with it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if public.is_admin() then
    raise exception 'admin accounts are removed by the platform team';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
