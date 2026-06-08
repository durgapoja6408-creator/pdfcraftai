// components/landing/TrustSection.tsx — "Built in the open" trust block.
//
// Honest social proof for an early-stage, solo-operated product. The strongest
// truthful trust signal we have today is TRANSPARENCY (built by one person, in
// public, with a real changelog and an honest security posture) + verifiable
// PRODUCT FACTS (tool counts, free-forever, zero-retention). Live usage numbers
// are shown ONLY once they clear a credibility floor (see lib/public-stats.ts) —
// so we never put a tiny or test-inflated number in front of a visitor.
//
// Async server component: reads the cached getPublicStats() (never throws).

import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { TOOL_STATS } from "@/lib/tools";
import { getPublicStats } from "@/lib/public-stats";

type IconKey = keyof typeof I;

function Tile({ icon, big, label }: { icon: IconKey; big: string; label: string }) {
  const Ic = I[icon];
  return (
    <div className="card" style={{ padding: 24, textAlign: "center" }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 12px",
          color: "var(--fg-muted)",
        }}
      >
        <Ic size={16} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{big}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export async function TrustSection() {
  const stats = await getPublicStats();

  return (
    <section className="section" style={{ background: "var(--bg-1)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="container-x">
        <div style={{ textAlign: "center", marginBottom: 40, maxWidth: 680, marginLeft: "auto", marginRight: "auto" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>BUILT IN THE OPEN</div>
          <h2 style={{ fontSize: 40, marginBottom: 16 }}>Made by one person. In public.</h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            pdfcraft ai is built and run by one person — no VC, no growth team, no
            dark patterns. What you see is what ships: an honest changelog, a
            security posture that says exactly what&apos;s done versus on the roadmap,
            and free tools that are actually free. If something&apos;s broken or missing,
            it gets fixed in the open.
          </p>
        </div>

        {/* Verifiable product facts — always true, always shown. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
            gap: 12,
          }}
        >
          <Tile icon="Check" big={`${TOOL_STATS.total}`} label="tools, one workspace" />
          <Tile icon="Sparkle" big={`${TOOL_STATS.free}`} label="free forever — no signup" />
          <Tile icon="Shield" big="0" label="documents stored by free tools" />
          {stats.showLive ? (
            <>
              <Tile icon="Receipt" big={stats.documentsProcessed.toLocaleString()} label="documents processed" />
              <Tile icon="Sparkle" big={stats.aiOpsRun.toLocaleString()} label="AI operations run" />
            </>
          ) : (
            <Tile icon="Book" big="100%" label="free tools run in your browser" />
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 28, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/changelog" className="btn btn-ghost">Read the changelog</Link>
          <Link href="/about" className="btn btn-ghost">About the maker</Link>
        </div>
      </div>
    </section>
  );
}
