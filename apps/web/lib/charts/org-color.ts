import { organizationColorIndex } from "../chart-math";

const NAMED: Record<string, string> = {
  anthropic: "var(--org-anthropic)", openai: "var(--org-openai)", google: "var(--org-google)",
  xai: "var(--org-xai)", meta: "var(--org-meta)", deepseek: "var(--org-deepseek)",
  alibaba: "var(--org-alibaba)", moonshot: "var(--org-moonshot)", mistral: "var(--org-mistral)",
};

export function orgColor(organization?: string): string {
  if (!organization) return "var(--org-other)";
  const key = organization.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  for (const [name, color] of Object.entries(NAMED)) if (key.includes(name)) return color;
  return `var(--color-org-${organizationColorIndex(organization, 12) + 1})`;
}
