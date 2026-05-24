-- 1. Clean up existing orphan overrides
DELETE FROM public.session_schedule_overrides o
WHERE o.source_type = 'planned'
  AND NOT EXISTS (SELECT 1 FROM public.planned_sessions ps WHERE ps.id = o.source_id);

DELETE FROM public.session_schedule_overrides o
WHERE o.source_type = 'endurance'
  AND NOT EXISTS (SELECT 1 FROM public.endurance_sessions es WHERE es.id = o.source_id);

DELETE FROM public.session_schedule_overrides o
WHERE o.source_type = 'rehab'
  AND NOT EXISTS (SELECT 1 FROM public.rehab_sessions rs WHERE rs.id = o.source_id);

-- 2. Trigger to auto-purge overrides when source rows are deleted.
CREATE OR REPLACE FUNCTION public.purge_schedule_overrides_for_planned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.session_schedule_overrides
   WHERE source_type = 'planned' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_schedule_overrides_for_endurance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.session_schedule_overrides
   WHERE source_type = 'endurance' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_schedule_overrides_for_rehab()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.session_schedule_overrides
   WHERE source_type = 'rehab' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS planned_sessions_purge_overrides ON public.planned_sessions;
CREATE TRIGGER planned_sessions_purge_overrides
BEFORE DELETE ON public.planned_sessions
FOR EACH ROW EXECUTE FUNCTION public.purge_schedule_overrides_for_planned();

DROP TRIGGER IF EXISTS endurance_sessions_purge_overrides ON public.endurance_sessions;
CREATE TRIGGER endurance_sessions_purge_overrides
BEFORE DELETE ON public.endurance_sessions
FOR EACH ROW EXECUTE FUNCTION public.purge_schedule_overrides_for_endurance();

DROP TRIGGER IF EXISTS rehab_sessions_purge_overrides ON public.rehab_sessions;
CREATE TRIGGER rehab_sessions_purge_overrides
BEFORE DELETE ON public.rehab_sessions
FOR EACH ROW EXECUTE FUNCTION public.purge_schedule_overrides_for_rehab();