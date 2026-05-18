
CREATE TABLE public.session_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('planned','endurance','rehab')),
  source_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX idx_sso_owner_date ON public.session_schedule_overrides (owner_id, scheduled_date);

ALTER TABLE public.session_schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full select" ON public.session_schedule_overrides
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner insert" ON public.session_schedule_overrides
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner update" ON public.session_schedule_overrides
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner delete" ON public.session_schedule_overrides
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Coach select athlete overrides" ON public.session_schedule_overrides
  FOR SELECT TO authenticated USING (public.is_coach_of(auth.uid(), owner_id));
CREATE POLICY "Physio select patient overrides" ON public.session_schedule_overrides
  FOR SELECT TO authenticated USING (public.is_physio_of(auth.uid(), owner_id));

CREATE TRIGGER trg_sso_updated_at
  BEFORE UPDATE ON public.session_schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
