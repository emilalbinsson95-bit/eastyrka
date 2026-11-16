ALTER TABLE public.taper_followups ADD COLUMN IF NOT EXISTS planned_attempts jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.taper_followups.planned_attempts IS 'Coach-set attempt suggestions per comp lift: {"squat":[kg,kg,kg],...}. Attempt 1 mirrors openers.';

CREATE OR REPLACE FUNCTION public.save_competition_attempts(_mesocycle_id uuid, _attempts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _athlete uuid;
  _key text;
  _list jsonb;
  _item jsonb;
BEGIN
  SELECT athlete_id INTO _athlete FROM public.taper_followups WHERE mesocycle_id = _mesocycle_id;
  IF _athlete IS NULL THEN RAISE EXCEPTION 'Tävlingen hittades inte'; END IF;
  IF auth.uid() IS NULL OR NOT (auth.uid() = _athlete OR public.is_coach_of(auth.uid(), _athlete)) THEN
    RAISE EXCEPTION 'Saknar behörighet';
  END IF;
  IF jsonb_typeof(_attempts) <> 'object' THEN RAISE EXCEPTION 'Ogiltiga försök'; END IF;
  FOR _key, _list IN SELECT * FROM jsonb_each(_attempts) LOOP
    IF _key NOT IN ('squat','bench','deadlift') OR jsonb_typeof(_list) <> 'array' OR jsonb_array_length(_list) > 3 THEN
      RAISE EXCEPTION 'Ogiltiga försök';
    END IF;
    FOR _item IN SELECT * FROM jsonb_array_elements(_list) LOOP
      IF jsonb_typeof(_item) <> 'object'
        OR NOT (jsonb_typeof(COALESCE(_item->'kg','null'::jsonb)) IN ('null','number'))
        OR NOT (jsonb_typeof(COALESCE(_item->'success','null'::jsonb)) IN ('null','boolean'))
        OR (jsonb_typeof(_item->'kg') = 'number' AND ((_item->>'kg')::numeric < 0 OR (_item->>'kg')::numeric > 600)) THEN
        RAISE EXCEPTION 'Ogiltigt försök';
      END IF;
    END LOOP;
  END LOOP;
  UPDATE public.taper_followups SET attempts = _attempts, updated_at = now() WHERE mesocycle_id = _mesocycle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_competition_attempts(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_competition_attempts(uuid, jsonb) TO authenticated;