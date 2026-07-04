import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getWhatsAppConfig, normalizePhone, sendWhatsAppTemplate } from "./whatsapp.server";

export async function runReminders(opts: {
  daysAhead: number;
  clinicId?: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.token || !config.phoneNumberId || !config.templateName) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const target = new Date();
  target.setUTCDate(target.getUTCDate() + opts.daysAhead);
  const targetDate = target.toISOString().slice(0, 10);

  let query = supabaseAdmin
    .from("patient_visits")
    .select(
      "id, clinic_id, patient_id, next_follow_up, patients!inner(full_name, phone)",
    )
    .eq("next_follow_up", targetDate);
  if (opts.clinicId) query = query.eq("clinic_id", opts.clinicId);

  const { data: visits, error: visitsErr } = await query;
  if (visitsErr) {
    console.error("[follow-up-reminders] query failed", visitsErr);
    throw new Error("Query failed");
  }

  const queue = (visits ?? []).filter(
    (v: any) => v.patients?.phone && v.patients.phone.trim().length > 0,
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const v of queue) {
    const phone = normalizePhone((v as any).patients.phone);
    const patientName = (v as any).patients.full_name as string;

    const reserved = await reserveReminder({
      visitId: v.id,
      patientId: v.patient_id,
      clinicId: v.clinic_id,
      followUpDate: targetDate,
      sentTo: phone,
    }).catch((err) => {
      console.error("[follow-up-reminders] reserve failed", err);
      return null;
    });

    if (!reserved) {
      skipped++;
      continue;
    }

    if (reserved.alreadySent) {
      skipped++;
      continue;
    }

    try {
      const res = await sendWhatsAppTemplate({
        operation: "follow_up_reminder",
        clinicId: v.clinic_id,
        to: phone,
        parameters: [patientName, targetDate],
      });
      await supabaseAdmin
        .from("follow_up_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: res.messageId,
        })
        .eq("id", reserved.id);
      sent++;
    } catch (err: any) {
      console.error("[follow-up-reminders] send failed", err);
      failed++;
      await supabaseAdmin
        .from("follow_up_reminders")
        .update({
          status: "failed",
          error: String(err?.message ?? err).slice(0, 500),
        })
        .eq("id", reserved.id);
    }
  }

  return {
    ok: true,
    target_date: targetDate,
    considered: queue.length,
    sent,
    skipped,
    failed,
  };
}

async function reserveReminder(opts: {
  visitId: string;
  patientId: string;
  clinicId: string;
  followUpDate: string;
  sentTo: string;
}) {
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("follow_up_reminders")
    .select("id, status")
    .eq("visit_id", opts.visitId)
    .eq("follow_up_date", opts.followUpDate)
    .eq("channel", "whatsapp")
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (existing?.status === "sent") return { id: existing.id, alreadySent: true };

  if (!existing) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("follow_up_reminders")
      .insert({
        visit_id: opts.visitId,
        patient_id: opts.patientId,
        clinic_id: opts.clinicId,
        follow_up_date: opts.followUpDate,
        channel: "whatsapp",
        status: "pending",
        sent_to: opts.sentTo,
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    return { id: inserted.id, alreadySent: false };
  }

  const { data: retry, error: retryErr } = await supabaseAdmin
    .from("follow_up_reminders")
    .update({
      status: "pending",
      error: null,
      sent_to: opts.sentTo,
      sent_at: null,
      provider_message_id: null,
    })
    .eq("id", existing.id)
    .select("id")
    .single();

  if (retryErr) throw retryErr;
  return { id: retry.id, alreadySent: false };
}

// Send a single reminder for a specific visit. Inserts a follow_up_reminders
// row, calls WhatsApp, updates status. Caller is responsible for verifying
// the visit belongs to the caller's clinic before invoking this.
export async function sendReminderForVisit(opts: {
  visitId: string;
  clinicId: string;
  patientId: string;
  followUpDate: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.token || !config.phoneNumberId || !config.templateName) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const { data: patient, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("full_name, phone")
    .eq("id", opts.patientId)
    .maybeSingle();
  if (pErr || !patient) throw new Error("Patient not found");
  if (!patient.phone || patient.phone.trim().length === 0) {
    return { ok: false, reason: "no_phone" as const };
  }

  const phone = normalizePhone(patient.phone);

  const reserved = await reserveReminder({
    visitId: opts.visitId,
    patientId: opts.patientId,
    clinicId: opts.clinicId,
    followUpDate: opts.followUpDate,
    sentTo: phone,
  });
  if (reserved.alreadySent) return { ok: true as const, alreadySent: true };

  try {
    const res = await sendWhatsAppTemplate({
      operation: "follow_up_reminder",
      clinicId: opts.clinicId,
      to: phone,
      parameters: [patient.full_name, opts.followUpDate],
    });
    await supabaseAdmin
      .from("follow_up_reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: res.messageId,
      })
      .eq("id", reserved.id);
    return { ok: true as const, messageId: res.messageId };
  } catch (err: any) {
    await supabaseAdmin
      .from("follow_up_reminders")
      .update({
        status: "failed",
        error: String(err?.message ?? err).slice(0, 500),
      })
      .eq("id", reserved.id);
    return { ok: false as const, reason: "send_failed" as const, error: String(err?.message ?? err) };
  }
}
