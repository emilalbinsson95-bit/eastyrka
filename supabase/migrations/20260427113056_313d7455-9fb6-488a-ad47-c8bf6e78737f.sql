-- Helper used by triggers (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== MESSAGING + NOTIFICATIONS =====

CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  athlete_id UUID NOT NULL,
  planned_session_id UUID NULL REFERENCES public.planned_sessions(id) ON DELETE CASCADE,
  subject TEXT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX message_threads_general_unique
  ON public.message_threads (coach_id, athlete_id)
  WHERE planned_session_id IS NULL;

CREATE UNIQUE INDEX message_threads_session_unique
  ON public.message_threads (coach_id, athlete_id, planned_session_id)
  WHERE planned_session_id IS NOT NULL;

CREATE INDEX message_threads_coach_idx ON public.message_threads (coach_id, last_message_at DESC);
CREATE INDEX message_threads_athlete_idx ON public.message_threads (athlete_id, last_message_at DESC);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view own threads"
  ON public.message_threads FOR SELECT
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

CREATE POLICY "Coach can create thread with linked athlete"
  ON public.message_threads FOR INSERT
  WITH CHECK (auth.uid() = coach_id AND public.is_coach_of(coach_id, athlete_id));

CREATE POLICY "Athlete can create thread with own coach"
  ON public.message_threads FOR INSERT
  WITH CHECK (auth.uid() = athlete_id AND public.is_coach_of(coach_id, athlete_id));

CREATE POLICY "Participants can update threads"
  ON public.message_threads FOR UPDATE
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_thread_idx ON public.messages (thread_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = messages.thread_id
        AND (auth.uid() = t.coach_id OR auth.uid() = t.athlete_id)
    )
  );

CREATE POLICY "Participants can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = messages.thread_id
        AND (auth.uid() = t.coach_id OR auth.uid() = t.athlete_id)
    )
  );

CREATE POLICY "Recipient can mark messages read"
  ON public.messages FOR UPDATE
  USING (
    auth.uid() <> sender_id
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = messages.thread_id
        AND (auth.uid() = t.coach_id OR auth.uid() = t.athlete_id)
    )
  );

-- notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  link TEXT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Trigger: bump thread + create notification on new message
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient UUID;
  v_sender_name TEXT;
  v_thread RECORD;
BEGIN
  SELECT t.* INTO v_thread FROM public.message_threads t WHERE t.id = NEW.thread_id;
  IF NEW.sender_id = v_thread.coach_id THEN
    v_recipient := v_thread.athlete_id;
  ELSE
    v_recipient := v_thread.coach_id;
  END IF;

  SELECT COALESCE(full_name, 'Someone') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  UPDATE public.message_threads
    SET last_message_at = NEW.created_at, updated_at = NEW.created_at
    WHERE id = NEW.thread_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_recipient,
    'new_message',
    v_sender_name || ' sent you a message',
    LEFT(NEW.body, 140),
    '/messages?thread=' || NEW.thread_id,
    jsonb_build_object('thread_id', NEW.thread_id, 'sender_id', NEW.sender_id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- Trigger: notify coach when athlete logs first set of new training day
CREATE OR REPLACE FUNCTION public.notify_coach_on_training_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing INT;
  v_athlete_name TEXT;
  v_coach RECORD;
BEGIN
  SELECT COUNT(*) INTO v_existing
    FROM public.training_logs
    WHERE athlete_id = NEW.athlete_id AND date = NEW.date AND id <> NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Athlete') INTO v_athlete_name
    FROM public.profiles WHERE id = NEW.athlete_id;

  FOR v_coach IN
    SELECT coach_id FROM public.coach_athletes WHERE athlete_id = NEW.athlete_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_coach.coach_id,
      'session_started',
      v_athlete_name || ' started training',
      to_char(NEW.date, 'Dy Mon DD'),
      '/coach/athletes/' || NEW.athlete_id,
      jsonb_build_object('athlete_id', NEW.athlete_id, 'date', NEW.date)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_coach_on_training_log
AFTER INSERT ON public.training_logs
FOR EACH ROW EXECUTE FUNCTION public.notify_coach_on_training_log();

-- Trigger: notify coach on low readiness (daily_form <= 4)
CREATE OR REPLACE FUNCTION public.notify_coach_on_low_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_name TEXT;
  v_coach RECORD;
BEGIN
  IF NEW.daily_form > 4 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Athlete') INTO v_athlete_name
    FROM public.profiles WHERE id = NEW.athlete_id;

  FOR v_coach IN
    SELECT coach_id FROM public.coach_athletes WHERE athlete_id = NEW.athlete_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_coach.coach_id,
      'low_readiness',
      v_athlete_name || ' flagged low readiness',
      'Daily form: ' || NEW.daily_form || '/10' ||
        CASE WHEN NEW.notes IS NOT NULL AND length(NEW.notes) > 0
             THEN ' — ' || LEFT(NEW.notes, 100) ELSE '' END,
      '/coach/athletes/' || NEW.athlete_id,
      jsonb_build_object('athlete_id', NEW.athlete_id, 'date', NEW.date, 'daily_form', NEW.daily_form)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_coach_on_low_readiness
AFTER INSERT ON public.readiness_surveys
FOR EACH ROW EXECUTE FUNCTION public.notify_coach_on_low_readiness();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- updated_at trigger
CREATE TRIGGER update_message_threads_updated_at
BEFORE UPDATE ON public.message_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();