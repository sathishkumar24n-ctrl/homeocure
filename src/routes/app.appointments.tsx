import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarPlus, Clock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/use-clinic";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/app/appointments")({
  component: AppointmentsPage,
  head: () => ({
    meta: [
      { title: "Appointments — HomeoCare" },
      { name: "description", content: "Schedule and manage clinic appointments." },
    ],
  }),
});

type Status = "scheduled" | "completed" | "cancelled" | "no_show";

type Appointment = {
  id: string;
  clinic_id: string;
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: Status;
  reason: string | null;
  notes: string | null;
};

type AppointmentRow = Appointment & {
  patient: { id: string; full_name: string; phone: string | null } | null;
};

type Patient = { id: string; full_name: string };

type FilterTab = "today" | "upcoming" | "past";

const STATUS_LABELS: Record<Status, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const STATUS_STYLES: Record<Status, string> = {
  scheduled: "bg-secondary text-secondary-foreground",
  completed: "bg-primary/15 text-primary",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/15 text-destructive",
};

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function defaultDraft(clinicId: string): Partial<Appointment> {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getMinutes() % 15 + 15, 0, 0);
  return {
    clinic_id: clinicId,
    patient_id: "",
    scheduled_at: toLocalInput(now),
    duration_minutes: 30,
    status: "scheduled",
    reason: "",
    notes: "",
  };
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AppointmentsPage() {
  const { user } = useAuth();
  const { data: clinic, isLoading: clinicLoading } = useClinic();
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("today");
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);

  const { data: patients } = useQuery({
    queryKey: ["patients-mini", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name")
        .eq("clinic_id", clinic!.id)
        .order("full_name");
      if (error) throw error;
      return data as Patient[];
    },
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Appointment[];
      const ids = Array.from(new Set(rows.map((r) => r.patient_id)));
      let patientMap = new Map<string, { id: string; full_name: string; phone: string | null }>();
      if (ids.length) {
        const { data: pats, error: pErr } = await supabase
          .from("patients")
          .select("id, full_name, phone")
          .in("id", ids);
        if (pErr) throw pErr;
        patientMap = new Map((pats ?? []).map((p) => [p.id, p]));
      }
      return rows.map((r) => ({ ...r, patient: patientMap.get(r.patient_id) ?? null })) as AppointmentRow[];
    },
  });

  const { todayList, upcomingList, pastList } = useMemo(() => {
    const { start, end } = todayBounds();
    const today: AppointmentRow[] = [];
    const upcoming: AppointmentRow[] = [];
    const past: AppointmentRow[] = [];
    for (const a of appointments ?? []) {
      const t = new Date(a.scheduled_at);
      if (t >= start && t < end) today.push(a);
      else if (t >= end) upcoming.push(a);
      else past.push(a);
    }
    past.reverse();
    return { todayList: today, upcomingList: upcoming, pastList: past };
  }, [appointments]);

  const list = tab === "today" ? todayList : tab === "upcoming" ? upcomingList : pastList;

  const save = useMutation({
    mutationFn: async (a: Partial<Appointment>) => {
      if (!a.patient_id) throw new Error("Pick a patient");
      if (!a.scheduled_at) throw new Error("Pick a date and time");
      const payload = {
        clinic_id: clinic!.id,
        patient_id: a.patient_id,
        scheduled_at: new Date(a.scheduled_at).toISOString(),
        duration_minutes: Number(a.duration_minutes ?? 30),
        status: (a.status ?? "scheduled") as Status,
        reason: nullify(a.reason),
        notes: nullify(a.notes),
      };
      if (a.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("appointments")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Appointment saved");
      qc.invalidateQueries({ queryKey: ["appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments-count", clinic?.id] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments-count", clinic?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at: string }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ scheduled_at: new Date(scheduled_at).toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      qc.invalidateQueries({ queryKey: ["appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments-count", clinic?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment deleted");
      qc.invalidateQueries({ queryKey: ["appointments", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["today-appointments-count", clinic?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

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
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            {clinic.name} · {todayList.length} today
          </p>
        </div>
        <button
          onClick={() => setEditing(defaultDraft(clinic.id))}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated"
        >
          <CalendarPlus className="h-4 w-4" /> New appointment
        </button>
      </div>

      <div className="mb-4 inline-flex rounded-full border border-border bg-card p-1 text-sm">
        {(["today", "upcoming", "past"] as FilterTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 capitalize transition-smooth ${
              tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t} {t === "today" ? `(${todayList.length})` : t === "upcoming" ? `(${upcomingList.length})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          Loading appointments…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <CalendarCheck className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            {tab === "today" ? "No appointments today" : tab === "upcoming" ? "Nothing upcoming" : "No past appointments"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule one to keep your day organised.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((a) => {
            const dt = new Date(a.scheduled_at);
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <span className="text-[10px] font-semibold uppercase">
                    {dt.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-base font-bold leading-none">{dt.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    {a.patient ? (
                      <Link
                        to="/app/patients/$patientId"
                        params={{ patientId: a.patient.id }}
                        className="truncate hover:underline"
                      >
                        {a.patient.full_name}
                      </Link>
                    ) : (
                      <span className="truncate text-muted-foreground">Unknown patient</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {a.duration_minutes} min
                    </span>
                    {a.reason && <span className="truncate">· {a.reason}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    value={a.status}
                    onValueChange={(v) => setStatus.mutate({ id: a.id, status: v as Status })}
                  >
                    <SelectTrigger className="h-8 w-[130px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ReschedulePopover
                    scheduledAt={a.scheduled_at}
                    onChange={(scheduled_at) => reschedule.mutate({ id: a.id, scheduled_at })}
                  />
                  <button
                    onClick={() =>
                      setEditing({ ...a, scheduled_at: toLocalInput(new Date(a.scheduled_at)) })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this appointment?")) remove.mutate(a.id);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit appointment" : "New appointment"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="patient">Patient *</Label>
                <Select
                  value={editing.patient_id ?? ""}
                  onValueChange={(v) => setEditing({ ...editing, patient_id: v })}
                >
                  <SelectTrigger id="patient">
                    <SelectValue placeholder={(patients?.length ?? 0) === 0 ? "Add a patient first" : "Select patient"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(patients ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(patients?.length ?? 0) === 0 && (
                  <Link to="/app/patients/new" className="text-xs font-medium text-primary hover:underline">
                    + Add a patient
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="when">Date & time *</Label>
                  <Input
                    id="when"
                    type="datetime-local"
                    value={editing.scheduled_at ?? ""}
                    onChange={(e) => setEditing({ ...editing, scheduled_at: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={5}
                    step={5}
                    value={editing.duration_minutes ?? 30}
                    onChange={(e) =>
                      setEditing({ ...editing, duration_minutes: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={editing.status ?? "scheduled"}
                  onValueChange={(v) => setEditing({ ...editing, status: v as Status })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  placeholder="Follow-up, consultation…"
                  value={editing.reason ?? ""}
                  onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function nullify(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function ReschedulePopover({
  scheduledAt,
  onChange,
}: {
  scheduledAt: string;
  onChange: (scheduledAtLocal: string) => void;
}) {
  const initial = useMemo(() => new Date(scheduledAt), [scheduledAt]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(initial);
  const [time, setTime] = useState<string>(
    `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`,
  );

  const apply = () => {
    if (!date) return;
    const [hh, mm] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(hh ?? 0, mm ?? 0, 0, 0);
    onChange(toLocalInput(d));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDate(new Date(scheduledAt));
          const d = new Date(scheduledAt);
          setTime(
            `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          );
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
          aria-label="Reschedule"
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Reschedule</p>
          <p className="text-[11px] text-muted-foreground">Pick a new date and time</p>
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9"
          />
          <Button size="sm" onClick={apply} disabled={!date}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
