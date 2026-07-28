import { accountByCredentials } from "../../_accounts";
import { enforceRateLimit } from "../../_rate_limit";
import { deleteLegacyDemoUploads } from "../../_uploads";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const rateLimit = await enforceRateLimit(
    request,
    "authentication-login",
    10,
    60,
    body.email?.trim().toLowerCase(),
  );
  if (rateLimit) return rateLimit;
  const account = accountByCredentials(body.email || "", body.password || "");
  if (account) {
    const retiredUploadsDeleted = account.role === "reviewer"
      ? await deleteLegacyDemoUploads()
      : 0;
    return Response.json({
      access_token: account.token,
      token_type: "bearer",
      role: account.role,
      name: account.name,
      account_id: account.id,
      title: account.title,
      department_scope: account.departmentScope,
      retired_uploads_deleted: retiredUploadsDeleted,
    });
  }
  return Response.json({ detail: "Invalid email or password" }, { status: 401 });
}
