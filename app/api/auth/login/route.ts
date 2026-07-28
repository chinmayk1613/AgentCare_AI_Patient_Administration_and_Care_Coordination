import { accountByCredentials } from "../../_accounts";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const account = accountByCredentials(body.email || "", body.password || "");
  if (account) return Response.json({
    access_token: account.token,
    token_type: "bearer",
    role: account.role,
    name: account.name,
    account_id: account.id,
    title: account.title,
    department_scope: account.departmentScope,
  });
  return Response.json({ detail: "Invalid email or password" }, { status: 401 });
}
