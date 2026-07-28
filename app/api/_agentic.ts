import { env } from "cloudflare:workers";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { appointmentSlots, hospitalCatalogControls } from "../../db/schema";
import { HOSPITAL_DEPARTMENTS, departmentByCode } from "./_hospital_catalog";
import { ragIndexManifest, retrieveRagEvidence } from "./_rag";
import { RAG_CORPUS_VERSION, analyzeApprovedConcepts } from "./_routing_knowledge";

export type TimelineItem = {
  step: string;
  status: "complete" | "running" | "waiting" | "escalated";
  at: string;
  summary: string;
};

export type ToolTrace = {
  id: string;
  agent: string;
  server: string;
  transport: "mcp-json-rpc";
  tool: string;
  status: "success" | "error";
  input: Record<string, unknown>;
  output: unknown;
  at: string;
};

export type AgentProposal = {
  agent: string;
  decision: string;
  confidence: number;
  rationale: string;
  risk_level: "low" | "standard" | "sensitive" | "urgent";
  execution_mode: "fine_tuned_model" | "base_model" | "deterministic_fallback";
  model: string;
};

type McpRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type McpResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
};

function phrasePattern(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

async function retrievePolicies(query: string) {
  return retrieveRagEvidence(query, 5);
}

async function lookupDepartment(requestText: string) {
  const lower = requestText.toLowerCase();
  const retrievedEvidence = await retrieveRagEvidence(requestText, 8);
  const explicitMatches = HOSPITAL_DEPARTMENTS.filter((department) =>
    department.aliases.some((alias) => phrasePattern(alias).test(lower)),
  );
  if (explicitMatches.length === 1) {
    return {
      decision: "route",
      confidence: 0.96,
      department: {
        code: explicitMatches[0].code,
        name: explicitMatches[0].name,
        doctors: explicitMatches[0].doctors,
      },
      reason_code: "EXPLICIT_DEPARTMENT",
      evidence_refs: retrievedEvidence
        .filter((item) => item.department_code === explicitMatches[0].code)
        .map((item) => item.evidence_ref),
    };
  }
  if (explicitMatches.length > 1) {
    return {
      decision: "human_review",
      confidence: 0.42,
      reason_code: "MULTIPLE_EXPLICIT_DEPARTMENTS",
      matches: explicitMatches.map(({ code, name, doctors }) => ({ code, name, doctors })),
    };
  }

  const conceptAnalysis = analyzeApprovedConcepts(requestText);
  if (conceptAnalysis.leading) {
    const department = departmentByCode(conceptAnalysis.leading.departmentCode)!;
    const evidenceRefs = retrievedEvidence
      .filter((item) => item.department_code === department.code && item.chunk_type === "routing")
      .map((item) => item.evidence_ref);
    const conceptResult = {
      confidence: conceptAnalysis.can_route ? 0.9 : 0.7,
      reason_code: conceptAnalysis.can_route
        ? "APPROVED_RAG_CONCEPT_MATCH"
        : "RAG_CONCEPT_REQUIRES_REVIEW",
      normalized_terms: conceptAnalysis.canonical_terms,
      matched_concepts: conceptAnalysis.matches.map((concept) => ({
        id: concept.id,
        label: concept.label,
        department_code: concept.departmentCode,
        autonomy: concept.autonomy,
        matched_terms: concept.matched_terms,
        rationale: concept.rationale,
      })),
      evidence_refs: evidenceRefs,
      clinical_interpretation: false,
    };
    if (conceptAnalysis.can_route && evidenceRefs.length) {
      return {
        decision: "route",
        ...conceptResult,
        department: {
          code: department.code,
          name: department.name,
          doctors: department.doctors,
        },
      };
    }
    return {
      decision: "human_review",
      ...conceptResult,
      recommended_department: {
        code: department.code,
        name: department.name,
        doctors: department.doctors,
      },
      matches: conceptAnalysis.matches.map((concept) => ({
        code: concept.departmentCode,
        name: departmentByCode(concept.departmentCode)?.name || concept.departmentCode,
        matched_signals: [concept.label],
        score: concept.score,
      })),
    };
  }

  const symptomMatches = HOSPITAL_DEPARTMENTS
    .map((department) => {
      const matchedSignals = department.symptoms.filter((symptom) => lower.includes(symptom));
      const tokenScore = (symptom: string) => symptom.split(/\s+/).filter((token) =>
        token.length >= 3 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|ful|ing|ed)?\\b`, "i").test(lower),
      ).length;
      const tokenSignals = department.symptoms.filter((symptom) => tokenScore(symptom) > 0);
      const signals = [...new Set([...matchedSignals, ...tokenSignals])];
      const matchedTokens = new Set(
        department.symptoms
          .flatMap((symptom) => symptom.split(/\s+/))
          .filter((token) =>
            token.length >= 3 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|ful|ing|ed)?\\b`, "i").test(lower),
          ),
      );
      const score = matchedSignals.length * 2 + matchedTokens.size;
      return { department, score, signals };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || HOSPITAL_DEPARTMENTS.indexOf(a.department) - HOSPITAL_DEPARTMENTS.indexOf(b.department));

  if (symptomMatches.length) {
    const leading = symptomMatches[0];
    return {
      decision: "human_review",
      confidence: Math.min(0.72, 0.5 + leading.score * 0.04),
      reason_code: "SYMPTOM_ONLY_ROUTING_SIGNAL",
      recommended_department: {
        code: leading.department.code,
        name: leading.department.name,
        doctors: leading.department.doctors,
      },
      matches: symptomMatches.slice(0, 5).map(({ department, score, signals }) => ({
        code: department.code,
        name: department.name,
        doctors: department.doctors,
        score,
        matched_signals: signals,
      })),
      evidence_refs: retrievedEvidence.map((item) => item.evidence_ref),
    };
  }

  return {
    decision: "human_review",
    confidence: 0.2,
    reason_code: "NO_DEPARTMENT_EVIDENCE",
    matches: ["general-medicine", "family-medicine"].map((code) => {
      const department = departmentByCode(code)!;
      return { code: department.code, name: department.name, doctors: department.doctors };
    }),
  };
}

