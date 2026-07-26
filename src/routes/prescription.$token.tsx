import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { PrescriptionTemplate } from "@/components/prescription-template";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/prescription/$token")({
  component: DigitalPrescriptionPage,
  head: () => ({
    meta: [
      { title: "Verified Prescription - HomeoCare" },
      { name: "description", content: "Digitally verified HomeoCare prescription." },
    ],
  }),
});

function DigitalPrescriptionPage() {
  const { token } = Route.useParams();
  const prescription = useQuery({
    queryKey: ["public-prescription", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_prescription", { _token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (prescription.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        Loading prescription...
      </div>
    );
  }

  if (prescription.error || !prescription.data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">Prescription not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The verification link may be invalid or the prescription may no longer be available.
        </p>
      </div>
    );
  }

  const row = prescription.data;
  const verifyUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <div className="min-h-screen bg-muted/30 px-3 py-5">
      <PrescriptionTemplate
        clinic={{
          name: row.clinic_name,
          doctor_name: row.doctor_name,
          qualification: row.qualification,
          registration_no: row.registration_no,
          phone: row.clinic_phone,
          email: row.clinic_email,
          address_line1: row.address_line1,
          address_line2: row.address_line2,
          logo_data_url: row.logo_data_url,
          signature_data_url: row.signature_data_url,
        }}
        patient={{
          id: row.patient_id,
          full_name: row.patient_name,
          phone: row.patient_phone,
          gender: row.patient_gender,
          date_of_birth: row.patient_date_of_birth,
          address: row.patient_address,
        }}
        visit={{
          visit_date: row.visit_date,
          chief_complaint: row.chief_complaint,
          dosage: row.dosage,
          next_follow_up: row.next_follow_up,
          medicine_count: row.medicine_count,
        }}
        verifyUrl={verifyUrl}
      />
    </div>
  );
}
