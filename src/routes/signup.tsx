import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, Smartphone } from "lucide-react";
import { AuthShell, Field, PrimaryButton, RoleToggle } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { authRedirectTo } from "@/lib/auth-redirects";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Create account — HomeoCare" },
      { name: "description", content: "Create your HomeoCare account as a doctor or patient." },
    ],
  }),
});

function SignupPage() {
  const navigate = useNavigate();
  const { user, role: currentRole, loading: authLoading } = useAuth();
  const [role, setRole] = useState<"doctor" | "patient">("doctor");
  const [signupMethod, setSignupMethod] = useState<"email" | "phone">("email");
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: currentRole === "patient" ? "/app/patient" : "/app" });
    }
  }, [authLoading, user, currentRole, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "patient" && signupMethod === "phone") {
      await handlePatientPhoneSignup();
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirectTo(),
        data: {
          full_name: fullName,
          phone,
          role,
          clinic_name: role === "doctor" ? clinicName : null,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created! Check your email if confirmation is required.");
  };

  const changeRole = (nextRole: "doctor" | "patient") => {
    setRole(nextRole);
    setSignupMethod(nextRole === "patient" ? "phone" : "email");
    setEmail("");
    setPhone("");
    setOtp("");
    setOtpSent(false);
    setPassword("");
  };

  const handlePatientPhoneSignup = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!fullName.trim()) {
      toast.error("Enter patient name.");
      return;
    }
    if (!normalizedPhone) {
      toast.error("Enter mobile number with country code, for example +91XXXXXXXXXX.");
      return;
    }

    setBusy(true);
    if (!otpSent) {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: fullName,
            phone: normalizedPhone,
            role: "patient",
            clinic_name: null,
          },
        },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPhone(normalizedPhone);
      setOtpSent(true);
      toast.success("OTP sent. Enter the code to create the patient account.");
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otp.trim(),
      type: "sms",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Patient account created.");
  };

  const onGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectTo() },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
    }
  };

  const roleSteps =
    role === "doctor"
      ? [
          "Create your clinic profile",
          "Add patients with WhatsApp numbers",
          "Start booking visits and follow-ups",
        ]
      : [
          "Create your patient login",
          "Link the phone number your clinic has",
          "Book appointments and view prescriptions",
        ];

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        role === "doctor"
          ? "Set up your clinic in minutes."
          : "Stay connected with your homeopathy doctor."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <RoleToggle value={role} onChange={changeRole} />
        {role === "patient" && (
          <AuthMethodToggle
            value={signupMethod}
            onChange={(method) => {
              setSignupMethod(method);
              setEmail("");
              setPhone("");
              setOtp("");
              setOtpSent(false);
              setPassword("");
            }}
          />
        )}
        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
          <p className="text-sm font-semibold text-foreground">
            {role === "doctor" ? "Clinic setup path" : "Patient access path"}
          </p>
          <div className="mt-3 space-y-2">
            {roleSteps.map((step) => (
              <div key={step} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
        <Field
          label="Full name"
          placeholder={role === "doctor" ? "Dr. Asha Mehta" : "Asha Mehta"}
          autoComplete="name"
          value={fullName}
          onChange={setFullName}
        />
        {role === "doctor" && (
          <Field
            label="Clinic name"
            placeholder="Mehta Homeopathy Clinic"
            value={clinicName}
            onChange={setClinicName}
          />
        )}
        {(role === "doctor" || signupMethod === "email") && (
          <>
            <Field
              label="Email"
              type="email"
              placeholder={role === "doctor" ? "you@clinic.com" : "you@example.com"}
              autoComplete="email"
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Phone (WhatsApp)"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              value={phone}
              onChange={setPhone}
            />
            <Field
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
          </>
        )}
        {role === "patient" && signupMethod === "phone" && (
          <>
            <Field
              label="Mobile number"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              value={phone}
              onChange={(value) => {
                setPhone(value);
                setOtp("");
                setOtpSent(false);
              }}
            />
            {otpSent && (
              <Field
                label="OTP"
                type="text"
                placeholder="6 digit code"
                autoComplete="one-time-code"
                value={otp}
                onChange={setOtp}
              />
            )}
          </>
        )}
        <PrimaryButton disabled={busy}>
          {busy ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : role === "patient" && signupMethod === "phone" && !otpSent ? (
            "Send OTP"
          ) : (
            `Create ${role === "doctor" ? "clinic" : "patient"} account`
          )}
        </PrimaryButton>

        <div className="relative my-2 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-smooth hover:bg-muted disabled:opacity-60"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our Terms & Privacy.
        </p>
      </form>
    </AuthShell>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3a7.18 7.18 0 0 1-10.69-3.77H1.36v3.07A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.38 14.32A7.18 7.18 0 0 1 5 12c0-.81.14-1.59.38-2.32V6.61H1.36a12 12 0 0 0 0 10.78l4.02-3.07z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.81l3.43-3.43A12 12 0 0 0 12 0 12 12 0 0 0 1.36 6.61l4.02 3.07A7.18 7.18 0 0 1 12 4.77z"
      />
    </svg>
  );
}

function AuthMethodToggle({
  value,
  onChange,
}: {
  value: "email" | "phone";
  onChange: (value: "email" | "phone") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("phone")}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-smooth ${
          value === "phone"
            ? "bg-card text-foreground shadow-soft"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Smartphone className="h-3.5 w-3.5" /> Mobile OTP
      </button>
      <button
        type="button"
        onClick={() => onChange("email")}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-smooth ${
          value === "email"
            ? "bg-card text-foreground shadow-soft"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mail className="h-3.5 w-3.5" /> Email
      </button>
    </div>
  );
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
