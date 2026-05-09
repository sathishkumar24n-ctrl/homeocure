import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Leaf } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-hero px-4 py-8">
      <Link to="/" className="mx-auto flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
          <Leaf className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight">HomeoCare</span>
      </Link>

      <div className="mx-auto mt-8 w-full max-w-md flex-1">
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-elevated sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      </div>
    </div>
  );
}

export function RoleToggle({
  value,
  onChange,
}: {
  value: "doctor" | "patient";
  onChange: (v: "doctor" | "patient") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
      {(["doctor", "patient"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-smooth ${
            value === r
              ? "bg-gradient-primary text-primary-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r === "doctor" ? "I'm a Doctor" : "I'm a Patient"}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1.5 block w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="w-full rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated active:scale-[0.99]"
    >
      {children}
    </button>
  );
}
