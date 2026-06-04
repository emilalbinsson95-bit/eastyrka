
CREATE TYPE public.external_provider AS ENUM ('garmin','strava');

CREATE TABLE public.external_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.external_provider NOT NULL,
  provider_user_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_integrations TO authenticated;
GRANT ALL ON public.external_integrations TO service_role;

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athlete manages own integrations (select)"
  ON public.external_integrations FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
CREATE POLICY "Athlete manages own integrations (insert)"
  ON public.external_integrations FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete manages own integrations (update)"
  ON public.external_integrations FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid()) WITH CHECK (athlete_id = auth.uid());
CREATE POLICY "Athlete manages own integrations (delete)"
  ON public.external_integrations FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

-- Coaches can see connection status (but tokens are not exposed via UI)
CREATE POLICY "Coach views athlete integrations"
  ON public.external_integrations FOR SELECT TO authenticated
  USING (public.is_coach_of(auth.uid(), athlete_id));

-- Track origin of imported endurance sessions so we don't double-import
ALTER TABLE public.endurance_sessions
  ADD COLUMN IF NOT EXISTS external_provider public.external_provider,
  ADD COLUMN IF NOT EXISTS external_activity_id text;

CREATE UNIQUE INDEX IF NOT EXISTS endurance_sessions_external_uidx
  ON public.endurance_sessions (athlete_id, external_provider, external_activity_id)
  WHERE external_activity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER external_integrations_touch
  BEFORE UPDATE ON public.external_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
