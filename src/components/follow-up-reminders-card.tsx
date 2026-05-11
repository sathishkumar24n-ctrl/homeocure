import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, MessageCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendFollowUpRemindersNow } from "@/lib/follow-up-reminders.functions";

export function FollowUpRemindersCard({ clinicId }: { clinicId?: string }) {
  const qc = useQueryClient();

  const recent = useQuery({
    queryKey: ["follow-up-reminders", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_up_reminders")
        .select("id, follow_up_date, status, sent_to, sent_at, error, created_at")
        .eq("clinic_id", clinicId!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const sendNow = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/public/hooks/follow-up-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysAhead: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to send");
      return json as { sent: number; skipped: number; failed: number; considered: number };
    },
    onSuccess: (r) => {
      toast.success(
        `Reminders: ${r.sent} sent, ${r.skipped} already done, ${r.failed} failed`,
      );
      qc.invalidateQueries({ queryKey: ["follow-up-reminders", clinicId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold tracking-tight">WhatsApp follow-up reminders</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sent automatically every day at 9:00 AM UTC for follow-ups due tomorrow.
          </p>
        </div>
        <button
          onClick={() => sendNow.mutate()}
          disabled={sendNow.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
        >
          {sendNow.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send now
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {recent.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !recent.data || recent.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No reminders sent yet.</p>
        ) : (
          recent.data.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                {r.status === "sent" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : r.status === "failed" ? (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">{r.sent_to}</span>
                <span className="text-muted-foreground">· {r.follow_up_date}</span>
              </div>
              <span
                className={
                  r.status === "failed"
                    ? "text-destructive"
                    : r.status === "sent"
                      ? "text-muted-foreground"
                      : "text-muted-foreground"
                }
                title={r.error ?? undefined}
              >
                {r.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
