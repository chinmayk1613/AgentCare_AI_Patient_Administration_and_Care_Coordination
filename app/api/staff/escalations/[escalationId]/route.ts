import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, documents, escalations, workflows } from "../../../../../db/schema";
import { activeDepartments } from "../../../_agentic";
import { forbidden, roleFromRequest, unauthorized, workflowView } from "../../../_lib";

export async function GET(request: Request, context: { params: Promise<{ escalationId: string }> }) {
  const role = roleFromRequest(request);
  if (!role) return unauthorized();
  if (role !== "reviewer") return forbidden();
  const { escalationId } = await context.params;
  const id = Number(escalationId);
  if (!Number.isInteger(id)) return Response.json({ detail: "Invalid escalation id" }, { status: 400 });

  const db = getDb();
  const [item] = await db.select().from(escalations).where(eq(escalations.id, id)).limit(1);
  if (!item) return Response.json({ detail: "Escalation not found" }, { status: 404 });
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, item.workflowRunId)).limit(1);
  if (!workflow) return Response.json({ detail: "Workflow not found" }, { status: 404 });
  const [audit, patientDocuments] = await Promise.all([
    db.select().from(auditEvents).where(eq(auditEvents.workflowRunId, workflow.id)).orderBy(asc(auditEvents.id)),
    db.select().from(documents).where(eq(documents.workflowRunId, workflow.id)).orderBy(asc(documents.id)),
  ]);
  const state = JSON.parse(workflow.stateJson) as {
    routing?: { recommended_department?: { code: string; name: string } };
  };

  return Response.json({
    escalation: {
      id: item.id,
      workflow_run_id: item.workflowRunId,
      reason_code: item.reasonCode,
      reason: item.reason,
      severity: item.severity,
      status: item.status,
      resolution: item.resolution,
      reviewed_by: item.reviewedBy,
      created_at: item.createdAt,
      resolved_at: item.resolvedAt,
    },
    workflow: workflowView(workflow),
    departments: activeDepartments(),
    recommended_department: state.routing?.recommended_department || null,
    resume_supported: item.reasonCode === "AMBIGUOUS_DEPARTMENT",
    documents: patientDocuments.map((document) => ({
      id: document.id,
      document_type: document.documentType,
      original_name: document.originalName,
      status: document.status,
      checksum: document.checksum.slice(0, 16),
      size_bytes: document.sizeBytes,
      created_at: document.createdAt,
    })),
    audit: audit.map((event) => ({
      id: event.id,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId,
      outcome: event.outcome,
      metadata: JSON.parse(event.metadataJson),
      created_at: event.createdAt,
    })),
  });
}
