CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  requested_role text;
  assigned_role public.app_role;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'athlete'));

  if requested_role = 'coach' then
    assigned_role := 'coach'::public.app_role;
  else
    assigned_role := 'athlete'::public.app_role;
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$function$;