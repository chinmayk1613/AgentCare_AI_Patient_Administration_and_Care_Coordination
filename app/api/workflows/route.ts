import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { workflows } from "../../../db/schema";
import { appendTimeline } from "../_agentic";
import { identityFromRequest, unauthorized, workflowView, writeAudit } from "../_lib";
import { enforceRateLimit } from "../_rate_limit";

export async function GET(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  const db = getDb();
  const rows = identity.role === "patient"
    ? await db.select().from(workflows).where(eq(workflows.patientId, identity.patientId!)).orderBy(desc(workflows.createdAt)).limit(30)
    : await db.select().from(workflows).orderBy(desc(workflows.createdAt)).limit(50);
  return Response.json(rows.map(workflowView));
}

export async function POST(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "patient" || !identity.patientId) return Response.json({ detail: "Patient role required" }, { status: 403 });
  const rateLimit = await enforceRateLimit(request, "workflow-create", 12, 60, identity.id);
  if (rateLimit) return rateLimit;

  const body = (await request.json()) as {
    request_text?: string;
    idempotency_key?: string;
  };
  const requestText = body.request_text?.trim() || "";
  const idempotencyKey = body.idempotency_key?.trim() || "";
  if (requestText.length < 8 || idempotencyKey.length < 8) {
    return Response.json({ detail: "A valid request and idempotency key are required" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(workflows).where(eq(workflows.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) return Response.json(workflowView(existing));

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const state = appendTimeline(
    {
      tool_traces: [],
      agent_proposals: [],
      agent_harness: {
        status: "ready",
        description: "OpenAI Responses API with fine-tuned-model preference and deterministic policy fallback",
      },
      patient_identity: { id: identity.patientId, name: identity.name },
      patient_resolved: true,
      message: "Patient resolved. Safety Agent is evaluating the administrative boundary.",
    },
    {
      step: "registration",
      status: "complete",
      summary: "Authenticated synthetic patient profile resolved.",
    },
  );

  await db.insert(workflows).values({
    id,
    patientId: identity.patientId,
    requestText,
    intent: null,
    currentStep: "registration",
    status: "running",
    stateJson: JSON.stringify(state),
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit({
    workflowId: id,
    role: identity.role,
    action: "workflow.checkpoint",
    entityType: "workflow",
    entityId: id,
    metadata: { step: "registration", status: "complete", patient_id: identity.patientId },
  });
  const [created] = await db.select().from(workflows).where(eq(workflows.id, id));
  return Response.json(workflowView(created), { status: 202 });
}
