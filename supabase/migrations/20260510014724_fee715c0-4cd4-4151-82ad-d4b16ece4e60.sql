create table public.remedies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
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
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_remedies_clinic on public.remedies(clinic_id);
create index idx_remedies_low_stock on public.remedies(clinic_id) where quantity <= low_stock_threshold;

alter table public.remedies enable row level security;

create policy "Clinic owner can view remedies"
  on public.remedies for select to authenticated
  using (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can insert remedies"
  on public.remedies for insert to authenticated
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can update remedies"
  on public.remedies for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));

create policy "Clinic owner can delete remedies"
  on public.remedies for delete to authenticated
  using (public.is_clinic_owner(clinic_id));

create trigger remedies_touch_updated_at
  before update on public.remedies
  for each row execute function public.touch_updated_at();