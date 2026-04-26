// Legal pages. Ported from prototype content.jsx LEGAL_DOCS with compliance claims
// softened per Phase 1 decision:
//   - "SOC 2 Type II certified (2025 audit by Prescient Assurance)"
//     -> "SOC 2 Type II readiness in progress"
//   - specific physical address removed from top-of-page disclaimers (still on /contact)
//   - dpo@, privacy@, security@ collapsed to support@pdfcraftai.com
//   - subprocessor list kept but marked as "current working draft"
//
// 2026-04-20 — refund-policy, cancellation-policy, shipping-policy added and
// "Working draft" disclaimer banners removed from privacy + terms ahead of the
// Razorpay payment-gateway application. Stripe reference swapped to a
// vendor-agnostic phrasing until the gateway is live.
//
// 2026-04-21 — Privacy + Terms + DPA updated for Paddle MoR signup:
//   * Sub-processors named explicitly (Hostinger, Cloudflare, Google GA4,
//     Microsoft Clarity, Razorpay, Paddle) on /privacy and /dpa. This is
//     time-sensitive: Paddle's verification team crawls /privacy and /terms
//     during KYC and flags missing MoR + sub-processor disclosures.
//   * Cookies & analytics line corrected — "No third-party trackers" was
//     out-of-date the moment GA4 + Clarity landed on 2026-04-20.
//   * Terms gained a "Merchant of record (international customers)" clause
//     so receipts from Paddle are expected rather than a surprise.
//
// 2026-04-22 — Task #24: DPDP Act 2023 (India) + ePrivacy compliance.
//   * Privacy expanded with a dedicated "Your rights under the DPDP
//     Act (India)" section covering the six rights granted by s. 11–14
//     (access, correction, erasure, grievance redressal, nomination,
//     withdrawal). s. 8(10) mandates a Grievance Officer with a 15-day
//     response SLA — we name the role + contact.
//   * Privacy's "Cookies & analytics" section rewritten to disclose
//     consent-gating — GA4 + Clarity only load on "Accept all". Links
//     out to /cookies for the per-cookie inventory.
//   * Privacy adds "Children" section: s. 9 requires verifiable
//     parental consent for under-18s; we address it directly.
//   * Privacy adds "Cross-border transfers" specific to DPDP s. 16.
//   * DPA adds a "DPDP Consent Manager" forward-looking note — MeitY
//     is expected to notify the Consent Manager framework in
//     2026/2027; we commit to integrating once the CM framework is
//     live.

export type LegalSlug =
  | "privacy"
  | "terms"
  | "security"
  | "dpa"
  | "refund-policy"
  | "cancellation-policy"
  | "shipping-policy";

export type LegalSection = { h: string; p: string };

export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  disclaimer?: string; // short note shown above first section
};

