import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, PrimaryButton, RoleToggle } from "@/components/auth-shell";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — HomeoCare" },
      { name: "description", content: "Sign in to your HomeoCare clinic account." },
    ],
  }),
});

function LoginPage() {
  const [role, setRole] = useState<"doctor" | "patient">("doctor");

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
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <RoleToggle value={role} onChange={setRole} />
        <Field label="Email" type="email" placeholder="you@clinic.com" autoComplete="email" />
        <Field label="Password" type="password" placeholder="••••••••" autoComplete="current-password" />
        <div className="flex justify-end">
          <button type="button" className="text-xs font-medium text-primary hover:underline">
            Forgot password?
          </button>
        </div>
        <PrimaryButton>Sign in as {role === "doctor" ? "Doctor" : "Patient"}</PrimaryButton>
      </form>
    </AuthShell>
  );
}
