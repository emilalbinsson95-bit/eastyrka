DROP POLICY "Coach can view own mesocycles" ON public.mesocycles;
CREATE POLICY "Coach can view own mesocycles" ON public.mesocycles FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY "Coach can update own mesocycles" ON public.mesocycles;
CREATE POLICY "Coach can update own mesocycles" ON public.mesocycles FOR UPDATE TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY "Coach can delete own mesocycles" ON public.mesocycles;
CREATE POLICY "Coach can delete own mesocycles" ON public.mesocycles FOR DELETE TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));