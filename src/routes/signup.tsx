import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthShell, Field, PrimaryButton, RoleToggle } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: currentRole === "patient" ? "/app/patient" : "/app" });
    }
  }, [authLoading, user, currentRole, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
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

  const onGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
    }
  };

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
        <RoleToggle value={role} onChange={setRole} />
        <Field label="Full name" placeholder="Dr. Asha Mehta" autoComplete="name" value={fullName} onChange={setFullName} />
        {role === "doctor" && (
          <Field label="Clinic name" placeholder="Mehta Homeopathy Clinic" value={clinicName} onChange={setClinicName} />
        )}
        <Field label="Email" type="email" placeholder="you@clinic.com" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="Phone (WhatsApp)" type="tel" placeholder="+91 98765 43210" autoComplete="tel" value={phone} onChange={setPhone} />
        <Field label="Password" type="password" placeholder="At least 8 characters" autoComplete="new-password" value={password} onChange={setPassword} />
        <PrimaryButton disabled={busy}>
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Create ${role === "doctor" ? "clinic" : "patient"} account`}
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
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3a7.18 7.18 0 0 1-10.69-3.77H1.36v3.07A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.38 14.32A7.18 7.18 0 0 1 5 12c0-.81.14-1.59.38-2.32V6.61H1.36a12 12 0 0 0 0 10.78l4.02-3.07z" />
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.81l3.43-3.43A12 12 0 0 0 12 0 12 12 0 0 0 1.36 6.61l4.02 3.07A7.18 7.18 0 0 1 12 4.77z" />
    </svg>
  );
}
