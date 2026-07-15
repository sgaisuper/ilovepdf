# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Node.js app (`ilovepdf-clone`) — a static frontend plus a plain
`http`-module server (`server.js`) exposing `POST /api/process` for real PDF processing.
There is no framework, no build step, and no database. See `README.md` for the tool list.

### Run / test / build
- Start the dev server: `node server.js` (or `npm start` / `npm run dev` — all identical, no
  hot reload). Listens on `http://localhost:3000`; override with the `PORT` env var.
- There is no lint script, no automated test suite, and no build step in this repo.
- Smoke-test processing without a browser, e.g. merge two PDFs:
  `curl -s -o out.pdf -F "tool=/merge_pdf" -F "files=@a.pdf" -F "files=@b.pdf" http://localhost:3000/api/process`
  (the `tool` field is the tool's URL path, e.g. `/merge_pdf`; upload field name is `files`).

### Non-obvious caveats
- No hot reload: after editing `server.js` or files in `lib/`, restart `node server.js`.
- Pure-JS tools (merge/split/rotate/organize/crop/page-numbers/watermark/edit/sign, JPG→PDF)
  work with only `npm install` — no system binaries needed. These cover the core flow.
- Some tools shell out to optional system binaries that are NOT installed by the update
  script and NOT required to boot the app: Ghostscript `gs` (compress, PDF/A), `qpdf`
  (protect/unlock/repair), Poppler `poppler-utils` (PDF→JPG, OCR raster, text extraction for
  markdown/summarize/translate/compare/redact), LibreOffice `soffice` (Office↔PDF), and
  Tesseract (`tesseract-ocr`). Install the corresponding apt package only if you need to test
  that specific tool.
- HTML→PDF uses `puppeteer-core`, which does NOT bundle Chrome. It looks for Chrome at the
  path in `CHROME_PATH`, defaulting to the hardcoded puppeteer cache path in
  `lib/pdf-processor.js`. Install a matching build to that default path with
  `npx @puppeteer/browsers install chrome@<version> --path /home/ubuntu/.cache/puppeteer`
  (plus Chrome's shared libs, e.g. `libnss3`), or point `CHROME_PATH` at an existing Chrome.
- Known pre-existing bug (not an environment issue): `/translate-pdf` fails with
  `WinAnsi cannot encode "→"` because `translatePdf` in `lib/pdf-processor.js` draws a literal
  `→` using `StandardFonts.Helvetica`. Every other tool works once the binaries above exist.
