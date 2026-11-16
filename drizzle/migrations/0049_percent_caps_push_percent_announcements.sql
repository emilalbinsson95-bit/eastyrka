ALTER TABLE public.planned_exercises ADD COLUMN IF NOT EXISTS rpe_cap numeric;
ALTER TABLE public.planned_exercises ADD COLUMN IF NOT EXISTS last_set_max_reps boolean NOT NULL DEFAULT false;
ALTER TABLE public.planned_exercises ADD CONSTRAINT planned_exercises_rpe_cap_range CHECK (rpe_cap IS NULL OR (rpe_cap >= 6 AND rpe_cap <= 10 AND rpe_cap * 2 = round(rpe_cap * 2)));
COMMENT ON COLUMN public.planned_exercises.rpe_cap IS 'Optional RPE ceiling on percent rows; a set above it suggests 5 % lower load on remaining sets.';
COMMENT ON COLUMN public.planned_exercises.last_set_max_reps IS 'Last set of a percent row is a max-reps set (leave one in reserve).';

ALTER TABLE public.push_state ADD COLUMN IF NOT EXISTS push_type text NOT NULL DEFAULT 'rpe';
ALTER TABLE public.push_state ADD COLUMN IF NOT EXISTS main_pct numeric;
ALTER TABLE public.push_state ADD COLUMN IF NOT EXISTS rpe_cap numeric NOT NULL DEFAULT 9;
ALTER TABLE public.push_state ADD CONSTRAINT push_state_push_type_check CHECK (push_type IN ('rpe','percent'));
ALTER TABLE public.push_state ADD CONSTRAINT push_state_main_pct_check CHECK (main_pct IS NULL OR (main_pct >= 50 AND main_pct <= 95));
ALTER TABLE public.push_state ADD CONSTRAINT push_state_rpe_cap_check CHECK (rpe_cap >= 6 AND rpe_cap <= 10);
ALTER TABLE public.push_state ADD CONSTRAINT push_state_percent_needs_pct CHECK (push_type <> 'percent' OR main_pct IS NOT NULL);

