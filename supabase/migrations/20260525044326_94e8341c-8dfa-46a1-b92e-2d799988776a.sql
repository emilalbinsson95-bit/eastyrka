
-- 1. Widen overall_rpe / peak_rpe to numeric so 0.5 increments are preserved
ALTER TABLE public.endurance_sessions
  ALTER COLUMN overall_rpe TYPE numeric(3,1) USING overall_rpe::numeric,
  ALTER COLUMN peak_rpe TYPE numeric(3,1) USING peak_rpe::numeric;

-- (validation function already allows 1..10 numerics, no change needed)

-- 2. Per-rep actuals table
CREATE TABLE public.endurance_step_reps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id uuid NOT NULL REFERENCES public.endurance_steps(id) ON DELETE CASCADE,
  rep_index smallint NOT NULL,
  actual_duration_seconds integer,
  actual_distance_m integer,
  actual_avg_hr smallint,
  actual_avg_rpe numeric(3,1),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (step_id, rep_index)
);

CREATE INDEX idx_endurance_step_reps_step ON public.endurance_step_reps(step_id);

ALTER TABLE public.endurance_step_reps ENABLE ROW LEVEL SECURITY;

-- Reuse the same "session visibility / editability" pattern as endurance_steps.
CREATE POLICY "View reps if session visible"
  ON public.endurance_step_reps FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.endurance_steps st
    JOIN public.endurance_sessions s ON s.id = st.session_id
    WHERE st.id = endurance_step_reps.step_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))
  ));

CREATE POLICY "Manage reps if session editable (insert)"
  ON public.endurance_step_reps FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.endurance_steps st
    JOIN public.endurance_sessions s ON s.id = st.session_id
    WHERE st.id = endurance_step_reps.step_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))
  ));

CREATE POLICY "Manage reps if session editable (update)"
  ON public.endurance_step_reps FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.endurance_steps st
    JOIN public.endurance_sessions s ON s.id = st.session_id
    WHERE st.id = endurance_step_reps.step_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.endurance_steps st
    JOIN public.endurance_sessions s ON s.id = st.session_id
    WHERE st.id = endurance_step_reps.step_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))
  ));

CREATE POLICY "Manage reps if session editable (delete)"
  ON public.endurance_step_reps FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.endurance_steps st
    JOIN public.endurance_sessions s ON s.id = st.session_id
    WHERE st.id = endurance_step_reps.step_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))
  ));

-- Validation trigger (ranges)
CREATE OR REPLACE FUNCTION public.validate_endurance_step_rep()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.rep_index < 1 OR NEW.rep_index > 99 THEN
    RAISE EXCEPTION 'rep_index must be 1..99';
  END IF;
  IF NEW.actual_avg_rpe IS NOT NULL AND (NEW.actual_avg_rpe < 1 OR NEW.actual_avg_rpe > 10) THEN
    RAISE EXCEPTION 'actual_avg_rpe must be 1..10';
  END IF;
  IF NEW.actual_avg_hr IS NOT NULL AND (NEW.actual_avg_hr < 40 OR NEW.actual_avg_hr > 230) THEN
    RAISE EXCEPTION 'actual_avg_hr must be 40..230';
  END IF;
  IF NEW.actual_duration_seconds IS NOT NULL AND (NEW.actual_duration_seconds < 0 OR NEW.actual_duration_seconds > 86400) THEN
    RAISE EXCEPTION 'actual_duration_seconds must be 0..86400';
  END IF;
  IF NEW.actual_distance_m IS NOT NULL AND (NEW.actual_distance_m < 0 OR NEW.actual_distance_m > 200000) THEN
    RAISE EXCEPTION 'actual_distance_m must be 0..200000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_endurance_step_rep() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_endurance_step_rep
BEFORE INSERT OR UPDATE ON public.endurance_step_reps
FOR EACH ROW EXECUTE FUNCTION public.validate_endurance_step_rep();

CREATE TRIGGER trg_endurance_step_reps_updated_at
BEFORE UPDATE ON public.endurance_step_reps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
