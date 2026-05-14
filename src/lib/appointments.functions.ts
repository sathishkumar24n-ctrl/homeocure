import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendAppointmentConfirmation } from "./appointment-confirmations.server";

// Sends a WhatsApp confirmation for an appointment. Caller must be either the
// linked patient or the clinic owner — RLS on the SELECT enforces this.
export const sendAppointmentWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      appointmentId: z.string().uuid(),
      kind: z.enum(["booked", "rescheduled", "cancelled"]),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: appt, error } = await supabase
      .from("appointments")
      .select(
        "id, scheduled_at, clinic_id, patient_id, patients!inner(full_name, phone), clinics!inner(name)",
      )
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error || !appt) {
      throw new Error("Appointment not found or access denied");
    }
    const phone = (appt as any).patients?.phone as string | undefined;
    if (!phone || phone.trim().length === 0) {
      return { ok: false, reason: "no_phone" as const };
    }
    try {
      const res = await sendAppointmentConfirmation({
        to: phone,
        patientName: (appt as any).patients.full_name,
        scheduledAt: appt.scheduled_at as unknown as string,
        clinicName: (appt as any).clinics.name,
        kind: data.kind,
      });
      return { ok: true, messageId: res.messageId };
    } catch (err: any) {
      console.error("[appointments] WhatsApp confirmation failed", err);
      return { ok: false, reason: "send_failed" as const, error: String(err?.message ?? err) };
    }
  });

// Self-link a patient record by phone number — patients sign up after the doctor
// has already added them; this lets them claim their record on first use.
export const linkPatientByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ phone: z.string().min(4).max(32) }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Use admin client to find by phone across clinics, then claim only unowned rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalized = data.phone.trim().replace(/[\s\-()]/g, "");
    // Match by suffix to be lenient with country codes
    const suffix = normalized.replace(/^\+?/, "").slice(-8);

    const { data: candidates, error } = await supabaseAdmin
      .from("patients")
      .select("id, phone, user_id")
      .is("user_id", null)
      .ilike("phone", `%${suffix}%`);
    if (error) throw new Error("Lookup failed");

    if (!candidates || candidates.length === 0) {
      return { ok: false, linked: 0 as const };
    }

    const ids = candidates.map((c) => c.id);
    const { error: updErr } = await supabaseAdmin
      .from("patients")
      .update({ user_id: userId })
      .in("id", ids);
    if (updErr) throw new Error("Link failed");

    return { ok: true, linked: ids.length };
  });
