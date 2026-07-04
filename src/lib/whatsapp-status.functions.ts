import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .select("id, name")
      .eq("owner_id", userId)
      .maybeSingle();

    if (clinicErr || !clinic) {
      throw new Error("Clinic not found");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const whatsapp = await import("./whatsapp.server");
    const config = whatsapp.getWhatsAppConfigStatus();

    const [tokenInspection, phoneInspection, scheduler, failedCount, lastSent, lastError, lastFollowUp, lastAppointment] =
      await Promise.all([
        whatsapp.inspectWhatsAppToken(),
        whatsapp.inspectWhatsAppPhoneNumber(),
        loadSchedulerStatus(supabaseAdmin),
        countFailedReminders(supabaseAdmin, clinic.id),
        latestWhatsAppLog(supabaseAdmin, clinic.id, { success: true }),
        latestWhatsAppLog(supabaseAdmin, clinic.id, { success: false }),
        latestWhatsAppLog(supabaseAdmin, clinic.id, { operation: "follow_up_reminder" }),
        latestWhatsAppLog(supabaseAdmin, clinic.id, { operation: "appointment_confirmation" }),
      ]);

    const diagnostics = buildDiagnostics({
      config,
      tokenInspection,
      phoneInspection,
      scheduler,
      failedCount,
    });

    return {
      clinic,
      config,
      tokenInspection,
      phoneInspection,
      scheduler,
      reminders: {
        failedCount,
      },
      messages: {
        lastSent,
        lastError,
        lastFollowUp,
        lastAppointment,
      },
      diagnostics,
    };
  });

async function latestWhatsAppLog(
  supabaseAdmin: any,
  clinicId: string,
  filter: { success?: boolean; operation?: string },
) {
  let query = (supabaseAdmin as any)
    .from("whatsapp_message_logs")
    .select(
      "id, created_at, operation, recipient, response_status, response_body, provider_message_id, success, meta_error_message, meta_error_code, meta_error_type, duration_ms",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (typeof filter.success === "boolean") query = query.eq("success", filter.success);
  if (filter.operation) query = query.eq("operation", filter.operation);

  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data ?? null;
}

async function countFailedReminders(supabaseAdmin: any, clinicId: string) {
  const { count } = await (supabaseAdmin as any)
    .from("follow_up_reminders")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "failed");
  return count ?? 0;
}

async function loadSchedulerStatus(supabaseAdmin: any) {
  const { data, error } = await (supabaseAdmin as any).rpc(
    "get_follow_up_scheduler_status",
  );
  if (error) {
    return {
      configured: false,
      active: false,
      error: error.message,
    };
  }
  return data;
}

function buildDiagnostics(input: {
  config: ReturnType<typeof import("./whatsapp.server").getWhatsAppConfigStatus>;
  tokenInspection: any;
  phoneInspection: any;
  scheduler: any;
  failedCount: number;
}) {
  const diagnostics: string[] = [];
  if (!input.config.tokenConfigured) diagnostics.push("Access token is not configured.");
  if (!input.config.phoneNumberIdConfigured) diagnostics.push("Phone Number ID is not configured.");
  if (!input.config.businessAccountIdConfigured) {
    diagnostics.push("WhatsApp Business Account ID is not stored in this project.");
  }
  if (input.tokenInspection?.classification === "invalid") {
    diagnostics.push("Meta reports the access token is invalid or cannot be parsed.");
  }
  if (input.tokenInspection?.classification === "temporary") {
    diagnostics.push("The access token appears to be temporary/expiring; use a permanent System User token for production.");
  }
  if (input.phoneInspection?.checked && !input.phoneInspection?.ok) {
    diagnostics.push("Meta could not validate the configured Phone Number ID with the current token.");
  }
  if (!input.scheduler?.configured || input.scheduler?.active === false) {
    diagnostics.push("The daily follow-up reminder scheduler is not active.");
  }
  if (input.failedCount > 0) {
    diagnostics.push(`${input.failedCount} follow-up reminder(s) are currently failed.`);
  }
  if (diagnostics.length === 0) diagnostics.push("No WhatsApp configuration issues detected.");
  return diagnostics;
}