import { TextareaHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const baseField =
  "mt-1.5 block w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60";

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function FormLabel({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

export function TextField({
  label,
  required,
  ...props
}: { label: string; required?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormLabel label={label} required={required}>
      <input {...props} className={baseField} />
    </FormLabel>
  );
}

export function TextAreaField({
  label,
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FormLabel label={label}>
      <textarea {...props} className={`${baseField} min-h-24 resize-y`} />
    </FormLabel>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FormLabel label={label}>
      <select {...props} className={baseField}>
        {children}
      </select>
    </FormLabel>
  );
}
