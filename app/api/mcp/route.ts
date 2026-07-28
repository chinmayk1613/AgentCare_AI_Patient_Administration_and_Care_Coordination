import { dispatchMcpRequest } from "../_agentic";
import { roleFromRequest, unauthorized } from "../_lib";

export async function POST(request: Request) {
  const role = roleFromRequest(request);
  if (!role) return unauthorized();
  const body = await request.json() as {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
  };
  return Response.json(await dispatchMcpRequest(body));
}
