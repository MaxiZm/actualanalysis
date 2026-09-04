import { z } from "zod";
import { IsoDateSchema, NonEmptyStringSchema, RegistryIdSchema } from "./common.js";

export const IndexKindSchema = z.enum(["mixed", "agentic", "chat"]);
export const SystemClassSchema = z.string().regex(/^(std-common|max-common|product:.+)$/);
export const SystemProfileSchema = z.enum(["std-common", "max-common", "std", "max"]).or(z.string());
export const EvidenceTierSchema = z.enum(["verified", "ranked", "provisional"]);
export const DomainSchema = z.enum([
  "agentic",
  "software-code",
  "reasoning",
  "knowledge-information",
  "communication-professional",
]);

const ProfileSchema = z.object({
  weights: z.record(DomainSchema, z.number().min(0).max(1)),
  baskets: z.record(DomainSchema, z.array(RegistryIdSchema).min(3)),
}).strict().superRefine((profile, ctx) => {
  const sum = Object.values(profile.weights).reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-9) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weights"], message: "profile weights must sum to 1" });
});

const TierSchema = z.object({
  max_width: z.number().positive(),
  min_domains: z.number().int().min(1).max(5),
  min_safe_cells: z.number().int().nonnegative(),
  max_family_share: z.number().gt(0).lte(1),
  min_own_data_reduction: z.number().min(0).max(1).default(0.5),
}).strict();

export const IndexConfigSchema = z.object({
  method_version: z.literal("1.2.2"),
  method_name: NonEmptyStringSchema,
  taxonomy_edition: NonEmptyStringSchema,
  calibration_edition: NonEmptyStringSchema,
  data_cutoff: IsoDateSchema,
  reference_benchmark: RegistryIdSchema.optional(),
  default_profile: z.string(),
  default_profile_switch_coverage: z.number().gt(0).lte(1),
  domains: z.record(DomainSchema, z.array(RegistryIdSchema).min(1)),
  profiles: z.record(RegistryIdSchema, ProfileSchema),
  calibration_panel: z.array(NonEmptyStringSchema).min(12),
  likelihood: z.object({
    accuracy_se_clip: z.number().gt(0).lt(0.5),
    metadata_incomplete_multiplier: z.number().gte(1),
    agentic_default_rho: z.number().min(0).lt(1),
    other_default_rho: z.number().min(0).lt(1),
    money_human_baseline: z.number().positive(),
  }).strict(),
  priors: z.object({
    capability_sd: z.number().positive().optional(),
    difficulty_sd: z.number().positive().optional(),
    log_discrimination_sd: z.number().positive().optional(),
    domain_sd: z.number().positive().optional(),
    family_sd: z.number().positive().optional(),
    cell_misfit_sd: z.number().positive().optional(),
    cell_df: z.literal(4).default(4),
    self_report_mean: z.number().finite().optional(),
    self_report_sd: z.number().positive().optional(),
    run_noise_sd: z.number().positive().optional(),
    harness_sd: z.number().positive().optional(),
    effort_gain_mean: z.number().finite().optional(),
    effort_gain_sd: z.number().positive().optional(),
    effort_domain_gain_sd: z.number().positive().optional(),
    trait_spread_sd: z.number().positive().optional(),
    sigma_a_indep: z.number().positive().optional(),
    sigma_a_self: z.number().positive().optional(),
    sigma_xi: z.number().positive().optional(),
    effort_mean: z.number().finite().optional(),
    effort_sd: z.number().positive().optional(),
    product_mean: z.number().finite().optional(),
    product_sd: z.number().positive().optional(),
  }).passthrough(),
  inference: z.object({
    engine: z.literal("numpyro_nuts"),
    chains: z.number().int().positive(),
    warmup: z.number().int().positive(),
    samples: z.number().int().positive(),
    retained_draws: z.number().int().positive(),
    target_accept: z.number().gt(0.5).lt(1),
    max_rhat: z.number().gte(1),
    min_ess: z.number().int().positive(),
    max_divergence_fraction: z.number().min(0).lt(1),
    min_ebfmi: z.number().positive(),
  }).strict(),
  tiers: z.object({
    verified: TierSchema,
    ranked: TierSchema,
    domain_max_width: z.number().positive(),
    profile_domain_weight_gate: z.number().gt(0).lt(1),
    practical_margin: z.number().positive().default(1),
  }).strict(),
  diagnostics: z.object({
    cell_outlier_z: z.number().positive(),
    public_residual_gap: z.number().positive(),
    difficulty_drift_per_year: z.number().positive(),
    loo_sd_multiplier: z.number().positive(),
    ordinal_rank_gap: z.number().int().positive(),
    max_log_alpha_width: z.number().positive(),
    shape_misfit_p: z.number().gt(0).lt(1),
    tie_probability: z.number().gt(0.5).lt(1),
  }).strict(),
  acceptance: z.object({
    simulation_datasets: z.number().int().positive(),
    max_median_bias: z.number().positive(),
    interval_coverage_min: z.number().gt(0).lt(1),
    interval_coverage_max: z.number().gt(0).lt(1),
    min_rank_coverage: z.number().gt(0).lte(1),
    min_sparse_provisional_rate: z.number().gt(0).lte(1),
    temporal_cutoff: IsoDateSchema,
    temporal_coverage_min: z.number().gt(0).lt(1),
    temporal_coverage_max: z.number().gt(0).lt(1),
    min_test_retest_icc: z.number().gt(0).lte(1),
    max_test_retest_change: z.number().positive(),
    max_runtime_minutes: z.number().positive(),
  }).strict(),
  price_blend: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
    cache_read_tokens: z.number().nonnegative().default(0),
  }).strict().refine((value) => value.input_tokens + value.output_tokens + value.cache_read_tokens > 0, "price blend cannot be empty"),
}).strict();

export type IndexKind = z.infer<typeof IndexKindSchema>;
export type SystemProfile = z.infer<typeof SystemProfileSchema>;
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type IndexConfig = z.infer<typeof IndexConfigSchema>;
