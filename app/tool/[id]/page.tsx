import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { TOOLS, toolById } from "@/lib/tools";
import { MergePdfTool } from "@/components/tools/MergePdfTool";
import { SplitPdfTool } from "@/components/tools/SplitPdfTool";
import { RotatePdfTool } from "@/components/tools/RotatePdfTool";
import { CompressPdfTool } from "@/components/tools/CompressPdfTool";
import { SummarizePdfTool } from "@/components/tools/SummarizePdfTool";
import { TranslatePdfTool } from "@/components/tools/TranslatePdfTool";
import { ComparePdfTool } from "@/components/tools/ComparePdfTool";
import { OcrPdfTool } from "@/components/tools/OcrPdfTool";
import { RewritePdfTool } from "@/components/tools/RewritePdfTool";
import { TableExtractTool } from "@/components/tools/TableExtractTool";
import { RedactPdfTool } from "@/components/tools/RedactPdfTool";
import { GeneratePdfTool } from "@/components/tools/GeneratePdfTool";
import { SignPdfTool } from "@/components/tools/SignPdfTool";
import { PageNumbersTool } from "@/components/tools/PageNumbersTool";
import { ImageToPdfTool } from "@/components/tools/ImageToPdfTool";
import { ProtectPdfTool } from "@/components/tools/ProtectPdfTool";
import { PdfToOfficeTool } from "@/components/tools/PdfToOfficeTool";
import { ExtractPagesTool } from "@/components/tools/ExtractPagesTool";
import { DeletePagesTool } from "@/components/tools/DeletePagesTool";
import { PdfToJpgTool } from "@/components/tools/PdfToJpgTool";
import { ExtractImagesTool } from "@/components/tools/ExtractImagesTool";
import { PageCountTool } from "@/components/tools/PageCountTool";
import { PdfMetadataTool } from "@/components/tools/PdfMetadataTool";
import { FlattenPdfTool } from "@/components/tools/FlattenPdfTool";
import { CropPdfTool } from "@/components/tools/CropPdfTool";
import { FillFormsTool } from "@/components/tools/FillFormsTool";
import { PdfToTextTool } from "@/components/tools/PdfToTextTool";
import { ResizePdfTool } from "@/components/tools/ResizePdfTool";
import { RemoveMetadataTool } from "@/components/tools/RemoveMetadataTool";
import { ImageWatermarkTool } from "@/components/tools/ImageWatermarkTool";
import { AddTextBoxTool } from "@/components/tools/AddTextBoxTool";
import { HighlightPdfTool } from "@/components/tools/HighlightPdfTool";
import { RedactFreeTool } from "@/components/tools/RedactFreeTool";
import { ExtractAttachmentsTool } from "@/components/tools/ExtractAttachmentsTool";
import { InvoiceGeneratorTool } from "@/components/tools/InvoiceGeneratorTool";
import { EditPdfTool } from "@/components/tools/EditPdfTool";
import { SignPdfFreeTool } from "@/components/tools/SignPdfFreeTool";
import { RepairPdfTool } from "@/components/tools/RepairPdfTool";
import { MarkdownToPdfTool } from "@/components/tools/MarkdownToPdfTool";
import { TextToPdfTool } from "@/components/tools/TextToPdfTool";
import { PdfToMarkdownTool } from "@/components/tools/PdfToMarkdownTool";
import { PdfToHtmlTool } from "@/components/tools/PdfToHtmlTool";
import { ExtractFormDataTool } from "@/components/tools/ExtractFormDataTool";
import { SortPagesTool } from "@/components/tools/SortPagesTool";
import { ExtractContactsTool } from "@/components/tools/ExtractContactsTool";
import { ExtractDatesTool } from "@/components/tools/ExtractDatesTool";
import { TldrPdfTool } from "@/components/tools/TldrPdfTool";
import {
  KeyPointsPdfTool,
  StudyNotesPdfTool,
  Eli5PdfTool,
  FaqPdfTool,
  BlogPostPdfTool,
  ReadabilityPdfTool,
  EntitiesPdfTool,
  SocialThreadPdfTool,
} from "@/components/tools/SummarizeVariantTool";

type Params = { params: { id: string } };

