import { z } from "zod";

import type { SiteData, SpeedRecord } from "./data";

export const DisplaySpeedObservationSchema = z.object({
  model_id: z.string().min(1),
  provider: z.string().min(1),
  ttft_s: z.number().finite().nonnegative(),
  tokens_per_s: z.number().finite().positive(),
  workload: z.enum(["1k", "10k", "100k"]),
  observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  source_url: z.string().url(),
  redistributable: z.literal(false),
}).strict();

export const DisplaySpeedFileSchema = z.object({
  redistributable: z.literal(false),
  warning: z.string().min(1),
  observations: z.array(DisplaySpeedObservationSchema),
}).strict();

export type DisplaySpeedObservation = z.infer<typeof DisplaySpeedObservationSchema>;

const workloadPriority: Record<DisplaySpeedObservation["workload"], number> = {
  "10k": 0,
  "1k": 1,
  "100k": 2,
};

function preferredObservation(
  left: DisplaySpeedObservation,
  right: DisplaySpeedObservation,
): DisplaySpeedObservation {
  const workloadOrder = workloadPriority[left.workload] - workloadPriority[right.workload];
  if (workloadOrder !== 0) return workloadOrder < 0 ? left : right;
  return right.observed_on.localeCompare(left.observed_on) > 0 ? right : left;
}

function toSpeedRecord(observation: DisplaySpeedObservation): SpeedRecord {
  return {
    provider: observation.provider,
    tokensPerSecond: observation.tokens_per_s,
    ttftSeconds: observation.ttft_s,
    workload: `${observation.workload} input`,
    observedOn: observation.observed_on,
    sourceUrl: observation.source_url,
    redistributable: false,
  };
}

/**
 * Adds the isolated display-only speed registry to UI data. Callers serving
 * public JSON or snapshot assets must continue using the unmodified SiteData.
 */
export function withDisplaySpeed(
  data: SiteData,
  observations: readonly DisplaySpeedObservation[],
): SiteData {
  const preferredByModel = new Map<string, DisplaySpeedObservation>();
  for (const observation of observations) {
    const current = preferredByModel.get(observation.model_id);
    preferredByModel.set(
      observation.model_id,
      current ? preferredObservation(current, observation) : observation,
    );
  }

  return {
    ...data,
    models: data.models.map((model) => {
      const observation = preferredByModel.get(model.id);
      return observation ? { ...model, speed: toSpeedRecord(observation) } : model;
    }),
  };
}
