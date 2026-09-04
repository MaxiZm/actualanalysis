# ActualAnalysis

ActualAnalysis is an open model-comparison stack: public benchmark registries, source-aware ingestion, a robust latent-capability model, uncertainty estimates, anti-benchmaxxing diagnostics, and a fast comparison UI. It reports separate **Mixed**, **Agentic**, and **Chat** indexes instead of hiding incompatible workloads inside one arithmetic average. The app uses Next.js 16 rather than the originally proposed Next.js 15 because the supported 16.x line resolves known framework advisories.

The repository is intentionally useful before a database is configured. The web app reads the latest valid committed snapshot—currently the first live snapshot dated `2026-09-04`—and falls back to clearly labelled synthetic fixture data if no valid snapshot is available. Artificial Analysis runtime, task cost and CritPt results are attributed UI overlays. They do not enter the capability fit or bulk exports; the private registries may be absent.

## Scoring engine (method 1.3.2)

Scores come from one joint five-domain Bayesian model fitted with NumPyro NUTS
(`packages/scoring/python`). The Python environment is managed by `uv`:

```bash
cd packages/scoring/python && uv sync --frozen
```

`npm run pipeline -- --all --dry-run` ingests, prepares observations, audits the
calibration panel and runs the fit (4 chains × 2,000 warm-up + 3,000 samples;
several minutes on a laptop CPU). For quick local iterations use
`ACI12_CHAINS=2 ACI12_WARMUP=300 ACI12_SAMPLES=300`; such runs never pass the
convergence gate and are never published. Method rules live in
[docs/methodology.md](docs/methodology.md); constants in `data/index-config.yaml`.

## GitHub Pages

