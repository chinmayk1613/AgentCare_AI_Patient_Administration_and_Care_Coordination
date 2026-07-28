import { asc, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { escalations } from "../../../../db/schema";
import { forbidden, roleFromRequest, unauthorized } from "../../_lib";

export async function GET(request: Request) {
  const role = roleFromRequest(request);
  if (!role) return unauthorized();
  if (role !== "reviewer") return forbidden();
  const db = getDb();
  const rows = await db.select().from(escalations).orderBy(asc(escalations.status), desc(escalations.createdAt)).limit(100);
  return Response.json(rows.map((item) => ({
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
  })));
}
