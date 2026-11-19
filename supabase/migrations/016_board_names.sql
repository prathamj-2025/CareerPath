-- 016_board_names.sql
-- Leaderboard names follow the same rule as the website (shortName in public/app.js), so a name with brackets is shortened
-- properly: "Pratham Jain (PJ)" was shown as "PJ (." and now shows as "PJ", "Ana (Ani) Ruiz" as "Ani".
--   "Priya Chavan"        -> "Priya C."
--   "Priya Chavan (Pri)"  -> "Pri"          (a nickname in brackets wins, as on the website)
--   "Priya (2027) Chavan" -> "Priya C."     (brackets without letters are ignored)
--   ""                    -> "Student"
-- Only the display function changes. No data changes. Safe to run again. Run any time after 004.

create or replace function public.display_name(n text)
returns text
language sql
immutable
as $$
  with a as (
    select btrim(coalesce(n, '')) as s
  ), b as (
    select case
             when substring(s from '\(([^)]+)\)') ~ '[A-Za-z]' then substring(s from '\(([^)]+)\)')
             else s
           end as s
    from a
  ), c as (
    select array(
             select w
             from regexp_split_to_table(btrim(regexp_replace(regexp_replace(s, '[()]', ' ', 'g'), '\s+', ' ', 'g')), ' ') with ordinality t(w, o)
             where w ~ '[A-Za-zÀ-ɏ]'
             order by o
           ) as p
    from b
  )
  select case
           when cardinality(p) = 0 then 'Student'
           when cardinality(p) = 1 then p[1]
           else p[1] || ' ' || upper(left(regexp_replace(p[cardinality(p)], '[^A-Za-zÀ-ɏ]', '', 'g'), 1)) || '.'
         end
  from c
$$;
