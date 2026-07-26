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
        cardinality(
          regexp_split_to_array(
            coalesce(nullif(v.prescription, ''), 'medicine'),
            E'\\n|;|,'
          )
        )
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
