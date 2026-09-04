import { ImageResponse } from "next/og";

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
      <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700 }}>
        <div style={{ width: 20, height: 20, background: ogTokens.accent, marginRight: 16 }} />
        ActualAnalysis
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: 920 }}>
        <div style={{ display: "flex", color: ogTokens.accent, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
          OPEN · TRACEABLE · REPRODUCIBLE
        </div>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.04, fontWeight: 700, marginTop: 24, letterSpacing: -2 }}>
          Model rankings, with uncertainty.
        </div>
        <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: ogTokens.muted, marginTop: 24 }}>
          Mixed, Agentic, and Chat capability indexes with benchmark provenance and public snapshots.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${ogTokens.rule}`, paddingTop: 24, fontSize: 20, color: ogTokens.muted }}>
        <span>actualanalysis.org</span>
        <span>Apache-2.0 code · source licenses apply</span>
      </div>
    </div>,
    size,
  );
}
