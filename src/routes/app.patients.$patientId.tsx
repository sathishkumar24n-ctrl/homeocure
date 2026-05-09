import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CalendarPlus, FileText, Loader2, Mail, MapPin, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinic } from "@/hooks/use-clinic";
import { TextField, TextAreaField, FormRow } from "@/components/form-fields";
import { visitSchema, type VisitInput } from "@/lib/patient-schema";

export const Route = createFileRoute("/app/patients/$patientId")({
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const { user } = useAuth();
  const { data: clinic } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showVisit, setShowVisit] = useState(false);

  const patientQ = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const visitsQ = useQuery({
    queryKey: ["visits", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_visits")
        .select("*")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deletePatient = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("patients").delete().eq("id", patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Patient deleted");
      qc.invalidateQueries({ queryKey: ["patients", clinic?.id] });
      navigate({ to: "/app/patients" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (patientQ.isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (patientQ.error || !patientQ.data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Patient not found.
      </div>
    );
  }

  const p = patientQ.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/app/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All patients
      </Link>

      {/* Header card */}
      <div className="rounded-3xl bg-gradient-soft p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-card text-lg font-bold text-foreground shadow-soft">
            {initials(p.full_name)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{p.full_name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[p.gender, p.date_of_birth && `Born ${p.date_of_birth}`, p.occupation]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {p.phone && <Pill icon={<Phone className="h-3 w-3" />}>{p.phone}</Pill>}
              {p.email && <Pill icon={<Mail className="h-3 w-3" />}>{p.email}</Pill>}
              {p.address && <Pill icon={<MapPin className="h-3 w-3" />}>{p.address}</Pill>}
            </div>
          </div>
        </div>
      </div>

      {/* Medical background */}
      {(p.allergies || p.chronic_conditions || p.notes) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.allergies && <InfoCard title="Allergies" body={p.allergies} />}
          {p.chronic_conditions && <InfoCard title="Chronic conditions" body={p.chronic_conditions} />}
          {p.notes && (
            <div className="sm:col-span-2">
              <InfoCard title="Notes" body={p.notes} />
            </div>
          )}
        </div>
      )}

      {/* Visit history */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Visit history</h2>
        <button
          onClick={() => setShowVisit((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft"
        >
          <CalendarPlus className="h-4 w-4" /> {showVisit ? "Close" : "New visit"}
        </button>
      </div>

      {showVisit && (
        <NewVisitForm
          patientId={patientId}
          clinicId={p.clinic_id}
          createdBy={user?.id}
          onDone={() => {
            setShowVisit(false);
            qc.invalidateQueries({ queryKey: ["visits", patientId] });
          }}
        />
      )}

      <div className="mt-4 space-y-3">
        {visitsQ.isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
            Loading visits…
          </div>
        ) : !visitsQ.data || visitsQ.data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
            <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No visits recorded yet.</p>
          </div>
        ) : (
          visitsQ.data.map((v) => <VisitCard key={v.id} visit={v} />)
        )}
      </div>

      {/* Danger zone */}
      <div className="mt-10 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Delete patient</p>
            <p className="text-xs text-muted-foreground">
              Removes the patient and all visit history. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm(`Delete ${p.full_name}? This cannot be undone.`)) {
                deletePatient.mutate();
              }
            }}
            disabled={deletePatient.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-card px-3 py-1.5 text-xs font-semibold text-destructive transition-smooth hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 shadow-soft">
      {icon} {children}
    </span>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{body}</p>
    </div>
  );
}

function VisitCard({ visit }: { visit: any }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {new Date(visit.visit_date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
        {visit.next_follow_up && (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            Follow-up: {visit.next_follow_up}
          </span>
        )}
      </div>
      {visit.chief_complaint && (
        <p className="mt-2 text-sm font-medium text-foreground">{visit.chief_complaint}</p>
      )}
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        {visit.symptoms && <Field label="Symptoms" value={visit.symptoms} />}
        {visit.constitution && <Field label="Constitution" value={visit.constitution} />}
        {visit.miasm && <Field label="Miasm" value={visit.miasm} />}
        {visit.modalities && <Field label="Modalities" value={visit.modalities} />}
        {visit.prescription && <Field label="Prescription" value={visit.prescription} />}
        {visit.dosage && <Field label="Dosage" value={visit.dosage} />}
        {visit.fee != null && <Field label="Fee" value={`₹${Number(visit.fee).toFixed(2)}`} />}
        {visit.notes && <Field label="Notes" value={visit.notes} />}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="whitespace-pre-line">{value}</span>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
}

const emptyVisit: VisitInput = {
  visit_date: new Date().toISOString().slice(0, 10),
  chief_complaint: "",
  symptoms: "",
  constitution: "",
  miasm: "",
  modalities: "",
  prescription: "",
  dosage: "",
  fee: null,
  next_follow_up: "",
  notes: "",
};

function NewVisitForm({
  patientId,
  clinicId,
  createdBy,
  onDone,
}: {
  patientId: string;
  clinicId: string;
  createdBy?: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState<VisitInput>(emptyVisit);
  const set = <K extends keyof VisitInput>(k: K, v: VisitInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (input: VisitInput) => {
      const parsed = visitSchema.parse(input);
      const payload = {
        ...parsed,
        next_follow_up: parsed.next_follow_up || null,
        patient_id: patientId,
        clinic_id: clinicId,
        created_by: createdBy,
      };
      const { error } = await supabase.from("patient_visits").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visit recorded");
      setForm(emptyVisit);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(form);
      }}
      className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-card"
    >
      <FormRow>
        <TextField
          label="Visit date"
          type="date"
          required
          value={form.visit_date}
          onChange={(e) => set("visit_date", e.target.value)}
        />
        <TextField
          label="Next follow-up"
          type="date"
          value={form.next_follow_up ?? ""}
          onChange={(e) => set("next_follow_up", e.target.value)}
        />
      </FormRow>
      <TextAreaField
        label="Chief complaint"
        value={form.chief_complaint ?? ""}
        maxLength={500}
        onChange={(e) => set("chief_complaint", e.target.value)}
      />
      <TextAreaField
        label="Symptoms"
        value={form.symptoms ?? ""}
        maxLength={2000}
        onChange={(e) => set("symptoms", e.target.value)}
      />
      <FormRow>
        <TextField
          label="Constitution"
          placeholder="e.g. Phosphorus"
          value={form.constitution ?? ""}
          maxLength={200}
          onChange={(e) => set("constitution", e.target.value)}
        />
        <TextField
          label="Miasm"
          placeholder="Psoric / Sycotic / Syphilitic / Tubercular"
          value={form.miasm ?? ""}
          maxLength={200}
          onChange={(e) => set("miasm", e.target.value)}
        />
      </FormRow>
      <TextField
        label="Modalities"
        placeholder="< cold, > warmth"
        value={form.modalities ?? ""}
        maxLength={500}
        onChange={(e) => set("modalities", e.target.value)}
      />
      <FormRow>
        <TextField
          label="Prescription"
          placeholder="Remedy & potency"
          value={form.prescription ?? ""}
          maxLength={500}
          onChange={(e) => set("prescription", e.target.value)}
        />
        <TextField
          label="Dosage"
          placeholder="3 globules, twice daily"
          value={form.dosage ?? ""}
          maxLength={200}
          onChange={(e) => set("dosage", e.target.value)}
        />
      </FormRow>
      <FormRow>
        <TextField
          label="Fee (₹)"
          type="number"
          step="0.01"
          min="0"
          value={form.fee ?? ""}
          onChange={(e) => set("fee", e.target.value as unknown as number)}
        />
        <div />
      </FormRow>
      <TextAreaField
        label="Notes"
        value={form.notes ?? ""}
        maxLength={2000}
        onChange={(e) => set("notes", e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save visit
        </button>
      </div>
    </form>
  );
}
