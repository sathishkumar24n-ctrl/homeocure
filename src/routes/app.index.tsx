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
      tone: "violet",
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
      tone: "amber",
    },
    {
      icon: DollarSign,
      label: "Revenue",
      value: `₹${revenueTodayValue.toLocaleString("en-IN")}`,
      meta: revenueTodayValue > 0 ? "Payments recorded" : "No payments today",
      tone: "emerald",
    },
    {
      icon: ReceiptText,
      label: "Dues",
      value: `₹${outstandingValue.toLocaleString("en-IN")}`,
      meta: outstandingValue > 0 ? "Unpaid balance" : "No unpaid bills",
      tone: "rose",
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
      tone: "violet",
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
    <div className="h-screen overflow-hidden bg-[#f7f8fa] text-[#0f1923]">
      <div className="grid h-screen lg:grid-cols-[240px_1fr]">
        <DashboardSidebar doctorName={user?.user_metadata?.full_name} clinicName={clinic?.name} />

        <main className="flex min-w-0 flex-col overflow-hidden bg-[#f7f8fa]">
          <DashboardTopbar doctorName={user?.user_metadata?.full_name} />

          <div className="mx-auto w-full max-w-6xl flex-1 space-y-8 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="font-display text-[36px] leading-tight tracking-normal text-[#0f1923] lg:text-[40px]">
                  {greeting()},{" "}
                  <span className="text-[#0d9488]">
                    Dr. {user?.user_metadata?.full_name ?? "Doctor"}
                  </span>
                </h1>
                <p className="mt-1 text-sm font-normal text-[#5a6473]">
                  Here is your clinic overview for today —{" "}
                  {new Date().toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    weekday: "long",
                  })}
                </p>
              </div>
              <span className="hidden w-fit items-center gap-2 rounded-xl bg-[#ccfbf1] px-4 py-2 text-sm font-medium text-[#0f766e] md:inline-flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0d9488]" />
                Clinic Open
              </span>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => (
                <QuickActionCard key={action.title} {...action} />
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
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

            <section className="grid gap-6 xl:grid-cols-3">
              <AttentionQueue
                loading={attentionLoading}
                items={attentionItems}
                summary={attentionSummary}
                updatingAppointmentId={setAppointmentStatus.variables?.id}
                onSetAppointmentStatus={(id, status) => setAppointmentStatus.mutate({ id, status })}
              />
              <div className="xl:col-span-1">
                <AppointmentPanel
                  title="Schedule"
                  loading={todayAppointments.isLoading}
                  appointments={todayAppointments.data ?? []}
                  empty="No appointments today."
                  showVisitAction
                  compact
                />
              </div>
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
    <div className="overflow-hidden rounded-2xl border border-[#e5e9ef] bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5e9ef] px-5 pb-4 pt-5">
        <h2 className="font-display text-xl leading-tight tracking-normal text-[#0f1923]">
          {title}
        </h2>
        <Link
          to="/app/appointments"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#0d9488]"
        >
          + Book <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="m-5 rounded-2xl border border-[#e5e9ef] bg-[#f7f8fa] p-5 text-center text-sm text-[#9aa3ae]">
          Loading appointments...
        </div>
      ) : appointments.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f8fa] text-[#9aa3ae]">
            <CalendarPlus className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-[#0f1923]">{empty}</p>
          <p className="mx-auto mt-1 max-w-[200px] text-xs leading-5 text-[#9aa3ae]">
            Open a slot to keep the clinic day visible.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#e5e9ef]">
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
    <aside className="hidden bg-[#0f1923] text-[#94a3b8] lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#1c2b38] px-5 py-6 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0d9488] text-white">
          <HeartPulse className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">HomeoCare</p>
          <p className="text-xs font-normal text-[#64748b]">Doctor Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <div>
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-widest text-[#475569]">
            Clinical
          </p>
          {nav.map((item) =>
            "section" in item ? (
              <p
                key={item.label}
                className="mb-2 mt-6 px-2 text-[11px] font-medium uppercase tracking-widest text-[#475569]"
              >
                {item.label}
              </p>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className={`group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth ${
                  item.active
                    ? "bg-[#1a3a4a] text-[#2dd4bf]"
                    : "text-[#94a3b8] hover:bg-[#1c2b38] hover:text-[#cbd5e1]"
                }`}
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{item.label}</span>
                {item.active && <span className="h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" />}
              </a>
            ),
          )}
        </div>
      </nav>

      <div className="border-t border-[#1c2b38] px-4 py-4">
        <a
          href="/app/clinic"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#94a3b8] transition-smooth hover:bg-[#1c2b38] hover:text-[#cbd5e1]"
        >
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </a>
        <a
          href="/app/whatsapp-status"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#94a3b8] transition-smooth hover:bg-[#1c2b38] hover:text-[#cbd5e1]"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          Help & Support
        </a>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1c2b38] bg-white/[0.03] p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d9488] text-sm font-bold text-white">
            {initials(doctorName ?? "Doctor")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Dr. {doctorName ?? "Doctor"}</p>
            <p className="truncate text-xs text-[#64748b]">
              {clinicName ?? "BHMS · General Practice"}
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
    <div className="h-16 shrink-0 border-b border-[#e5e9ef] bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#5a6473] transition-smooth hover:bg-[#f7f8fa] lg:hidden"
            aria-label="Open dashboard menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden w-full min-w-0 md:block lg:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa3ae]" />
            <input
              placeholder="Search patients, appointments..."
              className="h-10 w-full rounded-[10px] border border-[#e5e9ef] bg-[#f7f8fa] pl-9 pr-16 text-sm text-[#0f1923] outline-none transition-smooth placeholder:text-[#c5cbd3] focus:border-[#0d9488] focus:bg-white focus:ring-[3px] focus:ring-[#0d9488]/10"
            />
            <span className="font-mono pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded bg-[#e5e9ef] px-1.5 py-1 text-[10px] font-medium text-[#9aa3ae] sm:inline">
              ⌘ K
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 text-sm text-[#5a6473]">
          <div className="hidden items-center gap-2 font-medium sm:inline-flex">
            <CalendarCheck className="h-[15px] w-[15px] text-[#5a6473]" />
            {today.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              weekday: "short",
            })}
          </div>
          <div className="relative hidden h-9 w-9 items-center justify-center rounded-lg bg-[#f7f8fa] text-[#5a6473] sm:flex">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-[#f43f5e]" />
          </div>
          <div className="relative hidden h-9 w-9 items-center justify-center rounded-lg bg-[#f7f8fa] text-[#0d9488] sm:flex">
            <MessageCircle className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#f7f8fa] bg-[#0d9488] px-1 text-[9px] font-bold leading-none text-white">
              4
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl px-1.5 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d9488] text-xs font-bold text-white">
              {initials(doctorName ?? "Doctor")}
            </div>
            <span className="hidden font-medium text-[#0f1923] sm:inline">
              Dr. {doctorName ?? "Doctor"}
            </span>
            <ChevronRight className="hidden h-4 w-4 rotate-90 text-[#9aa3ae] sm:block" />
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
      className={`group flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#e5e9ef] bg-white px-4 py-4 shadow-card transition-smooth hover:shadow-soft ${quickActionHoverTone(tone)}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${quickActionTone(tone)}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[#0f1923]">{title}</p>
        <p className="mt-1 text-xs leading-tight text-[#9aa3ae]">{detail}</p>
      </div>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 opacity-30 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 ${quickActionChevronTone(tone)}`}
      />
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
    <div className="flex min-h-[140px] flex-col gap-3 rounded-2xl border border-[#e5e9ef] bg-white p-4 shadow-card transition-smooth hover:shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${metricTone(tone)}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <MiniTrend tone={tone} />
      </div>
      <div>
        <p className="font-display text-[28px] leading-none tracking-normal text-[#0f1923]">
          {value}
        </p>
        <p className="mt-1 text-xs font-normal leading-snug text-[#9aa3ae]">{meta}</p>
      </div>
      <p className="mt-auto text-xs font-medium text-[#5a6473]">{label}</p>
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
    <section className="rounded-2xl border border-[#ccfbf1] bg-[#f0fdfa] p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">Finish first clinic setup</p>
          <p className="text-xs text-muted-foreground">
            Shown only while your clinic is still empty. Full setup remains available in settings.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0d9488] shadow-card">
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
              className="rounded-xl border border-[#e5e9ef] bg-white p-3 text-sm shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-soft"
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
    <section className="rounded-2xl border border-[#e5e9ef] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl leading-tight tracking-normal text-[#0f1923]">
          {title}
        </h2>
        {href && (
          <a href={href} className="text-xs font-medium text-[#0d9488]">
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
    <div className="rounded-2xl border border-dashed border-[#e5e9ef] bg-[#f7f8fa] p-6 text-center text-sm text-[#9aa3ae]">
      {children}
    </div>
  );
}