const SUPPORT_EMAIL = "support@pdfcraftai.com";

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    updated: "April 26, 2026",
    intro:
      "We designed pdfcraft ai to do the least possible with your data. This policy tells you exactly what that means — and how we handle personal data under the GDPR (EU/UK), the DPDP Act 2023 (India), and comparable regimes elsewhere.",
    sections: [
      {
        h: "What we collect",
        p: "Account info (email, name, password hash), usage metadata (tool name, credits spent, timestamps), and billing info processed by our payment providers. We do not store document contents after processing — see Retention.",
      },
      {
        h: "Retention",
        p: "Uploaded files are deleted from processing servers within 60 minutes of your session ending. Output files are available to you for 24 hours, then permanently deleted. On Studio plans, you can opt into zero-retention mode where we never persist any file.",
      },
      {
        h: "Who sees your files",
        p: "No humans — not us, not contractors. AI tools route through our isolated inference environment or through your own API key if BYOK is on. We never train models on your content.",
      },
      {
        h: "Cookies & analytics",
        p: `We use a first-party cookie for session auth and a first-party cookie to remember your consent choice. Product analytics (Google Analytics 4 and Microsoft Clarity) are CONSENT-GATED: they only load if you click "Accept all" on the banner. Essential cookies (sign-in, CSRF, consent memory) always load because the service cannot function without them. We do not sell personal data. See the /cookies page for the full inventory and a one-click withdrawal button.`,
      },
      {
        h: "Advertising (Google AdSense)",
        p: `When advertising is active on this site we use Google AdSense, a third-party advertising network operated by Google LLC. Google may use the DoubleClick DART cookie to serve ads based on your visit to this site and other sites on the internet. You can opt out of personalized advertising at any time by visiting Google Ads Settings (https://www.google.com/settings/ads), Google's advertising principles (https://policies.google.com/technologies/ads), or aboutads.info (US) / youronlinechoices.eu (EU). Advertising cookies are CONSENT-GATED via the same banner as analytics — if you reject "Accept all", no advertising cookies are set. We do not share personally identifiable information with advertisers. Ad-supported content is clearly labelled "Sponsored" or "Ad" per Google's program policies.`,
      },
      {
        h: "Payments and merchant of record",
        p: "For customers in India, payments are processed by Razorpay Software Pvt. Ltd. on our behalf. For customers outside India, Paddle.com Market Ltd (and its US affiliate Paddle.com Inc.) acts as the merchant of record — meaning Paddle is the seller of record on your invoice and is responsible for collecting and remitting applicable sales taxes, VAT, and GST. Your receipt will show Paddle as the merchant. Card details are entered directly into the payment provider's hosted iframe; we never see, store, or transmit full card numbers.",
      },
      {
        h: "Sub-processors",
        p: "We engage a small number of vetted sub-processors: Hostinger International Ltd (web hosting, EU), Cloudflare Inc. (CDN and DDoS protection, global), Google LLC (Google Analytics 4 and Google Sign-In, US), Microsoft Corporation (Clarity usability analytics, US), Razorpay Software Pvt. Ltd. (India payments, IN), and Paddle.com Market Ltd (international payments, merchant of record, UK). We will give at least 30 days' notice of material changes.",
      },
      {
        h: "International transfers",
        p: "Where personal data is transferred outside the EEA or UK, we rely on the applicable EU Standard Contractual Clauses and the UK International Data Transfer Addendum. Paddle operates its own standard contractual clauses with merchants — we sign those at onboarding and flow them through to you. For Indian residents under the DPDP Act 2023 s. 16, transfers outside India are limited to countries not restricted by the Central Government's notified list; none of our current sub-processors are in restricted jurisdictions.",
      },
      {
        h: "Your rights (GDPR / UK DPA)",
        p: `If you are in the EU, EEA, UK, or Switzerland you have the rights of access, rectification, erasure, portability, restriction of processing, and objection under the GDPR framework. You can export all your data or delete your account instantly from Settings. For anything else email ${SUPPORT_EMAIL} — we respond within 30 days.`,
      },
      {
        h: "Your rights under the DPDP Act (India)",
        p: `If you are a Data Principal in India, the Digital Personal Data Protection Act 2023 grants you: (1) the right to access your personal data and a summary of processing activities (s. 11); (2) the right to correction and erasure (s. 12); (3) the right of grievance redressal within 15 days (s. 13 + s. 8(10)); (4) the right to nominate another person to exercise these rights in the event of death or incapacity (s. 14); (5) the right to withdraw consent at any time, as easily as it was given (s. 6(3)). You can exercise all of these by emailing ${SUPPORT_EMAIL}. Our Grievance Officer for DPDP purposes is reachable at the same address.`,
      },
      {
        h: "Children",
        p: "pdfcraft ai is not directed at children under 13, and under the DPDP Act 2023 s. 9 we do not knowingly process personal data of individuals under 18 without verifiable parental consent. If you believe a child has created an account without consent, email us and we will delete the account and any associated data.",
      },
      {
        h: "Contact",
        p: `Privacy and security questions, and DPDP Grievance Officer requests: ${SUPPORT_EMAIL}. We respond within 15 days for DPDP grievances and within 30 days for other privacy requests.`,
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "April 21, 2026",
    intro:
      "Plain-English terms for using pdfcraft ai. If anything is unclear, ask support — we read every message.",
    sections: [
      {
        h: "Your account",
        p: "You are responsible for keeping your login credentials safe. You must be 13+ to use the service. Business accounts may have additional admin responsibilities.",
      },
      {
        h: "Acceptable use",
        p: "Don't upload content you don't have rights to. Don't use pdfcraft ai to process material that is illegal, harassing, or intended to deceive (e.g. forged documents). We reserve the right to suspend accounts for abuse.",
      },
      {
        h: "Credits & billing",
        p: `Credits are consumed as you use AI tools. Paid credits never expire. Bonus credits expire per the offer terms. Refunds for unused credit packs are available within 14 days — see the Refund Policy or email ${SUPPORT_EMAIL}.`,
      },
      {
        h: "Merchant of record (international customers)",
        p: "For customers outside India, Paddle.com Market Ltd (United Kingdom) and its US affiliate Paddle.com Inc. act as the merchant of record for purchases made on pdfcraft ai. This means Paddle — not pdfcraft ai — is the seller of record on your invoice, is responsible for collecting and remitting applicable sales taxes, VAT, and GST in your jurisdiction, and handles billing support for tax-related questions. Paddle's Buyer Terms apply to the purchase transaction; these pdfcraft ai Terms apply to your use of the service. For customers in India, payments are processed directly by pdfcraft ai through Razorpay and these Terms govern the transaction in full.",
      },
      {
        h: "Cancellation",
        p: "You can stop using pdfcraft ai at any time. Account deletion is self-serve from Settings. See the Cancellation Policy for details on subscriptions and credit packs.",
      },
      {
        h: "Service availability",
        p: "We target 99.9% uptime. We don't guarantee uninterrupted service, but we'll tell you when something's wrong at our status page.",
      },
      {
        h: "Intellectual property",
        p: "You own your documents and outputs. We own the service, models, and UI. Don't reverse-engineer or rebrand pdfcraft ai.",
      },
      {
        h: "Limitation of liability",
        p: "To the maximum extent permitted by law, our liability is limited to the amount you paid us in the 12 months preceding the incident.",
      },
      {
        h: "Governing law",
        p: "These terms are governed by the laws of India. Disputes will be resolved in the courts of Chennai, Tamil Nadu.",
      },
    ],
  },
  security: {
    title: "Security",
    updated: "April 2, 2026",
    intro:
      "How we keep your documents and account safe — the practices we follow today and the certifications we are working toward.",
    disclaimer:
      "Aspirational document. Items listed below represent our target security posture. Formal certifications (SOC 2, HIPAA BAA) are in progress and not yet issued.",
    sections: [
      {
        h: "Encryption",
        p: "TLS in transit. AES-256 at rest. File contents are encrypted with per-tenant keys, managed in a cloud key-management service with automatic rotation.",
      },
      {
        h: "Infrastructure",
        p: "Hosted on isolated virtual networks per environment. Production access is SSO + hardware-key-gated for a small, audited group of engineers.",
      },
      {
        h: "Compliance (in progress)",
        p: "SOC 2 Type II readiness in progress. We follow the GDPR framework for EU/UK data subjects. HIPAA BAA will be made available on Studio plans once our compliance review is complete.",
      },
      {
        h: "Secure SDLC",
        p: "Every PR is reviewed and passes static analysis, dependency scanning, and secret detection before merge. We plan to engage third-party pen-testers annually and publish summaries as they become available.",
      },
      {
        h: "Incident response",
        p: "On-call rotation in place. Customers will be notified promptly and in line with applicable laws in the event of a confirmed breach affecting their data.",
      },
      {
        h: "Report a vulnerability",
        p: `Responsible disclosure is welcomed at ${SUPPORT_EMAIL}. A formal bounty program is in development.`,
      },
    ],
  },
  dpa: {
    title: "Data Processing Addendum",
    updated: "April 22, 2026",
    intro:
      "For customers processing personal data of EU/UK/Swiss data subjects, and for Indian Data Fiduciaries routing processing through pdfcraft ai under the DPDP Act 2023. Auto-executed when you subscribe to any paid plan.",
    sections: [
      {
        h: "Roles",
        p: "For GDPR purposes you are the Controller of personal data in documents you upload; pdfcraft ai is the Processor acting only on your documented instructions. For DPDP Act 2023 purposes (India), you are the Data Fiduciary and pdfcraft ai is the Data Processor — we process personal data only on your instruction and do not determine the purpose or means of processing.",
      },
      {
        h: "Subprocessors",
        p: "We engage the following sub-processors: Hostinger International Ltd (web hosting, EU), Cloudflare Inc. (CDN and DDoS protection, global), Google LLC (Google Analytics 4 and Google Sign-In, US), Microsoft Corporation (Clarity usability analytics, US), Razorpay Software Pvt. Ltd. (India payments, IN), and Paddle.com Market Ltd (international payments, merchant of record, UK). We will give at least 30 days' notice of material changes to this list.",
      },
      {
        h: "International transfers",
        p: "Where personal data is transferred outside the EEA or UK, we rely on the applicable EU Standard Contractual Clauses and UK IDTA. Paddle operates its own SCCs with merchants; we have signed Paddle's DPA at merchant onboarding. Under DPDP Act s. 16, Indian personal data may be transferred to any country not restricted by the Central Government's notified list — no current sub-processor is in a restricted jurisdiction. Data residency options (EU-only, IN-only) will be made available on Studio plans as our infrastructure build-out completes.",
      },
      {
        h: "DPDP Consent Manager (forward-looking)",
        p: "The Ministry of Electronics and Information Technology (MeitY) is expected to notify operational rules and the Consent Manager framework under the DPDP Act 2023 in 2026. Once the CM framework is live and registered Consent Managers are operational, pdfcraft ai will integrate consent artefact lifecycle (issuance, withdrawal, audit trail) via the designated Consent Manager(s) of the Data Fiduciary's choice. Until then, consent is collected directly (see our cookie banner and the /cookies page) and stored in first-party cookies with a full audit trail.",
      },
      {
        h: "Security measures",
        p: "See our Security page for the technical and organizational measures (TOMs) we apply, including encryption, access controls, and our in-progress SOC 2 readiness program.",
      },
      {
        h: "Data subject / Data Principal rights",
        p: "We assist you in responding to access, rectification, deletion, and portability requests within 30 days of your forwarded request (GDPR) or within 15 days for DPDP Act grievances. Our Grievance Officer is reachable at support@pdfcraftai.com.",
      },
      {
        h: "Audits",
        p: `You may audit our compliance annually via written request. We will share in-progress readiness reports under NDA. Requests: ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  "refund-policy": {
    title: "Refund Policy",
    updated: "April 20, 2026",
    intro:
      "We want you to be happy with pdfcraft ai. This page explains exactly when and how refunds work.",
    sections: [
      {
        h: "Credit packs",
        p: "Credit packs are one-time purchases. You can request a refund for any unused credits within 14 days of purchase. Credits that have already been consumed on AI tool runs are not refundable.",
      },
      {
        h: "Bonus credits",
        p: "Promotional or bonus credits granted for free are not eligible for refund. Only credits you paid for are refundable.",
      },
      {
        h: "How to request a refund",
        p: `Email ${SUPPORT_EMAIL} from the address associated with your account. Include the order reference or transaction ID from your receipt. Most refund requests are processed within 2 business days.`,
      },
      {
        h: "How refunds are returned",
        p: "Refunds are issued to the original payment method used for the purchase. Depending on your bank or card issuer, the money typically appears in your account within 5–10 business days after we process the refund.",
      },
      {
        h: "Failed or duplicate payments",
        p: `If you were charged but no credits appeared in your account, or if you see a duplicate charge, email ${SUPPORT_EMAIL} with the transaction ID. Duplicate or failed-transaction refunds are processed on priority, typically within 1 business day.`,
      },
      {
        h: "Chargebacks",
        p: "If you believe a charge is incorrect, please contact us before filing a chargeback with your bank. We resolve almost all billing questions within 1 business day and would rather sort it out with you directly.",
      },
      {
        h: "Contact",
        p: `Refund questions: ${SUPPORT_EMAIL}. Reply within 1 business day.`,
      },
    ],
  },
  "cancellation-policy": {
    title: "Cancellation Policy",
    updated: "April 20, 2026",
    intro:
      "You can stop using pdfcraft ai at any time. This page covers how cancellation works for credit packs, subscriptions, and accounts.",
    sections: [
      {
        h: "Credit packs",
        p: "Credit packs are one-time purchases — there is nothing to cancel on an ongoing basis. You simply stop using the service. Unused paid credits are refundable within 14 days of purchase per our Refund Policy.",
      },
      {
        h: "Subscriptions (Plus plan)",
        p: "You can cancel your subscription at any time from Settings → Billing. Cancellation takes effect at the end of your current billing period — you keep access until then. We do not pro-rate mid-period cancellations, but we do honor refund requests in good faith within the first 14 days of a new subscription.",
      },
      {
        h: "Account deletion",
        p: "You can delete your account instantly from Settings. Deletion is permanent and removes your files, usage history, and any remaining credits. If you have unused paid credits and want them refunded, request the refund before deleting the account.",
      },
      {
        h: "Cancellation by us",
        p: "We reserve the right to suspend or terminate accounts that violate our Terms (abuse, fraud, illegal use). In those cases we will notify you at the email on file and, where appropriate, refund any unused paid credits.",
      },
      {
        h: "Contact",
        p: `Cancellation questions: ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  "shipping-policy": {
    title: "Shipping & Delivery Policy",
    updated: "April 20, 2026",
    intro:
      "pdfcraft ai is a digital service. There is nothing physical to ship — but here is exactly how delivery works.",
    sections: [
      {
        h: "Digital service — no physical shipment",
        p: "pdfcraft ai is a software-as-a-service product delivered entirely over the internet. No physical goods are shipped to you at any time. The \"shipping\" terminology on this page is used only because payment regulators require it for every merchant website.",
      },
      {
        h: "Credit delivery timeline",
        p: "Credits are added to your account balance instantly after a successful payment — typically within 30 seconds. You will see the updated balance in Settings → Billing and receive an email receipt at the address on your account.",
      },
      {
        h: "If credits do not appear",
        p: `If credits do not appear within 15 minutes of a successful payment, email ${SUPPORT_EMAIL} with your transaction ID. We will investigate and either credit your account or issue a refund within 1 business day.`,
      },
      {
        h: "Service availability",
        p: "We target 99.9% uptime. Planned maintenance is announced at our status page. Unplanned outages are disclosed promptly; any credits or subscription time lost to prolonged outages will be restored or refunded in good faith.",
      },
      {
        h: "Geographic availability",
        p: "pdfcraft ai is available globally over the public internet. Some AI features may be unavailable in jurisdictions where the underlying model providers restrict access; where that is the case, we do not charge for the restricted feature.",
      },
      {
        h: "Contact",
        p: `Delivery questions: ${SUPPORT_EMAIL}.`,
      },
    ],
  },
};

export const LEGAL_SLUGS: LegalSlug[] = [
  "privacy",
  "terms",
  "refund-policy",
  "cancellation-policy",
  "shipping-policy",
  "security",
  "dpa",
];
