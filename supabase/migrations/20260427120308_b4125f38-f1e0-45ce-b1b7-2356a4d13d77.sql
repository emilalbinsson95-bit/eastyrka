CREATE POLICY "Users can self-grant patient role"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK ((user_id = auth.uid()) AND (role = 'patient'::public.app_role));

CREATE POLICY "Users can drop their own patient role"
ON public.user_roles FOR DELETE TO authenticated
USING ((user_id = auth.uid()) AND (role = 'patient'::public.app_role));

CREATE TABLE public.physio_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physio_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (physio_id, patient_id)
);
ALTER TABLE public.physio_patients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_physio_of(_physio_id uuid, _patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.physio_patients
    WHERE physio_id = _physio_id AND patient_id = _patient_id
  )
$$;

CREATE POLICY "Physios view their links" ON public.physio_patients
FOR SELECT TO authenticated USING (physio_id = auth.uid());
CREATE POLICY "Patients view their links" ON public.physio_patients
FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY "Physios create their own links" ON public.physio_patients
FOR INSERT TO authenticated
WITH CHECK ((physio_id = auth.uid()) AND public.has_role(auth.uid(), 'physio'::public.app_role));
CREATE POLICY "Physios delete their own links" ON public.physio_patients
FOR DELETE TO authenticated USING (physio_id = auth.uid());

CREATE POLICY "Physios can view their patients' profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_physio_of(auth.uid(), id));

CREATE TABLE public.rehab_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physio_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  title text,
  subjective_notes text,
  objective_notes text,
  overall_pain smallint,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rehab_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rehab_sessions_patient_date ON public.rehab_sessions (patient_id, session_date DESC);

CREATE POLICY "Rehab session select" ON public.rehab_sessions
FOR SELECT TO authenticated USING (physio_id = auth.uid() OR patient_id = auth.uid());
CREATE POLICY "Rehab session insert" ON public.rehab_sessions
FOR INSERT TO authenticated
WITH CHECK (physio_id = auth.uid() AND public.is_physio_of(auth.uid(), patient_id));
CREATE POLICY "Rehab session update" ON public.rehab_sessions
FOR UPDATE TO authenticated USING (physio_id = auth.uid()) WITH CHECK (physio_id = auth.uid());
CREATE POLICY "Rehab session delete" ON public.rehab_sessions
FOR DELETE TO authenticated USING (physio_id = auth.uid());

CREATE TRIGGER trg_rehab_sessions_updated_at
BEFORE UPDATE ON public.rehab_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.rehab_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.rehab_sessions(id) ON DELETE CASCADE,
  order_index smallint NOT NULL DEFAULT 0,
  name text NOT NULL,
  sets smallint,
  reps smallint,
  hold_seconds smallint,
  load_kg numeric,
  resistance_band text,
  pain_rating smallint,
  perceived_exertion smallint,
  rom_notes text,
  tolerance text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rehab_exercises ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rehab_exercises_session ON public.rehab_exercises (session_id, order_index);

CREATE POLICY "Rehab ex select" ON public.rehab_exercises
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.rehab_sessions s
  WHERE s.id = rehab_exercises.session_id
    AND (s.physio_id = auth.uid() OR s.patient_id = auth.uid())
));
CREATE POLICY "Rehab ex insert" ON public.rehab_exercises
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.rehab_sessions s
  WHERE s.id = rehab_exercises.session_id AND s.physio_id = auth.uid()
));
CREATE POLICY "Rehab ex update" ON public.rehab_exercises
FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.rehab_sessions s
  WHERE s.id = rehab_exercises.session_id AND s.physio_id = auth.uid()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.rehab_sessions s
  WHERE s.id = rehab_exercises.session_id AND s.physio_id = auth.uid()
));
CREATE POLICY "Rehab ex delete" ON public.rehab_exercises
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.rehab_sessions s
  WHERE s.id = rehab_exercises.session_id AND s.physio_id = auth.uid()
));

CREATE TABLE public.patient_session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.rehab_sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  pain_after smallint,
  stiffness smallint,
  swelling smallint,
  sleep_quality smallint,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, patient_id)
);
ALTER TABLE public.patient_session_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feedback select participants" ON public.patient_session_feedback
FOR SELECT TO authenticated USING (
  patient_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.rehab_sessions s
    WHERE s.id = patient_session_feedback.session_id AND s.physio_id = auth.uid()
  )
);
CREATE POLICY "Feedback patient insert" ON public.patient_session_feedback
FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Feedback patient update" ON public.patient_session_feedback
FOR UPDATE TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Feedback patient delete" ON public.patient_session_feedback
FOR DELETE TO authenticated USING (patient_id = auth.uid());

CREATE TRIGGER trg_patient_feedback_updated_at
BEFORE UPDATE ON public.patient_session_feedback
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_rehab_exercise_ranges()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pain_rating IS NOT NULL AND (NEW.pain_rating < 0 OR NEW.pain_rating > 10) THEN
    RAISE EXCEPTION 'pain_rating must be 0..10';
  END IF;
  IF NEW.perceived_exertion IS NOT NULL AND (NEW.perceived_exertion < 0 OR NEW.perceived_exertion > 10) THEN
    RAISE EXCEPTION 'perceived_exertion must be 0..10';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_rehab_exercise_validate
BEFORE INSERT OR UPDATE ON public.rehab_exercises
FOR EACH ROW EXECUTE FUNCTION public.validate_rehab_exercise_ranges();

CREATE OR REPLACE FUNCTION public.validate_rehab_session_ranges()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.overall_pain IS NOT NULL AND (NEW.overall_pain < 0 OR NEW.overall_pain > 10) THEN
    RAISE EXCEPTION 'overall_pain must be 0..10';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_rehab_session_validate
BEFORE INSERT OR UPDATE ON public.rehab_sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_rehab_session_ranges();

CREATE OR REPLACE FUNCTION public.validate_patient_feedback_ranges()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pain_after IS NOT NULL AND (NEW.pain_after < 0 OR NEW.pain_after > 10) THEN
    RAISE EXCEPTION 'pain_after must be 0..10';
  END IF;
  IF NEW.stiffness IS NOT NULL AND (NEW.stiffness < 0 OR NEW.stiffness > 10) THEN
    RAISE EXCEPTION 'stiffness must be 0..10';
  END IF;
  IF NEW.swelling IS NOT NULL AND (NEW.swelling < 0 OR NEW.swelling > 10) THEN
    RAISE EXCEPTION 'swelling must be 0..10';
  END IF;
  IF NEW.sleep_quality IS NOT NULL AND (NEW.sleep_quality < 0 OR NEW.sleep_quality > 10) THEN
    RAISE EXCEPTION 'sleep_quality must be 0..10';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_patient_feedback_validate
BEFORE INSERT OR UPDATE ON public.patient_session_feedback
FOR EACH ROW EXECUTE FUNCTION public.validate_patient_feedback_ranges();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  requested_role text;
  assigned_role public.app_role;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'athlete'));

  if requested_role = 'coach' then
    assigned_role := 'coach'::public.app_role;
  elsif requested_role = 'physio' then
    assigned_role := 'physio'::public.app_role;
  elsif requested_role = 'patient' then
    assigned_role := 'patient'::public.app_role;
  else
    assigned_role := 'athlete'::public.app_role;
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;