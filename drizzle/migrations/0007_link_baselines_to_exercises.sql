ALTER TABLE public.baselines ADD COLUMN exercise_id uuid REFERENCES public.exercises(id);

UPDATE public.baselines b
SET exercise_id = e.id
FROM public.exercises e
WHERE lower(b.exercise) = lower(e.name)
  AND b.exercise_id IS NULL;

CREATE INDEX baselines_exercise_id_idx ON public.baselines(exercise_id);

COMMENT ON COLUMN public.baselines.exercise IS 'Display name, kept in sync with exercises.name; exercise_id is the canonical link.';