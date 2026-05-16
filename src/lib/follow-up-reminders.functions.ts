import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runReminders, sendReminderForVisit } from "./follow-up-reminders.server";

// Authenticated "Send now" used by the dashboard. Scoped strictly to the
// caller's clinic by validating ownership before invoking the runner.
export const sendFollowUpRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ daysAhead: z.number().int().min(0).max(14).default(1) }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error || !clinic) {
      throw new Error("Clinic not found");
    }
    return runReminders({ daysAhead: data.daysAhead, clinicId: clinic.id });
  });

// Send a one-off reminder for a single visit. Verifies the visit belongs to
// the caller's clinic via the authenticated supabase client (RLS-scoped).
export const sendVisitFollowUpReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ visitId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (clinicErr || !clinic) throw new Error("Clinic not found");

    const { data: visit, error: visitErr } = await supabase
      .from("patient_visits")
      .select("id, clinic_id, patient_id, next_follow_up")
      .eq("id", data.visitId)
      .eq("clinic_id", clinic.id)
      .maybeSingle();
    if (visitErr || !visit) throw new Error("Visit not found");
    if (!visit.next_follow_up) throw new Error("Visit has no follow-up date");

    return sendReminderForVisit({
      visitId: visit.id,
      clinicId: visit.clinic_id,
      patientId: visit.patient_id,
      followUpDate: visit.next_follow_up as unknown as string,
    });
  });
