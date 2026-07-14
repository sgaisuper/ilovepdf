function sidebarPanel(title, contentHtml) {
  return `
    <div class="option__panel option__panel--active" id="tool-options-panel">
      <div class="option__panel__title">${title}</div>
      <div class="option__panel__content" id="toolOptions">
        ${contentHtml}
      </div>
    </div>`;
}

function optionsForTool(tool) {
  const p = tool.path;
  const title = tool.title || tool.page_title || "Options";

  if (p === "/merge_pdf") {
    return sidebarPanel(
      title,
      `
      <div class="info drag">To change the order of your PDFs, drag and drop the files as you want.</div>
      <div class="info multiple">Please, select more PDF files by clicking again on ’Select PDF files’. <br/>Select multiple files by mantaining pressed ’Ctrl’</div>`
    );
  }

  if (p === "/split_pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Split mode
            <select name="mode" id="opt-mode">
              <option value="pages">Extract all pages</option>
              <option value="range">Custom ranges</option>
            </select>
          </label>
        </div>
        <div class="form__group opt-ranges hidden">
          <label>Ranges (e.g. 1-3,5)
            <input name="ranges" id="opt-ranges" type="text" placeholder="1-3,5,8-10" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/rotate_pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Rotation
            <select name="angle" id="opt-angle">
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/organize-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="info drag">Drag files to reorder pages after organizing.</div>
      <div class="formarea">
        <div class="form__group">
          <label>Page order (comma-separated, 1-based)
            <input name="order" id="opt-order" type="text" placeholder="1,3,2,4" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/add_pdf_page_number") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Position
            <select name="position" id="opt-position">
              <option value="bottom-center">Bottom center</option>
              <option value="bottom-left">Bottom left</option>
              <option value="bottom-right">Bottom right</option>
              <option value="top-center">Top center</option>
              <option value="top-left">Top left</option>
              <option value="top-right">Top right</option>
            </select>
          </label>
        </div>
        <div class="form__group">
          <label>Start at
            <input name="start" id="opt-start" type="number" min="1" value="1" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/pdf_add_watermark") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Watermark text
            <input name="text" id="opt-text" type="text" value="CONFIDENTIAL" />
          </label>
        </div>
        <div class="form__group">
          <label>Opacity (0.1–1)
            <input name="opacity" id="opt-opacity" type="number" min="0.1" max="1" step="0.05" value="0.25" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/protect-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Password
            <input name="password" id="opt-password" type="password" required placeholder="Set a password" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/unlock_pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Current password
            <input name="password" id="opt-password" type="password" placeholder="If encrypted" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/crop-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Margin (points)
            <input name="margin" id="opt-margin" type="number" min="0" value="36" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/edit-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Text to add
            <input name="text" id="opt-text" type="text" value="Edited with iLovePDF" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/sign-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Signature name
            <input name="name" id="opt-name" type="text" placeholder="Your name" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/redact-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Words to redact (comma-separated)
            <input name="terms" id="opt-terms" type="text" placeholder="secret, confidential" />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/translate-pdf") {
    return sidebarPanel(
      title,
      `
      <div class="formarea">
        <div class="form__group">
          <label>Target language code
            <input name="lang" id="opt-lang" type="text" value="es" placeholder="es, fr, de..." />
          </label>
        </div>
      </div>`
    );
  }

  if (p === "/compress_pdf") {
    return sidebarPanel(
      title,
      `
      <div class="info">Compression runs on the server for best size reduction. Keep total upload under ~4 MB on this host, or split large jobs.</div>
      <div class="formarea">
        <div class="form__group">
          <label>Compression level
            <select name="level" id="opt-level">
              <option value="recommended">Recommended</option>
              <option value="extreme">Extreme</option>
              <option value="less">Less compression</option>
            </select>
          </label>
        </div>
      </div>`
    );
  }

  return sidebarPanel(
    title,
    `<div class="info">Select your files, then click ${title} to continue.</div>`
  );
}

function processLabel(tool) {
  const map = {
    "/merge_pdf": "Merge PDF",
    "/split_pdf": "Split PDF",
    "/compress_pdf": "Compress PDF",
    "/pdf_to_jpg": "PDF to JPG",
    "/jpg_to_pdf": "JPG to PDF",
    "/rotate_pdf": "Rotate PDF",
    "/organize-pdf": "Organize PDF",
  };
  return map[tool.path] || tool.title || "Process";
}

function processStatus(tool) {
  const map = {
    "/merge_pdf": "Merging PDFs...",
    "/split_pdf": "Splitting PDF...",
    "/compress_pdf": "Compressing PDF...",
    "/rotate_pdf": "Rotating PDF...",
    "/jpg_to_pdf": "Converting to PDF...",
    "/pdf_to_jpg": "Converting to JPG...",
  };
  return map[tool.path] || `Processing ${tool.title || "files"}...`;
}

module.exports = { optionsForTool, processLabel, processStatus };