CREATE OR REPLACE FUNCTION public.configure_push_type(_athlete uuid, _lift text, _type text, _pct numeric, _cap numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.is_coach_of(auth.uid(), _athlete) THEN RAISE EXCEPTION 'Only the coach can configure progression'; END IF;
 UPDATE public.push_state SET push_type = _type, main_pct = CASE WHEN _type = 'percent' THEN _pct ELSE main_pct END, rpe_cap = COALESCE(_cap, 9), version = version + 1, updated_at = now()
 WHERE athlete_id = _athlete AND lift = _lift;
 IF NOT FOUND THEN RAISE EXCEPTION 'Spara viktprogressionen för lyftet först'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.configure_push_type(uuid, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_push_type(uuid, text, text, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_push(_exercise uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.planned_exercises; s public.planned_sessions; w public.week_plans; st public.push_state; lg public.push_log; f record;
 d text='skip'; reason text='incomplete_or_changed_load'; p numeric; before_plan numeric; before_misses integer; misses integer; day date; cnt integer; good boolean; failed boolean; b numeric; measured numeric; changes jsonb='[]'; evidence jsonb='[]'; target numeric; logid uuid;
BEGIN
 SELECT * INTO e FROM public.planned_exercises WHERE id=_exercise FOR UPDATE;
 SELECT * INTO s FROM public.planned_sessions WHERE id=e.planned_session_id;
 SELECT * INTO w FROM public.week_plans WHERE id=s.week_plan_id;
 IF w.athlete_id IS NULL OR NOT (auth.uid()=w.athlete_id OR public.is_coach_of(auth.uid(),w.athlete_id)) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO st FROM public.push_state WHERE athlete_id=w.athlete_id AND lift=e.push_lift FOR UPDATE;
 SELECT * INTO lg FROM public.push_log WHERE exercise_id=e.id;
 IF lg.id IS NOT NULL THEN RETURN jsonb_build_object('decision',lg.decision,'reason',lg.reason,'after',lg.plan_e1rm_after,'id',lg.id,'undone',lg.undone_at IS NOT NULL); END IF;
 IF NOT COALESCE(st.enabled,false) OR NOT e.push_main THEN RETURN jsonb_build_object('decision','none','reason','disabled_or_not_main'); END IF;
 IF w.is_deload OR w.training_phase IN ('deload','ramp') THEN RETURN jsonb_build_object('decision','none','reason','light_phase'); END IF;
 IF e.push_block_start IS NULL OR e.push_load_pct IS NULL OR e.plan_e1rm_used IS NULL OR abs(e.plan_e1rm_used-st.plan_e1rm)>0.00001 THEN RETURN jsonb_build_object('decision','none','reason','plan_changed'); END IF;
 p=st.plan_e1rm; before_plan=p; misses=st.miss_streak;before_misses=misses;
 SELECT max(date) INTO day FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference;
 day=COALESCE(day,current_date);
 IF day>current_date THEN RAISE EXCEPTION 'Future logs cannot decide progression'; END IF;
 IF st.last_decision_at IS NOT NULL AND day-st.last_decision_at<5 THEN RETURN jsonb_build_object('decision','none','reason','cooldown'); END IF;
 IF EXISTS(SELECT 1 FROM public.taper_followups t JOIN public.mesocycles m ON m.id=t.mesocycle_id WHERE t.athlete_id=w.athlete_id AND m.status='active' AND day BETWEEN m.start_date AND t.competition_date) OR w.training_phase IN ('peak','taper') THEN d='paused'; reason='peaking';
 ELSIF st.paused_reason IS NOT NULL THEN d='paused'; reason=st.paused_reason;
 ELSIF EXISTS(SELECT 1 FROM public.eak_meso_evaluations ev WHERE ev.id=(SELECT id FROM public.eak_meso_evaluations WHERE athlete_id=w.athlete_id AND lift=CASE WHEN st.lift IN ('conventional','sumo') THEN 'deadlift' ELSE st.lift END ORDER BY created_at DESC LIMIT 1) AND ev.status IN ('red','red_strong') AND ev.coach_decision<>'rejected' AND (st.eak_pause_released_at IS NULL OR ev.created_at>st.eak_pause_released_at)) THEN d='paused';reason='eak_bad';
 ELSE
 SELECT count(*),COALESCE(bool_and(prescribed_reps IS NOT NULL AND prescribed_weight_kg IS NOT NULL AND prescription_revision IS NOT NULL AND actively_confirmed AND prescription_revision=e.prescription_revision AND prescribed_reps=e.target_reps AND abs(prescribed_weight_kg-e.target_weight_kg)<0.001 AND (CASE WHEN e.rules_version='push-2.0' THEN (set_number<>1 OR abs(weight_kg-prescribed_weight_kg)<0.001) WHEN e.rules_version='push-3.0-pct' THEN (abs(weight_kg-prescribed_weight_kg)<=2.501 AND rpe IS NOT NULL) ELSE abs(weight_kg-prescribed_weight_kg)<0.001 END) AND exercise=e.exercise AND COALESCE(variation,'')=COALESCE(e.variation,'') AND NOT is_technique),false),COALESCE(bool_or(reps<e.target_reps),false),jsonb_agg(jsonb_build_object('id',id,'set',set_number,'reps',reps,'kg',weight_kg,'confirmed',actively_confirmed,'revision',prescription_revision,'date',date) ORDER BY set_number) INTO cnt,good,failed,evidence
 FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets;
 SELECT one_rm_kg INTO b FROM public.baselines WHERE athlete_id=w.athlete_id AND lower(trim(exercise)) IN (CASE st.lift WHEN 'squat' THEN 'squat' WHEN 'bench' THEN 'bench press' WHEN 'sumo' THEN 'sumo deadlift' ELSE 'conventional deadlift' END,CASE st.lift WHEN 'squat' THEN 'back squat' WHEN 'bench' THEN 'bench' WHEN 'sumo' THEN 'sumo marklyft' ELSE 'konventionellt marklyft' END,CASE st.lift WHEN 'squat' THEN 'knäböj' WHEN 'bench' THEN 'bänkpress' ELSE 'deadlift' END,'marklyft') AND (st.lift IN ('conventional','sumo') OR lower(trim(exercise))<>'marklyft') ORDER BY CASE WHEN lower(trim(exercise)) IN ('deadlift','marklyft') THEN 1 ELSE 0 END LIMIT 1;
 IF b>0 THEN
 SELECT weight_kg/public.push_rts_pct(rpe,reps)/b*100 INTO measured FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND NOT is_technique AND rpe>=7 ORDER BY set_number LIMIT 1;
 END IF;
 IF measured<92 THEN d='hold';reason='eak_below_92';
 ELSIF e.push_terminal_reason='protocol_reduction' THEN d='hold';reason='protocol_reduction';
 ELSIF e.push_terminal_reason='fatigue_stop' AND cnt>0 THEN IF misses>=1 THEN d='reset';reason='second_miss';p=p*0.95;misses=0; ELSE d='miss';reason='fatigue_stop';misses=misses+1; END IF;
 ELSIF cnt=e.target_sets AND (SELECT count(DISTINCT set_number) FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets)=e.target_sets AND good THEN
  IF failed OR (e.rules_version='push-3.0-pct' AND EXISTS(SELECT 1 FROM public.training_logs t WHERE t.planned_exercise_id=e.id AND NOT t.is_warmup_reference AND t.set_number BETWEEN 1 AND e.target_sets AND t.rpe>COALESCE(e.rpe_cap,9))) THEN IF misses>=1 THEN d='reset';reason='second_miss';p=p*0.95;misses=0; ELSE d='miss';reason=CASE WHEN failed THEN 'missed_reps' ELSE 'rpe_cap' END;misses=misses+1; END IF;
  ELSIF e.rules_version='push-2.0' AND (e.target_rpe IS NULL OR EXISTS(SELECT 1 FROM public.training_logs t WHERE t.planned_exercise_id=e.id AND NOT t.is_warmup_reference AND t.set_number BETWEEN 1 AND e.target_sets AND (t.rpe>e.target_rpe OR t.weight_kg<e.target_weight_kg-0.001))) THEN d='hold';reason='load_reduced_or_rpe_high';
  ELSIF p*(1+st.step_pct/100)>e.push_block_start*1.06+0.00000001 THEN d='hold';reason='block_cap';
  ELSE d='push';reason='all_main_sets_completed';p=p*(1+st.step_pct/100);misses=0; END IF;
 END IF;
 END IF;
 IF d IN ('push','reset') THEN
  FOR f IN SELECT x.* FROM public.planned_exercises x JOIN public.planned_sessions ps ON ps.id=x.planned_session_id JOIN public.week_plans wp ON wp.id=ps.week_plan_id WHERE wp.mesocycle_id=w.mesocycle_id AND wp.status='draft' AND NOT wp.is_deload AND COALESCE(wp.training_phase,'working') NOT IN ('deload','ramp','peak','taper') AND x.push_lift=e.push_lift AND (wp.week_index*7+ps.day_of_week)>(w.week_index*7+s.day_of_week) AND (wp.week_start_date+ps.day_of_week)>=day AND NOT EXISTS(SELECT 1 FROM public.training_logs tl JOIN public.planned_exercises ex ON ex.id=tl.planned_exercise_id WHERE ex.planned_session_id=ps.id) AND NOT EXISTS(SELECT 1 FROM public.session_schedule_overrides ov WHERE ov.source_id=ps.id AND (ov.cancelled_at IS NOT NULL OR ov.scheduled_date<day)) FOR UPDATE OF x LOOP
   IF f.plan_e1rm_used IS DISTINCT FROM st.plan_e1rm OR f.push_load_pct IS NULL OR f.target_weight_kg IS DISTINCT FROM round(f.plan_e1rm_used*f.push_load_pct/st.rounding_kg)*st.rounding_kg OR f.push_load_pct IS DISTINCT FROM (CASE WHEN f.rules_version='push-3.0-pct' THEN f.target_pct/100 ELSE public.push_rts_pct(f.target_rpe,f.target_reps) END) THEN CONTINUE; END IF;
   target=round(p*f.push_load_pct/st.rounding_kg)*st.rounding_kg;
   UPDATE public.planned_exercises SET target_weight_kg=target,plan_e1rm_used=p WHERE id=f.id;
   changes=changes||jsonb_build_array(jsonb_build_object('id',f.id,'before',f.target_weight_kg,'after',target,'plan_before',f.plan_e1rm_used,'revision_after',f.prescription_revision+1));
  END LOOP;
 END IF;
 UPDATE public.push_state SET plan_e1rm=p,miss_streak=misses,last_decision_at=day,paused_reason=CASE WHEN d='paused' THEN reason ELSE paused_reason END,version=version+1,updated_at=now() WHERE athlete_id=w.athlete_id AND lift=e.push_lift RETURNING * INTO st;
 INSERT INTO public.push_log(athlete_id,lift,session_id,exercise_id,mesocycle_id,decision,reason,plan_e1rm_before,plan_e1rm_after,misses_before,misses_after,state_version,changes,evidence,created_by,decision_date,rules_version) VALUES(w.athlete_id,e.push_lift,s.id,e.id,w.mesocycle_id,d,reason,before_plan,p,before_misses,misses,st.version,changes,COALESCE(evidence,'[]'),auth.uid(),day,COALESCE(e.rules_version,'push-1.0')) RETURNING id INTO logid;
 RETURN jsonb_build_object('decision',d,'reason',reason,'after',p,'id',logid);
END $function$;

CREATE TABLE public.app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','coach','athlete')),
  published_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_announcements TO authenticated;
GRANT ALL ON public.app_announcements TO service_role;
ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage announcements" ON public.app_announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "Users read published announcements for their role" ON public.app_announcements FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND published_at <= now() AND (audience = 'all'
    OR (audience = 'coach' AND public.has_role(auth.uid(), 'coach'))
    OR (audience = 'athlete' AND public.has_role(auth.uid(), 'athlete'))));
CREATE TRIGGER app_announcements_updated_at BEFORE UPDATE ON public.app_announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.app_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own announcement reads" ON public.announcement_reads FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users mark announcements read" ON public.announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());