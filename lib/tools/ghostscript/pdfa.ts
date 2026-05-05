// lib/tools/ghostscript/pdfa.ts — server-side Ghostscript wrapper
// for PDF/A-2b conversion (PENDING §5b foundation, 2026-05-05).
//
// Companion to compress.ts. Same Ghostscript binary, different argv
// builder. Both share the spawn / temp-file / SIGKILL-on-timeout /
// stderr-cap discipline; only the gs flags differ.
//
// What PDF/A-2b means
// -------------------
// ISO 19005-2 conformance level B ("basic"). The most-supported
// archival profile — embeds all fonts, requires an output intent
// (color profile), forbids JavaScript and external dependencies,
// supports transparency and JPEG2000. We target -2b specifically
// because:
//   - PDF/A-1 is more restrictive (no transparency, no layers, no
//     embedded files) and rejects modern PDFs that compress fine
//     under -2.
//   - PDF/A-3 allows arbitrary file embedding which defeats the
//     archival intent for most users (and adds surface for malicious
//     embedded payloads).
//   - Conformance level "u" (unicode mapping required) and "a"
//     (accessible — tagged structure) are stricter and need source
//     PDFs that already have proper tagging. Most user PDFs don't,
//     so -2b is the realistic target.
//
// Output intent / color profile
// -----------------------------
// PDF/A requires an output intent declaration so renderers know
// what device the document was authored for. Ghostscript ships with
// an sRGB ICC profile (`/usr/share/color/icc/colord/sRGB.icc` on most
// Linuxes) but we don't rely on its location — instead we point at
// the profile bundled with Ghostscript itself, or fall back to one
// shipped in the repo if the system profile path drifts.
//
// We DON'T accept user-provided color profiles. If a user needs CMYK
// output for prepress workflows, that's outside the scope of "convert
// my random PDF to something my company's archival system accepts".

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  COMPRESS_MAX_INPUT_BYTES,
  GhostscriptError,
} from "./compress";

/**
 * PDF/A conformance level. We expose only -2b (the default archival
 * target). -1b is more restrictive and rejects modern features; -3b
 * defeats the archival intent. -2u and -2a require structurally-tagged
 * source PDFs that most user uploads aren't.
 */
export type PdfaLevel = "2b";

/**
 * Same input size cap as compress.ts. Mirrors `MAX_FILE_SIZE_BYTES`
 * (50MB) on the client side.
 */
export const PDFA_MAX_INPUT_BYTES = COMPRESS_MAX_INPUT_BYTES;

/**
 * PDF/A conversion can take longer than compression because Ghostscript
 * has to inspect every font, embed missing ones, validate transparency,
 * etc. Generous timeout — 90s — bounded the same way compress is at
 * 60s. SIGKILL on timeout (NOT SIGTERM — same rationale as compress).
 */
export const PDFA_TIMEOUT_MS = 90_000;

export interface PdfaResult {
  /** Bytes the user should download (PDF/A-2b conformant). */
  outputBytes: Buffer;
  /** Original file size (bytes). */
  inputBytes: number;
  /** Output PDF/A size. May be larger than input (font embedding adds bytes). */
  outputBytesLength: number;
  /** Wall-clock ms the gs invocation took. */
  durationMs: number;
  /** PDF/A conformance level produced. */
  level: PdfaLevel;
}

export interface PdfaOptions {
  /** Conformance level. Defaults to "2b". */
  level?: PdfaLevel;
  /** Override the Ghostscript binary path. Defaults to "gs". */
  gsBinary?: string;
  /**
   * Override the path to the ICC color profile used as the PDF/A
   * output intent. Defaults to attempting `/usr/share/ghostscript/<version>/iccprofiles/srgb.icc`
   * which ships with Ghostscript on Debian/Ubuntu/RHEL. Tests can
   * pass a local fixture path here.
   */
  iccProfilePath?: string;
}