The published site is [maxizm.github.io/actualanalysis](https://maxizm.github.io/actualanalysis/).
The `Deploy GitHub Pages` workflow exports the current validated snapshot on pushes to `main` and manual runs. It preserves client-side filters, model comparisons and interactive charts. Data downloads and `.json` resources are static files; server-side query filtering and hourly refresh require a server deployment.

Run `npm run build:pages` to create `work/pages-site`. The build stages a separate Next app and leaves normal server/API routes intact. `NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_SITE_URL` configure the published path. Private AA display files are gitignored and restored from the repository secret `AA_DISPLAY_DATA_GZIP_BASE64` by `scripts/restore-display-data.mjs`; the public registry also works when those files are absent. Never commit this secret or its decoded source files. Same-day archived snapshots remain local.

The source logo is `apps/web/public/brand/actualanalysis.svg`. Its twin A forms refer to ActualAnalysis and a shared comparison baseline. The same mark appears in the header, footer, SVG favicon, 16/32/48px ICO and Apple touch icon.

## Quick start

Requirements: Node.js 20+, npm 10+, and Docker when using Postgres.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For the database-backed pipeline:

```bash
cp .env.example .env
docker compose up -d
npm run --workspace @actualanalysis/db migrate
npm run --workspace @actualanalysis/db seed
npm run ingest -- openrouter --dry-run --output work/openrouter.json
npm run pipeline -- --all --dry-run
DATABASE_URL=postgres://actualanalysis:actualanalysis@localhost:5432/actualanalysis \
  npm run pipeline -- --all
```

`--dry-run` still fetches, validates, resolves aliases, and attempts scoring, but never mutates Postgres. Add `--commit-snapshot` only for a publishable run: the exporter refuses to write unless all three indexes exist and each has a ranked, non-provisional result. The committed `2026-09-04` snapshot is the web app's current default; the conspicuous synthetic fixture remains a fail-safe for missing or invalid snapshot data.

## What is implemented

- Zod-validated YAML registries for models, benchmarks, sources, results, and index configuration.
- Idempotent adapters for manual data, OpenRouter, Epoch AI, SWE-rebench, LMArena, Kaggle-hosted CSVs, MathArena, METR, and tolerant leaderboard scrapers.
- Chance correction and declared transforms for accuracy, Elo, METR time horizon, and Vending-Bench USD values against its published ~$63,000 strong-human reference.
- One joint five-domain Bayesian fit over declared `std` and `max` systems, with observation-specific count and continuous likelihoods.
- Draw-wise frozen-panel calibration, posterior rank ranges and pairwise probabilities, evidence tiers, family effects, heavy-tailed cell residuals, and contamination-safe coverage gates.
- Postgres/Drizzle schema for raw observations, provenance, pricing, speed, versioned index runs, benchmark parameters, and fitted cells.
- Responsive leaderboard, model and benchmark drill-downs, charts, methodology, changelog, open JSON routes, CC-BY snapshot download, and a fail-soft display-only OpenRouter price/context overlay that cannot enter snapshots or APIs.
- CI plus a fail-soft daily ingest → score → snapshot workflow.
- A guarded public-snapshot importer and an isolated Postgres round-trip verifier.

## Repository map

```text
apps/web/            Next.js App Router UI and public API
packages/shared/     Schemas, registry loader, IDs and aliases
packages/ingest/     Source adapters and ingest CLI
packages/scoring/    Pure TypeScript capability model
packages/db/         Drizzle schema, seed and snapshot export
data/                Versioned registries and manual observations
docs/                Methodology and method changelog
scripts/             End-to-end orchestration and cross-check helpers
```

## Data policy

Every observation needs a source URL, observation date, harness/config metadata, and provenance tier. Confirmed copies share a source lineage and enter the fit once. Distinct configurations and independent replications remain separate; provenance alone does not erase a valid evaluation. Current exports use the accepted run’s exact evidence inventory while earlier rows remain in database history. Unknown in-scope names go to the versioned review queue at `data/manual/unmapped.yaml` instead of being silently merged. That report is timestamp-free, deterministically sorted, and rewritten only when its contents change, so repeated scheduled runs do not create review noise.

Kaggle result snapshots may be supplied as HTTP(S) URLs through the `ACTUALANALYSIS_KAGGLE_*_URL` variables or placed at `data/kaggle/<benchmark-id>.{csv,json,yaml,yml}`. The adapter deliberately has no guessed public defaults: currently discoverable datasets under these benchmark names contain question sets or third-party copies, not authoritative model-result leaderboards.

The code is Apache-2.0. Redistributable registries and snapshots are CC-BY-4.0. `data/manual/speed-aa.yaml`, `cost-aa.yaml` and `benchmarks-aa.yaml` are explicitly **not** part of the CC-BY dataset, fit or bulk exporter; see the warnings in those files. Their UI values retain source and exact configuration links.

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

With two empty migrated verification databases, the durable DB/snapshot check is:

```bash
SOURCE_DATABASE_URL=postgres://actualanalysis:actualanalysis@localhost:5432/actualanalysis_verify_source \
TARGET_DATABASE_URL=postgres://actualanalysis:actualanalysis@localhost:5432/actualanalysis_verify_target \
npm run verify:db
```

It checks source-tier supersession, JSON import, every emitted CSV row count, and the hard exclusion of source-marked non-redistributable raw observations and all speed observations.

The scoring tests cover the 1.2 likelihood transforms, lineage and profile gates, draw-wise calibration, evidence tiers, rank distributions, and information concentration, alongside historical-method regression tests. Adapter tests use fixtures rather than depending on remote pages during CI. The site works without JavaScript for navigation and tabular reading; enhanced search and charts hydrate on the client.

## Status

Method version `1.0.0` produced the currently committed historical snapshot at `data/snapshots/2026-09-04`. Method `1.2.0` is now the configured scoring contract, but publication fails closed until the source registry supplies the effort-profile and harness metadata required to fit the frozen calibration panel. The existing snapshot is not relabelled or silently recomputed.

This run was fail-soft rather than source-complete. The live capture included LMArena and ARC Prize; configured Kaggle feeds/local files were absent, while 16 accepted Kaggle observations and 18 accepted Terminal-Bench observations came from the versioned manual-results registry. Another 51 Kaggle rows remain review-only and were excluded from ingest. Those source conditions remain visible in the capture report and must not be interpreted as zero benchmark performance. The committed snapshot records a successful local pipeline publication only; this historical run predates the GitHub Pages deployment described above. Unknown in-scope names continue to flow to the deterministic, human-reviewable `data/manual/unmapped.yaml`, and future publication remains gated by the checks in [docs/methodology.md](docs/methodology.md).
