import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_patients",
  title: "List patients",
  description:
    "List patients in the signed-in doctor's clinic. Optionally filter by a name or phone search term.",
  inputSchema: {
    search: z.string().optional().describe("Optional name or phone substring."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const clinicId = await getClinicIdForUser(supabase, ctx.getUserId()!);
    if (!clinicId) return noClinic();

    let q = supabase
      .from("patients")
      .select("id, full_name, phone, email, date_of_birth, gender, created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`full_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { patients: data ?? [] },
    };
  },
});
