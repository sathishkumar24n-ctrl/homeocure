import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/use-clinic";

export const Route = createFileRoute("/app/patients/")({
  component: PatientsListPage,
  head: () => ({
    meta: [
      { title: "Patients — HomeoCare" },
      { name: "description", content: "All your clinic patients in one place." },
    ],
  }),
});

function PatientsListPage() {
  const { data: clinic, isLoading: clinicLoading } = useClinic();
  const [q, setQ] = useState("");

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, phone, gender, date_of_birth, created_at")
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!patients) return [];
    const term = q.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(term) ||
        (p.phone ?? "").toLowerCase().includes(term),
    );
  }, [patients, q]);

  if (clinicLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!clinic) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No clinic found on your account. Please sign up as a doctor.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">{clinic.name}</p>
        </div>
        <Link
          to="/app/patients/new"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated"
        >
          <UserPlus className="h-4 w-4" /> New patient
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or phone"
          className="w-full rounded-full border border-input bg-card pl-9 pr-4 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          Loading patients…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasSearch={!!q} />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/app/patients/$patientId"
              params={{ patientId: p.id }}
              className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-semibold">
                {initials(p.full_name)}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate font-semibold text-foreground">{p.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.phone, p.gender, p.date_of_birth && `Born ${p.date_of_birth}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <Users className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {hasSearch ? "No matching patients" : "No patients yet"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasSearch ? "Try a different search term." : "Add your first patient to get started."}
      </p>
      {!hasSearch && (
        <Link
          to="/app/patients/new"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <Plus className="h-4 w-4" /> Add patient
        </Link>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}
