import { mean } from "./math.js";
import type { AnchorDefinition, AnchorTransform, FitResult, PreparedCell } from "./types.js";

export function validateAnchorEligibility(
  capabilities: Record<string, number>,
  cells: readonly PreparedCell[],
  anchors: readonly AnchorDefinition[],
  options: { minCells?: number; minRawGap?: number } = {},
): void {
  if (anchors.length < 2) return;
  const minCells = options.minCells ?? 6;
  const minRawGap = options.minRawGap ?? 2.5;
  for (const anchor of anchors) {
    const fittedCellCount = new Set(cells.filter((cell) => cell.modelId === anchor.modelId).map((cell) => cell.benchmarkId)).size;
    if (fittedCellCount < minCells) {
      throw new Error(`Anchor model ${anchor.modelId} has ${fittedCellCount} fitted cells; at least ${minCells} are required`);
    }
  }
  const rawValues = anchors.map((anchor) => capabilities[anchor.modelId]);
  if (rawValues.some((value) => value === undefined)) return;
  const rawGap = Math.max(...rawValues as number[]) - Math.min(...rawValues as number[]);
  if (rawGap < minRawGap) {
    throw new Error(`Anchor fitted capabilities differ by ${rawGap.toFixed(3)} raw logits; at least ${minRawGap} are required`);
  }
}

export function computeAnchorTransform(
  capabilities: Record<string, number>,
  anchors: readonly AnchorDefinition[] = [],
): AnchorTransform {
  if (anchors.length === 0) return { scale: 1, offset: 0 };
  const pairs = anchors.map((anchor) => {
    const capability = capabilities[anchor.modelId];
    if (capability === undefined) {
      throw new Error(`Anchor model ${anchor.modelId} is absent from the fit`);
    }
    if (!Number.isFinite(anchor.value)) throw new Error(`Anchor value for ${anchor.modelId} is not finite`);
    return { capability, value: anchor.value };
  });
  if (pairs.length === 1) {
    const pair = pairs[0];
    if (pair === undefined) return { scale: 1, offset: 0 };
    return { scale: 1, offset: pair.value - pair.capability };
  }

  const capabilityMean = mean(pairs.map((pair) => pair.capability));
  const valueMean = mean(pairs.map((pair) => pair.value));
  const covariance = pairs.reduce(
    (sum, pair) => sum + (pair.capability - capabilityMean) * (pair.value - valueMean),
    0,
  );
  const variance = pairs.reduce(
    (sum, pair) => sum + (pair.capability - capabilityMean) ** 2,
    0,
  );
  if (!(variance > 0)) throw new Error("Anchor models have indistinguishable fitted capabilities");
  const scale = covariance / variance;
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error("Anchor ordering is inconsistent with fitted capability ordering");
  }
  return { scale, offset: valueMean - scale * capabilityMean };
}

export function applyAnchorTransform(fit: FitResult, transform: AnchorTransform): FitResult {
  if (!(transform.scale > 0) || !Number.isFinite(transform.scale) || !Number.isFinite(transform.offset)) {
    throw new Error("Anchor transform must have a positive finite scale and finite offset");
  }
  const capabilities = Object.fromEntries(
    Object.entries(fit.capabilities).map(([id, value]) => [id, transform.scale * value + transform.offset]),
  );
  const difficulties = Object.fromEntries(
    Object.entries(fit.difficulties).map(([id, value]) => [id, transform.scale * value + transform.offset]),
  );
  const discriminations = Object.fromEntries(
    Object.entries(fit.discriminations).map(([id, value]) => [id, value / transform.scale]),
  );
  return { ...fit, capabilities, difficulties, discriminations };
}

export function reanchorFit(
  fit: FitResult,
  anchors: readonly AnchorDefinition[] = [],
): { fit: FitResult; transform: AnchorTransform } {
  const transform = computeAnchorTransform(fit.capabilities, anchors);
  return { fit: applyAnchorTransform(fit, transform), transform };
}
