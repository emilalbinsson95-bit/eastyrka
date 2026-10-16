ALTER POLICY "View global, own, coach or admin exercises" ON public.exercises
USING (
  is_global = true
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_coach_of(created_by, auth.uid())
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
  OR public.is_coach_of(created_by, auth.uid())
  OR EXISTS (SELECT 1 FROM public.rehab_exercises re WHERE re.band_id = resistance_bands.id)
  OR EXISTS (SELECT 1 FROM public.rehab_plan_template_exercises rte WHERE rte.band_id = resistance_bands.id)
);

ALTER POLICY "Public can read coaching availability" ON public.coaching_availability
USING (id = true);

ALTER POLICY "Authenticated can read aliases" ON public.exercise_aliases
USING (
  canonical = '__competition_deadlift__'
  OR EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.name = exercise_aliases.canonical AND e.is_global = true
  )
);

COMMENT ON POLICY "Authenticated can read aliases" ON public.exercise_aliases IS
'Only shared canonical exercise aliases and the competition-deadlift style resolver are readable.';
COMMENT ON POLICY "Public can read coaching availability" ON public.coaching_availability IS
'Public read is intentionally limited to the published availability singleton; admin-only writes remain unchanged.';