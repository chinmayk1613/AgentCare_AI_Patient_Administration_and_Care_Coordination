import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appointments, workflows } from "../../../../../db/schema";
import { appendTimeline, appendToolTraces, callMcpTool } from "../../../_agentic";
import { identityFromRequest, unauthorized, workflowView, writeAudit } from "../../../_lib";

export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient") return Response.json({ detail: "Patient role required" }, { status: 403 });
  const { workflowId } = await context.params;
  const { slot_id: slotId } = await request.json() as { slot_id?: string };
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow || workflow.patientId !== identity.patientId) return Response.json({ detail: "Workflow not found" }, { status: 404 });
  if (workflow.status !== "awaiting_input" || workflow.currentStep !== "availability") {
    return Response.json({ detail: "Workflow is not awaiting slot selection" }, { status: 409 });
  }
  let state = JSON.parse(workflow.stateJson) as Record<string, unknown>;
  const slots = (state.available_slots || []) as { id: string; doctor: string; start_time: string }[];
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return Response.json({ detail: "Selected slot is unavailable" }, { status: 409 });
  const rescheduleTarget = state.target_appointment as {
    id?: string;
    workflow_id?: string;
    slot_id?: string;
  } | undefined;
  if (workflow.intent === "reschedule" && rescheduleTarget?.id && rescheduleTarget.workflow_id && rescheduleTarget.slot_id) {
    const rescheduleCall = await callMcpTool("Appointment Agent", "reschedule_appointment_slot", {
      current_slot_id: rescheduleTarget.slot_id,
      new_slot_id: slot.id,
      workflow_id: rescheduleTarget.workflow_id,
      appointment_id: rescheduleTarget.id,
      requested_by_workflow_id: workflow.id,
    });
    const result = rescheduleCall.output as {
      rescheduled?: boolean;
      reason_code?: string;
      slot?: { id: string; doctor: string; start_time: string; department_code: string };
    };
    state = appendToolTraces(state, [rescheduleCall.trace]);
    await writeAudit({
      workflowId,
      role: identity.role,
      action: "mcp.tool.called",
      entityType: "tool_invocation",
      entityId: rescheduleCall.trace.id,
      metadata: {
        agent: rescheduleCall.trace.agent,
        server: rescheduleCall.trace.server,
        transport: rescheduleCall.trace.transport,
        tool: rescheduleCall.trace.tool,
        status: rescheduleCall.trace.status,
        rescheduled: Boolean(result.rescheduled),
      },
    });
    if (!result.rescheduled || !result.slot) {
      const routing = state.routing as { department_code?: string } | undefined;
      const refreshCall = await callMcpTool("Appointment Agent", "find_available_slots", {
        department_code: routing?.department_code || "",
        purpose: "reschedule_retry",
      });
      state = appendToolTraces(state, [refreshCall.trace]);
      state.available_slots = refreshCall.output;
      state.message = "That replacement slot is no longer available. The original appointment is unchanged; choose another current slot.";
      await db.update(workflows).set({ stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() }).where(eq(workflows.id, workflowId));
      return Response.json({ detail: state.message, reason_code: result.reason_code, workflow: workflowView({ ...workflow, stateJson: JSON.stringify(state) }) }, { status: 409 });
    }
    const replacement = result.slot;
    const now = new Date().toISOString();
    await db.update(appointments).set({
      previousSlotId: rescheduleTarget.slot_id,
      slotId: replacement.id,
      doctorName: replacement.doctor,
      startTime: replacement.start_time,
      departmentCode: replacement.department_code,
      status: "rescheduled",
      updatedAt: now,
    }).where(eq(appointments.id, rescheduleTarget.id));
    const [targetWorkflow] = await db.select().from(workflows).where(eq(workflows.id, rescheduleTarget.workflow_id)).limit(1);
    const start = new Date(replacement.start_time);
    const reminders = [
      { id: `${rescheduleTarget.id}:24h`, type: "appointment_24h", scheduled_at: new Date(start.getTime() - 86_400_000).toISOString(), status: "scheduled" },
      { id: `${rescheduleTarget.id}:admin`, type: "followup_admin", scheduled_at: new Date(start.getTime() + 86_400_000).toISOString(), status: "scheduled" },
    ];
    if (targetWorkflow) {
      const targetState = JSON.parse(targetWorkflow.stateJson) as Record<string, unknown> & { appointment?: Record<string, unknown> };
      const updatedTargetState = appendTimeline({
        ...targetState,
        appointment: {
          ...targetState.appointment,
          status: "rescheduled",
          doctor: replacement.doctor,
          start_time: replacement.start_time,
          slot_id: replacement.id,
          previous_slot_id: rescheduleTarget.slot_id,
          rescheduled_at: now,
        },
        reminders,
        message: "The appointment was rescheduled through an explicit patient request. The previous slot was released and reminders were rebuilt.",
      }, { step: "appointment_reschedule", status: "complete", summary: "Replacement slot committed through conflict-safe MCP." });
      await db.update(workflows).set({ stateJson: JSON.stringify(updatedTargetState), updatedAt: now }).where(eq(workflows.id, targetWorkflow.id));
    }
    state = appendTimeline(
      {
        ...state,
        linked_appointment: {
          id: rescheduleTarget.id,
          workflow_id: rescheduleTarget.workflow_id,
          doctor: replacement.doctor,
          start_time: replacement.start_time,
          status: "rescheduled",
        },
        reminders,
        message: `Appointment rescheduled with ${replacement.doctor} for ${new Date(replacement.start_time).toLocaleString()}. The previous slot is available again.`,
      },
      { step: "availability", status: "complete", summary: "Patient selected a replacement MCP slot." },
    );
    state = appendTimeline(state, { step: "appointment_reschedule", status: "complete", summary: "Existing appointment and reminders updated." });
    await db.update(workflows).set({
      currentStep: "completed",
      status: "completed",
      stateJson: JSON.stringify(state),
      updatedAt: now,
    }).where(eq(workflows.id, workflowId));
    await writeAudit({
      workflowId: rescheduleTarget.workflow_id,
      role: identity.role,
      action: "appointment.rescheduled",
      entityType: "appointment",
      entityId: rescheduleTarget.id,
      metadata: {
        requested_by_workflow_id: workflowId,
        previous_slot_id: rescheduleTarget.slot_id,
        new_slot_id: replacement.id,
        doctor: replacement.doctor,
        start_time: replacement.start_time,
        mcp_tool: rescheduleCall.trace.tool,
      },
    });
    const [updated] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    return Response.json(workflowView(updated));
  }
  const reservationCall = await callMcpTool("Appointment Agent", "book_appointment_slot", {
    slot_id: slot.id,
    workflow_id: workflow.id,
  });
  const reservation = reservationCall.output as {
    reserved?: boolean;
    reason_code?: string;
    slot?: { id: string; doctor: string; start_time: string; department_code: string };
  };
  state = appendToolTraces(state, [reservationCall.trace]);
  await writeAudit({
    workflowId,
    role: identity.role,
    action: "mcp.tool.called",
    entityType: "tool_invocation",
    entityId: reservationCall.trace.id,
    metadata: {
      agent: reservationCall.trace.agent,
      server: reservationCall.trace.server,
      transport: reservationCall.trace.transport,
      tool: reservationCall.trace.tool,
      status: reservationCall.trace.status,
      reserved: Boolean(reservation.reserved),
    },
  });
  if (!reservation.reserved || !reservation.slot) {
    const routing = state.routing as { department_code?: string } | undefined;
    const refreshCall = await callMcpTool("Appointment Agent", "find_available_slots", {
      department_code: routing?.department_code || "",
    });
    state = appendToolTraces(state, [refreshCall.trace]);
    state.available_slots = refreshCall.output;
    state.message = "That doctor and time were just booked. MCP refreshed the remaining available slots.";
    await db.update(workflows).set({
      stateJson: JSON.stringify(state),
      updatedAt: new Date().toISOString(),
    }).where(eq(workflows.id, workflowId));
    return Response.json({
      detail: state.message,
      reason_code: reservation.reason_code || "SLOT_NO_LONGER_AVAILABLE",
      workflow: workflowView({ ...workflow, stateJson: JSON.stringify(state) }),
    }, { status: 409 });
  }
  const reservedSlot = reservation.slot;

  const appointment = {
    id: `appt-${crypto.randomUUID().slice(0, 12)}`,
    status: "confirmed",
    doctor: reservedSlot.doctor,
    start_time: reservedSlot.start_time,
    slot_id: reservedSlot.id,
    department_code: reservedSlot.department_code,
    committed_at: new Date().toISOString(),
  };
  await db.insert(appointments).values({
    id: appointment.id,
    workflowRunId: workflow.id,
    patientId: workflow.patientId,
    departmentCode: reservedSlot.department_code,
    doctorName: reservedSlot.doctor,
    slotId: reservedSlot.id,
    startTime: reservedSlot.start_time,
    status: appointment.status,
    reason: workflow.requestText,
    createdAt: appointment.committed_at,
    updatedAt: appointment.committed_at,
  });
  state = appendTimeline(
    {
      ...state,
      appointment,
      selected_slot_id: reservedSlot.id,
      message: "The selected slot is committed. Document Agent is evaluating requested records.",
    },
    { step: "availability", status: "complete", summary: "Patient selected an MCP-sourced slot." },
  );
  state = appendTimeline(
    state,
    { step: "appointment_booking", status: "complete", summary: "Booking committed after explicit patient confirmation." },
  );
  await db.update(workflows).set({
    currentStep: "appointment_booking",
    status: "running",
    stateJson: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  }).where(eq(workflows.id, workflowId));
  await writeAudit({
    workflowId,
    role: identity.role,
    action: "appointment.committed",
    entityType: "appointment",
    entityId: appointment.id,
    metadata: {
      slot_id: reservedSlot.id,
      doctor: reservedSlot.doctor,
      start_time: reservedSlot.start_time,
      patient_confirmed: true,
      atomic_reservation: true,
    },
  });
  await writeAudit({
    workflowId,
    role: identity.role,
    action: "workflow.checkpoint",
    entityType: "workflow",
    entityId: workflowId,
    metadata: { step: "appointment_booking", status: "complete" },
  });
  const [updated] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  return Response.json(workflowView(updated));
}
