import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, ImagePlus, Loader2, PenLine, Save } from "lucide-react";
import { toast } from "sonner";
import { ClinicSetupCard } from "@/components/clinic-setup-card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useClinic } from "@/hooks/use-clinic";
import { supabase } from "@/integrations/supabase/client";
import { imageFileToDataUrl } from "@/lib/image-data-url";

export const Route = createFileRoute("/app/clinic")({
  component: ClinicProfilePage,
});

function ClinicProfilePage() {
  const { user } = useAuth();
  const { data: clinic, isLoading } = useClinic();
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (!clinic) return;
    setForm({
      clinicName: clinic.name ?? "",
      doctorName: clinic.doctor_name ?? "",
      qualification: clinic.qualification ?? "",
      registrationNo: clinic.registration_no ?? "",
      phone: clinic.phone ?? "",
      email: clinic.email ?? "",
      addressLine1: clinic.address_line1 ?? "",
      addressLine2: clinic.address_line2 ?? "",
      logoDataUrl: clinic.logo_data_url ?? "",
      signatureDataUrl: clinic.signature_data_url ?? "",
      showMedicineNamesOnPrescription: clinic.show_medicine_names_on_prescription === true,
    });
  }, [clinic]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!clinic?.id) throw new Error("Clinic profile not found");
      const { error } = await supabase
        .from("clinics")
        .update({
          name: form.clinicName.trim(),
          doctor_name: nullify(form.doctorName),
          qualification: nullify(form.qualification),
          registration_no: nullify(form.registrationNo),
          phone: nullify(form.phone),
          email: nullify(form.email),
          address_line1: nullify(form.addressLine1),
          address_line2: nullify(form.addressLine2),
          logo_data_url: nullify(form.logoDataUrl),
          signature_data_url: nullify(form.signatureDataUrl),
          show_medicine_names_on_prescription: form.showMedicineNamesOnPrescription,
        })
        .eq("id", clinic.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clinic profile saved");
      qc.invalidateQueries({ queryKey: ["clinic", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading clinic...</div>;
  }

  if (!clinic) return <ClinicSetupCard />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="rounded-3xl bg-gradient-soft p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-soft">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Clinic profile
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Prescription branding</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              These details are used in printed prescriptions and QR verification.
            </p>
          </div>
        </div>
      </div>

      <form
        className="mt-5 space-y-5 rounded-3xl border border-border/60 bg-card p-5 shadow-card sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
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

        <MedicineNameSetting
          checked={form.showMedicineNamesOnPrescription}
          onCheckedChange={(checked) => set("showMedicineNamesOnPrescription", checked)}
        />

        <button
          type="submit"
          disabled={save.isPending || !form.clinicName.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated disabled:opacity-60 sm:w-auto"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save profile
        </button>
      </form>
    </div>
  );
}

const defaultForm = {
  clinicName: "",
  doctorName: "",
  qualification: "",
  registrationNo: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  logoDataUrl: "",
  signatureDataUrl: "",
  showMedicineNamesOnPrescription: false,
};

function MedicineNameSetting({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Show medicine names in prescription</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Off keeps printed and QR prescriptions privacy-friendly as Medicine 1, Medicine 2.
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
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
        <img src={value} alt={label} className="mb-2 h-24 max-w-full rounded-xl object-contain" />
      ) : (
        <div className="mb-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
          No image uploaded
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

function nullify(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
