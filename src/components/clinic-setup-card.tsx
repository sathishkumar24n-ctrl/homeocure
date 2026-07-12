import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ensureDoctorClinic } from "@/lib/clinic.functions";

export function ClinicSetupCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createClinic = useServerFn(ensureDoctorClinic);
  const [clinicName, setClinicName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => createClinic({ data: { clinicName } }),
    onSuccess: (clinic) => {
      toast.success(`${clinic.name} is ready`);
      qc.invalidateQueries({ queryKey: ["clinic", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Clinic setup required
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Create your clinic profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your doctor login is active, but no clinic is linked yet. Add your clinic name once,
              then you can add patients and appointments.
            </p>

            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <label className="block text-sm font-medium text-foreground">
                Clinic name
                <input
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="Mehta Homeopathy Clinic"
                  maxLength={120}
                  required
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </label>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated disabled:opacity-60"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save clinic
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
