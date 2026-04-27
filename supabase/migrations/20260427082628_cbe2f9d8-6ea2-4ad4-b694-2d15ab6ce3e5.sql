-- 1. Exercise library (shared, with coach-added customs)
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  is_global boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, created_by)
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the shared library
CREATE POLICY "Authenticated can view exercises"
  ON public.exercises FOR SELECT TO authenticated
  USING (true);

-- Only coaches can add new exercises (and must mark themselves as creator)
CREATE POLICY "Coaches can insert exercises"
  ON public.exercises FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Coaches can update own exercises"
  ON public.exercises FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Coaches can delete own exercises"
  ON public.exercises FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND is_global = false);

CREATE TRIGGER trg_exercises_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed global exercises
INSERT INTO public.exercises (name, description, category, is_global) VALUES
  ('Squat', 'Back squat — barbell on upper traps, descend to depth, drive up.', 'Squat', true),
  ('Bench Press', 'Flat barbell bench press — touch chest, press to lockout.', 'Bench', true),
  ('Deadlift', 'Conventional deadlift — barbell from floor to lockout.', 'Deadlift', true),
  ('Overhead Press', 'Standing barbell press from front rack to overhead.', 'Press', true),
  ('Front Squat', 'Barbell on front rack, upright torso, descend to depth.', 'Squat', true),
  ('Romanian Deadlift', 'Hip-hinge with slight knee bend, barbell to mid-shin.', 'Deadlift', true),
  ('Pause Bench', 'Bench press with 1–3s pause on chest before pressing.', 'Bench', true);

-- 2. Mesocycles (coach planning container)
CREATE TYPE public.cycle_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE public.mesocycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  name text NOT NULL,
  goal text,
  start_date date NOT NULL,
  total_weeks smallint NOT NULL CHECK (total_weeks BETWEEN 1 AND 24),
  status cycle_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mesocycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can view own mesocycles"
  ON public.mesocycles FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY "Athlete can view own mesocycles"
  ON public.mesocycles FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Coach can create mesocycles for athletes"
  ON public.mesocycles FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "Coach can update own mesocycles"
  ON public.mesocycles FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can delete own mesocycles"
  ON public.mesocycles FOR DELETE TO authenticated
  USING (coach_id = auth.uid());

CREATE TRIGGER trg_mesocycles_updated_at
  BEFORE UPDATE ON public.mesocycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Extend week_plans to act as microcycles within a mesocycle
ALTER TABLE public.week_plans
  ADD COLUMN mesocycle_id uuid REFERENCES public.mesocycles(id) ON DELETE CASCADE,
  ADD COLUMN week_index smallint;

CREATE INDEX idx_week_plans_mesocycle ON public.week_plans(mesocycle_id);

-- 4. Add exercise_id to planned_exercises and plan_template_exercises
ALTER TABLE public.planned_exercises
  ADD COLUMN exercise_id uuid REFERENCES public.exercises(id) ON DELETE RESTRICT;

ALTER TABLE public.plan_template_exercises
  ADD COLUMN exercise_id uuid REFERENCES public.exercises(id) ON DELETE RESTRICT;

CREATE INDEX idx_planned_exercises_exercise ON public.planned_exercises(exercise_id);
CREATE INDEX idx_template_exercises_exercise ON public.plan_template_exercises(exercise_id);
