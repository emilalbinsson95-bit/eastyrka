ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS scoring_sex text CHECK (scoring_sex IN ('male','female'));
CREATE TABLE public.rehab_chart_preferences (
 patient_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 injured_side text CHECK (injured_side IN ('left','right')),
 pain_limit numeric CHECK (pain_limit BETWEEN 0 AND 10),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rehab_chart_preferences TO authenticated;
GRANT ALL ON public.rehab_chart_preferences TO service_role;
ALTER TABLE public.rehab_chart_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY rehab_chart_read ON public.rehab_chart_preferences FOR SELECT TO authenticated USING (auth.uid() = patient_id OR public.is_physio_of(auth.uid(),patient_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY rehab_chart_insert ON public.rehab_chart_preferences FOR INSERT TO authenticated WITH CHECK ((public.is_physio_of(auth.uid(),patient_id) OR public.has_role(auth.uid(),'admin')) AND updated_by = auth.uid());
CREATE POLICY rehab_chart_update ON public.rehab_chart_preferences FOR UPDATE TO authenticated USING (public.is_physio_of(auth.uid(),patient_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK ((public.is_physio_of(auth.uid(),patient_id) OR public.has_role(auth.uid(),'admin')) AND updated_by = auth.uid());
CREATE TABLE public.taper_followups (
 mesocycle_id uuid PRIMARY KEY REFERENCES public.mesocycles(id) ON DELETE CASCADE,
 athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 competition_date date NOT NULL,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 frozen_baselines jsonb,
 frozen_at date,
 openers jsonb NOT NULL DEFAULT '{}'::jsonb,
 attempts jsonb NOT NULL DEFAULT '{}'::jsonb,
 flags jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(settings)='object'),
 CHECK (frozen_baselines IS NULL OR jsonb_typeof(frozen_baselines)='object'),
 CHECK (jsonb_typeof(openers)='object'),
 CHECK (jsonb_typeof(attempts)='object'),
 CHECK (jsonb_typeof(flags)='array'),
 CHECK (frozen_at IS NULL OR frozen_baselines IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE ON public.taper_followups TO authenticated;
GRANT ALL ON public.taper_followups TO service_role;
ALTER TABLE public.taper_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY taper_followup_read ON public.taper_followups FOR SELECT TO authenticated USING (auth.uid()=athlete_id OR public.is_coach_of(auth.uid(),athlete_id));
CREATE POLICY taper_followup_insert ON public.taper_followups FOR INSERT TO authenticated WITH CHECK (public.is_coach_of(auth.uid(),athlete_id) AND updated_by=auth.uid() AND EXISTS (SELECT 1 FROM public.mesocycles m WHERE m.id=mesocycle_id AND m.athlete_id=taper_followups.athlete_id));
CREATE POLICY taper_followup_update ON public.taper_followups FOR UPDATE TO authenticated USING (public.is_coach_of(auth.uid(),athlete_id)) WITH CHECK (public.is_coach_of(auth.uid(),athlete_id) AND updated_by=auth.uid() AND EXISTS (SELECT 1 FROM public.mesocycles m WHERE m.id=mesocycle_id AND m.athlete_id=taper_followups.athlete_id));
CREATE FUNCTION public.guard_taper_followup_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.frozen_at IS NOT NULL AND (NEW.frozen_at IS DISTINCT FROM OLD.frozen_at OR NEW.frozen_baselines IS DISTINCT FROM OLD.frozen_baselines OR NEW.competition_date IS DISTINCT FROM OLD.competition_date OR NEW.athlete_id IS DISTINCT FROM OLD.athlete_id OR NEW.mesocycle_id IS DISTINCT FROM OLD.mesocycle_id) THEN RAISE EXCEPTION 'Fryst toppningsreferens får inte skrivas om'; END IF;
 IF NEW.frozen_at IS NOT NULL AND NEW.frozen_at <> NEW.competition_date - 21 THEN RAISE EXCEPTION 'Referensdatum måste vara D-21'; END IF;
 IF NEW.frozen_at IS NOT NULL AND CURRENT_DATE < NEW.frozen_at THEN RAISE EXCEPTION 'Referensen kan inte frysas före D-21'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_taper_followup_snapshot BEFORE INSERT OR UPDATE ON public.taper_followups FOR EACH ROW EXECUTE FUNCTION public.guard_taper_followup_snapshot();