import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, PrimaryButton, RoleToggle } from "@/components/auth-shell";

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
  const [role, setRole] = useState<"doctor" | "patient">("doctor");

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
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <RoleToggle value={role} onChange={setRole} />
        <Field label="Full name" placeholder="Dr. Asha Mehta" autoComplete="name" />
        {role === "doctor" && (
          <Field label="Clinic name" placeholder="Mehta Homeopathy Clinic" />
        )}
        <Field label="Email" type="email" placeholder="you@clinic.com" autoComplete="email" />
        <Field label="Phone (WhatsApp)" type="tel" placeholder="+91 98765 43210" autoComplete="tel" />
        <Field label="Password" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
        <PrimaryButton>Create {role === "doctor" ? "clinic" : "patient"} account</PrimaryButton>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our Terms & Privacy.
        </p>
      </form>
    </AuthShell>
  );
}
