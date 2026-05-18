
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ten_k_pb_seconds integer,
  ADD COLUMN IF NOT EXISTS max_hr smallint,
  ADD COLUMN IF NOT EXISTS resting_hr smallint,
  ADD COLUMN IF NOT EXISTS ftp_watts smallint,
  ADD COLUMN IF NOT EXISTS css_per_100m_seconds smallint;

-- Sanity bounds
CREATE OR REPLACE FUNCTION public.validate_endurance_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ten_k_pb_seconds IS NOT NULL AND (NEW.ten_k_pb_seconds < 1500 OR NEW.ten_k_pb_seconds > 14400) THEN
    RAISE EXCEPTION 'ten_k_pb_seconds must be 1500..14400 (25min..4h)';
  END IF;
  IF NEW.max_hr IS NOT NULL AND (NEW.max_hr < 120 OR NEW.max_hr > 230) THEN
    RAISE EXCEPTION 'max_hr must be 120..230';
  END IF;
  IF NEW.resting_hr IS NOT NULL AND (NEW.resting_hr < 30 OR NEW.resting_hr > 110) THEN
    RAISE EXCEPTION 'resting_hr must be 30..110';
  END IF;
  IF NEW.ftp_watts IS NOT NULL AND (NEW.ftp_watts < 50 OR NEW.ftp_watts > 600) THEN
    RAISE EXCEPTION 'ftp_watts must be 50..600';
  END IF;
  IF NEW.css_per_100m_seconds IS NOT NULL AND (NEW.css_per_100m_seconds < 60 OR NEW.css_per_100m_seconds > 240) THEN
    RAISE EXCEPTION 'css_per_100m_seconds must be 60..240 (1:00..4:00 / 100m)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_endurance_profile ON public.profiles;
CREATE TRIGGER trg_validate_endurance_profile
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_endurance_profile();
