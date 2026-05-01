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
        text: "Up to 100 MB each, no count limit. PDFium renders a small first-page thumbnail next to each input so you can confirm what you uploaded. Files stay in your browser — pdf-lib runs as JavaScript, no upload.",
      },
      {
        step: "2",
        title: "Reorder if needed",
        text: "Drag list items to set the final order, or use the up/down buttons. Order = output sequence; first listed becomes page 1.",
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
        text: "Up to 100 MB. PDFium renders every page as a small thumbnail in your browser — no upload, files never leave your device.",
      },
      {
        step: "2",
        title: "Mark split points",
        text: "Click the &lsquo;Split here&rsquo; button on any page to insert a split after it. A live segment preview shows the resulting outputs (&lsquo;Pages 1-3&rsquo;, &lsquo;Pages 4-7&rsquo;, etc.). Bulk presets cover &lsquo;every page&rsquo; and &lsquo;in half&rsquo;.",
      },
      {
        step: "3",
        title: "Download outputs",
        text: "Single-output downloads directly. Multi-output bundles into a .zip with deterministic filenames so you can find each piece. Power users can switch to Advanced mode to type page ranges directly.",
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
        text: "Up to 100 MB. PDFium renders every page as a small thumbnail in your browser — no upload, files never leave your device.",
      },
      {
        step: "2",
        title: "Click pages to rotate",
        text: "Each thumbnail is clickable. Click once for 90°, again for 180°, again for 270°, again to reset. Bulk buttons rotate all pages at once.",
      },
      {
        step: "3",
        title: "Apply &amp; download",
        text: "We adjust the /Rotate entry per page via pdf-lib and re-save. Lossless — the underlying content stream is untouched. Runs in milliseconds even on huge files.",
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

  // ----- Tier 2: Extract / Delete Pages (PageGridTool base) -------
  "extract-pages": {
    useCasesTitle: "Why people extract PDF pages",
    useCasesIntro:
      "Most documents bundle many things — chapters, appendices, supporting evidence, supplementary tables — into one PDF. Extracting lets you isolate the bits that matter so they can be shared, filed, or studied without distributing the entire bundle.",
    useCases: [
      {
        icon: "Edit",
        title: "Sharing a single chapter",
        text: "Send only chapter 4 to a study group instead of forwarding the whole 300-page textbook. Click the pages, save the new PDF, attach.",
      },
      {
        icon: "Receipt",
        title: "Pulling specific receipts",
        text: "Bank statements bundle months of receipts. Extract just the three transactions for an expense report rather than the whole month.",
      },
      {
        icon: "Shield",
        title: "Compliance evidence",
        text: "Audit packages need specific exhibit pages without the surrounding context. Extract pages 7, 12, 23 into a single evidence PDF.",
      },
      {
        icon: "Book",
        title: "Citing a passage",
        text: "Legal briefs and academic papers often cite specific pages. Extract those pages alone for a court exhibit or reference attachment.",
      },
      {
        icon: "Pages",
        title: "Selective sharing",
        text: "Share pages 4–7 with one reviewer and pages 8–11 with another, without exposing the rest of the document. One PDF in, two extracts out.",
      },
      {
        icon: "Convert",
        title: "Building a custom table-of-contents",
        text: "Extract introduction + summary + conclusion pages from a long doc to make a 5-page executive briefing. Page order in the output mirrors selection order.",
      },
    ],
    howWorksTitle: "How Extract Pages works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium renders every page as a thumbnail in your browser — no upload, files never leave your device.",
      },
      {
        step: "2",
        title: "Click pages to keep",
        text: "Each thumbnail toggles selected/unselected on click. Selected pages get an accent border and a &lsquo;Keep&rsquo; badge. Bulk &lsquo;Select all&rsquo; / &lsquo;Invert&rsquo; / &lsquo;Clear&rsquo; cover the common cases.",
      },
      {
        step: "3",
        title: "Save the new PDF",
        text: "We copy your selected pages into a brand-new PDF via pdf-lib and trigger the download. Original is untouched.",
      },
    ],
    faqs: [
      {
        q: "Is anything uploaded?",
        a: "No. PDFium and pdf-lib both run as JavaScript / WebAssembly in your browser. The PDF never touches our servers. Verifiable in DevTools → Network.",
      },
      {
        q: "What&rsquo;s the difference between Extract Pages and Split PDF?",
        a: "Split PDF turns one PDF into multiple PDFs at split points (sections of the original). Extract Pages produces ONE new PDF with only the pages you picked — useful when you want a single curated subset, not several pieces. Extract is also non-contiguous: you can pick pages 1, 4, 7 and they all end up in one output.",
      },
      {
        q: "Are extracted pages in the original order?",
        a: "Yes. The output preserves source page order regardless of which order you clicked them. So clicking page 7 first then page 2 still produces an output where page 2 appears before page 7.",
      },
      {
        q: "Will bookmarks, links, and form fields work in the extracted PDF?",
        a: "Page-level content is preserved exactly. Cross-page bookmarks/links that point INTO your selection still work; ones pointing OUTSIDE the selection become dangling refs (the page no longer exists in the output). pdf-lib v1.17 doesn&rsquo;t remap these — for production-grade bookmark surgery use server-side qpdf.",
      },
      {
        q: "Is there a hard limit on input size or page count?",
        a: "100 MB input. PDFs with hundreds of pages will take a few seconds to render thumbnails — a progress card shows the count. The actual extract is fast (milliseconds even on 1000-page docs).",
      },
      {
        q: "Will the output file be smaller than the input?",
        a: "Roughly proportional to the page count. If you extract 5 pages from a 100-page 10 MB PDF, expect an output around 0.5–1 MB. Embedded fonts and images for those specific pages are copied in full (pdf-lib doesn&rsquo;t subset across documents). For aggressive shrinking, run a server-side compressor afterwards.",
      },
    ],
    cta: {
      title: "Want to remove pages instead?",
      text: "Delete Pages does the inverse: click pages to mark for removal, save the trimmed PDF. Same thumbnail grid, mirrored semantics.",
      linkHref: "/tool/delete-pages",
      linkLabel: "Try Delete Pages",
    },
  },

  "delete-pages": {
    useCasesTitle: "Why people delete pages from PDFs",
    useCasesIntro:
      "PDFs accumulate noise — blank pages from print drivers, draft cover sheets, scratch pages from scanners, pages with sensitive info that need to come out before sharing. Removing pages is the most common cleanup operation in document workflows.",
    useCases: [
      {
        icon: "Scan",
        title: "Blank scanner pages",
        text: "Office scanners produce blank pages when paper double-feeds or the last page fails to register. Mark them and remove with two clicks.",
      },
      {
        icon: "Edit",
        title: "Cover-sheet trimming",
        text: "Draft cover sheets and routing slips that came along with a document — strip them before forwarding, archiving, or printing the clean version.",
      },
      {
        icon: "Shield",
        title: "Privacy redaction",
        text: "Remove pages containing personal info, internal notes, or confidential exhibits before sharing externally. Cleaner than redacting individual fields when the whole page is out of scope.",
      },
      {
        icon: "Book",
        title: "Reading-pack cleanup",
        text: "Scanned textbooks often include exam-prep pages, advertisements, or pages from a different chapter. Remove the noise to get a clean study pack.",
      },
      {
        icon: "Receipt",
        title: "Statement clean-up",
        text: "Bank or credit-card statements include marketing inserts and disclaimers. Remove those pages to keep only the transaction history for record-keeping.",
      },
      {
        icon: "Pages",
        title: "Print-prep",
        text: "Some pages aren&rsquo;t needed for the printed version (digital-only links, navigation hints, &lsquo;page intentionally blank&rsquo;). Strip them before sending to press.",
      },
    ],
    howWorksTitle: "How Delete Pages works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium renders every page as a thumbnail in your browser — no upload, no server.",
      },
      {
        step: "2",
        title: "Click pages to remove",
        text: "Each thumbnail you click gets a red border, dims to 50% opacity, and shows a &lsquo;Remove&rsquo; badge — visual feedback that the page is going away. The bulk &lsquo;Invert&rsquo; button is handy when you want to keep most pages but drop a few.",
      },
      {
        step: "3",
        title: "Save the trimmed PDF",
        text: "We copy the un-marked pages into a new PDF via pdf-lib and trigger the download. We refuse to delete every page (the result would be empty); maximum is total - 1.",
      },
    ],
    faqs: [
      {
        q: "Is anything uploaded?",
        a: "No. PDFium and pdf-lib both run locally in your browser. The PDF never touches our servers — important when you&rsquo;re removing sensitive pages and don&rsquo;t want a copy on someone else&rsquo;s infrastructure.",
      },
      {
        q: "Why does it dim the thumbnails I select instead of highlighting them?",
        a: "Convention. In Extract Pages selected = &lsquo;keep&rsquo; (highlight). In Delete Pages selected = &lsquo;remove&rsquo; (fade). Dimming reads as &lsquo;going away&rsquo; — matches Photoshop&rsquo;s layer-visibility convention and Adobe Acrobat&rsquo;s page-thumbnail panel.",
      },
      {
        q: "Can I delete every page?",
        a: "No. The output PDF would be empty, which is invalid. The button caps your selection at total - 1. To clear an entire document, just don&rsquo;t use this tool.",
      },
      {
        q: "Are forms, links, signatures preserved on the kept pages?",
        a: "Page content is preserved exactly. Form-field values that lived on kept pages survive. Cross-page links that pointed into deleted pages become dangling — pdf-lib v1.17 doesn&rsquo;t reroute. Signatures invalidate the moment the document changes (cryptographic guarantee), so re-sign after if needed.",
      },
      {
        q: "Will bookmarks update to point to the right pages after deletion?",
        a: "Bookmarks pointing to KEPT pages may now point to wrong page numbers (since pages shifted). Bookmarks pointing to DELETED pages become dangling. pdf-lib doesn&rsquo;t remap these. Most users aren&rsquo;t affected; if you have heavy bookmark dependencies, flag it.",
      },
      {
        q: "Is the output smaller than the input?",
        a: "Yes, roughly proportionally. Removing 30 of 100 pages produces an output ~70% the size of the original. Resources unique to deleted pages (their embedded images and fonts) are dropped. Resources shared across pages stay.",
      },
    ],
    cta: {
      title: "Want to extract pages instead?",
      text: "Extract Pages does the inverse: click pages to keep, save them as a new PDF. Same thumbnail grid, mirrored semantics.",
      linkHref: "/tool/extract-pages",
      linkLabel: "Try Extract Pages",
    },
  },

  "page-numbers": {
    useCasesTitle: "Why people add page numbers",
    useCasesIntro:
      "Page numbers turn a PDF from a bag of pages into a navigable document. They&rsquo;re mandatory for legal exhibits, expected for academic submissions, and just plain useful when someone needs to reference &lsquo;page 47.&rsquo;",
    useCases: [
      { icon: "Shield", title: "Legal exhibits", text: "Court filings often require pagination on every supporting exhibit. Stamp Bates-style numbers on a binder of evidence in seconds." },
      { icon: "Book", title: "Academic submissions", text: "Theses, journal manuscripts, and conference papers expect page numbers. Add &lsquo;Page 1 of N&rsquo; before submission." },
      { icon: "File", title: "Multi-section reports", text: "When you concatenate sections from different sources, the original page numbers get out of sync. Re-number end-to-end so the table of contents matches." },
      { icon: "Receipt", title: "Reference packages", text: "Sales decks and proposals reviewed in meetings need pagination so attendees can call out &lsquo;back to page 12.&rsquo;" },
      { icon: "Edit", title: "Print-prep", text: "Print shops process paginated docs faster — saves a back-and-forth when re-prints are needed for specific pages." },
      { icon: "Pages", title: "Scan archives", text: "After scanning a stack of paper, page numbers help future-you find the page you need without flipping through the whole archive." },
    ],
    howWorksTitle: "How Add Page Numbers works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. Files stay in your browser — pdf-lib reads and writes locally." },
      { step: "2", title: "Pick position + format", text: "Six positions (corners + bottom/top center). Four formats: bare number, &lsquo;1 of N&rsquo;, &lsquo;Page 1&rsquo;, &lsquo;Page 1 of N.&rsquo; Font size from 6–48 pt." },
      { step: "3", title: "Apply &amp; download", text: "We embed Helvetica and stamp each page via drawText. Lossless overlay — the underlying content stream is untouched." },
    ],
    faqs: [
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser. The PDF never touches our servers." },
      { q: "Will the numbers overlap with existing content?", a: "Possibly — we draw on top of whatever&rsquo;s on the page. If the page already has a footer at the position you choose, the new number will overlap. Pick a different position, or strip existing footers first." },
      { q: "Can I number only certain pages?", a: "The current version numbers every page. A startPage option exists in the op but isn&rsquo;t exposed in the UI yet — for now, use Extract Pages first to isolate the pages, number them, and merge back." },
      { q: "What about Roman numerals or section-specific numbering?", a: "Not in v1. Most users want simple Arabic numerals. Section-aware numbering (&lsquo;i, ii, iii&rsquo; for front matter then &lsquo;1, 2, 3&rsquo; for the body) is on the roadmap." },
      { q: "Does the font support non-Latin scripts?", a: "Helvetica covers Latin + Western European characters. CJK scripts (Chinese, Japanese, Korean) need different fonts; not supported in v1." },
    ],
    cta: { title: "Need to rotate or reorder pages first?", text: "Rotate fixes upside-down pages before numbering. Sort Pages reorders before numbers go on.", linkHref: "/tool/rotate", linkLabel: "Try Rotate PDF" },
  },

  "repair-pdf": {
    useCasesTitle: "Why people repair PDFs",
    useCasesIntro:
      "PDFs break in surprising ways — interrupted downloads, broken export pipelines, unusual generators that produce technically-invalid-but-mostly-fine files. pdf-lib&rsquo;s permissive parser can rescue many of these without an Acrobat license.",
    useCases: [
      { icon: "Edit", title: "Interrupted downloads", text: "A network blip during download leaves the PDF with a corrupt xref. Reparse + re-save fixes it — no need to re-download." },
      { icon: "Convert", title: "Bad export pipelines", text: "Some generators (older office suites, custom report tools) produce PDFs with stale trailer dicts that strict viewers reject. pdf-lib accepts them; the re-save makes them universally valid." },
      { icon: "Shield", title: "Pre-archive cleanup", text: "Before archiving important docs, run them through repair so future viewers (10 years from now) can open them without quirks." },
      { icon: "File", title: "Email gateways", text: "Some corporate email scanners reject PDFs with unusual structure. Repair normalizes them so they pass through." },
      { icon: "Scan", title: "Scanner output", text: "Multifunction printers occasionally produce PDFs that open in Acrobat but break in browser viewers. Repair fixes the inconsistency." },
      { icon: "Pages", title: "Concatenated outputs", text: "When you cat two PDF files together (sometimes done by sloppy automation), you get a structurally invalid result. Repair recovers the document tree." },
    ],
    howWorksTitle: "How Repair PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. Even files that other viewers can&rsquo;t open often parse fine in pdf-lib." },
      { step: "2", title: "Click Repair", text: "We load with throwOnInvalidObject=false so pdf-lib swallows recoverable errors, then re-save with object streams for a clean output." },
      { step: "3", title: "Download", text: "Output is structurally clean: valid xref, well-formed trailer, normalized object streams. Page content is byte-identical." },
    ],
    faqs: [
      { q: "What can&rsquo;t this fix?", a: "Truncated files (the bytes after the truncation just don&rsquo;t exist), encrypted PDFs whose content streams are scrambled by a forgotten password, and content streams whose internal PostScript-style commands are themselves corrupt. For deeper damage, qpdf --repair (server-side) or Adobe Acrobat are the tools to try." },
      { q: "Will the page content change?", a: "No. We re-save the structural envelope; the page content streams pass through pdf-lib&rsquo;s parser into the new document unchanged. Visually identical." },
      { q: "Why does the output sometimes get smaller?", a: "We re-save with modern object streams (compact format). Older PDFs without object streams can shrink 5-15% during repair without any quality loss." },
      { q: "Is anything uploaded?", a: "No. pdf-lib parses + re-saves entirely in your browser." },
      { q: "Should I run this on every PDF as preventative maintenance?", a: "No need. Most PDFs are fine. Only run when a viewer flags errors, when archiving important docs long-term, or when a downstream tool rejects the file." },
    ],
    cta: { title: "Need to inspect the PDF first?", text: "PDF Inspector tells you what&rsquo;s inside before you repair — page count, encryption, metadata, mixed-orientation warnings.", linkHref: "/tool/pdf-inspector", linkLabel: "Try PDF Inspector" },
  },

  "strip-links": {
    useCasesTitle: "Why people strip hyperlinks",
    useCasesIntro:
      "Hyperlinks are great in screens, problematic on paper, and explicitly forbidden in some compliance regimes. Removing them is the single most common annotation-cleanup task before sharing a PDF outside its original context.",
    useCases: [
      { icon: "Edit", title: "Print prep", text: "Hyperlinks are decorative ink on paper — they consume blue ink, they create visual clutter, and they&rsquo;re unclickable. Strip before sending to press." },
      { icon: "Shield", title: "Archive compliance", text: "Some retention policies require static documents — no live URLs that could rot, redirect, or expose internal infrastructure. Strip before depositing into long-term archive." },
      { icon: "File", title: "External sharing", text: "Internal docs sometimes contain URLs to systems behind your VPN. Strip them before forwarding externally so recipients don&rsquo;t hit broken links." },
      { icon: "Receipt", title: "Touch-screen reading", text: "Reading PDFs on phones / tablets — accidental taps on links are jarring. Strip for a smoother reading experience." },
      { icon: "Book", title: "Academic distribution", text: "Some journals and submission portals reject PDFs with active URLs. Strip before upload." },
      { icon: "Convert", title: "Pipeline normalization", text: "When ingesting PDFs into a content pipeline (RAG, search, LLM context), live URLs sometimes confuse downstream tooling. Strip first to get clean text." },
    ],
    howWorksTitle: "How Strip Hyperlinks works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. Files stay in your browser." },
      { step: "2", title: "Click Remove all links", text: "We walk every page&rsquo;s /Annots array, identify entries with /Subtype = /Link, and drop them. Other annotations (highlights, comments, form widgets) stay." },
      { step: "3", title: "Download", text: "Output has the visible link text intact (if it was rendered as page content) but no clickable behavior. Save and share." },
    ],
    faqs: [
      { q: "Will the URL text still be visible?", a: "Yes, if it was rendered as actual page content. Hyperlink annotations are an OVERLAY that makes a region clickable — the underlying text (e.g. &lsquo;visit example.com&rsquo;) is part of the page content stream and is preserved." },
      { q: "What about other annotations?", a: "Highlights, comments, sticky notes, form fields, and signature widgets are ALL preserved. We touch only annotations whose /Subtype is /Link." },
      { q: "Does this remove URLs that aren&rsquo;t hyperlinks?", a: "No. URLs that exist only as text (someone typed &lsquo;https://...&rsquo;) without being made into clickable links are left alone — there&rsquo;s no annotation to remove." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser." },
      { q: "Will internal cross-references (bookmarks pointing within the PDF) be removed?", a: "No. Internal navigation goes through bookmarks (the outline tree), not /Link annotations. Bookmarks are preserved." },
    ],
    cta: { title: "Want to extract links instead?", text: "Extract Links from PDF lists every hyperlink with page references and CSV/JSON export. Useful for inventorying URLs before stripping them.", linkHref: "/tool/pdf-links", linkLabel: "Try Extract Links" },
  },

  "add-links": {
    useCasesTitle: "Why people add hyperlinks to PDFs",
    useCasesIntro:
      "Static PDFs become navigable when you add clickable regions. A logo links to the company site, a footer links to a privacy policy, a product code links to its catalog page. The pattern matches what HTML does for the web — except viewers honor it without any extra plugin.",
    useCases: [
      { icon: "Edit", title: "Branding + footer links", text: "Add a clickable logo or company-site URL on a finalized one-pager so recipients can jump to your site." },
      { icon: "Receipt", title: "Product / SKU pages", text: "On a printable catalog or invoice, link each line item to its product page or detail view." },
      { icon: "Book", title: "Citation refs", text: "Add a clickable DOI / arXiv link in a research summary so readers can verify the source." },
      { icon: "Shield", title: "Policy + terms links", text: "Add &lsquo;Privacy Policy&rsquo; / &lsquo;Terms&rsquo; links to a contract footer so legal references are one click away." },
      { icon: "File", title: "Cross-doc references", text: "Link to other PDFs hosted on your team&rsquo;s shared drive — recipients click through instead of hunting for the file." },
      { icon: "Pages", title: "Marketing + RSVP", text: "Link an &lsquo;RSVP&rsquo; button on an event flyer to a Google Form. Link a &lsquo;Reserve&rsquo; button on a sales sheet to your booking page." },
    ],
    howWorksTitle: "How Add Hyperlinks works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Drag a rectangle", text: "Click and drag on the page to define the clickable region. The rectangle gets an accent border + dashed outline (because it doesn&rsquo;t have a URL yet)." },
      { step: "3", title: "Type the URL + Save", text: "URL field appears in the config panel. Type the destination (https://… or mailto:…). Click Save link to commit. The rect turns solid blue. Drag again to add another." },
      { step: "4", title: "Apply &amp; download", text: "All saved links are stamped as /Link annotations on page 1 via pdf-lib. Every viewer (Acrobat, Apple Preview, Chrome, Firefox) shows them as clickable." },
    ],
    faqs: [
      { q: "Will the links work in every viewer?", a: "Yes. /Link annotations with /URI actions are spec-compliant since PDF 1.0 (1993). Acrobat, Apple Preview, Chrome, Firefox, mobile readers — all respect them. Some terminal-style viewers (pdftotext output) don&rsquo;t render the click area but the URL itself is preserved in the annotation dict." },
      { q: "Why is the rectangle invisible after save?", a: "Standard hyperlink annotations use a &lsquo;no border&rsquo; setting (Border [0 0 0]) so they don&rsquo;t visually mark the page. The link is invisible until hovered. If you want a visible underline, run our Highlight PDF afterwards on the same region." },
      { q: "Does this support text-aware linking (auto-detect URLs in text)?", a: "Not in v1. v1 = drag a region, type a URL. Auto-detecting existing URL strings in the text and making them clickable would need PDFium text-position math — useful future work." },
      { q: "Can I add links on every page?", a: "v1 = page 1 only. Multi-page link addition needs page navigation in the editor. Workaround: extract the page → add link → merge back." },
      { q: "What URL schemes work?", a: "https://, http://, mailto: are universally honored. file:// works in some viewers but is often blocked for security. Custom schemes (myapp://) work if the viewer supports the scheme." },
      { q: "Will the link survive saving / re-saving the PDF?", a: "Yes. /Link annotations are first-class PDF objects, not page-content overlays. They persist through any standard re-save. Form-flattening tools (including our Flatten PDF Forms) don&rsquo;t touch link annotations." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the annotations locally. The PDF never leaves your browser." },
    ],
    cta: { title: "Need to remove links instead?", text: "Strip Hyperlinks removes every clickable annotation from a PDF. Useful for print prep where active links are dead ink.", linkHref: "/tool/strip-links", linkLabel: "Try Strip Hyperlinks" },
  },

  "free-draw-pdf": {
    useCasesTitle: "Why people draw freehand on PDFs",
    useCasesIntro:
      "Sometimes a comment, a circle around a typo, or a quick arrow says more than highlights or text boxes can. Freehand drawing is the closest digital equivalent to marking up a printout with a pen.",
    useCases: [
      { icon: "Pen", title: "Casual review markup", text: "Circle a typo, underline a passage, sketch an arrow to the reviewer&rsquo;s comment. Faster than rectangles and text boxes for ad-hoc notes." },
      { icon: "Edit", title: "Hand-written annotations", text: "Add quick &lsquo;yes / no / maybe&rsquo; marks next to choices on a printable form." },
      { icon: "Book", title: "Math + diagram notes", text: "Sketch a missing equation step or an arrow connecting two parts of a diagram during study or peer review." },
      { icon: "Shield", title: "Quick redlines", text: "Strike through a sentence with a freehand line for a redline that takes one second instead of typing replacement text." },
      { icon: "File", title: "Floor-plan / map markup", text: "Circle a feature on an architectural drawing or map without breaking out a CAD tool." },
      { icon: "Receipt", title: "Initialing approvals", text: "Quick initials on a printable form when a full Sign PDF feels heavy." },
    ],
    howWorksTitle: "How Free Draw works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Pick color + width", text: "Four preset colors (black, blue, red, green) plus a custom-color picker. Width slider 1–20 px." },
      { step: "3", title: "Draw with the pen tool", text: "Click and drag to draw a stroke. Lift to start a new one. Live preview as you draw. Undo removes the last stroke; Clear all wipes the canvas." },
      { step: "4", title: "Apply &amp; download", text: "We convert each stroke from screen pixels to PDF user-space points, then drawLine through every consecutive pair via pdf-lib with rounded line caps. Lossless overlay — original page content untouched." },
    ],
    faqs: [
      { q: "Why are my drawn lines a bit jagged?", a: "v1 connects stroke points with straight line segments — no spline smoothing. Short strokes look fine; long, fast strokes show the underlying polyline. Smoothing (quadratic-bezier curves through midpoints of consecutive segments) is a v2 enhancement." },
      { q: "Can I draw on every page?", a: "v1 = page 1 only. Multi-page drawing needs page navigation in the editor — v2 enhancement once 2-3 visual editors validate the pattern." },
      { q: "Will my drawing print?", a: "Yes. The strokes are part of the page content stream after applying. Acrobat, Apple Preview, and every printer we&rsquo;ve tested respect them correctly." },
      { q: "Can I edit a stroke after drawing it?", a: "No — once it&rsquo;s on the canvas, you can only Undo (last stroke) or Clear all. Per-stroke editing (move, color change, delete) is a v2 enhancement." },
      { q: "Does the tool support a stylus / Apple Pencil?", a: "Yes. We use the Pointer Events API which receives stylus input the same as mouse input. Pressure-sensitivity isn&rsquo;t implemented in v1 — every stroke uses the slider width uniformly." },
      { q: "Why do I see a tiny dot when I just click?", a: "Stray clicks (less than 2 points) are dropped on pointer-up so they don&rsquo;t accumulate as invisible artifacts. If you need a dot, drag a tiny distance." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the strokes locally. Your PDF and your drawing both stay in your browser." },
    ],
    cta: { title: "Need straight rectangles instead?", text: "Highlight PDF gives you drag-to-draw colored rectangles. Better for highlighting passages than pen strokes.", linkHref: "/tool/highlight-pdf", linkLabel: "Try Highlight PDF" },
  },

  "sign-pdf-free": {
    useCasesTitle: "Why people sign PDFs visually",
    useCasesIntro:
      "Most signature requests aren&rsquo;t legally binding contracts — they&rsquo;re forms that need a recognizable mark, expense reports that need approval, internal docs routed for sign-off. A pasted-in signature image solves the common case in seconds.",
    useCases: [
      { icon: "Pen", title: "Internal approval", text: "Stamp your signature on expense reports, time-off requests, or routine internal forms before sending up the chain." },
      { icon: "File", title: "Filling out forms", text: "Tax forms, school enrollment, gym waivers — fields that ask for a signature but don&rsquo;t require cryptographic binding." },
      { icon: "Receipt", title: "Routine paperwork", text: "Vendor onboarding forms, expense pre-approvals, NDAs that don&rsquo;t need DocuSign-grade audit trail." },
      { icon: "Edit", title: "Cover letters", text: "Add a signature to job application cover letters when the employer expects to see one." },
      { icon: "Book", title: "Academic submissions", text: "Permission slips, recommendation letter sign-offs, grant agreement annexes." },
      { icon: "Shield", title: "Form sign-offs", text: "Liability waivers, photo releases, treatment consent — internal-process forms that move the document through the workflow." },
    ],
    howWorksTitle: "How Sign PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Pick a signature image", text: "PNG (with transparency works best — drops cleanly onto the form line) or JPG, up to 10 MB. The image preview appears in the config panel." },
      { step: "3", title: "Click + size", text: "Click anywhere on the page to place the signature. Drag the size slider (5–60% of page width) until it fits the signature line. Click elsewhere to move it." },
      { step: "4", title: "Apply &amp; download", text: "We embed the image and drawImage at the chosen position via pdf-lib. Lossless overlay; original page content untouched." },
    ],
    faqs: [
      { q: "Is this a real (cryptographic) e-signature?", a: "No. This places a signature IMAGE on the page — there&rsquo;s no signing certificate, no integrity hash, no signer identity. Anyone with the PDF can add or remove signatures. For binding contracts (real estate, employment, NDAs of consequence), use DocuSign, Adobe Sign, HelloSign, or another service that produces a signed PDF with an audit trail." },
      { q: "When IS this enough?", a: "When the recipient just needs to see a signature mark — internal expense forms, school permission slips, gym waivers, routine paperwork. The legal threshold is usually &lsquo;reasonable evidence the signer agreed.&rsquo; A pasted signature image clears that bar for most informal contexts. Talk to a lawyer for specific cases." },
      { q: "Why does my signature look pixelated?", a: "Either the source image is small (try a higher-res scan of your signature) or the size slider is set too high (a 200×80 px image stretched to 50% of an 8.5\" page = visible pixelation). For best results, scan at 300 DPI and use 15-25% size on the slider." },
      { q: "Will the signature show on every page?", a: "v1 = page 1 only. Multi-page signing (e.g. initials on every page + final signature on page N) needs page navigation in the editor — a v2 enhancement." },
      { q: "Can I add multiple signature images?", a: "Not in v1 — one click position, one image. To add date / initials / multi-line signature blocks alongside the image, run Add Text to PDF afterwards on the signed output." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the image locally. Both your PDF and your signature image stay in your browser — important for sensitive forms." },
      { q: "Do PNG transparency channels work?", a: "Yes. Transparent PNGs let the form line / page content show through where the image is transparent. JPEGs don&rsquo;t support transparency, so they always render as opaque rectangles — use PNG for signatures whenever possible." },
    ],
    cta: { title: "Need to add a date or printed name?", text: "Add Text to PDF places typed text at a click position — the natural pairing with a signature image.", linkHref: "/tool/add-text-box", linkLabel: "Try Add Text to PDF" },
  },

  "redact-free": {
    useCasesTitle: "Why people redact PDFs",
    useCasesIntro:
      "Redaction covers sensitive information before sharing. Names, addresses, account numbers, internal pricing, customer data — everything you want to hide from a wider audience. Our free redact is VISUAL: an opaque rectangle drawn over the content. Read the FAQ before using this on anything high-stakes.",
    useCases: [
      { icon: "Shield", title: "Anonymizing screenshots", text: "Hide names, emails, or session tokens in a screenshot before sharing it in a bug report or public docs." },
      { icon: "Edit", title: "Hiding pricing in proposals", text: "Cover the pricing tables before passing a proposal around internally for review without revealing commercial terms." },
      { icon: "File", title: "Personal info on printouts", text: "Cover account numbers or DOB on a statement before stapling it to an expense form." },
      { icon: "Receipt", title: "Internal-only routing notes", text: "Hide internal annotations before sending a finalized doc to a customer." },
      { icon: "Book", title: "Source quotes in research", text: "When sharing a passage, cover the parts of the surrounding paragraph not relevant to the quote." },
      { icon: "Scan", title: "Pre-archive cleanup", text: "Cover sensitive sections of scanned old documents before archiving on a shared drive." },
    ],
    howWorksTitle: "How Redact PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Drag to add redaction boxes", text: "Click and drag anywhere on the page to draw an opaque rectangle. Drag again to add more. Pick black, white (erase effect), or gray." },
      { step: "3", title: "Apply &amp; download", text: "We draw opaque rectangles on top of page 1 via pdf-lib drawRectangle. Lossless to other content; the underlying objects remain in the file." },
    ],
    faqs: [
      {
        q: "Is this real redaction or just a visual cover?",
        a: "Visual cover. The original text and images still exist in the PDF&rsquo;s content stream — they&rsquo;re just visually hidden behind a black rectangle. Anyone with PDF tooling (pdftotext, qpdf, Adobe Acrobat&rsquo;s text extract, even copy-paste in some viewers) can recover what was under the box. Use this for low-stakes uses only.",
      },
      {
        q: "What should I use for true redaction?",
        a: "Three practical options. (1) Rasterize the page first (PDF → JPG → PDF) — the page becomes a flat image, nothing recoverable. We ship Rasterize as a separate tool. (2) Adobe Acrobat&rsquo;s Pro redaction feature destroys the underlying objects. (3) Server-side qpdf or pdfcpu with a destructive redact op. We&rsquo;re evaluating shipping a server-side true-redact op as a credit-paid AI tool.",
      },
      {
        q: "Why does the tool exist if it isn&rsquo;t real redaction?",
        a: "Because most people&rsquo;s actual use case is &lsquo;hide a name on a screenshot before sharing,&rsquo; not &lsquo;publish a court filing with FOIA-grade redactions.&rsquo; A free, fast, in-browser visual cover serves the common case. The longform and config-panel warning surface the limitation upfront so high-stakes users go elsewhere.",
      },
      {
        q: "Can I redact every page?",
        a: "v1 = page 1 only. Multi-page redaction needs page navigation in the editor (a v2 enhancement). Workaround: extract the page → redact → merge back.",
      },
      { q: "What colors are supported?", a: "Black (default), white (erase effect — useful when the underlying content has a colored background), and gray (less alarming visually than black for low-stakes documents)." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the rectangles locally. The PDF never leaves your browser — important when you&rsquo;re working with sensitive content." },
      { q: "Will the redacted content still appear in PDF-to-text exports?", a: "Yes. Our PDF to Text tool extracts text from the underlying content stream, which still exists. If you need to verify what&rsquo;s recoverable, run the redacted output through PDF to Text and see what comes back." },
    ],
    cta: { title: "Need a true privacy strip?", text: "Remove PDF Metadata strips Title, Author, Producer, dates, and XMP metadata — different operation, addresses metadata leaks rather than visible content.", linkHref: "/tool/remove-metadata", linkLabel: "Try Remove Metadata" },
  },

  "highlight-pdf": {
    useCasesTitle: "Why people highlight PDFs",
    useCasesIntro:
      "Highlighting calls attention to specific passages without modifying the underlying text. Translucent overlays let the original content show through — perfect for emphasizing key sentences in a contract, marking action items in meeting notes, or flagging passages during research.",
    useCases: [
      { icon: "Book", title: "Reading + study", text: "Mark key passages while reading research papers, textbooks, and reference docs. Save the highlighted version for later review." },
      { icon: "Shield", title: "Contract review", text: "Highlight clauses that need negotiation or follow-up before sending the redlined version back to counterparty." },
      { icon: "Edit", title: "Meeting notes", text: "Highlight action items and decisions in shared meeting minutes so reviewers spot them at a glance." },
      { icon: "Receipt", title: "Invoice / statement review", text: "Mark line items in question on a vendor invoice or bank statement before raising a dispute." },
      { icon: "File", title: "Editorial markup", text: "Highlight passages that need editing in a draft. Different colors = different concerns (factual vs. style vs. tone)." },
      { icon: "Pages", title: "Reference flagging", text: "Highlight specific quotes or stats in a long source document to find them quickly later." },
    ],
    howWorksTitle: "How Highlight PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Drag to add highlights", text: "Click and drag anywhere on the page to draw a translucent rectangle. Drag again to add more — multiple highlights supported. Use Clear All to start over." },
      { step: "3", title: "Pick color + opacity", text: "Yellow (default), green, pink, or blue. Opacity 10–80% — lower = more readable underlying content." },
      { step: "4", title: "Apply &amp; download", text: "We draw translucent rectangles on page 1 via pdf-lib drawRectangle. Lossless overlay — original content untouched." },
    ],
    faqs: [
      { q: "Does this highlight every page or just page 1?", a: "v1 = page 1 only. Multi-page highlighting needs page navigation in the editor (e.g. prev/next buttons), which is a v2 enhancement once we have multiple visual editors validating the navigation pattern. For now, if you need to highlight page 5, run our Extract Pages tool first to isolate page 5, highlight it, then merge it back." },
      { q: "Is this real text-aware highlighting or just rectangles?", a: "Just rectangles. True text-aware highlighting (where you click+drag along a sentence and the highlight follows the text bounds) requires PDFium text-position math we haven&rsquo;t shipped yet. Drag-rectangle covers most users&rsquo; needs — they want to draw over a region they care about, not select specific words." },
      { q: "Can I delete an individual highlight without clearing all?", a: "Not in v1 — there&rsquo;s a Clear All button only. Per-highlight deletion (click on a highlight to remove it) is a v2 enhancement." },
      { q: "Will the highlights survive in viewers other than yours?", a: "Yes. We draw using pdf-lib&rsquo;s standard rectangle primitive with opacity. Acrobat, Apple Preview, Chrome, Firefox, and every printer we&rsquo;ve tested respect it correctly." },
      { q: "Is the highlight an annotation or a page-content overlay?", a: "Page-content overlay (drawn into the content stream). It&rsquo;s permanent and not editable as an annotation in viewers like Acrobat. If you need editable annotations, that&rsquo;s a different tool (PDF.js-backed annotation editor — future work)." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the rectangles locally." },
    ],
    cta: { title: "Need to redact instead?", text: "Redact PDF (coming soon) covers the &lsquo;black box over sensitive info&rsquo; case. Highlight is for emphasis; Redact is for hiding.", linkHref: "/tool/add-text-box", linkLabel: "Try Add Text to PDF" },
  },

  "add-text-box": {
    useCasesTitle: "Why people add text to PDFs",
    useCasesIntro:
      "Sometimes the PDF is fine but it&rsquo;s missing a label — a header, a footer, a reference number, a recipient name. Adding text is the most common annotation task that doesn&rsquo;t fit Watermark or Page Numbers exactly: arbitrary text at an arbitrary position.",
    useCases: [
      { icon: "Edit", title: "Custom headers / footers", text: "Stamp your team name, recipient label, or routing code at the top or bottom of every page without re-exporting the source." },
      { icon: "Receipt", title: "Reference numbers", text: "Add invoice numbers, case IDs, or tracking codes to forms before sending. Same number on every page." },
      { icon: "File", title: "Recipient labels", text: "Personalize a generic PDF with a recipient name (For: Alice) before forwarding. Faster than rebuilding in Word." },
      { icon: "Shield", title: "Status flags", text: "Add &lsquo;APPROVED 2025-Q4&rsquo; or &lsquo;PENDING REVIEW&rsquo; labels at a specific position so the status is unmissable." },
      { icon: "Book", title: "Copyright / source attribution", text: "Stamp a copyright notice or source URL at the bottom of distributed materials." },
      { icon: "Pages", title: "Versioning marks", text: "&lsquo;v3 - 2026-04-28&rsquo; in the corner so the recipient knows which print-out they&rsquo;re holding when versions diverge." },
    ],
    howWorksTitle: "How Add Text to PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× as the editor canvas." },
      { step: "2", title: "Type + click to place", text: "Type your text in the panel above the page. Click anywhere on the page to place it. The marker shows where the text will appear; click again to move." },
      { step: "3", title: "Pick font size + color", text: "6–72 pt font size, any hex color via the picker. The marker updates live." },
      { step: "4", title: "Apply &amp; download", text: "We embed Helvetica and call drawText at the same position on every page. Lossless overlay — original page content untouched." },
    ],
    faqs: [
      { q: "Can I add multiple text boxes per page?", a: "Not in v1 — one position, one text label, applied to every page (header / footer use case). Multi-text-box support is a v2 enhancement." },
      { q: "Does the text appear on every page or just page 1?", a: "Every page. Same text + position. If you want different text per page, run the tool multiple times with the source PDF you got back from the previous run." },
      { q: "What fonts are supported?", a: "Helvetica only (the standard PDF font, no embedding required). Custom fonts are a future extension." },
      { q: "Will the text overlap with existing content?", a: "It draws on top of whatever&rsquo;s on the page. If you click in a spot that already has content, the text overlaps. Use a margin position or a fresh region of the page." },
      { q: "Does this support non-Latin scripts?", a: "Helvetica covers Latin + Western European characters. CJK scripts (Chinese, Japanese, Korean) need different fonts; not supported in v1." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the text locally. The PDF never leaves your browser." },
    ],
    cta: { title: "Want a watermark instead?", text: "Watermark PDF stamps DRAFT / CONFIDENTIAL-style overlays at standard positions with rotation and opacity. Different tool for diagonal-watermark use cases.", linkHref: "/tool/stamp-pdf", linkLabel: "Try Watermark PDF" },
  },

  "image-watermark": {
    useCasesTitle: "Why people add image watermarks",
    useCasesIntro:
      "Logos, signatures, and brand marks turn a generic PDF into a branded artifact. Image watermarks are the visual identity layer — they communicate ownership and source at a glance.",
    useCases: [
      { icon: "Shield", title: "Brand identity", text: "Stamp your company logo on every page of a deck or proposal so the source is visible regardless of how it&rsquo;s shared or printed." },
      { icon: "Pen", title: "Signature stamps", text: "Add a scanned signature image to forms or letters that don&rsquo;t need cryptographic signing." },
      { icon: "Edit", title: "Draft / approval marks", text: "Use a graphical DRAFT or APPROVED stamp instead of plain text — more visually distinctive in mixed-document workflows." },
      { icon: "Receipt", title: "Letterhead overlay", text: "Add letterhead imagery to plain documents without rebuilding them in Word — drop the PDF, stamp the logo, done." },
      { icon: "File", title: "Watermark for sample sharing", text: "Apply a SAMPLE or PREVIEW image watermark to chapter excerpts you share publicly so the full version stays paid." },
      { icon: "Book", title: "Educational copyright marks", text: "Course material distributed to students often gets a school logo + copyright notice as an image overlay." },
    ],
    howWorksTitle: "How Image Watermark works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. Files stay in your browser." },
      { step: "2", title: "Pick a watermark image", text: "PNG or JPG up to 10 MB. Transparent PNGs let the page content show through where the image is transparent." },
      { step: "3", title: "Pick position + opacity + size", text: "3×3 grid for placement (corners, edges, center). Opacity 5–100%. Size 5–100% of page width — height scales proportionally." },
      { step: "4", title: "Apply &amp; download", text: "We embed the image once and drawImage on every page at the chosen position. Resources are reused so output stays compact." },
    ],
    faqs: [
      { q: "Are transparent PNGs supported?", a: "Yes. Transparency in the source PNG is preserved — page content shows through where the image is transparent. JPEGs don&rsquo;t support transparency, so they always render as opaque rectangles." },
      { q: "Can I position the watermark by dragging?", a: "Not in v1 — you pick from a 3×3 position grid. Drag-to-position is a v2 enhancement once we have a shared visual-editor base across multiple tools." },
      { q: "Will the watermark print?", a: "Yes. Anything visible in viewers prints by default." },
      { q: "Is the original PDF modified?", a: "No. We produce a new PDF with the watermark drawn on top of the original page content. Your original file is untouched." },
      { q: "What&rsquo;s the difference between this and Watermark PDF?", a: "Watermark PDF stamps TEXT (DRAFT, CONFIDENTIAL, etc.). Image Watermark stamps an IMAGE (logo, signature, brand mark). Different inputs, same drawing concept." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser; the PDF and the watermark image both stay local." },
    ],
    cta: { title: "Want a text watermark instead?", text: "Watermark PDF stamps text like DRAFT or CONFIDENTIAL with rotation and opacity controls. Different tool, same idea.", linkHref: "/tool/stamp-pdf", linkLabel: "Try Watermark PDF" },
  },

  "stamp-pdf": {
    useCasesTitle: "Why people watermark PDFs",
    useCasesIntro:
      "A watermark turns an ordinary PDF into a labeled artifact — DRAFT, CONFIDENTIAL, your company name diagonally across the page. It signals state and ownership without touching the content underneath.",
    useCases: [
      { icon: "Shield", title: "Draft markings", text: "Stamp DRAFT on every page so reviewers know they&rsquo;re not looking at the final version." },
      { icon: "Edit", title: "Confidentiality flags", text: "CONFIDENTIAL or NDA banners visually reinforce that a document shouldn&rsquo;t be circulated externally." },
      { icon: "File", title: "Brand watermarks", text: "Company name diagonally across the page on shared decks and proposals." },
      { icon: "Receipt", title: "Status stamps", text: "PAID, APPROVED, REJECTED on invoices and forms — visible at a glance during routing." },
      { icon: "Book", title: "Sample / preview marking", text: "SAMPLE on chapter excerpts you share publicly so the full version stays paid." },
      { icon: "Pages", title: "Versioning", text: "v1, v2, v3 watermarks make it obvious which print-out someone is holding when versions diverge." },
    ],
    howWorksTitle: "How Watermark PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. Files stay in your browser." },
      { step: "2", title: "Type text + pick options", text: "Position (diagonal / center / top / bottom), opacity (5–100%), color, font size. Live update before applying." },
      { step: "3", title: "Apply &amp; download", text: "pdf-lib draws the text on every page with the rotation and opacity you chose. Lossless overlay — original content untouched." },
    ],
    faqs: [
      { q: "Can I remove the watermark later?", a: "No — once the watermark is drawn into the page content stream, it&rsquo;s baked in. Always keep an unwatermarked master copy." },
      { q: "Will the watermark print?", a: "Yes. Anything visible in viewers prints by default. If you want a screen-only watermark, that&rsquo;s a different (more complex) Optional-Content-Group implementation." },
      { q: "Can I add an image watermark?", a: "Not in this tool — Image Watermark is a separate visual editor (deferred). For now, text watermarks cover the most common cases." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser." },
      { q: "What fonts are supported?", a: "Helvetica Bold (the standard 14 PDF font, available without embedding). Custom fonts are a future extension." },
    ],
    cta: { title: "Need page numbers too?", text: "Add Page Numbers stamps numbers in any of six positions. Often paired with a watermark.", linkHref: "/tool/page-numbers", linkLabel: "Try Page Numbers" },
  },

  "n-up-pdf": {
    useCasesTitle: "Why people use N-up layouts",
    useCasesIntro:
      "N-up packing puts multiple source pages onto each output sheet — fewer pages to print, easier to compare side-by-side, more efficient reading on big screens.",
    useCases: [
      { icon: "Pages", title: "Paper-saving prints", text: "Print 2 pages per sheet instead of 1 — half the paper, 95% of the readability for body-text documents." },
      { icon: "Book", title: "Handouts &amp; cheat sheets", text: "4-up grid of slides or reference cards so a single sheet holds an entire deck." },
      { icon: "Compare", title: "Side-by-side reading", text: "2-up layout lets you read facing pages without flipping. Mimics open-book layout for scanned books." },
      { icon: "Receipt", title: "Receipt batching", text: "Stack receipts 4-up per sheet for quick filing — fewer sheets to scan, faster filing." },
      { icon: "Edit", title: "Proof previewing", text: "Compare layout proposals 4-up to spot differences. Designers and editors use this for review packages." },
      { icon: "Convert", title: "Annotation density", text: "When marking up many pages, 4-up keeps everything visible at once — handy for review meetings." },
    ],
    howWorksTitle: "How N-up PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. pdf-lib loads the document tree in your browser." },
      { step: "2", title: "Pick layout", text: "2-up (vertical stack) or 4-up (2×2 grid). Output sheet size matches your source — most uniform-page docs look natural." },
      { step: "3", title: "Apply &amp; download", text: "We embed each source page as a PDFEmbeddedPage and drawPage() it onto the new sheets at the right scale. Resources are reused across sheets so output stays compact." },
    ],
    faqs: [
      { q: "Will the output be smaller than the input?", a: "Often, yes — fewer total pages plus shared resources. Not always; if your source has heavy per-page imagery, the embed overhead can offset savings." },
      { q: "Are the source pages scaled?", a: "Yes. Each source page is scaled to fit its cell while preserving aspect ratio. Cells get a small gap (8 pt default) so they don&rsquo;t collide visually." },
      { q: "What if pages have mixed orientations?", a: "Output sheet size matches the FIRST source page. Mixed-orientation docs may have some cells rotated awkwardly. For best results, normalize orientation first via Rotate PDF." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser." },
      { q: "Can I do 6-up or 8-up?", a: "Not in v1 — 2-up and 4-up cover the vast majority of use cases. Higher counts get illegible quickly anyway." },
    ],
    cta: { title: "Want to resize before N-up?", text: "Resize PDF normalizes page sizes first — handy when your source mixes Letter and A4.", linkHref: "/tool/resize-pdf", linkLabel: "Try Resize PDF" },
  },

  "resize-pdf": {
    useCasesTitle: "Why people resize PDFs",
    useCasesIntro:
      "Standardizing page size is a frequent prep step. Submission portals expect Letter or A4. Print shops want consistent sheet sizes. International teams need to convert between US and metric paper.",
    useCases: [
      { icon: "Edit", title: "US ↔ metric conversion", text: "Convert Letter (US) to A4 (international) so the doc opens cleanly anywhere — or vice versa." },
      { icon: "Pages", title: "Print-shop standardization", text: "Print shops batch jobs by sheet size. Resize all pages to one target before submitting." },
      { icon: "File", title: "Submission portals", text: "Many gov / academic portals reject PDFs with non-standard page sizes. Resize to the required size first." },
      { icon: "Book", title: "Cross-doc consistency", text: "When merging PDFs from multiple sources, resizing to a common size makes the merged result look uniform." },
      { icon: "Receipt", title: "Mobile-friendly resize", text: "Down-resize a Legal PDF to A5 for tighter mobile display." },
      { icon: "Pages", title: "Pre-archiving normalization", text: "Archives often require uniform page size. Resize before depositing into long-term storage." },
    ],
    howWorksTitle: "How Resize PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. pdf-lib loads it in your browser." },
      { step: "2", title: "Pick target size + orientation", text: "Letter, Legal, A4, A3, or A5. Optional landscape toggle. We compute the largest scale that keeps the source within the target." },
      { step: "3", title: "Apply &amp; download", text: "Each source page is embedded and drawn on a new target-sized page, centered, with margins where the aspect ratios differ." },
    ],
    faqs: [
      { q: "Does this preserve content quality?", a: "Yes. Embedding-and-drawing is a reference operation — the source content stream is preserved, just placed on a larger or smaller stage. No rasterization, no quality loss." },
      { q: "Why are there margins around the content?", a: "Aspect-ratio mismatch. A 3:4 source on a 4:3 target leaves margins on the sides. We center the content; the margins are filled with white." },
      { q: "Can I resize to custom dimensions?", a: "Not in v1 — 5 standard sizes cover the vast majority of needs. Custom is a future extension." },
      { q: "Will resizing change file size?", a: "Roughly the same. Resource reuse via embedPdf keeps overhead minimal." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser." },
    ],
    cta: { title: "Just want to crop instead?", text: "Crop PDF removes content margins without scaling. Different operation — useful when the page is the right size but the content area is too wide.", linkHref: "/tool/crop-pdf", linkLabel: "Try Crop PDF" },
  },

  "remove-metadata": {
    useCasesTitle: "Why people strip PDF metadata",
    useCasesIntro:
      "PDFs leak surprising amounts of identity info. Author = your OS username. Producer = your software fingerprint. ProductionDate / ModDate = exact timestamps. XMP can hold full revision history. Strip before sending externally.",
    useCases: [
      { icon: "Shield", title: "External sharing", text: "Before emailing a PDF outside your org, strip the OS username and corporate-software signatures." },
      { icon: "Edit", title: "Whistleblower / journalism", text: "Anonymous tips need their tracks cleaned — metadata can de-anonymize a leaker." },
      { icon: "File", title: "Pre-FOIA release", text: "Government docs released under FOIA must have authoring metadata stripped per agency policy." },
      { icon: "Book", title: "Academic anonymization", text: "Double-blind submission policies require author info removed not just from the body but from the metadata too." },
      { icon: "Receipt", title: "Resume privacy", text: "Resumes uploaded to job boards leak metadata. Strip before upload." },
      { icon: "Convert", title: "Pipeline normalization", text: "Document-archive ingestion pipelines often want clean metadata — fewer surprises in downstream search and indexing." },
    ],
    howWorksTitle: "How Remove PDF Metadata works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB." },
      { step: "2", title: "Click Remove metadata", text: "We clear /Info dict fields (Title, Author, Subject, Keywords, Producer, Creator, dates) and remove the embedded XMP metadata stream." },
      { step: "3", title: "Download", text: "Saved with object streams; the document looks identical visually but the metadata fingerprint is gone." },
    ],
    faqs: [
      { q: "Is this destructive to page content?", a: "No. Only metadata is removed. Page text, images, layout, fonts — all preserved exactly." },
      { q: "Can the metadata be recovered?", a: "Not from the saved file — once the /Info dict and XMP stream are gone, they&rsquo;re gone. (Anyone with the original PDF still has the original metadata, of course.)" },
      { q: "Does this remove form data?", a: "No. Form field values are part of the document content, not metadata. Use Flatten PDF Forms if you want to bake those in too." },
      { q: "Will the file size change?", a: "Slightly smaller. Metadata is usually a few KB." },
      { q: "Is anything uploaded?", a: "No. pdf-lib runs in your browser." },
      { q: "What about hidden text or invisible layers?", a: "Out of scope — those live in the page content, not metadata. A separate redaction tool would handle that." },
    ],
    cta: { title: "Want to inspect first?", text: "PDF Inspector shows you exactly what metadata is in the file. Run it before stripping so you know what&rsquo;s being removed.", linkHref: "/tool/pdf-inspector", linkLabel: "Try PDF Inspector" },
  },

  "crop-pdf": {
    useCasesTitle: "Why people crop PDFs",
    useCasesIntro:
      "Cropping removes the visual noise around the content that matters — scanner margins, header/footer junk, oversized print bleeds. Setting a /CropBox is non-destructive (the original page bounds survive in the file) but every viewer respects it.",
    useCases: [
      { icon: "Scan", title: "Scanner margins", text: "Office scanners leave thick white borders. Crop to the content area for tighter visual presentation." },
      { icon: "Edit", title: "Print-prep trim", text: "Designers send PDFs with bleed marks for the printer. Cropping to the trim box gives the rendered preview." },
      { icon: "Image", title: "Mobile reading", text: "Phone-screen reading benefits from tighter crops — same content, less zooming." },
      { icon: "Pages", title: "Multi-up reflows", text: "Before laying two pages side-by-side on a sheet, crop each one to its content area so the reflow looks balanced." },
      { icon: "Book", title: "E-reader transfers", text: "Sending PDFs to Kindle / Kobo? Cropping margins makes the text bigger on small screens without re-typesetting." },
      { icon: "Shield", title: "Header / footer redaction", text: "If the only thing you need to hide is a header or footer, cropping it off is faster than redacting individual fields." },
    ],
    howWorksTitle: "How Crop PDF works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. PDFium renders page 1 at 1.5× — sharp enough to see the content area you want to keep." },
      { step: "2", title: "Drag the crop area", text: "Click and drag anywhere on the page to draw the crop rectangle. The area outside dims; the area inside is your final output. Click &lsquo;Reset crop&rsquo; to start over." },
      { step: "3", title: "Apply &amp; download", text: "We set /CropBox on every page to your rectangle (in PDF user-space coordinates). Lossless — the original /MediaBox is preserved, viewers just respect the crop." },
    ],
    faqs: [
      { q: "Is this destructive?", a: "No. We set /CropBox, not /MediaBox. The original page boundary stays in the file — anyone with the PDF can use a tool like qpdf or Acrobat to recover the full page. If you need true destructive removal, that&rsquo;s a different operation (and harder to do losslessly)." },
      { q: "Does the crop apply to every page?", a: "Yes — same rectangle on all pages. Per-page crop is a v2 extension; for now, if your pages have different content areas, crop each section separately and merge." },
      { q: "What if a page is smaller than my crop?", a: "We clamp the crop to fit within each page&rsquo;s media box. Smaller pages just get cropped to their full size (effectively no crop) instead of failing the save." },
      { q: "Will printing respect the crop?", a: "Yes. /CropBox is honored by every modern viewer and print driver. Acrobat, Apple Preview, Chrome, Firefox all show the cropped area." },
      { q: "Why does the preview only show page 1?", a: "Cropping is uniform across pages, so showing page 1 is enough — the same rectangle applies everywhere. We don&rsquo;t render every page to keep the editor fast." },
      { q: "Is anything uploaded?", a: "No. PDFium renders the preview locally; pdf-lib applies the crop locally. The PDF never leaves your browser." },
    ],
    cta: { title: "Want to inspect a PDF first?", text: "PDF Inspector tells you the dimensions of every page so you can pick a crop that fits all of them.", linkHref: "/tool/pdf-inspector", linkLabel: "Try PDF Inspector" },
  },

  "flatten-pdf": {
    useCasesTitle: "Why people flatten PDF forms",
    useCasesIntro:
      "Filled-out forms exist in two states. In their native state, the values live in form fields that anyone can edit. After flattening, the values become part of the page content — visible to everyone, editable by no one. Flattening freezes a form so it can be safely circulated.",
    useCases: [
      { icon: "Pen", title: "Send a completed form", text: "You&rsquo;ve filled out a tax form, application, or contract template. Flatten before emailing so the recipient can&rsquo;t accidentally (or maliciously) modify your answers." },
      { icon: "Shield", title: "Compliance archiving", text: "Audit-grade copies of completed forms must be non-editable. Flatten before depositing into the records system." },
      { icon: "Pages", title: "Print previewing", text: "Some printers render form fields differently from final content. Flatten first so what you see in preview is exactly what comes out of the printer." },
      { icon: "Convert", title: "Fixing rendering quirks", text: "Some PDF viewers don&rsquo;t render form values until you click into the field. Flatten to bake values into the page so every viewer shows them." },
      { icon: "Receipt", title: "Bulk form processing", text: "When you&rsquo;ve filled many forms via automation, flatten them all before downstream tools (OCR, archival, distribution) handle them." },
      { icon: "File", title: "Standardize for review", text: "Reviewers shouldn&rsquo;t accidentally tab into a form field while reading. Flatten makes the document strictly read-only." },
    ],
    howWorksTitle: "How Flatten PDF Forms works",
    howWorks: [
      { step: "1", title: "Drop your PDF", text: "Up to 100 MB. We load the form structure with pdf-lib." },
      { step: "2", title: "Click Flatten forms", text: "pdf-lib&rsquo;s PDFForm.flatten() walks every AcroForm field, reads its current value, and draws it into the page&rsquo;s content stream. Then it removes the interactive widgets." },
      { step: "3", title: "Download", text: "Output looks identical to viewers but the forms are no longer fields — just static text. Recipients see filled values, can&rsquo;t edit them." },
    ],
    faqs: [
      { q: "Will signature fields be preserved?", a: "Visually yes — the visible signature appearance becomes part of the page content. Cryptographically no — flattening invalidates the signature&rsquo;s integrity binding (which is the whole point of cryptographic signing). Don&rsquo;t flatten anything that needs to remain a verifiable signed document." },
      { q: "Are XFA forms supported?", a: "No. XFA is a separate (deprecated) form format that pdf-lib doesn&rsquo;t handle. The op surfaces a friendly error if it encounters one. Use Adobe Acrobat for XFA flattening." },
      { q: "What if my PDF has no forms?", a: "The op completes successfully with a &lsquo;No forms to flatten&rsquo; message and returns a clean re-saved copy. No harm done." },
      { q: "Can I un-flatten afterwards?", a: "No. Flattening is one-way — the field metadata is gone. Always keep an unflattened copy as your master." },
      { q: "Is anything uploaded?", a: "No. pdf-lib flattens locally." },
    ],
    cta: { title: "Need to inspect form fields first?", text: "PDF Form Inspector lists every field — name, type, value, flags. Run before flattening to confirm what will be baked in.", linkHref: "/tool/pdf-forms", linkLabel: "Try PDF Form Inspector" },
  },

  "sort-pages": {
    useCasesTitle: "Why people reorder PDF pages",
    useCasesIntro:
      "PDFs come from many sources — concatenated scans, multi-author documents, reports assembled by tools that put things in the wrong order. Reordering is the cheapest way to make a document make sense without re-exporting the source.",
    useCases: [
      {
        icon: "Scan",
        title: "Scanner stacking errors",
        text: "Document feeders sometimes produce pages in reverse order, or interleave a stack that was misfed. Drag thumbnails into the right sequence in seconds.",
      },
      {
        icon: "File",
        title: "Multi-author assembly",
        text: "When sections come from different contributors and arrive in random order, dragging the thumbnails into chapter order is faster than re-exporting from Word.",
      },
      {
        icon: "Edit",
        title: "Cover-sheet-first",
        text: "Print drivers sometimes append the cover sheet to the end. Drag it to the front so the printed packet reads correctly.",
      },
      {
        icon: "Book",
        title: "Reading-pack curation",
        text: "Build a study pack by extracting pages from many sources, then reorder them into a coherent reading sequence (intro → core → review).",
      },
      {
        icon: "Receipt",
        title: "Reverse for chronology",
        text: "Bank statements often print newest-first. One Reverse click puts them in chronological order for tax filing or expense reports.",
      },
      {
        icon: "Pages",
        title: "Section reordering",
        text: "Move chapter 3 before chapter 2, swap appendices, promote an executive summary to the top. Drag, see the new position, save.",
      },
    ],
    howWorksTitle: "How Sort Pages works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. PDFium renders every page as a thumbnail. Each card shows its ORIGINAL page number plus its current position (#1, #2, …) in the new order.",
      },
      {
        step: "2",
        title: "Drag to reorder",
        text: "HTML5 drag-and-drop. Pick up a thumbnail, drop it where you want it. Moved pages get an accent border and a &lsquo;Moved&rsquo; badge. &lsquo;Reverse&rsquo; flips the whole sequence; &lsquo;Reset&rsquo; restores the original order.",
      },
      {
        step: "3",
        title: "Save in new order",
        text: "We copy each page&rsquo;s content stream into a fresh PDF in the requested order via pdf-lib. Lossless, runs in milliseconds.",
      },
    ],
    faqs: [
      {
        q: "Is anything uploaded?",
        a: "No. PDFium and pdf-lib both run as JavaScript / WebAssembly in your browser. The PDF never touches our servers. Verifiable in DevTools → Network.",
      },
      {
        q: "Are the page contents preserved exactly?",
        a: "Yes. pdf-lib's copyPages serializes each source page's content stream — text, images, vector paths, embedded fonts, annotations — into the new document. The output is byte-identical to the input on a per-page basis; only the order changes.",
      },
      {
        q: "Will bookmarks and cross-page links still work?",
        a: "Bookmarks and links pointing to specific pages will keep pointing to the SAME source pages — but those pages are now at different positions. So a bookmark labelled &lsquo;Chapter 3&rsquo; that pointed to page 47 will, after reordering, jump to wherever the original page 47 lands. pdf-lib v1.17 doesn't relabel bookmarks. For bookmark-heavy docs, the ones tied to chapter titles still feel right; pure page-number bookmarks (&lsquo;Page 47&rsquo;) become misleading.",
      },
      {
        q: "Why does drag-and-drop feel different from native macOS?",
        a: "We use the HTML5 drag-and-drop API, which is browser-standard but has different physics from native OS drag (no spring-back, no inertia). Functional but not flashy. Touch users on phones can use the bulk &lsquo;Reverse&rsquo; button + future drag-handle in a touch-friendly redesign.",
      },
      {
        q: "Can I reorder hundreds of pages efficiently?",
        a: "Reordering huge docs by dragging individual pages is tedious for any tool. For ≤30 pages drag is fine; for more, the &lsquo;Reverse&rsquo; preset covers the common chronological-flip case. A future enhancement: drag a range with shift-click + lasso selection.",
      },
      {
        q: "Will the output file be smaller or larger than the input?",
        a: "Roughly the same size, often slightly smaller. We re-save with object streams (modern compact format), so depending on the input&rsquo;s era and source app, output can be 5-15% smaller. Content is identical.",
      },
    ],
    cta: {
      title: "Want to extract or remove pages instead?",
      text: "Extract Pages saves a subset as a new PDF. Delete Pages removes the unwanted ones. Same in-browser engine, mirrored semantics.",
      linkHref: "/tool/extract-pages",
      linkLabel: "Try Extract Pages",
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

  // -------- 2026-05-01: Tier 1 image / text → PDF tools -----------
  // Shipped on 2026-05-01 with runner components only — the longform
  // entries were missed and prod pages rendered the spartan dropzone-
  // only layout while the rest of the catalog had rich content. Added
  // in this commit. test-tool-content-coverage.mjs guards against the
  // same gap shipping for any future tool.
  "jpg-to-pdf": {
    useCasesTitle: "Why people convert JPG to PDF",
    useCasesIntro:
      "PDF is the universal document format — every viewer opens it, every printer accepts it, every workflow integrates with it. Combining JPG images into a PDF is how you turn a photo collection into a shareable document.",
    useCases: [
      {
        icon: "Pages",
        title: "Receipts &amp; invoices",
        text: "Photograph each receipt with your phone, drop the JPGs in, get one PDF for expense reports. Beats stapling and scanning.",
      },
      {
        icon: "Convert",
        title: "Scanned documents",
        text: "Phone-camera scans land as JPG by default. Combine each page into a single PDF before emailing, archiving, or filing.",
      },
      {
        icon: "Image",
        title: "Photo books &amp; portfolios",
        text: "Stitch a curated photo set into a PDF for clients or as a print-ready proof. PDF preserves order and sequencing — JPG bundles don&rsquo;t.",
      },
      {
        icon: "Sparkle",
        title: "Form submissions",
        text: "Many government / HR portals require a single PDF, not separate image attachments. Combine your photo IDs, supporting documents, and proofs into one PDF before uploading.",
      },
      {
        icon: "Book",
        title: "Reading material",
        text: "Comics, manga, magazine scans — typically distributed as JPG sets. Bundle into a PDF for a continuous reading experience in any PDF viewer.",
      },
    ],
    howWorksTitle: "How JPG to PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your JPG files",
        text: "Up to 50 images, 20 MB each. Drag-drop or click to browse. Files are read in your browser — never uploaded.",
      },
      {
        step: "2",
        title: "Reorder &amp; pick page size",
        text: "Drag rows to reorder (top = first page). Pick Letter / A4 / Legal / A3 / A5 with optional landscape, or &ldquo;Fit to image&rdquo; for no margins.",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "pdf-lib embeds each JPG losslessly (no re-encoding). One image per page. Download a single PDF.",
      },
    ],
    faqs: [
      {
        q: "Does this re-compress my JPGs?",
        a: "No. pdf-lib&rsquo;s embedJpg() copies the original JPEG bytes directly into the PDF — no decode, no re-encode, no quality loss. The PDF file size is roughly the sum of input image sizes plus a few KB of PDF metadata.",
      },
      {
        q: "What&rsquo;s the difference between &ldquo;Fit to image&rdquo; and a fixed page size?",
        a: "Fit-to-image makes each PDF page exactly the dimensions of its source image — no margins, no scaling, perfect 1:1. A fixed page size (Letter / A4 / etc.) scales each image to fit within 0.5\" margins while preserving aspect ratio. Fit is best for photo books and screenshots; fixed is best for printable documents.",
      },
      {
        q: "How do I change the page order?",
        a: "Use the ↑ and ↓ buttons next to each row in the file list. Top row = page 1. Removing an image is the X button.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. JPG decoding and PDF generation both run in your browser via pdf-lib. Verifiable in DevTools → Network — you won&rsquo;t see any upload while you build.",
      },
      {
        q: "Why JPG to PDF vs PNG to PDF?",
        a: "JPG is smaller (often 5–15× smaller than PNG for photos) but lossy. PNG is lossless — better for diagrams, screenshots, charts. Pick by content: photos → JPG to PDF; screenshots / diagrams → PNG to PDF.",
      },
      {
        q: "What&rsquo;s the max file count?",
        a: "50 images per PDF, 20 MB each (1 GB total upper bound). For larger sets, build in batches and merge the PDFs afterwards using our Merge tool.",
      },
    ],
    cta: {
      title: "Need lossless image quality?",
      text: "PNG to PDF preserves every pixel — no compression artefacts. Better for screenshots, diagrams, and any image with sharp edges or text.",
      linkHref: "/tool/png-to-pdf",
      linkLabel: "Try PNG to PDF",
    },
  },

  "png-to-pdf": {
    useCasesTitle: "Why people convert PNG to PDF",
    useCasesIntro:
      "PNG preserves every pixel — text edges, line art, transparency. Combining PNGs into a PDF gives you a portable document with the visual fidelity that JPG would compress away.",
    useCases: [
      {
        icon: "Sparkle",
        title: "Screenshots &amp; UI mockups",
        text: "Designers and product teams ship UI walkthroughs as screenshots. PNG keeps the typography and gridlines crisp; bundling into a PDF makes the walkthrough sharable as one file.",
      },
      {
        icon: "Convert",
        title: "Technical diagrams",
        text: "Schematics, flowcharts, architecture diagrams — anything with thin lines or sharp edges that JPG would smudge. PNG-to-PDF preserves every detail through to print.",
      },
      {
        icon: "Pages",
        title: "Scanned forms with text",
        text: "PNG scans of contracts, applications, or registration forms. Combine into a PDF for filing or sending — text edges stay legible.",
      },
      {
        icon: "Image",
        title: "Charts &amp; data visualizations",
        text: "Plotted figures from R / Python / Excel often export as PNG. Stitch into a PDF report or appendix without losing the antialiased curves.",
      },
      {
        icon: "Book",
        title: "Logos &amp; brand assets",
        text: "Brand guidelines and asset packs often ship as PNG (transparency support). Bundle the asset set into a PDF for stakeholder review or archival.",
      },
    ],
    howWorksTitle: "How PNG to PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PNG files",
        text: "Up to 50 images, 20 MB each. Files stay in your browser — nothing uploaded.",
      },
      {
        step: "2",
        title: "Reorder &amp; choose layout",
        text: "Drag-reorder or use the ↑ / ↓ buttons. Pick Letter / A4 / Legal / A3 / A5 with landscape toggle, or &ldquo;Fit to image&rdquo; for no margins.",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "pdf-lib embeds each PNG with embedPng() — fully lossless. One image per page. Download a single PDF.",
      },
    ],
    faqs: [
      {
        q: "Does PNG-to-PDF preserve transparency?",
        a: "Yes. Transparent regions in your PNGs render as transparent in the PDF — useful when overlaying or compositing. If you&rsquo;d prefer a solid background, flatten the PNG against white before uploading.",
      },
      {
        q: "Why are my PDFs larger than the originals?",
        a: "PNG is already lossless and well-compressed; PDF adds object structure + metadata + cross-reference table. Expect ~5–10% overhead. If file size is a concern, consider JPG-to-PDF instead — typically 5–15× smaller for photos.",
      },
      {
        q: "What&rsquo;s the difference between PNG-to-PDF and JPG-to-PDF?",
        a: "Same flow, different image format. PNG = lossless (every pixel preserved, larger files, ideal for diagrams/screenshots/text). JPG = lossy (smaller files, ideal for photos and natural images). Pick by content type, not by habit.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PNG decoding and PDF generation both run in your browser. Verify in DevTools → Network — there are no upload requests while you build.",
      },
      {
        q: "Can I mix PNG and JPG in one PDF?",
        a: "Not directly — this tool accepts only PNG. To mix formats, build separate PDFs (one PNG, one JPG) and combine them with our Merge tool.",
      },
      {
        q: "What&rsquo;s the max file count?",
        a: "50 images per PDF, 20 MB each. For larger collections, build in batches and merge the resulting PDFs.",
      },
    ],
    cta: {
      title: "Need smaller file sizes?",
      text: "JPG to PDF compresses photos heavily (10–50% the size of PNG for typical pages). Use it when content is photographic and lossy compression won&rsquo;t be visible.",
      linkHref: "/tool/jpg-to-pdf",
      linkLabel: "Try JPG to PDF",
    },
  },

  "markdown-to-pdf": {
    useCasesTitle: "Why people convert markdown to PDF",
    useCasesIntro:
      "Markdown is the universal authoring format for technical writing — from README files to engineering specs to academic notes. PDF is the universal sharing format. Markdown to PDF closes the gap with proper typography for headings, lists, code, and quotes.",
    useCases: [
      {
        icon: "Book",
        title: "Documentation handouts",
        text: "Convert your project README into a printable PDF for onboarding kits, partner sharing, or offline reference. Headings render at proper hierarchy, code blocks keep monospaced formatting.",
      },
      {
        icon: "Pages",
        title: "Technical specs &amp; RFCs",
        text: "Engineering teams write specs in markdown for diff-friendly version control. Convert the final draft to PDF for sign-off, archival, or distribution to non-technical stakeholders.",
      },
      {
        icon: "Convert",
        title: "Notes &amp; meeting minutes",
        text: "Notes apps (Obsidian, Bear, Logseq, plain editors) export markdown. Convert your meeting notes to PDF for distribution without forcing recipients to install a markdown viewer.",
      },
      {
        icon: "Sparkle",
        title: "Academic &amp; research drafts",
        text: "Researchers using Pandoc-style workflows often draft in markdown then convert. Get a quick PDF for sharing with co-authors or printing a draft to read on paper.",
      },
      {
        icon: "Edit",
        title: "AI-generated content",
        text: "ChatGPT / Claude / Gemini outputs are typically markdown. Pipe the output through this tool to get a clean PDF artifact instead of leaving content trapped in chat history.",
      },
    ],
    howWorksTitle: "How Markdown to PDF works",
    howWorks: [
      {
        step: "1",
        title: "Paste or drop a file",
        text: "Type / paste into the textarea, or drop a .md / .markdown / .txt file (up to 5 MB). All processing stays in your browser.",
      },
      {
        step: "2",
        title: "Pick paper size &amp; body size",
        text: "Letter or A4. Body size 9–14pt. Headings auto-scale relative to the body size. Times Roman for prose, Courier for code blocks.",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "Block-level parser handles headings, paragraphs, lists, code blocks, blockquotes, horizontal rules. Inline parser handles **bold**, *italic*, `code`, and [links](url). Output is text-selectable + searchable.",
      },
    ],
    faqs: [
      {
        q: "Which markdown features are supported?",
        a: "Headings (H1–H6 via #..######), paragraphs, ordered + unordered lists, fenced code blocks (```), inline code, blockquotes (>), horizontal rules, **bold**, *italic*, `code`, and [links](url). Tables, footnotes, nested lists, and HTML passthrough are NOT supported — use a markdown-to-HTML converter first if you need those.",
      },
      {
        q: "Is the output PDF searchable?",
        a: "Yes. Unlike rasterized PDFs, this tool writes real glyph runs — your output is fully searchable, copyable, and screen-reader accessible. Verify by Ctrl+F inside any PDF viewer.",
      },
      {
        q: "Why don't [text](url) links work as clickable links in the PDF?",
        a: "Markdown link text renders in italic to hint at the link visually, but the URL isn't embedded as a clickable PDF annotation. Adding clickable links would require a separate PDF annotation pass — a future enhancement. For now, link destinations are visible to readers via the rendered text content. Tip: include the URL inline like `Read more at https://example.com`.",
      },
      {
        q: "How are headings sized?",
        a: "Relative to body size: H1 is 2.0×, H2 is 1.6×, H3 is 1.3×, H4 is 1.15×, H5 is 1.05×, H6 is 1.0× (same as body but bold). At 11pt body, H1 renders as 22pt. Auto-scales when you change body size.",
      },
      {
        q: "What's the page-break behavior?",
        a: "Block-level — the layout engine measures each block (heading, paragraph, code, etc.) and advances to a new page if the block doesn't fit on the current one. Long blocks (huge code listings) break mid-block on the line nearest the page bottom; we don't currently keep blocks together (would require multi-pass layout).",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Markdown parsing and PDF generation both run in your browser via pdf-lib. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Need plain text instead?",
      text: "Text to PDF skips the markdown parser and renders your input as literal text — useful for code listings, logs, or tabular data where formatting characters should appear as-is.",
      linkHref: "/tool/text-to-pdf",
      linkLabel: "Try Text to PDF",
    },
  },

  "grayscale-pdf": {
    useCasesTitle: "Why people convert PDFs to grayscale",
    useCasesIntro:
      "Color costs money: at the print shop, on your office printer's toner budget, and in ink cartridges at home. Converting a PDF to grayscale before printing is the simplest cost-control step — and it&rsquo;s also useful for monochrome e-readers and accessibility.",
    useCases: [
      {
        icon: "Pages",
        title: "Print-cost reduction",
        text: "Office laser printers charge color per page (sometimes 10× the B&amp;W rate). Convert long internal docs to grayscale before printing — saves real money on training materials, internal reports, draft contracts.",
      },
      {
        icon: "Edit",
        title: "Monochrome printers",
        text: "Personal laser printers with B&amp;W-only toner render color PDFs unevenly (bright reds become light gray, blues become muddy). Pre-converting to grayscale gives you predictable, balanced output.",
      },
      {
        icon: "Sparkle",
        title: "E-reader friendliness",
        text: "Kindle, Kobo, and other e-ink devices display only grayscale. Converting first means you control the conversion (perceptual luminance) rather than letting the device guess.",
      },
      {
        icon: "Receipt",
        title: "Photocopying prep",
        text: "Color PDFs photocopy poorly — gradients turn into bands, light yellows disappear entirely. Grayscale-first means the copy looks like the original.",
      },
      {
        icon: "Shield",
        title: "Accessibility &amp; contrast",
        text: "Some readers have color-vision differences that make red/green text hard to distinguish. Grayscale forces the document to communicate via tone alone — a useful sanity check for color-only callouts.",
      },
    ],
    howWorksTitle: "How PDF to Grayscale works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Files stay in your browser — nothing uploaded.",
      },
      {
        step: "2",
        title: "Pick render scale &amp; quality",
        text: "1× / 2× / 3× DPI scale. 2× is the default — sharp enough for printing, balanced file size. JPEG quality Low (70) / Standard (85) / High (95). Higher = larger files, sharper output.",
      },
      {
        step: "3",
        title: "Convert &amp; download",
        text: "PDFium renders each page; we apply the BT.709 luminance formula (0.2126·R + 0.7152·G + 0.0722·B) — the same math Photoshop uses for &ldquo;Image → Mode → Grayscale&rdquo;. JPEGs re-embed into a fresh PDF at original page dimensions.",
      },
    ],
    faqs: [
      {
        q: "Why is the text in the output not searchable?",
        a: "We rasterize each page to grayscale it — text becomes part of the image rather than glyph data. This is how every online &ldquo;grayscale PDF&rdquo; tool works because the alternative (parsing every content stream and rewriting color operators to grayscale equivalents) is fragile across tagged PDFs, soft masks, and transparency groups. For text-preserving grayscale, the only reliable path is server-side Ghostscript with `-sColorConversionStrategy=Gray` — that&rsquo;s a future server-side rail, not yet available here.",
      },
      {
        q: "Why BT.709 luminance instead of just averaging RGB?",
        a: "Naive averaging (R+G+B)/3 produces less perceptually accurate results — pure-blue text would render too light, pure-red text too dark, because human eyes are most sensitive to green. BT.709 weights green at 71%, red at 21%, blue at 7% — matches what Photoshop, ImageMagick, and most modern image software use as default. The output looks &ldquo;right&rdquo; even on hard-to-grayscale source content.",
      },
      {
        q: "How big will the output file be?",
        a: "Roughly proportional to scale and quality. At 2× / Standard quality (the defaults), expect 1–2× the source file size for typical text PDFs (rasterizing adds bytes but grayscale JPEG is smaller than color). At 3× / High quality on photo-heavy PDFs, output can be 3–5× the input. Prefer 1× / Low if you&rsquo;re only printing.",
      },
      {
        q: "Does this work for multi-page PDFs?",
        a: "Yes. Every page is rendered, grayscaled, and re-embedded individually. Page dimensions are preserved (8.5×11 stays 8.5×11). Memory grows with page count + scale; for very large documents (500+ pages at 3×), use a smaller scale to avoid browser tab freeze.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDFium WASM rendering, the grayscale pixel transform, and pdf-lib re-embedding all run in your browser. Verifiable in DevTools → Network.",
      },
      {
        q: "What about CMYK PDFs (print-prep documents)?",
        a: "PDFium converts CMYK to RGB internally before rendering, so CMYK input works the same as RGB input. The output is grayscale-RGB (not pure CMYK-K). For true CMYK-to-K conversion, use a press-prep tool like Ghostscript or Adobe Acrobat&rsquo;s Print Production tools.",
      },
    ],
    cta: {
      title: "Need to print a booklet?",
      text: "Booklet PDF lays out pages in saddle-stitch order so you can print double-sided, fold the stack in half, and staple. Combine with grayscale for a low-cost printed booklet.",
      linkHref: "/tool/booklet-pdf",
      linkLabel: "Try Booklet PDF",
    },
  },

  "booklet-pdf": {
    useCasesTitle: "Why people make saddle-stitch booklets",
    useCasesIntro:
      "Saddle-stitch booklets are the simplest, cheapest way to bind a multi-page document — print double-sided, fold the stack in half, staple along the fold. Every program, conference handout, recipe collection, and small zine has used this format for a century. Booklet PDF reorders the pages so the math works out.",
    useCases: [
      {
        icon: "Book",
        title: "Event programs &amp; handouts",
        text: "Wedding programs, conference agendas, school recitals, church bulletins. Drop the source PDF, fold the printed sheets, staple — done in 15 minutes.",
      },
      {
        icon: "Pages",
        title: "Recipe books &amp; zines",
        text: "Self-published booklets, family cookbooks, fan zines. Saddle-stitch is the format every small print run uses; this tool gives you the pre-press output.",
      },
      {
        icon: "Sparkle",
        title: "Children&rsquo;s storybooks",
        text: "Print a homemade storybook on letter-size paper (8 source pages → 2 sheets). Folds open into a 5.5×8.5 booklet — a perfect kids&rsquo; book size.",
      },
      {
        icon: "Edit",
        title: "Workshop materials",
        text: "Course handouts, conference workshops, training kits. Booklet format is more polished than a stapled stack of single-sided handouts.",
      },
      {
        icon: "Receipt",
        title: "Sales &amp; marketing collateral",
        text: "Sample brochures, capability decks, leave-behind one-pagers. Saddle-stitch on coated stock looks more professional than coil binding for short runs.",
      },
    ],
    howWorksTitle: "How Booklet PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Source pages auto-pad with blanks at the end so the total is a multiple of 4 (each output sheet holds 4 source pages — 2 front, 2 back).",
      },
      {
        step: "2",
        title: "Pick output paper",
        text: "Letter / A4 / Legal / A3 — all in landscape. Each output sheet holds two source pages side-by-side. Optional faint fold-line guide on each sheet for clean folding.",
      },
      {
        step: "3",
        title: "Print, fold, staple",
        text: "Print double-sided with flip-on-long-edge. Stack in order. Fold the entire stack in half. Staple along the fold (saddle stitch). Done.",
      },
    ],
    faqs: [
      {
        q: "What's the page-reorder rule?",
        a: "For an N-page document (padded to a multiple of 4), output sheet i (1-based) carries [page N-2(i-1), page 2(i-1)+1] on the front and [page 2(i-1)+2, page N-2(i-1)-1] on the back. So sheet 1 front = [pageN, page1], sheet 1 back = [page2, pageN-1], etc. When folded, the source order reads cleanly from front to back.",
      },
      {
        q: "Why are sheets in landscape?",
        a: "Each sheet holds two portrait source pages side-by-side. When you fold the sheet vertically (along the centerline), each half becomes a portrait page in the final booklet. Letter landscape = 11×8.5 → folds to 5.5×8.5 booklet pages. A4 landscape = 11.69×8.27 → folds to A5 booklet pages.",
      },
      {
        q: "What's the &ldquo;flip-on-long-edge&rdquo; print option?",
        a: "When printing double-sided on landscape sheets, the printer needs to know which edge the page rotates around. &ldquo;Flip on long edge&rdquo; (sometimes called &ldquo;long-edge binding&rdquo; or &ldquo;portrait binding&rdquo;) is the right setting for this output — both halves end up oriented the same way after folding. The wrong setting (&ldquo;flip on short edge&rdquo;) prints the back upside-down relative to the front.",
      },
      {
        q: "What if my source isn't a multiple of 4 pages?",
        a: "We auto-pad with blank pages at the end so the math works out. A 10-page source becomes 12-page padded → 3 sheets. The padding always lands at the end so the flow of your content isn't disturbed.",
      },
      {
        q: "Why is there a faint line down the center of each sheet?",
        a: "That&rsquo;s the fold-line guide — a 0.5pt line at 15% opacity. Helps you fold cleanly without measuring. Toggle it off in the Options panel for production print where you want a perfectly clean sheet.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Saddle-stitch imposition is pure pdf-lib (page tree manipulation, no rasterization). Runs entirely in your browser. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Want to print color booklets cheaper?",
      text: "Convert your source to grayscale first to cut color-printing costs by 5–10× per page. Pairs perfectly with booklet imposition for an ultra-cheap print job.",
      linkHref: "/tool/grayscale-pdf",
      linkLabel: "Try PDF to Grayscale",
    },
  },

  "bates-numbers": {
    useCasesTitle: "Why people use Bates numbering",
    useCasesIntro:
      "Bates numbering — sequential identifiers stamped on every page of a document — is the backbone of legal discovery and document production. When you produce 10,000 pages to opposing counsel, every page has a unique label so any deposition reference can pinpoint the exact source.",
    useCases: [
      {
        icon: "Shield",
        title: "Litigation discovery",
        text: "When responding to a discovery request, every produced page gets a Bates label. The labels make it possible for attorneys to cite specific pages (&ldquo;LAW012458, line 14&rdquo;) months later in deposition or trial.",
      },
      {
        icon: "Pages",
        title: "Multi-batch productions",
        text: "Discovery production typically runs in batches over weeks or months. Configurable start number means batch 2 picks up where batch 1 left off — no overlapping or skipped IDs across the entire production.",
      },
      {
        icon: "Book",
        title: "Internal compliance reviews",
        text: "Audit committees, internal investigations, and regulatory inspections all need stable per-page identifiers so reviewers can flag specific pages and other team members find the same content.",
      },
      {
        icon: "Edit",
        title: "Insurance &amp; medical records",
        text: "Personal injury, workers&rsquo; comp, and medical malpractice cases produce huge medical record sets. Bates labels turn the binder of records into something searchable and citable in court.",
      },
      {
        icon: "Convert",
        title: "Contract management",
        text: "Large M&amp;A or commercial deals collect hundreds of supporting documents. Bates labels create a single namespace across the entire deal binder so any clause can be referenced without ambiguity.",
      },
    ],
    howWorksTitle: "How Bates Numbering works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF &amp; configure prefix",
        text: "Set a prefix (LAW / DEF / PROD / SMITH001-), digit count (default 6 → six zero-padded digits), start number (default 1, or pick up where the last batch ended).",
      },
      {
        step: "2",
        title: "Pick position &amp; size",
        text: "Six positions (bottom-right is the most common). Font size 8-14pt — smaller is more typical for unobtrusive labeling.",
      },
      {
        step: "3",
        title: "Stamp &amp; download",
        text: "Pure pdf-lib drawText overlay — non-destructive, preserves original content. The success card shows the last label stamped so you know where to start the next batch.",
      },
    ],
    faqs: [
      {
        q: "What's the difference between Bates numbering and page numbers?",
        a: "Page numbers are generic pagination — &ldquo;1 of 10&rdquo;, &ldquo;Page 5&rdquo;. They reset for every document and don&rsquo;t carry context. Bates numbers are namespaced sequential identifiers — &ldquo;LAW012458&rdquo; — that persist across an entire production. The label tells anyone who sees it (a) which production it&rsquo;s from (LAW prefix) and (b) the unique position within that production. You can reference a single Bates page months later and find exactly that page. You can&rsquo;t do that with generic pagination.",
      },
      {
        q: "How wide should the digit count be?",
        a: "Big enough to cover your largest expected production, plus headroom. For a 5,000-page case, 5 digits (00001-99999) is enough. For million-page e-discovery productions, 7 digits is the standard. Six is the safe default — covers up to 999,999 pages. The tool throws an error before stamping if your configured digit count is too small for the page count + start number, so you can&rsquo;t accidentally produce labels like &ldquo;LAW01000&rdquo; alongside &ldquo;LAW000999&rdquo;.",
      },
      {
        q: "What if my PDF has 100 pages but I want to start at 250?",
        a: "Set the start number to 250. Page 1 of your input becomes LAW000250, page 2 is LAW000251, … page 100 is LAW000349. The success card&rsquo;s &ldquo;continue your next batch from #350&rdquo; hint tells you where to set start number for the next batch.",
      },
      {
        q: "Can I use a different prefix on different page ranges?",
        a: "Not in a single pass. Run the tool twice on different page ranges (use Extract Pages first to split, then run Bates with different prefix on each half). For most discovery workflows, one prefix per case is the convention anyway.",
      },
      {
        q: "Does this affect the original document content?",
        a: "No. The label is a non-destructive overlay drawn on top of existing content. The PDF&rsquo;s text streams, images, and structure are untouched. If you re-extract text from the output, the original content is intact and the Bates label appears as a small text run at the corner.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib runs locally — your discovery files never touch our servers. Especially important for litigation where attorney-client privilege and confidentiality matter. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Need to redact PII before producing?",
      text: "Redact PDF lets you draw rectangles over names, account numbers, and other privileged content. Use it BEFORE stamping Bates labels so the redactions are baked in to the produced version.",
      linkHref: "/tool/redact-free",
      linkLabel: "Try Redact PDF",
    },
  },

  "odd-even-pages": {
    useCasesTitle: "Why people extract odd or even pages",
    useCasesIntro:
      "Most odd/even-pages workflows come from a duplex (two-sided) document where things didn&rsquo;t go as planned. Other use cases: comparing facing pages, cleaning up scans, splitting interleaved content. The operation itself is simple, but it solves a surprising number of pain points.",
    useCases: [
      {
        icon: "Pages",
        title: "Duplex re-scanning",
        text: "Your scanner&rsquo;s duplex feeder failed and only captured one side. Each side now lives in a separate PDF. Extract odd from one + even from the other, merge them in alternating order, and reassemble the original.",
      },
      {
        icon: "Book",
        title: "Single-sided printing prep",
        text: "Some print shops only do single-sided. Extract just odd pages, print, then flip the stack and run even pages. Cheaper than duplex on some workflows.",
      },
      {
        icon: "Edit",
        title: "Content cleanup",
        text: "Lecture slide PDFs sometimes have blank verso pages between content (every other page is intentionally blank). Pull out just the odd pages to get a tight, content-only deck.",
      },
      {
        icon: "Sparkle",
        title: "Side-by-side comparison",
        text: "Compare every left page (odd) vs right page (even) of a two-up document — useful for proofreading layouts or comparing translated columns.",
      },
      {
        icon: "Convert",
        title: "Layout debugging",
        text: "When a print run looks wrong, splitting odd/even isolates which side carries the issue (front-vs-back registration problems show up only in one parity).",
      },
    ],
    howWorksTitle: "How Odd / Even Pages works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Files stay in your browser — nothing uploaded.",
      },
      {
        step: "2",
        title: "Pick parity",
        text: "Odd: pages 1, 3, 5, 7, … (1-based, matches what you see in any PDF viewer). Even: pages 2, 4, 6, 8, …",
      },
      {
        step: "3",
        title: "Extract &amp; download",
        text: "pdf-lib copyPages copies the selected pages into a fresh PDF. Lossless, no rasterization, original page dimensions preserved.",
      },
    ],
    faqs: [
      {
        q: "Are pages numbered 1-based or 0-based?",
        a: "1-based — page 1 (the first page) is odd. Page 2 is even. This matches what you see in PDF viewers and what users intuitively mean by &ldquo;odd&rdquo; / &ldquo;even&rdquo; pages.",
      },
      {
        q: "How do I reassemble odd + even back into the original?",
        a: "Use Merge PDF with the &ldquo;interleave&rdquo; pattern — alternate one page from each input. For most duplex re-scanning workflows: extract odd from scan A, extract even (in REVERSE order — the duplex feeder captures even pages last-to-first) from scan B, then interleave-merge. Some scanners differ; check the actual page order before merging.",
      },
      {
        q: "What if my PDF has 0 odd pages or 0 even pages?",
        a: "A 1-page PDF has 1 odd page and 0 even pages — extracting even fails with a clear error. We don&rsquo;t produce empty output. (A real corner case but it does happen.)",
      },
      {
        q: "Does this preserve bookmarks / outline?",
        a: "Bookmarks are NOT preserved — pdf-lib&rsquo;s copyPages doesn&rsquo;t carry over the document outline. The page content (text, images, vectors) is fully preserved. If bookmarks matter, run pdf-lib&rsquo;s deeper copy and re-anchor manually — beyond this tool&rsquo;s scope.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib runs entirely in your browser. Verifiable in DevTools → Network.",
      },
      {
        q: "Why is this faster than Extract Pages?",
        a: "Extract Pages renders thumbnail previews of every page so you can click which to keep — that&rsquo;s perfect for arbitrary picks but slower and memory-heavy on big PDFs. This tool skips the thumbnail step entirely (the parity rule doesn&rsquo;t need visual confirmation), so it runs in a fraction of the time on documents with hundreds of pages.",
      },
    ],
    cta: {
      title: "Need to merge them back together?",
      text: "Merge PDF combines multiple PDFs into one — drag to reorder, perfect for re-interleaving extracted odd + even halves into the original sequence.",
      linkHref: "/tool/merge",
      linkLabel: "Try Merge PDF",
    },
  },

  "pdf-overlay": {
    useCasesTitle: "Why people use PDF overlay",
    useCasesIntro:
      "Stamping one PDF onto another preserves the FULL vector quality of the overlay — typography, signatures, decorative elements, anything. Distinct from image-based watermarks (which lose vector crispness) and text-based stamps (which can&rsquo;t carry layout). The classic uses are letterhead and watermarking, but the pattern fits any &ldquo;shared template + variable content&rdquo; workflow.",
    useCases: [
      {
        icon: "Pages",
        title: "Letterhead / branded templates",
        text: "Your firm&rsquo;s letterhead lives as a designed PDF (logo, contact block, footer, brand colors). Drop it as the overlay, drop the document content as the base, get the final on-letterhead version — without rebuilding the design in Word every time.",
      },
      {
        icon: "Shield",
        title: "DRAFT / CONFIDENTIAL watermarks",
        text: "Designed watermark with custom typography, transparency, and rotation can&rsquo;t be expressed via a simple text stamp. Build it once as a PDF; apply with this tool. Perfect translucent watermark on every page.",
      },
      {
        icon: "Sparkle",
        title: "Repeating decorative elements",
        text: "Page borders, header bars, gradient backgrounds. Anything that should appear consistently on every page of a document but isn&rsquo;t worth re-typesetting in the source app.",
      },
      {
        icon: "Edit",
        title: "Form templates + variable content",
        text: "Pre-printed form layout (boxes, labels, instructions) as the overlay; user-typed responses as the base. Result: filled form on the official template — useful when the original form-fill app doesn&rsquo;t carry the design.",
      },
      {
        icon: "Receipt",
        title: "Page borders &amp; certificates",
        text: "Award certificates, diplomas, official memos that need a designed border around recipient-specific content. Overlay carries the border + ornaments; base carries the personalized text.",
      },
    ],
    howWorksTitle: "How PDF Overlay works",
    howWorks: [
      {
        step: "1",
        title: "Drop two PDFs",
        text: "&ldquo;Base&rdquo; = the document content. &ldquo;Overlay&rdquo; = the template / letterhead / watermark (first page used as the stamp).",
      },
      {
        step: "2",
        title: "Pick layer + fit + opacity",
        text: "Layer: &ldquo;Behind&rdquo; for letterhead (overlay sits below content), &ldquo;On top&rdquo; for watermark (overlay sits above). Fit: preserve aspect ratio (centered) or stretch to fill. Opacity 0–100%.",
      },
      {
        step: "3",
        title: "Apply &amp; download",
        text: "pdf-lib embeds the overlay&rsquo;s first page once and re-uses it via drawPage on every base page. Vector quality preserved end-to-end.",
      },
    ],
    faqs: [
      {
        q: "What's the difference between &ldquo;On top&rdquo; and &ldquo;Behind&rdquo;?",
        a: "On top (default) draws the overlay AFTER the base content — overlay is the visible top layer. Use for watermarks where the overlay should be the dominant visual (DRAFT, CONFIDENTIAL, your logo). Behind draws the overlay FIRST, then the base content on top — use for letterhead where the document text should remain readable while the design (logo, footer) sits underneath.",
      },
      {
        q: "Why only the first page of the overlay?",
        a: "Multi-page overlays add UX complexity: do you cycle through them? Repeat the last? Match by page number? Most overlay use cases (letterhead, watermark, template) use a single template page, so we picked the simple default. If you have a multi-page overlay, extract the page you want with our Extract Pages tool first.",
      },
      {
        q: "What if the overlay and base have different page sizes?",
        a: "&ldquo;Fit&rdquo; mode preserves the overlay&rsquo;s aspect ratio and centers it on each base page (with white space on the edges where ratios differ). &ldquo;Stretch&rdquo; mode forces the overlay to fill the base page edge-to-edge — useful when overlay was designed for the same paper size and you don&rsquo;t mind a tiny stretch artifact in non-matching cases.",
      },
      {
        q: "Does this work on encrypted PDFs?",
        a: "Owner-restricted PDFs work via pdf-lib&rsquo;s ignoreEncryption flag. User-password-encrypted PDFs (where the file won&rsquo;t open without a password) require unlock first — try the Unlock PDF tool, then run overlay on the unlocked output.",
      },
      {
        q: "Does this preserve the base PDF's text searchability?",
        a: "Yes. Overlay is drawn as a vector composite — base content (text, images, vectors) flows through to the output unchanged. Ctrl+F still works on all the original text. Same for hyperlinks and form fields when in &ldquo;On top&rdquo; mode.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib's embedPdf + drawPage runs entirely in your browser. Both PDFs stay on your device. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Need a simpler text watermark?",
      text: "Watermark PDF stamps configurable text (DRAFT, CONFIDENTIAL, your company name) on every page. No second PDF needed; faster for simple text-only overlays.",
      linkHref: "/tool/stamp-pdf",
      linkLabel: "Try Watermark PDF",
    },
  },

  "csv-to-pdf": {
    useCasesTitle: "Why people convert CSV to PDF",
    useCasesIntro:
      "CSV is the universal data format. PDF is the universal sharing format. CSV-to-PDF turns a spreadsheet export into a paginated, formatted table you can send to anyone — printable, signable, archivable, and free of the formatting drift that creeps in when CSVs open differently in different applications.",
    useCases: [
      {
        icon: "Receipt",
        title: "Financial reports &amp; ledgers",
        text: "Export a transaction log, account ledger, or P&amp;L from your accounting software. Convert to a clean PDF for monthly distribution to stakeholders, compliance archives, or audit trails.",
      },
      {
        icon: "Pages",
        title: "Inventory &amp; product lists",
        text: "Catalog data, stock counts, SKU lists. PDF table is more shareable than a CSV that opens differently in Excel vs. Google Sheets vs. Numbers.",
      },
      {
        icon: "Convert",
        title: "Data exports for review",
        text: "Database query results, API exports, log dumps. Convert to PDF before emailing — recipients without database tooling can still read the data.",
      },
      {
        icon: "Sparkle",
        title: "Compliance &amp; audit logs",
        text: "Audit trails, access logs, change records. Pagination + repeating headers + RFC 4180 quote handling means the PDF is the canonical archived record of the data state.",
      },
      {
        icon: "Book",
        title: "Tabular reports for stakeholders",
        text: "Performance dashboards, KPI summaries, project status tables. PDF format pairs better with email and document workflows than CSV attachments that some recipients can&rsquo;t open natively.",
      },
    ],
    howWorksTitle: "How CSV to PDF works",
    howWorks: [
      {
        step: "1",
        title: "Paste or drop a CSV / TSV",
        text: "Type / paste into the textarea, or drop a .csv / .tsv / .txt file (up to 5 MB). All processing stays in your browser.",
      },
      {
        step: "2",
        title: "Pick delimiter, paper, header",
        text: "Comma / tab / semicolon delimiter (auto-detected from .tsv extension). Paper size (Letter / A4 in portrait or landscape — landscape is recommended for wider tables). Header toggle (treats row 1 as styled header).",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "RFC 4180 parser handles quoted fields + escaped quotes + embedded delimiters. Column widths auto-fit, long cells truncate with ellipsis. Headers repeat on every page. Output is text-selectable + searchable.",
      },
    ],
    faqs: [
      {
        q: "What's the file size / row limit?",
        a: "5 MB of CSV text (~50,000-200,000 rows of typical data). For larger datasets, split the CSV into volumes and combine the resulting PDFs with our Merge tool. The PDF generation pipeline can handle large outputs but browser memory degrades around the 5 MB input mark on most devices.",
      },
      {
        q: "Are quoted fields with commas inside handled correctly?",
        a: "Yes. The parser is RFC 4180 compliant: `&quot;Smith, John&quot;` parses as one field (`Smith, John`). Embedded quotes are escaped via doubling: `&quot;She said &quot;&quot;hi&quot;&quot;&quot;` parses as `She said &quot;hi&quot;`. Embedded newlines inside quoted fields are also supported.",
      },
      {
        q: "Why are my long cells truncated with an ellipsis?",
        a: "When column widths are tight, we truncate cell content with &ldquo;…&rdquo; rather than letting it bleed into adjacent columns or run off the page. For datasets with very long cells, pick landscape paper or a smaller font size to give columns more room. Truncation is visual only — the underlying CSV data is unchanged in the source.",
      },
      {
        q: "Does the header repeat on each page?",
        a: "Yes, when &ldquo;First row is header&rdquo; is enabled (the default). The header gets a light gray background and bold font, and is redrawn at the top of every page so a multi-page table is readable when printed and stapled.",
      },
      {
        q: "What about TSV (tab-separated)?",
        a: "Pick &ldquo;\\t (tab)&rdquo; from the delimiter dropdown. Files with .tsv extension auto-set the delimiter. Most database export tools and `cut`-style Unix utilities produce TSV; both formats are first-class.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. CSV parsing and PDF generation both run in your browser via pdf-lib. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Need plain text rendering?",
      text: "Text to PDF skips the table layout and renders any text input as monospaced flowed text — useful for code listings, logs, and unstructured notes.",
      linkHref: "/tool/text-to-pdf",
      linkLabel: "Try Text to PDF",
    },
  },

  "text-to-pdf": {
    useCasesTitle: "Why people convert text to PDF",
    useCasesIntro:
      "Plain text is portable but ugly to share. PDF is shareable but locked from edit. Text-to-PDF gives you the best of both: paginated, font-styled output that&rsquo;s text-selectable + searchable + printable.",
    useCases: [
      {
        icon: "Convert",
        title: "Code listings &amp; logs",
        text: "Bug reports, audit trails, server logs — share a clean monospaced PDF instead of a wall-of-text email or a copy-paste that loses formatting.",
      },
      {
        icon: "Pages",
        title: "Plain-text reports",
        text: "Markdown drafts, README files, meeting notes — convert to PDF for stakeholder review, signature workflows, or compliance archives.",
      },
      {
        icon: "Book",
        title: "Long-form writing",
        text: "Drafts written in any plain editor (Vim, Sublime, Obsidian) can be PDF&rsquo;d for printing, beta-reading, or submission with consistent typography.",
      },
      {
        icon: "Sparkle",
        title: "Tabular &amp; CSV data",
        text: "A CSV becomes a paginated, monospaced PDF with one click — handy for offline review, audit trails, or printed copies of small datasets.",
      },
      {
        icon: "Image",
        title: "Generated content",
        text: "AI outputs, scraped articles, transcripts. Convert the text to PDF to create a permanent, browseable artifact instead of leaving content trapped in chat history.",
      },
    ],
    howWorksTitle: "How Text to PDF works",
    howWorks: [
      {
        step: "1",
        title: "Paste or drop a file",
        text: "Type / paste into the textarea, or drop a .txt / .md / .csv / .log / .json file (up to 5 MB). All processing stays in your browser.",
      },
      {
        step: "2",
        title: "Pick font &amp; page size",
        text: "Monospace (Courier) for code, Sans-serif (Helvetica) for prose, Serif (Times) for documents. Sizes 8–18pt. Letter or A4 paper.",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "pdf-lib uses StandardFonts (no embed required) and word-wraps long lines. Output is text-selectable + searchable — not a raster.",
      },
    ],
    faqs: [
      {
        q: "Is the output PDF searchable?",
        a: "Yes. Unlike rasterized PDFs (where text is just pixels), Text-to-PDF writes real glyph runs — your output is fully searchable, copyable, and screen-reader accessible. Verify by Ctrl+F inside any PDF viewer.",
      },
      {
        q: "Which font should I pick?",
        a: "Monospace (Courier) is best for code, logs, JSON, CSV — every character takes the same width, so columns stay aligned. Sans-serif (Helvetica) is best for prose and reports — clean and modern. Serif (Times) is best for long-form documents — easier on the eyes for extended reading.",
      },
      {
        q: "What&rsquo;s the max text length?",
        a: "5 MB of text (~5 million characters, roughly 1,500 paginated pages at 11pt monospace). For longer texts, split into volumes and combine the PDFs with our Merge tool.",
      },
      {
        q: "Does it support Markdown formatting?",
        a: "No — Text-to-PDF treats Markdown as literal characters (# heading, **bold**, etc. render as-is). For rendered Markdown → PDF, paste your Markdown into a renderer (e.g. dillinger.io) and export. We&rsquo;re evaluating a dedicated markdown-to-pdf tool — for now, this tool is plain-text-only.",
      },
      {
        q: "Why monospace by default?",
        a: "Monospace is the safe default — it preserves alignment for code, logs, and tabular data, which is what people most often paste into a text-to-PDF tool. Switch to Helvetica or Times if you&rsquo;re converting prose.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Text input and PDF generation both run in your browser via pdf-lib. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Going the other direction?",
      text: "PDF to Text extracts every word from a PDF as plain .txt — useful for indexing, version-controlling, or feeding into AI tools.",
      linkHref: "/tool/pdf-to-text",
      linkLabel: "Try PDF to Text",
    },
  },
};
