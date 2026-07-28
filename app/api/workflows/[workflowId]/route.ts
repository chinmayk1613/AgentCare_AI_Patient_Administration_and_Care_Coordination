import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, documents, workflows } from "../../../../db/schema";
import { identityFromRequest, unauthorized, workflowView } from "../../_lib";

export async function GET(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  const { workflowId } = await context.params;
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow) return Response.json({ detail: "Workflow not found" }, { status: 404 });
  if (identity.role === "patient" && workflow.patientId !== identity.patientId) {
    return Response.json({ detail: "Workflow not found" }, { status: 404 });
  }
  const [audit, patientDocuments] = await Promise.all([
    db.select().from(auditEvents).where(eq(auditEvents.workflowRunId, workflowId)).orderBy(asc(auditEvents.createdAt)),
    db.select().from(documents).where(eq(documents.workflowRunId, workflowId)).orderBy(asc(documents.createdAt)),
  ]);
  return Response.json({
    workflow: workflowView(workflow),
    documents: patientDocuments.map((document) => ({
      id: document.id,
      document_type: document.documentType,
      original_name: document.originalName,
      content_type: document.contentType,
      status: document.status,
      flags: JSON.parse(document.flagsJson),
      checksum: document.checksum,
      checksum_algorithm: document.checksumAlgorithm || "sha256",
      storage_reference: document.storageReference,
      size_bytes: document.sizeBytes,
      patient_link_confidence: document.patientLinkConfidence,
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
    tools: (JSON.parse(workflow.stateJson).tool_traces || []).map((trace: {
      agent: string;
      tool: string;
      status: string;
      input: unknown;
      output: unknown;
      at: string;
      server: string;
      transport: string;
    }) => ({
      agent: trace.agent,
      tool: trace.tool,
      status: trace.status,
      input: trace.input,
      output: trace.output,
      created_at: trace.at,
      server: trace.server,
      transport: trace.transport,
    })),
  });
}
