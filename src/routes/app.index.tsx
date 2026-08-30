import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  HelpCircle,
  HeartPulse,
  Home,
  Lightbulb,
  Menu,
  MessageCircle,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Stethoscope,
  UserPlus,
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

type DashboardPatient = {
  id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
};

type RemedyAlert = {
  id: string;
  name: string;
  potency: string | null;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
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
        .select("id, patient_id, scheduled_at, duration_minutes, status, reason")
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
        .select("id, patient_id, scheduled_at, duration_minutes, status, reason")
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

  const lowStockRemedies = useQuery({
    queryKey: ["low-stock-remedies", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remedies")
        .select("id, name, potency, quantity, unit, low_stock_threshold")
        .eq("clinic_id", clinic!.id)
        .order("quantity", { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data ?? []).filter(
        (r) => Number(r.quantity) <= Number(r.low_stock_threshold),
      ) as RemedyAlert[];
    },
  });

  const recentPatients = useQuery({
    queryKey: ["recent-dashboard-patients", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, phone, created_at")
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as DashboardPatient[];
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

  const metricCards = [
    {
      icon: CalendarCheck,
      label: "Appointments Today",
      value: todayAppointmentsCount.data ?? "—",
      meta: `${todayAppointmentsCount.data ?? "—"} remaining`,
      tone: "teal",
    },
    {
      icon: Users,
      label: "Waiting Now",
      value: attentionLoading ? "—" : attentionSummary.appointmentsToday,
      meta: `${attentionSummary.urgent} urgent`,
      tone: "blue",
    },
    {
      icon: HeartPulse,
      label: "Follow-ups Due",
      value: attentionLoading
        ? "—"
        : attentionSummary.dueFollowUps + attentionSummary.overdueFollowUps,
      meta: `${attentionSummary.overdueFollowUps} overdue`,
      tone: "purple",
    },
    {
      icon: AlertTriangle,
      label: "Needs Attention",
      value: attentionLoading ? "—" : attentionSummary.total,
      meta: "Work queue",
      tone: "red",
    },
    {
      icon: Package,
      label: "Inventory Alerts",
      value: lowStockRemedies.isLoading ? "—" : (lowStockRemedies.data ?? []).length,
      meta: "Low stock",
      tone: "amber",
    },
  ];

  const quickActions = [
    {
      icon: UserPlus,
      title: "New Patient",
      detail: "Add a patient",
      to: "/app/patients/new" as const,
    },
    {
      icon: CalendarPlus,
      title: "New Appointment",
      detail: "Book a visit",
      to: "/app/appointments" as const,
    },
    {
      icon: Stethoscope,
      title: "Start Consultation",
      detail: "Open patient case",
      to: "/app/patients" as const,
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
  const showOnboarding =
    completedSteps < onboardingSteps.length &&
    (patientCount.data ?? 0) === 0 &&
    (todayAppointmentsCount.data ?? 0) === 0;

  if (!loading && role == null) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!loading && !clinicLoading && role !== "patient" && !clinic) {
    return <ClinicSetupCard />;
  }

  return (
    <div className="bg-[#f8fbfa]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1500px] lg:grid-cols-[250px_1fr]">
        <DashboardSidebar doctorName={user?.user_metadata?.full_name} clinicName={clinic?.name} />

        <main className="min-w-0 border-l border-border/70 bg-background/80">
          <DashboardTopbar doctorName={user?.user_metadata?.full_name} />

          <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-7">
            <section className="grid gap-4 xl:grid-cols-[1fr_2fr] xl:items-center">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {greeting()}, Dr. {user?.user_metadata?.full_name ?? "Doctor"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Here&apos;s your clinic overview for today.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {quickActions.map((action) => (
                  <QuickActionCard key={action.title} {...action} />
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {metricCards.map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </section>

            {showOnboarding && (
              <OnboardingPanel
                completedSteps={completedSteps}
                totalSteps={onboardingSteps.length}
                steps={onboardingSteps}
              />
            )}

            <section className="grid gap-5 xl:grid-cols-[1.05fr_1.2fr]">
              <AppointmentPanel
                title="Today's Schedule"
                loading={todayAppointments.isLoading}
                appointments={todayAppointments.data ?? []}
                empty="No appointments today."
                showVisitAction
                compact
              />
              <AttentionQueue
                loading={attentionLoading}
                items={attentionItems}
                summary={attentionSummary}
                updatingAppointmentId={setAppointmentStatus.variables?.id}
                onSetAppointmentStatus={(id, status) => setAppointmentStatus.mutate({ id, status })}
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <InventoryAlerts
                remedies={lowStockRemedies.data ?? []}
                loading={lowStockRemedies.isLoading}
              />
              <RecentPatients
                patients={recentPatients.data ?? []}
                loading={recentPatients.isLoading}
              />
              <QuickNotes />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <AppointmentPanel
                title="Upcoming Appointments"
                loading={upcomingAppointments.isLoading}
                appointments={upcomingAppointments.data ?? []}
                empty="No upcoming scheduled appointments."
              />
              <FollowUpRemindersCard clinicId={clinic?.id} />
            </section>

            <ProTip />
          </div>
        </main>
      </div>
    </div>
  );
}

function AppointmentPanel({
  title,
  loading,
  appointments,
  empty,
  showVisitAction,
  compact,
}: {
  title: string;
  loading: boolean;
  appointments: DashboardAppointment[];
  empty: string;
  showVisitAction?: boolean;
  compact?: boolean;
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
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardSidebar({
  doctorName,
  clinicName,
}: {
  doctorName?: string | null;
  clinicName?: string | null;
}) {
  const nav = [
    { icon: Home, label: "Dashboard", href: "/app", active: true },
    { icon: CalendarCheck, label: "Appointments", href: "/app/appointments" },
    { icon: Users, label: "Patients", href: "/app/patients" },
    { icon: Stethoscope, label: "Consultations", href: "/app/patients" },
    { icon: ReceiptText, label: "Prescriptions", href: "/app/patients" },
    { icon: Package, label: "Inventory", href: "/app/remedies" },
    { icon: BarChart3, label: "Follow-ups", href: "/app/follow-ups" },
  ];

  return (
    <aside className="hidden bg-card px-5 py-7 lg:block">
      <div className="flex items-center gap-3 text-primary">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <HeartPulse className="h-6 w-6" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight text-foreground">HomeoCare</p>
          <p className="text-xs font-medium text-muted-foreground">Doctor</p>
        </div>
      </div>

      <nav className="mt-8 space-y-1.5">
        {nav.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-smooth ${
              item.active
                ? "bg-gradient-soft text-primary shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </a>
        ))}
      </nav>

      <div className="mt-12 border-t border-border/70 pt-5">
        <a
          href="/app/clinic"
          className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </a>
        <a
          href="/app/whatsapp-status"
          className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          Help & Support
        </a>
      </div>

      <div className="mt-10 rounded-2xl border border-border/70 bg-background p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
            {initials(doctorName ?? "Doctor")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              Dr. {doctorName ?? "Doctor"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {clinicName ?? "HomeoCare Clinic"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DashboardTopbar({ doctorName }: { doctorName?: string | null }) {
  const today = new Date();

  return (
    <div className="sticky top-16 z-30 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-7">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground lg:hidden"
            aria-label="Open dashboard menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative w-full min-w-0 lg:w-[430px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search patients, appointments..."
              className="h-11 w-full rounded-2xl border border-border bg-card pl-11 pr-16 text-sm text-foreground shadow-soft outline-none transition-smooth focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground sm:inline">
              Ctrl K
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-foreground lg:justify-end">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-card px-3 py-2 font-semibold shadow-soft">
            <CalendarCheck className="h-4 w-4 text-primary" />
            {today.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              weekday: "short",
            })}
          </div>
          <div className="hidden h-9 w-9 items-center justify-center rounded-2xl bg-card text-primary shadow-soft sm:flex">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-soft">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
              {initials(doctorName ?? "Doctor")}
            </div>
            <span className="hidden font-semibold sm:inline">Dr. {doctorName ?? "Doctor"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  detail,
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  to: string;
}) {
  return (
    <a
      href={to}
      className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-soft transition-smooth hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  meta,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  meta: string;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-soft ${metricTone(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-8 w-16 rounded-full bg-current/10" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{meta}</p>
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

function OnboardingPanel({
  completedSteps,
  totalSteps,
  steps,
}: {
  completedSteps: number;
  totalSteps: number;
  steps: Array<{ label: string; detail: string; done: boolean; to: string }>;
}) {
  return (
    <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">Finish first clinic setup</p>
          <p className="text-xs text-muted-foreground">
            Shown only while your clinic is still empty. Full setup remains available in settings.
          </p>
        </div>
        <span className="rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-soft">
          {completedSteps}/{totalSteps} done
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps
          .filter((step) => !step.done)
          .slice(0, 3)
          .map((step) => (
            <a
              key={step.label}
              href={step.to}
              className="rounded-2xl border border-border/60 bg-card p-3 text-sm shadow-soft transition-smooth hover:-translate-y-0.5 hover:shadow-card"
            >
              <p className="font-semibold text-foreground">{step.label}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p>
            </a>
          ))}
      </div>
    </section>
  );
}

function InventoryAlerts({ remedies, loading }: { remedies: RemedyAlert[]; loading: boolean }) {
  return (
    <DashboardPanel title="Inventory Alerts" href="/app/remedies">
      {loading ? (
        <PanelEmpty>Loading inventory...</PanelEmpty>
      ) : remedies.length === 0 ? (
        <PanelEmpty>No low-stock remedies.</PanelEmpty>
      ) : (
        <div className="space-y-3">
          {remedies.slice(0, 4).map((remedy) => {
            const empty = Number(remedy.quantity) <= 0;
            return (
              <div key={remedy.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      empty ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {remedy.name}
                      {remedy.potency ? ` ${remedy.potency}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {empty ? "Out of stock" : `Low stock (${remedy.quantity} ${remedy.unit})`}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    empty ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {empty ? "Out" : "Reorder"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}

function RecentPatients({ patients, loading }: { patients: DashboardPatient[]; loading: boolean }) {
  return (
    <DashboardPanel title="Recent Patients" href="/app/patients">
      {loading ? (
        <PanelEmpty>Loading patients...</PanelEmpty>
      ) : patients.length === 0 ? (
        <PanelEmpty>No patients added yet.</PanelEmpty>
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => (
            <a
              key={patient.id}
              href={`/app/patients/${patient.id}`}
              className="flex items-center justify-between gap-3 rounded-xl px-1 py-1 transition-smooth hover:bg-muted"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {initials(patient.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{patient.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {patient.phone ?? "No mobile number"}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function QuickNotes() {
  return (
    <DashboardPanel title="Quick Notes">
      <div className="rounded-2xl border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
        Add a quick note or reminder...
      </div>
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/60 p-6 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
      </div>
    </DashboardPanel>
  );
}

function DashboardPanel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {href && (
          <a href={href} className="text-xs font-bold text-primary">
            View all
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ProTip() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-soft">
          <Lightbulb className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Pro Tip</span> Use Start Consultation to add
          diagnosis, prescription, and follow-up for a patient.
        </p>
      </div>
      <button type="button" className="self-start text-xs font-bold text-primary sm:self-auto">
        Dismiss
      </button>
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
  compact,
}: {
  appointment: DashboardAppointment;
  showVisitAction?: boolean;
  compact?: boolean;
}) {
  const dt = new Date(appointment.scheduled_at);
  const patient = appointment.patient;
  const status = appointment.status ?? "scheduled";

  if (compact) {
    return (
      <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "completed"
                ? "bg-primary"
                : status === "no_show"
                  ? "bg-destructive"
                  : isAppointmentPast(appointment)
                    ? "bg-amber-500"
                    : "bg-blue-500"
            }`}
          />
          {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {patient?.full_name ?? "Unknown patient"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {appointment.reason ?? "Consultation"} · {appointment.duration_minutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={scheduleStatusClass(status)}>{scheduleStatusLabel(appointment)}</span>
          {patient && showVisitAction && (
            <a
              href={`/app/patients/${patient.id}?newVisit=1&appointmentId=${appointment.id}`}
              className="hidden rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-smooth hover:bg-primary/15 sm:inline-flex"
            >
              Start
            </a>
          )}
          {patient && (
            <a href={`/app/patients/${patient.id}`} aria-label={`Open ${patient.full_name}`}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          )}
        </div>
      </div>
    );
  }

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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function metricTone(tone: string) {
  if (tone === "blue") return "border-blue-100 bg-blue-50/80 text-blue-600";
  if (tone === "purple") return "border-violet-100 bg-violet-50/80 text-violet-600";
  if (tone === "red") return "border-red-100 bg-red-50/80 text-red-600";
  if (tone === "amber") return "border-amber-100 bg-amber-50/80 text-amber-600";
  return "border-teal-100 bg-teal-50/80 text-teal-600";
}

function isAppointmentPast(appointment: DashboardAppointment) {
  return (
    new Date(appointment.scheduled_at).getTime() + appointment.duration_minutes * 60000 < Date.now()
  );
}

function scheduleStatusLabel(appointment: DashboardAppointment) {
  const status = appointment.status ?? "scheduled";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "no_show") return "No-show";
  return isAppointmentPast(appointment) ? "Due now" : "Upcoming";
}

function scheduleStatusClass(status: AppointmentStatus) {
  const base = "hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex";
  if (status === "completed") return `${base} bg-primary/10 text-primary`;
  if (status === "cancelled") return `${base} bg-muted text-muted-foreground`;
  if (status === "no_show") return `${base} bg-destructive/10 text-destructive`;
  return `${base} bg-blue-50 text-blue-700`;
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
