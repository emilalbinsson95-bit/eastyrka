-- History table for tracking 1RM progress over time
CREATE TABLE public.baseline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  exercise text NOT NULL,
  one_rm_kg numeric NOT NULL,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX baseline_history_athlete_exercise_idx
  ON public.baseline_history (athlete_id, exercise, recorded_at DESC);

ALTER TABLE public.baseline_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can view athlete baseline history"
  ON public.baseline_history FOR SELECT
  TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "Coach can insert athlete baseline history"
  ON public.baseline_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "Coach can delete athlete baseline history"
  ON public.baseline_history FOR DELETE
  TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

-- Trigger to automatically log every baseline change
CREATE OR REPLACE FUNCTION public.log_baseline_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.one_rm_kg = OLD.one_rm_kg THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.baseline_history (athlete_id, exercise, one_rm_kg, recorded_by)
  VALUES (NEW.athlete_id, NEW.exercise, NEW.one_rm_kg, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS baselines_log_change ON public.baselines;
CREATE TRIGGER baselines_log_change
AFTER INSERT OR UPDATE OF one_rm_kg ON public.baselines
FOR EACH ROW EXECUTE FUNCTION public.log_baseline_change();

-- Backfill history with the current values so charts have a starting point
INSERT INTO public.baseline_history (athlete_id, exercise, one_rm_kg, recorded_at)
SELECT athlete_id, exercise, one_rm_kg, COALESCE(updated_at, created_at, now())
FROM public.baselines
WHERE NOT EXISTS (
  SELECT 1 FROM public.baseline_history h
  WHERE h.athlete_id = public.baselines.athlete_id
    AND h.exercise = public.baselines.exercise
);