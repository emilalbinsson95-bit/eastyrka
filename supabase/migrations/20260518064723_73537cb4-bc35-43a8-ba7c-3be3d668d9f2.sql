-- Add optional tag column to coach_athletes so coaches can label athletes (e.g. jersey numbers, groups)
ALTER TABLE public.coach_athletes
ADD COLUMN tag TEXT;

-- Create an index on tag for fast filtering
CREATE INDEX idx_coach_athletes_tag ON public.coach_athletes(tag);

-- Allow coaches to update the tag on their own links
CREATE POLICY "Coach can update tag on own links"
ON public.coach_athletes
FOR UPDATE
TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());