// Sends a WhatsApp confirmation for an appointment using the same template
// flow as follow-up reminders. Server-only.
export async function sendAppointmentConfirmation(opts: {
  to: string;
  patientName: string;
  scheduledAt: string; // ISO
  clinicName: string;
  kind: "booked" | "rescheduled" | "cancelled";
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const phone = normalizePhone(opts.to);
  const when = new Date(opts.scheduledAt).toUTCString();
  const body =
    opts.kind === "cancelled"
      ? `Your appointment at ${opts.clinicName} on ${when} has been cancelled.`
      : opts.kind === "rescheduled"
        ? `Your appointment at ${opts.clinicName} has been rescheduled to ${when}.`
        : `Your appointment at ${opts.clinicName} is confirmed for ${when}.`;

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  // Try template first (production WA Cloud requires templates for new conversations)
  const templatePayload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.patientName },
            { type: "text", text: when },
          ],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(templatePayload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`WhatsApp ${res.status}: ${detail}`);
  }
  return {
    messageId: data?.messages?.[0]?.id as string | undefined,
    body,
  };
}

function normalizePhone(p: string) {
  let s = p.trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) return s.slice(1);
  if (s.startsWith("00")) return s.slice(2);
  if (s.startsWith("0")) s = s.slice(1);
  const defaultCc = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91").replace(
    /\D/g,
    "",
  );
  if (/^\d{10}$/.test(s)) return `${defaultCc}${s}`;
  return s;
}
