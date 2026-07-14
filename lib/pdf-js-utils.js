const fs = require("fs");
const path = require("path");
const os = require("os");

let pdfjsPromise;
let canvasMods;

function ensureCanvasGlobals() {
  if (canvasMods) return canvasMods;
  const canvas = require("@napi-rs/canvas");
  global.DOMMatrix = canvas.DOMMatrix;
  global.ImageData = canvas.ImageData;
  global.Path2D = canvas.Path2D;
  canvasMods = canvas;
  return canvas;
}

async function getPdfjs() {
  if (!pdfjsPromise) {
    ensureCanvasGlobals();
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
          "pdfjs-dist/legacy/build/pdf.worker.mjs"
        );
      } catch {
        // ignore if resolve fails in some bundlers
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function extractTextFromPdf(buffer) {
  // Prefer pdf-parse (works without system binaries)
  try {
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    if (result?.text) return result.text;
  } catch {
    // fall through
  }

  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(" ");
    parts.push(text);
  }
  return parts.join("\n\n");
}

async function rasterizePdfToJpegs(buffer, { scale = 1.5, quality = 80 } = {}) {
  const { createCanvas } = ensureCanvasGlobals();
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  const images = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toBuffer("image/jpeg", quality));
  }
  return images;
}

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ilovepdf-"));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  extractTextFromPdf,
  rasterizePdfToJpegs,
  withTempDir,
  ensureCanvasGlobals,
};
