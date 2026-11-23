CREATE OR REPLACE FUNCTION public.push_lift_for_baseline(_exercise text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(btrim(_exercise))
    WHEN 'squat' THEN 'squat' WHEN 'back squat' THEN 'squat' WHEN 'competition squat' THEN 'squat' WHEN 'knäböj' THEN 'squat'
    WHEN 'bench press' THEN 'bench' WHEN 'bench' THEN 'bench' WHEN 'competition bench press' THEN 'bench' WHEN 'bänkpress' THEN 'bench'
    WHEN 'conventional deadlift' THEN 'conventional' WHEN 'deadlift' THEN 'conventional' WHEN 'marklyft' THEN 'conventional'
    WHEN 'sumo deadlift' THEN 'sumo' WHEN 'sumo marklyft' THEN 'sumo' WHEN 'sumomarklyft' THEN 'sumo'
    ELSE NULL END
$$;

-- Coach baseline edits carry over to the push calculation max (one direction only:
-- push never writes baselines). Service-role/automatic writes (auth.uid() NULL) and
-- non-coach writes are ignored so only coach decisions move push loads.
CREATE OR REPLACE FUNCTION public.sync_push_plan_from_baseline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lift text;
BEGIN
  IF NEW.one_rm_kg IS NULL OR NEW.one_rm_kg <= 0 OR NEW.one_rm_kg > 1000 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.one_rm_kg IS NOT DISTINCT FROM NEW.one_rm_kg AND OLD.exercise IS NOT DISTINCT FROM NEW.exercise THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR auth.uid() = NEW.athlete_id OR NOT public.is_coach_of(auth.uid(), NEW.athlete_id) THEN RETURN NEW; END IF;
  _lift := public.push_lift_for_baseline(NEW.exercise);
  IF _lift IS NULL THEN RETURN NEW; END IF;
  UPDATE public.push_state
     SET plan_e1rm = NEW.one_rm_kg, miss_streak = 0, version = version + 1, updated_at = now()
   WHERE athlete_id = NEW.athlete_id AND lift = _lift AND plan_e1rm <> NEW.one_rm_kg;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_push_plan_from_baseline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS baselines_sync_push_plan ON public.baselines;
CREATE TRIGGER baselines_sync_push_plan
AFTER INSERT OR UPDATE OF one_rm_kg, exercise ON public.baselines
FOR EACH ROW EXECUTE FUNCTION public.sync_push_plan_from_baseline();