import { z } from "zod";

export const patientSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")).nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  occupation: z.string().trim().max(120).optional().nullable(),
  allergies: z.string().trim().max(1000).optional().nullable(),
  chronic_conditions: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type PatientInput = z.infer<typeof patientSchema>;

export const visitSchema = z.object({
  visit_date: z.string().min(1, "Visit date is required"),
  chief_complaint: z.string().trim().max(500).optional().nullable(),
  symptoms: z.string().trim().max(2000).optional().nullable(),
  constitution: z.string().trim().max(200).optional().nullable(),
  miasm: z.string().trim().max(200).optional().nullable(),
  modalities: z.string().trim().max(500).optional().nullable(),
  prescription: z.string().trim().max(500).optional().nullable(),
  dosage: z.string().trim().max(200).optional().nullable(),
  fee: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  next_follow_up: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type VisitInput = z.infer<typeof visitSchema>;
