"use client";

// components/app/usage/UsageExportButton.tsx — client CSV export for the
// usage page (backlog #75). Serializes the by-operation rollup + daily spend
// the server already computed into one RFC-4180 CSV via the shared helper.
// Uses the toast system for feedback.

import { downloadCsv } from "@/lib/client/csv";
import { toast } from "@/lib/client/toast";

type RollupRow = { operation: string; calls: number; creditsSpent: number };
type DailyRow = { day: string; calls: number; creditsSpent: number };

export function UsageExportButton({
  rollup,
  daily,
  days,
}: {
  rollup: RollupRow[];
  daily: DailyRow[];
  days: number;
}) {
  function exportCsv() {
    const header = ["section", "key", "calls", "credits"] as const;
    const rows: (string | number)[][] = [
      ...rollup.map((r) => ["by_operation", r.operation, r.calls, r.creditsSpent]),
      ...daily.map((d) => ["daily", d.day, d.calls, d.creditsSpent]),
    ];
    if (rows.length === 0) {
      toast("No usage to export yet", { kind: "info" });
      return;
    }
    downloadCsv(`pdfcraft-usage-${days}d.csv`, header, rows);
    toast("Usage exported", { kind: "success" });
  }

  return (
    <button type="button" className="btn btn-sm btn-outline" onClick={exportCsv}>
      Export CSV
    </button>
  );
}
