do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clinics'
      and policyname = 'Doctors can create their own clinic'
  ) then
    create policy "Doctors can create their own clinic"
      on public.clinics for insert
      to authenticated
      with check (owner_id = auth.uid());
  end if;
end $$;
