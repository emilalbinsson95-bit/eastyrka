ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS builder_lift text CHECK (builder_lift IN ('squat','bench','deadlift')),
  ADD COLUMN IF NOT EXISTS builder_step_kg numeric(4,2) CHECK (builder_step_kg IS NULL OR (builder_step_kg > 0 AND builder_step_kg <= 20));
COMMENT ON COLUMN public.exercises.builder_lift IS 'Byggövning: which main lift this non-technical exercise builds (squat/bench/deadlift). NULL = not a build exercise.';
COMMENT ON COLUMN public.exercises.builder_step_kg IS 'Byggövning: weight step used by double progression (default 2.5 kg).';

ALTER TABLE public.planned_exercises
  ADD COLUMN IF NOT EXISTS builder_lift text CHECK (builder_lift IN ('squat','bench','deadlift')),
  ADD COLUMN IF NOT EXISTS target_reps_max smallint CHECK (target_reps_max IS NULL OR (target_reps_max BETWEEN 1 AND 50)),
  ADD COLUMN IF NOT EXISTS weight_step_kg numeric(4,2) CHECK (weight_step_kg IS NULL OR (weight_step_kg > 0 AND weight_step_kg <= 20));
COMMENT ON COLUMN public.planned_exercises.builder_lift IS 'Set on build-exercise rows; such rows never count toward main-lift sets, Mängd or EAk.';

-- Backfill: mark the shared default build exercises.
UPDATE public.exercises SET builder_lift='squat', builder_step_kg=5 WHERE is_global AND name IN ('Leg Press','Hack Squat');
UPDATE public.exercises SET builder_lift='squat', builder_step_kg=2.5 WHERE is_global AND name = 'Belt Squat';
UPDATE public.exercises SET builder_lift='bench', builder_step_kg=5 WHERE is_global AND name = 'Machine Chest Press';
UPDATE public.exercises SET builder_lift='bench', builder_step_kg=2.5 WHERE is_global AND name IN ('Dumbbell Bench Press','Dumbbell Incline Press');
UPDATE public.exercises SET builder_lift='deadlift', builder_step_kg=2.5 WHERE is_global AND name IN ('Back Extension','Hip Thrust','Lying Leg Curl');
INSERT INTO public.exercises (name, category, is_global, builder_lift, builder_step_kg)
SELECT 'Dips', 'Bench', true, 'bench', 2.5
WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE lower(name) = 'dips');