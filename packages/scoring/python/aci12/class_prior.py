"""Opt-in restricted class prior for the ACI 1.5.0 candidate.

Default (absent or disabled `class_prior`) is the production independent-release
baseline. This module does not implement predecessor random-walk siblings.

JSON input contract (`class_prior` on the NumPyro input object)
--------------------------------------------------------------
Absent, `null`, or `{"enabled": false}`: production baseline. Other fields ignored.

When `"enabled": true` the object MUST be:

```json
{
  "enabled": true,
  "family": "restricted",
  "edition": "<frozen partition edition id>",
  "pooling": {"kind": "beta", "alpha": 1, "beta": 1}
           | {"kind": "fixed", "value": 0},
  "partition": [
    {"class_id": "<documented class>", "model_ids": ["<release snapshot id>", "..."]}
  ]
}
```

Rules:
- `family` must be `"restricted"`. Other families (including random-walk /
  predecessor-edge candidates) are rejected.
- `pooling.kind="beta"` is the experimental candidate; the locked development
  prior is Beta(1,1). Positive `alpha` and `beta` are required.
- `pooling.kind="fixed"` with `value=0` is the exact nested independent baseline
  (`z_m = L_Σ v_m`). `value` must satisfy `0 <= value < 1`.
- `edition` is a non-empty freeze identifier for the documented partition.
- `partition` is an explicit list (possibly empty). Empty ⇒ every fitted release
  is a singleton. Membership is never inferred from provider, name, or version.
- `model_ids` are release snapshot ids, equal to `system_ids` with the final
  `@<effort>` suffix removed, or the optional top-level `model_ids` array of
  length `n_models`. System ids (`gpt-5@max-common`) are rejected.
- Duplicate `class_id` or overlapping `model_ids` are errors.
- Fitted releases missing from the partition become `singleton:<model_id>`.
- Partition ids that are not in the fitted set are recorded as unused catalog
  members and do not create sampled class coordinates. If the partition is
  non-empty and none of its ids match a fitted release, that is an error.
- Optional ignored documentation keys: `notes`, `source`, `review`,
  `registry_sha256`. Keys that request provider guessing are rejected.

Induced construction (enabled, correlated LKJ traits):
`z_m = L_Σ (√ρ u_{c(m)} + √(1-ρ) v_m)` with `u_c, v_m ~ N_5(0,I)` independent,
`Σ = D_σ Ω D_σ = L_Σ L_Σᵀ`. No extra density on `z`. Effort, likelihood, and
panel calibration are unchanged. At `ρ = 0` the class coordinates are omitted
and the stochastic sites match the production trait prior.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

ALLOWED_FAMILIES = frozenset({"restricted"})
ALLOWED_POOLING_KINDS = frozenset({"beta", "fixed"})
DOCUMENTATION_KEYS = frozenset({"notes", "source", "review", "registry_sha256"})
FORBIDDEN_GUESSING_KEYS = frozenset({
    "guess_providers", "provider_classes", "infer_from_name", "by_provider",
    "provider", "guess", "auto_partition",
})
SINGLETON_PREFIX = "singleton:"
REQUIRED_ENABLED_KEYS = frozenset({"enabled", "family", "edition", "pooling", "partition"})

CLASS_PRIOR_CONTRACT = {
    "path": "class_prior",
    "default": "absent or enabled=false → production independent-release baseline",
    "enabled": {
        "enabled": True,
        "family": "restricted",
        "edition": "non-empty frozen partition edition",
        "pooling": [
            {"kind": "beta", "alpha": 1, "beta": 1},
            {"kind": "fixed", "value": 0},
        ],
        "partition": [{"class_id": "documented-class-id", "model_ids": ["release-snapshot-id"]}],
    },
    "assignment": "explicit partition; singleton:<model_id> fallback; no provider guessing",
    "model_ids": "release snapshot ids (optional top-level model_ids, else system_ids before last @)",
}


@dataclass(frozen=True)
class ClassPriorSpec:
    enabled: bool
    family: str | None = None
    pooling_kind: str | None = None
    beta_alpha: float | None = None
    beta_beta: float | None = None
    rho_value: float | None = None
    edition: str | None = None
    n_classes: int = 0
    model_class_index: tuple[int, ...] = ()
    class_ids: tuple[str, ...] = ()
    model_ids: tuple[str, ...] = ()
    assignments: tuple[tuple[str, str], ...] = ()
    class_sizes: tuple[tuple[str, int], ...] = ()
    singleton_model_ids: tuple[str, ...] = ()
    unused_partition_model_ids: tuple[str, ...] = ()
    partition: tuple[tuple[str, tuple[str, ...]], ...] = ()

    @property
    def uses_class_components(self) -> bool:
        if not self.enabled:
            return False
        if self.pooling_kind == "fixed" and float(self.rho_value or 0.0) == 0.0:
            return False
        return self.n_classes > 0 and len(self.model_ids) > 0

    @property
    def samples_class_rho(self) -> bool:
        return self.enabled and self.pooling_kind == "beta"

    def assignment_map(self) -> dict[str, str]:
        return dict(self.assignments)

    def public_dict(self) -> dict[str, Any]:
        pooling: dict[str, Any] | None = None
        if self.pooling_kind == "beta":
            pooling = {"kind": "beta", "alpha": self.beta_alpha, "beta": self.beta_beta}
        elif self.pooling_kind == "fixed":
            pooling = {"kind": "fixed", "value": self.rho_value}
        return {
            "enabled": self.enabled,
            "family": self.family,
            "edition": self.edition,
            "pooling": pooling,
            "n_classes": self.n_classes,
            "n_fitted_models": len(self.model_ids),
            "n_singleton_fallback": len(self.singleton_model_ids),
            "assignments": self.assignment_map(),
            "class_sizes": dict(self.class_sizes),
            "singleton_model_ids": list(self.singleton_model_ids),
            "unused_partition_model_ids": list(self.unused_partition_model_ids),
            "partition": [{"class_id": class_id, "model_ids": list(model_ids)} for class_id, model_ids in self.partition],
        }


def _as_object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    return value


def fitted_model_ids(data: dict) -> list[str]:
    n_models = int(data["n_models"])
    if "model_ids" in data:
        ids = [str(item) for item in data["model_ids"]]
        if len(ids) != n_models:
            raise ValueError(f"model_ids length {len(ids)} != n_models {n_models}")
        if any(not item for item in ids):
            raise ValueError("model_ids entries must be non-empty strings")
        return ids
    system_ids = data["system_ids"]
    system_model_index = data["system_model_index"]
    found: list[str | None] = [None] * n_models
    for system_id, model_index in zip(system_ids, system_model_index):
        model_index = int(model_index)
        if model_index < 0 or model_index >= n_models:
            raise ValueError(f"system_model_index {model_index} out of range for n_models={n_models}")
        model_id = str(system_id).rsplit("@", 1)[0]
        previous = found[model_index]
        if previous is None:
            found[model_index] = model_id
        elif previous != model_id:
            raise ValueError(f"model index {model_index} maps to both {previous!r} and {model_id!r}")
    missing = [index for index, value in enumerate(found) if value is None]
    if missing:
        raise ValueError(f"no system_id for model indexes {missing}")
    return [str(value) for value in found]


def _parse_pooling(raw: Any) -> tuple[str, float | None, float | None, float | None]:
    pooling = _as_object(raw, "class_prior.pooling")
    kind = pooling.get("kind")
    if kind not in ALLOWED_POOLING_KINDS:
        raise ValueError("class_prior.pooling.kind must be 'beta' or 'fixed'")
    unexpected = set(pooling) - {"kind", "alpha", "beta", "value"}
    if unexpected:
        raise ValueError(f"unsupported class_prior.pooling keys {sorted(unexpected)}")
    if kind == "beta":
        if "value" in pooling:
            raise ValueError("class_prior.pooling kind=beta does not take value")
        if "alpha" not in pooling or "beta" not in pooling:
            raise ValueError("class_prior.pooling kind=beta requires alpha and beta")
        alpha = float(pooling["alpha"])
        beta = float(pooling["beta"])
        if not np.isfinite(alpha) or not np.isfinite(beta) or alpha <= 0 or beta <= 0:
            raise ValueError("class_prior.pooling beta hyperparameters must be finite and positive")
        return "beta", alpha, beta, None
    if "alpha" in pooling or "beta" in pooling:
        raise ValueError("class_prior.pooling kind=fixed does not take alpha/beta")
    if "value" not in pooling:
        raise ValueError("class_prior.pooling kind=fixed requires value")
    value = float(pooling["value"])
    if not np.isfinite(value) or value < 0.0 or value >= 1.0:
        raise ValueError("class_prior.pooling fixed value must satisfy 0 <= value < 1")
    return "fixed", None, None, value


def _parse_partition(raw: Any) -> list[tuple[str, list[str]]]:
    if not isinstance(raw, list):
        raise ValueError("class_prior.partition must be a list")
    parsed: list[tuple[str, list[str]]] = []
    seen_class: set[str] = set()
    seen_model: set[str] = set()
    for index, row in enumerate(raw):
        item = _as_object(row, f"class_prior.partition[{index}]")
        extra = set(item) - {"class_id", "model_ids"}
        if extra:
            raise ValueError(f"unsupported class_prior.partition[{index}] keys {sorted(extra)}")
        class_id = item.get("class_id")
        if not isinstance(class_id, str) or not class_id.strip():
            raise ValueError(f"class_prior.partition[{index}].class_id must be a non-empty string")
        class_id = class_id.strip()
        if class_id.startswith(SINGLETON_PREFIX):
            raise ValueError(f"class_prior.partition[{index}].class_id must not use the singleton fallback prefix")
        if class_id in seen_class:
            raise ValueError(f"duplicate class_prior.partition class_id {class_id!r}")
        model_ids = item.get("model_ids")
        if not isinstance(model_ids, list) or not model_ids:
            raise ValueError(f"class_prior.partition[{index}].model_ids must be a non-empty list")
        cleaned: list[str] = []
        for model_id in model_ids:
            if not isinstance(model_id, str) or not model_id.strip():
                raise ValueError(f"class_prior.partition[{index}].model_ids must be non-empty strings")
            model_id = model_id.strip()
            if "@" in model_id:
                raise ValueError("class_prior.partition model_ids must be release snapshot ids, not system ids")
            if model_id in seen_model:
                raise ValueError(f"class_prior.partition is not a partition: {model_id!r} appears in more than one class")
            seen_class.add(class_id)
            seen_model.add(model_id)
            cleaned.append(model_id)
        parsed.append((class_id, cleaned))
    return parsed


def resolve_class_prior(data: dict) -> ClassPriorSpec:
    raw = data.get("class_prior")
    if raw is None:
        return ClassPriorSpec(enabled=False)
    payload = _as_object(raw, "class_prior")
    guessing = sorted(key for key in payload if key in FORBIDDEN_GUESSING_KEYS)
    if guessing:
        raise ValueError(f"class_prior must not guess membership from {guessing}; supply an explicit partition")
    unknown = set(payload) - REQUIRED_ENABLED_KEYS - DOCUMENTATION_KEYS
    if unknown:
        raise ValueError(f"unsupported class_prior keys {sorted(unknown)}")
    if not bool(payload.get("enabled", False)):
        return ClassPriorSpec(enabled=False)
    missing = sorted(REQUIRED_ENABLED_KEYS - set(payload))
    if missing:
        raise ValueError(f"enabled class_prior missing required keys {missing}")
    family = payload["family"]
    if family not in ALLOWED_FAMILIES:
        raise ValueError("class_prior.family must be 'restricted'; predecessor random-walk families are not implemented")
    edition = payload["edition"]
    if not isinstance(edition, str) or not edition.strip():
        raise ValueError("class_prior.edition must be a non-empty freeze identifier")
    pooling_kind, alpha, beta, rho_value = _parse_pooling(payload["pooling"])
    partition = _parse_partition(payload["partition"])
    model_ids = fitted_model_ids(data)
    fitted = set(model_ids)
    unused = tuple(model_id for _, members in partition for model_id in members if model_id not in fitted)
    if partition and all(model_id not in fitted for _, members in partition for model_id in members):
        raise ValueError("class_prior.partition did not match any fitted release snapshot id")

    class_ids: list[str] = []
    model_class_index = [-1] * len(model_ids)
    assigned: dict[str, str] = {}
    for class_id, members in partition:
        fitted_members = [model_id for model_id in members if model_id in fitted]
        if not fitted_members:
            continue
        class_index = len(class_ids)
        class_ids.append(class_id)
        for model_id in fitted_members:
            model_class_index[model_ids.index(model_id)] = class_index
            assigned[model_id] = class_id

    singletons: list[str] = []
    for model_index, model_id in enumerate(model_ids):
        if model_class_index[model_index] >= 0:
            continue
        class_id = f"{SINGLETON_PREFIX}{model_id}"
        class_index = len(class_ids)
        class_ids.append(class_id)
        model_class_index[model_index] = class_index
        assigned[model_id] = class_id
        singletons.append(model_id)

    sizes = tuple((class_id, sum(index == class_index for index in model_class_index)) for class_index, class_id in enumerate(class_ids))
    return ClassPriorSpec(
        enabled=True,
        family=str(family),
        pooling_kind=pooling_kind,
        beta_alpha=alpha,
        beta_beta=beta,
        rho_value=rho_value,
        edition=edition.strip(),
        n_classes=len(class_ids),
        model_class_index=tuple(int(index) for index in model_class_index),
        class_ids=tuple(class_ids),
        model_ids=tuple(model_ids),
        assignments=tuple((model_id, assigned[model_id]) for model_id in model_ids),
        class_sizes=sizes,
        singleton_model_ids=tuple(singletons),
        unused_partition_model_ids=unused,
        partition=tuple((class_id, tuple(members)) for class_id, members in partition),
    )


def production_export_issues(data: dict) -> list[str]:
    """Existing acceptance path: experimental class-prior fits are not publishable."""
    if resolve_class_prior(data).enabled:
        return ["class_prior restricted candidate is experimental and nonpublishable"]
    return []


def pooling_kernel(model_class_index: np.ndarray, rho: float) -> np.ndarray:
    """K_ρ = (1-ρ)I + ρ H Hᵀ over releases. Positive definite for ρ<1."""
    index = np.asarray(model_class_index, dtype=int)
    n_models = int(index.shape[0])
    kernel = (1.0 - rho) * np.eye(n_models)
    for class_index in np.unique(index):
        members = index == class_index
        kernel += rho * np.outer(members, members)
    return kernel


def scale_covariance(varsigma: np.ndarray, omega: np.ndarray) -> np.ndarray:
    varsigma = np.asarray(varsigma, dtype=float)
    omega = np.asarray(omega, dtype=float)
    return varsigma[:, None] * omega * varsigma[None, :]


def white_traits(rho: float, class_white: np.ndarray, release_white: np.ndarray, model_class_index: np.ndarray) -> np.ndarray:
    """√ρ u_{c(m)} + √(1-ρ) v_m, preserving marginal N(0,I)."""
    rho = float(np.clip(rho, 0.0, 1.0 - 1e-12))
    index = np.asarray(model_class_index, dtype=int)
    return np.sqrt(rho) * np.asarray(class_white)[index] + np.sqrt(1.0 - rho) * np.asarray(release_white)


def standard_traits(cov_factor: np.ndarray, white: np.ndarray) -> np.ndarray:
    """z = white @ L_Σᵀ with L_Σ = D_σ L_Ω stored as cov_factor."""
    return np.asarray(white) @ np.asarray(cov_factor).T


def conditional_classmate_moments(rho: float, z_parent: np.ndarray, sigma: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """z_m | z_p ~ N(ρ z_p, (1-ρ²) Σ) for two members of one class."""
    mean = float(rho) * np.asarray(z_parent, dtype=float)
    covariance = (1.0 - float(rho) ** 2) * np.asarray(sigma, dtype=float)
    return mean, covariance


def gaussian_observation_update(prior_mean: float, prior_variance: float, y: float, measurement_variance: float) -> tuple[float, float]:
    """Univariate Normal observation update used by the proposal's worked calculation."""
    precision = 1.0 / prior_variance + 1.0 / measurement_variance
    variance = 1.0 / precision
    mean = variance * (prior_mean / prior_variance + y / measurement_variance)
    return mean, variance


