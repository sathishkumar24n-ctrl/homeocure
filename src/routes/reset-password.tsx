import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthShell, Field, PrimaryButton } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password - HomeoCare" },
      { name: "description", content: "Reset your HomeoCare account password." },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [canSetPassword, setCanSetPassword] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function prepareRecoverySession() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hasAccessToken = window.location.hash.includes("access_token=");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(error.message);
        } else {
          window.history.replaceState({}, document.title, "/reset-password");
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setCanSetPassword(Boolean(data.session || code || hasAccessToken));
      setCheckingLink(false);
    }

    void prepareRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const sendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent. Please check your email.");
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Password updated. Please sign in again.");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <AuthShell
      title={canSetPassword ? "Create new password" : "Reset your password"}
      subtitle={
        canSetPassword
          ? "Choose a new password for your HomeoCare account."
          : "Enter your email and we will send a secure reset link."
      }
      footer={
        <>
          Remember your password?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {checkingLink ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : canSetPassword ? (
        <form className="space-y-4" onSubmit={updatePassword}>
          <Field
            label="New password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          <Field
            label="Confirm password"
            type="password"
            placeholder="Re-enter new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          <PrimaryButton disabled={busy}>
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Update password"}
          </PrimaryButton>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={sendResetEmail}>
          <Field
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={setEmail}
          />
          <PrimaryButton disabled={busy}>
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Send reset link"}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
