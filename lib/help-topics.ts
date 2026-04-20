// Help center topics + articles. Drives `/help` (grid) and `/help/[slug]`
// (article pages). Each article carries a short, paragraph-style `body` so
// the help surface stops being a 24-title shell.

import type { IconName } from "@/components/icons/Icons";

export type HelpArticle = {
  slug: string;
  title: string;
  /** One-sentence summary used in card lists + search results. */
  summary: string;
  /** Article body as paragraphs. Rendered as <p> elements. */
  body: string[];
};

export type HelpTopic = {
  slug: string;
  name: string;
  icon: IconName;
  blurb: string;
  arts: HelpArticle[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: "getting-started",
    name: "Getting started",
    icon: "Zap",
    blurb: "Bring your first PDF in and get a feel for how pdfcraft works.",
    arts: [
      {
        slug: "your-first-merge",
        title: "Your first PDF merge",
        summary:
          "Combine two or more PDFs into a single document — works without an account.",
        body: [
          "Open the Merge tool, drop your PDFs onto the upload area, and drag the cards into the order you want them in. Click Merge and the file downloads in a few seconds.",
          "Everything happens in your browser — your files never leave your device. That is why merge works for huge files (we have tested up to 200 MB) and is genuinely free, with no daily quota.",
          "Need to insert a single page from one PDF into another? Merge first, then use the Rotate & Reorder tool to drag the inserted pages where you want them.",
        ],
      },
      {
        slug: "supported-file-formats",
        title: "Upload file formats we support",
        summary:
          "PDF for every tool. JPG and PNG for the Image to PDF converter. Word/Excel/PowerPoint coming soon.",
        body: [
          "Free tools accept PDFs up to 100 MB per file. The Image to PDF converter additionally accepts JPG and PNG up to 20 MB per image.",
          "AI tools accept the same PDF range. For OCR, scanned PDFs and image-only PDFs both work.",
          "Word, Excel and PowerPoint conversion is on the roadmap. Today the easiest path is: print to PDF on your desktop, then run the result through whichever pdfcraft tool you need.",
        ],
      },
      {
        slug: "how-credits-work",
        title: "How credits work",
        summary:
          "Credits power AI tools. Free tools never spend credits. Paid credits never expire.",
        body: [
          "Each AI tool quotes a credit cost up front — Summarize is 3, Translate is 5, OCR is roughly 2 per page, Compare is 15. The exact figure is shown before you confirm the run, so you never get a surprise charge.",
          "Free tools (Merge, Split, Compress, Rotate & Reorder, Page Numbers, Image to PDF) cost zero credits and run entirely in your browser.",
          "Paid credits never expire. Refunds are available within 14 days for any unused credits — see the refund policy article for the form.",
        ],
      },
      {
        slug: "creating-an-account",
        title: "Creating an account",
        summary:
          "Sign up with email + password or Continue with Google. Takes about ten seconds.",
        body: [
          "Click Sign up in the top right. You can use email + password, or skip the form entirely with Continue with Google.",
          "There is no email verification gate today — you land on the dashboard immediately. We will start verifying email addresses once the transactional mail provider is wired (see the changelog for status).",
          "If you signed up with Google and later want to add a password, head to Settings → Security and set one. Both sign-in methods will work for the same account.",
        ],
      },
    ],
  },
  {
    slug: "ai-tools",
    name: "AI tools",
    icon: "Sparkle",
    blurb: "Get the most out of Summarize, Translate, OCR, Compare and Chat.",
    arts: [
      {
        slug: "chat-with-pdf-prompts",
        title: "Chat with PDF: prompt tips",
        summary:
          "Short, specific prompts produce sharper answers — and eat fewer credits.",
        body: [
          "Ask one question at a time. Compound questions (\"summarize the abstract and then list the methodology\") tend to produce blurry, generic answers because the model has to balance two goals at once.",
          "Anchor your question to a section: \"In the Risk Factors section, what does the company say about supply chain disruption?\" Citing the section in the prompt almost always gives you a citation in the answer.",
          "If an answer feels off, follow up with \"Quote the exact sentence that supports that.\" — pdfcraft's Chat tool is built to admit when something isn't in the document.",
        ],
      },
      {
        slug: "summary-credit-cost",
        title: "Why did my summary cost more credits?",
        summary:
          "Documents over 100 pages or with heavy table content get tiered pricing.",
        body: [
          "Summarize is 3 credits for documents up to 100 pages. Above that, we charge 1 extra credit per additional 50 pages because the model has to fan out across multiple chunks and then re-combine.",
          "Tables and figures also cost slightly more. A 60-page financial statement with 30 tables can come in at 4–5 credits even though the page count is small, because each table is parsed separately for accuracy.",
          "If you want a strict ceiling, run the Compress tool first to drop image weight, then Summarize. The page count stays the same but the tool runs faster and never accidentally tips into the next tier.",
        ],
      },
      {
        slug: "translate-large-pdf",
        title: "Translating a 200-page PDF",
        summary:
          "Layout is preserved. Expect 3–4 minutes per 100 pages and one credit per 20 pages.",
        body: [
          "Translate works page-by-page in parallel, so a 200-page document usually finishes in about 6 minutes. Pricing is 5 credits flat for documents up to 100 pages, and 1 extra credit per additional 20 pages above that.",
          "Layout is preserved — fonts, columns, table structure and page breaks all carry over. Inline images stay in place; only the text inside the PDF is replaced.",
          "If the source PDF is a scan, run OCR first. Translate cannot translate text that isn't actually text yet.",
        ],
      },
      {
        slug: "redacting-custom-patterns",
        title: "Redacting custom patterns",
        summary:
          "Auto-detect handles common PII. Add a custom regex for project codes, internal IDs, or anything else.",
        body: [
          "By default, Redact picks up emails, phone numbers, credit card numbers, US/EU/UK national IDs, and physical addresses.",
          "To redact something specific to your business — say, project codenames matching `PRJ-\\d{5}` — paste the regex into the Custom patterns field. You can add as many as you want; each is applied independently.",
          "The output PDF has true redaction (the underlying text is removed, not just covered with black), so the redacted content cannot be selected, copied, or recovered with a PDF parser.",
        ],
      },
    ],
  },
  {
    slug: "security-privacy",
    name: "Security & privacy",
    icon: "Shield",
    blurb: "How we handle your files and what GDPR/SOC controls are in place.",
    arts: [
      {
        slug: "where-files-are-stored",
        title: "Where are my files stored?",
        summary:
          "Free tools store nothing. AI tools store encrypted files for up to 60 minutes, then delete.",
        body: [
          "Free tools (Merge, Split, Compress, Rotate, Page Numbers, Image to PDF) run fully in your browser. Nothing is uploaded to a server — when you close the tab, the file is gone.",
          "AI tools temporarily upload your file to process it. Files are encrypted at rest with AES-256, processed within a few seconds to a few minutes, and then deleted automatically within 60 minutes — sooner if you click Delete now on the result page.",
          "Files are stored in our EU region by default. Enterprise customers can pin to a US or APAC region — contact us if that matters for your compliance regime.",
        ],
      },
      {
        slug: "gdpr-and-dpa",
        title: "GDPR & DPA",
        summary:
          "We are a data processor under GDPR. A DPA is available — sign-as-needed, no negotiation.",
        body: [
          "pdfcraft acts as a data processor for all customer-uploaded content. The full data processing addendum is available at /dpa and signs without negotiation for all paid plans.",
          "Subject access requests (export, rectification, erasure) can be filed by the account owner from Settings → Privacy, or by emailing privacy@pdfcraftai.com. We respond within 30 days, usually within 5 business days.",
          "See the GDPR overview at /gdpr for the data categories we collect, our sub-processors, and how to contact our DPO.",
        ],
      },
      {
        slug: "sso-setup",
        title: "SSO setup",
        summary:
          "Google SSO is live for everyone. SAML/OIDC for Okta, Entra ID and JumpCloud is on the Plus and Team plans.",
        body: [
          "Google SSO works out of the box — click Continue with Google on /login. No admin configuration required.",
          "SAML/OIDC SSO with your IdP (Okta, Microsoft Entra ID, JumpCloud, OneLogin, custom OIDC) is included on Plus and Team plans. Open Settings → Team → SSO to start the configuration. We provide entity ID, ACS URL and metadata XML; you provide the IdP metadata file or URL back.",
          "Just-in-time provisioning is supported. SCIM directory sync is on the roadmap for Q3 2026.",
        ],
      },
      {
        slug: "zero-retention-mode",
        title: "Zero-retention mode",
        summary:
          "On Plus and Team plans, AI tools can run with no temporary file storage at all.",
        body: [
          "Zero-retention mode streams your file directly into the AI worker, processes it, returns the result, and forgets the source — nothing is written to disk on our side, even temporarily.",
          "Enable it per-workspace at Settings → Privacy → Zero retention. Once enabled, every AI run from that workspace honors the setting; you do not need to remember to flip it on each time.",
          "There is a small latency cost (typically 100–300 ms per request) because we cannot pre-cache the parsed document tree. For most documents the difference is invisible.",
        ],
      },
    ],
  },
  {
    slug: "billing",
    name: "Billing",
    icon: "Credit",
    blurb: "Refunds, invoices, team sharing and auto-refill.",
    arts: [
      {
        slug: "refund-policy",
        title: "Refund policy",
        summary:
          "Unused credits are refundable within 14 days, no questions asked.",
        body: [
          "Any unused credits can be refunded within 14 days of purchase. Open Settings → Billing → Purchases, click the receipt you want to refund, then Request refund. The refund returns to your original payment method within 5–10 business days.",
          "Used credits aren't refundable, but if a tool failed (say, OCR returned garbage on a clean scan) you can flag the run from Settings → Billing → Usage and we will credit them back manually within one business day.",
          "Subscriptions can be canceled any time from Settings → Billing. Cancellation stops the next renewal — you keep access through the end of the current billing period.",
        ],
      },
      {
        slug: "tax-invoices-vat",
        title: "Tax invoices & VAT",
        summary:
          "Invoices include VAT/GST/sales tax for jurisdictions where required.",
        body: [
          "Every purchase generates a tax invoice automatically. Find them at Settings → Billing → Invoices. Each invoice includes the buyer name, address, tax ID (if you've filled it in), and a per-line VAT/GST breakdown.",
          "If your business has a VAT/GST number, add it under Settings → Billing → Tax details. We will reverse-charge VAT for valid EU/UK numbers and zero-rate for valid GST numbers in supported regions.",
          "Need an invoice reissued in another company's name? Email billing@pdfcraftai.com with the original receipt number — we usually turn this around the same day.",
        ],
      },
      {
        slug: "team-credit-sharing",
        title: "Team credit sharing",
        summary:
          "On Team plans, all members draw from a single shared credit pool.",
        body: [
          "Team plans use a shared credit pool. The org admin can set per-member monthly caps under Settings → Team → Limits — useful when a single member doesn't need access to the whole pool.",
          "Credit usage by member is visible at Settings → Team → Usage. You can export the report as CSV for chargeback to internal cost centers.",
          "If you cross the pool's monthly cap, AI tools queue rather than fail — the next refill date is shown to the user with a clear ETA.",
        ],
      },
      {
        slug: "auto-refill-credits",
        title: "Refilling credits automatically",
        summary:
          "Set a low-balance threshold and we top up the same pack again, on the same card.",
        body: [
          "Auto-refill watches your balance. When it drops below the threshold you set, we re-purchase the same credit pack on the same card. The default threshold is 10 credits.",
          "Configure it under Settings → Billing → Auto-refill. You can also set a monthly cap so a runaway script can't drain your card.",
          "Every auto-refill sends an email receipt before the charge so it never feels surprising.",
        ],
      },
    ],
  },
  {
    slug: "api-developers",
    name: "API & developers",
    icon: "Code",
    blurb: "Quickstart, signed webhooks, rate limits, and error codes.",
    arts: [
      {
        slug: "api-quickstart",
        title: "Quickstart in 5 minutes",
        summary:
          "Generate a key, install the SDK or curl an endpoint, get a signed result URL back.",
        body: [
          "Open Settings → API keys, generate a key, and store it as PDFCRAFT_API_KEY. Free tools are key-less; AI tools require a key.",
          "Run a summarize: `curl -X POST https://api.pdfcraftai.com/v1/summarize -H 'Authorization: Bearer $PDFCRAFT_API_KEY' -F file=@/path/to/file.pdf`. The response includes a signed URL to the summary, valid for 60 minutes.",
          "Official SDKs ship for Node and Python. The Node SDK auto-retries 429s with backoff; the Python SDK supports both sync and asyncio.",
        ],
      },
      {
        slug: "webhook-signatures",
        title: "Webhook signatures",
        summary:
          "Every webhook is signed with HMAC-SHA256. Verify the signature before trusting the payload.",
        body: [
          "Each webhook request includes a `pdfcraft-signature` header containing a timestamp and a HMAC-SHA256 hash of `{timestamp}.{raw_body}`, signed with your webhook secret.",
          "To verify: split the header on commas, recompute the HMAC with your secret, and compare in constant time. Reject the request if the timestamp is older than 5 minutes (replay protection).",
          "If you rotate the webhook secret, both the old and new signatures are accepted for 24 hours so you have time to deploy the new key.",
        ],
      },
      {
        slug: "rate-limits",
        title: "Rate limits",
        summary:
          "1000 req/hr per key on free, 10k/hr on Plus, 100k/hr on Team. Burst tolerated.",
        body: [
          "Default rate limit is 1000 requests per hour per API key on the Starter plan, 10,000 on Plus, 100,000 on Team. Bursts up to 50 requests per second are tolerated as long as you don't sustain them.",
          "When you hit the limit you get a 429 with `retry-after` set to the seconds until the bucket refills. The Node SDK auto-retries; if you're rolling your own client, honour the header.",
          "Long-running operations (Summarize, Translate, OCR) count once per request, not per-page, so you can batch large files without exhausting the quota.",
        ],
      },
      {
        slug: "error-codes",
        title: "Error codes",
        summary:
          "401 invalid key, 402 out of credits, 413 file too big, 422 corrupt PDF, 5xx is on us.",
        body: [
          "401 means the API key is missing, malformed, or revoked. Check Settings → API keys to confirm the key is still active.",
          "402 means the call would have spent more credits than the account has. Top up at /pricing or set auto-refill.",
          "413 means the uploaded file exceeded the per-tool size limit (100 MB for PDF tools, 20 MB per image for Image to PDF). 422 means the PDF parsed successfully but is corrupt or password-protected; unlock it first.",
        ],
      },
    ],
  },
  {
    slug: "troubleshooting",
    name: "Troubleshooting",
    icon: "Help",
    blurb: "When something feels off, start here.",
    arts: [
      {
        slug: "file-wont-upload",
        title: "File won't upload",
        summary:
          "Almost always one of: file too large, browser denied disk read, or an extension blocking the request.",
        body: [
          "Check the file size first. Free tools cap at 100 MB; AI tools at 100 MB; Image to PDF at 20 MB per image.",
          "If the size is fine, try a different browser. Some privacy extensions block file picker access; an incognito window with extensions off is the fastest way to confirm.",
          "If the upload starts and then stalls, your network may be silently dropping the connection. Switch to a wired connection or a different network and try again. Free tools never actually upload (they read locally), so a stall there means the file picker itself failed — refresh the page.",
        ],
      },
      {
        slug: "ocr-quality-poor",
        title: "OCR quality is poor",
        summary:
          "Most low-quality OCR is upstream — improve the scan resolution or run Compress first to clean noise.",
        body: [
          "OCR works best on scans at 300 DPI or higher. If your source is 150 DPI or below, accuracy drops to 80–90%; at 100 DPI it can fall below 70%.",
          "If you can't re-scan, try running Compress first with the High Quality preset. It does a light denoise pass that often improves OCR confidence by 5–10 points.",
          "For non-Latin scripts (Devanagari, Arabic, CJK), make sure you have explicitly chosen the language in the OCR settings — auto-detect is conservative and will fall back to English when in doubt.",
        ],
      },
      {
        slug: "chat-citations-missing-pages",
        title: "Chat citations missing pages",
        summary:
          "Usually means the source PDF is image-only and hasn't been OCR'd, so there is no text layer to cite.",
        body: [
          "Open the PDF and try to highlight a sentence. If you can't, the document has no text layer — Chat is reading it via OCR on the fly, and citation precision drops.",
          "Run the OCR tool first to bake a text layer into the PDF, then upload the OCR'd version to Chat. Citations will be precise to the line.",
          "If the PDF does have a text layer but citations still feel off, the issue is usually multi-column layouts. Mention the column in your prompt (\"in the right-hand column on page 4…\") and Chat will respect the boundary.",
        ],
      },
      {
        slug: "lost-password",
        title: "I lost my password",
        summary:
          "Open /forgot-password, enter your email, follow the reset link.",
        body: [
          "Go to /forgot-password, enter your account email, and click Send reset link. We always return success even if the email doesn't have an account, to avoid letting attackers enumerate users.",
          "The reset link arrives within a couple of minutes and is good for one hour. If you don't get it, check spam and the Promotions tab in Gmail.",
          "If you signed up with Google originally, there is no password to reset — go straight to /login and click Continue with Google.",
        ],
      },
    ],
  },
];

/** Flat helper for the search box and dynamic route. */
export const ALL_HELP_ARTICLES: { topic: HelpTopic; article: HelpArticle }[] =
  HELP_TOPICS.flatMap((topic) => topic.arts.map((article) => ({ topic, article })));

export function findHelpArticle(slug: string):
  | { topic: HelpTopic; article: HelpArticle }
  | undefined {
  return ALL_HELP_ARTICLES.find(({ article }) => article.slug === slug);
}
