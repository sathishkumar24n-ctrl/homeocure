-- Track sent follow-up reminders to avoid duplicates
CREATE TABLE public.follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  follow_up_date date NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error text,
  sent_to text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, follow_up_date, channel)
);

CREATE INDEX idx_follow_up_reminders_clinic ON public.follow_up_reminders(clinic_id, follow_up_date DESC);

ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic owner can view reminders"
ON public.follow_up_reminders FOR SELECT TO authenticated
USING (public.is_clinic_owner(clinic_id));