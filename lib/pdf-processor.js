const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { PDFDocument, StandardFonts, rgb, degrees, PageSizes } = require("pdf-lib");
const JSZip = require("jszip");
const sharp = require("sharp");
const {
  qpdfCommand,
  hasGs,
  hasPdftoppm,
  hasPdftotext,
  hasSoffice,
  hasTesseract,
  sofficeCmd,
} = require("./binaries");
const {
  extractTextFromPdf,
  rasterizePdfToJpegs,
  withTempDir,
} = require("./pdf-js-utils");

const LOCAL_CHROME =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout = Buffer.concat([stdout, d]);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`${cmd} failed (${code}): ${stderr || "unknown error"}`);
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function safeName(name, fallback = "file.pdf") {
  const base = path.basename(name || fallback).replace(/[^\w.\- ()[\]]+/g, "_");
  return base || fallback;
}

async function loadPdf(bytes) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function runQpdf(args) {
  const q = qpdfCommand();
  if (!q) throw new Error("qpdf is not available");
  return run(q.cmd, args, { env: q.env });
}

async function extractText(buffer) {
  if (hasPdftotext()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      fs.writeFileSync(input, buffer);
      const { stdout } = await run("pdftotext", ["-layout", input, "-"]);
      return stdout.toString("utf8");
    });
  }
  return extractTextFromPdf(buffer);
}

async function rasterizePdf(buffer, opts = {}) {
  if (hasPdftoppm()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      fs.writeFileSync(input, buffer);
      const prefix = path.join(dir, "page");
      await run("pdftoppm", ["-jpeg", "-r", String(opts.dpi || 150), input, prefix]);
      return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("page") && f.endsWith(".jpg"))
        .sort()
        .map((f) => fs.readFileSync(path.join(dir, f)));
    });
  }
  return rasterizePdfToJpegs(buffer, {
    scale: opts.scale || 1.5,
    quality: opts.quality || 80,
  });
}

async function mergePdfs(files) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await loadPdf(file.buffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return {
    buffer: Buffer.from(await out.save()),
    filename: "merged.pdf",
    contentType: "application/pdf",
  };
}

async function splitPdf(files, options = {}) {
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const mode = options.mode || "pages";
  const zip = new JSZip();

  if (mode === "range" && options.ranges) {
    const ranges = parseRanges(options.ranges, src.getPageCount());
    let i = 1;
    for (const range of ranges) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, range);
      pages.forEach((p) => doc.addPage(p));
      zip.file(`split-${i}.pdf`, await doc.save());
      i += 1;
    }
  } else {
    for (let i = 0; i < src.getPageCount(); i++) {
      const doc = await PDFDocument.create();
      const [page] = await doc.copyPages(src, [i]);
      doc.addPage(page);
      zip.file(`page-${i + 1}.pdf`, await doc.save());
    }
  }

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
    filename: "split-pdfs.zip",
    contentType: "application/zip",
  };
}

function parseRanges(text, pageCount) {
  const parts = String(text)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ranges = [];
  for (const part of parts) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((n) => parseInt(n, 10));
      if (!a || !b || a < 1 || b > pageCount || a > b) {
        throw new Error(`Invalid range: ${part}`);
      }
      const idx = [];
      for (let i = a; i <= b; i++) idx.push(i - 1);
      ranges.push(idx);
    } else {
      const n = parseInt(part, 10);
      if (!n || n < 1 || n > pageCount) throw new Error(`Invalid page: ${part}`);
      ranges.push([n - 1]);
    }
  }
  if (!ranges.length) throw new Error("No pages selected");
  return ranges;
}

