-- 014_rate_limits.sql
-- One shared counter for the per-minute and per-hour limits that used to be counted separately on each running copy of the
-- site (the study assistant burst limit, the written-answer marker, the public certificate check and the error report).
-- With several copies running, a determined caller could get a few times the limit; with this table they cannot.
--
-- The server calls take_burst(key, window in seconds, max) once per request. It counts the request in the current window
-- and says whether it is allowed. Keys never hold an email or a name: a student id, or a one-way hash of an address.
-- Nothing here can be read or called from the site itself, only by the server (service role key).
-- Safe to run again. Run after 013, and after the website that calls it is deployed (until then the old per-copy limits apply).

create table if not exists public.rate_hits (
  key          text not null check (char_length(key) between 1 and 120),
  window_start timestamptz not null,
  n            int  not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;

create or replace function public.take_burst(p_key text, p_window int, p_max int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ws timestamptz;
  c int;
begin
  if p_key is null or char_length(p_key) not between 1 and 120 then raise exception 'bad key'; end if;
  if p_window is null or p_window not between 1 and 86400 then raise exception 'bad window'; end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.rate_hits (key, window_start, n) values (p_key, ws, 1)
    on conflict (key, window_start) do update set n = public.rate_hits.n + 1 returning n into c;
  if random() < 0.01 then                       -- keep the table small
    delete from public.rate_hits where window_start < now() - interval '1 day';
  end if;
  return jsonb_build_object('ok', c <= p_max, 'n', c);
end;
$$;

revoke all on function public.take_burst(text, int, int) from public, anon, authenticated;
grant execute on function public.take_burst(text, int, int) to service_role;
