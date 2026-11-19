-- Removes the four sample students and everything saved for them. Run before the public launch.
delete from auth.users where email like '%@sample.careerpath.invalid';

select count(*) as "Sample students left (should be 0)"
  from public.profiles where email like '%@sample.careerpath.invalid';
