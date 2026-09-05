import { createHash } from "node:crypto";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { isRow, parseCsv } from "../lib/tabular.js";
import { benchmarkResult, dateOnly } from "./helpers.js";

export const LIVEBENCH_VERSION = "2026-06-25";
export const LIVEBENCH_TABLE_URL = "https://livebench.ai/table_2026_06_25.csv";
export const LIVEBENCH_CATEGORIES_URL = "https://livebench.ai/categories_2026_06_25.json";

function modelIdentity(raw: string): { model: string; effort?: string; thinking?: string } {
  const suffix = /-(xhigh|max|high|medium|low|minimal|none)(-effort)?$/i.exec(raw);
  // Max is part of names such as Qwen3.8 Max and ox-alpha-max. Only parse an
  // explicit -effort suffix or the source's known API families with tier labels.
  const explicit = suffix && (suffix[2] || /^(gpt-|gemini-|muse-spark-|inkling-)/.test(raw));
  let model = explicit ? raw.slice(0, suffix.index) : raw;
  const thinking = /-thinking-(auto|\d+k)$/i.exec(model);
  if (thinking) model = model.slice(0, thinking.index);
  // Preserve dated API aliases: registry resolution, rather than guessed model
  // defaults, decides which actual release they identify.
  return { model, ...(explicit ? { effort: suffix[1]!.toLowerCase() } : {}), ...(thinking ? { thinking: thinking[1] } : {}) };
}

function categoriesFrom(payload: unknown): Record<string, string[]> {
  if (!isRow(payload) || Object.keys(payload).length === 0) throw new Error("LiveBench category definitions are empty or invalid");
  const result: Record<string, string[]> = {};
  const assigned = new Set<string>();
  for (const [category, tasks] of Object.entries(payload)) {
    if (!Array.isArray(tasks) || tasks.length === 0 || !tasks.every((t): t is string => typeof t === "string" && t.length > 0)) {
      throw new Error(`LiveBench category ${category} has no valid task list`);
    }
    for (const task of tasks) {
      if (assigned.has(task)) throw new Error(`LiveBench task ${task} occurs in multiple categories`);
      assigned.add(task);
    }
    result[category] = tasks;
  }
  return result;
}

/** Native equal-category composite; heterogeneous partial credit remains observed-only. */
export class LiveBenchAdapter implements IngestAdapter {
  readonly id = "livebench";
  readonly failSoft = true;

  constructor(private readonly options: { tableUrl?: string; categoriesUrl?: string; version?: string } = {}) {}

  async ingest(context: AdapterContext) {
    const tableUrl = this.options.tableUrl ?? LIVEBENCH_TABLE_URL;
    const categoriesUrl = this.options.categoriesUrl ?? LIVEBENCH_CATEGORIES_URL;
    const version = this.options.version ?? LIVEBENCH_VERSION;
    const [table, categoryText] = await Promise.all([fetchText(context, tableUrl), fetchText(context, categoriesUrl)]);
    const categories = categoriesFrom(JSON.parse(categoryText));
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];
    const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
    const tableHash = sha256(table), categoryHash = sha256(categoryText);
    for (const row of parseCsv(table)) {
      const rawModel = row.model?.trim();
      if (!rawModel) continue;
      const means: Record<string, number> = {};
      let invalid = false;
      for (const [category, tasks] of Object.entries(categories)) {
        const scores = tasks.map((task) => row[task]?.trim()).map((s) => s ? Number(s) : NaN);
        if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) { invalid = true; break; }
        means[category] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      }
      if (invalid) {
        warnings.push({ code: "partial", message: `Skipped incomplete or invalid LiveBench category data for ${rawModel}`, url: tableUrl });
        continue;
      }
      const values = Object.values(means);
      const score = values.reduce((sum, mean) => sum + mean, 0) / values.length;
      const identity = modelIdentity(rawModel);
      records.push(benchmarkResult({
        model: identity.model,
        benchmark: "LiveBench 2026", benchmark_id: "livebench-2026", source_id: "livebench",
        benchmark_version: version, evaluation_run_id: `${version}:${rawModel}`,
        lineage_id: `livebench:${version}:${rawModel}`, metadata_incomplete: true,
        score, score_unit: "percent", ...(identity.effort ? { effort_tier: identity.effort } : {}),
        harness: "LiveBench category-specific evaluation", harness_class: "common",
        observed_on: dateOnly(context.now()), source_url: tableUrl, provenance: "independent", origin_provenance: "independent", host_source: "livebench",
        config: { aci_fit_eligible: false, source_model_configuration: rawModel, ...(identity.effort ? { reasoning_effort: identity.effort } : {}), ...(identity.thinking ? { thinking_budget: identity.thinking } : {}) },
        metadata: {
          observed_only: true, source_model_id: rawModel, category_means: means,
          source_subtask_scores: Object.fromEntries(Object.values(categories).flat().map((task) => [task, Number(row[task])])),
          categories_url: categoriesUrl, table_sha256: tableHash, categories_sha256: categoryHash,
          displayed_score: Number(score.toFixed(2)),
          score_definition: "Arithmetic mean of seven category means (or the exact categories in the pinned release); each category is the unweighted mean of its subtasks.",
          exclusion_reason: "Heterogeneous category composite with partial-credit metrics and different tool policies. No binary denominator, repeat count, or sampling uncertainty inferred.",
        },
      }));
    }
    return output(this.id, context, records, warnings);
  }
}
