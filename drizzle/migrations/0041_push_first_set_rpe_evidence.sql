DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.decide_push(uuid)'::regprocedure) INTO definition;
 definition=replace(definition,'abs(weight_kg-prescribed_weight_kg)<0.001 AND exercise=e.exercise','(CASE WHEN e.rules_version=''push-2.0'' THEN (set_number<>1 OR abs(weight_kg-prescribed_weight_kg)<0.001) ELSE abs(weight_kg-prescribed_weight_kg)<0.001 END) AND exercise=e.exercise');
 IF position('CASE WHEN e.rules_version=''push-2.0''' IN definition)=0 THEN RAISE EXCEPTION 'Confirmation selector not found'; END IF;
 definition=replace(definition,'ELSIF p*(1+st.step_pct/100)>e.push_block_start', 'ELSIF e.rules_version=''push-2.0'' AND (e.target_rpe IS NULL OR EXISTS(SELECT 1 FROM public.training_logs t WHERE t.planned_exercise_id=e.id AND NOT t.is_warmup_reference AND t.set_number BETWEEN 1 AND e.target_sets AND (t.rpe>e.target_rpe OR t.weight_kg<e.target_weight_kg-0.001))) THEN d=''hold'';reason=''load_reduced_or_rpe_high'';
  ELSIF p*(1+st.step_pct/100)>e.push_block_start');
 definition=replace(definition,'state_version,changes,evidence,created_by,decision_date) VALUES','state_version,changes,evidence,created_by,decision_date,rules_version) VALUES');
 definition=replace(definition,'auth.uid(),day) RETURNING id','auth.uid(),day,COALESCE(e.rules_version,''push-1.0'')) RETURNING id');
 EXECUTE definition;
END $$;