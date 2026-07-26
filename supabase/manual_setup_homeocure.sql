-- HomeoCare one-time Supabase setup.
-- Run this in Supabase Dashboard > SQL Editor for the project used by the app.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'doctor', 'staff', 'patient');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  clinic_id uuid references public.clinics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, clinic_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_full_name text;
  v_phone text;
  v_clinic_name text;
  v_clinic_id uuid;
  v_requested text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_phone := new.raw_user_meta_data->>'phone';
  v_clinic_name := new.raw_user_meta_data->>'clinic_name';
  v_requested := new.raw_user_meta_data->>'role';

  if v_requested = 'doctor' then
    v_role := 'doctor'::public.app_role;
  else
    v_role := 'patient'::public.app_role;
  end if;

  insert into public.profiles (id, full_name, phone)
  values (new.id, v_full_name, v_phone)
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone;

  if v_role = 'doctor' and v_clinic_name is not null and length(trim(v_clinic_name)) > 0 then
    insert into public.clinics (name, owner_id)
    values (trim(v_clinic_name), new.id)
    returning id into v_clinic_id;
  end if;

  insert into public.user_roles (user_id, role, clinic_id)
  values (new.id, v_role, v_clinic_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
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

create index if not exists patients_clinic_idx on public.patients (clinic_id, created_at desc);
create index if not exists patients_name_idx on public.patients (clinic_id, lower(full_name));
drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
before update on public.patients
for each row execute function public.touch_updated_at();

create table if not exists public.patient_visits (
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

create index if not exists patient_visits_patient_idx on public.patient_visits (patient_id, visit_date desc);
create index if not exists patient_visits_followup_idx on public.patient_visits (clinic_id, next_follow_up);
drop trigger if exists patient_visits_touch_updated_at on public.patient_visits;
create trigger patient_visits_touch_updated_at
before update on public.patient_visits
for each row execute function public.touch_updated_at();

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  status text not null default 'scheduled',
  reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_clinic_scheduled_idx on public.appointments (clinic_id, scheduled_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id);
drop trigger if exists appointments_touch_updated_at on public.appointments;
create trigger appointments_touch_updated_at
before update on public.appointments
for each row execute function public.touch_updated_at();

create table if not exists public.remedies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  potency text,
  form text,
  batch_number text,
  quantity numeric not null default 0,
  unit text not null default 'units',
  low_stock_threshold numeric not null default 5,
  supplier text,
  expiry_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_remedies_clinic on public.remedies(clinic_id);
create index if not exists idx_remedies_low_stock on public.remedies(clinic_id) where quantity <= low_stock_threshold;
drop trigger if exists remedies_touch_updated_at on public.remedies;
create trigger remedies_touch_updated_at
before update on public.remedies
for each row execute function public.touch_updated_at();

create table if not exists public.follow_up_reminders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  follow_up_date date not null,
  channel text not null default 'whatsapp',
  status text not null default 'pending',
  provider_message_id text,
  error text,
  sent_to text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (visit_id, follow_up_date, channel)
);

create index if not exists idx_follow_up_reminders_clinic
  on public.follow_up_reminders(clinic_id, follow_up_date desc);

create table if not exists public.patient_link_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);

create index if not exists patient_link_attempts_user_time_idx
  on public.patient_link_attempts (user_id, attempted_at desc);

create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  operation text not null,
  recipient text,
  phone_number_id text,
  template_name text,
  request_url text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  provider_message_id text,
  duration_ms integer,
  success boolean not null default false,
  meta_error_code text,
  meta_error_type text,
  meta_error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_message_logs_clinic_created
  on public.whatsapp_message_logs(clinic_id, created_at desc);
create index if not exists idx_whatsapp_message_logs_success_created
  on public.whatsapp_message_logs(success, created_at desc);

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

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.user_roles enable row level security;
alter table public.patients enable row level security;
alter table public.patient_visits enable row level security;
alter table public.appointments enable row level security;
alter table public.remedies enable row level security;
alter table public.follow_up_reminders enable row level security;
alter table public.patient_link_attempts enable row level security;
alter table public.whatsapp_message_logs enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can view their own roles" on public.user_roles;
create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owners can view their clinic" on public.clinics;
create policy "Owners can view their clinic"
  on public.clinics for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Owners can update their clinic" on public.clinics;
create policy "Owners can update their clinic"
  on public.clinics for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Doctors can create their own clinic" on public.clinics;
create policy "Doctors can create their own clinic"
  on public.clinics for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Patient can view linked clinics" on public.clinics;
create policy "Patient can view linked clinics"
  on public.clinics for select to authenticated
  using (exists (
    select 1 from public.patients p
    where p.clinic_id = clinics.id and p.user_id = auth.uid()
  ));

drop policy if exists "Clinic owner can view patients" on public.patients;
create policy "Clinic owner can view patients"
  on public.patients for select to authenticated
  using (public.is_clinic_owner(clinic_id) or user_id = auth.uid());

drop policy if exists "Clinic owner can insert patients" on public.patients;
create policy "Clinic owner can insert patients"
  on public.patients for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can update patients" on public.patients;
create policy "Clinic owner can update patients"
  on public.patients for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can delete patients" on public.patients;
create policy "Clinic owner can delete patients"
  on public.patients for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner or linked patient can view visits" on public.patient_visits;
