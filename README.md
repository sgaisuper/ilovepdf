# iLovePDF Clone

A working frontend + backend clone of [ilovepdf.com](https://www.ilovepdf.com/) with **real PDF processing**.

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Real processing

Upload files on any tool page and download the result. Processing runs locally via `/api/process`.

| Tool | Engine |
|------|--------|
| Merge / Split / Rotate / Organize / Crop / Page numbers / Watermark / Edit / Sign | `pdf-lib` |
| Compress / PDF/A | Ghostscript |
| Protect / Unlock / Repair | `qpdf` |
| PDF ↔ JPG / Scan to PDF | Poppler + Sharp |
| Word / Excel / PowerPoint → PDF | LibreOffice |
| PDF → Word / Excel / PowerPoint | LibreOffice with text/image fallbacks |
| HTML to PDF | Puppeteer/Chrome |
| OCR | Tesseract (+ Poppler) |
| Markdown / Summarize / Compare / Redact / Translate | Poppler text extraction |

## Notes

- Unofficial demo recreation; not affiliated with iLovePDF.
- Files are processed in temporary directories and are not stored permanently.
- Max ~80MB per file, up to 40 files per request.
- Translate / Summarizer use extractive local methods (no external AI API).
