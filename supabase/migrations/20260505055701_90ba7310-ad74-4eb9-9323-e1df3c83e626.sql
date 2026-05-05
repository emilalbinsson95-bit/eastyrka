-- Allow physio<->patient direct messaging using the existing message_threads table.
-- We reuse coach_id (=physio) and athlete_id (=patient) columns; RLS gates access via is_physio_of.

CREATE POLICY "Physio can create thread with linked patient"
ON public.message_threads
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = coach_id
  AND public.is_physio_of(coach_id, athlete_id)
);

CREATE POLICY "Patient can create thread with own physio"
ON public.message_threads
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = athlete_id
  AND public.is_physio_of(coach_id, athlete_id)
);
