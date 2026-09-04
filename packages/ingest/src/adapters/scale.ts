import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { booleanAt, numberAt, stringAt } from "../lib/tabular.js";
import { benchmarkResult, dateOnly } from "./helpers.js";

interface ScaleFeed {
  url: string;
  env: string;
  benchmark: string;
  benchmarkId: string;
  nItems: number;
}

const FEEDS: readonly ScaleFeed[] = [
  {
    url: "https://labs.scale.com/leaderboard/swe_bench_pro_public",
    env: "ACTUALANALYSIS_SCALE_SWE_PRO_URL",
    benchmark: "SWE-bench Pro public",
    benchmarkId: "swe-bench-pro-public",
    nItems: 731,
  },
  {
    url: "https://labs.scale.com/leaderboard/humanitys_last_exam",
    env: "ACTUALANALYSIS_SCALE_HLE_URL",
    benchmark: "Humanity's Last Exam (no tools)",
    benchmarkId: "hle-no-tools",
    nItems: 2_500,
  },
];

function scaleModelIdentity(value: string): { model: string; evaluationProfile?: string } {
  let cleaned = value.trim().replace(/\*+$/, "").trim();
  const machineProfile = /-(thinking(?:-max)?|non-think|reasoner)$/i.exec(cleaned);
  if (machineProfile?.[1]) {
    cleaned = cleaned.slice(0, machineProfile.index);
    return { model: cleaned, evaluationProfile: machineProfile[1] };
  }
  const datedProfile = /^(.+?)\s+\((none|minimal|low|medium|high|xhigh|max)\)\s+\([A-Za-z]+\s+\d{4}\)$/i.exec(cleaned);
  if (datedProfile?.[1] && datedProfile[2]) {
    return { model: datedProfile[1].trim(), evaluationProfile: datedProfile[2] };
  }
  const suffix = /\s+\(([^)]+)\)$/.exec(cleaned);
  if (!suffix || !/(?:thinking|reasoning|x?high|medium|low|minimal|max)/i.test(suffix[1] ?? "")) {
    return { model: cleaned };
  }
  const evaluationProfile = suffix[1]?.trim();
  return {
    model: cleaned.slice(0, suffix.index).trim(),
    ...(evaluationProfile ? { evaluationProfile } : {}),
  };
}

function observedOn(value: string | undefined, context: AdapterContext): string {
  const candidate = value?.slice(0, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : dateOnly(context.now());
}

function hleCountCompatibility(score: number, ci95HalfWidth: number | undefined): { compatible: boolean; reason?: string } {
  const scoreGridCompatible = Math.abs(score * 25 - Math.round(score * 25)) < 1e-6;
  const expectedHalfWidth = Math.round(1.96 * Math.sqrt(score * (100 - score) / 2_500) * 100) / 100;
  const intervalCompatible = ci95HalfWidth === undefined || Math.abs(ci95HalfWidth - expectedHalfWidth) < 0.011;
  if (scoreGridCompatible && intervalCompatible) return { compatible: true };
  return {
    compatible: false,
    reason: `Scale HLE aggregate is inconsistent with n=2500 (score=${score}, reported_ci95_half_width=${ci95HalfWidth ?? "missing"}, expected_ci95_half_width=${expectedHalfWidth}).`,
  };
}

/** Scale renders typed leaderboard entries in its Next.js Flight payload. */
export class ScaleAdapter implements IngestAdapter {
  readonly id = "scale";
  readonly failSoft = true;

  async ingest(context: AdapterContext) {
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];

    for (const feed of FEEDS) {
      const url = context.env[feed.env] ?? feed.url;
      try {
        const html = await fetchText(context, url);
        const rows = extractNextFlightArrayRows(html, "entries");
        const before = records.length;
        for (const row of rows) {
          if (booleanAt(row, ["deprecated"]) === true) continue;
          const rawModel = stringAt(row, ["model"]);
          const score = numberAt(row, ["score"]);
          if (!rawModel || score === undefined) continue;
          const identity = scaleModelIdentity(rawModel);
          const ci95HalfWidth = numberAt(row, ["confidenceInterval_upper", "confidence_interval"]);
          const contamination = stringAt(row, ["contaminationMessage"]);
          const hleCompatibility = feed.benchmarkId === "hle-no-tools"
            ? hleCountCompatibility(score, ci95HalfWidth)
            : { compatible: true };
          records.push(benchmarkResult({
            model: identity.model,
            benchmark: feed.benchmark,
            benchmark_id: feed.benchmarkId,
            source_id: "scale",
            score,
            score_unit: "percent",
            ...(ci95HalfWidth !== undefined && ci95HalfWidth >= 0 ? { se: ci95HalfWidth / 1.96 } : {}),
            ...(hleCompatibility.compatible ? { n_items: feed.nItems } : {}),
            ...(identity.evaluationProfile ? { effort_tier: identity.evaluationProfile } : {}),
            config: {
              ...(identity.evaluationProfile ? { evaluation_profile: identity.evaluationProfile } : {}),
              ...(!hleCompatibility.compatible ? {
                aci_fit_eligible: false,
                aci_exclusion_reason: hleCompatibility.reason,
              } : {}),
            },
            harness: "Scale Labs leaderboard",
            observed_on: observedOn(stringAt(row, ["createdAt", "updatedAt"]), context),
            source_url: url,
            provenance: "independent",
            metadata: {
              reported_model_name: rawModel,
              company: stringAt(row, ["company"]) ?? null,
              rank: numberAt(row, ["rank"]) ?? null,
              reported_ci95_half_width: ci95HalfWidth ?? null,
              contamination_warning: contamination ?? null,
              exact_benchmark_revision_provided: false,
              aggregate_count_compatible: hleCompatibility.compatible,
            },
          }));
        }
        if (records.length === before) warnings.push({
          code: "parse_failed",
          message: `${feed.benchmark} page contained no typed Flight leaderboard entries`,
          url,
        });
      } catch (error) {
        warnings.push({ code: "fetch_failed", message: error instanceof Error ? error.message : String(error), url });
      }
    }

    return output(this.id, context, records, warnings);
  }
}