function documentRequirements(requestText: string, departmentCode: string) {
  const lower = requestText.toLowerCase();
  const expected: string[] = [];
  const evidenceRefs: string[] = [];
  if (/\becg\b|\bekg\b/.test(lower)) {
    expected.push("ECG");
    evidenceRefs.push("policy:document-ecg:2026-07");
  }
  if (/\bmri\b|\bmagnetic resonance\b/.test(lower)) {
    expected.push("MRI_REPORT");
    evidenceRefs.push("policy:document-mri:2026-07");
  }
  if (lower.includes("blood") || lower.includes("lab")) expected.push("LAB_REPORT");
  if (lower.includes("referral")) expected.push("REFERRAL");
  return {
    department_code: departmentCode,
    expected: [...new Set(expected)],
    rule_version: `document-requirements-${RAG_CORPUS_VERSION}`,
    evidence_refs: evidenceRefs,
    clinical_interpretation: false,
  };
}

export function activeDepartments() {
  return HOSPITAL_DEPARTMENTS.map(({ code, name, symptoms, doctors }) => ({ code, name, symptoms, doctors }));
}

async function availableSlots(departmentCode: string) {
  const department = departmentByCode(departmentCode);
  if (!department) return [];
  const db = getDb();
  const controls = await db.select().from(hospitalCatalogControls);
  const departmentControl = controls.find((item) => item.id === `department:${department.code}`);
  if (departmentControl?.active === false) return [];
  const activeDoctors = new Set(department.doctors.filter((doctor) => {
    const control = controls.find((item) => item.id === `doctor:${department.code}:${doctor}`);
    return control?.active !== false;
  }));
  if (!activeDoctors.size) return [];
  const departmentIndex = HOSPITAL_DEPARTMENTS.findIndex((item) => item.code === departmentCode);
  const now = new Date();
  const seedRows = department.doctors.filter((doctor) => activeDoctors.has(doctor)).flatMap((doctor, doctorIndex) =>
    [0, 1, 2, 3].map((cycle) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8 + doctorIndex * 2, doctorIndex === 1 ? 30 : 0));
      start.setUTCDate(start.getUTCDate() + 2 + cycle * 4 + ((departmentIndex + doctorIndex) % 3));
      const startTime = start.toISOString();
      const doctorKey = doctor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        id: `${department.code}-${doctorKey}-${startTime.slice(0, 16).replace(/[^0-9]/g, "")}`,
        departmentCode: department.code,
        doctorName: doctor,
        startTime,
        status: "available",
        updatedAt: new Date().toISOString(),
      };
    }),
  );
  await db.insert(appointmentSlots).values(seedRows).onConflictDoNothing();
  const rows = await db
    .select()
    .from(appointmentSlots)
    .where(and(
      eq(appointmentSlots.departmentCode, department.code),
      eq(appointmentSlots.status, "available"),
      gt(appointmentSlots.startTime, now.toISOString()),
    ))
    .orderBy(asc(appointmentSlots.startTime))
    .limit(9);
  return rows.filter((slot) => activeDoctors.has(slot.doctorName)).map((slot) => ({
    id: slot.id,
    doctor: slot.doctorName,
    start_time: slot.startTime,
    department_code: slot.departmentCode,
  }));
}

