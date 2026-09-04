import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function readProjectDocument(
  name: "methodology.md" | "changelog.md",
) {
  for (const root of [
    process.env.ACTUALANALYSIS_PROJECT_DIR,
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
  ].filter((root): root is string => Boolean(root))) {
    try {
      return await readFile(
        /* turbopackIgnore: true */ path.join(root, "docs", name),
        "utf8",
      );
    } catch {
      /* Try workspace root. */
    }
  }
  throw new Error(`Documentation not found: ${name}`);
}
