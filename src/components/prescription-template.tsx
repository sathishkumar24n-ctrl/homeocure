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
  symptoms?: string | null;
  constitution?: string | null;
  miasm?: string | null;
  modalities?: string | null;
  dosage?: string | null;
  next_follow_up?: string | null;
  notes?: string | null;
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
  const diagnosis = clinicalDiagnosis(visit);
  const advice = visit.notes?.trim();

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
              <div className="rx-doctor-name">{doctorName(clinic.doctor_name)}</div>
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
              <Line label="Visit No." value="" />
              <Line label="Weight (kg)" value="" />
              <Line label="BP" value="" />
            </div>
          </section>

          <section className="rx-section">
            <div className="rx-line-title">Chief Complaint / Presenting Complaints</div>
            <div className="rx-writing-lines">{compactText(visit.chief_complaint)}</div>
          </section>

          <section className="rx-section">
            <div className="rx-line-title">Clinical Diagnosis</div>
            <div className="rx-writing-lines">{diagnosis}</div>
          </section>

          {medicines.length > 0 && (
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
                  {medicines.map((medicine, index) => (
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
          )}

          <section className="rx-bottom-grid">
            <div>
              <div className="rx-line-title">Advice</div>
              {advice ? (
                <div className="rx-advice-text">{advice}</div>
              ) : (
                ["Diet Advice", "Water Intake", "Sleep", "Exercise", "Avoid", "Other"].map(
                  (label) => (
                    <div key={label} className="rx-check-line">
                      <span className="rx-box" /> {label}
                    </div>
                  ),
                )
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
          <div className="rx-wave" />
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
        line-height: 1.35;
      }

      .rx-frame {
        position: relative;
        box-sizing: border-box;
        max-width: 794px;
        min-height: 1118px;
        margin: 0 auto;
        overflow: hidden;
        border: 2px solid #0759a5;
        background: white;
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
      }

      .rx-header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 42px;
        min-height: 178px;
        padding: 24px 38px 20px;
        border-bottom: 3px solid #0759a5;
      }

      .rx-logo-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 156px;
        height: 136px;
        border: 1.5px dashed #2f80d0;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      }

      .rx-logo {
        max-width: 135px;
        max-height: 112px;
        object-fit: contain;
      }

      .rx-logo-empty {
        color: #0b5394;
        font-size: 21px;
        font-weight: 700;
        text-align: center;
        line-height: 1.25;
      }

      .rx-doctor {
        display: flex;
        flex-direction: column;
        justify-content: center;
        border-left: 2px solid #75a9dd;
        padding-left: 36px;
        color: #111827;
        font-size: 15px;
        line-height: 1.6;
      }

      .rx-doctor-name {
        color: #0759a5;
        font-size: 28px;
        font-weight: 800;
        line-height: 1.1;
      }

      .rx-section {
        padding: 14px 30px 0;
      }

      .rx-section-title {
        display: inline-block;
        margin-bottom: 12px;
        border-radius: 4px;
        background: linear-gradient(180deg, #126fc4 0%, #0759a5 100%);
        color: white;
        padding: 8px 14px;
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        box-shadow: 0 2px 0 #063f74;
      }

      .rx-grid {
        display: grid;
        grid-template-columns: 1fr 1.3fr 0.9fr;
        gap: 12px 28px;
      }

      .rx-line {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: end;
        min-width: 0;
        font-size: 14px;
      }

      .rx-line strong {
        min-height: 21px;
        border-bottom: 1px solid #374151;
        font-weight: 500;
        word-break: break-word;
      }

      .rx-wide {
        grid-column: 1 / -1;
      }

      .rx-line-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #0759a5;
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .rx-line-title::before {
        content: "";
        width: 18px;
        height: 18px;
        border: 2px solid #0759a5;
        border-radius: 3px;
      }

      .rx-writing-lines {
        min-height: 42px;
        margin-top: 9px;
        white-space: pre-wrap;
        border-bottom: 1px solid #374151;
        box-shadow: 0 26px 0 -25px #374151;
      }

      .rx-table-wrap {
        position: relative;
        margin: 18px 22px 0;
        border: 2px solid #0759a5;
        border-radius: 8px;
        overflow: hidden;
      }

      .rx-tab {
        width: 92px;
        background: linear-gradient(180deg, #126fc4 0%, #0759a5 100%);
        color: white;
        padding: 7px 22px;
        font-size: 20px;
        font-weight: 800;
      }

      .rx-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .rx-table th {
        background: linear-gradient(180deg, #126fc4 0%, #0759a5 100%);
        color: white;
        padding: 8px 6px;
        text-align: center;
        text-transform: uppercase;
      }

      .rx-table td {
        height: 32px;
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
        gap: 40px;
        padding: 18px 30px;
      }

      .rx-advice-text {
        min-height: 120px;
        margin-top: 12px;
        white-space: pre-wrap;
        border-bottom: 1px solid #9ca3af;
        box-shadow:
          0 25px 0 -24px #9ca3af,
          0 50px 0 -49px #9ca3af,
          0 75px 0 -74px #9ca3af,
          0 100px 0 -99px #9ca3af;
        font-size: 13px;
      }

      .rx-check-line {
        margin-top: 12px;
        border-bottom: 1px solid #9ca3af;
        padding-bottom: 4px;
        font-size: 14px;
      }

      .rx-box {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 6px;
        border: 1px solid #9ca3af;
      }

      .rx-instructions {
        margin-top: 14px;
        border: 1px solid #8ab4e8;
        border-radius: 8px;
        padding: 13px 14px;
        color: #111827;
        font-size: 12.5px;
        background: linear-gradient(135deg, #ffffff 0%, #f5fbff 100%);
      }

      .rx-instructions strong {
        color: #0759a5;
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
        padding: 14px 28px 42px;
      }

      .rx-verify {
        display: flex;
        align-items: center;
        gap: 18px;
        color: #0759a5;
        font-size: 12px;
        text-transform: uppercase;
      }

      .rx-verify img {
        width: 92px;
        height: 92px;
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
        min-width: 285px;
        border: 1.5px dashed #2f80d0;
        border-radius: 12px;
        padding: 12px;
        text-align: center;
        color: #0759a5;
        font-size: 12px;
        font-weight: 700;
        background: #fff;
      }

      .rx-signature img {
        display: block;
        height: 58px;
        max-width: 230px;
        object-fit: contain;
        margin: 0 auto 6px;
        border-bottom: 1px solid #0759a5;
      }

      .rx-signature-placeholder {
        height: 58px;
        margin-bottom: 6px;
        border-bottom: 1px solid #0759a5;
        line-height: 58px;
      }

      .rx-wave {
        position: absolute;
        right: -40px;
        bottom: -24px;
        left: -40px;
        height: 54px;
        background:
          radial-gradient(120px 28px at 50% 8px, transparent 48%, #0759a5 50%, transparent 52%),
          linear-gradient(174deg, transparent 0 38%, #0b66b7 39% 56%, #e8f4ff 57% 70%, transparent 71%);
      }

      @media screen and (max-width: 860px) {
        .prescription-sheet {
          padding: 0;
        }

        .rx-frame {
          width: 100%;
          max-width: 100%;
          min-height: auto;
          border-width: 1px;
          box-shadow: none;
        }

        .rx-header,
        .rx-grid,
        .rx-bottom-grid {
          grid-template-columns: 1fr;
        }

        .rx-header {
          gap: 18px;
          padding: 18px;
        }

        .rx-logo-box {
          width: 140px;
          height: 112px;
        }

        .rx-doctor {
          border-left: 0;
          border-top: 2px solid #75a9dd;
          padding: 14px 0 0;
        }

        .rx-doctor-name {
          font-size: 24px;
        }

        .rx-section,
        .rx-bottom-grid {
          padding-right: 16px;
          padding-left: 16px;
        }

        .rx-wide {
          grid-column: auto;
        }

        .rx-table-wrap {
          margin-right: 10px;
          margin-left: 10px;
          overflow-x: auto;
        }

        .rx-table {
          min-width: 620px;
        }

        .rx-footer {
          flex-direction: column;
          align-items: stretch;
          padding: 14px 16px 34px;
        }

        .rx-signature {
          min-width: 0;
        }
      }

      @media print {
        .rx-frame {
          max-width: none;
          width: 100%;
          min-height: 277mm;
          border-color: #0759a5;
          box-shadow: none;
        }

        .rx-header {
          min-height: 48mm;
        }

        .rx-footer {
          padding-bottom: 14mm;
        }
      }
    `}</style>
  );
}

function prescriptionRows(
  prescription?: string | null,
  explicitCount?: number | null,
  showMedicineNames?: boolean,
) {
  const parsedNames = (prescription ?? "")
    .split(/\n|;|,/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);
  const count = explicitCount
    ? Math.min(explicitCount, 12)
    : Math.min(parsedNames.length, 12);
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    if (showMedicineNames && parsedNames[index]) return parsedNames[index];
    return `Medicine ${index + 1}`;
  });
}

function clinicalDiagnosis(visit: VisitPrescription) {
  return [
    visit.symptoms && `Symptoms: ${compactText(visit.symptoms)}`,
    visit.constitution && `Constitution: ${compactText(visit.constitution)}`,
    visit.miasm && `Miasm: ${compactText(visit.miasm)}`,
    visit.modalities && `Modalities: ${compactText(visit.modalities)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function compactText(value?: string | null) {
  return value?.trim().replace(/\n{3,}/g, "\n\n") ?? "";
}

function qrCodeUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(value)}`;
}

function shortId(id?: string | null) {
  return id ? id.slice(0, 8).toUpperCase() : "";
}

function doctorName(value?: string | null) {
  const name = value?.trim();
  if (!name) return "Dr.";
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
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
