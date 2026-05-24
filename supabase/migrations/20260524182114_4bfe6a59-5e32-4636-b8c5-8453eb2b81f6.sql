
-- Allow athletes to read their own baselines
CREATE POLICY "Athlete can view own baselines"
ON public.baselines
FOR SELECT
TO authenticated
USING (athlete_id = auth.uid());

-- Revoke public/anon EXECUTE on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.log_ten_k_pb_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_schedule_overrides_for_endurance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_schedule_overrides_for_planned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_schedule_overrides_for_rehab() FROM PUBLIC, anon, authenticated;
