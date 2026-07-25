import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_appointments",
  title: "List appointments",
  description:
    "List appointments in the signed-in doctor's clinic within a date range. Defaults to today and the next 7 days.",
  inputSchema: {
    from: z.string().optional().describe("ISO date/time lower bound (inclusive)."),
    to: z.string().optional().describe("ISO date/time upper bound (exclusive)."),
    status: z
      .enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"])
      .optional()
      .describe("Filter by status."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const clinicId = await getClinicIdForUser(supabase, ctx.getUserId()!);
    if (!clinicId) return noClinic();

    const now = new Date();
    const start = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = to ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from("appointments")
      .select("id, patient_id, scheduled_at, duration_minutes, status, reason, notes")
      .eq("clinic_id", clinicId)
      .gte("scheduled_at", start)
      .lt("scheduled_at", end)
      .order("scheduled_at", { ascending: true });
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { appointments: data ?? [] },
    };
  },
});
