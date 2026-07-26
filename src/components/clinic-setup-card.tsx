import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ImagePlus, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ensureDoctorClinic } from "@/lib/clinic.functions";
import { imageFileToDataUrl } from "@/lib/image-data-url";

export function ClinicSetupCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createClinic = useServerFn(ensureDoctorClinic);
  const [form, setForm] = useState({
    clinicName: "",
    doctorName: (user?.user_metadata?.full_name as string | undefined) ?? "",
    qualification: "",
    registrationNo: "",
    phone: "",
    email: user?.email ?? "",
    addressLine1: "",
    addressLine2: "",
    logoDataUrl: "",
    signatureDataUrl: "",
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => createClinic({ data: form }),
    onSuccess: (clinic) => {
      toast.success(`${clinic.name} is ready`);
      qc.invalidateQueries({ queryKey: ["clinic", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
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
              Add the clinic details that should appear on printed prescriptions.
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ProfileField
                  label="Clinic name"
                  required
                  value={form.clinicName}
                  onChange={(value) => set("clinicName", value)}
                  placeholder="Mehta Homeopathy Clinic"
                />
                <ProfileField
                  label="Doctor name"
                  value={form.doctorName}
                  onChange={(value) => set("doctorName", value)}
                  placeholder="Dr. Asha Mehta"
                />
                <ProfileField
                  label="Qualification"
                  value={form.qualification}
                  onChange={(value) => set("qualification", value)}
                  placeholder="BHMS / MD (Hom.)"
                />
                <ProfileField
                  label="Registration no."
                  value={form.registrationNo}
                  onChange={(value) => set("registrationNo", value)}
                  placeholder="Reg. No."
                />
                <ProfileField
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => set("phone", value)}
                  placeholder="+91 98765 43210"
                />
                <ProfileField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => set("email", value)}
                  placeholder="doctor@email.com"
                />
              </div>

              <ProfileField
                label="Clinic address line 1"
                value={form.addressLine1}
                onChange={(value) => set("addressLine1", value)}
                placeholder="Clinic address"
              />
              <ProfileField
                label="Clinic address line 2"
                value={form.addressLine2}
                onChange={(value) => set("addressLine2", value)}
                placeholder="City - PIN"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <ImageUpload
                  label="Clinic logo"
                  icon={<ImagePlus className="h-4 w-4" />}
                  value={form.logoDataUrl}
                  onChange={(value) => set("logoDataUrl", value)}
                />
                <ImageUpload
                  label="Digital signature"
                  icon={<PenLine className="h-4 w-4" />}
                  value={form.signatureDataUrl}
                  onChange={(value) => set("signatureDataUrl", value)}
                />
              </div>

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

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      {required && <span className="text-destructive"> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={255}
        required={required}
        className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

function ImageUpload({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon} {label}
      </div>
      {value ? (
        <img src={value} alt={label} className="mb-2 h-20 max-w-full rounded-xl object-contain" />
      ) : (
        <div className="mb-2 flex h-20 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
          No image
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-secondary-foreground"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            onChange(await imageFileToDataUrl(file));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not upload image");
          }
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-2 text-xs font-semibold text-destructive"
        >
          Remove
        </button>
      )}
    </div>
  );
}
