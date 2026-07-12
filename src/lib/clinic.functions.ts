import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureDoctorClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      clinicName: z.string().trim().min(2).max(120),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing, error: existingError } = await supabase
      .from("clinics")
      .select("id, name")
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

    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from("clinics")
      .insert({
        name: data.clinicName,
        owner_id: userId,
      })
      .select("id, name")
      .single();
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
