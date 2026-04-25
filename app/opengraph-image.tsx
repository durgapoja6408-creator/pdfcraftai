// app/opengraph-image.tsx - Site-wide default OG image (Task #74).
//
// Next 14 reads this file and exposes the rendered output at
// /opengraph-image. Every page inherits it as the default
// og:image / twitter:image unless that page overrides it.
//
// We use Next's `ImageResponse` API which renders limited JSX/CSS
// on Vercel-style Edge runtime to a 1200x630 PNG at build/render
// time. Twitter, LinkedIn, Slack, WhatsApp, Facebook, iMessage,
// Discord - all consume this. Today every preview is blank; after
// this lands, every share card shows the brand and tagline.
//
// No external assets required. We use system-safe geometry + text
// only, so the image renders identically across all crawlers.

import { ImageResponse } from "next/og";

// Hostinger LSAPI runs on Node, not edge. Keep this on the default
// Node runtime - works the same, just needs Node's `Buffer` for
// the PNG encode. Edge would 503 here.
export const alt =
  "pdfcraft ai - Every PDF tool you need. Free, AI-powered, no signup.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage(): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0a0a0f 0%, #15151c 50%, #1f1015 100%)",
          padding: "80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          color: "#fafafa",
        }}
      >
        {/* Subtle grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            display: "flex",
          }}
        />

        {/* Wordmark row (logo + brand) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "linear-gradient(135deg, #ff6b6b 0%, #d2467e 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 700,
              color: "#fafafa",
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "baseline",
            }}
          >
            <span>pdfcraft</span>
            <span style={{ color: "#ff6b6b", marginLeft: 4 }}>ai</span>
          </div>
        </div>

        {/* Main copy block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 90,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              color: "#fafafa",
              display: "flex",
            }}
          >
            Every PDF tool you need.
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginTop: 8,
              background: "linear-gradient(90deg, #ff8c8c 0%, #c47cd9 50%, #6cc5e6 100%)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            Plus the ones you didn&apos;t know existed.
          </div>
        </div>

        {/* Footer reassurance row */}
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: "auto",
            fontSize: 24,
            color: "#a3a3ad",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3ecf8e", fontSize: 28 }}>+</span> 87 tools
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3ecf8e", fontSize: 28 }}>+</span> Free forever
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3ecf8e", fontSize: 28 }}>+</span> No signup
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3ecf8e", fontSize: 28 }}>+</span> AI-powered
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
