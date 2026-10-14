ALTER TABLE public.routine_completions DROP CONSTRAINT IF EXISTS routine_completions_routine_check;
ALTER TABLE public.routine_completions ADD CONSTRAINT routine_completions_routine_check CHECK (routine = ANY (ARRAY['morning_long','morning_short','warmup','skipped']));
CREATE OR REPLACE FUNCTION public.is_coach_of(_coach_id uuid, _athlete_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_athletes
    WHERE coach_id = _coach_id AND athlete_id = _athlete_id AND status = 'accepted'
  ) OR public.has_role(_coach_id, 'admin'::app_role)
$$;