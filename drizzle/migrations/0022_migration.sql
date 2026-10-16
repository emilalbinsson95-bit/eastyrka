DROP POLICY IF EXISTS "Authenticated can view exercises" ON public.exercises;
CREATE POLICY "View global, own, coach or admin exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (
    is_global = true
    OR created_by IS NULL
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_coach_of(created_by, auth.uid())
  );

DROP POLICY IF EXISTS "Bands readable by authenticated" ON public.resistance_bands;
CREATE POLICY "View default, own, physio or admin bands"
  ON public.resistance_bands FOR SELECT TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_physio_of(created_by, auth.uid())
  );