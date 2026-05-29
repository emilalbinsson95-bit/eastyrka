
-- 1) Lock down audit history tables: only triggers (SECURITY DEFINER) should write.
DROP POLICY IF EXISTS "Athlete inserts own pb history" ON public.endurance_pb_history;
DROP POLICY IF EXISTS "Athlete deletes own pb history" ON public.endurance_pb_history;
DROP POLICY IF EXISTS "Coach inserts athlete pb history" ON public.endurance_pb_history;

DROP POLICY IF EXISTS "Coach can insert athlete baseline history" ON public.baseline_history;
DROP POLICY IF EXISTS "Coach can delete athlete baseline history" ON public.baseline_history;

-- 2) Defense in depth on user_roles: explicitly forbid self-granting any role
--    other than athlete/patient (coach/physio/admin must never be self-grantable).
CREATE POLICY "Block self-grant of privileged roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (role IN ('athlete'::public.app_role, 'patient'::public.app_role));

-- 3) Realtime: restrict channel subscriptions so a user can only listen on
--    their own per-user topics (notifications-<uid>, messages-<uid>).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to their own realtime topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = 'notifications-' || auth.uid()::text
    OR realtime.topic() = 'messages-' || auth.uid()::text
  )
);
