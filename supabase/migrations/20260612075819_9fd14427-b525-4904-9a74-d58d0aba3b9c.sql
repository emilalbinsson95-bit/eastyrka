
-- 1. resistance_bands
CREATE TABLE public.resistance_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  color text NOT NULL,
  label text NOT NULL,
  min_kg numeric NOT NULL CHECK (min_kg >= 0),
  max_kg numeric NOT NULL CHECK (max_kg >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_kg >= min_kg)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resistance_bands TO authenticated;
GRANT ALL ON public.resistance_bands TO service_role;

ALTER TABLE public.resistance_bands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bands readable by authenticated"
  ON public.resistance_bands FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coaches and physios can insert bands"
  ON public.resistance_bands FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'physio'))
  );

CREATE POLICY "Owners can update bands"
  ON public.resistance_bands FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can delete bands"
  ON public.resistance_bands FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER resistance_bands_set_updated_at
  BEFORE UPDATE ON public.resistance_bands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.resistance_bands (color, label, min_kg, max_kg, sort_order) VALUES
  ('#FACC15', 'Yellow',  2,  5, 1),
  ('#22C55E', 'Green',   4, 10, 2),
  ('#3B82F6', 'Blue',    7, 18, 3),
  ('#EF4444', 'Red',     5, 15, 4),
  ('#111827', 'Black',  10, 25, 5),
  ('#9CA3AF', 'Silver', 15, 35, 6);

-- 2. rehab_exercises band columns
ALTER TABLE public.rehab_exercises
  ADD COLUMN band_id uuid REFERENCES public.resistance_bands(id) ON DELETE SET NULL,
  ADD COLUMN band_min_kg numeric,
  ADD COLUMN band_max_kg numeric;

-- 3. function_tests
CREATE TABLE public.function_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_type text NOT NULL,
  value_numeric numeric NOT NULL,
  unit text NOT NULL,
  side text NOT NULL DEFAULT 'na' CHECK (side IN ('left','right','bilateral','na')),
  tested_at date NOT NULL DEFAULT (now()::date),
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX function_tests_patient_idx ON public.function_tests (patient_id, tested_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.function_tests TO authenticated;
GRANT ALL ON public.function_tests TO service_role;

ALTER TABLE public.function_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Function tests viewable by patient or physio"
  ON public.function_tests FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.is_physio_of(auth.uid(), patient_id));

CREATE POLICY "Physio can insert function tests"
  ON public.function_tests FOR INSERT TO authenticated
  WITH CHECK (public.is_physio_of(auth.uid(), patient_id) AND recorded_by = auth.uid());

CREATE POLICY "Physio can update function tests"
  ON public.function_tests FOR UPDATE TO authenticated
  USING (public.is_physio_of(auth.uid(), patient_id))
  WITH CHECK (public.is_physio_of(auth.uid(), patient_id));

CREATE POLICY "Physio can delete function tests"
  ON public.function_tests FOR DELETE TO authenticated
  USING (public.is_physio_of(auth.uid(), patient_id));

CREATE TRIGGER function_tests_set_updated_at
  BEFORE UPDATE ON public.function_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. patient_checkins
CREATE TABLE public.patient_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT (now()::date),
  stiffness smallint NOT NULL CHECK (stiffness BETWEEN 0 AND 10),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, date)
);

CREATE INDEX patient_checkins_patient_idx ON public.patient_checkins (patient_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_checkins TO authenticated;
GRANT ALL ON public.patient_checkins TO service_role;

ALTER TABLE public.patient_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can read own checkins"
  ON public.patient_checkins FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.is_physio_of(auth.uid(), patient_id));

CREATE POLICY "Patient can insert own checkins"
  ON public.patient_checkins FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patient can update own checkins"
  ON public.patient_checkins FOR UPDATE TO authenticated
  USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patient can delete own checkins"
  ON public.patient_checkins FOR DELETE TO authenticated
  USING (patient_id = auth.uid());

CREATE TRIGGER patient_checkins_set_updated_at
  BEFORE UPDATE ON public.patient_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