async function reserveAppointmentSlot(slotId: string, workflowId: string) {
  const db = getDb();
  const [reserved] = await db
    .update(appointmentSlots)
    .set({
      status: "booked",
      bookedWorkflowId: workflowId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(appointmentSlots.id, slotId), eq(appointmentSlots.status, "available")))
    .returning();
  if (!reserved) return { reserved: false, reason_code: "SLOT_NO_LONGER_AVAILABLE" };
  return {
    reserved: true,
    slot: {
      id: reserved.id,
      doctor: reserved.doctorName,
      start_time: reserved.startTime,
      department_code: reserved.departmentCode,
    },
  };
}

async function releaseAppointmentSlot(slotId: string, workflowId: string) {
  const db = getDb();
  const [released] = await db
    .update(appointmentSlots)
    .set({
      status: "available",
      bookedWorkflowId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(appointmentSlots.id, slotId),
      eq(appointmentSlots.status, "booked"),
      eq(appointmentSlots.bookedWorkflowId, workflowId),
    ))
    .returning();
  return released
    ? { released: true, slot_id: released.id }
    : { released: false, reason_code: "BOOKED_SLOT_NOT_FOUND" };
}

async function rescheduleAppointmentSlot(currentSlotId: string, newSlotId: string, workflowId: string) {
  if (currentSlotId === newSlotId) {
    return { rescheduled: false, reason_code: "SAME_SLOT_SELECTED" };
  }
  const reservation = await reserveAppointmentSlot(newSlotId, workflowId);
  if (!reservation.reserved) {
    return { rescheduled: false, reason_code: reservation.reason_code };
  }
  const release = await releaseAppointmentSlot(currentSlotId, workflowId);
  if (!release.released) {
    await releaseAppointmentSlot(newSlotId, workflowId);
    return { rescheduled: false, reason_code: "CURRENT_SLOT_RELEASE_FAILED" };
  }
  return {
    rescheduled: true,
    previous_slot_id: currentSlotId,
    slot: reservation.slot,
  };
}

