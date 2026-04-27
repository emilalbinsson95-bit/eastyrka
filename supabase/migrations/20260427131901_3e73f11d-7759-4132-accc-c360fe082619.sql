
DO $$
DECLARE
  v_coach_id uuid := '11111111-1111-1111-1111-111111111111';
  v_athlete_id uuid := '22222222-2222-2222-2222-222222222222';
  v_physio_id uuid := '33333333-3333-3333-3333-333333333333';
  v_patient_id uuid := '44444444-4444-4444-4444-444444444444';
  v_day date;
  v_start date := CURRENT_DATE - INTERVAL '90 days';
  v_session_id uuid;
  v_exercises text[] := ARRAY['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];
  v_ex text;
  v_set int;
  v_reps int;
  v_rpe numeric;
  v_weight numeric;
  v_baseline numeric;
  v_drift numeric;
  v_fatigue numeric;
  v_pain int;
  v_phase int;
  v_title text;
  v_pain_base numeric;
  v_status text;
  v_ex_list text[];
  i int;
BEGIN
  -- auth.users
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES
    (v_coach_id, '00000000-0000-0000-0000-000000000000', 'demo.coach@ea-test.local', crypt('Demo1234!', gen_salt('bf')), now(), '{"full_name":"Demo Coach","role":"coach"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
    (v_athlete_id, '00000000-0000-0000-0000-000000000000', 'demo.athlete@ea-test.local', crypt('Demo1234!', gen_salt('bf')), now(), '{"full_name":"Demo Athlete","role":"athlete"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
    (v_physio_id, '00000000-0000-0000-0000-000000000000', 'demo.physio@ea-test.local', crypt('Demo1234!', gen_salt('bf')), now(), '{"full_name":"Demo Physio","role":"physio"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
    (v_patient_id, '00000000-0000-0000-0000-000000000000', 'demo.patient@ea-test.local', crypt('Demo1234!', gen_salt('bf')), now(), '{"full_name":"Demo Patient","role":"patient"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated', now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_coach_id, v_coach_id::text, jsonb_build_object('sub', v_coach_id::text, 'email', 'demo.coach@ea-test.local', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_athlete_id, v_athlete_id::text, jsonb_build_object('sub', v_athlete_id::text, 'email', 'demo.athlete@ea-test.local', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_physio_id, v_physio_id::text, jsonb_build_object('sub', v_physio_id::text, 'email', 'demo.physio@ea-test.local', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_patient_id, v_patient_id::text, jsonb_build_object('sub', v_patient_id::text, 'email', 'demo.patient@ea-test.local', 'email_verified', true), 'email', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, weight_class) VALUES
    (v_coach_id, 'Demo Coach', NULL),
    (v_athlete_id, 'Alex Athlete', '83kg'),
    (v_physio_id, 'Dr. Demo Physio', NULL),
    (v_patient_id, 'Jordan Patient', NULL)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_coach_id, 'coach'),
    (v_athlete_id, 'athlete'),
    (v_physio_id, 'physio'),
    (v_patient_id, 'patient')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.coach_athletes (coach_id, athlete_id) VALUES (v_coach_id, v_athlete_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.physio_patients (physio_id, patient_id) VALUES (v_physio_id, v_patient_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.baselines (athlete_id, exercise, one_rm_kg) VALUES
    (v_athlete_id, 'Squat', 180),
    (v_athlete_id, 'Bench Press', 130),
    (v_athlete_id, 'Deadlift', 220),
    (v_athlete_id, 'Overhead Press', 80)
  ON CONFLICT DO NOTHING;

  -- Reset prior demo data
  DELETE FROM public.training_logs WHERE athlete_id = v_athlete_id;
  DELETE FROM public.readiness_surveys WHERE athlete_id = v_athlete_id;
  DELETE FROM public.patient_session_feedback WHERE patient_id = v_patient_id;
  DELETE FROM public.rehab_exercises WHERE session_id IN (SELECT id FROM public.rehab_sessions WHERE patient_id = v_patient_id);
  DELETE FROM public.rehab_sessions WHERE patient_id = v_patient_id;

  -- Training: Mon/Tue/Thu/Fri
  v_day := v_start;
  WHILE v_day <= CURRENT_DATE LOOP
    IF EXTRACT(DOW FROM v_day) IN (1,2,4,5) THEN
      v_ex := v_exercises[(EXTRACT(DOW FROM v_day)::int % 4) + 1];
      v_baseline := CASE v_ex WHEN 'Squat' THEN 180 WHEN 'Bench Press' THEN 130 WHEN 'Deadlift' THEN 220 ELSE 80 END;
      v_drift := 0.85 + ((v_day - v_start)::numeric / 90.0) * 0.18 + (random() - 0.5) * 0.06;

      INSERT INTO public.readiness_surveys (athlete_id, date, work_stress, life_stress, fatigue, daily_form, sleep_hours, bodyweight_kg)
      VALUES (v_athlete_id, v_day,
        3 + floor(random()*5)::int,
        2 + floor(random()*5)::int,
        3 + floor(random()*5)::int,
        GREATEST(2, LEAST(9, 5 + floor(random()*4)::int)),
        6.5 + random()*2,
        82 + (random()-0.5));

      FOR v_set IN 1..4 LOOP
        v_fatigue := 1.0 - ((v_set-1) * 0.025);
        v_reps := 5;
        v_rpe := LEAST(10, 7 + (v_set-1)*0.7 + (random()-0.5)*0.4);
        v_weight := ROUND( (v_baseline * v_drift * v_fatigue) / (1 + (5 + (10 - v_rpe))/30.0) / 2.5 ) * 2.5;

        INSERT INTO public.training_logs (athlete_id, date, exercise, set_number, reps, weight_kg, rpe)
        VALUES (v_athlete_id, v_day, v_ex, v_set, v_reps, v_weight, ROUND(v_rpe*2)/2);
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  -- Rehab: Mon/Thu, 5 progressive phases
  v_day := v_start;
  WHILE v_day <= CURRENT_DATE LOOP
    IF EXTRACT(DOW FROM v_day) IN (1,4) THEN
      v_phase := LEAST(5, 1 + ((v_day - v_start) / 18)::int);
      v_title := (ARRAY['Knee mobility + quad activation','Hip stability + glute med','Lower body strength progression','Single leg control','Return to running prep'])[v_phase];
      v_ex_list := CASE v_phase
        WHEN 1 THEN ARRAY['Heel slides','Quad sets','Terminal knee extension']
        WHEN 2 THEN ARRAY['Side-lying clamshells','Single leg bridge','Banded monster walk']
        WHEN 3 THEN ARRAY['Goblet squat','Romanian deadlift','Step-up']
        WHEN 4 THEN ARRAY['Single leg balance','Bulgarian split squat','Lateral step-down']
        ELSE        ARRAY['Pogo hops','A-skip','Single leg hop & stick']
      END;
      v_pain_base := GREATEST(1, 7 - ((v_day - v_start)::numeric / 90.0) * 5.5);
      v_status := CASE WHEN v_day < CURRENT_DATE - 3 THEN 'completed' ELSE 'planned' END;
      v_pain := GREATEST(0, LEAST(10, ROUND(v_pain_base + (random()-0.5)*1.5)::int));

      INSERT INTO public.rehab_sessions (id, physio_id, patient_id, session_date, title, status, overall_pain, subjective_notes, objective_notes)
      VALUES (gen_random_uuid(), v_physio_id, v_patient_id, v_day, v_title, v_status, v_pain,
        'Patient reports ' || CASE WHEN v_pain < 3 THEN 'minimal discomfort' WHEN v_pain < 6 THEN 'moderate stiffness' ELSE 'sharp pain on loading' END || '.',
        'ROM improving. Single-leg control progressing.')
      RETURNING id INTO v_session_id;

      FOR i IN 1..array_length(v_ex_list, 1) LOOP
        INSERT INTO public.rehab_exercises (session_id, order_index, name, sets, reps, hold_seconds, load_kg, pain_rating, perceived_exertion, rom_notes, tolerance)
        VALUES (v_session_id, i, v_ex_list[i],
          3, 10 + floor(random()*6)::int,
          CASE WHEN v_ex_list[i] ILIKE '%balance%' OR v_ex_list[i] = 'Quad sets' THEN 30 ELSE NULL END,
          CASE WHEN v_phase >= 3 THEN 5 + v_phase*2.5 ELSE NULL END,
          GREATEST(0, LEAST(10, ROUND(v_pain_base * 0.7 + (random()-0.5))::int)),
          GREATEST(2, LEAST(9, 4 + v_phase + floor(random()*2)::int)),
          'Full ROM tolerated',
          CASE WHEN v_pain > 5 THEN 'guarded' WHEN v_pain > 2 THEN 'tolerated' ELSE 'good' END);
      END LOOP;

      IF v_status = 'completed' THEN
        INSERT INTO public.patient_session_feedback (session_id, patient_id, pain_after, stiffness, swelling, sleep_quality, comments)
        VALUES (v_session_id, v_patient_id,
          GREATEST(0, LEAST(10, ROUND(v_pain_base * 0.6 + (random()-0.5))::int)),
          GREATEST(0, LEAST(10, ROUND(v_pain_base * 0.7)::int)),
          GREATEST(0, LEAST(10, ROUND(v_pain_base * 0.4)::int)),
          5 + floor(random()*5)::int,
          CASE WHEN random() < 0.3 THEN 'Felt good after session.' ELSE NULL END);
      END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;
END $$;
