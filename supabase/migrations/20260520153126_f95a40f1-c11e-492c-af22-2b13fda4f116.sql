-- Restore EXECUTE grants on relationship-check functions.
-- RLS policies referencing these functions require the caller to have EXECUTE,
-- even though the functions are SECURITY DEFINER. Revoking broke profile visibility
-- (coach->athlete, physio->patient) and all dependent policies.
GRANT EXECUTE ON FUNCTION public.is_coach_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_physio_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;