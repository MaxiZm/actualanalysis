import type { EvidenceTier } from "@/lib/data";

const TIER_LABEL: Record<EvidenceTier, string> = {
  verified: "Verified",
  ranked: "Ranked",
  provisional: "Provisional",
};

const TIER_TITLE: Record<EvidenceTier, string> = {
  verified: "Verified: narrow interval, four or more domains, low family concentration. Score, rank and pairwise comparisons are published.",
  ranked: "Ranked: passes the ranked evidence gates. Score, rank and pairwise comparisons are published.",
  provisional: "Provisional: evidence gates not met. The median and 90% interval are preliminary; a published rank is withheld.",
};

export function TierBadge({ tier, compact = false }: { tier: EvidenceTier | null | undefined; compact?: boolean }) {
  if (!tier) return null;
  return (
    <span
      className={`badge tier-badge tier-${tier}${compact ? " tier-badge-compact" : ""}`}
      title={TIER_TITLE[tier]}
      aria-label={`${TIER_LABEL[tier]} evidence tier`}
      data-tier={tier}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

export function tierLabel(tier: EvidenceTier | null | undefined): string {
  return tier ? TIER_LABEL[tier] : "Unrated";
}
