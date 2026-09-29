CREATE TABLE public.athlete_strength_volume_profiles (
  athlete_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  squat_factor numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (squat_factor BETWEEN 0.60 AND 1.40),
  bench_factor numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (bench_factor BETWEEN 0.60 AND 1.40),
  deadlift_factor numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (deadlift_factor BETWEEN 0.60 AND 1.40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.athlete_strength_volume_profiles TO authenticated;
GRANT ALL ON public.athlete_strength_volume_profiles TO service_role;
ALTER TABLE public.athlete_strength_volume_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete or accepted coach reads strength volume profile" ON public.athlete_strength_volume_profiles FOR SELECT TO authenticated USING (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Athlete or accepted coach creates strength volume profile" ON public.athlete_strength_volume_profiles FOR INSERT TO authenticated WITH CHECK (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Athlete or accepted coach updates strength volume profile" ON public.athlete_strength_volume_profiles FOR UPDATE TO authenticated USING (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id)) WITH CHECK (athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), athlete_id));