async function compressPdf(files) {
  const file = files[0];
  if (hasGs()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      const output = path.join(dir, "compressed.pdf");
      fs.writeFileSync(input, file.buffer);
      await run("gs", [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${output}`,
        input,
      ]);
      const base = safeName(file.filename, "document.pdf").replace(/\.pdf$/i, "");
      return {
        buffer: fs.readFileSync(output),
        filename: `${base}-compressed.pdf`,
        contentType: "application/pdf",
      };
    });
  }

  // JS fallback: rasterize at reduced quality and rebuild
  const images = await rasterizePdf(file.buffer, { scale: 1.2, quality: 55, dpi: 110 });
  const doc = await PDFDocument.create();
  for (const jpg of images) {
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const base = safeName(file.filename, "document.pdf").replace(/\.pdf$/i, "");
  return {
    buffer: Buffer.from(await doc.save()),
    filename: `${base}-compressed.pdf`,
    contentType: "application/pdf",
  };
}

async function rotatePdf(files, options = {}) {
  const angle = Number(options.angle || 90);
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await loadPdf(file.buffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => {
      p.setRotation(degrees((p.getRotation().angle + angle) % 360));
      out.addPage(p);
    });
  }
  return {
    buffer: Buffer.from(await out.save()),
    filename: "rotated.pdf",
    contentType: "application/pdf",
  };
}

async function organizePdf(files, options = {}) {
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const order = options.order
    ? String(options.order)
        .split(",")
        .map((n) => parseInt(n, 10) - 1)
    : src.getPageIndices();
  const valid = order.filter((i) => i >= 0 && i < src.getPageCount());
  if (!valid.length) throw new Error("No valid page order");
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, valid);
  pages.forEach((p) => doc.addPage(p));
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "organized.pdf",
    contentType: "application/pdf",
  };
}

async function addPageNumbers(files, options = {}) {
  const position = options.position || "bottom-center";
  const start = Number(options.start || 1);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  for (const file of files) {
    const src = await loadPdf(file.buffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page, idx) => {
      out.addPage(page);
      const { width, height } = page.getSize();
      const text = String(start + idx);
      const textWidth = font.widthOfTextAtSize(text, 12);
      let x = (width - textWidth) / 2;
      let y = 24;
      if (position === "bottom-left") x = 24;
      if (position === "bottom-right") x = width - textWidth - 24;
      if (position === "top-center") y = height - 36;
      if (position === "top-left") {
        x = 24;
        y = height - 36;
      }
      if (position === "top-right") {
        x = width - textWidth - 24;
        y = height - 36;
      }
      page.drawText(text, { x, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    });
  }

  return {
    buffer: Buffer.from(await out.save()),
    filename: "numbered.pdf",
    contentType: "application/pdf",
  };
}

async function addWatermark(files, options = {}) {
  const text = options.text || "CONFIDENTIAL";
  const opacity = Math.min(1, Math.max(0.05, Number(options.opacity || 0.25)));
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.HelveticaBold);

  for (const file of files) {
    const src = await loadPdf(file.buffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page) => {
      out.addPage(page);
      const { width, height } = page.getSize();
      const size = Math.min(width, height) / 8;
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.7, 0.7, 0.7),
        opacity,
        rotate: degrees(45),
      });
    });
  }

  return {
    buffer: Buffer.from(await out.save()),
    filename: "watermarked.pdf",
    contentType: "application/pdf",
  };
}

async function protectPdf(files, options = {}) {
  const password = options.password;
  if (!password) throw new Error("Password is required");
  const file = files[0];
  return withTempDir(async (dir) => {
    const input = path.join(dir, "input.pdf");
    const output = path.join(dir, "protected.pdf");
    fs.writeFileSync(input, file.buffer);
    await runQpdf(["--encrypt", password, password, "256", "--", input, output]);
    return {
      buffer: fs.readFileSync(output),
      filename: "protected.pdf",
      contentType: "application/pdf",
    };
  });
}

async function unlockPdf(files, options = {}) {
  const password = options.password || "";
  const file = files[0];
  if (qpdfCommand()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      const output = path.join(dir, "unlocked.pdf");
      fs.writeFileSync(input, file.buffer);
      const args = password
        ? [`--password=${password}`, "--decrypt", input, output]
        : ["--decrypt", input, output];
      await runQpdf(args);
      return {
        buffer: fs.readFileSync(output),
        filename: "unlocked.pdf",
        contentType: "application/pdf",
      };
    });
  }
  // Best-effort: reload ignoring encryption and rewrite
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "unlocked.pdf",
    contentType: "application/pdf",
  };
}

async function imagesToPdf(files) {
  const doc = await PDFDocument.create();
  for (const file of files) {
    const normalized = await sharp(file.buffer).rotate().jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(normalized).metadata();
    const img = await doc.embedJpg(normalized);
    const page = doc.addPage([meta.width || img.width, meta.height || img.height]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "images.pdf",
    contentType: "application/pdf",
  };
}

async function pdfToJpg(files) {
  const file = files[0];
  const pages = await rasterizePdf(file.buffer, { dpi: 150, scale: 1.5, quality: 85 });
  if (!pages.length) throw new Error("No pages converted");
  if (pages.length === 1) {
    return {
      buffer: pages[0],
      filename: "page-1.jpg",
      contentType: "image/jpeg",
    };
  }
  const zip = new JSZip();
  pages.forEach((buf, i) => zip.file(`page-${i + 1}.jpg`, buf));
  return {
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
    filename: "pdf-images.zip",
    contentType: "application/zip",
  };
}

async function cropPdf(files, options = {}) {
  const margin = Number(options.margin || 36);
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  for (const i of src.getPageIndices()) {
    const [page] = await doc.copyPages(src, [i]);
    const { width, height } = page.getSize();
    const m = Math.min(margin, width / 4, height / 4);
    page.setCropBox(m, m, width - 2 * m, height - 2 * m);
    doc.addPage(page);
  }
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "cropped.pdf",
    contentType: "application/pdf",
  };
}

async function pdfToPdfA(files) {
  const file = files[0];
  if (hasGs()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      const output = path.join(dir, "pdfa.pdf");
      fs.writeFileSync(input, file.buffer);
      await run("gs", [
        "-dPDFA=2",
        "-dBATCH",
        "-dNOPAUSE",
        "-dNOOUTERSAVE",
        "-sProcessColorModel=DeviceRGB",
        "-sDEVICE=pdfwrite",
        "-dPDFACompatibilityPolicy=1",
        `-sOutputFile=${output}`,
        input,
      ]);
      return {
        buffer: fs.readFileSync(output),
        filename: "document-pdfa.pdf",
        contentType: "application/pdf",
      };
    });
  }
  // Best-effort rewrite for environments without Ghostscript
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "document-pdfa.pdf",
    contentType: "application/pdf",
  };
}

async function repairPdf(files) {
  const file = files[0];
  if (qpdfCommand()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      const output = path.join(dir, "repaired.pdf");
      fs.writeFileSync(input, file.buffer);
      await runQpdf(["--linearize", input, output]);
      return {
        buffer: fs.readFileSync(output),
        filename: "repaired.pdf",
        contentType: "application/pdf",
      };
    });
  }
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "repaired.pdf",
    contentType: "application/pdf",
  };
}

async function packResults(results, contentType, ext) {
  if (results.length === 1) {
    return {
      buffer: results[0].buffer,
      filename: results[0].name,
      contentType,
    };
  }
  const zip = new JSZip();
  results.forEach((r) => zip.file(r.name, r.buffer));
  return {
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
    filename: `converted-${ext}.zip`,
    contentType: "application/zip",
  };
}

async function libreOfficeConvert(files, outExt) {
  const cmd = sofficeCmd();
  if (!cmd) throw new Error("LibreOffice is not available");
  return withTempDir(async (dir) => {
    const results = [];
    for (const file of files) {
      const inName = safeName(file.filename, `input.${outExt === "pdf" ? "docx" : "pdf"}`);
      const input = path.join(dir, inName);
      fs.writeFileSync(input, file.buffer);
      await run(
        cmd,
        ["--headless", "--nologo", "--nofirststartwizard", "--convert-to", outExt, "--outdir", dir, input],
        { env: { ...process.env, HOME: dir } }
      );
      const expected = path.join(dir, path.basename(inName, path.extname(inName)) + `.${outExt}`);
      const converted =
        fs
          .readdirSync(dir)
          .find((f) => f.toLowerCase().endsWith(`.${outExt}`) && f !== inName) ||
        (fs.existsSync(expected) ? path.basename(expected) : null);
      if (!converted) throw new Error(`Conversion to ${outExt} failed for ${file.filename}`);
      results.push({
        name: converted,
        buffer: fs.readFileSync(path.join(dir, converted)),
      });
    }
    const mime =
      outExt === "pdf"
        ? "application/pdf"
        : outExt === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : outExt === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : outExt === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/octet-stream";
    return packResults(results, mime, outExt);
  });
}

async function htmlStringToPdf(html, filename = "document.pdf") {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 45000 });
    const buffer = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      })
    );
    return { buffer, filename, contentType: "application/pdf" };
  } finally {
    await browser.close();
  }
}

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  const launch = puppeteer.default?.launch || puppeteer.launch;

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    const chromium = require("@sparticuz/chromium");
    return launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  if (fs.existsSync(LOCAL_CHROME)) {
    return launch({
      executablePath: LOCAL_CHROME,
      headless: "new",
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
  }

  // Last resort: system chrome
  return launch({
    executablePath: process.env.CHROME_PATH || "google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
}

async function officeToPdf(files) {
  if (hasSoffice()) {
    return libreOfficeConvert(files, "pdf");
  }

  const results = [];
  for (const file of files) {
    const name = safeName(file.filename).toLowerCase();
    let html;
    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = require("mammoth");
      const converted = await mammoth.convertToHtml({ buffer: file.buffer });
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.5;padding:24px}</style></head><body>${converted.value}</body></html>`;
    } else {
      // Generic binary office fallback: note page
      html = `<!DOCTYPE html><html><body style="font-family:Arial;padding:40px"><h1>${safeName(file.filename)}</h1><p>Converted without LibreOffice. For best fidelity, deploy with LibreOffice installed.</p></body></html>`;
    }
    const pdf = await htmlStringToPdf(html, safeName(file.filename).replace(/\.\w+$/, "") + ".pdf");
    results.push({ name: pdf.filename, buffer: pdf.buffer });
  }
  return packResults(results, "application/pdf", "pdf");
}

async function pdfToWord(files) {
  if (hasSoffice()) {
    try {
      return await libreOfficeConvert(files, "docx");
    } catch {
      // fall through
    }
  }
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
  const results = [];
  for (const file of files) {
    const text = await extractText(file.buffer);
    const paragraphs = text.split(/\n/).map(
      (line) => new Paragraph({ children: [new TextRun({ text: line || " ", size: 22 })] })
    );
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: safeName(file.filename).replace(/\.pdf$/i, ""),
              heading: HeadingLevel.HEADING_1,
            }),
            ...paragraphs,
          ],
        },
      ],
    });
    results.push({
      name: safeName(file.filename).replace(/\.pdf$/i, "") + ".docx",
      buffer: await Packer.toBuffer(doc),
    });
  }
  return packResults(
    results,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx"
  );
}

