import type { IngestAdapter } from "../types.js";
import { ArcPrizeAdapter } from "./arcprize.js";
import { EpochAdapter } from "./epoch.js";
import { KaggleAdapter } from "./kaggle.js";
import { LmArenaAdapter } from "./lmarena.js";
import { ManualAdapter } from "./manual.js";
import { MathArenaAdapter } from "./matharena.js";
import { McpMarkAdapter } from "./mcpmark.js";
import { MetrAdapter } from "./metr.js";
import { OpenRouterAdapter } from "./openrouter.js";
import { ScaleAdapter } from "./scale.js";
import { SweRebenchAdapter } from "./swe-rebench.js";
import { TauBenchAdapter } from "./taubench.js";
import { TbenchAdapter } from "./tbench.js";

export function createAdapters(): Map<string, IngestAdapter> {
  const adapters: IngestAdapter[] = [
    new EpochAdapter(),
    new OpenRouterAdapter(),
    new SweRebenchAdapter(),
    new LmArenaAdapter(),
    new KaggleAdapter(),
    new MathArenaAdapter(),
    new MetrAdapter(),
    new TbenchAdapter(),
    new ScaleAdapter(),
    new ArcPrizeAdapter(),
    new TauBenchAdapter(),
    new McpMarkAdapter(),
    new ManualAdapter(),
  ];
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}

