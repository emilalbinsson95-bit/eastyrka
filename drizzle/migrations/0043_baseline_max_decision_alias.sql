DROP FUNCTION IF EXISTS public.decide_baseline_max(uuid, boolean);
CREATE OR REPLACE FUNCTION public.decide_baseline_max(_log_id uuid, _approve boolean, _baseline_exercise text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE l public.training_logs; b public.baselines;
BEGIN
 SELECT * INTO l FROM public.training_logs WHERE id=_log_id FOR UPDATE;
 IF l.id IS NULL OR NOT public.is_coach_of(auth.uid(),l.athlete_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF l.reps<>1 OR l.is_warmup_reference OR l.is_technique OR COALESCE(l.variation,'')<>'' THEN RAISE EXCEPTION 'Not an eligible actual maximum'; END IF;
 -- The app matches baselines through competition aliases (Back squat -> Knäböj); it passes the matched baseline name.
 SELECT * INTO b FROM public.baselines
  WHERE athlete_id=l.athlete_id AND lower(trim(exercise))=lower(trim(COALESCE(_baseline_exercise, l.exercise)))
  FOR UPDATE;
 IF _approve AND (b.id IS NULL OR l.weight_kg<=b.one_rm_kg) THEN RAISE EXCEPTION 'Maximum does not exceed current baseline'; END IF;
 INSERT INTO public.baseline_max_decisions(athlete_id,training_log_id,decision,decided_by)
  VALUES(l.athlete_id,l.id,CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,auth.uid());
 IF _approve THEN UPDATE public.baselines SET one_rm_kg=l.weight_kg WHERE id=b.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.decide_baseline_max(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_baseline_max(uuid,boolean,text) TO authenticated;