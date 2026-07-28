export async function GET() {
  return Response.json({
    status: "ok",
    backend: "AgentCare hosted D1 workflow adapter",
    authoritative_backend: "Python/FastAPI in the repository",
    persistence: "Cloudflare D1",
  });
}

