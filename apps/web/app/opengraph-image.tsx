import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/site-path";

export const alt = "ActualAnalysis — open model rankings with uncertainty";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ogTokens = {
  paper: "#f8fafc",
  ink: "#182033",
  muted: "#475166",
  rule: "#cbd2df",
  accent: "#174bc6",
  displayFont: "Space Grotesk",
} as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: ogTokens.paper,
          color: ogTokens.ink,
          padding: "64px 72px",
          fontFamily: ogTokens.displayFont,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            style={{ marginRight: 16 }}
          >
            <rect width="64" height="64" rx="13" fill="#0758ce" />
            <path
              d="M9 46 21 18h7l12 28h-8l-7.5-18L17 46H9ZM28 46 40 18h7l12 28h-8l-7.5-18L36 46h-8ZM17 36h15v6H17zM36 36h15v6H36z"
              fill="#fff"
            />
          </svg>
          ActualAnalysis
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 920 }}>
          <div
            style={{
              display: "flex",
              color: ogTokens.accent,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            OPEN · TRACEABLE · REPRODUCIBLE
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              lineHeight: 1.04,
              fontWeight: 700,
              marginTop: 24,
              letterSpacing: -2,
            }}
          >
            Model rankings, with uncertainty.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              lineHeight: 1.35,
              color: ogTokens.muted,
              marginTop: 24,
            }}
          >
            Mixed, Agentic, and Chat capability indexes with benchmark
            provenance and public snapshots.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `2px solid ${ogTokens.rule}`,
            paddingTop: 24,
            fontSize: 20,
            color: ogTokens.muted,
          }}
        >
          <span>{siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          <span>Apache-2.0 code · source licenses apply</span>
        </div>
      </div>
    ),
    size,
  );
}
