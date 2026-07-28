import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appointments, auditEvents, documents, workflows } from "../../../../db/schema";
import { appendTimeline, appendToolTraces, callMcpTool } from "../../_agentic";
import { forbidden, identityFromRequest, unauthorized, workflowView, writeAudit } from "../../_lib";

type AppointmentRow = typeof appointments.$inferSelect;
const HOSPITAL_TIME_ZONE = "Asia/Kolkata";

function appointmentTimeHasPassed(startTime: string, now = Date.now()) {
  return new Date(startTime).getTime() <= now;
}

function displayStatus(row: AppointmentRow, now = Date.now()) {
  if (["cancelled", "completed", "no_show"].includes(row.status)) return row.status;
  return appointmentTimeHasPassed(row.startTime, now) ? "done" : row.status;
}

function hospitalClock(now = new Date()) {
  return {
    time_zone: HOSPITAL_TIME_ZONE,
    time_zone_label: "IST",
    now_utc: now.toISOString(),
    now_local: new Intl.DateTimeFormat("en-GB", {
      timeZone: HOSPITAL_TIME_ZONE,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now),
  };
}

function appointmentView(row: AppointmentRow) {
  return {
    id: row.id,
    workflow_id: row.workflowRunId,
    patient_id: row.patientId,
    department_code: row.departmentCode,
    doctor: row.doctorName,
    slot_id: row.slotId,
    start_time: row.startTime,
    status: row.status,
    display_status: displayStatus(row),
    reason: row.reason,
    previous_slot_id: row.previousSlotId,
    cancellation_reason: row.cancellationReason,
    cancelled_at: row.cancelledAt,
    completed_at: row.completedAt,
    doctor_notes: row.doctorNotes,
    prescribed_medications: JSON.parse(row.prescribedMedicationsJson) as string[],
    follow_up_suggestions: row.followUpSuggestions,
    follow_up_recommended_at: row.followUpRecommendedAt,
    clinical_source: "clinician_entered_only",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    clock: hospitalClock(),
  };
}

async function ensureAppointmentRecord(workflow: typeof workflows.$inferSelect) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.workflowRunId, workflow.id))
    .limit(1);
  if (existing) return existing;

  const state = JSON.parse(workflow.stateJson) as {
    appointment?: {
      id?: string;
      doctor?: string;
      start_time?: string;
      status?: string;
      slot_id?: string;
      department_code?: string;
      committed_at?: string;
    };
    routing?: { department_code?: string };
  };
  const legacy = state.appointment;
  if (!legacy?.id || !legacy.doctor || !legacy.start_time || !legacy.slot_id) return null;
  const now = new Date().toISOString();
  await db.insert(appointments).values({
    id: String(legacy.id),
    workflowRunId: workflow.id,
    patientId: workflow.patientId,
    departmentCode: legacy.department_code || state.routing?.department_code || "unassigned",
    doctorName: legacy.doctor,
    slotId: legacy.slot_id,
    startTime: legacy.start_time,
    status: legacy.status || "confirmed",
    reason: workflow.requestText,
    createdAt: legacy.committed_at || workflow.createdAt || now,
    updatedAt: now,
  }).onConflictDoNothing();
  const [created] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.workflowRunId, workflow.id))
    .limit(1);
  return created || null;
}

async function resolveAppointment(request: Request, workflowId: string) {
  const identity = identityFromRequest(request);
  if (!identity) return { response: unauthorized() };
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow || (identity.role === "patient" && workflow.patientId !== identity.patientId)) {
    return { response: Response.json({ detail: "Appointment not found" }, { status: 404 }) };
  }
  const appointment = await ensureAppointmentRecord(workflow);
  if (!appointment) {
    return { response: Response.json({ detail: "No committed appointment exists for this case" }, { status: 404 }) };
  }
  if (
    identity.role === "reviewer" &&
    identity.departmentScope &&
    identity.departmentScope !== "all" &&
    identity.departmentScope !== appointment.departmentCode
  ) {
    return { response: forbidden("This appointment is outside your department scope") };
  }
  return { identity, workflow, appointment };
}

