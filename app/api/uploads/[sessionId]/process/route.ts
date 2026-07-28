import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { documents, uploadSessions, workflows } from "../../../../../db/schema";
import { appendTimeline, appendToolTraces, callMcpTool } from "../../../_agentic";
import { classifyDocument } from "../../../_uploads";
import { identityFromRequest, unauthorized, writeAudit } from "../../../_lib";

function statusPayload(session: {
  id: string;
  status: string;
  flagsJson: string;
  documentType: string | null;
  checksum: string | null;
}) {
  const progress: Record<string, number> = {
    queued: 55,
    security_scanning: 68,
    classifying: 80,
    requirement_check: 90,
    accepted: 100,
    quarantined: 100,
    mismatch: 100,
  };
  const messages: Record<string, string> = {
    queued: "Stored privately; waiting for the restricted validation worker.",
    security_scanning: "Checking type signature, active content, and prompt-injection indicators.",
    classifying: "Classifying document type only; no clinical interpretation is performed.",
    requirement_check: "Mapping the document to the patient and checking outstanding requirements.",
    accepted: "Document accepted, linked, and recorded.",
    quarantined: "Document quarantined for authorized staff review.",
    mismatch: "The uploaded document does not match the outstanding RAG/MCP requirement.",
  };
  const flags = JSON.parse(session.flagsJson) as string[];
  const expected = flags
    .filter((flag) => flag.startsWith("expected_document:"))
    .map((flag) => flag.replace("expected_document:", ""));
  const mismatchMessage = session.status === "mismatch"
    ? `Document type mismatch: ${session.documentType || "UNRECOGNIZED"} was received, but this workflow requires ${expected.join(", ") || "a different document"}. Upload the required document.`
    : undefined;
  return {
    id: session.id,
    status: session.status,
    progress: progress[session.status] || 0,
    message: mismatchMessage || messages[session.status] || "Processing document.",
    flags,
    expected_document_types: expected,
    document_type: session.documentType,
    checksum: session.checksum?.slice(0, 16),
  };
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient") return Response.json({ detail: "Patient role required" }, { status: 403 });
  const role = identity.role;
  const { sessionId } = await context.params;
  const db = getDb();
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId)).limit(1);
  if (!session || session.patientId !== identity.patientId) return Response.json({ detail: "Upload session not found" }, { status: 404 });
  if (["accepted", "quarantined", "mismatch"].includes(session.status)) return Response.json(statusPayload(session));

  let nextStatus = session.status;
  let documentType = session.documentType;
  let flags = JSON.parse(session.flagsJson) as string[];
  if (session.status === "queued") {
    nextStatus = "security_scanning";
    await writeAudit({
      workflowId: session.workflowRunId,
      role,
      action: "document.security_scan.started",
      entityType: "upload_session",
      entityId: session.id,
      metadata: { worker: "restricted-document-worker", content_exposed_to_llm: false },
    });
  } else if (session.status === "security_scanning") {
    if (flags.length) {
      nextStatus = "quarantined";
      await writeAudit({
        workflowId: session.workflowRunId,
        role,
        action: "document.quarantined",
        entityType: "upload_session",
        entityId: session.id,
        metadata: { flags },
      });
      const [workflow] = await db.select().from(workflows).where(eq(workflows.id, session.workflowRunId)).limit(1);
      if (workflow) {
        const state = JSON.parse(workflow.stateJson);
        state.documents = { ...(state.documents || {}), latest_status: "quarantined" };
        state.message = "The uploaded document was quarantined. The appointment remains unchanged and staff review is required.";
        await db.update(workflows).set({ stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() }).where(eq(workflows.id, workflow.id));
      }
    } else {
      nextStatus = "classifying";
    }
  } else if (session.status === "classifying") {
    documentType = classifyDocument(session.originalName);
    nextStatus = "requirement_check";
    await writeAudit({
      workflowId: session.workflowRunId,
      role,
      action: "document.classified",
      entityType: "upload_session",
      entityId: session.id,
      metadata: {
        document_type: documentType,
        classification_source: "restricted-document-metadata-classifier",
        clinical_interpretation: false,
      },
    });
  } else if (session.status === "requirement_check") {
    documentType = documentType || classifyDocument(session.originalName);
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, session.workflowRunId)).limit(1);
    if (!workflow) return Response.json({ detail: "Workflow not found" }, { status: 404 });
    let state = JSON.parse(workflow.stateJson);
    const routing = state.routing as { department_code?: string } | undefined;
    const requirementCall = await callMcpTool("Document Agent", "check_document_requirements", {
      request_text: workflow.requestText,
      department_code: routing?.department_code || "",
    });
    const requirementResult = requirementCall.output as {
      expected?: string[];
      rule_version?: string;
      evidence_refs?: string[];
    };
    const expected = requirementResult.expected || state.documents?.expected || [];
    state = appendToolTraces(state, [requirementCall.trace]);
    state.documents = {
      ...(state.documents || {}),
      expected,
      missing: expected.filter((item: string) => !(state.documents?.received || []).includes(item)),
      rule_version: requirementResult.rule_version,
      evidence_refs: requirementResult.evidence_refs || [],
    };
    await writeAudit({
      workflowId: session.workflowRunId,
      role,
      action: "mcp.tool.called",
      entityType: "tool_invocation",
      entityId: requirementCall.trace.id,
      metadata: {
        agent: requirementCall.trace.agent,
        server: requirementCall.trace.server,
        transport: requirementCall.trace.transport,
        tool: requirementCall.trace.tool,
        status: requirementCall.trace.status,
        document_validation: true,
      },
    });

    if (expected.length > 0 && !expected.includes(documentType)) {
      flags = [
        ...new Set([
          ...flags,
          "document_type_mismatch",
          ...expected.map((item: string) => `expected_document:${item}`),
          `received_document:${documentType}`,
        ]),
      ];
      state.documents = {
        ...state.documents,
        latest_status: "type_mismatch",
        latest_mismatch: {
          received: documentType,
          expected,
          filename: session.originalName,
          action: "upload_required_document",
        },
      };
      state.message = `Document type mismatch: ${documentType} was received, but ${expected.join(", ")} is required. The uploaded file was not counted; upload the required document.`;
      await db.update(workflows).set({
        stateJson: JSON.stringify(state),
        status: "awaiting_document",
        updatedAt: new Date().toISOString(),
      }).where(eq(workflows.id, workflow.id));
      nextStatus = "mismatch";
      await writeAudit({
        workflowId: session.workflowRunId,
        role,
        action: "document.type_mismatch",
        entityType: "upload_session",
        entityId: session.id,
        metadata: {
          received_document_type: documentType,
          expected_document_types: expected,
          evidence_refs: requirementResult.evidence_refs || [],
          counted_toward_requirement: false,
          clinical_interpretation: false,
        },
      });
    } else {
    const [duplicate] = await db.select().from(documents).where(and(eq(documents.patientId, session.patientId), eq(documents.checksum, session.checksum || ""))).limit(1);
    let documentId = duplicate?.id;
    if (!duplicate) {
      const [created] = await db.insert(documents).values({
        workflowRunId: session.workflowRunId,
        patientId: session.patientId,
        documentType,
        originalName: session.originalName,
        contentType: session.contentType,
        checksum: session.checksum || "",
        status: "accepted",
        flagsJson: "[]",
        storageReference: `${session.storagePrefix}/manifest.json`,
        sizeBytes: session.sizeBytes,
        checksumAlgorithm: "sha256-chunk-manifest-v1",
        patientLinkConfidence: 100,
      }).returning();
      documentId = created.id;
    }
    const received: string[] = [...(state.documents?.received || [])];
    if (!received.includes(documentType)) received.push(documentType);
    const expected: string[] = state.documents?.expected || [];
    state.documents = {
      ...state.documents,
      received,
      missing: expected.filter((item) => !received.includes(item)),
      latest_status: duplicate ? "duplicate_linked" : "accepted",
      latest_document_id: documentId,
      storage: "private-r2",
    };
    if (state.documents.missing.length === 0) {
      state = appendTimeline(state, { step: "document_coordination", status: "complete", summary: "Private upload passed security, classification, patient mapping, duplicate, and requirement checks." });
      state.message = "Document requirements are satisfied. Follow-up Agent is preparing administrative reminders.";
    }
    await db.update(workflows).set({
      stateJson: JSON.stringify(state),
      status: state.documents.missing.length === 0 ? "running" : workflow.status,
      updatedAt: new Date().toISOString(),
    }).where(eq(workflows.id, workflow.id));
    nextStatus = "accepted";
    await writeAudit({
      workflowId: session.workflowRunId,
      role,
      action: "document.registered",
      entityType: "document",
      entityId: String(documentId),
      metadata: {
        status: "accepted",
        duplicate: Boolean(duplicate),
        document_type: documentType,
        patient_link_confidence: 1,
        checksum: session.checksum?.slice(0, 16),
        storage: "private-r2",
      },
    });
    }
  }

  await db.update(uploadSessions).set({
    status: nextStatus,
    documentType,
    flagsJson: JSON.stringify(flags),
    updatedAt: new Date().toISOString(),
  }).where(eq(uploadSessions.id, sessionId));
  const [updated] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId)).limit(1);
  return Response.json(statusPayload(updated));
}
