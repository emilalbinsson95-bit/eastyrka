CREATE OR REPLACE FUNCTION public.is_accepted_athlete_of(_coach_id uuid, _athlete_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.coach_athletes WHERE coach_id = _coach_id AND athlete_id = _athlete_id AND status = 'accepted')
$$;

CREATE TABLE public.coach_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  coach_name text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  recipient_ids uuid[],
  visible_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_notices_coach_idx ON public.coach_notices (coach_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.coach_notices TO authenticated;
GRANT ALL ON public.coach_notices TO service_role;
ALTER TABLE public.coach_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches read own notices" ON public.coach_notices FOR SELECT TO authenticated
  USING (coach_id = auth.uid());
CREATE POLICY "Coaches create notices" ON public.coach_notices FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Coaches delete own notices" ON public.coach_notices FOR DELETE TO authenticated
  USING (coach_id = auth.uid());
CREATE POLICY "Athletes read current notices from their coach" ON public.coach_notices FOR SELECT TO authenticated
  USING (
    public.is_accepted_athlete_of(coach_id, auth.uid())
    AND (recipient_ids IS NULL OR auth.uid() = ANY (recipient_ids))
    AND (visible_until IS NULL OR visible_until >= (now() AT TIME ZONE 'Europe/Stockholm')::date)
  );

CREATE TABLE public.coach_notice_reads (
  notice_id uuid NOT NULL REFERENCES public.coach_notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id)
);
GRANT SELECT, INSERT ON public.coach_notice_reads TO authenticated;
GRANT ALL ON public.coach_notice_reads TO service_role;
ALTER TABLE public.coach_notice_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notice reads" ON public.coach_notice_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.coach_notices n WHERE n.id = notice_id AND n.coach_id = auth.uid()));
CREATE POLICY "Users mark notices read" ON public.coach_notice_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());