def _summary(values: np.ndarray) -> dict[str, float]:
    values = np.asarray(values, dtype=float).reshape(-1)
    if values.size == 0:
        return {"median": float("nan"), "low": float("nan"), "high": float("nan"), "sd": 0.0, "width": float("nan")}
    return {
        "median": float(np.median(values)),
        "low": float(np.quantile(values, 0.05)),
        "high": float(np.quantile(values, 0.95)),
        "sd": float(np.std(values, ddof=1)) if values.size > 1 else 0.0,
        "width": float(np.quantile(values, 0.95) - np.quantile(values, 0.05)),
    }


def class_prior_report(spec: ClassPriorSpec, samples: dict[str, np.ndarray]) -> dict[str, Any]:
    report = spec.public_dict()
    n_draws = int(np.asarray(next(iter(samples.values()))).shape[0]) if samples else 0
    if "class_rho" in samples:
        rho = np.asarray(samples["class_rho"], dtype=float).reshape(n_draws)
    elif spec.pooling_kind == "fixed":
        rho = np.full(n_draws, float(spec.rho_value or 0.0))
    else:
        rho = np.zeros(n_draws)
    report["rho"] = _summary(rho)
    omega = np.asarray(samples.get("Omega", np.broadcast_to(np.eye(5), (max(n_draws, 1), 5, 5))), dtype=float)
    if omega.ndim == 2:
        omega = np.repeat(omega[None, :, :], max(n_draws, 1), axis=0)
    varsigma = np.asarray(samples.get("varsigma", np.ones((max(n_draws, 1), 5))), dtype=float)
    if varsigma.ndim == 1:
        varsigma = np.repeat(varsigma[None, :], max(n_draws, 1), axis=0)
    sigma = varsigma[:, :, None] * omega * varsigma[:, None, :]
    b_c = rho[:, None, None] * sigma
    b_r = (1.0 - rho)[:, None, None] * sigma
    report["varsigma"] = np.median(varsigma, axis=0).tolist()
    report["Omega_mean"] = np.mean(omega, axis=0).tolist()
    report["Sigma_median"] = np.median(sigma, axis=0).tolist()
    report["B_C_median"] = np.median(b_c, axis=0).tolist()
    report["B_R_median"] = np.median(b_r, axis=0).tolist()
    if "Z" in samples:
        raw = np.asarray(samples["Z"], dtype=float)
        report["raw_traits"] = {
            "mean": np.mean(raw, axis=(0, 1)).tolist(),
            "sd": np.std(raw, axis=(0, 1), ddof=1).tolist() if raw.shape[0] > 1 else np.zeros(raw.shape[-1]).tolist(),
        }
    return report
