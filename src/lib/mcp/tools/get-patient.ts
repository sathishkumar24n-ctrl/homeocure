import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_patient",
  title: "Get patient",
  description:
    "Get one patient's profile and their visit history (chief complaint, prescription, follow-up).",
  inputSchema: {
    patient_id: z.string().uuid().describe("Patient UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const clinicId = await getClinicIdForUser(supabase, ctx.getUserId()!);
    if (!clinicId) return noClinic();

    const { data: patient, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patient_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!patient)
      return { content: [{ type: "text", text: "Patient not found" }], isError: true };

    const { data: visits } = await supabase
      .from("patient_visits")
      .select("*")
      .eq("patient_id", patient_id)
      .order("created_at", { ascending: false });

    const payload = { patient, visits: visits ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
