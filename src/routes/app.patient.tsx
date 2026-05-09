import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, FileText, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/patient")({
  component: PatientHome,
});

const tiles = [
  { icon: CalendarCheck, label: "Upcoming appointments", hint: "We'll show your bookings here." },
  { icon: FileText, label: "Prescriptions", hint: "Your visit history will appear here." },
  { icon: MessageCircle, label: "Message your doctor", hint: "WhatsApp booking arrives in step 7." },
];

function PatientHome() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Hello,</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {user?.user_metadata?.full_name ?? "Patient"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Your patient portal is ready. More features coming soon.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-card">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <t.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
