import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarCheck, HeartPulse, Package, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/")({
  component: DoctorDashboard,
});

const tiles = [
  { icon: Users, label: "Patients", value: "—", hint: "Coming next" },
  { icon: CalendarCheck, label: "Today's appointments", value: "—", hint: "Coming next" },
  { icon: HeartPulse, label: "Pending follow-ups", value: "—", hint: "Coming next" },
  { icon: Package, label: "Low-stock remedies", value: "—", hint: "Coming next" },
];

function DoctorDashboard() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role === "patient") {
      navigate({ to: "/app/patient" });
    }
  }, [loading, role, navigate]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Dr. {user?.user_metadata?.full_name ?? "Doctor"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Your clinic dashboard is taking shape. Patient management arrives in step 3.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <t.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
