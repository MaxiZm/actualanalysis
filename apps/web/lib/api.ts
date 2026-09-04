import { NextResponse } from "next/server";

import { DATA_STATUS, dataEnvelope, type DataStatus } from "./data";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export const API_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
} as const;

function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "anonymous";
}

function consumeRateLimit(request: Request) {
  const now = Date.now();
  const identifier = clientIdentifier(request);
  const existing = rateBuckets.get(identifier);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + RATE_WINDOW_MS }
    : existing;

  bucket.count += 1;
  rateBuckets.set(identifier, bucket);

  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(key);
    }
  }

  return {
    allowed: bucket.count <= RATE_LIMIT,
    headers: {
      "X-RateLimit-Limit": String(RATE_LIMIT),
      "X-RateLimit-Remaining": String(Math.max(0, RATE_LIMIT - bucket.count)),
      "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1_000)),
      "X-RateLimit-Policy": `${RATE_LIMIT};w=${RATE_WINDOW_MS / 1_000}`,
    },
  };
}

interface JsonOptions {
  status?: number;
  headers?: Record<string, string>;
  dataStatus?: DataStatus;
}

export function fixtureJson<T>(data: T, init?: JsonOptions) {
  return NextResponse.json(dataEnvelope(data, init?.dataStatus ?? DATA_STATUS), {
    status: init?.status ?? 200,
    headers: { ...API_HEADERS, ...init?.headers },
  });
}

export function rateLimitedFixtureJson<T>(request: Request, data: T, init?: JsonOptions) {
  const rate = consumeRateLimit(request);
  if (!rate.allowed) {
    return fixtureJson(
      {
        error: "Rate limit reached.",
        instruction: "Wait until the reset time before requesting this fixture API again.",
      },
      {
        status: 429,
        headers: { ...rate.headers, "Retry-After": String(RATE_WINDOW_MS / 1_000) },
        ...(init?.dataStatus ? { dataStatus: init.dataStatus } : {}),
      },
    );
  }
  return fixtureJson(data, { ...init, headers: rate.headers });
}

export function rateLimitedResponse(
  request: Request,
  body: BodyInit | null,
  init: JsonOptions,
) {
  const rate = consumeRateLimit(request);
  if (!rate.allowed) {
    return fixtureJson(
      {
        error: "Rate limit reached.",
        instruction: "Wait until the reset time before requesting this API again.",
      },
      {
        status: 429,
        headers: { ...rate.headers, "Retry-After": String(RATE_WINDOW_MS / 1_000) },
        ...(init.dataStatus ? { dataStatus: init.dataStatus } : {}),
      },
    );
  }
  return new NextResponse(body, {
    status: init.status ?? 200,
    headers: { ...API_HEADERS, ...rate.headers, ...init.headers },
  });
}

export function optionsResponse() {
  return new NextResponse(null, { status: 204, headers: API_HEADERS });
}
