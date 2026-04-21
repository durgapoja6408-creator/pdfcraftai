// Paddle webhook endpoint.
//
// Configure in Paddle dashboard → Developer Tools → Notifications:
//   Notification URL: https://pdfcraftai.com/api/webhooks/paddle
//                     (sandbox: same URL — Paddle sends separate
//                     sandbox and live traffic, we differentiate by
//                     PADDLE_ENV which picks the right webhook secret)
//   Secret key: stored as PADDLE_WEBHOOK_SECRET on Hostinger.
//
// Event types to subscribe for (maps to PaddleProvider.normalize in
// lib/payments/adapters/paddle.ts):
//   transaction.completed
//   transaction.paid
//   transaction.payment_failed
//   adjustment.created        (refunds + chargebacks)
//   adjustment.updated
//   subscription.activated
//   subscription.created
//   subscription.updated
//   subscription.canceled
//   subscription.paused
//   subscription.past_due
//
// Paddle signs the body with header `paddle-signature: ts=...;h1=...`.
// The adapter's verifyWebhook() handles parsing + HMAC check + replay-
// window enforcement; this route is just wiring.

import { handleWebhook } from "@/lib/payments/webhook-handler";

// Never cache — every webhook is unique.
export const dynamic = "force-dynamic";
// Route handlers must run on Node for `crypto.createHmac` (the edge
// runtime's WebCrypto is present but our adapter uses the Node API).
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleWebhook(req, {
    providerId: "paddle",
    // Paddle doesn't send a stable event id header on every event (it
    // embeds `event_id` in the body). The webhook-handler falls back
    // to hashing the body when extractEventId returns null, so we pass
    // null here and let the handler do that.
    extractEventId: () => null,
  });
}
