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
};
