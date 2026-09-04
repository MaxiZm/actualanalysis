# Contributing

ActualAnalysis treats provenance and reproducibility as product features. Small, reviewable pull requests are preferred.

## Add a model

1. Add or edit a YAML document under `data/models/`.
2. Use a stable lowercase ID and slug. Put every source-specific name in `aliases`.
3. Separate reasoning-effort variants when they produce materially different results.
4. Run `npm run typecheck && npm test`.

## Add a benchmark

1. Add YAML under `data/benchmarks/` with tags, holdout type, item count, harness URL, source IDs, transform, and status.
2. Explain why it is not saturated and whether its tasks are public, semi-private, private, or rolling.
3. Add transform tests when it is not an accuracy-like score.
4. New benchmarks are calibrated with existing capabilities frozen until the next scheduled full refit.

## Add a result

1. Prefer an adapter for repeatable public data. Use `data/manual/results/` only for attributed one-offs.
2. Include `model`, `benchmark`, `source`, `score`, `observed_on`, `url`, and relevant harness/config fields.
3. Mark vendor results through a source whose `kind` is `self_report`; never present one as independent.
4. Do not copy benchmark scores from Artificial Analysis.
5. Run `npm run ingest -- manual --dry-run`; resolve every alias or explicitly leave it in the unmapped report.

## Adapter contract

Adapters emit `RawResult[]`, must be idempotent after canonicalization, preserve the upstream URL and original identifier, support dry-run, and fail soft when a remote source changes. Add a local fixture for parsing behavior. A scrape failure must not erase prior observations or block unrelated sources.

## Pull-request checklist

- [ ] Source and license are explicit.
- [ ] No untraceable metric or model merge was introduced.
- [ ] Unit tests cover parsing or scoring changes.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] UI changes work at 320, 375, 414, and 768 CSS pixels with keyboard focus visible.

