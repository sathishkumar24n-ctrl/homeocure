# Security Checklist

## Environment Files

- Do not commit `.env`, `.env.*`, `.dev.vars`, or other runtime secret files.
- Keep only `.env.example` in git.
- Store production secrets in the deployment platform, Supabase secrets, or Cloudflare secrets.

## Immediate Actions After Secret Exposure

If a real `.env` file was committed or made public:

1. Remove `.env` from the repository.
2. Rotate every exposed credential.
3. Re-deploy with the new secrets.
4. Review recent Supabase and Meta/WhatsApp activity for unexpected use.

## Keys To Rotate

- `SUPABASE_PUBLISHABLE_KEY` if you want a clean public client key.
- `SUPABASE_SERVICE_ROLE_KEY` immediately if it was exposed.
- `WHATSAPP_ACCESS_TOKEN` immediately if it was exposed.
- Any webhook or hook secret used for reminder jobs.

## Supabase RLS

RLS policies must remain enabled for:

- `profiles`
- `clinics`
- `user_roles`
- `patients`
- `patient_visits`
- `appointments`
- `remedies`
- `patient_link_attempts`
- reminder and WhatsApp log tables

Client-side filters are not a security boundary. Every table containing clinic,
patient, appointment, visit, or messaging data must be protected by Supabase RLS
or written only by trusted server-side code using the service role key.
