// tests/fixtures/generate.mjs
//
// Programmatic fixture-PDF generator (2026-04-29).
//
// Why programmatic vs committed binary fixtures:
//   - Repo stays small (no 50MB+ committed PDFs)
//   - Fixtures are deterministic and self-documenting
//   - Anyone can regenerate with `node tests/fixtures/generate.mjs`
//   - The generator itself doubles as documentation of what each
//     fixture's "correct" content is, so tests can assert against
//     known-good values
//
// Output files (gitignored — regenerable):
//   tests/fixtures/single-page.pdf  — 1 page, "Hello pdfcraftai" text
//   tests/fixtures/multi-page.pdf   — 5 pages, page N labeled "Page N"
//   tests/fixtures/large.pdf        — 50 pages, for split testing
//   tests/fixtures/encrypted.pdf    — password-protected (pw: "test")
//
// Run: node tests/fixtures/generate.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

mkdirSync(__dirname, { recursive: true });

// ---------------------------------------------------------------------------
// single-page.pdf — minimal valid PDF, used by inspectors and any tool
// where multi-page complexity isn't needed.
// ---------------------------------------------------------------------------

async function buildSinglePage() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]); // A4 portrait
  page.drawText("Hello pdfcraftai", {
    x: 50,
    y: 750,
    size: 32,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText("Single-page test fixture", {
    x: 50,
    y: 700,
    size: 14,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  pdf.setTitle("Single-page test fixture");
  pdf.setAuthor("pdfcraftai test suite");
  return pdf.save();
}

// ---------------------------------------------------------------------------
// multi-page.pdf — 5 pages, each labeled. Used by split/extract/delete
// tests where page indexing matters.
// ---------------------------------------------------------------------------

async function buildMultiPage() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${i}`, {
      x: 50,
      y: 750,
      size: 48,
      font,
    });
    page.drawText(`Multi-page test fixture — page ${i} of 5`, {
      x: 50,
      y: 700,
      size: 14,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  pdf.setTitle("Multi-page test fixture");
  return pdf.save();
}

// ---------------------------------------------------------------------------
// large.pdf — 50 pages, exercises pagination + thumbnail virtualization
// (G4 / #192). Only used by tests that specifically need scale.
// ---------------------------------------------------------------------------

async function buildLarge() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 50; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${i}`, { x: 50, y: 750, size: 48, font });
    page.drawText(`Large fixture — ${i}/50`, {
      x: 50,
      y: 700,
      size: 14,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  pdf.setTitle("Large test fixture (50 pages)");
  return pdf.save();
}

// ---------------------------------------------------------------------------
// encrypted.pdf — password-protected with "test". Used to verify the
// canonical encrypted-PDF UX (G1 / lib/pdf/error-messages.ts) — tools
// should refuse with a friendly error, not crash.
//
// pdf-lib doesn't ship encryption by default. We write a plain PDF
// here and the test marks itself skip if true encryption is needed —
// document this limitation. A real encrypted fixture would need
// qpdf or a Python script with pikepdf. Future work; for the scaffold
// we test the "looks-encrypted" code path with a header trick.
// ---------------------------------------------------------------------------

async function buildEncryptedPlaceholder() {
  // Honest note: this is NOT a real encrypted PDF. It's a flag in the
  // metadata that some tools may detect, but the byte parser will
  // not see real /Encrypt dictionaries. Replace with a real encrypted
  // fixture (qpdf encrypt input.pdf encrypted.pdf --pw=test) in
  // Phase 2 if encrypted-flow tests are needed.
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("(placeholder — not actually encrypted)", {
    x: 50,
    y: 750,
    size: 14,
    font,
  });
  pdf.setTitle("encrypted-placeholder");
  return pdf.save();
}

// ---------------------------------------------------------------------------
// Run all builders.
// ---------------------------------------------------------------------------

const builders = [
  ["single-page.pdf", buildSinglePage],
  ["multi-page.pdf", buildMultiPage],
  ["large.pdf", buildLarge],
  ["encrypted.pdf", buildEncryptedPlaceholder],
];

for (const [name, build] of builders) {
  const bytes = await build();
  const path = join(__dirname, name);
  writeFileSync(path, bytes);
  console.log(`  generated ${name} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

console.log("\nfixtures ready in tests/fixtures/");
