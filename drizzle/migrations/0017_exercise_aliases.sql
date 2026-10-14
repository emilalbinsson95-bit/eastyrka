CREATE TABLE public.exercise_aliases (
  alias text PRIMARY KEY,
  canonical text NOT NULL
);
COMMENT ON COLUMN public.exercise_aliases.canonical IS 'Canonical exercise name, or __competition_deadlift__ to resolve from the athlete deadlift_style.';
GRANT SELECT ON public.exercise_aliases TO authenticated;
GRANT ALL ON public.exercise_aliases TO service_role;
ALTER TABLE public.exercise_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read aliases" ON public.exercise_aliases FOR SELECT TO authenticated USING (true);

INSERT INTO public.exercise_aliases(alias, canonical) VALUES
 ('back squat','Squat'),('competition squat','Squat'),('comp squat','Squat'),('knäböj','Squat'),('böj','Squat'),
 ('bench','Bench Press'),('competition bench','Bench Press'),('comp bench','Bench Press'),('competition bench press','Bench Press'),('bänk','Bench Press'),('bänkpress','Bench Press'),
 ('deadlift','Conventional Deadlift'),('conventional','Conventional Deadlift'),('conventional deadlift','Conventional Deadlift'),('smal mark','Conventional Deadlift'),('marklyft','Conventional Deadlift'),
 ('sumo','Sumo Deadlift'),('sumo deadlift','Sumo Deadlift'),('sumomark','Sumo Deadlift'),
 ('competition deadlift','__competition_deadlift__'),('comp deadlift','__competition_deadlift__'),('tävlingsmark','__competition_deadlift__'),
 ('bulgarian split squat (db)','Bulgarian Split Squat'),('tricep extensions','Overhead Tricep Extension');

CREATE OR REPLACE FUNCTION public.canonicalize_exercise_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _canonical text;
  _trimmed text;
  _athlete uuid;
  _style text;
BEGIN
  _trimmed := btrim(regexp_replace(NEW.exercise, '\s+', ' ', 'g'));
  IF _trimmed IS NULL OR _trimmed = '' THEN RETURN NEW; END IF;

  SELECT canonical INTO _canonical FROM public.exercise_aliases WHERE alias = lower(_trimmed);

  IF _canonical = '__competition_deadlift__' THEN
    IF TG_TABLE_NAME IN ('training_logs','baselines') THEN
      _athlete := NEW.athlete_id;
    ELSIF TG_TABLE_NAME = 'planned_exercises' THEN
      SELECT wp.athlete_id INTO _athlete FROM public.planned_sessions ps
        JOIN public.week_plans wp ON wp.id = ps.week_plan_id WHERE ps.id = NEW.planned_session_id;
    END IF;
    IF _athlete IS NOT NULL THEN
      SELECT deadlift_style INTO _style FROM public.athlete_strength_volume_profiles WHERE athlete_id = _athlete;
    END IF;
    _canonical := CASE WHEN _style = 'sumo' THEN 'Sumo Deadlift' ELSE 'Conventional Deadlift' END;
  END IF;

  IF _canonical IS NOT NULL THEN
    _trimmed := _canonical;
    _canonical := NULL;
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

-- Backfill: re-run canonicalization on rows that use an alias.
UPDATE public.baselines SET exercise = exercise WHERE lower(btrim(exercise)) IN (SELECT alias FROM public.exercise_aliases);
UPDATE public.training_logs SET exercise = exercise WHERE lower(btrim(exercise)) IN (SELECT alias FROM public.exercise_aliases);
UPDATE public.planned_exercises SET exercise = exercise WHERE lower(btrim(exercise)) IN (SELECT alias FROM public.exercise_aliases);
UPDATE public.plan_template_exercises SET exercise = exercise WHERE lower(btrim(exercise)) IN (SELECT alias FROM public.exercise_aliases);

UPDATE public.baselines b SET exercise_id = e.id FROM public.exercises e
 WHERE e.name = b.exercise AND e.is_global AND b.exercise_id IS DISTINCT FROM e.id AND b.exercise_id IS NOT NULL;
UPDATE public.planned_exercises b SET exercise_id = e.id FROM public.exercises e
 WHERE e.name = b.exercise AND e.is_global AND b.exercise_id IS DISTINCT FROM e.id AND b.exercise_id IS NOT NULL;
UPDATE public.plan_template_exercises b SET exercise_id = e.id FROM public.exercises e
 WHERE e.name = b.exercise AND e.is_global AND b.exercise_id IS DISTINCT FROM e.id AND b.exercise_id IS NOT NULL;