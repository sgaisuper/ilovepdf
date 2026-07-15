const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const MAX_STORE_BYTES = 40 * 1024 * 1024;
const ROOT = path.join(os.tmpdir(), "ilovepdf-file-links");

/** @type {Map<string, object>} */
const memory = new Map();

function ensureRoot() {
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
}

function newId() {
  return crypto.randomBytes(12).toString("base64url");
}

function metaPath(id) {
  return path.join(ROOT, id + ".json");
}

function binPath(id) {
  return path.join(ROOT, id + ".bin");
}

function isUnavailable(meta) {
  return !meta || meta.revoked;
}

function readMeta(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const raw = fs.readFileSync(metaPath(id), "utf8");
    const meta = JSON.parse(raw);
    memory.set(id, meta);
    return meta;
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  ensureRoot();
  memory.set(meta.id, meta);
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta));
}

function createFileLink({ buffer, filename, contentType, tool }) {
  if (!buffer || !buffer.length) {
    const err = new Error("Empty file");
    err.status = 400;
    throw err;
  }
  if (buffer.length > MAX_STORE_BYTES) {
    const err = new Error("File too large to create a share link");
    err.status = 413;
    throw err;
  }

  ensureRoot();
  const id = newId();
  const now = Date.now();
  const meta = {
    id,
    filename: filename || "download.bin",
    contentType: contentType || "application/octet-stream",
    tool: tool || "",
    size: buffer.length,
    createdAt: now,
    revoked: false,
    downloads: 0,
    lastDownloadAt: null,
    events: [{ type: "created", at: now }],
  };

  fs.writeFileSync(binPath(id), buffer);
  writeMeta(meta);
  return meta;
}

function getFileLink(id) {
  const meta = readMeta(id);
  if (!meta) return null;
  if (isUnavailable(meta)) return { ...meta, expired: true };
  return { ...meta, expired: false };
}

function recordDownload(id, info = {}) {
  const meta = readMeta(id);
  if (!meta || isUnavailable(meta)) return null;
  const now = Date.now();
  meta.downloads += 1;
  meta.lastDownloadAt = now;
  meta.events = (meta.events || []).slice(-49);
  meta.events.push({
    type: "download",
    at: now,
    ip: info.ip || null,
    ua: info.ua || null,
  });
  writeMeta(meta);
  return meta;
}

function readFileBuffer(id) {
  const meta = getFileLink(id);
  if (!meta || meta.expired) return null;
  try {
    return fs.readFileSync(binPath(id));
  } catch {
    return null;
  }
}

function revokeFileLink(id) {
  const meta = readMeta(id);
  if (!meta) return null;
  meta.revoked = true;
  meta.events = meta.events || [];
  meta.events.push({ type: "revoked", at: Date.now() });
  writeMeta(meta);
  try {
    fs.unlinkSync(binPath(id));
  } catch (_) {}
  return meta;
}

function publicMeta(meta) {
  if (!meta) return null;
  return {
    id: meta.id,
    filename: meta.filename,
    contentType: meta.contentType,
    tool: meta.tool,
    size: meta.size,
    createdAt: meta.createdAt,
    revoked: !!meta.revoked,
    expired: isUnavailable(meta),
    downloads: meta.downloads || 0,
    lastDownloadAt: meta.lastDownloadAt,
    events: (meta.events || []).map((e) => ({
      type: e.type,
      at: e.at,
    })),
  };
}

module.exports = {
  createFileLink,
  getFileLink,
  recordDownload,
  readFileBuffer,
  revokeFileLink,
  publicMeta,
};
