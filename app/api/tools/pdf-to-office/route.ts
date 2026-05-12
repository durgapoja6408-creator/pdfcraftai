// /api/tools/pdf-to-office — Free server-side PDF → Office conversion.
//
// Why not client-side like merge/split?
//   - Reliable PDF text extraction requires pdfjs-dist's worker. That
//     worker needs CSP-friendly bundling under Next.js + our strict
//     script-src. Doing it server-side avoids an entire class of
//     bundling/CSP headaches while reusing the extractor that already
//     powers /api/ai/chat and /api/ai/summarize.
//   - Keeps the `docx` library (~170 KB gz) out of the client bundle
//     so the home page budget stays clean.
//
// This route is a FREE tool — no auth required, no credit spend, no
// ledger entry. We do not write anything to disk: the PDF bytes live
// in this worker's memory for the lifetime of the request and the
// output bytes are streamed straight back in the response.
//
// Rate/size limits:
//   - Max request body: 25 MB (matches the AI tool ceiling).
//   - Per-IP throttle: 10 conversions per minute. Generous enough for
//     normal use; tight enough to stop a scraper from burning CPU.
//
// Error responses follow the project's convention:
//   - 400 malformed form / not a PDF / invalid format selector
//   - 413 PDF too large
//   - 422 { error: "no_extractable_text" } — looked scanned
//   - 429 rate-limited
//   - 500 unexpected — logged, never leaks DB or stack

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { convertPdfToOffice, type PdfToOfficeFormat } from "@/lib/tools-server/pdf-to-office";

// pdfjs-dist's legacy build + docx library are Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

const formatSchema = z.enum(["docx", "txt"]);

// 2026-05-12 SEV-1 audit mitigation: route is intentionally public
// (free tool, no auth wall) but the audit flagged abuse vectors —
// IP-rotation defeats the per-IP rate limit, no Turnstile, no
// global quota. Defenses added in this layer:
//
//   1. PDF_TO_OFFICE_DISABLED env kill-switch — operator panic
//      button when abuse spikes (returns 503 instantly).
//   2. Authenticated users get 3× the per-minute quota (30/min vs
//      10/min) so logged-in real users aren't penalised when
//      anonymous abuse causes the limit to tighten.
//   3. Per-IP bucket + auth bucket each have their own count so
//      authed users on the same IP don't get throttled by an
//      anonymous abuser on the same NAT.
//
// Deeper defense — Turnstile token verification for anonymous calls
// — is documented as deferred: it requires the client component to
// emit a `cf-turnstile-response` form field, which is multi-touch
// and warrants a focused commit.
const attempts = new Map<string, { count: number; minute: number }>();
const PER_MINUTE_LIMIT_ANONYMOUS = 10;
const PER_MINUTE_LIMIT_AUTHED = 30;

function ipBucket(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request): Promise<Response> {
  // ---- Kill switch (SEV-1 panic button) ------------------------------
  if (
    process.env.PDF_TO_OFFICE_DISABLED === "true" ||
    process.env.PDF_TO_OFFICE_DISABLED === "1"
  ) {
    return NextResponse.json(
      {
        error: "tool_disabled",
        detail:
          "PDF to Office is temporarily unavailable for maintenance. Try again later or use Extract Text as a workaround.",
      },
      { status: 503 },
    );
  }

  // ---- Auth probe (no auth required; used to choose quota tier) ------
  // Anonymous calls keep the original 10/min ceiling; authenticated
  // users get 30/min so real activity isn't throttled by anonymous
  // abuse on the same IP/network.
  let isAuthed = false;
  try {
    const session = await auth();
    isAuthed = Boolean(session?.user);
  } catch {
    // auth() should never throw, but if it does, downgrade to
    // anonymous-tier (safer floor) and continue.
    isAuthed = false;
  }
  const perMinuteLimit = isAuthed
    ? PER_MINUTE_LIMIT_AUTHED
    : PER_MINUTE_LIMIT_ANONYMOUS;

  // ---- Rate limit ----------------------------------------------------
  // Separate buckets per auth tier so the anonymous count can't bleed
  // into the authed budget.
  const ip = ipBucket(req);
  const bucketKey = `${isAuthed ? "u" : "a"}:${ip}`;
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = attempts.get(bucketKey);
  if (bucket && bucket.minute === minute) {
    if (bucket.count >= perMinuteLimit) {
      return NextResponse.json(
        {
          error: "rate_limited",
          detail: isAuthed
            ? "Too many conversions. Try again in a minute."
            : "Too many conversions from your network. Try again in a minute, or sign in for a higher per-minute quota.",
        },
        { status: 429 },
      );
    }
    bucket.count += 1;
  } else {
    attempts.set(bucketKey, { count: 1, minute });
  }

  // ---- Parse multipart body ------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const pdf = form.get("pdf");
  const rawFormat = form.get("format");

  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json(
      { error: "bad_request", detail: "pdf file is required" },
      { status: 400 },
    );
  }
  if (pdf.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "pdf_too_large", detail: "PDF must be ≤ 25 MB." },
      { status: 413 },
    );
  }

  const formatResult = formatSchema.safeParse(
    typeof rawFormat === "string" ? rawFormat : "docx",
  );
  if (!formatResult.success) {
    return NextResponse.json(
      {
        error: "bad_request",
        detail: "format must be one of: docx, txt",
      },
      { status: 400 },
    );
  }
  const format: PdfToOfficeFormat = formatResult.data;

  // ---- Convert -------------------------------------------------------
  let result;
  try {
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    result = await convertPdfToOffice(bytes, format, pdf.name);
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;

    if (code === "no_extractable_text") {
      return NextResponse.json(
        {
          error: "no_extractable_text",
          detail:
            (err as Error).message ||
            "This PDF appears to be a scan with no extractable text.",
        },
        { status: 422 },
      );
    }

    // Malformed PDFs throw a generic Error from pdfjs. Map to 400 so
    // the UI tells the user the file is broken rather than "server
    // error".
    const message = err instanceof Error ? err.message : String(err);
    const looksLikePdfError =
      /invalid pdf|missing xref|unexpected end of file|pdf structure/i.test(message);

    if (looksLikePdfError) {
      return NextResponse.json(
        { error: "invalid_pdf", detail: "That file doesn't look like a valid PDF." },
        { status: 400 },
      );
    }

    console.error("[pdf-to-office] conversion failed", { code, message });
    return NextResponse.json(
      { error: "server_error", detail: "Conversion failed. Try again in a moment." },
      { status: 500 },
    );
  }

  // ---- Stream the blob back ------------------------------------------
  //
  // Custom headers:
  //   - x-page-count: how many PDF pages we processed
  //   - x-ocr-candidate-pages: comma-list of pages that looked scanned
  //     (so the client can surface "heads-up — N pages were scanned")
  //   - Content-Disposition: attachment with a safe, filesystem-valid
  //     filename
  const safeFilename = encodeURIComponent(result.filename);
  const headers = new Headers({
    "Content-Type": result.contentType,
    "Content-Length": String(result.bytes.byteLength),
    "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"; filename*=UTF-8''${safeFilename}`,
    "Cache-Control": "no-store",
    "x-page-count": String(result.pageCount),
    "x-ocr-candidate-pages": result.ocrCandidatePages.join(","),
  });

  return new Response(result.bytes, { status: 200, headers });
}
