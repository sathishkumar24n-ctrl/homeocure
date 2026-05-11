-- 1) Restrict role assignment at signup: only doctor/patient accepted; everything else falls back to patient.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Only allow self-assignment of doctor or patient. Anything else (including
  -- 'admin', 'staff', missing, or unknown values) is forced to patient.
  if v_requested = 'doctor' then
    v_role := 'doctor'::public.app_role;
  else
    v_role := 'patient'::public.app_role;
  end if;

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
$function$;

-- 2) Generate a random shared secret in Supabase Vault for the cron -> webhook
--    auth handshake (only if not already present). The endpoint reads the same
--    value via the service role to validate incoming requests.
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'follow_up_reminders_hook_secret';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'follow_up_reminders_hook_secret',
      'Shared secret for /api/public/hooks/follow-up-reminders'
    );
  END IF;
END $$;

-- 3) Reschedule the cron job to send the secret in the x-hook-secret header,
--    read from Vault at trigger time (never embedded in migration files).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-follow-up-reminders') THEN
    PERFORM cron.unschedule('whatsapp-follow-up-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'whatsapp-follow-up-reminders',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--c5202617-96be-4936-8b58-0e57b9e34e40.lovable.app/api/public/hooks/follow-up-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'follow_up_reminders_hook_secret' LIMIT 1)
    ),
    body := '{"daysAhead":1}'::jsonb
  );
  $cron$
);