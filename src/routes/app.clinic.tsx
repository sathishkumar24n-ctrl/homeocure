import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, ImagePlus, Loader2, PenLine, Save, Smartphone } from "lucide-react";
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
  const [otpCode, setOtpCode] = useState("");
  const [otpSentTo, setOtpSentTo] = useState("");

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

        <DoctorOtpLoginSetup
          phone={form.phone}
          authPhone={user?.phone ?? ""}
          otpCode={otpCode}
          otpSentTo={otpSentTo}
          onOtpCodeChange={setOtpCode}
          onOtpSentToChange={setOtpSentTo}
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

function DoctorOtpLoginSetup({
  phone,
  authPhone,
  otpCode,
  otpSentTo,
  onOtpCodeChange,
  onOtpSentToChange,
}: {
  phone: string;
  authPhone: string;
  otpCode: string;
  otpSentTo: string;
  onOtpCodeChange: (value: string) => void;
  onOtpSentToChange: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const normalizedPhone = normalizePhone(phone);
  const normalizedAuthPhone = normalizePhone(authPhone);
  const isEnabled = Boolean(normalizedPhone && normalizedPhone === normalizedAuthPhone);

  const sendOtp = async () => {
    if (!normalizedPhone) {
      toast.error("Enter the clinic phone with country code first, for example +91XXXXXXXXXX.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
    setBusy(false);
    if (error) {
      toast.error(formatOtpSetupError(error.message));
      return;
    }
    onOtpSentToChange(normalizedPhone);
    onOtpCodeChange("");
    toast.success("OTP sent. Enter the code to enable doctor mobile login.");
  };

  const verifyOtp = async () => {
    if (!otpSentTo || !otpCode.trim()) {
      toast.error("Enter the OTP sent to your mobile.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: otpSentTo,
      token: otpCode.trim(),
      type: "phone_change",
    });
    setBusy(false);
    if (error) {
      toast.error(formatOtpVerifyError(error.message));
      return;
    }
    onOtpSentToChange("");
    onOtpCodeChange("");
    toast.success("Doctor mobile OTP login is enabled for this number.");
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Doctor mobile OTP login</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Saved clinic phone: {normalizedPhone || "not set"}
              {isEnabled ? " - OTP login enabled" : " - OTP login not enabled"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={sendOtp}
          disabled={busy || !normalizedPhone || isEnabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-smooth hover:bg-muted disabled:opacity-60"
        >
          {busy && !otpSentTo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isEnabled ? "Enabled" : otpSentTo ? "Resend OTP" : "Enable OTP"}
        </button>
      </div>

      {otpSentTo && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={(e) => onOtpCodeChange(e.target.value)}
            placeholder="6 digit OTP"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="button"
            onClick={verifyOtp}
            disabled={busy || !otpCode.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify
          </button>
        </div>
      )}
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

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return "";
}

function formatOtpSetupError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("provider") || lower.includes("sms") || lower.includes("otp")) {
    return "Mobile OTP is not enabled in Supabase yet. Enable Phone Auth and configure an SMS provider.";
  }
  return message;
}

function formatOtpVerifyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("expired") || lower.includes("invalid")) {
    return "OTP is invalid or expired. Please request a new code.";
  }
  return message;
}