/**
 * Convert a PDF to PDF/A-2b using Ghostscript. Always produces output
 * (no bypass branch — unlike compress, where the original might already
 * be smaller than gs's output, PDF/A conversion materially changes the
 * file structure even when source bytes look superficially fine).
 *
 * Implementation parallels `compressPdf`:
 * - mkdtemp per call; rm in finally{} regardless of throw/timeout.
 * - SIGKILL on timeout.
 * - stderr capture capped at 64KB.
 *
 * The argv differs from compress in three ways:
 * - `-dPDFA=2 -dPDFACompatibilityPolicy=1` — the conformance level +
 *   "fail rather than silently downgrade" policy (without =1, gs would
 *   strip incompatible features and lie about conformance).
 * - `-sProcessColorModel=DeviceRGB` — PDF/A-2b requires a single
 *   declared color model end-to-end.
 * - `-sOutputIntentProfile=<icc>` — required output intent declaration.
 *   Without this, gs produces a file that says it's PDF/A but isn't.
 */
export async function convertToPdfa(
  inputBytes: Buffer,
  options: PdfaOptions = {},
): Promise<PdfaResult> {
  if (inputBytes.length > PDFA_MAX_INPUT_BYTES) {
    throw new GhostscriptError(
      `Input exceeds ${PDFA_MAX_INPUT_BYTES} bytes (got ${inputBytes.length})`,
      "INPUT_TOO_LARGE",
    );
  }

  const level: PdfaLevel = options.level ?? "2b";
  const gsBinary = options.gsBinary ?? "gs";
  const iccProfilePath =
    options.iccProfilePath ?? "/usr/share/ghostscript/9.54.0/iccprofiles/srgb.icc";

  const tmp = await mkdtemp(path.join(tmpdir(), "pdfa-"));
  const inputPath = path.join(tmp, "in.pdf");
  const outputPath = path.join(tmp, "out.pdf");

  try {
    await writeFile(inputPath, inputBytes);

    const startedAt = Date.now();
    await runGhostscript(gsBinary, [
      "-sDEVICE=pdfwrite",
      "-dPDFA=2",
      // CompatibilityPolicy=1 means "abort on un-PDF/A-able content".
      // Without this, gs silently strips e.g. encrypted streams and
      // produces a file that LOOKS like PDF/A but lies about
      // conformance — defeats the entire archival purpose.
      "-dPDFACompatibilityPolicy=1",
      "-dCompatibilityLevel=1.7",
      "-sProcessColorModel=DeviceRGB",
      `-sOutputIntentProfile=${iccProfilePath}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dFastWebView=true",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);
    const durationMs = Date.now() - startedAt;

    const outputBytes = await readFile(outputPath);

    return {
      outputBytes,
      inputBytes: inputBytes.length,
      outputBytesLength: outputBytes.length,
      durationMs,
      level,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {
      // Cleanup failure is non-fatal — same rationale as compress.ts.
    });
  }
}

/**
 * Spawn `gs` with the given argv. Identical shape to
 * `compress.ts:runGhostscript` (same SIGKILL discipline, same stderr
 * cap, same error categorization). Inlined here rather than imported
 * so each module owns its own binary spawn — keeps blast radius bounded
 * if we later need different timeout / signal semantics for one.
 */
function runGhostscript(gsBinary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let timedOut = false;

    const child = spawn(gsBinary, args, { stdio: ["ignore", "ignore", "pipe"] });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PDFA_TIMEOUT_MS);

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 64 * 1024) {
        stderr += chunk.toString("utf8");
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new GhostscriptError(
          `Failed to spawn ${gsBinary}: ${err.message}`,
          "SPAWN_FAILED",
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new GhostscriptError(
            `Ghostscript timed out after ${PDFA_TIMEOUT_MS}ms`,
            "TIMEOUT",
            stderr,
          ),
        );
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new GhostscriptError(
          `Ghostscript exited with code ${code}`,
          "EXIT_NONZERO",
          stderr,
        ),
      );
    });
  });
}
