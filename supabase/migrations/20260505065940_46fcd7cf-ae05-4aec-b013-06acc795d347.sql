ALTER TABLE public.readiness_surveys
  ADD COLUMN IF NOT EXISTS sleep_quality smallint,
  ADD COLUMN IF NOT EXISTS nutrition smallint,
  ADD COLUMN IF NOT EXISTS stiffness smallint;

CREATE OR REPLACE FUNCTION public.validate_readiness_survey()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.work_stress < 1 OR NEW.work_stress > 10 THEN
    RAISE EXCEPTION 'work_stress must be between 1 and 10';
  END IF;
  IF NEW.life_stress < 1 OR NEW.life_stress > 10 THEN
    RAISE EXCEPTION 'life_stress must be between 1 and 10';
  END IF;
  IF NEW.fatigue < 1 OR NEW.fatigue > 10 THEN
    RAISE EXCEPTION 'fatigue must be between 1 and 10';
  END IF;
  IF NEW.daily_form < 1 OR NEW.daily_form > 10 THEN
    RAISE EXCEPTION 'daily_form must be between 1 and 10';
  END IF;
  IF NEW.bodyweight_kg IS NOT NULL AND (NEW.bodyweight_kg < 20 OR NEW.bodyweight_kg > 400) THEN
    RAISE EXCEPTION 'bodyweight_kg out of plausible range';
  END IF;
  IF NEW.sleep_quality IS NOT NULL AND (NEW.sleep_quality < 1 OR NEW.sleep_quality > 10) THEN
    RAISE EXCEPTION 'sleep_quality must be between 1 and 10';
  END IF;
  IF NEW.nutrition IS NOT NULL AND (NEW.nutrition < 1 OR NEW.nutrition > 10) THEN
    RAISE EXCEPTION 'nutrition must be between 1 and 10';
  END IF;
  IF NEW.stiffness IS NOT NULL AND (NEW.stiffness < 1 OR NEW.stiffness > 10) THEN
    RAISE EXCEPTION 'stiffness must be between 1 and 10';
  END IF;
  RETURN NEW;
END;
$function$;