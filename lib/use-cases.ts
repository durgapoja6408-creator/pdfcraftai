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
  | "convert-research-papers-to-study-notes"
  | "compress-pdf-for-email"
  | "fill-and-sign-pdf-form"
  | "tailor-resume-for-ats"
  | "split-pdf-into-separate-documents"
  | "summarize-a-long-report-with-ai"
  | "prepare-exhibits-for-court-filing"
  | "create-an-onboarding-pack-for-new-hires"
  | "convert-deck-to-handout"
  | "remove-metadata-before-publishing"
  | "extract-images-from-a-pdf"
  | "add-a-watermark-before-sharing-a-draft"
  | "rotate-and-straighten-a-scanned-pdf"
  | "make-a-pdf-grayscale-for-printing"
  | "make-a-pdf-accessible-for-screen-readers"
  | "convert-markdown-notes-to-pdf";

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

  // -------------------------------------------------------------
  // Shrink a PDF to fit an email attachment limit (compress)
  // -------------------------------------------------------------
  "compress-pdf-for-email": {
    slug: "compress-pdf-for-email",
    h1: "How to shrink a PDF to fit an email attachment limit",
    sub: "Get a 40 MB scan under Gmail's 25 MB or Outlook's ~20 MB cap — without it turning to mush.",
    audience: "Anyone bouncing off a 'file too large' error sending invoices, scans, decks, or contracts by email",
    totalTime: "2 minutes",
    steps: [
      {
        tool: "page-count",
        title: "Check what you're actually dealing with",
        detail:
          "Run PDF Inspector first. If the file is huge because it's a 300-page scan, you'll compress differently than if it's a 6-page deck with one enormous embedded image. Know the page count and where the weight is.",
      },
      {
        tool: "compress-pdf",
        title: "Compress at the right quality level",
        detail:
          "Start with Balanced. Most scanned and image-heavy PDFs drop 60-80% with no visible difference at screen and normal print sizes. If it's still over the limit, step up to Strong; if the text must stay razor-sharp for print, use Light and pair it with the next step.",
      },
      {
        tool: "split",
        title: "If it's still too big, split instead of crushing",
        detail:
          "A 250-page contract won't fit any cap at readable quality. Split it into 'Part 1 / Part 2' by page range and send two clean emails — far better than a single unreadable file. Recipients prefer two legible halves to one blurry whole.",
      },
    ],
    whyItMatters:
      "Email size limits are the single most common reason a PDF won't send: Gmail caps attachments at 25 MB, Outlook.com at about 20 MB, and many corporate mail servers at 10 MB or less. The instinct is to crush quality until it fits, but over-compression makes text fuzzy and tables unreadable — which defeats the purpose of sending the document at all. The right move is to compress intelligently (most of a PDF's weight is rescaleable images, not text) and, only when a file is genuinely too large at acceptable quality, to split it. Compress PDF runs server-side with Ghostscript, keeps text selectable and searchable, and falls back to your original if compression wouldn't actually help — so you never ship a 'compressed' file that's somehow bigger. Doing this in two minutes beats uploading to a sketchy 'free' site that watermarks your invoice or emails you forever after.",
    pitfalls: [
      {
        title: "Going straight to maximum compression",
        detail:
          "Strong compression on a text-only PDF gains you almost nothing and can soften the type. Balanced is the right default; only escalate if you're still over the cap.",
      },
      {
        title: "Compressing a file that's mostly text",
        detail:
          "If the weight is text and vectors, compression has little to work with — you need to split, not crush. PDF Inspector tells you which case you're in before you waste a pass.",
      },
      {
        title: "Forgetting the recipient's limit, not yours",
        detail:
          "Your provider may allow 25 MB but a corporate recipient's gateway may reject anything over 10 MB silently. When in doubt, aim under 10 MB or use a shared link.",
      },
    ],
    tips: [
      {
        title: "Name the output so you can tell versions apart",
        detail:
          "invoice-2026-03-compressed.pdf keeps the email-ready copy distinct from your full-resolution master.",
      },
      {
        title: "Compress AFTER merging, not before",
        detail:
          "If you're combining several scans, merge first and compress the single result once — compressing each part then merging re-bloats the file.",
      },
      {
        title: "Everything runs in your browser or our server, watermark-free",
        detail:
          "Compress PDF is free and unlimited, adds no watermark, and never stores your file — important when the attachment is a contract or an invoice.",
      },
    ],
    faq: [
      {
        q: "Will compressing make the text blurry?",
        a: "Text stays vector-sharp at Balanced and Light — only embedded images are downsampled. Strong can soften scanned (image-based) text, so use it only when you must fit a hard cap.",
      },
      {
        q: "What's the most I can realistically save?",
        a: "Image-heavy and scanned PDFs commonly drop 60-90%. Text-and-vector PDFs are already small, so expect little — for those, split instead.",
      },
      {
        q: "Is my file uploaded anywhere?",
        a: "Compress runs server-side (Ghostscript) but the file is processed in memory and not retained. If it doesn't actually get smaller, you get your original back unchanged.",
      },
      {
        q: "What if even Strong isn't enough?",
        a: "The PDF is genuinely too large for the cap at readable quality — split it by page range and send in parts, or share a link instead of an attachment.",
      },
    ],
    related: ["merge-bank-statements-for-accountant", "combine-receipts-for-expense-report", "fill-and-sign-pdf-form"],
  },

  // -------------------------------------------------------------
  // Fill out and sign a PDF form without printing
  // -------------------------------------------------------------
  "fill-and-sign-pdf-form": {
    slug: "fill-and-sign-pdf-form",
    h1: "How to fill out and sign a PDF form without printing it",
    sub: "Type into the fields, drop in your signature, lock it so it can't be edited — no printer, no scanner.",
    audience: "Anyone sent a PDF form to 'print, sign, and scan back' — onboarding paperwork, consent forms, applications, NDAs",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "pdf-form-fill",
        title: "Type directly into the form fields",
        detail:
          "If the PDF has real AcroForm fields, Fill PDF Form shows them as editable inputs — text boxes, checkboxes, radio buttons, dropdowns. Tab through and type. No printing, no handwriting.",
      },
      {
        tool: "sign-pdf-free",
        title: "Add your signature",
        detail:
          "Draw, type, or upload a signature image and place it on the signature line. Resize and position it exactly; add the date next to it the same way.",
      },
      {
        tool: "pdf-form-fill",
        title: "Flatten so it can't be changed",
        detail:
          "Toggle 'flatten' before exporting. This bakes your typed values and signature into the page so the recipient gets a final, non-editable document — not a form they could alter after you signed it.",
      },
    ],
    whyItMatters:
      "The 'print, sign, scan' loop is a relic. It wastes paper, needs hardware most people don't have at home anymore, and produces a crooked, low-contrast scan of a document that started as a crisp digital file. Filling and signing in place keeps the output sharp, legible, and small, and it's faster — three minutes versus the printer hunt. The one thing people get wrong is leaving the form editable: a filled-but-not-flattened PDF still has live fields, so anyone downstream can change your answers or move your signature. Flattening solves that by merging everything into the page image. For documents that need legal-grade signatures with an audit trail you'd use a dedicated e-signature service, but for the everyday 'sign here and send it back' form, filling and flattening in the browser is exactly right — and your file never leaves your device for the free tools.",
    pitfalls: [
      {
        title: "The PDF has no real form fields",
        detail:
          "Some 'forms' are just flat scans with lines drawn on them — there are no fields to type into. In that case, skip straight to placing text and signature boxes manually with the editor instead of the form filler.",
      },
      {
        title: "Sending it unflattened",
        detail:
          "If you don't flatten, the recipient receives live, editable fields — they can change your answers or your signature. Always flatten before exporting a signed form.",
      },
      {
        title: "A signature image with a white box around it",
        detail:
          "Upload a PNG with a transparent background, not a JPG photo of paper. A white rectangle around your signature looks pasted-on and unprofessional.",
      },
    ],
    tips: [
      {
        title: "Save your signature once",
        detail:
          "Create a clean transparent-PNG signature one time and reuse it. You'll sign the next form in under a minute.",
      },
      {
        title: "Check checkboxes are really checked",
        detail:
          "Radio groups only allow one selection — make sure the right option registered before flattening, since you can't change it afterward.",
      },
      {
        title: "Keep an editable copy if you'll reuse the form",
        detail:
          "Flatten the version you send, but keep the un-flattened one if it's a form you fill out repeatedly (timesheets, weekly reports).",
      },
    ],
    faq: [
      {
        q: "Do I need to print anything?",
        a: "No. You type into the fields, add a signature, and export a finished PDF entirely on-screen. No printer or scanner involved.",
      },
      {
        q: "Is a flattened signature legally binding?",
        a: "A typed/drawn signature on a flattened PDF is fine for most everyday agreements. For documents that require a verifiable audit trail (real-estate, regulated finance), use a dedicated e-signature provider — this is for the common 'sign and return' case.",
      },
      {
        q: "What if the form isn't fillable?",
        a: "If there are no AcroForm fields, use the editor to place text and a signature image directly on the page, then export — same result, slightly more manual.",
      },
      {
        q: "Does my form get uploaded?",
        a: "Fill PDF Form and Sign run in your browser — the document never touches our servers, which matters for HR and legal paperwork.",
      },
    ],
    related: ["redact-pdf-before-sharing", "compress-pdf-for-email", "redline-contract-revisions"],
  },

  // -------------------------------------------------------------
  // Format a resume PDF to pass an ATS
  // -------------------------------------------------------------
  "tailor-resume-for-ats": {
    slug: "tailor-resume-for-ats",
    h1: "How to format your resume PDF so an ATS can actually read it",
    sub: "Check what the parser sees, match it to the job description, and fix the formatting that gets resumes auto-rejected.",
    audience: "Job seekers applying through Workday, Greenhouse, Lever, Taleo, or any online application portal",
    totalTime: "10 minutes",
    steps: [
      {
        tool: "ai-ats-resume",
        title: "See your resume the way the ATS sees it",
        detail:
          "ATS Resume Check extracts your resume the way an applicant-tracking system would — as plain text — and flags what breaks: multi-column layouts that scramble reading order, text trapped inside images, tables the parser can't follow, and contact details stuck in headers it ignores.",
      },
      {
        tool: "ai-jd-match",
        title: "Match it against the actual job description",
        detail:
          "Paste the job posting. JD Match compares your resume to it and shows which required skills and keywords are missing, so you can add the ones you genuinely have in the wording the screener expects.",
      },
      {
        tool: "pdf-to-text",
        title: "Confirm the final export is clean",
        detail:
          "Export your fixed resume and run PDF to Text on it. If the plain-text output reads top-to-bottom in the right order with your name, titles, and dates intact, the ATS will parse it correctly too.",
      },
    ],
    whyItMatters:
      "Most mid-to-large companies run every applied resume through an applicant-tracking system before a human sees it, and a resume that looks beautiful to you can be unreadable to the parser. The usual culprits are design choices: two-column layouts (the parser reads across columns and scrambles your history), skills shown as graphics or icons (invisible as text), important details in the header or footer (often skipped), and tables for layout (read out of order). The fix isn't to dumb your resume down — it's to keep a single-column, text-based structure with standard section headings, then verify by reading the extracted text. The second half is relevance: ATS screens rank resumes by how well they match the job description's keywords, so a resume that's readable but doesn't reflect the posting's language still ranks low. Check both — parseability and match — and you clear the gate that auto-rejects the majority of applicants before any recruiter opens the file.",
    pitfalls: [
      {
        title: "Two-column 'designer' templates",
        detail:
          "They look modern but parsers read straight across, interleaving your job titles with your skills. Use a single-column layout for anything submitted through a portal.",
      },
      {
        title: "Skills or contact info as images/icons",
        detail:
          "A graphic skills bar or an icon-only phone number is invisible to the ATS. Everything that must be searchable has to be real text.",
      },
      {
        title: "Keyword-stuffing to game the match",
        detail:
          "Pasting the whole job description in white text fools nothing modern and reads terribly to the human who gets you next. Add only the keywords you can honestly back up.",
      },
    ],
    tips: [
      {
        title: "Keep two versions",
        detail:
          "An ATS-clean single-column PDF for portal applications, and a designed version for when you email a human directly or hand one over in person.",
      },
      {
        title: "Use standard section headings",
        detail:
          "'Experience', 'Education', 'Skills' — parsers map these reliably. Clever headings like 'Where I've Made Impact' confuse them.",
      },
      {
        title: "Re-run the match per role",
        detail:
          "Each posting weights different keywords. A 60-second JD Match per application is the highest-leverage tailoring you can do.",
      },
    ],
    faq: [
      {
        q: "Does the ATS really reject resumes automatically?",
        a: "It ranks and filters them. A resume the parser can't read, or that misses the role's key requirements, usually never reaches a recruiter — so a clean parse plus a strong keyword match is what gets you seen.",
      },
      {
        q: "Is a PDF or a Word doc better for an ATS?",
        a: "Modern ATSs parse both fine; the format matters less than the structure. A single-column, text-based PDF parses reliably — the check confirms it before you submit.",
      },
      {
        q: "What exactly does the ATS check flag?",
        a: "Reading-order problems from columns and tables, text trapped in images, contact details in headers/footers, non-standard section names, and unsupported fonts — the things that scramble or drop your information.",
      },
      {
        q: "Will JD Match write my resume for me?",
        a: "No — it surfaces the gaps between your resume and the posting so you can add what's genuinely true. You stay in control of the wording.",
      },
    ],
    related: ["convert-research-papers-to-study-notes", "fill-and-sign-pdf-form", "translate-handbook-to-multiple-languages"],
  },

  // ============================================================
  // 13. Split a PDF into separate documents
  // ============================================================
  "split-pdf-into-separate-documents": {
    slug: "split-pdf-into-separate-documents",
    h1: "How to split one big PDF into separate documents",
    sub: "Turn a single scanned stack into clean, individually-named files — in your browser, nothing uploaded.",
    audience: "Anyone who scanned a pile of documents as one PDF, or needs to send just part of a file",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "split",
        title: "Split by page range or fixed interval",
        detail:
          "Open Split and choose how to break the file up — by page range (1-4, 5-9, …) or every N pages. Each range becomes its own PDF. It runs locally, so the file never leaves your device.",
      },
      {
        tool: "extract-pages",
        title: "Or pull out just the pages you need",
        detail:
          "If you only want a few specific pages — a single signed form buried in a 40-page scan — use Extract Pages to lift them into a fresh PDF instead of splitting everything.",
      },
      {
        tool: "compress-pdf",
        title: "Shrink the pieces before sending (optional)",
        detail:
          "Scanned pages are heavy. Run each split file through Compress to get it under a mailbox or upload-portal size limit without visible quality loss.",
      },
    ],
    whyItMatters:
      "Scanners and phone apps capture everything as one long PDF, but the way you actually use documents is one at a time — emailing a single bank statement rather than all twelve, uploading one form to a portal that wants one document per field, or filing scans by type. Splitting turns an undifferentiated stack into the discrete files your workflow expects. Because Split and Extract Pages copy the original pages without re-encoding, the output is identical to the source — no quality loss, no compression artefacts on text or signatures. And because the work happens entirely in your browser, sensitive scans like IDs, statements, and contracts never leave your device. The result: the right pages, in the right files, named the way you need, in a couple of minutes.",
    pitfalls: [
      {
        title: "Splitting before you know the page boundaries",
        detail:
          "Skim the PDF and note where each document starts. Splitting 'every 2 pages' only works if every document is exactly 2 pages — mixed-length documents need explicit ranges.",
      },
      {
        title: "Losing track of which file is which",
        detail:
          "Split tools name outputs file-1, file-2, and so on. Rename them right away (or plan the order first) so 'pages 5-8' doesn't become an anonymous file-2.pdf you can't identify later.",
      },
    ],
    tips: [
      {
        title: "Use page ranges for mixed-length documents",
        detail:
          "Fixed intervals are fastest for uniform files; explicit ranges give you control when each document is a different length.",
      },
      {
        title: "Extract beats split for one-off pulls",
        detail:
          "If you only need one section, Extract Pages is cleaner than splitting the whole file and deleting the rest.",
      },
    ],
    faq: [
      {
        q: "Does splitting reduce quality?",
        a: "No. Splitting copies the original pages byte-for-byte into new files — there's no re-encoding, so the pages are identical to the source.",
      },
      {
        q: "Will my file be uploaded to split it?",
        a: "No. Split runs entirely in your browser. The PDF never leaves your device, which matters for scanned IDs, statements, or contracts.",
      },
      {
        q: "Can I split a password-protected PDF?",
        a: "Unlock it first — with the password you own — using the Unlock tool, then split. A file we can't open is a file we can't split.",
      },
      {
        q: "How many pieces can I split into?",
        a: "As many as the file has pages — one document per page if you want. Large files split smoothly because the work happens locally.",
      },
    ],
    related: ["combine-receipts-for-expense-report", "merge-bank-statements-for-accountant", "create-an-onboarding-pack-for-new-hires"],
  },

  // ============================================================
  // 14. Summarize a long report with AI
  // ============================================================
  "summarize-a-long-report-with-ai": {
    slug: "summarize-a-long-report-with-ai",
    h1: "How to summarize a long PDF report in seconds",
    sub: "Turn a 50-page report into a one-paragraph summary and a bullet list of key points before your meeting.",
    audience: "Managers, analysts, consultants, and students who have to absorb a long report fast",
    totalTime: "2 minutes",
    steps: [
      {
        tool: "ai-summarize",
        title: "Generate a plain-language summary",
        detail:
          "Upload the report and run Summarize. You get a concise, readable overview of the whole document — the gist, not a page-by-page rehash.",
      },
      {
        tool: "ai-key-points",
        title: "Pull the key points as a bullet list",
        detail:
          "Run Key Points to extract the decisions, figures, and takeaways as a scannable list you can paste straight into your notes or an email.",
      },
      {
        tool: "ai-chat",
        title: "Ask follow-up questions",
        detail:
          "Open Chat with the same PDF to drill in — 'what's the Q3 revenue figure?', 'what risks are flagged?' — and get answers grounded in the document.",
      },
    ],
    whyItMatters:
      "A long report landing in your inbox the night before a meeting is a familiar kind of dread. Reading all 50 pages isn't realistic; skimming means you miss the figure that matters. An AI summary is triage: it tells you the gist in a paragraph so you can decide what actually deserves a careful read. The three tools form a funnel — Summarize for the overview, Key Points for the scannable takeaways, and Chat to interrogate the specific numbers or claims you care about, each answer drawn from the document itself. It won't replace reading the sections you'll act on, but it gets you oriented in two minutes instead of two hours. Note that these AI tools run on credits — the 60 non-AI tools stay free — and new accounts get free credits to try them.",
    pitfalls: [
      {
        title: "Treating the summary as the source of truth",
        detail:
          "A summary is a fast read, not a citation. For anything you'll quote or act on financially or legally, confirm it against the page in the original.",
      },
      {
        title: "Summarizing a scanned (image-only) report",
        detail:
          "If the PDF is scanned, make it searchable first so the AI reads real text rather than seeing blank images.",
      },
    ],
    tips: [
      {
        title: "Chain summary, then key points, then chat",
        detail:
          "Each step zooms in further. Start broad, then ask targeted questions only about the parts that matter to you.",
      },
      {
        title: "Paste the key points into your meeting notes",
        detail:
          "The bullet output is meeting-ready — drop it into the agenda so everyone starts from the same takeaways.",
      },
    ],
    faq: [
      {
        q: "How long can the report be?",
        a: "Long reports are fine — the tool chunks the document, so length isn't a hard wall. Very large files just take a little longer to process.",
      },
      {
        q: "Do the AI tools cost credits?",
        a: "Yes — Summarize, Key Points, and Chat run on credits. The 60 non-AI tools stay free, and new accounts get free credits to try the AI ones.",
      },
      {
        q: "Is my report used to train a model?",
        a: "No. Your file is processed for the summary you asked for and isn't used to train any model.",
      },
      {
        q: "How accurate is the summary?",
        a: "Good for triage and gist. For figures or claims you'll rely on, verify against the original — that's true of any summary, human or AI.",
      },
      {
        q: "Can I get the summary in another language?",
        a: "Yes — pair Summarize with the Translate tool to read the gist in the language you prefer.",
      },
    ],
    related: ["convert-research-papers-to-study-notes", "extract-tables-from-financial-report", "redline-contract-revisions"],
  },

  // ============================================================
  // 15. Prepare exhibits for a court filing
  // ============================================================
  "prepare-exhibits-for-court-filing": {
    slug: "prepare-exhibits-for-court-filing",
    h1: "How to prepare exhibits for a court filing",
    sub: "Combine, Bates-number, and archive your exhibits into one court-ready PDF.",
    audience: "Paralegals, litigators, and self-represented filers assembling an exhibit bundle",
    totalTime: "10 minutes",
    steps: [
      {
        tool: "merge",
        title: "Combine the exhibits in order",
        detail:
          "Merge each exhibit into one file in the order they're referenced. Drag the thumbnails to lock the sequence before you combine.",
      },
      {
        tool: "bates-numbers",
        title: "Apply Bates numbering",
        detail:
          "Run Bates Numbers to stamp sequential identifiers (e.g. ABC-000001) across every page — the standard way courts and opposing counsel cite a specific page.",
      },
      {
        tool: "page-numbers",
        title: "Add a page-number footer (optional)",
        detail:
          "If your jurisdiction wants plain page numbers in addition to Bates stamps, add them as a footer positioned so it won't collide with the Bates field.",
      },
      {
        tool: "pdf-a-convert",
        title: "Convert to PDF/A for filing",
        detail:
          "Many e-filing systems require PDF/A for archival integrity. Convert as the final step so fonts and layout are embedded and locked.",
      },
    ],
    whyItMatters:
      "An exhibit bundle only works if every page can be cited unambiguously and rendered identically by the court, opposing counsel, and the record years later. That's what this workflow delivers: a single merged file in the referenced order, Bates numbering as the citation backbone so 'ABC-000142' always points to the same page, and PDF/A output that embeds fonts and locks layout the way most e-filing systems require. Getting the order and the numbering right before you file matters — a late re-order shifts every Bates number and breaks your references. Because merging and the page tools run in your browser, privileged and sealed material stays on your device. This is a document-preparation workflow, not legal advice: confirm page-size, numbering, and format requirements against your court's local rules before filing.",
    pitfalls: [
      {
        title: "Bates-numbering before the order is final",
        detail:
          "Stamp last. If you re-order or add an exhibit after Bates numbering, every downstream number shifts and your citations break.",
      },
      {
        title: "Letting Bates stamps overlap content",
        detail:
          "Place the Bates field in a clear margin — bottom-right is conventional — so it never covers exhibit text or a signature.",
      },
      {
        title: "Ignoring the court's format rules",
        detail:
          "Page-size, PDF/A, and numbering conventions vary by court. Check the local rules first — the tools handle the mechanics, not the jurisdiction's requirements.",
      },
    ],
    tips: [
      {
        title: "Keep an un-stamped master",
        detail:
          "Bates-number a copy, not your only file, so you can re-stamp cleanly if the exhibit list changes.",
      },
      {
        title: "Make scanned exhibits searchable first",
        detail:
          "If exhibits are scans, OCR them so the whole bundle is text-searchable for everyone working the case.",
      },
    ],
    faq: [
      {
        q: "What is Bates numbering?",
        a: "A sequential page identifier — usually a prefix plus a zero-padded number — stamped on every page so any page can be cited unambiguously across a case.",
      },
      {
        q: "Are my case files uploaded?",
        a: "Merge and the page tools run in your browser, so exhibit files stay on your device — which matters for privileged or sealed material.",
      },
      {
        q: "Why PDF/A for filing?",
        a: "PDF/A embeds fonts and forbids external dependencies, so the filed document renders identically years later. That's why many e-filing systems require it.",
      },
      {
        q: "Can I restart Bates numbers per exhibit?",
        a: "Most filings use one continuous sequence across the whole bundle. Check your court's rule; the tool supports a fixed prefix plus a continuous counter.",
      },
      {
        q: "Is this legal advice?",
        a: "No. This is a document-preparation workflow. Confirm filing requirements with the court's rules or your attorney.",
      },
    ],
    related: ["redline-contract-revisions", "redact-pdf-before-sharing", "merge-bank-statements-for-accountant"],
  },

  // ============================================================
  // 16. Create an onboarding pack for new hires
  // ============================================================
  "create-an-onboarding-pack-for-new-hires": {
    slug: "create-an-onboarding-pack-for-new-hires",
    h1: "How to build a new-hire onboarding pack as one PDF",
    sub: "Combine your handbook, policies, and forms into one clean, fillable onboarding PDF.",
    audience: "HR, people-ops, and small-business owners putting together a new-hire packet",
    totalTime: "8 minutes",
    steps: [
      {
        tool: "merge",
        title: "Combine handbook, policies, and forms",
        detail:
          "Merge the employee handbook, policy documents, and any forms into a single file in reading order. Drag the thumbnails so the welcome letter lands first.",
      },
      {
        tool: "page-numbers",
        title: "Add page numbers and a footer",
        detail:
          "Run Page Numbers so the pack reads like one coherent document and a new hire can be pointed to 'page 12' during onboarding.",
      },
      {
        tool: "pdf-form-fill",
        title: "Make the forms fillable",
        detail:
          "Use Form Fill so tax, direct-deposit, and acknowledgment forms can be completed and signed digitally instead of printed and re-scanned.",
      },
      {
        tool: "compress-pdf",
        title: "Compress for easy sending",
        detail:
          "Shrink the finished pack so it sends cleanly over email or fits your HRIS upload limit.",
      },
    ],
    whyItMatters:
      "Onboarding is a first impression, and a stack of separate attachments — handbook here, tax form there, policy PDF somewhere else — makes that impression a confusing one. Combining everything into a single, page-numbered, fillable pack turns it into a guided experience: the new hire opens one file, sees a welcome up front, and completes the forms digitally without printing anything. It's also consistency insurance — build the pack once and every hire gets the same complete set, instead of whatever you remembered to attach that day. Because the merge, page-numbering, and compression steps run in your browser, the personal data on those onboarding forms stays on your device. Keep the finished pack as a master and swap only the role-specific pages for the next hire.",
    pitfalls: [
      {
        title: "Burying the welcome and the to-dos",
        detail:
          "Lead with a one-page welcome and a checklist of what to complete. A 40-page pack with the action items on page 30 doesn't get finished.",
      },
      {
        title: "Shipping flat (non-fillable) forms",
        detail:
          "A form a new hire has to print, sign, and re-scan kills momentum. Make forms fillable so the whole pack is digital.",
      },
    ],
    tips: [
      {
        title: "Keep a template pack",
        detail:
          "Build the pack once, then swap only the role-specific pages for each hire instead of rebuilding from scratch.",
      },
      {
        title: "Add a checklist page up front",
        detail:
          "A simple 'Day 1 / Week 1' checklist turns a document into a guided onboarding.",
      },
    ],
    faq: [
      {
        q: "Can new hires fill the forms without buying software?",
        a: "Yes — once you make the forms fillable, they complete them in any PDF viewer or right in the browser.",
      },
      {
        q: "Is employee data uploaded anywhere?",
        a: "Merge, page numbers, and compress run in your browser, so the onboarding documents stay on your device.",
      },
      {
        q: "Can I reuse the pack for every hire?",
        a: "Yes — keep it as a master and swap the role-specific pages. That's the fastest way to keep onboarding consistent.",
      },
      {
        q: "How do I keep the file size down?",
        a: "Run the finished pack through Compress — it trims embedded images and fonts so it sends over email without hitting size limits.",
      },
    ],
    related: ["combine-receipts-for-expense-report", "fill-and-sign-pdf-form", "split-pdf-into-separate-documents"],
  },

  // ============================================================
  // 17. Convert a slide deck to a printable handout
  // ============================================================
  "convert-deck-to-handout": {
    slug: "convert-deck-to-handout",
    h1: "How to turn a slide deck PDF into a printable handout",
    sub: "Put 2, 4, or 6 slides per page, number them, and shrink the file for clean printing or sharing.",
    audience: "Presenters, trainers, lecturers, and students turning slides into leave-behinds",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "n-up-pdf",
        title: "Place multiple slides per page",
        detail:
          "Open N-up and choose a layout — 2-up for readability, 4-up or 6-up to save paper. Each printed page now holds several slides in order.",
      },
      {
        tool: "page-numbers",
        title: "Add page numbers",
        detail:
          "Run Page Numbers so the handout is easy to reference — 'turn to page 4' works once the slides are laid out as handout pages.",
      },
      {
        tool: "compress-pdf",
        title: "Compress for email or printing",
        detail:
          "Decks are image-heavy. Compress trims the file so it emails cleanly and spools fast at the print shop.",
      },
    ],
    whyItMatters:
      "Slides are designed for a projector, not a page. Printed one-to-a-sheet, a deck wastes paper and reads like a flipbook; what an audience actually keeps is a tidy handout they can annotate. N-up rearranges the slides into a real handout — two, four, or six to a page, in order — and page numbers make it referenceable during the talk. Because the leave-behind is often what people revisit after a session, it's worth the two extra minutes to make it legible and light enough to email. And since N-up, Page Numbers, and Compress all run in your browser, an unreleased deck never leaves your device while you prepare it.",
    pitfalls: [
      {
        title: "Going too dense for slides with small text",
        detail:
          "If your slides carry fine print or detailed charts, 2-up keeps them legible. 6-up is for high-level decks, not data-heavy ones.",
      },
      {
        title: "Forgetting speaker notes are lost",
        detail:
          "A slides-only PDF doesn't carry your speaker notes. If the audience needs the narration, export notes pages from your slide tool first, then N-up that file.",
      },
    ],
    tips: [
      {
        title: "2-up leaves room for notes",
        detail:
          "Two slides per page leaves margin for handwritten notes — a favourite layout for workshops and lectures.",
      },
      {
        title: "Proof the layout before the print shop",
        detail:
          "Preview the N-up output first so you catch a cramped grid before you pay for a print run.",
      },
    ],
    faq: [
      {
        q: "How many slides per page can I fit?",
        a: "Common layouts are 2, 4, and 6 per page. 2-up is the most legible; 6-up is the most paper-efficient.",
      },
      {
        q: "Will N-up reduce quality?",
        a: "It rescales pages to fit the grid but doesn't re-compress your slides — text and vectors stay crisp. Run Compress separately only if you need a smaller file.",
      },
      {
        q: "Is my deck uploaded?",
        a: "No. N-up, Page Numbers, and Compress run in your browser, so an unreleased deck never leaves your device.",
      },
      {
        q: "Can I keep the original slide numbers?",
        a: "Page Numbers numbers the handout pages. If you need the original slide numbers too, keep them on the slides before you export to PDF.",
      },
    ],
    related: ["thesis-combine-and-format", "create-an-onboarding-pack-for-new-hires", "compress-pdf-for-email"],
  },

  // ============================================================
  // 18. Remove hidden metadata before publishing
  // ============================================================
  "remove-metadata-before-publishing": {
    slug: "remove-metadata-before-publishing",
    h1: "How to remove hidden metadata from a PDF before publishing",
    sub: "Strip author names, software tags, and edit history before a document goes public.",
    audience: "Journalists, researchers, and anyone publishing a PDF who doesn't want hidden data attached",
    totalTime: "2 minutes",
    steps: [
      {
        tool: "pdf-inspector",
        title: "See what's actually in the file",
        detail:
          "Open PDF Inspector to view the document's metadata — author, creator software, creation and modification dates, and embedded properties you may not know are there.",
      },
      {
        tool: "remove-metadata",
        title: "Strip the metadata",
        detail:
          "Run Remove Metadata to clear the author, title, keywords, and producer fields so the published file carries no identifying trail.",
      },
      {
        tool: "flatten-pdf",
        title: "Flatten to drop layered data (optional)",
        detail:
          "If the PDF has form fields, annotations, or layers, flatten it so nothing interactive or hidden survives in the public copy.",
      },
    ],
    whyItMatters:
      "PDFs quietly carry more than their visible text: the author's real name, the organisation's software, timestamps, and sometimes earlier wording inside annotations or form fields. Publish without checking and you can leak who wrote a document or when — which matters for a source's safety, a blind peer review, or a confidential bid. PDF Inspector shows you exactly what's embedded, Remove Metadata clears the document properties, and Flatten removes the layered or interactive remnants. All three run in your browser, so the file never touches a server while you clean it. Metadata removal is a deliberate step — saving a file usually preserves (or even adds) metadata rather than stripping it.",
    pitfalls: [
      {
        title: "Assuming 'Save As' strips metadata",
        detail:
          "Most editors preserve or even add metadata on save. Removing it is a deliberate action, not a side effect of saving.",
      },
      {
        title: "Forgetting annotations and form fields",
        detail:
          "Metadata isn't only the document properties — comments and form data can carry names too. Flatten if the file has any.",
      },
      {
        title: "Confusing metadata with visible content",
        detail:
          "Removing metadata doesn't hide sensitive text in the body. If you need to obscure content on the page, redact it as a separate step.",
      },
    ],
    tips: [
      {
        title: "Inspect before AND after",
        detail:
          "Re-open PDF Inspector on the cleaned file to confirm the fields are actually empty before you publish.",
      },
      {
        title: "Keep an internal master",
        detail:
          "Strip a copy for publication and keep the original, with its metadata, for your own records.",
      },
    ],
    faq: [
      {
        q: "What metadata does a PDF carry?",
        a: "Typically author, title, subject, keywords, the creating application, and creation/modification timestamps — plus anything left in annotations or form fields.",
      },
      {
        q: "Is the file uploaded to clean it?",
        a: "No. Inspector, Remove Metadata, and Flatten run in your browser, so a sensitive document never leaves your device.",
      },
      {
        q: "Does this remove visible content too?",
        a: "No — it clears hidden metadata. To obscure visible text on the page, use a redaction tool as well.",
      },
      {
        q: "Will removing metadata break the PDF?",
        a: "No. Clearing document properties doesn't affect the visible content; the file opens and prints exactly as before.",
      },
    ],
    related: ["redact-pdf-before-sharing", "extract-images-from-a-pdf", "prepare-exhibits-for-court-filing"],
  },

  // ============================================================
  // 19. Extract images from a PDF
  // ============================================================
  "extract-images-from-a-pdf": {
    slug: "extract-images-from-a-pdf",
    h1: "How to extract images from a PDF",
    sub: "Pull every photo, chart, and figure out of a PDF as separate image files.",
    audience: "Designers, content teams, and students reusing figures, photos, or charts from a PDF",
    totalTime: "2 minutes",
    steps: [
      {
        tool: "extract-images",
        title: "Extract the embedded images",
        detail:
          "Open Extract Images and drop in the PDF. It pulls out the embedded raster images — photos, scanned figures, logos — as individual files you can download.",
      },
      {
        tool: "pdf-to-png",
        title: "Or render whole pages as images",
        detail:
          "If what you want is a chart drawn with vectors rather than a stored photo, render the page itself with PDF to PNG to capture exactly what's shown.",
      },
    ],
    whyItMatters:
      "Reusing a figure from a report, grabbing a photo from a brochure, lifting a chart for a slide — copy-and-paste out of a PDF viewer is lossy and fiddly. Extract Images lifts the original embedded assets at the resolution they were stored, so you get the real picture, not a screenshot of it. For graphics that aren't stored as images — many charts and logos are vectors — rendering the page to PNG captures the visual instead. Both run locally, so a proprietary deck or report stays on your device. One caveat that isn't technical: extracting an image doesn't grant you the right to republish it — check the source's licence before reusing someone else's work.",
    pitfalls: [
      {
        title: "Embedded image vs. rendered page",
        detail:
          "A chart drawn with vectors isn't an 'image' inside the file, so Extract Images won't find it. Use PDF to PNG to capture the page as it looks.",
      },
      {
        title: "Expecting editable graphics",
        detail:
          "Extracted images are flat rasters, not editable vectors. You can't re-colour a chart this way — you get the picture as it was stored.",
      },
      {
        title: "Reuse rights",
        detail:
          "Pulling an image out doesn't give you permission to republish it. Check the source's licence before reusing someone else's figure.",
      },
    ],
    tips: [
      {
        title: "Resolution comes from the source",
        detail:
          "Extracted images are only as sharp as they were stored. For a crisp result from a vector page, render at a higher DPI with PDF to PNG.",
      },
      {
        title: "Batch a whole report in one pass",
        detail:
          "Extract Images handles a multi-page PDF at once — you don't have to go page by page.",
      },
    ],
    faq: [
      {
        q: "Does it get every image?",
        a: "It extracts the embedded raster images. Vector graphics (many charts and logos) aren't stored as images — render those pages with PDF to PNG instead.",
      },
      {
        q: "What format are the extracted images?",
        a: "They come out in standard image formats you can open and reuse anywhere.",
      },
      {
        q: "Is the PDF uploaded?",
        a: "No. Extract Images and PDF to PNG run in your browser, so the source file never leaves your device.",
      },
      {
        q: "Can I extract from a scanned PDF?",
        a: "Yes — a scanned page is itself an image, so it extracts directly. For the text on it, use an OCR tool instead.",
      },
    ],
    related: ["remove-metadata-before-publishing", "convert-deck-to-handout", "extract-tables-from-financial-report"],
  },

  // ============================================================
  // 20. Add a DRAFT / CONFIDENTIAL watermark before sharing
  // ============================================================
  "add-a-watermark-before-sharing-a-draft": {
    slug: "add-a-watermark-before-sharing-a-draft",
    h1: "How to add a DRAFT or CONFIDENTIAL watermark to a PDF",
    sub: "Stamp a clear status or ownership mark across every page before you share a working document.",
    audience: "Legal, business, and design teams sharing drafts or confidential files for review",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "image-watermark",
        title: "Add the watermark across every page",
        detail:
          "Open Watermark and place your text (DRAFT, CONFIDENTIAL, your company name) or a logo. Set the opacity and angle so it's clearly visible but doesn't block reading.",
      },
      {
        tool: "stamp-pdf",
        title: "Or stamp a specific mark or page",
        detail:
          "If you only need a mark on the cover or a specific stamp rather than a full-page wash, use Stamp to place it precisely.",
      },
      {
        tool: "flatten-pdf",
        title: "Flatten so the mark can't be removed",
        detail:
          "Flatten the file so the watermark is baked into the page and a recipient can't simply toggle off a layer.",
      },
    ],
    whyItMatters:
      "When you share a draft or a confidential file for review, an unmarked PDF can get forwarded, mistaken for final, or leaked with no trace of where it came from. A DRAFT or CONFIDENTIAL watermark sets expectations at a glance and signals ownership; flattening makes the mark durable so it survives forwarding. The sweet spot is a light, diagonal wash — clearly visible without obscuring the text reviewers need to read. Watermark, Stamp, and Flatten all run in your browser, so the document stays private while you mark it. One honest limit: a watermark labels and deters, but it isn't encryption — it doesn't control who can open the file.",
    pitfalls: [
      {
        title: "Opacity so high it blocks the text",
        detail:
          "A heavy watermark makes the document hard to read and annoys reviewers. Aim for a light, diagonal wash that's visible but doesn't obscure content.",
      },
      {
        title: "Skipping the flatten step",
        detail:
          "A watermark added as a layer or annotation can be removed by the recipient. Flatten so it becomes part of the page.",
      },
      {
        title: "Treating a watermark as security",
        detail:
          "A watermark deters and labels; it doesn't encrypt. For real access control, that's a separate measure.",
      },
    ],
    tips: [
      {
        title: "Diagonal, centred, around 30% opacity",
        detail:
          "That's the readable-but-unmistakable sweet spot for a full-page DRAFT or CONFIDENTIAL wash.",
      },
      {
        title: "Match the mark to the stage",
        detail:
          "DRAFT for work-in-progress, CONFIDENTIAL for restricted distribution, your name or logo for ownership — pick the one that sets the right expectation.",
      },
    ],
    faq: [
      {
        q: "Can the recipient remove the watermark?",
        a: "Not if you flatten the file — the mark becomes part of the page. An un-flattened layer or annotation, by contrast, can be toggled off.",
      },
      {
        q: "Is my document uploaded?",
        a: "No. Watermark, Stamp, and Flatten run in your browser, so a confidential draft never leaves your device.",
      },
      {
        q: "Can I use a logo instead of text?",
        a: "Yes — the Watermark tool accepts an image, so you can wash your logo across the pages.",
      },
      {
        q: "Does a watermark stop copying?",
        a: "It labels and deters, but it isn't encryption or access control. Use it to set expectations, not to lock a file.",
      },
    ],
    related: ["redact-pdf-before-sharing", "redline-contract-revisions", "remove-metadata-before-publishing"],
  },

  // ============================================================
  // 21. Rotate and straighten a scanned PDF
  // ============================================================
  "rotate-and-straighten-a-scanned-pdf": {
    slug: "rotate-and-straighten-a-scanned-pdf",
    h1: "How to rotate and straighten a scanned PDF",
    sub: "Fix sideways or upside-down scans and trim the messy edges — in your browser, nothing uploaded.",
    audience: "Anyone with sideways, upside-down, or untidy scans from a scanner or phone",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "rotate",
        title: "Rotate pages to the right orientation",
        detail:
          "Open Rotate, turn pages 90°, 180°, or 270° until they read upright. You can rotate every page at once or just the few that came in sideways.",
      },
      {
        tool: "crop-pdf",
        title: "Crop away the scanner margins",
        detail:
          "Scans often carry a black border or a strip of the platen. Crop trims each page to the document edge so the result looks clean on screen and in print.",
      },
      {
        tool: "compress-pdf",
        title: "Compress the cleaned-up file (optional)",
        detail:
          "Image-heavy scans are large. Run Compress to get the tidied PDF under a mailbox or upload-portal limit without a visible quality drop.",
      },
    ],
    whyItMatters:
      "A scan that opens sideways is the small annoyance that makes a document look unprofessional and forces every reader to crane their neck or rotate it in their own viewer. Fixing it once, at the source, saves everyone that friction. Rotate corrects 90° orientation problems (the common case when a page goes through the feeder the wrong way), and Crop removes the dark scanner border so the page is just the document. Note the honest limit: Rotate works in 90° steps — it squares up a sideways page, but it doesn't deskew a page scanned at a slight 2° tilt; for that you'd re-scan straight. Because Rotate, Crop, and Compress all run in your browser, sensitive scans — IDs, contracts, statements — never leave your device.",
    pitfalls: [
      {
        title: "Rotating the whole file when only some pages are wrong",
        detail:
          "Mixed-orientation scans are common. Rotate the specific pages that are sideways rather than spinning every page, or you'll just move the problem around.",
      },
      {
        title: "Expecting Rotate to fix a slight tilt",
        detail:
          "Rotate turns in 90° steps. A page scanned at a small angle needs re-scanning straight — there's no pixel-level deskew here.",
      },
    ],
    tips: [
      {
        title: "Crop after rotating, not before",
        detail:
          "Rotate first so the page is upright, then crop — otherwise the crop box is oriented to the wrong edges.",
      },
      {
        title: "Keep the original until you're happy",
        detail:
          "Rotate and crop write a new file; keep the source scan until you've confirmed the cleaned-up version reads correctly end to end.",
      },
    ],
    faq: [
      {
        q: "Does rotating reduce quality?",
        a: "No. Rotation re-orients the existing page content without re-encoding it, so the pages are identical to the source, just turned.",
      },
      {
        q: "Can it auto-straighten a tilted scan?",
        a: "No — Rotate works in 90° steps to fix orientation. A few-degree skew from a crooked feed needs a fresh, straight scan.",
      },
      {
        q: "Is my scan uploaded?",
        a: "No. Rotate, Crop, and Compress run in your browser, so the file never leaves your device — which matters for IDs, contracts, and statements.",
      },
      {
        q: "Can I rotate just one page?",
        a: "Yes. Pick the specific pages to turn; you don't have to rotate the whole document.",
      },
    ],
    related: ["ocr-old-archive", "split-pdf-into-separate-documents", "combine-receipts-for-expense-report"],
  },

  // ============================================================
  // 22. Make a PDF grayscale for cheaper printing
  // ============================================================
  "make-a-pdf-grayscale-for-printing": {
    slug: "make-a-pdf-grayscale-for-printing",
    h1: "How to convert a PDF to grayscale for cheaper printing",
    sub: "Strip the colour so a print run uses black toner instead of expensive colour ink.",
    audience: "Anyone printing in volume — offices, students, print shops — who wants to cut ink cost",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "grayscale-pdf",
        title: "Convert the PDF to grayscale",
        detail:
          "Open Grayscale and drop in the file. Every page is converted to shades of grey, so the printer pulls from the black cartridge rather than the colour ones.",
      },
      {
        tool: "n-up-pdf",
        title: "Fit more per page to save paper (optional)",
        detail:
          "If it's a reference doc or slides, run N-up to place 2 or 4 pages per sheet — fewer sheets on top of cheaper ink.",
      },
      {
        tool: "compress-pdf",
        title: "Compress before sending to the printer",
        detail:
          "Grayscale plus Compress makes a light file that spools fast at a shared or shop printer and emails cleanly to whoever's doing the printing.",
      },
    ],
    whyItMatters:
      "Colour pages cost several times more to print than black-and-white, and most documents — reports, drafts, reference material — don't need colour to be useful. Converting to grayscale up front guarantees the printer uses only black toner, instead of relying on a printer driver's \"print in greyscale\" checkbox that colleagues forget to tick. It also makes the file render predictably: a chart that used colour to distinguish series will now use shades of grey, so it's worth a glance to confirm it's still readable. Pair it with N-up to cut paper too, and Compress so the file moves fast to a shared printer. Everything runs in your browser, so the document stays on your device.",
    pitfalls: [
      {
        title: "Grayscale can flatten colour-coded charts",
        detail:
          "If a figure relies on colour alone to tell series apart, greys may look similar. Check colour-coded charts after converting, and prefer ones with labels or patterns.",
      },
      {
        title: "Relying on the printer driver instead",
        detail:
          "The driver's \"greyscale\" toggle is per-print and easy to forget. Converting the file itself makes black-and-white the default for everyone who prints it.",
      },
    ],
    tips: [
      {
        title: "Grayscale, then N-up, then Compress",
        detail:
          "That order gives you the cheapest print: black toner, fewer sheets, and a small file that spools quickly.",
      },
      {
        title: "Keep a colour master",
        detail:
          "Convert a copy for printing and keep the colour original for on-screen sharing, where colour still helps.",
      },
    ],
    faq: [
      {
        q: "Does grayscale shrink the file?",
        a: "Often a little, since colour data is dropped — but run Compress as well if you need a meaningfully smaller file.",
      },
      {
        q: "Will the text get worse?",
        a: "No. Text stays crisp; only colour is removed. Photos and colour charts become grey-toned.",
      },
      {
        q: "Is the file uploaded?",
        a: "No. Grayscale, N-up, and Compress all run in your browser, so the document never leaves your device.",
      },
      {
        q: "Can I undo it?",
        a: "Grayscale writes a new file; your original keeps its colour. Keep the original and you can always go back.",
      },
    ],
    related: ["convert-deck-to-handout", "compress-pdf-for-email", "remove-metadata-before-publishing"],
  },

  // ============================================================
  // 23. Make a PDF accessible for screen readers
  // ============================================================
  "make-a-pdf-accessible-for-screen-readers": {
    slug: "make-a-pdf-accessible-for-screen-readers",
    h1: "How to make a PDF accessible for screen readers",
    sub: "Check tagging, reading order, and language so the document works for assistive tech — and for compliance.",
    audience: "Teams meeting ADA / Section 508 / WCAG / EN 301 549, and anyone publishing a public PDF",
    totalTime: "10 minutes",
    steps: [
      {
        tool: "pdf-accessibility",
        title: "Run the accessibility check",
        detail:
          "Open the Accessibility Checker to see where the PDF falls short — missing tags, no document language, image alt-text gaps, and uncertain reading order are the usual culprits.",
      },
      {
        tool: "pdf-a-convert",
        title: "Convert to PDF/A for a stable, structured base",
        detail:
          "PDF/A embeds fonts and locks the structure, which gives assistive tech a predictable, self-contained document to read and keeps it rendering the same over time.",
      },
      {
        tool: "compress-pdf",
        title: "Keep the file light (optional)",
        detail:
          "Accessible PDFs are still shared by email and portals. Compress trims size without touching the text layer assistive tech depends on.",
      },
    ],
    whyItMatters:
      "An inaccessible PDF is invisible to someone using a screen reader — and increasingly a legal exposure, with ADA, Section 508, WCAG, and the EU's EN 301 549 all pointing at public documents. Accessibility comes down to a few things: the document has tags that convey structure (headings, lists, tables), a defined reading order, a language set so the reader pronounces words correctly, and alt-text on meaningful images. The checker surfaces which of these are missing so you can fix the document at the source rather than guess. One honest caveat: a scanned PDF is just an image — there's no text for a screen reader to read at all until it's been OCR'd, so make scans searchable first. Everything here runs in your browser, so the document stays on your device.",
    pitfalls: [
      {
        title: "Trying to make a scan accessible without OCR",
        detail:
          "A scanned page is an image. Until it's OCR'd (made searchable), a screen reader has nothing to read. OCR first, then check accessibility.",
      },
      {
        title: "Treating a passing check as full compliance",
        detail:
          "Automated checks catch the mechanical gaps (tags, language, alt-text presence) but can't judge whether alt-text is meaningful or the reading order makes sense. A human pass is still needed for real compliance.",
      },
    ],
    tips: [
      {
        title: "Set the document language",
        detail:
          "A missing language is one of the most common and most impactful gaps — it's what tells the screen reader how to pronounce the text.",
      },
      {
        title: "Write alt-text that conveys meaning",
        detail:
          "\"Chart\" helps no one; \"Bar chart: Q3 revenue up 12%\" does. Describe what the image communicates, not just that it exists.",
      },
    ],
    faq: [
      {
        q: "What makes a PDF accessible?",
        a: "Tags that convey structure, a logical reading order, a set document language, and meaningful alt-text on images — so assistive tech can navigate and announce the content.",
      },
      {
        q: "Does this guarantee Section 508 / WCAG compliance?",
        a: "It gets you the mechanical essentials and flags the gaps, but real compliance needs a human to confirm alt-text is meaningful and the reading order is correct.",
      },
      {
        q: "My PDF is a scan — will the checker help?",
        a: "Make it searchable with OCR first. A raw scan is an image with no text for a screen reader; OCR adds the text layer the checker (and the reader) needs.",
      },
      {
        q: "Is the document uploaded?",
        a: "No. The accessibility check and PDF/A conversion run in your browser, so the file stays on your device.",
      },
    ],
    related: ["remove-metadata-before-publishing", "prepare-exhibits-for-court-filing", "convert-deck-to-handout"],
  },

  // ============================================================
  // 24. Convert Markdown notes to a clean PDF
  // ============================================================
  "convert-markdown-notes-to-pdf": {
    slug: "convert-markdown-notes-to-pdf",
    h1: "How to convert Markdown notes into a clean PDF",
    sub: "Turn .md files into a formatted, page-numbered PDF you can share or print.",
    audience: "Developers, technical writers, and students who keep notes and docs in Markdown",
    totalTime: "3 minutes",
    steps: [
      {
        tool: "markdown-to-pdf",
        title: "Render the Markdown to PDF",
        detail:
          "Open Markdown to PDF and drop in your .md. Headings, lists, code blocks, tables, and links render as a clean, formatted document.",
      },
      {
        tool: "merge",
        title: "Combine multiple note files (optional)",
        detail:
          "If your notes span several .md files — one per topic or chapter — convert each and Merge them into one document in the order you want.",
      },
      {
        tool: "page-numbers",
        title: "Add page numbers",
        detail:
          "Run Page Numbers so the finished PDF is easy to reference and reads like a proper handout rather than a raw export.",
      },
    ],
    whyItMatters:
      "Markdown is perfect for writing — plain text, version-controllable, fast — but it's not what you hand to a reviewer, a professor, or a teammate who just wants to read it. Rendering it to PDF gives you the best of both: you keep authoring in Markdown, and you produce a formatted, portable document on demand, with headings, code blocks, and tables laid out properly. Combine several note files into one and add page numbers, and a folder of scattered .md files becomes a single shareable doc. Because the conversion runs in your browser, notes that might contain unreleased or internal content never leave your device. Keep the .md as your source of truth and regenerate the PDF whenever the notes change.",
    pitfalls: [
      {
        title: "Expecting exotic Markdown extensions to render",
        detail:
          "Standard Markdown — headings, lists, code, tables, links, images — renders cleanly. Highly tool-specific extensions (some diagram or admonition syntaxes) may not; check the output if you rely on them.",
      },
      {
        title: "Merging before fixing the order",
        detail:
          "Convert each note, then arrange the files in reading order before merging — otherwise chapter 3 can land before chapter 1.",
      },
    ],
    tips: [
      {
        title: "Keep the .md as the source",
        detail:
          "Author in Markdown and treat the PDF as a build output — regenerate it when notes change rather than editing the PDF directly.",
      },
      {
        title: "One file per section, then merge",
        detail:
          "Splitting long notes into per-section .md files keeps them easy to edit; Merge stitches them into one clean PDF at the end.",
      },
    ],
    faq: [
      {
        q: "What Markdown features are supported?",
        a: "The common ones — headings, bold/italic, lists, code blocks, tables, links, and images. Very tool-specific extensions may not render, so check the output if you depend on them.",
      },
      {
        q: "Can I convert several files at once?",
        a: "Convert each .md to PDF, then use Merge to combine them in order into a single document.",
      },
      {
        q: "Are my notes uploaded?",
        a: "No. Markdown to PDF, Merge, and Page Numbers run in your browser, so internal or unreleased notes never leave your device.",
      },
      {
        q: "Will my code blocks keep their formatting?",
        a: "Yes — fenced code blocks render in a monospace block so snippets stay readable in the PDF.",
      },
    ],
    related: ["convert-research-papers-to-study-notes", "thesis-combine-and-format", "summarize-a-long-report-with-ai"],
  },
};

export const USE_CASE_SLUGS = Object.keys(USE_CASES) as UseCaseSlug[];
