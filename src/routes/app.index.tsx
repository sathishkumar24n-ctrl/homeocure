import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  MessageCircle,
  Package,
  Plus,
  Stethoscope,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinic } from "@/hooks/use-clinic";
import { supabase } from "@/integrations/supabase/client";
import { FollowUpRemindersCard } from "@/components/follow-up-reminders-card";
import { ClinicSetupCard } from "@/components/clinic-setup-card";

export const Route = createFileRoute("/app/")({
  component: DoctorDashboard,
});

type DashboardAppointment = {
  id: string;
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status?: AppointmentStatus;
  reason: string | null;
  patient: { id: string; full_name: string; phone: string | null } | null;
};

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

type FollowUpVisit = {
  id: string;
  patient_id: string;
  visit_date: string;
  next_follow_up: string;
  chief_complaint: string | null;
  patients?: { id?: string; full_name: string; phone: string | null } | null;
};

type AttentionSourceType =
  "appointment" | "follow_up" | "missed_follow_up" | "no_show" | "needs_closure";

type AttentionItem = {
  id: string;
  sourceType: AttentionSourceType;
  patientId: string | null;
  patientName: string;
  phone: string | null;
  title: string;
  reason: string;
  dueAt: string;
  priority: number;
  appointmentId?: string;
  visitId?: string;
  durationMinutes?: number;
  canRecordVisit?: boolean;
  canComplete?: boolean;
  canMarkNoShow?: boolean;
};

type AttentionSummary = {
  total: number;
  urgent: number;
  appointmentsToday: number;
  overdueFollowUps: number;
  dueFollowUps: number;
  missedAppointments: number;
  needsClosure: number;
};

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function attachPatients(rows: Array<Omit<DashboardAppointment, "patient">>) {
  const ids = Array.from(new Set(rows.map((row) => row.patient_id)));
  if (ids.length === 0) return rows.map((row) => ({ ...row, patient: null }));

  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .in("id", ids);
  if (error) throw error;

  const patientMap = new Map((data ?? []).map((patient) => [patient.id, patient]));
  return rows.map((row) => ({
    ...row,
    patient: patientMap.get(row.patient_id) ?? null,
  })) as DashboardAppointment[];
}

