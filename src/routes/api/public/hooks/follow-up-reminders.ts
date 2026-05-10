import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Sends WhatsApp follow-up reminders for visits whose `next_follow_up`
// falls within the configured window (default: tomorrow). Idempotent via
// the `follow_up_reminders` table unique constraint.
export const Route = createFileRoute("/api/public/hooks/follow-up-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await safeJson(request);
          const daysAhead = clampInt(body?.daysAhead, 1, 0, 14);

          const token = process.env.WHATSAPP_ACCESS_TOKEN;
          const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
          if (!token || !phoneNumberId || !templateName) {
            return json(
              { error: "WhatsApp credentials are not configured" },
              500,
            );
          }

          const target = new Date();
          target.setUTCDate(target.getUTCDate() + daysAhead);
          const targetDate = target.toISOString().slice(0, 10);

          // Find visits with a follow-up on the target date, joining patient phone.
          const { data: visits, error: visitsErr } = await supabaseAdmin
            .from("patient_visits")
            .select(
              "id, clinic_id, patient_id, next_follow_up, patients!inner(full_name, phone)",
            )
            .eq("next_follow_up", targetDate);

          if (visitsErr) {
            console.error("[follow-up-reminders] query failed", visitsErr);
            return json({ error: visitsErr.message }, 500);
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

            // Reserve the row first — unique (visit_id, follow_up_date, channel)
            // makes this our idempotency check.
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
              // Duplicate (already reserved/sent) — skip silently.
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

          return json({
            ok: true,
            target_date: targetDate,
            considered: queue.length,
            sent,
            skipped,
            failed,
          });
        } catch (err: any) {
          console.error("[follow-up-reminders] unexpected", err);
          return json({ error: String(err?.message ?? err) }, 500);
        }
      },
    },
  },
});

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
