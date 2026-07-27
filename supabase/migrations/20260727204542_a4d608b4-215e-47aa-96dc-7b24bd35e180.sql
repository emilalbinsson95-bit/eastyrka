ALTER TABLE public.week_plans DROP CONSTRAINT IF EXISTS week_plans_athlete_id_week_start_date_key;
CREATE INDEX IF NOT EXISTS week_plans_athlete_week_idx ON public.week_plans (athlete_id, week_start_date);
CREATE UNIQUE INDEX IF NOT EXISTS week_plans_meso_week_uidx ON public.week_plans (mesocycle_id, week_index) WHERE mesocycle_id IS NOT NULL;