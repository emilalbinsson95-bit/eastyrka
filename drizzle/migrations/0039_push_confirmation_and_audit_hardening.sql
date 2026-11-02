ALTER TABLE public.push_log ADD COLUMN decision_date date NOT NULL DEFAULT current_date;
CREATE OR REPLACE FUNCTION public.capture_push_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.planned_exercises; a uuid;
BEGIN
 IF NEW.planned_exercise_id IS NULL THEN NEW.actively_confirmed=false; RETURN NEW; END IF;
 SELECT * INTO e FROM public.planned_exercises WHERE id=NEW.planned_exercise_id FOR SHARE;
 SELECT w.athlete_id INTO a FROM public.planned_sessions s JOIN public.week_plans w ON w.id=s.week_plan_id WHERE s.id=e.planned_session_id;
 IF a IS DISTINCT FROM NEW.athlete_id THEN RAISE EXCEPTION 'Log does not belong to prescription'; END IF;
 IF e.push_lift IS NOT NULL THEN
  IF TG_OP='UPDATE' THEN
   NEW.actively_confirmed=OLD.actively_confirmed;
   IF ROW(NEW.reps,NEW.weight_kg,NEW.planned_exercise_id,NEW.set_number,NEW.exercise,NEW.variation,NEW.date) IS DISTINCT FROM ROW(OLD.reps,OLD.weight_kg,OLD.planned_exercise_id,OLD.set_number,OLD.exercise,OLD.variation,OLD.date) THEN NEW.actively_confirmed=false; END IF;
   NEW.prescribed_reps=OLD.prescribed_reps;NEW.prescribed_weight_kg=OLD.prescribed_weight_kg;NEW.prescription_revision=OLD.prescription_revision;NEW.prescription_snapshot=OLD.prescription_snapshot;
  ELSE
   NEW.prescribed_reps=e.target_reps;NEW.prescribed_weight_kg=e.target_weight_kg;NEW.prescription_revision=e.prescription_revision;
   NEW.prescription_snapshot=jsonb_build_object('sets',e.target_sets,'reps',e.target_reps,'kg',e.target_weight_kg,'rpe',e.target_rpe,'exercise',e.exercise,'variation',e.variation,'plan',e.plan_e1rm_used);
   NEW.generator_version=e.generator_version;NEW.rules_version=e.rules_version;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.decide_push(uuid)'::regprocedure) INTO definition;
 definition=replace(definition,'bool_and(actively_confirmed AND','bool_and(prescribed_reps IS NOT NULL AND prescribed_weight_kg IS NOT NULL AND prescription_revision IS NOT NULL AND actively_confirmed AND');
 definition=replace(definition,'''revision'',prescription_revision)','''revision'',prescription_revision,''date'',date)');
 definition=replace(definition,'state_version,changes,evidence,created_by) VALUES','state_version,changes,evidence,created_by,decision_date) VALUES');
 definition=replace(definition,'st.version,changes,COALESCE(evidence,''[]''),auth.uid())','st.version,changes,COALESCE(evidence,''[]''),auth.uid(),day)');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.undo_push(uuid)'::regprocedure) INTO definition;
 definition=replace(definition,'(SELECT max((evidence_log->>''date'')::date) FROM public.push_log prev CROSS JOIN LATERAL jsonb_array_elements(prev.evidence) evidence_log WHERE prev.athlete_id=lg.athlete_id AND prev.lift=lg.lift AND prev.id<>lg.id AND prev.undone_at IS NULL)','(SELECT max(prev.decision_date) FROM public.push_log prev WHERE prev.athlete_id=lg.athlete_id AND prev.lift=lg.lift AND prev.id<>lg.id AND prev.undone_at IS NULL)');
 EXECUTE definition;
END $$;