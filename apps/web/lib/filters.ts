import type { IndexKind, ModelRecord } from "./data";

export interface ExplorerFilters {
  index: IndexKind;
  organizations: string[];
  openWeights: boolean;
  reasoning: string;
  sizeClass: string;
  modality: string;
  release: string;
  maxPrice: number | null;
  priceBasis: "blended" | "input" | "output";
  provisional: boolean;
  benchmarks: string[];
  highlight: string[];
}

export const DEFAULT_FILTERS: ExplorerFilters = {
  index: "mixed",
  organizations: [],
  openWeights: false,
  reasoning: "all",
  sizeClass: "all",
  modality: "all",
  release: "all",
  maxPrice: null,
  priceBasis: "blended",
  provisional: true,
  benchmarks: [],
  highlight: [],
};

export function parseFilters(params: URLSearchParams): ExplorerFilters {
  const candidate = params.get("index");
  const index = candidate === "agentic" || candidate === "chat" ? candidate : "mixed";
  const maxPriceValue = Number(params.get("maxPrice"));
  return {
    index,
    organizations: params.getAll("org").filter(Boolean),
    openWeights: params.get("weights") === "open",
    reasoning: params.get("reasoning") || "all",
    sizeClass: params.get("size") || "all",
    modality: params.get("modality") || "all",
    release: params.get("release") || "all",
    maxPrice: Number.isFinite(maxPriceValue) && maxPriceValue > 0 ? maxPriceValue : null,
    priceBasis: params.get("price") === "input" || params.get("price") === "output" ? params.get("price") as "input" | "output" : "blended",
    provisional: true,
    benchmarks: params.getAll("benchmark").filter(Boolean),
    highlight: params.getAll("highlight").filter(Boolean).slice(0, 8),
  };
}

export function serializeFilters(filters: ExplorerFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.index !== "mixed") params.set("index", filters.index);
  for (const org of filters.organizations) params.append("org", org);
  if (filters.openWeights) params.set("weights", "open");
  if (filters.reasoning !== "all") params.set("reasoning", filters.reasoning);
  if (filters.sizeClass !== "all") params.set("size", filters.sizeClass);
  if (filters.modality !== "all") params.set("modality", filters.modality);
  if (filters.release !== "all") params.set("release", filters.release);
  if (filters.maxPrice !== null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.priceBasis !== "blended") params.set("price", filters.priceBasis);
  for (const benchmark of filters.benchmarks) params.append("benchmark", benchmark);
  for (const slug of filters.highlight.slice(0, 8)) params.append("highlight", slug);
  return params;
}

export function matchesFilters(model: ModelRecord, filters: ExplorerFilters, price: number | null): boolean {
  const cutoff = filters.release === "all" ? null : Date.parse(`${filters.release}-01-01T00:00:00Z`);
  return (!filters.organizations.length || filters.organizations.includes(model.organization))
    && (!filters.openWeights || model.openWeights)
    && (filters.reasoning === "all" || model.reasoning === filters.reasoning)
    && (filters.sizeClass === "all" || model.sizeClass === filters.sizeClass)
    && (filters.modality === "all" || model.modality === filters.modality)
    && (cutoff === null || (model.releasedOn !== null && Date.parse(model.releasedOn) >= cutoff))
    && (filters.maxPrice === null || (price !== null && price <= filters.maxPrice));
}
