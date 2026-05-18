ALTER TABLE public.endurance_sessions
  ADD COLUMN IF NOT EXISTS actual_distance_m integer;

CREATE OR REPLACE FUNCTION public.validate_endurance_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  IF NEW.predicted_10k_seconds IS NOT NULL AND (NEW.predicted_10k_seconds < 1500 OR NEW.predicted_10k_seconds > 14400) THEN
    RAISE EXCEPTION 'predicted_10k_seconds must be 1500..14400 (25min..4h)';
  END IF;
  IF NEW.actual_distance_m IS NOT NULL AND (NEW.actual_distance_m < 0 OR NEW.actual_distance_m > 500000) THEN
    RAISE EXCEPTION 'actual_distance_m must be 0..500000';
  END IF;
  RETURN NEW;
END;
$function$;