// Tools whose client runners ship in Phase 3 (free, in-browser) + Phase
// 5.1 (AI · Summarize) + Phase 5.2 (AI · Translate) + Phase 5.3 (AI ·
// Compare) + Phase 5.4 (AI · OCR) + Phase 5.6 (AI · Rewrite, AI · Table,
// AI · Redact, AI · Generate, AI · Sign) + `pdf-to-office` (free but
// server-side — pdfjs worker + docx lib are Node-only; see
// lib/tools-server/pdf-to-office.ts for the why).
// Adding a tool here: register the id, then append a case to the
// ToolRunner switch below.
const LIVE_TOOL_IDS = new Set<string>([
  "merge",
  "split",
  "rotate",
  "compress",
  "page-numbers",
  "to-pdf",
  "protect",
  "pdf-to-office",
  // Tier 1 P0 expansion — all 6 are client-side (pdf-lib + pdfjs-dist),
  // so they still qualify for the "stays in your browser" reassurance
  // copy. The ToolRunner switch below maps each id to its component.
  "extract-pages",
  "delete-pages",
  "pdf-to-jpg",
  "extract-images",
  "page-count",
  "pdf-metadata",
  "flatten-pdf",
  "crop-pdf",
  "fill-forms",
  "pdf-to-text",
  "resize-pdf",
  "remove-metadata",
  "image-watermark",
  "add-text-box",
  "highlight-pdf",
  "redact-free",
  "extract-attachments",
  "invoice-generator",
  "edit-pdf",
  "sign-pdf-free",
  "repair-pdf",
  "markdown-to-pdf",
  "text-to-pdf",
  "pdf-to-markdown",
  "pdf-to-html",
  "extract-form-data",
  "sort-pages",
  "extract-contacts",
  "extract-dates",
  "ai-summarize",
  "ai-tldr",
  "ai-key-points",
  "ai-study-notes",
  "ai-eli5",
  "ai-faq",
  "ai-blog",
  "ai-readability",
  "ai-entities",
  "ai-social-thread",
  "ai-translate",
  "ai-compare",
  "ai-ocr",
  "ai-rewrite",
  "ai-table",
  "ai-redact",
  "ai-generate",
  "ai-sign",
]);

// Free tools that run server-side rather than on-device. These still
// count as `tool.free` (no auth, no credit spend) but the reassurance
// row must NOT claim "stays in your browser" — that would be a lie.
const SERVER_SIDE_FREE_TOOLS = new Set<string>(["pdf-to-office"]);

export function generateStaticParams() {
  return TOOLS.map((t) => ({ id: t.id }));
}

