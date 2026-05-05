// /api/tools/pdf-a — server-side PDF → PDF/A-2b conversion via Ghostscript.
//
// PENDING_WORK_ANALYSIS.md §5b foundation. Companion to
// `/api/tools/compress` — same Ghostscript wrapper module
// (`lib/tools/ghostscript/`), different argv builder + flag.
//
// Behavior contract
// -----------------
// POST /api/tools/pdf-a
//   multipart body:
//     pdf       — required, application/pdf, ≤ 50MB
//
// (No `level` field — we expose only PDF/A-2b. -1b is too restrictive,
// -3b defeats archival intent, -2u/-2a need pre-tagged source PDFs.)
//
// Responses:
//   200 — JSON { outputBase64, inputBytes, outputBytesLength,
//                durationMs, level: "2b", outputFilename }
//   401 — not_authenticated
//   404 — feature_disabled (when PDF_A_CONVERT flag is off — same
//         shape as missing route to avoid leaking route existence)
//   400 — bad_request (missing pdf, wrong mime, no %PDF magic)
//   413 — payload_too_large (input > 50MB)
//   500 — pdfa_failed (gs spawn failure / timeout / non-zero exit —
//         most often "PDFACompatibilityPolicy=1 rejected this PDF
//         because it has un-PDF/A-able content like embedded JS or
//         encrypted streams")

import "server-only";

import { auth } from "@/auth";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/flags";
import {
  convertToPdfa,
  PDFA_MAX_INPUT_BYTES,
} from "@/lib/tools/ghostscript/pdfa";
import { GhostscriptError } from "@/lib/tools/ghostscript/compress";

// Node runtime — Ghostscript spawn + Node fs APIs don't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Feature flag gate -------------------------------------------
  if (!isFeatureEnabled(FEATURE_FLAGS.PDF_A_CONVERT, { userId })) {
    return json(404, { error: "feature_disabled" });
  }

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, {
      error: "bad_request",
      detail: "expected multipart/form-data",
    });
  }

  const pdfFile = form.get("pdf");
  if (!(pdfFile instanceof Blob)) {
    return json(400, {
      error: "bad_request",
      detail: "missing pdf file in 'pdf' field",
    });
  }

  if (pdfFile.size > PDFA_MAX_INPUT_BYTES) {
    return json(413, {
      error: "payload_too_large",
      detail: `file is ${pdfFile.size} bytes; max is ${PDFA_MAX_INPUT_BYTES}`,
    });
  }

  if (
    pdfFile.type &&
    pdfFile.type !== "application/pdf" &&
    pdfFile.type !== "application/octet-stream"
  ) {
    return json(400, {
      error: "bad_request",
      detail: `expected application/pdf, got ${pdfFile.type}`,
    });
  }

  const inputBytes = Buffer.from(await pdfFile.arrayBuffer());

  // %PDF magic header check
  if (
    inputBytes.length < 4 ||
    inputBytes[0] !== 0x25 || // '%'
    inputBytes[1] !== 0x50 || // 'P'
    inputBytes[2] !== 0x44 || // 'D'
    inputBytes[3] !== 0x46 //   'F'
  ) {
    return json(400, {
      error: "bad_request",
      detail: "file does not start with %PDF magic header",
    });
  }

  // -- 3. Run conversion -----------------------------------------------
  let result;
  try {
    result = await convertToPdfa(inputBytes);
  } catch (err) {
    if (err instanceof GhostscriptError) {
      console.error(
        `[pdf-a] Ghostscript ${err.code}: ${err.message}`,
        err.stderr ?? "",
      );
      return json(500, {
        error: "pdfa_failed",
        detail: err.code,
      });
    }
    console.error("[pdf-a] unexpected error:", err);
    return json(500, { error: "pdfa_failed", detail: "internal_error" });
  }

  // -- 4. Build response -----------------------------------------------
  const inputName =
    pdfFile instanceof File && pdfFile.name ? pdfFile.name : "input.pdf";
  const baseName = inputName.replace(/\.pdf$/i, "");
  const outputFilename = `${baseName}-pdfa.pdf`;

  return json(200, {
    outputBase64: result.outputBytes.toString("base64"),
    inputBytes: result.inputBytes,
    outputBytesLength: result.outputBytesLength,
    durationMs: result.durationMs,
    level: result.level,
    outputFilename,
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
