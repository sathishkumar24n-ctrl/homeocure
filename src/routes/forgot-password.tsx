import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, Field, PrimaryButton } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [{ title: "Reset password — HomeoCare" }],
  }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your registered email address and we’ll send you a secure reset link."
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">Check your email</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            If an account exists for {email}, a password-reset link has been sent.
          </p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} autoComplete="off">
          <div className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
            <Mail className="mr-2 inline h-4 w-4 text-primary" />
            Use the email address registered with HomeoCare.
          </div>
          <Field
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            name="password-reset-email"
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