create policy "Clinic owner or linked patient can view visits"
  on public.patient_visits for select to authenticated
  using (
    public.is_clinic_owner(clinic_id)
    or exists (
      select 1 from public.patients p
      where p.id = patient_visits.patient_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Clinic owner can insert visits" on public.patient_visits;
create policy "Clinic owner can insert visits"
  on public.patient_visits for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can update visits" on public.patient_visits;
create policy "Clinic owner can update visits"
  on public.patient_visits for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can delete visits" on public.patient_visits;
create policy "Clinic owner can delete visits"
  on public.patient_visits for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can view appointments" on public.appointments;
create policy "Clinic owner can view appointments"
  on public.appointments for select to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can insert appointments" on public.appointments;
create policy "Clinic owner can insert appointments"
  on public.appointments for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can update appointments" on public.appointments;
create policy "Clinic owner can update appointments"
  on public.appointments for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can delete appointments" on public.appointments;
create policy "Clinic owner can delete appointments"
  on public.appointments for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Patient can view own appointments" on public.appointments;
create policy "Patient can view own appointments"
  on public.appointments for select to authenticated
  using (public.is_appointment_patient(patient_id));

drop policy if exists "Patient can book own appointments" on public.appointments;
create policy "Patient can book own appointments"
  on public.appointments for insert to authenticated
  with check (public.is_appointment_patient(patient_id));

drop policy if exists "Patient can reschedule own appointments" on public.appointments;
create policy "Patient can reschedule own appointments"
  on public.appointments for update to authenticated
  using (public.is_appointment_patient(patient_id))
  with check (public.is_appointment_patient(patient_id));

drop policy if exists "Patient can cancel own appointments" on public.appointments;
create policy "Patient can cancel own appointments"
  on public.appointments for delete to authenticated
  using (public.is_appointment_patient(patient_id));

drop policy if exists "Clinic owner can view remedies" on public.remedies;
create policy "Clinic owner can view remedies"
  on public.remedies for select to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can insert remedies" on public.remedies;
create policy "Clinic owner can insert remedies"
  on public.remedies for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can update remedies" on public.remedies;
create policy "Clinic owner can update remedies"
  on public.remedies for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can delete remedies" on public.remedies;
create policy "Clinic owner can delete remedies"
  on public.remedies for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Clinic owner can view reminders" on public.follow_up_reminders;
create policy "Clinic owner can view reminders"
  on public.follow_up_reminders for select to authenticated
  using (public.is_clinic_owner(clinic_id));

drop policy if exists "Users can view their own link attempts" on public.patient_link_attempts;
create policy "Users can view their own link attempts"
  on public.patient_link_attempts for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Clinic owner can view WhatsApp logs" on public.whatsapp_message_logs;
create policy "Clinic owner can view WhatsApp logs"
  on public.whatsapp_message_logs for select to authenticated
  using (clinic_id is not null and public.is_clinic_owner(clinic_id));

revoke execute on function public.is_clinic_owner(uuid) from public, anon;
revoke execute on function public.is_appointment_patient(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.is_clinic_owner(uuid) to authenticated;
grant execute on function public.is_appointment_patient(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

revoke insert, update, delete on public.follow_up_reminders from anon, authenticated;
revoke insert, update, delete on public.patient_link_attempts from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;

grant select on public.whatsapp_message_logs to authenticated;
grant all on public.whatsapp_message_logs to service_role;

-- Prescription branding and QR verification
alter table public.clinics
  add column if not exists doctor_name text,
  add column if not exists qualification text,
  add column if not exists registration_no text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists logo_data_url text,
  add column if not exists signature_data_url text;

alter table public.patient_visits
  add column if not exists prescription_token text;

update public.patient_visits
set prescription_token = encode(gen_random_bytes(18), 'hex')
where prescription_token is null;

alter table public.patient_visits
  alter column prescription_token set default encode(gen_random_bytes(18), 'hex');

create unique index if not exists patient_visits_prescription_token_idx
  on public.patient_visits (prescription_token);

create or replace function public.get_public_prescription(_token text)
returns table (
  visit_date date,
  chief_complaint text,
  dosage text,
  next_follow_up date,
  medicine_count integer,
  patient_id uuid,
  patient_name text,
  patient_phone text,
  patient_gender text,
  patient_date_of_birth date,
  patient_address text,
  clinic_name text,
  doctor_name text,
  qualification text,
  registration_no text,
  clinic_phone text,
  clinic_email text,
  address_line1 text,
  address_line2 text,
  logo_data_url text,
  signature_data_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.visit_date,
    v.chief_complaint,
    v.dosage,
    v.next_follow_up,
    greatest(
      1,
      least(
        12,
        cardinality(regexp_split_to_array(coalesce(nullif(v.prescription, ''), 'medicine'), E'\\n|;|,'))
      )
    )::integer as medicine_count,
    p.id as patient_id,
    p.full_name as patient_name,
    p.phone as patient_phone,
    p.gender as patient_gender,
    p.date_of_birth as patient_date_of_birth,
    p.address as patient_address,
    c.name as clinic_name,
    c.doctor_name,
    c.qualification,
    c.registration_no,
    c.phone as clinic_phone,
    c.email as clinic_email,
    c.address_line1,
    c.address_line2,
    c.logo_data_url,
    c.signature_data_url
  from public.patient_visits v
  join public.patients p on p.id = v.patient_id
  join public.clinics c on c.id = v.clinic_id
  where v.prescription_token = _token
  limit 1;
$$;

grant execute on function public.get_public_prescription(text) to anon, authenticated;
