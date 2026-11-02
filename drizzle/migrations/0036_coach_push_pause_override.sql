ALTER TABLE public.push_state ADD COLUMN eak_pause_released_at timestamptz;
CREATE OR REPLACE FUNCTION public.configure_push(_athlete uuid,_lift text,_enabled boolean,_plan numeric,_step numeric,_rounding numeric,_sets integer,_reps integer,_rpe numeric,_resume boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_coach_of(auth.uid(),_athlete) THEN RAISE EXCEPTION 'Only the coach can configure progression'; END IF;
 INSERT INTO public.push_state(athlete_id,lift,enabled,plan_e1rm,step_pct,rounding_kg,main_sets,main_reps,main_rpe) VALUES(_athlete,_lift,_enabled,_plan,_step,_rounding,_sets,_reps,_rpe)
 ON CONFLICT(athlete_id,lift) DO UPDATE SET enabled=excluded.enabled,plan_e1rm=excluded.plan_e1rm,step_pct=excluded.step_pct,rounding_kg=excluded.rounding_kg,main_sets=excluded.main_sets,main_reps=excluded.main_reps,main_rpe=excluded.main_rpe,
 paused_reason=CASE WHEN _resume THEN NULL ELSE push_state.paused_reason END,eak_pause_released_at=CASE WHEN _resume THEN now() ELSE push_state.eak_pause_released_at END,miss_streak=CASE WHEN push_state.plan_e1rm<>excluded.plan_e1rm THEN 0 ELSE push_state.miss_streak END,version=push_state.version+1,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.configure_push(uuid,text,boolean,numeric,numeric,numeric,integer,integer,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_push(uuid,text,boolean,numeric,numeric,numeric,integer,integer,numeric,boolean) TO authenticated;