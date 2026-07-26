import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarPlus,
  Copy,
  Clock,
  FileText,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Search,
  Stethoscope,
  Trash2,
} from "lucide-react";
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
  const [showVisit, setShowVisit] = useState(() => getVisitLinkParams().newVisit);
  const [appointmentToCompleteId, setAppointmentToCompleteId] = useState<string | null>(
    () => getVisitLinkParams().appointmentId,
  );
  const [showAppointment, setShowAppointment] = useState(false);
  const [printVisit, setPrintVisit] = useState<any | null>(null);
  const [visitSearch, setVisitSearch] = useState("");
  const [whatsappKind, setWhatsappKind] = useState<WhatsAppMessageKind>("followUp");

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

  const appointmentsQ = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, clinic_id, patient_id, scheduled_at, duration_minutes, status, reason, notes")
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const visits = visitsQ.data ?? [];
  const appointments = appointmentsQ.data ?? [];
  const filteredVisits = useMemo(() => {
    const rows = visitsQ.data ?? [];
    const term = visitSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((visit) =>
      [
        visit.visit_date,
        visit.chief_complaint,
        visit.symptoms,
        visit.constitution,
        visit.miasm,
        visit.modalities,
        visit.prescription,
        visit.dosage,
        visit.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [visitsQ.data, visitSearch]);

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

  useEffect(() => {
    if (!printVisit) return;

    const clearPrintVisit = () => setPrintVisit(null);
    window.addEventListener("afterprint", clearPrintVisit, { once: true });
    const timer = window.setTimeout(() => window.print(), 75);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clearPrintVisit);
    };
  }, [printVisit]);

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
  const latestVisit = visits[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextFollowUp = [...visits]
    .filter((v) => v.next_follow_up && new Date(v.next_follow_up as string) >= today)
    .sort(
      (a, b) =>
        new Date(a.next_follow_up as string).getTime() -
        new Date(b.next_follow_up as string).getTime(),
    )[0];
  const upcomingAppointments = appointments.filter(
    (a) => new Date(a.scheduled_at) >= new Date() && a.status === "scheduled",
  );
  const nextAppointment = upcomingAppointments[0];
  const whatsappMessage = buildWhatsAppMessage({
    kind: whatsappKind,
    patientName: p.full_name,
    clinicName: clinic?.name,
    latestVisit,
    nextFollowUp,
    nextAppointment,
  });
  const whatsappHref = p.phone ? buildWhatsAppHref(p.phone, whatsappMessage) : undefined;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {printVisit && (
        <PrintablePrescription
          patientName={p.full_name}
          clinicName={clinic?.name}
          visit={printVisit}
        />
      )}

      <Link
        to="/app/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All patients
      </Link>

      {/* Header card */}
      <div className="rounded-3xl bg-gradient-soft p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              onClick={() => {
                setAppointmentToCompleteId(null);
                setShowAppointment(false);
                setShowVisit((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft"
            >
              <Stethoscope className="h-4 w-4" /> New visit
            </button>
            <button
              onClick={() => {
                setShowVisit(false);
                setShowAppointment((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-soft transition-smooth hover:bg-muted"
            >
              <CalendarPlus className="h-4 w-4" /> Book
            </button>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-soft transition-smooth hover:bg-muted"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <WorkflowCard
          icon={<FileText className="h-4 w-4" />}
          label="Last visit"
          value={latestVisit ? formatDate(latestVisit.visit_date) : "No visits"}
          hint={latestVisit?.chief_complaint ?? "Record the first consultation"}
        />
        <WorkflowCard
          icon={<Clock className="h-4 w-4" />}
          label="Next follow-up"
          value={nextFollowUp ? formatDate(nextFollowUp.next_follow_up as string) : "Not set"}
          hint={nextFollowUp?.chief_complaint ?? "Add a follow-up date in a visit"}
        />
        <WorkflowCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="Next appointment"
          value={nextAppointment ? formatDateTime(nextAppointment.scheduled_at) : "Not booked"}
          hint={nextAppointment?.reason ?? "Book from this patient profile"}
        />
      </div>

      {p.phone && (
        <WhatsAppComposer
          patientName={p.full_name}
          phone={p.phone}
          message={whatsappMessage}
          selected={whatsappKind}
          onSelect={setWhatsappKind}
          href={whatsappHref}
        />
      )}

      {/* Medical background */}
      {(p.allergies || p.chronic_conditions || p.notes) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.allergies && <InfoCard title="Allergies" body={p.allergies} />}
          {p.chronic_conditions && (
            <InfoCard title="Chronic conditions" body={p.chronic_conditions} />
          )}
          {p.notes && (
            <div className="sm:col-span-2">
              <InfoCard title="Notes" body={p.notes} />
            </div>
          )}
        </div>
      )}

      {/* Visit history */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Visit history</h2>
          <p className="text-xs text-muted-foreground">
            {visits.length} visit{visits.length === 1 ? "" : "s"} recorded
          </p>
        </div>
        <button
          onClick={() => {
            setAppointmentToCompleteId(null);
            setShowVisit((v) => !v);
          }}
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
          appointmentToCompleteId={appointmentToCompleteId}
          onDone={() => {
            setShowVisit(false);
            setAppointmentToCompleteId(null);
            clearVisitLinkParams();
            qc.invalidateQueries({ queryKey: ["visits", patientId] });
            qc.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
            qc.invalidateQueries({ queryKey: ["appointments", p.clinic_id] });
            qc.invalidateQueries({ queryKey: ["today-appointments-count", p.clinic_id] });
            qc.invalidateQueries({ queryKey: ["today-appointments", p.clinic_id] });
            qc.invalidateQueries({ queryKey: ["upcoming-appointments", p.clinic_id] });
          }}
        />
      )}

      {showAppointment && (
        <BookAppointmentForm
          patientId={patientId}
          clinicId={p.clinic_id}
          createdBy={user?.id}
          onDone={() => {
            setShowAppointment(false);
            qc.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
            qc.invalidateQueries({ queryKey: ["appointments", p.clinic_id] });
            qc.invalidateQueries({ queryKey: ["today-appointments-count", p.clinic_id] });
          }}
        />
      )}

      {visits.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-card">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={visitSearch}
            onChange={(e) => setVisitSearch(e.target.value)}
            placeholder="Search symptoms, remedies, miasm, notes..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
        </div>
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
        ) : filteredVisits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
            <Search className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No visits match that search.</p>
          </div>
        ) : (
          filteredVisits.map((v) => <VisitCard key={v.id} visit={v} onPrint={setPrintVisit} />)
        )}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Upcoming appointments</h2>
          <button
            onClick={() => {
              setShowVisit(false);
              setShowAppointment(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Book
          </button>
        </div>
        {appointmentsQ.isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-5 text-center text-sm text-muted-foreground">
            Loading appointments...
          </div>
        ) : upcomingAppointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
            No upcoming appointments for this patient.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingAppointments.slice(0, 3).map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{body}</p>
    </div>
  );
}

function WorkflowCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-base font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type WhatsAppMessageKind = "followUp" | "appointment" | "medicine" | "review";

const whatsappOptions: Array<{ key: WhatsAppMessageKind; label: string }> = [
  { key: "followUp", label: "Follow-up" },
  { key: "appointment", label: "Appointment" },
  { key: "medicine", label: "Medicine" },
  { key: "review", label: "Review" },
];

function WhatsAppComposer({
  patientName,
  phone,
  message,
  selected,
  onSelect,
  href,
}: {
  patientName: string;
  phone: string;
  message: string;
  selected: WhatsAppMessageKind;
  onSelect: (kind: WhatsAppMessageKind) => void;
  href?: string;
}) {
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("WhatsApp message copied");
    } catch {
      toast.error("Could not copy message");
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold tracking-tight">WhatsApp message</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {patientName} · {phone}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {whatsappOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => onSelect(option.key)}
              className={
                selected === option.key
                  ? "rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
        {message}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
          </a>
        )}
        <button
          onClick={copyMessage}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
        >
          <Copy className="h-3.5 w-3.5" /> Copy message
        </button>
      </div>
    </div>
  );
}

function AppointmentCard({ appointment }: { appointment: any }) {
  const dt = new Date(appointment.scheduled_at);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <span className="text-[10px] font-semibold uppercase">
          {dt.toLocaleDateString(undefined, { month: "short" })}
        </span>
        <span className="text-base font-bold leading-none">{dt.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">
          {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
            {appointment.status}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {appointment.duration_minutes} min
          {appointment.reason ? ` · ${appointment.reason}` : ""}
        </p>
      </div>
      <Link
        to="/app/appointments"
        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
      >
        Open
      </Link>
    </div>
  );
}

function VisitCard({ visit, onPrint }: { visit: any; onPrint: (visit: any) => void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {new Date(visit.visit_date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          {visit.next_follow_up && (
            <p className="mt-0.5 text-xs font-medium text-primary">
              Follow-up: {formatDate(visit.next_follow_up)}
            </p>
          )}
        </div>
        <button
          onClick={() => onPrint(visit)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
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

function PrintablePrescription({
  patientName,
  clinicName,
  visit,
}: {
  patientName: string;
  clinicName?: string | null;
  visit: any;
}) {
  const medicineCount = countDispensedMedicines(visit.prescription);
  const medicines = Array.from({ length: medicineCount }, (_, i) => `Medicine ${i + 1}`);

  return (
    <>
      <style>{`
        @media screen {
          #print-prescription-root {
            display: none;
          }
        }

        @media print {
          @page {
            margin: 14mm;
          }

          body * {
            visibility: hidden !important;
          }

          #print-prescription-root,
          #print-prescription-root * {
            visibility: visible !important;
          }

          #print-prescription-root {
            display: block !important;
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            padding: 0;
            color: #111827;
            background: white;
            font-family: Arial, sans-serif;
          }
        }
      `}</style>
      <div id="print-prescription-root">
        <div style={{ borderBottom: "2px solid #047857", paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{clinicName || "HomeoCare"}</div>
          <div style={{ marginTop: 4, color: "#4b5563", fontSize: 13 }}>
            Homeopathy prescription and patient instructions
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <PrintBox label="Patient" value={patientName} />
          <PrintBox label="Date" value={formatDate(visit.visit_date)} />
          {visit.chief_complaint && <PrintBox label="Complaint" value={visit.chief_complaint} />}
          {visit.next_follow_up && (
            <PrintBox label="Next follow-up" value={formatDate(visit.next_follow_up)} />
          )}
        </div>

        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: "#ecfdf5", padding: "10px 12px", fontWeight: 700 }}>
            Medicines Dispensed
          </div>
          <div style={{ padding: 12 }}>
            {medicines.map((medicine) => (
              <div
                key={medicine}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  padding: "10px 0",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {medicine}
              </div>
            ))}
            {visit.dosage && (
              <div style={{ paddingTop: 12 }}>
                <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700 }}>DIRECTIONS</div>
                <div style={{ marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {visit.dosage}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 36, display: "flex", justifyContent: "space-between" }}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            Remedy names are kept in the clinic record.
          </div>
          <div
            style={{
              borderTop: "1px solid #9ca3af",
              minWidth: 180,
              paddingTop: 8,
              textAlign: "center",
            }}
          >
            Doctor signature
          </div>
        </div>
      </div>
    </>
  );
}

function PrintBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
      <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700 }}>{label.toUpperCase()}</div>
      <div style={{ marginTop: 4, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function countDispensedMedicines(prescription?: string | null) {
  const parts = (prescription ?? "")
    .split(/\n|;|,/)
    .map((part) => part.trim())
    .filter(Boolean);
  return Math.max(1, Math.min(parts.length || 1, 12));
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
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not booked";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizePhoneForWhatsApp(raw: string) {
  return raw.replace(/[^\d]/g, "");
}

function buildWhatsAppHref(phone: string, message: string) {
  return `https://wa.me/${normalizePhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppMessage({
  kind,
  patientName,
  clinicName,
  latestVisit,
  nextFollowUp,
  nextAppointment,
}: {
  kind: WhatsAppMessageKind;
  patientName: string;
  clinicName?: string | null;
  latestVisit?: any;
  nextFollowUp?: any;
  nextAppointment?: any;
}) {
  const name = firstName(patientName);
  const clinic = clinicName?.trim() || "your clinic";

  if (kind === "appointment") {
    const when = nextAppointment
      ? formatDateTime(nextAppointment.scheduled_at)
      : "your scheduled appointment";
    return `Hi ${name}, this is a reminder from ${clinic}. Your appointment is ${when}. Please reply Confirm if you can attend, or Reschedule if you need another time.`;
  }

  if (kind === "medicine") {
    const dosage = latestVisit?.dosage?.trim();
    const followUp = latestVisit?.next_follow_up
      ? ` Your next follow-up is on ${formatDate(latestVisit.next_follow_up)}.`
      : "";
    return `Hi ${name}, medicine instructions from ${clinic}: please take the medicines dispensed by the clinic as advised${dosage ? `, ${dosage}` : ""}.${followUp} Reply if symptoms change or you need clarification.`;
  }

  if (kind === "review") {
    const complaint = latestVisit?.chief_complaint?.trim();
    return `Hi ${name}, ${clinic} is checking in${complaint ? ` about ${complaint}` : ""}. Please share how you are feeling now, any changes in symptoms, and whether the medicine suited you.`;
  }

  const followUpDate = nextFollowUp?.next_follow_up
    ? formatDate(nextFollowUp.next_follow_up)
    : "your next follow-up";
  return `Hi ${name}, this is a follow-up reminder from ${clinic}. Your consultation is due on ${followUpDate}. Please reply Confirm to keep it, or Reschedule if another time is better.`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getVisitLinkParams() {
  if (typeof window === "undefined") {
    return { newVisit: false, appointmentId: null as string | null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    newVisit: params.get("newVisit") === "1",
    appointmentId: params.get("appointmentId"),
  };
}

function clearVisitLinkParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("newVisit");
  url.searchParams.delete("appointmentId");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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

const prescriptionTemplates = [
  {
    label: "Acute cold",
    prescription: "Aconite 30C",
    dosage: "3 globules every 4 hours for 1 day, then review",
    notes: "Hydration, steam inhalation, and observe fever pattern.",
  },
  {
    label: "Digestive upset",
    prescription: "Nux Vomica 30C",
    dosage: "3 globules at night for 3 days",
    notes: "Avoid heavy food, late meals, and stimulants during course.",
  },
  {
    label: "Skin follow-up",
    prescription: "Sulphur 200C",
    dosage: "Single dose, wait and watch",
    notes: "Do not repeat unless improvement plateaus or symptoms return.",
  },
  {
    label: "Sleep/anxiety",
    prescription: "Ignatia 30C",
    dosage: "3 globules once daily for 5 days",
    notes: "Track sleep quality, triggers, and emotional state before follow-up.",
  },
];

const followUpShortcuts = [
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
];

function NewVisitForm({
  patientId,
  clinicId,
  createdBy,
  appointmentToCompleteId,
  onDone,
}: {
  patientId: string;
  clinicId: string;
  createdBy?: string;
  appointmentToCompleteId?: string | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<VisitInput>(emptyVisit);
  const set = <K extends keyof VisitInput>(k: K, v: VisitInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const applyTemplate = (template: (typeof prescriptionTemplates)[number]) => {
    setForm((f) => ({
      ...f,
      prescription: template.prescription,
      dosage: template.dosage,
      notes: f.notes ? `${f.notes}\n${template.notes}` : template.notes,
    }));
  };

  const setFollowUpDays = (days: number) => {
    const d = new Date(form.visit_date || new Date().toISOString());
    d.setDate(d.getDate() + days);
    set("next_follow_up", d.toISOString().slice(0, 10));
  };

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

      if (appointmentToCompleteId) {
        const { error: appointmentError } = await supabase
          .from("appointments")
          .update({ status: "completed" })
          .eq("id", appointmentToCompleteId)
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId);
        if (appointmentError) throw appointmentError;
      }
    },
    onSuccess: () => {
      toast.success(
        appointmentToCompleteId ? "Visit recorded and appointment completed" : "Visit recorded",
      );
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
      {appointmentToCompleteId && (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
          Saving this visit will mark the selected appointment as completed.
        </div>
      )}
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
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/35 p-3">
        <span className="text-xs font-semibold text-muted-foreground">Follow-up</span>
        {followUpShortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onClick={() => setFollowUpDays(shortcut.days)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
          >
            {shortcut.label}
          </button>
        ))}
      </div>
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
      <div className="rounded-2xl border border-border/60 bg-secondary/25 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prescription templates
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {prescriptionTemplates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => applyTemplate(template)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-smooth hover:bg-muted"
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>
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

function BookAppointmentForm({
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
  const now = new Date();
  now.setMinutes(now.getMinutes() - (now.getMinutes() % 15) + 15, 0, 0);
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(now));
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!scheduledAt) throw new Error("Pick a date and time");
      const { error } = await supabase.from("appointments").insert({
        clinic_id: clinicId,
        patient_id: patientId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: Number(duration || 30),
        status: "scheduled",
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        created_by: createdBy,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment booked");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-card"
    >
      <div>
        <p className="text-sm font-bold text-foreground">Book appointment</p>
        <p className="text-xs text-muted-foreground">
          Schedule the next consultation without leaving this patient profile.
        </p>
      </div>
      <FormRow>
        <TextField
          label="Date & time"
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
        <TextField
          label="Duration (minutes)"
          type="number"
          min="5"
          step="5"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 30)}
        />
      </FormRow>
      <TextField
        label="Reason"
        placeholder="Review, acute complaint, follow-up"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
      />
      <TextAreaField
        label="Notes"
        value={notes}
        maxLength={500}
        onChange={(e) => setNotes(e.target.value)}
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
          Book appointment
        </button>
      </div>
    </form>
  );
}
