ALTER TABLE public.endurance_steps
  ADD COLUMN IF NOT EXISTS actual_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS actual_avg_hr smallint,
  ADD COLUMN IF NOT EXISTS actual_distance_m integer,
  ADD COLUMN IF NOT EXISTS actual_avg_rpe numeric(3,1);

CREATE OR REPLACE FUNCTION public.validate_endurance_step()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.target_rpe IS NOT NULL AND (NEW.target_rpe < 1 OR NEW.target_rpe > 10) THEN
    RAISE EXCEPTION 'target_rpe must be 1..10';
  END IF;
  IF NEW.repeat_count < 1 OR NEW.repeat_count > 99 THEN
    RAISE EXCEPTION 'repeat_count must be 1..99';
  END IF;
  IF NEW.actual_avg_rpe IS NOT NULL AND (NEW.actual_avg_rpe < 1 OR NEW.actual_avg_rpe > 10) THEN
    RAISE EXCEPTION 'actual_avg_rpe must be 1..10';
  END IF;
  IF NEW.actual_avg_hr IS NOT NULL AND (NEW.actual_avg_hr < 40 OR NEW.actual_avg_hr > 230) THEN
    RAISE EXCEPTION 'actual_avg_hr must be 40..230';
  END IF;
  IF NEW.actual_duration_seconds IS NOT NULL AND (NEW.actual_duration_seconds < 0 OR NEW.actual_duration_seconds > 86400) THEN
    RAISE EXCEPTION 'actual_duration_seconds must be 0..86400';
  END IF;
  IF NEW.actual_distance_m IS NOT NULL AND (NEW.actual_distance_m < 0 OR NEW.actual_distance_m > 200000) THEN
    RAISE EXCEPTION 'actual_distance_m must be 0..200000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_endurance_step_trg ON public.endurance_steps;
CREATE TRIGGER validate_endurance_step_trg
  BEFORE INSERT OR UPDATE ON public.endurance_steps
  FOR EACH ROW EXECUTE FUNCTION public.validate_endurance_step();