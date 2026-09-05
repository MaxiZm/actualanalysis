import { harmonizeObservationLineages } from "./lib/lineage.js";
import { arenaNamedEffort } from "./lib/reported-effort.js";
import type { Model, Registry, SourceProtocol } from "@actualanalysis/shared";
import { RawResultSchema, type RawBenchmarkResult, type RawResult } from "./types.js";

type JsonRecord = Record<string, unknown>;

interface RowSelector {
  sourceId: string;
  benchmarkId: string;
  sourceUrl: string;
  modelId: string;
  config: JsonRecord;
  metadata: JsonRecord;
}

interface EffortRule extends RowSelector {
  id: string;
  target: "default";
  sourceTier?: string;
  fixedTier?: true;
  evidenceUrls: readonly string[];
}

interface ExclusionRule extends RowSelector {
  id: string;
  reason: string;
  evidenceUrls: readonly string[];
}

interface CohortRule {
  id: string;
  sourceId: string;
  benchmarkId: string;
  sourceUrl: string;
  config?: JsonRecord;
  fields: Partial<Pick<RawBenchmarkResult, "harness" | "harness_class" | "tool_policy">>;
  evidenceUrls: readonly string[];
}

const SCALE_HLE_URL = "https://labs.scale.com/leaderboard/humanitys_last_exam";
const ARC_URL = "https://arcprize.org/leaderboard";

/**
 * These declarations deliberately identify an upstream row, not merely a model.
 * A source rename, changed configuration, or different snapshot therefore fails
 * closed instead of silently inheriting an ACI profile.
 */
const EFFORT_RULES: readonly EffortRule[] = [
  {
    id: "scale-hle-gpt-4.1-fixed-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "gpt-4.1",
    config: {}, metadata: { reported_model_name: "GPT-4.1" }, target: "default", fixedTier: true,
    evidenceUrls: [SCALE_HLE_URL, "https://developers.openai.com/api/docs/models/gpt-4.1"],
  },
  {
    id: "scale-hle-gpt-4o-2024-11-20-fixed-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "gpt-4o-2024-11-20",
    config: {}, metadata: { reported_model_name: "GPT-4o (November 2024)" }, target: "default", fixedTier: true,
    evidenceUrls: [SCALE_HLE_URL, "https://developers.openai.com/api/docs/models/gpt-4o"],
  },
  {
    id: "scale-hle-o3-medium-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "o3",
    config: { evaluation_profile: "medium" }, metadata: { reported_model_name: "o3 (medium) (April 2025)" },
    target: "default", sourceTier: "medium",
    evidenceUrls: [SCALE_HLE_URL, "https://developers.openai.com/api/docs/models/o3", "https://platform.openai.com/docs/api-reference/responses/create"],
  },
  {
    id: "scale-hle-o4-mini-medium-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "o4-mini",
    config: { evaluation_profile: "medium" }, metadata: { reported_model_name: "o4-mini (medium) (April 2025)" },
    target: "default", sourceTier: "medium",
    evidenceUrls: [SCALE_HLE_URL, "https://developers.openai.com/api/docs/models/o4-mini", "https://platform.openai.com/docs/api-reference/responses/create"],
  },
  {
    id: "scale-hle-claude-3.5-sonnet-fixed-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "claude-3.5-sonnet-20241022",
    config: {}, metadata: { reported_model_name: "Claude 3.5 Sonnet (October 2024)" }, target: "default", fixedTier: true,
    evidenceUrls: [SCALE_HLE_URL, "https://platform.claude.com/docs/en/about-claude/model-deprecations"],
  },
  {
    id: "arc-v2-claude-3.7-standard-default",
    sourceId: "arcprize", benchmarkId: "arc-agi-2-semi-private", sourceUrl: ARC_URL, modelId: "claude-3.7-sonnet",
    config: { arc_model_id: "Claude 3.7", model_group: null, model_type: "Base LLM", evaluation_profile: null, provider_adapter: false, data_subset: "v2_Semi_Private" },
    metadata: { model_release_date: "2025-02-24" }, target: "default", sourceTier: "standard",
    evidenceUrls: [ARC_URL, "https://www.anthropic.com/news/claude-3-7-sonnet", "https://platform.claude.com/docs/en/about-claude/model-deprecations"],
  },
  {
    id: "scale-hle-claude-opus-4.1-standard-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "claude-opus-4.1",
    config: {}, metadata: { reported_model_name: "claude-opus-4-1-20250805" }, target: "default", sourceTier: "standard",
    evidenceUrls: [SCALE_HLE_URL, "https://www.anthropic.com/news/claude-opus-4-1"],
  },
  {
    id: "scale-hle-llama-4-maverick-fixed-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "llama-4-maverick",
    config: {}, metadata: { reported_model_name: "Llama 4 Maverick" }, target: "default", fixedTier: true,
    evidenceUrls: [SCALE_HLE_URL, "https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct"],
  },
  {
    id: "scale-hle-claude-sonnet-4-standard-default",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "claude-sonnet-4",
    config: {}, metadata: { reported_model_name: "Claude Sonnet 4" }, target: "default", sourceTier: "standard",
    evidenceUrls: [SCALE_HLE_URL, "https://platform.claude.com/docs/en/about-claude/model-deprecations", "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"],
  },
  {
    id: "arc-v2-qwen3-235b-a22b-2507-fixed-non-thinking",
    sourceId: "arcprize", benchmarkId: "arc-agi-2-semi-private", sourceUrl: ARC_URL, modelId: "qwen3-235b-a22b-2507",
    config: { arc_model_id: "qwen3-235b-a22b-instruct-2507", model_group: null, model_type: "Base LLM", evaluation_profile: null, provider_adapter: false, data_subset: "v2_Semi_Private" },
    metadata: { reported_display_name: "Qwen3-235b-a22b Instruct (25/07)", model_release_date: "2025-07-25" },
    target: "default", fixedTier: true,
    evidenceUrls: [ARC_URL, "https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507"],
  },
];

