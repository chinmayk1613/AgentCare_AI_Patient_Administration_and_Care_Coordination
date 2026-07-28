import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { uploadChunks, uploadSessions } from "../../../../../../db/schema";
import { inspectChunk, privateUploads, sha256 } from "../../../../_uploads";
import { identityFromRequest, unauthorized } from "../../../../_lib";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string; chunkNumber: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient") return Response.json({ detail: "Patient role required" }, { status: 403 });
  const { sessionId, chunkNumber: rawChunkNumber } = await context.params;
  const chunkNumber = Number(rawChunkNumber);
  const db = getDb();
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId)).limit(1);
  if (!session || session.patientId !== identity.patientId) return Response.json({ detail: "Upload session not found" }, { status: 404 });
  if (session.status !== "uploading" || !Number.isInteger(chunkNumber) || chunkNumber < 0 || chunkNumber >= session.totalChunks) {
    return Response.json({ detail: "Invalid upload chunk" }, { status: 409 });
  }
  const [existing] = await db.select().from(uploadChunks).where(and(eq(uploadChunks.sessionId, sessionId), eq(uploadChunks.chunkNumber, chunkNumber))).limit(1);
  if (existing) return Response.json({ chunk_number: chunkNumber, checksum: existing.checksum, duplicate: true });
  const buffer = await request.arrayBuffer();
  const expectedMax = chunkNumber === session.totalChunks - 1 ? session.chunkSize : session.chunkSize;
  if (buffer.byteLength < 1 || buffer.byteLength > expectedMax) return Response.json({ detail: "Chunk exceeds the allowed size" }, { status: 413 });
  const bytes = new Uint8Array(buffer);
  const checksum = await sha256(bytes);
  const flags = inspectChunk(bytes, session.contentType, chunkNumber);
  const objectKey = `${session.storagePrefix}/chunks/${String(chunkNumber).padStart(5, "0")}`;
  await privateUploads().put(objectKey, bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { session_id: sessionId, chunk_number: String(chunkNumber), checksum },
  });
  await db.insert(uploadChunks).values({
    sessionId,
    chunkNumber,
    objectKey,
    sizeBytes: buffer.byteLength,
    checksum,
    flagsJson: JSON.stringify(flags),
  });
  await db.update(uploadSessions).set({
    receivedChunks: session.receivedChunks + 1,
    updatedAt: new Date().toISOString(),
  }).where(eq(uploadSessions.id, sessionId));
  return Response.json({ chunk_number: chunkNumber, checksum, flags, duplicate: false });
}
