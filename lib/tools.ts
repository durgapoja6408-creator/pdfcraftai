// Canonical tool registry. Ported from the prototype shell.jsx.
// Each tool's `icon` is a key into components/icons/Icons.tsx (the `I` object).

import type { IconName } from "@/components/icons/Icons";

export type ToolGroup = "AI" | "Organize" | "Convert" | "Optimize" | "Edit" | "Security";

export type Tool = {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  free: boolean;
  cost?: string;
  group: ToolGroup;
};

export const TOOLS: readonly Tool[] = [
  // ----- Free -----
  { id: "merge", name: "Merge PDFs", desc: "Combine multiple PDFs into a single document.", icon: "Merge", free: true, group: "Organize" },
  { id: "split", name: "Split PDF", desc: "Separate pages into independent files.", icon: "Split", free: true, group: "Organize" },
  { id: "compress", name: "Compress PDF", desc: "Shrink file size without losing quality.", icon: "Compress", free: true, group: "Optimize" },
  { id: "pdf-to-office", name: "PDF to Word/Excel/PPT", desc: "Convert PDFs into editable Office files.", icon: "Convert", free: true, group: "Convert" },
  { id: "to-pdf", name: "Word/Image to PDF", desc: "Turn any file into a polished PDF.", icon: "Image", free: true, group: "Convert" },
  { id: "rotate", name: "Rotate & Reorder", desc: "Fix orientation and rearrange pages.", icon: "Rotate", free: true, group: "Organize" },
  { id: "extract-pages", name: "Extract Pages", desc: "Pick specific pages into a new PDF.", icon: "Pages", free: true, group: "Organize" },
  { id: "delete-pages", name: "Delete Pages", desc: "Remove pages from a PDF.", icon: "Pages", free: true, group: "Organize" },
  { id: "pdf-to-jpg", name: "PDF to JPG/PNG", desc: "Export every page as a high-res image.", icon: "Image", free: true, group: "Convert" },
  { id: "extract-images", name: "Extract Images", desc: "Pull every embedded image out of a PDF.", icon: "Image", free: true, group: "Convert" },
  { id: "page-count", name: "Page & Word Count", desc: "Instant stats for any PDF.", icon: "Pages", free: true, group: "Edit" },
  { id: "pdf-metadata", name: "PDF Metadata Editor", desc: "Read, edit, or strip title / author / subject.", icon: "Edit", free: true, group: "Edit" },
  { id: "flatten-pdf", name: "Flatten PDF", desc: "Bake forms + annotations into static content.", icon: "Shield", free: true, group: "Optimize" },
  { id: "crop-pdf", name: "Crop PDF", desc: "Trim margins from every page.", icon: "Edit", free: true, group: "Edit" },
  { id: "fill-forms", name: "Fill PDF Forms", desc: "Fill AcroForm fields and save the PDF.", icon: "Pen", free: true, group: "Edit" },
  { id: "pdf-to-text", name: "PDF to Text", desc: "Extract every page's text as a plain .txt file.", icon: "Convert", free: true, group: "Convert" },
  { id: "resize-pdf", name: "Resize Pages", desc: "Change page size to A4, Letter, Legal, A3, A5, or Tabloid.", icon: "Pages", free: true, group: "Edit" },
  { id: "remove-metadata", name: "Remove Metadata", desc: "Scrub title, author, creator, and XMP data before sharing.", icon: "Shield", free: true, group: "Security" },
  { id: "image-watermark", name: "Add Logo or Image Watermark", desc: "Stamp a PNG/JPEG logo onto every page. Position, scale, opacity.", icon: "Image", free: true, group: "Edit" },
  { id: "add-text-box", name: "Add Text Box", desc: "Click anywhere on a PDF page to add a text box. Multi-page support.", icon: "Pen", free: true, group: "Edit" },
  { id: "highlight-pdf", name: "Highlight PDF", desc: "Drag to highlight any region. Yellow, green, pink, blue, or orange.", icon: "Edit", free: true, group: "Edit" },
  { id: "redact-free", name: "Redact PDF (free)", desc: "Black-out sensitive regions by dragging. Visual redaction for everyday sharing.", icon: "Shield", free: true, group: "Security" },
  { id: "extract-attachments", name: "Extract Attachments", desc: "List and download files embedded inside a PDF.", icon: "File", free: true, group: "Convert" },
  { id: "invoice-generator", name: "GST Invoice Generator", desc: "Generate a clean GST-compliant invoice PDF from a form. INR/USD/EUR/GBP.", icon: "Receipt", free: true, group: "Convert" },
  { id: "edit-pdf", name: "Edit PDF (Text)", desc: "Click any text on a page to replace it. Preserves font and position.", icon: "Edit", free: true, group: "Edit" },
  { id: "sign-pdf-free", name: "Sign PDF (free)", desc: "Draw, type, or upload your signature and place it on any page.", icon: "Pen", free: true, group: "Security" },
  { id: "repair-pdf", name: "Repair PDF", desc: "Fix broken xref, rebuild page tree, and recompress streams.", icon: "Shield", free: true, group: "Optimize" },
  { id: "markdown-to-pdf", name: "Markdown to PDF", desc: "Turn .md notes into a polished A4 PDF with headings, lists, and code blocks.", icon: "Convert", free: true, group: "Convert" },
  { id: "text-to-pdf", name: "Text to PDF", desc: "Paste or upload plain text and download a clean PDF. Font, size, margins are yours.", icon: "Convert", free: true, group: "Convert" },
  { id: "pdf-to-markdown", name: "PDF to Markdown", desc: "Heuristic conversion — detects headings by font size, preserves bold.", icon: "Convert", free: true, group: "Convert" },
  { id: "pdf-to-html", name: "PDF to HTML", desc: "Self-contained .html file with inline CSS. Heuristic heading detection.", icon: "Convert", free: true, group: "Convert" },
  { id: "extract-form-data", name: "Extract Form Data", desc: "Pull AcroForm field values as CSV or JSON.", icon: "Pages", free: true, group: "Edit" },
  { id: "sort-pages", name: "Sort Pages", desc: "Drag thumbnails to reorder a PDF's pages visually.", icon: "Pages", free: true, group: "Organize" },
  { id: "extract-contacts", name: "Extract Emails, Phones, URLs", desc: "Regex-based extraction of contact info from text PDFs. CSV and vCard export.", icon: "Search", free: true, group: "Convert" },
  { id: "extract-dates", name: "Extract Dates → Calendar", desc: "Find every date in a PDF and download as an .ics calendar file.", icon: "Clock", free: true, group: "Convert" },
  { id: "stamp-pdf", name: "Add Stamp", desc: "DRAFT, CONFIDENTIAL, APPROVED, PAID — preset business stamps with rotation and color.", icon: "Pen", free: true, group: "Edit" },
  { id: "n-up-pdf", name: "N-up Layout", desc: "Combine multiple pages on one sheet — 2-up, 4-up, booklet imposition.", icon: "Pages", free: true, group: "Organize" },
  { id: "grayscale-pdf", name: "Convert to Grayscale", desc: "Render every page as black-and-white. Useful for B&W print prep.", icon: "Image", free: true, group: "Optimize" },
  { id: "strip-links", name: "Strip Hyperlinks", desc: "Remove every URL link and internal goto annotation. Preserves text + other annotations.", icon: "Shield", free: true, group: "Security" },
  { id: "booklet-pdf", name: "Booklet Imposition", desc: "Saddle-stitch page shuffle for fold-and-staple booklets. Distinct from N-up.", icon: "Pages", free: true, group: "Organize" },
  { id: "free-draw-pdf", name: "Draw on PDF", desc: "Sketch, mark up, and annotate any page with a free-draw pen. 5 colors, adjustable width.", icon: "Pen", free: true, group: "Edit" },
  { id: "add-links", name: "Add Hyperlinks", desc: "Drag a region, paste a URL, get a clickable link annotation. Inverse of Strip Hyperlinks.", icon: "Pen", free: true, group: "Edit" },
  // Sprint A — 5 Indian govt ID parsers (Tier 3 §3.x).
  { id: "ai-aadhaar", name: "Aadhaar Parser", desc: "Tier 3 Indian Govt ID: holder + masked Aadhaar (last 4 only) + VID + privacy guidance. DPDP-compliant.", icon: "Shield", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-pan-card", name: "PAN Card Parser", desc: "Tier 3 Indian Govt ID: PAN extract + format check + Aadhaar-PAN linkage flag.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-driving-license", name: "Driving License Parser", desc: "Tier 3 Indian Govt ID: DL extract with vehicle classes + endorsements + renewal watch.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-voter-id", name: "Voter ID (EPIC) Parser", desc: "Tier 3 Indian Govt ID: EPIC + constituency + polling + NVSP cross-verification steps.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-passport", name: "Passport Parser", desc: "Tier 3 Indian Govt ID: bio data + MRZ status + renewal watch + travel tips. India + international.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  // Sprint B — 5 Indian financial wedges (Tier 3 §3.1).
  { id: "ai-form-26as", name: "Form 26AS Analyzer", desc: "Tier 3 Finance: TDS / tax credit reconciliation across Parts A-E with discrepancy flags.", icon: "Pages", free: false, cost: "15 credits / doc", group: "AI" },
  { id: "ai-form-15g-15h", name: "Form 15G / 15H Analyzer", desc: "Tier 3 Finance: declaration parser with eligibility check vs basic exemption limits.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-rent-receipt", name: "Rent Receipts → HRA Summary", desc: "Tier 3 Finance: 12-month rent receipts → HRA exemption math + compliance flags.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-property-tax", name: "Property Tax Bill Analyzer", desc: "Tier 3 Finance: BBMP / MCD / BMC / KMC bill parser with rebate eligibility + late-payment warnings.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-stamp-duty", name: "Stamp Duty / e-Stamp Analyzer", desc: "Tier 3 Finance: SHCIL / state-portal e-Stamp parser with duty + party + verification URL.", icon: "Pages", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "page-numbers", name: "Page Numbers & Watermark", desc: "Add headers, footers, and watermarks.", icon: "Pages", free: true, group: "Edit" },
  { id: "protect", name: "Unlock / Protect PDF", desc: "Add or remove passwords and permissions.", icon: "Lock", free: true, group: "Security" },

  // ----- AI -----
  { id: "ai-chat", name: "Chat with PDF", desc: "Ask questions. Get answers cited to pages.", icon: "Chat", free: false, cost: "~5 credits / Q", group: "AI" },
  { id: "ai-summarize", name: "Summarize PDF", desc: "Executive summary + section bullets.", icon: "Summary", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-tldr", name: "TL;DR Generator", desc: "One-paragraph executive summary. Fast, cheap, precise.", icon: "Summary", free: false, cost: "2 credits / doc", group: "AI" },
  { id: "ai-key-points", name: "Key Points Extractor", desc: "Bulleted list of a PDF's core insights, each cited by page.", icon: "Summary", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-study-notes", name: "PDF to Study Notes", desc: "Revision-grade notes: overview, concepts, detailed sections, self-check questions.", icon: "Book", free: false, cost: "8 credits / doc", group: "AI" },
  { id: "ai-eli5", name: "Explain Like I'm 12", desc: "Plain-language explanation of any PDF. Short sentences, everyday words.", icon: "Chat", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-faq", name: "Generate FAQ", desc: "Auto-generate 6–10 Q&A pairs a reader would ask. Answers grounded in the doc.", icon: "Help", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-blog", name: "PDF to Blog Post", desc: "Turn a PDF into a publish-ready blog post — hook, sections, conclusion.", icon: "Edit", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-readability", name: "Readability Score", desc: "Flesch-Kincaid grade + complex-sentence callouts + jargon flags + fixes.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-entities", name: "Extract Entities", desc: "People / organisations / places / dates — four tables with page cites.", icon: "Search", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-social-thread", name: "PDF to Social Thread", desc: "5–10 post X/LinkedIn thread. Hook, ideas, takeaway close.", icon: "Chat", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-condense", name: "Condense PDF", desc: "Tighter rewrite of the document itself — keep every fact, cut 40–60% of the length.", icon: "Edit", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-expand", name: "Expand PDF", desc: "Elaborate every bullet into a full paragraph with source-grounded context.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-tone-analyze", name: "Tone & Style Analyzer", desc: "Voice + audience + 6–10 style attributes + observations. Doesn't rewrite.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-citations", name: "Extract Citations (BibTeX)", desc: "References as a BibTeX block + readable reference list.", icon: "Book", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-financials", name: "Extract Financial Numbers", desc: "Metric / Value / Unit / Period / Page table — INR crore + USD million + ratios.", icon: "Coin", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-sentiment", name: "Sentiment Analysis", desc: "Overall + per-section sentiment verdict with evidence and shifts.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-bias", name: "Inclusive Language Audit", desc: "Gendered language + outdated terminology + stereotyping flagged with fixes.", icon: "Shield", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-proofread", name: "Proofread PDF", desc: "Error table — page, quote, type, suggested fix. Spelling + grammar + agreement.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-newsletter", name: "PDF to Email Newsletter", desc: "Subject + preheader + sections + sign-off. Publish-ready draft.", icon: "Send", free: false, cost: "8 credits / doc", group: "AI" },
  { id: "ai-video-script", name: "PDF to Video Script", desc: "Talking-head script with 90s segments, hook, stage cues, closing CTA.", icon: "Play", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-flashcards", name: "PDF to Flashcards", desc: "10–30 Anki-compatible Q&A cards, downloadable CSV.", icon: "Book", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-quiz", name: "PDF to Quiz (MCQ)", desc: "6–12 multiple-choice questions with 4 options, answer key, and explanations.", icon: "Help", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-mindmap", name: "PDF to Mind Map", desc: "Hierarchical outline of a PDF — 4–8 branches, 3 levels deep. Text + JSON export.", icon: "Flow", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-semantic-search", name: "Semantic Search in PDF", desc: "Ask in natural language, get verbatim passages with page refs and relevance notes.", icon: "Search", free: false, cost: "2 credits / search", group: "AI" },
  { id: "ai-ats-resume", name: "ATS Resume Optimizer", desc: "Tier 3 HR: audit your resume for ATS compatibility + get concrete fixes.", icon: "User", free: false, cost: "10 credits / resume", group: "AI" },
  { id: "ai-resume-parse", name: "Resume Parser", desc: "Tier 3 HR: parse a resume into structured JSON (ATS / spreadsheet ready).", icon: "User", free: false, cost: "5 credits / resume", group: "AI" },
  { id: "ai-action-items", name: "Extract Action Items", desc: "Meeting notes / specs / briefs → TODO table with owners, due dates, priorities.", icon: "Check", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-bank-statement", name: "Bank Statement Parser", desc: "Tier 3 Finance: SBI/HDFC/ICICI/Axis/Kotak → categorised transactions CSV.", icon: "Receipt", free: false, cost: "30 credits / statement", group: "AI" },
  { id: "ai-blood-test", name: "Blood Test Report Parser", desc: "Tier 3 Healthcare: lab values with normal/high/low flags. Extraction only, not medical advice.", icon: "File", free: false, cost: "15 credits / report", group: "AI" },
  { id: "ai-gst-invoice", name: "GST Invoice Extractor", desc: "Tier 3 Finance: invoice → GSTR-2-ready fields with line-item tax breakdown.", icon: "Receipt", free: false, cost: "25 credits / invoice", group: "AI" },
  { id: "ai-rental", name: "Rental Agreement Analyzer", desc: "Tier 3 Legal: flags risks, missing clauses, and gives state-specific negotiation points.", icon: "Shield", free: false, cost: "15 credits / agreement", group: "AI" },
  { id: "ai-syllabus", name: "Syllabus to Study Plan", desc: "Tier 3 Education: 12-week study plan with topic map, practice checkpoints, revision strategy.", icon: "Book", free: false, cost: "20 credits / syllabus", group: "AI" },
  { id: "ai-property", name: "Property Document Checker", desc: "Tier 3 Real Estate: red flags + missing docs + chain of title in Indian sale deeds / khata / EC.", icon: "Shield", free: false, cost: "30 credits / doc", group: "AI" },
  { id: "ai-discharge", name: "Discharge Summary Simplifier", desc: "Tier 3 Healthcare: plain-language rewrite for patients + families. Not medical advice.", icon: "Chat", free: false, cost: "10 credits / summary", group: "AI" },
  { id: "ai-itr-form16", name: "ITR / Form 16 Analyzer", desc: "Tier 3 Finance: income summary + deductions + tax computation + suggested actions.", icon: "Receipt", free: false, cost: "20 credits / doc", group: "AI" },
  // Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.
  { id: "ai-cover-letter", name: "Cover Letter Generator", desc: "Tier 3 HR: tailored cover letter from your resume + optional JD. 300–350 words with customisation notes.", icon: "Edit", free: false, cost: "5 credits / letter", group: "AI" },
  { id: "ai-jd-match", name: "Resume ↔ JD Matcher", desc: "Tier 3 HR: fit score + per-requirement alignment table + missing-keyword ATS audit. Paste the JD, drop the resume.", icon: "Compare", free: false, cost: "5 credits / resume", group: "AI" },
  { id: "ai-tnpsc", name: "TNPSC Answer Key Analyzer", desc: "Tier 3 Education: per-question breakdown + subject distribution + topic frequency + TNPSC-specific strategy notes.", icon: "Book", free: false, cost: "15 credits / paper", group: "AI" },
  { id: "ai-jee-neet", name: "JEE/NEET Previous-Year Analyzer", desc: "Tier 3 Education: per-question table + chapter frequency + high-yield topics + 12-week revision plan.", icon: "Book", free: false, cost: "20 credits / paper", group: "AI" },
  { id: "ai-multi-bank", name: "Multi-Bank Statement Merger", desc: "Tier 3 Finance: parse SBI/HDFC/ICICI/Axis/Kotak statements concatenated in one PDF. Per-bank + consolidated view.", icon: "Receipt", free: false, cost: "20 credits / doc", group: "AI" },
  // Task #69 — Tier 2 §2.3 P0: Scanned → Searchable PDF.
  { id: "ai-searchable-pdf", name: "Make PDF Searchable", desc: "Tier 2 §2.3: OCR scanned pages and overlay invisible text so Ctrl-F finds matches. Visual layout unchanged.", icon: "Scan", free: false, cost: "2 credits / page", group: "AI" },
  // Task #75 — five Tier 3 P1 wedges.
  { id: "ai-credit-card", name: "Credit Card Statement Analyzer", desc: "Tier 3 Finance: spend by category + top merchants + recurring charges + fees. Indian and international issuers.", icon: "Receipt", free: false, cost: "15 credits / statement", group: "AI" },
  { id: "ai-mutual-fund", name: "Mutual Fund Statement Parser", desc: "Tier 3 Finance: parse CAMS / KFin / AMC statements. Holdings + allocation + active SIPs + performers.", icon: "Receipt", free: false, cost: "15 credits / statement", group: "AI" },
  { id: "ai-nda", name: "NDA Analyzer", desc: "Tier 3 Legal: risk flags + negotiation points + missing standard clauses. Catches embedded non-competes, IP assignment.", icon: "Shield", free: false, cost: "15 credits / NDA", group: "AI" },
  { id: "ai-sale-deed", name: "Sale Deed Analyzer", desc: "Tier 3 Legal: property schedule + chain of title + encumbrances + recommended verifications. For Indian home buyers.", icon: "Shield", free: false, cost: "25 credits / deed", group: "AI" },
  { id: "ai-employment", name: "Employment Contract Review", desc: "Tier 3 Legal: comp + termination + risk flags (non-compete, IP, training bond) + negotiation points.", icon: "Shield", free: false, cost: "20 credits / contract", group: "AI" },
  // Task #77 — five more Tier 3 P1 wedges.
  { id: "ai-medical-bill", name: "Medical Bill / Insurance Claim Analyzer", desc: "Tier 3 Healthcare: itemised charges + cashless status + IRDAI reimbursable/excluded items + pre/post-hospitalisation notes.", icon: "Receipt", free: false, cost: "20 credits / bill", group: "AI" },
  { id: "ai-prescription", name: "Prescription Parser", desc: "Tier 3 Healthcare: parse printed + handwritten prescriptions into structured medication list with Indian conventions (BD/TDS/HS/SOS, 1-0-1).", icon: "Scan", free: false, cost: "10 credits / prescription", group: "AI" },
  { id: "ai-rera", name: "RERA Document Analyzer", desc: "Tier 3 Real Estate: project + approvals + risk flags + buyer protections + verification checklist for Indian RERA filings.", icon: "Shield", free: false, cost: "25 credits / doc", group: "AI" },
  { id: "ai-ec", name: "Encumbrance Certificate Parser", desc: "Tier 3 Legal: chronological encumbrance table + chain narrative + risk flags + coverage gaps. For Indian Sub-Registrar EC documents.", icon: "Shield", free: false, cost: "15 credits / EC", group: "AI" },
  { id: "ai-salary-slip", name: "Salary Slip Analyzer", desc: "Tier 3 Finance: structured JSON of earnings + deductions + YTD with original component names preserved for YoY comparison.", icon: "Receipt", free: false, cost: "10 credits / slip", group: "AI" },
  // Task #78 — five more Tier 3 wedges.
  { id: "ai-upsc", name: "UPSC Paper Analyzer", desc: "Tier 3 Education: Prelims / Mains / Optional. Subject + sub-topic + difficulty tables. Static-vs-current ratio. UPSC-specific strategy.", icon: "Book", free: false, cost: "20 credits / paper", group: "AI" },
  { id: "ai-research-paper", name: "Research Paper Summarizer", desc: "Tier 3 Education: citation + BibTeX + methods + results (magnitudes preserved) + limitations + how-to-cite examples + related reading.", icon: "Book", free: false, cost: "15 credits / paper", group: "AI" },
  { id: "ai-demat", name: "Demat / CAS Statement Parser", desc: "Tier 3 Finance: NSDL/CDSL Consolidated Account Statements. Holdings (equity/MF/bond/ETF/SGB) + transactions (dividends, bonuses, splits, IPO allots).", icon: "Receipt", free: false, cost: "15 credits / CAS", group: "AI" },
  { id: "ai-insurance", name: "Insurance Policy Analyzer", desc: "Tier 3 Insurance: coverage + exclusions + waiting periods + claim process + renewal/portability + risk flags. Health/life/motor/home/travel/term.", icon: "Shield", free: false, cost: "20 credits / policy", group: "AI" },
  { id: "ai-loan-bundle", name: "Loan Application Bundler Audit", desc: "Tier 3 Finance: audits a stack of loan docs against lender checklist. Detects loan type, lists missing items, surfaces eligibility issues.", icon: "Receipt", free: false, cost: "15 credits / bundle", group: "AI" },
  // Task #79 — five more Tier 3 wedges.
  { id: "ai-expense-report", name: "Expense Report Builder", desc: "Tier 3 Finance: bank statement → category × month matrix + top spend + recurring charges + saving rate. Indian categories.", icon: "Receipt", free: false, cost: "15 credits / report", group: "AI" },
  { id: "ai-court-order", name: "Court Order / Judgment Summarizer", desc: "Tier 3 Legal: Indian court orders. Citation + parties + issues framed + held + ratio decidendi + reasoning + practical implications.", icon: "Shield", free: false, cost: "20 credits / order", group: "AI" },
  { id: "ai-partnership-deed", name: "Partnership Deed Analyzer", desc: "Tier 3 Legal: partners + capital + profit/loss share + decision-making + admission/retirement + risk flags. Partnership & LLP deeds.", icon: "Shield", free: false, cost: "20 credits / deed", group: "AI" },
  { id: "ai-ssc-banking", name: "SSC / Banking Exam Paper Analyzer", desc: "Tier 3 Education: SSC CGL / CHSL / Banking PO / Clerk / RBI / NABARD. Per-section breakdown + topic frequency + cutoff strategy.", icon: "Book", free: false, cost: "15 credits / paper", group: "AI" },
  { id: "ai-ncert", name: "NCERT Chapter Summarizer", desc: "Tier 3 Education: NCERT textbook chapter → key concepts + diagrams + likely CBSE / state-board questions + revision checklist.", icon: "Book", free: false, cost: "10 credits / chapter", group: "AI" },
  // Task #80 — five more Tier 3 wedges.
  { id: "ai-scan-report", name: "Scan Report (MRI/CT/X-ray) Explainer", desc: "Tier 3 Healthcare: rewrites radiology reports in plain Indian English + glossary + questions to ask. STRICTLY non-diagnostic.", icon: "Scan", free: false, cost: "20 credits / scan", group: "AI" },
  { id: "ai-electricity-bill", name: "Electricity Bill Analyzer", desc: "Tier 3 Utility: TANGEDCO / BESCOM / TSSPDCL / MSEDCL / BSES / Tata Power. Slab-by-slab + saving tips specific to your DISCOM.", icon: "Receipt", free: false, cost: "5 credits / bill", group: "AI" },
  { id: "ai-telecom-bill", name: "Telecom Bill Analyzer", desc: "Tier 3 Utility: Airtel / Jio / Vi postpaid + fibre. Plan vs usage + overage + bundled OTT + plan-fit recommendations.", icon: "Receipt", free: false, cost: "5 credits / bill", group: "AI" },
  { id: "ai-builder-agreement", name: "Builder Agreement Red-Flag Detector", desc: "Tier 3 Real Estate: under-construction property buyer-builder agreements. Pricing + red flags + RERA protections + verifications.", icon: "Shield", free: false, cost: "30 credits / agreement", group: "AI" },
  { id: "ai-balance-sheet", name: "Balance Sheet / P&L Extractor", desc: "Tier 3 Finance: structured JSON of balance sheet + P&L + cash flow + computed ratios (current ratio, D/E, ROE, ROA). Ind AS / IFRS aware.", icon: "Receipt", free: false, cost: "25 credits / report", group: "AI" },
  // Task #81 — five more wedges (Tier 2 §2.5/§2.6/§2.8 + Tier 3 §3.3).
  { id: "ai-improve-writing", name: "Improve Writing", desc: "Tier 2: rewrites for clarity + concision (~20-30% shorter) without changing facts, register, or claims.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-paraphrase", name: "Paraphrase PDF", desc: "Tier 2: rewords preserving every claim + number + conclusion. Same length as input. Technical terms preserved.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-plagiarism", name: "Originality Heuristic Check", desc: "Tier 2: surfaces register shifts, definition-textbook style, boilerplate repeats, AI-generation tells. NOT a Turnitin scan.", icon: "Shield", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-chart-to-table", name: "Chart → Data Table", desc: "Tier 2 Visual: reads charts visually, extracts data points with axis labels + units. Bar / line / pie / scatter / stacked supported.", icon: "Pages", free: false, cost: "5 credits / chart", group: "AI" },
  { id: "ai-paper-pattern", name: "Multi-Year Question Paper Pattern", desc: "Tier 3 Education: 5+ years of past papers → topic frequency + question-type trend + difficulty drift + recycle rate + predictions.", icon: "Book", free: false, cost: "15 credits / set", group: "AI" },
  { id: "ai-translate", name: "Translate PDF", desc: "Preserve layout across 20+ languages.", icon: "Translate", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-ocr", name: "OCR & Smart Extract", desc: "Turn scans into searchable, structured data.", icon: "Scan", free: false, cost: "~2 credits / page", group: "AI" },
  { id: "ai-rewrite", name: "Rewrite & Rephrase", desc: "Tone shift, simplify, or expand text.", icon: "Edit", free: false, cost: "~3 credits / page", group: "AI" },
  { id: "ai-redact", name: "Redact Sensitive Info", desc: "Auto-detect PII and black it out.", icon: "Shield", free: false, cost: "~2 credits / page", group: "AI" },
  { id: "ai-generate", name: "Generate PDF from Prompt", desc: "Draft reports, contracts, briefs from text.", icon: "Generate", free: false, cost: "~20 credits / doc", group: "AI" },
  { id: "ai-sign", name: "Sign & Fill Forms", desc: "AI fills fields, you sign and send.", icon: "Pen", free: false, cost: "~10 credits / doc", group: "AI" },
  { id: "ai-table", name: "AI Table Extract", desc: "Extract tables as CSV or Excel — even multi-page.", icon: "Pages", free: false, cost: "~3 credits / table", group: "AI" },
  { id: "ai-compare", name: "Compare PDFs", desc: "Redline diff with AI severity analysis.", icon: "Compare", free: false, cost: "15 credits / diff", group: "AI" },
] as const;

export const GROUP_ORDER: readonly ToolGroup[] = ["AI", "Organize", "Convert", "Optimize", "Edit", "Security"] as const;

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);

export const toolsByGroup = (): Record<ToolGroup, Tool[]> => {
  const out = {} as Record<ToolGroup, Tool[]>;
  for (const g of GROUP_ORDER) out[g] = [];
  for (const t of TOOLS) out[t.group].push(t);
  return out;
};

// Single source of truth for tool counts rendered in marketing copy.
// Every place that says "16 tools" / "8 free forever" / "10 AI" used
// to hardcode these numbers and drifted every time TOOLS grew. Derive
// them here once; every consumer pulls from the same place so adding
// a tool to TOOLS[] auto-updates every surface that references counts.
//
// Exposed as an object rather than three separate exports so call-sites
// read as `TOOL_STATS.free` / `TOOL_STATS.ai` — grepable, impossible to
// confuse with other counts elsewhere in the app.
export const TOOL_STATS = {
  total: TOOLS.length,
  free: TOOLS.filter((t) => t.free).length,
  ai: TOOLS.filter((t) => !t.free).length,
} as const;
