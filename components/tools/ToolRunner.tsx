"use client";

// components/tools/ToolRunner.tsx
//
// M24 (#193, 2026-04-29): per-tool code splitting.
//
// Before this file existed, `app/tool/[id]/page.tsx` statically imported
// all 60+ tool runner components at the top of the file. Visiting any
// /tool/{id} route therefore shipped JS for every tool — even though
// users only run one. Webpack's per-page splitting can't help here
// because every tool component is imported into the *same* page file.
//
// The fix is to split the tool dispatcher out of the page (which is
// a server component) into a separate "use client" file (this one)
// and replace static imports with `next/dynamic`. Each `dynamic(...)`
// call generates its own webpack chunk; visiting /tool/merge now only
// loads PdfMergeTool's chunk plus its deps. Sibling tools are not
// loaded.
//
// `ssr: false` because all tools are interactive client-side runners
// (they touch Blob, canvas, window.URL — none of which exist in the
// RSC environment). The page already renders full longform/FAQ/metadata
// around the tool for SEO; the tool's own JSX never had any business
// being SSR'd.
//
// Loading UX: while the chunk fetches, we render a small placeholder
// card so the area doesn't collapse. Empirically that gap is well under
// 500ms on a fresh tab over 4G, faster on warm cache.
//
// Tool exports are mostly named (e.g. `export function PdfMergeTool`),
// so each dynamic() promise resolves to `{ default: m.NamedExport }` —
// the synthetic default that next/dynamic expects.
//
// Maintenance: when adding a new tool, register it in two places:
//   1. The dynamic-import block below (alphabetized within its module).
//   2. The switch in ToolRunner() at the bottom.
// scripts/test-tier1-expansion.mjs pins both shapes so a missed
// wire-up fails CI before deploy.

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Loading placeholder — shown while a tool's chunk is fetching.
// ---------------------------------------------------------------------------

