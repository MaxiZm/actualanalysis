import "server-only";

import {
  OPENROUTER_MODELS_API_URL,
  matchOpenRouterCatalog,
  parseOpenRouterCatalog,
  type OpenRouterCatalogRow,
  type OpenRouterDisplayOverlay,
  type OpenRouterMatchTarget,
} from "../openrouter-display";

const OPENROUTER_TIMEOUT_MS = 5_000;
const OPENROUTER_REVALIDATE_SECONDS = 60 * 60;

type CatalogAvailability =
  | {
      status: "available";
      fetchedAt: string;
      rejectedRows: number;
      rows: OpenRouterCatalogRow[];
      unavailableReason: null;
    }
  | {
      status: "unavailable";
      fetchedAt: null;
      rejectedRows: number;
      rows: [];
      unavailableReason: string;
    };

/** Exported for deterministic failure-path tests; pages use the cached loader. */
export async function fetchOpenRouterCatalogUncached(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<CatalogAvailability> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetcher(OPENROUTER_MODELS_API_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: OPENROUTER_REVALIDATE_SECONDS },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        fetchedAt: null,
        rejectedRows: 0,
        rows: [],
        unavailableReason: `OpenRouter models endpoint returned HTTP ${response.status}.`,
      };
    }

    const parsed = parseOpenRouterCatalog(await response.json());
    if (!parsed.ok) {
      return {
        status: "unavailable",
        fetchedAt: null,
        rejectedRows: parsed.rejectedRows,
        rows: [],
        unavailableReason: `OpenRouter catalog response was unavailable (${parsed.error}).`,
      };
    }

    return {
      status: "available",
      fetchedAt: now().toISOString(),
      rejectedRows: parsed.rejectedRows,
      rows: parsed.rows,
      unavailableReason: null,
    };
  } catch {
    return {
      status: "unavailable",
      fetchedAt: null,
      rejectedRows: 0,
      rows: [],
      unavailableReason: "OpenRouter models request failed or timed out.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds a plain, display-only overlay. No live value is copied into SiteData,
 * snapshot assets, or API response records.
 */
export async function loadOpenRouterDisplay(
  targets: readonly OpenRouterMatchTarget[],
): Promise<OpenRouterDisplayOverlay> {
  let catalog: CatalogAvailability;
  try {
    // Next's patched fetch caches a successful catalog response for one hour.
    // Network failures remain retryable instead of being memoized as data.
    catalog = await fetchOpenRouterCatalogUncached();
  } catch {
    catalog = {
      status: "unavailable",
      fetchedAt: null,
      rejectedRows: 0,
      rows: [],
      unavailableReason: "OpenRouter display loading is temporarily unavailable.",
    };
  }
  if (catalog.status === "unavailable") {
    return {
      status: "unavailable",
      fetchedAt: null,
      rejectedRows: catalog.rejectedRows,
      matches: {},
      unmatchedModelIds: [...new Set(targets.map((target) => target.modelId))],
      ambiguousAliases: [],
      unavailableReason: catalog.unavailableReason,
    };
  }

  return {
    status: "available",
    fetchedAt: catalog.fetchedAt,
    rejectedRows: catalog.rejectedRows,
    ...matchOpenRouterCatalog(catalog.rows, targets),
    unavailableReason: null,
  };
}
