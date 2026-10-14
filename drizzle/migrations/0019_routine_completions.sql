CREATE TABLE public.routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  routine text NOT NULL CHECK (routine IN ('morning_long','morning_short','warmup')),
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX routine_completions_athlete_idx ON public.routine_completions(athlete_id);
GRANT SELECT, INSERT ON public.routine_completions TO authenticated;
GRANT ALL ON public.routine_completions TO service_role;
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own completions read" ON public.routine_completions FOR SELECT TO authenticated USING (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own completions insert" ON public.routine_completions FOR INSERT TO authenticated WITH CHECK (athlete_id = auth.uid());