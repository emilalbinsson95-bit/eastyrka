CREATE OR REPLACE FUNCTION public.split_planned_session(_session_id uuid, _target_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wp public.week_plans%ROWTYPE;
  _ps public.planned_sessions%ROWTYPE;
  _new_id uuid;
  _moved int;
BEGIN
  SELECT * INTO _ps FROM public.planned_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  SELECT * INTO _wp FROM public.week_plans WHERE id = _ps.week_plan_id;
  IF NOT ((_wp.athlete_id = auth.uid() AND _wp.status = 'published') OR _wp.coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.planned_sessions (week_plan_id, day_of_week, title, notes)
  VALUES (_ps.week_plan_id, _ps.day_of_week, coalesce(_ps.title, 'Pass') || ' (del 2)', _ps.notes)
  RETURNING id INTO _new_id;

  UPDATE public.planned_exercises pe SET planned_session_id = _new_id
  WHERE pe.planned_session_id = _session_id
    AND NOT EXISTS (SELECT 1 FROM public.training_logs tl WHERE tl.planned_exercise_id = pe.id);
  GET DIAGNOSTICS _moved = ROW_COUNT;
  IF _moved = 0 THEN RAISE EXCEPTION 'Inga övningar kvar att flytta'; END IF;

  INSERT INTO public.session_schedule_overrides (owner_id, source_type, source_id, scheduled_date, confirmed_at)
  VALUES (_wp.athlete_id, 'planned', _new_id, _target_date, now())
  ON CONFLICT (source_type, source_id) DO UPDATE SET scheduled_date = EXCLUDED.scheduled_date;

  RETURN _new_id;
END $$;
REVOKE ALL ON FUNCTION public.split_planned_session(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.split_planned_session(uuid, date) TO authenticated;