export function generateMetadata({ params }: Params): Metadata {
  const tool = toolById(params.id);
  if (!tool) return { title: "Tool not found" };
  const title = tool.name;
  return {
    title,
    description: tool.desc,
    alternates: { canonical: `/tool/${tool.id}` },
    openGraph: {
      title,
      description: tool.desc,
      url: `/tool/${tool.id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool.desc,
    },
  };
}

export default function ToolRunnerPage({ params }: Params) {
  const tool = toolById(params.id);
  if (!tool) notFound();
  const Ic = I[tool.icon];
  const isLive = LIVE_TOOL_IDS.has(tool.id);
  const isServerSideFree = SERVER_SIDE_FREE_TOOLS.has(tool.id);

  return (
    <main>
      <section style={{ paddingTop: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 960 }}>
          <Link href="/tools" className="row subtle" style={{ gap: 6, marginBottom: 24, fontSize: 13 }}>
            <I.ArrowLeft size={14} /> All tools
          </Link>

          <div className="row" style={{ gap: 16, marginBottom: 8 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: tool.free ? "var(--blue-soft)" : "var(--accent-soft)",
                color: tool.free ? "var(--blue)" : "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Ic size={26} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 32, margin: 0 }}>{tool.name}</h1>
                {tool.free ? (
                  <span className="chip chip-free">Free</span>
                ) : (
                  <span className="chip chip-ai">AI · {tool.cost}</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 15 }}>
                {tool.desc}
              </div>
            </div>
          </div>

          {isLive ? (
            <div style={{ marginTop: 32 }}>
              <ToolRunner id={tool.id} />
            </div>
          ) : (
            <ComingSoonRunner phaseLabel={tool.free ? "PHASE 3" : "PHASE 5"} />
          )}

          {/* Reassurance row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginTop: 32,
            }}
          >
            <ReassuranceCard
              icon="Shield"
              title={
                isServerSideFree
                  ? "Processed privately"
                  : tool.free
                    ? "Stays in your browser"
                    : "Private & secure"
              }
              body={
                isServerSideFree
                  ? "Your PDF is converted in-memory on our servers and discarded the moment the download completes — nothing is stored."
                  : tool.free
                    ? "Free tools run fully on-device — nothing is uploaded to a server."
                    : "Uploaded files are encrypted and deleted within 60 minutes."
              }
            />
            <ReassuranceCard
              icon="Check"
              title="No watermarks"
              body="Clean output, no branding, no daily limits."
            />
            {tool.free ? (
              <ReassuranceCard
                icon="Zap"
                title="Free forever"
                body="No signup required. Seriously."
              />
            ) : (
              <ReassuranceCard
                icon="Coin"
                title="Pay only for what you use"
                body="Credits never expire. Cancel anytime."
              />
            )}
          </div>
        </div>
      </section>

      <div style={{ padding: "80px 0" }} />
    </main>
  );
}

function ToolRunner({ id }: { id: string }) {
  switch (id) {
    case "merge":
      return <MergePdfTool />;
    case "split":
      return <SplitPdfTool />;
    case "rotate":
      return <RotatePdfTool />;
    case "compress":
      return <CompressPdfTool />;
    case "page-numbers":
      return <PageNumbersTool />;
    case "to-pdf":
      return <ImageToPdfTool />;
    case "protect":
      return <ProtectPdfTool />;
    case "pdf-to-office":
      return <PdfToOfficeTool />;
    case "extract-pages":
      return <ExtractPagesTool />;
    case "delete-pages":
      return <DeletePagesTool />;
    case "pdf-to-jpg":
      return <PdfToJpgTool />;
    case "extract-images":
      return <ExtractImagesTool />;
    case "page-count":
      return <PageCountTool />;
    case "pdf-metadata":
      return <PdfMetadataTool />;
    case "flatten-pdf":
      return <FlattenPdfTool />;
    case "crop-pdf":
      return <CropPdfTool />;
    case "fill-forms":
      return <FillFormsTool />;
    case "pdf-to-text":
      return <PdfToTextTool />;
    case "resize-pdf":
      return <ResizePdfTool />;
    case "remove-metadata":
      return <RemoveMetadataTool />;
    case "image-watermark":
      return <ImageWatermarkTool />;
    case "add-text-box":
      return <AddTextBoxTool />;
    case "highlight-pdf":
      return <HighlightPdfTool />;
    case "redact-free":
      return <RedactFreeTool />;
    case "extract-attachments":
      return <ExtractAttachmentsTool />;
    case "invoice-generator":
      return <InvoiceGeneratorTool />;
    case "edit-pdf":
      return <EditPdfTool />;
    case "sign-pdf-free":
      return <SignPdfFreeTool />;
    case "repair-pdf":
      return <RepairPdfTool />;
    case "markdown-to-pdf":
      return <MarkdownToPdfTool />;
    case "text-to-pdf":
      return <TextToPdfTool />;
    case "pdf-to-markdown":
      return <PdfToMarkdownTool />;
    case "pdf-to-html":
      return <PdfToHtmlTool />;
    case "extract-form-data":
      return <ExtractFormDataTool />;
    case "sort-pages":
      return <SortPagesTool />;
    case "extract-contacts":
      return <ExtractContactsTool />;
    case "extract-dates":
      return <ExtractDatesTool />;
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
    default:
      return null;
  }
}

function ComingSoonRunner({ phaseLabel }: { phaseLabel: string }) {
  return (
    <div
      className="card"
      style={{
        marginTop: 32,
        padding: 56,
        textAlign: "center",
        borderStyle: "dashed",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 20px",
        }}
      >
        <I.Upload size={24} />
      </div>
      <h3 style={{ fontSize: 20, marginBottom: 8 }}>Drop your PDF here</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24, maxWidth: 420, margin: "0 auto 24px" }}>
        or choose from your computer — PDF · up to 100MB
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 10 }}>
        <button className="btn btn-primary" disabled>
          Choose file
        </button>
        <button className="btn btn-ghost" disabled>
          Use sample
        </button>
      </div>
      <p
        className="mono subtle"
        style={{ fontSize: 11, marginTop: 32, letterSpacing: "0.06em" }}
      >
        COMING SOON · TOOL RUNNER LANDS IN {phaseLabel}
      </p>
    </div>
  );
}

function ReassuranceCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof I;
  title: string;
  body: string;
}) {
  const Ic = I[icon];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          marginBottom: 12,
        }}
      >
        <Ic size={18} />
      </div>
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}
