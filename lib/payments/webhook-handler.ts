// Shared webhook handler — the per-provider route files (app/api/webhooks/
// razorpay/route.ts and .../paddle/route.ts) are thin wrappers that call
// `handleWebhook` with a providerId + a function that extracts the
// provider-specific event ID from headers/body.
//
// Response codes follow the industry conventions:
//   200 — delivered / idempotent duplicate / ignored event. Provider
//         treats this as "done, don't retry".
//   400 — signature verification failed or malformed. Provider should
//         NOT retry a bad signature; the problem is config drift on our
//         side, not transient.
//   500 — genuine processing error (DB down, upstream timeout). Provider
//         retries with backoff.

import "server-only";
import { getProvider } from "./registry";
import { applyPaymentEvent, recordWebhookEvent } from "./ledger";
import type { ProviderId } from "./types";

export type WebhookHandlerOptions = {
  /**
   * Provider to route the request through. Matches the `id` field on
   * the PaymentProvider instance (e.g. "razorpay", "paddle").
   */
  providerId: ProviderId;
  /**
   * Extract the provider's event id so we can dedupe in `webhook_events`.
   * Razorpay reads from headers; Paddle embeds the event_id in the body
   * (so the extractor receives both). Return null if no usable id is
   * present — the handler will synthesize one from signature + timestamp
   * so the audit row still lands.
   */
  extractEventId: (args: {
    headers: Record<string, string>;
    parsedBody: unknown;
  }) => string | null;
};

export async function handleWebhook(
  req: Request,
  opts: WebhookHandlerOptions
): Promise<Response> {
  // 1. Read RAW body BEFORE touching req.json(). Signature checks
  //    operate on the exact bytes the provider signed.
  const rawBody = await req.text();

  // 2. Normalize header access — Headers is case-insensitive but our
  //    adapter expects lowercase string keys.
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // 3. Load the adapter from the env-driven registry.
  const provider = await getProvider(opts.providerId);
  if (!provider) {
    // Env not configured OR unknown provider. 404 so misconfigured
    // webhook URLs surface loudly in the provider dashboard — we
    // shouldn't silently 200 on a provider we can't actually process.
    return new Response(
      JSON.stringify({ error: `provider ${opts.providerId} not configured` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Verify signature. This MUST run on the raw body.
  const verification = await provider.verifyWebhook({
    rawBody,
    headers,
  });

  if (!verification.ok) {
    // Bad signature or malformed — 400 signals the provider this is
    // a client error they shouldn't retry forever.
    return new Response(
      JSON.stringify({ error: "verification_failed", reason: verification.reason }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const event = verification.event;

  // 5. Audit log — dedupe on (providerId, providerEventId). We do this
  //    BEFORE processing so retried webhooks are cheap no-ops at the
  //    audit layer too.
  let parsedBody: unknown = null;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // Shouldn't happen — adapter already parsed it successfully during
    // verification — but defensive.
  }

  const providerEventId =
    opts.extractEventId({ headers, parsedBody }) ??
    // Fallback: synthesize from signature header + timestamp so we at
    // least have *something* unique for the audit dedupe.
    `${headers["x-razorpay-signature"] ?? headers["paddle-signature"] ?? "unknown"}:${Math.floor(event.occurredAt.getTime() / 1000)}`;

  const eventTypeLabel =
    event.kind === "ignored"
      ? event.eventType
      : event.kind; // for non-ignored, just use our normalized kind

  const audit = await recordWebhookEvent({
    providerId: opts.providerId,
    providerEventId,
    eventType: eventTypeLabel,
    normalizedKind: event.kind,
    paymentId: event.kind === "ignored" ? null : event.internalPaymentId || null,
    rawPayload: event.providerRaw,
  });

  if (!audit.recorded) {
    // Seen this event before. 200 so the provider stops retrying.
    return new Response(
      JSON.stringify({ status: "duplicate" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 6. Process. Any error here bubbles as 500 so the provider retries.
  try {
    const result = await applyPaymentEvent(event);
    return new Response(
      JSON.stringify({ status: "ok", result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Log to server output — Hostinger surfaces these in the Node.js
    // logs tab. We intentionally DON'T leak the error body to the
    // provider; a generic 500 is enough for them to retry.
    console.error(
      `[webhook:${opts.providerId}] applyPaymentEvent threw:`,
      err
    );
    return new Response(
      JSON.stringify({ error: "processing_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
