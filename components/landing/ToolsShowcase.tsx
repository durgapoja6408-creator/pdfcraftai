import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { GROUP_ORDER, toolsByGroup } from "@/lib/tools";

export function ToolsShowcase() {
  // 2026-05-02 — same ai-chat exclusion that ToolFilter.tsx applies to
  // /tools (added 2026-05-01 with Option B). The homepage tool grid
  // had been showing the ai-chat card linking to /tool/ai-chat which
  // 308-redirects to /chat-with-pdf, wasting one redirect hop on
  // every click. Chat has its own first-class top-nav slot now.
  // Surfaced via end-to-end QA of /chat-with-pdf entry funnel.
  const grouped = toolsByGroup((t) => t.id !== "ai-chat");
  return (
    <section className="section">
      <div className="container-x">
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            SIXTEEN TOOLS · ONE WORKSPACE
          </div>
          <h2 style={{ fontSize: 44, maxWidth: 680, margin: "0 auto" }}>
            Free for the everyday. AI for the impossible.
          </h2>
        </div>

        {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
          <div key={group} style={{ marginBottom: 32 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <div className="row">
                <h3 style={{ fontSize: 18 }}>{group}</h3>
                {group === "AI" ? (
                  <span className="chip chip-ai">Credits</span>
                ) : (
                  <span className="chip chip-free">Free</span>
                )}
              </div>
              <span className="mono subtle" style={{ fontSize: 12 }}>
                {grouped[group].length} tools
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {grouped[group].map((t) => {
                const Ic = I[t.icon];
                return (
                  // #20 (2026-04-29): prefetch={false} on the homepage
                  // tool grid. Same fix as ToolFilter.tsx (the /tools
                  // index). The homepage is the highest-traffic page on
                  // the site — its tool grid was the worst contributor
                  // to the LSAPI 503 cascade. Hover-prefetch still
                  // works for explicitly-set false (Next default), so
                  // navigation feels instant once a user actually aims
                  // at a card.
                  <Link key={t.id} href={`/tool/${t.id}`} prefetch={false} className="card card-hover" style={{ padding: 18 }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: t.free ? "var(--blue-soft)" : "var(--accent-soft)",
                          color: t.free ? "var(--blue)" : "var(--accent)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Ic size={18} />
                      </div>
                      {t.free ? (
                        <span className="chip chip-free">Free</span>
                      ) : (
                        <span className="chip chip-ai">AI</span>
                      )}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                      {t.desc}
                    </div>
                    {t.cost && (
                      <div
                        className="mono"
                        style={{ marginTop: 16, fontSize: 11, color: "var(--fg-subtle)" }}
                      >
                        {t.cost}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
