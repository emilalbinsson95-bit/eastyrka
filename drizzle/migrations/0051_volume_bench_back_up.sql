ALTER TABLE public.mesocycles ADD COLUMN IF NOT EXISTS template_id text;

CREATE OR REPLACE FUNCTION public.volume_bench_back_up(_mesocycle uuid, _steps integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record; s record; wk record;
  ids uuid[] := '{}'; dates date[] := '{}'; logged boolean[] := '{}';
  n integer; f integer; i integer; back integer; gap_other boolean;
  last_date date; cand date; off integer; zero boolean; new_id uuid; cols text;
BEGIN
  SELECT * INTO m FROM public.mesocycles WHERE id = _mesocycle;
  IF m.id IS NULL OR m.template_id IS DISTINCT FROM 'volume-bench' THEN RAISE EXCEPTION 'Blocket är inte ett volymblock för bänk'; END IF;
  IF NOT public.is_coach_of(auth.uid(), m.athlete_id) THEN RAISE EXCEPTION 'Endast atletens coach kan backa pass'; END IF;
  IF _steps < 1 OR _steps > 3 THEN RAISE EXCEPTION 'Ogiltigt antal pass'; END IF;

  FOR s IN
    SELECT ps.id,
      wp.week_start_date + (CASE WHEN EXISTS (SELECT 1 FROM public.planned_sessions x WHERE x.week_plan_id = wp.id AND x.day_of_week = 0) THEN ps.day_of_week ELSE ps.day_of_week - 1 END) AS d,
      EXISTS (SELECT 1 FROM public.training_logs tl JOIN public.planned_exercises pe ON pe.id = tl.planned_exercise_id WHERE pe.planned_session_id = ps.id) AS lg
    FROM public.planned_sessions ps JOIN public.week_plans wp ON wp.id = ps.week_plan_id
    WHERE wp.mesocycle_id = _mesocycle
    ORDER BY 2, ps.id
  LOOP
    ids := ids || s.id; dates := dates || s.d; logged := logged || s.lg;
  END LOOP;
  n := coalesce(array_length(ids, 1), 0);
  f := NULL;
  FOR i IN 1..n LOOP IF NOT logged[i] THEN f := i; EXIT; END IF; END LOOP;
  IF f IS NULL OR f <= 1 THEN RAISE EXCEPTION 'Det finns inga genomförda pass att backa till'; END IF;
  FOR i IN f..n LOOP IF logged[i] THEN RAISE EXCEPTION 'Det finns loggade pass efter nästa öppna pass. Backa passen för hand.'; END IF; END LOOP;
  back := least(_steps, f - 1);

  -- Every-other-day blocks step two days; 3-per-week blocks skip weekends.
  gap_other := true;
  FOR i IN 2..n LOOP IF dates[i] - dates[i - 1] <> 2 THEN gap_other := false; END IF; END LOOP;
  last_date := dates[n];
  FOR i IN 1..back LOOP
    cand := last_date + 2;
    IF NOT gap_other AND extract(isodow FROM cand) IN (6, 7) THEN cand := cand + (8 - extract(isodow FROM cand))::int; END IF;
    SELECT * INTO wk FROM public.week_plans WHERE mesocycle_id = _mesocycle AND week_start_date <= cand AND cand < week_start_date + 7 ORDER BY week_index LIMIT 1;
    IF wk.id IS NULL THEN
      INSERT INTO public.week_plans (coach_id, athlete_id, mesocycle_id, week_index, week_start_date, status, is_deload, training_phase, notes)
      SELECT coach_id, athlete_id, mesocycle_id, coalesce(week_index, 0) + 1, week_start_date + 7, status, false, 'working', notes
      FROM public.week_plans WHERE mesocycle_id = _mesocycle ORDER BY week_start_date DESC LIMIT 1
      RETURNING * INTO wk;
      UPDATE public.mesocycles SET total_weeks = total_weeks + 1, updated_at = now() WHERE id = _mesocycle;
    END IF;
    off := cand - wk.week_start_date;
    zero := EXISTS (SELECT 1 FROM public.planned_sessions WHERE week_plan_id = wk.id AND day_of_week = 0);
    IF NOT zero AND off = 0 THEN
      UPDATE public.planned_sessions SET day_of_week = day_of_week - 1 WHERE week_plan_id = wk.id;
      zero := true;
    END IF;
    IF NOT zero AND off = 6 THEN RAISE EXCEPTION 'Passet kan inte placeras på söndag i den veckan'; END IF;
    INSERT INTO public.planned_sessions (week_plan_id, day_of_week, title, notes, generator_version, rules_version)
    VALUES (wk.id, CASE WHEN zero THEN off ELSE off + 1 END, NULL, NULL, 'volume-bench-backup', NULL)
    RETURNING id INTO new_id;
    ids := ids || new_id; last_date := cand;
  END LOOP;

  -- Move open sessions later, keeping their order.
  FOR i IN REVERSE n..f LOOP
    UPDATE public.planned_exercises SET planned_session_id = ids[i + back] WHERE planned_session_id = ids[i];
    UPDATE public.planned_sessions t SET title = o.title, notes = o.notes FROM public.planned_sessions o WHERE t.id = ids[i + back] AND o.id = ids[i];
  END LOOP;

  -- Repeat the last completed sessions in the freed slots (copies; logs stay on the originals).
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'planned_exercises'
    AND column_name NOT IN ('id', 'planned_session_id', 'created_at', 'updated_at') AND is_generated = 'NEVER';
  FOR i IN 0..back - 1 LOOP
    EXECUTE format('INSERT INTO public.planned_exercises (planned_session_id,%s) SELECT $1,%s FROM public.planned_exercises WHERE planned_session_id = $2', cols, cols)
      USING ids[f + i], ids[f - back + i];
    UPDATE public.planned_sessions t SET title = coalesce(o.title, 'Pass') || ' (upprepas)', notes = o.notes FROM public.planned_sessions o WHERE t.id = ids[f + i] AND o.id = ids[f - back + i];
  END LOOP;
  RETURN back;
END;
$$;

REVOKE ALL ON FUNCTION public.volume_bench_back_up(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.volume_bench_back_up(uuid, integer) TO authenticated;