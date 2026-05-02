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
      linkHref: "/tool/pdf-form-fill",
      linkLabel: "Try Fill PDF Form",
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

  // 2026-05-01 — Extract Contacts: regex emails + Indian/intl phones
  "extract-contacts": {
    useCasesTitle: "Why people extract emails and phones from PDFs",
    useCasesIntro:
      "Old contact sheets, conference attendee lists, vendor catalogues, sales-rep PDFs, real-estate listings — every flat-file roster has hundreds of contacts that need to live in a CRM, a spreadsheet, or an email tool. Extract Contacts pulls them out as a deduped table with page references — runs entirely in your browser, no signup required.",
    useCases: [
      {
        icon: "Search",
        title: "Sales lead enrichment",
        text: "Conference attendee lists, exhibitor directories, industry reports often have contact details buried in prose. Extraction turns the PDF into a CSV ready for Salesforce / HubSpot / Pipedrive import.",
      },
      {
        icon: "Edit",
        title: "Email-list dedup before campaign",
        text: "When inheriting a contact list as a PDF (a common consultancy / agency situation), extract first, dedupe against your existing CRM, then upload the new-only contacts. Saves the spend on already-known leads.",
      },
      {
        icon: "Pages",
        title: "Vendor / supplier directory parsing",
        text: "MSME directories, trade-association rosters, and exhibitor lists publish as PDFs. The structured CSV makes them queryable — find every supplier in a city, every vendor with a specific email domain.",
      },
      {
        icon: "Shield",
        title: "Resume contact-info verification",
        text: "Recruiters with hundreds of candidate PDFs use the tool to standardize the contact info they capture into ATS — same email/phone formats across all candidates, no re-keying typos.",
      },
      {
        icon: "Book",
        title: "Real-estate / classified listings",
        text: "Indian property classifieds publish as multi-page PDFs. Extract phones to get every broker / owner number with page references for follow-up. Indian phone formats (+91, bare 10-digit, STD landline) all detected.",
      },
    ],
    howWorksTitle: "How Extract Contacts works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. The byte-parser pipeline that runs PDF to Text + the email/phone regex all execute in your browser — nothing uploaded.",
      },
      {
        step: "2",
        title: "We extract + dedupe",
        text: "Emails matched via standard local-part@domain.tld regex. Phones matched via India-first ordered patterns (+91 XXXXX XXXXX → 0XX-XXXXXXXX → bare 10-digit) plus US/Canadian and generic international (+CC). Each contact deduped across pages with occurrence count + page list preserved.",
      },
      {
        step: "3",
        title: "Copy or export CSV",
        text: "Combined CSV (type / value / normalized / region / count / pages) drops into your CRM, spreadsheet, or email tool. JSON export available for programmatic workflows.",
      },
    ],
    faqs: [
      {
        q: "What phone formats are supported?",
        a: "Indian formats are primary: +91 XXXXX XXXXX, +91-XXXXX-XXXXX, +91XXXXXXXXXX, 0XX-XXXXXXXX (STD landline), bare 10-digit (mobile). Plus US/Canadian (+1 (XXX) XXX-XXXX, etc.) and generic international (+CC ...). Bare 10-digit numbers default to Indian classification (mobiles starting 6-9; landlines 2-5).",
      },
      {
        q: "Will it catch obfuscated emails like &lsquo;name [at] domain dot com&rsquo;?",
        a: "No. The regex matches standard email format only. Obfuscated emails are intentionally hard to scrape — that's their purpose. For obfuscated formats, use AI Extract Entities which uses an LLM and handles natural-language obfuscation.",
      },
      {
        q: "What about scanned PDFs?",
        a: "Won&rsquo;t work — we extract from PDF text, and scanned PDFs have no text layer. The tool detects this case and tells you to run AI PDF OCR first to add a text layer, then re-run Extract Contacts.",
      },
      {
        q: "Does it work for non-English content?",
        a: "Email regex is universal (emails are ASCII). Phone regex is biased toward Indian + US formats; other international formats with + prefix usually match but won&rsquo;t be normalized. For Indic-script content (Hindi, Tamil, etc.), text extraction itself works on Unicode PDFs but quality degrades on older non-Unicode fonts.",
      },
      {
        q: "Privacy?",
        a: "Everything runs in your browser. The PDF never leaves your machine. The extracted contact table is for your own use — for sharing with third parties (e.g. handing a list to a marketing agency), redact PII via Redact PDF or scrub via your own tool first.",
      },
      {
        q: "What about false positives?",
        a: "Phone regex over-matches on prices, timestamps, ID numbers — those get filtered by &lsquo;isLikelyPhone&rsquo; before output, but a few may slip through. Eyeball the output before importing into a CRM.",
      },
    ],
    cta: {
      title: "Need to extract structured entities too?",
      text: "AI Extract Entities surfaces people, organizations, places, and dates as four separate tables — useful when you need named-entity tables, not just emails and phones.",
      linkHref: "/tool/ai-entities",
      linkLabel: "Try AI Extract Entities",
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

  "pdf-diff": {
    useCasesTitle: "Why people compare PDFs visually",
    useCasesIntro:
      "Pixel-level diff is the simplest, most language-agnostic way to spot what changed between two versions of a document. Layout shifts, removed images, edited tables, even small color changes — they all show up as red highlights without needing to read either document. Pairs with content-level diff (AI Compare) when you want to know what the text says.",
    useCases: [
      {
        icon: "Edit",
        title: "Document version review",
        text: "Two revisions of a contract, proposal, or report. Run the diff to see at a glance what changed visually — additions, deletions, and layout shifts all light up. Faster than reading both documents end-to-end.",
      },
      {
        icon: "Shield",
        title: "Compliance &amp; audit verification",
        text: "Verify that a sealed copy hasn&rsquo;t been tampered with, or that a regulator&rsquo;s &ldquo;final&rdquo; version matches what you submitted. Pixel diff catches modifications a human eye would miss in side-by-side review.",
      },
      {
        icon: "Pages",
        title: "Print-prep proofing",
        text: "Compare a draft proof against the press-ready file. Color shifts, font substitutions, missing artwork — all show up as red. Catches problems before they reach the printer.",
      },
      {
        icon: "Sparkle",
        title: "Translation QA",
        text: "Compare a translated PDF against the source layout. Even though text is different, the diff highlights layout drift — text that overflows, images that moved, captions that grew or shrank.",
      },
      {
        icon: "Convert",
        title: "Accessibility &amp; rendering checks",
        text: "Compare a PDF rendered in two different viewers (Acrobat vs. Preview vs. browser). Differences indicate rendering inconsistencies that may affect screen-reader users or print-output quality.",
      },
    ],
    howWorksTitle: "How Compare PDFs works",
    howWorks: [
      {
        step: "1",
        title: "Drop two PDFs",
        text: "PDF A (original / before) and PDF B (revised / after). Both stay in your browser; nothing uploaded.",
      },
      {
        step: "2",
        title: "Pick sensitivity",
        text: "Per-channel pixel-delta threshold (4–64). Default 16 catches meaningful changes while ignoring rendering noise like anti-aliasing differences. Lower = more sensitive (catches subtle color shifts).",
      },
      {
        step: "3",
        title: "Compare &amp; download",
        text: "PDFium renders both PDFs at matching scale. Pixel-by-pixel BT.709 luminance comparison; red highlight on regions that differ over a grayscale base. Per-page diff percentage in the success card.",
      },
    ],
    faqs: [
      {
        q: "Why visual diff instead of text diff?",
        a: "Both have their place. Visual diff (this tool) catches layout, color, font, and image changes that text diff misses entirely — a moved paragraph, a swapped logo, a different font weight. Text diff (use AI Compare for that) catches semantic content changes that visual diff misses — a single word changed in a sea of identical text might be 0.1% of pixels but completely changes meaning. For thorough QA, run both.",
      },
      {
        q: "What does the red highlighting mean exactly?",
        a: "A pixel is flagged &ldquo;different&rdquo; when the maximum delta across R, G, or B channels exceeds the threshold. Below threshold = treated as identical (anti-aliasing noise, JPEG artefacts, etc.). Above threshold = the pixel renders with a red overlay (60% red mixed with 40% grayscale of the original A pixel). Result: you see WHERE differences are, with enough context to know WHAT region of the page changed.",
      },
      {
        q: "What if A and B have different page counts?",
        a: "Pages present in only one document render with a tinted overlay — blue tint for &ldquo;only in A&rdquo;, green tint for &ldquo;only in B&rdquo; — over a grayscale base of that side&rsquo;s content. So a 5-page A and 7-page B produces 7 output pages: 5 normal diff pages + 2 green-tinted &ldquo;only in B&rdquo; pages. The per-page stats table calls out which is which.",
      },
      {
        q: "Why is the output rasterized?",
        a: "Visual pixel diff requires rasterizing both inputs to RGBA at matching scale before comparison. The output is the diff visualization, which is inherently a raster image (the red overlay is computed in pixel space). Text in the original PDFs is no longer searchable in the diff output — that&rsquo;s the trade-off. For content-level diffs that preserve text, use AI Compare.",
      },
      {
        q: "What's the practical limit on document size?",
        a: "Memory-bound. Each rendered page at 1.5× scale is roughly 5 MB of RGBA pixels in browser memory; we keep both documents&rsquo; pixel buffers in memory during the comparison loop. ~50 pages per side is comfortable on a typical laptop; 200+ pages may slow or freeze the tab. Lower the scale for larger documents.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Both PDFs render via PDFium WASM in your browser; pixel comparison is a local canvas operation; the diff output is built locally via pdf-lib. Verifiable in DevTools → Network — the only request you should see is the PDFium WASM module fetch (one time).",
      },
    ],
    cta: {
      title: "Need to compare what the documents SAY?",
      text: "AI Compare reads both documents and produces a structured semantic diff — added paragraphs, removed clauses, changed wording — instead of pixel-level visual changes. Pairs naturally with this tool.",
      linkHref: "/tool/ai-compare",
      linkLabel: "Try AI Compare",
    },
  },

  "pdf-batch": {
    useCasesTitle: "Why people use batch PDF processing",
    useCasesIntro:
      "Most PDF tasks are one-off. Batch PDF processing is for the times when they aren&rsquo;t — when you have 30 scans to rotate, 50 invoices to watermark, or 100 contracts to strip metadata from. Repeating the same operation file by file is tedious and error-prone; doing it in one batch is the obvious answer.",
    useCases: [
      {
        icon: "Pages",
        title: "Bulk scan correction",
        text: "Phone-scanned documents often come in sideways or upside-down. Drop the whole stack, pick the rotation that fixes them, get a fixed batch back as a zip.",
      },
      {
        icon: "Receipt",
        title: "Invoice / receipt watermarking",
        text: "Mark every invoice in a month&rsquo;s billing with &ldquo;PAID&rdquo; or &ldquo;DRAFT&rdquo;. Batch keeps the watermark settings consistent across the run; alternative is opening 50 PDFs one at a time.",
      },
      {
        icon: "Shield",
        title: "Privacy / compliance metadata strip",
        text: "Most PDFs leak author / creator / producer / dates in metadata. Before sharing externally, run the batch with &ldquo;remove metadata&rdquo; to scrub every file at once. Pairs well with auditing the result via PDF Inspector.",
      },
      {
        icon: "Edit",
        title: "Form-fill finalization",
        text: "After filling 20 expense forms (or any AcroForm batch), flatten all of them at once so values are baked in before sharing. Recipients can&rsquo;t edit; original templates stay editable elsewhere.",
      },
      {
        icon: "Convert",
        title: "Pagination for binders",
        text: "Compiling a binder from many separate PDFs (case files, exhibits, training materials)? Add page numbers to every PDF in one pass before merging — keeps numbering consistent across the binder.",
      },
    ],
    howWorksTitle: "How Batch Process works",
    howWorks: [
      {
        step: "1",
        title: "Drop multiple PDFs",
        text: "Up to 50 PDFs, 100 MB each. Drag-drop or click to browse. Files stay in your browser — nothing uploaded.",
      },
      {
        step: "2",
        title: "Pick one operation",
        text: "8 operations available: rotate (90 / 180 / 270), page numbers, diagonal watermark with custom text, remove metadata, flatten forms, strip links. Each uses sensible defaults so the batch UX doesn&rsquo;t need per-file config.",
      },
      {
        step: "3",
        title: "Run &amp; download zip",
        text: "Per-file progress shows which is processing. Per-file error isolation — one bad file doesn&rsquo;t fail the batch. Successful outputs bundle into a single zip; per-file download buttons available too.",
      },
    ],
    faqs: [
      {
        q: "Why only 8 operations?",
        a: "Batch UX works best when every file in the batch shares the same config. Operations with multiple knobs (resize, crop, n-up, image watermark) need per-file decisions where the batch model breaks down — those have their own dedicated tools where you can tune each file individually. The 8 operations available here all work the same way regardless of input shape, so a single config knob covers the whole batch.",
      },
      {
        q: "What if one PDF in the batch fails?",
        a: "Per-file error isolation — the batch continues, that file lands as a failure with the error message in the per-file results table. Successful outputs still go into the zip; failed ones are excluded but visible in the result list so you know which to retry. The success card shows e.g. &ldquo;Processed 47 of 50 PDFs · 3 failed&rdquo;.",
      },
      {
        q: "What's the page numbers / watermark default?",
        a: "Page numbers: bottom-right, &ldquo;Page 1 of N&rdquo; format, 11pt. Watermark: diagonal across each page, 30% opacity, your custom text. If you need different defaults (different position, smaller font, different opacity), use the dedicated single-file tools — Page Numbers and Watermark — and run them per file.",
      },
      {
        q: "How long does the batch take?",
        a: "Roughly a few hundred milliseconds per file for fast operations (rotate, strip-links, remove-metadata) and a couple of seconds per file for slower ones (page-numbers, watermark — both add per-page drawText calls). 50-file batch of mostly small PDFs typically lands in 30–60 seconds.",
      },
      {
        q: "What's the file size limit?",
        a: "100 MB per file, 50 files per batch (so up to ~5 GB of input). Browser memory is the practical constraint — very large batches of large PDFs may slow the tab. Run smaller batches if you hit limits.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. pdf-lib runs locally; the zip is built locally via JSZip. No PDFs touch our servers. Verifiable in DevTools → Network — the only request you should see is the JSZip module fetch (one time, ~100 KB).",
      },
    ],
    cta: {
      title: "Need to combine into one PDF?",
      text: "Merge PDF combines multiple PDFs into a single output (instead of a zip of separate PDFs). Drag to reorder, lossless — pairs well with batch when you want a unified deliverable instead of a folder of files.",
      linkHref: "/tool/merge",
      linkLabel: "Try Merge PDF",
    },
  },

  "pdf-form-fill": {
    useCasesTitle: "Why people fill PDF forms online",
    useCasesIntro:
      "Government forms, HR onboarding packets, insurance enrollments, vendor agreements, school registrations — the world runs on fillable PDFs, and most of them won&rsquo;t open cleanly in the apps you already have. Fill PDF Form gives you a clean, browser-based way to fill any AcroForm document, with the option to lock the values when you share it.",
    useCases: [
      {
        icon: "Pages",
        title: "Government &amp; tax forms",
        text: "IRS forms, visa applications, court filings, business registrations. The form is fillable but Adobe Reader won&rsquo;t cooperate, Preview drops some fields, and online portals charge to fill. Drop the PDF here and fill in your browser — no signup, no upload.",
      },
      {
        icon: "Edit",
        title: "HR onboarding packets",
        text: "New-hire paperwork, benefits enrollment, direct-deposit forms. Fill once on your laptop, optionally flatten so the values can&rsquo;t be tampered with downstream, send to HR.",
      },
      {
        icon: "Shield",
        title: "Insurance &amp; medical intake",
        text: "Patient intake, insurance claims, authorization forms. Sensitive fields (SSN, account numbers) stay in your browser — never uploaded to a server. The flatten option makes the filled copy a static record for the file.",
      },
      {
        icon: "Receipt",
        title: "Vendor &amp; procurement docs",
        text: "Supplier registration, W-9, NDA acknowledgements. Most vendors want a flattened, signed copy. Fill, optionally flatten, then sign with our Sign PDF tool — everything in browser.",
      },
      {
        icon: "Book",
        title: "School &amp; child registration",
        text: "Enrollment, after-school programs, field-trip permission, medical history. Fill multiple forms with the same recurring info (parent contact, emergency contact) without retyping.",
      },
    ],
    howWorksTitle: "How Fill PDF Form works",
    howWorks: [
      {
        step: "1",
        title: "Drop your fillable PDF",
        text: "We read the AcroForm structure with pdf-lib — text fields, checkboxes, radio groups, dropdowns, multi-select option lists. Read-only fields surface as locked.",
      },
      {
        step: "2",
        title: "Fill the inputs",
        text: "Native browser controls render per field type. Multi-line text fields get a textarea; single-line gets an input. Radios are mutually-exclusive; checkboxes are independent. Multi-select supports cmd/ctrl-click.",
      },
      {
        step: "3",
        title: "Build &amp; download",
        text: "Optional flatten bakes values into the page content stream — recipients see them but can&rsquo;t edit. Otherwise output stays editable. pdf-lib regenerates appearance streams so values display in any modern PDF viewer.",
      },
    ],
    faqs: [
      {
        q: "What's the difference between &ldquo;flatten&rdquo; and the default?",
        a: "Default: form fields stay editable. The recipient can open the PDF and change any value. Flatten: values are baked into the page content as static text — looks identical, but the recipient can&rsquo;t edit. Use flatten when you&rsquo;re finalizing a form for filing or signature; keep editable when you want to leave room for downstream edits (e.g. iterating on a draft).",
      },
      {
        q: "Why are some fields read-only or skipped?",
        a: "Read-only: the form&rsquo;s author marked the field as not user-fillable (a calculated field, an auto-incrementing ID, etc.). pdf-lib respects that flag — the input renders disabled. Skipped: the field is a signature field (use Sign PDF tool) or a generic button (no value to fill). Both surface in the success card&rsquo;s &ldquo;skipped&rdquo; list.",
      },
      {
        q: "Will my PDF reader display the values correctly?",
        a: "Yes for modern viewers (Preview, Chrome, Adobe Acrobat, Foxit). pdf-lib regenerates appearance streams during save, so the values render without needing the /NeedAppearances flag. Corner-case viewers that ignore appearance streams may show empty fields — for those, use the flatten option to bake values into the page content directly.",
      },
      {
        q: "What happens if my PDF has no AcroForm?",
        a: "&ldquo;This PDF doesn&rsquo;t have any fillable form fields&rdquo; appears as an error before the form view loads. AcroForm is the standard form layer in PDF — most fillable forms have it. PDFs that &ldquo;look&rdquo; fillable but aren&rsquo;t (e.g. raster scans of forms) need to be re-created with proper form fields first; we don&rsquo;t add new fields in this tool.",
      },
      {
        q: "Can I fill the same form 100 times with different data?",
        a: "Not in a single pass — this tool fills one form at a time. For mail-merge-style bulk filling from a CSV, that&rsquo;s a separate tool we&rsquo;re evaluating. The existing one-at-a-time flow is fast enough for typical use (open, fill, download, repeat).",
      },
      {
        q: "Is anything uploaded?",
        a: "No. PDF parsing, schema extraction, value writing, and PDF regeneration all run in your browser via pdf-lib. Sensitive fields (SSN, bank info, medical history) never leave your device. Verifiable in DevTools → Network.",
      },
    ],
    cta: {
      title: "Need to sign the filled form?",
      text: "Sign PDF places a signature image (drawn or uploaded) on a click-and-drag rectangle. Pairs naturally with form filling — fill, flatten, sign, send.",
      linkHref: "/tool/sign-pdf-free",
      linkLabel: "Try Sign PDF",
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

  // =====================================================================
  // AI tool longforms (Phase 1 of the AI standardization parity backfill,
  // 2026-05-01). 12 high-traffic AI tools at full parity with free-tool
  // longforms. The remaining ~37 AI tools are tracked in
  // KNOWN_AI_LONGFORM_PENDING in scripts/test-tool-content-coverage.mjs
  // with a per-tool TODO and a shrinkage cap. Adding a longform here +
  // removing the corresponding entry from that map is how the backfill
  // progresses.
  //
  // Editorial bar: each AI tool's longform must reflect the tool's
  // actual behavior (not generic AI marketing), acknowledge limitations
  // honestly (heuristic vs deterministic, what the model can/can't
  // verify), distinguish from variant tools, and use the existing
  // copy tone (direct, no hyperbole).
  // =====================================================================

  "ai-summarize": {
    useCasesTitle: "Why people use AI summarize",
    useCasesIntro:
      "When a document is long enough that reading it cover-to-cover isn&rsquo;t practical, a summary is the difference between &ldquo;I read it&rdquo; and &ldquo;I meant to read it.&rdquo; AI summarize generates a structured digest that surfaces the document&rsquo;s actual claims, decisions, and findings — with page citations so you can jump back for verification.",
    useCases: [
      {
        icon: "Book",
        title: "Long-form report digest",
        text: "Annual reports, market research, white papers — content where the executive summary is fine but you need a level deeper than the abstract. Summary lands at ~1/10th the length and keeps the section-by-section structure.",
      },
      {
        icon: "Pages",
        title: "Meeting transcript distillation",
        text: "Drop the auto-generated transcript from your call recording, get a recap with decisions, action items, and unresolved questions. Useful for catching attendees up; pairs with AI Action Items for the to-do extraction.",
      },
      {
        icon: "Shield",
        title: "Contract / legal overview",
        text: "Get the gist of a 40-page MSA before sending it to counsel. Summary won&rsquo;t replace legal review, but it tells you which clauses to ask about. Liability caps, term length, payment terms, and termination triggers all surface.",
      },
      {
        icon: "Sparkle",
        title: "Article / paper triage",
        text: "Decide whether a research paper or industry article deserves your full read. Summary covers method + findings + caveats so you can route to a deep read, a skim, or a delete.",
      },
      {
        icon: "Edit",
        title: "Email-thread / chat-export distillation",
        text: "A 30-message email thread or 200-message Slack export becomes a 6-bullet recap of decisions made and parties involved. Especially useful for joining a project mid-stream.",
      },
    ],
    howWorksTitle: "How AI Summarize works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF + pick depth",
        text: "Upload a PDF up to 100 MB. Pick &ldquo;summary&rdquo; depth (default) or one of the variants — TL;DR, key points, study notes, ELI5, FAQ — each tuned for a different reading goal.",
      },
      {
        step: "2",
        title: "We extract + chunk + summarize",
        text: "Server-side text extraction (no rasterization), chunking when the PDF exceeds the model&rsquo;s context window, then a map-reduce pass to keep section structure. The model used is selected by the routing layer for cost-vs-quality fit.",
      },
      {
        step: "3",
        title: "Get markdown back with page cites",
        text: "Output is markdown with section headings + page references. Download as .md or copy. The document and the summary land in /app/files for re-access without re-spending credits.",
      },
    ],
    faqs: [
      {
        q: "How long is the output, and is it deterministic?",
        a: "Length scales with input — for typical 10–40 page docs, the summary is ~500–1500 words. Output is NOT byte-identical across runs (LLM nondeterminism + temperature), but the structure and major points are stable. If you re-summarize the same PDF you&rsquo;ll get the cached result for free (idempotent via internal idempotency key).",
      },
      {
        q: "Does it cite specific pages?",
        a: "Yes — claims that originate in a specific page or section are followed by a page-number reference. This is the key feature that distinguishes pdfcraft summary from a generic chatbot summary: every assertion is verifiable in the source.",
      },
      {
        q: "What about confidential documents?",
        a: "The PDF is sent to the AI provider for inference (no client-side LLM today). It&rsquo;s NOT stored by the provider beyond the inference window (we use no-train endpoints where available). For maximum privacy on truly sensitive documents, redact first — Redact PDF is in-browser and sensitive content never reaches a server.",
      },
      {
        q: "How is this different from AI TL;DR / Key Points?",
        a: "Same backend op, different presentation. Summary is the default 1/10th-length structured digest. TL;DR is a 2–3 sentence elevator pitch. Key Points is bullet-list-only. ELI5 explains like you&rsquo;re a layperson. Study Notes is exam-prep oriented. Pick the variant that matches how you&rsquo;ll use the output.",
      },
      {
        q: "What's the credit cost?",
        a: "3 credits per summary by default. Cost is fixed per submission regardless of PDF size — no surprises. Credit balance + remaining quota is visible on /app/billing.",
      },
      {
        q: "What if the summary is wrong?",
        a: "It happens. LLMs occasionally fabricate (hallucinate) details, especially on technical content. Use the page citations to verify any claim before relying on it. For high-stakes work (legal, medical, financial), treat the summary as a navigation aid, not a substitute for reading the source.",
      },
    ],
    cta: {
      title: "Need a tighter version?",
      text: "AI TL;DR returns a 2–3 sentence elevator-pitch version of the same content — useful for the executive forwarding the doc to a busy stakeholder.",
      linkHref: "/tool/ai-tldr",
      linkLabel: "Try AI TL;DR",
    },
  },

  "ai-tldr": {
    useCasesTitle: "Why people use AI TL;DR",
    useCasesIntro:
      "Sometimes you don&rsquo;t need a structured summary — you need the 30-second version you&rsquo;d say to someone over coffee. TL;DR returns a 2–3 sentence distillation of the document&rsquo;s headline argument, decision, or finding. No bullets, no sections — just the takeaway.",
    useCases: [
      {
        icon: "Sparkle",
        title: "Slack / chat forwarding",
        text: "Drop a TL;DR into a Slack channel as the lead-in when sharing a long doc. Saves teammates the &ldquo;TL;DR pls&rdquo; reply and gets the doc actually read.",
      },
      {
        icon: "Pages",
        title: "Pre-meeting briefing",
        text: "30 seconds of pre-read for a 60-minute meeting. Read the TL;DR while walking to the room — you arrive informed enough to ask questions.",
      },
      {
        icon: "Edit",
        title: "Reading-list triage",
        text: "20 articles in the to-read pile. TL;DR each one to decide which deserve a full read, a skim, or a delete. Faster than 20 abstracts.",
      },
      {
        icon: "Receipt",
        title: "Email subject lines",
        text: "Use the TL;DR as the elevator pitch when forwarding a doc by email. Recipients see the takeaway in the subject and decide whether to open.",
      },
      {
        icon: "Convert",
        title: "Note-taking shorthand",
        text: "Personal knowledge management — store the TL;DR alongside a doc reference in your notes app. When you re-encounter the doc 6 months later, the TL;DR jogs your memory faster than re-skimming.",
      },
    ],
    howWorksTitle: "How AI TL;DR works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Same backend as AI Summarize but tuned for extreme brevity.",
      },
      {
        step: "2",
        title: "We extract the headline finding",
        text: "Server-side text extraction → map-reduce pass tuned for a 2–3 sentence output. The prompt explicitly forbids preamble (&ldquo;This document discusses...&rdquo;) so what you get is the substance, not framing.",
      },
      {
        step: "3",
        title: "Get a 2–3 sentence takeaway",
        text: "Plain text output. Copy + paste anywhere. Stored in /app/files alongside the source PDF for re-access.",
      },
    ],
    faqs: [
      {
        q: "Why is the output so short — am I losing information?",
        a: "Yes, deliberately. TL;DR is the 30-second version. If 2–3 sentences isn&rsquo;t enough for your purpose, use AI Summarize (1/10th-length structured digest) or AI Key Points (bullet list). Pick the level of compression that matches your reading goal.",
      },
      {
        q: "How accurate is a 2-sentence summary?",
        a: "Accurate enough for triage, not accurate enough for decision-making. The compression is brutal — nuance disappears. Treat TL;DR as &ldquo;should I read this?&rdquo; not as &ldquo;what does this say?&rdquo;",
      },
      {
        q: "Does it work on multi-topic documents?",
        a: "Less well. Documents with several distinct sections or competing arguments compress poorly into 2 sentences. For those, AI Key Points or AI Summarize keeps the structure intact.",
      },
      {
        q: "What if my doc has charts or images?",
        a: "TL;DR is text-only. Charts / figures are noted but not interpreted (that&rsquo;s AI Chart-to-Table&rsquo;s scope). For image-heavy docs, AI OCR first to surface the text content, then TL;DR.",
      },
      {
        q: "What's the credit cost?",
        a: "3 credits per TL;DR. Same as AI Summarize because the backend work is the same — the difference is in output formatting.",
      },
      {
        q: "Can I send a PDF with confidential information?",
        a: "Same posture as AI Summarize — sent to the inference provider, not stored. For high-confidentiality content, redact first via the in-browser Redact PDF tool, then TL;DR the redacted version.",
      },
    ],
    cta: {
      title: "Need more than 2 sentences?",
      text: "AI Summarize returns a 1/10th-length structured digest with section headings and page citations — when the takeaway needs more than the elevator pitch.",
      linkHref: "/tool/ai-summarize",
      linkLabel: "Try AI Summarize",
    },
  },

  "ai-key-points": {
    useCasesTitle: "Why people use AI Key Points",
    useCasesIntro:
      "Bullet lists trade prose for parallelism — every key point sits at the same level of importance, scannable, copyable, easy to share. AI Key Points extracts the document&rsquo;s major claims, findings, or decisions as a clean list of bullets.",
    useCases: [
      {
        icon: "Edit",
        title: "Lecture / seminar notes",
        text: "Transcript or slide-deck PDF in, bullet-list takeaways out. Faster than re-watching the recording; structured enough to study from.",
      },
      {
        icon: "Receipt",
        title: "Meeting recap bullets",
        text: "After-the-meeting recap email becomes 8 bullets you can paste directly into the email. Pairs with AI Action Items for the follow-up to-dos.",
      },
      {
        icon: "Book",
        title: "Research highlights",
        text: "Pull the methodology + findings + caveats from a paper as bullets. Useful for lit-review notes or for the &ldquo;background&rdquo; section of your own writing.",
      },
      {
        icon: "Sparkle",
        title: "Decision-doc actions",
        text: "Strategy docs, RFC-style proposals, board memos — extract the explicit decisions or recommendations as bullets so they&rsquo;re easy to track and reference.",
      },
      {
        icon: "Convert",
        title: "Study card prep",
        text: "First step in turning textbook chapters into review material. Pairs with AI Flashcards (which generates Q&amp;A pairs from the same source).",
      },
    ],
    howWorksTitle: "How AI Key Points works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Output is markdown bullet list — every bullet a single point.",
      },
      {
        step: "2",
        title: "We extract structural points",
        text: "The prompt is tuned to extract claims, decisions, or findings — not subjective &ldquo;the author thinks&rdquo; framing. Page citations included.",
      },
      {
        step: "3",
        title: "Get a markdown bullet list",
        text: "Typically 5–15 bullets depending on document length. Copy + paste into Notion, Slack, email, etc. with formatting preserved.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI Summarize?",
        a: "Summary preserves narrative structure (section headings + paragraphs); Key Points strips it to bullets. Summary is for &ldquo;tell me what this says&rdquo;; Key Points is for &ldquo;give me the takeaways I can paste somewhere.&rdquo;",
      },
      {
        q: "What's the bullet count?",
        a: "Aimed at 5–15 bullets — long enough to cover the main content, short enough to skim. The prompt won&rsquo;t pad the list to hit a target count; if a doc only has 6 distinct key points, you get 6 bullets.",
      },
      {
        q: "Does it preserve hierarchy or sub-points?",
        a: "Top-level only. Nested bullets aren&rsquo;t emitted by default — they hurt scannability. For hierarchical study material, AI Mindmap is the better fit.",
      },
      {
        q: "Can I get the bullets as flashcards instead?",
        a: "Yes — AI Flashcards generates Q&amp;A pairs from the same kind of source content. Use Key Points when you need bullets for a recap; use Flashcards when you need self-test material.",
      },
      {
        q: "What's the credit cost?",
        a: "3 credits per extraction. Same as Summarize / TL;DR — same backend, different output framing.",
      },
      {
        q: "What if my document has nothing extractable?",
        a: "Pure prose / narrative content (memoir, fiction) doesn&rsquo;t map well to bullets. The model will produce an output, but it will read forced. Use AI Summarize for narrative content; AI Key Points works best on documents with explicit structure (papers, reports, decision docs).",
      },
    ],
    cta: {
      title: "Need self-test material?",
      text: "AI Flashcards generates Q&A pairs from the same kind of source content — Anki-compatible CSV export so you can drill the material later.",
      linkHref: "/tool/ai-flashcards",
      linkLabel: "Try AI Flashcards",
    },
  },

  "ai-eli5": {
    useCasesTitle: "Why people use AI ELI5",
    useCasesIntro:
      "ELI5 (&ldquo;explain like I&rsquo;m 5&rdquo;) trades technical precision for plain-language clarity — useful when the reader doesn&rsquo;t share the document&rsquo;s domain expertise. The output explains the document&rsquo;s content as if to a smart non-specialist.",
    useCases: [
      {
        icon: "Book",
        title: "Cross-discipline explanation",
        text: "Engineer reading a marketing strategy doc, accountant reading a research paper, designer reading a legal contract — ELI5 bridges the vocabulary gap so the reader gets the substance without the jargon.",
      },
      {
        icon: "Pages",
        title: "Customer-facing technical content",
        text: "Internal whitepaper too dense for the customer-facing landing page? ELI5 it as a starting draft. The plain-language version becomes input for marketing or support content.",
      },
      {
        icon: "Sparkle",
        title: "Family member medical / legal explainer",
        text: "Explain a lab result, a medical procedure consent form, or a legal notice to someone outside the field. ELI5 won&rsquo;t replace a professional consultation but it bridges the gap between &ldquo;I have no idea what this says&rdquo; and asking the right follow-up questions.",
      },
      {
        icon: "Edit",
        title: "K–12 / undergrad study aid",
        text: "A textbook chapter or research paper that&rsquo;s above the student&rsquo;s level becomes a starting-point explanation. Use to build intuition before reading the source.",
      },
      {
        icon: "Convert",
        title: "Onboarding new team members",
        text: "New hire reading the design doc for a system they don&rsquo;t yet understand — ELI5 provides a plain-language entry point. Pairs with AI Summarize for the structured version once concepts are clear.",
      },
    ],
    howWorksTitle: "How AI ELI5 works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Works on any technical document — papers, contracts, lab results, RFCs.",
      },
      {
        step: "2",
        title: "We translate jargon to plain language",
        text: "The prompt is tuned to swap domain-specific terms for everyday equivalents and to explain why each major concept matters. Analogies are used liberally; technical precision is sacrificed when needed.",
      },
      {
        step: "3",
        title: "Get a plain-language explanation",
        text: "Markdown output, ~300–800 words depending on document complexity. Page citations included so the reader can verify against the source after building intuition.",
      },
    ],
    faqs: [
      {
        q: "How simplified is the output — actually for a 5-year-old?",
        a: "No, the &ldquo;5&rdquo; is figurative — the audience is &ldquo;smart layperson outside the field.&rdquo; The output is calibrated to a high school / general-public reading level. For actual children, you&rsquo;d want a different tool with kid-specific tone tuning.",
      },
      {
        q: "Won't simplification introduce inaccuracies?",
        a: "Yes — that&rsquo;s the trade-off. ELI5 prioritizes accessibility over precision. For high-stakes content (medical, legal, financial decisions), use ELI5 to BUILD INTUITION before the careful read, not as a substitute for it. Page cites are included so you can verify.",
      },
      {
        q: "Is it useful for non-technical content?",
        a: "Less so. ELI5 shines when the source contains domain jargon that needs translating. A novel or memoir already speaks to a general audience — ELI5 won&rsquo;t add much. Use AI Summarize for non-technical content.",
      },
      {
        q: "What about non-English documents?",
        a: "ELI5 outputs in the language of the input by default. For cross-language plain-language explanation (e.g. German technical doc → English ELI5), run AI Translate first, then ELI5 the translated version.",
      },
      {
        q: "What's the credit cost?",
        a: "3 credits per explanation.",
      },
      {
        q: "Can I customize the audience level?",
        a: "Not yet — the prompt is fixed at &ldquo;smart layperson.&rdquo; If you need a more technical or more elementary level, AI Summarize (more technical) or AI Study Notes (exam-prep oriented) are alternative variants tuned for different audiences.",
      },
    ],
    cta: {
      title: "Need the structured version?",
      text: "AI Summarize keeps the document&rsquo;s structure intact — section headings, claims, citations — for readers who already share the domain vocabulary.",
      linkHref: "/tool/ai-summarize",
      linkLabel: "Try AI Summarize",
    },
  },

  "ai-translate": {
    useCasesTitle: "Why people translate PDFs",
    useCasesIntro:
      "PDFs travel internationally — research papers, legal documents, customer-support manuals, immigration paperwork. AI Translate produces page-faithful translation across 50+ languages, preserving paragraph structure so the output reads like the original would in the target language.",
    useCases: [
      {
        icon: "Pages",
        title: "Multilingual contract sharing",
        text: "An English-language MSA needs to go to a partner who reads Spanish. Translate produces a working draft for review — translation memory note: this is a draft, not legally certified, so use a sworn translator for binding documents.",
      },
      {
        icon: "Book",
        title: "Academic paper translation",
        text: "Read a research paper published in Mandarin or German. The output preserves equations as text (LaTeX-friendly markup), keeps citations in original form, and translates only the prose.",
      },
      {
        icon: "Shield",
        title: "Legal documents for non-English speakers",
        text: "Court notices, lease agreements, government forms — translate the body so the client can read along during the lawyer&rsquo;s explanation. NOT a substitute for a certified translation when one is legally required.",
      },
      {
        icon: "Edit",
        title: "Customer-support knowledge in local languages",
        text: "An English knowledge base PDF gets translated for a Japanese support team. The output preserves headings, lists, and code blocks — drop into the team&rsquo;s wiki as a starting localization.",
      },
      {
        icon: "Receipt",
        title: "Travel docs &amp; immigration paperwork",
        text: "I-94 instructions, visa application notes, travel-insurance terms — get the gist in your reading language before filling them out. Pair with AI Form Fill once the destination form is understood.",
      },
    ],
    howWorksTitle: "How AI Translate works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF + pick target language",
        text: "Up to 100 MB. 50+ target languages including Spanish, French, German, Mandarin, Hindi, Arabic, Japanese, Portuguese. Source language auto-detected.",
      },
      {
        step: "2",
        title: "We chunk + translate + reassemble",
        text: "Server-side text extraction → map-reduce translation pass (each chunk translated independently with shared glossary) → markdown output that preserves headings, lists, code blocks, and tables.",
      },
      {
        step: "3",
        title: "Get markdown back",
        text: "Output is markdown. Copy into your CMS / wiki / doc tool. Pair with Markdown to PDF if you need a polished PDF in the target language.",
      },
    ],
    faqs: [
      {
        q: "How accurate is the translation — can I rely on it for legal / medical use?",
        a: "Accurate enough for understanding, NOT enough for legal or medical certification. For binding contracts, certified translations of medical records, or court filings, use a sworn human translator. AI Translate is for the &ldquo;draft for review&rdquo; tier — fast, cheap, good enough for understanding the document.",
      },
      {
        q: "Does it handle PDFs with both text and scanned pages?",
        a: "Text-first. If your PDF is image-only (scanned), run AI OCR first to get a text-bearing version, then Translate. Mixed-content PDFs (some text, some scanned) translate the text portions and skip the image portions with a placeholder.",
      },
      {
        q: "Are formulas / equations preserved?",
        a: "Yes — equations are detected and emitted as LaTeX-style math markup that survives the translation. Citations and bibliography references are kept in original form (no point translating &ldquo;et al.&rdquo;).",
      },
      {
        q: "What's the credit cost?",
        a: "5 credits per translation regardless of source/target language pair. Cost scales with document length only via the chunking — typical 10-page documents run as a single chunk.",
      },
      {
        q: "How long does it take?",
        a: "20 seconds to a few minutes depending on document length. We chunk to avoid context-window limits, but even large docs typically finish in under 3 minutes.",
      },
      {
        q: "Can I translate confidential documents?",
        a: "Same posture as AI Summarize — sent to the inference provider, not stored. For sensitive content (NDAs, medical records, immigration paperwork), redact PII first via Redact PDF (in-browser) so the redacted content is what reaches the inference provider.",
      },
    ],
    cta: {
      title: "Need a summary in the target language?",
      text: "Run AI Translate first, then AI Summarize on the translated output. Or run Summarize first and Translate the summary — gets the same result with fewer tokens used.",
      linkHref: "/tool/ai-summarize",
      linkLabel: "Try AI Summarize",
    },
  },

  "ai-compare": {
    useCasesTitle: "Why people compare PDFs semantically",
    useCasesIntro:
      "Pixel-level diff (PDF Compare) shows you WHAT changed — the visual differences between two versions. Semantic compare goes deeper: it tells you what those changes MEAN. Added clauses, removed sections, reworded definitions, shifted commitments. The difference between &ldquo;something changed&rdquo; and &ldquo;here&rsquo;s what to flag for legal.&rdquo;",
    useCases: [
      {
        icon: "Shield",
        title: "Contract redline review",
        text: "Counter-party returns a marked-up MSA. AI Compare summarizes what changed in plain language — e.g. &ldquo;liability cap increased from $500K to $2M; payment terms changed Net-30 to Net-60; new indemnity clause section 8.4.&rdquo; Use as the input for your &ldquo;is this acceptable?&rdquo; review.",
      },
      {
        icon: "Pages",
        title: "Document version reconciliation",
        text: "Two purportedly-same PDFs from different sources — the &ldquo;executed&rdquo; vs the &ldquo;draft.&rdquo; Find the actual content differences, not just whitespace or formatting drift that pixel-diff would surface.",
      },
      {
        icon: "Book",
        title: "Research paper revision tracking",
        text: "A journal asks for a revised version. Compare draft v1 vs v2 to summarize what was added in response to peer review. Useful as input for the cover letter to the editor.",
      },
      {
        icon: "Edit",
        title: "Translation back-check",
        text: "Translate doc to language X, then back to source. Compare original vs back-translated to surface places where the translation drifted semantically. Good QA pass for high-stakes translations.",
      },
      {
        icon: "Convert",
        title: "Policy / handbook diff",
        text: "Employee handbook v2024 vs v2025. AI Compare summarizes what changed in plain language — useful for the change-summary email to all employees.",
      },
    ],
    howWorksTitle: "How AI Compare works",
    howWorks: [
      {
        step: "1",
        title: "Drop two PDFs",
        text: "Document A (original / before) and Document B (revised / after). Both up to 100 MB.",
      },
      {
        step: "2",
        title: "We extract + chunk-align + diff",
        text: "Server-side text extraction from both, then a chunk-alignment pass to match corresponding sections, then a semantic-diff prompt that summarizes additions, removals, and modifications in plain language.",
      },
      {
        step: "3",
        title: "Get a structured diff report",
        text: "Markdown output organized by section: &ldquo;Added in B,&rdquo; &ldquo;Removed from A,&rdquo; &ldquo;Modified.&rdquo; Page citations included so you can verify each finding against the source.",
      },
    ],
    faqs: [
      {
        q: "How is this different from PDF Compare (pixel diff)?",
        a: "Pixel diff (free tool /tool/pdf-diff) tells you WHERE pages look different — red highlights on changed regions. AI Compare tells you WHAT semantically changed — added clauses, reworded definitions, etc. They&rsquo;re complementary: pixel diff catches layout shifts; semantic diff catches content shifts. For thorough QA, run both.",
      },
      {
        q: "Does it work on PDFs with very different formatting?",
        a: "Better than pixel diff would — semantic compare normalizes formatting before alignment so a Word-export-A vs a Google-Docs-export-B with the same content produce a near-empty diff. Pixel diff would scream every page red.",
      },
      {
        q: "What if the documents are mostly identical?",
        a: "Output explicitly says so: &ldquo;No semantic differences detected.&rdquo; Trivial formatting diffs (whitespace, font choice) don&rsquo;t pollute the report.",
      },
      {
        q: "What if they're completely different documents?",
        a: "The output flags the alignment as failed and reports the inputs as unrelated. Tool isn&rsquo;t useful for unrelated content; that&rsquo;s a use case for AI Summarize on each separately.",
      },
      {
        q: "What's the credit cost?",
        a: "8 credits per compare (more than Summarize because two inputs are processed + aligned).",
      },
      {
        q: "Can I rely on the diff for legal review?",
        a: "Use as a navigation aid, not as the review itself. The diff tells you WHERE to look; a lawyer reads the actual clause changes. LLMs occasionally miss nuance in legal language; verify high-stakes findings against the source.",
      },
    ],
    cta: {
      title: "Need pixel-level visual diff too?",
      text: "PDF Compare (visual) shows the regions of each page that look different — red highlights on changed pixels. Pairs naturally with AI Compare (semantic) for thorough document QA.",
      linkHref: "/tool/pdf-diff",
      linkLabel: "Try PDF Compare",
    },
  },

  "ai-ocr": {
    useCasesTitle: "Why people use AI OCR",
    useCasesIntro:
      "PDFs come in two flavors: text-bearing (selectable, searchable, copy-paste-able) and image-only (a scanned or photographed document where the &ldquo;text&rdquo; is just pixels). AI OCR converts the second kind into the first — searchable text behind every page so the rest of the catalog (search, translate, summarize) can work on the content.",
    useCases: [
      {
        icon: "Pages",
        title: "Scanned document indexing",
        text: "10 years of filed paperwork that got scanned to PDF without OCR. Run OCR on the batch, get searchable archives. Suddenly Ctrl+F works.",
      },
      {
        icon: "Receipt",
        title: "Phone-photographed receipts → text",
        text: "Receipts shot with a phone camera land as image-only PDFs. OCR them so expense-report tools can extract amounts/dates without manual transcription.",
      },
      {
        icon: "Book",
        title: "Old filing-cabinet digitization",
        text: "Legal binders, medical records, family archives that were scanned years ago. OCR makes them searchable + screen-reader accessible — basic accessibility win.",
      },
      {
        icon: "Shield",
        title: "Compliance / audit prep",
        text: "Auditors expect every document in scope to be searchable. OCR scanned production documents before the audit kickoff so reviewers can keyword-search rather than page-flip.",
      },
      {
        icon: "Sparkle",
        title: "Pipeline preparation",
        text: "Translation / summarization / Chat-with-PDF tools all need text-bearing input. OCR is the gateway op for image-only PDFs entering any downstream AI pipeline.",
      },
    ],
    howWorksTitle: "How AI OCR works",
    howWorks: [
      {
        step: "1",
        title: "Drop your image-only PDF",
        text: "Up to 100 MB. Detects whether OCR is actually needed — if the PDF already has selectable text, OCR is skipped (no credits charged).",
      },
      {
        step: "2",
        title: "We render + recognize each page",
        text: "Server-side rasterization at OCR-friendly DPI, then a text-recognition pass per page. Output is a fresh PDF with the original images preserved + a hidden text layer behind each page that aligns word-by-word with the visible text.",
      },
      {
        step: "3",
        title: "Get a searchable PDF back",
        text: "Visually identical to the input, but Ctrl+F works, screen readers can read it, and downstream tools (Translate, Summarize, Chat with PDF) can ingest it normally.",
      },
    ],
    faqs: [
      {
        q: "How accurate is the OCR?",
        a: "Depends heavily on input quality. Clean scans at 300+ DPI: 99%+ word accuracy. Phone photographs in poor lighting: 90–95%. Faded carbon-copy receipts: 80–90%. The output preserves the recognized text as a hidden layer; verify before trusting for high-stakes use (legal, medical, financial transcription).",
      },
      {
        q: "Does it handle handwriting?",
        a: "Limited — printed text only is the reliable case. Block-letter handwriting works in clean scans. Cursive or hurried handwriting recognition is unreliable. For dedicated handwriting recognition, specialized HTR (handwritten text recognition) tools outperform general OCR.",
      },
      {
        q: "What languages are supported?",
        a: "50+ languages including Latin, Cyrillic, CJK (Chinese/Japanese/Korean), Arabic, Hindi/Devanagari. Source language auto-detected. Mixed-language documents typically work but accuracy drops at language boundaries.",
      },
      {
        q: "What's the difference between AI OCR and AI Searchable PDF?",
        a: "Same backend. AI Searchable PDF is the same output presented with a different SEO landing — both produce the same searchable-PDF output. The variant exists for landing-page distinctness; pick whichever name matches what you searched for.",
      },
      {
        q: "What's the credit cost?",
        a: "5 credits per document. Cost is per-document, not per-page (fixed regardless of length).",
      },
      {
        q: "Does it preserve the visual look?",
        a: "Yes — the original page images are kept verbatim. The text layer is invisible (behind the image). Print the output and it looks the same as the input. The only difference is what tools can do with it.",
      },
    ],
    cta: {
      title: "Need to extract the text only?",
      text: "After OCR, run PDF to Text to get a clean .txt file with the recognized content — useful for pipelines, search indexing, or pasting into other apps.",
      linkHref: "/tool/pdf-to-text",
      linkLabel: "Try PDF to Text",
    },
  },

  "ai-flashcards": {
    useCasesTitle: "Why people use AI Flashcards",
    useCasesIntro:
      "Flashcards are the gold standard for spaced-repetition study because they enforce active recall — you have to RETRIEVE the answer, not just RECOGNIZE it. AI Flashcards generates Q&amp;A pairs from any PDF: textbook chapters, lecture notes, training materials, language vocab.",
    useCases: [
      {
        icon: "Book",
        title: "Exam prep from textbook PDFs",
        text: "Drop a textbook chapter, get 10–30 flashcards covering the key concepts. CSV export imports directly into Anki or Quizlet for spaced-repetition drilling.",
      },
      {
        icon: "Shield",
        title: "Compliance training",
        text: "An employee handbook or policy doc becomes a self-test deck. Useful for &ldquo;did the team actually read the new code-of-conduct&rdquo; checks where a quiz format works better than a sign-off form.",
      },
      {
        icon: "Pages",
        title: "Onboarding knowledge transfer",
        text: "Internal wiki page or ramp-up doc → flashcard deck for the new hire. Drilled over the first two weeks, the deck builds the recall pattern naturally.",
      },
      {
        icon: "Sparkle",
        title: "Language vocab from articles",
        text: "Reading a news article in your target language? Flashcards pulls vocabulary you don&rsquo;t know with definitions. Better than a vocabulary list because the words come WITH context from real reading.",
      },
      {
        icon: "Edit",
        title: "Medical / law board prep",
        text: "USMLE / bar-exam practice from study guides. The Q&amp;A format matches how the actual exam questions are framed. Pair with AI Quiz for MCQ practice in addition to free-recall flashcards.",
      },
    ],
    howWorksTitle: "How AI Flashcards works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Works on any text-bearing content — textbooks, lecture notes, articles, training materials.",
      },
      {
        step: "2",
        title: "We extract concepts + generate Q&amp;A",
        text: "Server-side extraction → key-concept identification → Q&amp;A generation tuned for active recall (not yes/no questions, not vague prompts). Page citations embedded so you can verify each card against the source.",
      },
      {
        step: "3",
        title: "Download as Anki-ready CSV",
        text: "10–30 cards per submission, CSV format with `front,back` columns. Import directly into Anki, Quizlet, RemNote, or any spaced-repetition tool. Page references included as a third column for verification.",
      },
    ],
    faqs: [
      {
        q: "How many cards per PDF?",
        a: "10–30 typically, scaled by content density. A 30-page paper produces ~15 cards. A 200-page textbook chapter produces ~30 (the cap). For more than 30, run on chapter subsections separately.",
      },
      {
        q: "What's the question style?",
        a: "Free-recall format — questions that require retrieval, not multiple choice. &ldquo;Define X.&rdquo; &ldquo;What is the function of Y?&rdquo; &ldquo;Why did the author argue Z?&rdquo; If you want MCQ format, use AI Quiz instead.",
      },
      {
        q: "How do I import into Anki?",
        a: "File → Import in Anki, point at the CSV, set the field separator to comma. The first column maps to Front, the second to Back. The page-reference column is optional — leave it as a tag or extra field.",
      },
      {
        q: "Will it work on non-English PDFs?",
        a: "Yes — flashcards generate in the language of the source. For cross-language drills (e.g. Spanish source, English questions), translate the source first, then generate flashcards.",
      },
      {
        q: "What's the credit cost?",
        a: "5 credits per deck.",
      },
      {
        q: "How is this different from AI Quiz?",
        a: "Flashcards = free-recall Q&amp;A pairs (you have to RETRIEVE the answer, then check). Quiz = multiple-choice questions with 4 options each + correct-answer key. Use Flashcards for studying-to-mastery; use Quiz for self-testing or assessment.",
      },
    ],
    cta: {
      title: "Need MCQ format instead?",
      text: "AI Quiz generates 6–12 multiple-choice questions with 4 plausible distractors each — better for self-test or formal assessment compared to free-recall flashcards.",
      linkHref: "/tool/ai-quiz",
      linkLabel: "Try AI Quiz",
    },
  },

  "ai-quiz": {
    useCasesTitle: "Why people use AI Quiz",
    useCasesIntro:
      "Multiple-choice quizzes are the assessment format of choice for compliance training, certification prep, and reading-comprehension checks. AI Quiz generates 6–12 MCQs from any PDF, each with 4 plausible distractors, a correct answer, and a one-line explanation citing the source page.",
    useCases: [
      {
        icon: "Shield",
        title: "Compliance training quizzes",
        text: "Annual security training, anti-harassment refresher, regulatory updates — quiz at the end of the doc to verify the team actually engaged. Better signal than &ldquo;I read it&rdquo; clickthrough.",
      },
      {
        icon: "Book",
        title: "Self-test before exams",
        text: "Read the chapter, generate a quiz, take it, then go back and re-study where you missed. Spaced-repetition flashcards (AI Flashcards) drill recall; MCQ quizzes drill recognition + reasoning.",
      },
      {
        icon: "Pages",
        title: "Training assessment",
        text: "Onboarding deck for new hires, sales-enablement docs, product-knowledge quizzes. Quiz format gives a measurable score; useful in cohort training where instructors want to identify struggling participants.",
      },
      {
        icon: "Sparkle",
        title: "Reading comprehension check",
        text: "Before discussing a research paper at journal club or assigning a doc to a junior team member, generate a quiz to spot-check whether the key claims came across.",
      },
      {
        icon: "Edit",
        title: "Distance-learning supplement",
        text: "Pair video lectures with quiz-generated MCQs from accompanying PDFs. Students self-test between sessions; instructors get a question bank for the actual exam.",
      },
    ],
    howWorksTitle: "How AI Quiz works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Works on any text-bearing content with extractable concepts.",
      },
      {
        step: "2",
        title: "We generate questions + plausible distractors",
        text: "The prompt is tuned to write 4 distractors that are PLAUSIBLE — wrong-but-defensible — not obviously-wrong filler. The correct answer comes with a one-line explanation referencing the source page.",
      },
      {
        step: "3",
        title: "Download as JSON",
        text: "6–12 questions in JSON format (question, options[], correctIndex, explanation, pageRef). Import into your LMS, quiz tool, or display directly via the in-app preview.",
      },
    ],
    faqs: [
      {
        q: "How are the distractors chosen?",
        a: "From neighboring concepts in the source — the question asks about X, distractors are facts about adjacent concepts X-prime, X-double-prime, etc. This makes them genuinely tempting (you have to know X specifically, not just &ldquo;something about X&rdquo;) without being misleading.",
      },
      {
        q: "Why 6–12 questions, not more?",
        a: "Quiz fatigue is real — beyond ~12 questions, attention drops and answers become noise. For longer self-test sessions, run quiz on chapter subsections separately and concatenate.",
      },
      {
        q: "Are the questions reliable for high-stakes assessment?",
        a: "Use as a study aid or formative-assessment, not as the SOLE basis for high-stakes decisions (board pass/fail, certification, hiring). LLMs occasionally generate questions where the &ldquo;correct&rdquo; answer is debatable; always have an instructor or domain expert review questions before using them in formal assessment.",
      },
      {
        q: "What format is the export?",
        a: "JSON. Each question has fields: question (string), options (string[4]), correctIndex (0-3), explanation (string), pageRef (number). Import into Canvas, Moodle, Brightspace, or any quiz tool that accepts JSON; the structure is flat and standard.",
      },
      {
        q: "What's the credit cost?",
        a: "5 credits per quiz.",
      },
      {
        q: "How is this different from AI Flashcards?",
        a: "Flashcards = free-recall Q&amp;A (no options shown; you have to RETRIEVE the answer). Quiz = recognition (4 options shown; you pick from them). Recall is harder and builds memory faster; recognition matches what real exams test. Use both — they're complementary.",
      },
    ],
    cta: {
      title: "Want free-recall practice instead?",
      text: "AI Flashcards generates Q&amp;A pairs without multiple-choice options — better for active-recall drilling that builds long-term memory.",
      linkHref: "/tool/ai-flashcards",
      linkLabel: "Try AI Flashcards",
    },
  },

  "ai-cover-letter": {
    useCasesTitle: "Why people use AI Cover Letter",
    useCasesIntro:
      "Cover letters are formulaic enough that LLMs do them well, and personal enough that they need real input — not just &ldquo;generate a cover letter for a software engineer.&rdquo; AI Cover Letter takes your resume + the job description and writes a tailored 1-page draft you can edit, not a copy-paste template.",
    useCases: [
      {
        icon: "Receipt",
        title: "Job application",
        text: "You&rsquo;re applying to 5 roles. Write 5 tailored cover letters in the time it used to take to write 1. Each one cites specific job-description requirements and matches them to specific resume bullet points.",
      },
      {
        icon: "Book",
        title: "Internship apps",
        text: "Students with thin resumes benefit most — the tool surfaces transferable skills from coursework / projects / volunteer work that map to the JD. Better than the generic &ldquo;I am a hardworking student&rdquo; template.",
      },
      {
        icon: "Convert",
        title: "Career change",
        text: "Pivot from software engineering to product management — the tool reframes your engineering experience as PM-relevant skills (cross-team coordination, customer empathy, technical judgment). Reduces the cover-letter rewriting tax of mid-career transitions.",
      },
      {
        icon: "Sparkle",
        title: "Grad school applications",
        text: "Statement-of-purpose drafts using your resume + the program&rsquo;s mission/curriculum as inputs. Treats it like a cover letter — connects what you&rsquo;ve done to what the program offers.",
      },
      {
        icon: "Edit",
        title: "Internal transfer",
        text: "Applying to a different team within your company. The tool emphasizes the relevant subset of your current role and frames the move in terms of the new role&rsquo;s needs.",
      },
    ],
    howWorksTitle: "How AI Cover Letter works",
    howWorks: [
      {
        step: "1",
        title: "Drop your resume + the job description",
        text: "Both as PDFs (or paste the JD as text). Resume up to 100 MB; JD typically 1–3 pages.",
      },
      {
        step: "2",
        title: "We map JD requirements to resume bullets",
        text: "The prompt extracts the JD&rsquo;s explicit requirements and preferred qualifications, then matches each one to specific evidence in your resume. Gaps (where the JD asks for something not on your resume) are flagged so you can address them in the letter.",
      },
      {
        step: "3",
        title: "Get a 1-page tailored draft",
        text: "Markdown output — typically 250–400 words. Personal opening, 2 specific evidence paragraphs tied to JD requirements, brief closing. Edit before sending — this is a starting draft, not a final.",
      },
    ],
    faqs: [
      {
        q: "Is the output ready to send as-is?",
        a: "No — treat it as a strong first draft, not a final. Edit for: (a) personal voice (the AI sounds professional but generic), (b) specifics the AI couldn&rsquo;t infer (why THIS company specifically), (c) any factual claims about your background that should be more precise. Skipping the edit pass produces noticeably-AI letters that hiring managers can spot.",
      },
      {
        q: "What if the JD asks for something I don't have?",
        a: "The tool flags this rather than fabricating qualifications. Output includes a &ldquo;gaps&rdquo; section: e.g. &ldquo;The JD requests 5+ years of Python experience; your resume shows 3 years.&rdquo; You decide how to address — acknowledge directly, emphasize transferable skills, or omit. The tool won&rsquo;t make up qualifications you don&rsquo;t have.",
      },
      {
        q: "Will it work for non-tech roles?",
        a: "Yes — the prompt is industry-agnostic. Tested on tech, healthcare, education, marketing, finance, government. The pattern is the same: JD requirements + resume evidence → tailored letter.",
      },
      {
        q: "Can I generate multiple variants?",
        a: "Run it again — output is non-deterministic, so you&rsquo;ll get a slightly different draft. Useful if you want to A/B different opening hooks or different evidence emphasis.",
      },
      {
        q: "What's the credit cost?",
        a: "5 credits per letter.",
      },
      {
        q: "What about confidentiality?",
        a: "Resume + JD sent to inference provider, not stored. For highly confidential job searches (e.g. you&rsquo;re currently employed and don&rsquo;t want a leak), redact the resume PDF first via Redact PDF (in-browser) — strip current employer name + dates if needed.",
      },
    ],
    cta: {
      title: "Need a JD-match score first?",
      text: "AI JD Match scores how well your resume aligns with a job description — 0–100% with itemized evidence. Useful for prioritizing which apps to do first.",
      linkHref: "/tool/ai-jd-match",
      linkLabel: "Try AI JD Match",
    },
  },

  "ai-redact": {
    useCasesTitle: "Why people use AI Redact",
    useCasesIntro:
      "Redact PDF (free) gives you a click-and-drag tool to manually black out content. AI Redact does the auto-detection part — surfaces likely PII (names, emails, phones, SSNs, credit-card numbers, addresses) so the human review pass is faster. Together they make a sane redaction workflow: AI proposes, human verifies.",
    useCases: [
      {
        icon: "Shield",
        title: "HR document sharing",
        text: "Employee personnel file gets requested for a transfer. Auto-redact detects names, social-security numbers, salary figures, home addresses; HR reviews + ships. Cuts the manual-redaction tax 5–10×.",
      },
      {
        icon: "Pages",
        title: "Legal discovery (sanitize before production)",
        text: "Producing 10,000 pages? Auto-redact the obvious PII first (SSNs, credit-card numbers, kids&rsquo; names), then human review verifies. Privilege review still needs a lawyer; PII redaction is the layer below that.",
      },
      {
        icon: "Edit",
        title: "Customer-support log sharing",
        text: "Sharing a debug session with engineering or a vendor — but the logs include user emails, IPs, and user-id strings. Auto-redact catches them; review + ship the sanitized version.",
      },
      {
        icon: "Book",
        title: "Research paper anonymization",
        text: "Submitting a case study or qualitative-research paper for blind peer review. Auto-redact catches respondent names, organization names, geographic identifiers — anything that would compromise blindness.",
      },
      {
        icon: "Receipt",
        title: "Press release / public posting prep",
        text: "Sharing a customer success story or case study externally? Auto-redact internal employee names, internal project codenames, customer-specific personal details. Faster than manual scrubbing of a 20-page case study.",
      },
    ],
    howWorksTitle: "How AI Redact works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Works best on text-bearing PDFs (run AI OCR first for image-only).",
      },
      {
        step: "2",
        title: "We detect PII candidates",
        text: "The prompt is tuned to flag classes of PII: names (proper nouns identified as people), email addresses, phone numbers, postal addresses, SSN-shaped strings, credit-card-shaped strings, IBAN-shaped strings, dates of birth. Each candidate is returned with confidence + page + bounding-box hint.",
      },
      {
        step: "3",
        title: "Review + apply",
        text: "Output is a JSON list of candidates. The in-tool review UI lets you accept/reject each one, then applies the accepted redactions via the Redact PDF rendering pipeline. Final output is a redacted PDF — recipients can&rsquo;t recover the redacted content (it&rsquo;s baked into raster, not just visually overlaid).",
      },
    ],
    faqs: [
      {
        q: "Is this a substitute for manual review?",
        a: "No — it&rsquo;s a force-multiplier for it. AI catches the obvious patterns (90%+ recall on emails, phones, SSNs); humans catch the context-dependent ones (&ldquo;the partner&rdquo; in a discovery doc that the AI can&rsquo;t connect to a specific person). For high-stakes redaction (legal production, regulatory filings, classified material), human review is mandatory; AI Redact reduces the manual tax, doesn&rsquo;t eliminate it.",
      },
      {
        q: "What about contextual / domain-specific PII?",
        a: "Less reliable. Standard formats (SSN xxx-xx-xxxx, email user@domain.tld) get caught by pattern. Contextual identifiers — &ldquo;the patient born in 1957 in Cincinnati&rdquo; — require domain understanding. The tool flags such candidates with low confidence; reviewer should treat HIPAA/GDPR-grade redaction as needing dedicated tooling beyond AI Redact.",
      },
      {
        q: "Are the redactions actually permanent?",
        a: "Yes. Output PDF has the redacted regions baked in as raster — recipients can&rsquo;t copy-paste the underlying text or extract it via PDF tooling. Verify by opening the output and trying to select the redacted text — you should get nothing.",
      },
      {
        q: "What's the credit cost?",
        a: "8 credits per pass (more than Summarize because the pass requires per-page coordinate detection).",
      },
      {
        q: "Can I run it on confidential documents?",
        a: "The PDF is sent to the inference provider. For maximum privacy, do a manual first-pass redaction in Redact PDF (in-browser, no upload) for the sensitive portions, then run AI Redact on the partially-sanitized version to catch anything else.",
      },
      {
        q: "How is this different from manual Redact PDF?",
        a: "Manual Redact PDF (free, in-browser) gives you the click-and-drag tool to black out specific regions. AI Redact (paid, server-side) is the auto-detection layer that proposes WHAT to redact. Use them together: AI proposes → human verifies → manual tool applies the final selections.",
      },
    ],
    cta: {
      title: "Want manual control?",
      text: "Redact PDF (free) is the click-and-drag tool — runs in your browser, no upload, no AI. Use for sensitive documents where you want full manual control or need to skip the inference-provider round-trip.",
      linkHref: "/tool/redact-free",
      linkLabel: "Try Redact PDF",
    },
  },

  "ai-resume-parse": {
    useCasesTitle: "Why people use AI Resume Parser",
    useCasesIntro:
      "Resumes are notoriously inconsistent — every applicant has a different format, layout, and section ordering. AI Resume Parser extracts the structured data you actually want (work history, education, skills, certifications, contact info) into a clean JSON format. Useful when you have many resumes and need consistent fields.",
    useCases: [
      {
        icon: "Receipt",
        title: "HR / recruiter data entry",
        text: "Recruiter receives 50 resumes via email — manually transcribing each one into the ATS is a 2-hour job. Parse them all, get JSON for bulk-import. Saves hours per requisition.",
      },
      {
        icon: "Sparkle",
        title: "ATS pre-fill",
        text: "Job-application portals that ask candidates to RE-ENTER their resume content into 30 form fields. Parse, get the JSON, paste field-by-field (or drive a browser extension if you build one). Better candidate experience.",
      },
      {
        icon: "Pages",
        title: "Recruiting database population",
        text: "Building or seeding a candidate-search database. Each parsed resume becomes a row with normalized fields (years of experience, top skills, education level). Search/filter on structured data, not full-text grep.",
      },
      {
        icon: "Convert",
        title: "Resume comparison / scoring",
        text: "Side-by-side comparison of 5 candidates for a senior role. Parse all 5; see structured fields aligned. Easier to spot &ldquo;all 5 are full-stack but only 2 have ML production experience&rdquo; than reading 5 PDFs.",
      },
      {
        icon: "Edit",
        title: "Recruiting agency intake",
        text: "Agency takes a candidate&rsquo;s resume, parses it, then enriches the structured data with their recruiter notes. Sends a uniform &ldquo;profile&rdquo; format to client companies regardless of how the original resume was structured.",
      },
    ],
    howWorksTitle: "How AI Resume Parser works",
    howWorks: [
      {
        step: "1",
        title: "Drop the resume PDF",
        text: "Up to 100 MB. Works on standard resume PDFs (Word-export, Google Docs, Canva, etc.). Plain-text resumes also accepted.",
      },
      {
        step: "2",
        title: "We extract + normalize fields",
        text: "Server-side extraction → field-by-field parsing tuned for resumes. Output schema: contact (name, email, phone, location, links), workHistory[] (company, title, dates, bullets[]), education[] (school, degree, dates), skills[] (categorized), certifications[], languages[], summary.",
      },
      {
        step: "3",
        title: "Get structured JSON",
        text: "Standard JSON output. Import into your ATS, candidate database, or spreadsheet. Schema is documented + stable; if a field is missing in the resume, that JSON key is set to null (not omitted).",
      },
    ],
    faqs: [
      {
        q: "How accurate is the parsing?",
        a: "Contact info: 95%+ for well-formatted resumes. Work history: 85–90% (date ranges occasionally drop a month-resolution; bullet extraction occasionally misses one bullet on dense layouts). Skills: 90%+ for explicitly-listed skills sections; lower for skills inferred from job descriptions. Always spot-check before bulk-importing.",
      },
      {
        q: "What if the resume has a non-standard layout?",
        a: "Handles most reasonable layouts — single-column, two-column, sidebar-style. Highly designed Canva/InDesign resumes with unconventional flow can degrade accuracy; for those, supplement with manual review.",
      },
      {
        q: "Can it handle multi-page resumes?",
        a: "Yes — most candidates with 5+ years of experience have 2-page resumes. Parser handles multi-page natively. The extracted work history will include all roles, not just the first page.",
      },
      {
        q: "What about non-English resumes?",
        a: "Best results in English. Other Latin-script languages (Spanish, French, Portuguese, German) work reasonably. CJK / Arabic / Hindi-script resumes will return parsed JSON but accuracy on date formats and field detection drops. For multilingual hiring funnels, consider running through AI Translate first.",
      },
      {
        q: "What's the credit cost?",
        a: "3 credits per resume.",
      },
      {
        q: "Privacy?",
        a: "Resume sent to inference provider, not stored. For confidential job searches (e.g. headhunter who shouldn&rsquo;t leak candidate identity to the model provider), redact the candidate&rsquo;s name + employer first via Redact PDF, then parse the redacted version.",
      },
    ],
    cta: {
      title: "Need to score against a job description?",
      text: "AI ATS Resume scores how an ATS would rank your resume against a JD — keyword matches, format compatibility, optimization suggestions. Pairs naturally with parser for end-to-end ATS workflows.",
      linkHref: "/tool/ai-ats-resume",
      linkLabel: "Try AI ATS Resume",
    },
  },

  // =====================================================================
  // 2026-05-01 — Phase 2 AI longform Tier 1 (8 tools)
  //
  // Highest-traffic AI tools that were grandfathered in
  // KNOWN_AI_LONGFORM_PENDING. Backfilling these here means they now
  // render the full 5-section longform block (use-cases, how-it-works,
  // differentiators via ToolRunnerLongform's AI variant, FAQs, CTA)
  // matching the editorial depth of the 12 Tier-1 entries above.
  //
  // Style discipline maintained:
  //   - 5 use-case cards each (concrete document types, not vague claims)
  //   - 3 how-it-works steps with the routing layer mentioned in step 2
  //   - 5–6 FAQs including credit cost + "what if it's wrong"
  //   - HTML entities (&rsquo; &ldquo; &mdash;) for typography
  //   - Page-citation USP referenced where applicable
  //   - India-specific examples where the tool is India-relevant
  //     (ai-blood-test surfaces Indian lab references, ai-jd-match
  //     mentions Indian ATS systems)
  // =====================================================================

  "ai-faq": {
    useCasesTitle: "Why people use AI Generate FAQ",
    useCasesIntro:
      "An FAQ is the difference between a doc people read and a doc people skim. AI Generate FAQ produces 6&ndash;10 question-and-answer pairs grounded in the source &mdash; not invented &mdash; so the answers are verifiable rather than fabricated. Useful when you need a doc&rsquo;s key questions surfaced without writing them yourself.",
    useCases: [
      {
        icon: "Book",
        title: "Internal handbook / playbook FAQ",
        text: "Drop a 30-page operations manual or sales playbook, get a 10-question FAQ at the top so new hires can find the answers without reading the whole thing. Pairs with Mind Map for structural overview.",
      },
      {
        icon: "Sparkle",
        title: "Product launch / spec doc",
        text: "Auto-generate the customer-facing FAQ from your internal spec. Saves the back-and-forth of &ldquo;what would users ask?&rdquo; brainstorming and surfaces edges the spec author may not have anticipated.",
      },
      {
        icon: "Pages",
        title: "Research paper accessibility",
        text: "Turn a 30-page paper into a 6-question reader&rsquo;s digest. Useful for student / non-specialist audiences, or for the layperson summary section of a grant application.",
      },
      {
        icon: "Shield",
        title: "Long contracts / policy docs",
        text: "Surfaces the questions readers actually want answered &mdash; payment terms, termination, IP ownership, data handling &mdash; rather than the questions the drafter wanted asked. Pairs well with AI Summarize.",
      },
      {
        icon: "Edit",
        title: "Onboarding / how-to doc transformation",
        text: "Turn a wall-of-text onboarding handbook into a 10-Q FAQ. Question-shaped headings reduce cognitive load and improve internal-search match-rate dramatically.",
      },
    ],
    howWorksTitle: "How AI Generate FAQ works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "Up to 100 MB. Any topic &mdash; we don&rsquo;t require domain-specific tuning. Works on contracts, papers, manuals, marketing docs.",
      },
      {
        step: "2",
        title: "We extract + cluster + question-mine",
        text: "Server-side text extraction, then a pass to identify the doc&rsquo;s key claims and decisions, then a generation step that frames the most-likely-asked questions and answers them with supporting passages. Routing layer picks the model based on cost-vs-quality fit.",
      },
      {
        step: "3",
        title: "Get markdown FAQ with citations",
        text: "Output is markdown with question headings + grounded answers + page references. Drop it into your README, knowledge base, or doc&rsquo;s top section as-is.",
      },
    ],
    faqs: [
      {
        q: "How many questions does it generate?",
        a: "6&ndash;10 by default, scaling with doc length. A 5-page brief gets 6; a 50-page handbook gets 10. The model caps the count to keep each Q meaningfully distinct rather than padding.",
      },
      {
        q: "Are the answers grounded in the doc?",
        a: "Yes. Every answer cites the page it came from and is constrained to information present in the source. The model won&rsquo;t fabricate an answer to a question the doc doesn&rsquo;t address &mdash; it will say so explicitly.",
      },
      {
        q: "What if the questions miss what readers actually ask?",
        a: "Re-run; the model is non-deterministic so re-runs typically vary the question selection. For directed FAQ generation (e.g. &ldquo;focus on payment terms and dispute resolution&rdquo;), explicit topic constraints in the UI are on the roadmap.",
      },
      {
        q: "Does it work on scanned PDFs?",
        a: "Yes &mdash; we OCR scanned pages first (Devanagari, Tamil, Latin scripts all supported), then question-mine the extracted text. Quality on hand-written or low-resolution scans degrades, but printed scans work fine.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per FAQ. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if a question is wrong or irrelevant?",
        a: "Re-run for a different question selection, or treat the output as a draft &mdash; for high-stakes FAQs (legal, medical, regulatory), have a human review before publishing.",
      },
    ],
    cta: {
      title: "Want a structural overview instead?",
      text: "AI Mind Map renders a 4&ndash;8 branch hierarchical outline of any PDF &mdash; same source-grounding, different shape. Useful for study guides and policy-doc reviews where the structure matters more than the questions.",
      linkHref: "/tool/ai-mindmap",
      linkLabel: "Try AI Mind Map",
    },
  },

  "ai-action-items": {
    useCasesTitle: "Why people use AI Action Items",
    useCasesIntro:
      "Meetings end and the action items live in someone&rsquo;s notes app, three Slack threads, and an inbox draft. AI Action Items extracts a structured TODO table from any document &mdash; meeting notes, project briefs, audit reports &mdash; with owner, due date, and priority columns. The format is the same one your project tracker imports.",
    useCases: [
      {
        icon: "Pages",
        title: "Meeting transcript / minutes",
        text: "Drop the auto-generated transcript from your call recording, get a TODO table with the decisions translated into actions and the unresolved questions flagged separately. Pairs with AI Summarize for the recap layer above the actions.",
      },
      {
        icon: "Sparkle",
        title: "Project brief &rarr; milestone breakdown",
        text: "A multi-page project brief becomes a sequenced action list with phase dependencies. Useful for the project lead translating the brief into a Jira / Linear / Asana load-up.",
      },
      {
        icon: "Shield",
        title: "Regulatory / audit report",
        text: "Audit findings and compliance reports include explicit and implicit remediation actions. The tool surfaces both, with the implicit ones flagged so the compliance lead can review before assigning.",
      },
      {
        icon: "Book",
        title: "1:1 / performance-review notes",
        text: "Turn the &ldquo;commit to do X&rdquo; sentences in a 1:1 doc into trackable follow-ups. Especially useful for managers running 8+ direct-report 1:1s where each conversation surfaces 2&ndash;3 commitments.",
      },
      {
        icon: "Edit",
        title: "Email-thread distillation",
        text: "A 30-message email thread becomes a 5-row action table. Surfaces the &ldquo;you said you&rsquo;d do X by Y&rdquo; commitments that get buried in chronological replies.",
      },
    ],
    howWorksTitle: "How AI Action Items works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on meeting transcripts, project specs, audit reports, briefs, email exports &mdash; anything where actionable items are interleaved with narrative.",
      },
      {
        step: "2",
        title: "We extract + classify",
        text: "Server-side text pass identifies action verbs, owner mentions, date phrases, and priority signals. Each candidate is scored for action-ness vs. discussion-only; only true actions ship to the table.",
      },
      {
        step: "3",
        title: "Get a structured TODO table",
        text: "Markdown table with columns: action / owner / due date / priority / source page. Copy-paste into your project tracker or export to CSV. Page citations let you trace any item back to where it was decided.",
      },
    ],
    faqs: [
      {
        q: "What if the doc doesn&rsquo;t name owners or due dates?",
        a: "Owner column shows &ldquo;unassigned&rdquo;; due date shows &ldquo;TBD.&rdquo; The action itself is still extracted &mdash; you can fill in the metadata downstream when triaging. Better than missing the action entirely.",
      },
      {
        q: "How does it tell &ldquo;we should do X&rdquo; from a real action?",
        a: "Heuristic + LLM classification: explicit assignments (&ldquo;Aman, can you handle X by Friday&rdquo;) score highest; implicit collective (&ldquo;we should look into X&rdquo;) get flagged with lower confidence; discussion-only (&ldquo;X might be a problem&rdquo;) is filtered out unless it pairs with a follow-up commitment.",
      },
      {
        q: "Can it handle multilingual notes?",
        a: "Best results in English. Indian-language notes (Hindi, Tamil, Bengali, etc.) work but action-verb detection accuracy drops. For mixed-language notes (English meeting, Hindi side comments), the English actions extract cleanly.",
      },
      {
        q: "Does it preserve priority hierarchies if the doc had them?",
        a: "Yes &mdash; explicit priority phrases (P0/P1/P2, urgent/important, blocker/nice-to-have) are preserved. Implicit priority is inferred from language strength (&ldquo;must&rdquo; vs &ldquo;should&rdquo; vs &ldquo;could&rdquo;); the heuristic isn&rsquo;t perfect, so review the priority column before pasting into your tracker.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if it misses an action?",
        a: "Run AI Summarize alongside &mdash; the summary will mention items the action extractor classified as discussion-only. If you spot a missed action, re-run; the model is non-deterministic and re-runs vary recall slightly. For meeting-critical action capture, treat the table as a starting draft for human review, not a final tracker.",
      },
    ],
    cta: {
      title: "Need the discussion summary too?",
      text: "AI Summarize generates a structured digest of the same doc &mdash; decisions, findings, unresolved questions &mdash; with page citations. Pairs naturally with the action table for the &ldquo;send a recap to the team&rdquo; workflow.",
      linkHref: "/tool/ai-summarize",
      linkLabel: "Try AI Summarize",
    },
  },

  "ai-mindmap": {
    useCasesTitle: "Why people use AI Mind Map",
    useCasesIntro:
      "Some docs are too sequential to read non-sequentially &mdash; you need the structure first. AI Mind Map renders a hierarchical outline of any PDF (4&ndash;8 root branches, 3 levels deep) so you can see the doc&rsquo;s shape before reading. Output is text + JSON, importable into mind-mapping tools.",
    useCases: [
      {
        icon: "Book",
        title: "Textbook / course material study guide",
        text: "Turn a 200-page textbook chapter into a 3-level mindmap and use it as the navigation index for studying. The hierarchy mirrors the book&rsquo;s structure with chapter / section / sub-section depth.",
      },
      {
        icon: "Pages",
        title: "Research literature review",
        text: "When a paper covers multiple sub-topics (a methodology paper, a survey paper, or a long thesis chapter), the mindmap surfaces the conceptual hierarchy. Faster than re-reading to find a section.",
      },
      {
        icon: "Shield",
        title: "Policy / procedure doc structure",
        text: "Long policy docs (HR handbook, compliance manual, vendor security questionnaire) have nested structure that PDFs flatten. Mind Map restores the tree so you can find which section answers a given question.",
      },
      {
        icon: "Sparkle",
        title: "Strategy doc visual outline",
        text: "Quarterly strategy memos and 6-page strategy docs have implicit structure (theme &rarr; pillar &rarr; initiative). Mind Map exposes it so leadership reviewers can sanity-check coverage before approval.",
      },
      {
        icon: "Edit",
        title: "Onboarding mental model",
        text: "When joining a new project mid-stream, drop the project&rsquo;s decision-record archive into Mind Map and use the output as the starting mental model. Faster ramp-up than reading docs in archive order.",
      },
    ],
    howWorksTitle: "How AI Mind Map works",
    howWorks: [
      {
        step: "1",
        title: "Drop your PDF",
        text: "PDF up to 100 MB. Works best on docs with explicit structure (headings, sections); flat narrative docs (novels, long memos without headings) yield shallower trees.",
      },
      {
        step: "2",
        title: "We extract + tree-build",
        text: "Server-side text extraction, headings detection, then a structure-inference pass that groups content under hierarchical themes when the source lacks explicit headings. Routing layer picks the model based on cost-vs-quality fit.",
      },
      {
        step: "3",
        title: "Get text + JSON output",
        text: "Output is an indented text outline (paste into Notion, Workflowy, or Markdown directly) PLUS a JSON tree (importable into XMind, MindMeister, or any structured-data mind-map tool).",
      },
    ],
    faqs: [
      {
        q: "How deep does the tree go?",
        a: "3 levels by default (root branch &rarr; sub-branch &rarr; leaf). Deeper docs get pruned to keep the output legible; shallow docs may only fill 2 levels. Custom depth is on the roadmap.",
      },
      {
        q: "What if the doc has no headings?",
        a: "The tool falls back to topic clustering &mdash; it identifies coherent concept groups in the prose and creates branches for each. Less accurate than heading-based extraction (it&rsquo;s inferring structure that wasn&rsquo;t explicit), but usable for most narrative docs.",
      },
      {
        q: "Can I import the JSON into Miro or XMind?",
        a: "JSON output uses a generic nested-tree shape ({title, children: []}). XMind and Miro both accept variants of this format. For tools with proprietary formats, you may need a small transform script.",
      },
      {
        q: "Does it preserve page citations?",
        a: "Each leaf node includes the source page reference. So you can navigate from a specific concept in the mindmap back to the page in the source PDF.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per mindmap. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the structure is wrong?",
        a: "Re-run; the inference is non-deterministic. For docs where structure matters a lot (policy manuals, certification course materials), pair with AI Summarize to verify the mindmap covers the doc&rsquo;s major themes.",
      },
    ],
    cta: {
      title: "Want a Q&A index instead?",
      text: "AI Generate FAQ produces a 6&ndash;10 question-and-answer set grounded in the same doc. Useful when readers don&rsquo;t need the structure &mdash; they need the answers.",
      linkHref: "/tool/ai-faq",
      linkLabel: "Try AI Generate FAQ",
    },
  },

  "ai-blood-test": {
    useCasesTitle: "Why people use Blood Test Report Parser",
    useCasesIntro:
      "Indian lab reports vary wildly in format &mdash; SRL, Thyrocare, Apollo Diagnostics, Metropolis, government hospital labs &mdash; but they all express the same data: lab values with reference ranges and flags. The parser extracts that data into a structured table so you can compare reports across labs and over time. Extraction only &mdash; this is not medical advice.",
    useCases: [
      {
        icon: "File",
        title: "Self-tracking health metrics over time",
        text: "Annual checkups, lipid profiles, fasting glucose, thyroid panels &mdash; every report goes through the parser, the structured output goes into a spreadsheet. Trends across years become visible in a way that paper reports and PDF archives obscure.",
      },
      {
        icon: "Compare",
        title: "Comparing reports across labs",
        text: "Different labs use different reference ranges and units (SI vs imperial, mg/dL vs mmol/L). Parser preserves the lab&rsquo;s own reference range alongside the value, so you can spot whether a &ldquo;high&rdquo; flag is a real change or a different range.",
      },
      {
        icon: "Pages",
        title: "Telemedicine consult prep",
        text: "Most Indian telemedicine consults expect you to type in your latest values. Parser converts the PDF into a copy-pasteable structured block, saving 10 minutes of typing per consult.",
      },
      {
        icon: "Book",
        title: "Annual checkup result digest",
        text: "Comprehensive annual checkup reports run 8&ndash;15 pages with hundreds of values. Parser extracts only the flagged (high/low) values into a one-page digest, so the discussion with your doctor focuses on actual concerns.",
      },
      {
        icon: "Shield",
        title: "Family health record digitization",
        text: "Aging parents&rsquo; lab reports accumulating in a folder become a structured family health record. Useful when caregivers are remote and need to share recent values with a specialist for second opinions.",
      },
    ],
    howWorksTitle: "How Blood Test Report Parser works",
    howWorks: [
      {
        step: "1",
        title: "Drop the lab report PDF",
        text: "Any Indian lab format. Scanned reports work too &mdash; we OCR before parsing. Up to 50 MB per report.",
      },
      {
        step: "2",
        title: "We extract + flag",
        text: "Lab values, units, reference ranges, and high/low/normal flags pulled from the report into a structured table. Lab name, report date, and patient ID surfaced in the metadata header.",
      },
      {
        step: "3",
        title: "Get a structured table",
        text: "Markdown table with columns: parameter / value / unit / reference range / flag / page. Copy into a spreadsheet for trend tracking, or share with a doctor for clinical interpretation.",
      },
    ],
    faqs: [
      {
        q: "Is this medical advice?",
        a: "No. The parser extracts data &mdash; it does NOT interpret values, recommend treatments, or diagnose conditions. A &ldquo;high&rdquo; flag in the output reflects what the lab&rsquo;s reference range said; whether that high value matters clinically is a question for your doctor.",
      },
      {
        q: "Which Indian lab formats are supported?",
        a: "SRL, Thyrocare, Apollo Diagnostics, Metropolis, Lal Path Labs, Dr Lal PathLabs, government hospital labs (AIIMS, JIPMER, regional medical colleges), and most private nursing-home in-house labs. New formats added based on user reports of failures.",
      },
      {
        q: "What about handwritten lab reports?",
        a: "OCR handles printed text reliably. Handwritten values (older reports, smaller clinics, some government labs) are recognized but accuracy degrades &mdash; verify the extracted values against the original before relying on them.",
      },
      {
        q: "Are the reference ranges age/sex adjusted?",
        a: "We preserve the lab&rsquo;s OWN reference range, which usually IS age/sex adjusted (most modern labs print the appropriate range based on the patient demographics on the cover page). We don&rsquo;t add or modify ranges &mdash; what the lab said is what you see.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per report. Cost is fixed regardless of report size.",
      },
      {
        q: "Privacy / sharing?",
        a: "Report PDF sent to inference provider for parsing, not stored. For maximum privacy when sharing the structured output (e.g. WhatsApp to a family doctor), redact your name and patient ID first via Redact PDF on the original report. The structured table you share will still have all clinically relevant values.",
      },
    ],
    cta: {
      title: "Have a discharge summary too?",
      text: "Discharge Summary Explainer rewrites Indian hospital discharge summaries in plain English &mdash; diagnoses, medications, follow-up plan, warning signs &mdash; for patients and family. Pairs with the lab report parser for full post-hospital handoff.",
      linkHref: "/tool/ai-discharge",
      linkLabel: "Try Discharge Summary Explainer",
    },
  },

  "ai-jd-match": {
    useCasesTitle: "Why people use Resume &harr; JD Matcher",
    useCasesIntro:
      "Most Indian and US ATS systems (Workday, Greenhouse, Lever, iCIMS) score resumes against the JD before a human ever reads them. The matcher previews that score for you &mdash; per-requirement alignment, missing-keyword audit, and a weighted fit percentage &mdash; so you can tune the resume before applying.",
    useCases: [
      {
        icon: "Compare",
        title: "Pre-application self-assessment",
        text: "Drop your resume + paste the JD, see whether you&rsquo;re a strong fit before spending an hour on a custom application. Saves time on roles where you&rsquo;re structurally mismatched (e.g. JD requires 5 years X, you have 2).",
      },
      {
        icon: "Edit",
        title: "Resume tuning iteration",
        text: "Run the match, see which JD keywords are missing from your resume, edit the resume, re-run. The keyword gap typically closes from ~40% to ~80% in 2&ndash;3 iterations without lying &mdash; you&rsquo;re surfacing experience you already have but didn&rsquo;t describe in the JD&rsquo;s vocabulary.",
      },
      {
        icon: "Shield",
        title: "Recruiter pre-screen at scale",
        text: "Recruiters with 100+ inbound resumes per role run each one through the matcher to triage. Top-quartile matches go to the hiring manager; bottom-quartile get a polite decline. Faster than skimming each resume manually.",
      },
      {
        icon: "Sparkle",
        title: "Career coach client advisory",
        text: "Career coaches use the per-requirement alignment table to walk clients through &ldquo;here&rsquo;s why you&rsquo;re not getting interviews&rdquo; with concrete evidence. More productive than abstract resume feedback.",
      },
      {
        icon: "Book",
        title: "Internal mobility assessment",
        text: "Considering applying for a role at your own company? The matcher gives you an honest read on whether your trajectory positions you for the role &mdash; useful before the awkward conversation with your current manager.",
      },
    ],
    howWorksTitle: "How Resume &harr; JD Matcher works",
    howWorks: [
      {
        step: "1",
        title: "Drop the resume + paste the JD",
        text: "Resume as PDF (up to 25 MB). JD pasted as plain text. The JD doesn&rsquo;t need to be in any specific format &mdash; we parse the requirements out of free-form prose.",
      },
      {
        step: "2",
        title: "We extract + align",
        text: "Resume parsed for skills, experience, education, certifications. JD parsed for must-haves, nice-to-haves, and keywords. Alignment scored per requirement, with the missing items surfaced.",
      },
      {
        step: "3",
        title: "Get a fit score + alignment table",
        text: "Output: weighted fit percentage (0&ndash;100), per-requirement alignment table (matched / partial / missing), keyword-gap audit. Page references trace each match back to the resume passage.",
      },
    ],
    faqs: [
      {
        q: "How is the fit score calculated?",
        a: "Weighted by JD signal &mdash; must-have requirements count more than nice-to-haves, and exact keyword matches score higher than synonyms. Score is heuristic; real ATS scoring varies by system. Treat the score as a directional signal, not a guarantee.",
      },
      {
        q: "Will it work for Indian ATS systems specifically?",
        a: "Most Indian companies use Workday, Greenhouse, Lever, or iCIMS &mdash; same systems as global. Indian-specific keyword conventions (CTC, notice period, primary skills, secondary skills) are recognized. For Naukri / Monster ATS, results are slightly less calibrated but still useful.",
      },
      {
        q: "Should I stuff missing keywords into my resume?",
        a: "No &mdash; lying gets caught at interview. Use the missing-keyword list as a prompt: do you actually have that experience but described it differently? Re-word truthfully. If you genuinely don&rsquo;t have the experience, the role isn&rsquo;t a fit and the score is correct.",
      },
      {
        q: "What if my resume is in a non-standard format?",
        a: "Highly designed Canva/InDesign resumes degrade parsing accuracy &mdash; the matcher may miss skills described in sidebars or non-text-extractable graphics. For ATS-readable single-column resumes, accuracy is high. Our AI ATS Resume tool flags this format issue specifically.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per match. Cost is fixed regardless of resume length or JD length.",
      },
      {
        q: "Privacy?",
        a: "Resume + JD sent to inference provider, not stored. For confidential job searches (especially internal-mobility within a company), the model never sees your name &mdash; we redact PII before inference. Match results are returned to your account only.",
      },
    ],
    cta: {
      title: "Want the full ATS audit?",
      text: "AI ATS Resume scores ATS-friendliness directly &mdash; format compatibility, keyword density, section ordering. Use it after the matcher to tune a specific resume for a specific JD.",
      linkHref: "/tool/ai-ats-resume",
      linkLabel: "Try AI ATS Resume",
    },
  },

  "ai-paraphrase": {
    useCasesTitle: "Why people use AI Paraphrase",
    useCasesIntro:
      "Paraphrase rewrites a document while preserving every claim, number, and conclusion verbatim. Same length as the input, same factual content, different sentence structure and word choice. Useful when the goal is style change, not summarization.",
    useCases: [
      {
        icon: "Shield",
        title: "Avoid plagiarism-checker false positives",
        text: "When sourcing language from public-domain content (legal precedent, government forms, technical specifications), paraphrase before publishing to avoid Turnitin / similar checker flags &mdash; while preserving factual accuracy.",
      },
      {
        icon: "Edit",
        title: "Translate corporate jargon to plain English",
        text: "Quarterly reports, audit findings, and policy docs are written in dense register that&rsquo;s hard for non-specialists. Paraphrase reduces register without losing detail &mdash; useful for the executive summary aimed at a board including non-experts.",
      },
      {
        icon: "Sparkle",
        title: "Repurpose case studies for new audiences",
        text: "A case study written for B2B engineers can be paraphrased for marketing&rsquo;s use without rewriting from scratch. Same evidence, different reader voice.",
      },
      {
        icon: "Book",
        title: "Internationalization prep",
        text: "Before translating to other languages, paraphrase to plain English first. Translation quality (machine or human) is significantly higher when the source is plain rather than idiomatic / colloquial.",
      },
      {
        icon: "Pages",
        title: "Multi-author style harmonization",
        text: "When multiple authors contribute to one doc, the voice drifts. Paraphrase the whole doc to one consistent voice without rewriting the content. Pairs with AI Tone Analyze for the inconsistency detection.",
      },
    ],
    howWorksTitle: "How AI Paraphrase works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF",
        text: "PDF up to 100 MB. Works best on prose; technical docs with heavy code blocks or math notation may need post-processing to preserve formatting.",
      },
      {
        step: "2",
        title: "We rewrite section-by-section",
        text: "Server-side text extraction, then a constrained rewrite pass that preserves every numeric value, named entity, and factual claim while varying sentence structure and word choice. Routing layer selects the model that scores best on the preservation benchmark.",
      },
      {
        step: "3",
        title: "Get markdown output",
        text: "Paraphrased version in markdown, similar length to original. Page citations link each section back to the source so you can verify the rewrite preserved meaning.",
      },
    ],
    faqs: [
      {
        q: "Are numbers and dates preserved exactly?",
        a: "Yes &mdash; explicitly. The model is constrained to preserve every numeric value, percentage, date, currency amount, name, and proper noun verbatim. Misreporting numbers in paraphrasing is a known failure mode of generic LLMs; we benchmark and route to the model that does this best.",
      },
      {
        q: "Will the output pass plagiarism checkers?",
        a: "Usually yes &mdash; the output is structurally and lexically distinct from the input while preserving meaning. Note: some checkers flag &ldquo;paraphrase&rdquo; specifically. If you&rsquo;re submitting academic work where paraphrase needs citation, cite the original source.",
      },
      {
        q: "Is the output the same length as the input?",
        a: "Approximately &mdash; typically within 10% of the original length. Longer or shorter is possible per section depending on whether the original was tightly written or repetitive. For explicit length control, AI Condense / AI Expand are dedicated tools.",
      },
      {
        q: "Does it preserve formatting (lists, headings, emphasis)?",
        a: "Headings and lists are preserved structurally. Bold/italic emphasis is preserved on the same words where possible. Tables and figures are referenced but not paraphrased &mdash; the rewrite is content-only.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the paraphrase changes meaning?",
        a: "It can happen, especially in technical sections with domain-specific vocabulary. Read the output before submitting &mdash; the page citations make spot-checking easy. For high-stakes content (legal, medical, regulatory) treat the output as a draft for human review.",
      },
    ],
    cta: {
      title: "Need length change too?",
      text: "AI Condense reduces length while preserving meaning; AI Expand goes the other way for material that needs more depth. Use these when paraphrase alone isn&rsquo;t enough.",
      linkHref: "/tool/ai-condense",
      linkLabel: "Try AI Condense",
    },
  },

  "ai-detector": {
    useCasesTitle: "Why people use AI Content Detector",
    useCasesIntro:
      "Detection of AI-generated text (ChatGPT / Claude / Gemini / Llama) is heuristic, not exact. The detector surfaces formulaic structure, AI-typical phrasing, register shifts &mdash; signals that suggest LLM authorship &mdash; with confidence scores. This is a flag-for-review tool, not courtroom-grade evidence.",
    useCases: [
      {
        icon: "Book",
        title: "Education &mdash; assignments, theses",
        text: "Teachers and TAs running submitted assignments through the detector to flag suspicious essays for human review. Detection accuracy on student writing varies by grade level &mdash; high-school work flags more reliably than graduate work.",
      },
      {
        icon: "Sparkle",
        title: "Hiring &mdash; cover letters, written assessments",
        text: "Take-home assessments and cover letters increasingly come from LLMs. The detector flags candidates whose writing samples match LLM signatures, prompting a follow-up conversation rather than an automatic disqualification.",
      },
      {
        icon: "Pages",
        title: "Editorial &mdash; submitted articles, freelance work",
        text: "Editors handling pitches and submissions screen for LLM-generated content. Useful for outlets where human authorship is part of the value proposition (memoir, opinion, voice-driven journalism).",
      },
      {
        icon: "Shield",
        title: "Marketing &mdash; vendor-supplied copy authenticity",
        text: "When agencies or freelance writers deliver content, the detector previews whether the work was likely human-written or AI-generated. Useful for shops paying premium rates for human authorship.",
      },
      {
        icon: "Edit",
        title: "Quality control on translated content",
        text: "Some translation services secretly use LLM translation. The detector surfaces the LLM-typical signature in the output even when the prose is grammatically clean &mdash; helpful for buyers verifying they got what they paid for.",
      },
    ],
    howWorksTitle: "How AI Content Detector works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF",
        text: "PDF up to 50 MB. Works on essays, articles, reports, cover letters, theses. Plain prose works best; heavy code or technical notation isn&rsquo;t the target use case.",
      },
      {
        step: "2",
        title: "We score each passage",
        text: "Server-side text extraction, then per-passage scoring against signatures of AI-typical phrasing, sentence-length distribution, register-shift patterns, and uniformity metrics. Different LLM families have different fingerprints; the detector tries to match the strongest.",
      },
      {
        step: "3",
        title: "Get a flagged report",
        text: "Output: overall confidence (0&ndash;100% AI-likely), per-passage breakdown with the flagged sentences highlighted, suspected source family (GPT-4-class / Claude-class / Gemini-class). Treat this as a flag-for-review, not a verdict.",
      },
    ],
    faqs: [
      {
        q: "What&rsquo;s the false-positive rate?",
        a: "Significant &mdash; we don&rsquo;t publish a fixed FP rate because it varies by genre and writing skill. Highly polished human writers (professional editors, technical writers) are sometimes flagged because polish itself looks LLM-uniform. Treat the score as a probabilistic signal, not a verdict.",
      },
      {
        q: "Can it tell ChatGPT from Claude from Gemini?",
        a: "Sometimes &mdash; each LLM family has subtly different signatures (vocabulary preferences, sentence-length distributions). Confidence on the family-attribution is lower than confidence on the human-vs-AI binary. For the family attribution, treat as best-guess only.",
      },
      {
        q: "What about content that&rsquo;s been edited after AI generation?",
        a: "Heavy human editing (rewriting paragraphs, restructuring sections) blurs the signature significantly. Light editing (typo fixes, minor word swaps) typically isn&rsquo;t enough to evade detection. We err on the side of false negatives here.",
      },
      {
        q: "Can this be used for academic-misconduct accusations?",
        a: "Not on its own. The output is &ldquo;AI-likely with X% confidence&rdquo; &mdash; that&rsquo;s flag-for-conversation, not proof. Academic misconduct cases require corroborating evidence (prompt logs, draft history, oral examination). The detector accelerates triage, not adjudication.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Document sent to inference provider, not stored. For sensitive content (anonymous student submissions, confidential editorial pitches), redact identifying metadata first via Redact PDF before running the detection.",
      },
    ],
    cta: {
      title: "Need to rewrite content to avoid detection?",
      text: "AI Paraphrase rewrites while preserving meaning &mdash; useful for content that flagged AI but is fundamentally human work the writer wants to harmonize. NOT useful for AI-generated work the writer is trying to disguise (and we don&rsquo;t recommend that workflow).",
      linkHref: "/tool/ai-paraphrase",
      linkLabel: "Try AI Paraphrase",
    },
  },

  "ai-rewrite": {
    useCasesTitle: "Why people use AI Rewrite & Rephrase",
    useCasesIntro:
      "Rewrite is paraphrase with explicit style controls &mdash; tone shift (formal &harr; casual), register adjustment (technical &harr; layperson), or length change (condense / expand). The factual content stays; the voice changes. Useful when the goal is audience adaptation, not summarization.",
    useCases: [
      {
        icon: "Edit",
        title: "Tone shift &mdash; formal &harr; casual",
        text: "A formal RFP response can be rewritten in a conversational tone for a follow-up email. A casual blog post can be tightened to a formal one-pager. The content stays; the register shifts.",
      },
      {
        icon: "Sparkle",
        title: "Audience adaptation &mdash; technical &harr; layperson",
        text: "Engineering docs rewritten for sales materials. Sales materials rewritten for technical audiences. The product info stays; the abstraction level changes.",
      },
      {
        icon: "Pages",
        title: "Length adjustment &mdash; condense or expand",
        text: "A 10-page report condensed to a 2-page exec brief, or a 1-paragraph idea expanded to a 3-page concept doc. Pairs with AI Condense / AI Expand for the dedicated length controls.",
      },
      {
        icon: "Book",
        title: "Multi-author style harmonization",
        text: "When several authors contribute to one document, voice inconsistency is jarring. Rewrite the whole doc to one consistent voice without rewriting from scratch.",
      },
      {
        icon: "Shield",
        title: "Translation prep",
        text: "Before translating to other languages, rewrite the source to plain, idiom-free English. Both machine and human translators produce significantly higher-quality output from plain source than from idiomatic / culturally-loaded source.",
      },
    ],
    howWorksTitle: "How AI Rewrite works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF + pick style",
        text: "PDF up to 100 MB. Style options: tone (formal / neutral / casual), register (technical / general / simple), length (preserve / condense / expand). Defaults to neutral preserve-length.",
      },
      {
        step: "2",
        title: "We rewrite section-by-section",
        text: "Server-side text extraction, then a constrained rewrite pass that preserves every numeric value, name, and factual claim while applying the requested style change. Routing layer selects the model best suited to the style transform.",
      },
      {
        step: "3",
        title: "Get markdown output",
        text: "Rewritten doc in markdown. Page citations link each rewritten section back to the source, so you can verify the rewrite preserved meaning before publishing.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI Paraphrase?",
        a: "Paraphrase changes word choice and sentence structure but holds the style/register constant. Rewrite is paraphrase plus an explicit style change. If you want to keep the same voice but rephrase, use Paraphrase. If you want a different voice, use Rewrite.",
      },
      {
        q: "Are numbers and dates preserved exactly?",
        a: "Yes &mdash; explicitly. The model is constrained to preserve every numeric value, percentage, date, currency amount, name, and proper noun verbatim. Style change should never change facts.",
      },
      {
        q: "Can I rewrite into a specific tone like &lsquo;Apple-style&rsquo; or &lsquo;Hemingway&rsquo;?",
        a: "Roughly. Generic styles (formal / casual / technical / simple) are well-supported. Brand-specific styles (Apple voice, Stripe voice, etc.) work but are approximate &mdash; the model imitates surface-level signals (sentence length, vocabulary). For brand-aligned content, treat the output as a draft for the brand-voice editor.",
      },
      {
        q: "What if I want length change without other style changes?",
        a: "Use AI Condense (shorter) or AI Expand (longer) instead &mdash; those are length-only with style preserved. Rewrite is the right tool when you want both length AND style change.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the rewrite changes meaning?",
        a: "It can happen, especially with aggressive style changes (highly technical &rarr; layperson, formal legal &rarr; casual). Read the output before publishing &mdash; the page citations make spot-checking easy. For high-stakes content, treat as a draft for human review.",
      },
    ],
    cta: {
      title: "Want a tone audit first?",
      text: "AI Tone Analyze surfaces the current tone and register of a document &mdash; useful for deciding what rewrite direction to choose, or for verifying the rewrite achieved the intended shift.",
      linkHref: "/tool/ai-tone-analyze",
      linkLabel: "Try AI Tone Analyze",
    },
  },

  // =====================================================================
  // 2026-05-01 — Phase 2 AI longform Tier 2 (9 tools)
  //
  // Content-focused tools: study materials (notes, syllabus), medical
  // (discharge), publishing (blog, newsletter, video script), readability
  // (readability score, improve-writing, proofread). Same editorial bar
  // as Tier 1.
  // =====================================================================

  "ai-study-notes": {
    useCasesTitle: "Why people use PDF to Study Notes",
    useCasesIntro:
      "Study notes are different from a summary &mdash; they&rsquo;re pre-revision artifacts: an overview to scan first, key concepts to memorize, detailed sections for the deep-read, and self-check questions to test understanding. PDF to Study Notes generates all four from any textbook, course material, or technical doc.",
    useCases: [
      {
        icon: "Book",
        title: "Exam revision the day before",
        text: "Drop the textbook chapter, get notes structured for the &ldquo;I have 4 hours and need to know this&rdquo; revision pattern. Overview surfaces the framework, key concepts list the must-knows, self-check questions test recall.",
      },
      {
        icon: "Pages",
        title: "Course material for a new subject",
        text: "When starting a new course / certification, study notes from the textbook give you the conceptual scaffolding to attach further reading to. Better than starting cold with chapter 1.",
      },
      {
        icon: "Sparkle",
        title: "Technical certification prep",
        text: "AWS / GCP / Azure certifications, CFA, PMP &mdash; standardized exams with known reading lists. Study notes per source compile a pre-exam binder; the self-check questions surface gaps.",
      },
      {
        icon: "Edit",
        title: "Teacher / TA lesson prep",
        text: "Teachers prepping a class on assigned reading use the notes as the lecture skeleton: overview frames the lesson, concepts become talking points, self-check questions become discussion prompts.",
      },
      {
        icon: "Shield",
        title: "Compliance / policy training",
        text: "Annual compliance training (data privacy, anti-corruption, safety) uses dense policy docs. Study notes turn each policy into testable concepts &mdash; useful for trainers building the post-training quiz.",
      },
    ],
    howWorksTitle: "How PDF to Study Notes works",
    howWorks: [
      {
        step: "1",
        title: "Drop the source",
        text: "PDF up to 100 MB. Works on textbooks, course handouts, lecture slides, technical specs, policy docs.",
      },
      {
        step: "2",
        title: "We extract + structure for revision",
        text: "Server-side text extraction, then a structured pass that produces four sections: overview, key concepts, detailed notes, self-check questions. Each section optimized for a different revision activity. Routing layer picks the model based on cost-vs-quality fit.",
      },
      {
        step: "3",
        title: "Get markdown notes with citations",
        text: "Output is markdown with section headings + page references. Print as study sheet, paste into Notion, or feed into Anki / Quizlet for spaced-repetition.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI Summarize?",
        a: "Summary is a digest meant to replace reading the source for a quick read. Study notes are pre-revision &mdash; overview + concepts + details + self-check &mdash; meant to support multiple revision passes. Different tool for different reading goal.",
      },
      {
        q: "How are the self-check questions generated?",
        a: "Concept-by-concept: each key concept gets 1&ndash;2 self-check questions that test understanding (not just recall). Question style matches educational best practice for the doc&rsquo;s subject area &mdash; calculation problems for quantitative content, definition / example questions for conceptual content.",
      },
      {
        q: "Will it work for non-textbook content?",
        a: "Best on structured educational content (textbooks, course material, lecture notes). Less optimal on prose-heavy content (novels, narrative non-fiction) &mdash; for those, AI Summarize is a better fit.",
      },
      {
        q: "Can I export to Anki for flashcards?",
        a: "The self-check questions section copy-pastes into Anki / Quizlet directly. For dedicated flashcard generation with spaced-repetition tagging, AI Flashcards is the focused tool.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if a key concept is missed?",
        a: "Re-run; the model is non-deterministic and re-runs typically vary recall. For exam-critical content where missed concepts matter, pair with AI Summarize for a second-pass coverage check &mdash; if a concept is in summary but not in notes, regenerate.",
      },
    ],
    cta: {
      title: "Need flashcards for spaced repetition?",
      text: "AI Flashcards generates Q-card / A-card pairs sized for Anki and Quizlet, with spaced-repetition difficulty tagging. Pairs naturally with study notes for the full revision workflow.",
      linkHref: "/tool/ai-flashcards",
      linkLabel: "Try AI Flashcards",
    },
  },

  "ai-syllabus": {
    useCasesTitle: "Why people use Syllabus to Study Plan",
    useCasesIntro:
      "A syllabus tells you what to learn but not when. Syllabus to Study Plan turns the topic list into a 12-week schedule with weekly checkpoints, practice problems, and a revision strategy. Useful when you need structure imposed on a self-study course or exam-prep timeline.",
    useCases: [
      {
        icon: "Book",
        title: "Self-study certification prep",
        text: "Drop the official AWS / GCP / Azure / CFA / PMP syllabus, get a 12-week plan with topic-week pairings + weekly practice + final-week revision schedule. Replaces the &ldquo;just read the books&rdquo; approach with measurable progress.",
      },
      {
        icon: "Sparkle",
        title: "Indian competitive exam prep",
        text: "UPSC / SSC / banking / GATE / NEET / JEE syllabuses translated into week-by-week study plans. The plan accounts for subject-mix balance (don&rsquo;t do all quantitative for 4 weeks, then all verbal) and includes mock-test checkpoints.",
      },
      {
        icon: "Pages",
        title: "Bootcamp / coding course",
        text: "Self-paced bootcamp curricula become structured weekly plans. Useful for working professionals doing online courses (Coursera, Pluralsight, freeCodeCamp) where the optional &ldquo;suggested pace&rdquo; needs hardening into a real schedule.",
      },
      {
        icon: "Edit",
        title: "Teacher building a course schedule",
        text: "Teachers translating a curriculum framework into a semester plan. The output is a starting-point schedule the teacher edits for term-specific holidays, exam windows, and student-pace observations.",
      },
      {
        icon: "Shield",
        title: "Corporate L&D programs",
        text: "L&D managers building structured upskilling programs from vendor curricula (e.g. an internal Snowflake certification cohort). The plan format supports cohort scheduling and progress tracking.",
      },
    ],
    howWorksTitle: "How Syllabus to Study Plan works",
    howWorks: [
      {
        step: "1",
        title: "Drop the syllabus",
        text: "PDF up to 50 MB. Works on official certification syllabuses, university course outlines, exam framework docs.",
      },
      {
        step: "2",
        title: "We sequence + balance",
        text: "Topics extracted, dependencies inferred (math before stats, basics before advanced), then sequenced into a 12-week plan with subject-mix balance and revision pad in the final week.",
      },
      {
        step: "3",
        title: "Get a structured study plan",
        text: "Markdown output with: week 1&ndash;12 topic plan, weekly practice problem suggestions, mid-plan and final revision checkpoints. Page citations link each topic back to the syllabus section.",
      },
    ],
    faqs: [
      {
        q: "Why 12 weeks &mdash; can I get a different length?",
        a: "12 weeks is the default because it matches a typical self-study sprint. Custom lengths (4 weeks for crash prep, 24 weeks for slow-burn) are on the roadmap. For now, scale the output mentally &mdash; if you have 6 weeks, double up weekly topic load; if 24 weeks, halve it.",
      },
      {
        q: "Does it account for syllabus weights / exam patterns?",
        a: "It tries &mdash; if the syllabus marks topics with weight indicators (10% for X, 20% for Y), the plan allocates time proportionally. If there&rsquo;s no weight info, it allocates roughly evenly with high-dependency topics earlier.",
      },
      {
        q: "Can it generate practice problems too?",
        a: "The plan suggests TYPES of practice (e.g. &ldquo;solve 5 mixed-difficulty problems on quadratic equations&rdquo;) but doesn&rsquo;t generate the problems themselves &mdash; you&rsquo;ll need a problem source. For exam-specific practice, official prep books are still the best source.",
      },
      {
        q: "What if my syllabus is in Hindi / regional language?",
        a: "Best results in English. Hindi / regional-language syllabuses parse but topic naming may be inconsistent. For Indian competitive exams, the official syllabuses are usually published in English regardless of the exam medium.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per syllabus. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the plan doesn&rsquo;t match my prior knowledge?",
        a: "The plan assumes baseline competence in the syllabus&rsquo;s pre-requisites. If you&rsquo;re behind on pre-reqs, you&rsquo;ll need to add a pre-week or two. For above-baseline learners, you can compress the plan by 1&ndash;2 weeks. Treat it as a starting structure, not a fixed schedule.",
      },
    ],
    cta: {
      title: "Need study notes for each topic?",
      text: "PDF to Study Notes generates revision-grade notes for any source &mdash; overview + concepts + details + self-check questions. Pairs with the study plan to fill in each weekly topic.",
      linkHref: "/tool/ai-study-notes",
      linkLabel: "Try PDF to Study Notes",
    },
  },

  "ai-discharge": {
    useCasesTitle: "Why people use Discharge Summary Simplifier",
    useCasesIntro:
      "Indian hospital discharge summaries are written for the next-treating doctor, not the patient. Diagnoses in medical Latin, drugs in clinical shorthand (1-0-1, BD, TDS), follow-up plans assuming clinical context. The simplifier rewrites all of it in plain English the patient and family can act on. This is a language-translation aid, NOT medical advice.",
    useCases: [
      {
        icon: "File",
        title: "Patient + family understanding",
        text: "Hospital stays end with a discharge summary the patient is expected to act on &mdash; medications, follow-up appointments, warning signs. Plain-English rewrite means the patient (and the family member who&rsquo;ll administer the medications) actually understand what to do.",
      },
      {
        icon: "Compare",
        title: "Telemedicine consult prep",
        text: "Follow-up consults with a primary doctor after hospital discharge often need a recap of what happened in hospital. Simplifier output is the recap &mdash; better than handing the doctor 8 pages of clinical jargon to skim.",
      },
      {
        icon: "Shield",
        title: "Insurance / TPA reimbursement",
        text: "Insurance Third Party Administrators need a procedure-and-treatment summary for cashless / reimbursement processing. The simplifier output (with structured medication list and procedure description) accelerates the TPA review.",
      },
      {
        icon: "Pages",
        title: "Caregiver handoff",
        text: "When the discharge happens during one family member&rsquo;s shift but recovery happens at home with another, the rewritten summary is the handoff document. Reduces &ldquo;what did the doctor say about the medicine?&rdquo; phone calls.",
      },
      {
        icon: "Edit",
        title: "Cross-system specialist consult",
        text: "Indian patients often see specialists across hospital systems. The plain-language summary is shareable across systems without each specialist needing to decode the originating hospital&rsquo;s style.",
      },
    ],
    howWorksTitle: "How Discharge Summary Simplifier works",
    howWorks: [
      {
        step: "1",
        title: "Drop the discharge PDF",
        text: "From any Indian hospital &mdash; multi-speciality, smaller nursing home, government hospital. Up to 50 MB.",
      },
      {
        step: "2",
        title: "We rewrite section-by-section",
        text: "Diagnoses translated from medical terminology to everyday words (with the original term in parentheses). Medications rewritten with timing in plain English (&ldquo;Tab Pan-D 40 mg 1-0-0&rdquo; becomes &ldquo;Pantoprazole 40 mg, one tablet in the morning before food&rdquo;). Follow-up plan + warning signs surfaced prominently.",
      },
      {
        step: "3",
        title: "Get patient-friendly markdown",
        text: "Output sections: what happened in hospital / current diagnosis in plain English / medications with timing / follow-up plan / warning signs to watch for. Page citations link each section back to the original discharge.",
      },
    ],
    faqs: [
      {
        q: "Is this medical advice?",
        a: "No. The simplifier translates the LANGUAGE of the discharge summary &mdash; we don&rsquo;t add clinical interpretation, change dosages, or recommend skipping medications. The clinical content stays exactly what the prescribing doctor wrote. Always discuss the discharge with the prescribing doctor if anything is unclear.",
      },
      {
        q: "How does it handle Indian prescribing shorthand?",
        a: "Pre-encoded: 1-0-1 (one tablet morning, none afternoon, one tablet night), BD (twice a day), TDS (three times a day), QID (four times), HS (at bedtime), SOS (when needed), AC (before food), PC (after food). All translated into plain English timing instructions.",
      },
      {
        q: "What about warning signs to watch for?",
        a: "Surfaced prominently &mdash; when to rush back to hospital, when to call the doctor, what&rsquo;s normal vs an emergency. Critical for post-surgery / post-cardiac / post-stroke discharges where deterioration signs need immediate action.",
      },
      {
        q: "Will it explain insurance / billing items?",
        a: "Discharge summaries are clinical, not financial. For the bill itself use Medical Bill Analyzer (separate tool) &mdash; it parses the itemised charges and surfaces IRDAI-reimbursable items.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per discharge. Cost is fixed regardless of length.",
      },
      {
        q: "Privacy?",
        a: "Discharge sent to inference provider for rewriting, not stored. For patient confidentiality (especially when sharing with extended family), redact patient name + UHID first via Redact PDF before running the simplifier.",
      },
    ],
    cta: {
      title: "Have lab reports too?",
      text: "Blood Test Report Parser extracts structured lab values from any Indian lab format with high/low/normal flags. Pairs with the discharge summary for the full post-hospital handoff.",
      linkHref: "/tool/ai-blood-test",
      linkLabel: "Try Blood Test Report Parser",
    },
  },

  "ai-blog": {
    useCasesTitle: "Why people use PDF to Blog Post",
    useCasesIntro:
      "Internal docs that should be public-facing &mdash; product launches, research findings, case studies &mdash; rarely make the leap because converting them to blog format is tedious. PDF to Blog Post generates a publish-ready draft (hook, sections, conclusion) from any source PDF. The output is a starting draft, not a finished post.",
    useCases: [
      {
        icon: "Edit",
        title: "Product launch announcement",
        text: "Internal launch spec becomes the customer-facing blog post draft &mdash; same product, different audience, different register. Saves the &ldquo;rewrite the spec for the website&rdquo; afternoon every PM dreads.",
      },
      {
        icon: "Pages",
        title: "Research findings &rarr; thought leadership",
        text: "Internal research reports become external-facing thought-leadership posts. Useful for VC-backed startups doing content marketing on the back of their data.",
      },
      {
        icon: "Sparkle",
        title: "Case study repurposing",
        text: "Customer success case studies (often delivered as 10-page PDFs) become 800-word blog posts highlighting the same story. The blog format unlocks SEO + social-share value the PDF format can&rsquo;t generate.",
      },
      {
        icon: "Book",
        title: "Conference talk &rarr; blog post",
        text: "Speakers turning their own conference talk decks into companion blog posts. The blog post serves as the durable link to share post-talk &mdash; better than &ldquo;here are my slides&rdquo; tweets.",
      },
      {
        icon: "Shield",
        title: "Documentation summary post",
        text: "Long documentation pages become digest blog posts that index back into the docs. Improves SEO surface (long-tail keyword discovery) for technical products with deep docs.",
      },
    ],
    howWorksTitle: "How PDF to Blog Post works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF",
        text: "PDF up to 100 MB. Works on internal docs, research reports, case studies, talk decks, technical specs.",
      },
      {
        step: "2",
        title: "We restructure for blog format",
        text: "Server-side extraction, then a generation pass that produces blog-shape: hook (first 2 paragraphs), themed sections with subheaders, transition prose between sections, conclusion + (optional) CTA. Tone shifts toward conversational while preserving facts.",
      },
      {
        step: "3",
        title: "Get markdown blog draft",
        text: "Output is markdown with hook, H2 sections, conclusion. Length scales with input &mdash; typically 800&ndash;1500 words. Page citations link each section back to the source PDF for fact-checking.",
      },
    ],
    faqs: [
      {
        q: "How long is the output?",
        a: "Typically 800&ndash;1500 words for a 10&ndash;30 page source. Longer sources get a longer post (capped around 2000 words to keep the post scannable). For explicit length control, run AI Condense on the output.",
      },
      {
        q: "Will it write the hook in my brand voice?",
        a: "Generic engaging-blog tone by default. Brand voice replication is partial &mdash; the model imitates surface signals (sentence length, vocabulary preferences) when given examples but the output is best treated as a draft for your editor to brand-tune.",
      },
      {
        q: "Does it generate SEO-ready titles?",
        a: "Includes a suggested title at the top of the output. The title is descriptive of the post content but isn&rsquo;t SEO-keyword optimized &mdash; for keyword research and SEO-tuned titles, use a dedicated SEO tool. The post body is search-friendly (clear hierarchy, scannable subheaders).",
      },
      {
        q: "What about images and embeds?",
        a: "Output is text-only. The post will reference where images would help (&ldquo;[chart showing Q3 revenue]&rdquo;) so you know what to add manually. Image generation is a separate workflow.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per draft. Cost is fixed regardless of doc size.",
      },
      {
        q: "Should I publish the output as-is?",
        a: "No. The output is a draft &mdash; ~80% of the work, but the last 20% (editor pass for voice + fact-check + adding examples / images) materially improves quality. Treat it as the part that would have taken you 2 hours, freed up.",
      },
    ],
    cta: {
      title: "Need a newsletter version too?",
      text: "PDF to Email Newsletter generates a newsletter-shaped output from the same source &mdash; subject + preheader + sections + sign-off. Pairs naturally with the blog post for the &ldquo;publish on blog AND email subscribers&rdquo; workflow.",
      linkHref: "/tool/ai-newsletter",
      linkLabel: "Try PDF to Email Newsletter",
    },
  },

  "ai-readability": {
    useCasesTitle: "Why people use Readability Score",
    useCasesIntro:
      "Most readers can handle text that scores around 8&ndash;10 on the Flesch-Kincaid grade level &mdash; that&rsquo;s 8th-grade reading level, the recommended target for general-audience content. Readability Score measures the doc&rsquo;s grade level, flags the complex sentences and jargon making it harder than it needs to be, and suggests fixes.",
    useCases: [
      {
        icon: "Pages",
        title: "Marketing / customer-facing copy QA",
        text: "Run customer-facing copy through readability before publishing. Saas pages aimed at general audience but written by engineers often score 14&ndash;16 (graduate-level); the report flags which sentences are dragging the average up.",
      },
      {
        icon: "Sparkle",
        title: "Patient-facing medical content",
        text: "Healthcare apps and medical content services have explicit readability targets (often 6&ndash;8 grade level for accessibility). The score plus jargon flags surface what to simplify before publication.",
      },
      {
        icon: "Book",
        title: "Educational content alignment",
        text: "EdTech building age-appropriate content runs the score to verify alignment. A 5th-grade textbook scoring at 9th-grade level is too hard; the flagged sentences are where to revise.",
      },
      {
        icon: "Edit",
        title: "Technical doc clarity audit",
        text: "Engineering-written docs aimed at non-technical buyers (sales decks, pricing pages, FAQ sections) often have register mismatch. The score quantifies the mismatch; the fixes section suggests how to bring it down.",
      },
      {
        icon: "Shield",
        title: "Legal / policy doc accessibility",
        text: "GDPR, terms of service, privacy policies have legal requirement to be &ldquo;understandable.&rdquo; A grade-12+ score signals risk. The report surfaces specific sentences and substitution suggestions.",
      },
    ],
    howWorksTitle: "How Readability Score works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works best on prose; heavily structured content (tables, code blocks, math notation) skews the score.",
      },
      {
        step: "2",
        title: "We score + flag",
        text: "Server-side extraction, then Flesch-Kincaid grade calculation, complex-sentence detection (high syllable-per-word ratios, long sentences with multiple clauses), jargon flagging (domain-specific terms with lay alternatives available).",
      },
      {
        step: "3",
        title: "Get a structured report",
        text: "Output: overall grade level / sentence-by-sentence flag list / jargon list with suggested replacements / overall recommendations (e.g. &ldquo;split sentences over 25 words&rdquo;). Page citations on every flag.",
      },
    ],
    faqs: [
      {
        q: "Is Flesch-Kincaid the only metric?",
        a: "Primary score is Flesch-Kincaid grade level (most widely used for English content). We also surface average sentence length and average syllable-per-word for context. Other metrics (Gunning Fog, SMOG, Coleman-Liau) are correlated and don&rsquo;t add much signal.",
      },
      {
        q: "Will it work for non-English content?",
        a: "Flesch-Kincaid is English-specific. For Indian-language content (Hindi, Tamil, Bengali), the syllable-counting heuristic doesn&rsquo;t translate accurately. Use the score on English source content only; for Indic readability, rely on human review.",
      },
      {
        q: "What&rsquo;s a good target score?",
        a: "Depends on audience. General-audience web content: 6&ndash;9. Patient-facing health content: 5&ndash;7. Technical docs for technical readers: 10&ndash;13. Legal docs aiming at consumer accessibility: 8&ndash;10. Above 13 is graduate-level and should generally be intentional.",
      },
      {
        q: "Can it auto-rewrite the flagged sentences?",
        a: "No &mdash; it surfaces the issues. For automatic rewriting at lower readability, AI Improve Writing rewrites for clarity + concision (~20-30% shorter); AI Rewrite with the &ldquo;simple&rdquo; register option rewrites at lower complexity. Score-then-rewrite is a 2-tool workflow today.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the score feels wrong?",
        a: "Flesch-Kincaid is heuristic &mdash; it doesn&rsquo;t understand context, only word/sentence shape. A doc with simple language but specialized terms can score low (good readability) while still being inaccessible to laypeople. Use the score with the jargon-flag list, not in isolation.",
      },
    ],
    cta: {
      title: "Want to actually fix the writing?",
      text: "AI Improve Writing rewrites for clarity + concision while preserving every claim and number &mdash; the natural next step after the readability audit identifies what to fix.",
      linkHref: "/tool/ai-improve-writing",
      linkLabel: "Try AI Improve Writing",
    },
  },

  "ai-newsletter": {
    useCasesTitle: "Why people use PDF to Email Newsletter",
    useCasesIntro:
      "Newsletters have specific format constraints &mdash; subject line under 60 chars, preheader text, scannable sections with descriptive headers, sign-off. PDF to Email Newsletter generates a publish-ready draft in this exact format from any source PDF. Output drops directly into your ESP (Mailchimp, Substack, Beehiiv, ConvertKit) without restructuring.",
    useCases: [
      {
        icon: "Send",
        title: "Internal weekly digest distribution",
        text: "Weekly internal updates that should also be emailed. The PDF (drafted in Notion / Docs) becomes a mailable newsletter without copy-pasting and reformatting section by section.",
      },
      {
        icon: "Pages",
        title: "Research report &rarr; subscriber email",
        text: "Long research reports become digestible subscriber emails. Saves the analyst&rsquo;s time on the &ldquo;rewrite for the email list&rdquo; step that often gets dropped.",
      },
      {
        icon: "Sparkle",
        title: "Product update / changelog email",
        text: "Internal release notes become customer-facing release announcement emails. Restructured for impact (&ldquo;here&rsquo;s what&rsquo;s new&rdquo;) rather than chronological.",
      },
      {
        icon: "Book",
        title: "Curriculum &rarr; cohort drip",
        text: "Course material becomes a drip-email sequence (one section per week). Useful for cohort-based courses where async engagement happens in the inbox.",
      },
      {
        icon: "Shield",
        title: "Industry brief &rarr; client newsletter",
        text: "Industry research / regulatory updates become client-facing newsletters. The conversion preserves the technical content while shifting register to client-friendly.",
      },
    ],
    howWorksTitle: "How PDF to Email Newsletter works",
    howWorks: [
      {
        step: "1",
        title: "Drop the source PDF",
        text: "PDF up to 100 MB. Works on internal docs, research reports, release notes, course material, briefs.",
      },
      {
        step: "2",
        title: "We restructure for email format",
        text: "Subject line generated (60-char optimized), preheader (the 1&ndash;2 sentence preview text most ESPs render below the subject), 3&ndash;5 sections with descriptive headers, sign-off. Tone shifted toward email-conversational. Routing layer picks the model based on cost-vs-quality fit.",
      },
      {
        step: "3",
        title: "Get an ESP-ready draft",
        text: "Markdown output with: Subject / Preheader / Sections / Sign-off. Copy-paste into Mailchimp / Substack / Beehiiv / ConvertKit and you have a publish-ready draft minus images and final tone polish.",
      },
    ],
    faqs: [
      {
        q: "Will the subject line drive opens?",
        a: "It&rsquo;s generated for clarity, not for click-bait optimization. For aggressive open-rate optimization, run the suggested subject through your A/B-testing tool against alternatives. The generated one is a competent baseline.",
      },
      {
        q: "How long is the newsletter draft?",
        a: "300&ndash;800 words depending on source length. Newsletters longer than that have steep open-vs-read drop-off; we cap output to keep email engagement viable.",
      },
      {
        q: "Does it include images and embeds?",
        a: "Text-only. The draft references where images would help (&ldquo;[chart showing Q3 revenue]&rdquo;); add the actual images in your ESP. Image generation is a separate workflow.",
      },
      {
        q: "Can I get a series of emails instead of one?",
        a: "Drip-sequence generation is on the roadmap. For now, run the source PDF through this tool once for the digest, or run AI Action Items + AI Summarize separately for action-oriented vs context-oriented sequences.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per draft. Cost is fixed regardless of doc size.",
      },
      {
        q: "Will the tone match my brand voice?",
        a: "Generic newsletter tone by default. Brand voice replication is partial &mdash; provide your existing newsletters as fine-tuning examples is on the roadmap. Today, treat the output as a structural draft for your editor to brand-tune.",
      },
    ],
    cta: {
      title: "Need a blog version too?",
      text: "PDF to Blog Post generates a blog-shaped draft from the same source &mdash; longer, with hook + sections + conclusion. Pairs with the newsletter for the &ldquo;blog + email subscribers&rdquo; multi-channel workflow.",
      linkHref: "/tool/ai-blog",
      linkLabel: "Try PDF to Blog Post",
    },
  },

  "ai-video-script": {
    useCasesTitle: "Why people use PDF to Video Script",
    useCasesIntro:
      "Talking-head videos need a structured script &mdash; hook in the first 5 seconds, segmented content in 90-second chunks, visual stage cues, and a closing CTA. PDF to Video Script generates the script in this format from any source PDF, optimized for the YouTube / LinkedIn / Reels attention curve.",
    useCases: [
      {
        icon: "Play",
        title: "YouTube explainer from a research paper",
        text: "Researchers turning their own paper into an explainer video. Script segments the content into 90s chunks for retention, with stage cues for what to draw on the whiteboard or show on screen.",
      },
      {
        icon: "Sparkle",
        title: "Product demo video script",
        text: "Internal product spec becomes a 5-minute product demo script. Hook frames the user pain, sections walk through key features, closing CTA drives signup.",
      },
      {
        icon: "Pages",
        title: "Webinar / talk prep",
        text: "Transcript of a previous talk + slide deck becomes a refined script for a re-recording. Useful for evergreen webinar content where you want the polished take, not the original live one.",
      },
      {
        icon: "Book",
        title: "Educational explainer",
        text: "Teachers and creators making subject-explanation videos use the script as the structured first draft. Replaces the &ldquo;outline by hand&rdquo; step that&rsquo;s the slowest part of video pre-production.",
      },
      {
        icon: "Shield",
        title: "Compliance training video",
        text: "Internal policy doc becomes a 10-minute compliance training video script. Format works well for module-based training where each segment can be a separate completion checkpoint.",
      },
    ],
    howWorksTitle: "How PDF to Video Script works",
    howWorks: [
      {
        step: "1",
        title: "Drop the source",
        text: "PDF up to 100 MB. Works on research papers, product specs, talk transcripts, educational material, policy docs.",
      },
      {
        step: "2",
        title: "We structure for talking-head video",
        text: "Hook generated (5&ndash;10 second attention-grab), content sequenced into 90-second segments (matches YouTube retention drop-off), stage cues inserted (what to draw / show / cut to), closing CTA. Tone shifted toward conversational-spoken.",
      },
      {
        step: "3",
        title: "Get a recordable script",
        text: "Markdown output with: HOOK / SEGMENTS (timestamped) / STAGE CUES / CTA. The format is recordable as-is &mdash; print it, read it, ship it. Page citations link each segment back to the source.",
      },
    ],
    faqs: [
      {
        q: "How long is the output?",
        a: "Default targets 5&ndash;8 minute videos (~750&ndash;1200 words spoken). For shorter (Reels / TikTok 30&ndash;60s) or longer (15&ndash;20 min), trim or expand manually &mdash; explicit length control is on the roadmap.",
      },
      {
        q: "Will it match my speaking style?",
        a: "Generic talking-head tone by default. The output is a draft to read once and edit for your speaking rhythm. Some creators prefer to outline the structure (which the script provides) and improvise the actual words, treating the script as scaffolding.",
      },
      {
        q: "What about visual cues / B-roll suggestions?",
        a: "Stage cues are included (&ldquo;[show the chart]&rdquo;, &ldquo;[cut to graphic]&rdquo;, &ldquo;[zoom on the equation]&rdquo;) for talking-head + B-roll style videos. For full storyboarding (frame-by-frame visuals), you&rsquo;ll need a dedicated tool &mdash; this generates the verbal script, not the visual treatment.",
      },
      {
        q: "Can it write for shorts vs long-form?",
        a: "Default is mid-length (5&ndash;8 min). The same hook + segment structure scales down to shorts but you&rsquo;ll need to manually pick the strongest segment and cut. For TikTok-native content, treat this output as input for further editing.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per script. Cost is fixed regardless of doc size.",
      },
      {
        q: "Does it suggest titles and thumbnails?",
        a: "Suggested title is included. Thumbnail / channel art generation is out of scope &mdash; use a dedicated thumbnail tool. The script focuses on what gets recorded, not what wraps it.",
      },
    ],
    cta: {
      title: "Want a blog post version too?",
      text: "PDF to Blog Post generates a written-form version of the same content &mdash; useful for the &ldquo;publish video on YouTube AND blog post on website&rdquo; SEO workflow.",
      linkHref: "/tool/ai-blog",
      linkLabel: "Try PDF to Blog Post",
    },
  },

  "ai-improve-writing": {
    useCasesTitle: "Why people use Improve Writing",
    useCasesIntro:
      "Improve Writing rewrites for clarity and concision &mdash; typically 20&ndash;30% shorter &mdash; without changing facts, register, or claims. The output is the same document, tighter. Useful when the goal is &ldquo;say this better&rdquo; rather than &ldquo;say this differently.&rdquo;",
    useCases: [
      {
        icon: "Edit",
        title: "Polish a draft before sharing",
        text: "First-draft business writing tends toward verbose. Improve Writing tightens it &mdash; same content, ~25% fewer words &mdash; before sending to stakeholders. Faster than a manual editing pass and consistent across documents.",
      },
      {
        icon: "Pages",
        title: "Tighten product spec / PRD",
        text: "Engineering specs often start as brain-dump and need editorial pass before sharing with cross-functional partners. The tightened version preserves every requirement while losing the &ldquo;basically&rdquo;s and &ldquo;in order to&rdquo;s.",
      },
      {
        icon: "Sparkle",
        title: "Cut filler from website copy",
        text: "Marketing copy with filler phrases (&ldquo;solutions to help you&hellip;&rdquo;, &ldquo;designed to enable&hellip;&rdquo;) gets tightened to direct claims. Improves both reader experience and SEO (more value per word).",
      },
      {
        icon: "Book",
        title: "Cover letter / personal statement",
        text: "Job seekers and applicants tightening their cover letters to fit the &ldquo;1 page&rdquo; requirement. Loses the verbose phrasing without losing the substantive evidence.",
      },
      {
        icon: "Shield",
        title: "Email response polish",
        text: "Long client emails get tightened before sending. The relationship-friendly version preserves warmth while losing the rambling.",
      },
    ],
    howWorksTitle: "How Improve Writing works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on prose &mdash; emails, business docs, blog posts, articles.",
      },
      {
        step: "2",
        title: "We tighten section-by-section",
        text: "Server-side extraction, then a constrained rewrite that targets clarity and concision: removes filler phrases, tightens redundancy, simplifies passive voice, splits long sentences. Every claim and number preserved verbatim. Routing layer picks the model best at concision-without-loss.",
      },
      {
        step: "3",
        title: "Get the tighter version",
        text: "Markdown output, typically 20&ndash;30% shorter than input. Page citations link each tightened passage back to the source for verification.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI Paraphrase or AI Condense?",
        a: "Paraphrase varies word choice but preserves length. Condense is aggressive shortening (50%+ length reduction) at the cost of detail. Improve Writing is the middle ground: ~25% shorter while keeping every substantive point. Pick based on whether you need style change, aggressive cut, or polish.",
      },
      {
        q: "Will it preserve my voice?",
        a: "Yes &mdash; register and tone are explicitly preserved. The output should sound like the original author, just tighter. If the output feels off-voice, the input was probably already concise &mdash; not every doc benefits from tightening.",
      },
      {
        q: "What if it cuts something important?",
        a: "Page citations make spot-checking easy &mdash; click any tightened passage, see what was in the source. For high-stakes content (legal, regulatory, technical specs), read the output before publishing. The tool errs toward preservation but isn&rsquo;t infallible.",
      },
      {
        q: "Does it preserve structure (headings, lists)?",
        a: "Yes. Headings + list structure preserved verbatim. Tightening happens within sections / list items, not on the structural skeleton.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the original is already tight?",
        a: "Output may be similar length to input &mdash; the model won&rsquo;t cut for the sake of cutting. If your input is well-edited, this tool is the wrong fit; you&rsquo;re past the point of diminishing returns. Run AI Proofread instead for grammar / typo check.",
      },
    ],
    cta: {
      title: "Want to know what to fix first?",
      text: "Readability Score reports the doc&rsquo;s grade level + flags complex sentences and jargon. Useful as a pre-Improve Writing audit to know whether the issue is verbosity (Improve Writing fixes) or jargon (AI Rewrite with the &ldquo;simple&rdquo; register fixes).",
      linkHref: "/tool/ai-readability",
      linkLabel: "Try Readability Score",
    },
  },

  "ai-proofread": {
    useCasesTitle: "Why people use Proofread PDF",
    useCasesIntro:
      "Proofread PDF surfaces spelling, grammar, and agreement errors as a structured table &mdash; page reference, original quote, error type, suggested fix. Optimized for the &ldquo;final pass before publication&rdquo; workflow where you need machine-readable error detection across a long doc, not just inline squiggles.",
    useCases: [
      {
        icon: "Edit",
        title: "Final pass before publication",
        text: "Books, research papers, long reports going to press. Proofread surfaces typos and agreement errors that escaped multiple human reads. The error-table format is reviewable in 10 minutes regardless of doc length.",
      },
      {
        icon: "Pages",
        title: "Multi-author doc consistency check",
        text: "When several authors contribute to one doc, voice and grammar drift. The error table surfaces inconsistencies (&ldquo;data is&rdquo; vs &ldquo;data are&rdquo;, US vs UK spelling) for editorial decision before publication.",
      },
      {
        icon: "Sparkle",
        title: "Job-application materials",
        text: "Cover letters, resumes, personal statements. A typo can sink an application; the structured error report is faster than re-reading every paragraph.",
      },
      {
        icon: "Book",
        title: "Translated content QA",
        text: "Documents translated by humans or LLMs benefit from a final grammar pass. Especially useful when the translator is non-native &mdash; agreement errors and article use are common drift points.",
      },
      {
        icon: "Shield",
        title: "Legal / regulatory submissions",
        text: "Filings, contracts, and regulatory submissions where typos are professionally embarrassing or legally consequential. The structured error report is auditable evidence of the proofreading pass.",
      },
    ],
    howWorksTitle: "How Proofread PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on prose &mdash; books, papers, articles, application materials, contracts.",
      },
      {
        step: "2",
        title: "We scan for errors",
        text: "Server-side text extraction, then a multi-pass error scan: spelling (incl. context-aware homophones like there/their/they&rsquo;re), grammar (subject-verb agreement, tense consistency), punctuation, article usage, collocation issues. Errors classified and scored for confidence.",
      },
      {
        step: "3",
        title: "Get a structured error table",
        text: "Markdown table with columns: page / quote / error type / suggested fix. Sorted by page so you can work through the doc linearly. Page citations let you verify each suggestion in context.",
      },
    ],
    faqs: [
      {
        q: "What kinds of errors does it catch?",
        a: "Spelling (incl. context-aware homophones), grammar (subject-verb agreement, tense, comma splices, run-ons), punctuation, article use (a/an/the), collocation issues (idiom violations). NOT a stylistic editor &mdash; it doesn&rsquo;t flag verbosity or weak word choice; for that use Improve Writing.",
      },
      {
        q: "What&rsquo;s the false-positive rate?",
        a: "Variable. Technical / domain-specific terms sometimes flag as misspellings. Stylistic choices (intentional sentence fragments, regional spelling variants) sometimes flag as errors. Treat the table as a filtered list to review &mdash; rejected suggestions are normal, not failure.",
      },
      {
        q: "Does it understand US vs UK English?",
        a: "Default infers from the doc&rsquo;s majority dialect. If the doc is mixed (which is itself an inconsistency worth flagging), the report surfaces the conflict so you can pick a standard and apply consistently.",
      },
      {
        q: "Will it work for non-English content?",
        a: "Best results in English. Indian-language proofreading (Hindi, Tamil, Bengali, etc.) works at lower accuracy &mdash; agreement rules are correct but idiom detection is weaker. For specialized non-English proofreading, native-language tools may be better.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "Should I accept every suggested fix?",
        a: "No. Read each suggestion in context (the page citation makes this fast). Reject any that change meaning, voice, or domain-specific terminology. Treat the table as a list of things to consider, not a list of things to apply.",
      },
    ],
    cta: {
      title: "Want clarity polish too?",
      text: "Improve Writing tightens prose for clarity and concision (~20-30% shorter) without changing facts. Use it AFTER proofread to get both error-free and concise.",
      linkHref: "/tool/ai-improve-writing",
      linkLabel: "Try Improve Writing",
    },
  },

  // =====================================================================
  // 2026-05-01 — Phase 2 AI longform Tier 3 (8 tools)
  //
  // Legal/specialist tools — NDAs, employment contracts, partnership
  // deeds, insurance policies, loan bundles, research papers, salary
  // slips, ATS resumes. Editorial discipline emphasizes:
  //   • Explicit "not legal/financial/medical advice" disclaimers
  //   • Indian-context examples (IRDAI, RERA, Indian Contract Act,
  //     Indian Stamp Act, Companies Act 2013, Partnership Act 1932,
  //     Indian banks/lenders, Indian payslip components)
  //   • Risk-flagging language with confidence levels
  //   • CTAs to genuinely-related tools (e.g. NDA → Employment →
  //     Partnership for the spectrum of business contracts)
  // =====================================================================

  "ai-nda": {
    useCasesTitle: "Why people use NDA Analyzer",
    useCasesIntro:
      "NDAs are short documents with high-stakes clauses buried in dense prose. NDA Analyzer surfaces risk flags, missing standard clauses (mutual vs unilateral, term length, return-or-destroy), and embedded surprises like non-compete or IP-assignment language that don&rsquo;t belong in an NDA. This is a triage aid &mdash; not legal advice.",
    useCases: [
      {
        icon: "Shield",
        title: "Vendor / partner NDA before signing",
        text: "Drop the NDA your vendor sent over, see flagged risk clauses (overly broad confidentiality scope, perpetual term, one-way info flow). Useful for the &ldquo;is this safe to sign?&rdquo; first-pass before forwarding to legal.",
      },
      {
        icon: "Edit",
        title: "Employment / contractor NDA review",
        text: "NDAs in employment contexts often smuggle in non-compete and IP-assignment clauses. The analyzer specifically flags these embedded surprises so you know what to push back on during negotiation.",
      },
      {
        icon: "Pages",
        title: "M&A / due diligence NDA",
        text: "Pre-deal mutual NDAs require careful term-length and exclusion-list review. The analyzer surfaces what&rsquo;s standard vs aggressive in the doc you received.",
      },
      {
        icon: "Sparkle",
        title: "Investor / fundraising NDA",
        text: "NDAs from prospective investors. Common red flags: overly broad info definitions, restrictive obligations on the founder, missing residual-knowledge carve-outs. The analyzer surfaces them.",
      },
      {
        icon: "Compare",
        title: "Comparing your standard NDA against a counter-party&rsquo;s",
        text: "Run both through the analyzer to see clause-by-clause differences. Useful for the negotiation prep where you need to know what&rsquo;s being asked beyond your template.",
      },
    ],
    howWorksTitle: "How NDA Analyzer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the NDA PDF",
        text: "PDF up to 25 MB. Works on Indian and international NDA templates &mdash; mutual / unilateral, employment / vendor / M&A.",
      },
      {
        step: "2",
        title: "We flag + structure",
        text: "Server-side text extraction, then a pass that identifies standard NDA clause categories (definition of confidential info, term, return-or-destroy, exclusions, jurisdiction) plus non-standard insertions (non-compete, IP assignment, non-solicit). Risk flags scored low / medium / high.",
      },
      {
        step: "3",
        title: "Get a structured review",
        text: "Markdown output with: standard clauses present / standard clauses missing / non-standard insertions flagged / suggested negotiation points. Page citations link each flag back to the source.",
      },
    ],
    faqs: [
      {
        q: "Is this legal advice?",
        a: "No. The analyzer is a triage aid that surfaces clauses worth a closer look &mdash; it does NOT substitute for review by a qualified lawyer. For high-stakes NDAs (M&A, IP-heavy, large dollar value), use the analyzer to inform your conversation with counsel, not to skip it.",
      },
      {
        q: "How does it tell standard vs non-standard?",
        a: "Pre-trained on a corpus of common NDA structures. Standard clauses (term, scope, return) are recognized regardless of phrasing variation. Non-standard insertions (non-compete, IP assignment, non-solicit) are flagged by category match. Edge cases (rare but legitimate clauses) may flag as &ldquo;non-standard&rdquo; without being problematic &mdash; review with that in mind.",
      },
      {
        q: "Will it work for Indian NDA formats?",
        a: "Yes &mdash; Indian NDA templates (Indian Contract Act 1872 jurisdiction, Indian Stamp Act compliance) are recognized. Indian-specific clauses (Indian arbitration jurisdiction, Indian governing law) flagged appropriately. Non-Indian NDAs (US, UK, EU) also supported with their respective standard structures.",
      },
      {
        q: "Can it suggest specific redlines?",
        a: "Suggested negotiation points (&ldquo;consider tightening the term to 2 years from 5&rdquo;, &ldquo;ask for residual-knowledge exclusion&rdquo;) are surfaced &mdash; but specific redline language should come from your lawyer. The analyzer informs negotiation prep; it doesn&rsquo;t draft binding language.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per NDA. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if a flagged clause is actually fine?",
        a: "Common &mdash; the analyzer errs on the side of flagging. Review each flag in context. The point of the tool is to surface what to consider, not to label clauses as automatically problematic.",
      },
    ],
    cta: {
      title: "Reviewing an employment contract instead?",
      text: "Employment Contract Review surfaces comp + termination + risk flags (non-compete, IP, training bond) and negotiation points specific to Indian employment agreements.",
      linkHref: "/tool/ai-employment",
      linkLabel: "Try Employment Contract Review",
    },
  },

  "ai-employment": {
    useCasesTitle: "Why people use Employment Contract Review",
    useCasesIntro:
      "Indian employment contracts smuggle in non-compete clauses, IP assignment, training bonds, and notice-period quirks alongside the offered comp. Employment Contract Review surfaces all of it as a structured report so you know what you&rsquo;re signing. Triage aid, not legal advice.",
    useCases: [
      {
        icon: "Shield",
        title: "Pre-acceptance offer review",
        text: "Drop the offer letter / contract before signing. Surfaces comp components (CTC breakdown vs in-hand), notice period, training-bond amount, non-compete duration, IP-assignment scope, exit clauses. Useful for the &ldquo;is this comp + restrictions package fair?&rdquo; conversation with yourself or a mentor.",
      },
      {
        icon: "Edit",
        title: "Negotiation prep",
        text: "When the contract has aggressive clauses (24-month non-compete, 2-year training bond), the analyzer surfaces them with India-context risk levels. Use the output as the prep doc for the comp / restrictions negotiation conversation with HR.",
      },
      {
        icon: "Pages",
        title: "Comparing two offers",
        text: "Run both contracts through the analyzer, compare the structured outputs side-by-side. Surfaces differences in CTC structure, notice period, restrictive covenants &mdash; useful when comp is similar but restrictions differ.",
      },
      {
        icon: "Sparkle",
        title: "Mid-tenure contract change review",
        text: "Promotion or role-change brings a new contract. The analyzer surfaces what changed vs your existing terms (often new non-competes appear, or training bonds get added). Useful before signing the addendum.",
      },
      {
        icon: "Compare",
        title: "Resignation / exit review",
        text: "On resignation, re-read the contract through the analyzer to surface what obligations carry past exit (non-compete duration, IP assignment scope, confidentiality term). Helps plan the next role timing.",
      },
    ],
    howWorksTitle: "How Employment Contract Review works",
    howWorks: [
      {
        step: "1",
        title: "Drop the contract PDF",
        text: "PDF up to 25 MB. Works on Indian employment contracts (Companies Act 2013 / Industrial Disputes Act / Indian Contract Act). Non-Indian contracts also analyzed but India-specific flags will not apply.",
      },
      {
        step: "2",
        title: "We extract + flag",
        text: "Server-side text extraction, then a structured pass that surfaces: CTC breakdown, in-hand calculation, notice period, training bond, non-compete (duration / geographic scope), IP assignment, exit triggers, governing law. Each clause flagged for risk level (low / medium / high).",
      },
      {
        step: "3",
        title: "Get a structured review",
        text: "Markdown output with sections: comp / termination / restrictive covenants (non-compete, non-solicit, IP) / risk flags / suggested negotiation points. Page citations on every clause.",
      },
    ],
    faqs: [
      {
        q: "Is this legal advice?",
        a: "No. The analyzer is a triage aid &mdash; it surfaces what&rsquo;s in the contract for your informed review. For high-stakes negotiations (executive role, IP-heavy company, equity components), use the output to inform your conversation with an employment lawyer. Indian Bar Council members specializing in employment law are the right next step.",
      },
      {
        q: "Are Indian-specific risk flags pre-encoded?",
        a: "Yes. Training bonds (legal in India under Indian Contract Act with reasonable enforcement test), broad non-competes (generally unenforceable in India post-employment under Section 27 ICA), IP assignment scope (employer-owned for work-product is standard, but personal-time inventions are a battleground). Flags reflect Indian case-law trends.",
      },
      {
        q: "Will it explain CTC vs in-hand?",
        a: "Yes &mdash; CTC includes employer PF contribution, gratuity, variable pay, retention bonuses. In-hand is the monthly transfer post-tax. The analyzer surfaces both calculations so the &ldquo;CTC of X&rdquo; offer is contextualized against actual monthly income.",
      },
      {
        q: "How does it handle equity / ESOP terms?",
        a: "Equity terms (vesting schedule, cliff, acceleration on termination, exercise price) flagged when present. Indian-specific equity quirks (perquisite tax, FBT history, sweat equity rules) noted. For complex equity packages, the analyzer flags what to clarify with the employer; specific tax modeling needs a CA.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per contract. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Contract sent to inference provider for analysis, not stored. For maximum confidentiality (especially for senior roles where the offer details are sensitive), redact your name / company / specific dollar values via Redact PDF first &mdash; the structural analysis still works on the redacted version.",
      },
    ],
    cta: {
      title: "Want to compare against the JD?",
      text: "Resume &harr; JD Matcher scores how well your resume aligns with the JD &mdash; useful before / during the comp negotiation when leverage matters. Stronger fit = stronger negotiating position.",
      linkHref: "/tool/ai-jd-match",
      linkLabel: "Try Resume ↔ JD Matcher",
    },
  },

  "ai-partnership-deed": {
    useCasesTitle: "Why people use Partnership Deed Analyzer",
    useCasesIntro:
      "Indian partnership deeds (under Partnership Act 1932) and LLP agreements (under LLP Act 2008) carry huge implications for capital, profit-sharing, decision rights, and admission/retirement of partners. Partnership Deed Analyzer surfaces all of it as a structured table so partners know exactly what they&rsquo;ve agreed to. This is a triage aid, not legal advice.",
    useCases: [
      {
        icon: "Shield",
        title: "Forming a new partnership / LLP",
        text: "Before signing the deed, run it through the analyzer to verify capital contributions, profit-loss ratios, drawing rights, decision-making thresholds. Surfaces missing standard clauses (death-of-partner, retirement, expulsion mechanisms) the drafter may have skipped.",
      },
      {
        icon: "Edit",
        title: "Joining an existing partnership",
        text: "When invited to join an existing firm as a new partner, the analyzer surfaces what your role + capital contribution + profit share + decision rights actually are. Useful for the &ldquo;is this offer fair?&rdquo; review.",
      },
      {
        icon: "Pages",
        title: "Annual deed review / amendment",
        text: "Many Indian partnerships annually review and amend the deed (capital changes, ratio updates). The analyzer compares the new vs old to surface what&rsquo;s actually changing &mdash; useful when the changes are buried in long amendment language.",
      },
      {
        icon: "Sparkle",
        title: "Dispute / dissolution prep",
        text: "When partners disagree, the deed is the first reference for resolution. The analyzer surfaces what the deed says about the disputed area (decision-making, profit allocation, expulsion grounds) so both sides have the same baseline.",
      },
      {
        icon: "Compare",
        title: "Conversion to LLP planning",
        text: "Indian partnerships converting to LLP need to map existing deed terms to LLP agreement terms. The analyzer&rsquo;s structured output simplifies the mapping &mdash; useful for the CA / lawyer drafting the LLP agreement.",
      },
    ],
    howWorksTitle: "How Partnership Deed Analyzer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the deed PDF",
        text: "PDF up to 25 MB. Works on Indian partnership deeds (Partnership Act 1932) and LLP agreements (LLP Act 2008). Stamp paper variants and scanned-and-signed deeds both supported.",
      },
      {
        step: "2",
        title: "We extract + structure",
        text: "Server-side text extraction (OCR if scanned), then a structured pass that surfaces: partners and capital contributions / profit-loss share / drawing rights / decision-making thresholds / admission and retirement clauses / expulsion grounds / dispute resolution. Risk flags on aggressive or missing clauses.",
      },
      {
        step: "3",
        title: "Get a structured review",
        text: "Markdown output with sections: Partners & Capital / Profit-Loss / Decision-Making / Admission & Retirement / Risk Flags / Suggested Clarifications. Page citations on every section.",
      },
    ],
    faqs: [
      {
        q: "Is this legal advice?",
        a: "No. The analyzer is a triage aid &mdash; it surfaces what the deed says for your informed review. For partnership formations or disputes, use the output to inform your conversation with a lawyer or CA. Indian partnership law has nuances (partner&rsquo;s authority, third-party rights, registration vs unregistered firms) where professional guidance matters.",
      },
      {
        q: "Does it understand Indian partnership-vs-LLP differences?",
        a: "Yes. Partnership Act 1932 (registered / unregistered partnerships, joint and several liability, partner-as-agent) and LLP Act 2008 (designated partners, limited liability, separate legal entity) have distinct features. The analyzer flags clauses appropriate to each form.",
      },
      {
        q: "What about stamp duty / registration concerns?",
        a: "Surfaced in the risk-flags section if the deed appears under-stamped or unregistered (Indian Stamp Act compliance). Note that stamp-duty rates are state-specific and the analyzer doesn&rsquo;t calculate exact dues &mdash; check the state-specific schedule.",
      },
      {
        q: "Can it identify missing standard clauses?",
        a: "Yes &mdash; common omissions (death-of-partner, retirement on ill-health, expulsion grounds, dispute resolution mechanism) are flagged. Indian partnerships frequently leave these to default (Partnership Act provisions), which can produce surprises during real disputes.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per deed. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Deed sent to inference provider, not stored. For maximum confidentiality on partnership matters (especially financial details), redact partner names + capital amounts via Redact PDF first.",
      },
    ],
    cta: {
      title: "Reviewing an NDA between partners?",
      text: "NDA Analyzer surfaces risk flags, missing clauses, and embedded surprises. Useful for the inter-partner NDAs that often accompany the deed itself.",
      linkHref: "/tool/ai-nda",
      linkLabel: "Try NDA Analyzer",
    },
  },

  "ai-loan-bundle": {
    useCasesTitle: "Why people use Loan Application Bundler Audit",
    useCasesIntro:
      "Indian loan applications (home loan, personal loan, business loan, education loan) require a stack of documents: KYC, income proof, bank statements, ITR, property docs (for secured loans). The audit detects what loan type the bundle is for, audits against the lender&rsquo;s typical checklist, surfaces missing items, and flags eligibility issues before submission.",
    useCases: [
      {
        icon: "Receipt",
        title: "Home loan application pre-check",
        text: "Before submitting to HDFC / ICICI / SBI / Bajaj Housing Finance, run the bundle through the audit. Surfaces missing items (latest 3-month payslips often forgotten, or bank statements not stamped) that would otherwise cause rejection or 3-week delays.",
      },
      {
        icon: "Shield",
        title: "Business / MSME loan readiness",
        text: "MSME loan documentation is dense (CMA data, projected financials, audited statements). The audit verifies the bundle has the items the lender will ask for &mdash; faster than discovering gaps mid-application.",
      },
      {
        icon: "Pages",
        title: "Personal loan eligibility check",
        text: "Personal loans rejected for FOIR / EMI-to-income mismatches are common. The audit calculates EMI capacity from bank statements and flags eligibility before you apply (and take a credit-bureau hit).",
      },
      {
        icon: "Edit",
        title: "Education loan abroad",
        text: "Foreign education loans (Avanse, HDFC Credila, banks) have detailed admission + co-borrower documentation. The audit verifies all required items present (admission letter, fee schedule, parent ITR / bank statements, university accreditation).",
      },
      {
        icon: "Sparkle",
        title: "Loan against property / mortgage",
        text: "LAP and mortgage applications need property documentation (title deeds, encumbrance certificate, property tax receipts). The audit surfaces missing property-side docs that lenders often ask for late in the process.",
      },
    ],
    howWorksTitle: "How Loan Application Bundler Audit works",
    howWorks: [
      {
        step: "1",
        title: "Concatenate + drop your document bundle",
        text: "Combine your loan documents into one PDF (use our Merge PDF tool first), then drop. Works on home loan / personal loan / business loan / education loan / loan-against-property bundles up to 100 MB.",
      },
      {
        step: "2",
        title: "We detect + audit",
        text: "First pass detects loan type from the bundle contents (KYC + property docs &rarr; home loan / LAP; KYC + payslips + bank statements &rarr; personal loan; CMA data &rarr; MSME). Then audits against the lender&rsquo;s typical checklist for that loan type.",
      },
      {
        step: "3",
        title: "Get an audit report",
        text: "Markdown output with: detected loan type / present items / missing items / eligibility flags (FOIR / DTI / property valuation gaps). Page citations link each finding back to the bundle for your review.",
      },
    ],
    faqs: [
      {
        q: "Is the audit lender-specific?",
        a: "Generic-checklist by default &mdash; matches what most Indian lenders ask. Specific lender variants (HDFC vs SBI vs Bajaj vs PSU banks) have minor checklist differences. The output is a strong baseline; cross-check against the specific lender&rsquo;s documents-required PDF for the final submission.",
      },
      {
        q: "Does it calculate eligibility?",
        a: "Surfaces eligibility flags from the documents present (FOIR estimated from payslips + bank statements, DTI estimated, property LTV from valuation if present). These are heuristic estimates &mdash; the lender&rsquo;s underwriting is more sophisticated. Use the audit estimates to know if you&rsquo;re in the ballpark before applying.",
      },
      {
        q: "What about scanned bundles?",
        a: "OCR runs on scanned pages first. Most lender-submitted bundles include both clean PDFs (from KYC tools) and scanned items (property documents, older bank statements) &mdash; both work. Quality on faded / handwritten property documents is lower; flag for human review when accuracy matters.",
      },
      {
        q: "Will it catch document age requirements?",
        a: "Surfaces freshness flags (e.g. &ldquo;bank statements are 4 months old; lender typically requires latest 3 months&rdquo;). Useful for catching staleness before submission &mdash; common cause of rejections or processing delays.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per audit. Cost is fixed regardless of bundle size.",
      },
      {
        q: "Privacy?",
        a: "Bundle sent to inference provider for audit, not stored. For maximum confidentiality on financial documents (PAN, Aadhaar, bank account numbers), redact PII via Redact PDF before running the audit &mdash; the structural audit works on the redacted bundle.",
      },
    ],
    cta: {
      title: "Need to merge documents first?",
      text: "Merge PDF combines multiple PDFs into one bundle &mdash; the prerequisite for the loan audit. Works in your browser, no signup needed for the merge step.",
      linkHref: "/tool/merge",
      linkLabel: "Try Merge PDF",
    },
  },

  "ai-insurance": {
    useCasesTitle: "Why people use Insurance Policy Analyzer",
    useCasesIntro:
      "Indian insurance policies (health, life, motor, home, travel, term) bury the important parts in fine print: coverage scope, exclusions, waiting periods, sub-limits, claim process, renewal terms. Insurance Policy Analyzer surfaces all of it as a structured report. Triage aid, not insurance advice &mdash; for product-specific guidance consult an IRDAI-licensed advisor.",
    useCases: [
      {
        icon: "Shield",
        title: "Pre-purchase policy comparison",
        text: "Before buying a health policy from Star / HDFC ERGO / ICICI Lombard / Manipal Cigna, run the brochure through the analyzer. Surfaces coverage / exclusions / waiting-period structure side-by-side &mdash; faster than reading 40-page policy wordings.",
      },
      {
        icon: "Pages",
        title: "Claim time policy review",
        text: "Before filing a claim, run YOUR policy through the analyzer. Surfaces what&rsquo;s covered / excluded / sub-limited for the specific procedure or event. Useful for the &ldquo;is this claimable?&rdquo; first-pass before talking to TPA.",
      },
      {
        icon: "Sparkle",
        title: "Annual renewal check",
        text: "Insurance policies change terms at renewal. The analyzer surfaces what changed vs the previous year&rsquo;s policy (often coverage shrinks or premium increases tied to NCB loss / age band change).",
      },
      {
        icon: "Edit",
        title: "Term life / ULIP review",
        text: "Term life is straightforward; ULIPs are complex (charges, fund options, surrender values). The analyzer surfaces the charge structure (premium allocation, mortality, fund management, policy admin charges) and the surrender penalty curve. Useful for the &ldquo;is this still worth holding?&rdquo; decision.",
      },
      {
        icon: "Compare",
        title: "Group vs personal cover comparison",
        text: "Employer group health cover often has gaps employees plug with personal cover. The analyzer compares the two policies&rsquo; combined coverage to surface what&rsquo;s actually covered vs duplicate vs gap.",
      },
    ],
    howWorksTitle: "How Insurance Policy Analyzer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the policy PDF",
        text: "PDF up to 50 MB. Works on Indian policy types (health, life, motor, home, travel, term). Most major insurers&rsquo; policy formats are pre-recognized.",
      },
      {
        step: "2",
        title: "We structure the policy",
        text: "Server-side extraction, then a structured pass that surfaces: coverage scope / exclusions / waiting periods / sub-limits / claim process / renewal & portability terms. Risk flags on aggressive exclusions or missing standard coverage.",
      },
      {
        step: "3",
        title: "Get a structured review",
        text: "Markdown output with sections: Coverage / Exclusions / Waiting Periods / Sub-Limits / Claim Process / Renewal / Risk Flags. Page citations link each finding to the source.",
      },
    ],
    faqs: [
      {
        q: "Is this insurance advice?",
        a: "No. The analyzer surfaces what the policy SAYS &mdash; it doesn&rsquo;t recommend whether to buy, switch, or claim. For product selection or claim disputes, consult an IRDAI-licensed advisor or insurance ombudsman. For tax / financial planning around insurance, a CA or financial planner is appropriate.",
      },
      {
        q: "Does it understand Indian policy types?",
        a: "Yes. Health (mediclaim, family floater, super top-up), life (term, ULIP, endowment, money-back), motor (own-damage + third-party + zero-dep + RTI), home, travel, term riders. Indian-specific concepts (NCB, sub-limits, room-rent capping, AYUSH coverage, OPD coverage) recognized.",
      },
      {
        q: "Will it catch hidden exclusions?",
        a: "Surfaces all exclusion clauses (pre-existing, specific procedures, waiting periods, room-rent capping, sub-limits per condition). The structured output makes the exclusions scannable in 2 minutes vs reading 40 pages of policy wording. Note: novel exclusions specific to a new policy may not be perfectly classified &mdash; treat the report as comprehensive, not exhaustive.",
      },
      {
        q: "Can it explain claim process?",
        a: "Surfaces the policy&rsquo;s stated claim process (cashless TPA / reimbursement / direct claim) and document requirements. For specific claim disputes (claim rejection, partial settlement), use the output to inform your discussion with the insurer / TPA / ombudsman &mdash; the analyzer doesn&rsquo;t adjudicate disputes.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per policy. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Policy sent to inference provider for analysis, not stored. For maximum confidentiality (especially health policies with disclosed conditions), redact policyholder name + medical-history declarations via Redact PDF first.",
      },
    ],
    cta: {
      title: "Have a hospital discharge to review too?",
      text: "Discharge Summary Simplifier rewrites Indian hospital discharge summaries in plain English &mdash; useful pre-claim to align the discharge content with the policy&rsquo;s coverage language.",
      linkHref: "/tool/ai-discharge",
      linkLabel: "Try Discharge Summary Simplifier",
    },
  },

  "ai-research-paper": {
    useCasesTitle: "Why people use Research Paper Summarizer",
    useCasesIntro:
      "Research papers are dense, structured artifacts &mdash; abstract / methods / results / discussion / limitations / refs. Generic summarization loses the structure. Research Paper Summarizer preserves it and adds: BibTeX citation, magnitude-preserving results section, related-reading suggestions, and how-to-cite examples in major styles. Useful for literature review and reading-list triage.",
    useCases: [
      {
        icon: "Book",
        title: "Literature review for thesis / dissertation",
        text: "Drop each paper in your reading list, get a structured summary preserving methodology + results + limitations. Faster than the &ldquo;read abstract, decide whether to read body&rdquo; loop, and the limitations section surfaces caveats abstracts hide.",
      },
      {
        icon: "Sparkle",
        title: "Pre-meeting paper triage",
        text: "Lab meetings and journal clubs often have 5+ assigned papers. Pre-read summaries surface the methodology and results so you arrive prepared without reading every paper cover-to-cover.",
      },
      {
        icon: "Pages",
        title: "Grant proposal background",
        text: "Grant applications require &ldquo;background literature&rdquo; sections that synthesize ~20 papers. The summarizer&rsquo;s structured output (with BibTeX) accelerates the synthesis. Pair with AI Citations for the formatted reference list.",
      },
      {
        icon: "Edit",
        title: "Cross-disciplinary research reading",
        text: "Reading outside your field is hard &mdash; methodologies and conventions differ. The summarizer preserves the doc&rsquo;s technical claims while making the structure scannable, helping you decide whether the paper&rsquo;s actually relevant to your work.",
      },
      {
        icon: "Compare",
        title: "Comparing related papers",
        text: "Run two papers on related topics through the summarizer, compare the structured outputs side-by-side. Methodologies, sample sizes, effect magnitudes are easier to compare in structured form than in prose.",
      },
    ],
    howWorksTitle: "How Research Paper Summarizer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the paper PDF",
        text: "PDF up to 100 MB. Works on standard journal-paper formats (one-column / two-column), conference papers, preprints (arXiv, bioRxiv, SSRN). Theses / books work but with less optimal structuring.",
      },
      {
        step: "2",
        title: "We structure + cite",
        text: "Server-side extraction (preserving section structure), then a structured summary pass. Numeric values (effect sizes, p-values, sample sizes) preserved verbatim. BibTeX citation generated from metadata. How-to-cite examples in APA / MLA / Chicago / IEEE.",
      },
      {
        step: "3",
        title: "Get a research-ready summary",
        text: "Markdown output with: BibTeX entry / Abstract / Methods / Results (magnitudes preserved) / Limitations / How-to-cite examples / Related-reading suggestions (from the paper&rsquo;s own references). Page citations link each section back to the source.",
      },
    ],
    faqs: [
      {
        q: "Are numbers preserved exactly?",
        a: "Yes &mdash; explicitly. Effect sizes, p-values, confidence intervals, sample sizes, odds ratios, hazard ratios all preserved verbatim. Misreporting numbers is the #1 risk in summarization of quantitative content; we benchmark and route to the model that does this best.",
      },
      {
        q: "Will it generate accurate BibTeX?",
        a: "Strong on standard journal articles (DOI present, structured metadata in PDF properties). Weaker on preprints with non-standard metadata or poorly-tagged PDFs. Verify the BibTeX before pasting into your bibliography &mdash; fields like author order, journal name, volume / issue / pages are common error spots.",
      },
      {
        q: "What about figures and tables?",
        a: "Summary references key figures and tables by their numbering (&ldquo;Table 2 reports&hellip;&rdquo;, &ldquo;Figure 3 shows&hellip;&rdquo;) but doesn&rsquo;t reproduce them. For papers where the figures carry the main result (e.g. epidemiology with risk-stratified curves), supplement with manual figure review.",
      },
      {
        q: "Will it suggest related reading?",
        a: "Yes &mdash; pulls 3&ndash;5 references from the paper&rsquo;s own bibliography that appear most central (cited multiple times, in methods and discussion). NOT a literature search beyond the paper itself; for that, use a tool like Connected Papers or Semantic Scholar.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per paper. Cost is fixed regardless of paper length.",
      },
      {
        q: "Will it catch the limitations section accurately?",
        a: "Yes &mdash; explicitly preserved. Most papers downplay limitations in the abstract; the summarizer surfaces them prominently. For papers that don&rsquo;t have a clear limitations section, the summarizer infers methodological caveats and flags them as &ldquo;inferred&rdquo;.",
      },
    ],
    cta: {
      title: "Building a citation list?",
      text: "AI Citations extracts citations and BibTeX from any PDF that references other works &mdash; useful for compiling a literature-review reference list across multiple source papers.",
      linkHref: "/tool/ai-citations",
      linkLabel: "Try AI Citations",
    },
  },

  "ai-salary-slip": {
    useCasesTitle: "Why people use Salary Slip Analyzer",
    useCasesIntro:
      "Indian salary slips have a fixed-but-varied structure: earnings (basic, HRA, special allowance, LTA, bonus) plus deductions (PF, professional tax, TDS, loan EMIs). Salary Slip Analyzer extracts all components into structured JSON with original component names preserved, so you can compare slips year-over-year or across employers without losing the original labeling.",
    useCases: [
      {
        icon: "Receipt",
        title: "Year-over-year comp tracking",
        text: "Run each month&rsquo;s slip through the analyzer, structured output goes into a spreadsheet. Real comp growth becomes visible (separating actual growth from inflation / role-change / variable-pay timing).",
      },
      {
        icon: "Compare",
        title: "Job-change comp comparison",
        text: "When comparing offers from multiple employers, run their slip samples through the analyzer to standardize the comparison. CTC pivots are misleading; component-level comparison reveals what actually hits in-hand monthly.",
      },
      {
        icon: "Edit",
        title: "Tax planning prep (year-end)",
        text: "Year-end tax planning needs accurate income breakdown. The analyzer extracts taxable / non-taxable components (HRA exemption, LTA, food coupons, professional development) so the CA has structured input rather than re-keying from PDF slips.",
      },
      {
        icon: "Pages",
        title: "Loan application income proof",
        text: "Lenders need 3 months of structured payslip data. The analyzer&rsquo;s output is loan-application ready &mdash; pairs with the Loan Application Bundler Audit for the full pre-submission check.",
      },
      {
        icon: "Sparkle",
        title: "ITR (Form 16 vs slips reconciliation)",
        text: "Filing ITR requires slip components reconciled with Form 16. The structured output makes the reconciliation a one-pass verification &mdash; faster than month-by-month manual cross-check.",
      },
    ],
    howWorksTitle: "How Salary Slip Analyzer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the slip PDF",
        text: "PDF up to 25 MB. Works on Indian payslip formats (most ESS portal exports, payroll-vendor formats, paper slips that have been scanned and OCR&rsquo;d).",
      },
      {
        step: "2",
        title: "We extract + structure",
        text: "Server-side extraction (OCR if needed), then structured parsing. Earnings components (basic, HRA, allowances, bonus, retention pay, variable pay) and deductions (PF, ESI, P-tax, TDS, voluntary deductions) extracted with original component names preserved &mdash; critical for YoY comparison where employers occasionally rename components.",
      },
      {
        step: "3",
        title: "Get JSON output",
        text: "Structured JSON: earnings breakdown / deductions breakdown / net pay / YTD totals. Original component names preserved (no canonicalization that would lose information). Importable into spreadsheets for tracking.",
      },
    ],
    faqs: [
      {
        q: "Why preserve original component names instead of canonicalizing?",
        a: "Indian employers vary wildly in naming (&ldquo;Special Allowance&rdquo; / &ldquo;Performance Allowance&rdquo; / &ldquo;Variable Pay&rdquo; / &ldquo;Adhoc Allowance&rdquo; can all be the same component or different). Canonicalizing into &ldquo;allowance&rdquo; loses the distinction. Preserving names lets you compare YoY meaningfully &mdash; if your &ldquo;Special Allowance&rdquo; renamed to &ldquo;Variable Pay&rdquo; mid-year, that&rsquo;s a real signal worth keeping.",
      },
      {
        q: "Does it calculate tax?",
        a: "Surfaces the TDS deducted but doesn&rsquo;t calculate optimal tax structure or recommend regime selection. For tax planning (old vs new regime, exemption planning, investment-driven deductions), use a CA or a tax-planning tool that takes the full picture (other income, deductions claimed, etc.).",
      },
      {
        q: "Will it work for non-Indian payslips?",
        a: "Indian slips primarily. US W-2 / paystubs, UK payslips, EU payslips work approximately but the component-classification heuristic is India-trained &mdash; results are less calibrated for other jurisdictions.",
      },
      {
        q: "What about Form 16 / ITR documents?",
        a: "Form 16 is structurally different (annual aggregate, not monthly slip). Drop a Form 16 and you&rsquo;ll get a partial parse but not the full slip-level granularity. For ITR document analysis, dedicated tax tools are a better fit; this analyzer focuses on monthly slips.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per slip. Cost is fixed regardless of slip size.",
      },
      {
        q: "Privacy?",
        a: "Slip sent to inference provider for parsing, not stored. For maximum confidentiality (especially when sharing the structured output for loan applications or tax planning), redact PAN / Aadhaar / bank account numbers via Redact PDF first &mdash; the structural parse still works on the redacted slip.",
      },
    ],
    cta: {
      title: "Preparing a loan application?",
      text: "Loan Application Bundler Audit verifies your loan documentation against the lender&rsquo;s typical checklist &mdash; useful after the salary slip analysis for the &ldquo;ready to submit?&rdquo; check.",
      linkHref: "/tool/ai-loan-bundle",
      linkLabel: "Try Loan Bundler Audit",
    },
  },

  "ai-ats-resume": {
    useCasesTitle: "Why people use ATS Resume Optimizer",
    useCasesIntro:
      "Most large companies route resumes through an ATS (Workday, Greenhouse, Lever, iCIMS, Naukri, Monster) before a human ever sees them. The optimizer audits ATS-friendliness: format compatibility (parseable layout), keyword density (matches the JD&rsquo;s vocabulary), section ordering (recognized headers), and concrete fixes. Pairs with the JD Matcher for end-to-end job-application tuning.",
    useCases: [
      {
        icon: "User",
        title: "Pre-application resume tune",
        text: "Drop your current resume + (optionally) the JD, get format / keyword / structure audit with concrete fixes. Resolves the &ldquo;why am I not getting interviews despite qualifications?&rdquo; question by surfacing ATS-side failures invisible to humans.",
      },
      {
        icon: "Compare",
        title: "Format conversion check",
        text: "Convert your design-heavy Canva / InDesign resume to ATS-friendly format. The optimizer surfaces what to extract from sidebars, what to rewrite as plain text, what to reformat &mdash; all without losing content.",
      },
      {
        icon: "Edit",
        title: "Career change rewriting",
        text: "Switching industries means your existing resume keywords don&rsquo;t match new-industry JDs. The optimizer (with target JD provided) surfaces vocabulary translation needed.",
      },
      {
        icon: "Sparkle",
        title: "Senior-level resume audit",
        text: "Senior roles use search-heavy ATSs that prioritize specific keywords (&ldquo;P&L responsibility&rdquo;, &ldquo;org of N&rdquo;, &ldquo;stakeholder management&rdquo;). The optimizer surfaces gaps even on resumes that look great to humans.",
      },
      {
        icon: "Shield",
        title: "Recruiter pre-screen prep",
        text: "Recruiters and career coaches use the optimizer to advise candidates on what to fix before the application. The structured fix list is more actionable than abstract feedback.",
      },
    ],
    howWorksTitle: "How ATS Resume Optimizer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the resume PDF",
        text: "PDF up to 25 MB. JD paste optional but recommended &mdash; with JD, audit becomes JD-targeted. Without, audit is generic-ATS readiness.",
      },
      {
        step: "2",
        title: "We audit format + content",
        text: "Format check: parseable layout (single-column wins; sidebars / multi-column lose), recognized section headers (EXPERIENCE / EDUCATION / SKILLS), font and graphic checks. Content check: keyword density (vs JD if provided), achievement-vs-responsibility framing, quantified impact.",
      },
      {
        step: "3",
        title: "Get a structured fix list",
        text: "Markdown output with: format issues / content issues / keyword gaps (if JD provided) / concrete fixes. Each fix has rationale (&ldquo;ATSs often skip sidebars; move skills to main flow&rdquo;) and severity (low / medium / high).",
      },
    ],
    faqs: [
      {
        q: "Will the fixes work for all ATSs?",
        a: "Generic ATS-friendliness covers ~90% of cases. Specific ATSs have minor quirks (Workday handles some formats Greenhouse doesn&rsquo;t). The optimizer&rsquo;s fixes are conservative &mdash; if your resume passes our audit, it almost certainly parses correctly across the major ATSs.",
      },
      {
        q: "Should I keyword-stuff to match the JD?",
        a: "No. Keyword stuffing is detectable (modern ATSs penalize density-without-context). Aim for natural keyword integration: if the JD says &ldquo;stakeholder management&rdquo;, describe a real instance of that. If you can&rsquo;t, the role isn&rsquo;t a fit.",
      },
      {
        q: "What about Indian-specific ATS systems (Naukri, Monster, Foundit)?",
        a: "Indian ATSs use slightly different vocabulary (CTC / notice period / primary skills / secondary skills). The optimizer recognizes these conventions and flags missing fields appropriately. Indian-specific resume formats (one-page vs detailed three-page tradition) noted in the format check.",
      },
      {
        q: "Will it improve the quantified-achievement framing?",
        a: "Surfaces sections where claims could be quantified (&ldquo;led team&rdquo; vs &ldquo;led team of 8&rdquo;, &ldquo;improved performance&rdquo; vs &ldquo;improved performance by 30%&rdquo;). Doesn&rsquo;t fabricate numbers &mdash; you provide them. The optimizer just surfaces the opportunities.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per audit. Cost is fixed regardless of resume length.",
      },
      {
        q: "Privacy?",
        a: "Resume sent to inference provider for audit, not stored. For confidential job searches (especially when employed currently and not wanting current employer to see leaked drafts), redact name + current employer via Redact PDF first.",
      },
    ],
    cta: {
      title: "Need to score against a specific JD?",
      text: "Resume &harr; JD Matcher gives you a fit percentage + per-requirement alignment table. Use it after the ATS audit to verify the optimized resume actually matches the target role.",
      linkHref: "/tool/ai-jd-match",
      linkLabel: "Try Resume ↔ JD Matcher",
    },
  },

  // =====================================================================
  // 2026-05-01 — Phase 2 AI longform Tier 4 (14 tools — final batch)
  //
  // Variants of summarization / structured-extraction / transformation,
  // plus three special-cost ops (ai-generate at 20 credits, ai-sign at
  // 10, ai-searchable-pdf at 2 credits/page). Each entry maintains the
  // editorial bar set by Tiers 1-3 and the original 12.
  //
  // After this commit, KNOWN_AI_LONGFORM_PENDING shrinks from 14 → 0
  // and Phase 2 longform standardization is complete: all 39 grand-
  // fathered AI tools now have full longform marketing blocks.
  // =====================================================================

  "ai-condense": {
    useCasesTitle: "Why people use Condense PDF",
    useCasesIntro:
      "Condense PDF cuts 40&ndash;60% of a document&rsquo;s length while keeping every fact and conclusion intact. Different from summarize (which restructures into a digest) or improve-writing (which tightens 20&ndash;30%): condense is aggressive shortening that preserves the doc&rsquo;s shape and substance.",
    useCases: [
      {
        icon: "Pages",
        title: "Length-constrained submission",
        text: "Op-eds with 1500-word limits, conference papers with strict page caps, application essays with character limits. Drop the over-length draft, get a tighter version that respects the constraint while preserving the argument.",
      },
      {
        icon: "Edit",
        title: "Email-thread digest from long doc",
        text: "Long internal docs (project briefs, post-mortems, RFC drafts) shared as email summaries. Condense produces the 40% version that fits in an email body without losing the substance.",
      },
      {
        icon: "Sparkle",
        title: "Verbose draft tightening",
        text: "Drafts that sprawled past their useful length &mdash; common with first-pass writing. Condense brings the doc back to a publishable length without you needing to do the painful self-editing pass.",
      },
      {
        icon: "Book",
        title: "Lecture notes &rarr; revision sheet",
        text: "Detailed lecture notes condensed to revision-sheet length (one page per topic). Useful for exam prep where the full notes are too long to scan during revision.",
      },
      {
        icon: "Shield",
        title: "Verbose policy doc shortening",
        text: "Internal policy docs that ballooned over revisions. Condense produces the version that&rsquo;s actually readable without losing the policy specifics.",
      },
    ],
    howWorksTitle: "How Condense PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on prose-heavy content; structured tables / code blocks pass through unchanged.",
      },
      {
        step: "2",
        title: "We rewrite shorter",
        text: "Server-side extraction, then a constrained rewrite that targets 40&ndash;60% length reduction. Every numeric value, named entity, and factual claim preserved verbatim. Repetition collapsed, transitions tightened, examples consolidated. Routing layer picks the model best at preservation-during-aggressive-cut.",
      },
      {
        step: "3",
        title: "Get the shorter version",
        text: "Markdown output, typically 50% of input length. Page citations link each condensed section back to the source for verification.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI Summarize or Improve Writing?",
        a: "Summarize restructures into a digest format (different shape than source). Improve Writing tightens 20&ndash;30% while preserving everything. Condense is aggressive 40&ndash;60% shortening preserving doc shape. Pick based on output goal: digest = summarize, polish = improve writing, aggressive cut = condense.",
      },
      {
        q: "Are numbers and names preserved?",
        a: "Yes &mdash; explicitly. Every numeric value, percentage, date, currency amount, name, and proper noun preserved verbatim. Aggressive shortening creates risk of meaning drift; we prioritize preservation of factual anchors.",
      },
      {
        q: "What if 60% feels too aggressive?",
        a: "Re-run; the model is non-deterministic so re-runs vary length within the 40&ndash;60% target band. For explicit length control (&ldquo;exactly 1500 words&rdquo;), trim manually after &mdash; the condensed output is a 60-90% complete starting point, not the final cut.",
      },
      {
        q: "Will it preserve structure?",
        a: "Headings + list structure preserved. Within sections, paragraphs may consolidate (two short paragraphs &rarr; one tighter one) but the doc&rsquo;s skeleton stays.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the condense changes meaning?",
        a: "Possible with aggressive cuts. Read the output before relying on it &mdash; page citations make spot-checking easy. For high-stakes content (legal, medical, technical specs), treat as a draft for human review, not a final cut.",
      },
    ],
    cta: {
      title: "Need the opposite (more depth)?",
      text: "Expand PDF elaborates each bullet / sentence into fuller paragraphs with source-grounded context. Useful for converting a tight draft into a longer-form treatment.",
      linkHref: "/tool/ai-expand",
      linkLabel: "Try Expand PDF",
    },
  },

  "ai-expand": {
    useCasesTitle: "Why people use Expand PDF",
    useCasesIntro:
      "Expand PDF turns concise material (bullets, outlines, terse drafts) into fuller prose with source-grounded context. Each idea gets the elaboration it needs without inventing claims that aren&rsquo;t in the source. Useful when the goal is converting a skeleton into a full draft.",
    useCases: [
      {
        icon: "Pages",
        title: "Outline &rarr; full draft",
        text: "Article / chapter / report outlines (bullets with sub-bullets) become full prose drafts. Each outline point gets context, examples, and transitions &mdash; faster than the &ldquo;sit down and write&rdquo; phase that&rsquo;s the slowest part of long-form writing.",
      },
      {
        icon: "Edit",
        title: "Bullet-list expansion for stakeholder-facing docs",
        text: "Internal bullet-list briefs (engineering design docs, status updates) get expanded into stakeholder-friendly prose. Stakeholders find prose more digestible than dense bullet lists.",
      },
      {
        icon: "Sparkle",
        title: "Slide deck &rarr; speaker-notes script",
        text: "Slides with bullet content + speaker notes get the speaker-notes filled out into spoken prose. Useful for talk prep where you have the structure but haven&rsquo;t written what you&rsquo;ll actually say.",
      },
      {
        icon: "Book",
        title: "Skeleton spec &rarr; full PRD",
        text: "Engineering skeleton (problem / proposed solution bullet list) expanded into a full PRD with rationale, alternatives considered, and risk discussion. The expansion grounds in source material rather than fabricating.",
      },
      {
        icon: "Shield",
        title: "Brief &rarr; full proposal",
        text: "Sales / RFP responses where you have a brief and need to expand into a 10-page formal proposal. Expand provides the structural draft to refine.",
      },
    ],
    howWorksTitle: "How Expand PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on bullet-heavy outlines, terse drafts, skeleton documents. Prose-heavy content already at full length expands less.",
      },
      {
        step: "2",
        title: "We elaborate per item",
        text: "Server-side extraction, then a generation pass that elaborates each bullet / point into fuller prose. Constrained to source-grounded content &mdash; no fabricated claims, just contextualization of what&rsquo;s already there. Routing layer picks the model best at constrained generation.",
      },
      {
        step: "3",
        title: "Get the expanded draft",
        text: "Markdown output, typically 1.5&ndash;2.5x input length. Page citations link each expanded section back to the source so you can verify the expansion stayed grounded.",
      },
    ],
    faqs: [
      {
        q: "Will it fabricate claims?",
        a: "Constrained against fabrication &mdash; the expansion is supposed to elaborate what&rsquo;s in the source, not invent new claims. Spot-check the output anyway: page citations make verification fast, and for high-stakes content (legal, regulatory) treat the expansion as a draft for source-grounding review.",
      },
      {
        q: "How much longer is the output?",
        a: "Typically 1.5&ndash;2.5x input length. Highly compressed input (one-line bullets) can expand 3x; already-expanded prose may grow only 1.2x. For explicit length targeting, expand then condense to your target.",
      },
      {
        q: "Will it preserve my voice?",
        a: "The expansion uses register-matching: if your bullets are casual, the prose stays casual; if they&rsquo;re formal, expansion is formal. Brand-specific voice is partial &mdash; provide example expansions as context for closer brand match (feature on roadmap).",
      },
      {
        q: "Does it add examples?",
        a: "Adds illustrative context where the source implies it (e.g. &ldquo;various stakeholders&rdquo; &rarr; &ldquo;various stakeholders such as engineering, product, and customer success&rdquo;). Doesn&rsquo;t fabricate specific company / product examples that aren&rsquo;t in the source.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What if the expansion is too verbose?",
        a: "Run AI Improve Writing or AI Condense on the output &mdash; that&rsquo;s the explicit length-tightening tool. Expand-then-condense is a valid 2-step workflow when the goal is &ldquo;more thorough than my outline but tighter than the raw expansion.&rdquo;",
      },
    ],
    cta: {
      title: "Need the opposite (less length)?",
      text: "Condense PDF cuts 40&ndash;60% while preserving facts. The natural counterpart to Expand for length adjustment in either direction.",
      linkHref: "/tool/ai-condense",
      linkLabel: "Try Condense PDF",
    },
  },

  "ai-tone-analyze": {
    useCasesTitle: "Why people use Tone & Style Analyzer",
    useCasesIntro:
      "Tone & Style Analyzer reports a doc&rsquo;s voice (authoritative / collaborative / didactic / etc.), intended audience, and 6&ndash;10 style attributes (sentence-length distribution, use of jargon, register, emphasis style). Useful for the &ldquo;does this sound right?&rdquo; pre-publication audit. The analyzer reports &mdash; it doesn&rsquo;t rewrite.",
    useCases: [
      {
        icon: "Compare",
        title: "Brand voice consistency check",
        text: "Run multiple pieces of content through the analyzer to verify consistent voice across the team. Useful for content teams scaling output where voice drift is a real risk.",
      },
      {
        icon: "Edit",
        title: "Pre-rewrite tone audit",
        text: "Before running AI Rewrite to shift tone, the analyzer surfaces what the current tone IS. Useful for the &ldquo;is this too formal? Too casual? Both?&rdquo; question that&rsquo;s easier to answer with structured data than gut check.",
      },
      {
        icon: "Pages",
        title: "Multi-author harmonization audit",
        text: "When several authors contribute to one doc, voice drifts. The analyzer surfaces the inconsistency (Section 1 = formal-authoritative, Section 3 = casual-collaborative) so the editor knows what to harmonize.",
      },
      {
        icon: "Sparkle",
        title: "Audience-fit verification",
        text: "Drafts aimed at a specific audience (technical decision-maker, casual end-user, regulatory reviewer) audited for register fit. Surfaces mismatches the writer didn&rsquo;t notice.",
      },
      {
        icon: "Shield",
        title: "Brand-voice training corpus building",
        text: "When building a brand-voice style guide, run your best examples through the analyzer to articulate (in concrete attributes) what makes them on-brand. The output is the descriptive baseline for the guide.",
      },
    ],
    howWorksTitle: "How Tone & Style Analyzer works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on prose &mdash; reports, articles, marketing copy, internal docs.",
      },
      {
        step: "2",
        title: "We measure + describe",
        text: "Server-side text extraction, then attribute analysis: voice classification, audience inference, sentence-length distribution, jargon density, formality score, emphasis style (italics / bold / caps usage), passive-vs-active ratio, sentence-opening variety.",
      },
      {
        step: "3",
        title: "Get a structured report",
        text: "Markdown output: overall voice / audience / 6&ndash;10 style attributes with values + observations. NOT a rewrite &mdash; the report tells you what the doc IS, not what it should be. Use AI Rewrite or Improve Writing for the actual rewriting.",
      },
    ],
    faqs: [
      {
        q: "Why doesn&rsquo;t it rewrite the doc?",
        a: "Separation of concerns: the analyzer measures, the rewriter changes. Combined tools tend to produce confused output where the user can&rsquo;t tell what was diagnostic vs prescriptive. The 2-tool workflow (analyze, then optionally rewrite) is more controllable.",
      },
      {
        q: "What attributes does it measure?",
        a: "6&ndash;10 attributes including: voice (authoritative / collaborative / instructional / journalistic etc.), audience inference, sentence-length distribution, jargon density, formality, emphasis style, passive-vs-active ratio, sentence-opening variety, contractions usage, second-person address frequency.",
      },
      {
        q: "Will it identify my brand voice?",
        a: "Generic tone categorization, not brand-specific. To match against your brand voice, run multiple on-brand examples and observe the consistent attribute pattern &mdash; that pattern is your operational definition of brand voice.",
      },
      {
        q: "Can it tell tone shift mid-document?",
        a: "Surfaces register-shift observations (&ldquo;Section 1-3 are formal-authoritative; Section 4 shifts to casual-conversational&rdquo;). Useful for catching unintentional voice drift in long docs.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "Will it suggest a target tone?",
        a: "Reports current state &mdash; doesn&rsquo;t prescribe target. For target voice, you (or your style guide) define what fits the audience. The analyzer pairs with AI Rewrite (which DOES take a target voice) for the analyze-then-rewrite workflow.",
      },
    ],
    cta: {
      title: "Want to actually shift the tone?",
      text: "AI Rewrite changes tone (formal &harr; casual), register (technical &harr; layperson), or length while preserving facts. The natural next step after the tone audit identifies what to shift.",
      linkHref: "/tool/ai-rewrite",
      linkLabel: "Try AI Rewrite",
    },
  },

  "ai-citations": {
    useCasesTitle: "Why people use Extract Citations (BibTeX)",
    useCasesIntro:
      "Citation extraction surfaces every reference in a PDF as a BibTeX block (importable into LaTeX / Zotero / Mendeley) plus a readable reference list. Useful for literature review, bibliography building, and verification of cited sources.",
    useCases: [
      {
        icon: "Book",
        title: "Literature review reference compilation",
        text: "Run each paper in your reading list through the extractor, accumulate citations into a single BibTeX file. Faster than manual entry and avoids the typo-in-DOI errors that plague hand-built bibliographies.",
      },
      {
        icon: "Pages",
        title: "Thesis bibliography building",
        text: "Theses cite hundreds of sources. The extractor pulls citations from each cited PDF&rsquo;s own reference list, building a candidate bibliography for your own thesis. You still curate which to actually cite, but the data-entry step is automated.",
      },
      {
        icon: "Sparkle",
        title: "Citation verification",
        text: "Verify the citations in your own draft by comparing the extracted list with what you actually cited. Surfaces missing references or formatting errors before submission.",
      },
      {
        icon: "Edit",
        title: "Format conversion (e.g. APA &rarr; BibTeX)",
        text: "Documents with reference lists in non-BibTeX format (APA, MLA, Chicago, Vancouver) get extracted into BibTeX. Useful when migrating an old paper&rsquo;s bibliography into a new project.",
      },
      {
        icon: "Compare",
        title: "Reference overlap analysis",
        text: "Run two papers&rsquo; extractors, compare the BibTeX outputs to surface citation overlap. Useful for understanding intellectual lineage and shared sources across related work.",
      },
    ],
    howWorksTitle: "How Extract Citations works",
    howWorks: [
      {
        step: "1",
        title: "Drop the source PDF",
        text: "PDF up to 100 MB. Works on academic papers, theses, books, and any doc with a structured reference list.",
      },
      {
        step: "2",
        title: "We extract + format",
        text: "Server-side text extraction (with reference-list section detection), then per-citation parsing into BibTeX entries. Author / year / title / journal / volume / issue / pages / DOI populated from the reference text plus any embedded metadata.",
      },
      {
        step: "3",
        title: "Get BibTeX + readable list",
        text: "Output: BibTeX block (paste into your .bib file directly) AND a human-readable reference list (paste into a Notion / Markdown doc). Page citation indicates where each reference appeared in the source.",
      },
    ],
    faqs: [
      {
        q: "Are the BibTeX entries correct?",
        a: "Strong on standard journal-article references with embedded DOIs. Weaker on books / preprints / non-English sources / older formats with non-standard structure. Verify the BibTeX before submission &mdash; common errors are author-order swaps and journal name abbreviations.",
      },
      {
        q: "Will it work for non-academic citations?",
        a: "Best on academic-style references (Author, Year, Title, Journal/Publisher). Trade-press citations / blog citations / web citations parse but the BibTeX entry types map imperfectly (everything becomes &ldquo;@misc&rdquo; if structure is unclear). For grey-literature heavy bibliographies, expect manual cleanup.",
      },
      {
        q: "Does it dedupe references across multiple PDFs?",
        a: "Per-PDF extraction by default. For cross-doc deduplication, run each extractor and merge the BibTeX outputs in your reference manager (Zotero / Mendeley both deduplicate on import).",
      },
      {
        q: "Will it output in styles other than BibTeX?",
        a: "BibTeX (most universal for LaTeX) plus a readable reference list. Other styles (RIS for EndNote, APA / MLA / Chicago formatted) on the roadmap. For now, import the BibTeX into Zotero / Mendeley and export to your target format.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of reference count.",
      },
      {
        q: "What if a citation is missing from the output?",
        a: "Common causes: footnote-style citations (not in a reference list), in-line URL references, citations to personal communication. The extractor focuses on structured reference lists; non-list citations may not be captured. Manually add those as needed.",
      },
    ],
    cta: {
      title: "Researching multiple papers?",
      text: "Research Paper Summarizer generates structured summaries with embedded BibTeX from each paper &mdash; useful when you need both the citation AND the content distilled.",
      linkHref: "/tool/ai-research-paper",
      linkLabel: "Try Research Paper Summarizer",
    },
  },

  "ai-sentiment": {
    useCasesTitle: "Why people use Sentiment Analysis",
    useCasesIntro:
      "Sentiment Analysis reports overall sentiment (positive / negative / neutral / mixed) plus per-section sentiment with evidence and shifts. Useful for analyzing reviews, customer feedback, internal communication tone, and document emotional arc.",
    useCases: [
      {
        icon: "Compare",
        title: "Customer review / NPS analysis",
        text: "Drop a stack of customer feedback (compiled into one PDF), get per-section sentiment with evidence quotes. Faster than reading every review, and the section-by-section breakdown surfaces patterns hand-coding would miss.",
      },
      {
        icon: "Pages",
        title: "Internal email / chat thread tone",
        text: "When a thread escalates or de-escalates, sentiment-by-section surfaces the inflection points. Useful for HR / management reviewing communication patterns in conflict situations.",
      },
      {
        icon: "Sparkle",
        title: "Press / coverage sentiment",
        text: "Industry coverage (analyst reports, press releases, social media archives) analyzed for sentiment toward your company / product. Useful for the &ldquo;how are we landing?&rdquo; communication audit.",
      },
      {
        icon: "Book",
        title: "Document emotional arc",
        text: "Long-form content (memoirs, narrative non-fiction, reports) mapped for sentiment progression. Useful for editorial review where pacing matters &mdash; if sentiment is monotone for 200 pages, the reader experience flatlines.",
      },
      {
        icon: "Shield",
        title: "Survey / interview qualitative coding",
        text: "Open-ended survey responses or interview transcripts compiled and analyzed. Replaces manual sentiment-coding for first-pass analysis; researchers verify a sample for confidence.",
      },
    ],
    howWorksTitle: "How Sentiment Analysis works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on prose &mdash; reviews, threads, feedback compilations, narrative content.",
      },
      {
        step: "2",
        title: "We score + locate evidence",
        text: "Server-side extraction, then per-paragraph and per-section sentiment scoring. Evidence quotes pulled for each sentiment verdict. Sentiment shifts (positive &rarr; negative inflections) surfaced with the trigger sentence.",
      },
      {
        step: "3",
        title: "Get a structured report",
        text: "Markdown output with: overall verdict / per-section verdicts / evidence quotes / sentiment shifts / trigger phrases. Page citations on every finding.",
      },
    ],
    faqs: [
      {
        q: "How accurate is sentiment classification?",
        a: "Strong on clearly polarized content (reviews, opinions). Weaker on neutral / ambiguous content (technical docs, factual reporting) where sentiment isn&rsquo;t the doc&rsquo;s point. Sarcasm / irony are detection challenges &mdash; treat the score as directional.",
      },
      {
        q: "Will it work for non-English content?",
        a: "Best results in English. Indian-language sentiment (Hindi, Tamil, Bengali) works at lower accuracy &mdash; sentiment lexicons are English-trained and translated. For multilingual feedback analysis, run AI Translate first, then sentiment.",
      },
      {
        q: "Does it understand context-dependent sentiment?",
        a: "Tries &mdash; e.g. &ldquo;the queue was long but the food was great&rdquo; surfaces both negative (queue) and positive (food) sentiment with the right targets. Mixed sentiment is reported as such, not flattened to neutral.",
      },
      {
        q: "Can it identify what&rsquo;s causing the sentiment?",
        a: "Surfaces evidence quotes with each sentiment verdict, so you can see WHY the model called it positive / negative. The cause analysis isn&rsquo;t formal aspect-based sentiment (which would need topic clustering) &mdash; for that, pair with Extract Entities for who-is-mentioned.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "What about doc length limits?",
        a: "Long docs (200+ pages) chunk and process per-chunk. Each chunk gets its own sentiment scoring; the final report aggregates with the section structure preserved.",
      },
    ],
    cta: {
      title: "Need the entities mentioned too?",
      text: "Extract Entities surfaces people / organizations / places / dates from the same doc. Pairs with sentiment analysis for the &ldquo;what&rsquo;s being said about whom&rdquo; analysis.",
      linkHref: "/tool/ai-entities",
      linkLabel: "Try Extract Entities",
    },
  },

  "ai-bias": {
    useCasesTitle: "Why people use Inclusive Language Audit",
    useCasesIntro:
      "Inclusive Language Audit flags gendered language (mankind, manpower, chairman), outdated terminology (master/slave, blacklist/whitelist), and stereotyping language with concrete suggested fixes. Heuristic only &mdash; the audit catches obvious patterns, not all bias. Useful as a pre-publication pass for inclusive-language standards.",
    useCases: [
      {
        icon: "Shield",
        title: "Pre-publication content audit",
        text: "Articles, marketing copy, internal docs audited for inclusive language standards before publication. Catches the obvious gendered defaults (&ldquo;chairman&rdquo;, &ldquo;manpower&rdquo;) that have neutral alternatives (&ldquo;chair&rdquo;, &ldquo;workforce&rdquo;).",
      },
      {
        icon: "Edit",
        title: "Legacy doc modernization",
        text: "Older docs (style guides, internal handbooks, technical specs) frequently use outdated terminology. The audit surfaces what to update during a refresh pass.",
      },
      {
        icon: "Pages",
        title: "Hiring / job-description review",
        text: "Job descriptions are a known site for biased language (&ldquo;rockstar&rdquo;, &ldquo;ninja&rdquo;, &ldquo;competitive&rdquo; vs &ldquo;collaborative&rdquo; signals). Audit before posting to widen candidate pool.",
      },
      {
        icon: "Sparkle",
        title: "Educational content review",
        text: "Course materials, textbooks, training docs audited for inclusive language &mdash; especially important for content that reaches diverse student populations.",
      },
      {
        icon: "Book",
        title: "Brand-voice inclusion check",
        text: "When evolving a brand voice, the audit verifies updates didn&rsquo;t miss the harder-to-spot patterns (gendered metaphors, ability-based metaphors like &ldquo;crippled&rdquo; / &ldquo;blind to&rdquo;).",
      },
    ],
    howWorksTitle: "How Inclusive Language Audit works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on any prose &mdash; articles, JDs, course materials, internal docs, marketing copy.",
      },
      {
        step: "2",
        title: "We scan + classify",
        text: "Server-side extraction, then a multi-pattern scan: gendered language (he-default, gendered role nouns), outdated terminology (problematic metaphors, slurs in older texts), stereotyping (gendered profession defaults), accessibility-aware language. Each flag classified by category and severity.",
      },
      {
        step: "3",
        title: "Get a structured fix list",
        text: "Markdown table: page / quote / issue category / suggested fix. Each fix has rationale (&ldquo;'manpower' &rarr; 'workforce' or 'staff' &mdash; gender-neutral alternative is widely used&rdquo;). Sorted by page for linear review.",
      },
    ],
    faqs: [
      {
        q: "Is this comprehensive?",
        a: "No. The audit catches obvious patterns (lexical / template-based). It does NOT catch subtle bias (rhetorical framing, what&rsquo;s included vs excluded, who&rsquo;s named vs anonymized). For comprehensive inclusion review, treat the audit as a baseline catch and supplement with human reviewer.",
      },
      {
        q: "Will it work in Indian-English context?",
        a: "Yes &mdash; Indian-English specific patterns recognized (caste-coded language, region-coded stereotyping, English-with-Indian-conventions). Note: Indian-language content (Hindi, Tamil, etc.) has its own bias-language patterns we don&rsquo;t audit yet &mdash; English content only for now.",
      },
      {
        q: "What categories of issues does it cover?",
        a: "Gendered language (he-default, role-noun gendering), outdated technical terminology (master/slave, blacklist/whitelist, sanity-check &mdash; all flagged with suggested replacements that have industry adoption), ability-based metaphors, age-coded language. Full taxonomy on the roadmap to publish.",
      },
      {
        q: "Should I accept every fix?",
        a: "No. Some flags are false positives (e.g. &ldquo;mankind&rdquo; in a quote vs in your own writing &mdash; the audit may not distinguish). Some suggestions don&rsquo;t fit the doc&rsquo;s register. Treat the table as a list of things to consider, not a list of things to apply.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Doc sent to inference provider for the scan, not stored. For confidential drafts, redact author names and project codenames via Redact PDF first if needed.",
      },
    ],
    cta: {
      title: "Want to fix the writing too?",
      text: "AI Improve Writing tightens prose for clarity and concision &mdash; useful as the next pass after the inclusive-language audit, for an overall polish.",
      linkHref: "/tool/ai-improve-writing",
      linkLabel: "Try AI Improve Writing",
    },
  },

  "ai-entities": {
    useCasesTitle: "Why people use Extract Entities",
    useCasesIntro:
      "Extract Entities surfaces every named person / organization / place / date from a PDF as four structured tables with page citations. Useful for due diligence, legal discovery, news article analysis, research paper coverage maps, and contract review.",
    useCases: [
      {
        icon: "Search",
        title: "Due diligence on a company / individual",
        text: "Drop a stack of docs (annual reports, news clips, court filings) for a person / company under DD. Get every named connection extracted &mdash; faster than manual highlighting and the structured tables surface relationship patterns.",
      },
      {
        icon: "Shield",
        title: "Legal discovery / e-discovery",
        text: "Litigation docs (emails, contracts, memos) entity-extracted for relationship mapping. Useful for the &ldquo;who knew what when&rdquo; analysis where dates + named individuals matter.",
      },
      {
        icon: "Pages",
        title: "News / media coverage map",
        text: "When a news story develops over weeks (multiple articles compiled into one PDF), entity extraction surfaces who&rsquo;s appeared in coverage, where, and when. Useful for journalists and analysts tracking complex stories.",
      },
      {
        icon: "Sparkle",
        title: "Research paper coverage map",
        text: "What organizations / institutions / authors are cited / acknowledged in a paper. Surfaces collaboration networks and funding relationships beyond the formal author list.",
      },
      {
        icon: "Edit",
        title: "Contract / commitment tracking",
        text: "Long contracts mention multiple parties, dates, and locations. The structured extraction makes it scannable &mdash; useful for the &ldquo;when does X happen&rdquo; / &ldquo;who&rsquo;s liable for Y&rdquo; questions during contract administration.",
      },
    ],
    howWorksTitle: "How Extract Entities works",
    howWorks: [
      {
        step: "1",
        title: "Drop the doc",
        text: "PDF up to 100 MB. Works on any prose &mdash; reports, articles, contracts, emails, transcripts.",
      },
      {
        step: "2",
        title: "We classify + dedupe",
        text: "Server-side extraction, then named-entity-recognition pass classifying mentions into four categories: people, organizations, places, dates. Mentions deduplicated (Mr Sharma / Sharma / Sushil Sharma collapsed when context confirms identity). Page citation on every mention.",
      },
      {
        step: "3",
        title: "Get four tables",
        text: "Markdown tables: PEOPLE / ORGANIZATIONS / PLACES / DATES. Each row: canonical name / mention count / first-page / last-page / sample-context. CSV export for further analysis (Excel, Power BI, etc.).",
      },
    ],
    faqs: [
      {
        q: "How accurate is the dedup?",
        a: "Strong on unambiguous names (Mr Sharma + first reference to Sushil Sharma in same paragraph &rarr; same person). Weaker when names overlap (two people named Sharma in different contexts). Manual review of the dedupe column catches false merges.",
      },
      {
        q: "Will it work for Indian names?",
        a: "Yes &mdash; Indian naming conventions (single names, multi-part regional names, surname-first vs surname-last patterns) recognized. Typical Indian organizations (Reliance, TCS, Infosys, Tata, Adani, HDFC, ICICI etc.) pre-recognized to improve dedup.",
      },
      {
        q: "Does it identify relationships between entities?",
        a: "Surfaces co-occurrence (X and Y mentioned in same context) but doesn&rsquo;t formally classify the relationship (employer / partner / counterparty). For relationship classification, supplement with manual analysis or a graph-database tool.",
      },
      {
        q: "What about places &mdash; will it handle Indian regions?",
        a: "Indian states, cities, and regions recognized. Smaller localities (towns, neighborhoods) may be classified imperfectly &mdash; the model&rsquo;s knowledge of Indian micro-geography degrades below the city level.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of doc size.",
      },
      {
        q: "Privacy?",
        a: "Doc sent to inference provider for entity extraction, not stored. For sensitive entity-rich docs (DD reports, legal filings), redact metadata via Redact PDF first if needed; structural extraction works on the redacted version.",
      },
    ],
    cta: {
      title: "Want to know how the entities are talked about?",
      text: "Sentiment Analysis classifies sentiment per-section with evidence quotes. Pairs naturally with entity extraction for the &ldquo;who&rsquo;s being talked about and how&rdquo; analysis.",
      linkHref: "/tool/ai-sentiment",
      linkLabel: "Try Sentiment Analysis",
    },
  },

  "ai-social-thread": {
    useCasesTitle: "Why people use PDF to Social Thread",
    useCasesIntro:
      "Social threads (X / LinkedIn / Threads) have specific conventions: hook in post 1, ideas in posts 2&ndash;9, takeaway in the closer. PDF to Social Thread generates a 5&ndash;10-post thread from any source PDF respecting per-platform character limits and the hook-ideas-close arc.",
    useCases: [
      {
        icon: "Chat",
        title: "Research paper &rarr; X thread",
        text: "Researchers / analysts converting their published paper into a thread for distribution. The thread format reaches audiences who won&rsquo;t click through to read the paper &mdash; lossy but worth it for awareness.",
      },
      {
        icon: "Sparkle",
        title: "Internal report &rarr; LinkedIn post series",
        text: "Quarterly internal reports become LinkedIn thought-leadership content. Distillation from formal-internal to casual-public is the work the thread tool does.",
      },
      {
        icon: "Pages",
        title: "Talk / podcast notes &rarr; promo thread",
        text: "Conference talks and podcast appearances need promotion threads. The thread version of the content drives clicks to the talk recording.",
      },
      {
        icon: "Edit",
        title: "Long-form blog &rarr; thread teaser",
        text: "Blog posts get distilled to a thread that drives clicks back to the full post. Effective when the thread teases the takeaway without giving everything away.",
      },
      {
        icon: "Book",
        title: "Curated content compilation",
        text: "Round-ups of multiple sources (top 10 lists, industry digests) become threads where each post is a summarized item. Faster than writing each post manually.",
      },
    ],
    howWorksTitle: "How PDF to Social Thread works",
    howWorks: [
      {
        step: "1",
        title: "Drop the source PDF",
        text: "PDF up to 100 MB. Works on research papers, blog posts, reports, talk notes, briefs.",
      },
      {
        step: "2",
        title: "We structure + character-limit",
        text: "Server-side extraction, then thread-shape generation: hook (first post optimized for engagement), 5&ndash;9 idea posts, takeaway closer. Each post sized for the target platform (X = 280 chars, LinkedIn = 3000 chars, Threads = 500 chars). Default targets X.",
      },
      {
        step: "3",
        title: "Get a copy-ready thread",
        text: "Numbered post list with character counts. Copy-paste each post into your scheduler (Buffer / Hootsuite / native composer) or post manually. Page citations link each post back to the source for the &ldquo;where did this come from&rdquo; verification.",
      },
    ],
    faqs: [
      {
        q: "How long is the thread?",
        a: "5&ndash;10 posts by default. Source length influences count: a 3-page brief gets a 5-post thread; a 20-page paper gets 10. For longer threads, run multiple times with different focus areas; for shorter, manually trim.",
      },
      {
        q: "Will the hook actually drive engagement?",
        a: "Generated for clarity + curiosity by default. For aggressive engagement optimization (clickbait conventions), the hook serves as a baseline to refine. The output won&rsquo;t out-perform a skilled growth-hacker&rsquo;s manually-tuned hook, but it&rsquo;s a competent starting point.",
      },
      {
        q: "Does it suggest hashtags?",
        a: "Surfaces 3&ndash;5 relevant hashtags at the end of the closer post. Hashtag effectiveness is platform-dependent (LinkedIn rewards them more than X today); use or skip per platform norms.",
      },
      {
        q: "What about images / media?",
        a: "Text-only output. Each post may reference where an image would help (&ldquo;[chart of X]&rdquo;) so you know what visuals to add manually. Image generation is a separate workflow.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per thread. Cost is fixed regardless of doc size.",
      },
      {
        q: "Should I post as-is?",
        a: "No &mdash; treat it as a draft. Adjust the voice to your usual tone, verify facts (page citations make this easy), and double-check character counts after any edits. The thread does ~80% of the work; the last 20% (voice + fact check) is yours.",
      },
    ],
    cta: {
      title: "Want a blog version too?",
      text: "PDF to Blog Post generates a 800&ndash;1500 word post from the same source &mdash; useful for the &ldquo;cross-post on Twitter AND blog&rdquo; multi-channel workflow.",
      linkHref: "/tool/ai-blog",
      linkLabel: "Try PDF to Blog Post",
    },
  },

  "ai-semantic-search": {
    useCasesTitle: "Why people use Semantic Search in PDF",
    useCasesIntro:
      "Ctrl-F finds exact matches but misses paraphrases. Semantic Search in PDF accepts a natural-language question, retrieves relevant passages from the PDF (regardless of phrasing), and returns them verbatim with page references and relevance notes. Useful when you know what you&rsquo;re looking for but don&rsquo;t know the exact words the source used.",
    useCases: [
      {
        icon: "Search",
        title: "Find a clause in a long contract",
        text: "Search &ldquo;what happens if the partnership ends?&rdquo; in a 60-page partnership deed and get the dissolution clauses verbatim with page numbers. Faster than skimming for &ldquo;dissolution&rdquo; / &ldquo;termination&rdquo; / &ldquo;exit&rdquo; manually.",
      },
      {
        icon: "Pages",
        title: "Locate a fact in a research paper",
        text: "Search &ldquo;what was the sample size?&rdquo; or &ldquo;how was bias controlled?&rdquo; in a 30-page paper. Returns the relevant paragraph regardless of how the paper phrased it.",
      },
      {
        icon: "Book",
        title: "Lookup in a textbook / handbook",
        text: "&ldquo;How do I revoke a power of attorney?&rdquo; in a 200-page legal handbook. Returns the relevant section with surrounding context, faster than scanning the index.",
      },
      {
        icon: "Edit",
        title: "Spec / docs question-answering",
        text: "When working with technical specs you don&rsquo;t know cover-to-cover, semantic search lets you ask the doc directly. Different from chat-with-pdf because output is verbatim passages, not generated responses.",
      },
      {
        icon: "Compare",
        title: "Across-doc passage retrieval",
        text: "When you have multiple PDFs and a question, run the search on each and aggregate. Returns where each doc addresses your question, useful for the &ldquo;synthesize across sources&rdquo; workflow.",
      },
    ],
    howWorksTitle: "How Semantic Search in PDF works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF + ask the question",
        text: "PDF up to 100 MB. Question in natural language &mdash; &ldquo;what does X mean&rdquo;, &ldquo;how do I do Y&rdquo;, &ldquo;when did Z happen&rdquo;.",
      },
      {
        step: "2",
        title: "We embed + retrieve",
        text: "Server-side text extraction + chunking + vector embedding. Question embedded; retrieved passages ranked by semantic similarity (not keyword match). Top 3&ndash;5 passages returned with relevance scores.",
      },
      {
        step: "3",
        title: "Get verbatim passages with cites",
        text: "Markdown output with: question echoed back / 3&ndash;5 verbatim passages with page references / relevance score / context note. Verbatim means we DIDN&rsquo;T rewrite &mdash; you see exactly what the source said.",
      },
    ],
    faqs: [
      {
        q: "How is this different from chat-with-pdf?",
        a: "Chat generates an ANSWER (synthesized from the doc, model-paraphrased). Semantic Search returns PASSAGES (verbatim from the doc). Use chat when you want a direct answer; use search when you want to read the source material yourself with the LLM&rsquo;s help finding the right pages.",
      },
      {
        q: "What&rsquo;s the difference from Ctrl-F?",
        a: "Ctrl-F is exact lexical match &mdash; misses paraphrases. Semantic search matches meaning regardless of wording. Search &ldquo;dog&rdquo; and Ctrl-F won&rsquo;t find &ldquo;canine&rdquo;; semantic search will.",
      },
      {
        q: "What if my question has no answer in the doc?",
        a: "The tool surfaces the closest-matching passages with low relevance scores and a note like &ldquo;this passage discusses related but not the exact topic.&rdquo; Better than &ldquo;no results&rdquo; because near-misses are often informative.",
      },
      {
        q: "Can I search multiple PDFs at once?",
        a: "Single PDF per call. For multi-PDF semantic search across a corpus, AI Chat (multi-doc mode is on the roadmap) is the closer fit. Today&rsquo;s workaround: run the search on each PDF separately, aggregate the top results.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per search. Cost is fixed regardless of doc size or query count (one query per call today; multi-query batching on the roadmap).",
      },
      {
        q: "Privacy?",
        a: "PDF + query sent to inference provider for embedding + retrieval, not stored. For maximum confidentiality, redact PII via Redact PDF before running search; the structural search works on the redacted version.",
      },
    ],
    cta: {
      title: "Want a synthesized answer instead?",
      text: "AI Chat reads your PDF and answers questions in natural language with page citations. Pairs with semantic search: search to find passages, chat to discuss them.",
      linkHref: "/chat-with-pdf",
      linkLabel: "Try AI Chat",
    },
  },

  "ai-searchable-pdf": {
    useCasesTitle: "Why people use Make PDF Searchable",
    useCasesIntro:
      "Scanned PDFs look like text but are images &mdash; Ctrl-F doesn&rsquo;t work, copy-paste returns nothing. Make PDF Searchable runs OCR on each page and overlays the recognized text invisibly so the original visual layout is preserved AND text search / copy-paste both work. Different from AI OCR (which extracts text as a separate output) &mdash; this updates the PDF in place.",
    useCases: [
      {
        icon: "Scan",
        title: "Legacy document archive search",
        text: "Old scanned legal / corporate / academic archives become searchable. Useful when you have years of PDF accumulation and need to find a specific clause / paragraph / name across the archive.",
      },
      {
        icon: "Shield",
        title: "Compliance / audit trail",
        text: "Compliance archives (KYC, AML, regulatory filings) often arrive as scans. Making them searchable is a prerequisite for any audit involving full-text search of the archive.",
      },
      {
        icon: "Pages",
        title: "Research lit-review reading list",
        text: "Older research papers (pre-digital era, photocopied / scanned) need OCR before you can highlight, copy-paste, or text-search. The searchable version preserves the original layout but unlocks all the modern text affordances.",
      },
      {
        icon: "Book",
        title: "Academic / institutional digitization",
        text: "Universities digitizing thesis archives, libraries digitizing rare-book collections. Making the scans searchable is the difference between &ldquo;digital archive&rdquo; and &ldquo;searchable digital archive.&rdquo;",
      },
      {
        icon: "Edit",
        title: "Personal document organization",
        text: "Receipts, contracts, certificates, lab reports accumulated as scans become searchable across your file archive. Pairs with cloud-storage search (Google Drive, Dropbox) for one-search-finds-everything across years of saved docs.",
      },
    ],
    howWorksTitle: "How Make PDF Searchable works",
    howWorks: [
      {
        step: "1",
        title: "Drop the scanned PDF",
        text: "PDF up to 50 pages. Scanned and image-based PDFs are the target; clean digital PDFs already have searchable text (no need to run this).",
      },
      {
        step: "2",
        title: "We OCR + overlay",
        text: "AI Vision model OCRs each page (handles handwriting, multilingual scripts, low-resolution scans better than legacy Tesseract). Recognized text overlaid invisibly behind the original image so visual layout stays unchanged.",
      },
      {
        step: "3",
        title: "Download the searchable PDF",
        text: "Output is a PDF that LOOKS identical to the source (same layout, same images) but Ctrl-F finds matches and copy-paste returns the recognized text. Drop into your document management system and search across the archive.",
      },
    ],
    faqs: [
      {
        q: "How is this different from AI PDF OCR?",
        a: "AI OCR returns the recognized text as markdown / plaintext output (separate from the PDF). Make PDF Searchable returns the same PDF with text invisibly overlaid &mdash; the visual stays exactly the same, but you can search and copy. Pick OCR when you want the text; pick Searchable when you want the searchable PDF.",
      },
      {
        q: "Will it work for handwritten content?",
        a: "Handles handwriting better than legacy OCR (we use AI Vision, not Tesseract). Quality depends on handwriting clarity and DPI &mdash; readable handwriting works; messy or low-resolution handwriting degrades. For low-confidence pages, the search results may have OCR errors &mdash; verify against the visual when accuracy matters.",
      },
      {
        q: "What about multilingual content?",
        a: "Strong on Latin scripts (English, Spanish, French, Portuguese). Indian-language support (Devanagari, Tamil, Telugu, Bengali) works well for printed text; handwritten Indic is harder. Multi-script pages (English + Hindi mixed) handled.",
      },
      {
        q: "Is the original layout preserved?",
        a: "Yes &mdash; explicitly. The original page image is unchanged; recognized text is overlaid in a transparent layer. Visual identity preserved; text functionality added.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "2 credits per page. So a 20-page scanned doc costs 40 credits. Cost is page-based because OCR work scales with page count.",
      },
      {
        q: "What&rsquo;s the page limit?",
        a: "50 pages per call. For longer archives, split first via Split PDF (free), make each chunk searchable, then merge back via Merge PDF (free).",
      },
    ],
    cta: {
      title: "Just need the text without the searchable PDF?",
      text: "AI PDF OCR returns recognized text as markdown / plaintext &mdash; cheaper if you only need the text and don&rsquo;t need to keep the visual layout.",
      linkHref: "/tool/ai-ocr",
      linkLabel: "Try AI PDF OCR",
    },
  },

  "ai-chart-to-table": {
    useCasesTitle: "Why people use Chart &rarr; Data Table",
    useCasesIntro:
      "Charts in PDFs hide their data &mdash; you can see the trend but can&rsquo;t copy the numbers. Chart &rarr; Data Table reads charts visually, extracts the data points (with axis labels and units preserved), and returns CSV-ready output. Bar / line / pie / scatter / stacked all supported.",
    useCases: [
      {
        icon: "Pages",
        title: "Research paper data recovery",
        text: "When a paper&rsquo;s underlying data isn&rsquo;t shared and the chart is the only artifact, the extractor recovers approximate data points for re-analysis or comparison with your own work.",
      },
      {
        icon: "Sparkle",
        title: "Annual report numeric extraction",
        text: "Investor decks and annual reports rely on charts more than tables. Extraction makes the data points re-usable for your own analysis without manual point-clicking.",
      },
      {
        icon: "Compare",
        title: "Competitor benchmarking",
        text: "Public competitor metrics (revenue charts, growth charts, market-share charts) extracted into tables for side-by-side comparison with your own internal numbers.",
      },
      {
        icon: "Book",
        title: "Educational textbook data",
        text: "Textbooks present data in charts for explanation. The extractor lets students recreate the chart in their own software for learning by doing.",
      },
      {
        icon: "Edit",
        title: "Presentation slide data recovery",
        text: "Slide decks where the chart was built but the underlying spreadsheet was lost. The extractor reverse-engineers approximate data so you can rebuild the chart from scratch.",
      },
    ],
    howWorksTitle: "How Chart &rarr; Data Table works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF with charts",
        text: "PDF up to 50 MB. Works on charts in research papers, annual reports, presentations, articles. Bar / line / pie / scatter / stacked-bar / stacked-area all supported.",
      },
      {
        step: "2",
        title: "We read the chart visually",
        text: "AI Vision model identifies axes (labels, scales, units), reads data points (per bar / per line vertex / per pie slice), classifies confidence per point. Multi-chart PDFs processed page-by-page with one table per chart.",
      },
      {
        step: "3",
        title: "Get CSV-ready tables",
        text: "Markdown output: one table per chart, with columns for each axis variable. CSV export available for direct spreadsheet import. Page citation indicates source chart.",
      },
    ],
    faqs: [
      {
        q: "How accurate are the extracted numbers?",
        a: "Approximate. Bar charts with clear gridlines &rarr; ~5% accuracy. Line charts &rarr; ~10% on inflection points. Pie charts &rarr; ~5% on percentages. Heavily styled / 3D / artistic charts &rarr; lower accuracy. Treat extracted numbers as starting estimates, not authoritative source data.",
      },
      {
        q: "What if the chart has no axis labels?",
        a: "Output indicates &ldquo;axis labels missing &mdash; numbers are relative not absolute.&rdquo; Useful for trend analysis even without absolute values; useless for absolute comparison.",
      },
      {
        q: "Can it handle multi-series charts?",
        a: "Yes &mdash; each series becomes a column in the table. Stacked bars / stacked areas decomposed into per-series columns. Legend matching ensures the right series gets the right name.",
      },
      {
        q: "What about exotic chart types (radar, treemap, Sankey)?",
        a: "Less reliable. Standard chart types (bar / line / pie / scatter / column) are the strong cases. Exotic types may extract approximately but verify before using. For specialized chart types where accuracy matters, manual data entry is more reliable.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of chart count.",
      },
      {
        q: "Privacy?",
        a: "PDF sent to inference provider for chart-vision extraction, not stored. For confidential charts (internal financials, unreleased competitor intel), redact surrounding text via Redact PDF first &mdash; the chart extraction works on the redacted version.",
      },
    ],
    cta: {
      title: "Need to extract regular tables too?",
      text: "AI Table Extract pulls structured tables from PDFs as CSV / Excel &mdash; the natural counterpart to chart extraction for the &ldquo;extract everything quantitative&rdquo; workflow.",
      linkHref: "/tool/ai-table",
      linkLabel: "Try AI Table Extract",
    },
  },

  "ai-table": {
    useCasesTitle: "Why people use AI Table Extract",
    useCasesIntro:
      "AI Table Extract pulls structured tables from PDFs as CSV or Excel &mdash; even multi-page tables. Different from generic text extraction (which loses table structure) and from manual copy-paste (which is tedious and error-prone). Useful for any quantitative analysis where the source data is locked in PDFs.",
    useCases: [
      {
        icon: "Pages",
        title: "Annual report / 10-K table extraction",
        text: "Annual reports have dozens of tables (financials, segment data, risk factors). Extract them as CSV for spreadsheet analysis &mdash; faster than the &ldquo;copy-paste &amp; clean up&rdquo; loop that breaks on multi-page tables.",
      },
      {
        icon: "Sparkle",
        title: "Government / regulatory data",
        text: "Government reports (RBI / SEBI / IRDAI publications, census data, statistical releases) heavily use tables. Extraction makes the data analyzable in Excel / Tableau / Power BI without manual re-entry.",
      },
      {
        icon: "Edit",
        title: "Research paper data tables",
        text: "Research paper tables (results, demographics, comparison) extracted for re-analysis. Pairs with Research Paper Summarizer for the &ldquo;summary + raw data&rdquo; analysis workflow.",
      },
      {
        icon: "Compare",
        title: "Bank statement / transaction tables",
        text: "Multi-page transaction tables in bank statements extracted for spending analysis, budgeting, or loan applications. Indian bank statements (HDFC / ICICI / SBI / Axis) supported.",
      },
      {
        icon: "Book",
        title: "Textbook / handbook data tables",
        text: "Reference tables in textbooks (constants, conversion factors, lookup tables) extracted for use in calculation workflows. Faster than copy-typing and more accurate.",
      },
    ],
    howWorksTitle: "How AI Table Extract works",
    howWorks: [
      {
        step: "1",
        title: "Drop the PDF",
        text: "PDF up to 100 MB. Works on any PDF with tabular content &mdash; reports, statements, papers, government data.",
      },
      {
        step: "2",
        title: "We detect + structure",
        text: "Server-side extraction with table-detection: identifies table boundaries, header rows, multi-page continuations. Each table&rsquo;s structure preserved (rows / columns / merged cells / nested headers). AI Vision used when text-extraction alone fails (e.g. scanned tables).",
      },
      {
        step: "3",
        title: "Get CSV + Excel output",
        text: "Output: each table as separate CSV (importable into Excel / Sheets / database) plus an Excel file with one sheet per table. Page citation links each extracted table to source.",
      },
    ],
    faqs: [
      {
        q: "Will it handle multi-page tables?",
        a: "Yes &mdash; tables that continue across page breaks are detected and concatenated into one logical table. Header repetition (the same header repeated on each page) deduplicated.",
      },
      {
        q: "What about merged cells / nested headers?",
        a: "Multi-row headers (where a top-level header spans multiple sub-columns) preserved with proper hierarchy. Merged data cells (rare in well-formed tables) flagged for manual review &mdash; CSV doesn&rsquo;t natively express merged cells, so we duplicate the value across cells.",
      },
      {
        q: "Will it work on scanned PDFs?",
        a: "Yes &mdash; AI Vision OCR runs first, then table-structure detection on the recognized text. Quality on scans depends on resolution and table line clarity. Clean printed scans work well; faded / hand-drawn tables may need manual cleanup.",
      },
      {
        q: "How does it handle Indian-format tables?",
        a: "Indian conventions (lakh / crore in numbers, comma vs period decimal separators, multilingual headers) recognized. Bank statement formats from major Indian banks (HDFC / ICICI / SBI / Axis / Kotak) pre-tested.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "3 credits per doc. Cost is fixed regardless of table count.",
      },
      {
        q: "What if a table is wrong?",
        a: "Common issues: wrong column boundaries, header detection drift, multi-line cell handling. The output preserves the page citation so you can verify each table against the source. For high-accuracy extraction (financial filings, regulatory submissions), spot-check before downstream use.",
      },
    ],
    cta: {
      title: "Need to extract chart data too?",
      text: "Chart &rarr; Data Table reads charts visually and extracts data points with axis labels. Pairs with table extraction for the &ldquo;extract everything quantitative from the PDF&rdquo; workflow.",
      linkHref: "/tool/ai-chart-to-table",
      linkLabel: "Try Chart → Data Table",
    },
  },

  "ai-generate": {
    useCasesTitle: "Why people use Generate PDF from Prompt",
    useCasesIntro:
      "Generate PDF from Prompt drafts reports, contracts, briefs, and proposals from a text description &mdash; useful when you need a starting structural draft fast. The output is a draft, not a final &mdash; verification + brand-voice tuning are still your job.",
    useCases: [
      {
        icon: "Generate",
        title: "Contract first draft",
        text: "Describe the deal (parties, term, scope, payment terms, IP ownership) and get a structural draft contract. Faster than starting from scratch; reviewer-friendly format. NOT legal advice &mdash; have a lawyer finalize.",
      },
      {
        icon: "Edit",
        title: "Report skeleton",
        text: "Internal reports (status, post-mortem, project review) drafted from a description. The generated structure (executive summary / context / findings / recommendations / next steps) saves the &ldquo;what should the sections be?&rdquo; phase.",
      },
      {
        icon: "Sparkle",
        title: "Brief / RFP response draft",
        text: "Sales briefs and RFP responses drafted from the requirements. The output is a starting structural draft your team customizes &mdash; faster than blank-page authoring.",
      },
      {
        icon: "Pages",
        title: "Policy doc draft",
        text: "Internal policy documents (data handling, expense policy, work-from-home policy) drafted from a description of the rules. Provides the structural skeleton; legal / HR review finalizes.",
      },
      {
        icon: "Book",
        title: "Educational module draft",
        text: "Course module drafts from a topic description and learning objectives. The output is a teaching-skeleton (objectives / content / activities / assessment) the instructor refines.",
      },
    ],
    howWorksTitle: "How Generate PDF from Prompt works",
    howWorks: [
      {
        step: "1",
        title: "Describe what you need",
        text: "Plain-English description of the document: type (contract / report / brief), parties / context / key points, length target. More detail in the prompt &rarr; better fit in the output.",
      },
      {
        step: "2",
        title: "We draft + format",
        text: "LLM generates the document with appropriate structure (sections, headings, formal register for legal / academic; conversational for marketing). Output formatted as PDF with sensible defaults (Times New Roman / 11pt / 1-inch margins).",
      },
      {
        step: "3",
        title: "Get a downloadable PDF draft",
        text: "PDF download. Edit-source markdown also provided for further iteration in Word / Docs / your preferred editor.",
      },
    ],
    faqs: [
      {
        q: "How good is the output?",
        a: "Structural draft quality is high (section organization, header hierarchy, register matching). Substantive content quality depends on prompt specificity &mdash; vague prompt &rarr; generic output. Treat the output as ~70% of the work, with 30% remaining for fact-check / brand-tune / domain-expert review.",
      },
      {
        q: "Will it generate Indian legal / contract documents accurately?",
        a: "Generates Indian-formatted contracts (Indian Contract Act format, stamp paper conventions noted, governing law clauses) when prompted. Quality of legal substance is lower than a lawyer&rsquo;s draft &mdash; this is for skeleton / review-prep use, not final filing.",
      },
      {
        q: "Can I provide examples for style matching?",
        a: "Provide examples in the prompt (&ldquo;match the style of [pasted example]&rdquo;). Brand voice replication is partial &mdash; surface signals match well, deeper voice patterns are imperfect. Treat as draft-with-direction, not finished output.",
      },
      {
        q: "What about layout customization (logos, custom formatting)?",
        a: "Output uses sensible defaults. For branded layouts (company letterhead, custom fonts, design system), do post-generation editing in Word / InDesign / Canva. The generation focuses on content + structure, not visual identity.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "20 credits per doc. Higher than other AI tools because generation is more compute-intensive than analysis. Cost is fixed regardless of length.",
      },
      {
        q: "Should I publish the output as-is?",
        a: "No, especially for high-stakes documents (contracts, policies, regulatory filings). Treat the output as a starting structural draft. The 30% remaining work (fact-check, brand voice, domain-expert review) is what makes the doc usable; skipping it produces obvious-AI-generated artifacts that read poorly.",
      },
    ],
    cta: {
      title: "Have a doc to fill / sign?",
      text: "Sign &amp; Fill Forms uses AI to fill PDF form fields, then lets you sign and send. Useful as the next step after generating a contract from prompt &mdash; generate, fill in party-specific details, sign, send.",
      linkHref: "/tool/ai-sign",
      linkLabel: "Try Sign & Fill Forms",
    },
  },

  "ai-sign": {
    useCasesTitle: "Why people use Sign & Fill Forms",
    useCasesIntro:
      "Most PDF forms (loan applications, contracts, claim forms, government forms) need filling field-by-field plus a signature. Sign & Fill Forms lets the AI auto-fill recognized fields from a description (or another doc you provide as context), then you sign and send. Combined workflow.",
    useCases: [
      {
        icon: "Pen",
        title: "Loan application forms",
        text: "Indian bank loan forms have ~50&ndash;100 fields. AI fills the recognizable ones from your provided context (KYC info, employment details). You verify, sign, send. Faster than manual field-by-field filling.",
      },
      {
        icon: "Edit",
        title: "Insurance claim forms",
        text: "TPA claim forms have detailed fields (hospital info, diagnosis codes, expense breakdown). AI fills from the discharge summary + bill provided as context; you verify, add what&rsquo;s missing, sign, submit.",
      },
      {
        icon: "Pages",
        title: "Employment / HR forms",
        text: "Onboarding paperwork (provident fund, group insurance enrollment, tax declarations). AI fills from your employment offer + ID docs; you sign and submit through HR.",
      },
      {
        icon: "Sparkle",
        title: "Visa / immigration forms",
        text: "DS-160 (US visa), Schengen, VFS forms. AI fills repeating fields (name / address / passport details) from your context docs; you verify carefully (visa form errors have consequences) and sign.",
      },
      {
        icon: "Shield",
        title: "Contract execution",
        text: "Standard contracts (NDAs, MSAs, SoWs) where party-specific fields need filling. AI fills from your party-info doc; you review the contract, sign in the right spot, send.",
      },
    ],
    howWorksTitle: "How Sign & Fill Forms works",
    howWorks: [
      {
        step: "1",
        title: "Upload form + context",
        text: "PDF form (up to 50 MB) plus optional context docs (resume / KYC / discharge summary &mdash; whatever has the data the form needs). Up to 3 context docs supported.",
      },
      {
        step: "2",
        title: "AI fills recognized fields",
        text: "Form fields detected, types classified (text / date / checkbox / signature). AI matches fields against your context docs and fills with confidence scores. Low-confidence fields flagged for manual review.",
      },
      {
        step: "3",
        title: "You verify + sign + download",
        text: "Side-by-side view: form with AI-filled fields highlighted, your signature drawn or uploaded into signature fields. Verify each field, correct any mistakes, then download the completed PDF for submission.",
      },
    ],
    faqs: [
      {
        q: "Will it know my signature?",
        a: "You provide it &mdash; either drawn on screen (mouse / trackpad / stylus) or uploaded as an image. AI doesn&rsquo;t generate or fabricate signatures. The signature you provide is what gets placed in the signature fields.",
      },
      {
        q: "What if the AI fills a field wrong?",
        a: "Side-by-side review surfaces every filled field with confidence score. Click any field to edit. Low-confidence fields highlighted for explicit review. The workflow assumes verification &mdash; never submit without checking.",
      },
      {
        q: "Will it work for Indian government forms?",
        a: "Common forms (PAN, Aadhaar update, passport, voter ID) recognized. State / DM-level forms may have less reliable field detection. For high-stakes government submissions, verify every field before signing.",
      },
      {
        q: "Is the signature legally binding?",
        a: "Indian Information Technology Act 2000 recognizes electronic signatures for most uses. Some specific contexts (real estate registration, certain corporate actions) require physical signatures or DSC (Digital Signature Certificate). When in doubt, consult the receiving party about their signature requirements.",
      },
      {
        q: "What&rsquo;s the credit cost?",
        a: "10 credits per doc. Higher than analysis tools because the workflow combines form-detection + field-fill + signature-overlay. Cost is fixed regardless of form length.",
      },
      {
        q: "Privacy?",
        a: "Form + context docs sent to inference provider for field-filling, not stored. For maximum confidentiality (especially KYC docs with PAN / Aadhaar), use the in-browser flow only and avoid sharing the completed form before review.",
      },
    ],
    cta: {
      title: "Need to draft the form first?",
      text: "Generate PDF from Prompt drafts contracts, briefs, and reports from a description &mdash; useful as the upstream step when you need to create a form / contract before filling and signing.",
      linkHref: "/tool/ai-generate",
      linkLabel: "Try Generate PDF from Prompt",
    },
  },
};
