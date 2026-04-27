// lib/tool-longforms.ts
//
// Build 2 Wave 5 (2026-04-27): per-tool editorial data consumed by
// the shared <ToolRunnerLongform /> component. Closes the
// structural-parity gap — every PDFium-backed tool now has the
// same editorial depth as PDF Inspector and Page Count.
//
// Page Count and PDF Inspector keep their custom longform
// components (PageCountLongform, PdfInspectorLongform) because
// they have unique sections (PDF health checklist, etc.) that
// don't fit the shared shape. Everything else lives here.
//
// Adding a tool: add a new entry keyed by the tool id matching
// lib/tools.ts. The runner page in app/tool/[id]/page.tsx
// auto-renders the longform when an entry exists.

import type { ToolLongformData } from "@/components/marketing/ToolRunnerLongform";

export const TOOL_LONGFORMS: Record<string, ToolLongformData> = {
  // -------- Wave 1: text-export trio --------------------------------
  "pdf-to-text": {
    useCasesTitle: "Why people convert PDFs to text",
    useCasesIntro:
      "A PDF is a layout container. Plain text is a content container. Once it's text, every downstream tool — search, translation, summarization, version-control — works.",
    useCases: [
      {
        icon: "Translate",
        title: "Translation prep",
        text: "Translation services charge by the word. A clean .txt export lets you get an accurate quote and feed the result into any CAT tool without layout interference.",
      },
      {
        icon: "Search",
        title: "Full-text search",
        text: "Drop the .txt into your editor or a search-indexer and find every occurrence across documents instantly. Faster than re-opening each PDF.",
      },
      {
        icon: "Summary",
        title: "AI summarization input",
        text: "Most LLM tools work best with plain text. Extract once, summarize many times — across ChatGPT, Claude, local models, or our own AI · Summarize tool.",
      },
      {
        icon: "Compare",
        title: "Version comparison",
        text: "Diffing two PDFs is painful; diffing two .txt files is one git command. Useful for legal redlines, contract reviews, and academic revisions.",
      },
      {
        icon: "Edit",
        title: "Repurpose content",
        text: "Pull text out of an existing PDF to repost on a blog, paste into a CMS, or use as a starting draft for new material.",
      },
    ],
    howWorksTitle: "How PDF to Text works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Files stay in your browser — never uploaded.",
      },
      {
        step: "2",
        title: "Click Extract text",
        text: "Google PDFium reads every page in reading order, with page-break markers between pages.",
      },
      {
        step: "3",
        title: "Copy or download .txt",
        text: "Plain UTF-8 text. Paste anywhere or save as a .txt file for downstream pipelines.",
      },
    ],
    faqs: [
      {
        q: "What about formatting — headings, lists, tables?",
        a: "Layout is flattened to reading order. PDFium gives us the text in the order it appears on the page. Tables come out as space-separated rows, lists lose their bullet markers, headings lose their style. If layout matters, use PDF to Markdown or PDF to HTML for lightly structured output.",
      },
      {
        q: "Does it work on scanned PDFs?",
        a: "No. Scans are images, so there's no extractable text. Run Make PDF Searchable (AI · OCR) first to overlay invisible text on the scan, then come back here.",
      },
      {
        q: "What's the file size limit?",
        a: "100 MB. Larger files would risk freezing the browser tab during PDFium's parse step. For documents above 100 MB, split first.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium runs as WebAssembly in your browser. Your file never touches our servers. You can verify in your browser's Network tab — there's no upload request.",
      },
      {
        q: "Why are there random line breaks in the middle of paragraphs?",
        a: "PDF stores text in lines, not paragraphs. PDFium gives back what's there. Most PDF→text tools (including pdftotext) have this artefact. For cleaner paragraph reflow, use PDF to Markdown which adds basic paragraph-merge heuristics.",
      },
    ],
    cta: {
      title: "Want lightly structured output?",
      text: "PDF to Markdown adds page headers and paragraph reflow. PDF to HTML wraps paragraphs in <p> tags. Same engine, more structure preserved.",
      linkHref: "/tool/pdf-to-markdown",
      linkLabel: "Try PDF to Markdown",
    },
  },

  "pdf-to-markdown": {
    useCasesTitle: "Why people convert PDFs to Markdown",
    useCasesIntro:
      "Markdown is the lingua franca of modern writing tools. A PDF→.md export drops cleanly into Notion, Obsidian, GitHub, MkDocs, Hugo, and a hundred other places.",
    useCases: [
      {
        icon: "Edit",
        title: "Notion / Obsidian import",
        text: "Both knowledge tools accept Markdown natively. Convert old PDFs to .md once, then your notes are searchable + linkable inside your second-brain workflow.",
      },
      {
        icon: "Convert",
        title: "GitHub / GitLab docs",
        text: "Static-site generators and repo docs run on Markdown. PDF research papers or design specs become version-controlled .md files in one drop.",
      },
      {
        icon: "Summary",
        title: "AI workflow input",
        text: "LLMs handle Markdown's gentle structure (## headers, **bold**, * lists) better than raw text. Better extractions, better summaries.",
      },
      {
        icon: "Pages",
        title: "Static-site publishing",
        text: "Hugo, Jekyll, Astro, Next.js — all Markdown-friendly. Take a PDF whitepaper, convert to .md, publish as a blog post in minutes.",
      },
      {
        icon: "Book",
        title: "Reading-list archives",
        text: "Save research papers as searchable Markdown for grep + cross-reference. Each page becomes an H2 section so you can navigate quickly.",
      },
    ],
    howWorksTitle: "How PDF to Markdown works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Pure browser-side parse via Google PDFium.",
      },
      {
        step: "2",
        title: "Click Convert to Markdown",
        text: "Each page becomes a `## Page N` H2 section. Paragraphs are merged from PDF text lines — runs of whitespace collapse to single newlines.",
      },
      {
        step: "3",
        title: "Download .md or copy",
        text: "Plain UTF-8 Markdown. Paste into Notion / Obsidian / a Git repo, or save as a .md file.",
      },
    ],
    faqs: [
      {
        q: "Does it preserve headings, lists, and tables?",
        a: "Partially. Page boundaries become ## H2 headers; paragraphs are reflowed cleanly; bullets and tables come out as plain prose. For richer structure recovery, our AI · PDF to Blog Post or PDF to Study Notes tools do heading inference using an LLM.",
      },
      {
        q: "What's different from PDF to Text?",
        a: "Same underlying text extraction (PDFium's getText), different formatting. PDF to Text is one big string per page joined with separators. PDF to Markdown adds H2 headers per page and merges paragraphs by collapsing extra newlines.",
      },
      {
        q: "Does it work on scanned PDFs?",
        a: "No — same constraint as PDF to Text. Scans need OCR first. Run Make PDF Searchable, then convert.",
      },
      {
        q: "Will the output render correctly in my Markdown editor?",
        a: "Yes for standard CommonMark renderers (Notion, Obsidian, GitHub, MkDocs). Some editors interpret the page-break content slightly differently — preview the first page in your editor to confirm before importing 200 pages.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure browser-side via PDFium WebAssembly.",
      },
    ],
    cta: {
      title: "Need HTML instead?",
      text: "PDF to HTML wraps each page in <section> with <h2> + <p> tags — drop directly into a CMS or static-site generator.",
      linkHref: "/tool/pdf-to-html",
      linkLabel: "Try PDF to HTML",
    },
  },

  "pdf-to-html": {
    useCasesTitle: "Why people convert PDFs to HTML",
    useCasesIntro:
      "HTML is the web's native format. Once your PDF is .html, every web tool — CMS imports, search engines, screen readers — works natively.",
    useCases: [
      {
        icon: "Convert",
        title: "CMS / WordPress imports",
        text: "Most CMS tools accept HTML directly. Convert a PDF to .html once, paste into the WYSIWYG editor, ship as a blog post.",
      },
      {
        icon: "Search",
        title: "Web indexing",
        text: "Search engines crawl HTML, not PDF (well, they try, but HTML wins). Convert PDFs to .html for an internal docs site that actually ranks.",
      },
      {
        icon: "Shield",
        title: "Accessibility (a11y)",
        text: "Screen readers handle HTML far better than PDF. Converting old PDFs to clean HTML is the foundation of an accessibility cleanup pass.",
      },
      {
        icon: "Pages",
        title: "Static-site publishing",
        text: "Astro, Hugo, plain Apache — anything that serves HTML serves your converted PDF instantly. No conversion pipeline needed at deploy time.",
      },
      {
        icon: "Edit",
        title: "Email-friendly content",
        text: "Many email tools accept HTML drops. Take a PDF brief, convert to .html, paste into your campaign editor as a starting draft.",
      },
    ],
    howWorksTitle: "How PDF to HTML works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium parses in your browser — never uploaded.",
      },
      {
        step: "2",
        title: "Click Convert to HTML",
        text: "Each page becomes a <section> with an <h2>Page N</h2> header and one <p> per paragraph. UTF-8, properly escaped.",
      },
      {
        step: "3",
        title: "Download .html or copy",
        text: "Self-contained HTML5 doc with <!DOCTYPE>, <html>, <head>, <body>. Drop into any web editor or static host.",
      },
    ],
    faqs: [
      {
        q: "What about CSS and styles?",
        a: "Output is structural HTML only — no inline styles, no <style> block, no external CSS. The point is portability: drop into your CMS or site generator and apply your own styles. If you need styled output, use a layout-preserving converter like Acrobat's HTML export.",
      },
      {
        q: "Does it preserve images, tables, and links?",
        a: "Not yet. The current implementation surfaces text only. Embedded images are skipped (use Extract Images for those); tables come out as flat paragraphs; hyperlinks lose their href targets. Vector graphics, math equations, and form fields aren't converted.",
      },
      {
        q: "Is the HTML semantic and accessible?",
        a: "It's clean structural HTML5 with proper <section>, <h1>, <h2>, <p>. Suitable as a starting point for an accessible page. Adding alt text for images, ARIA labels, and table headers is your job — the converter doesn't infer those from a flat PDF.",
      },
      {
        q: "What's the difference from PDF to Markdown?",
        a: "HTML output is more directly publishable on the web (every browser renders it). Markdown is more portable across writing tools (Notion, Obsidian, GitHub). Same source text, different wrapper.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure browser-side via PDFium WebAssembly.",
      },
    ],
    cta: {
      title: "Want a more portable format?",
      text: "PDF to Markdown gives you the same content with simpler syntax — easier to paste into Notion, Obsidian, or a GitHub README.",
      linkHref: "/tool/pdf-to-markdown",
      linkLabel: "Try PDF to Markdown",
    },
  },

  // -------- Wave 2: rasterizers ------------------------------------
  "pdf-to-jpg": {
    useCasesTitle: "Why people convert PDFs to JPG",
    useCasesIntro:
      "JPG is the universal image format — every viewer, every social platform, every email client supports it. Once your PDF pages are JPGs, they go anywhere.",
    useCases: [
      {
        icon: "Image",
        title: "Email previews",
        text: "Recipients can preview a JPG inline; PDFs require downloading. Convert key pages to JPG to share in newsletter campaigns, signatures, or quick previews.",
      },
      {
        icon: "Convert",
        title: "Social media posts",
        text: "Twitter, LinkedIn, Instagram all accept JPG. Convert a research-paper figure, a chart, or a slide to JPG and post directly.",
      },
      {
        icon: "Pages",
        title: "CMS / blog images",
        text: "Most CMS tools want images, not PDFs. Convert your PDF deck to JPGs, upload as a gallery or carousel.",
      },
      {
        icon: "Sparkle",
        title: "Image-only viewers",
        text: "Older systems, kiosks, e-paper devices, and some printers handle JPG much better than PDF. Convert before sending.",
      },
      {
        icon: "Search",
        title: "Visual indexing",
        text: "Image-search tools (Google Lens, reverse-image search) work on JPGs. Convert PDF figures to JPG for visual discoverability.",
      },
    ],
    howWorksTitle: "How PDF to JPG works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF and pick resolution",
        text: "1×, 2×, or 3× (72 / 144 / 216 DPI). 2× is the sweet spot — sharp enough for print previews, small enough to share.",
      },
      {
        step: "2",
        title: "Click Convert to JPG",
        text: "PDFium renders each page to canvas in your browser, then encodes as JPG at quality 0.9 (visually lossless to most eyes).",
      },
      {
        step: "3",
        title: "Download single or zip",
        text: "1-page PDF → one .jpg. Multi-page PDF → all images bundled into a .zip. Or click any thumbnail to download just that page.",
      },
    ],
    faqs: [
      {
        q: "What's the difference between this and Extract Images?",
        a: "Big difference. PDF to JPG renders the WHOLE PAGE as an image (everything you see — text, layout, embedded images). Extract Images pulls out the SOURCE images embedded inside the PDF (just the photos/figures, not the text around them). Different tools for different needs.",
      },
      {
        q: "Should I use 1×, 2×, or 3×?",
        a: "1× = thumbnails / web previews / small files. 2× = balanced (default) — fits most use cases. 3× = print-quality / large displays / when sharpness matters more than file size. Higher scales linearly increase memory and render time.",
      },
      {
        q: "Why JPG vs PNG?",
        a: "JPG is smaller (10–50% the size for typical pages) but lossy. PNG is lossless. Use JPG for photos and dense text where compression artefacts won't be visible. Use PNG (separate tool) for diagrams, charts, screenshots, anything with sharp edges.",
      },
      {
        q: "Does it preserve text searchability?",
        a: "No. JPG is a flat raster — there's no text data, just pixels. If you need searchable output, convert to text instead, or use both (JPG for visual + .txt for search index).",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium and the canvas-based image encoder both run in your browser. Your PDF stays on your device.",
      },
    ],
    cta: {
      title: "Need lossless quality?",
      text: "PDF to PNG renders pages as PNG — better for diagrams, charts, screenshots, and anything with sharp edges. Same scale picker, same gallery.",
      linkHref: "/tool/pdf-to-png",
      linkLabel: "Try PDF to PNG",
    },
  },

  "pdf-to-png": {
    useCasesTitle: "Why people convert PDFs to PNG",
    useCasesIntro:
      "PNG is lossless — what you see on the PDF page is exactly what lands in the PNG. Better than JPG for diagrams, charts, screenshots, and anything with sharp edges.",
    useCases: [
      {
        icon: "Sparkle",
        title: "Diagrams and charts",
        text: "JPG compression smudges thin lines and crisp edges. PNG preserves every pixel — essential for technical diagrams, line charts, schematics.",
      },
      {
        icon: "Pages",
        title: "Screenshots / UI mockups",
        text: "Designers and product folks share UI mockups. PNG preserves the typography and gridline crispness that JPG would soften.",
      },
      {
        icon: "Edit",
        title: "Documentation images",
        text: "Software docs, API references, runbooks. Convert PDF pages to PNG for embedding in tutorials where text legibility matters.",
      },
      {
        icon: "Image",
        title: "Logo and brand assets",
        text: "Logos saved as PDF need lossless conversion. PNG preserves transparency-edge quality (though our converter renders on opaque white).",
      },
      {
        icon: "Convert",
        title: "Web images that need transparency",
        text: "PNG supports alpha channels. JPG doesn't. If you need crisp edges over a varying background, PNG is the only option.",
      },
    ],
    howWorksTitle: "How PDF to PNG works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF and pick resolution",
        text: "1×, 2×, or 3× (72 / 144 / 216 DPI). PNGs are larger than JPGs — be conservative on multi-page docs at 3×.",
      },
      {
        step: "2",
        title: "Click Convert to PNG",
        text: "PDFium renders each page to canvas. We read it back as PNG (lossless) — every pixel preserved.",
      },
      {
        step: "3",
        title: "Download single or zip",
        text: "1-page PDF → one .png. Multi-page → all PNGs zipped together. Or click any thumbnail to download just that page.",
      },
    ],
    faqs: [
      {
        q: "Why is PNG larger than JPG?",
        a: "PNG is lossless. JPG drops information to save space (the 'compression artefact' you sometimes see in low-quality JPGs). For typical PDF pages, PNGs are 5–10× larger. Worth it when sharpness matters; switch to JPG for photo-heavy pages where size matters more.",
      },
      {
        q: "Does the PNG preserve transparency?",
        a: "Not really — PDFium renders pages on an opaque white background by default. If you need transparent backgrounds (e.g. for compositing logos), the source PDF needs to be designed for it, and even then post-processing in an image editor is usually the cleaner path.",
      },
      {
        q: "What's the difference vs Extract Images?",
        a: "PDF to PNG renders the WHOLE PAGE (everything you see). Extract Images pulls out the SOURCE images embedded in the PDF (just the photos, no surrounding text). Use this for full-page captures; use Extract Images to grab just the figures.",
      },
      {
        q: "Should I use 1×, 2×, or 3×?",
        a: "1× = web previews. 2× = balanced (default). 3× = print quality. PNG file sizes grow roughly linearly with pixel count, so 3× = ~9× the file size of 1×.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium WASM + browser canvas, all on your device.",
      },
    ],
    cta: {
      title: "Want smaller files instead?",
      text: "PDF to JPG produces files 10–50% the size of PNG, with quality usually indistinguishable for text and photos.",
      linkHref: "/tool/pdf-to-jpg",
      linkLabel: "Try PDF to JPG",
    },
  },

  // -------- Wave 3 ------------------------------------------------
  "pdf-search": {
    useCasesTitle: "Why people search inside PDFs",
    useCasesIntro:
      "PDF readers' built-in search is fine for one document. When you need fast results across pages, with surrounding context, in your browser without opening Acrobat — that's this tool.",
    useCases: [
      {
        icon: "Search",
        title: "Research literature review",
        text: "Find every mention of a term across a 200-page paper without scrolling. The context window shows where each match lives so you don't have to flip back to the source.",
      },
      {
        icon: "Shield",
        title: "Compliance and audit",
        text: "Searching contracts, policies, or regulatory filings for specific clauses. Whole-word + case-sensitive options narrow results to exact matches that matter for legal review.",
      },
      {
        icon: "Book",
        title: "Textbook / manual lookup",
        text: "Manuals are long. Knowing the term is on page 247 and reading the surrounding sentence is faster than scrolling to find it.",
      },
      {
        icon: "Edit",
        title: "Editing and copy review",
        text: "Find every typo, every brand-name misspelling, every outdated reference across a draft. Faster than manually re-reading.",
      },
      {
        icon: "Sparkle",
        title: "Citation / quote verification",
        text: "Confirm a quote you want to use is actually in the source. Whole-word matching narrows ambiguous queries to exact phrases.",
      },
    ],
    howWorksTitle: "How Search in PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium extracts the text per page in your browser.",
      },
      {
        step: "2",
        title: "Type your query",
        text: "Word or phrase. Toggle case-sensitive or whole-word if you want narrower matches. Press Enter.",
      },
      {
        step: "3",
        title: "Read results in context",
        text: "Each match shows ~50 chars before and after, plus the page number. Click 'New search' to refine without re-uploading.",
      },
    ],
    faqs: [
      {
        q: "Does it work on scanned PDFs?",
        a: "Only if the scan has an OCR text layer. Image-only scans have no extractable text — run Make PDF Searchable first to OCR the document, then come back here.",
      },
      {
        q: "How many matches can I get?",
        a: "Up to 200 per query. Beyond that, the page becomes unwieldy and the user should refine. Whole-word matching usually trims results meaningfully when a query is too broad.",
      },
      {
        q: "Does it search bookmarks, comments, or metadata?",
        a: "No, just the page text. For bookmarks, use the PDF Outline Viewer. For metadata (title, author, etc.), use PDF Inspector.",
      },
      {
        q: "What's the difference vs AI · Semantic Search?",
        a: "This tool finds literal text matches. AI · Semantic Search finds passages by meaning — even if the query words don't appear verbatim in the document. Different tools for different intents. This one's free; semantic search uses credits.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium runs as WebAssembly in your browser. Verify in your browser's Network panel.",
      },
    ],
    cta: {
      title: "Need search by meaning, not just literal matches?",
      text: "AI · Semantic Search finds passages even when the query words don't appear verbatim. Useful for research and exploratory questions.",
      linkHref: "/tool/ai-semantic-search",
      linkLabel: "Try AI · Semantic Search",
    },
  },

  "extract-images": {
    useCasesTitle: "Why people extract images from PDFs",
    useCasesIntro:
      "Sometimes you need just the figures, not the page they're embedded in. Extracting images at native resolution preserves source quality — which page-rendering can't.",
    useCases: [
      {
        icon: "Image",
        title: "Reusing figures",
        text: "Author wants to reuse a chart or photo from an old PDF. Extract gives you the original at native resolution; rendering the page would shrink the image to fit the page bounds.",
      },
      {
        icon: "Search",
        title: "Asset audits",
        text: "Marketing teams checking which logos / brand assets a PDF deck uses. Extract lists every embedded image — easy to spot wrong logos or rights issues.",
      },
      {
        icon: "Edit",
        title: "Re-purpose for the web",
        text: "PDF figures often work better as standalone web images than re-renders. Extract, optimize, embed in HTML.",
      },
      {
        icon: "Book",
        title: "Research material extraction",
        text: "Pull figures from research papers for presentations or annotations. The original resolution is preserved, so they print sharp.",
      },
      {
        icon: "Shield",
        title: "Compliance review",
        text: "Auditors checking what raster images a PDF contains — sometimes you need to confirm which images are present without opening the file in Acrobat.",
      },
    ],
    howWorksTitle: "How Extract Images works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium walks every page in your browser.",
      },
      {
        step: "2",
        title: "Click Extract images",
        text: "We find every embedded raster image and decode it to PNG at original resolution.",
      },
      {
        step: "3",
        title: "Download",
        text: "Single image → one .png. Multi-image → bundled as .zip. Or click any thumbnail to download just that one.",
      },
    ],
    faqs: [
      {
        q: "What's the difference vs PDF to PNG?",
        a: "PDF to PNG renders the WHOLE PAGE as an image (everything: text, layout, embedded images). Extract Images pulls out just the SOURCE images embedded inside the PDF (no surrounding text). Use Extract for figures; use PDF to PNG for full-page captures.",
      },
      {
        q: "What about vector graphics?",
        a: "Vectors aren't extracted — they're path objects, not images. Only raster images (JPG, PNG, raw bitmaps embedded in the PDF) come out. PDFs that are entirely vector return zero images.",
      },
      {
        q: "Why are some images missing?",
        a: "Rare codecs (JBIG2 under encryption, etc.) can fail to decode. We log and skip them rather than failing the whole extraction. Common formats — JPEG, PNG, raw bitmaps — work fine.",
      },
      {
        q: "What format does it output?",
        a: "PNG. We don't know the source format and re-encoding to lossy JPEG would drop fidelity. PNG keeps the original pixels intact.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium and canvas-based decoding both run in your browser.",
      },
    ],
    cta: {
      title: "Need full-page renders instead?",
      text: "PDF to PNG renders the whole page as an image (text + layout + embedded images together).",
      linkHref: "/tool/pdf-to-png",
      linkLabel: "Try PDF to PNG",
    },
  },

  // -------- Wave 4 ------------------------------------------------
  "pdf-outline": {
    useCasesTitle: "Why people view PDF outlines",
    useCasesIntro:
      "An outline (bookmarks tree) is a PDF's table of contents. Seeing it before you open the document tells you whether it's worth opening — and where to start.",
    useCases: [
      {
        icon: "Book",
        title: "Long-doc previews",
        text: "Research papers, textbooks, government filings. Skim the outline first to decide which chapters to actually read. Saves opening a 400-page PDF just to find the right section.",
      },
      {
        icon: "Search",
        title: "Citation lookup",
        text: "When citing a chapter or section number, extract the outline to confirm the section exists at the page you're claiming. Especially useful for legal exhibits.",
      },
      {
        icon: "Convert",
        title: "Re-publishing prep",
        text: "Before reformatting a PDF as a website or blog series, exporting its outline gives you the editorial map — what sections to keep, what to merge, what to drop.",
      },
      {
        icon: "Shield",
        title: "Compliance + audit",
        text: "Confirming a regulatory filing's structure matches the prescribed table of contents. The outline export shows nesting depth + page refs at a glance.",
      },
      {
        icon: "Edit",
        title: "TOC documentation",
        text: "Generating a documentation page that lists all chapters of a PDF manual with page numbers — useful for ops runbooks and indexed knowledge bases.",
      },
    ],
    howWorksTitle: "How PDF Outline Viewer works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. We parse the outline tree directly from the PDF bytes — no PDFium engine needed.",
      },
      {
        step: "2",
        title: "Click View outline",
        text: "We walk the outline tree, decode each title (handling Unicode + escape sequences), and resolve destinations to 1-based page numbers.",
      },
      {
        step: "3",
        title: "Copy or export",
        text: "Copy as indented text, or export as JSON for programmatic use.",
      },
    ],
    faqs: [
      {
        q: "What if the PDF has no bookmarks?",
        a: "We tell you clearly. Many PDFs (especially scanned or auto-generated ones) have no outline tree. For those, try PDF Inspector for high-level stats or Search in PDF to find specific text.",
      },
      {
        q: "Are nested bookmarks shown?",
        a: "Yes, with proper indent depth. The export preserves the hierarchy — JSON has a depth field; copied text uses two-space indent per level.",
      },
      {
        q: "Why is no page number shown for some entries?",
        a: "PDF allows two destination styles: direct page refs and named destinations (an extra dereference). We resolve direct refs cleanly; named destinations show the title without a page number. Most modern PDFs use direct refs.",
      },
      {
        q: "Does it handle PDFs with cross-reference streams (PDF 1.5+)?",
        a: "Mostly no. Cross-reference streams hide objects in compressed object streams that our byte parser can't follow. We return 'unsupported' clearly when this happens.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "Want full document stats too?",
      text: "PDF Inspector adds page count, dimensions, word count, metadata, and more — same in-browser, in one drop.",
      linkHref: "/tool/pdf-inspector",
      linkLabel: "Try PDF Inspector",
    },
  },

  "pdf-forms": {
    useCasesTitle: "Why people inspect PDF forms",
    useCasesIntro:
      "Fillable PDFs collect data. Knowing which fields exist, what type, and what's filled in is a real workflow concern for HR, legal, finance, and ops.",
    useCases: [
      {
        icon: "Pen",
        title: "Form completion verification",
        text: "Before submitting a 30-field form, audit which fields are filled and which required fields are empty. Faster than tabbing through the PDF.",
      },
      {
        icon: "Convert",
        title: "Data extraction for pipelines",
        text: "Bulk-extract field values from filled-in PDFs to feed into spreadsheets, ATS systems, or databases. CSV export goes straight into your pipeline.",
      },
      {
        icon: "Shield",
        title: "Audit and compliance",
        text: "Confirming that the form fields collected match the data spec. Useful for KYC forms, tax returns, government submissions where the field set is regulated.",
      },
      {
        icon: "Edit",
        title: "Form template review",
        text: "Designers and product owners reviewing a fillable PDF template. The inspector shows every field's name, type, and flags so review happens against actual data not guesses.",
      },
      {
        icon: "Search",
        title: "Schema documentation",
        text: "Documenting an existing PDF form's schema for downstream tooling — what field names exist, what types, what flags. JSON export gives a clean machine-readable schema.",
      },
    ],
    howWorksTitle: "How PDF Form Inspector works",
    howWorks: [
      {
        step: "1",
        title: "Drop your fillable PDF",
        text: "Up to 100 MB. Our byte parser walks the AcroForm dictionary — no PDFium engine needed.",
      },
      {
        step: "2",
        title: "Click Inspect form fields",
        text: "Every field with a name and type is surfaced — text inputs, checkboxes, radios, choice lists, signatures.",
      },
      {
        step: "3",
        title: "Export",
        text: "Copy as JSON for pipelines, or download as CSV for spreadsheets. Field names use dotted-path notation (Parent.Child) for nested forms.",
      },
    ],
    faqs: [
      {
        q: "Does it fill the form for me?",
        a: "No, this tool inspects only — it tells you what fields exist and their current values. To fill in fields, use the Fill PDF Forms tool.",
      },
      {
        q: "What field types does it recognize?",
        a: "All four AcroForm types: Tx (text inputs), Btn (buttons — checkbox, radio, pushbutton), Ch (choice — list/combo box), Sig (signature). Plus a flags column showing required, read-only, multiline, password.",
      },
      {
        q: "Why are some fields blank?",
        a: "Either they haven't been filled in, or the value is in a non-string format we don't yet decode (e.g. complex dictionaries). The required + readonly flags still show correctly even if the value is empty.",
      },
      {
        q: "Does it handle nested fields?",
        a: "Yes. Parent fields are walked first; their /Kids subfields show with dotted-path names like 'Address.Street' or 'Address.City'. The hierarchy is preserved.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Byte-stream parser runs in your browser.",
      },
    ],
    cta: {
      title: "Want to fill the form, not just inspect it?",
      text: "Fill PDF Forms lets you click into each field, type your values, and download the filled PDF.",
      linkHref: "/tool/fill-forms",
      linkLabel: "Try Fill PDF Forms",
    },
  },

  "pdf-attachments": {
    useCasesTitle: "Why people list PDF attachments",
    useCasesIntro:
      "PDFs can secretly carry embedded files — datasets, source documents, working notes. For compliance audits and security review, knowing what's hidden inside matters.",
    useCases: [
      {
        icon: "Shield",
        title: "Security review",
        text: "Embedded executables, macros, or unexpected file types in a PDF can be a security concern. List the attachments to confirm what's actually there.",
      },
      {
        icon: "Search",
        title: "Compliance audit",
        text: "Regulatory filings often include supporting docs. Auditors need to confirm the exact set of attachments matches the submission spec.",
      },
      {
        icon: "Book",
        title: "Research artefacts",
        text: "Technical reports often embed datasets, scripts, or supplementary material. Listing the attachments is the first step to retrieving them.",
      },
      {
        icon: "Sparkle",
        title: "PDF/A validation",
        text: "PDF/A archive standards restrict embedded file types. Listing attachments helps validators confirm compliance before submission to repositories.",
      },
      {
        icon: "Convert",
        title: "Document deconstruction",
        text: "Designers checking what assets are bundled into a PDF deliverable — fonts, source files, working layers — that they need to manage separately.",
      },
    ],
    howWorksTitle: "How PDF Attachments Lister works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser walks the /Names tree in your browser.",
      },
      {
        step: "2",
        title: "Click List attachments",
        text: "We surface every Filespec dict from /EmbeddedFiles — Unicode filenames preferred, MIME types decoded.",
      },
      {
        step: "3",
        title: "Copy or export",
        text: "Copy as text (filename + size + description), or export as JSON.",
      },
    ],
    faqs: [
      {
        q: "Does it download the actual file bytes?",
        a: "Not yet. We list metadata (name, MIME, size) but extracting the streams requires handling FlateDecode and other compression filters — separate work. For now, open the PDF in Acrobat or Preview to save individual attachments.",
      },
      {
        q: "Why does this matter for compliance?",
        a: "Embedded files can leak PII, source documents, or working notes. Auditors need to know what's hiding inside. PDF/A validators also care — the spec restricts embedded file types.",
      },
      {
        q: "What if no attachments exist?",
        a: "We tell you clearly. Most PDFs don't have any. Common cases that DO: technical reports with embedded datasets, regulatory filings with supporting docs, archive PDFs with source files.",
      },
      {
        q: "Does it handle nested name trees?",
        a: "Yes. PDFs with many attachments use a /Kids subtree structure. The parser walks it depth-first and flattens to a single list.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "Want full document overview?",
      text: "PDF Inspector adds page count, dimensions, word count, fonts, metadata, and more — same in-browser, one drop.",
      linkHref: "/tool/pdf-inspector",
      linkLabel: "Try PDF Inspector",
    },
  },

  // -------- Wave 8 (2026-04-27) — byte-parser tools --------------

  "pdf-links": {
    useCasesTitle: "Why people extract links from PDFs",
    useCasesIntro:
      "PDFs collect links over their lifetime — citations, tracking pixels, dead URLs from a 2017 deck. Auditing what's actually in there is its own job.",
    useCases: [
      {
        icon: "Search",
        title: "Link-rot audits",
        text: "PDFs published 5 years ago link to URLs that no longer resolve. Pull every link, run a HEAD-status check, replace dead ones before reposting.",
      },
      {
        icon: "Shield",
        title: "Privacy / tracking review",
        text: "Some PDFs carry tracking pixels disguised as link annotations. Knowing every external URL surfaces what your file phones home to.",
      },
      {
        icon: "Convert",
        title: "Content migration",
        text: "Moving a PDF library to a CMS or static site. Links need to be re-anchored to the new URL structure — first you need the full list.",
      },
      {
        icon: "Book",
        title: "Citation verification",
        text: "Academic and legal documents reference URLs. Auditing the link list confirms every citation actually points where claimed.",
      },
      {
        icon: "Edit",
        title: "Internal-doc QA",
        text: "Internal PDF guides often link to outdated wiki pages or moved Confluence URLs. Audit before redistributing to avoid sending readers to 404s.",
      },
    ],
    howWorksTitle: "How Extract Links works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser walks every page's /Annots array in your browser.",
      },
      {
        step: "2",
        title: "Click Extract links",
        text: "We surface every /Subtype /Link annotation, classify external (URI) vs internal (Dest), record the page each appears on.",
      },
      {
        step: "3",
        title: "Copy or export",
        text: "Copy as JSON for pipelines, or download as CSV for spreadsheets and link-checkers.",
      },
    ],
    faqs: [
      {
        q: "Does it find links that are just text in the PDF, not clickable?",
        a: "No. We only find link annotations — the clickable rectangles. Plain-text URLs that happen to look like links but aren't anchored as link annotations don't count. For those, use Search in PDF and search for 'http' or your domain.",
      },
      {
        q: "Does it check whether the links are alive or dead?",
        a: "Not yet. We list URLs; checking which ones still resolve requires HTTP requests we don't make in-browser (CORS would block most of them anyway). Run a desktop link-checker like linkchecker or htmlproofer on the exported CSV.",
      },
      {
        q: "Internal links — what do those look like?",
        a: "Internal links jump within the PDF, e.g. 'Page 3 of contents' linking to page 47. We surface them as 'Page object N' or 'Named: <name>' depending on which destination form the PDF uses.",
      },
      {
        q: "What's the difference vs PDF Annotations Export?",
        a: "Different annotation types. /Link is its own /Subtype — that's what this tool surfaces. Other annotations (highlights, comments, sticky notes, drawings) go to PDF Annotations Export. The two tools are complementary scans of the same /Annots array.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "Want comments + highlights too?",
      text: "PDF Annotations Export pulls every comment, highlight, and sticky note — same single byte-stream pass.",
      linkHref: "/tool/pdf-annotations",
      linkLabel: "Try PDF Annotations Export",
    },
  },

  "pdf-annotations": {
    useCasesTitle: "Why people export PDF annotations",
    useCasesIntro:
      "Annotations are the layer most PDF tools hide. Exporting them turns a markup-heavy PDF into a structured review log you can sort, filter, and act on.",
    useCases: [
      {
        icon: "Edit",
        title: "Manuscript review",
        text: "Editors and academic reviewers leave comments throughout a draft. Export the annotations log so authors get a clean change list instead of having to scroll the source.",
      },
      {
        icon: "Shield",
        title: "Legal redline tracking",
        text: "Multiple lawyers annotate a contract. Export consolidates every comment with author and timestamp — far more reviewable than the PDF itself.",
      },
      {
        icon: "Search",
        title: "Research note-taking",
        text: "Highlights and sticky notes across a research paper. Export to .csv, paste into Notion / Obsidian, build a structured reading-notes archive.",
      },
      {
        icon: "Convert",
        title: "Feedback consolidation",
        text: "Design or product reviews where multiple stakeholders annotate the same PDF. Export turns 50 scattered comments into a sortable spreadsheet.",
      },
      {
        icon: "Book",
        title: "Audit trail",
        text: "Compliance workflows where annotations need to be archived separately from the source PDF. Export creates a permanent record with author + date.",
      },
    ],
    howWorksTitle: "How PDF Annotations Export works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser walks every page's /Annots array.",
      },
      {
        step: "2",
        title: "Click Export annotations",
        text: "We surface every annotation except /Link (those go to Extract Links). Subtype, author, date, color, content text per annotation.",
      },
      {
        step: "3",
        title: "Copy or export",
        text: "Copy as JSON for pipelines, or download as CSV for spreadsheets. Annotations are grouped by page in the visible output.",
      },
    ],
    faqs: [
      {
        q: "What annotation types does it surface?",
        a: "Highlights, underlines, strikeouts, sticky notes, FreeText, ink drawings, stamps, shapes, and other comment-like types. Skipped: /Link (use Extract Links), /Widget (form fields — use PDF Form Inspector), /Popup (those are auxiliary to comments, not standalone).",
      },
      {
        q: "Do exported annotations include the actual highlighted text?",
        a: "We include the /Contents text, which is the comment body the annotator typed. We do NOT include the underlying text the highlight covers — that would require coordinate-based text extraction we don't yet do. Use Search in PDF if you need the highlighted source text.",
      },
      {
        q: "What if the annotation has no content?",
        a: "Many highlights and underlines don't have a typed comment — just the markup. We still list them with empty content so you can see the markup pattern. Filter on non-empty content for comments only.",
      },
      {
        q: "Color information — what's the format?",
        a: "Hex color codes (#RRGGBB) for visual reference. Useful for filtering — many review workflows use color conventions (yellow = important, red = blocker, green = approved).",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "Need links too?",
      text: "Extract Links from PDF surfaces /Link annotations specifically — separate scan, complementary output.",
      linkHref: "/tool/pdf-links",
      linkLabel: "Try Extract Links",
    },
  },

  "pdf-javascript": {
    useCasesTitle: "Why people scan PDFs for JavaScript",
    useCasesIntro:
      "PDFs can contain JavaScript that fires on open, on form fill, on link click. Most users don't expect this — and most malicious PDFs use it. Knowing what's in there matters.",
    useCases: [
      {
        icon: "Shield",
        title: "Security review",
        text: "Suspicious PDF in your inbox? Scan for embedded JS before opening. High-severity handlers (network requests, file system access) are red flags for phishing or malware.",
      },
      {
        icon: "Search",
        title: "Compliance audit",
        text: "PDF/A and many regulatory standards forbid JavaScript. Quickly verify a document is JS-free before submitting to an archive or compliance pipeline.",
      },
      {
        icon: "Convert",
        title: "Migration / re-export",
        text: "Forms with JS validation behave differently across viewers. If you're re-exporting an old form, knowing the JS surface helps you reproduce or replace it.",
      },
      {
        icon: "Edit",
        title: "Documentation",
        text: "Inheriting a fillable PDF from a previous developer. Scan for JS handlers to understand the form's behavior before modifying it.",
      },
      {
        icon: "Book",
        title: "Forensic analysis",
        text: "Investigating a suspicious document — the JS handler list shows triggers (open, form-fill, link-click) and code previews to assess attack surface.",
      },
    ],
    howWorksTitle: "How PDF JavaScript Detector works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser scans for /JS and /JavaScript tokens across the entire document.",
      },
      {
        step: "2",
        title: "Click Scan for JavaScript",
        text: "We surface every JS handler with its trigger, location (document/page/form-field/link/named), and a 200-char code preview.",
      },
      {
        step: "3",
        title: "Review severity",
        text: "Each handler gets a heuristic severity: high (network/file system access), medium (form manipulation), low (cosmetic). High-severity ones deserve careful review.",
      },
    ],
    faqs: [
      {
        q: "Is the severity classification reliable?",
        a: "Heuristic, not authoritative. We classify based on JS API patterns (xhr/fetch/launchURL = high; getField/setField = medium; everything else = low). It's a triage signal — high-severity handlers in an unsolicited PDF deserve a careful read; low-severity is usually benign form math.",
      },
      {
        q: "Does it execute the JavaScript?",
        a: "No. We only read the code as static text — it never runs. That's the whole point: you can inspect a suspicious PDF safely without opening it in a viewer that would execute its handlers.",
      },
      {
        q: "What if the PDF has no JavaScript?",
        a: "We tell you clearly with a 'No JavaScript detected' headline. That's the safer state — a PDF without scripts is statically readable, which is what archive standards require and what cautious viewers expect.",
      },
      {
        q: "Why might my PDF have JavaScript I didn't put there?",
        a: "Form-builder tools (Adobe LiveCycle, FormCalc) inject JS for validation and calculation. Print-driver software sometimes adds open-actions for analytics. Older Acrobat Pro features add helper scripts. Most of these are low-severity — 'high' is the one to focus on.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser. The whole point of a security tool is not to upload the suspicious file you're checking.",
      },
    ],
    cta: {
      title: "Want full archive compliance?",
      text: "PDF/A Compliance Check confirms whether your PDF meets archive standards — JS-free is one of the requirements.",
      linkHref: "/tool/pdf-a-check",
      linkLabel: "Try PDF/A Check",
    },
  },

  "pdf-accessibility": {
    useCasesTitle: "Why people audit PDF accessibility",
    useCasesIntro:
      "Accessible PDFs aren't optional anymore — DOJ ADA Title II, Section 508, EN 301 549, AODA. The deadlines are real, the lawsuits are real, and most PDFs fail.",
    useCases: [
      {
        icon: "Shield",
        title: "ADA / Section 508 compliance",
        text: "U.S. public entities must meet WCAG 2.1 AA for digital content under DOJ Title II. PDFs are explicitly in scope. Audit yours before deadlines or complaint investigations.",
      },
      {
        icon: "Edit",
        title: "Pre-publish QA",
        text: "Marketing teams shipping a customer-facing PDF (whitepaper, brochure). Accessibility isn't just law — it's reach. Tagged PDFs are searchable, reflowable, and AT-friendly.",
      },
      {
        icon: "Book",
        title: "Education / textbook prep",
        text: "Schools and publishers face strict accessibility rules. Audit textbooks and course materials before distribution to confirm screen-reader compatibility.",
      },
      {
        icon: "Search",
        title: "Procurement / vendor review",
        text: "Buying software or content from a vendor. Their PDFs are part of your accessibility footprint. Audit before signing contracts.",
      },
      {
        icon: "Sparkle",
        title: "Document remediation triage",
        text: "Accessibility teams have backlogs of PDFs to fix. Audit to score severity, prioritize the worst offenders, batch the easy fixes.",
      },
    ],
    howWorksTitle: "How PDF Accessibility Checker works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser reads structural markers in your browser.",
      },
      {
        step: "2",
        title: "Click Audit accessibility",
        text: "We check tagged-PDF flag, structure tree presence, language, title metadata, alt-text presence on tagged figures, encryption, and JS interference.",
      },
      {
        step: "3",
        title: "Review the score",
        text: "0–100 score with per-check pass/fail and severity (must-fix vs should-fix). Each finding includes guidance for how to fix.",
      },
    ],
    faqs: [
      {
        q: "Is this a substitute for a real accessibility audit?",
        a: "No. We check structural markers — necessary but not sufficient for true accessibility. Color contrast, reading-order quality, alt-text correctness, and color-as-only-information violations require human review or rendered-pixel analysis we don't do. Use this as a triage tool, not a final verdict.",
      },
      {
        q: "What WCAG / standards does this map to?",
        a: "The structural checks align with WCAG 2.1 SC 1.3.1 (Info and Relationships), 1.3.2 (Meaningful Sequence), 3.1.1 (Language of Page), 4.1.2 (Name, Role, Value). PDF/UA-1 (ISO 14289-1) is the PDF-specific accessibility standard and these checks form a baseline — not a complete validation.",
      },
      {
        q: "Why does my PDF score 0 even though it 'looks fine'?",
        a: "Visual appearance and structural accessibility are different things. A PDF that LOOKS accessible to sighted readers can be completely opaque to screen readers if it isn't tagged. Score 0 means missing the must-fix structural foundation.",
      },
      {
        q: "How do I fix the issues?",
        a: "Most must-fix items (tagged PDF, structure tree, language) require re-exporting from the source application with accessibility options enabled. Acrobat Pro can also retroactively tag a PDF and add language. Alt text for images requires a human author — software can detect missing alt, not invent it.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "Want to confirm archive standard?",
      text: "PDF/A Compliance Check verifies whether the document meets PDF/A archive standards (which often align with accessibility requirements).",
      linkHref: "/tool/pdf-a-check",
      linkLabel: "Try PDF/A Check",
    },
  },

  "pdf-a-check": {
    useCasesTitle: "Why people check PDF/A compliance",
    useCasesIntro:
      "PDF/A is the archive standard — government records, legal filings, library acquisitions. Non-compliant files get rejected; compliant ones get preserved correctly for decades.",
    useCases: [
      {
        icon: "Shield",
        title: "Government / legal filing",
        text: "Court e-filing systems and government records portals often require PDF/A. Verify before submission so a non-compliant file doesn't get bounced back.",
      },
      {
        icon: "Book",
        title: "Library / repository deposit",
        text: "Institutional repositories, journal archives, and digital libraries mandate PDF/A for long-term preservation. Confirm compliance before deposit.",
      },
      {
        icon: "Search",
        title: "Compliance audit",
        text: "Periodic checks across an organization's PDF library to confirm archived materials still meet PDF/A. Issues like un-embedded fonts can creep in via re-export.",
      },
      {
        icon: "Edit",
        title: "Re-export QA",
        text: "Confirming a 're-saved as PDF/A' export actually meets the standard. Some PDF software claims PDF/A export but produces non-compliant output.",
      },
      {
        icon: "Convert",
        title: "Migration prep",
        text: "Moving a document archive to a system that requires PDF/A. Audit the existing files first to understand the scope of remediation needed.",
      },
    ],
    howWorksTitle: "How PDF/A Check works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser reads XMP markers + composite checks (fonts, encryption, JS).",
      },
      {
        step: "2",
        title: "Click Check PDF/A compliance",
        text: "We surface the declared level (PDF/A-1a/1b/2a/2b/2u/3a/3b/3u or none) plus per-requirement pass/fail.",
      },
      {
        step: "3",
        title: "Review findings",
        text: "Headline verdict + itemized checks. Failures include guidance for fixing (typically: re-export with embed-fonts, no-encryption, no-JS).",
      },
    ],
    faqs: [
      {
        q: "Is this a substitute for veraPDF or Acrobat Pro?",
        a: "No — heuristic only. veraPDF runs hundreds of structural validations including color-profile correctness, transparency rules, and metadata-XMP cross-references. We surface the major signals (declaration markers, fonts embedded, no encryption/JS, XMP present) to give you a fast triage. For authoritative compliance, run veraPDF or use Acrobat Pro's Preflight.",
      },
      {
        q: "What's the difference between the levels?",
        a: "Part 1/2/3: PDF/A-1 is the strictest (PDF 1.4 base, no transparency); -2 added PDF 1.7 features; -3 allows attachments. Conformance a/b/u: 'b' = visually accurate, 'a' = accessible (tagged), 'u' = unicode mapping. Most archive workflows accept any level; some specify a minimum (often -2b or -3b).",
      },
      {
        q: "My PDF says 'Not PDF/A'. How do I make it one?",
        a: "Re-export from the source application with 'PDF/A' selected as the format (Word, Acrobat, LibreOffice all support this). Or use Acrobat Pro's 'Save As Other > Archivable PDF (PDF/A)' to convert in place. Make sure all fonts embed and metadata is filled.",
      },
      {
        q: "Why might a PDF declare PDF/A but fail my checks?",
        a: "PDFs can claim PDF/A in metadata while violating actual requirements (this is annoyingly common). Possibilities: a font got swapped during a re-save, an encryption was added, a script was injected. Our checks catch these gaps; veraPDF would catch many more.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "For print production instead?",
      text: "PDF/X Compliance Check is the print-prep counterpart — verifies fonts embedded, output intent, trim box, and the other PDF/X requirements.",
      linkHref: "/tool/pdf-x-check",
      linkLabel: "Try PDF/X Check",
    },
  },

  "pdf-x-check": {
    useCasesTitle: "Why people check PDF/X compliance",
    useCasesIntro:
      "PDF/X is the print-production standard. Print shops require it. Non-compliant files come back substituted, color-shifted, or rejected entirely.",
    useCases: [
      {
        icon: "Edit",
        title: "Print shop submission",
        text: "Most commercial print shops require PDF/X-1a, X-3, or X-4. Verify before sending — a rejected file means a delayed deadline and re-export work.",
      },
      {
        icon: "Shield",
        title: "Brand / agency QA",
        text: "Agencies producing customer-facing print collateral. Confirm every PDF is PDF/X compliant before client review or vendor handoff.",
      },
      {
        icon: "Convert",
        title: "Re-export verification",
        text: "InDesign, QuarkXPress, Affinity all export PDF/X — but settings matter. Confirm the output actually has the markers, embedded fonts, and output intent the standard requires.",
      },
      {
        icon: "Book",
        title: "Magazine / book production",
        text: "Editorial workflows where every issue must meet PDF/X for the printer. Audit before deadline so issues don't surface at the final stage.",
      },
      {
        icon: "Sparkle",
        title: "Spec compliance",
        text: "Vendors specifying PDF/X-4 (with transparency) for modern print, or PDF/X-1a (no transparency) for legacy presses. Confirm the right version.",
      },
    ],
    howWorksTitle: "How PDF/X Check works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser reads XMP / trailer markers + composite checks (fonts, output intent, trim/bleed boxes).",
      },
      {
        step: "2",
        title: "Click Check PDF/X compliance",
        text: "We surface the declared version (PDF/X-1a, X-3, X-4 or none) plus per-requirement pass/fail.",
      },
      {
        step: "3",
        title: "Review findings",
        text: "Headline verdict + itemized checks. Failures include guidance — typically: embed all fonts, declare an Output Intent ICC profile, define TrimBox on every page.",
      },
    ],
    faqs: [
      {
        q: "Is this a substitute for a real PDF/X validator?",
        a: "No — heuristic only. Adobe Acrobat's Preflight or callas pdfaPilot run hundreds of additional checks (transparency rules per version, color-space restrictions, separation handling). We surface the major signals to give you a fast triage. For authoritative validation, run Preflight before sending to print.",
      },
      {
        q: "Which version should I use?",
        a: "PDF/X-1a (2001/2003) is legacy CMYK-only — wide press support but no transparency. PDF/X-3 added device-independent color (RGB+ICC). PDF/X-4 (2010) added transparency and is the modern default for most digital printing. Ask your print shop which they require — many spec PDF/X-4 today.",
      },
      {
        q: "My PDF fails 'Output intent declared' — what's that?",
        a: "PDF/X requires you to declare the target print conditions (paper, ink, press) via an ICC profile. Common ones: 'Coated FOGRA39' for European coated press, 'GRACoL 2013' for North American coated. Set it during PDF export or via Acrobat Pro's Output Preview.",
      },
      {
        q: "Why does my PDF need a trim box?",
        a: "PDF/X requires every page to have a /TrimBox or /ArtBox defining the final trimmed page edge — separate from the bleed area. Without it, the print shop doesn't know where to cut. Most print-prep apps set this automatically when 'PDF/X' export is selected.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Pure byte-stream parsing in your browser.",
      },
    ],
    cta: {
      title: "For archives instead of print?",
      text: "PDF/A Compliance Check is the archive-standard counterpart — verifies fonts, no encryption, no JS, and the other PDF/A requirements.",
      linkHref: "/tool/pdf-a-check",
      linkLabel: "Try PDF/A Check",
    },
  },

  "pdf-fonts": {
    useCasesTitle: "Why people inspect PDF fonts",
    useCasesIntro:
      "Non-embedded fonts get substituted at the printer with whatever's installed. The result is visibly wrong glyphs and inconsistent spacing. Print shops and designers need to know what's embedded BEFORE sending to print.",
    useCases: [
      {
        icon: "Edit",
        title: "Print prep",
        text: "Print shops require all fonts embedded. Confirm before sending to ensure the printer doesn't substitute glyphs and ruin the layout.",
      },
      {
        icon: "Sparkle",
        title: "PDF/A and PDF/X compliance",
        text: "Archive (PDF/A) and print (PDF/X) standards mandate font embedding. Validators check this exact thing — knowing in advance saves a re-export.",
      },
      {
        icon: "Shield",
        title: "Brand consistency",
        text: "Marketing teams confirming brand fonts are embedded in deliverables. Substituted fonts visibly break brand standards on customer-facing materials.",
      },
      {
        icon: "Book",
        title: "Academic submissions",
        text: "Many journals and theses require font embedding for archival. Verify before submitting to avoid a 'please re-export' email weeks later.",
      },
      {
        icon: "Convert",
        title: "Forensic analysis",
        text: "Fonts can be a forensic signal — what software produced the PDF, when, on what platform. The font list narrows down the source.",
      },
    ],
    howWorksTitle: "How PDF Font Inspector works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Byte parser walks every page's font resources.",
      },
      {
        step: "2",
        title: "Click Inspect fonts",
        text: "We dedupe fonts by object number, check the FontDescriptor for /FontFile* refs (embedded), and detect subsetted fonts via the 6-letter prefix pattern.",
      },
      {
        step: "3",
        title: "Review and export",
        text: "Color-coded badges for embedded vs not. Page list per font. Copy as JSON or download as CSV.",
      },
    ],
    faqs: [
      {
        q: "Why does font embedding matter?",
        a: "Non-embedded fonts get substituted at the printer with whatever's installed. Result: visibly wrong glyphs, inconsistent spacing, sometimes complete unreadability. Print shops universally require embedded fonts. PDF/A and PDF/X compliance also require it.",
      },
      {
        q: "What does 'subsetted' mean?",
        a: "Modern PDFs often embed only the glyphs actually used — saves file size dramatically. The PDF spec marks subsetted fonts with a 6-letter random prefix (e.g. ABCDEF+TimesNewRoman). Subsetted fonts are still embedded — the prefix just signals the optimization.",
      },
      {
        q: "What if the inspector shows non-embedded fonts?",
        a: "Use a tool like Acrobat Pro to embed them, or re-export the source document with 'Embed all fonts' checked. The standard 14 PDF fonts (Helvetica, Times, Courier etc.) are technically allowed unembedded but most modern workflows embed everything for safety.",
      },
      {
        q: "Why are some fonts shown only on a subset of pages?",
        a: "PDF references fonts per page. A small font (a sidebar caption font, say) might only appear on a few pages while the body text font appears on all. The page list per font reflects exactly that.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Byte-stream parser runs in your browser.",
      },
    ],
    cta: {
      title: "Want full document overview?",
      text: "PDF Inspector adds page count, dimensions, word count, metadata, and more — same in-browser, one drop.",
      linkHref: "/tool/pdf-inspector",
      linkLabel: "Try PDF Inspector",
    },
  },

  // ----- Wave 9: pdf-lib writable tools (2026-04-27) ---------------
  // First wave to ship a writable engine. Each longform leans into
  // the "client-side, no upload, no watermark" angle — that's the
  // single biggest differentiator vs iLovePDF / Smallpdf for these
  // four head-term tools.
  merge: {
    useCasesTitle: "Why people merge PDFs",
    useCasesIntro:
      "Merging is the most-searched PDF tool on the web. Whether you're consolidating a sign-off package, building a single deliverable from multiple drafts, or stitching scanned pages back together, the workflow is the same — and we run it in your browser.",
    useCases: [
      {
        icon: "Receipt",
        title: "Expense reports",
        text: "Combine receipts, invoices, and a coversheet into one PDF for finance. Order matters — drag to reorder so the coversheet stays on top.",
      },
      {
        icon: "File",
        title: "Multi-author drafts",
        text: "When each contributor sends their section as a separate PDF, merge them into a single deliverable without rewriting layout in Word.",
      },
      {
        icon: "Scan",
        title: "Scanned documents",
        text: "Phone scanners often save each page as its own PDF. Merge them back into one document so it can be filed, signed, or emailed as a unit.",
      },
      {
        icon: "Book",
        title: "Lecture notes & study packs",
        text: "Combine lecture handouts, slide exports, and reading PDFs into one revision file. Keeps the term&rsquo;s material in one place.",
      },
      {
        icon: "Shield",
        title: "Audit packages",
        text: "Compliance reviews often want every supporting document in one bundle. Merge ledger statements + invoices + reconciliations into a single auditor PDF.",
      },
      {
        icon: "Edit",
        title: "Sign-off packets",
        text: "Sales contracts, statements of work, NDAs — merge into one signing flow so the recipient gets a single attachment instead of five.",
      },
    ],
    howWorksTitle: "How Merge PDFs works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDFs",
        text: "Up to 100 MB each, no count limit. Files stay in your browser — pdf-lib runs as JavaScript, no upload.",
      },
      {
        step: "2",
        title: "Reorder if needed",
        text: "Drag list items to set the final order. Order = output sequence; first listed becomes page 1.",
      },
      {
        step: "3",
        title: "Click Merge & download",
        text: "We copy every page from each input into a fresh PDF, save with object streams (smaller output), and trigger the download.",
      },
    ],
    faqs: [
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib is a pure-JavaScript library that runs entirely in your browser. There&rsquo;s no upload, no server processing, and no copy of your file on our infrastructure. You can verify in DevTools → Network tab — there&rsquo;s no outbound request when you click Merge.",
      },
      {
        q: "Will the output be watermarked?",
        a: "No. Merge is free, no signup, no watermark. The output is a clean PDF ready to share. We make money on AI tools (chat, summarize, translate, etc.); the free utility tools are loss leaders to bring you here.",
      },
      {
        q: "What about bookmarks, links, and form fields?",
        a: "Page content is preserved exactly. Internal bookmarks and cross-page hyperlinks are NOT remapped to the new page positions — pdf-lib v1.17 doesn&rsquo;t support that. If your inputs have heavy bookmark structures, expect them to point to the wrong pages in the merged output. Most users aren&rsquo;t affected; flag it if you are.",
      },
      {
        q: "Is there a limit on file count or size?",
        a: "100 MB per input. No hard limit on count, but the browser tab will get sluggish past about 200 MB total. For massive merges, split the work: merge 5 inputs into one, then merge that with the next 5, and so on.",
      },
      {
        q: "Will encrypted PDFs work?",
        a: "Owner-restriction-only PDFs (no-print, no-copy, but no password to open) work fine. PDFs that require a password to open will fail — unlock them first with our Unlock PDF tool, or with Adobe Acrobat / the source app, then merge.",
      },
      {
        q: "Why does the output file feel bigger than the inputs combined?",
        a: "Each input PDF has its own embedded fonts, images, and metadata. When merging, those resources can&rsquo;t always be deduplicated across inputs (pdf-lib doesn&rsquo;t fingerprint resources across documents). The output is correct — it&rsquo;s just less optimized than a single document authored from scratch. For aggressive shrinking, run a server-side compressor afterwards.",
      },
    ],
    cta: {
      title: "Want to split PDFs instead?",
      text: "Split PDF turns one big PDF into multiple smaller files — by every page, custom ranges, or fixed chunks. Same in-browser pdf-lib engine.",
      linkHref: "/tool/split",
      linkLabel: "Try Split PDF",
    },
  },

  split: {
    useCasesTitle: "Why people split PDFs",
    useCasesIntro:
      "A single PDF often holds many logical units — chapters, expense receipts, contracts in a packet. Splitting lets you isolate each unit so it can be filed, shared, or signed independently. Common in document management, legal, and education workflows.",
    useCases: [
      {
        icon: "Pages",
        title: "Per-chapter exports",
        text: "Textbooks and reports come as one fat PDF. Split by every page or custom range so each chapter exists as its own file for distribution to students or reviewers.",
      },
      {
        icon: "Receipt",
        title: "Receipt extraction",
        text: "Bank statements often combine months of receipts. Split into per-page PDFs so each transaction can be filed independently with the matching expense.",
      },
      {
        icon: "Shield",
        title: "Compliance archiving",
        text: "Audit packages need each individual document filed separately. Split a master bundle into the constituent files for retention indexing.",
      },
      {
        icon: "Edit",
        title: "Selective sharing",
        text: "Send only pages 4–7 to a reviewer rather than the whole 80-page contract. Use a custom range to extract exactly that slice.",
      },
      {
        icon: "Book",
        title: "Journal article extraction",
        text: "Conference proceedings come as one giant PDF. Split by page range to extract individual papers for citation and archival.",
      },
      {
        icon: "Scan",
        title: "Scanned multi-doc batches",
        text: "Office scanners often save 50 documents as one PDF. Split them back into per-document files using the scanner&rsquo;s known page count per doc.",
      },
    ],
    howWorksTitle: "How Split PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. pdf-lib parses the document tree in your browser — nothing uploads.",
      },
      {
        step: "2",
        title: "Pick a split mode",
        text: "Every page (each becomes its own PDF), Fixed-size chunks (e.g. 5 pages per output), or Custom ranges (1-3, 5, 8-10 → three outputs).",
      },
      {
        step: "3",
        title: "Download outputs",
        text: "Single-output downloads directly. Multi-output bundles into a .zip with deterministic filenames so you can find each piece.",
      },
    ],
    faqs: [
      {
        q: "Is anything uploaded?",
        a: "No. The split happens entirely in your browser via pdf-lib. Even the .zip bundling for multi-output is built locally with JSZip. Verifiable in DevTools → Network — no upload request, no server round-trip.",
      },
      {
        q: "What&rsquo;s the difference between Every page, Chunks, and Ranges?",
        a: "Every page = one PDF per page. Chunks = group pages into fixed-size outputs (e.g. chunk size 3 turns a 12-page PDF into four 3-page PDFs). Ranges = you specify the splits explicitly. Comma-separated, hyphenated. So &lsquo;1-3, 5, 8-12&rsquo; produces three outputs: pages 1-3, just page 5, and pages 8-12.",
      },
      {
        q: "Will bookmarks point to the right pages in each split output?",
        a: "Bookmarks that target pages within an individual split chunk WILL work. Bookmarks that targeted pages across the original document but now span multiple outputs are dropped. This is a pdf-lib v1.17 limitation; for production-quality bookmark surgery you need server-side qpdf, which we&rsquo;re evaluating.",
      },
      {
        q: "Is there a hard limit on input size or output count?",
        a: "100 MB input. Output count is bounded by your machine&rsquo;s memory — splitting a 1000-page PDF into 1000 single-page PDFs uses real RAM. Most laptops handle a few hundred outputs cleanly; for thousands, split iteratively (custom ranges in batches).",
      },
      {
        q: "Does the output preserve forms, signatures, and annotations?",
        a: "Page-level content yes. Document-level forms (where the AcroForm dictionary spans pages) are partially preserved — fields on a split page work, fields that crossed pages may not. Signatures invalidate after any split (that&rsquo;s the cryptographic guarantee — re-sign the resulting outputs if needed).",
      },
      {
        q: "Will the outputs be smaller than the input?",
        a: "Roughly proportional. If your input is 10 MB across 100 pages, a single-page output runs about 100 KB plus shared resources (fonts, images repeated across pages). Splitting doesn&rsquo;t compress — for that, run our compressor server-side after splitting.",
      },
    ],
    cta: {
      title: "Want to merge PDFs instead?",
      text: "Merge PDFs combines multiple inputs into one. Same in-browser pdf-lib engine, no upload, no watermark.",
      linkHref: "/tool/merge",
      linkLabel: "Try Merge PDFs",
    },
  },

  rotate: {
    useCasesTitle: "Why people rotate PDF pages",
    useCasesIntro:
      "Rotation is one of the cheapest fixes in document workflows. A scanner picks up a page upside down, a phone snap lands sideways, an export comes through 90° off — rotating fixes all of it without re-scanning or re-exporting.",
    useCases: [
      {
        icon: "Scan",
        title: "Sideways scans",
        text: "Office scanners frequently rotate landscape-fed pages. Fix every affected page in one pass with a custom range.",
      },
      {
        icon: "Image",
        title: "Phone-camera PDFs",
        text: "Mobile scan apps save in whatever orientation the phone was held. Rotate to upright for archival.",
      },
      {
        icon: "Book",
        title: "Mixed-orientation reports",
        text: "Engineering reports interleave portrait analysis pages with landscape data tables. Rotate the data tables 90° so they read on screen without head-tilting.",
      },
      {
        icon: "Shield",
        title: "Compliance review prep",
        text: "Auditors expect documents in a uniform orientation. Rotate pages to match before submitting the review package.",
      },
      {
        icon: "Edit",
        title: "Print-prep correction",
        text: "Pages laid out in landscape but exported as portrait need rotating before press — saves a re-export and a billable hour.",
      },
      {
        icon: "Pages",
        title: "Page-by-page cleanup",
        text: "When a 200-page document has 4 misaligned pages, type the page numbers (e.g. &lsquo;7, 23, 88, 154&rsquo;) and fix only those.",
      },
    ],
    howWorksTitle: "How Rotate PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. pdf-lib parses page tree locally — no upload.",
      },
      {
        step: "2",
        title: "Pick angle and pages",
        text: "90° / 180° / 270° clockwise. Specify pages as &lsquo;all&rsquo;, individual numbers (&lsquo;1, 5, 12&rsquo;), or ranges (&lsquo;7-12&rsquo;).",
      },
      {
        step: "3",
        title: "Download",
        text: "We adjust the /Rotate entry on each affected page and re-save. Lossless — the underlying content stream is untouched. Runs in milliseconds even on huge files.",
      },
    ],
    faqs: [
      {
        q: "Is rotation lossless?",
        a: "Yes. We modify the page&rsquo;s /Rotate entry — the actual content stream (text, images, vector paths) stays exactly as it was. Quality is identical to the input. This is much better than re-exporting through a print driver, which can re-encode images and fonts.",
      },
      {
        q: "What about double-rotation? If I rotate 90° twice?",
        a: "We add to the existing rotation rather than overwriting. So if a page is already rotated 90° and you rotate again by 90°, the result is 180°. This matches user intent — rotate is a relative action, not an absolute reset.",
      },
      {
        q: "How do I rotate counter-clockwise (left)?",
        a: "Use 270°. PDF rotation is always clockwise in the spec, so 270° clockwise lands at the same place as 90° counter-clockwise.",
      },
      {
        q: "Can I rotate by arbitrary angles like 45°?",
        a: "No — the PDF spec only supports 90° increments via /Rotate. Arbitrary angles require modifying the content stream itself (re-rendering each page through a transform matrix), which loses fidelity. For arbitrary rotation use a tool like Adobe Acrobat or a screenshot-edit-reinsert workflow.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib runs in JavaScript in your browser. The PDF never leaves your device. Verifiable in DevTools.",
      },
      {
        q: "Will printing pick up the rotation?",
        a: "Yes. /Rotate is a first-class PDF spec entry — print drivers, viewers, and OCR engines all honor it. Acrobat, Apple Preview, Chrome, Firefox, and every printer we&rsquo;ve tested respect it correctly.",
      },
    ],
    cta: {
      title: "Need to inspect a PDF first?",
      text: "PDF Inspector tells you which pages are landscape vs portrait, with a mixed-orientation warning. Run it before rotating to know exactly which pages need fixing.",
      linkHref: "/tool/pdf-inspector",
      linkLabel: "Try PDF Inspector",
    },
  },

  unlock: {
    useCasesTitle: "Why people unlock PDFs",
    useCasesIntro:
      "PDFs come with two distinct flavors of restriction. Owner-only PDFs let you read freely but block printing, copying, or editing. User-password PDFs require a password just to open. We unlock the first cleanly; the second needs the password (we&rsquo;re honest about that).",
    useCases: [
      {
        icon: "Receipt",
        title: "Bank statements & bills",
        text: "Many statements are issued as &lsquo;secured&rsquo; PDFs that block copy-paste of account numbers. Unlock to copy the relevant rows into a spreadsheet for tracking.",
      },
      {
        icon: "Shield",
        title: "Vendor proposals",
        text: "Sales decks and proposals are often locked against editing. Unlock to comment, annotate, or counter-offer without printing-and-rescanning.",
      },
      {
        icon: "Edit",
        title: "Form filling",
        text: "Some PDFs are locked specifically to prevent form filling. Unlock to fill the form, then re-share as a normal PDF.",
      },
      {
        icon: "Book",
        title: "Academic e-books",
        text: "Textbooks downloaded from the library may be locked against printing or extracting study notes. Unlock for personal-use highlight extraction.",
      },
      {
        icon: "Pages",
        title: "Print-prep",
        text: "Print shops can&rsquo;t process locked PDFs — many require an unlocked copy. Unlock before sending to press.",
      },
      {
        icon: "Convert",
        title: "Pipeline integration",
        text: "Locked PDFs break OCR, search-index, and translation pipelines. Unlock as the first step so downstream tools can read the content.",
      },
    ],
    howWorksTitle: "How Unlock PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. pdf-lib loads with ignoreEncryption — works for owner-restriction PDFs.",
      },
      {
        step: "2",
        title: "We copy the pages",
        text: "Every page is copied into a fresh, unencrypted PDFDocument. The new document never had an encryption dictionary, so the output is guaranteed unlocked.",
      },
      {
        step: "3",
        title: "Download",
        text: "Plain PDF, no restrictions. Print, copy, edit, fill — full control. If your PDF needed a user password, we surface a friendly error pointing to Adobe.",
      },
    ],
    faqs: [
      {
        q: "What&rsquo;s the difference between owner-restriction and user-password PDFs?",
        a: "Owner-restriction = the PDF opens without a password but blocks specific actions (print, copy, edit). The content streams aren&rsquo;t actually encrypted with a strong key — the lock is essentially advisory. We can strip these. User-password = the PDF won&rsquo;t open without a password, and the content streams ARE encrypted with a key derived from that password. We can&rsquo;t crack those, and we&rsquo;re honest about it.",
      },
      {
        q: "Is this legal?",
        a: "Removing owner restrictions on a document YOU own (statements, your-own-work proposals, files you legitimately have rights to) is generally fine in most jurisdictions. Removing restrictions to circumvent copyright on commercial e-books or distribute restricted content is NOT — and we won&rsquo;t help with that. Use this responsibly on your own materials.",
      },
      {
        q: "Why do you reject password-protected PDFs?",
        a: "Two reasons. (1) Cracking passwords is computationally hard and we&rsquo;d be misleading you to suggest a free in-browser tool can do it reliably. (2) The strongest PDF encryption (AES-256, common since Acrobat 9) is genuinely secure with a strong password. If you forgot the password, our pdf-lib pipeline can&rsquo;t help — Adobe Acrobat with their commercial cracking tools, or asking the original sender, are your real options.",
      },
      {
        q: "Will the output preserve forms, signatures, annotations?",
        a: "Page content yes. Form data carries through if the form fields&rsquo; values aren&rsquo;t themselves encrypted (most aren&rsquo;t). Signatures invalidate — that&rsquo;s the cryptographic guarantee, signatures bind to a specific document state, and removing the encryption changes that state. If you need a signed-AND-unlocked PDF, ask the original signer to produce one.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib runs locally. Especially important for unlock — the file might be a sensitive statement or contract, and we&rsquo;d never upload it to a server. Verifiable in DevTools → Network.",
      },
      {
        q: "Output file size — bigger or smaller than input?",
        a: "Roughly the same, often slightly smaller. We re-save with object streams (modern compact format), so depending on the input&rsquo;s era and the source app, output can be 5-15% smaller. Content is identical.",
      },
    ],
    cta: {
      title: "Want to inspect a PDF&rsquo;s lock state first?",
      text: "PDF Inspector tells you whether a PDF is encrypted, what restrictions are set, and the metadata at a glance. Run it before unlocking so you know what you&rsquo;re working with.",
      linkHref: "/tool/pdf-inspector",
      linkLabel: "Try PDF Inspector",
    },
  },
};
