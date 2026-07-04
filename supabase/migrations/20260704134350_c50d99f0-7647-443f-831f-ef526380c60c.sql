CREATE TABLE public.whatsapp_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  operation text NOT NULL,
  recipient text,
  phone_number_id text,
  template_name text,
  request_url text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  provider_message_id text,
  duration_ms integer,
  success boolean NOT NULL DEFAULT false,
  meta_error_code text,
  meta_error_type text,
  meta_error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_message_logs TO authenticated;
GRANT ALL ON public.whatsapp_message_logs TO service_role;

CREATE INDEX idx_whatsapp_message_logs_clinic_created
  ON public.whatsapp_message_logs(clinic_id, created_at DESC);
CREATE INDEX idx_whatsapp_message_logs_success_created
  ON public.whatsapp_message_logs(success, created_at DESC);

ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic owner can view WhatsApp logs"
ON public.whatsapp_message_logs FOR SELECT TO authenticated
USING (clinic_id IS NOT NULL AND public.is_clinic_owner(clinic_id));

CREATE OR REPLACE FUNCTION public.get_follow_up_scheduler_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_run record;
BEGIN
  SELECT jobid, jobname, schedule, active
    INTO v_job
  FROM cron.job
  WHERE jobname = 'whatsapp-follow-up-reminders'
  LIMIT 1;

  IF v_job.jobid IS NULL THEN
    RETURN jsonb_build_object('configured', false, 'active', false);
  END IF;

  SELECT status, start_time, end_time, return_message
    INTO v_run
  FROM cron.job_run_details
  WHERE jobid = v_job.jobid
  ORDER BY start_time DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'configured', true,
    'active', coalesce(v_job.active, true),
    'jobName', v_job.jobname,
    'schedule', v_job.schedule,
    'lastRunStatus', v_run.status,
    'lastRunAt', v_run.start_time,
    'lastRunFinishedAt', v_run.end_time,
    'lastRunMessage', v_run.return_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_follow_up_scheduler_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_follow_up_scheduler_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_up_scheduler_status() TO service_role;