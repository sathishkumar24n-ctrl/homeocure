type ClinicBranding = {
  name?: string | null;
  doctor_name?: string | null;
  qualification?: string | null;
  registration_no?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  logo_data_url?: string | null;
  signature_data_url?: string | null;
  show_medicine_names_on_prescription?: boolean | null;
};

type PatientDetails = {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
};

type VisitPrescription = {
  visit_date?: string | null;
  chief_complaint?: string | null;
  dosage?: string | null;
  next_follow_up?: string | null;
  prescription?: string | null;
  medicine_count?: number | null;
};

export function PrescriptionTemplate({
  clinic,
  patient,
  visit,
  verifyUrl,
  printRoot,
}: {
  clinic: ClinicBranding;
  patient: PatientDetails;
  visit: VisitPrescription;
  verifyUrl: string;
  printRoot?: boolean;
}) {
  const showMedicineNames = clinic.show_medicine_names_on_prescription === true;
  const medicines = prescriptionRows(visit.prescription, visit.medicine_count, showMedicineNames);
  const rows = [
    ...medicines,
    ...Array.from({ length: Math.max(0, 5 - medicines.length) }, () => ""),
  ];

  return (
    <>
      {printRoot && <PrintOnlyStyles />}
      <div id={printRoot ? "print-prescription-root" : undefined} className="prescription-sheet">
        <div className="rx-frame">
          <header className="rx-header">
            <div className="rx-logo-box">
              {clinic.logo_data_url ? (
                <img src={clinic.logo_data_url} alt="Clinic logo" className="rx-logo" />
              ) : (
                <div className="rx-logo-empty">PLACE LOGO HERE</div>
              )}
            </div>
            <div className="rx-doctor">
              <div className="rx-doctor-name">Dr. {clinic.doctor_name || "Doctor"}</div>
              <div>{clinic.qualification || "BHMS / MD (Hom.)"}</div>
              <div>Reg. No.: {clinic.registration_no || "________________"}</div>
              {clinic.phone && <div>{clinic.phone}</div>}
              {clinic.email && <div>{clinic.email}</div>}
              {clinic.address_line1 && <div>{clinic.address_line1}</div>}
              {clinic.address_line2 && <div>{clinic.address_line2}</div>}
            </div>
          </header>

          <section className="rx-section">
            <div className="rx-section-title">Patient Details</div>
            <div className="rx-grid">
              <Line label="Patient ID" value={shortId(patient.id)} />
              <Line label="Name" value={patient.full_name} />
              <Line label="Age" value={ageFromDob(patient.date_of_birth)} />
              <Line label="Gender" value={formatGender(patient.gender)} />
              <Line label="Mobile" value={patient.phone} />
              <Line label="Date" value={formatDate(visit.visit_date)} />
              <Line label="Address" value={patient.address} wide />
            </div>
          </section>

          <section className="rx-section">
            <div className="rx-line-title">Chief Complaint / Presenting Complaints</div>
            <div className="rx-writing-lines">{visit.chief_complaint || ""}</div>
          </section>

          <section className="rx-section">
            <div className="rx-line-title">Clinical Diagnosis</div>
            <div className="rx-writing-lines" />
          </section>

          <section className="rx-table-wrap">
            <div className="rx-tab">Rx</div>
            <table className="rx-table">
              <thead>
                <tr>
                  <th>S. No.</th>
                  <th>Medicine / Bottle No. (Code)</th>
                  <th>Potency</th>
                  <th>Dose</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((medicine, index) => (
                  <tr key={`${medicine}-${index}`}>
                    <td>{index + 1}.</td>
                    <td>{medicine}</td>
                    <td />
                    <td>{index === 0 ? visit.dosage || "As advised" : ""}</td>
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rx-bottom-grid">
            <div>
              <div className="rx-line-title">Advice</div>
              {["Diet Advice", "Water Intake", "Sleep", "Exercise", "Avoid", "Other"].map(
                (label) => (
                  <div key={label} className="rx-check-line">
                    <span className="rx-box" /> {label}
                  </div>
                ),
              )}
            </div>
            <div>
              <div className="rx-line-title">Follow-up</div>
              <Line label="Review After" value="" />
              <Line label="Or On Date" value={formatDate(visit.next_follow_up)} />
              <div className="rx-instructions">
                <strong>Important Instructions</strong>
                <ul>
                  <li>Take medicines as advised.</li>
                  <li>Do not stop the medicine without consulting the doctor.</li>
                  <li>Keep out of reach of children.</li>
                  <li>Inform the doctor about changes in your condition.</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="rx-footer">
            <div className="rx-verify">
              <img src={qrCodeUrl(verifyUrl)} alt="Prescription verification QR code" />
              <div>
                <strong>Scan to verify this prescription</strong>
                <p>This prescription is digitally verified for authenticity.</p>
              </div>
            </div>
            <div className="rx-signature">
              {clinic.signature_data_url ? (
                <img src={clinic.signature_data_url} alt="Doctor digital signature" />
              ) : (
                <div className="rx-signature-placeholder">Digital Signature</div>
              )}
              <div>Doctor Signature</div>
            </div>
          </footer>
        </div>
        <PrescriptionStyles />
      </div>
    </>
  );
}

function Line({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "rx-line rx-wide" : "rx-line"}>
      <span>{label}</span>
      <strong>{value || ""}</strong>
    </div>
  );
}

function PrintOnlyStyles() {
  return (
    <style>{`
      @media screen {
        #print-prescription-root {
          display: none;
        }
      }

      @media print {
        @page {
          size: A4;
          margin: 8mm;
        }

        body * {
          visibility: hidden !important;
        }

        #print-prescription-root,
        #print-prescription-root * {
          visibility: visible !important;
        }

        #print-prescription-root {
          display: block !important;
          position: absolute;
          inset: 0 auto auto 0;
          width: 100%;
          background: white;
        }
      }
    `}</style>
  );
}

function PrescriptionStyles() {
  return (
    <style>{`
      .prescription-sheet {
        color: #111827;
        background: white;
        font-family: Arial, sans-serif;
      }

      .rx-frame {
        max-width: 820px;
        min-height: 1120px;
        margin: 0 auto;
        border: 2px solid #0b5394;
        background: white;
      }

      .rx-header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 28px;
        padding: 28px 38px 22px;
        border-bottom: 2px solid #0b5394;
      }

      .rx-logo-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 160px;
        height: 130px;
        border: 1.5px dashed #2f80d0;
        border-radius: 14px;
      }

      .rx-logo {
        max-width: 135px;
        max-height: 105px;
        object-fit: contain;
      }

      .rx-logo-empty {
        color: #0b5394;
        font-size: 20px;
        font-weight: 700;
        text-align: center;
        line-height: 1.25;
      }

      .rx-doctor {
        border-left: 1px solid #2f80d0;
        padding-left: 28px;
        font-size: 14px;
        line-height: 1.65;
      }

      .rx-doctor-name {
        color: #0b5394;
        font-size: 22px;
        font-weight: 800;
      }

      .rx-section {
        padding: 18px 28px 0;
      }

      .rx-section-title {
        display: inline-block;
        margin-bottom: 14px;
        border-radius: 4px;
        background: #0b5394;
        color: white;
        padding: 7px 12px;
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .rx-grid {
        display: grid;
        grid-template-columns: 1fr 1.3fr 0.9fr;
        gap: 14px 26px;
      }

      .rx-line {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: end;
        font-size: 13px;
      }

      .rx-line strong {
        min-height: 20px;
        border-bottom: 1px solid #374151;
        font-weight: 500;
      }

      .rx-wide {
        grid-column: 1 / -1;
      }

      .rx-line-title {
        color: #0b5394;
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .rx-writing-lines {
        min-height: 44px;
        margin-top: 10px;
        white-space: pre-wrap;
        border-bottom: 1px solid #374151;
        box-shadow: 0 26px 0 -25px #374151;
      }

      .rx-table-wrap {
        position: relative;
        margin: 22px 22px 0;
        border: 1.5px solid #0b5394;
        border-radius: 8px;
        overflow: hidden;
      }

      .rx-tab {
        width: 82px;
        background: #0b5394;
        color: white;
        padding: 8px 20px;
        font-size: 18px;
        font-weight: 800;
      }

      .rx-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .rx-table th {
        background: #0b5394;
        color: white;
        padding: 9px 6px;
        text-align: center;
        text-transform: uppercase;
      }

      .rx-table td {
        height: 34px;
        border: 1px solid #8ab4e8;
        padding: 6px 8px;
      }

      .rx-table td:first-child {
        width: 60px;
        text-align: center;
      }

      .rx-bottom-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 34px;
        padding: 22px 28px;
      }

      .rx-check-line {
        margin-top: 11px;
        border-bottom: 1px solid #9ca3af;
        padding-bottom: 4px;
        font-size: 13px;
      }

      .rx-box {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 6px;
        border: 1px solid #9ca3af;
      }

      .rx-instructions {
        margin-top: 18px;
        border: 1px solid #8ab4e8;
        border-radius: 8px;
        padding: 12px;
        color: #111827;
        font-size: 12px;
      }

      .rx-instructions strong {
        color: #0b5394;
        text-transform: uppercase;
      }

      .rx-instructions ul {
        margin: 8px 0 0 18px;
        padding: 0;
        line-height: 1.5;
      }

      .rx-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 22px;
        border-top: 1px solid #c7dbf5;
        padding: 14px 26px 20px;
      }

      .rx-verify {
        display: flex;
        align-items: center;
        gap: 14px;
        color: #0b5394;
        font-size: 12px;
        text-transform: uppercase;
      }

      .rx-verify img {
        width: 86px;
        height: 86px;
        border: 1px solid #8ab4e8;
        border-radius: 8px;
      }

      .rx-verify p {
        margin: 5px 0 0;
        color: #111827;
        max-width: 180px;
        text-transform: none;
      }

      .rx-signature {
        min-width: 260px;
        border: 1.5px dashed #2f80d0;
        border-radius: 12px;
        padding: 10px;
        text-align: center;
        color: #0b5394;
        font-size: 12px;
        font-weight: 700;
      }

      .rx-signature img {
        display: block;
        height: 56px;
        max-width: 210px;
        object-fit: contain;
        margin: 0 auto 6px;
        border-bottom: 1px solid #0b5394;
      }

      .rx-signature-placeholder {
        height: 56px;
        margin-bottom: 6px;
        border-bottom: 1px solid #0b5394;
        line-height: 56px;
      }

      @media print {
        .rx-frame {
          max-width: none;
          width: 100%;
          min-height: auto;
        }
      }
    `}</style>
  );
}

function countDispensedMedicines(prescription?: string | null, explicitCount?: number | null) {
  if (explicitCount && explicitCount > 0) return Math.min(explicitCount, 12);
  const parts = (prescription ?? "")
    .split(/\n|;|,/)
    .map((part) => part.trim())
    .filter(Boolean);
  return Math.max(1, Math.min(parts.length || 1, 12));
}

function prescriptionRows(
  prescription?: string | null,
  explicitCount?: number | null,
  showMedicineNames?: boolean,
) {
  const count = countDispensedMedicines(prescription, explicitCount);
  const parsedNames = (prescription ?? "")
    .split(/\n|;|,/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);

  return Array.from({ length: count }, (_, index) => {
    if (showMedicineNames && parsedNames[index]) return parsedNames[index];
    return `Medicine ${index + 1}`;
  });
}

function qrCodeUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(value)}`;
}

function shortId(id?: string | null) {
  return id ? id.slice(0, 8).toUpperCase() : "";
}

function formatGender(gender?: string | null) {
  if (!gender) return "";
  return gender.slice(0, 1).toUpperCase() + gender.slice(1);
}

function ageFromDob(value?: string | null) {
  if (!value) return "";
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age > 0 ? String(age) : "";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
