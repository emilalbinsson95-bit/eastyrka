
-- Backfill: coach-owned pending links become accepted (coach-initiated flow).
UPDATE public.coach_athletes SET status = 'accepted' WHERE status = 'pending';
UPDATE public.physio_patients SET status = 'accepted' WHERE status = 'pending';

-- Self-links from new-user trigger should be accepted so the user can coach/treat themselves.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values
    (new.id, 'coach'::public.app_role),
    (new.id, 'athlete'::public.app_role),
    (new.id, 'physio'::public.app_role),
    (new.id, 'patient'::public.app_role)
  on conflict (user_id, role) do nothing;

  insert into public.coach_athletes (coach_id, athlete_id, status)
  values (new.id, new.id, 'accepted')
  on conflict do nothing;

  insert into public.physio_patients (physio_id, patient_id, status)
  values (new.id, new.id, 'accepted')
  on conflict do nothing;

  return new;
end;
$function$;
