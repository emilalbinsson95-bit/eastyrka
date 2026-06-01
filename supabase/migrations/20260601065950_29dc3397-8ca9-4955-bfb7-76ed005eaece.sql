ALTER TABLE public.endurance_steps
  ADD COLUMN IF NOT EXISTS target_pace_seconds_per_km integer,
  ADD COLUMN IF NOT EXISTS target_hr_bpm smallint;

-- Validation: pace 120..900 s/km (2:00..15:00), HR 40..230
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
  IF NEW.target_pace_seconds_per_km IS NOT NULL AND (NEW.target_pace_seconds_per_km < 120 OR NEW.target_pace_seconds_per_km > 900) THEN
    RAISE EXCEPTION 'target_pace_seconds_per_km must be 120..900 (2:00..15:00 / km)';
  END IF;
  IF NEW.target_hr_bpm IS NOT NULL AND (NEW.target_hr_bpm < 40 OR NEW.target_hr_bpm > 230) THEN
    RAISE EXCEPTION 'target_hr_bpm must be 40..230';
  END IF;
  RETURN NEW;
END;
$function$;
