import { getDb } from "../../db";
import { auditEvents } from "../../db/schema";
import { accountByToken, type DemoAccountRole } from "./_accounts";

export type DemoRole = DemoAccountRole;

export type RequestIdentity = {
  id: string;
  patientId?: string;
  name: string;
  email: string;
  role: DemoRole;
  title: string;
  departmentScope?: string;
  permissions: string[];
};

export function identityFromRequest(request: Request): RequestIdentity | null {
  const header = request.headers.get("authorization") || "";
  const account = accountByToken(header.replace(/^Bearer\s+/i, ""));
  if (!account) return null;
  return {
    id: account.id,
    patientId: account.patientId,
    name: account.name,
    email: account.email,
    role: account.role,
    title: account.title,
    departmentScope: account.departmentScope,
    permissions: account.permissions,
  };
}

export function roleFromRequest(request: Request): DemoRole | null {
  return identityFromRequest(request)?.role || null;
}

export function unauthorized(message = "Authentication required") {
  return Response.json({ detail: message }, { status: 401 });
}

export function forbidden(message = "Insufficient role") {
  return Response.json({ detail: message }, { status: 403 });
}

export function workflowView(row: {
  id: string;
  requestText: string;
  intent: string | null;
  currentStep: string;
  status: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
}) {
  const caseNumber = `AC-${row.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  return {
    id: row.id,
    case_number: caseNumber,
    request_text: row.requestText,
    intent: row.intent,
    current_step: row.currentStep,
    status: row.status,
    state: JSON.parse(row.stateJson),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function writeAudit(input: {
  workflowId?: string;
  role: DemoRole;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(auditEvents).values({
    workflowRunId: input.workflowId,
    actorRole: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadataJson: JSON.stringify(input.metadata || {}),
  });
}
