
-- 1. Revoke EXECUTE on relationship-check SECURITY DEFINER fns from anon (and authenticated where not needed).
--    RLS policies invoke them as the policy owner; end-user EXECUTE grants are not required.
REVOKE EXECUTE ON FUNCTION public.is_coach_of(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_physio_of(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;

-- 2. Restrict search RPCs to the appropriate role and revoke from anon entirely.
CREATE OR REPLACE FUNCTION public.search_athlete_profiles(_query text)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'athlete'::public.app_role
  WHERE _query IS NOT NULL
    AND length(trim(_query)) >= 2
    AND p.full_name ILIKE '%' || _query || '%'
    AND public.has_role(auth.uid(), 'coach'::public.app_role)
  ORDER BY p.full_name
  LIMIT 20
$function$;

CREATE OR REPLACE FUNCTION public.search_patient_profiles(_query text)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'patient'::public.app_role
  WHERE _query IS NOT NULL
    AND length(trim(_query)) >= 2
    AND p.full_name ILIKE '%' || _query || '%'
    AND public.has_role(auth.uid(), 'physio'::public.app_role)
  ORDER BY p.full_name
  LIMIT 20
$function$;

REVOKE EXECUTE ON FUNCTION public.search_athlete_profiles(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.search_patient_profiles(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_athlete_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_patient_profiles(text) TO authenticated;

-- 3. Allow athletes to read their own baseline history.
CREATE POLICY "Athletes can view their own baseline history"
  ON public.baseline_history
  FOR SELECT
  TO authenticated
  USING (athlete_id = auth.uid());
