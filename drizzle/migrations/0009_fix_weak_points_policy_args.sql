DROP POLICY IF EXISTS "Coach inserts athlete weak points" ON public.athlete_weak_points;
DROP POLICY IF EXISTS "Coach reads athlete weak points" ON public.athlete_weak_points;
DROP POLICY IF EXISTS "Coach updates athlete weak points" ON public.athlete_weak_points;
CREATE POLICY "Coach inserts athlete weak points" ON public.athlete_weak_points FOR INSERT TO authenticated WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach reads athlete weak points" ON public.athlete_weak_points FOR SELECT TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach updates athlete weak points" ON public.athlete_weak_points FOR UPDATE TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id)) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));