import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function runReminders(opts: {
  daysAhead: number;
  clinicId?: string;
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
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

    const { data: reserved, error: reserveErr } = await supabaseAdmin
      .from("follow_up_reminders")
      .insert({
        visit_id: v.id,
        patient_id: v.patient_id,
        clinic_id: v.clinic_id,
        follow_up_date: targetDate,
        channel: "whatsapp",
        status: "pending",
        sent_to: phone,
      })
      .select("id")
      .single();

    if (reserveErr) {
      skipped++;
      continue;
    }

    try {
      const res = await sendWhatsAppTemplate({
        token,
        phoneNumberId,
        templateName,
        to: phone,
        patientName,
        followUpDate: targetDate,
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

async function sendWhatsAppTemplate(opts: {
  token: string;
  phoneNumberId: string;
  templateName: string;
  to: string;
  patientName: string;
  followUpDate: string;
}) {
  const url = `https://graph.facebook.com/v21.0/${opts.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.patientName },
            { type: "text", text: opts.followUpDate },
          ],
        },
      ],
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`WhatsApp ${res.status}: ${detail}`);
  }
  return { messageId: data?.messages?.[0]?.id as string | undefined };
}

function normalizePhone(p: string) {
  let s = p.trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) return s.slice(1);
  // Strip a leading "00" international prefix
  if (s.startsWith("00")) return s.slice(2);
  // Strip a leading domestic "0" (common in India: "09940114575")
  if (s.startsWith("0")) s = s.slice(1);
  const defaultCc = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91").replace(
    /\D/g,
    "",
  );
  // If the number looks like a bare local 10-digit number (India/most),
  // prefix the default country code so WhatsApp Cloud accepts it.
  if (/^\d{10}$/.test(s)) return `${defaultCc}${s}`;
  return s;
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
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
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

  const { data: reserved, error: reserveErr } = await supabaseAdmin
    .from("follow_up_reminders")
    .insert({
      visit_id: opts.visitId,
      patient_id: opts.patientId,
      clinic_id: opts.clinicId,
      follow_up_date: opts.followUpDate,
      channel: "whatsapp",
      status: "pending",
      sent_to: phone,
    })
    .select("id")
    .single();
  if (reserveErr) throw new Error(reserveErr.message);

  try {
    const res = await sendWhatsAppTemplate({
      token,
      phoneNumberId,
      templateName,
      to: phone,
      patientName: patient.full_name,
      followUpDate: opts.followUpDate,
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
