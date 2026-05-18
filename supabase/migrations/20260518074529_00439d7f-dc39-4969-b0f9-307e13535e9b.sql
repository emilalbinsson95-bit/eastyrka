
CREATE OR REPLACE FUNCTION public.search_athlete_profiles(_query text)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'athlete'::public.app_role
  WHERE _query IS NOT NULL
    AND length(trim(_query)) >= 2
    AND p.full_name ILIKE '%' || _query || '%'
  ORDER BY p.full_name
  LIMIT 20
$$;

CREATE OR REPLACE FUNCTION public.search_patient_profiles(_query text)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'patient'::public.app_role
  WHERE _query IS NOT NULL
    AND length(trim(_query)) >= 2
    AND p.full_name ILIKE '%' || _query || '%'
  ORDER BY p.full_name
  LIMIT 20
$$;

REVOKE ALL ON FUNCTION public.search_athlete_profiles(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_athlete_profiles(text) TO authenticated;
REVOKE ALL ON FUNCTION public.search_patient_profiles(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_patient_profiles(text) TO authenticated;
