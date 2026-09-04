#!/usr/bin/env python3
"""Compare capability ordering with an Epoch ECI export.

Inputs may be JSON arrays or CSV files. Each row needs a model identifier and
numeric score. This utility has no third-party dependencies so it can run in CI.
It reports Spearman rank correlation over the intersection and exits non-zero
below the configured threshold (0.99 by default).
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, dict):
            value = value.get("scores", value.get("models", []))
        if not isinstance(value, list):
            raise ValueError(f"{path}: expected a JSON array or an object with scores")
        return [dict(row) for row in value]
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def extract(rows: list[dict[str, Any]], id_key: str, score_key: str) -> dict[str, float]:
    output: dict[str, float] = {}
    for row in rows:
        if row.get(id_key) in (None, "") or row.get(score_key) in (None, ""):
            continue
        output[str(row[id_key])] = float(row[score_key])
    return output


def ranks(values: dict[str, float], keys: list[str]) -> dict[str, float]:
    ordered = sorted(keys, key=lambda key: values[key])
    result: dict[str, float] = {}
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[index]]:
            end += 1
        average = (index + 1 + end) / 2
        for key in ordered[index:end]:
            result[key] = average
        index = end
    return result


def spearman(left: dict[str, float], right: dict[str, float]) -> tuple[float, int]:
    keys = sorted(set(left) & set(right))
    if len(keys) < 3:
        raise ValueError("At least three overlapping model identifiers are required")
    a, b = ranks(left, keys), ranks(right, keys)
    mean_a = sum(a.values()) / len(keys)
    mean_b = sum(b.values()) / len(keys)
    covariance = sum((a[key] - mean_a) * (b[key] - mean_b) for key in keys)
    variance_a = sum((a[key] - mean_a) ** 2 for key in keys)
    variance_b = sum((b[key] - mean_b) ** 2 for key in keys)
    denominator = math.sqrt(variance_a * variance_b)
    return (covariance / denominator if denominator else 1.0), len(keys)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--candidate-id", default="model_id")
    parser.add_argument("--candidate-score", default="score")
    parser.add_argument("--reference-id", default="model_id")
    parser.add_argument("--reference-score", default="capability")
    parser.add_argument("--threshold", type=float, default=0.99)
    args = parser.parse_args()

    candidate = extract(load_rows(args.candidate), args.candidate_id, args.candidate_score)
    reference = extract(load_rows(args.reference), args.reference_id, args.reference_score)
    rho, count = spearman(candidate, reference)
    print(f"Spearman rho={rho:.6f} over {count} models")
    if rho < args.threshold:
        raise SystemExit(f"ordering check failed: {rho:.6f} < {args.threshold:.6f}")


if __name__ == "__main__":
    main()
