// Blog post data. Ported from prototype content.jsx BLOG_POSTS.
// Body content: only ai-redact-v2 has real prose (matching the prototype's hardcoded body).
// Other 5 posts show a "Coming soon" placeholder per Phase 1 decision.

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  cat: string;
  date: string; // display string, e.g. "Apr 14, 2026"
  iso: string; // ISO date for <time> and OG metadata
  read: string; // e.g. "6 min"
  author: {
    name: string;
    role: string;
    initial: string;
  };
  body?: BlogBlock[]; // if undefined, post shows "Coming soon" placeholder
};

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "quote"; text: string };

export const BLOG_POSTS: BlogPost[] = [
  // 2026-05-12 — PENDING_WORK_ANALYSIS §7a (stale content cadence)
  // closure. Pairs with the same-day /compare intent-router ship
  // (commit 788d7f0) — this post is the natural editorial complement,
  // explaining the verb-led decision framework readers see at /compare.
  // Listed first so it shows on top of the blog index by date order.
  {
    slug: "pick-the-right-pdf-tool",
    title: "How to pick the right PDF tool in 30 seconds",
    excerpt:
      "A simple verb-led framework for cutting through a 120-tool catalog — plus when AI is worth the credits and when the free tool wins.",
    cat: "Guide",
    date: "May 12, 2026",
    iso: "2026-05-12",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      {
        type: "p",
        text: "We added our hundredth tool a while back. We are now well past that. The catalog covers everything from merging two PDFs to fine-grained AI workflows like redacting personal data or summarising a 200-page contract. It is a lot to look at if all you wanted was a quick answer to 'I have a PDF, I want to do X'.",
      },
      {
        type: "p",
        text: "After watching our analytics for six months we noticed something obvious in hindsight: the people who land on the catalog page and then bounce are usually searching for a verb, not a tool name. 'Compress PDF' is a verb. 'Merge PDFs' is a verb. 'Reduce file size for email' is a verb. The actual tool name (Optimise, Combine, Linearise) is something they would only know if they had used the tool before.",
      },
      {
        type: "h3",
        text: "The 30-second framework",
      },
      {
        type: "p",
        text: "Pick the verb that matches what you want to do. Match it to the right tool family. Decide free or AI based on the rule below. That is the whole framework. It works because most PDF tasks fall into one of about twelve verbs — and every PDF tool you can imagine, no matter who makes it, slots into one of those buckets.",
      },
      {
        type: "p",
        text: "Combine, split, convert (out of PDF), convert (into PDF), shrink, understand, fill or sign, protect or unlock, translate, redact, compare, annotate. That is it. If you can name what you want as one of those twelve verbs, you have a 60-second path to the right tool. We just shipped a page at /compare that maps the verbs to the tools so you do not have to memorise the mapping.",
      },
      {
        type: "h3",
        text: "When AI is worth the credits",
      },
      {
        type: "p",
        text: "Roughly half the catalog is free in-browser tools (Merge, Split, Compress, Convert, Unlock, Sign, …) and the other half is AI-powered tools that cost credits (Summarise, Translate, Chat, Redact, Compare-by-content, …). Picking between them is a judgement call but it usually comes down to three questions.",
      },
      {
        type: "quote",
        text: "Does the task require understanding the content of the document, or just rearranging the bytes? If it is just rearranging the bytes, the free tool will do it.",
      },
      {
        type: "p",
        text: "Merging two PDFs does not require understanding what they say — the bytes get rearranged. Compressing a PDF rearranges the bytes. Splitting at page 12 rearranges the bytes. None of those need AI. They run in your browser, free, and produce identical output to anything an AI tool would charge you for.",
      },
      {
        type: "p",
        text: "Summarising a 50-page report DOES require understanding the content. So does answering a question about it. So does deciding which sentences contain personally-identifying information that need redacting. Those are the cases where the credit cost is buying something the free tool genuinely cannot produce.",
      },
      {
        type: "h3",
        text: "The middle ground: extract text",
      },
      {
        type: "p",
        text: "There is a category of task that lives between the two. 'I want to know what this PDF says' could mean 'I want to skim the text quickly' (free Extract Text does this — pulls every word out, you read it) or 'I want a one-paragraph summary' (AI Summarise does this — costs credits, saves you the skim).",
      },
      {
        type: "p",
        text: "If you are unsure, try the free extract first. The whole pipeline takes about three seconds and you might find the document is short enough that skimming is faster than waiting for a summary. If the text turns out to be too long or too dense, the AI tool is one click away.",
      },
      {
        type: "h3",
        text: "Try the page",
      },
      {
        type: "p",
        text: "We built /compare to make this framework concrete. Twelve intent groups, each with one to three tools, with Free and AI versions clearly badged where both exist. If the verb you want is not on the page, the catalog at /tools has every tool we ship — but for the eighty percent of queries that fit one of the twelve verbs, /compare is faster.",
      },
    ],
  },
  {
    slug: "ai-redact-v2",
    title: "AI Redact v2: 10× faster, now with custom patterns",
    excerpt:
      "Our detection model just got a rewrite. Here's what's new, how we trained it, and why batch jobs now run in seconds.",
    cat: "Product",
    date: "Apr 14, 2026",
    iso: "2026-04-14",
    read: "6 min",
    author: { name: "Priya Sharma", role: "Head of AI · pdfcraft ai", initial: "P" },
    body: [
      {
        type: "p",
        text: "When we started pdfcraft ai, our goal was simple: make PDFs less awful. Three years in, the product has grown past what we expected, and the team has grown with it.",
      },
      { type: "h3", text: "What changed" },
      {
        type: "p",
        text: "The original redaction pipeline was a single pass over each page, detecting entities and masking them in one go. It worked, but performance fell apart on scanned documents above 50 pages.",
      },
      {
        type: "quote",
        text: "We rewrote the core detection path from scratch this quarter. The result: 10× faster throughput and a new suite of custom-pattern rules.",
      },
      { type: "h3", text: "The new pipeline" },
      {
        type: "p",
        text: "The new architecture splits the work into three stages — OCR, classification, and masking — each horizontally scalable. We also added custom-pattern support so teams can register their own regexes for internal IDs, case numbers, or other domain-specific tokens.",
      },
      {
        type: "p",
        text: "We're just getting started. If you have a workflow you'd like us to support, drop us a line — we read everything.",
      },
    ],
  },
  {
    slug: "byok-guide",
    title: "A practical guide to Bring Your Own Key",
    excerpt:
      "When BYOK makes sense, when it doesn't, and how to wire up Anthropic + OpenAI in under two minutes.",
    cat: "Guide",
    date: "Apr 8, 2026",
    iso: "2026-04-08",
    read: "9 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
  },
  {
    slug: "pdf-security-2026",
    title: "PDF security in 2026: what every team should know",
    excerpt:
      "Encryption, redaction, metadata leaks, and the quiet problem of OCR residue.",
    cat: "Security",
    date: "Mar 29, 2026",
    iso: "2026-03-29",
    read: "12 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
  },
  {
    slug: "legal-ai-workflows",
    title: "Five AI workflows legal teams actually ship",
    excerpt:
      "From clause extraction to conflict checks — the playbook we hear most often from AmLaw 200 firms.",
    cat: "Workflows",
    date: "Mar 21, 2026",
    iso: "2026-03-21",
    read: "8 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
  },
  {
    slug: "launching-api",
    title: "Announcing the pdfcraft ai API",
    excerpt:
      "REST, webhooks, SDKs, and a free tier for hobby projects. Build with PDFs like you build with Stripe.",
    cat: "Product",
    date: "Mar 12, 2026",
    iso: "2026-03-12",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
  },
  {
    slug: "summarize-technique",
    title: "Why our summarizer cites page numbers (and yours should too)",
    excerpt:
      "Hallucinations are a trust problem. Here's the technique we use to make every claim traceable.",
    cat: "Engineering",
    date: "Feb 28, 2026",
    iso: "2026-02-28",
    read: "11 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
  },

  // ========================================================
  // SEO Ship #9 (2026-04-25): 20 tutorial blog posts. Each is a
  // self-contained how-to mapped to a specific top tool. Word counts
  // run 400-700 each — substantive enough to rank, tight enough to
  // ship in one batch.
  // ========================================================

  {
    slug: "how-to-merge-pdfs-without-losing-bookmarks",
    title: "How to merge PDFs without losing bookmarks or hyperlinks",
    excerpt: "The default merge in most tools strips bookmarks. Here's how to keep them — and reconcile internal links to the new page numbers.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Merging PDFs is one of the most common operations on this site, and most of the time it just works. The corner case people hit is that the merged file loses its bookmarks — the side-panel navigation outline that lets you jump to chapters or sections. If your inputs were chapters of a book or sections of a report, that side panel is the entire reason you wanted a single document instead of multiple. Losing it defeats the purpose." },
      { type: "h3", text: "Why bookmarks disappear during a bad merge" },
      { type: "p", text: "Cheap merge implementations concatenate page streams and write a fresh document with no outline. Bookmarks are a separate structural feature of the PDF format — pointers that say 'this title goes to that page'. They live in the document's outline tree, not in the page content. If the merge tool only copies pages, the outline tree gets thrown away." },
      { type: "h3", text: "How a proper merge handles them" },
      { type: "p", text: "When you merge with pdfcraft ai's free Merge tool, we copy the outline trees from each input and rewrite their page references to point into the merged document. Bookmark text stays the same; only the page numbers shift. Internal hyperlinks that pointed to a different page within the same source PDF get reconciled the same way — they now land on the correct page in the merged output. External hyperlinks (to web URLs) survive untouched because they don't depend on page numbers." },
      { type: "h3", text: "What you need to do" },
      { type: "p", text: "Nothing different from a normal merge. Drop in your PDFs, drag thumbnails to set the order, click Merge. The bookmark reconciliation happens automatically. Open the result in any PDF reader and you should see the combined outline in the side panel — chapter names from each input, in source order, with the right pages." },
    ],
  },

  {
    slug: "compress-pdf-for-email-the-5mb-problem",
    title: "Compress PDF for email — the 5 MB problem",
    excerpt: "Gmail caps you at 25 MB. Some corporate gateways cap you at 5 MB. Here's how to land just under any cap without making the file look like a fax.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Bouncing PDFs because they're too big to email is the dumbest tax we pay on modern work. The fix is 30 seconds. Knowing how to do it right saves you a 'can you re-send that smaller?' email and the half-day delay it adds." },
      { type: "h3", text: "Pick a target, not a level" },
      { type: "p", text: "Most compress tools ask you to pick Light/Balanced/Strong, and then you guess. The smarter mental model: pick a target SIZE first ('under 5 MB', 'under 24 MB for Gmail'), then choose the gentlest level that gets you there. We don't yet ship a built-in compress tool ourselves (pdf-lib doesn't support compression; we're building a server-side qpdf+ghostscript pipeline) — until then, Adobe Acrobat Online's free tier or iLovePDF's compress will get you to a target size." },
      { type: "h3", text: "Why email caps vary" },
      { type: "p", text: "Gmail caps at 25 MB, Outlook 365 ranges 20-35 MB depending on tenant config, government and bank gateways often cap at 5-10 MB. Each cap is per-message including all attachments — a 24 MB compressed PDF leaves room for the message itself but not for additional files." },
      { type: "h3", text: "Pitfalls" },
      { type: "p", text: "Don't compress twice — each pass re-encodes already-compressed JPEGs, compounding artifacts. Don't use Strong on print-bound documents — 150 DPI is fine on screen but soft on paper. Don't compress signed PDFs — compression rewrites the byte layout and voids cryptographic signatures." },
    ],
  },

  {
    slug: "pdf-to-word-when-it-works",
    title: "PDF to Word conversion: when it works, when it doesn't",
    excerpt: "Some PDF-to-Word conversions come out clean. Some come out as a wall of text-frames. The difference is what was in the source.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "6 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "PDF-to-Word is one of the most-searched PDF operations and one of the most over-promised. The reason: PDF is a fixed-layout format and Word is a flow-layout format. Converting between them is structural translation, not a 1:1 copy. Quality depends almost entirely on what was in the source PDF." },
      { type: "h3", text: "When it works cleanly" },
      { type: "p", text: "PDFs exported from Word, Google Docs, or InDesign — anything with a real text layer and structured paragraphs — round-trip nearly perfectly. The fonts come through, tables convert as tables, headings come through as styled headings, hyperlinks survive. This covers most modern office documents." },
      { type: "h3", text: "When it gets harder" },
      { type: "p", text: "Scans without OCR are the worst case — the converter has nothing to read. Run AI OCR first, then convert; quality jumps to 'usable after a quick proofread' (95%+ on 300 DPI scans of typed text). Two-column magazine layouts reflow into single-column Word — the order may need a check." },
      { type: "h3", text: "What pdfcraft ai does differently" },
      { type: "p", text: "We detect whether the source has a text layer and pick the right pipeline automatically. Digital PDFs go through structure-aware extraction. Scans get OCR first, then the same structure detection on the recognized text. The output is a real .docx with real styles, not a sequence of absolutely-positioned text frames." },
    ],
  },

  {
    slug: "ocr-scanned-pdf-make-searchable",
    title: "How to OCR a scanned PDF and make it searchable",
    excerpt: "Cmd+F doesn't work on scans because there's no text layer. Here's how to add one without changing how the document looks.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "A scanned PDF is an image of pages, not text. Cmd+F (or Ctrl+F) returns nothing because there's no text to find. Spotlight, Windows Search, Google Drive — none of them index scans. OCR is the bridge: it adds a hidden text layer aligned with the page image, so the document looks identical but suddenly behaves like a text PDF." },
      { type: "h3", text: "Why this matters more than people realize" },
      { type: "p", text: "An archive you can't search is a haystack with no needle. Most legacy archives — medical records, old contracts, court files — sit as image-only PDFs because that's what scanners produced. OCR turns 'we have it somewhere' into 'we can find it in 10 seconds'." },
      { type: "h3", text: "How to OCR with pdfcraft ai" },
      { type: "p", text: "Upload the scan to AI OCR or Make PDF Searchable. Both add a text layer. Set the language explicitly for cleaner results, especially on mixed-language documents. The output looks pixel-identical to the scan but Cmd+F now works." },
      { type: "h3", text: "Scan quality matters more than the OCR engine" },
      { type: "p", text: "Most of the OCR-quality battle is won at scan time. Scan at 300 DPI grayscale (not color — color is bigger without being more accurate). Scan flat with the page parallel to the platen. Below 200 DPI, accuracy drops fast; below 150 DPI, OCR isn't worth running." },
    ],
  },

  {
    slug: "split-pdf-by-range-size-bookmark",
    title: "Splitting PDFs by range, size, or bookmark — which mode to pick",
    excerpt: "Splitting page-by-page is different from splitting by file size, which is different from splitting at section bookmarks. Each fits a different job.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Splitting a PDF looks like a single feature but is actually four. Splitting page-by-page produces N files. Splitting by custom range pulls out a known section. Splitting by file size targets an upload cap. Splitting at bookmarks breaks a long document into one file per chapter automatically." },
      { type: "h3", text: "Each page as a separate file" },
      { type: "p", text: "Use this when downstream systems expect single-page documents. Invoice processing pipelines, OCR batchers, signature workflows that route page-by-page. Don't use it for casual splits — N files for a 200-page document is unwieldy." },
      { type: "h3", text: "Custom ranges (1-3, 5, 7-9)" },
      { type: "p", text: "Use this when you know which pages you want. Extracting a chapter, an appendix, a specific exhibit. Watch for accidental overlaps — 1-5, 4-10, 9-15 produces three files with duplicate pages. Our parser flags overlaps; read the warning before clicking Split." },
      { type: "h3", text: "By file size" },
      { type: "p", text: "Use this when the destination has a per-file cap. Email gateways at 25 MB, court e-filing portals at 35 MB. Tell us your target ('split by size, target 24 MB') and we iterate to land just under." },
      { type: "h3", text: "By bookmark" },
      { type: "p", text: "Use this to break a long document into one file per chapter automatically. Requires the source PDF to have a bookmark structure — most exported reports do, most scans don't." },
    ],
  },

  {
    slug: "translate-pdf-without-breaking-layout",
    title: "How to translate a PDF without breaking its layout",
    excerpt: "Plain-text translation gives you a wall of text. Layout-preserving translation gives you a usable document. Here's the difference.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Translating a PDF means doing two things at once: rendering the text in another language, and rebuilding a document that still looks like a document. Most online translators get the first part right and the second part wrong — they hand you back a wall of plain text." },
      { type: "h3", text: "How pdfcraft ai's translator handles layout" },
      { type: "p", text: "We extract the text along with layout coordinates, group it into translation-coherent units (paragraph, table cell, heading), translate each unit while keeping structural context, then re-typeset the translated text into the original layout boxes. When the translation runs longer than the source, we adjust line spacing or font size by 2-3% to fit." },
      { type: "h3", text: "Choose the right tone" },
      { type: "p", text: "Formal vs neutral vs conversational changes how 'you' is translated and how nouns are gendered in romance languages. HR handbooks need formal; marketing copy needs conversational. Set this in the Options panel before clicking Translate." },
      { type: "h3", text: "Provide a glossary for protected terms" },
      { type: "p", text: "Brand names, product codes, role titles shouldn't be translated. Upload a CSV with English/native pairs so each language version uses the right canonical names." },
      { type: "h3", text: "When AI translation isn't enough" },
      { type: "p", text: "Privacy notices, employment contracts, safety warnings, and most legal documents need a sworn translator's review. Use AI for the draft and a human for the certification." },
    ],
  },

  {
    slug: "chat-with-pdf-prompts-that-work",
    title: "Chat with PDF: 5 prompts that actually work",
    excerpt: "Vague questions get vague answers. Specific, locatable questions get precise answers with page citations.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Chat with PDF works best when you treat it as a fast first reader, not as an oracle. The model retrieves passages from the document and writes the answer using only those passages. If your question is specific, you get a precise answer plus the exact page where it lives." },
      { type: "h3", text: "1. Locate the clause" },
      { type: "p", text: "'Where in this contract is the indemnification clause?' returns specific page references. 'Is this contract enforceable?' returns a vague summary because it's interpretation, not retrieval." },
      { type: "h3", text: "2. Extract the specific number" },
      { type: "p", text: "'What's the termination notice period?' returns the number. 'What about the termination clause?' returns a paragraph. Specific numeric questions are the highest-value use." },
      { type: "h3", text: "3. Find the exception" },
      { type: "p", text: "'Are there any exceptions to the limitation of liability?' is a great chat question. Lawyers spend hours skim-reading for these; the chat surfaces them in seconds." },
      { type: "h3", text: "4. Compare against your standard" },
      { type: "p", text: "'What's the IP-assignment language in this contract?' lets you compare what's in this document to your standard playbook. The chat returns the language; you decide whether it's acceptable." },
      { type: "h3", text: "5. Ask for the absence" },
      { type: "p", text: "'Does this contract include a non-compete?' — even when the answer is 'no, I don't see one', that's useful. Confirming absence is harder for humans skimming and easier for retrieval." },
    ],
  },

  {
    slug: "redact-pdf-properly",
    title: "How to redact PDFs properly (and why most 'redactions' fail)",
    excerpt: "A black rectangle on top of text isn't redaction. Real redaction permanently removes the bytes.",
    cat: "Security",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Most 'redacted' PDFs you see in the wild aren't actually redacted. The most common mistake is drawing a black rectangle on top of the sensitive text, which hides it visually but leaves the original text intact in the file's data. Anyone with a PDF reader and 30 seconds can copy-paste right through the rectangle." },
      { type: "h3", text: "Real redaction permanently removes data" },
      { type: "p", text: "When pdfcraft ai redacts a PDF, we find the marked text or image regions, delete the underlying content from the PDF's text streams, and replace the marked area with an opaque mark. Searching for the redacted word returns nothing. Forensic analysis finds no trace." },
      { type: "h3", text: "Why metadata matters as much as content" },
      { type: "p", text: "Names buried in 'Author' or 'Last Modified By' fields survive visual redaction. People have been embarrassed when 'redacted' PDFs revealed sensitive content via metadata. Always strip metadata in the same pass — it's a one-click toggle." },
      { type: "h3", text: "Use AI Redact for the obvious cases" },
      { type: "p", text: "AI Redact auto-detects names, emails, phone numbers, SSN-shaped patterns, addresses, credit card numbers (with checksum validation), dates of birth, IP addresses. Run AI Redact first as a sweep, then manually redact context-specific terms." },
      { type: "h3", text: "Test before sending" },
      { type: "p", text: "Open the redacted file. Try to copy-paste from a redacted region. If you get the original text back, the redaction failed — don't ship the file. This 30-second check has saved more careers than I can count." },
    ],
  },

  {
    slug: "sign-pdfs-free-typed-drawn-uploaded",
    title: "Sign PDFs free: typed, drawn, or uploaded — what's legal?",
    excerpt: "Visual signatures vs cryptographic signatures. Most business contracts only need the first.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Signing a PDF is two different things: drawing your name on the page (a visual signature) and applying a cryptographic seal (a digital signature). Most online tools only do the first. The visual signature is what 99% of business workflows actually require, and it's what we offer for free." },
      { type: "h3", text: "Visual signatures are legally binding for most cases" },
      { type: "p", text: "Visual e-signatures are binding under the US ESIGN Act, EU eIDAS for simple e-signatures, the UK ECA, and similar laws in most jurisdictions. They cover NDAs, MSAs, employment paperwork, vendor agreements, and standard business contracts." },
      { type: "h3", text: "When you actually need cryptographic signing" },
      { type: "p", text: "Court filings in some jurisdictions, regulatory submissions, and qualified electronic signatures (QES) under EU law require certificate-based signing. Adobe Acrobat, DocuSign, and our API integration with certificate workflows handle these." },
      { type: "h3", text: "Tips for professional signatures" },
      { type: "p", text: "Upload a real handwritten signature — sign on white paper, take a phone photo, upload. Save your signature for reuse so future signings are one click. Match signature size to surrounding text. Sign last, after all other edits are final." },
    ],
  },

  {
    slug: "extract-tables-from-financial-pdfs",
    title: "How to extract tables from financial PDFs into Excel",
    excerpt: "10-Ks, balance sheets, income statements — the data trapped inside PDFs into a spreadsheet you can chart.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Manually retyping financial-statement data is the worst kind of busy work. AI table extraction inverts the cost: 5 minutes of model work, instantly comparable across years and companies. For analysts covering 30 names, that's 30 hours per filing season recovered." },
      { type: "h3", text: "Why financial PDFs are hard" },
      { type: "p", text: "Tables in PDFs aren't stored as tables — they're stored as text positioned at coordinates, and the 'table' is a visual illusion. Multi-row headers, merged cells, footnoted values, and parenthesis-as-negative-number conventions need structural detection." },
      { type: "h3", text: "AI Table Extract vs PDF-to-Excel" },
      { type: "p", text: "PDF-to-Excel converts the whole document. AI Table Extract returns just the tables, cleanly typed. For documents that are mostly tables (10-Ks, balance sheets), Table Extract is the right tool." },
      { type: "h3", text: "Verify before relying" },
      { type: "p", text: "Models occasionally substitute digits — 0/O, 1/l, 5/S in particular. Sum the extracted column and compare to the printed total. Every reputable filing has subtotal and total rows; if your extracted column doesn't sum, you have an extraction error." },
    ],
  },

  {
    slug: "edit-pdf-in-browser-without-acrobat",
    title: "Edit a PDF in your browser: what's possible without Acrobat",
    excerpt: "Most PDF edits don't actually require Acrobat. Here's what works in the browser, and what doesn't.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "PDF editing has a reputation for being hard, and most of it comes from the legacy of $20+/month desktop tools. The truth: for the changes most people actually need — fix a typo, swap a logo, add a paragraph, sign a contract — you can do them in the browser, no install, no subscription." },
      { type: "h3", text: "Editing existing text" },
      { type: "p", text: "pdfcraft ai's Edit PDF tool finds the run of glyphs that make up the word you click and rewrites them. The original font is preserved when embedded; otherwise we substitute and warn you." },
      { type: "h3", text: "Adding new content" },
      { type: "p", text: "Add Text Box places new text on a page. Match the font, size, and color to the surrounding text — use the dropper to copy properties from existing text. Anchor footers and watermarks to repeat automatically." },
      { type: "h3", text: "What you can't do in the browser" },
      { type: "p", text: "High-stakes cryptographic signing, full PDF/UA accessibility tagging, prepress operations, and offline editing all need Acrobat. We don't pretend to compete on those. For 80% of office PDF editing — the part that's actually most of your work — the browser is enough." },
    ],
  },

  {
    slug: "compare-two-contract-versions-without-word",
    title: "How to compare two contract versions without Word",
    excerpt: "Counterparty sent V2 back. What changed? Here's a 30-second redline you can read like a lawyer would.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Contract review used to mean Tracking Changes line-by-line in Word. Modern AI compare gives you the diff in under a minute and classifies severity, so the senior reviewer focuses on the 3 material changes instead of the 47 cosmetic ones." },
      { type: "h3", text: "How AI Compare works" },
      { type: "p", text: "We extract text from both PDFs along with structural information. A two-pass diff first aligns common content, then identifies what changed in the gaps. AI classifies each change as cosmetic, material, or critical." },
      { type: "h3", text: "Use the severity filter" },
      { type: "p", text: "If you read every change you waste time on cosmetic ones. Filter to 'material changes only' for the first pass — usually 5-15 changes that actually matter." },
      { type: "h3", text: "Limitations" },
      { type: "p", text: "AI Compare is an aid, not authority. For high-stakes contracts (M&A, multi-million-dollar agreements), have a senior lawyer review the diff and the full document." },
    ],
  },

  {
    slug: "page-numbers-watermarks-headers-30-seconds",
    title: "Add page numbers, watermarks, and headers in 30 seconds",
    excerpt: "Three operations that look like three tools but are actually one.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Page numbers, watermarks, and headers/footers are different versions of the same operation: add page-anchored content that appears on every page. The Page Numbers & Watermark tool handles all three; the technique is identical, just the content varies." },
      { type: "h3", text: "Adding page numbers" },
      { type: "p", text: "Pick a position (top/bottom, left/center/right). Pick a format (1, 2, 3 / Page 1 of N / Roman numerals). Pick which pages get numbers. The tool anchors the numbers to the page-relative position, so they appear on every page automatically." },
      { type: "h3", text: "Adding a watermark" },
      { type: "p", text: "Type the watermark text ('CONFIDENTIAL', 'DRAFT', 'COPY'). Pick the angle (typically 45° diagonal). Set opacity (15-30% is the sweet spot — visible but not overwhelming)." },
      { type: "h3", text: "When to flatten after" },
      { type: "p", text: "If the recipient might want to remove the watermark, leave it unflattened. To make elements permanent, flatten the file before sharing." },
    ],
  },

  {
    slug: "convert-images-to-pdf-the-right-way",
    title: "Convert images to PDF the right way (phone photos, scans, etc.)",
    excerpt: "JPG-to-PDF looks easy but the choices matter: page size, fit mode, OCR, ordering.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Combining JPGs into a PDF sounds like a one-click job — and it can be — but the difference between a usable PDF and a polished one is in choices: page size, image-fit, ordering, margins, and whether the output is searchable." },
      { type: "h3", text: "Pick the right page size" },
      { type: "p", text: "A4 for European recipients, Letter for North American, A6 for photo-print booklets, custom for online viewing. Don't use 'fit to page' on portrait phone shots over a Letter page — you'll get tiny images on huge pages." },
      { type: "h3", text: "Run OCR if there's any text" },
      { type: "p", text: "If a photo contains any readable text — a sign, a receipt, a whiteboard — OCR makes that text searchable in the PDF. Costs almost nothing for huge utility." },
      { type: "h3", text: "Compress after for smaller PDFs" },
      { type: "p", text: "12 phone photos at 12 MP each becomes a 120 MB PDF. Run Compress on Balanced after, or downsample to 200 DPI in the Options panel before export, to land at sane sizes." },
    ],
  },

  {
    slug: "summarize-200-page-report-plain-english",
    title: "How to summarize a 200-page report in plain English",
    excerpt: "Eleven different summary formats, each calibrated for a different audience.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Summarizing a PDF sounds simple but breaks immediately under different needs. A board director wants a 5-bullet executive summary. A student wants study notes. A new joiner wants a TL;DR. Different jobs, different summaries — and the wrong shape of summary is worse than no summary at all." },
      { type: "h3", text: "Match the format to the job" },
      { type: "p", text: "Executive summary for decision-makers. TL;DR for Slack. Key Points for briefing notes. Study Notes for learning. Action Items for contracts. FAQ for product docs. Section-by-section for keeping document structure visible." },
      { type: "h3", text: "Sectional summaries on long documents" },
      { type: "p", text: "1,000-page documents get one summary per chapter, then a meta-summary across them. The map-reduce structure handles long documents without missing the back half." },
      { type: "h3", text: "Combine with chat" },
      { type: "p", text: "Summarize first to understand the shape; then chat to drill into specifics. The two tools work better together than either alone." },
    ],
  },

  {
    slug: "scanned-pdfs-need-ocr-first",
    title: "Why your scanned PDFs need OCR before anything else",
    excerpt: "OCR is the prerequisite for almost every other operation on a scanned PDF.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "A scanned PDF is an image of pages, not text. Almost every other operation in a PDF tool suite — Compare, Translate, Summarize, Chat, Search, Edit, Extract — needs text to work on. If your input has no text layer, every downstream tool either fails or returns garbage." },
      { type: "h3", text: "How to know if your PDF needs OCR" },
      { type: "p", text: "Open the PDF and try to copy a sentence. If it copies as text, you have a text layer. If you can't select anything, the file is image-only and needs OCR before anything else." },
      { type: "h3", text: "Order matters: OCR first" },
      { type: "p", text: "Run OCR before splitting (splitting destroys cross-page text continuity). Before compressing (compression softens text edges and hurts OCR). Before translating (the translator has nothing to read without text)." },
      { type: "h3", text: "Cost and limits" },
      { type: "p", text: "First 20 pages free per document. After that, 2 credits per page. The credit cost is negligible compared to the time saved on every downstream operation." },
    ],
  },

  {
    slug: "combine-bank-statements-for-accountant",
    title: "How to combine bank statements for your accountant",
    excerpt: "12 monthly statements → one searchable PDF in 5 minutes.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Accountants charge by the hour. Every minute they spend opening 12 separate statement files is a minute they bill you for. A single merged, searchable, page-numbered PDF saves real money." },
      { type: "h3", text: "Merge the monthly PDFs" },
      { type: "p", text: "Pre-name them YYYY-MM-statement.pdf so they sort chronologically. Drop them in, drag thumbnails to confirm order, click Merge. Free tool runs in your browser." },
      { type: "h3", text: "OCR if image-only" },
      { type: "p", text: "Some banks export PDFs as images, not text. The accountant can't search them without OCR. Run AI OCR on the merged file before sending." },
      { type: "h3", text: "Save as a Macro" },
      { type: "p", text: "Once you've done this once, save the steps as a Macro. Next year-end, drop in 12 files and click run." },
    ],
  },

  {
    slug: "compress-vs-optimize-what-each-changes",
    title: "Compress vs Optimize: what each level actually changes",
    excerpt: "Light, Balanced, Strong — three levels with different trade-offs.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Heads up: we don't yet ship a built-in compress tool ourselves (pdf-lib's API doesn't support compression — a server-side qpdf+ghostscript pipeline is on the roadmap). The conceptual breakdown of Light/Balanced/Strong below applies to whatever compression tool you do use (Adobe Acrobat Online, iLovePDF, SmallPDF). We'll restore this post's tutorial framing when the real tool ships." },
      { type: "p", text: "PDF compression is mostly image compression. The text in your file is already vector data — it shrinks barely at all. The savings come from re-encoding embedded images at lower JPEG quality and downsampling them." },
      { type: "h3", text: "Light: ~80% JPEG quality, no downsample" },
      { type: "p", text: "Re-encodes images at 80% JPEG quality, leaves DPI alone, strips unused fonts. Result: ~20% smaller, no visible quality loss. Use for print-bound documents and archival copies." },
      { type: "h3", text: "Balanced: ~60% JPEG quality, 200 DPI" },
      { type: "p", text: "The default, calibrated for screen reading. Cuts file size 40-60%. Quality is indistinguishable from the source at fit-to-width. Best for email and on-screen reading." },
      { type: "h3", text: "Strong: ~40% JPEG, 150 DPI" },
      { type: "p", text: "Aggressive compression for upload caps and mobile-first reading. Cuts size 60-80%. Quality is visible if zoomed past 100%. Don't use for print-bound content." },
    ],
  },

  {
    slug: "fill-out-non-fillable-pdf-form",
    title: "How to fill out a non-fillable PDF form",
    excerpt: "Old forms scanned without fillable fields. Type in them anyway.",
    cat: "Tutorial",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "4 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "Most online forms are fillable PDFs with proper form fields. Some — older government forms, scanned templates — don't have fillable fields. The workaround is to add text on top of the blank lines manually." },
      { type: "h3", text: "Use Add Text Box" },
      { type: "p", text: "Edit PDF rewrites existing text. For non-fillable forms, there's no existing text — you need to add new text on top. Add Text Box places new text wherever you click. Pick the font and size to match surrounding labels." },
      { type: "h3", text: "Sign the form" },
      { type: "p", text: "After typing the answers, use Sign PDF to add your signature. Type, draw, or upload your signature image. Match the size to the printed name beneath the signature line." },
      { type: "h3", text: "Flatten before sending" },
      { type: "p", text: "Form text added via Add Text Box is editable by the recipient unless you flatten the file. Flatten converts the added text into part of the page itself, locking it in place." },
    ],
  },

  {
    slug: "7-pdf-mistakes-that-cost-businesses-time",
    title: "The 7 PDF mistakes that cost businesses time",
    excerpt: "From 'redact with a black box' to 'compress signed PDFs' — the recurring patterns that waste hours.",
    cat: "Workflows",
    date: "Apr 25, 2026",
    iso: "2026-04-25",
    read: "5 min",
    author: { name: "pdfcraft team", role: "pdfcraft ai", initial: "P" },
    body: [
      { type: "p", text: "After thousands of hours of customer support tickets, a pattern emerges. The same handful of mistakes show up across legal, finance, HR, sales, and operations. Here are the seven that cost the most time." },
      { type: "h3", text: "1. Drawing a black rectangle and calling it redaction" },
      { type: "p", text: "The text underneath is still there. Real redaction permanently removes the bytes. Use the dedicated Redact tool. Test by copy-paste before sending." },
      { type: "h3", text: "2. Compressing signed PDFs" },
      { type: "p", text: "Compression rewrites the file's byte layout, voiding any cryptographic signature. Compress before signing, never after." },
      { type: "h3", text: "3. OCR'ing at low DPI" },
      { type: "p", text: "Below 200 DPI, accuracy drops fast. Rescan at 300 DPI grayscale — the gain is large." },
      { type: "h3", text: "4. Skipping OCR before downstream operations" },
      { type: "p", text: "Compare, Translate, Summarize, Chat — none work on image-only PDFs. Run OCR first." },
      { type: "h3", text: "5. Forgetting metadata" },
      { type: "p", text: "Author names and edit history live inside every PDF. Strip metadata when redacting or before sharing externally." },
      { type: "h3", text: "6. Wrong compression level" },
      { type: "p", text: "Strong compression on print-bound documents looks bad on paper. Match the level to the destination." },
      { type: "h3", text: "7. Manual workflows you do every week" },
      { type: "p", text: "If you OCR a folder every Monday, save the steps as a Macro. Repeating manual workflows wastes hours per month." },
    ],
  },
];

export const postBySlug = (slug: string) => BLOG_POSTS.find((p) => p.slug === slug);