async function pdfToExcel(files) {
  if (hasSoffice()) {
    try {
      return await libreOfficeConvert(files, "xlsx");
    } catch {
      // fall through
    }
  }
  const ExcelJS = require("exceljs");
  const results = [];
  for (const file of files) {
    const text = await extractText(file.buffer);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("PDF Data");
    text.split(/\n/).forEach((line, i) => {
      const cols = line.trim().split(/\s{2,}|\t/);
      ws.addRow(cols.length > 1 ? cols : [line]);
      if (i === 0) ws.getRow(1).font = { bold: true };
    });
    results.push({
      name: safeName(file.filename).replace(/\.pdf$/i, "") + ".xlsx",
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    });
  }
  return packResults(
    results,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx"
  );
}

async function pdfToPowerpoint(files) {
  if (hasSoffice()) {
    try {
      return await libreOfficeConvert(files, "pptx");
    } catch {
      // fall through
    }
  }
  const PptxGenJS = require("pptxgenjs");
  const results = [];
  for (const file of files) {
    const pages = await rasterizePdf(file.buffer, { scale: 1.3, quality: 75, dpi: 120 });
    const pptx = new PptxGenJS();
    for (const page of pages) {
      const slide = pptx.addSlide();
      slide.addImage({
        data: `data:image/jpeg;base64,${page.toString("base64")}`,
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
      });
    }
    if (!pages.length) {
      const text = await extractText(file.buffer);
      const slide = pptx.addSlide();
      slide.addText(text.slice(0, 4000) || "(empty)", {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 5,
        fontSize: 14,
      });
    }
    results.push({
      name: safeName(file.filename).replace(/\.pdf$/i, "") + ".pptx",
      buffer: Buffer.from(await pptx.write({ outputType: "nodebuffer" })),
    });
  }
  return packResults(
    results,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx"
  );
}

