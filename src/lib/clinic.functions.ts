import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureDoctorClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      clinicName: z.string().trim().min(2).max(120),
      doctorName: z.string().trim().max(120).optional().nullable(),
      qualification: z.string().trim().max(120).optional().nullable(),
      registrationNo: z.string().trim().max(80).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      email: z.string().trim().email().max(255).optional().or(z.literal("")).nullable(),
      addressLine1: z.string().trim().max(255).optional().nullable(),
      addressLine2: z.string().trim().max(255).optional().nullable(),
      logoDataUrl: z.string().max(700_000).optional().nullable(),
      signatureDataUrl: z.string().max(700_000).optional().nullable(),
      showMedicineNamesOnPrescription: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing, error: existingError } = await supabase
      .from("clinics")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw rolesError;

    const hasDoctorRole = (roles ?? []).some((r) => r.role === "doctor");
    const hasPatientRole = (roles ?? []).some((r) => r.role === "patient");
    if (hasPatientRole && !hasDoctorRole) {
      throw new Error("This login is a patient account. Please sign in with the doctor account.");
    }

    const payload = {
      name: data.clinicName,
      owner_id: userId,
      doctor_name: nullify(data.doctorName),
      qualification: nullify(data.qualification),
      registration_no: nullify(data.registrationNo),
      phone: nullify(data.phone),
      email: nullify(data.email),
      address_line1: nullify(data.addressLine1),
      address_line2: nullify(data.addressLine2),
      logo_data_url: nullify(data.logoDataUrl),
      signature_data_url: nullify(data.signatureDataUrl),
      show_medicine_names_on_prescription: data.showMedicineNamesOnPrescription === true,
    };

    let { data: clinic, error: clinicError } = await supabaseAdmin
      .from("clinics")
      .insert(payload)
      .select("*")
      .single();
    if (clinicError && /column|schema cache/i.test(clinicError.message)) {
      const fallback = await supabaseAdmin
        .from("clinics")
        .insert({ name: data.clinicName, owner_id: userId })
        .select("id, name")
        .single();
      clinic = fallback.data;
      clinicError = fallback.error;
    }
    if (clinicError) throw clinicError;

    if (!hasDoctorRole) {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "doctor",
        clinic_id: clinic.id,
      });
      if (roleError) throw roleError;
    }

    return clinic;
  });

function nullify(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
