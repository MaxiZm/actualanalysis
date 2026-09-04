export const OPENROUTER_MODELS_API_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";
export const OPENROUTER_TERMS_URL = "https://openrouter.ai/terms";

/**
 * Live OpenRouter economics are deliberately a UI-only data shape. They must
 * not be copied into ModelRecord.pricing, a published snapshot, or a public API
 * response.
 */
export interface OpenRouterCatalogRow {
  openRouterId: string;
  provider: "OpenRouter";
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number | null;
  contextWindow: number | null;
  maxOutput: number | null;
  sourceUrl: typeof OPENROUTER_MODELS_API_URL;
  displayOnly: true;
  redistributable: false;
}

export type OpenRouterCatalogParseError =
  | "invalid-envelope"
  | "empty-catalog"
  | "no-valid-rows";

export type OpenRouterCatalogParseResult =
  | {
      ok: true;
      rows: OpenRouterCatalogRow[];
      rejectedRows: number;
    }
  | {
      ok: false;
      error: OpenRouterCatalogParseError;
      rows: [];
      rejectedRows: number;
    };

export interface OpenRouterMatchTarget {
  modelId: string;
  /** Explicit OpenRouter ids from the model registry. */
  aliases: readonly string[];
}

export interface OpenRouterMatchResult {
  matches: Record<string, OpenRouterCatalogRow>;
  unmatchedModelIds: string[];
  /** Lower-cased ids that could not be selected uniquely. */
  ambiguousAliases: string[];
}

interface OpenRouterDisplayOverlayBase extends OpenRouterMatchResult {
  fetchedAt: string | null;
  rejectedRows: number;
}

export type OpenRouterDisplayOverlay =
  | (OpenRouterDisplayOverlayBase & {
      status: "available";
      fetchedAt: string;
      unavailableReason: null;
    })
  | (OpenRouterDisplayOverlayBase & {
      status: "unavailable";
      fetchedAt: null;
      unavailableReason: string;
    });

export interface ExplicitVendorLimitOverride {
  contextWindow?: number;
  maxOutput?: number;
  sourceUrl: string;
}

export interface PublicSnapshotLimitFallback {
  contextWindow: number | null;
  maxOutput: number | null;
  sourceUrl?: string | null;
}

export type DisplayLimitSource = "vendor" | "openrouter" | "snapshot" | "unavailable";

export interface ResolvedDisplayLimits {
  contextWindow: number | null;
  maxOutput: number | null;
  contextWindowSource: DisplayLimitSource;
  maxOutputSource: DisplayLimitSource;
  contextWindowSourceUrl: string | null;
  maxOutputSourceUrl: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NONNEGATIVE_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function perTokenPriceToPerMillion(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  if (!NONNEGATIVE_DECIMAL.test(value)) return null;

  const perToken = Number(value);
  const perMillion = perToken * 1_000_000;
  return Number.isFinite(perToken) && perToken >= 0 && Number.isFinite(perMillion)
    ? perMillion
    : null;
}

function optionalPositiveInteger(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

function parseCatalogRow(value: unknown): OpenRouterCatalogRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || value.id.length === 0
    || value.id !== value.id.trim()
    || !isRecord(value.pricing)
  ) {
    return null;
  }

  const inputPerMillion = perTokenPriceToPerMillion(value.pricing.prompt);
  const outputPerMillion = perTokenPriceToPerMillion(value.pricing.completion);
  if (inputPerMillion === null || outputPerMillion === null) return null;

  let cacheReadPerMillion: number | null = null;
  if (value.pricing.input_cache_read !== undefined && value.pricing.input_cache_read !== null) {
    cacheReadPerMillion = perTokenPriceToPerMillion(value.pricing.input_cache_read);
    if (cacheReadPerMillion === null) return null;
  }

  const contextWindow = optionalPositiveInteger(value.context_length);
  if (contextWindow === undefined) return null;

  let maxOutput: number | null = null;
  if (value.top_provider !== undefined && value.top_provider !== null) {
    if (!isRecord(value.top_provider)) return null;
    const parsedMaxOutput = optionalPositiveInteger(value.top_provider.max_completion_tokens);
    if (parsedMaxOutput === undefined) return null;
    maxOutput = parsedMaxOutput;
  }

