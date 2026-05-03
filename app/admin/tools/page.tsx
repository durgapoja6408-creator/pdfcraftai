// app/admin/tools/page.tsx — index of AI ops with a row per op.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §7.
//
// What this page shows
//   One row per known AIOperationId from lib/pricing.ts. Each row
//   shows the op name, base cost, multiplier rule, and a "View →"
//   link to /admin/tools/[op] for the full per-op detail page.
//
// Why this index over a derived-from-data list
//   We could COUNT(DISTINCT operation) FROM ai_usage to enumerate
//   ops with traffic. Driving from AI_OPERATION_COSTS instead means:
//     - Newly-shipped ops show up here even before their first call.
//     - Sunset ops still in pricing but not in production traffic
//       are visible.
//     - The base-cost + multiplier-rule columns are pulled from the
//       same canonical config the routes use; no drift risk.

import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import {
  AI_OPERATION_COSTS,
  type AIOperationId,
} from "@/lib/pricing";
import { SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function multiplierRuleLabel(op: AIOperationId): string {
  switch (op) {
    case "ocr":
    case "redact":
    case "sign":
      return "× pageCount";
    case "translate":
      return "× chunks (ceil(chars/10K))";
    default:
      return "flat";
  }
}

export default async function AdminToolsIndexPage() {
  await requireAdmin();

  const ops = Object.entries(AI_OPERATION_COSTS) as Array<
    [AIOperationId, number]
  >;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Tools</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          One row per AI op. Click View for per-op stats (calls, credits,
          cost, margin, success rate, provider mix, top users).
        </p>
      </header>

      <section>
        <SectionTitle>AI operations ({ops.length})</SectionTitle>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Op</Th>
              <Th>Base cost</Th>
              <Th>Multiplier rule</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {ops.map(([op, cost]) => (
              <tr key={op}>
                <Td><code>{op}</code></Td>
                <Td>{cost} credits</Td>
                <Td><span className="muted">{multiplierRuleLabel(op)}</span></Td>
                <Td>
                  <Link
                    href={`/admin/tools/${op}`}
                    style={{ color: "var(--accent)" }}
                  >
                    View →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