function DoctorDashboard() {
  const { user, role, loading } = useAuth();
  const { data: clinic, isLoading: clinicLoading } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && role === "patient") {
      navigate({ to: "/app/patient" });
    }
  }, [loading, role, navigate]);

  const patientCount = useQuery({
    queryKey: ["patient-count", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const todayAppointmentsCount = useQuery({
    queryKey: ["today-appointments-count", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  const todayAppointments = useQuery({
    queryKey: ["today-appointments", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { start, end } = todayBounds();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, scheduled_at, duration_minutes, reason")
        .eq("clinic_id", clinic!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return attachPatients(data ?? []);
    },
  });

  const upcomingAppointments = useQuery({
    queryKey: ["upcoming-appointments", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { end } = todayBounds();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, scheduled_at, duration_minutes, reason")
        .eq("clinic_id", clinic!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return attachPatients(data ?? []);
    },
  });

  const attentionAppointments = useQuery({
    queryKey: ["attention-appointments", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { end } = todayBounds();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, scheduled_at, duration_minutes, status, reason")
        .eq("clinic_id", clinic!.id)
        .in("status", ["scheduled", "no_show"])
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return attachPatients(data ?? []);
    },
  });

  const attentionFollowUps = useQuery({
    queryKey: ["attention-follow-ups", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const today = localDateKey(new Date());
      const { data, error } = await supabase
        .from("patient_visits")
        .select(
          "id, patient_id, visit_date, next_follow_up, chief_complaint, patients!inner(id, full_name, phone)",
        )
        .eq("clinic_id", clinic!.id)
        .not("next_follow_up", "is", null)
        .lte("next_follow_up", today)
        .order("next_follow_up", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpVisit[];
    },
  });

  const attentionReminders = useQuery({
    queryKey: ["attention-reminders", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from("follow_up_reminders")
        .select("visit_id, status, sent_at")
        .eq("clinic_id", clinic!.id)
        .eq("status", "sent")
        .gte("sent_at", sevenDaysAgo.toISOString())
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setAppointmentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      qc.invalidateQueries({ queryKey: ["attention-appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments-count", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["upcoming-appointments", clinic?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lowStockCount = useQuery({
    queryKey: ["low-stock-count", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remedies")
        .select("quantity, low_stock_threshold")
        .eq("clinic_id", clinic!.id);
      if (error) throw error;
      return (data ?? []).filter((r) => Number(r.quantity) <= Number(r.low_stock_threshold)).length;
    },
  });

  const remedyCount = useQuery({
    queryKey: ["remedy-count", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("remedies")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const attentionItems = useMemo(
    () =>
      buildAttentionItems({
        appointments: attentionAppointments.data ?? [],
        followUps: attentionFollowUps.data ?? [],
        recentlyRemindedVisitIds: new Set(
          (attentionReminders.data ?? [])
            .map((reminder) => reminder.visit_id)
            .filter((id): id is string => Boolean(id)),
        ),
      }),
    [attentionAppointments.data, attentionFollowUps.data, attentionReminders.data],
  );

  const attentionLoading =
    attentionAppointments.isLoading || attentionFollowUps.isLoading || attentionReminders.isLoading;

  const attentionSummary = useMemo(() => summarizeAttention(attentionItems), [attentionItems]);

  const tiles = [
    {
      icon: Users,
      label: "Patients",
      value: patientCount.data ?? "—",
      to: "/app/patients" as const,
      hint: "Manage your patient database",
    },
    {
      icon: CalendarCheck,
      label: "Today's appointments",
      value: todayAppointmentsCount.data ?? "—",
      to: "/app/appointments" as const,
      hint: "Schedule and manage today",
    },
    {
      icon: HeartPulse,
      label: "Follow-ups due",
      value: attentionLoading
        ? "—"
        : attentionSummary.dueFollowUps + attentionSummary.overdueFollowUps,
      to: "/app/follow-ups" as const,
      hint: "Due today and overdue reviews",
    },
    {
      icon: AlertTriangle,
      label: "Needs attention",
      value: attentionLoading ? "—" : attentionSummary.total,
      to: "/app/" as const,
      hint: "Appointments, follow-ups, no-shows",
    },
    {
      icon: Package,
      label: "Low-stock remedies",
      value: lowStockCount.data ?? "—",
      to: "/app/remedies" as const,
      hint: "Track inventory and stock",
    },
    {
      icon: MessageCircle,
      label: "WhatsApp status",
      value: "Check",
      to: "/app/whatsapp-status" as const,
      hint: "Config, logs & scheduler",
    },
    {
      icon: Building2,
      label: "Clinic profile",
      value: "Edit",
      to: "/app/clinic" as const,
      hint: "Logo, signature & registration",
    },
  ];

  const onboardingSteps = [
    {
      label: "Clinic profile created",
      detail: clinic?.name ?? "Your clinic will appear here after signup.",
      done: Boolean(clinic?.id),
      to: "/app" as const,
    },
    {
      label: "Add your first patient",
      detail: "Create a patient profile with phone number and medical background.",
      done: (patientCount.data ?? 0) > 0,
      to: "/app/patients/new" as const,
    },
    {
      label: "Schedule the first appointment",
      detail: "Put today's visit or the next consultation on the calendar.",
      done: (todayAppointmentsCount.data ?? 0) > 0,
      to: "/app/appointments" as const,
    },
    {
      label: "Add remedy inventory",
      detail: "Track stock, potency, supplier, expiry, and reorder levels.",
      done: (remedyCount.data ?? 0) > 0,
      to: "/app/remedies" as const,
    },
    {
      label: "Check WhatsApp setup",
      detail: "Confirm reminders and appointment messages are ready.",
      done: false,
      to: "/app/whatsapp-status" as const,
    },
    {
      label: "Complete prescription branding",
      detail: "Add logo, doctor signature, registration number, and clinic contact.",
      done: Boolean(clinic?.registration_no || clinic?.logo_data_url || clinic?.signature_data_url),
      to: "/app/clinic" as const,
    },
  ];

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const showOnboarding = completedSteps < onboardingSteps.length;

  if (!loading && role == null) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!loading && !clinicLoading && role !== "patient" && !clinic) {
    return <ClinicSetupCard />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Dr. {user?.user_metadata?.full_name ?? "Doctor"}
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {clinic?.name ?? "Your clinic"} — your daily clinic command center.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
            <CommandMetric label="Today" value={todayAppointmentsCount.data ?? "—"} />
            <CommandMetric
              label="Urgent"
              value={attentionLoading ? "—" : attentionSummary.urgent}
            />
            <CommandMetric
              label="Overdue"
              value={
                attentionLoading
                  ? "—"
                  : attentionSummary.overdueFollowUps + attentionSummary.needsClosure
              }
            />
          </div>
        </div>
      </div>

      {showOnboarding && (
        <section className="mt-6 rounded-3xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                First clinic setup
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">
                Get HomeoCare ready for daily practice
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Complete these steps once, then your dashboard becomes a daily command center.
              </p>
            </div>
            <div className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {completedSteps}/{onboardingSteps.length} done
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-6">
            {onboardingSteps.map((step) => (
              <Link
                key={step.label}
                to={step.to}
                className={`group rounded-2xl border p-4 transition-smooth hover:-translate-y-0.5 hover:shadow-card ${
                  step.done ? "border-primary/25 bg-primary/10" : "border-border/60 bg-background"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      step.done
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{step.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <t.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </>
          );
          return (
            <Link
              key={t.label}
              to={t.to}
              className="group rounded-2xl border border-border/60 bg-card p-5 shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-elevated"
            >
              {inner}
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Open{" "}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          );
        })}
      </div>

      <AttentionQueue
        loading={attentionLoading}
        items={attentionItems}
        summary={attentionSummary}
        updatingAppointmentId={setAppointmentStatus.variables?.id}
        onSetAppointmentStatus={(id, status) => setAppointmentStatus.mutate({ id, status })}
      />

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <AppointmentPanel
          title="Today's appointment queue"
          loading={todayAppointments.isLoading}
          appointments={todayAppointments.data ?? []}
          empty="No scheduled appointments today."
          showVisitAction
        />
        <AppointmentPanel
          title="Upcoming appointments"
          loading={upcomingAppointments.isLoading}
          appointments={upcomingAppointments.data ?? []}
          empty="No upcoming scheduled appointments."
        />
      </section>

      <FollowUpRemindersCard clinicId={clinic?.id} />
    </div>
  );
}

function AppointmentPanel({
  title,
  loading,
  appointments,
  empty,
  showVisitAction,
}: {
  title: string;
  loading: boolean;
  appointments: DashboardAppointment[];
  empty: string;
  showVisitAction?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <Link
          to="/app/appointments"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-background p-5 text-center text-sm text-muted-foreground">
          Loading appointments...
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 p-5 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((appointment) => (
            <DashboardAppointmentCard
              key={appointment.id}
              appointment={appointment}
              showVisitAction={showVisitAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommandMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-card/85 px-3 py-3 shadow-soft">
      <p className="text-xl font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function AttentionQueue({
  loading,
  items,
  summary,
  updatingAppointmentId,
  onSetAppointmentStatus,
}: {
  loading: boolean;
  items: AttentionItem[];
  summary: AttentionSummary;
  updatingAppointmentId?: string;
  onSetAppointmentStatus: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Daily command center
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            Patients requiring attention today
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Follow-ups, appointments, missed visits, and appointments that still need closure.
          </p>
        </div>
        <div className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {summary.total} active{summary.urgent > 0 ? ` · ${summary.urgent} urgent` : ""}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <AttentionSummaryPill label="Today visits" value={summary.appointmentsToday} />
        <AttentionSummaryPill label="Due follow-ups" value={summary.dueFollowUps} />
        <AttentionSummaryPill label="Overdue follow-ups" value={summary.overdueFollowUps} urgent />
        <AttentionSummaryPill label="No-shows" value={summary.missedAppointments} urgent />
        <AttentionSummaryPill label="Needs closure" value={summary.needsClosure} urgent />
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-background p-6 text-center text-sm text-muted-foreground">
          Loading today&apos;s attention queue...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">No pending patient actions</p>
          <p className="mt-1 text-xs text-muted-foreground">Today&apos;s clinic queue is clear.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <AttentionQueueCard
              key={item.id}
              item={item}
              updatingAppointmentId={updatingAppointmentId}
              onSetAppointmentStatus={onSetAppointmentStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AttentionSummaryPill({
  label,
  value,
  urgent,
}: {
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 ${
        urgent && value > 0
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-border/60 bg-background text-foreground"
      }`}
    >
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</p>
    </div>
  );
}

function AttentionQueueCard({
  item,
  updatingAppointmentId,
  onSetAppointmentStatus,
}: {
  item: AttentionItem;
  updatingAppointmentId?: string;
  onSetAppointmentStatus: (id: string, status: AppointmentStatus) => void;
}) {
  const patientRoute = item.patientId ? `/app/patients/${item.patientId}` : undefined;
  const recordVisitHref =
    item.patientId && item.canRecordVisit
      ? `/app/patients/${item.patientId}?newVisit=1${
          item.appointmentId ? `&appointmentId=${item.appointmentId}` : ""
        }`
      : undefined;
  const whatsappHref = item.phone
    ? buildWhatsAppHref(item.phone, buildAttentionWhatsAppMessage(item))
    : undefined;

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3 lg:flex-1">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              item.priority <= 2
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {item.priority <= 2 ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Clock className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{item.patientName}</p>
              <span className={attentionBadgeClass(item.sourceType)}>
                {attentionLabel(item.sourceType)}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatAttentionDue(item.dueAt, item.sourceType)}
              {item.reason ? ` · ${item.reason}` : ""}
              {!item.phone ? " · no WhatsApp number" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {patientRoute && (
            <a
              href={patientRoute}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" /> Case
            </a>
          )}
          {recordVisitHref && (
            <a
              href={recordVisitHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground shadow-soft"
            >
              <Stethoscope className="h-3.5 w-3.5" /> Record visit
            </a>
          )}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {item.appointmentId && item.canComplete && (
            <button
              type="button"
              onClick={() => {
                const confirmed =
                  item.sourceType !== "appointment" ||
                  confirm("Mark this appointment completed without recording a visit?");
                if (confirmed) onSetAppointmentStatus(item.appointmentId!, "completed");
              }}
              disabled={updatingAppointmentId === item.appointmentId}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-smooth hover:bg-primary/15 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </button>
          )}
          {item.appointmentId && item.canMarkNoShow && (
            <button
              type="button"
              onClick={() => onSetAppointmentStatus(item.appointmentId!, "no_show")}
              disabled={updatingAppointmentId === item.appointmentId}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition-smooth hover:bg-destructive/15 disabled:opacity-60"
            >
              No-show
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardAppointmentCard({
  appointment,
  showVisitAction,
}: {
  appointment: DashboardAppointment;
  showVisitAction?: boolean;
}) {
  const dt = new Date(appointment.scheduled_at);
  const patient = appointment.patient;

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <span className="text-[10px] font-semibold uppercase">
            {dt.toLocaleDateString(undefined, { month: "short" })}
          </span>
          <span className="text-base font-bold leading-none">{dt.getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {patient?.full_name ?? "Unknown patient"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span>{appointment.duration_minutes} min</span>
            {appointment.reason && <span className="truncate">{appointment.reason}</span>}
          </p>
        </div>
        {patient && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              to="/app/patients/$patientId"
              params={{ patientId: patient.id }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" /> Case
            </Link>
            {showVisitAction && (
              <a
                href={`/app/patients/${patient.id}?newVisit=1&appointmentId=${appointment.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground shadow-soft"
              >
                <Stethoscope className="h-3.5 w-3.5" /> Record
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildAttentionItems({
  appointments,
  followUps,
  recentlyRemindedVisitIds,
}: {
  appointments: DashboardAppointment[];
  followUps: FollowUpVisit[];
  recentlyRemindedVisitIds: Set<string>;
}) {
  const now = new Date();
  const { start, end } = todayBounds();
  const todayKey = localDateKey(now);
  const rows: AttentionItem[] = [];
  const patientAppointmentToday = new Set<string>();
  const dueFollowUpByPatient = new Map<string, FollowUpVisit>();

  for (const visit of followUps) {
    const current = dueFollowUpByPatient.get(visit.patient_id);
    if (!current || visit.next_follow_up < current.next_follow_up) {
      dueFollowUpByPatient.set(visit.patient_id, visit);
    }
  }

  for (const appointment of appointments) {
    const due = new Date(appointment.scheduled_at);
    const patient = appointment.patient;
    const linkedFollowUp = dueFollowUpByPatient.get(appointment.patient_id);
    const isToday = due >= start && due < end;
    const isPastDay = due < start;
    const isPastTime =
      appointment.status === "scheduled" &&
      due.getTime() + appointment.duration_minutes * 60000 < now.getTime();

    if (appointment.status === "no_show") {
      rows.push({
        id: `appointment-no-show-${appointment.id}`,
        sourceType: "no_show",
        patientId: patient?.id ?? appointment.patient_id,
        patientName: patient?.full_name ?? "Unknown patient",
        phone: patient?.phone ?? null,
        title: "No-show appointment needs follow-up",
        reason: appointment.reason ?? "Reschedule or close this missed appointment",
        dueAt: appointment.scheduled_at,
        priority: 1,
        appointmentId: appointment.id,
        durationMinutes: appointment.duration_minutes,
        canRecordVisit: Boolean(patient),
        canComplete: Boolean(patient),
      });
      continue;
    }

    if (isPastDay) {
      rows.push({
        id: `appointment-closure-${appointment.id}`,
        sourceType: "needs_closure",
        patientId: patient?.id ?? appointment.patient_id,
        patientName: patient?.full_name ?? "Unknown patient",
        phone: patient?.phone ?? null,
        title: "Past appointment still needs closure",
        reason: appointment.reason ?? "Mark completed, no-show, or record the visit",
        dueAt: appointment.scheduled_at,
        priority: 2,
        appointmentId: appointment.id,
        durationMinutes: appointment.duration_minutes,
        canRecordVisit: Boolean(patient),
        canComplete: true,
        canMarkNoShow: true,
      });
      continue;
    }

    if (isToday) {
      if (patient?.id) patientAppointmentToday.add(patient.id);
      rows.push({
        id: `appointment-today-${appointment.id}`,
        sourceType: "appointment",
        patientId: patient?.id ?? appointment.patient_id,
        patientName: patient?.full_name ?? "Unknown patient",
        phone: patient?.phone ?? null,
        title: isPastTime ? "Scheduled appointment is due now" : "Scheduled appointment today",
        reason: attentionReason(appointment.reason, linkedFollowUp?.chief_complaint),
        dueAt: appointment.scheduled_at,
        priority: isPastTime ? 2 : 4,
        appointmentId: appointment.id,
        durationMinutes: appointment.duration_minutes,
        canRecordVisit: Boolean(patient),
        canComplete: true,
        canMarkNoShow: isPastTime,
      });
    }
  }

  for (const visit of followUps) {
    const patient = visit.patients;
    const sourceType: AttentionSourceType =
      visit.next_follow_up < todayKey ? "missed_follow_up" : "follow_up";
    const hasAppointmentToday = patient?.id ? patientAppointmentToday.has(patient.id) : false;
    if (sourceType === "missed_follow_up" && recentlyRemindedVisitIds.has(visit.id)) continue;
    if (hasAppointmentToday) continue;

    rows.push({
      id: `${sourceType}-${visit.id}`,
      sourceType,
      patientId: patient?.id ?? visit.patient_id,
      patientName: patient?.full_name ?? "Unknown patient",
      phone: patient?.phone ?? null,
      title:
        sourceType === "missed_follow_up"
          ? "Overdue follow-up"
          : hasAppointmentToday
            ? "Follow-up due today with appointment booked"
            : "Follow-up due today",
      reason: visit.chief_complaint ?? "Review patient progress",
      dueAt: visit.next_follow_up,
      priority: sourceType === "missed_follow_up" ? 1 : hasAppointmentToday ? 3 : 2,
      visitId: visit.id,
      canRecordVisit: Boolean(patient),
    });
  }

  return rows.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
}

function summarizeAttention(items: AttentionItem[]): AttentionSummary {
  return {
    total: items.length,
    urgent: items.filter((item) => item.priority <= 2).length,
    appointmentsToday: items.filter((item) => item.sourceType === "appointment").length,
    overdueFollowUps: items.filter((item) => item.sourceType === "missed_follow_up").length,
    dueFollowUps: items.filter((item) => item.sourceType === "follow_up").length,
    missedAppointments: items.filter((item) => item.sourceType === "no_show").length,
    needsClosure: items.filter((item) => item.sourceType === "needs_closure").length,
  };
}

function attentionReason(appointmentReason?: string | null, followUpComplaint?: string | null) {
  const parts = [
    appointmentReason?.trim(),
    followUpComplaint?.trim() ? `Follow-up: ${followUpComplaint.trim()}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Open case or record visit";
}

function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function attentionLabel(sourceType: AttentionSourceType) {
  if (sourceType === "appointment") return "Today";
  if (sourceType === "follow_up") return "Follow-up";
  if (sourceType === "missed_follow_up") return "Overdue";
  if (sourceType === "no_show") return "No-show";
  return "Needs closure";
}

function attentionBadgeClass(sourceType: AttentionSourceType) {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold";
  if (sourceType === "missed_follow_up" || sourceType === "no_show") {
    return `${base} bg-destructive/10 text-destructive`;
  }
  if (sourceType === "needs_closure") return `${base} bg-amber-100 text-amber-800`;
  if (sourceType === "follow_up") return `${base} bg-primary/10 text-primary`;
  return `${base} bg-secondary text-secondary-foreground`;
}

function formatAttentionDue(value: string, sourceType: AttentionSourceType) {
  if (sourceType === "follow_up" || sourceType === "missed_follow_up") {
    return `Follow-up date ${localDateFromKey(value).toLocaleDateString()}`;
  }
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildAttentionWhatsAppMessage(item: AttentionItem) {
  const name = firstName(item.patientName);
  if (item.sourceType === "appointment") {
    return `Hi ${name}, this is a reminder for your appointment today at ${new Date(
      item.dueAt,
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}. Please reply Confirm if you can attend.`;
  }
  if (item.sourceType === "no_show" || item.sourceType === "needs_closure") {
    return `Hi ${name}, we missed you for your appointment. Please reply to reschedule your consultation.`;
  }
  return `Hi ${name}, your follow-up consultation is due. Please reply Confirm to book/review, or Reschedule if another time is better.`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function buildWhatsAppHref(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