  return {
    openRouterId: value.id,
    provider: "OpenRouter",
    inputPerMillion,
    outputPerMillion,
    cacheReadPerMillion,
    contextWindow,
    maxOutput,
    sourceUrl: OPENROUTER_MODELS_API_URL,
    displayOnly: true,
    redistributable: false,
  };
}

/** Parse an OpenRouter models response while isolating malformed rows. */
export function parseOpenRouterCatalog(raw: unknown): OpenRouterCatalogParseResult {
  if (!isRecord(raw) || !Array.isArray(raw.data)) {
    return { ok: false, error: "invalid-envelope", rows: [], rejectedRows: 0 };
  }
  if (raw.data.length === 0) {
    return { ok: false, error: "empty-catalog", rows: [], rejectedRows: 0 };
  }

  const rows: OpenRouterCatalogRow[] = [];
  let rejectedRows = 0;
  for (const value of raw.data) {
    const row = parseCatalogRow(value);
    if (row) rows.push(row);
    else rejectedRows += 1;
  }

  if (rows.length === 0) {
    return { ok: false, error: "no-valid-rows", rows: [], rejectedRows };
  }
  return { ok: true, rows, rejectedRows };
}

function exactCaseInsensitiveKey(value: string): string {
  return value.toLowerCase();
}

/** Conservative second-pass matcher for versioned gateway identifiers. */
export function normalizedOpenRouterKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^/]+\//u, "")
    .replace(/:(?:batch|free)$/u, "")
    .replace(/\([^)]*\)/gu, "")
    .replace(/[\s._]+/gu, "-")
    .replace(/-(?:preview|experimental|exp)$/u, "")
    .replace(/-v\d+$/u, "")
    .replace(/-\d+b-a\d+b$/u, "")
    .replace(/-(?:20\d{2}[-]?\d{2}(?:[-]?\d{2})?|\d{4})$/u, "")
    .replace(/-+/gu, "-");
}

/**
 * Match exact aliases first, then a conservative normalized form. Collisions,
 * duplicate catalog ids, and models with multiple candidates fail closed.
 */
