CREATE OR REPLACE FUNCTION public.decide_baseline_max(_log_id uuid, _approve boolean, _baseline_exercise text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE l public.training_logs; b public.baselines; pe public.planned_exercises; proposed numeric;
BEGIN
 SELECT * INTO l FROM public.training_logs WHERE id=_log_id FOR UPDATE;
 IF l.id IS NULL OR NOT public.is_coach_of(auth.uid(),l.athlete_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 -- Competition-style notes (same strict allow-list as the app) count as the competition lift.
 IF l.is_warmup_reference OR l.is_technique OR NOT (
   COALESCE(l.variation,'')='' OR
   btrim(regexp_replace(regexp_replace(lower(l.variation),'[-_·/()\[\]]+',' ','g'),'\s+',' ','g')) ~ '^(competition stance|comp stance|competition grip (&|and) pause|competition grip|comp grip|conventional stance|sumo stance|over warm single|opener single)$'
 ) THEN RAISE EXCEPTION 'Not an eligible actual maximum'; END IF;
 IF l.reps=1 THEN
  proposed=l.weight_kg;
 ELSE
  -- Max-rep set: last set of a percent row marked max reps, at most 12 reps and RPE 9 or higher.
  SELECT * INTO pe FROM public.planned_exercises WHERE id=l.planned_exercise_id;
  IF pe.id IS NULL OR NOT pe.last_set_max_reps OR pe.target_pct IS NULL OR l.set_number<>pe.target_sets OR l.reps>12 OR l.rpe IS NULL OR l.rpe<9 THEN
   RAISE EXCEPTION 'Not an eligible actual maximum';
  END IF;
  proposed=floor(l.weight_kg/public.push_rts_pct(l.rpe,l.reps)/2.5)*2.5;
 END IF;
 SELECT * INTO b FROM public.baselines
  WHERE athlete_id=l.athlete_id AND lower(trim(exercise))=lower(trim(COALESCE(_baseline_exercise, l.exercise)))
  FOR UPDATE;
 IF _approve AND (b.id IS NULL OR proposed<=b.one_rm_kg) THEN RAISE EXCEPTION 'Maximum does not exceed current baseline'; END IF;
 INSERT INTO public.baseline_max_decisions(athlete_id,training_log_id,decision,decided_by)
  VALUES(l.athlete_id,l.id,CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,auth.uid());
 IF _approve THEN UPDATE public.baselines SET one_rm_kg=proposed WHERE id=b.id; END IF;
END $function$;