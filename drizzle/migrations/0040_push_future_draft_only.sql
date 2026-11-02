DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.decide_push(uuid)'::regprocedure) INTO definition;
 IF position('WHERE wp.mesocycle_id=w.mesocycle_id AND x.push_lift=e.push_lift' IN definition)=0 THEN RAISE EXCEPTION 'Expected future prescription selector missing'; END IF;
 definition=replace(definition,'WHERE wp.mesocycle_id=w.mesocycle_id AND x.push_lift=e.push_lift','WHERE wp.mesocycle_id=w.mesocycle_id AND wp.status=''draft'' AND NOT wp.is_deload AND COALESCE(wp.training_phase,''working'') NOT IN (''deload'',''ramp'',''peak'',''taper'') AND x.push_lift=e.push_lift');
 EXECUTE definition;
END $$;