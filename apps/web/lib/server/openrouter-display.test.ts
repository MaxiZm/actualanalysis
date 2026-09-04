import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OPENROUTER_MODELS_API_URL } from "../openrouter-display";
import { fetchOpenRouterCatalogUncached } from "./openrouter-display";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("server-only OpenRouter display loader", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests the public catalog with an abort signal and keeps partial valid data", async () => {
    const fetcher = vi.fn(async () => response({
      data: [
        {
          id: "openai/example",
          pricing: { prompt: "0.000001", completion: "0.000004" },
          context_length: 128_000,
          top_provider: { max_completion_tokens: 16_000 },
        },
        { id: "malformed" },
      ],
    })) as unknown as typeof fetch;

    const result = await fetchOpenRouterCatalogUncached(
      fetcher,
      () => new Date("2026-09-04T12:00:00.000Z"),
    );

    expect(fetcher).toHaveBeenCalledWith(OPENROUTER_MODELS_API_URL, expect.objectContaining({
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal),
    }));
    expect(result).toMatchObject({
      status: "available",
      fetchedAt: "2026-09-04T12:00:00.000Z",
      rejectedRows: 1,
      rows: [{ openRouterId: "openai/example", inputPerMillion: 1, outputPerMillion: 4 }],
    });
  });

  it("fails soft without throwing for network, HTTP, JSON, and schema failures", async () => {
    const failures: Array<typeof fetch> = [
      vi.fn(async () => { throw new Error("socket details must not leak"); }) as typeof fetch,
      vi.fn(async () => response({}, 503)) as typeof fetch,
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => response({ data: [{ id: "invalid" }] })) as typeof fetch,
    ];

    for (const fetcher of failures) {
      const result = await fetchOpenRouterCatalogUncached(fetcher);
      expect(result.status).toBe("unavailable");
      expect(result.rows).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("socket details");
    }
  });

  it("aborts a stalled request after five seconds and returns unavailable", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }) as typeof fetch;

      const pending = fetchOpenRouterCatalogUncached(fetcher);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toMatchObject({ status: "unavailable", rows: [] });
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
