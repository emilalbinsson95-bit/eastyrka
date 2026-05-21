-- History table for endurance personal bests (currently 10k PB)
CREATE TABLE public.endurance_pb_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  ten_k_pb_seconds integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  note text
);

CREATE INDEX endurance_pb_history_athlete_idx
  ON public.endurance_pb_history (athlete_id, recorded_at DESC);

ALTER TABLE public.endurance_pb_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athlete views own pb history"
  ON public.endurance_pb_history FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

CREATE POLICY "Coach views athlete pb history"
  ON public.endurance_pb_history FOR SELECT TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "Athlete inserts own pb history"
  ON public.endurance_pb_history FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Coach inserts athlete pb history"
  ON public.endurance_pb_history FOR INSERT TO authenticated
  WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));

CREATE POLICY "Athlete deletes own pb history"
  ON public.endurance_pb_history FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

-- Trigger to auto-record 10k PB changes from profile updates
CREATE OR REPLACE FUNCTION public.log_ten_k_pb_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ten_k_pb_seconds IS NOT NULL
     AND NEW.ten_k_pb_seconds IS DISTINCT FROM OLD.ten_k_pb_seconds
  THEN
    INSERT INTO public.endurance_pb_history (athlete_id, ten_k_pb_seconds, recorded_by)
    VALUES (NEW.id, NEW.ten_k_pb_seconds, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_log_ten_k_pb_change
AFTER UPDATE OF ten_k_pb_seconds ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_ten_k_pb_change();