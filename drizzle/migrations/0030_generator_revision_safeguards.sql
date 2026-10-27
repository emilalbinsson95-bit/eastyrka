ALTER TABLE public.planned_exercises ADD COLUMN IF NOT EXISTS is_technique boolean NOT NULL DEFAULT false;
ALTER TABLE public.training_logs ADD COLUMN IF NOT EXISTS is_technique boolean NOT NULL DEFAULT false;
ALTER TABLE public.week_plans ADD COLUMN IF NOT EXISTS training_phase text;
CREATE TABLE public.baseline_max_decisions (athlete_id uuid NOT NULL REFERENCES public.profiles(id), training_log_id uuid NOT NULL REFERENCES public.training_logs(id), decision text NOT NULL CHECK (decision IN ('approved','rejected')), decided_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (athlete_id,training_log_id));
GRANT SELECT, INSERT ON public.baseline_max_decisions TO authenticated;
GRANT ALL ON public.baseline_max_decisions TO service_role;
ALTER TABLE public.baseline_max_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY max_decisions_read ON public.baseline_max_decisions FOR SELECT TO authenticated USING (athlete_id=auth.uid() OR public.is_coach_of(auth.uid(),athlete_id));
CREATE POLICY max_decisions_coach_insert ON public.baseline_max_decisions FOR INSERT TO authenticated WITH CHECK (public.is_coach_of(auth.uid(),athlete_id) AND decided_by=auth.uid() AND EXISTS (SELECT 1 FROM public.training_logs l WHERE l.id=training_log_id AND l.athlete_id=baseline_max_decisions.athlete_id));
CREATE OR REPLACE FUNCTION public.postpone_deload_checkpoint(_week_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE dst public.week_plans; src public.week_plans; nxt public.week_plans; ss record; new_session uuid;
BEGIN
 SELECT * INTO dst FROM public.week_plans WHERE id=_week_id FOR UPDATE;
 IF dst.id IS NULL OR NOT public.is_coach_of(auth.uid(),dst.athlete_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF dst.week_index<>4 OR NOT dst.is_deload THEN RAISE EXCEPTION 'Week is not a deload checkpoint'; END IF;
 SELECT * INTO src FROM public.week_plans WHERE mesocycle_id=dst.mesocycle_id AND week_index=3 FOR UPDATE;
 SELECT * INTO nxt FROM public.week_plans WHERE mesocycle_id=dst.mesocycle_id AND week_index=5 FOR UPDATE;
 IF src.id IS NULL OR nxt.id IS NULL THEN RAISE EXCEPTION 'A fifth week is required; extend the block first without moving competition'; END IF;
 IF EXISTS (SELECT 1 FROM public.competitions WHERE athlete_id=dst.athlete_id AND comp_date>dst.week_start_date AND comp_date<=nxt.week_start_date+42) THEN RAISE EXCEPTION 'Checkpoint cannot postpone a deload inside competition preparation'; END IF;
 IF EXISTS (SELECT 1 FROM public.training_logs l JOIN public.planned_exercises e ON e.id=l.planned_exercise_id JOIN public.planned_sessions s ON s.id=e.planned_session_id WHERE s.week_plan_id IN(dst.id,nxt.id)) OR EXISTS (SELECT 1 FROM public.training_logs WHERE athlete_id=dst.athlete_id AND date>=dst.week_start_date AND date<nxt.week_start_date+7) THEN RAISE EXCEPTION 'Logged weeks cannot be replaced'; END IF;
 IF dst.week_start_date<CURRENT_DATE THEN RAISE EXCEPTION 'Past weeks cannot be replaced'; END IF;
 DELETE FROM public.planned_exercises WHERE planned_session_id IN(SELECT id FROM public.planned_sessions WHERE week_plan_id=nxt.id);
 DELETE FROM public.planned_sessions WHERE week_plan_id=nxt.id;
 UPDATE public.planned_sessions SET week_plan_id=nxt.id WHERE week_plan_id=dst.id;
 FOR ss IN SELECT * FROM public.planned_sessions WHERE week_plan_id=src.id LOOP
 INSERT INTO public.planned_sessions(week_plan_id,day_of_week,title,notes) VALUES(dst.id,ss.day_of_week,ss.title,ss.notes) RETURNING id INTO new_session;
 INSERT INTO public.planned_exercises(planned_session_id,order_index,exercise,exercise_id,variation,target_sets,target_reps,target_rpe,target_rir,target_weight_kg,intensity_metric,lengthened_partials,last_set_to_failure,notes,is_technique) SELECT new_session,order_index,exercise,exercise_id,variation,target_sets,target_reps,target_rpe,target_rir,target_weight_kg,intensity_metric,lengthened_partials,last_set_to_failure,notes,is_technique FROM public.planned_exercises WHERE planned_session_id=ss.id;
 END LOOP;
 UPDATE public.week_plans SET is_deload=false,status='draft',training_phase='working' WHERE id=dst.id;
 UPDATE public.week_plans SET is_deload=true,status='draft',training_phase='deload' WHERE id=nxt.id;
END $$;
REVOKE ALL ON FUNCTION public.postpone_deload_checkpoint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.postpone_deload_checkpoint(uuid) TO authenticated;