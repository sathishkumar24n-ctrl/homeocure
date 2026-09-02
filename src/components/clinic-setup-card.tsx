import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CheckCircle2, ImagePlus, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { ensureDoctorClinic } from "@/lib/clinic.functions";
import { imageFileToDataUrl } from "@/lib/image-data-url";

type ClinicSetupForm = {
  clinicName: string;
  doctorName: string;
  qualification: string;
  registrationNo: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  logoDataUrl: string;
  signatureDataUrl: string;
  showMedicineNamesOnPrescription: boolean;
};

export function ClinicSetupCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createClinic = useServerFn(ensureDoctorClinic);
  const [form, setForm] = useState<ClinicSetupForm>({
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
    showMedicineNamesOnPrescription: false,
  });

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => createClinic({ data: form }),
    onSuccess: (clinic) => {
      toast.success(`${clinic.name} is ready`);
      qc.setQueryData(["clinic", user?.id], clinic);
      qc.invalidateQueries({ queryKey: ["clinic", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-[#dbe7e4] bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-4 border-b border-[#e5e9ef] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ccfbf1] text-[#0d9488]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0d9488]">
                  Clinic setup required
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0f1923]">
                  Create your clinic profile
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5a6473]">
                  Set up the details that appear on prescriptions, QR verification, reminders, and
                  doctor-facing clinic records.
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-xs text-[#5a6473] sm:grid-cols-3 lg:w-[420px]">
              {["Clinic identity", "Prescription branding", "Privacy controls"].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl border border-[#e5e9ef] bg-[#f7f8fa] px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <SetupSection
                title="Clinic and doctor details"
                description="Used across dashboard records and printed prescriptions."
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
              </SetupSection>

              <SetupSection
                title="Address"
                description="Shown on the prescription header and verification page."
              >
                <div className="grid gap-3">
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
                </div>
              </SetupSection>

              <SetupSection
                title="Prescription assets"
                description="Upload once, then reuse in every printed and digital prescription."
              >
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
              </SetupSection>

              <MedicineNameSetting
                checked={form.showMedicineNamesOnPrescription}
                onCheckedChange={(checked) => set("showMedicineNamesOnPrescription", checked)}
              />

              <div className="flex flex-col gap-3 rounded-2xl border border-[#dbe7e4] bg-[#f0fdfa] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0d9488]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0f1923]">Ready for doctor testing</p>
                    <p className="mt-1 text-xs leading-5 text-[#5a6473]">
                      You can edit these settings later from Settings.
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={mutation.isPending || !form.clinicName.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d9488] px-5 py-3 text-sm font-semibold text-white shadow-soft transition-smooth hover:bg-[#0f766e] disabled:opacity-60"
                >
                  {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save clinic
                </button>
              </div>
            </form>

            <ClinicSetupPreview form={form} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e5e9ef] bg-white p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[#0f1923]">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[#5a6473]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ClinicSetupPreview({ form }: { form: ClinicSetupForm }) {
  return (
    <aside className="h-fit rounded-2xl border border-[#dbe7e4] bg-[#f8fffd] p-4 lg:sticky lg:top-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0d9488]">
        Prescription preview
      </p>
      <div className="mt-4 rounded-2xl border border-[#0d5ea6]/30 bg-white p-4 shadow-soft">
        <div className="flex gap-4 border-b border-[#0d5ea6]/40 pb-4">
          <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#0d5ea6]/40 bg-[#eff6ff] text-center text-[10px] font-semibold text-[#0d5ea6]">
            {form.logoDataUrl ? (
              <img src={form.logoDataUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              "LOGO"
            )}
          </div>
          <div className="min-w-0 text-xs leading-5 text-[#0f1923]">
            <p className="truncate text-base font-bold text-[#0d5ea6]">
              {form.doctorName || "Dr. Doctor Name"}
            </p>
            <p>{form.qualification || "BHMS / MD (Hom.)"}</p>
            <p>Reg. No.: {form.registrationNo || "Registration"}</p>
            <p className="truncate">{form.phone || "+91 clinic phone"}</p>
            <p className="truncate">{form.email || "doctor@email.com"}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-xs text-[#5a6473]">
          <div>
            <p className="font-semibold text-[#0f1923]">{form.clinicName || "Clinic name"}</p>
            <p>{form.addressLine1 || "Clinic address line 1"}</p>
            <p>{form.addressLine2 || "City - PIN"}</p>
          </div>
          <div className="rounded-xl border border-[#e5e9ef] bg-[#f7f8fa] p-3">
            Medicine names:{" "}
            <span className="font-semibold text-[#0f1923]">
              {form.showMedicineNamesOnPrescription ? "Shown" : "Hidden"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-dashed border-[#0d5ea6]/40 p-3">
            <span className="text-[11px] font-semibold text-[#0d5ea6]">Digital signature</span>
            {form.signatureDataUrl ? (
              <img src={form.signatureDataUrl} alt="" className="h-8 max-w-24 object-contain" />
            ) : (
              <PenLine className="h-4 w-4 text-[#0d5ea6]" />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

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
          Off keeps prescriptions patient-safe as Medicine 1, Medicine 2.
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
  icon: ReactNode;
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
