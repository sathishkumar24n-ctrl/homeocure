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
    const { supabase, userId } = context;
    // RLS already restricts SELECT to clinic owner or linked patient, but
    // re-verify explicitly so we never send WhatsApp on behalf of someone
    // who shouldn't have access to this appointment.
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, scheduled_at, clinic_id, patient_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error || !appt) {
      throw new Error("Appointment not found or access denied");
    }
    const [{ data: patient }, { data: clinic }] = await Promise.all([
      supabase
        .from("patients")
        .select("full_name, phone, user_id, clinic_id")
        .eq("id", appt.patient_id)
        .maybeSingle(),
      supabase
        .from("clinics")
        .select("name, owner_id")
        .eq("id", appt.clinic_id)
        .maybeSingle(),
    ]);
    if (!patient) {
      throw new Error("Patient record not found");
    }
    // Defense in depth: caller must own the clinic OR be the linked patient,
    // AND the patient must actually belong to this clinic.
    const isClinicOwner = clinic?.owner_id === userId;
    const isLinkedPatient = patient.user_id === userId;
    if (!isClinicOwner && !isLinkedPatient) {
      throw new Error("Access denied");
    }
    if (patient.clinic_id !== appt.clinic_id) {
      throw new Error("Appointment does not belong to this clinic");
    }
    const phone = patient.phone;
    if (!phone || phone.trim().length === 0) {
      return { ok: false, reason: "no_phone" as const };
    }
    try {
      const res = await sendAppointmentConfirmation({
        to: phone,
        patientName: patient.full_name,
        scheduledAt: appt.scheduled_at as unknown as string,
        clinicName: clinic?.name ?? "your clinic",
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
//
// Hardened against record-takeover:
//   * Requires an exact normalized phone match (no substring/suffix matching).
//   * Links at most ONE patient record per call; if multiple unowned rows match
//     the same number, we refuse and require manual reconciliation by the clinic.
//   * Rate-limited to 5 attempts per user per hour, tracked in
//     `patient_link_attempts`.
const MAX_ATTEMPTS_PER_HOUR = 5;

function normalizePhone(raw: string): string {
  // Strip whitespace and common punctuation, keep leading +.
  const trimmed = raw.trim().replace(/[\s\-()]/g, "");
  // Drop a leading + so stored values with/without country-code prefix compare equally.
  return trimmed.replace(/^\+/, "");
}

export const linkPatientByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      phone: z
        .string()
        .min(6)
        .max(32)
        .regex(/^[+\d\s\-()]+$/, "Invalid phone number"),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Rate limit: count attempts in the last hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentAttempts } = await supabaseAdmin
      .from("patient_link_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("attempted_at", since);
    if ((recentAttempts ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
      throw new Error("Too many attempts. Please try again later.");
    }

    const recordAttempt = async (success: boolean) => {
      await supabaseAdmin
        .from("patient_link_attempts")
        .insert({ user_id: userId, success });
    };

    const target = normalizePhone(data.phone);
    if (target.length < 6) {
      await recordAttempt(false);
      return { ok: false, linked: 0 as const };
    }

    // Pull unowned candidates and compare normalized values in-app so stored
    // numbers with/without the leading + or with separators still match exactly.
    const { data: candidates, error } = await supabaseAdmin
      .from("patients")
      .select("id, phone")
      .is("user_id", null);
    if (error) {
      await recordAttempt(false);
      throw new Error("Lookup failed");
    }

    const matches = (candidates ?? []).filter(
      (c) => c.phone && normalizePhone(c.phone) === target,
    );

    if (matches.length === 0) {
      await recordAttempt(false);
      return { ok: false, linked: 0 as const };
    }

    if (matches.length > 1) {
      // Ambiguous — refuse rather than auto-claim multiple records.
      await recordAttempt(false);
      throw new Error(
        "Multiple records match this phone number. Please contact your clinic.",
      );
    }

    const { error: updErr } = await supabaseAdmin
      .from("patients")
      .update({ user_id: userId })
      .eq("id", matches[0].id)
      .is("user_id", null);
    if (updErr) {
      await recordAttempt(false);
      throw new Error("Link failed");
    }

    await recordAttempt(true);
    return { ok: true, linked: 1 as const };
  });
