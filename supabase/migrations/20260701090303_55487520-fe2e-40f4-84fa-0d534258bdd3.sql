
CREATE TYPE public.unavailability_reason AS ENUM ('sick', 'injured', 'other');

CREATE TABLE public.athlete_unavailability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason public.unavailability_reason NOT NULL DEFAULT 'sick',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX athlete_unavailability_athlete_id_idx ON public.athlete_unavailability (athlete_id, start_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_unavailability TO authenticated;
GRANT ALL ON public.athlete_unavailability TO service_role;

ALTER TABLE public.athlete_unavailability ENABLE ROW LEVEL SECURITY;

-- Athlete manages own
CREATE POLICY "Athlete views own unavailability"
  ON public.athlete_unavailability FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
CREATE POLICY "Athlete inserts own unavailability"
  ON public.athlete_unavailability FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete updates own unavailability"
  ON public.athlete_unavailability FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid()) WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete deletes own unavailability"
  ON public.athlete_unavailability FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

-- Coach can manage for their linked athletes
CREATE POLICY "Coach views athlete unavailability"
  ON public.athlete_unavailability FOR SELECT TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach inserts athlete unavailability"
  ON public.athlete_unavailability FOR INSERT TO authenticated
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach updates athlete unavailability"
  ON public.athlete_unavailability FOR UPDATE TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id))
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach deletes athlete unavailability"
  ON public.athlete_unavailability FOR DELETE TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

CREATE TRIGGER athlete_unavailability_set_updated_at
  BEFORE UPDATE ON public.athlete_unavailability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
