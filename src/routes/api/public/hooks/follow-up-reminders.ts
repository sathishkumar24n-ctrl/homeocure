import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Sends WhatsApp follow-up reminders for visits whose `next_follow_up`
// falls within the configured window (default: tomorrow). Idempotent via
// the `follow_up_reminders` table unique constraint.
//
// Authentication: requires `x-hook-secret` header matching `HOOK_SECRET`
// (compared in constant time). The endpoint runs with service-role
// privileges, so it must never be exposed unauthenticated.
export const Route = createFileRoute("/api/public/hooks/follow-up-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.HOOK_SECRET;
        if (!expected) {
          console.error("[follow-up-reminders] HOOK_SECRET not configured");
          return json({ error: "Internal server error" }, 500);
        }
        const provided = request.headers.get("x-hook-secret") ?? "";
        if (!constantTimeEqual(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        try {
          const body = await safeJson(request);
          const daysAhead = clampInt(body?.daysAhead, 1, 0, 14);

          const result = await runReminders({ daysAhead });
          return json(result);
        } catch (err) {
          console.error("[follow-up-reminders] unexpected", err);
          return json({ error: "Internal server error" }, 500);
        }
      },
    },
  },
});

// Shared runner — also called by the authenticated server function used by
// the dashboard "Send now" button (scoped to a single clinic).
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
  const trimmed = p.trim().replace(/[\s\-()]/g, "");
  return trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
}

async function safeJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function clampInt(v: any, fallback: number, min: number, max: number) {
  const n = Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
  return Math.max(min, Math.min(max, n));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
