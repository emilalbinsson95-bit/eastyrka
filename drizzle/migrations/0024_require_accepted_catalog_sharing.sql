ALTER POLICY "View global, own, coach or admin exercises" ON public.exercises
USING (
  is_global = true
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.coach_athletes ca
    WHERE ca.coach_id = exercises.created_by
      AND ca.athlete_id = auth.uid() AND ca.status = 'accepted'
  )
  OR EXISTS (SELECT 1 FROM public.planned_exercises pe WHERE pe.exercise_id = exercises.id)
  OR EXISTS (SELECT 1 FROM public.baselines b WHERE b.exercise_id = exercises.id)
  OR EXISTS (SELECT 1 FROM public.plan_template_exercises te WHERE te.exercise_id = exercises.id)
);

ALTER POLICY "View default, own, physio or admin bands" ON public.resistance_bands
USING (
  created_by IS NULL
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_physio_of(created_by, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.coach_athletes ca
    WHERE ca.coach_id = resistance_bands.created_by
      AND ca.athlete_id = auth.uid() AND ca.status = 'accepted'
  )
  OR EXISTS (SELECT 1 FROM public.rehab_exercises re WHERE re.band_id = resistance_bands.id)
  OR EXISTS (SELECT 1 FROM public.rehab_plan_template_exercises rte WHERE rte.band_id = resistance_bands.id)
);