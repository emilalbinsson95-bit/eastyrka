ALTER TABLE public.planned_exercises ADD COLUMN push_terminal_reason text;
CREATE OR REPLACE FUNCTION public.finish_push_with_outcome(_exercise uuid,_outcome text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.planned_exercises; a uuid;
BEGIN
 SELECT * INTO e FROM public.planned_exercises WHERE id=_exercise FOR UPDATE;
 SELECT w.athlete_id INTO a FROM public.planned_sessions s JOIN public.week_plans w ON w.id=s.week_plan_id WHERE s.id=e.planned_session_id;
 IF a IS NULL OR NOT(auth.uid()=a OR public.is_coach_of(auth.uid(),a)) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF _outcome IS NOT NULL AND _outcome NOT IN ('protocol_reduction','fatigue_stop') THEN RAISE EXCEPTION 'Unknown outcome'; END IF;
 IF EXISTS(SELECT 1 FROM public.push_log WHERE exercise_id=_exercise) THEN RETURN public.decide_push(_exercise); END IF;
 UPDATE public.planned_exercises SET push_terminal_reason=_outcome WHERE id=_exercise;
 RETURN public.decide_push(_exercise);
END $$;
REVOKE ALL ON FUNCTION public.finish_push_with_outcome(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_push_with_outcome(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.push_rts_pct(_rpe numeric,_reps integer) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (CASE round(_rpe*2)/2
 WHEN 7 THEN ARRAY[89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0,62.6,60.0]
 WHEN 7.5 THEN ARRAY[90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,66.4,63.9,61.3]
 WHEN 8 THEN ARRAY[92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0,62.6]
 WHEN 8.5 THEN ARRAY[93.9,90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,66.4,63.9]
 WHEN 9 THEN ARRAY[95.5,92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0]
 WHEN 9.5 THEN ARRAY[97.8,93.9,90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,66.4]
 WHEN 10 THEN ARRAY[100,95.5,92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5] END)[greatest(1,least(12,_reps))]/100;
$$;
CREATE OR REPLACE FUNCTION public.guard_push_decision_outcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.planned_exercises; st public.push_state;
BEGIN
 SELECT * INTO e FROM public.planned_exercises WHERE id=NEW.exercise_id;
 SELECT * INTO st FROM public.push_state WHERE athlete_id=NEW.athlete_id AND lift=NEW.lift;
 IF NEW.decision='push' AND (e.push_block_start IS NULL OR e.push_block_start<=0 OR e.plan_e1rm_used IS NULL) THEN RAISE EXCEPTION 'Missing block reference'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_push_decision_outcome BEFORE INSERT ON public.push_log FOR EACH ROW EXECUTE FUNCTION public.guard_push_decision_outcome();