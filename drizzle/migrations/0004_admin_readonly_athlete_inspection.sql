CREATE OR REPLACE FUNCTION public.admin_inspect_athlete(_athlete_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _athlete_id AND role = 'athlete'::public.app_role) THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;
  RETURN jsonb_build_object(
    'recent_logs', COALESCE((SELECT jsonb_agg(x ORDER BY x.date DESC, x.created_at DESC) FROM (SELECT date, exercise, reps, weight_kg, rpe, created_at FROM public.training_logs WHERE athlete_id = _athlete_id ORDER BY date DESC, created_at DESC LIMIT 25) x), '[]'::jsonb),
    'recent_plans', COALESCE((SELECT jsonb_agg(x ORDER BY x.week_start_date DESC) FROM (SELECT week_start_date, status, is_deload FROM public.week_plans WHERE athlete_id = _athlete_id ORDER BY week_start_date DESC LIMIT 12) x), '[]'::jsonb),
    'recent_readiness', COALESCE((SELECT jsonb_agg(x ORDER BY x.date DESC) FROM (SELECT date, daily_form FROM public.readiness_surveys WHERE athlete_id = _athlete_id ORDER BY date DESC LIMIT 12) x), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_inspect_athlete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_inspect_athlete(uuid) TO authenticated;