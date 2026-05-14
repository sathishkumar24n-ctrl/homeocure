-- Helper: is the current user the patient on this patient_id?
create or replace function public.is_appointment_patient(_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patients
    where id = _patient_id and user_id = auth.uid()
  )
$$;

-- Allow patients to view their own appointments
create policy "Patient can view own appointments"
on public.appointments for select
to authenticated
using (public.is_appointment_patient(patient_id));

-- Allow patients to book (insert) appointments for themselves
create policy "Patient can book own appointments"
on public.appointments for insert
to authenticated
with check (public.is_appointment_patient(patient_id));

-- Allow patients to reschedule (update) own appointments — only if still scheduled
create policy "Patient can reschedule own appointments"
on public.appointments for update
to authenticated
using (public.is_appointment_patient(patient_id))
with check (public.is_appointment_patient(patient_id));

-- Allow patients to cancel (delete) their own appointments
create policy "Patient can cancel own appointments"
on public.appointments for delete
to authenticated
using (public.is_appointment_patient(patient_id));

-- Allow patients to view clinics where they have a patient record (for booking UI)
create policy "Patient can view linked clinics"
on public.clinics for select
to authenticated
using (
  exists (
    select 1 from public.patients p
    where p.clinic_id = clinics.id and p.user_id = auth.uid()
  )
);
