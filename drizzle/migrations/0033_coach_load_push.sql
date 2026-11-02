CREATE TABLE public.push_state (
 athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 lift text NOT NULL CHECK (lift IN ('squat','bench','conventional','sumo')),
 enabled boolean NOT NULL DEFAULT false,
 plan_e1rm numeric NOT NULL CHECK(plan_e1rm>0 AND plan_e1rm<=1000),
 step_pct numeric NOT NULL CHECK(step_pct>0 AND step_pct<=2),
 rounding_kg numeric NOT NULL DEFAULT 2.5 CHECK(rounding_kg IN (1.25,2.5)),
 main_sets integer NOT NULL DEFAULT 4 CHECK(main_sets BETWEEN 2 AND 5),
 main_reps integer NOT NULL DEFAULT 5 CHECK(main_reps BETWEEN 3 AND 5),
 main_rpe numeric NOT NULL DEFAULT 7.5 CHECK(main_rpe BETWEEN 6 AND 8.5),
 miss_streak integer NOT NULL DEFAULT 0,
 paused_reason text,
 last_decision_at date,
 version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(athlete_id,lift)
);
GRANT SELECT ON public.push_state TO authenticated;
GRANT ALL ON public.push_state TO service_role;
ALTER TABLE public.push_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_state_read ON public.push_state FOR SELECT TO authenticated USING(athlete_id=auth.uid() OR public.is_coach_of(auth.uid(),athlete_id));
CREATE TABLE public.push_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES public.profiles(id),
 lift text NOT NULL, session_id uuid REFERENCES public.planned_sessions(id) ON DELETE SET NULL,
 exercise_id uuid REFERENCES public.planned_exercises(id) ON DELETE SET NULL,
 mesocycle_id uuid REFERENCES public.mesocycles(id) ON DELETE SET NULL,
 decision text NOT NULL, reason text NOT NULL, plan_e1rm_before numeric NOT NULL, plan_e1rm_after numeric NOT NULL,
 misses_before integer NOT NULL, misses_after integer NOT NULL, state_version integer NOT NULL,
 rules_version text NOT NULL DEFAULT 'push-1.0', generator_version text NOT NULL DEFAULT 'generator-push-1.0',
 changes jsonb NOT NULL DEFAULT '[]', evidence jsonb NOT NULL DEFAULT '[]', created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz,
 UNIQUE(exercise_id)
);
GRANT SELECT ON public.push_log TO authenticated;
GRANT ALL ON public.push_log TO service_role;
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_log_read ON public.push_log FOR SELECT TO authenticated USING(athlete_id=auth.uid() OR public.is_coach_of(auth.uid(),athlete_id));
ALTER TABLE public.mesocycles ADD COLUMN generator_version text, ADD COLUMN rules_version text;
ALTER TABLE public.planned_sessions ADD COLUMN generator_version text, ADD COLUMN rules_version text;
ALTER TABLE public.planned_exercises ADD COLUMN push_lift text, ADD COLUMN push_main boolean NOT NULL DEFAULT false,
 ADD COLUMN push_load_pct numeric, ADD COLUMN plan_e1rm_used numeric, ADD COLUMN push_block_start numeric,
 ADD COLUMN prescription_revision integer NOT NULL DEFAULT 0, ADD COLUMN generator_version text, ADD COLUMN rules_version text;
ALTER TABLE public.training_logs ADD COLUMN actively_confirmed boolean NOT NULL DEFAULT false,
 ADD COLUMN prescribed_reps integer, ADD COLUMN prescribed_weight_kg numeric, ADD COLUMN prescription_revision integer,
 ADD COLUMN prescription_snapshot jsonb, ADD COLUMN generator_version text, ADD COLUMN rules_version text;
CREATE OR REPLACE FUNCTION public.capture_push_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.planned_exercises; a uuid;
BEGIN
 IF NEW.planned_exercise_id IS NULL THEN NEW.actively_confirmed=false; RETURN NEW; END IF;
 SELECT * INTO e FROM public.planned_exercises WHERE id=NEW.planned_exercise_id FOR SHARE;
 SELECT w.athlete_id INTO a FROM public.planned_sessions s JOIN public.week_plans w ON w.id=s.week_plan_id WHERE s.id=e.planned_session_id;
 IF a IS DISTINCT FROM NEW.athlete_id THEN RAISE EXCEPTION 'Log does not belong to prescription'; END IF;
 IF e.push_lift IS NOT NULL THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.reps IS DISTINCT FROM OLD.reps OR NEW.weight_kg IS DISTINCT FROM OLD.weight_kg OR NEW.planned_exercise_id IS DISTINCT FROM OLD.planned_exercise_id OR NEW.set_number IS DISTINCT FROM OLD.set_number THEN NEW.actively_confirmed=false; END IF;
   NEW.prescribed_reps=OLD.prescribed_reps; NEW.prescribed_weight_kg=OLD.prescribed_weight_kg; NEW.prescription_revision=OLD.prescription_revision; NEW.prescription_snapshot=OLD.prescription_snapshot;
  ELSE
   NEW.prescribed_reps=e.target_reps; NEW.prescribed_weight_kg=e.target_weight_kg; NEW.prescription_revision=e.prescription_revision;
   NEW.prescription_snapshot=jsonb_build_object('sets',e.target_sets,'reps',e.target_reps,'kg',e.target_weight_kg,'rpe',e.target_rpe,'exercise',e.exercise,'variation',e.variation,'plan',e.plan_e1rm_used);
   NEW.generator_version=e.generator_version; NEW.rules_version=e.rules_version;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_push_confirmation BEFORE INSERT OR UPDATE ON public.training_logs FOR EACH ROW EXECUTE FUNCTION public.capture_push_confirmation();
