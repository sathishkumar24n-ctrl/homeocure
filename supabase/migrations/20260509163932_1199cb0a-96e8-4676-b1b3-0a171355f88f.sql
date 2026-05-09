
-- Helper: is this user the owner of the given clinic?
create or replace function public.is_clinic_owner(_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinics
    where id = _clinic_id and owner_id = auth.uid()
  )
$$;

revoke execute on function public.is_clinic_owner(uuid) from public, anon;

-- Patients
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- linked patient account, optional
  full_name text not null,
  gender text check (gender in ('male','female','other')),
  date_of_birth date,
  phone text,
  email text,
  address text,
  occupation text,
  allergies text,
  chronic_conditions text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patients_clinic_idx on public.patients (clinic_id, created_at desc);
create index patients_name_idx on public.patients (clinic_id, lower(full_name));

alter table public.patients enable row level security;

create trigger patients_touch_updated_at
before update on public.patients
for each row execute function public.touch_updated_at();

-- RLS: clinic owner full access; linked patient can read own row
create policy "Clinic owner can view patients"
  on public.patients for select to authenticated
  using (public.is_clinic_owner(clinic_id) or user_id = auth.uid());

create policy "Clinic owner can insert patients"
  on public.patients for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can update patients"
  on public.patients for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can delete patients"
  on public.patients for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

-- Patient visits / history
create table public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  visit_date date not null default current_date,
  chief_complaint text,
  symptoms text,
  constitution text,
  miasm text,
  modalities text,
  prescription text,
  dosage text,
  fee numeric(10,2),
  next_follow_up date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patient_visits_patient_idx on public.patient_visits (patient_id, visit_date desc);
create index patient_visits_followup_idx on public.patient_visits (clinic_id, next_follow_up);

alter table public.patient_visits enable row level security;

create trigger patient_visits_touch_updated_at
before update on public.patient_visits
for each row execute function public.touch_updated_at();

create policy "Clinic owner or linked patient can view visits"
  on public.patient_visits for select to authenticated
  using (
    public.is_clinic_owner(clinic_id)
    or exists (
      select 1 from public.patients p
      where p.id = patient_visits.patient_id and p.user_id = auth.uid()
    )
  );

create policy "Clinic owner can insert visits"
  on public.patient_visits for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can update visits"
  on public.patient_visits for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can delete visits"
  on public.patient_visits for delete to authenticated
  using (public.is_clinic_owner(clinic_id));
