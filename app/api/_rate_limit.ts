import { env } from "cloudflare:workers";

type D1Result<T> = {
  results?: T[];
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  all: <T>() => Promise<D1Result<T>>;
};

type D1Database = {
  prepare: (query: string) => D1Statement;
};

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Rate-limit storage is unavailable");
  return db;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function requestAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unavailable"
  );
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  subject?: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const windowStartedAt = Math.floor(now / windowSeconds) * windowSeconds;
  const identifier = subject || requestAddress(request);
  const rateKey = await digest(`${scope}:${identifier}`);
  const db = database();

  await db
    .prepare(
      `INSERT INTO api_rate_limits (rate_key, window_started_at, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(rate_key) DO UPDATE SET
         window_started_at = CASE
           WHEN api_rate_limits.window_started_at < excluded.window_started_at
           THEN excluded.window_started_at
           ELSE api_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN api_rate_limits.window_started_at < excluded.window_started_at
           THEN 1
           ELSE api_rate_limits.request_count + 1
         END,
         updated_at = excluded.updated_at`,
    )
    .bind(rateKey, windowStartedAt, new Date().toISOString())
    .run();

  const result = await db
    .prepare(
      "SELECT request_count FROM api_rate_limits WHERE rate_key = ? LIMIT 1",
    )
    .bind(rateKey)
    .all<{ request_count: number }>();
  const count = Number(result.results?.[0]?.request_count || 0);
  if (count <= limit) return null;

  const retryAfter = Math.max(1, windowStartedAt + windowSeconds - now);
  return Response.json(
    {
      detail: "Request rate limit exceeded. Please wait before trying again.",
      retry_after_seconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