export async function dispatchMcpRequest(request: McpRequest): Promise<McpResponse> {
  const base = { jsonrpc: "2.0" as const, id: request.id };
  if (request.method === "initialize") {
    return {
      ...base,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "AgentCare Hospital Administration", version: "1.0.0" },
      },
    };
  }
  if (request.method === "tools/list") {
    return {
      ...base,
      result: {
        tools: [
          { name: "retrieve_approved_policy", description: "Parse, embed, and retrieve active versioned hospital administrative RAG chunks with evidence references.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
          { name: "lookup_departments", description: "Resolve an explicit administrative department without inferring a diagnosis.", inputSchema: { type: "object", properties: { request_text: { type: "string" } }, required: ["request_text"] } },
          { name: "inspect_rag_index", description: "Return the active RAG corpus, parsing, chunking, and embedding manifest.", inputSchema: { type: "object", properties: {} } },
          { name: "find_available_slots", description: "Return currently unbooked transactional slots for an approved department and its active doctors.", inputSchema: { type: "object", properties: { department_code: { type: "string" } }, required: ["department_code"] } },
          { name: "book_appointment_slot", description: "Atomically reserve one currently available doctor slot for a workflow.", inputSchema: { type: "object", properties: { slot_id: { type: "string" }, workflow_id: { type: "string" } }, required: ["slot_id", "workflow_id"] } },
          { name: "cancel_appointment_slot", description: "Release the exact slot owned by a workflow after an authorized cancellation.", inputSchema: { type: "object", properties: { slot_id: { type: "string" }, workflow_id: { type: "string" } }, required: ["slot_id", "workflow_id"] } },
          { name: "reschedule_appointment_slot", description: "Reserve a replacement slot and release the workflow's current slot with conflict recovery.", inputSchema: { type: "object", properties: { current_slot_id: { type: "string" }, new_slot_id: { type: "string" }, workflow_id: { type: "string" } }, required: ["current_slot_id", "new_slot_id", "workflow_id"] } },
          { name: "check_document_requirements", description: "Return versioned administrative document requirements without interpreting clinical content.", inputSchema: { type: "object", properties: { request_text: { type: "string" }, department_code: { type: "string" } }, required: ["request_text", "department_code"] } },
        ],
      },
    };
  }
  if (request.method !== "tools/call") return { ...base, error: { code: -32601, message: "Method not found" } };
  const params = request.params || {};
  const name = String(params.name || "");
  const args = (params.arguments || {}) as Record<string, unknown>;
  if (name === "retrieve_approved_policy") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await retrievePolicies(String(args.query || ""))) }] } };
  if (name === "lookup_departments") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await lookupDepartment(String(args.request_text || ""))) }] } };
  if (name === "inspect_rag_index") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(ragIndexManifest()) }] } };
  if (name === "find_available_slots") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await availableSlots(String(args.department_code || ""))) }] } };
  if (name === "book_appointment_slot") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await reserveAppointmentSlot(String(args.slot_id || ""), String(args.workflow_id || ""))) }] } };
  if (name === "cancel_appointment_slot") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await releaseAppointmentSlot(String(args.slot_id || ""), String(args.workflow_id || ""))) }] } };
  if (name === "reschedule_appointment_slot") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(await rescheduleAppointmentSlot(String(args.current_slot_id || ""), String(args.new_slot_id || ""), String(args.workflow_id || ""))) }] } };
  if (name === "check_document_requirements") return { ...base, result: { content: [{ type: "text", text: JSON.stringify(documentRequirements(String(args.request_text || ""), String(args.department_code || ""))) }] } };
  return { ...base, error: { code: -32602, message: `Unknown tool: ${name}` } };
}

