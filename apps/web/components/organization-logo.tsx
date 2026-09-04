import Image from "next/image";
import { sitePath } from "@/lib/site-path";
const logos: Record<string, string> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  "Google DeepMind": "google",
  Google: "google",
  "Meta AI": "meta",
  Meta: "meta",
  DeepSeek: "deepseek",
  Alibaba: "qwen",
  "Alibaba / Qwen": "qwen",
  "Mistral AI": "mistral",
  Mistral: "mistral",
  "Moonshot AI": "moonshot",
  xAI: "xai",
  SpaceXAI: "xai",
  "Zhipu AI": "zai",
  "Z AI": "zai",
  "Z.ai": "zai",
  Cohere: "cohere",
  Microsoft: "microsoft",
  NVIDIA: "nvidia",
  Amazon: "aws",
  MiniMax: "minimax",
  "Sapiens AI": "agnesai",
  Tencent: "tencent",
  Upstage: "upstage",
  Xiaomi: "xiaomimimo",
};
export function OrganizationLogo({ organization }: { organization: string }) {
  const key = logos[organization];
  if (
    organization === "Thinking Machines" ||
    organization === "Thinking Machines Lab"
  )
    return (
      <Image
        className="organization-logo organization-logo-color"
        src={sitePath("/logos/thinking-machines.png")}
        width={20}
        height={20}
        alt={`${organization} logo`}
      />
    );
  return key ? (
    <Image
      className="organization-logo"
      src={sitePath(`/logos/${key}.svg`)}
      width={20}
      height={20}
      alt={`${organization} logo`}
    />
  ) : (
    <span className="organization-monogram" aria-label={organization}>
      {organization.slice(0, 2)}
    </span>
  );
}
