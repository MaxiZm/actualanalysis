import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { parseTabularPayload } from "./helpers.js";
import { rowsToBenchmarkResults } from "./row-results.js";

interface KaggleFeed {
  env: string;
  benchmark: string;
  benchmarkId: string;
}

const FEEDS: KaggleFeed[] = [
  { env: "ACTUALANALYSIS_KAGGLE_SIMPLEQA_URL", benchmark: "SimpleQA Verified", benchmarkId: "simpleqa-verified" },
  { env: "ACTUALANALYSIS_KAGGLE_LIVECODEBENCH_URL", benchmark: "LiveCodeBench v6 / Pro", benchmarkId: "livecodebench-v6-pro" },
  { env: "ACTUALANALYSIS_KAGGLE_SCICODE_URL", benchmark: "SciCode Verified", benchmarkId: "scicode-verified" },
];

const KAGGLE_SOURCE_URL = "https://www.kaggle.com/datasets";

export type KaggleFeedLocations = Readonly<Record<string, string | undefined>>;

async function conventionalLocalFeed(context: AdapterContext, benchmarkId: string): Promise<string | undefined> {
  for (const extension of ["csv", "json", "yaml", "yml"]) {
    const candidate = path.join(context.dataDir, "kaggle", `${benchmarkId}.${extension}`);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported snapshot format.
    }
  }
  return undefined;
}

async function readFeed(context: AdapterContext, location: string): Promise<string> {
  if (/^https?:\/\//i.test(location)) return fetchText(context, location);
  return readFile(location, "utf8");
}

/** Kaggle downloads often require a signed URL; feeds are explicit environment inputs by design. */
export class KaggleAdapter implements IngestAdapter {
  readonly id = "kaggle";
  readonly failSoft = true;

  constructor(private readonly locations: KaggleFeedLocations = {}) {}

  async ingest(context: AdapterContext) {
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];
    for (const feed of FEEDS) {
      const url = this.locations[feed.benchmarkId]
        ?? context.env[feed.env]
        ?? await conventionalLocalFeed(context, feed.benchmarkId);
      if (!url) {
        warnings.push({
          code: "configuration",
          message: `${feed.env} is not set and data/kaggle/${feed.benchmarkId}.{csv,json,yaml,yml} is absent; skipped ${feed.benchmark}`,
        });
        continue;
      }
      try {
        const rows = parseTabularPayload(await readFeed(context, url), url);
        records.push(...rowsToBenchmarkResults(rows, context, {
          benchmark: feed.benchmark,
          benchmarkId: feed.benchmarkId,
          sourceId: "kaggle",
          sourceUrl: /^https?:\/\//i.test(url) ? url : KAGGLE_SOURCE_URL,
          provenance: "independent",
        }));
      } catch (error) {
        warnings.push({ code: "fetch_failed", message: error instanceof Error ? error.message : String(error), url });
      }
    }
    return output(this.id, context, records, warnings);
  }
}