const EXCLUSION_RULES: readonly ExclusionRule[] = [
  {
    id: "scale-hle-gemini-2.0-flash-thinking-snapshot-ambiguous",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "gemini-2.0-flash-thinking",
    config: {}, metadata: { reported_model_name: "Gemini 2.0 Flash Thinking (January 2025)" },
    reason: "The registry identity omits the provider snapshot suffix and conflicts with its January source label; selecting exp-1219 or exp-01-21 would be a guess.",
    evidenceUrls: [SCALE_HLE_URL, "https://ai.google.dev/gemini-api/docs/changelog"],
  },
  {
    id: "scale-hle-gemini-2.5-flash-preview-not-stable",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "gemini-2.5-flash",
    config: {}, metadata: { reported_model_name: "Gemini 2.5 Flash (April 2025)" },
    reason: "The source row is the April preview, while the registry system metadata identifies the unqualified stable model that became GA in June.",
    evidenceUrls: [SCALE_HLE_URL, "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash"],
  },
  {
    id: "scale-hle-gemini-2.5-pro-preview-not-stable",
    sourceId: "scale", benchmarkId: "hle-no-tools", sourceUrl: SCALE_HLE_URL, modelId: "gemini-2.5-pro",
    config: {}, metadata: { reported_model_name: "gemini-2.5-pro-preview-06-05" },
    reason: "The source row names preview-06-05, not the stable gemini-2.5-pro snapshot in the model registry.",
    evidenceUrls: [SCALE_HLE_URL, "https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro"],
  },
  {
    id: "arc-v2-deepseek-v3.2-mode-unspecified",
    sourceId: "arcprize", benchmarkId: "arc-agi-2-semi-private", sourceUrl: ARC_URL, modelId: "deepseek-v3.2",
    config: { arc_model_id: "deepseek-v3.2", model_group: null, model_type: "Base LLM", evaluation_profile: null, provider_adapter: false, data_subset: "v2_Semi_Private" },
    metadata: { model_release_date: "2025-12-01" },
    reason: "The source row does not identify deepseek-chat (non-thinking) versus deepseek-reasoner (thinking), so the grouped registry model cannot be assigned to std or max.",
    evidenceUrls: [ARC_URL, "https://api-docs.deepseek.com/updates/"],
  },
];

const COHORT_RULES: readonly CohortRule[] = [
  {
    id: "scale-hle-no-tools",
    sourceId: "scale",
    benchmarkId: "hle-no-tools",
    sourceUrl: SCALE_HLE_URL,
    fields: { harness: "Scale Labs HLE leaderboard", harness_class: "common", tool_policy: "none" },
    evidenceUrls: [SCALE_HLE_URL, "https://github.com/centerforaisafety/hle"],
  },
  {
    id: "arc-v2-standard-harness",
    sourceId: "arcprize",
    benchmarkId: "arc-agi-2-semi-private",
    sourceUrl: ARC_URL,
    config: { provider_adapter: false },
    fields: { harness: "ARC Prize standard harness", harness_class: "common" },
    evidenceUrls: [ARC_URL, "https://github.com/arcprize/arc-agi-benchmarking"],
  },
];

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, " ");
}

