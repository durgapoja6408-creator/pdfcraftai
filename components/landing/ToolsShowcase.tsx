import { ToolsShowcaseGroups } from "@/components/landing/ToolsShowcaseGroups";

export function ToolsShowcase() {
  // Server wrapper: renders the section heading + container, then the
  // collapsible category accordion (a client component). The accordion shows
  // the full catalog grouped into collapsible sections (AI sub-grouped into 6
  // themes, AI-first). ai-chat is excluded inside ToolsShowcaseGroups (it has
  // its own top-nav slot; the card used to waste a 308 hop to /chat-with-pdf).
  return (
    <section className="section">
      <div className="container-x">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            SIXTEEN TOOLS · ONE WORKSPACE
          </div>
          <h2 style={{ fontSize: 44, maxWidth: 680, margin: "0 auto" }}>
            Free for the everyday. AI for the impossible.
          </h2>
        </div>

        <ToolsShowcaseGroups />
      </div>
    </section>
  );
}