function ToolRunnerLoading(): ReactNode {
  return (
    <div
      className="card pulse-soft"
      style={{
        padding: 32,
        background: "var(--bg-1)",
        textAlign: "center",
        color: "var(--fg-muted)",
        fontSize: 13,
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      Loading tool…
    </div>
  );
}

// Tools take no props (their state is fully internal), so loosen the
// loader signature to ComponentType — narrowing each tool's prop shape
// here would require a per-tool prop type and a generic helper that
// distributes correctly over the union, which costs more in API
// complexity than it gains in safety. The dispatcher only ever calls
// each tool as `<X />` with zero props, so the only thing the type
// system needs to enforce is "the loaded module has a default export
// that's a renderable component" — which `ComponentType` covers.
type AnyTool = ComponentType<Record<string, unknown>>;

const dyn = (loader: () => Promise<{ default: AnyTool }>): AnyTool =>
  dynamic(loader, {
    ssr: false,
    loading: () => <ToolRunnerLoading />,
  }) as AnyTool;

// ---------------------------------------------------------------------------
// Free / client-side tools — PDFium + pdf-lib
// ---------------------------------------------------------------------------

const PageCountTool = dyn(() =>
  import("@/components/tools/PageCountTool").then((m) => ({
    default: m.PageCountTool,
  })),
);
const PdfInspectorTool = dyn(() =>
  import("@/components/tools/PdfInspectorTool").then((m) => ({
    default: m.PdfInspectorTool,
  })),
);

// PdfTextExportTool — three exports share one chunk.
const PdfToTextTool = dyn(() =>
  import("@/components/tools/PdfTextExportTool").then((m) => ({
    default: m.PdfToTextTool,
  })),
);
const PdfToMarkdownTool = dyn(() =>
  import("@/components/tools/PdfTextExportTool").then((m) => ({
    default: m.PdfToMarkdownTool,
  })),
);
const PdfToHtmlTool = dyn(() =>
  import("@/components/tools/PdfTextExportTool").then((m) => ({
    default: m.PdfToHtmlTool,
  })),
);

// PdfRasterizeTool — two exports share one chunk.
const PdfToJpgTool = dyn(() =>
  import("@/components/tools/PdfRasterizeTool").then((m) => ({
    default: m.PdfToJpgTool,
  })),
);
const PdfToPngTool = dyn(() =>
  import("@/components/tools/PdfRasterizeTool").then((m) => ({
    default: m.PdfToPngTool,
  })),
);

// 2026-05-01: ImagesToPdfTool — two exports (jpg + png) share one
// chunk. Pure pdf-lib, no PDFium import → tiny chunk size.
const PdfJpgToPdfTool = dyn(() =>
  import("@/components/tools/ImagesToPdfTool").then((m) => ({
    default: m.PdfJpgToPdfTool,
  })),
);
const PdfPngToPdfTool = dyn(() =>
  import("@/components/tools/ImagesToPdfTool").then((m) => ({
    default: m.PdfPngToPdfTool,
  })),
);
const TextToPdfTool = dyn(() =>
  import("@/components/tools/TextToPdfTool").then((m) => ({
    default: m.TextToPdfTool,
  })),
);
// 2026-05-01 Tier 1 batch:
const MarkdownToPdfTool = dyn(() =>
  import("@/components/tools/MarkdownToPdfTool").then((m) => ({
    default: m.MarkdownToPdfTool,
  })),
);
const PdfGrayscaleTool = dyn(() =>
  import("@/components/tools/PdfGrayscaleTool").then((m) => ({
    default: m.PdfGrayscaleTool,
  })),
);
const PdfBookletTool = dyn(() =>
  import("@/components/tools/PdfBookletTool").then((m) => ({
    default: m.PdfBookletTool,
  })),
);
// 2026-05-01 Tier 2 batch:
const PdfBatesNumbersTool = dyn(() =>
  import("@/components/tools/PdfBatesNumbersTool").then((m) => ({
    default: m.PdfBatesNumbersTool,
  })),
);
const PdfOddEvenPagesTool = dyn(() =>
  import("@/components/tools/PdfOddEvenPagesTool").then((m) => ({
    default: m.PdfOddEvenPagesTool,
  })),
);
const CsvToPdfTool = dyn(() =>
  import("@/components/tools/CsvToPdfTool").then((m) => ({
    default: m.CsvToPdfTool,
  })),
);
const PdfOverlayTool = dyn(() =>
  import("@/components/tools/PdfOverlayTool").then((m) => ({
    default: m.PdfOverlayTool,
  })),
);
const PdfFormFillTool = dyn(() =>
  import("@/components/tools/PdfFormFillTool").then((m) => ({
    default: m.PdfFormFillTool,
  })),
);
const PdfBatchProcessTool = dyn(() =>
  import("@/components/tools/PdfBatchProcessTool").then((m) => ({
    default: m.PdfBatchProcessTool,
  })),
);
// PENDING §5a Phase B (2026-05-05) — server-side Ghostscript-backed
// compress. Ships behind the PDF_COMPRESS feature flag; when off,
// /api/tools/compress returns 404 and the UI surfaces a friendly
// "not available on your account yet" message.
const PdfCompressTool = dyn(() =>
  import("@/components/tools/PdfCompressTool").then((m) => ({
    default: m.PdfCompressTool,
  })),
);
// PENDING §5b Phase B (2026-05-05) — server-side Ghostscript-backed
// PDF/A-2b converter. Companion to compress; same flag-gate pattern
// (PDF_A_CONVERT). Intentionally separate slug from /tool/pdf-a-check
// because read-only validation and mutating conversion are different
// user intents.
const PdfaConvertTool = dyn(() =>
  import("@/components/tools/PdfaConvertTool").then((m) => ({
    default: m.PdfaConvertTool,
  })),
);
const PdfDiffTool = dyn(() =>
  import("@/components/tools/PdfDiffTool").then((m) => ({
    default: m.PdfDiffTool,
  })),
);

const SearchPdfTool = dyn(() =>
  import("@/components/tools/SearchPdfTool").then((m) => ({
    default: m.SearchPdfTool,
  })),
);
const ExtractImagesTool = dyn(() =>
  import("@/components/tools/ExtractImagesTool").then((m) => ({
    default: m.ExtractImagesTool,
  })),
);

// Read-only inspectors (PdfReadOpsTool consumers and adjacent).
const PdfOutlineTool = dyn(() =>
  import("@/components/tools/PdfOutlineTool").then((m) => ({
    default: m.PdfOutlineTool,
  })),
);
const PdfFormsTool = dyn(() =>
  import("@/components/tools/PdfFormsTool").then((m) => ({
    default: m.PdfFormsTool,
  })),
);
const PdfAttachmentsTool = dyn(() =>
  import("@/components/tools/PdfAttachmentsTool").then((m) => ({
    default: m.PdfAttachmentsTool,
  })),
);
const ExtractContactsTool = dyn(() =>
  import("@/components/tools/ExtractContactsTool").then((m) => ({
    default: m.ExtractContactsTool,
  })),
);
const ExtractDatesTool = dyn(() =>
  import("@/components/tools/ExtractDatesTool").then((m) => ({
    default: m.ExtractDatesTool,
  })),
);
const ExtractAttachmentsTool = dyn(() =>
  import("@/components/tools/ExtractAttachmentsTool").then((m) => ({
    default: m.ExtractAttachmentsTool,
  })),
);
const PdfFontsTool = dyn(() =>
  import("@/components/tools/PdfFontsTool").then((m) => ({
    default: m.PdfFontsTool,
  })),
);
const PdfLinksTool = dyn(() =>
  import("@/components/tools/PdfLinksTool").then((m) => ({
    default: m.PdfLinksTool,
  })),
);
const PdfAnnotationsExportTool = dyn(() =>
  import("@/components/tools/PdfAnnotationsTool").then((m) => ({
    default: m.PdfAnnotationsTool,
  })),
);

// PdfChecklistTool — four audit-style tools share one chunk.
const PdfACheckTool = dyn(() =>
  import("@/components/tools/PdfChecklistTool").then((m) => ({
    default: m.PdfACheckTool,
  })),
);
const PdfXCheckTool = dyn(() =>
  import("@/components/tools/PdfChecklistTool").then((m) => ({
    default: m.PdfXCheckTool,
  })),
);
const AccessibilityCheckerTool = dyn(() =>
  import("@/components/tools/PdfChecklistTool").then((m) => ({
    default: m.AccessibilityCheckerTool,
  })),
);
const PdfJsDetectorTool = dyn(() =>
  import("@/components/tools/PdfChecklistTool").then((m) => ({
    default: m.PdfJsDetectorTool,
  })),
);

// pdf-lib writable tools.
const PdfMergeTool = dyn(() =>
  import("@/components/tools/PdfMergeTool").then((m) => ({
    default: m.PdfMergeTool,
  })),
);
const PdfSplitTool = dyn(() =>
  import("@/components/tools/PdfSplitTool").then((m) => ({
    default: m.PdfSplitTool,
  })),
);
const PdfRotateTool = dyn(() =>
  import("@/components/tools/PdfRotateTool").then((m) => ({
    default: m.PdfRotateTool,
  })),
);
const PdfUnlockTool = dyn(() =>
  import("@/components/tools/PdfUnlockTool").then((m) => ({
    default: m.PdfUnlockTool,
  })),
);
const PdfExtractPagesTool = dyn(() =>
  import("@/components/tools/PdfExtractPagesTool").then((m) => ({
    default: m.PdfExtractPagesTool,
  })),
);
const PdfDeletePagesTool = dyn(() =>
  import("@/components/tools/PdfDeletePagesTool").then((m) => ({
    default: m.PdfDeletePagesTool,
  })),
);
const PdfSortPagesTool = dyn(() =>
  import("@/components/tools/PdfSortPagesTool").then((m) => ({
    default: m.PdfSortPagesTool,
  })),
);
const PdfPageNumbersTool = dyn(() =>
  import("@/components/tools/PdfPageNumbersTool").then((m) => ({
    default: m.PdfPageNumbersTool,
  })),
);

// PdfSimpleOpsTool — four ops share one chunk.
const PdfRepairTool = dyn(() =>
  import("@/components/tools/PdfSimpleOpsTool").then((m) => ({
    default: m.PdfRepairTool,
  })),
);
const PdfStripLinksTool = dyn(() =>
  import("@/components/tools/PdfSimpleOpsTool").then((m) => ({
    default: m.PdfStripLinksTool,
  })),
);
const PdfFlattenTool = dyn(() =>
  import("@/components/tools/PdfSimpleOpsTool").then((m) => ({
    default: m.PdfFlattenTool,
  })),
);
const PdfRemoveMetadataTool = dyn(() =>
  import("@/components/tools/PdfSimpleOpsTool").then((m) => ({
    default: m.PdfRemoveMetadataTool,
  })),
);

// Visual editors — biggest individual chunks (canvas + thumbnails).
const PdfCropTool = dyn(() =>
  import("@/components/tools/PdfCropTool").then((m) => ({
    default: m.PdfCropTool,
  })),
);
const PdfAddTextBoxTool = dyn(() =>
  import("@/components/tools/PdfAddTextBoxTool").then((m) => ({
    default: m.PdfAddTextBoxTool,
  })),
);
const PdfHighlightTool = dyn(() =>
  import("@/components/tools/PdfHighlightTool").then((m) => ({
    default: m.PdfHighlightTool,
  })),
);
const PdfRedactTool = dyn(() =>
  import("@/components/tools/PdfRedactTool").then((m) => ({
    default: m.PdfRedactTool,
  })),
);
const PdfSignTool = dyn(() =>
  import("@/components/tools/PdfSignTool").then((m) => ({
    default: m.PdfSignTool,
  })),
);
const PdfFreeDrawTool = dyn(() =>
  import("@/components/tools/PdfFreeDrawTool").then((m) => ({
    default: m.PdfFreeDrawTool,
  })),
);
const PdfAddLinksTool = dyn(() =>
  import("@/components/tools/PdfAddLinksTool").then((m) => ({
    default: m.PdfAddLinksTool,
  })),
);
const PdfStampTool = dyn(() =>
  import("@/components/tools/PdfStampTool").then((m) => ({
    default: m.PdfStampTool,
  })),
);
const PdfNUpTool = dyn(() =>
  import("@/components/tools/PdfNUpTool").then((m) => ({
    default: m.PdfNUpTool,
  })),
);
const PdfResizeTool = dyn(() =>
  import("@/components/tools/PdfResizeTool").then((m) => ({
    default: m.PdfResizeTool,
  })),
);
const PdfImageWatermarkTool = dyn(() =>
  import("@/components/tools/PdfImageWatermarkTool").then((m) => ({
    default: m.PdfImageWatermarkTool,
  })),
);

// ---------------------------------------------------------------------------
// AI tools
// ---------------------------------------------------------------------------

const SummarizePdfTool = dyn(() =>
  import("@/components/tools/SummarizePdfTool").then((m) => ({
    default: m.SummarizePdfTool,
  })),
);
const TranslatePdfTool = dyn(() =>
  import("@/components/tools/TranslatePdfTool").then((m) => ({
    default: m.TranslatePdfTool,
  })),
);
const ComparePdfTool = dyn(() =>
  import("@/components/tools/ComparePdfTool").then((m) => ({
    default: m.ComparePdfTool,
  })),
);
const OcrPdfTool = dyn(() =>
  import("@/components/tools/OcrPdfTool").then((m) => ({
    default: m.OcrPdfTool,
  })),
);
const RewritePdfTool = dyn(() =>
  import("@/components/tools/RewritePdfTool").then((m) => ({
    default: m.RewritePdfTool,
  })),
);
const TableExtractTool = dyn(() =>
  import("@/components/tools/TableExtractTool").then((m) => ({
    default: m.TableExtractTool,
  })),
);
const RedactPdfTool = dyn(() =>
  import("@/components/tools/RedactPdfTool").then((m) => ({
    default: m.RedactPdfTool,
  })),
);
const GeneratePdfTool = dyn(() =>
  import("@/components/tools/GeneratePdfTool").then((m) => ({
    default: m.GeneratePdfTool,
  })),
);
const SignPdfTool = dyn(() =>
  import("@/components/tools/SignPdfTool").then((m) => ({
    default: m.SignPdfTool,
  })),
);
const TldrPdfTool = dyn(() =>
  import("@/components/tools/TldrPdfTool").then((m) => ({
    default: m.TldrPdfTool,
  })),
);

// SummarizeVariantTool — many AI variants share one chunk (single
// shared base file, ~25 named exports). dynamic() per export means
// only the one a user asks for triggers the chunk fetch — but webpack
// only ships the chunk once.
function summarizeVariant<K extends string>(name: K) {
  return dyn(() =>
    import("@/components/tools/SummarizeVariantTool").then((m) => ({
      default: (m as Record<string, unknown>)[name] as AnyTool,
    })),
  );
}

const KeyPointsPdfTool = summarizeVariant("KeyPointsPdfTool");
const StudyNotesPdfTool = summarizeVariant("StudyNotesPdfTool");
const Eli5PdfTool = summarizeVariant("Eli5PdfTool");
const FaqPdfTool = summarizeVariant("FaqPdfTool");
const BlogPostPdfTool = summarizeVariant("BlogPostPdfTool");
const ReadabilityPdfTool = summarizeVariant("ReadabilityPdfTool");
const EntitiesPdfTool = summarizeVariant("EntitiesPdfTool");
const SocialThreadPdfTool = summarizeVariant("SocialThreadPdfTool");
const CondensePdfTool = summarizeVariant("CondensePdfTool");
const ExpandPdfTool = summarizeVariant("ExpandPdfTool");
const ToneAnalyzePdfTool = summarizeVariant("ToneAnalyzePdfTool");
const CitationsPdfTool = summarizeVariant("CitationsPdfTool");
const SentimentPdfTool = summarizeVariant("SentimentPdfTool");
const BiasPdfTool = summarizeVariant("BiasPdfTool");
const ProofreadPdfTool = summarizeVariant("ProofreadPdfTool");
const NewsletterPdfTool = summarizeVariant("NewsletterPdfTool");
const VideoScriptPdfTool = summarizeVariant("VideoScriptPdfTool");
const AtsResumeTool = summarizeVariant("AtsResumeTool");
const ActionItemsPdfTool = summarizeVariant("ActionItemsPdfTool");
const SyllabusStudyPlanTool = summarizeVariant("SyllabusStudyPlanTool");
const DischargeSummaryTool = summarizeVariant("DischargeSummaryTool");
const CoverLetterTool = summarizeVariant("CoverLetterTool");
const JdMatchTool = summarizeVariant("JdMatchTool");
const NdaAnalyzerTool = summarizeVariant("NdaAnalyzerTool");
const EmploymentContractTool = summarizeVariant("EmploymentContractTool");
const SalarySlipTool = summarizeVariant("SalarySlipTool");
const ResearchPaperTool = summarizeVariant("ResearchPaperTool");
const InsurancePolicyTool = summarizeVariant("InsurancePolicyTool");
const LoanBundleAuditTool = summarizeVariant("LoanBundleAuditTool");
const PartnershipDeedTool = summarizeVariant("PartnershipDeedTool");
const ImproveWritingTool = summarizeVariant("ImproveWritingTool");
const ParaphraseTool = summarizeVariant("ParaphraseTool");
const AiDetectorTool = summarizeVariant("AiDetectorTool");
const ChartToTableTool = summarizeVariant("ChartToTableTool");

const ResumeParserTool = dyn(() =>
  import("@/components/tools/ResumeParserTool").then((m) => ({
    default: m.ResumeParserTool,
  })),
);
const BloodTestTool = dyn(() =>
  import("@/components/tools/BloodTestTool").then((m) => ({
    default: m.BloodTestTool,
  })),
);
const CourtOrderTool = dyn(() =>
  import("@/components/tools/CourtOrderTool").then((m) => ({
    default: m.CourtOrderTool,
  })),
);
const SearchablePdfTool = dyn(() =>
  import("@/components/tools/SearchablePdfTool").then((m) => ({
    default: m.SearchablePdfTool,
  })),
);

// StructuredVariantTool — flashcards + quiz share a chunk.
const FlashcardsPdfTool = dyn(() =>
  import("@/components/tools/StructuredVariantTool").then((m) => ({
    default: m.FlashcardsPdfTool,
  })),
);
const QuizPdfTool = dyn(() =>
  import("@/components/tools/StructuredVariantTool").then((m) => ({
    default: m.QuizPdfTool,
  })),
);

const MindmapPdfTool = dyn(() =>
  import("@/components/tools/MindmapPdfTool").then((m) => ({
    default: m.MindmapPdfTool,
  })),
);
const SemanticSearchPdfTool = dyn(() =>
  import("@/components/tools/SemanticSearchPdfTool").then((m) => ({
    default: m.SemanticSearchPdfTool,
  })),
);

// ---------------------------------------------------------------------------
// Dispatcher — kept in the same shape as the prior inline switch in
// app/tool/[id]/page.tsx so test-tier1-expansion.mjs's regex (looking
// for `case "id": return <Component />`) still pins each wire-up.
// ---------------------------------------------------------------------------

export function ToolRunner({ id }: { id: string }) {
  switch (id) {
    case "ai-summarize":
      return <SummarizePdfTool />;
    case "ai-tldr":
      return <TldrPdfTool />;
    case "ai-key-points":
      return <KeyPointsPdfTool />;
    case "ai-study-notes":
      return <StudyNotesPdfTool />;
    case "ai-eli5":
      return <Eli5PdfTool />;
    case "ai-faq":
      return <FaqPdfTool />;
    case "ai-blog":
      return <BlogPostPdfTool />;
    case "ai-readability":
      return <ReadabilityPdfTool />;
    case "ai-entities":
      return <EntitiesPdfTool />;
    case "ai-social-thread":
      return <SocialThreadPdfTool />;
    case "ai-condense":
      return <CondensePdfTool />;
    case "ai-expand":
      return <ExpandPdfTool />;
    case "ai-tone-analyze":
      return <ToneAnalyzePdfTool />;
    case "ai-citations":
      return <CitationsPdfTool />;
    case "ai-sentiment":
      return <SentimentPdfTool />;
    case "ai-bias":
      return <BiasPdfTool />;
    case "ai-proofread":
      return <ProofreadPdfTool />;
    case "ai-newsletter":
      return <NewsletterPdfTool />;
    case "ai-video-script":
      return <VideoScriptPdfTool />;
    case "ai-flashcards":
      return <FlashcardsPdfTool />;
    case "ai-quiz":
      return <QuizPdfTool />;
    case "ai-mindmap":
      return <MindmapPdfTool />;
    case "ai-semantic-search":
      return <SemanticSearchPdfTool />;
    case "ai-ats-resume":
      return <AtsResumeTool />;
    case "ai-resume-parse":
      return <ResumeParserTool />;
    case "ai-action-items":
      return <ActionItemsPdfTool />;
    case "ai-blood-test":
      return <BloodTestTool />;
    case "ai-court-order":
      return <CourtOrderTool />;
    case "ai-syllabus":
      return <SyllabusStudyPlanTool />;
    case "ai-discharge":
      return <DischargeSummaryTool />;
    case "ai-cover-letter":
      return <CoverLetterTool />;
    case "ai-jd-match":
      return <JdMatchTool />;
    case "ai-searchable-pdf":
      return <SearchablePdfTool />;
    case "ai-nda":
      return <NdaAnalyzerTool />;
    case "ai-employment":
      return <EmploymentContractTool />;
    case "ai-salary-slip":
      return <SalarySlipTool />;
    case "ai-research-paper":
      return <ResearchPaperTool />;
    case "ai-insurance":
      return <InsurancePolicyTool />;
    case "ai-loan-bundle":
      return <LoanBundleAuditTool />;
    case "ai-partnership-deed":
      return <PartnershipDeedTool />;
    case "ai-improve-writing":
      return <ImproveWritingTool />;
    case "ai-paraphrase":
      return <ParaphraseTool />;
    case "ai-detector":
      return <AiDetectorTool />;
    case "ai-chart-to-table":
      return <ChartToTableTool />;
    case "ai-translate":
      return <TranslatePdfTool />;
    case "ai-compare":
      return <ComparePdfTool />;
    case "ai-ocr":
      return <OcrPdfTool />;
    case "ai-rewrite":
      return <RewritePdfTool />;
    case "ai-table":
      return <TableExtractTool />;
    case "ai-redact":
      return <RedactPdfTool />;
    case "ai-generate":
      return <GeneratePdfTool />;
    case "ai-sign":
      return <SignPdfTool />;
    // Free / client-side tools.
    case "page-count":
      return <PageCountTool />;
    case "pdf-inspector":
      return <PdfInspectorTool />;
    case "pdf-to-text":
      return <PdfToTextTool />;
    case "pdf-to-markdown":
      return <PdfToMarkdownTool />;
    case "pdf-to-html":
      return <PdfToHtmlTool />;
    case "pdf-to-jpg":
      return <PdfToJpgTool />;
    case "pdf-to-png":
      return <PdfToPngTool />;
    case "jpg-to-pdf":
      return <PdfJpgToPdfTool />;
    case "png-to-pdf":
      return <PdfPngToPdfTool />;
    case "text-to-pdf":
      return <TextToPdfTool />;
    case "markdown-to-pdf":
      return <MarkdownToPdfTool />;
    case "grayscale-pdf":
      return <PdfGrayscaleTool />;
    case "booklet-pdf":
      return <PdfBookletTool />;
    case "bates-numbers":
      return <PdfBatesNumbersTool />;
    case "odd-even-pages":
      return <PdfOddEvenPagesTool />;
    case "csv-to-pdf":
      return <CsvToPdfTool />;
    case "pdf-overlay":
      return <PdfOverlayTool />;
    case "pdf-form-fill":
      return <PdfFormFillTool />;
    case "pdf-batch":
      return <PdfBatchProcessTool />;
    case "compress-pdf":
      return <PdfCompressTool />;
    case "pdf-a-convert":
      return <PdfaConvertTool />;
    case "pdf-diff":
      return <PdfDiffTool />;
    case "pdf-search":
      return <SearchPdfTool />;
    case "extract-images":
      return <ExtractImagesTool />;
    case "pdf-outline":
      return <PdfOutlineTool />;
    case "pdf-forms":
      return <PdfFormsTool />;
    case "pdf-attachments":
      return <PdfAttachmentsTool />;
    case "extract-contacts":
      return <ExtractContactsTool />;
    case "extract-dates":
      return <ExtractDatesTool />;
    case "extract-attachments":
      return <ExtractAttachmentsTool />;
    case "pdf-fonts":
      return <PdfFontsTool />;
    case "pdf-links":
      return <PdfLinksTool />;
    case "pdf-annotations":
      return <PdfAnnotationsExportTool />;
    case "pdf-javascript":
      return <PdfJsDetectorTool />;
    case "pdf-accessibility":
      return <AccessibilityCheckerTool />;
    case "pdf-a-check":
      return <PdfACheckTool />;
    case "pdf-x-check":
      return <PdfXCheckTool />;
    case "merge":
      return <PdfMergeTool />;
    case "split":
      return <PdfSplitTool />;
    case "rotate":
      return <PdfRotateTool />;
    case "unlock":
      return <PdfUnlockTool />;
    case "extract-pages":
      return <PdfExtractPagesTool />;
    case "delete-pages":
      return <PdfDeletePagesTool />;
    case "sort-pages":
      return <PdfSortPagesTool />;
    case "page-numbers":
      return <PdfPageNumbersTool />;
    case "repair-pdf":
      return <PdfRepairTool />;
    case "strip-links":
      return <PdfStripLinksTool />;
    case "flatten-pdf":
      return <PdfFlattenTool />;
    case "crop-pdf":
      return <PdfCropTool />;
    case "stamp-pdf":
      return <PdfStampTool />;
    case "n-up-pdf":
      return <PdfNUpTool />;
    case "resize-pdf":
      return <PdfResizeTool />;
    case "remove-metadata":
      return <PdfRemoveMetadataTool />;
    case "image-watermark":
      return <PdfImageWatermarkTool />;
    case "add-text-box":
      return <PdfAddTextBoxTool />;
    case "highlight-pdf":
      return <PdfHighlightTool />;
    case "redact-free":
      return <PdfRedactTool />;
    case "sign-pdf-free":
      return <PdfSignTool />;
    case "free-draw-pdf":
      return <PdfFreeDrawTool />;
    case "add-links":
      return <PdfAddLinksTool />;
    default:
      return null;
  }
}
