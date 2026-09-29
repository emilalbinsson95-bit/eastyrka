ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_messages_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_coach_invites_enabled boolean NOT NULL DEFAULT false;

CREATE POLICY "Coaches view own pending invitations" ON public.coach_athletes FOR SELECT TO authenticated USING (coach_id = auth.uid() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.admin_athlete_diagnostics(_query text DEFAULT NULL)
RETURNS TABLE (id uuid, full_name text, email text, last_training_date date, training_set_count bigint, plan_count bigint, coaches text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, u.email::text,
    (SELECT max(l.date) FROM public.training_logs l WHERE l.athlete_id = p.id),
    (SELECT count(*) FROM public.training_logs l WHERE l.athlete_id = p.id),
    (SELECT count(*) FROM public.week_plans w WHERE w.athlete_id = p.id),
    ARRAY(SELECT coalesce(cp.full_name, 'Unnamed coach') FROM public.coach_athletes ca JOIN public.profiles cp ON cp.id = ca.coach_id WHERE ca.athlete_id = p.id AND ca.status = 'accepted' ORDER BY cp.full_name)
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'athlete'::public.app_role)
    AND (_query IS NULL OR p.full_name ILIKE '%' || _query || '%' OR u.email ILIKE '%' || _query || '%')
  ORDER BY p.full_name NULLS LAST, p.id
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.admin_athlete_diagnostics(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_athlete_diagnostics(text) TO authenticated;