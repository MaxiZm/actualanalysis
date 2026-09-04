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
}).strict().superRefine((artifact, context) => {
  // Integrity guard: a run labelled with a 1.2.x method must carry the NumPyro
  // NUTS diagnostics that only the real joint fit produces. This blocks
  // relabelling a legacy fit (or hand-edited numbers) as a Bayesian run.
  if (!/^1\.[23]\.\d+$/.test(artifact.method_version)) return;
  const diagnostics = (artifact.params as Record<string, unknown>).diagnostics as Record<string, unknown> | undefined;
  const problems: string[] = [];
  if (!diagnostics || typeof diagnostics !== "object") problems.push("params.diagnostics missing");
  else {
    if (diagnostics.engine !== "numpyro-nuts") problems.push("params.diagnostics.engine must be numpyro-nuts");
    if (diagnostics.accepted !== true) problems.push("params.diagnostics.accepted must be true");
    if (!(typeof diagnostics.posterior_draws === "number" && diagnostics.posterior_draws >= 1000)) problems.push("params.diagnostics.posterior_draws must be >= 1000");
    if (!(typeof diagnostics.elapsed_seconds === "number" && diagnostics.elapsed_seconds > 0)) problems.push("params.diagnostics.elapsed_seconds must be positive");
    if (!(typeof diagnostics.divergences === "number")) problems.push("params.diagnostics.divergences missing");
  }
  if (typeof (artifact.params as Record<string, unknown>).joint_posterior_path !== "string") problems.push("params.joint_posterior_path missing");
  for (const problem of problems) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["params"], message: `method ${artifact.method_version} run artifact rejected: ${problem}` });
  }
});

export type RunArtifact = z.infer<typeof RunArtifactSchema>;
