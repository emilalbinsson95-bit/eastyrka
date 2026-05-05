CREATE OR REPLACE FUNCTION public.mark_training_log_athlete_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = NEW.athlete_id
     AND (NEW.reps IS DISTINCT FROM OLD.reps OR NEW.rpe IS DISTINCT FROM OLD.rpe)
  THEN
    NEW.edited_by_athlete_at := now();
    IF NEW.original_reps IS NULL THEN
      NEW.original_reps := OLD.reps;
    END IF;
    IF NEW.original_rpe IS NULL THEN
      NEW.original_rpe := OLD.rpe;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
