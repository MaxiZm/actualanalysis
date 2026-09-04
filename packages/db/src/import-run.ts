import { readFile } from "node:fs/promises";
import { createDatabase } from "./client.js";
import { persistRun } from "./persist-run.js";
import { RunArtifactSchema } from "./run-artifact.js";

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Usage: npm run import-run --workspace @actualanalysis/db -- <run.json>");
  const artifact = RunArtifactSchema.parse(JSON.parse(await readFile(filename, "utf8")));
  const { db, close } = createDatabase();
  try {
    const id = await persistRun(db, artifact);
    process.stdout.write(`${id}\n`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
