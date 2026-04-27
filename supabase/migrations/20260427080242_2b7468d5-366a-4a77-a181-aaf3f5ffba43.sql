
-- Lock down set_updated_at and handle_new_user search_path
alter function public.set_updated_at() set search_path = public;

-- handle_new_user already has search_path set; nothing to change but keep idempotent
-- Revoke direct execute on security-definer helpers from anon and authenticated.
-- They are only called from inside RLS policies (which run as the policy owner), so the public API surface doesn't need execute.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.is_coach_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
