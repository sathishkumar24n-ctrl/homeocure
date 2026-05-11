import { createFileRoute } from "@tanstack/react-router";
import { runReminders } from "@/lib/follow-up-reminders.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cron-only endpoint. Authenticated via an `x-hook-secret` shared secret
// stored in Supabase Vault. The cron job reads the same secret from Vault
// and sends it as a header — neither the migration nor this file embeds
// the value.
let cachedSecret: { value: string; at: number } | undefined;
const SECRET_TTL_MS = 60_000;

async function loadHookSecret(): Promise<string | null> {
  if (cachedSecret && Date.now() - cachedSecret.at < SECRET_TTL_MS) {
    return cachedSecret.value;
  }
  const { data, error } = await (supabaseAdmin as any)
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "follow_up_reminders_hook_secret")
    .maybeSingle();
  if (error || !data?.decrypted_secret) {
    console.error("[follow-up-reminders] failed to load hook secret", error);
    return null;
  }
  cachedSecret = { value: data.decrypted_secret as string, at: Date.now() };
  return cachedSecret.value;
}

export const Route = createFileRoute("/api/public/hooks/follow-up-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await loadHookSecret();
        if (!expected) {
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
