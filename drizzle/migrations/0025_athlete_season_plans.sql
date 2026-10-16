CREATE TABLE public.athlete_season_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Säsongsplan',
  competition_date date,
  notes text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  generator_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_season_plans_blocks_array CHECK (jsonb_typeof(blocks) = 'array'),
  CONSTRAINT athlete_season_plans_settings_object CHECK (jsonb_typeof(generator_settings) = 'object'),
  CONSTRAINT athlete_season_plans_name_len CHECK (char_length(name) BETWEEN 1 AND 100)
);
CREATE INDEX athlete_season_plans_athlete_idx ON public.athlete_season_plans (athlete_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_season_plans TO authenticated;
GRANT ALL ON public.athlete_season_plans TO service_role;
ALTER TABLE public.athlete_season_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete and coach read season plans" ON public.athlete_season_plans FOR SELECT TO authenticated USING (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach creates season plans" ON public.athlete_season_plans FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid() AND public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach updates season plans" ON public.athlete_season_plans FOR UPDATE TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id)) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach deletes season plans" ON public.athlete_season_plans FOR DELETE TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id));