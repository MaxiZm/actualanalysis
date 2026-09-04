#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { stdin, stdout } from "node:process";
import { parse as parseYaml } from "yaml";
import { coerceScoringInput } from "./input.js";
import { runScoring } from "./score.js";

interface CliArguments {
  input: string;
  output?: string;
  pretty: boolean;
  bootstrapIterations?: number;
  kind?: "mixed" | "agentic" | "chat";
  all: boolean;
  eciCompatible: boolean;
}

function usage(): string {
  return `ActualAnalysis scoring engine

Usage:
  npm run score -- score --input payload.yaml [--output run.json]

The payload contains { benchmarks, results, models?, config }. JSON and YAML are
accepted; use --input - to read JSON/YAML from stdin.

Options:
  -i, --input PATH       Input file, or - for stdin
  -o, --output PATH      Write JSON to a file instead of stdout
      --kind KIND        Override mixed, agentic, or chat
      --all              Run all three indexes (requires per-index config)
      --bootstrap N      Override bootstrap iterations (default: 500)
      --eci-compatible   Unweighted, unstandardized squared-loss ordering mode
      --pretty           Pretty-print JSON
  -h, --help             Show this help
`;
}

function parseArguments(argv: string[]): CliArguments | null {
  const args = argv[0] === "score" ? argv.slice(1) : argv;
  let input: string | undefined;
  let output: string | undefined;
  let pretty = false;
  let bootstrapIterations: number | undefined;
  let kind: CliArguments["kind"];
  let all = false;
  let eciCompatible = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") return null;
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (argument === "--eci-compatible") {
      eciCompatible = true;
      continue;
    }
    const next = args[index + 1];
    if (argument === "-i" || argument === "--input") {
      if (next === undefined) throw new Error(`${argument} requires a value`);
      input = next;
      index += 1;
    } else if (argument === "-o" || argument === "--output") {
      if (next === undefined) throw new Error(`${argument} requires a value`);
      output = next;
      index += 1;
    } else if (argument === "--bootstrap") {
      if (next === undefined) throw new Error("--bootstrap requires a value");
      bootstrapIterations = Number(next);
      if (!Number.isInteger(bootstrapIterations) || bootstrapIterations < 1) {
        throw new Error("--bootstrap must be a positive integer");
      }
      index += 1;
    } else if (argument === "--kind") {
      if (next !== "mixed" && next !== "agentic" && next !== "chat") {
        throw new Error("--kind must be mixed, agentic, or chat");
      }
      kind = next;
      index += 1;
    } else if (argument !== undefined && !argument.startsWith("-") && input === undefined) {
      input = argument;
    } else {
      throw new Error(`Unknown argument ${String(argument)}`);
    }
  }
  if (input === undefined) throw new Error("An input path is required");
  if (all && kind !== undefined) throw new Error("--all and --kind cannot be used together");
  return {
    input,
    ...(output === undefined ? {} : { output }),
    pretty,
    ...(bootstrapIterations === undefined ? {} : { bootstrapIterations }),
    ...(kind === undefined ? {} : { kind }),
    all,
    eciCompatible,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args === null) {
    stdout.write(usage());
    return;
  }
  const text = args.input === "-" ? await readStdin() : await readFile(args.input, "utf8");
  const extension = args.input === "-" ? "" : extname(args.input).toLowerCase();
  const value = extension === ".json" ? JSON.parse(text) : parseYaml(text);
  const run = args.all
    ? Object.fromEntries(
        (["mixed", "agentic", "chat"] as const).map((kind) => {
          const input = coerceScoringInput(value, kind);
          if (args.bootstrapIterations !== undefined) input.config.bootstrapIterations = args.bootstrapIterations;
          if (args.eciCompatible) input.config.fitMode = "eci_compatible";
          return [kind, runScoring(input)];
        }),
      )
    : (() => {
        const input = coerceScoringInput(value, args.kind);
        if (args.bootstrapIterations !== undefined) input.config.bootstrapIterations = args.bootstrapIterations;
        if (args.eciCompatible) input.config.fitMode = "eci_compatible";
        return runScoring(input);
      })();
  const output = `${JSON.stringify(run, null, args.pretty ? 2 : undefined)}\n`;
  if (args.output === undefined) stdout.write(output);
  else await writeFile(args.output, output, "utf8");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`scoring: ${message}\n`);
  process.exitCode = 1;
});
