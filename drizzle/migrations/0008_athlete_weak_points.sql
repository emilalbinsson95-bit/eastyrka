CREATE TABLE public.athlete_weak_points (
  athlete_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weak_points text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.athlete_weak_points TO authenticated;
GRANT ALL ON public.athlete_weak_points TO service_role;
ALTER TABLE public.athlete_weak_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete reads own weak points" ON public.athlete_weak_points
  FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY "Coach reads athlete weak points" ON public.athlete_weak_points
  FOR SELECT TO authenticated USING (public.is_coach_of(athlete_id, auth.uid()));
CREATE POLICY "Coach inserts athlete weak points" ON public.athlete_weak_points
  FOR INSERT TO authenticated WITH CHECK (public.is_coach_of(athlete_id, auth.uid()));
CREATE POLICY "Coach updates athlete weak points" ON public.athlete_weak_points
  FOR UPDATE TO authenticated USING (public.is_coach_of(athlete_id, auth.uid()))
  WITH CHECK (public.is_coach_of(athlete_id, auth.uid()));