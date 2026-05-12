
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  status text not null default 'scheduled',
  reason text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_clinic_scheduled_idx
  on public.appointments (clinic_id, scheduled_at);

create index appointments_patient_idx
  on public.appointments (patient_id);

alter table public.appointments enable row level security;

create policy "Clinic owner can view appointments"
  on public.appointments for select to authenticated
  using (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can insert appointments"
  on public.appointments for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can update appointments"
  on public.appointments for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can delete appointments"
  on public.appointments for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

create trigger appointments_touch_updated_at
  before update on public.appointments
  for each row execute function public.touch_updated_at();
