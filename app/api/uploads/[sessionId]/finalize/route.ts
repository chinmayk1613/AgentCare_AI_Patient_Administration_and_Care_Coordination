import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { uploadChunks, uploadSessions } from "../../../../../db/schema";
import { privateUploads, sha256 } from "../../../_uploads";
import { identityFromRequest, unauthorized, writeAudit } from "../../../_lib";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient") return Response.json({ detail: "Patient role required" }, { status: 403 });
  const { sessionId } = await context.params;
  const db = getDb();
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId)).limit(1);
  if (!session || session.patientId !== identity.patientId) return Response.json({ detail: "Upload session not found" }, { status: 404 });
  const chunks = await db.select().from(uploadChunks).where(eq(uploadChunks.sessionId, sessionId)).orderBy(asc(uploadChunks.chunkNumber));
  if (chunks.length !== session.totalChunks) return Response.json({ detail: `Upload incomplete: ${chunks.length}/${session.totalChunks} chunks` }, { status: 409 });
  const checksum = await sha256(chunks.map((item) => `${item.chunkNumber}:${item.sizeBytes}:${item.checksum}`).join("|"));
  const flags = [...new Set(chunks.flatMap((item) => JSON.parse(item.flagsJson) as string[]))];
  const manifestKey = `${session.storagePrefix}/manifest.json`;
  await privateUploads().put(manifestKey, JSON.stringify({
    version: 1,
    filename: session.originalName,
    content_type: session.contentType,
    size_bytes: session.sizeBytes,
    checksum,
    checksum_algorithm: "sha256-chunk-manifest-v1",
    chunks: chunks.map((item) => ({ number: item.chunkNumber, key: item.objectKey, size_bytes: item.sizeBytes, checksum: item.checksum })),
  }), { httpMetadata: { contentType: "application/json" } });
  await db.update(uploadSessions).set({
    status: "queued",
    checksum,
    flagsJson: JSON.stringify(flags),
    updatedAt: new Date().toISOString(),
  }).where(eq(uploadSessions.id, sessionId));
  await writeAudit({
    workflowId: session.workflowRunId,
    role: identity.role,
    action: "document.upload.completed",
    entityType: "upload_session",
    entityId: sessionId,
    metadata: { chunks: chunks.length, checksum: checksum.slice(0, 16), storage_reference: manifestKey },
  });
  return Response.json({ id: sessionId, status: "queued", progress: 55, checksum: checksum.slice(0, 16) });
}
