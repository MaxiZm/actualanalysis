import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CliOptions {
  sources: string[];
  dataDir: string;
  dryRun: boolean;
  json: boolean;
  unmappedFile: string;
  outputFile?: string;
}

export function cliUsage(adapterIds: readonly string[]): string {
  return [
    "Usage: npm run ingest -- <source|all> [--dry-run] [--json] [--data-dir PATH] [--unmapped PATH] [--output PATH]",
    `Sources: ${adapterIds.join(", ")}`,
  ].join("\n");
}

export function parseCliArgs(argv: readonly string[], adapterIds: readonly string[]): CliOptions | null {
  const defaultDataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
  const available = new Set(adapterIds);
  const sources: string[] = [];
  let dataDir = defaultDataDir;
  let dryRun = false;
  let json = false;
  let unmappedFile: string | undefined;
  let outputFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--json") json = true;
    else if (argument === "--data-dir" || argument === "--unmapped" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      if (argument === "--data-dir") dataDir = path.resolve(value);
      else if (argument === "--unmapped") unmappedFile = path.resolve(value);
      else outputFile = path.resolve(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") return null;
    else if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}\n${cliUsage(adapterIds)}`);
    else sources.push(argument);
  }
  if (sources.length === 0 && !dryRun) throw new Error(cliUsage(adapterIds));
  const expanded = sources.length === 0 || sources.includes("all") ? [...adapterIds] : sources;
  for (const source of expanded) if (!available.has(source)) throw new Error(`Unknown source ${source}\n${cliUsage(adapterIds)}`);
  return {
    sources: [...new Set(expanded)],
    dataDir,
    dryRun,
    json,
    unmappedFile: unmappedFile ?? path.join(dataDir, "manual", "unmapped.yaml"),
    ...(outputFile ? { outputFile } : {}),
  };
}
