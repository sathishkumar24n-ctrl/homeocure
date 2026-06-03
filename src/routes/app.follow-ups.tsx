import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinic } from "@/hooks/use-clinic";
import { supabase } from "@/integrations/supabase/client";
import { sendVisitFollowUpReminder } from "@/lib/follow-up-reminders.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/follow-ups")({
  component: FollowUpCenter,
});

type VisitRow = {
  id: string;
  next_follow_up: string;
  chief_complaint: string | null;
  patient_id: string;
  patients?: { full_name: string; phone: string | null } | null;
};

type ReminderRow = {
  id: string;
  follow_up_date: string;
  status: string;
  sent_to: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  visit_id: string | null;
};

const TABS = [
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "missed", label: "Missed" },
  { key: "sent", label: "Sent history" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TEMPLATES = [
  {
    title: "Follow-up reminder",
    body: "Hi {{name}}, your next consultation is on {{date}}. Reply to confirm.",
  },
  {
    title: "Missed visit nudge",
    body: "Hi {{name}}, we noticed you missed your follow-up on {{date}}. Continuing your treatment is important — shall we reschedule?",
  },
  {
    title: "Medicine review",
    body: "Hi {{name}}, your medicine course may be ending soon. Please book a review to continue your recovery.",
  },
];

function FollowUpCenter() {
  const { role, loading } = useAuth();
  const { data: clinic } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("today");

  useEffect(() => {
    if (!loading && role === "patient") navigate({ to: "/app/patient" });
  }, [loading, role, navigate]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in7 = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const visits = useQuery({
    queryKey: ["follow-up-visits", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async (): Promise<VisitRow[]> => {
      const { data, error } = await supabase
        .from("patient_visits")
        .select(
          "id, next_follow_up, chief_complaint, patient_id, patients!inner(full_name, phone)",
        )
        .eq("clinic_id", clinic!.id)
        .not("next_follow_up", "is", null)
        .order("next_follow_up", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as VisitRow[];
    },
  });

  const reminders = useQuery({
    queryKey: ["follow-up-reminders-all", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async (): Promise<ReminderRow[]> => {
      const { data, error } = await supabase
        .from("follow_up_reminders")
        .select(
          "id, follow_up_date, status, sent_to, sent_at, error, created_at, visit_id",
        )
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sentVisitIds = useMemo(() => {
    const s = new Set<string>();
    (reminders.data ?? []).forEach((r) => {
      if (r.status === "sent" && r.visit_id) s.add(r.visit_id);
    });
    return s;
  }, [reminders.data]);

  const buckets = useMemo(() => {
    const all = visits.data ?? [];
    const dueToday = all.filter((v) => v.next_follow_up === today);
    const upcoming = all.filter(
      (v) => v.next_follow_up > today && v.next_follow_up <= in7,
    );
    const missed = all.filter(
      (v) => v.next_follow_up < today && !sentVisitIds.has(v.id),
    );
    return { dueToday, upcoming, missed };
  }, [visits.data, today, in7, sentVisitIds]);

  const stats = useMemo(() => {
    const r = reminders.data ?? [];
    const sent = r.filter((x) => x.status === "sent").length;
    const failed = r.filter((x) => x.status === "failed").length;
    const total = r.length;
    const successRate = total ? Math.round((sent / total) * 100) : 0;
    return {
      dueToday: buckets.dueToday.length,
      upcoming: buckets.upcoming.length,
      missed: buckets.missed.length,
      sent,
      failed,
      successRate,
    };
  }, [reminders.data, buckets]);

  const sendOneFn = useServerFn(sendVisitFollowUpReminder);
  const sendOne = useMutation({
    mutationFn: (visitId: string) => sendOneFn({ data: { visitId } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("WhatsApp reminder sent");
      else toast.error(r?.error || r?.reason || "Failed to send");
      qc.invalidateQueries({ queryKey: ["follow-up-reminders-all", clinic?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendBatch = useMutation({
    mutationFn: async () => {
      const target =
        tab === "today"
          ? buckets.dueToday
          : tab === "upcoming"
            ? buckets.upcoming
            : tab === "missed"
              ? buckets.missed
              : [];
      const eligible = target.filter(
        (v) => v.patients?.phone && !sentVisitIds.has(v.id),
      );
      let sent = 0;
      const skipped = target.length - eligible.length;
      let failed = 0;
      for (const v of eligible) {
        try {
          const r: any = await sendOneFn({ data: { visitId: v.id } });
          if (r?.ok) sent++;
          else failed++;
        } catch {
          failed++;
        }
      }
      return { sent, skipped, failed, total: target.length };
    },
    onSuccess: (r) => {
      if (r.total === 0) {
        toast.info("No patients in this tab to remind");
      } else {
        toast.success(
          `Reminders: ${r.sent} sent, ${r.skipped} already done, ${r.failed} failed`,
        );
      }
      qc.invalidateQueries({ queryKey: ["follow-up-reminders-all", clinic?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list =
    tab === "today"
      ? buckets.dueToday
      : tab === "upcoming"
        ? buckets.upcoming
        : tab === "missed"
          ? buckets.missed
          : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="mr-1 inline h-3 w-3" /> Smart follow-up engine
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Follow-up Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep patients on their treatment journey — track, remind, and recover missed visits.
          </p>
        </div>
        <button
          onClick={() => sendBatch.mutate()}
          disabled={sendBatch.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
        >
          {sendBatch.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send tomorrow's batch
        </button>
      </div>

      {/* Stat tiles */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={CalendarClock}
          label="Due today"
          value={stats.dueToday}
          tone="primary"
        />
        <StatTile
          icon={Users}
          label="Upcoming (7d)"
          value={stats.upcoming}
          tone="muted"
        />
        <StatTile
          icon={AlertTriangle}
          label="Missed"
          value={stats.missed}
          tone="danger"
        />
        <StatTile
          icon={TrendingUp}
          label="Delivery rate"
          value={`${stats.successRate}%`}
          hint={`${stats.sent} sent · ${stats.failed} failed`}
          tone="muted"
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-1.5 rounded-full bg-muted/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-smooth",
              tab === t.key
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        {tab === "sent" ? (
          <SentHistory reminders={reminders.data ?? []} loading={reminders.isLoading} />
        ) : visits.isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Loading patients…
          </p>
        ) : list.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((v) => {
              const reminded = sentVisitIds.has(v.id);
              return (
                <li
                  key={v.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {v.patients?.full_name ?? "Unknown patient"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Follow-up {v.next_follow_up}
                      {v.chief_complaint ? ` · ${v.chief_complaint}` : ""}
                      {v.patients?.phone ? ` · ${v.patients.phone}` : " · no phone"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {reminded && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
                        <CheckCircle2 className="h-3 w-3" /> Reminded
                      </span>
                    )}
                    <button
                      onClick={() => sendOne.mutate(v.id)}
                      disabled={
                        !v.patients?.phone ||
                        (sendOne.isPending && sendOne.variables === v.id)
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted disabled:opacity-50"
                    >
                      {sendOne.isPending && sendOne.variables === v.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <MessageCircle className="h-3 w-3 text-primary" />
                      )}
                      Send WhatsApp
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Templates */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Message templates</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Preset copy used for follow-up reminders. Approved WhatsApp template is configured in your environment.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div
              key={t.title}
              className="rounded-xl border border-border/60 bg-muted/30 p-3"
            >
              <p className="text-xs font-semibold text-foreground">{t.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {t.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/app"
          className="text-xs font-semibold text-primary hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  tone: "primary" | "muted" | "danger";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-gradient-primary text-primary-foreground"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : "bg-secondary text-secondary-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          toneCls,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const map: Record<TabKey, string> = {
    today: "No follow-ups due today. Enjoy the calm.",
    upcoming: "No follow-ups in the next 7 days.",
    missed: "No missed follow-ups — patients are on track.",
    sent: "",
  };
  return (
    <p className="px-2 py-8 text-center text-sm text-muted-foreground">
      {map[tab]}
    </p>
  );
}

function SentHistory({
  reminders,
  loading,
}: {
  reminders: ReminderRow[];
  loading: boolean;
}) {
  if (loading)
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  if (reminders.length === 0)
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        No reminders sent yet.
      </p>
    );
  return (
    <ul className="divide-y divide-border/60">
      {reminders.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between py-2.5 text-xs"
        >
          <div className="flex items-center gap-2">
            {r.status === "sent" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : r.status === "failed" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">
              {r.sent_to ?? "—"}
            </span>
            <span className="text-muted-foreground">· {r.follow_up_date}</span>
          </div>
          <span
            className={cn(
              "capitalize",
              r.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            title={r.error ?? undefined}
          >
            {r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
