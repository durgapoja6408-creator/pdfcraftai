// SEO Ship #4 (2026-04-25): use-case ("job to be done") landing pages.
//
// Why these matter: head-term searches like "merge pdf" are crowded.
// Use-case searches like "combine bank statements for accountant" are
// less crowded and signal MUCH higher intent — the searcher already
// knows what they're trying to accomplish, not just what tool they
// might need. Lower volume per query, but higher conversion per visit.
//
// Editorial principles:
// 1. Lead with the job, not the tool. "How to combine invoices for
//    accounting" reads like a guide, not an ad.
// 2. Map to the SPECIFIC tools you'd chain together. Most jobs need
//    2-3 steps; we have macros for that.
// 3. Be specific about audience. "For your accountant" is sharper
//    than "for business" — and ranks for the term someone actually types.

export type UseCaseSlug =
  | "merge-bank-statements-for-accountant"
  | "combine-receipts-for-expense-report"
  | "thesis-combine-and-format"
  | "redline-contract-revisions"
  | "translate-handbook-to-multiple-languages"
  | "ocr-old-archive"
  | "redact-pdf-before-sharing"
  | "extract-tables-from-financial-report"
  | "convert-research-papers-to-study-notes";

export type UseCaseStep = {
  /** The specific pdfcraft ai tool ID this step uses. */
  tool: string;
  /** Headline for the step. */
  title: string;
  /** What you do. 1-2 sentences. */
  detail: string;
};

export type UseCaseData = {
  slug: UseCaseSlug;
  /** H1 — what the user is trying to do. */
  h1: string;
  /** Sub — one-sentence value prop. */
  sub: string;
  /** Audience the page is for. Used in copy + schema. */
  audience: string;
  /** Total time to complete the workflow, like "5 minutes". */
  totalTime: string;
  /** Step-by-step workflow. Each step links to a real tool. */
  steps: UseCaseStep[];
  /** Why this matters / context section. ~200 words. */
  whyItMatters: string;
  /** Pitfalls — things people get wrong. */
  pitfalls: Array<{ title: string; detail: string }>;
  /** Tips for clean output. */
  tips: Array<{ title: string; detail: string }>;
  /** FAQ. 4-5 entries. */
  faq: Array<{ q: string; a: string }>;
  /** Related use cases — internal linking. */
  related: UseCaseSlug[];
};

