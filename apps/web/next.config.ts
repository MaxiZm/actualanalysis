import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

const projectDirectory =
  process.env.ACTUALANALYSIS_PROJECT_DIR ?? path.resolve(appDirectory, "../..");
const exporting = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const nextConfig: NextConfig = {
  ...(exporting
    ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
    : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  serverExternalPackages: ["rehype-mathjax", "mathjax-full"],
  transpilePackages: ["@actualanalysis/shared", "@actualanalysis/scoring"],
  outputFileTracingRoot: projectDirectory,
  outputFileTracingIncludes: {
    "/*": [
      "../../data/snapshots/**/*",
      "../../data/manual/speed-aa.yaml",
      "../../data/manual/cost-aa.yaml",
      "../../data/manual/benchmarks-aa.yaml",
    ],
    "/methodology": [
      "../../docs/methodology.md",
      "../../data/index-config.yaml",
    ],
    "/changelog": ["../../docs/changelog.md"],
    "/api/v1/**/*": ["../../data/snapshots/**/*"],
    "/models/**/*": ["../../data/snapshots/**/*"],
    "/benchmarks/**/*": ["../../data/snapshots/**/*"],
    "/": ["../../data/snapshots/**/*"],
  },
};

export default nextConfig;
