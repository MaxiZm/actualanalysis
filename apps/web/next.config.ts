import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@actualanalysis/shared", "@actualanalysis/scoring"],
  outputFileTracingRoot: path.resolve(appDirectory, "../.."),
  outputFileTracingIncludes: {
    "/methodology": ["../../docs/methodology.md"],
    "/api/v1/**/*": ["../../data/snapshots/**/*"],
    "/models/**/*": ["../../data/snapshots/**/*"],
    "/benchmarks/**/*": ["../../data/snapshots/**/*"],
    "/": ["../../data/snapshots/**/*"]
  }
};

export default nextConfig;
