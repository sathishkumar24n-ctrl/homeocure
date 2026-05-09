
-- Pin search_path on all functions
alter function public.touch_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- Revoke direct execute on trigger-only functions from everyone
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- has_role: only authenticated users (used inside RLS policies)
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
