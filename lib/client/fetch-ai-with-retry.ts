/**
 * M20 (#193, 2026-04-29): AI tool fetch with exponential-backoff retry.
 *
 * Why: AI tool POSTs to /api/ai/* land on Hostinger's LSAPI workers
 * which occasionally 502/503 under load (cgroup thread cap, build
 * propagation, redeploy churn — see CLAUDE.md §5). Without retry, a
 * transient failure surfaces as a generic "Summarize failed — check
 * your connection" error to a user who already paid the upload cost
 * (a 50MB PDF over a slow connection is a bad time to fail). With
 * retry, ~95% of these recover within 5 seconds.
 *
 * Why retry is safe: every AI tool builds a per-click `idempotencyKey`
 * (cryptoUUID, see lib/ai/credits.ts and the call sites in components/
 * tools/*.tsx). The server route's ledger has a unique index on that
 * key. If we retry the SAME idempotencyKey, the second attempt either:
 *   (a) reaches a healthy worker before the first transaction lands —
 *       the second wins, the first 5xx'd anyway
 *   (b) reaches a worker after the first transaction lands — the
 *       unique index conflict short-circuits to the cached result
 * Either way, the user is never double-charged.
 *
 * What's retried: 502, 503, 504, 408 (transient server-side), and
 * `TypeError` on fetch (network-level — no DNS, fetch threw before
 * a response was received).
 *
 * What's NOT retried:
 *  - 4xx (request was bad; retry won't help)
 *  - 5xx other than the four above (likely permanent)
 *  - 200 / 207 (server already processed)
 *  - AbortError (caller cancelled — see M5)
 *
 * Backoff schedule: 1s, 2s, 4s. Max 3 attempts (1 original + 2 retries).
 */

"use client";

const TRANSIENT_HTTP = new Set([408, 502, 503, 504]);
const BACKOFF_MS = [1000, 2000, 4000] as const;
const MAX_ATTEMPTS = 3;

export interface FetchAiOptions {
  /**
   * Build a fresh body for each attempt. FormData is single-use —
   * once consumed, the underlying File stream can't be re-read. The
   * caller closes over the source File and re-creates the FormData
   * each call.
   */
  bodyFactory: () => FormData;
  /**
   * Called before each attempt (1-indexed). UI can show "Retrying…
   * (2/3)" or similar. Optional — silent retry is fine.
   */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  /**
   * Optional AbortSignal. If aborted, retry stops immediately and
   * the AbortError propagates.
   */
  signal?: AbortSignal;
}

/**
 * POST to an AI op route with retry on transient failure.
 *
 * Returns the final Response (success OR a non-retryable error
 * status). Caller handles status-based branching as before; retry
 * is transparent.
 */
export async function fetchAiWithRetry(
  url: string,
  opts: FetchAiOptions,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    opts.onAttempt?.(attempt, MAX_ATTEMPTS);

    try {
      const res = await fetch(url, {
        method: "POST",
        body: opts.bodyFactory(),
        signal: opts.signal,
      });
      // Retry only the transient HTTP statuses.
      if (TRANSIENT_HTTP.has(res.status) && attempt < MAX_ATTEMPTS) {
        // Drain the body so the connection returns to the pool cleanly
        // (some browsers leak otherwise). We don't care about the
        // content of an error response here.
        await res.body?.cancel().catch(() => {});
        lastError = res;
        await sleep(BACKOFF_MS[attempt - 1]!, opts.signal);
        continue;
      }
      // Anything else — success OR permanent failure — return as-is.
      return res;
    } catch (err) {
      // AbortError — caller cancelled. Bubble up unmodified.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      // Network-level failure (TypeError on fetch). Retry if we have
      // attempts left.
      if (err instanceof TypeError && attempt < MAX_ATTEMPTS) {
        lastError = err;
        await sleep(BACKOFF_MS[attempt - 1]!, opts.signal);
        continue;
      }
      // Out of attempts (or non-retryable error). Re-throw.
      throw err;
    }
  }

  // Should be unreachable — the loop either returns or throws. If we
  // somehow exhaust the loop without doing either (bug), surface what
  // we last saw.
  if (lastError instanceof Response) return lastError;
  throw lastError ?? new Error("fetchAiWithRetry: exhausted attempts");
}

/**
 * setTimeout-based delay that respects an AbortSignal. Resolves on
 * timeout or rejects with AbortError if signal fires first.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