async function htmlToPdf(options = {}) {
  const url = options.url;
  if (!url) throw new Error("URL is required");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    const buffer = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      })
    );
    return {
      buffer,
      filename: "webpage.pdf",
      contentType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}

async function pdfToMarkdown(files) {
  const text = (await extractText(files[0].buffer)).trim() || "(No extractable text)";
  const md = `# Extracted from PDF\n\n${text}\n`;
  return {
    buffer: Buffer.from(md, "utf8"),
    filename: "document.md",
    contentType: "text/markdown; charset=utf-8",
  };
}

async function summarizePdf(files) {
  const text = (await extractText(files[0].buffer)).replace(/\s+/g, " ").trim();
  if (!text) throw new Error("No extractable text found in PDF");
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  const summary = (sentences.slice(0, 8).join(" ") || text.slice(0, 1200)).trim();
  const md = `# AI Summarizer (extractive)\n\n${summary}\n\n---\n_Generated from document text without external AI APIs._\n`;
  return {
    buffer: Buffer.from(md, "utf8"),
    filename: "summary.md",
    contentType: "text/markdown; charset=utf-8",
  };
}

function wrapText(text, width) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > width) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function translatePdf(files, options = {}) {
  const text = (await extractText(files[0].buffer)).trim();
  if (!text) throw new Error("No extractable text found in PDF");
  const target = options.lang || "es";
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(PageSizes.Letter);
  const { height } = page.getSize();
  const lines = wrapText(
    `[Translated excerpt -> ${target}]\n\n${text.slice(0, 3500)}\n\n(Note: full neural translation requires an API key. This export preserves extractable text for downstream translation.)`,
    90
  );
  let y = height - 48;
  for (const line of lines) {
    if (y < 48) break;
    page.drawText(line, { x: 48, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "translated.pdf",
    contentType: "application/pdf",
  };
}

async function comparePdf(files) {
  if (files.length < 2) throw new Error("Upload two PDF files to compare");
  const textA = await extractText(files[0].buffer);
  const textB = await extractText(files[1].buffer);
  const report = `# PDF comparison\n\n## File A: ${safeName(files[0].filename)}\nChars: ${textA.length}\n\n## File B: ${safeName(files[1].filename)}\nChars: ${textB.length}\n\n## Diff summary\n${textA === textB ? "Extracted text is identical." : "Extracted text differs."}\n\n### A excerpt\n\n\`\`\`\n${textA.slice(0, 2000)}\n\`\`\`\n\n### B excerpt\n\n\`\`\`\n${textB.slice(0, 2000)}\n\`\`\`\n`;
  return {
    buffer: Buffer.from(report, "utf8"),
    filename: "comparison.md",
    contentType: "text/markdown; charset=utf-8",
  };
}

async function redactPdf(files, options = {}) {
  const terms = String(options.terms || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!terms.length) throw new Error("Enter words/phrases to redact (comma-separated)");

  let text = await extractText(files[0].buffer);
  for (const term of terms) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    text = text.replace(re, "[REDACTED]");
  }
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const lines = wrapText(text, 95);
  let page = doc.addPage(PageSizes.Letter);
  let y = page.getHeight() - 48;
  for (const line of lines) {
    if (y < 48) {
      page = doc.addPage(PageSizes.Letter);
      y = page.getHeight() - 48;
    }
    page.drawText(line.slice(0, 120), { x: 40, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 12;
  }
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "redacted.pdf",
    contentType: "application/pdf",
  };
}

async function ocrPdf(files) {
  const file = files[0];
  if (hasTesseract() && hasPdftoppm()) {
    return withTempDir(async (dir) => {
      const input = path.join(dir, "input.pdf");
      fs.writeFileSync(input, file.buffer);
      const prefix = path.join(dir, "page");
      await run("pdftoppm", ["-png", "-r", "200", input, prefix]);
      const images = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("page") && f.endsWith(".png"))
        .sort();
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const imgName of images) {
        const imgPath = path.join(dir, imgName);
        const txtBase = path.join(dir, imgName.replace(/\.png$/, ""));
        await run("tesseract", [imgPath, txtBase, "-l", "eng"]);
        const ocrText = fs.readFileSync(`${txtBase}.txt`, "utf8");
        const embedded = await doc.embedPng(fs.readFileSync(imgPath));
        const page = doc.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        page.drawText(ocrText.slice(0, 200).replace(/\s+/g, " "), {
          x: 8,
          y: 8,
          size: 4,
          font,
          color: rgb(1, 1, 1),
          opacity: 0.01,
        });
      }
      return {
        buffer: Buffer.from(await doc.save()),
        filename: "ocr.pdf",
        contentType: "application/pdf",
      };
    });
  }

  const text = await extractText(file.buffer);
  if (!text.trim()) {
    throw new Error("OCR requires Tesseract for scanned PDFs, or a text-based PDF.");
  }
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = wrapText(text, 95);
  let page = doc.addPage(PageSizes.Letter);
  let y = page.getHeight() - 48;
  for (const line of lines) {
    if (y < 48) {
      page = doc.addPage(PageSizes.Letter);
      y = page.getHeight() - 48;
    }
    page.drawText(line.slice(0, 120), { x: 40, y, size: 11, font });
    y -= 13;
  }
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "ocr.pdf",
    contentType: "application/pdf",
  };
}

