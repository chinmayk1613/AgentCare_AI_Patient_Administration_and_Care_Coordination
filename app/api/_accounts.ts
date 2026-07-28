export type DemoAccountRole = "patient" | "reviewer";

export type DemoAccount = {
  id: string;
  patientId?: string;
  name: string;
  email: string;
  password: string;
  role: DemoAccountRole;
  title: string;
  departmentScope?: string;
  permissions: string[];
  token: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "patient-maya",
    patientId: "demo-patient-1",
    name: "Maya Chen",
    email: "patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-demo",
  },
  {
    id: "patient-noah",
    patientId: "demo-patient-2",
    name: "Noah Williams",
    email: "noah.patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-noah",
  },
  {
    id: "patient-sofia",
    patientId: "demo-patient-3",
    name: "Sofia Rossi",
    email: "sofia.patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-sofia",
  },
  {
    id: "patient-liam",
    patientId: "demo-patient-4",
    name: "Liam O'Connor",
    email: "liam.patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-liam",
  },
  {
    id: "patient-aisha",
    patientId: "demo-patient-5",
    name: "Aisha Khan",
    email: "aisha.patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-aisha",
  },
  {
    id: "patient-mateo",
    patientId: "demo-patient-6",
    name: "Mateo Garcia",
    email: "mateo.patient@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write"],
    token: "agentcare-patient-mateo",
  },
  {
    id: "reviewer-alex",
    name: "Dr. Alex Morgan",
    email: "reviewer@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Clinical operations reviewer",
    departmentScope: "all",
    permissions: ["appointment:manage", "clinical:write", "escalation:review"],
    token: "agentcare-reviewer-demo",
  },
  {
    id: "reviewer-priya",
    name: "Dr. Priya Singh",
    email: "priya.orthopedics@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Orthopedics reviewer",
    departmentScope: "orthopedic-surgery",
    permissions: ["appointment:manage", "clinical:write", "escalation:review"],
    token: "agentcare-reviewer-priya",
  },
  {
    id: "reviewer-elena",
    name: "Dr. Elena Novak",
    email: "elena.cardiology@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Cardiology reviewer",
    departmentScope: "cardiology",
    permissions: ["appointment:manage", "clinical:write", "escalation:review"],
    token: "agentcare-reviewer-elena",
  },
  {
    id: "reviewer-samuel",
    name: "Dr. Samuel Okafor",
    email: "samuel.general@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "General Medicine reviewer",
    departmentScope: "general-medicine",
    permissions: ["appointment:manage", "clinical:write", "escalation:review"],
    token: "agentcare-reviewer-samuel",
  },
  {
    id: "reviewer-hannah",
    name: "Hannah Weber",
    email: "hannah.coordination@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Care coordination staff",
    departmentScope: "all",
    permissions: ["appointment:manage", "escalation:review"],
    token: "agentcare-reviewer-hannah",
  },
];

export function accountByCredentials(email: string, password: string) {
  return DEMO_ACCOUNTS.find(
    (account) => account.email.toLowerCase() === email.toLowerCase() && account.password === password,
  );
}

export function accountByToken(token: string) {
  return DEMO_ACCOUNTS.find((account) => account.token === token);
}
