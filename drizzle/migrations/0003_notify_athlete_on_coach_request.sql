CREATE OR REPLACE FUNCTION public.notify_athlete_on_coach_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.coach_id <> NEW.athlete_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (NEW.athlete_id, 'coach_invite', 'Coach request',
      COALESCE((SELECT full_name FROM public.profiles WHERE id = NEW.coach_id), 'A coach') || ' wants to connect with you',
      '/me', jsonb_build_object('coach_id', NEW.coach_id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_athlete_on_coach_request AFTER INSERT ON public.coach_athletes FOR EACH ROW EXECUTE FUNCTION public.notify_athlete_on_coach_request();