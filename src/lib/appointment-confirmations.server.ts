import { sendWhatsAppTemplate, normalizePhone } from "./whatsapp.server";

// Sends a WhatsApp confirmation for an appointment using the same template
// flow as follow-up reminders. Server-only.
export async function sendAppointmentConfirmation(opts: {
  to: string;
  patientName: string;
  scheduledAt: string; // ISO
  clinicName: string;
  clinicId?: string | null;
  kind: "booked" | "rescheduled" | "cancelled";
}) {
  const phone = normalizePhone(opts.to);
  const when = new Date(opts.scheduledAt).toUTCString();
  const body =
    opts.kind === "cancelled"
      ? `Your appointment at ${opts.clinicName} on ${when} has been cancelled.`
      : opts.kind === "rescheduled"
        ? `Your appointment at ${opts.clinicName} has been rescheduled to ${when}.`
        : `Your appointment at ${opts.clinicName} is confirmed for ${when}.`;

  const res = await sendWhatsAppTemplate({
    operation: "appointment_confirmation",
    clinicId: opts.clinicId,
    to: phone,
    parameters: [opts.patientName, when],
  });
  return {
    messageId: res.messageId,
    body,
  };
}
