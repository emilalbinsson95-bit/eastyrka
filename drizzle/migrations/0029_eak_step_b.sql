CREATE TABLE public.athlete_eak_strategy (
  athlete_id uuid PRIMARY KEY,
  fall_stage1_pct numeric, fall_stage2_pct numeric, push_low_pct numeric, push_high_pct numeric,
  readiness_below_pct numeric, readiness_share numeric, meso_min_sessions numeric, meso_max_sessions numeric,
  in_session_drop_stop_pct numeric, in_session_drop_ok_pct numeric, noise_ratio_flag numeric, pool_mesocycles numeric,
  default_sem numeric, warmup_rpe_drift numeric, subjective_worse_days numeric, subjective_worse_points numeric,
  history_days numeric, push_session_below_pct numeric, push_share numeric,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_eak_strategy TO authenticated;
GRANT ALL ON public.athlete_eak_strategy TO service_role;
ALTER TABLE public.athlete_eak_strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete reads own eak strategy" ON public.athlete_eak_strategy FOR SELECT TO authenticated USING (auth.uid() = athlete_id);
CREATE POLICY "Coach manages eak strategy" ON public.athlete_eak_strategy FOR ALL TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.readiness_surveys ADD COLUMN IF NOT EXISTS soreness smallint CHECK (soreness BETWEEN 1 AND 10);
ALTER TABLE public.readiness_surveys ADD COLUMN IF NOT EXISTS motivation smallint CHECK (motivation BETWEEN 1 AND 10);

CREATE TABLE public.strength_session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  date date NOT NULL,
  session_rpe numeric CHECK (session_rpe BETWEEN 1 AND 10),
  duration_min integer CHECK (duration_min BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strength_session_feedback TO authenticated;
GRANT ALL ON public.strength_session_feedback TO service_role;
ALTER TABLE public.strength_session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete manages own session feedback" ON public.strength_session_feedback FOR ALL TO authenticated USING (auth.uid() = athlete_id) WITH CHECK (auth.uid() = athlete_id);
CREATE POLICY "Coach reads session feedback" ON public.strength_session_feedback FOR SELECT TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.athlete_warmup_loads (
  athlete_id uuid NOT NULL,
  lift text NOT NULL CHECK (lift IN ('squat','bench','deadlift')),
  load_kg numeric NOT NULL CHECK (load_kg > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, lift)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_warmup_loads TO authenticated;
GRANT ALL ON public.athlete_warmup_loads TO service_role;
ALTER TABLE public.athlete_warmup_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete manages own warmup loads" ON public.athlete_warmup_loads FOR ALL TO authenticated USING (auth.uid() = athlete_id) WITH CHECK (auth.uid() = athlete_id);
CREATE POLICY "Coach manages warmup loads" ON public.athlete_warmup_loads FOR ALL TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.training_logs ADD COLUMN IF NOT EXISTS is_warmup_reference boolean NOT NULL DEFAULT false;

ALTER TABLE public.eak_meso_evaluations DROP CONSTRAINT IF EXISTS eak_meso_evaluations_status_check;
ALTER TABLE public.eak_meso_evaluations ADD CONSTRAINT eak_meso_evaluations_status_check CHECK (status IN ('insufficient_data','green','yellow','red','red_strong','push','low_confidence'));
ALTER TABLE public.eak_meso_evaluations
  ADD COLUMN IF NOT EXISTS strategy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS sem_pool double precision,
  ADD COLUMN IF NOT EXISTS sem_current double precision,
  ADD COLUMN IF NOT EXISTS noise_ratio double precision,
  ADD COLUMN IF NOT EXISTS supporting_signals jsonb,
  ADD COLUMN IF NOT EXISTS nfor_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_changed boolean,
  ADD COLUMN IF NOT EXISTS outcome_dl_next double precision,
  ADD COLUMN IF NOT EXISTS outcome_status_next text;