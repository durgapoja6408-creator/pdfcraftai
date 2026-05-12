#!/usr/bin/env node
// scripts/make-sample-pdf.mjs
//
// 2026-05-12 — generates public/sample.pdf for users without a PDF
// in hand to try any tool. SEV-1 audit fix: new visitors who landed
// on a tool page without a doc to drop had nothing to click and
// bounced. Sample is intentionally:
//   - 3 pages so split/merge/extract-pages have something to operate on
//   - text-rich so AI summarize / chat / translate have content
//   - branded so the file makes sense to share back as "look what I did"
//
// Re-run this script after content updates; the output is committed
// to git rather than rebuilt per-deploy because the content rarely
// changes and a static asset is faster than a runtime generator.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
doc.setTitle("pdfcraftai sample");
doc.setAuthor("pdfcraftai");
doc.setSubject("Sample PDF for tool exploration");
doc.setKeywords(["sample", "pdfcraftai", "free"]);
doc.setCreator("pdfcraftai sample generator");

const helv = await doc.embedFont(StandardFonts.Helvetica);
const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

// Page 1 — intro
const p1 = doc.addPage([612, 792]);
p1.drawText("pdfcraftai sample document", { x: 50, y: 720, size: 22, font: helvBold, color: rgb(0.15, 0.18, 0.25) });
p1.drawText("Page 1 of 3", { x: 50, y: 695, size: 11, font: helv, color: rgb(0.5, 0.5, 0.55) });
p1.drawText("This is a sample PDF you can use to try out any pdfcraftai tool", { x: 50, y: 650, size: 12, font: helv });
p1.drawText("without uploading your own file. Drop this PDF into:", { x: 50, y: 632, size: 12, font: helv });
p1.drawText("•  Merge — add a second PDF + see them combine", { x: 60, y: 600, size: 11, font: helv });
p1.drawText("•  Split — pull out specific pages", { x: 60, y: 580, size: 11, font: helv });
p1.drawText("•  AI Summarize — get a TL;DR", { x: 60, y: 560, size: 11, font: helv });
p1.drawText("•  PDF to Text — extract every word as .txt", { x: 60, y: 540, size: 11, font: helv });
p1.drawText("•  Add Page Numbers — stamp 1, 2, 3 on each page", { x: 60, y: 520, size: 11, font: helv });
p1.drawText("Every free tool runs in your browser. Your file never uploads.", { x: 50, y: 470, size: 11, font: helvBold, color: rgb(0.2, 0.5, 0.3) });

// Page 2 — middle content
const p2 = doc.addPage([612, 792]);
p2.drawText("Sample content (page 2 of 3)", { x: 50, y: 720, size: 18, font: helvBold });
p2.drawText("This page contains realistic text density so AI summarize, translate,", { x: 50, y: 680, size: 11, font: helv });
p2.drawText("and other content-aware tools have something to chew on. The content", { x: 50, y: 665, size: 11, font: helv });
p2.drawText("below describes pdfcraftai briefly — what it is, what makes it different.", { x: 50, y: 650, size: 11, font: helv });
p2.drawText("What is pdfcraftai?", { x: 50, y: 610, size: 14, font: helvBold });
p2.drawText("pdfcraftai is a complete PDF toolkit — over 120 tools spanning everyday", { x: 50, y: 590, size: 11, font: helv });
p2.drawText("operations (merge, split, compress, convert) and AI-powered workflows", { x: 50, y: 575, size: 11, font: helv });
p2.drawText("(summarize, translate, chat-with-PDF, redact sensitive data, extract", { x: 50, y: 560, size: 11, font: helv });
p2.drawText("structured tables). Free tools run in your browser via WebAssembly;", { x: 50, y: 545, size: 11, font: helv });
p2.drawText("AI tools run server-side with credit-based pricing.", { x: 50, y: 530, size: 11, font: helv });
p2.drawText("What makes it different?", { x: 50, y: 490, size: 14, font: helvBold });
p2.drawText("Privacy-first — client-side execution for any tool that doesn't strictly", { x: 50, y: 470, size: 11, font: helv });
p2.drawText("need a server. Honest pricing — paid credits never expire, refundable", { x: 50, y: 455, size: 11, font: helv });
p2.drawText("for 14 days. Indian-first — INR pricing, GST invoicing, Razorpay rail.", { x: 50, y: 440, size: 11, font: helv });

// Page 3 — closing
const p3 = doc.addPage([612, 792]);
p3.drawText("Try a tool with this sample (page 3 of 3)", { x: 50, y: 720, size: 18, font: helvBold });
p3.drawText("Visit pdfcraftai.com/compare to see all 12 verb-led intent groups and", { x: 50, y: 680, size: 11, font: helv });
p3.drawText("pick the tool that fits what you want to do.", { x: 50, y: 665, size: 11, font: helv });
p3.drawText("Or pick directly from these starters:", { x: 50, y: 625, size: 12, font: helvBold });
p3.drawText("•  pdfcraftai.com/tool/merge — combine PDFs", { x: 60, y: 595, size: 11, font: helv });
p3.drawText("•  pdfcraftai.com/tool/split — split into ranges", { x: 60, y: 575, size: 11, font: helv });
p3.drawText("•  pdfcraftai.com/tool/ai-summarize — AI TL;DR", { x: 60, y: 555, size: 11, font: helv });
p3.drawText("•  pdfcraftai.com/tool/ai-chat — chat with this PDF", { x: 60, y: 535, size: 11, font: helv });
p3.drawText("— pdfcraftai team", { x: 50, y: 100, size: 10, font: helv, color: rgb(0.5, 0.5, 0.55) });

const bytes = await doc.save();
writeFileSync("public/sample.pdf", bytes);
console.log(`Wrote public/sample.pdf (${bytes.length} bytes, ${doc.getPageCount()} pages)`);