function extractMcpPayload(response: McpResponse) {
  if (response.error) throw new Error(response.error.message);
  const result = response.result as { content?: { type: string; text: string }[] };
  const text = result?.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

export async function callMcpTool(
  agent: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<{ output: unknown; trace: ToolTrace }> {
  const request: McpRequest = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: { name: tool, arguments: input },
  };
  const at = new Date().toISOString();
  try {
    const output = extractMcpPayload(await dispatchMcpRequest(request));
    return {
      output,
      trace: {
        id: String(request.id),
        agent,
        server: "AgentCare Hospital Administration",
        transport: "mcp-json-rpc",
        tool,
        status: "success",
        input,
        output,
        at,
      },
    };
  } catch (error) {
    const output = { error: error instanceof Error ? error.message : "MCP tool failed" };
    return {
      output,
      trace: {
        id: String(request.id),
        agent,
        server: "AgentCare Hospital Administration",
        transport: "mcp-json-rpc",
        tool,
        status: "error",
        input,
        output,
        at,
      },
    };
  }
}

function deterministicProposal(agent: string, requestText: string): AgentProposal {
  const lower = requestText.toLowerCase();
  const urgent = ["chest pain", "can't breathe", "cannot breathe", "severe bleeding", "unconscious", "suicidal", "stroke"].some((term) => lower.includes(term));
  const prohibited = ["diagnose me", "what disease", "prescribe", "what dosage", "change my dose", "which medicine"].some((term) => lower.includes(term));
  const intent = lower.includes("cancel") ? "cancel" : lower.includes("reschedul") ? "reschedule" : "book";
  return {
    agent,
    decision: urgent ? "emergency_escalation" : prohibited ? "clinical_boundary_escalation" : intent,
    confidence: urgent || prohibited ? 0.99 : 0.94,
    rationale: urgent || prohibited
      ? "Deterministic safety policy matched language outside autonomous administration."
      : "Administrative intent classified without making a clinical inference.",
    risk_level: urgent ? "urgent" : prohibited ? "sensitive" : "standard",
    execution_mode: "deterministic_fallback",
    model: "policy-rules-v1",
  };
}

function runtimeSettings() {
  const runtime = env as unknown as Record<string, string | undefined>;
  return {
    apiKey: runtime.OPENAI_API_KEY,
    baseModel: runtime.OPENAI_AGENT_MODEL || "gpt-5.6-terra",
    fineTunedModel: runtime.OPENAI_FINE_TUNED_MODEL,
  };
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as { content?: { type?: string; text?: string }[] }[]) {
    const content = item.content?.find((entry) => entry.type === "output_text" && entry.text);
    if (content?.text) return content.text;
  }
  return "";
}

export async function proposeAdministrativeDecision(agent: string, requestText: string): Promise<AgentProposal> {
  const settings = runtimeSettings();
  if (!settings.apiKey) return deterministicProposal(agent, requestText);
  const model = settings.fineTunedModel || settings.baseModel;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        input: [
          {
            role: "system",
            content: "You are an administrative healthcare routing classifier. Never diagnose, prescribe, recommend dosage, or interpret clinical results. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({
              agent,
              request: requestText,
              allowed_decisions: ["book", "reschedule", "cancel", "clinical_boundary_escalation", "emergency_escalation"],
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agentcare_administrative_decision",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                decision: { type: "string" },
                confidence: { type: "number" },
                rationale: { type: "string" },
                risk_level: { type: "string", enum: ["low", "standard", "sensitive", "urgent"] },
              },
              required: ["decision", "confidence", "rationale", "risk_level"],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const parsed = JSON.parse(responseText(payload)) as Omit<AgentProposal, "agent" | "execution_mode" | "model">;
    return {
      agent,
      ...parsed,
      execution_mode: settings.fineTunedModel ? "fine_tuned_model" : "base_model",
      model,
    };
  } catch {
    return deterministicProposal(agent, requestText);
  }
}

export function appendTimeline(
  state: Record<string, unknown>,
  item: Omit<TimelineItem, "at">,
) {
  const timeline = [...((state.timeline as TimelineItem[] | undefined) || [])];
  const existingIndex = timeline.findIndex((entry) => entry.step === item.step);
  const next = { ...item, at: new Date().toISOString() };
  if (existingIndex >= 0) timeline[existingIndex] = next;
  else timeline.push(next);
  return { ...state, timeline };
}

export function appendToolTraces(state: Record<string, unknown>, traces: ToolTrace[]) {
  return {
    ...state,
    tool_traces: [...((state.tool_traces as ToolTrace[] | undefined) || []), ...traces],
  };
}
