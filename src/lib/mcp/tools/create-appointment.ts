import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_appointment",
  title: "Create appointment",
  description: "Book a new appointment for a patient in the signed-in doctor's clinic.",
  inputSchema: {
    patient_id: z.string().uuid(),
    scheduled_at: z.string().describe("ISO date-time for the appointment."),
    duration_minutes: z.number().int().min(5).max(480).optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const clinicId = await getClinicIdForUser(supabase, userId);
    if (!clinicId) return noClinic();

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        clinic_id: clinicId,
        patient_id: input.patient_id,
        scheduled_at: input.scheduled_at,
        duration_minutes: input.duration_minutes ?? 30,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        status: "scheduled",
        created_by: userId,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Appointment booked: ${data.id}` }],
      structuredContent: { appointment: data },
    };
  },
});
