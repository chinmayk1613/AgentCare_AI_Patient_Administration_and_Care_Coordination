import { identityFromRequest, unauthorized, writeAudit } from "../../_lib";
import { enforceRateLimit } from "../../_rate_limit";
import { deleteLegacyDemoUploads } from "../../_uploads";

export async function POST(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (identity.role !== "reviewer") {
    return Response.json({ detail: "Reviewer role required" }, { status: 403 });
  }
  const rateLimit = await enforceRateLimit(
    request,
    "legacy-demo-cleanup",
    2,
    3600,
    identity.id,
  );
  if (rateLimit) return rateLimit;

  const deletedObjects = await deleteLegacyDemoUploads();
  await writeAudit({
    role: identity.role,
    action: "maintenance.legacy_demo_uploads.deleted",
    entityType: "private_upload_storage",
    entityId: "legacy-demo-prefixes",
    metadata: {
      deleted_objects: deletedObjects,
      scope: "six retired synthetic patient prefixes",
    },
  });
  return Response.json({
    status: "complete",
    deleted_objects: deletedObjects,
    scope: "retired synthetic patient uploads only",
  });
}
