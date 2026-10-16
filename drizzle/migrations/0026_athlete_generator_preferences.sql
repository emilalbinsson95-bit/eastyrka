CREATE TABLE public.athlete_generator_preferences (
 athlete_id uuid PRIMARY KEY,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.athlete_generator_preferences TO authenticated;
GRANT ALL ON public.athlete_generator_preferences TO service_role;
ALTER TABLE public.athlete_generator_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete and coach read generator preferences" ON public.athlete_generator_preferences FOR SELECT TO authenticated USING (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach creates generator preferences" ON public.athlete_generator_preferences FOR INSERT TO authenticated WITH CHECK (updated_by = auth.uid() AND public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach updates generator preferences" ON public.athlete_generator_preferences FOR UPDATE TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id)) WITH CHECK (updated_by = auth.uid() AND public.is_coach_of(auth.uid(), athlete_id));