-- Four sample students on the USC Product Manager leaderboard, for testing before launch.
-- Paste into the Supabase SQL editor and run. Safe to run again (it replaces them).
-- They have no password, so nobody can sign in as them. Remove them with remove_sample_students.sql.
-- Points follow the real rules: 100 per star, best score per skill decides the stars.

do $$
declare
  s record;
  uid uuid;
begin
  delete from auth.users where email like '%@sample.careerpath.invalid';

  for s in
    select * from (values
      ('aanya.sharma',  'Aanya Sharma',  'Engineering Management', 'Nov 13, 2026',
        '[{"skill":"foundations-pm","best":76,"stars":3,"lessons":8,"hist":[{"pct":76,"stars":3,"when":"Nov 13, 2026"}]},
          {"skill":"lifecycle-pm","best":62,"stars":1,"lessons":7,"hist":[{"pct":62,"stars":1,"when":"Nov 16, 2026"}]}]'),
      ('daniel.kim',    'Daniel Kim',    'Computer Science',       'Nov 14, 2026',
        '[{"skill":"foundations-pm","best":84,"stars":3,"lessons":8,"hist":[{"pct":60,"stars":1,"when":"Nov 14, 2026"},{"pct":84,"stars":3,"when":"Nov 15, 2026"}]}]'),
      ('sofia.martinez','Sofia Martinez','MBA',                    'Nov 15, 2026',
        '[{"skill":"foundations-pm","best":68,"stars":2,"lessons":8,"hist":[{"pct":68,"stars":2,"when":"Nov 17, 2026"}]}]'),
      ('rohan.mehta',   'Rohan Mehta',   'Business Analytics',     'Nov 17, 2026',
        '[{"skill":"foundations-pm","best":52,"stars":1,"lessons":6,"hist":[{"pct":44,"stars":0,"when":"Nov 17, 2026"},{"pct":52,"stars":1,"when":"Nov 18, 2026"}]}]')
    ) v(handle, full_name, major, joined, skills)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            s.handle || '@sample.careerpath.invalid', '', now(),
            '{"provider":"email","providers":["email"],"sample":true}'::jsonb,
            jsonb_build_object('name', s.full_name, 'school', 'USC', 'major', s.major),
            to_date(s.joined, 'Mon DD, YYYY'), now(), '', '', '', '');

    -- The sign-up trigger made the profile; give it the roadmap and the points its stars earned.
    update public.profiles p
       set school = 'USC', major = s.major, roadmap_id = 'pm',
           points = (select coalesce(sum((x ->> 'stars')::int), 0) * 100 from jsonb_array_elements(s.skills::jsonb) x)
     where p.id = uid;

    insert into public.skill_progress (user_id, skill_id, stars, best, attempts, lessons_done, history)
    select uid, x ->> 'skill', (x ->> 'stars')::int, (x ->> 'best')::int, jsonb_array_length(x -> 'hist'),
           array(select generate_series(0, (x ->> 'lessons')::int - 1)), x -> 'hist'
      from jsonb_array_elements(s.skills::jsonb) x;
  end loop;
end $$;

-- What the board will show (short names, like students see them).
select public.display_name(p.name) as "On the board", p.major, p.points,
       (select coalesce(sum(stars), 0) from public.skill_progress where user_id = p.id) as stars
  from public.profiles p
 where p.email like '%@sample.careerpath.invalid'
 order by p.points desc;
