ALTER TABLE public.athlete_strength_volume_profiles
  ADD COLUMN IF NOT EXISTS volume_tolerance text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS weekly_set_cap smallint;
ALTER TABLE public.athlete_strength_volume_profiles
  ADD CONSTRAINT athlete_svp_tolerance_chk CHECK (volume_tolerance IN ('low','normal','high'));