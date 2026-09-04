import { z } from "zod";

const finite = z.number().finite();

export const RunArtifactSchema = z.object({
  kind: z.enum(["mixed", "agentic", "chat"]),
  method_version: z.string().min(1),
  params: z.record(z.unknown()),
  created_at: z.string().datetime().optional(),
  scores: z.array(z.object({
    model_id: z.string().min(1),
    system_id: z.string().min(1).optional(),
    profile: z.string().optional(),
    tier: z.enum(["verified", "ranked", "provisional"]).optional(),
    score: finite.nullable(),
    ci_low: finite.nullable(),
    ci_high: finite.nullable(),
    rank: z.number().int().positive().nullable(),
    rank_low: z.number().int().positive().nullable(),
    rank_high: z.number().int().positive().nullable(),
    coverage: z.number().min(0).max(1),
    n_private: z.number().int().nonnegative(),
    robust_score: finite,
    flags: z.array(z.unknown()).default([]),
    provisional: z.boolean().default(false),
    pairwise: z.record(z.number().min(0).max(1)).default({})
    ,rank_cdf: z.array(z.number().min(0).max(1)).optional()
    ,top_k: z.record(z.number().min(0).max(1)).optional()
    ,evidence: z.record(z.unknown()).optional()
  })),
  benchmark_params: z.array(z.object({
    benchmark_id: z.string().min(1),
    difficulty: finite,
    slope: finite.positive(),
    weight: finite.nonnegative(),
    weight_factors: z.record(finite),
    residual_var: finite.nonnegative()
  })),
  cells: z.array(z.object({
    model_id: z.string().min(1),
    system_id: z.string().min(1).optional(),
    profile: z.string().optional(),
    benchmark_id: z.string().min(1),
    y: finite,
    y_hat: finite,
    z: finite,
    used: z.boolean().default(true),
    canonical_config: z.string().nullable().optional(),
    alternative_configs: z.array(z.string()).optional()
  }))
}).strict();

export type RunArtifact = z.infer<typeof RunArtifactSchema>;
