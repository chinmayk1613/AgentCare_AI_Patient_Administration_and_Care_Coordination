import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { documents, workflows } from "../../../../../db/schema";
import { appendTimeline } from "../../../_agentic";
import { identityFromRequest, unauthorized, writeAudit } from "../../../_lib";

const acceptedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);

function classify(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("ecg") || lower.includes("ekg")) return "ECG";
  if (lower.includes("mri") || lower.includes("magnetic")) return "MRI_REPORT";
  if (lower.includes("blood") || lower.includes("lab")) return "LAB_REPORT";
  if (lower.includes("referral")) return "REFERRAL";
  return "OTHER_MEDICAL_RECORD";
}

export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient" || !identity.patientId) return Response.json({ detail: "Patient role required" }, { status: 403 });
  const { workflowId } = await context.params;
  const db = getDb();
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow || workflow.patientId !== identity.patientId) return Response.json({ detail: "Workflow not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ detail: "Document is required" }, { status: 400 });
  if (!acceptedTypes.has(file.type)) return Response.json({ detail: "Unsupported document type" }, { status: 415 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ detail: "Document exceeds size limit" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksumBytes = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(checksumBytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const documentType = classify(file.name);
  let state = JSON.parse(workflow.stateJson);
  const expected: string[] = state.documents?.expected || [];
  if (expected.length && !expected.includes(documentType)) {
    state.documents = {
      ...(state.documents || {}),
      latest_status: "type_mismatch",
      latest_mismatch: { received: documentType, expected, filename: file.name },
    };
    state.message = `Document type mismatch: ${documentType} was received, but ${expected.join(", ")} is required. Upload the required document.`;
    await db.update(workflows).set({
      stateJson: JSON.stringify(state),
      status: "awaiting_document",
      updatedAt: new Date().toISOString(),
    }).where(eq(workflows.id, workflowId));
    await writeAudit({
      workflowId,
      role: identity.role,
      action: "document.type_mismatch",
      entityType: "document_candidate",
      entityId: crypto.randomUUID(),
      metadata: { received_document_type: documentType, expected_document_types: expected, counted_toward_requirement: false },
    });
    return Response.json({
      document_type: documentType,
      status: "mismatch",
      warning: state.message,
      missing: expected,
    }, { status: 422 });
  }

  const [duplicate] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.patientId, identity.patientId), eq(documents.checksum, checksum)))
    .limit(1);
  if (duplicate) {
    return Response.json({
      id: duplicate.id,
      document_type: duplicate.documentType,
      status: duplicate.status,
      flags: JSON.parse(duplicate.flagsJson),
      duplicate: true,
      missing: JSON.parse(workflow.stateJson).documents?.missing || [],
    });
  }

  const textProbe = file.type === "text/plain"
    ? new TextDecoder().decode(bytes.slice(0, 50_000)).toLowerCase()
    : "";
  const suspicious = ["ignore previous instructions", "system prompt", "cancel all appointments", "call this tool"]
    .some((term) => textProbe.includes(term));
  const flags = suspicious ? ["prompt_injection"] : [];
  const status = suspicious ? "quarantined" : "accepted";
  const [created] = await db.insert(documents).values({
    workflowRunId: workflowId,
    patientId: identity.patientId,
    documentType,
    originalName: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120),
    contentType: file.type,
    checksum,
    status,
    flagsJson: JSON.stringify(flags),
  }).returning();

  const received: string[] = [...(state.documents?.received || [])];
  if (status === "accepted" && !received.includes(documentType)) received.push(documentType);
  state.documents = {
    ...state.documents,
    received,
    missing: expected.filter((item) => !received.includes(item)),
    latest_status: status,
  };
  if (status === "accepted" && state.documents.missing.length === 0) {
    state = appendTimeline(
      state,
      { step: "document_coordination", status: "complete", summary: "All requested documents passed registration controls." },
    );
    state.message = "Document requirements are satisfied. Follow-up Agent is preparing administrative reminders.";
  }
  await db.update(workflows).set({
    stateJson: JSON.stringify(state),
    status: status === "accepted" && state.documents.missing.length === 0 ? "running" : workflow.status,
    updatedAt: new Date().toISOString(),
  }).where(eq(workflows.id, workflowId));
  await writeAudit({
    workflowId,
    role: identity.role,
    action: "document.registered",
    entityType: "document",
    entityId: String(created.id),
    metadata: { status, flags, checksum: checksum.slice(0, 12), transport: "document-tool" },
  });
  return Response.json({
    id: created.id,
    document_type: documentType,
    status,
    flags,
    duplicate: false,
    missing: state.documents.missing,
  });
}
