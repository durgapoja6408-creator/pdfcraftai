// app/og/route.tsx — dynamic Open Graph share card.
//
// Until now every page shared one static /og.png. This generates a
// per-page card (1200×630) from ?title + ?subtitle, so a /tool/<id>
// link shared on Slack / X / LinkedIn / iMessage shows the tool's own
// name instead of the generic brand image. Tool pages point their
// openGraph.images / twitter.images here (see app/tool/[id]/page.tsx).
//
// Runtime: nodejs (Hostinger's managed Node app doesn't run the Edge
// runtime). next/og bundles a default font, so no font loading needed.
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
// Crawlers fetch this rarely and cache it; allow a long edge/CDN cache.
export const revalidate = 86400;

const ACCENT = "#0066ff";
const BG = "#0b0d12";
const FG = "#f2f4f8";
const MUTED = "#9aa3b2";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "pdfcraft ai").slice(0, 80);
  const subtitle = (
    searchParams.get("subtitle") || "Every PDF tool you need — free for the basics, AI for the rest."
  ).slice(0, 130);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "72px",
        }}
      >
        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "34px",
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ marginLeft: "18px", fontSize: "30px", color: FG, fontWeight: 600 }}>
            pdfcraft ai
          </div>
        </div>

        {/* title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "48px", height: "6px", background: ACCENT, marginBottom: "26px" }} />
          <div style={{ display: "flex", fontSize: "68px", fontWeight: 700, color: FG, lineHeight: 1.1, maxWidth: "1000px" }}>
            {title}
          </div>
          <div style={{ display: "flex", marginTop: "22px", fontSize: "30px", color: MUTED, lineHeight: 1.35, maxWidth: "940px" }}>
            {subtitle}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", fontSize: "24px", color: MUTED }}>
          pdfcraftai.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
