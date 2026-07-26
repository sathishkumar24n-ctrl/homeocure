import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, Field, PrimaryButton } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [{ title: "Choose new password — HomeoCare" }],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const queryError = params.get("error_description") || params.get("error");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashError = hash.get("error_description") || hash.get("error");

      if (queryError || hashError) {
        toast.error(queryError || hashError || "This reset link is invalid or expired.");
        if (active) setChecking(false);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(error.message);
          if (active) setChecking(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (active) {
        setReady(Boolean(data.session));
        setChecking(false);
      }
    }

    void prepareRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must contain at least 8 characters.");
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

    setPassword("");
    setConfirmPassword("");
    setUpdated(true);
    await supabase.auth.signOut();
    window.setTimeout(() => navigate({ to: "/login", replace: true }), 1500);
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Create a secure password for your HomeoCare account."
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {checking ? (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Checking your reset link…</p>
        </div>
      ) : updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">Password updated</h2>
          <p className="mt-1 text-sm text-muted-foreground">Taking you back to sign in…</p>
        </div>
      ) : ready ? (
        <form className="space-y-4" onSubmit={onSubmit} autoComplete="off">
          <Field
            label="New password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            name="new-password"
            value={password}
            onChange={setPassword}
          />
          <Field
            label="Confirm new password"
            type="password"
            placeholder="Enter the same password again"
            autoComplete="new-password"
            name="confirm-new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          <PrimaryButton disabled={busy}>
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Update password"}
          </PrimaryButton>
        </form>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-sm text-amber-900">
            This password-reset link is invalid or has expired.
          </p>
          <Link
            to="/forgot-password"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
