// useCreditEstimate — client hook for the /api/ai/estimate endpoint.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §5 + Day 2.5.
//
// Pattern
//   const { credits, balance, canRun, loading, error } =
//     useCreditEstimate("summarize", { pageCount });
//
// Behaviour
//   - Returns null credits/balance until the first non-empty input
//     arrives. (E.g. before the user uploads a PDF.)
//   - Re-fetches whenever the deps change.
//   - Debounces by 200ms so rapid input changes (e.g. user dragging
//     a slider) don't spam the endpoint.
//   - Auth required → 401 → returns { error: "auth_required" }
//     and the consumer renders a sign-in CTA.
//   - Rate-limited → 429 → returns { error: "rate_limited" }, the
//     consumer can show a soft retry message.
//
// Why a custom hook (not SWR / React Query)
//   - Zero new deps. Repo doesn't currently use either lib.
//   - The endpoint is fast, cache-free, request-scoped — full
//     re-fetch on dep change is the right semantic.

"use client";

import { useEffect, useRef, useState } from "react";

interface EstimateInput {
  pageCount?: number;
  charCount?: number;
}

interface EstimateResponse {
  credits: number;
  balance: number;
  canRun: boolean;
}

export interface EstimateState {
  /** null until the first successful estimate */
  credits: number | null;
  balance: number | null;
  canRun: boolean | null;
  loading: boolean;
  /** Error code from the endpoint, or "network" / "unknown" */
  error: string | null;
}

export function useCreditEstimate(
  op: string,
  input: EstimateInput,
): EstimateState {
  const [state, setState] = useState<EstimateState>({
    credits: null,
    balance: null,
    canRun: null,
    loading: false,
    error: null,
  });

  // Stringify the input so the effect dep-list is comparable. JSON
  // is fine here — input is small + flat.
  const inputKey = JSON.stringify({ op, ...input });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Skip if we have nothing measurable to send. Keeps the endpoint
    // off the wire when the form is empty.
    const hasInput =
      typeof input.pageCount === "number" || typeof input.charCount === "number";
    if (!hasInput) {
      setState((s) => ({ ...s, loading: false, error: null }));
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    debounceRef.current = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch("/api/ai/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op, ...input }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (res.status === 401) {
          setState({
            credits: null,
            balance: null,
            canRun: null,
            loading: false,
            error: "auth_required",
          });
          return;
        }

        if (res.status === 429) {
          setState((s) => ({ ...s, loading: false, error: "rate_limited" }));
          return;
        }

        if (!res.ok) {
          setState((s) => ({ ...s, loading: false, error: `http_${res.status}` }));
          return;
        }

        const body: EstimateResponse = await res.json();
        setState({
          credits: body.credits,
          balance: body.balance,
          canRun: body.canRun,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "unknown";
        setState((s) => ({ ...s, loading: false, error: msg }));
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  return state;
}
