-- Rate-limit table for patient self-link attempts
create table if not exists public.patient_link_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);

create index if not exists patient_link_attempts_user_time_idx
  on public.patient_link_attempts (user_id, attempted_at desc);

alter table public.patient_link_attempts enable row level security;

-- Users may view their own attempts (no insert/update/delete from clients;
-- the server uses the service role to write entries).
create policy "Users can view their own link attempts"
  on public.patient_link_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

-- Revoke public EXECUTE on SECURITY DEFINER helper functions so they cannot
-- be invoked by anonymous PostgREST callers. Authenticated role keeps access.
revoke execute on function public.is_clinic_owner(uuid) from public, anon;
revoke execute on function public.is_appointment_patient(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.is_clinic_owner(uuid) to authenticated;
grant execute on function public.is_appointment_patient(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
