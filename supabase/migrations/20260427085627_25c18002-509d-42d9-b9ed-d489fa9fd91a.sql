-- 1. Per-exercise default intensity metric (rpe vs rir)
DO $$ BEGIN
  CREATE TYPE intensity_metric AS ENUM ('rpe', 'rir');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS default_intensity_metric intensity_metric NOT NULL DEFAULT 'rpe';

-- 2. Planned exercise: store metric, target rir, lengthened partials, last set to failure
ALTER TABLE public.planned_exercises
  ADD COLUMN IF NOT EXISTS intensity_metric intensity_metric NOT NULL DEFAULT 'rpe',
  ADD COLUMN IF NOT EXISTS target_rir numeric,
  ADD COLUMN IF NOT EXISTS lengthened_partials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_set_to_failure boolean NOT NULL DEFAULT false;

-- 3. Training log: capture what was actually done
ALTER TABLE public.training_logs
  ADD COLUMN IF NOT EXISTS rir numeric,
  ADD COLUMN IF NOT EXISTS lengthened_partials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS to_failure boolean NOT NULL DEFAULT false;

-- 4. Hide 1RM baselines from the athlete: only coaches can SELECT.
-- The athlete will only see the kg prescribed in their planned_exercises (already computed by coach).
DROP POLICY IF EXISTS "Athlete can view own baselines" ON public.baselines;

-- 5. Seed sensible default metrics for known categories on existing global exercises.
-- Powerlifting/strength → RPE; bodybuilding accessory → RIR.
UPDATE public.exercises
SET default_intensity_metric = 'rir'
WHERE default_intensity_metric = 'rpe'
  AND (
    lower(coalesce(category, '')) IN (
      'accessory', 'arms', 'back accessory', 'shoulders', 'chest accessory',
      'biceps', 'triceps', 'isolation', 'hypertrophy', 'lateral', 'rear delt',
      'curl', 'extension', 'fly', 'raise', 'calves', 'core'
    )
    OR lower(name) ~ '(curl|fly|raise|extension|pushdown|pullover|lateral|shrug|kickback|crunch|calf|face pull|lat pulldown)'
  );