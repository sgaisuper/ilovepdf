const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const Busboy = require("busboy");
const { processTool } = require("./lib/pdf-processor");
const {
  optionsForTool,
  processLabel,
  processStatus,
} = require("./lib/tool-options");

const ROOT = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB per file
const MAX_FILES = 40;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
};

const tools = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "tools.json"), "utf8")
);
const toolsByPath = Object.fromEntries(tools.map((t) => [t.path, t]));

const stubs = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "stubs.json"), "utf8")
);
// Workflows has a real page now
delete stubs["/user/workflows"];

const header = fs.readFileSync(
  path.join(ROOT, "partials", "header.html"),
  "utf8"
);
const footer = fs.readFileSync(
  path.join(ROOT, "partials", "footer-simple.html"),
  "utf8"
);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderToolPage(tool) {
  const isHtml = tool.path === "/html-to-pdf";
  const btnLabel = processLabel(tool);
  const statusLabel = processStatus(tool);
  const toolClass = "tool-" + String(tool.path).replace(/^\//, "").replace(/_/g, "");
  const uploaderInner = isHtml
    ? `
      <form class="url-form" id="urlForm">
        <input id="urlInput" type="url" placeholder="https://example.com" required />
        <button class="btn" type="submit">${escapeHtml(tool.btn)}</button>
      </form>
      <div class="uploader__droptxt">${escapeHtml(tool.drop)}</div>`
    : `
      <a class="uploader__btn tooltip--left" id="pickfiles" href="javascript:;" title="Add more files">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke-linecap="round" stroke-width="2" stroke="#fff" fill="none" stroke-linejoin="round"><path d="M10 1.833v16.333"/><path d="M1.833 10h16.333"/></svg>
        <span>${escapeHtml(tool.btn)}</span>
      </a>
      <div class="uploader__extra">
        <a class="btn-icon uploader__extra__btn tooltip tooltip--right active" id="uploadDisk" href="javascript:;" title="Upload from your computer">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="19" viewBox="0 0 20 19" fill="#fff" fill-rule="nonzero"><path d="M4.8 19c-.442 0-.8-.448-.8-1s.358-1 .8-1h10.4c.442 0 .8.448.8 1s-.358 1-.8 1H4.8z"/><path d="M7 15h6l-1 3H8z"/><path d="M2 2v11h16V2H2zM1 0h18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1z"/></svg>
        </a>
        <a class="btn-icon uploader__extra__btn tooltip tooltip--right active" title="Select from Google Drive" href="javascript:;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="16" viewBox="0 0 18 16"><path fill="#FFF" d="M8.7375,5.80725 L3.021,15.70725 L0.12375,10.69725 L5.847,0.795 L8.7375,5.80725 Z M17.865,10.38225 L12.078,10.39125 L6.378,0.489 L12.1725,0.489 L17.865,10.38225 Z M17.87625,10.9875 L14.9865,15.9975 L3.5415,15.99 L6.43425,10.98375 L17.87625,10.9875 Z"/></svg>
        </a>
        <a class="btn-icon uploader__extra__btn tooltip tooltip--right active" title="Select from Dropbox" href="javascript:;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path fill="#FFF" d="M5.3475,0.7035 L0.096,4.125 L3.708,7.03725 L9.018,3.765 L5.3475,0.7035 Z M17.904,4.14 L12.66525,0.7275 L9.01875,3.7725 L14.29875,7.03875 L17.904,4.14 Z M9.01875,10.305 L12.66525,13.35975 L17.904,9.945 L14.2995,7.0395 L9.01875,10.305 Z M0.096,9.9585 L5.3475,13.35975 L9.01875,10.305 L3.70875,7.0455 L0.096,9.9585 Z M9.01875,10.9635 L5.35575,14.0385 L3.786,13.02 L3.786,14.16 L9.01875,17.30475 L14.271,14.15175 L14.271,13.0125 L12.693,14.031 L9.01875,10.9635 Z"/></svg>
        </a>
      </div>
      <div class="uploader__droptxt">${escapeHtml(tool.drop)}</div>
      <input type="file" id="fileInput" class="hidden" multiple accept="${escapeHtml(tool.accept)}" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(tool.page_title)} - iLovePDF</title>
  <meta name="description" content="${escapeHtml(tool.desc)}"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link rel="icon" type="image/png" href="/img/favicons-pdf/favicon-32x32.png">
  <link rel="preload" href="/font/Graphik-Bold.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/font/Graphik-Semibold.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/font/Graphik-Medium.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/font/Graphik-Regular.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link href="/dist/css/app.css" rel="stylesheet">
  <link href="/css/clone-overrides.css" rel="stylesheet">
  <style>
    .header .ico, .nav-dropdown .ico, .menu .ico { display: block; }
  </style>
</head>
<body class="lang-en-US tool-page ${escapeHtml(toolClass)}" data-tool="${escapeHtml(tool.path)}" data-process-label="${escapeHtml(btnLabel)}" data-process-status="${escapeHtml(statusLabel)}">
${header}
<div class="main">
  <div class="tool tool--small">
    <div class="tool__workarea" id="workArea">
      <div id="dropArea"></div>
      <div class="tool__header">
        <h1 class="tool__header__title">${escapeHtml(tool.page_title)}</h1>
        <h2 class="tool__header__subtitle">${escapeHtml(tool.desc)}</h2>
      </div>
      <div class="uploading__bar uploading__bar--small" id="topUploadBar">
        <span class="uploading__bar__completed" id="topUploadBarFill"></span>
      </div>
      <div id="uploader" class="uploader">
        ${uploaderInner}
      </div>
      <div class="tool__workarea__rendered" id="fileGroups"></div>
    </div>
    <div id="sidebar" class="tool__sidebar">
      ${optionsForTool(tool)}
    </div>
    <div id="processTaskWrapper"></div>
    <button type="button" id="processTask" class="btn btn--process btn--red ${escapeHtml(toolClass)}" style="display:none" disabled>
      <span id="processTaskTextBtn">${escapeHtml(btnLabel)}</span>
      <span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="24" height="24" fill="#FFF" fill-rule="evenodd"><path d="M13 26C5.82 26 0 20.18 0 13S5.82 0 13 0s13 5.82 13 13-5.82 13-13 13zm0-2c6.075 0 11-4.925 11-11S19.075 2 13 2 2 6.925 2 13s4.925 11 11 11z" fill-rule="nonzero"/><path d="M18.684 13.105a.55.55 0 0 1-.148.378l-5.263 5.263a.55.55 0 0 1-.378.148.54.54 0 0 1-.526-.526V15.21H7.842a.54.54 0 0 1-.526-.526v-3.158A.54.54 0 0 1 7.842 11h4.526V7.842a.52.52 0 0 1 .526-.526c.148 0 .28.066.395.164l5.247 5.247a.55.55 0 0 1 .148.378z"/></svg>
      </span>
    </button>
  </div>
</div>
<div id="uploading" class="uploading">
  <div id="upload-status" class="uploading__status">
    <div class="uploading__status__title user">Uploading file <span class="uploading__status__current" id="uploadCurrent">0</span> of <span class="uploading__status__total" id="uploadTotal">0</span></div>
    <div class="uploading__status__file" id="uploadFileName"></div>
    <div class="uploading__status__info">
      Time left <span id="timeLeft">- seconds</span> -
      Upload speed <span id="uploadSpeed">- MB/S</span>
    </div>
    <div class="uploading__bar">
      <span class="uploading__bar__completed" id="uploadBarFill"></span>
    </div>
    <div class="uploading__status__percent">
      <div class="uploading__status__percent__value" id="uploadPercent">0%</div>
      Uploaded
    </div>
  </div>
</div>
<div id="process" class="process">
  <p id="processText" class="processAction title2">${escapeHtml(statusLabel)}</p>
  <img src="/img/svg_icons/preload.svg" alt="Processing">
  <div id="waitnotify"></div>
</div>
<div id="download" class="download" hidden>
  <h2 class="download__title title2" id="downloadTitle">Ready! Your file has been processed.</h2>
  <div class="download__actions process-actions">
    <a class="btn btn--red" id="downloadLink" href="#">Download</a>
    <button type="button" class="btn btn--secondary" id="downloadStartOver">Process more</button>
  </div>
</div>
${footer}
<script src="/js/vendor/pdf-lib.min.js"></script>
<script src="/js/vendor/jszip.min.js"></script>
<script src="/js/client-pdf.js"></script>
<script src="/js/main.js"></script>
<script src="/js/tool.js"></script>
</body>
</html>`;
}

function renderStubPage(title, subtitle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - iLovePDF</title>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link rel="icon" type="image/png" href="/img/favicons-pdf/favicon-32x32.png">
  <link href="/dist/css/web.css" rel="stylesheet">
  <link href="/css/clone-overrides.css" rel="stylesheet">
  <style>
    .header .ico, .nav-dropdown .ico, .menu .ico { display: block; }
    .stub { max-width: 720px; margin: 80px auto; padding: 48px 24px; text-align: center; }
    .stub h1 { font-size: 36px; line-height: 44px; font-weight: 600; color: #33333b; margin-bottom: 12px; }
    .stub p { font-size: 18px; line-height: 28px; color: #707078; margin-bottom: 32px; }
    .stub .btn { margin-top: 0 !important; display: inline-flex; }
  </style>
</head>
<body class="lang-en-US">
${header}
<div class="main">
  <div class="stub">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <a class="btn" href="/">Explore PDF tools</a>
  </div>
</div>
${footer}
<script src="/js/main.js"></script>
</body>
</html>`;
}

function renderWorkflowPage({ view, id }) {
  const titles = {
    list: "Workflows",
    builder: id ? "Edit workflow" : "Create a workflow",
    run: "Run workflow",
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(titles[view] || "Workflows")} - iLovePDF</title>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link rel="icon" type="image/png" href="/img/favicons-pdf/favicon-32x32.png">
  <link rel="preload" href="/font/Graphik-Regular.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link href="/dist/css/app.css" rel="stylesheet">
  <link href="/css/clone-overrides.css" rel="stylesheet">
  <style>.header .ico, .nav-dropdown .ico, .menu .ico { display: block; }</style>
</head>
<body class="lang-en-US tool-page" data-workflow-view="${escapeHtml(view)}" data-workflow-id="${escapeHtml(id || "")}">
${header}
<div class="main">
  <div class="wf-page">
    <div id="workflowApp"></div>
  </div>
</div>
${footer}
<script src="/js/vendor/pdf-lib.min.js"></script>
<script src="/js/vendor/jszip.min.js"></script>
<script src="/js/client-pdf.js"></script>
<script src="/js/workflows-store.js"></script>
<script src="/js/workflows-page.js"></script>
<script src="/js/main.js"></script>
</body>
</html>`;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    });
    const fields = {};
    const files = [];
    let settled = false;

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("file", (name, file, info) => {
      const chunks = [];
      let limited = false;
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => {
        limited = true;
      });
      file.on("end", () => {
        if (limited) return;
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return;
        files.push({
          field: name,
          filename: info.filename || "upload.bin",
          mimeType: info.mimeType,
          buffer,
        });
      });
    });

    busboy.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    busboy.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve({ fields, files });
      }
    });

    req.pipe(busboy);
  });
}

