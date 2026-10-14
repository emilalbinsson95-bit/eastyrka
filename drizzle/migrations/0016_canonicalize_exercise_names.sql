-- Canonicalize exercise names on write: any exercise name saved to training_logs,
-- baselines, planned_exercises or plan_template_exercises is matched case-insensitively
-- against the exercises library. If a match exists, the canonical library name is stored.
-- If no match exists, the name is added to the library so it becomes fixed going forward.

CREATE OR REPLACE FUNCTION public.canonicalize_exercise_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _canonical text;
  _trimmed text;
BEGIN
  _trimmed := btrim(NEW.exercise);
  IF _trimmed IS NULL OR _trimmed = '' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _canonical
  FROM public.exercises
  WHERE lower(name) = lower(_trimmed)
  ORDER BY is_global DESC, created_at ASC
  LIMIT 1;

  IF _canonical IS NULL THEN
    INSERT INTO public.exercises (name, is_global, created_by)
    VALUES (_trimmed, true, NULL)
    ON CONFLICT DO NOTHING
    RETURNING name INTO _canonical;
    IF _canonical IS NULL THEN
      SELECT name INTO _canonical
      FROM public.exercises
      WHERE lower(name) = lower(_trimmed)
      LIMIT 1;
    END IF;
  END IF;

  NEW.exercise := COALESCE(_canonical, _trimmed);
  RETURN NEW;
END;
$$;

CREATE TRIGGER canonicalize_exercise_name_training_logs
  BEFORE INSERT OR UPDATE OF exercise ON public.training_logs
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_exercise_name();

CREATE TRIGGER canonicalize_exercise_name_baselines
  BEFORE INSERT OR UPDATE OF exercise ON public.baselines
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_exercise_name();

CREATE TRIGGER canonicalize_exercise_name_planned_exercises
  BEFORE INSERT OR UPDATE OF exercise ON public.planned_exercises
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_exercise_name();

CREATE TRIGGER canonicalize_exercise_name_plan_template_exercises
  BEFORE INSERT OR UPDATE OF exercise ON public.plan_template_exercises
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_exercise_name();