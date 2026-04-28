// lib/pdf/ops/stamp.ts
//
// Tier 5 (2026-04-28): text watermark / stamp. Draws a rotated text
// overlay on every page via pdf-lib drawText. Common patterns:
// "DRAFT", "CONFIDENTIAL", company name diagonal across the page.

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type StampPosition = "diagonal" | "center" | "top-center" | "bottom-center";

export interface StampOptions {
  text: string;
  position: StampPosition;
  /** 0–1. Default 0.3. */
  opacity?: number;
  /** Font size in points. Default 60 for diagonal, 36 for others. */
  fontSize?: number;
  /** Hex color (e.g. "#FF0000"). Default "#888888". */
  color?: string;
}

export interface StampResult {
  bytes: Uint8Array;
  pageCount: number;
}

export async function stampPdf(
  bytes: Uint8Array,
  opts: StampOptions,
): Promise<StampResult> {
  const text = opts.text.trim();
  if (!text) throw new Error("Watermark text is empty.");
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("This PDF has no pages.");

  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.3));
  const color = parseHex(opts.color ?? "#888888");
  const fontSize =
    opts.fontSize ?? (opts.position === "diagonal" ? 60 : 36);

  for (const page of doc.getPages()) {
    const { width: pw, height: ph } = page.getSize();
    const tw = font.widthOfTextAtSize(text, fontSize);
    const th = font.heightAtSize(fontSize);
    let x: number;
    let y: number;
    let rotate = 0;
    switch (opts.position) {
      case "diagonal": {
        // Rotate 45° around the page center. PDF rotates around the
        // text's anchor (lower-left), so we offset to keep it centered.
        rotate = 45;
        const cx = pw / 2;
        const cy = ph / 2;
        // Math: after rotating (tw/2, th/2) by 45° we land at
        // (tw/2 - th/2, tw/2 + th/2)/sqrt(2). Compute the anchor
        // offset that keeps the text's bbox center at (cx, cy).
        const cos = Math.cos((rotate * Math.PI) / 180);
        const sin = Math.sin((rotate * Math.PI) / 180);
        x = cx - (tw / 2) * cos + (th / 2) * sin;
        y = cy - (tw / 2) * sin - (th / 2) * cos;
        break;
      }
      case "center":
        x = (pw - tw) / 2;
        y = (ph - th) / 2;
        break;
      case "top-center":
        x = (pw - tw) / 2;
        y = ph - 60 - th;
        break;
      case "bottom-center":
      default:
        x = (pw - tw) / 2;
        y = 60;
        break;
    }
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: rotate ? degrees(rotate) : undefined,
    });
  }

  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, pageCount };
}

function parseHex(hex: string): ReturnType<typeof rgb> {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return rgb(0.53, 0.53, 0.53); // fallback gray
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}
