WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY athlete_id, lift, window_end
    ORDER BY (coach_decision <> 'pending') DESC, (outcome_status_next IS NOT NULL) DESC, created_at DESC
  ) AS rn
  FROM public.eak_meso_evaluations
)
DELETE FROM public.eak_meso_evaluations e USING ranked r WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS eak_meso_evaluations_athlete_lift_window_key
  ON public.eak_meso_evaluations (athlete_id, lift, window_end);