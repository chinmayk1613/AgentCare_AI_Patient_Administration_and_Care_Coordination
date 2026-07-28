"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "patient" | "reviewer";
type View = "journey" | "profile" | "appointments" | "followup" | "documents" | "directory" | "audit";
type DemoAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  title: string;
};
type ToolTrace = {
  id?: string;
  agent: string;
  tool: string;
  status: string;
  input?: unknown;
  output?: unknown;
  created_at?: string;
  at?: string;
  server?: string;
  transport?: string;
};
type Workflow = {
  id: string;
  case_number: string;
  request_text: string;
  status: string;
  current_step: string;
  state: {
    message?: string;
    routing?: {
      department_code?: string;
      department_name?: string;
      confidence?: number;
      evidence?: {
        evidence_ref: string;
        title?: string;
        excerpt?: string;
        score?: number;
        chunk_type?: string;
        embedding_model?: string;
      }[];
      recommended_department?: { code: string; name: string };
      matches?: { code: string; name: string }[];
      approval_rationale?: string;
    };
    appointment?: { id: number | string; doctor: string; start_time: string; status: string };
    available_slots?: { id: string; doctor: string; start_time: string; department_code: string }[];
    documents?: { expected?: string[]; received?: string[]; missing?: string[]; latest_status?: string };
    reminders?: { id: number | string; type: string; scheduled_at: string; status?: string }[];
    timeline?: { step: string; status: string; at?: string; summary?: string }[];
    agent_proposals?: { agent: string; decision: string; confidence: number; execution_mode: string; model: string }[];
    tool_traces?: ToolTrace[];
  };
  created_at: string;
};
type Escalation = {
  id: number;
  workflow_run_id: string;
  reason_code: string;
  reason: string;
  severity: string;
  status: string;
  resolution?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  resolved_at?: string | null;
};
type AuditEvent = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};
type EscalationDetail = {
  escalation: Escalation;
  workflow: Workflow;
  departments: { code: string; name: string; symptoms?: string[]; doctors?: string[] }[];
  recommended_department?: { code: string; name: string; doctors?: string[] } | null;
  resume_supported: boolean;
  documents: {
    id: number;
    document_type: string;
    original_name: string;
    status: string;
    checksum: string;
    size_bytes?: number | null;
    created_at: string;
  }[];
  audit: AuditEvent[];
};
type AppointmentDetail = {
  appointment: {
    id: string;
    workflow_id: string;
    department_code: string;
    doctor: string;
    slot_id: string;
    start_time: string;
    status: string;
    display_status?: string;
    reason: string;
    previous_slot_id?: string | null;
    cancellation_reason?: string | null;
    cancelled_at?: string | null;
    completed_at?: string | null;
    doctor_notes?: string | null;
    prescribed_medications: string[];
    follow_up_suggestions?: string | null;
    follow_up_recommended_at?: string | null;
    clinical_source: string;
    created_at: string;
    updated_at: string;
  };
  workflow: Workflow;
  documents: { id: number; document_type: string; original_name: string; status: string; created_at: string }[];
  reminders: { id: number | string; type: string; scheduled_at: string; status?: string }[];
  alternative_slots: { id: string; doctor: string; start_time: string; department_code: string }[];
  history: { id: number; action: string; outcome: string; metadata: Record<string, unknown>; created_at: string }[];
  capabilities: {
    can_cancel: boolean;
    can_reschedule: boolean;
    can_record_clinical_outcome: boolean;
  };
};
type PatientProfile = {
  patient_id: string;
  name: string;
  email: string;
  phone: string;
  preferred_language: string;
  emergency_contact: string;
  updated_at?: string | null;
};
type DirectoryData = {
  departments: {
    code: string;
    name: string;
    active: boolean;
    doctors: { id: string; name: string; active: boolean }[];
  }[];
  slots: {
    id: string;
    departmentCode: string;
    doctorName: string;
    startTime: string;
    status: string;
    bookedWorkflowId?: string | null;
  }[];
};
type DocumentDetail = {
  workflow: Workflow;
  documents: {
    id: number;
    document_type: string;
    original_name: string;
    content_type: string;
    status: string;
    flags: string[];
    checksum: string;
    checksum_algorithm: string;
    storage_reference?: string | null;
    size_bytes?: number | null;
    patient_link_confidence?: number | null;
    created_at: string;
  }[];
  audit: AuditEvent[];
  tools: ToolTrace[];
};

const HOSPITAL_TIME_ZONE = "Asia/Kolkata";

const configuredApi = process.env.NEXT_PUBLIC_API_BASE_URL;
const API =
  configuredApi ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"
    : "");
const demoAccounts: DemoAccount[] = [
  { id: "patient-chinmay", name: "Chinmay Kashikar", email: "chinmay.kashikar@agentcare.demo", password: "Patient123!", role: "patient", title: "Patient" },
  { id: "patient-mayuresh", name: "Mayuresh Kashikar", email: "mayuresh.kashikar@agentcare.demo", password: "Patient123!", role: "patient", title: "Patient" },
  { id: "reviewer-vikas", name: "Dr Vikas Jha", email: "vikas.jha@agentcare.demo", password: "Reviewer123!", role: "reviewer", title: "Clinical operations physician reviewer" },
  { id: "reviewer-arunima", name: "Dr Arunima Gosavi", email: "arunima.gosavi@agentcare.demo", password: "Reviewer123!", role: "reviewer", title: "Care coordination physician reviewer" },
];
const primaryAccounts: Record<Role, DemoAccount> = {
  patient: demoAccounts[0],
  reviewer: demoAccounts[2],
};

const edgeCasePrompts = [
  { label: "Exact specialty", request: "I need a dermatology appointment next week." },
  { label: "Ambiguous symptom", request: "My legs are painful. I need to consult a doctor and submit my MRI report." },
  { label: "Two documents", request: "Book a cardiology follow-up and coordinate my previous ECG and recent lab report." },
  { label: "Reschedule", request: "Please reschedule my cardiology follow-up to next week." },
  { label: "Cancel", request: "Please cancel my dermatology appointment." },
  { label: "No specialty", request: "I need a doctor appointment next week, but I am not sure which department." },
  { label: "Clinical boundary", request: "Please diagnose my condition and prescribe medicine." },
  { label: "Emergency language", request: "I have chest pain and cannot breathe. Book me an appointment." },
];

const flow = [
  "Safety gate",
  "Intent",
  "Routing",
  "Availability",
  "Booking",
  "Documents",
  "Follow-up",
];

function prettyStep(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en", {
    timeZone: HOSPITAL_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value)) + " IST";
}

