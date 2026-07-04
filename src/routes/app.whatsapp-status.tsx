import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { getWhatsAppStatus } from "@/lib/whatsapp-status.functions";

export const Route = createFileRoute("/app/whatsapp-status")({
  component: WhatsAppStatusPage,
  head: () => ({
    meta: [
      { title: "WhatsApp status — HomeoCare" },
      { name: "description", content: "Review WhatsApp Cloud API configuration and delivery health." },
    ],
  }),
});

function WhatsAppStatusPage() {
  const statusFn = useServerFn(getWhatsAppStatus);
  const status = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => statusFn(),
  });

  if (status.isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading WhatsApp status…</div>;
  }

  if (status.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {status.error.message}
        </div>
      </div>
    );
  }

  const data = status.data!;
  const tokenLabel = tokenClassificationLabel(data.tokenInspection);
  const appointmentOk = data.messages.lastAppointment?.success === true;
  const followUpOk = data.messages.lastFollowUp?.success === true;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            <MessageCircle className="mr-1 inline h-3 w-3" /> WhatsApp integration
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Configuration Status
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.clinic.name} · existing Meta Cloud API setup
          </p>
        </div>
        <button
          onClick={() => status.refetch()}
          disabled={status.isFetching}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-smooth hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${status.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile label="Token configured" ok={data.config.tokenConfigured} detail={tokenLabel} />
        <StatusTile
          label="Phone Number ID"
          ok={data.config.phoneNumberIdConfigured}
          detail={data.phoneInspection?.displayPhoneNumber ?? data.config.phoneNumberIdSource}
        />
        <StatusTile
          label="Business Account ID"
          ok={data.config.businessAccountIdConfigured}
          detail={
            data.config.businessAccountIdConfigured
              ? data.config.businessAccountIdSource
              : data.phoneInspection?.detectedBusinessAccountId
                ? `Detected from Meta: ${data.phoneInspection.detectedBusinessAccountId}`
                : "Not stored"
          }
        />
        <StatusTile
          label="Reminder scheduler"
          ok={Boolean(data.scheduler?.configured && data.scheduler?.active !== false)}
          detail={data.scheduler?.configured ? data.scheduler.schedule ?? "Configured" : "Not active"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight">Delivery health</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Failed reminders" value={data.reminders.failedCount} />
            <Metric
              label="Appointment confirmation"
              value={appointmentOk ? "Sending" : "No success"}
              tone={appointmentOk ? "good" : "warn"}
            />
            <Metric
              label="Follow-up reminder"
              value={followUpOk ? "Sending" : "No success"}
              tone={followUpOk ? "good" : "warn"}
            />
            <Metric
              label="Last Meta status"
              value={data.messages.lastError?.response_status ?? data.messages.lastSent?.response_status ?? "—"}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight">Findings</h2>
          <div className="mt-3 space-y-2">
            {data.diagnostics.map((item: string) => (
              <div key={item} className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <LogPanel title="Last message sent" log={data.messages.lastSent} empty="No successful WhatsApp messages logged yet." />
        <LogPanel title="Last error from Meta" log={data.messages.lastError} empty="No WhatsApp errors logged yet." />
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight">Scheduler status</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Configured" value={yesNo(Boolean(data.scheduler?.configured))} />
            <Row label="Active" value={data.scheduler?.active === false ? "No" : data.scheduler?.configured ? "Yes" : "No"} />
            <Row label="Schedule" value={data.scheduler?.schedule ?? "—"} />
            <Row label="Last run" value={formatDate(data.scheduler?.lastRunAt)} />
            <Row label="Last status" value={data.scheduler?.lastRunStatus ?? "—"} />
          </dl>
        </section>
      </div>

      <div className="mt-6 rounded-2xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight">Where configuration is stored</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <ConfigSource label="Access Token" source={data.config.tokenSource} />
          <ConfigSource label="Phone Number ID" source={data.config.phoneNumberIdSource} />
          <ConfigSource label="Business Account ID" source={data.config.businessAccountIdSource} />
        </div>
        <Link
          to="/app/follow-ups"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary"
        >
          Open follow-up center <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function StatusTile({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
      </div>
      <p className="mt-2 text-xl font-bold text-foreground">{yesNo(ok)}</p>
      {detail && <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-bold ${tone === "good" ? "text-primary" : tone === "warn" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function LogPanel({ title, log, empty }: { title: string; log: any; empty: string }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {!log ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="When" value={formatDate(log.created_at)} />
          <Row label="Type" value={formatOperation(log.operation)} />
          <Row label="Recipient" value={log.recipient ?? "—"} />
          <Row label="Status" value={log.response_status ?? "—"} />
          <Row label="Message ID" value={log.provider_message_id ?? "—"} />
          <Row label="Meta error" value={log.meta_error_message ?? "—"} />
        </dl>
      )}
    </section>
  );
}

function ConfigSource({ label, source }: { label: string; source: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{source}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

function formatDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString();
}

function formatOperation(v?: string | null) {
  if (v === "follow_up_reminder") return "Follow-up reminder";
  if (v === "appointment_confirmation") return "Appointment confirmation";
  return v ?? "—";
}

function tokenClassificationLabel(token: any) {
  if (!token?.checked) return "Not checked";
  if (token.classification === "permanent") return "Permanent / non-expiring";
  if (token.classification === "temporary") return token.expiresAt ? `Temporary · expires ${formatDate(token.expiresAt)}` : "Temporary";
  if (token.classification === "expired") return "Expired";
  if (token.classification === "invalid") return token.error ?? "Invalid";
  return "Unknown";
}