function ProTip() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#ccfbf1] bg-[#f0fdfa] p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0d9488] shadow-card">
          <Lightbulb className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Pro Tip</span> Use Start Consultation to add
          diagnosis, prescription, and follow-up for a patient.
        </p>
      </div>
      <button type="button" className="self-start text-xs font-bold text-[#0d9488] sm:self-auto">
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
    <section className="overflow-hidden rounded-2xl border border-[#e5e9ef] bg-white shadow-card xl:col-span-2">
      <div className="flex flex-col gap-3 border-b border-[#e5e9ef] px-5 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0d9488]">
            Priority work
          </p>
          <h2 className="mt-0.5 font-display text-xl leading-tight tracking-normal text-[#0f1923]">
            Today&apos;s Queue
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#5a6473]">
            Appointments, follow-ups, missed visits, and work needing closure.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#9aa3ae]">
          <span>{summary.total} patients</span>
          {summary.urgent > 0 && (
            <span className="font-mono rounded-full bg-[#ffe4e6] px-2 py-1 text-[11px] font-medium text-[#f43f5e]">
              {summary.urgent} urgent
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-[#e5e9ef] px-5 py-3">
        <QueueFilterChip active>All</QueueFilterChip>
        <QueueFilterChip>Urgent</QueueFilterChip>
        <QueueFilterChip>Active</QueueFilterChip>
        <QueueFilterChip>Follow-up</QueueFilterChip>
        <QueueFilterChip>Missed</QueueFilterChip>
      </div>

      {loading ? (
        <div className="m-5 rounded-2xl border border-[#e5e9ef] bg-[#f7f8fa] p-5 text-center text-sm text-[#9aa3ae]">
          Loading today&apos;s attention queue...
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ccfbf1] text-[#0d9488]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-[#0f1923]">No pending patient actions</p>
          <p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-[#9aa3ae]">
            Today&apos;s clinic queue is clear.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#e5e9ef]">
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

function QueueFilterChip({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-smooth ${
        active ? "bg-[#0d9488] text-white" : "bg-[#f7f8fa] text-[#5a6473] hover:bg-[#eef2f5]"
      }`}
    >
      {children}
    </button>
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
    <div className="group px-5 py-4 transition-smooth hover:bg-[#fafbfe]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4 lg:flex-1">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
              item.priority <= 2 ? "bg-[#f43f5e]" : "bg-[#0d9488]"
            }`}
          >
            {item.priority <= 2 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              initials(item.patientName)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#0f1923]">{item.patientName}</p>
              <span className={attentionBadgeClass(item.sourceType)}>
                {attentionLabel(item.sourceType)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#5a6473]">{item.title}</p>
            <p className="font-mono mt-1 text-[11px] text-[#9aa3ae]">
              {formatAttentionDue(item.dueAt, item.sourceType)}
              {item.reason ? ` · ${item.reason}` : ""}
              {!item.phone ? " · no WhatsApp number" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 opacity-100 transition-smooth lg:justify-end lg:opacity-0 lg:group-hover:opacity-100">
          {patientRoute && (
            <a
              href={patientRoute}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e9ef] bg-white px-3 text-xs font-medium text-[#5a6473] transition-smooth hover:bg-[#f7f8fa]"
            >
              <FileText className="h-3.5 w-3.5" /> Case
            </a>
          )}
          {recordVisitHref && (
            <a
              href={recordVisitHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ccfbf1] px-3 text-xs font-medium text-[#0f766e]"
            >
              <Stethoscope className="h-3.5 w-3.5" /> Consult
            </a>
          )}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e9ef] bg-white px-3 text-xs font-medium text-[#5a6473] transition-smooth hover:bg-[#f7f8fa]"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ccfbf1] bg-[#f7f8fa] px-3 text-xs font-medium text-[#5a6473] transition-smooth hover:bg-[#ccfbf1] hover:text-[#0f766e] disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </button>
          )}
          {item.appointmentId && item.canMarkNoShow && (
            <button
              type="button"
              onClick={() => onSetAppointmentStatus(item.appointmentId!, "no_show")}
              disabled={updatingAppointmentId === item.appointmentId}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ffe4e6] px-3 text-xs font-medium text-[#f43f5e] transition-smooth hover:bg-[#ffd4da] disabled:opacity-60"
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
      <div className="grid grid-cols-[80px_1fr_auto] items-center gap-3 px-5 py-3 transition-smooth hover:bg-[#fafbfe]">
        <div className="font-mono flex items-center gap-2 text-xs font-medium text-[#9aa3ae]">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "completed"
                ? "bg-[#10b981]"
                : status === "no_show"
                  ? "bg-[#f43f5e]"
                  : isAppointmentPast(appointment)
                    ? "bg-[#f59e0b]"
                    : "bg-[#0d9488]"
            }`}
          />
          {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#0f1923]">
            {patient?.full_name ?? "Unknown patient"}
          </p>
          <p className="truncate text-xs text-[#9aa3ae]">
            {appointment.reason ?? "Consultation"} · {appointment.duration_minutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={scheduleStatusClass(status)}>{scheduleStatusLabel(appointment)}</span>
          {patient && showVisitAction && (
            <a
              href={`/app/patients/${patient.id}?newVisit=1&appointmentId=${appointment.id}`}
              className="hidden rounded-lg bg-[#ccfbf1] px-3 py-1.5 text-xs font-medium text-[#0f766e] transition-smooth hover:bg-[#b8f7ec] sm:inline-flex"
            >
              Consult
            </a>
          )}
          {patient && (
            <a href={`/app/patients/${patient.id}`} aria-label={`Open ${patient.full_name}`}>
              <ChevronRight className="h-4 w-4 text-[#9aa3ae]" />
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
  if (tone === "violet") return "border-[#ede9fe] bg-[#ede9fe] text-[#7c3aed]";
  if (tone === "rose") return "border-[#ffe4e6] bg-[#ffe4e6] text-[#f43f5e]";
  if (tone === "amber") return "border-[#fef3c7] bg-[#fef3c7] text-[#f59e0b]";
  if (tone === "emerald") return "border-[#d1fae5] bg-[#d1fae5] text-[#10b981]";
  return "border-[#ccfbf1] bg-[#ccfbf1] text-[#0d9488]";
}

function quickActionTone(tone: string) {
  if (tone === "violet") return "bg-[#ede9fe] text-[#7c3aed]";
  if (tone === "amber") return "bg-[#fef3c7] text-[#f59e0b]";
  if (tone === "green") return "bg-[#d1fae5] text-[#10b981]";
  return "bg-[#ccfbf1] text-[#0d9488]";
}

function quickActionHoverTone(tone: string) {
  if (tone === "violet") return "hover:border-[#7c3aed] hover:bg-[#f8f5ff]";
  if (tone === "amber") return "hover:border-[#f59e0b] hover:bg-[#fffaf0]";
  if (tone === "green") return "hover:border-[#10b981] hover:bg-[#f0fdf4]";
  return "hover:border-[#0d9488] hover:bg-[#f0fdfa]";
}

function quickActionChevronTone(tone: string) {
  if (tone === "violet") return "group-hover:text-[#7c3aed]";
  if (tone === "amber") return "group-hover:text-[#f59e0b]";
  if (tone === "green") return "group-hover:text-[#10b981]";
  return "group-hover:text-[#0d9488]";
}

function trendTone(tone: string) {
  if (tone === "violet") return "text-[#7c3aed]";
  if (tone === "rose") return "text-[#f43f5e]";
  if (tone === "amber") return "text-[#f59e0b]";
  if (tone === "emerald") return "text-[#10b981]";
  return "text-[#0d9488]";
}

function MiniTrend({ tone }: { tone: string }) {
  return (
    <svg className={`h-7 w-[60px] ${trendTone(tone)}`} viewBox="0 0 64 36" aria-hidden="true">
      <path
        d="M2 28 L10 24 L17 16 L25 23 L32 8 L41 20 L49 13 L62 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        opacity="0.6"
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
  const base = "hidden rounded-lg px-2.5 py-1 text-[11px] font-medium sm:inline-flex";
  if (status === "completed") return `${base} bg-[#d1fae5] text-[#065f46]`;
  if (status === "cancelled") return `${base} bg-muted text-muted-foreground`;
  if (status === "no_show") return `${base} bg-[#ffe4e6] text-[#f43f5e]`;
  return `${base} bg-[#ccfbf1] text-[#0f766e]`;
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
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (sourceType === "missed_follow_up" || sourceType === "no_show") {
    return `${base} bg-[#ffe4e6] text-[#f43f5e]`;
  }
  if (sourceType === "needs_closure") return `${base} bg-[#ede9fe] text-[#7c3aed]`;
  if (sourceType === "follow_up") return `${base} bg-[#fef3c7] text-[#f59e0b]`;
  return `${base} bg-[#d1fae5] text-[#10b981]`;
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
