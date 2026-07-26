alter table public.clinics
  add column if not exists show_medicine_names_on_prescription boolean not null default false;

drop function if exists public.get_public_prescription(text);

create or replace function public.get_public_prescription(_token text)
returns table (
  visit_date date,
  chief_complaint text,
  dosage text,
  next_follow_up date,
  prescription text,
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
  signature_data_url text,
  show_medicine_names_on_prescription boolean
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
    case
      when c.show_medicine_names_on_prescription then v.prescription
      else null
    end as prescription,
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
    c.signature_data_url,
    c.show_medicine_names_on_prescription
  from public.patient_visits v
  join public.patients p on p.id = v.patient_id
  join public.clinics c on c.id = v.clinic_id
  where v.prescription_token = _token
  limit 1;
$$;

grant execute on function public.get_public_prescription(text) to anon, authenticated;
