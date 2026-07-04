REVOKE ALL ON FUNCTION public.get_follow_up_scheduler_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_follow_up_scheduler_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_follow_up_scheduler_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_up_scheduler_status() TO service_role;