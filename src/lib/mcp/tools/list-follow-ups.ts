import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_follow_ups",
  title: "List follow-ups",
  description:
    "List patient visits with an upcoming or overdue follow-up date in the signed-in doctor's clinic.",
  inputSchema: {
    window: z
      .enum(["due_today", "upcoming", "missed"])
      .optional()
      .describe("Which follow-up bucket to return (default: upcoming)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ window }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const clinicId = await getClinicIdForUser(supabase, ctx.getUserId()!);
    if (!clinicId) return noClinic();

    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from("patient_visits")
      .select("id, patient_id, next_follow_up, chief_complaint, created_at")
      .eq("clinic_id", clinicId)
      .not("next_follow_up", "is", null);

    const w = window ?? "upcoming";
    if (w === "due_today") q = q.eq("next_follow_up", today);
    else if (w === "missed") q = q.lt("next_follow_up", today);
    else q = q.gte("next_follow_up", today);

    q = q.order("next_follow_up", { ascending: true }).limit(100);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { follow_ups: data ?? [] },
    };
  },
});
