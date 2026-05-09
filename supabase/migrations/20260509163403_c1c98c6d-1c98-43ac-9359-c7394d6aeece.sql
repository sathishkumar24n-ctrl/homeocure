
-- 1. Role enum
create type public.app_role as enum ('admin', 'doctor', 'staff', 'patient');

-- 2. Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 3. Clinics table (one per doctor account at signup)
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.clinics enable row level security;

-- 4. user_roles table (separate, never on profiles)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  clinic_id uuid references public.clinics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, clinic_id)
);

alter table public.user_roles enable row level security;

-- 5. Security definer role check
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

-- 6. updated_at trigger helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- 7. Auto-create profile, optional clinic, and role on signup
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
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_phone := new.raw_user_meta_data->>'phone';
  v_clinic_name := new.raw_user_meta_data->>'clinic_name';
  v_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'patient');

  insert into public.profiles (id, full_name, phone)
  values (new.id, v_full_name, v_phone);

  if v_role = 'doctor' and v_clinic_name is not null and length(v_clinic_name) > 0 then
    insert into public.clinics (name, owner_id)
    values (v_clinic_name, new.id)
    returning id into v_clinic_id;
  end if;

  insert into public.user_roles (user_id, role, clinic_id)
  values (new.id, v_role, v_clinic_id);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 8. RLS policies
-- profiles
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- user_roles (read own roles only; writes handled by trigger / admin)
create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

-- clinics
create policy "Owners can view their clinic"
  on public.clinics for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Owners can update their clinic"
  on public.clinics for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
