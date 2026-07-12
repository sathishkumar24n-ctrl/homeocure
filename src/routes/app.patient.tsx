import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  Pill,
  Bell,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  linkPatientByPhone,
  sendAppointmentWhatsApp,
} from "@/lib/appointments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/patient")({
  component: PatientHome,
  head: () => ({
    meta: [
      { title: "My appointments — HomeoCare" },
      { name: "description", content: "Book, reschedule, and view your homeopathy appointments." },
    ],
  }),
});

type PatientRow = {
  id: string;
  full_name: string;
  phone: string | null;
  clinic_id: string;
  clinic_name?: string;
};

type Appointment = {
  id: string;
  patient_id: string;
  clinic_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  reason: string | null;
};

function PatientHome() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const records = useQuery({
    queryKey: ["my-patient-records", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, phone, clinic_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((p) => p.clinic_id)));
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await supabase
          .from("clinics")
          .select("id, name")
          .in("id", ids);
        names = Object.fromEntries((cs ?? []).map((c) => [c.id, c.name]));
      }
      return (data ?? []).map((p) => ({ ...p, clinic_name: names[p.clinic_id] })) as PatientRow[];
    },
  });

  const patientIds = useMemo(() => (records.data ?? []).map((r) => r.id), [records.data]);

  const appts = useQuery({
    queryKey: ["my-appointments", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, clinic_id, scheduled_at, duration_minutes, status, reason")
        .in("patient_id", patientIds)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });

  const visits = useQuery({
    queryKey: ["my-visits", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_visits")
        .select(
          "id, patient_id, clinic_id, visit_date, chief_complaint, prescription, dosage, next_follow_up, notes",
        )
        .in("patient_id", patientIds)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendWhatsApp = useServerFn(sendAppointmentWhatsApp);
  const [bookOpen, setBookOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Appointment | null>(null);

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      try {
        await sendWhatsApp({ data: { appointmentId: id, kind: "cancelled" } });
      } catch (e) {
        console.error(e);
      }
    },
    onSuccess: () => {
      toast.success("Appointment cancelled");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel"),
  });

  const upcoming = (appts.data ?? []).filter(
    (a) => new Date(a.scheduled_at) >= new Date() && a.status !== "cancelled",
  );
  const past = (appts.data ?? []).filter(
    (a) => new Date(a.scheduled_at) < new Date() || a.status === "cancelled",
  );

  if (records.isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!records.data || records.data.length === 0) {
    return <LinkRecordPanel userName={user?.user_metadata?.full_name as string | undefined} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Hello,</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {user?.user_metadata?.full_name ?? records.data[0].full_name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {records.data.length === 1
            ? records.data[0].clinic_name
            : `${records.data.length} clinics linked`}
        </p>
        <button
          onClick={() => setBookOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated"
        >
          <CalendarPlus className="h-4 w-4" /> Book appointment
        </button>
      </div>

      <Section title="Upcoming">
        {upcoming.length === 0 ? (
          <Empty label="No upcoming appointments" />
        ) : (
          upcoming.map((a) => (
            <ApptCard
              key={a.id}
              appt={a}
              clinicName={records.data!.find((r) => r.id === a.patient_id)?.clinic_name}
              onReschedule={() => setRescheduleFor(a)}
              onCancel={() => cancel.mutate(a.id)}
            />
          ))
        )}
      </Section>

      <Section title="Past">
        {past.length === 0 ? (
          <Empty label="No past appointments" />
        ) : (
          past.map((a) => (
            <ApptCard
              key={a.id}
              appt={a}
              clinicName={records.data!.find((r) => r.id === a.patient_id)?.clinic_name}
              readOnly
            />
          ))
        )}
      </Section>

      {(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const followUps = (visits.data ?? [])
          .filter((v) => v.next_follow_up && new Date(v.next_follow_up as string) >= today)
          .sort(
            (a, b) =>
              new Date(a.next_follow_up as string).getTime() -
              new Date(b.next_follow_up as string).getTime(),
          );
        const prescribed = (visits.data ?? []).filter((v) => v.prescription);

        return (
          <>
            <Section title="Follow-up reminders">
              {followUps.length === 0 ? (
                <Empty label="No upcoming follow-ups" />
              ) : (
                followUps.map((v) => {
                  const due = new Date(v.next_follow_up as string);
                  const days = Math.ceil(
                    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                  );
                  const clinicName = records.data!.find(
                    (r) => r.id === v.patient_id,
                  )?.clinic_name;
                  return (
                    <div
                      key={`fu-${v.id}`}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {due.toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {clinicName} ·{" "}
                            {days === 0
                              ? "Today"
                              : days === 1
                                ? "Tomorrow"
                                : `In ${days} days`}
                          </p>
                          {v.chief_complaint && (
                            <p className="mt-1 truncate text-sm text-foreground/80">
                              {v.chief_complaint}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </Section>

            <Section title="Prescriptions">
              {prescribed.length === 0 ? (
                <Empty label="No prescriptions yet" />
              ) : (
                prescribed.map((v) => {
                  const clinicName = records.data!.find(
                    (r) => r.id === v.patient_id,
                  )?.clinic_name;
                  return (
                    <div
                      key={`rx-${v.id}`}
                      className="rounded-2xl border border-border/60 bg-card p-4 shadow-card"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Pill className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <p className="font-semibold text-foreground">
                              {v.prescription}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(v.visit_date as string).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric", year: "numeric" },
                              )}
                            </p>
                          </div>
                          {v.dosage && (
                            <p className="mt-0.5 text-sm text-foreground/80">
                              {v.dosage}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {clinicName}
                            {v.chief_complaint ? ` · ${v.chief_complaint}` : ""}
                          </p>
                          {v.notes && (
                            <p className="mt-1 text-sm text-foreground/70">{v.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </Section>
          </>
        );
      })()}

      {bookOpen && (
        <BookDialog
          records={records.data}
          onClose={() => setBookOpen(false)}
          onBooked={async (id) => {
            try {
              await sendWhatsApp({ data: { appointmentId: id, kind: "booked" } });
            } catch (e) {
              console.error(e);
            }
            qc.invalidateQueries({ queryKey: ["my-appointments"] });
            setBookOpen(false);
          }}
        />
      )}

      {rescheduleFor && (
        <RescheduleDialog
          appt={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
          onSaved={async () => {
            try {
              await sendWhatsApp({ data: { appointmentId: rescheduleFor.id, kind: "rescheduled" } });
            } catch (e) {
              console.error(e);
            }
            qc.invalidateQueries({ queryKey: ["my-appointments"] });
            setRescheduleFor(null);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ApptCard({
  appt,
  clinicName,
  onReschedule,
  onCancel,
  readOnly,
}: {
  appt: Appointment;
  clinicName?: string;
  onReschedule?: () => void;
  onCancel?: () => void;
  readOnly?: boolean;
}) {
  const dt = new Date(appt.scheduled_at);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {dt.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {clinicName} · {appt.duration_minutes} min · {appt.status}
          </p>
          {appt.reason && <p className="mt-1 truncate text-sm text-foreground/80">{appt.reason}</p>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={onReschedule}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Reschedule
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BookDialog({
  records,
  onClose,
  onBooked,
}: {
  records: PatientRow[];
  onClose: () => void;
  onBooked: (id: string) => void;
}) {
  const [patientId, setPatientId] = useState(records[0]?.id ?? "");
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  const minLocal = today.toISOString().slice(0, 16);
  const [when, setWhen] = useState(minLocal);
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const target = records.find((r) => r.id === patientId);
      if (!target) throw new Error("Pick a clinic");
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          patient_id: patientId,
          clinic_id: target.clinic_id,
          scheduled_at: new Date(when).toISOString(),
          duration_minutes: duration,
          reason: reason.trim() || null,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Appointment booked");
      onBooked(id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to book"),
  });

  return (
    <Modal title="Book appointment" onClose={onClose}>
      <div className="space-y-3">
        {records.length > 1 && (
          <Field label="Clinic">
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.clinic_name ?? "Clinic"}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Date & time">
          <input
            type="datetime-local"
            min={minLocal}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Reason (optional)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
            placeholder="Brief reason for the visit"
          />
        </Field>
        <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          <MessageCircle className="h-4 w-4 shrink-0" />
          We'll send a WhatsApp confirmation to the phone on file.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirm booking
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RescheduleDialog({
  appt,
  onClose,
  onSaved,
}: {
  appt: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dt = new Date(appt.scheduled_at);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  const [when, setWhen] = useState(dt.toISOString().slice(0, 16));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("appointments")
        .update({ scheduled_at: new Date(when).toISOString(), status: "scheduled" })
        .eq("id", appt.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reschedule"),
  });

  return (
    <Modal title="Reschedule appointment" onClose={onClose}>
      <div className="space-y-3">
        <Field label="New date & time">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            Save change
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LinkRecordPanel({ userName }: { userName?: string }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const link = useServerFn(linkPatientByPhone);

  const mut = useMutation({
    mutationFn: async () => link({ data: { phone } }),
    onSuccess: (res) => {
      if (res.linked > 0) {
        toast.success(`Linked ${res.linked} record(s)`);
        qc.invalidateQueries({ queryKey: ["my-patient-records"] });
      } else {
        toast.error("No matching patient record found. Ask your clinic to add you.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Lookup failed"),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Search className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Link your clinic record
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Welcome{userName ? `, ${userName}` : ""}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the same WhatsApp number your clinic saved for you. HomeoCare will connect
              your login to your existing patient profile.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                "Find your clinic profile",
                "View prescriptions and visits",
                "Book or reschedule appointments",
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-secondary/45 p-3 text-sm text-foreground">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-primary" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <button
              onClick={() => mut.mutate()}
              disabled={!phone.trim() || mut.isPending}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Find my record
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              No match? Ask your clinic to add you as a patient with this phone number, then try again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
