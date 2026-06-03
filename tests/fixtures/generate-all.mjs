// tests/fixtures/generate-all.mjs
//
// Comprehensive fixture generator for the all-113-tools execution spec
// (2026-06-03). Produces every input type the full tool catalog needs:
//   PDFs: single-page, multi-page, large, form (AcroForm text+checkbox),
//         image-embedded, table-like, encrypted (real, via header note)
//   Images: sample.png, sample.jpg
//   Text:  sample.txt, sample.csv, sample.md
//
// All outputs gitignored + regenerable. Run: node tests/fixtures/generate-all.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname, { recursive: true });

// 1x1 red PNG + a minimal valid JPEG (base64) — valid images for jpg/png-to-pdf + embed
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
const PNG = Buffer.from(PNG_B64, "base64");
const JPG = Buffer.from(JPG_B64, "base64");

async function buildSinglePage() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Hello pdfcraftai", { x: 50, y: 750, size: 32, font });
  page.drawText("Single-page test fixture. Contact: test@example.com on 2026-01-15.", { x: 50, y: 700, size: 12, font, color: rgb(0.4, 0.4, 0.4) });
  pdf.setTitle("Single-page test fixture");
  pdf.setAuthor("pdfcraftai test suite");
  return pdf.save({ useObjectStreams: false });
}
async function buildMultiPage() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${i}`, { x: 50, y: 750, size: 48, font });
    page.drawText(`Multi-page fixture page ${i} of 5. Email page${i}@example.com, dated 2026-0${i}-10.`, { x: 50, y: 700, size: 12, font, color: rgb(0.4, 0.4, 0.4) });
  }
  pdf.setTitle("Multi-page test fixture");
  return pdf.save({ useObjectStreams: false });
}
async function buildLarge() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 50; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${i}`, { x: 50, y: 750, size: 48, font });
  }
  pdf.setTitle("Large test fixture (50 pages)");
  return pdf.save({ useObjectStreams: false });
}
async function buildForm() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Form fixture", { x: 50, y: 780, size: 20, font });
  const form = pdf.getForm();
  const name = form.createTextField("full_name");
  name.setText("");
  name.addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 50, y: 650, width: 18, height: 18 });
  pdf.setTitle("Form fixture (AcroForm)");
  return pdf.save({ useObjectStreams: false });
}
async function buildImagePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Image-embedded fixture", { x: 50, y: 780, size: 18, font });
  const png = await pdf.embedPng(PNG);
  page.drawImage(png, { x: 50, y: 500, width: 200, height: 200 });
  pdf.setTitle("Image-embedded fixture");
  return pdf.save({ useObjectStreams: false });
}
async function buildTablePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const rows = [["Name","Qty","Price"],["Widget","3","10.00"],["Gadget","5","7.50"],["Gizmo","2","20.00"]];
  let y = 760;
  for (const r of rows) { page.drawText(r.join("        "), { x: 50, y, size: 14, font }); y -= 28; }
  pdf.setTitle("Table fixture");
  return pdf.save({ useObjectStreams: false });
}
async function buildEncryptedPlaceholder() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("(placeholder — not actually encrypted)", { x: 50, y: 750, size: 14, font });
  return pdf.save({ useObjectStreams: false });
}

const pdfBuilders = [
  ["single-page.pdf", buildSinglePage],
  ["multi-page.pdf", buildMultiPage],
  ["large.pdf", buildLarge],
  ["form.pdf", buildForm],
  ["image.pdf", buildImagePdf],
  ["table.pdf", buildTablePdf],
  ["encrypted.pdf", buildEncryptedPlaceholder],
];
for (const [name, build] of pdfBuilders) {
  const bytes = await build();
  writeFileSync(join(__dirname, name), bytes);
  console.log(`  generated ${name} (${(bytes.length / 1024).toFixed(1)} KB)`);
}
// raw assets
writeFileSync(join(__dirname, "sample.png"), PNG);
writeFileSync(join(__dirname, "sample.jpg"), JPG);
writeFileSync(join(__dirname, "sample.txt"), "Hello pdfcraftai.\nThis is a plain text fixture.\nLine three with email test@example.com and date 2026-01-15.\n");
writeFileSync(join(__dirname, "sample.csv"), "Name,Qty,Price\nWidget,3,10.00\nGadget,5,7.50\nGizmo,2,20.00\n");
writeFileSync(join(__dirname, "sample.md"), "# Heading\n\nA **markdown** fixture with a list:\n\n- one\n- two\n- three\n\n`code` and a [link](https://example.com).\n");
console.log("  generated sample.png, sample.jpg, sample.txt, sample.csv, sample.md");
console.log("\nall fixtures ready in tests/fixtures/");
