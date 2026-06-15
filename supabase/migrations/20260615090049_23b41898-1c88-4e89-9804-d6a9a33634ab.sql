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

  -- Grant all four roles to every new account so users can explore each view.
  insert into public.user_roles (user_id, role)
  values
    (new.id, 'coach'::public.app_role),
    (new.id, 'athlete'::public.app_role),
    (new.id, 'physio'::public.app_role),
    (new.id, 'patient'::public.app_role)
  on conflict (user_id, role) do nothing;

  -- Self-link so the user can program for / treat themselves.
  insert into public.coach_athletes (coach_id, athlete_id)
  values (new.id, new.id)
  on conflict do nothing;

  insert into public.physio_patients (physio_id, patient_id)
  values (new.id, new.id)
  on conflict do nothing;

  return new;
end;
$function$;