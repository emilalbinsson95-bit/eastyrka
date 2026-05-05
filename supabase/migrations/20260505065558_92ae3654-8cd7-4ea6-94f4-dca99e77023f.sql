-- Track athlete edits to logged sets so the coach can spot adjustments

ALTER TABLE public.training_logs
  ADD COLUMN IF NOT EXISTS edited_by_athlete_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_reps smallint,
  ADD COLUMN IF NOT EXISTS original_rpe numeric;

CREATE OR REPLACE FUNCTION public.mark_training_log_athlete_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only stamp when the athlete themselves changes reps/rpe after creation.
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

DROP TRIGGER IF EXISTS trg_mark_training_log_athlete_edit ON public.training_logs;
CREATE TRIGGER trg_mark_training_log_athlete_edit
BEFORE UPDATE ON public.training_logs
FOR EACH ROW
EXECUTE FUNCTION public.mark_training_log_athlete_edit();
