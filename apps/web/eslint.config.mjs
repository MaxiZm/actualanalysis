import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/lib/openrouter-display",
            message: "Display-only OpenRouter data must never enter the public API.",
          },
          {
            name: "@/lib/server/openrouter-display",
            message: "Display-only OpenRouter data must never enter the public API.",
          },
          {
            name: "@/lib/server/snapshot",
            importNames: ["loadDisplaySiteData"],
            message: "API routes must load public snapshot data, never display-only overlays.",
          },
        ],
        patterns: [
          {
            group: [
              "@/lib/openrouter-display/**",
              "@/lib/server/openrouter-display/**",
              "**/openrouter-display",
              "**/openrouter-display.*",
              "**/openrouter-display/**",
            ],
            message: "Display-only OpenRouter data must never enter the public API.",
          },
        ],
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
