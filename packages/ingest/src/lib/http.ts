import type { AdapterContext } from "../types.js";

export class HttpError extends Error {
  constructor(public readonly url: string, public readonly status: number, statusText: string) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpError";
  }
}

export async function fetchText(context: AdapterContext, url: string, init: RequestInit = {}): Promise<string> {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json, text/csv;q=0.9, text/plain;q=0.8, text/html;q=0.7");
  if (!headers.has("user-agent")) headers.set("user-agent", "ActualAnalysis/0.1 (+https://github.com/actualanalysis)");
  const response = await context.fetch(url, {
    ...init,
    headers,
    ...(context.signal ? { signal: context.signal } : {}),
  });
  if (!response.ok) throw new HttpError(url, response.status, response.statusText);
  return response.text();
}

export async function fetchJson(context: AdapterContext, url: string, init: RequestInit = {}): Promise<unknown> {
  const text = await fetchText(context, url, init);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

