import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/use-clinic";
import { useAuth } from "@/hooks/use-auth";
import { patientSchema, type PatientInput } from "@/lib/patient-schema";
import { TextField, TextAreaField, SelectField, FormRow } from "@/components/form-fields";

export const Route = createFileRoute("/app/patients/new")({
  component: NewPatientPage,
});

const empty: PatientInput = {
  full_name: "",
  gender: null,
  date_of_birth: "",
  phone: "",
  email: "",
  address: "",
  occupation: "",
  allergies: "",
  chronic_conditions: "",
  notes: "",
};

function NewPatientPage() {
  const { user } = useAuth();
  const { data: clinic } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<PatientInput>(empty);

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (input: PatientInput) => {
      if (!clinic?.id) throw new Error("No clinic");
      const parsed = patientSchema.parse(input);
      const payload = {
        ...parsed,
        date_of_birth: parsed.date_of_birth || null,
        email: parsed.email || null,
        clinic_id: clinic.id,
        created_by: user?.id,
      };
      const { data, error } = await supabase
        .from("patients")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Patient added");
      qc.invalidateQueries({ queryKey: ["patients", clinic?.id] });
      navigate({ to: "/app/patients/$patientId", params: { patientId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/app/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to patients
      </Link>

      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">New patient</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a complete patient profile to your clinic.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
        >
          <Section title="Personal details">
            <TextField
              label="Full name"
              required
              value={form.full_name}
              maxLength={120}
              onChange={(e) => set("full_name", e.target.value)}
            />
            <FormRow>
              <SelectField
                label="Gender"
                value={form.gender ?? ""}
                onChange={(e) => set("gender", (e.target.value || null) as PatientInput["gender"])}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </SelectField>
              <TextField
                label="Date of birth"
                type="date"
                value={form.date_of_birth ?? ""}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </FormRow>
            <FormRow>
              <TextField
                label="Phone (WhatsApp)"
                type="tel"
                value={form.phone ?? ""}
                maxLength={32}
                onChange={(e) => set("phone", e.target.value)}
              />
              <TextField
                label="Email"
                type="email"
                value={form.email ?? ""}
                maxLength={255}
                onChange={(e) => set("email", e.target.value)}
              />
            </FormRow>
            <FormRow>
              <TextField
                label="Occupation"
                value={form.occupation ?? ""}
                maxLength={120}
                onChange={(e) => set("occupation", e.target.value)}
              />
              <TextField
                label="Address"
                value={form.address ?? ""}
                maxLength={500}
                onChange={(e) => set("address", e.target.value)}
              />
            </FormRow>
          </Section>

          <Section title="Medical background">
            <TextAreaField
              label="Allergies"
              placeholder="List any known allergies"
              value={form.allergies ?? ""}
              maxLength={1000}
              onChange={(e) => set("allergies", e.target.value)}
            />
            <TextAreaField
              label="Chronic conditions"
              placeholder="Diabetes, hypertension, asthma, etc."
              value={form.chronic_conditions ?? ""}
              maxLength={1000}
              onChange={(e) => set("chronic_conditions", e.target.value)}
            />
            <TextAreaField
              label="General notes"
              placeholder="Family history, lifestyle, observations…"
              value={form.notes ?? ""}
              maxLength={2000}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Section>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Link
              to="/app/patients"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-smooth hover:bg-muted"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated disabled:opacity-60"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-secondary/30 p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
