CREATE OR REPLACE FUNCTION public.canonicalize_exercise_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _canonical text;
  _trimmed text;
  _athlete uuid;
  _style text;
  _variation text;
BEGIN
  _trimmed := btrim(regexp_replace(NEW.exercise, '\s+', ' ', 'g'));
  IF _trimmed IS NULL OR _trimmed = '' THEN RETURN NEW; END IF;
  _variation := to_jsonb(NEW)->>'variation';

  SELECT canonical INTO _canonical FROM public.exercise_aliases WHERE alias = lower(_trimmed);

  IF _canonical = '__competition_deadlift__' THEN
    IF _variation ~* 'sumo' THEN
      _style := 'sumo';
    ELSIF _variation ~* 'conventional' THEN
      _style := 'conventional';
    ELSE
      IF TG_TABLE_NAME IN ('training_logs','baselines') THEN
        _athlete := NEW.athlete_id;
      ELSIF TG_TABLE_NAME = 'planned_exercises' THEN
        SELECT wp.athlete_id INTO _athlete FROM public.planned_sessions ps
          JOIN public.week_plans wp ON wp.id = ps.week_plan_id WHERE ps.id = NEW.planned_session_id;
      END IF;
      IF _athlete IS NOT NULL THEN
        SELECT deadlift_style INTO _style FROM public.athlete_strength_volume_profiles WHERE athlete_id = _athlete;
      END IF;
    END IF;
    _canonical := CASE WHEN _style = 'sumo' THEN 'Sumo Deadlift' ELSE 'Conventional Deadlift' END;
  END IF;

  IF _canonical IS NOT NULL THEN
    _trimmed := _canonical;
    _canonical := NULL;
  END IF;

  -- Drop stance notes that just repeat the exercise name.
  IF TG_TABLE_NAME <> 'baselines' AND _variation IS NOT NULL THEN
    IF (_trimmed = 'Sumo Deadlift' AND _variation ~* '^\s*sumo stance\s*$')
       OR (_trimmed = 'Conventional Deadlift' AND _variation ~* '^\s*conventional stance\s*$') THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('variation', NULL));
    END IF;
  END IF;

  SELECT name INTO _canonical FROM public.exercises
  WHERE lower(name) = lower(_trimmed) ORDER BY is_global DESC, created_at ASC LIMIT 1;

  IF _canonical IS NULL THEN
    INSERT INTO public.exercises (name, is_global, created_by) VALUES (_trimmed, true, NULL)
    ON CONFLICT DO NOTHING RETURNING name INTO _canonical;
    IF _canonical IS NULL THEN
      SELECT name INTO _canonical FROM public.exercises WHERE lower(name) = lower(_trimmed) LIMIT 1;
    END IF;
  END IF;

  NEW.exercise := COALESCE(_canonical, _trimmed);
  RETURN NEW;
END;
$function$;