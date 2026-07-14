(function (global) {
  "use strict";

  var CLIENT_TOOLS = {
    "/merge_pdf": true,
    "/split_pdf": true,
    "/rotate_pdf": true,
    "/organize-pdf": true,
    "/add_pdf_page_number": true,
    "/pdf_add_watermark": true,
    "/crop-pdf": true,
    "/edit-pdf": true,
    "/sign-pdf": true,
    "/jpg_to_pdf": true,
    "/scan-pdf": true,
    "/pdf-forms": true,
    "/repair-pdf": true,
    "/convert-pdf-to-pdfa": true,
  };

  function canProcessClient(toolPath) {
    return !!CLIENT_TOOLS[toolPath];
  }

  function bytesOf(file) {
    return file.arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  function downloadResult(bytes, filename, mime) {
    return {
      blob: new Blob([bytes], { type: mime || "application/pdf" }),
      filename: filename,
      contentType: mime || "application/pdf",
    };
  }

  async function merge(files) {
    var PDFDocument = PDFLib.PDFDocument;
    var out = await PDFDocument.create();
    for (var i = 0; i < files.length; i++) {
      var src = await PDFDocument.load(await bytesOf(files[i]), {
        ignoreEncryption: true,
      });
      var pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(function (p) {
        out.addPage(p);
      });
    }
    return downloadResult(await out.save(), "merged.pdf");
  }

  function parseRanges(text, pageCount) {
    var parts = String(text)
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    var ranges = [];
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      if (part.indexOf("-") >= 0) {
        var ab = part.split("-");
        var a = parseInt(ab[0], 10);
        var b = parseInt(ab[1], 10);
        if (!a || !b || a < 1 || b > pageCount || a > b) {
          throw new Error("Invalid range: " + part);
        }
        var idx = [];
        for (var i = a; i <= b; i++) idx.push(i - 1);
        ranges.push(idx);
      } else {
        var n = parseInt(part, 10);
        if (!n || n < 1 || n > pageCount) throw new Error("Invalid page: " + part);
        ranges.push([n - 1]);
      }
    }
    if (!ranges.length) throw new Error("No pages selected");
    return ranges;
  }

  async function split(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var zip = new JSZip();
    var mode = (options && options.mode) || "pages";

    if (mode === "range" && options.ranges) {
      var ranges = parseRanges(options.ranges, src.getPageCount());
      for (var r = 0; r < ranges.length; r++) {
        var doc = await PDFDocument.create();
        var pages = await doc.copyPages(src, ranges[r]);
        pages.forEach(function (p) {
          doc.addPage(p);
        });
        zip.file("split-" + (r + 1) + ".pdf", await doc.save());
      }
    } else {
      for (var i = 0; i < src.getPageCount(); i++) {
        var one = await PDFDocument.create();
        var page = await one.copyPages(src, [i]);
        one.addPage(page[0]);
        zip.file("page-" + (i + 1) + ".pdf", await one.save());
      }
    }

    var zipped = await zip.generateAsync({ type: "uint8array" });
    return downloadResult(zipped, "split-pdfs.zip", "application/zip");
  }

  async function rotate(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var degrees = PDFLib.degrees;
    var angle = Number((options && options.angle) || 90);
    var out = await PDFDocument.create();
    for (var i = 0; i < files.length; i++) {
      var src = await PDFDocument.load(await bytesOf(files[i]), {
        ignoreEncryption: true,
      });
      var pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(function (p) {
        p.setRotation(degrees((p.getRotation().angle + angle) % 360));
        out.addPage(p);
      });
    }
    return downloadResult(await out.save(), "rotated.pdf");
  }

  async function organize(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var order = options && options.order
      ? String(options.order)
          .split(",")
          .map(function (n) {
            return parseInt(n, 10) - 1;
          })
      : src.getPageIndices();
    var valid = order.filter(function (i) {
      return i >= 0 && i < src.getPageCount();
    });
    if (!valid.length) throw new Error("No valid page order");
    var doc = await PDFDocument.create();
    var pages = await doc.copyPages(src, valid);
    pages.forEach(function (p) {
      doc.addPage(p);
    });
    return downloadResult(await doc.save(), "organized.pdf");
  }

  async function pageNumbers(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;
    var position = (options && options.position) || "bottom-center";
    var start = Number((options && options.start) || 1);
    var out = await PDFDocument.create();
    var font = await out.embedFont(StandardFonts.Helvetica);
    for (var f = 0; f < files.length; f++) {
      var src = await PDFDocument.load(await bytesOf(files[f]), {
        ignoreEncryption: true,
      });
      var pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(function (page, idx) {
        out.addPage(page);
        var size = page.getSize();
        var text = String(start + idx);
        var textWidth = font.widthOfTextAtSize(text, 12);
        var x = (size.width - textWidth) / 2;
        var y = 24;
        if (position === "bottom-left") x = 24;
        if (position === "bottom-right") x = size.width - textWidth - 24;
        if (position === "top-center") y = size.height - 36;
        if (position === "top-left") {
          x = 24;
          y = size.height - 36;
        }
        if (position === "top-right") {
          x = size.width - textWidth - 24;
          y = size.height - 36;
        }
        page.drawText(text, {
          x: x,
          y: y,
          size: 12,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
      });
    }
    return downloadResult(await out.save(), "numbered.pdf");
  }

  async function watermark(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;
    var degrees = PDFLib.degrees;
    var text = (options && options.text) || "CONFIDENTIAL";
    var opacity = Math.min(
      1,
      Math.max(0.05, Number((options && options.opacity) || 0.25))
    );
    var out = await PDFDocument.create();
    var font = await out.embedFont(StandardFonts.HelveticaBold);
    for (var f = 0; f < files.length; f++) {
      var src = await PDFDocument.load(await bytesOf(files[f]), {
        ignoreEncryption: true,
      });
      var pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(function (page) {
        out.addPage(page);
        var size = page.getSize();
        var fontSize = Math.min(size.width, size.height) / 8;
        var textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: (size.width - textWidth) / 2,
          y: size.height / 2,
          size: fontSize,
          font: font,
          color: rgb(0.7, 0.7, 0.7),
          opacity: opacity,
          rotate: degrees(45),
        });
      });
    }
    return downloadResult(await out.save(), "watermarked.pdf");
  }

  async function crop(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var margin = Number((options && options.margin) || 36);
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var doc = await PDFDocument.create();
    var indices = src.getPageIndices();
    for (var i = 0; i < indices.length; i++) {
      var pageArr = await doc.copyPages(src, [indices[i]]);
      var page = pageArr[0];
      var size = page.getSize();
      var m = Math.min(margin, size.width / 4, size.height / 4);
      page.setCropBox(m, m, size.width - 2 * m, size.height - 2 * m);
      doc.addPage(page);
    }
    return downloadResult(await doc.save(), "cropped.pdf");
  }

  async function edit(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;
    var text = (options && options.text) || "Edited with iLovePDF";
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var doc = await PDFDocument.create();
    var pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) {
      doc.addPage(p);
    });
    var font = await doc.embedFont(StandardFonts.HelveticaBold);
    var first = doc.getPage(0);
    first.drawText(text, {
      x: 48,
      y: first.getHeight() - 48,
      size: 18,
      font: font,
      color: rgb(0.9, 0.2, 0.18),
    });
    return downloadResult(await doc.save(), "edited.pdf");
  }

  async function sign(files, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;
    var name = (options && options.name) || "Signed";
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var doc = await PDFDocument.create();
    var pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) {
      doc.addPage(p);
    });
    var font = await doc.embedFont(StandardFonts.HelveticaOblique);
    var last = doc.getPage(doc.getPageCount() - 1);
    last.drawText("Signed by " + name, {
      x: 48,
      y: 48,
      size: 16,
      font: font,
      color: rgb(0.1, 0.2, 0.6),
    });
    last.drawText(new Date().toISOString().slice(0, 10), {
      x: 48,
      y: 28,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    return downloadResult(await doc.save(), "signed.pdf");
  }

  async function imagesToPdf(files) {
    var PDFDocument = PDFLib.PDFDocument;
    var doc = await PDFDocument.create();
    for (var i = 0; i < files.length; i++) {
      var bytes = await bytesOf(files[i]);
      var name = (files[i].name || "").toLowerCase();
      var img;
      if (name.endsWith(".png")) {
        img = await doc.embedPng(bytes);
      } else {
        // jpeg / others: try jpg; convert via canvas if needed
        try {
          img = await doc.embedJpg(bytes);
        } catch (e) {
          img = await embedViaCanvas(doc, files[i]);
        }
      }
      var page = doc.addPage([img.width, img.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      });
    }
    return downloadResult(await doc.save(), "images.pdf");
  }

  async function embedViaCanvas(doc, file) {
    var bitmap = await createImageBitmap(file);
    var canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    var bytes = new Uint8Array(await blob.arrayBuffer());
    return doc.embedJpg(bytes);
  }

  async function passthrough(files, filename) {
    var PDFDocument = PDFLib.PDFDocument;
    var src = await PDFDocument.load(await bytesOf(files[0]), {
      ignoreEncryption: true,
    });
    var doc = await PDFDocument.create();
    var pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) {
      doc.addPage(p);
    });
    return downloadResult(await doc.save(), filename || "document.pdf");
  }

  async function process(toolPath, files, options) {
    if (typeof PDFLib === "undefined") {
      throw new Error("PDF engine failed to load");
    }
    switch (toolPath) {
      case "/merge_pdf":
        if (files.length < 2) throw new Error("Please select at least 2 PDF files to merge");
        return merge(files);
      case "/split_pdf":
        return split(files, options);
      case "/rotate_pdf":
        return rotate(files, options);
      case "/organize-pdf":
        return organize(files, options);
      case "/add_pdf_page_number":
        return pageNumbers(files, options);
      case "/pdf_add_watermark":
        return watermark(files, options);
      case "/crop-pdf":
        return crop(files, options);
      case "/edit-pdf":
        return edit(files, options);
      case "/sign-pdf":
        return sign(files, options);
      case "/jpg_to_pdf":
      case "/scan-pdf":
        return imagesToPdf(files);
      case "/pdf-forms":
        return passthrough(files, "form.pdf");
      case "/repair-pdf":
      case "/convert-pdf-to-pdfa":
        return passthrough(files, toolPath === "/repair-pdf" ? "repaired.pdf" : "document-pdfa.pdf");
      default:
        throw new Error("Client processing not available for this tool");
    }
  }

  function blobToFile(blob, name) {
    return new File([blob], name || "document.pdf", {
      type: blob.type || "application/pdf",
    });
  }

  async function processViaServer(toolPath, files, options) {
    var form = new FormData();
    form.append("tool", toolPath);
    Object.keys(options || {}).forEach(function (key) {
      form.append(key, options[key]);
    });
    files.forEach(function (f) {
      form.append("files", f, f.name);
    });
    var res = await fetch("/api/process", { method: "POST", body: form });
    if (!res.ok) {
      var errJson = null;
      try {
        errJson = await res.json();
      } catch (e) {}
      if (res.status === 413) {
        throw new Error(
          "A workflow step upload was too large for the server. Use browser-only steps for large files."
        );
      }
      throw new Error((errJson && errJson.error) || "Step failed (" + res.status + ")");
    }
    var disposition = res.headers.get("Content-Disposition") || "";
    var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
    var filename = decodeURIComponent((match && (match[1] || match[2])) || "download.bin");
    var blob = await res.blob();
    return { blob: blob, filename: filename, contentType: blob.type };
  }

  async function runWorkflow(steps, files, onProgress) {
    if (!steps || !steps.length) throw new Error("Add at least one step to the workflow");
    if (!files || !files.length) throw new Error("Please select files to process");

    var currentFiles = files.slice();
    var lastResult = null;

    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (onProgress) {
        onProgress({
          index: i,
          total: steps.length,
          path: step.path,
          name: step.name || step.path,
        });
      }

      var result;
      if (canProcessClient(step.path)) {
        result = await process(step.path, currentFiles, step.options || {});
      } else {
        // Server step — may 413 on large files
        result = await processViaServer(step.path, currentFiles, step.options || {});
      }

      lastResult = result;

      // Feed next step: if zip, stop chaining (terminal step)
      if ((result.contentType || "").indexOf("zip") >= 0 || /\.zip$/i.test(result.filename)) {
        if (i < steps.length - 1) {
          throw new Error(
            "Step \"" +
              (step.name || step.path) +
              "\" produced a ZIP. Put it last in the workflow."
          );
        }
        break;
      }

      currentFiles = [blobToFile(result.blob, result.filename)];
    }

    return lastResult;
  }

  global.ClientPDF = {
    canProcessClient: canProcessClient,
    process: process,
    runWorkflow: runWorkflow,
    processViaServer: processViaServer,
  };
})(window);
