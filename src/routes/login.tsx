import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, Smartphone } from "lucide-react";
import { AuthShell, Field, PrimaryButton, RoleToggle } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { authRedirectTo } from "@/lib/auth-redirects";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — HomeoCare" },
      { name: "description", content: "Sign in to your HomeoCare clinic account." },
    ],
  }),
});

function safeNext(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function LoginPage() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [role_, setRole] = useState<"doctor" | "patient">("doctor");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const changeRole = (nextRole: "doctor" | "patient") => {
    if (nextRole === role_) return;
    setRole(nextRole);
    setLoginMethod(nextRole === "patient" ? "phone" : "email");
    setEmail("");
    setPassword("");
    setPhone("");
    setOtp("");
    setOtpSent(false);
    setNeedsConfirmation(false);
  };

  useEffect(() => {
    if (!authLoading && user) {
      const next = safeNext();
      if (next) {
        window.location.href = next;
        return;
      }
      navigate({ to: role === "patient" ? "/app/patient" : "/app" });
    }
  }, [authLoading, user, role, navigate]);

  useEffect(() => {
    const clearLoginForm = () => {
      setEmail("");
      setPassword("");
      setPhone("");
      setOtp("");
      setOtpSent(false);
      setNeedsConfirmation(false);
    };
    clearLoginForm();
    window.addEventListener("pageshow", clearLoginForm);
    return () => window.removeEventListener("pageshow", clearLoginForm);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNeedsConfirmation(false);
    setBusy(true);
    if (loginMethod === "phone") {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        setBusy(false);
        toast.error("Enter mobile number with country code, for example +91XXXXXXXXXX.");
        return;
      }

      if (!otpSent) {
        const { error } = await supabase.auth.signInWithOtp({
          phone: normalizedPhone,
          options: { shouldCreateUser: false },
        });
        setBusy(false);
        if (error) {
          toast.error(formatOtpLoginError(error.message));
          return;
        }
        setPhone(normalizedPhone);
        setOtpSent(true);
        toast.success("OTP sent to your mobile number.");
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otp.trim(),
        type: "sms",
      });
      setBusy(false);
      if (error) {
        toast.error(formatOtpVerifyError(error.message));
        return;
      }
      toast.success("Welcome back!");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setNeedsConfirmation(true);
      }
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
  };

  const resendConfirmation = async () => {
    if (!email) {
      toast.error("Enter your email address first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: authRedirectTo("/auth/callback"),
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("A new verification email has been sent. Please use the latest email.");
  };

  const onGoogle = async () => {
    setBusy(true);
    const next = safeNext();
    const redirectTo = next ? authRedirectTo(next) : authRedirectTo();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue caring for your patients."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form key={role_} className="space-y-4" onSubmit={onSubmit} autoComplete="off">
        <RoleToggle value={role_} onChange={changeRole} />
        <AuthMethodToggle
          value={loginMethod}
          onChange={(method) => {
            setLoginMethod(method);
            setEmail("");
            setPassword("");
            setPhone("");
            setOtp("");
            setOtpSent(false);
            setNeedsConfirmation(false);
          }}
        />
        {loginMethod === "phone" && (
          <>
            <Field
              label="Mobile number"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              name={`${role_}-login-phone`}
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
                name={`${role_}-login-otp`}
                value={otp}
                onChange={setOtp}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Patient mobile OTP works after creating a patient account with mobile OTP. Doctor OTP
              works only when the doctor account has a phone login identity.
            </p>
          </>
        )}
        {loginMethod === "email" && (
          <>
            <Field
              label="Email"
              type="email"
              placeholder="you@clinic.com"
              autoComplete="off"
              name={`${role_}-login-email`}
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="off"
              name={`${role_}-login-password`}
              value={password}
              onChange={setPassword}
            />
            <div className="-mt-1 text-right">
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Forgot password?
              </Link>
            </div>
          </>
        )}
        <PrimaryButton disabled={busy}>
          {busy ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : loginMethod === "phone" && !otpSent ? (
            "Send OTP"
          ) : (
            "Sign in"
          )}
        </PrimaryButton>
        {needsConfirmation && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-amber-900">
              This account is still awaiting email verification.
            </p>
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={busy}
              className="mt-2 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
            >
              Resend verification email
            </button>
          </div>
        )}

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
        onClick={() => onChange("email")}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-smooth ${
          value === "email"
            ? "bg-card text-foreground shadow-soft"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mail className="h-3.5 w-3.5" /> Email
      </button>
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

function formatOtpLoginError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("signup") || lower.includes("signups")) {
    return "No mobile OTP account found for this number. Please create the patient account with Mobile OTP first.";
  }
  if (lower.includes("provider") || lower.includes("sms")) {
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
