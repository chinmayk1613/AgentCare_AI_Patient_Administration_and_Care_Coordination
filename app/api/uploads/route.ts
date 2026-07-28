import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { uploadSessions, workflows } from "../../../db/schema";
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_SIZE, UPLOAD_CHUNK_SIZE, safeFilename } from "../_uploads";
import { identityFromRequest, unauthorized, writeAudit } from "../_lib";

export async function POST(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient" || !identity.patientId) return Response.json({ detail: "Patient role required" }, { status: 403 });
  const body = await request.json() as { workflow_id?: string; filename?: string; content_type?: string; size_bytes?: number; declared_type?: string };
  const filename = safeFilename(body.filename || "");
  const contentType = body.content_type || "";
  const sizeBytes = Number(body.size_bytes || 0);
  if (!body.workflow_id || !ACCEPTED_UPLOAD_TYPES.has(contentType)) return Response.json({ detail: "Unsupported document type" }, { status: 415 });
  if (sizeBytes < 1 || sizeBytes > MAX_UPLOAD_SIZE) return Response.json({ detail: "Document must be between 1 byte and 25 MB" }, { status: 413 });
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, body.workflow_id)).limit(1);
  if (!workflow || workflow.patientId !== identity.patientId) return Response.json({ detail: "Workflow not found" }, { status: 404 });
  if (!["awaiting_document", "running"].includes(workflow.status)) return Response.json({ detail: "Workflow is not accepting documents" }, { status: 409 });
  const id = crypto.randomUUID();
  const storagePrefix = `patients/${identity.patientId}/workflows/${workflow.id}/uploads/${id}`;
  const totalChunks = Math.ceil(sizeBytes / UPLOAD_CHUNK_SIZE);
  await db.insert(uploadSessions).values({
    id,
    workflowRunId: workflow.id,
    patientId: identity.patientId,
    originalName: filename,
    contentType,
    sizeBytes,
    chunkSize: UPLOAD_CHUNK_SIZE,
    totalChunks,
    storagePrefix,
    status: "uploading",
    documentType: null,
  });
  await writeAudit({
    workflowId: workflow.id,
    role: identity.role,
    action: "document.upload.started",
    entityType: "upload_session",
    entityId: id,
    metadata: {
      filename,
      content_type: contentType,
      size_bytes: sizeBytes,
      total_chunks: totalChunks,
      expected_document_type: body.declared_type,
      classification_deferred: true,
      storage: "private-r2",
    },
  });
  return Response.json({ id, chunk_size: UPLOAD_CHUNK_SIZE, total_chunks: totalChunks, status: "uploading" }, { status: 201 });
}