CREATE OR REPLACE FUNCTION public.revise_push_prescription() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF ROW(NEW.exercise,NEW.variation,NEW.target_sets,NEW.target_reps,NEW.target_rpe,NEW.target_weight_kg,NEW.push_lift,NEW.push_main,NEW.push_load_pct,NEW.plan_e1rm_used) IS DISTINCT FROM ROW(OLD.exercise,OLD.variation,OLD.target_sets,OLD.target_reps,OLD.target_rpe,OLD.target_weight_kg,OLD.push_lift,OLD.push_main,OLD.push_load_pct,OLD.plan_e1rm_used) THEN NEW.prescription_revision=OLD.prescription_revision+1; ELSE NEW.prescription_revision=OLD.prescription_revision; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revise_push_prescription BEFORE UPDATE ON public.planned_exercises FOR EACH ROW EXECUTE FUNCTION public.revise_push_prescription();
CREATE OR REPLACE FUNCTION public.configure_push(_athlete uuid,_lift text,_enabled boolean,_plan numeric,_step numeric,_rounding numeric,_sets integer,_reps integer,_rpe numeric,_resume boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_coach_of(auth.uid(),_athlete) THEN RAISE EXCEPTION 'Only the coach can configure progression'; END IF;
 INSERT INTO public.push_state(athlete_id,lift,enabled,plan_e1rm,step_pct,rounding_kg,main_sets,main_reps,main_rpe) VALUES(_athlete,_lift,_enabled,_plan,_step,_rounding,_sets,_reps,_rpe)
 ON CONFLICT(athlete_id,lift) DO UPDATE SET enabled=excluded.enabled,plan_e1rm=excluded.plan_e1rm,step_pct=excluded.step_pct,rounding_kg=excluded.rounding_kg,main_sets=excluded.main_sets,main_reps=excluded.main_reps,main_rpe=excluded.main_rpe,
 paused_reason=CASE WHEN _resume THEN NULL ELSE push_state.paused_reason END,miss_streak=CASE WHEN push_state.plan_e1rm<>excluded.plan_e1rm THEN 0 ELSE push_state.miss_streak END,version=push_state.version+1,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.configure_push(uuid,text,boolean,numeric,numeric,numeric,integer,integer,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_push(uuid,text,boolean,numeric,numeric,numeric,integer,integer,numeric,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.push_rts_pct(_rpe numeric,_reps integer) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (CASE round(_rpe*2)/2
 WHEN 7 THEN ARRAY[89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0,62.6,60.0]
 WHEN 7.5 THEN ARRAY[90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,66.4,63.9,61.3]
 WHEN 8 THEN ARRAY[92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0,62.6]
 WHEN 8.5 THEN ARRAY[93.9,90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,72.3-5.9,63.9]
 WHEN 9 THEN ARRAY[95.5,92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5,65.0]
 WHEN 9.5 THEN ARRAY[97.8,93.9,90.7,87.8,85.0,82.4,79.9,77.4,75.1,72.3,69.4,66.4]
 WHEN 10 THEN ARRAY[100,95.5,92.2,89.2,86.3,83.7,81.1,78.6,76.2,73.9,70.7,67.5] END)[greatest(1,least(12,_reps))]/100;
$$;
CREATE OR REPLACE FUNCTION public.decide_push(_exercise uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.planned_exercises; s public.planned_sessions; w public.week_plans; st public.push_state; lg public.push_log; l record; f record;
 d text='skip'; reason text='incomplete_or_changed_load'; p numeric; misses integer; day date; cnt integer; good boolean; failed boolean; b numeric; measured numeric; changes jsonb='[]'; evidence jsonb='[]'; target numeric; logid uuid;
BEGIN
 SELECT * INTO e FROM public.planned_exercises WHERE id=_exercise FOR UPDATE;
 SELECT * INTO s FROM public.planned_sessions WHERE id=e.planned_session_id;
 SELECT * INTO w FROM public.week_plans WHERE id=s.week_plan_id;
 IF w.athlete_id IS NULL OR NOT (auth.uid()=w.athlete_id OR public.is_coach_of(auth.uid(),w.athlete_id)) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO st FROM public.push_state WHERE athlete_id=w.athlete_id AND lift=e.push_lift FOR UPDATE;
 SELECT * INTO lg FROM public.push_log WHERE exercise_id=e.id;
 IF lg.id IS NOT NULL THEN RETURN jsonb_build_object('decision',lg.decision,'reason',lg.reason,'after',lg.plan_e1rm_after,'id',lg.id); END IF;
 IF NOT COALESCE(st.enabled,false) OR NOT e.push_main THEN RETURN jsonb_build_object('decision','none','reason','disabled_or_not_main'); END IF;
 IF w.is_deload OR w.training_phase IN ('deload','ramp') THEN RETURN jsonb_build_object('decision','none','reason','light_phase'); END IF;
 p=st.plan_e1rm; misses=st.miss_streak;
 SELECT max(date) INTO day FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference;
 day=COALESCE(day,current_date);
 IF day>current_date THEN RAISE EXCEPTION 'Future logs cannot decide progression'; END IF;
 IF st.last_decision_at IS NOT NULL AND day-st.last_decision_at<5 THEN RETURN jsonb_build_object('decision','none','reason','cooldown'); END IF;
 IF EXISTS(SELECT 1 FROM public.taper_followups t JOIN public.mesocycles m ON m.id=t.mesocycle_id WHERE t.athlete_id=w.athlete_id AND m.status<>'archived' AND day BETWEEN m.start_date AND t.competition_date) OR w.training_phase IN ('peak','taper') THEN d='paused'; reason='peaking';
 ELSIF st.paused_reason IS NOT NULL THEN d='paused'; reason=st.paused_reason;
 ELSIF EXISTS(SELECT 1 FROM public.eak_meso_evaluations ev WHERE ev.id=(SELECT id FROM public.eak_meso_evaluations WHERE athlete_id=w.athlete_id AND lift=CASE WHEN st.lift IN ('conventional','sumo') THEN 'deadlift' ELSE st.lift END ORDER BY created_at DESC LIMIT 1) AND ev.status IN ('red','red_strong') AND ev.coach_decision<>'rejected') THEN d='paused';reason='eak_bad';
 ELSE
 SELECT count(*),COALESCE(bool_and(actively_confirmed AND prescription_revision=e.prescription_revision AND prescribed_reps=e.target_reps AND abs(prescribed_weight_kg-e.target_weight_kg)<0.001 AND abs(weight_kg-prescribed_weight_kg)<0.001 AND exercise=e.exercise AND COALESCE(variation,'')=COALESCE(e.variation,'') AND NOT is_technique),false),COALESCE(bool_or(reps<e.target_reps),false),jsonb_agg(to_jsonb(training_logs) ORDER BY set_number) INTO cnt,good,failed,evidence
 FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets;
 IF cnt=e.target_sets AND (SELECT count(DISTINCT set_number) FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND set_number BETWEEN 1 AND e.target_sets)=e.target_sets AND good THEN
  IF failed THEN IF misses>=1 THEN d='reset';reason='second_miss';p=p*0.95;misses=0; ELSE d='miss';reason='missed_reps';misses=misses+1; END IF;
  ELSE
   SELECT one_rm_kg INTO b FROM public.baselines WHERE athlete_id=w.athlete_id AND lower(trim(exercise)) IN (CASE st.lift WHEN 'squat' THEN 'squat' WHEN 'bench' THEN 'bench press' WHEN 'sumo' THEN 'sumo deadlift' ELSE 'conventional deadlift' END,CASE st.lift WHEN 'squat' THEN 'back squat' WHEN 'bench' THEN 'bench' WHEN 'sumo' THEN 'sumo marklyft' ELSE 'konventionellt marklyft' END,CASE st.lift WHEN 'squat' THEN 'knäböj' WHEN 'bench' THEN 'bänkpress' ELSE 'deadlift' END) ORDER BY CASE WHEN lower(trim(exercise)) IN ('deadlift','marklyft') THEN 1 ELSE 0 END LIMIT 1;
   SELECT weight_kg/public.push_rts_pct(rpe,reps)/b*100 INTO measured FROM public.training_logs WHERE planned_exercise_id=e.id AND NOT is_warmup_reference AND NOT is_technique AND rpe>=7 ORDER BY set_number LIMIT 1;
   IF measured<92 THEN d='hold';reason='eak_below_92';
   ELSIF abs(e.plan_e1rm_used-st.plan_e1rm)>0.00001 THEN d='skip';reason='plan_changed';
   ELSIF p*(1+st.step_pct/100)>e.push_block_start*1.06+0.00000001 THEN d='hold';reason='block_cap';
   ELSE d='push';reason='all_main_sets_completed';p=p*(1+st.step_pct/100);misses=0; END IF;
  END IF;
 END IF;
 END IF;
 IF d IN ('push','reset') THEN
  FOR f IN SELECT x.* FROM public.planned_exercises x JOIN public.planned_sessions ps ON ps.id=x.planned_session_id JOIN public.week_plans wp ON wp.id=ps.week_plan_id WHERE wp.mesocycle_id=w.mesocycle_id AND x.push_lift=e.push_lift AND (wp.week_index*7+ps.day_of_week)>(w.week_index*7+s.day_of_week) AND NOT EXISTS(SELECT 1 FROM public.training_logs tl JOIN public.planned_exercises ex ON ex.id=tl.planned_exercise_id WHERE ex.planned_session_id=ps.id) AND NOT EXISTS(SELECT 1 FROM public.session_schedule_overrides ov WHERE ov.source_id=ps.id AND (ov.cancelled_at IS NOT NULL OR ov.scheduled_date<day)) FOR UPDATE OF x LOOP
   IF f.plan_e1rm_used IS DISTINCT FROM st.plan_e1rm OR f.target_weight_kg IS DISTINCT FROM round(f.plan_e1rm_used*f.push_load_pct/st.rounding_kg)*st.rounding_kg THEN CONTINUE; END IF;
   target=round(p*f.push_load_pct/st.rounding_kg)*st.rounding_kg;
   UPDATE public.planned_exercises SET target_weight_kg=target,plan_e1rm_used=p WHERE id=f.id;
   changes=changes||jsonb_build_array(jsonb_build_object('id',f.id,'before',f.target_weight_kg,'after',target,'plan_before',f.plan_e1rm_used,'revision_after',f.prescription_revision+1));
  END LOOP;
 END IF;
 UPDATE public.push_state SET plan_e1rm=p,miss_streak=misses,last_decision_at=day,paused_reason=CASE WHEN d='paused' THEN reason ELSE paused_reason END,version=version+1,updated_at=now() WHERE athlete_id=w.athlete_id AND lift=e.push_lift RETURNING * INTO st;
 INSERT INTO public.push_log(athlete_id,lift,session_id,exercise_id,mesocycle_id,decision,reason,plan_e1rm_before,plan_e1rm_after,misses_before,misses_after,state_version,changes,evidence,created_by) VALUES(w.athlete_id,e.push_lift,s.id,e.id,w.mesocycle_id,d,reason,COALESCE(e.plan_e1rm_used,p),p,CASE WHEN d='miss' THEN misses-1 WHEN d='reset' THEN 1 ELSE misses END,misses,st.version,changes,COALESCE(evidence,'[]'),auth.uid()) RETURNING id INTO logid;
 RETURN jsonb_build_object('decision',d,'reason',reason,'after',p,'id',logid);
END $$;
REVOKE ALL ON FUNCTION public.decide_push(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_push(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.undo_push(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lg public.push_log; st public.push_state; c jsonb; e public.planned_exercises;
BEGIN
 SELECT * INTO lg FROM public.push_log WHERE id=_id FOR UPDATE;
 IF lg.id IS NULL OR NOT public.is_coach_of(auth.uid(),lg.athlete_id) THEN RAISE EXCEPTION 'Only the coach can undo'; END IF;
 SELECT * INTO st FROM public.push_state WHERE athlete_id=lg.athlete_id AND lift=lg.lift FOR UPDATE;
 IF lg.undone_at IS NOT NULL OR st.version<>lg.state_version THEN RAISE EXCEPTION 'A later decision or coach edit prevents undo'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(lg.changes) LOOP
  SELECT * INTO e FROM public.planned_exercises WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF e.id IS NULL OR e.prescription_revision<>(c->>'revision_after')::integer OR EXISTS(SELECT 1 FROM public.training_logs tl JOIN public.planned_exercises x ON x.id=tl.planned_exercise_id WHERE x.planned_session_id=e.planned_session_id) THEN RAISE EXCEPTION 'Training has started or the coach changed this prescription'; END IF;
  UPDATE public.planned_exercises SET target_weight_kg=(c->>'before')::numeric,plan_e1rm_used=(c->>'plan_before')::numeric WHERE id=e.id;
 END LOOP;
 UPDATE public.push_state SET plan_e1rm=lg.plan_e1rm_before,miss_streak=lg.misses_before,version=version+1,paused_reason=NULL,updated_at=now() WHERE athlete_id=lg.athlete_id AND lift=lg.lift;
 UPDATE public.push_log SET undone_at=now() WHERE id=lg.id;
END $$;
REVOKE ALL ON FUNCTION public.undo_push(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_push(uuid) TO authenticated;