function formatCalendarDay(value: number) {
  return new Intl.DateTimeFormat("en", {
    timeZone: HOSPITAL_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatHospitalClock(value: number) {
  return new Intl.DateTimeFormat("en", {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function appointmentDatePart(value: string, part: "day" | "month") {
  const options: Intl.DateTimeFormatOptions = part === "day"
    ? { timeZone: HOSPITAL_TIME_ZONE, day: "2-digit" }
    : { timeZone: HOSPITAL_TIME_ZONE, month: "short" };
  return new Intl.DateTimeFormat("en", options).format(new Date(value));
}

function appointmentDisplayStatus(
  appointment: { status: string; start_time: string; display_status?: string },
  now: number,
) {
  if (["cancelled", "completed", "no_show"].includes(appointment.status)) return appointment.status;
  if (new Date(appointment.start_time).getTime() <= now) return "done";
  return appointment.display_status || appointment.status;
}

function friendlyAgentName(value: string) {
  const names: Record<string, string> = {
    "Coordinator Agent": "Care Coordination Service",
    "Safety Agent": "Patient Safety Review",
    "Routing Agent": "Department Routing Service",
    "Department Routing Agent": "Department Routing Service",
    "Appointment Agent": "Scheduling Service",
    "Document Agent": "Medical Records Service",
    "Follow-up Agent": "Follow-up Coordination Service",
  };
  return names[value] || value.replace(/\bAgent\b/g, "Service");
}

function friendlyToolName(value: string) {
  const names: Record<string, string> = {
    retrieve_policy: "Approved policy lookup",
    lookup_department: "Hospital department directory",
    find_available_slots: "Doctor availability check",
    book_appointment_slot: "Appointment reservation",
    reschedule_appointment_slot: "Appointment rescheduling",
    cancel_appointment_slot: "Appointment cancellation",
    check_document_requirements: "Medical-record requirement check",
  };
  return names[value] || prettyStep(value);
}

function formatFileSize(value?: number | null) {
  if (!value) return "Size not recorded";
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function caseNumber(workflow: Pick<Workflow, "id" | "case_number">) {
  return workflow.case_number || `AC-${workflow.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function AgentCareApp() {
  const [role, setRole] = useState<Role>("patient");
  const [token, setToken] = useState("");
  const [name, setName] = useState("Chinmay Kashikar");
  const [accountTitle, setAccountTitle] = useState("Patient");
  const [currentAccountId, setCurrentAccountId] = useState("patient-chinmay");
  const [requestText, setRequestText] = useState(
    "I need a cardiology follow-up next week. I also want to attach my previous ECG.",
  );
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Connecting to the evidence-gated workflow service…");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<View>("journey");
  const [accountOpen, setAccountOpen] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolTrace[]>([]);
  const [caseSearch, setCaseSearch] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ progress: number; status: string; message: string } | null>(null);
  const [reviewDetail, setReviewDetail] = useState<EscalationDetail | null>(null);
  const [reviewRationale, setReviewRationale] = useState("");
  const [reviewDepartment, setReviewDepartment] = useState("");
  const [appointmentDetail, setAppointmentDetail] = useState<AppointmentDetail | null>(null);
  const [followUpDetails, setFollowUpDetails] = useState<Record<string, AppointmentDetail>>({});
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [directoryData, setDirectoryData] = useState<DirectoryData | null>(null);
  const [directoryDepartment, setDirectoryDepartment] = useState("cardiology");
  const [directoryDoctor, setDirectoryDoctor] = useState("");
  const [directorySlotTime, setDirectorySlotTime] = useState("");
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [appointmentMode, setAppointmentMode] = useState<"overview" | "cancel" | "reschedule" | "clinical">("overview");
  const [cancellationReason, setCancellationReason] = useState("");
  const [replacementSlotId, setReplacementSlotId] = useState("");
  const [visitStatus, setVisitStatus] = useState<"scheduled" | "completed" | "no_show">("scheduled");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [medicationsText, setMedicationsText] = useState("");
  const [followUpSuggestions, setFollowUpSuggestions] = useState("");
  const [followUpRecommendedAt, setFollowUpRecommendedAt] = useState("");
  const [hospitalClock, setHospitalClock] = useState(() => Date.now());

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );
  const selectedId = selected?.id;
  const selectedStatus = selected?.status;

  const login = useCallback(async (selection: Role | DemoAccount) => {
    const account = typeof selection === "string" ? primaryAccounts[selection] : selection;
    setBusy(true);
    setRole(account.role);
    setSelected(null);
    setSignedOut(false);
    setAccountOpen(false);
    setActiveView("journey");
    setWorkflows([]);
    setEscalations([]);
    setAuditEvents([]);
    setToolEvents([]);
    setCaseSearch("");
    setReviewDetail(null);
    setReviewRationale("");
    setReviewDepartment("");
    setAppointmentDetail(null);
    setFollowUpDetails({});
    setPatientProfile(null);
    setDirectoryData(null);
    setDocumentDetail(null);
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      if (!response.ok) throw new Error("The API rejected the demo account.");
      const body = await response.json();
      setToken(body.access_token);
      setName(body.name);
      setAccountTitle(body.title || account.title);
      setCurrentAccountId(body.account_id || account.id);
      setApiOnline(true);
      setNotice(`${account.name}'s ${account.role === "patient" ? "patient workspace" : "staff review desk"} connected to live persisted data.`);
    } catch {
      setToken("");
      setApiOnline(false);
      setNotice("The hospital workflow service is unavailable. Restart the service to continue.");
    } finally {
      setBusy(false);
    }
  }, []);

  function logout() {
    setToken("");
    setSignedOut(true);
    setAccountOpen(false);
    setApiOnline(null);
    setWorkflows([]);
    setEscalations([]);
    setSelected(null);
    setAuditEvents([]);
    setToolEvents([]);
    setCaseSearch("");
    setReviewDetail(null);
    setReviewRationale("");
    setReviewDepartment("");
    setAppointmentDetail(null);
    setFollowUpDetails({});
    setPatientProfile(null);
    setDirectoryData(null);
    setDocumentDetail(null);
    setNotice("You have been signed out. Choose a workspace to continue.");
  }

  const loadWorkflows = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API}/api/workflows`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = await response.json();
      setWorkflows(data);
      setSelected((current) => {
        if (!current) return data[0] || null;
        return data.find((item: Workflow) => item.id === current.id) || current;
      });
    }
  }, [token]);

  const loadEscalations = useCallback(async () => {
    if (!token || role !== "reviewer") return;
    const response = await fetch(`${API}/api/staff/escalations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) setEscalations(await response.json());
  }, [token, role]);

  const loadEscalationDetail = useCallback(async (item: Escalation) => {
    if (!token || role !== "reviewer") return;
    const response = await fetch(`${API}/api/staff/escalations/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setNotice("The review case could not be loaded.");
      return;
    }
    const detail = await response.json() as EscalationDetail;
    setReviewDetail(detail);
    setReviewRationale(detail.escalation.resolution || "");
    setReviewDepartment(
      detail.workflow.state.routing?.department_code ||
      detail.recommended_department?.code ||
      detail.departments[0]?.code ||
      "",
    );
  }, [token, role]);

  const loadAudit = useCallback(async () => {
    if (!token || !selected) {
      setAuditEvents([]);
      return;
    }
    const response = await fetch(`${API}/api/workflows/${selected.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = await response.json();
      setAuditEvents(data.audit || []);
      setToolEvents(data.tools || []);
    }
  }, [token, selected]);

  const loadFollowUpDetails = useCallback(async () => {
    if (!token) {
      setFollowUpDetails({});
      return;
    }
    const appointmentWorkflows = workflows.filter((item) => item.state.appointment);
    if (!appointmentWorkflows.length) {
      setFollowUpDetails({});
      return;
    }
    setFollowUpLoading(true);
    try {
      const results = await Promise.all(appointmentWorkflows.map(async (workflow) => {
        const response = await fetch(`${API}/api/appointments/${workflow.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        return [workflow.id, await response.json() as AppointmentDetail] as const;
      }));
      setFollowUpDetails(Object.fromEntries(results.filter((item): item is readonly [string, AppointmentDetail] => Boolean(item))));
    } finally {
      setFollowUpLoading(false);
    }
  }, [token, workflows]);

  const loadPatientProfile = useCallback(async () => {
    if (!token || role !== "patient") return;
    const response = await fetch(`${API}/api/profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setPatientProfile(await response.json());
  }, [token, role]);

  const loadDirectory = useCallback(async () => {
    if (!token || role !== "reviewer") return;
    const response = await fetch(`${API}/api/staff/directory`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) {
      const data = await response.json() as DirectoryData;
      setDirectoryData(data);
      const department = data.departments.find((item) => item.code === directoryDepartment) || data.departments[0];
      if (department && !department.doctors.some((doctor) => doctor.name === directoryDoctor)) {
        setDirectoryDoctor(department.doctors.find((doctor) => doctor.active)?.name || department.doctors[0]?.name || "");
      }
    }
  }, [token, role, directoryDepartment, directoryDoctor]);

  async function savePatientProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !patientProfile) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(patientProfile),
      });
      const body = await response.json().catch(() => ({ detail: "Profile update failed." }));
      if (!response.ok) throw new Error(body.detail || "Profile update failed.");
      setPatientProfile(body);
      setNotice("Your administrative profile was updated and audit logged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Profile update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDirectoryEntity(payload: Record<string, unknown>) {
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/staff/directory`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({ detail: "Directory update failed." }));
      if (!response.ok) throw new Error(body.detail || "Directory update failed.");
      await loadDirectory();
      setNotice("Hospital directory control updated and audit logged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Directory update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createDirectorySlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !directoryDoctor || !directorySlotTime) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/staff/directory`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          department_code: directoryDepartment,
          doctor_name: directoryDoctor,
          start_time: new Date(directorySlotTime).toISOString(),
        }),
      });
      const body = await response.json().catch(() => ({ detail: "Slot creation failed." }));
      if (!response.ok) throw new Error(body.detail || "Slot creation failed.");
      setDirectorySlotTime("");
      await loadDirectory();
      setNotice("A new conflict-protected appointment slot was created and audit logged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Slot creation failed.");
    } finally {
      setBusy(false);
    }
  }

  const openDocumentCase = useCallback(async (item: Workflow) => {
    if (!token) return;
    setSelected(item);
    setAppointmentDetail(null);
    setDocumentDetail(null);
    setDocumentLoading(true);
    try {
      const response = await fetch(`${API}/api/workflows/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({ detail: "The medical-record case could not be loaded." }));
      if (!response.ok) throw new Error(body.detail || "The medical-record case could not be loaded.");
      setDocumentDetail(body as DocumentDetail);
      setNotice("Medical-record coordination details loaded from persisted hospital records.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The medical-record case could not be loaded.");
    } finally {
      setDocumentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void login("patient"), 0);
    return () => window.clearTimeout(timer);
  }, [login]);

  useEffect(() => {
    const timer = window.setInterval(() => setHospitalClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflows();
      void loadEscalations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflows, loadEscalations]);

  useEffect(() => {
    if (!token || !selectedId || !selectedStatus || !["running", "awaiting_document", "human_review"].includes(selectedStatus)) return;
    const timer = window.setInterval(() => {
      void loadWorkflows();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [token, selectedId, selectedStatus, loadWorkflows]);

  useEffect(() => {
    if (activeView !== "audit") return;
    const timer = window.setTimeout(() => void loadAudit(), 0);
    return () => window.clearTimeout(timer);
  }, [activeView, loadAudit]);

  useEffect(() => {
    if (activeView !== "followup") return;
    const timer = window.setTimeout(() => void loadFollowUpDetails(), 0);
    return () => window.clearTimeout(timer);
  }, [activeView, loadFollowUpDetails]);

  useEffect(() => {
    if (!["profile", "directory"].includes(activeView)) return;
    const timer = window.setTimeout(() => {
      if (activeView === "profile") void loadPatientProfile();
      if (activeView === "directory") void loadDirectory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeView, loadPatientProfile, loadDirectory]);

  useEffect(() => {
    if (!token || !selected || selected.status !== "running" || advancing) return;
    const timer = window.setTimeout(async () => {
      setAdvancing(true);
      try {
        const response = await fetch(`${API}/api/workflows/${selected.id}/advance`, {
          method: "POST",
          headers: authHeaders,
        });
        if (response.ok) {
          const updated = await response.json();
          setSelected(updated);
          setWorkflows((items) => items.map((item) => item.id === updated.id ? updated : item));
          setNotice(updated.state.message || `Checkpoint ${prettyStep(updated.current_step)} persisted.`);
        }
      } finally {
        setAdvancing(false);
      }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [token, selected, advancing, authHeaders]);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!token || requestText.trim().length < 8) return;
    setBusy(true);
    setNotice("Coordinator is checkpointing the specialist workflow…");
    try {
      const response = await fetch(`${API}/api/workflows`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          request_text: requestText,
          idempotency_key: `patient-ui-${crypto.randomUUID()}`,
          confirm_first_available: false,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Workflow could not be started.");
      setSelected(body);
      setNotice(
        body.status === "completed"
          ? `${caseNumber(body)} was completed and confirmed from persisted records.`
          : `${caseNumber(body)} was created and paused safely for the next required step.`,
      );
      await loadWorkflows();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The workflow could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSlot(slotId: string) {
    if (!selected || !token) return;
    setBusy(true);
    setNotice("Booking Agent is committing only the slot you selected…");
    try {
      const response = await fetch(`${API}/api/workflows/${selected.id}/confirm-slot`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ slot_id: slotId }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.workflow) {
          setSelected(body.workflow);
          setWorkflows((items) => items.map((item) => item.id === body.workflow.id ? body.workflow : item));
        }
        throw new Error(body.detail || "The slot could not be committed.");
      }
      setSelected(body);
      setWorkflows((items) => items.map((item) => item.id === body.id ? body : item));
      setNotice(body.state.message || "Appointment committed after patient confirmation.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The slot could not be committed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !token) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("document") as HTMLInputElement;
    const syntheticConfirmation = form.elements.namedItem("synthetic") as HTMLInputElement;
    if (!syntheticConfirmation?.checked) {
      setNotice("Confirm that the file contains synthetic demonstration data only. Never upload real PHI.");
      return;
    }
    if (!input.files?.[0]) return;
    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
      setNotice("Document exceeds the 10 MB public-demo upload limit.");
      return;
    }
    setBusy(true);
    setUploadProgress({ progress: 1, status: "preparing", message: "Creating a private upload session…" });
    try {
      const initResponse = await fetch(`${API}/api/uploads`, {
        method: "POST",
        headers: { ...authHeaders, "X-AgentCare-Synthetic-Data": "confirmed" },
        body: JSON.stringify({
          workflow_id: selected.id,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
          declared_type: selected.state.documents?.missing?.[0],
        }),
      });
      const init = await initResponse.json().catch(() => ({ detail: `Upload initialization failed (${initResponse.status})` }));
      if (!initResponse.ok) throw new Error(init.detail || "Private upload could not start.");
      for (let chunkNumber = 0; chunkNumber < init.total_chunks; chunkNumber += 1) {
        const start = chunkNumber * init.chunk_size;
        const chunk = file.slice(start, Math.min(file.size, start + init.chunk_size));
        const chunkResponse = await fetch(`${API}/api/uploads/${init.id}/chunks/${chunkNumber}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
          body: chunk,
        });
        const chunkBody = await chunkResponse.json().catch(() => ({ detail: `Chunk ${chunkNumber + 1} failed (${chunkResponse.status})` }));
        if (!chunkResponse.ok) throw new Error(chunkBody.detail || `Chunk ${chunkNumber + 1} failed.`);
        const progress = Math.round(((chunkNumber + 1) / init.total_chunks) * 50);
        setUploadProgress({ progress, status: "uploading", message: `Encrypted private upload: ${chunkNumber + 1} of ${init.total_chunks} chunks` });
      }
      const finalizeResponse = await fetch(`${API}/api/uploads/${init.id}/finalize`, {
        method: "POST",
        headers: authHeaders,
      });
      let processState = await finalizeResponse.json().catch(() => ({ detail: `Upload finalization failed (${finalizeResponse.status})` }));
      if (!finalizeResponse.ok) throw new Error(processState.detail || "Upload finalization failed.");
      setUploadProgress({ progress: processState.progress, status: processState.status, message: "Private upload complete; validation queued." });
      for (let attempt = 0; attempt < 8 && !["accepted", "quarantined", "mismatch"].includes(processState.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        const processResponse = await fetch(`${API}/api/uploads/${init.id}/process`, {
          method: "POST",
          headers: authHeaders,
        });
        processState = await processResponse.json().catch(() => ({ detail: `Validation failed (${processResponse.status})` }));
        if (!processResponse.ok) throw new Error(processState.detail || "Document validation failed.");
        setUploadProgress({ progress: processState.progress, status: processState.status, message: processState.message });
      }
      if (!["accepted", "quarantined", "mismatch"].includes(processState.status)) throw new Error("Validation is still pending. You can safely return to this case later.");
      setNotice(
        processState.status === "quarantined"
          ? "Document quarantined safely. The appointment was not changed."
          : processState.status === "mismatch"
            ? processState.message
            : `${processState.document_type} accepted; private storage, checksum, patient mapping, and requirements were recorded.`,
      );
      const refreshed = await fetch(`${API}/api/workflows/${selected.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refreshed.ok) {
        const detail = await refreshed.json() as DocumentDetail;
        setSelected(detail.workflow);
        if (documentDetail?.workflow.id === detail.workflow.id) setDocumentDetail(detail);
      }
      await loadWorkflows();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document upload failed.";
      setUploadProgress({ progress: 0, status: "failed", message });
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewEscalation(item: Escalation, decision: "approved" | "rejected") {
    if (reviewRationale.trim().length < 3) {
      setNotice("Add a review rationale before recording the decision.");
      return;
    }
    if (decision === "approved" && reviewDetail?.resume_supported && !reviewDepartment) {
      setNotice("Choose the approved administrative department before resuming the workflow.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/staff/escalations/${item.id}/review`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          decision,
          rationale: reviewRationale.trim(),
          department_code: decision === "approved" && reviewDetail?.resume_supported ? reviewDepartment : undefined,
        }),
      });
      const body = await response.json().catch(() => ({ detail: "Review failed." }));
      if (!response.ok) throw new Error(body.detail || "Review failed.");
      setNotice(body.resumed
        ? `Routing approved for ${reviewDepartment}. The patient journey resumed with the hospital availability service.`
        : `Case ${item.id} ${decision}. The authorized decision is recorded in the compliance history.`);
      await loadEscalations();
      await loadEscalationDetail(item);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }

  const openAppointment = useCallback(async (workflow: Workflow) => {
    if (!token) return;
    setSelected(workflow);
    setDocumentDetail(null);
    setAppointmentLoading(true);
    setAppointmentMode("overview");
    setCancellationReason("");
    setReplacementSlotId("");
    try {
      const response = await fetch(`${API}/api/appointments/${workflow.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detail = await response.json().catch(() => ({ detail: "Appointment details could not be loaded." }));
      if (!response.ok) throw new Error(detail.detail || "Appointment details could not be loaded.");
      setAppointmentDetail(detail);
      const status = detail.appointment.status === "completed" || detail.appointment.status === "no_show"
        ? detail.appointment.status
        : "scheduled";
      setVisitStatus(status);
      setDoctorNotes(detail.appointment.doctor_notes || "");
      setMedicationsText((detail.appointment.prescribed_medications || []).join("\n"));
      setFollowUpSuggestions(detail.appointment.follow_up_suggestions || "");
      setFollowUpRecommendedAt(detail.appointment.follow_up_recommended_at?.slice(0, 16) || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Appointment details could not be loaded.");
      setAppointmentDetail(null);
    } finally {
      setAppointmentLoading(false);
    }
  }, [token]);

  async function updateAppointment(payload: Record<string, unknown>) {
    if (!appointmentDetail || !token) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/appointments/${appointmentDetail.appointment.workflow_id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({ detail: "Appointment action failed." }));
      if (!response.ok) throw new Error(result.detail || "Appointment action failed.");
      const workflow = workflows.find((item) => item.id === appointmentDetail.appointment.workflow_id) || appointmentDetail.workflow;
      await loadWorkflows();
      await openAppointment(workflow);
      setAppointmentMode("overview");
      setNotice(
        payload.action === "cancel"
          ? "Appointment cancelled. The slot is available again and reminders are stopped."
          : payload.action === "reschedule"
            ? "Appointment rescheduled. The old slot was released and reminders were rebuilt."
            : "Clinician-entered appointment outcome saved with an audit record.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Appointment action failed.");
    } finally {
      setBusy(false);
    }
  }

  const completedSteps = new Set(
    selected?.state.timeline?.filter((item) => item.status === "complete").map((item) => item.step) || [],
  );
  const timelineByStep = new Map(selected?.state.timeline?.map((item) => [item.step, item]) || []);
  const nextVisibleStep: Record<string, string> = {
    registration: "safety_gate",
    safety_gate: "intent_detection",
    intent_detection: "department_routing",
    department_routing: "availability",
    availability: "appointment_booking",
    appointment_booking: "document_coordination",
    document_coordination: "confirmation_and_followup",
  };
  const openCount = escalations.filter((item) => item.status === "open").length;
  const reviewDepartmentInfo = reviewDetail?.departments.find((department) => department.code === reviewDepartment);
  const detailDisplayStatus = appointmentDetail
    ? appointmentDisplayStatus(appointmentDetail.appointment, hospitalClock)
    : null;
  const complianceCases = useMemo(() => {
    const query = caseSearch.trim().toUpperCase();
    if (!query) return workflows;
    const normalizedQuery = query.replace(/\s+/g, "");
    return workflows.filter((item) => {
      const number = caseNumber(item).toUpperCase();
      const compactNumber = number.replace("-", "");
      return number.includes(query) ||
        compactNumber.includes(normalizedQuery.replace("-", "")) ||
        item.request_text.toUpperCase().includes(query);
    });
  }, [caseSearch, workflows]);
  const viewTitle: Record<View, string> = {
    journey: role === "patient" ? "Your care coordination" : "Clinical operations review",
    profile: "Patient profile",
    appointments: "Appointments",
    followup: "Reminders & follow-up",
    documents: "Medical record coordination",
    directory: "Hospital directory",
    audit: role === "patient" ? "My activity history" : "Compliance history",
  };
  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "journey", label: "Care journey", icon: "CJ" },
    ...(role === "patient" ? [{ id: "profile" as View, label: "My profile", icon: "PF" }] : []),
    { id: "appointments", label: "Appointments", icon: "AP" },
    { id: "followup", label: "Reminders & follow-up", icon: "RF" },
    { id: "documents", label: "Medical records", icon: "MR" },
    ...(role === "reviewer" ? [{ id: "directory" as View, label: "Hospital directory", icon: "HD" }] : []),
    { id: "audit", label: role === "patient" ? "My history" : "Compliance history", icon: "CH" },
  ];

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">AC</span>
          <span>
            <b>AgentCare</b>
            <small>Patient services &amp; care operations</small>
          </span>
        </div>

        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => setActiveView(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>

        <div className="rail-clock" aria-label="Hospital time in Indian Standard Time">
          <span>Hospital time</span>
          <b>{formatHospitalClock(hospitalClock)}</b>
          <small>IST · {formatCalendarDay(hospitalClock)}</small>
        </div>

        <div className="boundary-card">
          <span className="eyebrow">Safety boundary</span>
          <b>Administration only</b>
          <p>No diagnosis, prescription, dosage, or medical-result interpretation.</p>
        </div>

        <div className="account">
          <button
            className="profile"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            aria-label={signedOut ? "Open sign in menu" : `Account menu for ${name}`}
          >
            <span className="avatar">{signedOut ? "?" : name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>
            <span><b>{signedOut ? "Signed out" : name}</b><small>{signedOut ? "Choose a workspace" : accountTitle}</small></span>
            <span className="account-chevron" aria-hidden="true">{accountOpen ? "▲" : "▼"}</span>
          </button>
          {accountOpen && (
            <div className="account-menu" role="menu">
              {signedOut ? (
                <>
                  <button role="menuitem" onClick={() => login("patient")}>Continue as Patient</button>
                  <button role="menuitem" onClick={() => login("reviewer")}>Continue as Staff</button>
                </>
              ) : (
                <button role="menuitem" className="logout" onClick={logout}>Log out</button>
              )}
            </div>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <div className="topbar-date-line">
              <span className="eyebrow">{formatCalendarDay(hospitalClock)}</span>
              <span className="topbar-ist-clock" aria-label="Current hospital time in Indian Standard Time">
                <b>IST</b> {formatHospitalClock(hospitalClock)}
              </span>
            </div>
            <h1>{signedOut ? "Welcome to AgentCare" : viewTitle[activeView]}</h1>
          </div>
          <div className="top-actions">
            <span className={`connection ${apiOnline ? "online" : "offline"}`}>
              <i /> {signedOut ? "Session closed" : apiOnline ? "Hospital records connected" : "Service unavailable"}
            </span>
            <label className="account-selector">
              <span>Test identity</span>
              <select
                aria-label="Test account"
                value={currentAccountId}
                disabled={busy}
                onChange={(event) => {
                  const account = demoAccounts.find((item) => item.id === event.target.value);
                  if (account) void login(account);
                }}
              >
                <optgroup label="Patients">
                  {demoAccounts.filter((account) => account.role === "patient").map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Staff and doctors">
                  {demoAccounts.filter((account) => account.role === "reviewer").map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.title}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <div className="role-switch" aria-label="Demo role">
              <button onClick={() => login("patient")} className={!signedOut && role === "patient" ? "selected" : ""}>Patient</button>
              <button onClick={() => login("reviewer")} className={!signedOut && role === "reviewer" ? "selected" : ""}>Staff</button>
            </div>
          </div>
        </header>

        <div className="notice" role="status">
          <span>{apiOnline ? "✓" : "!"}</span>
          {notice}
        </div>
        <div className="public-safety-banner" role="note">
          <b>Demonstration only — not for clinical use.</b>
          <span>Use synthetic data only. Never enter or upload real protected health information (PHI).</span>
        </div>

        {signedOut ? (
          <section className="signin-panel panel">
            <span className="signin-mark">AC</span>
            <span className="eyebrow">Secure session ended</span>
            <h2>You are signed out</h2>
            <p>
              AgentCare coordinates administrative care journeys. It never diagnoses, prescribes,
              recommends dosage, or interprets clinical results.
            </p>
            <div>
              <button className="primary" onClick={() => login("patient")} disabled={busy}>Continue as Patient</button>
              <button className="secondary" onClick={() => login("reviewer")} disabled={busy}>Continue as Staff</button>
            </div>
          </section>
        ) : activeView === "profile" && role === "patient" ? (
          <section className="view-panel panel">
            <div className="section-heading">
              <div><span className="eyebrow">Patient registration</span><h2>My administrative profile</h2></div>
              <span className="safe-chip">Ownership protected</span>
            </div>
            <p className="muted">Update administrative contact preferences used for coordination. Clinical information is not collected here.</p>
            {patientProfile ? (
              <form className="profile-form" onSubmit={savePatientProfile}>
                <label><span>Name</span><input value={patientProfile.name} disabled /></label>
                <label><span>Email</span><input value={patientProfile.email} disabled /></label>
                <label><span>Phone</span><input value={patientProfile.phone} onChange={(event) => setPatientProfile({ ...patientProfile, phone: event.target.value })} maxLength={40} /></label>
                <label>
                  <span>Preferred language</span>
                  <select value={patientProfile.preferred_language} onChange={(event) => setPatientProfile({ ...patientProfile, preferred_language: event.target.value })}>
                    <option value="en">English</option><option value="hi">Hindi</option><option value="mr">Marathi</option>
                  </select>
                </label>
                <label className="wide"><span>Emergency contact</span><input value={patientProfile.emergency_contact} onChange={(event) => setPatientProfile({ ...patientProfile, emergency_contact: event.target.value })} maxLength={160} /></label>
                <div className="profile-form-actions">
                  <small>{patientProfile.updated_at ? `Last updated ${formatDate(patientProfile.updated_at)}` : "No self-service update recorded yet."}</small>
                  <button className="primary compact" disabled={busy}>Save profile</button>
                </div>
              </form>
            ) : <div className="empty-state compact"><span>PF</span><p>Loading your persisted profile…</p></div>}
          </section>
        ) : activeView === "appointments" ? (
          <section className="view-panel panel">
            <div className="section-heading">
              <div><span className="eyebrow">Committed schedule</span><h2>Appointments across coordinated cases</h2></div>
              <span className="safe-chip">Persisted booking records</span>
            </div>
            <p className="muted">Only bookings committed by the workflow are shown here. AgentCare does not provide clinical advice.</p>
            <div className="resource-list">
              {workflows.filter((item) => item.state.appointment).map((item) => {
                const displayStatus = appointmentDisplayStatus(item.state.appointment!, hospitalClock);
                return (
                <article className="resource-card" key={item.id}>
                  <div className="resource-date">
                    <b>{appointmentDatePart(item.state.appointment!.start_time, "day")}</b>
                    <span>{appointmentDatePart(item.state.appointment!.start_time, "month")}</span>
                  </div>
                  <div>
                    <span className="eyebrow">{item.state.routing?.department_name || "Coordinated care"} · {caseNumber(item)}</span>
                    <h3>{item.state.appointment!.doctor}</h3>
                    <p>{formatDate(item.state.appointment!.start_time)} · {item.request_text}</p>
                  </div>
                  <span className={`status ${displayStatus}`}>{prettyStep(displayStatus)}</span>
                  <button className="text-action" onClick={() => void openAppointment(item)}>Open case</button>
                </article>
                );
              })}
              {!workflows.some((item) => item.state.appointment) && <div className="empty-state"><span>AP</span><p>No committed appointments yet.</p></div>}
            </div>
          </section>
        ) : activeView === "followup" ? (
          <section className="view-panel panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Continuity coordination</span>
                <h2>Reminders &amp; follow-up</h2>
              </div>
              <span className="safe-chip">{role === "patient" ? "Your cases only" : "Authorized operational view"}</span>
            </div>
            <p className="muted">
              Administrative reminders are generated only from committed appointments. Clinical follow-up advice is displayed only when entered by an authorized clinician.
            </p>
            <div className="followup-summary">
              <article>
                <span>Active reminders</span>
                <b>{workflows.reduce((total, item) => total + (followUpDetails[item.id]?.reminders || item.state.reminders || []).filter((reminder) => reminder.status !== "cancelled").length, 0)}</b>
                <small>Persisted appointment and follow-up tasks</small>
              </article>
              <article>
                <span>Clinician follow-ups</span>
                <b>{Object.values(followUpDetails).filter((detail) => detail.appointment.follow_up_recommended_at || detail.appointment.follow_up_suggestions).length}</b>
                <small>Clinician-entered recommendations only</small>
              </article>
              <article>
                <span>Cancelled tasks</span>
                <b>{workflows.reduce((total, item) => total + (followUpDetails[item.id]?.reminders || item.state.reminders || []).filter((reminder) => reminder.status === "cancelled").length, 0)}</b>
                <small>Stopped after appointment cancellation</small>
              </article>
            </div>
            <div className="followup-list">
              {workflows.filter((item) => item.state.appointment || item.state.reminders?.length).map((item) => {
                const detail = followUpDetails[item.id];
                const reminders = detail?.reminders || item.state.reminders || [];
                const appointment = detail?.appointment || item.state.appointment;
                return (
                  <article className="followup-card" key={item.id}>
                    <header>
                      <div>
                        <span className="eyebrow">{caseNumber(item)} · {item.state.routing?.department_name || "Care coordination"}</span>
                        <h3>{appointment?.doctor || "Appointment pending"}</h3>
                        <p>{appointment?.start_time ? formatDate(appointment.start_time) : "No committed appointment time"}</p>
                      </div>
                      <span className={`status ${appointment?.status || item.status}`}>{prettyStep(appointment?.status || item.status)}</span>
                    </header>
                    <div className="reminder-task-list">
                      {reminders.map((reminder) => (
                        <div key={reminder.id}>
                          <span className="reminder-icon">{reminder.type === "appointment_24h" ? "24H" : "FU"}</span>
                          <div>
                            <b>{reminder.type === "appointment_24h" ? "Appointment reminder" : "Administrative follow-up task"}</b>
                            <small>{formatDate(reminder.scheduled_at)}</small>
                          </div>
                          <span className={`status ${reminder.status || "scheduled"}`}>{prettyStep(reminder.status || "scheduled")}</span>
                        </div>
                      ))}
                      {!reminders.length && <p className="muted">No reminder is scheduled until the appointment is committed.</p>}
                    </div>
                    <div className="followup-recommendation">
                      <span>Clinician follow-up recommendation</span>
                      <b>{detail?.appointment.follow_up_recommended_at ? formatDate(detail.appointment.follow_up_recommended_at) : "No recommended date recorded"}</b>
                      <p>{detail?.appointment.follow_up_suggestions || "No clinician-authored follow-up instructions are recorded."}</p>
                    </div>
                    <footer>
                      <small>Reminder changes are audit logged and rebuilt after rescheduling.</small>
                      {item.state.appointment ? <button className="text-action" onClick={() => void openAppointment(item)}>Open appointment</button> : null}
                    </footer>
                  </article>
                );
              })}
              {followUpLoading && !Object.keys(followUpDetails).length && <div className="empty-state compact"><span>RF</span><p>Loading persisted reminder details…</p></div>}
              {!followUpLoading && !workflows.some((item) => item.state.appointment || item.state.reminders?.length) && (
                <div className="empty-state"><span>RF</span><p>No committed appointments or follow-up tasks yet.</p></div>
              )}
            </div>
          </section>
        ) : activeView === "directory" && role === "reviewer" ? (
          <section className="view-panel panel">
            <div className="section-heading">
              <div><span className="eyebrow">Authorized hospital operations</span><h2>Departments, doctors &amp; slots</h2></div>
              <span className="safe-chip">Staff only · audit logged</span>
            </div>
            <p className="muted">Manage availability controls for the approved hospital catalog. Booked slots cannot be overwritten or disabled.</p>
            {directoryData ? (
              <>
                <form className="slot-admin-form" onSubmit={createDirectorySlot}>
                  <label><span>Department</span><select value={directoryDepartment} onChange={(event) => { setDirectoryDepartment(event.target.value); setDirectoryDoctor(""); }}>
                    {directoryData.departments.filter((department) => department.active).map((department) => <option key={department.code} value={department.code}>{department.name}</option>)}
                  </select></label>
                  <label><span>Doctor</span><select value={directoryDoctor} onChange={(event) => setDirectoryDoctor(event.target.value)}>
                    {(directoryData.departments.find((department) => department.code === directoryDepartment)?.doctors || []).filter((doctor) => doctor.active).map((doctor) => <option key={doctor.id} value={doctor.name}>{doctor.name}</option>)}
                  </select></label>
                  <label><span>New slot time</span><input type="datetime-local" value={directorySlotTime} onChange={(event) => setDirectorySlotTime(event.target.value)} /></label>
                  <button className="primary compact" disabled={busy || !directoryDoctor || !directorySlotTime}>Create available slot</button>
                </form>
                <div className="directory-grid">
                  {directoryData.departments.map((department) => (
                    <article key={department.code} className={!department.active ? "inactive" : ""}>
                      <header>
                        <div><span className="eyebrow">{department.code}</span><h3>{department.name}</h3></div>
                        <button className="text-action" disabled={busy} onClick={() => void updateDirectoryEntity({ entity_type: "department", department_code: department.code, display_name: department.name, active: !department.active })}>{department.active ? "Deactivate" : "Activate"}</button>
                      </header>
                      <div>
                        {department.doctors.map((doctor) => (
                          <p key={doctor.id}><span>{doctor.name}</span><button disabled={busy || !department.active} onClick={() => void updateDirectoryEntity({ entity_type: "doctor", department_code: department.code, display_name: doctor.name, active: !doctor.active })}>{doctor.active ? "Active" : "Inactive"}</button></p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="managed-slots">
                  <div className="section-heading"><div><span className="eyebrow">Transactional availability</span><h3>Appointment slots</h3></div></div>
                  {directoryData.slots.slice(0, 80).map((slot) => (
                    <article key={slot.id}>
                      <div><b>{slot.doctorName}</b><small>{slot.departmentCode} · {formatDate(slot.startTime)}</small></div>
                      <span className={`status ${slot.status}`}>{prettyStep(slot.status)}</span>
                      <button className="text-action" disabled={busy || slot.status === "booked" || Boolean(slot.bookedWorkflowId)} onClick={() => void updateDirectoryEntity({ slot_id: slot.id, slot_status: slot.status === "available" ? "unavailable" : "available" })}>{slot.status === "available" ? "Disable" : slot.status === "booked" ? "Protected" : "Enable"}</button>
                    </article>
                  ))}
                </div>
              </>
            ) : <div className="empty-state"><span>HD</span><p>Loading the persisted hospital directory…</p></div>}
          </section>
        ) : activeView === "documents" ? (
          <section className="view-panel panel">
            <div className="section-heading">
              <div><span className="eyebrow">Patient medical records</span><h2>Document coordination</h2></div>
              <span className="safe-chip">Securely validated</span>
            </div>
            <p className="muted">Review required, received, missing, duplicate, or quarantined records for each care-coordination case.</p>
            <div className="resource-list">
              {workflows.map((item) => (
                <article className="document-card" key={item.id}>
                  <div>
                    <span className="eyebrow">{item.state.routing?.department_name || "Unrouted case"}</span>
                    <h3>{item.request_text}</h3>
                    <small>{caseNumber(item)} · {formatDate(item.created_at)}</small>
                  </div>
                  <div className="document-metrics">
                    <span><b>{item.state.documents?.expected?.length || 0}</b> required</span>
                    <span><b>{item.state.documents?.received?.length || 0}</b> received</span>
                    <span><b>{item.state.documents?.missing?.length || 0}</b> missing</span>
                  </div>
                  <button className="text-action" onClick={() => void openDocumentCase(item)}>Open record</button>
                </article>
              ))}
              {!workflows.length && <div className="empty-state"><span>DC</span><p>No document cases yet.</p></div>}
            </div>
          </section>
        ) : activeView === "audit" ? (
          <div className="audit-grid">
            <section className="case-picker panel">
              <span className="eyebrow">Compliance scope</span>
              <h2>Select a case</h2>
              <p className="case-scope-note">
                {role === "patient"
                  ? "Only your own requests and activity history are available."
                  : "Authorized staff view across persisted patient-service cases."}
              </p>
              <label className="case-search">
                <span>Find by case number</span>
                <div>
                  <input
                    type="search"
                    value={caseSearch}
                    onChange={(event) => setCaseSearch(event.target.value)}
                    placeholder="Example: AC-12AB34CD"
                    aria-label="Search compliance history by case number"
                  />
                  {caseSearch ? <button type="button" onClick={() => setCaseSearch("")}>Clear</button> : null}
                </div>
              </label>
              <div className="case-list">
                {complianceCases.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "current" : ""}>
                    <span className="case-number">{caseNumber(item)}</span>
                    <b>{item.request_text}</b>
                    <small>{prettyStep(item.status)} · {formatDate(item.created_at)}</small>
                  </button>
                ))}
                {!workflows.length && <p className="muted">No persisted cases yet.</p>}
                {Boolean(workflows.length) && !complianceCases.length && <p className="muted">No case matches that number.</p>}
              </div>
            </section>
            <section className="audit-panel panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Protected case history</span>
                  <h2>{role === "patient" ? "My activity" : "Compliance activity"}</h2>
                  {selected ? <small className="selected-case-number">{caseNumber(selected)}</small> : null}
                </div>
                <span className="safe-chip">
                  {role === "patient" ? "Patient-owned history" : `${auditEvents.length} recorded events`}
                </span>
              </div>
              <p className="muted compliance-explainer">
                {role === "patient"
                  ? "This page shows the timestamped activity for your selected request only. Other patients’ cases and compliance records are not available to your account."
                  : "This is the timestamped, tamper-evident history of who or which authorized service performed an action, what record changed, and whether it succeeded. It supports patient safety, operational review, and regulatory inspection."}
              </p>
              <div className="audit-list">
                {auditEvents.map((event) => (
                  <article key={event.id}>
                    <span className={`audit-outcome ${event.outcome}`}>{event.outcome === "success" ? "OK" : "!"}</span>
                    <div><b>{prettyStep(event.action)}</b><p>{prettyStep(event.entity_type)} · {event.entity_id}</p><small>{formatDate(event.created_at)}</small></div>
                    <code>#{event.id}</code>
                  </article>
                ))}
                {selected && !auditEvents.length && <div className="empty-state"><span>CH</span><p>No compliance activity has been recorded for this case.</p></div>}
                {!selected && <div className="empty-state"><span>CH</span><p>Select a case to review its protected activity history.</p></div>}
              </div>
              {toolEvents.length ? (
                <div className="tool-proof">
                  <div className="section-heading">
                    <div><span className="eyebrow">Connected hospital services</span><h2>Verified service activity</h2></div>
                    <span className="safe-chip">{toolEvents.length} checks</span>
                  </div>
                  <div>
                    {toolEvents.map((event, index) => (
                      <article key={`${event.tool}-${event.created_at || event.at}-${index}`}>
                        <span className="tool-badge">SYS</span>
                        <div><b>{friendlyToolName(event.tool)}</b><p>{friendlyAgentName(event.agent)} · {event.server || "AgentCare Hospital Administration"}</p></div>
                        <code>{prettyStep(event.status)}</code>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : role === "patient" ? (
          <div className="patient-grid">
            <section className="request-panel panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Start a coordinated request</span>
                  <h2>Tell us what you need administratively.</h2>
                </div>
                <span className="safe-chip">Safety checked</span>
              </div>
              <p className="muted">
                Ask to book, reschedule, cancel, route a request, or coordinate documents. A human reviews uncertainty.
              </p>
              <form onSubmit={submitRequest}>
                <label htmlFor="request">Administrative request</label>
                <textarea
                  id="request"
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  rows={5}
                />
                <div className="quick-prompts">
                  {edgeCasePrompts.slice(0, 4).map((item) => (
                    <button type="button" key={item.label} onClick={() => setRequestText(item.request)}>{item.label}</button>
                  ))}
                </div>
                <details className="edge-case-catalog">
                  <summary>Administrative edge-case test catalog</summary>
                  <div>
                    {edgeCasePrompts.map((item) => (
                      <button type="button" key={item.label} onClick={() => setRequestText(item.request)}>
                        <b>{item.label}</b>
                        <span>{item.request}</span>
                      </button>
                    ))}
                  </div>
                </details>
                <button className="primary" disabled={busy || !token}>
                  {busy ? "Coordinating…" : "Start evidence-gated workflow"} <span>→</span>
                </button>
              </form>
            </section>

            <section className="journey-panel panel">
              <div className="section-heading">
                <div><span className="eyebrow">{selected ? `${caseNumber(selected)} · ` : ""}Coordinated patient journey</span><h2>Request progress</h2></div>
                {selected && <span className={`status ${selected.status}`}>{prettyStep(selected.status)}</span>}
              </div>
              {!selected ? (
                <div className="empty-state"><span>⌁</span><p>Your persisted workflow will appear here.</p></div>
              ) : (
                <>
                  <div className="flow-strip">
                    {flow.map((item, index) => {
                      const key = ["safety_gate", "intent_detection", "department_routing", "availability", "appointment_booking", "document_coordination", "confirmation_and_followup"][index];
                      const timelineStatus = timelineByStep.get(key)?.status;
                      const done = completedSteps.has(key);
                      const visualStatus = done
                        ? "done"
                        : timelineStatus === "waiting"
                          ? "waiting"
                          : timelineStatus === "escalated"
                            ? "escalated"
                            : selected.current_step === key || (advancing && nextVisibleStep[selected.current_step] === key)
                              ? "running"
                              : "";
                      return (
                        <div className={`flow-node ${visualStatus}`} key={item}>
                          <span>{done ? "✓" : visualStatus === "waiting" ? "…" : visualStatus === "escalated" ? "!" : index + 1}</span>
                          <small>{item}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="evidence-grid">
                    <article>
                      <span className="eyebrow">Department</span>
                      <b>{selected.state.routing?.department_name || "Human review"}</b>
                      <small>
                        {selected.state.routing?.confidence
                          ? `${Math.round(selected.state.routing.confidence * 100)}% confidence · ${selected.state.routing.evidence?.length || 0} policy citations`
                          : "No autonomous clinical inference"}
                      </small>
                    </article>
                    <article>
                      <span className="eyebrow">Appointment</span>
                      <b>{selected.state.appointment?.doctor || "No booking committed"}</b>
                      <small>{formatDate(selected.state.appointment?.start_time)}</small>
                    </article>
                    <article>
                      <span className="eyebrow">Documents</span>
                      <b>{selected.state.documents?.missing?.length || 0} outstanding</b>
                      <small>{selected.state.documents?.received?.join(", ") || "No files received"}</small>
                    </article>
                    <article>
                      <span className="eyebrow">Follow-up</span>
                      <b>{selected.state.reminders?.length || 0} tasks scheduled</b>
                      <small>Created from committed appointment data</small>
                    </article>
                  </div>
                  {selected.status === "awaiting_input" && selected.state.available_slots?.length ? (
                    <div className="slot-choice">
                      <div><span className="eyebrow">Patient confirmation required</span><h3>Choose an available hospital slot</h3></div>
                      <div className="slot-list">
                        {selected.state.available_slots.map((slot) => (
                          <button key={slot.id} onClick={() => confirmSlot(slot.id)} disabled={busy}>
                            <b>{slot.doctor}</b>
                            <span>{formatDate(slot.start_time)}</span>
                            <small>Confirm this slot</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="agentic-evidence">
                    <article>
                      <span className="eyebrow">Model execution</span>
                      {selected.state.agent_proposals?.length ? (
                        <>
                          <b>{prettyStep(selected.state.agent_proposals.at(-1)!.execution_mode)}</b>
                          <small>{selected.state.agent_proposals.at(-1)!.agent} · {selected.state.agent_proposals.at(-1)!.model}</small>
                        </>
                      ) : (
                        <><b>Checkpoint pending</b><small>No model execution has been claimed.</small></>
                      )}
                    </article>
                    <article>
                      <span className="eyebrow">Hospital service checks</span>
                      <b>{selected.state.tool_traces?.length || 0} verified checks</b>
                      <small>{selected.state.tool_traces?.at(-1)?.tool ? friendlyToolName(selected.state.tool_traces.at(-1)!.tool) : "Waiting for the next coordination step"}</small>
                    </article>
                    <article>
                      <span className="eyebrow">Approved routing guidance</span>
                      <b>{selected.state.routing?.evidence?.length || 0} supporting policies</b>
                      <small>{selected.state.routing?.evidence?.at(0)?.title || "Guidance review has not run yet"}</small>
                    </article>
                  </div>
                  <div className="confirmation">
                    <span>{selected.status === "completed" ? "✓" : advancing || selected.status === "running" ? "…" : "!"}</span>
                    <div><b>Persisted status · {prettyStep(selected.status)}</b><p>{selected.state.message || "Workflow is safely paused."}</p></div>
                  </div>
                  {selected.state.documents?.expected?.length ? (
                    <form className="upload-row" onSubmit={uploadDocument}>
                      <label htmlFor="document">
                        {selected.state.documents.missing?.length
                          ? `Required: ${selected.state.documents.missing.join(", ")}`
                          : "Document requirements satisfied"}
                      </label>
                      <div><input id="document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={!selected.state.documents.missing?.length} /><button disabled={busy || !selected.state.documents.missing?.length}>Validate document</button></div>
                      <label className="synthetic-confirmation">
                        <input name="synthetic" type="checkbox" required disabled={!selected.state.documents.missing?.length} />
                        I confirm this file contains synthetic demonstration data only and no real PHI.
                      </label>
                      {uploadProgress ? (
                        <div className={`upload-progress ${uploadProgress.status}`}>
                          <div><span style={{ width: `${uploadProgress.progress}%` }} /></div>
                          <p><b>{prettyStep(uploadProgress.status)}</b> · {uploadProgress.message}</p>
                        </div>
                      ) : null}
                    </form>
                  ) : null}
                </>
              )}
            </section>

            <section className="history-panel panel">
              <div className="section-heading"><div><span className="eyebrow">Case history</span><h2>Recent requests</h2></div><span>{workflows.length} cases</span></div>
              <div className="history-list">
                {workflows.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "current" : ""}>
                    <span className={`case-icon ${item.status}`}>{item.status === "completed" ? "✓" : "!"}</span>
                    <span><b>{item.request_text}</b><small>{caseNumber(item)} · {formatDate(item.created_at)} · {prettyStep(item.current_step)}</small></span>
                    <span className={`status ${item.status}`}>{prettyStep(item.status)}</span>
                  </button>
                ))}
                {!workflows.length && <p className="muted">No persisted requests yet.</p>}
              </div>
            </section>
          </div>
        ) : (
          <div className="staff-grid">
            <section className="metric-card"><span>Open review</span><b>{openCount}</b><small>Requires authorized decision</small></section>
            <section className="metric-card"><span>Urgent</span><b>{escalations.filter((item) => item.severity === "urgent" && item.status === "open").length}</b><small>Safety-priority cases</small></section>
            <section className="metric-card"><span>Resolved</span><b>{escalations.filter((item) => item.status === "resolved").length}</b><small>Compliance history recorded</small></section>
            <section className="queue panel">
              <div className="section-heading">
                <div><span className="eyebrow">Authorized case review</span><h2>Clinical operations workbench</h2></div>
                <span className="safe-chip">Role-based access active</span>
              </div>
              <p className="muted">Open a case to review the patient request, coordination stage, approved routing guidance, hospital service checks, medical records, and compliance history before deciding.</p>
              <div className="review-workbench">
                <div className="review-list">
                  {escalations.map((item) => (
                    <button
                      key={item.id}
                      className={reviewDetail?.escalation.id === item.id ? "current" : ""}
                      onClick={() => loadEscalationDetail(item)}
                    >
                      <span className={`severity ${item.severity}`}>{item.severity}</span>
                      <span>
                        <b>{prettyStep(item.reason_code)}</b>
                        <small>{item.reason}</small>
                        <em>#{item.id} · {formatDate(item.created_at)}</em>
                      </span>
                      <span className={`status ${item.status}`}>{prettyStep(item.status)}</span>
                      <strong>Open case →</strong>
                    </button>
                  ))}
                  {!escalations.length && <div className="empty-state"><span>✓</span><p>No escalations are waiting.</p></div>}
                </div>

                <div className="review-detail">
                  {!reviewDetail ? (
                    <div className="empty-state review-empty">
                      <span>HR</span>
                      <p>Select a case to open its complete operational review package.</p>
                    </div>
                  ) : (
                    <>
                      <div className="review-title">
                        <div>
                          <span className="eyebrow">{caseNumber(reviewDetail.workflow)} · Review #{reviewDetail.escalation.id} · {prettyStep(reviewDetail.escalation.reason_code)}</span>
                          <h3>{reviewDetail.workflow.request_text}</h3>
                        </div>
                        <span className={`status ${reviewDetail.escalation.status}`}>{prettyStep(reviewDetail.escalation.status)}</span>
                      </div>

                      <div className="review-summary">
                        <article><span>Checkpoint</span><b>{prettyStep(reviewDetail.workflow.current_step)}</b><small>{prettyStep(reviewDetail.workflow.status)}</small></article>
                        <article><span>Suggested route</span><b>{reviewDetail.recommended_department?.name || reviewDetail.workflow.state.routing?.department_name || "No autonomous selection"}</b><small>{Math.round((reviewDetail.workflow.state.routing?.confidence || 0) * 100)}% agent confidence</small></article>
                        <article><span>Policy support</span><b>{reviewDetail.workflow.state.routing?.evidence?.length || 0} policies</b><small>{reviewDetail.workflow.state.tool_traces?.length || 0} hospital service checks</small></article>
                      </div>

                      <section className="review-section">
                        <span className="eyebrow">Why this paused</span>
                        <p>{reviewDetail.escalation.reason}</p>
                        <small>
                          {reviewDetail.resume_supported
                            ? "A department decision is administrative. Approval will resume the workflow at live availability."
                            : "This is a safety-boundary case. Approval records authorized manual handling; autonomous clinical processing remains stopped."}
                        </small>
                      </section>

                      <section className="review-section">
                        <span className="eyebrow">Approved care-routing guidance</span>
                        <div className="evidence-packet">
                          {reviewDetail.workflow.state.routing?.evidence?.map((evidence) => (
                            <article key={evidence.evidence_ref}>
                              <b>{evidence.title || evidence.evidence_ref}</b>
                              <p>{evidence.excerpt || "Approved hospital guidance supports this administrative routing decision."}</p>
                              <small>
                                {prettyStep(evidence.chunk_type || "policy chunk")}
                                {typeof evidence.score === "number" ? ` · ${(evidence.score * 100).toFixed(1)}% relevance` : ""}
                              </small>
                              <code>{evidence.evidence_ref}</code>
                            </article>
                          ))}
                          {!reviewDetail.workflow.state.routing?.evidence?.length && <p className="muted">No approved routing guidance was available; manual confirmation is required.</p>}
                        </div>
                      </section>

                      <section className="review-section">
                        <span className="eyebrow">Care coordination activity</span>
                        <div className="trace-grid">
                          {reviewDetail.workflow.state.agent_proposals?.map((proposal, index) => (
                            <article key={`${proposal.agent}-${index}`}>
                              <b>{friendlyAgentName(proposal.agent)}</b>
                              <p>{prettyStep(proposal.decision)} · {Math.round(proposal.confidence * 100)}% confidence</p>
                              <small>{prettyStep(proposal.execution_mode)} review</small>
                            </article>
                          ))}
                          {reviewDetail.workflow.state.tool_traces?.map((trace, index) => (
                            <article key={`${trace.tool}-${index}`}>
                              <b>{friendlyToolName(trace.tool)}</b>
                              <p>{friendlyAgentName(trace.agent)}</p>
                              <small>{prettyStep(trace.status)} · verified hospital service</small>
                            </article>
                          ))}
                        </div>
                      </section>

                      <section className="review-section">
                        <span className="eyebrow">Medical records and compliance history</span>
                        <div className="review-records">
                          <div>
                            <b>{reviewDetail.documents.length} documents</b>
                            {reviewDetail.documents.map((document) => (
                              <p key={document.id}>{prettyStep(document.document_type)} · {document.original_name} · {prettyStep(document.status)}</p>
                            ))}
                          </div>
                          <div>
                            <b>{reviewDetail.audit.length} recorded activities</b>
                            {reviewDetail.audit.slice(-6).map((event) => (
                              <p key={event.id}>#{event.id} · {prettyStep(event.action)}</p>
                            ))}
                          </div>
                        </div>
                      </section>

                      {reviewDetail.escalation.status === "open" ? (
                        <section className="review-decision">
                          {reviewDetail.resume_supported ? (
                            <label>
                              Approved administrative department ({reviewDetail.departments.length} active)
                              <select value={reviewDepartment} onChange={(event) => setReviewDepartment(event.target.value)}>
                                {reviewDetail.departments.map((department) => (
                                  <option value={department.code} key={department.code}>{department.name}</option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {reviewDetail.resume_supported && reviewDepartmentInfo ? (
                            <div className="department-directory-card">
                              <b>{reviewDepartmentInfo.name}</b>
                              <span>{reviewDepartmentInfo.doctors?.join(" · ")}</span>
                              <small>Approved routing indicators: {reviewDepartmentInfo.symptoms?.join(", ")}</small>
                            </div>
                          ) : null}
                          <label>
                            Reviewer rationale
                            <textarea
                              rows={3}
                              value={reviewRationale}
                              onChange={(event) => setReviewRationale(event.target.value)}
                              placeholder="Explain the evidence and administrative reason for this decision."
                            />
                          </label>
                          <div>
                            <button onClick={() => reviewEscalation(reviewDetail.escalation, "rejected")} disabled={busy}>Reject and close</button>
                            <button className="primary compact" onClick={() => reviewEscalation(reviewDetail.escalation, "approved")} disabled={busy}>
                              {reviewDetail.resume_supported ? "Approve route and resume" : "Approve manual handling"}
                            </button>
                          </div>
                        </section>
                      ) : (
                        <section className="review-section resolved-decision">
                          <span className="eyebrow">Recorded decision</span>
                          <p>{reviewDetail.escalation.resolution || "Resolved decision recorded."}</p>
                        </section>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
      {(documentLoading || documentDetail) && (
        <div
          className="appointment-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) setDocumentDetail(null);
          }}
        >
          <section
            className="appointment-modal document-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-dialog-title"
          >
            {documentLoading && !documentDetail ? (
              <div className="appointment-loading">
                <span>MR</span>
                <h2>Loading the persisted medical-record case…</h2>
              </div>
            ) : documentDetail ? (
              <>
                <header className="appointment-modal-header document-modal-header">
                  <div>
                    <span className="eyebrow">
                      {documentDetail.workflow.state.routing?.department_name || "Care coordination"} · {caseNumber(documentDetail.workflow)}
                    </span>
                    <h2 id="document-dialog-title">Medical record coordination</h2>
                    <p>{documentDetail.workflow.request_text}</p>
                  </div>
                  <div>
                    <span className={`status ${documentDetail.workflow.state.documents?.latest_status || documentDetail.workflow.status}`}>
                      {prettyStep(documentDetail.workflow.state.documents?.latest_status || documentDetail.workflow.status)}
                    </span>
                    <button
                      className="modal-close"
                      aria-label="Close medical record details"
                      onClick={() => setDocumentDetail(null)}
                      disabled={busy}
                    >×</button>
                  </div>
                </header>

                <div className="appointment-status-grid document-status-grid">
                  <article>
                    <span>Required records</span>
                    <b>{documentDetail.workflow.state.documents?.expected?.length || 0}</b>
                    <small>{documentDetail.workflow.state.documents?.expected?.map(prettyStep).join(", ") || "No record requested"}</small>
                  </article>
                  <article>
                    <span>Validated records</span>
                    <b>{documentDetail.workflow.state.documents?.received?.length || 0}</b>
                    <small>{documentDetail.workflow.state.documents?.received?.map(prettyStep).join(", ") || "None received yet"}</small>
                  </article>
                  <article>
                    <span>Still outstanding</span>
                    <b>{documentDetail.workflow.state.documents?.missing?.length || 0}</b>
                    <small>{documentDetail.workflow.state.documents?.missing?.map(prettyStep).join(", ") || "Requirements satisfied"}</small>
                  </article>
                  <article>
                    <span>Case activity</span>
                    <b>{documentDetail.audit.filter((event) => event.entity_type.includes("document") || event.action.startsWith("document.")).length}</b>
                    <small>Timestamped compliance records</small>
                  </article>
                </div>

                <div className="document-detail-body">
                  <section className="document-requirements">
                    <div className="section-heading">
                      <div><span className="eyebrow">Record requirements</span><h3>What is needed for this case</h3></div>
                      <span className="safe-chip">
                        {documentDetail.workflow.state.documents?.missing?.length ? "Action required" : "Requirements satisfied"}
                      </span>
                    </div>
                    <div className="requirement-chips">
                      {documentDetail.workflow.state.documents?.expected?.map((requirement) => {
                        const received = documentDetail.workflow.state.documents?.received?.includes(requirement);
                        return <span className={received ? "received" : "missing"} key={requirement}>{received ? "✓" : "!"} {prettyStep(requirement)}</span>;
                      })}
                      {!documentDetail.workflow.state.documents?.expected?.length && <p className="muted">No specific medical record was requested for this case.</p>}
                    </div>
                    {role === "patient" && Boolean(documentDetail.workflow.state.documents?.missing?.length) && (
                      <form className="document-upload-panel" onSubmit={uploadDocument}>
                        <label htmlFor="document-record-upload">Upload the requested medical record</label>
                        <div>
                          <input id="document-record-upload" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" />
                          <button disabled={busy}>Upload and validate</button>
                        </div>
                        <label className="synthetic-confirmation">
                          <input name="synthetic" type="checkbox" required />
                          I confirm this file contains synthetic demonstration data only and no real PHI.
                        </label>
                        <small>Accepted: PDF, PNG, JPG, or TXT up to 10 MB. Files are checked without clinical interpretation.</small>
                        {uploadProgress && (
                          <div className="upload-progress">
                            <div><span style={{ width: `${uploadProgress.progress}%` }} /></div>
                            <p>{uploadProgress.message}</p>
                          </div>
                        )}
                      </form>
                    )}
                  </section>

                  <div className="document-detail-grid">
                    <section>
                      <span className="eyebrow">Stored medical records</span>
                      <div className="document-file-list">
                        {documentDetail.documents.map((document) => (
                          <article key={document.id}>
                            <div className="document-file-heading">
                              <span className="record-icon">MR</span>
                              <div><b>{prettyStep(document.document_type)}</b><p>{document.original_name}</p></div>
                              <span className={`status ${document.status}`}>{prettyStep(document.status)}</span>
                            </div>
                            <dl>
                              <div><dt>Received</dt><dd>{formatDate(document.created_at)}</dd></div>
                              <div><dt>File</dt><dd>{formatFileSize(document.size_bytes)} · {document.content_type}</dd></div>
                              <div><dt>Patient match</dt><dd>{document.patient_link_confidence == null ? "Recorded for this case" : `${document.patient_link_confidence}% verified`}</dd></div>
                              <div><dt>Integrity</dt><dd>{document.checksum_algorithm.toUpperCase()} · {document.checksum.slice(0, 16)}…</dd></div>
                            </dl>
                            {document.flags.length ? <small className="record-warning">Review flags: {document.flags.map(prettyStep).join(", ")}</small> : <small>Security and duplicate checks passed.</small>}
                          </article>
                        ))}
                        {!documentDetail.documents.length && <p className="muted">No validated medical records are stored for this case yet.</p>}
                      </div>
                    </section>

                    <section>
                      <span className="eyebrow">Validation and compliance</span>
                      <div className="validation-controls">
                        <article><b>File safety screening</b><p>Signature, active-content, and instruction-injection controls.</p></article>
                        <article><b>Record classification</b><p>Administrative type matching only; no diagnosis or result interpretation.</p></article>
                        <article><b>Patient and duplicate check</b><p>Patient mapping plus cryptographic duplicate detection.</p></article>
                        <article><b>Requirement reconciliation</b><p>Confirms the uploaded record matches the hospital requirement.</p></article>
                      </div>
                      <div className="document-activity">
                        <b>Recent compliance activity</b>
                        {documentDetail.audit
                          .filter((event) => event.entity_type.includes("document") || event.entity_type === "upload_session" || event.action.startsWith("document."))
                          .slice(-6)
                          .reverse()
                          .map((event) => (
                            <article key={event.id}>
                              <span className={`audit-outcome ${event.outcome}`}>{event.outcome === "success" ? "✓" : "!"}</span>
                              <div><b>{prettyStep(event.action)}</b><small>{formatDate(event.created_at)} · Record #{event.id}</small></div>
                            </article>
                          ))}
                        {!documentDetail.audit.some((event) => event.entity_type.includes("document") || event.entity_type === "upload_session" || event.action.startsWith("document.")) && (
                          <p className="muted">Document activity will appear here after an upload begins.</p>
                        )}
                      </div>
                    </section>
                  </div>

                  <footer className="document-case-note">
                    <b>Administrative coordination only</b>
                    <span>AgentCare classifies and coordinates medical records but never interprets results, diagnoses a condition, or recommends treatment.</span>
                  </footer>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
      {(appointmentLoading || appointmentDetail) && (
        <div
          className="appointment-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) setAppointmentDetail(null);
          }}
        >
          <section
            className="appointment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-dialog-title"
          >
            {appointmentLoading && !appointmentDetail ? (
              <div className="appointment-loading">
                <span>AP</span>
                <h2>Loading the persisted appointment record…</h2>
              </div>
            ) : appointmentDetail ? (
              <>
                <header className="appointment-modal-header">
                  <div>
                    <span className="eyebrow">{prettyStep(appointmentDetail.appointment.department_code)} · {caseNumber(appointmentDetail.workflow)} · Appointment {appointmentDetail.appointment.id}</span>
                    <h2 id="appointment-dialog-title">{appointmentDetail.appointment.doctor}</h2>
                    <p>{formatDate(appointmentDetail.appointment.start_time)} · {appointmentDetail.appointment.reason}</p>
                  </div>
                  <div>
                    <span className={`status ${detailDisplayStatus}`}>{prettyStep(detailDisplayStatus || appointmentDetail.appointment.status)}</span>
                    <button
                      className="modal-close"
                      aria-label="Close appointment details"
                      onClick={() => setAppointmentDetail(null)}
                      disabled={busy}
                    >×</button>
                  </div>
                </header>

                <div className="appointment-status-grid">
                  <article>
                    <span>Appointment done?</span>
                    <b>{detailDisplayStatus === "completed" ? "Yes · clinician confirmed completed" : detailDisplayStatus === "done" ? "DONE · scheduled time passed" : detailDisplayStatus === "no_show" ? "No · patient did not attend" : detailDisplayStatus === "cancelled" ? "No · cancelled" : "Not yet · scheduled"}</b>
                    <small>{appointmentDetail.appointment.completed_at ? formatDate(appointmentDetail.appointment.completed_at) : detailDisplayStatus === "done" ? "Clinician outcome is still pending; DONE is assigned by the IST clock only." : "Updated from the authoritative appointment record"}</small>
                  </article>
                  <article>
                    <span>Documents</span>
                    <b>{appointmentDetail.documents.length} linked</b>
                    <small>{appointmentDetail.documents.length ? appointmentDetail.documents.map((item) => prettyStep(item.document_type)).join(", ") : "No documents linked to this case"}</small>
                  </article>
                  <article>
                    <span>Reminders</span>
                    <b>{appointmentDetail.reminders.filter((item) => item.status !== "cancelled").length} active</b>
                    <small>{appointmentDetail.appointment.status === "cancelled" ? "Stopped after cancellation" : "Rebuilt whenever the time changes"}</small>
                  </article>
                  <article>
                    <span>Last updated</span>
                    <b>{formatDate(appointmentDetail.appointment.updated_at)}</b>
                    <small>{appointmentDetail.history.length} appointment history events</small>
                  </article>
                </div>

                {appointmentMode === "overview" ? (
                  <div className="appointment-detail-body">
                    <section className="clinical-record">
                      <div className="section-heading">
                        <div><span className="eyebrow">Clinician-entered record</span><h3>Visit outcome and notes</h3></div>
                        <span className="safe-chip">Never generated by AgentCare</span>
                      </div>
                      <div className="clinical-record-grid">
                        <article>
                          <span>Doctor’s notes</span>
                          <p>{appointmentDetail.appointment.doctor_notes || "No clinician notes have been recorded."}</p>
                        </article>
                        <article>
                          <span>Prescribed medicines</span>
                          {appointmentDetail.appointment.prescribed_medications.length ? (
                            <ul>{appointmentDetail.appointment.prescribed_medications.map((medicine) => <li key={medicine}>{medicine}</li>)}</ul>
                          ) : <p>No clinician-entered prescription is attached.</p>}
                        </article>
                        <article>
                          <span>Follow-up suggestion</span>
                          <p>{appointmentDetail.appointment.follow_up_suggestions || "No clinician follow-up suggestion is recorded."}</p>
                          <small>{appointmentDetail.appointment.follow_up_recommended_at ? `Suggested for ${formatDate(appointmentDetail.appointment.follow_up_recommended_at)}` : "Administrative reminders are separate from clinical follow-up advice."}</small>
                        </article>
                      </div>
                    </section>

                    <div className="appointment-lower-grid">
                      <section>
                        <span className="eyebrow">Linked documents</span>
                        <div className="appointment-record-list">
                          {appointmentDetail.documents.map((document) => (
                            <article key={document.id}>
                              <b>{prettyStep(document.document_type)}</b>
                              <p>{document.original_name}</p>
                              <small>{prettyStep(document.status)} · {formatDate(document.created_at)}</small>
                            </article>
                          ))}
                          {!appointmentDetail.documents.length && <p className="muted">No validated files are linked.</p>}
                        </div>
                      </section>
                      <section>
                        <span className="eyebrow">Appointment history</span>
                        <div className="appointment-record-list">
                          {appointmentDetail.history.slice(-6).reverse().map((event) => (
                            <article key={event.id}>
                              <b>{prettyStep(event.action)}</b>
                              <p>{formatDate(event.created_at)}</p>
                              <small>Audit #{event.id} · {prettyStep(event.outcome)}</small>
                            </article>
                          ))}
                          {!appointmentDetail.history.length && <p className="muted">The booking event is the first history item.</p>}
                        </div>
                      </section>
                    </div>

                    <footer className="appointment-actions">
                      <span>Administrative changes use secure hospital scheduling services and are recorded in the compliance history.</span>
                      <div>
                        {appointmentDetail.capabilities.can_cancel && detailDisplayStatus !== "done" && ["confirmed", "rescheduled"].includes(appointmentDetail.appointment.status) && (
                          <button onClick={() => setAppointmentMode("cancel")}>Cancel appointment</button>
                        )}
                        {appointmentDetail.capabilities.can_reschedule && detailDisplayStatus !== "done" && ["confirmed", "rescheduled"].includes(appointmentDetail.appointment.status) && (
                          <button onClick={() => setAppointmentMode("reschedule")}>Reschedule</button>
                        )}
                        {appointmentDetail.capabilities.can_record_clinical_outcome && appointmentDetail.appointment.status !== "cancelled" && (
                          <button className="primary compact" onClick={() => setAppointmentMode("clinical")}>Record clinician outcome</button>
                        )}
                      </div>
                    </footer>
                  </div>
                ) : appointmentMode === "cancel" ? (
                  <section className="appointment-action-panel danger-panel">
                    <span className="eyebrow">Authorized administrative action</span>
                    <h3>Cancel this appointment?</h3>
                    <p>The booked slot will be released to live availability and scheduled reminders will be stopped. The audit history remains.</p>
                    <label>
                      Cancellation reason
                      <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} placeholder="For example: Patient is unavailable." />
                    </label>
                    <div><button onClick={() => setAppointmentMode("overview")}>Keep appointment</button><button className="danger-action" disabled={busy || cancellationReason.trim().length < 3} onClick={() => updateAppointment({ action: "cancel", reason: cancellationReason.trim() })}>Confirm cancellation</button></div>
                  </section>
                ) : appointmentMode === "reschedule" ? (
                  <section className="appointment-action-panel">
                    <span className="eyebrow">Live hospital availability</span>
                    <h3>Choose a replacement slot</h3>
                    <p>The replacement is reserved before the current slot is released. If another patient takes it first, nothing changes.</p>
                    <div className="replacement-slots">
                      {appointmentDetail.alternative_slots.map((slot) => (
                        <button key={slot.id} className={replacementSlotId === slot.id ? "selected" : ""} onClick={() => setReplacementSlotId(slot.id)}>
                          <b>{slot.doctor}</b><span>{formatDate(slot.start_time)}</span><small>{replacementSlotId === slot.id ? "Selected" : "Available now"}</small>
                        </button>
                      ))}
                      {!appointmentDetail.alternative_slots.length && <p className="muted">No alternative slots are currently available. The existing appointment has not changed.</p>}
                    </div>
                    <div><button onClick={() => setAppointmentMode("overview")}>Back</button><button className="primary compact" disabled={busy || !replacementSlotId} onClick={() => updateAppointment({ action: "reschedule", new_slot_id: replacementSlotId })}>Confirm replacement slot</button></div>
                  </section>
                ) : (
                  <section className="appointment-action-panel clinical-entry-panel">
                    <span className="eyebrow">Authorized clinician entry · no agent generation</span>
                    <h3>Record visit outcome</h3>
                    <p>Enter only information documented by the treating clinician. AgentCare stores and displays it but does not diagnose, prescribe, or recommend treatment.</p>
                    <div className="clinical-form-grid">
                      <label>
                        Visit status
                        <select value={visitStatus} onChange={(event) => setVisitStatus(event.target.value as typeof visitStatus)}>
                          <option value="scheduled">Scheduled / not completed</option>
                          <option value="completed">Completed</option>
                          <option value="no_show">Patient did not attend</option>
                        </select>
                      </label>
                      <label>
                        Suggested follow-up date
                        <input type="datetime-local" value={followUpRecommendedAt} onChange={(event) => setFollowUpRecommendedAt(event.target.value)} />
                      </label>
                      <label className="wide">
                        Doctor’s notes
                        <textarea rows={4} value={doctorNotes} onChange={(event) => setDoctorNotes(event.target.value)} placeholder="Clinician-authored visit notes." />
                      </label>
                      <label>
                        Prescribed medicines
                        <textarea rows={4} value={medicationsText} onChange={(event) => setMedicationsText(event.target.value)} placeholder={"One clinician-prescribed medicine per line.\nDo not enter AI suggestions."} />
                      </label>
                      <label>
                        Follow-up suggestions
                        <textarea rows={4} value={followUpSuggestions} onChange={(event) => setFollowUpSuggestions(event.target.value)} placeholder="Clinician-authored follow-up plan." />
                      </label>
                    </div>
                    <div><button onClick={() => setAppointmentMode("overview")}>Discard changes</button><button className="primary compact" disabled={busy} onClick={() => updateAppointment({
                      action: "clinical_update",
                      visit_status: visitStatus,
                      doctor_notes: doctorNotes,
                      prescribed_medications: medicationsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                      follow_up_suggestions: followUpSuggestions,
                      follow_up_recommended_at: followUpRecommendedAt ? new Date(followUpRecommendedAt).toISOString() : null,
                    })}>Save clinician record</button></div>
                  </section>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
