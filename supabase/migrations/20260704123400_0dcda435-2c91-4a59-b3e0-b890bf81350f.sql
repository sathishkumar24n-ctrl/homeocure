-- Lock down write access on tables that should only be written to by the server (service_role).
-- Revoke direct write privileges from anon/authenticated so PostgREST cannot perform writes
-- even in the absence of matching RLS policies. Add explicit restrictive-deny policies as
-- defense in depth. service_role bypasses RLS and retains full access.

REVOKE INSERT, UPDATE, DELETE ON public.follow_up_reminders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.patient_link_attempts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

-- Explicit deny policies for authenticated writes (belt-and-suspenders in case grants are re-added).
CREATE POLICY "Deny writes to follow_up_reminders from clients (INSERT)"
  ON public.follow_up_reminders FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny writes to follow_up_reminders from clients (UPDATE)"
  ON public.follow_up_reminders FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny writes to follow_up_reminders from clients (DELETE)"
  ON public.follow_up_reminders FOR DELETE TO authenticated USING (false);

CREATE POLICY "Deny writes to patient_link_attempts from clients (INSERT)"
  ON public.patient_link_attempts FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny writes to patient_link_attempts from clients (UPDATE)"
  ON public.patient_link_attempts FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny writes to patient_link_attempts from clients (DELETE)"
  ON public.patient_link_attempts FOR DELETE TO authenticated USING (false);

CREATE POLICY "Deny writes to user_roles from clients (INSERT)"
  ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny writes to user_roles from clients (UPDATE)"
  ON public.user_roles FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny writes to user_roles from clients (DELETE)"
  ON public.user_roles FOR DELETE TO authenticated USING (false);