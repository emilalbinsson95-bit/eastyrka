
-- 1. Add status column with safe default for existing rows
ALTER TABLE public.coach_athletes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('pending','accepted','rejected'));

ALTER TABLE public.physio_patients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('pending','accepted','rejected'));

-- 2. New links default to pending; only self-links may be auto-accepted
ALTER TABLE public.coach_athletes ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.physio_patients ALTER COLUMN status SET DEFAULT 'pending';

-- 3. Tighten INSERT policies: coaches/physios may only create pending links,
--    except a self-link (which may be inserted as accepted by the trigger / user).
DROP POLICY IF EXISTS "Coaches can create links to themselves" ON public.coach_athletes;
CREATE POLICY "Coaches can create links to themselves"
  ON public.coach_athletes FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    AND has_role(auth.uid(), 'coach'::public.app_role)
    AND (
      athlete_id = auth.uid()          -- self-link, any status
      OR status = 'pending'            -- linking another athlete requires consent
    )
  );

DROP POLICY IF EXISTS "Physios create their own links" ON public.physio_patients;
CREATE POLICY "Physios create their own links"
  ON public.physio_patients FOR INSERT TO authenticated
  WITH CHECK (
    physio_id = auth.uid()
    AND has_role(auth.uid(), 'physio'::public.app_role)
    AND (
      patient_id = auth.uid()
      OR status = 'pending'
    )
  );

-- 4. Athletes / patients may accept, reject, or delete links targeting them
CREATE POLICY "Athletes manage status of their links"
  ON public.coach_athletes FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid() AND status IN ('accepted','rejected','pending'));

CREATE POLICY "Athletes can remove their links"
  ON public.coach_athletes FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Patients manage status of their links"
  ON public.physio_patients FOR UPDATE TO authenticated
  USING (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid() AND status IN ('accepted','rejected','pending'));

CREATE POLICY "Patients can remove their links"
  ON public.physio_patients FOR DELETE TO authenticated
  USING (patient_id = auth.uid());

-- 5. Gate dependent data access on accepted status by tightening helper fns.
CREATE OR REPLACE FUNCTION public.is_coach_of(_coach_id uuid, _athlete_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_athletes
    WHERE coach_id = _coach_id
      AND athlete_id = _athlete_id
      AND status = 'accepted'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_physio_of(_physio_id uuid, _patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.physio_patients
    WHERE physio_id = _physio_id
      AND patient_id = _patient_id
      AND status = 'accepted'
  )
$$;

-- 6. Coach/Physio side SELECT only sees accepted links (so dashboards don't leak pending PII beyond names already chosen by the requester)
DROP POLICY IF EXISTS "Coaches can view their links" ON public.coach_athletes;
CREATE POLICY "Coaches can view their links"
  ON public.coach_athletes FOR SELECT TO authenticated
  USING (coach_id = auth.uid() AND status = 'accepted');

DROP POLICY IF EXISTS "Physios view their links" ON public.physio_patients;
CREATE POLICY "Physios view their links"
  ON public.physio_patients FOR SELECT TO authenticated
  USING (physio_id = auth.uid() AND status = 'accepted');
