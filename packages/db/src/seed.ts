import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { createDatabase } from "./client.js";
import { seedRegistry } from "./seed-data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

async function main() {
  const registry = await loadRegistry(path.join(root, "data"), { includeManualResults: true });
  const { db, close } = createDatabase();

  try {
    const summary = await seedRegistry(db, registry);
    process.stdout.write(
      `Seeded ${summary.models} models, ${summary.benchmarks} benchmarks, ${summary.sources} sources, ${summary.manualResults} results, and ${summary.speed} isolated speed observations.\n`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
