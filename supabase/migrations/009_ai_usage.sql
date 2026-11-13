-- 009_ai_usage.sql
-- Limits on the study assistant, so one account (or one script) cannot run up the AI bill.
-- The server (api/ask.js) calls take_ai() once per question. It counts the question against the student's hour and day,
-- and against a site-wide day, and says whether it is allowed. Nothing here can be read or called from the site itself.
-- Safe to run again. Run after 008, and after the website that calls it is deployed (until then the assistant is not limited).

create table if not exists public.ai_usage (
  user_id      uuid not null,                  -- the all-zero id holds the site-wide count for the day
  kind         text not null check (kind in ('hour', 'day')),
  window_start timestamptz not null,
  n            int  not null default 0,
  primary key (user_id, kind, window_start)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.take_ai(p_user uuid, p_hour int, p_day int, p_global int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hs timestamptz := date_trunc('hour', now());
  ds timestamptz := date_trunc('day', now());
  zero uuid := '00000000-0000-0000-0000-000000000000';
  h int; d int; g int;
begin
  if p_user is null or p_user = zero then
    raise exception 'a signed-in user is required';
  end if;

  insert into public.ai_usage (user_id, kind, window_start, n) values (p_user, 'hour', hs, 1)
    on conflict (user_id, kind, window_start) do update set n = public.ai_usage.n + 1 returning n into h;
  insert into public.ai_usage (user_id, kind, window_start, n) values (p_user, 'day', ds, 1)
    on conflict (user_id, kind, window_start) do update set n = public.ai_usage.n + 1 returning n into d;

  -- A student who is over their own limit does not use up the site-wide allowance for everyone else.
  if h > p_hour then return jsonb_build_object('ok', false, 'why', 'hour', 'hour', h, 'day', d); end if;
  if d > p_day  then return jsonb_build_object('ok', false, 'why', 'day',  'hour', h, 'day', d); end if;

  insert into public.ai_usage (user_id, kind, window_start, n) values (zero, 'day', ds, 1)
    on conflict (user_id, kind, window_start) do update set n = public.ai_usage.n + 1 returning n into g;
  if g > p_global then return jsonb_build_object('ok', false, 'why', 'global', 'hour', h, 'day', d, 'global', g); end if;

  if random() < 0.01 then                       -- keep the table small
    delete from public.ai_usage where window_start < now() - interval '3 days';
  end if;
  return jsonb_build_object('ok', true, 'why', '', 'hour', h, 'day', d, 'global', g);
end;
$$;

revoke all on function public.take_ai(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.take_ai(uuid, int, int, int) to service_role;
