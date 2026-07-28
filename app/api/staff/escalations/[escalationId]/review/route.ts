import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { escalations, workflows } from "../../../../../../db/schema";
import {
  activeDepartments,
  appendTimeline,
  appendToolTraces,
  callMcpTool,
  type ToolTrace,
} from "../../../../_agentic";
import { forbidden, identityFromRequest, unauthorized, workflowView, writeAudit } from "../../../../_lib";

export async function POST(request: Request, context: { params: Promise<{ escalationId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "reviewer") return forbidden();
  const role = identity.role;
  const { escalationId } = await context.params;
  const id = Number(escalationId);
  const body = (await request.json()) as { decision?: "approved" | "rejected"; rationale?: string; department_code?: string };
  if (!["approved", "rejected"].includes(body.decision || "") || (body.rationale?.trim().length || 0) < 3) {
    return Response.json({ detail: "A valid decision and rationale are required" }, { status: 400 });
  }
  const db = getDb();
  const [item] = await db.select().from(escalations).where(eq(escalations.id, id)).limit(1);
  if (!item) return Response.json({ detail: "Escalation not found" }, { status: 404 });
  if (item.status !== "open") return Response.json({ detail: "Escalation is already resolved" }, { status: 409 });

  const resolvedAt = new Date().toISOString();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, item.workflowRunId)).limit(1);
  const resumeRouting = body.decision === "approved" && item.reasonCode === "AMBIGUOUS_DEPARTMENT";
  const selectedDepartment = resumeRouting
    ? activeDepartments().find((department) => department.code === body.department_code)
    : undefined;
  if (resumeRouting && !selectedDepartment) {
    return Response.json({ detail: "Choose a valid department before approving this routing case" }, { status: 400 });
  }
  if (resumeRouting && !workflow) return Response.json({ detail: "Workflow not found" }, { status: 404 });

  const escalationUpdate = db.update(escalations).set({
    status: "resolved",
    resolution: `${body.decision}: ${body.rationale}`,
    reviewedBy: identity.id,
    resolvedAt,
  }).where(eq(escalations.id, id));

  let finalWorkflowStatus = resumeRouting ? "running" : body.decision === "approved" ? "approved_for_manual_action" : "closed";
  let finalWorkflowStep = workflow?.currentStep;
  let availabilityTrace: ToolTrace | undefined;
  let noSlotsEscalation = false;
  if (workflow) {
    let state = JSON.parse(workflow.stateJson);
    state.human_review = {
      decision: body.decision,
      rationale: body.rationale,
      reviewer_id: identity.id,
      reviewer_name: identity.name,
      department_code: selectedDepartment?.code,
      resumed: resumeRouting,
      resolved_at: resolvedAt,
    };
    if (resumeRouting && selectedDepartment) {
      state.routing = {
        ...(state.routing || {}),
        decision: "route",
        department: selectedDepartment,
        department_code: selectedDepartment.code,
        department_name: selectedDepartment.name,
        confidence: 1,
        approved_by: identity.id,
        approved_by_name: identity.name,
        approval_rationale: body.rationale,
      };
      state.message = `${selectedDepartment.name} was confirmed by authorized staff. Appointment Agent is resuming with MCP availability.`;
      state = appendTimeline(state, {
        step: "department_routing",
        status: "complete",
        summary: `${selectedDepartment.name} confirmed by authorized staff; workflow resumed.`,
      });

      const slotCall = await callMcpTool("Appointment Agent", "find_available_slots", {
        department_code: selectedDepartment.code,
      });
      const slots = slotCall.output as {
        id: string;
        doctor: string;
        start_time: string;
        department_code: string;
      }[];
      availabilityTrace = slotCall.trace;
      state = appendToolTraces(state, [slotCall.trace]);
      if (slots.length) {
        state.available_slots = slots;
        state.message = "Routing was approved and MCP availability is ready. Choose a slot to continue.";
        state = appendTimeline(state, {
          step: "availability",
          status: "waiting",
          summary: `${slots.length} MCP-sourced slots are awaiting patient selection.`,
        });
        finalWorkflowStatus = "awaiting_input";
      } else {
        state.available_slots = [];
        state.message = "Routing was approved, but MCP returned no active slots. Staff availability coordination is required.";
        state = appendTimeline(state, {
          step: "availability",
          status: "escalated",
          summary: "No active appointment slot was returned by MCP.",
        });
        finalWorkflowStatus = "human_review";
        noSlotsEscalation = true;
      }
      finalWorkflowStep = "availability";
    } else {
      state.message = body.decision === "approved"
        ? "Staff approved manual handling. Autonomous processing remains stopped at the safety boundary."
        : "Staff rejected the proposed action and closed the workflow.";
    }
    const workflowUpdate = db.update(workflows).set({
      status: finalWorkflowStatus,
      currentStep: finalWorkflowStep,
      stateJson: JSON.stringify(state),
      updatedAt: resolvedAt,
    }).where(eq(workflows.id, workflow.id));
    await db.batch([escalationUpdate, workflowUpdate]);
    if (noSlotsEscalation) {
      await db.insert(escalations).values({
        workflowRunId: workflow.id,
        reasonCode: "NO_SLOTS_AVAILABLE",
        reason: "Routing was approved, but MCP returned no active appointment slots.",
        severity: "low",
      });
    }
  } else {
    await escalationUpdate;
  }
  if (availabilityTrace) {
    await writeAudit({
      workflowId: item.workflowRunId,
      role,
      action: "mcp.tool.called",
      entityType: "tool_invocation",
      entityId: availabilityTrace.id,
      metadata: {
        agent: availabilityTrace.agent,
        server: availabilityTrace.server,
        transport: availabilityTrace.transport,
        tool: availabilityTrace.tool,
        status: availabilityTrace.status,
        resumed_after_human_review: true,
      },
    });
  }
  await writeAudit({
    workflowId: item.workflowRunId,
    role,
    action: "escalation.reviewed",
    entityType: "escalation",
    entityId: String(id),
    metadata: {
      decision: body.decision,
      department_code: selectedDepartment?.code,
      resumed: resumeRouting,
      rationale: body.rationale,
    },
  });
  const [updatedWorkflow] = workflow
    ? await db.select().from(workflows).where(eq(workflows.id, workflow.id)).limit(1)
    : [];
  return Response.json({
    status: "resolved",
    workflow_status: finalWorkflowStatus,
    resumed: resumeRouting,
    workflow: updatedWorkflow ? workflowView(updatedWorkflow) : null,
  });
}
