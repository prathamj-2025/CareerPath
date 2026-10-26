-- 006_realtime.sql
-- Live leaderboards. When a score, a star count, a roadmap, a school, a name or the "show me on the
-- leaderboard" choice changes, the database sends a tiny "changed" message on a Realtime channel.
-- Every open leaderboard for that school and roadmap hears it and reloads its own board at once.
-- Run once in the Supabase SQL editor, after 001 to 005. Safe to run again.
--
-- The message carries NO data (an empty object). It only says "look again". The board itself is still
-- read through the leaderboard functions, so nobody learns anything from the channel that the functions
-- would not already show them. Channels are private: only signed-in students can listen, a student can
-- listen only to their own school's course boards, and nobody can send from the website.
--
-- Channels:
--   board:<school>:<roadmap>   the course board for one school and roadmap, for example board:usc:pm
--   challenge:<challenge id>   the all-colleges board for one weekly challenge, for example challenge:pm-w1
--
-- Before running: in Supabase open Project Settings, then Realtime, and make sure Realtime is on (it is by default).

-- 1. One spelling of a school for channel names: "University of Michigan" becomes university-of-michigan.
create or replace function public.board_slug(s text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(btrim(coalesce(s, ''))), '[^a-z0-9]+', '-', 'g'))
$$;

-- 2. Send "changed" on a channel. A Realtime hiccup must never stop a student's score from saving,
-- so any failure here is swallowed.
create or replace function public.rt_send(p_topic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', p_topic, true);
exception when others then
  null;
end;
$$;

create or replace function public.rt_board(p_school text, p_roadmap text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.board_slug(p_school) = '' or p_roadmap is null or p_roadmap not in ('pm', 'ba', 'pjm') then
    return;
  end if;
  perform public.rt_send('board:' || public.board_slug(p_school) || ':' || p_roadmap);
end;
$$;

revoke all on function public.rt_send(text) from public, anon, authenticated;
revoke all on function public.rt_board(text, text) from public, anon, authenticated;

-- 3. Profile changes: points, roadmap, school, name, or the leaderboard choice.
create or replace function public.profile_board_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cid text;
begin
  if tg_op = 'DELETE' then
    perform public.rt_board(old.school, old.roadmap_id);
    return old;
  end if;

  perform public.rt_board(new.school, new.roadmap_id);
  if old.school is distinct from new.school or old.roadmap_id is distinct from new.roadmap_id then
    perform public.rt_board(old.school, old.roadmap_id);
  end if;

  -- Name, school or visibility also change how this student shows on the challenge boards they are on.
  if old.name is distinct from new.name or old.school is distinct from new.school
     or old.show_on_leaderboard is distinct from new.show_on_leaderboard then
    for cid in
      select distinct challenge_id from public.challenge_submissions
      where user_id = new.id and created_at > now() - interval '30 days' limit 20
    loop
      perform public.rt_send('challenge:' || cid);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_board_changed on public.profiles;
create trigger profiles_board_changed
  after update on public.profiles
  for each row
  when (old.points is distinct from new.points or old.roadmap_id is distinct from new.roadmap_id
        or old.school is distinct from new.school or old.name is distinct from new.name
        or old.show_on_leaderboard is distinct from new.show_on_leaderboard)
  execute function public.profile_board_changed();

drop trigger if exists profiles_board_deleted on public.profiles;
create trigger profiles_board_deleted
  after delete on public.profiles
  for each row execute function public.profile_board_changed();

-- 4. Star changes on a skill (skill ids end in the roadmap, for example sql-foundations-pm).
create or replace function public.progress_board_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sch text;
begin
  select school into sch from public.profiles where id = new.user_id;
  perform public.rt_board(sch, substring(new.skill_id from '-([a-z]+)$'));
  return new;
end;
$$;

drop trigger if exists skill_progress_board_changed on public.skill_progress;
drop trigger if exists skill_progress_board_inserted on public.skill_progress;
create trigger skill_progress_board_inserted
  after insert on public.skill_progress
  for each row execute function public.progress_board_changed();

drop trigger if exists skill_progress_board_updated on public.skill_progress;
create trigger skill_progress_board_updated
  after update on public.skill_progress
  for each row
  when (old.stars is distinct from new.stars)
  execute function public.progress_board_changed();

-- 5. A new weekly challenge submission.
create or replace function public.challenge_board_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rt_send('challenge:' || new.challenge_id);
  return new;
end;
$$;

drop trigger if exists challenge_submissions_board_changed on public.challenge_submissions;
create trigger challenge_submissions_board_changed
  after insert on public.challenge_submissions
  for each row execute function public.challenge_board_changed();

-- 6. Who may listen. Only signed-in students: any challenge channel, and the course boards of their own school.
-- Nobody gets a rule that lets them send.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "boards: signed-in students can listen" on realtime.messages';
    execute $p$
      create policy "boards: signed-in students can listen" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (
          realtime.topic() like 'challenge:%'
          or realtime.topic() like 'board:' || public.board_slug((select school from public.profiles where id = auth.uid())) || ':%'
        )
      )
    $p$;
  end if;
end;
$$;
