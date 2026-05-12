// SEO Ship #1 (2026-04-25): longform editorial bodies for the top 20
// head-term landing pages. Each body is ~1,000–1,500 words of useful,
// non-filler content covering how the tool works, when to use it,
// common mistakes, tips, and limits.
//
// Why a separate file: keeping this data out of seo-pages.ts keeps the
// canonical SEO_PAGES record readable. The component reads the merged
// shape transparently — call sites don't need to know about this file.
//
// Style notes:
//  - First-person plural ("we") only when describing what pdfcraft ai
//    does. Otherwise neutral, second-person.
//  - No marketing fluff. Each section earns its weight by either
//    teaching the reader something or warning them about a pitfall.
//  - Bullet lists prefer (b: bold lead) + (t: explanatory body) so the
//    eye can scan the page in 5 seconds.

import type { SeoLongform, SeoPageSlug } from "./seo-pages";

export const LONGFORM_BODIES: Partial<Record<SeoPageSlug, SeoLongform>> = {
  // ============================================================
  // 1. merge-pdf — head term, millions of monthly searches
  // ============================================================
  "merge-pdf": {
    title: "How to merge PDF files cleanly, in any order, with zero quality loss",
    intro:
      "Merging PDFs sounds trivial — line them up, glue them together — but the difference between a good merge and a broken one shows up in the details: page order, internal bookmarks, hyperlinks, embedded fonts, and whether the resulting file opens cleanly in Acrobat, Preview, and the browser. Here is what the merge step is actually doing under the hood, when to reach for it, and how to avoid the four mistakes that make people redo the job.",
    sections: [
      {
        h: "What a PDF merge actually does",
        p: [
          "When you merge PDFs we parse each input, copy its page tree (the ordered list of pages plus their associated content streams) into a new document, and then rebuild the cross-reference table so every page object points to the right place. Fonts, images, vector graphics, and form fields are copied by reference where the same resource appears in multiple inputs, which keeps the output file from ballooning. The merged document keeps every original page's exact dimensions — A4 pages stay A4, Letter pages stay Letter, and a landscape report stays landscape. You don't lose any quality because nothing is re-rasterized; the page contents are transplanted byte-for-byte.",
          "Bookmarks (the side-panel outline you see in Acrobat) and named destinations are reconciled so anchors that pointed inside an input file now point to the corresponding pages in the merged file. Hyperlinks that pointed to web URLs survive untouched. Hyperlinks that pointed inside a single source PDF are rewritten to land on the right page in the merged output. Form fields are renamed when there are duplicate field names across inputs, so two forms with the same field 'name' don't collide and overwrite each other.",
        ],
      },
      {
        h: "When merging is the right tool",
        p: [
          "Merging is the right step whenever you need a single deliverable assembled from pieces that were created independently. Some specific cases where it shines:",
        ],
        list: {
          items: [
            { b: "Submission packages.", t: "Combine your application form, supporting docs, IDs, and proof of address into one PDF the portal accepts in a single upload." },
            { b: "Closing books and contract bundles.", t: "Stitch the executed agreement, exhibits, schedules, and signature pages into one navigable document. Counterparties prefer one file with bookmarks over an email with twelve attachments." },
            { b: "Course readers and study packs.", t: "Pull together scanned chapters, lecture notes, and reading-list PDFs into a single book your students can search end-to-end." },
            { b: "Audit and tax workpapers.", t: "Combine the trial balance, supporting schedules, and bank statements behind each line item so the reviewer can scroll through one continuous file." },
            { b: "Photo albums and portfolios.", t: "Take a stack of image-only PDFs from your phone, your camera, and your scanner, and merge them into a single tidy album." },
          ],
        },
      },
      {
        h: "Five mistakes that wreck a merge",
        p: [
          "These are the most common reasons a merged PDF comes out broken or larger than it should be — and how to avoid each one.",
        ],
        list: {
          items: [
            { b: "Merging without checking page order first.", t: "Browser file pickers don't always sort by name the way you expect. Drop your files in, then drag the thumbnails to confirm the order before clicking Merge." },
            { b: "Forgetting that one input is password-protected.", t: "If a single source PDF still has a password, the merge silently skips its content. Unlock that file first (or chain the unlock + merge as a macro)." },
            { b: "Merging signed PDFs after they're signed.", t: "Cryptographic signatures are bound to the exact byte layout of the file they signed. Merging a signed PDF into another file invalidates that signature. Sign the final merged document instead, not the parts." },
            { b: "Re-merging compressed scans without OCR.", t: "If your scanned pages have no text layer, the merged output won't be searchable either. Run OCR before merging — once they're combined the scan boundaries get harder to detect." },
            { b: "Trusting that 'flatten' is automatic.", t: "Form fields and annotations from each input survive the merge as live, editable elements. If you want the merged file to behave like a flat document, use the Flatten tool after merging." },
          ],
        },
      },
      {
        h: "Tips for the cleanest possible output",
        p: [
          "If you care about the merged file looking professional rather than just functional, these small habits compound into a noticeably better result:",
        ],
        list: {
          items: [
            { b: "Standardize page size before merging.", t: "If your inputs mix A4, Letter, and Legal, the merged file will scroll inconsistently. Use Resize Pages to align everything on one size first — or set the Resize option in the merge dialog." },
            { b: "Add a cover page and table of contents.", t: "A 1-page cover with the title, date, and your name plus an auto-generated TOC turns a stack of files into a deliverable. Both add seconds, not minutes." },
            { b: "Compress after, not before.", t: "Compressing each input before merging is wasted work — the merge keeps the originals' compression. Compress the final merged file once, on Balanced mode, for the smallest size with no visible quality loss." },
            { b: "Bookmark each section.", t: "After merging, add a top-level bookmark for each major section so the reader can jump around. The Page Numbers & Watermark tool can also auto-generate per-section bookmarks from heading text." },
            { b: "Run a final visual scroll-through.", t: "Open the merged file and scroll past every section break. It takes 30 seconds and catches the one thing automation never will — a page that printed sideways three months ago." },
          ],
        },
      },
      {
        h: "Limits, formats, and compatibility",
        p: [
          "On the free web tool you can merge up to 50 PDF files at once with each input up to 100 MB. That covers virtually every personal use case. If you're merging hundreds of files at a time — for example a nightly bank-statement assembly — the API's batch endpoint streams them through with no per-job cap and exposes per-page hooks for renaming, watermarking, or routing.",
          "The output is a fully PDF/A-1b-compatible file by default, which means it opens cleanly in Adobe Acrobat (every version since 7), Preview on macOS, browser PDF viewers, Foxit, Nitro, every printer that takes PDF, and every cloud platform that accepts PDF uploads. If you specifically need PDF/A archival output (for regulatory submission), turn on the PDF/A toggle in the Options panel before clicking Merge.",
        ],
      },
    ],
  },

  // ============================================================
  // compress-pdf longform REMOVED 2026-05-04 (T1-1 from
  // docs/TOOL_IMPROVEMENT_PLAN.md). The tool was never built
  // (pdf-lib limitation, intentional). Restore alongside
  // SEO_PAGES["compress-pdf"] entry once Plan T2-1 ships the
  // real Compress tool.
  // ============================================================

  // ============================================================
  // pdf-to-word
  // ============================================================
  "pdf-to-word": {
    title: "How to convert a PDF to Word so the layout actually survives",
    intro:
      "PDF-to-Word is one of the most-searched PDF operations and one of the most over-promised. The problem is that PDF is a layout format — pages, exact coordinates, embedded fonts — while Word is a flow format — paragraphs, styles, automatically reflowing tables. Converting between them is structural translation, not a 1:1 copy. Here is how the conversion actually works, when it produces editable output you can use, and what you can do when it doesn't.",
    sections: [
      {
        h: "How the conversion actually works",
        p: [
          "First we detect whether the PDF has a real text layer. If it does — the PDF was exported from Word, Google Docs, InDesign, or any digital source — we read the text directly along with its font, position, and run information. If the PDF is a scan with no text, we run OCR to extract the text first, then proceed.",
          "Next, we group runs into paragraphs by analyzing line spacing and indentation, detect headings by font-size jumps, identify tables by aligned columns, and map images to their bounding boxes. The result is converted into a Word document with real styles, real tables, and real images — not a sequence of text frames pinned to absolute coordinates. That's what makes the output actually editable instead of looking editable.",
        ],
      },
      {
        h: "When the conversion is going to give you clean output",
        p: [
          "Conversion quality depends almost entirely on how the source PDF was produced. Some patterns predict success:",
        ],
        list: {
          items: [
            { b: "PDFs exported from Word or Google Docs.", t: "Round-trip near-perfect. Fonts, tables, and headings come through with high fidelity." },
            { b: "PDFs from InDesign or modern publishing tools.", t: "Single-column layouts convert cleanly. Multi-column magazine layouts are reflowed; the order may need a quick check." },
            { b: "Reports from BI tools (Tableau, Power BI).", t: "Tables convert as tables. Charts convert as embedded images — you'll need to recreate the underlying chart in Word if you want it editable." },
            { b: "High-quality scans (300 DPI or above).", t: "OCR plus structure detection reaches 95%+ accuracy. Acceptable for most real work after a quick proofread." },
            { b: "Low-quality scans (under 200 DPI, or photographs).", t: "OCR accuracy drops fast. Fix the source — rescan at 300 DPI on a flat surface — before converting." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "The most-reported issues with PDF-to-Word conversions almost always trace back to one of these:",
        ],
        list: {
          items: [
            { b: "Trying to convert a fillable form.", t: "Forms have field structures Word doesn't understand the same way. Use the dedicated Form Data extractor instead, then build the Word version manually." },
            { b: "Expecting tables of equations to come through.", t: "Equations rendered as PDF glyphs lose their MathML structure. Latex-source documents always round-trip better than the PDF." },
            { b: "Converting then editing in Pages.", t: "Pages doesn't always render Word's table formatting the same way. If you'll edit in Pages, ask for .pages directly via the AI converter." },
            { b: "Skipping the OCR confidence check.", t: "We mark low-confidence words in the converted file. If you ignore the highlights, you'll miss '0' vs 'O' and 'l' vs '1' substitutions." },
            { b: "Compressing the PDF before converting.", t: "Strong compression downsamples images and softens text edges, both of which hurt OCR. Convert from the original whenever possible." },
          ],
        },
      },
      {
        h: "Tips for the cleanest output",
        p: [
          "Small adjustments before and after conversion turn an 80% result into a 99% result:",
        ],
        list: {
          items: [
            { b: "Use the original PDF, not a printed-and-rescanned copy.", t: "If you have access to the source PDF, use it. Print-to-paper-to-scan loses every digital structure that makes conversion good." },
            { b: "Pick the format that matches the content.", t: "Word for narrative documents. Excel for table-heavy spreadsheets. PowerPoint for slide-formatted PDFs. We convert to all three; mix and match per page." },
            { b: "Run table extraction separately.", t: "The dedicated AI Table Extract tool produces cleaner CSV/XLSX than the converted Word document's tables. If your PDF is mostly tables, use both tools — Word for narrative, Table Extract for the data." },
            { b: "Spell-check immediately after conversion.", t: "It catches OCR substitution errors faster than any manual proofread." },
            { b: "Save as .docx, then 'Save As' to your final format.", t: "The intermediate .docx is the cleanest representation. Re-saving from there into .doc, .odt, or .pdf is lossless from Word's side." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tier: up to 100 pages per file, OCR up to 20 pages free with overage at 2 credits/page. The output is a real .docx file that opens in Microsoft Word (any version since 2007), Google Docs, LibreOffice, Apple Pages, and every cloud word processor. Tables come through with their column structure intact; images come through embedded; bookmarks become Word headings; hyperlinks survive untouched.",
        ],
      },
    ],
  },

  // ============================================================
  // 5. translate-pdf
  // ============================================================
  "translate-pdf": {
    title: "How to translate a PDF without breaking its layout",
    intro:
      "Translating a PDF means doing two things at once: rendering the text in another language, and rebuilding a document that still looks like a document. Most online PDF translators get the first part right and the second part wrong — they hand you back a wall of plain text. Here is how a layout-preserving translation actually works, what to watch out for in legal and academic documents, and which language pairs need extra care.",
    sections: [
      {
        h: "How layout-preserving translation works",
        p: [
          "We extract the text along with its layout coordinates and font metrics, group it into translation-coherent units (a paragraph, a table cell, a heading), translate each unit while keeping the document's structural context intact, and then re-typeset the translated text into the original layout boxes. When the translation is longer than the source — common in English-to-German or any-to-Spanish — we adjust line spacing or scale font size by 2–3% so the text still fits its box without breaking out.",
          "Embedded images, vector charts, and diagrams are left untouched. If they contain text inside the image, that text is OCR'd, translated, and overlaid back onto the image with as close a font match as we can manage. Fonts that don't support the target language's script — for example a Latin-only font on a Russian translation — are substituted with a Cyrillic-capable equivalent.",
        ],
      },
      {
        h: "When this tool is the right choice",
        p: [
          "Layout-preserving translation matters in three specific situations:",
        ],
        list: {
          items: [
            { b: "Legal documents and contracts.", t: "Page references, exhibit numbers, and signature blocks need to land on the same physical pages as the source for cross-referencing. Plain-text translation breaks all that." },
            { b: "Academic papers and theses.", t: "Figure callouts, equation labels, and citation numbers depend on layout. Translated layout-preserved papers can be filed alongside the originals without re-numbering." },
            { b: "Onboarding and HR handbooks.", t: "Side-by-side English/local-language handbooks are often a regulatory requirement. Layout-matched translation makes them comparable page-by-page." },
            { b: "Technical manuals.", t: "Diagrams with callouts must keep their callouts in the same positions. We re-overlay translated callouts on the original diagrams." },
            { b: "Instruction sheets and product packaging.", t: "Exact print-area constraints mean text must fit specific boxes. We auto-fit; plain-text translators don't." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "These are the patterns that produce a translation you can't actually use:",
        ],
        list: {
          items: [
            { b: "Translating before OCR on scanned PDFs.", t: "If the source has no text layer, the translator has nothing to work with. OCR first, then translate — or use the combined option that does both in sequence." },
            { b: "Translating into a language with the wrong script.", t: "Going to Arabic or Hebrew flips the reading direction. Tables and bulleted lists need to be mirrored, which we do automatically — but check the result." },
            { b: "Translating jurisdiction-specific legal terms.", t: "'Consideration' in a contract has no Spanish equivalent because the concept doesn't exist in civil law. Have a bilingual lawyer review legal translations even when the layout is perfect." },
            { b: "Mixing source languages.", t: "If the document mixes English with quoted German, we autodetect at paragraph level. Quoted technical terms that should stay in English need to be flagged in the Options panel as 'do not translate'." },
            { b: "Trusting the translation for high-stakes documents.", t: "Machine translation is excellent for understanding and for first drafts. It is not a substitute for a sworn translator on documents that need certification." },
          ],
        },
      },
      {
        h: "Tips for a clean translation",
        p: [
          "Get a noticeably better result with these adjustments:",
        ],
        list: {
          items: [
            { b: "Choose the right tone in the Options panel.", t: "Formal vs. neutral vs. conversational changes how 'you' is translated and how nouns are gendered in romance languages. Match the tone of your source." },
            { b: "Provide a glossary for repeated terms.", t: "Brand names, product codes, and proper nouns can be locked so they aren't translated. Upload a CSV with source/target pairs." },
            { b: "Translate one direction at a time for parallel docs.", t: "If you need both English and Japanese versions, start from the same canonical source and translate to each. Don't translate Japanese-from-English back to English to check — round-trip degrades quality." },
            { b: "Spot-check the layout on the first three pages.", t: "If the first three are clean, the rest will be too. Most layout issues are caught early." },
            { b: "Bundle as a multilingual handbook macro.", t: "If you need 8 languages, run the Multilingual Handbook macro once instead of 8 separate translations — same source, parallel outputs, consistent terminology." },
          ],
        },
      },
      {
        h: "Limits and supported languages",
        p: [
          "We support 90+ languages including Spanish, French, German, Italian, Portuguese (Brazil and Portugal), Dutch, Swedish, Polish, Russian, Ukrainian, Greek, Turkish, Arabic (MSA), Hebrew, Hindi, Bengali, Tamil, Vietnamese, Thai, Indonesian, Malay, Japanese, Korean, Simplified and Traditional Chinese, and many more. The free preview translates the first 5 pages so you can sanity-check quality before paying. Pricing is 1 credit per page per target language; a 20-page doc into 3 languages is 60 credits.",
        ],
      },
    ],
  },

  "split-pdf": {
    title: "How to split a PDF the right way — by page, by range, by size, or by bookmark",
    intro:
      "Splitting a PDF is one of those operations that looks like a single feature but is actually four. Splitting page-by-page is different from splitting by custom ranges, which is different from splitting by file size, which is different from splitting at every section bookmark. Each makes sense for a different job. Here is how to pick the right mode and avoid the small things that ruin the output.",
    sections: [
      {
        h: "What happens when a PDF is split",
        p: [
          "A split walks the input's page tree, copies the chosen pages into a new document along with the resources those pages reference (fonts, images, color profiles, embedded objects), and writes a fresh cross-reference table. Like merging, the operation is byte-level — pages are not re-rendered, so the output looks identical to the matching pages in the source. Form fields, annotations, and bookmarks that fall inside the chosen page range carry over; ones that pointed elsewhere are dropped (because they have nowhere to land).",
          "When you split into multiple output files at once we package them into a zip with predictable filenames — by default 'original-name-1.pdf' through 'original-name-N.pdf', or you can choose a pattern that includes the page range or a section title pulled from the document's bookmarks.",
        ],
      },
      {
        h: "Which split mode to use",
        p: [
          "Pick the mode that matches your end state, not the most flexible one. Each mode has a job it does well and a job it does badly:",
        ],
        list: {
          items: [
            { b: "Each page as a separate file.", t: "Use when downstream systems expect single-page documents — for example invoice processing, OCR pipelines that batch by page, or signature workflows that route page-by-page." },
            { b: "Custom ranges (1-3, 5, 7-9).", t: "Use when extracting a known section from a known location — a chapter, an appendix, a specific exhibit. Best mode when you know exactly which pages you want." },
            { b: "Every Nth page.", t: "Use for booklet imposition (every 4th page = every cover quarter) or to sample a large document." },
            { b: "By file size.", t: "Use when the destination has a per-file cap — email gateways at 25 MB, court e-filing portals at 35 MB, regulatory submissions at 100 MB. We iterate to land just under your target." },
            { b: "By bookmark / heading.", t: "Use to break a long document into one file per chapter or section automatically. Requires the source PDF to have a bookmark structure — most exported reports do." },
          ],
        },
      },
      {
        h: "Common mistakes when splitting",
        p: [
          "These are the patterns that cause people to redo a split or end up with files they can't actually use:",
        ],
        list: {
          items: [
            { b: "Splitting before OCR.", t: "If the original is scanned, OCR the whole document first. Splitting destroys the cross-page text continuity that improves OCR accuracy on hyphenated words and headers/footers." },
            { b: "Using ranges that overlap accidentally.", t: "1-5, 4-10, 9-15 will produce three files with duplicated pages. Our parser flags overlaps before running — read the warning." },
            { b: "Forgetting that pages start at 1, not 0.", t: "Every PDF tool worth using uses 1-based page numbers because that's what humans see. If your script-based tool returns pages 0-4 for 'the first five', you'll be off-by-one until you adjust." },
            { b: "Splitting password-protected PDFs without the password.", t: "We can read most encrypted PDFs without a password if the only restriction is 'no extracting' (which we honor only when print restriction is also set). When the file is genuinely password-locked, you'll get an error — unlock it first." },
            { b: "Trusting bookmark splits on documents with no bookmarks.", t: "Many scanned and exported PDFs have no real outline. We fall back to a regex on heading text, which is best-effort. For surgical splits, define ranges manually." },
          ],
        },
      },
      {
        h: "Tips for clean output",
        p: [
          "Small choices in the split dialog change the quality of the result more than people expect:",
        ],
        list: {
          items: [
            { b: "Use a smart filename pattern.", t: "{name}-pages-{from}-{to}.pdf is more useful than {name}-1.pdf when the recipient has to find a specific section months later." },
            { b: "Ask for bookmarks-preserved.", t: "On range splits, the option 'preserve outline pointing inside the range' keeps cross-references that land in the output and drops the ones that don't. Default behavior is correct for most cases." },
            { b: "If outputs will be re-merged, keep page sizes.", t: "Don't normalize sizes during a split if the next step is re-merging — you'll do the work twice. Normalize at merge time instead." },
            { b: "Set a target output size on email-bound splits.", t: "If you're splitting because a 60 MB PDF won't fit in email, splitting in half by page count rarely lands at 25 MB each. Use 'split by size, target 24 MB' so you actually solve the problem." },
            { b: "Verify by opening the first and last output.", t: "30 seconds to confirm the boundaries are where you expected them. Splits are cheap to redo." },
          ],
        },
      },
      {
        h: "Limits, formats, and compatibility",
        p: [
          "Free web tool: input up to 100 MB, output up to 200 files per split. The API and Pro plan have no upper bound; we've split single 12,000-page PDFs cleanly via the batch endpoint. Outputs are PDF/A-1b compatible (or PDF/A-2 if you ask for it), open cleanly in Acrobat, Preview, and every major reader, and preserve digital signatures within their original page range — though signed pages should generally not be split out of context, since the signature's page-bound assertions become harder to verify.",
        ],
      },
    ],
  },

  // ============================================================
  // 6. word-to-pdf
  // ============================================================
  "word-to-pdf": {
    title: "How to convert Word to PDF and keep your formatting intact",
    intro:
      "Converting a Word document to PDF should be the easiest operation on this site, and most of the time it is. The corner cases — embedded fonts that aren't on every machine, tracked changes that shouldn't ship, comments that need to come along, headers that count themselves — are where bad conversions get made. Here is what to look for and how to get a PDF that looks identical to your Word original on every device.",
    sections: [
      {
        h: "What the converter does",
        p: [
          "We render the .docx (or legacy .doc) the way Word would render it for printing — laying out paragraphs against your page-size and margin settings, embedding any fonts the document references, paginating tables, applying section breaks — and write the result as a PDF. Embedded images and SmartArt come through as PDF objects, headers and footers map to their PDF equivalents, and tracked changes can be either accepted, rejected, or shown depending on what you need.",
          "Hyperlinks remain clickable in the output. Bookmarks become PDF outline entries. Comments can be exported as PDF annotations or stripped — both are options in the export dialog.",
        ],
      },
      {
        h: "When to convert (and when to do something else)",
        p: [
          "PDF is the right output when the file leaves your control: client deliverables, contracts going out for signature, archived records, anything that needs to look identical on every machine. It's the wrong output when the recipient will edit it — keep .docx for that. Specific situations where conversion to PDF is the right call:",
        ],
        list: {
          items: [
            { b: "Final-version client deliverables.", t: "PDF locks the layout. Word might re-flow on the recipient's machine if they don't have your fonts." },
            { b: "Job applications.", t: "Most ATS systems prefer PDF résumés because they preserve formatting consistently." },
            { b: "Government and tax forms.", t: "Most regulators only accept PDF. Word documents are rejected on technical grounds even when content is correct." },
            { b: "Email-to-print pipelines.", t: "PDF prints byte-identically. Word can render slightly different on every printer." },
            { b: "Long-term archival.", t: "PDF/A is an ISO standard for long-term storage. Word format keeps changing every release; PDF/A from today is still readable in 30 years." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Most conversion problems come from one of these:",
        ],
        list: {
          items: [
            { b: "Forgetting to accept tracked changes.", t: "The default export shows tracked changes as visible markup. If you didn't intend to ship the change history, accept all changes first or set 'Final' as the markup mode." },
            { b: "Embedded comments leaking out.", t: "Comments are off by default but Word's own export sometimes includes them. We default to 'no comments' on export to avoid this." },
            { b: "Custom fonts not embedded.", t: "If your Word doc uses a custom font, the PDF needs to embed it or the recipient's machine will substitute a fallback. Toggle 'Embed all fonts' before exporting." },
            { b: "Section breaks resetting page numbers.", t: "Multi-section Word docs can produce PDFs where page numbers restart at every section. Use 'Continuous numbering' in Word, then re-export." },
            { b: "Mac users opening Windows-created .doc files.", t: "Legacy .doc rendering on Mac sometimes drops embedded objects. Convert through .docx as an intermediate, or use our converter which handles both." },
          ],
        },
      },
      {
        h: "Tips for a perfect PDF",
        p: [
          "These small choices keep the output clean:",
        ],
        list: {
          items: [
            { b: "Update your TOC and cross-references first.", t: "Word's auto-generated tables of contents only update when you tell them to. Press F9 (or right-click → Update Field) before exporting." },
            { b: "Choose the right PDF flavor.", t: "Standard PDF for most uses; PDF/A for archives; PDF/X for prepress. We default to standard, but you can switch in the Options panel." },
            { b: "Include the .docx and the .pdf when delivering.", t: "Recipients sometimes want both — the PDF for review and the source for editing. Bundle them as a zip." },
            { b: "Compress after converting if the result is large.", t: "Word documents with embedded high-res images can produce 50 MB PDFs. Run Compress on Balanced after exporting if size matters." },
            { b: "Add page numbers in Word, not after.", t: "Adding page numbers in the Word source guarantees they're consistent with the document's section structure. Adding them post-conversion is a workaround, not the right answer." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "We accept .docx (Word 2007+) and legacy .doc. Output is standard PDF or PDF/A as you choose, opens in every reader, and is byte-identical regardless of which OS or Word version you're on. Free tier: up to 100 MB per file, no per-day caps.",
        ],
      },
    ],
  },

  // ============================================================
  // 7. pdf-to-jpg
  // ============================================================
  "pdf-to-jpg": {
    title: "How to convert PDF pages to JPG — sharp, sized right, and ready to use",
    intro:
      "Converting a PDF to JPG turns each page into a flat raster image. That sounds destructive — and it is, in the sense that you can't edit the text afterward — but for some jobs it's the right move: thumbnails, preview tiles, social-media images, and embedding pages into other software that doesn't accept PDF. The choices that matter are resolution, color space, and how to crop. Get those right and the output looks crisp; get them wrong and it looks like a fax.",
    sections: [
      {
        h: "What's actually happening",
        p: [
          "The converter renders each PDF page through a rasterizer at the resolution you choose, applies the page's color profile, and writes a JPEG file. Each PDF page becomes one JPG by default. You can pick the DPI (which controls sharpness), the JPEG quality (which controls file size), and the page range (which controls how many output files you get).",
          "Vector content — text, shapes, line art — is rasterized at the chosen DPI. That's why a 72-DPI export of a text-heavy PDF can look soft: every letter has been turned from a vector outline into a grid of pixels.",
        ],
      },
      {
        h: "When PDF-to-JPG is the right call",
        p: [
          "The right answer depends on where the JPGs are going:",
        ],
        list: {
          items: [
            { b: "Web previews and thumbnails.", t: "150 DPI for retina displays, 72 DPI for thumbnails. JPG is the right format for any non-transparent web image." },
            { b: "Social media posts.", t: "Most platforms only accept image uploads. Convert at 1200 px wide for Twitter/X and LinkedIn, 1080 px square for Instagram." },
            { b: "Embedding into PowerPoint or Keynote.", t: "A page-as-image is more reliable than a 'paste PDF' which sometimes scales weirdly. JPG embeds clean." },
            { b: "Sharing one specific page.", t: "When the recipient only needs one page and a PDF feels heavy, a JPG of just that page is the lighter delivery." },
            { b: "OCR pipelines.", t: "Some legacy OCR engines only accept image input. Convert first, OCR second." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "These are the patterns that cause people to redo a conversion or end up with images they can't actually use:",
        ],
        list: {
          items: [
            { b: "Choosing the wrong DPI.", t: "72 DPI for print is unreadable. 600 DPI for the web is wasteful (and will choke uploads). Pick the DPI for the destination, not the source." },
            { b: "Forgetting the file count.", t: "A 200-page PDF at 1 JPG/page is 200 files. Bundle as a zip in the Options panel, or extract only the pages you need." },
            { b: "Using JPG for anything with transparency.", t: "JPG has no alpha channel. If your PDF page has transparent regions or a non-white background you need to preserve, convert to PNG instead." },
            { b: "Converting a fillable form.", t: "Form fields render as their default state — usually empty boxes. If you need the filled-form image, fill the form first then convert." },
            { b: "Hoping JPG is editable.", t: "It isn't. If you want to edit the page contents, use Edit PDF or PDF-to-Word instead." },
          ],
        },
      },
      {
        h: "Tips for the cleanest output",
        p: [
          "Small choices that matter more than people expect:",
        ],
        list: {
          items: [
            { b: "Pick PNG over JPG for screenshots.", t: "Anything with crisp text or thin lines compresses better and looks sharper as PNG. JPG is for photo-grade content." },
            { b: "Use the 'crop to content' option.", t: "If your PDF has wide white margins (default Letter size), the JPGs will too. Crop-to-content trims the white space automatically." },
            { b: "Match the color profile to the destination.", t: "sRGB for web, CMYK only if your downstream is print. The wrong profile produces washed-out colors on the receiving side." },
            { b: "Set quality to 85, not 95.", t: "JPEG 85 is visually indistinguishable from 95 at half the file size. 95 is for archival; 85 is for everything else." },
            { b: "Bundle as a zip if you have more than 5 pages.", t: "Otherwise the browser will trigger a separate download for each file, which gets blocked by most browsers' download throttles." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tool: up to 100 MB per PDF, up to 500 page-images per zip. Output is standard JPG (sRGB) or PNG (sRGB with alpha). Both formats open in every image viewer, every browser, and every operating system.",
        ],
      },
    ],
  },

  // ============================================================
  // 8. jpg-to-pdf
  // ============================================================
  "jpg-to-pdf": {
    title: "How to combine JPGs into a single PDF that looks professional",
    intro:
      "Combining JPG images into a PDF sounds like a one-click job — and it can be — but the difference between a usable PDF and a polished one is in choices most tools don't give you: page size, image-fit, ordering, margins, and whether the output is searchable. Here is how to build a JPG-to-PDF that you would actually be willing to send.",
    sections: [
      {
        h: "What the converter does",
        p: [
          "We accept any number of JPG (or PNG, HEIC, BMP, TIFF) images, lay each one onto a configurable page size — A4, Letter, photo, or 'fit page to image' — embed them as PDF image objects with no quality loss beyond the JPEG you started with, and write the result as one PDF in the order you've chosen. Optional steps include OCR (so the text in your image is searchable), auto-rotation (we straighten skewed scans), and adding margins (so photo prints don't look cramped on a Letter-size page).",
        ],
      },
      {
        h: "When this is the right tool",
        p: [
          "Some specific cases where JPG-to-PDF is exactly what you need:",
        ],
        list: {
          items: [
            { b: "Document scans from your phone.", t: "Phone-camera scans of receipts, IDs, or whiteboards are JPGs by default. Combine them into a PDF so they're one file, not twenty." },
            { b: "Photo albums and portfolios.", t: "A landscape PDF with one photo per page is a more shareable photo album than a folder of JPGs." },
            { b: "Visa and immigration applications.", t: "Most consular portals accept one PDF, not multiple images. Combining your supporting JPGs into a single PDF avoids upload errors." },
            { b: "Product photos for catalogs.", t: "Multi-page PDFs with one product per page print cleanly, share cleanly, and behave consistently." },
            { b: "Book chapter scans.", t: "If you've photographed pages from a printed book, combining them into one PDF preserves their order." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "These show up in nearly every batch of poorly built JPG-to-PDFs:",
        ],
        list: {
          items: [
            { b: "Using 'fit to page' on portrait phone shots.", t: "If your photos are portrait but the page is Letter, you'll get tiny images centered on huge pages. Pick A4 portrait or 'fit page to image' instead." },
            { b: "Mixing portrait and landscape without setting per-image orientation.", t: "We auto-rotate by default, but if your originals' EXIF data is missing, the result mixes orientations. Spot-check the first few pages." },
            { b: "Skipping OCR on scanned text.", t: "If the JPGs are document scans (not photos), OCR makes the resulting PDF searchable. The same JPG-to-PDF without OCR is a binary blob with no findable text." },
            { b: "High-DPI photos producing huge PDFs.", t: "A folder of 12 MB phone photos becomes a 120 MB PDF. Compress on Balanced after — or downsample to 200 DPI in the Options panel before — to land at sane sizes." },
            { b: "Forgetting to set page numbers and a cover.", t: "A PDF with no cover page and no numbering looks like a photo dump. Add both for a more polished feel." },
          ],
        },
      },
      {
        h: "Tips for the best result",
        p: [
          "Small touches that turn a 'works' result into a 'shareable' one:",
        ],
        list: {
          items: [
            { b: "Choose page size by destination.", t: "A4 for European recipients, Letter for North American, A6 for photo-print booklets, custom for online viewing." },
            { b: "Enable auto-orientation only if EXIF is reliable.", t: "Phone photos: yes. Scanned images: no — many scanners strip EXIF, leading to wrong rotations." },
            { b: "Add 0.5-inch margins for printed output.", t: "Bleed-edge JPGs look bad on a paper print because most printers can't print to the edge." },
            { b: "Run OCR even on photos.", t: "If a photo contains any readable text — a sign, a receipt, a whiteboard — OCR makes that text searchable in the PDF. Costs almost nothing for huge utility." },
            { b: "Build a cover page from text.", t: "Use the Text-to-PDF tool to make a one-page title/date cover, then merge it ahead of your JPG-to-PDF result." },
          ],
        },
      },
      {
        h: "Limits and supported formats",
        p: [
          "We accept JPG, PNG, HEIC (Apple's iPhone format), BMP, TIFF, and WebP. Free tier: up to 100 images per PDF, each up to 25 MB. The output is standard PDF, opens cleanly everywhere, and embeds the images at their native resolution unless you ask for downsampling.",
        ],
      },
    ],
  },

  // ============================================================
  // 9. pdf-to-excel
  // ============================================================
  "pdf-to-excel": {
    title: "How to extract tables from PDFs into Excel that you can actually use",
    intro:
      "PDF-to-Excel is really PDF table extraction, and table extraction is hard. Tables in PDFs are not stored as tables — they're stored as text positioned at coordinates, and the 'table' is a visual illusion the reader's brain assembles from spacing. Good extraction reverses that illusion. Bad extraction gives you a CSV with everything in column A.",
    sections: [
      {
        h: "How table extraction works",
        p: [
          "We detect column boundaries by analyzing where text runs start and end across multiple lines. When several rows have text starting at the same x-coordinate, that's almost certainly a column boundary. We detect row boundaries from line spacing. Multi-row headers, merged cells, and split cells across pages are detected by a layout model that looks at table structure holistically rather than line-by-line.",
          "Output is a real .xlsx file with one sheet per detected table, each cell typed correctly (numbers as numbers, dates as dates, currency as currency), so you can run formulas against it immediately.",
        ],
      },
      {
        h: "When PDF-to-Excel is the right choice",
        p: [
          "Specific situations where this is the operation you want:",
        ],
        list: {
          items: [
            { b: "Bank statements.", t: "Pull the transaction table out of statement PDFs without typing them in by hand." },
            { b: "Financial reports.", t: "10-K filings, balance sheets, profit-and-loss statements — the underlying data is what you want, not the formatted PDF." },
            { b: "Invoices and receipts.", t: "Line-item tables become accounting input." },
            { b: "Research data tables.", t: "Tables in academic PDFs converted into a sheet you can chart from." },
            { b: "Product catalogs and price lists.", t: "Vendor PDFs become inventory imports." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "These are the patterns that produce unusable spreadsheet output:",
        ],
        list: {
          items: [
            { b: "Trying to extract a 'table' that isn't really tabular.", t: "Two-column documents are not tables. Multi-paragraph cells with embedded line breaks aren't either. Detect first; extract second." },
            { b: "Skipping OCR on scanned tables.", t: "If the PDF is a scan, the text doesn't exist yet. OCR creates the text layer; without it, extraction returns empty rows." },
            { b: "Trusting auto-detected column widths on rotated pages.", t: "Tables on landscape pages of an otherwise-portrait PDF sometimes confuse the detector. Set the page rotation explicitly in the Options panel." },
            { b: "Letting numbers come through as text.", t: "Numbers with currency symbols ('$1,234.56') often parse as strings. Use the 'parse currency' toggle so they import as numeric." },
            { b: "Splitting one table across multiple sheets.", t: "If a single table runs across three pages, it should be one sheet with continuous rows. Set the 'merge across pages' option." },
          ],
        },
      },
      {
        h: "Tips for clean extraction",
        p: [
          "These changes make extraction noticeably better:",
        ],
        list: {
          items: [
            { b: "Use the AI Table Extract tool for messy tables.", t: "The PDF-to-Excel converter does well on clean tables; AI Table Extract handles merged cells, multi-row headers, and footnoted cells better. Pick the tool that matches your PDF." },
            { b: "Crop to the table area first.", t: "Surrounding paragraphs sometimes confuse column detection. Crop the page to just the table, then extract." },
            { b: "Set the date format explicitly.", t: "MM/DD/YYYY vs DD/MM/YYYY ambiguity is the #1 source of silent errors. Tell us which one your source uses." },
            { b: "Validate the extracted totals.", t: "Sum the extracted column and compare to the printed total. A 1-row mismatch usually means a header row was treated as data." },
            { b: "Output as CSV for downstream automation.", t: "If your next step is feeding the data into a script or BI tool, CSV is the cleaner intermediate. .xlsx is for Excel users; CSV is for everyone else." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tier: up to 100 pages per file. Output is .xlsx (Excel 2007+) or .csv (UTF-8). Opens in Excel, Google Sheets, Numbers, LibreOffice, every BI tool that imports CSV. Tables with up to ~80 columns and ~50,000 rows extract cleanly; beyond that we recommend the API's batch endpoint.",
        ],
      },
    ],
  },

  // ============================================================
  // 10. edit-pdf
  // ============================================================
  "edit-pdf": {
    title: "How to edit a PDF — text, images, pages, and forms — without breaking it",
    intro:
      "PDF editing has a reputation for being hard. It is — but only because most PDFs were never built to be edited. They were built to be a final, fixed-layout output. Editing means working with the document as it was rendered, not as it was authored. The good news: for the changes most people actually need (fix a typo, swap a logo, add a paragraph), you can do them quickly and cleanly without the source file.",
    sections: [
      {
        h: "What 'edit' means in a PDF",
        p: [
          "PDFs store text as glyphs positioned at x/y coordinates. Editing a word means finding the run of glyphs that make up that word and rewriting them — which works only if the font is embedded and the new text fits the original space, or if we're willing to reflow surrounding content. Editing an image means swapping the image stream for a new one. Editing pages means reordering, inserting, or deleting them, which is structural rather than content-level.",
          "Our editor handles all three. Text edits use the original font when it's embedded; otherwise we substitute the closest available font and warn you. Image edits preserve the original bounding box. Page-level edits don't touch content at all.",
        ],
      },
      {
        h: "Picking the right kind of edit",
        p: [
          "The right tool depends on what you're changing:",
        ],
        list: {
          items: [
            { b: "Single-word or single-line text edits.", t: "Edit PDF in-place. Click the text, retype, save." },
            { b: "Whole-paragraph rewrites.", t: "Use Rewrite & Rephrase (AI) — it understands context and preserves formatting. Or convert to Word, edit, convert back." },
            { b: "Adding a paragraph.", t: "Use Add Text Box. Place it where you want, type, and the new content lives as a new layer on top of the existing PDF." },
            { b: "Replacing an image.", t: "Edit PDF supports drag-to-replace for any embedded image. The new image is fitted to the original bounding box." },
            { b: "Reordering pages.", t: "Rotate & Reorder. Drag the thumbnails into the order you want." },
            { b: "Filling in a form.", t: "Fill PDF Forms (free) for typed entry, or Sign & Fill (AI) when you want auto-population from a saved profile." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Most 'why does this look terrible after I edited it' problems come from one of these:",
        ],
        list: {
          items: [
            { b: "Editing without checking font availability.", t: "If the source PDF used a font that isn't on your system, our editor falls back to a similar font for new text. The substituted font may look slightly different — usually unnoticeable, sometimes obvious." },
            { b: "Trying to edit text inside a scanned PDF.", t: "Scans have no text layer. Run OCR first, then edit. Without OCR, the 'text' you see is part of the page image." },
            { b: "Editing then running compression on Strong.", t: "Strong compression downsamples images, which can soften any edits you've made. Edit on the original, compress at the end on Balanced." },
            { b: "Editing a signed PDF.", t: "Any edit invalidates the cryptographic signature. Edit the unsigned version, then have it re-signed." },
            { b: "Saving over the original.", t: "Always keep the source. PDF editing is more reliable when you can fall back to the unedited file." },
          ],
        },
      },
      {
        h: "Tips for clean edits",
        p: [
          "These habits prevent most rework:",
        ],
        list: {
          items: [
            { b: "Edit text before adding annotations.", t: "If you highlight first then realize a typo, fixing the typo can shift the highlight. Edit text first, annotate after." },
            { b: "Use Replace All carefully.", t: "Find/replace works the same as Word's, but in PDFs there's no autocorrect. A wrong-case replacement won't be caught for you." },
            { b: "Flatten before sharing.", t: "Form fields and annotations stay editable by the recipient. If you want to lock the file in its current state, run Flatten." },
            { b: "Keep an unflattened working copy.", t: "Once flattened, edits are permanent. Save your working file before flattening." },
            { b: "Test the edited file in Acrobat and Preview.", t: "Some PDF viewers tolerate edits gracefully; others don't. Open in two readers before sending the final file." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Edit PDF works on any standard PDF up to 100 MB. Heavily encrypted, password-protected, or DRM-locked PDFs may refuse edits — unlock them first. Output is standard PDF and opens in every reader. The free editor handles text, images, annotations, and basic page operations; AI-assisted operations (rewrite, translate, smart fill) are paid.",
        ],
      },
    ],
  },

  // ============================================================
  // 11. sign-pdf-free
  // ============================================================
  "sign-pdf-free": {
    title: "How to sign a PDF for free — typed, drawn, or uploaded — that recipients accept",
    intro:
      "Signing a PDF is two different things: drawing your name on the page (a visual signature) and applying a cryptographic seal (a digital signature). Most online tools only do the first. The visual signature is what 99% of business workflows actually require, and it's what we offer for free. Here is how to sign correctly so the result is accepted by counterparties, courts, and contract platforms.",
    sections: [
      {
        h: "Visual signatures vs. digital signatures",
        p: [
          "A visual signature is a graphical mark on the page — typed in a script font, drawn with a mouse or finger, or uploaded as an image of your hand-signed name. It's legally binding for nearly all business transactions in most countries (US ESIGN Act, EU eIDAS for simple e-signatures, UK ECA, similar laws elsewhere). It does not, by itself, prove the file hasn't been tampered with after signing.",
          "A cryptographic digital signature uses a certificate (issued by a CA, or self-signed, or via a workflow service) to lock the file's bytes at the moment of signing. Tampering after signing is detectable. Required only for high-stakes scenarios: court filings in some jurisdictions, regulatory submissions, certain financial transactions. Our free tool produces visual signatures; for cryptographic signing we recommend integrating with DocuSign, Adobe Sign, or our API's certificate workflow.",
        ],
      },
      {
        h: "When the free signer is enough",
        p: [
          "The free visual signer covers most everyday needs:",
        ],
        list: {
          items: [
            { b: "NDAs, MSAs, and standard business contracts.", t: "Counterparty just needs your signed copy back. Visual signature is fine." },
            { b: "Employment paperwork, offers, onboarding.", t: "HR systems accept signed PDFs as proof." },
            { b: "Vendor agreements and quotes.", t: "Procurement workflows usually only require a signed PDF on file." },
            { b: "Internal policies and acknowledgments.", t: "Read-and-sign policy attestations, code of conduct sign-offs, etc." },
            { b: "Permission and consent forms.", t: "School trip forms, photo releases, etc. — most don't require cryptographic signing." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that come up repeatedly in rejected or invalidated signed PDFs:",
        ],
        list: {
          items: [
            { b: "Signing a flattened PDF you can't unflatten.", t: "Once flat, you can't move or remove the signature. Sign on the working copy, then flatten if needed." },
            { b: "Date doesn't match.", t: "If your signature shows today's date but the document is dated last week, recipients sometimes reject. Use the date field that matches the document, or leave the date blank." },
            { b: "Signing on the wrong page.", t: "Most contracts have a specific signature block. Use the form-fill detector to find it rather than placing your signature manually." },
            { b: "Initialing every page when the contract only requires the last.", t: "Initials on every page is a habit, not a requirement. Read the agreement's signature instructions before initialing 30 pages." },
            { b: "Trusting the visual signature alone in disputes.", t: "Visual signatures are legally binding but not tamper-proof. For high-value contracts, use a cryptographic signing service." },
          ],
        },
      },
      {
        h: "Tips for clean signatures",
        p: [
          "Signatures that look professional in business contexts:",
        ],
        list: {
          items: [
            { b: "Upload a real handwritten signature.", t: "Sign on white paper, take a phone photo, upload. The result looks more legitimate than a script-font typed name." },
            { b: "Save your signature for reuse.", t: "Once uploaded, save it to your account so you can sign future PDFs with one click. Keep your saved signature in a private profile, not shared." },
            { b: "Match signature size to surrounding text.", t: "A 200-pt signature on a 10-pt contract looks unprofessional. Drag-resize so the signature is roughly the same height as the printed name beneath it." },
            { b: "Sign last, after all other edits are final.", t: "Any edit after signing visually is fine, but it makes the signature look hastily added. Make all edits first, sign last." },
            { b: "Flatten and save with a clear filename.", t: "filename-signed-2026-04-25.pdf is more useful than filename-final-final-3.pdf." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tool: any PDF up to 100 MB, unlimited signatures per document, unlimited documents per day. Output opens in every reader. For cryptographic signing, see the API docs or the AI Sign & Fill tool which integrates with certificate workflows.",
        ],
      },
    ],
  },

  // ============================================================
  // 12. chat-with-pdf
  // ============================================================
  "chat-with-pdf": {
    title: "How to chat with a PDF and get answers you can actually trust",
    intro:
      "Chatting with a PDF means asking questions in plain English and getting answers grounded in the document. The technology behind it is retrieval-augmented generation — we index the PDF, find the passages relevant to your question, and the model writes the answer using those passages as evidence. Done well, every answer comes with page citations so you can verify it. Done badly, you get plausible-sounding hallucinations.",
    sections: [
      {
        h: "How chat-with-PDF works",
        p: [
          "When you upload a PDF we extract its text (running OCR if needed), split it into semantically meaningful chunks (typically 500–1500 tokens each), and create vector embeddings for each chunk. The embeddings get stored in a per-document index. When you ask a question, we embed the question, retrieve the most-relevant chunks, and ask the model to answer using only those chunks. Every answer includes the page numbers where the supporting passage was found.",
          "The 'only those chunks' constraint is the difference between a tool that hallucinates and a tool that doesn't. If the answer isn't in the document, our tool says so rather than guessing. You can verify any answer by clicking the page citation and reading the passage yourself.",
        ],
      },
      {
        h: "When chat-with-PDF is the right tool",
        p: [
          "Specific cases where it pays for itself in minutes:",
        ],
        list: {
          items: [
            { b: "Long contracts with specific clauses.", t: "Ask 'what's the termination notice period?' instead of skim-reading 80 pages." },
            { b: "Research papers.", t: "'What was the sample size?' or 'Did they control for income?' — fast extraction of methodology details." },
            { b: "Manuals and product documentation.", t: "'How do I configure SSO for Azure?' — pull the procedure without searching the index." },
            { b: "Financial statements.", t: "'What was the year-over-year revenue growth?' — pull the number from the management discussion." },
            { b: "Long-form interviews and transcripts.", t: "'Did the candidate mention prior leadership experience?' — surface specific quotes." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that lead to disappointing chat sessions:",
        ],
        list: {
          items: [
            { b: "Asking yes/no questions about counterfactuals.", t: "'Could this clause apply to subsidiaries?' is interpretation, not retrieval. The model will give you an answer; you should verify it with a lawyer." },
            { b: "Trusting summary questions.", t: "'Summarize this document' is best done with the Summarize tool, not the Chat tool. Chat is for specific, locatable answers." },
            { b: "Asking about content that was filtered.", t: "If your PDF is an image-heavy presentation, the chat may miss things only present in slide images. Run OCR first." },
            { b: "Not reading the citations.", t: "Even with grounding, models sometimes paraphrase aggressively. Click the page reference and read the original passage for any answer that matters." },
            { b: "Asking vague questions.", t: "'Tell me about the contract' returns vague answers. 'What's the indemnification cap?' returns a precise one." },
          ],
        },
      },
      {
        h: "Tips for better answers",
        p: [
          "Habits that consistently produce better chat output:",
        ],
        list: {
          items: [
            { b: "Be specific.", t: "Use the names, terms, and section headings from the document. 'In Section 8.2, what's the exception to the limitation of liability?' beats 'is liability limited?'." },
            { b: "Ask one question at a time.", t: "Multi-part questions sometimes get partial answers. Ask question A, get the answer, then ask question B." },
            { b: "Use the chat to find passages, not to interpret them.", t: "'Where does the document discuss data retention?' is a great chat question. 'Is this GDPR-compliant?' is a question for a lawyer." },
            { b: "Read the cited page yourself.", t: "Treat the chat as a first reader, not the final reader. Chat surfaces; you decide." },
            { b: "Save useful Q&A as a digest.", t: "Use the 'export chat' option to save a Q&A summary alongside the PDF for future reference." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Free tier: 5 questions per document. Pro: unlimited questions per document. Documents up to 1,000 pages and 200 MB. The chat respects the document — your PDF is not used for model training. Files are deleted within 60 minutes by default.",
        ],
      },
    ],
  },

  // ============================================================
  // 13. summarize-pdf
  // ============================================================
  "summarize-pdf": {
    title: "How to summarize a PDF when the summary actually has to be useful",
    intro:
      "Summarizing a PDF sounds simple but breaks immediately under different needs. A board director wants a 5-bullet executive summary. A student wants study notes. A new joiner wants a TL;DR. A lawyer wants the obligations and dates extracted. Different jobs, different summaries — and the wrong shape of summary is worse than no summary at all.",
    sections: [
      {
        h: "What 'summarize' actually does",
        p: [
          "We extract the text from your PDF, segment it into logical sections (chapters, headings, page groups), summarize each section independently, then synthesize the section summaries into the format you asked for. This map-reduce structure is what lets us handle 1,000-page documents without hitting model context limits, and is also why long documents summarize cleanly without missing the back half.",
          "The output format is a parameter, not a default. We support 11 distinct summary styles — pick the one that matches your job.",
        ],
      },
      {
        h: "Picking the right summary style",
        p: [
          "Match the format to what you'll do with the summary:",
        ],
        list: {
          items: [
            { b: "Executive summary (5–7 bullets).", t: "For decision-makers. Headline + key facts + recommendation." },
            { b: "TL;DR (1 paragraph).", t: "Drop into Slack, email subject lines, or chat threads." },
            { b: "Key points (10 bullets, full sentences).", t: "Briefing notes — the 'I read this so you don't have to' format." },
            { b: "Study notes.", t: "Hierarchical bullets with definitions and examples called out — for learning, not for skimming." },
            { b: "Action items.", t: "Each obligation extracted with its due date and responsible party. Best for contracts and meeting transcripts." },
            { b: "FAQ.", t: "Question/answer pairs derived from the document. Useful for product docs or policies." },
            { b: "Section-by-section.", t: "One bullet group per chapter. Keeps the document's structure visible." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that produce summaries that look right but aren't useful:",
        ],
        list: {
          items: [
            { b: "Summarizing without OCR on a scanned PDF.", t: "If there's no text layer, the model has nothing to read. The 'summary' you'll get is a hallucination. OCR first." },
            { b: "Asking for 'a summary' without specifying the form.", t: "The default is fine for casual reading; for any specific use, pick the matching format." },
            { b: "Using executive summary on a legal contract.", t: "Five bullets won't capture the cross-references and conditional obligations a contract requires. Use 'Action items' instead." },
            { b: "Skipping the 'audience' option.", t: "A summary for a CFO reads differently than one for a junior analyst. Setting the audience changes the level of detail and the financial vocabulary." },
            { b: "Trusting summaries on documents that contain factual claims.", t: "Models sometimes paraphrase numbers slightly. For high-stakes content (clinical, financial, legal), verify any specific number against the source." },
          ],
        },
      },
      {
        h: "Tips for the best summary",
        p: [
          "Habits that consistently produce better output:",
        ],
        list: {
          items: [
            { b: "State the audience explicitly.", t: "'For a CFO who'll spend 60 seconds on it' produces sharper output than the default." },
            { b: "Pick the right length.", t: "Too short: omits critical context. Too long: defeats the purpose. 5 bullets for executives, 15 for briefings, 30 for study notes." },
            { b: "Run sectional summaries on long docs.", t: "1,000-page documents get one summary per chapter, then a meta-summary across them. The result is more usable than a single mega-summary." },
            { b: "Combine with chat.", t: "Summarize first to understand the shape; then chat to drill into specifics." },
            { b: "Export summary alongside the PDF.", t: "Saving the summary inside or beside the source preserves the context for next time you reach for the file." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Free preview: top-1-page summary. Full summary: 3 credits per document up to 100 pages, then 1 credit per additional 50 pages. Documents up to 1,000 pages. The model used is task-tuned for summarization specifically — not a general-purpose chatbot.",
        ],
      },
    ],
  },

  // ============================================================
  // 14. ai-pdf-ocr
  // ============================================================
  "ai-pdf-ocr": {
    title: "How to OCR a PDF — turn scans into searchable, structured, copy-able text",
    intro:
      "OCR (optical character recognition) is the bridge between a PDF that's just an image of pages and a PDF you can search, copy, and analyze. Our AI OCR layer is more than character recognition — it also detects document structure (headings, paragraphs, tables, lists) and preserves it. That's the difference between OCR'd text you can paste into a chat and text that needs an hour of cleanup first.",
    sections: [
      {
        h: "What AI OCR does",
        p: [
          "First we render every page to a high-resolution bitmap. Then a multi-stage model recognizes text glyphs across mixed scripts and fonts (Latin, Cyrillic, Greek, CJK, Arabic, Hebrew, Devanagari). On top of that, a layout model identifies regions: what's a heading, what's a column, what's a table, what's a footnote. The recognized text is positioned back into a hidden text layer aligned with the original pixels — so the PDF still looks identical to the scan, but you can now select and search the text.",
          "Optionally we also export the text as a clean .txt or .docx with the structure detected. That's useful when you don't need the original layout, just the content.",
        ],
      },
      {
        h: "When OCR is the right step",
        p: [
          "OCR is the prerequisite for almost any other operation on a scanned PDF:",
        ],
        list: {
          items: [
            { b: "Scanned contracts.", t: "Make them searchable, copy-able, and chat-able." },
            { b: "Photographed documents.", t: "Phone photos of receipts, IDs, or whiteboards become real text." },
            { b: "Old archives.", t: "Decades of scanned paper records become a searchable corpus." },
            { b: "Faxes.", t: "Yes, people still receive faxes. Faxed PDFs are usually scans, and OCR makes them workable." },
            { b: "Image-only exports from older software.", t: "Some older 'PDF printers' produced image-only output. OCR adds the missing text layer." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that produce poor OCR results:",
        ],
        list: {
          items: [
            { b: "OCR'ing low-DPI scans.", t: "Below 200 DPI accuracy drops fast. Below 150 DPI it's not worth running. Rescan if you can." },
            { b: "Skipping deskew on tilted scans.", t: "OCR engines work best on orthogonal text. Scans with a 5° tilt lose 5-10% accuracy. We deskew automatically; toggle it off only if you have a reason." },
            { b: "Running OCR after compression.", t: "Strong compression softens edges, which hurts character recognition. OCR first, compress second." },
            { b: "Not telling the engine the source language.", t: "Auto-detection works well, but specifying the language for known cases (e.g. mixed English/Spanish) can boost accuracy by a few percent." },
            { b: "Trusting OCR'd numbers without verification.", t: "0/O, 1/l, 5/S, and 8/B are the most-confused pairs. Spot-check any extracted figures that matter." },
          ],
        },
      },
      {
        h: "Tips for the best results",
        p: [
          "Most of the OCR-quality battle is won at scan time, not OCR time:",
        ],
        list: {
          items: [
            { b: "Scan at 300 DPI, grayscale.", t: "Color scans are larger and don't OCR better. 300 DPI grayscale is the sweet spot for accuracy and file size." },
            { b: "Scan flat, with the page parallel to the platen.", t: "Phone photos at angles are why so much OCR fails. Use a document scanner app that detects edges." },
            { b: "Avoid photocopier scans of photocopies.", t: "Each generation loses contrast. OCR a fresh scan, not a fourth-generation copy." },
            { b: "Confirm orientation.", t: "Pages scanned upside-down or sideways need rotation before OCR. Auto-rotate fixes this most of the time, but check." },
            { b: "Inspect the confidence overlay.", t: "We highlight low-confidence words. A quick visual scan catches the substitution errors automation never will." },
          ],
        },
      },
      {
        h: "Limits and supported scripts",
        p: [
          "We OCR Latin, Cyrillic, Greek, CJK (Simplified and Traditional Chinese, Japanese, Korean), Arabic, Hebrew, Devanagari, Bengali, Tamil, Thai, and 30+ other scripts. Free tier: up to 20 pages free, then 2 credits per page. Files up to 200 MB. Output: PDF with hidden text layer (looks identical to the scan, but searchable), plus optional plain text or Word export.",
        ],
      },
    ],
  },

  // ============================================================
  // 15. make-pdf-searchable
  // ============================================================
  "make-pdf-searchable": {
    title: "How to make a scanned PDF searchable without changing how it looks",
    intro:
      "A 'searchable PDF' is the same scan you started with, plus an invisible text layer that makes the content findable through Cmd+F, Google indexing, document management systems, and any search workflow you build on top. Done right, the file looks pixel-identical to the scan but behaves like a text PDF. Done wrong, the text layer drifts or fails on accented characters and your search returns nothing.",
    sections: [
      {
        h: "What 'making it searchable' actually does",
        p: [
          "We OCR every page, then position each recognized word on top of the matching pixels in a hidden text layer. The layer is part of the PDF but renders invisibly — when you search for a word, the PDF reader matches against the hidden layer; when you copy text, the copy comes from the hidden layer; when a search engine indexes the file, it indexes the layer. Visually, nothing changes.",
          "This is different from straight OCR-to-text. The output is still a PDF, the original page images are preserved, and the file's hash is essentially the same one that was archived — just with the text added as metadata.",
        ],
      },
      {
        h: "When this is the right operation",
        p: [
          "Pick this tool when you specifically need the source PDF to remain visually intact:",
        ],
        list: {
          items: [
            { b: "Archives that must preserve the scanned image.", t: "Court records, certified copies, regulatory submissions where the scan IS the document." },
            { b: "Document management system uploads.", t: "DMS platforms index the text layer for full-text search across thousands of files." },
            { b: "Internal compliance archives.", t: "Auditors search by keyword across decades of contracts." },
            { b: "Searchable shared drives.", t: "Google Drive, SharePoint, and Box index searchable PDFs but not image-only ones." },
            { b: "Long-term searchable storage of receipts and invoices.", t: "Find any expense by vendor name without flipping through scans." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that make 'searchable' PDFs that aren't actually searchable:",
        ],
        list: {
          items: [
            { b: "OCR'ing the wrong language.", t: "Auto-detect handles most cases, but explicitly setting the language eliminates the risk." },
            { b: "Skipping deskew on tilted scans.", t: "Tilt confuses the layer alignment; the search highlight may land 50 pixels off the actual word." },
            { b: "Compressing after making searchable.", t: "Strong compression downsamples the page image but the text layer stays put — small misalignments creep in. Make searchable first, compress on Light only." },
            { b: "Forgetting that handwriting won't OCR.", t: "Most OCR engines (including ours) won't reliably OCR handwriting. The result for a handwritten page will be sparse or empty text. Use the AI OCR's handwriting model only when needed." },
            { b: "Not testing search after the fact.", t: "Open the resulting PDF and Cmd+F a known word from the document. If it doesn't find, the OCR pass missed something." },
          ],
        },
      },
      {
        h: "Tips for clean results",
        p: [
          "Practical adjustments that improve searchability:",
        ],
        list: {
          items: [
            { b: "Use the highest-DPI scan available.", t: "300 DPI is the floor for reliable accuracy. 600 DPI is overkill but doesn't hurt." },
            { b: "Set the language explicitly when bilingual.", t: "If the document mixes English and Spanish, list both. Auto-detect picks one and may miss tokens in the other." },
            { b: "Preserve original PDF metadata.", t: "Author, created-date, and document-id should pass through. Toggle 'preserve metadata' on by default." },
            { b: "Run on a copy.", t: "Always preserve the unsearchable original alongside the searchable output. Re-OCR is cheap; re-scan isn't." },
            { b: "Bundle with PDF/A if archival.", t: "PDF/A-2u is the searchable archival standard — the ISO requires the text layer to be present and Unicode-mapped. We produce PDF/A-2u when you toggle it on." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tier: up to 20 pages free, then 2 credits per page. Output is a standard searchable PDF that opens in every reader (Acrobat, Preview, every browser, every DMS). The hidden text layer is recognized by Spotlight, Windows Search, Google Drive, and OCR-aware platforms. Supports 30+ scripts and most Latin-script languages out of the box.",
        ],
      },
    ],
  },

  // ============================================================
  // 16. redact-pdf-free
  // ============================================================
  "redact-pdf-free": {
    title: "How to redact a PDF properly — and why most 'redacted' PDFs aren't",
    intro:
      "Most 'redacted' PDFs you see in the wild aren't actually redacted. The most common mistake is drawing a black rectangle on top of the sensitive text, which hides it visually but leaves the original text intact in the file's underlying data. Anyone with a PDF reader and 30 seconds can copy-paste right through the rectangle and recover the secret. Real redaction permanently removes the data. Here's how to do it correctly.",
    sections: [
      {
        h: "How real redaction works",
        p: [
          "We find the text or image regions you've marked, delete the underlying content from the PDF's text streams, and replace the marked area with an opaque mark — usually a black rectangle. After redaction, the bytes that used to contain the sensitive text are gone. Searching for the redacted word returns nothing. Copying from the redacted region returns nothing. Forensic analysis of the file finds no trace.",
          "We also remove metadata associated with the redacted region — author, comments, edit history, and any private data the source application embedded. That step matters: people have been embarrassed when 'redacted' PDFs revealed sensitive content via metadata even though the visible page looked clean.",
        ],
      },
      {
        h: "When redaction is the right step",
        p: [
          "Specific cases where this is what you need:",
        ],
        list: {
          items: [
            { b: "Sharing internal documents with external partners.", t: "Strip employee names, salaries, and internal codenames before sending." },
            { b: "Legal discovery and FOIA responses.", t: "Many requests require redaction of privileged or personal info before release." },
            { b: "Medical records.", t: "Patient names, IDs, dates of birth must be removed before any sharing under HIPAA-equivalent rules." },
            { b: "Financial reports going to investors.", t: "Strip names, contracts, and unsigned forecasts." },
            { b: "Legal filings with redacted exhibits.", t: "Court rules require true redaction; 'covered with a black box' filings have been rejected." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Most 'I thought I redacted that' incidents come from one of these:",
        ],
        list: {
          items: [
            { b: "Drawing a black rectangle instead of redacting.", t: "Annotation tools draw on top of content. Real redaction tools remove content. Use the redact button, not the highlight or shape tools." },
            { b: "Forgetting metadata.", t: "Names buried in 'Author' or 'Last Modified By' fields survive visual redaction. Always strip metadata in the same pass." },
            { b: "Forgetting bookmarks and comments.", t: "Bookmark text and comment threads can carry sensitive info even when the page itself is clean. Strip both." },
            { b: "Redacting then editing.", t: "Adding annotations after redaction can re-expose redacted content if you accidentally type it. Redact last." },
            { b: "Trusting visual inspection on text-heavy redactions.", t: "Use the search-and-redact mode: search for the sensitive term and let the tool find every instance, including ones you'd miss by eye." },
          ],
        },
      },
      {
        h: "Tips for safe redaction",
        p: [
          "Habits that prevent leaks:",
        ],
        list: {
          items: [
            { b: "Use search-and-redact for names and IDs.", t: "Manual redaction misses occurrences. 'Redact every instance of John Smith' uses regex matching to find them all, including in headers and footers." },
            { b: "Always strip metadata in the same pass.", t: "It's a one-click toggle and prevents the most common leak vector." },
            { b: "Preview the redacted file with copy-paste tested.", t: "Open the output, try to copy-paste from a redacted region. If you get the original text back, the redaction failed — don't ship the file." },
            { b: "Use AI Redact for personal info you might miss.", t: "AI Redact auto-detects names, emails, phone numbers, SSN-shaped numbers, and addresses. Run it before manual redaction to catch the obvious cases." },
            { b: "Save with a clear filename.", t: "filename-redacted-2026-04-25.pdf signals 'this version is for sharing'. Keep the unredacted master under a different name." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tier: manual redaction on PDFs up to 100 MB. AI auto-detect of personal info: 2 credits per page. Output is standard PDF with redacted regions permanently removed at the byte level. Output passes forensic re-extraction tests in standard tools. Compatible with every major reader and document management system.",
        ],
      },
    ],
  },

  // ============================================================
  // 17. add-text-to-pdf
  // ============================================================
  "add-text-to-pdf": {
    title: "How to add text to a PDF that looks like it was always there",
    intro:
      "Adding text to a PDF means placing new text on a page that may not have been designed to accept it. The result can look professional or like a sticker glued onto a printed page. The difference is in details: font matching, alignment to the surrounding layout, and whether the text becomes a real searchable text layer or just a flat image.",
    sections: [
      {
        h: "How text addition works",
        p: [
          "We add a new text object to the chosen page, with the font, size, color, and alignment you've set. The text becomes part of the PDF — searchable, copy-able, and selectable in any reader. You can place it at any coordinate, rotate it, set transparency, or anchor it to a page-relative position so it shows up on every page (useful for headers, footers, and watermarks).",
          "If you want the text to look like it's part of the original, match the font and size to the surrounding text. We auto-detect the dominant font on the page and offer it as the default, but you can pick any of the embedded fonts plus the standard system fonts.",
        ],
      },
      {
        h: "When this is the right tool",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Filling in fields on a non-fillable PDF.", t: "Old forms scanned without fillable fields. Add text on top of each blank line." },
            { b: "Adding headers, footers, or page numbers.", t: "Use the page-anchored option to repeat the text on every page." },
            { b: "Annotating exhibits.", t: "Mark up exhibits with reference labels (Exhibit A, Page 3 of 7, etc.) without converting to Word and back." },
            { b: "Adding a confidentiality notice.", t: "Stamp 'CONFIDENTIAL — for internal use only' on every page in one pass." },
            { b: "Inserting addenda.", t: "Add a new clause to a contract without rebuilding the document from scratch." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that make added text look pasted-on:",
        ],
        list: {
          items: [
            { b: "Using the wrong font.", t: "If the page uses Times New Roman 11pt, your additions in Helvetica 12pt will stick out. Match the font." },
            { b: "Not aligning to the existing baseline.", t: "Text that floats half a line above the surrounding text looks pasted. Use the snap-to-baseline option." },
            { b: "Using rich black on grayscale documents.", t: "If the original PDF uses a soft gray-black, pure RGB black looks too dark. Pick the closest matching ink color." },
            { b: "Adding text on a flattened image-only PDF.", t: "If the page is a scan, the underlying text isn't there to align with. Position visually rather than relying on baseline detection." },
            { b: "Adding text after compression.", t: "Compression sometimes downsamples adjacent images, which changes the visual layout. Add text before compressing." },
          ],
        },
      },
      {
        h: "Tips for clean text additions",
        p: [
          "Habits that produce text that integrates with the page:",
        ],
        list: {
          items: [
            { b: "Use the dropper to match color.", t: "Click an existing text run to copy its color, font, and size — then type your new text with those exact properties." },
            { b: "Anchor footers and headers.", t: "Page-anchored text repeats automatically on every page. Don't add a footer 50 times manually." },
            { b: "Lock the layer when done.", t: "Locking prevents accidental drag-moves on later edits." },
            { b: "Flatten before sharing.", t: "Recipients can otherwise edit your added text. Flatten to lock the document." },
            { b: "Add metadata to the document, too.", t: "If your added text changes the document's content (e.g., adding a clause), update the document title and revision metadata to match." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tool: any PDF up to 100 MB. Output is standard PDF; added text becomes searchable and copy-able. Supports any system font plus any font already embedded in the source PDF. Compatible with every reader. Supports right-to-left scripts (Arabic, Hebrew) with proper line direction handling.",
        ],
      },
    ],
  },

  // ============================================================
  // 18. highlight-pdf
  // ============================================================
  "highlight-pdf": {
    title: "How to highlight a PDF cleanly so the marks survive sharing and printing",
    intro:
      "Highlighting a PDF should be a one-click operation, and most of the time it is. The corner cases — highlights that disappear when the recipient opens the file, marks that don't print, comments stuck to highlights you forgot to remove — are where the simple tool gets complicated. Here's how to highlight in a way that survives every reader and printer.",
    sections: [
      {
        h: "How PDF highlights actually work",
        p: [
          "A highlight is a PDF annotation — a 'highlight' object that draws a translucent yellow (or any color) rectangle over a text region. The annotation lives as a separate layer on top of the page content. Most readers display the highlight; some don't, especially older readers or printers with annotation rendering off. The annotation includes the underlying text, so highlights remain anchored to the right words even if the page is reflowed in some viewers.",
          "Importantly, a highlight is editable. The recipient can move it, delete it, change its color, or remove it entirely unless you flatten the document first. Flattening converts the annotation into part of the page itself, locking it in place.",
        ],
      },
      {
        h: "When to highlight (vs. underline, strike, comment)",
        p: [
          "PDF annotation tools include several near-relatives — pick the right one:",
        ],
        list: {
          items: [
            { b: "Highlight.", t: "Mark important text. The most familiar annotation; works for most uses." },
            { b: "Underline.", t: "Mark text without obscuring color. Better for printed output where yellow highlights look gray." },
            { b: "Strikethrough.", t: "Mark deletions or rejected text. Don't use for highlighting — it implies removal." },
            { b: "Comment / sticky note.", t: "Add a margin note. Useful when you need context, not just emphasis." },
            { b: "Squiggly underline.", t: "Mark uncertain text or grammatical issues." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that make highlighted PDFs disappointing:",
        ],
        list: {
          items: [
            { b: "Highlighting before flattening, then printing.", t: "Some printers don't render annotations. The recipient prints without highlights and wonders why you said you highlighted. Flatten before sharing if printing is likely." },
            { b: "Using the wrong color for printed output.", t: "Yellow on color is visible. Yellow on black-and-white print is invisible. Use a color that still reads in grayscale (like blue or green) for printable docs." },
            { b: "Highlighting then editing the highlighted text.", t: "Edits can shift the highlight off-target. Highlight last, after edits." },
            { b: "Highlighting on image-only PDFs.", t: "If the PDF is a scan with no text layer, you're highlighting a region of pixels, not text. The highlight won't follow re-flow. Run OCR first." },
            { b: "Not removing highlights before official sharing.", t: "Your annotations may be private commentary. Strip them in the Annotations panel before sending the document for sign-off." },
          ],
        },
      },
      {
        h: "Tips for clean highlights",
        p: [
          "Habits that help:",
        ],
        list: {
          items: [
            { b: "Use the keyboard shortcut.", t: "Select text, press H. Faster than clicking the highlight tool repeatedly." },
            { b: "Color-code by category.", t: "Yellow for to-review, green for approved, red for issues. Consistent color use makes the document scannable." },
            { b: "Add comments to important highlights.", t: "Right-click → Add note. Future-you will thank past-you." },
            { b: "Flatten when handing off.", t: "If the recipient will read but not annotate, flatten so the highlights are permanent." },
            { b: "Remove highlights before official versions.", t: "Drafts get marked up; clean copies don't. Use the bulk-remove option to strip annotations in one click." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tool: any PDF up to 100 MB. Output is standard PDF with highlight annotations that follow the PDF spec. Compatible with Acrobat, Preview, every browser viewer, and every DMS. Annotations export to JSON if you want to extract them programmatically (useful for review workflows).",
        ],
      },
    ],
  },

  // ============================================================
  // 19. resize-pdf
  // ============================================================
  "resize-pdf": {
    title: "How to resize a PDF — change page size, scale content, or fit to format",
    intro:
      "Resize PDF can mean three different things, and the right tool depends on which one you need. Changing the page size (e.g., A4 → Letter) is structural. Scaling content (e.g., shrink everything 90%) is rendering. Fitting content to a target size (e.g., booklet imposition) is layout. People reach for 'resize' when they actually need one of these three operations.",
    sections: [
      {
        h: "Three operations that all get called 'resize'",
        p: [
          "First, page size change: rewrite the page boxes to a new dimension while keeping the content's actual size and position fixed. Use this when you need to reformat for a different paper size — A4 → Letter for US recipients — without scaling the content. The content stays identical; the surrounding white space changes.",
          "Second, content scaling: shrink or enlarge the content to fit a different page size, keeping aspect ratio. Use this when content is currently too big for the target paper. Watch for unintended consequences — text below 7pt loses readability, fine line art gets fuzzy.",
          "Third, fit-to-target: combine the first two, with cropping or padding as needed. Use this for booklet impositions, multi-up layouts, or fitting odd-sized PDFs into standard print sizes.",
        ],
      },
      {
        h: "When to use which",
        p: [
          "Pick by the destination, not the convenience:",
        ],
        list: {
          items: [
            { b: "Sending an A4 doc to a US printer.", t: "Page size change to Letter. Don't scale — the doc was designed at A4 and will print fine on Letter with slightly different margins." },
            { b: "Fitting a Legal-size doc onto Letter without losing content.", t: "Content scale to ~78%. Lose readability on small text; gain print compatibility." },
            { b: "Impositioning multi-page docs onto larger sheets.", t: "Fit-to-target with N-up. Useful for printing 4 pages per Letter sheet for proof reads." },
            { b: "Resizing for accessibility.", t: "Scale up content 130% for low-vision readers. Page size also grows; print may need to use a larger paper size." },
            { b: "Standardizing a mix of page sizes.", t: "Page size change all to one target. Don't scale — let each page's content fit naturally on the new uniform paper size." },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that produce unusable resized PDFs:",
        ],
        list: {
          items: [
            { b: "Confusing page size change with content scale.", t: "If you change A4 to Letter without scaling, the content stays the same size; only the paper changes. Don't expect the content to grow." },
            { b: "Scaling content with text under 7pt.", t: "Below that threshold, text becomes unreadable. Either pick a less aggressive scale or accept that some content will be illegible." },
            { b: "Ignoring aspect ratio.", t: "A 16:9 slide-deck PDF won't fit a 3:4 page without padding or cropping. Pick which loss you'd rather take." },
            { b: "Resizing then signing.", t: "Resizing rewrites the file. Cryptographic signatures break. Sign after final size is set." },
            { b: "Forgetting to update the file's page-size metadata.", t: "Some workflows route based on page size (Letter → US printer queue, A4 → EU printer queue). The resize tool updates this; manual scripts often don't." },
          ],
        },
      },
      {
        h: "Tips for the cleanest resize",
        p: [
          "Practical adjustments:",
        ],
        list: {
          items: [
            { b: "Always preview before exporting.", t: "Resize is one of those operations where the result is obvious only after you've done it. Use the preview to confirm content fits and stays readable." },
            { b: "Pick the right anchor.", t: "Center, top-left, or top-center anchor changes where content lands when the page changes size. Center is the safe default; top-left for letterheads." },
            { b: "Add bleed for print bound output.", t: "Print-house ready PDFs need 3mm bleed around the page. Set the bleed in the resize options." },
            { b: "Standardize once, not iteratively.", t: "If you'll resize the same set of files repeatedly (e.g., every monthly report), build a Macro so the parameters stay consistent." },
            { b: "Check dpi after.", t: "Scaling content effectively raises or lowers its perceived DPI. After a 70% scale, what was 300 DPI is now 430 DPI — fine. After a 150% scale, what was 300 DPI is now 200 DPI — still fine. Below 150 DPI: warning territory." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free tool: any PDF up to 100 MB. Standard page sizes (A0–A6, Letter, Legal, Tabloid, Executive, Statement, plus custom). Output preserves text, vector content, embedded fonts, and most form fields. Cryptographic signatures invalidate on resize and need to be reapplied.",
        ],
      },
    ],
  },

  // ============================================================
  // 20. compare-pdfs
  // ============================================================
  "compare-pdfs": {
    title: "How to compare two PDFs — find every change, even when the layout shifted",
    intro:
      "Comparing PDFs sounds straightforward — show me what changed. The reality is messier: did a paragraph move, or did it get rewritten? Did a table get reformatted, or did its data change? Did the date update, or did the whole calendar quarter shift? Good PDF diffing distinguishes structural changes from content changes from formatting changes — and lets you act on each separately.",
    sections: [
      {
        h: "How PDF diffing works",
        p: [
          "We extract the text from both PDFs along with structural information (paragraphs, tables, headings, page boundaries). A two-pass diff first aligns common content — paragraphs that are identical or nearly so — and then identifies what changed in the gaps. The output is a redline document showing additions, deletions, and substitutions, plus a structured summary of changes by section.",
          "AI-powered comparison adds a layer on top: classify each change by severity (typo vs. material change vs. clause restructuring), and explain in plain English what's different. That's the difference between 'paragraph 3 shows N edits' and 'paragraph 3's notice period changed from 30 days to 60 days, increasing the buyer's exposure'.",
        ],
      },
      {
        h: "When PDF compare is the right tool",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Contract redlines.", t: "Counterparty sent back V2 — what did they actually change? Compare V1 to V2 and read the diff." },
            { b: "Policy revisions.", t: "Internal handbook updated; what's new from last year's version?" },
            { b: "Specification changes.", t: "Engineering spec revised; flag what's actually different." },
            { b: "Regulatory filings.", t: "Annual filings with last year's text amended — the difference is what's new this year." },
            { b: "Translation review.", t: "English vs. translated version — does each paragraph correspond properly?" },
          ],
        },
      },
      {
        h: "Common mistakes",
        p: [
          "Patterns that produce diff results that aren't useful:",
        ],
        list: {
          items: [
            { b: "Comparing PDFs with different formatting.", t: "Reformatting (font change, page size change, column adjustment) produces hundreds of false-positive 'changes' that aren't really content changes. Run normalize-formatting first." },
            { b: "Comparing without OCR on scans.", t: "If one or both inputs is a scan with no text layer, the diff has nothing to compare. OCR both first." },
            { b: "Ignoring the severity classification.", t: "AI compare classifies each change as cosmetic, material, or critical. Read the critical ones first; skip the cosmetic ones." },
            { b: "Comparing the wrong versions.", t: "If you compare V3 to V5, you miss the V4 → V5 changes mixed with the V3 → V4 changes. Compare consecutive versions for clarity." },
            { b: "Trusting the diff for legal certainty.", t: "Diffs are aids, not authority. For high-stakes contracts, have counsel review the diff and the full document." },
          ],
        },
      },
      {
        h: "Tips for the best diff",
        p: [
          "Habits that produce more useful comparisons:",
        ],
        list: {
          items: [
            { b: "Normalize first.", t: "Run both inputs through Normalize to standardize fonts, page sizes, and spacing. The diff is sharper." },
            { b: "Use the severity filter.", t: "Filter to 'material changes only' for a 30-second scan; turn it off for a full review." },
            { b: "Export the diff as a redline DOCX.", t: "Easier to share with non-technical reviewers than the PDF redline." },
            { b: "Combine with chat.", t: "After running compare, ask 'summarize the most material changes' to get a paragraph you can paste into your status update." },
            { b: "Save the comparison.", t: "If you'll need this comparison again, save the diff alongside the source documents in your DMS." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Free preview: simple text diff for up to 10 pages. AI compare with severity classification: 15 credits per diff up to 100 pages. Output: redline PDF, redline DOCX, structured JSON of changes, and a plain-English summary. Compatible with every reader; the redline PDF works in Acrobat, Preview, and every browser.",
        ],
      },
    ],
  },

  // ============================================================
  // rotate-pdf — high-traffic free tool, added 2026-05-11
  // ============================================================
  "rotate-pdf": {
    title: "How to rotate a PDF the right way — lossless, in seconds, no quality loss",
    intro:
      "Rotating a PDF is the single most-searched fix for paper that was scanned in the wrong direction. The right tool does it in milliseconds, preserves the original bytes intact, and produces a file that opens cleanly in every reader. The wrong tool re-renders each page as an image and triples your file size. Here is what the rotation step actually does, when it works perfectly, and the two situations where you need a different tool.",
    sections: [
      {
        h: "How rotation works under the hood",
        p: [
          "Every page in a PDF has a small piece of metadata called the /Rotate attribute. It carries a single number — 0, 90, 180, or 270 — that tells the viewer how to orient the page at display time. The actual page content (text, vectors, images) stays in its original coordinate system; the viewer applies the rotation when it renders. That is why our tool can change a page's orientation by editing only that one attribute, leaving the entire page content stream untouched.",
          "The practical result is that rotating 500 pages takes about as long as rotating one. There is no re-rendering, no re-encoding, no quality loss. Text stays selectable. Links stay clickable. Hyperlinks, bookmarks, form fields, and embedded media all keep working. File size barely budges — typically you lose a few hundred bytes per rotated page because we tighten the dictionary.",
        ],
      },
      {
        h: "When to reach for Rotate PDF",
        p: [
          "These are the workflows where the lossless rotation is genuinely the right answer:",
        ],
        list: {
          items: [
            { b: "A scanner that fed pages the wrong way.", t: "Document feeders flip pages 180° or 90° relative to whatever you actually want to read. The rotation fixes it in one pass." },
            { b: "Mixed-orientation reports.", t: "A landscape spreadsheet stuck inside a portrait monthly review. Select just those pages and rotate them so the whole document scrolls cleanly in one orientation." },
            { b: "PDFs created from photos.", t: "Phone cameras embed orientation EXIF that survives into the PDF as /Rotate. Sometimes the EXIF is wrong; rotating the PDF takes one click instead of editing the source images." },
            { b: "Forms that were scanned upside-down.", t: "Especially common with hand-scanned tax forms, immigration paperwork, and medical records where the form ended up on the platen face-up by accident." },
            { b: "Print-ready files for a press shop.", t: "Some print shops require all pages to be portrait-up regardless of layout. Rotate first; the press accepts the bundle." },
          ],
        },
      },
      {
        h: "The two cases where you need a different tool",
        p: [
          "Rotation is a 90° increment operation. There are two situations where it cannot help and a different tool is the right call:",
        ],
        list: {
          items: [
            { b: "Scanner skew — a slight angle that is not 90°.", t: "Pages that came out 2°, 5°, or 12° off don't need rotation; they need deskew. Deskew has to re-render the page bitmap to apply a sub-90° rotation, which means it re-rasterizes (and loses a small amount of detail). Our AI · Deskew tool handles this — but use it only when actual skew is present, not for the 90° rotations that the free rotate tool covers losslessly." },
            { b: "Mirrored or flipped pages.", t: "A scanner with a faulty mirror can produce horizontally-flipped pages. /Rotate cannot flip; it can only rotate. You either need to rescan or run the page through an image-flip step in a raster editor. There is no lossless fix because the underlying PDF coordinate system is right-handed; flipping inverts it." },
          ],
        },
      },
      {
        h: "Five tips for the cleanest rotation result",
        p: [
          "These small habits make the rotation step go faster and produce more polished output:",
        ],
        list: {
          items: [
            { b: "Render the thumbnails before deciding.", t: "Our tool shows every page as a thumbnail so you can see at a glance which need rotation. Trust the picture, not the page number — readers describe rotation problems incorrectly all the time." },
            { b: "Range-select with Shift-click.", t: "If pages 3 through 12 all need the same rotation, click page 3, then Shift-click page 12 to highlight the whole range in one move. Much faster than ten individual clicks." },
            { b: "Mix rotations in successive applies.", t: "Need pages 1-3 turned 90° and pages 4-5 turned 180°? Select the first set, apply 90°, then download the intermediate. Re-drop and apply 180° to the second set. The file size penalty is zero because the operations are stacked, not redone." },
            { b: "Pair with Sort Pages for messy scans.", t: "If your scanner produced both wrong order and wrong rotation, run Sort Pages first to get the order right, then Rotate to fix orientation. Doing both in one tool would require modeling page-level dependency that no scanner-fix tool actually needs." },
            { b: "Verify in the browser before sharing.", t: "Some viewers (older Acrobat builds) ignore /Rotate when printing but honor it on screen. Open the rotated PDF in Chrome or Firefox to see exactly what it will look like on screen, and run a one-page test print if it matters." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, rotation handles PDFs up to 100 MB with no page-count cap. The rotation runs entirely in your browser via pdf-lib; nothing is uploaded. Output is byte-for-byte compatible with every viewer since Acrobat 5 (2001), every browser PDF viewer, every printer that takes PDF, and every cloud storage provider that lets you upload PDFs. The rotated file is still PDF/A-compatible if the input was; we do not strip metadata.",
          "Because /Rotate is a metadata-only change, downstream tools like merge, split, extract-pages, and OCR all see the rotated page in its visual orientation rather than its underlying coordinate system. That is the right behavior — if you rotated a page so the text reads correctly, OCR should read the text in that orientation too.",
        ],
      },
    ],
  },

  // ============================================================
  // unlock-pdf — high-traffic free tool, added 2026-05-11
  // ============================================================
  "unlock-pdf": {
    title: "Unlock PDF — what \"unlocking\" actually means, and when it works",
    intro:
      "\"Unlock PDF\" is one of the most-searched PDF queries on Google, and one of the most misunderstood. There are two completely different kinds of PDF protection, and the right tool depends on which one you are facing. Pick the wrong tool and you waste time on a file the tool cannot help with. Here is what each kind of protection means, when our tool helps, and what to do when it cannot.",
    sections: [
      {
        h: "Two kinds of PDF protection",
        p: [
          "Every encrypted PDF has either a user password, an owner password, or both. Knowing which one your file uses determines whether any unlock tool can help.",
        ],
        list: {
          items: [
            { b: "User password (also called open password).", t: "This is the password the PDF prompts for before showing any content. The file is genuinely encrypted — the entire byte stream is unreadable without the password. No tool can bypass this without the password itself, because there is no way to read what was encrypted. If you do not have the password, you do not have the file's content." },
            { b: "Owner password (also called permissions password).", t: "This is a restriction layer on a file that opens normally. The file is readable, but the PDF dictionary carries flags that tell viewers to disable printing, copying text, editing, filling forms, or extracting pages. The file is technically not encrypted — those restrictions are an honor system that viewers like Acrobat choose to enforce. Removing those flags restores full functionality." },
          ],
        },
      },
      {
        h: "What our Unlock tool does",
        p: [
          "Our free Unlock PDF tool removes owner-password restrictions. It parses the PDF's /Encrypt dictionary, strips the permissions flags (no-print, no-copy, no-edit, no-fill-forms, no-extract-pages, no-modify-annotations), and writes a fresh file with no restrictions. The original page contents — text, images, vectors, fonts — are unchanged. File size barely changes; you lose maybe 200 bytes from the dropped dictionary entries.",
          "The unlocked file opens normally in every viewer because the only thing removed was the restriction metadata. Print quality is identical to the source. Copy-paste works. Form fields fill in. The original page bytes never moved.",
        ],
      },
      {
        h: "What to do when the file needs a user password",
        p: [
          "If your file prompts for a password before showing content, the unlock tool cannot help — but several adjacent tools might:",
        ],
        list: {
          items: [
            { b: "Ask the document's creator.", t: "Almost every \"locked PDF\" problem turns out to be \"I lost the password.\" Asking the sender is usually faster than any tool. Most enterprise environments have a key escrow for this." },
            { b: "Try the AI · OCR tool on a printed copy.", t: "If you can open the PDF on a device that has the password cached, print it to PDF and run that copy through OCR. This is legitimate if you own the document and just need access on another device." },
            { b: "Check whether the password is the document's date or title.", t: "An enormous number of PDFs use predictable patterns: birthdate, filename, last 4 digits of an ID. Especially common with bank statements and utility bills delivered via email." },
            { b: "Use the actual password if you have it.", t: "Adobe Acrobat (paid), Preview on macOS, Foxit, and many other tools accept a password and produce a decrypted copy. Once decrypted, our other tools can process the file." },
          ],
        },
      },
      {
        h: "Legal and ethical considerations",
        p: [
          "Removing owner-password restrictions on a PDF you legitimately own is generally legal in most jurisdictions. The DMCA Section 1201 in the United States, and equivalent laws elsewhere, prohibit circumventing technological protection measures on copyrighted works you do not own — that is a serious matter and not something any of our tools is designed for.",
          "In practice, this means: unlock your own scanned ID for upload to a government portal, fine. Unlock a bank statement you received via email so you can print it, fine. Unlock a third-party ebook or a confidential document you obtained without authorization, not fine — both legally and ethically. Use this tool on files where you are the rightful owner or have explicit permission.",
        ],
      },
      {
        h: "Five common situations where Unlock is the right tool",
        p: [
          "The cases that show up most often in support tickets and search logs:",
        ],
        list: {
          items: [
            { b: "Cannot print a bank statement.", t: "Banks often issue PDFs with print disabled to discourage redistribution. Unlock restores printing for personal use." },
            { b: "Cannot copy a quote from a research paper.", t: "Some publishers disable text selection. Unlock removes the restriction; the underlying text was always there." },
            { b: "Cannot fill a government form's fields.", t: "Older government forms sometimes ship with no-modify restrictions that block typing into form fields. Unlock removes that flag." },
            { b: "Cannot combine a restricted PDF in a merge.", t: "Some PDF tools refuse to merge a file with restrictions set. Unlock first, then merge." },
            { b: "Cannot extract pages from a contract for inclusion in another bundle.", t: "Same root cause as the merge case. Unlock to remove the restriction, then extract." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, Unlock handles owner-password PDFs up to 100 MB with no page-count cap. Processing runs entirely in your browser via pdf-lib; the file never leaves your machine. Output is byte-compatible with every viewer that opened the input, and it carries forward every other metadata field (title, author, creation date) untouched.",
          "The tool refuses to operate on user-password files — if you upload one, you will see an error explaining the difference. That is by design. We are not in the business of breaking encryption, only of removing the honor-system permissions layer that some PDF generators apply to files anyone can already read.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-pdf-pages — head term, paired with delete-pdf-pages
  // ============================================================
  "extract-pdf-pages": {
    title: "Extract PDF pages — keep exactly the pages you need, in the order you want",
    intro:
      "Extracting pages from a PDF sounds simple, and on the surface it is — pick the pages, get a smaller PDF. The friction is in what \"pick the pages\" actually means: a range syntax that supports comma-separated single pages and dash-separated ranges, with order preserved exactly as you typed it. Pair that with the fact that extract and split look identical at first glance and you have one of the most-confused operations in any PDF toolbox. Here is what extract does, when it is the right tool, and how to spec the pages you actually want.",
    sections: [
      {
        h: "What extract pages does that split doesn't",
        p: [
          "Extract and Split look related but produce different shapes of output. Split takes one PDF and produces several — one output file per range you specify. Extract takes one PDF and produces one new file — a combined output with only the pages you wanted, glued together. If you want pages 1-3 plus pages 8-10 as a single 6-page deliverable, you want Extract. If you want pages 1-3 and pages 8-10 as two separate files, you want Split.",
          "The other practical difference: Extract honors the order you list. Type \"5, 1, 3\" and you get pages 5, 1, 3 in that exact order — useful for reordering small selections without going through the visual sort tool. Split, by contrast, always emits files in document order regardless of how you typed the ranges.",
        ],
      },
      {
        h: "How to spec the pages you want",
        p: [
          "The range syntax is short enough to learn in a minute, expressive enough to cover every reasonable selection. Each comma-separated chunk is either a single page or a dash-separated range. Order is preserved as typed.",
        ],
        list: {
          items: [
            { b: "1-5", t: "Pages 1, 2, 3, 4, 5 in order. A simple range." },
            { b: "1, 3, 5", t: "Pages 1, 3, 5 — every other page from the top, by hand." },
            { b: "1-3, 8-10", t: "Pages 1, 2, 3, 8, 9, 10 — two ranges combined." },
            { b: "5, 1, 3", t: "Pages 5, 1, 3 — out-of-order on purpose. Output has those pages in that exact order." },
            { b: "1-3, 7", t: "Mix range with single — 1, 2, 3, 7." },
            { b: "1-N", t: "Whole document. (N is the last page; the form accepts the literal letter N as shorthand.)" },
          ],
        },
      },
      {
        h: "Common real-world uses",
        p: [
          "Extract earns its keep in scenarios where you need to slice content but produce a single coherent deliverable:",
        ],
        list: {
          items: [
            { b: "Send just the relevant pages of a contract.", t: "Extract the signature page + amendment clauses; share the 4-page extract instead of the 80-page master." },
            { b: "Build a study deck from a textbook.", t: "Extract pages 12-18 + 47-52 + 110-115 into one 18-page PDF you can annotate without dragging around the whole book." },
            { b: "Re-order a deck for a different audience.", t: "Pull slides 3, 8, 1, 6, 12 in that order to build a 5-slide talk track from a 30-slide master deck." },
            { b: "Isolate the page you actually need.", t: "Extract just page 47 of a 500-page report — open Extract, type \"47\", download. Faster than scrolling and screenshotting." },
            { b: "Build a cover letter + relevant resume sections.", t: "Extract your cover letter page, plus the resume's relevant experience block, into one 2-page submission." },
          ],
        },
      },
      {
        h: "Things that will catch you out",
        p: [
          "The friction points new users hit most often:",
        ],
        list: {
          items: [
            { b: "Page numbers in the PDF vs the document's printed page numbers.", t: "Extract uses physical page positions, not printed page numbers. If your document has a 5-page front matter (Roman i-v) before the body (1, 2, 3…), \"extract pages 1-3\" gives you the front matter, not the chapter you wanted. Add the front-matter offset (i.e. extract \"6-8\" for the first three numbered pages)." },
            { b: "Trailing commas and spaces.", t: "Most PDF tools choke on trailing whitespace or commas. Ours doesn't, but it is worth typing the range cleanly so the next tool you use doesn't break." },
            { b: "Overlapping ranges.", t: "If you type \"1-5, 3-7\" you get pages 1, 2, 3, 4, 5, 3, 4, 5, 6, 7. The same pages appear twice. Usually a typo — review the spec before clicking apply." },
            { b: "Out-of-range page numbers.", t: "Asking for page 200 in a 50-page document produces an error. We show the document's page count near the input so you can sanity-check the spec." },
          ],
        },
      },
      {
        h: "Why extract preserves quality",
        p: [
          "Like rotate, extract is a structural rather than rendering operation. We parse the input's page tree, copy the page objects you selected to a new PDF, and rebuild the cross-reference table. Page contents are transplanted byte-for-byte: text stays selectable, vector graphics stay sharp, embedded fonts come with their pages, scanned images keep their resolution. The output file is the natural size for the page count you extracted — typically a fraction of the input, scaled by the fraction of pages kept.",
          "Annotations, hyperlinks, and form fields on extracted pages survive the extract. Hyperlinks that pointed to a different page of the original PDF are remapped: if the original page 5 linked to page 12, and you extracted only page 5, that link now points to nothing (the target is no longer in the file). Hyperlinks to external URLs survive unchanged. Bookmarks are pruned to match the new page set.",
        ],
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, extract handles PDFs up to 100 MB with no page-count cap. Processing runs entirely in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF viewer since Acrobat 5. The extracted PDF is structurally a fresh, independent file — no link to the original, no embedded reference. You can rename it, share it, or pass it through further processing with no concerns about the source.",
          "Common next steps: pair with Merge to combine extracts from multiple source PDFs into one bundle, or with Page Numbers to add fresh numbering to the extracted set (the original page numbers no longer correspond to the page positions in the new file).",
        ],
      },
    ],
  },

  // ============================================================
  // delete-pdf-pages — paired with extract-pdf-pages
  // ============================================================
  "delete-pdf-pages": {
    title: "Delete PDF pages — remove what you don't need, keep everything else exactly where it was",
    intro:
      "Delete pages is the inverse of extract: instead of specifying what to keep, you specify what to drop. For long documents with a few stray pages — a misplaced cover, a duplicate scan, a draft section that did not make the final cut — the delete operation is the cleanest way to produce a tighter PDF without re-typing the whole keeper list. Here is how it works, when to reach for it instead of extract, and the safety net that keeps you from accidentally emptying the document.",
    sections: [
      {
        h: "Delete vs extract — when to use each",
        p: [
          "Both tools end at the same place — a smaller PDF containing only the pages you wanted. The difference is which list is easier to type:",
        ],
        list: {
          items: [
            { b: "Use Delete when the drop list is short.", t: "A 50-page document where you want to remove pages 12 and 37. Typing \"12, 37\" is one second; typing the equivalent extract spec (\"1-11, 13-36, 38-50\") is annoying and error-prone." },
            { b: "Use Extract when the keep list is short.", t: "A 50-page document where you want pages 5, 7, and 22. Typing \"5, 7, 22\" is straightforward; typing the delete equivalent would mean enumerating 47 page numbers." },
            { b: "Use Extract when order matters.", t: "Delete preserves the original page order with the deleted pages removed. If you need to reorder pages, use Extract — it honors the order you type." },
          ],
        },
      },
      {
        h: "How to spec the pages to delete",
        p: [
          "Same range syntax as extract. Comma-separated chunks; each chunk is a single page or a dash-separated range.",
        ],
        list: {
          items: [
            { b: "3", t: "Delete just page 3." },
            { b: "3, 5", t: "Delete pages 3 and 5." },
            { b: "3, 5-7", t: "Delete pages 3, 5, 6, 7." },
            { b: "3, 5-7, 12", t: "Delete pages 3, 5, 6, 7, 12." },
            { b: "1", t: "Drop the front matter / cover page. Common cleanup pass after a Word-to-PDF export that includes a blank first page." },
            { b: "N", t: "Drop the last page (where N is the page count). The form accepts the literal letter N as shorthand." },
          ],
        },
      },
      {
        h: "The safety net — we won't let you empty the document",
        p: [
          "If your delete spec would remove every page in the PDF, we stop and show an error. There is no useful version of a 0-page PDF; the operation would just fail anyway when you tried to open the output. The safety net catches the most common cause of this — a delete spec like \"1-N\" that is meant for some other tool — before it ruins your file.",
          "You can delete N-1 pages out of N (leaving just one page) without any objection. The minimum keeper count is 1.",
        ],
      },
      {
        h: "What you can safely delete and what you can't undo",
        p: [
          "The delete operation produces a new file; your original is untouched on your machine. Keep both files until you have verified the output, then move the original to an archive folder or trash if you no longer need it.",
        ],
        list: {
          items: [
            { b: "Deleted pages remove everything on those pages.", t: "Text, images, annotations, hyperlinks, form fields, embedded resources — all gone from the output. If you wanted to keep an annotation on a deleted page, copy it out before deleting." },
            { b: "Cross-references on remaining pages update.", t: "A bookmark that pointed to deleted page 5 is pruned. A hyperlink from page 8 that pointed to (now-deleted) page 5 becomes a no-op (the target is gone). External URL hyperlinks survive untouched." },
            { b: "Page numbering does not auto-renumber.", t: "If you delete page 3 of a document with printed page numbers, the printed numbers on the remaining pages stay as they were — page 4 still says \"4\" in its content. Use the Page Numbers tool to renumber the output if needed." },
            { b: "Form fields on remaining pages still work.", t: "Delete only removes the pages you specified; everything else is byte-preserved." },
          ],
        },
      },
      {
        h: "Common real-world uses",
        p: [
          "Where Delete shows up most often in support tickets and analytics:",
        ],
        list: {
          items: [
            { b: "Remove cover/separator pages from a scanner output.", t: "Document scanners often insert a separator page between batches. Drop those pages with a single delete pass before the file goes downstream." },
            { b: "Strip a draft section from a circulated report.", t: "Pages 18-22 are the methodology appendix that the executive audience does not need. Delete them; share the slimmer version." },
            { b: "Remove duplicate pages from a re-scanned document.", t: "If your feeder picked up the same page twice, drop the duplicate. Pair with PDF Inspector first to spot which pages are the duplicates." },
            { b: "Cut blank pages.", t: "Many scanners or printer-to-PDF flows leave a blank trailing page. Delete the last page in one click." },
            { b: "Redact a confidential section.", t: "If you are sharing a document but a particular section should not go with it, deleting those pages is the cleanest approach — far stronger than a black bar. The pages are gone from the file's structure entirely, not just hidden visually." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, delete handles PDFs up to 100 MB with no page-count cap. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every reader. The deleted-page version is structurally a fresh PDF — you can pass it through any of our other tools (merge, compress, OCR, watermark) without worrying about state carried from the original.",
          "Common next steps: pair with Page Numbers to renumber after delete, or with Bookmarks to clean up the outline if the deleted pages had bookmark targets.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-text — head term, very high search volume
  // ============================================================
  "pdf-to-text": {
    title: "PDF to text — what extraction actually pulls out and what it can't",
    intro:
      "Extracting the text from a PDF sounds like one of the most basic operations imaginable — and for text-based PDFs it really is. The complication is that PDFs come in two structurally different forms, and only one of them has \"text\" in any meaningful sense. Pointing the extract tool at the wrong kind silently produces an empty file. Here is how to tell them apart, what the extraction actually returns, and the two patterns that catch new users off guard.",
    sections: [
      {
        h: "The two kinds of PDFs and what each yields",
        p: [
          "Every PDF was either generated digitally (Word, Google Docs, LaTeX, InDesign, browser print-to-PDF) or scanned from a piece of paper. The first kind has a real text layer — each character has a font, a position, and a Unicode codepoint. Extracting text from those PDFs is a fast lookup; you get every word in reading order with high accuracy.",
          "The second kind — scanned PDFs — is structurally a stack of images. There is no text inside the file, just rasterized pixels that happen to look like text to a human eye. Running PDF-to-text on a scan returns an empty file because there is nothing to extract. The fix is to run AI · OCR first to recognize the pixels and produce a searchable PDF, then run PDF-to-text on the result.",
        ],
      },
      {
        h: "How to tell which kind you have",
        p: [
          "Three reliable signals you can check before running the tool:",
        ],
        list: {
          items: [
            { b: "Try selecting text in your PDF reader.", t: "Open the file in Preview, Acrobat, or a browser. Click and drag to select a paragraph. If the selection highlights individual words, you have a text-based PDF. If it highlights the whole page rectangle, you have a scan." },
            { b: "Try Ctrl-F / Cmd-F to search.", t: "Search for a word you can see on the page. If the find function highlights matches, the PDF has a text layer. If it says \"no matches\" for a word that is plainly visible, the PDF is a scan." },
            { b: "Run PDF Inspector first.", t: "Our PDF Inspector tool reports whether the file has a text layer, what fonts are embedded, and how much extractable text is on each page. Five seconds saves you the wrong-tool round trip." },
          ],
        },
      },
      {
        h: "What the output looks like",
        p: [
          "The extracted text comes back as a plain UTF-8 .txt file. Layout is flattened to reading order — multi-column pages are linearized, so a two-column research paper reads column-1-then-column-2 rather than line-by-line across the gutter. Tables are extracted in row-by-row order; if the cell content fits, you get something usable, but complex tables can produce jumbled output (use PDF-to-Excel instead for those).",
          "Page breaks are marked with a form-feed character (\\f, ASCII 0x0C) by default, so you can split the output into per-page sections. Headers and footers are usually pulled out; if a particular header or footer is rendered as a vector decoration (image, line drawing), it is not part of the text layer and does not appear in the extract.",
        ],
      },
      {
        h: "When PDF-to-text is the right tool",
        p: [
          "The cases where plain text is exactly what you need:",
        ],
        list: {
          items: [
            { b: "Feeding a search index.", t: "Most search engines and RAG systems ingest plain text. PDF-to-text is the canonical extraction step before chunking and embedding." },
            { b: "Word-counting or readability scoring.", t: "Need to know how long a document is? Extract to text, then word-count. Faster and more reliable than asking a PDF reader." },
            { b: "Pasting a section into a doc.", t: "When you need to quote a paragraph from a PDF into a Word doc, extracting to text gives you clean prose without the PDF's formatting baggage." },
            { b: "Diffing two text documents.", t: "If you want to compare two PDFs by content rather than appearance, extract both to text and run a normal text diff. Faster than a visual diff for substantive change detection." },
            { b: "Pre-processing for AI.", t: "Whenever you want to send a PDF's content to an LLM as context, plain text is the densest and most reliable format. The model ignores positional information anyway." },
          ],
        },
      },
      {
        h: "Two patterns that surprise people",
        p: [
          "The friction points that show up in support tickets:",
        ],
        list: {
          items: [
            { b: "Decorative headers come out as Unicode garbage.", t: "If a PDF used a custom decorative font (a logotype, an icon-font headline) without proper Unicode mappings, those glyphs show up in the extract as private-use-area characters or empty boxes. The fix is upstream — embed Unicode-compliant fonts when generating the PDF — or run AI · OCR on a rendered copy of the PDF, which transcribes from the visible pixels and produces clean Unicode." },
            { b: "Hyphenated line breaks become hyphens-plus-spaces.", t: "PDFs that justify long lines often hyphen-break a word across two lines. The extractor preserves the hyphen and the line break, so \"hyphen-ated\" comes out as two tokens. Most search systems handle this; if yours doesn't, post-process the text to rejoin words split across newlines." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF-to-text handles files up to 100 MB with no page-count cap. PDFium runs in WebAssembly in your browser — nothing leaves your machine. Output is plain UTF-8 .txt that opens cleanly in every editor, every search-engine indexer, and every programming language's standard library.",
          "If the input is a scan (no text layer), the tool tells you so and points you to AI · OCR. If you want both a searchable PDF and a plain-text export, run AI · OCR first to produce the searchable PDF, then run PDF-to-text on the output for the .txt.",
        ],
      },
    ],
  },

  // ============================================================
  // crop-pdf — head term, /CropBox mechanism
  // ============================================================
  "crop-pdf": {
    title: "Crop PDF — what cropping actually does, and why it's (usually) reversible",
    intro:
      "Cropping a PDF is one of those operations where what the user sees and what is actually happening underneath are different in a way that matters. Most cropping tools — including ours — do not remove the cropped content; they hide it behind a viewport. That has surprising consequences: it is reversible (great), but it is not a redaction technique (important to know). Here is exactly what the crop tool does, when that is the right behavior, and the two cases where you need a different approach.",
    sections: [
      {
        h: "/CropBox vs MediaBox — the crop's mechanism",
        p: [
          "Every PDF page has at least two coordinate rectangles in its dictionary. /MediaBox is the page's physical paper size — the actual rectangle of the page itself. /CropBox is the visible viewport — the rectangle that viewers display. By default they are identical: the whole page is shown. When you crop a PDF, the tool sets /CropBox to a smaller rectangle inside /MediaBox. Viewers honor /CropBox and show only the cropped area. The original page bytes — text, images, vectors outside the crop — are still there, just clipped at display time.",
          "That is why cropping is reversible. Acrobat Pro, pdf-lib, qpdf, and most other PDF tools can read /CropBox and reset it to /MediaBox, restoring the full original view. Nothing was removed; only the viewport changed.",
        ],
      },
      {
        h: "When viewport-style cropping is the right answer",
        p: [
          "The non-destructive nature of /CropBox is a feature, not a bug — for the cases where users actually want cropping:",
        ],
        list: {
          items: [
            { b: "Trimming scanner edges.", t: "Flatbed scanners often capture 2-5 mm of black border around the page. Crop trims that border for cleaner-looking pages. The black-border bytes are still in the file, but no one will ever see them." },
            { b: "Removing page numbers, headers, or footers for export.", t: "If you want to use a page as an image inside another doc without its surrounding chrome, crop the chrome away. The original PDF keeps the headers; the cropped version hides them." },
            { b: "Normalizing print margins across mixed scanners.", t: "When scans from different machines have different white margins, cropping each to the same content area gives uniform output. Pair with Resize to standardize the final paper size too." },
            { b: "Creating a focused excerpt for embedding.", t: "Need just the chart from a research paper for your slide deck? Crop to the chart's bounding box and the resulting PDF is a single-chart asset you can drop in anywhere." },
            { b: "Repurposing a multi-section page.", t: "A page with three article columns can be cropped to one column at a time, producing three separate single-column PDFs. Run the crop tool three times with different rectangles." },
          ],
        },
      },
      {
        h: "The two cases where viewport-style cropping is wrong",
        p: [
          "Because /CropBox is reversible and the original bytes remain in the file, there are two situations where you need a different tool entirely:",
        ],
        list: {
          items: [
            { b: "Redacting sensitive content.", t: "If your goal is to hide information from anyone who receives the file, viewport cropping is unsafe. The hidden bytes are right there in the file, recoverable by anyone with a PDF editor. Use the Redact tool instead — it overwrites the content bytes with black bars and removes any underlying text from the page's content stream. For maximum certainty, follow with PDF Inspector to verify no traces remain." },
            { b: "Reducing the file size meaningfully.", t: "Crop barely changes the file size — it adds a few bytes of /CropBox dictionary per page and leaves the page contents intact. If you want a smaller file, the original full-page content streams are still doing the work. Use Compress (lossy image re-encoding) instead." },
          ],
        },
      },
      {
        h: "Same-crop-on-every-page — why we ship it this way",
        p: [
          "Our crop tool applies the same rectangle to every page in the document. That is a deliberate choice: 95% of cropping use cases want consistent margins across the whole file, and a per-page UI would be considerably more complex and slower. If your pages genuinely need different crops, the workflow is:",
        ],
        list: {
          items: [
            { b: "Run Split or Extract Pages first.", t: "Separate the pages into groups that share a crop rectangle. Each group goes into its own PDF." },
            { b: "Crop each group with its own rectangle.", t: "Open each group's PDF and apply the crop appropriate for that group." },
            { b: "Merge the cropped groups back together.", t: "Use the Merge tool to combine the per-group cropped PDFs in the original order. The result is a single PDF with per-page-group crops applied." },
          ],
        },
      },
      {
        h: "Tips for crisp results",
        p: [
          "Small habits that make the crop step go smoothly:",
        ],
        list: {
          items: [
            { b: "Use page 1 as your visual reference, but check the rest.", t: "If pages later in the document have different margin patterns (chapter starts, figure pages, etc.) the same crop may clip them differently. Scroll through after applying to catch outliers." },
            { b: "Round the rectangle to nice numbers.", t: "Crop rectangles get embedded as floating-point coordinates. Snapping to the nearest 1mm or 1/8 inch keeps the output looking intentional." },
            { b: "Crop BEFORE adding page numbers or watermarks.", t: "Page numbers and watermarks added to a cropped PDF land relative to /CropBox, which is what you want. Adding them first and then cropping can clip the page numbers." },
            { b: "Save the original.", t: "Because crop is non-destructive on the source, you do not need to keep an extra copy — but it does not hurt either. If the cropped output is for a specific deliverable, keep the original around for later re-crops with different rectangles." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, crop handles PDFs up to 100 MB with no page-count cap. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF viewer — /CropBox has been a part of the PDF specification since version 1.0 (1993).",
          "If you need TRULY destructive cropping (the bytes outside the crop actually removed from the file), Acrobat Pro has a \"Crop and Save\" option with a \"Remove cropped content\" toggle. Our tool intentionally does not offer that path because the non-destructive default is the right behavior 95% of the time — and the irreversibility of the destructive version causes more user pain than it prevents.",
        ],
      },
    ],
  },

  // ============================================================
  // excel-to-pdf — head term, Office conversion family
  // ============================================================
  "excel-to-pdf": {
    title: "Excel to PDF — what conversion preserves, what it loses, and how to keep your tables readable",
    intro:
      "Excel-to-PDF is one of the simpler-sounding conversions that hides real friction in the details. The output is a static snapshot of your workbook — formulas become their last-computed values, dynamic charts become flat images, and the page boundaries that Excel chose at render time are baked in. Most of the time, that is exactly what you want. The other times, knowing what is happening lets you fix the output instead of redoing the conversion. Here is what the converter does, what it can't do, and the five settings inside Excel that have outsized impact on the resulting PDF.",
    sections: [
      {
        h: "What the conversion actually preserves",
        p: [
          "Every worksheet in your file becomes one or more pages in the output PDF. The order matches the order of tabs in the workbook. Within each sheet, the converter walks every used cell and renders text, number, formula result, formatting (bold / italic / font / color), borders, fills, and merged cells exactly as Excel would print them. Print area settings (File → Print Area) are honored — if you defined a print area on a sheet, only that region appears in the PDF. Sheets that are hidden in Excel are skipped by default.",
          "Charts and shapes embedded on a worksheet render as static images at their on-screen size. Pivot tables become their currently-displayed snapshot — the underlying data and filter state are gone from the output. Data-validation drop-downs are flattened to whatever value the cell currently contains. Conditional formatting is rendered as plain formatting at the moment of export, not as live rules.",
        ],
      },
      {
        h: "What conversion can't preserve",
        p: [
          "Some Excel features simply do not have a PDF equivalent. Knowing this list ahead of time prevents an hour of debugging \"why is my PDF missing X\":",
        ],
        list: {
          items: [
            { b: "Live formulas.", t: "PDFs are not spreadsheets. Formulas become their currently-computed values. Open the source XLSX if you need to change inputs and re-export." },
            { b: "Macros and VBA code.", t: "Any automation in the workbook is dropped — PDF has no execution model. If your workbook depends on a macro to display certain views, run the macro before converting." },
            { b: "External data connections.", t: "If your workbook pulls from a SQL database, web query, or another file via links, the converter uses the cached snapshot. Refresh the data inside Excel before exporting to PDF so the snapshot is current." },
            { b: "Pivot table interactivity.", t: "Pivots collapse to their current display. The PDF reader cannot drill in, change rows/columns, or re-filter." },
            { b: "Form controls and ActiveX.", t: "Buttons, checkboxes, sliders, and similar controls render as static images of their current visual state." },
          ],
        },
      },
      {
        h: "Five Excel settings that fix 90% of conversion problems",
        p: [
          "Most \"the PDF looks bad\" complaints trace back to settings inside Excel that were never adjusted. Spending two minutes on these before exporting is dramatically faster than fighting the output:",
        ],
        list: {
          items: [
            { b: "Page Layout → Scaling → Fit to Width.", t: "Without this, tables wider than the paper get split across multiple pages with awkward continuation. \"Fit Sheet to One Page\" works for small tables; \"Fit All Columns to One Page\" plus default row scaling works for most. Pick the one that keeps your numbers readable." },
            { b: "Page Layout → Print Titles → Rows to repeat at top.", t: "Set this to your header row so it repeats at the top of every page. Without it, page 2 of a long table has no column labels — anyone reading the PDF has to flip back to page 1 to remember what column means what." },
            { b: "Page Layout → Margins → Custom Margins → Horizontally / Vertically center.", t: "Centers smaller tables on the page rather than nesting them in the top-left corner. Looks dramatically more professional." },
            { b: "Page Layout → Page Setup → Sheet → Gridlines (off).", t: "By default Excel exports the gray gridlines from the worksheet, which look messy in a final deliverable. Apply real borders to the cells you want bordered, then turn gridline export off." },
            { b: "File → Properties → set Title and Author.", t: "These travel into the PDF metadata. Useful when the recipient saves the PDF and you want the file to surface with a proper name in their indexer rather than \"Book1.xlsx\"." },
          ],
        },
      },
      {
        h: "When Excel-to-PDF is the right tool — and when it isn't",
        p: [
          "Useful contexts where the snapshot is genuinely what you want:",
        ],
        list: {
          items: [
            { b: "Distributing a final figure to people who shouldn't edit it.", t: "Quarterly earnings, audited results, board-pack numbers. Static is the point." },
            { b: "Submitting a financial model alongside a narrative document.", t: "Lenders, regulators, and government portals usually require PDF. Convert each sheet, merge them with your narrative." },
            { b: "Printing a workbook.", t: "If the destination is paper, PDF is the right intermediate. Excel's direct-print sometimes paginates differently than the PDF; converting first lets you preview." },
            { b: "Archiving for compliance.", t: "PDF/A is the format regulators and archivists want for long-term retention. Convert to PDF, then run through our PDF/A converter." },
          ],
        },
        // Continuation paragraph would normally go in p[], but we keep the body concise.
      },
      {
        h: "Limits and compatibility",
        p: [
          "The converter handles XLSX, XLS, and the OpenDocument format ODS up to 100 MB per file. Multiple sheets fold into a single multi-page PDF. Output opens cleanly in every PDF reader since Acrobat 5 and is PDF/A-compatible after a separate PDF/A conversion pass.",
          "For larger workbooks, hundreds of sheets, or repeated conversions in a pipeline, the API exposes a batch endpoint that streams workbooks through without per-sheet rendering overhead and supports preserving cell-level hyperlinks where they exist.",
        ],
      },
    ],
  },

  // ============================================================
  // powerpoint-to-pdf — head term, paired Office family
  // ============================================================
  "powerpoint-to-pdf": {
    title: "PowerPoint to PDF — exactly what gets baked in and how to keep the deck legible",
    intro:
      "Converting a PowerPoint deck to PDF is mostly about making the deck shareable with people who do not have PowerPoint — and turning every dynamic element into its static visual form. Animations stop animating, transitions vanish, embedded videos become poster-frame thumbnails, and your speaker notes either come along (if you ask) or stay hidden (the default). Knowing exactly which elements survive what conversion saves rounds of \"why does the PDF look different from my slides?\". Here is the precise list, plus three speaker-note patterns most users overlook.",
    sections: [
      {
        h: "How slide-to-page mapping works",
        p: [
          "Every slide in your deck becomes exactly one page in the output PDF. Slide order is preserved; the PDF page count matches your slide count. The page dimensions match the slide dimensions — a 16:9 deck produces a 16:9 PDF, a 4:3 deck produces a 4:3 PDF, a custom-size deck produces a custom-size PDF. Slide masters and layouts are flattened: by the time the content reaches the PDF, there is no \"master\" layer — every visual element is on the page directly. Hidden slides are skipped by default; toggle the option in the converter if you want them included.",
          "Text on each slide renders as real selectable text in the PDF (so a reader can search and copy quotes from your deck). Fonts are embedded so the PDF looks identical on every device, even when the recipient does not have your custom fonts installed. Vector shapes stay sharp at any zoom level. Raster images preserve their source resolution.",
        ],
      },
      {
        h: "What animation, transitions, and media become",
        p: [
          "PDFs do not animate. Every dynamic element converts to its visual end-state:",
        ],
        list: {
          items: [
            { b: "Builds and animations.", t: "If a slide has an animation that reveals bullets one by one, the PDF shows the final state with every bullet visible. There is no intermediate state. If you want a build-by-build PDF, you have to duplicate the slide once per build inside PowerPoint and convert that expanded deck." },
            { b: "Transitions between slides.", t: "Transitions are page-to-page effects; PDFs do not have them. The reader just turns to the next page." },
            { b: "Embedded video and audio.", t: "Replaced by a single poster frame (the first or current frame of the video). Audio is stripped. If your deck depends on a video to make a point, include a link to the video in your speaker notes and have the converter include them in the PDF." },
            { b: "Hyperlinks.", t: "External URL hyperlinks survive untouched and are clickable in the PDF. Internal slide-to-slide hyperlinks (like a navigation menu) survive too, remapped to point at the right pages." },
            { b: "Embedded Excel and Word objects.", t: "Render as static images of their current visual state. The underlying spreadsheet or doc is gone from the PDF." },
          ],
        },
      },
      {
        h: "Three speaker-note patterns worth knowing",
        p: [
          "Speaker notes are off by default in the conversion. That makes sense for sharing the deck publicly. But there are three layouts users frequently want and rarely remember to turn on:",
        ],
        list: {
          items: [
            { b: "Notes-pages layout — slide above, notes below, one slide per page.", t: "Click Options → Include speaker notes before converting. The PDF then has each slide rendered at half-page size with the notes underneath. Ideal for printing handouts for an audience or for archiving a fully-narrated deck." },
            { b: "Handout layout — multiple slides per page.", t: "If you want the printed handout to fit 3 or 6 slides per page (the classic conference-handout layout) convert to PDF first, then run the result through our N-up tool to repack 3 or 6 slides onto each page. Faster than fighting PowerPoint's handout master." },
            { b: "Notes-only PDF.", t: "Sometimes you want just the narration, not the slides — for example to read on a walk before a talk. Open the deck in Notes Page view, select all the notes, paste into a doc, save as PDF. Or wait for our upcoming Speaker Notes → PDF AI tool, which strips just the narration from any deck." },
          ],
        },
      },
      {
        h: "When PowerPoint-to-PDF is the right tool",
        p: [
          "Cases where the static export is genuinely the right deliverable:",
        ],
        list: {
          items: [
            { b: "Sending a deck to someone without PowerPoint.", t: "PDFs open in any reader on any device. No font substitution headaches, no missing-media errors, no version-compatibility surprises." },
            { b: "Posting a deck publicly.", t: "PDFs are crawlable by Google and indexable by search engines in a way that PPTX files are not. If you want the deck to surface in search, publish the PDF." },
            { b: "Submitting a deck to a portal.", t: "Most conference, grant, and procurement portals want PDF. Convert before submitting." },
            { b: "Archiving a final deliverable.", t: "Once the deck is final, PDF is the right archival format. PDFs do not silently change when the source app updates." },
            { b: "Generating thumbnails or page images.", t: "Pair the PDF output with our Rasterize tool to produce per-slide JPEGs or PNGs for blog posts, social previews, or LinkedIn carousels." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "The converter accepts PPTX, PPT, and OpenDocument ODP up to 100 MB. Keynote files (.key) need to be exported from Keynote as PPTX first; we do not read the native Apple format. Output is PDF 1.7-compatible, opens in every reader, and converts cleanly to PDF/A in a separate pass.",
          "The converter preserves the deck's slide-size dimensions exactly — there is no resize or aspect-ratio change. If you need a different output paper size (Letter, A4) for a print job, convert to PDF first, then use our Resize Pages tool. That two-step approach keeps the slide-correct intermediate around in case you change your mind about paper size.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-png — paired with pdf-to-jpg, lossless page-to-image
  // ============================================================
  "pdf-to-png": {
    title: "PDF to PNG — when lossless beats small, and how to pick the right scale",
    intro:
      "PDF-to-PNG is the right export when you need every pixel preserved exactly — typically for text-heavy pages, screenshots, line art, or anything where JPG's compression artifacts would show up as ringing around character edges. The trade-off is file size: PNG files are typically 3–5× larger than the equivalent JPG. Here is how to think about that trade-off, what scale to pick for which use case, and the two patterns that catch users off-guard.",
    sections: [
      {
        h: "PNG vs JPG — pick by content type",
        p: [
          "The simplest decision rule: PNG when the page is mostly text or vector graphics, JPG when the page is mostly photographs. The reason is how each format compresses. PNG uses lossless DEFLATE compression — exactly reconstructs the input — which means hard edges (the side of a letter, the boundary of a logo) stay sharp at any zoom level. JPG uses lossy frequency-domain compression that produces small files for photographic content but adds visible ringing around hard edges in text or line art.",
          "If you cannot decide, run a one-page test export at both formats at the same scale and look at the output. Open both at 100% and at 200%. The right choice is usually obvious — JPG looks fuzzy around letters, PNG looks crisp; or both look fine and you pick the smaller file.",
        ],
      },
      {
        h: "Picking the right scale",
        p: [
          "The scale multiplier (1×, 2×, 3×) tells the rasterizer how many pixels per PDF point to render. Each step up multiplies the pixel count by 4×, which means the file size also roughly 4×s. Picking the right scale for your end use saves a lot of bytes:",
        ],
        list: {
          items: [
            { b: "1× — screen preview at native size.", t: "Use when the image will only ever be viewed at its natural page size on a standard-DPI screen. The thumbnail panel in your gallery app, a low-res email preview, a quick check on a phone." },
            { b: "2× — retina screens and print at 144 DPI.", t: "The most common pick. Modern phones, tablets, and laptops all have hi-DPI displays where 2× looks crisp. Also matches typical office-printer resolution — print quality is good without going overboard on file size." },
            { b: "3× — archival, hi-res print, marketing assets.", t: "Use when the image will be printed at large physical sizes, used as a hero asset for marketing, or needs to scale beyond its natural size without softening. The file size is 9× the 1× version, which is significant for multi-page exports — only use 3× when you actually need it." },
          ],
        },
      },
      {
        h: "When PDF-to-PNG is the right tool",
        p: [
          "Cases where you genuinely want PNG output rather than another conversion:",
        ],
        list: {
          items: [
            { b: "Embedding a page as an image in a slide deck.", t: "PNGs render losslessly inside PowerPoint or Keynote. The page's text stays crisp at any slide zoom." },
            { b: "Generating thumbnails for a gallery.", t: "Convert every page at 1× scale; use the resulting PNGs as previews in a document library or CMS." },
            { b: "Building a long social-media carousel from a deck or report.", t: "LinkedIn, X, and Instagram all want individual images per slide. Export each page as PNG and upload as a carousel." },
            { b: "Archiving a one-pager for environments that don't render PDF.", t: "Some legacy systems display images but not PDFs. Convert to PNG and embed." },
            { b: "Pre-processing for a different image pipeline.", t: "Need to run each page through a custom image-filter chain, OCR engine, or AI image model? Export to PNG first; downstream tools handle PNG more universally than PDF." },
          ],
        },
      },
      {
        h: "Two patterns that catch people out",
        p: [
          "The friction points that show up in support tickets:",
        ],
        list: {
          items: [
            { b: "Files larger than expected.", t: "A 50-page PDF exported at 3× PNG can easily be 200+ MB. If you're going to publish, archive, or share at that scale, run a separate compression pass on the PNGs (oxipng, pngquant) afterward — those tools can typically reduce PNG size by 30-60% with no visible quality loss. Or drop to 2× scale, which is almost always sufficient." },
            { b: "PNG transparency is preserved, even for white backgrounds.", t: "If your PDF page has a transparent background (rare, but it happens with some printer outputs), the resulting PNG will be transparent too. That looks weird in viewers that expect a white background. If you need a guaranteed white background, flatten the PDF before rasterizing — our Compress tool with the Smaller preset flattens transparency as part of its pass." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF-to-PNG handles files up to 100 MB with no page-count cap. PDFium runs in WebAssembly in your browser; nothing is uploaded. Output PNGs are plain RGBA images compatible with every viewer, every editor, every CMS, every social platform.",
          "Download individual pages or use the Download All option to save every page at once. Zipping the output is on the roadmap; for now the per-page downloads land in your default browser-downloads folder with predictable filenames.",
        ],
      },
    ],
  },

  // ============================================================
  // png-to-pdf — paired with jpg-to-pdf, image-to-pdf flow
  // ============================================================
  "png-to-pdf": {
    title: "PNG to PDF — the right tool for screenshot bundles and what to do about transparency",
    intro:
      "PNG-to-PDF is one of the most-used tools on the site, especially for users assembling screenshot-heavy documentation, multi-page receipts, scanned photos, and quick share-with-anyone bundles. The conversion itself is straightforward — every image becomes one PDF page — but two factors deserve attention before you click convert: how transparency is handled, and how the page dimensions are picked. Get either wrong and the output looks unexpectedly off. Here is what the converter does, the three things worth thinking about before exporting, and when PNG-to-PDF beats the alternatives.",
    sections: [
      {
        h: "How the conversion works",
        p: [
          "Every PNG you drop in becomes exactly one page in the output PDF. The page size is picked by the page-size setting you choose (Letter, A4, or fit-to-image). The image lands on the page either at its native size (\"fit to image\" mode produces a page that exactly matches the image) or scaled to fit inside the page margins. Aspect ratio is always preserved — we never stretch.",
          "The PNG bytes are embedded directly in the PDF — no re-encoding, no quality loss. If your input was a 4000×3000 screenshot, the PDF embeds that exact image. Vector content inside the PNG (if any) is not extracted; PNGs are raster images, so it all stays raster. Multi-page PDFs are produced by concatenating the input images in the order you arranged them (drag to reorder before clicking convert).",
        ],
      },
      {
        h: "Transparency — what happens and how to control it",
        p: [
          "PNG supports an alpha channel; PDF supports transparency too but most viewers render transparent content differently. By default, our converter flattens transparency against a white background. That makes the output look consistent across Acrobat, Preview, Chrome, Firefox, and every other viewer. If you would rather preserve the alpha channel — for example because you intend to overlay the PDF onto a colored background in a print workflow — toggle the option off before converting.",
          "Three specific patterns to watch:",
        ],
        list: {
          items: [
            { b: "Anti-aliased text on transparent background.", t: "Screenshots from design tools often have anti-aliased text with semi-transparent edge pixels. Flattening to white preserves the look in most viewers; preserving alpha can produce subtle fringing in some viewers." },
            { b: "Drop shadows.", t: "Drop shadows are alpha-channel effects. Flattening renders them correctly. Preserving alpha keeps them as alpha and looks right in PDF readers that support transparency (most modern ones)." },
            { b: "Logos on transparent backgrounds.", t: "A logo PNG meant to be placed over different colors needs alpha preserved. A logo PNG meant for a single-color document looks the same flattened." },
          ],
        },
      },
      {
        h: "Picking page size and orientation",
        p: [
          "Three settings control how the image lands on the page:",
        ],
        list: {
          items: [
            { b: "Fit to image.", t: "The output page is exactly the size of the image. Useful for screenshots where any white margin would feel awkward. Each page in a multi-image PDF can be a different size — the converter does not force uniformity in this mode." },
            { b: "Letter / A4 with center placement.", t: "The output page is standard paper size. The image is scaled to fit within margins, centered horizontally and vertically. Looks like a proper printed document. Pick Letter if your audience is US-based, A4 if international." },
            { b: "Portrait vs landscape.", t: "The converter auto-rotates the page to match the image's aspect ratio in fit-to-image mode. In Letter / A4 modes, it picks whichever orientation fits the image better while preserving aspect ratio. Override the auto-pick from the Options panel if you have a specific output orientation in mind." },
          ],
        },
      },
      {
        h: "When PNG-to-PDF beats the alternatives",
        p: [
          "Cases where this is genuinely the right tool:",
        ],
        list: {
          items: [
            { b: "Bundling screenshots into one shareable file.", t: "Sending five PNGs in an email is messy. Bundling them into one PDF is one attachment, one click for the recipient." },
            { b: "Submitting documents that were photographed instead of scanned.", t: "Most portals accept PDF; many do not accept JPG / PNG. Convert your phone photos of an ID or document to PDF before uploading." },
            { b: "Creating a multi-image PDF for printing.", t: "Photo printers and copy shops standardize on PDF for multi-image jobs. PNG-to-PDF builds the bundle in the order you want." },
            { b: "Archiving a long-form Twitter / LinkedIn thread.", t: "Screenshot each tweet, drop them in order, get a PDF you can save to your knowledge management system." },
            { b: "Producing a PDF cover image for an ebook.", t: "Many ebook generators want a PDF cover. PNG-to-PDF wraps a single image with the right page dimensions in one step." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PNG-to-PDF accepts up to 50 PNG files per output PDF, each up to 100 MB. Drag-reorder before converting to set the page order. Conversion runs in your browser via pdf-lib; nothing is uploaded.",
          "Output is PDF 1.7-compatible (Acrobat 8 and later), opens in every reader, and converts cleanly to PDF/A in a separate pass if you need archival format. The output is searchable only if the PNGs contained scanned text and you run OCR afterward — PNGs do not carry a text layer themselves.",
        ],
      },
    ],
  },

  // ============================================================
  // add-page-numbers — high-traffic free tool
  // ============================================================
  "add-page-numbers": {
    title: "Add page numbers to a PDF — every position, format, and style decision explained",
    intro:
      "Adding page numbers sounds simple — pick a corner, click Apply, done — but the small decisions you make at that step show up in every PDF reader, every printer, and every screen-reader that handles the file. Where the numbers land, how they are formatted, and what they look like signal whether the document feels professional or improvised. Here is how the tool works, the five positions and four formats that cover almost every use case, and the three patterns that catch users on the second-most-popular polish operation on the site.",
    sections: [
      {
        h: "Where to put page numbers — five positions explained",
        p: [
          "Page numbers live in margins. The tool offers six anchored positions — left, center, and right at both the bottom and the top. The right pick depends on what kind of document you are producing:",
        ],
        list: {
          items: [
            { b: "Bottom-center — the safe default.", t: "Used by 70% of books, reports, and contracts. Symmetrical, never collides with running headers, easy to spot. Pick this unless you have a specific reason to do otherwise." },
            { b: "Bottom-right — single-sided documents.", t: "Common in research papers, white papers, and corporate reports. Right-aligned page numbers feel less formal than center but more efficient for scanning thumb-flips." },
            { b: "Outer-edge (alternating left/right on odd/even pages).", t: "Standard for booklets and long printed documents that will be bound. The number is always on the edge of the page away from the spine. The tool generates this via two passes: bottom-right on odd pages, bottom-left on even pages." },
            { b: "Top-right or top-left — academic-paper style.", t: "Some style guides (MLA, Chicago) put page numbers at the top right. Pick this when matching a specific submission requirement." },
            { b: "Top-center — multi-section documents with chapter titles.", t: "Less common but useful when a chapter title is auto-placed in the footer and you do not want the page number to compete with it." },
          ],
        },
      },
      {
        h: "Four format styles — pick by audience",
        p: [
          "The tool supports four numbering formats. Each carries a different signal:",
        ],
        list: {
          items: [
            { b: "Plain (1, 2, 3 …).", t: "Minimal. Looks great in modern reports and short documents. The most common pick for sub-50-page outputs." },
            { b: "Page 1 (Page 2, Page 3 …).", t: "Slightly more formal. Common in business proposals, RFP responses, and academic submissions. The literal word \"Page\" adds visual weight and clarity in casual reading contexts." },
            { b: "1 of N (1 of 47, 2 of 47 …).", t: "Useful for any document where the reader benefits from knowing the total length at a glance. Pre-flight checklists, instruction manuals, and printed handouts especially benefit from this format." },
            { b: "Page 1 of N (Page 1 of 47 …).", t: "The verbose form. Most formal, most space-consuming. Pick this for legal documents and regulated industry deliverables where unambiguous page-count signaling matters." },
          ],
        },
      },
      {
        h: "Font size and color — guidelines",
        p: [
          "The defaults (9pt, black, regular weight) work for nearly every document. Adjust only when:",
        ],
        list: {
          items: [
            { b: "Print-only documents at small paper sizes.", t: "If the output paper is A5 or smaller, 9pt page numbers can look chunky. Try 8pt instead." },
            { b: "Large-format prints (A3, posters with page numbers).", t: "Bump to 11–14pt so the numbers are visible at the document's typical viewing distance." },
            { b: "Visually-styled documents with custom palettes.", t: "If the rest of your document uses a specific brand color for accents, matching the page-number color (within reason — keep contrast against the page sufficient for accessibility) makes the output feel cohesive." },
            { b: "Long technical documents.", t: "Bolding the page-number text helps scanning during fast page-flipping in print. Worth toggling on for 100+ page deliverables." },
          ],
        },
      },
      {
        h: "Three patterns worth knowing",
        p: [
          "Friction points from support tickets:",
        ],
        list: {
          items: [
            { b: "Existing page numbers in your PDF interfere with new ones.", t: "Some scanners and Word exports already include page numbers as part of the page content. Adding new ones on top produces two sets of numbers per page. The fix: extract the text to find which pages had numbers, then crop or redact the old ones first. Or accept that the old ones stay (most readers ignore the duplicate)." },
            { b: "Page numbers added to a cropped PDF land at the wrong position.", t: "Page numbers position relative to /CropBox, not /MediaBox. If you cropped before adding page numbers, the numbers land inside the crop. If you crop AFTER adding page numbers, the numbers may land outside the new crop and disappear. Always add page numbers last in a workflow that includes cropping." },
            { b: "Page numbers don't appear in print preview but appear when actually printed.", t: "A few PDF readers (older Acrobat builds) honor page-number overlays at render time but not at print time. Run a one-page test print before printing a long document to verify." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, page numbers handle PDFs up to 100 MB with no page-count cap. Processing runs in your browser via pdf-lib; the file never leaves your machine. Output is byte-compatible with every PDF viewer; the page-number text is a real text run (not a rasterized overlay), so it remains selectable, searchable, and screen-reader accessible.",
          "If you want page numbers that exclude the front matter (cover, TOC), the workflow is: extract the front matter to a separate PDF, add page numbers starting from \"1\" to the body PDF, then merge them back together. Two passes, three minutes — and the front matter stays unnumbered while the body counts from page 1.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-images-from-pdf — paired with pdf-to-png
  // ============================================================
  "extract-images-from-pdf": {
    title: "Extract images from a PDF — pulling the source images out vs rasterizing the whole page",
    intro:
      "\"Extract images\" sounds like one operation but is actually two — and picking the wrong one wastes a lot of time. Our Extract Images tool pulls the SOURCE images embedded inside the PDF at their original resolution. Our PDF-to-PNG tool, on the other hand, renders every page as a fresh image. The two produce different output for the same input. Here is when each is right, what a PDF's image inventory actually looks like under the hood, and the three cases where extraction either returns less than you expected or more.",
    sections: [
      {
        h: "Source extraction vs page rasterization",
        p: [
          "When a PDF contains a photograph, the image data is embedded as a binary stream inside the file — typically as JPEG or PNG bytes. Extract Images parses the PDF, finds every such embedded image stream, and decodes it to PNG at its native resolution. The output is exactly what the author put into the PDF, no more, no less.",
          "Page rasterization — what PDF-to-PNG does — renders the page exactly as you see it in a viewer, at whatever resolution you pick. The output is one image per page, combining all the text, vectors, and embedded images into a single rasterized bitmap. If a page contains three small photos and a lot of text, page rasterization gives you one page-sized image with everything together; source extraction gives you three small standalone photos.",
          "The right tool depends on what you need next: source extraction for the photos themselves (to use elsewhere, archive separately, run through an image pipeline), page rasterization for an image of how the page looks (to embed somewhere, archive visually, generate thumbnails).",
        ],
      },
      {
        h: "When source extraction is the right answer",
        p: [
          "Specific cases where the embedded-image format is exactly what you want:",
        ],
        list: {
          items: [
            { b: "Recovering photos from a phone scan that went to PDF.", t: "If someone sent you a multi-page PDF of photographs taken with their phone, the original JPEGs are still inside the PDF at their full camera resolution. Source extraction recovers them. Page rasterization would re-render them, losing detail." },
            { b: "Pulling product photos out of a catalog PDF.", t: "Marketing teams often produce a single PDF that contains every product image at print resolution. Source extraction pulls each photo as its own file, ready for the website CMS." },
            { b: "Auditing what images a vendor PDF contains.", t: "Sometimes you receive a PDF and want to inventory the embedded media (e.g. checking that high-res images are present for a print-ready document). Source extraction surfaces every embedded image with its dimensions and format." },
            { b: "Extracting medical or technical diagrams.", t: "Scientific papers and medical reports sometimes embed high-resolution diagrams as standalone images. Source extraction preserves the diagram resolution for slide reuse or re-publication." },
            { b: "Recovering original assets after losing the source files.", t: "If you misplaced the originals but still have the production PDF, source extraction is the recovery path." },
          ],
        },
      },
      {
        h: "Three cases where the output surprises you",
        p: [
          "Friction points worth knowing before you click extract:",
        ],
        list: {
          items: [
            { b: "PDFs that are mostly text return zero images.", t: "If the PDF was generated digitally from Word or Google Docs without any embedded photos or screenshots, there are literally no embedded images to extract. The output is empty. This is correct behavior — you wanted page-rasterized images, not source images. Use PDF-to-PNG instead." },
            { b: "A scanned PDF returns ONE image per page, regardless of visible content.", t: "Scanned PDFs are usually image-only — each page is a single large rasterized image of the original paper. Extract Images returns those page-sized rasters. If you wanted the diagrams or photos inside a page extracted as separate images, you cannot do that from a scan; the scan only has one image per page by construction. Run OCR first if you need text-level access." },
            { b: "Vector graphics aren't returned.", t: "PDF supports vector graphics as path objects, not as images. Logos, line drawings, and charts created in tools like Adobe Illustrator are typically vector and not part of the image inventory. They render perfectly in PDF viewers but cannot be \"extracted\" as raster images. If you need them as raster, use PDF-to-PNG (page rasterization) and then crop." },
          ],
        },
      },
      {
        h: "What the output looks like",
        p: [
          "Each extracted image becomes a separate PNG file. The PNG is decoded from the source embedded stream — JPEGs are decoded to PNG so the output is uniformly PNG (this is by design; raw JPEG sometimes carries embedded color profiles or progressive-encoding flags that confuse downstream tools). File size of each output matches the input image's pixel count and content type.",
          "Filenames carry the source page number so you can see the order at a glance. If a page has multiple images, they are suffixed with an index (page-3-image-1.png, page-3-image-2.png, etc.). The default UI lets you download each image individually; the Download All button bundles every extracted image into a single .zip.",
        ],
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, Extract Images handles PDFs up to 100 MB with no page-count cap and no image-count cap. PDFium runs in WebAssembly in your browser; nothing is uploaded. Rare codecs (JBIG2 under encryption, certain JPX/JPEG2000 variants) can fail to decode — when that happens we log and skip the offending image rather than failing the whole extraction, so you still get every image that did decode.",
          "Common pairings: Pair with Extract Pages to focus on a subset of pages first if you only want images from a specific section. Pair with PDF Inspector to preview the image inventory (count + resolution per page) before clicking extract.",
        ],
      },
    ],
  },

  // ============================================================
  // flatten-pdf — high-value, AcroForm baking explained
  // ============================================================
  "flatten-pdf": {
    title: "Flatten PDF — what \"baking in\" actually means and when to do it",
    intro:
      "Flattening a PDF is one of those operations that sounds technical but solves a very practical problem: stopping recipients from accidentally (or intentionally) editing your form values, annotations, or signatures. Done at the right time, it turns a working document into a final deliverable that behaves like a printed page. Done at the wrong time, it permanently destroys the editability you might still need. Here is what flattening does under the hood, when it is exactly the right move, and the three cases where doing it now is a mistake.",
    sections: [
      {
        h: "What gets baked in (and what doesn't)",
        p: [
          "When you flatten a PDF, the tool walks every page and converts live interactive elements into static page content. The PDF's AcroForm dictionary is processed: each form field's current value is rendered as text inside the page's content stream, then the field's interactive entry is removed. Annotations (highlights, sticky notes, text boxes, ink markup) are similarly merged into the page contents and their interactive references dropped. Visual signatures become embedded images at the position they were placed.",
          "The output behaves like a printed page. Form fields are no longer fillable — they look exactly like they did when you flattened, and they cannot be re-edited. Highlight overlays are permanent. Comments either become visible text or are dropped. The PDF file itself is structurally simpler — fewer dictionaries, no interactive layer.",
        ],
      },
      {
        h: "When flattening is the right move",
        p: [
          "Five canonical use cases:",
        ],
        list: {
          items: [
            { b: "Final delivery of a filled form.", t: "You filled out a vendor onboarding form, a registration form, a contract. Flatten before sending so the recipient cannot modify your answers." },
            { b: "Locking in markup from a review pass.", t: "You added comments, highlights, and tracked changes to a draft. Flatten when you want those comments to persist visually but be unchangeable." },
            { b: "Printing a form that needs to be archived.", t: "Flattening makes the document behave like a printed page — useful for paper-trail compliance where the digital file should match what would appear on paper." },
            { b: "Closing out a signed document.", t: "After everyone has signed a document with visual signatures, flatten to prevent further field changes. Pair with cryptographic signing if you need legal-grade non-repudiation." },
            { b: "Preparing a PDF for systems that don't handle forms.", t: "Older archival systems sometimes choke on PDFs with AcroForm dictionaries. Flatten first to produce a structurally simpler file." },
          ],
        },
      },
      {
        h: "Three cases where flattening now is wrong",
        p: [
          "Flattening is permanent. Once a form field is baked into the page, there is no \"unflatten\" operation. Three situations where waiting is the right move:",
        ],
        list: {
          items: [
            { b: "The form values are still in draft.", t: "If anyone — including you, on a different day — might still want to change the values, do not flatten yet. Keep the working AcroForm copy and only flatten the final-final version." },
            { b: "You need cryptographic signatures to remain valid.", t: "Cryptographic signatures are bound to the exact byte layout of the file at signing time. Flattening rewrites the byte layout, which invalidates the signature chain. If you need a cryptographically-signed deliverable, sign AFTER flattening, not before." },
            { b: "Form data extraction is still in the workflow.", t: "If a downstream system reads form-field values directly from the PDF (a common pattern in invoice processing, expense reports, and intake forms), keep the form fields live. Flattened PDFs require OCR + regex extraction, which is far more expensive than reading AcroForm dictionaries directly." },
          ],
        },
      },
      {
        h: "Cryptographic signatures and flattening — the precise rule",
        p: [
          "This trips up enough users that it deserves its own section. A PDF can carry two kinds of \"signature\":",
        ],
        list: {
          items: [
            { b: "Visual signature (an image of a handwriting).", t: "A drawn or photographed signature placed on the page like any other image. Has no cryptographic verification. Survives flattening unchanged — it was already visual content; flattening just converts it from an annotation reference to part of the page contents." },
            { b: "Cryptographic signature (a digital signature with a certificate).", t: "A signed hash of the file's bytes, anchored to a verifiable identity. Flattening rewrites the file bytes, so the hash no longer matches. The signature appears as a visual stamp in viewers, but the verification badge says \"signature invalid — file modified.\"" },
          ],
        },
      },
      {
        h: "What you keep, what you lose",
        p: [
          "After flattening, the file is smaller, simpler, and less interactive. Concretely:",
        ],
        list: {
          items: [
            { b: "Kept: visual appearance.", t: "The PDF looks exactly the same as before flattening. Every form value, every annotation, every signature is visible at the same position with the same styling." },
            { b: "Kept: searchability.", t: "Form values written as text are still selectable, searchable, and screen-reader-accessible after flattening." },
            { b: "Lost: AcroForm dictionary.", t: "Cannot be re-edited via PDF readers." },
            { b: "Lost: interactive annotations.", t: "Highlights, comments, sticky notes are no longer hover-able or removable." },
            { b: "Lost: cryptographic signature validity (if any).", t: "Sign after flattening to preserve validity." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, flatten handles PDFs up to 100 MB with no page-count cap. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF viewer since Acrobat 5.",
          "Common pairings: Sign-then-flatten for documents that need both signature and lockdown. Page-numbers-then-flatten when you want the page numbers permanently rendered. Compress-after-flatten produces the smallest final-state file by combining structural simplification (flatten) with bitmap re-encoding (compress).",
        ],
      },
    ],
  },

  // ============================================================
  // fill-pdf-form — common free-tool target
  // ============================================================
  "fill-pdf-form": {
    title: "Fill PDF forms in your browser — what we support, what catches people out, and how to lock the result",
    intro:
      "Filling a PDF form sounds like one of those tasks that should be obvious — click the field, type a value, save. The friction is in the gap between fillable PDFs (which have a real AcroForm dictionary) and flat PDFs (which look like forms but have no fillable fields). The first kind works perfectly with any free fill tool. The second kind requires either OCR-based field detection (paid) or accepting that you are typing on top of the page rather than into structured fields. Here is how to tell which kind you have, what our free fill tool supports, and the workflow for locking in the result.",
    sections: [
      {
        h: "How to tell if your PDF is fillable",
        p: [
          "The most reliable check: open the PDF in your browser. If a field highlights as you tab through the document, or if a click on a likely field shows a text cursor, it is fillable. If clicking around just does nothing, it is flat. Our PDF Form Fields inspector also surfaces the AcroForm inventory of any uploaded PDF — names, types, default values, and whether each field is required. That five-second check saves an hour of \"why doesn't this work?\".",
          "The technical underlying detail: fillable PDFs carry an AcroForm dictionary that lists every interactive field with its position, type (text / checkbox / radio / dropdown / signature), and current value. Flat PDFs do not have this dictionary; the form looks like a form because the lines and labels are drawn on the page, but there are no clickable regions.",
        ],
      },
      {
        h: "What our free fill tool supports",
        p: [
          "Every standard AcroForm field type works without configuration:",
        ],
        list: {
          items: [
            { b: "Text fields (single and multi-line).", t: "Type your value; it is written into the field. Multi-line fields wrap automatically based on the field's bounding box." },
            { b: "Checkboxes.", t: "Click to toggle. Some PDFs use uncommon checked-state values (Yes / Y / On instead of the default checked-mark); we detect and use whatever the field expects." },
            { b: "Radio groups.", t: "Click any option to select it; the others in the group automatically deselect. Works for both circle and square radio styles." },
            { b: "Dropdowns.", t: "The dropdown opens with every available option from the AcroForm definition. Pick one, or type to filter if the field supports inline editing." },
            { b: "Signature fields.", t: "We do not support placing a cryptographic signature in the free tool — that needs a certificate and a private key. Visual signature placement (an image of a handwritten signature) is supported via the AI · Sign tool." },
          ],
        },
      },
      {
        h: "Three patterns that catch people out",
        p: [
          "Friction points from support tickets and analytics:",
        ],
        list: {
          items: [
            { b: "Required fields and validation.", t: "Some PDFs mark fields as required or run JavaScript validation on submit. The free fill tool warns you about required fields that are empty before allowing download, but it does not run custom JavaScript validation (most PDFs do not have any). If a downstream system rejects your filled form for validation reasons, those are usually about content (an SSN format, a date range), not about the fill mechanism." },
            { b: "Field appearance does not update until save.", t: "Some PDFs use field appearance streams that cache the rendered text. After typing a value, you may see the field flash with both the old and new text briefly. Save the filled PDF and re-open it; the rendered appearance will be correct." },
            { b: "Calculated fields don't auto-update in the free tool.", t: "Some forms have calculated fields (total = quantity × price). Our free fill tool does not execute the calculation scripts. If your form depends on auto-calculations, fill the values manually, or use AI · Fill PDF Form which does execute the calculation scripts." },
          ],
        },
      },
      {
        h: "Locking the result — when to flatten",
        p: [
          "After filling, you have two options:",
        ],
        list: {
          items: [
            { b: "Save as a filled form (editable).", t: "The default. Anyone who opens the file can still see and modify the values. Good when the recipient needs to add their own values (e.g. you fill in your part of a multi-party form, send to next party)." },
            { b: "Save as flattened (final, uneditable).", t: "Click Options → Flatten before download. The values are baked into the page; the form cannot be re-edited. Good for final submissions — bank applications, government forms, visa applications, anything where the recipient should not be able to modify your filled values." },
          ],
        },
      },
      {
        h: "When to upgrade to AI Fill",
        p: [
          "Cases where the free tool isn't sufficient and AI · Fill PDF Form is the right next step:",
        ],
        list: {
          items: [
            { b: "Flat PDFs (no AcroForm dictionary).", t: "AI · Fill detects field positions visually using OCR + LLM, then types your provided personal info into the right places. The free tool cannot help with flat PDFs because there are no fields to fill." },
            { b: "Repeated filling with the same personal info.", t: "AI · Fill remembers your name/email/phone/address/SSN once and fills any new form automatically. Faster than retyping for users who fill many forms (insurance brokers, real-estate agents, immigration applicants)." },
            { b: "Forms with computed fields or conditional logic.", t: "AI · Fill executes the form's calculation scripts and respects conditional show/hide logic. The free tool does not." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, form-fill handles PDFs up to 100 MB with no field-count cap. Processing runs in your browser via pdf-lib; the file never leaves your machine, and the values you type do not leave your machine either. Output is byte-compatible with every PDF reader; filled values render correctly in Acrobat, Preview, Chrome, Firefox, and every other modern viewer.",
          "Common pairings: Flatten → Sign for final cryptographic-signature workflows (sign after flatten to keep the cert valid). Fill → Compress for the smallest final-deliverable file size.",
        ],
      },
    ],
  },

  // ============================================================
  // bates-stamp-pdf — legal-industry-specific, high-intent traffic
  // ============================================================
  "bates-stamp-pdf": {
    title: "Bates stamp PDF — how legal numbering works, why it matters, and the four configurations that cover every production",
    intro:
      "Bates numbering is one of those operations that sounds esoteric until you work on a legal matter, at which point it becomes one of the highest-stakes formatting choices in the whole workflow. The wrong prefix or starting number can make pages uncitable across a deposition. The right configuration makes every page in a production individually addressable for the rest of the matter's life. Here is how Bates numbers actually work, the four configurations that cover virtually every US litigation production, and the patterns that show up specifically in cross-border discovery.",
    sections: [
      {
        h: "What a Bates number is and why it matters",
        p: [
          "A Bates number is a unique sequential alphanumeric identifier stamped on every page of a document production. The name comes from the Bates Manufacturing Company, whose mechanical numbering stamps in the late 1800s were ubiquitous in law offices and accounting firms. Today the mechanical stamp is gone, but the convention persists: every page in a production gets a unique number, every reference in a brief or deposition cites that number, every reviewer can find any specific page across millions of pages in seconds.",
          "The reason Bates numbers are non-negotiable in modern litigation is that productions can run to hundreds of thousands of pages, often divided across many documents, with the same content appearing in multiple files. Without a unique per-page identifier, you cannot reliably cite to a specific page; with one, you can. Most modern document review platforms (Relativity, Everlaw, DISCO, Logikcull) index by Bates number, so the stamp also serves as the primary key for downstream review tooling.",
        ],
      },
      {
        h: "The four configurations that cover every production",
        p: [
          "Most teams overcomplicate Bates numbering. In practice, four configurations handle virtually every situation:",
        ],
        list: {
          items: [
            { b: "Generic 6-digit (BATES000001).", t: "The most common default. \"BATES\" prefix, 6 digits with leading zeros, starting at 1. Used when the producing party does not want a custom prefix or when a small matter does not warrant one." },
            { b: "Party-prefixed (SMITH000001 / DEF000001).", t: "When both parties produce in the same matter, prefixes prevent collisions. Either the party's short name (SMITH, DOE) or their role (PL for plaintiff, DEF for defendant). 6 digits is standard; matters with anticipated >999,999 pages bump to 8." },
            { b: "Matter-prefixed (MATTER-2026-0042-000001).", t: "Large firms with parallel matters use the matter number as the prefix so productions across matters cannot be confused. Verbose, but unambiguous. Standardized at most BigLaw firms." },
            { b: "Confidentiality-tier-prefixed (CONFIDENTIAL000001 / AEO000001).", t: "When the production includes pages with different confidentiality tiers, each tier gets its own Bates range. Discovery tools can filter by prefix to enforce access controls." },
          ],
        },
      },
      {
        h: "Starting numbers and continuing numbering across files",
        p: [
          "Two operational patterns to watch:",
        ],
        list: {
          items: [
            { b: "Continuing numbering across multiple PDFs.", t: "If your production is split across 5 PDFs, you want PDF 1 to end at (say) Bates 12,847 and PDF 2 to start at 12,848. Note the last number after each file is stamped, set the next file's start number accordingly. Or use our Batch Process tool's Bates option, which auto-continues across the whole batch in one pass." },
            { b: "Reserving ranges for late-arriving documents.", t: "Some teams pre-reserve ranges for documents they expect to add later (e.g. \"Documents 1-50,000 are produced now; 50,001-60,000 reserved for the second wave.\"). The starting-number parameter lets you skip into the reserved range when the second wave arrives." },
          ],
        },
      },
      {
        h: "Cross-border and non-US conventions",
        p: [
          "Bates is the US convention. Other jurisdictions use similar sequential schemes that this tool also supports:",
        ],
        list: {
          items: [
            { b: "UK disclosure.", t: "UK Civil Procedure Rules require disclosed documents to be sequentially numbered but do not mandate the Bates format specifically. Common conventions: \"Disc-001\" or \"P-001\" (P for production). Use the prefix parameter to match local convention." },
            { b: "EU GDPR data-subject-access productions.", t: "Subject Access Request productions need sequential numbering for the requester to cite specific pages in follow-up requests. Common convention: \"SAR-001\" prefix with 3- or 4-digit numbering." },
            { b: "Indian commercial litigation.", t: "Indian courts increasingly accept Bates-style numbering for discovery. Common convention: matter-prefixed (\"WP-2026-0042-0001\") to align with the writ petition's case number." },
            { b: "Internal compliance / regulatory submissions.", t: "Many regulators (SEC, FDA, EMA) require sequentially-numbered submissions. The same Bates tool applies; the prefix usually matches the regulator's submission code (e.g. \"FDA-SUB-001\")." },
          ],
        },
      },
      {
        h: "Five common Bates mistakes and how to avoid them",
        p: [
          "From support tickets and production-mistake postmortems:",
        ],
        list: {
          items: [
            { b: "Stamping over content.", t: "Bates numbers usually go in the footer margin. If you have wide content that extends close to the page edge, the Bates number can collide with it. Pick a footer position with sufficient margin, or trim the content area before stamping." },
            { b: "Bates on pages that shouldn't be produced.", t: "Privilege log pages, cover sheets, and table-of-contents pages sometimes get Bates-stamped by accident. Either exclude them from production beforehand or verify the final stamped output before sending." },
            { b: "Restarting numbering inside a production.", t: "Some teams accidentally restart numbering when adding a new file. The result is duplicate Bates numbers — fatal for review tooling. Always note the last number from the previous file and continue from N+1." },
            { b: "Wrong number of digits.", t: "If you start at 1 with 4-digit zero-padding and the production grows past 10,000 pages, you run out of numbers. Pick 6 digits (1M pages) as the safe default; bump to 8 for very large productions." },
            { b: "Bates AFTER redaction.", t: "Sometimes teams Bates-stamp before redacting. Then redaction modifies the page contents (because byte-level redaction rewrites the content stream), and the Bates stamp can shift or be partially covered. Bates last, after all other modifications." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, Bates stamping handles PDFs up to 100 MB per file with no page-count cap. Processing runs in your browser via pdf-lib; production materials never leave your machine — critical for matters under privilege. Output is byte-compatible with every PDF viewer; the Bates text is a real text run, so review platforms can extract and index it directly.",
          "For productions running into the tens of thousands of pages, use the API which accepts batches and emits production-load files (Concordance .dat, Relativity .opt) alongside the stamped PDFs. The Batch Process tool covers the common case of stamping a directory of PDFs with continuous Bates numbering across the whole batch.",
        ],
      },
    ],
  },

  // ============================================================
  // compare-pdfs-visual — paired with the AI compare longform
  // ============================================================
  "compare-pdfs-visual": {
    title: "Visual PDF compare — what pixel diff catches that text diff doesn't",
    intro:
      "Comparing two PDFs is a category, not a single operation. The choice between visual (pixel-level) and semantic (AI text) comparison comes down to whether you care about how the pages look or what the pages say. Both are useful; both miss things the other catches. Here is exactly what visual compare detects, when it is the right tool, and the two patterns where pixel-level diff produces noise instead of signal.",
    sections: [
      {
        h: "What visual comparison catches",
        p: [
          "Visual compare renders each page of both PDFs at the same resolution (144 DPI by default), then computes a per-pixel difference. Any region where the two pages produce different pixel colors is highlighted in red on the output. This catches every kind of visible change: text edits, font changes, layout shifts, image swaps, color tweaks, hyperlink underline added or removed, even tiny things like a 1-pixel border thickness change.",
          "The strength of this approach is that it is content-agnostic. The comparison does not need to know what kind of change happened — text, vector, raster, or all three. If a human looking at the two pages would see a difference, visual compare will highlight it.",
        ],
      },
      {
        h: "Visual compare vs AI text compare — when to use each",
        p: [
          "The two compares answer different questions:",
        ],
        list: {
          items: [
            { b: "Visual compare — \"do these pages LOOK different?\"", t: "Catches font changes, layout shifts, image swaps, color tweaks, anything visible. Best for design review, brand-guideline conformance, print-proof checks, regression testing for document generation pipelines." },
            { b: "AI text compare — \"do these documents SAY different things?\"", t: "Reads both PDFs end-to-end, identifies substantive content changes, classifies them by severity. Best for contract review, document version review, redline-style summaries, structured change logs." },
          ],
        },
      },
      {
        h: "When visual compare is the right tool",
        p: [
          "Specific use cases where pixel-level matters:",
        ],
        list: {
          items: [
            { b: "Pre-print proofreading.", t: "Comparing a draft layout to a final layout. The visible-layout signals are exactly what you want to verify." },
            { b: "Brand-guideline conformance.", t: "Two versions of a marketing PDF differ by a 2pt color shift in the header. AI text compare won't notice; visual compare highlights it instantly." },
            { b: "Document generation regression tests.", t: "Your invoice-generation pipeline emits PDFs. After a code change, run visual compare between an output from before the change and an output from after. Any non-trivial pixel diff is a regression." },
            { b: "Image / chart change detection.", t: "When the document contains charts or images, the difference might be entirely visual (a chart's bars shifted, a logo updated). Visual compare catches this; text compare doesn't see it at all." },
            { b: "Cross-version font verification.", t: "If a PDF needs to render identically on different systems, visual compare between two rendering pipelines surfaces any font-substitution issues." },
          ],
        },
      },
      {
        h: "Two patterns where pixel compare produces noise",
        p: [
          "Cases where visual compare flags differences that don't actually matter for your purpose — and what to do about them:",
        ],
        list: {
          items: [
            { b: "Anti-aliasing differences across renderers.", t: "If your two PDFs were rendered by different rasterizers (or even the same rasterizer at different DPI), anti-aliased edges around text will produce subtle pixel differences along every glyph edge. The output looks like every word is highlighted because every edge is slightly different. Mitigation: increase the diff threshold (more pixel-color difference required before flagging) or use AI text compare which doesn't care about rendering subtleties." },
            { b: "Reflowed text from a font substitution.", t: "If one PDF has a font and the other doesn't (and the renderer substituted a different font), every line of text shifts by tiny amounts. Visual compare highlights every line. This is technically a real difference — the layouts ARE different — but if you only care about content, AI text compare will tell you the content is identical and the visible noise is a font-substitution artifact." },
          ],
        },
      },
      {
        h: "Tips for cleaner visual diffs",
        p: [
          "Habits that produce more readable output:",
        ],
        list: {
          items: [
            { b: "Match the page counts.", t: "Visual compare expects same page count. If one document has an extra page, the tool flags the mismatch before diffing. Either align the page counts (via Extract or Delete Pages) or use AI text compare which handles mismatched counts." },
            { b: "Use the threshold slider.", t: "The default threshold (12) catches almost every meaningful change while filtering anti-aliasing noise. Lower it (4-6) for strict pixel-perfect verification; raise it (24-48) when you only care about substantial changes." },
            { b: "Combine with AI compare for the full picture.", t: "Run both. AI text compare tells you what the documents SAY differently; visual compare tells you what they LOOK like differently. Together they catch the changes both individually miss." },
            { b: "Use Normalize first for cross-version comparisons.", t: "If your two PDFs were generated by different pipelines or different software versions, normalize them first (same font embedding, same compression) so the visual diff focuses on real content changes rather than encoding artifacts." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, visual compare handles two PDFs of up to 25 MB each with up to 100 pages each. Both documents are rendered in your browser via PDFium; nothing is uploaded. The diff output is a single PDF that places each page side-by-side with the red-highlighted regions overlaid, plus a summary showing the change-density per page.",
          "For larger comparisons, use the API which handles up to 1,000 pages per document and emits structured JSON listing every changed region as a bounding box.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-markdown — developer-focused, content-pipeline use case
  // ============================================================
  "pdf-to-markdown": {
    title: "PDF to Markdown — how heuristic conversion works, when it shines, and when to reach for AI",
    intro:
      "Markdown has quietly become the default container for documentation content — README files, knowledge bases, blog posts, technical specs, AI training datasets. Converting a PDF to markdown is a hugely common preprocessing step, and the right tool depends almost entirely on the structure of the source. Heuristic conversion is fast, free, and produces excellent output for well-typeset documents. AI-driven conversion is slower, costs credits, and handles cases the heuristic cannot. Here is exactly how the free heuristic works, when it gets you what you want, and when you should pay the AI cost.",
    sections: [
      {
        h: "How heuristic markdown extraction works",
        p: [
          "The free tool parses each text run in the PDF and records two pieces of metadata: the font size and the font weight (bold / regular). We then build a font-size histogram across the whole document. The mode (most common size) is body text — anything at that size renders as plain markdown paragraphs. Sizes above that mode become headings: ≥1.25× body becomes H3 (###), ≥1.6× becomes H2 (##), and ≥2× becomes H1 (#). Bold runs are wrapped in **markdown bold**. Italic runs become _italic_. Paragraphs are separated by line breaks longer than 1.5× the typical line-height.",
          "This works remarkably well on documents that follow standard typesetting conventions — research papers, technical docs, well-formatted business docs, ebooks. The output is clean markdown with a recognizable structure that pastes cleanly into Notion, Obsidian, GitHub, or any markdown-aware system.",
        ],
      },
      {
        h: "When heuristic markdown is the right answer",
        p: [
          "Cases where heuristic conversion gets you exactly what you want:",
        ],
        list: {
          items: [
            { b: "Well-typeset reports, white papers, and research papers.", t: "These follow consistent font hierarchies that the heuristic detects accurately. Output is usually publication-ready with minor cleanup." },
            { b: "Documentation PDFs going into a markdown KB.", t: "If your team's knowledge base is markdown-based (Notion, Confluence with markdown export, GitHub wiki), heuristic conversion is the fastest path to ingestion." },
            { b: "AI training data preparation.", t: "RAG and fine-tuning pipelines often want markdown. The structure-aware output is more useful than plain text for chunking strategies that respect headings." },
            { b: "Blog migration from PDF to web.", t: "Old PDFs to be re-published as blog posts. Markdown is the right intermediate — it carries enough structure for the blog engine to render properly without all the layout baggage of HTML." },
            { b: "Quick triage of a long document.", t: "Even imperfect markdown output makes a long PDF scannable by headings, which is faster than scrolling through the PDF itself." },
          ],
        },
      },
      {
        h: "Three patterns that defeat heuristic conversion",
        p: [
          "The cases where the heuristic produces output you have to fix manually — or reach for AI:",
        ],
        list: {
          items: [
            { b: "Complex tables.", t: "Tables are an inherent layout problem that markdown was not designed to express richly. The heuristic linearizes table content row-by-row, which loses column alignment. For documents with meaningful tables (financial reports, scientific papers, data sheets), use AI · Table Extract first to get the tables out as CSV, then convert the rest of the document to markdown." },
            { b: "Multi-column layouts.", t: "Two-column research papers and three-column magazine layouts produce text that reads column-1-then-column-2. The heuristic outputs the columns sequentially, which is usually right, but pages with mixed layouts (one-column body with two-column callouts) can produce out-of-order output. AI conversion handles this by reading visually rather than positionally." },
            { b: "Custom font hierarchies.", t: "If the source document uses non-standard typography — e.g. body text in a large display font with tiny callouts — the heuristic detects the callouts as body and the body as headings. AI conversion reads the visual hierarchy rather than the font-size hierarchy and produces correct output." },
          ],
        },
      },
      {
        h: "When to pay the AI cost",
        p: [
          "Specific signals that you should run AI · Rewrite (or AI · Summarize with markdown output) instead of the free heuristic:",
        ],
        list: {
          items: [
            { b: "The source is a scan.", t: "Scanned PDFs have no text layer; the heuristic returns empty output. Run AI · OCR first to add a text layer, then convert. Or use AI · Rewrite end-to-end which folds the OCR + markdown-conversion into one step." },
            { b: "Tables matter to the output.", t: "Pay for AI to preserve table structure correctly." },
            { b: "Mixed-column or unusual layouts.", t: "Pay for AI to read the visual order rather than the positional order." },
            { b: "You want semantic content selection.", t: "AI can extract just the abstract + introduction, or just the methodology section, on demand. The heuristic gives you everything." },
          ],
        },
      },
      {
        h: "Output quirks worth knowing",
        p: [
          "Three patterns in the heuristic output that catch users on the first pass:",
        ],
        list: {
          items: [
            { b: "Hyphenated line breaks become hyphens.", t: "Some PDFs use hyphenation to break long words across lines. The heuristic preserves the hyphen, so \"hyphen-ated\" becomes the token \"hyphen-ated\" rather than \"hyphenated\". Most markdown renderers display this correctly, but downstream search indexers may need to handle the hyphen." },
            { b: "Smart quotes survive as Unicode.", t: "Curly quotes (“”) and apostrophes (’) are preserved as their Unicode characters, not converted to straight ASCII. This is usually right; if your downstream pipeline needs ASCII, post-process with a simple regex." },
            { b: "Bullet glyphs vary.", t: "PDFs use many different bullet glyphs — •, ■, -, *, →. The heuristic preserves whatever was used. Pure markdown wants \"- \" for list items; you may need a global replace if your renderer is strict." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF-to-markdown handles PDFs up to 100 MB with no page-count cap. PDFium parses each page in your browser via WebAssembly; nothing is uploaded. Output is plain UTF-8 .md with paragraphs separated by blank lines and headings preceded by the right number of # characters.",
          "Common pairings: PDF Inspector to verify the source has a text layer before converting. AI · OCR for scans. AI · Rewrite for high-fidelity conversion when the heuristic falls short.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-bookmarks — utility tool, helpful for navigation context
  // ============================================================
  "pdf-bookmarks": {
    title: "PDF bookmarks viewer — how the outline tree works and what to do with it",
    intro:
      "Most long PDFs (books, technical manuals, regulatory filings, theses) carry a bookmark tree — a hierarchical outline that lets readers jump to chapters, sections, and sub-sections from the side panel of their PDF reader. Bookmarks are easy to overlook, but for a long document they are the single biggest factor in whether the file is navigable or not. Here is how the bookmark structure works, why some PDFs have it and others do not, and the three places where surfacing the bookmark tree as standalone data is genuinely useful.",
    sections: [
      {
        h: "What a bookmark tree is",
        p: [
          "Every PDF can include an /Outlines dictionary — a tree structure where each node has a title, a destination (which page to jump to, where on the page), and zero or more children. PDF readers display this tree in their side panel: Acrobat calls it Bookmarks, Preview calls it Table of Contents, Chrome calls it Document outline. Clicking any entry jumps to the destination.",
          "The tree is independent of the document's visible content — you can have headings on every page without bookmarks, or bookmarks pointing to specific pages without visible chapter titles. Most well-authored documents have both: visible headings + matching bookmarks. Many auto-generated PDFs have only one or the other.",
        ],
      },
      {
        h: "Why some PDFs have bookmarks and others don't",
        p: [
          "The bookmark tree is opt-in at PDF generation time. The source application has to explicitly create the /Outlines dictionary. Different generation pipelines have different defaults:",
        ],
        list: {
          items: [
            { b: "Microsoft Word \"Save as PDF\".", t: "Auto-generates bookmarks from Word's heading styles (Heading 1, Heading 2, etc.). If your Word doc uses styled headings, the PDF has bookmarks. If you used bold text without styles, no bookmarks." },
            { b: "LaTeX with hyperref package.", t: "Auto-generates bookmarks from \\section, \\subsection, \\subsubsection structure. Standard for academic papers and technical books." },
            { b: "Scanned PDFs.", t: "Almost never have bookmarks — scans are usually image-only with no structural awareness. Add bookmarks manually with Acrobat Pro, or use AI · Mindmap to infer a hierarchy and convert it to a bookmark structure." },
            { b: "Browser \"Print to PDF\".", t: "Usually no bookmarks. Browsers focus on rendering the page; they do not extract heading structure into the PDF's outline." },
            { b: "Hand-edited PDFs.", t: "Whatever the original generator produced, minus anything an editor removed. Always worth verifying with this tool after a long edit." },
          ],
        },
      },
      {
        h: "What our viewer surfaces",
        p: [
          "The PDF Bookmarks viewer parses the /Outlines dictionary and renders it as an indented tree:",
        ],
        list: {
          items: [
            { b: "Title of each bookmark.", t: "The text that appears in PDF readers' side panel." },
            { b: "Depth (indentation).", t: "Top-level chapters at depth 0, sections at depth 1, etc. The indentation matches how the reader's bookmark panel would show it." },
            { b: "Destination page.", t: "Which physical page the bookmark jumps to." },
            { b: "Total bookmark count.", t: "A quick number to gauge whether the document has comprehensive bookmarks or just a few top-level entries." },
          ],
        },
      },
      {
        h: "Three real-world use cases",
        p: [
          "Where surfacing the bookmark tree pays off:",
        ],
        list: {
          items: [
            { b: "Audit before redistribution.", t: "If you are about to share a long PDF, viewing its bookmark tree confirms it is navigable. A 400-page report without bookmarks is a usability disaster; the viewer surfaces this before recipients hit it." },
            { b: "Build a navigation index for a website.", t: "If you host a PDF for download, copying its bookmark tree into a table-of-contents block on the download page gives visitors a preview of what is inside. The viewer's output makes this a copy-paste step." },
            { b: "Migrate a long document to web.", t: "Converting a 500-page PDF to a series of web pages? Start by exporting the bookmark tree — it is the natural page-segmentation map. Each top-level bookmark becomes one web page; sub-bookmarks become headings within those pages." },
          ],
        },
      },
      {
        h: "Two patterns worth knowing",
        p: [
          "Friction points worth knowing before the viewer surprises you:",
        ],
        list: {
          items: [
            { b: "Bookmark titles don't always match page headings.", t: "The bookmark title is whatever was supplied at generation time. Sometimes it matches the page heading verbatim; sometimes the author shortened it for the side panel. Do not assume the two are identical." },
            { b: "Empty bookmark trees are valid.", t: "Some PDFs technically have an /Outlines dictionary but with zero entries. The viewer reports \"no bookmarks\" rather than an error. If you expected bookmarks and don't see them, the generator probably didn't create them — not a tool failure." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, the bookmarks viewer handles PDFs up to 100 MB with no bookmark-count cap. Parsing runs in your browser; the file never leaves your machine. Output renders the tree visually and exports as JSON / Markdown / CSV for downstream use.",
          "Common pairings: Pair with PDF Inspector for a complete document audit (pages + bookmarks + fonts + size). Pair with Extract Pages to slice the document along the bookmark structure when migrating to web or chunking for search.",
        ],
      },
    ],
  },

  // ============================================================
  // remove-pdf-metadata — privacy + redaction-adjacent
  // ============================================================
  "remove-pdf-metadata": {
    title: "Remove PDF metadata — what's hidden in your file and why scrubbing matters",
    intro:
      "Every PDF carries metadata — names, dates, paths, software versions, sometimes much more — that the visible page contents never reveal. Most of the time this is harmless. Occasionally it leaks information you specifically did not intend to share: the original author's name on an anonymous submission, the file path of a draft on someone's confidential C drive, the authoring application that gives away your internal workflow. Here is exactly what metadata is in a typical PDF, the three categories of leaks worth caring about, and the limits of what scrubbing can actually do.",
    sections: [
      {
        h: "Three places metadata lives in a PDF",
        p: [
          "PDFs carry metadata in three structurally distinct locations:",
        ],
        list: {
          items: [
            { b: "The /Info dictionary.", t: "The classic metadata block: Title, Author, Subject, Keywords, Creator (the source application — e.g. \"Microsoft Word\"), Producer (the PDF-generation library — e.g. \"PDFKit\"), and CreationDate / ModDate timestamps. Every PDF has this; what is in it varies enormously by generator." },
            { b: "The XMP metadata stream.", t: "An XML-based metadata stream supporting much richer information than the /Info dictionary — Dublin Core fields, custom schemas, version history, contributor lists, embedded color profiles. Mostly populated by professional design and publishing tools (Adobe InDesign, QuarkXPress) and by archival systems (PDF/A producers always embed XMP)." },
            { b: "Per-element metadata.", t: "Annotations carry an author field. Form fields can carry default-value metadata. Embedded files can carry their own internal metadata. Cryptographic signatures carry signer-identity metadata that is part of the signature's validity proof." },
          ],
        },
      },
      {
        h: "What the scrub tool does and doesn't touch",
        p: [
          "Our Remove Metadata tool clears the /Info dictionary and the XMP stream completely. Every field becomes empty. The PDF's visible content — text, images, vectors, annotations — is untouched. So is per-element metadata (annotation authors, signer identities). Annotations that carry an Author field require flattening to strip — flatten first, then scrub, for a fully-clean document.",
          "Cryptographic signatures contain metadata that is part of their validity proof. Removing the signature's metadata would invalidate the signature. The scrub tool intentionally leaves cryptographic signatures alone; if you need to strip a signed document's metadata, remove the signature first (via Acrobat Pro) and then scrub.",
        ],
      },
      {
        h: "Three categories of metadata leaks worth knowing",
        p: [
          "The patterns that show up in real-world embarrassments:",
        ],
        list: {
          items: [
            { b: "Author name on an anonymous submission.", t: "Conferences with double-blind review, government tip-line submissions, RFP responses where anonymity matters. The /Info dictionary's Author field is often pre-filled from the user's OS login name without their realizing." },
            { b: "Original file path or filename.", t: "Some generators put the source filename (\"C:\\Users\\jane\\Documents\\confidential.docx\") in the /Info dictionary. This leaks the document's original name and the local user account. Even when you renamed the PDF to share, the metadata still says where it came from." },
            { b: "Authoring application that reveals workflow.", t: "If your competitive bid says \"Creator: Microsoft Word 2003\" and theirs says \"Creator: Adobe InDesign 2024\", you have just told them you typed your bid in a 20-year-old word processor. Strip the Creator field for a level playing field." },
          ],
        },
      },
      {
        h: "When metadata scrubbing alone isn't enough",
        p: [
          "Three situations where scrubbing the /Info dictionary is the right START but you need additional steps:",
        ],
        list: {
          items: [
            { b: "Documents with annotations or comments.", t: "Each annotation carries an author. Flatten the PDF first (Flatten tool), then scrub metadata. After flattening, annotations become page content and their author metadata is gone." },
            { b: "Documents with embedded files.", t: "Embedded files carry their own internal metadata. Use Extract Attachments to inventory them; remove embedded files you do not need before scrubbing the outer document." },
            { b: "Documents with hidden text or comments.", t: "PDF supports hidden text (used for OCR text layers behind images). Scrubbing metadata does not affect this. If you need to remove hidden text too, run AI · Redact with the appropriate categories." },
          ],
        },
      },
      {
        h: "What scrubbing cannot do",
        p: [
          "Two important limits worth knowing:",
        ],
        list: {
          items: [
            { b: "Scrubbing cannot remove content.", t: "If sensitive information is in the visible text of the PDF, scrubbing metadata does nothing. Use Redact for visible content." },
            { b: "Scrubbing cannot prevent metadata being re-added later.", t: "Once the metadata is stripped and the file is saved, the result is metadata-free. But if someone else opens that PDF in their editor and saves it back, their editor will re-populate /Info with their own Author name and a new ModDate. Always scrub at the LAST step before distribution." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, metadata scrubbing handles PDFs up to 100 MB. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF viewer.",
          "Common pairings: Flatten → Remove Metadata for fully-clean shareable PDFs. Remove Metadata → Sign for documents that need a fresh cryptographic identity. Compress → Remove Metadata for the smallest, cleanest deliverable.",
        ],
      },
    ],
  },

  // ============================================================
  // batch-process-pdf — high-throughput workflow tool
  // ============================================================
  "batch-process-pdf": {
    title: "Batch process PDFs — when one operation across many files is the right move",
    intro:
      "Batch processing is the boring-but-essential operation that turns \"this would take an afternoon\" into \"this takes thirty seconds.\" If you have ever had to apply the same operation to dozens of PDFs — rotating a hundred scans, page-numbering a folder of contract drafts, stripping metadata from a stack of submissions — you have felt the friction of doing it one file at a time. Here is what batch processing does, the five operations that cover almost every real workflow, and the two patterns that determine whether batch is the right choice or whether you need a different shape of tool.",
    sections: [
      {
        h: "What batch processing actually does",
        p: [
          "Drop up to 50 PDFs at once. Pick one operation. Click apply. The tool runs that operation on every file in sequence, then bundles the outputs into a single .zip with the original filenames preserved. Settings configured once apply to every file — pick the rotation amount once, type the watermark text once, set the metadata-strip options once.",
          "The processing is sequential rather than parallel — your browser processes one PDF at a time, then moves to the next. For 10 small files this is essentially instant; for 50 large files it can take a minute or two. A progress bar shows which file is currently processing so you can tell whether the tool is running or stalled.",
        ],
      },
      {
        h: "Five operations that cover almost every batch need",
        p: [
          "The batch tool exposes a focused set of operations that match the common reasons people batch-process PDFs:",
        ],
        list: {
          items: [
            { b: "Rotate (90° / 180° / 270°).", t: "A scanner produced a folder of pages that all need to be rotated the same direction. Batch-rotate fixes them all in one pass." },
            { b: "Add page numbers.", t: "A folder of contract drafts that all need consistent page numbers before circulation. One configuration, applied uniformly." },
            { b: "Add watermark (text or image).", t: "Stamp a confidentiality watermark across a batch of submissions. Or apply a logo overlay to a folder of branded outputs." },
            { b: "Remove metadata.", t: "Strip /Info dictionaries from a folder of pre-distribution deliverables. The fastest pre-share sanitation pass." },
            { b: "Flatten form fields.", t: "A folder of filled application forms that all need to be locked down before submission. One click locks them all." },
            { b: "Strip hyperlinks.", t: "A folder of documents that should not contain clickable links (e.g. for a paper-style submission where links are inappropriate). Remove them in one pass." },
          ],
        },
      },
      {
        h: "Batch vs Merge — which to use when",
        p: [
          "These two operations look similar but produce different outputs:",
        ],
        list: {
          items: [
            { b: "Batch process — many in, many out.", t: "Input: N PDFs. Output: N processed PDFs (in a .zip). Use when you want each file processed independently and kept separate." },
            { b: "Merge — many in, one out.", t: "Input: N PDFs. Output: 1 combined PDF. Use when you want all the files glued together into a single document." },
          ],
        },
      },
      {
        h: "When batch processing isn't the right shape",
        p: [
          "Three situations where a different tool fits better:",
        ],
        list: {
          items: [
            { b: "Files need different settings.", t: "If file 1 needs 90° rotation and file 2 needs 180°, batch can't help — every file gets the same configuration. Run the single-file Rotate tool per file." },
            { b: "Multi-step workflow needed.", t: "If every file needs to be rotated AND watermarked AND have metadata stripped, batch's one-operation-at-a-time model means three passes (run batch with rotate, download zip, re-upload to batch with watermark, download zip, re-upload to batch with metadata strip). For long pipelines, use the API instead — it supports composing operations into a single pass." },
            { b: "You need per-file naming or routing.", t: "Batch preserves original filenames in the .zip but does not let you customize per-file naming patterns. If you need \"draft-N-watermarked-2026-05.pdf\" naming, post-process the .zip in your local shell." },
          ],
        },
      },
      {
        h: "Five batch-mode tips",
        p: [
          "Habits that make batch processing land cleaner:",
        ],
        list: {
          items: [
            { b: "Test with one file first.", t: "Before batching 50 files, run the operation on one sample. Verify the output looks right. Then batch with confidence." },
            { b: "Drag a folder, not individual files.", t: "Modern browsers accept folder drops. Drag a whole folder of PDFs in one move instead of file-by-file." },
            { b: "Check the manifest.txt in the output ZIP.", t: "If any file fails (encrypted, malformed, etc.) the zip includes a manifest listing what worked and what didn't. The failed-files list is what you go back and handle manually." },
            { b: "Use Compress AFTER batch.", t: "Batch operations sometimes expand file size (page numbers, watermarks add bytes). Run Compress on the output zip's contents to bring sizes back down — or compress as a separate batch pass." },
            { b: "Pair with Bates for legal productions.", t: "Bates numbering is the canonical example of an operation that benefits from batch + continuous numbering across files. The batch tool auto-continues Bates ranges across the whole upload set." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, batch processing handles up to 50 PDFs per submission, each up to 100 MB. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is a .zip containing every processed file plus a manifest.txt listing successes and failures.",
          "For larger batches or pipelines that need multi-step composition (rotate then watermark then strip-metadata in one pass), the API exposes a batch endpoint that accepts up to 10,000 files per job and supports operation chaining via a pipeline parameter.",
        ],
      },
    ],
  },

  // ============================================================
  // add-logo-to-pdf — branding workflow, image-watermark
  // ============================================================
  "add-logo-to-pdf": {
    title: "Add a logo or image watermark to a PDF — positioning, opacity, and the rules nobody tells you",
    intro:
      "Stamping a logo onto every page of a PDF is one of the most-used branding operations on the site. The mechanics are simple — pick an image, set position, click apply — but the choices that produce a professional-looking output versus an amateur one are not always obvious. Here is what the tool actually does, the nine positions and three opacity ranges that cover essentially every branding workflow, and the four patterns that distinguish a logo overlay that reads as polished from one that reads as slapped-on.",
    sections: [
      {
        h: "How image watermarking works under the hood",
        p: [
          "The tool embeds your logo image (PNG or JPEG) into the PDF as a reusable resource, then references that resource from each page's content stream at the position and scale you choose. Because the image is referenced rather than re-embedded per page, a hundred-page PDF with a logo on every page contains the logo bytes only once — file size goes up by roughly the logo's PNG/JPEG size plus a few bytes per page for the reference. The original page contents are untouched; the logo is drawn on top with the opacity you set.",
          "PNG transparency is honored: a logo with a transparent background draws correctly without a solid backplate. JPEGs are always rectangular; if your logo needs transparency you need a PNG. The drawing happens at vector-quality regardless of the source — PDF embeds the image stream losslessly and lets the viewer handle scaling.",
        ],
      },
      {
        h: "Nine positions explained",
        p: [
          "The tool offers a 3×3 position grid. Each pick has a different visual signal:",
        ],
        list: {
          items: [
            { b: "Top-left.", t: "Corporate stationery convention. Looks like letterhead." },
            { b: "Top-center.", t: "Brand-front-and-center. Used for templates where the logo is part of the document identity." },
            { b: "Top-right.", t: "Subtle branding that does not compete with the page title. Common for reports and white papers." },
            { b: "Middle-left / Middle-right.", t: "Rare. Used occasionally for sidebar-style branding on landscape pages." },
            { b: "Center.", t: "Hidden-but-present branding. Combined with low opacity (15-25%) this is the classic \"watermark\" look — large logo at low opacity behind the content." },
            { b: "Bottom-left.", t: "Quiet branding in the footer area. Common for documents where the bottom-right is reserved for page numbers." },
            { b: "Bottom-center.", t: "Reserved for the company-info-block — typically used when the logo is part of a footer that also includes address and contact info." },
            { b: "Bottom-right.", t: "Default for short-document branding. Looks like a sign-off." },
          ],
        },
      },
      {
        h: "Three opacity ranges and what they signal",
        p: [
          "Opacity is the single biggest difference between a polished result and a sloppy one. Three ranges, each with a different visual purpose:",
        ],
        list: {
          items: [
            { b: "85-100% — full-intensity branding.", t: "The logo is part of the visual language. Use in the corner of every page on a report or template. Looks intentional and confident." },
            { b: "40-70% — semi-transparent branding.", t: "The logo is visible but does not compete with content. Common for footer logos on technical docs where the logo should be present but not dominant." },
            { b: "10-30% — true watermark.", t: "The logo is in the background, often centered, large enough to span much of the page. Reads as a backdrop. Use for confidentiality watermarks (\"DRAFT\", \"INTERNAL\") on documents that need a visual but not content-blocking signal." },
          ],
        },
      },
      {
        h: "Four patterns that separate polished from sloppy",
        p: [
          "Habits that make logo overlays look intentional:",
        ],
        list: {
          items: [
            { b: "Pick a scale that respects the page proportions.", t: "Most users default to 100% scale, which often makes the logo too large for the page. Try 30-50% scale first, then bump up only if the logo looks small. The smaller-looking version usually feels more professional." },
            { b: "Use a transparent-background PNG.", t: "If your logo has a colored background, it looks like a sticker stuck on the page. A transparent-background PNG blends with whatever is underneath. If your logo file only exists as JPEG, run it through a remove-background tool first." },
            { b: "Match opacity to background contrast.", t: "On a page with mostly white background, a dark logo at 30% opacity is subtle. On a page with mixed content, the same opacity may make the logo barely visible. Test with one page first; the visual result is what matters, not the percentage." },
            { b: "Apply to all pages, then verify with a scroll-through.", t: "Some pages — full-page images, charts that fill the canvas — interact with logo overlays differently than the average page. A 30-second scroll-through after applying catches the one page where the logo lands on top of important content." },
          ],
        },
      },
      {
        h: "Targeting specific pages",
        p: [
          "By default the logo applies to every page. Two reasons to override:",
        ],
        list: {
          items: [
            { b: "Cover page only.", t: "Type \"1\" in the page-range field. The logo lands only on the cover. Useful for documents that already have a separate template for body pages." },
            { b: "Exclude appendices or front matter.", t: "Type \"1-N\" minus the appendix range, or specify the exact body range (e.g. \"3-47\" to skip the cover and TOC and the trailing appendix). The page-range syntax is the same as Extract / Delete Pages." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, image watermarking handles PDFs up to 100 MB and logo images up to 50 MB. Both PNG (with transparency) and JPEG are supported. Processing runs in your browser via pdf-lib; nothing is uploaded.",
          "Common pairings: Logo + Page Numbers for a fully-branded report. Logo + Flatten so the recipient cannot remove the logo. Logo + Compress for the smallest final-deliverable file size with branding intact.",
        ],
      },
    ],
  },

  // ============================================================
  // n-up-pdf — printing-workflow, paper-saving
  // ============================================================
  "n-up-pdf": {
    title: "N-up PDF — when packing more pages per sheet saves paper without losing readability",
    intro:
      "N-up imposition — packing 2, 4, 6, 8, or 9 source pages onto each output sheet — is one of those quietly-essential print-prep operations. Done right, it cuts paper use in half (or more) while keeping every word readable. Done wrong, it produces output where the text is too small to read or the layout is so awkward that nobody uses it. Here is how N-up actually works, the four layouts that cover every reasonable use case, and the patterns that determine whether a 4-up handout is great or unreadable.",
    sections: [
      {
        h: "How N-up imposition works",
        p: [
          "The tool reads each source page, then composes new output sheets where N source pages share one output sheet via a grid layout. Each source page is aspect-fit into one slot in the grid (no stretching, no cropping — just scaling). The result is fewer sheets total with content that stays readable thanks to the aspect-preserved scaling.",
          "Output is real PDF, not a rasterized snapshot. Text on the tiled source pages remains selectable, searchable, and screen-reader-accessible at the smaller scale. Vector content stays sharp. The output is byte-compatible with every reader.",
        ],
      },
      {
        h: "Four layouts that cover every reasonable use",
        p: [
          "The tool exposes five layouts (2-up, 4-up, 6-up, 8-up, 9-up) but four of them cover almost every real workflow:",
        ],
        list: {
          items: [
            { b: "2-up — the safe paper-saver.", t: "Two source pages per output sheet. Text stays large enough to read at arm's length. Use for printing draft documents, save-paper handouts, or any case where readability matters more than density." },
            { b: "4-up — the classic handout.", t: "Four source pages per output sheet (2×2 grid). The standard conference-handout layout: text smaller than the original but still readable at desk-reading distance. Most cited use case for N-up." },
            { b: "6-up or 8-up — overviews.", t: "Six or eight source pages per output sheet. Text is too small to read at normal distance — these are for visual overview only. Use to see the structure of a long document at a glance, like a contact sheet for a slide deck." },
            { b: "9-up — the contact sheet.", t: "Nine source pages per output sheet (3×3 grid). Pure visual overview. Used by designers and editors for at-a-glance review of dozens of pages on a single sheet. Not for reading." },
          ],
        },
      },
      {
        h: "Three patterns that determine readability",
        p: [
          "The settings that distinguish usable N-up output from unusable:",
        ],
        list: {
          items: [
            { b: "Match output paper to source aspect.", t: "Portrait sources tile naturally onto landscape output — every slot is portrait, every gap looks deliberate. Tiling portrait sources onto portrait output (or landscape onto landscape) leaves awkward whitespace. Pick landscape paper for portrait sources, and vice versa. The tool offers a landscape default for this reason." },
            { b: "Use margin and gap settings deliberately.", t: "Zero margin and zero gap maximizes content density but reads as crowded. 12-18pt margin and 6-12pt gap reads as professionally laid out. The defaults strike a reasonable balance; only adjust when you have a specific need." },
            { b: "Verify text size at the destination output.", t: "A 4-up A4 sheet has each source-A4 slot at about half-size. 10pt body text becomes ~7pt at the slot — readable at desk distance but tight. If your source text was already small, 4-up is too dense; drop to 2-up." },
          ],
        },
      },
      {
        h: "When N-up is the right move",
        p: [
          "Cases where the paper-saving (or paper-using-differently) trade-off is genuinely worth it:",
        ],
        list: {
          items: [
            { b: "Printing draft documents to review.", t: "Drafts that get marked up and discarded should be 2-up or 4-up. Cuts paper in half without losing the ability to read and annotate." },
            { b: "Conference handouts.", t: "Six-page slide decks to give attendees at the end of a talk. 4-up at one slide per slot gives a clean printed handout." },
            { b: "Study materials.", t: "Long-form readings (book chapters, research papers) where students benefit from a compressed printout they can annotate. 2-up or 4-up depending on text density." },
            { b: "Visual overviews of long documents.", t: "Comparing pages of a long report side-by-side — use 6-up or 9-up to see structure rather than detail." },
            { b: "Reducing print costs.", t: "Some print contracts charge per page or per sheet. N-up reduces the count proportionally, often by significant amounts on long jobs." },
          ],
        },
      },
      {
        h: "When N-up is the wrong tool",
        p: [
          "Two situations where you should reach for a different operation:",
        ],
        list: {
          items: [
            { b: "Booklet imposition (folded saddle-stitch).", t: "Booklet imposition rearranges pages in printer-spread order so a folded stack reads in the correct sequence. N-up is straight grid tiling — it does not handle booklet folding. Use the Booklet PDF tool for that." },
            { b: "Selecting a subset of pages.", t: "N-up tiles ALL the source pages. If you want only a subset on the output, run Extract Pages first to produce the subset, then N-up that result." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, N-up handles PDFs up to 100 MB. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF reader. Text on tiled source pages remains selectable and searchable.",
          "Common pairings: Extract Pages → N-up to tile a subset. Compress after N-up for the smallest final file. Booklet PDF instead of N-up when the destination is a folded booklet, not a flat handout.",
        ],
      },
    ],
  },

  // ============================================================
  // stamp-pdf — business stamps, paired with add-logo
  // ============================================================
  "stamp-pdf": {
    title: "Add a stamp to a PDF — when DRAFT, CONFIDENTIAL, or APPROVED need to be on every page",
    intro:
      "Business stamps — DRAFT, CONFIDENTIAL, APPROVED, REJECTED, PAID, VOID — predate computers and are still in heavy use because they communicate document status at a glance. The digital version of rubber-stamping a PDF takes about ten seconds; getting it to look intentional rather than amateur takes knowing about three settings most users do not think about. Here is what the stamp tool does, the twelve preset stamps with the use cases each fits, and the differences between stamping (a visual layer) and redaction (content removal).",
    sections: [
      {
        h: "How stamping works",
        p: [
          "The stamp tool draws colored text onto each page's content stream — typically with a colored border and rotated for the classic angled rubber-stamp look. The drawing happens via pdf-lib at vector quality: the stamp text and border are crisp at any zoom level. The original page content is untouched; the stamp sits on top.",
          "Because the stamp is part of the page content rather than an annotation, recipients cannot delete it through the normal annotation-removal flow in Acrobat. A determined recipient with PDF editor software can still remove it (the original page content is intact underneath the stamp), but the casual recipient sees the stamp as part of the document. For irreversible stamping where the underlying content really needs to go, use Redact instead.",
        ],
      },
      {
        h: "Twelve preset stamps and their use cases",
        p: [
          "The tool ships twelve presets covering the most common workflows:",
        ],
        list: {
          items: [
            { b: "DRAFT.", t: "The most common stamp. Use on circulated working copies that are not yet final, to signal that changes are still expected." },
            { b: "CONFIDENTIAL.", t: "Reminder that the document should not be redistributed outside the intended audience. Common on internal reports, partner agreements, board materials." },
            { b: "APPROVED / REJECTED.", t: "Review-workflow signals. Use after a sign-off step to mark a document's status." },
            { b: "PAID / RECEIVED.", t: "Invoice and shipping workflow signals. PAID indicates payment processed; RECEIVED indicates physical or digital receipt of goods." },
            { b: "REVIEWED.", t: "Sign-off that a document has been read and acknowledged. Common in compliance workflows." },
            { b: "COPY / ORIGINAL.", t: "Differentiator stamps for cases where you need to mark which physical (or digital) version is the original of record." },
            { b: "VOID.", t: "Cancellation marker. Use on documents that have been replaced or invalidated — keeping them in the record for audit purposes but signaling they should not be acted on." },
            { b: "FINAL / URGENT.", t: "Workflow signals — FINAL marks a document as locked, URGENT signals immediate attention required." },
            { b: "Custom (up to 30 chars).", t: "Type your own. For workflow-specific signals (\"CLIENT REVIEW\", \"BOARD PACK\", \"FOR DISTRIBUTION\"). The 30-char cap keeps the stamp readable at preset sizes." },
          ],
        },
      },
      {
        h: "Three settings that distinguish good stamps from amateur ones",
        p: [
          "The defaults work most of the time. Adjusting one or two of these settings for context lifts the result:",
        ],
        list: {
          items: [
            { b: "Rotation angle.", t: "0° (horizontal) reads as official-document style. -30° to -45° (left-tilted) reads as classic rubber-stamp. +30° to +45° (right-tilted) is unusual; default left-tilt of -15° is the most universally-recognized rubber-stamp angle." },
            { b: "Opacity.", t: "100% is dense and dominant. 60-80% reads as a stamp that does not obscure the underlying content. For a CONFIDENTIAL stamp on a readable document, 70% is the canonical pick." },
            { b: "Position vs page content.", t: "A stamp dead-center on a page with text in the center collides with the text. Pick a corner position (top-right is most common for DRAFT, top-center for CONFIDENTIAL, diagonal-center for VOID) based on what's already on the page." },
          ],
        },
      },
      {
        h: "Stamp vs Redact — when to use each",
        p: [
          "These two operations look similar visually but solve different problems:",
        ],
        list: {
          items: [
            { b: "Stamp — visual annotation, content intact.", t: "Use when the underlying content should still be readable. A CONFIDENTIAL stamp does not hide the document's content; it signals how to treat it." },
            { b: "Redact — content removed, visual block.", t: "Use when the underlying content needs to actually go away. Redact bytes-out the text; the recipient cannot recover it by copy-paste or by removing an overlay." },
          ],
        },
      },
      {
        h: "When to also flatten after stamping",
        p: [
          "Stamping draws the text into the page content stream. That alone is harder to remove than an annotation. But four cases benefit from also flattening:",
        ],
        list: {
          items: [
            { b: "Documents going to recipients with PDF editors.", t: "If the recipient has Acrobat Pro or similar, they can still remove the stamp via the editor's content-edit mode. Flattening makes that harder (though not impossible)." },
            { b: "Pre-signing.", t: "Stamp first (DRAFT, etc.), then flatten to lock it in, then sign cryptographically. The signature anchors the stamped state." },
            { b: "Archival.", t: "Stamped + flattened PDFs behave more consistently across years of viewer-software updates than annotation-style stamps." },
            { b: "Re-distribution-risk documents.", t: "If the document might get re-shared further than originally intended, flatten lifts the friction of stamp-removal." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, stamping handles PDFs up to 50 MB. Encrypted PDFs need to be unlocked first. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF reader.",
          "Common pairings: Stamp → Flatten for irreversible stamping. Stamp → Sign for stamped-and-signed deliverables. Stamp + Add Logo for branded stamped documents (logo in one corner, stamp in another).",
        ],
      },
    ],
  },

  // ============================================================
  // booklet-pdf — print-imposition, complements n-up
  // ============================================================
  "booklet-pdf": {
    title: "Booklet PDF — saddle-stitch imposition and why page order matters",
    intro:
      "Booklet imposition is one of those operations that looks like simple math but has surprising depth. To turn a 16-page document into a 4-sheet folded booklet, you cannot just print it 2-up — the page order has to be specifically rearranged so that when the sheets are stacked, folded in half, and stapled along the fold, every page lands in reading order. Get this wrong and the booklet is unreadable. Here is how the math works, the four configurations that cover almost every real booklet, and the three patterns that catch first-time bookleters.",
    sections: [
      {
        h: "How booklet imposition actually works",
        p: [
          "Think about taking a stack of paper and folding it in half. The bottom sheet's outside has pages 1 and the last page (reading order, after binding). The bottom sheet's inside has page 2 and the second-to-last page. Working in toward the middle, every sheet has a specific pair of pages on each side, and the order is anything but sequential.",
          "Booklet imposition rearranges your source pages into this saddle-stitch order, with each output sheet showing two source pages per side (front and back). When you print the imposed PDF double-sided on a standard duplex printer, then stack, fold, and staple, the result is a folded booklet that reads sequentially from front to back.",
          "The page count rounds up to a multiple of 4 because that is the natural unit for saddle-stitch (4 source pages per output sheet — 2 per side). The tool inserts blank pages at the end automatically when needed. A 17-page source becomes a 5-sheet booklet with 3 blank pages at the end; a 50-page source becomes a 13-sheet booklet with 2 blanks.",
        ],
      },
      {
        h: "Four configurations that cover every real booklet",
        p: [
          "Most users overcomplicate this. Four configurations cover virtually every real workflow:",
        ],
        list: {
          items: [
            { b: "Letter source → Letter output.", t: "Two Letter source pages tile onto one Letter sheet by treating the output as landscape. The most common pick for US documents." },
            { b: "A4 source → A4 output.", t: "Two A4 source pages on one A4 landscape sheet. The European-default equivalent." },
            { b: "Letter source → Legal output.", t: "Two Letter source pages on one Legal landscape sheet. Slight margin gain — useful when source content runs to the edge." },
            { b: "Half-size booklets.", t: "Letter or A4 source on Letter or A4 PORTRAIT output (4 source pages per sheet via 2×2 grid). Produces a quarter-folded booklet — smaller and denser. Less common but useful for pocket guides." },
          ],
        },
      },
      {
        h: "Three patterns first-time bookleters miss",
        p: [
          "Friction points worth knowing before you click apply:",
        ],
        list: {
          items: [
            { b: "Print duplex with flip-on-long-edge.", t: "Most printers default to flip-on-short-edge for duplex, which is wrong for booklets. The result is every other page upside-down. Set the printer to flip on the LONG edge so the back side has the same orientation as the front." },
            { b: "Print order matters for the staple step.", t: "Print the imposed PDF in normal page order (1, 2, 3, ...). After printing, stack the sheets in order, fold the stack in half, and staple along the fold. The page order in the imposed PDF is already rearranged for this — do not try to manually reverse anything." },
            { b: "Blank trailing pages are intentional.", t: "If your source has 17 pages, the booklet output has 20 (3 blank trailing pages). Do not delete them — the math depends on the page count being a multiple of 4." },
          ],
        },
      },
      {
        h: "When the fold-line guide helps",
        p: [
          "The tool offers an optional faint fold-line guide on each output sheet. Whether to enable it depends on the production:",
        ],
        list: {
          items: [
            { b: "Hand-folding small runs.", t: "Yes — the guide helps you fold consistently across many sheets." },
            { b: "Sending to a print shop.", t: "Usually no — pros fold by their own jigs and the guide can show up as a faint line on the final product." },
            { b: "Educational use (showing how booklets work).", t: "Yes — the guide makes the imposition visible and pedagogically clear." },
          ],
        },
      },
      {
        h: "When the booklet tool is the right move",
        p: [
          "Specific situations where booklet imposition is the right answer:",
        ],
        list: {
          items: [
            { b: "Printed event programs.", t: "Concert programs, wedding programs, conference handouts — the booklet form factor is the standard." },
            { b: "Small-run books and zines.", t: "Self-published books, art zines, instructional manuals at the 8-80 page range work great as saddle-stitch booklets." },
            { b: "Manuals and quickstarts.", t: "Product manuals, employee onboarding handbooks, software quickstart guides. Booklet form is portable and familiar." },
            { b: "Sermons, lecture notes, conference talks.", t: "Speech-or-talk supplementary materials that the audience holds during the event." },
            { b: "Newsletters.", t: "Quarterly or monthly newsletters at 8-16 pages. Booklet form is more polished than stapled flat sheets." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, booklet imposition handles PDFs up to 100 MB with no page-count cap. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF reader and prints cleanly on every duplex printer that supports flip-on-long-edge.",
          "Common pairings: Booklet + Add Page Numbers BEFORE booklet imposition (the page numbers go on the source pages, not the imposed sheets). Booklet + Bookmarks if your source has a bookmark tree, the bookmarks survive into the imposed output. Booklet → Compress for the smallest final-ready file.",
        ],
      },
    ],
  },

  // ============================================================
  // ai-redact-pdf — AI redaction, paired with free Redact
  // ============================================================
  "ai-redact-pdf": {
    title: "AI Redact PDF — the difference between hiding PII and actually removing it",
    intro:
      "Redacting a PDF is one of those operations where the consequences of doing it wrong are severe and often invisible until weeks later when a journalist or opposing counsel recovers the underlying text. The right tool removes the bytes; the wrong tool draws a black rectangle on top and leaves the original text in the content stream where anyone with a free PDF editor can recover it. Here is exactly what AI Redact does, the eight categories of PII it auto-detects (including India-specific formats), and the precise difference between AI Redact's byte-level removal and the visual-overlay redaction that ships with many free tools.",
    sections: [
      {
        h: "How AI Redact actually works",
        p: [
          "AI Redact does three things in sequence. First, it reads every page of the source PDF and runs an AI detection pass to find candidate PII — names, contact info, identifier numbers, addresses. Second, it presents the findings as a confirmation step so you can uncheck specific instances or whole categories before applying. Third, it rasterises the redacted regions: the page bytes in those regions are converted to a pixel-level black rectangle, the underlying text is removed from the content stream entirely, and the output PDF carries no recoverable trace of the original text in those areas.",
          "The rasterise step is the load-bearing difference from cheap-redact tools. A visual overlay (a black rectangle drawn on top) leaves the original text in the PDF's content stream — perfectly preserved, just hidden by the overlay. Anyone with a free PDF editor can remove the overlay and read the text. AI Redact removes the text from the content stream, so even with the rectangle gone, there is nothing to read.",
        ],
      },
      {
        h: "Eight PII categories auto-detected",
        p: [
          "AI Redact ships with detectors for the most common PII types globally, plus India-specific identifiers because of the platform's high India traffic:",
        ],
        list: {
          items: [
            { b: "Personal names.", t: "First+last name pairs, single names with title prefixes (Mr., Mrs., Dr.), names in signature blocks." },
            { b: "Email addresses.", t: "Standard RFC-5322 patterns, including unusual TLDs and embedded mailto: links." },
            { b: "Phone numbers.", t: "US (NPA-NXX-XXXX), India (10-digit + country code +91), UK, Germany, Canada — the common international formats." },
            { b: "Indian PAN.", t: "5 letters + 4 digits + 1 letter pattern. Often masked to last 4 characters." },
            { b: "Indian Aadhaar.", t: "12 digits, usually formatted XXXX-XXXX-XXXX. Masked to last 4 digits per UIDAI guidance." },
            { b: "Bank account numbers.", t: "8-18 digit strings in financial-document context. The context check prevents false positives on random long numbers." },
            { b: "Addresses.", t: "Street + city + zip patterns, India PIN codes, UK postcodes, US ZIP+4." },
            { b: "GSTIN (Indian GST identifier).", t: "15-character format. Important for business documents where the GSTIN might be redactable depending on disclosure rules." },
          ],
        },
      },
      {
        h: "The confirmation step is the safety net",
        p: [
          "Before any redaction is applied, the tool surfaces every detected PII instance with checkboxes. This serves three purposes:",
        ],
        list: {
          items: [
            { b: "Reviewing false positives.", t: "AI detectors are imperfect. A name in a quoted citation might not actually be PII you want to redact. The confirmation step lets you uncheck those." },
            { b: "Reviewing for missed PII.", t: "If a particular piece of PII appears in an unusual format that the detector missed, it shows as undetected. You can either run a second pass after manual correction or use the free Redact tool to draw rectangles by hand." },
            { b: "Selecting what to keep vs what to remove.", t: "Sometimes you want to redact employee names but keep the company name visible. Or redact phone numbers but keep email addresses. Per-category and per-instance checkboxes let you do this granularly." },
          ],
        },
      },
      {
        h: "AI Redact vs Free Redact",
        p: [
          "The two redaction tools serve different needs:",
        ],
        list: {
          items: [
            { b: "AI Redact — automatic detection + byte-level removal.", t: "Costs credits per page. Auto-detects 8 categories of PII. Output is cryptographically sanitised — the original text is GONE. Use for compliance-grade redaction (legal production, regulatory submission, public-facing release of internal documents)." },
            { b: "Free Redact — manual rectangle drawing + visual overlay.", t: "Free. You draw rectangles by hand over what to redact. The visual overlay HIDES the text but does not remove it. Use for casual redaction (sending a draft with a confidential price hidden, sharing a screenshot with email addresses hidden) where the recipient is unlikely to be hostile." },
          ],
        },
      },
      {
        h: "Three patterns to verify",
        p: [
          "Habits that catch missed PII before it leaks:",
        ],
        list: {
          items: [
            { b: "Run PDF Inspector on the output.", t: "After redacting, inspect the output to confirm no extractable text remains in the redacted areas. PDF Inspector shows extractable text per page; redacted regions should be empty." },
            { b: "Search for the specific PII in the output.", t: "Ctrl-F in the output PDF for the redacted name / email / etc. should return zero matches. If a match comes up, the redaction didn't catch that instance." },
            { b: "Test copy-paste from the redacted region.", t: "Select text across a redacted rectangle. The copied text should not include the redacted content. If it does, the redaction didn't remove the underlying text." },
          ],
        },
      },
      {
        h: "When to also strip metadata after redacting",
        p: [
          "Redacting page content is necessary but sometimes not sufficient. PDFs carry metadata that can leak information you also wanted to hide:",
        ],
        list: {
          items: [
            { b: "/Info dictionary author + title.", t: "Often pre-filled with the document's original author name and creation timestamp. Run Remove Metadata after AI Redact for a fully-sanitised file." },
            { b: "XMP metadata stream.", t: "Can carry version history, contributor lists, custom properties. Remove Metadata clears this too." },
            { b: "Annotation author fields.", t: "If your document has annotations, each carries an author. Flatten before redacting, or strip annotation authors specifically." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "AI Redact charges 2 credits per page of source PDF. The tool handles PDFs up to 100 MB. Processing happens on our servers; the file is in memory only during processing and is never persisted. Output is byte-compatible with every PDF reader and carries the redacted state forward through merge / split / compress / any further operation.",
          "Common pairings: AI Redact → Remove Metadata → Flatten for a fully-sanitised compliance-grade deliverable. AI Redact → Compress for the smallest sanitised final file.",
        ],
      },
    ],
  },

  // ============================================================
  // ai-fill-pdf-form — paired with free fill tool
  // ============================================================
  "ai-fill-pdf-form": {
    title: "AI Fill PDF Form — when forms have no fillable fields and you need them filled anyway",
    intro:
      "About half of the PDF forms in the wild are flat — printed-looking PDFs with lines and labels that no PDF reader can actually click into. Your bank's loan application, the city's parking-permit form, the immigration paperwork from twenty years ago — these are scans or photo-PDFs without an AcroForm dictionary. Free fill tools cannot help with them because there are no fields to fill. AI Fill detects the field positions visually using OCR + vision-language reasoning, then types your provided values into the right places. Here is how that works, the four personal-info fields it remembers across sessions, and the difference between AI Fill and our free Fill PDF Form tool.",
    sections: [
      {
        h: "How AI Fill solves the flat-PDF problem",
        p: [
          "AI Fill reads each page of your form as an image, then runs a vision-language pass to identify field positions: where the labels are (\"Name:\", \"Address:\", \"Date of Birth:\"), where the empty lines or boxes for the values are, and which value goes in which slot. It then renders your personal-info values as text at the right coordinates on each page, producing a new PDF with the form filled.",
          "The end result looks like the form was filled out by hand or typewriter on the page, because that is effectively what it is — the values are drawn onto the page as text rather than typed into form fields. The output is one flat PDF (no live form fields), which is usually exactly what the recipient wants from a filled form anyway.",
        ],
      },
      {
        h: "Eight personal-info fields remembered across sessions",
        p: [
          "After you fill any form once, AI Fill remembers your standard personal info so the next form pre-fills automatically. Eight fields are remembered by default:",
        ],
        list: {
          items: [
            { b: "Full name + first / last separately.", t: "Different forms ask for name in different shapes (full name field, separate fields, last-name-first). AI Fill matches the form's structure to the right combination." },
            { b: "Email address.", t: "Single canonical email; you can override per-form for cases where different addresses apply." },
            { b: "Phone number.", t: "Stored with country code so international forms work without manual prefix entry." },
            { b: "Date of birth.", t: "Stored in ISO format internally; rendered in whatever format the form expects (US MM/DD/YYYY, India DD/MM/YYYY, ISO YYYY-MM-DD)." },
            { b: "Postal address.", t: "Street + city + state + zip + country. AI Fill picks apart the form's expected fields and maps your address pieces correctly." },
            { b: "Company name + job title.", t: "Often paired on business forms. Stored separately so you can choose to fill only one when appropriate." },
            { b: "Government ID numbers.", t: "Stored encrypted with optional passphrase. Common IDs: SSN (US), PAN (India), NI Number (UK). Auto-filled when the form asks for the matching ID type." },
            { b: "Signature image.", t: "Upload once; AI Fill places it in signature fields on subsequent forms." },
          ],
        },
      },
      {
        h: "Three things AI Fill does that free Fill cannot",
        p: [
          "The capabilities that justify the credit cost:",
        ],
        list: {
          items: [
            { b: "Flat-PDF detection.", t: "If the PDF has no AcroForm dictionary, AI Fill detects field positions visually. Free Fill cannot — it depends on the AcroForm structure being present." },
            { b: "Field-label-to-value mapping.", t: "AI Fill reads the form's labels (\"Date of Birth\", \"Mother's Maiden Name\") and maps them to your stored personal info. Free Fill expects you to type into each field manually; it does not know what each field is asking for." },
            { b: "Computed and conditional fields.", t: "Many forms have computed values (totals, dates relative to other dates) or conditional sections (\"if married, fill spouse details\"). AI Fill executes the form's logic. Free Fill does not." },
          ],
        },
      },
      {
        h: "When to use the free Fill tool instead",
        p: [
          "Three cases where the free tool is the right pick:",
        ],
        list: {
          items: [
            { b: "The PDF has a proper AcroForm dictionary.", t: "Modern fillable PDFs from government portals and major institutions usually have AcroForm. PDF Form Fields inspector confirms in five seconds. If yes, the free tool fills it perfectly without using credits." },
            { b: "You only need to fill one form once.", t: "AI Fill's persistence value compounds over many forms. For a single one-off fill of a standard fillable PDF, the free tool is faster." },
            { b: "The fields are non-standard and personal-info defaults don't apply.", t: "A form asking for unusual data (specific account numbers, project codes) does not benefit from AI Fill's personal-info matching. Type into the free tool's fields directly." },
          ],
        },
      },
      {
        h: "Privacy of stored personal info",
        p: [
          "Personal info is stored encrypted on our servers, gated by a passphrase you set when you first save it. The passphrase is the encryption key — we do not store it in plaintext, and the personal info cannot be decrypted without it. When you fill a form, the decryption happens transiently in memory during the form-fill operation; the decrypted values are not persisted.",
          "If you forget the passphrase, the stored personal info is unrecoverable by design. We cannot restore it because we do not have the key. The trade-off is that lost passphrase = lost personal-info library; in exchange, the platform cannot accidentally leak your personal info even if our database is compromised.",
        ],
      },
      {
        h: "Limits and pricing",
        p: [
          "AI Fill charges 5 credits per page of form. The tool handles PDFs up to 25 MB. Processing runs on our servers; the file is in memory only during the fill operation. Output is a flat filled PDF — byte-compatible with every PDF reader and ready to submit to any portal.",
          "Common pairings: AI Fill → Sign for filled-and-signed deliverables (visual signature placed at the form's signature position). AI Fill → Flatten if the output needs to be locked down further. AI Fill multiple forms in a batch when filling many similar forms (e.g. applying to multiple employers with the same resume + personal info).",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-page-count — utility, very high search volume
  // ============================================================
  "pdf-page-count": {
    title: "PDF page count — the one number every PDF tool needs, and why word count + page size come free",
    intro:
      "Knowing how many pages are in a PDF is one of the most common things people ask about a file. Print quotes are per-page. Translation quotes are per-word. Invoicing is often per-page. Reading time is derived from word count. All of these answers come from a single parse of the document, which is why our page-count tool also surfaces word count, reading time, page dimensions, and mixed-orientation warnings at the same time. Here is how the count is computed, what \"page\" really means in PDF terms, and the four adjacent metrics that come along for free.",
    sections: [
      {
        h: "What \"page count\" actually means in PDF",
        p: [
          "A PDF's pages are organized in a tree structure called the /Pages dictionary. The top-level /Pages dictionary has a /Count field — the page count. PDF readers display this number in their status bar. The page-count tool parses the same /Pages dictionary and surfaces the same number.",
          "The number is unambiguous: pages that are hidden in the reader's UI still count, pages with no visible content (blank pages) still count, pages at non-standard sizes still count. One physical page in the file = one count, regardless of what is on it. The PDF specification has been stable on this since version 1.0 (1993), so every PDF you have ever encountered reports its page count consistently.",
        ],
      },
      {
        h: "Why word count comes free with the page count",
        p: [
          "Computing word count requires extracting every page's text — which the tool already does once for the page parse. We split the extracted text on whitespace and count the resulting tokens. The result is comparable to what Microsoft Word reports for the same document text. Two-page documents typically run 400-900 words; ten-page reports run 2,000-4,000 words; the variance comes from font size and layout density.",
          "Scanned PDFs return 0 for word count because there is no extractable text — page count is correct, but word count cannot be computed from images. Run AI · OCR first to add a searchable text layer; the page-count tool will then surface the OCR'd word count too.",
        ],
      },
      {
        h: "Four adjacent metrics that come along",
        p: [
          "Same single parse, four extra answers:",
        ],
        list: {
          items: [
            { b: "Page dimensions per page.", t: "Each page's width × height in points (and inches). Useful when you suspect mixed page sizes — the tool flags this explicitly." },
            { b: "Page size classification.", t: "Letter, A4, Legal, A3, A5, Tabloid, or Custom. Helps you know at a glance whether the document will print on standard paper without resizing." },
            { b: "Orientation per page.", t: "Portrait or landscape. Mixed-orientation documents are flagged with a warning because they often need normalization before printing or distribution." },
            { b: "Reading time at 250 WPM.", t: "Word count divided by 250 (average adult reading speed). Reading time is a much more useful summary than word count for non-technical audiences — \"this report is 14 minutes of reading\" lands faster than \"this report is 3,500 words.\"" },
          ],
        },
      },
      {
        h: "Five common situations where page count is the load-bearing number",
        p: [
          "Where this tool earns its place in workflows:",
        ],
        list: {
          items: [
            { b: "Per-page billing.", t: "Bates stamping at $X per page. Translation at $Y per page. Print at $Z per page. Every per-page invoice starts with this number." },
            { b: "Pre-allocating timesheets.", t: "If reviewing a 200-page document takes ~5 hours and reviewing a 50-page document takes ~75 minutes, knowing the page count lets you block calendar time correctly." },
            { b: "Submission-portal validation.", t: "Many regulatory portals (USPTO, EU regulators, court e-filing systems) cap submission size in pages. Verify before upload." },
            { b: "Splitting decisions.", t: "Should I send this as one PDF or split it into chapters? A 500-page single PDF is awkward; five 100-page splits are easier to consume. Page count is the signal that triggers this decision." },
            { b: "Cost estimation.", t: "When asking for a print or translation quote, page count is the first thing you need. Sending a PDF and asking \"how many pages?\" wastes a back-and-forth — open the inspector, copy the number, paste it into your request." },
          ],
        },
      },
      {
        h: "Two patterns where the number deserves a second look",
        p: [
          "The cases where raw page count can mislead:",
        ],
        list: {
          items: [
            { b: "Documents with mixed orientations.", t: "A 100-page document where 80 pages are portrait and 20 are landscape will print and bind awkwardly. The page-count tool flags this; resolve before sending or printing." },
            { b: "Documents with mixed page sizes.", t: "A 50-page document where most pages are Letter and a few are A4 may render inconsistently across viewers. Pair with Resize Pages to normalize before distributing." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, page count handles PDFs up to 100 MB with no page-count cap. Parsing runs in your browser via PDFium WebAssembly; nothing is uploaded. The tool surfaces page count, word count, reading time, per-page size/orientation, and a mixed-size warning in under a second for documents up to 100 pages and within 2-3 seconds for documents up to a few thousand pages.",
          "For deeper introspection (font inventory, attachment list, JavaScript detection, encryption status, hyperlink count, embedded image inventory), use PDF Inspector — same single parse, much richer surface.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-inspector — deeper-introspection counterpart
  // ============================================================
  "pdf-inspector": {
    title: "PDF Inspector — what's actually inside a PDF (and how to read what we surface)",
    intro:
      "Most PDF tools tell you a single number. PDF Inspector tells you everything we can extract from a single parse of the document: page count, file size, page dimensions per page, mixed-orientation warnings, embedded fonts, attached files, hyperlinks, JavaScript handlers, form fields, encryption status, metadata fields. The point is not to overwhelm — it is that one parse already produces this data, and surfacing it once saves you running five different tools later. Here is what each field means, why each one matters in some real workflow, and the three audit patterns that use PDF Inspector as their starting point.",
    sections: [
      {
        h: "What a single parse surfaces",
        p: [
          "When you open a PDF in any modern reader, the reader's first job is to parse the file's structure — the page tree, the cross-reference table, the document catalog, embedded resources. That parse is fast (typically under a second for documents up to a few hundred pages) and produces a structured view of everything the PDF contains. PDF Inspector exposes that structured view directly.",
          "The output covers six major categories: document-level metadata (size, page count, encryption), per-page properties (dimensions, orientation, content type), embedded resources (fonts, images, attachments), interactive elements (form fields, hyperlinks, annotations, JavaScript), accessibility signals (tag tree presence, language declaration), and creator metadata (author, title, subject, creation/modification dates).",
        ],
      },
      {
        h: "Six categories of surfaced data and why each matters",
        p: [
          "Each section of the Inspector output serves a different workflow:",
        ],
        list: {
          items: [
            { b: "Document overview.", t: "Page count, file size, version, encryption status, mixed-page-size warning. The 5-second triage before deciding what to do with the file." },
            { b: "Page-by-page properties.", t: "Each page's width × height, orientation, rotation, and content type (text-based vs scanned). Critical for print prep and OCR decisions." },
            { b: "Embedded fonts.", t: "Every font referenced in the document, whether it is embedded or relies on the reader having it installed. Non-embedded fonts are the #1 reason a PDF reflows on someone else's machine." },
            { b: "Attached files.", t: "Any non-page content embedded in the PDF — XML invoice data, supplementary spreadsheets, exhibit photos. Often invisible in standard readers but indexed by our viewer." },
            { b: "Interactive elements.", t: "Form fields, hyperlinks, annotations, named destinations, JavaScript handlers. The interactive layer most readers don't surface in one place." },
            { b: "Accessibility signals.", t: "Tag tree presence (required for screen-reader access), language declaration, alt-text coverage on images. Helpful for compliance with WCAG, PDF/UA, Section 508." },
          ],
        },
      },
      {
        h: "Three audit patterns that start with Inspector",
        p: [
          "Where Inspector earns its place in a workflow:",
        ],
        list: {
          items: [
            { b: "Pre-distribution audit.", t: "Before sending a PDF externally, run it through Inspector to verify: (a) fonts are embedded (otherwise the recipient sees different rendering); (b) metadata does not leak sensitive info; (c) JavaScript handlers do not raise red flags; (d) encryption is set correctly for the audience; (e) attached files are intended for inclusion." },
            { b: "Forensic inspection of received PDFs.", t: "When evaluating a PDF you received — bid response, vendor contract, regulatory filing — Inspector surfaces the document's structural fingerprint: who created it, when, with what software, what version of PDF, what fonts. Useful in due-diligence and disputes." },
            { b: "Pre-OCR / pre-conversion check.", t: "Before running OCR or PDF-to-text on a document, check whether it already has a text layer. Inspector reports text content per page; pages showing 0 extractable text are scans needing OCR." },
          ],
        },
      },
      {
        h: "Specific signals worth understanding",
        p: [
          "Fields in the Inspector output that have outsized importance in specific workflows:",
        ],
        list: {
          items: [
            { b: "JavaScript handlers.", t: "Any handler is potentially executable code. Handlers that touch network, file system, or external apps are flagged high-severity. Review carefully before opening untrusted PDFs." },
            { b: "Encryption: user-password vs owner-password.", t: "User-password (open-password) PDFs are fully encrypted. Owner-password (permissions-password) PDFs are readable but restricted. Inspector reports which kind, so you know whether you need a password to read it or whether you need our Unlock tool to remove restrictions." },
            { b: "Mixed page sizes.", t: "A document that mixes Letter and A4 pages will render inconsistently across viewers and print awkwardly. Inspector flags this so you can normalize with Resize Pages." },
            { b: "Embedded vs non-embedded fonts.", t: "Non-embedded fonts mean the reader has to find a matching font on the recipient's machine, and the match may differ. For print-ready documents, every font should be embedded. Inspector lists exactly which ones aren't." },
            { b: "Mismatch between /Info dictionary and XMP stream.", t: "Both carry document metadata. When they disagree (different authors, different titles), the file was probably edited in a tool that updated only one. Inspector surfaces the mismatch as a warning." },
          ],
        },
      },
      {
        h: "How to act on the findings",
        p: [
          "Inspector is a read-only tool — it does not modify the PDF. Each finding suggests a follow-up:",
        ],
        list: {
          items: [
            { b: "Non-embedded fonts → use Compress with Embed-Fonts option.", t: "Or regenerate the PDF from source with font embedding enabled." },
            { b: "Sensitive metadata → Remove Metadata.", t: "Strip /Info and XMP fields before redistributing." },
            { b: "Mixed page sizes → Resize Pages.", t: "Normalize to a single size for consistent printing and viewing." },
            { b: "Hidden attachments → Extract Attachments.", t: "Pull the embedded files out and decide whether to keep or strip them." },
            { b: "Tag-tree missing → Accessibility Checker.", t: "Run a full accessibility audit to see what's needed for compliance." },
            { b: "JavaScript present → JS Detector.", t: "Get a per-handler view of what the code does so you can decide whether to keep or strip." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF Inspector handles PDFs up to 100 MB. Parsing runs in your browser via PDFium WebAssembly; nothing is uploaded. The Inspector output is exportable as JSON for downstream automation or as a readable report for inclusion in audit documentation.",
          "Common pairings: Inspector → any modification tool, depending on what you find. Inspector is the cross-tool decision-maker — run it first when you don't yet know what the right next operation is.",
        ],
      },
    ],
  },

  // ============================================================
  // markdown-to-pdf — developer-facing rendering
  // ============================================================
  "markdown-to-pdf": {
    title: "Markdown to PDF — what the renderer supports, what it doesn't, and why a small font set is the right trade-off",
    intro:
      "Markdown has become the lingua franca of technical writing. Every README, every internal wiki, every team's design-doc folder runs on it. Turning those markdown files into shareable PDFs is one of those operations that should be trivial but often isn't — the available tools either pull in heavy CSS engines, produce inconsistent output, or require accounts. Our free Markdown-to-PDF renderer is intentionally lean: a minimal inline parser, four standard PDF fonts, no font embedding, no server round-trip. Here is what that means for the output, the supported markdown syntax, and the two cases where the simpler approach beats the heavier ones.",
    sections: [
      {
        h: "How rendering works",
        p: [
          "The tool runs entirely in your browser. We parse the markdown locally with a minimal inline parser that handles the common syntax (headers, paragraphs, bold, italic, code, lists, blockquotes, links, horizontal rules). Each block is then drawn via pdf-lib onto an A4 page with 1-inch margins. New pages are added automatically when content overflows.",
          "Fonts are PDF's four standard fonts: Helvetica for body, Helvetica-Bold for headings and bold runs, Helvetica-Oblique for italic, Courier for inline and block code. These are guaranteed to be present in every PDF reader without embedding, which keeps output files small (typically under 100 KB for a 5-page document) and rendering consistent across viewers.",
        ],
      },
      {
        h: "What's supported",
        p: [
          "The full supported syntax list:",
        ],
        list: {
          items: [
            { b: "Headers (# / ## / ###).", t: "Three header levels at distinct sizes. Sufficient for documentation, design docs, and READMEs; H4 and deeper collapse to H3 size to prevent visual noise." },
            { b: "Paragraphs.", t: "Lines separated by blank lines become paragraphs. Single line breaks within a paragraph are honored as hard breaks." },
            { b: "Bold (**bold**) and italic (*italic*).", t: "Both single-character and double-character runs work as expected. Combined (**_bold-italic_**) renders correctly." },
            { b: "Inline code (`code`) and code blocks (```).", t: "Inline code gets Courier styling inline. Fenced code blocks become indented Courier paragraphs." },
            { b: "Lists — unordered (-) and ordered (1.).", t: "Both list types with hanging-indent layout. Nested lists work up to 3 levels of indentation." },
            { b: "Blockquotes (>).", t: "Indented with a left border line, classic blockquote style." },
            { b: "Horizontal rules (---).", t: "Drawn as a thin horizontal line." },
            { b: "Links ([text](url)).", t: "Rendered as blue text. Clickable hyperlink annotations are on the v2 roadmap; for now the URL is visible in the text but not click-through." },
          ],
        },
      },
      {
        h: "What's not supported (and what to use instead)",
        p: [
          "The renderer is intentionally focused. Three features we deliberately do not support, with the right tool for each:",
        ],
        list: {
          items: [
            { b: "Tables (pipe-syntax).", t: "Markdown tables are surprisingly tricky to render in PDF (column-width calculation, header repetition, line wrapping inside cells). The right tool for tabular data is CSV-to-PDF, which has proper table layout. If your markdown contains a table, extract the rows + columns to CSV first." },
            { b: "Images (![alt](url)).", t: "Embedding remote images requires fetching them at render time, which conflicts with the no-server-round-trip design. For documents with images, use AI Generate which composes documents with embedded images, or convert to HTML first then HTML-to-PDF." },
            { b: "HTML passthrough.", t: "Many markdown renderers allow inline HTML for cases the markdown syntax doesn't cover. We render any inline HTML literally (it appears in the output as text). For documents that need HTML features, render through a heavier pipeline." },
          ],
        },
      },
      {
        h: "When the lean approach beats the heavy one",
        p: [
          "Cases where the minimal renderer is actually the right tool:",
        ],
        list: {
          items: [
            { b: "Documentation PDFs for sharing.", t: "README.md → README.pdf to email to a stakeholder who doesn't use GitHub. The output is clean, small, and readable. No formatting surprises." },
            { b: "Meeting notes archived to PDF.", t: "Quick conversion of running notes (in markdown) to a shareable PDF. The format is the same as the source; you don't lose information." },
            { b: "Style-guide consistent output across documents.", t: "Because the renderer uses fixed fonts and styles, every document looks the same. Useful when consistency across a series of documents matters more than per-document customization." },
            { b: "Privacy-sensitive content.", t: "Everything runs in your browser. Markdown containing internal information stays on your machine end-to-end." },
            { b: "Offline use.", t: "Once the page loads, the tool works without network access. Useful for air-gapped or restricted environments." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, markdown rendering handles inputs up to 5 MB of markdown source. Output is A4 with 1-inch margins; page size override is on the v2 roadmap. Auto-pagination handles documents of any length within the input cap. Output files typically run 50-200 KB depending on length.",
          "Common pairings: Markdown-to-PDF → Add Page Numbers for final-deliverable polish. Markdown-to-PDF → Merge to combine multiple rendered docs into one bundle. For richer markdown features, use AI Rewrite with markdown-to-PDF instruction.",
        ],
      },
    ],
  },

  // ============================================================
  // text-to-pdf — paired plain-text rendering
  // ============================================================
  "text-to-pdf": {
    title: "Text to PDF — when literal text is what you want and markdown is too much",
    intro:
      "Sometimes you have plain text that should land as plain text in a PDF — no syntax interpretation, no formatting magic, just the text as you typed it, laid out neatly with consistent line spacing and pagination. Logs, code snippets, letters, transcripts, configuration files, raw notes. Text-to-PDF is the answer when markdown's formatting rules get in the way and you just want the bytes on the page. Here is what the tool does, the four font + page-size combinations that cover almost every real workflow, and the cases where text-to-PDF is the right tool rather than markdown-to-PDF.",
    sections: [
      {
        h: "Plain text vs markdown rendering",
        p: [
          "The difference is in what counts as content vs syntax. In markdown, * means italic, # means header, > means blockquote, ` means code. If you have text that legitimately contains those characters (e.g. a shell-script log with literal asterisks, or a math formula with literal asterisks for multiplication), markdown rendering changes the visual meaning. Text-to-PDF treats every character as content — what you typed is what appears on the page.",
          "Line breaks are also handled differently. Markdown collapses single line breaks within a paragraph; text-to-PDF preserves them. Tabs are honored (expanded to 4 spaces for consistent column alignment in Courier). Long lines auto-wrap to fit the page width using exact font metrics, so the wrap happens at sensible word boundaries.",
        ],
      },
      {
        h: "Four font + page-size combinations",
        p: [
          "Most use cases land on one of four combinations:",
        ],
        list: {
          items: [
            { b: "Courier 10pt + Letter portrait.", t: "Code listings, log files, configuration dumps. Monospace font preserves column alignment in tables, ASCII art, and shell output. Letter portrait matches the printer paper in US offices." },
            { b: "Courier 10pt + Letter landscape.", t: "Wide log lines and code listings that need more horizontal room. Landscape doubles the per-line character budget before wrapping kicks in." },
            { b: "Helvetica 11pt + Letter portrait.", t: "Letters, formal correspondence, plain-text email bodies converted to PDF. Helvetica is professional and easy-reading at 11pt." },
            { b: "Times 12pt + A4 portrait.", t: "Manuscripts, long-form text submissions, academic drafts that need a serif font. A4 portrait is standard for international submissions." },
          ],
        },
      },
      {
        h: "Five workflow patterns where text-to-PDF is the right tool",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Code or log archival.", t: "Converting shell output, stack traces, or build logs to PDF for inclusion in incident reports or audit documents." },
            { b: "Letter writing.", t: "Composing a formal letter as plain text, then producing a PDF for printing or attaching to email. No formatting surprises." },
            { b: "Transcript archival.", t: "Meeting transcripts, interview transcripts, podcast transcripts — long text that benefits from being a paginated PDF rather than a wall of text in a .txt file." },
            { b: "Plain-text submissions to portals that require PDF.", t: "Some forms accept attachments only in PDF format. Convert your typed answer to PDF without adding markdown interpretation." },
            { b: "Code-review handouts.", t: "Print a code listing as a PDF for offline review. Courier alignment and pagination make the listing readable on paper." },
          ],
        },
      },
      {
        h: "Three quirks worth knowing",
        p: [
          "Patterns in the output that show up on the first pass:",
        ],
        list: {
          items: [
            { b: "Long words may clip.", t: "If a single word is wider than the line width (which happens with URLs and base64 strings), it gets clipped at the right margin. Use a wider page size or smaller font, or pre-wrap the input with a manual line break." },
            { b: "Trailing whitespace is preserved.", t: "If your input has trailing spaces or tabs on lines, those land in the PDF too. Usually not visible (whitespace at end-of-line) but counts toward layout. Trim if you care." },
            { b: "Tabs vs spaces.", t: "Tabs expand to 4 spaces in the output regardless of font. If your source has mixed tabs and spaces and you want consistent alignment, decide on one before converting." },
          ],
        },
      },
      {
        h: "Markdown-to-PDF vs Text-to-PDF — decision rule",
        p: [
          "The simplest way to decide between the two:",
        ],
        list: {
          items: [
            { b: "If your text uses * for emphasis, # for headings, ` for code — use Markdown-to-PDF.", t: "The tool interprets those characters as syntax and produces a formatted PDF." },
            { b: "If your text contains those characters literally — use Text-to-PDF.", t: "The tool treats every character as content and produces a literal PDF." },
            { b: "If you're not sure — try Text-to-PDF first.", t: "Plain rendering is the safe default. You can always re-run as markdown if the output looks plain when you wanted formatted." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, text rendering handles inputs up to 5 MB of plain text. Output is byte-compatible with every PDF reader. Auto-pagination handles documents of any length within the input cap; typical output is roughly 1 page per 40 lines at default settings.",
          "Common pairings: Text-to-PDF → Add Page Numbers for final polish. Text-to-PDF → Merge for combining multiple text documents into a bundle. For text that includes diagrams or images, render through a heavier pipeline.",
        ],
      },
    ],
  },

  // ============================================================
  // grayscale-pdf — print-prep utility, luminance-correct
  // ============================================================
  "grayscale-pdf": {
    title: "Convert PDF to grayscale — luminance math, the right quality level, and what you give up",
    intro:
      "Grayscaling a PDF sounds straightforward — make it black and white. Under the hood there are real choices that determine whether the output looks correct or wrong. Pure averaging of RGB channels (R+G+B)/3 makes red and green render at the same intensity, which looks unnatural — humans see green as brighter than red. The right math is luminance-weighted (0.299R + 0.587G + 0.114B), the standard formula from the Rec. 601 color spec. Our tool uses that. Here is how the conversion works, the four quality presets and when to pick each, and the one thing you give up that surprises people.",
    sections: [
      {
        h: "The luminance math and why it matters",
        p: [
          "Rec. 601 luminance — the formula 0.299R + 0.587G + 0.114B — captures how the human eye perceives brightness. Green looks brighter to us than red or blue at the same physical intensity. The weights reflect that perception: green contributes 58.7% of the resulting luminance, red 29.9%, blue 11.4%. Convert a green logo with this formula and it looks bright; a red logo of the same RGB intensity looks darker. Both feel correct because they match how those colors appeared in the original.",
          "Compare with naive averaging — (R+G+B)/3. A pure-green pixel (0,255,0) and a pure-red pixel (255,0,0) both produce gray (85,85,85). Under the human eye, the original green looked dramatically brighter than the original red. Naive averaging flattens that, producing washed-out grayscale that does not match what the original looked like to viewers.",
        ],
      },
      {
        h: "Four quality presets and when each is right",
        p: [
          "The render-quality choice trades file size against visual fidelity. Pick by destination:",
        ],
        list: {
          items: [
            { b: "Draft (96 DPI).", t: "Screen preview, quick triage, content review. Files are smallest; visual sharpness is sufficient for screen viewing but not for printing." },
            { b: "Standard (144 DPI).", t: "General-purpose grayscale: shareable with colleagues, attached to emails, posted to internal wikis. Matches typical retina-screen sharpness." },
            { b: "High (192 DPI).", t: "Clean print output on office laser printers. Text edges look crisp; thin vector lines stay continuous." },
            { b: "Print (240 DPI).", t: "Archive-quality. Suitable for high-resolution print runs, print shops, large-format reproduction. Files are largest — typically 2-4 MB per page." },
          ],
        },
      },
      {
        h: "The trade-off — text selectability",
        p: [
          "Grayscale conversion rasterizes every page. The original page's vector text becomes pixel-bitmap text, which means the output PDF is image-only. Three consequences:",
        ],
        list: {
          items: [
            { b: "Ctrl-F cannot find text in the output.", t: "Searching is dead because there is no extractable text layer in an image-only PDF. If you need both grayscale visuals AND searchable text, run AI · OCR on the grayscale output to add a hidden text layer back." },
            { b: "Copy-paste produces nothing.", t: "Selecting text in a viewer just selects an image rectangle. Cannot copy specific words or paragraphs out." },
            { b: "Screen readers cannot read the content.", t: "Accessibility is lost. If the output PDF goes to anyone using assistive technology, this is a hard problem — pair with OCR or use the content-stream-remap path (paid roadmap item, not the free tool)." },
          ],
        },
      },
      {
        h: "When grayscale is the right operation",
        p: [
          "Five cases where the rasterized grayscale output is genuinely what you want:",
        ],
        list: {
          items: [
            { b: "B&W laser print prep.", t: "If you're going to print on a B&W laser printer, converting to grayscale first lets you preview exactly what will come off the printer. Some color combinations render unexpectedly on B&W; grayscale-then-print shows you the result." },
            { b: "Color-restricted submissions.", t: "Some regulatory submissions, court filings, and academic theses are required to be in black and white. Grayscale conversion satisfies the requirement." },
            { b: "Visual-noise reduction.", t: "Color-coded diagrams can be visually busy. Grayscale tones them down for cases where you want the structure but not the color." },
            { b: "Toner-saving on print.", t: "Color printing burns through toner. Grayscale reduces toner usage to a single cartridge, which is meaningfully cheaper for high-volume print." },
            { b: "Archival simplicity.", t: "Some archive systems prefer grayscale-only PDFs for simpler ingestion. The smaller dimensional space makes the archive's indexing faster." },
          ],
        },
      },
      {
        h: "Grayscale vs Compress — when each helps",
        p: [
          "Common confusion worth clarifying:",
        ],
        list: {
          items: [
            { b: "Grayscale removes color.", t: "Output is monochrome; file size may go up or down depending on the source — color-rich documents typically shrink when converted to grayscale because three channels collapse to one." },
            { b: "Compress reduces file size.", t: "Output preserves color (or whatever color profile the source had). Goal is making the file smaller; recompresses images, may downsample." },
            { b: "Combined: Grayscale → Compress for small B&W files.", t: "Convert to grayscale first to remove color, then compress to shrink the rasterized images further. The smallest visually-acceptable monochrome PDFs come from this pipeline." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, grayscale conversion handles PDFs up to 50 MB. Processing runs in your browser via PDFium WebAssembly; nothing is uploaded. Each page is rasterized sequentially with progress shown — multi-page documents take a few seconds per page at Print quality.",
          "Common pairings: Grayscale → Compress for small B&W files. Grayscale → AI · OCR to add a searchable text layer back to the rasterized output. Grayscale → Add Page Numbers for final polish on print deliverables.",
        ],
      },
    ],
  },

  // ============================================================
  // csv-to-pdf — paired tabular-data rendering
  // ============================================================
  "csv-to-pdf": {
    title: "CSV to PDF — turning tabular data into a paginated, readable, printable table",
    intro:
      "CSV is the universal interchange format for tabular data — every spreadsheet, every database export, every API response can dump CSV. But CSV is for machines: it does not paginate, does not align columns, does not repeat headers across pages, does not handle long cells gracefully. When you need a CSV's data in front of human readers — in a meeting, in a printed report, in an archive — converting to PDF is the right move. Here is what the conversion does, the four configuration choices that determine whether the output is readable or cramped, and the patterns that make tables print well across page breaks.",
    sections: [
      {
        h: "What the converter does",
        p: [
          "Drop a CSV file (or paste CSV text directly). The tool detects the delimiter (comma, tab, or semicolon) — most CSV files use comma, but tab-separated (TSV) and semicolon-separated (European Excel default) variants are common. It parses the rows using an RFC-4180-compliant parser that handles quoted fields, escaped quotes (\"\"), and embedded newlines inside cells.",
          "Once parsed, the data renders as a table on the PDF page. Column widths are auto-fit to content (the longest cell value in each column, capped at ~30% of page width to prevent extreme cases). The header row repeats at the top of every page so readers don't lose their place when scrolling through long tables. Alternating row shading (light gray, white) makes individual rows easier to track. Cells with long content wrap to multiple lines automatically.",
        ],
      },
      {
        h: "Four configurations that determine readability",
        p: [
          "Get any one of these wrong and the output is cramped or illegible. Get all four right and the table reads like a designed deliverable:",
        ],
        list: {
          items: [
            { b: "Page size + orientation.", t: "A4/Letter/Legal × portrait/landscape. Landscape recommended for tables with 6+ columns. Portrait for 2-5 columns. Legal landscape (or Tabloid if you're in a US print shop) for 8+ columns." },
            { b: "Font size.", t: "10pt is the canonical pick for body text in tables. 8-9pt for dense tables with many columns. 11-12pt for wider columns where readability matters more than density." },
            { b: "Header repetition.", t: "Always on by default. Turn off only when the table is short enough to fit on one page (no header repetition needed). Off-by-accident on a long table is one of the most-encountered support-ticket complaints." },
            { b: "Alternating row shading.", t: "Default on. Helps readers track which row their eyes are on. Turn off for tables that already have row-level color coding (e.g. status indicators) where the shading would compete." },
          ],
        },
      },
      {
        h: "Three patterns for tables that print well",
        p: [
          "Habits that make CSV-to-PDF output look professional:",
        ],
        list: {
          items: [
            { b: "Pre-sort rows by the most important column.", t: "PDF tables are static — readers cannot re-sort the way they would in Excel. Pick the sort order that matches how the audience will read the table (typically by date, then by status, then by primary identifier) before converting." },
            { b: "Truncate or wrap long cells.", t: "A cell with 500 characters of free-text comments produces an awkward table. Either truncate to ~50 chars in the source data, or accept that the table will have unequal row heights as that cell wraps." },
            { b: "Use header row labels deliberately.", t: "\"customer_id_v2\" works in your database; \"Customer ID\" works in the PDF. Renaming columns in the source CSV before converting saves the reader the cognitive load of decoding internal-system names." },
          ],
        },
      },
      {
        h: "What CSV-to-PDF handles vs what it doesn't",
        p: [
          "Two patterns worth understanding:",
        ],
        list: {
          items: [
            { b: "Handles: quoted fields with commas, escaped quotes, embedded newlines.", t: "RFC-4180-compliant parsing covers every standard CSV variant. The same edge cases that trip up naïve Excel imports are handled." },
            { b: "Doesn't handle: complex cell formatting.", t: "Bold inside a cell, colored text inside a cell, embedded images, formula expressions — none of those survive CSV format itself, so they cannot appear in the output. For richly-formatted tables, render from a source that preserves formatting (XLSX-to-PDF, or paste into a rich-text editor and convert from there)." },
          ],
        },
      },
      {
        h: "Five common use cases",
        p: [
          "Where CSV-to-PDF earns its place:",
        ],
        list: {
          items: [
            { b: "Quarterly report appendices.", t: "Detailed data tables that don't fit in slides but need to be in the report. Convert the CSV to PDF, then merge into the main report." },
            { b: "Audit deliverables.", t: "Auditors prefer PDF over CSV for the obvious tampering-resistance reason. Export your data as CSV, convert to PDF, hand over the PDF." },
            { b: "Printed handouts for meetings.", t: "A pricing list, an inventory report, a roster — the table form factor is the right one." },
            { b: "Email attachments.", t: "PDFs render consistently across recipients. CSVs sometimes get opened in Excel with column issues. PDF is the safer choice for cross-platform sharing." },
            { b: "Archived data snapshots.", t: "When the live data will change, snapshotting to a PDF preserves the state at a specific moment." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, CSV-to-PDF handles inputs up to 50 MB of CSV (or pasted text up to the browser's typical paste-buffer limit). Processing runs in your browser; nothing is uploaded. Tested up to 50,000 rows — above that, generation time grows and output file size becomes large.",
          "Common pairings: CSV-to-PDF → Compress for the smallest sharable file. CSV-to-PDF → Merge to combine multiple table PDFs into a single report. For tables with rich formatting needs, convert the source to XLSX first and use Excel-to-PDF.",
        ],
      },
    ],
  },

  // ============================================================
  // search-in-pdf — utility for finding text
  // ============================================================
  "search-in-pdf": {
    title: "Search inside a PDF — how text search actually works and what catches users off-guard",
    intro:
      "Searching for a word inside a PDF should be a one-line operation, and for most PDFs it is. But two patterns trip up enough users that they deserve a clear explanation: scanned PDFs where Ctrl-F returns nothing despite the word being plainly visible, and case-sensitivity differences between viewers that change which matches come back. Here is how PDF search actually works, the three search options that determine match quality, and the five workflows where this tool is the right starting point.",
    sections: [
      {
        h: "How search reaches the text",
        p: [
          "Every text-based PDF stores its content as a stream of operators that draw glyphs at specific positions on each page. The actual text — the characters, their Unicode codepoints — is part of those operators. Our search reads the text content of every page, normalizes whitespace, and runs a substring or whole-word match against your query. Each match comes back with the page number it appeared on and a snippet of surrounding context so you can see the match in situ.",
          "The same operation works in Acrobat, Preview, Chrome, Firefox, and any other PDF reader's Ctrl-F. The difference is presentation: our tool shows every match in a list across the document; readers typically highlight matches one at a time. The list view is more useful when you want to scan all matches at once (\"how many places does this contract mention liability?\") rather than jumping between them.",
        ],
      },
      {
        h: "Three search options that determine what matches",
        p: [
          "The defaults work for most queries. Three toggles change behavior in important ways:",
        ],
        list: {
          items: [
            { b: "Case-sensitive (default off).", t: "Off matches any case combination of the query. On only matches exact case. Use on when searching for proper nouns or specific identifiers where case carries meaning (\"iPhone\" vs \"iphone\")." },
            { b: "Whole-word (default off).", t: "Off matches substrings — \"act\" matches \"act\", \"action\", \"react\", \"actor\". On only matches when the word is bounded by whitespace or punctuation. Use on when partial matches produce noise." },
            { b: "Regex (default off, where supported).", t: "Off treats the query literally. On treats the query as a regular expression. Useful for advanced queries — \"\\$\\d+\" finds dollar amounts, \"\\b[A-Z]{2,}\\b\" finds all-caps words. Power-user mode; the default-off keeps casual queries simple." },
          ],
        },
      },
      {
        h: "Why scanned PDFs return zero matches",
        p: [
          "The single biggest source of \"this is broken\" reports — and it's actually correct behavior. Scanned PDFs are usually image-only PDFs. Each page is a single rasterized bitmap of the original paper. There are no text operators in the content stream; the pixels look like text to humans but the PDF file has no idea what words are on the page.",
          "Search reads the text content stream. When there is no text content, there are no matches — by construction, not by failure. The fix is to add a text layer: run AI · Make PDF Searchable (or AI · OCR) to recognize the pixels and insert a hidden text layer behind the image. After that, the PDF still LOOKS like the scan but Ctrl-F (and our search) can find words in it.",
          "PDF Inspector tells you at a glance whether your PDF has a text layer or not — useful pre-check before reaching for search.",
        ],
      },
      {
        h: "Five workflows where search-in-pdf is the right starting tool",
        p: [
          "Cases where the list-of-matches view earns its place:",
        ],
        list: {
          items: [
            { b: "Contract clause inventory.", t: "\"How many places does this contract say 'indemnify'?\" Search returns every mention with surrounding context. Faster than reading the whole document." },
            { b: "Spec compliance checks.", t: "Does the technical spec mention 'TLS 1.2'? Search finds every reference, lets you see whether the term appears in the context you care about." },
            { b: "Citation hunting.", t: "Find every reference to a specific paper, person, or organization across a long document. Useful for legal research and academic-paper review." },
            { b: "Term-frequency triage.", t: "Quick gauge of how heavily a document focuses on a topic. \"Cost\" mentioned 80 times in a 50-page report = budget-heavy doc. Mentioned 3 times = barely touched." },
            { b: "Finding edited / inserted content.", t: "Comparing two versions of a document by searching for distinctive phrases is faster than running a full diff for casual checks." },
          ],
        },
      },
      {
        h: "Two quirks worth knowing",
        p: [
          "Patterns that show up in support questions:",
        ],
        list: {
          items: [
            { b: "Hyphenated line breaks split words.", t: "Some PDFs hyphenate long words across lines: \"hyphen-\" + linebreak + \"ated\". Search for \"hyphenated\" misses the split occurrence because the actual text in the file is two tokens. Mitigation: search for both halves separately, or use regex (\"hyphen-?ated\") if your search supports it." },
            { b: "Smart quotes vs straight quotes.", t: "A PDF may use curly quotes (“like this”) while you type straight quotes (\"like this\"). Search for one and the other won't match. If queries fail unexpectedly, copy a working occurrence from the PDF and paste it as your query to see if the apostrophe character is different." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, search handles PDFs up to 100 MB with no page-count cap. Up to 200 matches returned per query — refine the query if you need more. Parsing runs in your browser via PDFium WebAssembly; nothing is uploaded.",
          "Common pairings: AI · Semantic Search when you want passages that MEAN the same thing rather than match a specific word. Make PDF Searchable to add a text layer to scans before searching. PDF Inspector to verify a text layer exists.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-form-fields — AcroForm inspector
  // ============================================================
  "pdf-form-fields": {
    title: "PDF form field inspector — what an AcroForm dictionary contains and how to read it",
    intro:
      "PDF forms look like simple fill-in-the-blank documents, but underneath every fillable PDF is a structured AcroForm dictionary that lists every interactive field, its type, its constraints, and its current value. Most PDF readers hide this structure; you click into a field and type. But for compliance audits, data extraction pipelines, form-quality reviews, and accessibility checks, getting the structured field list out is exactly what you need. Here is what each AcroForm field type means, the five real workflows where surfacing the structure pays off, and the difference between this inspector and the Fill PDF Form tool.",
    sections: [
      {
        h: "What's in an AcroForm dictionary",
        p: [
          "Every fillable PDF has an /AcroForm entry in its catalog that points to a /Fields array. Each entry in that array is a field dictionary — a structured record with a name (/T), a field type (/FT), an optional default value (/DV), an optional current value (/V), and a set of flags (/Ff) that control behavior (required, read-only, no-export, multiline, password, etc.). Fields can have child fields, creating a tree structure that mirrors the form's logical sections.",
          "Reading the AcroForm tree gives you the form's complete data model: what data the form collects, the types of each field, the validation constraints, and any pre-filled defaults. The inspector walks that tree and surfaces every leaf field with its full set of properties.",
        ],
      },
      {
        h: "Four field types and what each means",
        p: [
          "The PDF spec defines exactly four AcroForm field types — every fillable field is one of these:",
        ],
        list: {
          items: [
            { b: "Tx — text input.", t: "Single-line or multi-line text fields. Multi-line is signaled by a flag (/Ff bit 13). Password fields are also Tx with a password flag — same type, different display." },
            { b: "Btn — button.", t: "Includes checkboxes (toggle on/off), radio buttons (mutually exclusive group), and pushbuttons (execute a JS action when clicked). Flags distinguish the subtypes." },
            { b: "Ch — choice.", t: "Dropdowns and listboxes. The list of options is stored in /Opt. Editable combo-boxes (where users can type a value not in the list) are signaled by a flag." },
            { b: "Sig — signature.", t: "Placeholder for a cryptographic signature. When signed, the field's /V holds the signature dictionary with certificate, timestamp, and signed-bytes hash." },
          ],
        },
      },
      {
        h: "Flags worth knowing",
        p: [
          "The /Ff (field-flags) bitmask carries behavioral metadata. The most-asked flags:",
        ],
        list: {
          items: [
            { b: "Required.", t: "Form-submission processors should reject the form if the field is empty. The inspector surfaces required fields explicitly so you can see which inputs the form considers essential." },
            { b: "Read-only.", t: "Field cannot be edited via PDF readers. Often used for computed fields that derive from other fields, or for pre-filled fields that should not be changed by the recipient." },
            { b: "No-export.", t: "Field is filled but its value is excluded from form-data exports. Used for fields that are visual-only (e.g. computed totals that should appear on the rendered PDF but not in extracted data)." },
            { b: "Multiline (Tx only).", t: "Text field accepts line breaks. Without this flag, even if the field is visually large, the input is a single line that scrolls." },
            { b: "Password (Tx only).", t: "Display masks the typed characters with bullets. Note: this is display-only — the underlying value is still stored in clear text in the PDF." },
          ],
        },
      },
      {
        h: "Five workflows where the inspector pays off",
        p: [
          "Cases where you need the field list as data, not as an interactive form:",
        ],
        list: {
          items: [
            { b: "Form-data extraction pipelines.", t: "Reading filled forms and ingesting the values into a database. The inspector lists field names + types + current values as CSV/JSON, which the pipeline consumes directly. Faster and more reliable than OCR on the rendered form." },
            { b: "Compliance audits.", t: "\"What data does this intake form collect?\" The inspector surfaces every field, which compliance can review against PII / data-minimization policies." },
            { b: "Form quality reviews.", t: "Are required-field flags set correctly? Are read-only flags blocking accidental changes? The inspector makes form structure visible for review without filling it." },
            { b: "Accessibility audits.", t: "Each field's tooltip (/TU) and tab order should be set for screen-reader access. The inspector surfaces both so accessibility reviewers can verify them." },
            { b: "Multi-form data mapping.", t: "When mapping fields from form A to form B (e.g. for a workflow that auto-fills application B from application A), the inspector's exported field list is the input to the mapping spec." },
          ],
        },
      },
      {
        h: "Inspector vs Fill PDF Form — when to use each",
        p: [
          "Two related tools, different goals:",
        ],
        list: {
          items: [
            { b: "Inspector — surface the structure.", t: "Read-only. Output is the field-list as JSON / CSV. Use when you need to see what the form looks like in data form, not when you need to add values to it." },
            { b: "Fill PDF Form — add values.", t: "Modifies the PDF. Each field gets a value you type. Output is the filled PDF. Use when you actually want to complete the form." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, the form-field inspector handles PDFs up to 100 MB. Parsing runs in your browser via byte-level parsing; nothing is uploaded. Output is a structured list of every AcroForm field with name, type, value, defaults, and flags. Exportable as JSON or CSV.",
          "Common pairings: Inspector → Fill PDF Form when you want to fill the surveyed form. Inspector → AI · Fill when the source PDF is flat (no AcroForm) and the inspector shows zero fields — that's the trigger to use the visual-detection AI variant.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-fonts-inspector — print-prep critical
  // ============================================================
  "pdf-fonts-inspector": {
    title: "PDF font inspector — embedded, subsetted, missing, and why a print shop cares about every distinction",
    intro:
      "Most users do not think about fonts inside a PDF until something goes wrong: text reflows on a colleague's screen, the print shop calls back asking about \"missing fonts,\" or a regulatory submission gets rejected for non-compliance. By the time you notice, the document has already been distributed and the fix means going back to the source and re-exporting. The font inspector exists to catch font problems before distribution. Here is how PDF font references actually work, what \"embedded\" really means under the hood, and the three categories of font problem the inspector surfaces.",
    sections: [
      {
        h: "How PDFs reference fonts",
        p: [
          "Every text element in a PDF references a font by an internal name. The PDF's /Resources dictionary on each page lists which fonts that page uses, and each font reference points to a font dictionary somewhere in the document. The font dictionary has metadata — the font's PostScript name, its encoding, its FontDescriptor (with metrics like ascent / descent / bounding box). Critically, the FontDescriptor may or may not contain a /FontFile* entry — a stream of the actual font bytes.",
          "If the FontFile is present, the font is embedded: the document carries the actual font bytes inside it, so any viewer can render it correctly regardless of what fonts the viewer's machine has installed. If the FontFile is absent, the font is referenced but not included: viewers have to find a matching font on the local machine, or substitute. That substitution is where things go wrong.",
        ],
      },
      {
        h: "What 'embedded' really means",
        p: [
          "The inspector reports a font as embedded if the document carries its bytes. Three sub-cases worth distinguishing:",
        ],
        list: {
          items: [
            { b: "Fully embedded.", t: "The complete font file is in the PDF. Every glyph the font defines is available, even glyphs not used in the document. File size is bigger but the document is fully portable." },
            { b: "Subsetted.", t: "Only the glyphs actually used in the document are embedded. Identified by a 6-letter random prefix on the font name (e.g. ABCDEF+TimesNewRoman). Saves significant file size — typical fonts have 500-2000 glyphs, but a document might only use 80. Subset = those 80 only." },
            { b: "Standard 14.", t: "The PDF spec defines 14 fonts (Helvetica, Times, Courier, Symbol, ZapfDingbats and variants) that are guaranteed to be present in every conformant PDF reader without embedding. Documents referencing only Standard 14 fonts can skip embedding entirely with no portability risk. Modern best practice embeds everything anyway." },
          ],
        },
      },
      {
        h: "Three font-problem categories the inspector surfaces",
        p: [
          "Each category has different downstream impact:",
        ],
        list: {
          items: [
            { b: "Non-embedded non-Standard-14 fonts.", t: "The dangerous case. The PDF references a custom font but does not carry its bytes. Recipients without that font installed see a substituted font with different metrics — text reflows, page count may change, layout breaks. The inspector flags these in red." },
            { b: "Non-embedded Standard 14 fonts.", t: "Acceptable per spec, but flagged with a yellow caution. Some workflows (print shops, PDF/A archives) require ALL fonts embedded regardless. If your destination workflow has that requirement, treat yellow as actionable." },
            { b: "Embedded but not subsetted.", t: "Just an inefficiency flag, not a problem per se. The font is fully embedded so portability is fine, but the file is bigger than it needs to be. Re-export from source with subsetting enabled to shrink." },
          ],
        },
      },
      {
        h: "When font embedding really matters",
        p: [
          "Five workflows where non-embedded fonts cause genuine pain:",
        ],
        list: {
          items: [
            { b: "Print production.", t: "Print shops universally require embedded fonts. Without them, the press substitutes whatever it has, which is rarely what the design intended. Reject-rate from print shops on this single issue is high." },
            { b: "PDF/A archival.", t: "PDF/A explicitly requires all fonts embedded. A non-compliant PDF fails the validator before it ever reaches the archive." },
            { b: "PDF/X print exchange.", t: "Same requirement for print-exchange formats. The spec is explicit." },
            { b: "Cross-platform sharing.", t: "If your audience is mixed Windows / Mac / Linux, the chances of every viewer having every custom font installed is essentially zero. Embedding is the only fix." },
            { b: "Long-term distribution.", t: "Fonts go out of print. A PDF from 2005 referencing a custom font that the manufacturer no longer ships cannot be rendered correctly today. Embedding makes the PDF self-contained for the long haul." },
          ],
        },
      },
      {
        h: "How to fix non-embedded fonts",
        p: [
          "Three paths, ordered by speed:",
        ],
        list: {
          items: [
            { b: "Re-export from source with 'Embed all fonts'.", t: "The cleanest fix. Word, Google Docs, InDesign, LaTeX, every modern publisher has an embed-all option. Re-export, replace the PDF." },
            { b: "Run through Acrobat Pro's font-embed pass.", t: "If you do not have the source, Acrobat Pro can embed fonts it finds on your machine. Only fonts installed on your machine can be embedded this way — if the original used a font you don't have, this doesn't help." },
            { b: "Substitute the unembedded font with one you do have.", t: "Last resort. Edit the PDF in a tool that can remap font references. Results vary; the substitution may look fine or may look terrible depending on metric similarity." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, font inspection handles PDFs up to 100 MB. Parsing runs in your browser via byte-level parsing; nothing is uploaded. Output lists every font with embed status, subset flag, encoding, page usage. Exportable as JSON / CSV for downstream auditing.",
          "Common pairings: Font Inspector → re-export with embedding for distribution-ready PDFs. Font Inspector → PDF/A check to verify compliance after embedding. Font Inspector → Compress for the smallest fully-embedded final file.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-attachments-viewer + extract-pdf-attachments — paired
  // ============================================================
  "pdf-attachments-viewer": {
    title: "PDF attachments viewer — the hidden files inside a PDF and why they matter for compliance and security",
    intro:
      "Most users do not realize PDFs can carry embedded files. Open a typical PDF in Acrobat and the attachments panel is empty; open certain regulatory filings, ZUGFeRD e-invoices, or technical reports and the panel surfaces multiple files inside — XML data, supplementary spreadsheets, source documents, original photos. Embedded files are a feature of the PDF spec but a surprise for users who do not know to look. Here is what the attachments viewer surfaces, the three categories of PDF where embedded files are common, and why compliance and security audits care about every attachment.",
    sections: [
      {
        h: "How embedded files work in PDF",
        p: [
          "The PDF spec lets a document carry arbitrary file attachments — any byte stream, with any MIME type, attached either at document level (in the /Names tree's /EmbeddedFiles entry) or at annotation level (a single page can carry attachment annotations). Each attachment has metadata: filename, MIME type, description, size, embedded bytes themselves (often compressed).",
          "The attachments viewer parses both the document-level /EmbeddedFiles tree and any annotation-level attachments, then surfaces them as a structured list. You see what's inside the PDF without having to open it in Acrobat or run external tools.",
        ],
      },
      {
        h: "Three categories where embedded files are common",
        p: [
          "Most PDFs have zero attachments. The cases where they DO are specific:",
        ],
        list: {
          items: [
            { b: "E-invoice formats (ZUGFeRD, Factur-X).", t: "EU-standard hybrid invoice formats embed structured XML invoice data inside a human-readable PDF. The PDF is what you see; the XML is what your accounting system reads. Two views of the same invoice in one file. Common in B2B billing across Europe." },
            { b: "Technical reports with source data.", t: "Research papers, lab reports, and engineering documents often embed the source data (CSV, JSON, raw measurements) so the methodology is reproducible. The PDF is the readable report; the data is right there inside for reanalysis." },
            { b: "Archive packages.", t: "PDF/A-3 explicitly supports embedded files for archival. A PDF/A package might carry the original source document (DOCX, XLSX), supplementary exhibits, related PDFs, all in one archival container." },
          ],
        },
      },
      {
        h: "Why compliance audits care",
        p: [
          "Embedded files are invisible by default in most readers, but they travel with the document. Three audit-relevant concerns:",
        ],
        list: {
          items: [
            { b: "PII leakage.", t: "An embedded file might carry sensitive information that the visible PDF did not. If you're redacting a PDF and forget the attachments, the redaction is incomplete." },
            { b: "Tracking origin.", t: "Some PDFs embed the original Word doc as an attachment for reference. That source doc carries its own metadata — authors, tracked changes, comments — that may reveal information the published PDF was supposed to hide." },
            { b: "PDF/A compliance gates.", t: "PDF/A-1 forbids embedded files; PDF/A-2 forbids them in compliance mode (but allows in PDF/A-3 with relaxed rules). Auditors check whether attachments are present and what they are." },
          ],
        },
      },
      {
        h: "Why security review cares",
        p: [
          "An embedded file in a PDF is a file. If you open the PDF and then double-click the attachment in Acrobat, your default application opens that file. Three threat patterns:",
        ],
        list: {
          items: [
            { b: "Malicious payloads.", t: "An attached .docx with a macro, or a .js that triggers when opened. Some phishing campaigns hide payloads in PDF attachments because email scanners check the PDF itself but not what's inside." },
            { b: "Steganographic data.", t: "Attached files might carry data hidden in image bytes, archive layers, or unused fields. Surfacing the attachment list lets reviewers scan for unexpected file types." },
            { b: "Encrypted attachments.", t: "Some attachments are themselves password-protected. Surfacing them lets reviewers see what kinds of files are inside, even if they cannot read the content." },
          ],
        },
      },
      {
        h: "Viewer vs Extract — when to use each",
        p: [
          "Two related tools serve different needs:",
        ],
        list: {
          items: [
            { b: "Attachments Viewer — list metadata.", t: "Surfaces filename, MIME, size, description. Read-only. Use when you want to know what's inside without pulling the bytes out. Fastest for audit and security review." },
            { b: "Extract Attachments — pull the actual files.", t: "Decodes each attachment stream and saves the bytes to your disk. Use when you actually need to open or process the attached files." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, attachments viewer handles PDFs up to 100 MB with no attachment-count cap. Parsing runs in your browser via byte-level parsing; nothing is uploaded. Output lists every attachment with full metadata, exportable as JSON.",
          "Common pairings: Attachments Viewer → Extract Attachments to pull bytes. Attachments Viewer → AI · Redact if attachments reveal PII patterns that also need redacting in the main document.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-pdf-attachments — paired byte-extraction
  // ============================================================
  "extract-pdf-attachments": {
    title: "Extract PDF attachments — pulling the embedded files out, in the format they were stored in",
    intro:
      "Where the Attachments Viewer surfaces the metadata of every embedded file inside a PDF, Extract Attachments pulls the actual bytes out and saves them to your disk as standalone files. The difference matters when you actually need to use the embedded content: open the e-invoice's XML in your accounting system, read the research paper's source data in Excel, run the archive package's source documents through their native applications. Here is how extraction works, the three common workflows where pulling attachments out is the load-bearing operation, and the patterns that catch users on first use.",
    sections: [
      {
        h: "How extraction works",
        p: [
          "The tool parses the PDF's /Names tree's /EmbeddedFiles entry, identifies every file stream, decodes any compression filters (FlateDecode is most common), and writes each decoded stream out as a file. Filenames come from the PDF's /F or /UF entries — UF (Unicode filename) is preferred when present; F (PDFDocEncoding) is the fallback. MIME types are inferred from extensions: .xlsx → application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, .xml → application/xml, etc.",
          "Output is a single .zip containing every extracted file with its original filename preserved. Filenames that contained path separators (\"/\" or \"\\\") get sanitized — embedded paths are usually irrelevant and sometimes a vector for path-traversal attacks if the user blindly trusts them.",
        ],
      },
      {
        h: "Three workflows where extraction is the load-bearing operation",
        p: [
          "Specific cases that benefit:",
        ],
        list: {
          items: [
            { b: "Processing e-invoices (ZUGFeRD / Factur-X).", t: "European hybrid e-invoices embed structured XML data inside the visible PDF. Your accounting system reads the XML, not the PDF. Extract pulls the XML out so the accounting system can process it directly without a separate vendor-supplied data extractor." },
            { b: "Reanalyzing research data.", t: "Many scientific papers embed source data (CSVs, JSON, raw measurements). Extracting them lets you reanalyze with your own statistical pipeline rather than trusting the paper's chart interpretation." },
            { b: "Recovering source documents from PDF/A-3 archives.", t: "A PDF/A-3 archive package preserves the original source document(s) alongside the rendered PDF. If the archive's PDF version is no longer satisfactory and you have the original Word / Excel / Photoshop file embedded, extraction recovers it." },
          ],
        },
      },
      {
        h: "Two patterns that catch users",
        p: [
          "Surprises worth knowing:",
        ],
        list: {
          items: [
            { b: "Some PDFs have no extractable attachments despite seeming to.", t: "PDFs can include image objects, form widgets, or annotations that look like attachments in a UI but aren't tracked in /EmbeddedFiles. If the Attachments Viewer surfaces nothing, there's nothing for Extract to pull. For image extraction use Extract Images; for form-data extraction use the Form Fields inspector." },
            { b: "Rare compression filters may fail to decode.", t: "Common: FlateDecode (basically Zlib). Less common: LZWDecode, ASCII85Decode chained — these decode fine. Rare: JBIG2Decode or custom proprietary filters where the encoder used an unusual variant. The tool reports the failure with the offending attachment name; you can usually open the source PDF in Acrobat and save the attachment manually." },
          ],
        },
      },
      {
        h: "Security note",
        p: [
          "Extracted attachments are just files — they have whatever payload was embedded. If the source PDF came from an unknown sender, treat the extracted attachments with the same caution you would treat any email attachment from that sender:",
        ],
        list: {
          items: [
            { b: "Scan with anti-malware before opening.", t: "Especially .docx, .xlsx, .js, .exe, .bat extensions. These can carry executable payloads." },
            { b: "Open in a sandbox first.", t: "If your platform supports application sandboxing (macOS Sandbox, Windows Sandbox), open suspicious extracted files there first." },
            { b: "Verify against the sender's expected attachment list.", t: "If the sender said \"the PDF contains the invoice XML,\" extraction should produce one .xml. If you get six files including .exe, something is wrong." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, extraction handles PDFs up to 100 MB with no attachment-count cap. Decoding runs in your browser; nothing is uploaded. Output is a single .zip containing every extracted file with original filenames preserved (path-sanitized).",
          "Common pairings: Attachments Viewer first to verify what's inside before extracting. Extract Attachments → Remove Metadata + AI · Redact on the main PDF to sanitize after attachments are extracted (the source PDF may still carry references to the attachments even after the bytes are extracted).",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-javascript-detector — security review
  // ============================================================
  "pdf-javascript-detector": {
    title: "PDF JavaScript detector — what's running inside the PDF and why most documents shouldn't have any",
    intro:
      "Most PDFs are static documents — text, images, vectors, sometimes form fields. A subset can also carry JavaScript: actual executable code that runs when the document is opened, when a form is submitted, when a link is clicked, when a button is pressed. Legitimate uses exist — form validation, dynamic field calculations, copy-protection schemes — but JavaScript inside a PDF is also a major vector for phishing, exfiltration, and tracker-pixel-style telemetry. Here is how PDFs can run code, the four trigger points the detector surfaces, and the patterns that distinguish benign automation from malicious payloads.",
    sections: [
      {
        h: "How JavaScript ends up inside a PDF",
        p: [
          "The PDF spec includes a JavaScript runtime — a subset of JavaScript intended for in-document interactivity. Code can be attached at four levels of granularity: at the document level (runs on open), at the page level (runs when a specific page is shown), at the field level (runs on field events like input or validation), and at the annotation level (runs when a link is clicked, a button is pressed, or a checkbox is toggled). The /Names tree, /OpenAction entry, every form field's /A (action) and /AA (additional action) dictionaries, and every annotation's /A and /AA dictionaries all carry potential script bindings.",
          "The detector walks every one of these locations and surfaces every script binding it finds, along with the trigger (when the script fires) and the source code. Readers that don't run JavaScript (Chrome built-in PDF viewer, Firefox built-in, Edge built-in) ignore the scripts entirely — those readers are the safest for unknown PDFs. Acrobat, Foxit, Nitro each have their own JS engines that DO execute scripts.",
        ],
      },
      {
        h: "Four trigger points the detector surfaces",
        p: [
          "Each trigger has different risk implications:",
        ],
        list: {
          items: [
            { b: "Document open (/OpenAction).", t: "Runs as soon as the PDF is opened. Highest-risk trigger — a malicious page-load script can phone home, log open events, or fire credential-phishing prompts. Modern Acrobat prompts on JavaScript at open; users frequently click through without reading the prompt." },
            { b: "Page load.", t: "Runs when a specific page is shown. Lower-frequency than open-action but still automatic. Used legitimately for context-specific form validation; used maliciously for paging-based tracking." },
            { b: "Form submit and field events.", t: "Runs on form interaction. Most common legitimate use: client-side validation (\"this field requires a 5-digit zip code\") or calculated fields (\"total = quantity × price\"). Most common malicious use: data exfiltration via submitForm to an attacker-controlled URL." },
            { b: "Annotation actions (link click, button press, checkbox toggle).", t: "Runs on explicit user action. The user clicked something; the script fires. Acrobat usually does NOT prompt for these even though they're scripts. Pre-flight inspection is essential because the script is hidden behind a normal-looking UI element." },
          ],
        },
      },
      {
        h: "Distinguishing benign from malicious",
        p: [
          "Reading scripts requires judgment. Three patterns that signal real risk:",
        ],
        list: {
          items: [
            { b: "External URLs in any non-link-click trigger.", t: "Page-load or document-open scripts containing http:// or https:// strings are red flags. Legitimate validation scripts don't need to hit a server. Tracking pixels embedded as JavaScript do." },
            { b: "submitForm to a domain different from the document's source.", t: "If you received the PDF from contoso.com and the submitForm sends to evil.example.org, that's exfiltration. Acrobat doesn't prompt for this." },
            { b: "Eval, unescape, or string-concatenation that builds the actual script at runtime.", t: "Obfuscation. Legitimate scripts have no reason to construct themselves at runtime; this pattern is almost exclusively malicious." },
          ],
        },
      },
      {
        h: "When to strip vs when to keep",
        p: [
          "Three decision categories:",
        ],
        list: {
          items: [
            { b: "Strip immediately.", t: "PDFs from unknown senders, PDFs flagged by security scanning, any of the three malicious-pattern signals above. Run Strip JavaScript (paid) or open in Acrobat Pro and use Sanitize Document." },
            { b: "Keep and document.", t: "Legitimate forms with client-side validation. Internal documents from trusted creators where the JavaScript performs known automation. In these cases, the detector output goes into the compliance file alongside the document for future audit." },
            { b: "Strip but archive the original.", t: "Documents being put into long-term archival storage. PDF/A forbids JavaScript; you have to strip. But if the original needs to be preserved for some reason, archive both versions." },
          ],
        },
      },
      {
        h: "What readers do with JavaScript",
        p: [
          "Reader-specific behavior matters for risk assessment:",
        ],
        list: {
          items: [
            { b: "Adobe Acrobat (since v11).", t: "Prompts before executing JavaScript at document-open. Does NOT prompt for field / annotation triggers. Settings can disable JS entirely." },
            { b: "Foxit, Nitro.", t: "Each has its own JS engine with similar prompt-on-open behavior but different defaults. Worth checking your organization's reader policy." },
            { b: "Chrome / Edge / Firefox built-in PDF viewers.", t: "Do not execute PDF JavaScript at all. Safest for unknown PDFs — open in browser first, run through the detector to inventory the JS, then decide whether to open in Acrobat." },
            { b: "macOS Preview.", t: "Limited JS support; many scripts simply don't fire. Reasonable middle-ground for casual PDF viewing." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, the JavaScript detector handles PDFs up to 100 MB. Parsing runs in your browser via byte-level parsing; nothing is uploaded — important for forensic and threat-hunting workflows where the file itself IS the suspicious artifact. Output lists every script with trigger, source code, and host element. Exportable for inclusion in security reviews.",
          "Common pairings: JS Detector → Strip JavaScript to remove findings. JS Detector → PDF Inspector for full structural audit of suspicious PDFs. JS Detector findings → flag the PDF for organizational quarantine before sharing further.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-letterhead-overlay — full-page template composition
  // ============================================================
  "pdf-letterhead-overlay": {
    title: "PDF letterhead overlay — composing a corporate template across every page of a document",
    intro:
      "Letterhead, watermarks, and full-page disclaimer stamps live in a different category from logo placement or text watermarks. Logos and text-stamps are individual elements; a letterhead is a full-page template — logo plus contact info plus possibly a footer block plus possibly background graphics, all laid out as a complete page in its own right. The right way to apply that template across an existing document is to overlay one PDF on top of another, page by page. Here is what the overlay tool does, the two layer-order choices that determine whether your content is in front or behind the template, and the four real-world scenarios where this is the operation you actually want.",
    sections: [
      {
        h: "How PDF overlay works",
        p: [
          "Two PDFs go in: a base PDF (the document) and an overlay PDF (the template — usually one page). The tool composites the overlay onto every page of the base PDF using pdf-lib's drawPage call. The composition is at the page-content-stream level: the overlay's vector content, text, and images are layered into each base page, preserving everything as real PDF objects rather than rasterizing.",
          "The output is lossless. Text on the base remains selectable. Vector graphics stay sharp. Annotations and form fields are preserved. The only addition is the overlay layer, which sits either above or below the base's content depending on your layer-order choice.",
        ],
      },
      {
        h: "Two layer-order choices — what each is for",
        p: [
          "The single most important choice in overlay composition:",
        ],
        list: {
          items: [
            { b: "Overlay above content (watermarks, stamps).", t: "Use when the overlay is a stamp or watermark that you want visible ON TOP of the base content. The base text shows through any transparent parts of the overlay (or is dimmed underneath solid parts). Typical for DRAFT watermarks, CONFIDENTIAL stamps, signature blocks." },
            { b: "Overlay below content (letterhead, background).", t: "Use when the overlay is a template that should sit BEHIND the base content — corporate letterhead with logo and contact block, a subtle background graphic, a page-decorative border. The base content draws over the overlay. Letterhead use case is the canonical one: logo and company info in the header area, body text from the base PDF drawn on top." },
          ],
        },
      },
      {
        h: "Four real-world scenarios",
        p: [
          "Specific use cases where overlay is the right operation:",
        ],
        list: {
          items: [
            { b: "Corporate letterhead application.", t: "Add your company letterhead (with logo, address, phone, email, and branded design) to every page of a contract, invoice, or report. Choose 'overlay below' so the body text stays in front. The letterhead designer creates a 1-page PDF; you apply it across whatever documents need branding." },
            { b: "Page-level disclaimer footers.", t: "Regulatory disclaimers that must appear on every page of certain documents (financial disclosures, medical reports, legal opinions). Create the disclaimer as a 1-page overlay; apply across the whole document." },
            { b: "DRAFT or REVIEW watermarks across long documents.", t: "Full-page watermarks that span the page (large diagonal DRAFT text). Add Text Box or Stamp PDF can do this for short strings; PDF Overlay is the right tool when the watermark is more elaborate (text + logo + date all positioned together)." },
            { b: "Branded certificate frames.", t: "Issuing certificates from a generated PDF — the data goes in the base, the decorative frame and brand goes in the overlay. Each certificate is composed at delivery time without re-rendering the design." },
          ],
        },
      },
      {
        h: "Three details that matter",
        p: [
          "Specifics that catch users on first use:",
        ],
        list: {
          items: [
            { b: "Use a 1-page overlay PDF.", t: "If the overlay is multi-page, only page 1 is used as the template. The other pages are ignored. The 1-page overlay applies to EVERY page of the base — same template repeated." },
            { b: "Match page sizes upstream.", t: "If your base is Letter and your overlay is A4, the overlay scales to fit each base page, which causes slight aspect-ratio adjustments. For pixel-perfect alignment, generate the overlay at the same page size as the base." },
            { b: "Mind transparency.", t: "Overlays often use transparency for the parts that should let content show through. PDF supports transparency natively, but some viewers render it slightly differently. Test in the destination viewer if the audience uses something unusual." },
          ],
        },
      },
      {
        h: "Overlay vs Logo vs Stamp — decision rule",
        p: [
          "Three adjacent operations; the right one depends on what you're applying:",
        ],
        list: {
          items: [
            { b: "Logo (image watermark).", t: "Adding a single image to every page. Position, scale, opacity controls. Use when the brand element is one image." },
            { b: "Stamp (text overlay).", t: "Adding short text (DRAFT, CONFIDENTIAL, custom up to 30 chars) to every page. Use when the visual element is text-based." },
            { b: "Overlay (full-page template).", t: "Adding a full-page PDF template to every page. Use when the visual element is a complete page-layout with text + images + decoration." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, overlay handles base PDFs up to 100 MB and overlay PDFs up to 25 MB. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF reader. Base text remains selectable in 'overlay below' mode (the most common pick for letterhead use cases).",
          "Common pairings: Overlay → Flatten if the recipient should not be able to remove the overlay. Overlay → Compress for the smallest branded final file. Overlay multiple documents in a batch when applying the same letterhead across many files.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-html — paired with markdown-to-pdf direction
  // ============================================================
  "pdf-to-html": {
    title: "PDF to HTML — self-contained single-file output and the trade-offs of heuristic conversion",
    intro:
      "Converting a PDF to HTML is one of those operations where the right shape of output depends entirely on what comes next. Some users want a styled wiki page; others want a self-contained file they can drop into any CMS without external dependencies; others want skeleton HTML to manually polish in a code editor. Our free heuristic converter produces option two — a single .html file with inline CSS, browser-ready, no CDN dependencies, no external stylesheets. Here is what the converter does, what it preserves, what it loses, and the three downstream pipelines where this exact shape of output earns its place.",
    sections: [
      {
        h: "How the heuristic converter works",
        p: [
          "The tool parses the PDF with pdfjs to extract every text run along with its font size and weight. We build a font-size histogram across the document — the mode is body text; sizes ≥1.25× body become H3, ≥1.6× become H2, ≥2× become H1. Bold runs become <strong>; italic runs become <em>. Paragraphs are separated by line-spacing analysis. Pages are separated by <hr> elements.",
          "The output is wrapped in a single .html file with inline CSS rather than a separate stylesheet. Helvetica is the default font; H1/H2/H3 styles use distinct sizes; paragraphs get standard spacing. No JavaScript, no external assets, no CDN references. Drop the file into any browser and it just works.",
        ],
      },
      {
        h: "What survives the conversion",
        p: [
          "Heuristic extraction preserves the content elements most users actually want:",
        ],
        list: {
          items: [
            { b: "Text and reading order.", t: "Every word in reading order, multi-column pages linearized correctly for most layouts." },
            { b: "Heading structure.", t: "H1/H2/H3 detected from font-size hierarchy. Well-typeset documents get publication-ready heading levels." },
            { b: "Bold and italic.", t: "<strong> and <em> tags wrap runs that were styled. Mixed-style runs combine correctly." },
            { b: "Paragraph structure.", t: "Line-spacing analysis groups runs into paragraphs separated by visual gap." },
            { b: "Page separation.", t: "<hr> elements mark page boundaries, so the visual flow of the source PDF is preserved in the HTML." },
          ],
        },
      },
      {
        h: "What the heuristic doesn't handle",
        p: [
          "Three categories of content where the free heuristic falls short, with the right tool for each:",
        ],
        list: {
          items: [
            { b: "Tables.", t: "Tables are layout-dependent and the heuristic linearizes them row-by-row, losing column structure. For tabular content use AI · Table Extract to pull tables as CSV, then embed them in HTML separately." },
            { b: "Images.", t: "Embedded images are not extracted into the HTML. Visually, the HTML output lacks any picture content from the source. For documents where images matter, run Extract Images separately, host them, and reference them in the HTML manually. Or use AI · Rewrite which handles image positioning end-to-end." },
            { b: "Hyperlinks.", t: "The free converter doesn't carry forward PDF hyperlinks into HTML <a> tags. URLs that appear as visible text in the PDF still appear as text in the HTML — they're just not clickable. Manual post-processing can wrap them; or use AI conversion for hyperlink-aware output." },
          ],
        },
      },
      {
        h: "Three downstream pipelines where this output shape works",
        p: [
          "Specific workflows where heuristic HTML conversion is the right intermediate:",
        ],
        list: {
          items: [
            { b: "Wiki / CMS migration.", t: "Pasting documentation into Confluence, Notion, or a custom CMS. The converted HTML is clean enough to paste; the CMS's import handles the styling. Saves manual retyping or copy-paste-then-restyle." },
            { b: "Web publishing.", t: "Publishing an old PDF as a web page. Since the HTML is self-contained, you can drop it directly into a static site generator, GitHub Pages, or any web host without dependency setup. Search engines crawl HTML far better than PDFs — turning the PDF into HTML improves discoverability." },
            { b: "Text-only LLM ingestion.", t: "Some LLM ingestion pipelines prefer HTML over plain text because the tag structure preserves heading hierarchy. The converter is a single-step PDF → ingestible HTML path." },
          ],
        },
      },
      {
        h: "When to skip this tool",
        p: [
          "Three cases where a different format is right:",
        ],
        list: {
          items: [
            { b: "You want pure text without tags.", t: "Use PDF-to-Text. Strips all formatting; pure UTF-8 .txt output. Faster for cases where structure doesn't matter." },
            { b: "You want markdown for a developer workflow.", t: "Use PDF-to-Markdown. Markdown is more developer-native for README files, wiki pages, and AI training data than HTML." },
            { b: "You need pixel-perfect visual fidelity.", t: "Heuristic conversion doesn't preserve exact PDF layout. For visual fidelity, rasterize the page (PDF-to-PNG) and embed the image — content is no longer text-extractable but visual fidelity is perfect." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF-to-HTML handles PDFs up to 100 MB. Parsing runs in your browser via pdfjs; nothing is uploaded. Output is a single self-contained .html with inline CSS. Opens in every browser, every WYSIWYG editor, every wiki / CMS import.",
          "Common pairings: PDF Inspector first to verify the source has a text layer (scans return empty HTML). PDF-to-HTML → manual edit pass when downstream destination needs fine-tuned markup. AI · Rewrite when the heuristic output isn't quite enough.",
        ],
      },
    ],
  },

  // ============================================================
  // free-draw-pdf — annotation tool
  // ============================================================
  "free-draw-pdf": {
    title: "Draw on a PDF — when free-form ink is the right markup, and what's actually getting saved",
    intro:
      "Drawing freely on a PDF — sketching arrows, circling key passages, jotting margin notes by hand — is one of those operations that feels primitive but is genuinely useful for review workflows. The challenge is that PDFs are a structured format and freehand strokes are anything but: every wiggle of a stylus or mouse needs to be captured as a path, embedded into the page, and rendered correctly across every viewer that opens the file. Here is what the draw tool actually does with your strokes, the precise difference between content-stream paths and proper /Ink annotations, and the four real-world review workflows where free-draw beats the alternatives.",
    sections: [
      {
        h: "What happens to your strokes under the hood",
        p: [
          "As you drag the pointer (or stylus, or finger), the tool captures every position in CSS pixels, smooths the line with light Bezier interpolation, then converts the points to PDF-space coordinates using the canvas's actual rendered size. When you click Apply, every stroke becomes an SVG path drawn into the destination page's content stream via pdf-lib's drawSvgPath. The page's existing content (text, images, vectors) is untouched; the strokes are layered on top.",
          "The output PDF reads identically in every viewer. Strokes appear at the exact same on-page positions in Acrobat, Preview, Chrome, Firefox, every mobile reader. They scale correctly when zoomed (because they are vectors, not raster). They print at full resolution. They survive merging, splitting, page extraction.",
        ],
      },
      {
        h: "Content-stream paths vs /Ink annotations",
        p: [
          "The technical distinction matters for one specific downstream workflow:",
        ],
        list: {
          items: [
            { b: "Content-stream paths (what this tool does).", t: "Strokes are part of the page's drawn content — like every other text run, image, or vector. They look identical to /Ink annotations visually. The advantage: works in every viewer with no compatibility caveats. The trade-off: Acrobat's annotation panel doesn't list them (they're page content, not annotations), so workflows that depend on enumerating annotations (Adobe Acrobat's review tracker, some commenting platforms) won't see them." },
            { b: "/Ink annotations (paid Annotate ships these).", t: "Strokes are stored as proper /Ink annotation objects. Acrobat's annotation panel lists them; comment-tracking workflows enumerate them; reviewers can right-click to add replies. The trade-off: some older viewers render /Ink annotations slightly differently than the canonical pen rendering." },
          ],
        },
      },
      {
        h: "Four real-world workflows where free-draw earns its place",
        p: [
          "Cases where ink markup is exactly what you want:",
        ],
        list: {
          items: [
            { b: "Quick visual review feedback.", t: "Circling a paragraph, drawing an arrow to a chart, scratching out a sentence — these communicate review feedback faster than typed comments. The reviewer's intent comes across at a glance." },
            { b: "Annotating diagrams and charts.", t: "Pointing to specific data points, marking an X on a flaw, highlighting a region of a screenshot. Ink markup is the natural fit; typed annotations would clutter the visual." },
            { b: "Teaching and student feedback.", t: "Grading worksheets, marking essays, annotating student work. Free-draw matches how teachers naturally work in print and translates that to digital." },
            { b: "Field notes on technical drawings.", t: "Engineering, architecture, construction — quick markup of CAD-exported PDFs in the field. Mobile + stylus + free-draw is the standard digital-replacement for paper redlines." },
          ],
        },
      },
      {
        h: "Tool features worth knowing",
        p: [
          "Specifics that determine usability:",
        ],
        list: {
          items: [
            { b: "Page-aware undo.", t: "Click Undo to remove the last stroke on the CURRENT page. Won't accidentally remove a stroke from a previous page you already moved past. Useful for multi-page review where you want to fix a stroke without rolling back work on another page." },
            { b: "Per-stroke editing before apply.", t: "The tool shows a stroke list — you can remove individual strokes before clicking Apply. Once applied, strokes become part of the page content and can't be removed without re-rendering through a redaction tool." },
            { b: "5 colors + adjustable stroke width.", t: "Black, red, blue, green, orange. Stroke width 1-8pt. Sufficient for the visual-feedback use case; not trying to be a full graphics tool." },
            { b: "Touch + stylus support via Pointer Events.", t: "Works with mouse on desktop, finger on tablet, Apple Pencil on iPad, S Pen on Galaxy Tab. Pressure sensitivity isn't honored (stroke width is fixed per stroke); proper pressure-aware ink is a paid roadmap item." },
            { b: "Mid-drawing window resize works.", t: "Strokes are stored in PDF coordinate space, not CSS pixels. Resize the window mid-session and committed strokes still align with the page content." },
          ],
        },
      },
      {
        h: "When to reach for a different tool",
        p: [
          "Three cases where free-draw isn't right:",
        ],
        list: {
          items: [
            { b: "Highlighting passages.", t: "Use Highlight PDF for proper transparent-yellow highlights. Free-draw can simulate it but the result is a yellow squiggle rather than a clean highlight rectangle." },
            { b: "Adding text comments.", t: "Use Add Text Box for typed annotations. Trying to handwrite with a mouse is painful; type instead." },
            { b: "Removing or replacing text.", t: "Scratching out text with ink is visually OK but doesn't remove the underlying text — readers can still copy-paste the crossed-out content. Use Redact for real content removal." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, free-draw handles PDFs up to 50 MB with no page-count cap. Processing runs in your browser via pdf-lib; nothing is uploaded. Output is byte-compatible with every PDF reader; strokes render identically across viewers because they're standard SVG paths in the content stream.",
          "Common pairings: Free-draw + Add Text Box for documents with both ink markup and typed comments. Free-draw → Flatten to lock in the markup. Free-draw → Compress for the smallest final marked-up file.",
        ],
      },
    ],
  },

  // ============================================================
  // add-links — making PDFs clickable
  // ============================================================
  "add-links": {
    title: "Add hyperlinks to a PDF — making any region clickable and why this needs low-level annotation surgery",
    intro:
      "Adding a clickable link to a PDF sounds like it should be a one-click operation, and at the UI level it is — drag a rectangle, paste a URL, done. Underneath, though, this is one of the more technically delicate operations a PDF tool can perform, because hyperlinks in PDF are not part of the page content — they are sibling annotation objects that the viewer overlays for interactivity. Here is what the tool does at the structural level, the four URL schemes supported, and the patterns that distinguish a well-placed hyperlink from one that frustrates readers.",
    sections: [
      {
        h: "Why this is structurally trickier than it looks",
        p: [
          "Most PDF modifications happen at the page-content-stream level — drawing text, vectors, images on a page. Hyperlinks are different: they live in the page's /Annots array as separate /Annot objects, not inside the content stream. Each annotation carries its own /Rect (position), /Subtype (Link, in this case), /Border (visual border around the clickable area, usually [0 0 0] for no border), and /A action subtree (what to do when clicked — typically launch a URL).",
          "Pdf-lib has high-level helpers for drawing things into a content stream but no addLink() helper for annotations. The tool constructs the /Annot dictionary manually with the right /Subtype, /Rect (in page coordinates, converted from canvas pixels), /Border, and /A action dictionary, then registers it as a new indirect object and appends its reference to the page's /Annots array. Doable, but not one-liner doable.",
        ],
      },
      {
        h: "Four URL schemes supported",
        p: [
          "Each scheme behaves slightly differently in PDF readers:",
        ],
        list: {
          items: [
            { b: "https:// and http://.", t: "Standard web links. Click in any modern PDF reader opens the user's default browser. By far the most common use case." },
            { b: "mailto:.", t: "Email links. Click opens the user's default mail client with the address pre-filled. Useful for contact pages, support links, signup forms." },
            { b: "tel:.", t: "Phone-number links. Click on mobile readers initiates a phone call. Desktop readers may not do anything; mobile readers (iPad Acrobat, Android Adobe, etc.) treat it as a tap-to-dial link." },
            { b: "file://.", t: "Local file references. Click attempts to open a file at the specified path on the reader's machine. Almost never the right choice — paths don't transfer across machines, and security-conscious readers block file:// links by default. Listed for completeness; avoid in shared documents." },
          ],
        },
      },
      {
        h: "Patterns that distinguish good link placement",
        p: [
          "Five habits that produce well-clickable PDFs:",
        ],
        list: {
          items: [
            { b: "Make the click target slightly larger than the visible text.", t: "Visible link text might be 10pt and tight. The click rectangle should extend a few points beyond the text on every side so readers don't have to land precisely. The default region you drag is typically larger than the text anyway, which is correct." },
            { b: "Verify the URL before clicking Apply.", t: "Typos in URLs aren't caught at apply time — the link just goes to the typo'd address. Always paste rather than type, and test on the rendered output before sharing." },
            { b: "Use Highlight PDF to make link regions visible.", t: "Hyperlinks have no visible border by default ( /Border [0 0 0]). Readers don't know they're clickable unless the underlying text is styled distinctively. If the link region isn't already styled like a link, run Highlight PDF first with a subtle yellow over the same region." },
            { b: "Group related links by page.", t: "Add all the links on page 1 before moving to page 2. The page navigator preserves your in-progress work, but it's easier to verify completeness when you work page-by-page rather than jumping around." },
            { b: "Test in multiple readers.", t: "Adobe Acrobat, Preview, Chrome, Firefox all handle link clicks slightly differently. Test in at least two before distributing." },
          ],
        },
      },
      {
        h: "Things that don't work in v1",
        p: [
          "Limitations worth knowing:",
        ],
        list: {
          items: [
            { b: "Internal goto-page links.", t: "PDF supports internal navigation (clicking a TOC entry jumps to the destination page within the same PDF). That's a different annotation kind (/Action /GoTo rather than /Action /URI). The current tool only handles external URL links. Bookmarks Editor handles internal navigation; it's a paid roadmap item." },
            { b: "Link borders.", t: "All links are placed with /Border [0 0 0] — no visible border. If you want a visible blue underline (web-style hyperlink), apply highlight or text styling separately." },
            { b: "Link removal.", t: "Add Links is additive — it adds new annotations but doesn't modify existing ones. To remove all hyperlinks from a PDF, use Strip Hyperlinks (the inverse tool); both agree on the /Link annotation shape." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, Add Links handles PDFs up to 50 MB. Processing runs in your browser via pdf-lib; nothing is uploaded. Output preserves all existing annotations (additive, not replace) and adds new /Link annotations for every region you defined.",
          "Common pairings: Add Links + Highlight PDF to make link regions visually obvious. Add Links → Flatten to lock the links and content together. Strip Hyperlinks as the inverse if you change your mind.",
        ],
      },
    ],
  },

  // ============================================================
  // nda-analyzer — legal AI workflow
  // ============================================================
  "nda-analyzer": {
    title: "NDA Analyzer — the five clauses that hide in every non-disclosure agreement",
    intro:
      "Non-disclosure agreements are signed faster than almost any other legal document. A vendor sends one before the first meeting, an investor sends one before the first pitch, an employee signs one on day one — sometimes after a 30-second skim. The friction with that pattern is that NDAs frequently contain clauses that have nothing to do with non-disclosure: embedded non-competes, IP assignment, exclusive jurisdiction in distant cities, even employment-style restrictions. Here is what the NDA analyzer surfaces, the five most common hidden clauses, and the redline approach that lets a non-lawyer push back confidently.",
    sections: [
      {
        h: "What the analyzer actually checks",
        p: [
          "The tool reads the full NDA text, then runs an AI audit pass that compares each clause against a checklist of NDA best-practices and known trap clauses. Output is a risk-flagged clause-by-clause analysis: each finding includes a severity rating (high / medium / low), the verbatim quote of the offending text, an explanation of why it's flagged, and a suggested redline. Plus a missing-clauses section that surfaces standard NDA carveouts (residual knowledge, publicly-known information, government-required disclosure) that should be present but aren't.",
          "The output is structured for action. You can take the redlines directly into a negotiation with the counterparty, or pass them to your lawyer for review. The verbatim quotes mean you can verify every flag — the AI isn't asking you to trust its summary; it's pointing at the actual text in the document.",
        ],
      },
      {
        h: "Five clauses that hide in every NDA",
        p: [
          "The patterns the analyzer catches most often:",
        ],
        list: {
          items: [
            { b: "Embedded non-competes.", t: "An NDA shouldn't restrict where you work next. Many do, with 12-24 month post-engagement non-competes buried in the obligations section. In India specifically, Section 27 of the Indian Contract Act makes most post-employment non-competes unenforceable, but having them in writing still chills you. Always flagged high-severity." },
            { b: "IP assignment.", t: "An NDA shouldn't include IP assignment language (that belongs in an employment / consulting / IP agreement). When found in NDAs, it often gives the counterparty rights to derivatives and improvements — much broader than the disclosure context warrants. Common in founder-investor NDAs as a hidden trap. High severity." },
            { b: "Mutual vs unilateral mismatch.", t: "Mutual NDAs protect both parties' confidential information; unilateral NDAs only protect one side. The analyzer surfaces which direction the document actually flows. Surprisingly often, a document labeled 'Mutual NDA' has unilateral restrictions buried in the substantive clauses." },
            { b: "Missing standard carveouts.", t: "Every reasonable NDA carves out: information already publicly known, information independently developed, information required to be disclosed by law, residual knowledge in the recipient's head. Carveouts left out turn an NDA into a perpetual gag. The analyzer flags each missing carveout explicitly." },
            { b: "Exclusive jurisdiction in distant cities.", t: "An NDA between two parties based in Bangalore shouldn't have exclusive jurisdiction in Delhi or Mumbai (let alone Singapore or Delaware). Distant-jurisdiction clauses make any dispute economically prohibitive — usually the point. Flagged medium-severity with context." },
          ],
        },
      },
      {
        h: "The redline approach for non-lawyers",
        p: [
          "Each flag in the output comes with a suggested replacement that a non-lawyer can confidently propose to the counterparty:",
        ],
        list: {
          items: [
            { b: "Quote what's flagged.", t: "'I noticed this clause: [verbatim quote]. This typically belongs in an employment agreement, not an NDA. Could we remove it from the NDA and address IP separately if needed later?'" },
            { b: "Suggest the replacement.", t: "'I'd propose: [replacement language from the analyzer's output].' Pre-built language is much easier to push than vague objections." },
            { b: "Reference the standard.", t: "'Standard NDAs typically include carveouts for [list]. Could we add those?' Naming the omitted carveouts directly shifts the conversation from 'you're being difficult' to 'we're aligning to standard practice.'" },
          ],
        },
      },
      {
        h: "When to use this tool vs go straight to a lawyer",
        p: [
          "Three signals that the analyzer is sufficient:",
        ],
        list: {
          items: [
            { b: "Low-stakes mutual NDA between equal counterparties.", t: "Vendor-prospect, founder-advisor, exploratory partnership talks. The analyzer's audit usually suffices." },
            { b: "Standard form NDA from a Fortune 500.", t: "Big-company NDAs are usually variations on a well-known template. The analyzer's pattern-match catches deviations." },
            { b: "Pre-meeting NDA before a first conversation.", t: "Often signed to enable a 30-minute discovery call. The analyzer's 15-credit cost is dramatically cheaper than a lawyer's review for routine documents." },
          ],
        },
        // The "go-to-lawyer" cases:
      },
      {
        h: "When you should escalate to counsel",
        p: [
          "Three signals that suggest a lawyer is worth the cost:",
        ],
        list: {
          items: [
            { b: "M&A or acquisition discussions.", t: "Pre-deal NDAs often carry standstill provisions, no-shop language, or specific-performance remedies that should be vetted by deal counsel." },
            { b: "Large vendor or supply-chain relationships.", t: "NDAs governing relationships worth significant revenue should be reviewed in the context of the broader commercial deal — a lawyer doing both at once finds inconsistencies the analyzer alone cannot." },
            { b: "IP licensing context.", t: "If the NDA is the first step in an IP licensing discussion, the IP assignment + non-compete provisions deserve careful expert review." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "NDA Analyzer charges 15 credits per analysis. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is the structured risk-flag list plus suggested redlines.",
          "Important: This is not legal advice. The tool is an audit aid. For NDAs in any of the three escalation categories above, consult an employment / commercial / IP lawyer as appropriate.",
        ],
      },
    ],
  },

  // ============================================================
  // ats-resume-optimizer — recruiting AI
  // ============================================================
  "ats-resume-optimizer": {
    title: "ATS Resume Optimizer — how applicant tracking systems actually parse your resume",
    intro:
      "Most job applications today filter through an ATS — Applicant Tracking System — before a human ever sees them. Workday, Greenhouse, Lever, iCIMS, Naukri's filter, hundreds of smaller systems. They parse your resume into structured fields (name, contact, experience, skills, education) and match those fields against the job description. If the parse fails or the match score is low, the application is rejected before recruiters ever review it. Here is how ATS parsing actually works, the seven formatting traps that cause parse failures, and the keyword strategy that beats stuffing.",
    sections: [
      {
        h: "How ATS parsing works",
        p: [
          "An ATS receives your resume (usually as PDF or DOCX) and runs a parser that walks the document looking for structured information. It identifies sections (\"Work Experience\", \"Education\", \"Skills\") by their headings, then extracts fields within each section (company names, dates, titles, bullet points). The extracted structure is what the ATS searches against — when a recruiter searches for \"3+ years Python experience,\" the ATS queries the parsed-and-stored database, not the original PDF.",
          "Parse quality varies dramatically by system. Modern enterprise ATS (Workday, Greenhouse) handle most reasonable resume formats. Legacy systems (some older corporate-careers portals, some Indian ATS) choke on multi-column layouts, custom heading names, embedded images, or any non-standard formatting. The optimizer audits your resume against the lowest-common-denominator parser to maximize pass-through across systems.",
        ],
      },
      {
        h: "Seven formatting traps",
        p: [
          "The most common reasons ATS parsing fails:",
        ],
        list: {
          items: [
            { b: "Multi-column layouts.", t: "Some legacy ATS read in column-major order, scrambling content. \"Skills\" in column 2 ends up interleaved with \"Work Experience\" from column 1. Single-column is universally parseable." },
            { b: "Custom section headers.", t: "ATS look for \"Work Experience,\" \"Professional Experience,\" or \"Employment History.\" \"Career Highlights\" or \"My Journey\" — common in modern resume templates — sometimes confuse the parser. Stick to standard headers." },
            { b: "Non-standard date formats.", t: "\"Jan 2022 - Present\" parses everywhere. \"01/22 - Current\" parses sometimes. \"2022 till date\" parses rarely. Pick the universal format." },
            { b: "Tables for layout.", t: "Tables for structured data (skills matrix, certifications list) usually parse fine. Tables for layout (using table cells to position content) often scramble. Use simple paragraphs or bullet lists instead." },
            { b: "Embedded images for content.", t: "A skills bar-chart rendered as an image is invisible to the parser. Same with embedded logos for previous employers. ATS does not OCR images." },
            { b: "Header / footer with critical info.", t: "Some parsers ignore headers and footers because they often contain page numbers and decorative content. If your name and contact info live only in the header, the parser may miss them entirely." },
            { b: "Font fallback issues.", t: "Custom fonts that didn't embed properly substitute to a fallback in the parser's environment. Text becomes visible garbage. Stick to standard fonts (Arial, Calibri, Times) that every parser knows." },
          ],
        },
      },
      {
        h: "Keyword strategy that beats stuffing",
        p: [
          "ATS match scoring looks for keywords from the job description appearing in your resume. The naive approach — copy-paste keywords from the JD into a \"Skills\" section — sometimes works but increasingly triggers ATS keyword-density flags and recruiter-level skepticism. The optimizer takes a different approach:",
        ],
        list: {
          items: [
            { b: "Surface keywords you ALREADY USED implicitly.", t: "If your bullet point says \"automated weekly data refresh from 3 source systems,\" you already did ETL work. The optimizer suggests adding \"ETL\" or \"data pipeline\" explicitly to that bullet — keywords tied to real experience you have, not stuffed in." },
            { b: "Add variations of the same skill.", t: "\"JavaScript\" / \"JS\" / \"Node.js\" / \"front-end development\" all map to similar competencies but trigger different ATS keywords. Where natural, add the variations." },
            { b: "Use the exact terminology from the JD.", t: "If the JD says \"Postgres\" and your resume says \"PostgreSQL,\" the ATS sees them as different terms. Match the JD's spelling unless your resume is being submitted to many different roles." },
            { b: "Keep the density natural.", t: "If a single skill appears 12 times in a 1-page resume, that's stuffing. ATS keyword-density flags trigger; recruiters notice. The optimizer warns when a keyword's density exceeds reasonable thresholds." },
          ],
        },
      },
      {
        h: "Three readiness scores worth knowing",
        p: [
          "The optimizer's output includes three scores:",
        ],
        list: {
          items: [
            { b: "Parse-readiness.", t: "How likely the resume parses correctly across the major ATS systems. Driven by the formatting checks. Aim for 90%+." },
            { b: "Keyword coverage.", t: "How many likely-relevant keywords appear in the resume. Generic ATS-readiness baseline; not job-specific. Aim for 80%+." },
            { b: "Polish.", t: "Resume best-practices checks beyond ATS: bullet structure (action verb + quantifiable outcome), section ordering, length appropriateness. Aim for 85%+." },
          ],
        },
      },
      {
        h: "ATS Optimizer vs JD Match — when to use each",
        p: [
          "Two related tools with different goals:",
        ],
        list: {
          items: [
            { b: "ATS Optimizer — generic readiness.", t: "Use first, before applying to any specific role. Establishes a baseline-clean resume." },
            { b: "JD Match — role-specific tuning.", t: "Use after ATS Optimizer, once you have a specific JD in hand. Tunes the resume to match THAT role's keywords and competencies." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "ATS Resume Optimizer charges 10 credits per resume. The tool handles PDFs and DOCX up to 25 MB. Processing runs on our servers; the resume is in memory only during analysis. Output includes the three readiness scores, the formatting-trap audit, and the keyword-coverage suggestions.",
          "Common pairings: ATS Optimizer → JD Match for role-specific tuning. ATS Optimizer → Cover Letter Generator for a complete application package. Resume Parser when you're a recruiter on the receiving side ingesting many resumes at once.",
        ],
      },
    ],
  },

  // ============================================================
  // blood-report-analyzer — medical AI tool
  // ============================================================
  "blood-report-analyzer": {
    title: "Blood Report Analyzer — extracting lab values from PDF reports and what the out-of-range flags actually mean",
    intro:
      "Lab reports are dense, jargon-heavy, and structured differently across labs. Reading a CBC or a Lipid Panel as a patient often feels like decoding a foreign language. The blood report analyzer extracts every test value with its unit, reference range, and out-of-range flag, then groups them by panel for easier scanning. It is not a diagnostic tool — interpretation belongs to your doctor — but the structured extraction makes a confusing PDF into something a patient can actually read and ask informed questions about. Here is what the analyzer extracts, the six panel types it groups by, and the boundary between data extraction and medical interpretation.",
    sections: [
      {
        h: "What the analyzer extracts",
        p: [
          "The tool reads every page of the lab report, identifies each test entry, and pulls out a structured record: test name (verbatim from the report), value, unit (mg/dL, mmol/L, %, IU/L, etc.), reference range as printed on the report, and the lab's own flag (normal / low / high / critical / unknown). Each test is also assigned to the panel it belongs to — CBC, Lipid, LFT (Liver Function), KFT (Kidney Function), Thyroid, Glucose, or Other.",
          "Crucially, we extract verbatim. The value is whatever the lab printed; the unit is whatever the lab used; the reference range is exactly as it appears on the report. Different labs use different reference ranges depending on their methodology, instrument calibration, and population they serve. The analyzer does not normalize across labs — comparing your report to internet-published reference ranges is a category error that we don't introduce.",
        ],
      },
      {
        h: "Six panel types we group by",
        p: [
          "Lab reports usually contain panels — collections of related tests run together. The grouping makes scanning easier:",
        ],
        list: {
          items: [
            { b: "CBC (Complete Blood Count).", t: "Hemoglobin, RBC count, WBC count, platelets, hematocrit, MCV, MCH, MCHC, differential counts (neutrophils, lymphocytes, monocytes, eosinophils, basophils). The general-health screen. Usually 12-15 tests." },
            { b: "Lipid Panel.", t: "Total cholesterol, HDL, LDL, triglycerides, VLDL, cholesterol/HDL ratio. Cardiovascular-risk screen. Usually 5-7 tests." },
            { b: "LFT (Liver Function Test).", t: "Total/direct/indirect bilirubin, SGOT/AST, SGPT/ALT, alkaline phosphatase, total protein, albumin, globulin, A/G ratio. Liver-health screen. Usually 8-10 tests." },
            { b: "KFT (Kidney Function Test).", t: "Urea, BUN, creatinine, uric acid, sodium, potassium, chloride, calcium, phosphorus, eGFR. Kidney-health + electrolyte screen. Usually 6-10 tests." },
            { b: "Thyroid Panel.", t: "TSH, T3, T4, free T3, free T4, anti-TPO antibodies. Thyroid-function screen. Usually 3-6 tests depending on order." },
            { b: "Glucose Panel.", t: "Fasting glucose, post-meal glucose, HbA1c, sometimes glucose tolerance. Diabetes-related screen." },
            { b: "Other.", t: "Anything outside the standard panels — vitamins (D, B12), iron studies, hormones, tumor markers, infection markers. Surfaced individually." },
          ],
        },
      },
      {
        h: "Indian lab conventions worth knowing",
        p: [
          "The analyzer handles Indian-lab-specific conventions because most users are testing through Indian diagnostic chains. Three patterns worth understanding:",
        ],
        list: {
          items: [
            { b: "Unit differences.", t: "Glucose may be reported in mg/dL (typical India) or mmol/L (typical Europe). HbA1c in % (DCCT-aligned) or mmol/mol (IFCC-aligned). The analyzer extracts what the lab printed; we don't convert or guess. If you're comparing reports from different labs, check that units match before drawing conclusions." },
            { b: "Reference range variation by lab.", t: "SRL's normal range for ALT might be 5-40 IU/L; Dr Lal's might be 0-55 IU/L; Apollo's might be different again. \"Out of range\" at one lab might be \"in range\" at another. The analyzer extracts each lab's specific range; do not compare across labs without normalizing to the same reference standard." },
            { b: "Indian-specific cutoffs.", t: "ICMR (Indian Council of Medical Research) defines HbA1c diabetes threshold at ≥6.5% — the same as international standards. But Indian labs may flag based on local population norms (Indian populations have different lipid baselines than Western populations). Discuss interpretation with an Indian-trained doctor who knows the local cutoffs." },
          ],
        },
      },
      {
        h: "The line between extraction and interpretation",
        p: [
          "The analyzer is explicitly a data-extraction tool, not a diagnostic tool. Two important distinctions:",
        ],
        list: {
          items: [
            { b: "What we do: surface what the lab reported.", t: "Value, unit, reference range, lab's own flag. All verbatim. We rearrange the layout to make it scannable but never change what the lab said." },
            { b: "What we don't do: interpret what the values mean for you.", t: "An out-of-range value is not automatically a problem. Reference ranges are population-based and may not apply to your context (pregnancy, age, medication, exercise level, recent diet, etc.). A specific pattern of values may indicate one of many possible conditions, none of which the analyzer can diagnose. Discussion with your doctor is essential." },
          ],
        },
      },
      {
        h: "Common use cases",
        p: [
          "Where the analyzer earns its place:",
        ],
        list: {
          items: [
            { b: "Pre-appointment preparation.", t: "Before discussing a report with your doctor, run it through the analyzer to understand the structure and flagged values. You'll ask better questions." },
            { b: "Tracking trends across reports.", t: "Run multiple reports through. Compare values for the same test across dates. Trend visualization is a roadmap item; the structured JSON export already lets you build trends in your spreadsheet of choice today." },
            { b: "Family caregiver review.", t: "If you're managing reports for an elderly parent, the structured output is much easier to scan than the original PDF — especially if the parent's prescribing doctor's office sends multi-page reports." },
            { b: "Insurance claim preparation.", t: "Some insurers need a structured summary of lab results for claim processing. The analyzer's JSON output is the structured form they typically want." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Blood Report Analyzer charges 15 credits per report. The tool handles PDFs up to 25 MB from any major Indian lab chain (SRL, Dr Lal PathLabs, Thyrocare, Metropolis, Apollo Diagnostics, hospital-side labs) and most international labs. Processing runs on our servers; the report is in memory only during analysis and is never persisted.",
          "Important: Not medical advice. The tool extracts data; interpretation belongs to your prescribing doctor.",
        ],
      },
    ],
  },

  // ============================================================
  // discharge-summary-explainer — paired medical AI tool
  // ============================================================
  "discharge-summary-explainer": {
    title: "Discharge Summary Explainer — translating medical Latin into plain language for patients and family",
    intro:
      "Hospital discharge summaries are written for doctors. They use Latin abbreviations, brand-name shorthand, dosing notation that only pharmacists know how to parse, and clinical phrasing that assumes the reader has medical training. The patient and the patient's family rarely have that training. The result is post-discharge confusion — medications taken at the wrong times, warning signs missed, follow-up appointments skipped because nobody understood when they were due. The discharge explainer rewrites the summary in plain language without changing the underlying medicine. Here is what it does, the four sections it always surfaces, and the precise boundary between language translation and medical interpretation.",
    sections: [
      {
        h: "What the explainer rewrites",
        p: [
          "The tool reads the full discharge summary, then rewrites it section-by-section in plain Indian English aimed at a patient or family member who has no medical training. Medical Latin becomes everyday words (\"acute myocardial infarction\" becomes \"a heart attack\"). Brand-name medications get explained (\"Tab Pan-D 40 mg\" becomes \"Pantoprazole 40 mg — a stomach-acid reducer\"). Indian dosing shorthand gets translated (\"1-0-1\" becomes \"one tablet in the morning and one at night\"; \"BD\" becomes \"twice daily\"; \"TDS\" becomes \"three times daily\"; \"SOS\" becomes \"only if needed\").",
          "Crucially, the rewrite is a translation, not an interpretation. We do not add diagnoses the doctor didn't write. We do not change dosages. We do not suggest skipping or substituting medications. The medical content is preserved exactly; only the language changes.",
        ],
      },
      {
        h: "Four sections the explainer always surfaces",
        p: [
          "Indian discharge summaries vary in layout but always carry these four blocks. The explainer ensures each is prominent in the output:",
        ],
        list: {
          items: [
            { b: "Diagnosis.", t: "What the doctor said is wrong, in plain language. \"Coronary artery disease with stable angina\" becomes \"narrowing of the heart's blood vessels causing chest pain.\" Medical terminology is kept once with the plain-language explanation alongside, so family members can recognize the technical terms in future appointments." },
            { b: "Treatment given during admission.", t: "What was done while in the hospital — surgeries, procedures, medications administered. Translated so the family understands what happened, not just what the bill itemizes." },
            { b: "Medications going home.", t: "Each medication: generic name, brand, dose, timing in everyday language, what it does, what to watch for. Indian dosing shorthand (1-0-1, BD, TDS, OD, SOS, PRN) translated to plain instructions. Critical for post-discharge compliance — most medication errors happen because the patient or family didn't understand the schedule." },
            { b: "Follow-up plan + warning signs.", t: "When the next appointment is, what tests to redo when, and the warning-sign list (when to rush back to the hospital vs when to call the doctor vs when something is normal). Surfaced prominently because this is the highest-stakes information in the entire summary." },
          ],
        },
      },
      {
        h: "Indian-specific patterns the tool handles",
        p: [
          "Three patterns specific to Indian medical practice:",
        ],
        list: {
          items: [
            { b: "Indian prescribing shorthand.", t: "1-0-1, 1-1-1, BD, TDS, QID, SOS, PRN, HS. The shorthand is universal in Indian prescriptions but unfamiliar to non-doctors. Pre-encoded in the explainer." },
            { b: "Brand-name medications.", t: "Indian prescriptions often use brand names (Pan-D for Pantoprazole, Calpol for Paracetamol, Telma for Telmisartan). The explainer surfaces both the brand the doctor wrote and the generic name, so the patient can verify they're picking up the right medication at the pharmacy." },
            { b: "Hindi / regional language overlays.", t: "Some discharge summaries from regional hospitals mix Hindi or local-language instructions with English medical content. The explainer handles mixed-language input gracefully — the output is plain English with the regional terms surfaced where helpful." },
          ],
        },
      },
      {
        h: "What this tool deliberately doesn't do",
        p: [
          "Three safety boundaries:",
        ],
        list: {
          items: [
            { b: "Doesn't change doses.", t: "If the doctor prescribed 40 mg Pantoprazole once daily, the explainer says 40 mg once daily. We don't suggest higher or lower based on body weight or interpretation." },
            { b: "Doesn't substitute medications.", t: "Cheaper alternatives, similar-class drugs, over-the-counter substitutes — none of these come up. The medication list is exactly what the doctor wrote." },
            { b: "Doesn't diagnose or predict.", t: "The output is a translation of the doctor's diagnoses, not new diagnoses. Predictions about recovery time, prognosis, complications — all stay with the doctor." },
          ],
        },
      },
      {
        h: "When to use this vs talk to the doctor directly",
        p: [
          "Two use signals:",
        ],
        list: {
          items: [
            { b: "Use the explainer immediately after discharge.", t: "Before the family leaves the hospital is ideal — explainer-clarified questions can be asked to the discharging doctor while they're still available. The 10-credit cost is much cheaper than a follow-up call." },
            { b: "Always call the doctor for anything unclear.", t: "If a warning sign is happening, if a medication dose seems wrong, if the timing isn't matching the explainer's interpretation — call. The explainer is a translation aid, not a substitute for medical contact." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Discharge Summary Explainer charges 10 credits per summary. The tool handles PDFs up to 25 MB from any Indian hospital. Processing runs on our servers; the summary is in memory only during analysis and is never persisted.",
          "Important: Not medical advice. The tool is a language translation aid. The medications, doses, and treatment plan are exactly what the doctor wrote. Discuss any unclear instructions with the prescribing doctor directly.",
        ],
      },
    ],
  },

  // ============================================================
  // employment-contract-review — legal AI workflow
  // ============================================================
  "employment-contract-review": {
    title: "Employment Contract Review — the clauses Indian candidates miss before signing",
    intro:
      "Most candidates sign their employment contract on the day they receive it, often without reading past the salary figure. The friction with that pattern is that Indian employment contracts often contain clauses with significant long-term impact: training bonds with steep liquidation amounts, broad non-solicits that extend well past employment, IP-assignment language that captures pre-employment work, unilateral transfer rights anywhere in India, exclusive jurisdiction in distant cities. These clauses are perfectly legal to include; they're also negotiable, and they shape years of post-employment options. Here is what the analyzer surfaces, the six clauses Indian candidates most often miss, and the redline approach that lets a non-lawyer push back without seeming difficult.",
    sections: [
      {
        h: "What the analyzer audits",
        p: [
          "The tool reads the full appointment letter or employment contract and runs a structured audit: compensation breakdown (base + variable + benefits + ESOP), term length, notice periods (both sides — many contracts give the employer 0 days and the employee 90), severance entitlement on termination, IP-assignment scope, non-solicit and non-compete language, training bond if any, jurisdiction and dispute-resolution clauses, ESOP/RSU vesting and termination triggers, garden-leave provisions.",
          "Each finding includes severity rating, verbatim quote of the clause, plain-language explanation of what it means for the candidate, and suggested replacement language for negotiation. Three to five specific negotiation points are surfaced at the top as priorities — the things most likely to matter most over a typical employment tenure.",
        ],
      },
      {
        h: "Six clauses Indian candidates miss",
        p: [
          "The patterns the analyzer catches most often:",
        ],
        list: {
          items: [
            { b: "Training bonds.", t: "Common in IT services and consulting firms. \"You agree to pay back ₹X if you leave before Y years.\" Bond amounts of ₹2-10 lakhs are typical; some companies use ₹15+ lakhs. Enforceable but negotiable — many candidates can ask for the bond to be waived, reduced, or capped at actual training cost. Always flagged high-severity." },
            { b: "Unilateral transfer rights.", t: "\"Employer may transfer you to any location in India.\" Sounds standard; in practice it has been used to force employees to relocate within weeks of joining, or to pressure exits by transferring to undesirable locations. Negotiate either a geographic cap or a notice period for transfers." },
            { b: "Broad non-solicits.", t: "\"You agree not to solicit any employee, customer, vendor, or partner for 24 months.\" Section 27 of the Indian Contract Act makes most post-employment non-competes unenforceable, but non-solicits are enforceable as long as they're reasonable. \"All employees of the company\" is rarely reasonable; \"direct reports + customers you worked with\" is more defensible." },
            { b: "IP assignment that captures pre-employment work.", t: "Most assignments cover work done during employment. Some capture \"all intellectual property the employee has created or may create\" — including pre-existing personal projects. Always negotiate to scope IP assignment to work done DURING employment and USING company resources." },
            { b: "Exclusive jurisdiction in distant cities.", t: "Bangalore-based employee, Bangalore-based employer, jurisdiction clause: \"All disputes shall be adjudicated exclusively in Mumbai courts.\" Makes any dispute economically prohibitive. Push for jurisdiction in your work city or for mutual-jurisdiction language." },
            { b: "ESOP vesting + termination triggers.", t: "Without acceleration on termination-without-cause, getting fired before the 4-year cliff means losing all unvested options. Negotiate partial acceleration (typically 1 year of additional vesting on termination-without-cause) for senior roles where ESOPs are material." },
          ],
        },
      },
      {
        h: "Garden leave — the nuance worth knowing",
        p: [
          "Garden-leave clauses are sometimes good for the employee (paid notice period where the employer doesn't expect work) and sometimes bad (unpaid or reduced-pay periods that block new employment). The analyzer separates the two cases:",
        ],
        list: {
          items: [
            { b: "Full-pay garden leave is generally fine.", t: "You can't work elsewhere during the notice period, but you're getting paid. Typically used to keep someone away from competitors for a few months. Net-positive for the employee in most cases." },
            { b: "Reduced-pay or unpaid garden leave is a red flag.", t: "Caps your ability to start a new role while your current employer pays you less than market. If the contract specifies reduced pay during notice, push for full pay or a shorter notice." },
          ],
        },
      },
      {
        h: "The redline approach for candidates",
        p: [
          "Three patterns that get pushback through without seeming difficult:",
        ],
        list: {
          items: [
            { b: "Anchor to market norms.", t: "\"Most contracts in our industry scope IP assignment to work done during employment. Could we align here?\" References standard rather than personal preference." },
            { b: "Suggest specific replacement language.", t: "Don't say \"change this.\" Say \"could we replace [verbatim quote] with [analyzer's suggested replacement]?\" Concrete language is dramatically easier to negotiate than abstract objections." },
            { b: "Pick your battles.", t: "Push back on 3-5 high-impact items, not every flag. The analyzer's priority section already does this triage." },
          ],
        },
      },
      {
        h: "When to escalate to a lawyer",
        p: [
          "Three signals:",
        ],
        list: {
          items: [
            { b: "Senior role (VP+) with significant ESOP / RSU.", t: "Vesting acceleration, change-of-control provisions, severance multiples — all worth expert review." },
            { b: "Founding-team / co-founder role.", t: "Founder agreements carry IP, vesting, and dispute-resolution complexity that warrants legal review beyond candidate-level negotiation." },
            { b: "Multi-jurisdictional employment.", t: "Hired by an Indian entity but working primarily outside India, or vice versa. Tax + labor law + immigration complexity needs expert guidance." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Employment Contract Review charges 20 credits per contract. The tool handles PDFs up to 25 MB. Processing runs on our servers; the contract is in memory only during analysis and is never persisted.",
          "Important: Not legal advice. The tool is an audit aid for non-lawyer candidates. For senior roles, founding-team roles, or multi-jurisdictional cases, consult an employment lawyer.",
        ],
      },
    ],
  },

  // ============================================================
  // court-judgment-summarizer — legal research AI
  // ============================================================
  "court-judgment-summarizer": {
    title: "Court Judgment Summarizer — extracting ratio decidendi, citations, and practical implications from Indian decisions",
    intro:
      "Indian court judgments are long. A Supreme Court reportable decision can run to 100+ pages; High Court orders frequently span 30-80 pages; even district court orders on substantive matters routinely exceed 20. Most of that length is necessary — the court has to recite facts, summarize arguments, cite authorities, and explain reasoning before reaching its conclusion. But for a lawyer trying to figure out whether a judgment applies to their case, the load-bearing content is a small subset: the issue framed, the holding, the ratio decidendi (the principle of law on which the decision rests), and the practical implications. The court-judgment summarizer surfaces exactly that. Here is how it works, the seven structured fields it extracts, and the boundary between automated extraction and citation work that still requires the original judgment.",
    sections: [
      {
        h: "What the summarizer extracts",
        p: [
          "The tool reads the full judgment and surfaces a structured analysis. Each finding is anchored to the paragraph in the original where it was identified, so you can verify everything by going back to the source. The output covers seven fields:",
        ],
        list: {
          items: [
            { b: "Citation.", t: "The judgment's standard citation format. \"(2024) 1 SCC 123\" for Supreme Court reports, \"AIR 2024 SC 456\" for All India Reporter, equivalent formats for High Court and tribunal reporters. Useful for shepardizing and case-tracking." },
            { b: "Parties.", t: "Appellant(s) / petitioner(s) vs respondent(s). Names extracted verbatim from the cause-title." },
            { b: "Issues framed.", t: "The specific legal questions the court agreed to answer. Indian courts usually frame issues explicitly in a numbered list at the start; the summarizer surfaces them with the corresponding paragraph numbers." },
            { b: "Held / operative directions.", t: "What the court actually decided. The disposition language (\"the appeal is allowed,\" \"the petition is dismissed,\" \"the impugned order is set aside and the matter is remanded\") plus any specific directions issued." },
            { b: "Ratio decidendi.", t: "The principle of law on which the decision rests — the part that future courts will treat as binding precedent. Surfaced both as a paraphrase and as the verbatim quote from the paragraph where it was laid down." },
            { b: "Cited authorities.", t: "Every prior judgment and statute cited in the order. Useful for building a citation graph or for finding related precedents." },
            { b: "Practical implications.", t: "What this decision means for similarly-placed litigants, lawyers, or authorities. 3-4 bullets capturing the operational takeaway beyond the doctrinal holding." },
          ],
        },
      },
      {
        h: "Why ratio decidendi extraction is the hard part",
        p: [
          "The single most useful field in the output is also the one most prone to nuance. The ratio decidendi is the principle of law on which a decision rests; obiter dicta are incidental observations that don't form part of the binding rule. Indian appellate courts often write judgments that mix both freely. Two specific challenges:",
        ],
        list: {
          items: [
            { b: "Multi-issue judgments.", t: "A judgment that decides three legal issues has three separate ratios, one per issue. The summarizer surfaces each. But complex decisions occasionally have overlapping ratios where the principle applied to issue 2 borrows from issue 1; the summarizer's separation may collapse those subtleties. For citation work, always cross-check with the original." },
            { b: "Distinguishing ratio from obiter.", t: "Indian courts frequently include obiter that reads like binding rule. The summarizer flags clearly-obiter passages (\"the court observed,\" \"it may be noted,\" \"by way of caution\") separately from ratio. Edge cases where the language is ambiguous get surfaced as ratio with a note." },
          ],
        },
      },
      {
        h: "Three workflows where the summarizer earns its place",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Litigation research.", t: "A lawyer looking for binding precedent on a specific legal question runs candidate judgments through the summarizer to find ratios that match their case's facts. Faster than reading every full judgment." },
            { b: "Compliance updates.", t: "When a regulator issues a decision (CCI orders, SEBI orders, ITAT orders), companies need to understand the operational implications. The practical-implications section translates legal language to business impact." },
            { b: "Law-student case preparation.", t: "Reading 200-page judgments for class is overwhelming for first-year students. The summarizer doesn't replace reading the original (and students should always go back to it for the reasoning), but it provides scaffolding to know what to look for." },
          ],
        },
      },
      {
        h: "Two patterns where the tool falls short",
        p: [
          "Limits worth knowing:",
        ],
        list: {
          items: [
            { b: "Vernacular-language judgments.", t: "Most reportable Indian judgments are in English. Tamil Nadu HC, some Karnataka HC orders, and some lower-court judgments use the local language. Run AI Translate first, then summarize. Output quality is somewhat degraded because translation introduces some content loss, but the structure usually comes through correctly." },
            { b: "Highly technical / specialized statutes.", t: "Judgments interpreting niche statutes (Customs Tariff Act schedules, specific GST notifications, intricate ITAT transfer-pricing decisions) sometimes carry technical context the summarizer misses. The output is still useful for orientation but should not be the only research." },
          ],
        },
      },
      {
        h: "How to use the output responsibly",
        p: [
          "Three best practices:",
        ],
        list: {
          items: [
            { b: "Always read the original for citation work.", t: "The summarizer is research aid, not research substitute. If you're citing a judgment in a brief, read the full judgment after using the summarizer to identify it as relevant." },
            { b: "Verify the citation format.", t: "Citation extraction is accurate but occasionally off by an alternate reporter. Confirm the citation matches the standard your court accepts." },
            { b: "Use the paragraph anchors.", t: "Every finding in the output is tagged with the paragraph number where it came from in the original. Use these to navigate the source quickly when verifying." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Court Judgment Summarizer charges 20 credits per judgment. The tool handles PDFs up to 50 MB. Processing runs on our servers; the judgment is in memory only during analysis and is never persisted. Output is structured JSON suitable for legal-research databases plus a human-readable rendered summary.",
          "Important: Not legal advice. The tool is a research aid for lawyers, paralegals, and law students. For citation work, always read the full original judgment.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-tables-from-pdf — high-value AI data extraction
  // ============================================================
  "extract-tables-from-pdf": {
    title: "Extract tables from PDF — AI-aware reconstruction beats copy-paste every time",
    intro:
      "Copy-paste from a PDF table almost never produces a usable spreadsheet. Column boundaries collapse, merged cells split into the wrong rows, multi-page tables fragment into separate chunks, and numbers sometimes lose precision in the transfer. The AI-aware table extractor reconstructs the table structure semantically — recognizing what's a header, which cells span columns, where multi-page tables continue, and how to preserve numeric values exactly. Here is what the extractor does, the five table patterns that confuse simpler tools, and why preserving numbers character-by-character matters more than you might think.",
    sections: [
      {
        h: "Why copy-paste mangles tables",
        p: [
          "PDF stores text at exact coordinates. The text \"Q1\" at position (100, 200), the text \"Q2\" at (200, 200), the text \"Q3\" at (300, 200) — to a human eye these are column headers in a row. To a copy-paste extractor, they're just three separate text runs at roughly similar y-coordinates. Without semantic understanding, the extractor doesn't know whether the gap between them is column-boundary or just kerning.",
          "AI-aware extraction looks at the table visually — the gridlines if present, the alignment patterns if not, the relationship between values across rows. It reconstructs the structure the way a human would read it, then exports cleanly to CSV or Excel.",
        ],
      },
      {
        h: "Five table patterns the extractor handles",
        p: [
          "Where simpler tools fall short and AI extraction earns its keep:",
        ],
        list: {
          items: [
            { b: "Multi-page tables.", t: "A 200-row table continues across 4 pages. Each page has its own header row repetition. Copy-paste produces 4 separate tables; AI extraction stitches them into one continuous table when the headers match." },
            { b: "Merged cells.", t: "A header row that spans multiple columns (e.g. 'FY2024' centered above 'Q1 / Q2 / Q3 / Q4'). Or a row label that spans multiple data rows. AI extraction preserves the merge semantics; copy-paste collapses everything to single-row." },
            { b: "Multi-level headers.", t: "Quarterly data with month-level sub-headers (\"FY24 → Q1 → Jan / Feb / Mar\"). The extractor identifies the hierarchy and produces hierarchical column headers in the output." },
            { b: "Mixed text + numeric columns.", t: "A table with company names, dates, and revenue figures. Each column has different parsing needs — the extractor preserves text verbatim and numbers as numbers, without trying to over-normalize." },
            { b: "Tables embedded in narrative text.", t: "A financial report with prose paragraphs and embedded tables. The extractor identifies the table boundaries even when the table doesn't have visible grid lines — relying on alignment and content patterns instead." },
          ],
        },
      },
      {
        h: "Why exact number preservation matters",
        p: [
          "We extract numbers character-by-character from the source — no rounding, no reformatting, no thousand-separator normalization. Three reasons this matters:",
        ],
        list: {
          items: [
            { b: "Financial precision.", t: "₹1,23,45,678.92 has to come out as exactly that, not 1,234,5678.92 with messed-up separators or 12345678.92 with separators stripped. Off-by-one-comma errors in financial extracts have caused real-world reconciliation failures." },
            { b: "Scientific precision.", t: "A measurement of 1.2345 ± 0.0012 has to preserve every digit of significance. Rounding to 1.23 destroys the precision the source carefully captured." },
            { b: "Audit-trail integrity.", t: "When the extracted table is going into a regulatory submission or an audit workpaper, the data has to match the source byte-for-byte. Any normalization introduces a documentation question of \"did the tool change the data?\" that we deliberately avoid by not changing anything." },
          ],
        },
      },
      {
        h: "When extraction is the right tool",
        p: [
          "Five workflows where the extractor earns its place:",
        ],
        list: {
          items: [
            { b: "Financial statement ingestion.", t: "Income statements, balance sheets, cash flow statements from annual reports or quarterly filings. The extractor turns them into Excel sheets for further analysis." },
            { b: "Scientific data pipelines.", t: "Research papers carry data tables that the researchers themselves often want machine-readable. Extract → analyze in R/Python." },
            { b: "Government data PDFs.", t: "Census tables, election results, regulatory statistics. Governments increasingly publish PDFs that are essentially data tables masquerading as documents. Extraction unlocks them." },
            { b: "Schedule and timetable extraction.", t: "Train schedules, course timetables, manufacturing schedules — all benefit from converting the visual table to a queryable data structure." },
            { b: "Catalog ingestion.", t: "Product catalogs, price lists, parts inventories — frequently distributed as PDFs but needed as spreadsheets for ordering systems." },
          ],
        },
      },
      {
        h: "Limits worth knowing",
        p: [
          "Two patterns where extraction quality degrades:",
        ],
        list: {
          items: [
            { b: "Scanned-image PDFs without OCR.", t: "If the PDF is an image of a table without a text layer, the extractor can't read the cells. Run AI · OCR first to add a text layer, then extract." },
            { b: "Truly nested sub-tables.", t: "A cell that contains its own table inside it. Rare in practice but does occur in some technical specs. The extractor surfaces nested tables as separate items in the output rather than trying to express them inline." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Extract Tables from PDF charges 5 credits per table extracted (not per PDF). A PDF with 6 tables costs 30 credits. The tool handles PDFs up to 25 MB. Processing runs on our servers; the PDF is in memory only during analysis. Output is per-table CSV plus a combined Excel file with one sheet per table.",
          "Common pairings: PDF-to-Excel for documents where the entire PDF is essentially one big spreadsheet that wants to be converted as a whole. Table extraction is the right tool when you want individual tables surfaced rather than full-document conversion.",
        ],
      },
    ],
  },

  // ============================================================
  // chart-to-data-table — paired with table extract, AI vision
  // ============================================================
  "chart-to-data-table": {
    title: "Chart to data table — extracting numeric data from visual chart images and what 'confidence' really means",
    intro:
      "Most data inside published reports lives in two places: numerical tables (which we extract via Tables-from-PDF) and visual charts (which are unstructured images). Extracting numbers from a chart is harder than extracting from a table because the chart is a picture — bars have heights, lines have y-values at each x, pie slices have angles. Reading the data back out requires visual estimation calibrated against gridlines, axis labels, and any explicit value labels. The chart-to-data-table tool does exactly this estimation. Here is what charts it handles, why the output sometimes returns ranges rather than precise numbers, and the cases where extraction is preferable to manually digitizing.",
    sections: [
      {
        h: "How chart-to-data extraction works",
        p: [
          "The tool reads each chart in the PDF as an image, then runs an AI vision pass that identifies the chart's type, its axes, its scale, its data series, and the individual data points. Output is a markdown table with axis labels and units. The format matches how a human would represent the chart's data in a spreadsheet — one column per axis, one row per data point, headers explaining what each column means.",
          "For values that are precisely readable from the chart (e.g. a bar that's exactly at the 100 gridline; a value label printed next to a data point), the output is the exact number. For values that require estimation (e.g. a bar between gridlines, a line value where no label is printed), the output is a range with a confidence note. The tool deliberately doesn't invent precision that isn't in the source.",
        ],
      },
      {
        h: "Chart types the tool handles",
        p: [
          "Common types covered with high accuracy:",
        ],
        list: {
          items: [
            { b: "Bar charts (vertical, horizontal, grouped, stacked).", t: "The most common business-report type. Bar heights map to values; the tool reads bar tops against the y-axis scale." },
            { b: "Line charts (single line, multi-line, with markers).", t: "Time-series and trend visualizations. The tool samples points along each line at the x-axis tick positions." },
            { b: "Pie charts.", t: "Slice angles map to percentages. The tool extracts each slice's label and percentage; for unlabeled slices, percentages are estimated from angle." },
            { b: "Scatter plots.", t: "Each point's (x, y) extracted relative to axes. Useful for research-paper figures." },
            { b: "Stacked and 100%-stacked.", t: "Each layer's contribution to each x-position extracted. The tool reads the layer boundaries against the y-axis." },
            { b: "Histograms.", t: "Bar charts where bars represent bins. The tool reads bin labels (x-axis ranges) and counts (y-axis heights)." },
            { b: "Radar / spider charts.", t: "Each axis's value for each series extracted. Useful for capability comparisons and multi-attribute scoring." },
          ],
        },
      },
      {
        h: "Why output sometimes returns ranges",
        p: [
          "Three specific situations where the tool returns \"170-180\" or \"approximately 50%\" rather than a single number:",
        ],
        list: {
          items: [
            { b: "Bars without value labels and only major gridlines.", t: "A bar that visually sits between the 150 and 200 gridlines, with no smaller gridlines or numeric label, gets returned as a range. Estimating to single-percent precision from coarse-gridline charts introduces fake accuracy." },
            { b: "Charts at low resolution.", t: "If the chart is small or low-DPI, pixel-level estimation introduces error. The tool returns ranges rather than overstating its confidence." },
            { b: "Pie slices without labels.", t: "Visually estimating a pie slice's angle to closer than ±5% accuracy is unreliable. Without labels, slices come out as approximate percentages." },
          ],
        },
      },
      {
        h: "When extraction beats manually digitizing",
        p: [
          "Cases where the tool's output is more accurate than what a human would produce by hand:",
        ],
        list: {
          items: [
            { b: "Many charts at once.", t: "A 50-chart report. Digitizing each chart by hand takes a day; extraction takes a few minutes." },
            { b: "Charts with consistent style.", t: "Once the tool has read one chart in a report, similar-styled charts in the same report extract very reliably. Human digitizers introduce more variance across many charts than the tool does." },
            { b: "When ranges are acceptable.", t: "If your downstream use can work with \"170-180\" rather than needing \"177.5\", the tool's range output is honest about precision in a way that a hand-digitizer's confident \"178\" usually isn't." },
            { b: "Bulk financial-report analysis.", t: "Quarterly reports come out at scale; extracting bar-chart data across dozens of companies for comparable analysis is the natural use case." },
          ],
        },
      },
      {
        h: "When manual digitization is still better",
        p: [
          "Three signals that suggest hand work:",
        ],
        list: {
          items: [
            { b: "A single chart that matters a lot.", t: "If the entire analysis hinges on the exact value of one chart, take the time to manually estimate against gridlines or contact the source for the underlying data." },
            { b: "Unusual chart types.", t: "Sankey diagrams, treemaps, sunburst, parallel coordinates — the tool handles best-effort but accuracy varies. For these, manual digitization or asking the source for data is more reliable." },
            { b: "Chart image quality is too low.", t: "If you can barely read the chart yourself, the tool can't read it either. Get a higher-resolution version of the source or ask the source for the underlying data." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Chart to Data Table charges 5 credits per chart found. A 10-chart report costs 50 credits; the tool lists every chart it detected in the summary so you can audit the count before being charged. PDFs up to 25 MB.",
          "Common pairings: Extract Tables from PDF for the numerical-table portions; Chart-to-Data-Table for the chart portions. Together they cover the complete numeric content of a report. PDF Inspector to see how many charts and tables are in a PDF before deciding which tools to run.",
        ],
      },
    ],
  },

  // ============================================================
  // insurance-policy-analyzer — Indian insurance AI
  // ============================================================
  "insurance-policy-analyzer": {
    title: "Insurance Policy Analyzer — the clauses Indian buyers miss before signing or renewing",
    intro:
      "Indian insurance policies are dense, structured for legal accuracy rather than reader understanding, and frequently signed without anyone reading past the premium. The friction with that pattern is that the most operationally important clauses — room-rent capping, sub-limits, waiting periods, exclusions — live deep in the policy and never get explained at the point of sale. The analyzer surfaces all of them with severity-rated flags so you know what you're actually buying. Here is what it parses, the six clauses Indian health-insurance buyers most often miss, and the boundary between policy parsing and insurance advice.",
    sections: [
      {
        h: "What the analyzer audits",
        p: [
          "The tool reads the full policy document and surfaces a structured audit: coverage type (individual / family floater / group), sum insured, premium breakdown, sub-limits per category (room, ICU, ambulance, doctor consult, OT charges, day-care procedures), waiting periods (pre-existing disease / specific-disease / initial), permanent exclusions, claim process and cashless network, renewability and portability terms, no-claim bonus (NCB) earned, restoration benefits if any.",
          "Each finding is anchored to the section of the policy where it was identified. Flag-bearing clauses (room-rent capping below market, high co-pay, missing day-care list, no restoration) get severity ratings — high (will materially reduce claim payout), medium (will affect specific scenarios), low (worth knowing but rarely binds). Plus a claim-document checklist so when you do need to claim, you know what to gather.",
        ],
      },
      {
        h: "Six clauses Indian health-insurance buyers miss",
        p: [
          "The patterns the analyzer catches most often:",
        ],
        list: {
          items: [
            { b: "Room-rent capping.", t: "Most Indian health policies cap room rent at 1% or 2% of sum insured per day. If you stay in a higher-category room, the proportionate-deduction clause reduces EVERY other charge — doctor's fees, investigations, OT charges — by the same proportion. Worst-case you can lose 30-50% of your claim from a single room upgrade. The analyzer flags low room-rent caps as high-severity." },
            { b: "Sub-limits per procedure.", t: "Specific procedures (cataract, hernia, joint replacement) often have separate caps below the overall sum insured. A ₹10-lakh sum insured policy with a ₹40,000 cataract sub-limit doesn't actually cover a typical cataract surgery. Flagged when sub-limits are materially below typical procedure costs." },
            { b: "Pre-existing disease waiting period.", t: "Conditions diagnosed before you bought the policy aren't covered until the waiting period expires — typically 2-4 years. The analyzer surfaces the exact period and which conditions it applies to." },
            { b: "Specific-disease waiting period.", t: "Certain procedures (hernia, cataract, joint replacement, hysterectomy) have 1-2 year initial waiting periods even for new patients. Common surprise during the first year of a new policy." },
            { b: "Permanent exclusions.", t: "Cosmetic surgery, infertility treatment, dental (except accident-related), addiction treatment, alternative medicine. Standard list across most policies, but each policy adds its own — the analyzer surfaces non-standard additions explicitly." },
            { b: "Co-payment and deductible.", t: "Senior-citizen policies often have 10-20% co-pay (you pay this slice of every claim). Health-policy variants for younger buyers sometimes have voluntary deductibles. Both reduce your effective coverage; the analyzer surfaces the exact percentages." },
          ],
        },
      },
      {
        h: "Policy types the tool handles",
        p: [
          "Specific Indian insurance contexts covered:",
        ],
        list: {
          items: [
            { b: "Health (individual / family floater / group employer).", t: "The largest category. Auditor surfaces the floater-specific traps (single sum insured across the family, which someone else's hospitalization can exhaust before yours)." },
            { b: "Life and term.", t: "Premium / sum-assured ratio, renewability, lapse-and-revival terms, loan-against-policy provisions, surrender value table for traditional plans." },
            { b: "Motor (own-damage + third-party).", t: "IDV, NCB, depreciation grid for parts, repair-vs-replace cap. The single biggest motor-claim gotcha is partial-loss depreciation; the analyzer surfaces this." },
            { b: "Home.", t: "Building vs contents split, valuation method (reinstatement vs market value), excluded perils (earthquake / flood / terrorism as standard add-ons not standard coverage)." },
            { b: "Travel.", t: "Trip cancellation triggers, medical emergency caps, baggage / passport-loss limits, pre-existing-condition rules for travel." },
          ],
        },
      },
      {
        h: "What to do with the analyzer output",
        p: [
          "Three patterns for using the findings:",
        ],
        list: {
          items: [
            { b: "At purchase decision.", t: "Compare the analyzer outputs across multiple quotes. The premium is one input; the sub-limits and waiting periods are equally important — a cheaper policy with hard sub-limits often pays out dramatically less." },
            { b: "At renewal.", t: "Compare this year's policy to last year's. Insurers sometimes change room-rent caps, add new exclusions, or raise co-pays at renewal. The analyzer surfaces year-over-year changes when you run sequential policies." },
            { b: "Before claim.", t: "Review the claim-document checklist before going to the hospital. Missing documents is a major reason claims get delayed; having the list ready prevents that." },
          ],
        },
      },
      {
        h: "Portability vs renewal",
        p: [
          "One specific decision the analyzer informs:",
        ],
        list: {
          items: [
            { b: "Renewal stays with the current insurer.", t: "Pros: continuity of waiting periods, accumulated NCB, no fresh underwriting. Cons: stuck with whatever sub-limits and exclusions this policy has." },
            { b: "Portability moves to a different insurer.", t: "Pros: potentially better sub-limits, better network, lower premiums. Cons: re-underwriting, potential loss of NCB, possible new waiting periods on conditions diagnosed during the old policy term. The analyzer surfaces the data; the decision is yours." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Insurance Policy Analyzer charges 20 credits per policy. The tool handles PDFs up to 25 MB. Processing runs on our servers; the policy is in memory only during analysis and is never persisted.",
          "Important: Not insurance advice. The tool is a parsing aid. For decisions on switching insurers, claim disputes, or coverage gaps, consult an IRDAI-licensed insurance advisor.",
        ],
      },
    ],
  },

  // ============================================================
  // loan-application-bundler — Indian retail finance AI
  // ============================================================
  "loan-application-bundler": {
    title: "Loan Application Document Bundler Audit — the lender checklist and what's missing from your stack",
    intro:
      "Indian retail loans — home, personal, business, car, education — share a similar document checklist across HDFC, SBI, ICICI, Axis, Bajaj, and dozens of NBFCs. The list is well-known to bank relationship managers and DSAs (Direct Sales Agents) but rarely written down anywhere a first-time applicant can find. The result is a familiar pattern: you submit your stack, the bank comes back asking for documents you didn't include, you spend a week gathering them, the sanction process restarts. The bundler audit short-circuits that loop by running your document stack against the same checklist banks use. Here is what it checks, the five eligibility-affecting flags that derail more applications than missing documents, and where the audit ends and lender-side underwriting begins.",
    sections: [
      {
        h: "What the audit checks",
        p: [
          "The tool reads your concatenated loan-document bundle (the recommended workflow is to merge all documents with our free Merge PDF tool first). It detects the loan type from the document mix — a stack with property documents and Form 26AS plus salary slips is a home loan; a stack with just bank statements and salary slips is a personal loan; a stack with GST returns and business bank statements is a business loan. The detection is usually unambiguous.",
          "Once the loan type is identified, the auditor runs the document checklist for that type: KYC (PAN, Aadhaar), income proof (salary slips, ITR, Form 16, bank statements showing salary credits, GST returns for business), property documents for secured loans (title deed, encumbrance certificate, approved plan), guarantor documents if needed. Output is a per-document status: present, present-but-partial (e.g. only 3 months of statements when 6 are required), or missing.",
        ],
      },
      {
        h: "Five eligibility-affecting flags",
        p: [
          "Beyond \"are the documents present,\" the audit surfaces flags that affect whether the loan will actually sanction. These derail more applications than missing documents:",
        ],
        list: {
          items: [
            { b: "Bounced EMI in the last 12 months.", t: "Any EMI bounce on existing loans in the recent past is a major red flag for any new sanction. The analyzer reads bank statements and surfaces bounced EMIs explicitly. If found, addressing them (or waiting for them to age out) before applying is more productive than applying and getting rejected." },
            { b: "Salary credit gaps.", t: "Your salary should show up in your bank statement consistently. Two missed months in a row signal employment instability — a sanction-killer. The analyzer surfaces missing-month patterns from the statement." },
            { b: "FOIR over 50%.", t: "Fixed Obligation to Income Ratio — your existing EMIs as a percentage of your income. Over 50% typically means rejection regardless of credit score. The analyzer estimates FOIR from your salary slips and existing-EMI patterns in the bank statement." },
            { b: "Recent loan applications.", t: "Multiple recent hard inquiries on your CIBIL signal credit hunger. The analyzer can't see your CIBIL directly but surfaces the loan-disbursement entries in your bank statement that suggest recent borrowing." },
            { b: "Income vs lifestyle mismatch.", t: "Bank-statement entries that are inconsistent with your stated income (expenses dramatically higher than salary, large unexplained deposits, frequent cash withdrawals) trigger underwriter scrutiny. The analyzer surfaces these patterns for you to know about before the bank notices." },
          ],
        },
      },
      {
        h: "Loan-type-specific checks",
        p: [
          "The audit varies by loan type:",
        ],
        list: {
          items: [
            { b: "Home loan.", t: "Adds property documents (title deed, encumbrance certificate, approved plan, NOC from society if applicable, property tax receipt). Property valuation requirements, builder NOC for under-construction property, conversion certificate if agricultural-to-residential." },
            { b: "Personal loan.", t: "Lightest checklist: KYC + salary slips + bank statements. Most decided on CIBIL + FOIR." },
            { b: "Business loan.", t: "GST returns (last 12-24 months), business bank statements, ITR for the business entity, partnership deed / company incorporation docs if applicable, business proof (Shops & Establishment, MSME registration, GST registration)." },
            { b: "Car loan.", t: "KYC + income proof + the car's quote / invoice. RC book for used-car loans. Insurance copy if pre-existing." },
            { b: "Education loan.", t: "Admission letter, fee structure, course details, parent/co-applicant KYC + income proof. Collateral docs for loans above the unsecured threshold." },
          ],
        },
      },
      {
        h: "Lender-specific variations the analyzer can't fully cover",
        p: [
          "The audit is calibrated to the typical Indian retail-lending checklist. Specific lenders sometimes have variations:",
        ],
        list: {
          items: [
            { b: "NBFC vs bank.", t: "Some NBFCs accept lighter documentation (no Form 26AS, no 6-month statements, etc.) for speed. Bank checklists are typically stricter. Verify with the specific lender." },
            { b: "Cooperative banks.", t: "Sometimes have unique additional requirements (member shareholding, branch-relationship history). The analyzer's general checklist misses these." },
            { b: "Government schemes (PMAY, MUDRA).", t: "Subsidized schemes have their own additional documentation (income certificate, EWS/LIG certificate, etc.). Verify with the bank running the scheme." },
          ],
        },
      },
      {
        h: "Privacy considerations",
        p: [
          "Loan documents are sensitive — they contain PAN, Aadhaar, bank statements, salary information. The analyzer processes them in memory only and deletes server-side temporary copies after 60 minutes. For DSAs and brokers handling many clients, the Pro tier offers per-client folders with audit logs.",
          "Three habits worth knowing:",
        ],
        list: {
          items: [
            { b: "Redact PAN / Aadhaar before sharing the audit output.", t: "If you're forwarding the analyzer's output to a DSA or family member, the audit may reference PAN / Aadhaar that you do not want to forward. Use AI Redact to scrub before sharing." },
            { b: "Strip metadata.", t: "The bundle PDF you uploaded may carry metadata from the original DOCX or XLSX sources. Run Remove Metadata before sharing the audit alongside the bundle." },
            { b: "Sanitize attachments.", t: "Some loan-document PDFs carry hidden attachments. Run Extract Attachments to verify what's inside, and strip any unintended additions." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Loan Application Bundler charges 15 credits per audit. The tool handles PDFs up to 100 MB (large bundles are common). Processing runs on our servers with 60-minute retention; nothing persisted beyond.",
          "Important: This is a checklist-completeness aid, not loan pre-approval. Final eligibility depends on the lender's underwriting based on CIBIL, FOIR, employment stability, and credit appetite. The audit makes sure you don't waste a sanction-day with incomplete docs.",
        ],
      },
    ],
  },

  // ============================================================
  // explain-pdf — plain-language AI
  // ============================================================
  "explain-pdf": {
    title: "Explain PDF in plain English — when simplification helps and when it loses accuracy",
    intro:
      "Many of the documents people most need to understand — medical reports, legal contracts, research papers, regulatory filings — are written in language deliberately optimized for technical accuracy rather than reader comprehension. The plain-English explainer rewrites the content at roughly a grade-12 reading level: short sentences, no jargon, structured into Big Idea / Details / Why It Matters. The output isn't dumbed down; it's translated. Here is how the explainer works, where it shines, and the three cases where you should reach for a different tool.",
    sections: [
      {
        h: "How simplification preserves accuracy",
        p: [
          "The tool reads the source PDF and runs an AI rewrite pass that follows three rules: preserve every factual claim verbatim, simplify the surrounding language, and structure the output into three clear sections. Numbers, dates, names, quoted text — none of these are simplified. Only the connecting prose changes. A medical report that says \"the patient presents with hyperlipidemia\" becomes \"the patient has high cholesterol\" — the specific clinical finding is preserved (high cholesterol = hyperlipidemia), but the medical Latin is translated.",
          "The three-section structure (Big Idea / Details / Why It Matters) is deliberate. \"Big Idea\" answers the question \"if I read only one sentence, what should it be?\" — useful for triage. \"Details\" carries the substantive content. \"Why It Matters\" surfaces the practical implications for the reader — often the most actionable section because it explicitly connects the content to what the reader should do or know.",
        ],
      },
      {
        h: "Why grade-12 reading level instead of grade-5",
        p: [
          "Many \"explain like I'm 5\" tools target a very low reading level. We deliberately aim higher. Two reasons:",
        ],
        list: {
          items: [
            { b: "Vocabulary that's too simple becomes imprecise.", t: "\"Heart attack\" is grade-5; \"myocardial infarction\" is medical Latin. The middle ground — \"the heart's blood supply was blocked, causing damage to the muscle\" — uses grade-12 vocabulary but is more precise than either extreme." },
            { b: "Grade-5 output sounds patronising to adult readers.", t: "Most users want to understand the document, not be talked down to. Grade-12 retains adult dignity while still being accessible to anyone who finished high school." },
          ],
        },
      },
      {
        h: "Five high-value use cases",
        p: [
          "Where the explainer earns its place:",
        ],
        list: {
          items: [
            { b: "Briefing family on medical reports.", t: "Lab results, discharge summaries, specialist consult notes. The technical content gets translated for family members who need to understand what's happening." },
            { b: "First-pass skim of research papers.", t: "Reading a 30-page paper to decide whether it's worth a deep read. The explainer's Big Idea + Why It Matters sections are usually enough to triage." },
            { b: "Understanding legal documents.", t: "A contract or court order in plain language for a non-lawyer party. Crucially, this is a comprehension aid — for actually acting on the document, you still need a lawyer." },
            { b: "Technical white papers for non-experts.", t: "A product manager reading an engineering white paper, an engineer reading a marketing white paper, a journalist reading a regulatory filing. Different expertise gaps; same translation tool." },
            { b: "Patient-side reading of insurance documents.", t: "Policy language is deliberately legal. Plain English helps the policy-holder understand what they actually bought." },
          ],
        },
      },
      {
        h: "Three cases where you should reach for a different tool",
        p: [
          "Cases where the explainer is the wrong choice:",
        ],
        list: {
          items: [
            { b: "Exam preparation.", t: "If you're studying for an exam, the source's exact vocabulary matters — the test will probably use it. Use Summarize PDF instead, which preserves technical terminology with explanations alongside." },
            { b: "Publication-grade summary.", t: "A summary going into a paper, report, or other formal deliverable should preserve register. Plain English shifts the register down; use Summarize PDF for a register-matched summary." },
            { b: "Actionable decisions in legal / medical contexts.", t: "Plain English doesn't change the law or the medicine — it just changes the language. For decisions that have consequences (signing a contract, choosing a treatment), the plain-English summary is preparation for talking to a professional, not a substitute for it." },
          ],
        },
      },
      {
        h: "How accuracy is preserved",
        p: [
          "Five specific guardrails the tool applies during simplification:",
        ],
        list: {
          items: [
            { b: "Numbers are quoted verbatim.", t: "If the source says \"₹1,23,45,678.92\" or \"5.2%\" or \"30 mg/dL,\" the explainer says the same — no rounding, no reformatting, no thousand-separator change." },
            { b: "Dates are preserved exactly.", t: "Date formats vary; the explainer preserves the source's format rather than normalizing." },
            { b: "Proper nouns aren't simplified.", t: "Drug names, company names, statute citations, case names — all preserved verbatim. The reader needs to be able to look these up." },
            { b: "Direct quotes use quotation marks.", t: "If the source quotes something, the explainer reproduces the quote with attribution. Plain-English wrapping happens around quotes, not on them." },
            { b: "Disclaimers travel.", t: "Source-document disclaimers (\"not medical advice,\" \"subject to terms and conditions,\" \"past performance does not guarantee\") get preserved in the output so the reader sees them." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Explain PDF charges 3 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted.",
          "Important: Not legal, medical, or financial advice. The tool is a comprehension aid. For decisions in those domains, the plain-English version is preparation for consulting a professional, not a substitute for the consultation.",
        ],
      },
    ],
  },

  // ============================================================
  // improve-pdf-writing — clarity-concision rewrite AI
  // ============================================================
  "improve-pdf-writing": {
    title: "Improve PDF writing — what gets cut, what gets kept, and how to push back on AI edits",
    intro:
      "Most prose can be 20-30% shorter without losing meaning. Redundant qualifiers, run-on sentences, passive voice where active works better, throat-clearing intros, restated conclusions. Cutting them produces tighter, more readable output. The Improve Writing tool does the cutting automatically — but with rules about what stays untouched (your voice, your distinctive phrasings, your technical terms). Here is what the tool changes, what it deliberately leaves alone, and the workflow for reviewing the rewrite without losing the parts that worked.",
    sections: [
      {
        h: "What gets cut",
        p: [
          "Five categories the rewriter consistently trims:",
        ],
        list: {
          items: [
            { b: "Redundant qualifiers.", t: "\"Absolutely critical\" → \"critical.\" \"Completely unique\" → \"unique.\" \"Very important\" → \"important.\" Words that don't add information but feel like they're adding emphasis are cut." },
            { b: "Throat-clearing intros.", t: "\"In today's fast-paced world…\" \"It is important to note that…\" \"As we all know…\" These phrases delay the actual content. The rewriter starts where the substance starts." },
            { b: "Passive voice without nuance reason.", t: "\"The report was written by the team\" → \"the team wrote the report.\" Passive voice has legitimate uses (when the actor is unknown or irrelevant), but most passive voice in business writing is unconscious filler." },
            { b: "Run-on sentences.", t: "Sentences with three or more conjunctions get split into separate sentences. Easier to read; same content." },
            { b: "Restated conclusions.", t: "\"In conclusion…\" followed by a restatement of the opening claim. The tool keeps the strongest version and cuts the restatement." },
          ],
        },
      },
      {
        h: "What stays untouched",
        p: [
          "Five categories the rewriter deliberately preserves:",
        ],
        list: {
          items: [
            { b: "Register.", t: "Formal stays formal. Casual stays casual. Academic stays academic. The rewriter cuts within the register; it doesn't shift the register." },
            { b: "Distinctive phrasings.", t: "Unusual word choices that are working — a metaphor, a striking adjective, a specific cadence — get preserved. The rewriter errs on the side of keeping craft." },
            { b: "Technical terms.", t: "Industry-specific vocabulary stays. \"Subordinated debenture\" doesn't become \"loan that gets paid back after others\" — the precision matters." },
            { b: "Facts and figures.", t: "Numbers, dates, citations, proper nouns — all preserved verbatim." },
            { b: "Quoted text.", t: "Anything in quotes stays exactly as quoted." },
          ],
        },
      },
      {
        h: "How much shorter is normal",
        p: [
          "The expected reduction varies by source quality:",
        ],
        list: {
          items: [
            { b: "Well-written news copy or scientific abstract: 5-10%.", t: "Already tight. The rewriter finds modest cuts." },
            { b: "Business writing — proposals, white papers, reports: 20-30%.", t: "The most common reduction range. Business writing typically has more filler than the author realizes." },
            { b: "First drafts of anything: 30-40%.", t: "Drafts haven't been edited yet. The first revision pass cuts significantly. The tool gives you that first revision in one click." },
            { b: "Internal docs and email threads: sometimes 40-50%.", t: "Internal communication often has more throat-clearing. Compressing it for external distribution is a high-value use." },
          ],
        },
      },
      {
        h: "Reviewing the rewrite — three habits",
        p: [
          "The rewrite is a draft to review, not a final to accept. Three habits that produce the best output:",
        ],
        list: {
          items: [
            { b: "Read the original and the rewrite side-by-side.", t: "The tool produces both. Skim the original; read the rewrite carefully. Spot anything the rewrite cut that you wanted to keep." },
            { b: "Read the edit summary.", t: "The tool surfaces what kinds of changes it made (\"removed 6 throat-clearing intros,\" \"split 12 run-on sentences,\" \"replaced 8 passive constructions\"). The summary tells you whether the rewrite was conservative or aggressive." },
            { b: "Replace anything that doesn't sound like you.", t: "If a sentence in the rewrite reads in a voice that isn't yours, replace it with your own version. The cleaner alternative is still in front of you for comparison." },
          ],
        },
      },
      {
        h: "When to use Improve vs Paraphrase vs Rewrite",
        p: [
          "Three adjacent tools that solve different problems:",
        ],
        list: {
          items: [
            { b: "Improve — cut filler.", t: "Same meaning, fewer words. Use when the source is too long and the goal is tighter." },
            { b: "Paraphrase — same length, different wording.", t: "Use when you need the same content in a different voice (for citation, for syndication, to break out of stale phrasing). Length stays the same." },
            { b: "Rewrite — different register or tone.", t: "Use when you want to convert formal to casual, or vice versa. Substantial voice change." },
          ],
        },
      },
      {
        h: "When to use cautiously",
        p: [
          "Three cases where the rewriter benefits from extra care:",
        ],
        list: {
          items: [
            { b: "Fiction or poetry.", t: "The rewriter is calibrated for non-fiction. Fiction uses deliberate redundancy, rhythm, and voice that doesn't benefit from concision. Use the tool to spot accidental redundancy, not as a final pass." },
            { b: "Legal documents.", t: "Legal language is verbose for a reason — precision against ambiguity. Cutting words can change meaning. Use only on drafts of legal documents, not on final ones." },
            { b: "Documents going to a sensitive audience.", t: "If the original was written in a specific tone for a specific reader, the rewriter might shift the tone in ways the writer wouldn't approve. Review carefully or skip the tool." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Improve PDF Writing charges 5 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is the rewritten markdown / text plus the original side-by-side for comparison and the edit summary.",
          "Common pairings: Improve → Paraphrase if you also need wording variation. Improve → Generate PDF if the output should be a polished PDF rather than markdown.",
        ],
      },
    ],
  },

  // ============================================================
  // cover-letter-generator — recruiting AI
  // ============================================================
  "cover-letter-generator": {
    title: "AI Cover Letter Generator — tailored letters that don't sound like AI",
    intro:
      "Cover letters carry an outsized share of the application-effort budget. They take 30-60 minutes to write properly for each role. Most candidates either skip them, generate generic ones that sound like every other AI-written letter, or write enthusiastic-but-vague templates that say nothing specific about the job. The cover letter generator solves the specific problem: tailor a letter to THIS resume and THIS job description, in a voice that doesn't sound machine-generated. Here is what it produces, the three-paragraph structure that beats five-paragraph templates, and the customization-notes pattern that lets you stress-test the mapping.",
    sections: [
      {
        h: "What the generator actually does",
        p: [
          "Drop your resume (PDF) and paste the job description. The tool reads both, identifies the top 3-5 requirements in the JD that map to specific achievements in your resume, and writes a 300-350 word cover letter following a three-paragraph structure: hook (opening that anchors to a specific JD requirement), achievements (two concrete examples from your resume mapped to JD needs), close (call to action plus reaffirmation of fit).",
          "The output includes a customization-notes section: a 3-bullet list showing which resume line mapped to which JD requirement. This is the most valuable part of the output — it's not just the letter, it's the reasoning. You can review the mapping, swap in different achievements, and iterate without regenerating from scratch.",
        ],
      },
      {
        h: "Why three paragraphs beats five",
        p: [
          "Traditional cover letter advice says five paragraphs. Modern hiring-manager attention spans say otherwise:",
        ],
        list: {
          items: [
            { b: "Hook (1 paragraph, 60-80 words).", t: "First sentence anchors to a specific JD requirement: \"Your job description's emphasis on X is exactly the problem I spent the last two years solving at Y.\" Specificity from sentence one. No throat-clearing." },
            { b: "Achievements (1-2 paragraphs, 150-200 words).", t: "Two concrete examples — quantified outcomes, specific tools, specific contexts. \"At [company], I [action verb] [thing] resulting in [outcome with number].\" The two examples should align to two different JD requirements; combined they show range." },
            { b: "Close (1 paragraph, 60-80 words).", t: "Call to action plus brief reaffirmation. \"I'd love to discuss how my work at [company X] could translate to your needs around [JD requirement Y]. I'm available for a conversation any time this week.\" Specific, confident, brief." },
          ],
        },
      },
      {
        h: "How we suppress AI tells",
        p: [
          "The tell that a cover letter was AI-generated is usually not the structure or the grammar — it's specific clichéd phrases that appear in nearly every AI-generated letter. The tool actively suppresses:",
        ],
        list: {
          items: [
            { b: "\"Self-motivated team player.\"", t: "Almost every AI cover letter has this. Replaced with specific evidence of motivation and teamwork drawn from the resume." },
            { b: "\"Hit the ground running.\"", t: "Cliché filler. Replaced with concrete description of how the candidate would ramp into the role." },
            { b: "\"I am thrilled to apply.\" / \"Excited about the opportunity.\"", t: "Empty enthusiasm. Replaced with specific anchoring to the JD." },
            { b: "Bullet lists of qualifications.", t: "Cover letters should be prose. Bullet lists feel resume-like and break the narrative flow. The tool writes connected paragraphs instead." },
            { b: "Generic closes (\"Thank you for your consideration\").", t: "Replaced with specific call to action and reaffirmation of fit." },
          ],
        },
      },
      {
        h: "Using the customization-notes section",
        p: [
          "The customization-notes section is where the value compounds:",
        ],
        list: {
          items: [
            { b: "Review the mappings.", t: "If \"JD requirement X mapped to resume line Y,\" verify that mapping is the strongest one you could make. Sometimes a different resume line is a better fit; replace the example in the letter accordingly." },
            { b: "Identify mismatches.", t: "If a JD requirement has weak or no mapping in your resume, the letter probably should acknowledge or work around it. The notes surface gaps so you can address them deliberately." },
            { b: "Reuse for similar roles.", t: "If you're applying to multiple roles with overlapping requirements, the customization notes tell you which resume lines work across the set. Swap only the differentiating examples per application." },
          ],
        },
      },
      {
        h: "When the generic version makes sense",
        p: [
          "You can run the generator without a JD — leave the JD field blank for a strong generic cover letter that emphasizes your top resume highlights. Three cases where this is the right choice:",
        ],
        list: {
          items: [
            { b: "Speculative applications.", t: "Reaching out to a company without a specific open role. A strong general letter beats a JD-tailored one that doesn't have a target JD." },
            { b: "Application portals that ask for a single letter.", t: "Some application portals (university career services, third-party recruiters) ask for one cover letter that'll be reused across submissions. A general strong letter is right." },
            { b: "First-pass letter for editing.", t: "Use the generic version as a starting point, then manually customize for each role using the customization-notes pattern from previous JD-specific runs." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Cover Letter Generator charges 5 credits per letter. The tool handles resume PDFs up to 25 MB and job descriptions of any reasonable length. Processing runs on our servers; the resume and JD are in memory only during generation and are never persisted.",
          "Common pairings: ATS Resume Optimizer first to make sure your resume parses cleanly, then JD Match to score fit, then Cover Letter Generator to produce the final letter. The three together cover the full application-prep workflow.",
        ],
      },
    ],
  },

  // ============================================================
  // hindi-pdf-translator — language-specific translation
  // ============================================================
  "hindi-pdf-translator": {
    title: "Hindi PDF Translator — Devanagari rendering, mixed-language documents, and what AI translation gets right (and wrong)",
    intro:
      "Translating PDFs between Hindi and English is one of the highest-volume language operations on the Indian internet. Government forms, court orders, university syllabi, news articles, family-history documents — Hindi-English translation is a daily need. The challenges are both technical (Devanagari script rendering, font embedding) and linguistic (when to translate technical terms, when to keep names in their original script). Here is how the translator handles each, the three patterns where AI translation beats Google Translate, and the limits worth knowing.",
    sections: [
      {
        h: "Devanagari rendering — why this is non-trivial",
        p: [
          "Hindi uses the Devanagari script, which has features that simpler font-rendering pipelines often handle poorly. Conjunct consonants (क + ्र = क्र), matra placement (े appears to the right but is logically attached to the previous consonant), nuqtas (़ for borrowed sounds), and ligatures all require an OpenType-aware font and a layout engine that respects Devanagari's text-shaping rules.",
          "We embed a Devanagari-capable font in every output PDF and use a layout engine that handles the script correctly. The result is clean rendering — no question-mark glyphs where conjuncts should be, no broken ligatures, no misplaced matras. The output PDF opens in every PDF reader with the same correct rendering regardless of whether the reader has Devanagari fonts installed locally.",
        ],
      },
      {
        h: "How mixed-language documents are handled",
        p: [
          "Many Indian documents — government forms, university syllabi, regulatory notices — mix Hindi body text with English headers, English company names, English acronyms, and English technical terms. Three principles guide the translation:",
        ],
        list: {
          items: [
            { b: "Proper nouns stay in their original script.", t: "Indian Oil Corporation stays \"Indian Oil Corporation\" in a Hindi-to-English translation. A Hindi name like \"रामेश्वर\" gets transliterated to \"Rameshwar\" in English output, kept as-is in Hindi output." },
            { b: "Acronyms stay.", t: "GST, PAN, RBI, NREGA, IIT — these stay in their original form regardless of translation direction. They're recognizable across both languages." },
            { b: "Technical terms preserved with explanation.", t: "When a term has no direct equivalent (\"sandesh\" in legal documents specifically meaning a notice or notification), the translation preserves the original term with a parenthetical clarification on first use." },
          ],
        },
      },
      {
        h: "Three patterns where AI beats Google Translate",
        p: [
          "AI translation has caught up on everyday prose; for specific registers it now exceeds standard machine translation:",
        ],
        list: {
          items: [
            { b: "Legal / regulatory tone matching.", t: "A court order's legal register doesn't translate as everyday Hindi. Google Translate often produces colloquial output; AI translation maintains the formal legal register. Output reads like it came from an Indian legal translator, not a tourist phrasebook." },
            { b: "Medical and pharmaceutical context.", t: "Drug names, dosage instructions, medical terminology — AI keeps the technical precision while translating the surrounding prose. Critical for documents that affect patient care." },
            { b: "Code-switched documents.", t: "Documents that switch between Hindi and English mid-sentence (common in modern Indian writing) handle better with AI than rule-based systems. The translator recognizes intentional code-switches and preserves them." },
          ],
        },
      },
      {
        h: "Scanned documents and bilingual output",
        p: [
          "Two features worth understanding:",
        ],
        list: {
          items: [
            { b: "Scanned PDFs go through OCR first.", t: "If your source is a scanned PDF (no text layer), AI OCR runs first to recognize the Devanagari (or Latin) text, then translation runs on the OCR output. Two-pass processing; one tool from the user's perspective." },
            { b: "Side-by-side bilingual output.", t: "An optional output mode renders the source and translation side-by-side on each page. Useful for legal documents where you need to verify the translation against the original, or for language-learning use cases." },
          ],
        },
      },
      {
        h: "When to verify with a human translator",
        p: [
          "AI translation is dramatically better than 5 years ago, but human review is still warranted for three cases:",
        ],
        list: {
          items: [
            { b: "Legal documents going to court.", t: "Court submissions in any language need a certified translation. AI translation is preparation material, not a substitute for a certified translator's stamp." },
            { b: "Medical decisions.", t: "If the translation is being used to make medical decisions (medication dosing, surgical consent), have a doctor or qualified medical translator verify." },
            { b: "Critical commercial agreements.", t: "Translation errors in commercial contracts can have significant downstream cost. For high-value contracts, human review of AI-translated documents is the safer path." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Hindi PDF Translator charges 1 credit per page. The tool handles PDFs up to 100 MB. Processing runs on our servers; the PDF is in memory only during translation and is never persisted. Output preserves the source layout (tables, images, headers) with Devanagari-capable fonts embedded.",
          "Common pairings: AI OCR first if the source is a scanned image-only PDF. Translate then Improve Writing if the translated output could be tighter. The same translator also handles Tamil, Telugu, Bengali, Marathi, Gujarati, and most other Indian scripts.",
        ],
      },
    ],
  },

  // ============================================================
  // generate-pdf-from-prompt — AI generation
  // ============================================================
  "generate-pdf-from-prompt": {
    title: "Generate PDF from Prompt — structural drafts vs final documents, and where to invest the remaining 30%",
    intro:
      "Generating a PDF from a plain-English prompt produces a structural draft — section organization, register matching, formatting — that is roughly 70% of the work for most non-fiction document types. The remaining 30% is fact-checking, brand-tuning, and domain-expert review. Understanding which 70% the generator handles well and which 30% needs human investment is the difference between using this tool effectively and being disappointed. Here is how generation works, the seven document types it handles well, the three that need substantial post-edit, and the prompt patterns that produce the best output.",
    sections: [
      {
        h: "What generation does well",
        p: [
          "Structural quality is consistently high. The generator produces appropriate section organization for the document type (executive summary, methodology, findings, conclusion for reports; recitals, definitions, terms, signatures for contracts; problem, audience, approach, timeline for proposals). Header hierarchy is correct (H1 for title, H2 for major sections, H3 for sub-sections). Register matches the document type (formal for legal / academic; conversational for marketing / blog; technical for engineering / scientific).",
          "Format is also handled well. The output is a real PDF with consistent typography, sensible margins, page breaks at logical points, page numbers in the right place. You don't need to fix layout; you can focus on content.",
        ],
      },
      {
        h: "Seven document types the generator handles well",
        p: [
          "Cases where structural-quality output meaningfully accelerates the work:",
        ],
        list: {
          items: [
            { b: "Business reports.", t: "Quarterly report drafts, market analysis reports, internal status reports. Section structure is standard; the generator nails it. Content fact-check needed but the skeleton is solid." },
            { b: "Proposals.", t: "Sales proposals, project proposals, grant proposals. The generator includes the right sections (problem statement, approach, timeline, deliverables, budget framework). You fill in specifics." },
            { b: "Educational modules.", t: "Course material, training documents, instructional guides. Learning-objective structure + chunked content + practice prompts come out cleanly." },
            { b: "Policy documents.", t: "Internal policies (remote work, expense, security), customer-facing policies (privacy, terms, data retention). Standard structures with placeholders for your specifics." },
            { b: "Briefs.", t: "Executive briefs, project briefs, design briefs. Tight, scannable, structured. The generator produces a strong first draft." },
            { b: "Standard contracts.", t: "NDAs, service agreements, basic vendor contracts. Structural quality is high; legal substance needs a lawyer's review (skeleton-prep use only)." },
            { b: "Marketing collateral.", t: "Whitepapers, eBooks, landing-page-companion documents. Conversational register, clean visual structure." },
          ],
        },
      },
      {
        h: "Three document types that need substantial post-edit",
        p: [
          "Cases where the generator's output is less complete:",
        ],
        list: {
          items: [
            { b: "Highly technical documents.", t: "Engineering specs, scientific protocols, medical procedures. The generator produces correct structure but the substantive content depends on prompt specificity that's hard to provide in plain English. Domain expert review is essential." },
            { b: "Brand-critical documents.", t: "Documents going to customers under your brand identity. The generator's typography and visual design are sensible defaults; matching a specific brand system (custom fonts, custom color palette, specific layout grids) requires post-generation editing in InDesign / Canva / equivalent." },
            { b: "Legal-final documents.", t: "Anything actually going into a courtroom, regulatory filing, or signed agreement. The generator drafts the structural skeleton; the legal substance, jurisdiction-specific compliance, and the precise wording need a lawyer." },
          ],
        },
      },
      {
        h: "Prompt patterns that produce the best output",
        p: [
          "Five habits that improve generation quality:",
        ],
        list: {
          items: [
            { b: "Specify the document type explicitly.", t: "\"Write a sales proposal for...\" produces a better result than \"Write a document about....\" The type tells the generator which structural template to use." },
            { b: "Provide key facts as bullet points in the prompt.", t: "Parties, dates, amounts, specific requirements — list these explicitly. The generator weaves them into the draft so you don't have to fact-check the skeleton." },
            { b: "Specify the audience.", t: "\"For a non-technical executive audience\" vs \"For an engineering team\" produces dramatically different register. The audience drives the vocabulary and structure choices." },
            { b: "Target a length.", t: "\"Approximately 2 pages\" vs \"approximately 10 pages\" produces different depth. Without a target, the generator picks a middle ground that may be too long or too short for your need." },
            { b: "Note any constraints.", t: "\"Must include a clause about X,\" \"must use the word Y,\" \"must avoid mentioning Z\" — constraints help the generator hit specific requirements." },
          ],
        },
      },
      {
        h: "When the markdown source is more useful than the PDF",
        p: [
          "The generator outputs both a PDF and the underlying markdown. Three cases where the markdown is the more valuable output:",
        ],
        list: {
          items: [
            { b: "Further iteration.", t: "If you need to edit substantially after generation, the markdown is much easier to edit than the PDF. Make changes, then re-render to PDF if needed." },
            { b: "CMS / wiki ingestion.", t: "If the destination is a content management system or wiki rather than a standalone PDF, the markdown drops in directly." },
            { b: "Translation / localization.", t: "Source-language markdown translates cleanly; the destination-language version can be re-rendered to PDF separately." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Generate PDF from Prompt charges 20 credits per document. Higher than analysis tools because generation is more compute-intensive. The tool produces both a PDF and a markdown source.",
          "Common pairings: Generate → Improve Writing for tighter prose. Generate → AI Sign for filled-and-signed deliverables. Generate → AI Translate for multilingual output. The generator is rarely the last step in a workflow.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-accessibility-checker — WCAG / PDF/UA audit
  // ============================================================
  "pdf-accessibility-checker": {
    title: "PDF accessibility checker — what WCAG and PDF/UA actually require, and how to read the audit output",
    intro:
      "PDF accessibility matters in three specific ways: it's a legal requirement in many jurisdictions (Section 508 in US federal procurement; the Equality Act in the UK; the Rights of Persons with Disabilities Act in India; the EU Web Accessibility Directive), it's a procurement requirement in most large-organization contracts, and it's the right thing to do for users who depend on assistive technology. The accessibility checker audits PDFs against WCAG 2.1 + PDF/UA requirements and surfaces every barrier explicitly. Here is what each requirement means in practice, the seven barriers the checker most often flags, and the fix paths for each.",
    sections: [
      {
        h: "What WCAG and PDF/UA actually require",
        p: [
          "WCAG 2.1 (Web Content Accessibility Guidelines) and PDF/UA (Universal Accessibility) are the two main accessibility standards for PDFs. They overlap substantially; PDF/UA is essentially WCAG operationalized for PDF specifically. Both require that a PDF carries enough structural metadata for assistive technology — primarily screen readers — to navigate and read it correctly. Six categories of requirement matter most:",
        ],
        list: {
          items: [
            { b: "Tag tree present.", t: "Every page must have a tag tree — a parallel structure that describes semantic hierarchy (which text is a heading, which is a paragraph, which is a table cell, etc.). Without a tag tree, screen readers have no way to navigate the document logically." },
            { b: "Alt text on images.", t: "Every meaningful image must have alt text — a text description of what the image conveys. Decorative images can be marked as artifacts (skipped by screen readers). Missing alt text is the single most common accessibility failure." },
            { b: "Document title set.", t: "The PDF's /Title metadata field must be populated. Screen readers announce the title on document open; an empty title leaves users in the dark about what document they just opened." },
            { b: "Language declared.", t: "The document's primary language (/Lang attribute) must be set. Screen readers switch pronunciation rules based on language; an undeclared language means English defaults that pronounce other languages incorrectly." },
            { b: "Logical reading order.", t: "The tag tree's order must match the visual reading order. Multi-column documents where the tags interleave columns badly produce confusing screen-reader output." },
            { b: "Color contrast sufficient.", t: "Text must meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text). The checker flags pages where contrast fails." },
          ],
        },
      },
      {
        h: "Seven barriers the checker most often flags",
        p: [
          "From real-world audits across thousands of PDFs:",
        ],
        list: {
          items: [
            { b: "Untagged document.", t: "The most fundamental failure. A PDF with no tag tree at all is essentially invisible to screen readers. Fix: re-export from source with structure preserved (Word's \"Save as PDF\" with accessibility option), or run Acrobat Pro's auto-tag and clean up manually." },
            { b: "Missing alt text.", t: "Images that lack alt text. Fix: add alt text via Acrobat Pro's accessibility panel, or re-export from source with alt text set on images." },
            { b: "Empty document title.", t: "Easy to fix and remarkably common to miss. Fix: set /Title in document properties before final export." },
            { b: "Missing language declaration.", t: "The /Lang attribute isn't set. Fix: declare language in document properties (en-US, hi-IN, etc.)." },
            { b: "Reading order interleaved.", t: "Tag tree order doesn't match visual order. Fix: re-order the tag tree in Acrobat Pro's accessibility tools, or fix the source layout to be naturally sequential (single column instead of multi-column where possible)." },
            { b: "Tables without proper header markup.", t: "Tables need <TH> tags on header cells; without them, screen readers can't announce row/column context. Fix: mark header rows in the source (Word's table-header-row option) or in Acrobat's accessibility tools." },
            { b: "Forms without tooltips.", t: "Every form field should have a tooltip (/TU). Screen readers announce the tooltip when focus enters the field. Fix: set tooltips in the source form designer or via Acrobat Pro." },
          ],
        },
      },
      {
        h: "How to read the audit output",
        p: [
          "The checker produces a per-requirement pass/fail report with specific failure details. Three patterns for interpreting it:",
        ],
        list: {
          items: [
            { b: "Counts matter.", t: "\"3 images missing alt text on pages 2, 5, 8\" is much more actionable than \"some images missing alt text.\" The audit surfaces exact counts and locations." },
            { b: "Severity is consistent across runs.", t: "If the checker flags \"missing alt text\" as critical on one PDF, it flags it identically on every PDF. The severity ratings are stable so you can build remediation policies around them." },
            { b: "Some failures cascade.", t: "An untagged document fails almost every other check too — because the other checks need the tag tree to exist before they can run. Fix the tagging first; many downstream flags clear automatically." },
          ],
        },
      },
      {
        h: "Fix paths — three approaches",
        p: [
          "Three workflows for remediating accessibility barriers:",
        ],
        list: {
          items: [
            { b: "Re-export from source.", t: "The cleanest fix. Modern Word, Google Docs, InDesign, LaTeX, and most authoring tools have \"Export as accessible PDF\" options. Re-exporting from source produces accessibility-correct PDFs without manual tagging." },
            { b: "Acrobat Pro accessibility tools.", t: "If you don't have the source, Acrobat Pro has tag-tree editing, alt-text-add panels, and auto-tag (with manual cleanup). The most labor-intensive path but works on any PDF." },
            { b: "AI Tag Generator (paid roadmap item).", t: "Auto-tags using ML with better section detection than Acrobat's built-in. Still needs human review for high-stakes documents." },
          ],
        },
      },
      {
        h: "When auto-tagging isn't enough",
        p: [
          "Three cases where the audit will pass but the document still isn't accessible:",
        ],
        list: {
          items: [
            { b: "Complex tables auto-tagged poorly.", t: "Auto-taggers struggle with multi-row headers, merged cells, and nested tables. The audit may pass the basic checks but a screen-reader user will still hit reading issues. Manual review of table tagging on complex tables is essential." },
            { b: "Mathematical content.", t: "MathML or equation markup isn't covered by the basic accessibility checks. Math-heavy documents need specific math-accessibility expertise to render correctly to screen readers." },
            { b: "Interactive elements with custom JavaScript.", t: "Form fields with JS handlers may pass the structural audit but behave unexpectedly with assistive technology. Test with actual screen readers (JAWS, NVDA, VoiceOver) for interactive PDFs." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, accessibility checker handles PDFs up to 100 MB. Auditing runs in your browser; nothing is uploaded. Output is a structured WCAG 2.1 + PDF/UA report with pass/fail per requirement and counts of failures.",
          "Common pairings: Accessibility Checker → re-export with accessibility enabled, or → Acrobat Pro for manual remediation, or → AI Tag Generator (paid) for auto-tagging with ML.",
        ],
      },
    ],
  },

  // ============================================================
  // ai-content-detector — AI-text stylometric detection
  // ============================================================
  "ai-content-detector": {
    title: "AI content detector for PDFs — what stylometric fingerprints actually detect and why no detector is courtroom-grade",
    intro:
      "AI-generated text has stylistic fingerprints — patterns that show up in LLM output dramatically more often than in human writing. Formulaic openers, hedging overuse, three-item rhetoric, em-dash patterns, polished-register uniformity. A skilled reader can spot AI text manually; a stylometric audit surfaces the same signals systematically. The friction is that none of these signals is definitive — humans sometimes write in patterns that match AI fingerprints, and careful editing can mask the fingerprints. Here is how the detector works, the eight specific patterns it looks for, and the precise reason we don't claim courtroom-grade accuracy.",
    sections: [
      {
        h: "How stylometric detection differs from trained classifiers",
        p: [
          "Two approaches to AI-text detection exist. Trained classifiers (GPTZero, Originality.ai) feed text into a neural network trained on labeled examples of human vs AI text. The classifier outputs a probability score. Trained classifiers can hit high accuracy on text from the LLMs they were trained on, but degrade against newer models and against edited AI text. They're also opaque — you can't easily see WHY the classifier flagged something.",
          "Our detector takes the stylometric approach: explicit pattern detection. We look for documented LLM stylistic fingerprints in the text and surface each match with its location and confidence. The advantage is transparency — you see exactly what was flagged and why. The trade-off is that an adversary who knows the patterns can edit to avoid them. We're explicit about that trade-off.",
        ],
      },
      {
        h: "Eight stylistic fingerprints the detector flags",
        p: [
          "Documented patterns from LLM output across major models (ChatGPT, Claude, Gemini, Llama, Mistral):",
        ],
        list: {
          items: [
            { b: "Formulaic openers.", t: "\"In today's fast-paced world,\" \"It's important to note that,\" \"In conclusion,\" \"As we navigate the complexities of....\" LLMs default to these openers heavily. Human writers occasionally use them; LLMs use them as primary opening sentences." },
            { b: "Hedging overuse.", t: "\"It could be argued that,\" \"some might suggest,\" \"there is a case for\" — used liberally to project neutrality. Humans hedge selectively; LLMs hedge habitually." },
            { b: "Three-item rhetoric.", t: "X / Y / Z triplets used so consistently that they become a signature. \"The benefits include speed, accuracy, and reliability.\" Three-item lists aren't AI-specific, but LLMs use them at much higher frequency than humans do." },
            { b: "Em-dash overuse.", t: "Long em-dashes (—) used to introduce qualifications or asides. Humans use them; LLMs use them at 3-5× the typical human rate." },
            { b: "Register-too-polished.", t: "Uniformly formal voice with no personality variation, no asides, no opinion. Reads like a textbook on every topic. Real human writing has stylistic variation across paragraphs; LLM output is suspiciously uniform." },
            { b: "Definition-textbook style.", t: "\"X is defined as...\" \"X refers to the practice of...\" — explicit definition framing where a human would just use the term. Common in LLM-generated educational content." },
            { b: "Transitional clichés.", t: "\"Moreover,\" \"furthermore,\" \"in addition\" as section-openers. Humans vary transitions; LLMs cycle through the same set." },
            { b: "Unprompted safety disclaimers.", t: "Mid-essay risk warnings, \"it's important to remember,\" cautionary asides where none was needed. Trained-in LLM behavior leaking through." },
          ],
        },
      },
      {
        h: "Counter-evidence — signals that lean human",
        p: [
          "The detector also surfaces signals that lean human, balancing the verdict:",
        ],
        list: {
          items: [
            { b: "Specific personal details.", t: "Names, places, dates, anecdotes that an LLM wouldn't have made up — and would have been less specific if it had." },
            { b: "Idiomatic expressions.", t: "Slang, region-specific phrases, non-textbook word choices that LLMs use sparingly." },
            { b: "Minor inconsistencies.", t: "Real human writing has small contradictions, opinion shifts mid-paragraph, parenthetical asides. LLM output is internally consistent to a suspicious degree." },
            { b: "Opinion shifts.", t: "Human writers update opinions across paragraphs; LLMs hold a uniform stance." },
            { b: "Casual asides.", t: "Side comments, brief tangents, signals that the writer is a specific person with a specific viewpoint." },
          ],
        },
      },
      {
        h: "Why no detector is courtroom-grade",
        p: [
          "Three fundamental limits that no AI-text detector can overcome:",
        ],
        list: {
          items: [
            { b: "False positives are unavoidable.", t: "Some humans naturally write in clean, structured prose. Career-prose writers (journalists, lawyers, academics) often produce text that matches AI patterns. Flagging them as AI-generated is wrong." },
            { b: "False negatives via editing.", t: "A careful human edit can mask any stylometric fingerprint. Run AI text through Improve Writing, vary sentence length, add specific examples, and the fingerprints largely disappear. The detector still works on raw AI output; it doesn't work on carefully-edited AI output." },
            { b: "Detector evolution lags model evolution.", t: "Detection patterns are documented from previous-generation models. As new models come out, their default stylistic patterns shift. The detector adapts but with a lag." },
          ],
        },
      },
      {
        h: "How to use the verdict responsibly",
        p: [
          "Three patterns for using the output:",
        ],
        list: {
          items: [
            { b: "As one input among several.", t: "Use the detector's verdict as a flag for further investigation, not as a conclusion. Pair with content-quality checks, source verification, and human reading." },
            { b: "For self-review, not accusation.", t: "If you wrote a draft yourself and want to verify it doesn't read like AI before submitting, the detector is great for that. If you're using it to accuse someone of AI use, the inherent error rate means false accusations are guaranteed at scale." },
            { b: "Combined with plagiarism checking.", t: "AI-text detection and plagiarism detection are different problems. Plagiarism (copying from existing text) is detected by tools like Turnitin / Copyleaks. AI generation is detected by stylometric tools. Both checks make sense in many contexts; neither replaces the other." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "AI Content Detector charges 10 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is a per-passage verdict with confidence, flagged patterns, counter-evidence, and optional humanize-edits suggestions.",
          "Important: This is a heuristic, not a definitive classifier. Use the output as one input, not as the verdict.",
        ],
      },
    ],
  },

  // ============================================================
  // partnership-deed-analyzer — Indian commercial-law AI
  // ============================================================
  "partnership-deed-analyzer": {
    title: "Partnership Deed Analyzer — Indian partnership and LLP audit, the clauses that decide who keeps what",
    intro:
      "Partnership deeds are the foundational document of every Indian partnership firm and limited liability partnership (LLP). Most are signed without much review — there's a template, there's a deadline, everyone signs and gets on with the business. The friction with that pattern is that partnership deeds determine profit-sharing ratios, capital contribution rights, decision-making thresholds, exit terms, and dispute resolution. When relationships sour (and at some point they always do), the deed is what's enforceable. Here is what the analyzer audits, the seven clauses that determine the outcome of every partnership dispute, and the difference between an Indian Partnership Act 1932 firm and an LLP under the LLP Act 2008.",
    sections: [
      {
        h: "What the analyzer audits",
        p: [
          "The tool reads the partnership deed and audits against a structured checklist: business name and address, partner details (name, address, share), capital contribution per partner, profit-sharing ratio, decision-making thresholds (majority for ordinary decisions, unanimity for fundamental decisions like dissolution or new partners), banking and signature authority, partner roles and responsibilities, exit and dissolution terms, dispute-resolution clauses, governing law and jurisdiction.",
          "Each finding is severity-rated. Missing fundamental clauses (e.g. no profit-sharing ratio specified) are critical. Unfavorable clauses (e.g. unilateral expulsion right vested in majority partner without procedural safeguards) are high-severity. Ambiguities (vague language that could be interpreted multiple ways) are flagged for clarification.",
        ],
      },
      {
        h: "Seven clauses that determine partnership outcomes",
        p: [
          "Where disputes get decided:",
        ],
        list: {
          items: [
            { b: "Profit-sharing ratio.", t: "Must be specified explicitly. Without it, Indian Partnership Act 1932 defaults to equal sharing — usually not what partners actually agreed to. The analyzer flags missing or ambiguous ratios as critical." },
            { b: "Capital contribution rights.", t: "Who contributed how much, when, and what happens when more capital is needed. Without clear capital-contribution terms, additional-capital calls become disputes." },
            { b: "Decision-making thresholds.", t: "What requires majority vote vs unanimity. Indian default is majority; specific clauses often raise certain decisions to unanimity (adding partners, dissolving, major asset sales). The analyzer surfaces every threshold." },
            { b: "Exit terms.", t: "What happens when a partner wants to leave or is asked to leave. Notice period, valuation method (book value vs market value), payout schedule, restrictions on the departing partner. The most-litigated set of clauses." },
            { b: "Dispute resolution.", t: "Litigation in which court vs arbitration vs mediation. Arbitration clauses save time and cost in disputes; the analyzer flags deeds without dispute-resolution language as critical because the default (full civil court litigation) is slow and expensive." },
            { b: "Banking and signature authority.", t: "Who can sign on behalf of the firm. Bank accounts, contracts, vendor payments. Without clear authority terms, operational decisions become disputes." },
            { b: "Roles and responsibilities.", t: "Working partners vs sleeping partners vs salaried partners. Without explicit role differentiation, contribution-vs-compensation disagreements compound." },
          ],
        },
      },
      {
        h: "Partnership Act 1932 firm vs LLP under LLP Act 2008",
        p: [
          "Two different legal structures, with significantly different implications:",
        ],
        list: {
          items: [
            { b: "Indian Partnership Act 1932 firm.", t: "Unlimited liability — partners are personally liable for firm debts. No separate legal entity (firm doesn't exist independently of partners). Easier to set up but riskier. Registration is optional but recommended for legal enforceability." },
            { b: "Limited Liability Partnership (LLP).", t: "Limited liability — partners liable only up to their capital contribution (in most cases). Separate legal entity with its own PAN, GST registration, and bank account. Mandatory registration with the Registrar of Companies. More compliance overhead (annual filings, audits over certain turnover thresholds) but dramatically lower personal-liability risk." },
          ],
        },
      },
      {
        h: "Common deed problems the analyzer catches",
        p: [
          "Five patterns that show up in real deeds:",
        ],
        list: {
          items: [
            { b: "Profit ratio assumed-equal but not stated.", t: "Partners agreed verbally on a 60-40 split but the deed says nothing. Default kicks in: equal split. Always flagged critical." },
            { b: "No exit valuation method.", t: "What's the firm worth when a partner exits? Book value? Market value? Discounted cash flow? Without specification, this becomes a dispute. Always flagged critical." },
            { b: "Unilateral expulsion clauses.", t: "\"The majority partner may expel any other partner at any time without cause.\" Legal but harsh; gives one partner significant leverage. Flag and consider negotiating procedural safeguards (cause requirement, notice period, valuation method)." },
            { b: "Vague dispute-resolution.", t: "\"Disputes shall be resolved amicably between partners.\" Sounds nice; useless if amicable resolution fails. Replace with specific arbitration or mediation clause." },
            { b: "Stamp duty inadequacy.", t: "Indian partnership deeds need state-specific stamp duty (varies by state, typically ₹500-2,000). Insufficient stamp duty makes the deed inadmissible in court. The analyzer can't verify the actual stamp duty paid but flags missing stamp-duty references for review." },
          ],
        },
      },
      {
        h: "When to use the analyzer vs go straight to a lawyer",
        p: [
          "Three signals each direction:",
        ],
        list: {
          items: [
            { b: "Analyzer is sufficient.", t: "Standard small-partnership deed for a routine business. Two-partner deed for a side venture. Family-business succession deed. Where the analyzer's audit catches the standard problems, that's often the complete review needed." },
            { b: "Talk to a lawyer.", t: "Multi-partner LLP with non-equal capital contributions. Partnerships involving IP licensing or transfer. Cross-border partnerships (one partner in India, another abroad). Joint ventures with complex profit-sharing or earn-out terms." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Partnership Deed Analyzer charges 15 credits per deed. The tool handles PDFs up to 25 MB. Processing runs on our servers; the deed is in memory only during analysis and is never persisted.",
          "Important: Not legal advice. The tool is an audit aid. For complex deeds or those with significant capital / IP / cross-border components, consult a commercial lawyer.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-tldr — short summary AI
  // ============================================================
  "pdf-tldr": {
    title: "PDF TL;DR — when 'just tell me what it says' is the right answer",
    intro:
      "Not every PDF deserves a detailed summary. Sometimes you just need a 2-4 sentence read of what's inside before deciding whether to invest the time to read it properly. The TL;DR is the smallest meaningful summary unit on the platform — tighter than Summarize, shorter than Key Points, designed for the triage decision rather than the comprehensive read. Here is what it produces, the four triage scenarios where it earns its 2-credit cost, and the difference between TL;DR and the other summary depths.",
    sections: [
      {
        h: "What TL;DR produces",
        p: [
          "Drop any text-based PDF. The tool extracts the page text, runs a single-paragraph summary prompt, and returns a 2-4 sentence answer to the question \"what is this document about?\" The output is deliberately tight. There are no headings, no bullets, no section breakdowns — just the dense executive-summary paragraph.",
          "The first sentence states the topic. The second sentence (and sometimes third and fourth) state the substantive content — what the document actually argues, finds, or proposes. The output reads like an abstract written by someone who finished the document, in roughly the same time it takes to make coffee.",
        ],
      },
      {
        h: "Four triage scenarios where TL;DR earns its place",
        p: [
          "Cases where 2-4 sentences is exactly the right shape of output:",
        ],
        list: {
          items: [
            { b: "Email-attachment triage.", t: "You received a PDF in an email and the email body doesn't explain what's inside. Run TL;DR to decide whether the document warrants opening properly, forwarding to someone else, filing for later, or ignoring." },
            { b: "Search-result preview.", t: "You found a relevant-looking PDF in research, but the title alone doesn't tell you whether the document actually addresses your question. TL;DR gives you the topical answer before you commit to reading." },
            { b: "Document-pile prioritization.", t: "Faced with a stack of PDFs to read, run TL;DR on each. The summaries tell you which to read first, which to delegate, and which to skip." },
            { b: "Pre-meeting prep.", t: "A meeting starts in 20 minutes and someone shared a 30-page document. TL;DR in 30 seconds tells you what you need to know to participate meaningfully — full read can happen after the meeting if warranted." },
          ],
        },
      },
      {
        h: "TL;DR vs the other summary depths",
        p: [
          "Four related tools, each for a different depth:",
        ],
        list: {
          items: [
            { b: "TL;DR (2 credits).", t: "2-4 sentence paragraph. Use for triage." },
            { b: "Key Points (3 credits).", t: "6-12 bullet points with page citations. Use when you want the substantive claims surfaced individually but don't need full prose." },
            { b: "Summarize / Standard (3 credits).", t: "TL;DR + Key Points + section breakdown in prose. Use when you actually want to understand the document without reading the whole thing." },
            { b: "Summarize / Detailed (3 credits).", t: "Section-by-section detailed summaries that read like an expanded outline. Use when you need to refer back to specific sections later." },
          ],
        },
      },
      {
        h: "Three patterns to know",
        p: [
          "Specific behaviors:",
        ],
        list: {
          items: [
            { b: "Length variance.", t: "Most TL;DRs are 3 sentences. Very short documents (1-page abstracts, brief news articles) come back as 2 sentences. Long documents (50+ pages) sometimes come back as 4 sentences to capture the structural complexity. The tool picks based on how much there actually is to say." },
            { b: "Quoted text preservation.", t: "If the source has a specific quote that's central to the argument, the TL;DR sometimes incorporates it as a direct quote with attribution. The exception to the \"no specifics\" rule is when the specifics ARE the topic." },
            { b: "Tone matching.", t: "The TL;DR matches the source's register — formal for legal/academic, conversational for blog posts. The summary doesn't shift the tone of the document." },
          ],
        },
      },
      {
        h: "When TL;DR isn't enough",
        p: [
          "Three signals you should use a deeper summary tool instead:",
        ],
        list: {
          items: [
            { b: "You'll need to refer back later.", t: "TL;DR is a one-time read. If you'll need the summary as a reference document, use Summarize / Standard so you have section structure to navigate." },
            { b: "You need to cite specific claims.", t: "TL;DR doesn't carry page citations. If your downstream use requires citing where claims came from in the source, use Key Points (which does cite pages)." },
            { b: "Document is too long for one paragraph to capture.", t: "A 200-page book doesn't fit in 4 sentences. The TL;DR will give the top-level topic but miss substantive content. Use Summarize / Detailed for long documents." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF TL;DR charges 2 credits per document — the cheapest AI summary tier. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during summarization and is never persisted. Output is a 2-4 sentence paragraph.",
          "Common pairings: TL;DR for triage → if relevant, escalate to Summarize / Key Points / Study Notes for deeper reading. Scan a folder of PDFs by running TL;DR on each, then pick the ones worth a deeper pass.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-key-points — bulleted-claims AI
  // ============================================================
  "pdf-key-points": {
    title: "PDF Key Points Extractor — 6-12 bullets with page citations and why citations matter",
    intro:
      "Sometimes you don't need a summary. You need the underlying claims, separated, each verifiable against the source. Key Points produces exactly that: a clean bulleted list of the document's substantive claims, each with a page citation so you can verify against the original. Here is how it differs from Summarize and TL;DR, why page citations are the load-bearing feature, and the three workflows where the bulleted-with-citations shape beats any prose summary.",
    sections: [
      {
        h: "What Key Points produces",
        p: [
          "Drop a PDF. The tool extracts the page text, runs a claim-extraction prompt, and returns a Markdown bullet list. Each bullet captures one substantive claim, finding, or argument from the document. Every bullet ends with a citation in [p. N] format pointing to the source page where the claim appears.",
          "There are no intro paragraphs, no closing summary, no \"in conclusion\" prose. Just the claims, individually, scannable in 30 seconds. Total bullet count is typically 6-12 — shorter for brief documents, longer for substantial ones. The tool decides based on how many distinct claims actually exist; there is no fixed cap.",
        ],
      },
      {
        h: "Why page citations are the load-bearing feature",
        p: [
          "The citation suffix on every bullet is what separates Key Points from a generic bullet-summary tool. Three concrete uses:",
        ],
        list: {
          items: [
            { b: "Verifying the AI's interpretation.", t: "Every bullet is checkable. If a claim seems surprising, jump to that page in the source and verify the AI extracted it correctly. The citation makes verification a one-click operation rather than a search." },
            { b: "Pulling source-attributed quotes for downstream use.", t: "When you cite the document in your own writing, you need to point to a specific page. Key Points already tells you which page each claim came from." },
            { b: "Catching hallucinated claims.", t: "If a bullet has no citation (or cites a page that doesn't contain the claim), that's a flag for a fabricated finding. The page-citation discipline forces the model to ground every claim — and when it can't, that's information too." },
          ],
        },
      },
      {
        h: "When bullets-with-citations beats prose",
        p: [
          "Three workflows where the bulleted shape is the right one:",
        ],
        list: {
          items: [
            { b: "Building a research summary.", t: "You're compiling findings from multiple documents into a literature review or report. Key Points from each document gives you a citation-ready bullet list to weave into your own synthesis. Prose summaries would require re-extracting individual claims; bullets are already in the right format." },
            { b: "Note-taking for self-study.", t: "Reading a textbook chapter or research paper for class. Bullet points are easier to revisit than prose summaries. Page citations let you jump back to the source for context when the bullet alone isn't enough." },
            { b: "Briefing someone else.", t: "Need to brief a colleague on what's in a document. Bullets are scannable; they can read the list in 30 seconds and decide what to ask about. Prose forces them to read sequentially." },
          ],
        },
      },
      {
        h: "How the tool decides what's a 'key point'",
        p: [
          "Three criteria the model uses:",
        ],
        list: {
          items: [
            { b: "Substantive claims, not topical mentions.", t: "\"The paper discusses inflation\" is not a key point. \"Inflation rose 3.2% in Q4 2024 [p. 14]\" is. Specifics over generalities." },
            { b: "Self-contained, not context-dependent.", t: "Each bullet should be readable on its own without requiring the reader to remember the previous bullet. Cross-referential bullets get collapsed or split." },
            { b: "Decision-relevant, not decoration.", t: "A bullet that captures a finding affecting the reader's understanding or decisions gets kept. Throat-clearing observations get filtered out." },
          ],
        },
      },
      {
        h: "When Key Points isn't the right shape",
        p: [
          "Three cases where a different summary tool fits better:",
        ],
        list: {
          items: [
            { b: "You want narrative flow.", t: "If you need the document's argument to flow as a story — context → claim → evidence → conclusion — bullets break the flow. Use Summarize / Standard for connected prose." },
            { b: "Short triage is enough.", t: "If you only need to decide whether to read the document at all, use TL;DR (2 credits vs Key Points' 3). The bullet structure is overkill for the triage decision." },
            { b: "Studying for an exam.", t: "Exam prep benefits from spaced-repetition flashcards more than from a bullet list. Use PDF to Flashcards for that workflow." },
          ],
        },
      },
      {
        h: "Reading the output critically",
        p: [
          "Three habits when working with Key Points output:",
        ],
        list: {
          items: [
            { b: "Verify high-stakes bullets at the source.", t: "If a bullet captures a claim you'll cite or rely on, click through to the cited page and confirm the bullet captures the source accurately. AI extraction is high-quality but not infallible." },
            { b: "Watch for missing citations.", t: "Bullets without [p. N] are flags — the model couldn't tie the claim to a single page. Sometimes that's legitimate (multi-page themes), sometimes it's hallucination. Worth verifying explicitly." },
            { b: "Use the bullet list as a navigation aid.", t: "Beyond reading the bullets, use them as a reverse index. \"I remember a claim about X — here's the bullet — page 47 is where to look in the source.\" Faster than scanning the PDF directly." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF Key Points charges 3 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during extraction and is never persisted. Output is a Markdown bullet list with per-bullet page citations.",
          "Common pairings: Key Points for the bullet-list view; Summarize / Standard for the prose view; PDF Chat for follow-up questions on specific bullets. The three together cover most reading workflows.",
        ],
      },
    ],
  },

  // ============================================================
  // paraphrase-pdf — wording rewrite AI
  // ============================================================
  "paraphrase-pdf": {
    title: "Paraphrase PDF — when same content in different words is what you actually need",
    intro:
      "Paraphrasing is one of the most-confused operations in AI writing tools. Unlike summarization (which cuts content) or rewriting (which changes register), paraphrasing keeps the same length, same facts, same conclusions — only the wording changes. The output is dramatically less useful for some tasks and exactly right for others. Here is what paraphrasing actually does, the three workflows where it shines, and the important difference between paraphrasing and content theft.",
    sections: [
      {
        h: "What paraphrasing does and doesn't change",
        p: [
          "Drop a PDF. The tool extracts the text, runs a paraphrase pass that preserves every claim, number, citation, and conclusion. The output has different wording but the same content and roughly the same length. Sentence structures change — passive voice may become active, complex sentences may split, vocabulary may shift to common synonyms. Paragraph organization is typically preserved.",
          "Three things stay strictly unchanged: factual claims (numbers, dates, specific statements of fact), proper nouns (names, places, brand mentions), and technical terms where a plainer synonym would lose precision. \"Amortization\" doesn't become \"paying off over time\" because the precision matters. \"Leveraging\" does become \"using\" because the precision was fake to begin with.",
        ],
      },
      {
        h: "Three workflows where paraphrasing shines",
        p: [
          "Cases where same-content-different-words is the exact shape of output you want:",
        ],
        list: {
          items: [
            { b: "Citing someone else's work in your own writing.", t: "Academic and journalistic writing benefits from paraphrasing source material in your own voice rather than block-quoting everything. Paraphrasing tells the source's story in your prose; the citation still credits the original. Critical caveat: paraphrasing does NOT remove the citation requirement. Paraphrasing without attribution is plagiarism." },
            { b: "Refreshing stale phrasing.", t: "A document you wrote that feels overworked — the same phrases repeating, the same sentence shapes. Paraphrasing breaks you out of the rut and surfaces alternative phrasings you can pick from." },
            { b: "Content syndication with permission.", t: "When you have permission to republish content but want it to read differently from the original source (for audience-specific tone, for SEO duplicate-content-avoidance, for region-specific voice). Paraphrasing produces a republishable variant." },
          ],
        },
      },
      {
        h: "The plagiarism distinction — important",
        p: [
          "Three patterns matter:",
        ],
        list: {
          items: [
            { b: "Paraphrasing without citation is still plagiarism.", t: "The \"in your own words\" rule for academic writing is about WORDING, not authorship. If the ideas came from someone else's work, you must cite them — whether you quoted directly, paraphrased, or summarized. Run-of-the-mill plagiarism detectors (Turnitin, Copyleaks) catch paraphrased copying via semantic similarity, not just exact-word matching." },
            { b: "Paraphrasing your own previously-published work.", t: "Republishing your own content elsewhere is sometimes called \"self-plagiarism.\" Whether it's a problem depends on the venue's rules. For academic contexts, it usually requires attribution to the original publication. For commercial content, it usually doesn't — but disclosing reuse to the publisher is common professional practice." },
            { b: "Paraphrasing to evade AI-detection.", t: "Running AI-generated text through a paraphraser does change the surface text — sometimes enough to fool AI-detection tools, sometimes not. We don't optimize the paraphraser for AI-detection evasion. The honest use case is improving prose, not gaming submission filters." },
          ],
        },
      },
      {
        h: "Paraphrase vs Improve Writing vs Rewrite",
        p: [
          "Three closely-related tools that produce different output shapes:",
        ],
        list: {
          items: [
            { b: "Paraphrase — same length, different wording.", t: "Length unchanged. Voice slightly different. Facts preserved verbatim. Use when wording variation is the goal." },
            { b: "Improve Writing — shorter length, same meaning.", t: "20-30% shorter typical. Cuts filler. Use when the source is too long and the goal is tighter." },
            { b: "Rewrite — different register or tone.", t: "Substantial voice change. Use when converting formal to casual, or academic to conversational, or any deliberate register shift." },
          ],
        },
      },
      {
        h: "When paraphrasing isn't the right tool",
        p: [
          "Three cases where you should reach for something else:",
        ],
        list: {
          items: [
            { b: "You want a summary, not a rewording.", t: "If the goal is to shorten the content, paraphrasing won't help — output is roughly the same length. Use Summarize, TL;DR, or Key Points." },
            { b: "You're rewriting fiction.", t: "Paraphrasing strips out distinctive voice — exactly what fiction relies on. The cleaner alternative version is rarely better than the original for creative work." },
            { b: "Technical documents where precision matters.", t: "Specifications, regulatory text, contracts, formal legal writing — these depend on exact wording. Paraphrasing introduces variant phrasings that may change meaning. Don't paraphrase contracts." },
          ],
        },
      },
      {
        h: "Will the output sound AI-generated?",
        p: [
          "Modern paraphrasing models produce natural prose. Output usually reads like clean human writing. Three patterns to be aware of:",
        ],
        list: {
          items: [
            { b: "Read the output carefully.", t: "If a sentence sounds AI-fluent (too smooth, too perfect, generic phrasing), replace it with your own. The paraphraser is a starting point, not a final pass." },
            { b: "Watch for inserted hedging.", t: "AI sometimes adds hedging language (\"it could be argued that,\" \"some might suggest\") not present in the source. Strip these if the source was assertive." },
            { b: "Don't paraphrase repeatedly.", t: "Paraphrasing already-paraphrased text degrades quality with each pass. Pick one paraphrase result and edit from there; don't run it through again." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Paraphrase PDF charges 5 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during paraphrasing and is never persisted. Output is the paraphrased markdown / text plus the original alongside for comparison.",
          "Common pairings: Paraphrase → Improve Writing if the paraphrased version is now too long. Paraphrase + AI Content Detector to check if the output still reads as AI. Paraphrase → Generate PDF to produce a polished final PDF from the paraphrased content.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-flashcards — spaced-repetition AI
  // ============================================================
  "pdf-to-flashcards": {
    title: "PDF to Flashcards — spaced-repetition study material from any document",
    intro:
      "Flashcards remain the most-evidenced study technique for factual recall. Spaced repetition (active recall against the front of a card, with delayed review of cards you got wrong) outperforms re-reading by significant margins across every controlled study. The friction has always been creating the cards — manually pulling questions and answers from a textbook chapter takes longer than studying them. The flashcard generator collapses that step: drop the source PDF, get 10-30 Anki-compatible cards in 30 seconds. Here is what kinds of cards it generates, the difficulty mix, and why exam-targeted variants beat the generic generator for specific test contexts.",
    sections: [
      {
        h: "What the generator produces",
        p: [
          "Drop a PDF. The tool extracts the text, identifies the key concepts, definitions, formulas, and facts that benefit from spaced repetition, and generates 10-30 question/answer pairs. Each card has three fields: question, answer, and difficulty level (easy / medium / hard). Total card count scales with document length — short articles produce 10-15 cards, full textbook chapters produce 25-30.",
          "Card types are mixed deliberately. Roughly 40% factual recall (\"What is X?\", \"What year did Y happen?\"), 40% conceptual application (\"How does X differ from Y?\", \"Why does Z occur?\"), 20% deep analysis (\"What would happen if X changed?\", \"Compare A and B in the context of C\"). The mix mirrors the typical breakdown of exam questions across educational levels.",
        ],
      },
      {
        h: "Why difficulty levels matter",
        p: [
          "The three-tier difficulty labeling enables structured study:",
        ],
        list: {
          items: [
            { b: "Early-stage learning: focus on easy.", t: "When you first learn a topic, the recall cards (easy) are the right starting point. Build the factual base; the harder cards make sense once the base is solid." },
            { b: "Pre-exam review: hit hard.", t: "A week before a test, the easy cards are likely solid. Spending review time on the hard cards (analysis, comparison, application) is where the marginal value is." },
            { b: "Spaced-repetition tuning.", t: "Anki and similar apps adjust review intervals based on difficulty. Telling the app a card is hard means more frequent review; easy means longer intervals. The generator pre-classifies, saving manual tagging." },
          ],
        },
      },
      {
        h: "Generic vs exam-targeted flashcards",
        p: [
          "Two paths for flashcard generation, depending on context:",
        ],
        list: {
          items: [
            { b: "Generic PDF-to-Flashcards (this tool).", t: "Use for general study of any document. Textbooks, lecture notes, articles. Output is broadly applicable — not tuned to any specific exam." },
            { b: "Exam-specific paper analyzers (separate tools).", t: "For Indian competitive exams (TNPSC, UPSC, JEE, NEET, GATE), dedicated analyzers tune the question style, difficulty distribution, and topic emphasis to match the actual exam pattern. For exam-prep specifically, use the dedicated tool — output is materially better-targeted." },
          ],
        },
      },
      {
        h: "Anki-compatible export",
        p: [
          "Output is JSON with fields mapping to Anki's CSV-import format. Three import paths:",
        ],
        list: {
          items: [
            { b: "Direct Python script.", t: "A 5-line Python snippet converts the JSON to Anki's CSV. Pip install anki-connect, parse the JSON, push to your Anki desk." },
            { b: "Via online converter.", t: "Public Anki-CSV-converter tools accept the standard JSON format. Faster than writing custom code; works for one-time conversions." },
            { b: "Manual import.", t: "Copy the JSON's question/answer pairs into Anki's manual-card-add interface. Slowest but works without any tooling." },
          ],
        },
      },
      {
        h: "Three patterns for getting good cards",
        p: [
          "Habits that improve output quality:",
        ],
        list: {
          items: [
            { b: "Pick the right source granularity.", t: "A 200-page textbook produces 30 cards — useful but high-level. Chapter-by-chapter generation produces 30 cards per chapter — much denser coverage of the same content. Run the tool on chapter-sized chunks for substantial subjects." },
            { b: "Combine with study notes.", t: "Run PDF to Study Notes alongside flashcards. Notes for understanding the material; flashcards for retaining it. Both pull from the same source PDF with different output shapes." },
            { b: "Review and edit before importing.", t: "Generated cards are good but not perfect. Read each before pushing to Anki. Edit the few that don't match your studying style — flashcards you use for years should match your voice." },
          ],
        },
      },
      {
        h: "Languages and content types",
        p: [
          "Three limitations worth knowing:",
        ],
        list: {
          items: [
            { b: "English works best.", t: "The model's reliability is highest in English. Hindi / Tamil / other Indic-language content is best run through AI Translate first, then flashcards generated from the English version. Native Indic-language flashcard generation is on the roadmap." },
            { b: "Factual content works better than narrative.", t: "Textbooks, lectures, technical documents — strong flashcards. Novels and essays don't produce useful flashcards because the content is interpretive rather than factual." },
            { b: "Math and formula content surfaces as text.", t: "Mathematical formulas in flashcards appear as plain text, not rendered equations. For math-heavy study, supplement with a math-rendering layer in Anki (MathJax extension)." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Flashcards charges 10 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted.",
          "Common pairings: Flashcards + Study Notes for complete-coverage study material. Flashcards + the related exam-specific paper analyzers for competitive-exam prep. Flashcards generated chapter-by-chapter for substantial subject coverage.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-action-items — meeting-doc AI
  // ============================================================
  "extract-action-items": {
    title: "Extract Action Items from PDF — owner, due date, priority, the columns every tracker needs",
    intro:
      "Meeting notes, project briefs, audit reports, status updates — almost every business document contains action items mixed in with discussion, context, and decision narrative. Manually pulling them out for a project tracker is the most-skipped step in many teams' workflow, which is why action items routinely fall through the cracks. The action-item extractor produces a structured table — owner, due date, priority, source page — ready to paste into Jira, Linear, Asana, or any project tracker. Here is how it tells real actions from discussion, the five document types where it earns its place, and the three patterns that catch users on the first run.",
    sections: [
      {
        h: "How the extractor tells actions from discussion",
        p: [
          "The challenge is distinguishing \"we should do X\" (real commitment) from \"X might be a problem\" (discussion, not action). The extractor uses both heuristic and LLM classification. Heuristic signals: action verbs (\"will,\" \"must,\" \"to do,\" \"plan to\"), explicit assignments (\"Alice to send the report,\" \"Bob will follow up with the vendor\"), date phrases (\"by Friday,\" \"next sprint,\" \"end of Q2\"), priority signals (\"P0,\" \"urgent,\" \"blocker,\" \"nice to have\").",
          "Each candidate gets scored for action-ness. Explicit assignments with verbs and date phrases score highest and ship to the output. Implicit collectives (\"we should consider X\") get flagged with lower confidence — included but with a note. Discussion-only items (\"X might be a problem\" without follow-up commitment) get filtered out. The result is a table heavy on actually-actionable items rather than a wall of every sentence that mentions a verb.",
        ],
      },
      {
        h: "The four columns and how they're populated",
        p: [
          "Each row has four metadata columns plus the action text:",
        ],
        list: {
          items: [
            { b: "Owner.", t: "Person assigned. Explicit assignments (\"Alice to...,\" \"Bob: send...\") map directly. Implicit owners (\"we'll handle...\" with prior context establishing the team) inferred where possible. Unassigned actions show \"unassigned\" so they can be triaged downstream rather than dropped." },
            { b: "Due date.", t: "When it's due. Explicit dates (\"by 2025-05-15\") parsed directly. Relative dates (\"by Friday,\" \"end of next month\") resolved against the document's date context. Indefinite (\"soon,\" \"when possible\") becomes \"TBD\" — the action is still extracted; the date is for downstream triage." },
            { b: "Priority.", t: "Inferred from language strength. Explicit (\"P0,\" \"blocker,\" \"urgent\") preserved. Implicit (action language that signals importance — \"critical,\" \"essential,\" \"must\") classified to high/medium/low. Review the column before pasting; AI inference is noisier on priority than on the explicit fields." },
            { b: "Source page.", t: "Page in the original PDF where the action was found. Critical for verification — click through to see the action in its original context. Like Key Points, the citation discipline forces grounding." },
          ],
        },
      },
      {
        h: "Five document types where it earns its place",
        p: [
          "Specific document categories where action extraction is the load-bearing operation:",
        ],
        list: {
          items: [
            { b: "Meeting notes / transcripts.", t: "The canonical use case. Every meeting produces actions; most teams don't extract them systematically. The extractor turns the transcript into a triage-ready list." },
            { b: "Project briefs and specs.", t: "Specifications contain implicit and explicit actions for the team building the project. Surfacing them as a structured list ensures nothing is missed when sprint planning." },
            { b: "Audit reports.", t: "Internal-audit reports contain findings + recommendations. The recommendations are actions for the audited team. Structured extraction makes them trackable instead of buried in narrative." },
            { b: "Status update threads.", t: "Long email threads or Slack exports about a project usually accumulate dozens of actions across the conversation. The extractor surfaces them all in one table." },
            { b: "Post-mortems.", t: "Incident post-mortems contain follow-up actions to prevent recurrence. These are critical and often get lost. Structured extraction gates the follow-through." },
          ],
        },
      },
      {
        h: "Three patterns that catch users",
        p: [
          "Friction points worth knowing:",
        ],
        list: {
          items: [
            { b: "Discussion-as-action confusion.", t: "\"We talked about doing X\" sometimes extracts as an action (\"do X\") when really X was discussed and rejected. Review the action column before importing — discussion items occasionally slip through." },
            { b: "Implicit owners.", t: "\"The team needs to review\" leaves \"who on the team?\" ambiguous. Extracted as \"unassigned\" or with the most-likely individual from context. Always sanity-check the owner column before pasting." },
            { b: "Relative-date drift.", t: "\"By next Friday\" resolved relative to the document's date. If the document is undated and processed weeks later, the resolved date may be wrong. The extractor includes the original phrase alongside the resolved date so you can verify." },
          ],
        },
      },
      {
        h: "Importing into project trackers",
        p: [
          "Three import paths, depending on your tracker:",
        ],
        list: {
          items: [
            { b: "Jira / Linear / Asana via CSV.", t: "Each tracker has a CSV-import flow that accepts standard columns. Export the extractor's output as CSV, map columns to your tracker's fields, import. Most teams' standard workflow." },
            { b: "Direct paste as Markdown.", t: "If your tracker accepts Markdown tables (Notion, Linear, GitHub), copy the Markdown output directly. Each row imports as a single task with the metadata fields parsed automatically." },
            { b: "Manual triage.", t: "For small action lists, paste into a Slack channel or email and triage manually. Faster than the import workflow when there are only 3-5 actions." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Extract Action Items charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during extraction and is never persisted.",
          "Common pairings: Extract Action Items + Key Points for both the action list and the substantive content summary. Extract Action Items + AI Summarize for the meeting / status-update workflow where both the summary and the actions go to the team.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-emails-from-pdf — regex-based contact extraction
  // ============================================================
  "extract-emails-from-pdf": {
    title: "Extract emails, phones, and URLs from a PDF — regex extraction in your browser, no AI credits needed",
    intro:
      "Contact information scattered across a PDF — email addresses, phone numbers, URLs — is one of the most common things people want to pull out programmatically. A vendor catalog, a conference attendee list, an academic paper's author block, an annual report's investor-relations section. The regex-based extractor surfaces all of them in seconds without AI cost. Here is what patterns it matches, the three workflows where regex extraction is exactly the right shape of tool, and the two cases where you should reach for the AI variant instead.",
    sections: [
      {
        h: "How the extractor finds contacts",
        p: [
          "The tool reads the PDF's text content (no AI involved), then runs regex patterns against the extracted text. Three patterns produce three columns of output:",
        ],
        list: {
          items: [
            { b: "Email addresses.", t: "Standard RFC-5322 pattern (with reasonable simplifications for common-case email recognition). Matches alice@example.com, jane.doe+tag@subdomain.example.co.uk, etc. Doesn't match obfuscated emails like \"jane (at) example (dot) com\" — those need the paid AI variant." },
            { b: "Phone numbers.", t: "Practical 10-15 digit patterns covering common international formats: +1-555-123-4567 (US), +91 98765 43210 (India), (020) 7946 0958 (UK), and variants. Heuristic filtering avoids false positives on long number sequences (page numbers, ISBN fragments, encoded IDs)." },
            { b: "URLs.", t: "http:// and https:// URLs. Matches whether the URL is hyperlinked in the PDF or appears as plain text. Doesn't match \"example.com\" without a protocol — those would need a heuristic that produces too many false positives on common phrases." },
          ],
        },
      },
      {
        h: "Three workflows where regex extraction is exactly right",
        p: [
          "Cases where you want the free, fast, in-browser tool:",
        ],
        list: {
          items: [
            { b: "Vendor / customer list extraction.", t: "Catalogs, vendor lists, customer rosters. The contact info is structured and explicit; regex finds it reliably." },
            { b: "Academic paper author block.", t: "Research papers list authors with email addresses for correspondence. Regex extracts every address in one pass." },
            { b: "Annual reports / investor relations.", t: "Annual reports list investor-relations contacts, board email addresses, regional office phone numbers. All structured, all regex-friendly." },
            { b: "Conference attendee lists.", t: "Many conferences publish attendee directories as PDFs. Extracting contact info for follow-up is a regex job." },
            { b: "Government employee directories.", t: "Many ministries and PSUs publish staff directories. Phone numbers and email patterns are standardized within India-government contexts, regex-detectable." },
          ],
        },
      },
      {
        h: "Two cases where AI extraction beats regex",
        p: [
          "Cases where you should reach for AI Extract Contacts (paid) instead:",
        ],
        list: {
          items: [
            { b: "Obfuscated contacts.", t: "Email addresses written as \"jane (at) example (dot) com\" or \"jane[at]example[dot]com\" to evade spam-scrapers. Phone numbers written as \"call nine-eight-seven-six-five.\" Names written with custom separators. AI handles these; regex misses them entirely." },
            { b: "Contacts embedded as images.", t: "Some PDFs deliberately show contact info as images rather than text to prevent automated harvesting. Regex sees no text; nothing to extract. AI variant runs OCR + visual extraction to surface the contacts despite the obfuscation." },
          ],
        },
      },
      {
        h: "Output formats and their use cases",
        p: [
          "Three output formats:",
        ],
        list: {
          items: [
            { b: "Per-page table view (in-tool).", t: "Each contact shown with its source page. Useful for browsing and verifying the extraction before downloading." },
            { b: "CSV download.", t: "Type / value / source page columns. Drop into a spreadsheet for further processing, deduplication, or import into a CRM." },
            { b: "vCard download (for emails + phones).", t: "Standard vCard format for direct import into Apple Contacts, Google Contacts, Outlook. One-click address-book population from a directory PDF." },
          ],
        },
      },
      {
        h: "Privacy and ethics",
        p: [
          "Three considerations:",
        ],
        list: {
          items: [
            { b: "Client-side extraction.", t: "Everything runs in your browser. The PDF never uploads. Important for documents that contain personal information about identifiable people — none of those bytes leave your machine." },
            { b: "Cold-outreach legality.", t: "Just because you can extract someone's email doesn't mean cold-outreach is legal. Many jurisdictions (GDPR in EU, DPDP Act in India, CAN-SPAM in US) require legitimate basis for unsolicited contact. Extract for personal use, customer-relationship management, or legitimate-interest contexts; don't bulk-extract for spam." },
            { b: "Source acknowledgment.", t: "If you extracted contact info from someone's published work (academic paper, annual report) and you reach out, mentioning the source is good professional practice. \"I noticed your contact in the X annual report and wanted to reach out about Y.\" Sets the right expectation." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, regex extraction handles PDFs up to 100 MB with no contact-count cap. Parsing runs in your browser; nothing is uploaded. Output is the extracted-contacts table plus CSV + vCard downloads.",
          "Common pairings: AI · OCR first if the PDF is scanned (regex needs text to operate on). AI Extract Contacts when regex doesn't catch obfuscated patterns. Remove Metadata before sharing the extracted list to avoid leaking the source PDF's metadata into a recipient's hands.",
        ],
      },
    ],
  },

  // ============================================================
  // analyze-pdf-tone — content-style audit AI
  // ============================================================
  "analyze-pdf-tone": {
    title: "Analyse PDF Tone & Style — measuring voice, audience, and register without changing them",
    intro:
      "Most writing tools that talk about \"tone\" either prescribe one (\"write more formally\") or change it (\"rewrite this in a casual voice\"). The tone analyzer does neither — it measures. Voice classification, audience inference, sentence-length distribution, jargon density, formality score, emphasis style. Knowing these numbers about a document is useful in its own right, separate from any rewriting decision. Here is what the analyzer measures, why separating measurement from rewriting produces cleaner output, and the four workflows where the report is the goal rather than a step toward editing.",
    sections: [
      {
        h: "Why separate measurement from rewriting",
        p: [
          "Combined \"analyze and rewrite\" tools tend to produce confused output. The model is being asked to do two different things — measure existing voice, then transform it — and the transformation often loses the diagnostic precision of the measurement. By separating the two operations, the analyzer can describe what's actually there without bias from an editing intent, and rewriting (when you decide it's needed) happens as a separate, controllable step.",
          "The two-tool workflow gives you finer control: analyze first to understand what the document is doing. Decide whether to rewrite or accept. If rewriting, specify the target register precisely (informed by what you saw the source actually does). The output is more deliberate than a combined \"make this better\" prompt.",
        ],
      },
      {
        h: "Six categories the analyzer reports",
        p: [
          "Each report includes:",
        ],
        list: {
          items: [
            { b: "Voice classification.", t: "Authoritative / collaborative / didactic / persuasive / academic / conversational / etc. A single label characterizing the document's overall stance toward the reader." },
            { b: "Inferred audience.", t: "Who is the document written for? Executives / engineers / general public / specialists in a specific field. Inferred from vocabulary level, assumed background knowledge, and structural choices." },
            { b: "Sentence-length distribution.", t: "Average sentence length, longest, shortest, variance. Tight prose has consistent moderate length; AI-generated text often has suspiciously uniform length; long-form journalism varies widely on purpose." },
            { b: "Jargon density.", t: "What fraction of words are domain-specific terms. High density signals expert audience; low density signals general audience. Neither is bad — but the audience and the density should match." },
            { b: "Formality score.", t: "How formal the voice is, 0-100 scale. Contractions, passive voice, paragraph structure, vocabulary choices all contribute. Useful for matching tone across multiple documents." },
            { b: "Emphasis style.", t: "How the document signals importance — bold, italics, bullet lists, callouts, capitalization. The distribution tells you whether the document is heavy on visual emphasis or relies on prose structure." },
          ],
        },
      },
      {
        h: "Four workflows where the report is the goal",
        p: [
          "Cases where measurement is itself the output:",
        ],
        list: {
          items: [
            { b: "Brand-voice audits.", t: "An organization publishing many documents wants to know if they consistently match a target voice. Run the analyzer on a sample; observe whether voice and formality scores cluster as expected. Outliers warrant review." },
            { b: "Audience-fit verification.", t: "A document written for executives shouldn't have high jargon density. The analyzer's audience-inference catches mismatches before publication." },
            { b: "Tone-shift detection.", t: "Multi-author documents sometimes have register drift — Section 1-3 are formal-authoritative; Section 4 shifts casual because a different author wrote it. The analyzer surfaces register shifts so they can be smoothed before publication." },
            { b: "Pre-translation diagnostics.", t: "Before translating a document, knowing its register helps the translator preserve voice. The analyzer's output gives the translator a target to match in the destination language." },
          ],
        },
      },
      {
        h: "How to interpret the numbers",
        p: [
          "Three patterns for reading the report:",
        ],
        list: {
          items: [
            { b: "Compare against a reference document.", t: "A single document's tone numbers are interpretable; multiple documents' numbers are comparable. Run the analyzer on a known-good reference and use its scores as the target." },
            { b: "Look for unexpected variance.", t: "Internal consistency is usually a goal. A document with high sentence-length variance might be intentionally varied (good narrative writing) or accidentally inconsistent (different authors, different revision passes). The number flags the pattern; you decide what it means." },
            { b: "Treat the audience inference as a hypothesis.", t: "The analyzer's audience inference is based on signals in the text. It can be wrong, especially for cross-audience documents. Use it as a starting point, not a verdict." },
          ],
        },
      },
      {
        h: "What the analyzer doesn't do",
        p: [
          "Three limits worth knowing:",
        ],
        list: {
          items: [
            { b: "Doesn't catch every brand-voice attribute.", t: "Brand voice has many dimensions (specific vocabulary, prohibited phrases, formatting conventions) that go beyond what the analyzer measures. For brand-voice enforcement, supplement with a brand-style-guide check." },
            { b: "Doesn't compare against any external corpus.", t: "Scores are relative to general English-language norms. To compare against an industry standard or a competitor's writing, run the analyzer on that reference and compare." },
            { b: "Doesn't detect subtle rhetoric.", t: "Logical fallacies, implicit bias, what's NOT said — none of these surface in tone analysis. Pair with critical-reading review for content audit." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Analyse PDF Tone & Style charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted.",
          "Common pairings: Tone Analyzer + AI Rewrite when you want to actually shift register based on the analyzer's findings. Tone Analyzer + Inclusive Language Audit for a full pre-publication voice + content audit.",
        ],
      },
    ],
  },

  // ============================================================
  // inclusive-language-audit — bias-detection AI
  // ============================================================
  "inclusive-language-audit": {
    title: "Inclusive Language Audit — what lexical bias-scanning catches and what it can't",
    intro:
      "Language carries cultural assumptions. Gendered defaults, outdated technical terminology, ability-based metaphors, region-coded stereotypes — these appear in writing more often than most authors realize. The inclusive language audit scans a PDF for the patterns that have well-documented inclusive alternatives, surfaces each with a suggested fix, and lets you decide what to apply. Here is what the auditor catches, what it explicitly doesn't catch, the four document types where the audit adds the most value, and the responsible way to use the output.",
    sections: [
      {
        h: "How lexical scanning works",
        p: [
          "The tool reads the PDF's text content, then runs a multi-category pattern detection: gendered defaults (\"he\" used as generic, \"chairman\" for a gender-neutral role), outdated technical terminology (master/slave naming, blacklist/whitelist, sanity-check), ability-based metaphors (\"crazy,\" \"lame,\" \"blind to\"), region-coded language, age-related bias (\"young and energetic\"), and culture-specific stereotyping.",
          "Each flagged passage is surfaced with: the exact quote, the page it's on, the category of bias, severity (high / medium / low), and a suggested replacement. The output is a structured fix-list table, not a rewrite. You review each item and decide whether to apply, edit, or skip.",
        ],
      },
      {
        h: "Six categories the auditor catches",
        p: [
          "The patterns where lexical scanning is reliable:",
        ],
        list: {
          items: [
            { b: "Gendered defaults.", t: "\"He\" or \"she\" used as generic; role nouns with gender baked in (chairman → chair, fireman → firefighter, mailman → mail carrier)." },
            { b: "Outdated technical terminology.", t: "Master/slave (databases, deployments) → primary/replica; blacklist/whitelist → blocklist/allowlist; sanity-check → smoke-test or quick-check; dummy variable → placeholder variable." },
            { b: "Ability-based metaphors.", t: "\"Crazy\" / \"insane\" / \"lame\" / \"blind to\" used metaphorically. Replacements vary by context — \"crazy\" used about an idea becomes \"unconventional\" or \"surprising,\" used about a person is usually inappropriate." },
            { b: "Age-related bias.", t: "\"Young and energetic,\" \"digital natives,\" \"old-school\" — used in job descriptions, performance reviews, marketing copy. Catches both pro-young and pro-old framing." },
            { b: "Region-coded stereotyping.", t: "Specific to the document's apparent context. For Indian-English content, caste-coded language; regional stereotypes (\"south Indian Brahmin,\" \"Punjabi loud\"). For US-English, similar regional / racial stereotypes." },
            { b: "Marriage-status assumptions.", t: "\"Family-friendly\" with implicit nuclear-family assumption; \"spouse and children\" as default; \"Mrs. / Miss\" distinction where Ms. is more inclusive." },
          ],
        },
      },
      {
        h: "What the auditor explicitly doesn't catch",
        p: [
          "Three categories of bias the lexical scan cannot detect:",
        ],
        list: {
          items: [
            { b: "Rhetorical framing.", t: "What's centered as the default, what's framed as the exception, what's mentioned in passing vs emphasized. These are structural choices, not lexical ones, and lexical scanning misses them. Human review of framing is essential for high-stakes documents." },
            { b: "What's excluded.", t: "Bias by omission — perspectives, examples, populations not represented. The auditor sees what's there, not what's missing. For comprehensive bias review, supplement with diversity-of-source audit." },
            { b: "Subtle implication.", t: "Implications that emerge from word choice + context — \"surprisingly articulate\" as a compliment for a specific group carries implications the words alone don't surface. Lexical scan flags the obvious; subtle implications require human review." },
          ],
        },
      },
      {
        h: "Four document types where the audit adds most value",
        p: [
          "Specific contexts where lexical bias matters most:",
        ],
        list: {
          items: [
            { b: "Job descriptions.", t: "JDs influence who applies. Gendered defaults, age-coded language, and exclusionary phrasing materially affect applicant diversity. Auditing before posting is a standard recruiting-team practice." },
            { b: "Marketing copy.", t: "Public-facing marketing shapes brand perception. Bias-coded language is a real reputational risk; the audit is a pre-publication safety check." },
            { b: "Course materials and training docs.", t: "Educational content gets reused; embedded bias propagates. Auditing course materials is part of curriculum design at many institutions." },
            { b: "Internal HR documents.", t: "Performance reviews, promotion criteria, policies. Bias in these documents affects employment decisions and creates legal exposure. The audit surfaces obvious lexical patterns that should be revised." },
          ],
        },
      },
      {
        h: "How to use the output responsibly",
        p: [
          "Three habits for working with the audit output:",
        ],
        list: {
          items: [
            { b: "Don't accept every suggestion automatically.", t: "Some flags are false positives. Historical quote that uses \"chairman\" because that's what it said. Technical context where the deprecated term is unavoidable. Treat the output as items to consider, not rules to apply." },
            { b: "Document your decisions.", t: "When you DO apply a suggestion, record it. When you don't, note why. The audit-trail makes the editing rationale clear for future reviewers and reduces re-litigation." },
            { b: "Pair with human review.", t: "Lexical scanning catches the obvious. The non-obvious cases (framing, omission, implication) need a human reviewer who knows the context. The audit is a starting point, not a complete review." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Inclusive Language Audit charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during scanning and is never persisted. Output is a structured fix-list table.",
          "Common pairings: Inclusive Language Audit + AI Tone Analyzer for full pre-publication voice + content review. Inclusive Language Audit + Improve Writing as a combined revision pass. For Indian-language content, run AI Translate first; the audit currently scans English text only.",
        ],
      },
    ],
  },

  // ============================================================
  // condense-pdf — aggressive-shorten AI
  // ============================================================
  "condense-pdf": {
    title: "Condense PDF — cutting 40-60% while preserving every fact",
    intro:
      "Sometimes a document needs to be shorter without becoming a summary. Same structure, same conclusions, same flow — just tighter. Condense PDF occupies that specific niche: aggressive rewriting that cuts 40-60% of length while preserving every factual anchor. Different from Summarize (which restructures), different from Improve Writing (which trims more lightly). Here is what gets cut, what stays untouched, and the three workflows where condense is exactly the right shape of transformation.",
    sections: [
      {
        h: "How condensing differs from summarizing",
        p: [
          "Summarize changes the document's shape — what was a 20-page report becomes a 2-page digest with new section structure, an executive summary, key bullets, etc. The output is a different kind of document from the input. Useful for triage and reference but not when you need to deliver the original document in a shorter form.",
          "Condense preserves the shape. A 20-page report stays a report — same section structure, same arguments in the same order, same conclusions — but at 10 pages instead of 20. The output IS the same document, just tighter. The reader's experience is reading the original; they just don't have to read as much of it.",
        ],
      },
      {
        h: "What gets cut",
        p: [
          "Five categories the condenser consistently trims:",
        ],
        list: {
          items: [
            { b: "Repetition.", t: "Documents often state the same point multiple times in slightly different ways — once in the intro, once in the body, once in the conclusion. The condenser collapses these to a single strong statement, usually in the body where it's most useful." },
            { b: "Throat-clearing.", t: "Transitional sentences that don't add information (\"As we will see in the next section…,\" \"Building on the previous point…\"). Cut where they're not load-bearing for comprehension." },
            { b: "Verbose phrasing.", t: "\"At this point in time\" → \"now.\" \"In order to\" → \"to.\" \"Despite the fact that\" → \"although.\" Word-level efficiencies that compound across a long document." },
            { b: "Redundant qualifiers.", t: "\"Absolutely critical\" → \"critical.\" \"Completely unique\" → \"unique.\" The qualifiers don't carry meaning; the noun alone is sufficient." },
            { b: "Long sentences without proportionate content.", t: "Some long sentences carry one simple claim wrapped in clauses. The condenser unpacks them into shorter, content-equivalent sentences." },
          ],
        },
      },
      {
        h: "What stays untouched",
        p: [
          "Five categories the condenser deliberately preserves:",
        ],
        list: {
          items: [
            { b: "Numbers and percentages.", t: "Every numeric value preserved verbatim. ₹1,23,45,678.92 stays exactly that. Aggressive shortening creates risk of accidentally changing numbers; we explicitly forbid that." },
            { b: "Dates.", t: "Date formats preserved as written. Year preserved exactly. \"May 15, 2024\" doesn't become \"mid-2024\" or \"last year.\"" },
            { b: "Names and proper nouns.", t: "People, organizations, places, products, brand names — all preserved exactly. No abbreviations introduced, no name simplification." },
            { b: "Direct quotes.", t: "Anything in quotes stays exactly as quoted. The condenser cuts surrounding prose but doesn't touch the quoted material." },
            { b: "Citations and references.", t: "Footnotes, in-text citations, bibliography entries preserved. The references are anchors for verification; cutting them would destroy the document's traceability." },
          ],
        },
      },
      {
        h: "Three workflows where condense is right",
        p: [
          "Cases where 40-60% shorter, same-shape output earns its place:",
        ],
        list: {
          items: [
            { b: "Long internal documents going to a busy stakeholder.", t: "A 30-page strategy document the CEO needs to read. Condense to 12-15 pages without changing the document's structure. The CEO reads the actual document, faster." },
            { b: "Regulatory filings that need to fit a page limit.", t: "Some regulatory submissions have hard page caps. If your draft is 80 pages and the cap is 60, condense cuts 25% across the document without summarizing or restructuring. Compliance with page limits without changing what the document says." },
            { b: "Proposal revisions for tighter delivery.", t: "A proposal draft that's been padded through revision cycles. Condense restores the original tightness while preserving every commitment, scope item, and dollar figure." },
          ],
        },
      },
      {
        h: "The three-tool compression spectrum",
        p: [
          "Three AI tools at different compression levels:",
        ],
        list: {
          items: [
            { b: "Improve Writing (5 credits): 20-30% shorter.", t: "Light polish. Cuts filler and redundant qualifiers. Use when the document is already pretty tight." },
            { b: "Condense (3 credits): 40-60% shorter.", t: "Aggressive shortening within the same document shape. Use when the document is too long but the structure should stay." },
            { b: "Summarize (3 credits): ~90% shorter.", t: "Restructured digest. Use when you want a different kind of document — a summary, not a shorter version." },
          ],
        },
      },
      {
        h: "Verification habits",
        p: [
          "Three practices for using condense responsibly:",
        ],
        list: {
          items: [
            { b: "Use the page citations.", t: "Every section in the output has a citation to the source. Spot-check that the condensed version preserves the source's meaning, especially for critical claims." },
            { b: "Verify numbers explicitly.", t: "Even though numbers are explicitly preserved, scan the output for any value that surprised you and verify against the source. AI is reliable but not infallible." },
            { b: "Run on a section first.", t: "For high-stakes documents, condense one section and compare carefully before running on the whole thing. The pattern of what gets cut becomes obvious; you can then trust or override on the rest." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Condense PDF charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during processing and is never persisted. Output is markdown with page citations.",
          "Common pairings: Condense + Improve Writing (run improve on the output for further polish). Condense + AI Sign for tighter signed deliverables. Expand-then-Condense for the \"more thorough than my outline, tighter than the raw expansion\" workflow.",
        ],
      },
    ],
  },

  // ============================================================
  // expand-pdf — paired AI elaboration tool
  // ============================================================
  "expand-pdf": {
    title: "Expand PDF — turning bullets into full prose without fabricating claims",
    intro:
      "Drafts often start as bullet points: terse, structural, fast to write. Eventually the bullets need to become full prose for the audience. The expand tool elaborates each point into flowing prose, grounded in the source content. The hard constraint is that it doesn't invent claims — what isn't in the source doesn't appear in the expansion. Here is how grounding works, the three workflows where expansion accelerates real writing, and why expand-then-condense is a useful round-trip pattern.",
    sections: [
      {
        h: "How expansion preserves grounding",
        p: [
          "The tool reads the source PDF, parses its bullet structure and surrounding content, then elaborates each point with prose connectives, contextual explanation, and natural flow. The expansion stays close to the source — every claim in the output traces to a claim in the input. No new facts get introduced; the model is constrained against fabrication explicitly in the prompt.",
          "Each section of output is anchored to the page it came from in the source via inline citations. Verification is fast: if a sentence surprises you, click through to the source page and check whether the corresponding bullet actually supports it. The discipline of source-grounding plus visible citations makes expansion trustworthy in a way that uncontrolled AI generation often isn't.",
        ],
      },
      {
        h: "What kinds of source benefit most",
        p: [
          "Three input patterns produce dramatically different expansion ratios:",
        ],
        list: {
          items: [
            { b: "Terse bullet outlines: 2-3× expansion.", t: "One-line bullets become full paragraphs with context. The expansion ratio is highest here because the input carries the most compressed content per word." },
            { b: "Mixed outline + brief notes: 1.5-2× expansion.", t: "Drafts with mixed bullet + brief-prose sections expand at roughly this rate. The prose sections grow modestly; the bullet sections grow significantly." },
            { b: "Already-prose drafts: 1.1-1.3× expansion.", t: "Documents that are already in full sentences don't have much to elaborate. The expansion adds connective tissue and clarifications but not dramatic length. Use Improve Writing on these instead." },
          ],
        },
      },
      {
        h: "Three workflows where expansion accelerates writing",
        p: [
          "Specific cases where the bullets-to-prose move is the load-bearing operation:",
        ],
        list: {
          items: [
            { b: "Speaker notes → publishable transcript.", t: "Lecture or talk notes are often bullets. Converting them to a publishable transcript for slideshare, blog publication, or podcast notes is the canonical use." },
            { b: "Strategy outline → board memo.", t: "A strategy draft as bullets needs to be elaborated for a formal board memo. The expand tool produces the prose draft, which you then edit for voice and add the specifics that bullets implied but didn't state." },
            { b: "Sprint planning notes → engineering spec.", t: "Engineering specs often start as planning bullets. Expansion produces a prose-format spec that downstream engineers can read end-to-end. The structural integrity (which bullet was which decision) is preserved via the citations." },
          ],
        },
      },
      {
        h: "The expand-then-condense round-trip",
        p: [
          "A useful pattern that combines both tools:",
        ],
        list: {
          items: [
            { b: "Start with bullets.", t: "Capture the structure of what you want to say as a terse outline." },
            { b: "Expand to full prose.", t: "Run Expand to produce the elaborated draft. This typically over-expands — produces more prose than necessary." },
            { b: "Condense to taste.", t: "Run Condense on the expanded output to land at your target length. The result is more thorough than the original bullets but tighter than the raw expansion — typically the right length for the audience." },
          ],
        },
        // Why this is useful:
      },
      {
        h: "Why the round-trip beats single-pass writing",
        p: [
          "Three reasons the two-step approach can produce better drafts than writing direct prose:",
        ],
        list: {
          items: [
            { b: "Forces explicit structure.", t: "The bullet outline forces you to decide what the document's logical structure is. Writing direct prose risks losing the structure to flow concerns." },
            { b: "Decouples structure from voice.", t: "The bullet outline captures structure; the expansion adds voice. Each pass has a single concern, which is easier than tackling both at once." },
            { b: "Reusable input.", t: "The bullet outline is itself a useful artifact. You can expand it again for a different audience, or use it directly as a presentation outline. The bullets are reusable; the expanded prose is single-use." },
          ],
        },
      },
      {
        h: "When to skip expansion",
        p: [
          "Three cases:",
        ],
        list: {
          items: [
            { b: "The source is already prose.", t: "Already-prose drafts grow only modestly through expansion. Use Improve Writing or Paraphrase instead — they're better-tuned for prose-input documents." },
            { b: "The bullets are intentionally terse.", t: "Some documents are supposed to be bulleted (one-pagers, executive briefs, action lists). Expanding them defeats the purpose. Pick deliverable format first; expand only when you want full prose." },
            { b: "Creative writing.", t: "Fiction, poetry, narrative essay — these depend on author-voice and stylistic choices that AI expansion can't match. Use AI for non-fiction; write fiction yourself." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Expand PDF charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during expansion and is never persisted. Output is markdown with page citations.",
          "Common pairings: Expand → Condense for the round-trip workflow. Expand → Improve Writing if the expanded output needs final polish. Expand → Generate PDF if the markdown output should be rendered to a polished PDF.",
        ],
      },
    ],
  },

  // ============================================================
  // generate-faq-from-pdf — content-republishing AI
  // ============================================================
  "generate-faq-from-pdf": {
    title: "Generate FAQ from PDF — predicting what readers will ask and answering from the source",
    intro:
      "FAQs are the most useful piece of content a documentation team can produce, and the most often skipped. Writing them requires anticipating questions the document doesn't explicitly answer but readers naturally have. The FAQ generator handles both parts: it predicts the 6-10 questions a reader would realistically ask after reading the source, then answers each from the source content with page citations. Here is what it produces, the three workflows where pre-built FAQs save support load, and how it handles questions the source doesn't actually answer.",
    sections: [
      {
        h: "How the generator picks questions",
        p: [
          "The tool reads the source PDF, identifies the topic, and runs a prediction pass: \"if a reader of average background reads this document, what would they most likely want to know that isn't immediately obvious?\" The output is 6-10 question/answer pairs. Each answer is grounded in the source content with a page citation where the relevant material appears.",
          "Questions are filtered for usefulness — \"What is the document about?\" is too generic and gets cut; \"How long does the process described take?\" is the kind of question a reader actually has. The generator favors questions that surface practical implications, edge cases, or counterintuitive points over questions whose answers are already prominent in the source.",
        ],
      },
      {
        h: "How it handles questions the source doesn't answer",
        p: [
          "Gaps are surfaced explicitly. If the FAQ generator predicts a question the reader would ask but the source PDF doesn't address it, that question appears in a separate \"Not covered\" section rather than being answered with fabricated content. Three things this enables:",
        ],
        list: {
          items: [
            { b: "Honest scope.", t: "The reader knows what the document does and doesn't address. No hallucinated answers giving false confidence." },
            { b: "Content gap identification.", t: "The \"Not covered\" section is a roadmap for what the document SHOULD address. Documentation teams use this to plan their next revision." },
            { b: "Trust calibration.", t: "Answers that ARE covered carry more weight because the tool demonstrably refuses to make things up. The visible \"Not covered\" section is evidence of grounding discipline." },
          ],
        },
      },
      {
        h: "Three workflows where FAQ generation saves support load",
        p: [
          "Specific cases where pre-built FAQs pay off:",
        ],
        list: {
          items: [
            { b: "Product documentation help-center.", t: "Whenever you publish a feature spec, run FAQ generation on it. Drop the FAQ next to the spec in your help center. Reduces \"please explain X\" support tickets noticeably." },
            { b: "Onboarding material.", t: "New hires read the onboarding doc but always have follow-up questions. Pre-answering the predictable ones cuts onboarding-question load and surfaces the gaps in the onboarding doc itself." },
            { b: "Sales / partnership review.", t: "Before a prospect or partner reads a heavy document (security questionnaire response, data-processing-agreement, product spec), generate the FAQ and send both. The FAQ answers the obvious questions; the source is there for follow-up." },
          ],
        },
      },
      {
        h: "FAQ vs Chat with PDF",
        p: [
          "Two adjacent AI tools, used differently:",
        ],
        list: {
          items: [
            { b: "FAQ — push, not pull.", t: "Generated once, used many times. The question list is the AI's prediction; the answers are pre-built. Flat 5-credit cost. Useful when one author serves many readers." },
            { b: "Chat — pull, not push.", t: "Each reader asks their specific question; the AI answers per-question. Cost scales with question count. Useful when each reader has different questions." },
          ],
        },
      },
      {
        h: "Editing the output before publishing",
        p: [
          "Three habits for polishing generated FAQs:",
        ],
        list: {
          items: [
            { b: "Verify each answer against the source.", t: "Page citations make this fast. Trust grounded answers; spot-check anything that surprises." },
            { b: "Re-order by importance.", t: "The generator's question order is roughly the order it predicted them in. Re-order by frequency-of-being-asked or by importance before publishing." },
            { b: "Use the \"Not covered\" section as a documentation TODO.", t: "If 3 questions show up in \"Not covered,\" they should probably be addressed in the next revision of the source document. The generator tells you what to add." },
          ],
        },
      },
      {
        h: "When FAQ isn't the right shape",
        p: [
          "Three cases where a different tool fits better:",
        ],
        list: {
          items: [
            { b: "You want a structured summary.", t: "FAQs surface specific questions and answers. If you want the document's substantive content summarized, use Summarize or Key Points instead." },
            { b: "Reader needs are highly varied.", t: "If readers' questions differ dramatically (different audiences with different concerns), a single FAQ is hard to write well. Provide PDF Chat instead so each reader can ask their specific questions." },
            { b: "Source is short or focused.", t: "A 2-page brief usually doesn't need an FAQ — readers can read it directly. FAQ generation pays off on longer, denser documents." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Generate FAQ from PDF charges 5 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is Markdown with per-answer page citations.",
          "Common pairings: FAQ + Key Points to publish both alongside a source PDF. FAQ + Chat for an interactive help-center pattern. Re-run FAQ after a document revision to surface what new questions the revised content might raise.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-blog-post — content-republishing AI
  // ============================================================
  "pdf-to-blog-post": {
    title: "PDF to Blog Post — restructuring research into publishable web content without editorializing",
    intro:
      "Whitepapers, research reports, case studies, and policy briefs are dense documents written for serious readers. Web audiences are different — they skim first, decide whether to read second, and abandon if the first scroll doesn't hook them. PDF to Blog Post restructures the source into web-shape: hook, scannable sections, conclusion. The constraint is fidelity — the blog post says what the source says, in different structure but with no invented claims. Here is what gets restructured, what stays preserved, and how this differs from rewriting the source in a different register.",
    sections: [
      {
        h: "What restructuring does to the source",
        p: [
          "Drop a PDF — research report, whitepaper, policy brief, case study. The generator restructures the content into a blog-post shape: a hook (opening that gives the reader a reason to keep reading), 3-5 H2 sections (each section a distinct topic with prose paragraphs and bullets where appropriate), and a closing that summarizes the key takeaways. Total length lands at 800-1500 words depending on the source's substance.",
          "The original document's structural choices don't transfer. A whitepaper with executive summary / methodology / findings / conclusions / appendices becomes a blog post with hook / 3 substantive sections / closing — different shape, same content. Web audience patterns differ from research-document patterns; the restructure respects that.",
        ],
      },
      {
        h: "What stays preserved",
        p: [
          "Fidelity constraints — what the generator deliberately doesn't change:",
        ],
        list: {
          items: [
            { b: "Numbers exact.", t: "Every numeric value, percentage, date, statistic preserved verbatim. The blog post says what the source says about quantities." },
            { b: "Quoted text untouched.", t: "Direct quotes from the source carry forward as quotes. Attributed correctly." },
            { b: "Claims grounded.", t: "Substantive claims in the blog post trace to claims in the source. No editorializing, no opinion injection that the source doesn't carry." },
            { b: "Citations and attributions.", t: "If the source cites authorities, the blog post preserves the citations. Web format usually means in-line attribution rather than footnotes, but the citation content is preserved." },
          ],
        },
      },
      {
        h: "Three workflows where the restructure earns its place",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Marketing-team publishing of research output.", t: "Research team produces a whitepaper. Marketing team needs a blog post version for the company website. PDF to Blog Post is the bridge — preserves research integrity while shipping web-shaped content." },
            { b: "Industry-publication contributions.", t: "You wrote a long report; you want to publish a derivative version in a trade publication. PDF to Blog Post produces the publication-shaped version while preserving the source's claims." },
            { b: "Long-form newsletter content.", t: "A subscription newsletter that pulls from long-form research reports. PDF to Blog Post produces the readable summary for the newsletter; the source PDF is the canonical artifact for subscribers who want depth." },
          ],
        },
      },
      {
        h: "Blog Post vs Newsletter vs Rewrite",
        p: [
          "Three adjacent AI tools producing different output shapes:",
        ],
        list: {
          items: [
            { b: "Blog Post — web-shaped article from research source.", t: "Hook + 3-5 sections + close. 800-1500 words. Preserves source fidelity. Use when republishing research for a web audience." },
            { b: "Newsletter — multi-section email-shaped digest.", t: "Multiple short sections, often with cross-links between them. Optimized for email-client rendering. Use when the destination is an email newsletter rather than a web blog." },
            { b: "Rewrite — register/voice shift.", t: "Same content, different tone. Use when the source is already the right shape but the voice needs adjustment (formal → casual, academic → conversational)." },
          ],
        },
      },
      {
        h: "Three patterns for great web-shaped output",
        p: [
          "Habits that improve the blog post:",
        ],
        list: {
          items: [
            { b: "Provide an audience hint in the prompt.", t: "The same research can be blog-shaped for different audiences. \"For technical decision-makers\" vs \"for end-users\" produces meaningfully different output. Specify the target audience for best results." },
            { b: "Edit the hook.", t: "The generator's first paragraph is usually solid but generic. Replace it with audience-specific framing that connects the source's content to your readers' situation. The remaining body usually needs little editing." },
            { b: "Add SEO tuning post-generation.", t: "The structure is SEO-good (clear H2s, scannable paragraphs) but keyword targeting isn't automatic. Run a keyword pass after generation to add target terms naturally where the source content supports them." },
          ],
        },
      },
      {
        h: "What the tool deliberately doesn't do",
        p: [
          "Three explicit non-features:",
        ],
        list: {
          items: [
            { b: "Doesn't editorialize.", t: "If you want opinion content from the source, use Rewrite with an opinion-piece register. The Blog Post generator stays faithful to the source's claims." },
            { b: "Doesn't add images or visuals.", t: "Output is text-only Markdown. Add images / charts / diagrams in your CMS after publishing." },
            { b: "Doesn't optimize for distribution.", t: "Title is a working title; meta-description, OpenGraph tags, social-share cards are publish-time concerns. Add them in your CMS." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Blog Post charges 10 credits per document. Higher than other content-AI tools because restructuring + rewriting is more compute-intensive. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is Markdown that drops cleanly into WordPress, Ghost, Medium, Substack, Notion, or any Markdown-aware CMS.",
          "Common pairings: Blog Post → Improve Writing if the output needs final tightening. Blog Post → AI Detector to verify the output doesn't read as AI before publishing. Blog Post + Summarize: publish the blog post + offer the original PDF as a deep-dive link.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-a-validator — archive-format compliance
  // ============================================================
  "pdf-a-validator": {
    title: "PDF/A validator — ISO 19005 compliance and what each level actually requires",
    intro:
      "PDF/A is the ISO 19005 standard for long-term archival preservation of PDFs. Every government archive, every regulatory filing repository, every corporate document-retention system that takes its long-term obligations seriously requires PDF/A. The standard sounds simple — \"PDF that will still render correctly in 50 years\" — but the actual requirements are precise and frequently misunderstood. PDFs that look fine and even pass Acrobat's self-check often fail strict PDF/A validation. Here is what each PDF/A level requires, the seven failures the validator catches most often, and the difference between this validator and the conversion tool you'd need to actually fix the issues.",
    sections: [
      {
        h: "Three PDF/A levels and what each requires",
        p: [
          "PDF/A has three increasing-restriction tiers — pick the strictest your downstream system accepts. Each level has a baseline (b) and accessibility (a) variant; most preservation contexts target the (b) baseline:",
        ],
        list: {
          items: [
            { b: "PDF/A-1b (most restrictive).", t: "Based on PDF 1.4. No transparency, no JBIG2 compression, no layered images, no embedded files, no JavaScript. Every font must be embedded. Output intent (ICC color profile) must be declared. /Producer and /CreationDate metadata required. The narrowest feature set; widest compatibility. Use for the strictest archive requirements." },
            { b: "PDF/A-2b.", t: "Based on PDF 1.7. Adds back transparency, JPEG2000 compression, layered objects. Still forbids JavaScript, encryption, external references. Default for most modern PDF/A archive workflows." },
            { b: "PDF/A-3b.", t: "Same as 2b plus embedded files allowed. Designed for cases where the archive should preserve the source document (DOCX, XLSX) alongside the rendered PDF. Common for regulatory submissions where the source is the canonical artifact." },
          ],
        },
      },
      {
        h: "Seven failures the validator catches most often",
        p: [
          "From real-world validations across thousands of PDFs:",
        ],
        list: {
          items: [
            { b: "Unembedded fonts.", t: "The most common failure. PDF/A requires every font referenced in the document to be embedded. Standard 14 fonts (Helvetica, Times, Courier) are explicitly allowed unembedded in standard PDF but FORBIDDEN to be unembedded in PDF/A. The validator flags every unembedded font with its location." },
            { b: "Missing output intent.", t: "PDF/A requires an /OutputIntent dictionary specifying the target color space and ICC profile. Documents generated by Word's \"Save as PDF\" routinely lack this. The fix usually requires Acrobat Pro's pre-flight tools or InDesign-export-with-PDF/A option." },
            { b: "Encryption present.", t: "Any password / encryption disqualifies a PDF from PDF/A. Unlock the PDF first (free Unlock tool for owner-password; user-password requires the password) before validating." },
            { b: "JavaScript present.", t: "Any JS handler disqualifies. Strip via Strip JavaScript tool. The JS Detector surfaces every handler before you decide what to do." },
            { b: "External references.", t: "PDF/A is self-contained by design — no hyperlinks to external URLs, no file:// references, no embedded URLs that resolve at view time. The validator flags each external reference; the fix is removal or substitution with internal goto-page references." },
            { b: "Transparency (PDF/A-1b only).", t: "Layered transparency, soft masks, blend modes all forbidden in -1b. Fix: flatten transparency upstream in the source tool, or upgrade target to -2b which allows transparency." },
            { b: "Metadata mismatch.", t: "/Info dictionary metadata and XMP stream metadata should agree. PDF/A requires consistency between the two. Acrobat sometimes leaves them out of sync after edits; the validator catches the divergence." },
          ],
        },
      },
      {
        h: "Why Acrobat-saved PDF/A still fails",
        p: [
          "A frequent surprise: a PDF exported with Acrobat's \"Save as PDF/A\" option still fails our validator. Three common reasons:",
        ],
        list: {
          items: [
            { b: "/Producer metadata leak.", t: "Acrobat's export sometimes leaves \"Adobe Acrobat 23.0\" in /Producer where strict PDF/A wants a specific format. Easy fix; common failure." },
            { b: "Font-subset non-conformance.", t: "Acrobat embeds fonts using a slightly non-standard subset-encoding that other PDF/A validators accept but stricter ones flag. Workaround: re-export from the source, not Acrobat's roundtrip." },
            { b: "Acrobat's PDF/A claim is self-attestation.", t: "Acrobat's export marks the PDF as PDF/A in its /OutputIntent without rigorously checking compliance. Our validator (and other strict validators like Verapdf) check the actual byte-level structure, catching mismatches Acrobat ignores." },
          ],
        },
      },
      {
        h: "Validator vs Converter — what each does",
        p: [
          "Two adjacent tools for the PDF/A workflow:",
        ],
        list: {
          items: [
            { b: "Validator (this tool).", t: "Read-only check. Surfaces every non-compliance. Doesn't modify the PDF. Use to know what fails." },
            { b: "Converter (paid roadmap item).", t: "Modifies the PDF to fix the failures: embeds fonts, removes encryption, strips JavaScript, sets output intent. Use to actually produce a PDF/A-compliant file. Adobe Acrobat Pro can also do this conversion." },
          ],
        },
      },
      {
        h: "Three workflows where the validator pays off",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Regulatory submission pre-flight.", t: "Most national patent offices, securities regulators, and IRS-equivalents accept only PDF/A. The validator catches non-compliance before submission, preventing rejected filings." },
            { b: "Archive ingestion gate.", t: "Library systems, corporate document-retention systems, government archives — all gate ingestion on PDF/A compliance. Pre-validating before submission saves rework." },
            { b: "Long-term self-archive.", t: "Even without external requirements, validating that your important documents are PDF/A means they'll render correctly decades from now regardless of how PDF tooling evolves." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF/A validator handles PDFs up to 100 MB. Validation runs in your browser; nothing is uploaded. Output is a structured ISO 19005 report with pass/fail per requirement and specific failure details (which font on which page, which annotation has encryption, etc.).",
          "Common pairings: Validator → Embed Fonts / Strip Links / Remove Metadata / Strip JavaScript to fix each specific failure. Validator → AI Tag Generator if you need PDF/A-a (accessibility variant). Validator → PDF/A Converter (paid) for the full one-shot conversion path.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-x-validator — print-production compliance
  // ============================================================
  "pdf-x-validator": {
    title: "PDF/X validator — print-production compliance and why your print shop cares",
    intro:
      "PDF/X is the ISO 15930 standard for print production. Print shops standardize on it because it eliminates the most common print-failure scenarios: missing fonts substitute, RGB colors land wrong on CMYK presses, transparency renders inconsistently across RIPs, trim and bleed boxes get guessed at instead of declared. Pre-validating your PDF before sending to the print shop catches these issues at your desk instead of as a phone call from the shop the morning of press time. Here is what PDF/X requires, the five failures that derail more print jobs than missing files, and which level (X-1a vs X-3 vs X-4) your specific print shop probably accepts.",
    sections: [
      {
        h: "What PDF/X actually guarantees",
        p: [
          "PDF/X guarantees that two RIPs (raster image processors — the software in a print shop that converts PDFs to plate-ready output) will produce identical output. The standard achieves this by requiring everything that COULD vary across RIPs to be made explicit and deterministic: every font embedded so substitution can't happen, every color in CMYK (or with ICC profile for the rare X-3/X-4 RGB allowance) so RIP-specific color management can't shift values, trim and bleed boxes declared so the RIP doesn't have to guess what's intended to print vs what's marker.",
          "Documents that pass PDF/X validation can be sent to any compliant print shop with confidence that the output matches your design intent. Documents that fail can still print — but the print shop has to make decisions about substitutions and conversions that may not match what you wanted.",
        ],
      },
      {
        h: "Three PDF/X levels — which to target",
        p: [
          "Pick based on what your print shop accepts:",
        ],
        list: {
          items: [
            { b: "PDF/X-1a (most restrictive).", t: "CMYK only — no RGB images allowed at all. No transparency. No layers. Most restrictive feature set. Legacy print shops with older RIPs require this. If your shop is uncertain, this is the safest bet." },
            { b: "PDF/X-3.", t: "Allows ICC-tagged RGB and Lab color spaces in addition to CMYK. Still no transparency. Most modern commercial print shops accept this." },
            { b: "PDF/X-4.", t: "Allows transparency (with specific rules about how it's rendered). The most permissive PDF/X variant. Acceptable to virtually every print shop running modern RIPs (2010+)." },
          ],
        },
      },
      {
        h: "Five failures that derail more print jobs than missing files",
        p: [
          "From actual print-shop reject stats:",
        ],
        list: {
          items: [
            { b: "Missing TrimBox or BleedBox.", t: "Print PDFs must declare /TrimBox (where the page should be trimmed) and /BleedBox (where content extends past the trim for bleed printing). Without these, the shop guesses. Bleed area is the most common production error from missing boxes." },
            { b: "RGB images in PDF/X-1a context.", t: "Even one RGB image in a PDF/X-1a-targeted document fails validation. The shop converts to CMYK at print time, with potentially significant color shift from what you saw on screen. Pre-convert all images to CMYK upstream in InDesign / Photoshop." },
            { b: "Missing output intent.", t: "Print shops need to know which paper + ink combination you targeted. SWOP (US web-offset), FOGRA (European offset), GRACoL (commercial sheet-fed) — all common output intents. The validator catches missing or wrong intent." },
            { b: "Unembedded fonts.", t: "Same failure mode as PDF/A. Print shops substitute, fonts don't match, typography breaks. Always embed." },
            { b: "Spot colors not declared.", t: "Pantone or other spot colors must be declared as such, not approximated in CMYK. Approximated spots print as 4-color separations and lose their distinctive look (especially gold, silver, fluorescents)." },
          ],
        },
      },
      {
        h: "Which level your print shop wants — how to know",
        p: [
          "Three ways to find out:",
        ],
        list: {
          items: [
            { b: "Ask explicitly.", t: "The print shop's pre-flight document should specify. If it doesn't, email them. \"What PDF/X level do you require?\" is a 30-second question." },
            { b: "Look at the print shop's RIP age.", t: "Print shops with newer equipment (5 years old or newer) accept X-4. Print shops with older equipment may require X-1a." },
            { b: "Default to X-1a if uncertain.", t: "X-1a is the strictest, so any shop accepting X-3 or X-4 also accepts X-1a. Targeting the strictest level is always safe; targeting the loosest may not be." },
          ],
        },
      },
      {
        h: "PDF/X output and what a print shop actually does with it",
        p: [
          "Three steps in the print shop's typical workflow:",
        ],
        list: {
          items: [
            { b: "Pre-flight check.", t: "The shop runs the PDF through Enfocus PitStop or similar pre-flight software to confirm PDF/X compliance. Your pre-validation aligns with theirs so failures show up before production starts." },
            { b: "Imposition.", t: "The PDF gets laid out on the press sheets — multiple pages per sheet for booklet binding, signature work for books, etc. PDF/X's clear TrimBox + BleedBox declarations make imposition automatic." },
            { b: "Plate generation.", t: "The RIP processes the PDF/X file into 4 (or more) press plates for CMYK printing plus any spot colors. The deterministic-rendering guarantee of PDF/X means the plate-generation step is reliable." },
          ],
        },
      },
      {
        h: "When you don't need PDF/X",
        p: [
          "Three cases where standard PDF is fine:",
        ],
        list: {
          items: [
            { b: "Digital-only distribution.", t: "Documents going to screens (web, email, internal sharing) don't benefit from PDF/X. The restrictions (CMYK-only in X-1a) actually hurt screen rendering." },
            { b: "Office laser/inkjet printing.", t: "Home and office printers do their own internal color management; PDF/X over-specifies for these output paths." },
            { b: "Low-stakes print jobs.", t: "Posters, internal handouts, one-off prints — the consistency guarantee isn't worth the workflow overhead. Standard PDF is fine." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, PDF/X validator handles PDFs up to 100 MB. Print-bound PDFs are often large (50-200 MB depending on image resolution); the tool scales accordingly. Validation runs in your browser; nothing is uploaded — important for confidential publication content under embargo.",
          "Common pairings: Validator → InDesign / Illustrator re-export for the upstream fixes. Validator → Acrobat Pro pre-flight fixups when re-export isn't an option. Validator + Font Inspector for explicit font-embedding audit before submission.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-annotations-viewer — review-workflow inspector
  // ============================================================
  "pdf-annotations-viewer": {
    title: "PDF annotations viewer — every comment, highlight, and sticky note as data",
    intro:
      "PDF annotations carry years of review work — highlights from a contract review, comments from a paper-editing pass, sticky notes from a board-pack circulation, drawn arrows from a design review. Most PDF readers show these one-at-a-time as you scroll. The annotations viewer surfaces them all at once as structured data: type, page, author, date, content, location. The difference matters for audit, completeness verification, and converting a review pass into actionable items. Here is what the viewer shows, the four review workflows where the structured view earns its place, and the difference between this read-only viewer and the editing tools.",
    sections: [
      {
        h: "What the viewer surfaces",
        p: [
          "The tool reads every page's /Annots array and surfaces every annotation as a structured row with six columns: type (highlight / comment / sticky note / drawn shape / signature / stamp / etc.), page number, author, creation date, content (the comment text or annotation label), color (for highlights), and location coordinates. The structured view turns a scroll-through-the-PDF experience into a scan-the-table experience.",
          "Every annotation type defined by the PDF spec is surfaced — highlights, underlines, strikeouts, sticky notes (Text annotations), free text, ink strokes (handwriting / Free Draw), polygon shapes, line annotations, signature stamps, custom stamps. Older types from earlier Acrobat versions (like Movie annotations from the 90s) surface with their original type for completeness, even though most readers no longer support them.",
        ],
      },
      {
        h: "Four review workflows where structured view earns its place",
        p: [
          "Cases where seeing all annotations at once beats scrolling through the PDF:",
        ],
        list: {
          items: [
            { b: "Review completeness verification.", t: "A document went through review by 5 people. Did each reviewer actually comment? The viewer's author column filtered by name surfaces each reviewer's contributions explicitly. Reviewers who left no annotations are flagged by absence." },
            { b: "Action-item extraction from review.", t: "Reviewers leave comments that translate into action items for the document author. The viewer's table format makes the comments scannable; combined with Extract Action Items, the comments become a TODO list ready for a tracker." },
            { b: "Audit trail for compliance reviews.", t: "Internal-audit documents, regulatory submissions, and similar high-stakes reviews need an audit trail of who annotated what and when. The viewer's structured output is the audit trail — exportable as CSV for regulatory records." },
            { b: "Multi-author review coordination.", t: "When multiple reviewers comment on the same document, conflicts and overlaps need triage. The viewer's per-page breakdown shows where reviewers agree (multiple highlights of the same passage) and where they diverge (conflicting comments on the same section)." },
          ],
        },
      },
      {
        h: "Filter patterns",
        p: [
          "Three filter dimensions and their use cases:",
        ],
        list: {
          items: [
            { b: "Filter by author.", t: "See each reviewer's contribution in isolation. Useful when crediting reviewers or when investigating a specific reviewer's concerns." },
            { b: "Filter by type.", t: "Just highlights (what passages were marked important), just comments (what discussion happened), just stamps (what approvals were granted). Each annotation type carries different review-workflow meaning." },
            { b: "Filter by date range.", t: "Annotations added during the first review pass vs the second. Track how the document evolved through reviews." },
          ],
        },
      },
      {
        h: "Viewer vs editing tools",
        p: [
          "The viewer is read-only. Three related tools for modifying annotations:",
        ],
        list: {
          items: [
            { b: "Free Draw / Highlight / Add Text Box — create annotations.", t: "Add new annotations to a PDF. Each is a separate tool for the specific annotation type." },
            { b: "Flatten PDF — convert annotations to page content.", t: "Bake annotations into the page so they can no longer be edited or removed. Used when finalizing a reviewed document for distribution." },
            { b: "Free Redact — remove annotations selectively.", t: "Some annotations need to come out (PII in a comment, an obsolete review) without flattening the rest. Free Redact handles this. For wholesale annotation removal, Flatten followed by re-circulation is simpler." },
          ],
        },
      },
      {
        h: "Why this surfaces things PDF readers miss",
        p: [
          "Three categories of annotations many readers don't display by default:",
        ],
        list: {
          items: [
            { b: "Author metadata on annotations.", t: "Acrobat's panel shows it but Preview and most browser readers don't. Crucial for multi-reviewer documents." },
            { b: "Creation date.", t: "When was this comment added? Useful for tracking when concerns emerged during review." },
            { b: "Color of highlights.", t: "Reviewers sometimes use color-coding (yellow = important, red = concern, green = approved). PDF readers show the visual color; the viewer surfaces it as data you can filter by." },
          ],
        },
      },
      {
        h: "Edge cases",
        p: [
          "Two patterns where the viewer's output may surprise you:",
        ],
        list: {
          items: [
            { b: "Annotations stored as page content (not real annotations).",
              t: "Some tools (including our Free Draw) draw strokes into the page content stream rather than as /Annot objects. These are visually identical to annotations but the viewer doesn't list them (they're not annotations structurally). To enumerate them, you'd need a content-stream walker, which is beyond the viewer's scope." },
            { b: "Author field missing.",
              t: "Older PDFs (pre-2005) often have annotations with no /T (author) field. The viewer shows \"unknown\" for these. Don't assume a missing author means the annotation is anonymous; it might just be an old format." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, annotations viewer handles PDFs up to 100 MB with no annotation-count cap. Parsing runs in your browser; nothing is uploaded. Output is the structured-annotation table plus CSV / JSON export.",
          "Common pairings: Annotations Viewer → Extract Action Items to turn reviewer comments into a TODO list. Annotations Viewer → Flatten when finalizing a reviewed document. Annotations Viewer → Free Redact when specific annotations need to be removed before distribution.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-links-inspector — link audit
  // ============================================================
  "pdf-links-inspector": {
    title: "PDF links inspector — auditing hyperlinks before sharing, archiving, or migrating",
    intro:
      "Most PDFs contain hyperlinks the author never explicitly thought about. Word's auto-link converts URLs to clickable links at export; InDesign carries forward links from the source content; even browser print-to-PDF preserves the page's hyperlinks. By the time you share a PDF, it may contain dozens of links — some intentional, some accidental, some pointing to URLs that have since broken or changed hands. The link inspector surfaces every link explicitly so you can audit before distributing. Here is what link types exist in PDF, the five workflows where auditing matters, and the difference between linked and link-styled text.",
    sections: [
      {
        h: "Five PDF link types — what each means",
        p: [
          "The PDF spec defines several distinct link types:",
        ],
        list: {
          items: [
            { b: "URL (external web link).", t: "Standard http:// or https:// link that opens in the user's browser. The most common type." },
            { b: "Goto (internal page jump).", t: "Links to another page in the same PDF. TOC entries, footnote references, cross-references." },
            { b: "GotoR (remote PDF page jump).", t: "Links to a specific page in a DIFFERENT PDF, by relative or absolute file path. Common in technical documentation that's split across multiple PDF files." },
            { b: "Launch (external file or program).", t: "Opens a non-PDF file or executes a program. Old format, security risk in modern viewers — most readers block /Launch actions by default." },
            { b: "Named (named destination).", t: "Indirect reference to a named anchor within the document. Used for bookmarks that point to logical destinations rather than specific page numbers." },
          ],
        },
      },
      {
        h: "Five workflows where auditing matters",
        p: [
          "Cases where surfacing every link saves a downstream problem:",
        ],
        list: {
          items: [
            { b: "Pre-share audit.", t: "Before sending a PDF externally, scan its links. Are any pointing to internal-only URLs? Old draft URLs that no longer work? Phishing-vector links if a domain expires and gets re-registered? Each is a hazard the audit catches." },
            { b: "Archive ingestion.", t: "Archival systems (libraries, regulatory repositories) often want self-contained PDFs. External links in archived documents create broken-reference problems years later when the destination URL is gone. Audit and consider stripping before archive." },
            { b: "URL migration.", t: "If your organization's URL pattern is changing (subdomain → main domain, http → https, regional URLs consolidating), every PDF with the old URL pattern is a future broken link. Audit, identify, fix at scale." },
            { b: "Security review of received PDFs.", t: "PDFs from untrusted sources may contain malicious links — phishing pages, drive-by-download URLs, credential-collection forms. Audit before opening links rather than discovering them by clicking." },
            { b: "Internal navigation verification.", t: "A TOC at the front of a long document should jump to each section. Audit Goto-type links to verify every TOC entry actually points where it claims. Broken internal navigation is the most common usability bug in self-published PDFs." },
          ],
        },
      },
      {
        h: "Linked vs link-styled — an important distinction",
        p: [
          "Text that LOOKS like a link in a PDF isn't necessarily clickable. Three patterns:",
        ],
        list: {
          items: [
            { b: "True link annotation.", t: "Text has a /Link annotation overlay with an action dictionary pointing to a destination. Click opens the destination. The inspector surfaces these." },
            { b: "Link-styled text without annotation.", t: "Text is colored blue and underlined to LOOK like a link but has no /Link annotation. Clicks do nothing. Common bug from Word's PDF export when the source hyperlink wasn't preserved correctly. The inspector reports zero links here even though visually the document looks linky." },
            { b: "Both — styled AND annotated.", t: "Most well-formed PDFs both visually-style and annotate their links. The inspector surfaces the annotation; the visual styling is separate." },
          ],
        },
      },
      {
        h: "Filter and export patterns",
        p: [
          "Three filter dimensions:",
        ],
        list: {
          items: [
            { b: "Filter by type for pre-share.", t: "External URLs only — the highest-risk subset. Audit each before distribution." },
            { b: "Filter by type for pre-archive.", t: "GotoR + Launch types — these break in standalone archive use because they reference external files. Strip these for self-contained archive copies." },
            { b: "Export for migration.", t: "Full CSV / JSON dump with target URLs. Run a regex pattern over the export to find URLs matching your old pattern; replace with new pattern via Add Links / Strip Links round-trip." },
          ],
        },
      },
      {
        h: "Strip Links — the inverse tool",
        p: [
          "When the audit reveals problematic links, three remediation paths:",
        ],
        list: {
          items: [
            { b: "Strip Links — remove all hyperlink annotations.", t: "Removes the /Link annotations from every page; underlying text styling remains. The PDF visually looks the same but nothing is clickable. Useful for compliance contexts that require inert documents." },
            { b: "Selective removal.", t: "If only specific links need to come out, use Free Redact to remove them individually. More labor-intensive but preserves wanted links." },
            { b: "Strip then re-add.", t: "When migrating to a new URL pattern, strip all links, then use Add Links to recreate them pointing to the new pattern. Cleaner than per-link surgery." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "On the free web tool, links inspector handles PDFs up to 100 MB with no link-count cap. Parsing runs in your browser; nothing is uploaded. Output is the structured-link table with type / target / source page, plus CSV / JSON export.",
          "Common pairings: Links Inspector → Strip Links to remove all hyperlinks. Links Inspector → Add Links to recreate links pointing to a new URL pattern (migration use). Links Inspector → JS Detector to fully audit interactive features before sharing.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-readability-score — Flesch-Kincaid + AI suggestions
  // ============================================================
  "pdf-readability-score": {
    title: "PDF Readability Score — Flesch-Kincaid math, what the grade level means, and how to act on the score",
    intro:
      "Readability scores quantify how hard a text is to read. The Flesch-Kincaid grade level — the most-used score — maps reading difficulty to a US school-grade equivalent. A grade level of 8 means an average 8th grader (roughly 13-14 years old) can read the text fluently. A grade level of 16 means it requires college-level reading. Knowing the score is useful because most audiences read more easily than the writing aimed at them assumes. Here is how the math actually works, what reading-grade actually predicts about audience comprehension, and the three workflows where the score earns its place.",
    sections: [
      {
        h: "How Flesch-Kincaid math works",
        p: [
          "The Flesch-Kincaid Grade Level formula is deterministic and mechanical: (0.39 × average words per sentence) + (11.8 × average syllables per word) − 15.59. The result maps to a US school grade. The math is simple enough that any calculator can compute it; what's hard is interpreting the result against intended audience.",
          "Two ingredients dominate the score. Long sentences raise the grade level dramatically because they require working memory to track. Multi-syllable words raise it because each adds processing time. A document with 30-word sentences and 4-syllable average word length lands around grade 18 (post-graduate). A document with 12-word sentences and 1.5-syllable words lands around grade 6 (elementary school).",
        ],
      },
      {
        h: "What reading-grade actually predicts",
        p: [
          "The Flesch-Kincaid score is a proxy, not a measurement of comprehension itself. Three things to understand about what it does and doesn't predict:",
        ],
        list: {
          items: [
            { b: "It predicts reading effort, not topic comprehension.", t: "A grade-6 explanation of organic chemistry is still incomprehensible to someone who doesn't know what a covalent bond is. Readability is about prose mechanics, not subject-matter accessibility." },
            { b: "Most US adults read at grade 7-9 level.", t: "Average reading level for US adults is around grade 7-8. Documents targeting general audiences should typically aim for grade 8 or below; this is dramatically lower than most business writing achieves." },
            { b: "Audience-target gap is what matters.", t: "A research paper at grade 16 is fine for an academic audience; a customer-facing FAQ at grade 16 is a usability failure. The number is meaningful only relative to the intended audience." },
          ],
        },
      },
      {
        h: "What the AI suggestions add",
        p: [
          "Beyond the score, the tool surfaces specific edit suggestions:",
        ],
        list: {
          items: [
            { b: "Long sentences flagged.", t: "Sentences over 30 words are flagged with the actual sentence and a suggested split point. The split converts one long sentence into 2-3 shorter ones — the most reliable readability fix." },
            { b: "Jargon without definition.", t: "Domain-specific terms that the document uses but doesn't define. \"Amortization,\" \"variance,\" \"liquidity\" — fine for a finance audience, opaque for a general audience. The tool surfaces the term and suggests either defining inline or replacing." },
            { b: "Multi-syllable cluster runs.",
              t: "Sequences of multi-syllable words that compound to make a sentence dense even when each word is fine individually. Suggestions surface where to swap one for a simpler synonym to break the cluster." },
            { b: "Passive voice patterns.", t: "Excessive passive voice tracks with higher reading effort. Patterns flagged with active-voice rewrites." },
          ],
        },
      },
      {
        h: "Three workflows where the score earns its place",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Customer-facing content QA.", t: "Help-center articles, product documentation, marketing copy — all should target grade 7-9 for general audiences. The score is a one-number QA check before publishing." },
            { b: "Educational-material grading.", t: "Producing content for a specific grade level (5th-grade science textbook, high-school history reader). The score verifies the target is hit before classroom use." },
            { b: "Legal-document plain-language audit.", t: "Some jurisdictions (US for consumer contracts, EU for terms of service) require plain-language drafts. Grade 8-10 is typical legal-plain-language target. The score gates compliance with that standard." },
          ],
        },
      },
      {
        h: "What the score doesn't capture",
        p: [
          "Three readability dimensions the score misses:",
        ],
        list: {
          items: [
            { b: "Conceptual difficulty.", t: "A grade-8 sentence can be fundamentally hard to understand if the concept is abstract. \"The function recursively calls itself\" is grade-8 readable but requires knowing what recursion means." },
            { b: "Layout and visual aids.", t: "Bullet points, headers, white space, illustrations — all dramatically affect actual reading experience but don't enter the score. A grade-16 document with great visual structure may read more easily than a grade-8 wall of text." },
            { b: "Cultural and contextual familiarity.", t: "Idioms, metaphors, and culturally-specific references make text easier for some readers and harder for others. The score is uniform; reading experience is not." },
          ],
        },
      },
      {
        h: "Working with the output",
        p: [
          "Three habits for using the score effectively:",
        ],
        list: {
          items: [
            { b: "Set a target before running.", t: "Decide what grade level the document should hit BEFORE you see the score. Otherwise the score becomes whatever the document is and feels acceptable. Audience-driven target beats post-hoc rationalization." },
            { b: "Apply the suggestions iteratively.", t: "The tool surfaces 5-10 specific suggestions. Apply 3 high-impact ones (the longest sentences, the worst jargon), re-run. Iterate until you hit the target or until the document stops improving from the cuts." },
            { b: "Pair with audience testing.", t: "The score is a proxy. For high-stakes content (customer onboarding, regulatory submissions), validate readability by having a few representative users actually read the document." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF Readability Score charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is the Flesch-Kincaid grade level plus the structured suggestion list.",
          "Common pairings: Readability Score → AI Rewrite or Improve Writing to actually apply the simplifications. Readability + Tone Analyzer for a comprehensive content-quality audit. Readability + Explain PDF for the simplest path to producing audience-appropriate output.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-entities-from-pdf — named-entity-recognition AI
  // ============================================================
  "extract-entities-from-pdf": {
    title: "Extract named entities from a PDF — people, organizations, places, dates as structured data",
    intro:
      "Named entity extraction surfaces the proper nouns and date references in a document as structured tables. People, organizations, places, dates — each in its own table with page citations. Useful for any workflow that needs to know \"who and what is mentioned\" in a long document. Here is what the extractor surfaces, the four workflows where the structured view replaces manual scanning, and the precise difference between this AI tool and the free regex-based Extract Contacts.",
    sections: [
      {
        h: "What the extractor produces",
        p: [
          "Drop a PDF. The tool reads the text, runs an AI named-entity-recognition pass, and produces four Markdown tables — one each for People, Organizations, Places, and Dates. Each row has the entity name, a one-line role note (\"CEO of Acme Corp,\" \"city in Karnataka,\" \"founding date\"), and the source page where the entity appeared. Multiple mentions of the same entity collapse to a single row with multiple page citations.",
          "The output is structured for downstream use: copy a table directly into a spreadsheet, import to a CRM, paste into a research-tracking system, feed into a knowledge graph builder. The page citations make every entity verifiable against the source.",
        ],
      },
      {
        h: "Four workflows where structured entity tables earn their place",
        p: [
          "Cases where you need entities as data, not as in-flow text:",
        ],
        list: {
          items: [
            { b: "Research paper preprocessing.", t: "Building a literature review or citation graph. The People table gives you authors mentioned in citations; the Organizations table gives you research institutions; the Places table gives you study locations. All ready for downstream analysis." },
            { b: "Legal-document discovery.", t: "Court orders, contracts, and litigation documents reference many people and organizations. Extract Entities surfaces them all in one pass for case-management ingestion. Use the page citations to verify every entity against the source." },
            { b: "Business-intelligence on company reports.", t: "Annual reports mention partners, suppliers, customers, competitors. Extract Entities surfaces the relationship landscape from the report's narrative." },
            { b: "Compliance/KYC document review.", t: "When reviewing a long document for KYC compliance, the People and Organizations tables surface every named party. Combined with a sanctions-list cross-check, this is the operational starting point for due diligence." },
          ],
        },
      },
      {
        h: "AI Entity Extraction vs free Extract Contacts",
        p: [
          "Two adjacent tools that solve different problems:",
        ],
        list: {
          items: [
            { b: "Extract Contacts (free, regex).", t: "Finds emails, phone numbers, URLs. Pattern-based — explicit string formats. Misses obfuscation. Free." },
            { b: "Extract Entities (AI, 3 credits).", t: "Finds named people, organizations, places, dates. Context-based — entities recognized by what they ARE, not by what they look like. Catches \"Mr. Sundar Pichai\" as a person and \"Alphabet Inc.\" as an organization without needing either to follow a regex pattern. Costs credits." },
          ],
        },
      },
      {
        h: "How accurate is the extraction",
        p: [
          "Three factors affect accuracy:",
        ],
        list: {
          items: [
            { b: "Common Western names: very high.", t: "Names like \"Sundar Pichai,\" \"Microsoft,\" \"Bangalore,\" \"2024\" are reliably identified across document types." },
            { b: "Less-common Indic names: high but variable.", t: "Names with non-standard transliterations or regional variants sometimes mis-classify. The Sundar Pichai example works because the name is well-known; a regional-newspaper byline with a rare regional name may classify less reliably." },
            { b: "Ambiguous proper nouns: medium.", t: "Words that are both common nouns and proper nouns (\"Apple\" the fruit vs \"Apple\" the company; \"Bishop\" the chess piece vs \"Bishop\" the surname) get disambiguated by context, but errors happen. Spot-check ambiguous entries." },
          ],
        },
      },
      {
        h: "Relationships and what the tool doesn't do",
        p: [
          "Three explicit non-features:",
        ],
        list: {
          items: [
            { b: "Doesn't infer relationships.", t: "Two people mentioned in the same document aren't claimed to know each other unless the source explicitly says so. For relationship inference, build a knowledge graph downstream from the entities + the source text." },
            { b: "Doesn't classify entity sub-types.", t: "Person table doesn't separate \"executives\" from \"academics\" from \"defendants.\" Organization table doesn't separate \"customers\" from \"vendors\" from \"competitors.\" The role-note column captures some of this in narrative form but isn't structured." },
            { b: "Doesn't resolve to canonical IDs.", t: "\"Sundar Pichai\" doesn't get a Wikidata ID; \"Microsoft\" doesn't get a CIK or stock ticker. For canonical resolution, downstream tooling against a reference database is required." },
          ],
        },
      },
      {
        h: "Three patterns for working with the output",
        p: [
          "Habits that improve downstream use:",
        ],
        list: {
          items: [
            { b: "Dedupe before downstream use.", t: "The tool collapses exact-string duplicates within a document but doesn't normalize variants. \"Sundar Pichai\" and \"Mr. Pichai\" may surface as separate rows. Quick post-processing dedupe is usually needed." },
            { b: "Sanity-check ambiguous entries.", t: "Click through to the citation page for any entity that surprises you. AI is reliable but not infallible; spot-checks catch the rare misclassification." },
            { b: "Combine tables for graph construction.", t: "Person + Organization + Place tables together describe the document's named-entity landscape. Build a knowledge graph by treating co-mention in the same page as an implicit edge between entities." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Extract Entities charges 3 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during extraction and is never persisted. Output is four Markdown tables with page citations.",
          "Common pairings: Extract Entities + Extract Contacts for the full named-entity + contact-method picture. Extract Entities → Knowledge graph downstream. Extract Entities + Sentiment Analysis to see which entities are associated with positive vs negative sentiment in the source.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-sentiment-analysis — sentiment classification AI
  // ============================================================
  "pdf-sentiment-analysis": {
    title: "PDF Sentiment Analysis — overall and per-section sentiment with evidence quotes",
    intro:
      "Sentiment analysis classifies content as positive, negative, neutral, or mixed. The standard NLP problem; the standard tool category. What makes this implementation useful for PDFs specifically is the per-section breakdown with evidence quotes — not just \"overall negative\" but \"section 3 turns negative starting with this specific sentence.\" Here is what the analyzer produces, the workflows where sentiment-as-data is the load-bearing signal, and the limits of automated sentiment when the text is sarcastic, mixed, or domain-specific.",
    sections: [
      {
        h: "What the analyzer produces",
        p: [
          "Drop a PDF. The tool extracts the text, scores sentiment per paragraph and per section, and surfaces a structured report. Output covers four dimensions: overall verdict (positive / negative / mixed / neutral) with confidence; per-section verdicts with the same dimensions; evidence quotes for each verdict (the specific sentences that drove the classification); and sentiment shifts (positive→negative or vice versa) with the trigger sentence that marked the transition.",
          "Page citations on every finding. The verdict isn't the AI's vibe — it's grounded in specific quoted passages from the source. You can verify every classification by clicking through to the cited page.",
        ],
      },
      {
        h: "Five workflows where sentiment-as-data earns its place",
        p: [
          "Cases where the structured analysis beats reading the document directly:",
        ],
        list: {
          items: [
            { b: "Customer-feedback aggregation.", t: "A PDF of 200 customer reviews. Manually classifying each as positive / negative takes hours. The analyzer surfaces overall + per-review sentiment in seconds, with evidence quotes for spot-checking." },
            { b: "Press-coverage analysis.", t: "A PDF of media coverage about your company over a quarter. Sentiment trend across articles shows whether press is improving, deteriorating, or mixed. The shifts column identifies turning-point events." },
            { b: "Internal-survey processing.", t: "Employee engagement surveys often produce long-form open-text responses. Sentiment classification at scale lets HR see the overall mood and the specific concerns driving negative sentiment." },
            { b: "Contract redline review.", t: "When reviewing a long contract, the sentiment signal flags sections with adversarial-sounding language that might warrant negotiation. Plain-sentiment doesn't apply directly to contracts but \"negative-toward-counterparty\" sections often correspond to risk allocation worth understanding." },
            { b: "Mixed-feedback synthesis.", t: "Documents that contain both positive and negative content (\"the queue was long but the food was great\") get classified per-aspect rather than flattened to neutral. The per-section breakdown shows where the positives are and where the negatives are." },
          ],
        },
      },
      {
        h: "Three limits of automated sentiment",
        p: [
          "Where the analyzer's accuracy degrades:",
        ],
        list: {
          items: [
            { b: "Sarcasm and irony.", t: "\"Great, another security incident\" is structurally positive (great) but semantically negative (irony). Sentiment classifiers often miss this. Severe sarcasm-heavy content (parody, satire, cynical commentary) should be treated as having lower-confidence classification." },
            { b: "Domain-specific connotation.", t: "Words that are negative in general English but neutral in domain context: \"failed test\" (negative everyday, neutral in software QA where it means a test detected a problem). The analyzer doesn't always disambiguate. Domain-specific content sometimes scores misleadingly negative." },
            { b: "Neutral / informational content.", t: "Technical specifications, regulatory text, instructions — content that isn't supposed to carry sentiment. The analyzer dutifully classifies it as neutral but the verdict isn't particularly useful. Sentiment is most informative on opinion-bearing content." },
          ],
        },
      },
      {
        h: "Understanding sentiment shifts",
        p: [
          "The shift-detection column is the most interesting output for many use cases:",
        ],
        list: {
          items: [
            { b: "Identifies turning points.", t: "When a document's tone shifts mid-way — review starts positive then turns sour, contract negotiation gets adversarial in a specific clause, news article pivots from problem to solution — the shift is often the load-bearing content. The analyzer surfaces it explicitly." },
            { b: "Surfaces the trigger.", t: "Each shift identifies the specific sentence that marks the transition. Useful for understanding what specifically changed the document's direction." },
            { b: "Useful for narrative documents.", t: "Documents structured as stories (case studies, narratives, journalistic features) often have intentional sentiment arcs. The shift column reveals the structure." },
          ],
        },
      },
      {
        h: "Mixed sentiment — how it's handled",
        p: [
          "Documents that mix positive and negative aspects don't flatten to neutral. Three patterns:",
        ],
        list: {
          items: [
            { b: "Per-target sentiment.", t: "\"The food was great but the service was slow\" surfaces as positive-about-food and negative-about-service. The analyzer separates targets when they're distinguishable." },
            { b: "Overall verdict respects mix.", t: "The overall verdict is \"mixed\" when significant amounts of both polarity appear, rather than picking one. Mixed is a real classification, not a fallback." },
            { b: "Section-level granularity.", t: "Mixed sentiment per section. Section 3 might be uniformly negative even though the document overall is positive. The per-section breakdown surfaces this nuance." },
          ],
        },
      },
      {
        h: "When sentiment isn't the right analysis",
        p: [
          "Three cases where a different tool fits better:",
        ],
        list: {
          items: [
            { b: "Want substantive content extraction.", t: "If you need to know WHAT the document says rather than how positively, use Summarize or Key Points." },
            { b: "Want voice/register analysis.", t: "Tone Analyzer is about voice and audience; Sentiment Analysis is about polarity. Related but different — pick by what you want to measure." },
            { b: "Want competitive-intelligence specifically.", t: "For business-document sentiment toward specific competitors, products, markets, build queries against the entity-extraction + sentiment outputs combined — neither tool alone produces that specific aggregation." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF Sentiment Analysis charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is the structured report with overall + per-section verdicts, evidence quotes, and shift detections.",
          "Common pairings: Sentiment + Entity Extraction to see which entities are associated with positive vs negative sentiment. Sentiment + Tone Analyzer for combined voice + polarity audit. Sentiment over a series of documents to see longitudinal trends.",
        ],
      },
    ],
  },

  // ============================================================
  // proofread-pdf — error-detection AI
  // ============================================================
  "proofread-pdf": {
    title: "Proofread PDF — what AI proofreading catches that spell-check misses",
    intro:
      "Spell-check is necessary but not sufficient. Spell-check catches \"recieve\" → \"receive\" but doesn't catch \"their\" used where \"there\" was meant, or \"effect\" used where \"affect\" was needed, or subject-verb disagreement, or comma splices, or article misuse. AI proofreading catches the contextual errors that pattern-match spell-checkers miss. Here is what kinds of errors get caught, why context matters for accuracy, and the three workflows where a final-pass proofread by AI is the right last step before publication.",
    sections: [
      {
        h: "What AI proofreading catches vs spell-check",
        p: [
          "Spell-check matches each word against a dictionary. If the word is in the dictionary, it passes — regardless of whether the right word was used. AI proofreading runs context-aware checks: each word's correctness evaluated against the surrounding sentence's meaning. Six categories of error the AI catches that spell-check doesn't:",
        ],
        list: {
          items: [
            { b: "Homophones in context.", t: "\"Their\" / \"there\" / \"they're.\" \"Effect\" / \"affect.\" \"Principle\" / \"principal.\" Spell-check passes all of these because they're real words; AI catches the wrong choice." },
            { b: "Subject-verb agreement.", t: "\"The team are\" vs \"the team is.\" \"A group of researchers were\" — depending on style, may need \"was.\" Context-dependent agreement that spell-check ignores." },
            { b: "Tense consistency.", t: "Mid-sentence tense shifts that aren't justified by the meaning. \"He walked to the store and is buying milk\" — the tense shift is a real error in most contexts." },
            { b: "Article misuse.", t: "\"A apple\" vs \"an apple.\" Less common in skilled writing but happens often enough to make it a useful check. Non-native English writers especially benefit." },
            { b: "Comma splices and run-on sentences.", t: "Two independent clauses joined only by a comma. Spell-check doesn't see syntax. AI flags these and suggests semicolon or sentence-break fixes." },
            { b: "Collocation errors.", t: "Words that don't normally combine in English. \"Make a decision\" works; \"do a decision\" is wrong but spell-check passes both words. AI catches the collocation mismatch." },
          ],
        },
      },
      {
        h: "Output structure",
        p: [
          "The proofreader produces a structured table with five columns:",
        ],
        list: {
          items: [
            { b: "Page.", t: "Where in the source the error appears. Click-through for context." },
            { b: "Quote.", t: "The exact sentence (or phrase) containing the error, with the error highlighted." },
            { b: "Error type.", t: "Categorised as spelling / homophone / subject-verb / tense / punctuation / article / collocation / etc. Useful for analysing what types of errors a document carries — and for spotting whether the document has a single category of recurring problem." },
            { b: "Suggested fix.", t: "The specific correction. Most fixes are unambiguous; some are stylistic suggestions where the proofreader picks the most common option." },
            { b: "Confidence.", t: "How sure the AI is. High-confidence fixes are usually correct; medium-confidence ones warrant a quick review." },
          ],
        },
      },
      {
        h: "Why context matters for accuracy",
        p: [
          "Three patterns where context-aware checking outperforms rule-based:",
        ],
        list: {
          items: [
            { b: "Domain-specific terminology.", t: "Technical terms that aren't in standard dictionaries (\"FedRAMP,\" \"OAuth,\" \"SCIM\") would flag in spell-check but the AI recognizes them in technical-document context and passes them." },
            { b: "Style choices.", t: "Intentional sentence fragments, stylistic singular-they, regional spelling variations (US vs UK). AI evaluates whether the choice is consistent with the document's overall style; spell-check applies one rule everywhere." },
            { b: "Code blocks and literals.", t: "Code snippets, command names, file paths — content that shouldn't be proofread because it's reproduced literally. AI recognizes code-block context; spell-check flags every non-dictionary word as a misspelling." },
          ],
        },
      },
      {
        h: "Three workflows where AI proofread is the right last step",
        p: [
          "Cases where the final pass before publication should include proofreading:",
        ],
        list: {
          items: [
            { b: "Pre-publication audit for any public-facing content.", t: "Blog posts, marketing copy, customer-facing documentation. Public errors damage brand perception. The proofreader is the cheap insurance against that." },
            { b: "Submission documents.", t: "Application materials (university, job, grant), proposals, RFP responses. Errors signal sloppiness; clean writing signals attention to detail. The proofreader is high-leverage for these." },
            { b: "Translated content.", t: "Documents translated from another language often carry article-use errors, collocation errors, and idiomatic mismatches that translators miss. The proofreader catches these specifically." },
          ],
        },
      },
      {
        h: "False positives — how to handle them",
        p: [
          "AI proofreading has a non-zero false-positive rate. Three categories worth knowing:",
        ],
        list: {
          items: [
            { b: "Domain-specific terms flagged as misspellings.", t: "Technical acronyms, industry-specific jargon, proper names. The proofreader is conservative — better to flag too many than to miss real errors. Skip these in the table review." },
            { b: "Stylistic choices flagged as errors.", t: "Intentional fragments, regional spelling, voice-specific punctuation. Style flags often shouldn't be applied. The confidence column helps — most stylistic flags are medium-confidence." },
            { b: "Dialect mismatch.", t: "If the document mixes US and UK English (a real inconsistency worth fixing) the proofreader flags both, but the cleanup direction is yours to pick. Decide first, then apply." },
          ],
        },
      },
      {
        h: "Proofread vs Improve Writing — different goals",
        p: [
          "Two adjacent tools:",
        ],
        list: {
          items: [
            { b: "Proofread — error detection.", t: "Catches mistakes. Output is a table of issues. Use as a final pass before publication." },
            { b: "Improve Writing — clarity rewrite.", t: "Tightens prose, cuts filler, improves readability. Output is rewritten text. Use mid-draft for substantial revision." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Proofread PDF charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is the structured error table.",
          "Common pairings: Proofread + Inclusive Language Audit + AI Detector for a complete pre-publication audit. Proofread → AI Rewrite for any error that requires substantial restructuring rather than a one-word fix.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-pdf-form-data — paired with form-fields inspector
  // ============================================================
  "extract-pdf-form-data": {
    title: "Extract PDF form data — pulling AcroForm values out for spreadsheets and pipelines",
    intro:
      "Filled PDF forms are everywhere: tax returns, vendor onboarding forms, expense reports, government applications, registration forms. When you receive a stack of filled forms — or when you have one of your own you want to extract data from — pulling the values out as structured data is the operation. CSV for spreadsheets, JSON for scripts. Here is how AcroForm-based extraction works, the three workflows where structured form data beats screen-scraping, and the difference between this tool and the PDF Form Fields inspector.",
    sections: [
      {
        h: "How form data extraction works",
        p: [
          "Drop a filled PDF form. The tool reads the /AcroForm dictionary, walks every field in the /Fields array, reads each field's current value (the /V entry), and surfaces field-name + field-type + field-value as a structured row. Output is downloadable as CSV (for spreadsheet ingestion) or JSON (for programmatic use).",
          "The extraction is fast and accurate because the PDF spec defines exactly how form fields are stored. Each text input has a /V containing its string value; each checkbox has /V set to /Yes or /Off (or sometimes other check-state values); each radio group has /V identifying the selected option; each dropdown has /V containing the selected list item. The tool reads these directly without any OCR or AI guesswork.",
        ],
      },
      {
        h: "Three workflows where structured extraction beats alternatives",
        p: [
          "Cases where pulling form data programmatically is the right operation:",
        ],
        list: {
          items: [
            { b: "Bulk form processing.", t: "100 filled application forms need to be ingested into a database. Each form has the same fields. Run the extractor across all 100; the CSVs concatenate into a single dataset ready for SQL load. Manual data-entry of the same volume takes days." },
            { b: "Spreadsheet workflow integration.", t: "Your team uses Excel or Google Sheets as the system of record. Filled forms arrive via email. Extract → CSV → paste into the master sheet. The forms become a queryable dataset without leaving the spreadsheet workflow." },
            { b: "API ingestion to CRM / ERP.", t: "JSON output maps to most CRM and ERP record schemas. Map field names to system fields once; subsequent extractions push into the system via API. Reduces form-to-record cycle time from minutes to seconds." },
          ],
        },
      },
      {
        h: "What's an AcroForm — and what isn't",
        p: [
          "Three distinctions worth understanding:",
        ],
        list: {
          items: [
            { b: "AcroForm — classic PDF forms.", t: "The PDF spec defines AcroForm — interactive form fields with /T (name), /FT (type), /V (value), /Ff (flags). Most fillable PDFs are AcroForm. The extractor reads these natively. Fast and exact." },
            { b: "XFA — Adobe's proprietary form format.", t: "Some Adobe-generated forms use XFA, an XML-based form layer that lives alongside the AcroForm. The XFA spec is Adobe-specific; pdf-lib doesn't read it. The extractor reports XFA-only forms as not-supported. Workaround: open in Adobe Acrobat, Save As to flatten XFA back to AcroForm, then extract." },
            { b: "Static \"form-looking\" PDFs.", t: "Some PDFs visually show form-like layouts (signature lines, fillable boxes) but have no AcroForm dictionary. They're just decorated text. The extractor correctly reports zero fields. Use AI Fill PDF Form to fill these visually; once flattened to AcroForm, you can extract." },
          ],
        },
      },
      {
        h: "Extract Form Data vs PDF Form Fields inspector",
        p: [
          "Two adjacent tools that look similar:",
        ],
        list: {
          items: [
            { b: "PDF Form Fields inspector.", t: "Surfaces the AcroForm SCHEMA — what fields exist, their types, their flags, their default values. Useful for compliance audits, form-quality reviews, accessibility audits. Read-only schema view." },
            { b: "Extract Form Data.", t: "Surfaces the AcroForm VALUES — the current value of each field. Useful for ingesting filled-form data into downstream systems. Read-only data view." },
            { b: "Same underlying source, different output focus.", t: "Both walk the same /AcroForm dictionary; the inspector surfaces schema metadata, the extractor surfaces values. Pair them when you need both the form structure AND the filled data." },
          ],
        },
      },
      {
        h: "Working with the output",
        p: [
          "Three patterns for downstream use:",
        ],
        list: {
          items: [
            { b: "CSV column mapping.", t: "CSV columns map to AcroForm field names (the /T entries). Field names like \"applicant_name_v2\" can be ugly for end-user display; rename in your downstream spreadsheet rather than asking the form author to fix." },
            { b: "Checkbox values.", t: "Checkboxes return their PDF spec values: /Yes for checked, /Off for unchecked. Some PDFs use non-standard values (Y/N, 1/0, On/Off variants). The extractor surfaces the raw value; downstream code may need to normalize to boolean true/false." },
            { b: "Multi-line text.", t: "Multi-line text fields return newline characters in their values. CSV cells with embedded newlines need proper quoting (RFC-4180 compliant). The extractor handles this in CSV output; if you're processing JSON, the newlines are escape-encoded \\n." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Free. Client-side processing. The extractor handles PDFs up to 100 MB with no field-count cap. Parsing runs in your browser; nothing is uploaded. Output is CSV or JSON.",
          "Common pairings: Form Fields Inspector for schema, Extract Form Data for values. AI Fill PDF Form upstream when the source form is flat (no AcroForm). Bulk-process via the Batch API for high-volume ingestion (CSV concatenation per file → SQL load).",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-mindmap — hierarchical structure AI
  // ============================================================
  "pdf-to-mindmap": {
    title: "PDF to Mind Map — hierarchical structure as a collapsible outline, and why this beats linear summaries",
    intro:
      "Some documents have hierarchical content that flattens awkwardly into linear summary prose. Research papers with sections and sub-sections; books with chapters and topics; business plans with strategic pillars and tactical actions. The mind-map view preserves the hierarchy: root concept → main branches → sub-branches → leaf details. Reading collapsed gives the document's outline at a glance; expanding nodes drills into specifics. Here is what the mind map produces, the four use cases where the hierarchical view earns its place over linear summary, and the export formats for downstream tooling.",
    sections: [
      {
        h: "How hierarchy extraction works",
        p: [
          "The tool reads the PDF, identifies the document's structural cues (headers / sub-headers / bullet lists / definition blocks / topic boundaries), and constructs a tree: root concept at the top, main branches under it, sub-branches under those, leaf details at the bottom. Typical depth is 3-5 levels — deeper trees become unwieldy; shallower ones are essentially linear lists.",
          "Section / chapter headers in the source map to main branches. Bullet lists and key definitions map to leaves. Documents without clear header structure get restructured topically — the AI infers what the main topics are and groups related content under each. Output renders as a nested collapsible outline; each node expands on click.",
        ],
      },
      {
        h: "Four workflows where hierarchy beats linear summary",
        p: [
          "Cases where the mind-map view is more useful than a Summarize-style flat output:",
        ],
        list: {
          items: [
            { b: "Research paper navigation.", t: "Long research papers have abstract / introduction / methodology / results / discussion / conclusion plus subsections within each. Mind map gives the structural map; click into any subsection to see details. Faster than scrolling the PDF." },
            { b: "Business plan or strategic document review.", t: "Strategy docs have pillars / initiatives / actions hierarchy. Mind map surfaces the structural relationships; you can review at the pillar level without losing the tactical detail." },
            { b: "Book chapter outline for study.", t: "A textbook chapter has main concepts → sub-concepts → definitions and examples. Mind map produces the chapter's outline; students can use it as a study scaffold while reading or as a review tool afterward." },
            { b: "Project documentation triage.", t: "Long project docs (specs, runbooks, architecture documents) benefit from a structural overview before diving in. Mind map shows the document's architecture so you can navigate to the section you actually need." },
          ],
        },
      },
      {
        h: "What you can do with the output",
        p: [
          "Three downstream paths:",
        ],
        list: {
          items: [
            { b: "Read collapsed for overview.", t: "The default view shows top-level branches. Get the document's structure in 30 seconds without reading any detail." },
            { b: "Expand selectively.", t: "Click any branch to expand its sub-branches. Drill into specific sections without exposure to the rest. Useful when only part of the document is relevant to your current task." },
            { b: "Export to mind-mapping software.", t: "OPML and Markdown export formats. OPML imports cleanly to XMind, MindNode, iThoughts, OmniOutliner. Markdown imports to Obsidian, Notion, Roam. Native FreeMind .mm and Miro JSON formats are on the roadmap." },
          ],
        },
      },
      {
        h: "When linear summary beats hierarchical",
        p: [
          "Three cases where Summarize or Key Points fits better:",
        ],
        list: {
          items: [
            { b: "Narrative documents.", t: "Stories, opinion pieces, journalism — content that flows linearly rather than hierarchically. A mind map of a feature article tends to feel forced; Summarize produces more useful output." },
            { b: "Short documents.", t: "A 3-page document doesn't have enough hierarchical content to make a useful mind map. The top-level branches end up being one-per-page; the value of the hierarchy is lost." },
            { b: "Reference reads where you'll cite specific claims.", t: "Mind map gives structure; Key Points gives claims with citations. When the goal is finding specific evidence for downstream use, Key Points' citation-per-bullet format is more useful." },
          ],
        },
      },
      {
        h: "Text-outline vs visual SVG — what to expect",
        p: [
          "Two distinctions:",
        ],
        list: {
          items: [
            { b: "Current implementation: collapsible text outline.", t: "Hierarchy as nested bullet lists with expand/collapse interactions. Functions like a mind map structurally; rendered as a tree-text outline rather than radial branches." },
            { b: "Roadmap: visual SVG with radial branches.", t: "True \"draw the mind-map\" rendering with the root in the center and branches radiating outward is on the roadmap. Different visual experience; same hierarchical content." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Mind Map charges 10 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output renders in-tool as a collapsible outline; exportable as OPML or Markdown.",
          "Common pairings: Mind Map → import to XMind/MindNode for further visual editing. Mind Map + Summarize: structural overview + linear digest of the same document. Mind Map + Study Notes when preparing study material from a long source.",
        ],
      },
    ],
  },

  // ============================================================
  // extract-pdf-citations — academic-research workflow
  // ============================================================
  "extract-pdf-citations": {
    title: "Extract PDF citations — BibTeX-ready references for LaTeX, Zotero, Mendeley",
    intro:
      "Academic and technical papers reference dozens to hundreds of prior works. Extracting those references manually — copying each one, parsing it into structured fields, formatting as BibTeX or RIS — is exactly the kind of work that compounds badly across many papers. The citation extractor automates it: drop a PDF, get a BibTeX block ready to paste into your .bib file plus a human-readable reference list. Here is how reference-list detection works, the accuracy ranges by source type, and the workflow for cross-checking BibTeX entries before they go into your bibliography.",
    sections: [
      {
        h: "How citation extraction works",
        p: [
          "The tool reads the PDF, identifies the reference-list section by heading patterns (\"References,\" \"Bibliography,\" \"Works Cited\"), and parses each entry. For each citation, the parser identifies author names, publication year, title, journal/conference, volume/issue, page numbers, and DOI / URL if present. The extracted fields populate a BibTeX entry with the appropriate entry type (@article for journals, @book for monographs, @inproceedings for conference papers, @misc when structure is unclear).",
          "Output is both a BibTeX block and a human-readable reference list. The BibTeX is ready to paste into a .bib file. The readable list is for cross-checking — verifying that the parser captured each entry's fields correctly before the bibliography goes into a submission.",
        ],
      },
      {
        h: "Accuracy by source type",
        p: [
          "Three reliability bands worth knowing:",
        ],
        list: {
          items: [
            { b: "Standard journal articles with DOIs — very high accuracy.", t: "Most modern academic papers cite journal articles with embedded DOIs. The parser captures these reliably — author / year / title / journal / volume / pages / DOI all populated. Verify before submission but expect high accuracy." },
            { b: "Books and book chapters — medium accuracy.", t: "Books have author / year / title / publisher fields rather than journal / volume / pages. The parser handles this but occasionally swaps fields when the citation format is non-standard. Verify book entries specifically." },
            { b: "Preprints, technical reports, web sources — variable accuracy.", t: "Non-standard citation formats parse less reliably. The parser falls back to @misc when structure is unclear. Verify each before submission; sometimes the BibTeX needs manual adjustment." },
          ],
        },
      },
      {
        h: "Three common error spots to verify",
        p: [
          "Where to focus the cross-check:",
        ],
        list: {
          items: [
            { b: "Author-order swaps.", t: "Citations in some styles list first-author-last-name first, in others first-author-first-name first. The parser usually gets this right but occasionally swaps for unusual formats. Verify against the original citation." },
            { b: "Journal-name abbreviations.", t: "Some citations use full journal names (\"Journal of the American Medical Association\"); others use abbreviations (\"JAMA\"). BibTeX style standards vary by publisher. The parser captures what the source uses; expand or abbreviate per your target style." },
            { b: "Special characters in titles.", t: "Math symbols, Greek letters, em-dashes, special quotation marks — these sometimes get garbled in extraction. Specifically check title fields for any character that should be \\LaTeX-encoded but came out as Unicode (or vice versa)." },
          ],
        },
      },
      {
        h: "Style conversion downstream",
        p: [
          "The extractor outputs BibTeX. Three conversion paths to other formats:",
        ],
        list: {
          items: [
            { b: "Zotero / Mendeley import.", t: "Both reference managers import BibTeX natively. Once in the manager, export to APA / MLA / Chicago / RIS / any other supported format. Zotero is the most flexible." },
            { b: "Pandoc CLI.", t: "Pandoc reads BibTeX and outputs many citation formats. Useful for one-off conversions without setting up a reference manager." },
            { b: "Direct BibTeX use.", t: "For LaTeX submissions, BibTeX is the final format. Paste into your .bib file; cite via \\cite{key} in the .tex; let BibTeX style files handle the formatting at compile time." },
          ],
        },
      },
      {
        h: "Three workflows where extraction earns its place",
        p: [
          "Cases where the time savings compound:",
        ],
        list: {
          items: [
            { b: "Literature review compilation.", t: "Building a literature review means collecting citations from many source papers. Extract from each source; the BibTeX entries accumulate in your reference manager. The structural work that takes hours manually takes minutes via extraction." },
            { b: "Verifying your own paper's references.", t: "Before submitting a paper, run the extractor on your draft. Cross-check against your reference manager. Catches dropped entries (in the text but not in the bibliography) and orphan entries (in the bibliography but not cited)." },
            { b: "Building a domain-specific knowledge base.", t: "Long-term research projects benefit from accumulating a domain-specific BibTeX library. Extract from every paper you read; the library grows organically over time." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Extract PDF Citations charges 3 credits per document — flat rate regardless of reference count. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during extraction and is never persisted. Output is BibTeX + human-readable reference list with page citations.",
          "Common pairings: Citations + Entity Extraction for the named-entity + reference picture of a research document. Citations → Zotero import for downstream style conversion. Citations + AI Summarize when building literature-review summaries.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-newsletter — email-shaped content AI
  // ============================================================
  "pdf-to-newsletter": {
    title: "PDF to Email Newsletter — restructuring documents for email-shaped consumption",
    intro:
      "Email newsletters succeed or fail on three signals: subject line drives the open, preheader extends the hook, scannable structure keeps the reader through the close. None of these come from a source document automatically — research reports and release notes are organized for sequential reading, not for email skimming. PDF to Newsletter restructures the source into email-shape: subject + preheader + 3-5 sections + sign-off, dropping cleanly into Mailchimp, Substack, Beehiiv, or any ESP. Here is what the generator produces, the four newsletter contexts where it pays off, and what stays for human polish.",
    sections: [
      {
        h: "What gets restructured for email",
        p: [
          "Email is a different medium from web or print. Readers skim subject lines in their inbox view, decide whether to open in 1-2 seconds, scan the email body in 30-60 seconds, and click through or close. The generator restructures the source PDF accordingly:",
        ],
        list: {
          items: [
            { b: "Subject line (60-character optimized).", t: "A specific, content-anchored subject. Not click-bait; not generic. \"Q3 revenue grew 22%, here's what drove it\" rather than \"Q3 Update.\" The 60-char limit fits most email clients' inbox preview." },
            { b: "Preheader (1-2 sentence preview).", t: "The first sentence(s) of the email body, but designed to extend the subject's hook. Many email clients show this in the inbox preview alongside the subject. The two together should make the open decision." },
            { b: "3-5 sections with descriptive headers.", t: "Email-friendly section count. Each header is descriptive (\"Where the growth came from\") rather than generic (\"Section 2\"). Sections break the wall-of-text scan failure mode." },
            { b: "Sign-off.", t: "A closing that gives the reader a clear next action (read the full report, register for a webinar, reply with feedback). Newsletter readers expect this convention; generic \"Best, [Team]\" closes feel incomplete." },
          ],
        },
      },
      {
        h: "Four newsletter contexts where it pays off",
        p: [
          "Cases where source-to-newsletter automation saves real time:",
        ],
        list: {
          items: [
            { b: "Research-report newsletter.", t: "Subscribe-able newsletters that publish research summaries to a list. The full report stays on the website; the newsletter is the digest that drives clicks back. Generator handles the digestion." },
            { b: "Internal status updates.", t: "Engineering / product / company-wide updates that go out via email. Source might be a longer status document; the email version is the executive summary plus links to detail." },
            { b: "Course / cohort communications.", t: "Educators sending weekly newsletters to a class or cohort. The source might be the lecture notes or assignment doc; the newsletter is the weekly recap with assignments highlighted." },
            { b: "Investor / customer updates.", t: "Quarterly investor letters, customer-update newsletters. Source: the full investor letter or customer-success report. Email version: the punchy digest with the headline numbers and the link to detail." },
          ],
        },
      },
      {
        h: "What stays for human polish",
        p: [
          "Three categories the generator deliberately leaves for the editor:",
        ],
        list: {
          items: [
            { b: "Tone polish.", t: "Generator output is competent but generic. Newsletter readers respond to specific voice — a distinctive sender's voice that they signed up to hear from. Edit the output to inject your voice; don't ship raw AI output if the audience knows your style." },
            { b: "Images and embeds.", t: "Text-only output. The generator notes where images would help (\"[chart showing Q3 revenue]\") but doesn't insert them. Add actual images in the ESP — usually from your CMS or design library." },
            { b: "Subject-line A/B testing.", t: "The generator produces one subject line. For aggressive open-rate optimization, generate variants and A/B test in your ESP. The generated baseline is a competent default; iteration finds the winners." },
          ],
        },
      },
      {
        h: "Length and cap reasoning",
        p: [
          "The output is capped at 300-800 words. Three reasons for the cap:",
        ],
        list: {
          items: [
            { b: "Email-engagement data.", t: "Newsletters longer than ~800 words show steep open-vs-read drop-off in industry data. Readers who open a long newsletter scroll past most of it. The cap respects this reality." },
            { b: "Source-detail link convention.", t: "Newsletters are digests, not replacements. The expected pattern is: digest in the email, full content via click-through to website. The cap forces the digest-structure rather than dumping the whole source." },
            { b: "ESP rendering limits.", t: "Some email clients (especially mobile) truncate longer emails. The cap stays well within rendering limits across major clients." },
          ],
        },
      },
      {
        h: "Newsletter vs Blog Post vs Social Thread",
        p: [
          "Three adjacent generators for different distribution channels:",
        ],
        list: {
          items: [
            { b: "Newsletter — email-shaped digest.", t: "Subject + preheader + 3-5 sections + sign-off. 300-800 words. Optimized for inbox consumption." },
            { b: "Blog Post — web-shaped article.", t: "Hook + 3-5 sections + close. 800-1500 words. Optimized for browser reading + SEO." },
            { b: "Social Thread — multi-post numbered.", t: "5-10 numbered posts at ~240 chars each. Optimized for LinkedIn / X scrolling." },
            { b: "Same source, different shapes.", t: "Run all three on the same source to produce coordinated multi-channel distribution from a single deliverable." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Newsletter charges 3 credits per document. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is Markdown with explicit Subject / Preheader / Sections / Sign-off blocks ready for ESP paste.",
          "Common pairings: Newsletter + Blog Post + Social Thread for coordinated multi-channel distribution from one source. Newsletter → ESP-specific image addition + brand voice polish before sending.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-study-notes — revision-pack AI
  // ============================================================
  "pdf-to-study-notes": {
    title: "PDF to Study Notes — revision packs with self-check questions for active recall",
    intro:
      "Study notes are different from summaries. A summary tells you what the source said; study notes are designed for active learning — concept-by-concept structure, explicit takeaways at each step, and self-check questions for recall testing. The combination matches how the educational research says learners actually retain material: structured exposure followed by retrieval practice. Here is what the generator produces, the four-section structure that maps to revision workflows, and how the self-check questions enable active recall without an answer key.",
    sections: [
      {
        h: "Four-section output structure",
        p: [
          "Drop a PDF — textbook chapter, lecture slides, research paper, training material. The generator produces a structured note pack with four sections:",
        ],
        list: {
          items: [
            { b: "Overview.", t: "2-3 paragraph orientation: what the source covers, why it matters, what the reader should expect to learn. The opening frame for revision — read this first to anchor the rest." },
            { b: "Key Concepts.", t: "Bulleted list of the foundational ideas the source introduces. Each concept named explicitly so the reader has a checklist of what's worth knowing. Useful both as a pre-read overview and as a post-read completeness check." },
            { b: "Detailed Notes (concept-by-concept).", t: "The bulk of the output. Each concept gets a focused section with definition, key claims, examples, and a \"Remember:\" takeaway at the end. The takeaways are explicit retrievable claims for revision." },
            { b: "Self-Check Questions.", t: "4-6 short-answer questions for active-recall testing. No answer key — the point is to test yourself, then re-read the corresponding section to verify. Forces engagement with the material rather than passive re-reading." },
          ],
        },
      },
      {
        h: "Why active recall beats passive re-reading",
        p: [
          "Three patterns from educational research worth knowing:",
        ],
        list: {
          items: [
            { b: "Retrieval practice strengthens retention.", t: "Testing yourself on material — even without correctness feedback — significantly improves long-term retention compared to re-reading. The Self-Check Questions section operationalizes this." },
            { b: "Spaced retrieval beats massed practice.", t: "Quizzing yourself over multiple sessions retains better than cramming. Study notes structured for retrieval (vs notes structured as paragraph summaries) enable this naturally — the self-check questions are reusable across sessions." },
            { b: "Production beats recognition.", t: "Generating an answer (from a question) retains better than recognizing the right answer (from multiple choice). Self-check questions are short-answer (production) by design; quiz format (recognition) is a separate tool for a different use." },
          ],
        },
      },
      {
        h: "Study Notes vs adjacent tools",
        p: [
          "Four adjacent AI tools, each with different study uses:",
        ],
        list: {
          items: [
            { b: "Study Notes (this tool, 8 credits).", t: "Long structured output for revision. Use when preparing comprehensive material from a chapter or paper." },
            { b: "Key Points (3 credits).", t: "Bullet list with citations. Use when you want the substantive claims surfaced but not the surrounding pedagogical structure." },
            { b: "Flashcards (10 credits).", t: "10-30 Q/A pairs for spaced-repetition apps. Use alongside Study Notes for retrieval-practice across sessions." },
            { b: "Quiz (10 credits).", t: "6-12 MCQs with answer key + explanations. Use for self-assessment or classroom delivery." },
          ],
        },
      },
      {
        h: "Three workflows where study notes earn their place",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Exam preparation.", t: "Generate study notes for each chapter / topic in your syllabus. The structured format gives you a single document per topic that you can return to across multiple revision sessions." },
            { b: "Teacher / tutor revision packs.", t: "Build student-facing revision material from a textbook or lecture. The notes structure mirrors what most curriculum designers ask for — concept-by-concept with takeaways and self-check." },
            { b: "Self-learning long-form content.", t: "Reading a long textbook or paper end-to-end is hard to retain. Generate study notes per chapter; use the notes as your working scaffold while reading; revisit the self-check questions weeks later." },
          ],
        },
      },
      {
        h: "How accuracy is preserved",
        p: [
          "Three guardrails:",
        ],
        list: {
          items: [
            { b: "Source-grounded.", t: "Every claim in the notes traces to a claim in the source. The model is explicitly constrained against inventing facts. Page citations in the notes link to the source pages where the claim came from." },
            { b: "Analogies allowed, only for clarity.", t: "The notes use analogies and examples to explain abstract concepts (\"think of a function like a recipe that takes inputs and produces outputs\"). Analogies are flagged as analogies; they don't change the underlying factual claims." },
            { b: "No invented dates / numbers / names.", t: "If the source provides specific dates, numbers, or names, the notes preserve them verbatim. If the source doesn't, the notes don't invent placeholders." },
          ],
        },
      },
      {
        h: "What this tool doesn't do",
        p: [
          "Three deliberate non-features:",
        ],
        list: {
          items: [
            { b: "No answer key on self-check.", t: "The questions are intentionally without answer keys — answering forces you to go back to the relevant Detailed Notes section, which is itself a productive retrieval-practice step." },
            { b: "No spaced-repetition scheduling.", t: "For SRS scheduling, pair with Flashcards (which outputs Anki-compatible JSON) and run from a real SRS app. The Study Notes are the conceptual scaffold; Flashcards are the spaced-recall engine." },
            { b: "No curriculum-specific adaptation in v1.", t: "The notes are generic-academic. Vertical curriculum-specific variants (NCERT class-wise, IB syllabus-aligned, AP curriculum) are on the roadmap." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Study Notes charges 8 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is structured Markdown with the four-section layout.",
          "Common pairings: Study Notes + Flashcards for revision + spaced retrieval. Study Notes + Mind Map for hierarchical overview alongside detailed concept notes. Study Notes + Quiz for the full study + assessment cycle.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-quiz — MCQ assessment AI
  // ============================================================
  "pdf-to-quiz": {
    title: "PDF to Quiz — multiple-choice questions with answer keys and why distractor quality matters",
    intro:
      "Multiple-choice questions are the most-used assessment format in education and training. They're scalable, gradable in seconds, and (when designed well) test real understanding rather than memorization. The challenge is that bad MCQs — questions with obvious right answers or trivially-wrong distractors — fail at exactly the testing they're supposed to do. PDF to Quiz generates 6-12 questions with carefully-designed distractors plus explanations for each answer. Here is what the generator produces, the difficulty mix that beats single-level quizzes, and the three workflows where machine-generated quizzes save real teaching time.",
    sections: [
      {
        h: "What the generator produces",
        p: [
          "Drop a source PDF — textbook chapter, training material, product documentation, lecture notes. The generator extracts the key concepts and produces 6-12 multiple-choice questions. Each question has four answer options: one correct, three plausible distractors. Every question carries a brief explanation of why the correct answer is right (and, where useful, why specific distractors are wrong).",
          "Output is structured for both self-assessment use (in-tool quiz interface with answer reveal) and for LMS integration (JSON export). The JSON format includes question text, four options, correct-option marker, explanation, and difficulty level — fields that most learning management systems map cleanly to their question banks.",
        ],
      },
      {
        h: "Why distractor design matters",
        p: [
          "An MCQ is only as good as its wrong answers. Three patterns that distinguish good distractors from bad:",
        ],
        list: {
          items: [
            { b: "Plausible but wrong.", t: "Good distractors are wrong but in a way that's tempting to someone who hasn't fully grasped the concept. \"Common misunderstandings\" make excellent distractors. The generator favors these over trivially-wrong options." },
            { b: "Similar length and structure.", t: "If three options are short and one is long (or three are technical and one is colloquial), the long/colloquial one stands out as either the obvious answer or the obvious wrong answer. The generator keeps options structurally similar so the test is about content, not pattern recognition." },
            { b: "Same conceptual domain.", t: "Distractors should come from the same conceptual category as the correct answer. Asking \"what year did X happen?\" with one date option and three colors doesn't test understanding. The generator picks distractors that share the answer's domain." },
          ],
        },
      },
      {
        h: "Difficulty mix that beats single-level",
        p: [
          "The generator produces a mix of difficulties: roughly 40% easy / 40% medium / 20% hard. Three reasons this matters more than \"all hard\" or \"all easy\":",
        ],
        list: {
          items: [
            { b: "Easy questions verify baseline.", t: "Test-takers who can't answer the easy questions don't have the foundation for harder ones. Easy questions surface foundational gaps quickly." },
            { b: "Medium questions test application.", t: "The bulk of the quiz tests whether the test-taker can apply concepts in moderately-varied contexts — the most useful skill check." },
            { b: "Hard questions reward depth.", t: "Hard questions distinguish students who have deep understanding from those who have surface comprehension. The 20% allocation keeps them as challenge questions without making the quiz inappropriately hard overall." },
          ],
        },
      },
      {
        h: "Three workflows where quizzes save teaching time",
        p: [
          "Cases where the time-savings justify the generation:",
        ],
        list: {
          items: [
            { b: "Classroom assessment.", t: "Teachers building quizzes for after-class assessment. Generating 12 questions from a chapter takes 30 seconds; writing them manually takes 30 minutes. Multiply across many chapters across many classes; the savings compound." },
            { b: "Employee training assessment.", t: "Compliance training, product training, onboarding modules — all benefit from assessment quizzes. Generate from the training PDF; deploy via LMS." },
            { b: "Self-assessment for learners.", t: "Students preparing for exams can generate practice quizzes from their textbook. Active testing reveals weak areas more efficiently than re-reading." },
          ],
        },
      },
      {
        h: "Quiz vs Flashcards — different testing modes",
        p: [
          "Two AI tools for two different testing approaches:",
        ],
        list: {
          items: [
            { b: "Quiz — recognition testing.", t: "MCQ format. Test-taker recognizes the correct answer among options. Less retention-strengthening than recall but faster to grade and easier to scale to large groups." },
            { b: "Flashcards — recall testing.", t: "Open Q/A pairs. Test-taker produces the answer from memory before flipping the card. Stronger retention benefit per item but slower and not directly gradable." },
            { b: "Use both.", t: "Generate flashcards for self-study (recall-based practice) and quizzes for assessment (recognition-based grading). The two together cover the full testing spectrum." },
          ],
        },
      },
      {
        h: "Where the generator falls short",
        p: [
          "Three edge cases worth knowing:",
        ],
        list: {
          items: [
            { b: "Highly nuanced concepts produce ambiguous distractors.", t: "When the source content involves subtle distinctions (legal definitions where one word changes meaning, fine-grained scientific classifications), the generator sometimes produces distractors that are debatably correct. Always sanity-check before high-stakes use." },
            { b: "Math-heavy content.", t: "Mathematical formulas in the quiz render as plain text rather than typeset equations. For math-heavy testing, supplement with LaTeX rendering in the destination system." },
            { b: "Source-PDF biases propagate.", t: "If the source has factual errors, the quiz tests those errors as correct. Verify source accuracy before generating quizzes from it." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Quiz charges 10 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is the structured MCQ list (in-tool interactive view plus JSON download for LMS).",
          "Common pairings: Quiz + Study Notes for the full study-then-assess workflow. Quiz + Flashcards for both recognition and recall testing. SCORM / xAPI / QTI export are on the roadmap; for now JSON is the universal interchange.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-social-thread — multi-platform social AI
  // ============================================================
  "pdf-to-social-thread": {
    title: "PDF to social thread — LinkedIn and X-ready numbered threads without the cringe",
    intro:
      "Threads on LinkedIn and X have become a primary distribution channel for long-form content. The pattern is reliable: a hook post promises an idea, numbered follow-up posts deliver it, a close summarizes. But most AI-generated threads land badly — emoji-stuffed, hashtag-cluttered, written in an artificially-punchy voice that signals \"this is AI-generated\" before the third post. PDF to Social Thread is calibrated against the common cringe failure modes. Here is what it produces, the patterns it deliberately suppresses, and the three workflows where machine-generated thread drafts beat human-written ones.",
    sections: [
      {
        h: "What the generator produces",
        p: [
          "Drop a source PDF — whitepaper, report, research paper, case study. The generator restructures the content into a numbered thread of 5-10 posts. Each post is roughly 240 characters — under X's historical character cap and well under LinkedIn's. The structure follows the canonical thread shape: opening post is a specific hook (a claim, a number, a question pulled from the source — not a generic tease), middle posts are one-idea-per-post, closing post offers the takeaway and CTA.",
          "Output is Markdown with each post numbered. Copy each post into LinkedIn or X individually, or paste the whole Markdown into a thread scheduler (Buffer, Hypefury, Typefully). Each post stands alone enough to be retweeted / reshared independently — important for thread distribution dynamics.",
        ],
      },
      {
        h: "What the generator deliberately suppresses",
        p: [
          "Three categories the generator filters out because they signal AI-generated content:",
        ],
        list: {
          items: [
            { b: "Emojis.", t: "AI-generated threads are infamous for opening with 🚨 or 🧵 or 📊. The generator suppresses these entirely. If your audience expects emojis, add them yourself; the absence is intentional for the baseline." },
            { b: "Hashtags.", t: "Same reasoning. Mid-2010s thread style stuffed hashtags into every post; modern B2B thread style largely doesn't. The generator follows current convention." },
            { b: "Click-bait hooks.", t: "\"You won't believe what we found in this report.\" \"This one fact will change everything.\" Generic-tease hooks underperform specific-content hooks. The generator forces specificity — the hook is a claim or number FROM the source, not a tease about what the source contains." },
            { b: "Artificially-punchy voice.", t: "The generator targets \"direct first-person-neutral\" tone — assertive but not breathless. Adapts to the source's actual register rather than imposing a forced-energetic voice." },
          ],
        },
      },
      {
        h: "Three workflows where machine-generated drafts beat human-written",
        p: [
          "Cases where the time savings compound:",
        ],
        list: {
          items: [
            { b: "Source-PDF promotion.", t: "Published a whitepaper or report. Need to drive engagement on social. The thread converts the source into a digestible promotional vehicle in 30 seconds. Manual conversion takes 30-60 minutes." },
            { b: "Long-form-to-thread distribution.", t: "Took the time to write a long-form blog post or paper. Generate the thread version to extend its reach into social. The thread surfaces the post's content to readers who would never click through to the long-form." },
            { b: "Editorial calendar fill.", t: "Building a content calendar for a B2B brand. Each long-form piece generates a thread; the threads fill the social calendar for the week. The two-tool workflow (long-form → thread) scales social presence proportionally to long-form output." },
          ],
        },
      },
      {
        h: "Three patterns for great post-generation editing",
        p: [
          "The generator produces a competent baseline. Three habits that lift the output:",
        ],
        list: {
          items: [
            { b: "Edit the hook hardest.", t: "The opening post is the single most important part of the thread — it decides who keeps reading. The generator's hook is decent but generic. Replace with audience-specific framing that connects to your followers' situation." },
            { b: "Add proof points and specifics.", t: "Where the thread says \"we found\" or \"research shows,\" add the specific number, source, or example from your data. AI-generated content reads generic unless you personalize." },
            { b: "Trim the close.", t: "The CTA at the end is often longer than it needs to be. Cut to a single sentence with a specific next step (link to the source, sign-up form, follow request). Avoid generic \"thanks for reading\" closes." },
          ],
        },
      },
      {
        h: "Distribution dynamics worth knowing",
        p: [
          "Three patterns that affect thread reach:",
        ],
        list: {
          items: [
            { b: "Each post should stand alone.", t: "Posts get retweeted / reshared as individual posts, not as threads. If a mid-thread post requires having read the opener to understand, it won't gain independent traction. The generator favors self-contained posts; verify in review." },
            { b: "First post drives thread distribution.", t: "Algorithmic distribution often promotes the opening post; subsequent posts ride along but with declining reach. Time spent on the opener has the highest leverage." },
            { b: "Engagement on the thread compounds reach.", t: "Replies, especially from the original poster, get the thread re-surfaced. Plan to engage in the comments after posting." },
          ],
        },
      },
      {
        h: "Thread vs Blog Post vs Newsletter",
        p: [
          "Three adjacent generators for different distribution shapes:",
        ],
        list: {
          items: [
            { b: "Social Thread — numbered platform-native posts.", t: "5-10 posts at ~240 chars each. LinkedIn / X. Optimized for scrolling consumption." },
            { b: "Blog Post — web article.", t: "Hook + sections + close. 800-1500 words. SEO + reader-on-website consumption." },
            { b: "Newsletter — email digest.", t: "Subject + preheader + sections + sign-off. 300-800 words. Inbox + ESP consumption." },
            { b: "Run all three.", t: "Coordinated multi-channel distribution from one source PDF. Each channel reaches a different audience segment; together they multiply reach without proportional content-creation time." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Social Thread charges 5 credits per document. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is Markdown with numbered posts.",
          "Common pairings: Social Thread + Blog Post + Newsletter for full multi-channel distribution. Thread → manual edit pass for audience-specific framing. Thread → Hypefury / Buffer / Typefully scheduling for cross-platform delivery.",
        ],
      },
    ],
  },

  // ============================================================
  // pdf-to-video-script — video-shape AI
  // ============================================================
  "pdf-to-video-script": {
    title: "PDF to Video Script — talking-head scripts calibrated for YouTube retention curves",
    intro:
      "Video has become the dominant content medium for educational and explainer content. The friction has always been the script: writing a 5-8 minute talking-head script takes hours; the hook has to grab attention in 5-10 seconds; segments have to maintain engagement against YouTube's well-documented retention drop-off; the close has to drive specific action. PDF to Video Script handles all of that. Here is what the generator produces, why it targets specific retention-curve patterns, and the three workflows where machine-generated video scripts beat working from a manually-drafted outline.",
    sections: [
      {
        h: "What the generator produces",
        p: [
          "Drop a source PDF — research paper, product spec, talk transcript, educational material, policy doc. The generator restructures the content into a talking-head video script with four structural elements: HOOK (5-10 second attention-grab calibrated for the first-second drop-off), SEGMENTS (90-second blocks matching the canonical YouTube retention-curve dwell time), STAGE CUES (\"[show the chart]\", \"[cut to graphic of X]\" bracket markers for B-roll and visual overlays), CLOSING CTA (a specific next action — subscribe / link in description / specific URL).",
          "Output is Markdown with the four elements explicitly labeled. Total length targets a 5-8 minute video — roughly 750-1200 words spoken at average pace. Stage cues are bracket-format so they're easy to spot when recording (read past them; they're cues for editing, not lines to deliver).",
        ],
      },
      {
        h: "Why YouTube retention curves matter",
        p: [
          "YouTube's algorithm promotes videos that retain viewers. Three retention patterns the script targets:",
        ],
        list: {
          items: [
            { b: "First-second drop-off.", t: "Most viewers decide whether to keep watching in the first 5-10 seconds. The HOOK section is calibrated for this — content-anchored, specific, immediately interesting. \"Today I'll explain X\" is weak; \"Most people are wrong about X — here's why\" is stronger." },
            { b: "Mid-video segment fatigue.", t: "Viewer attention drops at consistent intervals (~90 seconds in most retention data). The 90-second SEGMENTS structure introduces a re-engagement beat at each interval — a hard transition, a surprising claim, a visual change cued for the editor." },
            { b: "End-of-video drop-off.", t: "Viewers who reach the end of a video are the highest-intent audience. The CLOSING CTA targets them specifically with the next-action ask. \"If you found this useful, here's where to go next.\"" },
          ],
        },
      },
      {
        h: "Stage cues and B-roll",
        p: [
          "The bracket-format cues are designed for editor handoff. Three things they communicate:",
        ],
        list: {
          items: [
            { b: "Where visual emphasis should appear.", t: "\"[show the Q3 revenue chart]\" tells the editor to cut to that specific visual at that moment. The script writer doesn't need to detail the visual — just where the cut happens." },
            { b: "What kind of visual fits.", t: "\"[cut to graphic of X]\" leaves graphic style to the editor but specifies the subject. \"[show me holding the report]\" is a different kind of cue — physical staging. The bracket content tells the editor which decision to make." },
            { b: "Where pacing should slow or speed.", t: "Stage cues often correspond to pauses (\"[pause for emphasis after this claim]\") or transitions (\"[hard cut to next segment]\"). Recording with the cues in front lets the talent deliver the pacing the editor needs." },
          ],
        },
      },
      {
        h: "Three workflows where machine-generated beats outline-based",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Source-PDF explainer video.", t: "Published a research paper, whitepaper, or technical doc. Want a video explaining it. The script converts the source into a recordable script in 60 seconds. Manual scripting from an outline takes hours." },
            { b: "Educational-content batch production.", t: "Producing videos for a curriculum or course. Each lesson PDF generates a script. The two-tool workflow (write the lesson PDF, generate the script) scales video production proportional to lesson output." },
            { b: "Thought-leadership video pipeline.", t: "Long-form content (research, analysis, opinion pieces) gets converted into video commentary. Script generation accelerates the conversion; the creator's voice comes through via the editing pass." },
          ],
        },
      },
      {
        h: "What to edit before recording",
        p: [
          "Three habits for going from generated script to recorded video:",
        ],
        list: {
          items: [
            { b: "Read aloud first.", t: "Spoken language reads differently from written. Sentences that look fine on the page sometimes feel awkward when spoken. Read the whole script aloud once before recording; mark words you stumble on; rewrite those." },
            { b: "Personalize the hook.", t: "The generator's hook is competent but generic. Add a specific connection to your audience's situation, a personal anecdote, or a strong opening line that reflects your voice." },
            { b: "Trim if it runs long.", t: "Average speaking pace is ~150 words per minute. A 1200-word script is ~8 minutes spoken. If you're a slower speaker, trim 10-15% to land in your target time." },
          ],
        },
      },
      {
        h: "Format and length",
        p: [
          "Three length contexts:",
        ],
        list: {
          items: [
            { b: "5-8 minute video (default).", t: "Most educational and explainer videos. The 90-second segment structure produces 4-5 segments. Most-common length for YouTube videos that maintain retention well." },
            { b: "30-60 second short (Reels / TikTok).", t: "The default output is too long. Take the HOOK + the first SEGMENT only; trim heavily. Explicit short-form generation is on the roadmap." },
            { b: "15-30 minute long-form.", t: "The default output is too short. Generate from a longer source; expand each segment to multiple 90-second blocks. Or supplement with manual extensions on key concepts." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "PDF to Video Script charges 3 credits per script. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during generation and is never persisted. Output is Markdown with HOOK / SEGMENTS (timestamped) / STAGE CUES / CTA labeling.",
          "Common pairings: Video Script + Blog Post for video + companion-article distribution. Video Script + Social Thread for short-form clip teasers. Video Script + Mind Map when planning a multi-video series — the mind map shows the topic structure, individual video scripts cover each branch.",
        ],
      },
    ],
  },

  // ============================================================
  // resume-parser — recruiter-side AI
  // ============================================================
  "resume-parser": {
    title: "Resume Parser — bulk PDF resumes to structured data for recruiters",
    intro:
      "On the candidate side, resumes are PDFs because PDFs look good and travel reliably across systems. On the recruiter side, that same PDF is a problem — every resume has the same fields (name, contact, experience, skills, education) but in different layouts, fonts, and column structures, making manual data entry slow and error-prone. The resume parser turns that PDF stack into structured CSV or JSON ready for ATS ingestion. Here is what gets extracted, the four field-recognition challenges specific to Indian resumes, and the privacy considerations for handling candidate data.",
    sections: [
      {
        h: "What gets extracted",
        p: [
          "Drop a resume PDF. The parser identifies and extracts four structured field groups:",
        ],
        list: {
          items: [
            { b: "Personal info.", t: "Name, email, phone, location, optional LinkedIn / GitHub / portfolio URLs. Recognised regardless of layout — top-of-page header, side-column block, or inline contact line." },
            { b: "Experience.", t: "Per-company entry: company name, role, dates (parsed to ISO), achievement bullets. Multiple companies preserved in order. Most-recent-first convention honored." },
            { b: "Education.", t: "Per-institution entry: institute name, degree, dates, GPA / class if listed. Standard Indian conventions (B.Tech / M.Tech / MBA / B.Com etc.) recognized." },
            { b: "Skills.", t: "Skills section content parsed into a categorized list (technical / soft / language / certification). Free-form skills written in prose elsewhere in the resume sometimes also surface." },
          ],
        },
      },
      {
        h: "Four Indian-resume recognition challenges",
        p: [
          "Indian resumes have specific patterns the parser handles:",
        ],
        list: {
          items: [
            { b: "Indian phone-number formats.", t: "+91 prefix, 10-digit mobile, sometimes with dashes or spaces. STD codes for landlines (e.g. 022 for Mumbai, 080 for Bangalore). The parser recognizes all standard variations." },
            { b: "Indian education-system terminology.", t: "Class X, Class XII, percentage notation (\"81%\"), CGPA / SGPA, ICAI / CA / CFA professional designations, AICTE / UGC accreditation references. Standard Indian academic conventions preserved without normalization." },
            { b: "Multi-column or sidebar layouts.", t: "Many modern Indian resume templates use a sidebar for contact + skills + education with the main column for experience. The parser handles multi-column layouts; some ATS-targeted resumes deliberately use single-column for parseability. Either works." },
            { b: "Date format variations.", t: "Mar 2019, March 2019, 03/2019, Mar'19, 2019-Present, 03/2019 - Present — all common in Indian resumes. The parser normalizes to ISO (YYYY-MM) internally; output preserves original format if you want it." },
          ],
        },
      },
      {
        h: "Three workflows where bulk parsing pays off",
        p: [
          "Cases where automation saves real recruiting time:",
        ],
        list: {
          items: [
            { b: "JD-to-shortlist pipeline.", t: "Receive 50 resumes for a single JD. Parse all 50 to JSON; load to a spreadsheet; filter by required-skill columns; surface the top-10 candidates. The parsing + filtering takes minutes; manual screening takes hours." },
            { b: "ATS ingestion.", t: "Your ATS expects structured data. Parsing resumes into CSV that maps to the ATS's import format converts inbound resumes into ATS records automatically. Most major ATS (Workday, Greenhouse, Lever, Naukri's recruiter side, iCIMS) accept structured CSV import." },
            { b: "Candidate-database building.", t: "Building a long-term candidate database for future searches. Parse each resume that comes in; accumulate in the database. When a future role opens, query the database against the role's requirements." },
          ],
        },
      },
      {
        h: "Limitations worth knowing",
        p: [
          "Three patterns where parsing accuracy degrades:",
        ],
        list: {
          items: [
            { b: "Scanned resumes without OCR.", t: "If the resume is a scanned image without a text layer, the parser can't extract fields. Run AI · OCR first to add a text layer, then re-parse." },
            { b: "Design-heavy creative resumes.", t: "Resumes with elaborate visual design (sidebars with charts, custom typography, ASCII-art separators) sometimes parse with field misattribution. Most candidates submitting to professional roles use cleaner formats; design-heavy ones are mostly from designer / creative-industry roles where the visual is itself a portfolio sample." },
            { b: "Multi-page resumes with non-sequential content.", t: "Most resumes are 1-2 pages; some senior-role resumes run 3-4 pages with publications, references, etc. The parser handles multi-page but accuracy is highest on the standard 1-2 page format." },
          ],
        },
      },
      {
        h: "Privacy of candidate data",
        p: [
          "Three habits when handling parsed resume data:",
        ],
        list: {
          items: [
            { b: "60-minute default retention.", t: "Uploaded PDFs are deleted within 60 minutes of processing. The structured JSON / CSV is generated and downloaded; the PDF doesn't persist on our servers. Important for compliance with candidate-data-protection norms." },
            { b: "Pro tier for longer retention.", t: "Recruiters who need 30-day history (to track applications across a sourcing campaign) should use the Pro tier, which has an audit log of who accessed which candidate's data when. Important for GDPR / DPDP Act compliance." },
            { b: "PII handling downstream.", t: "Once you've parsed the resume and have the structured data, the destination system (ATS / database / spreadsheet) inherits the data-protection obligations. PAN / Aadhaar / similar government IDs in resumes should be redacted before bulk distribution; use AI Redact for that." },
          ],
        },
      },
      {
        h: "Resume Parser vs ATS Resume Optimizer vs JD Match",
        p: [
          "Three adjacent tools used at different points in the recruiting funnel:",
        ],
        list: {
          items: [
            { b: "Resume Parser (this tool — recruiter side).", t: "Convert inbound resumes to structured data for ingestion. Recruiter-facing." },
            { b: "ATS Resume Optimizer (candidate side).", t: "Audit a candidate's resume for ATS parseability + keyword coverage before submitting. Candidate-facing." },
            { b: "JD Match (both sides).", t: "Score a resume against a JD. Recruiter uses for shortlisting; candidate uses for tuning before applying." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Resume Parser charges 5 credits per resume. Single-resume processing in v1; bulk-upload (multiple files at once or zip) is on the roadmap. The tool handles PDFs up to 25 MB. Output is CSV or JSON.",
          "Common pairings: Resume Parser + JD Match for the parse + score recruiting workflow. Resume Parser → ATS CSV import for system ingestion. Resume Parser + AI Redact for candidate-PII handling on distributed data.",
        ],
      },
    ],
  },

  // ============================================================
  // resume-job-match — fit-scoring AI
  // ============================================================
  "resume-job-match": {
    title: "Resume ↔ Job Description Matcher — fit scoring with per-requirement alignment and ATS keyword audit",
    intro:
      "\"Should I apply for this role?\" is the question every candidate asks at every job opening. The Resume-JD matcher answers it with a fit score 0-100, a requirement-by-requirement alignment table, and an explicit list of missing keywords that ATS systems will use to filter at the application stage. The score is a ballpark; the per-requirement table is what's actually actionable. Here is how the score is computed, the three score ranges that translate to decision recommendations, and the workflow patterns that make this useful even when the score isn't conclusive.",
    sections: [
      {
        h: "How fit scoring works",
        p: [
          "The matcher reads both inputs: your resume PDF and the JD text you paste. It identifies the JD's explicit requirements (years of experience, specific tools, certifications, domain experience), implicit skills (skills the JD implies are needed but doesn't list explicitly), seniority signals (title alignment, scope of responsibility), and domain keywords (industry-specific terminology). Then it scores your resume against each dimension.",
          "The final score is a weighted combination: 50% explicit requirements (the JD's stated must-haves), 25% inferred skills (what the JD implies you need), 15% seniority/title alignment (match between your past titles and the target role's level), 10% domain keywords (industry-specific terminology overlap).",
        ],
      },
      {
        h: "Three score ranges and what they mean",
        p: [
          "The score-to-decision mapping:",
        ],
        list: {
          items: [
            { b: "80-100 — strong fit, apply.", t: "Most explicit requirements met; the resume shows the relevant experience. Apply with confidence. Tune the cover letter to match the JD's specific concerns; the bulk of the alignment work is done." },
            { b: "65-80 — partial fit, apply with tailoring.", t: "Some explicit requirements met but gaps exist. Worth applying with a tailored cover letter that explicitly addresses the gaps. The cover letter does the work the resume can't — explaining transferable experience or willingness to grow into specific gaps." },
            { b: "Below 65 — significant gap, reconsider.", t: "Substantial gaps in either requirements, seniority, or domain. Sometimes worth applying anyway (mid-career pivot, networking-driven opening) but the base rate of success is low. Consider whether the gaps close easily (add a line to the resume) or require real experience (skip and target roles where the fit is stronger)." },
          ],
        },
      },
      {
        h: "The per-requirement table is what's actually actionable",
        p: [
          "The score is a number; the table is the work. Three things the per-requirement table surfaces:",
        ],
        list: {
          items: [
            { b: "Met requirements with evidence.", t: "Each JD requirement matched to specific resume content. \"5+ years Python experience required\" → \"Resume shows 6 years across companies X and Y.\" Confirms the strength so the cover letter can reinforce it rather than re-state it." },
            { b: "Partially-met requirements.", t: "JD requires X, resume shows X-adjacent. \"5+ years Python\" → \"Resume shows 3 years Python + 4 years Ruby.\" The cover letter has an opportunity to bridge — explain how Ruby experience transfers, mention recent Python upskilling, etc." },
            { b: "Unmet requirements.", t: "JD requires X, resume shows nothing matching. Hard gaps. The cover letter has to either acknowledge or work around. Some gaps are dealbreakers; others are negotiable. The table makes the gaps explicit so you can decide." },
          ],
        },
      },
      {
        h: "Missing ATS keywords — the filter that blocks you before recruiter review",
        p: [
          "Most large companies filter applications through an ATS before any human review. ATS filters search for specific keywords from the JD. Missing keywords = filtered out before recruiter sees the resume.",
          "The matcher surfaces JD-critical terms (tools, certifications, acronyms, domain terms) and flags which ones are absent from the resume. Three patterns:",
        ],
        list: {
          items: [
            { b: "Add keywords you ALREADY HAVE experience with.", t: "If the JD mentions \"AWS\" and your resume says \"deployed services on Amazon Web Services,\" you have the experience but ATS is looking for the exact term. Add \"AWS\" explicitly." },
            { b: "Don't add keywords you don't have experience with.", t: "Stuffing keywords with no underlying experience trips ATS keyword-density flags AND fails at recruiter review. Honest tuning only." },
            { b: "Match terminology to the JD exactly.", t: "If the JD says \"Postgres\" and your resume says \"PostgreSQL,\" ATS may not match them. Match the JD's spelling unless your resume serves many different roles with different conventions." },
          ],
        },
      },
      {
        h: "Three workflows where the matcher earns its place",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Pre-application decision.", t: "Decide whether a specific role is worth applying to before investing time in a tailored cover letter. Score above 65: yes. Below: probably not." },
            { b: "Cover-letter tailoring.", t: "Once you've decided to apply, the per-requirement table tells you what the cover letter needs to address. Specifically the partially-met and unmet rows — those are what the cover letter is for." },
            { b: "Resume tuning for a specific role.", t: "Where the resume has experience that matches the JD but doesn't surface it explicitly, tune the resume's bullet points to use the JD's terminology. Run the matcher again to confirm the tuning improved the score." },
          ],
        },
      },
      {
        h: "What the score isn't",
        p: [
          "Three limits worth knowing:",
        ],
        list: {
          items: [
            { b: "Not a hiring decision.", t: "An 85 doesn't guarantee an interview; a 60 doesn't guarantee rejection. Hiring includes factors the matcher can't see (referral connections, hiring-manager preference, company-specific signals)." },
            { b: "Not a substitute for understanding the role.", t: "The matcher reads the JD literally. If the JD has hidden expectations not stated in writing (common in less-explicit job descriptions), the score reflects the explicit JD only. Talk to recruiters or current employees for the implicit picture." },
            { b: "Not predictive of your performance in the role.", t: "Fit-to-JD ≠ fit-to-actual-job. The JD is the recruiter's compressed best-guess of what's needed; the actual role has more nuance. The score predicts \"likely to pass screening,\" not \"likely to succeed.\"" },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Resume ↔ JD Matcher charges 5 credits per match. The tool handles resume PDFs up to 25 MB and JD text of any reasonable length. Processing runs on our servers; the resume and JD are in memory only during analysis and are never persisted by default. Pro tier offers 30-day history for tracking multiple JDs.",
          "Common pairings: ATS Resume Optimizer first (verify resume parseability), then JD Match (verify role fit), then Cover Letter Generator (produce the tailored letter). The three together cover the full pre-application workflow.",
        ],
      },
    ],
  },

  // ============================================================
  // research-paper-summarizer — academic-research AI
  // ============================================================
  "research-paper-summarizer": {
    title: "Research Paper Summarizer — citation, methods, results, limitations with numeric magnitudes preserved",
    intro:
      "Academic research papers follow a predictable structure — abstract, introduction, methods, results, discussion, conclusion — but reading them well takes time most readers don't have. The summarizer surfaces the load-bearing elements: citation (APA + BibTeX ready to copy), research question, methods, key results with magnitudes preserved verbatim, and limitations (both the authors' and the ones implied by the methods choices). Here is what the summarizer extracts, why numeric magnitude preservation is the highest-stakes part of the output, and the three workflows where research-paper summaries earn their place.",
    sections: [
      {
        h: "What the summarizer extracts",
        p: [
          "Drop a research-paper PDF. The summarizer produces a structured output with seven elements:",
        ],
        list: {
          items: [
            { b: "Citation (APA + BibTeX).", t: "Paste-ready citation in both formats. APA for in-text and reference-list use; BibTeX for LaTeX and reference-manager import. Identical content, two formats." },
            { b: "Research question.", t: "What the paper is trying to answer. Phrased as a single sentence. Sometimes explicit in the abstract; sometimes inferred from the introduction." },
            { b: "Methods.", t: "Study design, sample size, sample characteristics, data collection, key analyses. Concise paragraph — enough to assess whether the methods support the conclusions." },
            { b: "Key results.", t: "The substantive findings. Effect sizes, p-values, confidence intervals quoted verbatim from the paper. Comparisons and trends summarized in prose around the verbatim numbers." },
            { b: "Authors' limitations.", t: "What the authors themselves acknowledge as limits of their study. Quoted from the limitations paragraph where it exists." },
            { b: "Implied limitations.", t: "Limitations the authors didn't acknowledge but the methods choices imply. Surface what a peer reviewer would catch but the paper itself doesn't mention." },
            { b: "Related-reading recommendations.", t: "3-5 references from the paper's own bibliography that look most central to the paper's argument. Read these for the paper's intellectual lineage." },
          ],
        },
      },
      {
        h: "Why numeric magnitude preservation matters most",
        p: [
          "The single highest-stakes part of any research-paper summary is the numbers. Three patterns:",
        ],
        list: {
          items: [
            { b: "Effect sizes verbatim.", t: "If the paper reports \"the intervention reduced symptoms by 12.3% (95% CI: 8.4-16.2)\" the summary preserves all three numbers exactly. Rounding to \"about 12%\" loses the confidence-interval information; rounding to \"effective\" loses the magnitude entirely." },
            { b: "p-values verbatim.", t: "p < 0.001 means something different from p = 0.04. Both can be \"statistically significant\" but the second is much weaker evidence. The summary preserves the exact value." },
            { b: "Sample sizes verbatim.", t: "n = 23 vs n = 2,300 is a 100x difference in evidence weight. \"Small sample\" vs \"large sample\" loses information. The summary preserves the exact n." },
          ],
        },
      },
      {
        h: "Surfacing implied limitations",
        p: [
          "The implied-limitations section is the most distinctive feature of the summarizer. Four patterns the summarizer commonly catches:",
        ],
        list: {
          items: [
            { b: "Small N for the conclusion drawn.", t: "Paper claims a population-level effect from an n=30 study. The sample size doesn't support the claim's scope; the summarizer flags this." },
            { b: "Lack of placebo or control.", t: "Intervention paper with no control group. Even strong results can't distinguish intervention effect from natural variation; the summarizer surfaces the design gap." },
            { b: "Single-site or single-population sample.", t: "Paper claiming generalization from one specific population (one hospital, one country, one demographic). The summarizer notes the external-validity limit." },
            { b: "Observational design supporting causal claim.", t: "Correlational data used to argue causation. The summarizer notes when the conclusions are stronger than the design supports." },
          ],
        },
      },
      {
        h: "Three workflows where the summarizer earns its place",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Literature review research.", t: "Building a literature review means reading dozens to hundreds of papers. The summarizer's verbatim numbers and methods overview let you decide which papers to read in full vs cite from summary. The BibTeX + APA outputs go directly into your reference manager." },
            { b: "Journalism / science writing.", t: "Writing about a recent paper for a non-specialist audience. The summarizer surfaces the numbers you need to quote accurately and the implied limitations that the popular-press version often glosses over." },
            { b: "Self-education on a new field.", t: "Reading into a field you're new to. The summarizer's structured output makes each paper digestible; the related-reading section threads the intellectual lineage so you can follow the field's evolution." },
          ],
        },
      },
      {
        h: "When to read the full paper anyway",
        p: [
          "Three signals you should still read the original:",
        ],
        list: {
          items: [
            { b: "You'll cite specific claims.", t: "If you're going to cite the paper in your own work, read the original. The summary is your map; the citation is the source." },
            { b: "The methods are central to your interest.", t: "If you're going to replicate or extend the methods, the methods section needs full reading. The summary identifies that you should; full execution depends on the original." },
            { b: "The implied limitations seem off.", t: "If the summarizer's implied limitations don't match your domain knowledge, read the original to verify. AI inference of limits is reliable on standard patterns but doesn't catch field-specific subtleties every time." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Research Paper Summarizer charges 15 credits per paper. The tool handles PDFs up to 25 MB. Processing runs on our servers; the document is in memory only during analysis and is never persisted. Output is structured Markdown with the seven sections.",
          "Common pairings: Research-Paper Summarizer + Citations Extractor for the references-list integration. Research-Paper Summarizer + AI Chat for follow-up questions on specific findings. Research-Paper Summarizer + Mind Map for structural overview when planning literature-review organization.",
        ],
      },
    ],
  },

  // ============================================================
  // semantic-search-pdf — meaning-based search AI
  // ============================================================
  "semantic-search-pdf": {
    title: "Semantic Search in PDF — finding passages by meaning, not by keyword match",
    intro:
      "Ctrl-F finds exact lexical matches. Search for \"dog\" and you find every instance of \"dog\" — but not \"canine,\" \"puppy,\" or \"the family pet.\" In long documents where the relevant passage uses different words from your query, lexical search fails silently. Semantic search retrieves by meaning, regardless of phrasing. Drop a PDF, ask a question in natural language, get back the verbatim passages most relevant to that question. Here is how vector retrieval works, the three workflows where semantic search dramatically beats keyword search, and the precise difference between this tool and Chat with PDF.",
    sections: [
      {
        h: "How semantic search retrieves by meaning",
        p: [
          "The tool extracts the PDF's text and breaks it into chunks (typically a few sentences each). Every chunk is embedded into a high-dimensional vector by a language model. The vector encodes the chunk's meaning — chunks with similar meaning end up close to each other in vector space, regardless of which specific words they use. When you ask a question, the question gets embedded the same way; the search finds chunks whose vectors are closest to the question's vector.",
          "This is fundamentally different from keyword search. Keyword search asks \"which chunks contain my query's words?\" Semantic search asks \"which chunks express ideas similar to my query?\" The retrieval works across vocabulary mismatches — your query and the source document don't have to use the same words to find each other.",
        ],
      },
      {
        h: "Three workflows where semantic beats lexical",
        p: [
          "Cases where the keyword-match approach fails and semantic search succeeds:",
        ],
        list: {
          items: [
            { b: "Cross-vocabulary research.", t: "Searching a technical paper for \"how the model handles X\" when the paper uses domain-specific terminology you don't know yet. Semantic search finds the passages by topic relevance; keyword search misses them because you don't know what words to query for." },
            { b: "Synonym-heavy domains.", t: "Medical documents use multiple words for the same concept (heart attack / myocardial infarction / MI / cardiac event). Legal documents do too (contract / agreement / accord / understanding). Semantic search treats these as related; keyword search makes you query for each one separately." },
            { b: "Conceptual questions about specific documents.", t: "\"What does the paper say about scaling?\" — the paper might address scaling under any of a dozen names (scalability, throughput, performance under load, capacity, growth handling). Semantic search retrieves any chunk relevant to the concept regardless of the specific word used." },
          ],
        },
      },
      {
        h: "Semantic Search vs Chat with PDF",
        p: [
          "Two adjacent AI tools with different output shapes:",
        ],
        list: {
          items: [
            { b: "Chat — synthesized answer.", t: "Asks the model to read the relevant passages and produce an ANSWER to your question. Output is the model's writing, paraphrased and synthesized. Useful when you want the answer; less useful when you need to read what the source actually said." },
            { b: "Semantic Search — verbatim passages.", t: "Returns the actual sentences from the source. Output is verbatim quotes with page citations. Useful when you need the source material with help finding it; you read the passages yourself." },
          ],
        },
      },
      {
        h: "Three signals that semantic search is the right tool",
        p: [
          "When to reach for this rather than Chat or Ctrl-F:",
        ],
        list: {
          items: [
            { b: "You want to read what the source says directly.", t: "Quotes, citation source-material, verbatim passages for academic work. Chat paraphrases; semantic search gives you the original words." },
            { b: "You don't know the source's specific vocabulary.", t: "Reading into a new field or a paper using domain terminology you haven't encountered. Semantic search finds the relevant passages by meaning; you learn the vocabulary by reading what comes back." },
            { b: "You need page citations for a downstream document.", t: "Building a research summary that requires citing specific pages. Semantic search returns page references with every retrieved passage; you can cite from the search output directly." },
          ],
        },
      },
      {
        h: "What the output looks like",
        p: [
          "Three components of every search result:",
        ],
        list: {
          items: [
            { b: "Question echoed back.", t: "The question you asked, displayed at the top of the output. Useful when reviewing search results later — context for what was being asked." },
            { b: "Top 3-5 verbatim passages.", t: "Each passage is the source's exact wording. No paraphrase. Page reference indicates where it came from. Relevance score (or rank order) tells you which passage is most likely to answer the question." },
            { b: "Per-passage relevance note.", t: "A brief note on why the passage matched the question. \"This passage addresses how the model handles increasing input sizes\" — useful when the connection between query and passage isn't immediately obvious from the words alone." },
          ],
        },
      },
      {
        h: "Multi-PDF search",
        p: [
          "The tool searches one PDF per call. Three patterns for multi-PDF search:",
        ],
        list: {
          items: [
            { b: "Run per-PDF then aggregate.", t: "Search the same question against each PDF in your corpus; aggregate top results across all of them. Manual but works for small corpora (~10 PDFs)." },
            { b: "Concatenate first.", t: "Merge all the PDFs into one (free Merge tool), then run semantic search. Works for medium corpora; the page references in the merged PDF map back to the source PDFs if you preserve the merge order." },
            { b: "Wait for multi-doc roadmap item.", t: "AI Chat in multi-doc mode is roadmapped and will support corpus-level semantic search. Until then, the per-PDF aggregation is the workaround." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Semantic Search PDF charges 3 credits per search. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during indexing and is never persisted. Output is Markdown with the question, 3-5 verbatim passages, page references, and relevance notes.",
          "Common pairings: Semantic Search → Chat for the verbatim-passage + synthesized-answer combination. Semantic Search → Citations Extractor if you need both the passages and the references they cite. Semantic Search + Key Points for both targeted search and comprehensive document overview.",
        ],
      },
    ],
  },

  // ============================================================
  // salary-slip-analyzer — Indian payroll AI
  // ============================================================
  "salary-slip-analyzer": {
    title: "Salary Slip Analyzer — Indian payslip parsed into structured JSON for YoY comparison",
    intro:
      "Indian salary slips are dense and idiosyncratic. Every employer uses slightly different component names — \"Special Allowance\" at one company is \"Performance Pay\" at another; \"HRA\" sometimes splits into multiple sub-components; deduction names vary by state and PSU vs private context. Manually comparing payslips across years or across employers means decoding each one fresh. The salary slip analyzer parses the slip into structured JSON while preserving the original component names verbatim, enabling accurate year-over-year and employer-to-employer comparison. Here is what gets extracted, why component-name preservation beats normalization, and how PII is handled in the output.",
    sections: [
      {
        h: "What the analyzer extracts",
        p: [
          "Drop a monthly salary slip PDF — any major Indian employer (IT services, finance, manufacturing, government, PSU). The analyzer extracts five structured groups:",
        ],
        list: {
          items: [
            { b: "Employer info.", t: "Company name, address (if shown), PAN / TAN if visible. Useful for matching slips to employer records." },
            { b: "Employee info.", t: "Name, employee ID, PAN (masked), UAN (truncated), department, designation. PII automatically masked in output." },
            { b: "Period.", t: "Pay period dates, payment date, working days, days worked, leaves taken. Useful for verifying salary calculations against attendance." },
            { b: "Earnings (per-component).", t: "Basic, HRA, Special Allowance, LTA, conveyance, medical, bonus, performance-pay, statutory bonus, and any employer-specific components. Each line item preserved with its original name." },
            { b: "Deductions (per-component).", t: "EPF (employee + employer share separately), PT (Professional Tax — varies by state), TDS, ESI if applicable, voluntary deductions (loan EMIs, insurance premiums, food/transport deductions). Each preserved separately." },
            { b: "Totals + YTD.", t: "Gross / Net for the slip period, plus year-to-date earnings, deductions, and tax-related totals where shown." },
          ],
        },
      },
      {
        h: "Why component-name preservation matters",
        p: [
          "The single most important design choice in the analyzer is verbatim component-name preservation. Three reasons it matters:",
        ],
        list: {
          items: [
            { b: "YoY comparison accuracy.", t: "If your slip shows \"Special Allowance\" for 3 years and you change employer, the new employer might call the same thing \"Performance Pay\" or \"Variable Pay.\" Normalizing both to \"Allowance\" loses the granularity needed to compare apples to apples. Verbatim preservation lets you map the components manually with full visibility." },
            { b: "Tax-treatment differences.", t: "Different earnings components have different tax treatments — HRA has rent-deduction allowance, LTA has trip-frequency rules, Special Allowance is fully taxable. Normalizing flattens these distinctions and breaks downstream tax calculations." },
            { b: "Negotiation context.", t: "When negotiating a raise or new offer, knowing how your existing employer structures your comp (Basic vs HRA vs Special) affects what to ask for. Normalized output to \"Allowance\" loses the structural information." },
          ],
        },
      },
      {
        h: "PII masking — what gets shown and what gets hidden",
        p: [
          "Indian salary slips contain personally-identifiable information. The analyzer masks PII in the output by default:",
        ],
        list: {
          items: [
            { b: "PAN masked as XXXXX1234X.", t: "First 5 characters masked, last 5 visible. Sufficient for matching across documents but not enough to enable identity theft." },
            { b: "UAN truncated to last 4 digits.", t: "Universal Account Number for EPF. Last 4 digits shown for verification; first 8 masked." },
            { b: "Aadhaar — if present — masked similarly.", t: "Last 4 digits only. (Aadhaar rarely appears on salary slips but some PSUs include it.)" },
            { b: "Source PDF — 60-minute auto-delete.", t: "Uploaded PDFs are deleted from our servers within 60 minutes. The structured JSON contains masked PII; the source PDF with un-masked PII doesn't persist." },
          ],
        },
      },
      {
        h: "Three workflows where structured analysis pays off",
        p: [
          "Specific use cases:",
        ],
        list: {
          items: [
            { b: "Multi-month / multi-year comparison.", t: "Track your comp evolution over time. Parse slips from the last 12-24 months; observe how component structure has shifted. Useful for verifying expected raises landed, identifying changes in HRA or PT, spotting unexpected deductions." },
            { b: "Employer-to-employer offer comparison.", t: "When considering a new role, compare offer letters component-by-component against your current slip's structure. Same total comp can have different post-tax outcomes depending on Basic vs HRA vs Special split." },
            { b: "Tax planning / ITR preparation.", t: "Slip-level earnings totals are inputs to FY-end ITR filing. The structured JSON makes it easy to sum across slips for accurate annual earnings figures." },
          ],
        },
      },
      {
        h: "What this tool doesn't do",
        p: [
          "Three deliberate non-features:",
        ],
        list: {
          items: [
            { b: "Doesn't compute taxable income for the year.", t: "Single-slip taxable income is sometimes shown; FY-end taxable income usually requires Form 16. Use ITR Analyzer for FY-end taxable-income computation; this tool covers monthly slips." },
            { b: "Doesn't advise on tax planning.", t: "The structured JSON is data; tax-planning recommendations need a chartered accountant or a dedicated tax-planning tool. The output is your input to those conversations, not a substitute." },
            { b: "Doesn't auto-detect mistakes.", t: "If the slip has an error (missed component, wrong deduction), the analyzer surfaces what the slip shows, not what should be there. Verification against payroll-team confirmation or against your offer letter is still needed." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Salary Slip Analyzer charges 10 credits per slip. The tool handles PDFs up to 25 MB. Processing runs on our servers; the slip is in memory only during analysis. Source PDFs delete within 60 minutes; structured output JSON returned with masked PII.",
          "Common pairings: Salary Slip + Multi-Bank Statement Analyzer for full month-by-month financial picture. Salary Slip parsed for multiple months + Excel for visual YoY trends. Salary Slip → ITR Analyzer at FY-end for tax-return-prep workflow.",
        ],
      },
    ],
  },

  // ============================================================
  // tamil-pdf-translator — Tamil-script translation AI
  // ============================================================
  "tamil-pdf-translator": {
    title: "Tamil PDF Translator — handling Noto Sans Tamil ligatures, TN government forms, and legal-register translation",
    intro:
      "Tamil PDF translation is one of the highest-volume language operations specifically for Indian users. Tamil Nadu government forms, court judgments, rental agreements, university materials, religious texts — Tamil-English translation is daily work in many Indian contexts. The technical challenges include rendering Tamil's complex ligature system correctly in the output PDF, handling TN-specific legal register, and managing code-mixed Tamil-English content gracefully. Here is how the translator handles each, the three patterns where AI translation beats Google Translate for Tamil specifically, and the workflow for scanned government forms.",
    sections: [
      {
        h: "Tamil-script rendering — what makes this hard",
        p: [
          "Tamil uses the Tamil script with several features that simpler font-rendering pipelines often handle poorly:",
        ],
        list: {
          items: [
            { b: "Ligatures — க்ஷ, ஶ்ரீ, etc.", t: "Tamil combines consonants with virama (்) to form conjunct consonants. These ligatures need an OpenType-aware font and proper text-shaping. Without correct shaping, you get separate characters with visible virama marks rather than the combined ligature." },
            { b: "Grantha consonants — ஶ, ஷ, ஜ, ஹ, ஸ.", t: "Grantha is a separate set of consonants borrowed from Sanskrit for Sanskrit-origin words. Modern Tamil education varies on whether to teach them; older texts and religious materials use them heavily. Output must render them correctly." },
            { b: "Combining vowels — matras.", t: "Vowel signs that attach to consonants (க + ா = கா). Many appear visually before or above the consonant but are logically attached to it. Proper rendering requires the layout engine to handle the visual order vs logical order correctly." },
          ],
        },
        // Our solution:
      },
      {
        h: "How the translator handles Tamil rendering",
        p: [
          "The output PDF embeds Noto Sans Tamil, a font specifically designed by Google for cross-platform Tamil rendering with full OpenType support for ligatures and matras. We use a layout engine that respects Tamil text-shaping rules. The result is clean rendering: no question-mark glyphs where ligatures should be, no broken matras, correct visual order of combining marks.",
          "The output PDF renders identically on every PDF reader regardless of whether the reader's machine has Tamil fonts installed locally. Critical for sharing Tamil PDFs with users on different operating systems — Windows users without Tamil fonts installed routinely see Tamil PDFs as boxes; embedded-font output works for them too.",
        ],
      },
      {
        h: "TN government forms and how they're handled",
        p: [
          "Tamil Nadu state has many government interfaces in Tamil. The translator supports the most common categories:",
        ],
        list: {
          items: [
            { b: "TANGEDCO electricity bills.", t: "Tamil Nadu Generation and Distribution Corporation bills. Common Tamil layout with English numerals. Translation preserves bill amounts and dates verbatim; renders the Tamil descriptions in English." },
            { b: "Patta documents.", t: "Land records issued by TN revenue department. Specialized vocabulary; translator preserves legal terminology (survey number, sub-division, classification) precisely." },
            { b: "Encumbrance Certificates (EC).", t: "Property-history documents from the registrar. The translator handles the standardized format and preserves transaction descriptions for legal verification." },
            { b: "Rental agreements.", t: "Tamil rental agreements use specific legal terms (வாடகை மூலதனம், ஒப்பந்த விவகாரம்). The translator preserves the legal register; commercial rental agreements come out with correct English legal equivalents." },
            { b: "TNPSC papers.", t: "Tamil Nadu Public Service Commission exam papers in Tamil. Translation helps non-Tamil candidates understand TN-region-specific civics questions; useful for revision." },
          ],
        },
      },
      {
        h: "Three patterns where AI beats Google Translate for Tamil",
        p: [
          "Where targeted AI translation outperforms generic machine translation:",
        ],
        list: {
          items: [
            { b: "Legal register matching.", t: "Tamil legal documents use a specialized register (neethimandram, vaadhi, pratividhi). Google Translate often produces colloquial output. AI translation matches the formal legal register correctly because the prompt anchors to source-document tone." },
            { b: "Code-mixed Tamil-English.", t: "Modern Tamil writing routinely mixes English words (technology, automobile, signature) into Tamil sentences. The translator recognizes when an English word is being used in Tamil context and preserves it correctly rather than over-translating." },
            { b: "Religious / classical Tamil.", t: "Older religious texts and classical Tamil use vocabulary that modern colloquial Tamil has dropped. AI translation handles these with reasonable accuracy; Google Translate's colloquial bias often misses the formality." },
          ],
        },
      },
      {
        h: "Scanned-form workflow",
        p: [
          "Many TN government documents are scans of paper forms. Two-pass workflow:",
        ],
        list: {
          items: [
            { b: "AI OCR first.", t: "Run AI OCR on the scanned PDF to add a text layer in Tamil. Tamil OCR is accurate for typed forms; less accurate for handwritten content." },
            { b: "Translate the OCR'd PDF.", t: "Once the PDF has a Tamil text layer, run the translator. Output is searchable English PDF with the original Tamil form's layout preserved." },
          ],
        },
      },
      {
        h: "When to verify with a Tamil-speaking human",
        p: [
          "Three high-stakes cases:",
        ],
        list: {
          items: [
            { b: "Court submissions.", t: "Tamil court submissions need certified translation. AI translation is preparation material; a certified translator's stamp is required for legal admissibility." },
            { b: "Property document verification.", t: "Translations of pattas, sale deeds, ECs affecting property transactions should be verified by a Tamil-reading lawyer. AI translation surfaces the content for review; the legal advice depends on the original Tamil." },
            { b: "Family documents in archaic Tamil.", t: "Older family or religious documents use vocabulary that modern Tamil dictionaries may miss. AI is reasonable but a Tamil-literate family member or scholar provides the cultural context." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Tamil PDF Translator charges 1 credit per page. The tool handles PDFs up to 100 MB. Processing runs on our servers; the document is in memory only during translation. Output preserves source layout with Noto Sans Tamil embedded for cross-platform rendering.",
          "Common pairings: AI OCR first for scanned forms (TANGEDCO bills, pattas, ECs). Translate then Improve Writing if the translated output reads stilted. Tamil + Hindi translators share the same prompt-tuning infrastructure; same accuracy bands apply.",
        ],
      },
    ],
  },

  // ============================================================
  // repair-pdf — corruption-fixing tool
  // ============================================================
  "repair-pdf": {
    title: "Repair PDF — what makes a PDF \"broken\" and what can actually be fixed in-browser",
    intro:
      "\"PDF won't open\" is one of the most common error messages on the internet. The PDF may show as corrupt in Acrobat, fail to render in browsers, or open with garbled content. Most of these failures aren't fundamental — they're recoverable through a fresh parse and re-save with rebuilt structural metadata. The repair tool does exactly that: parse what's recoverable, rebuild the cross-reference table, drop orphaned objects, recompress streams. Here is what kinds of corruption are fixable, what isn't, and the five common failure modes that account for most \"won't open\" reports.",
    sections: [
      {
        h: "How PDF repair works",
        p: [
          "Every PDF has a cross-reference (xref) table — the index that tells the reader where each object lives in the file. When the xref is stale, missing, or out of sync with the actual objects, readers can't find pages and the file appears broken. The repair tool does a two-pass parse: first attempts strict parsing; if that fails, retries with full recovery mode (throwOnInvalidObject: false, ignoreEncryption: true). Once parseable, it re-saves with a freshly-rebuilt xref, dropping orphaned objects and recompressing content streams.",
          "Output is usually smaller than input. PDFs accumulate cruft over their editing lifetime — orphaned objects from delete operations, stale xref entries, redundant copies of resources. The repair cleans these up as a side effect.",
        ],
      },
      {
        h: "Five failure modes the repair tool fixes",
        p: [
          "From real-world error reports:",
        ],
        list: {
          items: [
            { b: "Stale xref tables.", t: "The most common failure. After heavy editing, the xref points to byte offsets that don't match where objects actually live. Reader can't find pages; file appears truncated. Repair rebuilds the xref from scratch by scanning the actual objects." },
            { b: "Missing trailer.", t: "PDF requires a trailer at the end pointing to the catalog. Some incomplete uploads or truncated transfers drop the trailer. If the catalog object is still present elsewhere, repair can locate it and write a fresh trailer." },
            { b: "Broken page-tree references.", t: "/Pages dictionary points to a page object that doesn't exist (orphaned by a partial delete operation). Repair removes the broken reference; the surviving pages still render correctly. Lost: the un-referenced page (which was effectively gone already)." },
            { b: "Invalid /Info entries.", t: "Some PDF generators produce /Info dictionaries with non-standard fields that strict parsers reject. Repair normalizes /Info or drops invalid entries, keeping the document parseable." },
            { b: "Wrong %PDF header.", t: "PDFs are supposed to start with %PDF-1.x. Some generators produce files starting with whitespace or comments before the header; strict parsers reject. Repair rewrites the header at offset 0." },
          ],
        },
      },
      {
        h: "What repair CAN'T fix",
        p: [
          "Three categories of corruption beyond the tool's scope:",
        ],
        list: {
          items: [
            { b: "Missing catalog object.", t: "The catalog is the top-level reference that everything else hangs off of. If it's completely missing, there's nothing to rebuild from. Repair fails cleanly with a clear error rather than producing a broken output. Workaround: try Adobe Acrobat Pro's \"Recover Text from Damaged PDF\" or pdftk's repair mode." },
            { b: "Binary corruption inside content streams.", t: "If a page's drawing instructions themselves are corrupted (compressed data with garbage bytes, malformed operator sequences), repair can't reconstruct them. Operator-level parsing is beyond the tool's scope. Workaround: extract whatever pages parse correctly; accept loss of the corrupted ones." },
            { b: "Real password-protected PDFs.", t: "If the PDF requires a user-password (open-password) to read, the repair tool can't decrypt it. Unlock first with our Unlock tool (for owner-passwords) or provide the user-password in Adobe Acrobat. Once unlocked, repair can process the file." },
          ],
        },
      },
      {
        h: "Three workflows where repair earns its place",
        p: [
          "Specific cases:",
        ],
        list: {
          items: [
            { b: "Received a \"corrupt\" attachment.", t: "Email or messaging attachment that the recipient can't open. Run repair before declaring it unrecoverable; most of these are simple xref corruption from email encoding glitches." },
            { b: "Heavily-edited working file.", t: "After many edit-save cycles, PDFs accumulate orphaned objects and become bloated. Periodic repair (\"compact and rebuild\") shrinks the file and often resolves subtle rendering issues that started after specific edits." },
            { b: "Recovered from disk-corruption.", t: "A PDF recovered from a damaged disk or interrupted download. Strict parsers may fail; repair's recovery mode often succeeds where strict parse couldn't." },
          ],
        },
      },
      {
        h: "What you get in the output",
        p: [
          "Three deliverables alongside the repaired PDF:",
        ],
        list: {
          items: [
            { b: "The repaired PDF.", t: "Freshly-saved with rebuilt xref. Opens in any reader. Usually smaller than the input." },
            { b: "Before-after size comparison.", t: "Input bytes vs output bytes. Reports the reclaimed space from dropped orphans and re-compressed streams." },
            { b: "Repair report listing each step.", t: "\"Rebuilt xref table,\" \"Dropped 12 orphaned objects,\" \"Recompressed content streams,\" etc. Useful for understanding what was actually wrong with the input and for audit trail when the repair affects a high-stakes document." },
          ],
        },
      },
      {
        h: "Limits and pricing",
        p: [
          "Free. 100% client-side. The tool handles PDFs up to 100 MB. Parsing runs in your browser via pdf-lib; nothing is uploaded. Output is the repaired PDF + the before/after size + the step-by-step repair report.",
          "Common pairings: Repair → Compress for further size reduction after structural cleanup. Repair → Remove Metadata to drop legacy /Info dictionary noise. Repair → PDF Inspector to verify the repaired file's structural integrity.",
        ],
      },
    ],
  },

  // ============================================================
  // reorder-pdf-pages — drag-to-sort utility
  // ============================================================
  "reorder-pdf-pages": {
    title: "Reorder PDF pages — drag thumbnails visually when range-syntax won't do",
    intro:
      "Sometimes you need to rearrange a PDF's pages — put a cover page first, move an appendix to the front, swap a couple of slides in a deck, re-order pages a scanner fed in the wrong sequence. Range-syntax tools (\"keep pages 3, 1, 5, 2, 4\") work but are awkward for visual rearrangement. The reorder tool shows every page as a thumbnail and lets you drag pages to new positions — the visual workflow when you can see what each page is. Here is how the thumbnail rendering works, the three workflows where drag-reorder beats range-syntax, and the relationship to the Extract Pages tool.",
    sections: [
      {
        h: "How the visual reorder works",
        p: [
          "Drop a PDF. The tool renders every page as a thumbnail in your browser using PDFium. The thumbnails are arranged in current page order; each is clickable and draggable. Drag any thumbnail to a new position; the other thumbnails reflow to make room. Two convenience buttons: Reverse (flip the entire order) and Restore Original (reset to the source order).",
          "When you click Apply, the tool reads the new sequence and uses pdf-lib's copyPages to assemble a new PDF in that order. The page contents are copied verbatim — same text, same images, same annotations, same form fields. Only the order changes.",
        ],
      },
      {
        h: "Three workflows where drag beats range-syntax",
        p: [
          "Cases where visual rearrangement is the right approach:",
        ],
        list: {
          items: [
            { b: "Scanner mis-fed page order.", t: "A document scanner that fed pages out of order — common with duplex scanners that interleave fronts and backs. You can SEE which page is which from thumbnails; drag-reorder to the correct sequence." },
            { b: "Slide-deck re-ordering for different audiences.", t: "A 30-slide deck reused for different audiences with different emphasis. Drag slides to surface the points that matter for THIS audience; the original deck remains intact." },
            { b: "Cover-page or table-of-contents addition.", t: "Adding a cover or TOC at the front of an existing document. The new page is created separately, merged into position 1, then drag to fine-tune position." },
            { b: "Booklet-style page sequencing.", t: "Some printers expect pages in non-sequential order (booklet imposition, signature work). Drag pages to the printer's required sequence. For automated booklet imposition see the Booklet tool; manual drag works for one-off custom sequences." },
            { b: "Appendix or supporting-material relocation.", t: "Moving an appendix from the back of a report to a referenced position mid-document. Drag works; range-syntax for this in a 200-page doc is awkward." },
          ],
        },
      },
      {
        h: "Drag-reorder vs Extract Pages",
        p: [
          "Two related tools with different output shapes:",
        ],
        list: {
          items: [
            { b: "Reorder Pages — same pages, different order.", t: "Input N pages → output N pages, in your chosen order. All pages survive; only the sequence changes." },
            { b: "Extract Pages — subset of pages.", t: "Input N pages → output M pages where M ≤ N. Some pages dropped, remaining pages in your chosen order. Use when you want to both subset AND reorder." },
            { b: "Decision rule.", t: "Need all the pages? Reorder. Need only some pages? Extract Pages (which also handles ordering via its range syntax)." },
          ],
        },
      },
      {
        h: "Three patterns that make reorder smooth",
        p: [
          "Habits for the workflow:",
        ],
        list: {
          items: [
            { b: "Use Reverse for bulk-flip.", t: "Common scanner failure: scanned in reverse order. Reverse button does in one click what drag-by-drag would take minutes." },
            { b: "Use Restore Original liberally.", t: "If you mess up a drag and lose track of original order, Restore Original resets and you can start again. The original PDF on disk is never modified; only the in-tool order changes." },
            { b: "Render before deciding.", t: "Wait for all thumbnails to render before dragging. Trying to drag a thumbnail that's still rendering can produce unexpected results. Most PDFs render in seconds; very long PDFs may take a few." },
          ],
        },
      },
      {
        h: "What stays preserved",
        p: [
          "Three things the reorder doesn't touch:",
        ],
        list: {
          items: [
            { b: "Page content.", t: "Text, images, vectors, scanned content — all preserved exactly. The reorder is at the page level; page interiors are untouched." },
            { b: "Annotations and form fields.", t: "Highlights, comments, sticky notes, form-field values — all travel with their original page to its new position." },
            { b: "Hyperlinks.", t: "External URLs preserved. Internal goto-page links automatically remapped to point at the new page positions; what was \"jump to page 5\" still jumps to the same content, even if that content is now at page 12." },
          ],
        },
      },
      {
        h: "Limits and compatibility",
        p: [
          "Free. 100% client-side. The tool handles PDFs up to 100 MB. Thumbnails render via PDFium in your browser; reorder happens via pdf-lib. Nothing is uploaded.",
          "Common pairings: Reorder + Extract Pages when you want to both subset and rearrange. Reorder + Compress to shrink the reordered output. Reorder + Add Page Numbers AFTER reordering — page numbers should reflect the final sequence, not the source.",
        ],
      },
    ],
  },
};
