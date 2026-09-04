import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mapCommittedSnapshot } from "../apps/web/lib/snapshot-data.js";
import {
  dataEnvelope,
  INDEX_KINDS,
  compareIndexRank,
} from "../apps/web/lib/data.js";
import { toPublicModelDto } from "../apps/web/lib/public-dto.js";
import { SNAPSHOT_ASSETS } from "../apps/web/lib/snapshot-assets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, "work/pages-app");
const output = path.join(root, "work/pages-site");
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/actualanalysis";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? `https://maxizm.github.io${basePath}/`;
if (!/^\/[a-zA-Z0-9._/-]*$/.test(basePath) && basePath !== "")
  throw new Error("Invalid Pages base path");

// Stage a separate export so local server routes and its dev build remain intact.
await rm(stage, { recursive: true, force: true });
await cp(path.join(root, "apps/web"), stage, {
  recursive: true,
  filter: (source) => {
    const relative = path
      .relative(path.join(root, "apps/web"), source)
      .split(path.sep);
    return (
      !relative.some((part) =>
        [".next", "node_modules", "out"].includes(part),
      ) &&
      !(relative[0] === "app" && relative[1] === "api") &&
      !source.endsWith("tsbuildinfo")
    );
  },
});
const config = JSON.parse(
  await readFile(path.join(stage, "tsconfig.json"), "utf8"),
);
config.extends = path.join(root, "tsconfig.base.json");
await writeFile(path.join(stage, "tsconfig.json"), JSON.stringify(config));
// OG metadata handlers are static at export time, like the rest of the site.
await writeFile(
  path.join(stage, "app/opengraph-image.tsx"),
  `${await readFile(path.join(stage, "app/opengraph-image.tsx"), "utf8")}\nexport const dynamic = "force-static";\n`,
);
const env = {
  ...process.env,
  NEXT_PUBLIC_STATIC_EXPORT: "1",
  NEXT_PUBLIC_BASE_PATH: basePath,
  NEXT_PUBLIC_SITE_URL: siteUrl,
  ACTUALANALYSIS_PROJECT_DIR: root,
  ACTUALANALYSIS_DATA_DIR: path.join(root, "data"),
  ACTUALANALYSIS_SNAPSHOT_DIR: path.join(root, "data/snapshots"),
};
await new Promise<void>((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "build",
      stage,
      "--webpack",
    ],
    { cwd: root, env, stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`Pages build exited ${code}`)),
  );
});
await rm(output, { recursive: true, force: true });
await cp(path.join(stage, "out"), output, { recursive: true });
await writeFile(path.join(output, ".nojekyll"), "");
// GitHub Pages serves PNG MIME types by extension; Next's generated OG endpoint
// is extensionless. Publish a .png asset and adjust generated metadata URLs.
const home = await readFile(path.join(output, "index.html"), "utf8");
const ogUrl = home.match(/<meta property="og:image" content="([^"]+)"/u)?.[1];
if (ogUrl) {
  await cp(
    path.join(output, "opengraph-image"),
    path.join(output, "brand/social-card.png"),
  );
  const imageUrl = new URL(
    "brand/social-card.png",
    siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`,
  ).href;
  async function fixImageMetadata(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await fixImageMetadata(filename);
      else if (/\.(html|txt)$/.test(entry.name)) {
        const text = await readFile(filename, "utf8");
        if (text.includes(ogUrl!))
          await writeFile(filename, text.replaceAll(ogUrl!, imageUrl));
      }
    }
  }
  await fixImageMetadata(output);
}

const dates = (await readdir(path.join(root, "data/snapshots")))
  .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  .sort()
  .reverse();
let published: ReturnType<typeof mapCommittedSnapshot> = null;
let snapshotDirectory = "";
for (const date of dates) {
  const directory = path.join(root, "data/snapshots", date);
  try {
    published = mapCommittedSnapshot(
      JSON.parse(await readFile(path.join(directory, "snapshot.json"), "utf8")),
      date,
    );
  } catch {
    continue;
  }
  if (published) {
    snapshotDirectory = directory;
    break;
  }
}
if (!published) throw new Error("Pages requires a valid published snapshot");
const data = published;
const writeJson = async (route: string, payload: unknown) => {
  const file = path.join(output, `${route}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(dataEnvelope(payload, data.status)));
};
await writeJson("api/v1/models", data.models.map(toPublicModelDto));
await writeJson("api/v1/benchmarks", data.benchmarks);
await writeJson(
  "api/v1/results",
  data.results.filter((r) => !r.displayOnly),
);
await writeJson("api/v1/runs", data.runs);
for (const kind of INDEX_KINDS) {
  const run = data.runs
    .filter((r) => r.kind === kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
  const rows = [...data.models]
    .filter((m) => m.indexes[kind])
    .sort((a, b) => compareIndexRank(a, b, kind))
    .map((m) => ({
      runId: run.id,
      modelId: m.id,
      modelSlug: m.slug,
      modelName: m.name,
      organization: m.organization,
      ...m.indexes[kind],
    }));
  await writeJson(`api/v1/index/${kind}`, {
    kind,
    methodVersion: run.methodVersion,
    runId: run.id,
    generatedAt: data.generatedAt,
    rows,
  });
}
await writeJson("api/v1", {
  name: "ActualAnalysis snapshot resources",
  version: "v1",
  mode: "static",
  queryFiltering: false,
  snapshotDate: data.snapshotDate,
  resources: [
    "models",
    "benchmarks",
    "results",
    "runs",
    "index/mixed",
    "index/agentic",
    "index/chat",
  ].map((route) => `${basePath}/api/v1/${route}.json`),
});
for (const asset of SNAPSHOT_ASSETS) {
  const target = path.join(output, "api/v1/download", asset.name);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(snapshotDirectory, asset.name), target);
}
await writeFile(
  path.join(output, "publication.json"),
  JSON.stringify(
    {
      siteUrl,
      snapshotDate: data.snapshotDate,
      methodVersion: data.status.methodVersion,
      models: data.models.length,
      basePath,
      commit: process.env.GITHUB_SHA ?? null,
    },
    null,
    2,
  ),
);
console.log(`Pages export ready: ${output}`);
