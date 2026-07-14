const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const VENDOR_QPDF_BIN = path.join(ROOT, "vendor", "qpdf", "bin", "qpdf");
const VENDOR_QPDF_LIB = path.join(ROOT, "vendor", "qpdf", "lib");

const cache = new Map();

function hasBinary(cmd) {
  if (cache.has(cmd)) return cache.get(cmd);
  const result = spawnSync("sh", ["-c", `command -v ${cmd}`], {
    encoding: "utf8",
  });
  const ok = result.status === 0 && Boolean(result.stdout.trim());
  cache.set(cmd, ok);
  return ok;
}

function qpdfCommand() {
  if (hasBinary("qpdf")) {
    return { cmd: "qpdf", env: process.env };
  }
  if (fs.existsSync(VENDOR_QPDF_BIN)) {
    return {
      cmd: VENDOR_QPDF_BIN,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [VENDOR_QPDF_LIB, process.env.LD_LIBRARY_PATH]
          .filter(Boolean)
          .join(":"),
      },
    };
  }
  return null;
}

function hasGs() {
  return hasBinary("gs");
}

function hasPdftoppm() {
  return hasBinary("pdftoppm");
}

function hasPdftotext() {
  return hasBinary("pdftotext");
}

function hasSoffice() {
  return hasBinary("soffice") || hasBinary("libreoffice");
}

function hasTesseract() {
  return hasBinary("tesseract");
}

function sofficeCmd() {
  if (hasBinary("soffice")) return "soffice";
  if (hasBinary("libreoffice")) return "libreoffice";
  return null;
}

module.exports = {
  hasBinary,
  qpdfCommand,
  hasGs,
  hasPdftoppm,
  hasPdftotext,
  hasSoffice,
  hasTesseract,
  sofficeCmd,
  VENDOR_QPDF_BIN,
  VENDOR_QPDF_LIB,
};