export const USE_CASES: Record<UseCaseSlug, UseCaseData> = {
  // ============================================================
  // 1. Merge bank statements for accountant
  // ============================================================
  "merge-bank-statements-for-accountant": {
    slug: "merge-bank-statements-for-accountant",
    h1: "How to combine bank statements into one PDF for your accountant",
    sub: "Stitch 12 monthly statements into one searchable, OCR'd PDF in under 5 minutes.",
    audience: "Small-business owners, freelancers, and bookkeepers handing files off to a CPA",
    totalTime: "5 minutes",
    steps: [
      {
        tool: "merge",
        title: "Merge the monthly PDFs into one file",
        detail:
          "Drop in all 12 monthly statements at once. Drag thumbnails to confirm the order is January → December. Click Merge. The free Merge tool runs in your browser — your statements never upload.",
      },
      {
        tool: "ai-ocr",
        title: "Make the merged PDF searchable",
        detail:
          "If your statements come from a bank that exports as image-only PDFs (some still do), run AI OCR. The text becomes searchable, copy-able, and your accountant can Cmd+F for any vendor.",
      },
      {
        tool: "compress",
        title: "Compress to email-friendly size",
        detail:
          "12 monthly statements often add up to 60+ MB. Use Compress on Balanced, or set a target size of 24 MB to clear most email gateways.",
      },
      {
        tool: "page-numbers",
        title: "Add page numbers and a cover page",
        detail:
          "A cover page with the year and account number plus per-page numbers turns 'merged.pdf' into a professional package the accountant can reference precisely.",
      },
    ],
    whyItMatters:
      "Accountants charge by the hour. Every minute they spend opening and re-ordering 12 separate statement files is a minute they bill you for. A single merged, searchable, page-numbered PDF saves real money — and reduces the back-and-forth of 'can you re-send August?' One file, one upload, one-and-done.",
    pitfalls: [
      {
        title: "Skipping OCR on image-only statements",
        detail:
          "Many banks (especially smaller credit unions) export PDFs that are images of pages, not text. The accountant can read them but can't search them — which means they manually transcribe transaction data. OCR first, save them hours.",
      },
      {
        title: "Forgetting transaction-by-transaction context",
        detail:
          "Don't strip the bank's running balance column when cleaning up. Accountants reconcile against running balances; without them, they can't catch mid-month errors.",
      },
      {
        title: "Merging year-over-year files",
        detail:
          "One PDF per fiscal year, not all years in one mega-file. Accountants close books per year — making them dig through multi-year files wastes time.",
      },
    ],
    tips: [
      {
        title: "Pre-name your files YYYY-MM-statement.pdf before merging",
        detail:
          "ISO date prefix sorts correctly without intervention. Drop them in and the merge order is automatic.",
      },
      {
        title: "Add a TOC if you have more than 12 statements",
        detail:
          "Multi-year merges benefit from a clickable table of contents. Run our Mind Map / TOC tool after merging to auto-generate one.",
      },
      {
        title: "Save the macro",
        detail:
          "Once you've done this once, save the steps as a Macro. Next year-end, drop in 12 files and click run.",
      },
    ],
    faq: [
      {
        q: "Will my bank statements stay private?",
        a: "Yes. The Merge step runs entirely in your browser — your statements never reach our servers. The optional OCR and Compress steps upload but delete within 60 minutes and aren't used for AI training.",
      },
      {
        q: "What if I have password-protected statements?",
        a: "Unlock them first with our free Unlock PDF tool (you'll need the password — we don't crack PDFs without it). Then merge.",
      },
      {
        q: "How big can the merged file get?",
        a: "Free tier handles up to 100 MB output. For multi-year archives that exceed that, the API's batch endpoint streams without size limits.",
      },
      {
        q: "Can I extract just the transaction tables?",
        a: "Yes — use AI Table Extract after merging to pull every transaction into one CSV. Useful for handing your accountant a spreadsheet alongside the PDF.",
      },
    ],
    related: ["combine-receipts-for-expense-report", "extract-tables-from-financial-report"],
  },

  // ============================================================
  // 2. Combine receipts for expense report
  // ============================================================
  "combine-receipts-for-expense-report": {
    slug: "combine-receipts-for-expense-report",
    h1: "How to turn a folder of receipt photos into one expense-report PDF",
    sub: "Phone photos → searchable, ordered, named PDF in 3 minutes. Concur, Expensify, SAP-ready.",
    audience: "Anyone filing business expenses on Concur, Expensify, SAP, or a custom finance portal",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "to-pdf",
        title: "Convert your receipt photos to a single PDF",
        detail:
          "Drop in JPGs, HEICs, or PNGs from your phone. Each photo becomes one PDF page, auto-rotated, fitted to A4 or Letter — your choice. Add 0.25-inch margins so receipts don't bleed off the edge.",
      },
      {
        tool: "ai-ocr",
        title: "OCR so the totals are searchable",
        detail:
          "Phone-camera receipts are image-only. AI OCR adds a text layer that finance portals can index. Totals, vendor names, and dates become searchable.",
      },
      {
        tool: "page-numbers",
        title: "Number the pages and add a cover",
        detail:
          "A cover page with your name, expense report number, and submission date turns 'IMG_4023.pdf' into a deliverable. Page numbers help finance reference specific receipts in queries.",
      },
    ],
    whyItMatters:
      "Most expense systems accept one PDF per claim, not 27 separate JPGs. The 'attach 27 files' approach gets rejected by half of corporate portals and slows down the rest. One ordered, OCR'd PDF goes through in one upload, which means your reimbursement clears faster.",
    pitfalls: [
      {
        title: "Photographing receipts at angles",
        detail:
          "Phone photos taken at 30° angles don't OCR well — the text is distorted. Hold the phone flat over the receipt, parallel to it. Use a document-scanner app if you can.",
      },
      {
        title: "Skipping the cover page",
        detail:
          "Finance teams reject anonymous PDFs. Always include a cover with your name, employee ID, and expense-report number.",
      },
      {
        title: "Ordering chronologically when the trip is",
        detail:
          "Some finance systems want receipts ordered by date. Others want them grouped by category (transport, meals, lodging). Check before you compile.",
      },
    ],
    tips: [
      {
        title: "Take photos against a dark surface",
        detail:
          "White receipts on white tables don't auto-crop well. A dark surface gives the OCR engine clear edges.",
      },
      {
        title: "Photograph the back of the receipt only if needed",
        detail:
          "Most receipts are one-sided. Don't double the page count for nothing.",
      },
      {
        title: "Bundle by category if your portal supports it",
        detail:
          "Concur and Expensify let you upload one PDF per expense category. That's faster than one giant report.",
      },
    ],
    faq: [
      {
        q: "Will my receipts be private?",
        a: "Yes. The JPG-to-PDF conversion runs in your browser. OCR uploads but deletes within 60 minutes and never trains models.",
      },
      {
        q: "Can the system read my totals automatically?",
        a: "Most expense portals do their own OCR after you upload. Our pre-OCR makes the file searchable for you and improves the portal's accuracy by giving it a clean text layer to start from.",
      },
      {
        q: "What about handwritten amounts on a receipt?",
        a: "OCR doesn't reliably handle handwriting. Type the total separately in the expense system rather than relying on OCR for handwritten figures.",
      },
      {
        q: "What size should the photos be?",
        a: "Modern phone cameras (12 MP+) are perfect at default settings. Don't downsample before submitting — the higher resolution helps OCR catch fine print.",
      },
    ],
    related: ["merge-bank-statements-for-accountant", "ocr-old-archive"],
  },

  // ============================================================
  // 3. Thesis combine
  // ============================================================
  "thesis-combine-and-format": {
    slug: "thesis-combine-and-format",
    h1: "How to combine thesis chapters into one submission-ready PDF",
    sub: "Cover, abstract, chapters, references, appendices — one file, with bookmarks, page numbers, and TOC.",
    audience: "Master's and PhD candidates assembling their final thesis submission",
    totalTime: "10 minutes",
    steps: [
      {
        tool: "to-pdf",
        title: "Convert each Word chapter to PDF",
        detail:
          "Most departments accept .docx but require .pdf for the official submission. Convert each chapter, embed all fonts, and accept tracked changes before exporting. Use PDF/A if your institution requires archival format.",
      },
      {
        tool: "merge",
        title: "Merge in submission order",
        detail:
          "Cover page → abstract → acknowledgements → table of contents (placeholder) → chapters in order → references → appendices. Use Merge to combine all of them in one go. Drag thumbnails to confirm order.",
      },
      {
        tool: "page-numbers",
        title: "Add running page numbers and per-section headers",
        detail:
          "Roman numerals (i, ii, iii) for front matter (abstract, TOC), Arabic numerals starting at 1 for the body chapters. Most institutions are strict about this — verify with your department's formatting guide.",
      },
      {
        tool: "ai-summarize",
        title: "Generate a TOC from your bookmarks (optional)",
        detail:
          "Once chapters are merged, the resulting bookmarks form a natural TOC. Use Mind Map or run a section-by-section summary if you want a smart summary on the inside cover.",
      },
    ],
    whyItMatters:
      "Universities reject thesis submissions on technicalities — wrong page numbering scheme, missing pagination on appendices, font substitution on the cover. A clean assembly process the first time saves a re-submission cycle (and an angry email from the registrar). It's a one-time job; do it once, do it right.",
    pitfalls: [
      {
        title: "Mixing fonts between chapters",
        detail:
          "If chapters were drafted on different machines, your final thesis may have three different body fonts. Standardize before exporting each chapter — and ensure all fonts are embedded in the PDF.",
      },
      {
        title: "Page numbering restarts at every chapter",
        detail:
          "Word's section breaks make this easy to do by accident. Verify continuous numbering before merging — fixing it post-merge is harder.",
      },
      {
        title: "Wrong TOC format",
        detail:
          "Department-specific TOC depth (2 levels? 3?) is in your formatting guide. Get it right before submission.",
      },
    ],
    tips: [
      {
        title: "Use PDF/A for the final archival copy",
        detail:
          "Most university libraries require PDF/A for thesis archives. Standard PDF works for working drafts; PDF/A for the final submission.",
      },
      {
        title: "Save signed signature pages last",
        detail:
          "Cryptographic signatures break if you re-merge. Sign at the very end, after final assembly.",
      },
      {
        title: "Check accessibility",
        detail:
          "Many universities now require PDF/UA accessibility (alt text on images, tagged structure). Word's Save As PDF with 'Accessibility' option handles most of this.",
      },
    ],
    faq: [
      {
        q: "How long can the merged thesis be?",
        a: "Free tier handles up to 100 MB output. For 500-page theses with embedded high-res figures, you may need to compress on Balanced first or use the API's batch endpoint.",
      },
      {
        q: "What if my advisor requests changes after I've merged?",
        a: "Edit the source Word documents, re-export the affected chapters, and re-run the merge. Don't try to edit the merged PDF directly — Word source stays canonical.",
      },
      {
        q: "Do I need PDF/A for the final?",
        a: "Most universities do require it. Check your department's formatting guide. We produce PDF/A-1b or PDF/A-2 as you choose.",
      },
      {
        q: "Can I add a digital signature?",
        a: "Yes — for the signed declaration page, use a cryptographic signature via our API or Adobe Acrobat. For working drafts, the visual signer works.",
      },
    ],
    related: ["redline-contract-revisions", "convert-research-papers-to-study-notes"],
  },

  // ============================================================
  // 4. Redline contract revisions
  // ============================================================
  "redline-contract-revisions": {
    slug: "redline-contract-revisions",
    h1: "How to redline a contract that came back from counterparty",
    sub: "Diff V1 vs V2 in 30 seconds. Material changes flagged, cosmetic ones filtered out.",
    audience: "In-house counsel, contract managers, and founders reviewing returned contracts",
    totalTime: "2 minutes",
    steps: [
      {
        tool: "ai-compare",
        title: "Compare the two versions",
        detail:
          "Drop in V1 (your sent version) and V2 (their returned version). AI Compare identifies every change — additions, deletions, substitutions — and classifies each as cosmetic, material, or critical.",
      },
      {
        tool: "ai-chat",
        title: "Ask about specific changes",
        detail:
          "Open Chat with PDF on V2 and ask 'what changed in the indemnification clause?' or 'is the limitation of liability still capped?' Citations point you to the exact page.",
      },
      {
        tool: "ai-summarize",
        title: "Generate a redline summary for your team",
        detail:
          "Use Summarize → Action Items format to get a list of every changed obligation with severity ratings. Forward this to the deal team — they'll thank you.",
      },
    ],
    whyItMatters:
      "Contract review used to mean Tracking Changes line-by-line in Word. Modern AI compare gives you the diff in under a minute and classifies severity, so the senior reviewer focuses on the 3 material changes instead of the 47 cosmetic ones. The hours saved compound across every deal.",
    pitfalls: [
      {
        title: "Comparing different formatting versions",
        detail:
          "If V1 was Times New Roman and V2 came back as Calibri, you'll get hundreds of false-positive 'changes' that aren't real. Normalize formatting before comparing.",
      },
      {
        title: "Trusting the diff for legal certainty",
        detail:
          "AI Compare is an aid, not authority. For high-stakes contracts (M&A, multi-million-dollar agreements), have a senior lawyer review the diff and the full document.",
      },
      {
        title: "Skipping the severity filter",
        detail:
          "If you read every change, you waste time on cosmetic ones. Filter to 'material changes only' for the first pass.",
      },
    ],
    tips: [
      {
        title: "Run on the unsigned versions only",
        detail:
          "Cryptographic signatures in V1 or V2 add visual noise to the diff. Compare unsigned drafts.",
      },
      {
        title: "Export redline as DOCX for non-technical reviewers",
        detail:
          "Senior partners want Word redlines, not PDF redlines. Our export gives you both formats.",
      },
      {
        title: "Save the diff alongside the contract",
        detail:
          "When the deal closes, file the diff with the executed agreement. Future you will thank past you when amendment season hits.",
      },
    ],
    faq: [
      {
        q: "Can it compare scanned PDFs?",
        a: "Yes — but you must run OCR first on both. Without text layers, the comparison has no content to compare.",
      },
      {
        q: "What's a 'material' change?",
        a: "Anything that changes obligations, money, dates, parties, or governing law. Cosmetic = formatting, typos, restructuring without semantic change.",
      },
      {
        q: "Can I compare three versions at once?",
        a: "We compare two at a time. For three-way (V1 vs V2 vs V3), run V1-vs-V2 and V2-vs-V3, then read both diffs.",
      },
      {
        q: "Will it catch added clauses I might miss?",
        a: "Yes — added clauses are flagged and labeled. AI Compare specifically looks for inserted text, not just modified text.",
      },
    ],
    related: ["translate-handbook-to-multiple-languages", "redact-pdf-before-sharing", "thesis-combine-and-format"],
  },

  // ============================================================
  // 5. Translate handbook to multiple languages
  // ============================================================
  "translate-handbook-to-multiple-languages": {
    slug: "translate-handbook-to-multiple-languages",
    h1: "How to translate an employee handbook into 5 languages with consistent layout",
    sub: "One source PDF → 5 language-specific PDFs, layout preserved, terminology consistent.",
    audience: "HR teams, internal comms, and L&D building global handbooks",
    totalTime: "10 minutes per 50-page document",
    steps: [
      {
        tool: "ai-translate",
        title: "Upload the source PDF and pick target languages",
        detail:
          "Drop in the English handbook, select Spanish, French, German, Japanese, and Portuguese (or any 90+ supported). Set tone to 'formal' for HR documents.",
      },
      {
        tool: "ai-translate",
        title: "Provide a glossary for protected terms",
        detail:
          "Brand names, role titles, and product codes shouldn't be translated. Upload a CSV with English/native pairs so each language version uses the right canonical names.",
      },
      {
        tool: "merge",
        title: "Bundle as a multilingual handbook",
        detail:
          "Optional: merge all 5 outputs into one PDF with a language-selector cover page. Useful when distribution is one file per region rather than one file per language.",
      },
    ],
    whyItMatters:
      "Localization is one of the biggest hidden costs in scaling globally. Manual translation by an agency runs $0.10-0.25 per word; 50 pages at 250 words/page is $1,250-3,000 per language. Layout-preserving machine translation cuts that to a fraction and gets you 95% of the quality. For a final regulated document you still want a human review, but for the 80% of internal docs, this is your tool.",
    pitfalls: [
      {
        title: "Trusting the translation for legal compliance docs",
        detail:
          "Privacy notices, employment contracts, safety warnings — these need a sworn translator's review in many jurisdictions. Use AI for the draft, human for the certification.",
      },
      {
        title: "Mixing tones",
        detail:
          "If your source has casual sections ('Welcome to the team!') and formal sections ('You are required to...'), set the tone per section or the translation feels uneven.",
      },
      {
        title: "Forgetting RTL languages need RTL layout",
        detail:
          "Arabic and Hebrew flip direction. Tables and bulleted lists need to be mirrored — we do this automatically but verify the output before distributing.",
      },
    ],
    tips: [
      {
        title: "Translate to 'pivot' language, then to target",
        detail:
          "For uncommon language pairs (e.g. Korean → Bengali), translate via English. Quality is higher than direct.",
      },
      {
        title: "Have a native reviewer for each target",
        detail:
          "AI gets 95% right; the last 5% is cultural nuance only a native speaker catches. Pair the workflow with a 30-minute review per language.",
      },
      {
        title: "Build a glossary as you go",
        detail:
          "Each translation reveals new terms that need protection. Update your glossary CSV after each pass — the next document gets better automatically.",
      },
    ],
    faq: [
      {
        q: "How accurate is the translation?",
        a: "For mainstream language pairs (English ↔ Spanish/French/German/Japanese), it's roughly 95% accurate at the sentence level. For less common pairs it's 88-92%. Always review.",
      },
      {
        q: "What about terminology consistency?",
        a: "Provide a glossary CSV — same source term gets the same target term every time. Without a glossary, the model picks contextually but may vary across long documents.",
      },
      {
        q: "Will tables and images stay in place?",
        a: "Yes. Layout coordinates are preserved. If translated text is longer than the source (common for German), we adjust line spacing or font size by 2-3% to fit.",
      },
      {
        q: "Can I translate a scanned PDF?",
        a: "Yes — run AI OCR first to add the text layer, then translate. We can chain both in a Macro.",
      },
    ],
    related: ["redline-contract-revisions", "convert-research-papers-to-study-notes", "extract-tables-from-financial-report"],
  },

  // ============================================================
  // 6. OCR old archive
  // ============================================================
  "ocr-old-archive": {
    slug: "ocr-old-archive",
    h1: "How to OCR a folder of scanned PDFs so they become searchable",
    sub: "Make decades of scanned archives findable via Cmd+F, Spotlight, and Google Drive search.",
    audience: "Archivists, records managers, lawyers digitizing old case files, anyone with a scanner-in-a-box",
    totalTime: "Depends on volume — 30 seconds per page, automatable",
    steps: [
      {
        tool: "ai-ocr",
        title: "Pre-process: deskew and clean up scans",
        detail:
          "Tilted scans OCR poorly. Run our auto-deskew first, especially on flatbed scans where pages drift. The OCR step itself includes a basic deskew, but pre-processing improves accuracy on borderline scans.",
      },
      {
        tool: "ai-ocr",
        title: "Run AI OCR on every page",
        detail:
          "Upload one file at a time, or use the batch endpoint via the API. Each page becomes searchable. Multilingual? Set the language explicitly for cleaner results on mixed-language documents.",
      },
      {
        tool: "make-pdf-searchable",
        title: "Save as searchable PDF (looks identical)",
        detail:
          "The output is the same scan visually, but with a hidden text layer. Spotlight, Windows Search, Google Drive, and SharePoint all index it. Cmd+F works in any reader.",
      },
    ],
    whyItMatters:
      "An archive you can't search is a haystack with no needle. Most legacy archives — medical records, old contracts, court files, family genealogy — sit as image-only PDFs because that's what scanners produced. OCR is the bridge between 'we have it somewhere' and 'we can find it in 10 seconds.' For lawyers, this can be the difference between finding a smoking-gun email in 30 minutes and 30 hours.",
    pitfalls: [
      {
        title: "OCR'ing low-resolution scans",
        detail:
          "Below 200 DPI, accuracy drops fast. If you can rescan at 300 DPI, do — the OCR savings outweigh the rescan cost.",
      },
      {
        title: "Skipping language specification",
        detail:
          "Auto-detect works most of the time, but for mixed-language archives (Spanish/English law firm, French/Dutch corporate), explicitly setting both languages improves accuracy by several percent.",
      },
      {
        title: "Trusting OCR'd numbers without verification",
        detail:
          "0/O, 1/l, 5/S confusions are real. For dollar amounts, dates, account numbers in legal contexts, manually verify samples.",
      },
    ],
    tips: [
      {
        title: "Run on copies, not originals",
        detail:
          "Always preserve the unsearchable original alongside the searchable output. Re-OCR is cheap; re-scan is expensive.",
      },
      {
        title: "Output as PDF/A-2u for archival",
        detail:
          "PDF/A-2u is the searchable archival ISO standard — required for many regulatory archives. Toggle it on for compliance use cases.",
      },
      {
        title: "Save as a Macro for repeat workflows",
        detail:
          "If you OCR a folder every Monday, save the deskew + OCR + searchable-PDF chain as a Macro. Automation pays back quickly.",
      },
    ],
    faq: [
      {
        q: "How accurate is OCR on old scans?",
        a: "On 300 DPI grayscale scans of typed documents: 98%+. On 200 DPI scans: 95%+. On photo-quality scans of typed text: 96%+. On handwriting: low — use the AI handwriting model for those, accuracy depends heavily on penmanship.",
      },
      {
        q: "How long does it take?",
        a: "Roughly 30 seconds per page on the web app, faster via the API batch endpoint. A 1,000-page archive = ~8 hours via the API, plenty parallel-able.",
      },
      {
        q: "Will the file size grow?",
        a: "Yes — by the size of the text layer. A 10 MB scan becomes ~10.5 MB after OCR. Negligible.",
      },
      {
        q: "What languages?",
        a: "30+ scripts: Latin, Cyrillic, Greek, CJK (Chinese/Japanese/Korean), Arabic, Hebrew, Devanagari, Bengali, Tamil, Thai, more. Setting the language explicitly improves accuracy.",
      },
    ],
    related: ["extract-tables-from-financial-report", "merge-bank-statements-for-accountant", "redact-pdf-before-sharing"],
  },

  // ============================================================
  // 7. Redact PDF before sharing
  // ============================================================
  "redact-pdf-before-sharing": {
    slug: "redact-pdf-before-sharing",
    h1: "How to redact a PDF properly before sending it externally",
    sub: "Permanently remove names, salaries, account numbers, and PII — not 'cover with a black box'.",
    audience: "HR sharing offer letters as samples, lawyers preparing FOIA responses, anyone sharing internal docs externally",
    totalTime: "5 minutes",
    steps: [
      {
        tool: "ai-redact",
        title: "Auto-detect personally identifiable information",
        detail:
          "AI Redact scans the PDF for names, emails, phone numbers, SSN-shaped patterns, addresses, credit card numbers, and dates of birth. Each detection gets a confidence score; you accept or reject.",
      },
      {
        tool: "redact-free",
        title: "Manually redact anything else",
        detail:
          "AI catches the obvious; you catch the contextual. Names of internal projects, codenames, vendor identifiers — search-and-redact each one across the whole document so you don't miss occurrences.",
      },
      {
        tool: "redact-free",
        title: "Strip metadata in the same pass",
        detail:
          "Author names, edit history, original-file-path, and other metadata leak even when the visible page is clean. Toggle 'remove metadata' before exporting.",
      },
    ],
    whyItMatters:
      "Most 'redacted' documents in the wild aren't actually redacted — they're documents with black rectangles drawn on top. The text underneath is still readable by anyone who copy-pastes through the rectangle. Real redaction permanently removes the bytes. The difference is forensic: a real lawyer with a real PDF reader can recover non-redacted content from a fake redaction in under a minute. Don't be the source of that headline.",
    pitfalls: [
      {
        title: "Drawing a black rectangle instead of redacting",
        detail:
          "Annotation rectangles cover text visually but leave it intact in the file's data. Use the redact tool, not the highlight or shape tools.",
      },
      {
        title: "Forgetting metadata",
        detail:
          "Names buried in 'Author' or 'Last Modified By' fields survive visual redaction. Always strip metadata in the same pass.",
      },
      {
        title: "Trusting visual inspection on text-heavy redactions",
        detail:
          "Use search-and-redact for names and IDs. Manual scanning misses occurrences in headers, footers, and embedded annotations.",
      },
    ],
    tips: [
      {
        title: "Test by copy-paste before sending",
        detail:
          "Open the redacted file. Try to copy-paste from the redacted region. If you get the original text back, the redaction failed — don't ship.",
      },
      {
        title: "Save with a clear filename",
        detail:
          "filename-redacted-2026-04-25.pdf signals 'this version is for sharing'. Keep the unredacted master under a different name.",
      },
      {
        title: "Keep a redaction audit log",
        detail:
          "For regulated industries, log what was redacted and why. Our Redact tool exports a JSON log of every redaction with the page, region, and category.",
      },
    ],
    faq: [
      {
        q: "How is real redaction different from a black rectangle?",
        a: "Real redaction deletes the underlying text from the file. Black rectangles are annotations on top of text that's still there. Search 'BBC redaction failure' for examples of how often this gets shipped.",
      },
      {
        q: "What does AI Redact catch?",
        a: "Names (people and organizations), emails, phone numbers (international formats), SSN patterns, credit card numbers (with checksum validation), addresses, dates of birth, IP addresses, and IBAN/account numbers. Coverage is broad but not exhaustive — manually verify for sensitive cases.",
      },
      {
        q: "Can it redact images?",
        a: "Yes — AI detects text inside images and offers to black it out. For photos containing PII (whiteboards, signed documents in photos), use the image-redaction toggle.",
      },
      {
        q: "Is the redaction reversible?",
        a: "No. That's the whole point. Save your unredacted master separately so you can re-redact differently later if needed.",
      },
    ],
    related: ["redline-contract-revisions", "ocr-old-archive", "extract-tables-from-financial-report"],
  },

  // ============================================================
  // 8. Extract tables from financial report
  // ============================================================
  "extract-tables-from-financial-report": {
    slug: "extract-tables-from-financial-report",
    h1: "How to extract every table from a financial PDF into one spreadsheet",
    sub: "10-K, 10-Q, annual report → clean Excel with one sheet per table, ready to chart.",
    audience: "Equity analysts, investors, FP&A teams pulling data out of regulatory filings",
    totalTime: "5 minutes per filing",
    steps: [
      {
        tool: "ai-table",
        title: "Run AI Table Extract on the filing",
        detail:
          "Drop in the 10-K. AI Table Extract identifies every table — balance sheet, income statement, cash flow, notes — and detects column boundaries even when the source uses spacing-based pseudo-tables (common in old filings).",
      },
      {
        tool: "ai-table",
        title: "Verify column headers",
        detail:
          "Multi-row headers ('FY 2024', '2023', '2022') sometimes come through misaligned. Spot-check the headers on the financial statements you'll actually use; the model is right ~95% of the time, that 5% will bite you.",
      },
      {
        tool: "ai-table",
        title: "Export as XLSX with one sheet per table",
        detail:
          "Each detected table becomes a sheet, named after the heading from the filing. Charts you build against the sheets stay tied to the source.",
      },
    ],
    whyItMatters:
      "Manually retyping financial-statement data is the worst kind of busy work. It's error-prone, slow, and the result is a one-shot deliverable that breaks if the filing is corrected. AI table extraction inverts the cost: 5 minutes of model work, instantly comparable across years and companies. For analysts covering 30 names, that's 30 hours per filing season recovered.",
    pitfalls: [
      {
        title: "Trusting numbers without verification",
        detail:
          "Models occasionally substitute digits — 0/O, 1/l, 5/S in particular. Sum the extracted column and compare to the printed total before relying on the data.",
      },
      {
        title: "Extracting from low-DPI scans",
        detail:
          "Old SEC filings can be image-only at low resolution. OCR first; extraction quality is bounded by the OCR layer it's reading from.",
      },
      {
        title: "Mixing currency formats",
        detail:
          "$1,234.56 vs €1.234,56 — the comma/decimal swap matters. Set the locale in the Options panel before extracting.",
      },
    ],
    tips: [
      {
        title: "Crop to the table area before extraction",
        detail:
          "Surrounding paragraphs sometimes confuse column detection. Crop the page to just the table for cleanest results.",
      },
      {
        title: "Use AI Table Extract over PDF-to-Excel for messy tables",
        detail:
          "The standard PDF-to-Excel works on clean grid tables. Multi-row headers, merged cells, and footnoted cells need AI Table Extract for clean output.",
      },
      {
        title: "Validate against printed totals",
        detail:
          "Every reputable filing has subtotal and total rows. If your extracted column doesn't sum to the printed total, you have an extraction error — usually a missed row.",
      },
    ],
    faq: [
      {
        q: "How accurate is the extraction?",
        a: "On clean digitally-generated PDFs (the modern norm for 10-Ks): 98%+ on numeric values, 95%+ on multi-row headers. On scanned filings, accuracy is bounded by OCR quality.",
      },
      {
        q: "What about footnoted values like 'see note 5'?",
        a: "We extract the cell content as-is including footnote markers. Some downstream processing may want to strip them — toggle 'flatten footnotes' in Options.",
      },
      {
        q: "Can I extract from multiple filings at once?",
        a: "Yes — use the API's batch endpoint. Drop in 30 10-Ks; get 30 XLSXs out, named by ticker.",
      },
      {
        q: "What if the table spans pages?",
        a: "Detected automatically. The output sheet has continuous rows; the page break in the source is invisible in the output.",
      },
    ],
    related: ["merge-bank-statements-for-accountant", "translate-handbook-to-multiple-languages", "convert-research-papers-to-study-notes"],
  },

  // ============================================================
  // 10. Convert research papers to study notes
  // ============================================================
  "convert-research-papers-to-study-notes": {
    slug: "convert-research-papers-to-study-notes",
    h1: "How to turn a 50-page research paper into clean study notes",
    sub: "Hierarchical bullets, key definitions, equations highlighted — your own personal cliff notes in 2 minutes.",
    audience: "Grad students, exam prep, professionals reading new papers in their field",
    totalTime: "2 minutes per paper",
    steps: [
      {
        tool: "ai-summarize",
        title: "Pick the 'Study Notes' summary format",
        detail:
          "Drop in the paper. Choose Study Notes (not Executive Summary) — the format produces hierarchical bullets with definitions called out, examples preserved, and section structure intact.",
      },
      {
        tool: "ai-chat",
        title: "Drill into specific sections",
        detail:
          "Use Chat with PDF to ask 'what was the sample size?' or 'how did they define the dependent variable?' Citations point you to the exact page when you need to verify.",
      },
      {
        tool: "ai-summarize",
        title: "Generate flashcards for review",
        detail:
          "Run the Flashcards format on the paper. You get spaced-repetition-ready Q&A pairs covering the key concepts, methods, and findings. Import into Anki or your study tool of choice.",
      },
    ],
    whyItMatters:
      "Nobody reads every word of every paper they cite. The skim-pattern is real, and it works — until you need to teach the material, write a literature review, or pass a comp exam on it. Study notes bridge skim and depth: they capture the structure and key claims so you can re-load context fast without rereading. For a literature review across 30 papers, this is the difference between a week and a month.",
    pitfalls: [
      {
        title: "Trusting summaries on factual claims",
        detail:
          "Models sometimes paraphrase numbers slightly. For specific claims (effect sizes, p-values, sample sizes), verify against the paper.",
      },
      {
        title: "Skipping methodology",
        detail:
          "If the summary glosses methodology, ask Chat with PDF directly: 'what statistical test was used?' 'how was the control group selected?' Methodology questions reveal whether the conclusions actually hold.",
      },
      {
        title: "Treating AI notes as your notes",
        detail:
          "The notes are a scaffold. Add your own annotations — what surprised you, what links to other papers, what you'd argue with. AI generates structure; you generate insight.",
      },
    ],
    tips: [
      {
        title: "Use bibliography extraction",
        detail:
          "The extract-citations tool pulls every reference into BibTeX. Pair with summaries to build a literature review database.",
      },
      {
        title: "Compare related papers",
        detail:
          "Run AI Compare on two papers in the same area. It surfaces the methodological differences that might explain conflicting results.",
      },
      {
        title: "Keep summaries alongside the source",
        detail:
          "Save 'paper.pdf' and 'paper-notes.md' together in your reference manager. Future you searches notes; finds the paper.",
      },
    ],
    faq: [
      {
        q: "How long is the typical study-notes output?",
        a: "Roughly 1 page of notes per 10 pages of paper, hierarchical. Adjustable in the Options panel — pick 'concise' for shorter, 'thorough' for longer.",
      },
      {
        q: "Does it handle equations?",
        a: "Equations rendered as PDF glyphs come through but lose their MathML structure. For math-heavy papers, keep the source PDF open alongside the notes.",
      },
      {
        q: "What about diagrams?",
        a: "Diagrams stay in the source PDF. Notes reference them by figure number. We don't (yet) re-render diagrams in the summary.",
      },
      {
        q: "Can I generate study notes in another language?",
        a: "Yes — set the output language. Summarize and Translate are independent ops; you can chain them or set the language directly in the Summarize options.",
      },
    ],
    related: ["thesis-combine-and-format", "extract-tables-from-financial-report", "translate-handbook-to-multiple-languages"],
  },
};

export const USE_CASE_SLUGS = Object.keys(USE_CASES) as UseCaseSlug[];
