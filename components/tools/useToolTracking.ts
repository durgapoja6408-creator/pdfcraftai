// components/tools/useToolTracking.ts — Shared GA4 funnel hooks.
//
// Most AI tool components have their own run() function rather than
// using the SummarizeVariantTool shared runner — so they each need
// the same four tracking events. This hook + helpers reduce that
// boilerplate to two lines per component.
//
// Usage:
//   const trackTool = useToolTracking("ai-bank-statement");
//   useEffect(() => trackTool.view(), [trackTool]);
//   trackTool.upload(file);
//   trackTool.success({ creditCost, pageCount, processingMs });
//   trackTool.error({ errorCode });

import { useEffect, useMemo } from "react";
import { track } from "@/lib/analytics";

export type ToolTracker = {
  view: () => void;
  upload: (file: File, pageCount?: number) => void;
  success: (args: {
    creditCost: number;
    depth?: string;
    pageCount?: number;
    processingMs?: number;
  }) => void;
  error: (args: { errorCode: string; depth?: string; pageCount?: number }) => void;
  signupRedirect: (fromPath: string) => void;
};

/**
 * Returns a stable tracker object scoped to one tool. The returned
 * object methods are memoised so callers can use them in
 * useEffect/useCallback dependency arrays without re-firing.
 */
export function useToolTracking(toolId: string, group = "AI"): ToolTracker {
  return useMemo<ToolTracker>(
    () => ({
      view() {
        track({
          event: "tool_view",
          tool_id: toolId,
          tool_group: group,
          from: "tool_runner",
        });
      },
      upload(file, pageCount) {
        track({
          event: "tool_upload",
          tool_id: toolId,
          file_size_kb: Math.round(file.size / 1024),
          page_count: pageCount,
        });
      },
      success({ creditCost, depth, pageCount, processingMs }) {
        track({
          event: "tool_run_success",
          tool_id: toolId,
          depth,
          credit_cost: creditCost,
          page_count: pageCount,
          processing_ms: processingMs,
        });
      },
      error({ errorCode, depth, pageCount }) {
        track({
          event: "tool_run_error",
          tool_id: toolId,
          depth,
          error_code: errorCode,
          page_count: pageCount,
        });
      },
      signupRedirect(fromPath) {
        track({
          event: "signup_redirect",
          tool_id: toolId,
          from_path: fromPath,
        });
      },
    }),
    [toolId, group],
  );
}

/**
 * Convenience: fire `tool_view` once on mount. Wraps
 * `useToolTracking().view()` in a useEffect so callers don't
 * have to.
 */
export function useTrackToolView(toolId: string, group = "AI"): ToolTracker {
  const tracker = useToolTracking(toolId, group);
  useEffect(() => {
    tracker.view();
  }, [tracker]);
  return tracker;
}
