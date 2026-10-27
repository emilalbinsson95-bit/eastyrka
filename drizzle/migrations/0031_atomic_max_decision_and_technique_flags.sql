CREATE OR REPLACE FUNCTION public.decide_baseline_max(_log_id uuid, _approve boolean) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE l public.training_logs; b public.baselines;
BEGIN
 SELECT * INTO l FROM public.training_logs WHERE id=_log_id FOR UPDATE;
 IF l.id IS NULL OR NOT public.is_coach_of(auth.uid(),l.athlete_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF l.reps<>1 OR l.is_warmup_reference OR l.is_technique OR COALESCE(l.variation,'')<>'' THEN RAISE EXCEPTION 'Not an eligible actual maximum'; END IF;
 SELECT * INTO b FROM public.baselines WHERE athlete_id=l.athlete_id AND lower(trim(exercise))=lower(trim(l.exercise)) FOR UPDATE;
 IF b.id IS NULL OR l.weight_kg<=b.one_rm_kg THEN RAISE EXCEPTION 'Maximum does not exceed current baseline'; END IF;
 INSERT INTO public.baseline_max_decisions(athlete_id,training_log_id,decision,decided_by) VALUES(l.athlete_id,l.id,CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,auth.uid());
 IF _approve THEN UPDATE public.baselines SET one_rm_kg=l.weight_kg WHERE id=b.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.decide_baseline_max(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_baseline_max(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.capture_logged_technique() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
 IF NEW.planned_exercise_id IS NOT NULL THEN SELECT COALESCE(e.is_technique,false) INTO NEW.is_technique FROM public.planned_exercises e WHERE e.id=NEW.planned_exercise_id; END IF;
 NEW.is_technique=COALESCE(NEW.is_technique,false);
 RETURN NEW;
END $$;
CREATE TRIGGER capture_logged_technique BEFORE INSERT OR UPDATE OF planned_exercise_id ON public.training_logs FOR EACH ROW EXECUTE FUNCTION public.capture_logged_technique();