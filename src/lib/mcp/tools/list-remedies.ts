import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getClinicIdForUser, noClinic, notAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_remedies",
  title: "List remedies",
  description: "List remedies in the clinic's inventory, optionally only low-stock items.",
  inputSchema: {
    low_stock_only: z.boolean().optional(),
    search: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ low_stock_only, search }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuth();
    const supabase = supabaseForUser(ctx);
    const clinicId = await getClinicIdForUser(supabase, ctx.getUserId()!);
    if (!clinicId) return noClinic();

    let q = supabase
      .from("remedies")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("name", { ascending: true })
      .limit(200);
    if (search && search.trim()) q = q.ilike("name", `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = low_stock_only
      ? (data ?? []).filter(
          (r: { stock: number; low_stock_threshold: number }) =>
            (r.stock ?? 0) <= (r.low_stock_threshold ?? 0),
        )
      : (data ?? []);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { remedies: rows },
    };
  },
});
