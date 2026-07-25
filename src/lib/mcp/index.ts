import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPatients from "./tools/list-patients";
import getPatient from "./tools/get-patient";
import listAppointments from "./tools/list-appointments";
import createAppointment from "./tools/create-appointment";
import listFollowUps from "./tools/list-follow-ups";
import listRemedies from "./tools/list-remedies";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "homeocare-mcp",
  title: "HomeoCare MCP",
  version: "0.1.0",
  instructions:
    "Tools for HomeoCare, a homeopathy clinic management app. Signed-in doctors can search patients, read visit histories, list and create appointments, review upcoming follow-ups, and check remedy inventory. All actions are scoped to the caller's clinic.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listPatients,
    getPatient,
    listAppointments,
    createAppointment,
    listFollowUps,
    listRemedies,
  ],
});
