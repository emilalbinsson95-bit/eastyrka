-- Daily readiness/wellness survey gating today's workout
CREATE TABLE public.readiness_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL,
  date DATE NOT NULL,
  bodyweight_kg NUMERIC,
  work_stress SMALLINT NOT NULL,
  life_stress SMALLINT NOT NULL,
  fatigue SMALLINT NOT NULL,
  sleep_hours NUMERIC,
  notes TEXT,
  daily_form SMALLINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, date)
);

-- Validation trigger (1-10 ranges)
CREATE OR REPLACE FUNCTION public.validate_readiness_survey()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.work_stress < 1 OR NEW.work_stress > 10 THEN
    RAISE EXCEPTION 'work_stress must be between 1 and 10';
  END IF;
  IF NEW.life_stress < 1 OR NEW.life_stress > 10 THEN
    RAISE EXCEPTION 'life_stress must be between 1 and 10';
  END IF;
  IF NEW.fatigue < 1 OR NEW.fatigue > 10 THEN
    RAISE EXCEPTION 'fatigue must be between 1 and 10';
  END IF;
  IF NEW.daily_form < 1 OR NEW.daily_form > 10 THEN
    RAISE EXCEPTION 'daily_form must be between 1 and 10';
  END IF;
  IF NEW.bodyweight_kg IS NOT NULL AND (NEW.bodyweight_kg < 20 OR NEW.bodyweight_kg > 400) THEN
    RAISE EXCEPTION 'bodyweight_kg out of plausible range';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_readiness_survey_trigger
BEFORE INSERT OR UPDATE ON public.readiness_surveys
FOR EACH ROW EXECUTE FUNCTION public.validate_readiness_survey();

CREATE TRIGGER set_readiness_surveys_updated_at
BEFORE UPDATE ON public.readiness_surveys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.readiness_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athlete can view own readiness"
  ON public.readiness_surveys FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Athlete can insert own readiness"
  ON public.readiness_surveys FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Athlete can update own readiness"
  ON public.readiness_surveys FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Athlete can delete own readiness"
  ON public.readiness_surveys FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Coach can view athlete readiness"
  ON public.readiness_surveys FOR SELECT TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

CREATE INDEX idx_readiness_surveys_athlete_date ON public.readiness_surveys (athlete_id, date DESC);