function contains(actual: JsonRecord, expected: JsonRecord): boolean {
  return Object.entries(expected).every(([key, expectedValue]) => {
    const actualValue = actual[key];
    if (expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)) {
      return Boolean(actualValue && typeof actualValue === "object" && !Array.isArray(actualValue)
        && contains(actualValue as JsonRecord, expectedValue as JsonRecord));
    }
    return Object.is(actualValue, expectedValue);
  });
}

function exactlyMatches(actual: JsonRecord, expected: JsonRecord): boolean {
  return Object.keys(actual).length === Object.keys(expected).length
    && contains(actual, expected)
    && contains(expected, actual);
}

function matches(record: RawBenchmarkResult, selector: RowSelector): boolean {
  return record.source_id === selector.sourceId
    && record.benchmark_id === selector.benchmarkId
    && record.source_url === selector.sourceUrl
    && record.model_id === selector.modelId
    && exactlyMatches(record.config, selector.config)
    && contains(record.metadata, selector.metadata);
}

function cohortMatches(record: RawBenchmarkResult, rule: CohortRule): boolean {
  return record.source_id === rule.sourceId
    && record.benchmark_id === rule.benchmarkId
    && record.source_url === rule.sourceUrl
    && (!rule.config || contains(record.config, rule.config));
}

function protocolMatches(record: RawBenchmarkResult, protocol: SourceProtocol): boolean {
  if (!record.benchmark_id || !protocol.benchmark_ids.includes(record.benchmark_id)) return false;
  if (protocol.model_ids && (!record.model_id || !protocol.model_ids.includes(record.model_id))) return false;
  if (protocol.valid_from && record.observed_on < protocol.valid_from) return false;
  if (protocol.valid_to && record.observed_on > protocol.valid_to) return false;
  return !protocol.config_match || contains(record.config, protocol.config_match as JsonRecord);
}

function protocolEffort(protocol: SourceProtocol, model: Model | undefined): string | undefined {
  if (protocol.effort_tier) return protocol.effort_tier;
  if (protocol.effort_tier_rule === "provider_default") return model?.default_effort_tier;
  if (protocol.effort_tier_rule === "highest_exposed") return model?.max_effort_tier ?? model?.default_effort_tier;
  return undefined;
}

function resolveEffort(rule: EffortRule, model: Model | undefined): { effortTier?: string; reason?: string } {
  if (!model?.default_effort_tier) return { reason: "Registry default_effort_tier is missing; source metadata alone cannot define the ACI std profile." };
  if (rule.sourceTier && normalized(rule.sourceTier) !== normalized(model.default_effort_tier)) {
    return { reason: `Source tier ${rule.sourceTier} does not equal registry default tier ${model.default_effort_tier}.` };
  }
  if (rule.fixedTier) {
    const order = model.effort_tier_order ?? [];
    if ((model.max_effort_tier && normalized(model.max_effort_tier) !== normalized(model.default_effort_tier)) || order.length !== 1
      || normalized(order[0] ?? "") !== normalized(model.default_effort_tier)) {
      return { reason: "Fixed-effort assignment requires a one-element effort_tier_order and, when declared, a max tier equal to the default." };
    }
  }
  return { effortTier: model.default_effort_tier };
}

