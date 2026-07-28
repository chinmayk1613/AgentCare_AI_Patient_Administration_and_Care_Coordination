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
    id: "patient-chinmay",
    patientId: "demo-patient-chinmay",
    name: "Chinmay Kashikar",
    email: "chinmay.kashikar@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write", "profile:self-service"],
    token: "agentcare-patient-chinmay",
  },
  {
    id: "patient-mayuresh",
    patientId: "demo-patient-mayuresh",
    name: "Mayuresh Kashikar",
    email: "mayuresh.kashikar@agentcare.demo",
    password: "Patient123!",
    role: "patient",
    title: "Patient",
    permissions: ["appointment:self-service", "document:write", "workflow:write", "profile:self-service"],
    token: "agentcare-patient-mayuresh",
  },
  {
    id: "reviewer-vikas",
    name: "Dr Vikas Jha",
    email: "vikas.jha@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Clinical operations physician reviewer",
    departmentScope: "all",
    permissions: ["appointment:manage", "clinical:write", "escalation:review", "directory:manage"],
    token: "agentcare-reviewer-vikas",
  },
  {
    id: "reviewer-arunima",
    name: "Dr Arunima Gosavi",
    email: "arunima.gosavi@agentcare.demo",
    password: "Reviewer123!",
    role: "reviewer",
    title: "Care coordination physician reviewer",
    departmentScope: "all",
    permissions: ["appointment:manage", "clinical:write", "escalation:review", "directory:manage"],
    token: "agentcare-reviewer-arunima",
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
