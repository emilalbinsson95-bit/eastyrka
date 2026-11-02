CREATE OR REPLACE FUNCTION public.decide_push(_exercise uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 ELSIF EXISTS(SELECT 1 FROM public.eak_meso_evaluations ev WHERE ev.id=(SELECT id FROM public.eak_meso_evaluations WHERE athlete_id=w.athlete_id AND lift=CASE WHEN st.lift IN ('conventional','sumo') THEN 'deadlift' ELSE st.lift END ORDER BY created_at DESC LIMIT 1) AND ev.status IN ('red','red_strong') AND ev.coach_decision<>'rejected') THEN d='paused';reason='eak_bad';
 ELSE
 SELECT count(*),COALESCE(bool_and(actively_confirmed AND prescription_revision=e.prescription_revision AND prescribed_reps=e.target_reps AND abs(prescribed_weight_kg-e.target_weight_kg)<0.001 AND abs(weight_kg-prescribed_weight_kg)<0.001 AND exercise=e.exercise AND COALESCE(variation,'')=COALESCE(e.variation,'') AND NOT is_technique),false),COALESCE(bool_or(reps<e.target_reps),false),jsonb_agg(jsonb_build_object('id',id,'set',set_number,'reps',reps,'kg',weight_kg,'confirmed',actively_confirmed,'revision',prescription_revision) ORDER BY set_number) INTO cnt,good,failed,evidence
 FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets;
 SELECT one_rm_kg INTO b FROM public.baselines WHERE athlete_id=w.athlete_id AND lower(trim(exercise)) IN (CASE st.lift WHEN 'squat' THEN 'squat' WHEN 'bench' THEN 'bench press' WHEN 'sumo' THEN 'sumo deadlift' ELSE 'conventional deadlift' END,CASE st.lift WHEN 'squat' THEN 'back squat' WHEN 'bench' THEN 'bench' WHEN 'sumo' THEN 'sumo marklyft' ELSE 'konventionellt marklyft' END,CASE st.lift WHEN 'squat' THEN 'knäböj' WHEN 'bench' THEN 'bänkpress' ELSE 'deadlift' END,'marklyft') AND (st.lift IN ('conventional','sumo') OR lower(trim(exercise))<>'marklyft') ORDER BY CASE WHEN lower(trim(exercise)) IN ('deadlift','marklyft') THEN 1 ELSE 0 END LIMIT 1;
 IF b>0 THEN
 SELECT weight_kg/public.push_rts_pct(rpe,reps)/b*100 INTO measured FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND NOT is_technique AND rpe>=7 ORDER BY set_number LIMIT 1;
 END IF;
 IF measured<92 THEN d='hold';reason='eak_below_92';
 ELSIF e.push_terminal_reason='protocol_reduction' THEN d='hold';reason='protocol_reduction';
 ELSIF e.push_terminal_reason='fatigue_stop' AND cnt>0 THEN IF misses>=1 THEN d='reset';reason='second_miss';p=p*0.95;misses=0; ELSE d='miss';reason='fatigue_stop';misses=misses+1; END IF;
 ELSIF cnt=e.target_sets AND (SELECT count(DISTINCT set_number) FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets)=e.target_sets AND good THEN
  IF failed THEN IF misses>=1 THEN d='reset';reason='second_miss';p=p*0.95;misses=0; ELSE d='miss';reason='missed_reps';misses=misses+1; END IF;
  ELSIF p*(1+st.step_pct/100)>e.push_block_start*1.06+0.00000001 THEN d='hold';reason='block_cap';
  ELSE d='push';reason='all_main_sets_completed';p=p*(1+st.step_pct/100);misses=0; END IF;
 END IF;
 END IF;
 IF d IN ('push','reset') THEN
  FOR f IN SELECT x.* FROM public.planned_exercises x JOIN public.planned_sessions ps ON ps.id=x.planned_session_id JOIN public.week_plans wp ON wp.id=ps.week_plan_id WHERE wp.mesocycle_id=w.mesocycle_id AND x.push_lift=e.push_lift AND (wp.week_index*7+ps.day_of_week)>(w.week_index*7+s.day_of_week) AND (wp.week_start_date+ps.day_of_week)>=day AND NOT EXISTS(SELECT 1 FROM public.training_logs tl JOIN public.planned_exercises ex ON ex.id=tl.planned_exercise_id WHERE ex.planned_session_id=ps.id) AND NOT EXISTS(SELECT 1 FROM public.session_schedule_overrides ov WHERE ov.source_id=ps.id AND (ov.cancelled_at IS NOT NULL OR ov.scheduled_date<day)) FOR UPDATE OF x LOOP
   IF f.plan_e1rm_used IS DISTINCT FROM st.plan_e1rm OR f.push_load_pct IS NULL OR f.target_weight_kg IS DISTINCT FROM round(f.plan_e1rm_used*f.push_load_pct/st.rounding_kg)*st.rounding_kg OR f.push_load_pct IS DISTINCT FROM public.push_rts_pct(f.target_rpe,f.target_reps) THEN CONTINUE; END IF;
   target=round(p*f.push_load_pct/st.rounding_kg)*st.rounding_kg;
   UPDATE public.planned_exercises SET target_weight_kg=target,plan_e1rm_used=p WHERE id=f.id;
   changes=changes||jsonb_build_array(jsonb_build_object('id',f.id,'before',f.target_weight_kg,'after',target,'plan_before',f.plan_e1rm_used,'revision_after',f.prescription_revision+1));
  END LOOP;
 END IF;
 UPDATE public.push_state SET plan_e1rm=p,miss_streak=misses,last_decision_at=day,paused_reason=CASE WHEN d='paused' THEN reason ELSE paused_reason END,version=version+1,updated_at=now() WHERE athlete_id=w.athlete_id AND lift=e.push_lift RETURNING * INTO st;
 INSERT INTO public.push_log(athlete_id,lift,session_id,exercise_id,mesocycle_id,decision,reason,plan_e1rm_before,plan_e1rm_after,misses_before,misses_after,state_version,changes,evidence,created_by) VALUES(w.athlete_id,e.push_lift,s.id,e.id,w.mesocycle_id,d,reason,before_plan,p,before_misses,misses,st.version,changes,COALESCE(evidence,'[]'),auth.uid()) RETURNING id INTO logid;
 RETURN jsonb_build_object('decision',d,'reason',reason,'after',p,'id',logid);
END $$;
REVOKE ALL ON FUNCTION public.decide_push(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_push(uuid) TO authenticated;