async function editPdfPlaceholder(files, options = {}) {
  const text = options.text || "Edited with iLovePDF clone";
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const first = doc.getPage(0);
  first.drawText(text, {
    x: 48,
    y: first.getHeight() - 48,
    size: 18,
    font,
    color: rgb(0.9, 0.2, 0.18),
  });
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "edited.pdf",
    contentType: "application/pdf",
  };
}

async function signPdf(files, options = {}) {
  const name = options.name || "Signed";
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  const font = await doc.embedFont(StandardFonts.HelveticaOblique);
  const last = doc.getPage(doc.getPageCount() - 1);
  last.drawText(`Signed by ${name}`, {
    x: 48,
    y: 48,
    size: 16,
    font,
    color: rgb(0.1, 0.2, 0.6),
  });
  last.drawText(new Date().toISOString().slice(0, 10), {
    x: 48,
    y: 28,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  return {
    buffer: Buffer.from(await doc.save()),
    filename: "signed.pdf",
    contentType: "application/pdf",
  };
}

async function pdfFormsPassthrough(files) {
  const file = files[0];
  const src = await loadPdf(file.buffer);
  const bytes = await src.save({ updateFieldAppearances: true });
  return {
    buffer: Buffer.from(bytes),
    filename: "form.pdf",
    contentType: "application/pdf",
  };
}

const TOOL_HANDLERS = {
  "/merge_pdf": (files) => mergePdfs(files),
  "/split_pdf": (files, opts) => splitPdf(files, opts),
  "/compress_pdf": (files) => compressPdf(files),
  "/rotate_pdf": (files, opts) => rotatePdf(files, opts),
  "/organize-pdf": (files, opts) => organizePdf(files, opts),
  "/add_pdf_page_number": (files, opts) => addPageNumbers(files, opts),
  "/pdf_add_watermark": (files, opts) => addWatermark(files, opts),
  "/protect-pdf": (files, opts) => protectPdf(files, opts),
  "/unlock_pdf": (files, opts) => unlockPdf(files, opts),
  "/jpg_to_pdf": (files) => imagesToPdf(files),
  "/scan-pdf": (files) => imagesToPdf(files),
  "/pdf_to_jpg": (files) => pdfToJpg(files),
  "/crop-pdf": (files, opts) => cropPdf(files, opts),
  "/convert-pdf-to-pdfa": (files) => pdfToPdfA(files),
  "/repair-pdf": (files) => repairPdf(files),
  "/html-to-pdf": (_files, opts) => htmlToPdf(opts),
  "/word_to_pdf": (files) => officeToPdf(files),
  "/powerpoint_to_pdf": (files) => officeToPdf(files),
  "/excel_to_pdf": (files) => officeToPdf(files),
  "/pdf_to_word": (files) => pdfToWord(files),
  "/pdf_to_powerpoint": (files) => pdfToPowerpoint(files),
  "/pdf_to_excel": (files) => pdfToExcel(files),
  "/pdf-to-markdown": (files) => pdfToMarkdown(files),
  "/pdf-summarize": (files) => summarizePdf(files),
  "/translate-pdf": (files, opts) => translatePdf(files, opts),
  "/compare-pdf": (files) => comparePdf(files),
  "/redact-pdf": (files, opts) => redactPdf(files, opts),
  "/ocr-pdf": (files) => ocrPdf(files),
  "/edit-pdf": (files, opts) => editPdfPlaceholder(files, opts),
  "/sign-pdf": (files, opts) => signPdf(files, opts),
  "/pdf-forms": (files) => pdfFormsPassthrough(files),
};

async function processTool(toolPath, files, options = {}) {
  const handler = TOOL_HANDLERS[toolPath];
  if (!handler) {
    const err = new Error(`Unsupported tool: ${toolPath}`);
    err.status = 400;
    throw err;
  }
  if (toolPath !== "/html-to-pdf" && (!files || !files.length)) {
    const err = new Error("Please upload at least one file");
    err.status = 400;
    throw err;
  }
  return handler(files, options);
}

module.exports = {
  processTool,
  TOOL_HANDLERS,
};
