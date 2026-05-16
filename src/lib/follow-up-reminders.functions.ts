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