function jsonError(res, status, message) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

async function handleProcess(req, res) {
  try {
    const { fields, files } = await parseMultipart(req);
    const tool = fields.tool;
    if (!tool) {
      jsonError(res, 400, "Missing tool");
      return;
    }

    const result = await processTool(tool, files, fields);
    const encoded = encodeURIComponent(result.filename).replace(/['()]/g, escape);
    res.writeHead(200, {
      "Content-Type": result.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`,
      "Content-Length": result.buffer.length,
      "Cache-Control": "no-store",
    });
    res.end(result.buffer);
  } catch (err) {
    console.error("[process]", err);
    jsonError(res, err.status || 500, err.message || "Processing failed");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  const cleanPath = pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;

  if (cleanPath === "/api/process" && req.method === "POST") {
    handleProcess(req, res);
    return;
  }

  // Workflows
  if (req.method === "GET" && cleanPath === "/user/workflows") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderWorkflowPage({ view: "list" }));
    return;
  }
  if (req.method === "GET" && cleanPath === "/user/workflows/new") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderWorkflowPage({ view: "builder" }));
    return;
  }
  const wfEdit = cleanPath.match(/^\/user\/workflows\/([^/]+)$/);
  if (req.method === "GET" && wfEdit) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderWorkflowPage({ view: "builder", id: decodeURIComponent(wfEdit[1]) }));
    return;
  }
  const wfRun = cleanPath.match(/^\/workflow\/([^/]+)$/);
  if (req.method === "GET" && wfRun) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderWorkflowPage({ view: "run", id: decodeURIComponent(wfRun[1]) }));
    return;
  }

  if (req.method === "GET" && toolsByPath[cleanPath]) {
    const html = renderToolPage(toolsByPath[cleanPath]);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && stubs[cleanPath]) {
    const [title, subtitle] = stubs[cleanPath];
    const html = renderStubPage(title, subtitle);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath);
      return;
    }
    const indexPath = path.join(filePath, "index.html");
    fs.stat(indexPath, (err2, stat2) => {
      if (!err2 && stat2.isFile()) {
        sendFile(res, indexPath);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:48px;text-align:center"><h1>Page not found</h1><p><a href="/">Back to iLovePDF</a></p></body></html>`
      );
    });
  });
});

server.listen(PORT, () => {
  console.log(`iLovePDF clone running at http://localhost:${PORT}`);
});