/** Add only source-specific observation metadata proven by an exact declarative rule. */
export function annotateObservationMetadata(records: readonly RawResult[], registry: Pick<Registry, "models"> & Partial<Pick<Registry, "sources">>): RawResult[] {
  const models = new Map(registry.models.map((model) => [model.id, model]));
  const sources = new Map((registry.sources ?? []).map((source) => [source.id, source]));
  return harmonizeObservationLineages(records.map((record): RawResult => {
    if (record.record_type !== "benchmark_result") return record;
    const matchingProtocols = sources.get(record.source_id)?.protocols?.filter((protocol) => protocolMatches(record, protocol)) ?? [];
    const protocol = matchingProtocols.length === 1 ? matchingProtocols[0] : undefined;
    const cohort = COHORT_RULES.find((rule) => cohortMatches(record, rule));
    const effortRule = EFFORT_RULES.find((rule) => matches(record, rule));
    const exclusionRule = EXCLUSION_RULES.find((rule) => matches(record, rule));

    const evidenceUrls = new Set<string>([record.source_url]);
    const appliedFields: string[] = [];
    const additions: Partial<RawBenchmarkResult> = {};
    const declaredEffort = ["reasoning_effort", "evaluation_profile", "effort_tier"]
      .map((key) => record.config[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (!record.effort_tier && declaredEffort) {
      additions.effort_tier = declaredEffort.trim();
      appliedFields.push("effort_tier");
    }
    const namedEffort = arenaNamedEffort(record, record.model_id ? models.get(record.model_id) : undefined);
    if (!record.effort_tier && !additions.effort_tier && namedEffort) {
      additions.effort_tier = namedEffort;
      appliedFields.push("effort_tier");
    }
    let versionInferred = record.version_inferred === true;
    if (protocol) {
      evidenceUrls.add(protocol.methodology_url);
      const benchmarkId = record.benchmark_id;
      const model = record.model_id ? models.get(record.model_id) : undefined;
      const inherited: Partial<RawBenchmarkResult> = {
        protocol_id: protocol.protocol_id,
        origin_provenance: protocol.provenance,
        host_source: record.source_id,
        ...(protocolEffort(protocol, model) ? { effort_tier: protocolEffort(protocol, model) } : {}),
        ...(protocol.harness_id ? { harness: protocol.harness_id } : {}),
        ...(protocol.harness_class ? { harness_class: protocol.harness_class } : {}),
        ...(protocol.tool_policy ? { tool_policy: protocol.tool_policy } : {}),
        ...(benchmarkId && protocol.benchmark_versions[benchmarkId] ? { benchmark_version: protocol.benchmark_versions[benchmarkId] } : {}),
        ...(benchmarkId && protocol.grader_versions[benchmarkId] ? { grader_version: protocol.grader_versions[benchmarkId] } : {}),
      };
      for (const [field, value] of Object.entries(inherited)) {
        if (record[field as keyof RawBenchmarkResult] === undefined && additions[field as keyof RawBenchmarkResult] === undefined && value !== undefined) {
          (additions as JsonRecord)[field] = value;
          appliedFields.push(field);
          if (field === "benchmark_version" || field === "grader_version") versionInferred = true;
        }
      }
    }
    if (cohort) {
      cohort.evidenceUrls.forEach((url) => evidenceUrls.add(url));
      for (const [field, value] of Object.entries(cohort.fields)) {
        if (record[field as keyof RawBenchmarkResult] === undefined && additions[field as keyof RawBenchmarkResult] === undefined) {
          (additions as JsonRecord)[field] = value;
          appliedFields.push(field);
        }
      }
    }

    let reason: string | undefined;
    let effortRuleId: string | undefined = namedEffort ? "lmarena-explicit-model-effort-suffix" : undefined;
    if (effortRule) {
      effortRuleId = effortRule.id;
      effortRule.evidenceUrls.forEach((url) => evidenceUrls.add(url));
      const resolution = resolveEffort(effortRule, record.model_id ? models.get(record.model_id) : undefined);
      if (resolution.effortTier) {
        if (record.effort_tier && normalized(record.effort_tier) !== normalized(resolution.effortTier)) {
          reason = `Existing source effort tier ${record.effort_tier} conflicts with resolved registry tier ${resolution.effortTier}.`;
        } else if (!record.effort_tier) {
          additions.effort_tier = resolution.effortTier;
          appliedFields.push("effort_tier");
        }
      } else {
        reason = resolution.reason;
      }
    } else if (exclusionRule) {
      effortRuleId = exclusionRule.id;
      reason = exclusionRule.reason;
      exclusionRule.evidenceUrls.forEach((url) => evidenceUrls.add(url));
    } else if (!record.effort_tier && !additions.effort_tier) {
      reason = "No source protocol or exact row rule resolves this observation's effort tier.";
    }

    if (exclusionRule) {
      additions.config = {
        ...record.config,
        aci_fit_eligible: false,
        aci_exclusion_reason: exclusionRule.reason,
      };
    }

    const resolved = { ...record, ...additions };
    const metadataIncomplete = matchingProtocols.length !== 1
      || versionInferred
      || !resolved.benchmark_version
      || !resolved.grader_version
      || !resolved.effort_tier
      || !resolved.harness
      || !resolved.harness_class
      || resolved.harness_class === "unknown"
      || !resolved.tool_policy;

    const annotation = {
      version: "aci-1.2.1",
      status: exclusionRule ? "excluded" : metadataIncomplete ? "metadata_incomplete" : "annotated",
      protocol_status: matchingProtocols.length === 1 ? "applied" : matchingProtocols.length > 1 ? "ambiguous" : "missing",
      ...(protocol ? { protocol_id: protocol.protocol_id } : {}),
      ...(cohort ? { cohort_rule_id: cohort.id } : {}),
      ...(effortRuleId ? { effort_rule_id: effortRuleId } : {}),
      applied_fields: appliedFields,
      ...(reason ? { exclusion_reason: reason } : {}),
      evidence_urls: [...evidenceUrls],
    };
    return RawResultSchema.parse({
      ...resolved,
      ...(versionInferred ? { version_inferred: true } : {}),
      metadata_incomplete: metadataIncomplete,
      metadata: { ...record.metadata, aci12_observation_annotation: annotation },
    });
  }));
}
