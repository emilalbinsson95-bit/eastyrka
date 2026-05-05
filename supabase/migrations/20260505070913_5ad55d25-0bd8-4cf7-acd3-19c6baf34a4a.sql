CREATE TYPE public.endurance_discipline AS ENUM ('run','bike','swim','other');
CREATE TYPE public.endurance_mode AS ENUM ('quick','structured');

CREATE TABLE public.endurance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  coach_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  discipline public.endurance_discipline NOT NULL DEFAULT 'run',
  mode public.endurance_mode NOT NULL DEFAULT 'quick',
  title text,
  planned_total_seconds integer,
  planned_avg_rpe numeric,
  actual_total_seconds integer,
  peak_rpe smallint,
  overall_rpe smallint,
  notes text,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.endurance_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.endurance_sessions(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.endurance_steps(id) ON DELETE CASCADE,
  order_index smallint NOT NULL DEFAULT 0,
  is_group boolean NOT NULL DEFAULT false,
  repeat_count smallint NOT NULL DEFAULT 1,
  discipline public.endurance_discipline,
  duration_seconds integer,
  target_rpe numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_endurance_sessions_athlete_date ON public.endurance_sessions(athlete_id, date DESC);
CREATE INDEX idx_endurance_steps_session ON public.endurance_steps(session_id, order_index);

CREATE TRIGGER trg_endurance_sessions_updated_at
  BEFORE UPDATE ON public.endurance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation
CREATE OR REPLACE FUNCTION public.validate_endurance_session()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.peak_rpe IS NOT NULL AND (NEW.peak_rpe < 1 OR NEW.peak_rpe > 10) THEN
    RAISE EXCEPTION 'peak_rpe must be 1..10';
  END IF;
  IF NEW.overall_rpe IS NOT NULL AND (NEW.overall_rpe < 1 OR NEW.overall_rpe > 10) THEN
    RAISE EXCEPTION 'overall_rpe must be 1..10';
  END IF;
  IF NEW.planned_avg_rpe IS NOT NULL AND (NEW.planned_avg_rpe < 1 OR NEW.planned_avg_rpe > 10) THEN
    RAISE EXCEPTION 'planned_avg_rpe must be 1..10';
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER trg_validate_endurance_session
  BEFORE INSERT OR UPDATE ON public.endurance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_endurance_session();

CREATE OR REPLACE FUNCTION public.validate_endurance_step()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.target_rpe IS NOT NULL AND (NEW.target_rpe < 1 OR NEW.target_rpe > 10) THEN
    RAISE EXCEPTION 'target_rpe must be 1..10';
  END IF;
  IF NEW.repeat_count < 1 OR NEW.repeat_count > 99 THEN
    RAISE EXCEPTION 'repeat_count must be 1..99';
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER trg_validate_endurance_step
  BEFORE INSERT OR UPDATE ON public.endurance_steps
  FOR EACH ROW EXECUTE FUNCTION public.validate_endurance_step();

-- RLS
ALTER TABLE public.endurance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endurance_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athlete views own endurance sessions"
  ON public.endurance_sessions FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
CREATE POLICY "Athlete inserts own endurance sessions"
  ON public.endurance_sessions FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete updates own endurance sessions"
  ON public.endurance_sessions FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid()) WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete deletes own endurance sessions"
  ON public.endurance_sessions FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Coach views athlete endurance sessions"
  ON public.endurance_sessions FOR SELECT TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach inserts athlete endurance sessions"
  ON public.endurance_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id) AND coach_id = auth.uid());
CREATE POLICY "Coach updates athlete endurance sessions"
  ON public.endurance_sessions FOR UPDATE TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id))
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY "Coach deletes athlete endurance sessions"
  ON public.endurance_sessions FOR DELETE TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "View endurance steps if session visible"
  ON public.endurance_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.endurance_sessions s
    WHERE s.id = endurance_steps.session_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))));
CREATE POLICY "Manage endurance steps if session editable (insert)"
  ON public.endurance_steps FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.endurance_sessions s
    WHERE s.id = endurance_steps.session_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))));
CREATE POLICY "Manage endurance steps if session editable (update)"
  ON public.endurance_steps FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.endurance_sessions s
    WHERE s.id = endurance_steps.session_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.endurance_sessions s
    WHERE s.id = endurance_steps.session_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))));
CREATE POLICY "Manage endurance steps if session editable (delete)"
  ON public.endurance_steps FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.endurance_sessions s
    WHERE s.id = endurance_steps.session_id
      AND (s.athlete_id = auth.uid() OR public.is_coach_of(auth.uid(), s.athlete_id))));