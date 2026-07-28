import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appointments, escalations, workflows } from "../../../../../db/schema";
import {
  appendTimeline,
  appendToolTraces,
  callMcpTool,
  proposeAdministrativeDecision,
  type AgentProposal,
  type ToolTrace,
} from "../../../_agentic";
import { identityFromRequest, unauthorized, workflowView, writeAudit } from "../../../_lib";
import { cardiovascularSafetySignal } from "../../../_routing_knowledge";

const EMERGENCY_TERMS = ["chest pain", "can't breathe", "cannot breathe", "severe bleeding", "unconscious", "suicidal", "stroke"];
const CLINICAL_TERMS = ["diagnose me", "what disease", "prescribe", "what dosage", "change my dose", "which medicine"];

function proposals(state: Record<string, unknown>, proposal: AgentProposal) {
  return [...((state.agent_proposals as AgentProposal[] | undefined) || []), proposal];
}

async function auditCheckpoint(
  workflowId: string,
  step: string,
  status: string,
  metadata: Record<string, unknown> = {},
) {
  await writeAudit({
    workflowId,
    role: "patient",
    action: "workflow.checkpoint",
    entityType: "workflow",
    entityId: workflowId,
    metadata: { step, status, ...metadata },
  });
}

async function auditTools(workflowId: string, traces: ToolTrace[]) {
  for (const trace of traces) {
    await writeAudit({
      workflowId,
      role: "patient",
      action: "mcp.tool.called",
      entityType: "tool_invocation",
      entityId: trace.id,
      metadata: {
        agent: trace.agent,
        server: trace.server,
        transport: trace.transport,
        tool: trace.tool,
        status: trace.status,
      },
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient") return Response.json({ detail: "Patient role required" }, { status: 403 });
  const role = identity.role;

  const { workflowId } = await context.params;
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow || workflow.patientId !== identity.patientId) return Response.json({ detail: "Workflow not found" }, { status: 404 });
  if (workflow.status !== "running") return Response.json(workflowView(workflow));

  let state = JSON.parse(workflow.stateJson) as Record<string, unknown>;
  const lower = workflow.requestText.toLowerCase();
  const now = new Date().toISOString();
  let nextStatus = workflow.status;
  let nextStep = workflow.currentStep;
  let intent = workflow.intent;

  if (workflow.currentStep === "registration") {
    const proposal = await proposeAdministrativeDecision("Safety Agent", workflow.requestText);
    const cardiovascularSignal = cardiovascularSafetySignal(workflow.requestText);
    const emergency = cardiovascularSignal || EMERGENCY_TERMS.some((term) => lower.includes(term));
    const clinical = CLINICAL_TERMS.some((term) => lower.includes(term));
    state = { ...state, agent_proposals: proposals(state, proposal) };
    await writeAudit({
      workflowId,
      role,
      action: "agent.proposal.created",
      entityType: "agent_decision",
      entityId: crypto.randomUUID(),
      metadata: { agent: proposal.agent, model: proposal.model, execution_mode: proposal.execution_mode, decision: proposal.decision },
    });
    if (emergency || clinical) {
      const reasonCode = cardiovascularSignal ? "CARDIOVASCULAR_SAFETY_LANGUAGE" : emergency ? "EMERGENCY_LANGUAGE" : "CLINICAL_REQUEST_BLOCKED";
      await db.insert(escalations).values({
        workflowRunId: workflowId,
        reasonCode,
        reason: "Request requires human attention and is outside autonomous administration.",
        severity: emergency ? "urgent" : "high",
      });
      state = appendTimeline(
        {
          ...state,
          safety: {
            decision: "escalate",
            reason_code: reasonCode,
            proposal,
            ...(cardiovascularSignal
              ? { recommended_department: { code: "cardiology", name: "Cardiology" }, clinical_triage_required: true }
              : {}),
          },
          message: emergency
            ? "This request requires immediate human attention. Contact local emergency services if there may be an emergency."
            : "This clinical request is outside autonomous administration and has been sent for human review.",
        },
        { step: "safety_gate", status: "escalated", summary: "Deterministic safety policy stopped autonomous processing." },
      );
      nextStatus = "human_review";
      nextStep = "safety_gate";
      await auditCheckpoint(workflowId, nextStep, "escalated", { reason_code: reasonCode });
    } else {
      state = appendTimeline(
        {
          ...state,
          safety: { decision: "allow_administrative", confidence: 0.99, proposal },
          message: "Safety boundary passed. Intent Agent is classifying the administrative request.",
        },
        { step: "safety_gate", status: "complete", summary: "Administrative-only request allowed to continue." },
      );
      nextStep = "safety_gate";
      await auditCheckpoint(workflowId, nextStep, "complete", { execution_mode: proposal.execution_mode, model: proposal.model });
    }
  } else if (workflow.currentStep === "safety_gate") {
    const proposal = await proposeAdministrativeDecision("Intent Agent", workflow.requestText);
    intent = lower.includes("cancel") ? "cancel" : lower.includes("reschedul") ? "reschedule" : "book";
    state = appendTimeline(
      {
        ...state,
        agent_proposals: proposals(state, proposal),
        intent,
        message: "Intent classified. Routing Agent is retrieving approved policy evidence.",
      },
      { step: "intent_detection", status: "complete", summary: `Administrative intent classified as ${intent}.` },
    );
    nextStep = "intent_detection";
    await writeAudit({
      workflowId,
      role,
      action: "agent.proposal.created",
      entityType: "agent_decision",
      entityId: crypto.randomUUID(),
      metadata: { agent: proposal.agent, model: proposal.model, execution_mode: proposal.execution_mode, decision: proposal.decision },
    });
    await auditCheckpoint(workflowId, nextStep, "complete", { intent });
  } else if (workflow.currentStep === "intent_detection") {
    const policyCall = await callMcpTool("Routing Agent", "retrieve_approved_policy", { query: workflow.requestText });
    const departmentCall = await callMcpTool("Routing Agent", "lookup_departments", { request_text: workflow.requestText });
    const evidence = policyCall.output as { evidence_ref: string }[];
    const routing = departmentCall.output as {
      decision: string;
      confidence: number;
      department?: { code: string; name: string };
      recommended_department?: { code: string; name: string };
      matches?: { code: string; name: string }[];
    };
    const traces = [policyCall.trace, departmentCall.trace];
    state = appendToolTraces(state, traces);
    await auditTools(workflowId, traces);
    if (routing.decision !== "route" || !routing.department || routing.confidence < 0.75) {
      await db.insert(escalations).values({
        workflowRunId: workflowId,
        reasonCode: "AMBIGUOUS_DEPARTMENT",
        reason: routing.recommended_department
          ? `${routing.recommended_department.name} is the leading administrative destination, but symptom-only routing requires staff confirmation.`
          : "No single administrative department could be selected safely.",
        severity: "medium",
      });
      state = appendTimeline(
        {
          ...state,
          routing: { ...routing, evidence },
          message: routing.recommended_department
            ? `${routing.recommended_department.name} is suggested by approved routing evidence. A staff coordinator must confirm the destination before MCP availability is queried.`
            : "Routing confidence is below the autonomy threshold. A staff coordinator must choose the department.",
        },
        { step: "department_routing", status: "escalated", summary: "Routing paused for authorized human review." },
      );
      nextStatus = "human_review";
      nextStep = "department_routing";
      await auditCheckpoint(workflowId, nextStep, "escalated", { confidence: routing.confidence });
    } else {
      state = appendTimeline(
        {
          ...state,
          routing: { ...routing, department_code: routing.department.code, department_name: routing.department.name, evidence },
          message: `${routing.department.name} was selected from approved evidence. Appointment Agent is querying availability through MCP.`,
        },
        { step: "department_routing", status: "complete", summary: `${routing.department.name} selected with ${Math.round(routing.confidence * 100)}% confidence.` },
      );
      nextStep = "department_routing";
      await auditCheckpoint(workflowId, nextStep, "complete", { department: routing.department.code, confidence: routing.confidence, evidence_refs: evidence.map((item) => item.evidence_ref) });
    }
  } else if (workflow.currentStep === "department_routing") {
    const routing = state.routing as { department_code?: string };
    if (intent === "cancel" || intent === "reschedule") {
      const existingAppointments = await db
        .select()
        .from(appointments)
        .where(and(
          eq(appointments.patientId, workflow.patientId),
          eq(appointments.departmentCode, routing.department_code || ""),
          inArray(appointments.status, ["confirmed", "rescheduled"]),
          gt(appointments.startTime, now),
        ))
        .orderBy(asc(appointments.startTime))
        .limit(5);
      if (!existingAppointments.length) {
        state = appendTimeline(
          {
            ...state,
            appointment_candidates: [],
            message: `No active ${routing.department_code || "matching"} appointment was found. Open Appointments to review your current bookings or start a new booking request.`,
          },
          { step: "appointment_selection", status: "waiting", summary: "No matching active appointment was found." },
        );
        nextStatus = "awaiting_input";
        nextStep = "appointment_selection";
        await auditCheckpoint(workflowId, nextStep, "waiting", { intent, candidate_count: 0 });
      } else if (existingAppointments.length > 1) {
        state = appendTimeline(
          {
            ...state,
            appointment_candidates: existingAppointments.map((item) => ({
              id: item.id,
              workflow_id: item.workflowRunId,
              doctor: item.doctorName,
              start_time: item.startTime,
              status: item.status,
            })),
            message: `Select which appointment you want to ${intent}. AgentCare will not guess between multiple active bookings.`,
          },
          { step: "appointment_selection", status: "waiting", summary: `${existingAppointments.length} active appointments require patient selection.` },
        );
        nextStatus = "awaiting_input";
        nextStep = "appointment_selection";
        await auditCheckpoint(workflowId, nextStep, "waiting", { intent, candidate_count: existingAppointments.length });
      } else {
        const target = existingAppointments[0];
        state = {
          ...state,
          target_appointment: {
            id: target.id,
            workflow_id: target.workflowRunId,
            doctor: target.doctorName,
            start_time: target.startTime,
            slot_id: target.slotId,
            department_code: target.departmentCode,
          },
        };
        if (intent === "cancel") {
          const cancelCall = await callMcpTool("Appointment Agent", "cancel_appointment_slot", {
            slot_id: target.slotId,
            workflow_id: target.workflowRunId,
            appointment_id: target.id,
            requested_by_workflow_id: workflowId,
          });
          const cancelResult = cancelCall.output as { released?: boolean; reason_code?: string };
          state = appendToolTraces(state, [cancelCall.trace]);
          await auditTools(workflowId, [cancelCall.trace]);
          if (!cancelResult.released) {
            state = appendTimeline(
              { ...state, message: "The matching appointment changed before cancellation could commit. Open Appointments to review its current status." },
              { step: "appointment_cancellation", status: "waiting", summary: "Cancellation did not commit because the slot state changed." },
            );
            nextStatus = "awaiting_input";
            nextStep = "appointment_selection";
          } else {
            const cancelledAt = new Date().toISOString();
            await db.update(appointments).set({
              status: "cancelled",
              cancellationReason: "Cancelled from the patient's explicit administrative request.",
              cancelledAt,
              updatedAt: cancelledAt,
            }).where(eq(appointments.id, target.id));
            const [targetWorkflow] = await db.select().from(workflows).where(eq(workflows.id, target.workflowRunId)).limit(1);
            if (targetWorkflow) {
              const targetState = JSON.parse(targetWorkflow.stateJson) as Record<string, unknown> & {
                appointment?: Record<string, unknown>;
                reminders?: Record<string, unknown>[];
              };
              const updatedTargetState = appendTimeline({
                ...targetState,
                appointment: { ...targetState.appointment, status: "cancelled", cancelled_at: cancelledAt },
                reminders: (targetState.reminders || []).map((item) => ({ ...item, status: "cancelled" })),
                message: "The appointment was cancelled through an explicit patient request; its slot was released and reminders were stopped.",
              }, { step: "appointment_cancellation", status: "complete", summary: "Explicit patient cancellation committed through MCP." });
              await db.update(workflows).set({ stateJson: JSON.stringify(updatedTargetState), updatedAt: cancelledAt }).where(eq(workflows.id, targetWorkflow.id));
            }
            state = appendTimeline(
              { ...state, message: `Your appointment with ${target.doctorName} on ${new Date(target.startTime).toLocaleString()} was cancelled. The slot is available again.` },
              { step: "appointment_cancellation", status: "complete", summary: "Matching appointment cancelled from the explicit patient request." },
            );
            nextStatus = "completed";
            nextStep = "completed";
            await writeAudit({
              workflowId: target.workflowRunId,
              role,
              action: "appointment.cancelled",
              entityType: "appointment",
              entityId: target.id,
              metadata: { requested_by_workflow_id: workflowId, slot_id: target.slotId, mcp_tool: cancelCall.trace.tool },
            });
            await auditCheckpoint(workflowId, "appointment_cancellation", "complete", { appointment_id: target.id });
          }
        } else {
          const slotCall = await callMcpTool("Appointment Agent", "find_available_slots", {
            department_code: target.departmentCode,
            purpose: "reschedule",
            appointment_id: target.id,
          });
          const slots = slotCall.output as { id: string; doctor: string; start_time: string; department_code: string }[];
          state = appendToolTraces(state, [slotCall.trace]);
          await auditTools(workflowId, [slotCall.trace]);
          state = appendTimeline(
            {
              ...state,
              available_slots: slots,
              message: slots.length
                ? "Choose a replacement slot. The current booking stays active until the replacement commits."
                : "No replacement slot is available. The current appointment has not changed.",
            },
            { step: "availability", status: "waiting", summary: `${slots.length} replacement slots returned through MCP.` },
          );
          nextStatus = "awaiting_input";
          nextStep = "availability";
          await auditCheckpoint(workflowId, nextStep, "waiting", { intent, appointment_id: target.id, slot_count: slots.length });
        }
      }
    } else {
    const slotCall = await callMcpTool("Appointment Agent", "find_available_slots", { department_code: routing.department_code || "" });
    const slots = slotCall.output as { id: string; doctor: string; start_time: string; department_code: string }[];
    state = appendToolTraces(state, [slotCall.trace]);
    await auditTools(workflowId, [slotCall.trace]);
    if (!slots.length) {
      await db.insert(escalations).values({
        workflowRunId: workflowId,
        reasonCode: "NO_SLOTS_AVAILABLE",
        reason: "No active slots are available.",
        severity: "low",
      });
      state = appendTimeline(
        { ...state, available_slots: [], message: "No slots were returned. Staff will coordinate availability." },
        { step: "availability", status: "escalated", summary: "No valid slot was available." },
      );
      nextStatus = "human_review";
    } else {
      state = appendTimeline(
        {
          ...state,
          available_slots: slots,
          message: "Choose a returned appointment slot. AgentCare will not book until you confirm.",
        },
        { step: "availability", status: "waiting", summary: `${slots.length} MCP-sourced slots are awaiting patient selection.` },
      );
      nextStatus = "awaiting_input";
    }
    nextStep = "availability";
    await auditCheckpoint(workflowId, nextStep, nextStatus === "awaiting_input" ? "waiting" : "escalated", { slot_count: slots.length });
    }
  } else if (workflow.currentStep === "appointment_booking") {
    const routing = state.routing as { department_code?: string };
    const requirementCall = await callMcpTool("Document Agent", "check_document_requirements", {
      request_text: workflow.requestText,
      department_code: routing.department_code || "",
    });
    const requirementResult = requirementCall.output as {
      expected?: string[];
      rule_version?: string;
      evidence_refs?: string[];
    };
    const expected = requirementResult.expected || [];
    state = appendToolTraces(state, [requirementCall.trace]);
    await auditTools(workflowId, [requirementCall.trace]);
    state = appendTimeline(
      {
        ...state,
        documents: {
          expected,
          received: [],
          missing: expected,
          rule_version: requirementResult.rule_version,
          evidence_refs: requirementResult.evidence_refs || [],
          instruction: "Upload only records you are authorized to share. Clinical content is not interpreted.",
        },
        message: expected.length
          ? `The appointment is committed. Document Agent is waiting for: ${expected.join(", ")}.`
          : "No requested document is outstanding. Follow-up Agent is preparing administrative reminders.",
      },
      {
        step: "document_coordination",
        status: expected.length ? "waiting" : "complete",
        summary: expected.length ? `Waiting for ${expected.join(", ")} validation.` : "No requested document requirement.",
      },
    );
    nextStatus = expected.length ? "awaiting_document" : "running";
    nextStep = "document_coordination";
    await auditCheckpoint(workflowId, nextStep, expected.length ? "waiting" : "complete", {
      expected,
      rule_version: requirementResult.rule_version,
      evidence_refs: requirementResult.evidence_refs || [],
    });
  } else if (workflow.currentStep === "document_coordination") {
    const documents = state.documents as { missing?: string[] } | undefined;
    if (documents?.missing?.length) {
      nextStatus = "awaiting_document";
    } else {
      const appointment = state.appointment as { id: string; doctor: string; start_time: string };
      const start = new Date(appointment.start_time);
      const reminders = [
        { id: `${appointment.id}:24h`, type: "appointment_24h", scheduled_at: new Date(start.getTime() - 86_400_000).toISOString() },
        { id: `${appointment.id}:admin`, type: "followup_admin", scheduled_at: new Date(start.getTime() + 86_400_000).toISOString() },
      ];
      state = appendTimeline(
        {
          ...state,
          reminders,
          message: `Coordination complete. Appointment confirmed with ${appointment.doctor}; document requirements are satisfied and ${reminders.length} administrative reminders are recorded.`,
        },
        { step: "confirmation_and_followup", status: "complete", summary: "Confirmation rebuilt from committed workflow state." },
      );
      nextStatus = "completed";
      nextStep = "completed";
      await auditCheckpoint(workflowId, "confirmation_and_followup", "complete", { reminder_count: reminders.length });
      await writeAudit({
        workflowId,
        role,
        action: "workflow.completed",
        entityType: "workflow",
        entityId: workflowId,
        metadata: { evidence_gated: true },
      });
    }
  }

  await db.update(workflows).set({
    intent,
    currentStep: nextStep,
    status: nextStatus,
    stateJson: JSON.stringify(state),
    updatedAt: now,
  }).where(eq(workflows.id, workflowId));
  const [updated] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  return Response.json(workflowView(updated));
}
