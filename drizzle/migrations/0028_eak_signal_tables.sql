CREATE TABLE public.eak_meso_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lift TEXT NOT NULL CHECK (lift IN ('squat','bench','deadlift')),
  window_start DATE,
  window_end DATE,
  n_sessions INT NOT NULL DEFAULT 0,
  l_m DOUBLE PRECISION,
  dl_m DOUBLE PRECISION,
  eak_m DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  te_i DOUBLE PRECISION,
  threshold_i DOUBLE PRECISION,
  readiness_signal BOOLEAN NOT NULL DEFAULT false,
  athlete_signal BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('insufficient_data','green','yellow','red','red_strong','push')),
  suggestion_text TEXT,
  coach_decision TEXT NOT NULL DEFAULT 'pending' CHECK (coach_decision IN ('pending','approved','rejected','modified')),
  coach_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.eak_meso_evaluations TO authenticated;
GRANT ALL ON public.eak_meso_evaluations TO service_role;
ALTER TABLE public.eak_meso_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete reads own eak evaluations" ON public.eak_meso_evaluations FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY "Coach manages own athletes' eak evaluations" ON public.eak_meso_evaluations FOR ALL TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.baseline_history ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual_correction' CHECK (source IN ('competition','training_max','push_signal','manual_correction'));

CREATE TABLE public.rebound_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lift TEXT NOT NULL CHECK (lift IN ('squat','bench','deadlift')),
  deload_week_start DATE NOT NULL,
  r_value DOUBLE PRECISION,
  passed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.rebound_tests TO authenticated;
GRANT ALL ON public.rebound_tests TO service_role;
ALTER TABLE public.rebound_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athlete reads own rebound tests" ON public.rebound_tests FOR SELECT TO authenticated USING (athlete_id = auth.uid());
CREATE POLICY "Coach manages own athletes' rebound tests" ON public.rebound_tests FOR ALL TO authenticated USING (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_coach_of(auth.uid(), athlete_id) OR public.has_role(auth.uid(), 'admin'));