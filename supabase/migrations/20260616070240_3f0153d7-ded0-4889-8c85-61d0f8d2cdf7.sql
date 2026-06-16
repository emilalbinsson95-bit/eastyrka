
-- Rehab workout templates
CREATE TABLE public.rehab_plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physio_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehab_plan_templates TO authenticated;
GRANT ALL ON public.rehab_plan_templates TO service_role;
ALTER TABLE public.rehab_plan_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "physio owns templates" ON public.rehab_plan_templates FOR ALL
  USING (physio_id = auth.uid()) WITH CHECK (physio_id = auth.uid());
CREATE TRIGGER rpt_updated_at BEFORE UPDATE ON public.rehab_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.rehab_plan_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.rehab_plan_templates(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  sets INT,
  reps INT,
  hold_seconds INT,
  load_kg NUMERIC,
  band_id UUID REFERENCES public.resistance_bands(id) ON DELETE SET NULL,
  band_label TEXT,
  band_min_kg NUMERIC,
  band_max_kg NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehab_plan_template_exercises TO authenticated;
GRANT ALL ON public.rehab_plan_template_exercises TO service_role;
ALTER TABLE public.rehab_plan_template_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "physio owns template exercises" ON public.rehab_plan_template_exercises FOR ALL
  USING (EXISTS (SELECT 1 FROM public.rehab_plan_templates t WHERE t.id = template_id AND t.physio_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rehab_plan_templates t WHERE t.id = template_id AND t.physio_id = auth.uid()));

-- Multi-week rehab plans
CREATE TABLE public.rehab_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physio_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  weeks INT NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehab_plans TO authenticated;
GRANT ALL ON public.rehab_plans TO service_role;
ALTER TABLE public.rehab_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "physio manages plans" ON public.rehab_plans FOR ALL
  USING (physio_id = auth.uid()) WITH CHECK (physio_id = auth.uid() AND public.is_physio_of(auth.uid(), patient_id));
CREATE POLICY "patient views plans" ON public.rehab_plans FOR SELECT
  USING (patient_id = auth.uid());
CREATE TRIGGER rp_updated_at BEFORE UPDATE ON public.rehab_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.rehab_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.rehab_plans(id) ON DELETE CASCADE,
  week_index INT NOT NULL,
  day_of_week INT NOT NULL,
  title TEXT,
  template_id UUID REFERENCES public.rehab_plan_templates(id) ON DELETE SET NULL,
  materialized_session_id UUID REFERENCES public.rehab_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, week_index, day_of_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehab_plan_sessions TO authenticated;
GRANT ALL ON public.rehab_plan_sessions TO service_role;
ALTER TABLE public.rehab_plan_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "physio manages plan sessions" ON public.rehab_plan_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.rehab_plans p WHERE p.id = plan_id AND p.physio_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rehab_plans p WHERE p.id = plan_id AND p.physio_id = auth.uid()));
CREATE POLICY "patient views plan sessions" ON public.rehab_plan_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rehab_plans p WHERE p.id = plan_id AND p.patient_id = auth.uid()));
