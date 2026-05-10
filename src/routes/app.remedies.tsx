import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/app/remedies")({
  component: RemediesPage,
  head: () => ({
    meta: [
      { title: "Remedies — HomeoCare" },
      { name: "description", content: "Manage your homeopathic remedy inventory and stock levels." },
    ],
  }),
});

type Remedy = {
  id: string;
  clinic_id: string;
  name: string;
  potency: string | null;
  form: string | null;
  batch_number: string | null;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  supplier: string | null;
  expiry_date: string | null;
  notes: string | null;
};

const empty = (clinicId: string): Partial<Remedy> => ({
  clinic_id: clinicId,
  name: "",
  potency: "",
  form: "",
  batch_number: "",
  quantity: 0,
  unit: "units",
  low_stock_threshold: 5,
  supplier: "",
  expiry_date: "",
  notes: "",
});

function RemediesPage() {
  const { user } = useAuth();
  const { data: clinic, isLoading: clinicLoading } = useClinic();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Remedy> | null>(null);

  const { data: remedies, isLoading } = useQuery({
    queryKey: ["remedies", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remedies")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Remedy[];
    },
  });

  const filtered = useMemo(() => {
    if (!remedies) return [];
    const term = q.trim().toLowerCase();
    if (!term) return remedies;
    return remedies.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.potency ?? "").toLowerCase().includes(term) ||
        (r.batch_number ?? "").toLowerCase().includes(term),
    );
  }, [remedies, q]);

  const lowStockCount = useMemo(
    () => (remedies ?? []).filter((r) => Number(r.quantity) <= Number(r.low_stock_threshold)).length,
    [remedies],
  );

  const save = useMutation({
    mutationFn: async (r: Partial<Remedy>) => {
      const payload = {
        clinic_id: clinic!.id,
        name: r.name?.trim() ?? "",
        potency: nullify(r.potency),
        form: nullify(r.form),
        batch_number: nullify(r.batch_number),
        quantity: Number(r.quantity ?? 0),
        unit: r.unit?.trim() || "units",
        low_stock_threshold: Number(r.low_stock_threshold ?? 5),
        supplier: nullify(r.supplier),
        expiry_date: r.expiry_date ? r.expiry_date : null,
        notes: nullify(r.notes),
      };
      if (!payload.name) throw new Error("Name is required");
      if (r.id) {
        const { error } = await supabase.from("remedies").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("remedies")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Remedy saved");
      qc.invalidateQueries({ queryKey: ["remedies", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["low-stock-count", clinic?.id] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const adjust = useMutation({
    mutationFn: async ({ id, delta, current }: { id: string; delta: number; current: number }) => {
      const next = Math.max(0, current + delta);
      const { error } = await supabase.from("remedies").update({ quantity: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["remedies", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["low-stock-count", clinic?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("remedies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Remedy deleted");
      qc.invalidateQueries({ queryKey: ["remedies", clinic?.id] });
      qc.invalidateQueries({ queryKey: ["low-stock-count", clinic?.id] });
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
          <h1 className="text-2xl font-bold tracking-tight">Remedies</h1>
          <p className="text-sm text-muted-foreground">
            {clinic.name}
            {lowStockCount > 0 && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {lowStockCount} low stock
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setEditing(empty(clinic.id))}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated"
        >
          <Plus className="h-4 w-4" /> New remedy
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, potency, or batch"
          className="w-full rounded-full border border-input bg-card pl-9 pr-4 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          Loading remedies…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            {q ? "No matching remedies" : "No remedies yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q ? "Try a different search term." : "Add your first remedy to start tracking stock."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const low = Number(r.quantity) <= Number(r.low_stock_threshold);
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {r.name}
                    {r.potency && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{r.potency}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.form, r.batch_number && `Batch ${r.batch_number}`, r.expiry_date && `Exp ${r.expiry_date}`]
                      .filter(Boolean)
                      .join(" · ") || "No additional info"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      adjust.mutate({ id: r.id, delta: -1, current: Number(r.quantity) })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-muted disabled:opacity-50"
                    disabled={Number(r.quantity) <= 0}
                    aria-label="Decrease"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-[64px] text-center">
                    <p
                      className={`text-base font-bold leading-none ${low ? "text-destructive" : "text-foreground"}`}
                    >
                      {Number(r.quantity)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.unit}</p>
                  </div>
                  <button
                    onClick={() =>
                      adjust.mutate({ id: r.id, delta: 1, current: Number(r.quantity) })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-muted"
                    aria-label="Increase"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(r)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${r.name}?`)) remove.mutate(r.id);
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
            <DialogTitle>{editing?.id ? "Edit remedy" : "New remedy"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="potency">Potency</Label>
                  <Input
                    id="potency"
                    placeholder="30C, 200C, 1M…"
                    value={editing.potency ?? ""}
                    onChange={(e) => setEditing({ ...editing, potency: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="form">Form</Label>
                  <Input
                    id="form"
                    placeholder="Pellets, drops…"
                    value={editing.form ?? ""}
                    onChange={(e) => setEditing({ ...editing, form: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={0}
                    value={editing.quantity ?? 0}
                    onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={editing.unit ?? "units"}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="threshold">Low at</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min={0}
                    value={editing.low_stock_threshold ?? 5}
                    onChange={(e) =>
                      setEditing({ ...editing, low_stock_threshold: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="batch">Batch number</Label>
                  <Input
                    id="batch"
                    value={editing.batch_number ?? ""}
                    onChange={(e) => setEditing({ ...editing, batch_number: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="expiry">Expiry date</Label>
                  <Input
                    id="expiry"
                    type="date"
                    value={editing.expiry_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={editing.supplier ?? ""}
                  onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
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
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={save.isPending}
            >
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
