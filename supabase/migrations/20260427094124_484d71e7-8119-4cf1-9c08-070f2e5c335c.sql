ALTER TABLE public.mesocycles
  ADD COLUMN IF NOT EXISTS days_per_week smallint NOT NULL DEFAULT 4;

ALTER TABLE public.mesocycles
  DROP CONSTRAINT IF EXISTS mesocycles_days_per_week_check;

ALTER TABLE public.mesocycles
  ADD CONSTRAINT mesocycles_days_per_week_check
  CHECK (days_per_week BETWEEN 2 AND 6);