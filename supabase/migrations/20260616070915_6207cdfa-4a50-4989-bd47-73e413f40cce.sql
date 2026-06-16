
-- 1. Remove coach access to external_integrations (contains OAuth tokens)
DROP POLICY IF EXISTS "Coach views athlete integrations" ON public.external_integrations;

-- 2. Remove message_threads from realtime publication (not subscribed by client; avoid cross-user broadcast risk)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_threads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.message_threads';
  END IF;
END $$;

-- 3. Explicit restrictive deny on user_roles UPDATE to prevent privilege escalation via upserts
CREATE POLICY "Block updates to user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);