export async function GET(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await context.params;
  const resolved = await resolveAppointment(request, workflowId);
  if ("response" in resolved) return resolved.response;
  const { identity, workflow, appointment } = resolved;
  const db = getDb();
  const [documentRows, auditRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.workflowRunId, workflow.id)).orderBy(asc(documents.createdAt)),
    db.select().from(auditEvents).where(eq(auditEvents.workflowRunId, workflow.id)).orderBy(asc(auditEvents.createdAt)),
  ]);

  let alternativeSlots: unknown[] = [];
  let availabilityTrace = null;
  const timeHasPassed = appointmentTimeHasPassed(appointment.startTime);
  if (["confirmed", "rescheduled"].includes(appointment.status) && !timeHasPassed) {
    const call = await callMcpTool("Appointment Agent", "find_available_slots", {
      department_code: appointment.departmentCode,
      purpose: "reschedule",
      appointment_id: appointment.id,
    });
    alternativeSlots = (call.output as unknown[]) || [];
    availabilityTrace = call.trace;
  }

  await writeAudit({
    workflowId: workflow.id,
    role: identity.role,
    action: "appointment.details.viewed",
    entityType: "appointment",
    entityId: appointment.id,
    metadata: { actor_id: identity.id, role: identity.role },
  });

  const state = JSON.parse(workflow.stateJson) as { reminders?: unknown[] };
  return Response.json({
    appointment: appointmentView(appointment),
    workflow: workflowView(workflow),
    documents: documentRows.map((document) => ({
      id: document.id,
      document_type: document.documentType,
      original_name: document.originalName,
      status: document.status,
      created_at: document.createdAt,
    })),
    reminders: state.reminders || [],
    alternative_slots: alternativeSlots,
    availability_tool: availabilityTrace,
    history: auditRows
      .filter((event) => event.entityType === "appointment" || event.action.startsWith("appointment."))
      .map((event) => ({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        metadata: JSON.parse(event.metadataJson),
        created_at: event.createdAt,
      })),
    capabilities: {
      can_cancel: !timeHasPassed && (identity.permissions.includes("appointment:self-service") || identity.permissions.includes("appointment:manage")),
      can_reschedule: !timeHasPassed && (identity.permissions.includes("appointment:self-service") || identity.permissions.includes("appointment:manage")),
      can_record_clinical_outcome: identity.permissions.includes("clinical:write"),
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await context.params;
  const resolved = await resolveAppointment(request, workflowId);
  if ("response" in resolved) return resolved.response;
  const { identity, workflow, appointment } = resolved;
  const body = await request.json() as {
    action?: "cancel" | "reschedule" | "clinical_update";
    reason?: string;
    new_slot_id?: string;
    visit_status?: "scheduled" | "completed" | "no_show";
    doctor_notes?: string;
    prescribed_medications?: string[];
    follow_up_suggestions?: string;
    follow_up_recommended_at?: string | null;
  };
  const db = getDb();
  const now = new Date().toISOString();
  const state = JSON.parse(workflow.stateJson) as Record<string, unknown> & {
    appointment?: Record<string, unknown>;
    reminders?: Record<string, unknown>[];
  };

  if (body.action === "cancel") {
    if (!identity.permissions.some((permission) => ["appointment:self-service", "appointment:manage"].includes(permission))) {
      return forbidden();
    }
    const reason = body.reason?.trim() || "";
    if (reason.length < 3 || reason.length > 500) {
      return Response.json({ detail: "A cancellation reason between 3 and 500 characters is required" }, { status: 400 });
    }
    if (!["confirmed", "rescheduled"].includes(appointment.status)) {
      return Response.json({ detail: "Only an active appointment can be cancelled" }, { status: 409 });
    }
    if (appointmentTimeHasPassed(appointment.startTime)) {
      return Response.json({ detail: "A past appointment cannot be cancelled. Its IST clock status is DONE pending clinician outcome." }, { status: 409 });
    }
    const call = await callMcpTool("Appointment Agent", "cancel_appointment_slot", {
      slot_id: appointment.slotId,
      workflow_id: workflow.id,
      appointment_id: appointment.id,
    });
    const result = call.output as { released?: boolean; reason_code?: string };
    if (!result.released) {
      return Response.json({ detail: "The booked slot could not be released", reason_code: result.reason_code }, { status: 409 });
    }
    await db.update(appointments).set({
      status: "cancelled",
      cancellationReason: reason,
      cancelledAt: now,
      updatedAt: now,
    }).where(and(eq(appointments.id, appointment.id), eq(appointments.status, appointment.status)));
    const nextState = appendTimeline(
      appendToolTraces({
        ...state,
        appointment: { ...state.appointment, status: "cancelled", cancellation_reason: reason, cancelled_at: now },
        reminders: (state.reminders || []).map((reminder) => ({ ...reminder, status: "cancelled" })),
        message: "The appointment was cancelled, its slot was released, and its reminders were stopped.",
      }, [call.trace]),
      { step: "appointment_cancellation", status: "complete", summary: "Authorized cancellation committed through MCP." },
    );
    await db.update(workflows).set({ stateJson: JSON.stringify(nextState), updatedAt: now }).where(eq(workflows.id, workflow.id));
    await writeAudit({
      workflowId: workflow.id,
      role: identity.role,
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { reason, slot_id: appointment.slotId, actor_id: identity.id, mcp_tool: call.trace.tool },
    });
  } else if (body.action === "reschedule") {
    if (!identity.permissions.some((permission) => ["appointment:self-service", "appointment:manage"].includes(permission))) {
      return forbidden();
    }
    if (!["confirmed", "rescheduled"].includes(appointment.status)) {
      return Response.json({ detail: "Only an active appointment can be rescheduled" }, { status: 409 });
    }
    if (appointmentTimeHasPassed(appointment.startTime)) {
      return Response.json({ detail: "A past appointment cannot be rescheduled. Its IST clock status is DONE pending clinician outcome." }, { status: 409 });
    }
    if (!body.new_slot_id) {
      return Response.json({ detail: "Choose an available replacement slot" }, { status: 400 });
    }
    const call = await callMcpTool("Appointment Agent", "reschedule_appointment_slot", {
      current_slot_id: appointment.slotId,
      new_slot_id: body.new_slot_id,
      workflow_id: workflow.id,
      appointment_id: appointment.id,
    });
    const result = call.output as {
      rescheduled?: boolean;
      reason_code?: string;
      slot?: { id: string; doctor: string; start_time: string; department_code: string };
    };
    if (!result.rescheduled || !result.slot) {
      return Response.json({
        detail: result.reason_code === "SLOT_NO_LONGER_AVAILABLE"
          ? "That replacement slot was just taken. Refresh the case to see current availability."
          : "The appointment could not be rescheduled safely.",
        reason_code: result.reason_code,
      }, { status: 409 });
    }
    const replacement = result.slot;
    await db.update(appointments).set({
      previousSlotId: appointment.slotId,
      slotId: replacement.id,
      doctorName: replacement.doctor,
      startTime: replacement.start_time,
      departmentCode: replacement.department_code,
      status: "rescheduled",
      cancellationReason: null,
      cancelledAt: null,
      updatedAt: now,
    }).where(eq(appointments.id, appointment.id));
    const start = new Date(replacement.start_time);
    const reminders = [
      { id: `${appointment.id}:24h`, type: "appointment_24h", scheduled_at: new Date(start.getTime() - 86_400_000).toISOString(), status: "scheduled" },
      { id: `${appointment.id}:admin`, type: "followup_admin", scheduled_at: new Date(start.getTime() + 86_400_000).toISOString(), status: "scheduled" },
    ];
    const nextState = appendTimeline(
      appendToolTraces({
        ...state,
        appointment: {
          ...state.appointment,
          status: "rescheduled",
          doctor: replacement.doctor,
          start_time: replacement.start_time,
          slot_id: replacement.id,
          previous_slot_id: appointment.slotId,
          rescheduled_at: now,
        },
        reminders,
        message: "The replacement slot is committed, the previous slot is available again, and reminders were rebuilt.",
      }, [call.trace]),
      { step: "appointment_reschedule", status: "complete", summary: "Replacement slot committed through conflict-safe MCP." },
    );
    await db.update(workflows).set({ stateJson: JSON.stringify(nextState), updatedAt: now }).where(eq(workflows.id, workflow.id));
    await writeAudit({
      workflowId: workflow.id,
      role: identity.role,
      action: "appointment.rescheduled",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: {
        previous_slot_id: appointment.slotId,
        new_slot_id: replacement.id,
        doctor: replacement.doctor,
        start_time: replacement.start_time,
        actor_id: identity.id,
        mcp_tool: call.trace.tool,
      },
    });
  } else if (body.action === "clinical_update") {
    if (!identity.permissions.includes("clinical:write")) {
      return forbidden("Only an authorized clinician can record appointment outcomes, notes, or medicines");
    }
    if (!body.visit_status || !["scheduled", "completed", "no_show"].includes(body.visit_status)) {
      return Response.json({ detail: "A valid appointment outcome is required" }, { status: 400 });
    }
    const medications = (body.prescribed_medications || [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    const nextStatus = body.visit_status === "scheduled"
      ? (appointment.status === "rescheduled" ? "rescheduled" : "confirmed")
      : body.visit_status;
    await db.update(appointments).set({
      status: nextStatus,
      completedAt: body.visit_status === "completed" ? now : null,
      doctorNotes: body.doctor_notes?.trim().slice(0, 5000) || null,
      prescribedMedicationsJson: JSON.stringify(medications),
      followUpSuggestions: body.follow_up_suggestions?.trim().slice(0, 2000) || null,
      followUpRecommendedAt: body.follow_up_recommended_at || null,
      updatedAt: now,
    }).where(eq(appointments.id, appointment.id));
    const nextState = appendTimeline({
      ...state,
      appointment: {
        ...state.appointment,
        status: nextStatus,
        completed_at: body.visit_status === "completed" ? now : null,
        clinical_record_source: "clinician_entered",
      },
      message: body.visit_status === "completed"
        ? "The clinician recorded the visit outcome. AgentCare did not generate or alter the clinical content."
        : `The clinician recorded this appointment as ${body.visit_status.replace("_", " ")}.`,
    }, {
      step: "clinician_outcome",
      status: "complete",
      summary: "Authorized clinician-entered outcome persisted without agent generation.",
    });
    await db.update(workflows).set({ stateJson: JSON.stringify(nextState), updatedAt: now }).where(eq(workflows.id, workflow.id));
    await writeAudit({
      workflowId: workflow.id,
      role: identity.role,
      action: "appointment.clinical_record_updated",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: {
        actor_id: identity.id,
        source: "clinician_entered",
        visit_status: body.visit_status,
        medication_entries: medications.length,
        has_doctor_notes: Boolean(body.doctor_notes?.trim()),
        has_follow_up: Boolean(body.follow_up_suggestions?.trim() || body.follow_up_recommended_at),
      },
    });
  } else {
    return Response.json({ detail: "Unsupported appointment action" }, { status: 400 });
  }

  const [updated] = await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1);
  return Response.json({ appointment: appointmentView(updated) });
}