export function matchOpenRouterCatalog(
  rows: readonly OpenRouterCatalogRow[],
  targets: readonly OpenRouterMatchTarget[],
): OpenRouterMatchResult {
  const targetOrder: string[] = [];
  const aliasesByTarget = new Map<string, Set<string>>();
  const ownersByAlias = new Map<string, Set<string>>();

  for (const target of targets) {
    if (!aliasesByTarget.has(target.modelId)) {
      targetOrder.push(target.modelId);
      aliasesByTarget.set(target.modelId, new Set());
    }
    const targetAliases = aliasesByTarget.get(target.modelId);
    if (!targetAliases) continue;

    for (const alias of [target.modelId, ...target.aliases]) {
      if (typeof alias !== "string" || alias.length === 0) continue;
      const key = exactCaseInsensitiveKey(alias);
      targetAliases.add(key);
      const owners = ownersByAlias.get(key) ?? new Set<string>();
      owners.add(target.modelId);
      ownersByAlias.set(key, owners);
    }
  }

  const catalogById = new Map<string, OpenRouterCatalogRow[]>();
  for (const row of rows) {
    const key = exactCaseInsensitiveKey(row.openRouterId);
    const candidates = catalogById.get(key) ?? [];
    candidates.push(row);
    catalogById.set(key, candidates);
  }

  const ambiguous = new Set<string>();
  for (const [alias, owners] of ownersByAlias) {
    if (owners.size > 1) ambiguous.add(alias);
    if ((catalogById.get(alias)?.length ?? 0) > 1) ambiguous.add(alias);
  }

  const matchedEntries: [string, OpenRouterCatalogRow][] = [];
  const matchedModels = new Set<string>();
  const unmatchedModelIds: string[] = [];

  for (const modelId of targetOrder) {
    const candidates = new Map<string, OpenRouterCatalogRow>();
    for (const alias of aliasesByTarget.get(modelId) ?? []) {
      if (ambiguous.has(alias) || ownersByAlias.get(alias)?.size !== 1) continue;
      const rowsForAlias = catalogById.get(alias);
      if (rowsForAlias?.length === 1 && rowsForAlias[0]) {
        candidates.set(exactCaseInsensitiveKey(rowsForAlias[0].openRouterId), rowsForAlias[0]);
      }
    }

    if (candidates.size === 1) {
      const candidate = candidates.values().next().value as OpenRouterCatalogRow | undefined;
      if (candidate) {
        matchedEntries.push([modelId, candidate]);
        matchedModels.add(modelId);
      }
    } else {
      if (candidates.size > 1) {
        for (const alias of aliasesByTarget.get(modelId) ?? []) {
          if (catalogById.has(alias)) ambiguous.add(alias);
        }
      }
    }
  }

  const normalizedOwners = new Map<string, Set<string>>();
  for (const modelId of targetOrder) {
    if (matchedModels.has(modelId)) continue;
    for (const alias of aliasesByTarget.get(modelId) ?? []) {
      const key = normalizedOpenRouterKey(alias);
      const owners = normalizedOwners.get(key) ?? new Set<string>();
      owners.add(modelId);
      normalizedOwners.set(key, owners);
    }
  }
  const normalizedCatalog = new Map<string, OpenRouterCatalogRow[]>();
  for (const row of rows) {
    const key = normalizedOpenRouterKey(row.openRouterId);
    const candidates = normalizedCatalog.get(key) ?? [];
    candidates.push(row);
    normalizedCatalog.set(key, candidates);
  }
  for (const modelId of targetOrder) {
    if (matchedModels.has(modelId)) continue;
    const candidates = new Map<string, OpenRouterCatalogRow>();
    const vendorlessRows = rows.filter((row) => exactCaseInsensitiveKey(row.openRouterId.replace(/^[^/]+\//u, "").replace(/:(?:batch|free)$/u, "")) === exactCaseInsensitiveKey(modelId));
    const vendorlessPreferred = vendorlessRows.filter((row) => !/:(?:batch|free)$/u.test(row.openRouterId));
    const vendorlessSelectable = vendorlessPreferred.length === 1 ? vendorlessPreferred : vendorlessRows;
    if (vendorlessSelectable.length === 1 && vendorlessSelectable[0]) {
      matchedEntries.push([modelId, vendorlessSelectable[0]]);
      matchedModels.add(modelId);
      continue;
    }
    const aliasTailCandidates = new Map<string, OpenRouterCatalogRow>();
    for (const alias of aliasesByTarget.get(modelId) ?? []) {
      for (const row of rows) {
        const tail = row.openRouterId.replace(/^[^/]+\//u, "").replace(/:(?:batch|free)$/u, "");
        if (exactCaseInsensitiveKey(tail) === exactCaseInsensitiveKey(alias) && !/:(?:batch|free)$/u.test(row.openRouterId)) {
          aliasTailCandidates.set(row.openRouterId, row);
        }
      }
    }
    if (aliasTailCandidates.size === 1) {
      const candidate = aliasTailCandidates.values().next().value;
      if (candidate) {
        matchedEntries.push([modelId, candidate]);
        matchedModels.add(modelId);
        continue;
      }
    }
    const modelKey = normalizedOpenRouterKey(modelId);
    const modelRows = normalizedCatalog.get(modelKey) ?? [];
    const preferredModelRows = modelRows.filter((row) => !/:(?:batch|free)$/u.test(row.openRouterId) && !/(?:-exp|-preview)$/u.test(row.openRouterId));
    const directRows = preferredModelRows.length === 1 ? preferredModelRows : modelRows;
    if (directRows.length === 1 && directRows[0] && normalizedOwners.get(modelKey)?.size === 1) {
      candidates.set(directRows[0].openRouterId, directRows[0]);
    }
    if (candidates.size === 1) {
      const candidate = candidates.values().next().value;
      if (candidate) {
        matchedEntries.push([modelId, candidate]);
        matchedModels.add(modelId);
        continue;
      }
    }
    for (const alias of aliasesByTarget.get(modelId) ?? []) {
      const key = normalizedOpenRouterKey(alias);
      if (normalizedOwners.get(key)?.size !== 1) {
        ambiguous.add(key);
        continue;
      }
      const catalogRows = normalizedCatalog.get(key) ?? [];
      const preferredRows = catalogRows.filter((row) => !/:(?:batch|free)$/u.test(row.openRouterId) && !/(?:-exp|-preview)$/u.test(row.openRouterId));
      const selectable = preferredRows.length === 1 ? preferredRows : catalogRows;
      if (selectable.length === 1 && selectable[0]) candidates.set(selectable[0].openRouterId, selectable[0]);
      else if (selectable.length > 1) ambiguous.add(key);
    }
    if (candidates.size === 1) {
      const candidate = candidates.values().next().value;
      if (candidate) {
        matchedEntries.push([modelId, candidate]);
        matchedModels.add(modelId);
      }
    }
  }
  unmatchedModelIds.push(...targetOrder.filter((modelId) => !matchedModels.has(modelId)));

  return {
    matches: Object.fromEntries(matchedEntries),
    unmatchedModelIds,
    ambiguousAliases: [...ambiguous].sort(),
  };
}

export function blendedOpenRouterPrice(
  pricing: Pick<OpenRouterCatalogRow, "inputPerMillion" | "outputPerMillion">,
): number {
  return (pricing.inputPerMillion * 3 + pricing.outputPerMillion) / 4;
}

export function cacheAwareOpenRouterPrice(
  pricing: Pick<OpenRouterCatalogRow, "inputPerMillion" | "outputPerMillion" | "cacheReadPerMillion">,
): number {
  const cacheRead = pricing.cacheReadPerMillion ?? pricing.inputPerMillion;
  return (cacheRead * 7 + pricing.inputPerMillion * 2 + pricing.outputPerMillion) / 10;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveLimit(
  vendorValue: number | null | undefined,
  openRouterValue: number | null | undefined,
  snapshotValue: number | null | undefined,
  vendorSourceUrl: string | null,
  openRouterSourceUrl: string | null,
  snapshotSourceUrl: string | null,
): { value: number | null; source: DisplayLimitSource; sourceUrl: string | null } {
  if (isPositiveFinite(vendorValue)) {
    return { value: vendorValue, source: "vendor", sourceUrl: vendorSourceUrl };
  }
  if (isPositiveFinite(openRouterValue)) {
    return { value: openRouterValue, source: "openrouter", sourceUrl: openRouterSourceUrl };
  }
  if (isPositiveFinite(snapshotValue)) {
    return { value: snapshotValue, source: "snapshot", sourceUrl: snapshotSourceUrl };
  }
  return { value: null, source: "unavailable", sourceUrl: null };
}

/** Resolve each limit independently: explicit vendor value, live value, snapshot fallback. */
export function resolveDisplayLimits({
  vendorOverride,
  openRouter,
  snapshot,
}: {
  vendorOverride?: ExplicitVendorLimitOverride | null;
  openRouter?: Pick<OpenRouterCatalogRow, "contextWindow" | "maxOutput" | "sourceUrl"> | null;
  snapshot: PublicSnapshotLimitFallback;
}): ResolvedDisplayLimits {
  const snapshotSourceUrl = snapshot.sourceUrl ?? null;
  const contextWindow = resolveLimit(
    vendorOverride?.contextWindow,
    openRouter?.contextWindow,
    snapshot.contextWindow,
    vendorOverride?.sourceUrl ?? null,
    openRouter?.sourceUrl ?? null,
    snapshotSourceUrl,
  );
  const maxOutput = resolveLimit(
    vendorOverride?.maxOutput,
    openRouter?.maxOutput,
    snapshot.maxOutput,
    vendorOverride?.sourceUrl ?? null,
    openRouter?.sourceUrl ?? null,
    snapshotSourceUrl,
  );

  return {
    contextWindow: contextWindow.value,
    maxOutput: maxOutput.value,
    contextWindowSource: contextWindow.source,
    maxOutputSource: maxOutput.source,
    contextWindowSourceUrl: contextWindow.sourceUrl,
    maxOutputSourceUrl: maxOutput.sourceUrl,
  };
}
