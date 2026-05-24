
REVOKE EXECUTE ON FUNCTION public.handle_new_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_baseline_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_coach_on_low_readiness() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_coach_on_training_log() FROM PUBLIC, anon, authenticated;
