import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  HeartPulse,
  MessageCircle,
  Package,
  Plus,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useClinic } from "@/hooks/use-clinic";
import { supabase } from "@/integrations/supabase/client";
import { FollowUpRemindersCard } from "@/components/follow-up-reminders-card";
import { ClinicSetupCard } from "@/components/clinic-setup-card";

export const Route = createFileRoute("/app/")({
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const { user, role, loading } = useAuth();
  const { data: clinic, isLoading: clinicLoading } = useClinic();
  const navigate = useNavigate();

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
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
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
      return (data ?? []).filter(
        (r) => Number(r.quantity) <= Number(r.low_stock_threshold),
      ).length;
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

  const followUpCount = useQuery({
    queryKey: ["followup-count", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count, error } = await supabase
        .from("patient_visits")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic!.id)
        .gte("next_follow_up", today);
      if (error) throw error;
      return count ?? 0;
    },
  });

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
      label: "Upcoming follow-ups",
      value: followUpCount.data ?? "—",
      to: "/app/follow-ups" as const,
      hint: "Smart reminders & retention",
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
  ];

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const showOnboarding = completedSteps < onboardingSteps.length;

  if (!loading && !clinicLoading && role !== "patient" && !clinic) {
    return <ClinicSetupCard />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Dr. {user?.user_metadata?.full_name ?? "Doctor"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {clinic?.name ?? "Your clinic"} — here's an overview of today.
        </p>
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

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {onboardingSteps.map((step) => (
              <Link
                key={step.label}
                to={step.to}
                className={`group rounded-2xl border p-4 transition-smooth hover:-translate-y-0.5 hover:shadow-card ${
                  step.done
                    ? "border-primary/25 bg-primary/10"
                    : "border-border/60 bg-background"
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
                    {step.done ? <CheckCircle2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          );
        })}
      </div>

      <FollowUpRemindersCard clinicId={clinic?.id} />
    </div>
  );
}
