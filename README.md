# ActualAnalysis

ActualAnalysis is an open model-comparison stack: public benchmark registries, source-aware ingestion, a robust latent-capability model, uncertainty estimates, anti-benchmaxxing diagnostics, and a fast comparison UI. It reports separate **Mixed**, **Agentic**, and **Chat** indexes instead of hiding incompatible workloads inside one arithmetic average. The app uses Next.js 16 rather than the originally proposed Next.js 15 because the supported 16.x line resolves known framework advisories.

The repository is intentionally useful before a database is configured. The web app reads the latest valid committed snapshot—currently the first live snapshot dated `2026-09-04`—and falls back to clearly labelled synthetic fixture data if no valid snapshot is available. No benchmark score from Artificial Analysis is ingested. The isolated speed registry is excluded from exports and may be left empty.

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

Every observation needs a source URL, observation date, harness/config metadata, and provenance tier. Independent runners supersede mirrors, which supersede self-reports; lower tiers remain visible but are excluded from the fitted cell while a better tier exists. Unknown in-scope names go to the versioned review queue at `data/manual/unmapped.yaml` instead of being silently merged. That report is timestamp-free, deterministically sorted, and rewritten only when its contents change, so repeated scheduled runs do not create review noise.

Kaggle result snapshots may be supplied as HTTP(S) URLs through the `ACTUALANALYSIS_KAGGLE_*_URL` variables or placed at `data/kaggle/<benchmark-id>.{csv,json,yaml,yml}`. The adapter deliberately has no guessed public defaults: currently discoverable datasets under these benchmark names contain question sets or third-party copies, not authoritative model-result leaderboards.

The code is Apache-2.0. Redistributable registries and snapshots are CC-BY-4.0. `data/manual/speed-aa.yaml` is explicitly **not** part of the CC-BY dataset or snapshot exporter; see the warning in that file. Consult counsel before populating or publishing third-party measurements whose terms restrict reuse.

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

This run was fail-soft rather than source-complete. The live capture included LMArena and ARC Prize; configured Kaggle feeds/local files were absent, while 16 accepted Kaggle observations and 18 accepted Terminal-Bench observations came from the versioned manual-results registry. Another 51 Kaggle rows remain review-only and were excluded from ingest. Those source conditions remain visible in the capture report and must not be interpreted as zero benchmark performance. The committed snapshot records a successful local pipeline publication only; this repository makes no claim that the app or snapshot has been externally deployed. Unknown in-scope names continue to flow to the deterministic, human-reviewable `data/manual/unmapped.yaml`, and future publication remains gated by the checks in [docs/methodology.md](docs/methodology.md).
