import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
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

  const appointmentsTodayValue = todayAppointmentsCount.data ?? 0;
  const waitingNowValue = attentionLoading ? null : attentionSummary.urgent;
  const followUpsDueValue = attentionLoading
    ? null
    : attentionSummary.dueFollowUps + attentionSummary.overdueFollowUps;
  const revenueTodayValue = 0;
  const outstandingValue = 0;

  const metricCards = [
    {
      icon: CalendarCheck,
      label: "Today",
      value: todayAppointmentsCount.isLoading ? "—" : appointmentsTodayValue,
      meta: todayAppointmentsCount.isLoading
        ? "Loading schedule"
        : appointmentsTodayValue > 0
          ? `${appointmentsTodayValue} scheduled today`
          : "No appointments today",
      tone: "teal",
    },
    {
      icon: AlertTriangle,
      label: "Attention",
      value: waitingNowValue ?? "—",
      meta: attentionLoading
        ? "Checking queue"
        : waitingNowValue && waitingNowValue > 0
          ? `${waitingNowValue} need attention`
          : "No patients waiting",
      tone: "blue",
    },
    {
      icon: Clock,
      label: "Follow-ups",
      value: followUpsDueValue ?? "—",
      meta: attentionLoading
        ? "Checking follow-ups"
        : followUpsDueValue && followUpsDueValue > 0
          ? attentionSummary.overdueFollowUps > 0
            ? `${attentionSummary.overdueFollowUps} overdue`
            : "Due today"
          : "No follow-ups due",
      tone: "purple",
    },
    {
      icon: DollarSign,
      label: "Revenue",
      value: `₹${revenueTodayValue.toLocaleString("en-IN")}`,
      meta: revenueTodayValue > 0 ? "Payments recorded" : "No payments today",
      tone: "amber",
    },
    {
      icon: ReceiptText,
      label: "Dues",
      value: `₹${outstandingValue.toLocaleString("en-IN")}`,
      meta: outstandingValue > 0 ? "Unpaid balance" : "No unpaid bills",
      tone: "red",
    },
  ];

  const quickActions = [
    {
      icon: UserPlus,
      title: "New Patient",
      detail: "Register & open case",
      to: "/app/patients/new" as const,
      tone: "teal",
    },
    {
      icon: CalendarPlus,
      title: "New Appointment",
      detail: "Book a visit slot",
      to: "/app/appointments" as const,
      tone: "purple",
    },
    {
      icon: Stethoscope,
      title: "Start Consultation",
      detail: "Open patient case",
      to: "/app/patients" as const,
      tone: "green",
    },
    {
      icon: FileText,
      title: "Write Prescription",
      detail: "For existing patient",
      to: "/app/patients" as const,
      tone: "amber",
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

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!loading && !clinicLoading && role !== "patient" && !clinic) {
    return <ClinicSetupCard />;
  }

  return (
    <div className="min-h-screen bg-[#f6f8f9]">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <DashboardSidebar doctorName={user?.user_metadata?.full_name} clinicName={clinic?.name} />

        <main className="min-w-0 bg-[#f6f8f9]">
          <DashboardTopbar doctorName={user?.user_metadata?.full_name} />

          <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
            <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="font-serif text-[32px] font-bold leading-tight tracking-normal text-[#111827] sm:text-[38px]">
                  {greeting()},{" "}
                  <span className="text-[#0b8f7f]">
                    Dr. {user?.user_metadata?.full_name ?? "Doctor"}
                  </span>
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Here is your clinic overview for today —{" "}
                  {new Date().toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    weekday: "long",
                  })}
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-2xl bg-[#c9f7ea] px-5 py-3 text-sm font-semibold text-[#087466]">
                <span className="h-2 w-2 rounded-full bg-[#0b8f7f]" />
                Clinic Open
              </span>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => (
                <QuickActionCard key={action.title} {...action} />
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[repeat(5,minmax(0,1fr))]">
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

            <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
              <AttentionQueue
                loading={attentionLoading}
                items={attentionItems}
                summary={attentionSummary}
                updatingAppointmentId={setAppointmentStatus.variables?.id}
                onSetAppointmentStatus={(id, status) => setAppointmentStatus.mutate({ id, status })}
              />
              <AppointmentPanel
                title="Today's Schedule"
                loading={todayAppointments.isLoading}
                appointments={todayAppointments.data ?? []}
                empty="No appointments today."
                showVisitAction
                compact
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-bold tracking-normal text-slate-950">{title}</h2>
        <Link
          to="/app/appointments"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b8f7f]"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
          Loading appointments...
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-1">
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
    { section: true, label: "Operational" },
    { icon: Package, label: "Inventory", href: "/app/remedies" },
    { icon: BarChart3, label: "Follow-ups", href: "/app/follow-ups" },
  ];

  return (
    <aside className="hidden bg-[#101b24] px-5 py-7 text-[#8fa1ad] lg:flex lg:min-h-screen lg:flex-col">
      <div className="flex items-center gap-3 text-white">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b8f7f] text-white shadow-soft">
          <HeartPulse className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight text-white">HomeoCare</p>
          <p className="text-xs font-medium text-[#7f919d]">Doctor Portal</p>
        </div>
      </div>

      <nav className="mt-10 space-y-2">
        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#536673]">
          Clinical
        </p>
        {nav.map((item) =>
          "section" in item ? (
            <p
              key={item.label}
              className="px-1 pb-1 pt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#536673]"
            >
              {item.label}
            </p>
          ) : (
            <a
              key={item.label}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-smooth ${
                item.active
                  ? "bg-[#153743] text-[#45d2bd]"
                  : "text-[#8fa1ad] hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.active && <span className="h-1.5 w-1.5 rounded-full bg-[#45d2bd]" />}
            </a>
          ),
        )}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-5">
        <a
          href="/app/clinic"
          className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-[#8fa1ad] transition-smooth hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </a>
        <a
          href="/app/whatsapp-status"
          className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-[#8fa1ad] transition-smooth hover:bg-white/5 hover:text-white"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          Help & Support
        </a>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b8f7f] text-sm font-bold text-white">
            {initials(doctorName ?? "Doctor")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">Dr. {doctorName ?? "Doctor"}</p>
            <p className="truncate text-xs text-[#8fa1ad]">{clinicName ?? "HomeoCare Clinic"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DashboardTopbar({ doctorName }: { doctorName?: string | null }) {
  const today = new Date();

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition-smooth hover:bg-slate-100"
            aria-label="Open dashboard menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden w-full min-w-0 md:block lg:w-[430px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search patients, appointments..."
              className="h-11 w-full rounded-xl border border-[#e6eaee] bg-[#f8fafb] pl-11 pr-16 text-sm text-slate-900 outline-none transition-smooth focus:border-[#0b8f7f]/40 focus:bg-white focus:ring-4 focus:ring-[#0b8f7f]/10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 sm:inline">
              ⌘ K
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 text-xs text-slate-900 sm:text-sm">
          <div className="hidden items-center gap-2 px-2.5 py-2 font-semibold sm:inline-flex">
            <CalendarCheck className="h-4 w-4 text-slate-700" />
            {today.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              weekday: "short",
            })}
          </div>
          <div className="relative hidden h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 sm:flex">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#e34262]" />
          </div>
          <div className="relative hidden h-10 w-10 items-center justify-center rounded-xl bg-[#f8fafb] text-[#0b8f7f] sm:flex">
            <MessageCircle className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 rounded-full bg-[#0b8f7f] px-1 text-[10px] font-bold leading-4 text-white">
              4
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl px-1.5 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b8f7f] text-xs font-bold text-white">
              {initials(doctorName ?? "Doctor")}
            </div>
            <span className="hidden font-semibold sm:inline">Dr. {doctorName ?? "Doctor"}</span>
            <ChevronRight className="hidden h-4 w-4 rotate-90 text-slate-400 sm:block" />
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
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  to: string;
  tone: string;
}) {
  return (
    <a
      href={to}
      className="group flex min-h-[90px] items-center gap-4 rounded-2xl border border-[#e6eaee] bg-white px-5 py-4 shadow-card transition-smooth hover:-translate-y-0.5 hover:border-[#0b8f7f]/30 hover:shadow-soft"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${quickActionTone(tone)}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-slate-950">{title}</p>
        <p className="mt-1 text-xs leading-tight text-slate-500">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0b8f7f]" />
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
    <div className="flex min-h-[166px] flex-col rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metricTone(tone)}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <MiniTrend tone={tone} />
      </div>
      <p className="mt-5 text-[30px] font-bold leading-none tracking-normal text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs leading-snug text-slate-500">{meta}</p>
      <p className="mt-auto pt-4 text-sm font-semibold text-slate-700">{label}</p>
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
    <section className="rounded-2xl border border-[#c9f7ea] bg-[#effbf7] p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">Finish first clinic setup</p>
          <p className="text-xs text-muted-foreground">
            Shown only while your clinic is still empty. Full setup remains available in settings.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0b8f7f] shadow-soft">
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-slate-950">{title}</h2>
        {href && (
          <a href={href} className="text-xs font-bold text-[#0b8f7f]">
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
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function ProTip() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#c9f7ea] bg-[#effbf7] p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b8f7f] shadow-soft">
          <Lightbulb className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Pro Tip</span> Use Start Consultation to add
          diagnosis, prescription, and follow-up for a patient.
        </p>
      </div>
      <button type="button" className="self-start text-xs font-bold text-[#0b8f7f] sm:self-auto">
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b8f7f]">
            Priority work
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold tracking-normal text-slate-950">
            Today&apos;s Queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Appointments, follow-ups, missed visits, and work needing closure.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>{summary.total} patients</span>
          {summary.urgent > 0 && (
            <span className="rounded-full bg-[#fff0f4] px-2.5 py-1 text-xs font-bold text-[#e34262]">
              {summary.urgent} urgent
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <AttentionSummaryPill label="Today visits" value={summary.appointmentsToday} />
        <AttentionSummaryPill label="Due follow-ups" value={summary.dueFollowUps} />
        <AttentionSummaryPill label="Overdue follow-ups" value={summary.overdueFollowUps} urgent />
        <AttentionSummaryPill label="No-shows" value={summary.missedAppointments} urgent />
        <AttentionSummaryPill label="Needs closure" value={summary.needsClosure} urgent />
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
          Loading today&apos;s attention queue...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e8fbf6] text-[#0b8f7f]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-950">No pending patient actions</p>
          <p className="mt-1 text-xs text-slate-500">Today&apos;s clinic queue is clear.</p>
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
      className={`rounded-xl border px-3 py-2 ${
        urgent && value > 0
          ? "border-[#ffdbe4] bg-[#fff0f4] text-[#e34262]"
          : "border-slate-200 bg-slate-50 text-slate-900"
      }`}
    >
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3 lg:flex-1">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              item.priority <= 2 ? "bg-[#fff0f4] text-[#e34262]" : "bg-[#e8fbf6] text-[#0b8f7f]"
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
              <p className="font-semibold text-slate-950">{item.patientName}</p>
              <span className={attentionBadgeClass(item.sourceType)}>
                {attentionLabel(item.sourceType)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{item.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">
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
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-smooth hover:bg-slate-100"
            >
              <FileText className="h-3.5 w-3.5" /> Case
            </a>
          )}
          {recordVisitHref && (
            <a
              href={recordVisitHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0b8f7f] px-3 text-xs font-semibold text-white shadow-soft"
            >
              <Stethoscope className="h-3.5 w-3.5" /> Record visit
            </a>
          )}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-smooth hover:bg-slate-100"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#c9f7ea] bg-[#e8fbf6] px-3 text-xs font-semibold text-[#0b8f7f] transition-smooth hover:bg-[#dff8f2] disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </button>
          )}
          {item.appointmentId && item.canMarkNoShow && (
            <button
              type="button"
              onClick={() => onSetAppointmentStatus(item.appointmentId!, "no_show")}
              disabled={updatingAppointmentId === item.appointmentId}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffdbe4] bg-[#fff0f4] px-3 text-xs font-semibold text-[#e34262] transition-smooth hover:bg-[#ffe5ec] disabled:opacity-60"
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
      <div className="grid grid-cols-[82px_1fr_auto] items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "completed"
                ? "bg-[#0b8f7f]"
                : status === "no_show"
                  ? "bg-[#e34262]"
                  : isAppointmentPast(appointment)
                    ? "bg-[#d89a00]"
                    : "bg-[#2563eb]"
            }`}
          />
          {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">
            {patient?.full_name ?? "Unknown patient"}
          </p>
          <p className="truncate text-xs text-slate-500">
            {appointment.reason ?? "Consultation"} · {appointment.duration_minutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={scheduleStatusClass(status)}>{scheduleStatusLabel(appointment)}</span>
          {patient && showVisitAction && (
            <a
              href={`/app/patients/${patient.id}?newVisit=1&appointmentId=${appointment.id}`}
              className="hidden rounded-full bg-[#e8fbf6] px-3 py-1.5 text-xs font-bold text-[#0b8f7f] transition-smooth hover:bg-[#dff8f2] sm:inline-flex"
            >
              Start
            </a>
          )}
          {patient && (
            <a href={`/app/patients/${patient.id}`} aria-label={`Open ${patient.full_name}`}>
              <ChevronRight className="h-4 w-4 text-slate-400" />
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
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0b8f7f] px-3 text-xs font-semibold text-white shadow-soft"
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
  if (tone === "blue") return "border-[#dbeafe] bg-[#eef6ff] text-[#2563eb]";
  if (tone === "purple") return "border-[#eadcff] bg-[#f3ebff] text-[#7c3aed]";
  if (tone === "red") return "border-[#ffdbe4] bg-[#fff0f4] text-[#e34262]";
  if (tone === "amber") return "border-[#ffefc2] bg-[#fff7df] text-[#d89a00]";
  return "border-[#c9f7ea] bg-[#e8fbf6] text-[#0b8f7f]";
}

function quickActionTone(tone: string) {
  if (tone === "purple") return "bg-[#f3ebff] text-[#7c3aed]";
  if (tone === "amber") return "bg-[#fff3cf] text-[#d89a00]";
  if (tone === "green") return "bg-[#dff9ef] text-[#13a476]";
  return "bg-[#dff8f2] text-[#0b8f7f]";
}

function trendTone(tone: string) {
  if (tone === "blue") return "text-[#2563eb]";
  if (tone === "purple") return "text-[#7c3aed]";
  if (tone === "red") return "text-[#e34262]";
  if (tone === "amber") return "text-[#d89a00]";
  return "text-[#0b8f7f]";
}

function MiniTrend({ tone }: { tone: string }) {
  return (
    <svg className={`mt-1 h-9 w-16 ${trendTone(tone)}`} viewBox="0 0 64 36" aria-hidden="true">
      <path
        d="M2 28 L10 24 L17 16 L25 23 L32 8 L41 20 L49 13 L62 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        opacity="0.7"
      />
    </svg>
  );
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
  if (status === "completed") return `${base} bg-[#e8fbf6] text-[#0b8f7f]`;
  if (status === "cancelled") return `${base} bg-muted text-muted-foreground`;
  if (status === "no_show") return `${base} bg-[#fff0f4] text-[#e34262]`;
  return `${base} bg-[#eef6ff] text-[#2563eb]`;
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
    return `${base} bg-[#fff0f4] text-[#e34262]`;
  }
  if (sourceType === "needs_closure") return `${base} bg-[#fff3cf] text-[#b67b00]`;
  if (sourceType === "follow_up") return `${base} bg-[#e8fbf6] text-[#0b8f7f]`;
  return `${base} bg-[#eef6ff] text-[#2563eb]`;
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
