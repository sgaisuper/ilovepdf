const { get, del, issueSignedToken, put } = require("@vercel/blob");
const {
  handleUpload,
  handleUploadPresigned,
} = require("@vercel/blob/client");

const MAX_BLOB_BYTES = 80 * 1024 * 1024;

function blobConfigured() {
  return !!(
    process.env.BLOB_STORE_ID ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_WEBHOOK_PUBLIC_KEY
  );
}

function usePresignedUploads() {
  return !!(
    process.env.BLOB_WEBHOOK_PUBLIC_KEY &&
    (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function streamToBuffer(stream) {
  const reader = stream.getReader ? stream.getReader() : null;
  if (reader) {
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts);
  }
  const parts = [];
  for await (const chunk of stream) {
    parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}

async function fetchBlobToFile(url, filename) {
  // Prefer authenticated get for private blobs; fall back to public fetch.
  try {
    const result = await get(url, { access: "private", useCache: false });
    if (result && result.stream) {
      const buffer = await streamToBuffer(result.stream);
      return {
        filename: filename || "upload.bin",
        mimeType: (result.blob && result.blob.contentType) || "application/octet-stream",
        buffer,
      };
    }
  } catch (_) {
    // try public
  }

  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Could not fetch uploaded file (${res.status})`);
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    filename: filename || "upload.bin",
    mimeType: res.headers.get("content-type") || "application/octet-stream",
    buffer,
  };
}

async function handleBlobClientUpload(req, res) {
  if (!blobConfigured()) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Blob storage is not configured" }));
    return;
  }

  const body = await readJsonBody(req);
  const allowedContentTypes = [
    "application/pdf",
    "application/octet-stream",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "text/html",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
  ];

  try {
    let jsonResponse;

    if (usePresignedUploads()) {
      jsonResponse = await handleUploadPresigned({
        body,
        request: req,
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
        getSignedToken: async (pathname) => {
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes,
            maximumSizeInBytes: MAX_BLOB_BYTES,
            validUntil: Date.now() + 60 * 60 * 1000,
          });
          return {
            token,
            urlOptions: {
              addRandomSuffix: true,
              allowedContentTypes,
              maximumSizeInBytes: MAX_BLOB_BYTES,
            },
          };
        },
        onUploadCompleted: async ({ blob }) => {
          console.log("[blob] upload completed", blob && blob.url);
        },
      });
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      jsonResponse = await handleUpload({
        body,
        request: req,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes,
          maximumSizeInBytes: MAX_BLOB_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
        }),
        onUploadCompleted: async ({ blob }) => {
          console.log("[blob] upload completed", blob && blob.url);
        },
      });
    } else {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            "Blob client uploads require BLOB_WEBHOOK_PUBLIC_KEY (+ BLOB_STORE_ID) or BLOB_READ_WRITE_TOKEN",
        })
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(jsonResponse));
  } catch (err) {
    console.error("[blob-upload]", err);
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message || "Upload token failed" }));
  }
}

async function putBufferToBlob(pathname, buffer, contentType) {
  return put(pathname, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: contentType || "application/octet-stream",
  });
}

module.exports = {
  MAX_BLOB_BYTES,
  blobConfigured,
  usePresignedUploads,
  handleBlobClientUpload,
  fetchBlobToFile,
  putBufferToBlob,
  delBlob: del,
  readJsonBody,
};
